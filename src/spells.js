// Заклинания (задача 000045): книга заклинаний, ранги школы, применение
// в бою — по каталогу assets/spells (source of truth, задача 000023).
//
// Чистое ядро без DOM — тестируется в node (tests/spells.test.js).
// Униформный модуль: в браузере — globalThis.Game.Spells, в node — require().
// Зависимости (ПОРЯДОК ВАЖЕН, UMD-ловушка 000038):
//   * spells-data.js (Game.SpellsData — зеркало каталога, фолбэк file://);
//   * combat.js (Game.combatInternals — боевые функции ядра; при
//     загрузке spells.js дописывает туда allySpells = SPELLS_BY_ID —
//     ленивый каталог для ИИ support-союзника, задача 000080;
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
//   * воскрешение (задача 000163): ядро combat.js resurrectAlly
//               (export — combatInternals): t.alive = true,
//               hp = round(maxHP/2), лог «Возвращён в бой.»; цель —
//               мёртвый союзник c.units (явный targetId) ИЛИ автоцель
//               (мёртвый игрок приоритетно, иначе первый мёртвый
//               союзник); дальность НЕ ограничена (исключение из
//               SPELL_MAX_DIST — спасательная механика).
// Пул действий — c.ps.spellInt/spellWis по spell.атрибут, мана — spell.мани.
// В бою действует только высшая ИЗВЕСТНАЯ степень цепочки «база».

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const combat = require('./combat.js');
    module.exports = factory(
      require('./spells-data.js'),
      combat.combatInternals,
      require('./player.js'),
      combat.PRACTICE_XP,
      () => require('./items.js'),
      null);
  } else {
    // В браузере — пространство Game.Spells (не смешивать с Game).
    // Guard сбойного порядка (factory → undefined + console.error)
    // Game.Spells НЕ создаёт — «мёртвая магия» должна быть заметна.
    const Game = (typeof root.Game === 'object' && root.Game) || {};
    const api = factory(Game.SpellsData, Game.combatInternals, Game,
      Game.PRACTICE_XP, null, root);
    if (api) root.Game = Object.assign({}, root.Game, { Spells: api });
  }
})(typeof globalThis !== 'undefined' ? globalThis : self,
  function (SpellsData, internals, P, PRACTICE_XP, itemsThunk, rootRef) {

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
      typeof internals.dealDamageToMob !== 'function' ||
      typeof internals.resurrectAlly !== 'function' ||
      // 000235.01: ядро «баф/дебаф/призыв/создание» (combat.js).
      typeof internals.makeAlly !== 'function' ||
      typeof internals.placeAllies !== 'function' ||
      typeof internals.allyRoom !== 'function' ||
      typeof internals.MOB_TYPES !== 'object') {
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
    // 000163: ядро воскрешения (combat.js; GUARD выше — деградация,
    // не crash, паттерн 000038/000113).
    resurrectAlly,
    // 000235.01: «баф/дебаф/призыв/создание» (combat.js).
    makeAlly, placeAllies, allyRoom, MOB_TYPES,
    healAlly, livingAllies,
  } = internals;

  // --- Каталог (зеркало assets/spells, src/spells-data.js) ---

  const SPELLS = SpellsData.SPELLS;
  const SPELLS_BY_ID = SpellsData.SPELLS_BY_ID;

  // Задача 000080: ЛЕНИВЫЙ каталог для ИИ support-союзника — combat.js
  // грузится в браузере ДО spells-data.js/spells.js (UMD-ловушка 000038)
  // и читать каталог сам не может; spells.js ставит его в
  // combatInternals.allySpells одной строкой при загрузке (обе ветки
  // UMD — общий factory; одна ссылка: node-require кэш / Game).
  internals.allySpells = SPELLS_BY_ID;

  function getSpell(id) {
    if (typeof id !== 'string' || !id) return null;
    return SPELLS_BY_ID[id] || null;
  }

  // --- Ранги школы (spec/spells.md «Ранги в школе») ---
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
  const TARGETED = new Set(['урон', 'ослабление', 'контроль', 'дебаф']);
  // Все действия, поддерживаемые эффектом (ветки switch в castSpell).
  // В файле enum закреплён схемой; проверка — защита от каталога,
  // мутированного в памяти (ревью 000045, раунд 1): отказ обязан идти
  // ДО расхода пула/маны, и canCastSpell даёт ту же причину (000037).
  const KNOWN_ACTIONS = new Set(
    ['урон', 'лечение', 'защита', 'ослабление', 'контроль', 'воскрешение',
     'баф', 'дебаф', 'призыв', 'создание', 'невидимость', 'телепорт',
     'внебой']);
  // 000235.01: внебоевые действия — в бою каст/зеркало отказываются
  // единственной причиной «внебоевое заклинание» (гейт по ДЕЙСТВИЮ,
  // не по флагу «вне_боя»); обработчики — вне боя (.02/.03/.04).
  const OUT_OF_COMBAT = new Set(['невидимость', 'телепорт', 'внебой']);
  // 000235.02: внебоевые действия с ДЛИТЕЛЬНОСТЬЮ — каст требует
  // параметры.days (1..3); «телепорт» — мгновенное, дней не требует.
  const DURATION_ACTIONS = new Set(['невидимость', 'внебой']);
  // 000235.01: дебаф-статы (роутинг зоны: дебаф → мобы, баф → союзники).
  // «ход_вниз» — 6-й дебаф-стат ТЗ (ревью: без него зона с этим
  // statом роутилась СОЮЗНИКАМ как баф).
  const DEBUFF_STATS = new Set([
    'урон_вниз', 'броня_вниз', 'попадание_вниз', 'получаемый_урон_вверх',
    'dot', 'ход_вниз',
  ]);
  // 9 баф-статов ТЗ (union схемы «stat» = баф ∪ дебаф).
  const BUFF_STATS = new Set([
    'урон', 'броня', 'ход', 'реген', 'вампиризм', 'отражение',
    'попадание', 'получаемый_урон', 'иммунитет_контроля',
  ]);
  // 000235.01 ревью: все 15 stat — fail-closed «баф»/«дебаф»/
  // «создание» (зона): stat вне union — мусор (мутированный
  // каталог), отказ ДО расхода (000045, зеркало 000037).
  const EFFECT_STATS = new Set([...BUFF_STATS, ...DEBUFF_STATS]);

  function isFreeCast(c, spellId) {
    return Array.isArray(c.freeCast) && c.freeCast.includes(spellId);
  }

  let heroItemsApi = null;
  function isHeroFreeCast(p, spellId) {
    if (!p || typeof p !== 'object' || typeof p.equipment !== 'object'
        || Array.isArray(p.equipment)) return false;
    let api;
    if (itemsThunk) {
      if (!heroItemsApi) {
        try { heroItemsApi = itemsThunk(); } catch (e) { heroItemsApi = {}; }
      }
      api = heroItemsApi;
    } else {
      api = (rootRef && rootRef.Game) ? rootRef.Game : null;
    }
    if (!api || typeof api.equipmentAffixes !== 'function') return false;
    let res;
    try { res = api.equipmentAffixes(p); } catch (e) { res = null; }
    const fc = (res && typeof res === 'object' && !Array.isArray(res))
      ? res.freeCast : null;
    if (fc && typeof fc.has === 'function') return !!fc.has(spellId);
    if (Array.isArray(fc)) return fc.includes(spellId);
    return false;
  }

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
    // 000235.01: внебоевое действие в бою — тот же отказ до расхода
    // (гейт по действию; зеркало 000037 — canCastSpell = evalSpell).
    if (OUT_OF_COMBAT.has(spell.действие)) {
      return { fail: { ok: false, reason: 'внебоевое заклинание' } };
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
    const free = isFreeCast(c, spellId);
    if (!free && p.mp < spell.мани) {
      return { fail: { ok: false, reason: `не хватает маны (${spell.мани})` } };
    }
    // Цель (для урона/ослабления/контроля): аргумент, иначе ближайший.
    let t = null;
    if (TARGETED.has(spell.действие)) {
      t = targetId ? c.units.find((u) => u.id === targetId) : nearestMob(c);
      // Союзник — не цель (000080, раунд ревью 1): своя сторона — та же
      // причина «нет цели», что в combat.js playerAttack/playerSpell/
      // canDoAction. Без side-проверки уронной каст ставил союзнику
      // hp = NaN (makeAlly ранее не имел damageTakenMult) — неубиваемый
      // и вымывавший пул лечения support. nearestMob (фолбэк без
      // targetId) side уже фильтрует.
      if (!t || !t.alive || t.fled || t.side === 'ally') {
        return { fail: { ok: false, reason: 'нет цели' } };
      }
      if (unitDist(c, t) > SPELL_MAX_DIST) {
        return {
          fail: { ok: false, reason: 'цель слишком далеко (дальность 4)' },
        };
      }
    } else if (spell.действие === 'воскрешение') {
      // Воскрешение (000163, контракты R-1/R-2): явный targetId —
      // ТОЛЬКО мёртвый СОЮЗНИК c.units (side 'ally', !alive, !fled);
      // targetId 'player'/чужой id/живой союзник/моб — «нет цели»
      // (игрок НЕ в c.units — маркера 'player' нет). Без targetId —
      // автоцель: мёртвый ИГРОК приоритетно (катастрофа выше), иначе
      // первый мёртвый союзник в порядке c.units. Дальность НЕ
      // ограничена (исключение из SPELL_MAX_DIST — спасательная
      // механика D3): unitDist НЕ вызывается.
      if (targetId) {
        const u = c.units.find((x) => x.id === targetId);
        if (!(u && u.side === 'ally' && !u.alive && !u.fled)) {
          return { fail: { ok: false, reason: 'нет цели' } };
        }
        t = u;
      } else if (!c.player.alive) {
        t = c.player; // мёртвый игрок — приоритет автоцели
      } else {
        t = c.units.find((x) => x.side === 'ally' && !x.alive
          && !x.fled) || null;
        if (!t) return { fail: { ok: false, reason: 'нет цели' } };
      }
    } else if (spell.действие === 'баф'
      || (spell.действие === 'лечение' && ALLY_HEAL_IDS.has(spellId))) {
      // 000235.01: цель — живой СОЮЗНИК (явный targetId; моб/чужой id/
      // мёртвый — «нет цели», как у урона). Без targetId — каст по
      // себе (t = null: castSpell пишет c.ps.buff). Дальность НЕ
      // ограничена (спасательная механика, как воскрешение).
      if (targetId) {
        const u = c.units.find((x) => x.id === targetId);
        if (!(u && u.side === 'ally' && u.alive && !u.fled)) {
          return { fail: { ok: false, reason: 'нет цели' } };
        }
        t = u;
      }
    } else if (spell.действие === 'призыв') {
      // 000235.01: fail-closed (идентификатор призывного + место) —
      // ДО расхода пула/маны.
      const pa = spell.параметры;
      if (!pa || !MOB_TYPES[pa.summon]) {
        return {
          fail: {
            ok: false,
            reason: 'неизвестный призыв: '
              + (pa && pa.summon ? pa.summon : 'нет'),
          },
        };
      }
      if (!allyRoom(c)) {
        return { fail: { ok: false, reason: 'нет места для призыва' } };
      }
    } else if (spell.действие === 'создание') {
      // 000235.01: fail-closed (объект — стена|зона) — ДО расхода.
      const pa = spell.параметры;
      if (!pa || (pa.object !== 'стена' && pa.object !== 'зона')) {
        return {
          fail: {
            ok: false,
            reason: 'неизвестный объект: '
              + (pa && pa.object ? pa.object : 'нет'),
          },
        };
      }
      // 000235.01 ревью: без turns тик «−=1; ≤0 → снять» даёт NaN —
      // стена была бы вечной; зона без radius применялась бы на
      // ВСЁ поле (сравнение с undefined — false). Отказ ДО расхода
      // (000045, зеркало 000037 — один evalSpell).
      if (!Number.isInteger(pa.turns) || pa.turns < 1) {
        return {
          fail: { ok: false, reason: 'неполные параметры: turns' },
        };
      }
      if (pa.object === 'зона') {
        if (typeof pa.radius !== 'number' || !Number.isInteger(pa.radius)
            || pa.radius < 1 || pa.radius > 5) {
          return {
            fail: { ok: false, reason: 'неполные параметры: radius' },
          };
        }
        if (typeof pa.stat !== 'string' || !EFFECT_STATS.has(pa.stat)) {
          return {
            fail: { ok: false, reason: 'неполные параметры: stat' },
          };
        }
        if (typeof pa.value !== 'number' || !Number.isFinite(pa.value)) {
          return {
            fail: { ok: false, reason: 'неполные параметры: value' },
          };
        }
      }
    }
    // 000235.01 ревью: «баф»/«дебаф» — fail-closed на неполные
    // «параметры» (D1: {stat, value, turns}) ДО расхода пула/маны;
    // без гейта castSpell бросал TypeError ПОСЛЕ расхода (падение
    // хода; canCastSpell давал ok:true — срыв зеркала 000037).
    if (spell.действие === 'баф' || spell.действие === 'дебаф') {
      const pa = spell.параметры;
      if (!pa) {
        return { fail: { ok: false, reason: 'нет параметров' } };
      }
      if (typeof pa.stat !== 'string' || !EFFECT_STATS.has(pa.stat)) {
        return {
          fail: { ok: false, reason: 'неполные параметры: stat' },
        };
      }
      if (typeof pa.value !== 'number' || !Number.isFinite(pa.value)) {
        return {
          fail: { ok: false, reason: 'неполные параметры: value' },
        };
      }
      if (!Number.isInteger(pa.turns) || pa.turns < 1) {
        return {
          fail: { ok: false, reason: 'неполные параметры: turns' },
        };
      }
    }
    return { ok: true, spell, p, t, poolKey, free };
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
    const { spell, p, t, poolKey, free } = ev;
    c.ps[poolKey] -= 1;
    if (!free) p.mp -= spell.мани;
    const d = P.derived(p);
    const out = { ok: true, spell };
    switch (spell.действие) {
      case 'урон': {
        // Заклинание: всегда попадает, игнорирует броню моба.
        const bonusKey = SCHOOL_BONUS[spell.школа];
        const bonus = bonusKey ? d[bonusKey] : 0;
        // 000235.01: баф игрока «урон» — ×(1+v) (c.ps.buff; инлайн —
        // хелперы combat.js spells.js не видят, UMD-изоляция).
        const buffMult = (c.ps.buff && c.ps.buff.stat === 'урон'
          && c.ps.buff.turns > 0) ? 1 + c.ps.buff.value : 1;
        const dmg = Math.round(
          (4 + 0.5 * p.primary[spell.атрибут]) *
          (1 + 0.15 * (spell.степень - 1)) * (1 + bonus) * buffMult);
        const r = dealDamageToMob(c, t, dmg, true);
        log(c, `${spell.название} по ${t.name}: ${r.dmg}.`);
        out.dmg = r.dmg;
        out.killed = r.killed;
        // 000267: drain-самохил (drain_life 000069 / soul_drain 000072) —
        // «урон» + параметры.value: кастер лечится на round(value × факт)
        // (гейт по НАЛИЧИЮ value — не по id; без value — бит-в-бит;
        // out.healed = факт, 0 при полном HP).
        const pa = spell.параметры;
        if (pa && typeof pa.value === 'number' && pa.value > 0) {
          out.healed = healAlly(c, p, Math.round(pa.value * r.dmg));
          if (out.healed > 0) log(c, `${spell.название}: +${out.healed}.`);
        }
        break;
      }
      case 'лечение': {
        // Как урон — от spell.атрибут (в каталоге все исцеления —
        // Мудрость; при другом атрибуте формула следовала бы за ним).
        const amount = Math.round(
          (4 + 0.5 * p.primary[spell.атрибут] + p.level) *
          (1 + 0.15 * (spell.степень - 1)));
        if (spellId === 'purify') {
          if (t) {
            t.debuff = null;
            out.purified = t.id;
            log(c, `${spell.название}: дебаф с ${t.name} снят.`);
          } else {
            out.purified = null;
            log(c, `${spell.название}: очищено.`);
          }
          break;
        }
        if (spellId === 'regeneration') {
          const pa = spell.параметры;
          const eff = { stat: pa.stat, value: pa.value, turns: pa.turns };
          if (t) t.buff = eff; else c.ps.buff = eff;
          log(c, t
            ? `${t.name}: «${pa.stat}» на ${pa.turns} ходов.`
            : `${spell.название}: «${pa.stat}» на ${pa.turns} ходов.`);
          break;
        }
        if (spellId === 'life_bloom') {
          const pa = spell.параметры;
          const before = t ? t.hp : p.hp;
          const healed = t
            ? healAlly(c, t, amount)
            : P.heal(p, amount) - before;
          const eff = { stat: pa.stat, value: pa.value, turns: pa.turns };
          if (t) t.buff = eff; else c.ps.buff = eff;
          log(c, t
            ? `${spell.название}: ${t.name} +${healed}, «${pa.stat}» `
              + `на ${pa.turns} ходов.`
            : `${spell.название}: +${healed}, «${pa.stat}» `
              + `на ${pa.turns} ходов.`);
          out.healed = healed;
          break;
        }
        if (PARTY_HEAL_IDS.has(spellId)) {
          const hpBefore = p.hp;
          let total = P.heal(p, amount) - hpBefore;
          for (const a of livingAllies(c)) {
            total += healAlly(c, a, amount);
          }
          if (spellId === 'mass_holy_light') {
            for (const a of livingAllies(c)) a.debuff = null;
          }
          log(c, `${spell.название}: +${total}.`);
          out.hp = p.hp;
          out.healed = total;
          break;
        }
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
      case 'воскрешение': {
        // 000163: ядро combat.js resurrectAlly (alive, hp=round(
        // maxHP/2), лог «Возвращён в бой.»); цель — из evalSpell
        // (мёртвый союзник c.units / мёртвый игрок; дальности нет).
        out.hp = resurrectAlly(c, t);
        break;
      }
      case 'баф': {
        // 000235.01: эффект {stat, value, turns} — на союзнике (t,
        // u.buff) или на себе (t === null, c.ps.buff). Тик «ровно N
        // раундов, включая каст» — startRound (combat.js); рекаст —
        // overwrite (паттерн c.ps.shield).
        const pa = spell.параметры;
        if (PARTY_BUFF_IDS.has(spellId)) {
          c.ps.buff = { stat: pa.stat, value: pa.value, turns: pa.turns };
          for (const a of livingAllies(c)) {
            a.buff = { stat: pa.stat, value: pa.value, turns: pa.turns };
          }
          log(c, `${spell.название}: эффект «${pa.stat}» на `
            + `${pa.turns} ходов (партия).`);
          out.buffed = 'party';
          break;
        }
        const eff = { stat: pa.stat, value: pa.value, turns: pa.turns };
        if (t) t.buff = eff; else c.ps.buff = eff;
        log(c, t
          ? `${t.name}: эффект «${pa.stat}» на ${pa.turns} ходов.`
          : `${spell.название}: эффект «${pa.stat}» на ${pa.turns} ходов.`);
        out.buffed = t ? t.id : 'player';
        break;
      }
      case 'дебаф': {
        // 000235.01: эффект {stat, value, turns} на мобе (u.debuff;
        // цель — из evalSpell, TARGETED). «dot» — тик в начале хода
        // цели (mobAct), остальные статы — startRound (combat.js).
        const pa = spell.параметры;
        t.debuff = { stat: pa.stat, value: pa.value, turns: pa.turns };
        log(c, `${t.name}: «${pa.stat}» на ${pa.turns} ходов.`);
        out.debuffed = t.id;
        break;
      }
      case 'призыв': {
        // 000235.01: временный союзник из данных assets/mobs (ядро
        // makeAlly, 000193): уровень — СПЕЛЛА (не героя), moraleMult 1
        // (мораль отряда к призывному не применяется — упрощение,
        // memory §3.5). Живёт `параметры.turns` раундов, включая каст
        // (рассеивание — startRound, combat.js; fail-closed — evalSpell).
        const pa = spell.параметры;
        const mt = MOB_TYPES[pa.summon];
        const u = makeAlly({
          id: 's' + c.units.length,
          name: mt.name,
          role: mt.role,
          level: spell.уровень,
          dmg: mt.dmg,
          hp: mt.hp,
          armor: mt.armor,
          attrs: {
            dexterity: mt.dexterity || 0,
            intelligence: mt.intelligence || 0,
          },
          // 000267: трейты каталога (lifesteal — 000087 shadow_wraith);
          // makeAlly копирует (константа каталога не шарится).
          traits: mt.traits,
          kind: 'summon',
        }, c.units.length);
        u.summonTurns = pa.turns;
        placeAllies(c, [u]);
        c.units.push(u);
        if (HEAL_SUMMON_IDS.has(spellId)) u.spells = ['light_heal'];
        log(c, `${spell.название}: ${u.name} (${pa.turns} ходов).`);
        out.summoned = u.id;
        break;
      }
      case 'создание': {
        // 000235.01: стена — ряд клеток (c.walls, непроходимость —
        // общее c.obstacles; ряд y = clamp(py−2, 1, height−2), минус
        // игрок/юниты/уже существующие препятствия); зона — ОДИН
        // слот c.zone (радиус Чебышёва от клетки игрока, применение
        // ОДНОКРАТНО в момент каста: дебаф-стат → мобы в радиусе
        // u.debuff, баф-стат → союзники u.buff; игрок не затрагивается;
        // рекаст — overwrite).
        const pa = spell.параметры;
        if (pa.object === 'стена') {
          const y = Math.min(c.height - 2, Math.max(1, c.py - 2));
          const cells = [];
          for (let x = 0; x < c.width; x++) {
            if (x === c.px && y === c.py) continue;
            let taken = false;
            for (const un of c.units) {
              if (!un.alive || un.fled) continue;
              if (x >= un.x && x < un.x + (un.size.w || 1)
                  && y >= un.y && y < un.y + (un.size.h || 1)) {
                taken = true;
                break;
              }
            }
            if (taken) continue;
            if (c.obstacles.has(x + ',' + y)) continue;
            cells.push([x, y]);
          }
          for (const cell of cells) c.obstacles.add(cell[0] + ',' + cell[1]);
          c.walls.push({ cells, turns: pa.turns });
          log(c, `${spell.название}: стена (${pa.turns} ходов).`);
          out.wall = cells.length;
        } else {
          c.zone = {
            x: c.px, y: c.py, radius: pa.radius,
            stat: pa.stat, value: pa.value, turns: pa.turns,
          };
          for (const un of c.units) {
            if (!un.alive || un.fled) continue;
            if (Math.max(Math.abs(un.x - c.px), Math.abs(un.y - c.py))
                > pa.radius) continue;
            if (DEBUFF_STATS.has(pa.stat)) {
              if (un.side === 'mob') {
                un.debuff = {
                  stat: pa.stat, value: pa.value, turns: pa.turns,
                };
              }
            } else if (un.side === 'ally') {
              un.buff = { stat: pa.stat, value: pa.value, turns: pa.turns };
            }
          }
          if (spellId === 'holy_ground') {
            for (const un of c.units) {
              if (!un.alive || un.fled || un.side !== 'ally') continue;
              if (Math.max(Math.abs(un.x - c.px),
                  Math.abs(un.y - c.py)) > pa.radius) continue;
              un.buff = {
                stat: 'получаемый_урон',
                value: pa.value, turns: pa.turns,
              };
            }
          }
          log(c, `${spell.название}: зона (радиус ${pa.radius}, `
            + `${pa.turns} ходов).`);
          out.zone = pa.radius;
        }
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

  // --- 000235.02: каст вне боя (книга заклинаний) ---
  //
  // Чисто-боевое ядро НЕ трогаем: вне боя каст не создаёт сражения,
  // не ходит по ходам — только мана + hero.outOfCombatEffects
  // (append-only v1, без бампа версии сейва). Форма отказа —
  // fail-closed {ok, reason} (000037), ОДНА причина, мутации —
  // ПОСЛЕ всех проверок.

  // Нужны ли заклинанию дни (длительность): по ДЕЙСТВИЮ (невидимость/
  // внебой) или если каталог сам декларативно несёт параметры.days.
  function outOfCombatDays(spell) {
    const needs = DURATION_ACTIONS.has(spell.действие)
      || (spell.параметры && typeof spell.параметры === 'object'
          && 'days' in spell.параметры);
    if (!needs) return null;
    const days = spell.параметры && spell.параметры.days;
    if (typeof days !== 'number' || !Number.isInteger(days)
        || days < 1 || days > 3) return 'неполные параметры: days';
    return days;
  }

  // castOutOfCombat(p, spellId, day, ctx) → {ok, spell, expiresDay}
  // или {ok:false, reason}. Проверки ПО ПОРЯДКУ: каталог → книга →
  // мана → флаг вне_боя → days (1..3). day — день каста (clock.day).
  // ctx — форма 000235.04 (x/y, cities, passable, teleport):
  // телепорт-режимы исполняются через него (диспетч — по действию
  // 'телепорт' + параметры.mode; неполный ctx — skeleton без эффекта).
  // Перезаклинание того же spellId — ОБНОВЛЕНИЕ
  // записи in place (expiresDay = day + days), дублей нет; кулдаунов
  // нет — повторный каст в тот же день разрешён. Мгновенные (телепорт)
  // записей не создают (expiresDay = null).
  function castOutOfCombat(p, spellId, day, ctx) {
    if (!p || typeof p !== 'object') {
      return { ok: false, reason: 'неизвестное заклинание' };
    }
    const spell = getSpell(spellId);
    if (!spell) return { ok: false, reason: 'неизвестное заклинание' };
    if (!knows(p, spellId)) {
      return { ok: false, reason: 'заклинание не изучено' };
    }
    const free = isHeroFreeCast(p, spellId);
    if (!free
        && (typeof p.mp !== 'number' || p.mp < (spell['мани'] || 0))) {
      return { ok: false, reason: 'не хватает маны' };
    }
    if (spell['вне_боя'] !== true) {
      return { ok: false, reason: 'боевое заклинание' };
    }
    const days = outOfCombatDays(spell);
    if (typeof days === 'string') return { ok: false, reason: days };
    if (spellId === 'flame_step' || spellId === 'shadow_step') {
      if (ctx !== undefined) {
        const cbKey = spellId === 'shadow_step'
          ? 'shadowStep' : 'flameStep';
        const cb = ctx && typeof ctx[cbKey] === 'function'
          ? ctx[cbKey] : null;
        if (!cb) {
          return { ok: false, reason: 'телепорт недоступен здесь' };
        }
        const r = cb();
        if (r && r.ok === false) {
          return { ok: false,
            reason: r.reason || 'телепорт недоступен здесь' };
        }
      }
      if (!free) p.mp -= spell['мани'] || 0;
      return { ok: true, spell, expiresDay: null };
    }
    if (spellId === 'miracle') {
      if (ctx !== undefined) {
        const cb = ctx && typeof ctx.miracle === 'function'
          ? ctx.miracle : null;
        if (!cb) {
          return { ok: false, reason: 'воскрешение недоступно здесь' };
        }
        const r = cb();
        if (r && r.ok === false) {
          return { ok: false,
            reason: r.reason || 'воскрешение недоступно здесь' };
        }
      }
      if (!free) p.mp -= spell['мани'] || 0;
      return { ok: true, spell, expiresDay: null };
    }
    // Мутации — ПОСЛЕ всех проверок (мана проверена вверху).
    if (!Array.isArray(p.outOfCombatEffects)) p.outOfCombatEffects = [];
    const prior = p.outOfCombatEffects.findIndex(
      (e) => e && e.spellId === spellId);
    const priorExpiresDay = prior >= 0
      ? p.outOfCombatEffects[prior].expiresDay : null;
    const priorLen = p.outOfCombatEffects.length;
    if (!free) p.mp -= spell['мани'] || 0;
    let expiresDay = null;
    if (days !== null) {
      expiresDay = day + days;
      if (prior >= 0) p.outOfCombatEffects[prior].expiresDay = expiresDay;
      else p.outOfCombatEffects.push(
        { spellId, expiresDay: expiresDay });
    }
    switch (spellId) {
      case 'invisibility':
      case 'firelight':
      case 'hearthfire':
      case 'gate':
      case 'stone_anchor':
      case 'recall':
      case 'warding_circle':
      case 'frost_walk':
      case 'cold_breath':
      case 'frozen_stillness':
      case 'shroud_of_night':
      case 'dark_presence':
      case 'prayer':
      case 'divine_protection':
      case 'holy_light':
        break;
      default:
        break;
    }
    const rejected = teleportOutOfCombat(
      p, spell, day, ctx, { prior, priorExpiresDay, priorLen,
        expiresDay, free });
    if (rejected) return rejected;
    return { ok: true, spell, expiresDay };
  }

  // 000235.04: self-rollback отказа (D3).
  function castFail(p, spell, info) {
    if (!info.free) p.mp += spell['мани'] || 0;
    const eff = p.outOfCombatEffects;
    if (info.expiresDay !== null) {
      if (info.prior >= 0) {
        eff[info.prior].expiresDay = info.priorExpiresDay;
      } else if (eff.length > info.priorLen) {
        eff.splice(info.priorLen);
      }
    }
  }

  // 000235.04: телепорт-режимы (D1/D2).
  function teleportOutOfCombat(p, spell, day, ctx, info) {
    if (spell.действие !== 'телепорт') return null;
    const mode = spell.параметры && spell.параметры.mode;
    if (mode === 'город') {
      if (!(ctx && Number.isInteger(ctx.x) && Number.isInteger(ctx.y)
          && ctx.cities
          && typeof ctx.passable === 'function'
          && typeof ctx.teleport === 'function')) {
        return null;
      }
      const c = nearestBuiltCity(ctx.cities, ctx.x, ctx.y);
      if (!c) {
        castFail(p, spell, info);
        return { ok: false, reason: 'нет города с постройками' };
      }
      const dest = nearestPassableTile(
        c.x, c.y, ctx.passable, PORTAL_SEARCH_RADIUS);
      if (!dest) {
        castFail(p, spell, info);
        return { ok: false, reason: 'нет проходимого тайла рядом с городом' };
      }
      ctx.teleport(dest.x, dest.y);
      return null;
    }
    if (mode === 'метка_установить') {
      if (!(ctx && Number.isInteger(ctx.x) && Number.isInteger(ctx.y))) {
        return null;
      }
      p.portal_marker = { x: ctx.x, y: ctx.y, day };
      return null;
    }
    if (mode === 'метка_вернуться') {
      const m = p.portal_marker;
      if (!isPlainObject(m) || !Number.isInteger(m.x)
          || !Number.isInteger(m.y)) {
        castFail(p, spell, info);
        return { ok: false, reason: 'метка не установлена' };
      }
      if (!(ctx && typeof ctx.passable === 'function'
          && typeof ctx.teleport === 'function')) {
        return null;
      }
      const dest = nearestPassableTile(
        m.x, m.y, ctx.passable, PORTAL_SEARCH_RADIUS);
      if (!dest) {
        castFail(p, spell, info);
        return { ok: false, reason: 'нет проходимого тайла рядом с меткой' };
      }
      ctx.teleport(dest.x, dest.y);
      return null;
    }
    return null;
  }

  // --- 000235.04: чистые хелперы порталов (без Game/map/rng) ---

  const PORTAL_SEARCH_RADIUS = 25;
  const WARDING_SPELL_IDS = new Set(['warding_circle']);
  const PARTY_HEAL_IDS = new Set(['mass_heal', 'mass_holy_light']);
  const PARTY_BUFF_IDS = new Set([
    'blessing', 'divine_favor', 'guardian_blessing', 'swift_prayer',
    'faith_shield',
  ]);
  const ALLY_HEAL_IDS = new Set(['life_bloom', 'purify', 'regeneration']);
  const HEAL_SUMMON_IDS = new Set(['light_sprite', 'spirit_healer']);

  function isPlainObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  // 000235.04: ближайший к (x, y) город с built.length > 0
  // (Чебышёв до ЯКОРЯ; tie → лексико (x, y); НОЛЬ RNG). Map/object
  // по ключу 'cx,cy'; мусорные ключи/записи — skip.
  function nearestBuiltCity(cities, x, y) {
    if (!isPlainObject(cities) || !Number.isInteger(x)
        || !Number.isInteger(y)) return null;
    let best = null;
    const consider = (key, rec) => {
      if (typeof key !== 'string') return;
      const m = /^(-?\d+),(-?\d+)$/.exec(key);
      if (!m) return;
      if (!isPlainObject(rec) || !Array.isArray(rec.built)
          || rec.built.length === 0) return;
      const cx = parseInt(m[1], 10);
      const cy = parseInt(m[2], 10);
      const d = Math.max(Math.abs(cx - x), Math.abs(cy - y));
      if (best === null || d < best.d
          || (d === best.d && (cx < best.x
              || (cx === best.x && cy < best.y)))) {
        best = { x: cx, y: cy, d };
      }
    };
    if (cities instanceof Map) {
      for (const [k, v] of cities) consider(k, v);
    } else {
      for (const [k, v] of Object.entries(cities)) consider(k, v);
    }
    return best;
  }

  // 000235.04: ближайший проходимый тайл от (ax, ay) — спираль
  // Чебышёва в ПОРЯДКЕ findSpawn (кольцо r; dx внешний, dy
  // внутренний; первый passable). maxR включительно; нет → null.
  function nearestPassableTile(ax, ay, passable, maxR) {
    if (!Number.isInteger(ax) || !Number.isInteger(ay)
        || !Number.isInteger(maxR) || maxR < 0
        || typeof passable !== 'function') return null;
    for (let r = 0; r <= maxR; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = ax + dx;
          const ty = ay + dy;
          if (passable(tx, ty)) return { x: tx, y: ty };
        }
      }
    }
    return null;
  }

  // 000235.04: радиус активной зоны защиты героя в день day
  // (max параметров.radius по АКТИВНЫМ записям с spellId из
  // WARDING_SPELL_IDS; expiresDay > day; radius невалидный/
  // отсутствует → дефолт 5; нет активных → 0). Каталог — ленивым
  // lookup (live-референс SPELLS_BY_ID).
  function wardRadius(p, day) {
    if (!isPlainObject(p) || !Array.isArray(p.outOfCombatEffects)) {
      return 0;
    }
    let best = 0;
    for (const e of p.outOfCombatEffects) {
      if (!isPlainObject(e)) continue;
      if (!WARDING_SPELL_IDS.has(e.spellId)) continue;
      if (typeof e.expiresDay !== 'number' || e.expiresDay <= day) {
        continue;
      }
      const spell = SPELLS_BY_ID[e.spellId];
      const radius = (spell && isPlainObject(spell.параметры))
        ? spell.параметры.radius : undefined;
      const r = (typeof radius === 'number' && Number.isInteger(radius)
        && radius >= 1 && radius <= 5) ? radius : 5;
      if (r > best) best = r;
    }
    return best;
  }

  // 000235.08: frost_walk — герой на замёрзшем пути в день day ⇔
  // активная запись spellId 'frost_walk' (expiresDay > day — паттерн
  // isHeroLit; days 1 → эффект живёт ровно день каста).
  function isHeroFrostWalk(p, day) {
    if (!p || !Array.isArray(p.outOfCombatEffects)) return false;
    for (const e of p.outOfCombatEffects) {
      if (!e || typeof e !== 'object' || e.spellId !== 'frost_walk') {
        continue;
      }
      if (typeof e.expiresDay === 'number' && e.expiresDay > day) {
        return true;
      }
    }
    return false;
  }

  // 000235.08: cold_breath — радиус активной записи (max
  // параметров.radius по АКТИВНЫМ записям spellId 'cold_breath';
  // expiresDay > day; radius невалидный/отсутствует → дефолт 5;
  // нет активных → 0). Каталог — ленивым lookup (паттерн wardRadius;
  // независимая копия — бит-идентичность .04-пинов без риска).
  function coldBreathRadius(p, day) {
    if (!isPlainObject(p) || !Array.isArray(p.outOfCombatEffects)) {
      return 0;
    }
    let best = 0;
    for (const e of p.outOfCombatEffects) {
      if (!isPlainObject(e)) continue;
      if (e.spellId !== 'cold_breath') continue;
      if (typeof e.expiresDay !== 'number' || e.expiresDay <= day) {
        continue;
      }
      const spell = SPELLS_BY_ID['cold_breath'];
      const radius = (spell && isPlainObject(spell.параметры))
        ? spell.параметры.radius : undefined;
      const r = (typeof radius === 'number' && Number.isInteger(radius)
        && radius >= 1 && radius <= 5) ? radius : 5;
      if (r > best) best = r;
    }
    return best;
  }

  // 000235.08: frozen_stillness — радиус активной записи (паттерн
  // coldBreathRadius; независимая копия, spellId 'frozen_stillness').
  function frozenStillnessRadius(p, day) {
    if (!isPlainObject(p) || !Array.isArray(p.outOfCombatEffects)) {
      return 0;
    }
    let best = 0;
    for (const e of p.outOfCombatEffects) {
      if (!isPlainObject(e)) continue;
      if (e.spellId !== 'frozen_stillness') continue;
      if (typeof e.expiresDay !== 'number' || e.expiresDay <= day) {
        continue;
      }
      const spell = SPELLS_BY_ID['frozen_stillness'];
      const radius = (spell && isPlainObject(spell.параметры))
        ? spell.параметры.radius : undefined;
      const r = (typeof radius === 'number' && Number.isInteger(radius)
        && radius >= 1 && radius <= 5) ? radius : 5;
      if (r > best) best = r;
    }
    return best;
  }

  // 000235.09: shroud_of_night — радиус активной записи (паттерн
  // frozenStillnessRadius; независимая копия, spellId 'shroud_of_night').
  function shroudOfNightRadius(p, day) {
    if (!isPlainObject(p) || !Array.isArray(p.outOfCombatEffects)) {
      return 0;
    }
    let best = 0;
    for (const e of p.outOfCombatEffects) {
      if (!isPlainObject(e)) continue;
      if (e.spellId !== 'shroud_of_night') continue;
      if (typeof e.expiresDay !== 'number' || e.expiresDay <= day) {
        continue;
      }
      const spell = SPELLS_BY_ID['shroud_of_night'];
      const radius = (spell && isPlainObject(spell.параметры))
        ? spell.параметры.radius : undefined;
      const r = (typeof radius === 'number' && Number.isInteger(radius)
        && radius >= 1 && radius <= 5) ? radius : 5;
      if (r > best) best = r;
    }
    return best;
  }

  // 000235.09: dark_presence — радиус активной записи (паттерн
  // frozenStillnessRadius; независимая копия, spellId 'dark_presence').
  function darkPresenceRadius(p, day) {
    if (!isPlainObject(p) || !Array.isArray(p.outOfCombatEffects)) {
      return 0;
    }
    let best = 0;
    for (const e of p.outOfCombatEffects) {
      if (!isPlainObject(e)) continue;
      if (e.spellId !== 'dark_presence') continue;
      if (typeof e.expiresDay !== 'number' || e.expiresDay <= day) {
        continue;
      }
      const spell = SPELLS_BY_ID['dark_presence'];
      const radius = (spell && isPlainObject(spell.параметры))
        ? spell.параметры.radius : undefined;
      const r = (typeof radius === 'number' && Number.isInteger(radius)
        && radius >= 1 && radius <= 5) ? radius : 5;
      if (r > best) best = r;
    }
    return best;
  }

  // 000235.04: hero.portal_marker из (подделанного) сейва:
  // валидный {x, y, day} → каноническая КОПИЯ; иначе null (молча,
  // load-clean 000038).
  function sanitizePortalMarker(v) {
    if (!isPlainObject(v)) return null;
    if (!Number.isInteger(v.x) || !Number.isInteger(v.y)
        || !Number.isInteger(v.day) || v.day < 1) return null;
    return { x: v.x, y: v.y, day: v.day };
  }

  // expireOutOfCombatEffects(effects, day) → НОВЫЙ массив без
  // записей с expiresDay <= day (граница: эффект живёт ровно days
  // дней, на onDay(D+N) вылетает). Чисто: аргумент не мутируется;
  // не-массив → [].
  function expireOutOfCombatEffects(effects, day) {
    if (!Array.isArray(effects)) return [];
    return effects.filter(
      (e) => e && e.expiresDay !== undefined && e.expiresDay > day);
  }

  // sanitizeOutOfCombatEffects(list) — чистка полей из (подделанного)
  // сейва: запись живёт, если объект (не null/массив), spellId —
  // строка из SPELLS_BY_ID, expiresDay — конечное число и
  // Math.round(expiresDay) > 0 (хранится как Math.round). Дубликат
  // spellId — последний wins (позиция первого вхождения), порядок
  // сохранён; не-массив → [].
  function sanitizeOutOfCombatEffects(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const e of list) {
      if (!e || typeof e !== 'object' || Array.isArray(e)) continue;
      if (typeof e.spellId !== 'string' || !SPELLS_BY_ID[e.spellId]) continue;
      if (typeof e.expiresDay !== 'number' || !Number.isFinite(e.expiresDay)) continue;
      const d = Math.round(e.expiresDay);
      if (d <= 0) continue;
      const rec = { spellId: e.spellId, expiresDay: d };
      const i = out.findIndex((o) => o.spellId === e.spellId);
      if (i >= 0) out[i] = rec;
      else out.push(rec);
    }
    return out;
  }

  // 000235.03: hero невидим в день day ⇔ активная запись действия
  // «невидимость» (expiresDay > day — зеркало истечения .02).
  // Матчинг — по ДЕЙСТВИЮ (ленивый lookup — .09/совершенствования, Д-1).
  function isHeroInvisible(p, day) {
    if (!p || !Array.isArray(p.outOfCombatEffects)) return false;
    for (const e of p.outOfCombatEffects) {
      if (!e || typeof e !== 'object') continue;
      const spell = SPELLS_BY_ID[e.spellId];
      if (!spell || spell.действие !== 'невидимость') continue;
      if (typeof e.expiresDay === 'number' && e.expiresDay > day) {
        return true;
      }
    }
    return false;
  }

  function isHeroLit(p, day) {
    if (!p || !Array.isArray(p.outOfCombatEffects)) return false;
    for (const e of p.outOfCombatEffects) {
      if (!e || typeof e !== 'object' || e.spellId !== 'firelight') {
        continue;
      }
      if (typeof e.expiresDay === 'number' && e.expiresDay > day) {
        return true;
      }
    }
    return false;
  }

  function isHeroCamped(p, day) {
    if (!p || !Array.isArray(p.outOfCombatEffects)) return false;
    for (const e of p.outOfCombatEffects) {
      if (!e || typeof e !== 'object' || e.spellId !== 'hearthfire') {
        continue;
      }
      if (typeof e.expiresDay === 'number' && e.expiresDay >= day) {
        return true;
      }
    }
    return false;
  }

  function isHeroPrayer(p, day) {
    if (!p || !Array.isArray(p.outOfCombatEffects)) return false;
    for (const e of p.outOfCombatEffects) {
      if (!e || typeof e !== 'object' || e.spellId !== 'prayer') {
        continue;
      }
      if (typeof e.expiresDay === 'number' && e.expiresDay >= day) {
        return true;
      }
    }
    return false;
  }

  function isHeroDivineProtected(p, day) {
    if (!p || !Array.isArray(p.outOfCombatEffects)) return false;
    for (const e of p.outOfCombatEffects) {
      if (!e || typeof e !== 'object'
          || e.spellId !== 'divine_protection') {
        continue;
      }
      if (typeof e.expiresDay === 'number' && e.expiresDay > day) {
        return true;
      }
    }
    return false;
  }

  function holyLightRadius(p, day) {
    if (!p || !Array.isArray(p.outOfCombatEffects)) {
      return 0;
    }
    let best = 0;
    for (const e of p.outOfCombatEffects) {
      if (!e || typeof e !== 'object' || e.spellId !== 'holy_light') {
        continue;
      }
      if (typeof e.expiresDay !== 'number' || e.expiresDay <= day) {
        continue;
      }
      const spell = SPELLS_BY_ID['holy_light'];
      const radius = (spell && isPlainObject(spell.параметры))
        ? spell.параметры.radius : undefined;
      const r = (typeof radius === 'number' && Number.isInteger(radius)
        && radius >= 1 && radius <= 5) ? radius : 5;
      if (r > best) best = r;
    }
    return best;
  }

  // 000235.03: снятие невидимости (триггер — вступление в бой):
  // выносит ТОЛЬКО записи действия «невидимость»; переприсваивает
  // только если что-то снято (идентичность на чистых путях);
  // поля, которого не было, не создаёт; не-массив/null — no-op.
  function clearInvisibility(p) {
    if (!p || !Array.isArray(p.outOfCombatEffects)) return;
    const kept = p.outOfCombatEffects.filter((e) => {
      if (!e || typeof e !== 'object') return true;
      const spell = SPELLS_BY_ID[e.spellId];
      return !(spell && spell.действие === 'невидимость');
    });
    if (kept.length !== p.outOfCombatEffects.length) {
      p.outOfCombatEffects = kept;
    }
  }

  return {
    SPELLS, SPELLS_BY_ID, SCHOOL_RANKS,
    getSpell, schoolRank, rankAllowsTier,
    bookOf, knows, canLearn, learn,
    chainRoot, chainSpells, highestKnown, activeSpells,
    castSpell, canCastSpell,
    sanitizeSpellBook,
    castOutOfCombat, expireOutOfCombatEffects,
    sanitizeOutOfCombatEffects,
    isHeroInvisible, clearInvisibility,
    isHeroLit, isHeroCamped, isHeroPrayer, isHeroDivineProtected,
    holyLightRadius,
    nearestBuiltCity, nearestPassableTile, wardRadius,
    sanitizePortalMarker, PORTAL_SEARCH_RADIUS,
    isHeroFrostWalk, coldBreathRadius, frozenStillnessRadius,
    shroudOfNightRadius, darkPresenceRadius,
  };
});

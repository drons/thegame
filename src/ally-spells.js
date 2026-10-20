// Заклинания СОЮЗНИКОВ в бою (задача 000193): «те же механики, что у
// Флогистона» — каст из книги активного союзника (наёмник/Эфир) по
// пайплайну 1:1 с игроком (зеркало evalSpell/castSpell, src/spells.js):
// пул/мана тратятся с АКТИВНОГО юнита (poolsOf: Эфир — c.efs, наёмник —
// поля u), эффекты 1:1 (урон/лечение/щит/ослабление/контроль/
// воскрешение), «одна причина — одно поведение» (000037):
// castAllySpell и canCastAllySpell дают ОДНУ и ту же причину.
//
// Униформный модуль (паттерн 000038/000149): в браузере —
// globalThis.Game.AllySpells, в node — require(). В браузере — НОЛЬ
// load-time зависимостей: чтений Game при загрузке нет, боевые
// internals — лениво в момент ВЫЗОВА (combat.js гарантированно ДО
// ally-spells.js — пин index-order; UMD-ловушка 000038: combat-ui.js
// снимает снапшот Game один раз — G.AllySpells обязан быть в нём).
// В node — require('./combat.js') (однонаправленно: combat.js модуль
// не требует — цикла нет).
//
// Каталог — ЛЕНИВЫЙ combatInternals.allySpells (ставит spells.js при
// загрузке; инъектируемые каталоги тестов работают, паттерн CB-6).
// Практика (000117-зеркало): ТОЛЬКО Эфир — ленивое
// Game.efir.practiceEfir(c.efirState, skill, PRACTICE_XP.spell);
// наёмник — практики нет (v1). 0 новых точек c._rng (детерминизм).
// Деградация (битый порядок загрузки): ОДИН console.error на сессию
// + отказ «недоступно активному персонажу» — краха нет.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    // node: однонаправленный require (комбат не требует этот модуль).
    const combat = require('./combat.js');
    module.exports = factory(() => combat.combatInternals);
  } else {
    // браузер: ленивая ссылка (чтений Game при загрузке нет — 000038).
    root.Game = Object.assign({}, root.Game, {
      AllySpells: factory(() => (
        typeof root.Game === 'object' && root.Game
          ? root.Game.combatInternals
          : null)),
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : self,
  function (getInternals) {

  // --- Константы (зеркало src/spells.js, 000045; НЕЗАВИСИМО от
  // Game.Spells — работает с инъектированным каталогом, CB-6) ---

  const SPELL_MAX_DIST = 4; // дальность каста (как у игрока)
  const ATTR_POOL = { intelligence: 'spellInt', wisdom: 'spellWis' };
  const ATTR_NAME = { intelligence: 'Интеллект', wisdom: 'Мудрость' };
  // Все действия, поддерживаемые эффектом (зеркало spells.js).
  const KNOWN_ACTIONS = new Set(
    ['урон', 'лечение', 'защита', 'ослабление', 'контроль', 'воскрешение']);
  // Действия, требующие цель на поле (прочие — по себе).
  const TARGETED = new Set(['урон', 'ослабление', 'контроль']);
  // Практика: мапа школа → навык Эфира (000117; тень/защита/
  // исцеление — навыка нет → практики нет; наёмник — нет вообще).
  const PRACTICE_BY_SCHOOL = {
    огонь: 'firelord',
    лёд: 'icelord',
    исцеление: 'meditation',
    природа: 'nature',
  };

  // --- Локальные зеркала (алгоритм 1:1 с spells.js; каталог —
  // аргумент) ---

  // rectOf/rectDist (combat.js L553-569): Манхэттен между прямоуголь-
  // никами (0 — пересечение/соседство).
  function rectOf(v) {
    return v.size
      ? { x: v.x, y: v.y, w: v.size.w || 1, h: v.size.h || 1 }
      : { x: v.x, y: v.y, w: v.w || 1, h: v.h || 1 };
  }
  function rectDistOf(a, b) {
    const A = rectOf(a), B = rectOf(b);
    const ax1 = A.x + A.w - 1, ay1 = A.y + A.h - 1;
    const bx1 = B.x + B.w - 1, by1 = B.y + B.h - 1;
    const dx = ax1 < B.x ? B.x - ax1 : (bx1 < A.x ? A.x - bx1 : 0);
    const dy = ay1 < B.y ? B.y - ay1 : (by1 < A.y ? A.y - by1 : 0);
    return dx + dy;
  }

  // Ближайший живой МОБ от СОЮЗНИКА u (Д-M: nearestMob(pipeline) —
  // от ИГРОКА; rectDist не экспортирован в internals — локальный
  // зеркальный). Тай-брейк — порядок c.units (строгий <), детер-
  // минированно, 0 c._rng.
  function nearestMobFor(c, u) {
    let best = null, bestD = null;
    for (const t of c.units) {
      if (!t.alive || t.fled || t.side !== 'mob') continue;
      const d = rectDistOf(u, t);
      if (bestD == null || d < bestD) { best = t; bestD = d; }
    }
    return best;
  }

  // Цепочки «база» (зеркало spells.js L204-236): кэш на ССЫЛКУ
  // каталога (инъектируемый каталог — отдельная запись, CB-6).
  const chainCache = new Map();
  function chainsFor(catalog) {
    let e = chainCache.get(catalog);
    if (e) return e;
    const ids = Object.keys(catalog);
    const childrenOf = new Map();
    for (const id of ids) {
      const s = catalog[id];
      if (!s || s['база'] === null || s['база'] === undefined) continue;
      if (!childrenOf.has(s['база'])) childrenOf.set(s['база'], []);
      childrenOf.get(s['база']).push(s);
    }
    const CHAIN_OF = new Map();
    for (const id of ids) {
      const s = catalog[id];
      if (!s || s['база'] !== null) continue;
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
      chain.sort((a, b) => a['степень'] - b['степень']);
      for (const m of chain) CHAIN_OF.set(m.id, chain);
    }
    e = { CHAIN_OF };
    chainCache.set(catalog, e);
    return e;
  }

  // Высшая ИЗВЕСТНАЯ степень цепочки (зеркало highestKnown spells.js
  // L254-267): строгое > по «степень», при равных — раннее в
  // каталоге. null — если ни одна степень цепочки не в книге.
  function highestInChain(catalog, book, spell) {
    if (!spell || !Array.isArray(book)) return null;
    const chain = chainsFor(catalog).CHAIN_OF.get(spell.id) || [spell];
    let best = null;
    for (const s of chain) {
      if (book.includes(s.id) && (!best || s['степень'] > best['степень'])) {
        best = s;
      }
    }
    return best;
  }

  // --- Пул (Д-C): Эфир — c.efs (канон 000112/000167: рефилл/ритм
  // зафиксированы), наёмник — собственные поля u (makeAlly 000193) ---
  function poolsOf(c, u) {
    return (u.kind === 'efir' && c.efs) ? c.efs : u;
  }

  function isAllyFreeCast(u, spellId) {
    return Array.isArray(u.freeCast) && u.freeCast.includes(spellId);
  }

  // --- Ленивые боевые internals (деградация: 1 console.error +
  // отказ, паттерн 000038/spellBookWarned) ---
  let internalsErrLogged = false;
  function internalsNow() {
    const I = getInternals();
    if (I && typeof I.log === 'function'
        && typeof I.checkTurn === 'function'
        && typeof I.checkBlocked === 'function'
        && typeof I.dealDamageToMob === 'function'
        && typeof I.healAlly === 'function'
        && typeof I.resurrectAlly === 'function') {
      return I;
    }
    if (!internalsErrLogged) {
      internalsErrLogged = true;
      console.error('ally-spells.js: не найдены боевые internals — ' +
        'загрузите src/combat.js до src/ally-spells.js (задача 000193)');
    }
    return null;
  }
  function catalogNow() {
    const I = getInternals();
    return (I && I.allySpells) || null;
  }

  // --- Общие проверки каста (зеркало evalSpell spells.js L322-407;
  // таблица 000193 §2: ОДНА причина, тот же порядок; чисто: без
  // расхода, без c.log/c.targetId/c._rng) ---
  // Возврат: { fail: {ok:false, reason} } | {ok, spell, pools,
  // poolKey, t}.
  function evalAllySpell(c, u, spellId, targetId) {
    const I = internalsNow();
    if (!I) {
      return { fail: { ok: false, reason: 'недоступно активному персонажу' } };
    }
    const why = I.checkTurn(c);
    if (why) return { fail: { ok: false, reason: why } };
    const catalog = catalogNow();
    const spell = catalog ? catalog[spellId] : null;
    if (!spell) return { fail: { ok: false, reason: 'неизвестное заклинание' } };
    const book = Array.isArray(u.spells) ? u.spells : null;
    if (!book || !book.includes(spellId)) {
      return { fail: { ok: false, reason: 'заклинание не изучено' } };
    }
    // Неизвестное действие (битые данные) — отказ ДО расхода;
    // castAllySpell и canCastAllySpell дают одну причину (000037).
    if (!KNOWN_ACTIONS.has(spell['действие'])) {
      return {
        fail: { ok: false, reason: 'неизвестное действие: ' + spell['действие'] },
      };
    }
    // В бою действует только высшая известная степень цепочки «база».
    const highest = highestInChain(catalog, book, spell);
    if (highest !== spell) {
      return {
        fail: {
          ok: false,
          reason: 'в бою действует высшая степень: ' + highest['название'],
        },
      };
    }
    // Пул действий по атрибуту (Интеллект/Мудрость) — с юнита (Д-C).
    const pools = poolsOf(c, u);
    const poolKey = ATTR_POOL[spell['атрибут']];
    if (pools[poolKey] <= 0) {
      return {
        fail: {
          ok: false,
          reason: 'действий «Заклинание» (' + ATTR_NAME[spell['атрибут']]
            + ') больше нет',
        },
      };
    }
    const free = isAllyFreeCast(u, spellId);
    if (!free && u.mp < spell['мани']) {
      return { fail: { ok: false, reason: 'не хватает маны (' + spell['мани'] + ')' } };
    }
    // Цель (для урона/ослабления/контроля): аргумент, иначе
    // ближайший МОБ от u (Д-M).
    let t = null;
    if (TARGETED.has(spell['действие'])) {
      t = targetId ? c.units.find((x) => x.id === targetId)
        : nearestMobFor(c, u);
      // Союзник — не цель (000080): своя сторона — «нет цели».
      if (!t || !t.alive || t.fled || t.side === 'ally') {
        return { fail: { ok: false, reason: 'нет цели' } };
      }
      if (rectDistOf(u, t) > SPELL_MAX_DIST) {
        return { fail: { ok: false, reason: 'цель слишком далеко (дальность 4)' } };
      }
    } else if (spell['действие'] === 'воскрешение') {
      // 000163-зеркало: явный targetId — ТОЛЬКО мёртвый СОЮЗНИК
      // c.units (side 'ally', !alive, !fled); без targetId — автоцель:
      // мёртвый ИГРОК приоритетно, иначе первый мёртвый союзник.
      // Дальность НЕ ограничена (спасательная механика).
      if (targetId) {
        const x = c.units.find((y) => y.id === targetId);
        if (!(x && x.side === 'ally' && !x.alive && !x.fled)) {
          return { fail: { ok: false, reason: 'нет цели' } };
        }
        t = x;
      } else if (!c.player.alive) {
        t = c.player; // мёртвый игрок — приоритет автоцели
      } else {
        t = c.units.find((x) => x.side === 'ally' && !x.alive
          && !x.fled) || null;
        if (!t) return { fail: { ok: false, reason: 'нет цели' } };
      }
    }
    // лечение/защита — СЕБЕ (t = u; Д-F — как пайплайн игрока).
    return { ok: true, spell, pools, poolKey, t, free };
  }

  // --- Практика (000117-зеркало; ленивое Game.efir; ПРАКТИКА ТОЛЬКО
  // У ЭФИРА): PRACTICE_XP лениво через Game.combat, fallback 3.
  // practiceEfir для чужих навыков (meditation/nature — вне пула
  // EFIR_SKILLS) — no-op по своему guardу (efir.js). Возврат
  // {skill, xp} | null.
  function practiceFor(c, u, spell) {
    if (u.kind !== 'efir' || !c.efirState) return null;
    const G = (typeof globalThis !== 'undefined') ? globalThis.Game : null;
    const f = G && G.efir && G.efir.practiceEfir;
    if (typeof f !== 'function') return null;
    const skill = PRACTICE_BY_SCHOOL[spell['школа']];
    if (!skill) return null;
    const px = G && G.combat && G.combat.PRACTICE_XP
      && G.combat.PRACTICE_XP.spell;
    const amount = (typeof px === 'number' && px > 0) ? px : 3;
    f(c.efirState, skill, amount);
    return { skill, xp: amount };
  }

  // --- Каст из книги союзника (зеркало castSpell spells.js
  // L416-499): расход — poolsOf −1 + u.mp −мани (слот действия НЕ
  // трогается, Д-D; пул/мана ИГРОКА не тратятся). Возврат — shape
  // castSpell (суперсет): {ok:true, spell, dmg?, killed?, healed?,
  // hp?, shield?, weakened?, bound?, practice?}; отказ —
  // {ok:false, reason} (причины — evalAllySpell).
  function castAllySpell(c, u, spellId, targetId) {
    const ev = evalAllySpell(c, u, spellId, targetId);
    if (ev.fail) return ev.fail;
    const I = getInternals();
    const { spell, pools, poolKey, t, free } = ev;
    pools[poolKey] -= 1;
    if (!free) u.mp -= spell['мани'];
    const out = { ok: true, spell };
    const attrVal = ((u.attrs && u.attrs[spell['атрибут']]) || 0);
    switch (spell['действие']) {
      case 'урон': {
        // Заклинание: всегда попадает, игнорирует броню моба.
        // Бонус школы: Эфир — 0.05·уровень лорда (СНАПШОТ u.efirSkills,
        // как у K, 000117); наёмник и школы без бонуса (тень/природа/
        // исцеление) — 0.
        let bonus = 0;
        if (u.kind === 'efir' && u.efirSkills
            && (spell['школа'] === 'огонь' || spell['школа'] === 'лёд')) {
          const lord = (spell['школа'] === 'лёд') ? 'icelord' : 'firelord';
          bonus = 0.05 * (u.efirSkills[lord] || 0);
        }
        const dmg = Math.round(
          (4 + 0.5 * attrVal)
          * (1 + 0.15 * (spell['степень'] - 1)) * (1 + bonus));
        const r = I.dealDamageToMob(c, t, dmg, true);
        // 000118-паттерн (em-dash U+2014); наёмник — параллель
        // (u.name вместо «Эфир»).
        I.log(c, `${u.name}: «${spell['название']}» — ${t.name}: ${r.dmg}.`);
        out.dmg = r.dmg;
        out.killed = r.killed;
        break;
      }
      case 'лечение': {
        // Себе (t = u, Д-F); формула 1:1 (у игрока p.level — u.level,
        // p.primary[attr] — u.attrs[attr]). В лог — вычисленное
        // значение (паттерн 000168); факт — out.healed.
        const amount = Math.round(
          (4 + 0.5 * attrVal + (u.level || 0))
          * (1 + 0.15 * (spell['степень'] - 1)));
        const healed = I.healAlly(c, u, amount);
        I.log(c, `${u.name} лечит себя (+${amount}).`);
        out.healed = healed;
        out.hp = u.hp;
        break;
      }
      case 'защита': {
        // Временная броня союзника (000193 §4): держится ровно 3
        // раунда, включая раунд каста; тик — startRound; поглощение —
        // dealDamageToAlly (плоское, до 0).
        u.shield = { armor: 1 + spell['степень'], turns: 3 };
        I.log(c, `${u.name}: «${spell['название']}» — `
          + `+${u.shield.armor} брони на 3 раунда.`);
        out.shield = { armor: u.shield.armor, turns: u.shield.turns };
        break;
      }
      case 'ослабление': {
        // Урон моба ×0.75 на 3 его атаки (тик ядра, combat.js).
        t.weaken = { mult: 0.75, turns: 3 };
        I.log(c, `${t.name} ослаблен (${spell['название']}).`);
        out.weakened = t.id;
        break;
      }
      case 'контроль': {
        // Сковывание: моб пропускает ровно одно действие (ядро).
        t.bind = { turns: 1 };
        I.log(c, `${t.name} скован (${spell['название']}).`);
        out.bound = t.id;
        break;
      }
      case 'воскрешение': {
        // 000163: ядро combat.js resurrectAlly (alive, hp=round(
        // maxHP/2), лог «Возвращён в бой.»); цель — из evalAllySpell.
        out.hp = I.resurrectAlly(c, t);
        break;
      }
      default:
        // Недостижимо: evalAllySpell уже отказывает в неизвестном
        // действии ДО расхода (000037). Страховка.
        return { ok: false, reason: 'неизвестное действие: ' + spell['действие'] };
    }
    const pr = practiceFor(c, u, spell);
    if (pr) out.practice = pr;
    return out;
  }

  // canCastAllySpell (зеркало canCastSpell 000037): чистый
  // предпросмотр строки книги — те же причины, что castAllySpell,
  // БЕЗ побочных эффектов (пул/мана/лог/c._rng не трогаются).
  // UI: rowChk/canDo (000193).
  function canCastAllySpell(c, u, spellId, targetId) {
    const ev = evalAllySpell(c, u, spellId, targetId);
    if (ev.fail) return ev.fail;
    return { ok: true };
  }

  return { castAllySpell, canCastAllySpell };
});

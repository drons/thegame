// Боевая система: мини-карта боя, пошаговые ходы (SPEC.md, разделы
// «Боевая система» и «Мобы»).
//
// Чистое ядро без DOM — тестируется в node (tests/combat.test.js).
// Все случайности идут через combat._rng (mulberry32), поэтому бой
// детерминирован при фиксированном сиде.
//
// Униформный модуль: в браузере — globalThis.Game, в node — require().
// Зависимости: perlin.js (mulberry32), player.js (derived/takeDamage/heal/addXp).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./perlin.js'), require('./player.js'));
  } else {
    root.Game = Object.assign({}, root.Game,
      factory(typeof root.Game === 'object' ? root.Game : {}, root.Game));
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function (perlin, P) {

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
  // dmg/hp — множители базовых значений (растущих с уровнем),
  // armor — базовая броня, fast — 2 шага за ход, traits — боевые черты.
  const MOB_TYPES = {
    // Орки
    orc_grunt:      { name: 'Орк-шестёрка', role: 'melee', aggro: 'aggressive', dmg: 1.0, hp: 1.0 },
    orc_warrior:    { name: 'Орк-воин', role: 'shield', aggro: 'aggressive', dmg: 1.1, hp: 1.4, armor: 1 },
    orc_archer:     { name: 'Орк-лучник', role: 'ranged', aggro: 'aggressive', dmg: 0.9, hp: 0.9 },
    orc_shaman:     { name: 'Орк-шаман', role: 'support', aggro: 'timid', dmg: 0.5, hp: 0.7 },
    orc_rider:      { name: 'Орк-наездник на волке', role: 'melee', aggro: 'aggressive', dmg: 1.1, hp: 1.0, fast: true },
    orc_mad:        { name: 'Орк-бешеный', role: 'melee', aggro: 'aggressive', dmg: 1.4, hp: 0.7 },
    orc_captain:    { name: 'Орк-капитан', role: 'leader', aggro: 'aggressive', dmg: 1.3, hp: 1.5 },
    orc_chief:      { name: 'Орк-вождь', role: 'leader', aggro: 'aggressive', dmg: 1.6, hp: 2.0 },
    // Нежить
    skeleton:       { name: 'Скелет', role: 'melee', aggro: 'neutral', dmg: 0.8, hp: 0.8 },
    skeleton_archer:{ name: 'Скелет-лучник', role: 'ranged', aggro: 'aggressive', dmg: 0.8, hp: 0.8 },
    crawling_bones: { name: 'Ползучие кости', role: 'swarm', aggro: 'aggressive', dmg: 0.5, hp: 0.5 },
    giant_larva:    { name: 'Личинка падальщика', role: 'melee', aggro: 'territorial', dmg: 1.0, hp: 1.0 },
    vampire:        { name: 'Вампир', role: 'melee', aggro: 'aggressive', dmg: 1.2, hp: 1.1, traits: { lifesteal: true } },
    rot:            { name: 'Гниль', role: 'melee', aggro: 'aggressive', dmg: 0.9, hp: 0.9, traits: { poison: true } },
    bone_coloss:    { name: 'Костяной колосс', role: 'shield', aggro: 'territorial', dmg: 1.3, hp: 2.5, armor: 2 },
    // Дикие звери
    wolf:           { name: 'Волк', role: 'melee', aggro: 'neutral', dmg: 0.7, hp: 0.8 },
    wolf_pack:      { name: 'Волчья стая', role: 'swarm', aggro: 'territorial', dmg: 0.7, hp: 0.8 },
    boar:           { name: 'Казённый вепрь', role: 'melee', aggro: 'neutral', dmg: 1.0, hp: 1.5 },
    cave_bear:      { name: 'Пещерный медведь', role: 'shield', aggro: 'territorial', dmg: 1.3, hp: 2.0, armor: 1 },
    spider:         { name: 'Гигантский паук', role: 'swarm', aggro: 'territorial', dmg: 0.8, hp: 0.8, traits: { poison: true } },
    troll:          { name: 'Тролль', role: 'leader', aggro: 'neutral', dmg: 1.5, hp: 2.5 },
    // Насекомые
    ant:            { name: 'Пещерный муравей', role: 'swarm', aggro: 'territorial', dmg: 0.5, hp: 0.5 },
    ant_queen:      { name: 'Матка', role: 'leader', aggro: 'territorial', dmg: 1.0, hp: 2.0 },
    scorpion:       { name: 'Скорпион', role: 'melee', aggro: 'neutral', dmg: 0.9, hp: 0.9, traits: { poison: true } },
    centipede:      { name: 'Многоножка', role: 'melee', aggro: 'aggressive', dmg: 1.0, hp: 0.9, fast: true },
    // Стихийники и магия
    fire_elemental: { name: 'Огненный стихийник', role: 'melee', aggro: 'aggressive', dmg: 1.3, hp: 1.1 },
    water_elemental:{ name: 'Водный стихийник', role: 'melee', aggro: 'neutral', dmg: 1.0, hp: 1.4, traits: { regen: true } },
    wind_elemental: { name: 'Ветряной стихийник', role: 'ranged', aggro: 'neutral', dmg: 0.9, hp: 0.9, fast: true },
    earth_elemental:{ name: 'Земляной стихийник', role: 'shield', aggro: 'neutral', dmg: 1.0, hp: 3.0, armor: 2 },
    imp:            { name: 'Имп', role: 'ranged', aggro: 'aggressive', dmg: 0.7, hp: 0.7 },
    salamander:     { name: 'Саламандра', role: 'melee', aggro: 'territorial', dmg: 1.1, hp: 1.2 },
    fairy:          { name: 'Фея', role: 'support', aggro: 'timid', dmg: 0.4, hp: 0.6 },
    stone_golem:    { name: 'Каменный голем', role: 'shield', aggro: 'territorial', dmg: 1.2, hp: 2.5, armor: 2 },
    // Бездна
    lower_demon:    { name: 'Низший демон', role: 'melee', aggro: 'aggressive', dmg: 1.4, hp: 1.3 },
    succubus:       { name: 'Суккуб', role: 'support', aggro: 'aggressive', dmg: 0.6, hp: 0.8, traits: { debuff: true } },
    abomination:    { name: 'Уродство', role: 'leader', aggro: 'aggressive', dmg: 1.7, hp: 2.5 },
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
  const SPELL_MAX_DIST = 4;
  const POISON_CHANCE = 0.3;
  const POISON_TICK = 2;      // урона за ход
  const POISON_TURNS = 2;     // сколько ходов держится
  const FLEE_HP_FRAC = 0.3;   // пугливые убегают ниже 30% HP

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // Вероятность попадания (чистая функция — тестируется отдельно).
  function hitChance(atkLevel, atkBonus, defLevel, defDodge) {
    return clamp(0.55 + 0.03 * (atkLevel - defLevel) + (atkBonus || 0) - (defDodge || 0), 0.05, 0.95);
  }

  function makeMob(mobId, level, idx, hasLeader) {
    const t = MOB_TYPES[mobId];
    const hpRoleMult = { swarm: 0.6, support: 0.7, shield: 1.8, leader: 1.8 }[t.role] || 1.0;
    const maxHP = Math.max(1, Math.round((8 + 4 * level) * t.hp * hpRoleMult));
    const damage = Math.max(1, Math.round((2 + 0.7 * level) * t.dmg * (hasLeader ? LEADER_DMG_MULT : 1)));
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
      x: 0,
      y: 0,
      alive: true,
      fled: false,
      traits: Object.assign({
        poison: false, lifesteal: false, regen: false, debuff: false,
      }, t.traits),
    };
  }

  function unitAt(c, x, y) {
    return c.units.find((u) => u.alive && !u.fled && u.x === x && u.y === y);
  }

  function inBounds(c, x, y) {
    return x >= 0 && y >= 0 && x < c.width && y < c.height;
  }

  function dist(ax, ay, bx, by) {
    return Math.abs(ax - bx) + Math.abs(ay - by);
  }

  function nearestMob(c) {
    let best = null;
    for (const u of c.units) {
      if (!u.alive || u.fled) continue;
      if (!best || dist(c.px, c.py, u.x, u.y) < dist(c.px, c.py, best.x, best.y)) best = u;
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
  function stepToward(c, u) {
    const dx = c.px - u.x;
    const dy = c.py - u.y;
    const tries = (Math.abs(dx) >= Math.abs(dy)
      ? [[Math.sign(dx), 0], [0, Math.sign(dy)]]
      : [[0, Math.sign(dy)], [Math.sign(dx), 0]]).filter(([a, b]) => a !== 0 || b !== 0);
    for (const [sx, sy] of tries) {
      const nx = u.x + sx, ny = u.y + sy;
      if (!inBounds(c, nx, ny) || unitAt(c, nx, ny)) continue;
      u.x = nx; u.y = ny;
      return true;
    }
    return false;
  }

  // Один шаг от игрока (паника, отступление).
  function stepAway(c, u) {
    const tries = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (const [sx, sy] of tries) {
      const nx = u.x + sx, ny = u.y + sy;
      if (!inBounds(c, nx, ny) || unitAt(c, nx, ny)) continue;
      if (dist(nx, ny, c.px, c.py) > dist(u.x, u.y, c.px, c.py)) {
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
    dmg = Math.max(0, Math.round(dmg) - d.armor);
    if (dmg > 0) P.takeDamage(p, dmg);
    if (!p.alive) {
      // «Несокрушимость»: шанс выжить смертельный удар (раз в день ≈ в бою).
      if (d.survivalChance > 0 && !c._unkillUsed && c._rng() < d.survivalChance) {
        p.alive = true;
        p.hp = 1;
        c._unkillUsed = true;
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
    const xp = killed.reduce((s, u) => s + Math.round(8 + 4 * u.level), 0);
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
    if (c.ps.attack <= 0) return { ok: false, reason: 'действий «Удар» больше нет' };
    const t = targetId ? c.units.find((u) => u.id === targetId) : nearestMob(c);
    if (!t || !t.alive || t.fled) return { ok: false, reason: 'нет цели' };
    if (dist(c.px, c.py, t.x, t.y) > 1) return { ok: false, reason: 'цель слишком далеко (ближний бой)' };
    c.ps.attack -= 1;
    const p = c.player;
    const d = P.derived(p);
    const base = 3 + Math.floor(p.primary.strength * 0.8) + Math.floor(p.level * 0.5);
    const dmg = base * (1 + d.fistDamageBonus + d.heavyDamageBonus);
    if (c._rng() >= hitChance(p.level, d.swordHitBonus, t.level, 0)) {
      log(c, `Вы промахнулись (${t.name}).`);
      return { ok: true, hit: false, dmg: 0 };
    }
    const r = dealDamageToMob(c, t, dmg);
    log(c, `Вы бьёте ${t.name}: ${r.dmg}.`);
    return { ok: true, hit: true, ...r };
  }

  function playerSpell(c, school, targetId) {
    const why = checkTurn(c);
    if (why) return { ok: false, reason: why };
    const p = c.player;
    const d = P.derived(p);
    if (school === 'fire') {
      if (c.ps.spellInt <= 0) return { ok: false, reason: 'действий «Заклинание» (Интеллект) больше нет' };
      if (p.mp < 3) return { ok: false, reason: 'не хватает маны (3)' };
      const t = targetId ? c.units.find((u) => u.id === targetId) : nearestMob(c);
      if (!t || !t.alive || t.fled) return { ok: false, reason: 'нет цели' };
      if (dist(c.px, c.py, t.x, t.y) > SPELL_MAX_DIST) return { ok: false, reason: 'цель слишком далеко (дальность 4)' };
      c.ps.spellInt -= 1;
      p.mp -= 3;
      // Заклинание: всегда попадает, игнорирует броню.
      const dmg = Math.round((3 + 0.5 * p.primary.intelligence) * (1 + d.fireDamageBonus));
      const r = dealDamageToMob(c, t, dmg, true);
      log(c, `Огненная стрела по ${t.name}: ${r.dmg}.`);
      return { ok: true, dmg: r.dmg, killed: r.killed };
    }
    if (school === 'heal') {
      if (c.ps.spellWis <= 0) return { ok: false, reason: 'действий «Заклинание» (Мудрость) больше нет' };
      if (p.mp < 3) return { ok: false, reason: 'не хватает маны (3)' };
      c.ps.spellWis -= 1;
      p.mp -= 3;
      const amount = Math.round(3 + 0.5 * p.primary.wisdom + p.level);
      const hp = P.heal(p, amount);
      log(c, `Исцеление: ${hp}.`);
      return { ok: true, hp };
    }
    return { ok: false, reason: 'неизвестная школа' };
  }

  function playerBlock(c) {
    const why = checkTurn(c);
    if (why) return { ok: false, reason: why };
    if (c.ps.block <= 0) return { ok: false, reason: 'действий «Блок» больше нет' };
    // Только как последнее действие хода.
    const others = c.ps.attack + c.ps.spellInt + c.ps.spellWis + c.ps.quickItem + c.ps.invItem;
    if (others > 0) return { ok: false, reason: 'блок — только последнее действие' };
    c.ps.block -= 1;
    c.ps.blocked = true;
    log(c, 'Вы ставите блок.');
    return { ok: true };
  }

  function playerMove(c, dx, dy) {
    const why = checkTurn(c);
    if (why) return { ok: false, reason: why };
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

  // Запасные действия под инвентарь (задача 000009): пулы есть, предметов пока нет.
  function playerQuickItem(c) {
    const why = checkTurn(c);
    if (why) return { ok: false, reason: why };
    if (c.ps.quickItem <= 0) return { ok: false, reason: 'действий «Быстрый предмет» больше нет' };
    return { ok: false, reason: 'быстрых предметов пока нет (инвентарь — задача 000009)' };
  }

  function playerInvItem(c) {
    const why = checkTurn(c);
    if (why) return { ok: false, reason: why };
    if (c.ps.invItem <= 0) return { ok: false, reason: 'действий «Предмет из инвентаря» больше нет' };
    return { ok: false, reason: 'инвентарь пока пуст (задача 000009)' };
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
    const dToP = dist(u.x, u.y, c.px, c.py);

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
            if (dist(u.x, u.y, c.px, c.py) <= 1) break;
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
   * @param {number} [opts.levelDeltaMax=3] разброс уровня мобов (SPEC: N)
   */
  function createCombat(opts) {
    const p = opts.player;
    const rng = opts.rng || mulberry32(opts.seed != null ? opts.seed : 12345);
    const N = opts.levelDeltaMax != null ? opts.levelDeltaMax : 3;
    const width = opts.width || 7;
    const height = opts.height || 7;

    // Уровень группы = уровень персонажа + дельта [-N; +N] — «в среднем
    // можно победить» (SPEC.md).
    const delta = Math.floor(rng() * (2 * N + 1)) - N;
    const level = Math.max(1, p.level + delta);
    const recipe = GROUP_RECIPES[opts.groupType];
    if (!recipe) throw new Error('неизвестный тип группы: ' + opts.groupType);

    let ids = recipe.mobs.slice();
    if (recipe.count) {
      const n = recipe.count[0] + Math.floor(rng() * (recipe.count[1] - recipe.count[0] + 1));
      ids = new Array(n).fill(recipe.mobs[0]);
    }
    const hasLeader = ids.some((id) => MOB_TYPES[id].role === MOB_ROLES.LEADER);
    const units = ids.map((mobId, i) => makeMob(mobId, level, i, hasLeader));

    // Мобы — в верхней части, игрок — в центре нижнего края.
    const xs = [1, 3, 5, 0, 2, 4];
    units.forEach((u, i) => { u.x = xs[i % xs.length]; u.y = i < 3 ? 0 : 1; });

    const c = {
      player: p,
      width,
      height,
      groupType: opts.groupType,
      groupName: opts.groupName || recipe.name,
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
      _unkillUsed: false,
    };
    refillPools(c);
    log(c, `Бой: ${opts.groupName || recipe.name} (уровень ${level}, мобы ${units.length}).`);
    if (hasLeader) log(c, 'Лидер вдохновляет группу: +5% урона, +5% защиты.');
    c.targetId = (nearestMob(c) || {}).id || null;

    // Публичные действия.
    c.attack = (targetId) => playerAttack(c, targetId);
    c.spell = (school, targetId) => playerSpell(c, school, targetId);
    c.block = () => playerBlock(c);
    c.move = (dx, dy) => playerMove(c, dx, dy);
    c.flee = () => playerFlee(c);
    c.quickItem = () => playerQuickItem(c);
    c.invItem = () => playerInvItem(c);
    c.selectTarget = (targetId) => playerSelectTarget(c, targetId);
    c.endTurn = () => endPlayerTurn(c);
    return c;
  }

  return {
    MOB_ROLES, ROLE_NAMES, AGGRO, MOB_TYPES, GROUP_RECIPES,
    LEADER_DMG_MULT, LEADER_DEF_MULT,
    hitChance, createCombat,
  };
});

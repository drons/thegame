const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCombat } = require('../src/combat.js');
const { createCharacter, derived } = require('../src/player.js');

// 000271: красные тесты потребителя «Застращивание» (fearChance) —
// playerAttack: попадание по ЖИВОМУ мому уровнем НИЖЕ героя при
// fearChance > 0 — бросок страха (гейт ДО броска), при успехе t.fled
// (семантика TIMID: без лута/опыта, из targeting). Контракт:
// memory/000271-fright-consumer.md §5 (карта FR-1…FR-8).
function spells() { return require('../src/spells.js'); }

// Сильный персонаж для контролируемых сценариев (не умирает сам).
function strongHero() {
  const c = createCharacter();
  c.primary.constitution = 50;
  c.hp = 9999;
  return c;
}

// Герой фикстуры FR-1…FR-8: L5; инициатива 12 (Ловкость 1 + Интеллект
// 11) > волк 3 — игрок первый (ассерт в FR-1); Сила 10 — attackActions
// 2 (FR-3: удар + повторный по сбежавшему за ОДИН ход, пин гварды
// «нет цели»); базовый урон без оружия 3 + 8 + 2 = 13.
function fearHero(fright) {
  const p = strongHero();
  p.level = 5;
  p.primary.intelligence = 11;
  p.primary.strength = 10;
  p.secondary.fright = fright;
  return p;
}

// Ставит игрока вплотную к живому мобо (копия хелпера
// tests/combat.test.js — изолированный запуск).
function standNextTo(c, u) {
  const w = (u.size && u.size.w) || 1, h = (u.size && u.size.h) || 1;
  const taken = (x, y) => c.units.some((v) => v.alive && !v.fled
    && x >= v.x && x < v.x + ((v.size && v.size.w) || 1)
    && y >= v.y && y < v.y + ((v.size && v.size.h) || 1));
  const candidates = [];
  for (let x = u.x - 1; x <= u.x + w; x++) {
    candidates.push([x, u.y - 1], [x, u.y + h]);
  }
  for (let y = u.y; y < u.y + h; y++) {
    candidates.push([u.x - 1, y], [u.x + w, y]);
  }
  const near = (x, y) => {
    const dx = x < u.x ? u.x - x : (x > u.x + w - 1 ? x - (u.x + w - 1) : 0);
    const dy = y < u.y ? u.y - y : (y > u.y + h - 1 ? y - (u.y + h - 1) : 0);
    return dx + dy <= 1;
  };
  const spot = candidates.find(([x, y]) =>
    x >= 0 && y >= 0 && x < c.width && y < c.height && !taken(x, y)
    && !(c.obstacles && c.obstacles.has(x + ',' + y)) && near(x, y));
  assert.ok(spot, 'нет свободной клетки рядом с мобом');
  c.px = spot[0];
  c.py = spot[1];
}

// Ставит моба на свободную клетку вплотную к игроку (FR-3: оба волка
// в дальности ближнего боя).
function standNextToPlayer(c, u) {
  const taken = (x, y) => c.units.some((v) => v !== u && v.alive && !v.fled
    && x >= v.x && x < v.x + ((v.size && v.size.w) || 1)
    && y >= v.y && y < v.y + ((v.size && v.size.h) || 1));
  const cand = [[c.px + 1, c.py], [c.px - 1, c.py],
    [c.px, c.py + 1], [c.px, c.py - 1]];
  const spot = cand.find(([x, y]) => x >= 0 && y >= 0
    && x < c.width && y < c.height && !taken(x, y)
    && !(c.obstacles && c.obstacles.has(x + ',' + y)));
  assert.ok(spot, 'нет свободной клетки вплотную к игроку');
  u.x = spot[0];
  u.y = spot[1];
}

// Драйвер seed-детерминизма (FR-7): один удар за ход (авто-цель)
// до исхода; детерминирован при фиксированном seed.
function playToResult(c, maxSteps = 512) {
  let n = 0;
  while (!c.result && n++ < maxSteps) {
    if (c.ps.attack > 0) c.attack(undefined);
    if (!c.result) c.endTurn();
  }
  assert.ok(c.result, 'бой не завершился за ' + maxSteps + ' шагов');
}

// Снимок для сравнения двух проgonов (FR-7): исход, длина лога,
// пер-юнит {id, fled, alive, hp, x, y}.
function snap(c) {
  return {
    result: c.result,
    logLen: c.log.length,
    units: c.units.map((u) => ({
      id: u.id, fled: u.fled, alive: u.alive, hp: u.hp, x: u.x, y: u.y,
    })),
  };
}

test('000271-FR-1: «Застращивание»: моб уровнем НИЖЕ героя при fearChance > 0 — fled + лог + checkVictory (красный)', () => {
  const p = fearHero(15);
  assert.equal(derived(p).fearChance, 0.75,
    'фикстура: fearChance = min(0.75, 0.05·15) = 0.75');
  const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 1, seed: 13 });
  assert.equal(c.phase, 'player', 'фикстура: игрок первый (инициатива 12 > 3)');
  const w = c.units[0];
  standNextTo(c, w);
  // hp 200: удар (13) не летален — цель ЖИВА после попадания (гейт
  // t.alive); волк L1 aggro neutral — не timid, fled ТОЛЬКО от механизма.
  w.maxHP = 200;
  w.hp = 200;
  c._rng = () => 0.01; // 0.01 < 0.67 (hitChance L5→L1) — попадание;
  // 0.01 < 0.75 — fear-бросок успешен (невакуантность — константа).
  const atk = c.attack(w.id);
  assert.equal(atk.ok, true, 'удар — ok');
  assert.equal(atk.hit, true, 'попадание (0.01 < 0.67)');
  assert.equal(w.fled, true,
    'RED: потребитель fearChance отсутствует — моб не паникует');
  assert.ok(c.log.some((s) => s.includes('в панике убегает')),
    'лог: «…в панике убегает!»');
  assert.equal(c.phase, 'over',
    'checkVictory: одиночная группа fled — бой кончился');
});

test('000271-FR-2: вся группа fled — result {fled, by:«mobs», xp:0, gold:0, defeated:0} и ровно 2 c._rng (красный)', () => {
  const p = fearHero(15);
  const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 1, seed: 13 });
  const w = c.units[0];
  standNextTo(c, w);
  w.maxHP = 200;
  w.hp = 200;
  let calls = 0;
  c._rng = () => { calls += 1; return 0.01; };
  const atk = c.attack(w.id);
  assert.equal(atk.ok, true, 'удар — ok');
  assert.equal(w.fled, true, 'RED: моб сбежал');
  // РОВНО 5 ПОЛЕЙ (000278: +by — происхождение 'fled'-исхода):
  // items/allyXp/efirXp НЕТ (обработчик конца боя гвардит
  // outcome === 'victory').
  assert.deepEqual(c.result,
    { outcome: 'fled', by: 'mobs', xp: 0, gold: 0, defeated: 0 },
    'fled — без лута/опыта (TIMID-семантика, checkVictory); '
    + 'by:«mobs» — сбежали ВРАГИ (000278)');
  assert.ok(c.log.includes('Противники разбежались.'),
    'лог: «Противники разбежались.»');
  assert.equal(calls, 2,
    'ровно 2 c._rng: hit-ролл + fear-ролл («fled»-ветка checkVictory — 0)');
});

test('000271-FR-3: смежная группа — бой продолжается; fled вне targeting/лоота/опыта (красный)', () => {
  const p = fearHero(15);
  const c = createCombat({ player: p, mobs: ['wolf', 'wolf'], mobLevel: 1, seed: 13 });
  c.obstacles.clear();
  const w1 = c.units[0], w2 = c.units[1];
  // Позиции ЭКСПЛИЦИТНО: оба волка в ближней дальности игрока.
  w1.x = 3; w1.y = 2;
  w2.x = 4; w2.y = 2;
  standNextTo(c, w1);
  standNextToPlayer(c, w2);
  w1.maxHP = 200; w1.hp = 200;
  w2.maxHP = 200; w2.hp = 200;
  c._rng = () => 0.01;
  const atk1 = c.attack(w1.id);
  assert.equal(atk1.ok, true, 'удар 1 — ok');
  assert.equal(atk1.hit, true, 'попадание');
  assert.equal(w1.fled, true, 'RED: первый волк сбежал');
  assert.equal(c.result, null, 'бой жив: остался второй волк');
  assert.equal(c.phase, 'player');
  // attackActions = 2 (Сила 10) — повторный удар в том же ходе.
  const re = c.attack(w1.id);
  assert.deepEqual(re, { ok: false, reason: 'нет цели' },
    'fled-моб — не цель (guard playerAttack)');
  // ЛЕТАЛЬНЫЙ удар по второму: иже-уровневый гейт (L1 < L5, 0.75)
  // заставил бы и его сбежать → исход стал бы «fled», а не «victory».
  w2.hp = 1;
  const atk2 = c.attack(w2.id);
  assert.equal(atk2.ok, true, 'удар 2 — ok');
  assert.equal(atk2.hit, true, 'попадание');
  assert.equal(c.result.outcome, 'victory', 'killed + fled → victory');
  assert.equal(c.result.defeated, 1, 'fled НЕ в killed (только !alive)');
  assert.equal(c.result.xp, 12, 'опыт ТОЛЬКО за убитого: round(8 + 4·1)');
  assert.equal(c.result.gold, 5, 'gold: round(3 + 2·1 + 0.01·1)');
  assert.ok(Array.isArray(c.result.items),
    'items — массив (формула лута — чужой контракт)');
});

test('000271-FR-4: гейт уровня — РАВНЫЙ/выший уровень не сбегает, ровно 1 c._rng (guard)', () => {
  const mk = (mobLevel) => {
    const p = fearHero(15);
    const c = createCombat({ player: p, mobs: ['wolf'], mobLevel, seed: 13 });
    const w = c.units[0];
    standNextTo(c, w);
    w.maxHP = 200;
    w.hp = 200;
    let calls = 0;
    c._rng = () => { calls += 1; return 0.01; };
    const atk = c.attack(w.id);
    return { atk, w, calls };
  };
  for (const mobLevel of [5, 6]) {
    const { atk, w, calls } = mk(mobLevel);
    assert.equal(atk.ok, true, `L${mobLevel}: удар — ok`);
    assert.equal(atk.hit, true, `L${mobLevel}: попадание`);
    assert.ok(!w.fled, `L${mobLevel}: t.level ${mobLevel} !< p.level 5 — не паникует`);
    assert.equal(w.alive, true, `L${mobLevel}: моб жив`);
    assert.equal(calls, 1,
      `L${mobLevel}: ровно 1 c._rng — уровень-предикат ДО броска`);
  }
});

test('000271-FR-5: детерминизм-гейт — без навыка: fear-ролла нет, ровно 1 c._rng (guard)', () => {
  const p = fearHero(0);
  assert.equal(derived(p).fearChance, 0, 'фикстура: без навыка — fearChance 0');
  const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 1, seed: 13 });
  const w = c.units[0];
  standNextTo(c, w);
  w.maxHP = 200;
  w.hp = 200;
  let calls = 0;
  c._rng = () => { calls += 1; return 0.01; };
  const atk = c.attack(w.id);
  assert.equal(atk.ok, true, 'удар — ok');
  assert.equal(atk.hit, true, 'попадание');
  assert.ok(!w.fled, 'не сбегает');
  assert.equal(w.alive, true, 'моб жив');
  assert.equal(calls, 1,
    'ровно 1 c._rng (hit-ролл) — fear-ветки нет: базовые сценарии бит-в-бит');
});

test('000271-FR-6: убивающий удар — труп НЕ сбегает, исход victory (guard)', () => {
  const p = fearHero(15);
  const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 1, seed: 13 });
  const w = c.units[0];
  standNextTo(c, w);
  w.hp = 1; // летальный
  c._rng = () => 0.01;
  const atk = c.attack(w.id);
  assert.equal(atk.ok, true, 'удар — ok');
  assert.equal(atk.hit, true, 'попадание');
  assert.equal(w.alive, false, 'труп');
  assert.ok(!w.fled, 'труп не паникует (гейт t.alive ДО броска)');
  assert.equal(c.result.outcome, 'victory', 'НЕ «fled» — моб УБИТ');
  assert.equal(c.result.defeated, 1);
});

test('000271-FR-7: seed-детерминизм — два прогона с одинаковым seed идентичны (guard)', () => {
  const run = () => {
    const p = fearHero(15);
    const c = createCombat({
      player: p, mobs: ['wolf', 'wolf'], mobLevel: 1, seed: 4242,
    });
    playToResult(c); // ЕСТЕСТВЕННЫЙ rng: fear-роллы внутри потока
    return snap(c);
  };
  assert.deepEqual(run(), run(),
    '2 прогона (тот же seed) — идентичный снимок {result, log, юниты}');
});

test('000271-FR-8: одно попадание — вампиризм ПЕРЕД паникой (порядок логов, красный)', () => {
  const { castSpell } = spells();
  const p = fearHero(15);
  p.spells = ['vampire_touch'];
  p.mp = 40;
  const maxhp = derived(p).maxHP;
  p.hp = maxhp - 30;
  const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 1, seed: 13 });
  const w = c.units[0];
  standNextTo(c, w);
  w.armor = 1; // dmg 13 − 1 = 12 — чётный, heal round(0.5·12) = 6
  w.maxHP = 200;
  w.hp = 200;
  const r = castSpell(c, 'vampire_touch');
  assert.equal(r.ok, true, 'каст vampire_touch — ok');
  assert.deepEqual(c.ps.buff, { stat: 'вампиризм', value: 0.5, turns: 3 });
  const hp0 = p.hp;
  c._rng = () => 0.01;
  const atk = c.attack(w.id);
  assert.equal(atk.ok, true, 'удар — ok');
  assert.equal(atk.hit, true, 'попадание');
  assert.equal(p.hp - hp0, Math.round(0.5 * atk.dmg),
    'вампиризм ПРОИШЁЛ: heal round(0.5·факт)');
  assert.equal(w.fled, true,
    'RED: flee ПРОИШЁЛ в том же попадании (потребитель отсутствует)');
  const iVamp = c.log.findIndex((s) => s.includes('Вампиризм: +'));
  const iPanic = c.log.findIndex((s) => s.includes('в панике убегает'));
  assert.ok(iVamp >= 0, 'лог: «Вампиризм: +…»');
  assert.ok(iPanic >= 0, 'лог: «…в панике убегает!»');
  assert.ok(iVamp < iPanic,
    'порядок: хил ПЕРЕД паникой (вставка ПОСЛЕ вамп-блока)');
});

test('000271-FR-9: endTurn с fled-мобом — 0 атак/действий (гвард mobAct + серый слот advanceQueue; абсолютный пин, которого FR-7 не ловит) (зелёный)', () => {
  const p = fearHero(15);
  const c = createCombat({ player: p, mobs: ['wolf', 'wolf'], mobLevel: 1, seed: 13 });
  c.obstacles.clear();
  const w1 = c.units[0], w2 = c.units[1];
  // Позиции ЭКСПЛИЦИТНО (фикстура FR-3): оба волка в ближней дальности.
  w1.x = 3; w1.y = 2;
  w2.x = 4; w2.y = 2;
  standNextTo(c, w1);
  standNextToPlayer(c, w2);
  w1.maxHP = 200; w1.hp = 200;
  w2.maxHP = 200; w2.hp = 200;
  c._rng = () => 0.01;
  const atk1 = c.attack(w1.id);
  assert.equal(atk1.ok, true, 'удар 1 — ok');
  assert.equal(atk1.hit, true, 'попадание');
  assert.equal(w1.fled, true, 'w1 сбежал (000271)');
  assert.equal(c.result, null, 'бой жив: остался w2');
  // Очередь: «серый» слот w1 — ВТОРОЙ (после игрока). w2 выведен
  // ОСОЗНАННО: живой w2 в том же endTurn зашумил бы hp-ассерт;
  // startRound перестроит очередь (w1 исключится как fled).
  c.turnOrder = ['player', w1.id];
  c.turnIndex = 0;
  c.phase = 'player';
  const hp0 = p.hp;
  const x0 = w1.x, y0 = w1.y;
  const n0 = c.log.length;
  const round0 = c.round;
  c.endTurn();
  assert.equal(c.phase, 'player', 'очередь вернулась к игроку');
  assert.equal(c.round, round0 + 1,
    'обход дошёл до startRound (round +1)');
  assert.equal(p.hp, hp0,
    '0 урона по игроку: fled-w1 НЕ атаковал (вплотную к игроку)');
  assert.deepEqual([w1.x, w1.y], [x0, y0],
    'w1 не сдвинулся (fled — из очереди)');
  assert.ok(c.log.slice(n0).every((s) => !s.includes(w1.name)),
    'строки лога w1 НЕТ — 0 действий: ' + JSON.stringify(c.log.slice(n0)));
  assert.equal(w1.fled, true, 'w1 по-прежнему fled');
  assert.equal(w1.alive, true, 'w1 жив (fled ≠ смерть)');
});

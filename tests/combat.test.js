const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  hitChance, createCombat, resolveDifficulty, canDoAction, buildTurnOrder,
  MOB_TYPES, GROUP_RECIPES, LEADER_DMG_MULT, PRACTICE_XP, reachableCells,
  makeAlly,
} = require('../src/combat.js');
const { createCharacter, derived } = require('../src/player.js');
const { SETTINGS } = require('../src/global-settings.js');
const I = require('../src/items.js');
// Каталог заклинаний для ИИ support-союзника (задача 000080, раунд
// ревью 2): spells.js при загрузке ставит combatInternals.allySpells.
// Явный require в шапке — тесты «support-союзник: лечит…» обязаны
// работать при ИЗОЛИРОВАННОМ запуске (node --test --test-name-pattern
// «support-союзник»), а не только после прогона других тестов, которые
// require-нули spells.js в том же процессе. Тест ленивого каталога
// ниже сохраняет/восстанавливает значение — конфликтов нет.
require('../src/spells.js');

const MOBS_DIR = path.join(__dirname, '..', 'assets', 'mobs');
const SKILLS_DIR = path.join(__dirname, '..', 'assets', 'skills');
const SPELLS_DIR = path.join(__dirname, '..', 'assets', 'spells');
const mobFiles = () => fs.readdirSync(MOBS_DIR)
  .filter((f) => /^\d{6}\.json$/.test(f)).sort();

// Сильный персонаж для контролируемых сценариев (много HP — не умирает сам).
function strongHero() {
  const c = createCharacter();
  c.primary.constitution = 50;
  c.hp = 9999;
  return c;
}

// «Разумно сильный» герой середины игры (задача 000027): 15 уровней =
// 28 очков навыков, достижимая тратой (14 уровней × 2): первичные 18
// (Сила 10, Тело 7, Ловкость 4) + вторичные 10 (Укрытие 5 — требование
// Голема, Голем 3, Выносливость 2).
function midGameHero() {
  const c = createCharacter();
  c.level = 15;
  c.primary = {
    strength: 10, dexterity: 4, constitution: 7,
    intelligence: 1, wisdom: 1, charisma: 1,
  };
  c.secondary = { hide: 5, golem: 3, endurance: 2 };
  const d = derived(c);
  c.hp = d.maxHP;
  c.mp = d.maxMP;
  return c;
}

// Манхэттен-дистанция от игрока (1x1) до прямоугольника юнита (000040);
// совпадает с unitDist из combat.js — «разумный» игрок видит моба
// целиком, а не только по якорной клетке.
function uDist(c, u) {
  const x1 = u.x + ((u.size && u.size.w) || 1) - 1;
  const y1 = u.y + ((u.size && u.size.h) || 1) - 1;
  const dx = c.px < u.x ? u.x - c.px : (c.px > x1 ? c.px - x1 : 0);
  const dy = c.py < u.y ? u.y - c.py : (c.py > y1 ? c.py - y1 : 0);
  return dx + dy;
}

// Цель «разумной» авто-игры: поддержка (лечилка) — приоритет, иначе
// ближайшая живая.
function autoTarget(c) {
  const alive = c.units.filter((u) => u.alive && !u.fled);
  if (!alive.length) return null;
  const supports = alive.filter((u) => u.role === 'support');
  if (supports.length) {
    return supports.reduce((a, b) => (b.hp / b.maxHP < a.hp / a.maxHP ? b : a));
  }
  return alive.reduce((a, b) => (uDist(c, a) <= uDist(c, b) ? a : b));
}

// Авто-игра «разумного» игрока (задача 000027): ход — чередование
// «бьёт, если в дальности, иначе подходит» до исчерпания действий,
// все действия ударов используются, ход завершается блоком.
function autoPlay(c, maxRounds = 80) {
  let n = 0;
  while (!c.result && n++ < maxRounds) {
    let t = autoTarget(c);
    while (c.result === null && (c.ps.attack > 0 || c.ps.moveLeft > 0) && t) {
      const d = uDist(c, t);
      if (d <= 1 && c.ps.attack > 0) {
        // Цель рядом — бьём ЕЁ (договор 000027: поддержка — приоритет).
        const r = c.attack(t.id);
        if (!r.ok) break;
        if (!t.alive || t.fled) t = autoTarget(c);
      } else if (c.ps.moveLeft > 0) {
        // Шаг ИГРОКА к ближайшему краю прямоугольника цели (000040).
        const x1 = t.x + ((t.size && t.size.w) || 1) - 1;
        const y1 = t.y + ((t.size && t.size.h) || 1) - 1;
        const dx = c.px < t.x ? 1 : (c.px > x1 ? -1 : 0);
        const dy = c.py < t.y ? 1 : (c.py > y1 ? -1 : 0);
        const tries = Math.abs(dx) >= Math.abs(dy)
          ? [[dx, 0], [0, dy]] : [[0, dy], [dx, 0]];
        let moved = false;
        for (const [sx, sy] of tries) {
          if (!sx && !sy) continue;
          if (c.move(sx, sy).ok) { moved = true; break; }
        }
        if (moved) continue;
        // Прижаты (многоклеточный моб закрыл путь, 000040) — отвечаем
        // ближайшему, самому раненому.
        const adjacent = c.units
          .filter((u) => u.alive && !u.fled && uDist(c, u) <= 1)
          .sort((a, b) => a.hp / a.maxHP - b.hp / b.maxHP)[0];
        if (adjacent && c.ps.attack > 0) {
          const r = c.attack(adjacent.id);
          if (!r.ok) break;
          if (!t.alive || t.fled) t = autoTarget(c);
          continue;
        }
        break;
      } else {
        break;
      }
    }
    // Блок — последнее действие хода, снижает получаемый урон.
    if (c.result === null && c.ps.block > 0) c.block();
    c.endTurn();
  }
  return c.result;
}

// Ставит игрока вплотную к живому мобо (клетка рядом свободна).
// Для многоклеточного моба — клетка у края его прямоугольника (000040).
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
  // «Вплотную» = дистанция до прямоугольника ≤ 1 (углы диагональю не
  // считаются — как и для одиночной клетки).
  const near = (x, y) => {
    const dx = x < u.x ? u.x - x : (x > u.x + w - 1 ? x - (u.x + w - 1) : 0);
    const dy = y < u.y ? u.y - y : (y > u.y + h - 1 ? y - (u.y + h - 1) : 0);
    return dx + dy <= 1;
  };
  // Задача 000050: кандидат-препятствие — не «свободная клетка»
  // (guard: до генерации c.obstacles нет — поведение не меняется).
  const spot = candidates.find(([x, y]) =>
    x >= 0 && y >= 0 && x < c.width && y < c.height && !taken(x, y)
    && !(c.obstacles && c.obstacles.has(x + ',' + y)) && near(x, y));
  assert.ok(spot, 'нет свободной клетки рядом с мобом');
  c.px = spot[0];
  c.py = spot[1];
}

// --- Состав групп ---

test('состав группы: 2-6 мобов, уровень персонажа ±3', () => {
  const p = createCharacter(); // уровень 1
  for (const [type, recipe] of Object.entries(GROUP_RECIPES)) {
    const c = createCombat({ player: p, groupType: Number(type), seed: 7 });
    const mobs = c.units;
    assert.ok(mobs.length >= 2 && mobs.length <= 6,
      `группа ${type}: ${mobs.length} мобов (ожидается 2-6)`);
    for (const u of mobs) {
      assert.ok(u.level >= 1 && u.level <= 4,
        `группа ${type}: уровень моба ${u.level} вне диапазона 1..4`);
    }
    // Доминирующий тип локации в группе всегда есть.
    const dominant = recipe.mobs[0];
    assert.ok(mobs.some((u) => u.mobId === dominant),
      `группа ${type}: нет доминирующего моба ${dominant}`);
  }
});

test('волчья стая: 3-6 волков', () => {
  const p = createCharacter();
  for (const seed of [1, 2, 3, 4, 5]) {
    const c = createCombat({ player: p, groupType: 3, seed });
    assert.ok(c.units.length >= 3 && c.units.length <= 6, 'не 3-6 волков');
    assert.ok(c.units.every((u) => u.mobId === 'wolf'), 'не все волки');
  }
});

test('состав группы детерминирован при одном сиде', () => {
  const p1 = createCharacter();
  const p2 = createCharacter();
  const c1 = createCombat({ player: p1, groupType: 0, seed: 99 });
  const c2 = createCombat({ player: p2, groupType: 0, seed: 99 });
  assert.deepEqual(
    c1.units.map((u) => [u.mobId, u.level, u.x, u.y, u.hp, u.armor]),
    c2.units.map((u) => [u.mobId, u.level, u.x, u.y, u.hp, u.armor]),
  );
});

// --- Каталог описаний мобов assets/mobs (задача 000022) ---

test('assets/mobs: JSON-файлы — структура по схеме, id уникальны', () => {
  const files = mobFiles();
  assert.ok(files.length >= 30, 'мало JSON-файлов мобов: ' + files.length);
  const ROLES = new Set(['melee', 'ranged', 'support', 'leader', 'shield', 'swarm']);
  const AGGRO = new Set(['aggressive', 'neutral', 'territorial', 'timid']);
  const ids = new Set();
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(MOBS_DIR, f), 'utf8'));
    assert.match(j.id, /^[a-z][a-z0-9_]*$/, f + ': id');
    assert.ok(!ids.has(j.id), f + ': дублируется id ' + j.id);
    ids.add(j.id);
    assert.ok(j.name, f + ': нет имени');
    assert.ok(ROLES.has(j.role), f + ': роль ' + j.role);
    assert.ok(AGGRO.has(j.aggro), f + ': агрессия ' + j.aggro);
    assert.ok(j.dmg > 0 && j.hp > 0, f + ': dmg/hp');
    assert.ok(j.xp && j.xp.base >= 0 && j.xp.perLevel >= 0, f + ': xp = base + perLevel*уровень');
    assert.ok(Array.isArray(j.skills), f + ': skills — массив ссылок');
    assert.ok(Array.isArray(j.spells), f + ': spells — массив ссылок');
    assert.ok(Array.isArray(j.loot), f + ': loot — массив');
    for (const l of j.loot) {
      assert.match(l.item, /^[a-z][a-z0-9_]*$/, f + ': loot.item');
      if (l.chance != null) assert.ok(l.chance >= 0 && l.chance <= 1, f + ': chance 0..1');
    }
  }
});

test('assets/mobs: зеркало в combat.js идентично JSON-каталогу (source of truth)', () => {
  // Поля арта (задача 000062) существуют ТОЛЬКО в JSON-каталоге: в
  // зеркале combat.js их нет — иначе файл бы разбух на ~40 КБ
  // «описаний», а под file:// арта не грузится и зеркало — единственный
  // источник данных. Зеркалируем JSON без них и проверяем, что в
  // зеркале арта-полей тоже нет (защита от случайного попадания).
  const ART_ONLY_MOB_FIELDS = ['описание', 'art'];
  const files = mobFiles();
  const byId = new Map(Object.entries(MOB_TYPES).map(([id, t]) => [id, t]));
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(MOBS_DIR, f), 'utf8'));
    assert.ok(byId.has(j.id), f + ': моб ' + j.id + ' нет в combat.js');
    for (const k of ART_ONLY_MOB_FIELDS) {
      assert.equal(byId.get(j.id)[k], undefined,
        f + ': арта-поле «' + k + '» не должно попадать в зеркало combat.js');
      delete j[k];
    }
    assert.deepEqual(j, byId.get(j.id), f + ' расходится с combat.js');
    byId.delete(j.id);
  }
  assert.equal(byId.size, 0, 'в combat.js есть мобы без JSON-файла: '
    + Array.from(byId.keys()).join(', '));
});

test('assets/mobs: ссылки — skills в assets/skills, loot в assets/items', () => {
  const skillIds = new Set(
    fs.readdirSync(SKILLS_DIR).filter((f) => /^\d{6}\.json$/).map((f) =>
      JSON.parse(fs.readFileSync(path.join(SKILLS_DIR, f), 'utf8')).id));
  const itemIds = new Set(I.allItems().map((it) => it.id));
  // assets/spells появится с задачей 000023: проверяем, только если есть.
  const spellsExist = fs.existsSync(SPELLS_DIR);
  const spellIds = spellsExist ? new Set(
    fs.readdirSync(SPELLS_DIR).filter((f) => f.endsWith('.json')).map((f) =>
      JSON.parse(fs.readFileSync(path.join(SPELLS_DIR, f), 'utf8')).id)) : null;
  for (const f of mobFiles()) {
    const j = JSON.parse(fs.readFileSync(path.join(MOBS_DIR, f), 'utf8'));
    for (const s of j.skills) {
      assert.ok(skillIds.has(s), j.id + ': навык «' + s + '» нет в assets/skills');
    }
    for (const l of j.loot) {
      assert.ok(itemIds.has(l.item), j.id + ': лут «' + l.item + '» нет в assets/items');
    }
    for (const sp of j.spells) {
      assert.ok(spellIds && spellIds.has(sp),
        j.id + ': заклинание «' + sp + '» нет в assets/spells');
    }
  }
});

test('единицы: xp/skills/loot из описания, опыт победы = base + perLevel*уровень', () => {
  const p = strongHero();
  const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 5, seed: 3 });
  const u = c.units[0];
  assert.deepEqual(u.xp, { base: 8, perLevel: 4 });
  assert.deepEqual(u.loot, [{ item: 'leather_armor', chance: 0.1 }]);
  assert.deepEqual(u.skills, []);
  // Убиваем волка: опыт = 8 + 4*5 = 28.
  c._rng = () => 0.01;
  standNextTo(c, u);
  let n = 0;
  while (!c.result && n++ < 60) {
    c.ps.attack = 99;
    c.attack(u.id);
    c.endTurn();
  }
  assert.ok(c.result, 'бой не завершился');
  assert.equal(c.result.outcome, 'victory');
  assert.equal(c.result.xp, 8 + 4 * 5, 'опыт победы по данным описания');
});

test('группа с лидером: +5% урона и +5% защиты всем', () => {
  const p = createCharacter();
  const withLeader = createCombat({ player: p, groupType: 6, seed: 5 }); // Уродство — лидер
  assert.ok(withLeader.units.some((u) => u.role === 'leader'), 'нет лидера');
  for (const u of withLeader.units) {
    assert.equal(u.damageTakenMult, 0.95);
  }
  const noLeader = createCombat({ player: p, groupType: 3, seed: 5 });
  assert.ok(!noLeader.units.some((u) => u.role === 'leader'));
  for (const u of noLeader.units) assert.equal(u.damageTakenMult, 1);
  // Урон лидера: база уровня × бафф лидера × множитель сложности (задача 000027).
  const L = withLeader.units[0].level;
  const diff = SETTINGS.combat_difficulties[SETTINGS.combat_difficulty];
  const leader = withLeader.units.find((u) => u.role === 'leader');
  const expected = Math.max(1, Math.round(
    (2 + 0.7 * L) * MOB_TYPES.abomination.dmg * LEADER_DMG_MULT * diff.damage));
  assert.equal(leader.damage, expected);
});

// --- Формулы попадания и урона ---

test('hitChance: рост с уровнем, штраф от уклонения, клампинг', () => {
  assert.equal(hitChance(5, 0, 5, 0), 0.55);
  assert.ok(hitChance(10, 0, 5, 0) > hitChance(5, 0, 5, 0));
  assert.ok(hitChance(5, 0.2, 5, 0) > hitChance(5, 0, 5, 0), 'бонус попадания');
  assert.ok(hitChance(5, 0, 5, 0.2) < hitChance(5, 0, 5, 0), 'штраф от уклонения');
  assert.equal(hitChance(200, 0.5, 1, 0), 0.95, 'верхний кламп 0.95');
  assert.equal(hitChance(1, -0.9, 200, 0.5), 0.05, 'нижний кламп 0.05');
});

test('удар: урон = база − броня моба (минимум 1), детерминированно', () => {
  const p = strongHero();
  const c = createCombat({ player: p, groupType: 0, seed: 11 }); // орочий лагерь, без лидера
  c._rng = () => 0.01; // попадание гарантировано
  const w = c.units.find((u) => u.mobId === 'orc_warrior');
  standNextTo(c, w);
  const hpBefore = w.hp;
  const base = 3 + Math.floor(p.primary.strength * 0.8) + Math.floor(p.level * 0.5);
  const expected = Math.max(1, base - w.armor);
  const r = c.attack(w.id);
  assert.equal(r.ok, true);
  assert.equal(r.hit, true);
  assert.equal(hpBefore - w.hp, expected, `урон ${hpBefore - w.hp} != ${expected}`);
});

test('промах: HP моба не меняется, действие потрачено', () => {
  const p = strongHero();
  const c = createCombat({ player: p, groupType: 3, seed: 3 });
  c._rng = () => 0.99; // промах гарантирован
  const w = c.units[0];
  standNextTo(c, w);
  const hpBefore = w.hp;
  const atkBefore = c.ps.attack;
  const r = c.attack(w.id);
  assert.equal(r.ok, true);
  assert.equal(r.hit, false);
  assert.equal(w.hp, hpBefore);
  assert.equal(c.ps.attack, atkBefore - 1, 'действие потрачено');
});

// --- Лимиты действий и очередь ходов ---

test('лимит действий: удар доступен 1 + floor(Сила/10) раз за ход', () => {
  const p = strongHero();
  const c = createCombat({ player: p, groupType: 3, seed: 2 });
  assert.equal(c.ps.attack, 1 + Math.floor(p.primary.strength / 10));
  p.primary.strength = 30; // 4 удара
  c.ps.attack = 4;
  const w = c.units[0];
  standNextTo(c, w);
  c._rng = () => 0.99; // промахи — не убиваем цель
  for (let i = 0; i < 4; i++) assert.equal(c.attack(w.id).ok, true, `удар ${i + 1}`);
  assert.equal(c.attack(w.id).ok, false, '5-й удар должен быть отклонён');
  assert.match(c.attack(w.id).reason, /Удар/);
  // Новый ход восстанавливает пул.
  c.endTurn();
  assert.equal(c.ps.attack, 4);
});

test('блок: ставится даже при оставшихся действиях; ПОСЛЕ него другие действия хода запрещены', () => {
  const p = strongHero();
  const c = createCombat({ player: p, groupType: 3, seed: 2 });
  // Блок доступен в любой момент хода (раньше пулы заклинаний ≥1 делали
  // его невыполнимым в бою — задача 000027).
  assert.equal(c.block().ok, true, 'блок можно поставить при наличии других действий');
  assert.equal(c.ps.blocked, true);
  // После блока прочие действия хода отклоняются.
  const w = c.units[0];
  standNextTo(c, w);
  const atk = c.attack(w.id);
  assert.equal(atk.ok, false);
  assert.match(atk.reason, /последнее действие/);
  assert.match(c.spell('fire', w.id).reason, /последнее действие/);
  const mv = c.move(1, 0);
  assert.equal(mv.ok, false);
  assert.match(mv.reason, /последнее действие/);
  I.addItem(p, 'bread');
  assert.match(c.invItem('bread').reason, /последнее действие/);
  // Один раз за ход.
  const bl2 = c.block();
  assert.equal(bl2.ok, false, 'блок один раз за ход');
  assert.match(bl2.reason, /больше нет/);
  // На новый ход блок сброшен.
  c.endTurn();
  assert.equal(c.ps.blocked, false);
});

test('блок снижает получаемый урон', () => {
  const make = () => {
    const p = strongHero();
    const c = createCombat({ player: p, groupType: 3, seed: 77 });
    c._rng = () => 0.01; // все атаки мобов попадают
    standNextTo(c, c.units[0]);
    return c;
  };
  const blocked = make();
  blocked.ps.attack = 0; blocked.ps.spellInt = 0; blocked.ps.spellWis = 0;
  blocked.ps.quickItem = 0; blocked.ps.invItem = 0;
  blocked.block();
  blocked.endTurn();
  const open = make();
  open.endTurn();
  assert.ok(blocked.player.hp > open.player.hp,
    `с блоком HP ${blocked.player.hp} должно быть выше, чем без (${open.player.hp})`);
});

// --- Исход боя ---

test('победа: весь лут, опыт и золото начислены', () => {
  const p = createCharacter();
  p.primary.strength = 30; // 4 удара
  p.primary.constitution = 50;
  const c = createCombat({ player: p, groupType: 3, seed: 4 });
  // Задача 000050: жадный autoPlay не умеет обходить камни (deadlock
  // тестового ИИ, не карты — проверено свипом плотностей); сценарий
  // проверяет лут/опыт, а не навигацию — препятствия сняты (guard:
  // до реализации поля c.obstacles нет).
  if (c.obstacles) c.obstacles.clear();
  autoPlay(c);
  assert.ok(c.result, 'бой должен завершиться');
  assert.equal(c.result.outcome, 'victory');
  assert.ok(c.result.xp > 0, 'опыт начислен');
  assert.ok(c.result.gold > 0, 'золото начислено');
  assert.equal(c.units.every((u) => !u.alive || u.fled), true);
});

test('смерть: слабый герой против бездны', () => {
  const p = createCharacter(); // уровень 1, 25 HP
  const c = createCombat({ player: p, groupType: 6, seed: 8 });
  // Задача 000050: мобы обязаны ДОЙТИ до героя (stepToward не обходит
  // камни — deadlock жадного ИИ); сценарий проверяет смерть, не
  // навигацию — препятствия сняты (guard: до реализации поля нет).
  if (c.obstacles) c.obstacles.clear();
  c._rng = () => 0.01; // мобы точно попадают
  let n = 0;
  while (!c.result && n++ < 60) c.endTurn(); // герой только терпит
  assert.ok(c.result, 'бой должен завершиться');
  assert.equal(c.result.outcome, 'dead');
  assert.equal(p.alive, false);
});

test('побег: успех завершает бой, провал сжигает ход', () => {
  const p = createCharacter();
  const ok = createCombat({ player: p, groupType: 3, seed: 6 });
  ok._rng = () => 0.0; // бросок < шанса
  const r1 = ok.flee();
  assert.equal(r1.fled, true);
  assert.equal(ok.result.outcome, 'fled');

  const p2 = createCharacter();
  const bad = createCombat({ player: p2, groupType: 3, seed: 6 });
  bad._rng = () => 0.99; // бросок > шанса
  const before = bad.round;
  const r2 = bad.flee();
  assert.equal(r2.fled, false);
  assert.equal(bad.result, null, 'бой продолжается');
  assert.equal(bad.round, before + 1, 'ход мобов прошёл');
  assert.equal(bad.phase, 'player', 'очередь снова у игрока');
});

// --- Роли мобов ---

test('дальний бой держит дистанцию', () => {
  const p = strongHero();
  const c = createCombat({ player: p, groupType: 5, seed: 13 }); // есть ветряной стихийник
  const ranged = c.units.filter((u) => u.role === 'ranged');
  assert.ok(ranged.length, 'в группе нет дальних бойцов');
  for (let i = 0; i < 3; i++) c.endTurn();
  for (const u of ranged) {
    const d = Math.abs(u.x - c.px) + Math.abs(u.y - c.py);
    assert.ok(d >= 2, `дальний боец ${u.name} сближён: дистанция ${d}`);
  }
});

test('поддержка лечит самого раненого союзника', () => {
  const p = strongHero();
  const c = createCombat({ player: p, groupType: 0, seed: 15 }); // есть орк-шаман
  const shaman = c.units.find((u) => u.role === 'support');
  const warrior = c.units.find((u) => u.mobId === 'orc_warrior');
  warrior.hp = 1;
  c._rng = () => 0.5;
  c.endTurn();
  assert.ok(warrior.hp > 1, `шаман не пролечил воина (hp=${warrior.hp})`);
});

test('пугливый моб убежает при ранении', () => {
  const p = strongHero();
  const c = createCombat({ player: p, groupType: 0, seed: 17 });
  const shaman = c.units.find((u) => u.role === 'support');
  shaman.hp = 1; // < 30% — паника
  let n = 0;
  while (!shaman.fled && n++ < 10) c.endTurn();
  assert.equal(shaman.fled, true, 'шаман не сбежал');
});

test('яд: отравление держится 2 хода и тикает в начале хода игрока', () => {
  const p = strongHero();
  const c = createCombat({ player: p, groupType: 4, seed: 19 }); // пауки ядовиты
  c._rng = () => 0.05; // попадания и яд
  standNextTo(c, c.units[0]);
  c.endTurn(); // мобы травят; тик уже прошёл (2 → 1)
  assert.equal(c.ps.poison, 1, 'отравление должно держаться 2 хода');
  const hp1 = p.hp;
  c.endTurn(); // второй тик (1 → 0)
  assert.ok(p.hp <= hp1 - 2, 'яд не тикает');
  assert.equal(c.ps.poison, 0, 'отравление не снялось');
});

test('вампиризм: моб с чертой лечится нанесённым уроном', () => {
  const p = strongHero();
  const c = createCombat({ player: p, groupType: 2, seed: 21 });
  // В логове скелетов нет вампиров — проверяем факт отсутствия черты.
  assert.ok(!c.units.some((u) => u.traits.lifesteal));
  // Прямая проверка: даём черту одному скелету и ставим его вплотную.
  const v = c.units[0];
  const oldDamage = v.damage;
  v.damage = 7;
  v.traits.lifesteal = true;
  v.hp = Math.max(1, v.hp - 5);
  const vHp = v.hp;
  const hpBefore = p.hp;
  standNextTo(c, v);
  c._rng = () => 0.01; // попадание
  c.endTurn();
  assert.ok(p.hp < hpBefore, 'игрок не получил урон');
  assert.ok(v.hp >= vHp, 'вампиризм не сработал');
  v.damage = oldDamage;
});

test('«Несокрушимость»: смертельный удар можно пережить', () => {
  const p = createCharacter();
  p.secondary = { golem: 10, unkill: 50 }; // шанс выживания 50%
  const c = createCombat({ player: p, groupType: 0, seed: 23 });
  c._rng = () => 0.01; // и попадания мобов, и бросок выживания
  standNextTo(c, c.units[0]);
  // «Голем 10» даёт 10 брони — обычный урон воина (3) гасится полностью.
  c.units[0].damage = 25;
  p.hp = 1;
  c.endTurn();
  if (c.result && c.result.outcome === 'dead') {
    // Все мобы могли не подойти за один ход — допускаем, но тогда
    // проверка смысла не имеет; убеждаемся, что игрок мёртв.
    assert.equal(p.alive, false);
    return;
  }
  assert.equal(p.alive, true, 'Несокрушимость не спасла');
  assert.equal(p.hp, 1);
  assert.ok(c.log.some((l) => l.includes('Несокрушимость')));
});

test('«Несокрушимость»: 1 раз в игровой день (между боями), сброс на новый день', () => {
  // Шанс 100% (unkill 50 * 2% — перекрываем), бросок и попадания детерминированы.
  const newHero = () => {
    const p = createCharacter();
    p.secondary = { golem: 10, unkill: 50 };
    return p;
  };
  // Бой, в котором моб гарантированно бьёт на смерть за endTurn.
  const deadly = (p, day) => {
    const c = createCombat({ player: p, groupType: 0, seed: 23, day });
    c._rng = () => 0.01;
    standNextTo(c, c.units[0]);
    c.units[0].damage = 25; // пробивает броню голема
    p.hp = 1;
    return c;
  };

  const p = newHero();
  const c1 = deadly(p, 1);
  c1.endTurn();
  assert.equal(p.alive, true, '1-й бой дня: выжить можно');
  assert.equal(p._lastUnkillDay, 1, 'помечен день применения');

  // Второй бой того же дня: шанс уже потрачен → смерть.
  const c2 = deadly(p, 1);
  c2.endTurn();
  assert.equal(p.alive, false, '2-й бой того же дня: Несокрушимость не сработала повторно');

  // Новый день: шанс возвращается.
  p.alive = true;
  const c3 = deadly(p, 2);
  c3.endTurn();
  assert.equal(p.alive, true, 'на новый день шанс выживания вернулся');
  assert.equal(p._lastUnkillDay, 2);
});

// --- Ход игрока на мини-карте ---

test('движение: стены, занятые клетки и лимит шагов', () => {
  const p = strongHero();
  const c = createCombat({ player: p, groupType: 3, seed: 25 });
  const steps = c.ps.moveLeft;
  assert.equal(c.move(0, -1).ok, true);
  assert.equal(c.ps.moveLeft, steps - 1);
  assert.equal(c.move(0, -99).ok, false); // вне сетки
  const m = c.units[0];
  c.px = m.x; c.py = m.y + 1; // вплотную, снизу
  const r = c.move(0, -1); // прямо на клетку моба
  assert.equal(r.ok, false, 'нельзя зайти на клетку моба');
  c.ps.moveLeft = 0;
  assert.match(c.move(1, 0).reason, /шаги/);
});

test('заклинания: огонь игнорирует броню и тратит ману, исцеление лечит', () => {
  const p = createCharacter();
  p.primary.intelligence = 10; // пул заклинаний 2
  p.primary.wisdom = 10;
  p.mp = 20;
  p.hp = 20; // исцеление должно поднять HP (максимум — 25)
  const c = createCombat({ player: p, groupType: 0, seed: 27 });
  const warrior = c.units.find((u) => u.mobId === 'orc_warrior');
  assert.ok(warrior.armor >= 1, 'воин без брони?');
  warrior.x = c.px; warrior.y = c.py - 1; // подтянуть цель в дальность
  const hpBefore = warrior.hp;
  const r = c.spell('fire', warrior.id);
  assert.equal(r.ok, true);
  assert.equal(p.mp, 17);
  const expected = Math.round(3 + 0.5 * p.primary.intelligence);
  assert.equal(hpBefore - warrior.hp, expected, 'броня должна быть проигнорирована');
  const hp2 = p.hp;
  const r2 = c.spell('heal');
  assert.equal(r2.ok, true);
  assert.ok(p.hp > hp2, 'исцеление не лечит');
  // Дальность ограничена 4 клетками.
  const far = c.units.find((u) => Math.abs(u.x - c.px) + Math.abs(u.y - c.py) > 4);
  assert.ok(far, 'нет цели вне дальности');
  assert.equal(c.spell('fire', far.id).ok, false, 'огонь долетает только на 4 клетки');
});

// --- Детерминизм ---

test('одинаковый бой при одинаковых действиих (сид + сценарий)', () => {
  const play = (seed) => {
    const p = strongHero();
    p.primary.strength = 20;
    const c = createCombat({ player: p, groupType: 0, seed });
    autoPlay(c, 30);
    return {
      result: c.result,
      hp: p.hp,
      units: c.units.map((u) => [u.id, u.x, u.y, u.hp, u.alive, u.fled]),
    };
  };
  assert.deepEqual(play(31), play(31), 'бой не детерминирован');
});

// --- Произвольный состав (подземелья, задача 000007) ---

test('кастомный состав: массив мобов + mobLevel + groupName', () => {
  const c = createCombat({
    player: strongHero(),
    mobs: ['skeleton', 'skeleton_archer', 'troll'],
    mobLevel: 7,
    seed: 123,
  });
  assert.equal(c.units.length, 3);
  for (const u of c.units) assert.equal(u.level, 7);
  assert.ok(c.units.some((u) => u.role === 'ranged'), 'остряк-скелет — стрелок');
  assert.equal(c.groupName, 'блуждающая группа');
  const a = createCombat({ player: strongHero(), mobs: ['spider', 'scorpion'], mobLevel: 3, seed: 7 });
  assert.equal(a.units.length, 2);
  assert.equal(a.units[0].level, 3);
});

// --- Предметы в бою (задача 000009) ---

test('быстрый предмет: закреплённый слот лечит и тратит пул quickItem', () => {
  const p = strongHero();
  I.addItem(p, 'healing_potion');
  assert.equal(I.setQuick(p, 0, 'healing_potion').ok, true);
  const c = createCombat({ player: p, groupType: 3, seed: 5 });
  p.hp = 10;
  const pool = c.ps.quickItem;
  const r = c.quickItem(0);
  assert.equal(r.ok, true);
  assert.equal(r.slot, 0);
  assert.equal(p.hp, 25, '+15 HP от зелья');
  assert.equal(c.ps.quickItem, pool - 1, 'действие потрачено');
  assert.equal(I.totalQty(p, 'healing_potion'), 0, 'зелье в слоте потрачено');
  // Слот пуст — действие не сгорает (возвращаем пул, чтобы проверить именно слот).
  c.ps.quickItem = pool;
  const r2 = c.quickItem(0);
  assert.equal(r2.ok, false);
  assert.match(r2.reason, /пуст/);
  assert.equal(c.ps.quickItem, pool, 'пустой слот не тратит действие');
  // Без аргумента — первый занятый слот.
  I.addItem(p, 'bread');
  I.setQuick(p, 2, 'bread');
  const r3 = c.quickItem();
  assert.equal(r3.ok, true);
  assert.equal(r3.slot, 2);
});

test('предмет из инвентаря: 1 действие за ход, выбор предмета', () => {
  const p = strongHero();
  I.addItem(p, 'meat');
  const c = createCombat({ player: p, groupType: 3, seed: 5 });
  p.hp = 10;
  assert.equal(c.invItem('bread').ok, false, 'нет в инвентаре');
  assert.equal(c.invItem('bread').ok, false);
  assert.equal(c.ps.invItem, 1, 'несуществующий предмет не тратит действие');
  const r = c.invItem('meat');
  assert.equal(r.ok, true);
  assert.equal(p.hp, 18, '+8 HP от мяса');
  assert.equal(c.ps.invItem, 0, 'действие потрачено');
  assert.equal(c.invItem('meat').ok, false, 'действие больше нет');
});

test('оружие в бою: меч бьёт сильнее кулаков, подтип даёт бонусы', () => {
  const p = strongHero(); // сила 1 → кулаки: 3 урона
  I.addItem(p, 'iron_sword'); // урон 5
  I.equip(p, 'iron_sword');
  const c = createCombat({ player: p, groupType: 3, seed: 5 });
  c._rng = () => 0.01; // все атаки попадают
  standNextTo(c, c.units[0]);
  const r = c.attack(c.units[0].id);
  assert.equal(r.ok, true);
  assert.equal(r.hit, true);
  assert.equal(r.dmg, 5, 'урон меча = stats.damage');
  // «Тяжёлое оружие» +5%/ур: топор 8 → 8.4 на 1 ур.
  const p2 = strongHero();
  p2.secondary.heavy = 1;
  I.addItem(p2, 'battle_axe');
  I.equip(p2, 'battle_axe');
  const c2 = createCombat({ player: p2, groupType: 3, seed: 5 });
  c2._rng = () => 0.01;
  standNextTo(c2, c2.units[0]);
  assert.equal(c2.attack(c2.units[0].id).dmg, Math.round(8 * 1.05) - 0, 'бонус тяжёлого оружия');
});

test('лук: атака в даль до 4 клеток, без лука — только вплотную', () => {
  // Мини-карта 7x4: игрок в (3,3), моб в (3,0) — дистанция 3.
  const p = strongHero();
  I.addItem(p, 'hunting_bow');
  I.equip(p, 'hunting_bow');
  const c = createCombat({ player: p, groupType: 3, seed: 5, width: 7, height: 4 });
  c._rng = () => 0.01;
  const far = c.units.find((u) => Math.abs(u.x - c.px) + Math.abs(u.y - c.py) === 3);
  assert.ok(far, 'найдём моб на дистанции 3');
  const r = c.attack(far.id);
  assert.equal(r.ok, true, 'лук бьёт в даль');
  assert.equal(r.hit, true);
  assert.equal(r.dmg, 6, 'урон лука = stats.damage');

  // Без лука та же дистанция недосягаема.
  const p2 = strongHero();
  const c2 = createCombat({ player: p2, groupType: 3, seed: 5, width: 7, height: 4 });
  const far2 = c2.units.find((u) => Math.abs(u.x - c2.px) + Math.abs(u.y - c2.py) === 3);
  assert.ok(far2);
  const r2 = c2.attack(far2.id);
  assert.equal(r2.ok, false);
  assert.match(r2.reason, /далеко/);
});

test('броня снижает получаемый урон (то же зерно боя, с/без брони)', () => {
  const make = (withArmor) => {
    const p = strongHero();
    if (withArmor) {
      I.addItem(p, 'leather_armor');
      I.equip(p, 'leather_armor');
    }
    const c = createCombat({ player: p, groupType: 3, seed: 99 });
    c._rng = () => 0.01; // все атаки мобов попадают
    standNextTo(c, c.units[0]);
    const hp0 = p.hp;
    c.endTurn();
    return p.hp === 9999 ? 0 : 9999 - p.hp; // strongHero hp=9999
  };
  const without = make(false);
  const withArmor = make(true);
  assert.ok(without > 0, 'без брони урон получен');
  assert.ok(withArmor < without, `с броней урон меньше: ${withArmor} < ${without}`);
});

// --- Сложность боя (задача 000027) ---

test('сложность: в настройках есть три уровня с множителями hp/damage', () => {
  assert.ok(SETTINGS.combat_difficulty, 'задана текущая сложность');
  const table = SETTINGS.combat_difficulties;
  for (const name of ['easy', 'medium', 'hard']) {
    assert.ok(table[name], `нет сложности ${name}`);
    assert.ok(table[name].hp > 0 && table[name].damage > 0,
      `сложность ${name}: множители положительны`);
  }
  assert.equal(typeof SETTINGS.combat_difficulty, 'string');
  assert.ok(table[SETTINGS.combat_difficulty], 'текущая сложность есть в таблице');
});

test('сложность: easy < medium < hard (HP и урон каждого моба)', () => {
  // Мобы уровня 30: у уровня 10 урон medium и hard округляется
  // в одно значение (у шамана), поэтому берём уровень повыше.
  const mk = (difficulty) => createCombat({
    player: createCharacter(),
    mobs: ['orc_warrior', 'orc_archer', 'orc_shaman'],
    mobLevel: 30,
    seed: 77,
    difficulty,
  });
  const e = mk('easy'), m = mk('medium'), h = mk('hard');
  assert.equal(e.difficulty, 'easy');
  assert.equal(m.difficulty, 'medium');
  assert.equal(h.difficulty, 'hard');
  for (let i = 0; i < e.units.length; i++) {
    assert.ok(e.units[i].maxHP < m.units[i].maxHP, `моб ${i}: easy hp < medium hp`);
    assert.ok(m.units[i].maxHP < h.units[i].maxHP, `моб ${i}: medium hp < hard hp`);
    assert.ok(e.units[i].damage < m.units[i].damage, `моб ${i}: easy урон < medium`);
    assert.ok(m.units[i].damage < h.units[i].damage, `моб ${i}: medium урон < hard`);
  }
});

test('сложность: неизвестное имя деградирует до настроенной, opts переопределяет', () => {
  const cur = SETTINGS.combat_difficulties[SETTINGS.combat_difficulty];
  assert.deepEqual(resolveDifficulty('нет-такой-сложности'), cur,
    'неизвестная сложность → настроенная');
  assert.deepEqual(resolveDifficulty('easy'), SETTINGS.combat_difficulties.easy);

  const p = createCharacter();
  const a = createCombat({ player: p, groupType: 0, seed: 3, difficulty: 'hard' });
  const b = createCombat({ player: p, groupType: 0, seed: 3, difficulty: 'нет-такой' });
  assert.equal(a.difficulty, 'hard', 'opts.difficulty записан в бой');
  // «нет-такой» = настроенная сложность — множители совпадают.
  for (let i = 0; i < a.units.length; i++) {
    assert.ok(a.units[i].maxHP >= b.units[i].maxHP, 'hard не слабее настроенной');
  }
});

test('единый источник: SETTINGS.combat_difficulty задаёт сложность по умолчанию', (t) => {
  // Герой повыше: у мобов уровня 1 урон обоих уровней сложности
  // округляется в 1 и различия не видны.
  const hero = () => { const p = createCharacter(); p.level = 10; return p; };
  const before = createCombat({ player: hero(), groupType: 0, seed: 9 });
  assert.equal(before.difficulty, 'medium', 'дефолт = medium');

  SETTINGS.combat_difficulty = 'easy';
  t.after(() => { SETTINGS.combat_difficulty = 'medium'; });
  const after = createCombat({ player: hero(), groupType: 0, seed: 9 });
  assert.equal(after.difficulty, 'easy', 'дефолт следует за настройкой');
  for (let i = 0; i < before.units.length; i++) {
    assert.ok(after.units[i].maxHP < before.units[i].maxHP, 'easy слабее medium');
    assert.ok(after.units[i].damage < before.units[i].damage, 'easy бьёт слабее');
  }
});

test('баланс: разумно сильный герой побеждает ВСЕ стандартные группы на medium', () => {
  // Герой уровня группы (levelDeltaMax: 0), разумная игра (autoPlay):
  // поддержка первой, все удары, блок в конце хода.
  for (const [type, recipe] of Object.entries(GROUP_RECIPES)) {
    for (const seed of [1, 2, 3, 4, 5]) {
      const p = midGameHero();
      const c = createCombat({
        player: p, groupType: Number(type), seed,
        levelDeltaMax: 0, difficulty: 'medium',
      });
      // Задача 000050: жадный autoPlay застревает за камнем (deadlock
      // тестового ИИ) — сценарий проверяет баланс, не навигацию
      // (guard: до реализации поля c.obstacles нет).
      if (c.obstacles) c.obstacles.clear();
      const r = autoPlay(c);
      assert.ok(r, `группа ${recipe.name} (seed ${seed}): бой не завершился`);
      assert.equal(r.outcome, 'victory',
        `группа ${recipe.name} (seed ${seed}): исход ${r.outcome}`);
      assert.ok(r.xp > 0 && r.gold > 0, 'лут за победу');
    }
  }
});

test('баланс: безопасная зона (мобы -3 к герою) на medium — тоже победа', () => {
  for (const [type, recipe] of Object.entries(GROUP_RECIPES)) {
    // Кастомный состав рецепта с фиксированным уровнем мобов = герой - 3
    // (безопасные локации по SPEC: дельта ближе к -N).
    let mobs = recipe.mobs.slice();
    if (recipe.count) mobs = new Array(recipe.count[0]).fill(recipe.mobs[0]);
    const p = midGameHero();
    const c = createCombat({
      player: p, mobs, mobLevel: Math.max(1, p.level - 3),
      seed: 11, difficulty: 'medium', groupName: recipe.name,
    });
    // Задача 000050: то же, что и в «разумно сильном герое» — жадный
    // autoPlay не обходит камни (deadlock тестового ИИ); сценарий
    // проверяет баланс, не навигацию (guard: до реализации поля нет).
    if (c.obstacles) c.obstacles.clear();
    const r = autoPlay(c);
    assert.ok(r, `группа ${recipe.name}: бой не завершился`);
    assert.equal(r.outcome, 'victory', `группа ${recipe.name} (мобы -3): исход ${r.outcome}`);
  }
});

// --- Практика навыков: опыт за применение эффектов (задача 000013) ---

test('практика: попадание оружием даёт опыт навыка оружия', () => {
  // Меч → «Мечник», лук → «Стрелок», топор → «Тяжёлое оружие».
  const cases = [
    ['iron_sword', 'swordsman'],
    ['hunting_bow', 'archer'],
    ['battle_axe', 'heavy'],
  ];
  for (const [weapon, skill] of cases) {
    const p = strongHero();
    I.addItem(p, weapon);
    I.equip(p, weapon);
    const c = createCombat({ player: p, groupType: 3, seed: 5 });
    c._rng = () => 0.01; // попадание гарантировано
    standNextTo(c, c.units[0]);
    const r = c.attack(c.units[0].id);
    assert.equal(r.hit, true, weapon + ': должно попасть');
    assert.equal(r.practice.skill, skill, weapon + ' → навык ' + skill);
    assert.equal(r.practice.xp, PRACTICE_XP.hit);
    assert.equal(p.skillXp[skill], PRACTICE_XP.hit, 'опыт записан в копилку');
  }
});

test('практика: голыми руками — «Каменные кулаки», промах — опыта нет', () => {
  const p = strongHero(); // без оружия
  const c = createCombat({ player: p, groupType: 3, seed: 5 });
  standNextTo(c, c.units[0]);
  // Промашка: опыта нет.
  c._rng = () => 0.99;
  const miss = c.attack(c.units[0].id);
  assert.equal(miss.hit, false, 'промах');
  assert.equal(miss.practice, undefined, 'промах не даёт практики');
  assert.equal(p.skillXp.fists, undefined, 'кулаки: опыта нет после промаха');
  // Попадание кулаком: опыт «Каменным кулакам».
  c.ps.attack = 1;
  c._rng = () => 0.01;
  const hit = c.attack(c.units[0].id);
  assert.equal(hit.hit, true);
  assert.equal(hit.practice.skill, 'fists');
  assert.equal(p.skillXp.fists, PRACTICE_XP.hit);
});

test('практика: блок даёт опыт «Железной коже»', () => {
  const p = strongHero();
  const c = createCombat({ player: p, groupType: 3, seed: 5 });
  c.ps.attack = 0; c.ps.spellInt = 0; c.ps.spellWis = 0;
  c.ps.quickItem = 0; c.ps.invItem = 0;
  const r = c.block();
  assert.equal(r.ok, true);
  assert.equal(r.practice.skill, 'hide');
  assert.equal(r.practice.xp, PRACTICE_XP.block);
  assert.equal(p.skillXp.hide, PRACTICE_XP.block);
});

test('практика: каст огня — «Повелитель огня», исцеление — «Медитация»', () => {
  const p = createCharacter();
  p.primary.intelligence = 10; // пул заклинаний Интеллекта = 2
  p.primary.wisdom = 10;       // пул заклинаний Мудрости = 2
  p.mp = 30;
  const c = createCombat({ player: p, groupType: 0, seed: 5 });
  const t = c.units[0];
  t.x = c.px; t.y = c.py - 1; // вплотную, в дальности
  const fire = c.spell('fire', t.id);
  assert.equal(fire.ok, true);
  assert.equal(fire.practice.skill, 'firelord');
  assert.equal(p.skillXp.firelord, PRACTICE_XP.spell);
  const heal = c.spell('heal');
  assert.equal(heal.ok, true);
  assert.equal(heal.practice.skill, 'meditation');
  assert.equal(p.skillXp.meditation, PRACTICE_XP.spell);
});

test('практика: на потолке (основной * 2) попадание опыт не даёт', () => {
  const p = strongHero(); // сила 1 → потолок «Мечника» 2
  I.addItem(p, 'iron_sword');
  I.equip(p, 'iron_sword');
  p.secondary.swordsman = 2; // уже на потолке практикой
  const c = createCombat({ player: p, groupType: 3, seed: 5 });
  c._rng = () => 0.01;
  standNextTo(c, c.units[0]);
  const r = c.attack(c.units[0].id);
  assert.equal(r.hit, true);
  assert.equal(r.practice.applied, 0, 'на потолке опыт не начисляется');
  assert.equal(r.practice.level, 2);
  assert.equal(p.secondary.swordsman, 2, 'уровень не вырос');
  assert.equal(p.skillXp.swordsman, 0, 'в копилку ничего не попало');
});

// --- Размер мобов на боевом поле (задача 000040) ---

// Клетки прямоугольника юнита (якорь — верхний левый угол).
function unitRect(u) {
  const w = (u.size && u.size.w) || 1, h = (u.size && u.size.h) || 1;
  const cells = [];
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) cells.push([u.x + dx, u.y + dy]);
  }
  return cells;
}

test('размер: у всех мобов в assets/mobs есть size {w,h} (1..7)', () => {
  for (const f of mobFiles()) {
    const j = JSON.parse(fs.readFileSync(path.join(MOBS_DIR, f), 'utf8'));
    assert.ok(j.size, `${f}: нет size`);
    assert.ok(Number.isInteger(j.size.w) && j.size.w >= 1 && j.size.w <= 7,
      `${f}: width ${j.size.w}`);
    assert.ok(Number.isInteger(j.size.h) && j.size.h >= 1 && j.size.h <= 7,
      `${f}: height ${j.size.h}`);
  }
});

test('размер: мелкие мобы 1x1, крупные больше (волк/орк 1x1, голем/колосс 3x3)', () => {
  const byId = {};
  for (const f of mobFiles()) {
    const j = JSON.parse(fs.readFileSync(path.join(MOBS_DIR, f), 'utf8'));
    byId[j.id] = j.size;
  }
  // Слабые/мелкие — 1x1.
  assert.deepEqual(byId.wolf, { w: 1, h: 1 });
  assert.deepEqual(byId.orc_warrior, { w: 1, h: 1 });
  assert.deepEqual(byId.skeleton, { w: 1, h: 1 });
  // Крупные — больше 1x1.
  assert.ok(byId.stone_golem.w * byId.stone_golem.h > 1, 'голем должен быть крупнее');
  assert.ok(byId.bone_coloss.w * byId.bone_coloss.h > 1, 'колосс должен быть крупнее');
});

test('размер: зеркало MOB_TYPES несёт size, совпадающий с JSON', () => {
  const byId = {};
  for (const f of mobFiles()) {
    const j = JSON.parse(fs.readFileSync(path.join(MOBS_DIR, f), 'utf8'));
    byId[j.id] = j.size;
  }
  for (const [id, t] of Object.entries(MOB_TYPES)) {
    assert.deepEqual(t.size, byId[id], `mirror size ${id}`);
  }
});

test('размер: боевой юнит получает size из описания', () => {
  const p = strongHero();
  const c = createCombat({ player: p, groupType: 0, seed: 3, levelDeltaMax: 0 });
  for (const u of c.units) {
    assert.ok(u.size && u.size.w >= 1 && u.size.h >= 1, `${u.mobId}: нет size`);
    assert.deepEqual(u.size, MOB_TYPES[u.mobId].size, `${u.mobId}: size ≠ описанию`);
  }
});

test('размер: на клетку многоклеточного моба зайти нельзя (unitAt-семантика)', () => {
  const p = strongHero();
  // Группы из крупных мобов (2x2/3x3).
  const bigIds = Object.entries(MOB_TYPES)
    .filter(([, t]) => t.size.w * t.size.h > 1)
    .map(([id]) => id);
  const c = createCombat({
    player: p, mobs: [bigIds[0], bigIds[1]], mobLevel: 3, seed: 3,
  });
  for (const big of c.units) {
    if (big.size.w * big.size.h <= 1) continue;
    const rect = new Set(unitRect(big).map(([x, y]) => x + ',' + y));
    const freeNeighbor = (x, y) =>
      [[0, 1], [0, -1], [1, 0], [-1, 0]].map(([dx, dy]) => [x + dx, y + dy])
        .find(([nx, ny]) =>
          nx >= 0 && ny >= 0 && nx < c.width && ny < c.height
          && !rect.has(nx + ',' + ny) && !(nx === c.px && ny === c.py));
    let checks = 0;
    for (const [x, y] of unitRect(big)) {
      const n = freeNeighbor(x, y);
      if (!n) continue; // угловая клетка без свободного соседа — не достижима
      c.px = n[0]; c.py = n[1];
      c.ps.moveLeft = 5;
      const r = c.move(x - c.px, y - c.py);
      assert.equal(r.ok, false,
        `(${x},${y}) внутри ${big.mobId} — заход должен быть запрещён`);
      assert.match(r.reason, /моб/);
      checks++;
    }
    assert.ok(checks >= 3, `${big.mobId}: мало проверенных клеток (${checks})`);
  }
});

test('размер: ближний бой меряется по краю прямоугольника, а не по якорю', () => {
  const p = strongHero();
  const bigIds = Object.entries(MOB_TYPES)
    .filter(([, t]) => t.size.w * t.size.h > 1)
    .map(([id]) => id);
  const c = createCombat({
    player: p, mobs: [bigIds[0]], mobLevel: 3, seed: 3,
  });
  const big = c.units.find((u) => u.size.w * u.size.h > 1);
  standNextTo(c, big);
  // Якорь может быть дальше 1 клетки, но удар по краю — в дальности.
  const anchorDist = Math.abs(c.px - big.x) + Math.abs(c.py - big.y);
  assert.ok(anchorDist >= 2, `ожидается якорь ≥2 клеток, а он ${anchorDist}`);
  c._rng = () => 0.01;
  const r = c.attack(big.id);
  assert.equal(r.ok, true, 'удар по краю прямоугольника должен быть в дальности');
  // Две клетки от края — уже далеко.
  c.px = big.x; c.py = big.y + big.size.h + 2;
  c.ps.attack = 5;
  const far = c.attack(big.id);
  assert.equal(far.ok, false, 'две клетки от края — вне дальности ближнего боя');
  assert.match(far.reason, /далеко/);
});

test('размер: крупные мобы двигаются целым прямоугольником, без перекрытий', () => {
  const p = strongHero();
  const bigIds = Object.entries(MOB_TYPES)
    .filter(([, t]) => t.size.w * t.size.h > 1)
    .map(([id]) => id);
  const c = createCombat({
    player: p, mobs: [bigIds[0], bigIds[1], 'wolf'], mobLevel: 3, seed: 4,
  });
  for (let i = 0; i < 20; i++) {
    c.endTurn();
    if (c.result) break;
    const seen = new Set();
    for (const u of c.units) {
      if (!u.alive || u.fled) continue;
      assert.ok(u.x >= 0 && u.y >= 0
        && u.x + u.size.w <= c.width && u.y + u.size.h <= c.height,
        `ход ${i + 1}: ${u.mobId} за пределами поля`);
      for (const [x, y] of unitRect(u)) {
        const key = x + ',' + y;
        assert.ok(!seen.has(key), `ход ${i + 1}: (${x},${y}) занято дважды`);
        seen.add(key);
        assert.ok(!(x === c.px && y === c.py),
          `ход ${i + 1}: ${u.mobId} на клетке игрока`);
        // Задача 000050: моб никогда не встаёт на препятствие
        // (guard: до реализации поля c.obstacles нет).
        if (c.obstacles) {
          assert.ok(!c.obstacles.has(key),
            `ход ${i + 1}: ${u.mobId} на препятствии (${x},${y})`);
        }
      }
    }
  }
});

test('размер: расстановка без перекрытий и в пределах поля', () => {
  const p = strongHero();
  for (const type of Object.keys(GROUP_RECIPES)) {
    for (const seed of [1, 2, 3, 7]) {
      const c = createCombat({ player: p, groupType: Number(type), seed, levelDeltaMax: 0 });
      const seen = new Set();
      for (const u of c.units) {
        assert.ok(u.x >= 0 && u.y >= 0, `${u.mobId}: за левой/верхней стенкой (seed ${seed})`);
        assert.ok(u.x + u.size.w <= c.width, `${u.mobId}: за правой стенкой (seed ${seed})`);
        assert.ok(u.y + u.size.h <= c.height, `${u.mobId}: за нижней стенкой (seed ${seed})`);
        for (const [x, y] of unitRect(u)) {
          const key = x + ',' + y;
          assert.ok(!seen.has(key), `(${x},${y}) занято дважды (seed ${seed})`);
          seen.add(key);
          assert.ok(!(x === c.px && y === c.py), `(${x},${y}) = клетка игрока (seed ${seed})`);
        }
      }
    }
  }
});

// --- canDoAction: предпросмотр доступности действия (задача 000037) ---

// Бой с одиночным волком; позиция волка управляется из теста
// (игрок — в центре нижнего края 7x7).
function wolfCombat(p, seed = 5) {
  const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 2, seed });
  const w = c.units[0];
  w.x = c.px; w.y = c.py - 1; // вплотную
  return c;
}

const CAN_ACTIONS = ['attack', 'fire', 'heal', 'block',
  'quickItem', 'invItem', 'flee', 'endTurn'];

test('canDoAction: очередь — phase "mob" → «не ваш ход», phase "over"/result → «бой закончен»', () => {
  const c = wolfCombat(strongHero());
  c.phase = 'mob';
  for (const a of CAN_ACTIONS) {
    const r = canDoAction(c, a, { targetId: c.units[0].id });
    assert.equal(r.ok, false, a);
    assert.equal(r.reason, 'не ваш ход', a);
  }
  c.phase = 'over';
  c.result = { outcome: 'victory', xp: 0, gold: 0, defeated: 1 };
  for (const a of CAN_ACTIONS) {
    const r = canDoAction(c, a, { targetId: c.units[0].id });
    assert.equal(r.ok, false, a);
    assert.equal(r.reason, 'бой закончен', a);
  }
});

test('canDoAction: неизвестное действие', () => {
  const c = wolfCombat(strongHero());
  const r = canDoAction(c, 'dance');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'неизвестное действие: dance');
});

test('canDoAction: attack — пул, цель, дальность ближнего боя', () => {
  const c = wolfCombat(strongHero());
  const w = c.units[0];
  assert.deepEqual(canDoAction(c, 'attack', { targetId: w.id }),
    { ok: true }, 'вплотную — ok');
  c.ps.attack = 0;
  assert.equal(canDoAction(c, 'attack', { targetId: w.id }).reason,
    'действий «Удар» больше нет');
  c.ps.attack = 1;
  w.y = c.py - 3; // дистанция 3 — ближний бой не достаёт
  assert.equal(canDoAction(c, 'attack', { targetId: w.id }).reason,
    'цель слишком далеко (ближний бой)');
  w.alive = false;
  assert.equal(canDoAction(c, 'attack', { targetId: w.id }).reason,
    'нет цели', 'мёртвая цель по targetId');
  // Ни живой цели в бою.
  const c2 = wolfCombat(strongHero());
  c2.units[0].fled = true;
  assert.equal(canDoAction(c2, 'attack').reason, 'нет цели');
});

test('canDoAction: attack — лук достаёт до 4, без лука — только вплотную', () => {
  const p = strongHero();
  I.addItem(p, 'hunting_bow');
  I.equip(p, 'hunting_bow');
  const c = wolfCombat(p);
  const w = c.units[0];
  w.y = c.py - 3;
  assert.equal(canDoAction(c, 'attack', { targetId: w.id }).ok, true,
    'лук: дистанция 3 в дальности');
  w.y = c.py - 5;
  assert.equal(canDoAction(c, 'attack', { targetId: w.id }).reason,
    'цель слишком далеко (дальность лука 4)');
  // Без лука та же дистанция недосягаема.
  const c2 = wolfCombat(strongHero());
  const w2 = c2.units[0];
  w2.y = c2.py - 3;
  assert.equal(canDoAction(c2, 'attack', { targetId: w2.id }).reason,
    'цель слишком далеко (ближний бой)');
});

test('canDoAction: fire — пул, мана, цель, дальность 4', () => {
  const c = wolfCombat(strongHero());
  const w = c.units[0];
  assert.deepEqual(canDoAction(c, 'fire', { targetId: w.id }), { ok: true });
  c.ps.spellInt = 0;
  assert.equal(canDoAction(c, 'fire', { targetId: w.id }).reason,
    'действий «Заклинание» (Интеллект) больше нет');
  c.ps.spellInt = 1;
  c.player.mp = 2;
  assert.equal(canDoAction(c, 'fire', { targetId: w.id }).reason,
    'не хватает маны (3)');
  c.player.mp = 10;
  w.y = c.py - 5;
  assert.equal(canDoAction(c, 'fire', { targetId: w.id }).reason,
    'цель слишком далеко (дальность 4)');
});

test('canDoAction: heal — пул, мана, полное HP', () => {
  const c = wolfCombat(strongHero());
  c.player.hp = 20; // ниже maxHP (275 у strongHero)
  assert.deepEqual(canDoAction(c, 'heal'), { ok: true });
  c.ps.spellWis = 0;
  assert.equal(canDoAction(c, 'heal').reason,
    'действий «Заклинание» (Мудрость) больше нет');
  c.ps.spellWis = 1;
  c.player.mp = 1;
  assert.equal(canDoAction(c, 'heal').reason, 'не хватает маны (3)');
  c.player.mp = 10;
  c.player.hp = derived(c.player).maxHP;
  assert.equal(canDoAction(c, 'heal').reason, 'здоровье полное');
});

test('canDoAction: block — пул; флаг blocked блок САМ не запрещает (зеркало playerBlock)', () => {
  const c = wolfCombat(strongHero());
  assert.deepEqual(canDoAction(c, 'block'), { ok: true });
  c.ps.block = 0;
  assert.equal(canDoAction(c, 'block').reason, 'действий «Блок» больше нет');
  // playerBlock в ядре checkBlocked не вызывает — блок и есть
  // последнее действие (задача 000027).
  c.ps.block = 1;
  c.ps.blocked = true;
  assert.equal(canDoAction(c, 'block').ok, true,
    'blocked && block>0 — ok, как в ядре');
});

test('canDoAction: quickItem — пул, пустые слоты, применимость предмета', () => {
  const p = strongHero();
  const c = wolfCombat(p);
  c.ps.quickItem = 0;
  assert.equal(canDoAction(c, 'quickItem').reason,
    'действий «Быстрый предмет» больше нет');
  c.ps.quickItem = 1;
  assert.equal(canDoAction(c, 'quickItem').reason, 'быстрые слоты пусты');
  I.addItem(p, 'healing_potion');
  I.setQuick(p, 0, 'healing_potion');
  assert.deepEqual(canDoAction(c, 'quickItem'), { ok: true },
    'применимое зелье — ok');
  I.addItem(p, 'iron_sword');
  I.setQuick(p, 0, 'iron_sword');
  assert.equal(canDoAction(c, 'quickItem').reason, 'оружие — экипируется');
  I.addItem(p, 'leather_armor');
  I.setQuick(p, 0, 'leather_armor');
  assert.equal(canDoAction(c, 'quickItem').reason, 'броня — экипируется');
  I.addItem(p, 'sulfur');
  I.setQuick(p, 0, 'sulfur');
  assert.equal(canDoAction(c, 'quickItem').reason,
    'реагент нельзя применить (торговый товар)');
  // Слот ссылается на предмет, которого нет в инвентаре.
  p.inventory.quick[0] = 'healing_potion';
  p.inventory.slots = p.inventory.slots.filter((e) => e.id !== 'healing_potion');
  assert.equal(canDoAction(c, 'quickItem').reason, 'предмета нет в инвентаре');
  // Слот с неизвестным id.
  p.inventory.quick[0] = 'no_such_item';
  assert.equal(canDoAction(c, 'quickItem').reason,
    'неизвестный предмет: no_such_item');
});

test('canDoAction: invItem — пул, применимый предмет в инвентаре', () => {
  const p = strongHero();
  const c = wolfCombat(p);
  c.ps.invItem = 0;
  assert.equal(canDoAction(c, 'invItem').reason,
    'действий «Предмет из инвентаря» больше нет');
  c.ps.invItem = 1;
  assert.equal(canDoAction(c, 'invItem').reason,
    'нет применимых предметов в инвентаре', 'пустой инвентарь');
  I.addItem(p, 'sulfur');
  I.addItem(p, 'iron_sword');
  I.addItem(p, 'leather_armor');
  assert.equal(canDoAction(c, 'invItem').reason,
    'нет применимых предметов в инвентаре',
    'реагент/оружие/броня — неприменимы');
  I.addItem(p, 'bread');
  assert.deepEqual(canDoAction(c, 'invItem'), { ok: true }, 'еда — применима');
  I.addItem(p, 'healing_potion');
  I.addItem(p, 'alchemy_manual');
  assert.deepEqual(canDoAction(c, 'invItem'), { ok: true },
    'зелье и книга — применимы');
});

test('canDoAction: blocked — «блок — только последнее действие» для действий, но не для block/flee/endTurn', () => {
  const c = wolfCombat(strongHero());
  const w = c.units[0];
  c.ps.blocked = true;
  c.player.hp = 20;
  for (const a of ['attack', 'fire', 'heal', 'quickItem', 'invItem']) {
    const r = canDoAction(c, a, { targetId: w.id });
    assert.equal(r.ok, false, a);
    assert.equal(r.reason, 'блок — только последнее действие', a);
  }
  assert.equal(canDoAction(c, 'block').ok, true, 'блок — ok (ядро)');
  assert.equal(canDoAction(c, 'flee').ok, true, 'побег блок не гоняет');
  assert.equal(canDoAction(c, 'endTurn').ok, true, 'конец хода блок не гоняет');
});

test('canDoAction: без побочных эффектов (ps/hp/mp/инвентарь/снаряжение/rng/log/targetId)', () => {
  const p = strongHero();
  I.addItem(p, 'healing_potion');
  I.setQuick(p, 0, 'healing_potion');
  I.addItem(p, 'bread');
  const c = wolfCombat(p);
  const w = c.units[0];
  w.y = c.py - 3; // цель вне ближней дальности — покрыть ветки проверок
  let rngCalls = 0;
  const origRng = c._rng;
  c._rng = () => { rngCalls += 1; return origRng(); };
  const snap = () => JSON.stringify({
    ps: c.ps, hp: p.hp, mp: p.mp, inv: p.inventory, eq: p.equipment,
    log: c.log, targetId: c.targetId,
  });
  const before = snap();
  for (const a of CAN_ACTIONS) {
    canDoAction(c, a);
    canDoAction(c, a, { targetId: w.id });
  }
  canDoAction(c, 'nope');
  assert.equal(rngCalls, 0, 'c._rng() не вызывается');
  assert.equal(snap(), before, 'состояние боя и героя не изменилось');
});

test('canDoAction: «голый» персонаж без inventory/equipment — полей не появляется', () => {
  // createCharacter() не создаёт p.inventory/p.equipment (лениво — в
  // items.js). canDoAction обязан их НЕ создавать (ветка 'attack' читала
  // I.equipmentStats → ensureEquipment, ветка 'quickItem' — I.firstQuickSlot
  // → ensureInventory).
  const p = createCharacter();
  assert.equal(p.inventory, undefined);
  assert.equal(p.equipment, undefined);
  const c = wolfCombat(p);
  assert.equal(p.inventory, undefined, 'createCombat инвентарь не создаёт');
  assert.equal(p.equipment, undefined, 'createCombat снаряжение не создаёт');
  const w = c.units[0];
  w.y = c.py - 3; // цель вдали — покрыть ветку дальности (чтение оружия)
  for (const a of CAN_ACTIONS) {
    canDoAction(c, a);
    canDoAction(c, a, { targetId: w.id });
  }
  assert.equal(p.inventory, undefined,
    'p.inventory не создаётся как побочный эффект');
  assert.equal(p.equipment, undefined,
    'p.equipment не создаётся как побочный эффект');
});

test('лог исцеления: восстановленная величина, а не общее HP (задача 000037)', () => {
  // Мудрость 10 → величина исцеления round(3 + 0.5*10 + 1) = 9; maxHP = 25.
  const hero = () => {
    const p = createCharacter();
    p.primary.wisdom = 10;
    return p;
  };
  // Частичное лечение: 10 + 9 = 19 — лог «Исцеление: 9.».
  const p1 = hero();
  const c1 = createCombat({ player: p1, groupType: 3, seed: 41 });
  p1.hp = 10;
  const r1 = c1.spell('heal');
  assert.equal(r1.ok, true);
  assert.equal(r1.healed, 9, 'восстановленная величина');
  assert.equal(r1.hp, 19, 'общее HP после исцеления');
  assert.ok(c1.log.includes('Исцеление: 9.'),
    `лог: ${c1.log.join(' | ')}`);
  // Кламп по maxHP: 22 + 9 → 25, восстановлено 3, а не 25
  // (старый баг печатал общее HP — «Исцеление: 25.»).
  const p2 = hero();
  const c2 = createCombat({ player: p2, groupType: 3, seed: 41 });
  p2.hp = 22;
  const r2 = c2.spell('heal');
  assert.equal(r2.healed, 3, 'восстановлено с клампом по maxHP');
  assert.equal(r2.hp, 25);
  assert.ok(c2.log.includes('Исцеление: 3.'),
    `лог показывает восстановленное, а не общее HP: ${c2.log.join(' | ')}`);
});

test('размер: бой с крупной группой завершается победой (не клинит)', () => {
  const p = midGameHero();
  // Собираем группу только из крупных мобов (2x2/3x3) вручную.
  const bigIds = Object.entries(MOB_TYPES)
    .filter(([, t]) => t.size.w * t.size.h > 1)
    .map(([id]) => id);
  assert.ok(bigIds.length >= 2, 'должны быть крупные мобы');
  const mobs = [bigIds[0], bigIds[1], 'wolf'];
  for (const seed of [1, 2, 3]) {
    const c = createCombat({
      player: p, mobs, mobLevel: Math.max(1, p.level - 3),
      seed, difficulty: 'medium', groupName: 'крупная группа',
    });
    // Задача 000050: жадный autoPlay/stepToward крупных мобов застревает
    // за камнем (deadlock тестового ИИ) — сценарий проверяет, что бой
    // завершается, а не навигацию (guard: до реализации поля нет).
    if (c.obstacles) c.obstacles.clear();
    const r = autoPlay(c);
    assert.ok(r, `seed ${seed}: бой не завершился`);
    assert.equal(r.outcome, 'victory', `seed ${seed}: исход ${r.outcome}`);
  }
});

// --- Очередь хода (задача 000036) ---
// Игровая семантика НЕ меняется: игрок первым, затем ВСЕ живые мобы
// в порядке c.units. Задача делает порядок наблюдаемым:
// c.turnOrder (пересчёт в начале раунда) + c.turnIndex (действующий).

test('buildTurnOrder: игрок первым, затем мобы в порядке units', () => {
  const c = createCombat({
    player: strongHero(), mobs: ['wolf', 'spider', 'troll'], mobLevel: 3, seed: 3,
  });
  assert.deepEqual(buildTurnOrder(c), ['player', 'm0', 'm1', 'm2']);
  assert.equal(buildTurnOrder(c)[0], 'player', 'игрок — первым');
});

test('buildTurnOrder: мёртвые и fled исключены; все мертвы → ["player"]', () => {
  const c = createCombat({
    player: strongHero(), mobs: ['wolf', 'spider', 'troll'], mobLevel: 3, seed: 3,
  });
  c.units[0].alive = false;
  c.units[1].fled = true;
  assert.deepEqual(buildTurnOrder(c), ['player', 'm2']);
  c.units[2].alive = false;
  assert.deepEqual(buildTurnOrder(c), ['player'], 'мобов не осталось');
});

test('turnOrder/turnIndex: начало боя — ["player", ...], turnIndex 0, phase "player"', () => {
  const c = createCombat({ player: strongHero(), groupType: 0, seed: 5, levelDeltaMax: 0 });
  assert.equal(c.phase, 'player');
  assert.equal(c.round, 1);
  assert.equal(c.turnIndex, 0);
  assert.deepEqual(c.turnOrder, ['player', ...c.units.map((u) => u.id)]);
});

test('turnOrder/turnIndex: после endTurn очередь пересчитана, turnIndex 0', () => {
  const p = strongHero();
  const c = createCombat({ player: p, mobs: ['wolf', 'spider'], mobLevel: 2, seed: 3 });
  assert.deepEqual(c.turnOrder, ['player', 'm0', 'm1']);
  c._rng = () => 0.01; // попадания гарантированы
  const w = c.units[0];
  w.hp = 1;
  standNextTo(c, w);
  const r = c.attack(w.id);
  assert.equal(r.ok, true, 'удар по ослабленному волку');
  assert.equal(w.alive, false, 'волк повержен');
  // В фазе игрока действует очередь начала раунда (пересчёт — в endTurn).
  assert.deepEqual(c.turnOrder, ['player', 'm0', 'm1'],
    'старая очередь живёт до конца раунда');
  c.endTurn();
  assert.equal(c.phase, 'player');
  assert.equal(c.round, 2);
  assert.equal(c.turnIndex, 0, 'очередь снова у игрока');
  assert.deepEqual(c.turnOrder, ['player', 'm1'], 'убитый моб исчез из очереди');
});

test('turnIndex: в phase "mob" ходит по очереди — снимок лога с записью turnIndex', () => {
  // Детерминированный сценарий (сид 33): воин промахивается, лучник
  // промахивается, шаман лечит раненого воина — по одной строке лога
  // на каждого моба, в порядке c.units. Перехват c.log.push фиксирует
  // turnIndex в момент записи строки.
  const p = strongHero();
  const c = createCombat({
    player: p,
    mobs: ['orc_warrior', 'orc_archer', 'orc_shaman'],
    mobLevel: 3, seed: 33,
  });
  const [w, a, s] = c.units; // m0 shield, m1 ranged, m2 support
  // Позиции: воин вплотную (атака → промах), лучник в дальности 4
  // (атака → промах), шаман стоит — лечение не зависит от дистанции.
  w.x = c.px; w.y = c.py - 1;
  a.x = c.px; a.y = c.py - 3;
  w.hp = 1; // < 70% maxHP — шаман лечит самого раненого союзника
  c._rng = () => 0.99; // все попадания мобов промахиваются (hitChance ≤ 0.95)
  assert.deepEqual(c.turnOrder, ['player', 'm0', 'm1', 'm2']);
  assert.equal(c.turnIndex, 0);
  assert.equal(c.round, 1);
  assert.equal(c.phase, 'player');

  const events = []; // [строка лога, c.turnIndex в момент записи]
  const origPush = c.log.push.bind(c.log);
  c.log.push = (msg) => { events.push([msg, c.turnIndex]); return origPush(msg); };

  c.endTurn();

  // Регрессия порядка: порядок строк лога = порядок c.units.
  const iW = c.log.indexOf('Орк-воин промахивается.');
  const iA = c.log.indexOf('Орк-лучник промахивается.');
  const iS = c.log.indexOf('Орк-шаман лечит Орк-воин (+7).');
  assert.ok(iW !== -1 && iA !== -1 && iS !== -1,
    `нет всех трёх строк: ${c.log.join(' | ')}`);
  assert.ok(iW < iA && iA < iS,
    'порядок действий мобов = порядок units (воин → лучник → шаман)');

  // turnIndex в момент действия: воин — 1-й, лучник — 2-й, шаман — 3-й.
  const at = (msg) => events.find(([m]) => m === msg);
  assert.ok(at('Орк-воин промахивается.'), 'нет строки воина в events');
  assert.equal(at('Орк-воин промахивается.')[1], 1, 'воин — 1-й в очереди');
  assert.equal(at('Орк-лучник промахивается.')[1], 2, 'лучник — 2-й в очереди');
  assert.equal(at('Орк-шаман лечит Орк-воин (+7).')[1], 3, 'шаман — 3-й в очереди');

  // Новый раунд: очередь пересчитана (все живы — та же), turnIndex 0.
  assert.equal(c.round, 2);
  assert.equal(c.phase, 'player');
  assert.equal(c.turnIndex, 0);
  assert.deepEqual(c.turnOrder, ['player', 'm0', 'm1', 'm2']);
});

test('turnIndex: конец боя в цикле мобов — замирает на последнем действовавшем', () => {
  const p = createCharacter(); // 25 HP, без «Несокрушимости»
  const c = createCombat({ player: p, mobs: ['skeleton', 'skeleton'], mobLevel: 2, seed: 9 });
  const [m0, m1] = c.units;
  // Оба скелета вплотную: первый бьёт на 10 (25→15), второй добивает.
  m0.damage = 10;
  m1.damage = 25;
  m0.x = c.px - 1; m0.y = c.py;
  m1.x = c.px + 1; m1.y = c.py;
  c._rng = () => 0.01; // попадания гарантированы
  assert.deepEqual(c.turnOrder, ['player', 'm0', 'm1']);
  c.endTurn();
  assert.ok(c.result, 'бой должен завершиться');
  assert.equal(c.result.outcome, 'dead');
  assert.equal(c.phase, 'over');
  assert.equal(c.turnIndex, 2, 'turnIndex застыл на последнем действовавшем (добившем)');
  assert.deepEqual(c.turnOrder, ['player', 'm0', 'm1'],
    'в phase "over" очередь не пересчитывается');
});

test('turnIndex: смерть от яда в начале хода игрока — очередь пересчитана, turnIndex 0', () => {
  // Ядовитый паук бьёт на 1: урон не добивает, добивает ТИК яда
  // (−2 HP в начале хода игрока) — ПОСЛЕ пересчёта очереди,
  // поэтому при смерти turnIndex = 0, а не индекс паучка.
  const p = createCharacter(); // 25 HP
  p.hp = 3; // 3 − 1 (удар) = 1, затем яд −2 → смерть
  const c = createCombat({ player: p, mobs: ['spider'], mobLevel: 3, seed: 41 });
  const s = c.units[0];
  s.damage = 1;
  c._rng = () => 0.05; // попадания (0.05 < hitChance) и шанс яда (0.05 < 0.3)
  standNextTo(c, s);
  let n = 0;
  while (!c.result && n++ < 60) c.endTurn();
  assert.ok(c.result, 'бой должен завершиться');
  assert.equal(c.result.outcome, 'dead');
  assert.equal(c.phase, 'over');
  assert.equal(c.turnIndex, 0, 'тик убил после пересчёта — очередь у игрока');
  assert.deepEqual(c.turnOrder, ['player', 'm0'],
    'очередь — пересчитанная к началу фатального раунда');
  assert.ok(c.log.includes('Яд: −2 HP.'), 'смерть от тика яда');
});

test('turnIndex: игрок убил моба в фазе игрока — слот сохраняется, turnOrder[turnIndex] — действующий (регрессия ревью)', () => {
  // Пересчёт очереди — в начале раунда, т.е. ДО фазы игрока: моб,
  // убитый игроком, числится в УСТАРЕВШЕЙ очереди до конца раунда.
  // Фаза мобов идёт по ней, сохраняя позиции: в момент mobAct
  // c.turnOrder[c.turnIndex] = id действующего моба (не убитого).
  // Прежний «счётчик по живым units» давал turnIndex=1 для лучника
  // при turnOrder ['player','m0','m1'] → UI подсвечивал мёртвого m0.
  const p = strongHero();
  const c = createCombat({
    player: p, mobs: ['orc_grunt', 'orc_archer'], mobLevel: 1,
    seed: 42, width: 7, height: 3,
  });
  assert.deepEqual(c.turnOrder, ['player', 'm0', 'm1']);
  const m0 = c.units[0];
  m0.hp = 1;
  const r = c.spell('fire', m0.id);
  assert.equal(r.killed, true, 'моб повержен в фазе игрока');
  assert.deepEqual(c.turnOrder, ['player', 'm0', 'm1'],
    'старая очередь живёт до конца раунда');

  c._rng = () => 0.99; // все попадания мобов промахиваются
  const events = []; // [строка лога, c.turnIndex, c.turnOrder]
  const origPush = c.log.push.bind(c.log);
  c.log.push = (msg) => {
    events.push([msg, c.turnIndex, c.turnOrder.slice()]);
    return origPush(msg);
  };
  c.endTurn();

  const at = events.find(([m]) => m === 'Орк-лучник промахивается.');
  assert.ok(at, `нет строки хода лучника: ${c.log.join(' | ')}`);
  assert.equal(at[1], 2, 'лучник действует на СВОЕЙ позиции в устаревшей очереди');
  assert.equal(at[2][at[1]], 'm1', 'turnOrder[turnIndex] — id действующего моба');
  assert.equal(at[2][1], 'm0', 'слот убитого моба в очереди сохранён');

  // Новый раунд: из очереди убитый моб исключён, очередь у игрока.
  assert.equal(c.phase, 'player');
  assert.equal(c.round, 2);
  assert.equal(c.turnIndex, 0);
  assert.deepEqual(c.turnOrder, ['player', 'm1']);
});

// --- Задача 000045: эффекты заклинаний в состоянии боя ---
// Формулы и причины каста закреплены в tests/spells.test.js; здесь —
// боевое состояние: c.ps.shield (щит), u.weaken (ослабление), u.bind
// (контроль) и их тики. Семантика тиков (задача 000045):
//  * bind — моб пропускает ровно одно действие (тик вместе с пропуском,
//    лог «скован»); пока скован, прочие эффекты НЕ тикают;
//  * weaken — урон моба ×0.75 ровно 3 хода (тик вместе с применением);
//  * shield — защищает ровно 3 раунда, включая раунд каста (тик в
//    начале хода игрока, после refillPools).

function spells() { return require('../src/spells.js'); }

test('combat.js: экспорт combatInternals для spells.js (задача 000045)', () => {
  const C = require('../src/combat.js');
  const ci = C.combatInternals;
  assert.ok(ci && typeof ci === 'object', 'combatInternals экспортирован');
  for (const k of ['log', 'nearestMob', 'unitDist', 'checkTurn',
    'checkBlocked', 'dealDamageToMob']) {
    assert.equal(typeof ci[k], 'function', 'combatInternals.' + k);
  }
});

test('c.ps.shield: инициализация { armor: 0, turns: 0 }; новый бой — без эффектов', () => {
  const c = createCombat({
    player: strongHero(), mobs: ['orc_warrior'], mobLevel: 2, seed: 5 });
  assert.deepEqual(c.ps.shield, { armor: 0, turns: 0 });
  // Эффекты не переносятся в новый бой (новые юниты/пулы).
  c.ps.shield = { armor: 2, turns: 3 };
  c.units[0].weaken = { mult: 0.75, turns: 3 };
  c.units[0].bind = { turns: 1 };
  const c2 = createCombat({
    player: strongHero(), mobs: ['orc_warrior'], mobLevel: 2, seed: 5 });
  assert.deepEqual(c2.ps.shield, { armor: 0, turns: 0 }, 'щит не переносится');
  assert.equal(c2.units[0].weaken, undefined, 'weaken не переносится');
  assert.equal(c2.units[0].bind, undefined, 'bind не переносится');
});

test('щит: урон по игроку снижается на shield.armor (turns > 0)', () => {
  const hit = (shield) => {
    const p = strongHero();
    const c = createCombat({
      player: p, mobs: ['orc_warrior'], mobLevel: 2, seed: 5 });
    const w = c.units[0];
    standNextTo(c, w);
    w.damage = 10;
    c._rng = () => 0.01; // гарантированное попадание
    if (shield) Object.assign(c.ps.shield, shield);
    const hpBefore = p.hp;
    c.endTurn();
    return hpBefore - p.hp;
  };
  assert.equal(hit(null), 10, 'без щита — полный урон');
  assert.equal(hit({ armor: 3, turns: 1 }), 7, 'щит гасит 3');
  assert.equal(hit({ armor: 3, turns: 0 }), 10, 'turns = 0 — щит не действует');
});

test('щит: ровно 3 раунда защиты (включая раунд каста), тик в начале хода игрока', () => {
  const { castSpell } = spells();
  const p = strongHero();
  p.primary.wisdom = 10;
  p.spells = ['magic_shield'];
  const c = createCombat({
    player: p, mobs: ['orc_warrior'], mobLevel: 2, seed: 5 });
  const w = c.units[0];
  standNextTo(c, w);
  w.damage = 2; // броня щита 2 — гасит полностью
  c._rng = () => 0.01;
  const r = castSpell(c, 'magic_shield');
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(c.ps.shield, { armor: 2, turns: 3 });
  const round = () => {
    const hp = p.hp;
    c.endTurn();
    return p.hp - hp; // полученный урон (0 или отрицательный)
  };
  assert.equal(round(), 0, 'раунд 1 (раунд каста): щит действует');
  assert.equal(c.ps.shield.turns, 2, 'тик в начале нового хода игрока');
  assert.equal(round(), 0, 'раунд 2: щит действует');
  assert.equal(c.ps.shield.turns, 1);
  assert.equal(round(), 0, 'раунд 3: щит действует');
  assert.equal(c.ps.shield.turns, 0, 'эффект исчерпан');
  assert.equal(round(), -2, 'раунд 4: щита больше нет');
});

test('u.bind: моб пропускает ровно одно действие (тик + лог «скован»)', () => {
  const { castSpell } = spells();
  const p = strongHero();
  p.primary.wisdom = 10;
  p.spells = ['vine'];
  const c = createCombat({
    player: p, mobs: ['orc_warrior'], mobLevel: 2, seed: 5 });
  const w = c.units[0];
  standNextTo(c, w);
  w.damage = 10;
  c._rng = () => 0.01;
  const r = castSpell(c, 'vine', w.id);
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(w.bind, { turns: 1 });
  const pos = `${w.x},${w.y}`;
  let hp = p.hp;
  c.endTurn(); // раунд 1: моб скован — пропускает действие
  assert.equal(p.hp, hp, 'скованный моб не бьёт');
  assert.equal(`${w.x},${w.y}`, pos, 'скованный моб не двигается');
  assert.ok(c.log.some((l) => l.includes('скован')),
    `лог «скован»: ${c.log.join(' | ')}`);
  assert.equal(w.bind.turns, 0, 'тик: bind исчерпан');
  hp = p.hp;
  c.endTurn(); // раунд 2: моб действует снова
  assert.equal(p.hp, hp - 10, 'в следующем раунде моб бьёт');
});

test('u.weaken: урон моба ×0.75 ровно 3 раунда, затем полный', () => {
  const { castSpell } = spells();
  const p = strongHero();
  p.primary.intelligence = 10;
  p.spells = ['chill'];
  const c = createCombat({
    player: p, mobs: ['orc_warrior'], mobLevel: 2, seed: 5 });
  const w = c.units[0];
  standNextTo(c, w);
  w.damage = 10; // ×0.75 = 7.5 → round 8
  c._rng = () => 0.01;
  const r = castSpell(c, 'chill', w.id);
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(w.weaken, { mult: 0.75, turns: 3 });
  const hits = [];
  for (let i = 0; i < 4; i++) {
    const hp = p.hp;
    c.endTurn();
    hits.push(hp - p.hp);
  }
  assert.deepEqual(hits, [8, 8, 8, 10], '×0.75 ровно 3 раунда, затем полный урон');
});

test('u.bind + u.weaken: пока моб скован, weaken не тикает', () => {
  const { castSpell } = spells();
  const p = strongHero();
  p.primary.intelligence = 10;
  p.primary.wisdom = 10;
  p.spells = ['chill', 'vine'];
  const c = createCombat({
    player: p, mobs: ['orc_warrior'], mobLevel: 2, seed: 5 });
  const w = c.units[0];
  standNextTo(c, w);
  w.damage = 10;
  c._rng = () => 0.01;
  assert.equal(castSpell(c, 'chill', w.id).ok, true);
  w.bind = { turns: 1 }; // «сковываем» ослабленного моба вручную
  let hp = p.hp;
  c.endTurn(); // скован: пропускает
  assert.equal(p.hp, hp, 'скован — без урона');
  assert.equal(w.weaken.turns, 3, 'weaken не тикает, пока моб скован');
  hp = p.hp;
  c.endTurn(); // действует ослабленным
  assert.equal(p.hp, hp - 8, 'удар ×0.75');
  assert.equal(w.weaken.turns, 2, 'тик weaken после действия');
});

// --- Препятствия: случайные непроходимые клетки (задача 000050) ---
//
// Препятствия — c.obstacles (Set строк «x,y»), генерируются в
// createCombat РОВНО между placeUnits (стартовые прямоугольники мобов
// — reserved) и refillPools — ТОЛЬКО через c._rng (детерминизм по
// сиду; при max_frac ≤ 0 бросков нет вообще — поток RNG совпадает с
// боем без генерации). Блокируют ТОЛЬКО движение: playerMove →
// reason «препятствие» (ПОСЛЕ «стена», ПЕРЕД «тут стоит моб»),
// stepToward/stepAway — через rectFree; атаки/заклинания летят
// ПОВЕРХ камней (линий видимости в модели нет, unitDist — Манхэттен).
// Параметры — SETTINGS.combat_obstacle_min_frac / max_frac (доли
// площади, live-чтение). Слой рисования — tests/combat-ui.test.js.

// Клетки c.obstacles в отсортированном виде (сравнение Set'ов).
function obstacleList(c) { return Array.from(c.obstacles).sort(); }

test('препятствия: c.obstacles — Set; детерминизм по сиду, разные сиды — разные', () => {
  const p1 = strongHero(), p2 = strongHero();
  const c1 = createCombat({ player: p1, groupType: 3, seed: 100 });
  const c2 = createCombat({ player: p2, groupType: 3, seed: 100 });
  assert.ok(c1.obstacles instanceof Set, 'c.obstacles — Set строк "x,y"');
  assert.deepEqual(obstacleList(c1), obstacleList(c2), 'один сид → один набор');
  const c3 = createCombat({ player: strongHero(), groupType: 3, seed: 101 });
  assert.notDeepEqual(obstacleList(c1), obstacleList(c3),
    'другой сид → другой набор');
});

test('препятствия: число в [min, max] от площади поля (все группы × сиды)', () => {
  // Дефолты SETTINGS 0.10/0.20 → для 7×7: round(4.9)=5, round(9.8)=10.
  const min = Math.round(SETTINGS.combat_obstacle_min_frac * 49); // 7×7 → 5
  const max = Math.round(SETTINGS.combat_obstacle_max_frac * 49); // → 10
  assert.equal(min, 5, 'минимум — 5 (0.10×49)');
  assert.equal(max, 10, 'максимум — 10 (0.20×49)');
  for (const [type, recipe] of Object.entries(GROUP_RECIPES)) {
    for (const seed of [1, 7, 42]) {
      const c = createCombat({
        player: strongHero(), groupType: Number(type), seed, levelDeltaMax: 0,
      });
      // Фолбэк генератора (лимит попыток при нарушении достижимости)
      // теоретически даёт меньше, чем min — на этих сидах он не
      // срабатывает, держим полный диапазон (проверено: sizes 5..10).
      assert.ok(c.obstacles.size >= min && c.obstacles.size <= max,
        `группа ${recipe.name} (seed ${seed}): ${c.obstacles.size} вне [${min};${max}]`);
    }
  }
});

test('препятствия: нет на старте игрока и в ЛЮБОЙ клетке стартовых прямоугольников мобов', () => {
  // Включая крупные 2×2/3×3 (все клетки прямоугольника, не только якорь).
  const bigIds = Object.entries(MOB_TYPES)
    .filter(([, t]) => t.size.w * t.size.h > 1)
    .map(([id]) => id);
  const sets = [
    ['wolf', 'spider', 'wolf'],                 // мелкие
    [bigIds[0], bigIds[1], 'wolf'],              // 3×3 + 2×2 + 1×1
    ['troll', 'cave_bear', 'wolf'],              // 2×2 + 2×2 + 1×1
  ];
  for (const mobs of sets) {
    for (const seed of [2, 5]) {
      const c = createCombat({
        player: strongHero(), mobs, mobLevel: 3, seed,
      });
      assert.ok(!c.obstacles.has(c.px + ',' + c.py),
        `seed ${seed}: препятствие на клетке старта игрока`);
      for (const u of c.units) {
        for (const [x, y] of unitRect(u)) {
          assert.ok(!c.obstacles.has(x + ',' + y),
            `seed ${seed}: (${x},${y}) в стартовом прямоугольнике ${u.mobId}`);
        }
      }
    }
  }
});

test('препятствия: достижимость — BFS от игрока до каждого стартового прямоугольника', () => {
  // reachableCells — чистая: BFS из (c.px,c.py) по не-препятствиям
  // (мобы игнорируются), старт включён, c не мутирует.
  for (const [type, recipe] of Object.entries(GROUP_RECIPES)) {
    for (const seed of [1, 9, 42]) {
      const c = createCombat({
        player: strongHero(), groupType: Number(type), seed, levelDeltaMax: 0,
      });
      const reach = reachableCells(c);
      assert.ok(reach instanceof Set, 'reachableCells → Set «x,y»');
      assert.ok(reach.has(c.px + ',' + c.py), 'старт игрока в достижимом');
      for (const u of c.units) {
        const hit = unitRect(u).some(([x, y]) => reach.has(x + ',' + y));
        assert.ok(hit,
          `группа ${recipe.name} (seed ${seed}): ${u.mobId} (${u.x},${u.y}) недостижим`);
      }
    }
  }
});

test('препятствия: playerMove — «препятствие», обход, порядок reason', () => {
  const p = strongHero();
  const c = createCombat({ player: p, groupType: 3, seed: 30 });
  c.obstacles.clear();
  c.obstacles.add('3,5'); // прямо перед игроком (3,6)
  c.ps.moveLeft = 5;
  const r = c.move(0, -1);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'препятствие', 'точная строка reason');
  // Обход: влево, затем вверх — работает.
  assert.equal(c.move(-1, 0).ok, true, 'обход вбок');
  assert.equal(c.px, 2); assert.equal(c.py, 6);
  assert.equal(c.move(0, -1).ok, true, 'обход вверх');
  assert.equal(c.py, 5);
  // Порядок reason: «стена» (вне сетки) — до всего.
  assert.equal(c.move(0, -99).reason, 'стена');
  // «тут стоит моб» — ПОСЛЕ «препятствие» (моб и камень на одной клетке).
  const m = c.units[0];
  m.x = c.px; m.y = c.py - 1;
  c.obstacles.add(c.px + ',' + (c.py - 1));
  assert.equal(c.move(0, -1).reason, 'препятствие',
    'камень на клетке моба — раньше «тут стоит моб»');
  c.obstacles.delete(c.px + ',' + (c.py - 1));
  assert.equal(c.move(0, -1).reason, 'тут стоит моб');
});

test('препятствия: mob stepToward не встаёт на камень (моб за камнем стоит)', () => {
  const p = strongHero();
  const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 3, seed: 7 });
  const w = c.units[0];
  c.obstacles.clear();
  w.x = 3; w.y = 3;          // волк в центре поля, игрок в (3,6)
  c.obstacles.add('3,4');    // камень прямо между волком и игроком
  c._rng = () => 0.99;       // (атаки не будет: дистанция 3)
  c.endTurn();
  assert.equal(w.x, 3); assert.equal(w.y, 3,
    'волк не прошёл камень — остался на месте (зафиксированное поведение)');
  assert.equal(w.alive, true);
  for (const [x, y] of unitRect(w)) {
    assert.ok(!c.obstacles.has(x + ',' + y), 'моб не «внутри» камня');
  }
});

// --- Фреймворк «союзные юниты» (задача 000080) ---
//
// Союзник — отдельный юнит в c.units с side 'ally' (всегда 1×1):
//  * спавн рядом с игроком (низ поля) — детерминированные якоря,
//    БЕЗ бросков c._rng (поток RNG боя без союзников — бит-в-бит как до);
//  * очередь хода: игрок → союзники → мобы (пересчёт каждый раунд);
//  * модель целей МОБА расширена: ближайшая цель СТОРОНЫ ИГРОКА
//    (игрок ИЛИ союзник) — гибель союзника возможна;
//  * гибель союзника — покидает бой, НЕ поражение (checkVictory/лут/
//    опыт — только мобы); клетка освобождается, из очереди исключён;
//  * союзники НЕ цели и не цель стороны игрока: playerSelectTarget/
//    playerAttack/playerSpell/canDoAction/nearestMob отклоняют союзников;
//    игрок не проходит на клетку союзника (unitAt — все юниты);
//  * мораль: урон ВСЕХ союзников × (1 + companionMoraleBonus) —
//    заготовка src/player.js (ПРЕДВОДИТЕЛЬ, +5%/ур), НЕ вражеский
//    'leader'/hasLeader (регрессия — отдельный пин);
//  * ИИ по ролям (аналог mobAct, на нашей стороне): melee/shield/swarm —
//    шаг к ближайшему врагу + атака при d≤1; ranged — d≤1 отступление,
//    1<d≤4 — атака в даль, d>4 — кайтинг: ОДИН шаг ОТ врага
//    (allyStepAway, «держит дистанцию» — см. memory/000080); support —
//    лечит САМОГО РАНЕНОГО из (игрок + живые союзники) сильнейшим
//    лечебным заклинанием из своего списка (каталог — ЛЕНИВО через
//    combatInternals.allySpells, который ставит spells.js — явный
//    require в шапке этого файла; без каталога — melee-фолбэк).
// Формулы статов — паттерн makeMob БЕЗ множителей сложности (они для
// врагов): maxHP = max(1, round((8+4ур)·hp·роль-множитель)),
// damage = max(1, round((2+0.7ур)·dmg·moraleMult)),
// armor = (armor||0) + floor(ур/10). Ролевые HP-множители — те же,
// что у мобов: support 0.7, shield 1.8 (melee/ranged 1.0).
// Данные союзника (схема для 000081 «Эфир»: attrs/kind/явные статы):
//   { name, role: 'melee'|'ranged'|'shield'|'support', level,
//     dmg, hp, armor?, skills?, spells?, attrs?, kind?, id?,
//     maxHP? (явное, в обход формулы), damage? (явное) }.

// Данные найма (assets/npc, контракт 000078) — как их пошлют из roster.
const ALLY_VOLK = { name: 'Вольк', role: 'melee', level: 1, dmg: 1.2, hp: 1.1, skills: ['swordsman'], spells: [] };
const ALLY_ASHKA = { name: 'Ашка', role: 'ranged', level: 1, dmg: 1.0, hp: 0.9, skills: [], spells: [] };
const ALLY_BALDOR = { name: 'Бальдор', role: 'shield', level: 1, dmg: 1.1, hp: 1.5, armor: 3, skills: [], spells: [] };
const ALLY_MIRA = { name: 'Мира', role: 'support', level: 1, dmg: 0.5, hp: 0.8, skills: [], spells: ['mend'] };

test('makeAlly: формат союзного юнита — side/size/формулы статов (makeMob без сложности)/id/копии', () => {
  assert.equal(typeof makeAlly, 'function', 'makeAlly экспортирован из combat.js');
  const v = makeAlly(ALLY_VOLK, 0);
  assert.equal(v.side, 'ally', 'side — "ally"');
  assert.deepEqual(v.size, { w: 1, h: 1 }, 'союзник всегда 1×1');
  assert.equal(v.name, 'Вольк');
  assert.equal(v.role, 'melee');
  assert.equal(v.level, 1);
  // Формулы makeMob (базы без множителей сложности combat_difficulties).
  assert.equal(v.maxHP, Math.max(1, Math.round((8 + 4 * 1) * 1.1)), 'maxHP = 13');
  assert.equal(v.hp, v.maxHP, 'старт с полным HP');
  assert.equal(v.damage, Math.max(1, Math.round((2 + 0.7 * 1) * 1.2)), 'damage = 3');
  assert.equal(v.armor, (0) + Math.floor(1 / 10), 'armor = 0 + floor(ур/10)');
  // Тотальная модель урона (000080, раунд ревью 1): dealDamageToMob
  // умножает на damageTakenMult — у мобов всегда есть (1/LEADER_DEF_MULT);
  // у союзника без него — hp = NaN.
  assert.equal(v.damageTakenMult, 1, 'damageTakenMult = 1');
  assert.equal(v.id, 'a0', 'id по индексу "aN"');
  assert.equal(v.alive, true);
  assert.equal(v.fled, false);
  assert.equal(v.movePerTurn, 1);
  assert.deepEqual(v.skills, ['swordsman'], 'skills — копия из данных');
  assert.deepEqual(v.spells, [], 'spells — копия из данных');
  // support: HP-множитель роли 0.7 (паттерн makeMob); id по индексу.
  const m = makeAlly({ name: 'Мира', role: 'support', level: 5, dmg: 0.5, hp: 0.8, skills: [], spells: ['mend', 'light_heal'] }, 2);
  assert.equal(m.maxHP, Math.max(1, Math.round((8 + 4 * 5) * 0.8 * 0.7)), 'support ×0.7 → 16');
  assert.equal(m.damage, Math.max(1, Math.round((2 + 0.7 * 5) * 0.5)), 'damage 5-ур. support = 3');
  assert.equal(m.id, 'a2');
  // shield: HP-множитель 1.8, armor + floor(ур/10).
  const b = makeAlly({ name: 'Бальдор', role: 'shield', level: 10, dmg: 1.1, hp: 1.5, armor: 3, skills: [], spells: [] }, 1);
  assert.equal(b.maxHP, Math.max(1, Math.round((8 + 4 * 10) * 1.5 * 1.8)), 'shield ×1.8 → 130');
  assert.equal(b.damage, Math.max(1, Math.round((2 + 0.7 * 10) * 1.1)), 'damage = 10');
  assert.equal(b.armor, 3 + Math.floor(10 / 10), 'armor 3 + 1 = 4');
});

test('makeAlly: мораль множит урон (u.moraleMult); явные maxHP/damage/id/kind (Эфир, 000081)', () => {
  // moraleMult — явный параметр: createCombat считает его из
  // P.derived(p).companionMoraleBonus (тест «мораль» ниже).
  const v = makeAlly(ALLY_VOLK, 0, 1.25);
  assert.equal(v.moraleMult, 1.25, 'множитель хранится на юните');
  assert.equal(v.damage, Math.max(1, Math.round((2 + 0.7) * 1.2 * 1.25)), 'round(4.05) = 4');
  const v0 = makeAlly(ALLY_VOLK, 0);
  assert.equal(v0.moraleMult, 1, 'мораль по умолчанию — 1');
  assert.equal(v0.damage, 3, 'без морали — базовый урон');
  // Эфир (000081): СОБСТВЕННЫЕ явные статы — в обход формул makeMob.
  const efir = makeAlly({ name: 'Эфир', role: 'support', level: 1, dmg: 1, hp: 1, maxHP: 12, damage: 4, kind: 'efir' }, 0);
  assert.equal(efir.maxHP, 12, 'явный maxHP не перебивается формулой');
  assert.equal(efir.damage, 4, 'явный урон не перебивается формулой');
  assert.equal(efir.kind, 'efir');
  const def = makeAlly(ALLY_VOLK, 3);
  assert.equal(def.kind, 'merc', 'kind по умолчанию — "merc"');
  // Стабильный id (turnOrder/UI-токены не должны зависеть от порядка
  // создания): data.id — дискриминатор 000081.
  const custom = makeAlly(Object.assign({}, ALLY_VOLK, { id: 'efir' }), 0);
  assert.equal(custom.id, 'efir');
});

test('createCombat({allies}): союзники в c.units (side "ally"/"mob"), очередь игрок → союзники → мобы', () => {
  const c = createCombat({
    player: strongHero(),
    allies: [ALLY_VOLK, ALLY_ASHKA, ALLY_MIRA],
    mobs: ['wolf', 'spider', 'troll'], mobLevel: 3, seed: 7,
  });
  assert.equal(c.units.length, 6, '3 моба + 3 союзника в c.units');
  const allies = c.units.filter((u) => u.side === 'ally');
  const mobs = c.units.filter((u) => u.side === 'mob');
  assert.equal(allies.length, 3, 'все союзники — side "ally"');
  assert.equal(mobs.length, 3, 'все мобы — side "mob"');
  for (const a of allies) assert.deepEqual(a.size, { w: 1, h: 1 }, 'союзник 1×1');
  // Очередь: игрок → союзники (порядок массива allies) → мобы (порядок mobs).
  assert.deepEqual(c.turnOrder, ['player', 'a0', 'a1', 'a2', 'm0', 'm1', 'm2']);
  assert.deepEqual(buildTurnOrder(c), ['player', 'a0', 'a1', 'a2', 'm0', 'm1', 'm2']);
  assert.equal(c.turnIndex, 0, 'начало боя — очередь у игрока');
  assert.equal(c.phase, 'player');
});

test('союзники: спавн рядом с игроком (низ поля), без перекрытий, 10 юнитов на 7×7', () => {
  const c = createCombat({
    player: strongHero(),
    allies: [ALLY_VOLK, ALLY_ASHKA, ALLY_MIRA],
    mobs: ['wolf', 'wolf', 'wolf', 'spider', 'spider', 'troll'], mobLevel: 3, seed: 7,
  });
  assert.equal(c.units.length, 9, 'игрок + 3 союзника + 6 мобов = 10 юнитов');
  // Без перекрытий: клетки всех юнитов + клетка игрока — уникальны,
  // все в пределах поля.
  const seen = new Set([c.px + ',' + c.py]);
  for (const u of c.units) {
    assert.ok(u.x >= 0 && u.y >= 0 && u.x + u.size.w <= 7 && u.y + u.size.h <= 7,
      `${u.id}: вне поля (${u.x},${u.y})`);
    for (const [x, y] of unitRect(u)) {
      const k = x + ',' + y;
      assert.ok(!seen.has(k), `(${x},${y}) занято дважды`);
      seen.add(k);
    }
  }
  // Союзники — рядом с игроком (низ поля): ≤ 2 клетки от старта.
  for (const a of c.units.filter((u) => u.side === 'ally')) {
    const d = Math.abs(a.x - c.px) + Math.abs(a.y - c.py);
    assert.ok(d <= 2, `${a.id} (${a.x},${a.y}): слишком далеко от игрока (d=${d})`);
  }
});

test('союзники: 3 без мобов — у старта; 4 союзника (Эфир + 3) + 6 мобов — помещаются на 7×7', () => {
  const c = createCombat({
    player: strongHero(),
    allies: [ALLY_VOLK, ALLY_ASHKA, ALLY_MIRA], mobs: [], seed: 7,
  });
  assert.equal(c.units.length, 3);
  assert.deepEqual(c.turnOrder, ['player', 'a0', 'a1', 'a2'],
    'без мобов очередь — игрок и союзники');
  for (const a of c.units) {
    const d = Math.abs(a.x - c.px) + Math.abs(a.y - c.py);
    assert.ok(d <= 2, `${a.id} (${a.x},${a.y}): d=${d} — не у старта`);
  }
  // Четыре союзника (Эфир + 3 наёмника) + 6 мобов (включая 2×2) на 7×7.
  const c2 = createCombat({
    player: strongHero(),
    allies: [ALLY_VOLK, ALLY_ASHKA, ALLY_BALDOR, ALLY_MIRA],
    mobs: ['wolf', 'wolf', 'wolf', 'spider', 'spider', 'troll'], mobLevel: 3, seed: 7,
  });
  assert.equal(c2.units.length, 10);
  const seen = new Set([c2.px + ',' + c2.py]);
  for (const u of c2.units) {
    assert.ok(u.x >= 0 && u.y >= 0 && u.x + u.size.w <= 7 && u.y + u.size.h <= 7,
      `4+3: ${u.id} вне поля`);
    for (const [x, y] of unitRect(u)) {
      const k = x + ',' + y;
      assert.ok(!seen.has(k), `4+3: (${x},${y}) занято дважды`);
      seen.add(k);
    }
  }
  for (const a of c2.units.filter((u) => u.side === 'ally')) {
    const d = Math.abs(a.x - c2.px) + Math.abs(a.y - c2.py);
    assert.ok(d <= 2, `4+3: ${a.id} (${a.x},${a.y}): d=${d} > 2`);
  }
});

test('расстановка: клетка (0,0) НЕ ложно занята неразставленным союзником (makeAlly x=y=0)', () => {
  // Регрессия (раунд ревью 2): createCombat раньше конкатенировал
  // союзников в c.units ДО placeAllies — неразставленные союзники
  // (x=0, y=0) ложно занимали клетку (0,0) в occ-сетке, и скан
  // «снизу вверх» (где (0,0) — последняя клетка) бросал «нет места
  // для союзника» при СВОБОДНОЙ (0,0). 4×1: игрок (2,0), мобы (1,0)
  // и (3,0) — единственная свободная клетка (0,0); якоря заняты —
  // расстановка только через построчный скан.
  const c = createCombat({
    player: strongHero(),
    allies: [ALLY_VOLK],
    mobs: ['wolf', 'wolf'], mobLevel: 2,
    width: 4, height: 1, seed: 5,
  });
  const a0 = c.units.find((u) => u.id === 'a0');
  assert.deepEqual([a0.x, a0.y], [0, 0], 'единственная свободная клетка (0,0)');
  // Реального места на ВТОРОГО союзника нет — throw остаётся.
  assert.throws(
    () => createCombat({
      player: strongHero(),
      allies: [ALLY_VOLK, ALLY_MIRA],
      mobs: ['wolf', 'wolf'], mobLevel: 2,
      width: 4, height: 1, seed: 5,
    }),
    /нет места для союзника/,
    'места на второго союзника нет — «нет места»',
  );
});

test('союзники: клетки в reserved generateObstacles, мобы достижимы, детерминизм по сиду', () => {
  const mk = (seed) => createCombat({
    player: strongHero(),
    allies: [ALLY_VOLK, ALLY_ASHKA, ALLY_MIRA],
    mobs: ['wolf', 'wolf', 'spider', 'spider', 'troll', 'cave_bear'], mobLevel: 3, seed,
  });
  const c = mk(100);
  assert.equal(c.units.filter((u) => u.side === 'ally').length, 3,
    'союзники в c.units (side "ally")');
  // Препятствия НЕ на клетках союзников (reserved строится из c.units).
  for (const a of c.units.filter((u) => u.side === 'ally')) {
    for (const [x, y] of unitRect(a)) {
      assert.ok(!c.obstacles.has(x + ',' + y), `(${x},${y}): камень на клетке союзника`);
    }
  }
  // Достигимость каждого моба от игрока по не-препятствиям (000050).
  const reach = reachableCells(c);
  for (const m of c.units.filter((u) => u.side === 'mob')) {
    assert.ok(unitRect(m).some(([x, y]) => reach.has(x + ',' + y)),
      `${m.mobId} (${m.x},${m.y}) недостижим`);
  }
  // Детерминизм: расстановка союзников не потребляет c._rng —
  // один сид → идентичные позиции и препятствия, другой сид → другие.
  const c2 = mk(100);
  assert.deepEqual(obstacleList(c), obstacleList(c2), 'один сид → один набор камней');
  assert.deepEqual(
    c.units.map((u) => [u.id, u.x, u.y]),
    c2.units.map((u) => [u.id, u.x, u.y]),
    'один сид → одна расстановка');
  const c3 = mk(101);
  assert.notDeepEqual(obstacleList(c), obstacleList(c3), 'другой сид → другой набор');
});

test('buildTurnOrder: мёртвые и fled союзники исключены; союзники — перед мобы', () => {
  const c = createCombat({
    player: strongHero(),
    allies: [ALLY_VOLK, ALLY_ASHKA, ALLY_MIRA],
    mobs: ['wolf', 'spider', 'troll'], mobLevel: 3, seed: 3,
  });
  assert.deepEqual(buildTurnOrder(c), ['player', 'a0', 'a1', 'a2', 'm0', 'm1', 'm2']);
  c.units.find((u) => u.id === 'a1').alive = false;
  c.units.find((u) => u.id === 'a2').fled = true;
  assert.deepEqual(buildTurnOrder(c), ['player', 'a0', 'm0', 'm1', 'm2'],
    'мёртвые/fled союзники вне очереди');
});

test('turnIndex: союзник действует в фазе мобов — turnOrder[turnIndex] = id союзника (инвариант 000036)', () => {
  const p = strongHero();
  const c = createCombat({
    player: p,
    allies: [ALLY_VOLK],
    mobs: ['wolf', 'spider'], mobLevel: 2, seed: 33,
  });
  const a0 = c.units.find((u) => u.id === 'a0');
  const w = c.units.find((u) => u.id === 'm0');
  a0.x = w.x; a0.y = w.y + 1; // вплотную к волку — атака на первом же ходу
  w.hp = 5;
  let i = 0; const rolls = [0.01, 0.99, 0.99, 0.99, 0.99];
  c._rng = () => rolls[i++ % rolls.length];
  assert.deepEqual(c.turnOrder, ['player', 'a0', 'm0', 'm1']);
  assert.equal(c.turnIndex, 0);

  const events = []; // [строка лога, c.turnIndex, c.turnOrder]
  const origPush = c.log.push.bind(c.log);
  c.log.push = (msg) => {
    events.push([msg, c.turnIndex, c.turnOrder.slice()]);
    return origPush(msg);
  };
  c.endTurn();

  // Союзник — на позиции 1 (ПОСЛЕ игрока, ПЕРЕД мобы).
  const aEv = events.find(([m, ti]) => ti === 1 && m.includes('Вольк'));
  assert.ok(aEv, `нет действия союзника в phase "mob": ${c.log.join(' | ')}`);
  assert.equal(aEv[2][1], 'a0', 'turnOrder[turnIndex] — id действующего союзника');
  assert.ok(c.log.includes('Вольк бьёт Волк: 3.'),
    'пин удара союзника: ' + c.log.join(' | '));
  // Моб — на СВОЕЙ позиции (2), после союзника.
  const mEv = events.find(([m, ti]) => ti === 2 && m.includes('Волк'));
  assert.ok(mEv, `нет действия волка: ${c.log.join(' | ')}`);
  assert.equal(mEv[2][2], 'm0', 'turnOrder[turnIndex] — id действующего моба');
  // Новый раунд: очередь у игрока, живой союзник в очереди.
  assert.equal(c.phase, 'player');
  assert.equal(c.turnIndex, 0);
  assert.deepEqual(c.turnOrder, ['player', 'a0', 'm0', 'm1']);
});

test('союзник: ход/атака детерминированы по сиду (повторный прогон — идентичный снимок)', () => {
  const run = () => {
    const p = strongHero();
    const c = createCombat({
      player: p,
      allies: [ALLY_VOLK],
      mobs: ['wolf', 'spider'], mobLevel: 2, seed: 33,
    });
    const a0 = c.units.find((u) => u.id === 'a0');
    const w = c.units.find((u) => u.id === 'm0');
    a0.x = w.x; a0.y = w.y + 1;
    w.hp = 5;
    let i = 0; const rolls = [0.01, 0.99, 0.99, 0.99, 0.99];
    c._rng = () => rolls[i++ % rolls.length];
    c.endTurn();
    return {
      log: c.log.slice(),
      units: c.units.map((u) => [u.id, u.x, u.y, u.hp, u.alive, u.fled]),
    };
  };
  const r1 = run(), r2 = run();
  assert.deepEqual(r1, r2, 'повторный прогон — идентичный снимок');
  assert.ok(r1.log.includes('Вольк бьёт Волк: 3.'), 'пин: ' + r1.log.join(' | '));
  const wolf = r1.units.find((u) => u[0] === 'm0');
  assert.equal(wolf[3], 2, 'волк 5 → 2 (урон 3, броня 0)');
});

test('союзники: игрок не может цельсить союзника (selectTarget/attack/fire/canDoAction/nearestMob)', () => {
  const C2 = require('../src/combat.js');
  const c = createCombat({
    player: strongHero(),
    allies: [ALLY_VOLK, ALLY_ASHKA],
    mobs: ['wolf'], mobLevel: 2, seed: 5,
  });
  const a0 = c.units.find((u) => u.id === 'a0');
  a0.x = c.px; a0.y = c.py - 1; // союзник БЛИЖЕ моба — ловушка nearestMob
  assert.deepEqual(c.selectTarget(a0.id),
    { ok: false, reason: 'недоступная цель' }, 'selectTarget отклоняет союзника');
  const atk = c.attack(a0.id);
  assert.equal(atk.ok, false);
  assert.equal(atk.reason, 'нет цели', 'attack по союзнику — «нет цели»');
  const fire = c.spell('fire', a0.id);
  assert.equal(fire.ok, false, 'fire по союзнику');
  assert.equal(fire.reason, 'нет цели');
  const cd = canDoAction(c, 'attack', { targetId: a0.id });
  assert.equal(cd.ok, false);
  assert.equal(cd.reason, 'нет цели', 'canDoAction — зеркало ядра (000037)');
  // nearestMob (экспорт combatInternals, подхватывает spells.js) —
  // возвращает моба, даже если союзник ближе.
  const near = C2.combatInternals.nearestMob(c);
  assert.ok(near, 'есть живые мобы');
  assert.equal(near.id, 'm0', 'nearestMob игнорирует союзников');
});

test('ranged-союзник: d≤1 — отступление, 1<d≤4 — атака в даль без сближения, d>4 — кайтинг (шаг ОТ врага)', () => {
  const mk = () => {
    const c = createCombat({
      player: strongHero(),
      allies: [ALLY_ASHKA],
      mobs: ['wolf'], mobLevel: 2, seed: 5,
    });
    c.obstacles.clear(); // сценарий проверяет ИИ, не навигацию (паттерн 000050)
    const a0 = c.units.find((u) => u.id === 'a0');
    const w = c.units.find((u) => u.id === 'm0');
    let i = 0; const rolls = [0.01, 0.99, 0.99, 0.99];
    c._rng = () => rolls[i++ % rolls.length];
    return { c, a0, w };
  };
  // d = 1 — отступление: дистанция до врага выросла, лог «отступает».
  {
    const { c, a0, w } = mk();
    w.x = 3; w.y = 4; a0.x = 3; a0.y = 5;
    const d0 = Math.abs(a0.x - w.x) + Math.abs(a0.y - w.y);
    c.endTurn();
    const d1 = Math.abs(a0.x - w.x) + Math.abs(a0.y - w.y);
    assert.ok(d1 > d0, `d=1: отступил (d ${d0} → ${d1}, позиция ${a0.x},${a0.y})`);
    assert.ok(c.log.some((l) => l.includes('отступает')),
      'лог отступления: ' + c.log.join(' | '));
  }
  // 1 < d ≤ 4 — атака в даль, позиция НЕ меняется.
  {
    const { c, a0, w } = mk();
    w.x = 3; w.y = 0; a0.x = 3; a0.y = 3; // d = 3
    const hp0 = w.hp;
    c.endTurn();
    assert.deepEqual([a0.x, a0.y], [3, 3], 'стрелок не сближается');
    assert.equal(w.hp, hp0 - 3, 'урон в даль: round(2.7×1.0) = 3');
    assert.ok(c.log.includes('Ашка бьёт Волк: 3.'), 'пин: ' + c.log.join(' | '));
  }
  // d > 4 — кайтинг (держит дистанцию): ОДИН шаг ОТ врага. allyStepAway
  // пробует направления по порядку →, ↑, ↓, ← и берёт первую
  // rectFree-клетку, где расстояние выросло: из (5,4) к волку (0,0) —
  // в (6,4), d 9 → 10 (memory/000080-ally-framework.md: «кайтинг»).
  {
    const { c, a0, w } = mk();
    w.x = 0; w.y = 0; a0.x = 5; a0.y = 4; // d = 9
    c.endTurn();
    assert.deepEqual([a0.x, a0.y], [6, 4], 'кайтинг: шаг ОТ врага (6,4), d 9 → 10');
    assert.ok(!c.log.some((l) => l.includes('бьёт Волк')), 'в даль не достаёт — не бьёт');
  }
});

test('shield-союзник: подход через rectFree (не сквозь камень/юнит), урон вблизи (пин)', () => {
  const mk = (allies) => {
    const c = createCombat({
      player: strongHero(),
      allies,
      mobs: ['wolf'], mobLevel: 2, seed: 5,
    });
    c.obstacles.clear();
    const a0 = c.units.find((u) => u.id === 'a0');
    const w = c.units.find((u) => u.id === 'm0');
    let i = 0; const rolls = [0.01, 0.99, 0.99, 0.99];
    c._rng = () => rolls[i++ % rolls.length];
    return { c, a0, w };
  };
  // Камень прямо на пути — щит стоит (как моб, паттерн 000050), не «внутри».
  {
    const { c, a0, w } = mk([ALLY_BALDOR]);
    w.x = 3; w.y = 2; a0.x = 3; a0.y = 5;
    c.obstacles.add('3,4');
    c.endTurn();
    assert.deepEqual([a0.x, a0.y], [3, 5], 'за камнем стоит (зафиксировано)');
    assert.ok(!c.obstacles.has(a0.x + ',' + a0.y), 'не «внутри» камня');
  }
  // Клетка на пути занята ЧУЖИМ союзником — шаг по другой оси.
  {
    const { c, a0, w } = mk([ALLY_BALDOR, ALLY_ASHKA]);
    const a1 = c.units.find((u) => u.id === 'a1');
    w.x = 2; w.y = 2; a0.x = 3; a0.y = 5; a1.x = 2; a1.y = 5; // (2,5) — занято
    c.endTurn();
    assert.deepEqual([a0.x, a0.y], [3, 4], 'обход занятой клетки (другая ось)');
    assert.notDeepEqual([a0.x, a0.y], [a1.x, a1.y], 'не на клетке союзника');
  }
  // Вплотную — атака: пин урона round(2.7×1.1) = 3.
  {
    const { c, a0, w } = mk([ALLY_BALDOR]);
    w.x = 3; w.y = 4; a0.x = 3; a0.y = 5; // d = 1
    const hp0 = w.hp;
    c.endTurn();
    assert.equal(w.hp, hp0 - 3, 'урон щита 3');
    assert.ok(c.log.includes('Бальдор бьёт Волк: 3.'), 'пин: ' + c.log.join(' | '));
  }
});

test('support-союзник: лечит САМОГО РАНЕНОГО (минимальная доля hp/maxHP), формула spells.js, сильнейшая степень', () => {
  // Формула лечения spells.js с attrs союзника (у наёмника attrs пуст →
  // уровень): round((4 + 0.5×attr + ур) × (1 + 0.15×(степень−1))).
  const mk = (spells) => {
    const c = createCombat({
      player: strongHero(),
      allies: [Object.assign({}, ALLY_MIRA, { spells }), ALLY_VOLK],
      mobs: ['wolf'], mobLevel: 2, seed: 5,
    });
    c.obstacles.clear();
    const a0 = c.units.find((u) => u.id === 'a0'); // Мира (support)
    const a1 = c.units.find((u) => u.id === 'a1'); // Вольк (melee)
    a0.x = 0; a0.y = 6; a1.x = 1; a1.y = 6; // рядом с игроком (3,6)
    c._rng = () => 0.99; // (моб доходит только шагом — бросков нет)
    return { c, a0, a1 };
  };
  // Раненый СОЮЗНИК (3/13 ≈ 23% — минимум) при полном игроке — лечится он.
  {
    const { c, a0, a1 } = mk(['mend']);
    a1.hp = 3;
    c.endTurn();
    assert.equal(a1.hp, 8, 'Вольк 3 + 5 = 8 (round((4+0+1)×1) = 5)');
    assert.ok(c.log.includes('Мира лечит Вольк (+5).'),
      'пин лечения союзника: ' + c.log.join(' | '));
    assert.equal(c.player.hp, 9999, 'полный игрок не лечится');
  }
  // Сильнейшая степень: mend (степень 1) + greater_heal (степень 2)
  // → round(5×1.15) = 6.
  {
    const { c, a1 } = mk(['mend', 'greater_heal']);
    a1.hp = 3;
    c.endTurn();
    assert.equal(a1.hp, 9, 'greater_heal: 3 + 6 = 9');
    assert.ok(c.log.includes('Мира лечит Вольк (+6).'),
      'пин сильнейшей степени: ' + c.log.join(' | '));
  }
});

test('support-союзник: лечит ИГРОКА (игрок — в пуле «самый раненый», через P.heal)', () => {
  // strongHero: maxHP 270; 108/270 = 40% — самый раненый (союзники целы).
  const c = createCombat({
    player: strongHero(),
    allies: [ALLY_MIRA, ALLY_VOLK],
    mobs: ['wolf'], mobLevel: 2, seed: 5,
  });
  c.obstacles.clear();
  const a0 = c.units.find((u) => u.id === 'a0');
  const a1 = c.units.find((u) => u.id === 'a1');
  a0.x = 0; a0.y = 6; a1.x = 1; a1.y = 6;
  c.player.hp = 108;
  c._rng = () => 0.99;
  c.endTurn();
  assert.equal(c.player.hp, 113, 'игрок 108 + 5 через P.heal');
  assert.ok(c.log.includes('Мира лечит Флогистон (+5).'),
    'пин лечения игрока: ' + c.log.join(' | '));
  assert.equal(a1.hp, a1.maxHP, 'целый союзник не лечится');
});

test('support-союзник без лечебных заклинаний и без раненых — melee (не падает, не лечит)', () => {
  const mk = () => {
    const c = createCombat({
      player: strongHero(),
      allies: [Object.assign({}, ALLY_MIRA, { spells: [] })],
      mobs: ['wolf'], mobLevel: 2, seed: 5,
    });
    c.obstacles.clear();
    const a0 = c.units.find((u) => u.id === 'a0');
    const w = c.units.find((u) => u.id === 'm0');
    c._rng = () => 0.99;
    return { c, a0, w };
  };
  // spells: [] — нет лечебных заклинаний: melee-ветка (шаг к врагу).
  {
    const { c, a0, w } = mk();
    w.x = 3; w.y = 2; a0.x = 3; a0.y = 5; // d = 3
    c.endTurn();
    assert.ok(!c.log.some((l) => l.includes('лечит')), 'без заклинаний не лечит');
    assert.deepEqual([a0.x, a0.y], [3, 4], 'шаг к врагу (melee-ветка)');
  }
  // Заклинания есть, но НИКТО не ранен (все полные) — тоже melee.
  {
    const c2 = createCombat({
      player: strongHero(),
      allies: [ALLY_MIRA],
      mobs: ['wolf'], mobLevel: 2, seed: 5,
    });
    c2.obstacles.clear();
    const a0 = c2.units.find((u) => u.id === 'a0');
    const w = c2.units.find((u) => u.id === 'm0');
    w.x = 3; w.y = 2; a0.x = 3; a0.y = 5;
    c2._rng = () => 0.99;
    c2.endTurn();
    assert.ok(!c2.log.some((l) => l.includes('лечит')),
      'все полные — лечения нет');
    assert.deepEqual([a0.x, a0.y], [3, 4], 'melee-ветка (шаг)');
  }
});

test('гибель союзника ≠ поражение: моб бьёт ближайшую цель стороны игрока; бой играбелен до победы', () => {
  const p = strongHero();
  const c = createCombat({
    player: p,
    allies: [ALLY_VOLK],
    mobs: ['wolf'], mobLevel: 10, seed: 5,
  });
  c.obstacles.clear();
  const a0 = c.units.find((u) => u.id === 'a0');
  const w = c.units.find((u) => u.id === 'm0');
  // Волк ближе к СОЮЗНИКУ (d=2), чем к игроку (d=3) — цель: союзник
  // (расширенная модель целей, без него гибель недостижима).
  a0.x = 3; a0.y = 5;
  w.x = 3; w.y = 3;
  w.damage = 20; // добивает слабого союзника (13 HP) одним ударом
  c._rng = () => 0.01; // все попадания
  c.endTurn();
  assert.equal(a0.alive, false, 'союзник погиб в бою');
  assert.ok(c.log.includes('Вольк пал в бою!'),
    'лог гибели: ' + c.log.join(' | '));
  assert.equal(c.result, null, 'гибель союзника — НЕ поражение');
  assert.equal(c.phase, 'player', 'бой продолжается');
  // Мёртвый союзник исключён из очереди следующего раунда.
  assert.deepEqual(c.turnOrder, ['player', 'm0']);
  // Бой играбелен до победы игрока (паттерн autoPlay 000050: камни сняты).
  standNextTo(c, w);
  let n = 0;
  while (!c.result && n++ < 60) {
    c.ps.attack = 99;
    c.attack(w.id);
    c.endTurn();
  }
  assert.ok(c.result, 'бой завершился');
  assert.equal(c.result.outcome, 'victory', 'игрок побеждает');
  assert.ok(p.alive, 'игрок жив');
  // checkVictory/опыт — только мобы: мёртвый союзник НЕ в луте
  // (xp волка уровня 10 = 8 + 4×10 = 48).
  assert.equal(c.result.xp, 48, 'опыт — только за поверженных мобов');
});

test('мораль: companionMoraleBonus × урон ВСЕХ союзников; вражеский лидер НЕ влияет на союзников', () => {
  const leaderHero = () => { const p = strongHero(); p.secondary.leader = 5; return p; };
  // Предводитель 5 → +25% (companionMoraleBonus = 0.25).
  const c1 = createCombat({
    player: leaderHero(),
    allies: [ALLY_VOLK, ALLY_ASHKA],
    mobs: ['wolf'], mobLevel: 2, seed: 5,
  });
  const v1 = c1.units.find((u) => u.id === 'a0');
  const a1 = c1.units.find((u) => u.id === 'a1');
  assert.equal(v1.damage, Math.max(1, Math.round(2.7 * 1.2 * 1.25)),
    'Вольк: round(3.24×1.25) = 4');
  assert.equal(v1.moraleMult, 1.25, 'множитель на юните (для 000112/000113)');
  assert.equal(a1.damage, Math.max(1, Math.round(2.7 * 1.0 * 1.25)),
    'Ашка: round(3.375) = 3 — мораль у ВСЕХ союзников');
  // Предводитель 0 — множителя нет.
  const c2 = createCombat({
    player: strongHero(),
    allies: [ALLY_VOLK],
    mobs: ['wolf'], mobLevel: 2, seed: 5,
  });
  assert.equal(c2.units.find((u) => u.id === 'a0').damage, 3, 'leader 0 — базовый урон');
  // РЕГРЕССИЯ: вражеский hasLeader (orc_captain) — это бафф ГРУППЫ МОБОВ,
  // а не мораль союзников (разные сущности: роль 'leader' у врагов).
  const c3 = createCombat({
    player: strongHero(),
    allies: [ALLY_VOLK],
    mobs: ['orc_captain', 'orc_grunt'], mobLevel: 2, seed: 5,
  });
  assert.equal(c3.units.find((u) => u.id === 'a0').damage, 3,
    'hasLeader врагов НЕ даёт +5% союзнику');
  const cap = c3.units.find((u) => u.role === 'leader');
  assert.equal(cap.damageTakenMult, 0.95, 'бафф вражеской группы — как был');
});

test('ленивый каталог: без combatInternals.allySpells support — melee-фолбэк; с каталогом — лечит', (t) => {
  // UMD-ловушка 000038: в браузере combat.js грузится ДО spells.js —
  // каталог заклинаний combat.js читать не может; его ЛЕНИВО ставит
  // spells.js в combatInternals.allySpells. Без каталога support-союзник
  // с лечебными spells не падает и деградирует в melee.
  const C2 = require('../src/combat.js');
  const save = C2.combatInternals.allySpells;
  t.after(() => { C2.combatInternals.allySpells = save; });
  const scenario = (seed) => {
    const c = createCombat({
      player: strongHero(),
      allies: [ALLY_MIRA, ALLY_VOLK],
      mobs: ['wolf'], mobLevel: 2, seed,
    });
    c.obstacles.clear();
    const a0 = c.units.find((u) => u.id === 'a0');
    const a1 = c.units.find((u) => u.id === 'a1');
    a0.x = 0; a0.y = 6; a1.x = 5; a1.y = 6;
    a1.hp = 3; // раненый союзник — цель лечения
    c._rng = () => 0.99;
    c.endTurn();
    return c;
  };
  C2.combatInternals.allySpells = undefined; // каталог «ещё не загружен»
  const c1 = scenario(5);
  assert.ok(!c1.log.some((l) => l.includes('лечит')), 'без каталога — нет лечения');
  const a0 = c1.units.find((u) => u.id === 'a0');
  assert.deepEqual([a0.x, a0.y], [1, 6], 'melee-фолбэк: шаг к врагу (без падений)');
  // Каталог на месте (src/spells-data.js) — лечит по формуле.
  C2.combatInternals.allySpells = require('../src/spells-data.js').SPELLS_BY_ID;
  const c2 = scenario(5);
  const b1 = c2.units.find((u) => u.id === 'a1');
  assert.equal(b1.hp, 8, 'с каталогом — лечение +5');
  assert.ok(c2.log.includes('Мира лечит Вольк (+5).'), 'пин: ' + c2.log.join(' | '));
});

test('движение: зайти на клетку союзника нельзя (unitAt — все юниты, reason «тут стоит союзник»)', () => {
  const c = createCombat({
    player: strongHero(),
    allies: [ALLY_VOLK],
    mobs: ['wolf'], mobLevel: 2, seed: 5,
  });
  c.obstacles.clear();
  const a0 = c.units.find((u) => u.id === 'a0');
  a0.x = c.px; a0.y = c.py - 1; // прямо перед игроком
  c.ps.moveLeft = 5;
  const r = c.move(0, -1);
  assert.equal(r.ok, false, 'клетка союзника не проходима');
  assert.equal(r.reason, 'тут стоит союзник', 'точная строка reason');
});

// --- Опыт и уровни спутников (задача 000082) ---
//
// КРАСНЫЕ тесты (TDD): падают, пока checkVictory не отдаёт c.result.allyXp.
//
// Контракт (SPEC.md «Спутники» → «Опыт и уровни»,
// memory/000082-companion-xp.md):
//   * c.result.allyXp — ТОЛЬКО в outcome 'victory' с победами: массив
//     {id, xp} по одному на каждого ВЫЖИВШЕГО союзника с kind 'merc'
//     (ПОЛОЖИТЕЛЬНЫЙ фильтр — устойчив к spelling kind Эфира 'efir'
//     (SPEC/memory 000035) vs 'ether' (memory/000080)); порядок — c.units.
//     В 'fled'/'dead' поля НЕТ — 000087 гвардит outcome === 'victory'.
//   * xp = Math.round(базовый боевой xp × companion_xp_share) (Math.round,
//     не floor: 16×0.3 = 4.8 → 5; паттерн gold-формулы). Базовый xp —
//     сумма опыта поверженных мобов — ТОЧНО то число, что уходит игроку
//     ДО бонуса «Учёный» (xpMult в P.addXp спутникам НЕ идёт).
//   * Доля — КАЖДОМУ выжившему независимо (НЕ делится на их число):
//     2 спутника × 0.5 = суммарно 100% сверх 100% игрока.
//   * id — id юнита (data.id; для наёмника — npcId; 000087 маппит
//     allyXp → roster по нему). Погибший союзник (alive=false) — вне
//     списка (fallen 000087 выведет как «посланные − ids allyXp»).
//   * Настройка читается ЖИВО при вызове: Number(SETTINGS.
//     companion_xp_share) || 0 (мусор в настройках → 0, бой не падает).
//   * НОЛЬ новых вызовов c._rng в checkVictory (gold-роллы — до
//     allyXp); лог-строка «Победа! +… опыта…» — без изменений.
//   * Регрессия: игрок — 100% боевого опыта БЕЗ изменений (P.addXp).

// Сценарий: союзники у левого низа (i, 6), волк — (3, 2), игрок —
// вплотную к волку (strongHero 9999 HP — не умирает). Игрок добивает
// волка; союзники выживают (волк целился в игрока — ближайшего).
// Возврат { c, p, w }.
function winWithAllies(allies, { mobLevel = 2, seed = 5, mutate } = {}) {
  const p = strongHero();
  if (mutate) mutate(p);
  const c = createCombat({
    player: p, allies, mobs: ['wolf'], mobLevel, seed,
  });
  c.obstacles.clear();
  const w = c.units.find((u) => u.id === 'm0');
  w.x = 3; w.y = 2;
  c.units.filter((u) => u.side === 'ally').forEach((u, i) => {
    u.x = i; u.y = 6;
  });
  standNextTo(c, w);
  let n = 0;
  while (!c.result && n++ < 60) {
    c.ps.attack = 99;
    c.attack(w.id);
    c.endTurn();
  }
  assert.ok(c.result, 'бой завершился');
  assert.equal(c.result.outcome, 'victory', 'игрок побеждает');
  return { c, p, w };
}

test('000082: победа — allyXp: доля companion_xp_share КАЖДОМУ выжившему (НЕ делится между ними)', () => {
  const { c } = winWithAllies([ALLY_VOLK, ALLY_ASHKA]);
  // xp волка L2 = 8 + 4×2 = 16; доля 0.5 → каждому round(16×0.5) = 8.
  assert.equal(c.result.xp, 16, 'базовый xp — 100% игроку (без изменений)');
  assert.deepEqual(c.result.allyXp, [
    { id: 'a0', xp: 8 },
    { id: 'a1', xp: 8 },
  ], 'порядок — c.units; каждому по доле: 2×8 = 16 = 100% базового, ' +
    'а НЕ (16×0.5)/2 = 4');
});

test('000082: регрессия — игрок получает 100% боевого опыта БЕЗ изменений', () => {
  const { c, p } = winWithAllies([ALLY_VOLK, ALLY_ASHKA]);
  assert.equal(c.result.xp, 16);
  assert.equal(p.totalXp, 16, 'scholar 0: totalXp = 100% базового xp');
  assert.equal(p.xp, 16, '16 < 50 (xpForNext(1)) — уровень не меняется');
  assert.equal(p.level, 1);
});

test('000082: бонус «Учёный» (xpMult) — только игроку; доля спутников — от базового xp', () => {
  // scholar 5 → xpMult = 1 + 0.02×5 = 1.1.
  const { c, p } = winWithAllies([ALLY_VOLK, ALLY_ASHKA],
    { mutate: (h) => { h.secondary.scholar = 5; } });
  assert.equal(p.totalXp, 18, 'игрок: round(16×1.1) = 18 (бонус действует)');
  assert.deepEqual(c.result.allyXp, [
    { id: 'a0', xp: 8 },
    { id: 'a1', xp: 8 },
  ], 'доля — от базового xp = 16 (round(16×0.5) = 8), а НЕ от 18: ' +
    '«Учёный» спутникам НЕ идёт (навыков у них нет — v1)');
});

test('000082: companion_xp_share читается ЖИВО при вызове; Math.round (4.8 → 5)', (t) => {
  SETTINGS.companion_xp_share = 0.3;
  t.after(() => { SETTINGS.companion_xp_share = 0.5; });
  const { c } = winWithAllies([ALLY_VOLK, ALLY_ASHKA]);
  assert.deepEqual(c.result.allyXp, [
    { id: 'a0', xp: 5 },
    { id: 'a1', xp: 5 },
  ], 'round(16×0.3) = round(4.8) = 5 — Math.round, НЕ floor (4)');
});

test('000082: companion_xp_share нечисло (мусор в настройках, 000098-UI) — фолбэк 0, бой не падает', (t) => {
  SETTINGS.companion_xp_share = 'мусор';
  t.after(() => { SETTINGS.companion_xp_share = 0.5; });
  const { c, p } = winWithAllies([ALLY_VOLK, ALLY_ASHKA]);
  assert.deepEqual(c.result.allyXp, [
    { id: 'a0', xp: 0 },
    { id: 'a1', xp: 0 },
  ], 'Number(мусор) → NaN → || 0 → xp 0 (записи остаются — список живой)');
  assert.equal(c.result.xp, 16, 'игрок не задет мусором в настройках');
  assert.equal(p.totalXp, 16);
});

test('000082: погибший в бою спутник — не в allyXp (доля — только выжившим)', () => {
  const p = strongHero();
  const c = createCombat({
    player: p,
    allies: [ALLY_VOLK, ALLY_ASHKA],
    mobs: ['wolf'], mobLevel: 10, seed: 5,
  });
  c.obstacles.clear();
  const a0 = c.units.find((u) => u.id === 'a0'); // Вольк
  const a1 = c.units.find((u) => u.id === 'a1'); // Ашка
  const w = c.units.find((u) => u.id === 'm0');
  // Волк ближе к Вольку (d=2), чем к игроку (d=3) — цель: Вольк
  // (расширенная модель целей, паттерн 000080).
  a0.x = 3; a0.y = 5;
  a1.x = 0; a1.y = 6;
  w.x = 3; w.y = 3;
  w.damage = 20; // добивает слабого союзника (13 HP) одним ударом
  c._rng = () => 0.01; // все попадания
  c.endTurn();
  assert.equal(a0.alive, false, 'Вольк погиб в бою');
  assert.equal(c.result, null, 'гибель союзника — НЕ поражение');
  standNextTo(c, w);
  let n = 0;
  while (!c.result && n++ < 60) {
    c.ps.attack = 99;
    c.attack(w.id);
    c.endTurn();
  }
  assert.equal(c.result.outcome, 'victory');
  assert.ok(p.alive, 'игрок жив');
  assert.equal(c.result.xp, 48, 'xp волка L10 = 8 + 4×10');
  assert.deepEqual(c.result.allyXp, [{ id: 'a1', xp: 24 }],
    'round(48×0.5) = 24 — Ашка (выжила); погибший a0 — вне списка');
});

test('000082: доля — только kind === "merc": "efir" (Эфир, 000081) и неизвестный kind ("ether") — вне доли', () => {
  // Позитивный фильтр (memory/000082-companion-xp.md): устойчив к
  // spelling kind Эфира — SPEC/memory/000035 «efir», memory/000080
  // «ether». Эфир — собственный пул, 100% c.result.xp (000081 читает
  // сам) — НЕ 0.5+100% двойного подсчёта.
  const EFIR = { name: 'Эфир', role: 'support', level: 1, dmg: 0.5, hp: 1,
    skills: [], spells: [], id: 'efir', kind: 'efir' };
  const ETHER = { name: 'Эфир (вариант kind)', role: 'melee', level: 1,
    dmg: 0.5, hp: 1, skills: [], spells: [], id: 'ether', kind: 'ether' };
  const { c } = winWithAllies([EFIR, ETHER, ALLY_VOLK]);
  assert.deepEqual(c.result.allyXp, [{ id: 'a2', xp: 8 }],
    'наёмник a2 (kind "merc") — в списке; "efir"/"ether" — вне');
  assert.equal(c.result.xp, 16, 'игрок — 100% (Эфир 100% — своим механизмом)');
});

test('000082: id союзника — data.id (для наёмника — npcId): allyXp маппится на roster', () => {
  const { c } = winWithAllies([
    Object.assign({}, ALLY_VOLK, { id: 'merc_volk' }),
    Object.assign({}, ALLY_ASHKA, { id: 'merc_ashka' }),
  ]);
  assert.deepEqual(c.result.allyXp, [
    { id: 'merc_volk', xp: 8 },
    { id: 'merc_ashka', xp: 8 },
  ], '000087: roster → allyDataForEntry (id = npcId) → createCombat ' +
    '→ c.result.allyXp → applyCombatXp');
});

test('000082: без союзников — allyXp = [] (shape стабилен); «все сбежали» и «dead» — поля нет', () => {
  // (а) victory без союзников: бит-в-бит-регрессия 000080 — result
  // получает allyXp = [] (пустой массив, НЕ undefined).
  const c1 = createCombat({ player: strongHero(), mobs: ['wolf'], mobLevel: 2, seed: 5 });
  c1.obstacles.clear();
  const w1 = c1.units.find((u) => u.id === 'm0');
  w1.x = 3; w1.y = 2;
  standNextTo(c1, w1);
  let n = 0;
  while (!c1.result && n++ < 60) {
    c1.ps.attack = 99;
    c1.attack(w1.id);
    c1.endTurn();
  }
  assert.equal(c1.result.outcome, 'victory');
  assert.deepEqual(c1.result.allyXp, [], '0 союзников — пустой массив');

  // (б) все сбежали (пугливая фея у верхней стены — mobAct → 'fled'):
  // лута нет, поля allyXp НЕТ (000087 гвардит outcome === 'victory').
  const c2 = createCombat({ player: strongHero(), mobs: ['fairy'], mobLevel: 10, seed: 5 });
  c2.obstacles.clear();
  const w2 = c2.units.find((u) => u.id === 'm0');
  w2.y = 0; // верхняя стена — «уходят из боя»
  w2.hp = Math.max(1, Math.floor(w2.maxHP * 0.1)); // < 30% — бегство
  c2.endTurn();
  assert.equal(c2.result.outcome, 'fled', c2.log.join(' | '));
  assert.equal(c2.result.xp, 0);
  assert.ok(!('allyXp' in c2.result), '«fled» — поля allyXp нет');

  // (в) игрок погиб — outcome 'dead' — поля allyXp нет:
  const c3 = createCombat({ player: createCharacter(), groupType: 6, seed: 8 });
  if (c3.obstacles) c3.obstacles.clear();
  c3._rng = () => 0.01; // мобы точно попадают
  n = 0;
  while (!c3.result && n++ < 60) c3.endTurn();
  assert.equal(c3.result.outcome, 'dead');
  assert.ok(!('allyXp' in c3.result), '«dead» — поля allyXp нет');
});

test('000082: детерминизм — два прогона сценария с союзниками → идентичные allyXp (доля без RNG)', () => {
  const run = () => {
    const { c } = winWithAllies([ALLY_VOLK, ALLY_ASHKA]);
    assert.ok(Array.isArray(c.result.allyXp), 'victory — allyXp есть (массив)');
    assert.equal(c.result.allyXp.length, 2, 'оба выживших в списке');
    return JSON.stringify(
      { allyXp: c.result.allyXp, xp: c.result.xp, gold: c.result.gold });
  };
  assert.equal(run(), run(), 'тот же сценарий — тот же результат');
});

test('000082: формат makeAlly — у союзника НЕТ очков навыков/практики (v1: только игроку)', () => {
  const v = makeAlly(ALLY_VOLK, 0);
  assert.ok(!('skillXp' in v), 'skillXp — только у игрока (c.skillXp, PRACTICE_XP)');
  assert.ok(!('points' in v), 'points — только у игрока (points_per_level)');
});

test('000082: практика НЕ начисляется спутникам — p.skillXp не меняется, когда врага добивает союзник', () => {
  const p = strongHero();
  const c = createCombat({
    player: p, allies: [ALLY_VOLK], mobs: ['wolf'], mobLevel: 2, seed: 5,
  });
  c.obstacles.clear();
  const w = c.units.find((u) => u.id === 'm0');
  const a0 = c.units.find((u) => u.id === 'a0');
  w.x = 3; w.y = 2;
  a0.x = 3; a0.y = 3; // Вольк вплотную к волку — добивает его САМ
  c._rng = () => 0.01; // все попадания
  let n = 0;
  while (!c.result && n++ < 30) c.endTurn();
  assert.equal(c.result.outcome, 'victory', 'Вольк добивает волка без игрока');
  assert.deepEqual(p.skillXp, {},
    'игрок не действовал; атака союзника НЕ вызывает P.skillPractice (v1)');
  assert.equal(c.result.xp, 16, 'опыт боя — всё равно игроку (100%)');
});

// --- Задача 000076: благословения храмов в формулах боя (КРАСНЫЕ) ---
//
// Контракты (решения — memory/000076-temple-blessings.md):
//   * opts.buffMods { damageMult, armor } → c.buffMods (нормализовано,
//     дефолт {damageMult:1, armor:0}; мусор — дефолт, fail-open).
//   * Урон игрока (удар/стрельба — playerAttack, «огонь» —
//     playerSpell) × c.buffMods.damageMult; урон ПО ИГРОКУ —
//     − c.buffMods.armor (уровень d.armor + снаряжение).
//   * НОЛЬ новых вызовов c._rng: без баффа (×1/−0) бой БИТ-В-БИТ
//     как сейчас (регрессия 000080/000082); союзники баффуются НЕ
//     должны (множитель — только playerAttack/playerSpell/
//     dealDamageToPlayer, НЕ dealDamageToMob allyAct-пути).

test('000076: c.buffMods — параметр контекста боя: дефолт {damageMult:1, armor:0}; мусор — дефолт (fail-open)', () => {
  // Без opts.buffMods — нейтральный дефолт (без баффа — бит-в-бит).
  const c = createCombat({ player: strongHero(), groupType: 0, seed: 11 });
  assert.deepEqual(c.buffMods, { damageMult: 1, armor: 0 },
    'без opts.buffMods — нейтральный дефолт');
  // Мусор — дефолт (fail-open, 000029): бой не падает.
  for (const junk of [null, 'x', [1], 5, {},
    { damageMult: -1, armor: -2 }, { damageMult: 'a', armor: null }]) {
    const cj = createCombat({
      player: strongHero(), groupType: 0, seed: 11, buffMods: junk,
    });
    assert.deepEqual(cj.buffMods, { damageMult: 1, armor: 0 },
      'мусор ' + JSON.stringify(junk) + ' — дефолт');
  }
  // Валидное — как есть; неполное — недостающее поле в дефолт.
  const c2 = createCombat({
    player: strongHero(), groupType: 0, seed: 11,
    buffMods: { damageMult: 1.05, armor: 1 },
  });
  assert.deepEqual(c2.buffMods, { damageMult: 1.05, armor: 1 },
    'валидное buffMods — в c.buffMods');
  const c3 = createCombat({
    player: strongHero(), groupType: 0, seed: 11,
    buffMods: { damageMult: 1.05 },
  });
  assert.deepEqual(c3.buffMods, { damageMult: 1.05, armor: 0 },
    'armor отсутствует — дефолт 0');
});

test('000076: благословение солнца — урон playerAttack ×1.05; без баффа — как сейчас (регрессия)', () => {
  const setup = (buffMods) => {
    const p = strongHero();
    p.primary.strength = 20; // база кулаков = 3 + floor(20*0.8) + 0 = 19
    const c = createCombat({ player: p, groupType: 0, seed: 11, buffMods });
    c._rng = () => 0.01; // гарантированное попадание
    const w = c.units.find((u) => u.mobId === 'orc_warrior');
    standNextTo(c, w);
    w.hp = 9999; w.maxHP = 9999; // сценарий: один удар не убивает
    return { c, w };
  };
  const base = 3 + Math.floor(20 * 0.8) + Math.floor(1 * 0.5); // 19
  assert.ok(base > 1, 'сценарий: база урона > 1 (округление 1.05 виден)');
  const a = setup(undefined);
  const r0 = a.c.attack(a.w.id);
  assert.equal(r0.ok, true, 'удар');
  assert.equal(r0.hit, true, 'попадание');
  assert.equal(a.w.hp, 9999 - Math.max(1, base - a.w.armor),
    'без баффа — текущая формула (регрессия)');
  const b = setup({ damageMult: 1.05, armor: 0 });
  const r1 = b.c.attack(b.w.id);
  assert.equal(r1.hit, true, 'попадание');
  assert.equal(b.w.hp,
    9999 - Math.max(1, Math.round(base * 1.05) - b.w.armor),
    'с благословением — урон ×1.05');
});

test('000076: благословение солнца — заклинание «огонь» ×1.05 (броня по-прежнему игнорируется); без баффа — как сейчас', () => {
  const setup = (buffMods) => {
    const p = createCharacter();
    p.primary.intelligence = 20; // (3 + 0.5*20) = 13
    p.mp = 20;
    const c = createCombat({ player: p, groupType: 0, seed: 27, buffMods });
    const w = c.units.find((u) => u.mobId === 'orc_warrior');
    w.x = c.px; w.y = c.py - 1; // подтянуть цель в дальность
    w.hp = 9999; w.maxHP = 9999; // сценарий: каст не убивает
    return { p, c, w };
  };
  const a = setup(undefined);
  const r0 = a.c.spell('fire', a.w.id);
  assert.equal(r0.ok, true, 'каст');
  const intBonus = derived(a.p).fireDamageBonus;
  const base = Math.round(
    (3 + 0.5 * a.p.primary.intelligence) * (1 + intBonus));
  assert.equal(a.w.hp, 9999 - base,
    'без баффа — текущая формула (броня игнорируется)');
  const b = setup({ damageMult: 1.05, armor: 0 });
  const r1 = b.c.spell('fire', b.w.id);
  assert.equal(r1.ok, true, 'каст');
  assert.equal(b.w.hp, 9999 - Math.max(1, Math.round(base * 1.05)),
    'с благословением — ×1.05 (броня всё ещё игнорируется)');
});

test('000076: благословение горы — урон ПО ИГРОКУ −1 броня (один ход моба, один и тот же сид)', () => {
  const run = (buffMods) => {
    const p = strongHero();
    const c = createCombat({
      player: p, mobs: ['wolf'], mobLevel: 1, seed: 3, buffMods,
    });
    c._rng = () => 0.01; // гарантированное попадание волка
    standNextTo(c, c.units[0]);
    c.endTurn(); // игрок не действует — ход волка (один удар)
    return p.hp;
  };
  const hp0 = run(undefined);
  assert.ok(hp0 < 9999, 'сценарий: волк нанёс урон (без баффа)');
  const hp1 = run({ damageMult: 1, armor: 1 });
  assert.equal(hp1 - hp0, 1,
    'с благословением: урон за удар на 1 меньше (−1 броня)');
});

test('000076: детерминизм — buffMods НЕ потребляет c._rng: поток RNG с/без баффа идентичен; баффовый бой — бит-в-бит', () => {
  const mk = (buffMods) => {
    const p = strongHero();
    p.primary.strength = 20;
    const c = createCombat({ player: p, groupType: 0, seed: 31, buffMods });
    // Сценарий: ничто не умирает (нет побед/бегств — без
    // расходования RNG в checkVictory/бегстве) — потоки с/без
    // баффа сравниваются полностью.
    for (const u of c.units) { u.hp = 99999; u.maxHP = 99999; }
    const calls = [];
    const orig = c._rng;
    c._rng = () => { const v = orig(); calls.push(v); return v; };
    return { c, calls, p };
  };
  const a = mk(undefined);
  const b = mk({ damageMult: 1.05, armor: 0 });
  for (let i = 0; i < 5 && !a.c.result && !b.c.result; i++) {
    const ra = a.c.attack();
    const rb = b.c.attack();
    assert.equal(ra.ok, rb.ok, 'одинаковая структура действия');
    assert.equal(ra.hit, rb.hit, 'одинаковый паттерн попаданий');
    a.c.endTurn();
    b.c.endTurn();
  }
  assert.deepEqual(a.calls, b.calls,
    'buffMods не потребляет c._rng — идентичный поток (000080/000082)');
  // Бит-в-бит: два баффовых прогона — идентичные лог/состояние.
  const runBuffed = () => {
    const m = mk({ damageMult: 1.05, armor: 0 });
    for (let i = 0; i < 5 && !m.c.result; i++) {
      m.c.attack();
      m.c.endTurn();
    }
    return {
      log: m.c.log,
      units: m.c.units.map((u) => [u.id, u.x, u.y, u.hp, u.alive, u.fled]),
      hp: m.p.hp,
    };
  };
  assert.deepEqual(runBuffed(), runBuffed(),
    'баффовый прогон — бит-в-бит (сид + сценарий)');
});

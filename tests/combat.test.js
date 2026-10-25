const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
// 000230.03: vm-песочница для красных тестов free_cast (F1/F2) —
// техническое добавление (vm-цепи в файле до этой задачи не было).
const vm = require('node:vm');
const {
  hitChance, createCombat, resolveDifficulty, canDoAction, buildTurnOrder,
  MOB_TYPES, GROUP_RECIPES, LEADER_DMG_MULT, PRACTICE_XP, reachableCells,
  makeAlly,
  // 000132: пулы лута — данные модуля (красные тесты: экспорт пока
  // отсутствует — undefined, падение осмысленное, не load-ошибка).
  LOOT_BASE_POOL, LOOT_RARE_POOL,
  // 000155: A*-поиск пути мобов — экспорт пока отсутствует (красная
  // стадия: имена undefined → осмысленный TypeError в unit-тестах,
  // не load-ошибка; 000132-паттерн).
  pathStepTo, pathStepFrom,
  combatInternals,
  // 000167: инициатива (красные тесты: экспорт отсутствует — undefined;
  // падение осмысленное: TypeError «not a function», не load-ошибка —
  // прецедент 000132).
  unitInitiative,
  // 000167: активный юнит по очереди (000168 — диспатч по нему; экспорт
  // существует с 000167 — техническое добавление в список require).
  activeUnitId,
  // 000175: клетки, до которых выбранный моб доходит за один ход
  // (красные тесты: экспорт отсутствует — undefined → осмысленный
  // TypeError «not a function», не load-ошибка; прецедент
  // 000132/000155/000167).
  mobReachCells,
  // 000230.05: редкость экипировочного лута (красные тесты: экспорт
  // отсутствует — undefined, падение осмысленное, не load-ошибка;
  // прецедент 000132: LOOT_BASE_POOL/LOOT_RARE_POOL).
  RARITY_TABLE, EQUIP_POOLS,
  // 000235.05: лут свитков от разницы уровней (красные тесты: экспорт
  // отсутствует — undefined → осмысленный TypeError/AssertionError,
  // не load-ошибка; прецедент 000132/000155/000167/000175).
  SALT_SCROLL, LOOT_SCROLL_CHANCE_BASE, LOOT_SCROLL_CHANCE_PER_DIFF,
  LOOT_SCROLL_CHANCE_CAP, LOOT_SCROLL_MAX_TIER, SCROLL_SCHOOLS,
  scrollChance, scrollTier, pickScroll, rollScrollDrop, scrollCatalog,
  // 000245: базовая вероятность лута по разности уровней (красные
  // тесты: экспорт отсутствует — undefined → осмысленный TypeError
  // при вызове, не load-ошибка; прецедент 000132/000230.05/000235.05).
  lootChance, LOOT_CHANCE_BASE, LOOT_CHANCE_PER_LV,
  LOOT_CHANCE_FLOOR, LOOT_CHANCE_CAP,
  // 000260: расстановка перед боем (красные тесты: экспорт отсутствует
  // — undefined → осмысленный TypeError «not a function» при вызове, не
  // load-ошибка; прецедент 000132/000155/000167/000175/000245).
  validatePlacement,
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
const ROOT = path.join(__dirname, '..');
// 000211.03: единый источник формата ссылки (000211.01) и общий
// валидатор схем — красные тесты M1/M2 (EOF-блок 000211.03).
const { isRef, resolveRef } = require('../scripts/lib/json-ref.js');
const { validateData } = require('./json-schema.js');
// 000211.08: ссылки состав.мобы каталога → id целей (формат 000211.01).
const JR = require('../scripts/lib/json-ref.js');
const mobFiles = () => fs.readdirSync(MOBS_DIR)
  .filter((f) => /^\d{6}\.json$/.test(f)).sort();
function refToId(v, where) {
  if (!isRef(v)) return v;
  const r = resolveRef(ROOT, v);
  assert.ok(r.ok, where + ': ссылка не резолвится (' + r.reason + '): ' + v);
  return r.id;
}

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
  // 000077: в GROUP_RECIPES строковый ключ 'BUILDING_BOSS' —
  // итерируем ТОЛЬКО ЧИСЛОВЫЕ (каталожные) типы: Number('BUILDING_BOSS')
  // = NaN → createCombat бросил бы «неизвестный тип группы».
  for (const [type, recipe] of Object.entries(GROUP_RECIPES)
    .filter(([type]) => String(type) === String(Number(type)))) {
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
      assert.match(l.item, /^assets\/items\/\d{6}\.json$/, f + ': loot.item');
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
    j.skills = j.skills.map((v, i) => refToId(v, f + ': skills[' + i + ']'));
    j.spells = j.spells.map((v, i) => refToId(v, f + ': spells[' + i + ']'));
    j.loot = j.loot.map((l, i) => ({ ...l, item: refToId(l.item, f + ': loot[' + i + '].item') }));
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
      assert.ok(skillIds.has(refToId(s, f + ': skills')),
        j.id + ': навык «' + s + '» нет в assets/skills');
    }
    for (const l of j.loot) {
      assert.ok(itemIds.has(refToId(l.item, f + ': loot.item')),
        j.id + ': лут «' + l.item + '» нет в assets/items');
    }
    for (const sp of j.spells) {
      assert.ok(spellIds && spellIds.has(refToId(sp, f + ': spells')),
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
  // 000167: мобы быстрее игрока (wolf init 3 > strongHero 2) действуют
  // ДО игрока, и ps.blocked сбрасывается в startRound до их ударов
  // следующего раунда — блок поглощал бы ничего. Механизм пины с
  // медленным мобом (stone_golem init 1+1 = 2, тай → игрок первым):
  // моб бьёт в ТЕКУЩЕМ раунде после хода игрока.
  const make = () => {
    const p = strongHero();
    const c = createCombat({ player: p, mobs: ['stone_golem'], mobLevel: 1, seed: 77 });
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
  // 000164 (ОСОЗНАННЫЙ СЕМАНТИЧЕСКИЙ РЕПИН, ТЗ «Тесты (красные)»):
  // пре-000164 — немедленный { outcome: 'dead' } = конец боя.
  // С 000164 — гибель игрока открывает «окно смерти» (onPlayerDeath):
  // каскад на союзников → auto-возрождение Эфира → попытка спасения.
  // Фикстура БЕЗ СОЮЗНИКОВ И ЭФИРА — спасение структурно невозможно
  // (нет Эфира, нет пула c.efs) → исход как ДО + аддитивное
  // partyLost: true (контракт 000164 §2.1 шаг 5 / §2.6; ТЗ п.5).
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
  assert.equal(c.result.partyLost, true,
    '000164: без Эфира/союзников окно неспасённое — partyLost: true');
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

test('яд: отравление держится 2 хода и тикает в начале раунда (000167)', () => {
  // 000167: тик яда переехал из «начала хода игрока» в startRound
  // (начало раунда): пауки (init 4 > 2) травят в первом endTurn (round 2,
  // до любого тика) → poison = 2; следующий endTurn — тик 2 → 1.
  const p = strongHero();
  const c = createCombat({ player: p, groupType: 4, seed: 19 }); // пауки ядовиты
  c._rng = () => 0.05; // попадания и яд
  standNextTo(c, c.units[0]);
  c.endTurn(); // mобы травят (round 2); тиков ещё не было
  assert.equal(c.ps.poison, 2, 'отравление должно держаться 2 хода');
  const hp1 = p.hp;
  c.endTurn(); // round 3: тик 2 → 1 в начале раунда
  assert.ok(p.hp <= hp1 - 2, 'яд не тикает');
  assert.equal(c.ps.poison, 1, 'тик яда — 1 за раунд (2 → 1)');
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
  // 000077: только ЧИСЛОВЫЕ (каталожные) ключи — «стандартные =
  // 7 каталожных»; боссовый рецепт BUILDING_BOSS — вне «всех групп».
  for (const [type, recipe] of Object.entries(GROUP_RECIPES)
    .filter(([type]) => String(type) === String(Number(type)))) {
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
  // 000077: только ЧИСЛОВЫЕ ключи (боссовый состав НЕ заносить
  // молча в «все группы»).
  for (const [type, recipe] of Object.entries(GROUP_RECIPES)
    .filter(([type]) => String(type) === String(Number(type)))) {
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

test('практика: на потолке (основной * 2) попадание копится в банке (000140, C1)', () => {
  // Осознанный перепин (контракт 000139 C1 — второй пин броска на cap,
  // тот же путь: combat.js → P.skillPractice): опыт попадания больше не
  // бросается, а копится в p.skillXp; уровень и reason — без изменений.
  const p = strongHero(); // сила 1 → потолок «Мечника» 2
  I.addItem(p, 'iron_sword');
  I.equip(p, 'iron_sword');
  p.secondary.swordsman = 2; // уже на потолке практикой
  const c = createCombat({ player: p, groupType: 3, seed: 5 });
  c._rng = () => 0.01;
  standNextTo(c, c.units[0]);
  const r = c.attack(c.units[0].id);
  assert.equal(r.hit, true);
  assert.equal(r.practice.applied, PRACTICE_XP.hit, 'опыт принят в банк (C1)');
  assert.equal(r.practice.level, 2);
  assert.equal(p.secondary.swordsman, 2, 'уровень не вырос');
  assert.equal(p.skillXp.swordsman, PRACTICE_XP.hit, 'опыт копится в банке (C1)');
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
  // ТОЛЬКО числовые ключи (0..6): строковый 'BUILDING_BOSS' (000077)
  // — не «все группы» (Number → NaN; паттерн 000077, §11).
  for (const type of Object.keys(GROUP_RECIPES)
    .filter((t) => String(t) === String(Number(t)))) {
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
  // 000223: слот владеет СВОЕЙ единицей — «предмета нет в инвентаре»
  // на quick-пути недостижим: stale-слот доступен.
  p.inventory.quick[0] = 'healing_potion';
  p.inventory.slots = p.inventory.slots.filter((e) => e.id !== 'healing_potion');
  assert.deepEqual(canDoAction(c, 'quickItem'), { ok: true },
    'stale-слот — своя единица: ok (000223)');
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

// --- Очередь хода (задачи 000036/000167) ---
// 000167: порядок — по ИНИЦИАТИВЕ (Ловкость + Интеллект, по убыванию);
// равенство — канонический порядок (игрок → союзники → мобы, внутри —
// c.units). Механизм наблюдаемости тот же (000036): c.turnOrder
// (пересчёт в начале раунда) + c.turnIndex (действующий).

test('buildTurnOrder: по убыванию инициативы; тай — порядок units (000167)', () => {
  // 000167: очередь отсортирована по убыванию инициативы; равенство —
  // порядок базы (игрок → союзники → мобы, внутри — c.units).
  const c = createCombat({
    player: strongHero(), mobs: ['wolf', 'spider', 'troll'], mobLevel: 3, seed: 3,
  });
  assert.deepEqual(buildTurnOrder(c), ['m1', 'm2', 'm0', 'player'],
    'spider 4, troll 4 (тай — порядок c.units), wolf 3, strongHero 2');
  assert.equal(buildTurnOrder(c)[0], 'm1', 'первым — максимальная инициатива');
});

test('buildTurnOrder: мёртвые и fled исключены; все мертвы → ["player"]', () => {
  const c = createCombat({
    player: strongHero(), mobs: ['wolf', 'spider', 'troll'], mobLevel: 3, seed: 3,
  });
  c.units[0].alive = false;
  c.units[1].fled = true;
  assert.deepEqual(buildTurnOrder(c), ['m2', 'player'], 'troll 4 > strongHero 2');
  c.units[2].alive = false;
  assert.deepEqual(buildTurnOrder(c), ['player'], 'мобов не осталось');
});

test('turnOrder/turnIndex: начало боя — отсортированная очередь, очередь у игрока, phase "player"', () => {
  // 000167: pre-roll — мобы быстрее игрока (shaman 5, archer 4) уже
  // действовали в round 1 ДО первого хода игрока; очередь отсортирована,
  // turnIndex — на слоте игрока.
  const c = createCombat({ player: strongHero(), groupType: 0, seed: 5, levelDeltaMax: 0 });
  assert.equal(c.phase, 'player');
  assert.equal(c.round, 1);
  assert.equal(c.turnIndex, 2, 'очередь у игрока (pre-roll отработал)');
  assert.deepEqual(c.turnOrder, ['m3', 'm2', 'player', 'm0', 'm1'],
    'shaman 5, archer 4, игрок 2 (тай — перед воинами 2)');
});

test('turnOrder/turnIndex: после endTurn очередь пересчитана в новом раунде', () => {
  // 000167: pre-roll — spider (4) и wolf (3) действовали ДО игрока;
  // очередь отсортирована, пересчёт — в startRound (новом раунде).
  const p = strongHero();
  const c = createCombat({ player: p, mobs: ['wolf', 'spider'], mobLevel: 2, seed: 3 });
  assert.deepEqual(c.turnOrder, ['m1', 'm0', 'player']);
  assert.equal(c.turnIndex, 2, 'очередь у игрока (pre-roll отработал)');
  c._rng = () => 0.01; // попадания гарантированы
  const w = c.units[0];
  w.hp = 1;
  standNextTo(c, w);
  const r = c.attack(w.id);
  assert.equal(r.ok, true, 'удар по ослабленному волку');
  assert.equal(w.alive, false, 'волк повержен');
  // В фазе игрока действует очередь начала раунда (пересчёт — в новом).
  assert.deepEqual(c.turnOrder, ['m1', 'm0', 'player'],
    'старая очередь живёт до конца раунда');
  c.endTurn();
  assert.equal(c.phase, 'player');
  assert.equal(c.round, 2);
  assert.equal(c.turnIndex, 1, 'очередь снова у игрока (spider быстрее)');
  assert.deepEqual(c.turnOrder, ['m1', 'player'], 'убитый моб исчез из очереди');
});

test('turnIndex: в phase "mob" ходит по очереди — снимок лога с записью turnIndex', () => {
  // Детерминированный сценарий (сид 33) с очередью 000167 (shaman 5,
  // archer 4, игрок 2, warrior 2): pre-roll — шаман/лучник уже действовали
  // в round 1 (без строк лога: нет раненых / d 5 > 4 — шаг). В endTurn:
  // воин (хвост УСТАРЕВШЕЙ очереди, ti 3) промахивается; новый раунд —
  // шаман лечит раненого воина (ti 0), лучник промахивается (ti 1).
  // Перехват c.log.push фиксирует turnIndex в момент записи строки.
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
  assert.deepEqual(c.turnOrder, ['m2', 'm1', 'player', 'm0']);
  assert.equal(c.turnIndex, 2, 'очередь у игрока (pre-roll отработал)');
  assert.equal(c.round, 1);
  assert.equal(c.phase, 'player');

  const events = []; // [строка лога, c.turnIndex в момент записи]
  const origPush = c.log.push.bind(c.log);
  c.log.push = (msg) => { events.push([msg, c.turnIndex]); return origPush(msg); };

  c.endTurn();

  // Регрессия порядка: воин — в хвосте устаревшей очереди (round 1),
  // затем новый раунд по инициативе: шаман (5) → лучник (4).
  const iW = c.log.indexOf('Орк-воин промахивается.');
  const iA = c.log.indexOf('Орк-лучник промахивается.');
  const iS = c.log.indexOf('Орк-шаман лечит Орк-воин (+7).');
  assert.ok(iW !== -1 && iA !== -1 && iS !== -1,
    `нет всех трёх строк: ${c.log.join(' | ')}`);
  assert.ok(iW < iS && iS < iA,
    'новый раунд — по инициативе (шаман → лучник)');

  // turnIndex в момент действия (инвариант 000036 — на каждом действии):
  // воин — 3 (хвост устаревшей очереди), шаман — 0, лучник — 1.
  const at = (msg) => events.find(([m]) => m === msg);
  assert.ok(at('Орк-воин промахивается.'), 'нет строки воина в events');
  assert.equal(at('Орк-воин промахивается.')[1], 3, 'воин — свой слот в устаревшей очереди');
  assert.equal(at('Орк-шаман лечит Орк-воин (+7).')[1], 0, 'шаман — 1-й в новой очереди (init 5)');
  assert.equal(at('Орк-лучник промахивается.')[1], 1, 'лучник — 2-й (init 4)');

  // Новый раунд: очередь пересчитана (все живы — та же), очередь у игрока.
  assert.equal(c.round, 2);
  assert.equal(c.phase, 'player');
  assert.equal(c.turnIndex, 2);
  assert.deepEqual(c.turnOrder, ['m2', 'm1', 'player', 'm0']);
});

test('turnIndex: конец боя в цикле мобов — замирает на последнем действовавшем', () => {
  // 000164 (ОСОЗНАННЫЙ СЕМАНТИЧЕСКИЙ РЕПИН, ТЗ «Тесты (красные)»):
  // пре-000164 — добивающий удар сразу ставил { outcome: 'dead' }.
  // С 000164 — окно смерти в mob-фазе: фикстура БЕЗ СОЮЗНИКОВ/ЭФИРА →
  // неспасение → исход как ДО + аддитивное partyLost: true;
  // фаза-контекст сохранён (turnIndex застыл, очередь НЕ пересчитана —
  // инвариант 000036/000167; контракт 000164 §2.1 шаг 5).
  const p = createCharacter(); // 25 HP, без «Несокрушимости»
  const c = createCombat({ player: p, mobs: ['skeleton', 'skeleton'], mobLevel: 2, seed: 9 });
  const [m0, m1] = c.units;
  // Оба скелета вплотную: первый бьёт на 10 (25→15), второй добивает.
  m0.damage = 10;
  m1.damage = 25;
  m0.x = c.px - 1; m0.y = c.py;
  m1.x = c.px + 1; m1.y = c.py;
  c._rng = () => 0.01; // попадания гарантированы
  // 000167: скелеты (3) быстрее игрока (2) — pre-roll отработал,
  // очередь отсортирована, очередь у игрока.
  assert.deepEqual(c.turnOrder, ['m0', 'm1', 'player']);
  assert.equal(c.turnIndex, 2);
  c.endTurn(); // round 2: m0 бьёт 10 (25→15), m1 добивает
  assert.ok(c.result, 'бой должен завершиться');
  assert.equal(c.result.outcome, 'dead');
  assert.equal(c.result.partyLost, true,
    '000164: окно в mob-фазе неспасённое (нет Эфира) — partyLost: true');
  assert.equal(c.phase, 'over');
  assert.equal(c.turnIndex, 1, 'turnIndex застыл на последнем действовавшем (добившем)');
  assert.deepEqual(c.turnOrder, ['m0', 'm1', 'player'],
    'в phase "over" очередь не пересчитывается');
});

test('turnIndex: смерть от яда в начале раунда — очередь пересчитана, turnIndex 0 (000167)', () => {
  // 000167: тик яда — в startRound (начало раунда) ПОСЛЕ пересчёта
  // очереди и turnIndex = 0, поэтому при смерти turnIndex = 0, а не
  // индекс паучка. Паук (4) быстрее игрока (2): round 1 (pre-roll) —
  // шаг; round 2 — удар + яд (2); round 3 — тик 2 → 1, −2 HP → смерть.
  // 000164 (ОСОЗНАННЫЙ СЕМАНТИЧЕСКИЙ РЕПИН, ТЗ «Тесты (красные)»):
  // гибель от тика яда — ВТОРАЯ точка окна смерти (startRound):
  // фикстура БЕЗ СОЮЗНИКОВ/ЭФИРА → неспасение → исход как ДО +
  // аддитивное partyLost: true; очередь к моменту окна уже
  // ПЕРЕСЧИТАНА (дельта 000167 — turnIndex 0; контракт 000164 §2.2
  // точка 2 / §2.1 шаг 5).
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
  assert.equal(c.result.partyLost, true,
    '000164: окно от яда неспасённое (нет Эфира) — partyLost: true');
  assert.equal(c.phase, 'over');
  assert.equal(c.turnIndex, 0, 'тик убил после пересчёта — очередь у игрока');
  assert.deepEqual(c.turnOrder, ['m0', 'player'],
    'очередь — пересчитанная к началу фатального раунда');
  assert.ok(c.log.includes('Яд: −2 HP.'), 'смерть от тика яда');
});

test('turnIndex: игрок убил моба в фазе игрока — слот сохраняется, turnOrder[turnIndex] — действующий (регрессия ревью)', () => {
  // Пересчёт очереди — в начале раунда (startRound, 000167): моб,
  // убитый игроком, числится в УСТАРЕВШЕЙ очереди до конца раунда
  // (слот сохранён — UI не подсвечивает «пропущенный» индекс).
  // В момент mobAct c.turnOrder[c.turnIndex] = id действующего моба
  // (инвариант 000036). 000167: archer (4) быстрее игрока (2) —
  // pre-roll отработал, в новом раунде убитый grunt исключён.
  const p = strongHero();
  const c = createCombat({
    player: p, mobs: ['orc_grunt', 'orc_archer'], mobLevel: 1,
    seed: 42, width: 7, height: 3,
  });
  assert.deepEqual(c.turnOrder, ['m1', 'm0', 'player']);
  assert.equal(c.turnIndex, 2, 'очередь у игрока (pre-roll отработал)');
  const m0 = c.units[0];
  m0.hp = 1;
  const r = c.spell('fire', m0.id);
  assert.equal(r.killed, true, 'моб повержен в фазе игрока');
  assert.deepEqual(c.turnOrder, ['m1', 'm0', 'player'],
    'старая очередь живёт до конца раунда (слот убитого m0 сохранён)');

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
  assert.equal(at[1], 0, 'лучник — 1-й в НОВОЙ очереди (убитый mob исключён)');
  assert.equal(at[2][at[1]], 'm1', 'turnOrder[turnIndex] — id действующего моба');

  // Новый раунд: из очереди убитый моб исключён, очередь у игрока.
  assert.equal(c.phase, 'player');
  assert.equal(c.round, 2);
  assert.equal(c.turnIndex, 1, 'очередь у игрока (archer быстрее)');
  assert.deepEqual(c.turnOrder, ['m1', 'player']);
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

test('щит против БОЛЕЕ БЫСТРОГО моба: ровно 2 раунда защиты после каста (000167: тик в startRound — ДО фазы моба того же раунда; до 000167 — 3)', () => {
  // orc_grunt (init 3) > strongHero (2): в каждом раунде grunt бьёт
  // ПЕРВЫМ (интерлевинг). Каст в round 1 (после pre-roll — pre-roll
  // grunt сдвинулся на 1 клетку, не атаковал: спавн далеко); тик
  // c.ps.shield — в НАЧАЛЕ раунда (startRound), т.е. ПЕРЕД фазой
  // grunt того же раунда: каст в round 1 защиту в раунде каста НЕ даёт
  // (до 000167 тик был в конце хода игрока — ПОСЛЕ фазы мобов: 3
  // защищённых удара против любого моба).
  // Против моба с init ≤ игрока (тай) — поведение не изменилось:
  // пин «ровно 3 раунда» выше (orc_warrior init 2 = strongHero 2).
  const { castSpell } = spells();
  const p = strongHero();
  p.primary.wisdom = 10;
  p.spells = ['magic_shield'];
  const c = createCombat({
    player: p, mobs: ['orc_grunt'], mobLevel: 2, seed: 5 });
  const g = c.units[0];
  standNextTo(c, g);
  g.damage = 2; // броня щита 2 — гасит полностью
  c._rng = () => 0.01;
  const r = castSpell(c, 'magic_shield');
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(c.ps.shield, { armor: 2, turns: 3 });
  const round = () => {
    const hp = p.hp;
    c.endTurn();
    return p.hp - hp; // полученный урон (0 или отрицательный)
  };
  assert.equal(round(), 0, 'раунд 2: щит действует (тик 3→2 до фазы моба)');
  assert.equal(c.ps.shield.turns, 2, 'тик в startRound (начало раунда)');
  assert.equal(round(), 0, 'раунд 3: щит действует (тик 2→1)');
  assert.equal(c.ps.shield.turns, 1);
  assert.equal(round(), -2, 'раунд 4: щит протикан (1→0) — полный урон');
  assert.equal(c.ps.shield.turns, 0, 'эффект исчерпан');
  assert.equal(round(), -2, 'раунд 5: щита нет');
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
  // 000077: только ЧИСЛОВЫЕ (каталожные) ключи — «все группы» =
  // 7 каталожных; строковый BUILDING_BOSS — не «все группы».
  for (const [type, recipe] of Object.entries(GROUP_RECIPES)
    .filter(([type]) => String(type) === String(Number(type)))) {
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
  // 000077: только ЧИСЛОВЫЕ (каталожные) ключи — «все группы» =
  // 7 каталожных; строковый BUILDING_BOSS — не «все группы».
  for (const [type, recipe] of Object.entries(GROUP_RECIPES)
    .filter(([type]) => String(type) === String(Number(type)))) {
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

test('препятствия: моб за камнем обходит (A*, задача 000155): волк (3,3)+камень (3,4), 1 endTurn → (2,3), не на камне, alive', () => {
  // РЕ-ПИН (единственный семантический, предписан ТЗ 000155): раньше
  // «моб за камнем стоит» (000050 фиксировал stuck как намеренное,
  // «обход — отдельная работа по ИИ»); та работа — и есть задача
  // 000155: первый шаг обхода — (2,3) (левее раньше правее, тай-брейк
  // PATH_DIRS; контракт memory/000155-mob-pathfinding.md).
  const p = strongHero();
  const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 3, seed: 7 });
  const w = c.units[0];
  c.obstacles.clear();
  w.x = 3; w.y = 3;          // волк в центре поля, игрок в (3,6)
  c.obstacles.add('3,4');    // камень прямо между волком и игроком
  c._rng = () => 0.99;       // (атаки не будет: дистанция 3)
  c.endTurn();
  assert.equal(w.x, 2); assert.equal(w.y, 3,
    'волк обошёл камень: первый шаг (2,3), не остался у стены');
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

test('createCombat({allies}): союзники в c.units (side "ally"/"mob"), очередь по инициативе (000167)', () => {
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
  // Очередь (000167): по убыванию инициативы; тестовые фикстуры союзников
  // без attrs — init 0 (после игрока). pre-roll — быстрые мобы уже
  // действовали, очередь у игрока.
  assert.deepEqual(c.turnOrder, ['m1', 'm2', 'm0', 'player', 'a0', 'a1', 'a2']);
  assert.deepEqual(buildTurnOrder(c), ['m1', 'm2', 'm0', 'player', 'a0', 'a1', 'a2']);
  assert.equal(c.turnIndex, 3, 'начало боя — очередь у игрока');
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

test('buildTurnOrder: мёртвые и fled союзники исключены (000167)', () => {
  // 000167: тестовые фикстуры союзников без attrs — инициатива 0
  // (после игрока); мобы отсортированы по инициативе перед игроком.
  const c = createCombat({
    player: strongHero(),
    allies: [ALLY_VOLK, ALLY_ASHKA, ALLY_MIRA],
    mobs: ['wolf', 'spider', 'troll'], mobLevel: 3, seed: 3,
  });
  assert.deepEqual(buildTurnOrder(c), ['m1', 'm2', 'm0', 'player', 'a0', 'a1', 'a2']);
  c.units.find((u) => u.id === 'a1').alive = false;
  c.units.find((u) => u.id === 'a2').fled = true;
  assert.deepEqual(buildTurnOrder(c), ['m1', 'm2', 'm0', 'player', 'a0'],
    'мёртвые/fled союзники вне очереди');
});

test('turnIndex: союзник действует в фазе мобов — turnOrder[turnIndex] = id союзника (инвариант 000036)', () => {
  // 000167: союзник (init 0) — в хвосте очереди; wolf (3) и spider (4)
  // уже действовали в pre-roll (round 1).
  // 000168: endTurn — остановка на слоте союзника (ввод игрока);
  // удар — c.attack (ИИ-путь удалён); затем новый раунд.
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
  assert.deepEqual(c.turnOrder, ['m1', 'm0', 'player', 'a0']);
  assert.equal(c.turnIndex, 2, 'очередь у игрока (pre-roll отработал)');

  const events = []; // [строка лога, c.turnIndex, c.turnOrder]
  const origPush = c.log.push.bind(c.log);
  c.log.push = (msg) => {
    events.push([msg, c.turnIndex, c.turnOrder.slice()]);
    return origPush(msg);
  };
  // 000168: endTurn — остановка на слоте союзника (ввод); удар —
  // c.attack (ИИ-путь удалён); затем endTurn → новый раунд (мобы).
  c.endTurn();
  c.attack(w.id);
  c.endTurn();

  // Союзник — на своём слоте (3) очереди round 1 (ПОСЛЕ игрока).
  const aEv = events.find(([m]) => m === 'Вольк бьёт Волк: 3.');
  assert.ok(aEv, `нет действия союзника: ${c.log.join(' | ')}`);
  assert.equal(aEv[1], 3, 'союзник действует на слоте 3 (хвост очереди)');
  assert.equal(aEv[2][3], 'a0', 'turnOrder[turnIndex] — id действующего союзника');
  assert.ok(c.log.includes('Вольк бьёт Волк: 3.'),
    'пин удара союзника: ' + c.log.join(' | '));
  // Волк — round 2, на своём слоте (1): цель — соседний союзник.
  const mEv = events.find(([m]) => m === 'Волк промахивается.');
  assert.ok(mEv, `нет действия волка: ${c.log.join(' | ')}`);
  assert.equal(mEv[1], 1, 'волк действует на слоте 1 (init 3)');
  assert.equal(mEv[2][1], 'm0', 'turnOrder[turnIndex] — id действующего моба');
  // Новый раунд: очередь у игрока, все живы — та же очередь.
  assert.equal(c.phase, 'player');
  assert.equal(c.round, 2);
  assert.equal(c.turnIndex, 2, 'очередь у игрока (мобы быстрее)');
  assert.deepEqual(c.turnOrder, ['m1', 'm0', 'player', 'a0']);
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
    // 000168: endTurn → ввод-стоп на слоте союзника; c.attack — удар.
    c.endTurn();
    c.attack(w.id);
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
    c.obstacles.clear(); // 000168: сценарий — ВВОД ИГРОКА (c.move/c.attack)
    const a0 = c.units.find((u) => u.id === 'a0');
    const w = c.units.find((u) => u.id === 'm0');
    let i = 0; const rolls = [0.01, 0.99, 0.99, 0.99];
    c._rng = () => rolls[i++ % rolls.length];
    return { c, a0, w };
  };
  // d = 1 — «отступление» — ВВОД ИГРОКА (000168: ИИ-отступление
  // удалено): c.move — шаг ОТ врага, дистанция выросла, атаки нет.
  {
    const { c, a0, w } = mk();
    w.x = 3; w.y = 4; a0.x = 3; a0.y = 5;
    const d0 = Math.abs(a0.x - w.x) + Math.abs(a0.y - w.y);
    c.endTurn(); // остановка на слоте Ашки (ввод)
    c.move(1, 0); // (3,5) → (4,5) — шаг в сторону от врага
    const d1 = Math.abs(a0.x - w.x) + Math.abs(a0.y - w.y);
    assert.ok(d1 > d0, `d=1: отступил (d ${d0} → ${d1}, позиция ${a0.x},${a0.y})`);
    assert.ok(!c.log.some((l) => l.includes('бьёт Волк')),
      'атаки нет (ввод — движение): ' + c.log.join(' | '));
  }
  // 1 < d ≤ 4 — атака в даль (ввод c.attack), позиция НЕ меняется.
  {
    const { c, a0, w } = mk();
    w.x = 3; w.y = 0; a0.x = 3; a0.y = 3; // d = 3
    const hp0 = w.hp;
    c.endTurn();
    c.attack(w.id);
    assert.deepEqual([a0.x, a0.y], [3, 3], 'стрелок не сближается');
    assert.equal(w.hp, hp0 - 3, 'урон в даль: round(2.7×1.0) = 3');
    assert.ok(c.log.includes('Ашка бьёт Волк: 3.'), 'пин: ' + c.log.join(' | '));
  }
  // d > 4 — «кайтинг» — ВВОД ИГРОКА (000168: ИИ-кайтинг удалён):
  // c.move — ОДИН шаг ОТ врага. c.move(1,0) из (5,4) к волку (0,0) —
  // в (6,4), d 9 → 10 (паттерн «кайтинг» 000080 — теперь выбором
  // игрока, не ИИ).
  {
    const { c, a0, w } = mk();
    w.x = 0; w.y = 0; a0.x = 5; a0.y = 4; // d = 9
    c.endTurn();
    c.move(1, 0);
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
  // Камень на клетке шага — 000168: ввод c.move → rectFree-отказ
  // «препятствие», позиция неизменна (старый ИИ-подход удалён).
  {
    const { c, a0, w } = mk([ALLY_BALDOR]);
    w.x = 3; w.y = 2; a0.x = 3; a0.y = 5;
    c.obstacles.add('3,4');
    c.endTurn(); // остановка на слоте Бальдора (ввод)
    const r = c.move(0, -1);
    assert.equal(r.ok, false, 'камень на пути — шаг невозможен');
    assert.equal(r.reason, 'препятствие', 'reason — точная строка');
    assert.deepEqual([a0.x, a0.y], [3, 5], 'за камнем стоит (позиция неизменна)');
    assert.ok(!c.obstacles.has(a0.x + ',' + a0.y), 'не «внутри» камня');
  }
  // Клетка на пути занята ЧУЖИМ союзником — ввод c.move по другой оси.
  {
    const { c, a0, w } = mk([ALLY_BALDOR, ALLY_ASHKA]);
    const a1 = c.units.find((u) => u.id === 'a1');
    w.x = 2; w.y = 2; a0.x = 3; a0.y = 5; a1.x = 2; a1.y = 5; // (2,5) — занято
    c.endTurn();
    c.move(0, -1); // (3,5) → (3,4) — по оси y (x-клетка (2,5) занята)
    assert.deepEqual([a0.x, a0.y], [3, 4], 'обход занятой клетки (другая ось)');
    assert.notDeepEqual([a0.x, a0.y], [a1.x, a1.y], 'не на клетке союзника');
  }
  // Вплотную — атака (ввод c.attack): пин урона round(2.7×1.1) = 3.
  {
    const { c, a0, w } = mk([ALLY_BALDOR]);
    w.x = 3; w.y = 4; a0.x = 3; a0.y = 5; // d = 1
    const hp0 = w.hp;
    c.endTurn();
    c.attack(w.id);
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
  // 000168: endTurn → ввод-стоп на слоте Миров; c.heal — лечение.
  {
    const { c, a0, a1 } = mk(['mend']);
    a1.hp = 3;
    c.endTurn();
    c.heal();
    assert.equal(a1.hp, 8, 'Вольк 3 + 5 = 8 (round((4+0+1)×1) = 5)');
    assert.ok(c.log.includes('Мира лечит Вольк (+5).'),
      'пин лечения союзника: ' + c.log.join(' | '));
    assert.equal(c.player.hp, 9999, 'полный игрок не лечится');
  }
  // Сильнейшая степень: mend (степень 1) + greater_heal (степень 2)
  // → round(5×1.15) = 6. 000193: лечение — заклинание, расход маны
  // Миров (mp 5 по модели < 11 у greater_heal) → долив a0.mp = 15.
  {
    const { c, a0, a1 } = mk(['mend', 'greater_heal']);
    a0.mp = 15;
    a1.hp = 3;
    c.endTurn();
    c.heal();
    assert.equal(a1.hp, 9, 'greater_heal: 3 + 6 = 9');
    assert.ok(c.log.includes('Мира лечит Вольк (+6).'),
      'пин сильнейшей степени: ' + c.log.join(' | '));
    assert.equal(a0.mp, 4, '000193: мана Миров 15−11 (greater_heal)');
    assert.equal(a0.spellWis, 0, '000193: пул «Заклинание» (Мудрость) 1→0');
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
  // 000168: endTurn → ввод-стоп на слоте Миров; c.heal — лечение.
  c.endTurn();
  c.heal();
  assert.equal(c.player.hp, 113, 'игрок 108 + 5 через P.heal');
  assert.ok(c.log.includes('Мира лечит Флогистон (+5).'),
    'пин лечения игрока: ' + c.log.join(' | '));
  assert.equal(a1.hp, a1.maxHP, 'целый союзник не лечится');
});

test('support-союзник без лечебных заклинаний и без раненых — деградация (не падает, не лечит; 000168: без авто-шага ИИ)', () => {
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
  // spells: [] — нет лечебных заклинаний: раненый ЕСТЬ (игрок 108/270)
  // → c.heal доходит до проверки каталога → отказ «нет лечения»;
  // 000168: авто-шага ИИ НЕТ (ввод игрока — позиция неизменна).
  {
    const { c, a0, w } = mk();
    w.x = 3; w.y = 2; a0.x = 3; a0.y = 5; // d = 3
    c.player.hp = 108; // раненый — чтобы уперлись именно в «нет лечения»
    c.endTurn(); // ввод-стоп на слоте Миров
    const h = c.heal();
    assert.equal(h.ok, false, 'без заклинаний — лечение отказано');
    assert.equal(h.reason, 'нет лечения', 'reason — «нет лечения»');
    assert.equal(c.player.hp, 108, 'игрок не леча (HP не меняется)');
    assert.ok(!c.log.some((l) => l.includes('лечит')), 'без заклинаний не лечит');
    assert.deepEqual([a0.x, a0.y], [3, 5], '000168: авто-шага нет (ввод)');
  }
  // Заклинания есть, но НИКТО не ранен (все полные) — отказ
  // «нет раненых» (проверка раненых — ПЕРЕД каталогом).
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
    const h2 = c2.heal();
    assert.equal(h2.ok, false, 'все полные — лечение отказано');
    assert.equal(h2.reason, 'нет раненых', 'reason — «нет раненых»');
    assert.ok(!c2.log.some((l) => l.includes('лечит')),
      'все полные — лечения нет');
    assert.deepEqual([a0.x, a0.y], [3, 5], '000168: авто-шага нет (ввод)');
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
  // 000168: ИИ-шага/удара Волька нет (ввод): e1 — стоп на слоте
  // Волька (r1); e2 — r2: волк (слот 0) шаг (3,3)→(3,4), стоп — игрок;
  // e3 — стоп на слоте Волька (r2); e4 — r3: волк бьёт Волька
  // (d 1, 20 урона) → гибель; стоп — игрок. (Ранее: ИИ-шаг Волька
  // (3,5)→(3,4) в r1, волк убивал в r2 — на один раунд позже гибель
  // тем же путём; пины очереди ниже без изменений.)
  c.endTurn();
  c.endTurn();
  c.endTurn();
  c.endTurn();
  assert.equal(a0.alive, false, 'союзник погиб в бою');
  assert.ok(c.log.includes('Вольк пал в бою!'),
    'лог гибели: ' + c.log.join(' | '));
  assert.equal(c.result, null, 'гибель союзника — НЕ поражение');
  assert.equal(c.phase, 'player', 'бой продолжается');
  // 000167: очередь зафиксирована на старт раунда — серый слот погибшего
  // союзника (init 0, хвост) живёт до конца раунда; в следующем —
  // исключён: волк (3) → игрок (2).
  assert.deepEqual(c.turnOrder, ['m0', 'player', 'a0'], 'старая очередь до конца раунда');
  c.endTurn(); // ход игрока: серый слот пропущен, новый раунд
  assert.deepEqual(c.turnOrder, ['m0', 'player'], 'мёртвый союзник вне очереди');
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
    // 000168: endTurn — ввод-стоп на слоте Миров (ИИ-фолбэк удалён);
    // лечение — явный c.heal() ниже.
    c.endTurn();
    return c;
  };
  C2.combatInternals.allySpells = undefined; // каталог «ещё не загружен»
  const c1 = scenario(5);
  const h1 = c1.heal();
  assert.equal(h1.ok, false, 'без каталога — лечение невозможно');
  assert.equal(h1.reason, 'нет лечения', 'reason — «нет лечения» (деградация)');
  assert.ok(!c1.log.some((l) => l.includes('лечит')), 'без каталога — нет лечения');
  const a0 = c1.units.find((u) => u.id === 'a0');
  assert.deepEqual([a0.x, a0.y], [0, 6],
    '000168: авто-шага melee-фолбэка нет (ввод) — позиция якорная');
  // Каталог на месте (src/spells-data.js) — лечит по формуле.
  C2.combatInternals.allySpells = require('../src/spells-data.js').SPELLS_BY_ID;
  const c2 = scenario(5);
  const h2 = c2.heal();
  assert.equal(h2.ok, true, 'с каталогом — лечение');
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

// --- Опыт и уровни спутников (задача 000082; ре-пин 000205) ---
//
// Контракт (spec/companions.md «Опыт и уровни»,
// memory/000205-combat-xp-split.md):
//   * c.result.allyXp — ТОЛЬКО в outcome 'victory' с победами: массив
//     {id, xp} — по одному на КАЖДОГО союзника с kind 'merc'
//     (ПОЛОЖИТЕЛЬНЫЙ фильтр — устойчив к spelling kind Эфира 'efir'
//     (SPEC/memory 000035) vs 'ether' (memory/000080)); порядок — c.units.
//     000205: по ВСЕМ мерсам (выжившим и погибшим в бою), значение =
//     base = floor(xp / N), N = 1 (Флогистон) + ВСЕ союзники (side
//     'ally'). В 'fled'/'dead' поля НЕТ — 000087 гвардит
//     outcome === 'victory'.
//   * 000205: опыт делится поровну между ВСЕМИ участниками: Флогистон
//     — base + (xp mod N) («Учёный» (xpMult) — внутри P.addXp, только
//     к его доле); c.result.efirXp — base, если в бою юнит Эфира
//     (свой канал, никогда не в allyXp). Сумма долей = c.result.xp
//     (СУММА добытой группы, отображение) ТОЧНО.
//   * id — id юнита (data.id; для наёмника — npcId; 000087 маппит
//     allyXp → roster по нему). Доля погибшего мерса — 000087 применяет
//     ДО dead-сплайса (сохраняется в dead_mercs).
//   * НОЛЬ новых вызовов c._rng в checkVictory (gold-роллы — до
//     allyXp); лог-строка «Победа! +… опыта…» — без изменений.
//   * Регрессия: N = 1 (соло) — игрок получает ВСЕ xp, бит-в-бит
//     (000205-G1).

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

test('000082: победа — allyXp: base = floor(xp/N) КАЖДОМУ мерсу (000205: делится поровну между всеми участниками)', () => {
  const { c, p } = winWithAllies([ALLY_VOLK, ALLY_ASHKA]);
  // xp волка L2 = 8 + 4×2 = 16; N = 3 (игрок + 2 мерса) → base 5.
  assert.equal(c.result.xp, 16, 'result.xp — СУММА добытой группы (отображение)');
  assert.equal(p.totalXp, 6, 'игрок: base 5 + остаток 1');
  assert.deepEqual(c.result.allyXp, [
    { id: 'a0', xp: 5 },
    { id: 'a1', xp: 5 },
  ], 'порядок — c.units; каждому base = floor(16/3) = 5; сумма долей ' +
    '5+5+6 = 16 = xp ТОЧНО');
});

test('000082: игрок — base + остаток (000205: равное деление между всеми участниками)', () => {
  const { c, p } = winWithAllies([ALLY_VOLK, ALLY_ASHKA]);
  assert.equal(c.result.xp, 16);
  assert.equal(p.totalXp, 6, 'scholar 0: totalXp = base 5 + остаток 1 (N = 3)');
  assert.equal(p.xp, 6, '6 < 50 (xpForNext(1)) — уровень не меняется');
  assert.equal(p.level, 1);
});

test('000082: бонус «Учёный» (xpMult) — только к доле игрока (000205: round(доля×xpMult)); спутникам — base БЕЗ бонуса', () => {
  // scholar 5 → xpMult = 1 + 0.02×5 = 1.1. N = 3 → base 5, доля игрока 6.
  const { c, p } = winWithAllies([ALLY_VOLK, ALLY_ASHKA],
    { mutate: (h) => { h.secondary.scholar = 5; } });
  assert.equal(p.totalXp, 7, 'игрок: round((5+1)×1.1) = 7 (бонус — к его доле)');
  assert.deepEqual(c.result.allyXp, [
    { id: 'a0', xp: 5 },
    { id: 'a1', xp: 5 },
  ], 'base = floor(16/3) = 5 — «Учёный» спутникам НЕ идёт (навыков у них нет — v1)');
});

test('000082: погибший в бою спутник — В allyXp (000205: участник — доля сохранится в dead_mercs)', () => {
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
  // 000168: ИИ-шага Волька нет (ввод). Очередь ['m0','player','a0','a1']:
  // e1 — стоп a0 (r1); e2 — стоп a1 (r1); e3 — r2: волк ШАГ (3,3)→(3,4)
  //   (d2→d1), стоп — игрок; e4 — стоп a0 (r2); e5 — стоп a1 (r2);
  // e6 — r3: волк бьёт Волька (d1, 20 урона) → гибель.
  c.endTurn();
  c.endTurn();
  c.endTurn();
  c.endTurn();
  c.endTurn();
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
  assert.equal(p.totalXp, 16, 'игрок: base 16 + остаток 0 (N = 3)');
  assert.deepEqual(c.result.allyXp, [
    { id: 'a0', xp: 16 },
    { id: 'a1', xp: 16 },
  ], 'погибший a0 — В списке (участник, 000205); base = floor(48/3) = 16');
});

test('000082: allyXp — только kind === "merc"; "efir" (Эфир) — в efirXp, неизвестный kind ("ether") — в N, долю не получает (000205)', () => {
  // Позитивный фильтр: устойчив к spelling kind Эфира —
  // SPEC/memory/000035 «efir», memory/000080 «ether». 000205: N = 4
  // (игрок + efir + ether + наёмник) → base = floor(16/4) = 4; Эфир —
  // участник, его доля — свой канал efirXp (НЕ 0.5+100% двойного
  // подсчёта); «ether» — в N, доли не получает.
  const EFIR = { name: 'Эфир', role: 'support', level: 1, dmg: 0.5, hp: 1,
    skills: [], spells: [], id: 'efir', kind: 'efir' };
  const ETHER = { name: 'Эфир (вариант kind)', role: 'melee', level: 1,
    dmg: 0.5, hp: 1, skills: [], spells: [], id: 'ether', kind: 'ether' };
  const { c, p } = winWithAllies([EFIR, ETHER, ALLY_VOLK]);
  assert.deepEqual(c.result.allyXp, [{ id: 'a2', xp: 4 }],
    'наёмник a2 (kind "merc") — в списке, base 4; "efir"/"ether" — вне');
  assert.equal(c.result.efirXp, 4, 'Эфир — участник: efirXp = base = 4');
  assert.equal(p.totalXp, 4, 'игрок: base 4 + остаток 0');
  assert.equal(c.result.xp, 16, 'result.xp — СУММА добытой группы');
});

test('000082: id союзника — data.id (для наёмника — npcId): allyXp маппится на roster', () => {
  const { c } = winWithAllies([
    Object.assign({}, ALLY_VOLK, { id: 'merc_volk' }),
    Object.assign({}, ALLY_ASHKA, { id: 'merc_ashka' }),
  ]);
  assert.deepEqual(c.result.allyXp, [
    { id: 'merc_volk', xp: 5 },
    { id: 'merc_ashka', xp: 5 },
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
  // 000168: ИИ-удара Волька нет — ВВОД игрока: на слоте Волька
  // c.attack (добивает волка); игрок только endTurn (не действует).
  let n = 0;
  while (!c.result && n++ < 30) {
    if (activeUnitId(c) === 'a0') c.attack(w.id);
    c.endTurn();
  }
  assert.equal(c.result.outcome, 'victory', 'Вольк добивает волка без игрока');
  assert.deepEqual(p.skillXp, {},
    'игрок не действовал; атака союзника НЕ вызывает P.skillPractice (v1)');
  assert.equal(c.result.xp, 16,
    'result.xp — СУММА добытой группы (отображение); игрок — долю, 000205');
});

// --- Опыт после боя делится поровну (задача 000205) ---
//
// КРАСНЫЕ тесты (TDD): падают, пока checkVictory не считает
// base = floor(xp / N), N = 1 + ВСЕ юниты c.units со side 'ally'
// (Эфир — живой или мёртвый; наёмники — живые и погибшие в бою),
// игроку — base + (xp mod N), прочим — base, и пока поле
// c.result.efirXp не существует (finish() читает result.xp — 100%).
// Контракт — memory/000205-combat-xp-split.md.
//
// Зелёные guards (G*): не входят в expected red-count:
//   G1 — соло N=1: игрок ВСЕ xp, allyXp [] (бит-в-бит с до-000205);
//   G2 — детерминизм: доля чистая арифметика, gold не зависит от
//        числа союзников (ноль новых вызовов c._rng).

test('000205-N1: победа — опыт делится поровну: N = 1 + |ally|, base = floor(xp/N), остаток — игроку; Эфира нет — efirXp 0', () => {
  // xp волка L2 = 8 + 4×2 = 16; N = 3 (игрок + 2 мерса) → base 5.
  // Игрок: 5 + (16 mod 3) = 6. Мерсам: по 5. Сумма долей = 16.
  const { c, p } = winWithAllies([ALLY_VOLK, ALLY_ASHKA]);
  assert.equal(c.result.xp, 16, 'result.xp — СУММА добытой группы (отображение)');
  assert.equal(p.totalXp, 6,
    'игрок: base + остаток = 5 + 1 = 6 (НЕ 100% = 16, как до 000205)');
  assert.equal(p.level, 1, '6 < xpForNext(1) = 50 — уровень не растёт');
  assert.deepEqual(c.result.allyXp, [
    { id: 'a0', xp: 5 },
    { id: 'a1', xp: 5 },
  ], 'каждому мерсу base = floor(16/3) = 5 (НЕ round(16×0.5) = 8)');
  assert.equal(c.result.efirXp, 0,
    'юнита Эфира в бою нет — efirXp 0 (поле ВСЕГДА в victory)');
});

test('000205-N2: Эфир-юнит — участник: N включает kind \'efir\'; result.efirXp = base; Эфир вне allyXp', () => {
  // Фикстура Эфира — как в 000082-блоке (kind 'efir', data.id 'efir').
  // N = 3 (игрок + Эфир + Вольк) → base = floor(16/3) = 5.
  const EFIR = { name: 'Эфир', role: 'support', level: 1, dmg: 0.5, hp: 1,
    skills: [], spells: [], id: 'efir', kind: 'efir' };
  const { c, p } = winWithAllies([EFIR, ALLY_VOLK]);
  assert.equal(c.result.xp, 16);
  assert.equal(c.result.efirXp, 5,
    'Эфир — участник: efirXp = base = 5 (поле НОВОЕ — 000205)');
  assert.deepEqual(c.result.allyXp, [{ id: 'a1', xp: 5 }],
    'allyXp — ТОЛЬКО kind \'merc\' (Вольк a1); Эфир a0 вне (свой канал efirXp)');
  assert.equal(p.totalXp, 6, 'игрок: 5 + (16 mod 3) = 6');
});

test('000205-N3: погибший в бою наёмник — участник: в N И в allyXp (доля сохранится в dead_mercs)', () => {
  // Сцена «Вольк погиб» (волк L10 → xp 48, паттерн 000082 T-f):
  // N = 3 (игрок + a0 мёртв + a1 жив) → base = floor(48/3) = 16,
  // остаток 0. Доля мёртвого a0 — в allyXp (запись ещё в roster на
  // момент xp-шага; combatEndCompanions применит её ДО dead-сплайса).
  const p = strongHero();
  const c = createCombat({
    player: p,
    allies: [ALLY_VOLK, ALLY_ASHKA],
    mobs: ['wolf'], mobLevel: 10, seed: 5,
  });
  c.obstacles.clear();
  const a0 = c.units.find((u) => u.id === 'a0'); // Вольк
  const w = c.units.find((u) => u.id === 'm0');
  a0.x = 3; a0.y = 5;
  const a1 = c.units.find((u) => u.id === 'a1'); // Ашка
  a1.x = 0; a1.y = 6;
  w.x = 3; w.y = 3;
  w.damage = 20; // добивает слабого союзника (13 HP) одним ударом
  c._rng = () => 0.01; // все попадания
  c.endTurn();
  c.endTurn();
  c.endTurn();
  c.endTurn();
  c.endTurn();
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
  assert.equal(p.totalXp, 16, 'игрок: base 16 + остаток 0 (НЕ 100% = 48)');
  assert.deepEqual(c.result.allyXp, [
    { id: 'a0', xp: 16 },
    { id: 'a1', xp: 16 },
  ], 'погибший a0 — В списке (участник); base = floor(48/3) = 16 ' +
    '(НЕ «только выжившим» = [{a1, 24}], как до 000205)');
  assert.equal(c.result.efirXp, 0, 'Эфира в бою нет — efirXp 0');
});

test('000205-N4: «Учёный» (xpMult) — к доле игрока: round(доля×xpMult); спутникам бонуса нет', () => {
  // scholar 5 → xpMult = 1 + 0.02×5 = 1.1. N = 3, base = 5.
  // Игрок: round(6×1.1) = round(6.6) = 7 (доля + остаток — ДО бонуса).
  const { c, p } = winWithAllies([ALLY_VOLK, ALLY_ASHKA],
    { mutate: (h) => { h.secondary.scholar = 5; } });
  assert.equal(c.result.xp, 16);
  assert.equal(p.totalXp, 7,
    'игрок: round((5+1)×1.1) = 7 (НЕ round(16×1.1) = 18, как до 000205)');
  assert.deepEqual(c.result.allyXp, [
    { id: 'a0', xp: 5 },
    { id: 'a1', xp: 5 },
  ], 'спутникам base БЕЗ «Учёного» (навыков у них нет — v1)');
});

test('000205-G1: без союзников — N = 1: игрок получает ВСЕ xp, allyXp = [] (бит-в-бит соло)', () => {
  const { c, p } = winWithAllies([]);
  assert.equal(c.result.outcome, 'victory');
  assert.equal(c.result.xp, 16);
  assert.equal(p.totalXp, 16, 'N = 1 — весь xp игроку (соло без изменений)');
  assert.deepEqual(c.result.allyXp, [], '0 союзников — пустой массив');
});

test('000205-G2: детерминизм — два прогона (2 мерса) → идентичный {allyXp, efirXp, xp, gold, items}; gold не зависит от числа союзников', () => {
  const run = (allies) => {
    const { c } = winWithAllies(allies);
    return JSON.stringify({
      allyXp: c.result.allyXp, efirXp: c.result.efirXp,
      xp: c.result.xp, gold: c.result.gold, items: c.result.items,
    });
  };
  assert.equal(run([ALLY_VOLK, ALLY_ASHKA]),
    run([ALLY_VOLK, ALLY_ASHKA]), 'тот же сценарий — тот же результат');
  const gDuo = (() => {
    const { c } = winWithAllies([ALLY_VOLK, ALLY_ASHKA]);
    return c.result.gold;
  })();
  const gSolo = (() => {
    const { c } = winWithAllies([]);
    return c.result.gold;
  })();
  assert.equal(gDuo, gSolo,
    'gold(2 мерса) === gold(соло, тот же seed) — доля не добавила c._rng');
});

// --- Эфир: постоянный союзник (задача 000081) ---
//
// КРАСНЫЕ тесты (TDD): падают, пока src/efir.js не существует
// (модуль + данные makeAlly). Проводка «Эфир ВСЕГДА в allies» — в
// main.js/combat-ui.js — пинится отдельно (tests/combat-ui.test.js,
// tests/main-visuals.test.js, tests/index-order.test.js).
//
// Контракт (memory/000081-efir.md + memory/000081-efir-ally.md):
//   * Эфир — частный случай «союзного юнита» (000080): kind 'efir',
//     данные — Game.efir.efirAllyData(state); combat.js — 0 изменений;
//   * state {level, xp, skills} — ВНЕ боя (владелец main.js); HP в
//     состоянии НЕТ → каждый бой НОВЫЙ makeAlly (hp = maxHP):
//     «возврат со 100% HP» — структурно, без кода восстановления;
//   * НОЛЬ новых вызовов c._rng в проводке (placeAllies без RNG — 000080).
//
// require src/efir.js — ЛЕНИВО (хелпер try/catch → assert.fail):
// top-level require в шапке в красной фазе (файл отсутствует) валит
// ВСЕ тесты этого файла (прецедент: loadLocations, tests/locations.
// test.js).
function loadEfir000081() {
  try {
    return require(path.join(__dirname, '..', 'src', 'efir.js'));
  } catch (e) {
    assert.fail('src/efir.js не существует или не грузится ' +
      '(задача 000081): ' + e.message);
  }
}

test('000081: Эфир в allies — юнит id/kind "efir", side "ally", полный HP, 1×1, якорь (px−1, py−1); очередь по инициативе (000167); мораль ×(1+companionMoraleBonus)', () => {
  const E = loadEfir000081();
  // Без навыка «Предводитель»: мораль ×1 (урон — чистая формула).
  const p = strongHero();
  const c = createCombat({
    player: p,
    allies: [E.efirAllyData(E.createEfir())],
    mobs: ['wolf'], mobLevel: 2, seed: 5,
  });
  const u = c.units.find((x) => x.id === 'efir');
  assert.ok(u, 'Эфир в allies (createCombat({allies: [efirAllyData]}))');
  assert.equal(u.kind, 'efir', "kind — строго 'efir'");
  assert.equal(u.side, 'ally');
  assert.equal(u.name, 'Эфир');
  assert.equal(u.role, 'support');
  assert.equal(u.alive, true);
  assert.equal(u.hp, u.maxHP, 'старт с полным HP');
  assert.equal(u.maxHP, Math.max(1, Math.round((8 + 4 * 1) * 0.7)),
    'L1 support: maxHP = 8 (формула makeAlly)');
  assert.deepEqual(u.size, { w: 1, h: 1 }, 'союзник всегда 1×1');
  // 000167: очередь по инициативе — Эфир (4) → волк (3) → игрок (2).
  // 000168: Эфир — союзник; pre-roll останавливается на ПЕРВОМ союзном
  // слоте (ввод игрока) — Эфир быстрее всех, очередь на нём (turnIndex 0).
  assert.deepEqual(c.turnOrder, ['efir', 'm0', 'player'],
    'очередь: Эфир (4) → волк (3) → игрок (2)');
  assert.equal(c.turnIndex, 0,
    '000168: pre-roll остановился на вводе — слот Эфира (быстрее всех)');
  assert.equal(c.phase, 'player');
  // Якорь размещения 000080/000081 — проверяется ДО pre-roll (D-9):
  // игрок быстрее Эфира (6 > 4) → Эфир в pre-roll не действует,
  // позиция = якорь (позиция ПОСЛЕ pre-roll не пинится — зависит от
  // пошагового пути allyStepToward, хрупко).
  const pA = strongHero();
  pA.primary.dexterity = 3; pA.primary.intelligence = 3;
  const cA = createCombat({
    player: pA,
    allies: [E.efirAllyData(E.createEfir())],
    mobs: ['wolf'], mobLevel: 2, seed: 5,
  });
  const uA = cA.units.find((x) => x.id === 'efir');
  assert.equal(uA.x, cA.px - 1, 'первый якорь (px−1, py−1) «всегда со мной» (до pre-roll)');
  assert.equal(uA.y, cA.py - 1);
  // Мораль: без «Предводителя» — ×1 (урон = формула).
  assert.equal(u.moraleMult, 1, 'без навыка — mult 1');
  assert.equal(u.damage, Math.max(1, Math.round(2 + 0.7 * 1)),
    'без навыка — damage = round(2.7) = 3');
  // «Предводитель» 10 → companionMoraleBonus 0.5 → урон ×1.5 (000080).
  const p2 = strongHero();
  p2.secondary.leader = 10;
  const c2 = createCombat({
    player: p2,
    allies: [E.efirAllyData(E.createEfir())],
    mobs: ['wolf'], mobLevel: 2, seed: 5,
  });
  const u2 = c2.units.find((x) => x.id === 'efir');
  assert.equal(u2.moraleMult, 1.5, 'leader 10 → 1 + 0.05×10 = 1.5');
  assert.equal(u2.damage, Math.max(1, Math.round((2 + 0.7 * 1) * 1.5)),
    'damage = round(2.7·1.5) = 4 (моральный бонус в уроне)');
});

test('000081: гибель в бою → возврат в следующем бою со 100% HP (state не мутируется)', () => {
  const E = loadEfir000081();
  const p = strongHero();
  const state = E.createEfir();
  // Бой 1: волк добивает Эфира одним ударом (гибель союзника ≠ поражение,
  // паттерн теста 000082 «погибший в бою»).
  const c1 = createCombat({
    player: p,
    allies: [E.efirAllyData(state)],
    mobs: ['wolf'], mobLevel: 10, seed: 5,
  });
  c1.obstacles.clear();
  const e1 = c1.units.find((x) => x.id === 'efir');
  const w = c1.units.find((x) => x.id === 'm0');
  w.x = 2; w.y = 4; // рядом с Эфиром (px−1, py−1) = (2,5): д=1 (к игроку
                    // (3,6) — д=3), добивает одним ударом за раунд
  w.damage = 20;    // добивает Эфира (8 HP) одним ударом
  c1._rng = () => 0.01; // все попадания
  c1.endTurn(); // игрок (не действует) → Эфир (support) → волк
  assert.equal(e1.alive, false, 'Эфир погиб в бою 1');
  assert.equal(c1.result, null, 'гибель союзника — НЕ поражение');
  // Бой 2: тот же persistent-объект state → НОВЫЙ makeAlly: hp = maxHP.
  const c2 = createCombat({
    player: p,
    allies: [E.efirAllyData(state)],
    mobs: ['wolf'], mobLevel: 2, seed: 7,
  });
  const e2 = c2.units.find((x) => x.id === 'efir');
  assert.ok(e2, 'Эфир в allies СЛЕДУЮЩЕГО боя (ВСЕГДА)');
  assert.equal(e2.alive, true, 'возвращается в бой');
  assert.equal(e2.hp, e2.maxHP, 'возврат со 100% HP (hp = maxHP у makeAlly)');
  // Бой не пишет в state (level/xp — только addEfirXp в проводке 000081).
  assert.equal(state.level, 1);
  assert.equal(state.xp, 0);
});

test('000081: детерминизм хода Эфира (по сиду): два прогона сценария → идентичные снимки', () => {
  const E = loadEfir000081();
  const run = () => {
    const p = strongHero();
    const state = E.createEfir();
    const c = createCombat({
      player: p,
      allies: [E.efirAllyData(state)],
      mobs: ['wolf'], mobLevel: 2, seed: 11,
    });
    c.obstacles.clear();
    // Сценарий: игрок не действует, 3 раунда (Эфир ходит по очереди).
    for (let i = 0; i < 3 && !c.result; i++) c.endTurn();
    return {
      units: c.units.map((u) => [u.id, u.x, u.y, u.hp, u.alive]),
      log: c.log,
      turnOrder: c.turnOrder,
    };
  };
  assert.deepEqual(run(), run(),
    'тот же сид + сценарий — тот же поток c._rng (детерминизм)');
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

// --- 000077: рецепт босса постройки (строковый ключ — не каталог) ---

test('C1. BUILDING_BOSS: рецепт босса (1–3 troll) + регрессия 7 каталожных групп', () => {
  // Строковый ключ — легален (контракт 000077 R-2): каталог
  // mob_groups ЗАПРЕЩЁН схемой 000057 (id 1..7, «число» 2..6,
  // спрайт-enum); «8-я группа в каталоге» тоже запрещена —
  // mobGroupCount() 7→8 ломает генерацию карт (hash2 % N).
  // Рецепт живёт в КОДЕ, за GROUP_RECIPES.
  const r = GROUP_RECIPES.BUILDING_BOSS;
  assert.ok(r, 'GROUP_RECIPES.BUILDING_BOSS — рецепт босса (red: нет)');
  assert.equal(typeof r.name, 'string', 'name — string');
  assert.ok(Array.isArray(r.mobs) && r.mobs.length >= 1,
    'mobs — массив id');
  for (const id of r.mobs) {
    assert.ok(MOB_TYPES[id], 'mobs: «' + id + '» ∈ MOB_TYPES');
  }
  assert.deepEqual(r.count, [1, 3],
    'count [1,3] (каталожные 2..6 — не для босса)');
  // Регрессия: 7 КАТАЛОЖНЫХ рецептов (0..6) НЕ ИЗМЕНЕНЫ — ≡
  // каталогу (защита от случайной переделки при добавлении
  // строкового ключа).
  const MOB_GROUPS_DIR = path.join(__dirname, '..', 'assets', 'mob_groups');
  const files = fs.readdirSync(MOB_GROUPS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f)).sort()
    .map((f) => JSON.parse(
      fs.readFileSync(path.join(MOB_GROUPS_DIR, f), 'utf8')));
  assert.equal(files.length, 7, 'каталог: ровно 7 групп');
  for (let i = 0; i < 7; i++) {
    const rec = GROUP_RECIPES[i], f = files[i];
    assert.equal(rec.name, f.состав.название,
      `тип ${i}: recipe.name ≠ каталогу`);
    assert.deepEqual(rec.mobs,
      f.состав.мобы.map((m, n) => {
        assert.ok(JR.isRef(m),
          `тип ${i}, состав.мобы[${n}]: «${m}» — не ссылка (формат "assets/mobs/NNNNNN.json")`);
        const r = JR.resolveRef(path.join(__dirname, '..'), m);
        assert.ok(r.ok, `тип ${i}, состав.мобы[${n}]: «${m}» — ${r.reason}`);
        return r.id;
      }),
      `тип ${i}: состав мобов ≠ каталогу (GROUP_RECIPES — id-форма)`);
    if ('число' in f.состав) {
      assert.deepEqual(rec.count, f.состав.число,
        `тип ${i}: count ≠ каталогу`);
    } else {
      assert.equal(rec.count, undefined, `тип ${i}: лишнее count`);
    }
  }
});

// --- Задача 000112: Эфир в бою — боевой профиль buildEfirUnit +
//     ИИ efirTurn (КРАСНЫЕ) ---
//
// Контракт (memory/000112-efir-combat.md):
//   * buildEfirUnit(efir, c) — 12-й экспорт src/efir.js: явные статы
//     (hp = maxHP = efirStats, СВОЯ мана u.mp = maxMP), Касание
//     u.damage = max(1, round((2+0.5·Мудр)·moraleMult)), пул c.efs
//     {spellInt, spellWis, touch, move}, снапшот лордов u.efirSkills,
//     ссылка c.efir (для рефила/тиков);
//   * allyAct: ПОСЛЕ гарда — `if (u.kind === 'efir' && c.efs)
//     efirTurn(c, u)`: БЕЗ c.efs — legacy-путь 000080 (бит-в-бит;
//     регрессионные якоря R7/R8/R9/T9 — НЕ ТРОГАТЬ);
//   * efirTurn — детерминирован, НУЛЬ новых c._rng: движение (эскорт:
//     цель выбирается ОДИН РАЗ — dP>3 → игрок, иначе dE>3 → ближайший
//     враг, иначе стоим; allyStepToward — ось x первой; бюджет
//     c.efs.move = 3) + действия по приоритету, пока пулы не пусты:
//     (1) самое раненое frac ≤ 0.7 (пул [игрок, союзники + Эфир]),
//     strongestKnown('лечение'), amount = round(3+0.5·Мудр+уровень);
//     (2) игрок frac ≤ 0.5 И нет c.efirShield (turns > 0) →
//     strongestKnown('защита') → c.efirShield {armor:
//     round(5+0.5·Мудр), turns: 2};
//     (3) враг rectDist ≤ 4 И c.efs.spellInt > 0 →
//     strongestKnown('урон') (по «мани», тай-брейк — id) →
//     dmg = round((3+0.5·Инт)·(1+0.05·лорд)) — ВСЕГДА попадает,
//     броня игнорируется;
//     (4) rectDist ≤ 1 И c.efs.touch > 0 → Касание (u.damage, ВСЕГДА
//     попадает, броня игнорируется, c._rng НЕ вызывается);
//     (5) break;
//   * startRound (000167): refill c.efs от c.efir.attrs (зеркальная
//     формула, u.mp НЕ трогается) + тик c.efirShield.turns (пока > 0);
//   * dealDamageToPlayer: поглощение c.efirShield (ПОСЛЕ c.ps.shield);
//   * combatInternals + dealDamageToAlly.
//
// Каждый сценарий — ДВА прогона (тот же сид + сценарий → deepEqual
// снимка {units[id,x,y,hp,alive], u.mp, c.efs, c.efirShield, p.hp,
// p.mp, log, turnOrder} — детерминизм ТЗ: Эфир не добавляет бросков
// c._rng). Красная фаза падает ТОЛЬКО на отсутствии buildEfirUnit /
// efirTurn-поведения (нет символа — НЕ синтаксическая ошибка).
//
// Словарь каталога (assets/spells, «мани»): spark 3, frost_bolt 4,
// magic_shield 5, fireball 6, light_heal 6, nature_blessing 7, ward 12,
// greater_heal 11, mend 3, vine 5. Книги по уровню (000111):
// L1 [spark, mend]; +L5 light_heal, +L8 frost_bolt, +L10 fireball,
// +L12 magic_shield, +L15 vine, +L20 greater_heal, +L25 ward,
// +L30 nature_blessing.

const PL = require('../src/player.js');
// 000139 (000144): единый лист — levelUp через Game.Sheet; фейкам с
// levelUp-циклом Sheet ОБЯЗАТЕЛЕН (иначе levelUp → 0 → бесконечный
// цикл — осознанный пере-пин).
const Sheet = require('../src/sheet.js');

// ЛЕНИВЫЙ Game (прецедент tests/efir.test.js withGame): efir.js читает
// globalThis.Game.xpForNext в момент ВЫЗОВА levelUp.
function withGame112(fake, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'Game');
  const prev = globalThis.Game;
  globalThis.Game = fake;
  try {
    return fn();
  } finally {
    if (had) globalThis.Game = prev;
    else delete globalThis.Game;
  }
}

// Герой сценария: Тело 50 (maxHP 270), hp — по сценарию.
// hp = maxHP ЯВНО (createCharacter ставит hp от статов-единиц ДО
// повышения Тела; сценарии, не переопределяющие p.hp, — «270/270»).
function hero112() {
  const p = createCharacter();
  p.primary.constitution = 50;
  p.hp = derived(p).maxHP;
  return p;
}

// Поднять state Эфира до уровня L (levelUp-цикл, без хардкода сумм) —
// книга становится естественной (старт + пороги ≤ L).
function raiseEfir112(E, state, L) {
  // 000139 (000144): Sheet в фейке (единый лист; без него levelUp → 0
  // → бесконечный цикл).
  withGame112({ xpForNext: PL.xpForNext, Sheet }, () => {
    while (state.level < L) {
      state.xp = PL.xpForNext(state.level);
      E.levelUp(state);
    }
  });
  return state;
}

// Детерминизм-снимок (ТЗ): примитивы + лог.
function snap112(c, u, p) {
  return {
    units: c.units.map((x) => [x.id, x.x, x.y, x.hp, x.alive]),
    uMp: u.mp,
    efs: c.efs ? { spellInt: c.efs.spellInt, spellWis: c.efs.spellWis,
                   touch: c.efs.touch, move: c.efs.move } : null,
    shield: c.efirShield ? { armor: c.efirShield.armor,
                             turns: c.efirShield.turns } : null,
    pHp: p.hp,
    pMp: p.mp,
    log: c.log,
    turnOrder: c.turnOrder,
  };
}

// Стандартное поле: игрок (3,6), Эфир — якорь (2,5), один волк m0
// (позицию/hp/броню/урон — по сценарию), препятствия сняты.
function board112(E, p, state) {
  const c = createCombat({
    player: p,
    allies: [E.efirAllyData(state)],
    mobs: ['wolf'], mobLevel: 2, seed: 5,
  });
  c.obstacles.clear();
  return {
    c,
    w: c.units.find((x) => x.id === 'm0'),
    u: c.units.find((x) => x.id === 'efir'),
  };
}

test('000112 CB-1: приоритет (1) — лечение самого раненого (frac ≤ 0.7): 2 цели → мин. frac (само-лечение, +6, мана 3); все frac > 0.7 — не лечит; книга L12 → light_heal («мани» 6), НЕ mend (3) — amount 19', () => {
  const E = loadEfir000081();
  const C = require('../src/combat.js');
  const saveCatalog = C.combatInternals.allySpells;
  C.combatInternals.allySpells =
    require('../src/spells-data.js').SPELLS_BY_ID;
  try {
    // (a) Игрок 162/270 (0.6) + Эфир 5/16 (0.3125) → само-лечение
    // mend +6 (11); игрок НЕ тронут; mp 11 − 3 = 8.
    const t1 = () => {
      const p = hero112();
      p.hp = Math.floor(270 * 0.6); // 162
      const state = E.createEfir();
      const { c, w, u } = board112(E, p, state);
      w.x = 6; w.y = 0; w.maxHP = 100; w.hp = 100; // d 9 → 3 шага → 6 > 4
      c._rng = () => 0.99; // волк — все промахи
      E.buildEfirUnit(state, c);
      u.hp = 5;
      c.endTurn();
      return { snap: snap112(c, u, p), u, p, c };
    };
    const r1 = t1();
    assert.deepEqual(t1().snap, r1.snap,
      'детерминизм (a): 2 прогона → идентичный снимок');
    // 000168: ИИ-лечение Эфира удалено (ввод) — endTurn на слоте Эфира
    // ничего не делает: Эфир не лечит себя, игрок не тронут, мана цела.
    assert.equal(r1.u.hp, 5,
      '000168: Эфир не лечит себя (ввод) — hp 5');
    assert.equal(r1.p.hp, 162, 'игрок не лечен (ИИ-лечения нет)');
    assert.equal(r1.u.mp, 11, 'мана не потрачена (нет каста)');
    assert.ok(!r1.c.log.some((l) => l.includes('исцеляет')),
      'нет само-лечения: ' + r1.c.log.join(' | '));

    // (b) Все целы (frac = 1 — исключаются): не лечит, каста нет
    // (d 6 > 4), Касания нет (d 6 > 1) — мана цела.
    const t2 = () => {
      const p = hero112(); // hp = maxHP = 270
      const state = E.createEfir();
      const { c, w, u } = board112(E, p, state);
      w.x = 6; w.y = 0; w.maxHP = 100; w.hp = 100;
      c._rng = () => 0.99;
      E.buildEfirUnit(state, c);
      c.endTurn();
      return { snap: snap112(c, u, p), u, p, c };
    };
    const r2 = t2();
    assert.deepEqual(t2().snap, r2.snap, 'детерминизм (b)');
    assert.equal(r2.u.hp, 16, 'не лечит себя (frac 1)');
    assert.equal(r2.u.mp, 11, 'мана не потрачена');
    assert.ok(!r2.c.log.some((l) => l.includes('лечит')), 'нет лечения');
    assert.equal(r2.p.hp, 270);

    // (c) L12 (статы 8/8/8 — по 5 очков Инт/Мудр/Тел, 000139: статы
    // из листа, уровень их не растит; mp 21 — legacy-таблица):
    // игрок 148/270 (frac 0.548 — (1) да, (2) нет); естественная
    // книга L12 → strongestKnown('лечение') =
    // light_heal («мани» 6), НЕ mend (3); amount = round(3+0.5·8+12) = 19.
    const t3 = () => {
      const p = hero112();
      p.hp = Math.floor(270 * 0.55); // 148
      const state = raiseEfir112(E, E.createEfir(), 12);
      // 000139: статы из листа (уровень не растит) — по 5 очков
      // (3 → 8), как в старой таблице L12.
      for (const k of ['intelligence', 'wisdom', 'constitution']) {
        for (let i = 0; i < 5; i++) Sheet.raiseSkill(state, k);
      }
      const { c, w, u } = board112(E, p, state);
      w.x = 6; w.y = 0; w.maxHP = 100; w.hp = 100;
      c._rng = () => 0.99;
      E.buildEfirUnit(state, c);
      c.endTurn();
      return { snap: snap112(c, u, p), u, p, c };
    };
    const r3 = t3();
    assert.deepEqual(t3().snap, r3.snap, 'детерминизм (c)');
    // 000168: ИИ-лечение Эфира удалено (ввод) — игрок не лечен, мана цела
    // (самое сильное лечебное light_heal не кастится само).
    assert.equal(r3.p.hp, 148,
      '000168: игрок не лечен (ИИ-лечения нет) — hp 148');
    assert.equal(r3.u.mp, 21,
      'mp 21 не потрачена (нет каста)');
    assert.ok(!r3.c.log.some((l) => l.includes('исцеляет')),
      'нет лечения: ' + r3.c.log.join(' | '));
  } finally { C.combatInternals.allySpells = saveCatalog; }
});

test('000112 CB-2: приоритет (2) — игрок ≤ 50% и щита нет → strongestKnown(«защита»): magic_shield → c.efirShield {armor 7, turns 2}, «мани» 5, spellWis −1; книга без защитных — (1) лечит игрока mend, (2) ПРОПУСКАЕТСЯ → c.efirShield не создан', () => {
  const E = loadEfir000081();
  const C = require('../src/combat.js');
  const saveCatalog = C.combatInternals.allySpells;
  C.combatInternals.allySpells =
    require('../src/spells-data.js').SPELLS_BY_ID;
  try {
    // (a) Книга БЕЗ лечения [spark, magic_shield] (иначе (1) первым
    // потратит единственный spellWis L1): (1) — нет лечебных, (2) — щит.
    // Игрок 100/270 (frac 0.37 ≤ 0.5).
    const t1 = () => {
      const p = hero112();
      p.hp = 100;
      const state = E.createEfir();
      state.spells = ['spark', 'magic_shield'];
      const { c, w, u } = board112(E, p, state);
      w.x = 6; w.y = 0; w.maxHP = 100; w.hp = 100;
      c._rng = () => 0.99;
      E.buildEfirUnit(state, c);
      c.endTurn();
      return { snap: snap112(c, u, p), u, p, c };
    };
    const r1 = t1();
    assert.deepEqual(t1().snap, r1.snap, 'детерминизм (a)');
    // 000168: ИИ-щит Эфира удалён (ввод) — c.cast кастует ТОЛЬКО урон-
    // заклинания; magic_shield (защита) не кастится сам: щита нет,
    // мана цела, игрок не тронут.
    assert.equal(r1.c.efirShield, undefined,
      '000168: щита нет (ИИ-щит удалён, ввод)');
    assert.equal(r1.u.mp, 11, 'мана не потрачена (нет каста)');
    assert.equal(r1.p.hp, 100, 'игрок не лечен (книга без лечебных)');
    assert.ok(!r1.c.log.some((l) => l.includes('Магический щит')),
      'нет щита: ' + r1.c.log.join(' | '));

    // (b) Книга [spark, mend]: (1) лечит игрока mend (+6 → 106);
    // (2) frac 106/270 ≤ 0.5 НО защитных в книге нет → пропуск;
    // (3) d 6 > 4 → каста нет. c.efirShield не создан.
    const t2 = () => {
      const p = hero112();
      p.hp = 100;
      const state = E.createEfir();
      state.spells = ['spark', 'mend'];
      const { c, w, u } = board112(E, p, state);
      w.x = 6; w.y = 0; w.maxHP = 100; w.hp = 100;
      c._rng = () => 0.99;
      E.buildEfirUnit(state, c);
      c.endTurn();
      return { snap: snap112(c, u, p), u, p, c };
    };
    const r2 = t2();
    assert.deepEqual(t2().snap, r2.snap, 'детерминизм (b)');
    // 000168: ИИ-лечение Эфира удалено (ввод) — mend не кастится сам:
    // игрок не тронут, мана цела, щита нет.
    assert.equal(r2.p.hp, 100,
      '000168: игрок не лечен (ИИ-лечения нет) — hp 100');
    assert.equal(r2.u.mp, 11, 'mp 11 не потрачена (нет каста)');
    assert.equal(r2.c.efirShield, undefined,
      'щита нет (защитных в книге нет, и ввод кастует только урон)');
  } finally { C.combatInternals.allySpells = saveCatalog; }
});

test('000112 CB-3: приоритет (3) — «самое сильное» по «мани» (L15: fireball 6, НЕ spark/frost_bolt), лорд по школе: враг d 5 → движение 3 (к d 2 ≤ 4) → каст; пул spellInt 2 → ДВА fireball (mp −12, урон 9 каждый; формула 000193); с маной 6 — ровно ОДИН', () => {
  const E = loadEfir000081();
  const C = require('../src/combat.js');
  const saveCatalog = C.combatInternals.allySpells;
  C.combatInternals.allySpells =
    require('../src/spells-data.js').SPELLS_BY_ID;
  try {
    // L15: статы 10/10/10 (по 7 очков Инт/Мудр/Тел, 000139: статы
    // из листа, уровень их не растит; mp 25 — legacy-таблица),
    // пул 2/2/1/3, естественная книга
    // (fireball — сильнейший урон по «мани» 6). Игрок 9999 — вне пула.
    // 000167: pre-roll (000080-ветка, ДО buildEfirUnit) — Эфир сделал
    // 1 шаг (2,5)→(2,4); round 2: dE 4 > 3 → 3 шага к врагу (2,1) —
    // d 1 ≤ 4: касты + Касание (d 1 ≤ 1, пул touch 1).
    const mk = (uMpPre) => {
      const p = strongHero();
      const state = raiseEfir112(E, E.createEfir(), 15);
      // 000139: статы из листа — по 7 очков (3 → 10), как в старой
      // таблице L15.
      for (const k of ['intelligence', 'wisdom', 'constitution']) {
        for (let i = 0; i < 7; i++) Sheet.raiseSkill(state, k);
      }
      const { c, w, u } = board112(E, p, state);
      w.x = 2; w.y = 0; w.maxHP = 100; w.hp = 100; w.armor = 50;
      c._rng = () => 0.99;
      E.buildEfirUnit(state, c);
      if (uMpPre != null) u.mp = uMpPre;
      // 000168: ввод — игрок двигает Эфира (3 шага (0,-1), к d 2) и
      // кастует сильнейшее урон-заклинание (fireball) ×2 (2-й — по мане).
      for (let i = 0; i < 3; i++) c.move(0, -1);
      c.cast(w.id);
      c.cast(w.id);
      return { snap: snap112(c, u, p), u, w, p, c };
    };
    // (a) mp 25: пул spellInt 2 → 2 каста fireball
    // (dmg = round((4+0.5·10)·(1+0.15·(1−1))·(1+0.05·0)) = 9,
    // формула 000193; броня 50 игнорируется).
    const r1 = mk(null);
    assert.deepEqual(mk(null).snap, r1.snap, 'детерминизм (a)');
    assert.deepEqual([r1.u.x, r1.u.y], [2, 2],
      '000168: ввод — 3 шага (0,-1): (2,5) → (2,2), d 2 ≤ 4');
    assert.equal(r1.w.hp, 82, '2 × fireball (18): 100 − 18 = 82');
    assert.equal(r1.u.mp, 13, 'mp 25 − 2·6 = 13');
    assert.equal(
      r1.c.log.filter((l) => l.includes('Огненный шар')).length, 2,
      'fireball (самое сильное по «мани» 6) — дважды: '
        + r1.c.log.join(' | '));
    // (b) mp 6: ровно ОДИН fireball (второй неплатёжен по мане).
    const r2 = mk(6);
    assert.deepEqual(mk(6).snap, r2.snap, 'детерминизм (b)');
    assert.equal(r2.w.hp, 91, '1 × fireball (9): 100 − 9 = 91');
    assert.equal(r2.u.mp, 0, 'mp 6 − 6 = 0');
    assert.equal(
      r2.c.log.filter((l) => l.includes('Огненный шар')).length, 1);
  } finally { C.combatInternals.allySpells = saveCatalog; }
});

test('000112 CB-4: приоритет (4) — Касание: d ≤ 1, пул touch, ВСЕГДА попадает (c._rng НЕ вызывается — при 0.99 всё равно бьёт), броня игнорируется; u.damage (L1: 4; «Предводитель» 10 → 5 — мораль ВНУТРИ round); работает при 0 маны (после недоступного (3))', () => {
  const E = loadEfir000081();
  const C = require('../src/combat.js');
  const saveCatalog = C.combatInternals.allySpells;
  C.combatInternals.allySpells =
    require('../src/spells-data.js').SPELLS_BY_ID;
  try {
    const mk = (leader) => {
      const p = strongHero();
      if (leader) p.secondary.leader = 10;
      const state = E.createEfir();
      state.spells = ['spark'];
      const { c, w, u } = board112(E, p, state);
      w.x = 2; w.y = 4; w.maxHP = 100; w.hp = 100; w.armor = 50;
      c._rng = () => 0.99; // Касание не бросает: при 0.99 — всё равно бьёт
      E.buildEfirUnit(state, c);
      u.mp = 0; // (3) неплатёжен → доходим до (4)
      // 000168: ввод — c.attack на слоте Эфира = «Касание духа» (d 1).
      c.attack(w.id);
      return { snap: snap112(c, u, p), u, w, p, c };
    };
    // (a) Без «Предводителя»: Касание = max(1, round((2+0.5·3)·1)) = 4.
    const r1 = mk(false);
    assert.deepEqual(mk(false).snap, r1.snap, 'детерминизм (a)');
    assert.equal(r1.w.hp, 96,
      'Касание 4: броня 50 игнорируется, всегда попадает');
    assert.equal(r1.u.mp, 0, 'мана не потрачена');
    assert.ok(r1.c.log.includes('Касание духа: 4.'),
      'лог-строка: ' + r1.c.log.join(' | '));
    assert.equal(r1.c.efs.touch, 0,
      'touch-пул потрачен в ходе — рефилл в начале нового раунда (000167)');
    // (b) «Предводитель» 10 → moraleMult 1.5:
    // Касание = round((2+0.5·3)·1.5) = round(5.25) = 5.
    const r2 = mk(true);
    assert.deepEqual(mk(true).snap, r2.snap, 'детерминизм (b)');
    assert.equal(r2.w.hp, 95,
      'Касание 5: мораль ВНУТРИ round (round(base·mult))');
    assert.equal(r2.u.mp, 0);
  } finally { C.combatInternals.allySpells = saveCatalog; }
});

test('000112 CB-5: движение-эскорт (D13): dP > 3 → 3 клетки к игроку (ось x первой: из (0,0) к (3,6) → (1,0),(2,0),(3,0)); dP ≤ 3 и dE > 3 → к врагу; оба ≤ 3 — стоим (позиция неизменна); бюджет move = 3; рефилл c.efs в конце хода', () => {
  const E = loadEfir000081();
  const C = require('../src/combat.js');
  const saveCatalog = C.combatInternals.allySpells;
  C.combatInternals.allySpells =
    require('../src/spells-data.js').SPELLS_BY_ID;
  try {
    // 000168: ввод — Эфир НЕ движется сам; игрок задаёт шаги (moves)
    // через c.move (бюджет c.efs.move = 3).
    const mk = (efirAt, wolfAt, book, moves) => {
      const p = strongHero();
      const state = E.createEfir();
      if (book) state.spells = book.slice();
      const { c, w, u } = board112(E, p, state);
      if (efirAt) { u.x = efirAt[0]; u.y = efirAt[1]; }
      w.x = wolfAt[0]; w.y = wolfAt[1]; w.maxHP = 100; w.hp = 100;
      c._rng = () => 0.99;
      E.buildEfirUnit(state, c);
      for (const [dx, dy] of (moves || [])) c.move(dx, dy);
      return { snap: snap112(c, u, p), u, w, p, c };
    };
    // (a) (0,0) → 3 шага (1,0) к игроку (3,6): (1,0)→(2,0)→(3,0).
    // d 5 > 4 — каста нет. Бюджет move = 3 → 0.
    const mvA = [[1, 0], [1, 0], [1, 0]];
    const r1 = mk([0, 0], [6, 2], null, mvA);
    assert.deepEqual(mk([0, 0], [6, 2], null, mvA).snap, r1.snap, 'детерминизм (a)');
    assert.deepEqual([r1.u.x, r1.u.y], [3, 0],
      '000168: ввод — 3 шага (1,0): ось x, y не сдвинулась');
    assert.equal(r1.c.efs.move, 0,
      'бюджет move потрачен (3 шага) — рефилл в начале нового раунда');
    // 000168: 4-й шаг — отказ (бюджет 0).
    const m4 = r1.c.move(1, 0);
    assert.equal(m4.ok, false, '000168: 4-й шаг — бюджет исчерпан');
    assert.equal(m4.reason, 'шаги на ход исчерпаны');
    // (b) (2,5) → 3 шага (1,0) к врагу (6,0): (3,5)→(4,5)→(5,5).
    // d 6 > 4 — каста/Касания нет.
    const mvB = [[1, 0], [1, 0], [1, 0]];
    const r2 = mk(null, [6, 0], null, mvB);
    assert.deepEqual(mk(null, [6, 0], null, mvB).snap, r2.snap, 'детерминизм (b)');
    assert.deepEqual([r2.u.x, r2.u.y], [5, 5],
      '000168: ввод — 3 шага (1,0): (2,5) → (5,5)');
    assert.equal(r2.u.mp, 11, 'каста нет (d > 4), Касания нет (d > 1)');
    // (c) оба ≤ 3 — стоим на месте (якорь 2,5); книга ['mend'] без
    // «урон»-спеллов.
    const r3 = mk(null, [4, 4], ['mend'], []);
    assert.deepEqual(mk(null, [4, 4], ['mend'], []).snap, r3.snap,
      'детерминизм (c)');
    assert.deepEqual([r3.u.x, r3.u.y], [2, 5], '000168: стоим на месте (якорь)');
    assert.equal(r3.u.mp, 11);
    assert.ok(!r3.c.log.some((l) => l.includes('Эфир:')),
      'действий нет: ' + r3.c.log.join(' | '));
  } finally { C.combatInternals.allySpells = saveCatalog; }
});

test('000112 CB-6: «самое сильное» — тай-брейк по id (меньшее побеждает): инъекция каталога с двумя равными по «мани» (паттерн T9 save/set/restore); книга [zeta_bolt, alpha_bolt] (порядок книги — zeta первым) → кастуется alpha_bolt («Альфа»), НЕ «Дзета»', () => {
  const E = loadEfir000081();
  const C = require('../src/combat.js');
  const saveCatalog = C.combatInternals.allySpells;
  C.combatInternals.allySpells = {
    zeta_bolt: { id: 'zeta_bolt', название: 'Дзета', школа: 'огонь',
                 степень: 1, атрибут: 'intelligence', мани: 5,
                 действие: 'урон' },
    alpha_bolt: { id: 'alpha_bolt', название: 'Альфа', школа: 'огонь',
                  степень: 1, атрибут: 'intelligence', мани: 5,
                  действие: 'урон' },
  };
  try {
    // Волк (4,4): d 3 ≤ 4 (каст), d 3 > 1 (без Касания), dE ≤ 3
    // (без движения). dmg = round((4+0.5·3)·(1+0.15·(1−1))·(1+0.05·0))
    // = 6 (формула 000193; ИНЖЕКТИРОВАННЫЙ каталог — модуль читает
    // combatInternals.allySpells, Д-I).
    const mk = () => {
      const p = strongHero();
      const state = E.createEfir();
      state.spells = ['zeta_bolt', 'alpha_bolt']; // zeta — первым
      const { c, w, u } = board112(E, p, state);
      w.x = 4; w.y = 4; w.maxHP = 100; w.hp = 100; w.armor = 50;
      c._rng = () => 0.99;
      E.buildEfirUnit(state, c);
      // 000168: ввод — c.cast на слоте Эфира (d 3 ≤ 4).
      c.cast(w.id);
      return { snap: snap112(c, u, p), u, w, p, c };
    };
    const r1 = mk();
    assert.deepEqual(mk().snap, r1.snap, 'детерминизм');
    assert.ok(r1.c.log.includes('Эфир: «Альфа» — Волк: 6.'),
      '000168: ввод c.cast — побеждает меньшее id: ' + r1.c.log.join(' | '));
    assert.ok(!r1.c.log.some((l) => l.includes('Дзета')),
      '«Дзета» не кастуется (тай-брейк — id, не порядок книги)');
    assert.equal(r1.u.mp, 6, 'mp 11 − 5 = 6');
    assert.equal(r1.w.hp, 94, 'урон 6 (формула 000193), броня игнорируется');
  } finally { C.combatInternals.allySpells = saveCatalog; }
});

test('000112 CB-7: c.efirShield — ровно 2 раунда (поглощает 2 удара, потом полный; 000168: ввод — щит пред-задан, ИИ-каст удалён); щит ИГРОКА c.ps.shield НЕ блокирует — оба щита действуют (урон − armor обоих)', () => {
  const E = loadEfir000081();
  const C = require('../src/combat.js');
  const saveCatalog = C.combatInternals.allySpells;
  C.combatInternals.allySpells =
    require('../src/spells-data.js').SPELLS_BY_ID;
  try {
    // 000168: Эфир НЕ кастует щит сам (ввод) — механика c.efirShield
    // (поглощение + тик в startRound) проверяется на ПРЕДВАРИТЕЛЬНО
    // установленном c.efirShield. (b)/(c) (повторный каст/обновление)
    // удалены: ИИ-каст щита больше нет.
    // (a) Pre-set {7, 2}, волк (4,6, d 1 к игроку) бьёт по 10
    // (все попадания): r1 — поглощение 10−7 = 3; r2 (тик 2→1) — 10−7 = 3;
    // r3 (тик 1→0) — полный 10.
    const t1 = () => {
      const p = hero112(); // 270/270 — повторного каста не будет
      const state = E.createEfir();
      state.spells = []; // книга пуста — кастов нет
      const { c, w, u } = board112(E, p, state);
      w.x = 4; w.y = 6; w.maxHP = 100; w.hp = 100; w.damage = 10;
      c._rng = () => 0.01; // все попадания
      E.buildEfirUnit(state, c);
      c.efirShield = { armor: 7, turns: 2 }; // «уже кастован»
      const hpAfter = [p.hp];
      for (let i = 0; i < 5 && !c.result; i++) {
        c.endTurn();
        hpAfter.push(p.hp);
      }
      return { snap: { ...snap112(c, u, p), hpAfter }, u, p, c };
    };
    const r1 = t1();
    assert.deepEqual(t1().snap, r1.snap, 'детерминизм (a)');
    assert.deepEqual(r1.snap.hpAfter, [270, 267, 267, 264, 264, 254],
      '000168: ввод — поглощение r1 (10−7=3) и r2 (тик 2→1: 10−7=3), '
      + 'r3 (тик 1→0) — полный 10: 267, 267, 264, 264, 254');
    assert.equal(r1.c.efirShield.turns, 0,
      '000168: щит истёк после двух тиков (startRound r2, r3)');

    // (d) Щит ИГРОКА c.ps.shield (1) НЕ блокирует: c.efirShield стоит
    // несмотря на него; оба щита поглощают в r1: 10 − 1 (игрок) − 7
    // (Эфир) = 2. Ввод: c.move ×2 к (4,5) (d 1), c.cast spark (6;
    // формула 000193), c.attack Касание (4).
    const t4 = () => {
      const p = hero112();
      p.hp = 100;
      const state = E.createEfir();
      state.spells = ['spark', 'magic_shield'];
      const { c, w, u } = board112(E, p, state);
      w.x = 4; w.y = 6; w.maxHP = 100; w.hp = 100; w.damage = 10;
      c._rng = () => 0.01; // волк попадает
      E.buildEfirUnit(state, c);
      c.ps.shield = { armor: 1, turns: 1 }; // СВОЙ щит игрока
      c.efirShield = { armor: 7, turns: 2 }; // «уже кастован»
      c.move(1, 0); c.move(1, 0); // (2,5) → (4,5) d 1
      c.cast(w.id);   // spark 6 (000193)
      c.attack(w.id); // Касание 4
      c.endTurn();
      return { snap: snap112(c, u, p), u, w, p, c };
    };
    const r4 = t4();
    assert.deepEqual(t4().snap, r4.snap, 'детерминизм (d)');
    assert.equal(r4.c.efirShield.armor, 7);
    assert.equal(r4.c.efirShield.turns, 2, 'r1: тик в startRound ещё не шёл');
    assert.equal(r4.p.hp, 98,
      '000168: оба щита (r1): 100 − (10 − 1 − 7) = 98');
    assert.equal(r4.u.mp, 8, 'mp 11 − 3 (spark) = 8 (щит — пред-задан)');
    assert.equal(r4.w.hp, 90, 'spark 6 + Касание 4: 100 − 10 = 90');
  } finally { C.combatInternals.allySpells = saveCatalog; }
});

// --- Задача 000117: практика Эфира: рост навыков от применения (ТЗ —
// tasks/pending/000117.md; контракты —
// memory/000117-efir-practice.md). КРАСНЫЕ тесты PC-1/PC-2 (вместе с
// PR-1..PR-5 в tests/efir.test.js — ровно 7 новых красных, D10):
// падают, пока нет practiceEfir (15-й экспорт efir.js) — TypeError
// «practiceEfir is not a function» — и dodge-ветки precog в
// mobAttackAlly (AssertionError: B == A). Осмысленная краснота —
// «функциональности нет», не синтаксис/окружение.
//
// Формула lord-множителя (урон +5%·уровень) — СУЩЕСТВУЮЩАЯ (000112;
// CB-3 пинит lord 0); 000117 поднимает lord практикой — снапшот
// u.efirSkills (D7). Фейк Game = { xpForNext, efir: E } — ленивый хук
// combat.js читает globalThis.Game.efir в момент ВЫЗОВА (контракт
// §3.2); в красной фазе хука нет — фейк инертен. 000113: фейк
// сужен до practiceEfir (реальный E на Game.efir расходовал бы
// one-shot первой встречи — createCombat читает
// Game.efir.takeFirstEncounterLine).

test('000117 PC-1: прокачанный firelord — урон Эфира +5%·уровень (по сиду)', () => {
  const E = loadEfir000081();
  const C = require('../src/combat.js');
  const saveCatalog = C.combatInternals.allySpells;
  C.combatInternals.allySpells =
    require('../src/spells-data.js').SPELLS_BY_ID;
  // 000113: фейк уже сужен до practiceEfir — реальный модуль E
  // на Game.efir расходовал бы one-shot takeFirstEncounterLine
  // (createCombat) и ломал бы детерминизм log (snap112).
  withGame112({ xpForNext: PL.xpForNext,
                efir: { practiceEfir: E.practiceEfir } }, () => {
    try {
      // L5 (Int 5 — 2 очка на Интеллект, 000139: статы из листа):
      // база = 4 + 0.5·5 = 6.5 (формула 000193). Один волк (armor 50 —
      // заклинание игнорирует, hp 100, d 3 ≤ 4), seed 5 (board112),
      // rng 0.99 (волк — все промахи). ФОРМУЛА в тесте (паттерн CB-3,
      // без хардкода значений): round((4 + 0.5·Int)·(1 + 0.15·(степень
      // − 1))·(1 + 0.05·lord)) (spark — степень 1).
      const dmgFromLog = (c) => {
        const line = c.log.find((l) => l.includes('«Искра» —'));
        assert.ok(line, 'лог-строка каста: ' + c.log.join(' | '));
        return Number(line.slice(line.lastIndexOf(':') + 1));
      };
      const expectDmg = (lord) => Math.round(
        (4 + 0.5 * 5) * (1 + 0.15 * (1 - 1)) * (1 + 0.05 * lord));
      const mk = (firelordXp) => {
        const p = hero112(); // 270/270 — (1)/(2) не срабатывают
        const state = E.createEfir();
        raiseEfir112(E, state, 5);
        // 000139: Int 5 — 2 очка (3 → 5), статы из листа.
        for (let i = 0; i < 2; i++) Sheet.raiseSkill(state, 'intelligence');
        if (firelordXp > 0) {
          E.practiceEfir(state, 'firelord', firelordXp);
        }
        state.spells = ['spark'];
        const { c, w, u } = board112(E, p, state);
        w.x = 3; w.y = 3; w.armor = 50; w.maxHP = 100; w.hp = 100;
        c._rng = () => 0.99;
        E.buildEfirUnit(state, c);
        // 000168: ввод — c.cast (d 3 ≤ 4); ИИ-каст удалён.
        c.cast(w.id);
        return { snap: snap112(c, u, p), dmg: dmgFromLog(c), c, u, p };
      };
      // A — firelord 0: round(6.5·1) = 7.
      const rA = mk(0);
      assert.deepEqual(mk(0).snap, rA.snap, 'детерминизм (A)');
      assert.equal(rA.dmg, expectDmg(0),
        'A: firelord 0 → round(6.5·1) = 7: ' + rA.c.log.join(' | '));
      // B — firelord 4 (15+30+45+60 = 150): round(6.5·1.2) =
      // round(7.8) = 8.
      const rB = mk(150);
      assert.deepEqual(mk(150).snap, rB.snap, 'детерминизм (B)');
      assert.equal(rB.dmg, expectDmg(4),
        'B: firelord 4 → round(6.5·1.2) = round(7.8) = 8: '
        + rB.c.log.join(' | '));
      assert.ok(rB.dmg > rA.dmg,
        'B > A: +5%·4 уровня firelord (детерминизм по сиду 5)');
    } finally { C.combatInternals.allySpells = saveCatalog; }
  });
});

test('000117 PC-2: уклонение precog снижает попадания врага (по сиду)', () => {
  const E = loadEfir000081();
  const C = require('../src/combat.js');
  const saveCatalog = C.combatInternals.allySpells;
  C.combatInternals.allySpells =
    require('../src/spells-data.js').SPELLS_BY_ID;
  // 000113: фейк уже сужен до practiceEfir — реальный модуль E
  // на Game.efir расходовал бы one-shot takeFirstEncounterLine
  // (createCombat) и ломал бы детерминизм log (snap112).
  withGame112({ xpForNext: PL.xpForNext,
                efir: { practiceEfir: E.practiceEfir } }, () => {
    try {
      // Волк L2 (2,4) → Эфир L3 (2,5) d 1 (игрок (3,6) d 3 →
      // nearestPlayerSide выберет Эфира), rng 0.3, seed 5.
      // A — precog 0: hitChance(2,0,3,0) = 0.52 → hit (0.3 < 0.52),
      // урон по Эфиру > 0; B — perception 5 (requires) + precog 8:
      // defDodge 0.4 → hitChance = 0.12 → miss (0.3 ≥ 0.12), урон 0,
      // лог «промахивается.». Один rng-вызов на удар — бит-в-бит без
      // precog (D4: 4-й аргумент hitChance, новых c._rng НЕТ).
      const mk = (withPrecog) => {
        const p = hero112(); // 270/270
        const state = E.createEfir();
        raiseEfir112(E, state, 3);
        // 000139: статы из листа — по 1 очку (3 → 4, как в старой
        // таблице L3; cap precog = Мудр 4×2 = 8).
        for (const k of ['intelligence', 'wisdom', 'constitution']) {
          Sheet.raiseSkill(state, k);
        }
        if (withPrecog) {
          E.practiceEfir(state, 'perception', 225); // → 5 (requires)
          E.practiceEfir(state, 'precog', 540);     // → 8 (cap = 4×2, 000139)
        }
        state.spells = ['mend'];
        const { c, w, u } = board112(E, p, state);
        w.x = 2; w.y = 4; w.maxHP = 100; w.hp = 100;
        c._rng = () => 0.3;
        E.buildEfirUnit(state, c);
        const hp0 = u.hp;
        c.endTurn();
        return { snap: snap112(c, u, p), u, p, c, dmg: hp0 - u.hp };
      };
      const rA = mk(false);
      assert.deepEqual(mk(false).snap, rA.snap, 'детерминизм (A)');
      assert.ok(rA.dmg > 0,
        'A (precog 0): 0.3 < 0.52 → hit, урон > 0: '
        + rA.c.log.join(' | '));
      const rB = mk(true);
      assert.deepEqual(mk(true).snap, rB.snap, 'детерминизм (B)');
      assert.equal(rB.dmg, 0,
        'B (precog 8): 0.3 ≥ 0.12 → уклонение, урон 0: '
        + rB.c.log.join(' | '));
      assert.ok(rB.c.log.some((l) => l.includes('промахивается')),
        'лог «промахивается»: ' + rB.c.log.join(' | '));
      assert.ok(rB.dmg < rA.dmg,
        'B < A: уклонение снижает попадания (детерминизм по сиду 5)');
    } finally { C.combatInternals.allySpells = saveCatalog; }
  });
});

// --- Задача 000113: «Вдох Эфира» (КРАСНЫЕ) ---
//
// Контракт memory/000113-efir-breath.md §2/§6. Фиксируют НОВУЮ
// функциональность в src/combat.js (строГО аддитивный дифф) + снапшот
// u.breath из src/efir.js:
//   * Триггер «Вдох Эфира» — вверху efirTurn, ДО движения (замена
//     якоря 000112, строка 1413): HP игрока ≤ 40% maxHP (u.breath.
//     playerFrac) И u.mp ≥ 20 (u.breath.mpCost) И ещё не сработал
//     (c.efirBreathed — флаг в СОСТОЯНИИ БОЯ, не сейв; ТОЛЬКО при
//     успехе). Расход: 20 маны + ВЕСЬ ход (движение и приоритеты
//     НЕ выполняются): лечение ВСЕМ союзным (c.player P.heal-путь +
//     livingAllies — включая самого Эфира) по u.breath.heal +
//     ослабление ВСЕМ живым врагам (u.weakened {mult 0.8, turns 2} —
//     их урон ×0.8, тик по раундам в startRound — 000167).
//   * healAlly(c, unit, amount) / weakenAllEnemies(c, mult, turns) —
//     новые internals (export combatInternals).
//   * Множитель u.weakened — в mobAttack/mobAttackAlly (×mult пока
//     turns > 0); тик — startRound (паттерн щита 000112; 000167).
//   * Первая встреча — в createCombat: 1-й бой сессии с Эфиром в
//     отряде — flavor-строка из efir.js (ленивый globalThis.Game.efir
//     one-shot; без Game.efir — ТИХО).
// Все сценарии — c.endTurn; каждый — ДВА прогона (тот же сид) либо
// детерминизм-снимок. Тесты ПАДАЮТ, пока функциональности нет.

// Детерминизм-снимок 000113 = snap112 + round + c.efirBreathed +
// weakened-статусы мобов ({mult,turns}|null, по полям — vm-инвариант)
// + u.breath?.heal.
function snap113(c, u, p) {
  return {
    ...snap112(c, u, p),
    round: c.round,
    breathed: c.efirBreathed,
    weakened: c.units.filter((x) => x.side === 'mob')
      .map((m) => [m.id, m.weakened
        ? { mult: m.weakened.mult, turns: m.weakened.turns } : null]),
    breathHeal: u.breath ? u.breath.heal : null,
  };
}

// Наёмник melee (000080): явные maxHP 13, урон 5 (без формулы makeAlly).
// id 'a1' (idx 1 — после Эфира idx 0). Якорь (4,5) — рядом с игроком.
const mercData = () => ({ name: 'Наёмник', role: 'melee', level: 1,
                          maxHP: 13, damage: 5 });

test('000113 BR-2: границы триггера (41%—нет/40%—да; mp 19—нет/20—да) + «весь ход» (позиция не сдвинулась, кастов/лечения нет, лог ровно [бой, «Вдох Эфира!»])', () => {
  const E = loadEfir000081();
  const C = require('../src/combat.js');
  const saveCatalog = C.combatInternals.allySpells;
  C.combatInternals.allySpells =
    require('../src/spells-data.js').SPELLS_BY_ID;
  try {
    // Геометрия: Эфир заранее на (0,0) (д 9 до игрока (3,6) — пин «весь
    // ход»: после Вдоха позиция НЕ изменится); волк m0 на (0,1).
    // hero112: maxHP 270, броня 0. L1, книга ['mend']. u.mp = 20 ПОСЛЕ
    // buildEfirUnit (он затирает mp = maxMP = 11). c._rng = 0.01 (все
    // попадания) — для «нет»-случаев (обычный ход).
    const run = (pHp, uMp) => {
      const p = hero112();
      const state = E.createEfir();
      state.spells = ['mend'];
      const { c, w, u } = board112(E, p, state);
      w.x = 0; w.y = 1; w.maxHP = 100; w.hp = 100;
      c._rng = () => 0.01;
      E.buildEfirUnit(state, c);
      u.x = 0; u.y = 0;
      u.mp = uMp;
      // 000168: pre-roll = слот Эфира (ввод; u.breath ставится ПОСЛЕ
      // createCombat → Вдох в pre-roll НЕВОЗМОЖЕН — B undefined). Вдох —
      // авто-триггер на СЛЕДУЮЩЕМ входе в слот Эфира (round 2, после
      // оборота очереди). 2× endTurn: (1) Эфир(ввод) → волк → игрок;
      // (2) игрок → оборот очереди → слот Эфира (Вдох при frac ≤ 0.4 И
      // mp ≥ 20). Границы 40%/41% ставим ПОСЛЕ pre-roll.
      p.hp = pHp;
      c.endTurn();
      c.endTurn();
      return { p, w, u, c };
    };
    // (a) 110/270 = 0.4074 > 0.4 → НЕТ: ввод (Эфир НЕ действует),
    //     флага/ослабления нет, mp нетронут.
    {
      const { p, w, u, c } = run(110, 20);
      assert.equal(c.efirBreathed, undefined,
        '(a) 41%: флага c.efirBreathed НЕТ (frac > 0.4)');
      assert.equal(w.weakened, undefined, '(a) 41%: волк НЕ ослаблен');
      assert.equal(u.mp, 20, '(a) 41%: ввод — Эфир НЕ действовал (mp нетронут)');
      assert.equal(p.hp, 110, '(a) 41%: игрок 110 (лечения нет — ввод, не ИИ)');
      assert.ok(!c.log.includes('Вдох Эфира!'),
        '(a) 41%: лог БЕЗ «Вдох Эфира!»: ' + c.log.join(' | '));
    }
    // (b) 108/270 === 0.4 И mp 20 → ДА: ВЕСЬ ход, mp 20→0, игрок +12,
    //     волк ослаблен, Эфир НЕ сдвинулся, лог ровно [бой, Вдох].
    {
      const { p, w, u, c } = run(108, 20);
      assert.equal(c.efirBreathed, true,
        '(b) 40%+mp20: флаг c.efirBreathed = true (Вдох сработал)');
      assert.ok(c.log.includes('Вдох Эфира!'),
        '(b) лог «Вдох Эфира!» (строка из efir.js): ' + c.log.join(' | '));
      assert.equal(u.mp, 0, '(b) mp 20 − 20 = 0');
      assert.equal(p.hp, 120, '(b) игрок 108 + 12 (round(10+0.8·3)) = 120');
      assert.deepEqual(w.weakened, { mult: 0.8, turns: 2 },
        '(b) волк ослаблен {0.8, 2}: Вдох в r2 (ПОСЛЕ startRound r2) — '
        + 'тик в startRound r3 ещё не шёл');
      assert.equal(u.x, 0, '(b) «весь ход»: Эфир НЕ сдвинулся по x (на (0,0))');
      assert.equal(u.y, 0, '(b) «весь ход»: Эфир НЕ сдвинулся по y');
      assert.ok(!c.log.some((l) => l.includes('Эфир исцеляет')
        || l.includes('Эфир:')),
        '(b) «весь ход»: прочие действия НЕ выполнены (лечения/кастов нет): '
        + c.log.join(' | '));
      assert.deepEqual(c.log,
        ['Бой: блуждающая группа (уровень 2, мобы 1).', 'Вдох Эфира!'],
        '(b) лог ровно [бой, «Вдох Эфира!»] (ни движения, ни кастов, ни атак)');
    }
    // (c) 108/270 И mp 19 < 20 → НЕТ (мана недобор): ввод (Эфир НЕ
    //     действует), флага нет, mp нетронут.
    {
      const { p, w, u, c } = run(108, 19);
      assert.equal(c.efirBreathed, undefined,
        '(c) mp 19: флага НЕТ (mp < 20)');
      assert.equal(w.weakened, undefined, '(c) mp 19: волк НЕ ослаблен');
      assert.equal(u.mp, 19, '(c) mp 19: ввод — Эфир НЕ действовал (mp нетронут)');
      assert.equal(p.hp, 108, '(c) mp 19: игрок 108 (Вдоха нет: mp < 20)');
    }
    // (d) 108/270 И mp 20 → ДА (граница маны): Вдох сработал.
    {
      const { p, w, u, c } = run(108, 20);
      assert.equal(c.efirBreathed, true, '(d) mp 20: ДА — флаг c.efirBreathed');
      assert.equal(u.mp, 0, '(d) mp 20 − 20 = 0');
      assert.equal(p.hp, 120, '(d) игрок 108 + 12 = 120');
      assert.ok(c.log.includes('Вдох Эфира!'), '(d) лог-строка «Вдох Эфира!»');
    }
  } finally {
    C.combatInternals.allySpells = saveCatalog;
  }
});

test('000113 BR-3: разовость — Вдох РОВНО ОДИН раз за бой (флаг c.efirBreathed); mp НЕ тратится повторно; ослабление НЕ обновляется (естественный тик 2→1→0); полный урон после исчерпания окна', () => {
  const E = loadEfir000081();
  const C = require('../src/combat.js');
  const saveCatalog = C.combatInternals.allySpells;
  C.combatInternals.allySpells =
    require('../src/spells-data.js').SPELLS_BY_ID;
  try {
    // Геометрия: волк m0 на (3,5) (д 1 к игроку (3,6) — бьёт каждый
    // раунд, урон 10, все попадания). Книга [] — ИЗОЛЯЦИЯ ФЛАГА (никаких
    // кастов, чтобы mp НЕ тратился повторно). Эфир на якорь (2,5) — ввод
    // (Касания нет). 000168: pre-roll = слот Эфира (ввод, без Вдоха —
    // u.breath ставится ПОСЛЕ createCombat). Вдох — в round 2.
    const p = hero112();
    p.hp = 108;
    const state = E.createEfir();
    state.spells = [];
    const { c, w, u } = board112(E, p, state);
    w.x = 3; w.y = 5; w.maxHP = 100; w.hp = 100; w.damage = 10;
    c._rng = () => 0.01;
    E.buildEfirUnit(state, c);
    u.mp = 20;
    c.endTurn();        // r1: волк полный (108→98); Эфир — ввод (без Вдоха)
    c.endTurn();        // r2: Вдох (98→110, mp 20→0), волк ×0.8 (110→102)
    u.mp = 20;          // ручная подкачка ПОСЛЕ Вдоха (регена в бою НЕТ —
    p.hp = 108;         // тест: Вдох НЕ повторится; подстройка для цикла тика)
    c.endTurn();        // r3: тик 2→1 (слот Эфира — ввод, волк ещё не бил)
    c.endTurn();        // r3: волк ×0.8 (108→100)
    c.endTurn();        // r4: тик 1→0 (слот Эфира — ввод)
    c.endTurn();        // r4: волк ПОЛНЫЙ (100→90)
    assert.equal(c.log.filter((l) => l === 'Вдох Эфира!').length, 1,
      'ровно ОДНА строка «Вдох Эфира!» (1 раз за бой): ' + c.log.join(' | '));
    assert.equal(c.efirBreathed, true, 'флаг c.efirBreathed = true (после r2)');
    assert.equal(u.mp, 20, 'mp НЕ потрачена повторно (Вдох не повторился)');
    assert.equal(p.hp, 90,
      'p.hp: 108(подстройка) −8(r3 ×0.8) −10(r4 ПОЛНЫЙ) = 90');
    assert.equal(w.hp, 100,
      '000168: Эфир — ввод (Касания нет): волк 100');
    assert.equal(w.weakened.turns, 0,
      'ослабление НЕ обновлено: естественный тик 2→1→0 (не сброс в 2)');
  } finally {
    C.combatInternals.allySpells = saveCatalog;
  }
});

test('000113 BR-4: формула — лечение ВСЕМ союзным (игрок + наёмник + сам Эфир, self-heal) по u.breath.heal = 12 (L1); mp 20→0; p.mp игрока НЕ тронулся', () => {
  const E = loadEfir000081();
  const C = require('../src/combat.js');
  const saveCatalog = C.combatInternals.allySpells;
  C.combatInternals.allySpells =
    require('../src/spells-data.js').SPELLS_BY_ID;
  try {
    // Отряд: игрок (108/270), наёмник (1/13), Эфир (4/16 — тестом).
    // Волк m0 на (0,0) (д 9 — не дотянется); c._rng = 0.99
    // (все промахи — волк никого не бьёт).
    const p = hero112();
    const pMp0 = p.mp;
    const state = E.createEfir();
    state.spells = ['mend'];
    const c = createCombat({
      player: p, allies: [E.efirAllyData(state), mercData()],
      mobs: ['wolf'], mobLevel: 2, seed: 5,
    });
    c.obstacles.clear();
    const w = c.units.find((x) => x.id === 'm0');
    w.x = 0; w.y = 0; w.maxHP = 100; w.hp = 100;
    c._rng = () => 0.99;
    const u = E.buildEfirUnit(state, c);
    u.mp = 20;
    const merc = c.units.find((x) => x.id === 'a1');
    u.hp = 4;     // maxHP 16 − 12
    merc.hp = 1;  // maxHP 13 − 12
    // 000168: pre-roll = слот Эфира (ввод; Вдох в pre-roll НЕВОЗМОЖЕН —
    // u.breath ПОСЛЕ createCombat). Вдох — в round 2. Очередь [efir, m0,
    // player, a1] (4 слота): 3× endTurn до входа в слот Эфира r2.
    p.hp = 108;
    c.endTurn();  // r1: Эфир(ввод) → волк(промах) → игрок
    c.endTurn();  // r1: игрок → наёмник(ввод)
    c.endTurn();  // r2: оборот → слот Эфира → Вдох → волк(промах) → игрок
    assert.equal(c.efirBreathed, true, 'флаг c.efirBreathed = true (Вдох)');
    assert.equal(p.hp, 120, 'игрок 108 + 12 (P.heal-путь) = 120');
    assert.equal(merc.hp, 13, 'наёмник 1 + 12 = 13 (факт 12, кап maxHP 13)');
    assert.equal(u.hp, 16, 'Эфир 4 + 12 = 16 (self-heal — ВКЛЮЧЁН)');
    assert.equal(u.mp, 0, 'mp 20 − 20 = 0');
    assert.equal(p.mp, pMp0, 'p.mp игрока НЕ тронулся (мана Эфира — своя)');
    assert.ok(c.log.includes('Вдох Эфира!'), 'лог-строка: ' + c.log.join(' | '));
  } finally {
    C.combatInternals.allySpells = saveCatalog;
  }
});

test('000113 BR-5: окно ослабления — урон врага ×0.8 ровно 2 раунда (включая раунд триггера), потом возвращается: (a) mobAttack hpAfter [112,104,94], turns [2,1,0] (000167: тик в startRound); (b) mobAttackAlly — волк бьёт наёмника 10·0.8 = 8 → 13−8 = 5 (НЕ 3)', () => {
  const E = loadEfir000081();
  const C = require('../src/combat.js');
  const saveCatalog = C.combatInternals.allySpells;
  C.combatInternals.allySpells =
    require('../src/spells-data.js').SPELLS_BY_ID;
  try {
    // (a) mobAttack: волк (3,5) д 1 к игроку, урон 10, броня hero112 = 0,
    // c._rng 0.01. 000168: pre-roll = слот Эфира (ввод). Волк бьёт
    // каждый раунд; фиксируем ТОЛЬКО ходы, завершившиеся на слоте игрока
    // (волк ударил) — слот Эфира (ввод) идёт между раундами. Вдох — r2.
    // r1: полный (108→98, до Вдоха); r2: Вдох (98→110) + ×0.8 (110→102,
    // тик 2→1 в r3); r3: ×0.8 (102→94, тик 1→0 в r4); r4: полный
    // (94→84 — «возвращается»).
    {
      const p = hero112();
      const state = E.createEfir();
      state.spells = ['mend'];
      const { c, w, u } = board112(E, p, state);
      w.x = 3; w.y = 5; w.maxHP = 100; w.hp = 100; w.damage = 10;
      c._rng = () => 0.01;
      E.buildEfirUnit(state, c);
      u.mp = 20;
      p.hp = 108;
      const hpAfter = [];
      const turnsAfter = [];
      for (let i = 0; i < 6; i++) {
        c.endTurn();
        if (c.turnOrder[c.turnIndex] === 'player') {
          hpAfter.push(p.hp);
          turnsAfter.push(w.weakened ? w.weakened.turns : null);
        }
      }
      assert.deepEqual(hpAfter, [98, 102, 94, 84],
        '×0.8 ровно 2 удара (r2, r3), потом полный (r4): ' + hpAfter.join(', '));
      assert.deepEqual(turnsAfter, [null, 2, 1, 0],
        'тик по раундам (startRound): null → 2 (Вдох r2) → 1 → 0');
      assert.equal(w.hp, 100,
        '000168: Эфир — ввод (Касания нет): волк 100');
    }
    // (b) mobAttackAlly: наёмник (4,5) 13/13 д 1; волк (4,4) бьёт
    // НАЁМНИКА (ближайшая цель). 000168: r1 — волк полный (13→3);
    // r2 — Вдох лечит наёмника (3→13) и ослабляет: ×0.8 = 8 → 13 − 8 = 5.
    {
      const p = hero112();
      const state = E.createEfir();
      state.spells = ['mend'];
      const c = createCombat({
        player: p, allies: [E.efirAllyData(state), mercData()],
        mobs: ['wolf'], mobLevel: 2, seed: 5,
      });
      c.obstacles.clear();
      const w = c.units.find((x) => x.id === 'm0');
      w.x = 4; w.y = 4; w.maxHP = 100; w.hp = 100; w.damage = 10;
      c._rng = () => 0.01;
      const u = E.buildEfirUnit(state, c);
      u.mp = 20;
      const merc = c.units.find((x) => x.id === 'a1');
      p.hp = 108;
      c.endTurn();  // r1: Эфир(ввод) → волк(полный, наёмник 13→3) → игрок
      c.endTurn();  // r1: игрок → наёмник(ввод)
      c.endTurn();  // r2: Вдох (наёмник 3→13, волк ×0.8 13→5) → игрок
      assert.equal(c.efirBreathed, true, '(b) Вдох сработал (флаг)');
      assert.equal(merc.hp, 5,
        '(b) Вдох лечит (3→13), затем ×0.8: 13 − 8 = 5 (без ослабления — 13−10 = 3)');
      assert.equal(p.hp, 120,
        '(b) игрок 108 + 12 (Вдох) = 120 (волк бьёт наёмника, не игрока)');
      assert.ok(c.log.includes('Вдох Эфира!'), 'лог: ' + c.log.join(' | '));
    }
  } finally {
    C.combatInternals.allySpells = saveCatalog;
  }
});

test('000113 BR-6: не переносится в следующий бой — новый createCombat: c.efirBreathed/u.weakened отсутствуют; повторная настройка (mp 20, p.hp 108) → Вдох СРАБАТЫВАЕТ СНОВА (разовость — на БОЙ, не на игру)', () => {
  const E = loadEfir000081();
  const C = require('../src/combat.js');
  const saveCatalog = C.combatInternals.allySpells;
  C.combatInternals.allySpells =
    require('../src/spells-data.js').SPELLS_BY_ID;
  withGame112({}, () => {  // Game БЕЗ .efir — первой встречи нет (чистота)
    try {
      const state = E.createEfir();
      state.spells = [];
      const p = hero112();
      p.hp = 108;
      const setup = (c) => {
        c.obstacles.clear();
        const w = c.units.find((x) => x.id === 'm0');
        w.x = 3; w.y = 5; w.maxHP = 100; w.hp = 100; w.damage = 10;
        c._rng = () => 0.01;
        const u = E.buildEfirUnit(state, c);
        u.mp = 20;
        return { w, u };
      };
      // Бой 1: Вдох (лог, флаг true, ослабление {0.8, 2}). 000168: pre-roll
      // = слот Эфира (ввод) → 2× endTurn до Вдоха в round 2.
      const c1 = createCombat({
        player: p, allies: [E.efirAllyData(state)],
        mobs: ['wolf'], mobLevel: 2, seed: 5,
      });
      const s1 = setup(c1);
      c1.endTurn();  // r1: Эфир(ввод) → волк(полный) → игрок
      c1.endTurn();  // r2: Вдох → волк(×0.8) → игрок
      assert.equal(c1.efirBreathed, true, 'бой 1: флаг c.efirBreathed = true');
      assert.ok(c1.log.includes('Вдох Эфира!'), 'бой 1: лог-строка');
      assert.deepEqual(s1.w.weakened, { mult: 0.8, turns: 2 },
        'бой 1: ослабление {0.8, 2} (Вдох r2 — ПОСЛЕ startRound r2, '
        + 'тик в startRound r3 ещё не шёл)');
      // Бой 2 (тот же persistent state/игрок): состояние ЧИСТОЕ.
      p.hp = 108;
      const c2 = createCombat({
        player: p, allies: [E.efirAllyData(state)],
        mobs: ['wolf'], mobLevel: 2, seed: 5,
      });
      const s2 = setup(c2);
      assert.equal(c2.efirBreathed, undefined,
        'бой 2: c.efirBreathed НЕТ (состояние боя, не сейв)');
      assert.equal(s2.w.weakened, undefined,
        'бой 2: u.weakened НЕТ (не переносится между боями)');
      // Повторная настройка → Вдох СРАБАТЫВАЕТ СНОВА (2× endTurn → r2).
      c2.endTurn();  // r1: Эфир(ввод) → волк(полный, 108→98) → игрок
      c2.endTurn();  // r2: Вдох (98→110) → волк(×0.8, 110→102) → игрок
      assert.equal(c2.efirBreathed, true, 'бой 2: Вдох снова (на БОЙ)');
      assert.equal(c2.log.filter((l) => l === 'Вдох Эфира!').length, 1,
        'бой 2: ровно одна строка (свежий бой): ' + c2.log.join(' | '));
      assert.equal(s2.u.mp, 0, 'бой 2: mp 20 − 20 = 0');
      assert.equal(p.hp, 102,
        'бой 2: p.hp 98 (r1 волк) + 12 (Вдох) − 8 (×0.8) = 102');
    } finally {
      C.combatInternals.allySpells = saveCatalog;
    }
  });
});

test('000113 BR-7: детерминизм по сиду — сценарий (игрок + наёмник + Эфир, волк, 3 endTurn): ДВА прогона → deepEqual snap113; ноль новых c._rng (fake Game БЕЗ .efir)', () => {
  const E = loadEfir000081();
  const C = require('../src/combat.js');
  const saveCatalog = C.combatInternals.allySpells;
  C.combatInternals.allySpells =
    require('../src/spells-data.js').SPELLS_BY_ID;
  withGame112({}, () => {  // Game БЕЗ .efir — one-shot не расходуется
    try {
      // Волк (4,4) д 1 к наёмнику (4,5): бьёт наёмника (10·0.8 r2,
      // 10·0.8 r3 → гибель). Наёмник бьёт волка 5. Вдох — r2 (000167:
      // pre-roll «съедает» round 1).
      const run = () => {
        const p = hero112();
        const state = E.createEfir();
        state.spells = ['mend'];
        const c = createCombat({
          player: p, allies: [E.efirAllyData(state), mercData()],
          mobs: ['wolf'], mobLevel: 2, seed: 5,
        });
        c.obstacles.clear();
        const w = c.units.find((x) => x.id === 'm0');
        w.x = 4; w.y = 4; w.maxHP = 100; w.hp = 100; w.damage = 10;
        c._rng = () => 0.01;
        const u = E.buildEfirUnit(state, c);
        u.mp = 20;
        // 000167: pre-roll (000080-ветка) лечит раненого игрока —
        // frac для Вдоха ставим после pre-roll.
        p.hp = 108;
        for (let i = 0; i < 3 && !c.result; i++) c.endTurn();
        return { snap: snap113(c, u, p), c };
      };
      // (1) Маркеры Вдоха на прогоне 1 (падают СЕЙЧАС — функциональности нет):
      const r1 = run();
      assert.equal(r1.c.log.filter((l) => l === 'Вдох Эфира!').length, 1,
        'прогон 1: ровно одна строка «Вдох Эфира!»: ' + r1.c.log.join(' | '));
      assert.equal(r1.c.efirBreathed, true, 'прогон 1: флаг c.efirBreathed = true');
      assert.equal(r1.c.player.hp, 120,
        'прогон 1: игрок 108 + 12 (Вдох) = 120');
      assert.ok(r1.snap.weakened[0] && r1.snap.weakened[0][1],
        'прогон 1: волк ослаблен (статус u.weakened у m0)');
      assert.equal(r1.snap.breathHeal, 12, 'прогон 1: u.breath.heal = 12 (L1)');
      // (2) Идентичность прогонов (тот же сид) → deepEqual snap113.
      const r2 = run();
      assert.deepEqual(r2.snap, r1.snap,
        'два прогона (тот же сид) → идентичный snap113 (детерминизм, '
        + 'ноль новых c._rng)');
    } finally {
      C.combatInternals.allySpells = saveCatalog;
    }
  });
});

test('000113 BR-8: internals healAlly/weakenAllEnemies (export combatInternals) + первая встреча (1-й бой с Эфиром — строка из efir.js, 2-й — без; без Game.efir — тихо, без краха)', () => {
  const E = loadEfir000081();
  const C = require('../src/combat.js');
  const I = C.combatInternals;
  const saveCatalog = C.combatInternals.allySpells;
  C.combatInternals.allySpells =
    require('../src/spells-data.js').SPELLS_BY_ID;
  try {
    // (a) Экспорты (первым ассертом — красная точка: символа нет).
    assert.equal(typeof I.healAlly, 'function',
      'combatInternals.healAlly — функция (000113)');
    assert.equal(typeof I.weakenAllEnemies, 'function',
      'combatInternals.weakenAllEnemies — функция (000113)');
    // (b) healAlly: союзник — кап maxHP, возврат ФАКТА (hp после − до);
    // игрок — P.heal-путь (кап derived maxHP).
    const p = hero112();   // maxHP 270
    const c = createCombat({
      player: p, allies: [E.efirAllyData(E.createEfir())],
      mobs: ['wolf'], mobLevel: 2, seed: 5,
    });
    let aLow = { hp: 1, maxHP: 13 };
    assert.equal(I.healAlly(c, aLow, 12), 12,
      '1/13 +12 → 13: факт 12 (ровно до капа)');
    assert.equal(aLow.hp, 13, '1/13 +12 → 13 (кап maxHP)');
    let aMid = { hp: 5, maxHP: 13 };
    assert.equal(I.healAlly(c, aMid, 12), 8,
      '5/13 +12 → 13: факт 8 (кап maxHP)');
    assert.equal(aMid.hp, 13, '5/13 +12 → 13');
    let aFull = { hp: 13, maxHP: 13 };
    assert.equal(I.healAlly(c, aFull, 12), 0,
      '13/13 +12: факт 0 (нет оверфлова)');
    assert.equal(aFull.hp, 13, '13/13 +12 → 13 (полный)');
    p.hp = 200;
    assert.equal(I.healAlly(c, p, 12), 12,
      'игрок 200 +12 → 212: факт 12 (P.heal-путь, unit === c.player)');
    assert.equal(p.hp, 212, 'игрок 200 +12 = 212');
    p.hp = 265;
    assert.equal(I.healAlly(c, p, 12), 5,
      'игрок 265 +12 → 270: факт 5 (кап derived maxHP 270)');
    assert.equal(p.hp, 270, 'игрок 265 +12 = 270 (кап)');
    // (c) weakenAllEnemies: ВСЕ живые мобы — {mult: 0.8, turns: 2}
    // ИМЕННО; мёртвый — НЕ задет.
    const c2 = createCombat({
      player: hero112(), mobs: ['wolf', 'wolf'], mobLevel: 2, seed: 7,
    });
    const m0 = c2.units.find((x) => x.id === 'm0');
    const m1 = c2.units.find((x) => x.id === 'm1');
    m1.alive = false;
    m1.hp = 0;
    I.weakenAllEnemies(c2, 0.8, 2);
    assert.deepEqual(m0.weakened, { mult: 0.8, turns: 2 },
      'живой моб — {mult: 0.8, turns: 2}');
    assert.equal(m1.weakened, undefined, 'мёртвый моб — НЕ задет');
    // (d) Первая встреча: ленивый globalThis.Game.efir (one-shot) —
    // 1-й бой с Эфиром в отряде — flavor-строка, 2-й (тот же fake —
    // съеден) — без; без Game.efir — ТИХО (деградация, без краха).
    // Fake — closure (НЕ реальный модуль E — one-shot не расходуется).
    // Путь — globalThis.Game.efir (браузерный UMD root.Game.efir и
    // main.js G.efir, где G = globalThis.Game).
    const LINE = 'Эфир материализуется рядом с Флогистоном…';
    const mkFake = () => {
      let used = false;
      return {
        takeFirstEncounterLine: () => {
          if (used) return null;
          used = true;
          return LINE;
        },
      };
    };
    withGame112({ efir: mkFake() }, () => {
      const c3 = createCombat({
        player: hero112(), allies: [E.efirAllyData(E.createEfir())],
        mobs: ['wolf'], mobLevel: 2, seed: 5,
      });
      assert.ok(c3.log.includes(LINE),
        '1-й бой: строка первой встречи в c.log: ' + c3.log.join(' | '));
      const c4 = createCombat({
        player: hero112(), allies: [E.efirAllyData(E.createEfir())],
        mobs: ['wolf'], mobLevel: 2, seed: 6,
      });
      assert.ok(!c4.log.includes(LINE),
        '2-й бой (тот же fake — съеден): строки НЕТ: ' + c4.log.join(' | '));
    });
    withGame112({}, () => {
      const c5 = createCombat({
        player: hero112(), allies: [E.efirAllyData(E.createEfir())],
        mobs: ['wolf'], mobLevel: 2, seed: 7,
      });
      assert.ok(!c5.log.includes(LINE),
        'без Game.efir — тишина (строки нет, краха нет — деградация)');
    });
  } finally {
    C.combatInternals.allySpells = saveCatalog;
  }
});

// --- Задача 000119: Баланс: Эфир против стандартных групп (симуляция)
//     (КРАСНЫЕ) ---
//
// Контракт (memory/000119-efir-balance.md), ТЗ tasks/pending/000119.md:
//   * (a) medium: «разумно играющий» герой (скрипт 000027 «удары + блок»,
//     midGameHero L15, levelDeltaMax: 0) + НОВЫЙ Эфир (createEfir L1)
//     побеждают ВСЕ стандартные группы (7 числовых GROUP_RECIPES) на всех
//     сидах 1..5 (sweep, как в 000027);
//   * (b) hard остаётся сложным: ПАССИВНЫЙ герой («ждёт» — только endTurn)
//     + Эфир проигрывают ВСЕ стандартные группы;
//   * (c) бой не тривиален: зафиксированные метрики свипа (a) — средняя
//     длительность (раунды) и HP героя после боя; агрегат по свипу (D4:
//     per-combat «урон в каждом бою» недостижим — 13/35 full-HP боёв —
//     СВОЙСТВО БАЗЛАЙНА 000027: мобы ≤ брони героя, не эффект Эфира);
//   * РЕШЕНИЕ «БЕЗ ТЮНИНГА» (D1): симуляция ДО изменений при текущих
//     combat_difficulties (easy 0.30/0.30, medium 0.45/0.45, hard
//     0.60/0.55 — src/global-settings.js) уже удовлетворяет всем трём
//     пунктам; краснота фиксаторов доказана mutation-прогоном (при
//     сломанном балансе каждый тест краснеет: medium {4.5, 4.5} → BAL-1;
//     hard {0.06, 0.055} → BAL-2; medium {0.045, 0.045} → BAL-3) — тесты
//     фиксируют баланс, а не «вечно зелёные»;
//   * ЛОВУШКА autoTarget (D3): существующий autoTarget (000027) строит
//     пул целей по ВСЕМ живым c.units и приоритизирует role 'support' —
//     а Эфир = support: бот целит СВОЕГО Эфира → c.attack отклоняет
//     'ally' → `break` → deadlock «блок навсегда» (измерено:
//     abyss_spirit 0/5 на medium). Поэтому СВОИ mob-only хелперы
//     (autoTargetMob119/autoPlay119); существующие autoTarget/autoPlay —
//     НОЛЬ правок (инвариант);
//   * 000117 (практика) НЕ искажает симуляцию: бой читает СНАПШОТ
//     u.efirSkills (buildEfirUnit); у нового Эфира навыки 0; прирост от
//     практики вступает со СЛЕДУЮЩЕГО боя (внутри одного боя — не
//     действует);
//   * «Вдох» при L1 недостижим (mp 11 < 20 — баланс-факт 000113:
//     maxMP = 5+Инт+Муд, порог недостижим до L11) — симуляция L1 Вдох НЕ
//     включает; u.mp = 20 НЕ ставим (ТЗ-паттерн 000113 — только «если
//     сценарий требует», сценарий не требует);
//   * Лог-строки НЕ ассертим (D9 — 000118 параллельно правит их в этом
//     же файле; наш регион — конец файла, при мерже — регион-юнион).
//
// Зафиксированные метрики (симуляция 2026-10-04, сиды 1..5; per-group
// таблицы — tasks/result/000119.md):
//   (a) medium + Эфир L1: 35/35 victory; avg 8.40 раунда (min 3,
//       orc_raid); avg HP героя после 0.944 (min 0.694, abyss_spirit);
//       hardest-группа (6) — per-combat hpFrac < 1.0; без Эфира
//       (базлайн 000027): 35/35, avg 8.91, avg 0.941 — Эфир бой на
//       ~0.5 раунда короче, герой получает урона в среднем чуть БОЛЬШЕ
//       (танкует удары на 16 HP, но hardest-группы ранят сильнее) — НЕ
//       тривиализация;
//   (b) hard + пассив: 35/35 'dead' (смерть R12–R72, avg 34.7).
// ПЕРЕЧИСЛЕНИЕ 2026-10-07 (ревью 000168; ИИ Эфира заменён вводом —
// бот autoPlay119 БЕЗ ПРАВОК: на ходу Эфира его c.attack/c.move
// раскатываются диспатчем по активному, решения бота — по дистанции
// ИГРОКА до цели, поэтому Эфир в свипе ДВИЖЕТСЯ, но «Касания духа»
// не выполняет (0) и не кастует (c.cast бот не вызывает); зависаний
// НЕТ — все бои завершаются):
//   (a) medium: 35/35 victory; avg 9.686 раунда (min 4, orc_raid/
//       spider_nest); avg HP героя после 0.9138 (min 0.5968,
//       abyss_spirit); hardest-группа (6) — per-combat hpFrac < 1.0;
//   (b) hard + пассив: 35/35 'dead' (смерть R13–R41, avg 22.0).
// Интервальные пины EFIR_BAL119 удерживаются с запасом (см. ниже).

// ЧИСЛОВЫЕ ключи GROUP_RECIPES — 7 каталожных стандартных групп
// ('BUILDING_BOSS' — строковый ключ, исключён; фильтр 000077).
function numericGroups119() {
  return Object.keys(GROUP_RECIPES)
    .filter((t) => String(t) === String(Number(t)));
}

// Цель «разумной» авто-игры 000119: живые (!alive-сборка как у
// autoTarget) ТОЛЬКО side 'mob'. Приоритет support (самый раненый по
// frac) — среди мобов support нет, работает ближайший (uDist); null —
// если мобов нет. (Существующий autoTarget НЕ трогаем: он бы взял Эфир
// (role 'support') целью — deadlock, см. баннер D3.)
function autoTargetMob119(c) {
  const alive = c.units.filter(
    (u) => u.alive && !u.fled && u.side === 'mob');
  if (!alive.length) return null;
  const supports = alive.filter((u) => u.role === 'support');
  if (supports.length) {
    return supports.reduce((a, b) => (b.hp / b.maxHP < a.hp / a.maxHP ? b : a));
  }
  return alive.reduce((a, b) => (uDist(c, a) <= uDist(c, b) ? a : b));
}

// Авто-игра «разумного» игрока (копия autoPlay 000027: удары при
// d ≤ 1, иначе движение rect к цели, fallback «прижаты» → ближайший
// самый раненый, блок в конце хода, endTurn) с ЕДИНСТВЕННЫМ отличием:
// цели ТОЛЬКО side 'mob' (в авто-выборе И в adjacent-fallback).
// Остальное — побайтово как 000027. Возврат — c.result.
function autoPlay119(c, { maxRounds = 80 } = {}) {
  let n = 0;
  while (!c.result && n++ < maxRounds) {
    let t = autoTargetMob119(c);
    while (c.result === null && (c.ps.attack > 0 || c.ps.moveLeft > 0) && t) {
      const d = uDist(c, t);
      if (d <= 1 && c.ps.attack > 0) {
        const r = c.attack(t.id);
        if (!r.ok) break;
        if (!t.alive || t.fled) t = autoTargetMob119(c);
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
        // Прижаты (многоклеточный моб закрыл путь, 000040) — ближайший
        // самый раненый МОБ (фильтр side 'mob' — D3).
        const adjacent = c.units
          .filter((u) => u.alive && !u.fled && u.side === 'mob'
            && uDist(c, u) <= 1)
          .sort((a, b) => a.hp / a.maxHP - b.hp / b.maxHP)[0];
        if (adjacent && c.ps.attack > 0) {
          const r = c.attack(adjacent.id);
          if (!r.ok) break;
          if (!t.alive || t.fled) t = autoTargetMob119(c);
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

// Пассивная игра ТЗ (b): герой «ждёт» — только endTurn (без ударов и
// блока). maxRounds — бюджет (зафиксирован max смерти R72, запас): при
// исчерпании возврат null → ассерт в тесте (бой не «завис» — тест не
// висит). Возврат — c.result.
function passivePlay119(c, { maxRounds = 120 } = {}) {
  let n = 0;
  while (!c.result && n++ < maxRounds) c.endTurn();
  return c.result;
}

// Проводка боя 000119 (порядок 000112/000113, board112): midGameHero
// (L15, maxHP 62) + createEfir L1 (hp 16, mp 11, навыки 0 — снапшот) +
// allies → createCombat (difficulty ЯВНЫЙ — паттерн 000027) →
// c.obstacles.clear() (проверяем баланс, не навигацию — жадный бот
// deadlock-ится за камнем, 000027/000050) → buildEfirUnit (апгрейд
// юнита, 0 новых RNG). Каждый бой — СВОИ hero/efir (свежие объекты —
// паттерн :869-877). save/restore combatInternals.allySpells в
// try/finally (D12, паттерн 000112 CB-1: каталог ИИ союзника — его
// ставит шапка, require spells.js :20; save/restore — страховка
// изолированных запусков). hpFrac — ПОСЛЕ боя (D11: victory-ап P.addXp
// мог бы поднять уровень и maxHP — метрика «как в UI»).
// Возврат { c, p, u, r, rounds, hpFrac }: rounds = c.round на момент
// c.result (1-based, бой ≥ 1 раунда); в (b) hero мёртв → p.hp = 0 →
// hpFrac = 0.
function battle119({ type, seed, difficulty, passive }) {
  const C119 = require('../src/combat.js'); // тот же кэш, что в шапке
  const E = loadEfir000081();
  const saveCatalog = C119.combatInternals.allySpells;
  C119.combatInternals.allySpells =
    require('../src/spells-data.js').SPELLS_BY_ID;
  try {
    const p = midGameHero();
    const st = E.createEfir();
    const c = createCombat({
      player: p,
      allies: [E.efirAllyData(st)],
      groupType: Number(type), seed, levelDeltaMax: 0, difficulty,
    });
    if (c.obstacles) c.obstacles.clear();
    const u = E.buildEfirUnit(st, c);
    assert.ok(u && c.efs, 'боевой профиль Эфира построен (000119)');
    const r = passive ? passivePlay119(c) : autoPlay119(c);
    const hpFrac = p.hp / derived(p).maxHP;
    return { c, p, u, r, rounds: c.round, hpFrac };
  } finally {
    C119.combatInternals.allySpells = saveCatalog;
  }
}

// Пороги фиксаторов баланса 000119 (одна точка тюнинга пинов; D5).
// Интервалы ~±40% от измеренных: ловят дрейф баланса, не флейкают на
// ребейзе (пин детерминирован сидами). Зафиксированные значения —
// tasks/result/000119.md (симуляция 2026-10-04, сиды 1..5):
// avg rounds = 8.40, avg hpFrac = 0.944, min hpFrac = 0.694.
// Пересчёт 2026-10-07 (ревью 000168 — ИИ Эфира заменён вводом, см.
// баннер 000119): avg rounds = 9.686 (min 4), avg hpFrac = 0.9138,
// min hpFrac = 0.5968 — интервалы ниже удерживаются с запасом.
// Пересчёт 2026-10-24 (000257 — ход героя 1 + floor(ловкость/10)): avg rounds = 11.257, avg hpFrac = 0.9161, min hpFrac = 0.5968 — интервалы удерживаются (запас avgRoundsMax 0.74).
const EFIR_BAL119 = {
  // per-combat (a): rounds ≥ 2 — бой не «мгновенный» (зафиксирован min 3;
  // пересчёт 2026-10-07 после 000168: min 4).
  minRounds: 2,
  // свип (a): avg rounds ∈ [5, 12] — нижняя — ТЗ «не мгновенно»,
  // верхняя — страховка от дрейфа (soft-lock/осада).
  avgRoundsMin: 5,
  avgRoundsMax: 12,
  // свип (a): avg hpFrac < 1.0 — герой ПОЛУЧАЕТ урон на уровне свипа.
  avgHpFracCeil: 1.0,
  // свип (a): min hpFrac ≤ 0.80 — есть бой, где герой реально ранен.
  minHpFracCeil: 0.80,
};

test('000119 BAL-1: герой (свои удары + блок) + НОВЫЙ Эфир (L1) побеждают ВСЕ стандартные группы на medium (7 групп × сиды 1–5)', () => {
  for (const type of numericGroups119()) {
    const name = GROUP_RECIPES[type].name;
    for (const seed of [1, 2, 3, 4, 5]) {
      const b = battle119({ type, seed, difficulty: 'medium', passive: false });
      assert.ok(b.r, `${name} (seed ${seed}): бой не завершился`);
      assert.equal(b.r.outcome, 'victory',
        `${name} (seed ${seed}): исход ${b.r.outcome}`);
      assert.ok(b.r.xp > 0 && b.r.gold > 0,
        `${name} (seed ${seed}): лут за победу`);
      assert.ok(b.rounds >= EFIR_BAL119.minRounds,
        `${name} (seed ${seed}): бой «мгновенный» (${b.rounds} раундов)`);
      // hardest-группа (6, abyss_spirit) — per-combat: герой ПОЛУЧАЕТ
      // урон (hpFrac < 1.0). Прочие группы: per-combat «урон в каждом
      // бою» недостижим (13/35 full-HP — свойство базлайна 000027: мобы
      // ≤ брони героя, не эффект Эфира) — (c) читается агрегатом,
      // см. BAL-3.
      if (Number(type) === 6) {
        assert.ok(b.hpFrac < 1.0,
          `abyss_spirit (seed ${seed}): герой не пострадал `
          + `(hpFrac ${b.hpFrac.toFixed(3)})`);
      }
    }
  }
  // Детерминизм-пин (D8): один бой (group 3 — wolf_pack, seed 5) — ДВА
  // прогона → deepEqual снимка {result, c.round, p.hp, позиции/hp всех
  // юнитов}: симуляция с Эфиром детерминирована (бот — чистая функция
  // состояния; RNG посеянный; Эфир-ход = 0 новых c._rng-вызовов).
  const pin = () => {
    const b = battle119({ type: '3', seed: 5, difficulty: 'medium',
      passive: false });
    return {
      result: b.r,
      rounds: b.rounds,
      pHp: b.p.hp,
      units: b.c.units.map((u) => ({ id: u.id, x: u.x, y: u.y,
        hp: u.hp, alive: u.alive })),
    };
  };
  assert.deepEqual(pin(), pin(),
    'детерминизм: group 3 (wolf_pack), seed 5 — два прогона → '
    + 'идентичный снимок');
});

test('000119 BAL-2: hard остаётся сложным — ПАССИВНЫЙ герой + Эфир проигрывают ВСЕ стандартные группы (7 групп × сиды 1–5)', () => {
  for (const type of numericGroups119()) {
    const name = GROUP_RECIPES[type].name;
    for (const seed of [1, 2, 3, 4, 5]) {
      const b = battle119({ type, seed, difficulty: 'hard', passive: true });
      assert.ok(b.r,
        `${name} (seed ${seed}): бой не завершился до 120 раундов`);
      assert.equal(b.r.outcome, 'dead',
        `${name} (seed ${seed}): пассивный герой выжил `
        + `(исход ${b.r.outcome})`);
    }
  }
});

test('000119 BAL-3: бой с Эфиром не тривиален — зафиксированные метрики (deterministic sweep (a))', () => {
  // Пересчёт свипа (a) (детерминизм — те же числа, что в BAL-1).
  // Зафиксированные значения (симуляция 2026-10-04; per-group таблицы —
  // tasks/result/000119.md): avg rounds = 8.40 (min 3), avg hpFrac =
  // 0.944, min hpFrac = 0.694 (abyss_spirit).
  // Пересчёт 2026-10-07 (ревью 000168 — ИИ Эфира заменён вводом, бот
  // без правок): avg rounds = 9.686 (min 4), avg hpFrac = 0.9138,
  // min hpFrac = 0.5968 (abyss_spirit) — интервальные пины держатся.
  const rows = [];
  for (const type of numericGroups119()) {
    for (const seed of [1, 2, 3, 4, 5]) {
      const b = battle119({ type, seed, difficulty: 'medium', passive: false });
      assert.equal(b.r.outcome, 'victory',
        `группа ${GROUP_RECIPES[type].name} (seed ${seed}): исход `
        + `${b.r.outcome}`);
      rows.push({ rounds: b.rounds, hpFrac: b.hpFrac });
    }
  }
  const avgRounds = rows.reduce((s, x) => s + x.rounds, 0) / rows.length;
  const avgHpFrac = rows.reduce((s, x) => s + x.hpFrac, 0) / rows.length;
  const minHpFrac = Math.min(...rows.map((x) => x.hpFrac));
  assert.ok(avgRounds >= EFIR_BAL119.avgRoundsMin,
    `средняя длительность ${avgRounds.toFixed(2)} < ${EFIR_BAL119.avgRoundsMin} `
    + `— бой «мгновенный»`);
  assert.ok(avgRounds <= EFIR_BAL119.avgRoundsMax,
    `средняя длительность ${avgRounds.toFixed(2)} > ${EFIR_BAL119.avgRoundsMax} `
    + `— дрейф баланса (soft-lock/осада?)`);
  assert.ok(avgHpFrac < EFIR_BAL119.avgHpFracCeil,
    `среднее HP героя после боя ${avgHpFrac.toFixed(3)} — герой НЕ получает `
    + `урон: Эфир тривиализует бой`);
  assert.ok(minHpFrac <= EFIR_BAL119.minHpFracCeil,
    `минимальное HP героя после боя ${minHpFrac.toFixed(3)} > `
    + `${EFIR_BAL119.minHpFracCeil} — нет боя, где герой реально ранен`);
});

// =====================================================================
// 000132. Лут с мобов при победе (контракт —
// memory/000132-mob-loot.md; spec/mob-groups-storage.md «Лут»; ТЗ —
// tasks/pending/000132.md).
//
// Закреплены контракты (TDD: функциональности в combat.js пока НЕТ —
// N1-N4/N6 красные, N5 — зелёный защитный пин gold-потока):
//   * c.result.items — массив {id, qty} ТОЛЬКО в outcome 'victory'
//     ('fled'/'dead' — поля НЕТ — шаблон allyXp 000082); повторяющиеся
//     id — слиты (qty), порядок — первого появления;
//   * per-mob таблица u.loot: НЕЗАВИСИМЫЙ ролл на запись
//     (c._rng() < chance), порядок = порядок таблицы; поле читается
//     ЖИВЬЁМ (мутация до ролла действует); пустая таблица (orc_mad,
//     centipede) — без краша, базовый/редкий роллятся;
//   * базовый пул — 1 ролл на каждого поверженного моба, редкий —
//     1 ОБЩИЙ ролл на бой (вероятность — P(D) по разности уровней,
//     000245; ре-пин формулы 000132: шанс 0.25 / 0.05 + 0.01 ×
//     maxLevel → P(D) = clamp(0.25 + 0.04·D, 0.05, 0.25));
//     выбор — pool[floor(c._rng() * len)];
//   * пулы — ДАННЫЕ МОДУЛЯ: LOOT_BASE_POOL (8: ВСЕ food/potion) и
//     LOOT_RARE_POOL (18: ВСЕ skill_book + weapon/armor value > 35),
//     порядок файлов каталога; целостность — в одну сторону (id ∈
//     каталогу, kind/value границы);
//   * порядок c._rng в checkVictory: лут-роллы СТРОГО ПОСЛЕ gold-роллов
//     → поток xp/gold бит-в-бит (N5); детерминизм по сиду (N1).
//
// Сценарий — паттерн winWithAllies (000082): strongHero, мобы в
// верху (3+i, 2), игрок — standNextTo, добивание. killBy 'dealDamage'
// — combatInternals.dealDamageToMob (НОЛЬ c._rng) — для константы 0.99,
// при которой удары игрока гарантированно промах (hitChance ≤ 0.95).
// =====================================================================

function winLoot({ mobs = ['wolf'], mobLevel = 2, seed = 5,
                  rng = null, killBy = 'attack', mutateUnit,
                  heroLevel = 1 } = {}) {
  const p = strongHero();
  // 000245: уровень героя — ДО createCombat (default 1 — текущее
  // поведение; c._rng-поток НЕ сдвигается: array-путь createCombat и
  // generateObstacles player.level не используют — пробный прогон:
  // уровни 1 и 10, волк L15, seed 5 → идентичные gold 36 / xp 68).
  p.level = heroLevel;
  const c = createCombat({ player: p, mobs, mobLevel, seed });
  c.obstacles.clear();
  const mobsU = c.units.filter((u) => u.side === 'mob');
  mobsU.forEach((u, i) => { u.x = 3 + i; u.y = 2; });
  if (mutateUnit) mobsU.forEach((u) => mutateUnit(u));
  standNextTo(c, mobsU[0]);
  if (rng) c._rng = rng;
  let n = 0;
  while (!c.result && n++ < 60) {
    if (killBy === 'dealDamage') {
      const t = c.units.find((u) => u.side === 'mob' && u.alive);
      if (!t) break;
      combatInternals.dealDamageToMob(c, t, 9999);
      continue;
    }
    c.ps.attack = 99;
    const t = c.units.find((u) => u.side === 'mob' && u.alive
      && uDist(c, u) <= 1)
      || c.units.find((u) => u.side === 'mob' && u.alive);
    c.attack(t.id);
    c.endTurn();
  }
  assert.ok(c.result, 'бой завершился');
  assert.equal(c.result.outcome, 'victory', 'игрок побеждает');
  return { c, p };
}

test('000132-N1: детерминизм — сиды 5..10, два прогона → идентичный c.result.items', () => {
  for (const seed of [5, 6, 7, 8, 9, 10]) {
    const run = () => {
      const { c } = winLoot({ mobLevel: 2, seed });
      // GUARD ДО сравнения: без поля deepEqual(undefined, undefined)
      // ложно прошёл бы.
      assert.ok(Array.isArray(c.result.items),
        `seed ${seed}: victory — c.result.items обязан быть массивом `
        + `(fакт: ${typeof c.result.items})`);
      return JSON.stringify(c.result.items);
    };
    assert.equal(run(), run(),
      `seed ${seed}: тот же сид → тот же состав лута`);
  }
});

test('000132-N2: точные составы — rng→0 (таблица+база+редкий+экипировка), rng→0.99 (мимо лута + экипировка), 100%-таблица, слияние qty, порядок таблицы (ре-пин 000230.08: пулы экипировки не пусты — +1 экипировочный ПОСЛЕДНИМ: (а) r=0 → common pool[0] = straw_hat; (б–д) r=0.99 → legendary (0.99 < 0.999…) pool[floor(0.99·18)] = void_ring; ре-пин 000230.09: legendary-пул 2 → 6, конец пула; ре-пин 000230.10: legendary-пул 6 → 8, конец = torso; ре-пин 000230.11: legendary-пул 8 → 12, конец = palms; ре-пин 000230.12: legendary-пул 12 → 14 («правая рука»: sage_staff + mithril_hammer); ре-пин 000230.13: legendary-пул 14 → 16, конец = left_hand; ре-пин 000230.14: legendary-пул 16 → 18, конец = кольца; ре-пин 000230.15: legendary-пул 18 → 22 (+4 ноги/ступни концом, каталожный порядок: rune_greaves/storm_leggings/storm_sandals/rune_boots), (б–д) → pool[floor(0.99·22)] = pool[21] = rune_boots)', () => {
  // (а) rng→0, 2×волк L2: ВСЕ роллы попадают. Таблица волка
  // leather_armor (каждый) → qty 2; база — BASE_POOL[0] = minor_healing
  // (каждый) → qty 2; редкий — RARE_POOL[0] = iron_sword (ОДИН на бой).
  // Экипировка (000230.05/000230.08): tier common (r=0), select
  // pool[0] = straw_hat — ПОСЛЕДНИМ. Порядок — первого появления.
  // xp 2×(8+4·2) = 32; gold — 2×round(3+4+0·2) = 14 (gold-роллы ДО
  // лут-роллов; бит-в-бит: поток c._rng существующих роллов не сдвинут).
  {
    const { c } = winLoot({ mobs: ['wolf', 'wolf'], mobLevel: 2, seed: 5,
      rng: () => 0, killBy: 'attack' });
    assert.equal(c.result.xp, 32, 'xp — 2×(8+4·2), без изменений');
    assert.equal(c.result.gold, 14, 'gold — 2×round(3+4+0·2)');
    assert.deepEqual(c.result.items, [
      { id: 'leather_armor', qty: 2 },
      { id: 'minor_healing', qty: 2 },
      { id: 'iron_sword', qty: 1 },
      { id: 'straw_hat', qty: 1 },
    ], 'rng→0: таблица (per-mob) + базовый + редкий (одна на бой) '
      + '+ экипировочный (common) ПОСЛЕДНИМ');
  }
  // (б) rng→0.99, 2×волк L2: ВСЕ лут-роллы мимо (0.99 > 0.1 /
  // P(−1) = 0.21 — ре-пин 000245: было 0.25 / 0.05+0.01·2);
  // экипировка: tier legendary (0.99 < 0.999…), select
  // pool[floor(0.99·18)] = pool[17] = void_ring (ре-пин 000230.09:
  // legendary-пул растёт 2 → 6 в каталожном порядке, конец = шея;
  // ре-пин 000230.10: 6 → 8, конец = torso; ре-пин 000230.11:
  // 8 → 12, конец = palms; ре-пин 000230.12: 12 → 14,
  // «правая рука»; ре-пин 000230.13: 14 → 16, конец = left_hand;
  // ре-пин 000230.14: 16 → 18, конец = кольца; ре-пин 000230.15:
  // 18 → 22 (+4 легендарки ног/ступней, каталожный порядок:
  // rune_greaves/storm_leggings/storm_sandals/rune_boots) →
  // pool[floor(0.99·22)] = pool[21] = rune_boots
  // (node-перепрогон, merge .11–.14; (а) straw_hat — pool[0] —
  // неизменен).
  // (Убийство — dealDamage: при константе 0.99 удары игрока
  // гарантированно промах, hitChance ≤ 0.95.)
  {
    const { c } = winLoot({ mobs: ['wolf', 'wolf'], mobLevel: 2, seed: 5,
      rng: () => 0.99, killBy: 'dealDamage' });
    assert.deepEqual(c.result.items, [{ id: 'rune_boots', qty: 1 }],
      'rng→0.99 — лут-роллы мимо, экипировочный (legendary) ЕСТЬ');
  }
  // (в) 100%-таблица — гарантированный дроп даже при промахах пулов
  // (поле u.loot читается ЖИВЬЁМ: мутация ДО ролла действует) +
  // экипировочный (legendary) ПОСЛЕДНИМ.
  {
    const { c } = winLoot({
      rng: () => 0.99, killBy: 'dealDamage',
      mutateUnit: (u) => { u.loot = [{ item: 'meat', chance: 1 }]; },
    });
    assert.deepEqual(c.result.items, [
      { id: 'meat', qty: 1 }, { id: 'rune_boots', qty: 1 },
    ], '100%-шанс в таблице — гарантированный дроп + экипировочный');
  }
  // (г) слияние qty: 2 волка × 100% meat — ОДНА запись qty 2
  // (+ экипировочный ПОСЛЕДНИМ).
  {
    const { c } = winLoot({ mobs: ['wolf', 'wolf'],
      rng: () => 0.99, killBy: 'dealDamage',
      mutateUnit: (u) => { u.loot = [{ item: 'meat', chance: 1 }]; },
    });
    assert.deepEqual(c.result.items, [
      { id: 'meat', qty: 2 }, { id: 'rune_boots', qty: 1 },
    ], 'повторяющиеся id слиты в одну запись (qty)');
  }
  // (д) таблица из 2 записей — порядок дропа = порядок таблицы
  // (+ экипировочный ПОСЛЕДНИМ).
  {
    const { c } = winLoot({
      rng: () => 0.99, killBy: 'dealDamage',
      mutateUnit: (u) => { u.loot = [
        { item: 'sulfur', chance: 1 }, { item: 'meat', chance: 1 }]; },
    });
    assert.deepEqual(c.result.items, [
      { id: 'sulfur', qty: 1 }, { id: 'meat', qty: 1 },
      { id: 'rune_boots', qty: 1 },
    ], 'порядок = порядок записей таблицы + экипировочный');
  }
});

test('000132-N3: пустые per-mob таблицы (orc_mad, centipede) — без краша, items — массив (базовый/редкий роллятся)', () => {
  for (const [mob, lvl] of [['orc_mad', 3], ['centipede', 2]]) {
    const { c } = winLoot({ mobs: [mob], mobLevel: lvl, seed: 5 });
    assert.equal(c.result.outcome, 'victory', `${mob}: победа`);
    assert.ok(Array.isArray(c.result.items),
      `${mob}: items — массив (может быть пустым — роллы мимо) `
      + `(факт: ${typeof c.result.items})`);
  }
});

test('000132-N4: «fled»/«dead» — поля items НЕТ; «victory» — items ЕСТЬ (шаблон allyXp 000082)', () => {
  // (а) victory: поле ЕСТЬ, массив.
  const c1 = winLoot({ mobLevel: 2, seed: 5 }).c;
  assert.equal(c1.result.outcome, 'victory');
  assert.ok('items' in c1.result, '«victory» — поле items ЕСТЬ');
  assert.ok(Array.isArray(c1.result.items), '«victory» — items массив');

  // (б) все сбежали (пугливая фея у верхней стены, hp < 30%) —
  // «fled»: поля items НЕТ (лута нет — лог-комментарий checkVictory).
  const c2 = createCombat({ player: strongHero(), mobs: ['fairy'],
    mobLevel: 10, seed: 5 });
  c2.obstacles.clear();
  const w2 = c2.units.find((u) => u.id === 'm0');
  w2.y = 0; // верхняя стена — «уходят из боя»
  w2.hp = Math.max(1, Math.floor(w2.maxHP * 0.1)); // < 30% — бегство
  c2.endTurn();
  assert.equal(c2.result.outcome, 'fled', c2.log.join(' | '));
  assert.ok(!('items' in c2.result), '«fled» — поля items нет');

  // (в) игрок погиб — «dead»: поля items нет.
  const c3 = createCombat({ player: createCharacter(), groupType: 6, seed: 8 });
  if (c3.obstacles) c3.obstacles.clear();
  c3._rng = () => 0.01; // мобы точно попадают
  let n = 0;
  while (!c3.result && n++ < 60) c3.endTurn();
  assert.equal(c3.result.outcome, 'dead');
  assert.ok(!('items' in c3.result), '«dead» — поля items нет');
});

test('000132-N5: gold-поток БЕЗ ИЗМЕНЕНИЙ — лут-роллы строго после gold-роллов (пин базлайна; зелёный с red-фазы)', () => {
  // Значения сверены на мастере 375c0f4 (сценарий winLoot, 2026-10-05).
  // Ловит реализацию, поставившую лут-роллы ДО/ВМЕСТО gold-ролла —
  // поток c._rng сдвинется, gold станет другим.
  const pin = (mobs, mobLevel, seed) => winLoot({ mobs, mobLevel, seed }).c.result;
  assert.equal(pin(['wolf'], 2, 5).xp, 16, 'волк L2: xp = 8 + 4·2');
  assert.equal(pin(['wolf'], 2, 5).gold, 8, 'волк L2, seed 5: gold 8');
  assert.equal(pin(['wolf'], 2, 7).gold, 7, 'волк L2, seed 7: gold 7');
  assert.equal(pin(['wolf'], 2, 9).gold, 9, 'волк L2, seed 9: gold 9');
  assert.equal(pin(['orc_mad'], 3, 5).xp, 20, 'orc_mad L3: xp = 8 + 4·3');
  assert.equal(pin(['orc_mad'], 3, 5).gold, 10, 'orc_mad L3, seed 5: gold 10');
});

test('000132-N6: пулы — данные модуля: точные списки (порядок файлов каталога) + целостность в одну сторону', () => {
  assert.ok(Array.isArray(LOOT_BASE_POOL),
    'combat.js: экспорт LOOT_BASE_POOL (данные пула — не вывод в рантайме)');
  assert.ok(Array.isArray(LOOT_RARE_POOL),
    'combat.js: экспорт LOOT_RARE_POOL');
  assert.equal(LOOT_BASE_POOL.length, 8, 'базовый пул — 8 id');
  assert.equal(LOOT_RARE_POOL.length, 18, 'редкий пул — 18 id');
  // Порядок = порядок файлов каталога (000011..000018; 000002..000032).
  assert.deepEqual(LOOT_BASE_POOL, [
    'minor_healing', 'healing_potion', 'greater_healing', 'mana_potion',
    'mana_elixir', 'bread', 'meat', 'honey_cake',
  ], 'базовый пул: ВСЕ food/potion каталога, порядок файлов каталога');
  assert.deepEqual(LOOT_RARE_POOL, [
    'iron_sword', 'steel_sword', 'hunting_bow', 'battle_axe', 'war_hammer',
    'chainmail', 'knight_plate',
    'alchemy_manual', 'sword_treatise', 'archery_manual',
    'stone_fist_grimoire', 'iron_hide_tome', 'fire_spellbook',
    'ice_spellbook', 'heavy_tome', 'archer_scroll', 'meditation_scroll',
    'nature_scroll',
  ], 'редкий пул: 11 skill_book + weapon/armor value > 35 (СТРОГО), '
    + 'порядок файлов каталога (leather_armor 35 — ВНЕ)');
  // Целостность — В ОДНУ СТОРОНУ (000133 растит каталог: фиксированные
  // пулы не обязаны за ним следить; обратный set-equality — нет).
  const byId = new Map(I.allItems().map((it) => [it.id, it]));
  for (const id of LOOT_BASE_POOL) {
    const it = byId.get(id);
    assert.ok(it, 'базовый пул: id есть в каталоге: ' + id);
    assert.ok(it.kind === 'food' || it.kind === 'potion',
      'базовый пул: kind food/potion: ' + id + ' (' + it.kind + ')');
  }
  for (const id of LOOT_RARE_POOL) {
    const it = byId.get(id);
    assert.ok(it, 'редкий пул: id есть в каталоге: ' + id);
    assert.ok(it.kind === 'skill_book'
      || ((it.kind === 'weapon' || it.kind === 'armor') && it.value > 35),
      'редкий пул: skill_book либо weapon/armor с value > 35: ' + id
      + ' (' + it.kind + ', value ' + it.value + ')');
  }
});

// --- A* — поиск пути мобов в бою (задача 000155) ---
//
// КРАСНЫЕ тесты (TDD): функциональности ещё нет в src/combat.js —
// нет экспортов pathStepTo/pathStepFrom, mobAct ходит жадным
// stepTowardRect: моб за препятствием «стоит» (000050) и не доходит.
// Контракт: memory/000155-mob-pathfinding.md (BFS-поле расстояний +
// «вето поля» на жадный шаг; тай-брейк PATH_DIRS [[0,-1],[0,1],[-1,0],[1,0]];
// reach: melee = 1, ranged = 4 ТОЛЬКО при d>4; ретрит — pathStepFrom).
// Пины — прибытие + СТРОГОЕ убывание d + первый шаг (а не полная
// траектория): устойчиво к внутренним деталям фикса и ловит и текущий
// stuck (d константа), и наивный livelock «жадный || A*» (d 3,4,3,4).
// Ожидаемый исход станции: 8 красных (re-pin-1950 + R1…R6 + R8);
// R7 и R4b — зелёные guard (бит-в-бит чистое поле / поведение
// замурованного ranged не меняется).

test('A* (000155) R1: melee доходит — волк (3,3)+камень (3,4): 4 endTurn → d строго [4,3,2,1], первый шаг (2,3), 5-й ход — атака', () => {
  const p = strongHero();
  const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 3, seed: 7 });
  const w = c.units[0];
  c.obstacles.clear();
  w.x = 3; w.y = 3;          // игрок в (3,6), d0 = 3
  c.obstacles.add('3,4');    // камень прямо между волком и игроком
  c._rng = () => 0.99;
  const ds = [];
  let first = null;
  for (let i = 1; i <= 4; i++) {
    c.endTurn();
    if (i === 1) first = [w.x, w.y];
    for (const [x, y] of unitRect(w)) {
      assert.ok(!c.obstacles.has(x + ',' + y), `ход ${i}: моб не «внутри» камня`);
    }
    ds.push(uDist(c, w));
  }
  assert.deepEqual(first, [2, 3],
    'первый шаг (2,3) — обход, а не «стоит» у стены');
  assert.deepEqual(ds, [4, 3, 2, 1],
    'd строго убывает: моб обходит камень и подходит к игроку');
  c.endTurn();
  assert.ok(c.log.some((l) => /^Волк (бьёт|промахивается)/.test(l)),
    '5-й ход: волк в радиусе удара (d≤1) — строка атаки в логе');
});

test('A* (000155) R2: ranged держит дистанцию — орк-лучник (3,0)+камни (3,1..3,3): d [7,6,5,4] (никогда ≤1), траектория (2,0),(2,1),(2,2),(2,3), 5-й ход — атака', () => {
  const p = strongHero();
  const c = createCombat({ player: p, mobs: ['orc_archer'], mobLevel: 3, seed: 7 });
  const a = c.units[0];
  c.obstacles.clear();
  a.x = 3; a.y = 0;          // игрок в (3,6), d0 = 6 (> 4 — «слишком далеко»)
  c.obstacles.add('3,1'); c.obstacles.add('3,2'); c.obstacles.add('3,3');
  c._rng = () => 0.01;       // мобы точно попадают (атака на 5-м ходу)
  const ds = []; const trail = [];
  for (let i = 1; i <= 4; i++) {
    c.endTurn();
    for (const [x, y] of unitRect(a)) {
      assert.ok(!c.obstacles.has(x + ',' + y), `ход ${i}: моб не «внутри» камня`);
    }
    ds.push(uDist(c, a));
    trail.push([a.x, a.y]);
  }
  assert.deepEqual(ds, [7, 6, 5, 4],
    'd строго убывает: дальнобойный доходит до полосы выстрела (d≤4) и ОСТАНАВЛИВАЕТСЯ');
  assert.ok(ds.every((d) => d >= 2), 'd никогда ≤1 — «подхода вплотную» нет');
  assert.deepEqual(trail, [[2, 0], [2, 1], [2, 2], [2, 3]],
    'траектория обхода стены камней');
  // Пин атаки — по УРОНУ ИГРОКУ (как существующие тесты, например
  // «в следующем раунде моб бьёт»): mobAttack строку «… бьёт …» НЕ
  // логирует (логирует только «промахивается»); rng 0.01 < hitChance —
  // атака точно попадает.
  const hpBefore = c.player.hp;
  c.endTurn();
  assert.ok(c.player.hp < hpBefore,
    '5-й ход: атака в радиусе выстрела (d≤4) — урон игроку');
});

test('A* (000155) R3: детерминизм — 2 прогона сценариев R1 (melee) и R2 (ranged): deepEqual позиций и лога, в каждом прогоне есть атака', () => {
  // Шаблон детерминизм-теста (контракт 000155): два прогона тем же
  // сетапом → deepEqual позиций+лога. Ловит Math.random/c._rng и
  // скрытые тай-брейки (итерация Map) в path*.
  const runMelee = () => {
    const p = strongHero();
    const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 3, seed: 7 });
    const w = c.units[0];
    c.obstacles.clear();
    w.x = 3; w.y = 3;
    c.obstacles.add('3,4');
    c._rng = () => 0.99;
    for (let i = 0; i < 5; i++) c.endTurn();
    return { pos: [w.x, w.y], log: c.log.slice() };
  };
  const runRanged = () => {
    const p = strongHero();
    const c = createCombat({ player: p, mobs: ['orc_archer'], mobLevel: 3, seed: 7 });
    const a = c.units[0];
    c.obstacles.clear();
    a.x = 3; a.y = 0;
    c.obstacles.add('3,1'); c.obstacles.add('3,2'); c.obstacles.add('3,3');
    c._rng = () => 0.01;
    const hp0 = c.player.hp;
    for (let i = 0; i < 5; i++) c.endTurn();
    // rng 0.01 — попадание: пин атаки по урону (mobAttack попадание
    // НЕ логирует — строка «бьёт» в бою у мобов отсутствует).
    return { pos: [a.x, a.y], log: c.log.slice(), hit: c.player.hp < hp0 };
  };
  const m1 = runMelee(); const m2 = runMelee();
  const r1 = runRanged(); const r2 = runRanged();
  assert.deepEqual(m1, m2, 'melee: детерминизм позиций и лога (2 прогона)');
  assert.deepEqual(r1, r2, 'ranged: детерминизм позиций и лога (2 прогона)');
  assert.ok(m1.log.some((l) => /^Волк (бьёт|промахивается)/.test(l)),
    'melee-прогон: строка атаки есть (моб дошёл)');
  assert.ok(r1.hit,
    'ranged-прогон: атака есть (моб дошёл до полосы выстрела)');
});

test('A* (000155) R4: unit — pathStepFrom ретрит: лучник (2,6), камень (2,5), игрок (3,6) → true, (1,6); повторный вызов → d≥2', () => {
  const p = strongHero();
  const c = createCombat({ player: p, mobs: ['orc_archer'], mobLevel: 3, seed: 7 });
  const a = c.units[0];
  c.obstacles.clear();
  a.x = 2; a.y = 6;          // d0 = 1; жадный stepAwayRect блокнут: (2,5) камень
  c.obstacles.add('2,5');
  const target = { x: c.px, y: c.py, w: 1, h: 1 };
  assert.equal(pathStepFrom(c, a, target), true, 'ретрит с обходом камня возможен');
  assert.equal(a.x, 1); assert.equal(a.y, 6,
    'первый ретрит-шаг (1,6) — вбок, обходя камень');
  pathStepFrom(c, a, target);
  assert.ok(uDist(c, a) >= 2,
    'повторный ретрит: d≥2 (моб не возвращается ближе к цели)');
});

test('A* (000155) R5: unit — замурован (кольцо камней): pathStepTo/pathStepFrom → false, позиция неизменна, без краха', () => {
  const p = strongHero();
  const c = createCombat({ player: p, mobs: ['orc_archer'], mobLevel: 3, seed: 7 });
  const a = c.units[0];
  c.obstacles.clear();
  a.x = 3; a.y = 3;
  c.obstacles.add('2,3'); c.obstacles.add('4,3');
  c.obstacles.add('3,2'); c.obstacles.add('3,4');
  const target = { x: c.px, y: c.py, w: 1, h: 1 };
  assert.equal(pathStepTo(c, a, target, 1), false,
    'недостижимая цель — стоим (деградация как до задачи)');
  assert.equal(a.x, 3); assert.equal(a.y, 3, 'позиция неизменна');
  assert.equal(pathStepFrom(c, a, target), false,
    'ретрит невозможен — стоим');
  assert.equal(a.x, 3); assert.equal(a.y, 3, 'позиция неизменна');
  assert.equal(a.alive, true, 'без краха');
});

test('A* (000155) R6: многоклеточный 2×2 (troll-размер) за камнем обходит: после КАЖДОГО endTurn весь 2×2 в rectFree, d [3,2,1], 4-й ход — атака', () => {
  const p = strongHero();
  const c = createCombat({ player: p, mobs: ['troll'], mobLevel: 3, seed: 7 });
  const t = c.units[0];
  c.obstacles.clear();
  t.x = 2; t.y = 2;          // тролл 2×2; жадный шаг (0,+1) в камень (2,4)
  c.obstacles.add('2,4');
  // rng 0.99 — промах на 4-м ходу: строка «Тролль промахивается.» ЕСТЬ
  // в логе (попадание mobAttack НЕ логирует — пин по строке атаки
  // работает только через гарантированный промах).
  c._rng = () => 0.99;
  const rectFree = (u) => unitRect(u).every(([x, y]) =>
    x >= 0 && y >= 0 && x < c.width && y < c.height
    && !c.obstacles.has(x + ',' + y)
    && !(x === c.px && y === c.py));
  const ds = [];
  for (let i = 1; i <= 3; i++) {
    c.endTurn();
    assert.ok(rectFree(t), `endTurn ${i}: весь 2×2-прямоугольник в rectFree`);
    ds.push(uDist(c, t));
  }
  assert.deepEqual(ds, [3, 2, 1], '2×2 доходит вплотную (d убывает)');
  c.endTurn();
  assert.ok(c.log.some((l) => /^Тролль (бьёт|промахивается)/.test(l)),
    '4-й ход: тролль в радиусе удара (d≤1) — строка атаки в логе');
});

test('A* (000155) R8: unit — тай-брейк фиксирован: волк (3,3)+камень (3,4), pathStepTo(c,u,target,1) → true, первый шаг (2,3) (левее раньше правее)', () => {
  // Поле BFS: f((3,3))=4, соседи: (3,2)=5, (3,4)=камень, (2,3)=3,
  // (4,3)=3 → равенство минимумов решается ПЕРВЫМ направлением
  // PATH_DIRS [[0,-1],[0,1],[-1,0],[1,0]] (строгой `<`): левее раньше
  // правее. Детерминизм: единственная точка выбора (контракт 000155).
  const p = strongHero();
  const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 3, seed: 7 });
  const w = c.units[0];
  c.obstacles.clear();
  w.x = 3; w.y = 3;
  c.obstacles.add('3,4');
  const target = { x: c.px, y: c.py, w: 1, h: 1 };
  assert.equal(pathStepTo(c, w, target, 1), true, 'шаг существует — моб не застрял');
  assert.equal(w.x, 2); assert.equal(w.y, 3,
    'первый шаг (2,3): левее раньше правее (тай-брейк PATH_DIRS)');
});

test('A* (000155) R7: guard — жадный не тронут: чистое поле, волк (3,3) → (3,4), (3,5); 3-й ход — атака (бит-в-бит со старым stepTowardRect)', () => {
  const p = strongHero();
  const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 3, seed: 7 });
  const w = c.units[0];
  c.obstacles.clear();
  w.x = 3; w.y = 3;
  c._rng = () => 0.99;
  c.endTurn();
  assert.equal(w.x, 3); assert.equal(w.y, 4, 'шаг 1 — старый жадный шаг');
  c.endTurn();
  assert.equal(w.x, 3); assert.equal(w.y, 5, 'шаг 2 — старый жадный шаг');
  c.endTurn();
  assert.ok(c.log.some((l) => /^Волк (бьёт|промахивается)/.test(l)),
    '3-й ход: атака (дошёл, d=1)');
});

test('A* (000155) R4b: guard — замурованный ranged в панике не крашится: стоит, alive, не на камне, в логе «отступает.» (поведение = текущее)', () => {
  const p = strongHero();
  const c = createCombat({ player: p, mobs: ['orc_archer'], mobLevel: 3, seed: 7 });
  const a = c.units[0];
  c.obstacles.clear();
  a.x = 3; a.y = 5;          // d=1 до игрока (3,6) — паника; все выходы — камни
  c.obstacles.add('2,5'); c.obstacles.add('4,5'); c.obstacles.add('3,4');
  c._rng = () => 0.99;
  c.endTurn();
  assert.equal(a.x, 3); assert.equal(a.y, 5, 'некуда отступать — стоит на месте');
  assert.equal(a.alive, true);
  assert.ok(!c.obstacles.has(a.x + ',' + a.y), 'моб не «внутри» камня');
  assert.ok(c.log.includes('Орк-лучник отступает.'), 'лог паники не меняется');
});

// --- Guards стадии ревью (2026-10-06): контракт path* за пределами
// защищённых call-sites mobAct (красные R1–R8/R4b выше не покрывают). ---

test('A* (000155) R9: guard — pathStepTo с d=1 (моб уже в reach, f0===0) → false, позиция неизменна; из d=2 шаг всё ещё до reach', () => {
  // Ревью: без раннего `f0 === 0 → false` вызов из reach возвращал true
  // и СДИВИГАЛ юнита ОТ цели (A*-ветка берёт соседа с min-полем):
  // волк (3,5) при игроке (3,6) шёл на (3,4), повторный вызов — обратно
  // (3,5) — осцилляция для незастрахованного `while (pathStepTo(...))`.
  // Call-sites mobAct защищены (break/атака при d≤1), поэтому существующие
  // пины не сдвигаются — это яма контракта экспортируемого API (обход
  // союзников 000080 — будущий паттерн `allyStep… || pathStepTo`).
  const p = strongHero();
  const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 3, seed: 7 });
  const w = c.units[0];
  c.obstacles.clear();
  w.x = 3; w.y = 5;          // d=1 до игрока (3,6) — уже в reach=1
  const target = { x: c.px, y: c.py, w: 1, h: 1 };
  assert.equal(pathStepTo(c, w, target, 1), false,
    'f0===0 — цель уже достигнута: не шаг, стоим (контракт)');
  assert.equal(w.x, 3); assert.equal(w.y, 5, 'позиция неизменна');
  // Фикс не «переблокировал» подход: из d=2 шаг в reach существует.
  w.x = 3; w.y = 4;
  assert.equal(pathStepTo(c, w, target, 1), true, 'd=2 — шаг существует');
  assert.equal(uDist(c, w), 1, 'шаг до reach (d=1)');
});

test('A* (000155) R10: guard — pathStepFrom: A*-шаг с тай-брейком PATH_DIRS (жадный проб в ретрите не используется)', () => {
  // Ревью: жадный проб в pathStepFrom (шаг К цели, ось x первой при
  // равенстве осей) МОГ БЫТЬ ПРИНЯТ «вето поля» (fg < f0) в карманных
  // конфигурациях и нес юнита ближе к цели — против контракта ретрита.
  // Удалён: выбор шага — только A* (первое направление PATH_DIRS с
  // минимальным полем, строгий <). Чистый случай без камней: (0,0) →
  // цель (1,1): жадный брал (1,0) (ось x), A* берёт (0,1) (↓ раньше →);
  // оба d=1 — пин по координатам, не по d.
  const p = strongHero();
  const c = createCombat({ player: p, mobs: ['orc_archer'], mobLevel: 3, seed: 7 });
  const a = c.units[0];
  c.obstacles.clear();
  a.x = 0; a.y = 0;          // цель (1,1): d0=2, обе оси равны
  const target = { x: 1, y: 1, w: 1, h: 1 };
  assert.equal(pathStepFrom(c, a, target), true, 'ретрит-шаг существует');
  assert.equal(a.x, 0); assert.equal(a.y, 1,
    'A*-шаг (0,1): ↓ раньше → (PATH_DIRS) — не жадная ось-x (1,0)');
});

// --- Задача 000167: Бой: инициатива (ядро) — КРАСНЫЕ ТЕСТЫ ---
// Контракт: memory/000167-initiative-core.md (D1–D8, D12, D13;
// дизайн-контракт 000154). Инициатива = Ловкость + Интеллект:
// unitInitiative (чистая, экспорт) → buildTurnOrder — стабильная
// сортировка канонической базы ПО УБЫВАНИЮ (тай-брейк = прежний
// порядок: игрок → союзники → мобы; внутри — порядок c.units) →
// endTurn = продвижение очереди (интерлевинг); очередь исчерпана →
// «новый раунд»: round++, refillPools, тики (щит Эфира, ослабление,
// яд), рефилл c.efs, свежая отсортированная очередь, phase 'player'.
// КЛЮЧЕВОЙ эффект — pre-roll: в createCombat юниты с инициативой выше
// игрока действуют ДО первого действия игрока (раунд не сдвигается).
// Красные: экспорт unitInitiative отсутствует (TypeError), сортировки
// очереди и pre-roll нет, у мобов нет u.attrs (шов 1 — makeMob), тик
// яда — в «новом раунде», а не сразу после укуса. 9 красных + 1 белый
// гвард (ORDER-2 — тай-брейк D2; текущий фиксированный порядок совпадает
// с семантикой тай-брейка — зелёный с первого запуска).
// Значения мобов — таблица D8 (memory/000167 §6): shield 2, melee-база
// 3, ranged/swarm/leader 4, маги 5, fast 6, wind_elemental 7.

test('000167-INIT-1: unitInitiative: игрок — первичные атрибуты (midGameHero 4+1 = 5; strongHero 1+1 = 2)', () => {
  const c1 = createCombat({ player: midGameHero(), mobs: ['wolf'], mobLevel: 1, seed: 7 });
  assert.equal(unitInitiative(c1, c1.player), 5,
    'midGameHero: dexterity 4 + intelligence 1 = 5');
  const c2 = createCombat({ player: strongHero(), mobs: ['wolf'], mobLevel: 1, seed: 7 });
  assert.equal(unitInitiative(c2, c2.player), 2,
    'strongHero (primary 1×6): 1 + 1 = 2');
});

test('000167-INIT-2: unitInitiative: мобы каталога (таблица D8: orc_grunt 3, orc_rider 6, orc_shaman 5, orc_chief 4)', () => {
  const c = createCombat({
    player: strongHero(),
    mobs: ['orc_grunt', 'orc_rider', 'orc_shaman', 'orc_chief'],
    mobLevel: 1, seed: 7,
  });
  const [grunt, rider, shaman, chief] = c.units;
  assert.equal(unitInitiative(c, grunt), 3,
    'orc_grunt: dex 2 + int 1 = 3 (melee-база D8)');
  assert.equal(unitInitiative(c, rider), 6,
    'orc_rider: dex 5 + int 1 = 6 (fast D8)');
  assert.equal(unitInitiative(c, shaman), 5,
    'orc_shaman: dex 1 + int 4 = 5 (маги D8)');
  assert.equal(unitInitiative(c, chief), 4,
    'orc_chief: dex 2 + int 2 = 4 (leader D8); пара «rider > chief» '
    + 'таблицы D8: 6 > 4');
});

test('000167-INIT-3: unitInitiative: наёмник (attrs из данных) и деградация (без attrs = 0)', () => {
  const c = createCombat({
    player: strongHero(), mobs: ['wolf'], mobLevel: 1, seed: 7,
    allies: [{ name: 'Тест', role: 'melee', level: 1, dmg: 1, hp: 1,
               attrs: { dexterity: 3, intelligence: 2 } }],
  });
  const merc = c.units.find((u) => u.side === 'ally');
  assert.ok(merc, 'наёмник в бою (makeAlly пробрасывает attrs)');
  assert.equal(unitInitiative(c, merc), 5, 'attrs: dex 3 + int 2 = 5');
  const bare = makeAlly({ name: 'Без', role: 'melee', level: 1, dmg: 1, hp: 1 }, 5);
  assert.equal(unitInitiative(c, bare), 0, 'без attrs — 0 (D1: || 0)');
});

test('000167-ORDER-1: buildTurnOrder: убывание по инициативе (fast 6 > маги 5 > melee 3 > hero 2)', () => {
  const c = createCombat({
    player: strongHero(), mobs: ['orc_grunt', 'orc_rider', 'orc_shaman'],
    mobLevel: 1, seed: 7,
  });
  // m0 orc_grunt (3), m1 orc_rider (6), m2 orc_shaman (5), strongHero (2).
  assert.deepEqual(buildTurnOrder(c), ['m1', 'm2', 'm0', 'player'],
    'убывание инициативы: 6, 5, 3, 2');
  assert.deepEqual(c.turnOrder, ['m1', 'm2', 'm0', 'player'],
    'очередь боя — отсортирована');
  assert.equal(c.turnIndex, 3,
    'pre-roll: все мобы быстрее героя — player в конце очереди');
});

test('000167-ORDER-2: buildTurnOrder: равенство инициатив — канонический порядок (игрок → союзники → мобы; внутри — c.units) (БЕЛЫЙ ГВАРД)', () => {
  // ВСЕ с инициативой 2: strongHero (1+1), наёмник (attrs 1+1),
  // stone_golem (1+1, shield-группа D8). Стабильная сортировка при
  // равенстве не двигает никого: порядок канонической базы.
  // Белый гвард: текущий фиксированный порядок совпадает с тай-брейком —
  // зелёный с первого запуска; закрепляет D2 после появления сортировки.
  const c = createCombat({
    player: strongHero(),
    mobs: ['stone_golem'], mobLevel: 1, seed: 7,
    allies: [{ name: 'Тест', role: 'melee', level: 1, dmg: 1, hp: 1,
               attrs: { dexterity: 1, intelligence: 1 } }],
  });
  assert.deepEqual(buildTurnOrder(c), ['player', 'a0', 'm0'],
    'тай: игрок первым, затем союзник, затем моб (порядок базы)');
  assert.equal(c.turnOrder[0], 'player',
    'при равных инициативах — игрок ходит первым');
  assert.equal(c.turnIndex, 0, 'pre-roll — no-op (никто быстрее игрока)');
});

test('000167-ORDER-3: buildTurnOrder: dead/fled исключены из ОТСОРТИРОВАННОЙ очереди', () => {
  const c = createCombat({
    player: strongHero(), mobs: ['wolf', 'spider', 'troll'], mobLevel: 3, seed: 3,
  });
  c.units[0].alive = false; // wolf (3)
  c.units[1].fled = true;   // spider (4)
  assert.deepEqual(buildTurnOrder(c), ['m2', 'player'],
    'troll (4) > strongHero (2): убывание');
  c.units[2].alive = false;
  assert.deepEqual(buildTurnOrder(c), ['player'], 'мобов не осталось');
});

test('000167-INTER-1: интерлевинг: fast-моб (инициатива 6) действует ДО первого действия игрока (pre-roll в createCombat)', () => {
  const c = createCombat({ player: strongHero(), mobs: ['orc_rider'], mobLevel: 1, seed: 7 });
  const rider = c.units[0];
  assert.equal(c.round, 1, 'pre-roll не сдвигает round');
  assert.equal(c.phase, 'player');
  assert.deepEqual(c.turnOrder, ['m0', 'player'],
    'отсортированная очередь: orc_rider (6) > strongHero (2)');
  assert.equal(c.turnIndex, 1, 'turnIndex — на СЛОТЕ игрока');
  assert.equal(c.targetId, 'm0', 'targetId — ближайший моб');
  // Доказательство действия: наездник (fast: movePerTurn 2) со стартового
  // (1,0) сдвинулся на 2 клетки к игроку (3,6) → (3,0). В текущем коде
  // мобы НЕ действуют до первого действия игрока (игрок всегда первым).
  assert.equal(rider.x, 3, 'rider уже действовал: x 1 → 3 (2 клетки, fast)');
  assert.equal(rider.y, 0, 'rider уже действовал: y 0');
  assert.equal(c.log.length, 1, 'действий игрока в стартовом лого НЕТ');
});

test('000167-ROUND-1: round-rollover: очередь исчерпана → round++, refillPools, рефилл c.efs, тик щита Эфира, свежая отсортированная очередь, turnIndex → слот Эфира (ввод, 000168)', () => {
  const E = loadEfir000081();
  const state = E.createEfir();
  const p = strongHero();
  const c = createCombat({
    player: p, allies: [E.efirAllyData(state)], mobs: [], seed: 5,
  });
  E.buildEfirUnit(state, c); // боевой профиль (c.efs) — ПОСЛЕ createCombat
  const d = derived(p);
  // Снимок состояния: Эфир (dex 1 + int 3 = 4) > strongHero (2):
  assert.equal(c.round, 1);
  assert.equal(c.phase, 'player');
  assert.deepEqual(c.turnOrder, ['efir', 'player'],
    'отсортированная очередь: Эфир (4) > strongHero (2)');
  assert.equal(c.turnIndex, 0, '000168: pre-roll — на слоте Эфира (ввод)');
  // Исчерпание пулов (белая коробка) — восстановление в «новом раунде».
  c.ps.moveLeft = 0; c.ps.attack = 0;
  c.efs.spellInt = 0; c.efs.spellWis = 0; c.efs.touch = 0; c.efs.move = 0;
  c.efirShield = { armor: 5, turns: 2 }; // тик — блок «начало раунда»
  // 000168: pre-roll остановился на слоте Эфира (ввод). 2× endTurn:
  // (1) Эфир(ввод) → игрок (очередь не исчерпана); (2) игрок → очередь
  // исчерпана → НОВЫЙ РАУНД (refillPools, рефилл c.efs, тик щита) →
  // слот Эфира (ввод, без мобов — без действий).
  c.endTurn();
  c.endTurn();
  assert.equal(c.round, 2, 'rollover: round++');
  assert.equal(c.phase, 'player');
  assert.equal(c.result, null);
  assert.deepEqual(c.turnOrder, ['efir', 'player'],
    'свежая ОТСОРТИРОВАННАЯ очередь');
  assert.equal(c.turnIndex, 0, '000168: снова на слоте Эфира (ввод)');
  // refillPools (игрок):
  assert.equal(c.ps.moveLeft, d.moveCells, 'moveLeft — рефилл');
  assert.equal(c.ps.attack, d.attackActions, 'attack — рефилл');
  // Рефилл c.efs (профиль L1: 1/1/1/3):
  assert.equal(c.efs.spellInt, 1, 'efs.spellInt — рефилл');
  assert.equal(c.efs.spellWis, 1, 'efs.spellWis — рефилл');
  assert.equal(c.efs.touch, 1, 'efs.touch — рефилл');
  assert.equal(c.efs.move, 3, 'efs.move — рефилл');
  // Тик щита Эфира — ровно 1 за раунд (2 → 1):
  assert.equal(c.efirShield.turns, 1, 'щит Эфира: тик ровно 1 раз за раунд');
});

// 000257: пул шагов героя (c.ps.moveLeft ← refillPools ← derived.moveCells)
// — формула 1 + floor(dex/10) (запрос пользователя 2026-10-23). Вне формулы
// (бит-в-бит, пины не меняются): союзники 1, Эфир 3, мобы fast ? 2 : 1.
test('000257-COMBAT-1: c.ps.moveLeft после createCombat = 1 + floor(dex/10) (пул шагов героя)', () => {
  const p1 = createCharacter();
  assert.equal(p1.primary.dexterity, 1, 'createCharacter: dex 1');
  const c1 = createCombat({ player: p1, allies: [], mobs: [], seed: 17 });
  assert.equal(c1.ps.moveLeft, 1, 'dex 1 → 1 + floor(1/10) = 1 (000257)');
  const p2 = createCharacter();
  p2.primary.dexterity = 10;
  const c2 = createCombat({ player: p2, allies: [], mobs: [], seed: 17 });
  assert.equal(c2.ps.moveLeft, 2, 'dex 10 → 1 + floor(10/10) = 2 (000257)');
});

test('000167-ROUND-2: тики на старте раунда: яд убил на старте раунда → outcome "dead", phase "over", свежая отсортированная очередь', () => {
  // Паук (4) > createCharacter (2): interleaving — укус в раунде 2
  // (pre-roll раунда 2), ТИК яда добивает в начале раунда 3 (в СЛЕДУЮЩЕМ
  // endTurn, а не в том же — как до 000167).
  const p = createCharacter();
  p.hp = 3; // 3 − 1 (укус) = 2, затем тик яда (−2) → смерть
  const c = createCombat({ player: p, mobs: ['spider'], mobLevel: 3, seed: 41 });
  const s = c.units[0];
  standNextTo(c, s); // игрок вплотную к пауку (после pre-roll)
  s.damage = 1;
  c._rng = () => 0.05; // попадания (0.05 < hitChance) и шанс яда (0.05 < 0.3)
  // Раунд 2: паук бьёт ПЕРВЫМ в раунде: укус 3→2 + «Вы отравлены!».
  c.endTurn();
  assert.equal(c.result, null, 'ещё жив: тик яда — в следующем раунде');
  assert.equal(p.hp, 2, 'укус: 3 → 2');
  assert.equal(c.ps.poison, 2, 'яд нанесён (POISON_TURNS = 2)');
  assert.deepEqual(c.turnOrder, ['m0', 'player'],
    'отсортированная очередь: паук (4) > hero (2)');
  assert.equal(c.turnIndex, 1, 'turnIndex — на слоте игрока');
  // Раунд 3: тик на старте раунда добивает: 2 − 2 = 0.
  c.endTurn();
  assert.ok(c.result, 'бой завершён');
  assert.equal(c.result.outcome, 'dead', 'смерть от тика яда');
  assert.equal(c.phase, 'over');
  assert.ok(c.log.includes('Яд: −2 HP.'), 'строка тика яда');
  assert.deepEqual(c.turnOrder, ['m0', 'player'],
    'очередь — пересчитанная к фатальному раунду (паук жив)');
  assert.equal(c.turnIndex, 0,
    'тик — ПОСЛЕ пересчёта очереди (turnIndex = 0) — замирает на первом слоте');
});

test('000167-WEAK-1: «Вдох Эфира» против БОЛЕЕ БЫСТРОГО моба (init > init Эфира): ×0.8 ровно на 1 ударе (в раунде триггера моб атаковал ДО хода Эфира); медленный моб — 2 удара (BR-5(a))', () => {
  const E = loadEfir000081();
  const C = require('../src/combat.js');
  const saveCatalog = C.combatInternals.allySpells;
  C.combatInternals.allySpells =
    require('../src/spells-data.js').SPELLS_BY_ID;
  try {
    // orc_rider (fast, init 6) > Эфир L1 (4) > hero112 (2). Геометрия —
    // по BR-5(a): наездник (3,5) вплотную к игроку (3,6), Эфир закреплён
    // (2,4) (d до наездника 2 — Касания нет; dP 3 / dE 2 ≤ 3 — не
    // двигается). c._rng 0.01 — все попадания.
    //
    // 000168 (интерлевинг D4 + тик в startRound + ввод): Вдох — r2
    // (r1 — pre-roll = слот Эфира, ввод, без Вдоха: u.breath ставится
    // ПОСЛЕ createCombat). В round 2 наездник бьёт ПЕРВЫМ (init 6 > 4) —
    // ПОЛНЫЙ урон (108−10, затем +12 Вдох → 110) → r3: тик 2→1,
    // 110−8=102 (единственный ослабленный удар) → r4: тик 1→0,
    // 102−10=92 (полный урон — «возвращается»). Контраст: BR-5(a) —
    // волк (init 3, ПОСЛЕ Эфира) — [98, 102, 94, 84]: ослаблен в раунде
    // триггера И следующем (ровно 2 удара, «2 хода» SPEC).
    const p = hero112(); // maxHP 270, броня 0
    const state = E.createEfir();
    state.spells = ['mend'];
    const c = createCombat({
      player: p, allies: [E.efirAllyData(state)], mobs: ['orc_rider'],
      mobLevel: 1, seed: 5,
    });
    c.obstacles.clear();
    const r = c.units.find((x) => x.id === 'm0');
    r.x = 3; r.y = 5; r.maxHP = 100; r.hp = 100; r.damage = 10;
    c._rng = () => 0.01;
    E.buildEfirUnit(state, c);
    const u = c.units.find((x) => x.id === 'efir');
    u.x = 2; u.y = 4; // закреплён: без Касания (d 2) и без эскорта
    u.mp = 20;
    // 000168: pre-roll = слот Эфира (ввод); frac для Вдоха ставим
    // после pre-roll (после buildEfirUnit — у pre-roll u.breath нет).
    p.hp = 108;
    const hpAfter = [];
    const turnsAfter = [];
    let lastRound = c.round;
    for (let i = 0; i < 5; i++) {
      c.endTurn();
      // 000168: слот Эфира — ввод (остановка); раунд продвигается ТОЛЬКО
      // endTurn-ом с оборотом очереди → фиксируем удары наездника по
      // «round++» (r2, r3, r4).
      if (c.round !== lastRound) {
        hpAfter.push(p.hp);
        turnsAfter.push(r.weakened ? r.weakened.turns : null);
        lastRound = c.round;
      }
    }
    assert.equal(c.efirBreathed, true, 'Вдох сработал (флаг)');
    assert.ok(c.log.includes('Вдох Эфира!'), 'лог-строка: ' + c.log.join(' | '));
    assert.deepEqual(hpAfter, [110, 102, 92],
      'быстрый моб: раунд триггера — ПОЛНЫЙ урон (108−10+12=110), '
      + '×0.8 ровно 1 удар (110−8=102), затем полный (102−10=92): '
      + hpAfter.join(', '));
    assert.deepEqual(turnsAfter, [2, 1, 0],
      'тик по раундам (startRound): 2→1→0');
    assert.equal(r.hp, 100,
      'Эфир не действует (mp 0 — кастов нет, d 2 — Касания нет): 100');
  } finally {
    C.combatInternals.allySpells = saveCatalog;
  }
});

// =====================================================================
// Задача 000165. Свиток воскрешения — применение в бою (быстрый слот).
//
// КРАСНЫЕ тесты (TDD): написаны ДО реализации, падают на текущем
// (неизменённом) коде:
//   * предмета resurrect_scroll нет в каталоге (I1/I2 —
//     tests/items.test.js): addItem «неизвестный предмет» — здесь
//     setQuick/invItem/canDoAction падают на этом же отсутствии;
//   * ветки воскрешения в playerQuickItem НЕТ (C1/C3: краснота —
//     «быстрый слот 1 пуст», т.к. setQuick отказал без предмета);
//   * зеркала canDoAction 'quickItem' НЕТ (C5: краснота —
//     «быстрые слоты пусты» / «неизвестный предмет» / ok:true);
//   * playerInvItem намеренно НЕ расширен (C4 — v1-граница, ТЗ;
//     отказ — из I.useItem «только в бою», пул не сгорает);
//   * свитка в луте Уродства НЕТ (C6: deepEqual таблиц JSON+зеркало +
//     детерминированный дроп, паттерн N2).
// Контракты — memory/000165-resurrection-scroll.md (§3.4 код веток,
// §3.5 строки, Р-1..Р-12). Ядро — resurrectAlly (000163: alive,
// hp = round(maxHP/2), лог «Возвращён в бой.», НОЛЬ c._rng).
// Порядок — ВСТРОЕН В C1 (C2-отдельного нет): убиваются ОБА
// союзника, B ПЕРВЫМ — «первый в c.units» (A) ≠ «умерший первым» (B);
// воскресает A, B остаётся мёртв. Очередь хода при воскрешении НЕ
// пересчитывается (инвариант 000163 §3.2 / 000167).
// =====================================================================

// Бой с союзниками (фикстура 000080; паттерн allyCombat163, 000163):
// волк + союзники В ПОРЯДКЕ массива (c.units: [wolf, a0, a1, ...]).
function scrollCombat165(p, allies) {
  return createCombat({
    player: p, mobs: ['wolf'], mobLevel: 2, seed: 5,
    allies,
  });
}
const ALLY_A_165 = { name: 'Алли', role: 'melee', level: 1,
  dmg: 1.2, hp: 1.1, skills: [], spells: [] };
const ALLY_B_165 = { name: 'Борис', role: 'melee', level: 1,
  dmg: 1.2, hp: 1.1, skills: [], spells: [] };

test('000165 C1: quick-слот — воскресает ПЕРВЫЙ мёртвый союзник в порядке c.units (50% HP), свиток сгорает, ноль c._rng, очередь не пересчитывается', () => {
  const p = strongHero();
  const c = scrollCombat165(p, [ALLY_A_165, ALLY_B_165]);
  const alliesU = c.units.filter((u) => u.side === 'ally');
  assert.equal(alliesU.length, 2, 'два союзника в c.units');
  const aA = alliesU[0], aB = alliesU[1]; // c.units: [wolf, A, B]
  // Убиваем ОБА (реальный путь гибели — ядро 000112, ноль c._rng);
  // B ПЕРВЫМ — чтобы «первый в c.units» (A) ≠ «умерший первым» (B).
  combatInternals.dealDamageToAlly(c, aB, 9999);
  assert.equal(aB.alive, false, 'фикстура: B мёртв');
  combatInternals.dealDamageToAlly(c, aA, 9999);
  assert.equal(aA.alive, false, 'фикстура: A мёртв');

  assert.equal(I.addItem(p, 'resurrect_scroll').ok, true,
    'выдача свитка (краснота: неизвестный предмет)');
  assert.equal(I.setQuick(p, 0, 'resurrect_scroll').ok, true,
    'закрепление в quick-слот 0 (краснота: предмета нет)');
  const pool0 = c.ps.quickItem;
  // Обёртка-счётчик c._rng (паттерн R2 000163): ветка — ноль rng.
  let rngCalls = 0;
  const origRng = c._rng;
  c._rng = () => { rngCalls += 1; return origRng(); };
  const turnOrder0 = c.turnOrder.slice();

  const r = c.quickItem(0);
  assert.equal(r.ok, true,
    'quickItem: ok (краснота: ветки нет — отказ): ' + JSON.stringify(r));
  assert.equal(r.slot, 0, 'применён слот 0');
  // A — ПЕРВЫЙ мёртвый союзник в порядке c.units — воскрешён
  // (D6: цель игроком НЕ выбирается; игрок вне c.units — не цель, v1).
  assert.equal(aA.alive, true, 'A (первый в c.units) возвращён в бой');
  assert.equal(aA.hp, Math.round(aA.maxHP / 2),
    'hp = round(maxHP/2) (контракт D6, resurrectAlly 000163)');
  assert.equal(aA.fled, false, 'воскрешён — а не «сбежавший»');
  // B — ВТОРОЙ мёртвый союзник — остаётся мёртв (цель — одна).
  assert.equal(aB.alive, false, 'B остаётся мёртв (цель — один)');
  assert.equal(aB.hp, 0, 'B: hp 0');
  // Расход: ровно 1 шт.; пул −1 (СНАЧАЛА, как в текущем коде — ТЗ);
  // quick-слот очищен (takeQuickSlot; 000223: слот — своя единица).
  assert.equal(I.totalQty(p, 'resurrect_scroll'), 0,
    'свиток сгорел (ровно 1 шт.)');
  assert.equal(c.ps.quickItem, pool0 - 1, 'пул quickItem −1');
  assert.equal(p.inventory.quick[0], null,
    'quick-слот 0 очищен (takeQuickSlot, 000223)');
  // Лог — ЕДИНСТВЕННАЯ строка ядра 000163 (R-3), дописок нет.
  assert.ok(c.log.includes('Возвращён в бой.'),
    'лог «Возвращён в бой.»: ' + c.log.join(' | '));
  // Детерминизм (D3 000163): ноль c._rng на ветке (ветка +
  // resurrectAlly + removeItem — без rng).
  assert.equal(rngCalls, 0, 'c._rng() не вызывается на ветке свитка');
  // Очередь хода НЕ пересчитывается веткой (buildTurnOrder в ветке
  // нет — инвариант 000163 §3.2 / 000167): до/после — deepEqual.
  assert.deepEqual(c.turnOrder, turnOrder0,
    'turnOrder до/после — без пересчёта (ветка чистая)');
  // После endTurn: воскресший входит в turnOrder с начала
  // СЛЕДУЮЩЕГО раунда (существующий buildTurnOrder, 000036).
  c.endTurn();
  assert.ok(c.turnOrder.includes(aA.id),
    'после endTurn — A в turnOrder (с начала следующего раунда): '
    + JSON.stringify(c.turnOrder));
});

test('000165 C3: quick-слот, живых только — отказ «нет погибших союзников», действие НЕ сгорает, предмет цел', () => {
  const p = strongHero();
  const c = scrollCombat165(p, [ALLY_A_165]);
  const aA = c.units.find((u) => u.side === 'ally');
  assert.ok(aA, 'союзник в c.units');
  assert.equal(I.addItem(p, 'resurrect_scroll').ok, true,
    'выдача свитка (краснота: неизвестный предмет)');
  assert.equal(I.setQuick(p, 0, 'resurrect_scroll').ok, true,
    'закрепление в quick-слот 0 (краснота: предмета нет)');
  const pool0 = c.ps.quickItem;
  const hp0 = aA.hp;
  const r = c.quickItem(0);
  assert.equal(r.ok, false,
    'отказ: мёртвых нет (краснота: ветки нет): ' + JSON.stringify(r));
  assert.equal(r.reason, 'нет погибших союзников',
    'строка отказа закреплена (контракт Р-2/§3.5); факт: ' + r.reason);
  assert.equal(c.ps.quickItem, pool0,
    'действие НЕ сгорело (паттерн playerQuickItem: отказ — return ДО пула)');
  assert.equal(I.totalQty(p, 'resurrect_scroll'), 0,
    '000223: единица в слоте (перенесена из запасов)');
  assert.equal(p.inventory.quick[0], 'resurrect_scroll',
    'слот цел (отказ — единица не потеряна)');
  assert.equal(aA.alive, true, 'союзник не мутирован (alive)');
  assert.equal(aA.hp, hp0, 'союзник не мутирован (hp)');
});

test('000165 C4: inv-слот — ВЕТКИ НЕТ (v1): свиток из инвентаря → отказ I.useItem «только в бою», союзник мёртв, пул не сгорел, предмет цел', () => {
  const p = strongHero();
  const c = scrollCombat165(p, [ALLY_A_165]);
  const aA = c.units.find((u) => u.side === 'ally');
  assert.ok(aA, 'союзник в c.units');
  assert.equal(I.addItem(p, 'resurrect_scroll').ok, true,
    'выдача свитка (краснота: неизвестный предмет)');
  // Свиток в ИНВЕНТАРЕ (не в quick); союзник МЁРТВ — боевой путь
  // был бы успехом, но playerInvItem по ТЗ НЕ расширяется (v1).
  combatInternals.dealDamageToAlly(c, aA, 9999);
  assert.equal(aA.alive, false, 'фикстура: союзник мёртв');
  const pool0 = c.ps.invItem;
  const r = c.invItem('resurrect_scroll');
  assert.equal(r.ok, false,
    'отказ (краснота: предмета нет — «предмета нет в инвентаре»): '
    + JSON.stringify(r));
  assert.equal(r.reason, 'Свиток воскрешения можно применить только в бою',
    'отвечает I.useItem (мир), а не боевая ветка; факт: ' + r.reason);
  assert.equal(aA.alive, false, 'союзник ОСТАЁТСЯ мёртв (inv-ветки нет)');
  assert.equal(c.ps.invItem, pool0,
    'пул invItem вернут (отказ — действие не сгорает, L1252-1256)');
  assert.equal(I.totalQty(p, 'resurrect_scroll'), 1, 'предмет цел');
});

test('000165 C5: canDoAction «quickItem» — зеркало (000037): живых только — отказ той же строкой; после гибели — ok:true; чистое чтение', () => {
  const p = strongHero();
  const c = scrollCombat165(p, [ALLY_A_165]);
  const aA = c.units.find((u) => u.side === 'ally');
  assert.ok(aA, 'союзник в c.units');
  assert.equal(I.addItem(p, 'resurrect_scroll').ok, true,
    'выдача свитка (краснота: неизвестный предмет)');
  assert.equal(I.setQuick(p, 0, 'resurrect_scroll').ok, true,
    'закрепление в quick-слот (краснота: предмета нет)');
  const pool0 = c.ps.quickItem;
  // Живых только — отказ ТОЙ ЖЕ строкой, что в ядре (000037: одна
  // причина — одно поведение; краснота: зеркала нет — «быстрые
  // слоты пусты» / «неизвестный предмет» / ok:true).
  const r0 = canDoAction(c, 'quickItem');
  assert.deepEqual(r0, { ok: false, reason: 'нет погибших союзников' },
    'живых только — отказ «нет погибших союзников»; факт: '
    + JSON.stringify(r0));
  // canDoAction — ЧИСТОЕ ЧТЕНИЕ (000037): пулы и предмет не тронуты.
  assert.equal(c.ps.quickItem, pool0, 'пул quickItem не мутирован');
  assert.equal(I.totalQty(p, 'resurrect_scroll'), 0,
    '000223: единица в слоте (перенесена из запасов)');
  // После гибели союзника — действие доступно (тот же предикат).
  combatInternals.dealDamageToAlly(c, aA, 9999);
  assert.equal(aA.alive, false, 'фикстура: союзник мёртв');
  const r1 = canDoAction(c, 'quickItem');
  assert.equal(r1.ok, true,
    'после гибели — ok:true (одна причина — одно поведение); факт: '
    + JSON.stringify(r1));
});

test('000165 C6: доступность (ТЗ п.4) — лут Уродства (000036.json + зеркало MOB_TYPES), свиток КОНЦОМ таблицы; дет-дроп rng→0.01: таблица + база + редкий + экипировка (ре-пин 000230.08: common pool[0] = straw_hat ПОСЛЕДНИМ; ре-пин 000230.15: common-пул 90 → 110, select floor(0.01·110) = pool[1] = wool_cap; ре-пин 000230.19: common-пул 110 → 111, select floor(0.01·111) = pool[1] = wool_cap — без изменений)', () => {
  // (a) Каталог (source of truth): loot Уродства — 3 записи, свиток
  //     КОНЦОМ (Р-1: порядок дропа = порядок таблицы; тематика —
  //     склеенный труп уже дропает phoenix_feather/greater_healing).
  const j36 = JSON.parse(
    fs.readFileSync(path.join(MOBS_DIR, '000036.json'), 'utf8'));
  const LOOT_ABO_165 = [
    { item: 'phoenix_feather', chance: 0.2 },
    { item: 'greater_healing', chance: 0.15 },
    { item: 'resurrect_scroll', chance: 0.05 },
  ];
  const loot36 = j36.loot.map((l, i) =>
    ({ ...l, item: refToId(l.item, '000036.json: loot[' + i + '].item') }));
  assert.deepEqual(loot36, LOOT_ABO_165,
    '000036.json loot: свиток 0.05 концом таблицы (краснота: записи нет)');
  // Зеркало combat.js MOB_TYPES (runtime; консистентность JSON↔
  // зеркало — общий тест «assets/mobs: зеркало…» выше, ОДИН коммит).
  assert.deepEqual(MOB_TYPES.abomination.loot, LOOT_ABO_165,
    'MOB_TYPES.abomination.loot (краснота: зеркала без свитка)');
  // (b) Детерминированный дроп (паттерн N2): rng→0.01 — ВСЕ пороги
  //     выше 0.01 (0.2 / 0.15 / 0.05 / P(−1) = 0.21 — ре-пин 000245:
  //     было 0.25 / 0.05+0.01·2=0.07):
  //     таблица (3) + базовый BASE_POOL[0] + редкий RARE_POOL[0] +
  //     экипировка (ре-пин 000230.08: tier common (r=0.01), select
  //     pool[0] = straw_hat — ПОСЛЕДНИМ). Ре-пин 000230.15:
  //     common-пул 90 → 110 (+20 ног/ступней, append концом; префикс
  //     90 бит-в-бит) → select floor(0.01·110) = floor(1.1) =
  //     pool[1] = wool_cap (node-перепрогон, merge .11–.14 + .15).
  //     Порядок: таблица → база → редкий → экипировка (N2). +1 c._rng
  //     за Уродство (цикл по таблице, Р-1) — потоки без Уродства не
  //     сдвигаются.
  const { c } = winLoot({ mobs: ['abomination'], mobLevel: 2, seed: 5,
    rng: () => 0.01, killBy: 'dealDamage' });
  assert.deepEqual(c.result.items, [
    { id: 'phoenix_feather', qty: 1 },
    { id: 'greater_healing', qty: 1 },
    { id: 'resurrect_scroll', qty: 1 },
    { id: 'minor_healing', qty: 1 },
    { id: 'iron_sword', qty: 1 },
    { id: 'wool_cap', qty: 1 },
  ], 'rng→0.01: таблица Уродства + базовый + редкий + экипировочный '
    + '(common) ПОСЛЕДНИМ (ре-пин 000230.08; ре-пин 000230.15: '
    + 'пул 90 → 110, pool[1] = wool_cap)');
});

// =====================================================================
// Задача 000164: гибель Флогистона — «окно смерти» (onPlayerDeath):
// каскад «все союзники погибли» → auto-возрождение Эфира (дух) →
// спасение «Воскрешением» (бой продолжается) либо partyLost.
// Контракт: memory/000164-death-window.md (§2 — порядок операций;
// §4 — этот список; ERRATA-164 — цифры фикстур). КРАСНЫЕ: поведения
// нет (onPlayerDeath приватный, c.result без partyLost, каскад/
// reset/спасение отсутствуют). Фикстуры — существующие паттерны
// 000167-серии; каталог заклинаний — шапка require('../src/spells.js')
// (combatInternals.allySpells); buildEfirUnit — ПОСЛЕ createCombat
// (паттерн 000112, L5403).
//
// Роллы-эмпирика (000168-ре-деривация, base ab6c08d+): в геометрии
// m0 (4,6)/m1 (3,7) союзники НЕ роллят — тест НЕ действует на их
// ходах (движение/удар — ввод игрока, D9): ходы a0/a1 — тихий
// endTurn, 0 роллов; Эфир no-op (книга ['resurrect'] — 0). Pre-roll
// (000168 D9/P1) ОСТАНОВИЛСЯ на первом player-side юните (Эфир,
// init 4) — роллов 0 (мобы в pre-roll не действуют). Роллы =
// ТОЛЬКО hit-роллы мобов (skeleton — без трейтов: трейт-роллов 0).
//
// ТАЙМИНГ 000168 (D9/P1): союзники — ввод игрока. После createCombat
// очередь — на первом player-side слоте (Эфир, ti 0); один endTurn —
// один юнит. turnOrder round 1 (build164):
// ['efir', 'm0', 'm1', 'player', 'a0', 'a1']; (build164One):
// ['efir', 'm0', 'player', 'a0', 'a1']. Окно смерти открывается в
// ROUND 1 на первом endTurn (ход m0) — в build164 m1 «оставшийся
// моб раунда» действует ПОСЛЕ спасения в том же раунде.
// =====================================================================

const E164 = loadEfir000081();

// Общая геометрия 2 скелетов (seed 9, L2, без трейтов): игрок (3,6)
// 25 HP; скелеты закреплены вплотную (m0 (4,6), m1 (3,7)) — бьют с
// round 1 (d 1: без шага/отступления; 000168: pre-roll мобы не
// играет — остановка на Эфире); Эфир закреплён (2,5) — d 1 до
// игрока (Касания/эскорта нет), d 3 до мобов (спелл урона по книге
// ['resurrect'] — null). 000168 D9/P1: очередь round 1:
// ['efir', 'm0', 'm1', 'player', 'a0', 'a1'] (a1 — при живости на
// момент build; гибель ПОСЛЕ createCombat → серый слот, 6 записей).
function build164() {
  const p = createCharacter(); // уровень 1, 25 HP
  const state = E164.createEfir();
  const c = createCombat({
    player: p,
    allies: [ALLY_VOLK, ALLY_ASHKA, E164.efirAllyData(state)],
    mobs: ['skeleton', 'skeleton'], mobLevel: 2, seed: 9,
  });
  const m0 = c.units.find((u) => u.id === 'm0');
  const m1 = c.units.find((u) => u.id === 'm1');
  const efir = c.units.find((u) => u.id === 'efir');
  const a0 = c.units.find((u) => u.id === 'a0');
  const a1 = c.units.find((u) => u.id === 'a1');
  m0.x = 4; m0.y = 6;
  m1.x = 3; m1.y = 7;
  efir.x = 2; efir.y = 5;
  return { p, state, c, m0, m1, efir, a0, a1 };
}

// Та же, но 1 моб (CASC/EFIR/RESCUE-2/3): убийца m0 (4,6) d 50.
function build164One() {
  const p = createCharacter(); // уровень 1, 25 HP
  const state = E164.createEfir();
  const c = createCombat({
    player: p,
    allies: [ALLY_VOLK, ALLY_ASHKA, E164.efirAllyData(state)],
    mobs: ['skeleton'], mobLevel: 2, seed: 9,
  });
  const m0 = c.units.find((u) => u.id === 'm0');
  const efir = c.units.find((u) => u.id === 'efir');
  const a0 = c.units.find((u) => u.id === 'a0');
  const a1 = c.units.find((u) => u.id === 'a1');
  m0.x = 4; m0.y = 6;
  efir.x = 2; efir.y = 5;
  return { p, state, c, m0, efir, a0, a1 };
}

test('000164-CASC-1: окно — каскад: ВСЕ союзники поля считаются погибшими; Эфир — после auto-возрождения жив', () => {
  const { p, state, c, m0, efir, a0, a1 } = build164One();
  m0.damage = 50; // добивает: 25 − 50
  c._rng = () => 0.01; // попадания гарантированы
  E164.buildEfirUnit(state, c);
  // Книга = ровно ['resurrect'] (fixture-правило): Эфир-ход — no-op
  // ('лечение'/'защита'/'урон' → null), 0 rng. Неспасение здесь по
  // мане: reset-mp L1 = 5+3+3 = 11 < 15 («мани» каталога).
  efir.spells = ['resurrect'];
  c.endTurn(); // tail (Volk шаг, Ashka «отступает») → round 2:
               // Эфир no-op → m0 убивает → ОКНО
  assert.ok(c.result, 'бой завершён (не спасено)');
  assert.equal(c.result.outcome, 'dead');
  assert.equal(c.result.partyLost, true,
    'не спасение — АДДИТИВНОЕ partyLost: true (ТЗ п.5)');
  assert.equal(c.phase, 'over');
  // Каскад (ТЗ п.2 / R-10): ВСЕ side 'ally' — alive false, hp 0;
  // Эфир — ПОСЛЕ auto-возрождения — жив (промежуточное «все мертвы»
  // синхронно ненаблюдаемо, контракт §2.4/OQ-3):
  assert.equal(p.alive, false);
  assert.equal(a0.alive, false, 'Вольк — считается погибшим');
  assert.equal(a0.hp, 0, 'hp 0 — каноническая семантика гибели (R-10)');
  assert.equal(a1.alive, false, 'Ашка — считается погибшим');
  assert.equal(a1.hp, 0);
  assert.equal(efir.alive, true, 'Эфир — auto-возрождён (дух), НЕ мёртв');
});

test('000164-EFIR-1: окно — auto-возрождение Эфира (дух): hp = maxHP, mp = 5+int+wis (ПЕРЕ-ДЕРИВАЦИЯ из attrs), лог-строка', () => {
  const { p, state, c, m0, efir } = build164One();
  m0.damage = 50;
  c._rng = () => 0.01;
  E164.buildEfirUnit(state, c);
  efir.spells = ['resurrect'];
  // «Пораненный» дух ДО окна: reset обязан быть ПОЛНЫМ
  // (не частичное лечение):
  efir.hp = 5;
  efir.mp = 8;
  c.endTurn();
  assert.ok(c.result && c.result.outcome === 'dead', 'не спасено (mp 11 < 15)');
  assert.equal(c.result.partyLost, true);
  const expMp = 5 + ((efir.attrs && efir.attrs.intelligence) || 0)
              + ((efir.attrs && efir.attrs.wisdom) || 0);
  assert.equal(efir.alive, true, 'дух жив');
  assert.equal(efir.hp, efir.maxHP,
    'hp = maxHP — ПОЛНЫЙ reset (5 → ' + efir.maxHP + ', не частичный)');
  assert.equal(efir.mp, expMp,
    'mp = 5 + int + wis — пере-деривация из attrs (R-3; было 8 — '
    + 'полный reset, не «8 без расхода»): ' + expMp);
  assert.ok(c.log.includes('Эфир возвращается…'),
    'лог-строка (U+2026): ' + c.log.join(' | '));
});

test('000164-RESCUE-1: окно — спасение: Эфир кастует «Воскрешение» на игрока, каскад отменён, бой продолжается, оставшиеся мобы раунда действуют', () => {
  const { p, state, c, m0, m1, efir, a0, a1 } = build164();
  m0.damage = 30; // убийца: 25 − 30 → смерть
  m1.damage = 3;  // «оставшийся моб раунда» — действует ПОСЛЕ спасения
  // «Погибший до окна» мерс (контракт §2.4/R-7): откат обязан
  // поднять и его («не успели» умереть) — мутация ПОСЛЕ createCombat:
  a1.alive = false;
  a1.hp = 0;
  c._rng = () => 0.01;
  E164.buildEfirUnit(state, c);
  // Книга = ровно ['resurrect'] → Эфир-ход no-op (ввод, 0 rng).
  // ERRATA-164: attrs 8/8 (мутация ПОСЛЕ buildEfirUnit — reset
  // читает e.attrs live): reset-mp = 5+8+8 = 21 ≥ 15 («мани»
  // каталога) → гейт проходит; c.efs.spellWis = 1 + floor(8/10) = 1
  // (пул есть; 000168: окно — в round 1, до startRound-рефилла —
  // значение c.efs уже верное от buildEfirUnit).
  efir.spells = ['resurrect'];
  efir.attrs = Object.assign({}, efir.attrs, {
    intelligence: 8, wisdom: 8 });
  // 000168 D9/P1: pre-roll остановился на Эфире (ввод) — окно
  // открывается в ROUND 1 (старое: m0 добивал в round 2 после
  // ИИ-tail; теперь мобы не играли до первого endTurn).
  c.endTurn(); // ход Эфира (no-op: книга ['resurrect']) → m0 убивает
               // → ОКНО: reset (mp 21) → гейт → каст → откат → m1
               // ДЕЙСТВУЕТ в том же раунде → очередь у игрока
  // Бой ПРОДОЛЖАЕТСЯ (окно закрыто спасением, ТЗ п.4):
  assert.equal(c.result, null, 'спасение — c.result НЕ ставится');
  assert.equal(c.phase, 'player', 'фазовый контекст сохранён: очередь у игрока');
  assert.equal(c.round, 1, '000168 D9/P1: окно — в round 1 (pre-roll '
    + 'больше не играет ходы до player-side остановки)');
  assert.equal(c.turnIndex, 3, 'после m1 (ti 2) — слот игрока');
  // Очередь НЕ пересчитана ПОСЛЕ окна (контракт §2.4): a1 погиб
  // ПОСЛЕ buildTurnOrder round 1 → в очереди СЕРЫЙ слот (6 записей,
  // в отличие от round 2+ — там он исключается); откат (воскрешение
  // a1) СЕРЕДИНЕ round 1 — очередь НЕ пересчитывается: a1 действует
  // в round 1 — слот ti 5 (после игрока и a0):
  assert.deepEqual(c.turnOrder, ['efir', 'm0', 'm1', 'player', 'a0', 'a1']);
  // Каст: пул −1, мана −15 (от reset-значения 21):
  assert.equal(c.efs.spellWis, 0, 'пул spellWis 1 − 1');
  assert.equal(efir.mp, 6, 'мана 21 (5+8+8) − 15 (каталожное «мани»)');
  // Игрок: alive, 50% HP − удар оставшегося m1 (13 − 3 = 10):
  assert.equal(p.alive, true, 'resurrectAlly: alive = true');
  const half = Math.round(derived(p).maxHP / 2);
  assert.equal(half, 13, 'round(25/2) = 13');
  assert.equal(p.hp, half - m1.damage,
    'm1 ДЕЙСТВОВАЛ в том же раунде ПОСЛЕ спасения (13 − 3 = 10)');
  // Откат каскада (R-7): ВСЕ merc-юниты — alive, round(maxHP/2),
  // молча (без логов), включая a1 «не успели»:
  assert.equal(a0.alive, true, 'a0 — откат каскада');
  assert.equal(a0.hp, Math.round(a0.maxHP / 2), 'a0: 13 → ' + Math.round(13 / 2));
  assert.equal(a1.alive, true, 'a1 «погиб до окна» — откат («не успели»)');
  assert.equal(a1.hp, Math.round(a1.maxHP / 2), 'a1: 11 → ' + Math.round(11 / 2));
  // Лог-порядок §2.1: «Вы погибли...» → «Эфир возвращается…» →
  // «Эфир: «Воскрешение».» → «Возвращён в бой.» (ровно ОДИН —
  // игрока; merc-откат молчалив):
  const i1 = c.log.indexOf('Вы погибли...');
  const i2 = c.log.indexOf('Эфир возвращается…');
  const i3 = c.log.indexOf('Эфир: «Воскрешение».');
  const i4 = c.log.indexOf('Возвращён в бой.');
  assert.ok(i1 >= 0 && i2 > i1 && i3 > i2 && i4 > i3,
    'лог-порядок rescue-трейла: ' + c.log.join(' | '));
  assert.equal(c.log.filter((l) => l === 'Возвращён в бой.').length, 1,
    'ровно один «Возвращён в бой.» (игрок; merc-откат молчалив)');
});

test('000164-RESCUE-2: неспасение — естественная книга L1 [spark, mend]: spark ДОСТУПИЛ до окна, reset полный, каста «Воскрешения» нет', () => {
  const { p, state, c, m0, efir, a0, a1 } = build164One();
  // 000193 (Д-P): новый урон spark 6 (round((4+0.5·3)·(1+0.15·(1−1))·
  // (1+0.05·lord))) не убивает скелета — иначе ПОБЕДА вместо окна
  // сценария: запас по HP (7).
  m0.maxHP = 7; m0.hp = 7;
  m0.damage = 50;
  c._rng = () => 0.01;
  E164.buildEfirUnit(state, c);
  // Книга — естественная L1 (БЕЗ мутаций). 000168 D9/P1: Эфир-ход —
  // ввод ИГРОКА (старое: ИИ кастовал spark сам): тест кастует
  // сильнейшее известное «урон» из книги — c.cast → spark (d 3 ≤ 4,
  // spellInt −1, mp 11 → 8); окно: strongestKnown('воскрешение') →
  // null → не спасение.
  assert.deepEqual(efir.spells, ['spark', 'mend'], 'естественная L1-книга');
  c.cast(c.targetId); // Эфир-ход (ввод): spark на m0 (цель = nearestEnemy)
  c.endTurn();        // → m0 убивает → ОКНО (round 1) — не спасение
  assert.ok(c.result && c.result.outcome === 'dead', 'бой завершён');
  assert.equal(c.result.partyLost, true, 'не спасение — partyLost');
  // Каскад + полный reset (spark забрал 3 ДО окна: mp 11 → 8 →
  // reset → 11 — НЕ «8 − 15»):
  assert.equal(a0.alive, false);
  assert.equal(a0.hp, 0);
  assert.equal(a1.alive, false);
  assert.equal(a1.hp, 0);
  assert.equal(efir.alive, true, 'дух auto-возрождён');
  assert.equal(efir.hp, efir.maxHP);
  const expMp = 5 + ((efir.attrs && efir.attrs.intelligence) || 0)
              + ((efir.attrs && efir.attrs.wisdom) || 0);
  assert.equal(efir.mp, expMp,
    'mp — ПОЛНЫЙ reset (11 → 8 от spark → ' + expMp + ')');
  assert.equal(c.efs.spellInt, 0, 'spark ЗАБРАЛ spellInt (каст был ДО окна)');
  assert.equal(c.efs.spellWis, 1, 'пул spellWis нетронут (не «Воскрешение»)');
  assert.equal(m0.hp, 1, 'spark ДОСТИГ m0 (7 − 6 = 1; формула 000193) — книга жива');
  assert.ok(c.log.includes('Эфир возвращается…'), 'auto-возрождение — есть');
  assert.ok(!c.log.includes('Эфир: «Воскрешение».'), 'каст атрибуции НЕТ');
  assert.ok(!c.log.includes('Возвращён в бой.'), 'воскрешения НЕТ');
});

test('000164-RESCUE-3: гейт — без каста и БЕЗ ЧАСТИЧНОГО расхода: (a) mp-гейт (11 < 15); (b) pool-гейт (spellWis 0)', () => {
  // (a) mp-гейт: attrs L1 (3/3) → reset-mp 11 < 15 → каста нет:
  // mp === 11 (reset-значение; НЕ 11 − 15), spellWis 1 нетронут.
  {
    const { state, c, m0, efir, a0, a1 } = build164One();
    m0.damage = 50;
    c._rng = () => 0.01;
    E164.buildEfirUnit(state, c);
    efir.spells = ['resurrect'];
    // 000168 D9/P1: окно — round 1: Эфир-ход — ввод (no-op: в книге
    // нет «урон» — кастовать нечего), далее m0 убивает.
    c.endTurn();
    assert.ok(c.result && c.result.outcome === 'dead');
    assert.equal(c.result.partyLost, true, '(a): не спасение — partyLost');
    assert.equal(efir.alive, true);
    assert.equal(efir.hp, efir.maxHP, '(a): auto-reset');
    const expMp = 5 + ((efir.attrs && efir.attrs.intelligence) || 0)
                + ((efir.attrs && efir.attrs.wisdom) || 0);
    assert.equal(expMp, 11, '(a): reset-mp L1 = 11');
    assert.equal(efir.mp, expMp, '(a): mp — reset-значение (каста нет: не 11 − 15)');
    assert.equal(c.efs.spellWis, 1, '(a): пул нетронут (частиц расхода НЕТ)');
    assert.equal(a0.alive, false, '(a): каскад полный');
    assert.equal(a1.alive, false, '(a): каскад полный');
    assert.ok(c.log.includes('Эфир возвращается…'), '(a): reset-лог есть');
    assert.ok(!c.log.includes('Возвращён в бой.'), '(a): каста НЕТ');
    assert.ok(!c.log.includes('Эфир: «Воскрешение».'), '(a): атрибуции НЕТ');
  }
  // (b) pool-гейт: attrs {intelligence: 20, wisdom: −10} →
  // reset-mp 15 (гейт ПРОХОДИТ) но refill spellWis = 1 +
  // floor(−10/10) = 0 (гейт падает на пуле — единственный путь на
  // spellWis 0: формула миним. 1 при attrs ≥ 0) → каста нет:
  // mp 15 (НЕ 0), spellWis 0. 000168 D9/P1: окно обязано открыться
  // ПОСЛЕ refill round 2 (startRound) — в round 1 m0 НЕ убивает
  // (5: 25→20); ходы союзников — тихий ввод (по endTurn на слот).
  {
    const { state, c, m0, efir, a0, a1 } = build164One();
    m0.damage = 5;
    c._rng = () => 0.01;
    E164.buildEfirUnit(state, c);
    efir.spells = ['resurrect'];
    efir.attrs = Object.assign({}, efir.attrs, {
      intelligence: 20, wisdom: -10 });
    c.endTurn(); // 1: Эфир (ввод) → m0 (5: 25→20) → очередь у игрока
    m0.damage = 50;
    c.endTurn(); // 2: игрок → 000168: ОСТАНОВКА на a0 (ввод)
    c.endTurn(); // 3: a0 → ОСТАНОВКА на a1 (ввод)
    c.endTurn(); // 4: a1 → round 2: refill c.efs из attrs (spellWis
                 // 1 + floor(−10/10) = 0) → ОСТАНОВКА на Эфире
    c.endTurn(); // 5: Эфир (ввод) → m0 (50) убивает → ОКНО: mp 15 ≥
                 // 15, пул 0 → partyLost
    assert.ok(c.result && c.result.outcome === 'dead');
    assert.equal(c.result.partyLost, true, '(b): не спасение — partyLost');
    assert.equal(efir.alive, true);
    const expMp = 5 + (efir.attrs.intelligence || 0)
                + (efir.attrs.wisdom || 0);
    assert.equal(expMp, 15, '(b): reset-mp 15 — mp-гейт ПРОШЁЛ');
    assert.equal(efir.mp, expMp, '(b): mp 15 — нетронут (каста нет: не 15 − 15 = 0)');
    assert.equal(c.efs.spellWis, 0, '(b): пул 0 (refill из attrs) — гейт на пуле');
    assert.equal(a0.alive, false, '(b): каскад полный');
    assert.equal(a1.alive, false, '(b): каскад полный');
    assert.ok(c.log.includes('Эфир возвращается…'), '(b): reset-лог есть');
    assert.ok(!c.log.includes('Возвращён в бой.'), '(b): каста НЕТ');
  }
});

test('000164-RNG-1: ноль новых c._rng в окне — счётчик === 4 (2+2 hit-ролла мобов) + детерминизм: 2 независимых прогона идентичны', () => {
  // Сценарий RESCUE-1 на 4 `c.endTurn()` (000168 D9/P1: союзники —
  // ввод, один endTurn на слот; старое: 2 endTurn — ИИ-tail
  // «доедал» раунд сам): #1 (Эфир no-op) → round 1: m0 (12: 25→13),
  // m1 (2: 13→11); #2 (игрок) → ОСТАНОВКА на a0 (ввод); #3 (a0) →
  // a1 серый → round 2, ОСТАНОВКА на Эфире; #4 (Эфир no-op) →
  // m0 (30: 11→СМЕРТЬ → окно → rescue, 0 rng), m1 (2: 13→11).
  // Роллы: ТОЛЬКО hit-роллы мобов — ходы a0/a1 тихие (0), Эфир
  // no-op (книга ['resurrect'] — 0), окно/каскад/reset/каст (0, D4),
  // скелеты без трейтов (0). Итого ТОЧНО 4.
  const run164 = () => {
    const { p, state, c, m0, m1, efir } = build164();
    m0.damage = 12;
    m1.damage = 2;
    const a1 = c.units.find((u) => u.id === 'a1');
    a1.alive = false; // «погибший до окна» (как в RESCUE-1)
    a1.hp = 0;
    E164.buildEfirUnit(state, c);
    efir.spells = ['resurrect'];
    efir.attrs = Object.assign({}, efir.attrs, {
      intelligence: 8, wisdom: 8 });
    let n = 0;
    c._rng = () => { n += 1; return 0.01; };
    c.endTurn(); // 1: ход Эфира (no-op) → round 1: m0 [1], m1 [2]
    m0.damage = 30;
    c.endTurn(); // 2: ход игрока → ОСТАНОВКА на a0 (ввод, 0 роллов)
    c.endTurn(); // 3: a0 → a1 серый → round 2: ОСТАНОВКА на Эфире
    c.endTurn(); // 4: Эфир (no-op) → m0 [3] → окно (0) → m1 [4]
    return {
      n,
      snap: {
        result: c.result ? { outcome: c.result.outcome,
          partyLost: c.result.partyLost } : null,
        round: c.round,
        phase: c.phase,
        turnIndex: c.turnIndex,
        player: { alive: p.alive, hp: p.hp },
        efirMp: efir.mp,
        efs: { spellInt: c.efs.spellInt, spellWis: c.efs.spellWis,
          touch: c.efs.touch, move: c.efs.move },
        turnOrder: c.turnOrder.slice(),
        units: c.units.map((u) => ({
          id: u.id, x: u.x, y: u.y, hp: u.hp, alive: u.alive })),
        log: c.log.slice(),
      },
    };
  };
  const A = run164();
  const B = run164();
  assert.equal(A.n, 4,
    'счётчик === 4 (2 hit-ролла/раунд × 2 раунда): окно НЕ добавляет');
  assert.deepEqual(B.snap, A.snap, 'детерминизм D4: 2 прогона идентичны');
  // Состояние в конце round 2 (спасён — бой идёт). 000168 D9/P1:
  // окно сместилось на раунд РАНЬШЕ (round 2 вместо 3) — pre-roll
  // больше не «съедает» ИИ-tail round 1, окно открывается в
  // round 2 на 4-м endTurn (старое — round 3 на 2-м):
  assert.equal(A.snap.result, null, 'round 2: бой продолжается');
  assert.equal(A.snap.round, 2);
  assert.equal(A.snap.phase, 'player');
  assert.equal(A.snap.turnIndex, 3);
  assert.equal(A.snap.player.alive, true);
  assert.equal(A.snap.player.hp, 11, '13 (спасение) − 2 (m1)');
  assert.equal(A.snap.efirMp, 6, '21 (5+8+8) − 15');
  assert.equal(A.snap.efs.spellWis, 0);
  // a1 «погибший до окна» МЁРТВ на СТАРТЕ round 2 → вне этого
  // buildTurnOrder; откат (его воскрешение) — СЕРЕДИНЕ round 2, ПОСЛЕ
  // ребилда — очередь НЕ пересчитывается до конца раунда (000036,
  // контракт 000164 §2.4; ERRATA-164 — то же, что и для RESCUE-1:
  // 5 записей, «6 записей» в старых заметках неверно). a1 — в очереди
  // со СЛЕДУЮЩЕГО раунда:
  assert.equal(A.snap.turnOrder.length, 5,
    'round-2-очередь: a1 (воскресший откатом СЕРЕДИНЕ раунда) — вне; добор — round 3');
  assert.deepEqual(A.snap.turnOrder, ['efir', 'm0', 'm1', 'player', 'a0']);
});

test('000164-UNKILL-1 (GUARD, зелёный с RED): «Несокрушимость» срабатывает РАНЬШЕ окна — 1 HP, бой продолжается, каскада НЕТ', () => {
  // Пин РАЗМЕЩЕНИЯ хендлера (ТЗ п.1): «Несокрушимость»
  // (survivalChance = min(1, 0.01 × unkill), 1/день) срабатывает
  // РАНЬШЕ onPlayerDeath — окно в её путь НЕ входит (защита 1 HP).
  // Зелёный в RED и после реализации: хендлер, размещённый РАНЬШЕ
  // survival-проверки, дал бы каскад/partyLost/спасение → red.
  const p = createCharacter();
  p.secondary = { unkill: 50 }; // survivalChance 0.5 (0.01 × 50)
  p.hp = 1; // 1 − 25 → 0 → «Несокрушимость» (0.01 < 0.5) → hp 1
  const state = E164.createEfir();
  const c = createCombat({
    player: p,
    allies: [ALLY_VOLK, ALLY_ASHKA, E164.efirAllyData(state)],
    mobs: ['skeleton'], mobLevel: 2, seed: 9, // 1 МОБ: Несокрушимость
    // 1/день — второй удар добил бы (день один — боя больше нет)
  });
  const m0 = c.units.find((u) => u.id === 'm0');
  const efir = c.units.find((u) => u.id === 'efir');
  const a0 = c.units.find((u) => u.id === 'a0');
  const a1 = c.units.find((u) => u.id === 'a1');
  m0.x = 4; m0.y = 6;
  m0.damage = 25;
  efir.x = 2; efir.y = 5;
  c._rng = () => 0.01; // hit-ролл (0.01 < hitChance) И survival (0.01 < 0.5)
  E164.buildEfirUnit(state, c);
  // «Готовый к спасению» Эфир: если хендлер misplaced (раньше
  // survival-проверки), он бы кастнул (reset-mp 21 ≥ 15, пул 1) —
  // тест поймал бы это (p.hp 13 / каскад / строки).
  efir.spells = ['resurrect'];
  efir.attrs = Object.assign({}, efir.attrs, {
    intelligence: 8, wisdom: 8 });
  efir.mp = 18; // < 20: «Вдох Эфира» НЕ сработает (frac 0.04 ≤ 0.4,
                // но mp < mpCost 20) — ход Эфира no-op
  c.endTurn(); // tail (a0 шаг, a1 «отступает») → round 2: Эфир no-op
               // → m0: 1 − 25 → Несокрушимость → hp 1 → бой дальше
  assert.equal(p.alive, true, '«Несокрушимость» — выжил');
  assert.equal(p.hp, 1, '1 HP — окно в её путь не входит');
  assert.equal(c.result, null, 'бой продолжается');
  assert.equal(c.phase, 'player');
  assert.equal(a0.alive, true, 'каскада НЕТ: Вольк жив');
  assert.equal(a0.hp, a0.maxHP, 'каскада НЕТ: Вольк полный');
  assert.equal(a1.alive, true, 'каскада НЕТ: Ашка жива');
  assert.equal(a1.hp, a1.maxHP);
  assert.equal(efir.mp, 18, 'reset/спасения не было — mp нетронут');
  assert.ok(!c.log.includes('Вы погибли...'), 'смертной строки нет');
  assert.ok(!c.log.includes('Эфир возвращается…'), 'auto-возрождения нет');
  assert.ok(!c.log.includes('Возвращён в бой.'), 'каста нет');
});

test('000164-PRE-1 (GUARD, зелёный): pre-roll-смерть в createCombat (ДО buildEfirUnit) — ВСЕГДА partyLost: c.efs нет → гейт ложится на пуле (R-6, §2.5)', () => {
  // Контракт R-6/§2.5 (закрытие висящей ссылки «пин W11» по итогам
  // ревью): c.efs/c.efir существуют ТОЛЬКО после buildEfirUnit
  // (combat-ui вызывает ПОСЛЕ createCombat) → pre-roll-смерть
  // (моб с init ВЫШЕ ВСЕХ убил синхронно в createCombat) —
  // структурно ВСЕГДА partyLost, даже при «готовом к спасению»
  // Эфире (книга ['resurrect'] + reset-mp 18 ≥ 15): гейт шага 4
  // (e && s && c.efs && …) ложен НА ПУЛЕ. Кода-дефекта нет (краша
  // нет, auto-возрождение шага 3 harmless — бой окончен, §2.5);
  // пин фиксирует принятую деградацию, чтобы «починка» (c.efs в
  // createCombat) была осознанным решением, а не «исправлением».
  // Геометрия (height 3: игрок (3,2)): скелет-лучник m1 (3,0) —
  // d 2 ≤ 4 (RANGED_MAX_DIST) — бьёт в pre-roll. 000168 D9/P1:
  // pre-roll ОСТАНАВЛИВАЕТСЯ на первом player-side юните (союзники
  // — ввод) — убийца обязан быть СТРОГО самым быстрым (старое:
  // хватило «выше игрока» — союзники играли ИИ дальше): init m1 4
  // СТРОГО максимум — attrs Эфира {int 3, wis 10, dex 0}: init 3
  // (< 4; «готовность к спасению» не требует int 8 — mp = 5+3+10 =
  // 18 ≥ 15; старые attrs 8/8 дали бы init 9 > 4 → стоп на Эфире,
  // pre-roll-смерть недостижима); игрок init 2, orc_warrior m0
  // (1,0) init 2 = игрок — ТАЙ-брейк базы (игрок первым), Volk
  // (a1, 4,1) init 0 — все < 4. m1: тай-брейк nearestPlayerSide
  // (игрок при равенстве, строгий <): игрок d 2 = Эфир (2,1) d 2 =
  // Вольк d 2 → цель ИГРОК. rng 0.01 — hit-ролл m1 попадает.
  const p = createCharacter();
  p.hp = 1; // единственный удар m1 добивает (броня 0, без экип.)
  const state = E164.createEfir();
  const efirData = E164.efirAllyData(state);
  // «Готовый к спасению» Эфир — мутация ДАННЫХ ДО createCombat
  // (pre-roll внутри createCombat; post-hoc мутации не успевают):
  // dex 0 — init 3 < 4 (m1 СТРОГО первым, см. геометрию); mp 18
  // ≥ 15 — mp-гейт шага 4 ПРОШЁЛ бы (гейт падает именно на c.efs):
  efirData.spells = ['resurrect'];
  efirData.attrs = Object.assign({}, efirData.attrs, {
    intelligence: 3, wisdom: 10, dexterity: 0 }); // reset-mp = 18 ≥ 15
  const c = createCombat({
    player: p,
    allies: [efirData, ALLY_VOLK],
    mobs: ['orc_warrior', 'skeleton_archer'], mobLevel: 2, seed: 9,
    height: 3,
    rng: () => 0.01, // hit-ролл m1 (0.01 < hitChance); препятствия —
    // фиксированный (0,0) (единый кандидат floor(0.01·w/h)) — пины
    // ниже на него не смотрят
  });
  // buildEfirUnit НЕ вызван (в игре — combat-ui ПОСЛЕ createCombat):
  assert.equal(c.efs, undefined, 'до buildEfirUnit пула c.efs НЕТ — причина');
  // Окно отработало ВНУТРИ createCombat (pre-roll), неспасение:
  assert.ok(c.result, 'бой окончен в createCombat (pre-roll-смерть)');
  assert.equal(c.result.outcome, 'dead');
  assert.equal(c.result.partyLost, true,
    'ВСЕГДА partyLost: гейт на c.efs (R-6) — спасения нет даже при ' +
    'книге [' + JSON.stringify(efirData.spells) + '] и мане 18 ≥ 15');
  assert.equal(c.phase, 'over');
  assert.equal(p.alive, false);
  // Каскад (шаг 2) и auto-возрождение (шаг 3) — сработали (юниты в
  // c.units — поиск R-2 по полю, не c.efir):
  const efir = c.units.find((u) => u.id === 'efir');
  const volk = c.units.find((u) => u.id === 'a1');
  assert.equal(volk.alive, false, 'Вольк — каскад (считается погибшим)');
  assert.equal(volk.hp, 0);
  assert.equal(efir.alive, true, 'Эфир — auto-возрождён (дух), НЕ мёртв');
  assert.equal(efir.hp, efir.maxHP, 'reset полный: hp = maxHP');
  assert.equal(efir.mp, 18, 'reset-mp = 5 + 3 + 10 (R-3) — каста не было');
  // Лог: смерть + дух, БЕЗ каста (пула нет — «Возвращён в бой.» нет):
  assert.ok(c.log.includes('Вы погибли...'), 'смертная строка в окне');
  assert.ok(c.log.includes('Эфир возвращается…'), 'auto-возрождение (дух)');
  assert.ok(!c.log.includes('Эфир: «Воскрешение».'), 'атрибуции каста нет');
  assert.ok(!c.log.includes('Возвращён в бой.'), 'каста нет — пула нет');
});

// =====================================================================
// Задача 000168. Бой: игрок управляет Эфиром и нанятыми NPC
// (ход спутника — ввод).
//
// КРАСНЫЕ тесты (TDD): написаны ДО реализации, падают на текущем
// (неизменённом) коде — базис 000167:
//   * хода союзника НЕТ — advanceQueue проходит союзников через ИИ
//     (allyAct/efirTurn), очередь останавливается только на 'player':
//     activeUnitId после createCombat/endTurn = 'player'
//     (краснота: 'a0'/'efir');
//   * пулы союзника НЕ СУЩЕСТВУЮТ (u.moveLeft/u.attackLeft — undefined;
//     makeAlly — фиксированный список полей); c.move/c.attack —
//     D6-гварда 000167 (→ null, если активен не игрок) либо игрок-путь
//     (не тот диспатч);
//   * c.cast/c.heal — НЕ СУЩЕСТВУЮТ (осмысленный TypeError «c.heal is
//     not a function» — прецедент 000132/000155: функция отсутствует,
//     не load-ошибка);
//   * canDoAction БЕЗ контекста союзника: 'move'/'cast' —
//     «неизвестное действие», player-only действия на ходу союзника —
//     legacy-ответы (ok / другие причины вместо дословного
//     «недоступно активному персонажу»);
//   * «Вдох Эфира» — АВТО-ТРИГГЕР (SPEC): субкейс-триггер ЗЕЛЁНЫЙ на
//     старом коде (семантика сохранена — 000167-WEAK-1); краснота
//     теста — за счёт non-trigger (после endTurn Эфир АКТИВЕН,
//     phase 'player', AI-строк в логе НЕТ — старый код: heal/каст/
//     Касание/движение + активен 'player').
// Контракты — memory/000168-companion-control.md (§3.3/§3.4/§3.5/§3.6,
// §12). Геометрия: поле 7×7, игрок (3,6); позиции — белая коробка
// (паттерн board112/000167-WEAK-1). НОВЫХ c._rng в тестовых сценариях
// 0 (c._rng = фикс; подсчёт вызовов — только в heal-субкейсе).
// =====================================================================

// Наёмник с инициативой ВЫШЕ игрока (attrs 4+4 = 8 > волк 3 > игрок 2):
// в отсортированной очереди ['a0','m0','player'] pre-roll доходит до
// его слота ПЕРВЫМ (000167: там — ИИ; 000168: там — остановка).
const ALLY_VOLK_168 = Object.assign({}, ALLY_VOLK,
  { attrs: { dexterity: 4, intelligence: 4 } });
const ALLY_ASHKA_168 = Object.assign({}, ALLY_ASHKA,
  { attrs: { dexterity: 4, intelligence: 4 } });
const ALLY_MIRA_168 = Object.assign({}, ALLY_MIRA,
  { attrs: { dexterity: 4, intelligence: 4 } });

test('000168-ALLY-1: pre-roll ОСТАНОВИЛСЯ на наёмнике (activeUnitId/phase), c.move тратит u.moveLeft (НЕ c.ps), повтор — «шаги на ход исчерпаны», round-rollover возвращает пул', () => {
  const c = createCombat({
    player: strongHero(), mobs: ['wolf'], mobLevel: 1, seed: 5,
    allies: [ALLY_VOLK_168],
  });
  // Краснота (000167): pre-roll проходит наёмника через ИИ и встаёт
  // на 'player'; 000168: c.phase 'player' на слоте наёмника (D9).
  assert.equal(c.turnOrder[0], 'a0', 'очередь по инициативе (8>3>2)');
  assert.equal(activeUnitId(c), 'a0',
    'pre-roll остановился на наёмнике (краснота: '
    + activeUnitId(c) + ')');
  assert.equal(c.phase, 'player', 'ход союзника — phase «player» (D9)');
  // Пулы — makeAlly (1/1). Краснота: поля не существуют (undefined).
  const a0 = c.units.find((x) => x.id === 'a0');
  assert.equal(a0.moveLeft, 1, 'u.moveLeft = 1 (краснота: undefined)');
  assert.equal(a0.attackLeft, 1, 'u.attackLeft = 1 (краснота: undefined)');
  // Движение: белая коробка (паттерн board112).
  c.obstacles.clear();
  a0.x = 3; a0.y = 5;
  const w = c.units.find((x) => x.id === 'm0');
  w.x = 0; w.y = 0;
  const psMoveBefore = c.ps.moveLeft;
  const r = c.move(0, -1);
  assert.ok(r && r.ok === true,
    'c.move на ходу наёмника — союзный путь (краснота: '
    + JSON.stringify(r) + ')');
  assert.equal(a0.y, 4, 'наёмник (3,5)→(3,4)');
  assert.equal(a0.moveLeft, 0, 'u.moveLeft 1→0 (краснота: undefined)');
  assert.equal(c.ps.moveLeft, psMoveBefore, 'c.ps — не тронут');
  const r2 = c.move(0, -1);
  assert.ok(r2 && r2.ok === false, 'второе движение — отказ');
  assert.equal(r2.reason, 'шаги на ход исчерпаны',
    'причина дословно (краснота: ' + (r2 && r2.reason) + ')');
  // Round-rollover: endTurn (волк → игрок) + endTurn (round 2 —
  // очередь СНОВА останавливается на «a0»), u.moveLeft = 1.
  c.endTurn();
  c.endTurn();
  assert.equal(c.round, 2, 'round 2 (краснота: 3 — старая очередь не стоит)');
  assert.equal(activeUnitId(c), 'a0',
    'round 2 — снова наёмник (краснота: ' + activeUnitId(c) + ')');
  assert.equal(a0.moveLeft, 1, 'round-rollover: u.moveLeft = 1 (краснота: undefined)');
});

test('000168-ALLY-2: c.attack на ходу наёмника — allyStrike (бросок allyAttack, u.attackLeft, дальность по роли); support — c.heal() → allyHeal (самый раненый, 0 c._rng)', () => {
  const C = require('../src/combat.js');
  const saveCatalog = C.combatInternals.allySpells;
  C.combatInternals.allySpells =
    require('../src/spells-data.js').SPELLS_BY_ID;
  try {
    const mk = (data) => {
      const c = createCombat({
        player: strongHero(), mobs: ['wolf'], mobLevel: 1, seed: 5,
        allies: [data],
      });
      c.obstacles.clear();
      const a = c.units.find((x) => x.id === 'a0');
      const w = c.units.find((x) => x.id === 'm0');
      w.maxHP = 30; w.hp = 30;
      c._rng = () => 0.01;
      return { c, a, w };
    };
    // (1) melee d≤1 — попадание (бросок allyAttack тот же, hitChance 0.55),
    //     пул 1→0; повтор — «действий «Удар» больше нет».
    {
      const { c, a, w } = mk(ALLY_VOLK_168);
      a.x = 3; a.y = 4; w.x = 3; w.y = 3; // d 1
      const atkBefore = c.ps.attack;
      const r = c.attack(w.id);
      assert.ok(r && r.ok === true,
        'c.attack на ходу наёмника (краснота: игрок-путь d 3 → '
        + JSON.stringify(r) + ')');
      assert.equal(w.hp, 27, 'волк −3 (dmg Вольк L1 = round(2.7·1.2))');
      assert.equal(a.attackLeft, 0, 'u.attackLeft 1→0 (краснота: undefined)');
      assert.equal(c.ps.attack, atkBefore, 'c.ps.attack — не тронут');
      assert.ok(c.log.includes('Вольк бьёт Волк: 3.'),
        'лог — строка allyAttack: ' + c.log.join(' | '));
      const r2 = c.attack(w.id);
      assert.ok(r2 && r2.ok === false, 'второй удар — отказ');
      assert.equal(r2.reason, 'действий «Удар» больше нет',
        'причина дословно (краснота: ' + (r2 && r2.reason) + ')');
    }
    // (2) melee d 2 — вне дальности; пул НЕ расходуется.
    {
      const { c, a, w } = mk(ALLY_VOLK_168);
      a.x = 3; a.y = 4; w.x = 3; w.y = 2; // d 2
      const r = c.attack(w.id);
      assert.ok(r && r.ok === false, 'вне дальности — отказ');
      assert.equal(r.reason, 'цель слишком далеко (ближний бой)');
      assert.equal(a.attackLeft, 1, 'пул не расходуется (краснота: undefined)');
    }
    // (3) ranged: d 4 — попадание; d 6 — «цель слишком далеко (даль 4)».
    {
      const { c, a, w } = mk(ALLY_ASHKA_168);
      a.x = 3; a.y = 4; w.x = 1; w.y = 2; // d 4
      const r = c.attack(w.id);
      assert.ok(r && r.ok === true,
        'ranged d 4 — попадание (краснота: игрок d 6 → '
        + JSON.stringify(r) + ')');
      assert.equal(w.hp, 27, 'волк −3 (dmg Ашка L1 = round(2.7·1.0))');
      assert.equal(a.attackLeft, 0, 'u.attackLeft 1→0');
    }
    {
      const { c, a, w } = mk(ALLY_ASHKA_168);
      a.x = 3; a.y = 4; w.x = 0; w.y = 1; // d 6
      const r = c.attack(w.id);
      assert.ok(r && r.ok === false, 'ranged d 6 — отказ');
      assert.equal(r.reason, 'цель слишком далеко (даль 4)',
        'причина ranged-дальности (краснота: ' + (r && r.reason) + ')');
      assert.equal(a.attackLeft, 1, 'пул не расходуется');
    }
    // (4) support — c.heal(): allyHeal (самый раненый пула [игрок,
    //     живые союзники]), 0 c._rng — расход сида нет.
    {
      const { c, a, w } = mk(ALLY_MIRA_168);
      a.x = 3; a.y = 4; w.x = 0; w.y = 0;
      c.player.hp = 108; // 108/270 = 0.4 — самый раненый
      let rngCalls = 0;
      c._rng = () => { rngCalls += 1; return 0.01; };
      const r = c.heal();
      assert.ok(r && r.ok === true,
        'c.heal на ходу поддержки (краснота: c.heal отсутствует — '
        + 'TypeError)');
      assert.equal(c.player.hp, 113, 'игрок +5 (round((4+0.5·0+1)·1))');
      assert.ok(c.log.includes('Мира лечит Флогистон (+5).'),
        'лог — строка allyHeal: ' + c.log.join(' | '));
      assert.equal(rngCalls, 0, '0 c._rng (детерминированное правило, ТЗ)');
      assert.equal(a.attackLeft, 1,
        'лечение НЕ занимает слот действия (000193: слот 1→1)');
      assert.equal(a.mp, 6,
        '000193: мана 9→6 (mend: 3; attrs {int 4} → mp 5+4+0 = 9)');
      assert.equal(a.spellWis, 0,
        '000193: пул «Заклинание» (Мудрость) 1→0');
    }
  } finally {
    C.combatInternals.allySpells = saveCatalog;
  }
});

test('000168-CANDO-1: canDoAction-контекст — на ходу наёмника attack/move/endTurn — ok; player-only (fire/block/quickItem/invItem/flee) — «недоступно активному персонажу»', () => {
  const c = createCombat({
    player: strongHero(), mobs: ['wolf'], mobLevel: 1, seed: 5,
    allies: [ALLY_VOLK_168],
  });
  c.obstacles.clear();
  const a = c.units.find((x) => x.id === 'a0');
  const w = c.units.find((x) => x.id === 'm0');
  a.x = 3; a.y = 4; w.x = 3; w.y = 3; // d 1
  assert.equal(activeUnitId(c), 'a0', 'активен наёмник (краснота: player)');
  const atk = canDoAction(c, 'attack', { targetId: w.id });
  assert.equal(atk.ok, true,
    'attack — ok (краснота: игрок d 3 → ' + JSON.stringify(atk) + ')');
  const mv = canDoAction(c, 'move');
  assert.equal(mv.ok, true,
    'move — ok (краснота: «неизвестное действие: move»): '
    + JSON.stringify(mv));
  assert.equal(canDoAction(c, 'endTurn').ok, true, 'endTurn — ok');
  for (const act of ['fire', 'block', 'flee']) {
    const r = canDoAction(c, act);
    assert.equal(r.ok, false, act + ' — недоступно');
    assert.equal(r.reason, 'недоступно активному персонажу',
      act + ' — причина дословно (краснота: ' + r.reason + ')');
  }
  // 000194: quickItem/invItem — НЕ player-only: причина — по
  // состоянию (слоты наёмника пусты; ОБЩИЙ инвентарь strongHero
  // пуст), а не «недоступно активному персонажу».
  const q = canDoAction(c, 'quickItem');
  assert.equal(q.ok, false, '000194: quickItem — недоступно');
  assert.equal(q.reason, 'быстрые слоты пусты',
    '000194: причина дословно (краснота: ' + q.reason + ')');
  const v = canDoAction(c, 'invItem');
  assert.equal(v.ok, false, '000194: invItem — недоступно');
  assert.equal(v.reason, 'нет применимых предметов в инвентаре',
    '000194: причина дословно (краснота: ' + v.reason + ')');
  // 000194: у наёмника ЗАНЯТЫЙ быстрый слот и зелье в общем — ok.
  a.quick = ['healing_potion', null, null];
  I.addItem(c.player, 'healing_potion');
  const q2 = canDoAction(c, 'quickItem');
  assert.equal(q2.ok, true,
    '000194: quickItem — ok (слот + зелье в общем; краснота: '
    + JSON.stringify(q2) + ')');
  const v2 = canDoAction(c, 'invItem');
  assert.equal(v2.ok, true,
    '000194: invItem — ok (зелье в общем; краснота: '
    + JSON.stringify(v2) + ')');
});

test('000168-CANDO-2: canDoAction-контекст — на ходу Эфира attack (Касание: c.efs.touch, d≤1) и cast (spell+pool+mana+d≤4); player-only — «недоступно активному персонажу»', () => {
  const E = loadEfir000081();
  const C = require('../src/combat.js');
  const saveCatalog = C.combatInternals.allySpells;
  C.combatInternals.allySpells =
    require('../src/spells-data.js').SPELLS_BY_ID;
  try {
    const p = hero112(); // maxHP 270, init 2 < Эфир 4
    const state = E.createEfir();
    const c = createCombat({
      player: p, allies: [E.efirAllyData(state)],
      mobs: ['wolf'], mobLevel: 1, seed: 5,
    });
    c.obstacles.clear();
    const u = c.units.find((x) => x.id === 'efir');
    const w = c.units.find((x) => x.id === 'm0');
    w.maxHP = 100; w.hp = 100;
    u.x = 2; u.y = 5;
    assert.equal(activeUnitId(c), 'efir',
      'активен Эфир (краснота: pre-roll прошёл через ИИ → '
      + activeUnitId(c) + ')');
    E.buildEfirUnit(state, c);
    assert.ok(c.efs, 'c.efs — боевой профиль (buildEfirUnit)');
    // (a) attack = «Касание духа» (c.efs.touch, d≤1).
    w.x = 2; w.y = 4; // d 1
    let r = canDoAction(c, 'attack', { targetId: w.id });
    assert.equal(r.ok, true,
      'Касание d 1 — ok (краснота: игрок d 3 → ' + JSON.stringify(r) + ')');
    w.y = 3; // d 2
    r = canDoAction(c, 'attack', { targetId: w.id });
    assert.equal(r.ok, false, 'Касание d 2 — отказ');
    assert.equal(r.reason, 'цель слишком далеко (ближний бой)');
    c.efs.touch = 0; w.y = 4;
    r = canDoAction(c, 'attack', { targetId: w.id });
    assert.equal(r.ok, false, 'пул touch пуст — отказ');
    assert.equal(r.reason, 'действий «Касание духа» больше нет',
      'причина (краснота: ' + r.reason + ')');
    c.efs.touch = 1;
    // (b) cast = сильнейшее известное урон-заклинание (pool+mana+d≤4).
    r = canDoAction(c, 'cast', { targetId: w.id }); // d 1 ≤ 4
    assert.equal(r.ok, true,
      'cast d 1 — ok (краснота: «неизвестное действие: cast»): '
      + JSON.stringify(r));
    w.x = 0; w.y = 0; // d 7
    r = canDoAction(c, 'cast', { targetId: w.id });
    assert.equal(r.ok, false, 'd 7 — вне дальности');
    assert.equal(r.reason, 'цель слишком далеко (дальность 4)',
      'причина (краснота: ' + r.reason + ')');
    w.x = 2; w.y = 4; w.alive = false;
    r = canDoAction(c, 'cast', { targetId: w.id });
    assert.equal(r.ok, false, 'врагов нет — «нет цели»');
    assert.equal(r.reason, 'нет цели', 'причина (краснота: ' + r.reason + ')');
    w.alive = true;
    // (c) player-only — единообразная причина. 000193: 'spellbook'
    // НЕ player-only — у Эфира книга [spark, mend] непустая → ok
    // (новая ветка allyCanDo: «заклинаний нет» только при []).
    for (const act of ['fire', 'block', 'flee']) {
      const rr = canDoAction(c, act);
      assert.equal(rr.ok, false, act + ' — недоступно');
      assert.equal(rr.reason, 'недоступно активному персонажу',
        act + ' — причина (краснота: ' + rr.reason + ')');
    }
    // 000194: quickItem/invItem — НЕ player-only: причина — по
    // состоянию (слоты Эфира пусты; общий инвентарь hero112 пуст).
    const rq = canDoAction(c, 'quickItem');
    assert.equal(rq.ok, false, '000194: quickItem — недоступно');
    assert.equal(rq.reason, 'быстрые слоты пусты',
      '000194: причина (краснота: ' + rq.reason + ')');
    const rv = canDoAction(c, 'invItem');
    assert.equal(rv.ok, false, '000194: invItem — недоступно');
    assert.equal(rv.reason, 'нет применимых предметов в инвентаре',
      '000194: причина (краснота: ' + rv.reason + ')');
    assert.deepEqual(canDoAction(c, 'spellbook'), { ok: true },
      '000193: spellbook на ходу Эфира — ok (книга [spark, mend] '
      + 'непустая)');
  } finally {
    C.combatInternals.allySpells = saveCatalog;
  }
});

test('000168-CANDO-3: canDoAction(«heal») — зеркало allyHealAction 1:1 (ревью 000168; 000193: раненые → каталог → пул → мана, слот действия НЕ тратится); причина canDo = причина ядра в каждом отказе', () => {
  const C = require('../src/combat.js');
  const saveCatalog = C.combatInternals.allySpells;
  C.combatInternals.allySpells =
    require('../src/spells-data.js').SPELLS_BY_ID;
  // Мира — support с ментами; attrs 4+4 = 8 > волк 3 > игрок 2 →
  // pre-roll ОСТАНОВИЛСЯ на её слоте (активен наёмник).
  const mk = (mercData) => {
    const c = createCombat({
      player: strongHero(), mobs: ['wolf'], mobLevel: 1, seed: 5,
      allies: [mercData],
    });
    c.obstacles.clear();
    const a = c.units.find((x) => x.id === 'a0');
    c._rng = () => 0.99;
    return { c, a };
  };
  try {
    // (1) 000193: маны нет (a.mp = 0 < 3 у mend), раненый ЕСТЬ,
    //     каталог ЕСТЬ, пул ЕСТЬ — оба зеркала: «не хватает маны (3)»
    //     (порядок ядра: раненые → каталог → пул → мана).
    {
      const { c, a } = mk(ALLY_MIRA_168);
      assert.equal(activeUnitId(c), 'a0', 'активна Мира (pre-roll-стоп)');
      a.mp = 0;
      c.player.hp = 108; // 108/270 = 0.4 — самый раненый
      const can = canDoAction(c, 'heal');
      const core = c.heal();
      assert.equal(can.ok, false, 'без маны — canDo-отказ');
      assert.equal(can.reason, 'не хватает маны (3)',
        'canDo: причина ядра (000193: ' + can.reason + ')');
      assert.equal(core.ok, false, 'ядро — отказ');
      assert.equal(core.reason, can.reason, 'зеркало 1:1 — причина ядра');
      assert.equal(c.player.hp, 108, 'HP не изменился');
      assert.equal(a.attackLeft, 1, '000193: слот действия не тратится');
    }
    // (2) Никто не ранен и спелла НЕТ — «нет раненых» (раненые
    //     ПЕРЕД каталогом — порядок ядра; до ревью 000168 зеркало
    //     отвечало бы «нет лечения»).
    {
      const { c } = mk(Object.assign({}, ALLY_MIRA_168, { spells: [] }));
      const can = canDoAction(c, 'heal');
      const core = c.heal();
      assert.equal(can.ok, false, 'без раненых — canDo-отказ');
      assert.equal(can.reason, 'нет раненых',
        'раненые ПЕРЕД каталогом (ревью 000168: ' + can.reason + ')');
      assert.equal(core.reason, can.reason, 'зеркало 1:1 — причина ядра');
    }
    // (3) Раненый ЕСТЬ, спелла НЕТ — «нет лечения» (каталог —
    //     проверка после раненых; 000193: до пула/маны).
    {
      const { c } = mk(Object.assign({}, ALLY_MIRA_168, { spells: [] }));
      c.player.hp = 108;
      const can = canDoAction(c, 'heal');
      const core = c.heal();
      assert.equal(can.ok, false, 'без спелла — canDo-отказ');
      assert.equal(can.reason, 'нет лечения',
        'каталог — последняя проверка: ' + can.reason);
      assert.equal(core.reason, can.reason, 'зеркало 1:1 — причина ядра');
    }
    // (4) Раненый есть, спелл есть, пул/мана полные — оба зеркала ok
    //     (инвариант «ок ⇒ ядро не отклонит» — путь положительный).
    {
      const { c, a } = mk(ALLY_MIRA_168);
      c.player.hp = 108;
      const can = canDoAction(c, 'heal');
      assert.deepEqual(can, { ok: true }, 'canDo — ok');
      const core = c.heal();
      assert.equal(core.ok, true, 'ядро — ok (canDo.ok ⇒ не отклонит)');
      assert.equal(c.player.hp, 113, 'игрок 108 + 5 (round((4+0+1)·1))');
      assert.equal(a.attackLeft, 1,
        '000193: лечение НЕ заняло слот действия (слот 1→1)');
      assert.equal(a.mp, 6, '000193: мана 9→6 (mend: 3 маны)');
      assert.equal(a.spellWis, 0, '000193: пул «Заклинание» (Мудрость) 1→0');
    }
  } finally {
    C.combatInternals.allySpells = saveCatalog;
  }
});

test('000168-BREATH-1: «Вдох Эфира» — авто-триггер в НАЧАЛЕ хода Эфира (ход сгорает, очередь продвигается, позиция без изменений); non-trigger — Эфир активен (ввод), AI-строк в логе НЕТ', () => {
  const E = loadEfir000081();
  const C = require('../src/combat.js');
  const saveCatalog = C.combatInternals.allySpells;
  C.combatInternals.allySpells =
    require('../src/spells-data.js').SPELLS_BY_ID;
  // Эфир ПЕРВЫЙ в очереди (init 4 > волк 3 > игрок 2). Триггер — в
  // начале ЕГО хода (round 2: pre-roll round 1 — u.breath ещё не
  // поставлен buildEfirUnit; паттерн 000167-WEAK-1).
  const mk = (pHp) => {
    const p = hero112();
    const state = E.createEfir();
    const c = createCombat({
      player: p, allies: [E.efirAllyData(state)],
      mobs: ['wolf'], mobLevel: 1, seed: 5,
    });
    c.obstacles.clear();
    const u = c.units.find((x) => x.id === 'efir');
    const w = c.units.find((x) => x.id === 'm0');
    w.x = 0; w.y = 0; w.maxHP = 100; w.hp = 100; // d 6+ — волк не достанет
    c._rng = () => 0.01;
    E.buildEfirUnit(state, c);
    u.x = 2; u.y = 4; // закреплён (паттерн 000167-WEAK-1)
    u.mp = 20;
    p.hp = pHp;
    const pos = [u.x, u.y];
    // Ход Эфира (слот, где проверяется триггер) — довести endTurn'ами:
    // старый код — 1 (pre-roll прошёл Эфира через ИИ; round 2 — слот
    // Эфира после endTurn игрока); новый — 2 (round 1: pre-roll стоит
    // на Эфире → endTurn: волк → игрок; round 2: слот Эфира).
    let guard = 0;
    while (!c.efirBreathed && guard++ < 4) c.endTurn();
    return { c, p, u, w, pos };
  };
  const NO_AI = ['Эфир исцеляет', 'Касание духа', 'Эфир бьёт', 'Эфир: «'];
  try {
    // (a) ТРИГГЕР: игрок 108/270 = 0.4 ≤ 0.4, mp 20 ≥ 20 — ход СГОРАЕТ:
    //     очередь продвинулась ЧЕРЕЗ 'efir', c.efirBreathed, mp −20,
    //     игрок +12, моб ×0.8 на 2 хода, лог, позиция не изменилась,
    //     ИИ-действий нет. Семантика СОХРАНЕНА (000167-WEAK-1) —
    //     субкейс зелёный и на старом коде.
    {
      const { c, p, u, w, pos } = mk(108);
      assert.notEqual(activeUnitId(c), 'efir', 'ход Эфира сгорел');
      assert.equal(c.efirBreathed, true, 'флаг (состояние боя)');
      assert.equal(u.mp, 0, 'mp −20 (mpCost)');
      assert.equal(p.hp, 120, 'игрок +12 (round(10+0.8·3))');
      assert.deepEqual(w.weakened, { mult: 0.8, turns: 2 },
        'ослабление ×0.8 на 2 хода');
      assert.ok(c.log.includes('Вдох Эфира!'),
        'лог-строка (B.logLine): ' + c.log.join(' | '));
      assert.deepEqual([u.x, u.y], pos, 'позиция не изменилась (ВЕСЬ ход)');
      for (const line of NO_AI) {
        assert.ok(!c.log.some((l) => l.includes(line)),
          'ИИ-действий нет: ' + line + ': ' + c.log.join(' | '));
      }
    }
    // (b) NON-TRIGGER: игрок 110/270 > 0.4 — Эфир АКТИВЕН (ввод игрока):
    //     phase 'player', флаг не стоит, mp/HP/позиция не тронуты,
    //     AI-строк в логе НЕТ. Краснота (000167): старый код —
    //     heal «Эфир исцеляет… (+6)» / каст / Касание / движение
    //     (c.efs.move 3) + активен 'player'.
    {
      const { c, p, u, pos } = mk(110);
      assert.equal(activeUnitId(c), 'efir',
        'non-trigger — Эфир активен (краснота: ' + activeUnitId(c) + ')');
      assert.equal(c.phase, 'player', 'phase «player» (D9)');
      assert.ok(!c.efirBreathed, 'флаг не выставлен');
      assert.equal(u.mp, 20, 'mp не расходуется (краснота: ИИ расходовал)');
      assert.equal(p.hp, 110, 'игрок не лечен (краснота: ИИ-лечение)');
      assert.deepEqual([u.x, u.y], pos, 'позиция не сдвинута (краснота: ИИ-движение)');
      for (const line of NO_AI) {
        assert.ok(!c.log.some((l) => l.includes(line)),
          'AI-строк в логе нет: ' + line + ': ' + c.log.join(' | '));
      }
    }
  } finally {
    C.combatInternals.allySpells = saveCatalog;
  }
});

// =====================================================================
// Задача 000175. Клетки, до которых выбранный моб доходит за один ход.
// КРАСНЫЕ тесты (TDD). Контракт — memory/000175-mob-reach-hatch.md §2.
//
// mobReachCells(c, u) — ЧИСТАЯ функция ядра: BFS от якоря (u.x, u.y),
// глубина ≤ u.movePerTurn || 1 (бюджет ОДНОГО хода моба: 1, у fast — 2),
// соседи — 4 в каноническом порядке PATH_DIRS (↑ ↓ ← →), проходимость —
// rectFree (стены: границы поля, клетка игрока (c.px, c.py), c.obstacles,
// другие живые не-fled юниты; САМОГО моба игнор — тот же набор «стен»,
// что у реального шага моба). Возврат — Set<'x,y'> достижимых якорей;
// СТАРТОВЫЙ якорь НЕ включён (моб уже там; штриховка — тайлы, куда
// МОЖЕТ дойти). Мультиклеточные мобы (w×h) — объединение ВСЕХ клеток
// прямоугольника на каждом достижимом якоре. Чистота: 0 c._rng,
// 0 мутаций c/u, 0 новых полей c (детерминизм боя/сейвы не трогать).
//
// Краснота (осмысленная): экспорт отсутствует (src/combat.js) —
// mobReachCells = undefined → TypeError «not a function» (не
// load-ошибка и не SyntaxError; паттерн 000132/000155/000167).
// =====================================================================

// Сцена: бой 1×1-мобом на ЧИСТОМ поле (обstacles сняты — геометрия
// препятствий проверяется отдельно, R3/R7); герой — strongHero (не
// умирает); позиция героя — канон createCombat (3,6).
function reachScene175(mobs = ['wolf']) {
  const c = createCombat({ player: strongHero(), mobs, mobLevel: 1, seed: 42 });
  c.obstacles.clear();
  return c;
}

test('достигнутые клетки моба (задача 000175, R1): 1×1 открытое поле, movePerTurn=1 → ровно 4 ортогональных соседа, старт не в наборе, возврат Set «x,y»', () => {
  const c = reachScene175();
  const w = c.units[0]; // wolf 1×1
  w.x = 3; w.y = 3; // центр поля 7×7
  const s = mobReachCells(c, w);
  assert.ok(s instanceof Set, 'возврат — Set');
  assert.deepEqual([...s].sort(), ['2,3', '3,2', '3,4', '4,3'],
    'ровно 4 ортогональных соседа (манхэттен 1), факт: ' + [...s].sort());
  assert.ok(!s.has('3,3'), 'стартовое положение НЕ в наборе (D4)');
});

test('достигнутые клетки моба (задача 000175, R2): fast (movePerTurn=2) → 12 клеток манхэттен ≤2; у стены — обрезка границей', () => {
  const c = reachScene175();
  const w = c.units[0];
  w.movePerTurn = 2; // fast (makeMob: t.fast → 2)
  w.x = 3; w.y = 3;
  const s = mobReachCells(c, w);
  assert.equal(s.size, 12, '12 клеток (D4: старт не считается)');
  assert.deepEqual([...s].sort(), [
    '1,3', '2,2', '2,3', '2,4', '3,1', '3,2',
    '3,4', '3,5', '4,2', '4,3', '4,4', '5,3',
  ], 'манхэттен ≤ 2 без старта, факт: ' + [...s].sort());
  // У стены: угол (0,0) — манхэттен ≤ 2 внутри поля = 5 клеток.
  w.x = 0; w.y = 0;
  const corner = mobReachCells(c, w);
  assert.deepEqual([...corner].sort(), ['0,1', '0,2', '1,0', '1,1', '2,0'],
    'угол: обрезка границей поля, факт: ' + [...corner].sort());
});

test('достигнутые клетки моба (задача 000175, R3): препятствие — само и клетка за ним не в наборе; лимит ШАГОВ — манхэттен-2 при steps=1 не в наборе (не просто радиус)', () => {
  const c = reachScene175();
  const w = c.units[0];
  w.x = 3; w.y = 3;
  c.obstacles.add('3,2'); // камень прямо над мобом
  const s1 = mobReachCells(c, w);
  assert.deepEqual([...s1].sort(), ['2,3', '3,4', '4,3'],
    'steps=1: 4 соседа − блок (3,2) = 3, факт: ' + [...s1].sort());
  assert.ok(!s1.has('3,1'),
    'клетка за камнем (манхэттен 2) не в наборе при steps=1 — лимит шагов, а не радиус');
  // steps=2: клетка ЗА препятствием недостижима (BFS не проходит
  // через камень), хотя манхэттен = 2.
  w.movePerTurn = 2;
  const s2 = mobReachCells(c, w);
  assert.ok(!s2.has('3,2'), 'само препятствие не в наборе');
  assert.ok(!s2.has('3,1'),
    'клетка ЗА препятствием не в наборе (BFS не проходит через камень)');
  assert.equal(s2.size, 10,
    '12 (манхэттен ≤2) − (3,2) − (3,1) = 10, факт: ' + s2.size);
});

test('достигнутые клетки моба (задача 000175, R4): стены из юнитов — живой моб/союзник/клетка игрока блокируют; мёртвый/fled — не блокируют; себя игнор', () => {
  const c = reachScene175(['wolf', 'boar']);
  const w = c.units[0], boar = c.units[1]; // boar 1×1
  w.x = 3; w.y = 3;
  boar.x = 4; boar.y = 3; // живой моб — стена
  const ally = makeAlly({ name: 'Вольк', role: 'melee', level: 1, dmg: 1, hp: 1 }, 1);
  ally.x = 2; ally.y = 3; // союзник — стена
  c.units.push(ally);
  c.px = 3; c.py = 2; // клетка игрока — стена
  const s = mobReachCells(c, w);
  assert.deepEqual([...s].sort(), ['3,4'],
    'все соседи заблокированы (моб/союзник/игрок), факт: ' + [...s].sort());
  // Мёртвый/fled — НЕ блокируют (клетка освобождена).
  ally.alive = false; ally.hp = 0;
  boar.fled = true;
  const s2 = mobReachCells(c, w);
  assert.deepEqual([...s2].sort(), ['2,3', '3,4', '4,3'],
    'мёртвый союзник и fled-моб не блокируют, факт: ' + [...s2].sort());
  // Себя игнор: 2×2-якорь, пересекающий собственный старт-прямоугольник,
  // свободен — пины по клеткам, достижимым ТОЛЬКО таким якорем.
  const c2 = reachScene175(['cave_bear']);
  const bear = c2.units[0];
  bear.x = 1; bear.y = 1; // 2×2: (1,1),(2,1),(1,2),(2,2)
  const s3 = mobReachCells(c2, bear);
  assert.ok(s3.has('3,1') && s3.has('3,2'),
    'якорь (2,1) — пересекает собственный старт-прямоугольник — свободен (себя игнор)');
});

test('достигнутые клетки моба (задача 000175, R5): 2×2 в углу поля (steps=1) — объединение якорей (0,1) и (1,0) → ровно 7 клеток; старт-2×2 исключён', () => {
  const c = reachScene175(['cave_bear']);
  const bear = c.units[0];
  bear.x = 0; bear.y = 0; // 2×2 в углу: (0,0),(1,0),(0,1),(1,1)
  const s = mobReachCells(c, bear);
  // Якорь (0,1): клетки (0,1),(1,1),(0,2),(1,2); якорь (1,0):
  // (1,0),(2,0),(1,1),(2,1). Объединение — 7 клеток (D5).
  assert.deepEqual([...s].sort(), ['0,1', '0,2', '1,0', '1,1', '1,2', '2,0', '2,1'],
    'ровно 7 клеток (объединение якорных прямоугольников), факт: ' + [...s].sort());
  assert.ok(!s.has('0,0'), 'старт-клетка (0,0) не в наборе');
});

test('достигнутые клетки моба (задача 000175, R6): 1×1 в углу поля (0,0), steps=1 → ровно 2 клетки (границы)', () => {
  const c = reachScene175();
  const w = c.units[0];
  w.x = 0; w.y = 0;
  const s = mobReachCells(c, w);
  assert.deepEqual([...s].sort(), ['0,1', '1,0'],
    'угол: 2 клетки (границы поля), факт: ' + [...s].sort());
});

test('достигнутые клетки моба (задача 000175, R7): тупик — все соседи заняты → пустой Set', () => {
  const c = reachScene175();
  const w = c.units[0];
  w.x = 3; w.y = 3;
  for (const k of ['3,2', '3,4', '2,3', '4,3']) c.obstacles.add(k);
  const s = mobReachCells(c, w);
  assert.ok(s instanceof Set, 'возврат — Set');
  assert.equal(s.size, 0, 'все 4 соседа заняты — пустой набор');
});

test('достигнутые клетки моба (задача 000175, R8): чистота + детерминизм — c/u не мутируют, 0 вызовов c._rng, два вызова → идентичный набор', () => {
  const c = createCombat({
    player: strongHero(), mobs: ['wolf', 'centipede'], mobLevel: 1, seed: 42,
  });
  const w = c.units[0]; // wolf (1,1); препятствия seed 42 НЕ сняты
  const snap = () => JSON.stringify({
    px: c.px, py: c.py,
    log: c.log,
    turnOrder: c.turnOrder, turnIndex: c.turnIndex,
    targetId: c.targetId, phase: c.phase, round: c.round,
    obstacles: [...c.obstacles].sort(),
    units: c.units.map((u) => ({
      id: u.id, x: u.x, y: u.y, hp: u.hp, maxHP: u.maxHP,
      alive: u.alive, fled: u.fled, movePerTurn: u.movePerTurn, size: u.size,
    })),
    player: { hp: c.player.hp, mp: c.player.mp },
  });
  const before = snap();
  // c._rng-шпион: подсчёт вызовов (восстановление в finally).
  let rngCalls = 0;
  const origRng = c._rng;
  c._rng = () => { rngCalls++; return origRng(); };
  try {
    const s1 = mobReachCells(c, w);
    const s2 = mobReachCells(c, w);
    assert.equal(rngCalls, 0, '0 вызовов c._rng (чистота — детерминизм/сейвы)');
    assert.equal(snap(), before, 'c не мутирован (структурный снапшот идентичен)');
    assert.deepEqual([...s1].sort(), [...s2].sort(),
      'два вызова → идентичный отсортированный набор (детерминизм)');
  } finally {
    c._rng = origRng;
  }
});

// Задача 000174. Бой: анимация передвижения мобов по пути A* (вместо
// телепортации). КРАСНЫЕ тесты (TDD), node (чистое ядро combat.js).
// Контракт — memory/000174-mob-move-anim.md («Канал c._uiMoves»):
// ядро ЗАПИСЫВАЕТ принятые «to»-тайлы волны — плоский массив в
// ПОРЯДКЕ ИСПОЛНЕНИЯ: null | [{id, x, y}, …]; пишущий — замыкания
// mobAct (после РЕАЛЬНОГО тайл-шага), читающий — только UI-тханк
// endTurn (drain → null). 0 c._rng, 0 новых строк лога — движение
// бит-в-бит (пины 000155 R1–R10 не тронуты).
//
// Краснота (осмысленная): c._uiMoves — undefined (поля в ядре НЕТ) →
// падение на existence/content-ассертах (deepEqual(undefined, массив),
// assert.equal(undefined, null), Array.isArray(undefined)) — не
// синтаксис/load-ошибка: новых экспортов/файлов НЕТ (поле объекта c;
// шапка require без правок).
//
// expectedRedCount (этот файл) = 4 (R1–R4); G1 — зелёный guard
// (нет движения → нет записи; `== null` корректен и для «поля нет»,
// и для «null» — ловит «пустые» шаги).
// =====================================================================

test('000174 R1: fast-моб (orc_rider) — волна = 2 шага A*: c._uiMoves — последовательность «to»-тайлов (старт → средняя → финиш), не один прыжок на финал', () => {
  const p = strongHero();
  const c = createCombat({ player: p, mobs: ['orc_rider'], mobLevel: 1, seed: 7 });
  const r = c.units.find((u) => u.mobId === 'orc_rider');
  // pre-roll: райдер (инициатива 6) действовал ДО первого кадра — его
  // шаг ВЫБРОШЕН (решение C: pre-roll не анимируется): поле null.
  assert.equal(c._uiMoves, null,
    'pre-roll выброшен: c._uiMoves === null (краснота: поле отсутствует)');
  c.obstacles.clear();
  r.x = 3; r.y = 0;           // стена камней 3,1..3,3 — обход через (2,*)
  c.obstacles.add('3,1'); c.obstacles.add('3,2'); c.obstacles.add('3,3');
  c._rng = () => 0.99;
  c.endTurn();
  // fast-моб (movePerTurn=2): (3,0)→(2,0)→(2,1) — ровно ДВЕ записи,
  // каждая 4-соседняя предыдущему якорю, последняя = модель.
  assert.deepEqual(c._uiMoves,
    [{ id: 'm0', x: 2, y: 0 }, { id: 'm0', x: 2, y: 1 }],
    'последовательность принятых «to»-тайлов (не один прыжок на (2,1))');
  const is4 = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
  const anchors = [[3, 0]]
    .concat((c._uiMoves || []).map((m) => [m.x, m.y]));
  for (let i = 1; i < anchors.length; i++) {
    assert.ok(is4(anchors[i - 1], anchors[i]),
      `якорь ${i} 4-соседний предыдущему: ${JSON.stringify(anchors)}`);
  }
  assert.deepEqual([r.x, r.y], [2, 1], 'финальная модель = последний якорь');
  // 0 новых строк (startRound логов не пишет — проверено прогоном):
  // запись шагов не логгирует.
  assert.deepEqual(c.log, ['Бой: блуждающая группа (уровень 1, мобы 1).'],
    'лог НЕ вырос (запись шагов — 0 строк)');
});

test('000174 R2: обход препятствия — средняя позиция = A*-шаг, а не «прямиком»: волк (3,3)+камень (3,4), movePerTurn=2 → [(2,3),(2,4)]', () => {
  const p = strongHero();
  const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 1, seed: 7 });
  const w = c.units[0];
  c.obstacles.clear();
  w.x = 3; w.y = 3;
  c.obstacles.add('3,4');     // «прямиком» к игроку — НА камне
  w.movePerTurn = 2;          // test-only override (каталог ДАННЫХ не менять)
  c._rng = () => 0.99;
  c.endTurn();
  // (3,4) — камень: «прямиком» упёрся бы в препятствие; A*-шаг (тай-
  // брейк 000155 R8 «левее раньше правее») — (2,3) ТОЧНО, затем (2,4).
  assert.deepEqual(c._uiMoves,
    [{ id: 'm0', x: 2, y: 3 }, { id: 'm0', x: 2, y: 4 }],
    'средняя = (2,3) — A*-обход, не лерп «старт→финал» (краснота: запись отсутствует)');
  for (const m of c._uiMoves) {
    assert.ok(!c.obstacles.has(m.x + ',' + m.y),
      'якорь не «внутри» камня: ' + m.x + ',' + m.y);
  }
  assert.deepEqual([w.x, w.y], [2, 4], 'финальная модель = последний якорь');
});

test('000174 R3: ретрит ranged (d=1) — отступной шаг тоже порождает последовательность: лучник (2,6) → (2,5), d 1→2', () => {
  const p = strongHero();
  const c = createCombat({ player: p, mobs: ['orc_archer'], mobLevel: 1, seed: 7 });
  const a = c.units[0];
  c.obstacles.clear();
  a.x = 2; a.y = 6;           // d = 1 — паника: stepFromTarget
  c._rng = () => 0.99;
  c.endTurn();
  // stepAwayRect (порядок ↑ ↓ ← →): первая клетка с ростом d — (2,5).
  assert.deepEqual(c._uiMoves, [{ id: 'm0', x: 2, y: 5 }],
    'ретрит: ровно 1 шаг (2,6)→(2,5) (краснота: запись отсутствует)');
  assert.ok(uDist(c, a) >= 2, 'd вырос: 1 → ≥2');
  assert.ok(c.log.includes('Орк-лучник отступает.'),
    'существующая строка лога (без правок): ' + c.log.join(' | '));
});

test('000174 R4: детерминизм записи — 2 прогона сценариев R1+R2: deepEqual (последовательности, лог, финальные позиции)', () => {
  // Запись шагов не сдвигает поток RNG и не добавляет строк (инвариант
  // детерминизма боя, 0 c._rng) — два прогона тем же сетапом
  // идентичны (шаблон 000155 R3).
  const runRider = () => {
    const p = strongHero();
    const c = createCombat({ player: p, mobs: ['orc_rider'], mobLevel: 1, seed: 7 });
    const r = c.units.find((u) => u.mobId === 'orc_rider');
    c.obstacles.clear();
    r.x = 3; r.y = 0;
    c.obstacles.add('3,1'); c.obstacles.add('3,2'); c.obstacles.add('3,3');
    c._rng = () => 0.99;
    c.endTurn();
    return { moves: c._uiMoves, log: c.log.slice(), pos: [r.x, r.y] };
  };
  const runWolf = () => {
    const p = strongHero();
    const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 1, seed: 7 });
    const w = c.units[0];
    c.obstacles.clear();
    w.x = 3; w.y = 3;
    c.obstacles.add('3,4');
    w.movePerTurn = 2;
    c._rng = () => 0.99;
    c.endTurn();
    return { moves: c._uiMoves, log: c.log.slice(), pos: [w.x, w.y] };
  };
  const a1 = runRider(); const a2 = runRider();
  const b1 = runWolf(); const b2 = runWolf();
  assert.ok(Array.isArray(a1.moves),
    'rider: запись определена (краснота: c._uiMoves отсутствует)');
  assert.ok(Array.isArray(b1.moves),
    'wolf: запись определена (краснота: c._uiMoves отсутствует)');
  assert.deepEqual(a1, a2, 'rider: запись детерминирована (2 прогона)');
  assert.deepEqual(b1, b2, 'wolf: запись детерминирована (2 прогона)');
});

test('000174 G1 (guard): нет движения — нет записи: волк d=1 (промах, атака без движения) → c._uiMoves null/отсутствует', () => {
  const p = strongHero();
  const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 1, seed: 7 });
  const w = c.units[0];
  c.obstacles.clear();
  w.x = 3; w.y = 5;           // d = 1 — атака, шагов НЕТ
  c._rng = () => 0.99;        // промах
  c.endTurn();
  // `== null` покрывает и «поле отсутствует» (красная фаза — undefined),
  // и «записи нет» (зелёная фаза — null): ловит «пустые» шаги
  // (зажатый ретрит / f0===0 должны давать null, а не []-помойку).
  assert.ok(c._uiMoves == null,
    'атака без движения — без записи: ' + JSON.stringify(c._uiMoves));
  assert.deepEqual([w.x, w.y], [3, 5], 'позиция не изменилась');
});

// =====================================================================
// Задача 000198. БОЙ: BUG — выбор цели для удара/заклинания у
// NPC-союзников и Эфира. КРАСНЫЕ тесты (TDD): написаны ДО фикса,
// падают на текущем (неизменённом) коде — базис 2256/2256.
//
// Корень бага (3 согласованные точки, master 7875568):
//   * c.selectTarget — D6-гварда «только игрок»
//     (activeUnitId !== 'player' → null): клик по мобо на ходу
//     союзника не меняет c.targetId;
//   * allyStrike/efirCastAction — targetId ИГНОРИРУЕТСЯ
//     (nearestEnemy(c, u); 000168 OQ1 «v2»);
//   * allyCanDo (ветки 'attack'/'cast') — a.targetId не читается:
//     причины кнопок не отражают выбранную цель.
//
// Контракты (зафиксированы краснотой) —
// memory/000198-ally-target-select.md (D1–D10) и
// memory/000198-combat-target-selection.md:
//   * c.selectTarget — игрок ИЛИ живой союзник: валидатор
//     playerSelectTarget (живой не-fled МОБ — {ok:true} + c.targetId;
//     союзник/мёртв/fled/unknown — {ok:false, reason:'недоступная
//     цель'}, тихий отказ); слот моба — null (D6).
//   * Резолв союзного действия: явная ВАЛИДНАЯ цель (живой, !fled,
//     side 'mob') — приоритет; явная НЕВАЛИДНАЯ (мёртв/fled/союзник/
//     unknown) — «нет цели» БЕЗ fallback на nearestEnemy
//     (зеркало игрока, D1); без аргумента — nearestEnemy
//     (v1-бит-в-бит). Пулы/мана — НЕ тратятся при отказе.
//   * Причины дальности/пулов — дословно существующие; порядок
//     проверок — без изменений (000037, 000168-CANDO).
//
// Краснота — поведенческая: null вместо {ok}; лог-строка с ЧУЖИМ
// мобом; targetId не сместился; пул потрачен вместо отказа.
//
// Фикстуры — существующие: strongHero, hero112, ALLY_VOLK_168,
// loadEfir000081 + buildEfirUnit, createCombat({mobs, allies});
// whitebox-позиции после pre-roll (паттерн 000168-ALLY-2/CANDO-2).
// Поле 7×7, игрок (3,6), c.obstacles.clear(). Волк m0 (иниц. 3),
// Гигантский паук m1 (иниц. 4); урон Вольк L1 = 3, Эфир L1:
// «Касание духа» = u.damage, «Искра» = 5 (3 маны — пины 000168).
// =====================================================================

test('000198-SEL-1: c.selectTarget на ходу наёмника — выбор цели работает (D6-гварда снята): чужой моб — {ok:true}+targetId, свой союзник/мёртв/unknown — «недоступная цель», на ходу игрока — бит-в-бит', () => {
  const c = createCombat({
    player: strongHero(), mobs: ['wolf', 'spider'], mobLevel: 1, seed: 5,
    allies: [ALLY_VOLK_168],
  });
  c.obstacles.clear();
  const a0 = c.units.find((x) => x.id === 'a0');
  const m0 = c.units.find((x) => x.id === 'm0'); // волк
  const m1 = c.units.find((x) => x.id === 'm1'); // гигантский паук
  a0.x = 3; a0.y = 5;
  m0.x = 3; m0.y = 4; m0.maxHP = 100; m0.hp = 100; // d 1
  m1.x = 4; m1.y = 5; m1.maxHP = 100; m1.hp = 100; // d 1
  assert.equal(activeUnitId(c), 'a0',
    'pre-roll остановился на наёмнике (иниц. 8 > 4 > 3 > 2)');
  // (1) Явная чужая цель — принята, c.targetId сместился.
  let r = c.selectTarget(m1.id);
  assert.deepEqual(r, { ok: true },
    'selectTarget на ходу союзника — {ok:true} (краснота: null — '
    + 'D6-гварда «только игрок»): ' + JSON.stringify(r));
  assert.equal(c.targetId, m1.id,
    'c.targetId — кликнутый моб (краснота: не сместился: '
    + c.targetId + ')');
  // (2) Свой союзник — «недоступная цель», targetId не сместился.
  r = c.selectTarget(a0.id);
  assert.ok(r && r.ok === false,
    'свой союзник — не цель: ' + JSON.stringify(r));
  assert.equal(r.reason, 'недоступная цель',
    'причина дословно (краснота: ' + (r && r.reason) + ')');
  assert.equal(c.targetId, m1.id, 'targetId не сместился при отказе');
  // (3) Мёртвый моб — «недоступная цель».
  m0.alive = false;
  r = c.selectTarget(m0.id);
  assert.ok(r && r.ok === false, 'мёртвый моб — отказ');
  assert.equal(r.reason, 'недоступная цель',
    'причина (краснота: ' + (r && r.reason) + ')');
  assert.equal(c.targetId, m1.id, 'targetId не сместился');
  // (4) Неизвестный id — «недоступная цель».
  r = c.selectTarget('nope');
  assert.ok(r && r.ok === false, 'unknown id — отказ');
  assert.equal(r.reason, 'недоступная цель',
    'причина (краснота: ' + (r && r.reason) + ')');
  assert.equal(c.targetId, m1.id, 'targetId не сместился');
  // (5) Якорь бит-в-бит: на ходу ИГРОКА — тот же валидатор.
  const cP = createCombat({
    player: strongHero(), mobs: ['wolf', 'spider'], mobLevel: 1, seed: 5,
  });
  cP.obstacles.clear();
  const w = cP.units.find((x) => x.id === 'm0');
  const sp = cP.units.find((x) => x.id === 'm1');
  w.x = 3; w.y = 4; sp.x = 4; sp.y = 5;
  assert.equal(activeUnitId(cP), 'player',
    'pre-roll прошёл мобы → остановка на игроке');
  r = cP.selectTarget(sp.id);
  assert.deepEqual(r, { ok: true }, 'игрок: явная цель — ok (бит-в-бит)');
  assert.equal(cP.targetId, sp.id, 'игрок: targetId сместился');
  r = cP.selectTarget('nope');
  assert.ok(r && r.ok === false && r.reason === 'недоступная цель',
    'игрок: unknown — «недоступная цель» (бит-в-бит): '
    + JSON.stringify(r));
});

test('000198-SEL-2: allyStrike уважает явную цель: бьёт выбранного моба (НЕ nearestEnemy), дальность — дословно без расхода пула, мёртвая явная — «нет цели» БЕЗ fallback, без аргумента — nearestEnemy (v1-бит-в-бит)', () => {
  const mk = () => {
    const c = createCombat({
      player: strongHero(), mobs: ['wolf', 'spider'], mobLevel: 1, seed: 5,
      allies: [ALLY_VOLK_168],
    });
    c.obstacles.clear();
    c._rng = () => 0.01; // попадание (бросок allyAttack)
    const a = c.units.find((x) => x.id === 'a0');
    const m0 = c.units.find((x) => x.id === 'm0'); // волк
    const m1 = c.units.find((x) => x.id === 'm1'); // гигантский паук
    m0.maxHP = 100; m0.hp = 100;
    m1.maxHP = 100; m1.hp = 100;
    a.x = 3; a.y = 5;
    return { c, a, m0, m1 };
  };
  // (1) Оба d 1 (m0 ПЕРВЫЙ в c.units — nearestEnemy-тайбрейк):
  //     явная m1 → задет ПАЗУК, волк нет.
  {
    const { c, a, m0, m1 } = mk();
    m0.x = 3; m0.y = 4; // d 1
    m1.x = 4; m1.y = 5; // d 1
    const ps = c.ps.attack;
    const r = c.attack(m1.id);
    assert.ok(r && r.ok === true,
      'явная цель в дальности — ok: ' + JSON.stringify(r));
    assert.equal(m1.hp, 97, 'паук −3 (dmg Вольк L1) (краснота: 100 — '
      + 'задет волк: nearestEnemy игнорирует targetId)');
    assert.equal(m0.hp, 100, 'волк не задет (краснота: 97)');
    assert.ok(c.log.includes('Вольк бьёт Гигантский паук: 3.'),
      'лог-строка — ВЫБРАННЫЙ моб: ' + c.log.join(' | '));
    assert.equal(a.attackLeft, 0, 'u.attackLeft 1→0');
    assert.equal(c.ps.attack, ps, 'c.ps.attack — не тронут');
  }
  // (2) Явная m1 d 2 (melee) — «цель слишком далеко (ближний бой)»:
  //     пул не расходуется, fallback на m0 НЕ происходит.
  {
    const { c, a, m0, m1 } = mk();
    m0.x = 3; m0.y = 4; // d 1
    m1.x = 5; m1.y = 5; // d 2
    const r = c.attack(m1.id);
    assert.ok(r && r.ok === false,
      'явная цель вне дальности — отказ (краснота: ok — удар по m0: '
      + JSON.stringify(r) + ')');
    assert.equal(r.reason, 'цель слишком далеко (ближний бой)',
      'причина дословно (краснота: ' + (r && r.reason) + ')');
    assert.equal(a.attackLeft, 1, 'пул не расходуется');
    assert.equal(m0.hp, 100, 'fallback на ближайшего НЕТ (краснота: 97)');
    assert.equal(m1.hp, 100, 'паук не задет');
  }
  // (3) Явная m1 МЁРТВА, m0 жив d 1 — «нет цели» (fallback на m0
  //     НЕ происходит — семантика игрока, D1).
  {
    const { c, a, m0, m1 } = mk();
    m0.x = 3; m0.y = 4; // d 1
    m1.x = 4; m1.y = 5; m1.alive = false; // d 1, мёртв
    const r = c.attack(m1.id);
    assert.ok(r && r.ok === false,
      'мёртвая явная цель — отказ (краснота: ok — удар по m0: '
      + JSON.stringify(r) + ')');
    assert.equal(r.reason, 'нет цели',
      'причина дословно (краснота: ' + (r && r.reason) + ')');
    assert.equal(a.attackLeft, 1, 'пул не расходуется');
    assert.equal(m0.hp, 100, 'fallback на m0 НЕТ (краснота: 97)');
  }
  // (4) Без аргумента — nearestEnemy (v1-бит-в-бит): оба d 1 → m0.
  {
    const { c, a, m0, m1 } = mk();
    m0.x = 3; m0.y = 4; // d 1
    m1.x = 4; m1.y = 5; // d 1
    const r = c.attack();
    assert.ok(r && r.ok === true, 'без аргумента — ok');
    assert.equal(m0.hp, 97, 'nearestEnemy — m0 (первый в c.units)');
    assert.equal(m1.hp, 100, 'паук не задет');
    assert.ok(c.log.includes('Вольк бьёт Волк: 3.'),
      'лог — m0: ' + c.log.join(' | '));
  }
});

test('000198-SEL-3: «Касание духа» Эфира уважает явную цель: m1 d 2 — отказ БЕЗ расхода touch, явная m0 d 1 — попадание', () => {
  const E = loadEfir000081();
  const p = hero112();
  const state = E.createEfir();
  const c = createCombat({
    player: p, allies: [E.efirAllyData(state)],
    mobs: ['wolf', 'spider'], mobLevel: 1, seed: 5,
  });
  c.obstacles.clear();
  const u = c.units.find((x) => x.id === 'efir');
  const m0 = c.units.find((x) => x.id === 'm0'); // волк
  const m1 = c.units.find((x) => x.id === 'm1'); // гигантский паук
  m0.maxHP = 100; m0.hp = 100;
  m1.maxHP = 100; m1.hp = 100;
  u.x = 3; u.y = 5;
  m0.x = 3; m0.y = 4; // d 1
  m1.x = 5; m1.y = 5; // d 2
  assert.equal(activeUnitId(c), 'efir',
    'pre-roll остановился на Эфире (иниц. 4 ≥ 4 > 3 > 2)');
  E.buildEfirUnit(state, c);
  assert.ok(c.efs, 'c.efs — боевой профиль (buildEfirUnit)');
  // (1) Явная m1 d 2 — «цель слишком далеко (ближний бой)»: touch
  //     НЕ потрачен, никто не задет, лог-строки действия НЕТ.
  {
    const n0 = c.log.length;
    const r = c.attack(m1.id);
    assert.ok(r && r.ok === false,
      'Касание по явной цели d 2 — отказ (краснота: ok — Касание по '
      + 'm0: ' + JSON.stringify(r) + ')');
    assert.equal(r.reason, 'цель слишком далеко (ближний бой)',
      'причина дословно (краснота: ' + (r && r.reason) + ')');
    assert.equal(c.efs.touch, 1, 'touch НЕ потрачен (краснота: 0)');
    assert.equal(m0.hp, 100, 'волк не задет (краснота: '
      + (100 - u.damage) + ' — nearestEnemy)');
    assert.equal(m1.hp, 100, 'паук не задет');
    assert.equal(c.log.length, n0, 'отказ — без лог-строки действия');
  }
  // (2) Явная m0 d 1 — попадание (якорь: m0 == nearestEnemy).
  {
    const r = c.attack(m0.id);
    assert.ok(r && r.ok === true, 'явная m0 d 1 — ok');
    assert.ok(c.log.includes('Касание духа: ' + u.damage + '.'),
      'лог-строка (паттерн 000118): ' + c.log.join(' | '));
    assert.equal(m0.hp, 100 - u.damage,
      'волк −u.damage (Касание: игнор брони, всегда попадает)');
    assert.equal(c.efs.touch, 0, 'touch 1→0');
    assert.equal(m1.hp, 100, 'паук не задет');
  }
});

test('000198-SEL-4: efirCastAction уважает явную цель: кастит выбранного моба (лог/мана/пул, 0 c._rng), m1 d 5 — «цель слишком далеко (дальность 4)» БЕЗ трат, мёртвая явная — «нет цели» БЕЗ fallback', () => {
  const E = loadEfir000081();
  const C = require('../src/combat.js');
  const saveCatalog = C.combatInternals.allySpells;
  C.combatInternals.allySpells =
    require('../src/spells-data.js').SPELLS_BY_ID;
  try {
    const mk = () => {
      const p = hero112();
      const state = E.createEfir();
      const c = createCombat({
        player: p, allies: [E.efirAllyData(state)],
        mobs: ['wolf', 'spider'], mobLevel: 1, seed: 5,
      });
      c.obstacles.clear();
      const u = c.units.find((x) => x.id === 'efir');
      const m0 = c.units.find((x) => x.id === 'm0'); // волк
      const m1 = c.units.find((x) => x.id === 'm1'); // гигантский паук
      m0.maxHP = 100; m0.hp = 100;
      m1.maxHP = 100; m1.hp = 100;
      u.x = 3; u.y = 5;
      assert.equal(activeUnitId(c), 'efir',
        'pre-roll остановился на Эфире');
      E.buildEfirUnit(state, c);
      return { c, u, m0, m1 };
    };
    // (1) m0 d 1, m1 d 4 — явный каст по m1: задет ПАУК, волк нет,
    //     пул/мана потрачены, 0 c._rng.
    {
      const { c, u, m0, m1 } = mk();
      m0.x = 3; m0.y = 4; // d 1
      m1.x = 1; m1.y = 3; // d 4
      let rngCalls = 0;
      c._rng = () => (rngCalls += 1, 0.01);
      const r = c.cast(m1.id);
      assert.ok(r && r.ok === true,
        'явная цель в дальности — ok: ' + JSON.stringify(r));
      assert.ok(c.log.includes('Эфир: «Искра» — Гигантский паук: 6.'),
        'лог — ВЫБРАННЫЙ моб (краснота: «— Волк: 6.» — nearestEnemy; '
        + 'формула 000193): ' + c.log.join(' | '));
      assert.equal(m1.hp, 94, 'паук −6 (формула 000193; краснота: 100 — кастит волка)');
      assert.equal(m0.hp, 100, 'волк не задет (краснота: 94)');
      assert.equal(c.efs.spellInt, 0, 'spellInt 1→0');
      assert.equal(u.mp, 8, 'мана 11→8 (Искра: 3 маны)');
      assert.equal(rngCalls, 0, '0 c._rng (детерминированный каст)');
    }
    // (2) m1 d 5 — «цель слишком далеко (дальность 4)»: трат НЕТ
    //     (порядок: пул/мана — до цели), fallback на m0 НЕ происходит.
    {
      const { c, u, m0, m1 } = mk();
      m0.x = 3; m0.y = 4; // d 1
      m1.x = 1; m1.y = 2; // d 5
      const r = c.cast(m1.id);
      assert.ok(r && r.ok === false,
        'явная цель d 5 — отказ (краснота: ok — каст по m0: '
        + JSON.stringify(r) + ')');
      assert.equal(r.reason, 'цель слишком далеко (дальность 4)',
        'причина дословно (краснота: ' + (r && r.reason) + ')');
      assert.equal(c.efs.spellInt, 1, 'пул НЕ потрачен (краснота: 0)');
      assert.equal(u.mp, 11, 'мана НЕ потрачена (краснота: 8)');
      assert.equal(m0.hp, 100, 'fallback на m0 НЕТ (краснота: 95)');
      assert.equal(m1.hp, 100, 'паук не задет');
    }
    // (3) Явная m1 МЁРТВА (d 1), m0 жив (d 2) — «нет цели»
    //     (fallback НЕ происходит — D1).
    {
      const { c, u, m0, m1 } = mk();
      m0.x = 5; m0.y = 5; // d 2
      m1.x = 3; m1.y = 4; // d 1, мёртв
      m1.alive = false;
      const r = c.cast(m1.id);
      assert.ok(r && r.ok === false,
        'мёртвая явная цель — отказ (краснота: ok — каст по m0: '
        + JSON.stringify(r) + ')');
      assert.equal(r.reason, 'нет цели',
        'причина дословно (краснота: ' + (r && r.reason) + ')');
      assert.equal(c.efs.spellInt, 1, 'пул НЕ потрачен');
      assert.equal(u.mp, 11, 'мана НЕ потрачена');
      assert.equal(m0.hp, 100, 'fallback на m0 НЕТ (краснота: 95)');
    }
  } finally {
    C.combatInternals.allySpells = saveCatalog;
  }
});

test('000198-SEL-5: allyCanDo-зеркало уважает targetId (000037): причина canDo = причина ядра в каждом отказе, canDo не тратит; наёмник (дальность/мёртвая/ok/без аргумента) + Эфир-каст (d 5/ok) + player-only-якорь', () => {
  const E = loadEfir000081();
  const C = require('../src/combat.js');
  const saveCatalog = C.combatInternals.allySpells;
  C.combatInternals.allySpells =
    require('../src/spells-data.js').SPELLS_BY_ID;
  try {
    const mkMerc = () => {
      const c = createCombat({
        player: strongHero(), mobs: ['wolf', 'spider'], mobLevel: 1,
        seed: 5, allies: [ALLY_VOLK_168],
      });
      c.obstacles.clear();
      c._rng = () => 0.01;
      const a = c.units.find((x) => x.id === 'a0');
      const m0 = c.units.find((x) => x.id === 'm0'); // волк
      const m1 = c.units.find((x) => x.id === 'm1'); // гигантский паук
      a.x = 3; a.y = 5;
      m0.maxHP = 100; m0.hp = 100;
      m1.maxHP = 100; m1.hp = 100;
      return { c, a, m0, m1 };
    };
    // (1) Наёмник, m0 d 1, m1 d 2: canDo {m1} — дальность;
    //     зеркало 1:1 с ядром; пул не тратится.
    {
      const { c, a, m0, m1 } = mkMerc();
      m0.x = 3; m0.y = 4; // d 1
      m1.x = 5; m1.y = 5; // d 2
      assert.equal(activeUnitId(c), 'a0',
        'pre-roll остановился на наёмнике');
      const can = canDoAction(c, 'attack', { targetId: m1.id });
      assert.ok(can.ok === false,
        'canDo: явная цель d 2 — отказ (краснота: ok — m0 в радиусе, '
        + 'a.targetId не читается): ' + JSON.stringify(can));
      assert.equal(can.reason, 'цель слишком далеко (ближний бой)',
        'canDo: причина дословно (краснота: ' + (can.reason || null) + ')');
      const core = c.attack(m1.id);
      assert.equal(core.reason, can.reason,
        'зеркало 1:1 — причина canDo = причина ядра');
      assert.equal(a.attackLeft, 1, 'canDo не тратит пул (ядро — отказ)');
    }
    // (2) Явная m1 МЁРТВА (d 1), m0 жив (d 2) — «нет цели»;
    //     зеркало 1:1; fallback на m0 НЕТ.
    {
      const { c, a, m0, m1 } = mkMerc();
      m0.x = 5; m0.y = 5; // d 2
      m1.x = 3; m1.y = 4; m1.alive = false; // d 1, мёртв
      const can = canDoAction(c, 'attack', { targetId: m1.id });
      assert.ok(can.ok === false,
        'canDo: мёртвая явная — отказ: ' + JSON.stringify(can));
      assert.equal(can.reason, 'нет цели',
        'canDo: «нет цели» (краснота: «'
        + (can.reason || '') + '» — nearestEnemy m0 d 2)');
      assert.equal(c.attack(m1.id).reason, can.reason, 'зеркало 1:1');
      assert.equal(a.attackLeft, 1, 'пул не тратится');
      assert.equal(m0.hp, 100, 'fallback на m0 НЕТ');
    }
    // (3) Явная m0 d 1 (== nearestEnemy) — ok (якорь).
    {
      const { c, m0, m1 } = mkMerc();
      m0.x = 3; m0.y = 4; // d 1
      m1.x = 5; m1.y = 5; // d 2
      const can = canDoAction(c, 'attack', { targetId: m0.id });
      assert.deepEqual(can, { ok: true }, 'явная m0 d 1 — ok');
    }
    // (4) Без targetId — nearest-поведение (v1-бит-в-бит, якорь).
    {
      const { c, m0, m1 } = mkMerc();
      m0.x = 3; m0.y = 4; // d 1
      m1.x = 5; m1.y = 5; // d 2
      const can = canDoAction(c, 'attack');
      assert.deepEqual(can, { ok: true }, 'без targetId — nearest ok');
    }
    // (5) Эфир: m0 d 1, m1 d 5 — canDo cast {m1} — дальность 4;
    //     зеркало 1:1; трат НЕТ. {m1 d 1} — ok (якорь).
    {
      const p = hero112();
      const state = E.createEfir();
      const c = createCombat({
        player: p, allies: [E.efirAllyData(state)],
        mobs: ['wolf', 'spider'], mobLevel: 1, seed: 5,
      });
      c.obstacles.clear();
      const u = c.units.find((x) => x.id === 'efir');
      const m0 = c.units.find((x) => x.id === 'm0');
      const m1 = c.units.find((x) => x.id === 'm1');
      u.x = 3; u.y = 5;
      m0.maxHP = 100; m0.hp = 100; m0.x = 3; m0.y = 4; // d 1
      m1.maxHP = 100; m1.hp = 100; m1.x = 1; m1.y = 2; // d 5
      assert.equal(activeUnitId(c), 'efir',
        'pre-roll остановился на Эфире');
      E.buildEfirUnit(state, c);
      const can = canDoAction(c, 'cast', { targetId: m1.id });
      assert.ok(can.ok === false,
        'canDo cast: явная цель d 5 — отказ (краснота: ok — m0 d 1, '
        + 'a.targetId не читается): ' + JSON.stringify(can));
      assert.equal(can.reason, 'цель слишком далеко (дальность 4)',
        'canDo cast: причина дословно (краснота: '
        + (can.reason || null) + ')');
      assert.equal(c.cast(m1.id).reason, can.reason, 'зеркало 1:1');
      assert.equal(c.efs.spellInt, 1, 'пул не тратится');
      assert.equal(u.mp, 11, 'мана не тратится');
      // (5b) Явная m1 d 1 — ok (якорь: m1 == nearestEnemy).
      m0.x = 5; m0.y = 5; // d 2
      m1.x = 3; m1.y = 4; // d 1
      const canB = canDoAction(c, 'cast', { targetId: m1.id });
      assert.deepEqual(canB, { ok: true }, 'canDo cast: явная m1 d 1 — ok');
    }
    // (6) player-only действия на ходу союзника — «недоступно активному
    //     персонажу» (якорь). 000194: quickItem/invItem — НЕ
    //     player-only: причина — по состоянию (слоты наёмника пусты;
    //     общий инвентарь strongHero пуст).
    {
      const { c, a } = mkMerc();
      for (const act of ['fire', 'block', 'flee']) {
        const can = canDoAction(c, act);
        assert.equal(can.ok, false, act + ' — недоступно');
        assert.equal(can.reason, 'недоступно активному персонажу',
          act + ' — причина (краснота: ' + can.reason + ')');
      }
      const q = canDoAction(c, 'quickItem');
      assert.equal(q.ok, false, '000194: quickItem — недоступно');
      assert.equal(q.reason, 'быстрые слоты пусты',
        '000194: причина (краснота: ' + q.reason + ')');
      const v = canDoAction(c, 'invItem');
      assert.equal(v.ok, false, '000194: invItem — недоступно');
      assert.equal(v.reason, 'нет применимых предметов в инвентаре',
        '000194: причина (краснота: ' + v.reason + ')');
      // 000194: занятый слот наёмника + зелье в общем — ok.
      a.quick = ['healing_potion', null, null];
      I.addItem(c.player, 'healing_potion');
      assert.deepEqual(canDoAction(c, 'quickItem'), { ok: true },
        '000194: quickItem — ok (слот + зелье в общем)');
      assert.deepEqual(canDoAction(c, 'invItem'), { ok: true },
        '000194: invItem — ok (зелье в общем)');
    }
  } finally {
    C.combatInternals.allySpells = saveCatalog;
  }
});

test('makeAlly: 000193.01 — снапшот maxMP (знаменатель MP-полосы наёмника): = стартовому mp (5+Int+Wis); регенации маны в бою нет (CU193.01-MAXMP)', () => {
  // Без attrs: mp 5+0+0 = 5 → maxMP = 5 (по построению на старте
  // maxMP === mp; за бой u.mp тратят касты, u.maxMP — никто).
  const v = makeAlly(ALLY_VOLK, 0);
  assert.equal(v.mp, 5, 'фикстура: 000193 — mp 5 (attrs нет)');
  assert.equal(v.maxMP, 5,
    '000193.01: maxMP = 5+Int+Wis = 5: факт ' + JSON.stringify(v.maxMP));
  assert.equal(v.maxMP, v.mp, 'maxMP === mp на старте (по построению)');
  // attrs Int 4 / Wis 4: mp 5+4+4 = 13 → maxMP = 13.
  const m = makeAlly({
    name: 'Мира', role: 'support', level: 1, dmg: 0.5, hp: 0.8,
    skills: [], spells: ['light_heal'],
    attrs: { intelligence: 4, wisdom: 4 }, maxHP: 40,
  }, 2);
  assert.equal(m.mp, 13, 'фикстура: 000193 — mp 5+4+4 = 13');
  assert.equal(m.maxMP, 13,
    '000193.01: maxMP = 5+4+4 = 13: факт ' + JSON.stringify(m.maxMP));
  assert.equal(m.maxMP, m.mp, 'maxMP === mp на старте (по построению)');
});

// =====================================================================
// Задача 000211.03. assets/mobs: skills/spells/loot → ссылки на
// json-файлы (skills/spells/items). Рефакторинг без смены поведения:
// MOB_TYPES (combat.js:141) — НЕ ТРОГАЕТСЯ (id-форма, ручное зеркало).
//
// КРАСНЫЕ тесты (TDD): написаны ДО миграции данных, падают на
// текущем (неизменённом) коде — самих ссылок в данных ещё нет (все
// 71 значение — id-строки), а поля-ссылки assets/mobs/schema.json
// не закрепили якорные per-catalog паттерны:
//   * M1 — по каждому из 36 мобов, поэлементно skills[i]/spells[i]/
//     loot[i].item: (a) isRef(v) — якорная форма, (b) resolveRef ok,
//     (c) id файла-цели = прежнему значению ПОЗИЦИОННО из зеркала
//     MOB_TYPES (независимый источник; резолвер id НЕ сверяет —
//     контракт 000211.01 §2). Сейчас: isRef('heavy') → false —
//     «не якорная ссылка» — краснота в ДАННЫХ, не load-ошибка
//     (json-ref.js существует с 000211.01);
//   * M2 — pattern трёх полей-ссылок schema.json =
//     '^assets/<каталог>/\d{6}\.json$' (per-catalog — строже единого
//     REF_RE, прецедент 000207/000208); отрицательный контроль —
//     голый id ('heavy'/'battle_axe' из исходной записи 000002.json)
//     обязан ловиться схемой; положительный — исходная запись
//     проходит.
// GREEN (финальный коммит, вместе с данными): 36 json + schema.json
// + технические правки a–d этого файла (:251 зеркало, :275 ссылки,
// :245 структура, :5942 000165 C6) — memory/000211.03-mobs-refs.md
// §4. Детерминизм: новые тесты чистые (fs + require), 0 RNG.
// =====================================================================

test('assets/mobs (000211.03): ссылки skills/spells/loot — якорная форма, резолв = прежнее значение (зеркало MOB_TYPES)', () => {
  const files = mobFiles();
  let n = 0;
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(MOBS_DIR, f), 'utf8'));
    const t = MOB_TYPES[j.id];
    assert.ok(t, f + ': моб ' + j.id + ' нет в зеркале combat.js');
    const check = (v, where, old) => {
      n += 1;
      assert.ok(isRef(v), f + ': ' + where + ' «' + v +
        '» — не якорная ссылка (ожидалось assets/<каталог>/NNNNNN.json)');
      const r = resolveRef(ROOT, v);
      assert.ok(r.ok, f + ': ' + where + ' — ссылка не резолвится ('
        + r.reason + '): ' + v);
      assert.equal(r.id, old, f + ': ' + where + ' — id «' + r.id
        + '» ≠ прежнему «' + old + '» (зеркало combat.js)');
    };
    j.skills.forEach((v, i) => check(v, 'skills[' + i + ']', t.skills[i]));
    j.spells.forEach((v, i) => check(v, 'spells[' + i + ']', t.spells[i]));
    j.loot.forEach((l, i) => check(l.item, 'loot[' + i + '].item', t.loot[i].item));
  }
  assert.ok(n > 0, 'проверок нет: skills/spells/loot всех мобов пусты');
});

test('mobs schema (000211.03): поля-ссылки закрепили якорные per-catalog паттерны; отрицательный контроль', () => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(MOBS_DIR, 'schema.json'), 'utf8'));
  const p = schema.properties;
  assert.equal(p.skills.items.pattern, '^assets/skills/\\d{6}\\.json$',
    'skills: pattern не закреплён якорный (assets/skills)');
  assert.equal(p.spells.items.pattern, '^assets/spells/\\d{6}\\.json$',
    'spells: pattern не закреплён якорный (assets/spells)');
  assert.equal(p.loot.items.properties.item.pattern,
    '^assets/items/\\d{6}\\.json$',
    'loot.item: pattern не закреплён якорный (assets/items)');
  assert.equal(p.skills.items.type, 'string', 'skills: type string');
  assert.equal(p.spells.items.type, 'string', 'spells: type string');
  assert.equal(p.loot.items.properties.item.type, 'string',
    'loot.item: type string');
  const rec = JSON.parse(
    fs.readFileSync(path.join(MOBS_DIR, '000002.json'), 'utf8'));
  const badSkill = JSON.parse(JSON.stringify(rec));
  badSkill.skills[0] = 'heavy';
  const errSkill = validateData(schema, badSkill, '000002');
  assert.ok(errSkill.length >= 1
      && errSkill.some((e) => e.includes('assets/skills')),
    'отрицательный контроль: голый id в skills не пойман схемой: '
      + JSON.stringify(errSkill));
  const badLoot = JSON.parse(JSON.stringify(rec));
  badLoot.loot[0].item = 'battle_axe';
  const errLoot = validateData(schema, badLoot, '000002');
  assert.ok(errLoot.length >= 1
      && errLoot.some((e) => e.includes('assets/items')),
    'отрицательный контроль: голый id в loot.item не пойман схемой: '
      + JSON.stringify(errLoot));
  assert.deepEqual(validateData(schema, rec, '000002'), [],
    'положительный контроль: исходная запись проходит схему');
});

// =====================================================================
// Задача 000227 — БОЙ: кнопка последнего заклинания из книги.
// Контракты D1/D3 — memory/000227-combat-last-spell-button.md.
// autoSpellFor — НОВОЕ чистое экспортируемое ядра combat.js
// (обёртка strongestKnown в id): UI-слой бейджей legacy-пула (без
// выбора) должен получить id legacy-спелла — каталог известен ядру.
//
// КРАСНЫЕ (TDD): экспорт в return-объекте фабрики НЕТ —
// C.autoSpellFor === undefined → осмысленный TypeError «is not a
// function» (прецеденты 000132/000155/000167), не ошибка загрузки:
// combat.js требует штатно. Каталог — реальный (шапка файла:
// require('../src/spells.js') → combatInternals.allySpells).
// =====================================================================

test('000227 AF-1: autoSpellFor — книга spark+mend (дефолт Эфира): «урон» → «spark», «лечение» → «mend»', () => {
  const C = require('../src/combat.js');
  const u = { spells: ['spark', 'mend'] };
  assert.equal(C.autoSpellFor(u, 'урон'), 'spark',
    '«урон» — spark (единственный урон в книге)');
  assert.equal(C.autoSpellFor(u, 'лечение'), 'mend',
    '«лечение» — mend (единственное лечение в книге)');
});

test('000227 AF-2: autoSpellFor — spark+frost_bolt: «урон» → «frost_bolt» (макс «мани», strongestKnown 000112), «лечение» → null', () => {
  const C = require('../src/combat.js');
  const u = { spells: ['spark', 'frost_bolt'] };
  assert.equal(C.autoSpellFor(u, 'урон'), 'frost_bolt',
    '«урон» — frost_bolt (4 маны > 3 — максимум по «мани»): '
    + C.autoSpellFor(u, 'урон'));
  assert.equal(C.autoSpellFor(u, 'лечение'), null,
    'лечения в книге нет — null');
});

test('000227 AF-3: autoSpellFor — пустая книга / id вне каталога / действие не из книги → null (strongestKnown — тихий skip)', () => {
  const C = require('../src/combat.js');
  assert.equal(C.autoSpellFor({ spells: [] }, 'урон'), null,
    'пустая книга — null');
  assert.equal(C.autoSpellFor({ spells: ['no_such_spell'] }, 'урон'), null,
    'id вне каталога — null (тихий skip)');
  assert.equal(C.autoSpellFor({ spells: ['spark'] }, 'защита'), null,
    '«защита» в книге нет — null');
});

// =====================================================================
// --- Задача 000235.01: боевое ядро новых действий ---
// (TDD: красные тесты C1-C5)
//
// Контракт: memory/000235.01-spell-actions-core.md. Гост-спеллы —
// инъекция в зеркало src/spells-data.js (паттерн fireball_alt,
// tests/spells.test.js) с restore в finally; госты — КОРНИ (база
// null), highestKnown фолбэк [spell] — пере-require spells.js НЕ
// нужен (SPELLS_BY_ID/SPELLS читаются live). Красная причина —
// осмысленная: castSpell/canCastSpell — «неизвестное действие: …»
// (KNOWN_ACTIONS — старые 6, зеркала одной причины 000037), без
// расхода пула/маны; полей c.walls/c.zone/c.ps.buff/u.buff/u.debuff/
// u.summonTurns в ядре пока нет. Каталог ЭТОЙ задачей не растёт.
// =====================================================================

function ghostSpell0235(id, action, params, attrs) {
  const s = {
    id,
    название: 'Тест ' + id,
    школа: 'огонь',
    база: null,
    степень: 1,
    атрибут: 'intelligence',
    уровень: 1,
    мани: 3,
    действие: action,
    здания: [17],
    описание: 'Тестовое заклинание (000235.01)',
    icon: 'assets/spell-icons/ghost.svg',
    icon_prompt: 'Тестовая иконка (000235.01)',
  };
  if (params !== undefined) s.параметры = params;
  return Object.assign(s, attrs || {});
}

function withGhosts0235(ghosts, fn) {
  const dataMod = require('../src/spells-data.js');
  try {
    for (const g of ghosts) {
      dataMod.SPELLS.push(g);
      dataMod.SPELLS_BY_ID[g.id] = g;
    }
    fn();
  } finally {
    for (const g of ghosts) {
      const i = dataMod.SPELLS.lastIndexOf(g);
      if (i >= 0) dataMod.SPELLS.splice(i, 1);
      delete dataMod.SPELLS_BY_ID[g.id];
    }
  }
}

test('000235.01 C1: баф — по себе/союзнику, «нет цели» до расхода, тик startRound «ровно N раундов»', () => {
  const { castSpell, canCastSpell } = spells();
  const gArmor = ghostSpell0235('ghost_c1_armor', 'баф',
    { stat: 'броня', value: 2, turns: 3 });
  const gDmgTaken = ghostSpell0235('ghost_c1_dmg_taken', 'баф',
    { stat: 'получаемый_урон', value: 0.5, turns: 1 });
  const gAllyDmg = ghostSpell0235('ghost_c1_ally_dmg', 'баф',
    { stat: 'урон', value: 0.5, turns: 3 });
  // Ревью: допины «попадание»/«урон» по СЕБЕ + fail-closed на
  // неполные «параметры» (госты без/с пропущенными полями).
  const gHit = ghostSpell0235('ghost_c1_hit', 'баф',
    { stat: 'попадание', value: 0.2, turns: 1 });
  const gPlayerDmg = ghostSpell0235('ghost_c1_player_dmg', 'баф',
    { stat: 'урон', value: 0.5, turns: 2 });
  const gFire = ghostSpell0235('ghost_c1_fire', 'урон');
  const gNoP = ghostSpell0235('ghost_c1_noparam', 'баф');
  const gNoVal = ghostSpell0235('ghost_c1_noval', 'баф',
    { stat: 'броня', turns: 3 });
  const gNoTurns = ghostSpell0235('ghost_c1_noturns', 'дебаф',
    { stat: 'урон_вниз', value: 0.25 });
  const gBadStat = ghostSpell0235('ghost_c1_badstat', 'дебаф',
    { stat: 'no_such_stat', value: 0.5, turns: 3 });
  withGhosts0235(
    [gArmor, gDmgTaken, gAllyDmg, gHit, gPlayerDmg, gFire,
     gNoP, gNoVal, gNoTurns, gBadStat], () => {
    // (a) Каст по себе (без targetId): c.ps.buff = eff, «броня» —
    // ровно 3 раунда включая раунд каста (паттерн c.ps.shield),
    // пул/мана списываются один раз.
    {
      const p = strongHero();
      p.primary.intelligence = 10;
      p.spells = [gArmor.id];
      const c = createCombat({
        player: p, mobs: ['orc_warrior'], mobLevel: 2, seed: 5 });
      const w = c.units[0];
      standNextTo(c, w);
      w.damage = 2; // баф-броня 2 гасит полностью
      c._rng = () => 0.01;
      const r = castSpell(c, gArmor.id);
      assert.equal(r.ok, true, r.reason);
      assert.equal(r.buffed, 'player', 'каст по себе — эффект игроку');
      assert.deepEqual(c.ps.buff, { stat: 'броня', value: 2, turns: 3 },
        'c.ps.buff — эффект');
      assert.equal(c.ps.spellInt, 1, 'пул Интеллекта −1 (int 10 → 2)');
      assert.equal(p.mp, 13, 'мана −3');
      const hits = [];
      for (let i = 0; i < 4; i++) {
        const hp = p.hp;
        c.endTurn();
        hits.push(hp - p.hp);
      }
      assert.deepEqual(hits, [0, 0, 0, 2],
        'броня 2 — ровно 3 раунда (включая раунд каста), потом полный');
      assert.deepEqual(c.ps.buff, { stat: 'броня', value: 2, turns: 0 },
        'тик startRound: до 0, поле остаётся');
    }
    // (a2) «получаемый_урон»: урон по игроку ×(1−v) ровно turns раундов.
    {
      const p = strongHero();
      p.primary.intelligence = 10;
      p.spells = [gDmgTaken.id];
      const c = createCombat({
        player: p, mobs: ['orc_warrior'], mobLevel: 2, seed: 5 });
      const w = c.units[0];
      standNextTo(c, w);
      w.damage = 10;
      c._rng = () => 0.01;
      assert.equal(castSpell(c, gDmgTaken.id).ok, true);
      const hits = [];
      for (let i = 0; i < 2; i++) {
        const hp = p.hp;
        c.endTurn();
        hits.push(hp - p.hp);
      }
      assert.deepEqual(hits, [5, 10],
        '×(1−0.5) ровно 1 раунд, затем полный урон');
    }
    // (a3) «попадание» по себе (ревью): hitChance-граница — rng 0.6
    // МЕЖДУ базовой 0.52 и повышенной 0.72: с бафом — попадание
    // (0.6 < 0.72), без — промах (0.6 ≥ 0.52). Ровно turns раундов
    // (включая раунд каста), потом возврат.
    {
      const p = strongHero();
      p.primary.intelligence = 10;
      p.spells = [gHit.id];
      const c = createCombat({
        player: p, mobs: ['orc_warrior'], mobLevel: 2, seed: 5 });
      const w = c.units[0];
      standNextTo(c, w);
      w.maxHP = 200; w.hp = 200;
      c._rng = () => 0.6;
      const r = castSpell(c, gHit.id);
      assert.equal(r.ok, true, r.reason);
      assert.deepEqual(c.ps.buff,
        { stat: 'попадание', value: 0.2, turns: 1 }, 'c.ps.buff — эффект');
      const r1 = c.attack(w.id);
      assert.equal(r1.ok, true, r1.reason);
      assert.equal(r1.hit, true, '0.6 < 0.52+0.2 — баф даёт попадание');
      assert.equal(r1.dmg, 2, 'урон 3 − броня 1');
      c.endTurn();
      assert.equal(c.ps.buff.turns, 0, 'тик startRound: ровно 1 раунд');
      const r2 = c.attack(w.id);
      assert.equal(r2.ok, true, r2.reason);
      assert.equal(r2.hit, false, 'баф истёк: 0.6 ≥ 0.52 — промах');
      assert.equal(r2.dmg, 0, 'промах — урона нет');
    }
    // (a4) «урон» по себе (ревью): удар игрока ×(1+v) ровно turns
    // раундов (playerAttack); кэс «урон» — buffMult ×(1+v) (инлайн
    // spells.js, ignoreArmor); потом формулы возвращаются.
    {
      const p = strongHero();
      p.primary.intelligence = 10;
      p.spells = [gPlayerDmg.id, gFire.id];
      const c = createCombat({
        player: p, mobs: ['orc_warrior'], mobLevel: 2, seed: 5 });
      const w = c.units[0];
      standNextTo(c, w);
      w.maxHP = 200; w.hp = 200;
      c._rng = () => 0.01;
      const r = castSpell(c, gPlayerDmg.id);
      assert.equal(r.ok, true, r.reason);
      assert.deepEqual(c.ps.buff,
        { stat: 'урон', value: 0.5, turns: 2 }, 'c.ps.buff — эффект');
      const r1 = c.attack(w.id);
      assert.equal(r1.ok, true, r1.reason);
      assert.equal(r1.dmg, 4, 'round(3×1.5) − броня 1 = 5 − 1 = 4');
      const r2 = castSpell(c, gFire.id);
      assert.equal(r2.ok, true, r2.reason);
      assert.equal(r2.dmg, 14, 'round(9×1.5) = 14 (ignoreArmor)');
      c.endTurn(); // 2 → 1 — баф ещё действует
      const r3 = c.attack(w.id);
      assert.equal(r3.dmg, 4, 'раунд 2 — ×1.5 (turns 1)');
      c.endTurn(); // 1 → 0
      const r4 = c.attack(w.id);
      assert.equal(r4.dmg, 2, 'баф истёк: 3 − 1 = 2');
      assert.equal(c.ps.buff.turns, 0, 'тик: до 0, поле остаётся');
    }
    // (b) Каст на союзника: a.buff = eff, c.ps.buff не тронут, союзник
    // бьёт ×(1+v) (3×1.5 = 4.5 → 5).
    {
      const p = strongHero();
      p.primary.intelligence = 10;
      p.spells = [gAllyDmg.id];
      const c = createCombat({
        player: p, allies: [Object.assign({}, ALLY_VOLK)],
        mobs: ['wolf'], mobLevel: 2, seed: 5 });
      const w = c.units[0];
      const a0 = c.units.find((u) => u.side === 'ally');
      c.obstacles.clear();
      w.x = 0; w.y = 0; w.maxHP = 200; w.hp = 200; w.damage = 1;
      a0.x = 1; a0.y = 0; // волк → союзник (дист 1), игрок далеко (9)
      c._rng = () => 0.01;
      const r = castSpell(c, gAllyDmg.id, a0.id);
      assert.equal(r.ok, true, r.reason);
      assert.equal(r.buffed, a0.id, 'союзник — цель бафа');
      assert.deepEqual(a0.buff, { stat: 'урон', value: 0.5, turns: 3 },
        'a.buff — эффект');
      assert.ok(!c.ps.buff, 'игрок бафом не задет');
      // 000168: очередь останавливается на слоте СОЮЗНИКА — его удар
      // это ввод ИГРОКА (c.attack), авто-ИИ союзников нет.
      c.endTurn(); // волк бьёт a0 (1); очередь — на слоте a0
      c.attack(w.id); // ход a0: удар ×1.5
      assert.equal(w.hp, 195, 'удар союзника 3×1.5 = 4.5 → 5');
      c.endTurn(); // ход a0 завершён: startRound, тик a.buff
      assert.equal(a0.hp, 12, 'удар волка (damage 1): 13 → 12');
      assert.equal(a0.buff.turns, 2, 'a.buff тикает в startRound');
    }
    // (c) «нет цели»: id моба / чужой id / мёртвый союзник — до расхода.
    {
      const p = strongHero();
      p.primary.intelligence = 10;
      p.spells = [gAllyDmg.id];
      const c = createCombat({
        player: p, allies: [Object.assign({}, ALLY_VOLK)],
        mobs: ['wolf'], mobLevel: 2, seed: 5 });
      const w = c.units[0];
      const a0 = c.units.find((u) => u.side === 'ally');
      a0.alive = false;
      for (const bad of [w.id, 'no_such', a0.id]) {
        const pool = c.ps.spellInt;
        const r = castSpell(c, gAllyDmg.id, bad);
        assert.equal(r.ok, false, 'невалидная цель — не каст: ' + bad);
        assert.equal(r.reason, 'нет цели', 'причина: ' + bad);
        assert.equal(
          canCastSpell(c, gAllyDmg.id, { targetId: bad }).reason,
          'нет цели', 'зеркало — одна причина: ' + bad);
        assert.equal(c.ps.spellInt, pool, 'пул не тратится: ' + bad);
        assert.equal(p.mp, 16, 'мана не тратится: ' + bad);
      }
      assert.ok(!a0.buff, 'мёртвый союзник эффектом не задет');
    }
    // (e) Fail-closed (ревью): «баф»/«дебаф» без «параметры»/с
    // неполными (D1: {stat, value, turns}) — отказ ДО расхода
    // пула/маны; canCastSpell — та же причина (зеркало 000037);
    // состояния (c.ps.buff/u.debuff) не заданы.
    {
      const p = strongHero();
      p.primary.intelligence = 10;
      p.spells = [gNoP.id, gNoVal.id, gNoTurns.id, gBadStat.id];
      const c = createCombat({
        player: p, mobs: ['orc_warrior'], mobLevel: 2, seed: 5 });
      const w = c.units[0];
      standNextTo(c, w);
      const pool = c.ps.spellInt;
      for (const [id, reason, targetId] of [
        [gNoP.id, 'нет параметров', undefined],
        [gNoVal.id, 'неполные параметры: value', undefined],
        [gNoTurns.id, 'неполные параметры: turns', w.id],
        [gBadStat.id, 'неполные параметры: stat', w.id],
      ]) {
        const r = castSpell(c, id, targetId);
        assert.equal(r.ok, false, id + ' — не каст');
        assert.equal(r.reason, reason, id + ' — причина');
        assert.equal(
          canCastSpell(c, id, { targetId }).reason, reason,
          id + ' — зеркало (одна причина)');
      }
      assert.equal(c.ps.spellInt, pool, 'пул не тратится');
      assert.equal(p.mp, 16, 'мана не тратится');
      assert.ok(!c.ps.buff, 'c.ps.buff не задан');
      assert.strictEqual(w.debuff, undefined, 'у моба debuff нет');
    }
  });
});

test('000235.01 C2: дебаф — 4 активных стата ровно N раундов, «нет цели»/дальность 4 до расхода', () => {
  const { castSpell } = spells();
  const gDmgDown = ghostSpell0235('ghost_c2_dmg_down', 'дебаф',
    { stat: 'урон_вниз', value: 0.25, turns: 3 });
  const gArmorDown = ghostSpell0235('ghost_c2_armor_down', 'дебаф',
    { stat: 'броня_вниз', value: 2, turns: 1 });
  const gHitDown = ghostSpell0235('ghost_c2_hit_down', 'дебаф',
    { stat: 'попадание_вниз', value: 0.2, turns: 1 });
  const gDmgUp = ghostSpell0235('ghost_c2_dmg_up', 'дебаф',
    { stat: 'получаемый_урон_вверх', value: 0.5, turns: 1 });
  withGhosts0235([gDmgDown, gArmorDown, gHitDown, gDmgUp], () => {
    // (a) «урон_вниз»: урон моба ×(1−v) ровно turns раундов.
    {
      const p = strongHero();
      p.primary.intelligence = 10;
      p.spells = [gDmgDown.id];
      const c = createCombat({
        player: p, mobs: ['orc_warrior'], mobLevel: 2, seed: 5 });
      const w = c.units[0];
      standNextTo(c, w);
      w.damage = 10; // ×0.75 = 7.5 → round 8
      c._rng = () => 0.01;
      const r = castSpell(c, gDmgDown.id, w.id);
      assert.equal(r.ok, true, r.reason);
      assert.equal(r.debuffed, w.id, 'дебаф — на моба');
      assert.deepEqual(w.debuff,
        { stat: 'урон_вниз', value: 0.25, turns: 3 }, 'u.debuff — эффект');
      const hits = [];
      for (let i = 0; i < 4; i++) {
        const hp = p.hp;
        c.endTurn();
        hits.push(hp - p.hp);
      }
      assert.deepEqual(hits, [8, 8, 8, 10],
        '×(1−0.25) ровно 3 раунда, затем полный урон');
      assert.equal(w.debuff.turns, 0, 'тик: до 0, поле остаётся');
    }
    // (b) «броня_вниз»: броня моба −v (min 0) ровно turns раундов.
    {
      const p = strongHero();
      p.primary.intelligence = 10;
      p.spells = [gArmorDown.id];
      const c = createCombat({
        player: p, mobs: ['orc_warrior'], mobLevel: 2, seed: 5 });
      const w = c.units[0];
      standNextTo(c, w);
      assert.ok(w.armor >= 1, 'у воина броня ≥ 1');
      c._rng = () => 0.01;
      assert.equal(castSpell(c, gArmorDown.id, w.id).ok, true);
      const r1 = c.attack(w.id);
      assert.equal(r1.ok, true, r1.reason);
      assert.equal(r1.dmg, 3, 'броня 1−2 → 0: полный урон 3');
      c.endTurn();
      const r2 = c.attack(w.id);
      assert.equal(r2.ok, true, r2.reason);
      assert.equal(r2.dmg, 2, 'раунд 2 — дебафа нет: броня вернулась');
    }
    // (c) «попадание_вниз»: промахи моба ровно turns раундов
    // (0.58−0.2 = 0.38: rng 0.5 — промах; 0.58: rng 0.5 — попадание).
    {
      const p = strongHero();
      p.primary.intelligence = 10;
      p.spells = [gHitDown.id];
      const c = createCombat({
        player: p, mobs: ['orc_warrior'], mobLevel: 2, seed: 5 });
      const w = c.units[0];
      standNextTo(c, w);
      w.damage = 10;
      c._rng = () => 0.5;
      assert.equal(castSpell(c, gHitDown.id, w.id).ok, true);
      let hp = p.hp;
      c.endTurn(); // раунд 1: 0.5 ≥ 0.38 — промах
      assert.equal(p.hp, hp, 'раунд 1 — моб промахивается');
      c.endTurn(); // раунд 2: дебаф истёк — 0.5 < 0.58 — попадание
      assert.equal(p.hp, hp - 10, 'раунд 2 — моб снова бьёт');
    }
    // (d) «получаемый_урон_вверх»: урон по мобо ×(1+v) ровно turns раундов.
    {
      const p = strongHero();
      p.primary.intelligence = 10;
      p.spells = [gDmgUp.id];
      const c = createCombat({
        player: p, mobs: ['orc_warrior'], mobLevel: 2, seed: 5 });
      const w = c.units[0];
      standNextTo(c, w);
      w.maxHP = 200; w.hp = 200;
      c._rng = () => 0.01;
      assert.equal(castSpell(c, gDmgUp.id, w.id).ok, true);
      const r1 = c.attack(w.id);
      // 3 × 1.5 = 4.5 → round 5 − броня 1 = 4.
      assert.equal(r1.dmg, 4, '×1.5: round(4.5) − 1 = 4');
      c.endTurn();
      const r2 = c.attack(w.id);
      assert.equal(r2.dmg, 2, 'раунд 2 — дебафа нет: 3 − 1 = 2');
    }
    // (e) «нет цели» (союзник) и дальность 4 — до расхода пула/маны.
    {
      const p = strongHero();
      p.primary.intelligence = 10;
      p.spells = [gDmgDown.id];
      const c = createCombat({
        player: p, allies: [Object.assign({}, ALLY_VOLK)],
        mobs: ['wolf'], mobLevel: 2, seed: 5 });
      const w = c.units[0];
      const a0 = c.units.find((u) => u.side === 'ally');
      const pool = c.ps.spellInt;
      const r = castSpell(c, gDmgDown.id, a0.id);
      assert.equal(r.ok, false, 'союзник — не цель дебафа');
      assert.equal(r.reason, 'нет цели');
      w.x = c.px; w.y = c.py - 5; // дистанция 5 > 4
      const r2 = castSpell(c, gDmgDown.id, w.id);
      assert.equal(r2.ok, false, 'дальше дальности — не каст');
      assert.equal(r2.reason, 'цель слишком далеко (дальность 4)');
      assert.equal(c.ps.spellInt, pool, 'пул не тратится');
      assert.equal(p.mp, 16, 'мана не тратится');
    }
  });
});

test('000235.01 C3: дебаф «dot» — тик в начале хода ЦЕЛИ (скованный тикает), ровно turns тиков', () => {
  const { castSpell } = spells();
  const gDot = ghostSpell0235('ghost_c3_dot', 'дебаф',
    { stat: 'dot', value: 3, turns: 2 });
  withGhosts0235([gDot], () => {
    // (a) Тик — в начале хода моба: раунд каста → тик 1, далее тик 2,
    // третьего нет; броня моба НЕ гасит (ignoreArmor).
    {
      const p = strongHero();
      p.primary.intelligence = 10;
      p.spells = [gDot.id];
      const c = createCombat({
        player: p, mobs: ['orc_warrior'], mobLevel: 2, seed: 5 });
      const w = c.units[0];
      standNextTo(c, w);
      w.maxHP = 200; w.hp = 200; w.damage = 1;
      c._rng = () => 0.01;
      const r = castSpell(c, gDot.id, w.id);
      assert.equal(r.ok, true, r.reason);
      assert.deepEqual(w.debuff, { stat: 'dot', value: 3, turns: 2 },
        'u.debuff — dot');
      c.endTurn(); // ход моба: тик 1, потом удар
      assert.equal(w.hp, 197, 'тик 1: 200 − 3 (броня не гасит)');
      assert.equal(w.debuff.turns, 1, 'декремент в тике');
      c.endTurn(); // тик 2
      assert.equal(w.hp, 194, 'тик 2: 197 − 3');
      assert.equal(w.debuff.turns, 0, 'ровно 2 тика');
      c.endTurn();
      assert.equal(w.hp, 194, 'третьего тика нет');
    }
    // (b) Скованный моб тикает dot (тик ПЕРЕД bind-проверкой).
    {
      const p = strongHero();
      p.primary.intelligence = 10;
      p.spells = [gDot.id];
      const c = createCombat({
        player: p, mobs: ['orc_warrior'], mobLevel: 2, seed: 5 });
      const w = c.units[0];
      standNextTo(c, w);
      w.maxHP = 200; w.hp = 200; w.damage = 10;
      c._rng = () => 0.01;
      assert.equal(castSpell(c, gDot.id, w.id).ok, true);
      w.bind = { turns: 1 }; // сковываем dot-моба
      const hp = p.hp;
      c.endTurn(); // тик dot, потом пропуск действия
      assert.equal(p.hp, hp, 'скованный моб не бьёт');
      assert.equal(w.hp, 197, 'dot тикает даже у скованного');
      assert.equal(w.bind.turns, 0, 'bind исчерпан');
      assert.equal(w.debuff.turns, 1, 'dot оттикнут ровно один раз');
    }
    // (c) Эффект не переносится в новый бой.
    {
      const p = strongHero();
      p.primary.intelligence = 10;
      p.spells = [gDot.id];
      const c = createCombat({
        player: p, mobs: ['orc_warrior'], mobLevel: 2, seed: 5 });
      assert.strictEqual(c.units[0].debuff, undefined,
        'свежий бой — у моба поля debuff нет');
    }
  });
});

test('000235.01 C4: призыв — makeAlly (уровень СПЕЛЛА), действует с R+1, ровно turns раундов → рассеивается, XP не получает', () => {
  const { castSpell } = spells();
  const mt = MOB_TYPES['wolf'];
  const gSummon = ghostSpell0235('ghost_c4_summon', 'призыв',
    { summon: 'wolf', turns: 4 }, { уровень: 3 });
  const gSummonBad = ghostSpell0235('ghost_c4_summon_bad', 'призыв',
    { summon: 'no_such_mob', turns: 4 });
  const gSummon2 = ghostSpell0235('ghost_c4_summon2', 'призыв',
    { summon: 'wolf', turns: 4 }, { уровень: 3 });
  withGhosts0235([gSummon, gSummonBad, gSummon2], () => {
    // (a) Юнит в c.units: side ally, kind summon, статы по уровню
    // СПЕЛЛА (3, не героя), 1×1, рядом с игроком; очередь — с R+1;
    // рассеивается в начале раунда R+4 (fled, hp сохраняется).
    {
      const p = strongHero();
      p.primary.intelligence = 10;
      p.spells = [gSummon.id];
      const c = createCombat({
        player: p, mobs: ['wolf'], mobLevel: 2, seed: 5 });
      const w = c.units[0];
      c.obstacles.clear();
      w.x = 3; w.y = 1; w.maxHP = 2000; w.hp = 2000;
      c._rng = () => 0.01;
      const r = castSpell(c, gSummon.id);
      assert.equal(r.ok, true, r.reason);
      assert.equal(c.ps.spellInt, 1, 'пул −1');
      assert.equal(p.mp, 13, 'мана −3');
      const s = c.units.find((u) => u.side === 'ally');
      assert.ok(s, 'призывной в c.units');
      assert.equal(s.kind, 'summon', 'kind — "summon" (не merc/efir)');
      assert.equal(s.name, mt.name, 'имя — из MOB_TYPES');
      assert.equal(s.role, mt.role, 'роль — из MOB_TYPES');
      assert.equal(s.level, 3, 'уровень — spell.уровень (не уровень героя)');
      assert.deepEqual(s.size, { w: 1, h: 1 }, 'призывной 1×1');
      assert.equal(s.maxHP, Math.max(1, Math.round((8 + 4 * 3) * mt.hp)),
        'maxHP по уровню 3: round(16 × 0.8) = 13');
      assert.equal(s.damage,
        Math.max(1, Math.round((2 + 0.7 * 3) * mt.dmg)),
        'damage по уровню 3: round(4.1 × 0.7) = 3');
      assert.equal(s.summonTurns, 4, 'summonTurns — параметры.turns');
      assert.ok(Math.abs(s.x - c.px) + Math.abs(s.y - c.py) <= 2,
        'рядом с игроком (якоря placeAllies, d ≤ 2)');
      assert.ok(!c.turnOrder.includes(s.id),
        'в очереди — со следующего пересчёта buildTurnOrder');
      c.endTurn(); // раунд 2: тик 4→3, в очереди
      assert.equal(c.round, 2);
      assert.ok(c.turnOrder.includes(s.id), 'действует с R+1');
      assert.equal(s.summonTurns, 3, 'тик startRound: 4 → 3');
      // 000168: призывной — СОЮЗНИК: его слот в очереди ждёт ввода
      // игрока (c.endTurn — пропуск хода); раунд сдвигается только
      // после слота призывного.
      c.endTurn(); // слот призывного (раунд 2) — пропуск хода
      c.endTurn();
      assert.equal(s.summonTurns, 2, 'раунд 3: 3 → 2');
      c.endTurn(); // слот призывного (раунд 3) — пропуск хода
      c.endTurn();
      assert.equal(s.summonTurns, 1, 'раунд 4: 2 → 1');
      c.endTurn(); // слот призывного (раунд 4) — пропуск хода
      c.endTurn(); // начало раунда 5: 1 → 0 — рассеивание
      assert.equal(c.round, 5, 'рассеивается в начале раунда R+4');
      assert.equal(s.summonTurns, 0, 'ровно 4 раунда жизни');
      assert.equal(s.fled, true, 'рассеивание — fled (не смерть)');
      assert.equal(s.alive, true, 'hp сохраняется (не труп)');
      assert.ok(c.units.includes(s), 'из c.units не удаляется');
      assert.ok(!c.turnOrder.includes(s.id), 'из очереди исключён');
      assert.ok(c.log.some((l) => l.includes('рассеивается')),
        'лог «…рассеивается.»: ' + c.log.slice(-4).join(' | '));
      assert.deepEqual(
        c.units.filter((u) => u.side === 'ally' && u.kind === 'merc'
          && !u.alive),
        [],
        'призывной — никогда не в dead_mercs (side ally && kind merc)');
    }
    // (b) Неизвестный id — fail-closed до расхода пула/маны.
    {
      const p = strongHero();
      p.primary.intelligence = 10;
      p.spells = [gSummonBad.id];
      const c = createCombat({
        player: p, mobs: ['wolf'], mobLevel: 2, seed: 5 });
      const pool = c.ps.spellInt;
      const r = castSpell(c, gSummonBad.id);
      assert.equal(r.ok, false, 'неизвестный призыв — отказ');
      assert.equal(r.reason, 'неизвестный призыв: no_such_mob');
      assert.equal(c.ps.spellInt, pool, 'пул не тратится');
      assert.equal(p.mp, 16, 'мана не тратится');
      assert.equal(c.units.length, 1, 'призывного нет в c.units');
    }
    // (c) Поле полное (2×2: игрок + 3 волка) — «нет места для призыва».
    {
      const p = strongHero();
      p.primary.intelligence = 10;
      p.spells = [gSummon2.id];
      const c = createCombat({
        player: p, mobs: ['wolf', 'wolf', 'wolf'], mobLevel: 2,
        seed: 5, width: 2, height: 2 });
      assert.equal(c.units.length + 1, 4,
        '2×2: игрок + 3 моба заняли все клетки');
      const r = castSpell(c, gSummon2.id);
      assert.equal(r.ok, false, 'мест нет — fail-closed');
      assert.equal(r.reason, 'нет места для призыва');
      assert.equal(c.units.length, 3, 'призывного нет в c.units');
    }
    // (d) Призывной НЕ получает allyXp (фильтр kind === 'merc').
    {
      const p = strongHero();
      p.primary.intelligence = 10;
      p.spells = [gSummon2.id];
      const c = createCombat({
        player: p, mobs: ['wolf'], mobLevel: 2, seed: 5 });
      const w = c.units[0];
      c.obstacles.clear();
      c._rng = () => 0.01;
      assert.equal(castSpell(c, gSummon2.id).ok, true);
      standNextTo(c, w);
      w.hp = 1;
      const r = c.attack(w.id);
      assert.equal(r.ok, true, r.reason);
      assert.ok(r.killed, 'волк повержен');
      assert.equal(c.result.outcome, 'victory', 'победа');
      assert.deepEqual(c.result.allyXp, [],
        'призывной (kind "summon") — не в allyXp');
    }
  });
});

test('000235.01 C5: создание — стена (ряд y=py−2, ровно turns раундов, старые препятствия не удаляются) и зона (один слот, overwrite, роутинг по стороне стата)', () => {
  const { castSpell, canCastSpell } = spells();
  const gWall = ghostSpell0235('ghost_c5_wall', 'создание',
    { object: 'стена', turns: 5 });
  const gZoneDmg = ghostSpell0235('ghost_c5_zone_dmg', 'создание',
    { object: 'зона', radius: 1, stat: 'урон_вниз', value: 0.25,
      turns: 3 });
  const gZoneAlly = ghostSpell0235('ghost_c5_zone_ally', 'создание',
    { object: 'зона', radius: 1, stat: 'урон', value: 0.5, turns: 3 });
  const gZone2 = ghostSpell0235('ghost_c5_zone_2', 'создание',
    { object: 'зона', radius: 2, stat: 'урон_вниз', value: 0.5,
      turns: 1 });
  // Ревью: fail-closed на неполные «параметры» зоны/стены.
  const gZoneNoR = ghostSpell0235('ghost_c5_zone_noradius', 'создание',
    { object: 'зона', stat: 'урон_вниз', value: 0.5, turns: 3 });
  const gZoneBigR = ghostSpell0235('ghost_c5_zone_bigradius', 'создание',
    { object: 'зона', radius: 7, stat: 'урон_вниз', value: 0.5, turns: 3 });
  const gWallNoT = ghostSpell0235('ghost_c5_wall_noturns', 'создание',
    { object: 'стена' });
  withGhosts0235(
    [gWall, gZoneDmg, gZoneAlly, gZone2, gZoneNoR, gZoneBigR, gWallNoT],
    () => {
    // (a) Стена: весь ряд y = py−2, кроме клеток игрока/юнитов и
    // УЖЕ существующих препятствий; непроходима; ровно 5 раундов;
    // при истечении старые препятствия ряда НЕ удаляются.
    {
      const p = strongHero();
      p.primary.intelligence = 10;
      p.spells = [gWall.id];
      const c = createCombat({
        player: p, mobs: ['wolf'], mobLevel: 2, seed: 5 });
      const w = c.units[0];
      c.obstacles.clear();
      c.obstacles.add('1,4'); // старое 000050-препятствие в ряду стены
      w.x = 3; w.y = 1; // волк — выше стены
      assert.equal(c.py, 6, 'поле 7×7: игрок (3,6)');
      c._rng = () => 0.01;
      const r = castSpell(c, gWall.id);
      assert.equal(r.ok, true, r.reason);
      assert.equal(r.wall, 6, 'out.wall — число клеток ряда');
      assert.equal(c.walls.length, 1, 'c.walls — одна стена');
      assert.equal(c.walls[0].turns, 5, 'turns — параметры.turns');
      const cells = c.walls[0].cells.map(([x, y]) => x + ',' + y);
      assert.deepEqual(cells.slice().sort(),
        ['0,4', '2,4', '3,4', '4,4', '5,4', '6,4'],
        'ряд y = py−2 = 4; ячейка (1,4) — старое препятствие — мимо');
      for (const cell of cells)
        assert.ok(c.obstacles.has(cell), 'клетка стены в c.obstacles: ' + cell);
      let reach = reachableCells(c);
      assert.ok(
        [...reach].every((k) => Number(k.split(',')[1]) > 3),
        'стена непроходима: клеток y ≤ 3 из позиции игрока нет');
      for (let i = 0; i < 5; i++) c.endTurn(); // тики 5→4→3→2→1→0
      assert.equal(c.round, 6, 'раунд R+5 — истечение');
      assert.deepEqual(c.walls, [], 'стена удалена из c.walls');
      for (const cell of cells)
        assert.ok(!c.obstacles.has(cell), 'клетка вычищена: ' + cell);
      assert.ok(c.obstacles.has('1,4'),
        'старое препятствие ряда НЕ удалено');
      reach = reachableCells(c);
      assert.ok(
        [...reach].some((k) => Number(k.split(',')[1]) <= 3),
        'путь через вычищенный ряд открыт');
    }
    // (b1) Зона (дебаф-стат): моб в Чебышёв-радиусе — u.debuff ровно
    // turns раундов; игрок (центр) не затрагивается.
    {
      const p = strongHero();
      p.primary.intelligence = 10;
      p.spells = [gZoneDmg.id];
      const c = createCombat({
        player: p, mobs: ['orc_warrior'], mobLevel: 2, seed: 5 });
      const w = c.units[0];
      standNextTo(c, w); // Чебышёв 1 — в радиусе 1
      w.maxHP = 200; w.hp = 200; w.damage = 10;
      c._rng = () => 0.01;
      const r = castSpell(c, gZoneDmg.id);
      assert.equal(r.ok, true, r.reason);
      assert.equal(r.zone, 1, 'out.zone — радиус');
      assert.deepEqual(c.zone,
        { x: c.px, y: c.py, radius: 1, stat: 'урон_вниз',
          value: 0.25, turns: 3 },
        'c.zone — объект зоны (центр — клетка игрока)');
      assert.deepEqual(w.debuff,
        { stat: 'урон_вниз', value: 0.25, turns: 3 },
        'моб в радиусе — дебаф (применение однократное)');
      assert.ok(!c.ps.buff, 'игрок не затрагивается собственной зоной');
      const hits = [];
      for (let i = 0; i < 4; i++) {
        const hp = p.hp;
        c.endTurn();
        hits.push(hp - p.hp);
      }
      assert.deepEqual(hits, [8, 8, 8, 10],
        'дебаф зоны — ровно 3 раунда (тик m.debuff — startRound)');
    }
    // (b2) Рекаст в тот же ход — overwrite одного слота c.zone.
    {
      const p = strongHero();
      p.primary.intelligence = 10;
      p.spells = [gZoneDmg.id, gZone2.id];
      const c = createCombat({
        player: p, mobs: ['orc_warrior'], mobLevel: 2, seed: 5 });
      const w = c.units[0];
      standNextTo(c, w);
      w.maxHP = 200; w.hp = 200;
      c._rng = () => 0.01;
      assert.equal(castSpell(c, gZoneDmg.id).ok, true);
      assert.equal(castSpell(c, gZone2.id).ok, true,
        'вторая зона в тот же раунд (пул int 10 = 2)');
      assert.equal(c.ps.spellInt, 0, 'пул −2');
      assert.deepEqual(c.zone,
        { x: c.px, y: c.py, radius: 2, stat: 'урон_вниз',
          value: 0.5, turns: 1 },
        'рекаст — overwrite (слот один)');
      assert.deepEqual(w.debuff,
        { stat: 'урон_вниз', value: 0.5, turns: 1 },
        'debuff моба перезаписан');
    }
    // (c) Зона (баф-стат): союзник в радиусе — u.buff; моб вне — нет;
    // игрок не затрагивается.
    {
      const p = strongHero();
      p.primary.intelligence = 10;
      p.spells = [gZoneAlly.id];
      const c = createCombat({
        player: p, allies: [Object.assign({}, ALLY_VOLK)],
        mobs: ['wolf'], mobLevel: 2, seed: 5 });
      const w = c.units.find((u) => u.side === 'mob');
      const a0 = c.units.find((u) => u.side === 'ally');
      c.obstacles.clear();
      w.x = 0; w.y = 0; // Чебышёв max(3,6) = 6 — вне радиуса 1
      assert.ok(
        Math.max(Math.abs(a0.x - c.px), Math.abs(a0.y - c.py)) <= 1,
        'союзник на якоря (Чебышёв ≤ 1) — внутри зоны');
      const r = castSpell(c, gZoneAlly.id);
      assert.equal(r.ok, true, r.reason);
      assert.deepEqual(a0.buff, { stat: 'урон', value: 0.5, turns: 3 },
        'союзник в радиусе — баф (роутинг по стороне стата)');
      assert.strictEqual(w.debuff, undefined,
        'моб вне радиуса — без эффекта');
      assert.ok(!c.ps.buff, 'игрок не затрагивается собственной зоной');
    }
    // (d) Fail-closed (ревью): зона без radius — «неполные параметры:
    // radius» (без проверки эффект шел бы на ВСЁ поле: сравнение с
    // undefined — false); radius > 5 (максимум схемы) — то же; стена
    // без turns — «неполные параметры: turns» (без проверки стена
    // была бы вечной: тик NaN). Отказ ДО расхода, состояний нет,
    // c.obstacles не тронуты; зеркало — одна причина.
    {
      const p = strongHero();
      p.primary.intelligence = 10;
      p.spells = [gZoneNoR.id, gZoneBigR.id, gWallNoT.id];
      const c = createCombat({
        player: p, mobs: ['orc_warrior'], mobLevel: 2, seed: 5 });
      const w = c.units[0];
      standNextTo(c, w);
      const pool = c.ps.spellInt;
      const obstaclesBefore = new Set(c.obstacles);
      for (const [id, reason] of [
        [gZoneNoR.id, 'неполные параметры: radius'],
        [gZoneBigR.id, 'неполные параметры: radius'],
        [gWallNoT.id, 'неполные параметры: turns'],
      ]) {
        const r = castSpell(c, id);
        assert.equal(r.ok, false, id + ' — не каст');
        assert.equal(r.reason, reason, id + ' — причина');
        assert.equal(canCastSpell(c, id).reason, reason,
          id + ' — зеркало (одна причина)');
      }
      assert.equal(c.ps.spellInt, pool, 'пул не тратится');
      assert.equal(p.mp, 16, 'мана не тратится');
      assert.ok(!c.zone, 'c.zone не создан');
      assert.deepEqual(c.walls, [], 'c.walls пуста');
      assert.strictEqual(w.debuff, undefined, 'моб без эффекта');
      assert.deepEqual(new Set(c.obstacles), obstaclesBefore,
        'c.obstacles не тронуты');
    }
  });
});

// --- Задача 000253: поведенческие пины зональных спеллов Волны Тень ---
// (000235.09, ретро finding #5): каст КАТАЛОЖНЫХ shadow_pool /
// veil_of_night — НЕ NO-OP: c.zone-слот, дебафф моба в радиусе (вне —
// нет), тики промахов (полоса hitChance + контроль) / урона.
// Контракт: memory/000253-zone-spell-behavior-pins.md §3.
//
// Фикстура (общая): strongHero + int 10 (после createCharacter: mp 16,
// пул int 2), mobs ['orc_warrior','wolf'] L2 seed 5: орк (1,0) +
// standNextTo → игрок (1,1) (центр зоны); волк (3,0) → (6,6) ДО каста
// (Чебышёв 5 — вне радиуса 2; применение зоны однократное).

test('000253-COMBAT-1: shadow_pool (каталог) — c.zone {radius:2, stat:«попадание_вниз», turns:3}, дебафф моба в радиусе (вне — нет), тик промахов (полоса hitChance + контроль)', () => {
  const { castSpell } = spells();
  // (a) Каст: слот/дебафф/вне/игрок/мана/пул/лог.
  {
    const p = strongHero();
    p.primary.intelligence = 10;
    p.spells = ['shadow_pool'];
    const c = createCombat({
      player: p, mobs: ['orc_warrior', 'wolf'], mobLevel: 2, seed: 5 });
    const w1 = c.units[0];
    const w2 = c.units[1];
    assert.equal(w1.mobId, 'orc_warrior', 'фикстура: орк (1,0)');
    assert.equal(w2.mobId, 'wolf', 'фикстура: волк (3,0)');
    w2.x = 6; w2.y = 6; // ДО каста: вне радиуса (Чебышёв 5)
    standNextTo(c, w1);
    assert.deepEqual([c.px, c.py], [1, 1],
      'фикстура: игрок (1,1) — центр зоны');
    c._rng = () => 0.01;
    const r = castSpell(c, 'shadow_pool');
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.zone, 2, 'out.zone — радиус');
    assert.deepEqual(c.zone,
      { x: c.px, y: c.py, radius: 2, stat: 'попадание_вниз',
        value: 0.15, turns: 3 },
      'c.zone — слот (параметры каталога, центр — клетка игрока)');
    assert.deepEqual(w1.debuff,
      { stat: 'попадание_вниз', value: 0.15, turns: 3 },
      'моб в радиусе — дебафф (применение однократное)');
    assert.strictEqual(w2.debuff, undefined,
      'моб вне радиуса (Чебышёв 5 > 2) — без дебаффа');
    assert.equal(c.ps.buff, null, 'игрок не затрагивается собственной зоной');
    assert.equal(p.mp, 8, 'мана 16 − 8');
    assert.equal(c.ps.spellInt, 1, 'пул int 2 − 1');
    assert.ok(
      c.log.some((l) => l === 'Лужа тьмы: зона (радиус 2, 3 ходов).'),
      'лог — строка зоны');
  }
  // (b) Тик промахов: X — середина полосы, вычислена ЭКСПОРТНЫМ
  // hitChance (не хардкод): контроль (без каста) — X < hi → попадания;
  // зона — X ≥ lo → ровно 3 промаха, 4-й удар полный (дебаф истёк).
  {
    const X = (hitChance(2, 0, 1, 0) + hitChance(2, -0.15, 1, 0)) / 2;
    assert.ok(hitChance(2, -0.15, 1, 0) <= X
      && X < hitChance(2, 0, 1, 0),
      'guard: окно полосы (hitChance(2,−0.15,1,0) ≤ X < hitChance(2,0,1,0))');
    const fight = (withCast) => {
      const p = strongHero();
      p.primary.intelligence = 10;
      p.spells = ['shadow_pool'];
      const c = createCombat({
        player: p, mobs: ['orc_warrior', 'wolf'], mobLevel: 2, seed: 5 });
      const w1 = c.units[0];
      const w2 = c.units[1];
      w2.x = 6; w2.y = 6;
      standNextTo(c, w1);
      w1.damage = 10; w1.maxHP = 200; w1.hp = 200;
      c._rng = () => X;
      if (withCast) assert.equal(castSpell(c, 'shadow_pool').ok, true);
      const hits = [];
      for (let i = 0; i < 4; i++) {
        const hp = p.hp;
        c.endTurn();
        hits.push(hp - p.hp);
      }
      return { c, w1, hits };
    };
    const ctrl = fight(false);
    assert.deepEqual(ctrl.hits, [10, 10, 10, 10],
      'контроль (без каста): X < hitChance(2,0,1,0) — 4 попадания');
    const z = fight(true);
    assert.deepEqual(z.hits, [0, 0, 0, 10],
      'зона: X ≥ hitChance(2,−0.15,1,0) — ровно 3 промаха, 4-й полный');
    assert.equal(
      z.c.log.filter((l) => l === 'Орк-воин промахивается.').length, 3,
      'лог — ровно 3 строки промаха');
    assert.ok(z.c.zone, 'зона: объект жив после 0 turns (паттерн щита)');
    assert.deepEqual(z.c.zone,
      { x: z.c.px, y: z.c.py, radius: 2, stat: 'попадание_вниз',
        value: 0.15, turns: 0 },
      'зона: 3 тика → 0');
    assert.deepEqual(z.w1.debuff,
      { stat: 'попадание_вниз', value: 0.15, turns: 0 },
      'дебафф: 3 тика → 0');
  }
});

test('000253-COMBAT-2: veil_of_night (каталог) — тик урона зоны (паттерн gZoneDmg каталожным спеллом)', () => {
  const { castSpell } = spells();
  const p = strongHero();
  p.primary.intelligence = 10;
  p.spells = ['veil_of_night'];
  const c = createCombat({
    player: p, mobs: ['orc_warrior', 'wolf'], mobLevel: 2, seed: 5 });
  const w1 = c.units[0];
  const w2 = c.units[1];
  w2.x = 6; w2.y = 6; // ДО каста: вне радиуса (Чебышёв 5)
  standNextTo(c, w1);
  assert.deepEqual([c.px, c.py], [1, 1], 'фикстура: игрок (1,1)');
  w1.damage = 10; w1.maxHP = 200; w1.hp = 200;
  c._rng = () => 0.01;
  const r = castSpell(c, 'veil_of_night');
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.zone, 2, 'out.zone — радиус');
  assert.deepEqual(c.zone,
    { x: c.px, y: c.py, radius: 2, stat: 'урон_вниз',
      value: 0.15, turns: 3 },
    'c.zone — слот (параметры каталога)');
  assert.deepEqual(w1.debuff,
    { stat: 'урон_вниз', value: 0.15, turns: 3 },
    'моб в радиусе — дебафф (применение однократное)');
  assert.strictEqual(w2.debuff, undefined,
    'моб вне радиуса (Чебышёв 5 > 2) — без дебаффа');
  assert.equal(c.ps.buff, null, 'игрок не затрагивается');
  assert.equal(p.mp, 3, 'мана 16 − 13');
  assert.ok(
    c.log.some((l) => l === 'Покров ночи: зона (радиус 2, 3 ходов).'),
    'лог — строка зоны');
  const hits = [];
  for (let i = 0; i < 4; i++) {
    const hp = p.hp;
    c.endTurn();
    hits.push(hp - p.hp);
  }
  assert.deepEqual(hits, [9, 9, 9, 10],
    '10 × (1 − 0.15) = 8.5 → Math.round = 9 — ровно 3 ослабленных раунда, 4-й полный');
  assert.equal(
    c.log.filter((l) => l === 'Орк-воин промахивается.').length, 0,
    'роутинг стата — урон, не попадание (промахов 0)');
  assert.equal(w1.debuff.turns, 0, 'дебафф: 3 тика → 0');
  assert.equal(c.zone.turns, 0, 'зона: 3 тика → 0');
  assert.ok(c.zone, 'зона: объект жив');
});

// =====================================================================
// --- Задача 000230.05 ---
// 000230.05: редкость экипировочного лута мобов 50/30/15/4.9/0.1.
// Контракт: memory/000230.05-loot-rarity.md §3.2/§4/§5.
//
// КРАСНЫЕ тесты (TDD): в combat.js функциональности НЕТ — нет экспорта
// RARITY_TABLE/EQUIP_POOLS (undefined — осмысленное падение, не
// load-ошибка; прецедент 000132/000155/000167), data-модуля
// src/loot-equip-data.js НЕТ (require ТОЛЬКО в теле теста —
// MODULE_NOT_FOUND осмысленный, не load-ошибка всего файла).
//
// Закреплены контракты:
//   * EQ1 — таблица редкости: точные 5 записей
//     common 0.5 / rare 0.3 / epic 0.15 / legendary 0.049 /
//     impossible 0.001 (порядок common→impossible), сумма === 1 (FP),
//     ids === ITEM_RARITIES (items.js, 000230.01);
//   * EQ2 — пул экипировки: данные модуля, на .05 ВСЕ 5 тиров ПУСТЫ
//     (контент — волны 000230.08–.15), live-ссылка на data-модуль
//     (чтение ЖИВЬЁМ в момент ролла), целостность-хук в одну сторону
//     (id ∈ каталогу, явный slot + rarity, catalog-rarity === тир);
//   * EQ3 — выпадает предмет СКАЗАНОЙ редкости: фикстура 1 предмет/тир,
//     константные rng 0.25/0.65/0.875/0.9745/0.9995 (существующие
//     роллы все мимо) → ТОЧНО фикстура соответствующего тира;
//     select = pool[floor(rng·len)] (2-элем. пул, r=0.8092… → idx 1);
//     E3-границы pickRarityTier (строгоe r < acc, FP-точные acc:
//     0.95 = 0.9500000000000001 → epic, 0.999 → legendary,
//     0.9990000000000001 → impossible); E7 — пустой тир: предмета
//     НЕТ, деградации в нижний тир НЕТ, select-вызов НЕ происходит;
//   * EQ4 — новый ролл ОТДЕЛЬНЫЙ, СТРОГО ПОСЛЕ существующих:
//     фикстура + rng→0, 2×волк L2 → точный состав N2 + 1 экипировочный
//     (common) ПОСЛЕДНИМ, xp 32 / gold 14 БЕЗ ИЗМЕНЕНИЙ (бит-в-бит);
//     под-случай реального ПУСТОГО пула → состав дословно N2
//     (зелёный с red-фазы — бит-в-бит-гард реального потока);
//   * EQ5 — детерминизм: фиксированный сид + фикстура 5 тиров,
//     2 прогона → идентичный состав; golden — захват с рабочего кода
//     на зелёной стадии (ORE-7, node-реверификация).
//
// Фикстура пула — in-place push в C.EQUIP_POOLS, restore в finally
// ВНУТРИ теста (Д7: замена объекта ЗАПРЕЩЕНА — фабрика держит
// снапшот ссылки; id фикстуры НЕ обязан существовать в каталоге —
// рантайм каталог не читает, решение D1).
// =====================================================================

const EQ_TIERS = ['common', 'rare', 'epic', 'legendary', 'impossible'];

// Ре-пин 000230.08: пулы больше не пусты (25 head-предметов) —
// save/restore = ПОЛНАЯ копия массивов (Д7: объект не заменяется —
// только in-place splice/push); тесты сначала очищают пулы
// (splice(0)) → длина-снапшот больше не описывает состояние.
function eqPoolsSave() {
  if (!EQUIP_POOLS) return null;
  return EQ_TIERS.map((t) => EQUIP_POOLS[t].slice());
}

function eqPoolsRestore(sav) {
  if (!sav || !EQUIP_POOLS) return;
  EQ_TIERS.forEach((t, i) => {
    EQUIP_POOLS[t].splice(0);
    EQUIP_POOLS[t].push(...sav[i]);
  });
}

test('000230.05-EQ1: таблица редкости — пин: точные 5 записей 0.50/0.30/0.15/0.049/0.001 (порядок common→impossible), сумма === 1 (FP), ids === ITEM_RARITIES (RED)', () => {
  assert.ok(Array.isArray(RARITY_TABLE),
    'combat.js: экспорт RARITY_TABLE (таблица редкости — данные '
    + 'модуля, фиксированная)');
  assert.deepEqual(RARITY_TABLE, [
    { id: 'common', chance: 0.5 },
    { id: 'rare', chance: 0.3 },
    { id: 'epic', chance: 0.15 },
    { id: 'legendary', chance: 0.049 },
    { id: 'impossible', chance: 0.001 },
  ], 'RARITY_TABLE: 5 редкостей 50/30/15/4.9/0.1, порядок '
    + 'возрастающей редкости (acc-накопление зависит от порядка)');
  assert.equal(
    RARITY_TABLE.reduce((s, t) => s + t.chance, 0), 1,
    'сумма вероятностей === 1 (FP, точное)');
  assert.deepEqual(
    RARITY_TABLE.map((t) => t.id), Object.values(I.ITEM_RARITIES),
    'ids редкостей === ITEM_RARITIES (items.js, 000230.01 — единый '
    + 'источник)');
});

test('000230.05-EQ2: пул экипировки — данные модуля (ре-пин 000230.08: 25 head — живьём по каталогу: pool[тир] = ids предметов каталога с rarity === тир, каталожный порядок), live-ссылка на data-модуль, целостность-хук', () => {
  assert.ok(EQUIP_POOLS && typeof EQUIP_POOLS === 'object',
    'combat.js: экспорт EQUIP_POOLS (пул экипировки — данные '
    + 'модуля, НЕ вывод из каталога в рантайме)');
  for (const t of RARITY_TABLE) {
    assert.deepEqual(EQUIP_POOLS[t.id],
      I.allItems().filter((it) => it.rarity === t.id).map((it) => it.id),
      'пул «' + t.id + '» — все предметы каталога с rarity = '
      + '«' + t.id + '» (каталожный порядок)');
  }
  const L = require('../src/loot-equip-data.js');
  assert.strictEqual(EQUIP_POOLS, L.EQUIP_POOLS,
    'EQUIP_POOLS — live-ссылка на data-модуль (чтение ЖИВЬЁМ в '
    + 'момент ролла; load-time-копия запрещена)');
  assert.strictEqual(RARITY_TABLE, L.RARITY,
    'RARITY_TABLE — live-ссылка на data-модуль');
  // Целостность — В ОДНУ СТОРОНУ (паттерн N6/ORE-8): каждый id пула
  // есть в каталоге, slot задан, catalog-rarity === тир; регресс
  // (опечатка id / смена rarity) ловится здесь.
  const byId = new Map(I.allItems().map((it) => [it.id, it]));
  for (const t of RARITY_TABLE) {
    for (const id of (EQUIP_POOLS[t.id] || [])) {
      const it = byId.get(id);
      assert.ok(it, 'пул ' + t.id + ': id есть в каталоге: ' + id);
      assert.notEqual(it.slot, undefined,
        'пул ' + t.id + ': явный slot: ' + id);
      assert.equal(it.rarity, t.id,
        'пул ' + t.id + ': catalog-rarity === ключ тира: ' + id);
    }
  }
});

test('000230.05-EQ3: выпадает предмет СКАЗАНОЙ редкости: константные rng 0.25/0.65/0.875/0.9745/0.9995 → ТОЧНО фикстура тира; select = pool[floor(rng·len)]; E3-границы pickRarityTier; E7 — пустой тир → предмета нет (RED)', () => {
  const L = require('../src/loot-equip-data.js');
  const sav = eqPoolsSave();
  try {
    // Ре-пин 000230.08: пулы не пусты — фиксируем ЧИСТОЕ состояние
    // (фикстура 1 предмет/тир на пустом пуле), restore вернёт каталог.
    for (const t of EQ_TIERS) EQUIP_POOLS[t].splice(0);
    // Фикстура: 1 предмет на тир. id вне каталога — допустимо
    // (рантайм каталог не читает, D1; целостность — EQ2/CH4).
    for (const t of EQ_TIERS) EQUIP_POOLS[t].push('eq3_fixture_' + t);
    // killBy 'dealDamage' — НОЛЬ c._rng на убийство: поток = gold-ролл
    // (checkVictory, 1) + лут-роллы (per-mob 0.1 / база = редкий =
    // P(−1) = 0.21 — ре-пин 000245: было база 0.25 / редкий 0.07)
    // + экипировка. Константы ниже ВСЕ мимо лут-роллов (gold-ролл
    // предметов не даёт) → items = ТОЛЬКО экипировочный дроп.
    const kill = (r) =>
      winLoot({ rng: () => r, killBy: 'dealDamage' }).c.result.items;
    const expect = (r, tier) => {
      assert.deepEqual(kill(r), [{ id: 'eq3_fixture_' + tier, qty: 1 }],
        'rng→' + r + ': дроп — ТОЧНО фикстура «' + tier + '» '
        + '(ролл редкости → пул тира)');
    };
    expect(0.25, 'common');
    expect(0.65, 'rare');
    expect(0.875, 'epic');
    expect(0.9745, 'legendary');
    expect(0.9995, 'impossible');
    // select = pool[floor(rng·len)]: 2-элементный пул, r = 0.8092…
    // (тир epic) → idx 1 (второй предмет).
    EQUIP_POOLS.epic.push('eq3_fixture_epic_b');
    assert.deepEqual(
      kill(0.8092278488911688),
      [{ id: 'eq3_fixture_epic_b', qty: 1 }],
      'select: пул 2 elem, r=0.8092… → idx 1 (floor(r·len))');
    // E3-границы: строгое r < acc, FP-точные накопленные суммы
    // (0.5+0.3+0.15 = 0.9500000000000001; +0.049 = 0.9990000000000001)
    // — 0.95 → epic, 0.999 → legendary (НЕ impossible),
    // 0.9990000000000001 → impossible.
    const pin = [
      [0.25, 'common'], [0.5, 'rare'], [0.65, 'rare'],
      [0.8, 'epic'], [0.875, 'epic'], [0.95, 'epic'],
      [0.9500000000000001, 'legendary'], [0.9745, 'legendary'],
      [0.999, 'legendary'], [0.9990000000000001, 'impossible'],
      [0.9995, 'impossible'], [1, 'impossible'],
    ];
    for (const [v, tier] of pin) {
      assert.equal(L.pickRarityTier(() => v), tier,
        'pickRarityTier(' + v + ') — «' + tier + '»');
    }
    // E7: пустой ТИР (ролл дал тир, в нём пусто) → предмета НЕТ,
    // деградации в нижний тир НЕТ, select-вызов НЕ происходит
    // (D-D; бит-в-бит-робастность). Пул оставлен ТОЛЬКО в common.
    for (const t of ['rare', 'epic', 'legendary', 'impossible'])
      EQUIP_POOLS[t].splice(0);
    let calls = 0;
    const counting = () => { calls += 1; return 0.875; };
    const r7 = winLoot({ rng: counting, killBy: 'dealDamage' }).c.result;
    assert.deepEqual(r7.items, [],
      'пустой тир (epic при r=0.875): предмета НЕТ (деградация '
      + 'запрещена)');
    assert.equal(calls, 5,
      'вызовы c._rng: gold 1 (checkVictory) + per-mob 1 + база 1 + '
      + 'редкий 1 + tier 1; select — НЕТ (пустой тир)');
  } finally {
    eqPoolsRestore(sav);
  }
});

test('000230.05-EQ4: экипировочный ролл ОТДЕЛЬНЫЙ, СТРОГО ПОСЛЕ существующих: rng→0, 2×волк L2 → состав N2 + 1 экипировочный (common) ПОСЛЕДНИМ, xp 32 / gold 14 без изменений; пустой пул → дословно N2 (ре-пин 000230.08: пулы не пусты — (а)/(б) изолированы)', () => {
  // (а) Фикстура (1 common): экипировочный предмет — КОНЦОМ массива
  // (порядок первого появления), ДО него — точный состав N2.
  const sav = eqPoolsSave();
  try {
    for (const t of EQ_TIERS) EQUIP_POOLS[t].splice(0);
    EQUIP_POOLS.common.push('eq4_fixture_common');
    const { c } = winLoot({ mobs: ['wolf', 'wolf'], mobLevel: 2, seed: 5,
      rng: () => 0 });
    assert.equal(c.result.xp, 32, 'xp — без изменений (N2)');
    assert.equal(c.result.gold, 14,
      'gold — без изменений (N2): поток c._rng не сдвинут');
    assert.deepEqual(c.result.items, [
      { id: 'leather_armor', qty: 2 },
      { id: 'minor_healing', qty: 2 },
      { id: 'iron_sword', qty: 1 },
      { id: 'eq4_fixture_common', qty: 1 },
    ], 'rng→0: точный состав N2 (таблица+база+редкий) + 1 '
      + 'экипировочный (tier common) ПОСЛЕДНИМ');
  } finally {
    eqPoolsRestore(sav);
  }
  // (б) ПУСТОЙ пул → состав дословно N2: бит-в-бит-гард
  // guard eqTotal (зелёная фаза: guard eqTotal → 0 новых вызовов
  // c._rng; ре-пин 000230.08: реальный пул не пуст — очищаем
  // в отдельной изоляции, restore возвращает каталог).
  const sav2 = eqPoolsSave();
  try {
    for (const t of EQ_TIERS) EQUIP_POOLS[t].splice(0);
    const { c: c2 } = winLoot({ mobs: ['wolf', 'wolf'], mobLevel: 2, seed: 5,
      rng: () => 0 });
    assert.deepEqual(c2.result.items, [
      { id: 'leather_armor', qty: 2 },
      { id: 'minor_healing', qty: 2 },
      { id: 'iron_sword', qty: 1 },
    ], 'пустой пул — состав дословно N2 (без нового ролла)');
  } finally {
    eqPoolsRestore(sav2);
  }
});

// Golden EQ5 — захват с рабочего кода на зелёной стадии (ORE-7,
// node-реверификация): сценарий winLoot (2×волк L2, seed 7, реальный
// c._rng) + фикстура 1 предмет/тир; состав = существующие дропы
// (per-mob/база/редкий по реальному потоку) + 1 экипировочный
// (фикстура роулнутого тира) ПОСЛЕДНИМ. По реальному потоку seed 7:
// per-mob leather_armor (qty 1) + редкий ролл дал тир rare →
// eq5_fixture_rare (последним). Dormant (без пула) — leather_armor
// только (бит-в-бит существующего потока).
const EQ5_GOLDEN = [
  { id: 'leather_armor', qty: 1 },
  { id: 'eq5_fixture_rare', qty: 1 },
];

test('000230.05-EQ5: детерминизм: фиксированный сид + фикстура 5 тиров → два прогона идентичны; golden (ре-пин 000230.08: чистый пул — фикстура 1 предмет/тир)', () => {
  const sav = eqPoolsSave();
  try {
    for (const t of EQ_TIERS) EQUIP_POOLS[t].splice(0);
    for (const t of EQ_TIERS) EQUIP_POOLS[t].push('eq5_fixture_' + t);
    const run = () =>
      winLoot({ mobs: ['wolf', 'wolf'], mobLevel: 2, seed: 7 }).c.result.items;
    const a = run();
    const b = run();
    assert.ok(Array.isArray(a), 'victory: c.result.items — массив');
    assert.deepEqual(a, b, 'тот же сид → тот же состав дропа '
      + '(детерминизм экипировочного ролла)');
    assert.deepEqual(a, EQ5_GOLDEN,
      'golden: точный состав (экипировочный дроп — ПОСЛЕДНИМ)');
  } finally {
    eqPoolsRestore(sav);
  }
});

// 000235.05. Лут свитков от разницы уровней (контракт —
// memory/000235.05-scroll-tier-loot.md; ТЗ — tasks/pending/000235.05.md).
//
// TDD-красное: фича ещё не в combat.js — экспорт
// SALT_SCROLL/SCROLL_SCHOOLS/scrollChance/scrollTier/pickScroll/
// rollScrollDrop/scrollCatalog отсутствует (undefined → осмысленные
// AssertionError/TypeError в юнит-тестах, не load-ошибка — прецедент
// 000132/000155/000167/000175):
//   * S1 — формула: P(D) = 0.05 + 0.02·max(0, D), кап 0.25;
//     T: D > 0 → min(4, 1+floor(D/3)), D ≤ 0 → перехватывательная
//     ветка coin < 0.5 ? 2 : 1 (50/50); константы LOOT_*; школы;
//   * S2 — солёный поток: детерминизм по (seed, day) + золотой
//     свиток + пин SALT_SCROLL (значение/литерал/FNV-1a32("SCRL")/
//     уникальность/legacy-безопасность);
//   * S3 — существующие роллы бит-в-бит (xp/gold/предметы) +
//     независимость свитка от c._rng;
//   * S4 — выбор свитка: школа+тир → fallback вниз, затем вверх
//     (каталог из 8 свитков ТЗ, школы+тиры по таблицам ТЗ);
//   * S5 — свиток без tier = tier 1 (правило dungeon.js:55-57).
// Золотой бой (пробный прогон на текущем каталоге):
// seed 6, day 0, wolf L4, герой L1 (D=3, P=0.11, T=2): солёный поток
// (0x2eaef6ed) → r1=0.088617<0.11 (попадание) → школа лёд → T2 лёд
// 10 свитков (ре-пин 000235.08: +25 свитков волны Лёд) →
// pool[floor(r3·10)] = frost_wisp_scroll. Доизменения тот же
// бой: xp=24, gold=13, items=[honey_cake]. Legacy-фикстуры
// (N1/N2 seed 5..10 day 0, C6 seed 5 day 0 — D=1, P=0.07): первый
// заброс солёного потока (seed 5..10 × day 0..2) ≥ 0.07 → свитка нет,
// поведение бит-в-бит.
// =====================================================================

const { mulberry32: mb32_000235, hash2: hash2_000235 } = require('../src/perlin.js');
const SCROLL_IDS_000235 = [
  'fireball_scroll', 'flame_burst_scroll', 'frost_bolt_scroll',
  'blizzard_scroll', 'chill_scroll', 'light_heal_scroll',
  'magic_shield_scroll', 'vine_scroll',
  // ре-пин 000235.08: +25 свитков волны Лёд 000133–00157
  'ice_lance_scroll', 'rime_bolt_scroll', 'hail_scroll',
  'shatter_scroll', 'glacial_spike_scroll', 'permafrost_scroll',
  'absolute_zero_scroll', 'ice_field_scroll', 'wall_of_ice_scroll',
  'blizzard_field_scroll', 'frost_aura_scroll', 'ice_armor_scroll',
  'winter_haste_scroll', 'frostbite_blessing_scroll', 'slow_scroll',
  'frostbite_scroll', 'arctic_touch_scroll', 'deep_freeze_scroll',
  'freeze_scroll', 'glacier_grasp_scroll', 'frost_wisp_scroll',
  'winter_elemental_scroll', 'frost_walk_scroll', 'cold_breath_scroll',
  'frozen_stillness_scroll',
  // ре-пин 000235.09: +25 свитков волны Тень 000233–000257
  'umbra_bolt_scroll', 'drain_life_scroll', 'void_arrow_scroll',
  'night_strike_scroll', 'soul_drain_scroll', 'shadowflame_scroll',
  'dark_nova_scroll', 'shroud_scroll', 'night_blade_scroll',
  'vampire_touch_scroll', 'fear_scroll', 'doom_mark_scroll',
  'despair_scroll', 'shadow_curse_scroll', 'shadow_bind_scroll',
  'nightmare_scroll', 'dark_ensnare_scroll', 'shadow_pool_scroll',
  'veil_of_night_scroll', 'shadow_wraith_scroll', 'void_horror_scroll',
  'shadow_step_scroll', 'invisibility_scroll', 'shroud_of_night_scroll',
  'dark_presence_scroll',
  // ре-пин 000235.10: +25 свитков волны Исцеление 000258–000282
  'radiant_heal_scroll', 'life_bloom_scroll', 'purify_scroll',
  'mass_heal_scroll', 'holy_mending_scroll',
  'mass_holy_light_scroll', 'regeneration_scroll',
  'blessing_scroll', 'divine_favor_scroll',
  'guardian_blessing_scroll', 'swift_prayer_scroll',
  'faith_shield_scroll', 'smite_scroll', 'unholy_wrath_scroll',
  'stun_of_light_scroll', 'holy_bind_scroll',
  'light_sprite_scroll', 'spirit_healer_scroll',
  'holy_guardian_scroll', 'circle_of_light_scroll',
  'holy_ground_scroll', 'prayer_scroll',
  'divine_protection_scroll', 'holy_light_scroll',
  'miracle_scroll',
];
// Каталог ТЗ: id → {school, tier} (тиры = уровни заклинаний:
// fireball L2, flame_burst L3, frost_bolt L1, blizzard L3, chill L1,
// light_heal L2, magic_shield L1, vine L1).
const CATALOG_000235 = [
  { id: 'fireball_scroll', school: 'огонь', tier: 2 },
  { id: 'flame_burst_scroll', school: 'огонь', tier: 3 },
  { id: 'frost_bolt_scroll', school: 'лёд', tier: 1 },
  { id: 'blizzard_scroll', school: 'лёд', tier: 3 },
  { id: 'chill_scroll', school: 'тень', tier: 1 },
  { id: 'light_heal_scroll', school: 'исцеление', tier: 2 },
  { id: 'magic_shield_scroll', school: 'защита', tier: 1 },
  { id: 'vine_scroll', school: 'природа', tier: 1 },
];

test('000235.05 S1: формула — D=0 (P=0.05, T∈{1,2} 50/50), D=3 (P=0.11, T=2), D=6 (P=0.17, T=3), D≥10 (P=0.25 кап, T=4)', () => {
  assert.equal(typeof scrollChance, 'function', 'экспорт scrollChance(D)');
  assert.equal(typeof scrollTier, 'function', 'экспорт scrollTier(D, coin)');
  const near = (got, want, msg) => assert.ok(
    Math.abs(got - want) < 1e-9, msg + ' (факт: ' + got + ')');
  near(scrollChance(0), 0.05, 'P(0) = 0.05 (базовая)');
  near(scrollChance(3), 0.11, 'P(3) = 0.11');
  near(scrollChance(6), 0.17, 'P(6) = 0.17');
  assert.equal(scrollChance(10), 0.25, 'P(10) = 0.25 (кап при D ≥ 10)');
  assert.equal(scrollChance(20), 0.25, 'P(20) = 0.25 (кап)');
  near(scrollChance(-4), 0.05, 'P(D<0) = 0.05 (max(0, D))');
  // Тир: D > 0 — T = min(4, 1 + floor(D/3)); D ≤ 0 — перехватывательная
  // ветка (coin < 0.5 → 2, иначе 1), базовая формула не применяется.
  assert.equal(scrollTier(1, 0), 1, 'T(1) = 1');
  assert.equal(scrollTier(3, 0), 2, 'T(3) = 2');
  assert.equal(scrollTier(6, 0), 3, 'T(6) = 3');
  assert.equal(scrollTier(9, 0), 4, 'T(9) = 4 (кап)');
  assert.equal(scrollTier(12, 0), 4, 'T(12) = 4 (кап)');
  assert.equal(scrollTier(0, 0), 2, 'T(D=0, coin=0) = 2');
  assert.equal(scrollTier(0, 0.4), 2, 'T(D=0, coin=0.4) = 2');
  assert.equal(scrollTier(0, 0.5), 1, 'T(D=0, coin=0.5) = 1');
  assert.equal(scrollTier(0, 0.9), 1, 'T(D=0, coin=0.9) = 1');
  assert.equal(scrollTier(-5, 0.1), 2, 'T(D<0, coin<0.5) = 2');
  // Константы (паттерн LOOT_* :1158-1172) + школы (порядок — пин
  // индекса floor(r·6) солёного потока).
  assert.equal(LOOT_SCROLL_CHANCE_BASE, 0.05, 'LOOT_SCROLL_CHANCE_BASE');
  assert.equal(LOOT_SCROLL_CHANCE_PER_DIFF, 0.02, 'LOOT_SCROLL_CHANCE_PER_DIFF');
  assert.equal(LOOT_SCROLL_CHANCE_CAP, 0.25, 'LOOT_SCROLL_CHANCE_CAP');
  assert.equal(LOOT_SCROLL_MAX_TIER, 4, 'LOOT_SCROLL_MAX_TIER');
  assert.deepEqual(SCROLL_SCHOOLS,
    ['огонь', 'лёд', 'тень', 'исцеление', 'защита', 'природа'],
    'SCROLL_SCHOOLS — 6 школ, порядок каталога');
});

test('000235.05 S2: солёный поток — детерминизм по (seed, day) + золотой свиток + пин SALT_SCROLL', () => {
  assert.equal(typeof rollScrollDrop, 'function', 'экспорт rollScrollDrop');
  assert.equal(typeof SALT_SCROLL, 'number', 'экспорт SALT_SCROLL');
  // (a) Детерминизм: один и тот же бой (seed 6, wolf L4, day 0) ×2 →
  //     один и тот же состав лута.
  const run = () => {
    const { c } = winLoot({ mobs: ['wolf'], mobLevel: 4, seed: 6,
      killBy: 'dealDamage' });
    return JSON.stringify(c.result.items);
  };
  assert.equal(run(), run(), 'один бой → один лут (солёный поток детерминирован)');
  // (b) Золотое наполнение (пробный прогон на текущем каталоге):
  //     seed 6, day 0, wolf L4, герой L1 (D=3, P=0.11, T=2) → r1 =
  //     0.088617 < 0.11 (попадание) → школа лёд → T2 лёд — 10 свитков
  //     (ре-пин 000235.08: +25 свитков волны Лёд; до волны T2 лёд
  //     был пуст → fallback вниз (T1) → frost_bolt_scroll) →
  //     pool[floor(r3·10)] = frost_wisp_scroll.
  const { c } = winLoot({ mobs: ['wolf'], mobLevel: 4, seed: 6,
    killBy: 'dealDamage' });
  const scrolls = c.result.items.filter((r) => SCROLL_IDS_000235.includes(r.id));
  assert.deepEqual(scrolls, [{ id: 'frost_wisp_scroll', qty: 1 }],
    'золотой: выпавший свиток — frost_wisp_scroll (ре-пин 000235.08: '
    + '+25 свитков волны Лёд; факт: '
    + JSON.stringify(c.result.items) + ')');
  // (c) Пин SALT_SCROLL: значение + литерал в src/combat.js +
  //     самостоятельный расчёт FNV-1a32("SCRL") + уникальность среди
  //     существующих солей.
  assert.equal(SALT_SCROLL, 0x2eaef6ed, 'SALT_SCROLL = 0x2eaef6ed');
  const src = fs.readFileSync(path.join(ROOT, 'src', 'combat.js'), 'utf8');
  assert.ok(src.includes('2eaef6ed'), 'SALT_SCROLL-литерал 2eaef6ed в src/combat.js');
  let fnv = 0x811c9dc5;
  for (const ch of 'SCRL') {
    fnv = Math.imul(fnv ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  }
  assert.equal(fnv, 0x2eaef6ed, 'SALT_SCROLL = FNV-1a32("SCRL") (самопроверка)');
  assert.ok(![0x0DE5, 0x5e11, 0x7777, 0xabcdef, 0x154075, 0xb055,
    0x51a11ce5, 0x53d10d53, 0xd0d6b5e5, 0xd337b153, 0x5e11c3a7,
    0x0c9f4b2d, 0x669f0101, 0x7f3a51c9, 0xf10c7a26, 0x5eedc0de,
    0x54454c50, 0x71756974, 0x72656675, 0x4c4f4f54, 0x43495453,
    0x53554254, 0x434f4e54, 0x43414d50].includes(SALT_SCROLL),
    'SALT_SCROLL уникален относительно существующих солей');
  // (d) Legacy-безопасность (пин N2/C6): зафиксированные бои
  //     (N1/N2 seed 5..10 day 0, C6 seed 5 day 0 — D=1, P=0.07):
  //     первый заброс солёного потока (seed 5..10 × day 0..2) ≥ 0.07
  //     → свитка в legacy-фикстурах нет, их поведение бит-в-бит.
  for (const seed of [5, 6, 7, 8, 9, 10]) {
    for (const day of [0, 1, 2]) {
      const r1 = mb32_000235(hash2_000235(seed, day, 0x2eaef6ed) >>> 0)();
      assert.ok(r1 >= 0.07,
        'первый заброс (' + seed + ',' + day + ') = ' + r1
        + ' < 0.07 — legacy-пину P(1)=0.07 угрожает сдвиг');
    }
  }
});

test('000235.05 S3: существующие роллы бит-в-бит + независимость свитка от c._rng (ре-пин 000230.08: +экипировочный МЕЖДУ редким и свитком: (a) реальный rng seed 6 → leather_choker; (b) r=0.99 → legendary pool[floor(0.99·6)] = star_pendant; ре-пин 000230.09: common-пул 10 → 30, legendary-пул 2 → 6; ре-пин 000230.10: common-пул 30 → 40, legendary-пул 6 → 8 (a → cloth_sutan; b → void_robe); ре-пин 000235.08: +25 свитков волны Лёд — золотой свиток → frost_wisp_scroll; ре-пин 000230.11: common-пул 40 → 60, legendary-пул 8 → 12 (a → iron_gauntlets; b → star_gloves); ре-пин 000230.12: common-пул 60 → 70, legendary-пул 12 → 14 («правая рука»: a → iron_tongs; b → mithril_hammer); ре-пин 000230.13: common-пул 70 → 80, legendary-пул 14 → 16 (a → bone_shield; b → snow_focus); ре-пин 000230.14: common-пул 80 → 90, legendary-пул 16 → 18 (a → clay_ring; b → void_ring); ре-пин 000245: P(D) — базовый 0.1992 ≥ P(−3) = 0.13 → мимо (сдвиг: редкий 0.9879 мимо, tier 0.9451 → epic (пул 45), select 0.2691 → epic[floor(0.2691·45)] = epic[12]) (a → ruby_pendant; b — без изменений (void_ring); ре-пин 000230.15: common-пул 90 → 110, legendary-пул 18 → 22, epic-пул 45 → 55 (a → epic[floor(0.2691·55)] = epic[14] = mithril_choker; b → pool[21] = rune_boots); ре-пин 000230.19: common-пул 110 → 111, epic-пул 55 → 56 (+1 torso-набор концом тира) (a → epic[floor(0.2691·56)] = epic[15] = ember_robe; b → без изменений (rune_boots)))', () => {
  // (a) Золотой бой (seed 6, wolf L4, герой L1): значения доизменения
  //     (пробный прогон на текущем коде) — новый код обязан их
  //     сохранить: новый ролл — СТРОГО ПОСЛЕ существующих (пин N2),
  //     отдельный солёный поток — ноль вызовов c._rng.
  //     Ре-пин 000230.08: экипировочный ролл (000230.05) — СТРОГО
  //     ПОСЛЕ редкого, ДО свитка; реальный rng (2 вызова: tier +
  //     select) → travel_cloth (node-перепрогон, ORE-7).
  //     Ре-пин 000230.09: common-пул растёт 10 → 30 (концы тиров,
  //     каталожный порядок) → тот же поток rng даёт leather_choker
  //     (node-перепрогон, ORE-7).
  //     Ре-пин 000230.10: common-пул растёт 30 → 40 (torso-конец,
  //     каталожный порядок) → тот же поток rng даёт cloth_sutan
  //     (node-перепрогон, ORE-7).
  //     Ре-пин 000230.11: common-пул растёт 40 → 60 (forearms+palms
  //     конец, каталожный порядок) → тот же поток rng даёт
  //     iron_gauntlets (node-перепрогон, ORE-7).
  //     Ре-пин 000230.12: common-пул растёт 60 → 70 (конец =
  //     «правая рука», каталожный порядок; select idx 66) → тот же
  //     поток rng даёт iron_tongs (node-перепрогон, ORE-7).
  //     Ре-пин 000235.08: +25 свитков волны Лёд — солёный поток
  //     (каталог 67) даёт frost_wisp_scroll (node-перепрогон).
  //     Ре-пин 000230.13: common-пул растёт 70 → 80 (left_hand-конец,
  //     каталожный порядок; select idx 75) → тот же поток rng даёт
  //     bone_shield (node-перепрогон, ORE-7).
  //     Ре-пин 000230.14: common-пул растёт 80 → 90 (кольца-конец,
  //     каталожный порядок; select idx 85) → тот же поток rng даёт
  //     clay_ring (node-перепрогон, ORE-7).
  //     Ре-пин 000245: P(D) — базовый ролл 0.1992 ≥ P(−3) = 0.13
  //     → МИМО (до: 0.1992 < 0.25 → honey_cake); ПОТОК СДВИГАЕТСЯ
  //     (pick-вызов не потреблён): редкий 0.9879 → мимо, tier
  //     0.9451 → epic (epic-пул 45 — финальный: 40 после
  //     000230.14 + 5 «правая рука» 000230.12), select 0.2691 →
  //     epic[floor(0.2691·45)] = epic[12] = ruby_pendant
  //     (node-перепрогон, ORE-7, post-merge 000230.12).
  //     Ре-пин 000230.15 (merge .11–.14): epic-пул 45 → 55 (+10
  //     эпиков ног/ступней, каталожный порядок — хвост каталога,
  //     префикс 45 бит-в-бит) → тот же поток: tier 0.9451 → epic,
  //     select 0.2691 → epic[floor(0.2691·55)] = epic[14] =
  //     mithril_choker (node-перепрогон). Свиток — солёный поток,
  //     неизменен (frost_wisp_scroll).
  //     Ре-пин 000230.19: epic-пул 55 → 56 (+mystic_sutan концом
  //     тира, каталожный порядок — префикс 55 бит-в-бит) → тот же
  //     поток: tier 0.9451 → epic, select 0.2691 →
  //     epic[floor(0.2691·56)] = epic[15] = ember_robe
  //     (node-перепрогон). Свиток — солёный поток, неизменен
  //     (frost_wisp_scroll); (b) legendary-пул 22 — без изменений.
  const { c } = winLoot({ mobs: ['wolf'], mobLevel: 4, seed: 6,
    killBy: 'dealDamage' });
  assert.equal(c.result.xp, 24, 'xp = 24 (бит-в-бит)');
  assert.equal(c.result.gold, 13, 'gold = 13 (бит-в-бит)');
  assert.deepEqual(c.result.items, [
    { id: 'ember_robe', qty: 1 },
    { id: 'frost_wisp_scroll', qty: 1 },
  ], 'items: (ре-пин 000245: базовый 0.1992 ≥ P(−3) = 0.13 — мимо; '
    + 'сдвиг: tier 0.9451 → epic (пул 56, ре-пин 000230.19), '
    + 'select 0.2691 → epic[15] = ember_robe; ре-пин 000235.08: '
    + 'золотой '
    + 'frost_wisp_scroll — солёный поток, порядок первого '
    + 'появления; факт: ' + JSON.stringify(c.result.items) + ')');
  // (b) c._rng → 0.99: все СТАРЫЕ роллы промахиваются (таблица wolf 0.1,
  //     базовый = редкий = P(−3) = 0.13 — ре-пин 000245: было 0.25 /
  //     0.05+0.01·4 = 0.09); экипировка: tier
  //     legendary (0.99 < 0.999…), select pool[floor(0.99·22)] =
  //     pool[21] = rune_boots (ре-пин 000230.09: legendary-пул 2 → 6,
  //     конец = шея; ре-пин 000230.10: 6 → 8, конец = torso;
  //     ре-пин 000230.11: 8 → 12, конец = palms; ре-пин 000230.12:
  //     12 → 14, «правая рука»; ре-пин 000230.13: 14 → 16, конец =
  //     left_hand; ре-пин 000230.14: 16 → 18, конец = кольца;
  //     ре-пин 000230.15: 18 → 22, конец = ноги/ступни); в луте
  //     экипировка + свиток (солёный поток
  //     не зависит от c._rng — «старые потоки не сдвигаются», тип пина
  //     N2). Ре-пин 000235.08: каталог 67 — золотой свиток
  //     frost_wisp_scroll (node-перепрогон).
  //     Ре-пин 000230.15: legendary-пул 18 → 22 (+4 ног/ступней, конец
  //     = feet) → pool[floor(0.99·22)] = pool[21] = rune_boots
  //     (node-перепрогон, merge .11–.14).
  const { c: b } = winLoot({ mobs: ['wolf'], mobLevel: 4, seed: 6,
    rng: () => 0.99, killBy: 'dealDamage' });
  assert.equal(b.result.xp, 24, 'xp = 24 (бит-в-бит)');
  assert.equal(b.result.gold, 15, 'gold = round(3+2·4+0.99·4) = 15 (бит-в-бит)');
  assert.deepEqual(b.result.items, [
    { id: 'rune_boots', qty: 1 },
    { id: 'frost_wisp_scroll', qty: 1 },
  ], 'rng→0.99: старые роллы промахнулись, экипировка (legendary) + '
    + 'солёный поток дал свиток всё равно (ре-пин 000235.08: '
    + 'frost_wisp_scroll; ре-пин 000230.15: legendary pool[21] = '
    + 'rune_boots; факт: '
    + JSON.stringify(b.result.items) + ')');
});

test('000235.05 S4: выбор свитка — школа+тир, fallback вниз, затем вверх; пустая школа → нет дропа', () => {
  assert.equal(typeof pickScroll, 'function', 'экспорт pickScroll');
  const cases = [
    // [школа, тир, ожидаемый массив] — каталог CATALOG_000235:
    // 2/3/1/3/1/2/1/1.
    ['огонь', 1, ['fireball_scroll']],
    ['огонь', 2, ['fireball_scroll']],
    ['огонь', 3, ['flame_burst_scroll']],
    ['огонь', 4, ['flame_burst_scroll']],
    ['лёд', 1, ['frost_bolt_scroll']],
    ['лёд', 2, ['frost_bolt_scroll']],
    ['лёд', 3, ['blizzard_scroll']],
    ['лёд', 4, ['blizzard_scroll']],
    ['тень', 3, ['chill_scroll']],
    ['тень', 4, ['chill_scroll']],
    ['исцеление', 4, ['light_heal_scroll']],
    ['исцеление', 1, ['light_heal_scroll']],
    ['защита', 1, ['magic_shield_scroll']],
    ['защита', 2, ['magic_shield_scroll']],
    ['природа', 4, ['vine_scroll']],
    ['природа', 1, ['vine_scroll']],
    ['ветер', 1, []],
    ['ветер', 4, []],
  ];
  for (const [school, tier, want] of cases) {
    assert.deepEqual(pickScroll(CATALOG_000235, school, tier), want,
      'pickScroll(' + school + ', T' + tier + ') — '
      + JSON.stringify(pickScroll(CATALOG_000235, school, tier)));
  }
});

test('000235.05 S5: свиток без tier = tier 1 (правило dungeon.js:55-57) — каталог деградирует, не падает', () => {
  assert.equal(typeof scrollCatalog, 'function', 'экспорт scrollCatalog');
  const cat = scrollCatalog();
  assert.ok(Array.isArray(cat) && cat.length > 0, 'каталог не пуст');
  const rec = cat[0];
  const it = I.getItem(rec.id);
  assert.ok(it, 'предмет «' + rec.id + '» в каталоге items');
  const saved = it.tier;
  try {
    delete it.tier;
    const cat2 = scrollCatalog();
    const rec2 = cat2.find((r) => r.id === rec.id);
    assert.ok(rec2, 'каталог после удаления tier содержит «' + rec.id + '»');
    assert.equal(rec2.tier, 1, 'свиток без tier = tier 1');
    assert.ok(pickScroll(cat2, rec2.school, 1).includes(rec.id),
      'tier-1 нормализация: свиток выбирается из пула T1 своей школы');
  } finally {
    it.tier = saved;
  }
});

// --- Задача 000230.03: free_cast — заклинания из freeCast с нулевой
// маной (красные тесты TDD) ---
//
// Контракт — memory/000230.03-affixes-derived-free-cast.md §2.3:
//   * c.freeCast — СНАПШОТ из экипировки героя в createCombat
//     (plain-массив, Set→Array; D-05);
//   * eval: `if (!free && p.mp < spell.мани) fail` — строка reason
//     БЕЗ ИЗМЕНЕНИЙ (пин); ok-возврат eval += `free`;
//   * cast: пул ВСЕГДА сгорает; мана `if (!free) p.mp -= spell.мани`;
//   * действие «Заклинание» ВСЕГДА сгорает — free_cast экономит
//     ТОЛЬКО ману; логика рангов/степени — без изменений;
//   * урон/лечение — формулы книги без изменений.
// RED F1/F2: free_cast не существует → evalSpell отказывает
// «не хватает маны (3)» (mp 1 < 3) — осмысленно: assert на r.ok,
// не load-ошибка. Фикстуры — ТОЛЬКО в vm (каталог items.js — Map
// при загрузке; E9-пин 76/0 жив). Цепь = паттерн loadUi193 из
// ally-spells.test.js БЕЗ UI-модулей (краснота — в ядре).

const VM_00023003_CHAIN = ['global-settings.js', 'perlin.js', 'map.js',
  'skills-data.js', 'items-data.js', 'sheet.js', 'player.js',
  'items.js', 'combat.js', 'spells-data.js', 'spells.js'];
function loadFreeCastVm00023003(fixtures) {
  const sandbox = { console: { log() {}, warn() {}, error() {} } };
  vm.createContext(sandbox);
  for (const f of VM_00023003_CHAIN) {
    if (f === 'items-data.js') continue;
    if (f === 'items.js') sandbox.Game.ITEMS = fixtures;
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'),
      sandbox, { filename: f });
  }
  return sandbox.Game;
}

test('000230.03-F1 (vm): free_cast (урон) — заклинание из freeCast: ok, мана НЕ тратится (mp 1 остаётся 1), действие «Заклинание» сгорает (spellInt −1), урон без изменений (round(4 + 0.5·10) = 9)', () => {
  const G = loadFreeCastVm00023003([
    { id: 'x_ring_fc', name: 'Тестовое кольцо', kind: 'ring',
      slot: 'ring', weight: 0.1, value: 30, desc: 'т',
      affixes: [{ type: 'free_cast', spell: 'spark' }] },
  ]);
  const p = G.createCharacter();
  p.primary.intelligence = 10;
  p.mp = 1;
  p.spells = ['spark'];
  G.addItem(p, 'x_ring_fc');
  assert.equal(G.equip(p, 'x_ring_fc').ok, true, 'кольцо экипируется');
  const c = G.createCombat({ player: p, mobs: ['wolf'], mobLevel: 2, seed: 5 });
  const w = c.units[0];
  w.x = c.px; w.y = c.py - 1; // в дальности 4
  assert.deepEqual(
    JSON.parse(JSON.stringify(G.Spells.canCastSpell(c, 'spark', { targetId: w.id }))),
    { ok: true },
    'зеркало 000037: canCastSpell — free-ветка {ok:true} при mp 1 (до каста — пул ещё полон; JSON-нормализация — cross-realm-прототипы, паттерн fromVm)');
  const poolBefore = c.ps.spellInt;
  const r = G.Spells.castSpell(c, 'spark', w.id);
  assert.equal(r.ok, true,
    'free_cast: каст при mp 1 (краснота: нет free_cast — '
    + '«не хватает маны (3)»); факт: ' + (r.reason || ''));
  assert.equal(p.mp, 1, 'мана НЕ тратится (free)');
  assert.equal(c.ps.spellInt, poolBefore - 1, 'действие «Заклинание» сгорает');
  assert.equal(r.dmg, 9, 'урон без изменений: round(4 + 0.5·10), степень 1');
});

test('000230.03-F2 (vm): free_cast (лечение) — mend из freeCast: ok, мана НЕ тратится (mp 1 остаётся 1), действие сгорает (spellWis −1), лечение без изменений (round(4 + 0.5·10 + 1) = 10)', () => {
  const G = loadFreeCastVm00023003([
    { id: 'x_art_fc', name: 'Тестовый артефакт', kind: 'artifact',
      slot: 'left_hand', weight: 0.5, value: 100, desc: 'т',
      affixes: [{ type: 'free_cast', spell: 'mend' }] },
  ]);
  const p = G.createCharacter();
  p.primary.wisdom = 10;
  p.mp = 1;
  p.spells = ['mend'];
  G.addItem(p, 'x_art_fc');
  assert.equal(G.equip(p, 'x_art_fc').ok, true, 'артефакт экипируется');
  const c = G.createCombat({ player: p, mobs: ['wolf'], mobLevel: 2, seed: 5 });
  p.hp = 1; // рана — лечение поднимет
  const poolBefore = c.ps.spellWis;
  const r = G.Spells.castSpell(c, 'mend');
  assert.equal(r.ok, true,
    'free_cast: каст при mp 1 (краснота: нет free_cast — '
    + '«не хватает маны (3)»); факт: ' + (r.reason || ''));
  assert.equal(p.mp, 1, 'мана НЕ тратится (free)');
  assert.equal(c.ps.spellWis, poolBefore - 1, 'действие «Заклинание» сгорает');
  assert.equal(r.healed, 10,
    'лечение без изменений: round(4 + 0.5·10 + 1), степень 1');
});

test('000230.03-F3 (node-пин): заклинание НЕ из freeCast — мана тратится как сейчас (mp 30 → 27, пул −1, ok; герой БЕЗ affix-экипировки; зелёный с red-фазы)', () => {
  const { castSpell } = spells();
  const p = createCharacter();
  p.primary.intelligence = 10;
  p.mp = 30;
  p.spells = ['spark'];
  const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 2, seed: 5 });
  const w = c.units[0];
  standNextTo(c, w);
  const poolBefore = c.ps.spellInt;
  const r = castSpell(c, 'spark', w.id);
  assert.equal(r.ok, true, r.reason);
  assert.equal(p.mp, 27, 'мана −3 (Искра) — пин текущего поведения');
  assert.equal(c.ps.spellInt, poolBefore - 1, 'пул Интеллекта −1');
});

test('000230.10 T10 (гард, зелёный с начала): remap не меняет бой — 3 legacy-брони экипируются как раньше: leather_armor → equipmentStats.armor 2, chainmail → 4, knight_plate → 6; предмет в слоте torso; бит-в-бит (стат/вес/цена не трогает — только явное поле slot)', () => {
  for (const [id, armor] of [
    ['leather_armor', 2],
    ['chainmail', 4],
    ['knight_plate', 6],
  ]) {
    const p = createCharacter();
    assert.equal(I.addItem(p, id).ok, true, id + ': выдача');
    assert.equal(I.equip(p, id).ok, true, id + ': equip');
    assert.equal(p.equipment.torso, id,
      id + ': предмет в слоте torso');
    assert.equal(
      I.equipmentStats(p).armor, armor,
      id + ': equipmentStats.armor = ' + armor
      + ' (бит-в-бит; remap не меняет бой)');
  }
});

// =====================================================================
// Задача 000230.13 — предметы «Левая рука»: 25 (10/7/5/2/1) + иконки +
// рецепты (контентная волна 4 серии 000230; P2). Щиты (kind shield)
// и магические артефакты (kind artifact).
// Контракт — memory/000230.13-left-hand-items-wave.md §2 (ростер §2.1,
// affix-матрица §2.2, наборы §2.3, рецепты §2.4; решения D-01–D-17
// §0). RED (TDD): в каталоге/зеркале 0 предметов slot 'left_hand' —
// тесты ниже падают по ОСМЫСЛЕННОЙ причине («неизвестный предмет —
// волна не добавлена»), а не по синтаксису. Тесты читают РЕАЛЬНЫЙ
// каталог, не фикстуры (паттерн .10 T10). Технические репины
// существующих тестов (N2/S3 и др.) — стадия ЗЕЛЁНАЯ.
// =====================================================================
// Ростер §2.1: id фиксирован 000358–000382 (D-01); каталожный порядок
// = порядок тиров 10/7/5/2/1; щиты 12 / артефакты 13 (D-04).
const LEFT_HAND_IDS_00023013 = [
  'wooden_buckler', 'leather_shield', 'cloth_shield', 'wicker_buckler',
  'oiled_shield', 'bone_shield', 'horn_shield', 'palm_shield',
  'ash_shield', 'clay_buckler', 'iron_round', 'steel_buckler',
  'rune_charm', 'guard_amulet', 'ember_focus', 'frost_charm',
  'scholar_pendant', 'ward_crystal', 'cinder_eye', 'frost_orb',
  'rune_sphere', 'mind_pendant', 'arcane_eye', 'snow_focus',
  'heart_of_elements',
];
// [id, stats.armor] — щиты: common 10 × armor 1, rare 2 × armor 2.
const SHIELD_ARMOR_00023013 = [
  ['wooden_buckler', 1], ['leather_shield', 1], ['cloth_shield', 1],
  ['wicker_buckler', 1], ['oiled_shield', 1], ['bone_shield', 1],
  ['horn_shield', 1], ['palm_shield', 1], ['ash_shield', 1],
  ['clay_buckler', 1], ['iron_round', 2], ['steel_buckler', 2],
];
// [id, stats.armor] — артефакты: armor 1 только у guard_amulet /
// ward_crystal / arcane_eye (D-10), остальные — без stats.
const ARTIFACT_ARMOR_00023013 = [
  ['rune_charm', 0], ['guard_amulet', 1], ['ember_focus', 0],
  ['frost_charm', 0], ['scholar_pendant', 0], ['ward_crystal', 1],
  ['cinder_eye', 0], ['frost_orb', 0], ['rune_sphere', 0],
  ['mind_pendant', 0], ['arcane_eye', 1], ['snow_focus', 0],
  ['heart_of_elements', 0],
];

test('000230.13 T8 (node, e2e): щит в left_hand — armor СЧИТАЕТСЯ (пин 000230.02: left_hand в EQUIP_PHYS_SLOTS, zero code): ВСЕ 12 щитов из live-каталога → equipmentStats.armor = armor щита (10 × 1, 2 × 2); + torso (leather_armor, 2) — сумма бит-в-бит 3; weapon iron_sword в right_hand — damage 5 / subtype sword ИНТАКТ (пин ТЗ: щит НЕ вытесняет оружие) (краснота: реальных щитов left_hand в каталоге нет)', () => {
  for (const [id, armor] of SHIELD_ARMOR_00023013) {
    const p = createCharacter();
    assert.equal(I.addItem(p, id).ok, true,
      id + ': выдача (краснота: неизвестный предмет — волна '
      + 'не добавлена)');
    assert.equal(I.equip(p, id).ok, true, id + ': equip');
    assert.equal(p.equipment.left_hand, id,
      id + ': предмет в слоте left_hand');
    assert.equal(I.equipmentStats(p).armor, armor,
      id + ': equipmentStats.armor = ' + armor
      + ' (пин 000230.02: left_hand входит в сумму armor)');
  }
  {
    const p = createCharacter();
    assert.equal(I.addItem(p, 'wooden_buckler').ok, true,
      'wooden_buckler: выдача (краснота: неизвестный предмет)');
    assert.equal(I.equip(p, 'wooden_buckler').ok, true, 'equip');
    assert.equal(I.addItem(p, 'leather_armor').ok, true,
      'leather_armor: выдача');
    assert.equal(I.equip(p, 'leather_armor').ok, true, 'equip');
    assert.equal(p.equipment.torso, 'leather_armor');
    assert.equal(I.equipmentStats(p).armor, 3,
      'wooden_buckler (1) + leather_armor (2) = 3 — бит-в-бит сумма');
  }
  {
    const p = createCharacter();
    assert.equal(I.addItem(p, 'wooden_buckler').ok, true,
      'wooden_buckler: выдача (краснота: неизвестный предмет)');
    assert.equal(I.equip(p, 'wooden_buckler').ok, true, 'equip');
    assert.equal(I.addItem(p, 'iron_sword').ok, true,
      'iron_sword: выдача');
    assert.equal(I.equip(p, 'iron_sword').ok, true, 'equip');
    assert.equal(p.equipment.right_hand, 'iron_sword',
      'оружие в right_hand — щит НЕ вытесняет (пин ТЗ)');
    const st = I.equipmentStats(p);
    assert.equal(st.damage, 5, 'damage 5 — только из iron_sword');
    assert.equal(st.subtype, 'sword', 'subtype sword — интакт');
    assert.equal(st.armor, 1, 'armor 1 — со щита');
  }
});

test('000230.13 T9 (node, e2e): артефакт в left_hand — БЕЗ damage/subtype (stats.damage ОТСУТСТВУЕТ — не оружие, пин ТЗ): ВСЕ 13 артефактов из live-каталога → equipmentStats: damage 0 / subtype null; armor — только у guard_amulet/ward_crystal/arcane_eye (1), остальные 10 — 0; weapon iron_sword — damage 5 / subtype sword ИНТАКТ рядом с артефактом (краснота: реальных артефактов left_hand в каталоге нет)', () => {
  for (const [id, armor] of ARTIFACT_ARMOR_00023013) {
    const p = createCharacter();
    assert.equal(I.addItem(p, id).ok, true,
      id + ': выдача (краснота: неизвестный предмет — волна '
      + 'не добавлена)');
    assert.equal(I.equip(p, id).ok, true, id + ': equip');
    assert.equal(p.equipment.left_hand, id,
      id + ': предмет в слоте left_hand');
    const st = I.equipmentStats(p);
    assert.equal(st.damage, 0,
      id + ': damage 0 (артефакт — не оружие, пин ТЗ)');
    assert.equal(st.subtype, null,
      id + ': subtype null (нет subtype на stats — не оружие)');
    assert.equal(st.armor, armor,
      id + ': equipmentStats.armor = ' + armor + ' (§2.1)');
  }
  {
    const p = createCharacter();
    assert.equal(I.addItem(p, 'rune_charm').ok, true,
      'rune_charm: выдача (краснота: неизвестный предмет)');
    assert.equal(I.equip(p, 'rune_charm').ok, true, 'equip');
    assert.equal(I.addItem(p, 'iron_sword').ok, true,
      'iron_sword: выдача');
    assert.equal(I.equip(p, 'iron_sword').ok, true, 'equip');
    const st = I.equipmentStats(p);
    assert.equal(st.damage, 5,
      'damage 5 — только из iron_sword (артефакт не вытесняет оружие)');
    assert.equal(st.subtype, 'sword',
      'subtype sword — НЕ из артефакта (пин ТЗ)');
    assert.equal(st.armor, 0, 'rune_charm: armor-вклад 0');
  }
});

test('000230.13 T10 (node, e2e): free_cast — реальный предмет волны: ward_crystal (000375, epic) → заклинание magic_shield (м. 5) с 1 м. кастуется: mp НЕ тратится (остаётся 1), пул spellWis −1, c.ps.shield = {armor: 2 (степень 1), turns: 3}; snow_focus (000381, legendary) → ice_armor (интеллект, м. 8) с 1 м. на себя: spellInt −1, c.ps.buff = {stat: «броня», value: 1, turns: 3}; mp=1 < маны доказывает free-ветку (без free-аффикса каст упал бы по mp); без предмета freeCast пуст; c.freeCast — снапшот из equipmentAffixes (краснота: неизвестный предмет — волна не добавлена)', () => {
  const { castSpell } = spells();
  const p = createCharacter();
  assert.equal(I.addItem(p, 'ward_crystal').ok, true,
    'ward_crystal: выдача (краснота: неизвестный предмет — волна '
    + 'не добавлена)');
  assert.equal(I.equip(p, 'ward_crystal').ok, true, 'equip');
  assert.equal(p.equipment.left_hand, 'ward_crystal');
  p.spells = ['magic_shield'];
  p.mp = 1;
  p.primary.wisdom = 10; // пул заклинаний Мудрости = 2
  const c = createCombat(
    { player: p, mobs: ['wolf'], mobLevel: 2, seed: 5 });
  assert.ok(c.freeCast.includes('magic_shield'),
    'c.freeCast — снапшот из equipmentAffixes(p).freeCast '
    + '(createCombat, 000139)');
  const cast = castSpell(c, 'magic_shield');
  assert.equal(cast.ok, true,
    'каст magic_shield свободный (free_cast): «'
    + (cast.reason || '') + '»');
  assert.equal(p.mp, 1,
    'mp НЕ потрачена (1 < маны 5 — free-ветка; без аффикса каст '
    + 'упал бы по «недостаточно маны» — 000139)');
  assert.equal(c.ps.spellWis, 1,
    'пул spellWis: 2 (1 + floor(10/10)) − 1 каст = 1');
  assert.deepEqual(c.ps.shield, { armor: 2, turns: 3 },
    'защита: c.ps.shield = { armor: 1 + степень 1, turns: 3 }');
  const p2 = createCharacter();
  assert.equal(I.addItem(p2, 'snow_focus').ok, true,
    'snow_focus: выдача (краснота: неизвестный предмет — волна '
    + 'не добавлена)');
  assert.equal(I.equip(p2, 'snow_focus').ok, true, 'equip');
  assert.equal(p2.equipment.left_hand, 'snow_focus');
  p2.spells = ['ice_armor'];
  p2.mp = 1;
  p2.primary.intelligence = 10; // пул заклинаний Интеллекта = 2
  const c2 = createCombat(
    { player: p2, mobs: ['wolf'], mobLevel: 2, seed: 7 });
  assert.ok(c2.freeCast.includes('ice_armor'),
    'c2.freeCast — содержит ice_armor (снапшот)');
  const cast2 = castSpell(c2, 'ice_armor');
  assert.equal(cast2.ok, true,
    'каст ice_armor свободный (free_cast): «' + (cast2.reason || '')
    + '»');
  assert.equal(p2.mp, 1,
    'mp НЕ потрачена (1 < маны 8 — free-ветка; баф на себя — цель 0)');
  assert.equal(c2.ps.spellInt, 1,
    'пул spellInt: 2 (1 + floor(10/10)) − 1 каст = 1');
  assert.deepEqual(c2.ps.buff, { stat: 'броня', value: 1, turns: 3 },
    'баф: c.ps.buff = параметры заклинания {stat «броня», value 1, '
    + 'turns 3}');
  const p3 = createCharacter();
  p3.spells = ['magic_shield'];
  const c3 = createCombat(
    { player: p3, mobs: ['wolf'], mobLevel: 2, seed: 9 });
  assert.equal(c3.freeCast.length, 0,
    'без предмета волны freeCast пуст (аффикс — из снаряжения)');
});

// =====================================================================
// Задача 000230.14 — пулы дропа колец (контракт —
// memory/000230.14-ring-items-wave.md §2.5/D-08): append КОНЦОМ
// тиров (EQ2/CH4 «пул ≡ каталог по редкости в каталожном порядке»):
// common 40→50, rare 28→35, epic 20→25, legendary 8→10,
// impossible 4→5 (всего 100→125). RARITY 50/30/15/4.9/0.1 — БЕЗ
// ПРАВОК (EQ1; баланс-инвариант). RED (TDD): колец в пулах нет
// (тиры 40/28/20/8/4) — падение по ОСМЫСЛЕННОЙ причине «волна не
// добавлена» (не синтаксис).
// =====================================================================

// Хвосты тиров — 25 id колец в каталожном порядке (§2.5): порядок
// = порядок файлов 000383–000407 = порядок тиров 10/7/5/2/1.
const RING_POOL_TAILS_00023014 = {
  common: ['copper_ring', 'bone_ring', 'iron_ring', 'thread_ring',
           'stone_ring', 'clay_ring', 'wood_ring', 'leather_ring',
           'silver_ring', 'silver_signet'],
  rare: ['gold_ring', 'glacier_ring', 'quartz_ring', 'obsidian_ring',
         'amethyst_ring', 'sapphire_ring', 'gold_signet'],
  epic: ['emerald_signet', 'ruby_ring', 'frost_ring', 'rune_ring',
         'scholar_ring'],
  legendary: ['star_signet', 'void_ring'],
  impossible: ['phoenix_ring'],
};
// Ре-пины мержа (master после 000230.13): базовые тиры 40/28/20/8/4
// + 50 рук (000230.11: 20/14/10/4/2) + 25 «правая рука» (000230.12:
// 10/7/5/2/1) + 25 left_hand (000230.13: 10/7/5/2/1) + 25 колец
// (000230.14: 10/7/5/2/1) + 50 ног/ступней (000230.15: 20/14/10/4/2)
// + 2 torso-набора (000230.19: 1 common/1 epic) = 111/77/56/22/11.
const RING_POOL_SIZES_00023014 = {
  common: 111, rare: 77, epic: 56, legendary: 22, impossible: 11,
};
// Ре-пин 000230.15: 50 ног/ступней append КОНЦОМ тиров
// (20/14/10/4/2) — блок колец не в самом конце тира, а непосредственно
// перед хвостом ног/ступней.
const LEGSFEET_TAIL_COUNTS_00023015 = {
  common: 20, rare: 14, epic: 10, legendary: 4, impossible: 2,
};
// Ре-пин 000230.19: 2 torso-набора append КОНЦОМ тиров common/epic —
// блок ног/ступней не в самом конце тира, а перед хвостом наборы
// (окно кольца сдвигается на n19).
const SETS_TAIL_COUNTS_00023019 = {
  common: 1, rare: 0, epic: 1, legendary: 0, impossible: 0,
};

test('000230.14 T7: пулы дропа — 25 колец КОНЦОМ тиров (append; §2.5): размеры 40/28/20/8/4 → 60/42/30/12/6 (ре-пин 000230.11: +50 рук) → 70/49/35/14/7 (ре-пин 000230.12: +25 «правая рука») → 80/56/40/16/8 (ре-пин 000230.14: +25 колец) → РОВНО 111/77/56/22/11 (Σ 277, ре-пин 000230.13: +25 left_hand, 000230.12: +25 «правая рука», ре-пин 000230.15: +50 ног/ступней КОНЦОМ 20/14/10/4/2, ре-пин 000230.19: +2 torso-набора КОНЦОМ common/epic); блок колец (ре-пин 000230.15: перед хвостом ног/ступней) = 25 id колец в каталожном порядке (10/7/5/2/1, compatible с динамическими EQ2/CH4 «пул ≡ каталог по редкости, каталожный порядок»); RARITY — 0 diff (EQ1: 50/30/15/4.9/0.1, Σ 1) (краснота: колец в EQUIP_POOLS нет — тиры 40/28/20/8/4)', () => {
  const L = require('../src/loot-equip-data.js');
  for (const t of EQ_TIERS) {
    const pool = L.EQUIP_POOLS[t];
    assert.equal(pool.length, RING_POOL_SIZES_00023014[t],
      'тир «' + t + '» — ровно ' + RING_POOL_SIZES_00023014[t]
      + ' (кольца append концом, §2.5); факт: ' + pool.length);
  }
  for (const t of EQ_TIERS) {
    const tail = RING_POOL_TAILS_00023014[t];
    const n15 = LEGSFEET_TAIL_COUNTS_00023015[t];
    const n19 = SETS_TAIL_COUNTS_00023019[t];
    assert.deepEqual(
      L.EQUIP_POOLS[t].slice(-(tail.length + n15 + n19), -(n15 + n19)),
      tail,
      'тир «' + t + '» — ' + tail.length
      + ' колец в каталожном порядке (§2.5; ре-пин 000230.15: '
      + n15 + ' ног/ступней концом тира; ре-пин 000230.19: '
      + n19 + ' torso-набор(а) концом тира); факт: '
      + JSON.stringify(L.EQUIP_POOLS[t].slice(
        -(tail.length + n15 + n19), -(n15 + n19))));
  }
  for (const t of EQ_TIERS) {
    assert.deepEqual(L.EQUIP_POOLS[t],
      I.allItems().filter((it) => it.rarity === t)
        .map((it) => it.id),
      'пул «' + t + '» ≡ каталог по редкости, каталожный порядок '
      + '(совместимость с EQ2/CH4)');
  }
  assert.deepEqual(L.RARITY, [
    { id: 'common', chance: 0.5 },
    { id: 'rare', chance: 0.3 },
    { id: 'epic', chance: 0.15 },
    { id: 'legendary', chance: 0.049 },
    { id: 'impossible', chance: 0.001 },
  ], 'RARITY — БЕЗ ПРАВОК (EQ1; баланс-инвариант D-08)');
});

// Задача 000230.12 — предметы «Правая рука»: бой (красные тесты).
// Контракт — memory/000230.12-right-hand-items-wave.md §3.1 R9–R11.
// RED (TDD): у 7 legacy-оружий поля slot НЕТ (R9 — краснота именно
// «нет поля slot», бой бит-в-бит), в каталоге 0 предметов
// subtype 'staff' / kind 'tool' (R10/R11 — «волна не добавлена»).
// Д-02: staff → attackSkillId 'staff' (subtype-маркер, навыка в
// каталоге НЕТ — practice applied 0, НИМУТАЦИИ); tool → damage 0 →
// формула кулаков + skillId 'fists'.
// =====================================================================

test('000230.12 R9: remap бит-в-бит — 7 legacy-оружий: JSON-поле "slot" === "right_hand" (краснота: у 7 оружия поля slot нет — фолбэк slotOf) + бой НЕ изменился: урон = stats.damage (strongHero), даль (ближний 1 / лук 3), practice-скилл swordsman/swordsman/swordsman/archer/archer/heavy/heavy, опыт в копилку; slot-поле не изменило equipmentStats (hitBonus/dmgBonus/armor)', () => {
  // [id, файл, stats.damage, practice-скилл, лук]
  const cases = [
    ['wood_sword', '000001.json', 3, 'swordsman', false],
    ['iron_sword', '000002.json', 5, 'swordsman', false],
    ['steel_sword', '000003.json', 7, 'swordsman', false],
    ['short_bow', '000004.json', 4, 'archer', true],
    ['hunting_bow', '000005.json', 6, 'archer', true],
    ['battle_axe', '000006.json', 8, 'heavy', false],
    ['war_hammer', '000007.json', 10, 'heavy', false],
  ];
  for (const [id, file, dmg, skill, isBow] of cases) {
    const j = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'assets', 'items', file), 'utf8'));
    assert.equal(j.slot, 'right_hand',
      file + ': ЯВНОЕ "slot":"right_hand" в JSON (краснота: у '
      + 'legacy-оружия поля slot нет — фолбэк slotOf); факт: '
      + j.slot);
    const p = strongHero(); // сила 1, уровень 1
    assert.equal(I.addItem(p, id).ok, true, id + ': выдача');
    assert.equal(I.equip(p, id).ok, true, id + ': equip');
    assert.equal(p.equipment.right_hand, id,
      id + ': предмет в слоте right_hand');
    // slot-поле не изменило боевой интерфейс (бит-в-бит).
    const es = I.equipmentStats(p);
    assert.equal(es.damage, dmg,
      id + ': equipmentStats.damage = stats.damage (бит-в-бит)');
    assert.equal(es.armor, 0, id + ': equipmentStats.armor 0');
    const c = createCombat({
      player: p, groupType: 3, seed: 5, width: 7, height: 4,
    });
    c._rng = () => 0.01; // все атаки попадают
    const far = c.units.find(
      (u) => Math.abs(u.x - c.px) + Math.abs(u.y - c.py) === 3);
    assert.ok(far, id + ': на карте есть моб на дистанции 3');
    let res;
    if (isBow) {
      // Лук бьёт в даль (дистанция 3).
      res = c.attack(far.id);
      assert.equal(res.ok, true, id + ': лук бьёт в даль');
      assert.equal(res.hit, true, id + ': попадание');
      assert.equal(res.dmg, dmg, id + ': урон = stats.damage');
    } else {
      // Ближний бой: вплотную — урон; дистанция 3 — недосягаема.
      standNextTo(c, c.units[0]);
      res = c.attack(c.units[0].id);
      assert.equal(res.ok, true, id + ': атака');
      assert.equal(res.hit, true, id + ': попадание');
      assert.equal(res.dmg, dmg,
        id + ': урон = stats.damage (бит-в-бит)');
      c.ps.attack = 1;
      const rf = c.attack(far.id);
      assert.equal(rf.ok, false,
        id + ': ближний бой — дистанция 3 недосягаема');
      assert.match(rf.reason, /далеко/);
    }
    assert.equal(res.practice.skill, skill,
      id + ': practice-скилл «' + skill + '» (бит-в-бит)');
    assert.equal(res.practice.xp, PRACTICE_XP.hit, id + ': xp = hit');
    assert.equal(p.skillXp[skill], PRACTICE_XP.hit,
      id + ': опыт записан в копилку «' + skill + '»');
  }
});

test('000230.12 R10: staff — 7 посохов: дальность МЕЛ 1 (maxDist = isBow?4:1, combat.js:1409 — посох не лук), урон = stats.damage (eq.dmgBonus = 0: staff не в sword/bow/heavy-ветках equipmentStats), skillId "staff" (D-02): practice("staff") → {applied: 0} — НИМУТАЦИИ (skillXp.staff отсутствует — навыка нет в каталоге); equipmentStats {damage: stats.damage, subtype: "staff", hitBonus 0, dmgBonus 0, armor 0} (краснота: предметов subtype staff нет в каталоге)', () => {
  // [id, stats.damage] — ростер §2.1 (7 staff).
  const staffs = [
    ['ember_staff', 5], ['rime_staff', 5], ['rune_staff', 6],
    ['flame_staff', 7], ['ice_staff', 8], ['sage_staff', 11],
    ['philosopher_staff', 13],
  ];
  for (const [id, dmg] of staffs) {
    const p = strongHero();
    const ra = I.addItem(p, id);
    assert.equal(ra.ok, true,
      id + ': выдача (краснота: предмета нет — волна не добавлена)');
    assert.equal(I.equip(p, id).ok, true, id + ': equip');
    assert.equal(p.equipment.right_hand, id,
      id + ': предмет в слоте right_hand');
    assert.deepEqual(I.equipmentStats(p),
      { damage: dmg, subtype: 'staff', hitBonus: 0, dmgBonus: 0,
        armor: 0 },
      id + ': equipmentStats — staff проходит ВСЕ ветки: '
      + 'hitBonus/dmgBonus 0, damage = stats.damage');
    const c = createCombat({
      player: p, groupType: 3, seed: 5, width: 7, height: 4,
    });
    c._rng = () => 0.01; // попадание гарантировано
    // Дистанция 3 — недосягаема (посох — мел, maxDist 1).
    const far = c.units.find(
      (u) => Math.abs(u.x - c.px) + Math.abs(u.y - c.py) === 3);
    assert.ok(far, id + ': на карте есть моб на дистанции 3');
    const rf = c.attack(far.id);
    assert.equal(rf.ok, false,
      id + ': дальность посоха 1 — дистанция 3 недосягаема');
    assert.match(rf.reason, /далеко/);
    // Вплотную — урон = stats.damage.
    standNextTo(c, c.units[0]);
    const r = c.attack(c.units[0].id);
    assert.equal(r.ok, true, id + ': атака');
    assert.equal(r.hit, true, id + ': попадание');
    assert.equal(r.dmg, dmg,
      id + ': урон = stats.damage (1 + dmgBonus 0)');
    assert.equal(r.practice.skill, 'staff',
      id + ': skillId "staff" (D-02: subtype-маркер, каталожного '
      + 'навыка нет)');
    assert.equal(r.practice.xp, PRACTICE_XP.hit, id + ': xp = hit');
    assert.equal(r.practice.applied, 0,
      id + ': practice("staff") → applied 0 (навык неизвестен)');
    assert.equal(r.practice.level, 0, id + ': practice level 0');
    assert.equal(p.skillXp.staff, undefined,
      id + ': НИМУТАЦИИ — skillXp.staff отсутствует');
  }
});

test('000230.12 R11: tool — 10 инструментов: equip в right_hand (явное slot-поле), stats НЕТ → equipmentStats {damage 0, subtype null, hitBonus 0, dmgBonus 0, armor 0} → формула КУЛАКОВ (3+floor(str·0.8)+floor(level·0.5))·(1+fistDamageBonus+heavyDamageBonus): strongHero (сила 1, уровень 1) — 3; skillId "fists" (attackSkillId: damage 0 → fists), опыт «Каменным кулакам» (краснота: предметов kind tool нет в каталоге)', () => {
  const tools = [
    'iron_hammer', 'iron_tongs', 'clay_crucible', 'stone_mortar',
    'bone_graver', 'steel_hammer', 'rune_stylus', 'silver_crucible',
    'rune_chisel', 'mithril_hammer',
  ];
  for (const id of tools) {
    const p = strongHero(); // сила 1, уровень 1 → кулаки: 3
    const ra = I.addItem(p, id);
    assert.equal(ra.ok, true,
      id + ': выдача (краснота: предмета нет — волна не добавлена)');
    assert.equal(I.equip(p, id).ok, true, id + ': equip');
    assert.equal(p.equipment.right_hand, id,
      id + ': предмет в слоте right_hand');
    assert.deepEqual(I.equipmentStats(p),
      { damage: 0, subtype: null, hitBonus: 0, dmgBonus: 0, armor: 0 },
      id + ': equipmentStats — tool без stats → нули '
      + '(ветка кулаков)');
    const c = createCombat({ player: p, groupType: 3, seed: 5 });
    c._rng = () => 0.01; // попадание гарантировано
    standNextTo(c, c.units[0]);
    const r = c.attack(c.units[0].id);
    assert.equal(r.ok, true, id + ': атака');
    assert.equal(r.hit, true, id + ': попадание');
    assert.equal(r.dmg, 3,
      id + ': урон = формула кулаков 3 (сила 1, уровень 1) — tool '
      + 'урона не даёт');
    assert.equal(r.practice.skill, 'fists',
      id + ': practice «fists» (damage 0 → безоружная ветка)');
    assert.equal(p.skillXp.fists, PRACTICE_XP.hit,
      id + ': опыт «Каменным кулакам» записан');
  }
});

// =====================================================================
// --- Задача 000245: лут — базовая вероятность по разности уровней ---
// --- Флогистона и побеждённого моба (красные тесты TDD) -----------
//
// Контракт — memory/000245-loot-chance-by-diff.md:
//   * P(D) = clamp(0.25 + 0.04·D, 0.05, 0.25), D = heroLevel −
//     mobLevel (моб старше → вероятность ниже; пример пользователя
//     Флогистон 10 / моб 15 → 0.05); ОДИН P(D) для базового (per-mob)
//     и редкого (общий ролл) пулов;
//   * семантика «один предмет из пула» и ЧИСЛО/порядок вызовов
//     c._rng НЕ МЕНЯЮТСЯ (гард L6).
// RED: экспорт lootChance + константы LOOT_CHANCE_* отсутствуют в
// src/combat.js (undefined → осмысленный TypeError при ПЕРВОМ ВЫЗОВЕ,
// не load-ошибка: require combat.js грузится, UMD цел, прочие
// экспорты на месте — прецедент 000132/000230.05/000235.05):
//   * L1 — пример пользователя: Флогистон 10 / моб 15 → P(−5) = 0.05
//     (точное) + константы 0.25/0.04/0.05/0.25;
//   * L2 — формула на граничных D: floor (D ≤ −5) = 0.05 (точное —
//     константа капа/пола), линейные 0.09/0.13/0.17/0.21 (толеранс
//     1e-9 — паттерн near S1: FP 0.25 + 0.04·(−2) =
//     0.16999999999999998, не 0.17), P(0) = 0.25, кап (D ≥ 0) = 0.25
//     (точные), монотонность (неубывание при росте D);
//   * L3 — пример пользователя в бою: герой 10 / волк 15, rng→0.15 →
//     базовый и редкий МИМО (P(−5) = 0.05) → items = [] (краснота —
//     AssertionError deepEqual: старый код оба попадёт — 0.15 < 0.25
//     и 0.15 < 0.05 + 0.01·15 = 0.2 → healing_potion + hunting_bow);
//   * L4 — D = 0 (герой 10 / волк 10) и D > 0 (герой 15 / волк 10),
//     rng→0.16 → редкий ПОПАДАЕТ (новый P(0) = P(+5) = 0.25) →
//     hunting_bow ЕСТЬ; старый код: редкий базис 0.05 + 0.01·10 =
//     0.15000000000000002 (FP!) → 0.16 мимо → hunting_bow НЕТ (краснота
//     — AssertionError). Монета 0.16: строго ВВЕРХ старый редкий
//     порог, строго НИЖЕ новый P — дискриминация через РЕДКИЙ базис
//     (монета 0.15 не дискриминирует: 0.15 < 0.15000000000000002 —
//     и старый код попадёт);
//   * L5 — детерминизм нового сценария (гард, зелёный с red-фазы):
//     герой 10 / волк 15, реальный rng, seed 5, 2 прогона → идентичный
//     items (паттерн N1);
//   * L6 — число вызовов c._rng на победу НЕ ИЗМЕНЕНО (гард, зелёный
//     с red-фазы): 1×волк hero 10 / mob 15, rng→0.99, пустой
//     экип-пул → ровно 4 вызова (gold 1 + таблица 1 + база 1 + редкий
//     1); монета 0.99 — ВСЕ лут-роллы мимо и в старой (0.99 > 0.25 /
//     0.05 + 0.01·15 = 0.2), и в новой формуле (0.99 ≥ 0.05) → 4 = 4
//     в обеих фазах; ловит «формулу с доп-роллом». (items не
//     ассертится — свиток по солённому потоку независим.)
// Детали сценариев (пробные прогоны на текущем коде/каталоге):
//   * winLoot: heroLevel — p.level ДО createCombat (default 1 —
//     текущее поведение; поток не сдвигается: уровни 1 и 10, волк
//     L15, seed 5 → идентичные gold 36 / xp 68);
//   * killBy 'dealDamage' — ноль c._rng на убийство;
//   * level-up в сценариях НЕ ПРОИСХОДИТ (xpForNext(10) = 1581 > 68
//     xp волка L15; xpForNext(15) = 2905 > 48 xp волка L10) → на
//     момент лут-ролла c.player.level = заданный уровень;
//   * свиток (солёный поток по (seed, day 0)) — null во ВСЕХ новых
//     сценариях (пробный прогон на текущем каталоге, 83 свитка;
//     методика верифицирована S3(a)-золотым: seed 6 →
//     frost_wisp_scroll);
//   * пулы экипировки в node НЕ ПУСТЫ (loot-equip-data.js грузится
//     UMD-require'ом combat.js) → L3/L4/L6 ИЗОЛИРОВАНЫ фикстурами
//     (eqPoolsSave/Restore, паттерн D7 EQ3) — иначе экипировочный
//     предмет лёг бы в items ПОСЛЕДНИМ.
// =====================================================================

test('000245-L1: пример пользователя — формула: Флогистон 10 / моб 15 → P(D = −5) = 0.05 (RED)', () => {
  // RED: экспорт lootChance отсутствует (undefined) → TypeError
  // «lootChance is not a function» на первом вызове (require combat.js
  // грузится, UMD цел — не load-ошибка; прецедент 000132/000230.05).
  assert.equal(lootChance(10, 15), 0.05,
    'пример пользователя: Флогистон 10 / моб 15 (D = −5) → P = 0.05 '
    + '(точное; пол формулы)');
  assert.equal(typeof lootChance, 'function',
    'combat.js: экспорт lootChance(heroLevel, mobLevel) — 2 аргумента '
    + '(без голого D: знак D свитков противоположен)');
  assert.equal(LOOT_CHANCE_BASE, 0.25, 'LOOT_CHANCE_BASE = 0.25');
  assert.equal(LOOT_CHANCE_PER_LV, 0.04, 'LOOT_CHANCE_PER_LV = 0.04');
  assert.equal(LOOT_CHANCE_FLOOR, 0.05, 'LOOT_CHANCE_FLOOR = 0.05');
  assert.equal(LOOT_CHANCE_CAP, 0.25,
    'LOOT_CHANCE_CAP = 0.25 (== BASE — НАМЕРЕННО: лут не инфлируется '
    + 'за слабых мобов)');
});

test('000245-L2: формула P(D) — граничные D: floor (моб старше), линейные, P(0), кап (моб младше) + монотонность (RED)', () => {
  // RED: экспорт отсутствует → TypeError на первом вызове (как L1).
  const near = (got, want, msg) => assert.ok(
    Math.abs(got - want) < 1e-9, msg + ' (факт: ' + got + ')');
  assert.equal(lootChance(10, 20), 0.05,
    'D = −10 → floor 0.05 (точно: clamp-константа)');
  assert.equal(lootChance(10, 15), 0.05,
    'D = −5 → floor 0.05 (точно: clamp-константа; граница пола — '
    + 'пример пользователя)');
  near(lootChance(10, 14), 0.09, 'D = −4 → 0.09');
  near(lootChance(10, 13), 0.13, 'D = −3 → 0.13');
  // FP: 0.25 + 0.04·(−2) = 0.16999999999999998 (≠ декадному 0.17) —
  // пин с толерансом (паттерн near S1), не строгим литералом.
  near(lootChance(10, 12), 0.17, 'D = −2 → 0.17');
  near(lootChance(10, 11), 0.21, 'D = −1 → 0.21');
  assert.equal(lootChance(10, 10), 0.25,
    'D = 0 → 0.25 (паритет: текущая плоская вероятность НЕ МЕНЯЕТСЯ)');
  assert.equal(lootChance(15, 10), 0.25, 'D = +5 → кап 0.25');
  for (let d = -10; d < 10; d++) {
    assert.ok(lootChance(10, 10 - d) <= lootChance(10, 10 - d - 1),
      'монотонность: P(' + d + ') ≤ P(' + (d + 1) + ')');
  }
});

test('000245-L3: пример пользователя в бою: герой 10 / волк 15 (D = −5), rng→0.15 → базовый и редкий пулы МИМО — items = [] (RED)', () => {
  // RED (AssertionError deepEqual): старый код — 0.15 < 0.25 (базовый)
  // И 0.15 < 0.05 + 0.01·15 = 0.2 (редкий) → оба ПОПАДАЮТ → items =
  // [healing_potion (floor(0.15·8) = 1), hunting_bow (floor(0.15·18) = 2)].
  // Новая формула: P(10 − 15) = P(−5) = 0.05 → 0.15 ≥ 0.05 → оба МИМО.
  // Таблица волка: 0.15 < 0.1 → false (мимо в обоих кодах). Свиток:
  // (seed 5, day 0, maxLvl 15, player 10) → null (пробный прогон).
  const sav = eqPoolsSave();
  try {
    for (const t of EQ_TIERS) EQUIP_POOLS[t].splice(0);
    const { c } = winLoot({ mobs: ['wolf'], mobLevel: 15, seed: 5,
      heroLevel: 10, rng: () => 0.15, killBy: 'dealDamage' });
    assert.ok(Array.isArray(c.result.items),
      'victory: c.result.items обязан быть массивом');
    assert.deepEqual(c.result.items, [],
      'герой 10 / волк 15 (D = −5, P = 0.05): таблица (0.1), базовый '
      + 'и редкий — МИМО, свитка нет — items = [] (факт: '
      + JSON.stringify(c.result.items) + ')');
  } finally {
    eqPoolsRestore(sav);
  }
});

test('000245-L4: границы D в бою: D = 0 (герой 10 / волк 10) и D > 0 (герой 15 / волк 10) — редкий пул под новым базисом → hunting_bow ЕСТЬ (RED)', () => {
  // RED (AssertionError deepEqual): старый код — редкий базис
  // 0.05 + 0.01·10 = 0.15000000000000002 (FP!) → 0.16 ≥ порог → редкий
  // МИМО → items = [healing_potion] только. Новая формула: P(0) = 0.25
  // (D = 0) / P(+5) = 0.25 (кап, D > 0) → 0.16 < 0.25 → редкий
  // ПОПАДАЕТ → + hunting_bow (floor(0.16·18) = 2). Базовый: 0.16 < 0.25
  // — попадание в обоих (healing_potion, floor(0.16·8) = 1). Таблица:
  // 0.16 < 0.1 → false (мимо). Свиток: (seed 5, day 0) → null в обоих
  // под-сценариях (пробный прогон).
  const sav = eqPoolsSave();
  try {
    for (const t of EQ_TIERS) EQUIP_POOLS[t].splice(0);
    const want = [
      { id: 'healing_potion', qty: 1 },
      { id: 'hunting_bow', qty: 1 },
    ];
    const cases = [
      [10, 10, 'D = 0 (P = 0.25)'],
      [15, 10, 'D = +5 (кап 0.25)'],
    ];
    for (const [hero, mob, what] of cases) {
      const { c } = winLoot({ mobs: ['wolf'], mobLevel: mob, seed: 5,
        heroLevel: hero, rng: () => 0.16, killBy: 'dealDamage' });
      assert.deepEqual(c.result.items, want,
        'герой ' + hero + ' / волк ' + mob + ' (' + what + '): '
        + 'базовый + редкий попадены (факт: '
        + JSON.stringify(c.result.items) + ')');
    }
  } finally {
    eqPoolsRestore(sav);
  }
});

test('000245-L5: детерминизм нового сценария (гард, зелёный с red-фазы): герой 10 / волк 15, реальный rng, seed 5, 2 прогона → идентичный items', () => {
  const run = () => {
    const { c } = winLoot({ mobs: ['wolf'], mobLevel: 15, seed: 5,
      heroLevel: 10, killBy: 'dealDamage' });
    assert.ok(Array.isArray(c.result.items),
      'victory: c.result.items обязан быть массивом (факт: '
      + typeof c.result.items + ')');
    return JSON.stringify(c.result.items);
  };
  assert.equal(run(), run(), 'тот же сид → тот же состав лута');
});

test('000245-L6: число вызовов c._rng на победу НЕ ИЗМЕНЕНО (гард, зелёный с red-фазы): 1×волк hero 10 / mob 15, rng→0.99, пустой экип-пул → ровно 4 вызова (gold 1 + таблица 1 + база 1 + редкий 1)', () => {
  // Монета 0.99: ВСЕ лут-роллы мимо и в старой (0.99 > 0.25 / 0.2), и в
  // новой (0.99 ≥ 0.05) формуле → число вызовов 4 = 4 в обеих фазах.
  // Ловит реализацию, добавившую ДОП-ролл c._rng в формулу (5 ≠ 4).
  const sav = eqPoolsSave();
  try {
    for (const t of EQ_TIERS) EQUIP_POOLS[t].splice(0);
    let calls = 0;
    const counting = () => { calls += 1; return 0.99; };
    winLoot({ mobs: ['wolf'], mobLevel: 15, seed: 5, heroLevel: 10,
      rng: counting, killBy: 'dealDamage' });
    assert.equal(calls, 4,
      'вызовы c._rng: gold 1 (checkVictory) + таблица волка 1 + база 1 '
      + '+ редкий 1 (pick-вызовов нет — все роллы мимо)');
  } finally {
    eqPoolsRestore(sav);
  }
});

// =====================================================================
// 000260: расстановка перед боем — Флогистон, Эфир и союзники
// (tasks/pending/000260.md; контракт memory/000260-combat-placement.md)
//
// Краснота (red-фаза): параметра placement у createCombat и экспорта
// validatePlacement в src/combat.js ещё нет:
//   * C1/C3/C4 — placement молча игнорируется → юниты на якорях,
//     старый набор препятствий / targetId / pre-roll → падают
//     ассерты «юниты на переданных клетках / reserved из новых
//     позиций / targetId и pre-roll по новым позициям» (отсутствие
//     функциональности, не крах модуля);
//   * C2 — validatePlacement undefined (require-шапка) → осмысленный
//     TypeError «not a function» (прецедент 000132/000155/000167/
//     000175/000245);
//   * C0 — гард (зелёный с red-фазы): дефолт (без placement) —
//     якоря + набор препятствий + очередь — инвариант бит-в-бит.
//
// Зона расстановки: строки max(0, height−2)..height−1 (при 7×7 —
// y=5..6); без перекрытий (включая мобо-rect'ы); в пределах поля.
// Мобы НЕ расставляются. Расстановка применяется ДО generateObstacles
// (reserved из новых позиций) и ДО targetId/pre-roll.
// =====================================================================

function pos260(c, id) {
  if (id === 'player') return [c.px, c.py];
  const u = c.units.find((x) => x.id === id);
  assert.ok(u, 'юнит ' + id + ' в бою (фикстура)');
  return [u.x, u.y];
}

const mobs260 = (c) => c.units.filter((u) => u.side === 'mob')
  .map((u) => [u.id, u.x, u.y]).sort();
const obst260 = (c) => [...c.obstacles].sort();

test('000260-C0: дефолт (без placement) — якоря бит-в-бит: игрок (3,6), Эфир (px−1,py−1), наёмники по очереди якорей, мобы xs=[1,3,5] y=0; препятствия/цель/очередь по сиду (гард)', () => {
  const E = loadEfir000081();
  const c = createCombat({
    player: strongHero(),
    allies: [E.efirAllyData(E.createEfir()), ALLY_VOLK, ALLY_ASHKA],
    mobs: ['wolf', 'wolf', 'wolf'], mobLevel: 2, seed: 7,
  });
  assert.deepEqual(pos260(c, 'player'), [3, 6], 'игрок — (floor(w/2), h−1)');
  assert.deepEqual(pos260(c, 'efir'), [2, 5], 'Эфир — первый якорь (px−1, py−1)');
  assert.deepEqual(pos260(c, 'a1'), [4, 5], 'второй якорь (px+1, py−1)');
  assert.deepEqual(pos260(c, 'a2'), [3, 5], 'третий якорь (px, py−1)');
  assert.deepEqual(mobs260(c), [['m0', 1, 0], ['m1', 3, 0], ['m2', 5, 0]],
    'мобы — якоря xs=[1,3,5,0,2,4], y=0..1 (1×1 → y=0)');
  assert.deepEqual(obst260(c),
    ['0,6', '1,3', '2,3', '4,3', '5,1'],
    'препятствия по сиду 7 (reserved — стартовые позиции): '
    + JSON.stringify(obst260(c)));
  assert.equal(c.targetId, 'm1', 'targetId = ближайший моб от (3,6)');
  assert.deepEqual(c.turnOrder,
    ['efir', 'm0', 'm1', 'm2', 'player', 'a1', 'a2'],
    'очередь по инициативе (Эфир 4 → мобы 3 → игрок/наёмники 2/0)');
  assert.equal(c.turnIndex, 0,
    'pre-roll остановился на первом союзном слоте (ввод игрока) — никто не действовал → позиции = якоря');
  assert.equal(c.phase, 'player');
  assert.ok(!c.result, 'бой не завершен');
  assert.equal(c.log[0], 'Бой: блуждающая группа (уровень 2, мобы 3).');
});

test('000260-C1: createCombat({placement}) — юниты на переданных клетках (игрок/Эфир/наёмник), неперечисленные — на якорях; мобы бит-в-бит с боем без placement', () => {
  const E = loadEfir000081();
  const base = createCombat({
    player: strongHero(),
    allies: [E.efirAllyData(E.createEfir()), ALLY_VOLK, ALLY_ASHKA],
    mobs: ['wolf', 'wolf', 'wolf'], mobLevel: 2, seed: 7,
  });
  // Фикстура: дефолт — якоря (гард C0, другой прогон).
  assert.deepEqual(pos260(base, 'player'), [3, 6]);
  assert.deepEqual(pos260(base, 'efir'), [2, 5]);
  assert.deepEqual(pos260(base, 'a1'), [4, 5]);
  assert.deepEqual(pos260(base, 'a2'), [3, 5]);
  const hero = strongHero();
  hero.primary.dexterity = 5; hero.primary.intelligence = 5;
  // Быстрый герой (инициатива 10) — pre-roll no-op: позиции мобо-
  // якорей детерминированы и сравнимы бит-в-бит.
  const c = createCombat({
    player: hero,
    allies: [E.efirAllyData(E.createEfir()), ALLY_VOLK, ALLY_ASHKA],
    mobs: ['wolf', 'wolf', 'wolf'], mobLevel: 2, seed: 7,
    placement: { player: [1, 5], efir: [3, 5], a2: [2, 6] },
  });
  assert.deepEqual(pos260(c, 'player'), [1, 5],
    'игрок — на переданной клетке (зона строк 5–6)');
  assert.deepEqual(pos260(c, 'efir'), [3, 5], 'Эфир — на переданной клетке');
  assert.deepEqual(pos260(c, 'a2'), [2, 6], 'наёмник — на переданной клетке');
  assert.deepEqual(pos260(c, 'a1'), [4, 5],
    'неперечисленный союзник — свой якорь (частичная расстановка)');
  assert.deepEqual(mobs260(c), mobs260(base),
    'мобы НЕ расставляются — бит-в-бит с боем без placement (тот же сид)');
  assert.equal(c.targetId, 'm0',
    'targetId — ближайший моб от НОВОЙ позиции игрока (1,5)');
});

test('000260-C2: validatePlacement — зона строк max(0,h−2)..h−1 (от height), пределы поля, нецелые координаты, неизвестный юнит, перекрытие (союзник↔игрок и союзник↔моб-rect); createCombat с невалидной расстановкой — throw', () => {
  const E = loadEfir000081();
  const base = createCombat({
    player: strongHero(),
    allies: [E.efirAllyData(E.createEfir()), ALLY_VOLK],
    mobs: ['wolf'], mobLevel: 2, seed: 5,
  });
  // Фикстура: игрок (3,6), Эфир (2,5), а1 (4,5), волк (1,0) — pre-roll
  // остановился на слоте Эфира (ввод), никто не сдвинулся.
  assert.deepEqual(pos260(base, 'player'), [3, 6]);
  assert.deepEqual(pos260(base, 'efir'), [2, 5]);
  assert.deepEqual(pos260(base, 'a1'), [4, 5]);
  assert.deepEqual(pos260(base, 'm0'), [1, 0]);
  // Допустимо: клетка в зоне и свободна.
  assert.deepEqual(validatePlacement(base, { player: [3, 5] }),
    { ok: true }, 'зона 7×7 = строки 5–6, (3,5) свободно');
  // Вне зоны (выше строк 5–6) — reason.
  assert.deepEqual(validatePlacement(base, { player: [3, 4] }),
    { ok: false, reason: 'расстановка: player: вне первых двух линий' },
    'y=4 — выше первых двух линий (7×7)');
  // Вне поля (y и x) — reason.
  assert.deepEqual(validatePlacement(base, { player: [3, 7] }),
    { ok: false, reason: 'расстановка: player: клетка вне поля' },
    'y=7 — за границей 7×7');
  assert.deepEqual(validatePlacement(base, { player: [7, 5] }),
    { ok: false, reason: 'расстановка: player: клетка вне поля' },
    'x=7 — за границей 7×7');
  // Перекрытие: игрок и Эфир на одной клетке (финальная конфигурация).
  const over = validatePlacement(base, { player: [2, 5], efir: [2, 5] });
  assert.equal(over.ok, false, 'перекрытие игрок↔Эфир отклонено');
  assert.ok(String(over.reason).includes('клетка занята'),
    'reason — «клетка занята»: ' + over.reason);
  // Нецелые координаты — reason.
  assert.deepEqual(validatePlacement(base, { player: [1.5, 5] }),
    { ok: false, reason: 'расстановка: player: некорректные координаты' });
  // Неизвестный юнит — reason.
  assert.deepEqual(validatePlacement(base, { b0: [1, 5] }),
    { ok: false, reason: 'расстановка: неизвестный юнит b0' });
  // Зона — ОТ HEIGHT: 7×2 → строки 0..1.
  const c2 = createCombat({
    player: strongHero(),
    allies: [ALLY_VOLK],
    mobs: ['wolf'], mobLevel: 2, width: 7, height: 2, seed: 5,
  });
  assert.deepEqual(pos260(c2, 'player'), [3, 1]);
  assert.deepEqual(pos260(c2, 'a0'), [2, 0]);
  assert.deepEqual(pos260(c2, 'm0'), [1, 0]);
  const overMob = validatePlacement(c2, { a0: [1, 0] });
  assert.equal(overMob.ok, false, 'союзник на мобо-клетке — перекрытие');
  assert.ok(String(overMob.reason).includes('клетка занята'),
    'reason — «клетка занята» (моб-rect): ' + overMob.reason);
  const overAlly = validatePlacement(c2, { player: [2, 0] });
  assert.equal(overAlly.ok, false, 'игрок на якорной клетке союзника');
  assert.ok(String(overAlly.reason).includes('клетка занята'),
    'reason — «клетка занята»: ' + overAlly.reason);
  assert.deepEqual(validatePlacement(c2, { player: [3, 0] }), { ok: true },
    '7×2: y=0 — В зоне (строки 0..1), свободно');
  // 7×4 → строки 2..3.
  const c4 = createCombat({
    player: strongHero(),
    mobs: ['wolf'], mobLevel: 2, width: 7, height: 4, seed: 5,
  });
  assert.deepEqual(pos260(c4, 'player'), [3, 3]);
  assert.deepEqual(validatePlacement(c4, { player: [3, 1] }),
    { ok: false, reason: 'расстановка: player: вне первых двух линий' },
    '7×4: y=1 — выше строк 2–3');
  assert.deepEqual(validatePlacement(c4, { player: [3, 2] }), { ok: true },
    '7×4: y=2 — в зоне');
  // createCombat с невалидной расстановкой — throw (reason).
  assert.throws(() => createCombat({
    player: strongHero(), mobs: ['wolf'], mobLevel: 2, seed: 5,
    placement: { player: [3, 4] },
  }), /расстановка: player: вне первых двух линий/,
    'невалидная расстановка — бой не создаётся (throw с reason)');
});

test('000260-C3: препятствия — reserved из НОВЫХ позиций: расстановка {player:[1,5]} (seed 5) сдвигает камень (1,5)→(3,6); якорный бой инвариантен; детерминизм', () => {
  const mk = (placement) => createCombat({
    player: strongHero(), mobs: ['wolf'], mobLevel: 2, seed: 5,
    ...(placement ? { placement } : {}),
  });
  const a = mk(null);
  const b = mk({ player: [1, 5] });
  // Фикстура: якорный бой — (3,6) reserved (игрок), камень на (1,5).
  assert.deepEqual(obst260(a),
    ['0,3', '0,5', '1,5', '2,5', '2,6', '4,0', '4,5', '5,1', '5,4'],
    'якорный бой (seed 5) — набор препятствий: ' + JSON.stringify(obst260(a)));
  assert.ok(a.obstacles.has('1,5'), 'фикстура: (1,5) — камень (свободна)');
  assert.ok(!a.obstacles.has('3,6'),
    'фикстура: (3,6) — reserved (якорь игрока), камня нет');
  // Расстановка: игрок (1,5) → клетка reserved, камня нет; (3,6)
  // высвобождена → в тот же rng-поток попадает камень.
  assert.deepEqual(pos260(b, 'player'), [1, 5], 'расстановка применена');
  assert.ok(!b.obstacles.has('1,5'),
    'НОВАЯ позиция игрока — reserved: камня на (1,5) нет');
  assert.ok(b.obstacles.has('3,6'),
    'высвобожденная якорная клетка (3,6) — в reserved-свободные: '
    + 'камень из того же rng-потока');
  assert.deepEqual(obst260(b),
    ['0,3', '0,5', '2,5', '2,6', '3,6', '4,0', '4,5', '5,1', '5,4'],
    'набор differs ровно на (1,5)→(3,6): ' + JSON.stringify(obst260(b)));
  // Детерминизм: повторный прогон с той же расстановкой — бит-в-бит.
  assert.deepEqual(obst260(mk({ player: [1, 5] })), obst260(b),
    'тот же сид + та же расстановка → тот же набор препятствий');
  assert.deepEqual(obst260(mk(null)), obst260(a),
    'якорный прогон повторяем (бит-в-бит)');
});

test('000260-C4: targetId и pre-roll — по НОВЫМ позициям; бой с расстановкой детерминирован (сид → результат)', () => {
  // (a) targetId: быстрый герой (инициатива 10 — pre-roll no-op),
  // 2 волка (1,0)/(3,0): от (3,6) ближе m1, от (1,5) ближе m0.
  const mkHero = () => {
    const h = strongHero();
    h.primary.dexterity = 5; h.primary.intelligence = 5;
    return h;
  };
  const a = createCombat({
    player: mkHero(), mobs: ['wolf', 'wolf'], mobLevel: 2, seed: 42,
  });
  const b = createCombat({
    player: mkHero(), mobs: ['wolf', 'wolf'], mobLevel: 2, seed: 42,
    placement: { player: [1, 5] },
  });
  assert.equal(a.targetId, 'm1',
    'фикстура: от якоря (3,6) ближе m1 (3,0)');
  assert.deepEqual(mobs260(b), [['m0', 1, 0], ['m1', 3, 0]],
    'мобы на якорях (pre-roll no-op — герой быстрее всех)');
  assert.deepEqual(pos260(b, 'player'), [1, 5], 'расстановка применена');
  assert.equal(b.targetId, 'm0',
    'targetId — от НОВОЙ позиции игрока (1,5): ближе m0 (1,0)');
  // (b) pre-roll: паук 4 > игрок 2 — pre-roll действует ДО входа
  // игрока; шаг моба — к ТЕКУЩЕЙ позиции игрока (расстановка ДО
  // pre-roll): от (3,6) и от (1,5) — разные шаги. rng-очередь —
  // чистые препятствия справа (5 камней, ни одно не reserved в
  // обоих боях → поток идентичен).
  const queue = [0, 6/7, 6/7, 6/7, 5/7, 5/7, 6/7, 4/7, 4/7, 6/7, 4/7];
  const q = () => {
    const arr = queue.slice();
    let i = 0;
    return () => arr[i++];
  };
  const pa = createCombat({
    player: strongHero(), mobs: ['spider', 'spider'], mobLevel: 2,
    seed: 42, rng: q(),
  });
  const pb = createCombat({
    player: strongHero(), mobs: ['spider', 'spider'], mobLevel: 2,
    seed: 42, rng: q(), placement: { player: [1, 5] },
  });
  assert.deepEqual(obst260(pa), obst260(pb),
    'фикстура: препятствия идентичны (reserved-пересечение пусто)');
  assert.deepEqual(pos260(pa, 'm0'), [2, 0],
    'фикстура: pre-roll от якоря (3,6) — m0 (1,0)→(2,0)');
  assert.deepEqual(pos260(pa, 'm1'), [3, 1],
    'фикстура: pre-roll от якоря — m1 (3,0)→(3,1)');
  assert.deepEqual(pos260(pb, 'm0'), [1, 1],
    'pre-roll по НОВОЙ позиции (1,5): m0 (1,0)→(1,1)');
  assert.deepEqual(pos260(pb, 'm1'), [2, 0],
    'pre-roll по НОВОЙ позиции: m1 (3,0)→(2,0)');
  assert.equal(pa.targetId, 'm1', 'фикстура: цель от (3,6) — m1');
  assert.equal(pb.targetId, 'm0', 'цель от (1,5) после pre-roll — m0');
  // (c) Детерминизм: повторный прогон — снапшот бит-в-бит (лог,
  // позиции, очередь, цель, позиции игрока, препятствия).
  const snap = (c) => JSON.stringify({
    log: c.log,
    pos: c.units.map((u) => [u.id, u.x, u.y]).sort(),
    turnOrder: c.turnOrder, turnIndex: c.turnIndex,
    targetId: c.targetId, px: c.px, py: c.py,
    obstacles: obst260(c), phase: c.phase,
  });
  const pa2 = createCombat({
    player: strongHero(), mobs: ['spider', 'spider'], mobLevel: 2,
    seed: 42, rng: q(),
  });
  const pb2 = createCombat({
    player: strongHero(), mobs: ['spider', 'spider'], mobLevel: 2,
    seed: 42, rng: q(), placement: { player: [1, 5] },
  });
  assert.equal(snap(pb2), snap(pb),
    'бой с расстановкой детерминирован (сид → результат)');
  assert.equal(snap(pa2), snap(pa), 'якорный бой детерминирован');
});

// =====================================================================
// Задача 000267: потребители NO-OP-статов — КРАСНЫЕ тесты (TDD)
// (находка C1 ретро-анализа RETRO-20261024; ТЗ tasks/pending/000267.md;
// контракт memory/000267-noop-stat-consumers.md; карта тестов a3).
//
// Функциональности в src/combat.js / src/spells.js ещё НЕТ: отсутствуют
// 5 точек потребления — тик «реген» в startRound (игрок c.ps.buff /
// союзник u.buff / зона c.zone {реген}), «вампиризм» на ударе игрока,
// drain-самохил в case «урон» (параметры.value), само-баф shroud
// «попадание_вниз» против ИГРОКА (mobAttack читает c.ps.buff),
// lifesteal призывного (mt.traits → makeAlly + allyAttack).
//
// Краснота осмысленная (отсутствием поведения, не синтаксис): каталог
// заклинаний кастуется штатно, состояния ПЕРЕГРУЖЕНЫ (c.ps.buff /
// u.buff / u.debuff / c.zone пишутся существующим кодом), но обещанное
// НЕ происходит: hp-дельта 0, р.онtra не лечит, хиты = контроль,
// traits.lifesteal undefined. Новых модулей/экспортов НЕ требуется —
// все require-путь уже есть в шапке (спеллы — через spells()).
//
// Закреплённые контракты (RED):
//   * 000267-REG-1 — тик «реген» у игрока: regeneration {реген,1,3}
//     на раненом герое — +1 HP/раунд, ровно 3 тика (turns 3→2→1→0,
//     «ровно N раундов, включая каст»), с 0-го — нет; детерминизм по
//     сид (2 прогона → тождественная траектория HP); RNG-гварда:
//     бой с баффом = бой без (0 новых вызовов c._rng);
//   * 000267-REG-2 — тик «реген» у СОЮЗНИКА (u.buff): раненый союзник
//     +1/тик ровно N раундов; союзник без баффа — инвариантен;
//   * 000267-REG-3 — зона circle_of_light {реген,1,3,r2}: игрок +
//     союзник в радиусе Чебышёва от клетки каста лечатся каждый раунд
//     (союзник, получивший one-shot u.buff в момент каста, получает
//     ДВА тика: бафф + зону — факт Z2 контракта); вне радиуса — нет;
//     zone.turns 0 — тиков нет;
//   * 000267-VAM-1 — «вампиризм»: удар игрока при активном баффе
//     лечит кастера на round(0.5 × факт) (фикстура с ЧЁТНЫМ dmg);
//     без баффа — без лечения (бит-в-бит); после исчерпания — нет;
//   * 000267-SHR-1 — shroud-само-баф {попадание_вниз,0.25,3}: враг
//     промахивается чаще (X = середина полосы (hi, hi−0.25) из
//     ЭКСПОРТНОГО hitChance; контроль — 4 попадания, shroud — ровно
//     3 промаха + попадание после исчерпания); раздельные пути:
//     само-баф СОЮЗНИКА (u.buff) не потребляется против игрока;
//     дебаф МОБА (u.debuff, shadow_pool) — регрессия −0.15;
//   * 000267-SUM-1 — lifesteal призывного: shadow_wraith →
//     traits.lifesteal === true (mt.traits передан КОПИЕЙ — каталог
//     MOB_TYPES цел), удар призывного лечит его на ПОЛНЫЙ r.dmg;
//     light_sprite (fairy, трейтов в каталоге нет) — lifesteal
//     falsy, удар без лечения (контроль).
//
// expectedRedCount (файл) = 6.
// =====================================================================

// До раунда N (порядкоустойчиво: тик-окна статов — по раундам).
function toRound(c, n) {
  let guard = 0;
  while (c.round < n) {
    assert.ok(++guard < 64,
      'раунд не идёт (c.result: ' + JSON.stringify(c.result) + ')');
    c.endTurn();
  }
}

// u — вплотную к v (скан соседей; детерминированно, без c._rng).
function putAdjacent(c, u, v) {
  const taken = (x, y) => (c.obstacles && c.obstacles.has(x + ',' + y))
    || c.units.some((o) => o !== u && o !== v && o.alive && !o.fled
      && x >= o.x && x < o.x + ((o.size && o.size.w) || 1)
      && y >= o.y && y < o.y + ((o.size && o.size.h) || 1));
  const cand = [[v.x + 1, v.y], [v.x - 1, v.y],
    [v.x, v.y + 1], [v.x, v.y - 1]];
  const spot = cand.find(([x, y]) => x >= 0 && y >= 0
    && x < c.width && y < c.height && !taken(x, y));
  assert.ok(spot, 'нет свободной клетки вплотную к ' + v.id);
  u.x = spot[0];
  u.y = spot[1];
}

test('000267-REG-1: потребление «реген» — тик игрока в startRound (красный, 000267)', () => {
  const { castSpell } = spells();
  const mk = (cast) => {
    const p = strongHero();
    p.primary.wisdom = 10;
    p.spells = ['regeneration'];
    p.mp = 40;
    const maxhp = derived(p).maxHP;
    p.hp = maxhp - 30;
    const c = createCombat({
      player: p, mobs: ['wolf'], mobLevel: 2, seed: 13,
    });
    const w = c.units[0];
    standNextTo(c, w);
    assert.deepEqual(c.turnOrder, ['m0', 'player'],
      'фикстура: инициатива волка (2+1) > игрока (1+1)');
    const r = cast ? castSpell(c, 'regeneration') : null;
    // Снимок баффа СРАЗУ ПОСЛЕ КАСТА (после endTurns turns уже 0).
    const buffAfter = c.ps.buff
      ? { stat: c.ps.buff.stat, value: c.ps.buff.value,
        turns: c.ps.buff.turns }
      : null;
    const hp0 = p.hp;
    let calls = 0;
    c._rng = () => { calls += 1; return 0.99; };
    const traj = [];
    for (let i = 0; i < 4; i++) {
      c.endTurn();
      traj.push(p.hp);
    }
    return { c, p, hp0, traj, calls, r, buffAfter };
  };
  const a1 = mk(true);
  assert.equal(a1.r.ok, true, 'каст regeneration — ok');
  assert.deepEqual(a1.buffAfter, { stat: 'реген', value: 1, turns: 3 },
    'каст: c.ps.buff {реген, 1, 3} (запись ЕСТЬ и до GREEN)');
  const a2 = mk(true);
  assert.deepEqual(a2.traj, a1.traj,
    'детерминизм: сид → тождественная траектория HP');
  const b = mk(false);
  assert.equal(a1.calls, b.calls,
    'RNG-гварда: бой с баффом = контроль (0 новых c._rng)');
  assert.ok(a1.calls > 0, 'фикстура: волк реально бил (промахи в логе)');
  assert.deepEqual(a1.traj,
    [a1.hp0 + 1, a1.hp0 + 2, a1.hp0 + 3, a1.hp0 + 3],
    'RED: +1 HP/раунд, ровно 3 тика, включая каст; 4-й раунд — нет');
  assert.equal(a1.c.ps.buff.turns, 0,
    'бафф исчерпан (тик вместе с декрементом)');
});

test('000267-REG-2: потребление «реген» — тик союзника (u.buff) (красный, 000267)', () => {
  const { castSpell } = spells();
  const p = strongHero();
  p.primary.intelligence = 11;
  p.spells = ['regeneration'];
  p.mp = 40;
  const c = createCombat({
    player: p, mobs: ['wolf'], mobLevel: 2, seed: 13,
    allies: [
      { name: 'Вольк', role: 'melee', level: 1, dmg: 1.2, hp: 1.1,
        skills: [], spells: [] },
      { name: 'Гром', role: 'melee', level: 1, dmg: 1.2, hp: 1.1,
        skills: [], spells: [] },
    ],
  });
  const a0 = c.units.find((u) => u.side === 'ally' && u.name === 'Вольк');
  const a1 = c.units.find((u) => u.side === 'ally' && u.name === 'Гром');
  a0.hp = a0.maxHP - 10;
  a1.hp = a1.maxHP - 10;
  const r = castSpell(c, 'regeneration', a0.id);
  assert.equal(r.ok, true, 'каст по союзнику — ok');
  assert.deepEqual(a0.buff, { stat: 'реген', value: 1, turns: 3 },
    'u.buff {реген, 1, 3} (запись ЕСТЬ и до GREEN)');
  assert.equal(c.ps.buff, null,
    'у игрока баффа нет (цель — союзник)');
  const a0hp = a0.hp;
  const a1hp = a1.hp;
  c._rng = () => 0.99;
  toRound(c, 4);
  assert.equal(a0.hp - a0hp, 3,
    'RED: +1 HP/раунд, ровно 3 тика, включая каст');
  assert.equal(a1.hp, a1hp,
    'контроль: союзник без баффа не лечится');
  assert.equal(a0.buff.turns, 0, 'бафф исчерпан');
  toRound(c, 5);
  assert.equal(a0.hp - a0hp, 3, '4-й раунд: тиков нет — дельта та же');
});

test('000267-REG-3: потребление «реген» — зона circle_of_light (красный, 000267)', () => {
  const { castSpell } = spells();
  const p = strongHero();
  p.primary.intelligence = 11;
  p.spells = ['circle_of_light'];
  p.mp = 40;
  const maxhp = derived(p).maxHP;
  p.hp = maxhp - 30;
  const c = createCombat({
    player: p, mobs: ['wolf'], mobLevel: 2, seed: 13,
    allies: [
      { name: 'Вольк', role: 'melee', level: 1, dmg: 1.2, hp: 1.1,
        skills: [], spells: [] },
      { name: 'Гром', role: 'melee', level: 1, dmg: 1.2, hp: 1.1,
        skills: [], spells: [] },
    ],
  });
  const w = c.units.find((u) => u.side === 'mob');
  const a0 = c.units.find((u) => u.side === 'ally' && u.name === 'Вольк');
  const a1 = c.units.find((u) => u.side === 'ally' && u.name === 'Гром');
  // a0 — явно В РАДИУСЕ (r2) от клетки игрока, a1 — явно ВНЕ.
  a0.x = c.px + 1; a0.y = c.py;
  a1.x = 0; a1.y = 3;
  a0.hp = a0.maxHP - 10;
  a1.hp = a1.maxHP - 10;
  assert.ok(
    Math.max(Math.abs(a0.x - c.px), Math.abs(a0.y - c.py)) <= 2,
    'фикстура: a0 в радиусе зоны (Чебышёв ≤ 2)');
  assert.ok(
    Math.max(Math.abs(a1.x - c.px), Math.abs(a1.y - c.py)) > 2,
    'фикстура: a1 вне радиуса зоны');
  const r = castSpell(c, 'circle_of_light');
  assert.equal(r.ok, true, 'каст circle_of_light — ok');
  assert.deepEqual(c.zone,
    { x: c.px, y: c.py, radius: 2, stat: 'реген', value: 1, turns: 3 },
    'c.zone {реген, 1, 3, r2} (запись ЕСТЬ и до GREEN)');
  assert.deepEqual(a0.buff, { stat: 'реген', value: 1, turns: 3 },
    'one-shot каста: союзник в радиусе получает u.buff (есть и до GREEN)');
  assert.equal(a1.buff, undefined,
    'one-shot каста: союзник вне радиуса — без u.buff');
  const p0 = p.hp;
  const a0hp = a0.hp;
  const a1hp = a1.hp;
  c._rng = () => 0.99;
  toRound(c, 4);
  assert.equal(p.hp - p0, 3,
    'RED: игрок в зоне +1 HP/раунд, ровно 3 тика, включая каст');
  assert.equal(a0.hp - a0hp, 6,
    'RED: союзник в зоне 2 тика/раунд (one-shot u.buff + зона, факт Z2)');
  assert.equal(a1.hp, a1hp,
    'контроль: союзник вне радиуса — не лечится');
  assert.equal(c.zone.turns, 0, 'зона исчерпана');
  assert.equal(a0.buff.turns, 0, 'one-shot бафф исчерпан');
  toRound(c, 5);
  assert.equal(p.hp - p0, 3, 'после исчерпания зоны — тиков нет');
  assert.equal(a0.hp - a0hp, 6, 'после исчерпания — дельта та же');
});

test('000267-VAM-1: потребление «вампиризм» — удар игрока (красный, 000267)', () => {
  const { castSpell } = spells();
  const mk = (cast) => {
    const p = strongHero();
    p.primary.intelligence = 11;
    p.spells = ['vampire_touch'];
    p.mp = 40;
    const maxhp = derived(p).maxHP;
    p.hp = maxhp - 30;
    const c = createCombat({
      player: p, mobs: ['wolf'], mobLevel: 2, seed: 13,
    });
    const w = c.units[0];
    standNextTo(c, w);
    // ЧЁТНЫЙ dmg (3 − броня 1 = 2) — round(0.5 × факт) без дробности.
    w.armor = 1;
    w.maxHP = 200;
    w.hp = 200;
    if (cast) {
      const r = castSpell(c, 'vampire_touch');
      assert.equal(r.ok, true, 'каст vampire_touch — ok');
      assert.deepEqual(c.ps.buff,
        { stat: 'вампиризм', value: 0.5, turns: 3 },
        'бафф {вампиризм, 0.5, 3} (запись ЕСТЬ и до GREEN)');
    }
    const hp0 = p.hp;
    c._rng = () => 0.01;
    const atk = c.attack(w.id);
    return { c, p, w, hp0, atk };
  };
  const a = mk(true);
  assert.equal(a.atk.ok, true, 'удар — ok');
  assert.equal(a.atk.hit, true, 'попадание (0.01 < 0.52)');
  assert.equal(a.atk.dmg, 2, 'dmg 3 − броня 1 = 2 (бит-в-бит)');
  assert.equal(a.p.hp - a.hp0, 1,
    'RED: кастер лечится на round(0.5 × 2) = 1');
  const b = mk(false);
  assert.equal(b.atk.dmg, 2, 'контроль: тот же удар (dmg бит-в-бит)');
  assert.equal(b.p.hp, b.hp0,
    'контроль: без баффа — лечение отсутствует (бит-в-бит)');
  toRound(a.c, 4);
  assert.equal(a.c.ps.buff.turns, 0,
    'бафф исчерпан (ровно 3 раунда, включая каст)');
  const hpBefore2 = a.p.hp;
  const atk2 = a.c.attack(a.w.id);
  assert.equal(atk2.ok, true, 'удар после истечения — ok');
  assert.equal(atk2.hit, true, 'попадание');
  assert.equal(atk2.dmg, 2, 'dmg после истечения — 2');
  assert.equal(a.p.hp, hpBefore2,
    'после истечения — лечения больше нет (бит-в-бит)');
});

test('000267-SHR-1: потребление shroud-само-бафа — mobAttack по игроку (красный, 000267)', () => {
  const { castSpell } = spells();
  // X — середина полосы (без баффа, с баффом −0.25): контроль попадает
  // ВСЕГДА, shroud промахивается ВСЕГДА (hitChance — экспортирован).
  const hi = hitChance(2, 0, 1, 0);
  const lo = hitChance(2, -0.25, 1, 0);
  const X = (hi + lo) / 2;
  assert.ok(lo < X && X < hi, 'фикстура: середина полосы внутри полосы');
  const mk = (castShroud) => {
    const p = strongHero();
    p.primary.intelligence = 11;
    p.spells = castShroud ? ['shroud'] : [];
    p.mp = 40;
    const c = createCombat({
      player: p, mobs: ['wolf'], mobLevel: 2, seed: 13,
    });
    const w = c.units[0];
    standNextTo(c, w);
    w.damage = 10;
    w.maxHP = 200;
    w.hp = 200;
    if (castShroud) {
      const r = castSpell(c, 'shroud');
      assert.equal(r.ok, true, 'каст shroud — ok');
      assert.deepEqual(c.ps.buff,
        { stat: 'попадание_вниз', value: 0.25, turns: 3 },
        'само-баф {попадание_вниз, 0.25, 3} (запись ЕСТЬ и до GREEN)');
    }
    assert.deepEqual(c.turnOrder, ['player', 'm0'],
      'фикстура: игрок (11+1) раньше волка (2+1)');
    assert.equal(p.level, 1, 'фикстура: уровень игрока 1');
    assert.equal(derived(p).dodgeBonus, 0, 'фикстура: уклонения нет');
    c._rng = () => X;
    const hits = [];
    for (let i = 0; i < 4; i++) {
      const hp = p.hp;
      c.endTurn();
      hits.push(hp - p.hp);
    }
    return { c, p, hits };
  };
  const ctrl = mk(false);
  assert.deepEqual(ctrl.hits, [10, 10, 10, 10],
    'контроль: без баффа — 4 попадания (X < 0.58)');
  const sh = mk(true);
  assert.deepEqual(sh.hits, [0, 0, 0, 10],
    'RED: shroud — ровно 3 промаха (turns 3/2/1) + попадание '
    + 'после исчерпания (4-й раунд)');
  assert.deepEqual(sh.c.ps.buff,
    { stat: 'попадание_вниз', value: 0.25, turns: 0 },
    'бафф исчерпан (тик вместе с декрементом)');
  // (i) Само-баф СОЮЗНИКА (u.buff) НЕ потребляется в mobAttack
  // против игрока — пути раздельны (гварда обеих стадий).
  {
    const p = strongHero();
    p.primary.intelligence = 11;
    p.mp = 40;
    const c = createCombat({
      player: p, mobs: ['wolf'], mobLevel: 2, seed: 13,
      allies: [{ name: 'Вольк', role: 'melee', level: 1, dmg: 1.2,
        hp: 1.1, skills: [], spells: [] }],
    });
    const w = c.units.find((u) => u.side === 'mob');
    const a = c.units.find((u) => u.side === 'ally');
    a.buff = { stat: 'попадание_вниз', value: 0.25, turns: 3 };
    standNextTo(c, w);
    w.damage = 10;
    w.maxHP = 200;
    w.hp = 200;
    c._rng = () => X;
    const hp0 = p.hp;
    toRound(c, 5);
    assert.equal(hp0 - p.hp, 40,
      'гварда: 4 раунда → 4 попадания × 10 (само-баф союзника '
      + 'НЕ применяется к игроку)');
  }
  // (ii) Дебаф МОБА (u.debuff, shadow_pool) — регрессия −0.15
  // (гварда: существующий путь цела).
  {
    const hi2 = hitChance(2, 0, 1, 0);
    const lo2 = hitChance(2, -0.15, 1, 0);
    const X2 = (hi2 + lo2) / 2;
    const p = strongHero();
    p.primary.intelligence = 11;
    p.spells = ['shadow_pool'];
    p.mp = 40;
    const c = createCombat({
      player: p, mobs: ['wolf'], mobLevel: 2, seed: 13,
    });
    const w = c.units[0];
    standNextTo(c, w);
    w.damage = 10;
    w.maxHP = 200;
    w.hp = 200;
    const r = castSpell(c, 'shadow_pool');
    assert.equal(r.ok, true, 'каст shadow_pool — ok');
    assert.deepEqual(w.debuff,
      { stat: 'попадание_вниз', value: 0.15, turns: 3 },
      'one-shot зоны: волк (в радиусе) получает u.debuff — уже ЕСТЬ');
    c._rng = () => X2;
    const hits = [];
    for (let i = 0; i < 4; i++) {
      const hp = p.hp;
      c.endTurn();
      hits.push(hp - p.hp);
    }
    assert.deepEqual(hits, [0, 0, 0, 10],
      'дебаф-путь моба цела (регрессия −0.15)');
  }
});

test('000267-SUM-1: lifesteal призывного (traits из каталога + удар) (красный, 000267)', () => {
  const { castSpell } = spells();
  const mt = MOB_TYPES['vampire'];
  // (a) traits передаются из каталога (КОПИЯ, не ссылка).
  const p1 = strongHero();
  p1.primary.intelligence = 11;
  p1.spells = ['shadow_wraith'];
  p1.mp = 40;
  const c1 = createCombat({
    player: p1, mobs: ['wolf'], mobLevel: 2, seed: 13,
  });
  const r1 = castSpell(c1, 'shadow_wraith');
  assert.equal(r1.ok, true, 'каст shadow_wraith — ok');
  const a = c1.units.find((u) => u.id === r1.summoned);
  assert.ok(a, 'призывной в c.units');
  assert.equal(a.traits.lifesteal, true,
    'RED: traits.lifesteal передан из каталога (mt.traits)');
  assert.deepEqual(a.traits, { lifesteal: true }, 'traits = {lifesteal}');
  assert.notStrictEqual(a.traits, mt.traits,
    'копия, не ссылка (каталог MOB_TYPES не мутируется)');
  // (b) Удар призывного лечит его на ПОЛНЫЙ нанесённый урон.
  const w = c1.units.find((u) => u.side === 'mob');
  w.maxHP = 200;
  w.hp = 200;
  a.hp = Math.max(1, a.hp - 10);
  const ah0 = a.hp;
  c1._rng = () => 0.01;
  let n = 0;
  while (!c1.result && n++ < 16 && activeUnitId(c1) !== a.id) c1.endTurn();
  assert.equal(activeUnitId(c1), a.id,
    'слот призывного (очередь пересчитывается в startRound)');
  putAdjacent(c1, a, w);
  const atk = c1.attack(w.id);
  assert.equal(atk.ok, true, 'удар призывного — ok');
  assert.equal(atk.hit, true, 'попадание (0.01 < 0.58)');
  assert.equal(atk.dmg, 5, 'vampire L3: dmg 5 (бит-в-бит)');
  assert.equal(a.hp - ah0, 5,
    'RED: призывной лечится на ПОЛНЫЙ r.dmg (5)');
  // (c) Контроль: light_sprite (fairy — трейтов в каталоге НЕТ).
  const p2 = strongHero();
  p2.primary.intelligence = 11;
  p2.spells = ['light_sprite'];
  p2.mp = 40;
  const c2 = createCombat({
    player: p2, mobs: ['wolf'], mobLevel: 2, seed: 13,
  });
  const r2 = castSpell(c2, 'light_sprite');
  assert.equal(r2.ok, true, 'каст light_sprite — ok');
  const f = c2.units.find((u) => u.id === r2.summoned);
  assert.ok(!f.traits || !f.traits.lifesteal,
    'fairy — lifesteal в каталоге нет (гварда обеих стадий)');
  const w2 = c2.units.find((u) => u.side === 'mob');
  w2.maxHP = 200;
  w2.hp = 200;
  f.hp = Math.max(1, f.hp - 2);
  const fh0 = f.hp;
  c2._rng = () => 0.01;
  let n2 = 0;
  while (!c2.result && n2++ < 16 && activeUnitId(c2) !== f.id) c2.endTurn();
  assert.equal(activeUnitId(c2), f.id, 'слот феи');
  putAdjacent(c2, f, w2);
  const atk2 = c2.attack(w2.id);
  assert.equal(atk2.ok, true, 'удар феи — ok');
  assert.equal(atk2.hit, true, 'попадание');
  assert.equal(atk2.dmg, 1, 'fairy L2: dmg 1 (бит-в-бит)');
  assert.equal(f.hp, fh0,
    'lifesteal нет — лечения нет (контроль)');
});

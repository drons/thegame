const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/dungeon.js');
const M = require('../src/map.js');
const { createCharacter } = require('../src/player.js');

const PX = M.syntheticPixels(8, 8, 128, 128, 128, 255);

function heroAt(xp, level = 1) {
  const c = createCharacter();
  c.totalXp = xp;
  c.level = level;
  return c;
}

function floorSet(d) {
  const s = new Set();
  for (let y = 0; y < d.height; y++) {
    for (let x = 0; x < d.width; x++) {
      if (d.cells[y * d.width + x] === D.CELL_FLOOR) s.add(x + ',' + y);
    }
  }
  return s;
}

test('детерминированность: одна и та же точка входа — тот же лабиринт', () => {
  const a = D.createDungeon(37, -12, PX, M.TERRAIN.GRASS);
  const b = D.createDungeon(37, -12, PX, M.TERRAIN.GRASS);
  assert.equal(a.seed, b.seed);
  assert.deepEqual(a.cells, b.cells);
  assert.deepEqual(a.rooms, b.rooms);
  assert.deepEqual(a.exit, b.exit);
  assert.deepEqual(a.entrance, b.entrance);
});

test('другие координаты — другая форма', () => {
  const a = D.createDungeon(37, -12, PX, M.TERRAIN.GRASS);
  const b = D.createDungeon(38, -12, PX, M.TERRAIN.GRASS);
  assert.notEqual(a.seed, b.seed);
  assert.notDeepEqual(a.cells, b.cells);
});

test('форма зависит от пикселя map.png в точке входа', () => {
  const p1 = M.syntheticPixels(8, 8, 128, 128, 128, 255);
  const p2 = M.syntheticPixels(8, 8, 128, 128, 128, 254); // другой альфа-канал
  const a = D.createDungeon(37, -12, p1, M.TERRAIN.GRASS);
  const b = D.createDungeon(37, -12, p2, M.TERRAIN.GRASS);
  assert.notEqual(a.seed, b.seed);
  assert.notDeepEqual(a.cells, b.cells);
});

test('размер лабиринта зависит от типа', () => {
  for (const [terrain, alpha, type] of [
    [M.TERRAIN.GRASS, 255, D.DUNGEON_TYPES.CAVE],
    [M.TERRAIN.SWAMP, 255, D.DUNGEON_TYPES.DROWNED],
    [M.TERRAIN.FOREST, 255, D.DUNGEON_TYPES.CRYPT],
    [M.TERRAIN.HILL, 255, D.DUNGEON_TYPES.RUINS],
    [M.TERRAIN.HILL, 10, D.DUNGEON_TYPES.ABYSS],
  ]) {
    const px = M.syntheticPixels(8, 8, 128, 128, 128, alpha);
    const d = D.createDungeon(5, 5, px, terrain);
    assert.equal(d.type, type);
    assert.equal(d.width, D.DUNGEON_SIZE[type]);
    assert.equal(d.height, D.DUNGEON_SIZE[type]);
  }
});

test('типы подземелий из местности и альфы пикселя', () => {
  assert.equal(D.dungeonTypeFor(M.TERRAIN.SAND, 255), D.DUNGEON_TYPES.CAVE);
  assert.equal(D.dungeonTypeFor(M.TERRAIN.GRASS, 255), D.DUNGEON_TYPES.CAVE);
  assert.equal(D.dungeonTypeFor(M.TERRAIN.SWAMP, 255), D.DUNGEON_TYPES.DROWNED);
  assert.equal(D.dungeonTypeFor(M.TERRAIN.FOREST, 255), D.DUNGEON_TYPES.CRYPT);
  assert.equal(D.dungeonTypeFor(M.TERRAIN.HILL, 255), D.DUNGEON_TYPES.RUINS);
  assert.equal(D.dungeonTypeFor(M.TERRAIN.MOUNTAIN, 255), D.DUNGEON_TYPES.RUINS);
  assert.equal(D.dungeonTypeFor(M.TERRAIN.HILL, 63), D.DUNGEON_TYPES.ABYSS);
  assert.equal(D.dungeonTypeFor(M.TERRAIN.MOUNTAIN, 63), D.DUNGEON_TYPES.ABYSS);
});

test('все напольные клетки достижимы от входа (включая выход)', () => {
  for (const [x, y] of [[37, -12], [0, 0], [-7, 21], [100, 40]]) {
    const d = D.createDungeon(x, y, PX, M.TERRAIN.GRASS);
    const reach = D.reachableFrom(d, d.entrance.x, d.entrance.y);
    const floor = floorSet(d);
    assert.deepEqual(reach, floor, 'не все клетки достижимы');
    assert.ok(reach.has(d.exit.x + ',' + d.exit.y), 'выход недостижим');
  }
});

test('содержимое сидируется опытом персонажа (totalXp)', () => {
  const d = D.createDungeon(9, 9, PX, M.TERRAIN.GRASS);
  const a = D.generateDungeonContents(d, heroAt(1000));
  const b = D.generateDungeonContents(D.createDungeon(9, 9, PX, M.TERRAIN.GRASS), heroAt(1000));
  assert.equal(a.seed, b.seed);
  assert.deepEqual(a.mobs, b.mobs);
  assert.deepEqual(a.chests, b.chests);

  const c = D.generateDungeonContents(d, heroAt(1001));
  assert.notEqual(a.seed, c.seed);
  const snap = (k) => JSON.stringify({ m: k.mobs, ch: k.chests });
  assert.notEqual(snap(a), snap(c));
});

test('уровни мобов = уровень персонажа ± 3 (не ниже 1)', () => {
  const d = D.createDungeon(9, 9, PX, M.TERRAIN.GRASS);
  for (const lvl of [1, 5, 20]) {
    const c = D.generateDungeonContents(d, heroAt(500 * lvl, lvl));
    for (const m of c.mobs) {
      assert.ok(m.level >= 1, 'уровень ниже 1');
      assert.ok(m.level <= lvl + D.LEVEL_DELTA_MAX, 'выше потолка');
      assert.ok(Math.abs(m.level - lvl) <= D.LEVEL_DELTA_MAX || m.level === 1, 'дальше чем ±3');
    }
    assert.ok(c.mobs.length >= 3 && c.mobs.length <= 6, 'мало групп');
    assert.ok(c.chests.length >= 2 && c.chests.length <= 5, 'мало сундуков');
  }
});

test('безопасная зона у входа и выхода: там нет мобов', () => {
  const d = D.createDungeon(9, 9, PX, M.TERRAIN.GRASS);
  const c = D.generateDungeonContents(d, heroAt(800));
  for (const m of c.mobs) {
    const nearEntrance = Math.abs(m.x - d.entrance.x) <= 2 && Math.abs(m.y - d.entrance.y) <= 2;
    const nearExit = Math.abs(m.x - d.exit.x) <= 2 && Math.abs(m.y - d.exit.y) <= 2;
    assert.ok(!nearEntrance && !nearExit, 'моб в безопасной зоне');
  }
});

test('бездна: босс в дальней комнате', () => {
  const px = M.syntheticPixels(8, 8, 40, 40, 40, 10); // тёмная альфа → ABYSS
  const d = D.createDungeon(11, 3, px, M.TERRAIN.MOUNTAIN);
  assert.equal(d.type, D.DUNGEON_TYPES.ABYSS);
  const c = D.generateDungeonContents(d, heroAt(2000, 10));
  const boss = c.mobs.find((m) => m.boss);
  assert.ok(boss, 'в бездне нет босса');
  const far = d.rooms[d.rooms.length - 1];
  assert.equal(boss.x, far.cx);
  assert.equal(boss.y, far.cy);
  assert.equal(boss.level, Math.max(1, 10 + D.LEVEL_DELTA_MAX));
});

test('содержимое живёт dungeon_memory_days дней', () => {
  assert.ok(D.contentValid(1, 1 + D.DUNGEON_MEMORY_DAYS));
  assert.ok(!D.contentValid(1, 1 + D.DUNGEON_MEMORY_DAYS + 1));
  assert.ok(D.contentValid(10, 10));
});

test('сундук открывается один раз', () => {
  const d = D.createDungeon(9, 9, PX, M.TERRAIN.GRASS);
  const c = D.generateDungeonContents(d, heroAt(700));
  const ch = c.chests[0];
  const r1 = D.openChest(c, ch.id);
  assert.ok(r1.ok);
  assert.equal(r1.gold, ch.gold);
  const r2 = D.openChest(c, ch.id);
  assert.equal(r2.ok, false);
  assert.equal(D.openChest(c, 'нет').ok, false);
});

test('мобы блуждают: только по полу, без наложений, детерминированно', () => {
  const d = D.createDungeon(9, 9, PX, M.TERRAIN.GRASS);
  const mk = () => D.generateDungeonContents(D.createDungeon(9, 9, PX, M.TERRAIN.GRASS), heroAt(900));
  const a = mk();
  const b = mk();
  for (let i = 0; i < 30; i++) {
    D.wanderStep(a, d);
    D.wanderStep(b, d);
    // Детерминизм по номеру шага.
    assert.deepEqual(a.mobs.map((m) => [m.x, m.y]), b.mobs.map((m) => [m.x, m.y]));
    // Только на полу, без двух групп на одной клетке.
    const seen = new Set();
    for (const m of a.mobs) {
      if (m.defeated) continue;
      assert.equal(d.cells[m.y * d.width + m.x], D.CELL_FLOOR, 'моб в стене');
      assert.ok(!seen.has(m.x + ',' + m.y), 'две группы на одной клетке');
      seen.add(m.x + ',' + m.y);
    }
  }
});

test('побеждённая группа не двигается', () => {
  const d = D.createDungeon(9, 9, PX, M.TERRAIN.GRASS);
  const c = D.generateDungeonContents(d, heroAt(900));
  const m = c.mobs[0];
  m.defeated = true;
  const [x, y] = [m.x, m.y];
  for (let i = 0; i < 10; i++) D.wanderStep(c, d);
  assert.equal(m.x, x);
  assert.equal(m.y, y);
});

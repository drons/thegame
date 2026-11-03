// Задача 000303: агрессия мобов подземелий/пещер растёт с разностью
// уровней D = уровень группы − уровень Флогистона (ТЗ —
// tasks/pending/000303.md; контракт — memory/000303-dungeon-aggro.md).
//
// Формулы (FIXED, src/dungeon.js):
//   D = m.level − hero.level
//   aggroDistance(D) = D ≤ 0 ? 0 : min(4, ceil(D/2))
//   aggroChance(D)   = D ≤ 0 ? 0 : min(0.6, 0.1·D)
// Таблица: D ≤ 0 → (0,0); 1 → (1,0.1); 2 → (1,0.2); 3 → (2,0.3);
//   4 → (2,0.4); 5 → (3,0.5); 6 → (3,0.6); 7 → (4,0.6); ≥ 8 → (4,0.6).
//
// Механика (src/dungeon.js wanderStep, src/locations.js, src/main.js):
// на каждый успешный шаг игрока wanderStep(contents, d,
// player {x, y, level}) — для каждой живой группы ПОСЛЕ legacy-ролла
// направления (ТОТ ЖЕ слот, ТОТ ЖЕ значение — слоты НЕ сдвигаются)
// при D > 0 и 1 ≤ Чебышёв ≤ aggroDistance(D) — ОДИН доп. вызов rng():
// значение < aggroChance(D) — шаг по chaseDir (legacy-ролл потреблён,
// значение игнорируется), иначе — legacy-шаг. Группа, вышедшая погоней
// на клетку героя → { contents, landed } → {type:'combat', group}
// (проводка main.js startDungeonCombat — существует). 2-арг, D ≤ 0 и
// D > 0 вне зоны — бит-в-бит legacy. Мобы глобальной карты — НЕ
// затронуты (радиус — по классу, findZoneCombat — без правок).
//
// Тесты:
//   AGG-1 (RED): aggroDistance/aggroChance/константы — экспортированы;
//      D ≤ 0 → (0,0).
//   AGG-2 (RED): aggroDistance — таблица + кап 4 + неубывание (0..30).
//   AGG-3 (RED): aggroChance — таблица + кап 0.6 + неубывание (0..30);
//      P(3) — 1e-9 (FP 0.1·3 = 0.30000000000000004).
//   AGG-4 (зелёный на red-фазе): D ≤ 0 — 3-арг == 2-арг бит-в-бит
//      (30 шагов; D < 0, D = 0).
//   AGG-5 (RED): chase-шаг — роллы из потока wanderStep: реальная
//      3-арг позиция == симуляция потока (deepEqual на каждый из
//      30 шагов). Сид-пробой: seed 1 — chase-роллы g1 (D = 3, P =
//      0.3): шаг 2: 0.081399 (chase [1,0], legacy [−1,0]), 5:
//      0.116965, 7: 0.045733, 11: 0.189949, 14: 0.076055, 20:
//      0.245192, 24: 0.056633, 28: 0.026983 — 8 роллов < 0.3, на 6
//      направление chase ≠ legacy (совпадение = ложно-зелёный).
//   AGG-6 (RED): лендинг на клетку героя → бой (integration через
//      locations.js): герой (2,2), группа (4,2) level 7 (D = 6:
//      P = 0.6, dist 3), шаг на (3,2); seed 2: legacy-ролл
//      0.146884 (потреблён/игнорируется), chase-ролл 0.434612 < 0.6
//      → группа (3,2) = клетка героя → {type:'combat', group}.
//   AGG-7 (зелёный): D > 0 вне зоны — бит-в-бит: группа (1,4) D = 3
//      (aggroDistance(3) = 2) 30 шагов вне зоны (seed 95 — пробой
//      legacy-потока: мин Чебышёв = 3).
//   AGG-8 (зелёный): глобальная карта не затронута: groupZoneInfo/
//      findZoneCombat (src/combat.js, без правок) — радиус по классу,
//      5-й аргумент aggroReduceRadius, сигнатура не выросла.
//   E2E-1 (RED): живой мир (vm-песочница, цепочка index.html):
//      debug-вход в подземелье, ds.contents — группа level 7 (герой
//      L1: D = 6, P = 0.6) на клетке через одну от цели шага
//      (2 клетки от позиции героя), contents.seed = 2 (chase-ролл
//      0.434612 < 0.6 — пробой чистого потока; seed 1 — 0.8683 ≥ 0.6
//      — бой не начался бы — отвергнут) → шаг → бой, мобы в бою
//      level 7. Покрывает 2 проводочные строки main.js.
//
// expectedRedCount (файл) = 6 (AGG-1, AGG-2, AGG-3, AGG-5, AGG-6,
// E2E-1). Красная стадия: ровно эти падают; AGG-4/AGG-7/AGG-8 —
// зелёные.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const D = require('../src/dungeon.js');
const L = require('../src/locations.js');
const C = require('../src/combat.js');
const { hash2, mulberry32 } = require('../src/perlin.js');

const ROOT = path.join(__dirname, '..');
const NOW = 1000;
const CELL = D.CELL_FLOOR;
const WALL = D.CELL_WALL;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// --- Фиксированное подземелье: периметр — стены, внутри пол ---

function fixedDungeon() {
  const W = 9;
  const cells = new Array(W * W).fill(WALL);
  for (let y = 1; y <= 7; y++)
    for (let x = 1; x <= 7; x++) cells[y * W + x] = CELL;
  return {
    type: D.DUNGEON_TYPES.CAVE, width: W, height: W, cells,
    entrance: { x: 4, y: 4 }, exit: { x: 4, y: 4 },
    seed: 999, depth: 1,
  };
}

// Симуляция потока 3-арг wanderStep (ОЖИДАЕМЫЕ позиции AGG-5):
// зеркало контракта — legacy-ролл в том же слоте, chase-ролл после
// (только D > 0 и 1 ≤ Чебышёв ≤ aggroDistance(D)), chaseDir — единица
// по оси с большим |дельтой| (тир — горизонталь), 2-я ось, null —
// остаётся; taken — общий. Формулы встроены (red-фаза: экспортов
// aggroDistance/aggroChance ещё нет).
function simWander(c, d, player) {
  c.step = (c.step || 0) + 1;
  const rng = mulberry32((hash2(c.step, c.seed, 0x7777)) >>> 0);
  const taken = new Set(
    c.mobs.filter((m) => !m.defeated).map((m) => m.x + ',' + m.y));
  const inG = (x, y) => x >= 0 && y >= 0 && x < d.width && y < d.height;
  const free = (nx, ny) => inG(nx, ny)
    && d.cells[ny * d.width + nx] === CELL
    && !taken.has(nx + ',' + ny);
  for (const m of c.mobs) {
    if (m.defeated) continue;
    const [ldx, ldy] = DIRS[Math.floor(rng() * 4)];
    if (player && typeof player.level === 'number') {
      const diff = (m.level || 0) - player.level;
      const cheb = Math.max(Math.abs(m.x - player.x),
        Math.abs(m.y - player.y));
      if (diff > 0 && cheb >= 1
          && cheb <= Math.min(4, Math.ceil(diff / 2))) {
        if (rng() < Math.min(0.6, 0.1 * diff)) {
          const dx = player.x - m.x, dy = player.y - m.y;
          const horiz = Math.abs(dx) >= Math.abs(dy);
          const primary = horiz ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
          const secondary = horiz ? [0, Math.sign(dy)] : [Math.sign(dx), 0];
          let dir = null;
          if ((primary[0] || primary[1])
              && free(m.x + primary[0], m.y + primary[1])) {
            dir = primary;
          } else if ((secondary[0] || secondary[1])
              && free(m.x + secondary[0], m.y + secondary[1])) {
            dir = secondary;
          }
          if (dir) {
            const nx = m.x + dir[0], ny = m.y + dir[1];
            taken.delete(m.x + ',' + m.y);
            m.x = nx; m.y = ny;
            taken.add(nx + ',' + ny);
          }
          continue;
        }
      }
    }
    const nx = m.x + ldx, ny = m.y + ldy;
    if (!inG(nx, ny)) continue;
    if (d.cells[ny * d.width + nx] !== CELL) continue;
    const k = nx + ',' + ny;
    if (taken.has(k)) continue;
    taken.delete(m.x + ',' + m.y);
    m.x = nx; m.y = ny;
    taken.add(k);
  }
  return c;
}

// --- AGG-1: экспорты и D ≤ 0 ---

test('AGG-1: aggroDistance/aggroChance — экспортированы; D ≤ 0 → (0,0); константы 4/0.1/0.6', () => {
  assert.equal(typeof D.aggroDistance, 'function',
    'экспорт D.aggroDistance (src/dungeon.js, 000303)');
  assert.equal(typeof D.aggroChance, 'function',
    'экспорт D.aggroChance (src/dungeon.js, 000303)');
  assert.equal(D.aggroDistance(0), 0, 'aggroDistance(0) = 0');
  assert.equal(D.aggroDistance(-3), 0, 'aggroDistance(−3) = 0');
  assert.equal(D.aggroChance(0), 0, 'aggroChance(0) = 0');
  assert.equal(D.aggroChance(-1), 0, 'aggroChance(−1) = 0');
  assert.equal(D.AGGRO_DIST_MAX, 4, 'AGGRO_DIST_MAX = 4');
  assert.equal(D.AGGRO_CHANCE_PER_LV, 0.1, 'AGGRO_CHANCE_PER_LV = 0.1');
  assert.equal(D.AGGRO_CHANCE_CAP, 0.6, 'AGGRO_CHANCE_CAP = 0.6');
});

// --- AGG-2: дистанция — таблица + кап + неубывание ---

test('AGG-2: aggroDistance — таблица + кап 4 + неубывание (свип 0..30)', () => {
  const T = [[1, 1], [2, 1], [3, 2], [4, 2], [5, 3], [6, 3],
    [7, 4], [8, 4], [10, 4], [50, 4]];
  for (const [dl, want] of T) {
    assert.equal(D.aggroDistance(dl), want,
      'aggroDistance(' + dl + ') = ' + want);
  }
  let prev = 0;
  for (let dl = 0; dl <= 30; dl++) {
    const v = D.aggroDistance(dl);
    assert.ok(v >= prev, 'неубывание: D = ' + dl + ' (' + v + ' < ' + prev + ')');
    assert.ok(v <= 4, 'кап 4: D = ' + dl + ' (' + v + ')');
    prev = v;
  }
});

// --- AGG-3: вероятность — таблица + кап + неубывание ---

test('AGG-3: aggroChance — таблица + кап 0.6 + неубывание (свип 0..30)', () => {
  const T = [[1, 0.1], [2, 0.2], [4, 0.4], [5, 0.5],
    [6, 0.6], [10, 0.6], [20, 0.6]];
  for (const [dl, want] of T) {
    assert.equal(D.aggroChance(dl), want,
      'aggroChance(' + dl + ') = ' + want);
  }
  assert.ok(Math.abs(D.aggroChance(3) - 0.3) < 1e-9,
    'aggroChance(3) = 0.3 (FP: 0.1·3 = 0.30000000000000004 — 1e-9): '
    + D.aggroChance(3));
  let prev = 0;
  for (let dl = 0; dl <= 30; dl++) {
    const v = D.aggroChance(dl);
    assert.ok(v >= 0 && v <= 0.6, '0 ≤ P ≤ 0.6: D = ' + dl + ' (' + v + ')');
    assert.ok(v >= prev, 'неубывание: D = ' + dl + ' (' + v + ' < ' + prev + ')');
    prev = v;
  }
});

// --- AGG-4 (зелёный на red-фазе): D ≤ 0 — бит-в-бит ---

test('AGG-4: 0-diff — D ≤ 0: 3-арг == 2-арг бит-в-бит (30 шагов)', () => {
  const d = fixedDungeon();
  const mk = () => ({
    seed: 42, step: 0,
    mobs: [
      { id: 'a', x: 3, y: 3, level: 3, defeated: false },
      { id: 'b', x: 5, y: 3, level: 1, defeated: false },
      { id: 'c', x: 3, y: 5, level: 4, defeated: false },
    ],
    chests: [],
  });
  const a = mk(), b = mk();
  const player = { x: 4, y: 4, level: 4 };
  for (let i = 1; i <= 30; i++) {
    D.wanderStep(a, d);
    D.wanderStep(b, d, player);
    assert.deepEqual(
      a.mobs.map((m) => [m.x, m.y]), b.mobs.map((m) => [m.x, m.y]),
      'шаг ' + i + ': D ≤ 0 — 3-арг == legacy бит-в-бит');
  }
});

// --- AGG-5: chase — роллы из потока wanderStep ---

test('AGG-5: chase-шаг — реальная 3-арг == симуляция потока (30 шагов, seed 1, g1 D=3 в зоне, g2 D=3 вне зоны)', () => {
  const d = fixedDungeon();
  const mk = () => ({
    seed: 1, step: 0,
    mobs: [
      { id: 'g1', x: 3, y: 4, level: 4, defeated: false },
      { id: 'g2', x: 1, y: 4, level: 4, defeated: false },
    ],
    chests: [],
  });
  const a = mk(), b = mk();
  const player = { x: 4, y: 4, level: 1 };
  for (let i = 1; i <= 30; i++) {
    D.wanderStep(a, d, player);
    simWander(b, d, player);
    assert.deepEqual(
      a.mobs.map((m) => [m.x, m.y]), b.mobs.map((m) => [m.x, m.y]),
      'шаг ' + i + ': реальная 3-арг == симуляция потока (слоты: '
      + 'legacy-ролл не сдвигается, chase-ролл после)');
  }
});

// --- AGG-6: лендинг на клетку героя → бой (locations.js) ---

function withGame(fake, fn) {
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

// Game-фейк (паттерн tests/locations.test.js makeFakeGame) —
// ЕДИНСТВЕННОЕ отличие: стаб wanderStep = прямое 3-арг ядро
// (без log-обёртки — 3-арг ретёрн {contents, landed} доходит до
// dungeonPostMove как в игре).
function make3argGame() {
  return {
    createMover(opts) {
      const p = { x: opts.x, y: opts.y };
      return {
        intervalMs: opts.intervalMs,
        teleport(x, y) { p.x = x; p.y = y; },
        step(prev, next) { p.x = next.x; p.y = next.y; },
        position() { return { x: p.x, y: p.y }; },
      };
    },
    DUNGEON_NAMES: D.DUNGEON_NAMES,
    CELL_FLOOR: D.CELL_FLOOR,
    CELL_WALL: D.CELL_WALL,
    openChest: (c, id) => D.openChest(c, id),
    wanderStep: (c, d, p) => D.wanderStep(c, d, p),
  };
}

// 7×7: периметр — стены, внутри (1..5)×(1..5) — пол; вход (2,2).
function makeDungeon7() {
  const W = 7;
  const cells = new Array(W * W).fill(WALL);
  for (let y = 1; y <= 5; y++)
    for (let x = 1; x <= 5; x++) cells[y * W + x] = CELL;
  return {
    type: D.DUNGEON_TYPES.CAVE, width: W, height: W, cells,
    entrance: { x: 2, y: 2 }, exit: { x: 2, y: 2 },
    seed: 777, depth: 1,
  };
}

test('AGG-6: лендинг погони на клетку героя → {type:\'combat\', group} (locations.js, seed 2, chase-ролл 0.434612 < 0.6)', () => {
  withGame(make3argGame(), () => {
    const g = { id: 'g0', mobIds: ['skeleton'], x: 4, y: 2,
      level: 7, defeated: false };
    const contents = { seed: 2, mobs: [g], chests: [],
      createdAtXp: 0, step: 0 };
    const ds = L.makeDungeonState(makeDungeon7(), contents, 'aggro-6',
      { intervalMs: 420 });
    assert.equal(ds.x, 2, 'герой на (2,2)');
    assert.equal(ds.y, 2, 'герой на (2,2)');
    assert.equal(g.x, 4, 'pre-move: группа (4,2) — НЕ на клетке цели шага');
    const ev = L.dungeonMove(ds, 1, 0, NOW, { inCombat: false, level: 1 });
    assert.equal(ds.x, 3, 'шаг на (3,2) прошёл');
    assert.equal(ds.y, 2, 'шаг на (3,2) прошёл');
    assert.equal(ev.type, 'combat',
      'бой: группа догнала (post-move лендинг на клетку героя)');
    assert.equal(ev.group, g, 'group — та же группа, что в contents');
    assert.equal(g.x, 3, 'группа (3,2) — клетка героя');
    assert.equal(g.y, 2, 'группа (3,2) — клетка героя');
  });
});

// --- AGG-7 (зелёный): D > 0 вне зоны — бит-в-бит ---

test('AGG-7: D > 0 вне зоны — 3-арг == 2-арг бит-в-бит (30 шагов, seed 95, мин Чебышёв 3 > aggroDistance(3) = 2)', () => {
  const d = fixedDungeon();
  const mk = () => ({
    seed: 95, step: 0,
    mobs: [{ id: 'g1', x: 1, y: 4, level: 4, defeated: false }],
    chests: [],
  });
  const a = mk(), b = mk();
  const player = { x: 4, y: 4, level: 1 };
  for (let i = 1; i <= 30; i++) {
    D.wanderStep(a, d);
    D.wanderStep(b, d, player);
    assert.deepEqual(
      a.mobs.map((m) => [m.x, m.y]), b.mobs.map((m) => [m.x, m.y]),
      'шаг ' + i + ': вне зоны (Чебышёв > aggroDistance) — бит-в-бит');
  }
});

// --- AGG-8 (зелёный): глобальная карта — не затронута ---

function tile(x, y, mobGroup) {
  return { x, y, passable: true, terrain: 3,
    hasMobGroup: mobGroup != null, mobGroup };
}

test('AGG-8: глобальная карта не затронута — groupZoneInfo/findZoneCombat без правок (радиус по классу, 5-й аргумент, сигнатура не выросла)', () => {
  assert.equal(typeof C.groupZoneInfo, 'function', 'экспорт groupZoneInfo');
  assert.equal(typeof C.findZoneCombat, 'function', 'экспорт findZoneCombat');
  assert.equal(C.findZoneCombat.length, 5,
    'сигнатура findZoneCombat — 5 формальных параметров '
    + '(aggroReduceRadius 000235.08 — без НОВЫХ)');
  // Агрессивная группа (orc_camp, mobs[0] = orc_warrior): радиус 2.
  assert.deepEqual(C.groupZoneInfo(0), { radius: 2, triggers: true },
    'orc_camp — 5×5 + триггер');
  // dist 2 → бой (в зоне 5×5).
  assert.deepEqual(
    C.findZoneCombat(5, 5, [tile(7, 5, 0)], null),
    { x: 7, y: 5, mobGroup: 0 }, 'aggressive dist 2 → бой');
  // dist 3 → null (вне зоны).
  assert.equal(C.findZoneCombat(5, 5, [tile(8, 5, 0)], null), null,
    'aggressive dist 3 → null');
  // Нейтральная (wolf_pack, mobs[0] = wolf): триггера нет.
  assert.deepEqual(C.groupZoneInfo(3), { radius: 1, triggers: false },
    'wolf_pack — 3×3 без триггера');
  assert.equal(C.findZoneCombat(5, 5, [tile(6, 5, 3)], null), null,
    'neutral dist 1 → null (радиус триггера 0)');
  // 5-й аргумент aggroReduceRadius = 2: dist 2 → eff = max(1, 2−1) = 1
  // → НЕ триггерит (000235.08 — без правок).
  assert.equal(C.findZoneCombat(5, 5, [tile(7, 5, 0)], null, 2), null,
    'aggroReduceRadius 2: dist 2 не триггерит (eff = 1)');
  // dist 0 (свой тайл) — бой для ЛЮБОГО класса — без изменений.
  assert.deepEqual(C.findZoneCombat(7, 5, [tile(7, 5, 3)], null),
    { x: 7, y: 5, mobGroup: 3 }, 'dist 0 → бой (любой класс)');
});

// =====================================================================
// E2E-1: живой мир (vm-песочница, цепочка index.html)
// Harness — дубль конвенции (000083/000087/000214): полный makeEl +
// WebGL-стаб + bootSandbox (tests/dungeon-city-time-e2e.test.js);
// замена ds.contents — паттерн tests/dungeon-loot-e2e.test.js.
// =====================================================================

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(
  html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));

function makeGl() {
  const noop = () => {};
  const gl = {
    VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713, LINK_STATUS: 35714,
    ARRAY_BUFFER: 34962, DYNAMIC_DRAW: 35048, FLOAT: 5126,
    COLOR_BUFFER_BIT: 1024, TRIANGLES: 4,
  };
  gl.createShader = () => ({});
  gl.shaderSource = noop;
  gl.compileShader = noop;
  gl.getShaderParameter = () => true;
  gl.getShaderInfoLog = () => '';
  gl.createProgram = () => ({});
  gl.attachShader = noop;
  gl.linkProgram = noop;
  gl.getProgramParameter = () => true;
  gl.getProgramInfoLog = () => '';
  gl.useProgram = noop;
  let attrib = 0;
  gl.getAttribLocation = () => attrib++;
  gl.getUniformLocation = () => ({});
  gl.enableVertexAttribArray = noop;
  gl.createBuffer = () => ({});
  gl.bindBuffer = noop;
  gl.bufferData = noop;
  gl.vertexAttribPointer = noop;
  gl.viewport = noop;
  gl.clearColor = noop;
  gl.clear = noop;
  gl.uniformMatrix4fv = noop;
  gl.drawArrays = noop;
  return gl;
}

function makeContext2d(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

function matchesSel(el, sel) {
  let rest = String(sel).trim();
  let tag = null;
  let cls = null;
  let attr = null;
  const bm = rest.match(/\[([^\]=]+)(?:="([^"]*)")?\]$/);
  if (bm) {
    attr = [bm[1], bm[2]];
    rest = rest.slice(0, bm.index);
  }
  const cm = rest.match(/\.([A-Za-z0-9_-]+)$/);
  if (cm) {
    cls = cm[1];
    rest = rest.slice(0, cm.index);
  }
  if (rest) tag = rest;
  if (tag && String(el.tagName || '').toLowerCase() !== tag.toLowerCase()) {
    return false;
  }
  if (cls &&
      !String(el.className || '').split(/\s+/).includes(cls)) {
    return false;
  }
  if (attr) {
    if (!attr[0].startsWith('data-')) return false;
    const v = el.dataset ? el.dataset[attr[0].slice(5)] : undefined;
    if (attr[1] !== undefined && v !== attr[1]) return false;
  }
  return true;
}

function findAll(root, sel) {
  const out = [];
  const walk = (n) => {
    for (const ch of n.children || []) {
      if (matchesSel(ch, sel)) out.push(ch);
      walk(ch);
    }
  };
  walk(root);
  return out;
}

function makeEl(tag) {
  const target = {
    tagName: tag,
    className: '',
    _text: '',
    title: '',
    disabled: false,
    style: {},
    dataset: {},
    children: [],
    parent: null,
    listeners: {},
    appendChild(ch) {
      const raw = ch && ch.__raw ? ch.__raw : ch;
      if (raw.parent) {
        raw.parent.children.splice(raw.parent.children.indexOf(raw), 1);
      }
      raw.parent = target;
      target.children.push(raw);
      return ch;
    },
    remove() {
      if (!target.parent) return;
      const i = target.parent.children.indexOf(target);
      if (i >= 0) target.parent.children.splice(i, 1);
      target.parent = null;
    },
    addEventListener(type, fn) {
      (target.listeners[type] || (target.listeners[type] = [])).push(fn);
    },
    removeEventListener(type, fn) {
      const a = target.listeners[type];
      if (!a) return;
      const i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    },
    setAttribute(name, value) {
      if (name.startsWith('data-')) {
        target.dataset[name.slice(5)] = value;
      }
    },
    getContext(kind) {
      if (tag !== 'canvas') return null;
      return kind === 'webgl' ? makeGl() : makeContext2d(target);
    },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    blur() {},
    closest(sel) {
      let n = target;
      while (n) {
        if (matchesSel(n, sel)) return n;
        n = n.parent;
      }
      return null;
    },
    querySelector(sel) { return findAll(target, sel)[0] || null; },
    querySelectorAll(sel) { return findAll(target, sel); },
  };
  Object.defineProperty(target, 'textContent', {
    get() { return this._text; },
    set(v) {
      this._text = String(v);
      for (const ch of target.children) ch.parent = null;
      target.children.length = 0;
    },
  });
  target.__raw = target;
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return () => undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

function bootSandbox() {
  const winListeners = {};
  const raf = [];
  const errors = [];
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl() : makeContext2d(gameCanvas));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? makeContext2d(spriteCanvas) : null);
  const storage = makeStorage();
  const body = makeEl('body');
  const document = {
    createElement: (tag) => makeEl(tag),
    getElementById: (id) => (
      id === 'game' ? gameCanvas
        : id === 'sprites' ? spriteCanvas
          : id === 'hud' ? hud
            : null),
    body,
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    hidden: false,
  };
  const window = {
    innerWidth: 1280,
    innerHeight: 720,
    location: { search: '' },
    localStorage: storage,
    confirm: () => false,
    addEventListener: (t, f) => {
      const a = winListeners[t] || (winListeners[t] = []);
      if (!a.includes(f)) a.push(f);
    },
    removeEventListener: (t, f) => {
      const a = winListeners[t];
      if (!a) return;
      const i = a.indexOf(f);
      if (i >= 0) a.splice(i, 1);
    },
  };
  function Image() {
    const self = this;
    self.naturalWidth = 0;
    self.naturalHeight = 0;
    Object.defineProperty(self, 'src', {
      configurable: true,
      get() { return self.__src; },
      set(v) {
        self.__src = v;
        Promise.resolve().then(() => {
          if (v === 'assets/map.png') {
            if (typeof self.onerror === 'function') self.onerror();
          } else if (typeof self.onload === 'function') {
            self.onload();
          }
        });
      },
    });
  }
  const sandbox = {
    console: {
      warn: () => {},
      error: (m) => errors.push(String(m)),
      log: () => {},
    },
    document,
    window,
    Image,
    performance: { now: () => NOW },
    requestAnimationFrame: (fn) => { raf.push(fn); return raf.length; },
    setTimeout: () => 0,
    clearTimeout: () => {},
  };
  vm.createContext(sandbox);
  for (const f of CHAIN) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox,
      { filename: f });
  }
  return { sandbox, winListeners, raf, errors, body, storage, hud };
}

const drain = () => new Promise((r) => setImmediate(r));

async function boot() {
  const h = bootSandbox();
  await drain();
  await drain();
  await drain();
  const g = h.sandbox.__game;
  assert.ok(g, 'globalThis.__game выставлен (main.js выполнен)');
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет (порядок цепочки): ' + h.errors.join('; '));
  h.frameFn = h.raf[h.raf.length - 1];
  return h;
}

function press(h, code) {
  const e = { code, key: code, preventDefault() {}, stopPropagation() {} };
  for (const fn of (h.winListeners['keydown'] || []).slice()) fn(e);
  return e;
}

function keydownFor(dx, dy) {
  return dx === 1 ? 'ArrowRight' : dx === -1 ? 'ArrowLeft'
    : dy === 1 ? 'ArrowDown' : 'ArrowUp';
}

test('E2E-1: живой мир — погоня в подземелье: группа L7 (D=6) на клетке через одну от цели шага → шаг → бой (2 проводочные строки main.js; contents.seed 2 — chase-ролл 0.434612 < 0.6)', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon — состояние подземелья (отладочный вход)');
  assert.equal(g.state.hero.level, 1, 'свежий герой: level 1 (D = 7 − 1 = 6)');
  const d = ds.dg;
  const ex = d.entrance.x, ey = d.entrance.y;
  // Геометрия: направление, где и клетка шага A = E+d, и клетка
  // группы B = E+2d (через одну от A) — FLOOR.
  let geo = null;
  for (const [dx, dy] of DIRS) {
    const ax = ex + dx, ay = ey + dy;
    const bx = ex + 2 * dx, by = ey + 2 * dy;
    if (ax < 0 || ay < 0 || ax >= d.width || ay >= d.height) continue;
    if (bx < 0 || by < 0 || bx >= d.width || by >= d.height) continue;
    if (d.cells[ay * d.width + ax] !== G.CELL_FLOOR) continue;
    if (d.cells[by * d.width + bx] !== G.CELL_FLOOR) continue;
    geo = { dx, dy, A: { x: ax, y: ay }, B: { x: bx, y: by } };
    break;
  }
  assert.ok(geo, 'геометрия: 2 FLOOR-клетки подряд от входа (подземелье связное)');
  ds.contents = {
    mobs: [{ id: 'g0', mobIds: ['skeleton'], x: geo.B.x, y: geo.B.y,
      level: 7, defeated: false }],
    chests: [],
    seed: 2, step: 0,
  };
  assert.equal(G.combatUI.isActive(), false, 'pre-move: боя нет');
  press(h, keydownFor(geo.dx, geo.dy));
  assert.equal(g.dungeon.x, geo.A.x, 'шаг на A прошёл (x)');
  assert.equal(g.dungeon.y, geo.A.y, 'шаг на A прошёл (y)');
  assert.equal(G.combatUI.isActive(), true,
    'RED: chase-лендинг на клетку героя → бой (startDungeonCombat)');
  const c = G.combatUI.current();
  assert.ok(c, 'объект боя доступен');
  const mobs = c.units.filter((u) => u.side === 'mob');
  assert.ok(mobs.length >= 1, 'мобы группы в бою');
  for (const u of mobs) {
    assert.equal(u.level, 7, 'уровень моба в бою = уровень группы (mobLevel)');
  }
});

// Задача 000330: боссы подземелий/пещер — 3×3 тайла (ТЗ —
// tasks/pending/000330.md; контракт — memory/000330-boss-3x3.md).
//
// Цели ТЗ:
//   * босс занимает 3×3 тайла (видовое отличие от обычных мобов);
//   * 3×3-моб НЕ заходит в проход шириной < 3 — коллизии по ВСЕМ 9
//     клеткам footprint (центр + 8 соседей), не по центральной клетке;
//   * расстановка — ТОЛЬКО в область со свободным 3×3 (fail-closed:
//     нет свободного 3×3 — босс НЕ ставится, тихо, 0 бросков);
//   * legacy 1×1/2×2 (мобы карт — карта-клетка всегда 1) — расстановка
//     и движение БИТ-В-БИТ (0 новых вызовов rng в легаси-путях).
//
// Размер босса ВЫВОДИТСЯ из флага m.boss (BOSS_SIZE в src/dungeon.js —
// dungeon.js НЕ требует combat.js; 1:1 с MOB_TYPES.*.size {w:3,h:3} —
// структурный пин B-SIZE). Якорь босса = центральная клетка (legacy-
// сейвы валидны: size не сериализуется, save v1 0-diff).
//
// Тесты (expectedRedCount (файл) = 6):
//   B-PLACE-1 (RED): дальняя комната 3×2 — свободного 3×3 НЕТ → босс
//      НЕ ставится (legacy: ставится всегда — краснота).
//   B-PLACE-2 (RED): дальняя комната 3×3 — босс в центре (9,9),
//      boss:true, mobIds/level по контракту; НЕТ ни одного не-босс
//      моба/сундука на ЛЮБОЙ из 9 клеток footprint (totalXp 1 —
//      сид-пробой legacy: mob@10,10, mob@9,10, chest@8,9 — legacy
//      исключает из occupied только ЦЕНТР — краснота).
//   B-CAVE-GOLDEN (зелёный на red-фазе): CAVE на той же форме —
//      полное deepEqual mobs/chests (legacy-бит-в-бит; guard по типу
//      d.type === ABYSS — не-ABYSS не сдвигается) + босса нет.
//   B-MOVE-1 (RED): комната 5×5 + коридор шириной 2; босс (4,4);
//      seed 2, 50 шагов wanderStep: КАЖДЫЙ шаг — якорь в [3,5]×[3,5]
//      И все 9 клеток footprint — FLOOR. Legacy (только центр): шаг 2
//      → якорь (6,4), footprint упирается в стену (7,5) — краснота.
//   B-SIZE (RED): D.BOSS_SIZE = {w:3,h:3}; D.mobFootprint: не-босс —
//      ровно [x,y], босс — 9 клеток вокруг центра; 1:1 с size
//      MOB_TYPES.bone_coloss/abomination (combat.js).
//   B-REG-1 (зелёный на red-фазе): мобы 1×1 (вкл. cave_bear — 2×2 в
//      бою, на карте — 1 клетка): 3-арг wanderStep == зеркало
//      simWander бит-в-бит 30 шагов, D ≤ 0 (RNG-гварда: слоты
//      вызовов не сдвинулись — паттерн 000267/000283.01/000303).
//   B-REND-1 (RED): vm-рендер (sprites): босс (3,3) в 7×7 — ровно
//      ОДИН #b06ad4 fillRect = ТОЧНО 3×3 (угол (2,2), 3×zoom) под
//      3 спрайтами юнитов на РАЗНЫХ клетках footprint (2,3), (3,4),
//      (4,3); обычная группа — смещения MOB_UNIT_OFF как были;
//      без босса #b06ad4 нет.
//   B-REND-2 (RED): vm-рендер БЕЗ sprites.js: босс — один #b06ad4
//      прямоугольник 3×3 (угол (2,2), 3×zoom), не «квадрат клетки»;
//      обычная группа — legacy-квадрат +3/+3 zoom−6 #d9483b (без
//      изменений).
//
// Фикстюрные формы — ручные сетки (ядро createDungeon покрыто
// tests/dungeon.test.js): 12×12 (расстановка) и 15×9 (движение).
// generateDungeonContents(wanderStep/render) — прямые вызовы на
// ручных формах: вход/безопасные зоны/коридоры — конструкторские
// факты, rng-потоки — сиды из ТЗ-пробоя.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const D = require('../src/dungeon.js');
const C = require('../src/combat.js');
const { hash2, mulberry32 } = require('../src/perlin.js');

const CELL = D.CELL_FLOOR;
const WALL = D.CELL_WALL;
const ABYSS = D.DUNGEON_TYPES.ABYSS;
const CAVE = D.DUNGEON_TYPES.CAVE;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');

// --- Фикстура 12×12: комната входа 3×3 (1..3)², коридор (2, y4..7),
// комната середины 3×3 (1..3, y8..10), коридор (x4..7, y9), дальняя
// комната — параметр (3×2 или 3×3, центр (9,9)). ---

function grid12() {
  const W = 12;
  const c = new Array(W * W).fill(WALL);
  const floor = (x, y) => { c[y * W + x] = CELL; };
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) floor(x, y);
  for (let y = 4; y <= 7; y++) floor(2, y);
  for (let y = 8; y <= 10; y++) for (let x = 1; x <= 3; x++) floor(x, y);
  for (let x = 4; x <= 7; x++) floor(x, 9);
  return c;
}

function shape12(type, farRoom) {
  const cells = grid12();
  const W = 12;
  const floor = (x, y) => { cells[y * W + x] = CELL; };
  for (let y = farRoom.y; y < farRoom.y + farRoom.h; y++)
    for (let x = farRoom.x; x < farRoom.x + farRoom.w; x++) floor(x, y);
  return {
    type, width: W, height: W, cells,
    rooms: [
      { x: 1, y: 1, w: 3, h: 3, cx: 2, cy: 2 },
      { x: 1, y: 8, w: 3, h: 3, cx: 2, cy: 9 },
      { x: farRoom.x, y: farRoom.y, w: farRoom.w, h: farRoom.h,
        cx: farRoom.x + (farRoom.w >> 1), cy: farRoom.y + (farRoom.h >> 1) },
    ],
    entrance: { x: 2, y: 2 }, exit: { x: 2, y: 2 },
    seed: 12345, depth: 1,
  };
}

const FAR_32 = { x: 8, y: 8, w: 3, h: 2 };
const FAR_33 = { x: 8, y: 8, w: 3, h: 3 };
const PLAYER_100 = { totalXp: 100, level: 5 };

function cellsOf(entity) { return [entity.x, entity.y]; }

// --- B-PLACE-1: 3×2 — босс НЕ ставится ---

test('B-PLACE-1: дальняя комната 3×2 (свободного 3×3 нет) — босс НЕ ставится (fail-closed)', () => {
  const d = shape12(ABYSS, FAR_32);
  const c = D.generateDungeonContents(d, PLAYER_100);
  const bosses = c.mobs.filter((m) => m.boss);
  assert.equal(bosses.length, 0,
    '3×2-комната: footprint 3×3 вокруг (9,9) упирается в стену '
    + '(строка y=10) — босс НЕ ставится (найдено: ' + bosses.length + ')');
  for (const m of c.mobs) {
    assert.equal(d.cells[m.y * d.width + m.x], CELL,
      'моб ' + m.id + ' на FLOOR');
  }
  for (const ch of c.chests) {
    assert.equal(d.cells[ch.y * d.width + ch.x], CELL,
      'сундук ' + ch.id + ' на FLOOR');
  }
});

// --- B-PLACE-2: 3×3 — босс в центре + 9 клеток footprint свободны ---

test('B-PLACE-2: дальняя комната 3×3 — босс в центре (9,9); НЕТ не-босс мобов/сундуков на 9 клетках footprint (totalXp 1 — сид-пробой: legacy mob@10,10, mob@9,10, chest@8,9)', () => {
  const d = shape12(ABYSS, FAR_33);
  const c = D.generateDungeonContents(d, { totalXp: 1, level: 5 });
  const bosses = c.mobs.filter((m) => m.boss);
  assert.equal(bosses.length, 1, 'ровно ОДИН босс');
  const b = bosses[0];
  assert.deepEqual(cellsOf(b), [9, 9], 'якорь босса — центр дальней комнаты');
  assert.deepEqual(b.mobIds,
    ['abomination', 'lower_demon', 'lower_demon'], 'состав группы босса');
  assert.equal(b.id, 'boss', 'id группы босса');
  assert.equal(b.level, 8, 'уровень босса = level 5 + delta 3 (effLevel+δ)');
  assert.equal(b.defeated, false, 'босс жив');
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const fx = 9 + dx, fy = 9 + dy;
      const m = c.mobs.find((mm) => !mm.boss
        && mm.x === fx && mm.y === fy);
      assert.equal(m, undefined,
        'не-босс моб НЕ на клетке footprint (' + fx + ',' + fy + ')');
      const ch = c.chests.find((cc) => cc.x === fx && cc.y === fy);
      assert.equal(ch, undefined,
        'сундук НЕ на клетке footprint (' + fx + ',' + fy + ')');
    }
  }
});

// --- B-CAVE-GOLDEN (зелёный): не-ABYSS — бит-в-бит ---

test('B-CAVE-GOLDEN: CAVE на той же форме — контент БИТ-В-БИТ (guard d.type === ABYSS), босса нет', () => {
  const d = shape12(CAVE, FAR_33);
  const c = D.generateDungeonContents(d, PLAYER_100);
  assert.equal(c.mobs.some((m) => m.boss), false, 'CAVE — босса нет');
  assert.deepEqual(c.mobs, [
    { id: 'g0', mobIds: ['skeleton'], x: 6, y: 9, level: 7, defeated: false },
    { id: 'g1', mobIds: ['ant', 'ant'], x: 2, y: 5, level: 2, defeated: false },
    { id: 'g2', mobIds: ['giant_larva', 'ant'], x: 3, y: 9, level: 3, defeated: false },
  ], 'CAVE mobs — бит-в-бит legacy-поток');
  assert.deepEqual(c.chests, [
    { id: 'c0', x: 2, y: 7, opened: false, gold: 30, item: 'frost_bolt_scroll' },
    { id: 'c1', x: 9, y: 9, opened: false, gold: 35, item: null },
  ], 'CAVE chests — бит-в-бит legacy-поток (вкл. (9,9) — исключение босса не действует)');
});

// --- Фикстура 15×9 (движение): комната 5×5 (2..6)², коридор шириной
// 2 (x7..11, y3..4), правая комната (x12..13, y2..6). ---

function moveShape() {
  const W = 15, H = 9;
  const c = new Array(W * H).fill(WALL);
  const floor = (x, y) => { c[y * W + x] = CELL; };
  for (let y = 2; y <= 6; y++) for (let x = 2; x <= 6; x++) floor(x, y);
  for (let x = 7; x <= 11; x++) { floor(x, 3); floor(x, 4); }
  for (let y = 2; y <= 6; y++) for (let x = 12; x <= 13; x++) floor(x, y);
  return {
    type: ABYSS, width: W, height: H, cells: c,
    rooms: [{ x: 2, y: 2, w: 5, h: 5, cx: 4, cy: 4 }],
    entrance: { x: 2, y: 2 }, exit: { x: 2, y: 2 },
    seed: 777, depth: 1,
  };
}

// --- B-MOVE-1: 3×3-моб не заходит в коридор шириной 2 ---

test('B-MOVE-1: 3×3-моб НЕ заходит в проход шириной < 3 (seed 2, 50 шагов: legacy выходит на (6,4) на шаге 2)', () => {
  const d = moveShape();
  const contents = {
    seed: 2, step: 0, chests: [],
    mobs: [{
      id: 'boss', mobIds: ['abomination', 'lower_demon', 'lower_demon'],
      x: 4, y: 4, level: 8, defeated: false, boss: true,
    }],
  };
  for (let i = 1; i <= 50; i++) {
    D.wanderStep(contents, d);
    const m = contents.mobs[0];
    assert.ok(m.x >= 3 && m.x <= 5 && m.y >= 3 && m.y <= 5,
      'шаг ' + i + ': якорь (' + m.x + ',' + m.y + ') в комнате 5×5 '
      + '(footprint 3×3 целиком в комнате; коридор шириной 2 НЕ entered)');
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const fx = m.x + dx, fy = m.y + dy;
        assert.equal(d.cells[fy * d.width + fx], CELL,
          'шаг ' + i + ': клетка footprint (' + fx + ',' + fy + ') — FLOOR');
      }
    }
  }
  assert.equal(contents.step, 50, 'шагов пройдено: 50');
});

// --- B-SIZE: BOSS_SIZE 3×3 + mobFootprint + 1:1 с combat.js ---

test('B-SIZE: BOSS_SIZE = {w:3,h:3}; mobFootprint (не-босс [x,y], босс 9 клеток); 1:1 с MOB_TYPES.*.size (bone_coloss, abomination)', () => {
  assert.deepEqual(D.BOSS_SIZE, { w: 3, h: 3 },
    'BOSS_SIZE — 3×3 (видовое отличие босса, src/dungeon.js)');
  assert.equal(typeof D.mobFootprint, 'function',
    'экспорт D.mobFootprint (src/dungeon.js, 000330)');
  const plain = D.mobFootprint({ x: 5, y: 7, boss: false });
  assert.deepEqual(plain, ['5,7'],
    'не-босс — footprint ровно ОДНА клетка (legacy-бит-в-бит)');
  const noFlag = D.mobFootprint({ x: 5, y: 7 });
  assert.deepEqual(noFlag, ['5,7'],
    'отсутствующий флаг boss — та же одна клетка');
  const boss = D.mobFootprint({ x: 5, y: 7, boss: true });
  assert.equal(boss.length, 9, 'босс — footprint 9 клеток');
  assert.ok(boss.includes('5,7'), 'центр в footprint');
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1],
    [-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    assert.ok(boss.includes((5 + dx) + ',' + (7 + dy)),
      'сосед (' + (5 + dx) + ',' + (7 + dy) + ') в footprint');
  }
  assert.deepEqual(new Set(boss).size, 9, '9 РАЗНЫХ клеток');
  assert.deepEqual(C.MOB_TYPES.bone_coloss.size, D.BOSS_SIZE,
    'BOSS_SIZE 1:1 с combat size bone_coloss {w:3,h:3}');
  assert.deepEqual(C.MOB_TYPES.abomination.size, D.BOSS_SIZE,
    'BOSS_SIZE 1:1 с combat size abomination {w:3,h:3}');
});

// --- B-REG-1 (зелёный): 1×1 — бит-в-бит + RNG-гварда ---

// Зеркало контракта 1×1 wanderStep (паттерн simWander 000303):
// legacy-ролл направления, слоты вызовов rng — ТОЧНО как в ядре;
// footprint 1×1 = одна клетка — taken/проверки сворачиваются к
// legacy-одноклеточным. D ≤ 0 — aggro-ветки нет (0 доп. роллов).
function simWander1x1(c, d, player) {
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

test('B-REG-1: мобы 1×1 (вкл. cave_bear — 2×2 в бою, 1 клетка на карте) — 3-арг == зеркало бит-в-бит, 30 шагов, D ≤ 0 (RNG-гварда)', () => {
  const W = 9;
  const cells = new Array(W * W).fill(WALL);
  for (let y = 1; y <= 7; y++) for (let x = 1; x <= 7; x++) {
    cells[y * W + x] = CELL;
  }
  const d = {
    type: CAVE, width: W, height: W, cells,
    entrance: { x: 4, y: 4 }, exit: { x: 4, y: 4 },
    seed: 999, depth: 1,
  };
  const mk = () => ({
    seed: 42, step: 0,
    mobs: [
      { id: 'a', mobIds: ['skeleton'], x: 3, y: 3, level: 3, defeated: false },
      { id: 'b', mobIds: ['cave_bear'], x: 5, y: 5, level: 2, defeated: false },
      { id: 'c', mobIds: ['ant'], x: 3, y: 5, level: 4, defeated: false },
    ],
    chests: [],
  });
  const a = mk(), b = mk();
  const player = { x: 4, y: 4, level: 4 }; // D ≤ 0 для всех групп
  for (let i = 1; i <= 30; i++) {
    D.wanderStep(a, d, player);
    simWander1x1(b, d, player);
    assert.deepEqual(
      a.mobs.map((m) => [m.x, m.y]), b.mobs.map((m) => [m.x, m.y]),
      'шаг ' + i + ': 1×1-мобы — бит-в-бит legacy (слоты rng не сдвинуты)');
  }
});

// --- vm-песочница рендера (дубль харнесса tests/dungeon-ui.test.js) ---

function makeContext2d(el) {
  const calls = el.drawCalls = [];
  let fillStyle = null;
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => {
      calls.push([k, args, fillStyle]);
    }),
    set: (t, k, v) => {
      if (k === 'fillStyle') fillStyle = v;
      t[k] = v;
      return true;
    },
  });
}

function makeEl(tag, buttons) {
  const el = {
    tagName: tag,
    className: '',
    textContent: '',
    title: '',
    disabled: false,
    style: {},
    dataset: {},
    children: [],
    listeners: {},
    appendChild(ch) { this.children.push(ch); return ch; },
    remove() {},
    addEventListener(type, fn) {
      (this.listeners[type] || (this.listeners[type] = [])).push([fn]);
    },
    querySelectorAll() { return buttons; },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
  };
  if (tag === 'canvas') {
    el.width = 0;
    el.height = 0;
    el.getContext = () => makeContext2d(el);
  }
  return el;
}

function findCanvas(el) {
  if (el.tagName === 'canvas') return el;
  for (const ch of el.children || []) {
    const found = findCanvas(ch);
    if (found) return found;
  }
  return null;
}

function loadDungeonUiSandbox(opts = {}) {
  const errors = [];
  const buttons = [];
  const document = {
    createElement: (tag) => {
      const el = makeEl(tag, buttons);
      if (tag === 'button') buttons.push(el);
      return el;
    },
    body: makeEl('body', buttons),
  };
  const window = { innerWidth: 800, innerHeight: 600, addEventListener() {} };
  const sandbox = {
    console: { error: (m) => errors.push(String(m)) },
    document, window,
  };
  if (opts.performance) sandbox.performance = opts.performance;
  vm.createContext(sandbox);
  const chain = ['global-settings.js', 'perlin.js', 'map.js',
    'controls.js', 'dungeon.js', 'locations.js'];
  if (opts.withSprites) chain.push('sprites.js');
  chain.push('dungeon-ui.js', 'motion.js');
  for (const f of chain) vm.runInContext(src(f), sandbox, { filename: f });
  return { G: sandbox.Game, body: document.body, errors };
}

function makeBossState(opts = {}) {
  const w = opts.width || 7, h = opts.height || 7;
  const cells = new Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const wall = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      cells[y * w + x] = wall ? 0 : 1;
    }
  }
  return {
    dg: {
      type: opts.type, width: w, height: h, cells,
      entrance: { x: 1, y: 1 }, exit: { x: 1, y: 1 },
    },
    contents: { chests: [], mobs: opts.mobs || [], deposits: [] },
    x: 1, y: 1,
    log: ['фикстура 000330'],
  };
}

const VW = 800, VH = 600;
const BOSS_UNIT_OFF = [[-1, 0], [0, 1], [1, 0]];
const MOB_UNIT_OFF = [[0, 0], [-0.35, 0.15], [0.35, 0.15]];

function drawImageAt(calls, x, y, s, tol = 1e-9) {
  return calls.filter((c) => c[0] === 'drawImage'
    && Math.abs(c[1][1] - x) <= tol
    && Math.abs(c[1][2] - y) <= tol
    && Math.abs(c[1][3] - s) <= tol
    && Math.abs(c[1][4] - s) <= tol);
}

function expectedUnitSprite(G, now, u, camX, camY, zoom) {
  const frames = G.MOB_FRAMES[G.mobSpriteKind(u.id)];
  const fi = Math.floor(G.frameIndex(now, u.x, u.y, frames.length));
  const p = G.worldToScreen(u.x + 0.5, u.y + 0.5, camX, camY, zoom, VW, VH);
  const s = zoom * 1.2;
  return { path: frames[fi], x: p.x - s / 2, y: p.y - s / 2, s };
}

function makeSpriteLoader(G) {
  const ready = new Set();
  for (const frames of Object.values(G.MOB_FRAMES)) {
    for (const p of frames) ready.add(p);
  }
  const imgs = new Map();
  return {
    isReady: (p) => ready.has(p),
    image: (p) => {
      if (!ready.has(p)) return null;
      if (!imgs.has(p)) imgs.set(p, { __img: p });
      return imgs.get(p);
    },
  };
}

const ZOOM = 48;

// --- B-REND-1: рендер 3×3 bbox + юниты на разных клетках footprint ---

test('B-REND-1: босс — ТОЧНО 3×3 #b06ad4 (угол (2,2), 3×zoom) под 3 юнитами на (2,3), (3,4), (4,3); обычная группа — MOB_UNIT_OFF как были; без босса подсветки нет', () => {
  const { G, body, errors } = loadDungeonUiSandbox({
    withSprites: true, performance: { now: () => 1000 },
  });
  assert.equal(errors.length, 0, 'ошибок загрузки цепочки нет');
  const boss = {
    x: 3, y: 3, level: 8, defeated: false, boss: true,
    mobIds: ['abomination', 'lower_demon', 'lower_demon'],
  };
  const regular = {
    x: 5, y: 5, level: 5, defeated: false, mobIds: ['succubus'],
  };
  G.dungeonUI.start({
    state: makeBossState({ type: G.DUNGEON_TYPES.ABYSS, mobs: [boss, regular] }),
    onMove() {}, zoom: ZOOM, spriteLoader: makeSpriteLoader(G),
  });
  const calls = findCanvas(body).drawCalls;
  // 7×7 @ 48: вьюпорт больше подземелья → cam (3.5, 3.5).
  const P = (x, y) => G.worldToScreen(x, y, 3.5, 3.5, ZOOM, VW, VH);
  const purple = calls.filter(
    (c) => c[0] === 'fillRect' && c[2] === '#b06ad4');
  assert.equal(purple.length, 1,
    'boss-подсветка — ровно ОДИН прямоугольник #b06ad4');
  const bb = P(2, 2);
  assert.ok(
    Math.abs(purple[0][1][0] - bb.x) <= 1e-9
    && Math.abs(purple[0][1][1] - bb.y) <= 1e-9
    && Math.abs(purple[0][1][2] - 3 * ZOOM) <= 1e-9
    && Math.abs(purple[0][1][3] - 3 * ZOOM) <= 1e-9,
    'подсветка — ТОЧНО 3×3 тайла: угол (2,2) (m.x−1, m.y−1), '
    + 'размер 3×zoom; факт: [' + purple[0][1].join(',') + ']');
  const s = ZOOM * 1.2;
  const mobImgs = calls.filter((c) => c[0] === 'drawImage'
    && Math.abs(c[1][3] - s) <= 1e-9 && Math.abs(c[1][4] - s) <= 1e-9);
  assert.equal(mobImgs.length, 4, '3 юнита босса + 1 юнит обычной группы');
  boss.mobIds.forEach((id, i) => {
    const u = { id, x: boss.x + BOSS_UNIT_OFF[i][0],
      y: boss.y + BOSS_UNIT_OFF[i][1] };
    const e = expectedUnitSprite(G, 1000, u, 3.5, 3.5, ZOOM);
    const hit = drawImageAt(calls, e.x, e.y, s)
      .find((c) => c[1][0] && c[1][0].__img === e.path);
    assert.ok(hit, 'босс-юнит ' + i + ' (' + id + ') на клетке ('
      + u.x + ',' + u.y + ') — 3 РАЗНЫХ клетки footprint');
  });
  const ru = { id: 'succubus', x: 5, y: 5 };
  const re = expectedUnitSprite(G, 1000, ru, 3.5, 3.5, ZOOM);
  assert.ok(drawImageAt(calls, re.x, re.y, s)
    .length >= 1, 'обычная группа — смещения MOB_UNIT_OFF как были');
  for (const off of [MOB_UNIT_OFF[1], MOB_UNIT_OFF[2]]) {
    assert.ok(!calls.some((c) => c[0] === 'drawImage'
      && Math.abs(c[1][1] - P(5 + off[0] + 0.5, 5 + off[1] + 0.5).x - s / 2) <= 1e-9
      && Math.abs(c[1][3] - s) <= 1e-9),
      'обычная группа НЕ на смещениях ±0.35 (её юниты — только (5,5))');
  }
  assert.ok(!calls.some((c) => c[0] === 'fillRect' && c[2] === '#d9483b'),
    'красных квадратов #d9483b нет (все спрайты ready)');
  const bossRectIdx = calls.indexOf(purple[0]);
  for (let i = 0; i < 3; i++) {
    const u = { id: boss.mobIds[i], x: boss.x + BOSS_UNIT_OFF[i][0],
      y: boss.y + BOSS_UNIT_OFF[i][1] };
    const e = expectedUnitSprite(G, 1000, u, 3.5, 3.5, ZOOM);
    const hit = drawImageAt(calls, e.x, e.y, s)
      .find((c) => c[1][0] && c[1][0].__img === e.path);
    assert.ok(calls.indexOf(hit) > bossRectIdx,
      'подсветка 3×3 рисуется ДО спрайтов босса');
  }
  // без босса — подсветки нет.
  const sb = loadDungeonUiSandbox({
    withSprites: true, performance: { now: () => 1000 },
  });
  sb.G.dungeonUI.start({
    state: makeBossState({ type: sb.G.DUNGEON_TYPES.ABYSS, mobs: [regular] }),
    onMove() {}, zoom: ZOOM, spriteLoader: makeSpriteLoader(sb.G),
  });
  const calls2 = findCanvas(sb.body).drawCalls;
  assert.ok(!calls2.some((c) => c[0] === 'fillRect' && c[2] === '#b06ad4'),
    'без босса — прямоугольника #b06ad4 нет');
});

// --- B-REND-2: без sprites.js — босс 3×3, обычная группа legacy ---

test('B-REND-2: без sprites.js — босс один #b06ad4 3×3 (угол (2,2), 3×zoom); обычная группа — legacy-квадрат +3/+3 zoom−6 #d9483b', () => {
  const { G, body, errors } = loadDungeonUiSandbox({
    performance: { now: () => 1000 },
  });
  assert.equal(errors.length, 0, 'ошибок загрузки цепочки нет');
  const boss = {
    x: 3, y: 3, level: 8, defeated: false, boss: true,
    mobIds: ['abomination', 'lower_demon', 'lower_demon'],
  };
  const regular = {
    x: 5, y: 5, level: 5, defeated: false, mobIds: ['succubus'],
  };
  G.dungeonUI.start({
    state: makeBossState({ type: G.DUNGEON_TYPES.ABYSS, mobs: [boss, regular] }),
    onMove() {}, zoom: ZOOM,
  });
  const calls = findCanvas(body).drawCalls;
  const P = (x, y) => G.worldToScreen(x, y, 3.5, 3.5, ZOOM, VW, VH);
  const purple = calls.filter(
    (c) => c[0] === 'fillRect' && c[2] === '#b06ad4');
  assert.equal(purple.length, 1,
    'босс без спрайтов — ОДИН #b06ad4-прямоугольник');
  const bb = P(2, 2);
  assert.ok(
    Math.abs(purple[0][1][0] - bb.x) <= 1e-9
    && Math.abs(purple[0][1][1] - bb.y) <= 1e-9
    && Math.abs(purple[0][1][2] - 3 * ZOOM) <= 1e-9
    && Math.abs(purple[0][1][3] - 3 * ZOOM) <= 1e-9,
    'фолбэк босса — 3×3 тайла (угол (2,2), 3×zoom); факт: ['
    + purple[0][1].join(',') + ']');
  const rq = P(5, 5);
  assert.ok(calls.some((c) => c[0] === 'fillRect' && c[2] === '#d9483b'
    && Math.abs(c[1][0] - (rq.x + 3)) <= 1e-9
    && Math.abs(c[1][1] - (rq.y + 3)) <= 1e-9
    && Math.abs(c[1][2] - (ZOOM - 6)) <= 1e-9
    && Math.abs(c[1][3] - (ZOOM - 6)) <= 1e-9),
    'обычная группа — legacy-квадрат +3/+3 zoom−6 (без изменений)');
  assert.equal(calls.filter((c) => c[0] === 'drawImage').length, 0,
    'без sprites.js — drawImage нет');
});

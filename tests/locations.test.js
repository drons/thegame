// src/locations.js (задача 000127, разбиение main.js 1/4): домен
// «состояние и переходы подземелья/города». КРАСНЫЕ тесты TDD-стадии.
//
// Контракт: memory/000127-locations-module.md (§4 API, §8 инварианты).
// API (9 функций, события возврата — чистые функции, решение D3):
//   L = require('../src/locations.js')        // браузер: Game.locations
//   L.makeDungeonState(d, contents, worldKey, env) → ds
//   L.makeCityState(layout, buildingRec, worldKey, env) → ds
//   L.maybeEnterDungeon(ctx) / L.maybeEnterCity(ctx) → ds | null
//   L.exitDungeon(ds, { day, memory, clock }) → void
//   L.exitCity(ds) → void                      // без дня, без памяти
//   L.dungeonMove(ds, dx, dy, now, { inCombat }) → null | event
//   L.cityMove(ds, dx, dy, now, { inCombat })  → null | event
//   L.debugEnterDungeon(ctx, terrain) → ds | null
// Форма ds — поле-в-поле как dungeonState main.js (инвариант сейва/HUD):
//   { dg, contents, kind: 'dungeon'|'city', name (город), x, y,
//     prevX, prevY, worldKey, log, mover, pos }
//
// RED-фаза: модуля ещё нет — каждый тест падает осмысленно
// («src/locations.js не существует» / «Game.locations отсутствует» /
// «тег не подключён в index.html»), а не синтаксической ошибкой.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const LOC_PATH = path.join(ROOT, 'src', 'locations.js');
const NOW = 1000; // фиксированное время (детерминированные асерты)

// Ядра, ЧТО БУДЕТ ПОТРЕБЛЯТЬ locations.js (поведение не меняется):
const D = require('../src/dungeon.js');

// --- Загрузка модуля (лениво: RED-фаза падает ПО ТЕСТАМ) ---

function loadLocations() {
  try {
    return require(LOC_PATH);
  } catch (e) {
    assert.fail('src/locations.js не существует или не грузится ' +
      '(задача 000127): ' + e.message);
  }
}

function readLocationsSource() {
  try {
    return fs.readFileSync(LOC_PATH, 'utf8');
  } catch (e) {
    assert.fail('src/locations.js не существует (задача 000127): ' +
      e.message);
  }
}

// ЛЕНИВЫЙ Game (прецедент tests/building-effects.test.js): модуль
// читает globalThis.Game в момент ВЫЗОВА — на время вызова подменяем.
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

// --- Фейки и синтетика ---

// createMover-шпион: фиксит созданные опции, снапы и шаги; position —
// последняя клетка (глейд «до конца» — мувер уже в целевой клетке).
function makeFakeGame() {
  const log = [];
  const moverCalls = { created: [], teleports: [], steps: [] };
  function createMover(opts) {
    log.push('createMover');
    moverCalls.created.push(opts);
    const p = { x: opts.x, y: opts.y };
    return {
      intervalMs: opts.intervalMs,
      teleport(x, y) {
        log.push('teleport');
        moverCalls.teleports.push({ x, y });
        p.x = x; p.y = y;
      },
      step(prev, next, now) {
        log.push('mover.step');
        moverCalls.steps.push({ prev, next, now });
        p.x = next.x; p.y = next.y;
      },
      position() { return { x: p.x, y: p.y }; },
    };
  }
  const G = {
    createMover,
    DUNGEON_NAMES: D.DUNGEON_NAMES,
    CELL_FLOOR: D.CELL_FLOOR,
    CELL_WALL: D.CELL_WALL,
    // Реальные ядра dungeon.js (поведение openChest/wanderStep —
    // дословно как в игре), обёрнутые в шпионы для порядка вызовов.
    openChest: (c, id) => { log.push('openChest'); return D.openChest(c, id); },
    wanderStep: (c, d) => { log.push('wanderStep'); return D.wanderStep(c, d); },
  };
  return { G, log, moverCalls };
}

// 5×5: периметр — стены, внутренность (1..3)×(1..3) — пол.
// entrance (1,1), exit (3,3) — обе клетки-пол.
function makeDungeon() {
  const W = 5;
  const cells = new Array(W * W).fill(D.CELL_WALL);
  for (let y = 1; y <= 3; y++)
    for (let x = 1; x <= 3; x++) cells[y * W + x] = D.CELL_FLOOR;
  return {
    type: D.DUNGEON_TYPES.CAVE,
    width: W, height: W, cells,
    entrance: { x: 1, y: 1 },
    exit: { x: 3, y: 3 },
    seed: 777,
  };
}

// Layout города той же формы (createCityLayout — периметр/пол/
// entrance/exit; kind 'city').
function makeCityLike() {
  const W = 5;
  const cells = new Array(W * W).fill(D.CELL_WALL);
  for (let y = 1; y <= 3; y++)
    for (let x = 1; x <= 3; x++) cells[y * W + x] = D.CELL_FLOOR;
  return {
    kind: 'city',
    width: W, height: W, cells,
    entrance: { x: 1, y: 1 },
    exit: { x: 3, y: 3 },
    seed: 888,
  };
}

function makeContents(mobs, chests) {
  return { seed: 42, mobs, chests, createdAtXp: 0, step: 0 };
}

// ds через сам модуль (фабрика) — тесты шагов работают с РЕАЛЬНОЙ
// формой состояния (инвариант «форма ds не меняется»).
function makeDs(L, G, dg, contents, worldKey, kind) {
  return withGame(G, () => (kind === 'city'
    ? L.makeCityState(dg,
        { название: 'Городок', размер: { ширина: 3 } },
        worldKey, { intervalMs: 420 })
    : L.makeDungeonState(dg, contents, worldKey, { intervalMs: 420 })));
}

// --- Цепочка index.html (как в vm-песочницах проекта) ---

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(
  html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));

function runChain(sandbox, chain) {
  for (const f of chain) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox,
      { filename: f });
  }
}

// --- vm-стабы полной цепочки (паттерн tests/city-screen.test.js) ---

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

function makeEl(tag) {
  const target = {
    tagName: tag,
    className: '',
    textContent: '',
    title: '',
    style: {},
    dataset: {},
    children: [],
    listeners: {},
    appendChild(ch) { target.children.push(ch); return ch; },
    addEventListener(type, fn) {
      (target.listeners[type] || (target.listeners[type] = [])).push(fn);
    },
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    setAttribute() {},
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    remove() {},
    blur() {},
  };
  if (tag === 'canvas') {
    target.width = 0;
    target.height = 0;
    target.getContext = (kind) => (kind === '2d'
      ? makeContext2d(target) : null);
  }
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return () => undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function makeStorage() {
  const store = {};
  return {
    store,
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k)
      ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
}

const drain = () => new Promise((r) => setImmediate(r));

function bootFullChain() {
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl() : makeContext2d(gameCanvas));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? makeContext2d(spriteCanvas) : null);
  const storage = makeStorage();
  const document = {
    createElement: (tag) => makeEl(tag),
    getElementById: (id) => (
      id === 'game' ? gameCanvas
        : id === 'sprites' ? spriteCanvas
          : id === 'hud' ? hud
            : null),
    body: makeEl('body'),
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
    addEventListener() {},
    removeEventListener() {},
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
  const errors = [];
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
    requestAnimationFrame: () => 1,
  };
  vm.createContext(sandbox);
  runChain(sandbox, CHAIN);
  return { sandbox, errors };
}

// ============================================================
// NODE-тесты (чистая часть модуля)
// ============================================================

test('LOC-1: модуль существует — node API: 9 функций (require)', () => {
  const L = loadLocations();
  for (const fn of [
    'makeDungeonState', 'makeCityState',
    'maybeEnterDungeon', 'maybeEnterCity',
    'exitDungeon', 'exitCity',
    'dungeonMove', 'cityMove',
    'debugEnterDungeon',
  ]) {
    assert.equal(typeof L[fn], 'function', 'L.' + fn + ' — функция');
  }
});

test('LOC-2: UMD-чистота: НОЛЬ require во всём файле, НЕТ своего RNG (детерминизм)', () => {
  // 000053/000071: взаимных require в момент загрузки нет — vm-песочницы
  // не роняются; детерминизм: ноль новых вызовов RNG — весь поток
  // случайности живёт в ядрах (createDungeon/generateDungeonContents/
  // wanderStep/createCityLayout) в ТЕХ ЖЕ вызовах, что в main.js.
  const src = readLocationsSource();
  assert.ok(!/require\s*\(/.test(src),
    'locations.js: НОЛЬ require() во всём файле (000053/000071)');
  assert.ok(!/Math\.random|mulberry32|hash2|generateSeedPixels/.test(src),
    'locations.js: нет своего RNG (Math.random/mulberry32/hash2/' +
    'generateSeedPixels) — детерминизм бит-в-бит');
});

test('LOC-3: makeDungeonState: форма — kind \'dungeon\', entrance, worldKey, log, mover+pos', () => {
  const L = loadLocations();
  const d = makeDungeon();
  const contents = makeContents([], []);
  const { G, moverCalls } = makeFakeGame();
  withGame(G, () => {
    const ds = L.makeDungeonState(d, contents, '7,3', { intervalMs: 420 });
    assert.equal(ds.kind, 'dungeon');
    assert.equal(ds.dg, d, 'ds.dg — переданный лабиринт');
    assert.equal(ds.contents, contents, 'ds.contents — переданное содержимое');
    assert.equal(ds.x, d.entrance.x);
    assert.equal(ds.y, d.entrance.y);
    assert.equal(ds.prevX, d.entrance.x);
    assert.equal(ds.prevY, d.entrance.y);
    assert.equal(ds.worldKey, '7,3');
    assert.deepEqual(ds.log, [D.DUNGEON_NAMES[d.type] + ': вход.']);
    // Мувер — createMover (motion.js) от entrance, интервал — ПАРАМЕТРОМ
    // (MOVE_INTERVAL_MS остаётся в main.js, решение D1).
    assert.equal(moverCalls.created.length, 1, 'createMover — один раз');
    assert.deepEqual(moverCalls.created[0],
      { x: d.entrance.x, y: d.entrance.y, intervalMs: 420 });
    // Защитный снап в entrance.
    assert.deepEqual(moverCalls.teleports,
      [{ x: d.entrance.x, y: d.entrance.y }]);
    // Дробная позиция для dungeon-ui.
    assert.equal(typeof ds.pos, 'function');
    assert.deepEqual(ds.pos(NOW),
      { x: d.entrance.x, y: d.entrance.y });
  });
  // Деградация (D12): нет createMover → ds.mover = null, ds.pos → {x, y}
  // (та же деградация, что в main.js без motion.js).
  withGame({}, () => {
    const ds = L.makeDungeonState(d, contents, '7,3', { intervalMs: 420 });
    assert.equal(ds.mover, null);
    assert.deepEqual(ds.pos(NOW), { x: d.entrance.x, y: d.entrance.y });
  });
});

test('LOC-4: makeDungeonState: детерминизм (те же аргументы — тот же ds) + ноль RNG в источнике', () => {
  const L = loadLocations();
  const d = makeDungeon();
  const contents = makeContents([], []);
  const snap = (ds) => JSON.stringify({
    kind: ds.kind, x: ds.x, y: ds.y, prevX: ds.prevX, prevY: ds.prevY,
    worldKey: ds.worldKey, log: ds.log,
    entrance: ds.dg.entrance, exit: ds.dg.exit,
  });
  const a = withGame(makeFakeGame().G, () =>
    L.makeDungeonState(d, contents, '7,3', { intervalMs: 420 }));
  const b = withGame(makeFakeGame().G, () =>
    L.makeDungeonState(d, contents, '7,3', { intervalMs: 420 }));
  assert.equal(snap(a), snap(b),
    'два вызова с теми же аргументами — тот же ds (нет скрытого RNG)');
  const src = readLocationsSource();
  assert.ok(!/Math\.random|mulberry32|hash2|generateSeedPixels/.test(src),
    'в источнике locations.js нет вызовов RNG (структурно)');
});

test('LOC-5: makeCityState: форма — kind \'city\', contents null, name из каталога', () => {
  const L = loadLocations();
  const layout = makeCityLike();
  const recPlain = { название: 'Тестовград', размер: { ширина: 3 } };
  const recSpecial = {
    название: 'Тестовград', размер: { ширина: 3 },
    особые_параметры: { название_карты: 'Специальное имя' },
  };
  const { G } = makeFakeGame();
  withGame(G, () => {
    // Ветка без особых_параметров → rec.название.
    const ds1 = L.makeCityState(layout, recPlain, '9,4', { intervalMs: 420 });
    assert.equal(ds1.kind, 'city');
    assert.equal(ds1.dg, layout, 'ds.dg — переданный layout');
    assert.equal(ds1.contents, null, 'город пуст (содержимое — 000106)');
    assert.equal(ds1.name, 'Тестовград');
    assert.equal(ds1.x, layout.entrance.x);
    assert.equal(ds1.y, layout.entrance.y);
    assert.equal(ds1.prevX, layout.entrance.x);
    assert.equal(ds1.prevY, layout.entrance.y);
    assert.equal(ds1.worldKey, '9,4');
    assert.deepEqual(ds1.log, ['Тестовград: вход.']);
    // Ветка особых_параметров → название_карты (приоритет, как main.js).
    const ds2 = L.makeCityState(layout, recSpecial, '9,4',
      { intervalMs: 420 });
    assert.equal(ds2.name, 'Специальное имя');
    assert.deepEqual(ds2.log, ['Специальное имя: вход.']);
  });
});

test('LOC-6: dungeonMove: стена/граница/inCombat/!ds — шаг заблокирован (null), без exit и mover.step', () => {
  const L = loadLocations();
  const { G, moverCalls } = makeFakeGame();
  const d = makeDungeon();
  const ds = makeDs(L, G, d, makeContents([], []), '7,3', 'dungeon');
  withGame(G, () => {
    ds.x = 1; ds.y = 1; ds.prevX = 1; ds.prevY = 1;
    // (1,0) — стена периметра; (0,1) — за границу.
    assert.equal(L.dungeonMove(ds, 0, -1, NOW, { inCombat: false }), null,
      'стена — null');
    assert.equal(L.dungeonMove(ds, -1, 0, NOW, { inCombat: false }), null,
      'граница — null');
    assert.equal(L.dungeonMove(ds, 1, 0, NOW, { inCombat: true }), null,
      'inCombat — null (гард в начале, как main.js)');
    assert.equal(L.dungeonMove(null, 1, 0, NOW, { inCombat: false }), null,
      '!ds — null');
    // Позиция не сдвинута, мувер не вызывался.
    assert.equal(ds.x, 1); assert.equal(ds.y, 1);
    assert.equal(ds.prevX, 1); assert.equal(ds.prevY, 1);
    assert.equal(moverCalls.steps.length, 0, 'mover.step — 0 раз');
    // Контроль: свободный шаг — событие { type: \'moved\' }, глейд
    // prev→next, позиция обновлена.
    const ev = L.dungeonMove(ds, 1, 0, NOW, { inCombat: false });
    assert.equal(ev.type, 'moved');
    assert.equal(ev.chest, null);
    assert.equal(ds.x, 2); assert.equal(ds.y, 1);
    assert.equal(ds.prevX, 1); assert.equal(ds.prevY, 1);
    assert.equal(moverCalls.steps.length, 1);
    assert.deepEqual(moverCalls.steps[0].prev, { x: 1, y: 1 });
    assert.deepEqual(moverCalls.steps[0].next, { x: 2, y: 1 });
  });
});

test('LOC-7: dungeonMove: выходная клетка — {type: \'exit\', name}; exitDungeon: memory.set + clock.event(\'dungeon\')', () => {
  const L = loadLocations();
  const { G, moverCalls } = makeFakeGame();
  const d = makeDungeon(); // exit (3,3)
  const contents = makeContents([], []);
  const ds = makeDs(L, G, d, contents, '7,3', 'dungeon');
  withGame(G, () => {
    ds.x = 2; ds.y = 3; ds.prevX = 2; ds.prevY = 3;
    const ev = L.dungeonMove(ds, 1, 0, NOW, { inCombat: false });
    assert.equal(ev.type, 'exit');
    assert.equal(ev.name, D.DUNGEON_NAMES[d.type],
      'name — DUNGEON_NAMES[type] (строка hudFlash проводки)');
    // Позиция НЕ сдвинута, мувер НЕ вызывался (ранний return, как main.js).
    assert.equal(ds.x, 2); assert.equal(ds.y, 3);
    assert.equal(moverCalls.steps.length, 0);
    // exitDungeon — доменная семантика (D5): подземелье тратит ДЕНЬ
    // и пишет память содержимого.
    const memory = new Map();
    const events = [];
    const clock = { day: 5, event: (k) => events.push(k) };
    L.exitDungeon(ds, { day: 5, memory, clock });
    assert.deepEqual(memory.get(ds.worldKey),
      { contents: ds.contents, lastVisitDay: 5 },
      'memory.set(worldKey, { contents, lastVisitDay })');
    assert.deepEqual(events, ['dungeon'],
      'clock.event(\'dungeon\') — вылазка забирает день');
  });
});

test('LOC-8: dungeonMove: моб → {type: \'combat\', group} без wanderStep; сундук → openChest + wanderStep ровно раз на успешный шаг', () => {
  const L = loadLocations();
  const d = makeDungeon();
  // (а) Моб на клетке (2,2): бой — wanderStep НЕ вызывается
  // (ранний return после глейда; как main.js — startDungeonCombat).
  const A = makeFakeGame();
  withGame(A.G, () => {
    const g = { id: 'g1', mobIds: ['cave_beast'], x: 2, y: 2,
      level: 1, defeated: false };
    const dsM = makeDs(L, A.G, d, makeContents([g], []), '7,3', 'dungeon');
    dsM.x = 1; dsM.y = 2; dsM.prevX = 1; dsM.prevY = 2;
    const evM = L.dungeonMove(dsM, 1, 0, NOW, { inCombat: false });
    assert.equal(evM.type, 'combat');
    assert.equal(evM.group, g, 'group — та же группа, что в contents');
    // Глейд ДО боя (000068): позиция сдвинута, мувер дошёл.
    assert.equal(dsM.x, 2); assert.equal(dsM.y, 2);
    assert.equal(A.moverCalls.steps.length, 1);
    assert.ok(!A.log.includes('wanderStep'),
      'ветка combat: wanderStep НЕ вызывается');
    assert.ok(!A.log.includes('openChest'), 'ветка combat: сундук не читается');
  });
  // (б) Сундук на клетке (2,2): openChest (реальное ядро) ОДИН раз,
  // событие {type: \'moved\', chest: {gold, item}}; порядок вызовов
  // mover.step → openChest → wanderStep; повторный заход — НЕ
  // открывает (opened=true), wanderStep — снова ровно раз.
  const B = makeFakeGame();
  withGame(B.G, () => {
    const ch = { id: 'c1', x: 2, y: 2, opened: false,
      gold: 33, item: 'potion' };
    const dsC = makeDs(L, B.G, d, makeContents([], [ch]), '8,3', 'dungeon');
    dsC.x = 1; dsC.y = 2; dsC.prevX = 1; dsC.prevY = 2;
    const evC = L.dungeonMove(dsC, 1, 0, NOW, { inCombat: false });
    assert.equal(evC.type, 'moved');
    assert.deepEqual(evC.chest, { gold: 33, item: 'potion' },
      'chest — { gold, item } из openChest (награду применяет проводка)');
    assert.equal(ch.opened, true, 'openChest мутирует содержимое');
    assert.deepEqual(B.log,
      ['createMover', 'teleport', 'mover.step', 'openChest', 'wanderStep'],
      'порядок: фабрика (глейд-мувер) → шаг → сундук → блуждание');
    // Шаг назад и обратно: сундук открыт — НЕ открывает повторно,
    // wanderStep — ровно раз на КАЖДЫЙ успешный шаг.
    assert.equal(L.dungeonMove(dsC, -1, 0, NOW, { inCombat: false }).type,
      'moved');
    const evC2 = L.dungeonMove(dsC, 1, 0, NOW, { inCombat: false });
    assert.equal(evC2.chest, null, 'открытый сундук — chest: null');
    assert.equal((B.log.join(' ').match(/openChest/g) || []).length, 1,
      'openChest — ВСЕГО один раз');
    assert.equal((B.log.join(' ').match(/wanderStep/g) || []).length, 3,
      'wanderStep — 3 раза за 3 успешных шага');
    assert.equal(B.moverCalls.steps.length, 3);
  });
});

test('LOC-9: cityMove: стена/граница/inCombat/exit/moved — БЕЗ мобов/сундуков/wanderStep; kind-гард', () => {
  const L = loadLocations();
  const { G, log, moverCalls } = makeFakeGame();
  const layout = makeCityLike(); // exit (3,3)
  const ds = makeDs(L, G, layout, null, '9,4', 'city');
  withGame(G, () => {
    ds.x = 1; ds.y = 1; ds.prevX = 1; ds.prevY = 1;
    // (1,0) — стена; (0,1) — граница; inCombat.
    assert.equal(L.cityMove(ds, 0, -1, NOW, { inCombat: false }), null);
    assert.equal(L.cityMove(ds, -1, 0, NOW, { inCombat: false }), null);
    assert.equal(L.cityMove(ds, 1, 0, NOW, { inCombat: true }), null);
    assert.equal(ds.x, 1); assert.equal(ds.y, 1);
    assert.equal(moverCalls.steps.length, 0);
    // kind-гард (в том же месте логики, что main.js: cityMove — только
    // для города): ds подземелья → null даже на свободном шаге.
    const d = makeDungeon();
    const dd = makeDs(L, G, d, makeContents([], []), '7,3', 'dungeon');
    dd.x = 1; dd.y = 1; dd.prevX = 1; dd.prevY = 1;
    assert.equal(L.cityMove(dd, 1, 0, NOW, { inCombat: false }), null,
      'kind-гард: ds.kind !== \'city\' — null');
    // Выход: {type: \'exit\', name: ds.name}, позиция не сдвинута.
    ds.x = 2; ds.y = 3; ds.prevX = 2; ds.prevY = 3;
    const evX = L.cityMove(ds, 1, 0, NOW, { inCombat: false });
    assert.equal(evX.type, 'exit');
    assert.equal(evX.name, 'Городок');
    assert.equal(ds.x, 2); assert.equal(ds.y, 3);
    // Свободный шаг: {type: \'moved\'}, contents: null — без падений,
    // мобов/сундуков/wanderStep в городе НЕТ (пусто до 000106).
    const evS = L.cityMove(ds, 0, -1, NOW, { inCombat: false });
    assert.equal(evS.type, 'moved');
    assert.equal(ds.x, 2); assert.equal(ds.y, 2);
    assert.ok(!log.includes('wanderStep'), 'город: wanderStep не вызывается');
    assert.ok(!log.includes('openChest'), 'город: сундуков нет');
  });
});

test('LOC-10: exitCity: ДЕНЬ не проходит, memory НЕ применяется (инварианты 000105/000109)', () => {
  const L = loadLocations();
  const { G } = makeFakeGame();
  const layout = makeCityLike();
  const ds = makeDs(L, G, layout, null, '9,4', 'city');
  const memory = new Map();
  memory.set('other', { contents: {}, lastVisitDay: 1 });
  const events = [];
  const clock = { day: 5, event: (k) => events.push(k) };
  L.exitCity(ds);
  assert.equal(memory.size, 1, 'memory не растёт');
  assert.equal(memory.get(ds.worldKey), undefined,
    'запись по worldKey города — нет (город — без памяти)');
  assert.deepEqual(events, [],
    'clock.event НЕ вызывается (город — локация поверх мира)');
});

// ============================================================
// VM-тесты (браузерная ветка UMD)
// ============================================================

test('LOC-11: vm: Game.locations в браузерном realm — фабрики работают ленивым Game, загрузка чистая', () => {
  // Подмножество index.html (порядок — из HTML): доменная группа +
  // motion.js. Цепочка парсится из index.html — RED: тег locations.js
  // отсутствует → Game.locations undefined.
  const subset = ['global-settings.js', 'perlin.js', 'map.js',
    'dungeons-data.js', 'dungeon.js', 'cities.js', 'motion.js',
    'locations.js'];
  const chain = CHAIN.filter((f) => subset.includes(f));
  assert.ok(chain.includes('locations.js'),
    'src/locations.js в цепочке index.html (script-тег не подключён, ' +
    'задача 000127)');
  const errors = [];
  const sandbox = {
    console: {
      error: (m) => errors.push(String(m)),
      warn: () => {},
      log: () => {},
    },
    performance: { now: () => NOW },
  };
  vm.createContext(sandbox);
  runChain(sandbox, chain);
  assert.equal(errors.length, 0,
    'ошибок загрузки нет (чистый модуль, 000053/000071): ' +
    errors.join('; '));
  const G = sandbox.Game;
  assert.ok(G.locations,
    'Game.locations существует в браузерном realm (UMD)');
  // Фабрика — ЛЕНИВЫМ Game (createMover — motion.js, DUNGEON_NAMES —
  // dungeon.js; в цепочке — оба).
  const d = makeDungeon();
  const ds = G.locations.makeDungeonState(d, makeContents([], []), '7,3',
    { intervalMs: 420 });
  assert.equal(ds.kind, 'dungeon');
  assert.equal(ds.x, d.entrance.x);
  assert.equal(ds.y, d.entrance.y);
  assert.equal(ds.worldKey, '7,3');
  // Разные realm: объекты vm-контекста — чужой прототип,
  // сравниваем по полям (паттерн index-order.test.js).
  assert.equal(ds.log.length, 1);
  assert.equal(ds.log[0], G.DUNGEON_NAMES[d.type] + ': вход.');
  assert.ok(ds.mover,
    'mover создан ленивым Game.createMover (motion.js в цепочке)');
  const p = ds.pos(NOW);
  assert.equal(p.x, d.entrance.x);
  assert.equal(p.y, d.entrance.y);
  const layout = makeCityLike();
  const cs = G.locations.makeCityState(layout,
    { название: 'Вмгород', размер: { ширина: 3 } }, '9,4',
    { intervalMs: 420 });
  assert.equal(cs.kind, 'city');
  assert.equal(cs.name, 'Вмгород');
  assert.equal(cs.contents, null);
  assert.equal(cs.log.length, 1);
  assert.equal(cs.log[0], 'Вмгород: вход.');
});

test('LOC-12: vm ПОЛНАЯ цепочка index.html грузится с locations.js, __game стартует', async () => {
  // Фиксирует факт для всех vm-песочниц (city-screen/main-visuals/
  // save-restore/building-effects/sprites подхватят тег через CHAIN
  // сами): полный бут с locations.js в цепочке — 0 ошибок загрузки,
  // __game выставлен, Game.locations виден проводке main.js (снапшот G
  // ОДИН раз — locations.js обязан быть ДО main.js, UMD-ловушка 000038).
  const h = bootFullChain();
  await drain();
  await drain();
  await drain();
  const g = h.sandbox.__game;
  assert.ok(g, 'globalThis.__game выставлен (main.js выполнен)');
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет (порядок цепочки): ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  assert.ok(G.locations,
    'Game.locations виден в полной цепочке (src/locations.js ДО ' +
    'main.js — иначе проводка main.js его не увидит)');
  for (const fn of ['makeDungeonState', 'makeCityState',
    'maybeEnterDungeon', 'maybeEnterCity', 'exitDungeon', 'exitCity',
    'dungeonMove', 'cityMove', 'debugEnterDungeon']) {
    assert.equal(typeof G.locations[fn], 'function', 'locations.' + fn);
  }
});

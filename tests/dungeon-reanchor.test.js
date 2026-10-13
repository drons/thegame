// Задача 000192: Подземелье — re-anchor входного спавна: защита от
// клетки живого моба (ретро-20261012, finding №1, линза 000153.01).
//
// re-anchor в maybeEnterDungeon (src/locations.js) восстанавливает
// спавн из сохранённого pos, валидируя ЦЕЛЫЕ/ГРАНИЦЫ/CELL_FLOOR —
// но НЕ занятость клетки живым мобом. Единственный достижимый
// RED-сценарий: запись ВАЛИДНА при boot (lastVisitDay в окне) и
// истечает К МОМЕНТУ ВХОДА (день двигается в сессии — live-Map
// dungeonMemory не обрезается до serialize) → содержимое
// регенерируется от текущего totalXp (раскладка мобов
// некоррелирована с сохранённым pos) → игрок спавнится НА клетке
// блуждающего моба.
//
// RA-1 (КРАСНЫЙ до фикса, зелёный после): клетка pos занята живым
//   мобом (регенерация) → спавн на entrance (g.dungeon.x/y ===
//   d.exit), 0 ошибок в консоли (МОЛЧА fail-open — на этом пути
//   console.error нет; контраст: D10 ascendFloor логирует).
// RA-2 (контроль, зелёный до/после): клетка pos ПУСТА → спавн на
//   pos (RD-3-контракт под регенерацией).
// RA-3 (контроль, зелёный до/после): mob на pos уже defeated
//   (валидная память, reuse contents) → спавн на pos (условие
//   именно !defeated — дизайн «занятость ЛЮБЫМ мобом» сломал бы
//   этот контроль).
//
// Harness — КОПИЯ 1:1 из tests/save-restore.test.js (конвенция
// дублирования харнессов: 000083/000087/000186; readSave/
// fireBeforeUnload/stepDungeon/winCombat/dungeonBfs/dungeonWalkTo/
// neighborFloor/arriveAtChest/killNearestGroup не копируются — в
// сценариях нет ни сейв-наблюдения, ни движения в подземелье).
// Детерминистичные пре-контракты сцены и анти-провал — §6
// memory/000192-dungeon-reanchor-mob-guard.md (master e6fcbab).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { SAVE_KEY } = require('../src/save.js');
// 000153.01 (RD): node-реплики детерминированного мира/подземелья.
const D = require('../src/dungeon.js');
const M = require('../src/map.js');
const PS = require('../src/mapseed.js');
const P = require('../src/player.js');

const ROOT = path.join(__dirname, '..');

// Цепочка скриптов — из index.html (не хардкод: изменения порядка
// подхватятся сами; регрессия порядка — tests/index-order.test.js).
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));

// --- WebGL-стаб (main.js: compile/link/буферы; как main-visuals) ---

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
  gl.getShaderParameter = () => true; // иначе main.js бросит Error
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

// --- Canvas 2d-стаб (запись вызовов — sanity, что слой жив) ---

function makeContext2d(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

// --- «Снисходительный» DOM-элемент (как main-visuals) ---

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
    // 000153.01 (RD): dungeon-ui оверлей создаёт canvas через
    // document.createElement — без 2d-стаба render() падает
    // (g2 = undefined → TypeError при set fillStyle). Паттерн
    // tests/main-visuals.test.js (makeEl, canvas-ветка).
    target.getContext = (kind) => (kind === '2d'
      ? makeContext2d(target) : null);
  }
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return () => undefined; // неизвестный метод DOM — no-op
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

// --- localStorage-мок: seed — досеянная оболочка сейва (v1) ---

function makeStorage(seed) {
  const m = new Map();
  if (seed != null) m.set(SAVE_KEY, JSON.stringify(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// Оболочка досеянного сейва актуальной версии (v1).
function seedSave(data) {
  return { version: 1, savedAt: new Date(0).toISOString(), data };
}

// --- Песочница: вся цепочка index.html (браузерная ветка UMD),
// window.localStorage — мок с досеянным сейвом ---

function bootSandbox(seed) {
  const winListeners = {};
  const raf = [];
  const warns = [];
  const errors = [];
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
  // #game — WebGL (без него main.js уходит в фолбэк-ветку и не стартует).
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl() : makeContext2d(gameCanvas));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? makeContext2d(spriteCanvas) : null);
  const storage = makeStorage(seed);
  const document = {
    createElement: (tag) => makeEl(tag),
    getElementById: (id) => (
      id === 'game' ? gameCanvas
        : id === 'sprites' ? spriteCanvas
          : id === 'hud' ? hud
            : null
    ),
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
    confirm: () => false, // миграция не должна потребовать согласия (v1)
    addEventListener: (t, f) => {
      (winListeners[t] || (winListeners[t] = [])).push(f);
    },
    removeEventListener() {},
  };
  // Image-стаб: src ставится ПОСЛЕ onload/onerror (main.js). Загрузка —
  // микротаск: assets/map.png ВСЕГДА onerror (детерминированный фолбэк
  // G.generateSeedPixels, main.js loadMapPixels), остальные — onload.
  function Image() {
    const self = this;
    self.naturalWidth = 0;
    self.naturalHeight = 0;
    Object.defineProperty(self, 'src', {
      configurable: true,
      get() { return self.__src; },
      set(v) {
        self.__src = v;
        self.__asset = v;
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
      warn: (m) => warns.push(String(m)),
      error: (m) => errors.push(String(m)),
      log: () => {},
    },
    document,
    window,
    Image,
    performance: { now: () => 1000 },
    requestAnimationFrame: (fn) => { raf.push(fn); return raf.length; },
  };
  vm.createContext(sandbox);
  for (const f of CHAIN) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox,
      { filename: f });
  }
  return { sandbox, winListeners, raf, warns, errors, storage };
}

// Промывка микротасков (загрузки Image + loadMapPixels().then: карта,
// спавн, restoreFromSave, requestAnimationFrame).
const drain = () => new Promise((r) => setImmediate(r));

async function boot(seed) {
  const h = bootSandbox(seed);
  await drain();
  await drain();
  await drain();
  // 000153.01 (RD): frame() main.js — последний rAF-колбэк на момент
  // старта; frame пере планирует себя (одна и та же функция) —
  // frameFn валидна постоянно (паттерн portal-exit-e2e:279).
  h.frameFn = h.raf[h.raf.length - 1];
  return h;
}

// Сейв реально ПРОЧИТАН (boot не «вакуумный»): оболочка v1 и день
// мира восстановлен из data.day.
function assertRestored(h, day) {
  const st = h.sandbox.__game.state;
  assert.ok(st.map, 'карта сгенерирована (boot прошёл)');
  assert.ok(st.save, 'сейв прочитан (state.save выставлен)');
  assert.equal(st.save.version, 1, 'оболочка v1');
  assert.equal(st.day, day, 'день мира восстановлен из сейва (fastForward)');
}

// --- Ввод (паттерн press/release, tests/portal-exit-e2e.test.js) ---

function keydownFor(dx, dy) {
  return dx === 1 ? 'ArrowRight' : dx === -1 ? 'ArrowLeft'
    : dy === 1 ? 'ArrowDown' : 'ArrowUp';
}

function press(h, code) {
  const e = {
    code, key: code,
    prevented: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() {},
  };
  for (const fn of (h.winListeners['keydown'] || []).slice()) fn(e);
  return e;
}

function release(h, e) {
  for (const fn of (h.winListeners['keyup'] || []).slice()) fn(e);
}

// --- Ходьба по миру (паттерн walkTiles, portal-exit-e2e) ---
// Каждый шаг — keydown(направление) → кадры frame(now) по +200 мс,
// пока игрок не перешёл (tryMove в frame, не более ОДНОГО хода за
// кадр) → keyup. 000135: zone-бой по маршруту — авторазрешение.
// Шаг НА пещерный тайл = авто-вход (enterLocation в том же tryMove).
function walkTiles(h, now, tiles) {
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  for (const [tx, ty] of tiles) {
    const dx = tx - g.state.player.x, dy = ty - g.state.player.y;
    assert.ok(Math.abs(dx) + Math.abs(dy) === 1,
      'BFS: шаг по соседнему тайлу');
    const e = press(h, keydownFor(dx, dy));
    let guard = 0;
    do {
      now += 200;
      h.frameFn(now);
    } while ((g.state.player.x !== tx || g.state.player.y !== ty)
      && ++guard < 10);
    release(h, e);
    assert.equal(g.state.player.x, tx,
      'сценарий: игрок перешёл на (' + tx + ', ' + ty + ') — x');
    assert.equal(g.state.player.y, ty,
      'сценарий: игрок перешёл на (' + tx + ', ' + ty + ') — y');
    if (G.combatUI.isActive()) {
      const c = G.combatUI.current();
      for (const m of c.units.filter((x) => x.side === 'mob'
          && x.alive)) {
        G.combatInternals.dealDamageToMob(c, m, 9999);
      }
      assert.ok(c.result && c.result.outcome === 'victory',
        'zone-бой по маршруту — победа');
      G.combatUI.handleCode('Space');
      assert.equal(G.combatUI.isActive(), false, 'zone-бой закрыт');
    }
  }
  for (let i = 0; i < 4; i++) {
    now += 200;
    h.frameFn(now);
  }
  return now;
}

// --- Пре-контракты сцены (node-реплика; §6 memory/000192-
// dungeon-reanchor-mob-guard.md, master e6fcbab, hero-дефолты
// totalXp 0 — сверено прогоном) ---

const WORLD_MAP = M.createMap(PS.generateSeedPixels());
const CAVE = { x: -20, y: -20 };
const OUT_TILE = { x: -19, y: -20 }; // passable, без групп, не пещера
const CAVE_TERRAIN = WORLD_MAP.tileAt(CAVE.x, CAVE.y).terrain;
const MEM_KEY = CAVE.x + ',' + CAVE.y + ':1'; // ключ dungeonMemory этажа
const MEMORY_DAYS = 3; // dungeon_memory_days (дефолт global-settings)
assert.ok(WORLD_MAP.tileAt(CAVE.x, CAVE.y).passable
  && WORLD_MAP.tileAt(CAVE.x, CAVE.y).hasBuilding
  && !WORLD_MAP.tileAt(CAVE.x, CAVE.y).hasMobGroup,
  'преконтрак: пещерный тайл — passable, с постройкой, без mob-группы');
assert.equal(CAVE_TERRAIN, M.TERRAIN.GRASS,
  'преконтрак: terrain пещеры = GRASS');
assert.ok(WORLD_MAP.tileAt(OUT_TILE.x, OUT_TILE.y).passable
  && !WORLD_MAP.tileAt(OUT_TILE.x, OUT_TILE.y).hasMobGroup
  && !WORLD_MAP.tileAt(OUT_TILE.x, OUT_TILE.y).hasBuilding,
  'преконтрак: выходной тайл — passable, без групп, не пещера');

// node-реплика пещерного подземелья (hero-дефолты: totalXp 0 —
// сид контента зависит только от totalXp; герой в vm создаётся
// при boot с теми же дефолтами; в vm map.png → onerror →
// G.generateSeedPixels() ≡ PS.generateSeedPixels()).
function dungeonReplica() {
  const px = PS.generateSeedPixels();
  const d = D.createDungeon(CAVE.x, CAVE.y, px, CAVE_TERRAIN, 1);
  const contents = D.generateDungeonContents(d, P.createCharacter());
  return { d, contents };
}
const REPLICA = dungeonReplica();
assert.equal(REPLICA.d.width, 25, 'преконтрак: подземелье 25×25 — width');
assert.equal(REPLICA.d.height, 25, 'преконтрак: подземелье 25×25 — height');
assert.deepEqual({ x: REPLICA.d.entrance.x, y: REPLICA.d.entrance.y },
  { x: 5, y: 15 }, 'преконтрак: entrance (5,15)');
assert.deepEqual({ x: REPLICA.d.exit.x, y: REPLICA.d.exit.y },
  { x: 5, y: 15 }, 'преконтрак: exit = entrance (5,15), 000177');
assert.equal(REPLICA.contents.mobs.length, 3, 'преконтрак: 3 группы');
assert.deepEqual(REPLICA.contents.mobs.map((m) =>
  ({ id: m.id, x: m.x, y: m.y, level: m.level, defeated: m.defeated })),
  [
    { id: 'g0', x: 12, y: 5, level: 2, defeated: false },
    { id: 'g1', x: 11, y: 16, level: 4, defeated: false },
    { id: 'g2', x: 16, y: 9, level: 1, defeated: false },
  ],
  'преконтрак: g0 (12,5) lv2 / g1 (11,16) lv4 / g2 (16,9) lv1 — все живы');
assert.equal(REPLICA.contents.chests.length, 2, 'преконтрак: 2 сундука');
assert.deepEqual(REPLICA.contents.chests.map((c) =>
  ({ id: c.id, x: c.x, y: c.y, gold: c.gold, opened: c.opened })),
  [
    { id: 'c0', x: 21, y: 11, gold: 34, opened: false },
    { id: 'c1', x: 13, y: 4, gold: 20, opened: false },
  ],
  'преконтрак: c0 (21,11) gold 34 / c1 (13,4) gold 20');
assert.deepEqual(REPLICA.contents.deposits.map((d) =>
  ({ id: d.id, x: d.x, y: d.y })),
  [{ id: 'd0', x: 17, y: 8 }], 'преконтрак: залежь d0 (17,8)');

// FLOOR по клеткам реплики (проверка pos на стороне теста).
function replicaFloor(x, y) {
  return x >= 0 && y >= 0 && x < REPLICA.d.width && y < REPLICA.d.height
    && REPLICA.d.cells[y * REPLICA.d.width + x] === D.CELL_FLOOR;
}
assert.ok(replicaFloor(12, 5),
  'преконтрак: (12,5) — FLOOR (клетка g0)');
assert.ok(replicaFloor(6, 15),
  'преконтрак: (6,15) — FLOOR (safe-зона entrance)');
assert.ok(!REPLICA.contents.mobs.some(
  (m) => !m.defeated && m.x === 6 && m.y === 15),
  'преконтрак: (6,15) — без живого моба (safe-зона у входа)');

// SEED-РЕКОРДЫ (содержимое — копия реплики): c0.opened=true,
// g0.defeated=true, step=3 — легитимный сейв (герой стоял на (12,5)
// после победы). RECUR: lastVisitDay 4 → валидна на boot-день 7,
// истёкшая на день входа 8. RECUR_POS6: то же, pos (6,15).
// RECUR_VALID: lastVisitDay 7 → валидна в день 7 (reuse — единственный
// сценарий, где на pos может быть defeated-моб).
const contents3 = JSON.parse(JSON.stringify(REPLICA.contents));
contents3.chests[0].opened = true; // c0 (21,11) — открыт
contents3.mobs[0].defeated = true; // g0 (12,5) — побеждена
contents3.step = 3;
const RECUR = { contents: contents3, lastVisitDay: 4, pos: { x: 12, y: 5 } };
const RECUR_POS6 = { contents: contents3, lastVisitDay: 4, pos: { x: 6, y: 15 } };
const RECUR_VALID = { contents: contents3, lastVisitDay: 7, pos: { x: 12, y: 5 } };

// АНТИ-ПРОВАЛ (до boot): один и тот же посеянный рекорд жив на
// boot-день и мёртв на день входа. Если эти пре-ассерты провалились —
// тест перестал быть красным: чинить КОНСТРУКЦИЮ, а не фикс.
assert.equal(
  D.restoreDungeonMemory({ [MEM_KEY]: RECUR }, 7, MEMORY_DAYS).has(MEM_KEY),
  true,
  'анти-провал: запись ДОЖИЛА до boot (день 7) — иначе re-anchor не '
  + 'увидит pos и тест ложно-зелёный');
assert.equal(
  D.restoreDungeonMemory({ [MEM_KEY]: RECUR }, 8, MEMORY_DAYS).has(MEM_KEY),
  false,
  'анти-провал: запись истекла К ДНЮ ВХОДА (8: 8−4 = 4 > 3) — иначе '
  + 'регенерации не будет');
assert.equal(
  D.restoreDungeonMemory({ [MEM_KEY]: RECUR_VALID }, 7, MEMORY_DAYS).has(MEM_KEY),
  true,
  'RA-3: запись валидна в день 7 (contentValid(7,7) — reuse)');

test('RA-1: re-anchor — клетка pos занята живым мобом (память истекла к входу — регенерация) → спавн на entrance, 0 ошибок', async () => {
  const h = await boot(seedSave({
    day: 7,
    position: { x: CAVE.x, y: CAVE.y },
    dungeonMemory: { [MEM_KEY]: RECUR },
  }));
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: ' + h.errors.join('; '));
  assertRestored(h, 7);
  const g = h.sandbox.__game;
  assert.ok(g.dungeon == null, 'после boot подземелья нет (вход — на шаге)');
  g.actions.rest(); // день 7→8: 8−4 = 4 > 3 — память истекла К МОМЕНТУ ВХОДА
  assert.equal(g.state.day, 8, 'день 8 после rest');
  let now = 1000;
  now = walkTiles(h, now, [[OUT_TILE.x, OUT_TILE.y]]);
  now = walkTiles(h, now, [[CAVE.x, CAVE.y]]);
  assert.ok(g.dungeon, 'авто-вход в пещеру (world-step)');
  assert.equal(g.dungeon.depth, 1, 'depth = 1 (первый этаж)');
  assert.equal(g.dungeon.day, 8, 'день подземелья = дню мира');
  assert.ok(g.dungeon.mobs.some((m) => m.x === 12 && m.y === 5),
    'живой моб на (12,5) — ситуация гарда материализована '
    + '(entrance — не случайный выбор)');
  assert.equal(
    g.dungeon.contents.mobs.filter((m) => m.defeated).length, 0,
    'регенерация состоялась: сеянные defeated-флаги стёрты (фикс '
    + 'обязан смотреть локальную contents, не saved.contents)');
  assert.equal(g.dungeon.chests, 2,
    'регенерация: сеянные opened-флаги стёрты — 2 сундука');
  assert.equal(g.dungeon.mobs.length, 3,
    'регенерация: полный набор групп (3)');
  assert.deepEqual({ x: g.dungeon.x, y: g.dungeon.y }, { x: 5, y: 15 },
    'спавн на entrance — НЕ на клетке живого моба (красный до фикса)');
  assert.deepEqual({ x: g.dungeon.exit.x, y: g.dungeon.exit.y },
    { x: g.dungeon.x, y: g.dungeon.y },
    'g.dungeon.x/y === d.exit (ТЗ; 000177: exit = entrance)');
  assert.equal(g.dungeon.prevX, g.dungeon.x,
    'prevX — единая клетка спавна (000177)');
  assert.equal(g.dungeon.prevY, g.dungeon.y,
    'prevY — единая клетка спавна (000177)');
  assert.equal(h.errors.length, 0,
    '0 ошибок в консоли (молча fail-open — console.error на этом пути нет)');
});

test('RA-2: контроль — та же конструкция, клетка pos (6,15) ПУСТА → спавн на pos (RD-3-контракт под регенерацией)', async () => {
  const h = await boot(seedSave({
    day: 7,
    position: { x: CAVE.x, y: CAVE.y },
    dungeonMemory: { [MEM_KEY]: RECUR_POS6 },
  }));
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: ' + h.errors.join('; '));
  assertRestored(h, 7);
  const g = h.sandbox.__game;
  g.actions.rest(); // день 7→8 — та же регенерация, что в RA-1
  assert.equal(g.state.day, 8, 'день 8 после rest');
  let now = 1000;
  now = walkTiles(h, now, [[OUT_TILE.x, OUT_TILE.y]]);
  now = walkTiles(h, now, [[CAVE.x, CAVE.y]]);
  assert.ok(g.dungeon, 'авто-вход (world-step)');
  assert.equal(g.dungeon.depth, 1, 'depth = 1');
  assert.equal(g.dungeon.mobs.length, 3,
    'регенерация: полный набор групп (в сеянных contents живых 2 — '
    + 'один defeated)');
  assert.deepEqual({ x: g.dungeon.x, y: g.dungeon.y }, { x: 6, y: 15 },
    'спавн — из сохранённого pos: новое условие НЕ перекрывает '
    + 'легитимный re-anchor под регенерацией');
  assert.equal(h.errors.length, 0, '0 ошибок в консоли');
});

test('RA-3: контроль — mob на pos уже defeated (валидная память, reuse contents) → спавн на pos (условие именно !defeated)', async () => {
  const h = await boot(seedSave({
    day: 7,
    position: { x: CAVE.x, y: CAVE.y },
    dungeonMemory: { [MEM_KEY]: RECUR_VALID },
  }));
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: ' + h.errors.join('; '));
  assertRestored(h, 7);
  const g = h.sandbox.__game;
  // rest НЕ вызывается: вход в день 7 (contentValid(7,7) — reuse
  // saved.contents; единственный сценарий с defeated-мобом на pos).
  let now = 1000;
  now = walkTiles(h, now, [[OUT_TILE.x, OUT_TILE.y]]);
  now = walkTiles(h, now, [[CAVE.x, CAVE.y]]);
  assert.ok(g.dungeon, 'авто-вход (world-step)');
  assert.equal(g.dungeon.depth, 1, 'depth = 1');
  assert.equal(g.dungeon.mobs.length, 2,
    'reuse: побеждённая группа не в живых (3 − 1)');
  assert.ok(!g.dungeon.mobs.some((m) => m.x === 12 && m.y === 5),
    'на pos (12,5) нет живого моба (группа defeated)');
  assert.deepEqual({ x: g.dungeon.x, y: g.dungeon.y }, { x: 12, y: 5 },
    'спавн на pos — defeated-моб НЕ занимает клетку (условие именно '
    + '!m.defeated: «занятость ЛЮБЫМ мобом» сломала бы этот контроль)');
  assert.equal(h.errors.length, 0, '0 ошибок в консоли');
});

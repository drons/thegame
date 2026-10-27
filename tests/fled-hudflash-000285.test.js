// Задача 000285 (красная стадия): 000271-шов (4) — post-combat
// hudFlash-субъект в ДВУХ else-ветках onEnd src/main.js
// (startCombatAt / maybeStartCombat): fled {by:'mobs'} →
// «Противники разбежались.», {by:'player'}/legacy-без-by →
// «Вы ушли от боя.» (ТЗ дословно, ОБЕ ветки).
//
// Контракт: memory/000285-fled-hudflash.md §2.4/§3; ТЗ —
// tasks/pending/000285.md. «Паттерн 000278-FLB» — дисциплина
// (самодостаточный vm-e2e, red/green-счёт, realm-безопасные
// ассерты), НО FLB НЕ грузит main.js (пинит баннер combat-ui.js),
// а Δ1 живёт в onEnd main.js → ПОЛНАЯ цепочка <script> из
// index.html (CHAIN — авто-pickup, не хардкод).
//
// Мир: фолбэк (map.png в стабе ВСЕГДА onerror →
// G.generateSeedPixels, детерминированно). Спавн (0,0). (1,0) —
// g2 логово скелетов (neutral, 3×3, бой ТОЛЬКО на тайле —
// прецедент Z3b).
//
// RED (корни): main.js:1910/:2661 else-ветки НЕ читают res.by →
// hudFlash «Вы ушли от боя.» и на fled-mobs-исход (текущее
// поведение). HF-1/HF-3 — AssertionError на тексте HUD (нет
// ожидаемого субъекта, не ошибка загрузки); HF-2/HF-4 — зелёные
// пины дефолтной ветки с RED-стадии (защита от over-fix «всегда
// mobs-текст»/«инверсия ветки»).
//
// Ручной result (host-литерал) вместо реальной паники: юнит Δ1 —
// маппинг res.by → текст в onEnd; писатель by (shape 5/2 поля)
// запитан FLB-1/FLB-2 (vm) и FR-2 (node) — реальным мультимоб-
// сценарием не дублировать. Прецеденты инъекции: movement-freeze
// T4 (victory), building-effects B24/B25 (fled). finish()
// :3381 гвард `ctx.open && ctx.combat.result && !ended` →
// c.result ДО handleCode; mainFrameAt (raf[0], главный кадр)
// ПОСЛЕ finish — renderHud в кадре (окно: 1000 < 1000+5000).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
// Цепочка — из index.html (не хардкод; регрессия порядка —
// tests/index-order.test.js).
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));

const VIEW_W = 1280;
const VIEW_H = 720;
const NOW = 1000; // performance.now() в песочнице заморожен на NOW

// --- WebGL-стаб (main.js: compile/link/буферы) ---

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

// --- Canvas 2D-стаб: вызовы записываются в el.drawCalls ---

function makeContext2d(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

// --- «Снисходительный» DOM-элемент: known-свойства настоящие,
// неизвестные методы — no-op ---

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

// --- localStorage-мок ---

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// --- Песочница: вся цепочка index.html (браузерная ветка UMD) ---

function bootSandbox() {
  const winListeners = {};
  const raf = [];
  const errors = [];
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
  // #game — WebGL (без него main.js уходит в фолбэк-ветку);
  // #sprites — 2d со спаем.
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
            : null
    ),
    body: makeEl('body'),
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    hidden: false,
  };
  const window = {
    innerWidth: VIEW_W,
    innerHeight: VIEW_H,
    location: { search: '' },
    localStorage: storage,
    confirm: () => false,
    // Семантика браузерного window: повторный add — no-op.
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
  // Image-стаб: assets/map.png ВСЕГДА onerror (детерминированный
  // фолбэк G.generateSeedPixels), остальные пути — onload.
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
      warn: () => {},
      error: (m) => errors.push(String(m)),
      log: () => {},
    },
    document,
    window,
    Image,
    performance: { now: () => NOW },
    requestAnimationFrame: (fn) => { raf.push(fn); return raf.length; },
    // Таймеры не гоняем (флаши UI): no-op.
    setTimeout: () => 0,
    clearTimeout: () => {},
  };
  vm.createContext(sandbox);
  for (const f of CHAIN) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox,
      { filename: f });
  }
  return { sandbox, winListeners, raf, errors, hud };
}

// Промывка микротасков (загрузки Image + loadMapPixels().then).
const drain = () => new Promise((r) => setImmediate(r));

async function boot() {
  const h = bootSandbox();
  await drain();
  await drain();
  await drain();
  return h;
}

// --- Кадр/ввод (протоколы tests/main-visuals / movement-freeze) ---

function frameAt(h, now) {
  h.raf[h.raf.length - 1](now);
}

// Главный кадр (self-rescheduling): raf[0] — НЕ raf[last] (могут
// лежать тики боевого оверлея) — D-протокол 000173, T4.
function mainFrameAt(h, now) {
  h.raf[0](now);
}

function key(h, code) {
  const e = { code, preventDefault() {}, stopPropagation() {} };
  for (const fn of (h.winListeners['keydown'] || []).slice()) fn(e);
  return e;
}

function keyup(h, code) {
  const e = { code };
  for (const fn of (h.winListeners['keyup'] || []).slice()) fn(e);
  return e;
}

// Ход: ОДИН шаг в соседний тайл (keydown → кадры по +200 мс, пока
// игрок фактически не перешёл → keyup). now — МОНОТОННЫЙ.
function makeWalker(h) {
  const g = h.sandbox.__game;
  let now = NOW;
  return function walk(tx, ty) {
    const px = g.state.player.x, py = g.state.player.y;
    const dx = tx - px, dy = ty - py;
    assert.ok(Math.abs(dx) + Math.abs(dy) === 1,
      'шаг по соседнему тайлу (' + px + ',' + py + ')→(' + tx + ',' + ty + ')');
    const code = dx === 1 ? 'ArrowRight' : dx === -1 ? 'ArrowLeft'
      : dy === 1 ? 'ArrowDown' : 'ArrowUp';
    key(h, code);
    let guard = 0;
    do {
      now += 200;
      frameAt(h, now);
    } while ((g.state.player.x !== tx || g.state.player.y !== ty)
      && ++guard < 12);
    keyup(h, code);
    assert.ok(g.state.player.x === tx && g.state.player.y === ty,
      `сценарий: игрок не перешёл на (${tx},${ty}) за ${guard} кадров`);
    return now;
  };
}

// Инъекция result + Space → finish() :3381 (гвард `ctx.open &&
// ctx.combat.result && !ended`) → onEnd СИНХРОННО → mainFrameAt
// (renderHud в кадре; окно флэша открыто: 1000 < 6000) → чтение
// HUD. String-примитив — realm-безопасно.
function endFledCombat(h, G, c, result) {
  c.phase = 'over'; // как в реальном состоянии (checkVictory/playerFlee)
  c.result = result; // host-литерал (onEnd читает только строки/числа)
  G.combatUI.handleCode('Space');
  assert.equal(G.combatUI.isActive(), false, 'панель закрыта (Space → finish)');
  mainFrameAt(h, NOW + 600);
  return String(h.hud.textContent);
}

// --- HF-1 (RED, корень main.js:1910) — startCombatAt-ветка,
// fled {by:'mobs'} (5-поле shape checkVictory, пины FLB-1/FR-2) ---

test('000285-HF-1: e2e — onEnd startCombatAt: fled {by:«mobs»} → hudFlash «Противники разбежались.»', async () => {
  const h = await boot();
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const c = g.actions.startCombat(6);
  assert.ok(c, 'боевой оверлей открыт (actions.startCombat(6))');
  assert.equal(G.combatUI.isActive(), true, 'бой активен');
  const hud = endFledCombat(h, G, c,
    { outcome: 'fled', by: 'mobs', xp: 0, gold: 0, defeated: 0 });
  assert.ok(hud.includes('Противники разбежались.'),
    'RED: fled-mobs — флэш субъекта ГРУППЫ: ' + hud);
  assert.ok(!hud.includes('Вы ушли от боя.'),
    'fled-mobs — НЕ текст бегства игрока: ' + hud);
});

// --- HF-2 (зелёный пин дефолта, :1910) — fled {by:'player'}
// (2-поле shape playerFlee, пин FLB-2) ---

test('000285-HF-2: e2e — onEnd startCombatAt: fled {by:«player»} → hudFlash «Вы ушли от боя.» (регрессионный пин дефолтной ветки)', async () => {
  const h = await boot();
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const c = g.actions.startCombat(6);
  assert.ok(c, 'боевой оверлей открыт (actions.startCombat(6))');
  assert.equal(G.combatUI.isActive(), true, 'бой активен');
  const hud = endFledCombat(h, G, c,
    { outcome: 'fled', by: 'player' });
  assert.ok(hud.includes('Вы ушли от боя.'),
    'fled-player — дефолтный текст бегства: ' + hud);
  assert.ok(!hud.includes('Противники разбежались.'),
    'fled-player — НЕ mobs-текст (anti over-fix «всегда mobs»): ' + hud);
});

// --- HF-3 (RED, корень main.js:2661) — maybeStartCombat-ветка:
// бой НА тайле (1,0) (Z3b: g2 логово скелетов, neutral) ---

test('000285-HF-3: e2e — onEnd maybeStartCombat (бой на тайле (1,0)): fled {by:«mobs»} → hudFlash «Противники разбежались.»', async () => {
  const h = await boot();
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  assert.equal(myMap.tileAt(1, 0).mobGroup, 2,
    'сценарий: логово скелетов (1,0) — neutral');
  const walk = makeWalker(h);
  walk(1, 0); // (0,0)→(1,0): шаг на тайл группы
  assert.equal(G.combatUI.isActive(), true,
    'бой на тайле начался (текущее поведение)');
  const c = G.combatUI.current();
  assert.equal(c.groupType, 2, 'бой — логово скелетов (вторая onEnd-ветка)');
  const hud = endFledCombat(h, G, c,
    { outcome: 'fled', by: 'mobs', xp: 0, gold: 0, defeated: 0 });
  assert.ok(hud.includes('Противники разбежались.'),
    'RED: fled-mobs — флэш субъекта ГРУППЫ (вторая onEnd-ветка): ' + hud);
  assert.ok(!hud.includes('Вы ушли от боя.'),
    'fled-mobs — НЕ текст бегства игрока: ' + hud);
});

// --- HF-4 (зелёный пин дефолта, :2661) ---

test('000285-HF-4: e2e — onEnd maybeStartCombat: fled {by:«player»} → hudFlash «Вы ушли от боя.» (регрессионный пин)', async () => {
  const h = await boot();
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  assert.equal(myMap.tileAt(1, 0).mobGroup, 2,
    'сценарий: логово скелетов (1,0) — neutral');
  const walk = makeWalker(h);
  walk(1, 0); // (0,0)→(1,0): шаг на тайл группы
  assert.equal(G.combatUI.isActive(), true,
    'бой на тайле начался (текущее поведение)');
  const c = G.combatUI.current();
  assert.equal(c.groupType, 2, 'бой — логово скелетов (вторая onEnd-ветка)');
  const hud = endFledCombat(h, G, c,
    { outcome: 'fled', by: 'player' });
  assert.ok(hud.includes('Вы ушли от боя.'),
    'fled-player — дефолтный текст бегства: ' + hud);
  assert.ok(!hud.includes('Противники разбежались.'),
    'fled-player — НЕ mobs-текст (anti over-fix): ' + hud);
});

// Задача 000135 (красная стадия): зоны групп 3×3/5×5 и раннее
// предупреждение боя — e2e на ПОЛНОЙ цепочке <script> из index.html
// (vm-песочница, паттерн tests/main-visuals.test.js + localStorage
// tests/building-effects.test.js).
//
// Контракт: memory/000135-mob-group-zones.md §1/§2/§7 (Z3/Z5/Z6/Z7),
// карточка — memory/000135-group-zones.md. ТЗ — tasks/pending/000135.md
// («Тесты»: e2e vm — шаг в зону агрессивной группы сбоку → бой).
//
// Мир: фолбэк (map.png в стабе ВСЕГДА onerror → G.generateSeedPixels,
// детерминированно). Спавн (0,0). Группы у спавна:
//   * (1,0) — g2 логово скелетов (neutral, 3×3, бой ТОЛЬКО на тайле);
//   * (2,3) — g4 паучье гнездо (territorial, 5×5: x∈[0,4], y∈[1,5] —
//     бой при ВХОДЕ В ЗОНУ);
//   * (5,-5) — g6 дух бездны (aggressive, 5×5) — далеко от маршрутов.
//
// SEED-ПИН (поправка к a3-«c.seed на объекте боя»): createCombat НЕ
// хранит opts.seed на объекте боя (combat-ui.js — литерал opts) →
// spy-обёртка G.combatUI.startCombat ДО шага. main.js читает свойство
// G.combatUI ДИНАМИЧЕСКИ (G = тот же объект Game, 000038) → замена
// свойства работает; оригинал — замыкание без this → цела.
//
// RED (корни): zone-механики НЕТ (экспорт findZoneCombat, scanZones
// в maybeStartCombat, ctx.zoneGroup в hud.js) — бой только на тайле
// (текущее поведение). Падения осмысленные (нет экспорта/поведения),
// не синтаксические.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { SAVE_KEY } = require('../src/save.js');

const ROOT = path.join(__dirname, '..');
// Цепочка — из index.html (не хардкод; регрессия порядка —
// tests/index-order.test.js).
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));

const VIEW_W = 1280;
const VIEW_H = 720;
const NOW = 1000; // performance.now() в песочнице заморожен на NOW
// Соль seed боя (main.js: G.hash2(x, y, 0x5eedc0de)). В ассертах —
// только внутри G.hash2 (значения, не структурный пин источника).
const SALT = 0x5eedc0de;

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
    // 000081: боевой оверлей создаёт canvas — без 2d-стаба startCombat
    // в песочнице падает (как в tests/main-visuals.test.js).
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

// --- localStorage-мок (паттерн tests/building-effects.test.js):
// ДОСЕЯННЫЙ сейв ДО запуска цепочки (Z6б) ---

function makeStorage(seed) {
  const m = new Map();
  if (seed != null) m.set(SAVE_KEY, JSON.stringify(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

function seedSave(data) {
  return { version: 1, savedAt: new Date(0).toISOString(), data };
}

// --- Песочница: вся цепочка index.html (браузерная ветка UMD) ---

function bootSandbox(seed) {
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
    innerWidth: VIEW_W,
    innerHeight: VIEW_H,
    location: { search: '' },
    localStorage: storage,
    confirm: () => false,
    // Семантика браузерного window: повторный add — no-op (как
    // tests/building-effects.test.js).
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
  // фолбэк G.generateSeedPixels), остальные пути — onload; загрузка —
  // микротаск.
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
  return { sandbox, winListeners, raf, errors, storage, hud };
}

// Промывка микротасков (загрузки Image + loadMapPixels().then: карта,
// спавн/restore, requestAnimationFrame).
const drain = () => new Promise((r) => setImmediate(r));

async function boot(seed) {
  const h = bootSandbox(seed);
  await drain();
  await drain();
  await drain();
  return h;
}

// --- Кадр/ввод (протокол tests/main-visuals.test.js) ---

function frameAt(h, now) {
  h.raf[h.raf.length - 1](now);
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

// Ход: ОДИН шаг в соседний тайл (keydown → кадры по +200 мс, пока игрок
// фактически не перешёл (stepMs ≤ 420 мс) → keyup). now —
// МОНОТОННЫЙ (stepInterval: шаг только через stepMs от последнего);
// замыкание держит счётчик на тест.
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

// --- SEED-ПИН: spy-обёртка G.combatUI.startCombat (контракт §7) ---
//
// main.js читает G.combatUI ДИНАМИЧЕСКИ (G = тот же объект) → замена
// свойства sandbox-Game подхватывается; оригинал — замыкание без this
// (combat-ui.js startCombat) → вызов orig(opts) цел. captured.opts —
// ЕДИНСТВЕННЫЙ путь пинить seed/tile/terrain (createCombat seed на
// объекте боя не хранит).

function spyStartCombat(G) {
  const cap = { opts: null, calls: 0 };
  const orig = G.combatUI.startCombat;
  G.combatUI = Object.assign({}, G.combatUI, {
    startCombat: (opts) => {
      cap.opts = opts;
      cap.calls += 1;
      return orig(opts);
    },
  });
  return cap;
}

// Победа в бою (паттерн resolveCombatVictory
// tests/main-visuals.test.js): Эфир 9999 (dealDamageToAlly) + мобы
// 9999 (dealDamageToMob) → checkVictory → Space (finish → onEnd:
// defeatedAt.set(ключ, день), saveNow).
function resolveCombatVictory(G, c, label) {
  const u = c.units.find((x) => x.kind === 'efir');
  assert.ok(u, label + ': Эфир в бою (main.js передаёт efir ВСЕГДА)');
  G.combatInternals.dealDamageToAlly(c, u, 9999);
  assert.equal(u.alive, false, label + ': Эфир пал (dealDamageToAlly)');
  for (const m of c.units.filter((x) => x.side === 'mob' && x.alive)) {
    G.combatInternals.dealDamageToMob(c, m, 9999);
  }
  assert.ok(c.result && c.result.outcome === 'victory',
    label + ': победа (checkVictory)');
  G.combatUI.handleCode('Space');
  assert.equal(G.combatUI.isActive(), false,
    label + ': панель закрыта (Space → finish)');
}

// --- Z5: шаг в зону агрессивной/территориальной группы СБОКУ
// (фланг, НЕ на тайл) → бой на шаге входа; якоря — тайл ГРУППЫ ---

test('Z5. e2e: шаг в 5×5-зону паучьего (2,3) с фланга, (0,0)→(0,1) — бой на шаге входа; seed/tile/terrain — от тайла ГРУППЫ (задача 000135)', async () => {
  const h = await boot(null);
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  // Спавн (0,0): численное равенство (=== 0) — findSpawn может дать
  // -0 (артиметика спирали); strictEqual(-0, 0) — false.
  assert.ok(g.state.player.x === 0, 'сценарий: спавн (0,0) — x');
  assert.ok(g.state.player.y === 0, 'сценарий: спавн (0,0) — y');
  assert.equal(myMap.tileAt(2, 3).mobGroup, 4,
    'сценарий: паучье гнездо (2,3) — territorial 5×5');
  assert.ok(myMap.tileAt(0, 1).passable
    && !myMap.tileAt(0, 1).hasMobGroup,
    'сценарий: (0,1) — в зоне (d=2), не тайл группы');
  const cap = spyStartCombat(G);
  assert.equal(G.combatUI.isActive(), false, 'сценарий: спавн без боя');
  const walk = makeWalker(h);
  walk(0, 1); // (0,0)→(0,1): ВХОД В ЗОНУ (Чебышёв 2 от (2,3))
  assert.equal(G.combatUI.isActive(), true,
    'шаг входа в зону — бой начался (сегодня: бой только на тайле)');
  assert.ok(g.state.player.x === 0, 'игрок в зоне (0,1) — x (не тайл)');
  assert.equal(g.state.player.y, 1, 'игрок в зоне (0,1) — y');
  const c = G.combatUI.current();
  assert.equal(c.groupType, 4, 'бой — паучье гнездо (тип тайла группы)');
  assert.equal(c.groupName, 'паучье гнездо',
    'groupName — из каталога по тайлу группы');
  assert.ok(cap.opts, 'opts захвачены (spy startCombat)');
  assert.equal(cap.calls, 1, 'бой начат РОВНО 1× за шаг');
  assert.equal(cap.opts.seed, G.hash2(2, 3, SALT),
    'seed zone-боя — от тайла ГРУППЫ: hash2(2,3,salt)');
  assert.equal(cap.opts.tile.x, 2, 'opts.tile — тайл группы (x)');
  assert.equal(cap.opts.tile.y, 3, 'opts.tile — тайл группы (y)');
  assert.equal(cap.opts.terrain, myMap.tileAt(2, 3).terrain,
    'opts.terrain — terrain тайла ГРУППЫ');
  resolveCombatVictory(G, c, 'zone-бой');
});

// --- Z3b: бой НА тайле (нейтральная группа) — seed БЕЗ ИЗМЕНЕНИЙ ---
//
// Пин «существующие createCombat-пины не сдвигаются»: на тайле
// группы тайл группы = тайл игрока → hash2(player) = hash2(группа).

test('Z3b. e2e: бой НА тайле (логово скелетов (1,0), neutral) — seed hash2(тайла, salt) без изменений (задача 000135)', async () => {
  const h = await boot(null);
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  assert.equal(myMap.tileAt(1, 0).mobGroup, 2,
    'сценарий: логово скелетов (1,0) — neutral');
  const cap = spyStartCombat(G);
  const walk = makeWalker(h);
  walk(1, 0); // (0,0)→(1,0): шаг на тайл группы
  assert.equal(G.combatUI.isActive(), true,
    'бой на тайле — текущее поведение');
  const c = G.combatUI.current();
  assert.equal(c.groupType, 2, 'бой — логово скелетов');
  assert.ok(cap.opts, 'opts захвачены (spy startCombat)');
  assert.equal(cap.opts.seed, G.hash2(1, 0, SALT),
    'seed на тайле — без изменений (тайл группы = тайл игрока)');
  assert.equal(cap.opts.tile.x, 1, 'opts.tile — тайл группы (x)');
  assert.equal(cap.opts.tile.y, 0, 'opts.tile — тайл группы (y)');
  resolveCombatVictory(G, c, 'бой на тайле');
});

// --- Z6a: повтор входа в зону ПОСЛЕ победы — НЕ-бой (defeatedAt —
// ключ ТАЙЛА ГРУППЫ) + HUD без «— зона» ---

test('Z6a. e2e: после победы в zone-бое повторный вход в зону (другой тайл) — НЕ-бой; HUD без «— зона» (задача 000135)', async () => {
  const h = await boot(null);
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  assert.equal(myMap.tileAt(2, 3).mobGroup, 4,
    'сценарий: паучье гнездо (2,3)');
  assert.ok(myMap.tileAt(1, 1).passable
    && !myMap.tileAt(1, 1).hasMobGroup,
    'сценарий: (1,1) — в зоне (d=2), другой тайл, не группа');
  const cap = spyStartCombat(G);
  const walk = makeWalker(h);
  walk(0, 1); // вход в зону → бой
  assert.equal(G.combatUI.isActive(), true,
    'zone-бой начался (первая часть сценария)');
  resolveCombatVictory(G, G.combatUI.current(), 'zone-бой');
  // Игрок в (0,1) (в зоне). Повторный вход — в зону на ДРУГОМ тайле
  // (1,1): если бы ключ поверженной группы был тайлом ИГРОКА ('0,1'),
  // на (1,1) бой начался бы — ассерт ловит неверный ключ.
  walk(1, 1);
  assert.equal(G.combatUI.isActive(), false,
    'повторный вход в зону после победы — НЕ-бой (общий guard defeatedAt)');
  assert.equal(g.state.player.x, 1, 'игрок в (1,1) — x');
  assert.equal(g.state.player.y, 1, 'игрок в (1,1) — y');
  assert.equal(cap.calls, 1,
    'второй бой НЕ начался (startCombat 1× за сценарий)');
  frameAt(h, NOW + 200 * 20);
  assert.ok(!String(h.hud.textContent).includes('— зона'),
    'HUD: группа повержена сегодня — «— зона» нет: '
    + h.hud.textContent);
});

// --- Z6б: seedSave ВНУТРИ зоны — на буте боя НЕТ (старт tile-only);
// первый успешный шаг в зону → бой; HUD предупреждает ---

test('Z6б. e2e: seedSave с position (0,1) в зоне паучьего — на буте боя НЕТ; HUD «— зона»; первый успешный шаг (0,2) → бой (задача 000135)', async () => {
  const h = await boot(seedSave({ day: 1, position: { x: 0, y: 1 } }));
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  assert.equal(myMap.tileAt(2, 3).mobGroup, 4,
    'сценарий: паучье гнездо (2,3)');
  assert.equal(g.state.player.x, 0, 'позиция сейва — x');
  assert.equal(g.state.player.y, 1, 'позиция сейва — y (в зоне, d=2)');
  assert.equal(G.combatUI.isActive(), false,
    'на буте боя НЕТ: старт — tile-only (телепорт/старт — не шаг)');
  frameAt(h, NOW + 200);
  assert.ok(String(h.hud.textContent).includes('— зона'),
    'HUD на буте в зоне: «Осторожно: … — зона» (раннее предупреждение): '
    + h.hud.textContent);
  const cap = spyStartCombat(G);
  const walk = makeWalker(h);
  walk(0, 2); // первый успешный шаг: (0,1)→(0,2), d=2 — в зоне
  assert.equal(G.combatUI.isActive(), true,
    'первый успешный шаг в зону — бой (скан зон на шаге)');
  assert.equal(cap.opts.seed, G.hash2(2, 3, SALT),
    'seed — от тайла группы (как в Z5)');
  resolveCombatVictory(G, G.combatUI.current(), 'zone-бой (бут)');
});

// --- Z7: spawn-инвариант — бут без боя + findZoneCombat(спавн) null ---

test('Z7. e2e: спавн (0,0) — бут без боя; Game.findZoneCombat(спавн) → null (регресс-пин, задача 000135)', async () => {
  const h = await boot(null);
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.equal(G.combatUI.isActive(), false,
    'бут: боя НЕТ (спавн вне зон, триггерящих бой)');
  assert.equal(typeof G.findZoneCombat, 'function',
    'Game.findZoneCombat — экспорт combat.js (задача 000135)');
  const myMap = G.createMap(G.generateSeedPixels());
  const px = g.state.player.x, py = g.state.player.y;
  // Спавн (0,0): === 0 (findSpawn может дать -0; Object.is(-0, 0) —
  // false, strictEqual бы упал на артефакте знака нуля).
  assert.ok(px === 0, 'сценарий: спавн (0,0) — x');
  assert.ok(py === 0, 'сценарий: спавн (0,0) — y');
  // Окно скана — Чебышёв ≤ 2 (максимум радиуса), как собирает вызывающий.
  const tiles = [];
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      const t = myMap.tileAt(px + dx, py + dy);
      if (t.hasMobGroup) {
        tiles.push({ x: t.x, y: t.y, hasMobGroup: true,
          mobGroup: t.mobGroup });
      }
    }
  }
  assert.ok(tiles.length >= 1,
    'сценарий: группы рядом с спавном ЕСТЬ (логово скелетов (1,0))');
  assert.equal(G.findZoneCombat(px, py, tiles, new Map()), null,
    'спавн — зона-боя НЕТ (neutral 3×3 без триггера, не на тайле)');
});

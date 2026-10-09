// Задача 000173 (красная стадия): анимация движения группы мобов к
// персонажу при атаке на глобальной карте — e2e на ПОЛНОЙ цепочке
// <script> из index.html (vm-песочница, протокол
// tests/mob-zones-e2e.test.js: makeGl/makeContext2d/makeEl/seedSave/
// boot/drain/makeWalker/spyStartCombat/resolveCombatVictory).
//
// ТЗ (tasks/pending/000173.md): «На глобальной карте сделать анимацию
// движения моба к персонажу при атаке персонажа». Контракты:
// memory/000173-mob-chase.md (D1-D13) + memory/000173-mob-chase-anim.md
// (§1-§3). Механика «атака» на карте = успешный шаг, запускающий
// мир-бой через maybeStartCombat (зона 000135 или тайл группы).
//
// Мир: фолбэк (map.png в стабе ВСЕГДА onerror → G.generateSeedPixels,
// детерминированно). Спавн (0,0). Группы у спавна (видимый экран при
// zoom 80 — x∈[−9,8], y∈[−5,5]):
//   * (1,0) — g2 логово скелетов (neutral, 3×3, бой ТОЛЬКО на тайле);
//   * (2,3) — g4 паучье гнездо (territorial, 5×5: бой при ВХОДЕ В ЗОНУ);
//   * (5,−5) — g6 (aggressive), (−2,−4) — g2, (−7,0) — g3 — далеко от
//     маршрутов, но на экране: используются как «прочие группы» (MC0/
//     MC4) — ВСЕГДА на якорях своих тайлов.
//
// Д-ПРОТОКОЛ (помп кадров, отличает от frameAt «последний rAF»):
// combat-ui.js (000047) при открытии боевого оверлея запускает
// САМОРЕКУРСИВНЫЙ rAF-цикл tick в ТОЙ ЖЕ очереди, что мировой frame —
// «последний» колбэк не гарантированно мировой. После boot (до боя
// в очереди ровно один колбэк — мировой frame) ЗАХВАТИТЬ ссылку
// worldFn = h.raf[h.raf.length − 1] и далее кадровать ТОЛЬКО её.
// performance.now() в песочнице заморожен (NOW=1000) — все now явные,
// монотонные; время анимации — ТОЛЬКО аргумент кадра (D-RNG-1).
//
// Наблюдение позиции — ДВА канала (оба обязаны двигаться в унисон —
// «одна дробная точка на кадр для обоих слоёв», принцип 000033):
//   1. drawCalls canvas #sprites: drawImage спрайта группы (аскет
//      assets/sprites/mobs/…); экран → мир обратным проекциям формулы
//      toPt (worldToScreen): wx = cam.x + (sx + zoom*0.1 − W/2)/zoom,
//      wy = cam.y + (sy + zoom*0.15 − H/2)/zoom (алгебраически точно
//      до ulp; cam/zoom — из __game.state ПОСЛЕ кадра — тот же cam,
//      что использовался в draw кадра);
//   2. __game.state.mobCharge.pos — дробная точка ТАЙЛОВЫХ координат
//      (контракт D6).
//
// ЦЕЛЬ заряда ЗАМОРОЖЕНА на момент атаки (D4): зона-атака — тайл
// ИГРОКА (player.x/y); атака НА тайле группы — prevPos (тайл, с
// которого шагнул; расстояние 1). Дистанция считается ДО ЗАМОРОЖЕННОЙ
// цели, а не до «живой» точки рендера героя (герой сам глейдит
// 420 мс — дистанция до живой точки НЕ монотонна).
//
// RED (3 теста: MC1/MC2/MC3) падают осмысленно: спрайт группы
// КОНСТАНТНО на якоря тайла (проход 3 drawSprites — toPt(t.x, t.y)),
// __game.state.mobCharge — нет поля (поведения нет) — «моб не
// приближается к игроку», не синтаксически. Guards (MC0/MC4/MC5/MC6)
// — зелёные на обеих стадиях. Существующие тесты — БЕЗ ПРАВОК (D10):
// пины 000135 (seed/tile/terrain боя) и 000122 (формула якоря, число
// draw, порядок слоёв) повторно закреплены в MC1/MC3/MC4 — заряд не
// влияет на параметры startCombat (D2: бит-в-бит).

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
// Соль seed боя (main.js: G.hash2(x, y, 0x5eedc0de)) — пин бит-в-бит.
const SALT = 0x5eedc0de;
// Геометрия экрана (px): формулы в тесте и в drawSprites — те же
// операции; 1e-6 ловит любой реальный сдвиг, но не ulp-шум.
const EPS = 1e-6;
// Мир (тайлы): минимальный прогресс глейда за 50 мс при 1500 мс
// (D3) ≈ 0.006 тайла — допуск монотонности строго меньше.
const EPS_POS = 1e-3;
// Окно сэмплирования после шага-атаки: 14 кадров × 50 мс = 700 мс —
// строго меньше заряда 1500 мс (D3): глейд НЕ заканчивается в окне
// (p_max = 700/1500 ≈ 0.47 < 1).
const STEP_MS = 50;
const SAMPLES = 14;

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
    // Боевой оверлей создаёт canvas — без 2d-стаба startCombat в
    // песочнице падает (паттерн tests/main-visuals.test.js).
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

// --- localStorage-мок (паттерн tests/building-effects.test.js) ---

function makeStorage(seed) {
  const m = new Map();
  if (seed != null) m.set(SAVE_KEY, JSON.stringify(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
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
  return { sandbox, winListeners, raf, errors, storage, hud, spriteCanvas };
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

// --- Д-ПРОТОКОЛ: мировой frame по ССЫЛКЕ, не «последний rAF» ---

function captureWorldFn(h) {
  // После boot, до боя: в rAF-очереди ровно один колбэк — мировой
  // frame (main.js рекуряет с той же ссылкой на функцию).
  assert.equal(h.raf.length, 1,
    'сценарий: до боя в rAF-очереди ровно один колбэк (мировой frame)');
  return h.raf[0];
}

// Один мировой кадр с явным now; возвращает ТОЛЬКО вызовы кадра.
function pump(h, worldFn, now) {
  let idx = -1;
  for (let i = h.raf.length - 1; i >= 0; i--) {
    if (h.raf[i] === worldFn) { idx = i; break; }
  }
  assert.ok(idx >= 0, 'мировой frame в rAF-очереди (ссылка)');
  const n0 = h.spriteCanvas.drawCalls.length;
  h.raf[idx](now);
  return h.spriteCanvas.drawCalls.slice(n0);
}

// --- Ввод ---

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
// игрок не перешёл (stepMs ≤ 420 мс) → keyup). now — МОНОТОННЫЙ
// (закрытие w.now на тест; осадочные кадры — w.frame()). Возврат
// { now, calls } — now КАДРА, в котором шаг совершился (= T шага-
// атаки), calls — drawCalls того кадра.
function makeWalker(h, worldFn) {
  const g = h.sandbox.__game;
  const w = { now: NOW };
  w.walk = function (tx, ty) {
    const px = g.state.player.x, py = g.state.player.y;
    const dx = tx - px, dy = ty - py;
    assert.ok(Math.abs(dx) + Math.abs(dy) === 1,
      'шаг по соседнему тайлу (' + px + ',' + py + ')→(' + tx + ',' + ty + ')');
    const code = dx === 1 ? 'ArrowRight' : dx === -1 ? 'ArrowLeft'
      : dy === 1 ? 'ArrowDown' : 'ArrowUp';
    key(h, code);
    let guard = 0;
    let calls = [];
    do {
      w.now += 200;
      calls = pump(h, worldFn, w.now);
    } while ((g.state.player.x !== tx || g.state.player.y !== ty)
      && ++guard < 12);
    keyup(h, code);
    assert.ok(g.state.player.x === tx && g.state.player.y === ty,
      `сценарий: игрок не перешёл на (${tx},${ty}) за ${guard} кадров`);
    return { now: w.now, calls };
  };
  // Осадочный кадр (без ввода).
  w.frame = function () {
    w.now += 200;
    return pump(h, worldFn, w.now);
  };
  return w;
}

// --- SEED-ПИН: spy-обёртка G.combatUI.startCombat (контракт 000135)
// — бит-в-бит инвариант D2: параметры боя заряд НЕ меняет ---

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
// tests/main-visuals.test.js): Эфир 9999 + мобы 9999 → checkVictory →
// Space (finish → onEnd).
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

// --- Геометрия спрайтов (формулы drawSprites, проход 3 / toPt) ---

// Экранный якорь группы на тайле (формула 000122, бит-в-бит):
// worldToScreen(tx, ty) − (0.1·zoom, 0.15·zoom) — drawImage-аргументы.
function screenAnchor(G, tx, ty, cam, zoom) {
  const p = G.worldToScreen(tx, ty, cam.x, cam.y, zoom, VIEW_W, VIEW_H);
  return { x: p.x - zoom * 0.1, y: p.y - zoom * 0.15 };
}

// Обратная проекция drawImage-аргументов в МИРОВЫЕ (тайловые)
// координаты — алгебраически точно по тождествам worldToScreen:
// wx = cam.x + (sx + zoom*0.1 − W/2)/zoom; wy — с офсетом 0.15·zoom.
function screenToTile(sx, sy, cam, zoom) {
  return {
    x: cam.x + (sx + zoom * 0.1 - VIEW_W / 2) / zoom,
    y: cam.y + (sy + zoom * 0.15 - VIEW_H / 2) / zoom,
  };
}

// drawImage-вызовы спрайтов групп мобов (по метке __asset).
function mobDraws(calls) {
  return calls.filter((c) => c[0] === 'drawImage'
    && c[1][0]
    && typeof c[1][0].__asset === 'string'
    && c[1][0].__asset.startsWith('assets/sprites/mobs/'));
}

// Префикс ассета группы (каталог G.mobFrames): 'assets/sprites/mobs/…_'.
function mobPrefix(G, gid) {
  const f = G.mobFrames(gid);
  assert.ok(f && f.length, 'сценарий: mobFrames(' + gid + ') не пуст');
  return f[0].replace(/_\d+\.svg$/, '_');
}

// Ровно ОДИН draw спрайта с префиксом (уникальный вид в видимом
// диапазоне: один тайл данного вида группы на экране).
function findOne(calls, prefix, label) {
  const ds = calls.filter((c) => c[0] === 'drawImage'
    && c[1][0]
    && c[1][0].__asset.startsWith(prefix));
  assert.equal(ds.length, 1, label + ': ровно один draw спрайта ' + prefix);
  return ds[0];
}

// Видимые тайлы групп — тот же пересчёт, что frameTiles (buildFrame):
// G.visibleTileRange (маржа 2) × tileAt (чистый, тот же мир).
function visibleGroupTiles(G, myMap, cam, zoom) {
  const range = G.visibleTileRange(cam.x, cam.y, VIEW_W, VIEW_H, zoom);
  const out = [];
  for (let ty = range.y0; ty <= range.y1; ty++) {
    for (let tx = range.x0; tx <= range.x1; tx++) {
      const t = myMap.tileAt(tx, ty);
      if (t.hasMobGroup) out.push(t);
    }
  }
  return out;
}

// GUARD-хелпер: число mob-draw = число видимых групп (ни шлейфа, ни
// двойного draw); каждая НЕ-заряжающаяся группа — РОВНО на якоря
// своего тайла (формула 000122). opts.hidden — ключи 'x,y' повержен-
// ных групп (скрыты, 000122); opts.skipKey — ключ заряжающейся группы
// (её позиция ассертится отдельно).
function assertGroupsAtAnchors(G, myMap, calls, cam, zoom, label, opts) {
  opts = opts || {};
  const tiles = visibleGroupTiles(G, myMap, cam, zoom)
    .filter((t) => !(opts.hidden && opts.hidden.indexOf(t.x + ',' + t.y) >= 0));
  const mobs = mobDraws(calls);
  assert.equal(mobs.length, tiles.length,
    label + ': число mob-draw == число видимых групп (' + mobs.length
    + ' vs ' + tiles.length + ')');
  for (const t of tiles) {
    if (opts.skipKey && t.x + ',' + t.y === opts.skipKey) continue;
    const a = screenAnchor(G, t.x, t.y, cam, zoom);
    const hit = mobs.filter((c) =>
      Math.abs(c[1][1] - a.x) < EPS && Math.abs(c[1][2] - a.y) < EPS);
    assert.equal(hit.length, 1,
      label + ': группа (' + t.x + ',' + t.y + ') — ровно на якоря тайла '
      + '(формула 000122)');
  }
}

// Порядок слоёв (000039): ВСЕ draw мобов — ДО любого draw Флогистона.
function assertMobsBelowPhlogiston(calls, label) {
  let lastMob = -1;
  let firstPhlo = calls.length;
  calls.forEach((c, i) => {
    if (c[0] !== 'drawImage' || !c[1][0]
        || typeof c[1][0].__asset !== 'string') return;
    if (c[1][0].__asset.startsWith('assets/sprites/mobs/')) lastMob = i;
    else if (c[1][0].__asset.startsWith('assets/sprites/phlogiston/')
        && i < firstPhlo) firstPhlo = i;
  });
  assert.ok(lastMob >= 0 && firstPhlo < calls.length
    && lastMob < firstPhlo,
    label + ': порядок слоёв «мобы < Флогистон»');
}

// Дистанция (евклидова, тайлы) до точки.
const dist = (p, x, y) => Math.hypot(p.x - x, p.y - y);

// Хост-копия точки {x, y} из песочницы: deepStrictEqual (strict)
// учитывает ПРОТОТИП, а объекты, созданные в VM-контексте, имеют
// чужой Object.prototype — сравнение с хост-литералом падало бы на
// артефакте realms, а не на значениях (паттерн «{ x: st.player.x,
// y: st.player.y }» — tests/main-visuals.test.js).
const hostPt = (p) => ({ x: p.x, y: p.y });

// --- Общие сценарии ---

// Зона-атака: (0,0)→(0,1) — вход в 5×5-зону паучьего (2,3) (пин Z5).
// Возврат { h, G, g, myMap, T } — T = now кадра атаки.
async function scenarioZoneAttack() {
  const h = await boot(null);
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  // Спавн (0,0): === 0 (findSpawn может дать -0; Object.is(-0, 0) —
  // false, strictEqual бы упал на артефакте знака нуля).
  assert.ok(g.state.player.x === 0 && g.state.player.y === 0,
    'сценарий: спавн (0,0)');
  assert.equal(myMap.tileAt(2, 3).mobGroup, 4,
    'сценарий: паучье гнездо (2,3) — territorial 5×5');
  assert.ok(myMap.tileAt(0, 1).passable
    && !myMap.tileAt(0, 1).hasMobGroup,
    'сценарий: (0,1) — в зоне, не тайл группы');
  const worldFn = captureWorldFn(h);
  const cap = spyStartCombat(G);
  const walk = makeWalker(h, worldFn);
  const { now: T, calls } = walk.walk(0, 1); // ВХОД В ЗОНУ → бой на шаге
  assert.equal(G.combatUI.isActive(), true,
    'шаг входа в зону — бой начался (бит-в-бит, 000135)');
  assert.equal(cap.calls, 1, 'бой начат РОВНО 1× за шаг');
  assert.equal(cap.opts.seed, G.hash2(2, 3, SALT),
    'seed zone-боя — от тайла ГРУППЫ (бит-в-бит, заряд не влияет)');
  assert.equal(cap.opts.tile.x, 2, 'opts.tile — тайл группы (x)');
  assert.equal(cap.opts.tile.y, 3, 'opts.tile — тайл группы (y)');
  assert.equal(cap.opts.terrain, myMap.tileAt(2, 3).terrain,
    'opts.terrain — terrain тайла ГРУППЫ (бит-в-бит)');
  return { h, G, g, myMap, worldFn, T, atkCalls: calls };
}

// Сэмплирование окна после шага-атаки: 14 кадров × 50 мс (700 мс).
// Возврат массива { x, y, mc, calls, cam, zoom } — мировые (тайловые)
// координаты draw спрайта (pickDraw) + снапшот state.mobCharge кадра.
function sampleWindow(h, G, g, myMap, worldFn, T, pickDraw, label) {
  const seq = [];
  for (let k = 1; k <= SAMPLES; k++) {
    const now = T + STEP_MS * k;
    const calls = pump(h, worldFn, now);
    const st = g.state;
    const d = pickDraw(calls, st.cam, st.zoom, label + ' кадр ' + k);
    const p = screenToTile(d[1][1], d[1][2], st.cam, st.zoom);
    seq.push({ k, now, x: p.x, y: p.y, calls, cam: st.cam, zoom: st.zoom,
      mc: g.state.mobCharge });
  }
  return seq;
}

// --- MC1 (RED). Зона-атака: позиция спрайта атакованной группы
// движется к игроку ПО КADRAM; два слоя — одна дробная точка; кадр
// атаки — якорь (формула 000122), середина окна — дробная точка
// (глейд, не телепорт); победа — очистка + скрытие (000122) ---

test('MC1. e2e: атака (зона 2,3) — позиция моба приближается к игроку по кадрам; глейд, не скачок; два слоя — одна точка (задача 000173)', async () => {
  const { h, G, g, myMap, worldFn, T, atkCalls } = await scenarioZoneAttack();
  const spPrefix = mobPrefix(G, 4); // '…/spider_' — один тайл вида на экране
  // Кадр атаки: спрайт группы РОВНО на якоря тайла (формула 000122 —
  // старт глейда p=0), размер draw не изменился (1.2×zoom).
  let st = g.state;
  const aFrom = screenAnchor(G, 2, 3, st.cam, st.zoom);
  const sp0 = findOne(atkCalls, spPrefix, 'кадр атаки');
  assert.ok(Math.abs(sp0[1][1] - aFrom.x) < EPS
    && Math.abs(sp0[1][2] - aFrom.y) < EPS,
    'кадр атаки: спрайт группы на якоря тайла (2,3) (формула 000122)');
  assert.ok(Math.abs(sp0[1][3] - st.zoom * 1.2) < EPS
    && Math.abs(sp0[1][4] - st.zoom * 1.2) < EPS,
    'кадр атаки: размер draw не изменился (1.2×zoom)');
  // Окно: 14 кадров × 50 мс после атаки.
  const seq = sampleWindow(h, G, g, myMap, worldFn, T,
    (calls) => findOne(calls, spPrefix, 'окно'), 'окно');
  // КРАСНЫЙ (ядро ТЗ): дистанция до игрока (0,1) СТРОГО убывает
  // кадр за кадром — «моб приближается к персонажу».
  for (let k = 1; k < seq.length; k++) {
    const d0 = dist(seq[k - 1], 0, 1);
    const d1 = dist(seq[k], 0, 1);
    assert.ok(d1 < d0 - EPS_POS,
      'моб не приближается к игроку (0,1): дистанция кадр ' + k + '→'
      + (k + 1) + ' ' + d0.toFixed(4) + ' → ' + d1.toFixed(4)
      + ' (не убывает) — анимация рывка группы к игроку не '
      + 'реализована (задача 000173)');
  }
  assert.ok(dist(seq[seq.length - 1], 0, 1) < 0.75 * dist(seq[0], 0, 1),
    'к концу окна (~700 мс из 1500) группа заметно приблизилась к игроку');
  assert.ok(dist(seq[0], 0, 1) !== dist(seq[seq.length - 1], 0, 1),
    'сдвиг есть: позиция начала и конца окна различны');
  // Середина окна (k=7, p≈0.23): спрайт НЕ на якорях from/to —
  // дробная точка глейда (не телепорт/снап), размер не изменился.
  const mid = seq[6];
  const aF = screenAnchor(G, 2, 3, mid.cam, mid.zoom);
  const aT = screenAnchor(G, 0, 1, mid.cam, mid.zoom);
  const dm = findOne(mid.calls, spPrefix, 'середина окна');
  const offF = Math.hypot(dm[1][1] - aF.x, dm[1][2] - aF.y);
  const offT = Math.hypot(dm[1][1] - aT.x, dm[1][2] - aT.y);
  assert.ok(offF > 0.05 * mid.zoom && offT > 0.05 * mid.zoom,
    'середина окна: спрайт НЕ на якорях from/to (глейд, не телепорт): '
    + 'offFrom=' + offF.toFixed(2) + ' px, offTo=' + offT.toFixed(2) + ' px');
  assert.ok(Math.abs(dm[1][3] - mid.zoom * 1.2) < EPS
    && Math.abs(dm[1][4] - mid.zoom * 1.2) < EPS,
    'середина окна: размер draw не изменился (1.2×zoom)');
  // State-канал (D6): заряд активен, ключ/старт/цель верны; pos —
  // та же дробная точка, что спрайт (принцип 000033), тайловые коорд.
  for (const s of seq) {
    assert.ok(s.mc && s.mc.pos,
      'кадр k=' + s.k + ': __game.state.mobCharge и .pos активны в бою');
    assert.ok(Math.abs(s.mc.pos.x - s.x) < 1e-6
      && Math.abs(s.mc.pos.y - s.y) < 1e-6,
      'кадр k=' + s.k + ': два слоя — одна дробная точка (000033): '
      + 'state ' + s.mc.pos.x.toFixed(4) + ',' + s.mc.pos.y.toFixed(4)
      + ' vs спрайт ' + s.x.toFixed(4) + ',' + s.y.toFixed(4));
  }
  const mc = seq[seq.length - 1].mc;
  assert.equal(mc.key, '2,3', 'ключ заряда — тайл атакованной группы');
  assert.deepEqual(hostPt(mc.from), { x: 2, y: 3 },
    'старт заряда — тайл группы');
  assert.deepEqual(hostPt(mc.to), { x: 0, y: 1 },
    'цель заряда — тайл игрока на момент атаки (зона: player.x/y)');
  // Очистка: победа → onEnd → заряд сброшен, спрайт скрыт (000122),
  // прочие группы — на якорях.
  resolveCombatVictory(G, G.combatUI.current(), 'zone-бой');
  assert.ok(g.state.mobCharge == null,
    'после onEnd (победа) заряд сброшен (mobCharge == null)');
  const calls = pump(h, worldFn, T + STEP_MS * (SAMPLES + 1));
  st = g.state;
  assert.equal(mobDraws(calls).filter((c) => c[1][0].__asset.startsWith(spPrefix)).length,
    0, 'после победы спрайт группы скрыт (000122, defeatedAt)');
  assertGroupsAtAnchors(G, myMap, calls, st.cam, st.zoom, 'после победы',
    { hidden: ['2,3'] });
});

// --- MC2 (RED). Погоня монотонна и идёт по МНОЖЕСТВУ кадров: без
// «прыжка в конец за один кадр» и без осцилляции; глейд не заканчи-
// вается в окне (≥ 2 кадра строго между старт/целью) ---

test('MC2. e2e: погоня монотонна и занимает несколько кадров (≥ 3 строгого сближения, ≥ 2 кадра внутри отрезка) — не телепорт (задача 000173)', async () => {
  const { h, G, g, myMap, worldFn, T } = await scenarioZoneAttack();
  const spPrefix = mobPrefix(G, 4);
  const seq = sampleWindow(h, G, g, myMap, worldFn, T,
    (calls) => findOne(calls, spPrefix, 'окно'), 'окно');
  const d = seq.map((s) => dist(s, 0, 1));
  // (а) Монотонность: дистанция до цели НЕ РАСТЁТ (с допуском на
  // проекцию) — без осцилляции.
  for (let k = 1; k < seq.length; k++) {
    assert.ok(d[k] <= d[k - 1] + EPS_POS,
      'кадр ' + k + '→' + (k + 1) + ': дистанция до игрока РАСТЕТ '
      + '(' + d[k - 1].toFixed(4) + ' → ' + d[k].toFixed(4)
      + ') — осцилляция/откат (глейд должен быть монотонным)');
  }
  // (б) ≥ 3 СТРОГИХ сближения в окне — без «прыжка в конец за один
  // кадр» (мгновенный снап дал бы ≤ 1).
  let strict = 0;
  for (let k = 1; k < seq.length; k++) {
    if (d[k] < d[k - 1] - EPS_POS) strict += 1;
  }
  assert.ok(strict >= 3,
    'строгого сближения по кадрам: ' + strict + ' < 3 — позиция моба '
    + 'константна (якорь тайла) — анимация рывка к игроку не '
    + 'реализована (задача 000173)');
  // (в) ≥ 2 кадра с точкой СТРОГО МЕЖДУ старт/целью — глейд ещё не
  // закончен (не «снап на цель» в первый кадр).
  let interior = 0;
  for (const s of seq) {
    const atFrom = Math.abs(s.x - 2) < EPS_POS && Math.abs(s.y - 3) < EPS_POS;
    const atTo = Math.abs(s.x - 0) < EPS_POS && Math.abs(s.y - 1) < EPS_POS;
    if (!atFrom && !atTo) interior += 1;
  }
  assert.ok(interior >= 2,
    'кадров с позицией строго между старт (2,3) и целью (0,1): '
    + interior + ' < 2 — глейд не идёт по множеству кадров');
  // State-канал: заряд активен; pos — монотонна и совпадает со
  // спрайтом (принцип 000033).
  const mc0 = seq[0].mc;
  assert.ok(mc0 && mc0.pos,
    '__game.state.mobCharge — заряд активен в бою (задача 000173)');
  assert.equal(mc0.key, '2,3', 'ключ заряда — тайл группы');
  assert.deepEqual(hostPt(mc0.from), { x: 2, y: 3 },
    'старт заряда — тайл группы');
  assert.deepEqual(hostPt(mc0.to), { x: 0, y: 1 }, 'цель — тайл игрока (зона)');
  for (let k = 1; k < seq.length; k++) {
    assert.ok(seq[k].mc && seq[k].mc.pos, 'кадр k=' + k + ': mobCharge.pos');
    const p0 = seq[k - 1].mc.pos, p1 = seq[k].mc.pos;
    assert.ok(Math.hypot(p1.x - 0, p1.y - 1)
        <= Math.hypot(p0.x - 0, p0.y - 1) + EPS_POS,
      'state.pos: дистанция до цели не растёт (кадр ' + k + ')');
  }
  resolveCombatVictory(G, G.combatUI.current(), 'zone-бой');
});

// --- MC3 (RED). Атака НА тайле группы (neutral g2 (1,0)): цель
// заряда — prevPos (тайл, с которого шагнул персонаж), а НЕ тайл
// группы (от него дистанция 0 — фича была бы невидима в самом
// частом случае); позиция всё равно приближается к (0,0) по кадрам
// (пин Z3b: seed/tile боя — без изменений) ---

test('MC3. e2e: атака НА тайле (1,0) — моб приближается к prevPos (0,0) персонажа по кадрам; цель — тайл, с которого шагнул (задача 000173)', async () => {
  const h = await boot(null);
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  assert.ok(g.state.player.x === 0 && g.state.player.y === 0,
    'сценарий: спавн (0,0)');
  assert.equal(myMap.tileAt(1, 0).mobGroup, 2,
    'сценарий: логово скелетов (1,0) — neutral (бой только на тайле)');
  assert.ok(myMap.tileAt(1, 0).passable, 'сценарий: (1,0) проходим');
  const worldFn = captureWorldFn(h);
  const cap = spyStartCombat(G);
  const walk = makeWalker(h, worldFn);
  const { now: T } = walk.walk(1, 0); // шаг на тайл группы → бой на шаге
  assert.equal(G.combatUI.isActive(), true, 'бой на тайле начался');
  assert.equal(cap.calls, 1, 'бой РОВНО 1× за шаг');
  assert.equal(cap.opts.seed, G.hash2(1, 0, SALT),
    'seed на тайле — без изменений (пин Z3b; заряд не влияет)');
  assert.equal(cap.opts.tile.x, 1, 'opts.tile — тайл группы (x)');
  assert.equal(cap.opts.tile.y, 0, 'opts.tile — тайл группы (y)');
  // «Атакованный» скелет — тот draw вида skeleton_, что НЕ на якоря
  // второго скелетового (−2,−4) (оба вида — один каталог-ассет).
  const skPrefix = mobPrefix(G, 2);
  const pickAttacked = (calls, cam, zoom, label) => {
    const ds = calls.filter((c) => c[0] === 'drawImage'
      && c[1][0] && c[1][0].__asset.startsWith(skPrefix));
    const other = screenAnchor(G, -2, -4, cam, zoom);
    const hit = ds.filter((c) =>
      Math.abs(c[1][1] - other.x) > EPS
      || Math.abs(c[1][2] - other.y) > EPS);
    assert.equal(hit.length, 1,
      label + ': ровно один draw «атакованного» скелета (1,0)');
    return hit[0];
  };
  const seq = sampleWindow(h, G, g, myMap, worldFn, T,
    (calls, cam, zoom, label) => pickAttacked(calls, cam, zoom, label),
    'окно');
  // КРАСНЫЙ: дистанция до ЗАМОРОЖЕННОЙ цели (0,0) = prevPos строго
  // убывает по кадрам (НЕ до живой точки рендера героя — она едет
  // (0,0)→(1,0) за 420 мс и дистанция до неё не монотонна).
  for (let k = 1; k < seq.length; k++) {
    const d0 = dist(seq[k - 1], 0, 0);
    const d1 = dist(seq[k], 0, 0);
    assert.ok(d1 < d0 - EPS_POS,
      'моб не приближается к тайлу персонажа (0,0) при атаке НА '
      + 'тайле: дистанция кадр ' + k + '→' + (k + 1) + ' '
      + d0.toFixed(4) + ' → ' + d1.toFixed(4) + ' — анимация рывка '
      + 'группы к игроку не реализована (задача 000173)');
  }
  assert.ok(dist(seq[seq.length - 1], 0, 0) < 0.75 * dist(seq[0], 0, 0),
    'к концу окна группа заметно приблизилась к (0,0)');
  // State-канал: цель — prevPos, а не тайл группы (от него — 0).
  const mc = seq[seq.length - 1].mc;
  assert.ok(mc && mc.pos,
    '__game.state.mobCharge — заряд активен в бою (задача 000173)');
  assert.equal(mc.key, '1,0', 'ключ заряда — тайл группы (1,0)');
  assert.deepEqual(hostPt(mc.from), { x: 1, y: 0 },
    'старт заряда — тайл группы');
  assert.deepEqual(hostPt(mc.to), { x: 0, y: 0 },
    'цель заряда — prevPos (тайл, с которого шагнул персонаж), а не '
    + 'тайл группы (от него дистанция 0 — фича невидима)');
  for (const s of seq) {
    assert.ok(s.mc && s.mc.pos, 'кадр k=' + s.k + ': mobCharge.pos');
    assert.ok(Math.abs(s.mc.pos.x - s.x) < 1e-6
      && Math.abs(s.mc.pos.y - s.y) < 1e-6,
      'кадр k=' + s.k + ': два слоя — одна дробная точка (000033)');
    assertGroupsAtAnchors(G, myMap, s.calls, s.cam, s.zoom,
      'окно кадр ' + s.k, { skipKey: (s.mc && s.mc.key) || '1,0' });
  }
  resolveCombatVictory(G, G.combatUI.current(), 'бой на тайле');
});

// --- MC0 (GUARD, зелёный с рождения). Погоня не начинается РАНЬШЕ
// атаки: во ВСЕХ кадрах нейтральной ходьбы (до шага-атаки) все
// видимые группы ровно на якорях и заряда нет ---

test('MC0. e2e: до шага-атаки (нейтральная ходьба) группы на якорях, заряда нет — погоня не стартовала раньше атаки (задача 000173)', async () => {
  const h = await boot(null);
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  assert.ok(g.state.player.x === 0 && g.state.player.y === 0,
    'сценарий: спавн (0,0)');
  // Маршрут: (0,0)→(0,−1)→(1,−1) — нейтральные тайлы (вне всех зон,
  // не тайлы групп), затем (1,−1)→(1,0) — шаг-атака (тайл g2).
  for (const [tx, ty] of [[0, -1], [1, -1], [1, 0]]) {
    assert.ok(myMap.tileAt(tx, ty).passable,
      'сценарий: (' + tx + ',' + ty + ') проходим');
  }
  assert.ok(!myMap.tileAt(0, -1).hasMobGroup
    && !myMap.tileAt(1, -1).hasMobGroup,
    'сценарий: (0,−1)/(1,−1) — не тайлы групп');
  assert.equal(myMap.tileAt(1, 0).mobGroup, 2,
    'сценарий: (1,0) — логово скелетов (шаг-атака)');
  const worldFn = captureWorldFn(h);
  const walk = makeWalker(h, worldFn);
  // Нейтральные шаги: кадр шага + 2 осадочных кадра — ВСЕ группы на
  // якорях, боя нет, заряда нет.
  for (const [tx, ty] of [[0, -1], [1, -1]]) {
    const { calls } = walk.walk(tx, ty);
    assert.equal(G.combatUI.isActive(), false,
      'нейтральный шаг (' + tx + ',' + ty + ') — боя нет');
    let st = g.state;
    assertGroupsAtAnchors(G, myMap, calls, st.cam, st.zoom,
      'нейтральный шаг (' + tx + ',' + ty + ')');
    assert.ok(g.state.mobCharge == null,
      'до шага-атаки заряда нет (' + tx + ',' + ty + ')');
    for (let i = 1; i <= 2; i++) {
      const c = walk.frame();
      assert.equal(G.combatUI.isActive(), false,
        'осадочный кадр ' + i + ' — боя нет');
      st = g.state;
      assertGroupsAtAnchors(G, myMap, c, st.cam, st.zoom,
        'осадочный кадр ' + i + ' после (' + tx + ',' + ty + ')');
      assert.ok(g.state.mobCharge == null,
        'до шага-атаки заряда нет (осадочный кадр ' + i + ')');
    }
  }
  // Шаг-атака (1,−1)→(1,0): сценарий живой — бой начался (заряд в
  // этом тесте НЕ ассертится: guard только «не раньше атаки»).
  walk.walk(1, 0);
  assert.equal(G.combatUI.isActive(), true,
    'шаг на тайл группы — бой начался (сценарий живой)');
});

// --- MC4 (GUARD, зелёный с рождения). Изоляция: после атаки на
// (2,3) ВСЕ прочие видимые группы — на своих якорях; число mob-draw
// не изменилось; порядок слоёв «мобы < Флогистон» сохранён ---

test('MC4. e2e: изоляция — прочие группы на якорях, число mob-draw и порядок слоёв не изменились (задача 000173)', async () => {
  const { h, G, g, myMap, worldFn, T, atkCalls } = await scenarioZoneAttack();
  const st0 = g.state;
  // Кадр атаки: число draw = число видимых групп, порядок слоёв.
  assertGroupsAtAnchors(G, myMap, atkCalls, st0.cam, st0.zoom,
    'кадр атаки', { skipKey: null });
  assertMobsBelowPhlogiston(atkCalls, 'кадр атаки');
  // Каждое окно: прочее — на якорях; заряжающаяся (ключ из state, в
  // фолбэке — null) пропускается из якорного ассерта, но УЧИТЫВАЕТСЯ
  // в числе draw (один draw на группу — ни шлейфа, ни двойного draw).
  for (let k = 1; k <= SAMPLES; k++) {
    const calls = pump(h, worldFn, T + STEP_MS * k);
    const st = g.state;
    const mc = g.state.mobCharge;
    assertGroupsAtAnchors(G, myMap, calls, st.cam, st.zoom,
      'окно кадр ' + k, { skipKey: (mc && mc.key) || null });
    assertMobsBelowPhlogiston(calls, 'окно кадр ' + k);
  }
  resolveCombatVictory(G, G.combatUI.current(), 'zone-бой');
});

// --- MC5 (GUARD, зелёный с рождения). Очистка заряда по onEnd:
// победа — заряд сброшен + спрайт скрыт (000122); побег — заряд
// сброшен, игрок на prevPos, спрайт группы снова НА ЯКОРЯ (нет
// «залипшего» смещения) ---

test('MC5. e2e: onEnd (победа/побег) — заряд сброшен; победа — спрайт скрыт (000122), побег — спрайт на якоря (задача 000173)', async () => {
  // Часть 1: победа.
  {
    const { h, G, g, myMap, worldFn, T } = await scenarioZoneAttack();
    const spPrefix = mobPrefix(G, 4);
    resolveCombatVictory(G, G.combatUI.current(), 'zone-бой (победа)');
    assert.ok(g.state.mobCharge == null,
      'после onEnd (победа) заряд сброшен (mobCharge == null)');
    const calls = pump(h, worldFn, T + 200);
    const st = g.state;
    assert.equal(mobDraws(calls).filter((c) => c[1][0].__asset.startsWith(spPrefix)).length,
      0, 'после победы спрайт группы скрыт (000122, defeatedAt)');
    assertGroupsAtAnchors(G, myMap, calls, st.cam, st.zoom, 'после победы',
      { hidden: ['2,3'] });
  }
  // Часть 2: побег (результат 'fled': игрок возвращается на prevPos,
  // группа жива).
  {
    const { h, G, g, myMap, worldFn, T } = await scenarioZoneAttack();
    const spPrefix = mobPrefix(G, 4);
    const c = G.combatUI.current();
    // 000168: в очереди хода союзники (Эфир) и мобы ДО игрока — дойти
    // до хода игрока через endTurn = ходы мобов (недетерминированная
    // для теста смерть). ТЕСТ-МУТАЦИЯ очереди боя (паттерн Z8 —
    // мутация tileCache): переходим сразу к слоту игрока; гейты
    // flee() (activeUnitId === 'player' + checkTurn phase === 'player')
    // проходят; геймплейные механизмы не трогаются.
    c.turnIndex = c.turnOrder.indexOf('player');
    c.phase = 'player';
    c._rng = () => 0.0; // бросок < шанса — побег точно удался
    const r = c.flee();
    assert.ok(r.fled, 'побег удался (c.flee)');
    assert.equal(c.result.outcome, 'fled', 'результат боя — fled');
    G.combatUI.handleCode('Space');
    assert.equal(G.combatUI.isActive(), false,
      'панель закрыта (Space → finish → onEnd)');
    assert.ok(g.state.mobCharge == null,
      'после onEnd (побег) заряд сброшен (mobCharge == null)');
    const calls = pump(h, worldFn, T + 200);
    const st = g.state;
    assert.ok(g.state.player.x === 0 && g.state.player.y === 0,
      'побег: игрок на prevPos (0,0)');
    const d = findOne(calls, spPrefix, 'после побега');
    const a = screenAnchor(G, 2, 3, st.cam, st.zoom);
    assert.ok(Math.abs(d[1][1] - a.x) < EPS
      && Math.abs(d[1][2] - a.y) < EPS,
      'после побега спрайт группы снова НА ЯКОРЯ (2,3) — нет '
      + '«залипшего» смещения');
    assertGroupsAtAnchors(G, myMap, calls, st.cam, st.zoom, 'после побега');
  }
});

// --- MC6 (GUARD, зелёный с рождения). Детерминизм: два
// независимых boot одного сценария (зона-атака) → идентичные
// последовательности позиций спрайта группы (drawImage-аргументы
// по кадрам, EPS 1e-9) — в погоне ноль RNG, время — только
// аргумент кадра (D-RNG-1) ---

test('MC6. e2e: детерминизм — два boot, одна последовательность позиций моба (задача 000173)', async () => {
  const runs = [];
  for (let run = 0; run < 2; run++) {
    const { h, G, worldFn, T } = await scenarioZoneAttack();
    const spPrefix = mobPrefix(G, 4);
    const draws = [];
    for (let k = 1; k <= SAMPLES; k++) {
      const calls = pump(h, worldFn, T + STEP_MS * k);
      const d = findOne(calls, spPrefix, 'run ' + run + ' кадр ' + k);
      draws.push([d[1][1], d[1][2], d[1][3], d[1][4]]);
    }
    runs.push(draws);
  }
  assert.equal(runs[0].length, SAMPLES, 'окно: ' + SAMPLES + ' кадров');
  for (let k = 0; k < SAMPLES; k++) {
    for (let j = 0; j < 4; j++) {
      assert.ok(Math.abs(runs[0][k][j] - runs[1][k][j]) < 1e-9,
        'кадр ' + (k + 1) + ': draw моба идентичен между двумя boot '
        + '(аргумент ' + j + ': ' + runs[0][k][j] + ' vs '
        + runs[1][k][j] + ') — детерминизм (ноль RNG, время — аргумент кадра)');
    }
  }
});

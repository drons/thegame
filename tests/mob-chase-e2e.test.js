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
// 000183 (MC9): опциональная запись bufferData (Float32Array вершин
// buildFrame) и drawArrays (count) в glCalls — анализ WebGL-фолбэк-
// слоя по вершинам (паттерн tests/global-map-draw.test.js).

function makeGl(glCalls) {
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
  gl.bufferData = (target, data, usage) => {
    if (glCalls) glCalls.push({ fn: 'bufferData', data });
  };
  gl.vertexAttribPointer = noop;
  gl.viewport = noop;
  gl.clearColor = noop;
  gl.clear = noop;
  gl.uniformMatrix4fv = noop;
  gl.drawArrays = (mode, first, count) => {
    if (glCalls) glCalls.push({ fn: 'drawArrays', count });
  };
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

function bootSandbox(seed, reject) {
  const winListeners = {};
  const raf = [];
  const errors = [];
  // 000183 (MC9): вершинные вызовы WebGL-стаба (bufferData/drawArrays)
  // — анализ фолбэк-слоя buildFrame (паттерн global-map-draw).
  const glCalls = [];
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
  // #game — WebGL (без него main.js уходит в фолбэк-ветку);
  // #sprites — 2d со спаем.
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl(glCalls) : makeContext2d(gameCanvas));
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
  // микротаск. 000183 (MC9): reject(path) — предикат «падающих»
  // ассетов (пер-элементный фолбэк-сценарий).
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
          const failed = v === 'assets/map.png'
            || (reject != null && reject(v));
          if (failed) {
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
  return { sandbox, winListeners, raf, errors, storage, hud,
    spriteCanvas, glCalls };
}

// Промывка микротасков (загрузки Image + loadMapPixels().then: карта,
// спавн/restore, requestAnimationFrame).
const drain = () => new Promise((r) => setImmediate(r));

async function boot(seed, reject) {
  const h = bootSandbox(seed, reject);
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

// =====================================================================
// 000183: пины задекларированных гардов (ретро-20261010) —
// memory/000183-guard-pins-abyss-boss.md (§MC7-MC12).
// =====================================================================

// --- WebGL-фолбэк-слой (MC9): вершины buildFrame из glCalls ---
// bufferData — Float32Array [x, y, r, g, b, a] × N вершин.
const MOB_COLOR = [0.85, 0.30, 0.25]; // fallback-палитра src/main.js

function glVerts(h) {
  for (const c of h.glCalls) {
    if (c.fn !== 'bufferData') continue;
    const d = c.data;
    if (!d || d.length === 0) return [];
    const out = [];
    for (let i = 0; i < d.length; i += 6) {
      out.push([d[i], d[i + 1], d[i + 2], d[i + 3], d[i + 4], d[i + 5]]);
    }
    return out;
  }
  return [];
}

function glColorVerts(h, color) {
  return glVerts(h).filter((v) =>
    Math.abs(v[2] - color[0]) < 1e-6
    && Math.abs(v[3] - color[1]) < 1e-6
    && Math.abs(v[4] - color[2]) < 1e-6);
}

// --- MC7 (GUARD, деградация D8). G.createMover отсутствует: бой
// стартует бит-в-бит, заряда НЕТ, спрайт группы на якорях (рендер
// бит-в-бит как до фичи) ---

test('MC7. e2e: деградация — нет G.createMover: бой бит-в-бит, заряда нет, спрайт на якорях (задача 000183)', async () => {
  const h = await boot(null);
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  assert.ok(g.state.player.x === 0 && g.state.player.y === 0,
    'сценарий: спавн (0,0)');
  assert.equal(myMap.tileAt(2, 3).mobGroup, 4,
    'сценарий: паучье гнездо (2,3)');
  const worldFn = captureWorldFn(h);
  const cap = spyStartCombat(G);
  const walk = makeWalker(h, worldFn);
  // D8: мувер заряда недоступен (мувер героя создан при загрузке —
  // движение персонажа не страдает).
  delete G.createMover;
  const { now: T, calls } = walk.walk(0, 1);
  assert.equal(G.combatUI.isActive(), true,
    'деградация: бой начался (бит-в-бит)');
  assert.equal(cap.calls, 1, 'бой начат РОВНО 1× за шаг');
  assert.equal(cap.opts.seed, G.hash2(2, 3, SALT),
    'seed — бит-в-бит (D2: деградация не меняет параметры боя)');
  assert.equal(cap.opts.tile.x, 2, 'opts.tile (x) — бит-в-бит');
  assert.equal(cap.opts.tile.y, 3, 'opts.tile (y) — бит-в-бит');
  assert.equal(cap.opts.terrain, myMap.tileAt(2, 3).terrain,
    'terrain — бит-в-бит (D2)');
  assert.ok(g.state.mobCharge == null,
    'деградация: заряда нет (тихий guard по G.createMover)');
  const spPrefix = mobPrefix(G, 4);
  let st = g.state;
  const a0 = screenAnchor(G, 2, 3, st.cam, st.zoom);
  const d0 = findOne(calls, spPrefix, 'кадр атаки');
  assert.ok(Math.abs(d0[1][1] - a0.x) < EPS
    && Math.abs(d0[1][2] - a0.y) < EPS,
    'кадр атаки: спрайт на якоря тайла (рендер бит-в-бит)');
  for (let k = 1; k <= SAMPLES; k++) {
    const c = pump(h, worldFn, T + STEP_MS * k);
    st = g.state;
    assert.ok(g.state.mobCharge == null,
      'окно кадр ' + k + ': заряда нет (деградация D8)');
    const a = screenAnchor(G, 2, 3, st.cam, st.zoom);
    const d = findOne(c, spPrefix, 'окно кадр ' + k);
    assert.ok(Math.abs(d[1][1] - a.x) < EPS
      && Math.abs(d[1][2] - a.y) < EPS,
      'окно кадр ' + k + ': спрайт на якорях (глейда нет)');
    assertGroupsAtAnchors(G, myMap, c, st.cam, st.zoom,
      'окно кадр ' + k);
  }
  resolveCombatVictory(G, G.combatUI.current(), 'zone-бой (деградация)');
  assert.ok(g.state.mobCharge == null, 'после onEnd: заряда нет');
});

// --- MC8 (GUARD, D4 from == to). Спавн/сейв на тайле группы: цель
// заряда == тайл группы (prevPos снапнут на позицию сейва) → заряда
// НЕТ, рендер бит-в-бит, бой стартует (спавн-бой 000033/000135) ---

test('MC8. e2e: сейв-позиция на тайле группы (from == to): бой стартует, заряда нет, рендер бит-в-бит (задача 000183)', async () => {
  const save = {
    version: 1,
    savedAt: new Date(0).toISOString(),
    data: { day: 1, position: { x: 2, y: 3 } },
  };
  const h = bootSandbox(save);
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  // Спай ДО промывки: спавн-бой стартует в boot-микротасках
  // (loadMapPixels().then → restoreFromSave → maybeStartCombat).
  const cap = spyStartCombat(G);
  await drain();
  await drain();
  await drain();
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  assert.ok(g.state.player.x === 2 && g.state.player.y === 3,
    'сценарий: игрок на тайле группы (2,3) (позиция сейва)');
  assert.equal(G.combatUI.isActive(), true,
    'бой стартует на boot (спавн на тайле живой группы)');
  assert.equal(cap.calls, 1, 'бой начат РОВНО 1×');
  assert.equal(cap.opts.seed, G.hash2(2, 3, SALT),
    'seed — от тайла группы (бит-в-бит)');
  assert.equal(cap.opts.tile.x, 2, 'opts.tile (x)');
  assert.equal(cap.opts.tile.y, 3, 'opts.tile (y)');
  // D4: chargeTo == тайл (prevPos снапнут на позицию сейва) →
  // глейд-нуль → заряда НЕТ.
  assert.ok(g.state.mobCharge == null,
    'from == to: заряда нет (глейд-нуль)');
  // Д-ПРОТОКОЛ: очередь rAF = [combatTick, worldFrame] — мировой
  // frame НЕ «последний» (combat-ui саморекурсия), берём по индексу.
  assert.equal(h.raf.length, 2,
    'протокол: combat-tick + мировой frame в rAF-очереди');
  const worldFn = h.raf[1];
  const myMap = G.createMap(G.generateSeedPixels());
  const calls = pump(h, worldFn, NOW + 200);
  const st = g.state;
  const spPrefix = mobPrefix(G, 4);
  const d = findOne(calls, spPrefix, 'boot-кадр');
  const a = screenAnchor(G, 2, 3, st.cam, st.zoom);
  assert.ok(Math.abs(d[1][1] - a.x) < EPS
    && Math.abs(d[1][2] - a.y) < EPS,
    'boot-кадр: спрайт на якоря тайла (рендер бит-в-бит)');
  assertGroupsAtAnchors(G, myMap, calls, st.cam, st.zoom, 'boot-кадр');
  assert.ok(g.state.mobCharge == null, 'boot-кадр: заряда нет');
  resolveCombatVictory(G, G.combatUI.current(), 'boot-бой');
  assert.ok(g.state.mobCharge == null, 'после onEnd: заряда нет');
  const calls2 = pump(h, worldFn, NOW + 400);
  const st2 = g.state;
  assert.equal(mobDraws(calls2).filter((c) => c[1][0].__asset.startsWith(spPrefix)).length,
    0, 'после победы спрайт группы скрыт (000122)');
  assertGroupsAtAnchors(G, myMap, calls2, st2.cam, st2.zoom,
    'после победы', { hidden: ['2,3'] });
});

// --- MC9 (GUARD). WebGL-фолбэк-слой: дробный маркер MOB_COLOR в
// ТОЙ ЖЕ точке, что state.mobCharge.pos (контракт «оба слоя — одна
// точка» полный); 2d-слой БЕЗ спрайта упавшего ассета, остальные
// группы — на своих местах; после победы — 0 вершин ---

test('MC9. e2e: WebGL-фолбэк — дробный маркер MOB_COLOR в точке state.mobCharge.pos; 2d без упавшего спрайта (задача 000183)', async () => {
  // Префикс паучьих ассетов — из эталонного boot (без хардкода).
  const h0 = await boot(null);
  const spPrefix = mobPrefix(h0.sandbox.Game, 4);
  const h = await boot(null, (v) => v.indexOf(spPrefix) === 0);
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  assert.ok(g.state.player.x === 0 && g.state.player.y === 0,
    'сценарий: спавн (0,0)');
  assert.equal(myMap.tileAt(2, 3).mobGroup, 4,
    'сценарий: паучье гнездо (2,3)');
  const worldFn = captureWorldFn(h);
  const cap = spyStartCombat(G);
  const walk = makeWalker(h, worldFn);
  const { now: T } = walk.walk(0, 1);
  assert.equal(G.combatUI.isActive(), true, 'бой начался');
  assert.equal(cap.calls, 1, 'бой РОВНО 1×');
  assert.ok(g.state.mobCharge && g.state.mobCharge.pos,
    'заряд активен (спрайт упал, но механика заряда не зависит от него)');
  let prevX = null;
  for (let k = 1; k <= SAMPLES; k++) {
    const now = T + STEP_MS * k;
    h.glCalls.length = 0; // «вершины КАДРА» — сброс до pumped-кадра
    const calls = pump(h, worldFn, now);
    const st = g.state;
    const mc = st.mobCharge;
    assert.ok(mc && mc.pos, 'кадр ' + k + ': заряд активен');
    // 2d-слой: спрайт паучьего НЕТ (ассет упал), прочие 4 группы —
    // на своих якорях (пер-элементный фолбэк не трогает остальное).
    const mobs = mobDraws(calls);
    assert.equal(mobs.filter((c) => c[1][0].__asset.startsWith(spPrefix)).length,
      0, 'кадр ' + k + ': спрайта упавшего ассета нет в 2d-слое');
    // Прочие группы: число draw = видимые группы минус упавшая,
    // каждая — ровно на якоря своего тайла (локальная версия
    // assertGroupsAtAnchors — тот же, что и у helper, минус
    // «все группы нарисованы»).
    const tiles = visibleGroupTiles(G, myMap, st.cam, st.zoom);
    assert.equal(mobs.length, tiles.length - 1,
      'кадр ' + k + ': прочие группы нарисованы (фолбэк пер-элементный, '
      + mobs.length + ' vs ' + (tiles.length - 1) + ')');
    for (const t of tiles) {
      if (t.x + ',' + t.y === mc.key) continue;
      const aa = screenAnchor(G, t.x, t.y, st.cam, st.zoom);
      const hit = mobs.filter((cc) =>
        Math.abs(cc[1][1] - aa.x) < EPS
        && Math.abs(cc[1][2] - aa.y) < EPS);
      assert.equal(hit.length, 1,
        'кадр ' + k + ': группа (' + t.x + ',' + t.y + ') на якоря тайла');
    }
    // WebGL-слой: ровно ОДИН квад MOB_COLOR (6 вершин) — фолбэк-
    // маркер заряжающейся группы (гейт !mobFrameImg сработал).
    const mv = glColorVerts(h, MOB_COLOR);
    assert.equal(mv.length, 6,
      'кадр ' + k + ': маркер — ровно один квад (6 вершин), '
      + 'на деле ' + mv.length);
    const px = mc.pos.x, py = mc.pos.y;
    assert.ok(!Number.isInteger(px) && !Number.isInteger(py),
      'кадр ' + k + ': маркер в ДРОБНОЙ точке глейда '
      + '(' + px.toFixed(4) + ',' + py.toFixed(4) + '), а не на тайле');
    for (const v of mv) {
      // 1e-6 — float32-квантизация bufferData (Float32Array: ulp ≈ 2.4e-7
      // при координатах ~2); точка — та же, что state.mobCharge.pos
      // (float64), до погрешности упаковки.
      assert.ok(v[0] >= px + 0.30 - 1e-6 && v[0] <= px + 0.70 + 1e-6
        && v[1] >= py + 0.30 - 1e-6 && v[1] <= py + 0.70 + 1e-6,
        'кадр ' + k + ': квад маркера = [pos+0.30, pos+0.70]^2 — '
        + 'та же точка, что state.mobCharge.pos («оба слоя — одна '
        + 'точка», 000033)');
    }
    if (prevX != null) {
      assert.ok(mv[0][0] < prevX,
        'кадр ' + k + ': маркер движется по кадрам (глейд анимируется '
        + 'в WebGL-слое)');
    }
    prevX = mv[0][0];
  }
  // Очистка: победа → groupVisible-паритет — маркера нет, прочие
  // элементы ready → буфер ПУСТ.
  resolveCombatVictory(G, G.combatUI.current(), 'zone-бой (фолбэк)');
  h.glCalls.length = 0;
  pump(h, worldFn, T + STEP_MS * (SAMPLES + 1));
  assert.equal(glVerts(h).length, 0,
    'после победы: 0 вершин в WebGL-буфере (маркер скрыт паритетом '
    + 'groupVisible, 000176)');
});

// --- MC10 (GUARD). Длительность заряда 1500 мс (MOB_CHARGE_MS):
// окно сэмплирования ПРОДЛЕНО за 700 мс — p<1 на T+1450 (остаток >
// EPS_POS), ровно на цели на T+1500, далее КОНСТАНТНА (кламп, без
// перелёта/осцилляции) до onEnd ---

test('MC10. e2e: заряд 1500 мс — остаток > 0 на T+1450, кламп на цели на T+1500 и далее константа (задача 000183)', async () => {
  const { h, G, g, worldFn, T } = await scenarioZoneAttack();
  assert.ok(g.state.mobCharge && g.state.mobCharge.pos,
    'заряд активен');
  // T+1450: p = 1450/1500 < 1 — глейд ещё идёт (остаток ≈ 0.009
  // тайла > EPS_POS = 1e-3).
  pump(h, worldFn, T + 1450);
  const p1450 = g.state.mobCharge.pos;
  const off1450 = Math.hypot(p1450.x - 0, p1450.y - 1);
  assert.ok(off1450 > EPS_POS,
    'T+1450: НЕ на цели (остаток ' + off1450.toFixed(5)
    + ' > ' + EPS_POS + ' — длительность заряда 1500 мс)');
  // T+1500: p = 1 — ровно на цели (кламп); спрайт — на якоря тайла
  // цели (два слоя — одна точка, теперь уже целая).
  const calls1500 = pump(h, worldFn, T + 1500);
  assert.deepEqual(hostPt(g.state.mobCharge.pos), { x: 0, y: 1 },
    'T+1500: position() — ровно на цели (кламп p >= 1)');
  const st = g.state;
  const spPrefix = mobPrefix(G, 4);
  const d = findOne(calls1500, spPrefix, 'T+1500');
  const a = screenAnchor(G, 0, 1, st.cam, st.zoom);
  assert.ok(Math.abs(d[1][1] - a.x) < EPS
    && Math.abs(d[1][2] - a.y) < EPS,
    'T+1500: спрайт на якоря тайла цели (0,1)');
  // T+1550..T+1650: КОНСТАНТНА на цели (ни перелёта, ни осцилляции).
  for (const dt of [1550, 1600, 1650]) {
    pump(h, worldFn, T + dt);
    assert.deepEqual(hostPt(g.state.mobCharge.pos), { x: 0, y: 1 },
      'T+' + dt + ': позиция константна на цели');
  }
  resolveCombatVictory(G, G.combatUI.current(), 'zone-бой');
  assert.ok(g.state.mobCharge == null, 'onEnd: заряд сброшен');
});

// --- MC11 (GUARD, D5-контракт). Исход боя 'dead': герой возрождён
// (половина max HP, −20% золота), игрок — на prevPos, группа ЖИВА
// (спрайт на якоря), заряда нет, flash-строка смерти ---

test('MC11. e2e: исход "dead" — герой возрождён (−20% золота), игрок на prevPos, группа жива, заряда нет (задача 000183)', async () => {
  const { h, G, g, worldFn, T } = await scenarioZoneAttack();
  const c = G.combatUI.current();
  const hero = c.player; // createCombat: player: opts.hero — ЖИВОЙ hero
  const maxHP = G.derived(hero).maxHP;
  const gold0 = hero.gold;
  // Тест-мутация (паттерн B25): результат 'dead' задаётся напрямую —
  // dealDamageToPlayer не экспортируется; гейты finish() (ctx.combat.
  // result) проходят, геймплейные механизмы не трогаются.
  c.result = { outcome: 'dead', partyLost: true };
  G.combatUI.handleCode('Space');
  assert.equal(G.combatUI.isActive(), false,
    'панель закрыта (Space → finish → onEnd)');
  assert.ok(g.state.mobCharge == null, 'onEnd: заряд сброшен');
  assert.ok(g.state.player.x === 0 && g.state.player.y === 0,
    'игрок возвращён на prevPos (0,0)');
  assert.equal(hero.alive, true, 'герой возрождён (alive === true)');
  assert.equal(hero.hp, Math.max(1, Math.round(maxHP / 2)),
    'HP — половина max (' + maxHP + ' → '
    + Math.max(1, Math.round(maxHP / 2)) + ')');
  assert.equal(hero.gold, Math.floor(gold0 * 0.8),
    'золото −20% (' + gold0 + ' → ' + Math.floor(gold0 * 0.8) + ')');
  // Flash-строка (свежая игра: без лута/отряда — строка ТОЧНАЯ;
  // hud.js: flash — последняя строка).
  const calls = pump(h, worldFn, T + 200);
  assert.ok(h.hud.textContent.endsWith('Вы очнулись. −20% золота.'),
    'flash: «Вы очнулись. −20% золота.» (получено: «'
    + h.hud.textContent + '»)');
  // Группа ЖИВА: спрайт на якоря (2,3) — defeatAt не записан при
  // смерти, заряд не «залип».
  const st = g.state;
  const spPrefix = mobPrefix(G, 4);
  const dd = findOne(calls, spPrefix, 'после смерти');
  const aa = screenAnchor(G, 2, 3, st.cam, st.zoom);
  assert.ok(Math.abs(dd[1][1] - aa.x) < EPS
    && Math.abs(dd[1][2] - aa.y) < EPS,
    'группа жива: спрайт на якоря (2,3) (нет defeatedAt)');
  assertGroupsAtAnchors(G, G.createMap(G.generateSeedPixels()),
    calls, st.cam, st.zoom, 'после смерти');
});

// --- MC12 (GUARD). frameIndex спрайта заряжающегося — по ЦЕЛОМУ
// тайлу: суффикс кадра drawImage переучивается на каждый кадр по
// времени (не «прыгает» по дробной траектории рывка) ---

test('MC12. e2e: frameIndex спрайта заряжающегося — по целому тайлу; кадры переучиваются по времени (задача 000183)', async () => {
  const { h, G, g, myMap, worldFn, T } = await scenarioZoneAttack();
  const frames = G.mobFrames(4);
  assert.equal(frames.length, 2, 'сценарий: паучий — 2 кадра спрайта');
  const spPrefix = mobPrefix(G, 4);
  const seen = new Set();
  for (let k = 1; k <= SAMPLES; k++) {
    const now = T + STEP_MS * k;
    const calls = pump(h, worldFn, now);
    const d = findOne(calls, spPrefix, 'кадр ' + k);
    // Селектор кадра — тот же, что в проходe 3 (mobFrameImg):
    // G.frameIndex(now, tx, ty, n) по ЦЕЛОМУ тайлу группы.
    const idx = G.frameIndex(now, 2, 3, frames.length);
    assert.equal(d[1][0].__asset, frames[idx],
      'кадр ' + k + ': кадр спрайта — по целому тайлу (2,3): '
      + d[1][0].__asset + ' vs ' + frames[idx]);
    seen.add(d[1][0].__asset);
  }
  // Анти-вакуум: окно 700 мс > периода FRAME_MS (480 мс) — хотя бы
  // 2 различных кадра спрайта в окне (выбор кадра идёт по ВРЕМЕНИ).
  assert.ok(seen.size >= 2,
    'анти-вакуум: в окне ≥ 2 различных кадра спрайта (' + seen.size
    + ') — frameIndex идёт по времени, а не застыл');
  resolveCombatVictory(G, G.combatUI.current(), 'zone-бой');
});

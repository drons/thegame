// Задача 000203 (красная стадия): BUG — результаты 000172/000173 не
// видны на глобальной карте. Контракты: memory/000203-lunge-visibility.md
// (D1–D11). Фикс — «лундж-гейт»: логика боя НЕ откладывается (D1),
// откладывается только ПОЯВЛЕНИЕ боевого экрана — оверлей вешается как
// раньше, но скрыт inline-стилями до первого кадра now ≥ lungeEndMs,
// ввод в окне игнорируется (D2/D3/D4).
//
// e2e на ПОЛНОЙ цепочке <script> из index.html (vm-песочница;
// харнес-копия tests/mob-chase-e2e.test.js). D-ПРОТОКОЛ: worldFn
// захватывается ДО боя, pump ТОЛЬКО worldFn (боевой tick combat-ui —
// не гоняется). performance.now() заморожен (NOW=1000), все now
// явные. remove() в DOM-стабе — NO-OP: «снятие» оверлея ассертится
// по isActive()/visibility, не по длине children. Оверлей ищется
// среди body.children по ТОЧНОМУ className.
//
// RED (LV1–LV4) падают осмысленно на master (гейта нет: оверлей
// сразу видим, opts.lungeGate/state.lungeGate/setLungeGate отсутствуют
// — нет функциональности, не синтаксис). GUARDS (LV5–LV7) — зелёные
// с рождения: без заряда немедленный показ, from==to, детерминизм.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { SAVE_KEY } = require('../src/save.js');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));

const VIEW_W = 1280;
const VIEW_H = 720;
const NOW = 1000;
const SALT = 0x5eedc0de;
const EPS = 1e-6;
const EPS_POS = 1e-3;
const OVERLAY_CLASS = 'combat-overlay combat-overlay--combat';

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

function makeContext2d(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
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

function makeStorage(seed) {
  const m = new Map();
  if (seed != null) m.set(SAVE_KEY, JSON.stringify(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

function bootSandbox(seed) {
  const winListeners = {};
  const raf = [];
  const errors = [];
  const glCalls = [];
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
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
  // assets/map.png ВСЕГДА onerror (детерминированный фолбэк
  // G.generateSeedPixels), остальные ассеты — onload (микротаск).
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

const drain = () => new Promise((r) => setImmediate(r));

async function boot(seed) {
  const h = bootSandbox(seed);
  await drain();
  await drain();
  await drain();
  return h;
}

function captureWorldFn(h) {
  assert.equal(h.raf.length, 1,
    'сценарий: до боя в rAF-очереди ровно один колбэк (мировой frame)');
  return h.raf[0];
}

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
  w.frame = function () {
    w.now += 200;
    return pump(h, worldFn, w.now);
  };
  return w;
}

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

function screenAnchor(G, tx, ty, cam, zoom) {
  const p = G.worldToScreen(tx, ty, cam.x, cam.y, zoom, VIEW_W, VIEW_H);
  return { x: p.x - zoom * 0.1, y: p.y - zoom * 0.15 };
}

function mobPrefix(G, gid) {
  const f = G.mobFrames(gid);
  assert.ok(f && f.length, 'сценарий: mobFrames(' + gid + ') не пуст');
  return f[0].replace(/_\d+\.svg$/, '_');
}

function findOne(calls, prefix, label) {
  const ds = calls.filter((c) => c[0] === 'drawImage'
    && c[1][0]
    && c[1][0].__asset.startsWith(prefix));
  assert.equal(ds.length, 1, label + ': ровно один draw спрайта ' + prefix);
  return ds[0];
}

function tileDraws(calls) {
  return calls.filter((c) => c[0] === 'drawImage'
    && c[1][0]
    && typeof c[1][0].__asset === 'string'
    && c[1][0].__asset.startsWith('assets/tiles/'));
}

function arcsOf(calls) {
  const out = [];
  for (let i = 0; i < calls.length; i++) {
    if (calls[i][0] === 'arc') {
      out.push({
        i,
        cx: calls[i][1][0], cy: calls[i][1][1], r: calls[i][1][2],
        a0: calls[i][1][3], a1: calls[i][1][4],
      });
    }
  }
  return out;
}

const hostPt = (p) => ({ x: p.x, y: p.y });

const hostPs = (ps) => ({
  moveLeft: ps.moveLeft, attack: ps.attack, block: ps.block,
  blocked: ps.blocked, spellInt: ps.spellInt, spellWis: ps.spellWis,
  quickItem: ps.quickItem, invItem: ps.invItem,
});

// Оверлей боевого экрана — среди body.children по ТОЧНОМУ className
// (remove() в стабе no-op — по позиции children определять нельзя).
function overlayOf(h) {
  const kids = h.sandbox.document.body.children;
  for (const el of kids) {
    if (el.className === OVERLAY_CLASS) return el;
  }
  return null;
}

// Зона-атака: (0,0)→(0,1) — вход в 5×5-зону паучьего (2,3) (пин Z5).
// Возврат { h, G, g, myMap, worldFn, T, atkCalls, cap } — T = now
// кадра атаки, atkCalls — drawCalls того кадра (карта рисуются в том
// же кадре ПОСЛЕ startCombat), cap — spy-снапшот opts.
async function scenarioZoneAttack() {
  const h = await boot(null);
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
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
  const { now: T, calls } = walk.walk(0, 1);
  assert.equal(G.combatUI.isActive(), true,
    'шаг входа в зону — бой начался (бит-в-бит, 000135)');
  assert.equal(cap.calls, 1, 'бой начат РОВНО 1× за шаг');
  assert.equal(cap.opts.seed, G.hash2(2, 3, SALT),
    'seed zone-боя — от тайла ГРУППЫ (бит-в-бит, D1)');
  assert.equal(cap.opts.tile.x, 2, 'opts.tile — тайл группы (x)');
  assert.equal(cap.opts.tile.y, 3, 'opts.tile — тайл группы (y)');
  assert.equal(cap.opts.terrain, myMap.tileAt(2, 3).terrain,
    'opts.terrain — terrain тайла ГРУППЫ (бит-в-бит)');
  return { h, G, g, myMap, worldFn, T, atkCalls: calls, cap };
}

// --- LV1 (RED). Кадр атаки T0: боевой экран скрыт inline-стилями,
// карта жива в ТОМ ЖЕ кадре (тайлы, первая точка глейда, окружность
// 000172) — именно в этот момент результаты 000172/000173 должны
// быть видны игроку (D8) ---

test('LV1. e2e: кадр атаки T0 — боевой экран скрыт (visibility/pointer-events), карта жива в том же кадре (задача 000203)', async () => {
  const { h, G, g, myMap, atkCalls, cap } = await scenarioZoneAttack();
  assert.equal(h.errors.length, 0, 'ошибок нет: ' + h.errors.join('; '));
  assert.equal(G.combatUI.isActive(), true,
    'бой начался в кадре атаки (D1: логика боя не откладывается)');
  const mc = g.state.mobCharge;
  assert.ok(mc, 'state.mobCharge — заряд активен в кадре атаки');
  assert.equal(mc.key, '2,3', 'ключ заряда — тайл атакованной группы');
  assert.deepEqual(hostPt(mc.from), { x: 2, y: 3 },
    'старт заряда — тайл группы');
  assert.deepEqual(hostPt(mc.to), { x: 0, y: 1 },
    'цель заряда — тайл игрока на момент атаки');
  const ov = overlayOf(h);
  assert.ok(ov, 'боевой оверлей подвешен к body (build() — как раньше)');
  assert.equal(ov.className, OVERLAY_CLASS,
    'className не изменился (скрытие — inline-стилями, не классом)');
  assert.equal(ov.style.visibility, 'hidden',
    'кадр атаки: боевой экран скрыт (visibility: hidden) — игрок видит '
    + 'рывок и окружность на чистой карте; фактически: '
    + JSON.stringify(ov.style.visibility) + ' — оверлей покрывает карту '
    + 'в кадре атаки, пока заряд активен (результаты 000172/000173 '
    + 'не видны, задача 000203)');
  assert.equal(ov.style.pointerEvents, 'none',
    'кадр атаки: pointer-events: none — скрытый экран не перехватывает '
    + 'указатель');
  assert.equal(cap.opts.lungeGate, true,
    'startCombat opts — lungeGate: true (заряд существует; новое '
    + 'опциональное поле, D2)');
  assert.equal(g.state.lungeGate, true,
    'state.lungeGate — сессионное зеркало гейта (true в окне лунджа)');
  const st = g.state;
  const tiles = tileDraws(atkCalls);
  assert.ok(tiles.length > 0,
    'карта жива в кадре атаки: текстуры тайлов на 2d-канале ('
    + tiles.length + ' draw)');
  const d0 = findOne(atkCalls, mobPrefix(G, 4), 'кадр атаки');
  const a0 = screenAnchor(G, 2, 3, st.cam, st.zoom);
  assert.ok(Math.abs(d0[1][1] - a0.x) < EPS
    && Math.abs(d0[1][2] - a0.y) < EPS,
    'кадр атаки: первая точка глейда (p=0) — на якоря тайла группы '
    + '(2,3) на 2d-канале');
  const c23 = G.worldToScreen(2.5, 3.5, st.cam.x, st.cam.y, st.zoom,
    VIEW_W, VIEW_H);
  const arcs = arcsOf(atkCalls);
  const hit23 = arcs.find((a) =>
    Math.abs(a.cx - c23.x) < EPS && Math.abs(a.cy - c23.y) < EPS);
  assert.ok(hit23, 'кадр атаки: окружность агрессии (2,3) на 2d-канале');
  assert.ok(Math.abs(hit23.r - 2 * st.zoom) < EPS,
    'окружность (2,3) — r = 2*zoom (000172: радиус из groupZoneInfo)');
});

// --- LV2 (RED). Показ — в КОНЦЕ рывка: пока моб движется (T+50..T+
// +1450) экран скрыт, первый кадр ≥ T+1500 — видим; бой интактен,
// повторного startCombat НЕТ, заряд клампнут на цели в том же кадре
// (D3: оверлей появляется ровно когда группа добежала) ---

test('LV2. e2e: показ боевого экрана — в конце рывка (скрыт до T+1500, бой интактен, без повторного startCombat) (задача 000203)', async () => {
  const { h, G, g, worldFn, T, cap } = await scenarioZoneAttack();
  assert.equal(h.errors.length, 0, 'ошибок нет: ' + h.errors.join('; '));
  const ov = overlayOf(h);
  assert.ok(ov, 'оверлей подвешен');
  for (const dt of [50, 100, 1450]) {
    pump(h, worldFn, T + dt);
    assert.equal(ov.style.visibility, 'hidden',
      'T+' + dt + ': боевой экран ещё скрыт (рывок не закончен); '
      + 'фактически: ' + JSON.stringify(ov.style.visibility)
      + ' — оверлей видим на T+' + dt + ' (рывок ещё идёт) — анимация '
      + 'не видна (000173), задача 000203');
    const p = g.state.mobCharge && g.state.mobCharge.pos;
    assert.ok(p, 'T+' + dt + ': заряд активен');
    assert.ok(Math.hypot(p.x - 2, p.y - 3) > EPS_POS
      && Math.hypot(p.x - 0, p.y - 1) > EPS_POS,
      'T+' + dt + ': pos строго МЕЖДУ from (2,3) и to (0,1) (не '
      + 'клампнут): ' + p.x.toFixed(4) + ',' + p.y.toFixed(4));
    assert.equal(G.combatUI.isActive(), true,
      'T+' + dt + ': бой интактен');
    assert.equal(cap.calls, 1, 'T+' + dt + ': повторного startCombat НЕТ');
    assert.equal(cap.opts.seed, G.hash2(2, 3, SALT),
      'T+' + dt + ': seed тот же (D1: бит-в-бит)');
  }
  pump(h, worldFn, T + 1500);
  assert.equal(ov.style.visibility, '',
    'T+1500: боевой экран видим (гейт снят в первом кадре now >= '
    + 'lungeEndMs = chNow + MOB_CHARGE_MS, D3)');
  assert.equal(ov.style.pointerEvents, '',
    'T+1500: pointer-events возвращены ("" — возврат)');
  assert.equal(g.state.lungeGate, false,
    'T+1500: state.lungeGate — гейт снят');
  assert.deepEqual(hostPt(g.state.mobCharge.pos), { x: 0, y: 1 },
    'T+1500: заряд клампнут на цели (свойство MC10) — экран '
    + 'появляется ровно когда группа добежала (D3)');
  assert.equal(cap.calls, 1, 'показ — повторного startCombat НЕТ (D1)');
  assert.equal(G.combatUI.isActive(), true, 'бой интактен после показа');
  assert.equal(h.errors.length, 0,
    'ошибок в окне нет: ' + h.errors.join('; '));
});

// --- LV3 (RED). Ввод в окне лунджа инертен: пока экран скрыт и
// результата нет — ВСЕ клавиши игнорируются (D4), боевое состояние
// не мутится; после окна ввод потребляется ---

test('LV3. e2e: ввод в окне лунджа инертен (handleCode → false, состояние боя не мутится); после окна — потреблено (задача 000203)', async () => {
  const { h, G, g, worldFn, T } = await scenarioZoneAttack();
  assert.equal(h.errors.length, 0, 'ошибок нет: ' + h.errors.join('; '));
  assert.ok(overlayOf(h), 'оверлей подвешен');
  const c = G.combatUI.current();
  assert.ok(c, 'боевой объект');
  const ps0 = hostPs(c.ps);
  const ti0 = c.turnIndex;
  const log0 = c.log.length;
  pump(h, worldFn, T + 100);
  const r = G.combatUI.handleCode('KeyW');
  assert.equal(r, false,
    'T+100 (окно лунджа): handleCode → false — ввод не потребляется, '
    + 'пока экран скрыт и результата нет (D4); фактически: ' + r
    + ' — ввод потреблён в окне (боевой ход сгорел под вуалью), '
    + 'задача 000203');
  assert.equal(c.turnIndex, ti0, 'окно: turnIndex не изменился');
  assert.equal(c.log.length, log0, 'окно: журнал боя не изменился');
  assert.deepEqual(hostPs(c.ps), ps0,
    'окно: счётчики действий ps не изменились');
  pump(h, worldFn, T + 1500);
  const r2 = G.combatUI.handleCode('KeyW');
  assert.equal(r2, true,
    'после окна (T+1500, гейт снят): handleCode → true — ввод '
    + 'потребляется');
  assert.equal(h.errors.length, 0,
    'ошибок нет: ' + h.errors.join('; '));
});

// --- LV4 (RED). onEnd ДО reveal (быстрая победа на T+100): оверлей
// так и НЕ появился ни в одном сэмпл-точке, состояние бит-в-бит
// MC5, повторного append после finish НЕТ ---

test('LV4. e2e: onEnd до reveal (победа на T+100) — оверлей так и не появился, состояние бит-в-бит (MC5), без повторного append (задача 000203)', async () => {
  const { h, G, g, worldFn, T } = await scenarioZoneAttack();
  assert.equal(h.errors.length, 0, 'ошибок нет: ' + h.errors.join('; '));
  const ov = overlayOf(h);
  assert.ok(ov, 'оверлей подвешен');
  assert.equal(ov.style.visibility, 'hidden',
    'T0: оверлей скрыт (не появился); фактически: '
    + JSON.stringify(ov.style.visibility) + ' — оверлей появился до '
    + 'конца боя (видим с кадра атаки), задача 000203');
  for (const dt of [50, 100]) {
    pump(h, worldFn, T + dt);
    assert.equal(ov.style.visibility, 'hidden',
      'T+' + dt + ': оверлей по-прежнему скрыт (бой не окончен)');
  }
  resolveCombatVictory(G, G.combatUI.current(), 'бой до reveal');
  assert.equal(G.combatUI.isActive(), false,
    'панель закрыта (Space → finish → onEnd)');
  assert.ok(g.state.mobCharge == null,
    'onEnd: заряд сброшен (бит-в-бит MC5)');
  assert.equal(g.state.lungeGate, false,
    'onEnd: lungeGate сброшен — гейт не «просачивается» в следующий бой');
  const ovs = h.sandbox.document.body.children
    .filter((el) => el.className === OVERLAY_CLASS);
  assert.equal(ovs.length, 1,
    'повторного append после finish НЕТ (ровно один оверлей в body)');
  assert.equal(h.errors.length, 0,
    'ошибок нет: ' + h.errors.join('; '));
});

// --- LV5 (GUARD, зелёный с рождения). Деградация D5: нет
// G.createMover — бой стартует бит-в-бит, заряда НЕТ, гейта НЕТ,
// оверлей видим СРАЗУ (заполняет major-пробел MC7 из ретро 000173) ---

test('LV5. e2e: деградация (нет G.createMover) — бой бит-в-бит, заряда нет, оверлей видим сразу (guard, задача 000203)', async () => {
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
  delete G.createMover;
  const { calls } = walk.walk(0, 1);
  assert.equal(G.combatUI.isActive(), true,
    'деградация: бой начался (бит-в-бит, D5)');
  assert.equal(cap.calls, 1, 'бой начат РОВНО 1× за шаг');
  assert.equal(cap.opts.seed, G.hash2(2, 3, SALT),
    'seed — бит-в-бит (деградация не меняет параметры боя)');
  assert.equal(cap.opts.tile.x, 2, 'opts.tile (x) — бит-в-бит');
  assert.equal(cap.opts.tile.y, 3, 'opts.tile (y) — бит-в-бит');
  assert.equal(cap.opts.terrain, myMap.tileAt(2, 3).terrain,
    'terrain — бит-в-бит');
  assert.ok(g.state.mobCharge == null,
    'деградация: заряда нет (тихий guard по G.createMover, D5)');
  assert.ok(!g.state.lungeGate, 'гейта нет (заряда нет, D5)');
  const ov = overlayOf(h);
  assert.ok(ov, 'оверлей подвешен к body');
  assert.ok(!ov.style.visibility,
    'оверлей видим СРАЗУ (без заряда — немедленный показ как до, D5)');
  assert.ok(!ov.style.pointerEvents,
    'pointer-events не затронуты (немедленный показ)');
  const st = g.state;
  const d0 = findOne(calls, mobPrefix(G, 4), 'кадр атаки');
  const a0 = screenAnchor(G, 2, 3, st.cam, st.zoom);
  assert.ok(Math.abs(d0[1][1] - a0.x) < EPS
    && Math.abs(d0[1][2] - a0.y) < EPS,
    'кадр атаки: спрайт на якоря тайла (рендер бит-в-бит)');
  assert.equal(h.errors.length, 0,
    'ошибок нет: ' + h.errors.join('; '));
});

// --- LV6 (GUARD, зелёный с рождения). from == to (спавн/сейв на
// тайле группы (1,0)): бой на boot, заряда НЕТ (глейд-нуль), гейта
// НЕТ, оверлей видим (паттерн MC8) ---

test('LV6. e2e: сейв-спавн на тайле группы (1,0) (from == to) — бой на boot, заряда нет, оверлей видим (guard, задача 000203)', async () => {
  const save = {
    version: 1,
    savedAt: new Date(0).toISOString(),
    data: { day: 1, position: { x: 1, y: 0 } },
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
  assert.ok(g.state.player.x === 1 && g.state.player.y === 0,
    'сценарий: игрок на тайле группы (1,0) (позиция сейва)');
  assert.equal(G.combatUI.isActive(), true,
    'бой стартует на boot (спавн на тайле живой группы)');
  assert.equal(cap.calls, 1, 'бой начат РОВНО 1×');
  assert.equal(cap.opts.seed, G.hash2(1, 0, SALT),
    'seed — от тайла группы (бит-в-бит)');
  assert.equal(cap.opts.tile.x, 1, 'opts.tile (x)');
  assert.equal(cap.opts.tile.y, 0, 'opts.tile (y)');
  assert.ok(g.state.mobCharge == null,
    'from == to: заряда нет (глейд-нуль, D5)');
  assert.ok(!g.state.lungeGate, 'гейта нет (заряда нет, D5)');
  // D-ПРОТОКОЛ: очередь rAF = [combatTick, worldFrame] — мировой
  // frame НЕ «последний» (саморекурсия combat-ui), берём по индексу.
  assert.equal(h.raf.length, 2,
    'протокол: combat-tick + мировой frame в rAF-очереди');
  const worldFn = h.raf[1];
  const ov = overlayOf(h);
  assert.ok(ov, 'оверлей подвешен к body');
  assert.ok(!ov.style.visibility,
    'оверлей видим СРАЗУ (без заряда — немедленный показ как до, D5)');
  assert.ok(!ov.style.pointerEvents,
    'pointer-events не затронуты (немедленный показ)');
  const calls = pump(h, worldFn, NOW + 200);
  const st = g.state;
  const skPrefix = mobPrefix(G, 2);
  const ds = calls.filter((c) => c[0] === 'drawImage'
    && c[1][0] && c[1][0].__asset.startsWith(skPrefix));
  const a = screenAnchor(G, 1, 0, st.cam, st.zoom);
  const hit = ds.filter((c) =>
    Math.abs(c[1][1] - a.x) < EPS && Math.abs(c[1][2] - a.y) < EPS);
  assert.equal(hit.length, 1,
    'boot-кадр: спрайт группы (1,0) на якоря тайла (рендер бит-в-бит)');
  assert.equal(h.errors.length, 0,
    'ошибок нет: ' + h.errors.join('; '));
});

// --- LV7 (GUARD, зелёный с рождения). Детерминизм: два boot одного
// сценария — последовательности (visibility, lungeGate) по
// сэмпл-точкам побайтово равны (гейт — чистая функция времени кадра,
// ноль RNG) ---

test('LV7. e2e: детерминизм — два boot, одна последовательность (visibility, lungeGate) (guard, задача 000203)', async () => {
  const runs = [];
  for (let run = 0; run < 2; run++) {
    const { h, g, worldFn, T } = await scenarioZoneAttack();
    const ov = overlayOf(h);
    assert.ok(ov, 'run ' + run + ': оверлей подвешен');
    const seq = [];
    for (const dt of [0, 250, 500, 750, 1000, 1250, 1500]) {
      if (dt > 0) pump(h, worldFn, T + dt);
      seq.push(String(ov.style.visibility) + ':'
        + String(g.state.lungeGate));
    }
    runs.push(seq);
  }
  assert.equal(runs[0].length, 7, 'окно: 7 сэмпл-точек');
  for (let i = 0; i < 7; i++) {
    assert.equal(runs[0][i], runs[1][i],
      'сэмпл ' + i + ': (visibility, lungeGate) идентичны между двумя '
      + 'boot (' + runs[0][i] + ' vs ' + runs[1][i] + ') — детерминизм '
      + '(гейт — чистая функция времени кадра, ноль RNG)');
  }
});

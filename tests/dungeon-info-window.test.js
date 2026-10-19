// Задача 000212: боковое инфо-окно в подземельях перекрывает подземелье —
// унифицировать с окном глобальной карты (рисовать тем же блоком кода),
// вместо координат карты — подземелье/этажи/клетки до выхода.
// ТЗ: tasks/pending/000212.md. Контракт: memory/000212-dungeon-hud-window.md.
//
// Механика (сверено с кодом master c2a1ebc): «боковое окно» =
// .dungeon-overlay .combat-side (src/dungeon-ui.js build(): stateEl
// (.combat-state) + logEl (.combat-log) + hint (.combat-state));
// «окно глобальной карты» = #hud (src/hud.js buildLine, каждый кадр из
// main.js renderHud) — в подземелье живо, но НЕВИДИМО (z-auto под
// непрозрачным оверлеем z-20), и пишет СТАРЫЕ мир-координаты + рамку
// «--- <имя> (x, y) ---» + счётчики «групп(ы)» (дубль — суть жалобы).
//
// Решение (контракт §3 memory): единое окно = #hud; frame-driven z-lift
// '25' (общий динамический слот 000206) в main.js frame() при
// kind==='dungeon' + планке конъюнктов; dungeon-формат #hud — 1-я строка
// «Флогистон, ур. N  (<имя подземелья>)», блок локации — floorStatusLine
// (Глубина: N при depth>1 + До выхода: ~N клеток) без рамки/счётчиков;
// строки героя/Местность/День/Масштаб/explored/flash — байт-в-байт;
// stateEl из панели УБИРАЕТСЯ (city-only); 000229: панель в
// подземелье убрана ЦЕЛИКОМ (log+hint тоже — чистое удаление, в
// #hud НЕ переносится) — #hud — ЕДИНСТВЕННОЕ инфо-окно подземелья;
// город — вне скоупа, байт-в-байт.
//
// RED (6 — падают на master ОСМЫСЛЕННО: отсутствует новая
// функциональность, не синтаксис; зеленеют после фикса):
//   * DH-1 — в подземелье кадр → h.hud.style.zIndex === '25'
//     (master: в main.js НЕТ логики подъёма #hud — undefined).
//   * DH-2 — 1-я строка #hud = имя подземелья (не мир-координаты);
//     «---» рамки и «групп(ы)» счётчиков НЕТ; «До выхода: ~N клеток»
//     и блок героя/Местность НА МЕСТЕ (master: координаты + рамка +
//     счётчики).
//   * DH-3 (node) — buildLine dungeon-байты depth=1/2 (§3.1 memory) +
//     city-вариант байт-в-байт (гард от over-fix; city-часть зелёная
//     и сейчас).
//   * DH-4 (re-pin 000229) — в .dungeon-overlay НЕТ .combat-side/
//     .combat-state/.combat-log; оверлей = canvas (1 прямой
//     ребёнок) (000229: панель в подземелье убрана совсем; до
//     000229: ровно 1 .combat-state + 1 .combat-log).
//   * DH-5 (структурный) — в src/dungeon-ui.js строки 'Группы: ' НЕТ
//     (потребитель инфо удалён); floorStatusLine — в src/hud.js И
//     src/dungeon-ui.js (city-ветка stateEl) (master: «Группы: » есть).
//   * DH-6 — конъюнкция боя: dungeon → '25' → бой → НЕ '25' → резолв →
//     '25' снова; локация цела (master: подъёма нет вовсе).
//
// ГАРД (DH-7, ЗЕЛЁНЫЙ сейчас — фиксирует ГРАНИЦЫ ТЗ: только
// подземелья/пещеры):
//   * (а) выход из подземелья ([E] на едином тайле, 000177) — подъём
//     снят + world-HUD восстановлен (1-я строка — мир-координаты,
//     «Местность: »);
//   * (б) город — подъёма нет + 2 .combat-state (stateEl + hint) +
//     city-HUD «--- <имя> (x, y) ---» + «До выхода: ~N» байт-в-байт.
//
// Харнес: самодостаточная full-chain vm-песочница (прецедент 000206 —
// tests/city-inventory-e2e.test.js): CHAIN-скрипты из index.html,
// Proxy-DOM makeEl c style:{}, WebGL/Image-стабы, h.hud — тот же
// элемент, что getElementById('hud'). Вход в подземелье —
// g.actions.enterDungeon() (отладочный, CI-2/CI-6); debug-бой —
// g.actions.startCombat() + resolveCombat (мобы 9999 → Space); вход в
// город — walkTiles к входу (протокол city-screen). Ошибки на чистых
// путях — не растут (h.errors).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const D = require('../src/dungeon.js');

const ROOT = path.join(__dirname, '..');

// Цепочка скриптов — из index.html (не хардкод, паттерн main-visuals).
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));
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

function makeContext2d(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

// --- «Снисходительный» DOM-элемент с деревом (dataset, closest,
// querySelectorAll) — дубль конвенции tests/city-interact.test.js. ---
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
  if (cls && !String(el.className || '').split(/\s+/).includes(cls)) {
    return false;
  }
  if (attr) {
    if (!attr[0].startsWith('data-')) return false;
    const v = el.dataset ? el.dataset[attr[0].slice(5)] : undefined;
    if (v === undefined) return false;
    return attr[1] === undefined ? true : String(v) === attr[1];
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
    // children хранят СУРЫЕ target (а не прокси): remove() ищет по
    // identity (дубль tests/city-interact.test.js).
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
      if (name.startsWith('data-')) target.dataset[name.slice(5)] = value;
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
      return () => undefined; // неизвестный метод DOM — no-op
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

// --- Песочница: вся цепочка index.html (браузерная ветка UMD) ---
function bootSandbox() {
  const winListeners = {};
  const raf = [];
  const errors = [];
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
  // #game — WebGL (без него main.js уходит в фолбэк-ветку и не
  // стартует); #sprites — 2d со спаем (слой спрайтов).
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
          : id === 'hud' ? hud : null),
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
    // Семантика браузерного window: повторный add — no-op, remove —
    // реально снимает (дубль tests/city-interact.test.js).
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
  // Image-стаб (паттерн main-visuals): assets/map.png ВСЕГДА onerror
  // → детерминированный фолбэк G.generateSeedPixels; остальные onload.
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

// Промывка микротасков (Image + loadMapPixels().then: карта, спавн,
// requestAnimationFrame(frame)).
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
  // frame() main.js — единственный rAF-колбэк после старта; кадр пере
  // планирует себя (одна и та же функция) — frameFn валидна на любом
  // моменте.
  h.frameFn = h.raf[h.raf.length - 1];
  return h;
}

// --- Ввод ---
// ВАЖНО: массив слушателей снапшотится ПЕРЕД диспетчем (паттерн B9):
// слушатель, зарегистрированный ВО ВРЕМЯ диспетча, текущее событие
// НЕ видит (семантика браузерного DOM).
function key(h, code, extra = {}) {
  const e = Object.assign(
    { code, preventDefault() {}, stopPropagation() {} }, extra);
  for (const fn of (h.winListeners['keydown'] || []).slice()) fn(e);
  return e;
}

function keyup(h, code, extra = {}) {
  const e = Object.assign({ code }, extra);
  for (const fn of (h.winListeners['keyup'] || []).slice()) fn(e);
  return e;
}

function press(h, code) {
  return key(h, code);
}

function release(h, code) {
  return keyup(h, code);
}

function keydownFor(dx, dy) {
  return dx === 1 ? 'ArrowRight' : dx === -1 ? 'ArrowLeft'
    : dy === 1 ? 'ArrowDown' : 'ArrowUp';
}

// Резолв боевого оверлея (паттерн walkTiles 000135): мобы 9999 →
// Space. Эфир НЕ убиваем.
function resolveCombat(G) {
  assert.equal(G.combatUI.isActive(), true, 'резолв: бой активен');
  const c = G.combatUI.current();
  for (const m of c.units.filter((x) => x.side === 'mob' && x.alive)) {
    G.combatInternals.dealDamageToMob(c, m, 9999);
  }
  assert.ok(c.result && c.result.outcome === 'victory',
    'резолв: победа (9999 по живым мобам)');
  G.combatUI.handleCode('Space');
  assert.equal(G.combatUI.isActive(), false,
    'резолв: бой закрыт (Space → finish)');
}

// --- Ходьба по миру (протокол city-screen/main-visuals) ---
// keydown(направление) → кадры frame(now) по +200 мс, пока игрок не
// перешёл (tryMove — в frame при now−lastMove ≥ stepMs) → keyup.
// Кадр делает ≤ ОДНОГО хода. 000135: zone-бой по маршруту —
// авторазрешение.
function walkTiles(h, now, tiles) {
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  for (const [tx, ty] of tiles) {
    const dx = tx - g.state.player.x, dy = ty - g.state.player.y;
    assert.ok(Math.abs(dx) + Math.abs(dy) === 1, 'BFS: шаг по соседнему тайлу');
    const code = keydownFor(dx, dy);
    press(h, code);
    let guard = 0;
    do {
      now += 200;
      h.frameFn(now);
    } while ((g.state.player.x !== tx || g.state.player.y !== ty)
      && ++guard < 10);
    release(h, code);
    assert.equal(g.state.player.x, tx,
      'сценарий: игрок перешёл на (' + tx + ', ' + ty + ') — x');
    assert.equal(g.state.player.y, ty,
      'сценарий: игрок перешёл на (' + tx + ', ' + ty + ') — y');
    if (G.combatUI.isActive()) resolveCombat(G);
  }
  // Осадочные кадры (глейд мувера и сглаживание камеры завершаются).
  for (let i = 0; i < 4; i++) {
    now += 200;
    h.frameFn(now);
  }
  return now;
}

// --- BFS по миру до целевого тайла. Промежуточные узлы: passable,
// БЕЗ групп мобов (шаг = startCombat) и БЕЗ входов (пещера/город —
// авто-вход сломает протокол); целевой тайл — проверка ДО исключения.
function findTile(G, myMap, start, isTarget, radius = 700) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const startKey = start.x + ',' + start.y;
  const visited = new Set([startKey]);
  const prev = new Map();
  let frontier = [start];
  for (let depth = 0; depth < radius && frontier.length; depth++) {
    const next = [];
    for (const cur of frontier) {
      for (const [dx, dy] of DIRS) {
        const nx = cur.x + dx, ny = cur.y + dy;
        const k = nx + ',' + ny;
        if (visited.has(k)) continue;
        const t = myMap.tileAt(nx, ny);
        if (!t.passable || t.hasMobGroup) continue;
        visited.add(k);
        prev.set(k, cur.x + ',' + cur.y);
        if (isTarget(t)) {
          const steps = [];
          let kk = k;
          while (kk !== startKey) {
            const [px, py] = kk.split(',').map(Number);
            steps.unshift([px, py]);
            kk = prev.get(kk);
          }
          return { tile: t, steps };
        }
        if (t.hasBuilding) continue; // вход (пещера/город) — не на пути
        next.push({ x: nx, y: ny });
      }
    }
    frontier = next;
  }
  return null;
}

// Город + RECOMPUTE содержимого (чистые функции 000106/000108 — те
// же входы, что и production: якорь, wealth из tileAt): layout от
// ЯКОРЯ, не от входного тайла (000105).
function findCityFor(G, myMap, start, pred, radius = 700) {
  let info = null;
  const isCityTile = (t) => {
    if (!t.hasBuilding || t.building !== G.BUILDING_TYPES.NONE) return false;
    const rec = G.getBuilding(t.buildingId);
    if (!rec || rec.категория !== 'город') return false;
    const fp = rec.размер.ширина;
    const [ax, ay] = t.buildingAnchor;
    const layout = G.Cities.createCityLayout(ax, ay, fp);
    const contents = G.Cities.generateCityContents(layout, ax, ay,
      rec, t.buildingWealth);
    const i = { fp, rec, layout, contents, ax, ay,
      wealth: t.buildingWealth, tile: t };
    if (pred(i) === true) info = i;
    return info !== null;
  };
  const r = findTile(G, myMap, start, isCityTile, radius);
  return r ? Object.assign({ tile: r.tile, steps: r.steps }, info) : null;
}

// Безопасный ОДИН шаг в МИРЕ от тайла входа (000177: выход → герой
// на входном тайле; повторный вход требует шага С тайла и обратно).
// passable, без группы мобов (шаг = бой), без постройки (пещера/город
// — авто-вход сломает протокол). null — нет такого соседа.
function safeWorldNeighbor(G, myMap, from) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of DIRS) {
    const t = myMap.tileAt(from.x + dx, from.y + dy);
    if (!t.passable || t.hasMobGroup || t.hasBuilding) continue;
    return [from.x + dx, from.y + dy];
  }
  return null;
}

// Вход в город (walkTiles + страховка bounded re-entry ≤3): 000135 —
// zone-бой на входном шаге приоритетнее входа, вход откладывается на
// ПЕРВЫЙ успешный шаг после боя, приходящийся на тайл входа.
function enterCity(h, now, myMap, pred) {
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const found = findCityFor(G, myMap, g.state.player, pred);
  assert.ok(found,
    'сценарий: город достижим пешком (BFS, мир детерминирован)');
  now = walkTiles(h, now, found.steps);
  const entry = { x: found.tile.x, y: found.tile.y };
  for (let attempt = 0; !g.dungeon && attempt < 3; attempt += 1) {
    if (G.combatUI.isActive()) resolveCombat(G);
    const adj = safeWorldNeighbor(G, myMap, entry);
    assert.ok(adj, 'сценарий: безопасный сосед тайла входа есть');
    now = walkTiles(h, now, [adj, [entry.x, entry.y]]);
  }
  assert.ok(g.dungeon, 'сценарий: локация открыта (bounded re-entry ≤3)');
  assert.equal(g.dungeon.kind, 'city', 'экран города (kind city)');
  return { found, entry, now };
}

// Оверлей локации (.dungeon-overlay — child body, src/dungeon-ui.js).
function dungeonOverlayOf(h) {
  const ovs = findAll(h.body, '.dungeon-overlay');
  return ovs.length ? ovs[ovs.length - 1] : null;
}

// ============================================================
// Node-часть (DH-3/DH-5): прямые require src (UMD node-ветка)
// ============================================================

const L = require('../src/locations.js');

// Stub-Game (зеркало ctx.game: те же API, что читает строка HUD) и
// ctx-фабрика — дубль конвенции tests/hud.js.test.js (фикстура §3.1
// memory: hero 3/42/100/5, maxHP 50, player 5,7 — заморожен, terrain
// 3=трава, день 5, zoom 28, карта 40x40 пересчёт, без spriteLoader).
function makeGame(over = {}) {
  const g = {
    derived: () => ({ maxHP: 50, maxMP: 40 }),
    TERRAIN_NAMES: { 3: 'трава' },
    DUNGEON_NAMES: { 0: 'простая пещера' },
    locations: { floorStatusLine: L.floorStatusLine },
  };
  for (const k of Object.keys(over)) g[k] = over[k];
  return g;
}

function makeCtx(over = {}) {
  const g = makeGame(over.game);
  const rest = Object.assign({}, over);
  delete rest.game;
  return Object.assign({
    hudEl: { textContent: '' },
    game: g,
    tile: { terrain: 3, hasBuilding: false, buildingId: null,
      hasMobGroup: false },
    map: { width: 40, height: 40, fromPng: false },
    player: { x: 5, y: 7 },
    hero: { level: 3, hp: 42, gold: 100, points: 5, mp: 25 },
    day: 5,
    zoom: 28,
    spriteLoader: null,
    dungeonState: null,
    defeatedAt: new Map(),
    npcs: [],
    flash: '',
    flashUntil: 0,
  }, rest, { game: g });
}

const srcOf = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');

// ============================================================
// DH-1..DH-7
// ============================================================

test('000212 DH-1 (RED, fullchain): в подземелье кадр поднимает #hud над оверлеем (inline zIndex «25» — общий динамический слот 000206)', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon — состояние подземелья (отладочный вход)');
  assert.equal(g.dungeon.kind, 'dungeon', 'kind dungeon');
  assert.equal(G.dungeonUI.isActive(), true, 'dungeonUI активен');
  assert.ok(dungeonOverlayOf(h),
    'экран подземелья — .dungeon-overlay в body (оверлей z-20)');
  const errBefore = h.errors.length;
  // Кадр (frame-driven подъём — render-driven дал бы дыру: renderHud
  // пишет текст, но z-статус меняется только в frame).
  h.frameFn(NOW + 16);
  assert.equal(h.hud.style.zIndex, '25',
    'RED: кадр — #hud ПОДНЯТ над экраном подземелья (inline zIndex 25 > '
    + 'оверлей 20; master: undefined — окно невидимо под оверлеем)');
  assert.equal(h.errors.length, errBefore,
    'чистый вход — без новых console.error');
});

test('000212 DH-2 (RED, fullchain): dungeon-HUD — 1-я строка = ИМЯ подземелья (не мир-координаты); рамки «---» и счётчика «групп(ы)» НЕТ; floorStatusLine + блок героя НА МЕСТЕ', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon — состояние подземелья (отладочный вход)');
  assert.equal(g.dungeon.kind, 'dungeon', 'kind dungeon');
  assert.equal(g.dungeon.depth, 1, 'debug-вход — depth 1');
  h.frameFn(NOW + 16);
  const hudText = String(h.hud.textContent);
  const name = G.DUNGEON_NAMES[g.dungeon.type];
  assert.ok(name, 'сценарий: тип подземелья именуется');
  const firstLine = hudText.split('\n')[0];
  assert.equal(firstLine,
    'Флогистон, ур. ' + g.state.hero.level + '  (' + name + ')',
    'RED: 1-я строка — имя подземелья вместо мир-координат (master: '
    + '«(x, y)» — замороженные координаты мира): ' + JSON.stringify(hudText));
  assert.ok(!hudText.includes('---'),
    'RED: рамки «--- <имя> (x, y) ---» НЕТ (имя — в 1-й строке): '
    + JSON.stringify(hudText));
  assert.ok(!hudText.includes('групп(ы)'),
    'RED: счётчика «  |  N групп(ы)» НЕТ (ТЗ: подземелье/этажи/клетки '
    + 'до выхода — и ничего больше): ' + JSON.stringify(hudText));
  assert.ok(!hudText.includes('Глубина'),
    'depth=1: строки «Глубина» нет (floorStatusLine — только depth>1)');
  assert.ok(/До выхода: ~\d+ клеток/.test(hudText),
    '«До выхода: ~N клеток» (floorStatusLine) на месте: '
    + JSON.stringify(hudText));
  // Строки героя/мира — БАЙТ-В-БАЙТ (ТЗ заменяет только «информацию
  // про координаты на карте»).
  assert.ok(
    /\nHP \d+\/\d+  \|  МП \d+\/\d+  \|  Золото: \d+  \|  Очки: \d+\n/
      .test(hudText),
    'блок героя (HP/МП/Золото/Очки) на месте: '
    + JSON.stringify(hudText));
  assert.ok(hudText.includes('Местность: '),
    'строка «Местность: » на месте: ' + JSON.stringify(hudText));
  assert.ok(hudText.includes('[I] персонаж'),
    'строка «[I] персонаж» на месте: ' + JSON.stringify(hudText));
});

test('000212 DH-3 (RED, node): buildLine dungeon-формат побайтово — depth=1 (имя, floorStatusLine без рамки/счётчика) И depth=2 (вставка «Глубина: 2»); city — побайтово НЕ МЕНЯЕТСЯ (гард)', () => {
  const hud = require('../src/hud.js');
  const TOP_D =
    'Флогистон, ур. 3  (простая пещера)\n' +
    'HP 42/50  |  МП 25/40  |  Золото: 100  |  Очки: 5\n' +
    'Местность: трава\n' +
    'День: 5  |  Масштаб: 28px  |  карта: 40x40 (пересчёт)\n';
  // (a) dungeon depth=1 (фикстура §3.1: type 0, exit (0,0), ds (2,3) —
  // Манхэттен 5): 1-я строка — имя; блок локации — «\nДо выхода: ~5
  // клеток» (рамы и счётчиков НЕТ).
  assert.equal(hud.buildLine(makeCtx({
    dungeonState: {
      kind: 'dungeon', x: 2, y: 3,
      dg: { type: 0, exit: { x: 0, y: 0 }, depth: 1 },
      contents: { mobs: [] },
    },
  })),
    TOP_D + '[I] персонаж\n' +
    'До выхода: ~5 клеток',
    'RED: dungeon depth=1 побайтово (master: мир-координаты + рамка '
    + '«--- … (2, 3) ---» + «  |  N групп(ы)»); city-гард ниже');
  // (b) dungeon depth=2: вставка «Глубина: 2» (floorStatusLine —
  // единый источник, 000153.03 D5) ПОСЛЕ «[I] персонаж».
  assert.equal(hud.buildLine(makeCtx({
    dungeonState: {
      kind: 'dungeon', x: 2, y: 3,
      dg: { type: 0, exit: { x: 0, y: 0 }, depth: 2 },
      contents: { mobs: [] },
    },
  })),
    TOP_D + '[I] персонаж\n' +
    'Глубина: 2\n' +
    'До выхода: ~5 клеток',
    'RED: dungeon depth=2 — «Глубина: 2» в блоке локации');
  // (c) город — БАЙТ-В-БАЙТ (гард от over-fix: ТЗ — только
  // подземелья/пещеры): 1-я строка с мир-координатами + рамка +
  // floorStatusLine БЕЗ строк групп (000106).
  assert.equal(hud.buildLine(makeCtx({
    dungeonState: {
      kind: 'city', name: 'Старый город', x: 10, y: 12,
      dg: { exit: { x: 10, y: 14 } },
    },
  })),
    'Флогистон, ур. 3  (5, 7)\n' +
    'HP 42/50  |  МП 25/40  |  Золото: 100  |  Очки: 5\n' +
    'Местность: трава\n' +
    'День: 5  |  Масштаб: 28px  |  карта: 40x40 (пересчёт)\n' +
    '[I] персонаж\n' +
    '--- Старый город (10, 12) ---\n' +
    'До выхода: ~2 клеток',
    'гард: city-байты НЕ МЕНЯЮТСЯ');
});

test('000212 DH-4 (fullchain, re-pin 000229): панель подземелья УБРАНА СОВСЕМ: в .dungeon-overlay НЕТ .combat-side/.combat-state/.combat-log; оверлей = canvas (1 прямой ребёнок)', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon — состояние подземелья (отладочный вход)');
  assert.equal(g.dungeon.kind, 'dungeon', 'kind dungeon');
  h.frameFn(NOW + 16);
  const overlay = dungeonOverlayOf(h);
  assert.ok(overlay, 'экран подземелья — .dungeon-overlay в body');
  const sides = findAll(overlay, '.combat-side');
  assert.equal(sides.length, 0,
    '000229: .combat-side НЕТ (панель убрана совсем): '
    + sides.map((s) => JSON.stringify(String(s.textContent).slice(0, 60)))
      .join(' ; '));
  const states = findAll(overlay, '.combat-state');
  assert.equal(states.length, 0,
    '000229: .combat-state НЕТ (stateEl и hint — вместе с панелью); '
    + '.combat-state: '
    + states.map((s) => JSON.stringify(String(s.textContent).slice(0, 60)))
      .join(' ; '));
  const logs = findAll(overlay, '.combat-log');
  assert.equal(logs.length, 0,
    '000229: .combat-log (журнал) НЕТ — окно убрано совсем');
  assert.equal(overlay.children.length, 1,
    'оверлей = canvas — ОДИН прямой ребёнок (000229: canvas + '
    + 'side → canvas)');
  assert.equal(overlay.children[0].tagName, 'canvas',
    'единственный ребёнок оверлея — canvas');
});

test('000212 DH-5 (RED, структурный): потребитель инфо в dungeon-ui.js удалён — строки «\'Группы: \'» нет; единый источник floorStatusLine — в src/hud.js И src/dungeon-ui.js (city-ветка stateEl)', () => {
  assert.ok(!srcOf('dungeon-ui.js').includes("'Группы: '"),
    'RED: src/dungeon-ui.js — строки «\'Группы: \'» НЕТ (info-stateEl '
    + 'убран, инфо — в #hud; master: render() строит «Группы: N  |  '
    + 'Сундуки: N  |  Залежи: N» в stateEl)');
  assert.ok(srcOf('hud.js').includes('floorStatusLine'),
    'src/hud.js — читает единый helper floorStatusLine (g.locations)');
  assert.ok(srcOf('dungeon-ui.js').includes('floorStatusLine'),
    'src/dungeon-ui.js — читает единый helper floorStatusLine '
    + '(live.locations, city-ветка stateEl)');
});

test('000212 DH-6 (RED, fullchain): конъюнкция боя — dungeon «25» → бой: НЕ «25» (HUD под боевым оверлеем, регрессия 000197/000203 исключена) → резолв: «25» снова; локация цела', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon — состояние подземелья (отладочный вход)');
  const errBefore = h.errors.length;
  h.frameFn(NOW + 16);
  assert.equal(h.hud.style.zIndex, '25',
    'RED: в подземелье #hud поднят (zIndex 25)');
  assert.equal(h.errors.length, errBefore,
    'чистый вход — без новых console.error');
  // Debug-бой (000096): боевой оверлей z-20 — СВЕРХУ #hud.
  const c0 = g.actions.startCombat();
  assert.ok(c0, 'startCombat — бой начат (отладочный)');
  assert.equal(G.combatUI.isActive(), true, 'боевой оверлей активен');
  h.frameFn(NOW + 32);
  assert.ok(h.hud.style.zIndex !== '25',
    'в бою подъём СНЯТ (конъюнкт !inCombat — #hud под боевым оверлеем, '
    + 'как раньше): ' + JSON.stringify(h.hud.style.zIndex));
  // Резолв (мобы 9999 → Space) — бой закрыт, локация цела.
  resolveCombat(G);
  h.frameFn(NOW + 48);
  assert.equal(h.hud.style.zIndex, '25',
    'RED: после боя #hud снова поднят (локация цела)');
  assert.equal(g.dungeon.kind, 'dungeon', 'локация цела: kind dungeon');
  assert.equal(G.dungeonUI.isActive(), true, 'локация цела: dungeonUI активен');
});

test('000212 DH-7 (гард, ГРАНИЦЫ ТЗ): (а) выход из подземелья — подъём снят + world-HUD восстановлен; (б) город — подъёма нет, 2 .combat-state, city-HUD байт-в-байт', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  // (а) выход из подземелья ([E] на едином тайле-выхода, 000177;
  // debug-вход — герой НА едином тайле).
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon — состояние подземелья (отладочный вход)');
  h.frameFn(NOW + 16);
  const e = press(h, 'KeyE');
  release(h, e);
  assert.equal(g.dungeon, null, '[E] на едином тайле — выход');
  assert.equal(G.dungeonUI.isActive(), false, 'dungeonUI закрыт');
  h.frameFn(NOW + 32);
  assert.ok(!h.hud.style.zIndex,
    'выход: подъём снят (zIndex falsy — z-auto, как раньше)');
  const worldText = String(h.hud.textContent);
  assert.equal(
    worldText.split('\n')[0],
    'Флогистон, ур. ' + g.state.hero.level + '  ('
      + g.state.player.x + ', ' + g.state.player.y + ')',
    'world-HUD восстановлен: 1-я строка — мир-координаты: '
    + JSON.stringify(worldText));
  assert.ok(worldText.includes('Местность: '),
    'world-HUD восстановлен: «Местность: » на месте');
  // (б) город — ПОЛНОСТЬЮ вне скоупа (ТЗ: «В подземельях и пещерах»).
  await drain();
  enterCity(h, NOW + 64, myMap, (c) => c.fp >= 2);
  const dg = g.dungeon;
  assert.equal(dg.kind, 'city', 'город (kind city)');
  h.frameFn(NOW + 96);
  assert.ok(!h.hud.style.zIndex,
    'город: подъёма НЕТ (zIndex falsy — город не жалобуется)');
  const overlay = dungeonOverlayOf(h);
  assert.ok(overlay, 'экран города — .dungeon-overlay в body');
  assert.equal(findAll(overlay, '.combat-state').length, 2,
    'город: 2 .combat-state (stateEl + hint) — панель как раньше');
  const cityText = String(h.hud.textContent);
  assert.ok(
    cityText.includes('--- ' + dg.name + ' (' + dg.x + ', ' + dg.y
      + ') ---'),
    'city-HUD: рамка «--- <имя> (x, y) ---» байт-в-байт: '
    + JSON.stringify(cityText));
  assert.ok(cityText.includes('До выхода: ~'),
    'city-HUD: «До выхода: ~N» на месте');
  assert.ok(!cityText.includes('групп(ы)'),
    'city-HUD: без строк групп (000106 — как раньше)');
});

// ============================================================
// DH-8 (ретро-пин 000219 №12): z-lift на depth>1 — основное
// состояние подземелья (DH-1/6 пинят depth-1 и конъюнкцию боя).
// ============================================================

// Локальная адаптация walkDungeonTo (PE-10, tests/portal-exit-
// e2e.test.js:1160): BFS 4-соседство по d.cells === D.CELL_FLOOR;
// 1 keydown = 1 синхронный шаг; бой по маршруту — авторазрешение
// 9999 → Space. АДАПТАЦИЯ: press/release в этом харнесе берут
// CODE, не event.
function walkDungeonTo8(h, tx, ty) {
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const d0 = g.dungeon;
  const W = d0.width, H = d0.height;
  const sx = d0.x, sy = d0.y;
  if (sx === tx && sy === ty) return;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const startKey = sx + ',' + sy;
  const prev = new Map([[startKey, null]]);
  let frontier = [{ x: sx, y: sy }];
  let found = false;
  outer:
  for (let depth = 0; depth < W * H && !found; depth++) {
    const next = [];
    for (const cur of frontier) {
      for (const [dx, dy] of DIRS) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (d0.cells[ny * W + nx] !== D.CELL_FLOOR) continue;
        const k = nx + ',' + ny;
        if (prev.has(k)) continue;
        prev.set(k, cur.x + ',' + cur.y);
        if (nx === tx && ny === ty) { found = true; break outer; }
        next.push({ x: nx, y: ny });
      }
    }
    frontier = next;
  }
  assert.ok(found,
    'walkDungeonTo8: (' + tx + ',' + ty + ') недостижимо от (' + sx
    + ',' + sy + ') (сценарий)');
  const path = [];
  for (let k = tx + ',' + ty; k !== startKey; k = prev.get(k)) {
    const [x, y] = k.split(',').map(Number);
    path.unshift({ x, y });
  }
  for (const step of path) {
    const before = g.dungeon;
    const code = keydownFor(step.x - before.x, step.y - before.y);
    press(h, code);
    release(h, code);
    const after = g.dungeon;
    assert.equal(after.x, step.x,
      'walkDungeonTo8: герой перешёл на (' + step.x + ',' + step
      .y + ') — x');
    assert.equal(after.y, step.y,
      'walkDungeonTo8: герой перешёл на (' + step.x + ',' + step
      .y + ') — y');
    if (G.combatUI.isActive()) {
      const c = G.combatUI.current();
      for (const m of c.units.filter((x) => x.side === 'mob' && x.alive)) {
        G.combatInternals.dealDamageToMob(c, m, 9999);
      }
      assert.ok(c.result && c.result.outcome === 'victory',
        'walkDungeonTo8: бой по маршруту — победа');
      G.combatUI.handleCode('Space');
      assert.equal(G.combatUI.isActive(), false,
        'walkDungeonTo8: бой закрыт (Space → finish)');
    }
  }
}

test('000212 DH-8 (fullchain, пин): depth>1 (основное состояние) — enterDungeon → [E] на stairs-down → depth 2 → кадр → #hud zIndex «25» (z-lift под оверлеем) + строка «Глубина: 2»', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon — состояние подземелья (отладочный вход)');
  assert.equal(g.dungeon.kind, 'dungeon', 'kind dungeon');
  assert.equal(g.dungeon.depth, 1, 'debug-вход — depth 1');
  const stairs = g.dungeon.stairsDown;
  assert.ok(stairs,
    'фикстура: stairsDown выставлен (stairsDownFor — детерминировано)');
  walkDungeonTo8(h, stairs.x, stairs.y);
  assert.deepEqual({ x: g.dungeon.x, y: g.dungeon.y },
    { x: stairs.x, y: stairs.y }, 'герой — на клетке stairs-down');
  const errBefore = h.errors.length;
  press(h, 'KeyE');
  release(h, 'KeyE');
  assert.equal(g.dungeon.depth, 2,
    '[E] на stairs-down — depth 2 (спавн на клетке-выходе = entrance)');
  h.frameFn(NOW + 16);
  assert.equal(h.hud.style.zIndex, '25',
    'RED: depth>1 (основное состояние) — #hud ПОДНЯТ (inline zIndex 25 '
    + '> оверлей 20; DH-1 покрывает только depth 1)');
  assert.ok(String(h.hud.textContent).includes('Глубина: 2'),
    'depth>1: строка «Глубина: 2» (floorStatusLine, DH-2): '
    + JSON.stringify(String(h.hud.textContent)));
  assert.equal(h.errors.length, errBefore,
    'без новых console.error: ' + h.errors.slice(errBefore).join('; '));
});

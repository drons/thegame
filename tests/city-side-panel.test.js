// Задача 000247: Город/подземелье: убрать правую панель с информацией,
// показать левую панель (сейчас её нет). ТЗ: tasks/pending/000247.md.
// Контракт: memory/000247-city-dungeon-panels.md (D1-D13).
//
// Идентификация панелей (контракт §0):
//   * «Правая панель» = .combat-side в оверлее локации
//     (.combat-overlay.dungeon-overlay — ОДИН оверлей на оба kind'а,
//     src/dungeon-ui.js build()): город (kind 'city') — панель
//     СОЗДАЁТСЯ (stateEl .combat-state + logEl .combat-log + hint
//     .combat-state); подземелье (kind 'dungeon') — НЕ создаётся
//     (000229). 000247: город — тоже НЕ создаётся (чистое удаление,
//     «совсем убрать»: лог/хинт НЕ переносятся в #hud).
//   * «Левая панель» = #hud — ЕДИНСТВЕННОЕ инфо-окно (000129/000212):
//     в подземелье УЖЕ видно (z-лифт '25' — 000212), в городе СКРЫТО
//     (z-auto под непрозрачным оверлеем z-20: скоп z-лифта 000212 —
//     конъюнкт dungeonState.kind === 'dungeon' в main.js frame()).
//     000247: лифт — ОБА kind'а (строки города/подземелья в #hud уже
//     пишутся каждый кадр — 000106/000212; меняется только inline
//     zIndex). Боевой .combat-side (combat-ui.js,
//     .combat-overlay--combat) — ДРУГОЙ оверлей — бит-в-бит
//     (000124/000171/000178/000199/000246).
//
// КРАСНЫЕ (CR-1, CL-1, CL-2, CSS-1 — expectedRedCount = 4; падают на
// master ОСМЫСЛЕННО: функциональность ТЗ ещё не существует — не
// синтаксис/окружение):
//   * CR-1 (node) — город: в .dungeon-overlay 0 .combat-side/
//     .combat-state/.combat-log; оверлей = canvas (1 прямой ребёнок);
//     рендер жив (drawCalls > 0); errors 0.
//     (master: build() city-ветка — 1 .combat-side + 2 .combat-state
//     + 1 .combat-log, оверлей = canvas + side — 2 ребёнка.)
//   * CL-1 (fullchain) — авто-вход в город + кадр: то же в
//     production-пути (main.js enterCity → dungeonUI.start); canvas
//     на месте; errors не растут.
//   * CL-2 (fullchain) — город + кадр: h.hud.style.zIndex === '25'
//     (левая панель ВИДИМА: общий динамический слот 000206);
//     city-HUD цел (1-я строка — мир-координаты, «--- <имя> (x, y)
//     ---», «До выхода: ~N», «[I] персонаж» — 000106 байт-в-байт);
//     выход ([E] на едином тайле-двери, 000177) + кадр → zIndex
//     falsy + world-HUD. (master: з-лифт требует kind 'dungeon' —
//     город: zIndex '' — окно под оверлеем z-20.)
//   * CSS-1 (node, статика) — мёртвое правило .dungeon-overlay
//     .combat-side УБРАНО из index.html (панель в обоих kind'ах
//     удалена — правило мертво; ТЗ «включая мёртвый CSS/элементы»);
//     НА МЕСТЕ: база .combat-side 320px, база .combat-log 170px,
//     бой 256px, .combat-overlay--build min(520px,94vw),
//     .dungeon-overlay (display block, фон #0a0d12) + canvas.
//     (master: правило есть — 270px.)
//
// ГАРДЫ (ЗЕЛЁНЫЕ с первой стадии — фиксация границ, прецедент
// RW-G1 000229):
//   * CR-2 (node) — подземелье: 0 панель (000229); оверлей = canvas;
//     рендер жив (пол #182029); errors 0.
//   * CL-3 (fullchain) — подземелье (enterDungeon) + кадр: 0 панель
//     (000229) + #hud '25' (000212) + биты dungeon-HUD (1-я строка —
//     имя, без «---»/«групп(ы)», «До выхода: ~N»).
//   * CL-4 (fullchain) — no over-fix: debug-БОЙ из ГОРОДА (старт
//     startCombatAt location-независим — проверено зондом): боевой
//     .combat-side ЕСТЬ и бит-в-бит (ровно 7 детей [turnorder,
//     hpbar, mpbar, state, log, quicklist, actions]; .combat-actions
//     — ПОСЛЕНЕДНИЙ — 000246); в бою подъём #hud СНЯТ (zIndex ≠ '25'
//     — конъюнкт !inCombat; после 000247 конъюнкт действует и в
//     городе — новое состояние); после резолва (мобы 9999 → Space)
//     город цел (kind 'city', dungeonUI активен); errors не растут.
//     «После боя city-оверлей = canvas только» и «после боя в городе
//     z '25» заперты RED-тестами CL-1/CL-2 (на master оба факта
//     ложны — город: canvas+side, z '' — повторить их здесь гардом
//     нельзя: сломали бы зелёность первой стадии). Боевой бит-в-бит
//     сверх CL-4 дублируется пины 000124/000171/000178/000199/
//     000246/000252 (combat-*, ui.test.js, combat-layout).
//
// Харнес: самодостаточный (дубль конвенций): (а) fullchain —
// vm-песочница по tests/dungeon-info-window.test.js (CHAIN из
// index.html, Proxy-DOM, WebGL/Image-стабы, h.hud, frameFn, drain;
// вход в город — enterCity по паттерну DH-7(b): walkTiles по BFS +
// bounded re-entry ≤3 (000135); выход — [E] на едином тайле (000177);
// debug-вой — g.actions.startCombat() + resolveCombat (мобы 9999 →
// Space)); (б) node-часть — частичная цепочка loadDungeonUi +
// makeState/makeCityState по tests/dungeon-side-panel.test.js
// (фабрики дублируются в файл). Ошибки на чистых путях — errors не
// растут.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const D = require('../src/dungeon.js');
const CITIES = require('../src/cities.js');

const ROOT = path.join(__dirname, '..');

// ============================================================
// CSS-статика (CSS-1): разбор <style> index.html (комментарии
// сняты ДО разбора — скобка в комментарии режет правило; паттерн
// tests/craft-layout.test.js).
// ============================================================

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const style = (() => {
  const m = html.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  assert.ok(m, '<style>-блок найден в index.html');
  return m[1].replace(/\/\*[\s\S]*?\*\//g, ' ');
})();

function parseDecls(block) {
  const decls = {};
  for (const part of block.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const prop = part.slice(0, i).trim().toLowerCase();
    if (prop) decls[prop] = part.slice(i + 1).trim();
  }
  return decls;
}

const RULES = (() => {
  const out = [];
  for (const m of style.matchAll(/([^{}@]+)\{([^}]*)\}/g)) {
    for (const selRaw of m[1].split(',')) {
      const sel = selRaw.trim();
      if (!sel) continue;
      out.push({ selector: sel, decls: parseDecls(m[2]) });
    }
  }
  return out;
})();

function ruleExact(selector) {
  const r = RULES.find((x) => x.selector === selector);
  assert.ok(r, 'CSS-правило ' + selector + ' { … } найдено в index.html');
  return r.decls;
}

// ============================================================
// Full-chain vm-песочница (конвенция tests/dungeon-info-
// window.test.js): вся цепочка index.html, __game + Game.
// ============================================================

// Цепочка скриптов — из index.html (не хардкод, паттерн main-visuals).
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

// Резолв боевого оверлея (паттерн DH-6): мобы 9999 → Space.
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
// ПЕРВЫЙ успешный шаг после боя, приходящийся на тайл входа. Герой
// остаётся НА тайле входа (000177) — [E] там = выход.
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

// Боевой оверлей (.combat-overlay--combat, src/combat-ui.js).
function combatOverlayOf(h) {
  const ovs = findAll(h.body, '.combat-overlay--combat');
  return ovs.length ? ovs[ovs.length - 1] : null;
}

// ============================================================
// Node-часть (CR-1/CR-2): частичная цепочка loadDungeonUi +
// фабрики makeState/makeCityState (дубль tests/dungeon-side-
// panel.test.js).
// ============================================================

// Canvas 2D: методы — no-op, свойства (fillStyle и т.п.) —
// записываются. Каждый ВЫЗОВ метода — в el.drawCalls как
// [имя, args, fillStyle] (fillStyle на момент вызова).
function makeContext2dNode(el) {
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

function makeElNode(tag, buttons) {
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
    addEventListener(type, fn, opts) {
      (this.listeners[type] || (this.listeners[type] = [])).push([fn, opts]);
    },
    querySelectorAll() { return buttons; },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
  };
  if (tag === 'canvas') {
    el.width = 0;
    el.height = 0;
    el.getContext = () => makeContext2dNode(el);
  }
  return el;
}

// Загрузка цепочки src-скриптов (порядок index.html: global-
// settings, perlin, map, controls, dungeon, locations, dungeon-ui,
// motion) + dungeon-ui.js в vm-песочнице (дубль loadDungeonUi
// tests/dungeon-ui.test.js).
function loadDungeonUi() {
  const keydown = [];
  const errors = [];
  const buttons = [];
  const document = {
    createElement: (tag) => {
      const el = makeElNode(tag, buttons);
      if (tag === 'button') buttons.push(el);
      return el;
    },
    body: makeElNode('body', buttons),
  };
  const window = {
    innerWidth: 800,
    innerHeight: 600,
    addEventListener: (type, fn) => { if (type === 'keydown') keydown.push(fn); },
  };
  const sandbox = {
    console: { error: (m) => errors.push(String(m)) },
    document, window,
  };
  vm.createContext(sandbox);
  const chain = ['global-settings.js', 'perlin.js', 'map.js',
    'controls.js', 'dungeon.js', 'locations.js', 'dungeon-ui.js',
    'motion.js'];
  const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
  for (const f of chain) vm.runInContext(src(f), sandbox, { filename: f });
  return { G: sandbox.Game, keydown, body: document.body, errors, window };
}

// Canvas подземелья (создаётся build() при старте).
function findCanvas(el) {
  if (el.tagName === 'canvas') return el;
  for (const ch of el.children || []) {
    const found = findCanvas(ch);
    if (found) return found;
  }
  return null;
}

// Элемент с className, содержащим cls (рекурсивно, в порядке обхода).
function findByClass(el, cls) {
  if (typeof el.className === 'string'
      && el.className.split(' ').includes(cls)) return el;
  for (const ch of el.children || []) {
    const found = findByClass(ch, cls);
    if (found) return found;
  }
  return null;
}

// Все элементы с className, содержащим cls (рекурсивно, в порядке
// обхода): у панели города (до 000247) «combat-state» — ДВА
// (stateEl + hint — одноимённый класс по паттерну combat-ui).
function allByClass(el, cls) {
  const out = [];
  (function walk(n) {
    if (typeof n.className === 'string' && n.className.includes(cls)) {
      out.push(n);
    }
    for (const ch of n.children || []) walk(ch);
  })(el);
  return out;
}

// Минимальное состояние подземелья — форма main.js (maybeEnterDungeon):
// { dg, contents, x, y, log }; ПОЛЕ KIND НЕТ (legacy = dungeon —
// production dungeonState locations.js — kind 'dungeon'; фикстура
// без kind должна вести себя как подземелье). 5×5, стены по
// периметру, пол внутри, exit = entrance (1,1) (000177).
function makeState() {
  const w = 5, h = 5;
  const cells = new Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const wall = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      cells[y * w + x] = wall ? 0 : 1;
    }
  }
  return {
    dg: {
      type: 0, // DUNGEON_TYPES
      width: w, height: h, cells,
      entrance: { x: 1, y: 1 },
      exit: { x: 1, y: 1 },
    },
    contents: { chests: [], mobs: [], deposits: [] },
    x: 1, y: 1,
    log: ['простая пещера: вход.'],
  };
}

// Состояние города — форма main.js enterCity (000105): dg = layout
// (createCityLayout), contents = null, kind = 'city', name =
// название_карты, первая клетка — layout.entrance.
function makeCityState() {
  const d = CITIES.createCityLayout(-119, -104, 1);
  const name = 'Хутор';
  return {
    dg: d,
    contents: null,
    kind: 'city',
    name,
    x: d.entrance.x,
    y: d.entrance.y,
    prevX: d.entrance.x,
    prevY: d.entrance.y,
    log: [name + ': вход.'],
    cityContents: null,
  };
}

// ============================================================
// CR-1..CL-4, CSS-1
// ============================================================

test('000247 CR-1 (RED, node): город — правая инфопанель УБРАНА СОВСЕМ: 0 .combat-side/.combat-state/.combat-log; оверлей = canvas (1 прямой ребёнок); рендер жив (drawCalls > 0); errors 0', () => {
  const loaded = loadDungeonUi();
  const G = loaded.G;
  const s = makeCityState();
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 40 });
  assert.equal(G.dungeonUI.isActive(), true, 'dungeonUI активен');
  const sides = allByClass(loaded.body, 'combat-side');
  assert.equal(sides.length, 0,
    'RED: .combat-side НЕТ (master: build() city-ветка — панель '
    + 'создаётся — факт 1): '
    + sides.map((n) => JSON.stringify(String(n.textContent).slice(0, 60)))
      .join(' ; '));
  const states = allByClass(loaded.body, 'combat-state');
  assert.equal(states.length, 0,
    'RED: .combat-state (stateEl/hint) НЕТ — панель убрана совсем: '
    + states.map((n) => JSON.stringify(String(n.textContent).slice(0, 60)))
      .join(' ; '));
  const logs = allByClass(loaded.body, 'combat-log');
  assert.equal(logs.length, 0,
    'RED: .combat-log (журнал) НЕТ — панель убрана совсем');
  const overlay = findByClass(loaded.body, 'dungeon-overlay');
  assert.ok(overlay, 'оверлей .dungeon-overlay на месте (экран цел)');
  assert.ok(String(overlay.className).includes('combat-overlay'),
    'оверлей — тот же класс локации (combat-overlay dungeon-overlay)');
  assert.equal(overlay.children.length, 1,
    'RED: оверлей = canvas — ОДИН прямой ребёнок (master: canvas + '
    + 'side — 2): '
    + overlay.children.map((c) => c.tagName + '.' + c.className).join(' | '));
  assert.equal(overlay.children[0].tagName, 'canvas',
    'единственный ребёнок оверлея — canvas');
  const canvas = findCanvas(overlay);
  assert.ok(canvas, 'canvas — в оверлее (экран не сломан)');
  assert.ok(canvas.drawCalls.length > 0,
    'рендер жив: drawCalls > 0 (start() — событийный рендер)');
  assert.equal(loaded.errors.length, 0,
    'чистый вход в город — без console.error: ' + loaded.errors.join('; '));
});

test('000247 CR-2 (гард, node): подземелье — 0 панель (000229): 0 .combat-side/.combat-state/.combat-log; оверлей = canvas; рендер жив (пол #182029); errors 0', () => {
  const loaded = loadDungeonUi();
  const G = loaded.G;
  const s = makeState();
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 40 });
  assert.equal(G.dungeonUI.isActive(), true, 'dungeonUI активен');
  assert.equal(allByClass(loaded.body, 'combat-side').length, 0,
    'подземелье: .combat-side НЕТ (000229)');
  assert.equal(allByClass(loaded.body, 'combat-state').length, 0,
    'подземелье: .combat-state (hint) НЕТ (000229)');
  assert.equal(allByClass(loaded.body, 'combat-log').length, 0,
    'подземелье: .combat-log (журнал) НЕТ (000229)');
  const overlay = findByClass(loaded.body, 'dungeon-overlay');
  assert.ok(overlay, 'оверлей .dungeon-overlay на месте (экран цел)');
  assert.ok(String(overlay.className).includes('combat-overlay'),
    'оверлей — тот же класс локации (combat-overlay dungeon-overlay)');
  assert.equal(overlay.children.length, 1,
    'подземелье: оверлей = canvas (один прямой ребёнок, 000229)');
  assert.equal(overlay.children[0].tagName, 'canvas',
    'единственный ребёнок оверлея — canvas');
  const canvas = findCanvas(overlay);
  assert.ok(canvas, 'canvas — в оверлее (экран не сломан)');
  assert.ok(canvas.drawCalls.length > 0,
    'рендер жив: drawCalls > 0 (start() — событийный рендер)');
  assert.ok(canvas.drawCalls.some(
      (c) => c[0] === 'fillRect' && c[2] === '#182029'),
    'рендер жив: пол #182029 (fillRect) нарисован');
  assert.equal(loaded.errors.length, 0,
    'чистый вход — без console.error: ' + loaded.errors.join('; '));
});

test('000247 CL-1 (RED, fullchain): город (авто-вход) + кадр — в .dungeon-overlay 0 .combat-side/.combat-state/.combat-log; canvas на месте; errors не растут', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const r = enterCity(h, NOW + 64, myMap, (c) => c.fp >= 2);
  assert.equal(g.dungeon.kind, 'city', 'город (kind city)');
  const errBefore = h.errors.length;
  h.frameFn(r.now + 200);
  const overlay = dungeonOverlayOf(h);
  assert.ok(overlay, 'экран города — .dungeon-overlay в body');
  const sides = findAll(overlay, '.combat-side');
  assert.equal(sides.length, 0,
    'RED: .combat-side НЕТ (master: city-ветка build() — панель '
    + 'висит справа — факт 1): '
    + sides.map((n) => JSON.stringify(String(n.textContent).slice(0, 60)))
      .join(' ; '));
  const states = findAll(overlay, '.combat-state');
  assert.equal(states.length, 0,
    'RED: .combat-state (stateEl/hint) НЕТ — панель убрана совсем: '
    + states.map((n) => JSON.stringify(String(n.textContent).slice(0, 60)))
      .join(' ; '));
  const logs = findAll(overlay, '.combat-log');
  assert.equal(logs.length, 0,
    'RED: .combat-log (журнал) НЕТ — панель убрана совсем');
  assert.ok(overlay.children.some((c) => c.tagName === 'canvas'),
    'canvas на месте в оверлее (экран города не сломан)');
  assert.equal(h.errors.length, errBefore,
    'чистый вход в город — без новых console.error: '
    + h.errors.slice(errBefore).join('; '));
});

test('000247 CL-2 (RED, fullchain): город — левая панель #hud ВИДИМА (zIndex «25» — общий динамический слот 000206); city-HUD цел; выход [E] — подъём снят + world-HUD', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const r = enterCity(h, NOW + 64, myMap, (c) => c.fp >= 2);
  const dg = g.dungeon;
  assert.equal(dg.kind, 'city', 'город (kind city)');
  const errBefore = h.errors.length;
  h.frameFn(r.now + 200);
  assert.equal(h.hud.style.zIndex, '25',
    'RED: город — #hud ПОДНЯТ над оверлеем (000247: лифт — ОБА '
    + 'kind\'а; master: конъюнкт kind === \'dungeon\' — город z \'\' — '
    + 'окно под оверлеем z-20): ' + JSON.stringify(h.hud.style.zIndex));
  // city-HUD — БАЙТ-В-БАЙТ (000106; текст задачи НЕ меняет — меняется
  // только inline zIndex).
  const cityText = String(h.hud.textContent);
  assert.equal(
    cityText.split('\n')[0],
    'Флогистон, ур. ' + g.state.hero.level + '  ('
      + g.state.player.x + ', ' + g.state.player.y + ')',
    'city-HUD: 1-я строка — мир-координаты: ' + JSON.stringify(cityText));
  assert.ok(
    cityText.includes('--- ' + dg.name + ' (' + dg.x + ', ' + dg.y
      + ') ---'),
    'city-HUD: рамка «--- <имя> (x, y) ---» на месте: '
    + JSON.stringify(cityText));
  assert.ok(cityText.includes('До выхода: ~'),
    'city-HUD: «До выхода: ~N» на месте: ' + JSON.stringify(cityText));
  assert.ok(cityText.includes('[I] персонаж'),
    'city-HUD: строка «[I] персонаж» на месте: ' + JSON.stringify(cityText));
  assert.ok(!cityText.includes('групп(ы)'),
    'city-HUD: без строк групп (000106 — как раньше): '
    + JSON.stringify(cityText));
  // Выход: герой НА едином тайле-двери после авто-входа (000177) —
  // [E] сразу выводит.
  press(h, 'KeyE');
  release(h, 'KeyE');
  assert.equal(g.dungeon, null, '[E] на едином тайле — выход из города');
  assert.equal(G.dungeonUI.isActive(), false, 'dungeonUI закрыт');
  h.frameFn(r.now + 400);
  assert.ok(!h.hud.style.zIndex,
    'выход: подъём снят (zIndex falsy — z-auto, как в мире)');
  const worldText = String(h.hud.textContent);
  assert.equal(
    worldText.split('\n')[0],
    'Флогистон, ур. ' + g.state.hero.level + '  ('
      + g.state.player.x + ', ' + g.state.player.y + ')',
    'world-HUD восстановлен: 1-я строка — мир-координаты: '
    + JSON.stringify(worldText));
  assert.ok(worldText.includes('Местность: '),
    'world-HUD восстановлен: «Местность: » на месте');
  assert.equal(h.errors.length, errBefore,
    'без новых console.error: ' + h.errors.slice(errBefore).join('; '));
});

test('000247 CL-3 (гард, fullchain): подземелье — 0 панель (000229) + #hud «25» (000212) + биты dungeon-HUD', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon — состояние подземелья (отладочный вход)');
  assert.equal(g.dungeon.kind, 'dungeon', 'kind dungeon');
  const errBefore = h.errors.length;
  h.frameFn(NOW + 16);
  const overlay = dungeonOverlayOf(h);
  assert.ok(overlay, 'экран подземелья — .dungeon-overlay в body');
  assert.equal(findAll(overlay, '.combat-side').length, 0,
    'подземелье: .combat-side НЕТ (000229)');
  assert.equal(findAll(overlay, '.combat-state').length, 0,
    'подземелье: .combat-state (hint) НЕТ (000229)');
  assert.equal(findAll(overlay, '.combat-log').length, 0,
    'подземелье: .combat-log (журнал) НЕТ (000229)');
  assert.equal(overlay.children.length, 1,
    'подземелье: оверлей = canvas (один прямой ребёнок)');
  assert.equal(overlay.children[0].tagName, 'canvas',
    'единственный ребёнок оверлея — canvas');
  // Единое инфо-окно 000212 — НЕ тронуто (regression-гард): z-лифт
  // '25', dungeon-формат побайтово.
  assert.equal(h.hud.style.zIndex, '25',
    '#hud поднят над оверлеем (000212): '
    + JSON.stringify(h.hud.style.zIndex));
  const hudText = String(h.hud.textContent);
  const name = G.DUNGEON_NAMES[g.dungeon.type];
  assert.ok(name, 'сценарий: тип подземелья именуется');
  assert.equal(hudText.split('\n')[0],
    'Флогистон, ур. ' + g.state.hero.level + '  (' + name + ')',
    '1-я строка #hud — имя подземелья: ' + JSON.stringify(hudText));
  assert.ok(!hudText.includes('---'),
    'без рамки «---» (000212): ' + JSON.stringify(hudText));
  assert.ok(!hudText.includes('групп(ы)'),
    'без счётчика «групп(ы)» (000212): ' + JSON.stringify(hudText));
  assert.ok(/До выхода: ~\d+ клеток/.test(hudText),
    '«До выхода: ~N клеток» на месте: ' + JSON.stringify(hudText));
  assert.equal(h.errors.length, errBefore,
    'чистый вход — без новых console.error: '
    + h.errors.slice(errBefore).join('; '));
});

test('000247 CL-4 (гард, fullchain): no over-fix — бой из города бит-в-бит (7 детей .combat-side, .combat-actions последний — 000246); в бою подъём #hud снят (zIndex ≠ «25» — конъюнкт !inCombat); после боя город цел', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const r = enterCity(h, NOW + 64, myMap, (c) => c.fp >= 2);
  assert.equal(g.dungeon.kind, 'city', 'город (kind city)');
  h.frameFn(r.now + 200);
  const errBefore = h.errors.length;
  // Debug-бой (000096): startCombatAt — location-независим (работает
  // из города: герой на входном тайле, terrain из map.tileAt).
  const c0 = g.actions.startCombat();
  assert.ok(c0, 'startCombat — бой начат (отладочный, из города)');
  assert.equal(G.combatUI.isActive(), true, 'боевой оверлей активен');
  h.frameFn(r.now + 400);
  const combat = combatOverlayOf(h);
  assert.ok(combat, 'боевой оверлей — .combat-overlay--combat в body');
  const sides = findAll(combat, '.combat-side');
  assert.equal(sides.length, 1,
    'боевой оверлей: ровно 1 .combat-side (бой НЕ тронут)');
  const side = sides[0];
  const classes = side.children.map((ch) =>
    String(ch.className || '').split(/\s+/).filter(Boolean)[0]);
  assert.deepEqual(classes,
    ['combat-turnorder', 'combat-hpbar', 'combat-mpbar', 'combat-state',
      'combat-log', 'combat-quicklist', 'combat-actions'],
    'боевой .combat-side — 7 детей в порядке (000036/000038/000199/'
    + '000194/000246): ' + JSON.stringify(classes));
  assert.equal(findAll(side, '.combat-actions').length, 1,
    '.combat-actions на месте (000246)');
  assert.equal(findAll(side, '.combat-log').length, 1,
    'боевой .combat-log на месте');
  assert.equal(findAll(side, '.combat-state').length, 1,
    'боевой .combat-state на месте');
  assert.equal(findAll(side, '.combat-quicklist').length, 1,
    'боевой .combat-quicklist на месте');
  // Конъюнкт !inCombat: в бою подъём #hud СНЯТ (после 000247 лифт
  // действует и в городе — конъюнкт обязан его снимать в бою).
  assert.ok(h.hud.style.zIndex !== '25',
    'в бою (в городе) подъём СНЯТ — #hud под боевым оверлеем: '
    + JSON.stringify(h.hud.style.zIndex));
  // Город под боем цел: локация не закрыта.
  const overlay = dungeonOverlayOf(h);
  assert.ok(overlay, 'город жив под боевым оверлеем — оверлей в body');
  assert.ok(overlay.children.some((c) => c.tagName === 'canvas'),
    'город: canvas на месте под боем');
  // Резолв (мобы 9999 → Space) — бой закрыт, город цел.
  resolveCombat(G);
  h.frameFn(r.now + 600);
  assert.equal(G.combatUI.isActive(), false, 'бой закрыт');
  assert.equal(g.dungeon.kind, 'city', 'город цел: kind city');
  assert.equal(G.dungeonUI.isActive(), true, 'город цел: dungeonUI активен');
  assert.equal(h.errors.length, errBefore,
    'без новых console.error: ' + h.errors.slice(errBefore).join('; '));
});

test('000247 CSS-1 (RED, static): мёртвое правило .dungeon-overlay .combat-side УБРАНО из index.html; НА МЕСТЕ: база .combat-side 320px / база .combat-log 170px / бой 256px / .combat-overlay--build min(520px,94vw) / .dungeon-overlay + canvas', () => {
  const dead = RULES.filter(
    (r) => r.selector === '.dungeon-overlay .combat-side');
  assert.equal(dead.length, 0,
    'RED: правило .dungeon-overlay .combat-side УБРАНО (панель в '
    + 'обоих kind\'ах удалена — правило мертво; ТЗ «включая мёртвый '
    + 'CSS/элементы, если остаются»): '
    + (dead.length ? 'НА МЕСТЕ, width: ' + dead[0].decls['width'] : '—'));
  assert.equal(ruleExact('.combat-side')['width'], '320px',
    'база .combat-side — 320px (бой/постройка — не тронута)');
  assert.equal(ruleExact('.combat-log')['height'], '170px',
    'база .combat-log — 170px (бой — не тронут)');
  assert.equal(ruleExact('.combat-overlay--combat .combat-side')['width'],
    '256px', 'панель боя (скоуп 000124) — 256px');
  assert.equal(ruleExact('.combat-overlay--build .combat-side')['width'],
    'min(520px, 94vw)',
    'меню постройки (.combat-overlay--build) — не тронуто');
  const dov = ruleExact('.dungeon-overlay');
  assert.equal(dov['display'], 'block', '.dungeon-overlay — display block');
  assert.equal(dov['background'], '#0a0d12',
    '.dungeon-overlay — непрозрачный фон #0a0d12');
  assert.ok(ruleExact('.dungeon-overlay canvas'),
    '.dungeon-overlay canvas — на месте (полноэкранный canvas)');
});

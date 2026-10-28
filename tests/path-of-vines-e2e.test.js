// =====================================================================
// 000235.12.01 — path_of_vines: «плотная местность не замедляет»
//
// Контракт: memory/000235.12.01-path-of-vines-mechanic.md (§5 — карта
// тестов). ТЗ: tasks/pending/000235.12.01.md. Родитель — 000235.12
// (волна Природа: path_of_vines 000167 «Тропа лоз», вне бой, {days: 1};
// предикат G.Spells.isHeroPathOfVines и запись outOfCombatEffects
// СУЩЕСТВУЮТ — потребитель-стоимость вводится этой задачей).
//
// Механика (контракт §1):
//   * Плотный тайл мира = TERRAIN_DATA[t.terrain].thick === true
//     (НОВОЕ табличное поле; {FOREST} только).
//   * Базовая цена: мировой шаг НА плотный тайл — 2 хода; на всё
//     остальное проходимое — 1 ход (общий счётчик steps_per_day).
//   * Активная запись path_of_vines (expiresDay >= day) — шаг на
//     плотный 1 ход (плотное = открытое).
//   * Скоуп — ТОЛЬКО мировой frame loop; подземелье/город — 1/тайл.
//   * Истечение — onDay (expiresDay <= day); бой запись НЕ снимает.
//   * D3: стоимость — чистая функция (тайл, запись, день); ноль
//     нового rng.
//
// Фикстура (верифицирована на f2a508d, generateSeedPixels — мир
// детерминирован):
//   * спавн (0,0) = трава; (1,0) = трава + hasMobGroup (V-3).
//   * (3,36) = трава, passable, без группы/постройки — позиция-сейв.
//   * (3,37) = лес (FOREST), passable, без группы/постройки —
//     ближайший лес к маршруту (Чевышёв r = 37 от спавна).
//
// Краснота (expectedRedCount = 2): V-1 и V-1c падают на ТЕКУЩЕМ коде
// содержательно — assertion expected 2 / actual 1: консьюмера
// стоимости террейна нет (frame loop — clock.addStep(1) безусловен).
// НЕ SyntaxError/ReferenceError: цепочка index.html не тронута,
// сэндбокс стартует, харнес тот же, что в spellbook-oc-e2e.
// V-1b/V-2/V-3/V-4 — guards: зелёные с момента добавления (защита
// эффекта/скоупа/босемантики/D3, не детекторы изменения).
//
// Харнес-хелперы — дубли spellbook-oc-e2e.test.js (boot/seedSave07/
// mkHero07/learn/clickRow/makeStepper/host/saveHero/resolveCombat) и
// dungeon-city-time-e2e.test.js (enterDungeonClean/asideDir/
// dungeonStepTo/dungeonPingPong/cityAside/cityStepTo/afterSteps).
// =====================================================================

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const S = require('../src/save.js');
const P = require('../src/player.js');

const ROOT = path.join(__dirname, '..');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));
const NOW = 1000; // performance.now() в песочнице заморожен на NOW

const PRIMARY = {
  strength: 1, dexterity: 1, constitution: 10,
  intelligence: 10, wisdom: 10, charisma: 1,
};

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

// --- «Снисходительный» DOM-элемент (дубль spellbook-oc-e2e) ---
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
      return () => undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function makeStorage(seed) {
  const m = new Map();
  if (seed != null) m.set(S.SAVE_KEY, JSON.stringify(seed));
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
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl() : makeContext2d(gameCanvas));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? makeContext2d(spriteCanvas) : null);
  const storage = makeStorage(seed);
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

const drain = () => new Promise((r) => setImmediate(r));

async function boot(seed) {
  const h = bootSandbox(seed);
  await drain();
  await drain();
  await drain();
  const g = h.sandbox.__game;
  assert.ok(g, 'globalThis.__game выставлен (main.js выполнен)');
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет (порядок цепочки — load-clean 000038): '
    + h.errors.join('; '));
  h.frameFn = h.raf[h.raf.length - 1];
  return h;
}

// --- Ввод ---
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

// Резолв боевого оверлея: мобы 9999 → Space. Эфир НЕ убиваем.
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

// --- Ходьба по миру (для enterCity; протокол city-screen) ---
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
  for (let i = 0; i < 4; i++) {
    now += 200;
    h.frameFn(now);
  }
  return now;
}

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
        if (t.hasBuilding) continue;
        next.push({ x: nx, y: ny });
      }
    }
    frontier = next;
  }
  return null;
}

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

function safeWorldNeighbor(G, myMap, from) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of DIRS) {
    const t = myMap.tileAt(from.x + dx, from.y + dy);
    if (!t.passable || t.hasMobGroup || t.hasBuilding) continue;
    return [from.x + dx, from.y + dy];
  }
  return null;
}

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

// --- Подземелье: debug-вход и шаги (дубль dungeon-city-time-e2e) ---
function enterDungeonClean(h) {
  const g = h.sandbox.__game;
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon — состояние подземелья (отладочный вход)');
  ds.contents = { mobs: [], chests: [], seed: 1, step: 0 };
  return ds;
}

function asideDir(G, d) {
  const w = d.width;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of dirs) {
    const nx = d.entrance.x + dx, ny = d.entrance.y + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= d.height) continue;
    if (nx === d.exit.x && ny === d.exit.y) continue;
    if (d.cells[ny * w + nx] === G.CELL_FLOOR) return { x: nx, y: ny };
  }
  return null;
}

function dungeonStepTo(h, tx, ty) {
  const g = h.sandbox.__game;
  const dx = tx - g.dungeon.x, dy = ty - g.dungeon.y;
  assert.ok(Math.abs(dx) + Math.abs(dy) === 1,
    'шаг на соседнюю клетку (манхэттен = 1)');
  press(h, keydownFor(dx, dy));
  assert.equal(g.dungeon.x, tx, 'шаг прошёл: x (' + tx + ',' + ty + ')');
  assert.equal(g.dungeon.y, ty, 'шаг прошёл: y (' + tx + ',' + ty + ')');
}

function dungeonPingPong(h, A, n) {
  const g = h.sandbox.__game;
  const S0 = { x: g.dungeon.entrance.x, y: g.dungeon.entrance.y };
  for (let i = 1; i <= n; i++) {
    dungeonStepTo(h, (i % 2 === 1 ? A : S0).x, (i % 2 === 1 ? A : S0).y);
  }
}

// --- Город: шаги (дубль dungeon-city-time-e2e) ---
function cityAside(G, layout) {
  const d = layout;
  const w = d.width;
  const dirs = [[0, -1], [1, 0], [-1, 0], [0, 1]];
  for (const [dx, dy] of dirs) {
    const nx = d.entrance.x + dx, ny = d.entrance.y + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= d.height) continue;
    if (nx === d.exit.x && ny === d.exit.y) continue;
    if (d.cells[ny * w + nx] === G.CELL_FLOOR) return { x: nx, y: ny };
  }
  return null;
}

function cityStepTo(h, tx, ty) {
  const g = h.sandbox.__game;
  const dx = tx - g.dungeon.x, dy = ty - g.dungeon.y;
  assert.ok(Math.abs(dx) + Math.abs(dy) === 1,
    'город: шаг на соседнюю клетку');
  press(h, keydownFor(dx, dy));
  release(h, keydownFor(dx, dy));
  assert.equal(g.dungeon.x, tx, 'город: шаг x (' + tx + ',' + ty + ')');
  assert.equal(g.dungeon.y, ty, 'город: шаг y (' + tx + ',' + ty + ')');
}

// семантика clock.addStep (day.js: steps += n; while (steps >= perDay)
// { steps -= perDay; advanceDay(); }).
function afterSteps(day, steps, perDay, n) {
  const total = steps + n;
  return { day: day + Math.floor(total / perDay), steps: total % perDay };
}

// --- Книга вне боя / герой ---
function dismissStartWindow(h) {
  const g = h.sandbox.__game;
  const sw = g.startWindow;
  assert.ok(sw && typeof sw.hide === 'function',
    'фикстура: __game.startWindow (000138)');
  sw.hide();
  assert.equal(sw.isActive(), false,
    'стартовое окно скрыто (клик «Продолжить»)');
}

function learn(h, ids) {
  const spells = h.sandbox.__game.state.hero.spells;
  assert.ok(Array.isArray(spells), 'сценарий: live hero.spells (массив)');
  for (const id of ids) spells.push(id);
}

function host(o) { return JSON.parse(JSON.stringify(o)); }

// mp героя — ЧЕРЕЗ СЕЙВ (beforeunload → saveNow → data.hero).
function saveHero(h) {
  const bu = h.winListeners['beforeunload'];
  assert.ok(bu && bu.length > 0, 'beforeunload зарегистрирован');
  bu[0]();
  const raw = h.storage.getItem(S.SAVE_KEY);
  assert.ok(raw, 'сейв в localStorage (saveNow вызван)');
  const saved = JSON.parse(raw);
  return saved.data.hero;
}

function clickRow(h, id) {
  const row = h.body.querySelector('[data-spell-id="' + id + '"]');
  assert.ok(row, 'строка ' + id + ' в книге');
  const l = row.listeners && row.listeners.click;
  assert.ok(l && l.length > 0,
    'строка ' + id + ' — свой click-listener (makeEl)');
  l[l.length - 1]();
}

function seedSave07(data) {
  return { version: 1, savedAt: new Date(0).toISOString(), data };
}

function mkHero07(over = {}) {
  return Object.assign(P.createCharacter(), over);
}

// Один монотонный now на сценарий: walk (шаг ОБЯЗАН состояться) и
// tryStep (шаг МОЖЕТ заблокироваться — без ассерта перехода).
function makeStepper(h) {
  const g = h.sandbox.__game;
  let now = NOW;
  const tryStep = (tx, ty) => {
    const px = g.state.player.x, py = g.state.player.y;
    const dx = tx - px, dy = ty - py;
    assert.ok(Math.abs(dx) + Math.abs(dy) === 1,
      'шаг по соседнему тайлу (' + px + ',' + py + ')→(' + tx + ',' + ty + ')');
    const code = keydownFor(dx, dy);
    key(h, code);
    let guard = 0;
    do {
      now += 200;
      h.frameFn(now);
    } while ((g.state.player.x !== tx || g.state.player.y !== ty)
      && ++guard < 12);
    keyup(h, code);
    return { moved: g.state.player.x === tx && g.state.player.y === ty, now };
  };
  const walk = (tx, ty) => {
    const r = tryStep(tx, ty);
    assert.ok(r.moved,
      'сценарий: игрок перешёл на (' + tx + ',' + ty + ')');
    return r.now;
  };
  return { walk, tryStep };
}

// Каст path_of_vines из книги (день 1 → запись expiresDay 2).
function castVines(h) {
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  h.frameFn(NOW + 16);
  key(h, 'KeyB');
  assert.ok(h.body.querySelector('.spellbook-oc'), 'книга открыта');
  clickRow(h, 'path_of_vines');
  assert.equal(G.spellbookOC.isOpen(), false, 'успех → книга закрыта');
  assert.deepEqual(host(g.state.hero.outOfCombatEffects),
    [{ spellId: 'path_of_vines', expiresDay: 2 }],
    'запись {path_of_vines, expiresDay: 2} (день 1 + days 1)');
  return G;
}

// =====================================================================
// V-1 (RED) — контроль БЕЗ заклинания: базовая цена плотного тайла
// (лес) — 2 хода; открытая местность (трава) — 1 ход.
// RED-причина: frame loop (main.js) — clock.addStep(1) безусловен,
// консьюмера стоимости террейна нет → expected 2, actual 1.
// =====================================================================

test('000235.12.01 V-1 (RED): мир без заклинания — шаг на лес стоит 2 хода (база), шаг на траву — 1; без консьюмера стоимости (addStep(1) безусловен) — RED', async () => {
  const h = await boot(seedSave07({ day: 1, position: { x: 3, y: 36 } }));
  dismissStartWindow(h);
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  assert.ok(myMap.tileAt(3, 36).passable
    && myMap.tileAt(3, 36).terrain === G.TERRAIN.GRASS
    && myMap.tileAt(3, 37).passable
    && myMap.tileAt(3, 37).terrain === G.TERRAIN.FOREST
    && !myMap.tileAt(3, 36).hasMobGroup
    && !myMap.tileAt(3, 37).hasMobGroup
    && !myMap.tileAt(3, 37).hasBuilding,
    'фикстура: (3,36) — трава, (3,37) — лес (passable, без группы/постройки)');
  assert.equal(g.state.player.x, 3, 'сид-позиция — x (3,36)');
  assert.equal(g.state.player.y, 36, 'сид-позиция — y');
  assert.equal(g.state.day, 1, 'фикстура: день 1');
  assert.equal(g.state.stepsToday, 0, 'фикстура: 0 шагов в дне');
  assert.deepEqual(host(g.state.hero.outOfCombatEffects), [],
    'фикстура: записей нет (каста НЕТ)');
  const step = makeStepper(h);
  step.walk(3, 37); // лес (FOREST)
  assert.equal(g.state.player.x, 3, 'шаг: x (3,37)');
  assert.equal(g.state.player.y, 37, 'шаг: y');
  assert.equal(g.state.stepsToday, 2,
    'RED: базовая цена плотного тайла (лес) — 2 хода '
    + '(нет консьюмера стоимости террейна: frame loop — addStep(1) '
    + 'безусловен)');
  step.walk(3, 36); // трава (GRASS)
  assert.equal(g.state.stepsToday, 3,
    'открытая местность (трава) — 1 ход (2 + 1)');
});

// =====================================================================
// V-1b (guard) — Тропа лоз АКТИВНА (каст из книги, mp 20→5, запись
// {path_of_vines, expiresDay: 2}): шаг на лес — 1 ход (плотное =
// открытое), шаг на траву — 1. Защита от реализации «thick = 2
// ВСЕГДА, без проверки предиката».
// =====================================================================

test('000235.12.01 V-1b (guard): запись активна (каст, mp 20→5) — шаг на лес стоит 1 ход (плотное = открытое), на траву — 1', async () => {
  const h = await boot(seedSave07({
    day: 1,
    position: { x: 3, y: 36 },
    hero: mkHero07({ mp: 20, primary: PRIMARY }),
  }));
  dismissStartWindow(h);
  const g = h.sandbox.__game;
  assert.equal(g.state.day, 1, 'фикстура: день 1');
  assert.equal(saveHero(h).mp, 20, 'фикстура: mp 20 (сид)');
  assert.equal(g.state.stepsToday, 0, 'фикстура: 0 шагов в дне');
  learn(h, ['path_of_vines']);
  castVines(h);
  assert.equal(saveHero(h).mp, 5, 'mp ровно «мани» (20 − 15)');
  const step = makeStepper(h);
  step.walk(3, 37); // лес — с эффектом: 1 ход
  assert.equal(g.state.player.y, 37, 'шаг: y (3,37)');
  assert.equal(g.state.stepsToday, 1,
    'эффект: шаг на лес — 1 ход (плотное = открытое)');
  step.walk(3, 36); // трава: 1 ход
  assert.equal(g.state.stepsToday, 2,
    'эффект: шаг на траву — 1 ход (1 + 1)');
  assert.deepEqual(host(g.state.hero.outOfCombatEffects),
    [{ spellId: 'path_of_vines', expiresDay: 2 }],
    'запись цела в день каста (2 >= 1)');
});

// =====================================================================
// V-1c (RED) — утро D+1 (setDay(2) = rest → onDay): запись вылетела
// (expiresDay 2 <= 2), базовая цена плотного тайла ВЕРНУЛАСЬ — 2 хода.
// Нога «запись вылетела» — зелёная (onDay существует); нога «2 хода»
// — RED по той же причине, что V-1 (нет консьюмера).
// =====================================================================

test('000235.12.01 V-1c (RED): утро D+1 — запись вылетела (onDay, expiresDay <= day), базовая цена леса (2 хода) вернулась — RED', async () => {
  const h = await boot(seedSave07({
    day: 1,
    position: { x: 3, y: 36 },
    hero: mkHero07({ mp: 20, primary: PRIMARY }),
  }));
  dismissStartWindow(h);
  const g = h.sandbox.__game;
  assert.equal(g.state.day, 1, 'фикстура: день 1');
  learn(h, ['path_of_vines']);
  castVines(h);
  // УТРО D+1: rest → onDay: restoreDay (без хука у path_of_vines) →
  // expire (expiresDay 2 <= 2) → запись вылетает.
  g.actions.setDay(2);
  assert.equal(g.state.day, 2, 'день 2 (setDay)');
  assert.equal(g.state.stepsToday, 0, 'rest: счётчик шагов дня сброшен');
  assert.deepEqual(host(g.state.hero.outOfCombatEffects), [],
    'день 2: запись вылетела (expiresDay <= day)');
  const step = makeStepper(h);
  step.walk(3, 37); // лес — без эффекта: базовая цена
  assert.equal(g.state.stepsToday, 2,
    'RED: уТРО D+1 — базовая цена плотного тайла (2 хода) ВЕРНУЛАСЬ '
    + '(нет консьюмера стоимости террейна)');
});

// =====================================================================
// V-2 (guard, скоуп) — подземелье и город БЕЗ террейна: 1 ход/тайл,
// механика мира их НЕ трогает (ТЗ: не переделывать движение
// подземелья/города). 3 шага в подземелье → +3; 2 шага в городе → +2.
// =====================================================================

test('000235.12.01 V-2 (guard): скоуп — подземелье 3 шага = +3, город 2 шага = +2 (1/тайл, террейна нет)', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  assert.equal(g.state.stepsToday, 0, 'свежий старт: 0 шагов в дне');
  const ds = enterDungeonClean(h);
  const A = asideDir(G, ds.dg);
  assert.ok(A, 'FLOOR-клетка-сосед входа найдена');
  dungeonPingPong(h, A, 3); // вход → A → вход → A
  assert.equal(g.state.day, 1, 'подземелье: день 1 не сменён (3 < 40)');
  assert.equal(g.state.stepsToday, 3,
    'подземелье: 3 шага = +3 (1/тайл, без террейна)');
  const h2 = await boot();
  const g2 = h2.sandbox.__game;
  const G2 = h2.sandbox.Game;
  const myMap = G2.createMap(G2.generateSeedPixels());
  const { found } = await enterCity(h2, NOW, myMap, (c) => c.fp >= 2);
  const B = cityAside(G2, found.layout);
  assert.ok(B, 'FLOOR-клетка-сосед двери города найдена');
  const door = found.layout.entrance;
  // Мировой подход УЖЕ тикал — снапшот ПОСЛЕ входа, пины относительные.
  const snap = { day: g2.state.day, steps: g2.state.stepsToday };
  cityStepTo(h2, B.x, B.y);    // 1: дверь → внутренность
  cityStepTo(h2, door.x, door.y); // 2: обратно на дверь
  const exp = afterSteps(snap.day, snap.steps, 40, 2);
  assert.equal(g2.state.day, exp.day,
    'город: 2 шага = +2 (смена дня только по порогу 40)');
  assert.equal(g2.state.stepsToday, exp.steps,
    'город: 2 шага = +2 (1/тайл, без террейна)');
});

// =====================================================================
// V-3 (guard, бой) — запись активна → шаг на тайл группы → бой.
// Вход в бой запись НЕ снимает (общее правило внебоевых; контраст:
// invisibility — clearInvisibility). После победы запись цела
// (до onDay).
// =====================================================================

test('000235.12.01 V-3 (guard): бой запись НЕ снимает — каст, шаг на группу → бой, запись цела в бою и после победы (до onDay)', async () => {
  const h = await boot();
  dismissStartWindow(h);
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  assert.ok(myMap.tileAt(1, 0).passable && myMap.tileAt(1, 0).hasMobGroup
    && myMap.tileAt(1, 0).terrain === G.TERRAIN.GRASS,
    'фикстура: (1,0) — трава с группой мобов (кадрированный бой)');
  assert.equal(g.state.day, 1, 'фикстура: день 1');
  assert.equal(saveHero(h).mp, 16, 'фикстура: новый герой mp = maxMP 16');
  learn(h, ['path_of_vines']);
  castVines(h);
  assert.equal(saveHero(h).mp, 1, 'mp ровно «мани» (16 − 15)');
  const step = makeStepper(h);
  step.walk(1, 0); // шаг на тайл группы → бой
  assert.equal(g.state.player.x, 1, 'шаг: x (1,0)');
  assert.equal(g.state.player.y, 0, 'шаг: y');
  assert.equal(G.combatUI.isActive(), true,
    'бой начался (maybeStartCombat на шаге, после addStep)');
  assert.deepEqual(host(g.state.hero.outOfCombatEffects),
    [{ spellId: 'path_of_vines', expiresDay: 2 }],
    'вход в бой запись НЕ снимает (контраст: invisibility — '
    + 'clearInvisibility)');
  resolveCombat(G); // 9999 по живым мобам → victory → Space
  assert.equal(G.combatUI.isActive(), false, 'бой закрыт (Space)');
  assert.deepEqual(host(g.state.hero.outOfCombatEffects),
    [{ spellId: 'path_of_vines', expiresDay: 2 }],
    'запись цела ПОСЛЕ боя (до onDay)');
  assert.equal(g.state.day, 1, 'день 1 (onDay не происходил)');
  assert.equal(g.state.player.x, 1, 'позиция после боя: x (1,0)');
  assert.equal(g.state.player.y, 0, 'позиция после боя: y');
});

// =====================================================================
// V-4 (guard, D3) — детерминизм: два СВЕЖИХ сэндбокса с одним
// сидом, один маршрут (каст → лес → трава → setDay(2) → лес) →
// идентичное состояние (позиция, day, stepsToday,
// outOfCombatEffects). Сломается, если реализация дёрнет rng
// («случайное» ослабление).
// =====================================================================

test('000235.12.01 V-4 (guard): D3 — два свежих сэндбокса, один сид, один маршрут (каст → лес → трава → setDay(2) → лес) — идентичное состояние (позиция/day/stepsToday/outOfCombatEffects)', async () => {
  const seed = seedSave07({
    day: 1,
    position: { x: 3, y: 36 },
    hero: mkHero07({ mp: 20, primary: PRIMARY }),
  });
  const run = async () => {
    const hb = await boot(seed);
    dismissStartWindow(hb);
    const gb = hb.sandbox.__game;
    const Gb = hb.sandbox.Game;
    learn(hb, ['path_of_vines']);
    castVines(hb);
    const stepb = makeStepper(hb);
    stepb.walk(3, 37); // лес (с эффектом)
    stepb.walk(3, 36); // трава
    gb.actions.setDay(2); // запись вылетает (onDay)
    stepb.walk(3, 37); // лес (база)
    return host({
      x: gb.state.player.x,
      y: gb.state.player.y,
      day: gb.state.day,
      stepsToday: gb.state.stepsToday,
      outOfCombatEffects: gb.state.hero.outOfCombatEffects,
    });
  };
  const A = await run();
  const B = await run();
  assert.equal(A.x, 3, 'маршрут: позиция x (3,37)');
  assert.equal(A.y, 37, 'маршрут: позиция y');
  assert.equal(A.day, 2, 'маршрут: день 2 (setDay)');
  assert.deepEqual(A.outOfCombatEffects, [],
    'маршрут: запись вылетела (onDay D+1)');
  assert.deepEqual(A, B,
    'D3: два независимых запуска — идентичное состояние '
    + '(позиция/day/stepsToday/outOfCombatEffects) — ноль нового rng');
});

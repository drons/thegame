// Задача 000304: расстановка перед боем — запоминание в общем
// сейве между боями (следующий бой стартует с последней
// расстановки) + порядок расстановки на вкладке «Отряд» [C].
// ТЗ: tasks/pending/000304.md; контракт —
// memory/000304-squad-placement-persist.md.
//
// HARNESS — КОПИЯ конвенции tests/squad-panel-e2e.test.js
// (full-chain <script> из index.html в vm-песочнице; bootSandbox/
// boot, key/press/release, resolveCombat, panelOf) С ДОБАВЛЕННЫМ
// досеянным сейвом (makeStorage(seed)/seedSave — паттерн
// tests/save-restore.test.js) и readSave/fireBeforeUnload (там же).
// Дублирование харнессов — принятая конвенция (000083).
//
// Краснота (осмысленная — ERR_ASSERTION, не крах цепочки):
//   * SP-1 — seed squad_placement: startCombat игнорирует расстановку
//     (master: опции opts нет) → герой/наёмник на якорях, не (2,6)/
//     (4,5).
//   * SP-2 — после свапа c0→c1 (Enter) live-карта main.js НЕ
//     перезаписана (master: точки записи нет) → раздел
//     squad_placement в сейве отсутствует (undefined).
//   * SP-3 — ГВАРД (зелёный с red-стадии): старый сейв без раздела —
//     boot чисто (0 errors), зеркало {}, бой на якорях.
//   * SP-4 — KeyC: панель «Отряд» БЕЗ секции «Расстановка»
//     (master: IIFE squadUI секцию не рендерит).
//
// Кросс-реалм (правило 000082): пины — примитивами (px/py/x/y,
// textContent) либо JSON-round-trip на зеркала/разделы сейва.
//
// expectedRedCount (файл) = 3 (SP-1, SP-2, SP-4).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { SAVE_KEY } = require('../src/save.js');
const P = require('../src/player.js');
const { NPCS } = require('../src/npc-data.js');

const ROOT = path.join(__dirname, '..');
const NPC_VOLK = NPCS.find((n) => n.id === 'merc_volk');
assert.ok(NPC_VOLK, 'каталог: merc_volk (преконтракт)');

// Цепочка скриптов — из index.html (не хардкод, паттерн
// main-visuals).
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
// querySelectorAll) — дубль tests/squad-panel-e2e.test.js. ---
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

// --- Песочница: вся цепочка index.html (браузерная ветка UMD) ---
function bootSandbox(seed) {
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
    // Семантика браузерного window: повторный add — no-op, remove —
    // реально снимает.
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
  return { sandbox, winListeners, raf, errors, body, storage };
}

// Промывка микротасков (Image + loadMapPixels().then: карта, спавн,
// restoreFromSave, requestAnimationFrame(frame)).
const drain = () => new Promise((r) => setImmediate(r));

async function boot(seed) {
  const h = bootSandbox(seed);
  await drain();
  await drain();
  await drain();
  const g = h.sandbox.__game;
  assert.ok(g, 'globalThis.__game выставлен (main.js выполнен)');
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет (порядок цепочки): ' + h.errors.join('; '));
  // frame() main.js — единственный rAF-колбэк после старта; кадр пере
  // планирует себя (одна и та же функция).
  h.frameFn = h.raf[h.raf.length - 1];
  return h;
}

// --- Ввод ---
// ВАЖНО: массив слушателей снапшотится ПЕРЕД диспетчем (паттерн B9).
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

// --- Элементы body ---
// Корень панели «Отряд» (.squad-panel — child body, src/ui.js
// buildSquad, document.body.appendChild).
function panelOf(h) {
  return findAll(h.body, '.squad-panel')[0] || null;
}

// Полный текст узла (рекурсивно).
function textOf(node) {
  let s = node._text || '';
  for (const ch of node.children || []) s += textOf(ch);
  return s;
}

// Сейв из мок-хранилища (после beforeunload).
function readSave(h) {
  const text = h.storage.getItem(SAVE_KEY);
  assert.ok(text != null, 'сейв записан в мок-хранилище');
  return JSON.parse(text);
}

// Dispatch захваченного window-слушателя beforeunload → saveNow().
function fireBeforeUnload(h) {
  const fns = h.winListeners['beforeunload'];
  assert.ok(fns && fns.length, 'слушатель beforeunload зарегистрирован');
  for (const fn of fns) fn({});
}

// Свободные клетки зоны расстановки (контракт 000260): строки
// max(0, h−2)..h−1 ∩ поле ∩ не obstacles ∩ вне rect'ов юнитов.
function zoneFreeCells(c) {
  const out = [];
  for (let y = Math.max(0, c.height - 2); y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (c.obstacles && c.obstacles.has(x + ',' + y)) continue;
      if (x === c.px && y === c.py) continue;
      if (c.units.some((u) => x >= u.x && x < u.x + (u.size.w || 1)
          && y >= u.y && y < u.y + (u.size.h || 1))) continue;
      out.push([x, y]);
    }
  }
  return out;
}

// canvas боя (оверлей .combat-overlay--combat → первый canvas).
function combatCanvas(h) {
  const ov = h.body.children.find(
    (el) => String(el.className).includes('combat-overlay--combat'));
  assert.ok(ov, 'оверлей боя в body');
  const cv = findAll(ov, 'canvas')[0];
  assert.ok(cv, 'canvas боя');
  return cv;
}

// ============================================================
// SP-1..SP-4
// ============================================================

test('000304 SP-1 (RED): seed squad_placement {player:[2,6], merc_volk:[4,5]} → startCombat: бой стартует с последней расстановки — герой (2,6), наёмник (4,5)', async () => {
  const h = await boot(seedSave({
    day: 2,
    hero: P.createCharacter(),
    companions: [{
      npcId: 'merc_volk', level: 1, xp: 0, loyalty: 65, hiredDay: 2,
    }],
    squad_placement: { player: [2, 6], merc_volk: [4, 5] },
  }));
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: '
    + h.errors.join('; '));
  const g = h.sandbox.__game;
  const c0 = g.actions.startCombat(0);
  assert.ok(c0, 'бой начался');
  assert.equal(c0.px, 2,
    'SP-1: герой x — из сохранённой расстановки (краснота: якоря 3)');
  assert.equal(c0.py, 6, 'SP-1: герой y — из сохранённой расстановки');
  const merc = (c0.units || []).find((x) => x && x.id === 'merc_volk');
  assert.ok(merc, 'merc_volk в c0.units');
  assert.equal(merc.x, 4,
    'SP-1: наёмник x — из сохранённой расстановки (краснота: якоря)');
  assert.equal(merc.y, 5,
    'SP-1: наёмник y — из сохранённой расстановки');
});

test('000304 SP-2 (RED): свап c0→c1 (перенос героя + Enter) — раздел squad_placement в сейве = ПОЛНЫЙ старт-мап (сдвинутый герой + Эфир + недвинутый наёмник)', async () => {
  const h = await boot(seedSave({
    day: 2,
    hero: P.createCharacter(),
    companions: [{
      npcId: 'merc_volk', level: 1, xp: 0, loyalty: 65, hiredDay: 2,
    }],
  }));
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: '
    + h.errors.join('; '));
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const c0 = g.actions.startCombat(0);
  assert.ok(c0, 'бой начался');
  assert.equal(c0.px, 3, 'фикстура: герой на якоря x');
  assert.equal(c0.py, 6, 'фикстура: герой на якоря y');
  const cv = combatCanvas(h);
  const free = zoneFreeCells(c0);
  const cell = free.find((p) => p[1] === c0.height - 1) || free[0];
  assert.ok(cell, 'свободная клетка зоны: ' + JSON.stringify(free));
  cv.listeners.click[0]({ clientX: (c0.px + 0.5) * 48,
    clientY: (c0.py + 0.5) * 48 });
  cv.listeners.click[0]({ clientX: (cell[0] + 0.5) * 48,
    clientY: (cell[1] + 0.5) * 48 });
  assert.equal(c0.px, cell[0], 'фикстура: герой перенесён (live c0) x');
  assert.equal(c0.py, cell[1], 'фикстура: герой перенесён (live c0) y');
  G.combatUI.handleCode('Enter');
  const c1 = G.combatUI.current();
  assert.ok(c1 && c1 !== c0,
    'свап: живой бой — НОВЫЙ объект (closePlacementWindow)');
  assert.equal(c1.px, cell[0], 'c1 — подтверждённая позиция x');
  assert.equal(c1.py, cell[1], 'c1 — подтверждённая позиция y');
  const expected = { player: [c1.px, c1.py] };
  for (const u of c1.units) {
    if (u.side !== 'ally') continue;
    expected[u.id] = [u.x, u.y];
  }
  assert.equal(Object.keys(expected).length, 3,
    'полный старт-мап: player + Эфир + наёмник (фикстура): '
    + JSON.stringify(Object.keys(expected)));
  fireBeforeUnload(h);
  const saved = readSave(h);
  assert.equal(saved.version, 1, 'версия НЕ повышена');
  assert.deepEqual(saved.data.squad_placement, expected,
    'SP-2: раздел сейва — полный старт-мап (сдвинутый герой И '
    + 'недвинутый наёмник); краснота: '
    + JSON.stringify(saved.data.squad_placement));
});

test('000304 SP-3 (guard): seed БЕЗ squad_placement — boot чисто (0 errors), зеркало {}, startCombat — бой на якорях (дефолт), без краха', async () => {
  const h = await boot(seedSave({
    day: 2,
    hero: P.createCharacter(),
    companions: [{
      npcId: 'merc_volk', level: 1, xp: 0, loyalty: 65, hiredDay: 2,
    }],
  }));
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: '
    + h.errors.join('; '));
  const g = h.sandbox.__game;
  assert.deepEqual(
    JSON.parse(JSON.stringify(g.state.squadPlacement || {})), {},
    'старый сейв — зеркало ПУСТОЕ (краснота: '
    + JSON.stringify(g.state.squadPlacement));
  const c0 = g.actions.startCombat(0);
  assert.ok(c0, 'объект боя существует (пустая карта — без краха)');
  assert.equal(c0.px, 3, 'SP-3: герой x — якоря (дефолт)');
  assert.equal(c0.py, 6, 'SP-3: герой y — якоря (дефолт)');
});

test('000304 SP-4 (RED): seed squad_placement → KeyC: панель «Отряд» — секция «Расстановка:» (Флогистон + наёмник каталога, «строка Y · столбец X»)', async () => {
  const h = await boot(seedSave({
    day: 2,
    hero: P.createCharacter(),
    companions: [{
      npcId: 'merc_volk', level: 1, xp: 0, loyalty: 65, hiredDay: 2,
    }],
    squad_placement: { player: [2, 6], merc_volk: [4, 5] },
  }));
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: '
    + h.errors.join('; '));
  const G = h.sandbox.Game;
  press(h, 'KeyC');
  assert.equal(G.squadUI.isOpen(), true, 'KeyC: панель открыта');
  const panel = panelOf(h);
  assert.ok(panel, 'корень .squad-panel в body');
  const t = textOf(panel);
  assert.ok(t.includes('Расстановка:'),
    'SP-4: секция «Расстановка:» (краснота: ' + t + ')');
  assert.ok(t.includes('Флогистон'),
    'SP-4: строка героя «Флогистон»: ' + t);
  assert.ok(t.includes('строка 6 · столбец 2'),
    'SP-4: meta героя «строка 6 · столбец 2» (player [2,6]): ' + t);
  assert.ok(t.includes('строка 5 · столбец 4'),
    'SP-4: meta наёмника «строка 5 · столбец 4» (merc [4,5]): ' + t);
  assert.ok(t.includes(NPC_VOLK.имя),
    'SP-4: имя наёмника — из каталога («' + NPC_VOLK.имя + '»): ' + t);
});

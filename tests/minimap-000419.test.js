// Задача 000419 [ui]: МИРОВАЯ миникарта смотровой башни — первый настоящий
// потребитель раздела explored. Контракты (карточка + memory/000093-explored*):
//   * модель отрисовки — UNION окон башен (тайл пересечения ровно ОДИН раз);
//     HUD-счётчик exploredCount — СУММА по башням с «удвоением» (контракт);
//   * радиус — ИЗ ДАННЫХ (каталог id 46 эффект.радиус), окно Чебышёва 2R+1;
//   * UMD-ловушка 000038: src/minimap.js грузится ДО hud.js/main.js;
//   * z-ниша панели — ВЫШЕ .fs-btn (15) и НИЖЕ оверлеев 20/.spellbook-oc 35;
//   * explored-сейв (serializeExplored/restoreExplored, roundtrip, v1) — НЕ
//     тронут; чанковый рендер (000263) — не тронут (оверлей — СВОЙ canvas);
//   * ТАКТИЧЕСКАЯ мини-карта 7×7 боя (000084) — ДРУГОЙ слой, здесь не тестируется.
// Харнес — паттерн tests/building-effects.test.js (полная <script>-цепь из
// index.html в vm-песочнице) + tests/save-restore.test.js (досеянный сейв).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { SAVE_KEY } = require('../src/save.js');
const BE = require('../src/building-effects.js');
const B = require('../src/buildings.js');

const ROOT = path.join(__dirname, '..');
const MINIMAP_PATH = path.join(ROOT, 'src', 'minimap.js');
const minimapSource = fs.existsSync(MINIMAP_PATH)
  ? fs.readFileSync(MINIMAP_PATH, 'utf8') : null;

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));
const scripts = Array.from(
  html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1]);
const pos = (f) => scripts.indexOf(f);

// Радиус — ИЗ КАТАЛОГА (golden-литералы запрещены; урок .348).
const CAT46 = B.getBuilding(46);
const R = (() => {
  assert.ok(CAT46, 'каталог: постройка 46 существует');
  const eff = CAT46.особые_параметры && CAT46.особые_параметры.эффект;
  assert.ok(eff && Number.isInteger(eff.радиус) && eff.радиус >= 0,
    'каталог 46: особые_параметры.эффект.радиус — целое ≥ 0');
  return eff.радиус;
})();
const SIDE = 2 * R + 1;
const TOWER = { x: 36, y: -21 };
const TOWER2 = { x: 50, y: -5 };

// Полный квадрат Чебышёва вокруг (cx,cy) радиуса r (row-major, как markExplored).
function windowTiles(cx, cy, r) {
  const out = [];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) out.push({ x: cx + dx, y: cy + dy });
  }
  return out;
}

// Снимок раздела с одной башни TOWER (канонический, через живой BE).
function snapOne() {
  return BE.markExplored(null, '36,-21', windowTiles(TOWER.x, TOWER.y, R), R);
}
// Снимок раздела с двух ПЕРЕСЕКАЮЩИХСЯ башен (окна пересекаются:
// |50−36| ≤ R и |−5−(−21)| ≤ R → пересечение ≠ ∅, суммарный кап 2·SIDE²).
function snapTwo() {
  const s1 = snapOne();
  return BE.markExplored(s1, '50,-5',
    windowTiles(TOWER2.x, TOWER2.y, R), R);
}
function chebWithin(key, cx, cy, r) {
  const p = key.split(',');
  return Math.abs(Number(p[0]) - cx) <= r && Math.abs(Number(p[1]) - cy) <= r;
}

// ====================================================================
// ЧИСТАЯ ПЕСОЧНИЦА: src/minimap.js один (без DOM/window) — load-clean
// ====================================================================

function loadBare() {
  const errors = [];
  const warns = [];
  const sandbox = {
    console: {
      warn: (m) => warns.push(String(m)),
      error: (m) => errors.push(String(m)),
      log: () => {},
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(minimapSource, sandbox, { filename: 'src/minimap.js' });
  return { sandbox, errors, warns, M: sandbox.Game && sandbox.Game.minimap };
}

test('000419 T1: src/minimap.js существует, UMD-поверхность полна и load-clean (ноль console/DOM/чтений Game на загрузке — 000038/000053); node-ветка require даёт ту же поверхность', () => {
  assert.ok(minimapSource !== null,
    'src/minimap.js отсутствует (RED 000419: модуль мировой миникарты не создан)');
  const h = loadBare();
  assert.ok(h.M && typeof h.M === 'object',
    'Game.minimap не опубликован при загрузке в браузер-подобную '
    + 'песочницу без DOM');
  for (const fn of ['init', 'toggle', 'isOpen', 'close', 'applyVisibility',
    'buildModel', 'windowKeys', 'render']) {
    assert.equal(typeof h.M[fn], 'function',
      'minimap.' + fn + ' — обязан быть функцией (контракт 000419)');
  }
  assert.equal(h.errors.length, 0, 'загрузка чистая: console.error пуст: '
    + h.errors.join('; '));
  assert.equal(h.warns.length, 0, 'загрузка чистая: console.warn пуст: '
    + h.warns.join('; '));
  const req = require(MINIMAP_PATH);
  assert.deepEqual(Object.keys(req).sort(), Object.keys(h.M).sort(),
    'node-ветка (module.exports) и браузерная (Game.minimap) — одна поверхность');
});

test('000419 T2: index.html — тег src/minimap.js в цепи (ПОСЛЕ building-effect-storage.js, ДО hud.js и main.js — UMD-ловушка 000038) + z-ниша панели между .fs-btn и оверлеями 20/35 (лестница ПЕРЕСНЯТА из CSS, не литералом)', () => {
  assert.notEqual(pos('src/minimap.js'), -1,
    'src/minimap.js не подключён в index.html (RED 000419)');
  assert.ok(pos('src/building-effect-storage.js') < pos('src/minimap.js'),
    'src/minimap.js — в слоте после building-effect-storage.js (000419)');
  assert.ok(pos('src/minimap.js') < pos('src/hud.js'),
    'src/minimap.js обязан грузиться ДО src/hud.js (000419)');
  assert.ok(pos('src/minimap.js') < pos('src/main.js'),
    'src/minimap.js обязан грузиться ДО src/main.js '
    + '(UMD-ловушка 000038: main.js снимает Game один раз)');
  const zOf = (sel) => {
    const m = html.match(new RegExp(
      sel.replace(/[.#]/g, '\\$&') + '\\s*\\{[^}]*?z-index:\\s*(\\d+)'));
    assert.ok(m, 'index.html CSS: селектор ' + sel + ' с z-index не найден');
    return Number(m[1]);
  };
  const zFs = zOf('.fs-btn');
  const zOver = zOf('.resurrect-overlay');
  const zBook = zOf('.spellbook-oc');
  const zMini = zOf('#minimap');
  assert.ok(zFs < zMini, 'ниша: #minimap z=' + zMini + ' обязан быть ВЫШЕ '
    + '.fs-btn z=' + zFs);
  assert.ok(zMini < zOver, 'ниша: #minimap z=' + zMini + ' обязан быть НИЖЕ '
    + 'оверлеев (.resurrect-overlay z=' + zOver + ') — в бою/подземелье '
    + 'миникарта гасится сверху');
  assert.ok(zMini < zBook, 'ниша: #minimap z=' + zMini + ' обязан быть НИЖЕ '
    + '.spellbook-oc z=' + zBook + ' (контракт карточки п.1)');
});

test('000419 T3: buildModel — UNION окон (тайл пересечения ровно ОДИН раз), exploredCount — СУММА (двойной счёт пересечений — контракт); принятие Map и plain object; fail-open на мусоре', () => {
  assert.ok(minimapSource !== null, 'src/minimap.js отсутствует (RED 000419)');
  const h = loadBare();
  const two = snapTwo();
  const live = BE.restoreExplored(two);
  const s1 = String(two['36,-21']).split(';');
  const s2 = String(two['50,-5']).split(';');
  const sum = s1.length + s2.length;
  const union = new Set([...s1, ...s2]);
  assert.ok(union.size < sum,
    'предусловие: окна двух башен реально пересекаются (иначе тест вакуумен)');
  const model = h.M.buildModel(live);
  assert.equal(typeof model.has, 'function',
    'buildModel возвращает Set-подобную модель (000419)');
  assert.equal(model.size, union.size,
    'модель отрисовки — union: тайл пересечения РОВНО ОДИН раз '
    + '(RED 000419: union не построен)');
  assert.equal(BE.exploredCount(two), sum,
    'HUD-контракт: exploredCount — СУММА по башням (пересечение считается '
    + 'дважды) — неизменен');
  const modelPlain = h.M.buildModel(two);
  assert.equal(modelPlain.size, union.size,
    'buildModel принимает и plain-снимок (тот же union)');
  assert.equal(h.M.buildModel(null).size, 0, 'null → пустая модель');
  assert.equal(h.M.buildModel('junk').size, 0, 'строка → пустая модель');
  assert.equal(h.M.buildModel([1, 2]).size, 0, 'массив → пустая модель');
  const junkMap = new Map([['3,4', new Set(['1,2', 'x,x', 'junk', ''])],
    ['bad key', new Set(['9,9'])]]);
  assert.deepEqual([...h.M.buildModel(junkMap)], ['1,2'],
    'мусорные ключи/тайлы отбрасываются (XY-фильтр), валидный проходит');
});

test('000419 T4: окно Чебышёва ИЗ ДАННЫХ: сторона 2R+1 из каталога (не литерал), синтетический r=5 → 11×11=121, row-major, пустая модель → пусто', () => {
  assert.ok(minimapSource !== null, 'src/minimap.js отсутствует (RED 000419)');
  const h = loadBare();
  const model1 = h.M.buildModel(BE.restoreExplored(snapOne()));
  assert.equal(model1.size, SIDE * SIDE,
    'одна башня: модель ' + SIDE + '×' + SIDE + ' = ' + (SIDE * SIDE)
    + ' тайлов (радиус каталога ' + R + ')');
  const win = h.M.windowKeys(model1, TOWER.x, TOWER.y, R);
  assert.ok(Array.isArray(win), 'windowKeys возвращает массив');
  assert.equal(win.length, SIDE * SIDE,
    'окно вокруг башни = вся её модель (2R+1)² (RED: окно не Чебышёва)');
  assert.equal(win[0], (TOWER.x - R) + ',' + (TOWER.y - R),
    'row-major: первый ключ — верхняя левая (x−R, y−R)');
  assert.equal(win[win.length - 1], (TOWER.x + R) + ',' + (TOWER.y + R),
    'row-major: последний ключ — нижняя правая (x+R, y+R)');
  const win5 = h.M.windowKeys(model1, TOWER.x, TOWER.y, 5);
  assert.equal(win5.length, 121,
    'синтетический r=5 → сторона 11 → 121 (арифметика 2r+1 из аргумента, '
    + 'не из литерала каталога)');
  const off = new Set(windowTiles(0, 0, R).map((t) => t.x + ',' + t.y));
  const expectClip = win.filter((k) => off.has(k)).length;
  const clipped = h.M.windowKeys(model1, 0, 0, R);
  assert.equal(clipped.length, expectClip,
    'окно вокруг (0,0) — пересечение с моделью (обрезка по Четышеву)');
  assert.deepEqual([...h.M.windowKeys(new Set(), TOWER.x, TOWER.y, R)], [],
    'пустая модель → пустое окно');
  assert.deepEqual([...h.M.windowKeys(null, 0, 0, 3)], [],
    'null-модель → пустое окно (fail-open)');
});

test('000419 T5: source-scan — src/minimap.js НЕ содержит литералов 20/41/1681 (радиус/сторона/ёмкость окна — только из данных и аргументов)', () => {
  assert.ok(minimapSource !== null, 'src/minimap.js отсутствует (RED 000419)');
  for (const lit of ['20', '41', '1681']) {
    assert.ok(!new RegExp('\\b' + lit + '\\b').test(minimapSource),
      'src/minimap.js: литерал ' + lit + ' запрещён (ls-доктрина: '
      + 'радиус из каталога, сторона = 2R+1 вычисляется)');
  }
});

test('000419 T6: init-контракт (bad args → console.error 1× и не готов; toggle до init → no-op с ошибкой) + БЕЗ DOM/с null-элементами ни один вызов не бросает', () => {
  assert.ok(minimapSource !== null, 'src/minimap.js отсутствует (RED 000419)');
  const h = loadBare();
  h.M.toggle();
  assert.equal(h.M.isOpen(), false,
    'toggle до init — не открывает (паттерн spellbook-oc)');
  assert.equal(h.errors.length, 1,
    'toggle до init — ровно одна console.error: ' + h.errors.join('; '));
  h.M.init(null);
  h.M.init({});
  assert.ok(h.errors.length >= 2,
    'init без explored/player — console.error (ошибки видны при загрузке)');
  const noDom = loadBare();
  noDom.M.init({ explored: new Map([['36,-21',
    new Set(['36,-21', '37,-21'])]]),
    player: { x: 36, y: -21 }, getRadius: () => 3 });
  assert.doesNotThrow(() => {
    noDom.M.toggle();
    assert.equal(noDom.M.isOpen(), true,
      'без document toggle всё равно переключает состояние (тихая деградация)');
    noDom.M.applyVisibility();
    noDom.M.render();
    noDom.M.close();
    assert.equal(noDom.M.isOpen(), false, 'close без DOM — state закрыт');
  }, 'миникарта без document вообще — НИКАКИХ исключений (000419)');
  const nullDoc = loadBare();
  nullDoc.sandbox.document = {
    getElementById: () => null,
    createElement: () => { throw new Error('createElement запрещён'); },
    body: null,
  };
  nullDoc.M.init({ explored: snapOne(), player: { x: 36, y: -21 },
    getRadius: () => 2 });
  assert.doesNotThrow(() => {
    nullDoc.M.toggle();
    nullDoc.M.applyVisibility();
    nullDoc.M.applyVisibility();
    nullDoc.M.close();
  }, 'document без #minimap (чужие vm-песочницы) — не бросает, детей не плодит');
});

// ====================================================================
// E2E: полная цепь index.html, DOM-стаб с #minimap/#minimap-canvas/
// #minimap-toggle (элементы из index.html; canvas 2d с записью drawCalls)
// ====================================================================

const NOW = 1000;

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
      if (name.startsWith('data-')) {
        target.dataset[name.slice(5)] = value;
      }
    },
    getContext(kind) {
      if (tag !== 'canvas') return null;
      return kind === 'webgl' ? makeGl() : makeContext2d(target);
    },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    blur() {},
    closest() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
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

function bootSandbox(seed) {
  const winListeners = {};
  const raf = [];
  const warns = [];
  const errors = [];
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
  const minimap = makeEl('div');
  const minimapCanvas = makeEl('canvas');
  const minimapBtn = makeEl('button');
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
          : id === 'hud' ? hud
            : id === 'minimap' ? minimap
              : id === 'minimap-canvas' ? minimapCanvas
                : id === 'minimap-toggle' ? minimapBtn
                  : null),
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
      warn: (m) => warns.push(String(m)),
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
  return { sandbox, winListeners, raf, warns, errors, storage, body, hud,
    minimap, minimapCanvas, minimapBtn };
}

const drain = () => new Promise((r) => setImmediate(r));

async function boot(seed) {
  const h = bootSandbox(seed);
  await drain();
  await drain();
  await drain();
  return h;
}

function key(h, code, extra = {}) {
  const e = Object.assign({ code, preventDefault() {}, stopPropagation() {} },
    extra);
  for (const fn of (h.winListeners['keydown'] || []).slice()) fn(e);
  return e;
}

function frameAt(h, now) {
  h.raf[h.raf.length - 1](now);
}

function readSave(h) {
  const text = h.storage.getItem(SAVE_KEY);
  assert.ok(text != null, 'сейв записан в мок-хранилище');
  return JSON.parse(text);
}

function fireBeforeUnload(h) {
  const fns = h.winListeners['beforeunload'];
  assert.ok(fns && fns.length, 'слушатель beforeunload зарегистрирован');
  for (const fn of fns) fn({});
}

// Только fillRect-вызовы канваса миникарты: тайлы-пары [x,y] + последняя —
// метка героя.
function cellRects(h) {
  return h.minimapCanvas.drawCalls
    .filter((c) => c[0] === 'fillRect')
    .map((c) => c[1]);
}

test('000419 T7: e2e «влез на башню → Взглянуть → KeyM»: нарисованы все ' + SIDE + '×' + SIDE + ' тайла окна (ровно один раз) + метка героя; HUD «Исследовано»; закрытая миникарта рисования не плодит', async () => {
  assert.ok(minimapSource !== null, 'src/minimap.js отсутствует (RED 000419)');
  const h = await boot(seedSave({ day: 1, position: { x: TOWER.x, y: TOWER.y } }));
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  frameAt(h, NOW + 200);
  assert.equal(G.minimap.isOpen(), false,
    'после boot миникарта ЗАКРЫТА (панель скрыта до KeyM)');
  assert.equal(h.minimapCanvas.drawCalls.length, 0,
    'закрытая миникарта в кадре не рисует (дешёвый no-op, 000419)');
  // [E] → «Взглянуть» (Digit1).
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, '[E] открыл actions (башня)');
  key(h, 'Digit1');
  assert.equal(G.buildingUI.isActive(), false, 'действие выполнено, оверлей закрыт');
  frameAt(h, NOW + 400);
  assert.ok(String(h.hud.textContent).includes('Исследовано: '
    + (SIDE * SIDE) + ' тайлов'),
    'HUD-сумма после взгляда: ' + String(h.hud.textContent));
  // KeyM — мировая миникарта открылась и нарисовала окно.
  key(h, 'KeyM');
  assert.equal(G.minimap.isOpen(), true,
    'KeyM открывает мировую миникарту (RED: ханк keydown не вставлен)');
  frameAt(h, NOW + 600);
  const rects = cellRects(h);
  assert.equal(rects.length, SIDE * SIDE + 1,
    'окно ' + SIDE + '×' + SIDE + ' тайлов + метка героя = '
    + (SIDE * SIDE + 1) + ' fillRect (RED: миникарта не рисует)');
  const cells = rects.slice(0, -1);
  const uniq = new Set(cells.map((r) => r[0] + ':' + r[1]));
  assert.equal(uniq.size, cells.length,
    'каждая клетка нарисована РОВНО ОДИН раз (уникальные координаты)');
  const marker = rects[rects.length - 1];
  assert.ok(marker.every((v) => Number.isFinite(v)),
    'метка героя — последний прямоугольник (сверху над клетками)');
  // Кадры без изменений — ре-рендера нет (дешёвая signature-охрана).
  const before = h.minimapCanvas.drawCalls.length;
  frameAt(h, NOW + 800);
  frameAt(h, NOW + 1000);
  assert.equal(h.minimapCanvas.drawCalls.length, before,
    'закрытое окно/снимок не менялись → лишних кадров отрисовки нет');
  // KeyM снова — закрыла; новые кадры не рисуют.
  key(h, 'KeyM');
  assert.equal(G.minimap.isOpen(), false, 'KeyM повторно — закрыла');
  frameAt(h, NOW + 1200);
  assert.equal(h.minimapCanvas.drawCalls.length, before,
    'после закрытия кадры не рисуют');
  // Кадровый хук main.js ОБЯЗАН дёргать applyVisibility каждый кадр —
  // иначе обновление открытой панели при движении/новых башнях мертво
  // (спай, а не проверка факта картинки: toggle рисует синхронно, и
  // нарисованное окно само по себе наличие хука в frame не доказывает).
  const realAV = G.minimap.applyVisibility;
  let avCalls = 0;
  G.minimap.applyVisibility = function () {
    avCalls += 1;
    return realAV.apply(this, arguments);
  };
  key(h, 'KeyM');
  frameAt(h, NOW + 1400);
  frameAt(h, NOW + 1600);
  G.minimap.applyVisibility = realAV;
  assert.ok(avCalls >= 2,
    'каждый кадр вызывает G.minimap.applyVisibility() из frame '
    + '(RED-мут M5: хук удалён из main.js — панель не обновляется)');
});

test('000419 T8: restore из сейва ДО первого действия — миникарта сразу рисует восстановленное; beforeunload — байт-identical roundtrip раздела', async () => {
  assert.ok(minimapSource !== null, 'src/minimap.js отсутствует (RED 000419)');
  const snap = snapOne();
  const h = await boot(seedSave({
    day: 1, position: { x: TOWER.x, y: TOWER.y }, explored: snap,
  }));
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  key(h, 'KeyM');
  frameAt(h, NOW + 200);
  const rects = cellRects(h);
  assert.equal(rects.length, SIDE * SIDE + 1,
    'без игровых действий нарисовано восстановленное окно (RED: restore '
    + 'не попадает в модель)');
  fireBeforeUnload(h);
  const saved = readSave(h);
  assert.equal(saved.version, 1, 'версия сейва НЕ повышена (000419 — не здесь)');
  assert.deepEqual(saved.data.explored, snap,
    'roundtrip: восстановленный раздел записан побайтово тем же значением');
  assert.equal(saved.data.explored['36,-21'], snap['36,-21'],
    'каноническая строка башни — byte-identical');
});

test('000419 T9: две пересекающиеся башни — в модели/отрисовке тайл пересечения РОВНО ОДИН раз, HUD-счётчик вырос на СУММУ (оба конца контракта e2e)', async () => {
  assert.ok(minimapSource !== null, 'src/minimap.js отсутствует (RED 000419)');
  const two = snapTwo();
  const s1 = String(two['36,-21']).split(';');
  const s2 = String(two['50,-5']).split(';');
  const sum = s1.length + s2.length;
  const h = await boot(seedSave({
    day: 1, position: { x: TOWER.x, y: TOWER.y }, explored: two,
  }));
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  frameAt(h, NOW + 200);
  assert.ok(String(h.hud.textContent).includes('Исследовано: ' + sum + ' тайлов'),
    'HUD — сумма с удвоением пересечения (' + sum + '): '
    + String(h.hud.textContent));
  key(h, 'KeyM');
  frameAt(h, NOW + 400);
  const cells = cellRects(h).slice(0, -1);
  const expectVisible = new Set(
    [...new Set([...s1, ...s2])].filter((k) =>
      chebWithin(k, TOWER.x, TOWER.y, R)));
  assert.equal(cells.length, expectVisible.size,
    'отрисовано уникальных тайлов окна ровно по union∩окну (naive per-tower '
    + 'дал бы ' + (SIDE * SIDE + String(two['50,-5']).split(';')
      .filter((k) => chebWithin(k, TOWER.x, TOWER.y, R)).length) + ')');
  const uniq = new Set(cells.map((r) => r[0] + ':' + r[1]));
  assert.equal(uniq.size, cells.length, 'ни один тайл не нарисован дважды');
});

test('000419 T10: повторное открытие — полный ре-рендер (кадры при открытой панели стабильны между изменениями); состояние переживает бой-гейт молча (KeyM до гейтов)', async () => {
  assert.ok(minimapSource !== null, 'src/minimap.js отсутствует (RED 000419)');
  const h = await boot(seedSave({
    day: 1, position: { x: TOWER.x, y: TOWER.y }, explored: snapOne(),
  }));
  const G = h.sandbox.Game;
  key(h, 'KeyM');
  frameAt(h, NOW + 200);
  const first = cellRects(h).length;
  assert.equal(first, SIDE * SIDE + 1, 'первое открытие нарисовано');
  key(h, 'KeyM');
  assert.equal(G.minimap.isOpen(), false, 'закрыта');
  key(h, 'KeyM');
  frameAt(h, NOW + 400);
  assert.equal(cellRects(h).length, first * 2,
    'повторное открытие — полный ре-рендер окна');
});

test('000419 T11: кнопка #minimap-toggle — клик переключает панель (без клавиатуры)', async () => {
  assert.ok(minimapSource !== null, 'src/minimap.js отсутствует (RED 000419)');
  const h = await boot(seedSave({
    day: 1, position: { x: TOWER.x, y: TOWER.y }, explored: snapOne(),
  }));
  const G = h.sandbox.Game;
  assert.ok(h.minimapBtn, 'песочница: #minimap-toggle существует');
  frameAt(h, NOW + 200);
  key(h, 'KeyM');
  frameAt(h, NOW + 400);
  const drawn = cellRects(h).length;
  assert.ok(drawn > 0, 'после KeyM нарисовано');
  key(h, 'KeyM');
  const clickFns = (h.minimapBtn.listeners && h.minimapBtn.listeners.click) || [];
  assert.ok(clickFns.length > 0,
    'RED 000419: обработчик click на #minimap-toggle не навешан '
    + '(ленивая проводка при первом обращении к DOM)');
  for (const fn of clickFns) fn({});
  assert.equal(G.minimap.isOpen(), true, 'клик по кнопке открыл панель');
  for (const fn of clickFns) fn({});
  assert.equal(G.minimap.isOpen(), false, 'повторный клик закрыл');
});

test('000419 T12: снятие ОТСРОЧЕНА — комментарий-якоря building-effects.js и main.js переписаны на реализацию, spec/buildings.md без «МИНИКАРТА — ОТСРОЧЕНА», index.html содержит контейнер', () => {
  const be = fs.readFileSync(path.join(ROOT, 'src', 'building-effects.js'), 'utf8');
  assert.ok(!be.includes('МИНИКАРТА — ОТСРОЧЕНА'),
    'building-effects.js: якорь «МИНИКАРТА — ОТСРОЧЕНА» обязан быть снят (000419)');
  assert.ok(!be.includes('без миникарты'),
    'building-effects.js: «(разведка, без миникарты)» устарело — миникарта есть');
  assert.ok(be.includes('000419'),
    'building-effects.js: якоря обязаны ссылаться на 000419');
  const mj = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  assert.ok(!/МИНИКАРТА — отсрочена/.test(mj),
    'main.js: комментарий «МИНИКАРТА — отсрочена» обязан быть снят (000419)');
  assert.ok(mj.includes('миникарта'),
    'main.js: комментарий у explored обязан указывать на мировую миникарту');
  const spec = fs.readFileSync(path.join(ROOT, 'spec', 'buildings.md'), 'utf8');
  assert.ok(!spec.includes('МИНИКАРТА — ОТСРОЧЕНА'),
    'spec/buildings.md: сноска «МИНИКАРТА — ОТСРОЧЕНА» обязана быть снята (000419)');
  assert.ok(html.includes('id="minimap"') && html.includes('id="minimap-canvas"')
    && html.includes('id="minimap-toggle"'),
    'index.html: контейнер #minimap + #minimap-canvas + #minimap-toggle (000419)');
});

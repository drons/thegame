// Задача 000313: склад (здание 55 «Хранилище») — прокрутка списка +
// две панели «инвентарь | склад» (механика магазина: строки/секции) +
// drag-n-drop + кнопки «Сложить»/«Вынуть» — ОДНА мутация.
//
// Источник правды: tasks/pending/000313.md; контракты:
// memory/000313-storage-panels.md.
//
// RED (осмысленная краснота, не краш загрузки):
//   * S1 — в index.html НЕТ правил .combat-overlay--storage/
//     .storage-cols/.storage-col (скролл-контракт панелей отсутствует);
//   * S2 — оверлей — дефолтный одноколоночник (нет .storage-cols/
//     .storage-col, нет класса --storage, нет заголовков панелей,
//     пустой склад — одна «empty»-строка, а не в ПРАВОЙ панели);
//   * S3 — у строк НЕТ кнопок «Сложить»/«Вынуть» (поведение клика по
//     строке есть с 000221 — краснота в кнопках и колонках);
//   * S4 — НЕТ dnd: слушателей dragstart/dragover/drop нет, строки не
//     draggable, нет днд-паритета по state-снимкам;
//   * S5 — ёмкость: disabled-строка (000221 — есть) + RED: put-строка
//     НЕ draggable, заголовок «Склад (40/40)», drop без dragstart —
//     no-op;
//   * S6 — node-экспорт {transfer} отсутствует (typeof undefined);
//     S6b — прямой onAction (обход, паттерн R8(g) 000221) — отказ-флэш
//     БЕЗ мутации/сейва;
//   * S7 — payload оверлея БЕЗ layout/capacity/icon/rarity/meta.
//
// Харнес: vm-секция — копия tests/building-levels.test.js (full-chain
// index.html, детерминированный мир, walkTiles/findCityFor/walkCity —
// дублирование харнессов — принятая конвенция, 000206); node-секция —
// фикстуры tests/city-storage.test.js (initStorageFixture).
// Сейвы — счётчиком setItem (storage.saves): мир-шаги сейвятся сами,
// поэтому пины — РЕЛЯТИВНЫЕ (до/после операции).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const C = require('../src/cities.js');
const B = require('../src/buildings.js');
const BE = require('../src/building-effects.js');
const BA = require('../src/building-actions.js');
const IT = require('../src/items.js');
const PLR = require('../src/player.js');
const { SAVE_KEY } = require('../src/save.js');

// ============================================================
// S1. CSS: 4 правила (контракт скролла панелей) + гард базы
// ============================================================

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function cssRule(selector) {
  const re = new RegExp('^[ \\t]*'
    + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    + '[ \\t]*\\{([^}]*)\\}', 'm');
  const m = html.match(re);
  assert.ok(m, 'CSS-правило ' + selector + ' { … } найдено в index.html');
  const decls = {};
  for (const part of m[1].split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const prop = part.slice(0, i).trim().toLowerCase();
    if (prop) decls[prop] = part.slice(i + 1).trim();
  }
  return decls;
}

test('000313-S1a. index.html: .combat-overlay--storage .combat-side — width min(720px, 94vw) (две панели вписываются по горизонтали)', () => {
  const d = cssRule('.combat-overlay--storage .combat-side');
  assert.equal(d['width'], 'min(720px, 94vw)',
    'RED: панель склада — width min(720px, 94vw); факт: ' + d['width']);
});

test('000313-S1b. index.html: .storage-cols — display flex, gap 8px (две панели рядом)', () => {
  const d = cssRule('.storage-cols');
  assert.equal(d['display'], 'flex',
    'RED: контейнер панелей — display: flex; факт: ' + d['display']);
  assert.equal(d['gap'], '8px',
    'RED: контейнер панелей — gap: 8px; факт: ' + d['gap']);
});

test('000313-S1c. index.html: .storage-col — flex 1, min-width 0, max-height calc(100vh - 190px) + overflow-y auto (СКРОЛЛ-КОНТРАКТ: контейнер фиксированной высоты, контент скроллится)', () => {
  const d = cssRule('.storage-col');
  assert.equal(d['flex'], '1',
    'RED: панель — flex: 1; факт: ' + d['flex']);
  assert.equal(d['min-width'], '0',
    'RED: панель — min-width: 0 (flex-ловушка); факт: '
    + d['min-width']);
  assert.equal(d['max-height'], 'calc(100vh - 190px)',
    'RED: панель — max-height calc(100vh - 190px) (фикс. высота); '
    + 'факт: ' + d['max-height']);
  assert.equal(d['overflow-y'], 'auto',
    'RED: панель — overflow-y: auto (скролл); факт: ' + d['overflow-y']);
});

test('000313-S1d. index.html: .storage-col .cp-itemrow .cp-itemname — min-width 0 + overflow-wrap break-word (длинное название не растягивает панель)', () => {
  const d = cssRule('.storage-col .cp-itemrow .cp-itemname');
  assert.equal(d['min-width'], '0',
    'RED: название — min-width: 0; факт: ' + d['min-width']);
  assert.equal(d['overflow-wrap'], 'break-word',
    'RED: название — overflow-wrap: break-word; факт: '
    + d['overflow-wrap']);
});

test('000313-S1e. index.html: гард базы — .combat-side 320px, .cp-items margin-top 4px, .cp-itemrow display flex, .cp-itemicon 22px, .cp-title 15px (000313 базу не трогает)', () => {
  assert.equal(cssRule('.combat-side')['width'], '320px',
    'базовый .combat-side — 320px');
  assert.equal(cssRule('.cp-items')['margin-top'], '4px',
    'базовый .cp-items — margin-top 4px');
  assert.equal(cssRule('.cp-itemrow')['display'], 'flex',
    'базовый .cp-itemrow — display: flex');
  const ic = cssRule('.cp-itemicon');
  assert.equal(ic['width'], '22px', 'базовый .cp-itemicon — 22px');
  assert.equal(ic['height'], '22px', 'базовый .cp-itemicon — 22px');
  assert.equal(cssRule('.cp-title')['font-size'], '15px',
    'базовый .cp-title — font-size 15px');
});

// ============================================================
// vm-секция: full-chain песочница index.html (S2..S5)
// ============================================================

const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g),
  (m) => m[1]).map((p) => p.replace(/^src\//, ''));
const NOW = 1000;
const G_CELL_FLOOR = 1;

function makeGl() {
  const noop = () => {};
  const gl = {
    VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35732,
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
    draggable: false,
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

function textOf(n) {
  let s = String(n.textContent || '');
  for (const ch of n.children || []) s += textOf(ch);
  return s;
}

function makeStorage() {
  const m = new Map();
  const saves = [];
  const s = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); saves.push(k); },
    removeItem: (k) => { m.delete(k); },
  };
  s.saves = saves;
  return s;
}

function bootSandbox(existingStorage) {
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
  const storage = existingStorage || makeStorage();
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
  return { sandbox, winListeners, raf, errors, body, hud };
}

const drain = () => new Promise((r) => setImmediate(r));

async function bootChain(existingStorage) {
  const h = bootSandbox(existingStorage);
  await drain();
  await drain();
  await drain();
  const g = h.sandbox.__game;
  assert.ok(g, 'globalThis.__game выставлен (main.js выполнен)');
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет (порядок цепочки): ' + h.errors.join('; '));
  h.frameFn = h.raf[h.raf.length - 1];
  return h;
}

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

function keydownFor(dx, dy) {
  return dx === 1 ? 'ArrowRight' : dx === -1 ? 'ArrowLeft'
    : dy === 1 ? 'ArrowDown' : 'ArrowUp';
}

function press(h, code) { return key(h, code); }
function release(h, code) { return keyup(h, code); }

function walkTiles(h, now, tiles) {
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  for (const [tx, ty] of tiles) {
    const dx = tx - g.state.player.x, dy = ty - g.state.player.y;
    assert.ok(Math.abs(dx) + Math.abs(dy) === 1,
      'BFS: шаг по соседнему тайлу');
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
      'сценарий: игрок перешёл на (' + tx + ',' + ty + ') — x');
    assert.equal(g.state.player.y, ty,
      'сценарий: игрок перешёл на (' + tx + ',' + ty + ') — y');
    if (G.combatUI.isActive()) {
      const c = G.combatUI.current();
      for (const m of c.units.filter((x) => x.side === 'mob'
          && x.alive)) {
        G.combatInternals.dealDamageToMob(c, m, 9999);
      }
      assert.ok(c.result && c.result.outcome === 'victory',
        'zone-бой по маршруту — победа');
      G.combatUI.handleCode('Space');
      assert.equal(G.combatUI.isActive(), false,
        'zone-бой закрыт (Space)');
    }
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

function freeCityCell(info) {
  const d = info.layout;
  const occupied = new Set(
    (info.contents ? info.contents.buildings : [])
      .map((b) => b.x + ',' + b.y));
  for (let y = 1; y < d.height - 1; y++) {
    for (let x = 1; x < d.width - 1; x++) {
      if (x === d.entrance.x && y === d.entrance.y) continue;
      if (d.cells[y * d.width + x] !== G_CELL_FLOOR) continue;
      if (occupied.has(x + ',' + y)) continue;
      return { x, y };
    }
  }
  return null;
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

function cityStepsTo(from, tx, ty) {
  const steps = [];
  const vy = ty < from.y ? -1 : 1;
  for (let y = from.y + vy; y !== ty + vy; y += vy) steps.push([from.x, y]);
  const hx = tx < from.x ? -1 : 1;
  for (let x = from.x + hx; x !== tx + hx; x += hx) steps.push([x, ty]);
  return steps;
}

function walkCity(h, steps) {
  const g = h.sandbox.__game;
  for (const [tx, ty] of steps) {
    const dx = tx - g.dungeon.x, dy = ty - g.dungeon.y;
    assert.ok(Math.abs(dx) + Math.abs(dy) === 1,
      'город: шаг по соседней клетке');
    const code = keydownFor(dx, dy);
    press(h, code);
    release(h, code);
    assert.ok(g.dungeon, 'в городе (не вышел)');
    assert.equal(g.dungeon.x, tx, 'город: шаг x (' + tx + ',' + ty + ')');
    assert.equal(g.dungeon.y, ty, 'город: шаг y (' + tx + ',' + ty + ')');
  }
}

function buildingOverlayOf(h) {
  const ovs = findAll(h.body, '.combat-overlay').filter((o) =>
    !String(o.className).includes('npc-overlay') &&
    !String(o.className).includes('dungeon-overlay'));
  return ovs[ovs.length - 1] || null;
}

function findRow(overlay, id) {
  return findAll(overlay, '[data-buid]')
    .find((r) => r.dataset.buid === id) || null;
}

function hudFrames(h, now) {
  h.frameFn(now + 200);
  h.frameFn(now + 400);
  return now + 400;
}

function hudText(h) {
  return textOf(h.sandbox.document.getElementById('hud'));
}

function qtyOf(g, id) {
  return (g.state.hero.inventory || [])
    .filter((e) => e && e.id === id)
    .reduce((s, e) => s + (e.qty || 0), 0);
}

function seedEntries(g, list) {
  const slots = g.state.hero.inventory;
  assert.ok(Array.isArray(slots), 'инвентарь — живой массив слотов');
  for (const [id, qty] of list) slots.push({ id, qty });
  return slots;
}

function storageOf(g, anchor) {
  const b = g.cities[anchor].built
    .find((e) => e.buildingId === 55);
  assert.ok(b, 'built-запись 55');
  return b.storage;
}

const copyOf = (v) => JSON.parse(JSON.stringify(v));

function colOf(overlay, tok) {
  return findAll(overlay, '.storage-col')
    .find((c) => String(c.className).includes(tok)) || null;
}

// Фейк drag-события: getData — ЗАБРОШЕН (в браузере защищён на
// dragover; реализация обязана опираться на внутреннее drag-состояние,
// а не на dataTransfer — вызов getData = красный тест).
function fakeDragEvent() {
  const calls = { setData: [], preventDefault: 0 };
  const dataTransfer = {
    setData: (type, value) => { calls.setData.push([type, value]); },
    getData: () => {
      throw new Error('000313: getData — защищён в браузере на '
        + 'dragover/drop-валидации — использовать нельзя');
    },
  };
  return {
    e: {
      dataTransfer,
      preventDefault: () => { calls.preventDefault += 1; },
    },
    calls,
    dt: dataTransfer,
  };
}

// Сценарий: boot → город (fp>=2, свободная клетка) → build-55
// (100 з. + Бревно×2 + Каменный обломок×2 — старт 100 з.).
async function bootBuiltStorage() {
  const storage = makeStorage();
  const h = await bootChain(storage);
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findCityFor(G, myMap, g.state.player,
    (c) => c.fp >= 2 && freeCityCell(c) !== null
      && safeWorldNeighbor(G, myMap, c.tile) !== null);
  assert.ok(found,
    'сценарий: город (fp>=2) со свободной клеткой + безопасным соседом');
  let now = walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg && dg.kind === 'city', 'в городе (авто-вход)');
  const target = freeCityCell(found);
  seedEntries(g, [['wood_log', 1], ['wood_log', 1], ['stone_chunk', 1],
    ['stone_chunk', 1]]);
  walkCity(h, cityStepsTo({ x: g.dungeon.x, y: g.dungeon.y },
    target.x, target.y));
  key(h, 'KeyE');
  const ovB = buildingOverlayOf(h);
  const row55 = findRow(ovB, 'build-55');
  assert.ok(row55, 'строка build-55 в меню «Строительство»');
  ovB.listeners.click[0]({ target: row55 });
  assert.equal(g.state.hero.gold, 0, 'gold 100 → 0 (цена 55)');
  assert.equal(qtyOf(g, 'wood_log'), 0, 'Бревно списано (×2)');
  assert.equal(qtyOf(g, 'stone_chunk'), 0, 'Каменный обломок списан (×2)');
  const anchor = found.ax + ',' + found.ay;
  assert.deepEqual(copyOf(g.cities[anchor].built),
    [{ x: target.x, y: target.y, buildingId: 55, player: true }],
    'built — запись 55 (storage — лениво, при открытии)');
  return { h, g, G, anchor, now, storage };
}

// [E] на построенном 55 → строка «Хранилище» → клик → storage-оверлей.
function openStorageOverlay(h) {
  key(h, 'KeyE');
  const ovM = buildingOverlayOf(h);
  assert.ok(textOf(ovM).includes('Хранилище'),
    '[E] — меню построенного 55: ' + textOf(ovM).slice(0, 300));
  const rowSt = findRow(ovM, 'storage');
  assert.ok(rowSt, 'строка «Хранилище» (эффект)');
  ovM.listeners.click[0]({ target: rowSt });
  return buildingOverlayOf(h);
}

// ============================================================
// S2. vm e2e: открытие — две панели, класс, заголовки, empty-строка,
//     pipeline-молчание
// ============================================================

test('000313-S2. vm e2e: storage-оверлей — класс combat-overlay--storage; .storage-cols > ровно 2 .storage-col (инвентарь | склад); пустые → «empty»-строка в ПРАВОЙ (disabled, не draggable, без кнопок); после сида — put-строки с иконкой/rarity/meta/кнопкой «Сложить» (draggable), заголовки «Инвентарь» / «Склад (0/40)»; открытие — без saveNow/flash', async () => {
  const { h, g, G, anchor, now: n0, storage } = await bootBuiltStorage();
  const savesBefore = storage.saves.length;
  const ov0 = openStorageOverlay(h);
  let now = hudFrames(h, n0);
  assert.ok(String(ov0.className).includes('combat-overlay'),
    'оверлей — .combat-overlay (токен для buildingOverlayOf)');
  assert.ok(String(ov0.className).includes('combat-overlay--storage'),
    'RED: класс combat-overlay--storage; факт: ' + ov0.className);
  const colsWrap = ov0.querySelector('.storage-cols');
  assert.ok(colsWrap, 'RED: контейнер .storage-cols');
  const cols = colsWrap.children;
  assert.equal(cols.length, 2,
    'RED: ровно 2 панели; факт: ' + cols.length);
  const invCol = colOf(ov0, 'storage-col--inv');
  const stockCol = colOf(ov0, 'storage-col--stock');
  assert.ok(invCol, 'RED: левая панель .storage-col--inv');
  assert.ok(stockCol, 'RED: правая панель .storage-col--stock');
  assert.equal(cols[0], invCol, 'левая — ИНВЕНТАРЬ');
  assert.equal(cols[1], stockCol, 'правая — СКЛАД');
  assert.equal(textOf(invCol.children[0]), 'Инвентарь',
    'RED: заголовок левой панели «Инвентарь»');
  assert.equal(textOf(stockCol.children[0]), 'Склад (0/40)',
    'RED: заголовок правой панели «Склад (0/40)» (capacity): '
    + textOf(stockCol.children[0]));
  // (a) ПУСТОЕ: обе панели пусты — одна «empty»-строка в ПРАВОЙ.
  assert.equal(findAll(invCol, '[data-buid]').length, 0,
    'пустый инвентарь — 0 строк слева');
  const emptyRows = findAll(stockCol, '[data-buid]');
  assert.equal(emptyRows.length, 1,
    'RED: пустой склад — одна «empty»-строка справа; факт: '
    + emptyRows.length);
  const emptyRow = emptyRows[0];
  assert.equal(emptyRow.dataset.buid, 'empty', 'id «empty»');
  assert.ok(textOf(emptyRow).includes('Хранилище и инвентарь пусты'),
    'текст «empty»-строки');
  assert.equal(emptyRow.disabled, true, '«empty» — disabled');
  assert.equal(emptyRow.draggable, false,
    'RED: «empty» — НЕ draggable');
  assert.equal(findAll(emptyRow, 'button').length, 0,
    '«empty» — без кнопок');
  // (b) pipeline-молчание: без saveNow/flash.
  assert.ok(!hudText(h).includes('Сложено')
    && !hudText(h).includes('Вынуто')
    && !hudText(h).includes('Хранилище полное'),
    'RED: открытие — без flash-строк переноса: '
    + hudText(h).slice(0, 200));
  assert.equal(storage.saves.length, savesBefore,
    'RED: открытие — без saveNow (сейв не стрелял)');
  // (c) СИД: шляпа (rarity common) + Сера ×3 → 2 put-строки слева.
  key(h, 'Escape');
  seedEntries(g, [['straw_hat', 1], ['sulfur', 3]]);
  const ov1 = openStorageOverlay(h);
  now = hudFrames(h, now);
  assert.equal(textOf(colOf(ov1, 'storage-col--stock').children[0]),
    'Склад (0/40)', 'заголовок — (0/40) (склад ещё пуст)');
  const putRows = findAll(colOf(ov1, 'storage-col--inv'), '[data-buid]');
  assert.equal(putRows.length, 2,
    'RED: 2 put-строки в левой панели; факт: ' + putRows.length);
  assert.equal(putRows[0].dataset.buid, 'put-0');
  assert.equal(putRows[1].dataset.buid, 'put-1');
  const hat = G.getItem('straw_hat');
  const sul = G.getItem('sulfur');
  const hatIcon = putRows[0].querySelector('img.cp-itemicon');
  assert.ok(hatIcon, 'RED: иконка в put-строке (img.cp-itemicon)');
  assert.equal(hatIcon.src, hat.icon,
    'RED: иконка — из каталога (icon предмета)');
  assert.ok(String(putRows[0].className).includes('cp-rarity-common'),
    'RED: rarity-рамка (common) в put-строке: ' + putRows[0].className);
  assert.ok(textOf(putRows[0]).includes('Сложить: Соломенная шляпа ×1'),
    'имя строки «Сложить: <имя> ×<qty>» (курсор-маркер допускаем): '
    + textOf(putRows[0]));
  assert.ok(textOf(putRows[0]).includes('0.2 кг, 10 з'),
    'RED: meta «X.X кг, Y з» (формат вкладки [I]): '
    + textOf(putRows[0]));
  const hatBtn = putRows[0].querySelector('button.cp-btn');
  assert.ok(hatBtn, 'RED: кнопка «Сложить» (button.cp-btn) в put-строке');
  assert.equal(hatBtn.textContent, 'Сложить', 'RED: текст «Сложить»');
  assert.equal(hatBtn.disabled, false, 'доступная строка — кнопка жива');
  assert.equal(putRows[0].draggable, true,
    'RED: доступная put-строка — draggable');
  const sulIcon = putRows[1].querySelector('img.cp-itemicon');
  assert.ok(sulIcon, 'иконка у sulfur-строки');
  assert.equal(sulIcon.src, sul.icon, 'иконка — из каталога');
  assert.equal(String(putRows[1].className), 'cp-itemrow',
    'у reagent rarity нет — рамка отсутствует');
  assert.ok(textOf(putRows[1]).includes('0.6 кг, 3 з'),
    'RED: meta sulfur ×3 — «0.6 кг, 3 з»: ' + textOf(putRows[1]));
  const sulBtn = putRows[1].querySelector('button.cp-btn');
  assert.ok(sulBtn, 'кнопка «Сложить» у sulfur-строки');
  assert.equal(sulBtn.textContent, 'Сложить');
  assert.equal(findAll(colOf(ov1, 'storage-col--stock'), '[data-buid]')
    .length, 0, 'правая панель — 0 строк (склад пуст)');
});

// ============================================================
// S3. vm e2e: «Сложить»/«Вынуть» КЛИКОМ — одна мутация, строки
//     переезжают, флэши по факту кода, оверлей заменён, saveNow
// ============================================================

test('000313-S3. vm e2e: «Сложить» (клик по кнопке) — запись УШЛА из инвентаря (splice), в built.storage, flash «Сложено: Сера ×3», saveNow (сейв обновлён), оверлей заменён (новый узел), put-строка исчезла слева, справа — take-строка с «Вынуть»; «Вынуть» — зеркально (flash «Вынуто: Сера ×3»)', async () => {
  const { h, g, anchor, now: n0, storage } = await bootBuiltStorage();
  seedEntries(g, [['sulfur', 3]]);
  const ov0 = openStorageOverlay(h);
  let now = hudFrames(h, n0);
  const savesBefore = storage.saves.length;
  const putRow = findRow(ov0, 'put-0');
  assert.ok(putRow, 'put-0 (Сера ×3)');
  assert.equal(qtyOf(g, 'sulfur'), 3, 'сид: Сера ×3');
  const btn = putRow.querySelector('button.cp-btn');
  assert.ok(btn, 'RED: кнопка «Сложить» (button.cp-btn)');
  ov0.listeners.click[0]({ target: btn });
  now = hudFrames(h, now);
  assert.equal(qtyOf(g, 'sulfur'), 0,
    'RED: запись УШЛА из инвентаря (splice по идентичности)');
  assert.deepEqual(copyOf(storageOf(g, anchor)),
    [{ id: 'sulfur', qty: 3 }],
    'RED: запись в built.storage (live-запись — точка персиста)');
  assert.ok(hudText(h).includes('Сложено: Сера ×3'),
    'RED: flash «Сложено: <имя> ×<qty>»: ' + hudText(h).slice(0, 300));
  assert.equal(storage.saves.length, savesBefore + 1,
    'RED: успех — saveNow (ровно 1 сейв на перенос)');
  assert.ok(h.sandbox.window.localStorage.getItem(SAVE_KEY),
    'сейв-файл записан (saveNow → localStorage)');
  const ov1 = buildingOverlayOf(h);
  assert.notEqual(ov1, ov0,
    'RED: оверлей заменён после переноса (reopen — новый узел)');
  assert.ok(textOf(ov1.querySelector('.cp-title')).includes('Хранилище'),
    'title «Хранилище»: ' + textOf(ov1.querySelector('.cp-title')));
  assert.equal(findAll(colOf(ov1, 'storage-col--inv'), '[data-buid]')
    .length, 0, 'RED: инвентарь пуст — put-строки исчезли');
  const takeRows = findAll(colOf(ov1, 'storage-col--stock'),
    '[data-buid]');
  assert.equal(takeRows.length, 1,
    'RED: склад-строка появилась справа');
  assert.equal(takeRows[0].dataset.buid, 'take-0', 'id take-0');
  const takeBtn = takeRows[0].querySelector('button.cp-btn');
  assert.ok(takeBtn, 'кнопка «Вынуть» в take-строке');
  assert.equal(takeBtn.textContent, 'Вынуть', 'RED: текст «Вынуть»');
  assert.ok(textOf(takeRows[0]).includes('Вынуть: Сера ×3'),
    'имя «Вынуть: Сера ×3»: ' + textOf(takeRows[0]));
  assert.equal(takeRows[0].draggable, true,
    'RED: доступная take-строка — draggable');
  assert.equal(textOf(colOf(ov1, 'storage-col--stock').children[0]),
    'Склад (1/40)', 'RED: заголовок обновлён (1/40)');
  ov1.listeners.click[0]({ target: takeBtn });
  now = hudFrames(h, now);
  assert.equal(qtyOf(g, 'sulfur'), 3,
    'RED: «Вынуть» — зеркально: запись вернулась в инвентарь');
  assert.deepEqual(copyOf(storageOf(g, anchor)), [],
    'RED: склад пуст после «Вынуть»');
  assert.ok(hudText(h).includes('Вынуто: Сера ×3'),
    'RED: flash «Вынуто: <имя> ×<qty>»: ' + hudText(h).slice(0, 300));
  assert.equal(storage.saves.length, savesBefore + 2,
    'RED: «Вынуть» — saveNow (итого 2 сейва)');
});

// ============================================================
// S4. vm e2e: drag-n-drop — ПАРИТЕТ с кнопкой (одна мутация)
// ============================================================

test('000313-S4. vm e2e: dnd-паритет — dragstart (setData text/plain=id, effectAllowed move) → dragover на ЦЕЛЕВОЙ колонке (preventDefault) / на СВОЕЙ (без preventDefault) → drop — состояние (storage+slots+gold) deep-equal клику (multiset) + тот же flash + saveNow; зеркально take→инвентарь; drop без dragstart / в ту же колонку / по stale-строке закрытого оверлея — no-op (без мутации/флэша/сейва)', async () => {
  const { h, g, anchor, now: n0, storage } = await bootBuiltStorage();
  seedEntries(g, [['sulfur', 3], ['hide', 2]]);
  const ov0 = openStorageOverlay(h);
  let now = hudFrames(h, n0);
  const savesOpen = storage.saves.length;
  const norm = (arr) => JSON.parse(JSON.stringify(arr || []))
    .sort((a, b) => (String(a.id) + ':' + JSON.stringify(a.bonus || null)
        + ':' + (a.qty || 0))
      < (String(b.id) + ':' + JSON.stringify(b.bonus || null)
        + ':' + (b.qty || 0)) ? -1 : 1);
  const snap = () => ({
    slots: norm(g.state.hero.inventory),
    storage: norm(storageOf(g, anchor)),
    gold: g.state.hero.gold,
  });
  const base = snap();
  // (a) КЛИК: put-0 (Сера) — строка целиком.
  const rowPut0 = findRow(ov0, 'put-0');
  assert.ok(rowPut0, 'put-0 (Сера ×3)');
  ov0.listeners.click[0]({ target: rowPut0 });
  now = hudFrames(h, now);
  const afterClick = snap();
  assert.deepEqual(afterClick.storage, [{ id: 'sulfur', qty: 3 }],
    'клик: склад [Сера ×3]');
  assert.deepEqual(afterClick.slots, [{ id: 'hide', qty: 2 }],
    'клик: инвентарь [Кожа ×2]');
  assert.ok(hudText(h).includes('Сложено: Сера ×3'),
    'клик: flash «Сложено: Сера ×3»');
  assert.equal(storage.saves.length, savesOpen + 1,
    'клик: saveNow 1');
  // (b) откат кликом: take-0.
  const ovU = buildingOverlayOf(h);
  const rowTakeU = findRow(ovU, 'take-0');
  assert.ok(rowTakeU, 'take-0 (откат)');
  ovU.listeners.click[0]({ target: rowTakeU });
  now = hudFrames(h, now);
  assert.deepEqual(snap(), base, 'откат: состояние = базовое');
  assert.equal(storage.saves.length, savesOpen + 2,
    'откат: saveNow 2');
  // (c) DND: put-0 → склад-колонка.
  const ovC = buildingOverlayOf(h);
  const colInvC = colOf(ovC, 'storage-col--inv');
  const colStockC = colOf(ovC, 'storage-col--stock');
  assert.ok(colInvC && colStockC,
    'RED: две панели в оверлее (контейнеры dnd)');
  // После отката addItem дописал СЕРУ в КОНЕЦ: put-0 = Кожа,
  // put-1 = Сера (порядок слотов не пин — multiset-паритет).
  const dragRow = findRow(ovC, 'put-1');
  assert.ok(dragRow, 'put-1 (Сера ×3) для dnd');
  assert.ok(Array.isArray(dragRow.listeners.dragstart)
    && dragRow.listeners.dragstart.length >= 1,
    'RED: слушатель dragstart на put-строке');
  const d1 = fakeDragEvent();
  dragRow.listeners.dragstart[0](d1.e);
  assert.deepEqual(d1.calls.setData, [['text/plain', 'put-1']],
    'RED: dragstart — dataTransfer.setData("text/plain", id): '
    + JSON.stringify(d1.calls.setData));
  assert.equal(d1.dt.effectAllowed, 'move',
    'RED: dragstart — effectAllowed "move"');
  assert.ok(Array.isArray(colStockC.listeners.dragover)
    && colStockC.listeners.dragover.length >= 1,
    'RED: слушатель dragover на склад-колонке');
  const d2 = fakeDragEvent();
  colStockC.listeners.dragover[0](d2.e);
  assert.equal(d2.calls.preventDefault, 1,
    'RED: dragover на ЦЕЛЕВОЙ (склад) колонке — preventDefault');
  const d3 = fakeDragEvent();
  colInvC.listeners.dragover[0](d3.e);
  assert.equal(d3.calls.preventDefault, 0,
    'RED: dragover на СВОЕЙ (инвентарь) колонке — БЕЗ preventDefault');
  assert.ok(Array.isArray(colStockC.listeners.drop)
    && colStockC.listeners.drop.length >= 1,
    'RED: слушатель drop на склад-колонке');
  const d4 = fakeDragEvent();
  colStockC.listeners.drop[0](d4.e);
  now = hudFrames(h, now);
  assert.deepEqual(snap(), afterClick,
    'RED: dnd — ПАРИТЕТ: состояние deep-equal клику');
  assert.ok(hudText(h).includes('Сложено: Сера ×3'),
    'RED: dnd — тот же flash, что у клика');
  assert.equal(storage.saves.length, savesOpen + 3,
    'RED: dnd — saveNow (паритет с кликом)');
  // (d) после drop — dragend (браузер: срабатывает после drop) →
  // drag-состояние очищено; drop без dragstart — no-op.
  assert.ok(Array.isArray(dragRow.listeners.dragend)
    && dragRow.listeners.dragend.length >= 1,
    'RED: слушатель dragend на put-строке');
  dragRow.listeners.dragend[0](fakeDragEvent().e);
  const ovD = buildingOverlayOf(h);
  const colStockD = colOf(ovD, 'storage-col--stock');
  assert.ok(colStockD && Array.isArray(colStockD.listeners.drop)
    && colStockD.listeners.drop.length >= 1,
    'RED: слушатель drop на склад-колонке (после drop)');
  const pre = { snap: snap(), hud: hudText(h),
    saves: storage.saves.length };
  colStockD.listeners.drop[0](fakeDragEvent().e);
  assert.deepEqual(snap(), pre.snap, 'drop без dragstart — нет мутации');
  assert.equal(hudText(h), pre.hud,
    'drop без dragstart — нет нового флэша');
  assert.equal(storage.saves.length, pre.saves,
    'drop без dragstart — без сейва');
  // (e) зеркально: take-0 → инвентарь-колонка (паритет с кликом).
  const ovT = buildingOverlayOf(h);
  const colInvT = colOf(ovT, 'storage-col--inv');
  assert.ok(colInvT, 'RED: инвентарь-колонка (take-dnd)');
  const dragTake = findRow(ovT, 'take-0');
  assert.ok(dragTake, 'take-0 для dnd');
  assert.ok(Array.isArray(dragTake.listeners.dragstart)
    && dragTake.listeners.dragstart.length >= 1,
    'RED: слушатель dragstart на take-строке');
  const d6 = fakeDragEvent();
  dragTake.listeners.dragstart[0](d6.e);
  assert.deepEqual(d6.calls.setData, [['text/plain', 'take-0']],
    'take-drag: setData("text/plain", "take-0")');
  const d7 = fakeDragEvent();
  colInvT.listeners.dragover[0](d7.e);
  assert.equal(d7.calls.preventDefault, 1,
    'RED: take → dragover на инвентарь-колонке — preventDefault');
  const d8 = fakeDragEvent();
  colInvT.listeners.drop[0](d8.e);
  now = hudFrames(h, now);
  assert.deepEqual(snap(), base,
    'RED: dnd take — ПАРИТЕТ: состояние = базовое (откат кликом)');
  assert.ok(hudText(h).includes('Вынуто: Сера ×3'),
    'RED: dnd take — flash «Вынуто: Сера ×3»');
  assert.equal(storage.saves.length, savesOpen + 4,
    'RED: dnd take — saveNow (паритет)');
  // (f) drop в ту же колонку (put-0 Кожа → инвентарь) — no-op.
  const ovF = buildingOverlayOf(h);
  const rowHide = findRow(ovF, 'put-0');
  assert.ok(rowHide, 'put-0 (Кожа ×2)');
  assert.ok(Array.isArray(rowHide.listeners.dragstart)
    && rowHide.listeners.dragstart.length >= 1,
    'RED: dragstart на put-0');
  const d9 = fakeDragEvent();
  rowHide.listeners.dragstart[0](d9.e);
  assert.deepEqual(d9.calls.setData, [['text/plain', 'put-0']],
    'put-0-drag: setData("text/plain", "put-0")');
  const preF = { snap: snap(), hud: hudText(h),
    saves: storage.saves.length };
  const colInvF = colOf(ovF, 'storage-col--inv');
  assert.ok(colInvF && Array.isArray(colInvF.listeners.drop)
    && colInvF.listeners.drop.length >= 1,
    'RED: drop на инвентарь-колонке (та же колонка)');
  colInvF.listeners.drop[0](fakeDragEvent().e);
  assert.deepEqual(snap(), preF.snap, 'RED: drop в ту же колонку — no-op');
  assert.equal(hudText(h), preF.hud,
    'drop в ту же колонку — нет флэша');
  assert.equal(storage.saves.length, preF.saves,
    'drop в ту же колонку — без сейва');
  assert.ok(Array.isArray(rowHide.listeners.dragend)
    && rowHide.listeners.dragend.length >= 1,
    'RED: dragend на put-1');
  rowHide.listeners.dragend[0](fakeDragEvent().e);
  // (g) stale-строка закрытого оверлея — no-op.
  const ovG1 = buildingOverlayOf(h);
  const gPut = findRow(ovG1, 'put-0');
  assert.ok(gPut, 'put-0 (Сера) для stale-сценария');
  ovG1.listeners.click[0]({ target: gPut });
  now = hudFrames(h, now);
  const ovG2 = buildingOverlayOf(h);
  const staleTake = findRow(ovG2, 'take-0');
  assert.ok(staleTake, 'take-0 (Сера) в текущем оверлее');
  ovG2.listeners.click[0]({ target: staleTake });
  now = hudFrames(h, now);
  const ovG3 = buildingOverlayOf(h);
  assert.ok(!findRow(ovG3, 'take-0'),
    'после отката take-строк нет (склад пуст)');
  const preG = { snap: snap(), hud: hudText(h),
    saves: storage.saves.length };
  assert.ok(Array.isArray(staleTake.listeners.dragstart)
    && staleTake.listeners.dragstart.length >= 1,
    'RED: dragstart на stale-строке (element detached)');
  const d11 = fakeDragEvent();
  staleTake.listeners.dragstart[0](d11.e);
  assert.deepEqual(d11.calls.setData, [['text/plain', 'take-0']],
    'stale-drag: setData отработал (строка жива в отрыве)');
  const colInvG = colOf(ovG3, 'storage-col--inv');
  assert.ok(colInvG && Array.isArray(colInvG.listeners.drop)
    && colInvG.listeners.drop.length >= 1,
    'RED: drop на инвентарь-колонке текущего оверлея');
  colInvG.listeners.drop[0](fakeDragEvent().e);
  assert.deepEqual(snap(), preG.snap,
    'RED: drop по stale-id (строки больше нет в actions) — no-op');
  assert.equal(hudText(h), preG.hud,
    'stale-drop — нет нового флэша');
  assert.equal(storage.saves.length, preG.saves,
    'stale-drop — без сейва');
  // (h) каждый перенос (клик И dnd) — saveNow; каждый no-op — нет.
  assert.equal(storage.saves.length, savesOpen + 6,
    'ровно 6 saveNow (a/b/c/e + 2 клика в g — по одному на каждый '
    + 'перенос); no-op (d/f/stale-drop) — 0: '
    + (storage.saves.length - savesOpen));
});

// ============================================================
// S5. vm e2e: ёмкость 40/40 — отказ без мутации/сейва, dnd-вход
//     закрыт (строка не draggable)
// ============================================================

const ALL40 = [
  'sulfur', 'hide', 'wood_log', 'moonstone', 'stone_chunk',
  'herb_healing', 'iron_ore', 'coal', 'herb_mana', 'herb_bitter',
  'bread', 'meat', 'honey_cake', 'minor_healing', 'mana_potion',
  'alchemy_manual', 'archery_manual', 'fireball_scroll',
  'frost_bolt_scroll', 'berry_red',
  'wood_sword', 'iron_sword', 'steel_sword', 'short_bow',
  'hunting_bow', 'leather_armor', 'chainmail', 'healing_potion',
  'greater_healing', 'mana_elixir', 'sword_treatise', 'fire_spellbook',
  'ice_spellbook', 'stone_chisel', 'flame_burst_scroll',
  'blizzard_scroll', 'silver_ore', 'quartz', 'berry_blue',
  'fruit_apple',
];
const ALL41 = ALL40.concat(['fruit_quince']);

test('000313-S5. vm e2e: ёмкость 40/40 — 40 × «Сложить» → строка put disabled (reason «хранилище полное (40/40)», кнопка disabled, строка НЕ draggable), заголовок «Склад (40/40)»; drop без dragstart — no-op (без мутации/флэша/сейва)', async () => {
  const { h, g, anchor, now: n0, storage } = await bootBuiltStorage();
  seedEntries(g, ALL41.map((id) => [id, 1]));
  const ov0 = openStorageOverlay(h);
  let now = hudFrames(h, n0);
  let guard = 0;
  let stored = 0;
  while (guard++ < 45) {
    const ov = buildingOverlayOf(h);
    const rowP = findRow(ov, 'put-0');
    assert.ok(rowP, 'put-0 (итер ' + guard + ')');
    if (rowP.disabled) break;
    ov.listeners.click[0]({ target: rowP });
    stored += 1;
    now = hudFrames(h, now);
  }
  assert.equal(stored, 40,
    'RED: ровно 40 переносов до ёмкости (стоп на итер ' + guard + ')');
  assert.equal(storageOf(g, anchor).length, 40,
    'RED: хранилище — 40 записей (ёмкость, каталог 40)');
  assert.equal(g.state.hero.inventory.length, 1,
    'инвентарь — 1 запись (остаток)');
  assert.equal(qtyOf(g, 'fruit_quince'), 1, 'остаток — fruit_quince');
  const ovF = buildingOverlayOf(h);
  const rowFull = findRow(ovF, 'put-0');
  assert.ok(rowFull, 'put-0 (fruit_quince)');
  assert.equal(rowFull.disabled, true,
    'RED: «Сложить» DISABLED при ёмкости 40/40');
  assert.ok(textOf(rowFull).includes('хранилище полное (40/40)'),
    'RED: reason «хранилище полное (40/40)»: ' + textOf(rowFull));
  assert.equal(rowFull.draggable, false,
    'RED: при ёмкости put-строка НЕ draggable (dnd-вход закрыт)');
  const fullBtn = rowFull.querySelector('button.cp-btn');
  assert.ok(fullBtn, 'кнопка у disabled-строки есть (маркер)');
  assert.equal(fullBtn.disabled, true,
    'RED: disabled-строка — кнопка disabled');
  const colStockF = colOf(ovF, 'storage-col--stock');
  assert.ok(colStockF, 'RED: правая панель в оверлее ёмкости');
  assert.equal(textOf(colStockF.children[0]), 'Склад (40/40)',
    'RED: заголовок (40/40)');
  // (a) drop без dragstart — no-op (флэша «Хранилище полное» ещё нет).
  assert.ok(!hudText(h).includes('Хранилище полное'),
    'перед отказом — флэша «Хранилище полное» нет');
  assert.ok(Array.isArray(colStockF.listeners.drop)
    && colStockF.listeners.drop.length >= 1,
    'RED: слушатель drop на склад-колонке');
  const preA = {
    storage: JSON.parse(JSON.stringify(storageOf(g, anchor))),
    hud: hudText(h),
    saves: storage.saves.length,
  };
  colStockF.listeners.drop[0](fakeDragEvent().e);
  assert.deepEqual(copyOf(storageOf(g, anchor)), preA.storage,
    'RED: drop — хранилище не мутировано');
  assert.equal(hudText(h), preA.hud, 'RED: drop — без нового флэша');
  assert.equal(storage.saves.length, preA.saves,
    'RED: drop — без сейва');
});

// ============================================================
// node-секция: фикстуры (паттерн tests/city-storage.test.js)
// ============================================================

const STORAGE_MOD = path.join(ROOT, 'src/building-effect-storage.js');
function loadStorageMod() {
  if (!fs.existsSync(STORAGE_MOD)) return null;
  try { return require(STORAGE_MOD); } catch (err) { return null; }
}

function makeOverlayStubs(over = {}) {
  const state = { building: !!over.buildingOpen };
  const calls = { buildingOpen: [] };
  const buildingUI = {
    open: (p) => { state.building = true; calls.buildingOpen.push(p); },
    close: () => { state.building = false; },
    isActive: () => state.building,
  };
  const npcUI = {
    open: () => {}, close: () => {}, isActive: () => false,
  };
  const combatUI = { isActive: () => false };
  const dungeonUI = { isActive: () => false };
  return { state, calls, buildingUI, npcUI, combatUI, dungeonUI };
}

function makeCityDs(over = {}) {
  const buildings = over.cityContents === undefined
    ? [] : over.cityContents;
  return {
    kind: 'city',
    x: over.x === undefined ? 1 : over.x,
    y: over.y === undefined ? 1 : over.y,
    pos: { x: over.x === undefined ? 1 : over.x,
      y: over.y === undefined ? 1 : over.y },
    contents: null,
    cityContents: buildings === null ? null : { buildings, seed: 9 },
    cityShops: over.cityShops === undefined ? {} : over.cityShops,
    cityWealth: 1,
    name: 'Деревня',
    dg: { width: 4, height: 4, cells: null,
      entrance: { x: 1, y: 3 }, exit: { x: 2, y: 0 } },
  };
}

function makeDeps(over = {}) {
  const o = makeOverlayStubs(over);
  const ds = makeCityDs(over);
  const deps = {
    game: {
      buildingEffects: BE,
      buildingUI: o.buildingUI,
      npcUI: o.npcUI,
      combatUI: o.combatUI,
      dungeonUI: o.dungeonUI,
      getBuilding: (id) => B.getBuilding(id),
      npcForBuilding: (list, bid) =>
        (list || []).find((n) => Array.isArray(n.постройки)
          && n.постройки.includes(bid)) || null,
    },
    clock: { day: 5 },
    hero: { id: 'hero', name: 'Флогистон', gold: 100 },
    questBook: { active: [], done: [] },
    player: { x: 5, y: 7 },
    prevPos: { x: 5, y: 7 },
    npcs: over.npcs === undefined ? [] : over.npcs,
    cityState: () => ds,
    npcShopFor: (id) => ({ npc: null, stock: {} }),
    shopFor: () => null,
    collectSaveData: () => ({}),
    saveNow: () => {},
    flash: () => {},
    buildingOncePerDay: new Map(),
    buffs: [],
    teleports: new Map(),
    buildingQuests: new Map(),
    playerRender: () => {},
    moveHero: () => {},
    startCombat: () => {},
    getMap: () => ((x, y) => ({ x, y, passable: true, hasBuilding: false })),
    mover: null,
  };
  return { deps, o, ds };
}

function initStorageFixture(over = {}) {
  const env = makeDeps(over);
  env.ds.dg = C.createCityLayout(100, -40, 5);
  env.hero = PLR.createCharacter();
  env.deps.hero = env.hero;
  env.deps.game.getItem = IT.getItem;
  env.deps.game.hasItem = IT.hasItem;
  env.deps.game.removeItem = IT.removeItem;
  env.deps.game.addItem = IT.addItem;
  env.deps.game.canAddItem = IT.canAddItem;
  env.deps.game.totalQty = IT.totalQty;
  env.deps.game.getBuilding = (id) => B.getBuilding(id);
  env.deps.game.Cities = C;
  const S = loadStorageMod();
  if (S && typeof S.storageHandler === 'function') {
    BA.registerSpecial('storage', S.storageHandler);
  }
  BA.init(env.deps);
  return Object.assign({ BA }, env);
}

function wireCityAnchor(env, ax, ay) {
  env.ds.worldKey = ax + ',' + ay;
  env.deps.getMap = () => (
    ({ tileAt: () => ({ buildingAnchor: [ax, ay] }) }));
  return env;
}

function lastOverlay(t) {
  const list = t.o.calls.buildingOpen;
  return list[list.length - 1];
}

// ============================================================
// S6. node: transfer — ОДНА мутация (put/take, гарды, флэши)
// ============================================================

function transferFixture() {
  const flashes = [];
  const opens = [];
  let saves = 0;
  let renders = 0;
  const hero = PLR.createCharacter();
  IT.addItem(hero, 'wood_log', 3);
  const base = {
    ctx: {
      t: { x: 1, y: 1, cityAnchor: '100,-40' },
      b: B.getBuilding(55),
      hero,
      world: {
        cityStates: new Map([['100,-40', {
          built: [{ x: 1, y: 1, buildingId: 55, player: true,
            storage: [{ id: 'sulfur', qty: 5 }] }] }]]),
        game: {
          Cities: C,
          buildingUI: { open: (p) => { opens.push(p); } },
          getItem: IT.getItem, canAddItem: IT.canAddItem,
          addItem: IT.addItem, totalQty: IT.totalQty,
        },
        saveNow: () => { saves += 1; },
        flash: (m) => { flashes.push(m); },
        playerRender: () => { renders += 1; },
      },
    },
    hero,
    flashes,
    opens,
    getSaves: () => saves,
    getRenders: () => renders,
    record: null,
  };
  base.record = base.ctx.world.cityStates.get('100,-40');
  return base;
}

test('000313-S6a. node transfer: put ok — {ok:true}, storage НОВЫЙ массив (merge по (id,bonusState)), слот СПЛАЙСНУТ (quick не тронут — 000223: setQuick снял 1 шт., в стоке ×2), built-запись reassigned (live), flash «Сложено: Бревно ×2», saveNow/playerRender по 1', () => {
  const S = loadStorageMod();
  assert.ok(S && typeof S === 'object',
    'RED: модуль src/building-effect-storage.js (UMD)');
  assert.equal(typeof S.transfer, 'function',
    'RED: node-экспорт {transfer} (одна мутация)');
  const f = transferFixture();
  IT.setQuick(f.hero, 0, 'wood_log');
  const quickBefore = JSON.parse(JSON.stringify(f.hero.inventory.quick));
  const rec = f.record.built[0];
  const storageRefBefore = rec.storage;
  const r = S.transfer(f.ctx, { from: 'inv', index: 0 });
  assert.deepEqual(r, { ok: true }, 'put ok — {ok:true}: '
    + JSON.stringify(r));
  assert.equal(rec.storage.length, 2, 'built-запись — 2 записи');
  assert.notEqual(rec.storage, storageRefBefore,
    'RED: storage reassigned (НОВЫЙ массив — assignStorage)');
  assert.deepEqual(rec.storage, [{ id: 'sulfur', qty: 5 },
    { id: 'wood_log', qty: 2 }], 'запись сложена (×2 — 1 шт. в quick)');
  assert.equal(f.hero.inventory.slots.length, 0,
    'RED: слот сплайснут из инвентаря');
  assert.deepEqual(f.hero.inventory.quick, quickBefore,
    'RED: quick-слоты не тронуты (000223 — своя единица)');
  assert.equal(f.hero.inventory.quick[0], 'wood_log',
    'quick-слот жив (put не трогает quick)');
  assert.deepEqual(f.flashes, ['Сложено: Бревно ×2'],
    'RED: flash «Сложено: <имя> ×<qty>» дословно: '
    + JSON.stringify(f.flashes));
  assert.equal(f.getSaves(), 1, 'saveNow — 1 (успех)');
  assert.equal(f.getRenders(), 1, 'playerRender — 1 (успех)');
});

test('000313-S6b. node transfer: put при ЁМКОСТИ — {ok:false, reason:"full"} + flash «Хранилище полное»; слот/хранилище/сейв НЕ тронуты; прямой onAction (обход disabled, паттерн R8(g) 000221) — refusal-flash БЕЗ мутации/сейва; stale itemId — {ok:false} ТИХО (без флэша/сейва); битый индекс — {ok:false} тихо', () => {
  const S = loadStorageMod();
  assert.equal(typeof S.transfer, 'function',
    'RED: node-экспорт {transfer}');
  // (a) full: 40 записей (разные bonusState) + bread в инвентаре.
  const f = transferFixture();
  const st = [];
  for (let i = 0; i < 40; i++) {
    st.push({ id: 'sulfur', qty: 1, bonus: { amount: i } });
  }
  f.record.built[0].storage = st;
  IT.removeItem(f.hero, 'wood_log', 3);
  assert.ok(IT.addItem(f.hero, 'bread', 1).ok, 'сид bread');
  const r = S.transfer(f.ctx, { from: 'inv', index: 0 });
  assert.deepEqual(r, { ok: false, reason: 'full' },
    'RED: full — {ok:false, reason:"full"}: ' + JSON.stringify(r));
  assert.deepEqual(f.flashes, ['Хранилище полное'],
    'RED: отказ-flash «Хранилище полное» дословно: '
    + JSON.stringify(f.flashes));
  assert.equal(f.record.built[0].storage.length, 40,
    'RED: full — хранилище не мутировано');
  assert.equal(IT.totalQty(f.hero, 'bread'), 1,
    'RED: full — инвентарь не мутирован');
  assert.equal(f.getSaves(), 0, 'RED: full — saveNow 0 (без сейва)');
  // (b) прямой onAction (обход disabled, паттерн R8(g) 000221):
  // refusal-flash БЕЗ мутации/сейва.
  const resOv = S.storageHandler(Object.assign({}, f.ctx,
    { action: { id: 'storage' } }));
  assert.deepEqual(resOv, { ok: false },
    'pipeline (storage) — {ok:false} тихо: ' + JSON.stringify(resOv));
  const ovF = f.opens[f.opens.length - 1];
  assert.ok(ovF, 'payload оверлея — захвачен');
  const putRowF = ovF.actions.find((a) => a.id === 'put-0');
  assert.ok(putRowF, 'put-0 (bread) в payload');
  assert.equal(putRowF.доступен, false, 'put — disabled (ёмкость)');
  assert.equal(putRowF.reason, 'хранилище полное (40/40)',
    'reason — дословно: ' + putRowF.reason);
  const preF = {
    storage: JSON.parse(JSON.stringify(f.record.built[0].storage)),
    slots: JSON.parse(JSON.stringify(f.hero.inventory.slots)),
    n: f.flashes.length,
    saves: f.getSaves(),
  };
  ovF.onAction({ id: 'put-0' });
  assert.equal(f.flashes.length, preF.n + 1,
    'RED: прямой onAction — refusal-flash стрелял');
  assert.equal(f.flashes[preF.n], 'Хранилище полное',
    'RED: refusal-flash «Хранилище полное»: '
    + JSON.stringify(f.flashes));
  assert.deepEqual(f.record.built[0].storage, preF.storage,
    'RED: обход — хранилище не мутировано');
  assert.deepEqual(f.hero.inventory.slots, preF.slots,
    'RED: обход — инвентарь не мутирован');
  assert.equal(f.getSaves(), preF.saves,
    'RED: обход — без сейва (saveNow не стрелял)');
  // (c) stale itemId — тихо.
  const f2 = transferFixture();
  const r2 = S.transfer(f2.ctx, { from: 'inv', index: 0,
    itemId: 'sulfur' });
  assert.deepEqual(r2, { ok: false },
    'RED: stale itemId — {ok:false}: ' + JSON.stringify(r2));
  assert.equal(f2.flashes.length, 0, 'stale — БЕЗ флэша');
  assert.equal(f2.getSaves(), 0, 'stale — saveNow 0');
  assert.equal(f2.hero.inventory.slots.length, 1,
    'stale — слот не тронут');
  // (d) битый индекс — тихо.
  const r3 = S.transfer(f2.ctx, { from: 'inv', index: 99 });
  assert.deepEqual(r3, { ok: false },
    'RED: битый индекс — {ok:false} (тихо)');
  const r4 = S.transfer(f2.ctx, { from: 'inv', index: -1 });
  assert.deepEqual(r4, { ok: false }, 'отрицательный индекс — {ok:false}');
  assert.equal(f2.flashes.length, 0, 'битые индексы — без флэшей');
});

test('000313-S6c. node transfer: take ok — merge по (id,bonusState) в инвентаре (стак 5+3=8 ОДНОЙ стопкой), flash «Вынуто: Зелье маны ×3 (улучш.)», storage пуст, saveNow 1; take stale index — {ok:false} (storage нетронут); take stale itemId — {ok:false} тихо', () => {
  const S = loadStorageMod();
  assert.equal(typeof S.transfer, 'function',
    'RED: node-экспорт {transfer}');
  const f = transferFixture();
  IT.removeItem(f.hero, 'wood_log', 3);
  assert.ok(IT.addItem(f.hero, 'mana_potion', 5, { amount: 2 }).ok,
    'сид hero: Зелье маны ×5 (улучш.)');
  f.record.built[0].storage = [
    { id: 'mana_potion', qty: 3, bonus: { amount: 2 } }];
  const r = S.transfer(f.ctx, { from: 'storage', index: 0 });
  assert.deepEqual(r, { ok: true }, 'take ok — {ok:true}: '
    + JSON.stringify(r));
  const stacks = f.hero.inventory.slots
    .filter((e) => e.id === 'mana_potion'
      && e.bonus && e.bonus.amount === 2);
  assert.equal(stacks.length, 1,
    'RED: merge по (id,bonusState) — ОДНА бонус-стопка: '
    + JSON.stringify(f.hero.inventory.slots));
  assert.equal(stacks[0].qty, 8, 'RED: merge 5 + 3 = 8');
  assert.deepEqual(f.record.built[0].storage, [],
    'RED: storage пуст после take');
  assert.deepEqual(f.flashes, ['Вынуто: Зелье маны ×3 (улучш.)'],
    'RED: flash «Вынуто: <имя> ×<qty> (улучш.)» дословно: '
    + JSON.stringify(f.flashes));
  assert.equal(f.getSaves(), 1, 'saveNow — 1 (успех)');
  assert.equal(f.getRenders(), 1, 'playerRender — 1 (успех)');
  // (b) stale index — storage нетронут.
  const f2 = transferFixture();
  const st2 = JSON.parse(JSON.stringify(f2.record.built[0].storage));
  const r2 = S.transfer(f2.ctx, { from: 'storage', index: 5 });
  assert.deepEqual(r2, { ok: false },
    'RED: stale index — {ok:false}: ' + JSON.stringify(r2));
  assert.deepEqual(f2.record.built[0].storage, st2,
    'RED: stale index — storage нетронут');
  assert.equal(f2.flashes.length, 0, 'stale index — тихо');
  assert.equal(f2.getSaves(), 0, 'stale index — saveNow 0');
  // (c) stale itemId — тихо.
  const r3 = S.transfer(f2.ctx, { from: 'storage', index: 0,
    itemId: 'bread' });
  assert.deepEqual(r3, { ok: false },
    'RED: stale itemId (take) — {ok:false}');
  assert.equal(f2.flashes.length, 0, 'stale itemId — тихо');
});

test('000313-S6d. node transfer: take при ПОЛНОМ инвентаре — all-or-nothing: {ok:false} + flash reason dry-run, storage НЕ тронут, saveNow 0', () => {
  const S = loadStorageMod();
  assert.equal(typeof S.transfer, 'function',
    'RED: node-экспорт {transfer}');
  const f = transferFixture();
  IT.removeItem(f.hero, 'wood_log', 3);
  const BATCH_B = ['wood_sword', 'iron_sword', 'steel_sword', 'short_bow',
    'hunting_bow', 'leather_armor', 'chainmail', 'healing_potion',
    'greater_healing', 'mana_elixir', 'sword_treatise', 'fire_spellbook',
    'ice_spellbook', 'stone_chisel', 'flame_burst_scroll',
    'blizzard_scroll', 'silver_ore', 'quartz', 'berry_blue',
    'fruit_apple'];
  for (const rid of BATCH_B) {
    assert.ok(IT.addItem(f.hero, rid, 1).ok, 'сид батч: ' + rid);
  }
  assert.equal(f.hero.inventory.slots.length, 20,
    'инвентарь полный (20 слотов)');
  const st = JSON.parse(JSON.stringify(f.record.built[0].storage));
  const r = S.transfer(f.ctx, { from: 'storage', index: 0 });
  assert.deepEqual(r, { ok: false },
    'RED: полный инвентарь — {ok:false}: ' + JSON.stringify(r));
  assert.equal(f.flashes.length, 1, 'отказ-flash — ровно 1');
  assert.equal(f.flashes[0], 'нет свободных слотов инвентаря',
    'RED: flash — reason dry-run canAddItem: ' + JSON.stringify(f.flashes));
  assert.deepEqual(f.record.built[0].storage, st,
    'RED: all-or-nothing — storage НЕ тронут');
  assert.equal(f.getSaves(), 0, 'RED: all-or-nothing — saveNow 0');
});

// ============================================================
// S7. node: payload оверлея (layout/capacity/icon/rarity/meta)
//     + [E]-регресс (делегирование put-строк спец-у)
// ============================================================

test('000313-S7. node: payload «Хранилище» — title/actions бит-в-бит + ADDITIVE layout:"storage", capacity:{n,m}, icon/rarity/meta у строк (формат [I]); onAction put-0 — одна мутация: flash «Сложено: Соломенная шляпа ×1», storage live, reopen (новый payload); [E]-инлайн put-строка — делегирование спец-у (тот же flash)', () => {
  const S = loadStorageMod();
  assert.equal(typeof S.storageHandler, 'function',
    'RED: node-экспорт {storageHandler}');
  const t = initStorageFixture({
    x: 1, y: 1,
    cityContents: [{ x: 1, y: 1, buildingId: 55, player: true }],
  });
  wireCityAnchor(t, 100, -40);
  const cs = new Map([['100,-40', { lastVisitDay: 5, stock: {},
    built: [{ x: 1, y: 1, buildingId: 55, player: true,
      storage: [{ id: 'sulfur', qty: 5 }] }] }]]);
  t.deps.cityStates = cs;
  IT.addItem(t.hero, 'straw_hat', 1);
  IT.addItem(t.hero, 'wood_log', 3);
  const flashes = [];
  t.deps.flash = (m) => { flashes.push(m); };
  let saves = 0;
  t.deps.saveNow = () => { saves += 1; };
  t.BA.interactCity();
  assert.equal(t.o.calls.buildingOpen.length, 1, '[E] — меню 55');
  const menu = lastOverlay(t);
  assert.deepEqual(menu.actions.map((a) => a.id),
    ['storage', 'upgrade', 'put-0', 'put-1', 'take-0', 'demolish'],
    'RED: [E]-меню — строки хранилища (put/take) на месте: '
    + JSON.stringify(menu.actions.map((a) => a.id)));
  // (a) «Хранилище» → payload.
  menu.onAction({ id: 'storage' });
  assert.equal(saves, 0, 'pipeline — без saveNow');
  assert.equal(flashes.length, 0, 'pipeline — без flash');
  const ov = lastOverlay(t);
  assert.notEqual(ov, menu, 'оверлей — новый payload');
  assert.equal(ov.title, 'Хранилище', 'title бит-в-бит');
  assert.equal(ov.layout, 'storage',
    'RED: additive layout:"storage" в payload');
  assert.deepEqual(ov.capacity, { n: 1, m: 40 },
    'RED: additive capacity {n, m} (1 запись / 40): '
    + JSON.stringify(ov.capacity));
  assert.deepEqual(ov.actions.map((a) => a.id),
    ['put-0', 'put-1', 'take-0'], 'actions — ids бит-в-бит');
  assert.equal(ov.actions[0].имя, 'Сложить: Соломенная шляпа ×1',
    'имя строки бит-в-бит (000221)');
  assert.equal(ov.actions[1].имя, 'Сложить: Бревно ×3',
    'имя строки бит-в-бит (000221)');
  assert.equal(ov.actions[2].имя, 'Вынуть: Сера ×5',
    'имя строки бит-в-бит (000221)');
  const hat = IT.getItem('straw_hat');
  const log = IT.getItem('wood_log');
  const sul = IT.getItem('sulfur');
  assert.equal(ov.actions[0].icon, hat.icon,
    'RED: additive icon (путь каталога) у put-0');
  assert.equal(ov.actions[0].rarity, 'common',
    'RED: additive rarity у put-0 (straw_hat)');
  assert.equal(ov.actions[0].meta, '0.2 кг, 10 з',
    'RED: additive meta «X.X кг, Y з» (формат [I]) у put-0');
  assert.equal(ov.actions[1].icon, log.icon, 'additive icon у put-1');
  assert.equal(ov.actions[1].rarity, undefined,
    'у reagent rarity нет — поле отсутствует');
  assert.equal(ov.actions[1].meta, '6.0 кг, 3 з',
    'RED: meta Бревно ×3 — «6.0 кг, 3 з»');
  assert.equal(ov.actions[2].icon, sul.icon, 'additive icon у take-0');
  assert.equal(ov.actions[2].meta, '1.0 кг, 3 з',
    'RED: meta Сера ×5 — «1.0 кг, 3 з»');
  // (b) onAction put-0 (оверлей) — одна мутация + reopen.
  const pre = { saves, n: flashes.length };
  ov.onAction({ id: 'put-0' });
  assert.equal(saves, pre.saves + 1, 'успех — saveNow 1');
  assert.deepEqual(flashes.slice(pre.n),
    ['Сложено: Соломенная шляпа ×1'],
    'RED: flash переноса дословно: ' + JSON.stringify(flashes));
  const rec = cs.get('100,-40').built[0];
  assert.deepEqual(rec.storage, [{ id: 'sulfur', qty: 5 },
    { id: 'straw_hat', qty: 1 }], 'storage live (merge-порядок)');
  const ov2 = lastOverlay(t);
  assert.notEqual(ov2, ov, 'RED: reopen после переноса (новый payload)');
  assert.equal(ov2.capacity.n, 2, 'capacity обновлён (2/40)');
  // (c) [E]-инлайн put-строка — делегирование спец-у (тот же путь).
  t.o.buildingUI.close();
  t.BA.interactCity();
  const menu2 = lastOverlay(t);
  const inlinePut = menu2.actions.find((a) => a.id === 'put-0');
  assert.ok(inlinePut, '[E]-инлайн put-0 (Бревно)');
  const pre2 = { saves, n: flashes.length };
  menu2.onAction({ id: 'put-0' });
  assert.equal(saves, pre2.saves + 1,
    'RED: [E]-инлайн — saveNow 1 (спец обработал сам)');
  assert.deepEqual(flashes.slice(pre2.n), ['Сложено: Бревно ×3'],
    'RED: [E]-инлайн — тот же flash (ОДНА мутация)');
  assert.deepEqual(cs.get('100,-40').built[0].storage,
    [{ id: 'sulfur', qty: 5 }, { id: 'straw_hat', qty: 1 },
      { id: 'wood_log', qty: 3 }],
    'RED: [E]-инлайн — storage обновлён');
});

test('000313-S8. src/building-ui.js: построение строки — ОДИН общий makeItemRow в обеих ветках buildDom (ТЗ п.4 «переиспользовать, не дублировать»)', () => {
  const src = fs.readFileSync(
    path.join(ROOT, 'src/building-ui.js'), 'utf8');
  const count = (re) => (src.match(re) || []).length;
  assert.equal(count(/function makeItemRow/g), 1,
    'один общий конструктор строк; факт: '
    + count(/function makeItemRow/g));
  assert.ok(!src.includes('makeStorageRow'),
    'отдельный storage-строкодел отсутствует (дубль убран)');
  assert.equal(count(/setAttribute\('data-buid'/g), 1,
    'data-buid ставится в ОДНОМ месте; факт: '
    + count(/setAttribute\('data-buid'/g));
  assert.equal(count(/el\('span', 'cp-itemname'\)/g), 1,
    'cp-itemname строится в ОДНОМ месте; факт: '
    + count(/el\('span', 'cp-itemname'\)/g));
  assert.equal(count(/cp-itemrow cp-rarity-/g), 1,
    'rarity-класс строки — в ОДНОМ месте; факт: '
    + count(/cp-itemrow cp-rarity-/g));
  assert.equal(count(/addEventListener\('dragstart'/g), 1,
    'dragstart-слушатель вешается в ОДНОМ месте; факт: '
    + count(/addEventListener\('dragstart'/g));
  assert.ok(src.includes('makeItemRow(a, i, o, {})'),
    'дефолтная ветка buildDom — общий конструктор (opts {})');
  assert.ok(/makeItemRow\(a, i, o, \{[\s\S]*?draggable: true/.test(src),
    'storage-ветка buildDom — тот же конструктор (draggable)');
});

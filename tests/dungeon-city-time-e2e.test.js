// Задача 000214: «В подземельях и городах время должно тикать по такому
// же принципу как на глобальной карте». Контракт —
// memory/000214-dungeon-city-time-tick.md (решения D1-D10).
//
// Механика: ОДНИ часы на всю игру (G.createClock, src/main.js:399).
// Глобальная карта тикает clock.addStep(1) на каждый успешный шаг
// (main.js:3355, ДО maybeStartCombat). Шаги ВНУТРИ локаций идут другим
// каналом: dungeon-ui keydown / тач → ctx.onMove → main.js
// dungeonOnMove/cityOnMove → G.locations.dungeonMove/cityMove —
// clock в этот канал НЕ передаётся (отсюда «застывшее» время). Задача —
// провести clock.addStep(1) в ОБА канала (точка вставки — одна на
// канал, main.js; домен locations.js остаётся чистым — паттерн мира).
//
// КРАСНЫЕ тесты (TDD — функциональности ещё нет в src/main.js):
//   * T-1 dungeon: 3 успешных шага → stepsToday == 3, day == 1
//     (сейчас: 0/1 — тика в dungeonOnMove нет).
//   * T-2 dungeon: live perDay = 5; 6 шагов → day 2, stepsToday 1
//     (перенос избытка) + in-flight сейв {day: 2, steps: 1} +
//     flash «День 2.» (сейчас: 0 шагов — дня нет).
//   * T-3 город: 3 шага внутри → счётчик +3 ОТНОСИТЕЛЬНО снапшота
//     после входа (мировой подход уже тикал — а1 §9) (сейчас: +0 —
//     тика в cityOnMove нет).
//   * T-4 город: live perDay = 5; шаги внутри → day+1 + перенос
//     (сейчас: инвариантен).
//   * T-5 непрерывность режимов: сейв {day:1, steps:39} → boot →
//     enterDungeon → 1 шаг → день закрылся ВНУТРИ пещеры
//     (day 2, stepsToday 0) (сейчас: день 1, шаги 39 — шаг не тикает).
//   * T-6 combat-шаг тикает (D2, паритет с миром: addStep ДО боя):
//     группа на соседней FLOOR-клетке (паттерн dungeon-loot-e2e) →
//     шаг → бой активен И stepsToday +1 (сейчас: +0).
//   * T-7 (пин D1): 40 шагов в подземелье → день+1 (смена дня ВНУТРИ)
//     → [E]-выход → +1 ЕЩЁ (выход-день СОХРАНЯЕТСЯ: exitDungeon →
//     clock.event('dungeon')) — всего +2 (сейчас: +1 — шаги не тикают).
//   * T-10 in-flight сейв: 3 шага в подземелье → beforeunload →
//     data.steps == 3; 2-й boot → stepsToday == 3, day 1
//     (restore addStep — существующий механизм; сейчас: data.steps 0
//     — шагов в счётчик не было).
//
// ЗЕЛЁНЫЕ инварианты (проходят ДО и ПОСЛЕ — границы тика):
//   * T-8 (a) заблокированный шаг (стена) НЕ тикает (D3, паритет с
//     миром: тикает только успех tryMove); (b) [E]-переходы этажей
//     (descend/ascend) НЕ тикают (D4, пин WM-5: «Переходы не тратят
//     день» — clock на переходном пути нет, 000153.03).
//   * T-9 выход из города: ДЕНЬ инвариантен, stepsToday СОХРАНЕН
//     (не сброшен — пин D6: exitCity — no-op, clock.event НЕ
//     вызывается; SPEC buildings.md «явное решение»).
//
// РЕВЬЮ (раунд 1, после реализации):
//   * T-11 (ревью) шаг, закрывающий день, на клетке с сундуком:
//     флеш смены дня НЕ перекрывается строкой сундука (в мире
//     конкурентирующего step-флеша нет — паритет «по тому же
//     принципу», что и на глобальной карте).
//
// Harness — дубль конвенции (000083/000087): полный makeEl +
// WebGL-стаб из tests/dungeon-loot-e2e.test.js (bootSandbox/stepTo),
// городская часть (findCityFor/walkTiles/enterCity/resolveCombat) —
// из tests/city-inventory-e2e.test.js, live-мутация SETTINGS —
// паттерн MF182-D7 (tests/movement-freeze-e2e.test.js:1458-1487,
// restore в finally). vm: performance.now() ЗАМОРОЖЕН на NOW —
// keydown-канал шагов локации синхронен (1 нажатие = 1 шаг, кадры
// не нужны), flash «День N.» виден в HUD в том же кадре
// (flashUntil = NOW+5000 > NOW).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { SAVE_KEY } = require('../src/save.js');
const P = require('../src/player.js');

const ROOT = path.join(__dirname, '..');
const NOW = 1000; // performance.now() в песочнице заморожен

// --- Цепочка скриптов — из index.html (000214 — 0 новых тегов) ---
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));

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

// --- Canvas 2d-стаб (запись вызовов — sanity, что слой жив) ---

function makeContext2d(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

// --- «Снисходительный» DOM (полный: combat-ui создаёт СВОЙ canvas) ---

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
  if (cls &&
      !String(el.className || '').split(/\s+/).includes(cls)) {
    return false;
  }
  if (attr) {
    if (!attr[0].startsWith('data-')) return false;
    const v = el.dataset ? el.dataset[attr[0].slice(5)] : undefined;
    if (attr[1] !== undefined && v !== attr[1]) return false;
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
    // identity.
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
  // #game — WebGL (без него main.js уходит в фолбэк-ветку и не стартует).
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
  // Image-стаб: assets/map.png ВСЕГДА onerror (детерминированный
  // фолбэк G.generateSeedPixels), остальные — onload. Загрузка —
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
// restoreFromSave, requestAnimationFrame).
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
  // frame() main.js — единственный rAF-колбэк после старта (кадр
  // пере планирует себя — одна и та же функция).
  h.frameFn = h.raf[h.raf.length - 1];
  return h;
}

// --- Ввод ---
// ВАЖНО: массив слушателей снапшотится ПЕРЕД диспетчем (паттерн B9):
// слушатель, зарегистрированный ВО ВРЕМЯ диспетча, текущее событие
// НЕ видит (семантика браузерного DOM).
function key(h, code, extra = {}) {
  const e = Object.assign(
    { code, key: code, preventDefault() {}, stopPropagation() {} }, extra);
  for (const fn of (h.winListeners['keydown'] || []).slice()) fn(e);
  return e;
}

function keyup(h, code, extra = {}) {
  const e = Object.assign({ code, key: code }, extra);
  for (const fn of (h.winListeners['keyup'] || []).slice()) fn(e);
  return e;
}

function press(h, code) { return key(h, code); }
function release(h, code) { return keyup(h, code); }

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

// --- Ходьба по МИРУ (протокол city-screen/main-visuals) ---
// keydown(направление) → кадры frame(now) по +200 мс, пока игрок не
// перешёл (tryMove — в frame; базовый stepMs = 420 мс) → keyup.
// Каждый успешный мировой шаг тикает день (main.js:3355 — СУЩЕСТВУЮЩЕЕ
// поведение) и сейвится (main.js:3366) → подход к городу МОЖЕТ
// сменить день: ВСЕ городские ассерты — ОТНОСИТЕЛЬНЫЕ.
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
    // 000135: маршрут может пересечь 5×5-зону триггерящей группы —
    // авторазрешение zone-боя после КАЖДОГО шага.
    if (G.combatUI.isActive()) resolveCombat(G);
  }
  for (let i = 0; i < 4; i++) {
    now += 200;
    h.frameFn(now);
  }
  return now;
}

// --- BFS по миру до целевого тайла ---
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

// Город + layout/содержимое (чистые функции — те же входы, что в
// production). Возврат: {tile, steps, fp, layout, ...}.
function findCityFor(G, myMap, start, pred, radius = 700) {
  let info = null;
  const isCityTile = (t) => {
    if (!t.hasBuilding || t.building !== G.BUILDING_TYPES.NONE) return false;
    const rec = G.getBuilding(t.buildingId);
    if (!rec || rec.категория !== 'город') return false;
    const fp = rec.размер.ширина;
    const [ax, ay] = t.buildingAnchor;
    const layout = G.Cities.createCityLayout(ax, ay, fp);
    const i = { fp, rec, layout, ax, ay, wealth: t.buildingWealth, tile: t };
    if (pred(i) === true) info = i;
    return info !== null;
  };
  const r = findTile(G, myMap, start, isCityTile, radius);
  return r ? Object.assign({ tile: r.tile, steps: r.steps }, info) : null;
}

// Безопасный ОДИН шаг в МИРЕ от тайла входа (000177: выход → герой
// на входном тайле; повторный вход требует шага С тайла и обратно).
function safeWorldNeighbor(G, myMap, from) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of DIRS) {
    const t = myMap.tileAt(from.x + dx, from.y + dy);
    if (!t.passable || t.hasMobGroup || t.hasBuilding) continue;
    return [from.x + dx, from.y + dy];
  }
  return null;
}

// Вход в город (walkTiles + страховка bounded re-entry ≤3, 000135).
function enterCity(h, now, myMap, pred) {
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const found = findCityFor(G, myMap, g.state.player, pred);
  assert.ok(found, 'сценарий: город достижим пешком (BFS, мир детерминирован)');
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

// --- Время: счётчики и live-порог ---

// Ожидаемое (day, steps) после n шагов при пороге perDay — ровно
// семантика clock.addStep (day.js: steps += n; while (steps >= perDay)
// { steps -= perDay; advanceDay(); }).
function afterSteps(day, steps, perDay, n) {
  const total = steps + n;
  return { day: day + Math.floor(total / perDay), steps: total % perDay };
}

// Live-мутация SETTINGS.steps_per_day (000099: addStep читает на
// каждый вызов) — ОБЯЗАТЕЛЬНО restore в finally (MF182-D7).
function withPerDay(G, perDay, fn) {
  const orig = G.GlobalSettings.SETTINGS.steps_per_day;
  G.GlobalSettings.SETTINGS.steps_per_day = perDay;
  try {
    return fn();
  } finally {
    G.GlobalSettings.SETTINGS.steps_per_day = orig;
  }
}

function readSave(h) {
  const raw = h.storage.getItem(SAVE_KEY);
  assert.ok(raw, 'сейв в localStorage (' + SAVE_KEY + ')');
  return JSON.parse(raw);
}

// beforeunload → saveNow (main.js:863) — in-flight-снимок счётчика.
function fireBeforeUnload(h) {
  const a = h.winListeners['beforeunload'] || [];
  assert.ok(a.length >= 1, 'слушатель beforeunload зарегистрирован (main.js)');
  for (const fn of a.slice()) fn({});
}

// --- Подземелье: debug-вход и шаги (keydown, 1 нажатие = 1 шаг) ---

// Отладочный вход (g.actions.enterDungeon, 000068 — не требует
// пещеры): спавн на едином тайле входа-выхода (000177:
// d.entrance === d.exit). Контент — ПУСТОЙ (mobs/chests): wanderStep
// не знает safe-зону (dungeon.js:1044) — живой моб мог бы заблудиться
// на ping-pong-клетку и сломать сценарий боем; паттерн замены
// ds.contents — dungeon-loot-e2e (L445).
function enterDungeonClean(h) {
  const g = h.sandbox.__game;
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon — состояние подземелья (отладочный вход)');
  ds.contents = { mobs: [], chests: [], seed: 1, step: 0 };
  return ds;
}

// FLOOR-клетка-сосед ВХОДА в порядке [[1,0],[-1,0],[0,1],[0,-1]]
// (подземелье связное, у входа ВСЕГДА есть FLOOR-сосед; выход
// исключён — 000177: выход === вход, на нём герой спавнит).
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

// Один УСПЕШНЫЙ шаг героя в подземелье: keydown {code:'Arrow*'} →
// dungeon-ui (гейты isActive + !combatUI) → ctx.onMove → dungeonMove
// синхронно (1 клавиша = 1 клетка; кадры не нужны — NOW заморожен).
// Мир НЕ сдвигается: keydown main.js имеет гейт dungeonUI.isActive.
function dungeonStepTo(h, tx, ty) {
  const g = h.sandbox.__game;
  const dx = tx - g.dungeon.x, dy = ty - g.dungeon.y;
  assert.ok(Math.abs(dx) + Math.abs(dy) === 1,
    'шаг на соседнюю клетку (манхэттен = 1)');
  press(h, keydownFor(dx, dy));
  assert.equal(g.dungeon.x, tx, 'шаг прошёл: x (' + tx + ',' + ty + ')');
  assert.equal(g.dungeon.y, ty, 'шаг прошёл: y (' + tx + ',' + ty + ')');
}

// Заблокированный шаг (стена/граница): dungeonMove → null — позиция
// НЕ сдвигается (ассерт — инвариант T-8a).
function dungeonStepBlocked(h, dx, dy) {
  const g = h.sandbox.__game;
  const x0 = g.dungeon.x, y0 = g.dungeon.y;
  press(h, keydownFor(dx, dy));
  assert.equal(g.dungeon.x, x0, 'заблокированный шаг: x не сдвинулся');
  assert.equal(g.dungeon.y, y0, 'заблокированный шаг: y не сдвинулся');
}

// Ping-pong между входом (спавн) и клеткой A: n шагов детерминированно;
// после чётного n герой на входе (exit-тайл — для [E]-сценариев).
function dungeonPingPong(h, A, n) {
  const g = h.sandbox.__game;
  const S = { x: g.dungeon.entrance.x, y: g.dungeon.entrance.y };
  for (let i = 1; i <= n; i++) {
    dungeonStepTo(h, (i % 2 === 1 ? A : S).x, (i % 2 === 1 ? A : S).y);
  }
}

// BFS по клеткам ТЕКУЩЕГО этажа (FLOOR): путь из позиции героя в
// (tx,ty) + пошаговый проход. Детерминирован: фиксированный порядок
// DIRS + FIFO.
function dungeonWalk(h, tx, ty) {
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const d = g.dungeon;
  const W = d.width, H = d.height;
  const sx = d.x, sy = d.y;
  const startKey = sx + ',' + sy;
  const targetKey = tx + ',' + ty;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const visited = new Set([startKey]);
  const prev = new Map();
  const q = [[sx, sy]];
  let found = false;
  while (q.length && !found) {
    const [x, y] = q.shift();
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const k = nx + ',' + ny;
      if (visited.has(k)) continue;
      if (d.cells[ny * W + nx] !== G.CELL_FLOOR) continue;
      visited.add(k);
      prev.set(k, x + ',' + y);
      if (k === targetKey) { found = true; break; }
      q.push([nx, ny]);
    }
  }
  assert.ok(found,
    'сценарий: цель (' + tx + ',' + ty + ') достижима в этаже (BFS)');
  const steps = [];
  let kk = targetKey;
  while (kk !== startKey) {
    const [px, py] = kk.split(',').map(Number);
    steps.unshift([px, py]);
    kk = prev.get(kk);
  }
  for (const [cx, cy] of steps) dungeonStepTo(h, cx, cy);
  return steps.length;
}

// FLOOR-клетка с WALL/границей-соседом (для T-8a: заблокированный
// шаг). BFS от входа, первый такой — детерминированно. Возврат
// {x, y, dx, dy} (dx,dy — направление в стену/границу).
function findWallCell(h) {
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const d = g.dungeon;
  const W = d.width, H = d.height;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const isWall = (x, y, dx, dy) => {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) return true;
    return d.cells[ny * W + nx] !== G.CELL_FLOOR;
  };
  const sx = d.entrance.x, sy = d.entrance.y;
  const startKey = sx + ',' + sy;
  const visited = new Set([startKey]);
  const q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of DIRS) {
      if (isWall(x, y, dx, dy)) return { x, y, dx, dy };
      const nx = x + dx, ny = y + dy;
      const k = nx + ',' + ny;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (visited.has(k)) continue;
      if (d.cells[ny * W + nx] !== G.CELL_FLOOR) continue;
      visited.add(k);
      q.push([nx, ny]);
    }
  }
  assert.fail('сценарий: клетка со стеной-соседом не найдена (лабиринт замкнулся?)');
}

// --- Город: шаги внутри (та же клавиатурная проводка) ---

// FLOOR-клетка-сосед ДВЕРИ города (периметр — WALL, внутренность —
// FLOOR, 000104; постройки НЕ мутируют cells → клетки построек
// проходимы). Дверь на южном периметре → северный сосед ВСЕГДА
// внутренность (fp ≥ 2).
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

// =====================================================================
// T-1 (RED): dungeon — каждый успешный шаг тикает общий счётчик
// =====================================================================

test('000214 T-1 (RED): dungeon: 3 шага внутри → stepsToday == 3, day == 1 (общий счётчик с картой)', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const day0 = g.state.day;
  assert.equal(g.state.stepsToday, 0, 'свежий старт: 0 шагов в дне');
  const ds = enterDungeonClean(h);
  const A = asideDir(G, ds.dg);
  assert.ok(A, 'FLOOR-клетка-сосед входа найдена');
  dungeonPingPong(h, A, 3); // вход → A → вход → A
  // 3 < 40 (steps_per_day) → день не сменяется, счётчик +3.
  assert.equal(g.state.day, day0, 'день 1 не сменён (3 < 40)');
  assert.equal(g.state.stepsToday, 3,
    'RED: шаги подземелья в общий счётчик (сейчас 0 — тика нет)');
});

// =====================================================================
// T-2 (RED): dungeon — порог дня + перенос + onDay (flash + сейв)
// =====================================================================

test('000214 T-2 (RED): dungeon: live perDay=5; 6 шагов → day 2, stepsToday 1; сейв {2, 1}; flash «День 2.»', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const ds = enterDungeonClean(h);
  const A = asideDir(G, ds.dg);
  assert.ok(A, 'FLOOR-клетка-сосед входа найдена');
  withPerDay(G, 5, () => {
    dungeonPingPong(h, A, 6); // 5-й шаг закрывает день (перенос: 6-й — 1)
    assert.equal(g.state.day, 2,
      'RED: смена дня ВНУТРИ подземелья (перенос избытка, day.js)');
    assert.equal(g.state.stepsToday, 1,
      'RED: перенос избытка — 6-й шаг = 1 шаг нового дня');
    // In-flight-снимок (beforeunload → saveNow): счётчик в СЕЙВЕ.
    fireBeforeUnload(h);
    const saved = readSave(h);
    assert.equal(saved.data.day, 2, 'RED: сейв — день 2 (onDay/шаги)');
    assert.equal(saved.data.steps, 1, 'RED: сейв — 1 шаг нового дня');
    // onDay-цепь: flash «День 2.» (отряд ПУСТ, респаунов нет —
    // строка ровно «День 2.»); NOW заморожен → flashUntil > NOW.
    h.frameFn(NOW + 500);
    const hud = String(h.hud.textContent);
    assert.ok(hud.includes('День 2.'),
      'RED: flash «День 2.» в HUD после смены дня внутри: ' + hud);
    assert.ok(hud.includes('День: 2'),
      'строка HUD «День: 2» (счётчик виден внутри локации)');
  });
});

// =====================================================================
// T-3 (RED): город — шаги внутри тикают счётчик (относительно)
// =====================================================================

test('000214 T-3 (RED): город: 3 шага внутри → счётчик +3 относительно снапшота после входа', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const { found } = await enterCity(h, NOW, myMap, (c) => c.fp >= 2);
  const A = cityAside(G, found.layout);
  assert.ok(A, 'FLOOR-клетка-сосед двери найдена');
  // Мировой подход УЖЕ тикал (main.js:3355) — снапшот ПОСЛЕ входа,
  // ассерты относительные (прецедент city-screen L550-596).
  const snap = { day: g.state.day, steps: g.state.stepsToday };
  const door = found.layout.entrance;
  cityStepTo(h, A.x, A.y);          // 1: дверь → внутренность
  cityStepTo(h, door.x, door.y);    // 2: обратно на дверь
  cityStepTo(h, A.x, A.y);          // 3
  const exp = afterSteps(snap.day, snap.steps, 40, 3);
  assert.equal(g.state.day, exp.day,
    'RED: городские шаги тикают день (сейчас: день инвариантен)');
  assert.equal(g.state.stepsToday, exp.steps,
    'RED: городские шаги в общий счётчик (сейчас: +0)');
});

// =====================================================================
// T-4 (RED): город — порог дня + перенос (live perDay)
// =====================================================================

test('000214 T-4 (RED): город: live perDay=5; 6 шагов внутри → day+1, перенос избытка', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const { found } = await enterCity(h, NOW, myMap, (c) => c.fp >= 2);
  const A = cityAside(G, found.layout);
  assert.ok(A, 'FLOOR-клетка-сосед двери найдена');
  const snap = { day: g.state.day, steps: g.state.stepsToday };
  const door = found.layout.entrance;
  withPerDay(G, 5, () => {
    for (let i = 1; i <= 6; i++) {
      cityStepTo(h, (i % 2 === 1 ? A : door).x, (i % 2 === 1 ? A : door).y);
    }
    const exp = afterSteps(snap.day, snap.steps, 5, 6);
    assert.ok(exp.day > snap.day, 'сценарий: порог 5 за 6 шагов пройден');
    assert.equal(g.state.day, exp.day,
      'RED: смена дня ВНУТРИ города (live steps_per_day, 000099)');
    assert.equal(g.state.stepsToday, exp.steps,
      'RED: перенос избытка городских шагов');
  });
});

// =====================================================================
// T-5 (RED): непрерывность счётчика между миром и подземельем
// =====================================================================

test('000214 T-5 (RED): сейв {day:1, steps:39} → enterDungeon → 1 шаг → день закрылся ВНУТРИ пещеры (day 2, stepsToday 0)', async () => {
  const h = await boot(seedSave({ day: 1, steps: 39, hero: P.createCharacter() }));
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  // Существующий restore (main.js:920-922: addStep(d.steps)):
  assert.equal(g.state.day, 1, 'restore: день 1');
  assert.equal(g.state.stepsToday, 39, 'restore: 39 шагов дня');
  const ds = enterDungeonClean(h);
  const A = asideDir(G, ds.dg);
  assert.ok(A, 'FLOOR-клетка-сосед входа найдена');
  dungeonStepTo(h, A.x, A.y); // 40-й шаг дня — ВНУТРИ подземелья
  assert.equal(g.state.day, 2,
    'RED: день закрылся ВНУТРИ пещеры (общий счётчик режим-независим)');
  assert.equal(g.state.stepsToday, 0,
    'RED: перенос — 0 шагов нового дня');
});

// =====================================================================
// T-6 (RED): combat-шаг тикает (D2: паритет с миром — addStep ДО боя)
// =====================================================================

test('000214 T-6 (RED): dungeon: шаг, ЗАПУСКАЮЩИЙ бой, СЧИТАЕТСЯ (бой активен И stepsToday +1)', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon — состояние подземелья (отладочный вход)');
  const A = asideDir(G, ds.dg);
  assert.ok(A, 'FLOOR-клетка-сосед входа найдена');
  // Группа на клетке-соседе входа (паттерн dungeon-loot-e2e: замена
  // ds.contents после входа; мобов в safe-зоне НЕТ по генерации —
  // клетка A свободна, бой ТОЛЬКО от нашего шага).
  ds.contents = {
    mobs: [{ id: 'g0', mobIds: ['skeleton'], x: A.x, y: A.y, level: 1, defeated: false }],
    chests: [],
    seed: 1, step: 0,
  };
  const snap = { day: g.state.day, steps: g.state.stepsToday };
  dungeonStepTo(h, A.x, A.y); // шаг на группу → {type:'combat'}
  assert.equal(G.combatUI.isActive(), true,
    'бой начался (dungeonOnMove → startDungeonCombat)');
  assert.equal(g.state.day, snap.day, 'день не сменён (1 шаг < 40)');
  assert.equal(g.state.stepsToday, snap.steps + 1,
    'RED: combat-шаг тикает (D2: addStep ДО combat-ветки — как мир)');
});

// =====================================================================
// T-7 (RED, пин D1): тик шагов + выход-день — ко-существование
// =====================================================================

test('000214 T-7 (RED, пин D1): 40 шагов в подземелье (день+1) → [E]-выход → +1 ещё (всего +2, не +1 и не +3)', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const day0 = g.state.day;
  const ds = enterDungeonClean(h);
  const A = asideDir(G, ds.dg);
  assert.ok(A, 'FLOOR-клетка-сосед входа найдена');
  dungeonPingPong(h, A, 40); // 40 < 40? нет: 40-й шаг закрывает день
  assert.equal(g.state.day, day0 + 1,
    'RED: смена дня от 40 шагов ВНУТРИ подземелья (сейчас: день 1)');
  assert.equal(g.state.stepsToday, 0, 'перенос: 0 шагов нового дня');
  // Герой на чётном шаге = на входном (= выходном, 000177) тайле →
  // [E] → exitLocation → exitDungeon → clock.event('dungeon') (D1:
  // выход-день СОХРАНЯЕТСЯ — locations.js НЕ правится).
  press(h, 'KeyE');
  assert.equal(g.dungeon, null, 'выход: локация закрыта');
  assert.equal(g.state.day, day0 + 2,
    'RED: тик + выход-день ко-существуют: +2 (не +1: шаги тикают; '
    + 'не +3: выход — ровно день)');
  assert.equal(g.state.stepsToday, 0, 'event сбрасывает счётчик (steps = 0)');
});

// =====================================================================
// T-8 (зелёный инвариант): границы тика — стена и переходы этажей
// =====================================================================

test('000214 T-8 (инвариант): шаг на стену НЕ тикает; [E]-переходы этажей (descend/ascend) НЕ тикают (день И шаги инвариантны)', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const ds = enterDungeonClean(h);
  const d0 = ds.dg;
  assert.ok(d0.stairsDown,
    'сценарий: в этаже есть stairs-down (поле формы, 000153.02)');
  // (a) Заблокированный шаг: клетка со стеной-соседом.
  const wc = findWallCell(h);
  dungeonWalk(h, wc.x, wc.y);
  const snapA = { day: g.state.day, steps: g.state.stepsToday };
  dungeonStepBlocked(h, wc.dx, wc.dy); // стена: dungeonMove → null
  assert.equal(g.state.day, snapA.day,
    'заблокированный шаг: день инвариантен (D3: тикает только успех)');
  assert.equal(g.state.stepsToday, snapA.steps,
    'заблокированный шаг: счётчик инвариантен (D3)');
  // (b) Переходы этажей: [E] на stairs-down → descend; [E] на
  // exit тайле depth>1 → ascend. clock на переходном пути НЕТ
  // (transitionFloor, 000153.03) — пин WM-5 «Переходы не тратят день».
  dungeonWalk(h, d0.stairsDown.x, d0.stairsDown.y);
  const snapB = { day: g.state.day, steps: g.state.stepsToday };
  press(h, 'KeyE'); // descend
  assert.ok(g.dungeon, 'после descend: в локации');
  assert.equal(g.dungeon.depth, 2, 'descend: глубина 2');
  assert.equal(g.state.day, snapB.day,
    'descend: день инвариантен (D4: переход не тратит день)');
  assert.equal(g.state.stepsToday, snapB.steps,
    'descend: счётчик шагов инвариантен (D4)');
  // Новый этаж: спавн на входном (= выходном) тайле depth 2 →
  // [E] → ascend на depth−1.
  press(h, 'KeyE'); // ascend
  assert.ok(g.dungeon, 'после ascend: в локации');
  assert.equal(g.dungeon.depth, 1, 'ascend: глубина 1');
  assert.equal(g.state.day, snapB.day,
    'ascend: день инвариантен (D4)');
  assert.equal(g.state.stepsToday, snapB.steps,
    'ascend: счётчик шагов инвариантен (D4)');
});

// =====================================================================
// T-9 (зелёный инвариант): выход из города — без дня, счётчик цел
// =====================================================================

test('000214 T-9 (инвариант, пин D6): выход из города: день инвариантен, stepsToday СОХРАНЕН (event нет, сброса нет)', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const { found } = await enterCity(h, NOW, myMap, (c) => c.fp >= 2);
  const A = cityAside(G, found.layout);
  assert.ok(A, 'FLOOR-клетка-сосед двери найдена');
  const door = found.layout.entrance;
  cityStepTo(h, A.x, A.y);   // 1
  cityStepTo(h, door.x, door.y); // 2: герой на двери (exit)
  const snap = { day: g.state.day, steps: g.state.stepsToday };
  press(h, 'KeyE'); // выход: exitCity — no-op (locations.js:753)
  assert.equal(g.dungeon, null, 'выход: локация закрыта');
  assert.equal(g.state.day, snap.day,
    'D6: выход из города — ДЕНЬ не проходит (event НЕ вызывается)');
  assert.equal(g.state.stepsToday, snap.steps,
    'D6: stepsToday СОХРАНЕН (сброса при выходе нет)');
});

// =====================================================================
// T-11 (ревью): шаг, закрывающий день, на клетке с сундуком —
// флеш смены дня не теряется под строкой сундука (в мире
// конкурентирующего step-флеша нет — паритет «по тому же принципу»)
// =====================================================================

test('000214 T-11 (ревью): 40-й шаг (закрывая день) на клетке с сундуком — в HUD и «День 2.», и «Сундук: +37 золота» (флеш дня не перекрывается)', async () => {
  const h = await boot(seedSave({ day: 1, steps: 39, hero: P.createCharacter() }));
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon — состояние подземелья (отладочный вход)');
  const A = asideDir(G, ds.dg);
  assert.ok(A, 'FLOOR-клетка-сосед входа найдена');
  ds.contents = {
    mobs: [],
    chests: [{ id: 'c1', x: A.x, y: A.y, opened: false, gold: 37 }],
    seed: 1, step: 0,
  };
  assert.equal(g.state.day, 1, 'restore: день 1');
  assert.equal(g.state.stepsToday, 39, 'restore: 39 шагов (40-й закроет день)');
  const gold0 = g.state.hero.gold;
  dungeonStepTo(h, A.x, A.y); // 40-й шаг: сундук И смена дня в одном шаге
  assert.equal(g.state.day, 2, 'день 2 (40-й шаг закрыл день ВНУТРИ пещеры)');
  assert.equal(g.state.stepsToday, 0, 'перенос: 0 шагов нового дня');
  assert.equal(g.state.hero.gold, gold0 + 37, 'сундук открыт: +37 золота');
  h.frameFn(NOW + 500);
  const hud = String(h.hud.textContent);
  assert.ok(hud.includes('Сундук: +37 золота'),
    'строка сундука в HUD: ' + hud);
  assert.ok(hud.includes('День 2.'),
    'ревью: флеш смены дня НЕ перекрывается строкой сундука: ' + hud);
});

// =====================================================================
// T-10 (RED): in-flight сейв подземелья + restore на 2-м boot
// =====================================================================

test('000214 T-10 (RED): 3 шага в подземелье → beforeunload → data.steps == 3; 2-й boot → stepsToday == 3, day 1 (restore addStep)', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const ds = enterDungeonClean(h);
  const A = asideDir(G, ds.dg);
  assert.ok(A, 'FLOOR-клетка-сосед входа найдена');
  dungeonPingPong(h, A, 3);
  assert.equal(g.state.day, 1, 'день 1 (3 < 40)');
  assert.equal(g.state.stepsToday, 3, '3 шага в дне');
  fireBeforeUnload(h); // saveNow (main.js:863) — in-flight-снимок
  const saved = readSave(h);
  assert.equal(saved.data.day, 1, 'сейв: день 1');
  assert.equal(saved.data.steps, 3,
    'RED: шаги подземелья в СЕЙВЕ (сейчас 0 — тика не было)');
  // 2-й boot из ЭТОГО сейва: dungeonState не сериализуется → старт
  // в МИРЕ; restore (main.js:920-922) восстанавливает шаги дня.
  const h2 = await boot(saved);
  const g2 = h2.sandbox.__game;
  assert.equal(g2.state.day, 1, '2-й boot: день 1');
  assert.equal(g2.state.stepsToday, 3,
    'RED: 2-й boot: 3 шага восстановлены (restore addStep)');
});

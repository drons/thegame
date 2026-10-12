// Задача 000177: совмещение тайла входа/выхода в один (TDD-красные).
//
// ТЗ: tasks/pending/000177.md — в подземельях и городах тайл входа и
// выхода совмещён в ОДИН: персонаж входит НА этот тайл (город — дверь,
// подземелье — лестница/вход в пещеру), выход обратно — ВСТАТЬ на тайл
// и нажать [E]. «Между уровнями подземелий аналогично» — уровней
// (этажей) в игре НЕТ (одна карта, dungeon.js); механизм уровне-
// независим — один и тот же L.interactExit и единый тайл для любого
// layout (PE-3a доказывает на двух разных реальных layout'ах). Тайл
// рисуется как дверь/лестница/пещера — пин типа (путь спрайта) и
// позиции (проекция единой клетки).
//
// Контракт: memory/000177-portal-exit-tile.md (D1–D5) и
// memory/000177-enter-exit-tile.md. Карта тестов: a3 §3.
//
// Все 9 тестов КРАСНЫЕ на master (7e9a494) ОСМЫСЛЕННО (отсутствующий
// символ/файл/поведение, не синтаксис):
//   PE-1/PE-2: dg.exit ≠ dg.entrance (createCityLayout — второй col(),
//     y=0; createDungeon — rooms[last]) → deepEqual падает первым;
//     [E] — не выход (город: interactCity, подземелье: no-op 000121);
//   PE-3a: L.interactExit не существует (новый экспорт, D2) + layout
//     не единый → deepEqual;
//   PE-3b: [E] в подземелье = no-op (000121) → g.dungeon !== null
//     (1-я часть — шаг в сторону + [E] ничего — зелёная на master:
//     закрепляет СОХРАНЁННОЕ свойство);
//   PE-4a/4b: нет assets/dungeon/{door,cave_mouth}.svg, нет
//     sprites.DUNGEON_PORTAL → маркера-спрайта нет; зелёный
//     #3f9d55 маркер входа есть;
//   PE-4c: маркер «X» (нет фолбэка с «E»);
//   PE-4d: 3 SVG-файла не существуют, DUNGEON_PORTAL undefined;
//   PE-5: [E] в подземелье = no-op → g.dungeon !== null (finally-
//     инвариант 000170 для нового пути [E] — тест его закрывает;
//     сам invariant на master покрыт T5 для шага-выхода).
// Выход по [E] ОБЯЗАН идти через exitLocation (КОНТРАКТ 000170:
// try/catch + finally { dungeonState=null; G.dungeonUI.close();
// saveNow() }) — PE-5 пинит его для нового пути.
//
// Песочница: ВЕСЬ <script>-цепочка index.html (паттерн
// tests/city-screen.test.js: Proxy-DOM/WebGL/Image-стабы,
// детерминированный мир — assets/map.png всегда onerror →
// G.generateSeedPixels; drawCalls — у динамического canvas оверлея).
// Единственная синхронная перерисовка оверлея — в dungeonUI.start()
// (rAF-tick dungeon-ui тестами не вызывается — кадр main.js отдельный
// rAF-колбэк, frameFn).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

// Цепочка скриптов — из index.html (не хардкод).
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));

// Окно «браузера» песочницы (viewW/viewH dungeon-ui читают window).
const VIEW_W = 1280;
const VIEW_H = 720;
// Фиксированное время performance.now (анимации детерминированы).
const NOW = 1000;

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

// --- Canvas 2D-стаб: каждый ВЫЗОВ метода → el.drawCalls как
// [имя, args, fillStyle] (fillStyle на момент вызова) ---

function makeContext2d(el) {
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

// --- Снисходительный DOM-элемент (canvas — с 2d-контексом) ---

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
    target.width = 0;
    target.height = 0;
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

// --- localStorage-стаб (наблюдение saveNow) ---

function makeStorage() {
  const store = {};
  return {
    store,
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k)
      ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
}

// --- Песочница: вся цепочка index.html (браузерная ветка UMD) ---
// opts.failImages — Set путей, для которых Image-стаб fire'ит onerror
// (PE-4c: spriteLoader-состояние 'failed' → image() null → фолбэк).

function bootSandbox(opts) {
  const failImages = (opts && opts.failImages) || null;
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
  const storage = makeStorage();
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
    addEventListener: (t, f) => {
      (winListeners[t] || (winListeners[t] = [])).push(f);
    },
    removeEventListener() {},
  };
  // Image-стаб (паттерн main-visuals): src ставится ПОСЛЕ
  // onload/onerror. assets/map.png ВСЕГДА onerror → детерминированный
  // фолбэк G.generateSeedPixels; failImages — onerror (PE-4c);
  // остальные — onload.
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
          if (v === 'assets/map.png'
              || (failImages && failImages.has(v))) {
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
  };
  vm.createContext(sandbox);
  for (const f of CHAIN) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox,
      { filename: f });
  }
  return {
    sandbox, winListeners, raf, errors, storage,
    gameCanvas, spriteCanvas, hud,
  };
}

// Промывка микротасков (Image + loadMapPixels().then: карта, спавн,
// requestAnimationFrame(frame)).
const drain = () => new Promise((r) => setImmediate(r));

async function boot(opts) {
  const h = bootSandbox(opts);
  await drain();
  await drain();
  await drain();
  const g = h.sandbox.__game;
  assert.ok(g, 'globalThis.__game выставлен (main.js выполнен)');
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет (порядок цепочки): ' + h.errors.join('; '));
  // frame() main.js — последний rAF-колбэк на момент старта; frame
  // пере планирует себя (одна и та же функция) — frameFn валидна
  // постоянно. (rAF-tick dungeon-ui вызывается ТОЛЬКО через свой
  // колбэк — тестами не вызывается: оверлей рисует start() + keydown.)
  h.frameFn = h.raf[h.raf.length - 1];
  return h;
}

// --- Ввод: диспетч по захваченным window-слушателям ---

function keydownFor(dx, dy) {
  return dx === 1 ? 'ArrowRight' : dx === -1 ? 'ArrowLeft'
    : dy === 1 ? 'ArrowDown' : 'ArrowUp';
}

function press(h, code) {
  const e = {
    code, key: code,
    prevented: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() {},
  };
  for (const fn of (h.winListeners['keydown'] || []).slice()) fn(e);
  return e;
}

function release(h, e) {
  for (const fn of (h.winListeners['keyup'] || []).slice()) fn(e);
}

// --- Ходьба по миру (паттерн walkTiles, tests/city-screen.test.js) ---
// Каждый шаг — keydown(направление) → кадры frame(now) по +200 мс,
// пока игрок не перешёл (tryMove в frame, не более ОДНОГО хода за
// кадр) → keyup. 000135: zone-бой по маршруту — авторазрешение.

function walkTiles(h, now, tiles) {
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  for (const [tx, ty] of tiles) {
    const dx = tx - g.state.player.x, dy = ty - g.state.player.y;
    assert.ok(Math.abs(dx) + Math.abs(dy) === 1, 'BFS: шаг по соседнему тайлу');
    const e = press(h, keydownFor(dx, dy));
    let guard = 0;
    do {
      now += 200;
      h.frameFn(now);
    } while ((g.state.player.x !== tx || g.state.player.y !== ty)
      && ++guard < 10);
    release(h, e);
    assert.equal(g.state.player.x, tx,
      'сценарий: игрок перешёл на (' + tx + ', ' + ty + ') — x');
    assert.equal(g.state.player.y, ty,
      'сценарий: игрок перешёл на (' + tx + ', ' + ty + ') — y');
    if (G.combatUI.isActive()) {
      const c = G.combatUI.current();
      for (const m of c.units.filter((x) => x.side === 'mob'
          && x.alive)) {
        G.combatInternals.dealDamageToMob(c, m, 9999);
      }
      assert.ok(c.result && c.result.outcome === 'victory',
        '000135: zone-бой по маршруту — победа');
      G.combatUI.handleCode('Space');
      assert.equal(G.combatUI.isActive(), false,
        '000135: zone-бой закрыт (Space → finish)');
    }
  }
  // Осадочные кадры (глейд мувера и сглаживание камеры завершаются).
  for (let i = 0; i < 4; i++) {
    now += 200;
    h.frameFn(now);
  }
  return now;
}

// --- Поиск целей (паттерн findNearest, tests/city-screen.test.js) ---

function findNearest(G, myMap, start, isTarget, radius = 600) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const startKey = start.x + ',' + start.y;
  const visited = new Set([startKey]);
  let frontier = [start];
  const prev = new Map();
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
          return { target: { x: nx, y: ny }, t, steps, depth };
        }
        // 000073: город — по building = NONE; слотовые входы — не
        // авто-вход, путь может через них идти.
        if (t.hasBuilding
            && (t.building === G.BUILDING_TYPES.CAVE_ENTRANCE
                || t.building === G.BUILDING_TYPES.NONE)) continue;
        next.push({ x: nx, y: ny });
      }
    }
    frontier = next;
  }
  return null;
}

// Город: hasBuilding && buildingId != null && категория «город».
function isCity(G, t) {
  if (!t.hasBuilding || t.buildingId == null) return false;
  const rec = G.getBuilding(t.buildingId);
  return !!rec && rec.категория === 'город';
}

// Пещера (НЕ развалины buildingId 48 — постройка, не вход: 000073).
function isCave(G, t) {
  return t.hasBuilding
    && t.building === G.BUILDING_TYPES.CAVE_ENTRANCE
    && t.buildingId !== 48;
}

// Проходной сосед от позиции (контроль «движение мира живо», T5).
function passableDir(G, myMap, x, y) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of DIRS) {
    const t = myMap.tileAt(x + dx, y + dy);
    if (t && t.passable && !t.hasMobGroup) return [dx, dy];
  }
  return null;
}

// Держим клавишу до первого шага (≤12 кадров) или до guard; keyup в
// конце. Возвращает { moved, now } (паттерн movement-freeze T5).
function holdUntilStep(h, code, now) {
  const g = h.sandbox.__game;
  const x0 = g.state.player.x, y0 = g.state.player.y;
  press(h, code);
  for (let i = 0; i < 12; i++) {
    now += 200;
    let err = null;
    try {
      h.frameFn(now);
    } catch (e) {
      err = e;
    }
    assert.equal(err, null, 'кадр мира после выхода не падает');
    if (g.state.player.x !== x0 || g.state.player.y !== y0) break;
  }
  release(h, { code, key: code, preventDefault() {}, stopPropagation() {} });
  return {
    moved: g.state.player.x !== x0 || g.state.player.y !== y0,
    now,
  };
}

// --- Оверлей dungeon-ui и точная проекция клетки ---

// Оверлей — .combat-overlay.dungeon-overlay на document.body,
// canvas — ПЕРВЫЙ ребёнок (build(): canvas, потом side-панель).
function findDungeonOverlay(h) {
  const body = h.sandbox.document.body;
  for (const ch of body.children || []) {
    if (String(ch.className).includes('dungeon-overlay')) return ch;
  }
  assert.fail('оверлей dungeon-ui (.dungeon-overlay) не найден на body');
  return null;
}

// Реплика clampCam из src/dungeon-ui.js (не экспортируется): камера
// start() снапится к клетке героя + кламп; при coverage — центрирование.
function clampCam(camPos, extent, viewPx, z) {
  if (extent * z <= viewPx) return extent / 2;
  const lo = viewPx / 2 / z, hi = extent - viewPx / 2 / z;
  return Math.min(hi, Math.max(lo, camPos));
}

// Камера входа (снап к spawn-клетке — герой входит на едином тайле,
// dg.x/dg.y) + ТОЧНАЯ проекция dg.exit (== dg.entrance) в пикселях
// оверлея: proj = worldToScreen(cell, cam, zoom, 1280, 720) — та же
// математика, что render() dungeon-ui (proj L419). zoom — мировой
// (startLocationUI передаёт opts.zoom = ZOOM_START; колесо не тикало).
function overlayMarkerPoint(h, dg) {
  const G = h.sandbox.Game;
  const zoom = G.ZOOM_START;
  const camX = clampCam(dg.x + 0.5, dg.width, VIEW_W, zoom);
  const camY = clampCam(dg.y + 0.5, dg.height, VIEW_H, zoom);
  const p = G.worldToScreen(dg.exit.x, dg.exit.y, camX, camY,
    zoom, VIEW_W, VIEW_H);
  const overlay = findDungeonOverlay(h);
  const canvas = overlay.children[0];
  assert.ok(canvas && Array.isArray(canvas.drawCalls),
    'canvas оверлея с drawCalls');
  return { p, zoom, canvas, camX, camY };
}

// ============================================================
// PE-1 / PE-2: вхождение на единый тайл + [E] → назад
// ============================================================

test('PE-1: город: вхождение на единый тайл + [E] → назад; день НЕ проходит; saveNow; герой на тайле города', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  // Многотайловый город (дверь + внутренность; паттерн 000105).
  const found = findNearest(G, myMap, g.state.player,
    (t) => isCity(G, t)
      && G.getBuilding(t.buildingId).размер.ширина >= 2);
  assert.ok(found, 'сценарий: достижимый многотайловый город');
  walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg, 'после шага на тайл города — dungeonState');
  assert.equal(dg.kind, 'city', 'dungeonState.kind === «city»');
  // Единый тайл (000177 D1): exit deepEqual entrance, и герой на нём
  // (spawn — дверь; prevX/prevY — туда же, без призрачного глеяда).
  assert.deepEqual({ x: dg.exit.x, y: dg.exit.y },
    { x: dg.entrance.x, y: dg.entrance.y },
    'единый тайл: dg.exit deepEqual dg.entrance (дверь)');
  assert.deepEqual({ x: dg.x, y: dg.y },
    { x: dg.entrance.x, y: dg.entrance.y },
    'при входе герой НА едином тайле (дверь)');
  assert.deepEqual({ x: dg.prevX, y: dg.prevY },
    { x: dg.entrance.x, y: dg.entrance.y },
    'prevX/prevY — на тайле');
  // Мировых шагов ПОСЛЕ входа нет: день/шаги заморожены (город выходом
  // дня не тратит, 000105).
  const day0 = g.state.day;
  const steps0 = g.state.stepsToday;
  // Входной мировой шаг уже записал сейв — УДАЛЯЕМ: если запись
  // появится после [E] — это saveNow из exitLocation (finally, 000170).
  delete h.storage.store['phlogiston.save'];
  const e = press(h, 'KeyE');
  release(h, e);
  assert.equal(g.dungeon, null,
    '[E] на двери — ВЫХОД (состояние снято; на master: [E] в городе = '
    + 'interactCity — постройки, выход не случается)');
  assert.equal(G.dungeonUI.isActive(), false, 'dungeonUI закрыт');
  // Двойной фаер [E] (dungeon-ui → locationOnInteract; window-
  // слушатель main.js → toggle() — после выхода dungeonUI уже
  // закрыт, гард не гасит): на МИРОВОМ тайле города buildingUI/
  // npcUI НЕ открываются (у тайла нет действий — openBuildingUI
  // no-op). Пин текущего безопасного поведения (риск будущего —
  // memory/000177-portal-exit-tile.md §2.3: задача, добавляющая
  // действия на мировой тайл города, откроет popup после [E]).
  assert.equal(G.buildingUI.isActive(), false,
    'двойной фаер [E]: buildingUI не открыт на тайле города');
  assert.equal(G.npcUI.isActive(), false,
    'двойной фаер [E]: npcUI не открыт на тайле города');
  assert.deepEqual({ x: g.state.player.x, y: g.state.player.y },
    found.target, 'герой — на мировом тайле города (выходом не сдвигается)');
  assert.equal(g.state.day, day0,
    'выход из города ДЕНЬ НЕ проходит (000105)');
  assert.equal(g.state.stepsToday, steps0,
    'мировых шагов между входом и выходом нет');
  const saveText = h.storage.store['phlogiston.save'];
  assert.ok(saveText,
    'saveNow (exitLocation finally): сейв, удалённый после входа, '
    + 'появился после [E]-выхода');
  const save = JSON.parse(saveText);
  assert.deepEqual(save.data.position,
    { x: found.target.x, y: found.target.y },
    'сейв: позиция — мировой тайл города');
  assert.equal(save.data.day, day0, 'сейв: день — текущий (не прошёл)');
});

test('PE-2: подземелье: вхождение на единый тайл + [E] → назад; ДЕНЬ+1; герой на тайле пещеры', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findNearest(G, myMap, g.state.player, (t) => isCave(G, t));
  assert.ok(found, 'сценарий: пещера достижима пешком от спавна');
  walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg, 'после шага на тайл пещеры — dungeonState');
  assert.equal(dg.kind, 'dungeon', 'dungeonState.kind === «dungeon»');
  // Единый тайл (000177 D1): exit deepEqual entrance (центр rooms[0]),
  // герой на нём.
  assert.deepEqual({ x: dg.exit.x, y: dg.exit.y },
    { x: dg.entrance.x, y: dg.entrance.y },
    'единый тайл: dg.exit deepEqual dg.entrance (на master: exit = '
    + 'центр rooms[last] — другая клетка)');
  assert.deepEqual({ x: dg.x, y: dg.y },
    { x: dg.entrance.x, y: dg.entrance.y },
    'при входе герой НА едином тайле (вход в пещеру)');
  const dayBefore = g.state.day;
  const e = press(h, 'KeyE');
  release(h, e);
  assert.equal(g.dungeon, null,
    '[E] на тайле — ВЫХОД (на master: [E] в подземелье = no-op, '
    + '000121 — onInteract undefined)');
  assert.equal(G.dungeonUI.isActive(), false, 'dungeonUI закрыт');
  // Двойной фаер [E] (как PE-1, memory/000177-portal-exit-tile.md
  // §2.3): на МИРОВОМ тайле пещеры buildingUI/npcUI НЕ открываются
  // (у тайла нет действий — openBuildingUI no-op).
  assert.equal(G.buildingUI.isActive(), false,
    'двойной фаер [E]: buildingUI не открыт на тайле пещеры');
  assert.equal(G.npcUI.isActive(), false,
    'двойной фаер [E]: npcUI не открыт на тайле пещеры');
  assert.equal(g.state.day, dayBefore + 1,
    'на выходе из подземелья ДЕНЬ проходит (clock.event)');
  assert.equal(g.state.stepsToday, 0, 'event() — счётчик шагов сброшен');
  assert.deepEqual({ x: g.state.player.x, y: g.state.player.y },
    found.target, 'герой — на мировом тайле пещеры');
});

// ============================================================
// PE-3: [E]-механизм (interactExit) — уровень-независимость и гейтинг
// ============================================================

// --- node-среда для PE-3a (чистые функции + ядра, паттерн
// tests/locations.test.js) ---

const D = require('../src/dungeon.js');
const M = require('../src/map.js');
const C = require('../src/cities.js');
const L = require('../src/locations.js');

// ЛЕНИВЫЙ Game (модуль читает globalThis.Game в момент вызова).
function withGame(fake, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'Game');
  const prev = globalThis.Game;
  globalThis.Game = fake;
  try {
    return fn();
  } finally {
    if (had) globalThis.Game = prev;
    else delete globalThis.Game;
  }
}

function makeNodeGame() {
  function createMover(opts) {
    const p = { x: opts.x, y: opts.y };
    return {
      intervalMs: opts.intervalMs,
      teleport(x, y) { p.x = x; p.y = y; },
      step(prev, next, now) { p.x = next.x; p.y = next.y; },
      position() { return { x: p.x, y: p.y }; },
    };
  }
  return {
    G: {
      createMover,
      DUNGEON_NAMES: D.DUNGEON_NAMES,
      CELL_FLOOR: D.CELL_FLOOR,
      CELL_WALL: D.CELL_WALL,
      openChest: (c, id) => D.openChest(c, id),
      wanderStep: (c, d) => D.wanderStep(c, d),
    },
  };
}

// Валидный шаг в сторону от единого тайла: FLOOR-сосед входа, не
// сам тайл (на master — не d.exit; после реализации — exit == вход,
// фильтр избыточен, но безопасен).
function asideDir(d) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of DIRS) {
    const nx = d.entrance.x + dx, ny = d.entrance.y + dy;
    if (nx < 0 || ny < 0 || nx >= d.width || ny >= d.height) continue;
    if (d.cells[ny * d.width + nx] !== D.CELL_FLOOR) continue;
    if (nx === d.exit.x && ny === d.exit.y) continue;
    return [dx, dy];
  }
  assert.fail('PE-3a: валидного соседа у входа нет (сценарий)');
  return null;
}

test('PE-3a: L.interactExit — универсальность (два РАЗНЫХ реальных layout\'а = уровне-независимость)', () => {
  const { G } = makeNodeGame();
  const PX = M.syntheticPixels(8, 8, 128, 128, 128, 255);
  // (а) Реальное подземелье: CAVE (37,−12) — createDungeon.
  const d = D.createDungeon(37, -12, PX, M.TERRAIN.GRASS);
  assert.deepEqual(d.exit, d.entrance,
    'единый тайл: d.exit deepEqual d.entrance (на master: exit = '
    + 'центр rooms[last] — другая клетка)');
  const contents = { seed: 42, mobs: [], chests: [], createdAtXp: 0,
    step: 0 };
  const ds = withGame(G, () => L.makeDungeonState(d, contents, '37,-12',
    { intervalMs: 420 }));
  withGame(G, () => {
    // Герой на едином тайле (spawn) → { type: 'exit', name }.
    assert.deepEqual(L.interactExit(ds),
      { type: 'exit', name: D.DUNGEON_NAMES[d.type] },
      'подземелье: герой на тайле → { type: \'exit\', name: '
      + 'DUNGEON_NAMES[type] } (L.interactExit — 10-й экспорт, D2)');
    // Шаг в сторону → null.
    const dir = asideDir(d);
    L.dungeonMove(ds, dir[0], dir[1], NOW, { inCombat: false });
    assert.equal(L.interactExit(ds), null, 'подземелье: шаг в сторону → null');
    // Шаг обратно на тайл → { type: 'exit' }.
    L.dungeonMove(ds, -dir[0], -dir[1], NOW, { inCombat: false });
    assert.deepEqual(L.interactExit(ds),
      { type: 'exit', name: D.DUNGEON_NAMES[d.type] },
      'подземелье: возврат на тайл → { type: \'exit\' }');
  });
  // (б) Реальный город: createCityLayout (100,−40, fp5) — ДРУГОЙ
  // layout (дверь южного периметра; на master exit — северный y=0).
  const lay = C.createCityLayout(100, -40, 5);
  assert.deepEqual(lay.exit, lay.entrance,
    'единый тайл города: exit deepEqual entrance (дверь)');
  const dsC = withGame(G, () => L.makeCityState(lay,
    { название: 'Тестгород', размер: { ширина: 5 } }, '100,-40',
    { intervalMs: 420 }));
  withGame(G, () => {
    assert.deepEqual(L.interactExit(dsC),
      { type: 'exit', name: 'Тестгород' },
      'город: герой на двери (spawn) → { type: \'exit\', name: ds.name }');
    // Дверь (x, H−1) имеет ровно одного FLOOR-соседа (x, H−2).
    L.cityMove(dsC, 0, -1, NOW, { inCombat: false });
    assert.equal(L.interactExit(dsC), null, 'город: шаг в сторону → null');
    L.cityMove(dsC, 0, 1, NOW, { inCombat: false });
    assert.deepEqual(L.interactExit(dsC),
      { type: 'exit', name: 'Тестгород' },
      'город: возврат на дверь → { type: \'exit\' }');
  });
});

test('PE-3b: [E] только на двери: шаг в сторону → no-op; шаг на дверь → выход', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findNearest(G, myMap, g.state.player, (t) => isCave(G, t));
  assert.ok(found, 'сценарий: пещера достижима пешком от спавна');
  walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg, 'в подземелье');
  const day0 = g.state.day;
  // Шаг в сторону: FLOOR-сосед spawn'а, не тайл выхода (на master —
  // НЕ d.exit, чтобы 1-я часть была зелёной и закрепила СОХРАНЁННОЕ
  // свойство: [E] в подземелье вне выхода = no-op, 000121). Сосед в
  // safe-зоне 5×5 — мобов/сундуков нет.
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let dir = null;
  for (const cand of DIRS) {
    const nx = dg.x + cand[0], ny = dg.y + cand[1];
    if (nx < 0 || ny < 0 || nx >= dg.width || ny >= dg.height) continue;
    if (dg.cells[ny * dg.width + nx] !== G.CELL_FLOOR) continue;
    if (nx === dg.exit.x && ny === dg.exit.y) continue;
    dir = cand;
    break;
  }
  assert.ok(dir, 'сценарий: валидный сосед у spawn');
  {
    const e = press(h, keydownFor(dir[0], dir[1]));
    release(h, e);
  }
  assert.ok(g.dungeon, 'шаг в сторону — ещё внутри');
  assert.equal(g.dungeon.x, dg.entrance.x + dir[0], 'позиция: x');
  assert.equal(g.dungeon.y, dg.entrance.y + dir[1], 'позиция: y');
  // [E] ВНЕ двери — НИЧЕГО (сохранённое свойство 000121).
  {
    const e = press(h, 'KeyE');
    release(h, e);
  }
  assert.ok(g.dungeon, '[E] вне двери — выход НЕ случился (свойство)');
  assert.equal(g.dungeon.x, dg.entrance.x + dir[0], 'позиция не сдвинулась: x');
  assert.equal(g.dungeon.y, dg.entrance.y + dir[1], 'позиция не сдвинулась: y');
  assert.equal(g.state.day, day0, 'день не сдвинулся');
  assert.equal(G.combatUI.isActive(), false, 'боев нет');
  // Шаг обратно на дверь.
  {
    const e = press(h, keydownFor(-dir[0], -dir[1]));
    release(h, e);
  }
  assert.equal(g.dungeon.x, dg.entrance.x, 'на двери: x');
  assert.equal(g.dungeon.y, dg.entrance.y, 'на двери: y');
  // [E] НА двери — выход (на master: no-op → g.dungeon !== null).
  {
    const e = press(h, 'KeyE');
    release(h, e);
  }
  assert.equal(g.dungeon, null,
    '[E] на двери — выход (на master: [E] в подземелье = no-op, 000121)');
  assert.equal(G.dungeonUI.isActive(), false, 'dungeonUI закрыт');
  assert.equal(g.state.day, day0 + 1, 'на выходе ДЕНЬ проходит');
  assert.deepEqual({ x: g.state.player.x, y: g.state.player.y },
    found.target, 'герой — на тайле пещеры');
});

// ============================================================
// PE-4: отрисовка единого тайла (дверь/пещера/фолбэк/реестр)
// ============================================================

test('PE-4a: рендер города: ДВЕРЬ в единой клетке (один маркер, зелёного входа нет)', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findNearest(G, myMap, g.state.player,
    (t) => isCity(G, t)
      && G.getBuilding(t.buildingId).размер.ширина >= 2);
  assert.ok(found, 'сценарий: достижимый многотайловый город');
  walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg, 'в городе');
  assert.equal(dg.kind, 'city');
  assert.deepEqual({ x: dg.exit.x, y: dg.exit.y },
    { x: dg.entrance.x, y: dg.entrance.y }, 'единый тайл');
  const { p, zoom, canvas } = overlayMarkerPoint(h, dg);
  const calls = canvas.drawCalls;
  const doors = calls.filter(([m, a]) => m === 'drawImage'
    && a[0] && a[0].__src === 'assets/dungeon/door.svg');
  assert.equal(doors.length, 1,
    'ОДИН маркер-дверь (спрайт assets/dungeon/door.svg; на master: '
    + 'файла нет, DUNGEON_PORTAL отсутствует — маркер = «X»+зелёный)');
  assert.equal(doors[0][1][1], p.x, 'дверь в ТОЧНОЙ proj-точке: x');
  assert.equal(doors[0][1][2], p.y, 'дверь в ТОЧНОЙ proj-точке: y');
  assert.equal(doors[0][1][3], zoom, 'дверь — целая клетка: width');
  assert.equal(doors[0][1][4], zoom, 'дверь — целая клетка: height');
  assert.ok(!calls.some(([m, a, fs]) => m === 'fillRect'
      && fs === '#3f9d55'),
    'зелёного маркера входа (#3f9d55) НЕТ (удалён, D3)');
});

test('PE-4b: рендер подземелья: ПЕЩЕРА в единой клетке (один маркер, зелёного входа нет)', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findNearest(G, myMap, g.state.player, (t) => isCave(G, t));
  assert.ok(found, 'сценарий: пещера достижима пешком от спавна');
  walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg, 'в подземелье');
  assert.equal(dg.kind, 'dungeon');
  assert.deepEqual({ x: dg.exit.x, y: dg.exit.y },
    { x: dg.entrance.x, y: dg.entrance.y }, 'единый тайл');
  const { p, zoom, canvas } = overlayMarkerPoint(h, dg);
  const calls = canvas.drawCalls;
  const mouths = calls.filter(([m, a]) => m === 'drawImage'
    && a[0] && a[0].__src === 'assets/dungeon/cave_mouth.svg');
  assert.equal(mouths.length, 1,
    'ОДИН маркер-пещера (спрайт assets/dungeon/cave_mouth.svg; на '
    + 'master: файла нет, маркер = «X» в rooms[last] + зелёный вход)');
  assert.equal(mouths[0][1][1], p.x, 'пещера в ТОЧНОЙ proj-точке: x');
  assert.equal(mouths[0][1][2], p.y, 'пещера в ТОЧНОЙ proj-точке: y');
  assert.equal(mouths[0][1][3], zoom, 'пещера — целая клетка: width');
  assert.equal(mouths[0][1][4], zoom, 'пещера — целая клетка: height');
  assert.ok(!calls.some(([m, a, fs]) => m === 'fillRect'
      && fs === '#3f9d55'),
    'зелёного маркера входа (#3f9d55) НЕТ (удалён, D3)');
});

test('PE-4c: рендер: фолбэк без спрайта — ОДИН маркер в единой клетке (#d4b45a + «E»), «X» нигде', async () => {
  // Спрайты портала «не загрузились» (Image-стаб → onerror →
  // spriteLoader 'failed' → image() null → фолбэк ветки).
  const h = await boot({ failImages: new Set([
    'assets/dungeon/door.svg',
    'assets/dungeon/stairs.svg',
    'assets/dungeon/cave_mouth.svg',
  ]) });
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findNearest(G, myMap, g.state.player,
    (t) => isCity(G, t)
      && G.getBuilding(t.buildingId).размер.ширина >= 2);
  assert.ok(found, 'сценарий: достижимый многотайловый город');
  walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg, 'в городе');
  const { p, zoom, canvas } = overlayMarkerPoint(h, dg);
  const calls = canvas.drawCalls;
  const rects = calls.filter(([m, a, fs]) => m === 'fillRect'
    && fs === '#d4b45a'
    && a[0] === p.x + 2 && a[1] === p.y + 2
    && a[2] === zoom - 4 && a[3] === zoom - 4);
  assert.equal(rects.length, 1,
    'фолбэк: ОДИН жёлтый квадрат (inset 2, zoom−4) в единой клетке');
  assert.ok(calls.some(([m, a, fs]) => m === 'fillText'
    && a[0] === 'E' && fs === '#101418'
    && a[1] === p.x + zoom / 2 && a[2] === p.y + zoom - 5),
    'фолбэк: буква «E» (#101418, аффирмация действия [E]) в единой '
    + 'клетке (на master: буква «X» — другой символ/клетка)');
  assert.ok(!calls.some(([m, a]) => m === 'fillText' && a[0] === 'X'),
    'маркера «X» НИГДЕ нет (удалён, D3)');
});

test('PE-4d: реестр: assets/dungeon/{door,cave_mouth,stairs}.svg + DUNGEON_PORTAL + allAssetPaths', () => {
  const S = require('../src/sprites.js');
  const paths = {
    door: 'assets/dungeon/door.svg',
    stairs: 'assets/dungeon/stairs.svg',
    cave_mouth: 'assets/dungeon/cave_mouth.svg',
  };
  for (const p of Object.values(paths)) {
    assert.ok(fs.existsSync(path.join(ROOT, p)),
      'файл ' + p + ' существует (D3: 3 SVG 64×64)');
  }
  assert.deepEqual(S.DUNGEON_PORTAL, paths,
    'DUNGEON_PORTAL — таблица 3 путей (door/stairs/cave_mouth; '
    + 'stairs — резерв без точки отрисовки: этажей нет)');
  const all = S.allAssetPaths();
  for (const p of Object.values(paths)) {
    assert.ok(all.includes(p), p + ' в allAssetPaths (loader-очередь)');
  }
});

// ============================================================
// PE-5: 000170 finally-инвариант через НОВЫЙ путь [E]
// ============================================================

test('PE-5: 000170 finally через [E]: throw в onDay (playerUI.render) — исключение НЕ улетело, dungeonState снят, dungeonUI закрыт, день+1, saveNow, мир жив', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findNearest(G, myMap, g.state.player, (t) => isCave(G, t));
  assert.ok(found, 'сценарий: пещера достижима пешком от спавна');
  walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg, 'в подземелье');
  const dayBefore = g.state.day;
  // Входной шаг записал сейв — удаляем: после [E]-выхода запись
  // обязан восстановить saveNow из finally (000170).
  delete h.storage.store['phlogiston.save'];
  // Инъекция: throw в G.playerUI.render (onDay при дне+1 — тот же
  // приём, что T5 000170 для шага-выхода).
  const origRender = G.playerUI.render;
  G.playerUI.render = () => { throw new Error('PE-5-inject: render'); };
  let err = null;
  try {
    const e = press(h, 'KeyE');
    release(h, e);
  } catch (e) {
    err = e;
  }
  G.playerUI.render = origRender;
  assert.equal(err, null,
    'исключение НЕ улетело вызывателю (try/catch exitLocation + '
    + 'try/catch onDay); на master: [E] в подземелье = no-op — выход '
    + 'не случился бы вовсе');
  assert.equal(g.dungeon, null,
    'finally: dungeonState=null (состояние снято)');
  assert.equal(G.dungeonUI.isActive(), false,
    'finally: dungeonUI.close() (гейт мира снова открыт)');
  assert.equal(g.state.day, dayBefore + 1,
    'день+1 (advanceDay: day += 1 ДО onDay-слушателей)');
  assert.ok(h.storage.store['phlogiston.save'],
    'finally: saveNow() (сейв после выходящего исключения)');
  // Движение мира после [E]-выхода живо (frame-гейт !inDungeon открыт):
  // проходной сосед на тайле пещеры → клавиша → шаг.
  const dir = passableDir(G, myMap, g.state.player.x, g.state.player.y);
  assert.ok(dir, 'сценарий: проходной сосед на тайле пещеры');
  const r = holdUntilStep(h, keydownFor(dir[0], dir[1]), NOW + 100000);
  assert.ok(r.moved,
    'движение мира возобновилось после [E]-выхода (T5-смысл для '
    + 'нового пути)');
});

// ============================================================
// 000183: пины задекларированных гардов (ретро-20261010) —
// memory/000183-guard-pins-abyss-boss.md (§PE-6..PE-9).
// ============================================================

test('PE-6: город: [E]-выход → HUD-flash «Вы вышли из {имя города}.» (рендер в следующем кадре, flash 5 с) (000177/000183)', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findNearest(G, myMap, g.state.player,
    (t) => isCity(G, t)
      && G.getBuilding(t.buildingId).размер.ширина >= 2);
  assert.ok(found, 'сценарий: достижимый многотайловый город');
  const now0 = walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg && dg.kind === 'city', 'в городе');
  const name = dg.name;
  assert.ok(typeof name === 'string' && name.length > 0,
    'сценарий: у города есть имя (поле проекции)');
  const e = press(h, 'KeyE');
  release(h, e);
  assert.equal(g.dungeon, null, '[E] — выход (состояние снято)');
  assert.equal(G.dungeonUI.isActive(), false, 'dungeonUI закрыт');
  // Flash живёт 5000 мс; performance.now() заморожен на NOW=1000:
  // flashUntil = 6000 > 1000 — виден в каждом следующем кадре.
  h.frameFn(now0 + 200);
  assert.ok(String(h.hud.textContent).endsWith('Вы вышли из ' + name + '.'),
    'HUD-flash «Вы вышли из ' + name + '.» (locationOnInteract → '
    + 'renderHud; flash-строка — ПОСЛЕДНЯЯ строка HUD, hud.js)');
});

test('PE-7: подземелье: [E]-выход → HUD-flash «Вы вышли из {имя подземелья}.» (имя из D.DUNGEON_NAMES[type]) (000177/000183)', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findNearest(G, myMap, g.state.player, (t) => isCave(G, t));
  assert.ok(found, 'сценарий: пещера достижима пешком от спавна');
  const now0 = walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg && dg.kind === 'dungeon', 'в подземелье');
  assert.ok(D.DUNGEON_NAMES[dg.type], 'сценарий: тип имеет имя');
  assert.equal(dg.name, D.DUNGEON_NAMES[dg.type],
    'имя проекции = D.DUNGEON_NAMES[type] (источник имени)');
  const dayBefore = g.state.day;
  const e = press(h, 'KeyE');
  release(h, e);
  assert.equal(g.dungeon, null, '[E] — выход');
  assert.equal(g.state.day, dayBefore + 1, 'на выходе ДЕНЬ проходит');
  // Flash устанавливается ПОСЛЕ exitLocation (цепочка exitDungeon →
  // clock.event → onDay прошла; затем locationOnInteract пишет
  // hudFlash) — следующий кадр рендерит его последней строкой.
  h.frameFn(now0 + 200);
  assert.ok(
    String(h.hud.textContent).endsWith(
      'Вы вышли из ' + D.DUNGEON_NAMES[dg.type] + '.'),
    'HUD-flash «Вы вышли из ' + D.DUNGEON_NAMES[dg.type] + '.»');
});

test('PE-8: тач-кнопка [E]: подземелье — шаг в сторону no-op / шаг на тайл — выход (день+1, flash); город — тап на двери — выход (день не идёт, flash) (000177/000183)', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  // #touch-controls — на document.body при INIT (ui.js: build →
  // document.body.appendChild(root); main.js — init при загрузке,
  // схема 'keyboard' в vm-среде: D-pad не строится, 2 кнопки).
  const body = h.sandbox.document.body;
  const root = (body.children || []).find((ch) => ch.id === 'touch-controls');
  assert.ok(root, 'сценарий: #touch-controls на document.body');
  const btns = root.children.filter((ch) =>
    String(ch.className).includes('tc-action'));
  assert.equal(btns.length, 2, 'кнопки [E] и [I] (tc-action): 2');
  // Тап = pointerdown-слушатель кнопки: e.preventDefault();
  // onInteract(); blur() (ui.js L1529-1534) — тот же onInteract,
  // что и клавиша [E] (main.js: routeTouchScreen → dungeon →
  // locationOnInteract — единый код, 000177).
  const tap = (b) => {
    const fns = b.listeners['pointerdown'] || [];
    assert.equal(fns.length, 1, 'у кнопки ровно 1 pointerdown-слушатель');
    let prevented = false;
    fns[0]({ preventDefault() { prevented = true; } });
    assert.ok(prevented, 'тап: preventDefault (контракт слушателя)');
  };
  // --- Подземелье ---
  const found = findNearest(G, myMap, g.state.player, (t) => isCave(G, t));
  assert.ok(found, 'сценарий: пещера достижима пешком от спавна');
  let now = walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg && dg.kind === 'dungeon', 'в подземелье');
  const day0 = g.state.day;
  // Шаг в сторону: FLOOR-сосед spawn'а, не тайл выхода (паттерн PE-3b).
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let dir = null;
  for (const cand of DIRS) {
    const nx = dg.x + cand[0], ny = dg.y + cand[1];
    if (nx < 0 || ny < 0 || nx >= dg.width || ny >= dg.height) continue;
    if (dg.cells[ny * dg.width + nx] !== G.CELL_FLOOR) continue;
    if (nx === dg.exit.x && ny === dg.exit.y) continue;
    dir = cand;
    break;
  }
  assert.ok(dir, 'сценарий: валидный сосед у spawn');
  {
    const e = press(h, keydownFor(dir[0], dir[1]));
    release(h, e);
  }
  assert.ok(g.dungeon, 'шаг в сторону — ещё внутри');
  // Тап [E] ВНЕ двери — НИЧЕГО (interactExit → null, no-op 000121).
  tap(btns[0]);
  assert.ok(g.dungeon, 'тап вне двери — выход НЕ случился');
  assert.equal(g.dungeon.x, dg.entrance.x + dir[0], 'позиция не сдвинулась: x');
  assert.equal(g.dungeon.y, dg.entrance.y + dir[1], 'позиция не сдвинулась: y');
  assert.equal(g.state.day, day0, 'день не сдвинулся (no-op)');
  // Шаг обратно на дверь (единый тайл: entrance == exit).
  {
    const e = press(h, keydownFor(-dir[0], -dir[1]));
    release(h, e);
  }
  // Тап [E] НА двери — выход (тот же locationOnInteract, что клавиша).
  tap(btns[0]);
  assert.equal(g.dungeon, null, 'тап на двери — выход');
  assert.equal(G.dungeonUI.isActive(), false, 'dungeonUI закрыт');
  assert.equal(g.state.day, day0 + 1, 'на выходе ДЕНЬ проходит');
  assert.deepEqual({ x: g.state.player.x, y: g.state.player.y },
    found.target, 'герой — на мировом тайле пещеры');
  h.frameFn(now + 200);
  assert.ok(
    String(h.hud.textContent).endsWith(
      'Вы вышли из ' + D.DUNGEON_NAMES[dg.type] + '.'),
    'flash после Тач-выхода из подземелья (имя из D.DUNGEON_NAMES)');
  // --- Город ---
  const foundC = findNearest(G, myMap, g.state.player,
    (t) => isCity(G, t)
      && G.getBuilding(t.buildingId).размер.ширина >= 2);
  assert.ok(foundC, 'сценарий: город достижим (от тайла пещеры)');
  now = walkTiles(h, now, foundC.steps);
  const dgc = g.dungeon;
  assert.ok(dgc && dgc.kind === 'city', 'в городе');
  const dayC = g.state.day;
  // Тап [E] на двери — выход из города.
  tap(btns[0]);
  assert.equal(g.dungeon, null, 'тап на двери — выход из города');
  assert.equal(G.dungeonUI.isActive(), false, 'dungeonUI закрыт');
  assert.equal(g.state.day, dayC, 'выход из города ДЕНЬ НЕ проходит (000105)');
  assert.deepEqual({ x: g.state.player.x, y: g.state.player.y },
    foundC.target, 'герой — на мировом тайле города');
  h.frameFn(now + 200);
  assert.ok(String(h.hud.textContent).endsWith(
      'Вы вышли из ' + dgc.name + '.'),
    'flash после Тач-выхода из города (имя города)');
});

test('PE-9: g.actions.enterDungeon() — подземелье из spawn-тайла: единый тайл (exit deepEqual entrance, герой на нём); [E] → выход (день+1, герой на (0,0), flash) (000177/000183)', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  // === (не deepEqual): позиция спавна может быть −0 — −0 === 0, а
  // strictEqual различает знаки нуля.
  assert.ok(g.state.player.x === 0 && g.state.player.y === 0,
    'сценарий: герой на спавне (0,0)');
  const day0 = g.state.day;
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon() — dungeonState создан (debug-вход)');
  assert.equal(G.dungeonUI.isActive(), true, 'dungeonUI открыт (оверлей)');
  // g.dungeon — ПРОЕКЦИЯ (свежий объект при каждом доступе): пин по
  // ПОЛЯМ, а не по identity (identity ds не гарантируется).
  const dg = g.dungeon;
  assert.ok(dg, 'g.dungeon — проекция состояния');
  assert.equal(dg.kind, 'dungeon', 'kind: dungeon');
  assert.ok(D.DUNGEON_NAMES[dg.type], 'сценарий: тип подземелья именуется');
  assert.equal(dg.name, D.DUNGEON_NAMES[dg.type],
    'имя проекции = D.DUNGEON_NAMES[type]');
  assert.deepEqual({ x: dg.exit.x, y: dg.exit.y },
    { x: dg.entrance.x, y: dg.entrance.y },
    'единый тайл: exit deepEqual entrance');
  assert.deepEqual({ x: dg.x, y: dg.y },
    { x: dg.entrance.x, y: dg.entrance.y },
    'герой НА едином тайле (spawn debug-входа)');
  // Мировой герой не сдвигается внутри подземелья (debug-вход).
  assert.ok(g.state.player.x === 0 && g.state.player.y === 0,
    'мировая позиция не сдвинулась (0,0)');
  // [E] — выход (тот же locationOnInteract).
  const e = press(h, 'KeyE');
  release(h, e);
  assert.equal(g.dungeon, null, '[E] — выход');
  assert.equal(G.dungeonUI.isActive(), false, 'dungeonUI закрыт');
  assert.equal(g.state.day, day0 + 1, 'на выходе ДЕНЬ проходит');
  assert.ok(g.state.player.x === 0 && g.state.player.y === 0,
    'герой — обратно на спавне (0,0)');
  h.frameFn(NOW + 200);
  assert.ok(String(h.hud.textContent).endsWith(
      'Вы вышли из ' + D.DUNGEON_NAMES[ds.dg.type] + '.'),
    'flash (имя из D.DUNGEON_NAMES[type] ds.dg)');
});

// ============================================================
// 000153.03: переходы этажей — [E] вниз/вверх, спавн, память,
// все-или-ничего, debug-изоляция, HUD «Глубина: N».
// Контракт: memory/000153.03-floor-transitions.md (D1–D15).
// ============================================================

// Детерминированная «глобальная затравка» — тот же объект, что
// G.generateSeedPixels() в песочнице (assets/map.png ВСЕГДА onerror
// → loadMapPixels → generateSeedPixels; src/mapseed.js, фикс-сид).
const S = require('../src/mapseed.js');

// Бит-в-бит пере-генерация layout текущего/соседнего этажа (D2.3):
// те же (wx, wy) тайла-пещеры, те же пиксели, terrain тайла, глубина.
function floorAt(h, tx, ty, depth) {
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const t = myMap.tileAt(tx, ty);
  return D.createDungeon(tx, ty, S.generateSeedPixels(), t.terrain, depth);
}

// Ходьба ВНУТРИ подземелья: 1 keydown = 1 синхронный шаг
// (dungeon-ui keydown → onMove → dungeonOnMove → dungeonMove;
// кадры НЕ нужны — в отличие от мира, где tryMove в frame).
// Бой по маршруту — авторазрешение (паттерн walkTiles).
// (tx, ty) — клетка текущего этажа; достижимость — по g.dungeon.
function walkDungeonTo(h, tx, ty) {
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const d0 = g.dungeon;
  const W = d0.width, H = d0.height;
  const sx = d0.x, sy = d0.y;
  if (sx === tx && sy === ty) return;
  // BFS 4-соседство по FLOOR-клеткам (паттерн findNearest).
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
    'walkDungeonTo: (' + tx + ',' + ty + ') недостижимо от (' + sx + ','
    + sy + ') (сценарий)');
  const path = [];
  for (let k = tx + ',' + ty; k !== startKey; k = prev.get(k)) {
    const [x, y] = k.split(',').map(Number);
    path.unshift({ x, y });
  }
  for (const step of path) {
    const before = g.dungeon;
    const e = press(h, keydownFor(step.x - before.x, step.y - before.y));
    release(h, e);
    const after = g.dungeon;
    assert.equal(after.x, step.x,
      'walkDungeonTo: герой перешёл на (' + step.x + ',' + step.y + ') — x');
    assert.equal(after.y, step.y,
      'walkDungeonTo: герой перешёл на (' + step.x + ',' + step.y + ') — y');
    // Шаг на клетку живой группы → бой; победа → герой остаётся
    // на клетке (дungeonMove: позиция обновлена ДО боя).
    if (G.combatUI.isActive()) {
      const c = G.combatUI.current();
      for (const m of c.units.filter((x) => x.side === 'mob'
          && x.alive)) {
        G.combatInternals.dealDamageToMob(c, m, 9999);
      }
      assert.ok(c.result && c.result.outcome === 'victory',
        'walkDungeonTo: бой по маршруту — победа');
      G.combatUI.handleCode('Space');
      assert.equal(G.combatUI.isActive(), false,
        'walkDungeonTo: бой закрыт (Space → finish)');
    }
  }
}

// Общий setup: boot → пешком до пещеры → авто-вход (depth=1) →
// бит-в-бит layout первого этажа (floorAt).
function bootInCave(h) {
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findNearest(G, myMap, g.state.player, (t) => isCave(G, t));
  assert.ok(found, 'сценарий: пещера достижима пешком от спавна');
  walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg, 'после шага на тайл пещеры — dungeonState (авто-вход)');
  assert.equal(dg.kind, 'dungeon', 'dungeonState.kind === «dungeon»');
  const d1 = floorAt(h, found.target.x, found.target.y, 1);
  assert.deepEqual({ x: dg.exit.x, y: dg.exit.y },
    { x: d1.exit.x, y: d1.exit.y },
    'layout depth=1 — бит-в-бит (детерминированная пере-генерация)');
  return { g, G, found, d1 };
}

test('PE-10: СПУСК — [E] на stairs-down: depth+1, герой на клетке-выходе нового этажа, ДЕНЬ не тратится, HUD «Глубина: 2» (000153.03)', async () => {
  const h = await boot();
  const { g, G, found, d1 } = bootInCave(h);
  const d2 = floorAt(h, found.target.x, found.target.y, 2);
  // D9: проекция __game.dungeon.stairsDown (копия, {x,y}).
  assert.ok(g.dungeon.stairsDown,
    'D9: g.dungeon.stairsDown — проекция клетки stairs-down ({x,y})');
  assert.deepEqual({ x: g.dungeon.stairsDown.x, y: g.dungeon.stairsDown.y },
    { x: d1.stairsDown.x, y: d1.stairsDown.y },
    'D9: g.dungeon.stairsDown — проекция клетки stairs-down');
  // Ходьба до stairs-down (бой по маршруту — авторазрешение).
  walkDungeonTo(h, d1.stairsDown.x, d1.stairsDown.y);
  assert.deepEqual({ x: g.dungeon.x, y: g.dungeon.y },
    { x: d1.stairsDown.x, y: d1.stairsDown.y },
    'герой НА stairs-down');
  const dayBefore = g.state.day;
  const errBefore = h.errors.length;
  const e = press(h, 'KeyE');
  release(h, e);
  const dg2 = g.dungeon;
  assert.ok(dg2, 'глубина не снята: герой ВЕЩЬ в подземелье (не в мир)');
  assert.equal(dg2.depth, 2,
    '[E] на stairs-down → СПУСК на depth+1 (на master: [E] вне '
    + 'единого тайла = no-op — interactExit null)');
  // Спавн — на клетке-выходе нового этажа (= entrance, 000177).
  assert.deepEqual({ x: dg2.x, y: dg2.y },
    { x: d2.exit.x, y: d2.exit.y },
    'спавн — на клетке-выходе нового этажа (ТЗ п.1)');
  assert.deepEqual({ x: dg2.entrance.x, y: dg2.entrance.y },
    { x: d2.entrance.x, y: d2.entrance.y },
    'новый этаж — бит-в-бит (пере-генерация depth=2)');
  assert.equal(dg2.width, d2.width, 'новый этаж — тот же размер');
  assert.equal(g.state.day, dayBefore,
    'переход между этажами ДЕНЬ не тратит (ТЗ пп.1–2)');
  assert.equal(G.dungeonUI.isActive(), true,
    'оверлей жив (переход — не выход в мир)');
  assert.equal(h.errors.length, errBefore,
    'чистый переход — без console.error');
  // HUD (renderHud → locationLine, единый helper — D5).
  h.frameFn(NOW + 200);
  const hudText = String(h.hud.textContent);
  assert.ok(hudText.includes('Глубина: 2'),
    'HUD: строка «Глубина: 2» (finding G — единый источник): '
    + JSON.stringify(hudText));
  assert.ok(hudText.includes('До выхода: ~'),
    'HUD: «До выхода: ~N клеток» (формат locationLine): '
    + JSON.stringify(hudText));
  assert.ok(hudText.endsWith('Спуск: глубина 2.'),
    'flash перехода (D7): «Спуск: глубина 2.»: '
    + JSON.stringify(hudText));
});

test('PE-11: ПОДЪЁМ — [E] на d.exit, depth>1: depth−1, герой на stairs-down этажа depth−1 (гард D10: живой моб → entrance), ДЕНЬ не тратится, HUD без «Глубина» (000153.03)', async () => {
  const h = await boot();
  const { g, G, found, d1 } = bootInCave(h);
  const d2 = floorAt(h, found.target.x, found.target.y, 2);
  // Спуск (PE-10): герой → exit depth=2.
  walkDungeonTo(h, d1.stairsDown.x, d1.stairsDown.y);
  let e = press(h, 'KeyE');
  release(h, e);
  assert.equal(g.dungeon.depth, 2, 'setup: спуск');
  assert.deepEqual({ x: g.dungeon.x, y: g.dungeon.y },
    { x: d2.exit.x, y: d2.exit.y }, 'setup: герой на exit depth=2');
  // Подъём: [E] на d.exit (depth>1) → этаж 1.
  const dayBefore = g.state.day;
  const errBefore = h.errors.length;
  e = press(h, 'KeyE');
  release(h, e);
  const g1 = g.dungeon;
  assert.ok(g1, 'глубина не снята: герой в подземелье (не в мир)');
  assert.equal(g1.depth, 1,
    '[E] на d.exit, depth>1 → ПОДЪЁМ на depth−1 (на master: '
    + '[E] на exit = В МИР, день+1)');
  assert.equal(g.state.day, dayBefore,
    'переход между этажами ДЕНЬ не тратит (ТЗ пп.1–2)');
  assert.equal(G.dungeonUI.isActive(), true,
    'оверлей жив (подъём — не выход в мир)');
  // Спавн — на stairs-down этажа 1 (бит-в-бит layout → d1.stairsDown);
  // ГАРД D10: живой моб на клетке → entrance. Содержимое этажа 1 —
  // LIVE-объект из dungeonMemory (D3), позиции мобов актуальны
  // (wanderStep за всё время блуждания по этажу) → предсказание
  // занятости — из проекции (тот же predicate, что в ascendFloor).
  const mobOnStairs = g1.mobs.some(
    (p) => p.x === d1.stairsDown.x && p.y === d1.stairsDown.y);
  const expected = mobOnStairs ? d1.entrance : d1.stairsDown;
  assert.deepEqual({ x: g1.x, y: g1.y }, expected,
    'спавн — на stairs-down этажа depth−1'
    + (mobOnStairs
      ? ' (гард D10: живой моб на клетке → entrance)'
      : ' (клетка свободна → строго stairs-down)')
    + '; фактически mob на клетке stairsDown: ' + mobOnStairs);
  assert.equal(h.errors.length, errBefore + (mobOnStairs ? 1 : 0),
    'гард D10 — console.error ровно 1 (fallback) / чистый подъём — 0');
  // HUD depth=1 — БЕЗ строки «Глубина» (D5: строка только depth>1).
  h.frameFn(NOW + 200);
  const hudText = String(h.hud.textContent);
  assert.ok(!hudText.includes('Глубина'),
    'HUD depth=1: строки «Глубина» нет (legacy-байты пинов): '
    + JSON.stringify(hudText));
  assert.ok(hudText.includes('До выхода: ~'),
    'HUD depth=1: «До выхода: ~N клеток» на месте: '
    + JSON.stringify(hudText));
  assert.ok(hudText.endsWith('Подъём: глубина 1.'),
    'flash перехода (D7): «Подъём: глубина 1.»: '
    + JSON.stringify(hudText));
});

test('PE-12: ПАМЯТЬ этажа — открытый сундук переживает спуск/подъём (contents — live-объект из dungeonMemory, тот же день — contentValid) (000153.03)', async () => {
  const h = await boot();
  const { g, G, found, d1 } = bootInCave(h);
  const d2 = floorAt(h, found.target.x, found.target.y, 2);
  // Содержимое этажа 1 — детерминированно из сейва входа
  // (hero на входе: totalXp/level — сид и сложность). Сейв —
  // конверт {version, savedAt, data} (src/save.js).
  const saveData = JSON.parse(h.storage.store['phlogiston.save']).data;
  const saveHero = saveData.hero;
  const c1 = D.generateDungeonContents(d1,
    { totalXp: saveHero.totalXp, level: saveHero.level });
  assert.equal(g.dungeon.chests, c1.chests.length,
    'сундуки — детерминированы (тот же сид, что на входе)');
  assert.ok(c1.chests.length >= 2,
    'сценарий: на этаже ≥2 сундуков (формула 2+floor(rng*4))');
  const chest = c1.chests[0];
  // 1) Открыть сундук (шаг на клетку → dungeonMove → openChest).
  const goldBefore = g.state.hero.gold;
  walkDungeonTo(h, chest.x, chest.y);
  assert.equal(g.dungeon.chests, c1.chests.length - 1,
    'сундук открыт (счётчик −1)');
  assert.ok(g.state.hero.gold >= goldBefore + chest.gold,
    'золото из сундука (+возможный бой по маршруту)');
  // 2) Спуск.
  walkDungeonTo(h, d1.stairsDown.x, d1.stairsDown.y);
  const dayBefore = g.state.day;
  let e = press(h, 'KeyE');
  release(h, e);
  assert.equal(g.dungeon.depth, 2, 'спуск (PE-10)');
  assert.equal(g.state.day, dayBefore, 'день не тратится');
  // 3) Подъём.
  e = press(h, 'KeyE');
  release(h, e);
  const g1 = g.dungeon;
  assert.equal(g1.depth, 1, 'подъём (PE-11)');
  assert.equal(g.state.day, dayBefore, 'день не тратится');
  // 4) Сундук ЕЩЁ открыт: contents — live-объект из памяти (D3:
  // writeFloorMemory ДО buildFloor; contentValid — тот же день).
  // При перегенерации все сундуки были бы закрыты (count = c1).
  assert.equal(g1.chests, c1.chests.length - 1,
    'сундук открыт ПОСЛЕ подъёма: содержимое из dungeonMemory '
    + '(не перегенерация)');
  // 5) Память ОБОИХ этажей записана: in-flight-сейв (активный
  // этаж поверх) — раздел dungeonMemory в сейве не пуст.
  assert.ok(h.storage.store['phlogiston.save'],
    'сейв после перехода (saveNow — D4, ПОСЛЕ свапа)');
  const saveDM = JSON.parse(h.storage.store['phlogiston.save'])
    .data.dungeonMemory;
  assert.ok(saveDM && Object.keys(saveDM).length >= 2,
    'dungeonMemory — записи ОБОИХ этажей (ключи worldKey:1 и :2): '
    + JSON.stringify(saveDM && Object.keys(saveDM)));
});

test('PE-13: ИСКЛЮЧЕНИЕ при переходе — все-или-ничего (D6): состояние СОХРАНЯЕТСЯ (в отличие от PE-5/000170 — там снятие), день не жжётся, повтор [E] — errors не растут (suppressed) (000153.03)', async () => {
  const h = await boot();
  const { g, G, found, d1 } = bootInCave(h);
  walkDungeonTo(h, d1.stairsDown.x, d1.stairsDown.y);
  // Инъекция (паттерн PE-5): throw в доменной функции перехода.
  const origDescend = G.locations.descendFloor;
  G.locations.descendFloor = () => {
    throw new Error('PE-13-inject: descendFloor');
  };
  try {
    const errBefore = h.errors.length;
    const posBefore = { x: g.dungeon.x, y: g.dungeon.y };
    const dayBefore = g.state.day;
    let e = press(h, 'KeyE');
    release(h, e);
    assert.ok(g.dungeon,
      'ВСЕ-ИЛИ-НИЧЕГО: dungeonState СОХРАНЕН (герой на старом этаже; '
      + 'на master: [E] = no-op — переход не начался)');
    assert.equal(g.dungeon.depth, 1, 'глубина прежняя (не спустился)');
    assert.deepEqual({ x: g.dungeon.x, y: g.dungeon.y }, posBefore,
      'позиция прежняя (спавн нового этажа не начался)');
    assert.equal(G.dungeonUI.isActive(), true,
      'оверлей жив (не снят — в отличие от finally 000170)');
    assert.equal(g.state.day, dayBefore,
      'день НЕ жжётся (clock на переходном пути нет)');
    assert.equal(h.errors.length, errBefore + 1,
      'исключение — console.error +1 (logged)');
    // Повторный [E] — ошибки НЕ +2 (подавлены, transErrLogged).
    const errBefore2 = h.errors.length;
    e = press(h, 'KeyE');
    release(h, e);
    assert.equal(h.errors.length, errBefore2,
      'повторный [E] — повторные предупреждения подавлены');
    assert.ok(g.dungeon, 'повторный [E] — состояние всё ещё живо');
  } finally {
    G.locations.descendFloor = origDescend;
  }
});

test('PE-14: DEBUG-вход (terrain≠тайла) — memoryBanned: переходов НЕТ ([E] на stairs-down — ничего не происходит, состояние живо, день не тратится, errors +1) (D12, 000153.03)', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  assert.ok(g.state.player.x === 0 && g.state.player.y === 0,
    'сценарий: герой на спавне (0,0)');
  const t0 = myMap.tileAt(0, 0);
  // Вынужденный terrain ≠ terrain тайла → debugEnterDungeon ставит
  // memoryBanned (000153.01) — контент не мержится в мировой раздел.
  const otherTerrain = t0.terrain === M.TERRAIN.GRASS
    ? M.TERRAIN.SAND : M.TERRAIN.GRASS;
  const ds = g.actions.enterDungeon(otherTerrain);
  assert.ok(ds, 'enterDungeon(terrain) — debug-вход');
  assert.equal(G.dungeonUI.isActive(), true, 'дungeonUI открыт');
  assert.equal(g.dungeon.depth, 1, 'debug-вход — depth=1');
  // debugEnterDungeon: layout — от ВЫНУЖДЕННОГО terrain (000153.01),
  // не от тайла → пере-генерация с otherTerrain (бит-в-бит).
  const d1 = D.createDungeon(0, 0, S.generateSeedPixels(),
    otherTerrain, 1);
  assert.deepEqual({ x: g.dungeon.exit.x, y: g.dungeon.exit.y },
    { x: d1.exit.x, y: d1.exit.y },
    'layout — бит-в-бит (вынужденный terrain)');
  walkDungeonTo(h, d1.stairsDown.x, d1.stairsDown.y);
  const dayBefore = g.state.day;
  const errBefore = h.errors.length;
  const e = press(h, 'KeyE');
  release(h, e);
  assert.ok(g.dungeon,
    'состояние живо: переход НЕ выполнен (memoryBanned → null)');
  assert.equal(g.dungeon.depth, 1, 'глубина прежняя');
  assert.deepEqual({ x: g.dungeon.x, y: g.dungeon.y },
    { x: d1.stairsDown.x, y: d1.stairsDown.y },
    'герой всё ещё на stairs-down (no-op)');
  assert.equal(g.state.day, dayBefore,
    'день не тратится (перехода не было)');
  assert.equal(h.errors.length, errBefore + 1,
    'memoryBanned → console.error (logged, D12)');
});

// --- node-среда переходов (N1–N4) ---
// makeFloorGame: ядро makeNodeGame + API dungeon.js, которое
// descendFloor/ascendFloor/floorStatusLine-потребители читают
// через lazyGame() (G.createDungeon, G.dungeonMemoryKey,
// G.contentValid, G.generateDungeonContents).

function makeFloorGame() {
  const G = makeNodeGame().G;
  return Object.assign({}, G, {
    createDungeon: D.createDungeon,
    dungeonMemoryKey: D.dungeonMemoryKey,
    contentValid: D.contentValid,
    generateDungeonContents: D.generateDungeonContents,
  });
}

test('N1: L.interactExit — расширение (D1): exit-тайл ПЕРВЫМ (бит-в-бит); stairsDown → {type:descend}; exit depth>1 → {type:ascend}; null — fail-open', () => {
  const G = makeNodeGame().G;
  const Gf = makeFloorGame();
  const PX = M.syntheticPixels(8, 8, 128, 128, 128, 255);
  const d1 = D.createDungeon(37, -12, PX, M.TERRAIN.GRASS, 1);
  const d2 = D.createDungeon(37, -12, PX, M.TERRAIN.GRASS, 2);
  assert.ok(d1.stairsDown && d2.stairsDown, 'сценарий: layout c лестницей');
  assert.notDeepEqual(d1.stairsDown, d1.exit,
    'stairsDown ≠ exit (макс. BFS-дистанция, 000153.02)');
  const contents = { seed: 42, mobs: [], chests: [], createdAtXp: 0,
    step: 0 };
  const ds1 = withGame(Gf, () => L.makeDungeonState(d1, contents,
    '37,-12', { intervalMs: 420 }));
  withGame(Gf, () => {
    // (а) Герой на exit, depth=1 → {type:'exit', name} — РЕГРЕССИЯ
    // (PE-3a-контракт бит-в-бит).
    assert.deepEqual(L.interactExit(ds1),
      { type: 'exit', name: D.DUNGEON_NAMES[d1.type] },
      'подземелье depth=1: на тайле → { type: \'exit\', name }');
    // (б) Герой на stairsDown → {type:'descend'}.
    ds1.x = d1.stairsDown.x; ds1.y = d1.stairsDown.y;
    assert.deepEqual(L.interactExit(ds1), { type: 'descend' },
      'на stairs-down → { type: \'descend\' } (000153.03)');
    // (в) Шаг в сторону от stairsDown → null.
    ds1.x = d1.entrance.x; ds1.y = d1.entrance.y;
    const dir = asideDir(d1);
    ds1.x += dir[0]; ds1.y += dir[1];
    assert.equal(L.interactExit(ds1), null,
      'вне обеих клеток → null (no-op 000121 сохранён)');
  });
  const ds2 = withGame(Gf, () => L.makeDungeonState(d2,
    Object.assign({}, contents), '37,-12', { intervalMs: 420 }));
  withGame(Gf, () => {
    // (г) Герой на exit, depth=2 → {type:'ascend'} (НЕ exit).
    assert.deepEqual(L.interactExit(ds2), { type: 'ascend' },
      'подземелье depth=2: на тайле-выходе → { type: \'ascend\' }');
  });
  // (д) stairsDown = null (дегенеративная форма, fail-open) → null.
  const dNull = Object.assign({}, d1, { stairsDown: null });
  const dsN = withGame(Gf, () => L.makeDungeonState(dNull,
    Object.assign({}, contents), '37,-12', { intervalMs: 420 }));
  withGame(Gf, () => {
    dsN.x = d1.stairsDown.x; dsN.y = d1.stairsDown.y;
    assert.equal(L.interactExit(dsN), null,
      'stairsDown null (fail-open 000153.02) → null');
  });
  // (е) Город — бит-в-бит: дверь → {type:'exit'}; шаг в сторону →
  // null (у layout города stairsDown/depth — нет; kind-гард D1).
  const lay = C.createCityLayout(100, -40, 5);
  const dsC = withGame(Gf, () => L.makeCityState(lay,
    { название: 'Тестгород', размер: { ширина: 5 } }, '100,-40',
    { intervalMs: 420 }));
  withGame(Gf, () => {
    assert.deepEqual(L.interactExit(dsC),
      { type: 'exit', name: 'Тестгород' },
      'город: на двери → { type: \'exit\', name } (без изменений)');
    L.cityMove(dsC, 0, -1, NOW, { inCombat: false });
    assert.equal(L.interactExit(dsC), null,
      'город: шаг в сторону → null (без изменений)');
  });
});

test('N2: L.floorStatusLine — ОДИН источник строки состояния (D5, finding G): «Глубина: N» только depth>1; «До выхода: ~N клеток» — Манхэттен; тихий гард «»', () => {
  assert.equal(typeof L.floorStatusLine, 'function',
    'L.floorStatusLine — экспорт locations.js (finding G: один '
    + 'helper для stateEl и locationLine)');
  const d2 = { exit: { x: 10, y: 10 }, depth: 2 };
  assert.equal(L.floorStatusLine(d2, 10, 10),
    'Глубина: 2\nДо выхода: ~0 клеток',
    'depth=2: «Глубина: 2» + «До выхода: ~0 клеток»');
  assert.equal(L.floorStatusLine(d2, 13, 12),
    'Глубина: 2\nДо выхода: ~5 клеток',
    'depth=2: Манхэттен-дистанция (|13−10|+|12−10| = 5)');
  const d1 = { exit: { x: 10, y: 10 }, depth: 1 };
  assert.equal(L.floorStatusLine(d1, 10, 11),
    'До выхода: ~1 клеток',
    'depth=1: строки «Глубина» НЕТ (legacy-байты пинов)');
  assert.equal(L.floorStatusLine({ exit: { x: 10, y: 10 } }, 9, 10),
    'До выхода: ~1 клеток',
    'depth отсутствует (город/legacy-фикстура): строки «Глубина» нет');
  // Тихий гард (рендер-пути — без console.error, FOG-B1/B6):
  assert.equal(L.floorStatusLine(null, 0, 0), '',
    'd = null → «» (тихий гард)');
  assert.equal(L.floorStatusLine({}, 0, 0), '',
    'd.exit отсутствует → «» (тихий гард)');
});

test('N3: L.descendFloor — спуск (D2/D3): спавн на exit нового этажа; память СТАРОГО этажа записана ДО сборки; valid-память нового — reuse (тот же объект); expired — перегенерация; memoryBanned → null', () => {
  const G = makeNodeGame().G;
  const Gf = makeFloorGame();
  const PX = M.syntheticPixels(8, 8, 128, 128, 128, 255);
  const terrain = M.TERRAIN.GRASS;
  const d1 = D.createDungeon(37, -12, PX, terrain, 1);
  const d2 = D.createDungeon(37, -12, PX, terrain, 2);
  const hero = { totalXp: 100, level: 3 };
  const map = { tileAt: () => ({ terrain }) };
  const player = { x: 37, y: -12 };
  const baseCtx = { map, mapPixels: PX, player, hero, day: 10,
    intervalMs: 420 };
  const key1 = D.dungeonMemoryKey('37,-12', 1);
  const key2 = D.dungeonMemoryKey('37,-12', 2);
  // (а) Первый спуск: памяти нет — новый этаж генерируется.
  const contents1 = D.generateDungeonContents(d1, hero);
  const memory = new Map();
  const ds = withGame(Gf, () => L.makeDungeonState(d1, contents1,
    '37,-12', { intervalMs: 420 }));
  const next = withGame(Gf, () =>
    L.descendFloor(ds, Object.assign({ memory }, baseCtx)));
  assert.ok(next, 'descendFloor → ds нового этажа');
  assert.equal(next.dg.depth, 2, 'новый этаж — depth+1');
  assert.deepEqual(next.dg, d2,
    'layout нового этажа — бит-в-бит (createDungeon тот же вызов)');
  assert.deepEqual({ x: next.x, y: next.y }, d2.exit,
    'спавн — на клетке-выходе нового этажа (= entrance, ТЗ п.1)');
  assert.deepEqual(next.mover.position(),
    { x: d2.exit.x, y: d2.exit.y }, 'мувер — на клетке спавна');
  assert.deepEqual(next.log, ['Спуск: глубина 2.'],
    'log нового этажа — «Спуск: глубина 2.» (D2, не «: вход.»)');
  // Память СТАРОГО этажа записана (ДО сборки нового, D3).
  const rec1 = memory.get(key1);
  assert.ok(rec1, 'ключ 37,-12:1 — память старого этажа');
  assert.equal(rec1.contents, contents1,
    'contents — LIVE-объект (не копия)');
  assert.equal(rec1.lastVisitDay, 10, 'lastVisitDay = day');
  assert.ok(next.contents, 'содержимое нового этажа сгенерировано');
  // 000157.02: залежи нового этажа — по ЕГО реальной глубине (2):
  // канонический вызов с { depth: 2 } (тот же, что maybeEnterDungeon).
  // Review-фикс: без opts ЛЮБАЯ регенерация depth>=2 давала залежи
  // depth=1 (другой rng_dep-поток, 1 залежь, T1-only) — пин
  // переходного пути (первые 16 тестов депозит-ассертов не имели).
  assert.deepEqual(next.contents.deposits,
    D.generateDungeonContents(d2, hero, { depth: 2 }).deposits,
    'залежи нового этажа — по глубине (шкала 000157.02)');
  // (б) Valid-память нового этажа (тот же день) — REUSE того же
  // объекта (не перегенерация).
  const c2 = D.generateDungeonContents(d2, hero, { depth: 2 });
  const memory2 = new Map();
  memory2.set(key2, { contents: c2, lastVisitDay: 10 });
  const ds1b = withGame(Gf, () => L.makeDungeonState(d1,
    D.generateDungeonContents(d1, hero), '37,-12', { intervalMs: 420 }));
  const next2 = withGame(Gf, () =>
    L.descendFloor(ds1b, Object.assign({ memory: memory2 }, baseCtx)));
  assert.equal(next2.contents, c2,
    'valid-память depth=2 (тот же день, contentValid) — тот же объект');
  assert.ok(memory2.get(key1),
    'память старого этажа тоже записана (до сборки нового)');
  // (в) Expired-память (day − lastVisitDay > dungeon_memory_days) —
  // перегенерация (NOVЫЙ объект; детерминизм — deepEqual, но
  // identity не та).
  const memory3 = new Map();
  memory3.set(key2, { contents: c2, lastVisitDay: 1 });
  const ds1c = withGame(Gf, () => L.makeDungeonState(d1,
    D.generateDungeonContents(d1, hero), '37,-12', { intervalMs: 420 }));
  const next3 = withGame(Gf, () =>
    L.descendFloor(ds1c, Object.assign({ memory: memory3 }, baseCtx)));
  assert.notEqual(next3.contents, c2,
    'expired-память (contentValid false) — перегенерация');
  assert.deepEqual(next3.contents, c2,
    'детерминизм: перегенерация бит-в-бит (тот же сид)');
  // (г) memoryBanned (debug-вход, 000153.01) → null, память НЕ
  // пишется (D12 — контаминация мирового раздела запрещена).
  const dsB = withGame(Gf, () => L.makeDungeonState(d1,
    D.generateDungeonContents(d1, hero), '37,-12', { intervalMs: 420 }));
  dsB.memoryBanned = true;
  const memoryB = new Map();
  assert.equal(withGame(Gf, () =>
    L.descendFloor(dsB, Object.assign({ memory: memoryB }, baseCtx))),
    null, 'memoryBanned → null (D12)');
  assert.equal(memoryB.size, 0,
    'memoryBanned → память НЕ пишется (ни старый, ни новый этаж)');
});

test('N4: L.ascendFloor — подъём (D2/D10): спавн на stairsDown depth−1; живой моб на клетке → entrance (гард); память оставленного этажа записана; depth=1 → null', () => {
  const G = makeNodeGame().G;
  const Gf = makeFloorGame();
  const PX = M.syntheticPixels(8, 8, 128, 128, 128, 255);
  const terrain = M.TERRAIN.GRASS;
  const d1 = D.createDungeon(37, -12, PX, terrain, 1);
  const d2 = D.createDungeon(37, -12, PX, terrain, 2);
  const sd = d1.stairsDown;
  const hero = { totalXp: 7, level: 2 };
  const map = { tileAt: () => ({ terrain }) };
  const player = { x: 37, y: -12 };
  const baseCtx = { map, mapPixels: PX, player, hero, day: 10,
    intervalMs: 420 };
  const key1 = D.dungeonMemoryKey('37,-12', 1);
  const key2 = D.dungeonMemoryKey('37,-12', 2);
  const ds2 = withGame(Gf, () => L.makeDungeonState(d2,
    // 000157.02: { depth: 2 } — канонический вызов для depth=2
    // (review-фикс; на содержимое этажа 2 пинов НЕТ — фикстура).
    D.generateDungeonContents(d2, hero, { depth: 2 }),
    '37,-12', { intervalMs: 420 }));
  // (а) Клетка stairs-down СВОБОДНА → спавн строго на ней.
  const cA = { seed: 123, mobs: [], chests: [], createdAtXp: 0,
    step: 0 };
  const memA = new Map();
  memA.set(key1, { contents: cA, lastVisitDay: 10 });
  const upA = withGame(Gf, () =>
    L.ascendFloor(ds2, Object.assign({ memory: memA }, baseCtx)));
  assert.ok(upA, 'ascendFloor → ds этажа depth−1');
  assert.equal(upA.dg.depth, 1, 'новый этаж — depth−1');
  assert.deepEqual(upA.dg, d1, 'layout этажа 1 — бит-в-бит');
  assert.deepEqual({ x: upA.x, y: upA.y }, sd,
    'спавн — на stairs-down этажа depth−1 (ТЗ п.2)');
  assert.deepEqual(upA.mover.position(), { x: sd.x, y: sd.y },
    'мувер — телепортирован на клетку спавна');
  assert.equal(upA.contents, cA,
    'содержимое этажа 1 — из памяти (тот же live-объект)');
  assert.deepEqual(upA.log, ['Подъём: глубина 1.'],
    'log нового этажа — «Подъём: глубина 1.» (D2)');
  // Память оставленного этажа (2) записана ДО сборки.
  const rec2 = memA.get(key2);
  assert.ok(rec2, 'ключ 37,-12:2 — память оставленного этажа');
  assert.equal(rec2.contents, ds2.contents,
    'contents — LIVE-объект');
  assert.equal(rec2.lastVisitDay, 10, 'lastVisitDay = day');
  // (б) ЖИВОЙ МОБ на клетке stairs-down → спавн на entrance
  // (гард D10; depth−1 = 1 — единственная такая ситуация).
  const cB = { seed: 124,
    mobs: [{ id: 'g0', mobIds: ['wolf'], x: sd.x, y: sd.y,
      level: 1, defeated: false }],
    chests: [], createdAtXp: 0, step: 0 };
  const memB = new Map();
  memB.set(key1, { contents: cB, lastVisitDay: 10 });
  const upB = withGame(Gf, () =>
    L.ascendFloor(ds2, Object.assign({ memory: memB }, baseCtx)));
  assert.ok(upB, 'гард D10 — подъём состоялся (fallback, не крах)');
  assert.equal(upB.dg.depth, 1, 'этаж 1');
  assert.deepEqual({ x: upB.x, y: upB.y }, d1.entrance,
    'гард D10: живой моб на клетке stairsDown → спавн на entrance');
  assert.equal(upB.contents, cB, 'содержимое — та же память');
  // (в) depth=1 → null (этажа выше нет — выход в мир, exit-ветка).
  const ds1 = withGame(Gf, () => L.makeDungeonState(d1, cA, '37,-12',
    { intervalMs: 420 }));
  assert.equal(withGame(Gf, () =>
    L.ascendFloor(ds1, Object.assign({ memory: new Map() }, baseCtx))),
    null, 'depth=1 → null (подъём невозможен)');
});

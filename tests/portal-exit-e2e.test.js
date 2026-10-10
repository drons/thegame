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

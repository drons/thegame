// Задача 000105: вход/выход в город и экран города (подзадача 000052, П1).
//
// Структурные интеграционные тесты: исполняем ВЕСЬ <script>-цепочку из
// index.html в vm-песочнице (паттерн tests/main-visuals.test.js:
// DOM/WebGL/Image-стабы, детерминированный мир — assets/map.png всегда
// onerror → G.generateSeedPixels), ведём героя пешком к входу города /
// пещеры (BFS + keydown + кадры frame(now), как в игре) и проверяем:
//   * enterCity: шаг на входной тайл категории «город» →
//     dungeonState.kind 'city', имя — название_карты каталога,
//     герой остаётся на входном тайле, dungeonUI активен;
//   * layout — от G.Cities.createCityLayout (000104) от ЯКОРЯ
//     (t.buildingAnchor), а не от позиции героя: цель выбирается
//     динамически — многотайловый город, у которого layout от якоря
//     ОТЛИЧАЕТСЯ от layout от входного тайла (иначе сценарий
//     неразличим);
//   * exitCity: шаги ВНУТРИ города (BFS по layout.cells) на
//     layout.exit → состояние снято, герой на входном тайле города,
//     saveNow вызван (localStorage-стаб), ДЕНЬ НЕ проходит
//     (регрессия-фиксатор против переноса clock.event('dungeon'));
//   * подземелье (РЕГРЕССИЯ): kind 'dungeon', имя — DUNGEON_NAMES,
//     на выходе ДЕНЬ ПРОХОДИТ (существующее поведение — взаимный
//     фиксатор с городом);
//   * кадры main.js ПОСЛЕ входа в город не падают (hudUpdate —
//     city-ветка; contents у города null) — HUD показывает
//     заголовок города.
//
// Расширение песочницы относительно main-visuals: 2d-контекст с
// drawCalls — и для ДИНАМИЧЕСКИ созданных canvas (оверлей
// dungeon-ui), и window.localStorage-стаб (наблюдение saveNow).
//
// Мир детерминирован (фикс. сид generateSeedPixels); цели ищутся
// ДИНАМИЧЕСКИ (BFS от спавна, обход групп мобов и входов пещер/
// городов как промежуточных узлов), чтобы пережить будущие
// ре-пины; радиус BFS 600 с явным ассертом-ошибкой сценария.
// Ход безопасен: BFS исключает тайлы групп мобов (startCombat
// остановил бы мир) и входов пещер/городов (авто-вход); внутри
// подземелья путь к выходу выбирается с учётом блуждающих мобов
// (time-expanded BFS — блуждание чистая функция номера шага).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

// Цепочка скриптов — из index.html (не хардкод, паттерн main-visuals).
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));

// Окно «браузера» песочницы.
const VIEW_W = 1280;
const VIEW_H = 720;
// Фиксированное время performance.now (анимации детерминированы;
// кадры frame(now) вызываем с управляемым now, как main-visuals).
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

// --- Снисходительный DOM-элемент. Canvas — с РЕАЛЬНЫМИ width/height
// и getContext('2d') (оверлей dungeon-ui создаёт canvas динамически:
// без 2d-контекса render упадёт на g2.fillStyle) ---

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
      return () => undefined; // неизвестный метод DOM — no-op
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

// --- localStorage-стаб (наблюдение saveNow, src/save.js) ---

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

function bootSandbox() {
  const winListeners = {};
  const raf = [];
  const warns = [];
  const errors = [];
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
  // #game — WebGL (без него main.js уходит в фолбэк-ветку и не стартует);
  // #sprites — 2d со спаем (слой спрайтов).
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
    // documentElement/requestFullscreen не заданы →
    // fullscreen.supported = false → кнопки нет (безопасно).
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
  // Image-стаб (паттерн main-visuals): src ставится ПОСЛЕ onload/onerror.
  // assets/map.png ВСЕГДА onerror → детерминированный фолбэк
  // G.generateSeedPixels (loadMapPixels, main.js); остальные — onload.
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
  };
  vm.createContext(sandbox);
  for (const f of CHAIN) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox,
      { filename: f });
  }
  return {
    sandbox, winListeners, raf, warns, errors,
    gameCanvas, spriteCanvas, hud, storage,
  };
}

// Промывка микротасков (загрузки Image + loadMapPixels().then:
// создание карты, спавн, requestAnimationFrame(frame)).
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
  // frame() main.js — единственный rAF-колбэк после старта; frame
  // пере планирует себя (одна и та же функция), поэтому frameFn
  // валидна на любом моменте. Кадр вызываем ЕЁ (dungeon-ui tick
  // после входа в город/подземелье тоже живёт в rAF, но кадр
  // main.js обязан идти — в нём hudUpdate/цикл дня).
  h.frameFn = h.raf[h.raf.length - 1];
  return h;
}

// --- Ходьба по миру (паттерн walkToMulti, tests/main-visuals.test.js) ---
//
// Каждый шаг — как в игре: keydown(направление) → кадры frame(now)
// по +200 мс, пока игрок фактически не перешёл (tryMove выполняется
// в frame при now−lastMove ≥ stepMs; базовый stepMs = 420 мс —
// глобальные настройки, 000063) → keyup. Кадр делает не более
// ОДНОГО хода — перелёта через целевой тайл быть не может.

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
  for (const fn of h.winListeners['keydown'] || []) fn(e);
  return e;
}

function release(h, e) {
  for (const fn of h.winListeners['keyup'] || []) fn(e);
}

function walkTiles(h, now, tiles) {
  const g = h.sandbox.__game;
  for (const [tx, ty] of tiles) {
    const dx = tx - g.state.player.x, dy = ty - g.state.player.y;
    assert.ok(Math.abs(dx) + Math.abs(dy) === 1, 'BFS: шаг по соседнему тайлу');
    const e = press(h, keydownFor(dx, dy));
    // Лимит 10 кадров = 2 с: закрывает любой интервал шага от
    // MIN_MOVE_INTERVAL_MS (60 мс) и выше.
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
  }
  // Осадочные кадры (глейд мувера и сглаживание камеры завершаются).
  for (let i = 0; i < 4; i++) {
    now += 200;
    h.frameFn(now);
  }
  return now;
}

// BFS по миру до ближайшего тайла с целевым свойством. Промежуточные
// узлы: только passable, БЕЗ групп мобов (шаг = startCombat — мир
// остановится) и БЕЗ входов пещер/городов (шаг = авто-вход — сломает
// протокол; целевой тайл — проверка до исключения).
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
        if (t.hasBuilding
            && (t.building === G.BUILDING_TYPES.CAVE_ENTRANCE
                || t.buildingId != null)) continue;
        next.push({ x: nx, y: ny });
      }
    }
    frontier = next;
  }
  return null;
}

// Городской вход: hasBuilding && buildingId != null && категория
// «город» (каталожная запись, НЕ хардкод id 51..54).
function isCity(G, t) {
  if (!t.hasBuilding || t.buildingId == null) return false;
  const rec = G.getBuilding(t.buildingId);
  return !!rec && rec.категория === 'город';
}

// Многотайловый город, у которого layout от ЯКОРЯ отличается от
// layout от входного тайла (сценарий «якорь, не позиция героя»
// различим): anchor ≠ entrance только у footprint ≥ 2.
function isDistinguishableCity(G, t) {
  if (!isCity(G, t)) return false;
  const fp = G.getBuilding(t.buildingId).размер.ширина;
  if (fp < 2) return false;
  const [ax, ay] = t.buildingAnchor;
  return JSON.stringify(G.Cities.createCityLayout(ax, ay, fp))
      !== JSON.stringify(G.Cities.createCityLayout(t.x, t.y, fp));
}

// BFS внутри города (layout): путь от текущей клетки к layout.exit.
function cityExitPath(dg, from) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const startKey = from.x + ',' + from.y;
  const visited = new Set([startKey]);
  let frontier = [from];
  const prev = new Map();
  while (frontier.length) {
    const next = [];
    for (const cur of frontier) {
      for (const [dx, dy] of DIRS) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (nx < 0 || ny < 0 || nx >= dg.width || ny >= dg.height) continue;
        if (dg.cells[ny * dg.width + nx] !== G_CELL_FLOOR) continue;
        const k = nx + ',' + ny;
        if (visited.has(k)) continue;
        visited.add(k);
        prev.set(k, cur.x + ',' + cur.y);
        if (nx === dg.exit.x && ny === dg.exit.y) {
          const steps = [];
          let kk = k;
          while (kk !== startKey) {
            const [px, py] = kk.split(',').map(Number);
            steps.unshift([px, py]);
            kk = prev.get(kk);
          }
          return steps;
        }
        next.push({ x: nx, y: ny });
      }
    }
    frontier = next;
  }
  return null;
}
const G_CELL_FLOOR = 1; // значение CELL_FLOOR (dungeon.js/cities.js)

// --- Тесты ---

test('город 000105: вход — шаг на входной тайл (категория «город») → kind city, имя — название_карты, герой на входном тайле', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findNearest(G, myMap, g.state.player, (t) => isCity(G, t));
  assert.ok(found,
    'сценарий: город достижим пешком от спавна (BFS, мир детерминирован)');
  const rec = G.getBuilding(found.t.buildingId);
  assert.equal(rec.категория, 'город', 'сценарий: цель — категория «город»');
  walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg,
    'после шага на входной тайл — dungeonState установлена (экран города)');
  assert.equal(dg.kind, 'city', 'dungeonState.kind === «city»');
  assert.equal(dg.name, rec.особые_параметры.название_карты,
    'имя города — название_карты каталога');
  assert.equal(G.dungeonUI.isActive(), true, 'dungeonUI активен (режим города)');
  assert.deepEqual({ x: g.state.player.x, y: g.state.player.y },
    found.target, 'мировой герой остаётся на входном тайле города');
});

test('город 000105: layout — от createCityLayout(якорь, footprint), а не от позиции героя; width = cityLayoutSize(footprint)', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findNearest(G, myMap, g.state.player, (t) => isDistinguishableCity(G, t));
  assert.ok(found,
    'сценарий: достижим многотайловый город, у которого layout от якоря '
    + 'отличается от layout от входного тайла');
  const [ax, ay] = found.t.buildingAnchor;
  assert.ok(ax !== found.target.x || ay !== found.target.y,
    'предусловие: якорь ≠ тайл входа (многотайловый город)');
  walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg, 'в городе');
  const rec = G.getBuilding(found.t.buildingId);
  const fp = rec.размер.ширина;
  const L = G.Cities.createCityLayout(ax, ay, fp);
  const Lhero = G.Cities.createCityLayout(found.target.x, found.target.y, fp);
  assert.notEqual(JSON.stringify(L), JSON.stringify(Lhero),
    'сценарий: для этого якоря layout от якоря ≠ layout от позиции героя');
  assert.equal(dg.width, L.width, 'width = createCityLayout(якорь).width');
  assert.equal(dg.height, L.height, 'height = createCityLayout(якорь).height');
  for (let i = 0; i < L.cells.length; i++) {
    assert.equal(dg.cells[i], L.cells[i], 'cells[' + i + '] = layout.cells');
  }
  assert.equal(dg.entrance.x, L.entrance.x, 'entrance.x = layout.entrance');
  assert.equal(dg.entrance.y, L.entrance.y, 'entrance.y = layout.entrance');
  assert.equal(dg.exit.x, L.exit.x, 'exit.x = layout.exit');
  assert.equal(dg.exit.y, L.exit.y, 'exit.y = layout.exit');
  assert.equal(dg.x, L.entrance.x, 'первая клетка героя — layout.entrance (x)');
  assert.equal(dg.y, L.entrance.y, 'первая клетка героя — layout.entrance (y)');
  assert.equal(dg.width, G.Cities.cityLayoutSize(fp),
    'width = cityLayoutSize(размер.ширина)');
});

test('город 000105: выход — шаг на layout.exit → состояние снято, герой на входном тайле, saveNow, ДЕНЬ НЕ проходит', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  // Многотайловый город: внутри — реальный путь к выходу (BFS),
  // а не один шаг вырожденного хутора.
  const found = findNearest(G, myMap, g.state.player, (t) => isCity(G, t)
    && G.getBuilding(t.buildingId).размер.ширина >= 2);
  assert.ok(found, 'сценарий: достижимый многотайловый город');
  const tiles = found.steps;
  let now = walkTiles(h, NOW, tiles.slice(0, -1));
  // День/шаги ДО входного шага (сравнение после выхода — «день не
  // проходит»: единственный мировой шаг между ними — вход).
  const day0 = g.state.day;
  const steps0 = g.state.stepsToday;
  walkTiles(h, now, [tiles[tiles.length - 1]]);
  const dg = g.dungeon;
  assert.ok(dg, 'в городе');
  assert.equal(dg.kind, 'city');
  // saveNow: входной мировой шаг уже записал сейв — УДАЛЯЕМ его.
  // Внутри города saveNow не вызывает НИКАКОЙ другой путь (frame
  // сейвит только при мировом шаге, а внутри города мировых шагов
  // нет): если запись появится после выхода — это exitCity.
  delete h.storage.store['phlogiston.save'];
  // Шаги ВНУТРИ города — keydown'ами (dungeon-ui onMove → cityMove,
  // синхронно; мировой listener гасится гардом dungeonUI.isActive).
  const exitPath = cityExitPath(dg, { x: dg.x, y: dg.y });
  assert.ok(exitPath && exitPath.length > 0,
    'город: путь от входа к layout.exit существует (BFS по cells)');
  for (const [tx, ty] of exitPath) {
    const e = press(h, keydownFor(tx - g.dungeon.x, ty - g.dungeon.y));
    release(h, e);
    if (g.dungeon) {
      assert.equal(g.dungeon.x, tx, 'шаг внутри города: x');
      assert.equal(g.dungeon.y, ty, 'шаг внутри города: y');
    }
  }
  assert.equal(g.dungeon, null, 'после шага на exit — состояние снято');
  assert.equal(G.dungeonUI.isActive(), false, 'dungeonUI закрыт');
  assert.deepEqual({ x: g.state.player.x, y: g.state.player.y },
    found.target, 'герой — на входном тайле города (как при выходе из пещеры)');
  // ДЕНЬ (регрессия-фиксатор): город НЕ тратит день. Единственный
  // мировой шаг между day0/steps0 и выходом — входной; смена дня
  // допустима ТОЛЬКО как натуральный перенос счётчика шагов.
  const perDay = G.GlobalSettings.SETTINGS.steps_per_day;
  if (steps0 + 1 < perDay) {
    assert.equal(g.state.day, day0,
      'вход/выход из города НЕ меняют день (clock.event не переносится)');
    assert.equal(g.state.stepsToday, steps0 + 1,
      'ровно ОДИН мировой шаг (вход); шаги города мир не тикают');
  } else {
    assert.equal(g.state.day, day0 + 1,
      'смена дня — только от шагов мира (перенос счётчика)');
    assert.equal(g.state.stepsToday, (steps0 + 1) % perDay,
      'счётчик шагов — перенос, как в addStep');
  }
  // saveNow (exitCity): запись УДАЛЕНА после входа появилась снова —
  // вызвал exitCity; позиция — входной тайл; день — текущий.
  const saveText = h.storage.store['phlogiston.save'];
  assert.ok(saveText,
    'exitCity: saveNow вызван (сейв, удалённый после входа, появился после выхода)');
  const save = JSON.parse(saveText);
  assert.deepEqual(save.data.position,
    { x: found.target.x, y: found.target.y },
    'сейв: позиция — входной тайл города');
  assert.equal(save.data.day, g.state.day,
    'сейв: день — текущий (день не прошёл)');
});

test('подземелье 000105 (регрессия): kind dungeon, имя — DUNGEON_NAMES[type]; выход — состояние снято, ДЕНЬ проходит', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findNearest(G, myMap, g.state.player,
    (t) => t.hasBuilding && t.building === G.BUILDING_TYPES.CAVE_ENTRANCE);
  assert.ok(found, 'сценарий: пещера достижима пешком от спавна');
  walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg, 'после шага на тайл пещеры — dungeonState');
  assert.equal(dg.kind, 'dungeon',
    'dungeonState.kind === «dungeon» (подземный путь без изменений)');
  assert.equal(dg.name, G.DUNGEON_NAMES[dg.type],
    'имя — DUNGEON_NAMES[type] (как раньше)');
  assert.equal(G.dungeonUI.isActive(), true, 'dungeonUI активен');
  assert.deepEqual({ x: g.state.player.x, y: g.state.player.y },
    found.target, 'герой — на тайле пещеры');
  // Реконструкция подземелья и содержимого (чистые детерминированные
  // функции; те же аргументы, что main.js: тайл, пиксели фолбэка,
  // новый герой с totalXp = 0) — чтобы учесть блуждающих мобов при
  // выборе пути к выходу.
  const d2 = G.createDungeon(found.target.x, found.target.y,
    G.generateSeedPixels(), found.t.terrain);
  assert.equal(d2.width, dg.width, 'реконструкция: width');
  assert.equal(d2.height, dg.height, 'реконструкция: height');
  for (let i = 0; i < d2.cells.length; i++) {
    assert.equal(d2.cells[i], dg.cells[i],
      'реконструкция: cells[' + i + '] совпадает с реальным подземельем');
  }
  assert.deepEqual({ x: d2.entrance.x, y: d2.entrance.y },
    { x: dg.entrance.x, y: dg.entrance.y }, 'реконструкция: entrance');
  const c2 = G.generateDungeonContents(d2, G.createCharacter('Флогистон'));
  // Блуждание (G.wanderStep) — ЧИСТАЯ функция номера шага
  // (rng от (step, seed, 0x7777)): таблица занятости предвычисляется.
  // Time-expanded BFS: состояние (клетка, с) — с шагов сделано;
  // переход (А, с) → (В, с+1): В — FLOOR и (В ≠ exit и в В нет
  // моба ДО шага с+1).
  const MAXS = 400;
  const occ = [];
  for (let s = 0; s < MAXS; s++) {
    occ.push(new Set(c2.mobs.filter((m) => !m.defeated)
      .map((m) => m.x + ',' + m.y)));
    G.wanderStep(c2, d2);
  }
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const startKey = d2.entrance.x + ',' + d2.entrance.y + ':0';
  const seen = new Set([startKey]);
  const par = new Map();
  const q = [[d2.entrance.x, d2.entrance.y, 0]];
  let exitAt = null;
  while (q.length && exitAt == null) {
    const [x, y, s] = q.shift();
    if (s >= MAXS) continue;
    if (x === d2.exit.x && y === d2.exit.y) { exitAt = s; break; }
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= d2.width || ny >= d2.height) continue;
      if (d2.cells[ny * d2.width + nx] !== G_CELL_FLOOR) continue;
      if (!(nx === d2.exit.x && ny === d2.exit.y)
          && occ[s].has(nx + ',' + ny)) continue;
      const k = nx + ',' + ny + ':' + (s + 1);
      if (seen.has(k)) continue;
      seen.add(k);
      par.set(k, x + ',' + y + ':' + s);
      q.push([nx, ny, s + 1]);
    }
  }
  assert.ok(exitAt != null,
    'подземелье: путь от входа к выходу в обход блуждающих мобов есть');
  const pathKeys = [];
  let kk = d2.exit.x + ',' + d2.exit.y + ':' + exitAt;
  while (kk != null) {
    pathKeys.unshift(kk);
    kk = par.get(kk);
  }
  const dayBefore = g.state.day;
  for (let i = 1; i < pathKeys.length; i++) {
    const [pc, sc] = pathKeys[i - 1].split(':');
    const [cc, cs] = pathKeys[i].split(':');
    void sc; void cs;
    const [px, py] = pc.split(',').map(Number);
    const [cx, cy] = cc.split(',').map(Number);
    const e = press(h, keydownFor(cx - px, cy - py));
    release(h, e);
    assert.equal(G.combatUI.isActive(), false,
      'боев на пути нет (мобы обойдены): шаг ' + i);
    if (g.dungeon) {
      assert.equal(g.dungeon.x, cx, 'шаг в подземелье: x');
      assert.equal(g.dungeon.y, cy, 'шаг в подземелье: y');
    }
  }
  assert.equal(g.dungeon, null, 'после шага на exit — состояние снято');
  assert.equal(G.dungeonUI.isActive(), false, 'dungeonUI закрыт');
  assert.equal(g.state.day, dayBefore + 1,
    'подземелье: на выходе ДЕНЬ проходит (clock.event — существующее)');
  assert.equal(g.state.stepsToday, 0, 'event() — счётчик шагов сброшен');
});

test('город 000105: кадры main.js после входа не падают; HUD — заголовок города и «До выхода»', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findNearest(G, myMap, g.state.player, (t) => isCity(G, t));
  assert.ok(found, 'сценарий: город достижим пешком от спавна');
  const rec = G.getBuilding(found.t.buildingId);
  let now = walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg, 'в городе');
  // Кадры main.js (frame → buildFrame/drawSprites/hudUpdate) ПОСЛЕ
  // входа в город обязаны не падать: contents у города null —
  // hudUpdate обязан развести подземную ветку по kind.
  for (let i = 0; i < 3; i++) {
    now += 16;
    h.frameFn(now);
  }
  const text = h.hud.textContent;
  assert.ok(text.includes('--- ' + rec.особые_параметры.название_карты
      + ' (' + dg.x + ', ' + dg.y + ') ---'),
    'HUD: заголовок города «--- <имя> (x, y) ---»: ' + JSON.stringify(text));
  assert.ok(text.includes('До выхода: ~'),
    'HUD: «До выхода: ~N клеток»');
  assert.ok(!text.includes('undefined'),
    'HUD: без «undefined» (у города нет DUNGEON_NAMES[type])');
});

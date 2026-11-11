// Задача 000344: туман подземелья — ОДИН квад с explored-mask текстурой
// (RENDER-OPTIMIZE §5G, подход G2). ТЗ: tasks/pending/000344.md.
//
// Контракт реализации (путь (б) анализа — экранная bake-маска):
//   затемнение mask==1 печатается ТЕМ ЖЕ циклом fillRect(FOG_DIM_FILL)
//   по cellRect (snappedTileRect) в OFFSCREEN-канвас размера вьюпорта,
//   пересборка — только по изменению ключа
//   (d, cam.x, cam.y, zoom, w, h, pos.x, pos.y, R, explored.size);
//   в кадр — РОВНО ОДИН drawImage(bake, 0, 0) на слой (после контуров,
//   ПЕРЕД игроком — коммент 000136). Бит-в-бит прежнему per-cell циклу:
//   тот же цикл, те же ря, тот же порядок, source-over 1:1 целое
//   смещение == прямой blend (premul-эквивалентность —
//   memory/000344-dungeon-fog-mask.md).
//   dim==0 → bake-канвас НЕ создаётся, drawImage НЕТ (ленивое создание
//   — пин CC-6 «16 чанков»). Город (isCity) — прохода нет.
//
// Харнес: пиксельного симулятора в tests/ НЕТ — ассерты по
// ПОСЛЕДОВАТЕЛЬНОСТИ ВЫЗОВОВ над per-canvas Proxy-стабом (паттерн
// tests/dungeon-vision.test.js:93-136): bake-канвас вне дерева body,
// доступен как c[1][0] fog-drawImage на main-канвасе; его .drawCalls
// — содержимое маски. Золотые ожидания — НЕ сравнение со старой
// версией, а независимая пересборка из чистого ядра:
// G.dungeonUI.vision.maskFor + G.visibleTileRange + G.snappedTileRect
// (тот контракт геометрии, что пинуют TS-9/TS-12 и FOG-A).
//
// КРАСНЫЕ до реализации (осмысленные ERR_ASSERTION, без краха загрузки):
//   FOGM-1: main-канвас содержит fillRect(FOG_DIM_FILL) (цикл на месте),
//     fog-drawImage нет (0), bake-канваса нет;
//   FOGM-2 (steady): bake нет → delta/идентичность не вычислимы, 1
//     drawImage/кадр — нет;
//   FOGM-3 (шаг → ровно 1 пересборка): bake нет;
//   FOGM-4 (игрок не затемнён — контент bake + порядок квада): bake нет.
//   FOGM-5 (город — 0 затемнений) — зелёный и до правки (регрессионный
//     guard прохода).
//
// Песочница: самокопия harness'а tests/dungeon-vision.test.js (+
// учёт createElement-канвасов, паттерн chunkCanvasesOf в
// tests/chunk-render.test.js) — каждый тест-файл автономен.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const VW = 800, VH = 600;
const FOG_DIM_FILL = 'rgba(10, 13, 18, 0.65)'; // контракт 000136 D8

// --- Минимальный DOM-стаб (паттерн tests/dungeon-vision.test.js) ---

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

function makeEl(tag) {
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
    addEventListener(type, fn) {
      (this.listeners[type] || (this.listeners[type] = [])).push([fn, null]);
    },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
  };
  if (tag === 'canvas') {
    el.width = 0;
    el.height = 0;
    el.getContext = () => makeContext2d(el);
  }
  return el;
}

function allCanvases(el, out) {
  if (el.tagName === 'canvas') out.push(el);
  for (const ch of el.children || []) allCanvases(ch, out);
  return out;
}
const findCanvas = (el) => allCanvases(el, [])[0];

// rAF НЕ передаём: start() рисует синхронно, кадры — ЯВНЫЕ вызовы
// G.dungeonUI.render(now) (cam не глейдится — детерминизм ря, паттерн
// CC-6 в tests/chunk-render.test.js).
function loadDungeonUi() {
  const errors = [];
  const createdCanvases = new Set(); // bake-канвасы видны отсюда
  const document = {
    createElement: (tag) => {
      const el = makeEl(tag);
      if (tag === 'canvas') createdCanvases.add(el);
      return el;
    },
    body: makeEl('body'),
  };
  const window = {
    innerWidth: VW,
    innerHeight: VH,
    addEventListener() {},
  };
  const sandbox = {
    console: { error: (m) => errors.push(String(m)) },
    document, window,
  };
  vm.createContext(sandbox);
  const chain = ['global-settings.js', 'perlin.js', 'map.js', 'controls.js',
    'dungeon.js', 'dungeon-ui.js', 'motion.js'];
  for (const f of chain) vm.runInContext(src(f), sandbox, { filename: f });
  return { G: sandbox.Game, body: document.body, errors, createdCanvases };
}

// --- Состояние (форма main.js, паттерн makeState 000136) ---

function makeState(opts = {}) {
  const w = opts.width || 5;
  const h = opts.height || 5;
  const cells = new Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const wall = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      cells[y * w + x] = wall ? 0 : 1;
    }
  }
  return {
    dg: {
      type: 0, width: w, height: h, cells,
      entrance: { x: 1, y: 1 },
      exit: { x: 1, y: 1 },
    },
    contents: { chests: [], mobs: [], deposits: [] },
    x: opts.px != null ? opts.px : 1,
    y: opts.py != null ? opts.py : 1,
    log: ['простая пещера: вход.'],
  };
}

// --- Зеркала формул реализаци (ТЕСТ считает ожидания САМ) ---

// clampCam (dungeon-ui.js, 000136): вьюпорт покрывает сетку — центр.
function clampCam(c, extent, viewPx, z) {
  if (extent * z <= viewPx) return extent / 2;
  const lo = viewPx / 2 / z, hi = extent - viewPx / 2 / z;
  return Math.min(hi, Math.max(lo, c));
}

// viewport-диапазон render: visibleTileRange, обрезка по границам.
function viewRange(G, camX, camY, zoom, d) {
  const r = G.visibleTileRange(camX, camY, VW, VH, zoom);
  return {
    x0: Math.max(0, r.x0), x1: Math.min(d.width - 1, r.x1),
    y0: Math.max(0, r.y0), y1: Math.min(d.height - 1, r.y1),
  };
}

// Золотые ря затемнения кадра: ядро 000136 (maskFor) + та же снап-сетка
// (G.snappedTileRect, 000215), порядок обхода — y-старший (цикл
// реализаци). exploredHere — explored ДО union этого кадра.
function goldenDimRects(G, d, camX, camY, zoom, exploredHere, pos, R) {
  const mask = G.dungeonUI.vision.maskFor(d.width, d.height,
    pos.x, pos.y, R, exploredHere);
  const rg = viewRange(G, camX, camY, zoom, d);
  const rects = [];
  for (let y = rg.y0; y <= rg.y1; y++) {
    for (let x = rg.x0; x <= rg.x1; x++) {
      if (mask[y * d.width + x] === 1) {
        rects.push(G.snappedTileRect(x, y, camX, camY, zoom, VW, VH));
      }
    }
  }
  return rects;
}

// Union этого кадра: explored += {mask == 2} (ядро, весь w·h).
function unionVisible(explored, mask2) {
  for (const k of mask2) explored.add(k);
}
function visibleKeys(G, d, pos, R) {
  const m = G.dungeonUI.vision.maskFor(d.width, d.height, pos.x, pos.y,
    R, null);
  const out = [];
  for (let i = 0; i < m.length; i++) {
    if (m[i] === 2) out.push((i % d.width) + ',' + Math.floor(i / d.width));
  }
  return out;
}

// --- Сцена: start + ручные кадры; модель explored зеркалит контракт ---

function fogScene(opts) {
  const loaded = loadDungeonUi();
  const { G } = loaded;
  const s = makeState(opts.stateOpts || {});
  const extraR = { v: opts.extraR0 || 0 };
  const startOpts = { state: s, onMove() {}, zoom: opts.zoom };
  if (opts.liveRadius) {
    // visionRadiusFloor — live-функция (контракт 000136 FOG-B4): R =
    // radiusFor(1) + floor; меняем БЕЗ перезахода (инвалидация по R).
    startOpts.visionRadiusFloor = () => extraR.v;
  }
  G.dungeonUI.start(startOpts);
  const main = findCanvas(loaded.body);
  const d = s.dg;
  // Камера — снап start (render вручную её не двигает; глейд — step).
  const cam = {
    x: clampCam(s.x + 0.5, d.width, VW, opts.zoom),
    y: clampCam(s.y + 0.5, d.height, VH, opts.zoom),
  };
  const sc = {
    G, s, d, cam, zoom: opts.zoom, main, extraR,
    errors: loaded.errors, createdCanvases: loaded.createdCanvases,
    explored: new Set(), // explored ДО кадра 0 — пуст (start: new Set)
    bake: null, // bake-элемент после первого непустого dim
    t: 1000,
    mainLen: main.drawCalls.length,
    bakeLen: 0,
  };
  sc.R = () => G.dungeonUI.vision.radiusFor(1) + extraR.v;
  sc.frame = (dx, dy) => {
    if (dx !== undefined) { s.x = dx; s.y = dy; }
    sc.t += 16;
    const before = sc.mainLen;
    G.dungeonUI.render(sc.t);
    const slice = main.drawCalls.slice(before);
    sc.mainLen = main.drawCalls.length;
    const R = sc.R();
    const expected = goldenDimRects(G, d, cam.x, cam.y, sc.zoom,
      sc.explored, { x: s.x, y: s.y }, R);
    unionVisible(sc.explored, visibleKeys(G, d, { x: s.x, y: s.y }, R));
    // fog-drawImage: источник — НЕ спрайт ({__img} нет), т.е. канвас.
    const fog = slice.filter((c) => c[0] === 'drawImage'
      && c[1][0] && typeof c[1][0].__img !== 'string');
    let bakeSlice = [];
    if (fog.length) {
      const el = fog[0][1][0];
      if (!sc.bake) { sc.bake = el; sc.bakeLen = 0; }
      bakeSlice = el.drawCalls.slice(sc.bakeLen);
      sc.bakeLen = el.drawCalls.length;
    }
    return { slice, expected, fog, bakeSlice, R };
  };
  return sc;
}

// Ассерт одного кадра контракта: main — 0 fillRect FOG; ря — РОВНО 1
// drawImage(bake,0,0) (если dim есть) с золотым содержимым bake;
// dim==0 — ни drawImage, ни новых канвасов.
function assertFrame(sc, f, label) {
  assert.equal(f.slice.filter((c) => c[0] === 'fillRect'
    && c[2] === FOG_DIM_FILL).length, 0,
    label + ': на main-канвасе fillRect(' + FOG_DIM_FILL + ') === 0 — '
    + 'затемнение запечено, в кадр идёт один drawImage (000344)');
  if (f.expected.length === 0) {
    assert.equal(f.fog.length, 0,
      label + ': dim пуст → fog-drawImage НЕТ (ленивый skip)');
    return;
  }
  assert.equal(f.fog.length, 1,
    label + ': ровно ОДИН fog-drawImage вместо ' + f.expected.length
    + ' fillRect (факт: ' + f.fog.length + ')');
  const bake = f.fog[0][1][0];
  assert.ok(sc.createdCanvases.has(bake),
    label + ': источник fog-drawImage — offscreen-канвас (createElement)');
  assert.deepEqual(f.fog[0][1].slice(1), [0, 0],
    label + ': drawImage(bake, 0, 0) — 1:1 без растяжения (бит-в-бит)');
  assert.equal(bake.width, VW, 'bake — канвас размера вьюпорта (width)');
  assert.equal(bake.height, VH, 'bake — канвас размера вьюпорта (height)');
  // Порядок пересборки: clearRect, затем золотые ря (y-старший обход).
  assert.equal(f.bakeSlice[0][0], 'clearRect',
    label + ': пересборка маски начинается с clearRect');
  const dimRows = f.bakeSlice.filter((c) => c[0] === 'fillRect')
    .map((c) => {
      assert.equal(c[2], FOG_DIM_FILL,
        label + ': на bake-канвасе fillRect — ТОЛЬКО FOG_DIM_FILL');
      return c[1];
    });
  assert.deepEqual(dimRows,
    f.expected.map((r) => [r.x, r.y, r.w, r.h]),
    label + ': ря затемнения bake == золотые snappedTileRect(mask==1) '
    + 'в порядке обхода (golden parity, ' + f.expected.length + ' ря)');
}

// =====================================================================
// FOGM-1 (3a): золотой паритет на серии сцен + зум-коридор §5.1(G2)
// =====================================================================

test('туман FOGM-1: золотой паритет — кадр затемнения == ОДИН drawImage bake с ря == snappedTileRect(mask==1); сцены: explored пуст/частично/полностью, граничные клетки viewport, зум-коридор 46.296/57.6/66.667/80/96/115.2 (000344)', () => {
  // Коридор: 13×13 (не влезает в вьюпорт ни на одном зуме коридора
  // кроме x-оси низких — cam клампится per-axis, зеркало clampCam),
  // кадр 0 — explored пуст (dim 0, bake НЕ создаётся), кадр 1 — шаг
  // в противоположный угол (V1∩V2 = пуст → dim = V1 ∩ viewport).
  for (const zoom of [46.296, 57.6, 66.667, 80, 96, 115.2]) {
    const sc = fogScene({ zoom, stateOpts: { width: 13, height: 13 } });
    assert.equal(sc.errors.length, 0,
      'zoom ' + zoom + ': ошибок нет: ' + JSON.stringify(sc.errors));
    // Кадр 0 (синхронный start) — explored пуст → dim 0: bake НЕТ.
    const f0 = sc.frame(1, 1);
    assertFrame(sc, f0, 'zoom ' + zoom + ', кадр 0 (explored пуст)');
    assert.equal(sc.createdCanvases.size, 1,
      'zoom ' + zoom + ': dim пуст → bake-канвас НЕ создан (ленивое '
      + 'создание, CC-6 «16 чанков» жив); факт: '
      + sc.createdCanvases.size);
    // Анти-вакуум дробных зумов: сырая проекция дробная (иначе тест
    // проходил бы «вхолостую» на целых ря, паттерн TS-12). 80/96 —
    // целые зум; на 96 обе оси клампятся в cam·zoom == viewPx/2
    // (сырая проекция целочисленна триивиально) — анти-вакуум несут
    // 46.296/57.6/66.667/115.2.
    if (zoom === 46.296 || zoom === 57.6 || zoom === 66.667
        || zoom === 115.2) {
      const raw = sc.G.worldToScreen(3, 4, sc.cam.x, sc.cam.y, zoom, VW, VH);
      assert.ok(!Number.isInteger(raw.x) || !Number.isInteger(raw.y),
        'zoom ' + zoom + ': анти-вакуум — сырая проекция дробная: '
        + raw.x + ',' + raw.y);
      // Тот же ря — снапнутый: край целый (снап-сетка 000215).
      const sn = sc.G.snappedTileRect(3, 4, sc.cam.x, sc.cam.y, zoom,
        VW, VH);
      assert.ok(Number.isInteger(sn.x) && Number.isInteger(sn.w),
        'zoom ' + zoom + ': снап-края целые: ' + sn.x + '+' + sn.w);
    }
    // Кадр 1 — частичное explored: шаг (1,1) → (11,11).
    const f1 = sc.frame(11, 11);
    assert.ok(f1.expected.length > 0,
      'zoom ' + zoom + ': сценарий — dim непуст (частичное explored): '
      + f1.expected.length);
    assertFrame(sc, f1, 'zoom ' + zoom + ', кадр 1 (частично explored)');
    // Граничные клетки viewport: в диапазоне есть клетки у границ
    // вьюпорта/сетки — паритет ря уже покрыт deepEqual; здесь пин,
    // что bake-прямоугольники лежат НА снап-сетке (целые края).
    for (const row of f1.bakeSlice.filter((c) => c[0] === 'fillRect')) {
      for (const v of row[1]) {
        assert.ok(Number.isInteger(v),
          'zoom ' + zoom + ': край ря целый (снап-сетка 000215): ' + v);
      }
    }
  }
});

test('туман FOGM-1b: полное explored (visionRadiusFloor live: 20 → 0) — dim = ВСЕ клетки вне окна; грань viewport включена (000344)', () => {
  const sc = fogScene({
    zoom: 57.6,
    stateOpts: { width: 9, height: 9 },
    liveRadius: true, extraR0: 20,
  });
  // Кадр 0: R = 25 — вся сетка видима → explored = 81, dim 0.
  const f0 = sc.frame(1, 1);
  assertFrame(sc, f0, 'полное explored, кадр 0 (R=25)');
  assert.equal(sc.explored.size, 81,
    'сценарий: R=25 — исследованы ВСЕ 81 клетки 9×9');
  // Кадр 1: R = 5 (радиус live-функция упала) — dim = cheb((1,1)) > 5.
  sc.extraR.v = 0;
  const f1 = sc.frame(1, 1);
  assert.equal(f1.expected.length, 32,
    'сценарий: 81 explored − 49 в окне (0..6)² = 32 ря (факт: '
    + f1.expected.length + ')');
  assertFrame(sc, f1, 'полное explored, кадр 1 (R=5)');
  // Изменение R — инвалидация маски (пересборка: clearRect в bakeSlice
  // уже проверен assertFrame).
});

test('туман FOGM-1c: граничные клетки viewport — 25×25 @ 40 с зажатой камерой (10, 7.5), ря у краёв диапазона запинаются так же (000344)', () => {
  const sc = fogScene({
    zoom: 40, stateOpts: { width: 25, height: 25 },
  });
  assert.equal(sc.cam.x, 10, 'сценарий: камера зажата (10, 7.5) (FOG-B)');
  assert.equal(sc.cam.y, 7.5, 'сценарий: камера зажата (10, 7.5)');
  const f0 = sc.frame(1, 1);
  assertFrame(sc, f0, 'края, кадр 0');
  const f1 = sc.frame(8, 1);
  assert.ok(f1.expected.length > 0, 'сценарий: dim есть');
  assertFrame(sc, f1, 'края, кадр 1');
  // Правый край viewport-диапазона (x=20: ря 800..840 — вне вьюпорта,
  // диапазон 0..20 по контракту FOG-B): клип делает канвас, а не цикл
  // — золотой deepEqual выше считает ря по тому же range. Пин:
  // дальняя граница входит в диапазон и её снап-ря целая/за краем.
  const rg = viewRange(sc.G, sc.cam.x, sc.cam.y, 40, sc.d);
  assert.equal(rg.x1, 20, 'сценарий: правый край диапазона x=20');
  const p = sc.G.snappedTileRect(20, 1, sc.cam.x, sc.cam.y, 40, VW, VH);
  assert.ok(Number.isInteger(p.x) && p.x >= VW,
    'клетка x=20 — снап-ря за правым краем вьюпорта (клипает канвас): '
    + p.x);
});

// =====================================================================
// FOGM-2 (3b): steady-кадр — 0 пересборок, РОВНО 1 drawImage
// =====================================================================

test('туман FOGM-2: steady-кадр без изменения explored — 0 пересборок маски (тот же bake-канвас ===, 0 новых записей) и РОВНО 1 drawImage вместо N fillRect (000344)', () => {
  const sc = fogScene({
    zoom: 57.6, stateOpts: { width: 9, height: 9 },
  });
  sc.frame(1, 1); // explored = V(1,1)
  const f1 = sc.frame(7, 7); // dim есть, bake создан
  assert.ok(f1.expected.length > 0, 'сценарий: dim есть после шага');
  const bake1 = sc.bake;
  const len1 = bake1.drawCalls.length;
  let canvases = sc.createdCanvases.size;
  // Два steady-кадра: тот же pos/R/cam/explored.
  for (const k of [2, 3]) {
    const f = sc.frame(); // pos не меняется
    assert.equal(f.fog.length, 1,
      'steady-кадр ' + k + ': ровно 1 drawImage/кадр');
    assert.equal(f.fog[0][1][0], bake1,
      'steady-кадр ' + k + ': ТОТ ЖЕ bake-канвас (===) — без пересоздания');
    assert.equal(bake1.drawCalls.length, len1,
      'steady-кадр ' + k + ': 0 пересборок — ни clearRect, ни fillRect '
      + 'на bake (факт: +' + (bake1.drawCalls.length - len1) + ')');
    assert.equal(sc.createdCanvases.size, canvases,
      'steady-кадр ' + k + ': новых канвасов нет');
    assert.equal(f.slice.filter((c) => c[0] === 'fillRect'
      && c[2] === FOG_DIM_FILL).length, 0,
      'steady-кадр ' + k + ': main без FOG fillRect');
  }
});

// =====================================================================
// FOGM-3 (3c): изменение explored → ровно 1 пересборка
// =====================================================================

test('туман FOGM-3: изменение explored (шаг игрока) — ровно ОДНА пересборка маски (1 clearRect + золотые ря), тот же bake-канвас, без новых createElement (000344)', () => {
  const sc = fogScene({
    zoom: 57.6, stateOpts: { width: 9, height: 9 },
  });
  sc.frame(1, 1);
  const f1 = sc.frame(7, 7);
  assertFrame(sc, f1, 'шаг 1');
  const bake1 = sc.bake;
  const canvases = sc.createdCanvases.size;
  // Шаг (7,7) → (7,6): explored растёт, dim меняется → 1 пересборка.
  const f2 = sc.frame(7, 6);
  assert.equal(f2.fog.length, 1, 'шаг 2: 1 drawImage');
  assert.equal(f2.fog[0][1][0], bake1, 'шаг 2: пересборка в ТОТ ЖЕ канвас');
  const clears = f2.bakeSlice.filter((c) => c[0] === 'clearRect');
  assert.equal(clears.length, 1,
    'шаг 2: ровно ОДНА пересборка (1 clearRect; факт: '
    + clears.length + ')');
  const rows = f2.bakeSlice.filter((c) => c[0] === 'fillRect');
  assert.deepEqual(rows.map((c) => c[1]),
    f2.expected.map((r) => [r.x, r.y, r.w, r.h]),
    'шаг 2: ря == золото (ровно N fillRect, без наложений)');
  assert.equal(sc.createdCanvases.size, canvases,
    'шаг 2: bake-канвас не пересоздан');
  // Ещё шаг — ещё ровно 1 пересборка (не «накопление»).
  const f3 = sc.frame(6, 6);
  const clears3 = f3.bakeSlice.filter((c) => c[0] === 'clearRect');
  assert.equal(clears3.length, 1,
    'шаг 3: снова ровно 1 пересборка (факт: ' + clears3.length + ')');
});

// =====================================================================
// FOGM-4 (d): игрок не затемнён; квад ПЕРЕД игроком (000136)
// =====================================================================

test('туман FOGM-4: клетка игрока (mask==2) отсутствует в bake; fog-drawImage — ПЕРЕД ромбом игрока (после контуров), порядок 000136 сохранён (000344)', () => {
  const sc = fogScene({
    zoom: 57.6, stateOpts: { width: 9, height: 9 },
  });
  sc.frame(1, 1);
  const f1 = sc.frame(7, 7);
  assert.ok(f1.expected.length > 0, 'сценарий: dim есть');
  const bake = sc.bake;
  // Клетка игрока (7,7) — mask 2 — в bake ря НЕТ.
  const pp = sc.G.snappedTileRect(7, 7, sc.cam.x, sc.cam.y, sc.zoom,
    VW, VH);
  const onPlayer = bake.drawCalls.filter((c) => c[0] === 'fillRect'
    && c[2] === FOG_DIM_FILL)
    .some((c) => Math.abs(c[1][0] - pp.x) < 1e-9
      && Math.abs(c[1][1] - pp.y) < 1e-9);
  assert.ok(!onPlayer,
    'клетка игрока (7,7) — mask==2 — НЕ затемняется (ря в bake нет)');
  // Порядок: fog-drawImage ДО ромба игрока (moveTo #8cf2fc — последний
  // moveTo кадра; спрайтов нет — loader отсутствует).
  const slice = f1.slice;
  let fogIdx = -1, playerIdx = -1;
  for (let i = slice.length - 1; i >= 0; i--) {
    if (playerIdx < 0 && slice[i][0] === 'moveTo') playerIdx = i;
    if (fogIdx < 0 && slice[i][0] === 'drawImage') fogIdx = i;
  }
  assert.ok(playerIdx >= 0, 'ромб игрока в кадре');
  assert.ok(fogIdx >= 0 && fogIdx < playerIdx,
    'fog-drawImage — до игрока в порядке кадра: ' + fogIdx + ' < '
    + playerIdx);
  // Слой контуров (маркер единого тайла #d4b45a — (1,1) explored) —
  // до fog-drawImage (квад ПОСЛЕ всех контурных слоёв).
  const markerIdx = slice.findIndex((c) => c[0] === 'fillRect'
    && c[2] === '#d4b45a');
  assert.ok(markerIdx >= 0 && markerIdx < fogIdx,
    'затемнение — ПОСЛЕ контуров (маркер 000177): ' + markerIdx + ' < '
    + fogIdx);
});

// =====================================================================
// FOGM-5 (e): город — прохода нет
// =====================================================================

test('туман FOGM-5: город (kind=city) — 0 затемнений: ни fog-drawImage, ни fillRect FOG_DIM_FILL, bake-канвас не создан (000344)', () => {
  const loaded = loadDungeonUi();
  const s = makeState({ width: 9, height: 9 });
  s.kind = 'city';
  s.contents = null;
  s.cityContents = null;
  s.name = 'Городок';
  loaded.G.dungeonUI.start({ state: s, onMove() {}, zoom: 40 });
  const main = findCanvas(loaded.body);
  // Пара кадров с «шагом» (explored-логика города не трогает).
  s.x = 4; s.y = 4;
  loaded.G.dungeonUI.render(1016);
  s.x = 7; s.y = 7;
  loaded.G.dungeonUI.render(1032);
  const calls = main.drawCalls;
  assert.equal(calls.filter((c) => c[0] === 'fillRect'
    && c[2] === FOG_DIM_FILL).length, 0,
    'город: fillRect FOG_DIM_FILL === 0');
  assert.equal(calls.filter((c) => c[0] === 'drawImage').length, 0,
    'город: drawImage (fog bake) === 0');
  assert.equal(loaded.createdCanvases.size, 1,
    'город: bake-канвас не создавался (только overlay-canvas); факт: '
    + loaded.createdCanvases.size);
  assert.equal(loaded.errors.length, 0,
    'город: ошибок нет: ' + JSON.stringify(loaded.errors));
});

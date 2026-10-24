// Задача 000258 — автотайлинг кромки стены (вариант A: границу
// «пол–стена» рисует стена; 16 масок N=1/E=2/S=4/W=8 + 4 угловых
// спрайта). RED-тесты (commit ТОЛЬКО тесты; src/ассеты не меняются —
// все 7 тестов падают на неизменённом коде осмысленно: нет
// wallMask/wallTileIndex/wallKindFor в dungeon.js, нет
// WALL_AUTOTILE_NAMES/WALL_AUTOTILES/файлов в sprites.js/каталогах,
// рендер город/подземелье ещё fillRect/wallObjs). Краснота —
// ERR_ASSERTION (typeof/existsSync/drawImage-ассерты), НЕ syntax
// error: vm-цепочка не меняется (нового модуля НЕТ — решения
// memory/000258-wall-autotiling.md §1: функции в существующий
// dungeon.js, таблица-литерал в sprites.js, script-тега нет).
//
// Контракты (memory/000258-wall-autotiling.md):
// * §2 — wallMask (бит = сосед === CELL_FLOOR, за границей = стена),
//   wallTileIndex (m≠0 → m; m=0 + ровно 1 диагональ → 16+k,
//   SE=0/SW=1/NE=2/NW=3; иначе 0), wallKindFor (kind-часть
//   wallObjFor дословно: hash2 + соль 0x5e11c3a7 + каталог).
// * §3 — WALL_AUTOTILE_NAMES (m00..m15, cSE, cSW, cNE, cNW),
//   WALL_AUTOTILES = { city, rock, column, stalactite } × 20,
//   пути ≡ именам, 80 файлов, allAssetPaths +80; старые 6 фасадных
//   SVG (000070) — убраны.
// * §4 — рендер floor-pass: город — wall-клетка ВСЕГДА drawImage
//   WALL_AUTOTILES.city[idx] (fillRect CITY_WALL_VARIANTS — только
//   фолбэк без table/лоадера; здесь — с лоадером → fillRect стен
//   НЕТ, пол остаётся плоским); подземелье — wall-клетка idx≠0 →
//   drawImage WALL_AUTOTILES[kind][idx], слой ПОД мобами/игроком,
//   fog-гейт 000136 (mask === 0 → не рисуется).
//
// expectedRedCount = 7 (AT-1..AT-7). Вместе с
// tests/spec-000258-wording.test.js (W1..W3) — ровно 10 красных.
//
// Значения клеток (ИНВЕРСИЯ, §10): в коде CELL_WALL = 0,
// CELL_FLOOR = 1 (dungeon.js ≡ cities.js) — все биты маски
// «сосед — пол» = cells[ny*W+nx] === CELL_FLOOR.
//
// vm-песочница — паттерн tests/dungeon-ui.test.js loadDungeonUi
// (минимальный DOM-стаб, цепочка по index.html, withSprites =
// sprites.js ДО dungeon-ui.js); кадр — синхронный render() внутри
// start() (без rAF — событийный режим 000043).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const srcOf = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');

const D = require('../src/dungeon.js');
const SP = require('../src/sprites.js');
const CITIES = require('../src/cities.js');
const PERLIN = require('../src/perlin.js');

// Имена 20 плиток стиля (контракт §3): m00..m15 = mask, 16..19 =
// углы cSE/cSW/cNE/cNW (порядок закреплён).
const AT_NAMES = [];
for (let i = 0; i < 16; i++) AT_NAMES.push('m' + String(i).padStart(2, '0'));
AT_NAMES.push('cSE', 'cSW', 'cNE', 'cNW');

// Соль kind-выбора (WALL_KIND_SALT dungeon.js:409 — «сохранился
// дословно», §1): пин ЛИТЕРАЛОМ (паттерн CITY_TILE_SEED_PIN 000105).
const KIND_SALT_PIN = 0x5e11c3a7;
// kind(x, y, d) — независимый пересчёт тестом (каталог — существующий
// экспорт; hash2 — perlin.js).
function kindAt(x, y, type, seed) {
  const kinds = D.DUNGEON_WALL_KINDS[type];
  return kinds[PERLIN.hash2(x, y, KIND_SALT_PIN ^ seed) % kinds.length];
}

// --- vm-песочница (паттерн tests/dungeon-ui.test.js, минимально) ---

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
      (this.listeners[type] || (this.listeners[type] = [])).push(fn);
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

function findCanvas(el) {
  if (el.tagName === 'canvas') return el;
  for (const ch of el.children || []) {
    const found = findCanvas(ch);
    if (found) return found;
  }
  return null;
}

// Цепочка по index.html (порядок tests/dungeon-ui.test.js
// loadDungeonUi); withSprites — sprites.js ДО dungeon-ui.js (opt-in).
function loadUi(opts = {}) {
  const errors = [];
  const document = {
    createElement: (tag) => makeEl(tag),
    body: makeEl('body'),
  };
  const window = {
    innerWidth: 800,
    innerHeight: 600,
    addEventListener() {},
  };
  const sandbox = {
    console: { error: (m) => errors.push(String(m)) },
    document, window,
  };
  if (opts.performance) sandbox.performance = opts.performance;
  vm.createContext(sandbox);
  const chain = ['global-settings.js', 'perlin.js', 'map.js',
    'controls.js', 'dungeon.js', 'locations.js'];
  if (opts.withSprites) chain.push('sprites.js');
  chain.push('dungeon-ui.js', 'motion.js');
  for (const f of chain) vm.runInContext(srcOf(f), sandbox, { filename: f });
  return { G: sandbox.Game, body: document.body, errors };
}

// Лоадер-стаб (контракт createSpriteLoader 000047/000066): image(p) —
// маркер с путём (сверка drawImage по ПУТИ спрайта), isReady — true.
function makeLoader() {
  return { image: (p) => ({ __path: p }), isReady: () => true };
}

// Состояние города — форма main.js enterCity (000105), как
// makeCityState в tests/dungeon-ui.test.js.
function makeCityState(fp, cx, cy, name) {
  const d = CITIES.createCityLayout(cx, cy, fp);
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

// Состояние подземелья — форма main.js (maybeEnterDungeon), как
// makeState в tests/dungeon-ui.test.js: стены по периметру, пол
// внутри. opts: width/height/type/seed/px/py/mobs.
function makeDungeonState(opts = {}) {
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
      type: opts.type != null ? opts.type : 0,
      width: w, height: h, cells,
      entrance: { x: 1, y: 1 },
      exit: { x: 1, y: 1 },
      seed: opts.seed != null ? opts.seed : 2658571374,
    },
    contents: { chests: [], mobs: opts.mobs || [], deposits: [] },
    x: opts.px != null ? opts.px : 1,
    y: opts.py != null ? opts.py : 1,
    log: ['тест: вход.'],
  };
}

// drawImage в ТОЧНЫХ экранных координатах клетки (G.worldToScreen —
// та же формула мир→экран, что рендер; zoom выбран так, что
// snappedTileRect = проекция: cam·zoom — целое).
function findCellDrawImage(calls, G, x, y, zoom, camX, camY) {
  const p = G.worldToScreen(x, y, camX, camY, zoom, 800, 600);
  for (let i = 0; i < calls.length; i++) {
    const c = calls[i];
    if (c[0] === 'drawImage'
        && Math.abs(c[1][1] - p.x) <= 1e-9
        && Math.abs(c[1][2] - p.y) <= 1e-9
        && Math.abs(c[1][3] - zoom) <= 1e-9
        && Math.abs(c[1][4] - zoom) <= 1e-9) {
      return { idx: i, img: c[1][0] };
    }
  }
  return null;
}

function assertWallAt(calls, G, x, y, zoom, camX, camY, expectedPath,
    label) {
  const hit = findCellDrawImage(calls, G, x, y, zoom, camX, camY);
  assert.ok(hit && hit.img && hit.img.__path === expectedPath,
    label + ' (' + x + ',' + y + '): drawImage ' + expectedPath +
    ' на клетке (сейчас ' + (hit && hit.img && hit.img.__path
      ? hit.img.__path : 'нет drawImage') + ')');
  return hit.idx;
}

function assertNoCellDrawImage(calls, G, x, y, zoom, camX, camY,
    prefix, label) {
  const hit = findCellDrawImage(calls, G, x, y, zoom, camX, camY);
  assert.ok(!hit || !hit.img || typeof hit.img.__path !== 'string'
      || hit.img.__path.indexOf(prefix) !== 0,
    label + ' (' + x + ',' + y + '): спрайт ' + prefix + ' НЕ рисуется');
}

// --- AT-1..AT-3: чистое ядро (node) ---

test('000258 AT-1: wallMask — таблица 16 масок (N=1/E=2/S=4/W=8; бит = сосед === CELL_FLOOR)', () => {
  assert.equal(typeof D.wallMask, 'function',
    'dungeon.js: нет экспорта wallMask(cells, W, H, x, y)');
  for (let m = 0; m < 16; m++) {
    const cells = new Array(9).fill(D.CELL_WALL);
    if (m & 1) cells[0 * 3 + 1] = D.CELL_FLOOR; // N (1,0)
    if (m & 2) cells[1 * 3 + 2] = D.CELL_FLOOR; // E (2,1)
    if (m & 4) cells[2 * 3 + 1] = D.CELL_FLOOR; // S (1,2)
    if (m & 8) cells[1 * 3 + 0] = D.CELL_FLOOR; // W (0,1)
    assert.equal(D.wallMask(cells, 3, 3, 1, 1), m,
      'mask ' + m + ': биты N=1/E=2/S=4/W=8 (инверсия: пол = 1)');
  }
});

test('000258 AT-2: wallMask — за границей карты = стена; wallTileIndex — m≠0 → m, m=0 + ровно 1 диагональ → 16+k (SE=0/SW=1/NE=2/NW=3), иначе 0', () => {
  assert.equal(typeof D.wallMask, 'function',
    'dungeon.js: нет экспорта wallMask');
  assert.equal(typeof D.wallTileIndex, 'function',
    'dungeon.js: нет экспорта wallTileIndex');
  const W = D.CELL_WALL;
  const F = D.CELL_FLOOR;
  // 1×1 — все 4 стороны за границей (стена):
  assert.equal(D.wallMask([W], 1, 1, 0, 0), 0,
    '1x1: за границей = стена (биты не ставятся)');
  // 3×1 строка, пол в центре — N/S за границей:
  const row = [W, F, W];
  assert.equal(D.wallMask(row, 3, 1, 0, 0), 2, '3x1: только E');
  assert.equal(D.wallMask(row, 3, 1, 2, 0), 8, '3x1: только W');
  // 1×3 колонна, пол в центре — W/E за границей:
  const col = [W, F, W];
  assert.equal(D.wallMask(col, 1, 3, 0, 0), 4, '1x3: только S');
  assert.equal(D.wallMask(col, 1, 3, 0, 2), 1, '1x3: только N');
  // Углы 3×3 (две стороны за границей):
  const corner = [W, F, W, W, W, W, W, W, W];
  assert.equal(D.wallMask(corner, 3, 3, 0, 0), 2, 'угол (0,0): только E');
  assert.equal(D.wallMask(corner, 3, 3, 2, 0), 8, 'угол (2,0): только W');
  // wallTileIndex: m≠0 — пропуск (диагонали игнорируются):
  assert.equal(D.wallTileIndex(corner, 3, 3, 0, 0), 2, 'm=2 → 2');
  const ndiag = [F, F, F, W, W, W, F, W, F]; // N + 4 диагонали
  assert.equal(D.wallTileIndex(ndiag, 3, 3, 1, 1), 1,
    'm=1 + 4 диагонали → 1 (маска победит угол)');
  // m=0 + ровно ОДНА диагональ — угловой спрайт 16+k:
  const diag = (sx, sy) => {
    const g = new Array(9).fill(W);
    g[sy * 3 + sx] = F;
    return g;
  };
  assert.equal(D.wallTileIndex(diag(2, 2), 3, 3, 1, 1), 16, 'SE → 16');
  assert.equal(D.wallTileIndex(diag(0, 2), 3, 3, 1, 1), 17, 'SW → 17');
  assert.equal(D.wallTileIndex(diag(2, 0), 3, 3, 1, 1), 18, 'NE → 18');
  assert.equal(D.wallTileIndex(diag(0, 0), 3, 3, 1, 1), 19, 'NW → 19');
  // m=0 + 0/≥2 диагонали — 0 («вырез», §2):
  assert.equal(D.wallTileIndex(new Array(9).fill(W), 3, 3, 1, 1), 0,
    '0 диагоналей → 0');
  const two = diag(2, 2); two[0] = F;
  assert.equal(D.wallTileIndex(two, 3, 3, 1, 1), 0, '2 диагонали → 0');
  const four = diag(2, 2); four[0] = F; four[2] = F; four[6] = F;
  assert.equal(D.wallTileIndex(four, 3, 3, 1, 1), 0, '4 диагонали → 0');
});

test('000258 AT-3: wallKindFor — kind-часть wallObjFor дословно (hash2 + соль 0x5e11c3a7 + каталог типа); null — если у типа нет набора', () => {
  assert.equal(typeof D.wallKindFor, 'function',
    'dungeon.js: нет экспорта wallKindFor(x, y, d)');
  const cellsXY = [[0, 0], [1, 0], [0, 1], [3, 7], [12, 12], [24, 3],
    [40, 9]];
  for (const type of [0, 1, 2, 3, 4]) {
    const kinds = D.DUNGEON_WALL_KINDS[type];
    for (const seed of [1, 2658571374, 3328254713]) {
      for (const [x, y] of cellsXY) {
        const expected = kinds[
          PERLIN.hash2(x, y, KIND_SALT_PIN ^ seed) % kinds.length];
        assert.equal(D.wallKindFor(x, y, { type, seed }), expected,
          'type ' + type + ', seed ' + seed + ', (' + x + ',' + y + '): ' +
          'kind-выбор = kind-часть wallObjFor (соль 0x5e11c3a7)');
      }
    }
  }
  assert.equal(D.wallKindFor(1, 1, { type: 99, seed: 5 }), null,
    'тип без набора объектов_стен → null');
});

// --- AT-4: таблица/ассеты (node) ---

test('000258 AT-4: WALL_AUTOTILE_NAMES/WALL_AUTOTILES — 4 стиля × 20, пути ≡ именам, 80 файлов, allAssetPaths +80, старые фасадные SVG (000070) убраны', () => {
  assert.ok(Array.isArray(SP.WALL_AUTOTILE_NAMES),
    'sprites.js: нет экспорта WALL_AUTOTILE_NAMES');
  assert.deepEqual(SP.WALL_AUTOTILE_NAMES, AT_NAMES,
    'порядок 20 имён: m00..m15, cSE, cSW, cNE, cNW');
  assert.ok(SP.WALL_AUTOTILES && typeof SP.WALL_AUTOTILES === 'object',
    'sprites.js: нет экспорта WALL_AUTOTILES');
  const styles = ['city', 'rock', 'column', 'stalactite'];
  assert.deepEqual(Object.keys(SP.WALL_AUTOTILES).slice().sort(),
    styles.slice().sort(),
    'ровно 4 стиля: city + 3 вида объектов_стен');
  const all = new Set(SP.allAssetPaths());
  for (const st of styles) {
    const arr = SP.WALL_AUTOTILES[st];
    assert.ok(Array.isArray(arr) && arr.length === 20,
      st + ': 20 плиток (mask 16 + углы 4)');
    const prefix = st === 'city'
      ? 'assets/city/walls/city_' : 'assets/dungeon/walls/' + st + '_';
    for (let i = 0; i < 20; i++) {
      const p = prefix + AT_NAMES[i] + '.svg';
      assert.equal(arr[i], p, st + '[' + i + ']: путь ≠ имени-паттерна');
      assert.ok(fs.existsSync(path.join(ROOT, p)),
        st + '[' + i + ']: файл отсутствует ' + p);
      assert.ok(all.has(p), st + '[' + i + ']: нет в allAssetPaths');
    }
  }
  for (const old of ['rock_1', 'rock_2', 'column_1', 'column_2',
    'stalactite_1', 'stalactite_2']) {
    assert.ok(!fs.existsSync(path.join(ROOT, 'assets', 'dungeon', 'walls',
      old + '.svg')),
      'старый фасадный SVG ' + old + '.svg (000070) — удалён (замена)');
  }
});

// --- AT-5..AT-7: рендер (vm, withSprites + loader-стаб) ---

test('000258 AT-5: город — стена рисуется спрайтом маски (НЕ fillRect из CITY_WALL_VARIANTS); угловая клетка — угловой спрайт; пол остаётся плоским', () => {
  // 5×5 хутор (ре-пин 000259, layout 000148.01/000259): дверь (3,4)
  // на южном периметре (FLOOR — в масках соседей). Стены: углы
  // (0,0) cSE (16), (4,0) cSW (17), (0,4) cNE (18); (1,0)/(2,0)/
  // (3,0) m04; (0,1)/(0,2)/(0,3) m02; (4,1)..(4,4) m08 ((4,4) —
  // дверь западнее: маска 8, НЕ cNW); (1,4) m01; (2,4) m03 — левее
  // двери (дверь FLOOR — в маске).
  let loaded = loadUi({ performance: { now: () => 1000 },
    withSprites: true });
  let G = loaded.G;
  assert.equal(loaded.errors.length, 0,
    'цепочка с sprites.js чиста на загрузке (load-clean)');
  G.dungeonUI.start({
    state: makeCityState(1, -119, -104, 'Хутор'),
    onMove() {}, zoom: 40, spriteLoader: makeLoader(),
  });
  let calls = findCanvas(loaded.body).drawCalls;
  assertWallAt(calls, G, 0, 0, 40, 2.5, 2.5,
    'assets/city/walls/city_cSE.svg', 'хутор: угол (0,0) cSE (16)');
  assertWallAt(calls, G, 4, 0, 40, 2.5, 2.5,
    'assets/city/walls/city_cSW.svg', 'хутор: угол (4,0) cSW (17)');
  assertWallAt(calls, G, 0, 4, 40, 2.5, 2.5,
    'assets/city/walls/city_cNE.svg', 'хутор: угол (0,4) cNE (18)');
  for (const [x, y] of [[1, 0], [2, 0], [3, 0]])
    assertWallAt(calls, G, x, y, 40, 2.5, 2.5,
      'assets/city/walls/city_m04.svg',
      'хутор: стена (' + x + ',' + y + ') mask 4');
  for (const [x, y] of [[0, 1], [0, 2], [0, 3]])
    assertWallAt(calls, G, x, y, 40, 2.5, 2.5,
      'assets/city/walls/city_m02.svg',
      'хутор: стена (' + x + ',' + y + ') mask 2');
  for (const [x, y] of [[4, 1], [4, 2], [4, 3], [4, 4]])
    assertWallAt(calls, G, x, y, 40, 2.5, 2.5,
      'assets/city/walls/city_m08.svg',
      'хутор: стена (' + x + ',' + y + ') mask 8');
  assertWallAt(calls, G, 1, 4, 40, 2.5, 2.5,
    'assets/city/walls/city_m01.svg', 'хутор: стена (1,4) mask 1');
  assertWallAt(calls, G, 2, 4, 40, 2.5, 2.5,
    'assets/city/walls/city_m03.svg',
    'хутор: левее двери (2,4) mask 3');
  assert.ok(!calls.some((c) => c[0] === 'fillRect'
      && (c[2] === '#77685a' || c[2] === '#66594c')),
    'город: fillRect-стен из CITY_WALL_VARIANTS НЕТ (спрайт маски)');
  // Пол — НЕ меняется: плоский fillRect из CITY_FLOOR_VARIANTS
  // (дверь (3,4) — периметр-FLOOR, ре-пин 000259).
  const pDoor = G.worldToScreen(3, 4, 2.5, 2.5, 40, 800, 600);
  const floorCall = calls.find((c) => c[0] === 'fillRect'
    && Math.abs(c[1][0] - pDoor.x) <= 1e-9
    && Math.abs(c[1][1] - pDoor.y) <= 1e-9);
  assert.ok(floorCall, 'хутор: пол (3,4) дверь — fillRect (не спрайт)');
  assert.ok(['#b3a284', '#a5947a', '#c0b090'].includes(floorCall[2]),
    'городский пол — CITY_FLOOR_VARIANTS (инвариант: пол плоский)');

  // 6×6 город (якорь −40,20 → дверь (3,5), seed 3328254713): четыре
  // угла периметра — mask 0 + ровно одна диагональ → cSE/cSW/cNE/cNW;
  // у стены двери — маски 3/9 (не «ровно {0,1,2,4,8}» — §9).
  loaded = loadUi({ performance: { now: () => 1000 }, withSprites: true });
  G = loaded.G;
  const s2 = makeCityState(2, -40, 20, 'Деревня');
  assert.equal(s2.dg.entrance.x, 3, 'предусловие: дверь (3,5) — углы чистые');
  assert.equal(s2.dg.seed, 3328254713, 'предусловие: seed layout');
  G.dungeonUI.start({
    state: s2, onMove() {}, zoom: 60, spriteLoader: makeLoader(),
  });
  calls = findCanvas(loaded.body).drawCalls;
  assertWallAt(calls, G, 0, 0, 60, 3, 3, 'assets/city/walls/city_cSE.svg',
    '6x6: угол (0,0) cSE (16)');
  assertWallAt(calls, G, 5, 0, 60, 3, 3, 'assets/city/walls/city_cSW.svg',
    '6x6: угол (5,0) cSW (17)');
  assertWallAt(calls, G, 0, 5, 60, 3, 3, 'assets/city/walls/city_cNE.svg',
    '6x6: угол (0,5) cNE (18)');
  assertWallAt(calls, G, 5, 5, 60, 3, 3, 'assets/city/walls/city_cNW.svg',
    '6x6: угол (5,5) cNW (19)');
  assertWallAt(calls, G, 1, 0, 60, 3, 3, 'assets/city/walls/city_m04.svg',
    '6x6: стена (1,0) mask 4');
  assertWallAt(calls, G, 0, 1, 60, 3, 3, 'assets/city/walls/city_m02.svg',
    '6x6: стена (0,1) mask 2');
  assertWallAt(calls, G, 1, 5, 60, 3, 3, 'assets/city/walls/city_m01.svg',
    '6x6: стена (1,5) mask 1');
  assertWallAt(calls, G, 2, 5, 60, 3, 3, 'assets/city/walls/city_m03.svg',
    '6x6: левее двери (2,5) mask 3');
  assertWallAt(calls, G, 4, 5, 60, 3, 3, 'assets/city/walls/city_m09.svg',
    '6x6: правее двери (4,5) mask 9');
  assert.ok(!calls.some((c) => c[0] === 'fillRect'
      && (c[2] === '#77685a' || c[2] === '#66594c')),
    '6x6: fillRect-стен из CITY_WALL_VARIANTS НЕТ');
});

test('000258 AT-6: подземелье — wall с floor-соседом рисуется спрайтом маски (WALL_AUTOTILES[kind][idx]; mask-индекс заменяет kind-выбор фасадного варианта); слой ПОД мобами/игроком', () => {
  const loaded = loadUi({ performance: { now: () => 1000 },
    withSprites: true });
  const G = loaded.G;
  assert.equal(loaded.errors.length, 0,
    'цепочка с sprites.js чиста на загрузке (load-clean)');
  const s = makeDungeonState({
    width: 5, height: 5, type: 0,
    mobs: [{ x: 2, y: 2, level: 5, defeated: false }],
  });
  G.dungeonUI.start({
    state: s, onMove() {}, zoom: 48, spriteLoader: makeLoader(),
  });
  const calls = findCanvas(loaded.body).drawCalls;
  // 5×5: ВСЕ 16 периметрных стен имеют floor-соседа (4 угла —
  // диагональные, idx 16..19) — mask-таблица клетки:
  const expected = {
    '0,0': 16, '1,0': 4, '2,0': 4, '3,0': 4, '4,0': 17,
    '0,1': 2, '0,2': 2, '0,3': 2,
    '4,1': 8, '4,2': 8, '4,3': 8,
    '0,4': 18, '1,4': 1, '2,4': 1, '3,4': 1, '4,4': 19,
  };
  let wallIdx = -1;
  for (const k of Object.keys(expected)) {
    const parts = k.split(',');
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    const idx = expected[k];
    const kind = kindAt(x, y, 0, s.dg.seed);
    const path = 'assets/dungeon/walls/' + kind + '_'
      + AT_NAMES[idx] + '.svg';
    const i = assertWallAt(calls, G, x, y, 48, 2.5, 2.5, path,
      'стена (' + x + ',' + y + ') idx ' + idx);
    wallIdx = wallIdx === -1 ? i : Math.min(wallIdx, i);
  }
  // Слой ПОД мобами (fillRect #d9483b — legacy-группа без mobIds)
  // и ПОД игроком (игрок — последний drawImage кадра).
  const mobIdx = calls.findIndex((c) => c[0] === 'fillRect'
    && c[2] === '#d9483b');
  assert.ok(mobIdx >= 0, 'моб (2,2) нарисован (fillRect #d9483b)');
  assert.ok(wallIdx >= 0 && wallIdx < mobIdx,
    'стеновой слой ПОД мобами (z-порядок 000070 сохранён)');
  let lastDi = -1;
  for (let i = 0; i < calls.length; i++) {
    if (calls[i][0] === 'drawImage') lastDi = i;
  }
  assert.ok(lastDi >= 0, 'игрок — drawImage (спрайт)');
  assert.ok(wallIdx < lastDi, 'стеновой слой ПОД игроком');
});

test('000258 AT-7: подземелье — fog-гейт 000136 на автотайл-стены: видимая стена → спрайт ЕСТЬ, неисследованная → спрайта НЕТ (пол под тем же гейтом — контроль)', () => {
  const loaded = loadUi({ performance: { now: () => 1000 },
    withSprites: true });
  const G = loaded.G;
  assert.equal(loaded.errors.length, 0,
    'цепочка с sprites.js чиста на загрузке (load-clean)');
  // 9×9, игрок (2,2), visionMult 0.6 → R = ceil(5·0.6) = 3 (Чебышёв;
  // видимый бокс x,y ∈ 0..5 — заходит в западный/северный периметр).
  const s = makeDungeonState({ width: 9, height: 9, type: 0, px: 2, py: 2 });
  G.dungeonUI.start({
    state: s, onMove() {}, zoom: 48, spriteLoader: makeLoader(),
    visionMult: 0.6,
  });
  const calls = findCanvas(loaded.body).drawCalls;
  const seed = s.dg.seed;
  // (0,2): dist 2 ≤ R — ВИДИМА wall-клетка; mask 2 (E — пол) → m02.
  assertWallAt(calls, G, 0, 2, 48, 4.5, 4.5,
    'assets/dungeon/walls/' + kindAt(0, 2, 0, seed) + '_m02.svg',
    'видимая стена (0,2) — спрайт маски');
  // (2,0): dist 2 ≤ R — ВИДИМА; mask 4 (S — пол) → m04.
  assertWallAt(calls, G, 2, 0, 48, 4.5, 4.5,
    'assets/dungeon/walls/' + kindAt(2, 0, 0, seed) + '_m04.svg',
    'видимая стена (2,0) — спрайт маски');
  // (8,4): dist 6 > R — НЕИСЛЕДОВАНА (mask 0) → стенового спрайта
  // НЕТ (фон #0a0d12).
  assertNoCellDrawImage(calls, G, 8, 4, 48, 4.5, 4.5,
    'assets/dungeon/walls/', 'неисследованная стена (8,4)');
  // (4,8): dist 6 > R — тоже скрыта (контроль другого края).
  assertNoCellDrawImage(calls, G, 4, 8, 48, 4.5, 4.5,
    'assets/dungeon/walls/', 'неисследованная стена (4,8)');
  // Контроль гейта на полу: видимый пол (3,1) — floor-спрайт ЕСТЬ;
  // скрытый пол (6,6) — ничего нет (гейт работает, не «рисует всё»).
  const floorVisible = G.dungeonFloorFrame(0, 3, 1);
  assert.ok(typeof floorVisible === 'string' && floorVisible.length > 0,
    'предусловие: dungeonFloorFrame отдаёт путь');
  assertWallAt(calls, G, 3, 1, 48, 4.5, 4.5, floorVisible,
    'видимый пол (3,1) — floor-спрайт (гейт открыт)');
  assertNoCellDrawImage(calls, G, 6, 6, 48, 4.5, 4.5,
    'assets/dungeon/floor/', 'скрытый пол (6,6) — не рисуется');
});

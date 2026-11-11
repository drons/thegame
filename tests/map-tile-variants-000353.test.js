// Задача 000353 (разнообразие тайлов ГЛОБАЛЬНОЙ КАРТЫ по образцу 000323)
// — RED-тесты (TDD). kind: node.
//
// Контракт: memory/000323-dungeon-tiles.md (эталон механики) +
// memory/000353-map-tile-variants.md:
//  * варианты начертаний 6 СТАТИЧНЫХ террейнов (SAND/GRASS/FOREST/HILL/
//    MOUNTAIN/SWAMP): 4 на тип (база <slug>_1 + 3 новых), вода/глубокая
//    вода НЕvariant-ятся (временная анимация 4/2 кадра с контрактом
//    фазы волны 000025);
//  * выбор варианта — ЧИСТАЯ функция координат:
//    tileVariant(t, x, y) = hash2(x, y, MAP_TILE_VARIANT_SALT ^ t) % 4
//    (0 rng, 0 времени; соль — отдельный канал, не GLOBAL_SEED/
//    VISUALS_SEED/LOOT_SEED/SUBTYPE/FLOOR);
//  * швы конструкцией: defs+градиент-база варианта 1-в-1 со своего _1
//    (правило парсинга aggro-visibility инертно, distinct-стопа не
//    растут) — различаются только внутренние детали;
//  * bake-чанка детерминирован: вариант не зависит от now ⇒ канвас
//    чанка = f(cx, cy, zoom); re-bake при другом now — тот же паттерн
//    (иначе «кэш отдаёт чужой паттерн» при eviction).
//
// КРАСНЫЕ (ERR_ASSERTION осмысленные, без краха загрузки модулей):
//  T1: каталог assets/tiles — ровно 30 файлов (6 статичных × 4 +
//      water 4 + deepwater 2) — на диске 12;
//  T2: TILE_VARIANTS — 6 типов × 4 пути, pool[0] === базовый путь
//      TILE_FRAMES; файлы вариантов существуют; sha256 pairwise ≠
//      (анти-вакуум «варианты реально разные»); defs каждого варианта
//      байтово ≡ defs своего _1 (швы/контраст конструкцией);
//  T3: MAP_TILE_VARIANT_SALT = 0x7d150353 (заперта), tileVariant ≡
//      inline-формуле (hash2 из map.js —独立 канал) на скан-координатах,
//      2D-чувствительность (ни x, ни y не игнорируются), все 4 варианта
//      в сетке 35×35, разные типы → разные раскладки;
//  T4: tileFramePath(terrain, x, y, now) — статичный: ≡ варианту и НЕ
//      зависит от now; анимированные (вода): ≡ прежней frameIndex-ветке
//      (анимация цела); неизвестный террейн → null; полный пул
//      достижим в 35×35;
//  T5: vm-рендер (не-chunk): тайл-ассет каждой клетки row-major ==
//      независимый пересчёт селектора; два boot бит-в-бит; статичные
//      тайлы НЕ меняются при now+Δ, вода меняется (guard); существуют
//      соседние клетки с РАЗНЫМИ вариантами;
//  T6: bake (chunk-режим, zoom 4): последовательность тайл-ассетов
//      bake-канвасов == независимый обход чанков с вариантами (вода
//      skip); re-bake того же мира при ДРУГОМ now — идентичные списки
//      («кэш не отдаёт чужой паттерн»).
//
// ЗЕЛЁНЫЕ с RED (guard'ы, пинуются навечно без осознанного ре-пина):
//  T7: frameTiles-ключ — поля прежние (x0,y0,x1,y1,worldVersion,
//      exploredVersion; вариант в тайл-кэш НЕ кладётся — чистая
//      функция координат), chunk-ключ — cx:cy:bucket без now;
//      allAssetPaths ⊇ TILE_VARIANTS (иначе вариант-имидж вечно null
//      ⇒ legacy-квады в steady-кадре, красные RM-3/000339-T3).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const S = require('../src/sprites.js');
const MAP = require('../src/map.js');

const TERRAIN = MAP.TERRAIN;
const hash2 = MAP.hash2;
const TILES_DIR = path.join(ROOT, 'assets', 'tiles');
const WEB = 'assets/tiles/';
const EXPECTED_SALT = 0x7d150353;

// Статичные террейны, получающие варианты (вода — вне scope: 4/2 кадра
// временной анимации с фазовой связью соседей, 000025).
const STATIC = [
  [TERRAIN.SAND, 'sand'],
  [TERRAIN.GRASS, 'grass'],
  [TERRAIN.FOREST, 'forest'],
  [TERRAIN.HILL, 'hill'],
  [TERRAIN.MOUNTAIN, 'mountain'],
  [TERRAIN.SWAMP, 'swamp'],
];
const STATIC_IDS = STATIC.map(([t]) => t);
const N_VARIANTS = 4;

// Независимая реализация контракта (формула запёрта задачей; hash2 —
// finalizer из perlin.js, запинен tests/map.test.js).
const refVariant = (t, x, y) =>
  hash2(x, y, EXPECTED_SALT ^ t) % N_VARIANTS;

const diskTiles = () =>
  fs.readdirSync(TILES_DIR).filter((f) => f.endsWith('.svg')).sort();

const readTile = (name) => fs.readFileSync(path.join(TILES_DIR, name));

// --- T1: SWEEP каталога ---

test('T1: assets/tiles — ровно 30 файлов: 6 статичных типов × 4 варианта (<slug>_<n>.svg, n=1..4) + water 1..4 + deepwater 1..2', () => {
  const files = diskTiles();
  assert.equal(files.length, 12 + STATIC.length * (N_VARIANTS - 1),
    `в каталоге ${files.length} файлов, ожидается 30 (12 прежних + 18 `
    + `вариантов 6 статичных типов): ${files.join(', ')}`);
  for (const [, slug] of STATIC) {
    for (let n = 1; n <= N_VARIANTS; n++) {
      assert.ok(files.includes(`${slug}_${n}.svg`),
        `нет файла ${slug}_${n}.svg`);
    }
  }
  for (const n of [1, 2, 3, 4]) {
    assert.ok(files.includes(`water_${n}.svg`), `нет water_${n}.svg`);
  }
  for (const n of [1, 2]) {
    assert.ok(files.includes(`deepwater_${n}.svg`),
      `нет deepwater_${n}.svg`);
  }
  const schema = /^(?:sand|grass|forest|hill|mountain|swamp)_[1-4]\.svg$|^water_[1-4]\.svg$|^deepwater_[12]\.svg$/;
  for (const f of files) {
    assert.match(f, schema, `имя файла вне схемы <slug>_<n>.svg: ${f}`);
  }
});

// --- T2: реестр вариантов + анти-вакуум + швы конструкцией ---

test('T2: TILE_VARIANTS — 6 типов × 4 пути; pool[0] ≡ базовый TILE_FRAMES-путь; sha256 вариантов pairwise ≠ (анти-вакуум); defs варианта байтово ≡ defs своего _1 (швы/контраст конструкцией)', () => {
  assert.ok(S.TILE_VARIANTS && typeof S.TILE_VARIANTS === 'object',
    'sprites.js экспортирует TILE_VARIANTS');
  assert.deepEqual(Object.keys(S.TILE_VARIANTS).map(Number).sort(
    (a, b) => a - b), [...STATIC_IDS].sort((a, b) => a - b),
    'ключи TILE_VARIANTS ≠ id статичных террейнов (вода вне scope)');
  const allBytes = [];
  for (const [t, slug] of STATIC) {
    const pool = S.TILE_VARIANTS[t];
    assert.ok(Array.isArray(pool) && pool.length === N_VARIANTS,
      `тип ${t}: пул из ${N_VARIANTS} путей, факт ${
        Array.isArray(pool) ? pool.length : typeof pool}`);
    assert.equal(pool[0], S.tileFrames(t)[0],
      `тип ${t}: pool[0] должен совпадать с базовым путем TILE_FRAMES `
      + '(файл <slug>_1 не переиздаётся)');
    assert.deepEqual([...new Set(pool)].sort(), pool.slice().sort(),
      `тип ${t}: дубли путей в пуле`);
    const baseSvg = readTile(`${slug}_1.svg`).toString('utf8');
    const baseDefs = baseSvg.match(/<defs>[\s\S]*?<\/defs>/);
    const baseRect = baseSvg.match(/<rect width="64" height="64"[^>]*\/>/);
    assert.ok(baseDefs, `у базы ${slug}_1 нет defs`);
    assert.ok(baseRect, `у базы ${slug}_1 нет базового rect`);
    const shas = [];
    for (const p of pool) {
      assert.ok(p.startsWith(WEB) && p.endsWith('.svg'),
        `чужой путь в пуле типа ${t}: ${p}`);
      assert.ok(fs.existsSync(path.join(ROOT, p)),
        `нет файла на диске: ${p}`);
      const bytes = readTile(p.slice(WEB.length));
      shas.push(crypto.createHash('sha256').update(bytes).digest('hex'));
    }
    assert.equal(new Set(shas).size, N_VARIANTS,
      `тип ${t}: файлы вариантов побайтово различны (анти-вакуум)`);
    allBytes.push(...shas);
    for (let n = 2; n <= N_VARIANTS; n++) {
      const svg = readTile(`${slug}_${n}.svg`).toString('utf8');
      const defs = svg.match(/<defs>[\s\S]*?<\/defs>/);
      assert.ok(defs, `${slug}_${n}.svg: нет defs (база-градиент?)`);
      assert.equal(defs[0], baseDefs[0],
        `${slug}_${n}.svg: defs ≠ defs своего _1 — база/краи обязаны `
        + 'быть общими во всех вариантах (шов конструкцией, 000323)');
      const rect = svg.match(/<rect width="64" height="64"[^>]*\/>/);
      assert.ok(rect && baseRect
          && rect[0] === baseRect[0],
        `${slug}_${n}.svg: базовый rect ≠ своего _1`);
      assert.ok(svg.includes('viewBox="0 0 64 64"'),
        `${slug}_${n}.svg: viewBox 0 0 64 64`);
      assert.ok(!/<text|transform=/.test(svg),
        `${slug}_${n}.svg: text/transform запрещены`);
      assert.ok(svg.match(/<(path|circle|ellipse|polygon|rect)\b/g).length
        > svg.match(/<rect width="64" height="64"/g).length,
        `${slug}_${n}.svg: детали помимо базы присутствуют`);
    }
  }
  assert.equal(new Set(allBytes).size, STATIC.length * N_VARIANTS,
    'все 24 файла вариантов побайтово различны');
});

// --- T3: формула выбора варианта ---

test('T3: MAP_TILE_VARIANT_SALT = 0x7d150353; tileVariant ≡ hash2(x, y, SALT ^ terrain) % 4; детерминизм; 2D-чувствительность; все 4 варианта в сетке 35×35; разные типы → разные раскладки', () => {
  assert.equal(S.MAP_TILE_VARIANT_SALT, EXPECTED_SALT,
    `MAP_TILE_VARIANT_SALT = ${EXPECTED_SALT.toString(16)} (заперта; `
    + 'отдельный канал — не GLOBAL_SEED/VISUALS/LOOT/SUBTYPE/FLOOR)');
  assert.equal(typeof S.tileVariant, 'function',
    'sprites.js экспортирует tileVariant');
  for (const [t] of STATIC) {
    assert.equal(S.tileVariant(t, 7, -3), S.tileVariant(t, 7, -3),
      'детерминизм: повторный вызов → тот же индекс');
    for (let x = -37; x <= 41; x += 1) {
      for (let y = -29; y <= 23; y += 1) {
        const v = S.tileVariant(t, x, y);
        assert.equal(v, refVariant(t, x, y),
          `тип ${t} (${x},${y}): вне формулы hash2(x,y,SALT^t)%4: ${v}`);
        assert.ok(Number.isInteger(v) && v >= 0
          && v < N_VARIANTS, `индекс вне [0;4): ${v}`);
      }
    }
    const seen = new Set();
    for (let x = 0; x < 35; x++) {
      for (let y = 0; y < 35; y++) seen.add(S.tileVariant(t, x, y));
    }
    assert.equal(seen.size, N_VARIANTS,
      `тип ${t}: в сетке 35×35 только ${seen.size} из ${N_VARIANTS} `
      + 'вариантов');
    const row = [];
    for (let x = 0; x < 24; x++) row.push(S.tileVariant(t, x, 5));
    assert.ok(row.some((v) => v !== row[0]),
      `тип ${t}: фиксированный y → индекс не меняется по x (x игнорируется)`);
    const col = [];
    for (let y = 0; y < 24; y++) col.push(S.tileVariant(t, -9, y));
    assert.ok(col.some((v) => v !== col[0]),
      `тип ${t}: фиксированный x → индекс не меняется по y (y игнорируется)`);
  }
  for (const [a, b] of [[TERRAIN.SAND, TERRAIN.GRASS],
    [TERRAIN.FOREST, TERRAIN.MOUNTAIN], [TERRAIN.HILL, TERRAIN.SWAMP]]) {
    let diff = false;
    for (let x = 0; x < 20 && !diff; x++) {
      for (let y = 0; y < 20 && !diff; y++) {
        if (S.tileVariant(a, x, y) !== S.tileVariant(b, x, y)) diff = true;
      }
    }
    assert.ok(diff, `типы ${a} и ${b}: раскладки вариантов совпадают `
      + 'во всём скане (соль не смешана с terrain)');
  }
  // ЗОЛОТЫЕ РЯДЫ (GRASS): x-скан при y=7, y-скан при x=−11, диагональ
  // (i,i), i=−4..11. Пины зависят от длины пула (=4) и формулы — любое
  // изменение числа вариантов/соли/хэша = ОСОЗНАННЫЙ ре-пин (прецедент
  // 3→8 из 000323). M4-мутация «hash2(x, 0, …)» красит все три ряда.
  const GRASS = TERRAIN.GRASS;
  const rowX = [];
  for (let x = 0; x < 16; x++) rowX.push(S.tileVariant(GRASS, x, 7));
  assert.deepEqual(rowX,
    [3, 1, 3, 3, 0, 3, 3, 3, 1, 2, 1, 2, 1, 0, 3, 1],
    'золотой ряд x-скана (y=7) сдвинулся — формула варианта изменена');
  const colY = [];
  for (let y = 0; y < 16; y++) colY.push(S.tileVariant(GRASS, -11, y));
  assert.deepEqual(colY,
    [1, 1, 3, 1, 2, 1, 0, 2, 3, 3, 0, 0, 3, 3, 3, 2],
    'золотой ряд y-скана (x=−11) сдвинулся — y игнорируется/формула иная');
  const diag = [];
  for (let i = -4; i < 12; i++) diag.push(S.tileVariant(GRASS, i, i));
  assert.deepEqual(diag,
    [2, 0, 2, 2, 1, 0, 2, 0, 2, 0, 1, 3, 3, 2, 0, 2],
    'золотой диагональный ряд сдвинулся');
});

// --- T4: селектор тайл-пути ---

test('T4: tileFramePath(terrain, x, y, now) — статичный ≡ варианту и НЕ зависит от now; вода ≡ frameIndex-ветке (анимация цела); неизвестный террейн → null; полный пул достижим в 35×35', () => {
  assert.equal(typeof S.tileFramePath, 'function',
    'sprites.js экспортирует tileFramePath');
  const pool = S.TILE_VARIANTS;
  for (const [t, slug] of STATIC) {
    for (const now of [0, 1000, 40000, 123456789]) {
      for (let x = -11; x <= 13; x += 4) {
        for (let y = -7; y <= 9; y += 5) {
          const p = S.tileFramePath(t, x, y, now);
          assert.equal(p, `${WEB}${slug}_${refVariant(t, x, y) + 1}.svg`,
            `тип ${t} (${x},${y}) now=${now}: путь ≠ вариантной формуле`);
          assert.ok(fs.existsSync(path.join(ROOT, p)),
            `нет файла: ${p}`);
        }
      }
    }
    const seen = new Set();
    for (let x = 0; x < 35; x++) {
      for (let y = 0; y < 35; y++) seen.add(S.tileFramePath(t, x, y, 500));
    }
    assert.deepEqual([...seen].sort(), [...pool[t]].sort(),
      `тип ${t}: tileFramePath в 35×35 покрывает не весь пул`);
  }
  for (const t of [TERRAIN.WATER, TERRAIN.DEEP_WATER]) {
    const frames = S.tileFrames(t);
    for (const now of [0, 977, 5000, 83000]) {
      for (let x = -3; x <= 3; x++) {
        for (let y = -2; y <= 4; y++) {
          assert.equal(S.tileFramePath(t, x, y, now),
            frames[S.frameIndex(now, x, y, frames.length)],
            `вода (${x},${y}) now=${now}: анимационная ветка изменена`);
        }
      }
    }
  }
  let waterAnim = false;
  for (let x = 0; x < 12 && !waterAnim; x++) {
    for (let y = 0; y < 12 && !waterAnim; y++) {
      if (S.tileFramePath(TERRAIN.WATER, x, y, 0)
          !== S.tileFramePath(TERRAIN.WATER, x, y, 60000)) waterAnim = true;
    }
  }
  assert.ok(waterAnim, 'guard: вода анимируется (кадр зависит от now)');
  for (const bad of [-1, 8, 99, 2.5, null, undefined, 'grass', NaN]) {
    assert.equal(S.tileFramePath(bad, 3, 5, 1000), null,
      `неизвестный террейн ${String(bad)} → null`);
  }
});

// --- vm-харнес (паттерн tests/render-steady-gate-skip-000339.test.js) ---

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g),
  (m) => m[1]).map((p) => p.replace(/^src\//, ''));
const VIEW_W = 1280;
const VIEW_H = 720;
const NOW = 1000;
const SEED = require(path.join(ROOT, 'src', 'mapseed.js'));
const WORLD = MAP.createMap(SEED.generateSeedPixels());

function makeGl(glCalls) {
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
  gl.vertexAttribPointer = noop;
  gl.viewport = noop;
  gl.clearColor = noop;
  gl.clear = noop;
  gl.uniformMatrix4fv = noop;
  gl.bufferData = (target, data, usage) => {
    glCalls.push({ fn: 'bufferData', data });
  };
  gl.drawArrays = (mode, first, count) => {
    glCalls.push({ fn: 'drawArrays', count });
  };
  return gl;
}

function makeContext2d(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

function makeEl(tag, createdCanvases) {
  const target = {
    tagName: tag,
    className: '',
    textContent: '',
    title: '',
    style: {},
    dataset: {},
    children: [],
    listeners: {},
    appendChild(ch) { this.children.push(ch); return ch; },
    addEventListener(type, fn) {
      (this.listeners[type] || (this.listeners[type] = [])).push(fn);
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
    if (createdCanvases) createdCanvases.push(target);
  }
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return () => undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function bootSandbox() {
  const createdCanvases = [];
  const winListeners = {};
  const raf = [];
  const errors = [];
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
  const glCalls = [];
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl(glCalls) : makeContext2d(gameCanvas));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? makeContext2d(spriteCanvas) : null);
  const document = {
    createElement: (tag) => makeEl(tag, createdCanvases),
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
  const store = {};
  const window = {
    innerWidth: VIEW_W,
    innerHeight: VIEW_H,
    location: { search: '' },
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k)
        ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
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
        self.__asset = v;
        Promise.resolve().then(() => {
          const failed = v === 'assets/map.png';
          if (failed) {
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
  return {
    sandbox, raf, errors, glCalls, createdCanvases,
    gameCanvas, spriteCanvas, hud,
  };
}

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
  h.game = g;
  h.frameFn = h.raf[h.raf.length - 1];
  return h;
}

function frameAt(h, now) {
  h.glCalls.length = 0;
  const n0 = h.spriteCanvas.drawCalls.length;
  h.frameFn(now);
  return h.spriteCanvas.drawCalls.slice(n0);
}

const tileDraws = (draws) => draws
  .filter((c) => c[0] === 'drawImage' && c[1][0]
    && typeof c[1][0].__asset === 'string'
    && c[1][0].__asset.startsWith(WEB));

// Независимый row-major-референс тайл-ассетов кадра (тот же селектор,
// что контракт: анимационная ветка + вариантная формула).
function refFrameAssets(camX, camY, zoom, now) {
  const r = MAP.visibleTileRange(camX, camY, VIEW_W, VIEW_H, zoom);
  const out = [];
  for (let ty = r.y0; ty <= r.y1; ty++) {
    for (let tx = r.x0; tx <= r.x1; tx++) {
      const t = WORLD.tileAt(tx, ty);
      const frames = S.tileFrames(t.terrain);
      if (!frames.length) continue;
      if (frames.length > 1) {
        out.push(frames[S.frameIndex(now, tx, ty, frames.length)]);
      } else {
        out.push(`${WEB}${terrainSlug(t.terrain)}_`
          + `${refVariant(t.terrain, tx, ty) + 1}.svg`);
      }
    }
  }
  return out;
}

const SLUG_BY_ID = Object.fromEntries(STATIC);
const terrainSlug = (t) => SLUG_BY_ID[t];

// --- T5: vm-рендер (pass 1, не-chunk) ---

test('T5: vm-рендер — тайл-ассет каждой клетки == независимый пересчёт селектора с вариантами; два boot бит-в-бит; статичные НЕ меняются при now+Δ, вода меняется; соседние клетки с разными вариантами существуют', async () => {
  const h = await boot();
  const zoom = h.game.state.zoom;
  const r = MAP.visibleTileRange(h.game.state.cam.x,
    h.game.state.cam.y, VIEW_W, VIEW_H, zoom);
  const nTiles = (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
  assert.ok(nTiles < 8192,
    `сценарий: не-chunk режим (nTiles ${nTiles} < 8192) — pass 1 per-tile`);
  const d1 = tileDraws(frameAt(h, NOW + 200));
  assert.ok(d1.length > 0, 'pass 1 рисует тайл-текстуры');
  assert.deepEqual(d1.map((c) => c[1][0].__asset),
    refFrameAssets(h.game.state.cam.x, h.game.state.cam.y, zoom, NOW + 200),
    'тайл-ассеты кадра row-major ≠ независимому пересчёту селектора '
    + '(анимация + вариант по координатам)');
  // Статичные инертны к now; вода — меняется (guard анимации). Δ=1700
  // = 0.531·WAVE_PERIOD_MS — сдвиг фазы больше ширины кадра (1/4) ⇒
  // смена индекса на КАЖДОЙ водной клетке.
  const d2 = tileDraws(frameAt(h, NOW + 1900));
  assert.equal(d2.length, d1.length, 'тот же набор клеток');
  for (let i = 0; i < d1.length; i++) {
    const ty = r.y0 + Math.floor(i / (r.x1 - r.x0 + 1));
    const tx = r.x0 + (i % (r.x1 - r.x0 + 1));
    const terrain = WORLD.tileAt(tx, ty).terrain;
    if (STATIC_IDS.includes(terrain)) {
      assert.equal(d2[i][1][0].__asset, d1[i][1][0].__asset,
        `статичный (${tx},${ty}) изменился при now+1700 — вариант `
        + 'протёк зависимостью от now (bake/кэш рассинхронятся)');
    }
  }
  let waterChanged = false;
  for (let i = 0; i < d1.length; i++) {
    const ty = r.y0 + Math.floor(i / (r.x1 - r.x0 + 1));
    const tx = r.x0 + (i % (r.x1 - r.x0 + 1));
    if (WORLD.tileAt(tx, ty).terrain === TERRAIN.WATER
        && d2[i][1][0].__asset !== d1[i][1][0].__asset) waterChanged = true;
  }
  if (d1.some((c, i) => {
    const ty = r.y0 + Math.floor(i / (r.x1 - r.x0 + 1));
    const tx = r.x0 + (i % (r.x1 - r.x0 + 1));
    return WORLD.tileAt(tx, ty).terrain === TERRAIN.WATER;
  })) {
    assert.ok(waterChanged, 'guard: в кадре есть вода — её кадр меняется '
      + 'при now+Δ (анимация не выключена вариантами)');
  }
  // Разнообразие реально: соседние одноимённые статичные клетки с
  // РАЗНЫМИ вариантами (разрушение монотонности).
  let neighborDiff = false;
  for (let ty = r.y0; ty <= r.y1 && !neighborDiff; ty++) {
    for (let tx = r.x0; tx <= r.x1 - 1 && !neighborDiff; tx++) {
      const a = WORLD.tileAt(tx, ty);
      const b = WORLD.tileAt(tx + 1, ty);
      if (STATIC_IDS.includes(a.terrain) && a.terrain === b.terrain) {
        const ia = (ty - r.y0) * (r.x1 - r.x0 + 1) + (tx - r.x0);
        if (d1[ia][1][0].__asset !== d1[ia + 1][1][0].__asset) {
          neighborDiff = true;
        }
      }
    }
  }
  assert.ok(neighborDiff,
    'в кадре нет ни одной пары соседних одноимённых тайлов с разными '
    + 'вариантами — монотонность не разрушена');
  // Детерминизм boot: два независимых boot при одном now — бит-в-бит.
  const h2 = await boot();
  const d3 = tileDraws(frameAt(h2, NOW + 200));
  assert.deepEqual(d3.map((c) => c[1][0].__asset),
    d1.map((c) => c[1][0].__asset),
    'независимый повторный boot — тайл-ассеты бит-в-бит');
});

// --- T6: bake-чанки — варианты в паттерне + now-индетерминентность ---

function bakeAssetLists(h) {
  const out = [];
  for (const cv of h.createdCanvases) {
    const calls = (cv.drawCalls || []).filter(
      (c) => c[0] === 'drawImage' && c[1][0]
        && typeof c[1][0].__asset === 'string'
        && c[1][0].__asset.startsWith(WEB));
    if (calls.length) out.push(calls.map((c) => c[1][0].__asset));
  }
  return out;
}

// Независимый обход bake: чанки диапазона в порядке main-цикла
// (cy→cx, bake раньше blit-NaN-skip), клетки jy→jx (bakeWorldChunk),
// water-skip после выборa имиджа, вариант — по формуле.
const CC = require('../src/chunk-cache.js');
function refBakeLists(camX, camY, zoom, now) {
  const r = MAP.visibleTileRange(camX, camY, VIEW_W, VIEW_H, zoom);
  const cr = CC.chunkRange(r.x0, r.y0, r.x1, r.y1);
  const size = CC.CHUNK_SIZE;
  const out = [];
  for (let cy = cr.cy0; cy <= cr.cy1; cy++) {
    for (let cx = cr.cx0; cx <= cr.cx1; cx++) {
      const local = CC.worldChunkLocalEdges(cx, cy, zoom);
      if (Number.isNaN(local.ex[0])) continue;
      const list = [];
      for (let jy = 0; jy < size; jy++) {
        for (let jx = 0; jx < size; jx++) {
          const t = WORLD.tileAt(size * cx + jx, size * cy + jy);
          if (t.terrain === TERRAIN.WATER
              || t.terrain === TERRAIN.DEEP_WATER) continue;
          const frames = S.tileFrames(t.terrain);
          if (!frames.length) continue;
          if (frames.length > 1) {
            list.push(frames[S.frameIndex(now, size * cx + jx,
              size * cy + jy, frames.length)]);
          } else {
            list.push(`${WEB}${terrainSlug(t.terrain)}_`
              + `${refVariant(t.terrain, size * cx + jx,
                size * cy + jy) + 1}.svg`);
          }
        }
      }
      if (list.length) out.push(list);
    }
  }
  return out;
}

test('T6: bake-чанки (chunk-режим zoom 4) — паттерн == обход с вариантами; re-bake того же мира при ДРУГОМ now — идентичные bake-списки (кэш не отдаёт чужой паттерн)', async () => {
  const h = await boot();
  const wheel = (h.gameCanvas.listeners.wheel || [])[0];
  assert.ok(typeof wheel === 'function', 'сценарий: wheel на #game');
  for (let i = 0; i < 22; i++) wheel({ deltaY: 100, preventDefault() {} });
  assert.equal(h.game.state.zoom, 4, 'сценарий: ZOOM_MIN');
  frameAt(h, NOW + 200);
  const lists = bakeAssetLists(h);
  assert.ok(lists.length > 0, 'bake-канвасы содержат тайл-текстуры');
  const camX = h.game.state.cam.x;
  const camY = h.game.state.cam.y;
  const r = MAP.visibleTileRange(camX, camY, VIEW_W, VIEW_H, 4);
  assert.ok((r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1) > 8192,
    'сценарий: chunk-режим активен');
  assert.deepEqual(lists, refBakeLists(camX, camY, 4, NOW + 200),
    'паттерн bake ≠ независимому обходу чанков с вариантами '
    + '(вода skip, клетки j-major, cy→cx)');
  const flat = lists.flat();
  assert.ok(flat.some((p) => /_(2|3|4)\.svg$/.test(p))
    && flat.some((p) => /_1\.svg$/.test(p)),
    'в bake есть и база, и новые варианты (разнообразие печатается в чанк)');
  // Re-bake при другом now — тот же мир (тот же boot невозможен:
  // bake однократен на кэш) ⇒ независимый boot с другим now-кадром.
  const h2 = await boot();
  for (let i = 0; i < 22; i++) {
    (h2.gameCanvas.listeners.wheel || [])[0](
      { deltaY: 100, preventDefault() {} });
  }
  frameAt(h2, NOW + 45678);
  assert.deepEqual(bakeAssetLists(h2), lists,
    're-bake того же чанка при другом now отдал ДРУГОЙ паттерн — '
    + 'вариант протёк зависимостью от now (chunk-ключ от now не зависит)');
});

// --- T7: guard'ы контрактов кэша (зелёные с RED) ---

test('T7 (guard): frameTiles-ключ — поля прежние (вариант В КЛЮЧ НЕ кладётся — чистая f(terrain,x,y)); chunk-ключ cx:cy:bucket без now; allAssetPaths ⊇ TILE_VARIANTS', () => {
  const main = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  const keyBlock = main.match(/frameTilesKey = \{([\s\S]*?)\};/);
  assert.ok(keyBlock, 'main.js: присваивание frameTilesKey = {…}');
  const keys = [...new Set([...keyBlock[1].matchAll(
    /(?<![.\w])([A-Za-z_]\w*)(?=\s*[,:])/g,
  )].map((m) => m[1]))].sort();
  assert.deepEqual(keys,
    ['exploredVersion', 'worldVersion', 'x0', 'x1', 'y0', 'y1'],
    'поля frameTiles-ключа изменились — вариант должен вычисляться '
    + 'on-the-fly, НЕ храниться в тайле/ключе (FT-7/map.test.js)');
  assert.match(main, /const key = cx \+ ':' \+ cy \+ ':' \+ bucket/,
    'chunk-ключ = cx:cy:bucket (без now/варианта — bake детерминирован)');
  assert.match(main, /G\.tileFramePath/,
    'main.js: селектор tileFrameImg читает G.tileFramePath (единая '
    + 'точка выбора текстуры — bake и pass 1)');
  const sprites = fs.readFileSync(path.join(ROOT, 'src', 'sprites.js'),
    'utf8');
  const aap = sprites.match(
    /function allAssetPaths\(\)[\s\S]*?\n  \}/);
  assert.ok(aap && /TILE_VARIANTS/.test(aap[0]),
    'allAssetPaths обязан перечислять TILE_VARIANTS (иначе вариант-image '
    + 'вечно null → legacy-квады в steady-кадре: RM-3/000339-T3)');
  const all = S.allAssetPaths();
  for (const [t] of STATIC) {
    for (const p of S.TILE_VARIANTS[t]) {
      assert.ok(all.includes(p),
        `вариант вне allAssetPaths (нет pre-лоада): ${p}`);
    }
  }
});

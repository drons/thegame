// Задача 000323 (пол подземелья: 8 тайлов на тип, сид = координаты
// входа + номер этажа, бесшовная стыковка) — RED-тесты (TDD). kind: node.
//
// Контракт: memory/000323-dungeon-tiles.md — §1 формула сида
// (dungeonFloorTileSeed(gx, gy, depth), соль 0x5f00d323 — одна формула
// на всё приложение, 0 времени/игрока), §2 реестр 40 тайлов (8×5,
// flat-SVG), §3 бесшовность (плоская база типа + детали строго внутри
// [0.5, 63.5]²), §4 раскладка (4-арг dungeonFloorFrame + d.floorSeed,
// additive 0 rng; chunk-кэш per-сессия).
//
// КРАСНЫЕ (ERR_ASSERTION осмысленные — модули грузятся, файлы n=1..3
// существуют):
//  R1: каталог assets/dungeon/floor — ровно 40 файлов (8 на каждый из
//      5 типов, имена <slug>_<n>.svg, n = 1..8) — на диске 15 (3/тип);
//  R2: flat-SVG формат всех 40: только rect/circle/ellipse/polygon,
//      без defs/linearGradient/radialGradient/path/text/transform/
//      stroke, viewBox 0 0 64 64, базовый rect 64×64 fill=hex (НЕ
//      url()) — cave_4..8 отсутствуют, cave_1..3 — градиенты+path;
//  R3: D.dungeonFloorTileSeed — функция, FLOOR_TILE_SALT = 0x5f00d323,
//      детерминизм + разные (этаж) / (координаты) → разные сиды;
//  R4: createDungeon(gx, gy, …, depth).floorSeed =
//      dungeonFloorTileSeed(gx, gy, depth) — additive, 0 вызовов rng;
//  R5: dungeonFloorFrame(type, x, y, floorSeed) — 4-й аргумент
//      участвует (разные сиды → разные раскладки; сейчас игнорируется),
//      в сетке 35×35 при фиксированном сиде ВСЕ 8 вариантов (сейчас 3);
//  R7: рендер (vm): пол двух подземелий одного типа (37,−12) и
//      (38,−12) — РАЗЛИЧЕН (сейчас порядок только от локальных x,y →
//      идентичны).
//
// ЗЕЛЁНЫЕ с первого запуска (регрессия): R6 — 3-арг legacy-вызов
// (tests/chunk-render, tests/wall-autotile) валиден (один из 8 путей);
//  R7b — повторный (независимый) рендер бит-в-бит, floor-пути существуют
//      на диске и несут slug своего типа.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const D = require('../src/dungeon.js');
const S = require('../src/sprites.js');
const M = require('../src/map.js');

const SLUGS = ['cave', 'crypt', 'ruins', 'drowned', 'abyss'];
const FLOOR_DIR = path.join(ROOT, 'assets', 'dungeon', 'floor');
const FLOOR_WEB_DIR = 'assets/dungeon/floor/';
const PX = M.syntheticPixels(8, 8, 128, 128, 128, 255);

const diskFloorFiles = () =>
  fs.readdirSync(FLOOR_DIR).filter((f) => f.endsWith('.svg')).sort();

// --- R1: SWEEP каталога ---

test('R1: assets/dungeon/floor — ровно 40 файлов: 8 на каждый из 5 типов (<slug>_<n>.svg, n = 1..8)', () => {
  const files = diskFloorFiles();
  assert.equal(files.length, 40,
    `в каталоге ${files.length} файлов, ожидается 40 (5 типов × 8): `
    + files.join(', '));
  for (const slug of SLUGS) {
    for (let n = 1; n <= 8; n++) {
      const name = `${slug}_${n}.svg`;
      assert.ok(files.includes(name), `нет файла ${name}`);
    }
  }
  for (const f of files) {
    assert.match(f, /^(?:cave|crypt|ruins|drowned|abyss)_[1-8]\.svg$/,
      `имя файла вне схемы <slug>_<n>.svg, n = 1..8: ${f}`);
  }
});

// --- R2: flat-SVG формат ---

test('R2: все 40 тайлов — flat-SVG (rect/circle/ellipse/polygon; без defs/градиентов/path/text/transform/stroke; база 64×64 fill=hex)', () => {
  const files = diskFloorFiles();
  for (const slug of SLUGS) {
    for (let n = 1; n <= 8; n++) {
      const name = `${slug}_${n}.svg`;
      assert.ok(files.includes(name), `нет файла ${name}`);
      const svg = fs.readFileSync(path.join(FLOOR_DIR, name), 'utf8');
      for (const bad of ['<defs', 'linearGradient', 'radialGradient',
        '<path', '<text', 'transform=', 'stroke=']) {
        assert.ok(!svg.includes(bad),
          `${name}: запрещённый элемент/атрибут «${bad}»`);
      }
      assert.ok(svg.includes('viewBox="0 0 64 64"'),
        `${name}: viewBox 0 0 64 64`);
      const tags = [...svg.matchAll(/<(rect|circle|ellipse|polygon)\b/g)]
        .map((m) => m[1]);
      const foreign = [...svg.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)\b/g)]
        .map((m) => m[1]).filter((t) => !['svg', 'rect', 'circle',
          'ellipse', 'polygon', 'g'].includes(t));
      assert.deepEqual(foreign, [],
        `${name}: элементы вне rect/circle/ellipse/polygon: ${foreign.join(', ')}`);
      assert.ok(tags.length > 1, `${name}: текстурные элементы присутствуют`);
      const base = svg.match(/<rect\b([^>]*)\/>/);
      assert.ok(base, `${name}: базовый rect`);
      const a = {};
      for (const m of base[1].matchAll(/([\w:-]+)="([^"]*)"/g)) a[m[1]] = m[2];
      assert.equal(a.width, '64', `${name}: базовый rect width 64`);
      assert.equal(a.height, '64', `${name}: базовый rect height 64`);
      assert.match(a.fill, /^#[0-9a-fA-F]{6}$/,
        `${name}: базовый rect fill = hex (не url()/прочее): ${a.fill}`);
    }
  }
});

// --- R3: контракт сида ---

test('R3: dungeonFloorTileSeed — функция, FLOOR_TILE_SALT = 0x5f00d323, детерминизм и различие по (этажу)/(координатам)', () => {
  assert.equal(typeof D.dungeonFloorTileSeed, 'function',
    'dungeon.js экспортирует dungeonFloorTileSeed');
  assert.equal(D.FLOOR_TILE_SALT, 0x5f00d323,
    `FLOOR_TILE_SALT = 0x5f00d323 (запёртая константа), факт: `
    + '0x' + (D.FLOOR_TILE_SALT >>> 0).toString(16));
  const s = D.dungeonFloorTileSeed;
  assert.equal(s(37, -12, 1), s(37, -12, 1),
    'детерминизм: одинаковые (координаты, этаж) → одинаковый сид');
  assert.notEqual(s(37, -12, 1), s(37, -12, 2),
    'пары: другой этаж → другой сид');
  assert.notEqual(s(37, -12, 1), s(38, -12, 1),
    'пары: другие координаты → другой сид');
  assert.ok(Number.isInteger(s(37, -12, 1)) && s(37, -12, 1) >= 0,
    'сид — целое ≥ 0');
});

// --- R4: d.floorSeed (additive, 0 rng) ---

test('R4: createDungeon(gx, gy, …, depth).floorSeed = dungeonFloorTileSeed(gx, gy, depth); другой этаж → другой floorSeed', () => {
  const d1 = D.createDungeon(37, -12, PX, M.TERRAIN.GRASS, 1);
  assert.equal(typeof d1.floorSeed, 'number',
    'd.floorSeed — число (additive-поле формы)');
  assert.equal(d1.floorSeed, D.dungeonFloorTileSeed(37, -12, 1),
    'floorSeed = dungeonFloorTileSeed(вход, глубина)');
  const d2 = D.createDungeon(37, -12, PX, M.TERRAIN.GRASS, 2);
  assert.notEqual(d2.floorSeed, d1.floorSeed,
    'другой этаж → другой floorSeed');
  const d3 = D.createDungeon(38, -12, PX, M.TERRAIN.GRASS, 1);
  assert.notEqual(d3.floorSeed, d1.floorSeed,
    'другие координаты входа → другой floorSeed');
});

// --- R5: выбор тайла по сид-формуле ---

test('R5: dungeonFloorFrame(type, x, y, floorSeed) — 4-й аргумент участвует; в сетке 35×35 при фиксированном сиде встречаются ВСЕ 8 вариантов', () => {
  const frames = S.DUNGEON_FLOOR_FRAMES[0];
  assert.equal(frames.length, 8,
    'у типа 8 путей <slug>_<n>.svg, n = 1..8');
  const allowed = new Set(frames);
  const s1 = typeof D.dungeonFloorTileSeed === 'function'
    ? D.dungeonFloorTileSeed(37, -12, 1) : 1;
  const seen = new Set();
  for (let x = 0; x < 35; x++) {
    for (let y = 0; y < 35; y++) {
      const r = S.dungeonFloorFrame(0, x, y, s1);
      assert.equal(typeof r, 'string', 'путь-строка');
      assert.ok(allowed.has(r), `чужой путь: ${r}`);
      assert.equal(S.dungeonFloorFrame(0, x, y, s1), r,
        'чистая функция: повторный вызов → тот же путь');
      seen.add(r);
    }
  }
  assert.equal(seen.size, 8,
    `при фиксированном сиде в сетке 35×35 только ${seen.size} из 8 вариантов`);
  const s2 = typeof D.dungeonFloorTileSeed === 'function'
    ? D.dungeonFloorTileSeed(38, -12, 1) : 2;
  const layout = (seed) => {
    const out = [];
    for (let x = 0; x < 35; x++)
      for (let y = 0; y < 35; y++)
        out.push(S.dungeonFloorFrame(0, x, y, seed));
    return out;
  };
  const l1 = layout(s1), l2 = layout(s2);
  assert.ok(l1.some((p, i) => p !== l2[i]),
    'разные сиды → раскладки различаются (∃ клетка)');
});

// --- R6 (гвард): 3-арг legacy-ветка ---

test('R6 (гвард): 3-арг вызов dungeonFloorFrame(type, x, y) валиден — один из 8 путей типа (chunk-render/wall-autotile)', () => {
  for (const type of [0, 1, 2, 3, 4]) {
    const allowed = new Set(S.DUNGEON_FLOOR_FRAMES[type]);
    for (let x = 0; x < 35; x++) {
      for (let y = 0; y < 35; y++) {
        const r = S.dungeonFloorFrame(type, x, y);
        assert.ok(allowed.has(r),
          `тип ${type} (${x},${y}): 3-арг путь вне набора: ${r}`);
      }
    }
  }
  for (const type of [5, 99, -1, 0.5, 'cave', null, undefined, NaN]) {
    assert.equal(S.dungeonFloorFrame(type, 3, 5), null,
      `неизвестный type: ${String(type)}`);
  }
});

// --- R7: рендер (vm-песочница) ---

// Минимальный DOM-стаб (паттерн tests/dungeon-ui.test.js).
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
      (this.listeners[type] || (this.listeners[type] = [])).push([fn]);
    },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
  };
  if (tag === 'canvas') {
    el.width = 0;
    el.height = 0;
    el.getContext = () => {
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
    };
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

function loadFloorUi() {
  const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
  const errors = [];
  const scheduled = [];
  let rafId = 0;
  const T = { t: 1000 };
  const document = {
    createElement: (tag) => makeEl(tag),
    body: makeEl('body'),
  };
  const sandbox = {
    console: { error: (m) => errors.push(String(m)) },
    document,
    window: {
      innerWidth: 800, innerHeight: 600, addEventListener() {},
    },
    performance: { now: () => T.t },
    requestAnimationFrame: (fn) => { scheduled.push(fn); return ++rafId; },
    cancelAnimationFrame() {},
  };
  vm.createContext(sandbox);
  for (const f of ['global-settings.js', 'perlin.js', 'map.js',
    'controls.js', 'dungeon.js', 'locations.js', 'sprites.js',
    'dungeon-ui.js', 'motion.js']) {
    vm.runInContext(src(f), sandbox, { filename: f });
  }
  return { G: sandbox.Game, body: document.body, errors, T, scheduled };
}

function makeFloorState(floorSeed) {
  const w = 5, h = 5;
  const cells = new Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      cells[y * w + x] = (x === 0 || y === 0 || x === w - 1
        || y === h - 1) ? 0 : 1;
    }
  }
  const dg = {
    type: 0,
    width: w, height: h, cells,
    entrance: { x: 1, y: 1 },
    exit: { x: 1, y: 1 },
  };
  if (floorSeed !== undefined) dg.floorSeed = floorSeed;
  return {
    dg,
    contents: { chests: [], mobs: [], deposits: [] },
    x: 1, y: 1,
    log: ['простая пещера: вход.'],
  };
}

const seedFor = (gx, gy) => (typeof D.dungeonFloorTileSeed === 'function'
  ? D.dungeonFloorTileSeed(gx, gy, 1) : undefined);

// Карта «клетка → путь floor-спрайта» после одного кадра: floor-клетки
// 5×5 — (1..3, 1..3), 5×5 @ 48 = 240 < вьюпорта → камера (2.5, 2.5).
function renderFloorMap(seed) {
  const loaded = loadFloorUi();
  const G = loaded.G;
  assert.equal(loaded.errors.length, 0,
    'ошибок загрузки нет: ' + loaded.errors.join('; '));
  G.dungeonUI.start({
    state: makeFloorState(seed),
    onMove() {},
    zoom: 48,
    spriteLoader: {
      image: (p) => ({ __img: p }),
      isReady: () => true,
    },
  });
  loaded.T.t += 16;
  loaded.scheduled[loaded.scheduled.length - 1]();
  const calls = findCanvas(loaded.body).drawCalls;
  const map = {};
  for (let y = 1; y <= 3; y++) {
    for (let x = 1; x <= 3; x++) {
      const p = G.worldToScreen(x, y, 2.5, 2.5, 48, 800, 600);
      const hit = calls.find((c) => c[0] === 'drawImage'
        && Math.abs(c[1][1] - p.x) <= 1e-9
        && Math.abs(c[1][2] - p.y) <= 1e-9
        && c[1][3] === 48 && c[1][4] === 48);
      assert.ok(hit, `floor (${x},${y}) — drawImage zoom×zoom`);
      map[x + ',' + y] = hit[1][0].__img;
    }
  }
  return map;
}

test('R7: пол двух подземелий одного типа (37,−12) и (38,−12) — РАЗЛИЧЕН (сид от координат входа); повторный рендер — бит-в-бит', () => {
  const mA = renderFloorMap(seedFor(37, -12));
  const mB = renderFloorMap(seedFor(38, -12));
  assert.ok(Object.keys(mA).some((k) => mA[k] !== mB[k]),
    'пер-клетка раскладка пола должна различаться для разных '
    + 'координат входа (сид = dungeonFloorTileSeed(вход, глубина))');
  const mA2 = renderFloorMap(seedFor(37, -12));
  assert.deepEqual(mA, mA2,
    'независимый повторный рендер — бит-в-бит (детерминизм)');
  for (const p of Object.values(mA)) {
    assert.ok(typeof p === 'string'
      && p.startsWith(FLOOR_WEB_DIR + 'cave_'),
      `floor-путь несёт slug типа (cave): ${p}`);
    assert.ok(fs.existsSync(path.join(ROOT, p)),
      `floor-путь существует на диске: ${p}`);
  }
});

// Задача 000215 (СТАДИЯ КРАСНЫХ ТЕСТОВ, TDD): на глобальной карте в
// подземельях и городах между тайлами на некоторых зумах видны более
// тёмные линии, надо от них избавиться.
//
// ТЗ: tasks/pending/000215.md. Контракты (станция Проектирование):
//   memory/000215-tile-seam.md — снап краёв сетки тайлов в ЦЕЛЫЕ
//   пиксели через новые чистые экспорты src/map.js:
//     * snappedTileRect(tx, ty, camX, camY, zoom, viewW, viewH)
//       → {x, y, w, h} (тот же порядок аргументов, что worldToScreen);
//     * snappedTileEdges(x0, y0, x1, y1, camX, camY, zoom, viewW, viewH)
//       → {x: number[], y: number[]} (x[i] — снап-левый край столбца
//         x0+i, i = 0..x1−x0+1; клетка = разница соседних краёв).
//   Формула (единственный источник — выражение worldToScreen, НИЧЕГО
//   нового): край = Math.round(viewW/2 + (индекс − cam)·zoom), тот же
//   порядок операций — бит-идентично worldToScreen. Ключевое свойство:
//   край — функция от ЦЕЛОГО индекса → соседние клетки дают ОДИН И ТОТ
//   ЖЕ общий край (нет дрейфа от поштучного round) — AA-шов на стыке
//   математически невозможен. ИДЕНТИЧНОСТЬ: при пиксельно-целых
//   проекциях (целый zoom × целая/полунцелая камера × чётный вьюпорт)
//   снап = identity побайтово → все существующие пины без правок.
//   Guards (зеркало worldToScreen, 000061): не-число/не-конечный
//   аргумент, zoom ≤ 0, view ≤ 0, нецелочисленные индексы/границы,
//   x1 < x0 / y1 < y0 → NaN-результат БЕЗ исключения. Детерминизм —
//   побайтово.
//   Точки применения (дизайн): мир — ТОЛЬКО текстура тайла (проход 1
//   drawSprites, main.js L3116); подземелье/город — ВСЁ, что лежит
//   ровно на сетке клеток (угол клетки, размер ~zoom): пол (оба
//   режима), стена города, постройки города, wallObjs, маркеры
//   выхода/лестницы, туман-затемнение. НЕ снапуются глитт-сущности
//   (мобы/герой/лут/декорации/сундуки/игрок/постройки мира) —
//   их EPS-1e-6 пины (000173/000172/000158.05/MV-C1/MV-C2) живы.
//
// КРАСНЫЕ (падают на ТЕКУЩЕМ коде, осмысленно — функциональности
// ТЗ ещё нет: экспортов в map.js нет, draw-вызовы рисуют сырыми
// float-координатами worldToScreen — не синтаксическая ошибка):
//   TS-1: identity на ВСЕХ существующих пин-сценариях (6084+ клеток) —
//         Game.snappedTileRect отсутствует в src/map.js;
//   TS-2: дробный зум (48.3) — все снап-углы целые, размер ∈
//         {⌊zoom⌋, ⌈zoom⌉} — Game.snappedTileRect отсутствует;
//   TS-3: shared-edge — соседние клетки дают ОДИН общий край (нет
//         дрейфа), сумма широт ряда = правый край − левый — хелпер
//         отсутствует;
//   TS-4: guards (зеркало worldToScreen + целочисленные границы) —
//         NaN без исключения, детерминизм побайтово — хелпер
//         отсутствует;
//   TS-5: edges ↔ rect — rect реализован через edge-массивы (одна
//         формула в модуле), край = round(сырая проекция ЦЕЛОГО
//         индекса) — бит-в-бит с worldToScreen — хелпер отсутствует;
//   TS-6: мир (ПОЛНАЯ цепочка index.html): 2 wheel-in → зум
//         115.19999999999999 (дробный) — углы текстур тайлов сырые
//         float (1043.1999999999998) → не целые, на стыках AA-шов;
//   TS-7: мир: ДРОБНАЯ камера mid-glide (ход при дробном зуме) —
//         углы текстур тайлов не целые (камера не на полуцелых);
//   TS-8: мир: ПИН ФОРМУЛЫ (anti-дрейф) — край = round(сырая
//         проекция целого индекса), размер = РАЗНОСТЬ снап-краёв
//         (не «округление позиций + прежний размер», не zoom+1) —
//         текущий код рисует сырыми координатами;
//   TS-10: подземелье (loadDungeonUi 5×5, zoom 57.6): клетки пола
//         (фолбэк #182029) рисуются в сырых float-координатах
//         (313.6) → не целые;
//   TS-11: город (makeCityState fp:1 → 2×2, zoom 57.6): клетки
//         пола/стен (CITY_FLOOR/WALL_VARIANTS) рисуются в сырых
//         float-координатах (342.4) → не целые.
//
// ГАУАРД (зелёный с RED и после фикса — инвариант «целые проекции
// не меняются побайтово», все 2454 существующих теста опираются на
// него):
//   TS-9: мир: спавн-кадр (целый зум 80, камера (0.5,0.5)) —
//         текстуры тайлов нарисованы в ТОЧНЫХ координатах
//         worldToScreen, размер zoom — identity.
//
// Анти-вакуумность ОБЯЗАТЕЛЬНА: сценарии дробные (raw-проекция
// нецелая: 115.19999999999999 на карте, 313.6 в подземелье, 342.4
// в городе, дробная mid-glide камера) — иначе тест мог бы пройти
// «вхолостую» на целом зуме.
//
// Харнес: vm-песочница НЕ растеризирует пиксели — «линия»
// проверяется СТРУКТУРНО (целые углы + shared-edge + формула), а не
// цветом пикселя (финальная приёмка — визуальная в браузере;
// при целых краях AA-шов невозможен математически).
//   * TS-1..5 — прямой require src/map.js (node-ветка UMD, паттерн
//     tests/map.test.js);
//   * TS-6..9 — ВЕСЬ <script>-цепочка index.html (паттерн
//     tests/global-map-draw.test.js, вьюпорт 1280×720, performance.now
//     заморожен, кадр — явным frameFn(now));
//   * TS-10..11 — ЧАСТИЧНАЯ цепочка (global-settings, perlin, map,
//     controls, dungeon, locations, dungeon-ui, motion; БЕЗ
//     sprites.js → фолбэк-фигуры цветом-фильтром, паттерн
//     tests/dungeon-ui.test.js, вьюпорт 800×600, rAF-стабы).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

// ====================================================================
// Чистые тесты TS-1..TS-5 — require src/map.js (node-ветка UMD)
// ====================================================================

const MAP = require(path.join(ROOT, 'src', 'map.js'));
const { worldToScreen, visibleTileRange } = MAP;

// RED-услугa: экспорты 000215 отсутствуют в текущем map.js — тест
// падает именно на них (символ отсутствует, а не синтаксис).
function assertSnapExports() {
  assert.equal(typeof MAP.snappedTileRect, 'function',
    'src/map.js: экспорт Game.snappedTileRect (задача 000215)');
  assert.equal(typeof MAP.snappedTileEdges, 'function',
    'src/map.js: экспорт Game.snappedTileEdges (задача 000215)');
}

test('TS-1: снап = identity при пиксельно-целых проекциях (ВСЕ существующие пин-сценарии) — побайтово (000215)', () => {
  assertSnapExports();
  const SCEN = [
    // [zoom, camX, camY, viewW, viewH] — существующие пины
    // dungeon-ui (48/42/40/20/30/4), main-visuals спавн (@80),
    // city G1 (1280×720 @80 cam(3,3)).
    [48, 2.5, 2.5, 800, 600],
    [40, 10, 7.5, 800, 600],
    [42, 10, 7.5, 800, 600],
    [40, 14, 13.5, 800, 600],
    [20, 13, 13, 800, 600],
    [30, 9, 9, 800, 600],
    [4, 1, 1, 800, 600],
    [80, 0.5, 0.5, 800, 600],
    [80, 3, 3, 1280, 720],
  ];
  let n = 0;
  for (const [zoom, camX, camY, vw, vh] of SCEN) {
    const r = visibleTileRange(camX, camY, vw, vh, zoom);
    for (let ty = r.y0; ty <= r.y1; ty++) {
      for (let tx = r.x0; tx <= r.x1; tx++) {
        const raw = worldToScreen(tx, ty, camX, camY, zoom, vw, vh);
        const rc = MAP.snappedTileRect(tx, ty, camX, camY, zoom, vw, vh);
        assert.equal(rc.x, raw.x,
          'identity x @' + zoom + ' cam(' + camX + ',' + camY + ') '
          + '(' + tx + ',' + ty + '): ' + rc.x + ' vs ' + raw.x);
        assert.equal(rc.y, raw.y,
          'identity y @' + zoom + ' cam(' + camX + ',' + camY + ') '
          + '(' + tx + ',' + ty + '): ' + rc.y + ' vs ' + raw.y);
        assert.equal(rc.w, zoom,
          'identity w = zoom (целый зум) @' + zoom + ' (' + tx + ',' + ty + '): ' + rc.w);
        assert.equal(rc.h, zoom,
          'identity h = zoom (целый зум) @' + zoom + ' (' + tx + ',' + ty + '): ' + rc.h);
        n++;
      }
    }
  }
  assert.ok(n >= 34000, 'сценарий: проверено клеток: ' + n);
});

test('TS-2: дробный зум (48.3) — все снап-углы целые пиксели, размер ∈ {⌊zoom⌋, ⌈zoom⌉} (000215)', () => {
  assertSnapExports();
  const zoom = 48.3, camX = 2.5, camY = 2.5, vw = 800, vh = 600;
  const raw = worldToScreen(1, 1, camX, camY, zoom, vw, vh);
  assert.ok(!Number.isInteger(raw.x) || !Number.isInteger(raw.y),
    'сценарий: сырая проекция дробная: ' + raw.x + ',' + raw.y);
  const r = visibleTileRange(camX, camY, vw, vh, zoom);
  for (let ty = r.y0; ty <= r.y1; ty++) {
    for (let tx = r.x0; tx <= r.x1; tx++) {
      const rc = MAP.snappedTileRect(tx, ty, camX, camY, zoom, vw, vh);
      assert.ok(Number.isInteger(rc.x),
        'левый край — целый пиксель @48.3 (' + tx + ',' + ty + '): ' + rc.x);
      assert.ok(Number.isInteger(rc.y),
        'верхний край — целый пиксель @48.3 (' + tx + ',' + ty + '): ' + rc.y);
      assert.ok(Number.isInteger(rc.w),
        'ширина — целые пиксели @48.3 (' + tx + ',' + ty + '): ' + rc.w);
      assert.ok(Number.isInteger(rc.h),
        'высота — целые пиксели @48.3 (' + tx + ',' + ty + '): ' + rc.h);
      assert.ok(rc.w === 48 || rc.w === 49,
        'w ∈ {48, 49} = {⌊zoom⌋, ⌈zoom⌉} (' + tx + ',' + ty + '): ' + rc.w);
      assert.ok(rc.h === 48 || rc.h === 49,
        'h ∈ {48, 49} = {⌊zoom⌋, ⌈zoom⌉} (' + tx + ',' + ty + '): ' + rc.h);
    }
  }
});

test('TS-3: shared-edge — соседние клетки дают ОДИН и тот же общий край (нет дрейфа), сумма широт ряда = правый край − левый (000215)', () => {
  assertSnapExports();
  const SCEN = [
    [48.3, 2.5, 2.5, 800, 600],
    [80 * 1.2 * 1.2, 0.5, 0.5, 1280, 720],
  ];
  for (const [zoom, camX, camY, vw, vh] of SCEN) {
    const r = visibleTileRange(camX, camY, vw, vh, zoom);
    const rectAt = (tx, ty) =>
      MAP.snappedTileRect(tx, ty, camX, camY, zoom, vw, vh);
    let pairs = 0;
    for (let ty = r.y0; ty <= r.y1; ty++) {
      for (let tx = r.x0; tx < r.x1; tx++) {
        const a = rectAt(tx, ty), b = rectAt(tx + 1, ty);
        assert.equal(a.x + a.w, b.x,
          'общий вертикальный край @' + zoom + ' (' + tx + ',' + ty + '): '
          + (a.x + a.w) + ' vs ' + b.x);
        pairs++;
      }
      for (let tx = r.x0; tx <= r.x1; tx++) {
        const a = rectAt(tx, ty), b = rectAt(tx, ty + 1);
        assert.equal(a.y + a.h, b.y,
          'общий горизонтальный край @' + zoom + ' (' + tx + ',' + ty + '): '
          + (a.y + a.h) + ' vs ' + b.y);
        pairs++;
      }
    }
    // Сетка РАЗБИРАЕТ экран (не «лепестки»): сумма широт ряда =
    // правый край − левый край.
    const left = rectAt(r.x0, 0).x;
    const right = rectAt(r.x1, 0).x + rectAt(r.x1, 0).w;
    let sum = 0;
    for (let tx = r.x0; tx <= r.x1; tx++) sum += rectAt(tx, 0).w;
    assert.equal(sum, right - left,
      'сумма широт ряда = правый − левый @' + zoom + ': '
      + sum + ' vs ' + (right - left));
    assert.ok(pairs >= 100,
      'сценарий: пар shared-edge: ' + pairs);
  }
});

test('TS-4: guards (зеркало worldToScreen + целочисленные индексы/границы) — NaN без исключения, детерминизм побайтово (000215)', () => {
  assertSnapExports();
  const rectBad = [
    [undefined, 0, 0, 0, 80, 800, 600],
    [0, null, 0, 0, 80, 800, 600],
    [0, 0, 'x', 0, 80, 800, 600],
    [0, 0, NaN, 0, 80, 800, 600],
    [0, 0, 0, Infinity, 80, 800, 600],
    [0.5, 0, 0, 0, 80, 800, 600],
    [0, 0.5, 0, 0, 80, 800, 600],
    [0, 0, 0, 0, 0, 800, 600],
    [0, 0, 0, 0, -80, 800, 600],
    [0, 0, 0, 0, 80, 0, 600],
    [0, 0, 0, 0, 80, 800, -600],
  ];
  for (const args of rectBad) {
    const r = MAP.snappedTileRect(...args);
    assert.ok(Number.isNaN(r.x) && Number.isNaN(r.y)
        && Number.isNaN(r.w) && Number.isNaN(r.h),
      'rect guard → NaN без исключения: ' + JSON.stringify(args));
  }
  const edgesBad = [
    [0.5, 0, 4, 4, 0, 0, 80, 800, 600],
    [0, 0, 4, 4.5, 0, 0, 80, 800, 600],
    [4, 0, 0, 4, 0, 0, 80, 800, 600],
    [0, 4, 4, 0, 0, 0, 80, 800, 600],
    [0, 0, 4, 4, 'x', 0, 80, 800, 600],
    [0, 0, 4, 4, NaN, 0, 80, 800, 600],
    [0, 0, 4, 4, 0, 0, 0, 800, 600],
    [0, 0, 4, 4, 0, 0, 80, 0, 600],
    [0, 0, 4, 4, 0, 0, 80, 800, 0],
  ];
  for (const args of edgesBad) {
    const e = MAP.snappedTileEdges(...args);
    assert.deepEqual(e, { x: [NaN], y: [NaN] },
      'edges guard → [NaN] без исключения: ' + JSON.stringify(args));
  }
  const a = MAP.snappedTileEdges(-3, -2, 5, 4, 2.5, 2.5, 48.3, 800, 600);
  const b = MAP.snappedTileEdges(-3, -2, 5, 4, 2.5, 2.5, 48.3, 800, 600);
  assert.deepEqual(a, b, 'детерминизм: edges побайтово');
  for (let i = 0; i < a.x.length; i++)
    assert.equal(a.x[i], b.x[i], 'детерминизм x[' + i + ']');
  for (let j = 0; j < a.y.length; j++)
    assert.equal(a.y[j], b.y[j], 'детерминизм y[' + j + ']');
  const c1 = MAP.snappedTileRect(2, -1, 2.5, 2.5, 48.3, 800, 600);
  const c2 = MAP.snappedTileRect(2, -1, 2.5, 2.5, 48.3, 800, 600);
  assert.deepEqual(c1, c2, 'детерминизм: rect побайтово');
});

test('TS-5: edges ↔ rect — rect = прямоугольник из edge-массивов (одна формула в модуле), край = round(сырая проекция ЦЕЛОГО индекса) — бит-в-бит с worldToScreen (000215)', () => {
  assertSnapExports();
  const zoom = 48.3, camX = 2.5, camY = 2.5, vw = 800, vh = 600;
  const x0 = -3, y0 = -2, x1 = 5, y1 = 4;
  const E = MAP.snappedTileEdges(x0, y0, x1, y1, camX, camY, zoom, vw, vh);
  assert.equal(E.x.length, x1 - x0 + 2,
    'edges: длина массива = клеток + 1 (правый край последнего): ' + E.x.length);
  assert.equal(E.y.length, y1 - y0 + 2,
    'edges: длина массива = клеток + 1: ' + E.y.length);
  for (let i = 0; i < E.x.length; i++) {
    const p = worldToScreen(x0 + i, y0, camX, camY, zoom, vw, vh);
    assert.equal(E.x[i], Math.round(p.x),
      'edge x[' + i + '] = round(сырая проекция целого индекса): '
      + E.x[i] + ' vs ' + Math.round(p.x));
  }
  for (let j = 0; j < E.y.length; j++) {
    const p = worldToScreen(x0, y0 + j, camX, camY, zoom, vw, vh);
    assert.equal(E.y[j], Math.round(p.y),
      'edge y[' + j + '] = round(сырая проекция целого индекса): '
      + E.y[j] + ' vs ' + Math.round(p.y));
  }
  let n = 0;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const rc = MAP.snappedTileRect(tx, ty, camX, camY, zoom, vw, vh);
      const expected = {
        x: E.x[tx - x0],
        y: E.y[ty - y0],
        w: E.x[tx - x0 + 1] - E.x[tx - x0],
        h: E.y[ty - y0 + 1] - E.y[ty - y0],
      };
      assert.deepEqual(rc, expected,
        'rect = из edge-массивов (' + tx + ',' + ty + '): '
        + JSON.stringify(rc) + ' vs ' + JSON.stringify(expected));
      n++;
    }
  }
  assert.ok(n >= 60, 'сценарий: клеток: ' + n);
});

// ====================================================================
// vm-мир TS-6..TS-9 — ПОЛНАЯ цепочка index.html (паттерн
// tests/global-map-draw.test.js): вьюпорт 1280×720, performance.now
// заморожен на NOW, кадр — явным frameFn(now) (rAF-колбэк frame()
// main.js). 2 wheel-in → zoom = 80·1.2² = 115.19999999999999
// (дробный уже со 2-го тика колёсика — «некоторые зумы» ТЗ).
// ====================================================================

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));

const VIEW_W = 1280;
const VIEW_H = 720;
const NOW = 1000; // performance.now() в песочнице заморожен на NOW

function wMakeGl(glCalls) {
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
  gl.bufferData = (target, data, usage) => { glCalls.push({ fn: 'bufferData', data }); };
  gl.drawArrays = (mode, first, count) => { glCalls.push({ fn: 'drawArrays', count }); };
  return gl;
}

function wMakeContext2d(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

function wMakeEl(tag) {
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
    setAttribute(k, v) {
      if (String(k).startsWith('data-')) target.dataset[String(k).slice(5)] = v;
    },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    remove() {},
    blur() {},
  };
  if (tag === 'canvas') {
    target.width = 0;
    target.height = 0;
    target.getContext = (kind) => (kind === '2d'
      ? wMakeContext2d(target) : null);
  }
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return () => undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function wMakeStorage() {
  const store = {};
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k)
      ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
}

function wBootSandbox(reject, chain) {
  const winListeners = {};
  const raf = [];
  const errors = [];
  const gameCanvas = wMakeEl('canvas');
  const spriteCanvas = wMakeEl('canvas');
  const hud = wMakeEl('div');
  const glCalls = [];
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? wMakeGl(glCalls) : wMakeContext2d(gameCanvas));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? wMakeContext2d(spriteCanvas) : null);
  const storage = wMakeStorage();
  const document = {
    createElement: (tag) => wMakeEl(tag),
    getElementById: (id) => (
      id === 'game' ? gameCanvas
        : id === 'sprites' ? spriteCanvas
          : id === 'hud' ? hud
            : null
    ),
    body: wMakeEl('body'),
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
          const failed = v === 'assets/map.png'
            || (reject != null && reject(v));
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
  for (const f of (chain || CHAIN)) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox,
      { filename: f });
  }
  return {
    sandbox, winListeners, raf, errors, storage,
    gameCanvas, spriteCanvas, hud, glCalls,
    body: document.body,
  };
}

const wDrain = () => new Promise((r) => setImmediate(r));

async function wBoot(reject, chain) {
  const h = wBootSandbox(reject, chain);
  await wDrain();
  await wDrain();
  await wDrain();
  const g = h.sandbox.__game;
  assert.ok(g, 'globalThis.__game выставлен (main.js выполнен)');
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет (порядок цепочки): ' + h.errors.join('; '));
  h.frameFn = h.raf[h.raf.length - 1];
  return h;
}

// Памп ОДНОГО кадра (frameFn — rAF-колбэк frame() main.js);
// glCalls сбрасываются до кадра (ассерты — «вершины кадра»).
function wFrameAt(h, now) {
  h.glCalls.length = 0;
  const n0 = h.spriteCanvas.drawCalls.length;
  h.frameFn(now);
  return { draw: h.spriteCanvas.drawCalls.slice(n0) };
}

function wDrawImages(draw) {
  return draw.filter((c) => c[0] === 'drawImage');
}

function wAssetOf(c) {
  const img = c[1] && c[1][0];
  return img && typeof img.__asset === 'string' ? img.__asset : '';
}

// Текстуры тайлов (assets/tiles/*.svg) — проход 1 drawSprites.
function wTileDraws(draw) {
  return wDrawImages(draw).filter(
    (c) => wAssetOf(c).startsWith('assets/tiles/'));
}

function wAssertReady(h) {
  const s = h.sandbox.__game.state.sprites;
  assert.ok(s && s.total > 0, 'спрайт-лоадер запущен');
  assert.equal(s.ready, s.total, 'steady state: все ассеты ready');
}

function wKey(h, code) {
  const e = { code, preventDefault() {}, stopPropagation() {} };
  for (const fn of (h.winListeners['keydown'] || []).slice()) fn(e);
  return e;
}

function wKeyup(h, code) {
  const e = { code };
  for (const fn of (h.winListeners['keyup'] || []).slice()) fn(e);
  return e;
}

// Текстуры тайлов кадра → сетка «tx,ty → {x, y, w, h}» через
// обратную проекцию (tx = cam.x + (x − viewW/2)/zoom). После снапа
// смещение ≤ 0.5 px → допуск 0.5/zoom (до фикса — 0, строго).
function tileGrid(draw, st) {
  const grid = new Map();
  let rawNonInt = 0;
  for (const c of wTileDraws(draw)) {
    const x = c[1][1], y = c[1][2], w = c[1][3], hh = c[1][4];
    const wx = st.cam.x + (x - VIEW_W / 2) / st.zoom;
    const wy = st.cam.y + (y - VIEW_H / 2) / st.zoom;
    const tx = Math.round(wx), ty = Math.round(wy);
    assert.ok(Math.abs(wx - tx) <= 0.5 / st.zoom + 1e-9
        && Math.abs(wy - ty) <= 0.5 / st.zoom + 1e-9,
      'сценарий: отрисовка на сетке тайлов: ' + x + ',' + y);
    const rawX = VIEW_W / 2 + (tx - st.cam.x) * st.zoom;
    const rawY = VIEW_H / 2 + (ty - st.cam.y) * st.zoom;
    if (!Number.isInteger(rawX) || !Number.isInteger(rawY)) rawNonInt++;
    grid.set(tx + ',' + ty, { x, y, w, h: hh });
  }
  return { grid, rawNonInt };
}

// Стыки соседних клеток в сетке: без щели И перекрытие ≤ 1 px.
// Возвращает число проверенных стыков.
function assertSeams(grid) {
  let seams = 0;
  for (const [k, r] of grid) {
    const tx = Number(k.split(',')[0]), ty = Number(k.split(',')[1]);
    const right = grid.get((tx + 1) + ',' + ty);
    if (right) {
      assert.ok(right.x <= r.x + r.w,
        'нет щели в вертикальном шве (' + k + '): '
        + right.x + ' > ' + (r.x + r.w));
      assert.ok(r.x + r.w - right.x <= 1,
        'перекрытие ≤ 1 px (' + k + '): ' + (r.x + r.w - right.x));
      seams++;
    }
    const below = grid.get(tx + ',' + (ty + 1));
    if (below) {
      assert.ok(below.y <= r.y + r.h,
        'нет щели в горизонтальном шве (' + k + '): '
        + below.y + ' > ' + (r.y + r.h));
      assert.ok(r.y + r.h - below.y <= 1,
        'перекрытие ≤ 1 px (' + k + '): ' + (r.y + r.h - below.y));
      seams++;
    }
  }
  return seams;
}

test('TS-6: мир: дробный зум (2 wheel-in → 115.19999999999999) — углы текстур тайлов на целых пикселях, на общих краях нет швов (000215)', async () => {
  const h = await wBoot();
  wAssertReady(h);
  const g = h.sandbox.__game;
  const f0 = wFrameAt(h, NOW + 200);
  assert.ok(wTileDraws(f0.draw).length > 0,
    'сценарий: спавн-кадр с текстурами тайлов');
  const wheel = (h.gameCanvas.listeners['wheel'] || [])[0];
  assert.ok(typeof wheel === 'function',
    'сценарий: wheel-обработчик на #game');
  wheel({ deltaY: -100, preventDefault() {} });
  wheel({ deltaY: -100, preventDefault() {} });
  assert.equal(g.state.zoom, 80 * 1.2 * 1.2,
    'зум после 2 wheel-in = 80·1.2² = 115.19999999999999');
  assert.ok(!Number.isInteger(g.state.zoom),
    'сценарий: зум дробный («на некоторых зумах» ТЗ): ' + g.state.zoom);
  const f = wFrameAt(h, NOW + 400);
  assert.ok(wTileDraws(f.draw).length > 0,
    'сценарий: текстуры тайлов в кадре при дробном зуме');
  const st = g.state;
  const { grid, rawNonInt } = tileGrid(f.draw, st);
  assert.ok(rawNonInt > 0,
    'анти-вакуум: сценарий дробный (сырые нецелые проекции: '
    + rawNonInt + ' тайлов), иначе тест проходит «вхолостую»');
  for (const [k, r] of grid) {
    assert.ok(Number.isInteger(r.x),
      'левый край тайла (' + k + ') — целый пиксель: ' + r.x);
    assert.ok(Number.isInteger(r.y),
      'верхний край тайла (' + k + ') — целый пиксель: ' + r.y);
    assert.ok(Number.isInteger(r.w),
      'ширина тайла (' + k + ') — целые пиксели: ' + r.w);
    assert.ok(Number.isInteger(r.h),
      'высота тайла (' + k + ') — целые пиксели: ' + r.h);
  }
  const seams = assertSeams(grid);
  assert.ok(seams >= 100,
    'сценарий: стыков соседних тайлов: ' + seams);
});

test('TS-7: мир: дробная камера mid-glide (ход при дробном зуме) — края тайлов по-прежнему целые пиксели, швов нет (000215)', async () => {
  const h = await wBoot();
  wAssertReady(h);
  const g = h.sandbox.__game;
  wFrameAt(h, NOW + 200);
  const wheel = (h.gameCanvas.listeners['wheel'] || [])[0];
  wheel({ deltaY: -100, preventDefault() {} });
  wheel({ deltaY: -100, preventDefault() {} });
  let now = NOW + 400;
  wFrameAt(h, now);
  // (−1,0) — безопасный тайл спавн-мира (нет группы/постройки:
  // группа (1,0) — g2 triggers=false, группа (2,3) — в 6 клетках).
  wKey(h, 'ArrowLeft');
  let mid = null;
  for (let i = 0; i < 12 && !mid; i++) {
    now += 200;
    const f = wFrameAt(h, now);
    const cx = g.state.cam.x;
    const target = g.state.player.x + 0.5;
    // mid-glide: камера не на полуцелой сетке И не на цели
    // (асимптотический глейд 000033 — никогда не точна).
    if (Math.abs(2 * cx - Math.round(2 * cx)) > 1e-9
        && Math.abs(cx - target) > 1e-9) {
      mid = f;
    }
  }
  wKeyup(h, 'ArrowLeft');
  assert.ok(mid, 'сценарий: есть кадр с дробной камерой (mid-glide)');
  const st = g.state;
  assert.ok(!Number.isInteger(st.zoom), 'сценарий: зум дробный');
  assert.ok(Math.abs(2 * st.cam.x - Math.round(2 * st.cam.x)) > 1e-9,
    'сценарий: камера дробная (не на полуцелой сетке): ' + st.cam.x);
  assert.ok(wTileDraws(mid.draw).length > 0,
    'сценарий: текстуры тайлов в glide-кадре');
  const { grid, rawNonInt } = tileGrid(mid.draw, st);
  assert.ok(rawNonInt > 0,
    'анти-вакуум: при дробной камере сырые проекции дробные ('
    + rawNonInt + ' тайлов)');
  for (const [k, r] of grid) {
    assert.ok(Number.isInteger(r.x),
      'левый край тайла (' + k + ') mid-glide — целый пиксель: ' + r.x);
    assert.ok(Number.isInteger(r.y),
      'верхний край тайла (' + k + ') mid-glide — целый пиксель: ' + r.y);
    assert.ok(Number.isInteger(r.w),
      'ширина тайла (' + k + ') mid-glide — целые пиксели: ' + r.w);
    assert.ok(Number.isInteger(r.h),
      'высота тайла (' + k + ') mid-glide — целые пиксели: ' + r.h);
  }
  const seams = assertSeams(grid);
  assert.ok(seams >= 100,
    'сценарий: стыков соседних тайлов: ' + seams);
});

test('TS-8: мир: ПИН ФОРМУЛЫ — край = round(сырая проекция ЦЕЛОГО индекса), размер = РАЗНОСТЬ снап-краёв (не «округление позиций + прежний размер», не zoom+1) (000215)', async () => {
  const h = await wBoot();
  wAssertReady(h);
  const g = h.sandbox.__game;
  wFrameAt(h, NOW + 200);
  const wheel = (h.gameCanvas.listeners['wheel'] || [])[0];
  wheel({ deltaY: -100, preventDefault() {} });
  wheel({ deltaY: -100, preventDefault() {} });
  const f = wFrameAt(h, NOW + 400);
  assert.ok(wTileDraws(f.draw).length > 0,
    'сценарий: текстуры тайлов в кадре при дробном зуме');
  const st = g.state;
  let n = 0;
  for (const c of wTileDraws(f.draw)) {
    const x = c[1][1], y = c[1][2], w = c[1][3], hh = c[1][4];
    const tx = Math.round(st.cam.x + (x - VIEW_W / 2) / st.zoom);
    const ty = Math.round(st.cam.y + (y - VIEW_H / 2) / st.zoom);
    assert.ok(Math.abs(st.cam.x + (x - VIEW_W / 2) / st.zoom - tx)
        <= 0.5 / st.zoom + 1e-9
      && Math.abs(st.cam.y + (y - VIEW_H / 2) / st.zoom - ty)
        <= 0.5 / st.zoom + 1e-9,
      'сценарий: отрисовка на сетке тайлов: ' + x + ',' + y);
    // Тот же порядок операций, что worldToScreen (бит-идентично).
    const ex0 = Math.round(VIEW_W / 2 + (tx - st.cam.x) * st.zoom);
    const ex1 = Math.round(VIEW_W / 2 + (tx + 1 - st.cam.x) * st.zoom);
    const ey0 = Math.round(VIEW_H / 2 + (ty - st.cam.y) * st.zoom);
    const ey1 = Math.round(VIEW_H / 2 + (ty + 1 - st.cam.y) * st.zoom);
    assert.equal(x, ex0,
      'левый край = round(сырая проекция индекса) (' + tx + ',' + ty + '): '
      + x + ' vs ' + ex0);
    assert.equal(y, ey0,
      'верхний край = round(сырая проекция индекса) (' + tx + ',' + ty + '): '
      + y + ' vs ' + ey0);
    assert.equal(w, ex1 - ex0,
      'ширина = разница снап-краёв (' + tx + ',' + ty + '): '
      + w + ' vs ' + (ex1 - ex0));
    assert.equal(hh, ey1 - ey0,
      'высота = разница снап-краёв (' + tx + ',' + ty + '): '
      + hh + ' vs ' + (ey1 - ey0));
    n++;
  }
  assert.ok(n >= 100, 'сценарий: тайлов в кадре: ' + n);
});

// ГАУАРД (зелёный с RED и после фикса): identity при пиксельно-целых
// проекциях — спавн-кадр (зум 80, камера (0.5,0.5)): текстуры
// нарисованы в ТОЧНЫХ координатах worldToScreen, размер zoom.
// Инвариант: снап не меняет побайтово ни один целочисленный сценарий
// (все существующие пины 1e-9/1e-6 опираются на это).
test('TS-9 (ГАУАРД): мир: спавн-кадр (целый зум 80, камера (0.5,0.5)) — текстуры тайлов в ТОЧНЫХ координатах worldToScreen, размер zoom — identity (000215)', async () => {
  const h = await wBoot();
  wAssertReady(h);
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const f = wFrameAt(h, NOW + 200);
  assert.ok(wTileDraws(f.draw).length > 0,
    'сценарий: спавн-кадр с текстурами тайлов');
  const st = g.state;
  assert.equal(st.zoom, 80, 'сценарий: спавн на ZOOM_START (80)');
  assert.ok(Math.abs(st.cam.x - 0.5) < 1e-9
      && Math.abs(st.cam.y - 0.5) < 1e-9,
    'сценарий: спавн-камера (0.5,0.5): ' + st.cam.x + ',' + st.cam.y);
  let n = 0;
  for (const c of wTileDraws(f.draw)) {
    const x = c[1][1], y = c[1][2], w = c[1][3], hh = c[1][4];
    const tx = Math.round(st.cam.x + (x - VIEW_W / 2) / st.zoom);
    const ty = Math.round(st.cam.y + (y - VIEW_H / 2) / st.zoom);
    const p = G.worldToScreen(tx, ty, st.cam.x, st.cam.y,
      st.zoom, VIEW_W, VIEW_H);
    assert.equal(x, p.x,
      'identity: x = worldToScreen (целая проекция) (' + tx + ',' + ty + '): '
      + x + ' vs ' + p.x);
    assert.equal(y, p.y,
      'identity: y = worldToScreen (целая проекция) (' + tx + ',' + ty + '): '
      + y + ' vs ' + p.y);
    assert.equal(w, st.zoom,
      'identity: w = zoom (целый зум) (' + tx + ',' + ty + '): ' + w);
    assert.equal(hh, st.zoom,
      'identity: h = zoom (целый зум) (' + tx + ',' + ty + '): ' + hh);
    n++;
  }
  assert.ok(n >= 50, 'сценарий: тайлов в спавн-кадре: ' + n);
});

// ====================================================================
// vm-подземелье/город TS-10..TS-11 — ЧАСТИЧНАЯ цепочка (паттерн
// tests/dungeon-ui.test.js: loadDungeonUi), вьюпорт 800×600, rAF-стабы
// (кадр — по явным вызовам), БЕЗ sprites.js → фолбэк-фигуры
// (цвет fillRect — фильтр слоёв).
// ====================================================================

const VW = 800; // window.innerWidth песочницы
const VH = 600; // window.innerHeight песочницы
const CITIES = require(path.join(ROOT, 'src', 'cities.js'));

function dMakeContext2d(el) {
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

function dMakeEl(tag) {
  const el = {
    tagName: tag,
    className: '',
    textContent: '',
    title: '',
    style: {},
    dataset: {},
    children: [],
    listeners: {},
    appendChild(ch) { this.children.push(ch); return ch; },
    remove() {},
    addEventListener(type, fn, opts) {
      (this.listeners[type] || (this.listeners[type] = [])).push([fn, opts]);
    },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
  };
  if (tag === 'canvas') {
    el.width = 0;
    el.height = 0;
    el.getContext = () => dMakeContext2d(el);
  }
  return el;
}

function dFindCanvas(el) {
  if (el.tagName === 'canvas') return el;
  for (const ch of el.children || []) {
    const found = dFindCanvas(ch);
    if (found) return found;
  }
  return null;
}

function dLoadDungeonUi(opts = {}) {
  const keydown = [];
  const errors = [];
  const document = {
    createElement: (tag) => dMakeEl(tag),
    body: dMakeEl('body'),
  };
  const window = {
    innerWidth: VW,
    innerHeight: VH,
    addEventListener: (type, fn) => { if (type === 'keydown') keydown.push(fn); },
  };
  const sandbox = {
    console: { error: (m) => errors.push(String(m)) },
    document, window,
  };
  if (opts.performance) sandbox.performance = opts.performance;
  if (opts.requestAnimationFrame) {
    sandbox.requestAnimationFrame = opts.requestAnimationFrame;
  }
  if (opts.cancelAnimationFrame) {
    sandbox.cancelAnimationFrame = opts.cancelAnimationFrame;
  }
  vm.createContext(sandbox);
  const chain = ['global-settings.js', 'perlin.js', 'map.js',
    'controls.js', 'dungeon.js', 'locations.js', 'dungeon-ui.js',
    'motion.js'];
  for (const f of chain) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox,
      { filename: f });
  }
  return { G: sandbox.Game, keydown, body: document.body, errors, window };
}

function dMakeRafStubs() {
  const scheduled = [];
  const cancelled = [];
  let id = 0;
  return {
    scheduled, cancelled,
    requestAnimationFrame(fn) { scheduled.push(fn); return ++id; },
    cancelAnimationFrame(x) { cancelled.push(x); },
  };
}

function dTick(rafStubs) {
  assert.ok(rafStubs.scheduled.length > 0,
    'rAF: следующий кадр запланирован');
  rafStubs.scheduled[rafStubs.scheduled.length - 1]();
}

// Минимальное состояние подземелья (форма maybeEnterDungeon):
// по умолчанию 5×5, стены по периметру, пол 3×3 внутри.
function dMakeState(opts = {}) {
  const w = opts.width || 5;
  const h = opts.height || 5;
  const cells = new Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const wall = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      cells[y * w + x] = wall ? 0 : 1;
    }
  }
  const dg = {
    type: 0,
    width: w, height: h,
    cells,
    entrance: { x: 1, y: 1 },
    exit: { x: 1, y: 1 },
  };
  return {
    dg,
    contents: { chests: [], mobs: [], deposits: [] },
    x: 1, y: 1,
    log: ['простая пещера: вход.'],
  };
}

// Город 2×2 «Хутор» (fp:1): пол — единый тайл-дверь (0,1), стены —
// остальные три клетки (layout createCityLayout, 000105/000177).
function dMakeCityState() {
  const d = CITIES.createCityLayout(-119, -104, 1);
  const s = {
    dg: d,
    contents: null,
    kind: 'city',
    name: 'Хутор',
    x: d.entrance.x,
    y: d.entrance.y,
    prevX: d.entrance.x,
    prevY: d.entrance.y,
    log: ['Хутор: вход.'],
    cityContents: null,
  };
  return s;
}

// Палитра городских тайлов (src/dungeon-ui.js L131-132) — фильтр
// fillRect-клеток города (фон #0a0d12 и маркер #d4b45a — вне её).
const CITY_PALETTE = new Set([
  '#b3a284', '#a5947a', '#c0b090', // CITY_FLOOR_VARIANTS
  '#77685a', '#66594c',            // CITY_WALL_VARIANTS
]);

// fillRect-клетки рендера → сетка «tx,ty → [x, y, w, h]» (та же
// обратная проекция, что в мире; допуск 0.5/zoom на снап-смещение).
function cellGrid(drawCalls, st, zoom, rectFilter) {
  const grid = new Map();
  let count = 0;
  for (const c of drawCalls) {
    if (c[0] !== 'fillRect' || !rectFilter(c)) continue;
    count++;
    const [x, y, w, h] = c[1];
    const tx = Math.round(st.x + (x - VW / 2) / zoom);
    const ty = Math.round(st.y + (y - VH / 2) / zoom);
    assert.ok(Math.abs(st.x + (x - VW / 2) / zoom - tx)
        <= 0.5 / zoom + 1e-9
      && Math.abs(st.y + (y - VH / 2) / zoom - ty)
        <= 0.5 / zoom + 1e-9,
      'сценарий: клетка на сетке: ' + x + ',' + y);
    grid.set(tx + ',' + ty, [x, y, w, h]);
  }
  return { grid, count };
}

function assertIntegerCorners(list, label) {
  for (const c of list) {
    const [x, y, w, h] = c[1];
    assert.ok(Number.isInteger(x), label + ': левый край — целый пиксель: ' + x);
    assert.ok(Number.isInteger(y), label + ': верхний край — целый пиксель: ' + y);
    assert.ok(Number.isInteger(w), label + ': ширина — целые пиксели: ' + w);
    assert.ok(Number.isInteger(h), label + ': высота — целые пиксели: ' + h);
  }
}

// Общий край + пин формулы снапа для каждой клетки сетки.
function assertCellGrid(grid, camX, camY, zoom) {
  for (const [k, r] of grid) {
    const tx = Number(k.split(',')[0]), ty = Number(k.split(',')[1]);
    const right = grid.get((tx + 1) + ',' + ty);
    if (right)
      assert.equal(r[0] + r[2], right[0], 'общий вертикальный край: ' + k);
    const below = grid.get(tx + ',' + (ty + 1));
    if (below)
      assert.equal(r[1] + r[3], below[1], 'общий горизонтальный край: ' + k);
    const ex0 = Math.round(VW / 2 + (tx - camX) * zoom);
    const ex1 = Math.round(VW / 2 + (tx + 1 - camX) * zoom);
    const ey0 = Math.round(VH / 2 + (ty - camY) * zoom);
    const ey1 = Math.round(VH / 2 + (ty + 1 - camY) * zoom);
    assert.equal(r[0], ex0,
      'левый край = round(сырая проекция индекса) (' + k + '): '
      + r[0] + ' vs ' + ex0);
    assert.equal(r[1], ey0,
      'верхний край = round(сырая проекция индекса) (' + k + '): '
      + r[1] + ' vs ' + ey0);
    assert.equal(r[2], ex1 - ex0,
      'ширина = разница снап-краёв (' + k + '): ' + r[2] + ' vs ' + (ex1 - ex0));
    assert.equal(r[3], ey1 - ey0,
      'высота = разница снап-краёв (' + k + '): ' + r[3] + ' vs ' + (ey1 - ey0));
  }
}

test('TS-10: подземелье: дробный зум (57.6) — клетки пола (фолбэк #182029) на целых пикселях, общие края без швов; анти-вакуум 313.6 (000215)', () => {
  const rafStubs = dMakeRafStubs();
  const T = { t: 1000 };
  const { G, body } = dLoadDungeonUi({
    performance: { now: () => T.t },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  const s = dMakeState(); // 5×5: пол 3×3 внутри
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 57.6 });
  assert.ok(!Number.isInteger(57.6), 'сценарий: зум дробный');
  // 5×5 @ 57.6 = 288 px < вьюпорта 800×600 → жёсткое центрирование
  // cam (2.5, 2.5) (clampCam: extent·z ≤ viewPx → extent/2).
  const camX = 2.5, camY = 2.5, zoom = 57.6;
  T.t += 16;
  dTick(rafStubs);
  const canvas = dFindCanvas(body);
  const floors = canvas.drawCalls.filter(
    (c) => c[0] === 'fillRect' && c[2] === '#182029');
  assert.ok(floors.length >= 9,
    'сценарий: 3×3 floor-клетки нарисованы (фолбэк #182029), '
    + 'получено ' + floors.length);
  // Анти-вакуум: сырая проекция клетки (1,1) = 313.6 — НЕ целая
  // (иначе тест мог бы пройти «вхолостую» на целом зуме).
  const raw = G.worldToScreen(1, 1, camX, camY, zoom, VW, VH);
  assert.ok(Math.abs(raw.x - 313.6) < 1e-9,
    'анти-вакуум: сырая проекция (1,1) = 313.6: ' + raw.x);
  assert.ok(!Number.isInteger(raw.x) && !Number.isInteger(raw.y),
    'анти-вакуум: сырая проекция дробная: ' + raw.x + ',' + raw.y);
  assertIntegerCorners(floors, 'floor-клетка');
  const { grid } = cellGrid(canvas.drawCalls, { x: camX, y: camY },
    zoom, (c) => c[2] === '#182029');
  assert.ok(grid.size >= 9,
    'сценарий: 3×3 floor-сетка (получено ' + grid.size + ')');
  assertCellGrid(grid, camX, camY, zoom);
});

test('TS-11: город: дробный зум (57.6) — клетки пола/стен (CITY_FLOOR/WALL_VARIANTS) на целых пикселях, общие края без швов; анти-вакуум 342.4 (000215)', () => {
  const rafStubs = dMakeRafStubs();
  const T = { t: 1000 };
  const { G, body } = dLoadDungeonUi({
    performance: { now: () => T.t },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  const s = dMakeCityState(); // 2×2 «Хутор» (fp:1)
  assert.equal(s.dg.width, 2, 'сценарий: 2×2 хутор');
  assert.equal(s.dg.height, 2, 'сценарий: 2×2 хутор');
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 57.6 });
  // 2×2 @ 57.6 = 115.2 px < вьюпорта → центрирование cam (1, 1).
  const camX = 1, camY = 1, zoom = 57.6;
  T.t += 16;
  dTick(rafStubs);
  const canvas = dFindCanvas(body);
  const cells = canvas.drawCalls.filter(
    (c) => c[0] === 'fillRect' && CITY_PALETTE.has(c[2]));
  assert.ok(cells.length >= 4,
    'сценарий: 4 клетки 2×2 нарисованы (пол + стены), '
    + 'получено ' + cells.length);
  // Анти-вакуум: сырая проекция клетки (0,0) = 342.4 — НЕ целая.
  const raw = G.worldToScreen(0, 0, camX, camY, zoom, VW, VH);
  assert.ok(Math.abs(raw.x - 342.4) < 1e-9,
    'анти-вакуум: сырая проекция (0,0) = 342.4: ' + raw.x);
  assert.ok(!Number.isInteger(raw.x) && !Number.isInteger(raw.y),
    'анти-вакуум: сырая проекция дробная: ' + raw.x + ',' + raw.y);
  assertIntegerCorners(cells, 'городская клетка');
  const { grid } = cellGrid(canvas.drawCalls, { x: camX, y: camY },
    zoom, (c) => CITY_PALETTE.has(c[2]));
  assert.ok(grid.size >= 4,
    'сценарий: 2×2 сетка клеток (получено ' + grid.size + ')');
  assertCellGrid(grid, camX, camY, zoom);
});

// TS-12 (ретро-пин 000219 №13): FOG_DIM_FILL (mask==1) на той же
// снап-сетке, что и пол #182029 — дробный зум 57.6 + дробная
// камера (4.5, 4.5). TS-10 пинит только пол, TS-11 — город,
// TS-9 — identity (zoom 40 — снап тривиален).
const FOG_DIM_FILL = 'rgba(10, 13, 18, 0.65)'; // dungeon-ui.js L162

test('TS-12: подземелье 9×9: дробный зум (57.6) + дробная камера (4.5, 4.5) — FOG_DIM_FILL (mask==1) на снап-сетке пола #182029: frame 1 dim 0 (explored-union ПОСЛЕ mask), frame 2 dim 24 (13 стен + 11 пола), объединённая сетка 60 клеток (47 пол + 13 dim-стен); анти-вакуум 140.8 (000215)', () => {
  const rafStubs = dMakeRafStubs();
  const T = { t: 1000 };
  const { G, body } = dLoadDungeonUi({
    performance: { now: () => T.t },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  const s = dMakeState({ width: 9, height: 9 });
  assert.equal(s.dg.width, 9, 'сценарий: 9×9 (периметр — стены)');
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 57.6 });
  assert.ok(!Number.isInteger(57.6), 'сценарий: зум дробный');
  // 9×9 @ 57.6 = 518.4 px < вьюпорта 800×600 → жёсткое центрирование
  // cam (4.5, 4.5) (clampCam: extent·z ≤ viewPx → extent/2) — при
  // ANY playerPos камера НИКТО не двигает (нулевой риск глайда).
  const camX = 4.5, camY = 4.5, zoom = 57.6;
  const canvas = dFindCanvas(body);
  // Frame 1 — render() СИНХРОННО в start(); разделение кадров
  // снапшотом drawCalls.length ПОСЛЕ start().
  const lenAfterStart = canvas.drawCalls.length;
  assert.ok(lenAfterStart > 0, 'frame 1: start() отрисовал синхронно');
  const frame1 = canvas.drawCalls.slice(0, lenAfterStart);
  const dim1 = frame1.filter(
    (c) => c[0] === 'fillRect' && c[2] === FOG_DIM_FILL);
  assert.equal(dim1.length, 0,
    'frame 1: FOG_DIM_FILL === 0 (explored пуст в момент mask — '
    + 'ленивое union, апдейт ПОСЛЕ mask; факт: ' + dim1.length + ')');
  // Перемещение (white-box): playerPos читает s.x/s.y live.
  s.x = 7; s.y = 7;
  T.t += 16;
  dTick(rafStubs);
  const frame2 = canvas.drawCalls.slice(lenAfterStart);
  assert.ok(frame2.length > 0, 'frame 2: кадр отрисован (dTick)');
  const dimRects = frame2.filter(
    (c) => c[0] === 'fillRect' && c[2] === FOG_DIM_FILL);
  // explored (union frame 1+2) = (0..6)² ∪ (2..8)² (73 клетки);
  // visible frame 2 = (2..8)² (49); mask==1 = explored \ visible =
  // {x=0: 7} ∪ {x=1: 7} ∪ {y=0: 5} ∪ {y=1: 5} = 24 ТОЧНО
  // (13 стен + 11 пола — dim-pass БЕЗ isFloor-проверки).
  assert.equal(dimRects.length, 24,
    'frame 2: FOG_DIM_FILL fillRect === 24 (факт: '
    + dimRects.length + '); если счёт не сошёлся — править СЦЕНАРИЙ, '
    + 'НЕ ослаблять snap-ассерты');
  assertIntegerCorners(dimRects, 'dim-клетка');
  // Объединённая сетка: пол #182029 + dim-клетки — 60 уникальных
  // клеток (47 исследованных интерьерных полов + 13 dim-стен;
  // 11 dim-полов в обоих — одна сетка, общие края пол↔dim-стена).
  // 47 = 49 − 2: интерьерные полы (7,1) и (1,7) НЕ исследованы
  // (mask 0 — чистый фон, пол-пасс их не рисует).
  const { grid, count } = cellGrid(canvas.drawCalls, { x: camX, y: camY },
    zoom, (c) => c[2] === '#182029' || c[2] === FOG_DIM_FILL);
  assert.equal(grid.size, 60,
    'объединённая сетка: 60 уникальных клеток (47 пол + 13 dim-стен; '
    + 'факт: ' + grid.size + ', rect-совпадений: ' + count + ')');
  assertCellGrid(grid, camX, camY, zoom);
  // Анти-вакуум: сырая проекция клетки (0,0) = 400 − 4.5·57.6 =
  // 140.8 — НЕ целая (иначе тест проходил бы «вхолостую» на целом
  // зуме).
  const raw = G.worldToScreen(0, 0, camX, camY, zoom, VW, VH);
  assert.ok(Math.abs(raw.x - 140.8) < 1e-9,
    'анти-вакуум: сырая проекция (0,0) = 140.8: ' + raw.x);
  assert.ok(!Number.isInteger(raw.x) && !Number.isInteger(raw.y),
    'анти-вакуум: сырая проекция дробная: ' + raw.x + ',' + raw.y);
});

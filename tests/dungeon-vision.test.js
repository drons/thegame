// Задача 000136: туман войны в подземельях («Кошачий глаз»).
//
// ТЗ (tasks/pending/000136.md): подземелье больше не видно целиком —
// радиус видимости вокруг героя (база 5 × derived.caveVisionMult,
// live-чтение, паттерн liveLevelDeltaMax) + затемнение исследованных
// клеток; закрывает мёртвый стат caveVisionMult (player.js:242).
// Контракты — memory/000136-dungeon-fog-vision.md (D1-D12) +
// memory/000136-dungeon-fog.md (формула/семантика/затемнение).
//
// Контракты (сверка тестов):
//   G.dungeonUI.vision = {
//     baseRadius: 5,                              // VISION_BASE_RADIUS
//     radiusFor(mult) → int ≥ 1,                  // ceil(5·mult − 1e-9);
//                                                 // не-число/NaN/≤ 0 → baseRadius
//     maskFor(w, h, cx, cy, radius, exploredSet)  // → Uint8Array(w·h),
//   }                                             // индекс = y·w + x (конвенция
//                                                 // d.cells); 0 = скрыто
//                                                 // (неисследованное),
//                                                 // 1 = explored вне радиуса
//                                                 // (затемнить), 2 = видно;
//                                                 // ЧИСТА: exploredSet не
//                                                 // мутирует (только .has)
//   Клетка (x, y): cheb = max(|x−cx|, |y−cy|); cheb ≤ R → 2; иначе
//   exploredSet.has('x,y') → 1; иначе → 0. cx/cy — позиция героя в
//   момент кадра (playerPos; дробная при глейде), +0.5-сдвигов НЕТ.
//   explored — ключи 'x,y' (конвенция dungeonMemory).
//
//   opts.dungeonUI.start — новое поле (необязательное):
//   visionMult: Function | Number — функция — live (main.js:
//   G.derived(hero) → caveVisionMult), число — статично (тесты);
//   ОДНО чтение на кадр; мусор/отсутствие → 1 ТИХО (без console.error —
//   песочницы без player.js пинят errors.length === 0).
//
//   explored — модульное состояние визита dungeon-ui.js: Set<'x,y'>;
//   start() → new Set() (вход = новый визит), close() → null; render
//   (подземелье) — все клетки маски == 2 (весь w·h) добавляются.
//   НЕ сейв, НЕ dungeon.js (нулевая diff — FOG-C1).
//
//   Затемнение: один проход ПЕРЕД игроком, ПОСЛЕ всех контурных слоёв:
//   fillStyle = FOG_DIM_FILL, fillRect(p.x, p.y, zoom, zoom) для клеток
//   viewport-диапазона с mask == 1. Игрок — после затемнения.
//
// КРАСНЫЕ (падают до реализации, зелёные после): FOG-A1..A3 (чистое ядро
// G.dungeonUI.vision), FOG-B1..B6 (vm-e2e drawCalls) + T1 (правка
// существующего пина tests/dungeon-ui.test.js L764: drawn ⟺
// inRange ∧ cheb ≤ radiusFor(1.0) — в том файле).
// ЗЕЛЁНЫЕ с первого запуска (регрессионные пины): FOG-C1 (git diff по
// src/dungeon.js пуст; МЕЖЗАДАЧНАЯ МИНА: последующая задача, правящая
// dungeon.js — 000133 и др. — ре-пинит/убирает пин в своей задаче,
// правило аудита §6), FOG-E1 (full-chain smoke: enterDungeon + «Кошачий
// глаз» + кадры — без ошибок; единственный тест, проверяющий проводку
// main.js end-to-end).
//
// Причины красных (осмысленные — функциональность ТЗ ещё не существует):
//   A1-A3: G.dungeonUI.vision — undefined (экспорта нет, grep 'explored'
//   по dungeon-ui.js — 0 срабатываний);
//   B1/B2/B5/B6: floor-клетки/сундук вне радиуса рисуются (маски нет —
//   dungeon-ui.js:345-349 только viewport-обрезка);
//   B3: слоя затемнения FOG_DIM_FILL нет вообще;
//   B4: (7,1) рисуется без навыка (маски нет);
//   T1: клетки в вьюпорте, но вне радиуса, рисуются.
//
// Песочница: loadDungeonUi (самокопия harness'а tests/dungeon-ui.test.js —
// каждый тест-файл автономен; dungeon-ui.js подхватывается цепочкой) +
// FOG-E1 — ВСЯ <script>-цепочка index.html (паттерн
// tests/main-visuals.test.js: WebGL/DOM/Image-стабы, __game).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const VW = 800, VH = 600;

// FOG_DIM_FILL — точное контрактное значение (D8), закреплено FOG-B3:
// hue ТОЧНО фона #0a0d12, альфа 0.65 — исследованная клетка гаснет к
// фону, но пол/маркеры просвечивают («затемнены, не скрыты»).
const FOG_DIM_FILL = 'rgba(10, 13, 18, 0.65)';

// --- Минимальный DOM-стаб (паттерн tests/dungeon-ui.test.js) ---

// Canvas 2D: методы — no-op, свойства (fillStyle и т.п.) — записываются.
// Каждый ВЫЗОВ метода — в el.drawCalls как [имя, args, fillStyle]
// (fillStyle на момент вызова — для сверки «какой цвет при чём»).
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

function makeEl(tag, buttons) {
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
    // Стаб — no-op (как в tests/dungeon-ui.test.js): старый оверлей
    // остаётся в дереве body — FOG-B5 берёт ПОСЛЕДНИЙ canvas
    // (lastCanvas), а не первый (findCanvas).
    remove() {},
    addEventListener(type, fn) {
      (this.listeners[type] || (this.listeners[type] = [])).push([fn, null]);
    },
    querySelectorAll() { return buttons; },
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
const lastCanvas = (el) => allCanvases(el, []).pop();

// Загрузка цепочки src-скриптов (порядок index.html) + dungeon-ui.js в
// vm-песочнице. Опции — зеркало loadDungeonUi из tests/dungeon-ui.test.js.
function loadDungeonUi(opts = {}) {
  const keydown = [];
  const errors = [];
  const buttons = [];
  const document = {
    createElement: (tag) => {
      const el = makeEl(tag, buttons);
      if (tag === 'button') buttons.push(el);
      return el;
    },
    body: makeEl('body', buttons),
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
  const chain = ['global-settings.js', 'perlin.js', 'map.js', 'controls.js'];
  if (opts.withCombat) {
    chain.push('skills-data.js', 'items-data.js', 'player.js', 'items.js',
      'combat.js', 'combat-keys.js', 'combat-ui.js');
  }
  chain.push('dungeon.js');
  if (opts.withSprites) chain.push('sprites.js');
  chain.push('dungeon-ui.js');
  // motion.js ПОСЛЕ dungeon-ui.js (UMD-ловушка, 000038 — зеркало index.html).
  chain.push('motion.js');
  for (const f of chain) vm.runInContext(src(f), sandbox, { filename: f });
  return { G: sandbox.Game, keydown, body: document.body, errors, window };
}

// Стабы rAF/cAF: кадр — только по ЯВНОМУ вызову теста (паттерн
// tests/dungeon-ui.test.js: авто-продвижения нет).
function makeRafStubs() {
  const scheduled = [];
  const cancelled = [];
  let id = 0;
  return {
    scheduled, cancelled,
    requestAnimationFrame(fn) { scheduled.push(fn); return ++id; },
    cancelAnimationFrame(x) { cancelled.push(x); },
  };
}

// Отработать ОДИН следующий кадр rAF-цикла.
function tick(rafStubs) {
  assert.ok(rafStubs.scheduled.length > 0, 'rAF: следующий кадр запланирован');
  rafStubs.scheduled[rafStubs.scheduled.length - 1]();
}

// Минимальное состояние подземелья — форма main.js (maybeEnterDungeon):
// 5×5 по умолчанию, стены периметром, пол внутри; hero (1,1),
// entrance (1,1), exit (w−2, h−2).
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
  const dg = {
    type: opts.type != null ? opts.type : 0, // DUNGEON_TYPES
    width: w, height: h,
    cells,
    entrance: { x: 1, y: 1 },
    exit: { x: w - 2, y: h - 2 },
  };
  if (opts.wallObjs) dg.wallObjs = opts.wallObjs;
  const s = {
    dg,
    contents: { chests: opts.chests || [], mobs: opts.mobs || [] },
    x: opts.px != null ? opts.px : 1,
    y: opts.py != null ? opts.py : 1,
    log: ['простая пещера: вход.'],
  };
  if (opts.pos) s.pos = opts.pos;
  return s;
}

// --- Ассерты по drawCalls ---

// floor-клетка в ТОЧНЫХ экранных координатах (угол клетки, размер zoom,
// fillStyle '#182029' — цвет пола, фолбэк «как сейчас»).
function floorRectAt(drawCalls, x, y, size, tol = 1e-9) {
  return drawCalls.some((c) => c[0] === 'fillRect' && c[2] === '#182029'
    && Math.abs(c[1][0] - x) <= tol
    && Math.abs(c[1][1] - y) <= tol
    && Math.abs(c[1][2] - size) <= tol
    && Math.abs(c[1][3] - size) <= tol);
}

// fillRect цветом color в ТОЧНЫХ координатах/размерах.
function fillRectAt(drawCalls, color, x, y, w, h, tol = 1e-9) {
  return drawCalls.some((c) => c[0] === 'fillRect' && c[2] === color
    && Math.abs(c[1][0] - x) <= tol
    && Math.abs(c[1][1] - y) <= tol
    && Math.abs(c[1][2] - w) <= tol
    && Math.abs(c[1][3] - h) <= tol);
}

// Маркер выхода «X»: fillRect '#d4b45a' (размер zoom−4) или fillText 'X'.
function exitMarkerDrawn(drawCalls, zoom) {
  return drawCalls.some((c) => c[0] === 'fillRect' && c[2] === '#d4b45a'
    && Math.abs(c[1][2] - (zoom - 4)) <= 1e-9)
    || drawCalls.some((c) => c[0] === 'fillText' && c[1][0] === 'X');
}

// Песочница FOG-B: 25×25, zoom 40, hero (1,1) — цель камеры (1.5, 1.5)
// вне кламп-диапазона [10, 15]×[7.5, 17.5] → cam ЗАЖАТ на (10, 7.5) во
// ВСЕХ кадрах (кламп ПОСЛЕ cameraStep; шаги героя в пределах (8,1) цель
// (8.5, 1.5) — тоже вне клампа). Вьюпорт-диапазон: x 0..20, y 0..15.
// P(x, y) — проекция клетки при этом cam (та же формула, что мир).
function loadFogDungeon(opts = {}) {
  const rafStubs = makeRafStubs();
  const T = { t: 1000 };
  const loaded = loadDungeonUi(Object.assign({
    performance: { now: () => T.t },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  }, opts));
  const s = makeState(Object.assign({ width: 25, height: 25 },
    opts.stateOpts || {}));
  loaded.G.dungeonUI.start(Object.assign({
    state: s, onMove() {}, zoom: 40,
  }, opts.startOpts || {}));
  return {
    G: loaded.G, body: loaded.body, errors: loaded.errors,
    s, rafStubs, T,
    P: (x, y) => loaded.G.worldToScreen(
      x, y, VW / 2 / 40, VH / 2 / 40, 40, VW, VH),
  };
}

// =====================================================================
// FOG-A: чистое ядро G.dungeonUI.vision
// (ТЗ: «Чистая функция видимости (tests/, node)»)
// =====================================================================

test('туман FOG-A1: радиус = база × mult — границы 1.0/1.1/1.2 (чебышёв, ceil+ε)', () => {
  const { G } = loadDungeonUi();
  const v = G.dungeonUI.vision;
  assert.ok(v, 'G.dungeonUI.vision — экспорт ядра видимости (000136)');
  assert.equal(v.baseRadius, 5, 'baseRadius = 5 (VISION_BASE_RADIUS, D2)');
  // Пины D2: R = ceil(5·mult − 1e-9). ε — защита от float: 5×1.8 =
  // 9.0000000000000002 → без ε ceil дал бы 10 (≠ +80%).
  const pins = [
    [1.0, 5], [1.1, 6], [1.2, 6], [1.3, 7], [1.5, 8], [1.8, 9], [2.0, 10],
  ];
  for (const [mult, R] of pins) {
    assert.equal(v.radiusFor(mult), R, 'radiusFor(' + mult + ') = ' + R);
  }
  // Guards: мусор/не-число/≤ 0 → baseRadius (тихая деградация, без краха).
  for (const bad of ['junk', null, NaN, 0, -1]) {
    assert.equal(v.radiusFor(bad), 5,
      'radiusFor(' + String(bad) + ') — фолбэк baseRadius');
  }
  // Границы (ТЗ: «граница на нужной клетке»): клетка на РАССТОЯНИИ
  // РОВНО R — видима (2), R+1 — скрыта (0, неисследованная).
  for (const mult of [1.0, 1.1, 1.2]) {
    const R = v.radiusFor(mult);
    const m = v.maskFor(25, 25, 1, 1, R, new Set());
    assert.equal(m[1 * 25 + (1 + R)], 2,
      'mult ' + mult + ' (R=' + R + '): клетка (' + (1 + R) + ',1) — '
      + 'граница — видима');
    assert.equal(m[1 * 25 + (1 + R + 1)], 0,
      'mult ' + mult + ' (R=' + R + '): клетка (' + (1 + R + 1) + ',1) — '
      + 'вне — скрыта');
  }
});

test('туман FOG-A2: маска — 2 видно / 1 explored (затемнено) / 0 скрыто', () => {
  const { G } = loadDungeonUi();
  const v = G.dungeonUI.vision;
  assert.ok(v, 'G.dungeonUI.vision — экспорт ядра видимости (000136)');
  const R = v.radiusFor(1.0); // 5
  // explored — ключи 'x,y' (конвенция проекта, dungeonMemory).
  const explored = new Set(['7,1', '9,9', '20,20', '2,2']);
  const m = v.maskFor(25, 25, 1, 1, R, explored);
  assert.ok(m instanceof Uint8Array, 'maskFor → Uint8Array(w·h)');
  assert.equal(m.length, 25 * 25, 'маска — по всей сетке w·h');
  // 2 — видно: внутри радиуса, исследованные и нет (исследованная
  // В РАДИУСЕ не затемняется — затемнение только mask == 1).
  assert.equal(m[1 * 25 + 1], 2, 'центр (1,1) — видно');
  assert.equal(m[1 * 25 + (1 + R)], 2, 'граница (' + (1 + R) + ',1) — видно');
  assert.equal(m[2 * 25 + 2], 2,
    '(2,2) — explored, но в радиусе — видно (не затемнено)');
  // 1 — explored вне радиуса (затемнение, не скрыто).
  assert.equal(m[1 * 25 + 7], 1, '(7,1) — explored вне радиуса — затемнено');
  assert.equal(m[9 * 25 + 9], 1, '(9,9) — explored вне радиуса — затемнено');
  assert.equal(m[20 * 25 + 20], 1, '(20,20) — explored далеко — затемнено');
  // 0 — неисследованное вне радиуса (скрыто).
  assert.equal(m[1 * 25 + 8], 0, '(8,1) — unexplored вне радиуса — скрыто');
  assert.equal(m[24 * 25 + 24], 0, '(24,24) — unexplored — скрыто');
  // Дробный центр (глейд, playerPos): +0.5-сдвигов НЕТ — сравнение
  // |x − cx| напрямую (подводный камень #3 контракта).
  const mf = v.maskFor(25, 25, 1.5, 1, R, new Set());
  assert.equal(mf[1 * 25 + 1], 2, '(1,1) из центра (1.5,1) — cheb 1 — видно');
  assert.equal(mf[1 * 25 + 7], 0, '(7,1) из центра (1.5,1) — cheb 5.5 — скрыто');
});

test('туман FOG-A3: детерминизм — одна (pos, explored, radius) → одна маска; exploredSet не мутирован', () => {
  const { G } = loadDungeonUi();
  const v = G.dungeonUI.vision;
  assert.ok(v, 'G.dungeonUI.vision — экспорт ядра видимости (000136)');
  const R = v.radiusFor(1.0);
  const explored = new Set(['7,1', '9,9']);
  const before = [...explored].sort();
  const m1 = v.maskFor(25, 25, 1, 1, R, explored);
  const m2 = v.maskFor(25, 25, 1, 1, R, explored);
  assert.deepEqual(m1, m2, 'повторный вызов — идентичная маска (детерминизм)');
  assert.deepEqual([...explored].sort(), before,
    'maskFor — чистая: exploredSet не мутирует (только .has)');
  // Другой explored → другая маска (клетка вне радиуса: 0 → 1).
  const explored2 = new Set(['9,9']);
  const m3 = v.maskFor(25, 25, 1, 1, R, explored2);
  assert.equal(m3[1 * 25 + 7], 0, '(7,1) без explored — скрыто');
  assert.ok(!m1.every((b, i) => b === m3[i]),
    'разный explored — разные маски');
  // Тот же explored, другой pos → маска сдвинута.
  const m4 = v.maskFor(25, 25, 3, 3, R, explored);
  assert.ok(!m1.every((b, i) => b === m4[i]),
    'другой pos — другая маска');
});

// =====================================================================
// FOG-B: vm-e2e (drawCalls) — e2e-кейсы ТЗ
// =====================================================================

test('туман FOG-B1: вход — клетки вне радиуса НЕ видны; выход «X» вне радиуса не рисуется', () => {
  const { body, errors, s, rafStubs, T, P } = loadFogDungeon();
  assert.ok(!s.kind, 'предусловие: подземелье (не город)');
  T.t += 16;
  tick(rafStubs);
  const calls = findCanvas(body).drawCalls;
  // Клетка героя и граница радиуса (R = 5 — пин FOG-A1) — нарисованы.
  assert.ok(floorRectAt(calls, P(1, 1).x, P(1, 1).y, 40),
    'клетка героя (1,1) — нарисована');
  assert.ok(floorRectAt(calls, P(6, 1).x, P(6, 1).y, 40),
    'граница (6,1) — cheb 5 — нарисована');
  // В вьюпорте, но вне радиуса — НЕ нарисована (туман; viewport-
  // обрезка без маски рисовала бы ВСЁ в диапазоне).
  assert.ok(!floorRectAt(calls, P(10, 5).x, P(10, 5).y, 40),
    '(10,5) — cheb 9 от (1,1) — вне радиуса — НЕ нарисована');
  // Выход (23,23) — вне радиуса и неисследован → маркер НЕ рисуется
  // вообще (раньше — рисовался без учёта радиуса/вьюпорта).
  assert.ok(!exitMarkerDrawn(calls, 40),
    'выход «X» (23,23) — вне радиуса и неисследован — не рисуется');
  // Вход (1,1) — в видимости → «как сейчас» (позиция/размер без
  // изменений: zoom−8, смещение +4/+4).
  assert.ok(fillRectAt(calls, '#3f9d55',
      P(1, 1).x + 4, P(1, 1).y + 4, 32, 32),
    'вход (1,1) — в видимости — рисуется');
  assert.equal(errors.length, 0,
    'нет console.error (фолбэк радиуса молчащий, D5): '
    + JSON.stringify(errors));
});

test('туман FOG-B2: шаг — радиус следует за героем', () => {
  const { body, errors, s, rafStubs, T, P } = loadFogDungeon();
  T.t += 16;
  tick(rafStubs);
  const calls = findCanvas(body).drawCalls;
  // До шага: (10,5) — cheb 9 от (1,1) — не нарисована.
  assert.ok(!floorRectAt(calls, P(10, 5).x, P(10, 5).y, 40),
    'до шага: (10,5) вне радиуса (от (1,1)) — НЕ нарисована');
  // Шаг героя на (8,1) (симуляция хода: s.x/s.y — паттерн L806;
  // cam зажат на (10, 7.5) — цель (8.5, 1.5) вне клампа).
  s.x = 8;
  s.y = 1;
  T.t += 16;
  tick(rafStubs);
  assert.ok(floorRectAt(calls, P(8, 1).x, P(8, 1).y, 40),
    '(8,1) — клетка героя — нарисована');
  assert.ok(floorRectAt(calls, P(13, 1).x, P(13, 1).y, 40),
    '(13,1) — новая граница (cheb 5 от (8,1)) — нарисована');
  assert.ok(floorRectAt(calls, P(10, 5).x, P(10, 5).y, 40),
    '(10,5) — вошла в радиус от (8,1) (cheb 4) — нарисована');
  assert.ok(!floorRectAt(calls, P(14, 1).x, P(14, 1).y, 40),
    '(14,1) — cheb 6 от (8,1), неисследованная — НЕ нарисована');
  assert.equal(errors.length, 0, 'нет console.error: ' + JSON.stringify(errors));
});

test('туман FOG-B3: возврат на исследованную — затемнение (FOG_DIM_FILL), а не «слепота»', () => {
  const { body, errors, s, rafStubs, T, P } = loadFogDungeon();
  T.t += 16;
  tick(rafStubs); // кадр 1: (1,1) и окрестности — explored
  s.x = 8;
  s.y = 1;
  T.t += 16;
  tick(rafStubs); // кадр 2: (1,1) — cheb 7 от (8,1): explored, вне радиуса
  const calls = findCanvas(body).drawCalls;
  const p11 = P(1, 1);
  assert.ok(floorRectAt(calls, p11.x, p11.y, 40),
    '(1,1) — explored вне радиуса — пол РИСУЕТСЯ (не «слепота»)');
  assert.ok(fillRectAt(calls, FOG_DIM_FILL, p11.x, p11.y, 40, 40),
    'слой затемнения ' + FOG_DIM_FILL + ' поверх (1,1): та же проекция, '
    + 'zoom×zoom (полупрозрачный — пол просвечивает)');
  // Видимая клетка (клетка героя) — НЕ затемнена (mask == 2).
  const p81 = P(8, 1);
  assert.ok(!fillRectAt(calls, FOG_DIM_FILL, p81.x, p81.y, 40, 40),
    '(8,1) — видимая клетка — не затемнена');
  // Порядок слоёв: затемнение — ДО игрока (игрок никогда не затемнён).
  let dimIdx = -1;
  let playerIdx = -1;
  for (let i = calls.length - 1; i >= 0; i--) {
    if (playerIdx < 0 && calls[i][0] === 'moveTo') playerIdx = i;
    if (dimIdx < 0 && calls[i][0] === 'fillRect'
        && calls[i][2] === FOG_DIM_FILL) dimIdx = i;
  }
  assert.ok(playerIdx >= 0, 'ромб игрока в кадре');
  assert.ok(dimIdx >= 0 && dimIdx < playerIdx,
    'затемнение — до игрока в порядке кадра: ' + dimIdx + ' < ' + playerIdx);
  assert.equal(errors.length, 0, 'нет console.error: ' + JSON.stringify(errors));
});

test('туман FOG-B4: «Кошачий глаз» (visionMult live) — радиус шире БЕЗ перезагрузки', () => {
  let mult = 1.0;
  const { body, errors, rafStubs, T, P } = loadFogDungeon({
    // Функция (не getter/число): start() делает {...opts} — getter
    // замёрз бы при входе (подводный камень #1); live — только функция.
    startOpts: { visionMult: () => mult },
  });
  T.t += 16;
  tick(rafStubs);
  const calls = findCanvas(body).drawCalls;
  // (7,1) — cheb 6 от (1,1): без навыка (R = 5) — не нарисована.
  assert.ok(!floorRectAt(calls, P(7, 1).x, P(7, 1).y, 40),
    'без навыка: (7,1) вне радиуса 5 — НЕ нарисована');
  // «Кошачий глаз» ×1.2 — live-чтение на СЛЕДУЮЩЕМ кадре (без
  // перезагрузки, без нового start): R = 6 → (7,1) на границе.
  mult = 1.2;
  T.t += 16;
  tick(rafStubs);
  assert.ok(floorRectAt(calls, P(7, 1).x, P(7, 1).y, 40),
    '×1.2 (R = 6): (7,1) — граница — видима (live, без перезагрузки)');
  assert.equal(errors.length, 0,
    'visionMult-функция — без console.error: ' + JSON.stringify(errors));
});

test('туман FOG-B5: повторный вход — explored сброшен (визит-состояние)', () => {
  const { G, body, errors, s, rafStubs, T, P } = loadFogDungeon();
  // Визит 1: hero (1,1) → шаг (8,1): (8,1) исследована.
  T.t += 16;
  tick(rafStubs);
  s.x = 8;
  s.y = 1;
  T.t += 16;
  tick(rafStubs);
  const calls1 = findCanvas(body).drawCalls;
  assert.ok(floorRectAt(calls1, P(8, 1).x, P(8, 1).y, 40),
    'визит 1: (8,1) — клетка героя — нарисована (база для explored)');
  G.dungeonUI.close();
  assert.equal(G.dungeonUI.isActive(), false, 'оверлей закрыт (close)');
  // Визит 2: НОВОЕ состояние, hero (1,1): (8,1) — cheb 7 от (1,1),
  // неисследованна В ЭТОМ визите → не нарисована (explored — визит).
  const s2 = makeState({ width: 25, height: 25 });
  G.dungeonUI.start({ state: s2, onMove() {}, zoom: 40 });
  T.t += 16;
  tick(rafStubs);
  // НОВЫЙ canvas — ПОСЛЕДНИЙ в дереве (remove() стаба — no-op: старый
  // оверлей остался; первый canvas — визит 1).
  const calls = lastCanvas(body).drawCalls;
  assert.ok(calls.length > 0, 'визит 2 — новый canvas с кадрами');
  assert.ok(!floorRectAt(calls, P(8, 1).x, P(8, 1).y, 40),
    '(8,1) — explored в ПРОШЛОМ визите, в этом — нет — НЕ нарисована');
  assert.equal(errors.length, 0, 'нет console.error: ' + JSON.stringify(errors));
});

test('туман FOG-B6: сундук/выход вне радиуса и неисследованные — не рисуются; видимый — как сейчас', () => {
  const { body, errors, rafStubs, T, P } = loadFogDungeon({
    stateOpts: {
      chests: [
        { x: 12, y: 12, opened: false }, // cheb 11 от (1,1)
        { x: 2, y: 1, opened: false },   // cheb 1 от (1,1)
      ],
    },
  });
  T.t += 16;
  tick(rafStubs);
  const calls = findCanvas(body).drawCalls;
  // Сундук (12,12) — вне радиуса, неисследован → фолбэк НЕ рисуется
  // (золотой квадрат #e0b13c + тёмная полоса #7a5c16 — отсутствуют).
  const p1212 = P(12, 12);
  assert.ok(!fillRectAt(calls, '#e0b13c', p1212.x + 3, p1212.y + 3, 34, 34),
    'сундук (12,12) — вне радиуса и неисследован — не рисуется');
  assert.ok(!fillRectAt(calls, '#7a5c16', p1212.x + 3, p1212.y + 19, 34, 2),
    'сундук (12,12) — полоса фолбэка — не рисуется');
  // Выход «X» (23,23) — вне радиуса, неисследован — не рисуется.
  assert.ok(!exitMarkerDrawn(calls, 40),
    'выход «X» (23,23) — вне радиуса — не рисуется');
  // Сундук (2,1) — в видимости (cheb 1) — «как сейчас»: ТОТАЖЕ
  // позиция/размер фолбэка (zoom−6, смещение +3/+3; полоса +zoom/2−1).
  const p21 = P(2, 1);
  assert.ok(fillRectAt(calls, '#e0b13c', p21.x + 3, p21.y + 3, 34, 34),
    'сундук (2,1) — в видимости — рисуется');
  assert.ok(fillRectAt(calls, '#7a5c16', p21.x + 3, p21.y + 19, 34, 2),
    'сундук (2,1) — полоса — рисуется (позиция/размер без изменений)');
  assert.equal(errors.length, 0, 'нет console.error: ' + JSON.stringify(errors));
});

// =====================================================================
// FOG-C1: регрессия — src/dungeon.js НЕ изменён (зелёный пин)
// =====================================================================

test('туман FOG-C1: регрессия — src/dungeon.js не изменён (нулевая diff, ТЗ)', (t) => {
  // Прецедент git-пина — tests/sync-all.test.js (spawnSync; git
  // недоступен → skip с предупреждением).
  // МЕЖЗАДАЧНАЯ МИНА (memory/000136-dungeon-fog-vision.md): любая
  // последующая задача, легитимно правящая dungeon.js (000133 —
  // сундуки/пул и др.), сломает этот пин в СВОЁМ сьюте — та задача
  // ре-пинит/убирает пин в своей красной/зелёной стадии (аудит §6).
  const diff = spawnSync('git',
    ['diff', '--name-only', 'HEAD', '--', 'src/dungeon.js'],
    { cwd: ROOT, encoding: 'utf8' });
  if (diff.error) {
    t.skip('git недоступен: ' + diff.error.message);
    return;
  }
  if (diff.status !== 0) {
    t.skip('git diff не выполнен: ' + (diff.stderr || ''));
    return;
  }
  assert.equal(diff.stdout.trim(), '',
    'git diff HEAD -- src/dungeon.js — пуст (ядро не мутирует)');
  const st = spawnSync('git',
    ['status', '--porcelain', '--', 'src/dungeon.js'],
    { cwd: ROOT, encoding: 'utf8' });
  if (st.error || st.status !== 0) {
    t.skip('git status недоступен: '
      + ((st && (st.stderr || (st.error && st.error.message))) || ''));
    return;
  }
  assert.equal(st.stdout.trim(), '',
    'нет незакоммиченных изменений src/dungeon.js');
});

// =====================================================================
// FOG-E1: full-chain smoke (зелёный пин)
// =====================================================================
//
// ВСЯ <script>-цепочка index.html (паттерн tests/main-visuals.test.js):
// единственный тест, проверяющий проводку main.js (startLocationUI →
// opts.visionMult → G.derived(hero) → caveVisionMult) end-to-end.
// enterDungeon + «Кошачий глаз» (train) + кадры подземелья —
// errors.length === 0. Защита от UMD-ловушки при проводке: G.derived
// читается live в момент кадра (player.js в цепочке — на месте).

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

// --- Canvas 2D-стаб: каждый ВЫЗОВ метода — [имя, args] ---
function makeFullContext2d(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

// --- «Снисходительный» DOM-элемент: known-свойства настоящие,
// неизвестные методы — no-op (main.js при загрузке DOM-тяжёлый) ---
function makeFullEl(tag) {
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
    target.getContext = (kind) => (kind === '2d'
      ? makeFullContext2d(target) : null);
  }
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return () => undefined; // неизвестный метод DOM — no-op
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

// Цепочка скриптов — из index.html (не хардкод: изменения порядка
// подхватятся сами; регрессия порядка — tests/index-order.test.js).
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));

// Окно «браузера» песочницы.
const FULL_VIEW_W = 1280;
const FULL_VIEW_H = 720;
// Фиксированное время кадра (performance.now тоже = NOW).
const NOW = 1000;

function bootFullChain() {
  const winListeners = {};
  const raf = [];
  const warns = [];
  const errors = [];
  const gameCanvas = makeFullEl('canvas');
  const spriteCanvas = makeFullEl('canvas');
  const hud = makeFullEl('div');
  // #game — WebGL (без него main.js уходит в фолбэк «WebGL не
  // поддерживается» и игра не стартует); #sprites — 2d со спаем.
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl() : makeFullContext2d(gameCanvas));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? makeFullContext2d(spriteCanvas) : null);
  const document = {
    createElement: (tag) => makeFullEl(tag),
    getElementById: (id) => (
      id === 'game' ? gameCanvas
        : id === 'sprites' ? spriteCanvas
          : id === 'hud' ? hud
            : null
    ),
    body: makeFullEl('body'),
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    hidden: false,
    // documentElement/requestFullscreen не заданы →
    // fullscreen.supported = false → кнопки нет (безопасно).
  };
  const window = {
    innerWidth: FULL_VIEW_W,
    innerHeight: FULL_VIEW_H,
    location: { search: '' },
    addEventListener: (t, f) => {
      (winListeners[t] || (winListeners[t] = [])).push(f);
    },
    removeEventListener() {},
    // localStorage нет → main.js: saveStorage = undefined →
    // сейвы в песочнице не пишутся.
  };
  // Image-стаб: src ставится ПОСЛЕ onload/onerror (main.js). Загрузка —
  // микротаск: assets/map.png ВСЕГДА onerror (детерминированный фолбэк
  // G.generateSeedPixels, main.js loadMapPixels), остальные — onload.
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
  return { sandbox, winListeners, raf, warns, errors, gameCanvas,
    spriteCanvas, hud };
}

// Промывка микротасков (загрузки Image + loadMapPixels().then: создание
// карты, спавн, requestAnimationFrame(frame)).
const drain = () => new Promise((r) => setImmediate(r));

async function bootFull() {
  const h = bootFullChain();
  await drain();
  await drain();
  await drain();
  await drain();
  return h;
}

test('туман FOG-E1: полная цепочка — enterDungeon + «Кошачий глаз» + кадры: без ошибок', async () => {
  const h = await bootFull();
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет (порядок цепочки): ' + h.errors.join('; '));
  const g = h.sandbox.__game;
  assert.ok(g, 'globalThis.__game выставлен (main.js выполнен)');
  // «Кошачий глаз»: очки + требование основного навыка (Ловкость ≥ 1).
  g.actions.givePoints(3);
  assert.equal(g.actions.train('dexterity').ok, true,
    '«Ловкость» поднята (требование «Кошачьего глаза»)');
  const r = g.actions.train('catseye');
  assert.equal(r.ok, true,
    '«Кошачий глаз» поднят: ' + (r.reason || ''));
  // Подземелье (отладочный вход, 000127) → startLocationUI →
  // opts.visionMult (live: G.derived(hero) → caveVisionMult = 1.1).
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon — состояние подземелья');
  assert.ok(g.dungeon, '__game.dungeon — подземелье активно');
  // Кадры подземелья (rAF-цикл dungeon-ui: последний отложенный
  // колбэк — tick; main.js frame не вызывается — мир за кадром):
  // live-чтение visionMult на каждом кадре — без ошибок.
  for (let i = 0; i < 3; i++) h.raf[h.raf.length - 1](NOW);
  assert.equal(h.errors.length, 0,
    'нет ошибок после входа + «Кошачий глаз» + кадров '
    + '(проводка main.js end-to-end): ' + h.errors.join('; '));
});

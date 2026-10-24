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
// src/dungeon.js пуст — рабочее дерево + дельта ВЕТКИ к master
// (master...HEAD, правка по итогам ревью: пин по HEAD не ловил
// закоммиченную правку dungeon.js на ветке); МЕЖЗАДАЧНАЯ МИНА:
// последующая задача, правящая dungeon.js — 000133 и др. — ре-пинит/
// убирает пин в своей задаче, правило аудита §6), FOG-E1 (full-chain
// smoke: enterDungeon + «Кошачий глаз» + кадры — без ошибок), FOG-E2
// (full-chain e2e: «Кошачий глаз» (навык > 0) — радиус шире ЧЕРЕЗ
// реальную проводку main.js: opts.visionMult → G.derived(hero) →
// caveVisionMult → radiusFor → маска → рендер; e2e-кейс ТЗ,
// правка по итогам ревью).
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
    // 000151: combat-scale.js — ПЕРЕД combat-ui.js (та же пара, что в
    // index.html; цепочка зеркалит браузер, зеркало tests/dungeon-ui.
    // test.js). Без него console.error-гард combat-ui.js (деградация
    // 1:1) → ассерты errors.length === 0 падали бы (техническая
    // правка проводки, ассерты без правок).
    chain.push('skills-data.js', 'items-data.js', 'sheet.js',
      'player.js', 'items.js',
      'combat.js', 'combat-keys.js', 'combat-scale.js', 'combat-ui.js');
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
// entrance (1,1), exit = entrance (1,1) — единый тайл (000177).
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
    // 000177: единый тайл — exit = entrance.
    exit: { x: 1, y: 1 },
  };
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

// Маркер единого тайла (000177) на КЛЕТКЕ (x, y): fillRect '#d4b45a'
// (размер zoom−4, смещение +2/+2) или fillText 'E' (центр x+zoom/2,
// y+zoom−5; tol — для текстовой метки).
function portalMarkerAt(drawCalls, x, y, zoom, tol = 1e-9) {
  return drawCalls.some((c) => c[0] === 'fillRect' && c[2] === '#d4b45a'
    && Math.abs(c[1][0] - (x + 2)) <= 1e-9
    && Math.abs(c[1][1] - (y + 2)) <= 1e-9
    && Math.abs(c[1][2] - (zoom - 4)) <= 1e-9)
    || drawCalls.some((c) => c[0] === 'fillText' && c[1][0] === 'E'
    && Math.abs(c[1][1] - (x + zoom / 2)) <= tol
    && Math.abs(c[1][2] - (y + zoom - 5)) <= tol);
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
  // Утиный тип, а не instanceof: маска — Uint8Array из ВМ-области
  // песочницы — instanceof Uint8Array хоста не проходит (паттерн
  // tests/main-visuals.test.js:978 — defeatedAt). deepEqual ниже
  // работает кросс-realm (FOG-A3).
  assert.equal(Object.prototype.toString.call(m),
    '[object Uint8Array]', 'maskFor → Uint8Array(w·h)');
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

test('туман FOG-B1: вход — клетки вне радиуса НЕ видны; маркер единого тайла (000177) — на входе (в видимости), на дальних клетках — нет', () => {
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
  // 000177: exit = entrance = (1,1) — тайл в видимости → маркер
  // рисуется (квадрат #d4b45a, zoom−4; буква «E»).
  assert.ok(fillRectAt(calls, '#d4b45a',
      P(1, 1).x + 2, P(1, 1).y + 2, 36, 36),
    'единый тайл (1,1) — в видимости — маркер рисуется');
  // Старых маркеров нет: «X» и зелёный вход-квадрат #3f9d55.
  assert.ok(!calls.some((c) => c[0] === 'fillText' && c[1][0] === 'X'),
    'старый маркер «X» — нет (000177: единый тайл)');
  assert.ok(!calls.some((c) => c[0] === 'fillRect' && c[2] === '#3f9d55'),
    'старый вход-квадрат #3f9d55 — нет (000177: единый тайл)');
  // Маркера на дальней клетке (23,23) — нет (выход там больше не
  // живёт; клетка и вовсе вне радиуса/неисследована).
  assert.ok(!portalMarkerAt(calls, P(23, 23).x, P(23, 23).y, 40),
    '(23,23) — маркера нет (выход = вход (1,1), 000177)');
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

test('туман FOG-B6: сундук вне радиуса и неисследованный — не рисуется; видимый — как сейчас; маркер тайла — на входе (000177)', () => {
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
  // 000177: exit = entrance = (1,1) — в видимости → маркер рисуется
  // на тайле героя; на дальней клетке (23,23) маркера нет.
  assert.ok(portalMarkerAt(calls, P(1, 1).x, P(1, 1).y, 40, 4),
    'единый тайл (1,1) — в видимости — маркер рисуется');
  assert.ok(!portalMarkerAt(calls, P(23, 23).x, P(23, 23).y, 40, 4),
    '(23,23) — маркера нет (выход = вход (1,1), 000177)');
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
// FOG-C1: регрессия «src/dungeon.js не изменён» — УБРАН в задаче
// 000133 (зелёная стадия).
//
// МЕЖЗАДАЧНАЯ МИНА сработала как спроектировано
// (memory/000136-dungeon-fog-vision.md; правило аудита §6): 000133
// легитимно правит FALLBACK_DUNGEONS в src/dungeon.js (свитки
// заклинаний — 1:1 с каталогом, ТЗ) → условие пина «файл заморожен»
// больше не выполняется ни на ветке, ни после мержа. Назначение пина
// (гард скоупа 000136: туман не трогает ядро) на master исчерпано.
// Содержимое dungeon.js осталось ЗАКРЕПЛЁНЫМ: deepEqual-пины
// FALLBACK_DUNGEONS 1:1 с каталогом (tests/dungeon.test.js :343-356
// + tests/index-order.test.js DUNGEON_ITEMS, в 000133 ре-пинирован
// под новые свитки).

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

// --- Canvas 2D-стаб: каждый ВЫЗОВ метода — [имя, args, fillStyle] ---
function makeFullContext2d(el) {
  const calls = el.drawCalls = [];
  // fillStyle на момент ВЫЗОВА (правка по итогам ревью 000136): FOG-E2
  // сверяет цвет/координаты пол-клеток; FOG-E1 форму calls не читает.
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

// =====================================================================
// FOG-E2: full-chain e2e (правка по итогам ревью 000136): «Кошачий
// глаз» (навык > 0) — радиус шире (derived live) ЧЕРЕЗ реальную
// проводку main.js
// =====================================================================
//
// E2e-кейс ТЗ закрывался частично: FOG-B4 доказывал live-механику
// visionMult, но ФУНКЦИЮ давал тест (G.derived не участвует); FOG-E1
// прогоняет полную цепочку, но ассертит только errors.length === 0.
// FOG-E2 — прямая асеркция на РИСУЕМЫЙ радиус через startLocationUI →
// opts.visionMult → G.derived(hero) → caveVisionMult → radiusFor →
// маску:
//   кадр 1 (навыка НЕТ): кольцо cheb 6 — в тумане (база R = 5 — та же
//     проводка, phantom-радиуса нет);
//   навык > 0 ПО ВРЕМЯ визита (live, без перезагрузки/пересоздания
//   оверлея) → кадр 2: кольцо cheb 6 видно, cheb 7 скрыто — R = 6
//   РОВНО (1 + 0.1 = 1.1 → ceil(5.5 − 1e-9) = 6, D2).
// Ловит любой разрыв links: guard, всегда возвращающий 1, опечатка в
// имени стата (caveVisionMult → undefined → 1 → R = 5), сломанный
// вызов G.derived (исключение → try/catch dungeon-ui → 1 → R = 5),
// заморозка значения при входе (train во время визита — без эффекта).
// Детерминизм: сид карты фиксирован (MAP_PNG_SEED), player (0,0),
// подземелье type 0, 25×25, вход/герой (7,17) — золотые клетки ниже
// (сверено прогоном; cam (8, 17.5) — кламп на вьюпорт 1280×720,
// zoom 80 = ZOOM_START, колесо в песочнице не срабатывает).

// Пол-клетка (x, y) нарисована в кадре: спрайт drawImage(img, p.x,
// p.y, zoom, zoom) (sprites.js в цепочке — Image-стаб «загружает»
// все assets кроме map.png) либо фолбэк fillRect '#182029' (FOG-B)
// в тех же координатах/размерах. Точные (p.x, p.y, zoom, zoom) —
// ТОЛЬКО слой пола: сундуки/мобы/игрок — центрированные (другие
// смещения/размеры: cs = zoom·0.8, ms, ps = zoom·1.15), стены (000258)
// — только на wall-клетках с wallTileIndex ≠ 0 (на floor — отсутствуют).
function floorCellDrawn(drawCalls, p, zoom) {
  return drawCalls.some((c) => (
    (c[0] === 'drawImage'
      && Math.abs(c[1][1] - p.x) < 1e-6
      && Math.abs(c[1][2] - p.y) < 1e-6
      && Math.abs(c[1][3] - zoom) < 1e-6
      && Math.abs(c[1][4] - zoom) < 1e-6)
    || (c[0] === 'fillRect' && c[2] === '#182029'
      && Math.abs(c[1][0] - p.x) < 1e-6
      && Math.abs(c[1][1] - p.y) < 1e-6
      && Math.abs(c[1][2] - zoom) < 1e-6
      && Math.abs(c[1][3] - zoom) < 1e-6)
  ));
}

test('туман FOG-E2: «Кошачий глаз» (derived live) — радиус шире end-to-end (проводка main.js)', async () => {
  const h = await bootFull();
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет (порядок цепочки): ' + h.errors.join('; '));
  const g = h.sandbox.__game;
  const G2 = h.sandbox.Game;
  const v = G2.dungeonUI.vision;
  assert.ok(v, 'G.dungeonUI.vision — экспорт ядра видимости (000136)');
  // catseye 1: mult = 1 + 0.1 = 1.1 → R = 6 (D2); без навыка — R = 5.
  assert.equal(v.radiusFor(1.1), 6, '×1.1 (catseye 1) — R = 6 (D2)');
  assert.equal(v.radiusFor(1.0), 5, 'база (без навыка) — R = 5');

  // Подземелье БЕЗ навыка: проводка main.js уже активна
  // (startLocationUI → opts.visionMult → G.derived(hero) →
  // caveVisionMult = 1 — навыка нет).
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon — состояние подземелья');
  const dg = g.dungeon;
  assert.ok(dg, '__game.dungeon — подземелье активно');
  // Canvas оверлея — ПОСЛЕДНИЙ в дереве body (remove() стаба — no-op,
  // паттерн lastCanvas FOG-B5).
  const cv = allCanvases(h.sandbox.document.body, []).pop();
  assert.ok(cv, 'canvas оверлея подземелья — в дереве body');
  // Камера после start(): снап к герою + кламп (та же формула clampCam
  // dungeon-ui.js). Фиксированный NOW → dt = 0 на каждом тике
  // (cameraStep: dt ≤ 0 — без движения) → cam стабилен во всех кадрах.
  const zoom = G2.ZOOM_START;
  const clampCamV = (val, extent, viewPx, z) => (extent * z <= viewPx)
    ? extent / 2
    : Math.min(extent - viewPx / 2 / z,
      Math.max(viewPx / 2 / z, val));
  const camX = clampCamV(ds.x + 0.5, dg.width, cv.width, zoom);
  const camY = clampCamV(ds.y + 0.5, dg.height, cv.height, zoom);
  // Вьюпорт-диапазон — ТА ЖЕ функция/маржа, что render dungeon-ui.
  const range = G2.visibleTileRange(camX, camY, cv.width, cv.height, zoom);
  const proj = (x, y) => G2.worldToScreen(
    x, y, camX, camY, zoom, cv.width, cv.height);
  // Floor-клетки кольца чебышёв RING от героя, в вьюпорт-диапазоне.
  const ringFloor = (ring) => {
    const out = [];
    for (let y = 0; y < dg.height; y++) {
      for (let x = 0; x < dg.width; x++) {
        if (dg.cells[y * dg.width + x] !== G2.CELL_FLOOR) continue;
        if (Math.max(Math.abs(x - ds.x), Math.abs(y - ds.y)) !== ring)
          continue;
        if (x < range.x0 || x > range.x1 || y < range.y0 || y > range.y1)
          continue;
        out.push([x, y]);
      }
    }
    return out;
  };
  // Золотые клетки (детерминизм генерации; сверено прогоном).
  const r5 = ringFloor(5);
  const r6 = ringFloor(6);
  const r7 = ringFloor(7);
  assert.ok(r5.length > 0, 'кольцо 5: floor-клетки в вьюпорте есть');
  assert.deepEqual(r6, [[13, 12], [13, 13], [13, 14], [13, 15], [13, 16]],
    'кольцо 6: floor-клетки в вьюпорте (детерминизм генерации)');
  assert.deepEqual(r7, [[14, 12], [14, 13], [14, 14], [14, 15], [14, 16]],
    'кольцо 7: floor-клетки в вьюпорте (детерминизм генерации)');

  // Кадр 1 — БЕЗ навыка: R = 5 — граница (cheb 5) видна, cheb 6 — туман.
  h.raf[h.raf.length - 1](NOW);
  let calls = cv.drawCalls.slice();
  assert.ok(calls.length > 0, 'кадр 1 отрисован (rAF-цикл оверлея)');
  for (const [x, y] of r5) {
    assert.ok(floorCellDrawn(calls, proj(x, y), zoom),
      'без навыка: (' + x + ',' + y + ') — cheb 5 (граница R = 5) — видима');
  }
  for (const [x, y] of r6) {
    assert.ok(!floorCellDrawn(calls, proj(x, y), zoom),
      'без навыка: (' + x + ',' + y + ') — cheb 6 — в тумане (R = 5)');
  }
  for (const [x, y] of r7) {
    assert.ok(!floorCellDrawn(calls, proj(x, y), zoom),
      'без навыка: (' + x + ',' + y + ') — cheb 7 — в тумане (R = 5)');
  }

  // «Кошачий глаз» ПО ВРЕМЯ визита (live-чтение на каждом кадре;train —
  // данные героя, локация не ограничена) — без перезагрузки/пересоздания
  // оверлея: быстрая заморозка значения при входе не даст эффекта.
  g.actions.givePoints(3);
  assert.equal(g.actions.train('dexterity').ok, true,
    '«Ловкость» поднята (требование «Кошачьего глаза»)');
  const r = g.actions.train('catseye');
  assert.equal(r.ok, true, '«Кошачий глаз» поднят: ' + (r.reason || ''));

  // Кадр 2 — С навыком: R = 6 — cheb 6 виден, cheb 7 — туман.
  h.raf[h.raf.length - 1](NOW);
  calls = cv.drawCalls.slice();
  for (const [x, y] of r6) {
    assert.ok(floorCellDrawn(calls, proj(x, y), zoom),
      'catseye 1 (×1.1): (' + x + ',' + y + ') — cheb 6 (граница R = 6) — '
      + 'видима (live, без перезагрузки)');
  }
  for (const [x, y] of r7) {
    assert.ok(!floorCellDrawn(calls, proj(x, y), zoom),
      'catseye 1 (×1.1): (' + x + ',' + y + ') — cheb 7 — вне R = 6 — '
      + 'в тумане');
  }
  assert.equal(h.errors.length, 0,
    'нет ошибок (проводка main.js end-to-end: opts.visionMult → '
    + 'G.derived(hero).caveVisionMult → radiusFor → маска → рендер): '
    + h.errors.join('; '));
});

// =====================================================================
// MOBV (000225): мобы за пределами зрения персонажа не отображаются
// =====================================================================
//
// ТЗ (tasks/pending/000225.md): в пещерах не должны показываться мобы,
// которые за пределами зрения персонажа.
// Контракты — memory/000225-dungeon-mob-vision.md:
//   D1: группа мобов (включая босса) рисуется, только если КЛЕТКА
//   ГРУППЫ (m.x, m.y) — mask == 2 (видно); mask == 1 (исследована,
//   вне радиуса) — моб НЕ рисуется (в отличие от пола/сундуков — те
//   остаются видимыми затемнёнными);
//   D2: гейт цикла мобов — `mask === 0` → `mask !== 2`; слои пола,
//   сундуков (mask === 0), затемнения — без изменений.
//
// КРАСНЫЕ (падают на текущем коде — гейт mask === 0 пропускает
// explored-клетки, mask 1; падают ТОЛЬКО на ассертах «вне радиуса —
// не рисуется»): MOBV-1 (legacy-группа, vm), MOBV-3 (босс: bbox +
// спрайты юнитов, vm), MOBV-5 (full-chain: подход + отход — в финальном
// кадре моб исследован и вне радиуса, а спрайт юнитов рисуется).
// ЗЕЛЁНЫЕ пины (регрессия — рисование видимых мобов не меняется):
// MOBV-2 (видимый legacy-моб — та же позиция/размер), MOBV-4
// (граница R = 5 + сундук explored вне радиуса — всё ещё рисуется,
// слой сундуков 000225 не трогает).
//
// Детерминизм MOBV-5: сид карты фиксирован (MAP_PNG_SEED), герой (7,17),
// R = 5 («Кошачьего глаза» нет), 25 клавиш: подход в зону (13,13) и
// отход в (3,20). Сверено прогоном (3 независимых запуска): g0
// (crawling_bones/skeleton) — 2 юнита; есть кадр, где g0 в радиусе
// (спрайт рисуется); финал — g0 (13,14), rendered-герой (3,19),
// cheb 10 > 5, клетка (13,14) исследована (пол + FOG_DIM_FILL).

// --- Локальные копии (автономность тест-файла; паттерн
// tests/dungeon-ui.test.js) ---

// Детерминированные смещения юнита группы ПО ИНДЕКСУ (000067).
const MOB_UNIT_OFF = [[0, 0], [-0.35, 0.15], [0.35, 0.15]];

// DI spriteLoader-стаб: «ready» — ТОЛЬКО пути из paths; изображение —
// { __img: path } (путь читаем из drawCalls).
function makeSpriteLoader(paths) {
  const ready = new Set(paths);
  const imgs = new Map();
  return {
    isReady: (p) => ready.has(p),
    image: (p) => {
      if (!ready.has(p)) return null;
      if (!imgs.has(p)) imgs.set(p, { __img: p });
      return imgs.get(p);
    },
  };
}

// Все пути базовых видов мобов MOB_FRAMES («всё готово»-набор).
function allMobFramePaths(G) {
  const out = [];
  for (const frames of Object.values(G.MOB_FRAMES)) out.push(...frames);
  return out;
}

test('мобы MOBV-1: legacy-группа (без mobIds) — explored вне радиуса: не показывается', () => {
  const { body, errors, s, rafStubs, T, P } = loadFogDungeon({
    stateOpts: {
      px: 4, py: 1,
      mobs: [{ mobIds: [], x: 8, y: 1, level: 3, defeated: false }],
    },
  });
  T.t += 16;
  tick(rafStubs); // кадр 1: hero (4,1) — cheb 4 ≤ R = 5
  const calls = findCanvas(body).drawCalls;
  const p81 = P(8, 1);
  assert.ok(fillRectAt(calls, '#d9483b', p81.x + 3, p81.y + 3, 34, 34),
    'кадр 1: (8,1) — cheb 4 ≤ R — видно — квадрат #d9483b (zoom−6, +3/+3)');
  const f1End = calls.length;
  s.x = 1;
  T.t += 16;
  tick(rafStubs); // кадр 2: hero (1,1) — (8,1) cheb 7, explored (mask 1)
  const calls2 = findCanvas(body).drawCalls.slice(f1End);
  assert.ok(floorRectAt(calls2, p81.x, p81.y, 40),
    'кадр 2: (8,1) — explored вне радиуса — пол РИСУЕТСЯ (не «слепота»)');
  assert.ok(fillRectAt(calls2, FOG_DIM_FILL, p81.x, p81.y, 40, 40),
    'кадр 2: (8,1) — затемнение ' + FOG_DIM_FILL + ' (explored)');
  assert.ok(!fillRectAt(calls2, '#d9483b', p81.x + 3, p81.y + 3, 34, 34),
    'кадр 2: группа за пределами зрения (cheb 7) — НЕ показывается (000225)');
  assert.equal(errors.length, 0, 'нет console.error: ' + JSON.stringify(errors));
});

test('мобы MOBV-2: видимая legacy-группа — рисуется (позиция/размер без изменений)', () => {
  const { body, errors, rafStubs, T, P } = loadFogDungeon({
    stateOpts: {
      mobs: [{ mobIds: [], x: 2, y: 1, level: 3, defeated: false }],
    },
  });
  T.t += 16;
  tick(rafStubs); // hero (1,1) — cheb 1
  const calls = findCanvas(body).drawCalls;
  const p21 = P(2, 1);
  assert.ok(fillRectAt(calls, '#d9483b', p21.x + 3, p21.y + 3, 34, 34),
    '(2,1) — cheb 1 ≤ R — видно — квадрат #d9483b (zoom−6, +3/+3)');
  assert.equal(errors.length, 0, 'нет console.error: ' + JSON.stringify(errors));
});

test('мобы MOBV-3: босс (bbox + спрайты юнитов) — explored вне радиуса: не показывается', () => {
  const pre = loadDungeonUi({ withSprites: true });
  const loader = makeSpriteLoader(allMobFramePaths(pre.G));
  const boss = {
    boss: true, level: 7, defeated: false,
    mobIds: ['abomination', 'lower_demon', 'lower_demon'],
    x: 8, y: 1,
  };
  const { G, body, errors, s, rafStubs, T, P } = loadFogDungeon({
    withSprites: true,
    stateOpts: { type: 4, px: 4, py: 1, mobs: [boss] },
    startOpts: { spriteLoader: loader },
  });
  // start() — синхронный кадр 0 (dungeon-ui start): счёт ассертов —
  // на кадре 1 (первый tick), не на накоплении.
  const f0End = findCanvas(body).drawCalls.length;
  T.t += 16;
  tick(rafStubs); // кадр 1: hero (4,1) — cheb 4 ≤ R = 5
  const calls = findCanvas(body).drawCalls.slice(f0End);
  const zoom = 40;
  const ms = zoom * 1.2;
  const units = boss.mobIds.map((id, i) => ({
    id,
    x: boss.x + MOB_UNIT_OFF[i % MOB_UNIT_OFF.length][0],
    y: boss.y + MOB_UNIT_OFF[i % MOB_UNIT_OFF.length][1],
  }));
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  for (const u of units) {
    minX = Math.min(minX, u.x - 0.1);
    maxX = Math.max(maxX, u.x + 1.1);
    minY = Math.min(minY, u.y - 0.1);
    maxY = Math.max(maxY, u.y + 1.1);
  }
  const bb = P(minX, minY);
  const f1End = findCanvas(body).drawCalls.length;
  assert.ok(fillRectAt(calls, '#b06ad4', bb.x, bb.y,
      (maxX - minX) * zoom, (maxY - minY) * zoom),
    'кадр 1: босс — bbox #b06ad4 (юниты ±0.1/+1.1)');
  assert.equal(calls.filter((c) => c[0] === 'fillRect'
    && c[2] === '#b06ad4').length, 1,
    'кадр 1: bbox ровно ОДИН (юниты — спрайты)');
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const frames = G.MOB_FRAMES[G.mobSpriteKind(u.id)];
    const fi = Math.floor(G.frameIndex(T.t, u.x, u.y, frames.length));
    const mc = P(u.x + 0.5, u.y + 0.5);
    const hit = calls.find((c) => c[0] === 'drawImage'
      && Math.abs(c[1][1] - (mc.x - ms / 2)) < 1e-9
      && Math.abs(c[1][2] - (mc.y - ms / 2)) < 1e-9
      && Math.abs(c[1][3] - ms) < 1e-9 && Math.abs(c[1][4] - ms) < 1e-9
      && c[1][0] && c[1][0].__img === frames[fi]);
    assert.ok(hit,
      'кадр 1: юнит ' + i + ' (' + u.id + ') — спрайт ' + frames[fi]
      + ' (zoom*1.2, центр юнита)');
  }
  assert.ok(!calls.some((c) => c[0] === 'fillRect' && c[2] === '#d9483b'),
    'кадр 1: красных квадратов #d9483b нет (юниты — спрайты)');
  s.x = 1;
  T.t += 16;
  tick(rafStubs); // кадр 2: hero (1,1) — (8,1) cheb 7, explored (mask 1)
  const calls2 = findCanvas(body).drawCalls.slice(f1End);
  const p81 = P(8, 1);
  assert.ok(floorRectAt(calls2, p81.x, p81.y, 40),
    'кадр 2: (8,1) — explored вне радиуса — пол РИСУЕТСЯ');
  assert.ok(fillRectAt(calls2, FOG_DIM_FILL, p81.x, p81.y, 40, 40),
    'кадр 2: (8,1) — затемнение (explored)');
  assert.ok(!calls2.some((c) => c[0] === 'fillRect' && c[2] === '#b06ad4'),
    'кадр 2: босс за пределами зрения (cheb 7) — bbox НЕ рисуется (000225)');
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const mc = P(u.x + 0.5, u.y + 0.5);
    const hit = calls2.some((c) => c[0] === 'drawImage'
      && Math.abs(c[1][1] - (mc.x - ms / 2)) < 1e-9
      && Math.abs(c[1][2] - (mc.y - ms / 2)) < 1e-9
      && Math.abs(c[1][3] - ms) < 1e-9 && Math.abs(c[1][4] - ms) < 1e-9);
    assert.ok(!hit,
      'кадр 2: юнит босса ' + i + ' (' + u.id + ') — НЕ показывается (000225)');
  }
  assert.equal(errors.length, 0, 'нет console.error: ' + JSON.stringify(errors));
});

test('мобы MOBV-4: граница R видима; explored-сундук вне радиуса — рисуется (слой сундуков не тронут)', () => {
  const { body, errors, s, rafStubs, T, P } = loadFogDungeon({
    stateOpts: {
      mobs: [
        { mobIds: [], x: 6, y: 1, level: 3, defeated: false },
        { mobIds: [], x: 8, y: 1, level: 3, defeated: false },
      ],
      chests: [{ x: 2, y: 1, opened: false }],
    },
  });
  T.t += 16;
  tick(rafStubs); // кадр 1: hero (1,1)
  const calls = findCanvas(body).drawCalls;
  const p61 = P(6, 1);
  const p81 = P(8, 1);
  const p21 = P(2, 1);
  assert.ok(fillRectAt(calls, '#d9483b', p61.x + 3, p61.y + 3, 34, 34),
    'кадр 1: (6,1) — cheb 5 = граница R — видно — рисуется');
  assert.ok(!fillRectAt(calls, '#d9483b', p81.x + 3, p81.y + 3, 34, 34),
    'кадр 1: (8,1) — cheb 7, неисследовано — не рисуется');
  assert.ok(fillRectAt(calls, '#e0b13c', p21.x + 3, p21.y + 3, 34, 34),
    'кадр 1: сундук (2,1) — видно — рисуется');
  const f1End = calls.length;
  s.x = 8;
  T.t += 16;
  tick(rafStubs); // кадр 2: hero (8,1) — (2,1) cheb 6, explored (mask 1)
  const calls2 = findCanvas(body).drawCalls.slice(f1End);
  assert.ok(fillRectAt(calls2, '#e0b13c', p21.x + 3, p21.y + 3, 34, 34),
    'кадр 2: сундук (2,1) — explored вне радиуса — всё ещё рисуется '
    + '(гейт сундуков mask === 0 — 000225 его не меняет)');
  assert.ok(fillRectAt(calls2, '#7a5c16', p21.x + 3, p21.y + 19, 34, 2),
    'кадр 2: полоса сундука — рисуется (позиция/размер без изменений)');
  assert.equal(errors.length, 0, 'нет console.error: ' + JSON.stringify(errors));
});

// keydown+keyup одной клавишей — ОДИН синхронный кадр (dungeon-ui
// keydown-обработчик: onMove + render; main.js dungeonOnMove).
function pressKey(h, code) {
  const e = {
    code, key: code, prevented: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() {},
  };
  for (const fn of (h.winListeners['keydown'] || []).slice()) fn(e);
  for (const fn of (h.winListeners['keyup'] || []).slice()) fn(e);
  return e;
}

test('мобы MOBV-5: полная цепочка — за пределами зрения (approach + retreat) — моб не показывается', async () => {
  const h = await bootFull();
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const g = h.sandbox.__game;
  const G2 = h.sandbox.Game;
  const R = G2.dungeonUI.vision.radiusFor(1.0);
  assert.equal(R, 5, 'без «Кошачьего глаза»: R = 5 (база)');
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon — состояние подземелья');
  const dg = g.dungeon;
  const cv = allCanvases(h.sandbox.document.body, []).pop();
  assert.ok(cv, 'canvas оверлея подземелья — в дереве body');
  const zoom = G2.ZOOM_START;
  const clampCamV = (val, extent, viewPx, z) => (extent * z <= viewPx)
    ? extent / 2
    : Math.min(extent - viewPx / 2 / z,
      Math.max(viewPx / 2 / z, val));
  const camX = clampCamV(dg.x + 0.5, dg.width, cv.width, zoom);
  const camY = clampCamV(dg.y + 0.5, dg.height, cv.height, zoom);
  const proj = (x, y) => G2.worldToScreen(
    x, y, camX, camY, zoom, cv.width, cv.height);
  const mobSize = zoom * 1.2;
  const cheb = (ax, ay, bx, by) =>
    Math.max(Math.abs(ax - bx), Math.abs(ay - by));
  const g0 = g.dungeon.contents.mobs.find((m) => m.id === 'g0');
  assert.ok(g0 && g0.mobIds.length > 0,
    'g0 — группа с mobIds (детерминированный layout)');
  // Входной кадр: все группы вне радиуса — спрайтов юнитов нет.
  h.raf[h.raf.length - 1](NOW);
  const entry = cv.drawCalls.slice();
  for (const m of g.dungeon.contents.mobs.filter((m) => !m.defeated)) {
    assert.ok(cheb(g.dungeon.x, g.dungeon.y, m.x, m.y) > R,
      'предусловие: ' + m.id + ' (' + m.x + ',' + m.y + ') на входе — '
      + 'вне радиуса R = ' + R);
  }
  const entryImgs = entry.filter((c) => c[0] === 'drawImage'
    && Math.abs(c[1][3] - mobSize) < 1e-6
    && Math.abs(c[1][4] - mobSize) < 1e-6);
  assert.equal(entryImgs.length, 0,
    'входной кадр: видимых мобов нет — спрайтов юнитов нет');
  // Подход в зону (13,13) и отход в (3,20) — 25 клавиш (детерминированно;
  // на маршруте нет боя — проверено каждый шаг).
  const KEYS = [
    'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowUp',
    'ArrowRight', 'ArrowRight', 'ArrowUp', 'ArrowUp',
    'ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft',
    'ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft',
    'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown',
    'ArrowDown',
  ];
  let mark = cv.drawCalls.length;
  const frames = [];
  for (const k of KEYS) {
    const rendered = { x: g.dungeon.x, y: g.dungeon.y };
    pressKey(h, k);
    assert.ok(!G2.combatUI.isActive(), 'на маршруте боя нет (' + k + ')');
    const start = mark;
    mark = cv.drawCalls.length;
    const m0 = g.dungeon.contents.mobs.find((m) => m.id === 'g0');
    frames.push({
      rendered,
      g0: { x: m0.x, y: m0.y },
      calls: cv.drawCalls.slice(start, mark),
    });
  }
  assert.equal(frames.length, KEYS.length,
    'каждая клавиша — один синхронный кадр');
  // Кадр, где g0 в радиусе: спрайты юнитов РИСУЮТСЯ (пин: видимый
  // моб рисуется; без него «не рисуется в финале» было бы тривиально).
  const vis = frames.find((f) =>
    cheb(f.rendered.x, f.rendered.y, f.g0.x, f.g0.y) <= R);
  assert.ok(vis, 'есть кадр, где g0 в радиусе (подход)');
  for (let i = 0; i < g0.mobIds.length; i++) {
    const u = {
      x: vis.g0.x + MOB_UNIT_OFF[i % MOB_UNIT_OFF.length][0],
      y: vis.g0.y + MOB_UNIT_OFF[i % MOB_UNIT_OFF.length][1],
    };
    const mc = proj(u.x + 0.5, u.y + 0.5);
    const hit = vis.calls.some((c) => c[0] === 'drawImage'
      && Math.abs(c[1][1] - (mc.x - mobSize / 2)) < 1e-6
      && Math.abs(c[1][2] - (mc.y - mobSize / 2)) < 1e-6
      && Math.abs(c[1][3] - mobSize) < 1e-6
      && Math.abs(c[1][4] - mobSize) < 1e-6);
    assert.ok(hit,
      'видимый кадр: юнит g0 ' + i + ' — спрайт нарисован (zoom*1.2)');
  }
  // Финальный кадр: g0 — explored вне радиуса (клетка затемнена).
  const last = frames[frames.length - 1];
  const lastCheb = cheb(
    last.rendered.x, last.rendered.y, last.g0.x, last.g0.y);
  assert.ok(lastCheb > R,
    'предусловие: g0 в финале — вне радиуса (cheb ' + lastCheb
    + ' > ' + R + ')');
  const cell = G2.snappedTileRect(
    last.g0.x, last.g0.y, camX, camY, zoom, cv.width, cv.height);
  assert.ok(floorCellDrawn(last.calls, cell, zoom),
    'финал: клетка (' + last.g0.x + ',' + last.g0.y
    + ') — explored — пол рисуется (не «слепота»)');
  assert.ok(fillRectAt(last.calls, FOG_DIM_FILL,
      cell.x, cell.y, cell.w, cell.h, 1e-6),
    'финал: клетка g0 — затемнение (explored вне радиуса)');
  // КРАСНОЕ: за пределами зрения — не показывается.
  for (let i = 0; i < g0.mobIds.length; i++) {
    const u = {
      x: last.g0.x + MOB_UNIT_OFF[i % MOB_UNIT_OFF.length][0],
      y: last.g0.y + MOB_UNIT_OFF[i % MOB_UNIT_OFF.length][1],
    };
    const mc = proj(u.x + 0.5, u.y + 0.5);
    const hit = last.calls.some((c) => c[0] === 'drawImage'
      && Math.abs(c[1][1] - (mc.x - mobSize / 2)) < 1e-6
      && Math.abs(c[1][2] - (mc.y - mobSize / 2)) < 1e-6
      && Math.abs(c[1][3] - mobSize) < 1e-6
      && Math.abs(c[1][4] - mobSize) < 1e-6);
    assert.ok(!hit,
      'финал: юнит g0 ' + i + ' — за пределами зрения — НЕ показывается (000225)');
  }
  const lastImgs = last.calls.filter((c) => c[0] === 'drawImage'
    && Math.abs(c[1][3] - mobSize) < 1e-6
    && Math.abs(c[1][4] - mobSize) < 1e-6);
  assert.equal(lastImgs.length, 0,
    'финал: спрайтов юнитов мобов нет (исследованные группы вне зрения)');
  assert.equal(h.errors.length, 0, 'нет ошибок: ' + h.errors.join('; '));
});

// =====================================================================
// W-11b (задача 000235.07): firelight — opts.visionRadiusFloor в
// dungeon-ui.js: radius = max(radiusFor(mult), floor). Базовое
// зрение с mock visionMult 0.5 → radiusFor = 3; floor 5 → radius 5:
// (6,1) cheb 5 — видима, (7,1) cheb 6 — скрыта. safe-call:
// не-функция/throw → 0 (тихо). Город — mask null (тумана нет).
// Контракт: memory/000235.07-fire-wave-content.md §2.2/§7 (W-11).
// =====================================================================

const CITY_FLOOR_COLORS = ['#b3a284', '#a5947a', '#c0b090'];

function cityFloorRectAt(calls, x, y, size, tol = 1e-9) {
  return calls.some((c) => c[0] === 'fillRect'
    && CITY_FLOOR_COLORS.includes(c[2])
    && Math.abs(c[1][0] - x) <= tol
    && Math.abs(c[1][1] - y) <= tol
    && Math.abs(c[1][2] - size) <= tol
    && Math.abs(c[1][3] - size) <= tol);
}

test('W-11b. 000235.07: firelight — visionRadiusFloor: radius = max(radiusFor(mult), floor) (mult 0.5 → 3, floor 5 → 5); safe-call → 0; город — mask null', () => {
  const { body, errors, s, rafStubs, T, P } = loadFogDungeon({
    startOpts: { visionMult: 0.5, visionRadiusFloor: () => 5 },
  });
  T.t += 16;
  tick(rafStubs);
  const calls = findCanvas(body).drawCalls;
  assert.ok(floorRectAt(calls, P(6, 1).x, P(6, 1).y, 40),
    '(6,1) cheb 5 — видима: floor 5 > radiusFor(0.5) = 3 (RED: '
    + 'visionRadiusFloor не применяется — radius 3)');
  assert.ok(!floorRectAt(calls, P(7, 1).x, P(7, 1).y, 40),
    '(7,1) cheb 6 — скрыта (radius = 5, не «floor + что-то»)');
  assert.equal(errors.length, 0,
    'visionRadiusFloor — без console.error: ' + JSON.stringify(errors));

  const h2 = loadFogDungeon({
    startOpts: { visionMult: 0.5, visionRadiusFloor: 'мусор' },
  });
  h2.T.t += 16;
  tick(h2.rafStubs);
  const calls2 = findCanvas(h2.body).drawCalls;
  assert.ok(!floorRectAt(calls2, h2.P(6, 1).x, h2.P(6, 1).y, 40),
    'safe-call: не-функция → floor 0 → (6,1) cheb 5 НЕ видима (radius 3)');
  assert.equal(h2.errors.length, 0,
    'safe-call — тихо: ' + JSON.stringify(h2.errors));

  const h3 = loadFogDungeon({
    startOpts: { visionMult: 0.5,
      visionRadiusFloor: () => { throw new Error('boom'); } },
  });
  h3.T.t += 16;
  tick(h3.rafStubs);
  const calls3 = findCanvas(h3.body).drawCalls;
  assert.ok(!floorRectAt(calls3, h3.P(6, 1).x, h3.P(6, 1).y, 40),
    'safe-call: throw → catch → floor 0 → (6,1) НЕ видима');
  assert.equal(h3.errors.length, 0,
    'safe-call: catch — без console.error: ' + JSON.stringify(h3.errors));

  s.kind = 'city';
  s.dg.seed = 1;
  T.t += 16;
  tick(rafStubs);
  const callsC = findCanvas(body).drawCalls;
  assert.ok(cityFloorRectAt(callsC, P(10, 5).x, P(10, 5).y, 40),
    'город: (10,5) — видима (mask null — тумана нет, без изменений)');
  assert.ok(!fillRectAt(callsC, FOG_DIM_FILL,
    P(7, 1).x, P(7, 1).y, 40, 40),
    'город: прохода затемнения FOG_DIM_FILL нет');
  assert.equal(errors.length, 0,
    'город — без console.error: ' + JSON.stringify(errors));
});

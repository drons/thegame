// Управление в подземелье через маппинг src/controls.js (задача 000043)
// и вьюпорт/камера/зум подземелья (задача 000066).
//
// Браузерный модуль dungeon-ui.js исполняется в vm-песочнице с
// минимальным DOM-стабом (паттерн tests/combat-ui.test.js: скрипты
// игры — обычные <script>, каждый собирает globalThis.Game; в песочнице
// `module` нет, UMD-модули идут браузерной веткой).
//
// КРАСНЫЕ 000043 (падают до реализации, зелёные после):
//   * фолбэк по e.key (ц/ф/ы/в, без учёта регистра) для виртуальных
//     клавиатур (code «Unidentified») — сейчас локальная keyDir(code)
//     не знает «Unidentified» и onMove не вызывается;
//   * структурный: локальная таблица keyDir удалена, маппинг — через
//     Game.deltaForEvent (controls.js);
//   * битый порядок загрузки (dungeon-ui.js без controls.js) — видимая
//     ошибка console.error, а не тихая поломка управления.
//
// ЗЕЛЁНЫЕ с первого запуска (регрессия-фиксация поведения, которое
// задача 000043 НЕ должна менять): стрелки/физические WASD по e.code,
// приоритет e.code над e.key, не-перемещающие клавиши не «проглатываются»,
// неактивный оверлей и активный бой — без перехвата.
//
// КРАСНЫЕ 000066 (падают до реализации, зелёные после) — полноэкранный
// вьюпорт с мировой математикой камеры/зума:
//   * canvas — window.innerWidth/innerHeight, ресайз в rAF-цикле;
//   * wheel на оверлее: ×1.2/÷1.2, клампы ZOOM_MIN/ZOOM_MAX, onZoom;
//   * стартовый zoom — из opts (дефолт G.ZOOM_START);
//   * рисуется только G.visibleTileRange ∩ границы подземелья;
//   * камера: снап к игроку, сглаживание G.cameraStep(CAM_TAU_MS) в rAF
//     (dt первого кадра 0), кламп к границам при зуме, центрирование,
//     когда вьюпорт больше подземелья;
//   * пол: фолбэк #182029 (функции/пути/изображения нет), спрайт —
//     drawImage zoom×zoom по пути G.dungeonFloorFrame;
//   * стены: d.wallObjs + G.DUNGEON_WALL_FRAMES → drawImage, слой ПОД
//     мобами/игроком; без wallObjs — drawImage нет;
//   * close() — cancelAnimationFrame, поздний tick не рендерит;
//   * хук state.pos(now) (задел 000068): ромб игрока И цель камеры.
//
// ВАЖНО (UMD-ловушка порядка, 000038): в index.html src/motion.js
// грузится ПОСЛЕ src/dungeon-ui.js — цепочка песочницы зеркалит это
// (motion.js в конце): снапсот G при загрузке dungeon-ui.js НЕ видит
// cameraStep/CAM_TAU_MS, камера обязана читаться в момент вызова
// (или приходить из opts). Жёсткий load-time-guard на cameraStep здесь
// сломал бы и тесты, и реальный браузер.
//
// Ядро подземелья (createDungeon/содержимое) покрыто tests/dungeon.test.js —
// здесь state для start() — минимальный литерал в форме main.js
// (maybeEnterDungeon), реальный createDungeon не нужен.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');

// --- Минимальный DOM-стаб (паттерн tests/combat-ui.test.js) ---

// Canvas 2D: методы — no-op, свойства (fillStyle и т.п.) — записываются.
// Каждый ВЫЗОВ метода — в el.drawCalls как [имя, args, fillStyle]
// (fillStyle на момент вызова — для сверки «какой цвет при чём»;
// 1-й/2-й элементы — как в tests/combat-ui.test.js).
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
    remove() {},
    addEventListener(type, fn, opts) {
      // [fn, opts] — opts нужен для wheel: { passive: false } (000066).
      (this.listeners[type] || (this.listeners[type] = [])).push([fn, opts]);
    },
    // combat-ui.js render(): overlay.querySelectorAll('.combat-actions
    // button') — отдаём кнопки, созданные в этой песочнице (в тестах
    // подземелья их не проверяем, но бойу нужны, чтобы не упасть).
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

// Canvas подземелья (создаётся build() при старте).
function findCanvas(el) {
  if (el.tagName === 'canvas') return el;
  for (const ch of el.children || []) {
    const found = findCanvas(ch);
    if (found) return found;
  }
  return null;
}

// Загрузка цепочки src-скриптов (порядок из index.html) + dungeon-ui.js
// в vm-песочнице. opts:
//   withoutControls — цепочка БЕЗ controls.js (битый порядок загрузки);
//   withCombat — полная боевая цепочка (…combat.js, combat-keys.js,
//     combat-ui.js) ДО dungeon.js — оба оверлея в одном Game, как в
//     index.html (проверка «бой выше по стеку»);
//   performance / requestAnimationFrame / cancelAnimationFrame —
//     внедрение в песочницу для тестов rAF-цикла и камеры (000066);
//     по умолчанию ОТСУТСТВУЮТ — существующие тесты 000043 не меняются
//     (dungeon-ui обязан терпеть песочницу без rAF/performance,
//     typeof-гарды, паттерн combat-ui.js).
// window-стаб — с innerWidth/innerHeight (числа, меняемы тестом =
// симуляция ресайза; canvas обязан подгоняться в rAF-цикле).
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
    innerWidth: 800,
    innerHeight: 600,
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
  const chain = ['global-settings.js', 'perlin.js', 'map.js'];
  if (!opts.withoutControls) chain.push('controls.js');
  if (opts.withCombat) {
    chain.push('skills-data.js', 'items-data.js', 'player.js', 'items.js',
      'combat.js', 'combat-keys.js', 'combat-ui.js');
  }
  chain.push('dungeon.js', 'dungeon-ui.js');
  // motion.js — в index.html он ПОСЛЕ dungeon-ui.js (UMD-ловушка, 000038:
  // каждый модуль ЗАМЕНЯЕТ объект Game). Цепочка зеркалит браузер: снапсот
  // G в dungeon-ui.js при загрузке не видит cameraStep/CAM_TAU_MS — тесты
  // камеры ниже требуют чтения в момент вызова, а не load-time-guard.
  chain.push('motion.js');
  for (const f of chain) vm.runInContext(src(f), sandbox, { filename: f });
  return { G: sandbox.Game, keydown, body: document.body, errors, window };
}

// Стабы rAF/cAF с записью scheduled/cancelled (паттерн
// tests/combat-ui.test.js): кадр — только по ЯВНОМУ вызову теста
// (авто-продвижения нет — тест «не-перемещающие клавиши — без ререндера»
// сверяет drawCalls ДО/ПОСЛЕ нажатия).
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

// Элемент оверлея подземелья (className содержит cls) в дереве body.
function findByClass(el, cls) {
  if (typeof el.className === 'string'
      && el.className.split(' ').includes(cls)) return el;
  for (const ch of el.children || []) {
    const found = findByClass(ch, cls);
    if (found) return found;
  }
  return null;
}

// Колесо над оверлеем: вызвать ВСЕХ wheel-слушателей элемента.
// Возвращает событие — проверяем prevented.
function wheelOn(el, deltaY) {
  const e = {
    deltaY,
    prevented: false,
    preventDefault() { this.prevented = true; },
  };
  for (const [fn] of el.listeners.wheel || []) fn(e);
  return e;
}

// Последняя точка beginPath/moveTo в рендере — вершина ромба игрока
// (игрок рисуется ПОСЛЕДНИМ; ромб — единственная path-фигура):
// [px, py − r], где px/py — центр клетки игрока в экранных координатах.
function lastPlayerMoveTo(drawCalls) {
  for (let i = drawCalls.length - 1; i >= 0; i--) {
    if (drawCalls[i][0] === 'moveTo') return drawCalls[i][1];
  }
  return null;
}

// floor-клетки рендера: fillRect с fillStyle '#182029' (цвет пола,
// фолбэк «как сейчас» и цвет, который обязан остаться при фолбэках).
function floorRects(drawCalls) {
  return drawCalls.filter((c) => c[0] === 'fillRect' && c[2] === '#182029');
}

// floor-клетка в ТОЧНЫХ экранных координатах (угол клетки, размер zoom):
// сверка с проекцией G.worldToScreen — «та же формула мир→экран, что мир».
function floorRectAt(drawCalls, x, y, size, tol = 1e-9) {
  return drawCalls.some((c) => c[0] === 'fillRect' && c[2] === '#182029'
    && Math.abs(c[1][0] - x) <= tol
    && Math.abs(c[1][1] - y) <= tol
    && Math.abs(c[1][2] - size) <= tol
    && Math.abs(c[1][3] - size) <= tol);
}

// Последний floor-клетки в «приблизительных» координатах (схождение
// камеры за много кадров — допускаю погрешность).
function lastFloorRectNear(drawCalls, x, y, size, tol) {
  for (let i = drawCalls.length - 1; i >= 0; i--) {
    const c = drawCalls[i];
    if (c[0] === 'fillRect' && c[2] === '#182029'
        && Math.abs(c[1][0] - x) <= tol
        && Math.abs(c[1][1] - y) <= tol
        && Math.abs(c[1][2] - size) <= tol
        && Math.abs(c[1][3] - size) <= tol) return c;
  }
  return null;
}

// Минимальное состояние подземелья — форма main.js (maybeEnterDungeon):
// { dg, contents, x, y, log }. Ядро createDungeon не вызываем (покрыто
// tests/dungeon.test.js); по умолчанию 5×5, стены по периметру, пол внутри
// (тот же литерал, что в тестах 000043). opts 000066:
//   width/height — размер сетки (стены по периметру, пол внутри);
//   px/py — стартовая клетка игрока (floor);
//   wallObjs — d.wallObjs (задача 000070): [{x, y, obj}];
//   mobs/chests — содержимое;
//   pos — функция pos(now) (хук 000068): позиция игрока в момент кадра.
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
    type: 0, // DUNGEON_TYPES.CAVE → G.DUNGEON_NAMES[0]
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

// Нажать клавишу через зарегистрированные keydown-обработчики.
// Возвращает событие — проверяем prevented/stopped.
function press(keydown, e0) {
  const e = Object.assign({
    prevented: false,
    stopped: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; },
  }, e0);
  for (const fn of keydown) fn(e);
  return e;
}

// Открыть оверлей со spy onMove.
function openDungeon(G, moves) {
  G.dungeonUI.start({ state: makeState(), onMove: (dx, dy) => moves.push([dx, dy]) });
}

// --- Регрессия-фиксация: поведение, которое 000043 менять не должна ---

test('подземелье UI: одно нажатие = один шаг (e.code: стрелки/WASD), preventDefault+stopPropagation', () => {
  const { G, keydown } = loadDungeonUi();
  assert.ok(G.dungeonUI, 'Game.dungeonUI создан (загрузка в правильном порядке)');
  assert.equal(keydown.length, 1, 'keydown-обработчик зарегистрирован');
  const moves = [];
  openDungeon(G, moves);
  const CASES = [
    ['ArrowUp', 0, -1], ['KeyW', 0, -1],
    ['ArrowDown', 0, 1], ['KeyS', 0, 1],
    ['ArrowLeft', -1, 0], ['KeyA', -1, 0],
    ['ArrowRight', 1, 0], ['KeyD', 1, 0],
  ];
  for (const [code, dx, dy] of CASES) {
    moves.length = 0;
    // На русской раскладке физическая KeyW даёт key «ц» — реалистично.
    const e = press(keydown, { code, key: code.startsWith('Key') ? 'ц' : code });
    assert.deepEqual(moves, [[dx, dy]],
      code + ' → ровно один шаг (' + dx + ', ' + dy + '): ' + JSON.stringify(moves));
    assert.equal(e.prevented, true, code + ': preventDefault (нет дубля в main.js)');
    assert.equal(e.stopped, true, code + ': stopPropagation');
  }
});

test('подземелье UI: приоритет e.code над e.key (KeyW с key «я» — вверх)', () => {
  // code — физическая клавиша, авторитетнее символа раскладки:
  // реализация, которая смотрела бы e.key ПЕРВОЙ, дала бы null
  // («я» не в KEY_DIRS) и шаг был бы потерян.
  const { G, keydown } = loadDungeonUi();
  const moves = [];
  openDungeon(G, moves);
  const e = press(keydown, { code: 'KeyW', key: 'я' });
  assert.deepEqual(moves, [[0, -1]], 'e.code KeyW побеждает e.key «я»');
  assert.equal(e.prevented, true);
});

test('подземелье UI: не-перемещающие клавиши — без onMove, без preventDefault, без ререндера', () => {
  // Распознанные клавиши «проглатываются» (preventDefault), нераспознанные
  // — нет: не ломать ввод/клавиши, за которыми не отвечает подземелье
  // (и латинские символы НЕ в KEY_DIRS — фолбэк только на ц/ф/ы/в).
  const { G, keydown, body } = loadDungeonUi();
  const moves = [];
  openDungeon(G, moves);
  const n0 = findCanvas(body).drawCalls.length;
  for (const e0 of [
    { code: 'KeyJ', key: 'о' },
    { code: 'Escape', key: 'Escape' },
    { code: 'Unidentified', key: 'w' },
  ]) {
    moves.length = 0;
    const e = press(keydown, e0);
    assert.equal(moves.length, 0, e0.code + ': onMove не вызывается');
    assert.equal(e.prevented, false, e0.code + ': клавиша не «проглатывается»');
    assert.equal(e.stopped, false, e0.code + ': propagation не останавливается');
    assert.equal(findCanvas(body).drawCalls.length, n0,
      e0.code + ': ререндера по нераспознанной клавише нет');
  }
});

test('подземелье UI: до start() и после close() — нажатия не обрабатываются', () => {
  const { G, keydown } = loadDungeonUi();
  const moves = [];
  // До start: обработчик зарегистрирован, но оверлей неактивен.
  const e0 = press(keydown, { code: 'KeyW', key: 'ц' });
  assert.equal(moves.length, 0, 'до start — onMove не вызывается');
  assert.equal(e0.prevented, false, 'до start — клавиша не «проглатывается»');

  openDungeon(G, moves);
  assert.equal(G.dungeonUI.isActive(), true, 'оверлей активен');
  press(keydown, { code: 'KeyW', key: 'ц' });
  assert.deepEqual(moves, [[0, -1]], 'активный оверлей — нажатие обработано');

  G.dungeonUI.close();
  assert.equal(G.dungeonUI.isActive(), false, 'оверлей закрыт');
  moves.length = 0;
  press(keydown, { code: 'KeyW', key: 'ц' });
  assert.equal(moves.length, 0, 'после close — onMove не вызывается');
});

test('подземелье UI: активный бой выше по стеку — клавиши не перехватываются', () => {
  // Оба оверлея в одном Game (порядок index.html: combat-ui.js до
  // dungeon-ui.js). Пока G.combatUI.isActive() — dungeon-ui НЕ передаёт
  // нажатия в onMove (двойной шаг: мир+подземелье/бой невозможен).
  const { G, keydown } = loadDungeonUi({ withCombat: true });
  assert.ok(G.combatUI, 'Game.combatUI создан');
  const moves = [];
  openDungeon(G, moves);
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  assert.ok(c, 'бой создан');
  assert.equal(G.combatUI.isActive(), true, 'бой активен');
  press(keydown, { code: 'ArrowUp', key: 'ArrowUp' });
  press(keydown, { code: 'KeyW', key: 'ц' });
  assert.equal(moves.length, 0, 'во время боя onMove не вызывается');
});

// --- Красные: требования задачи 000043 (падают до реализации) ---

test('подземелье UI: виртуальная клавиатура — фолбэк по e.key ц/ф/ы/в (code «Unidentified»)', () => {
  // Виртуальные клавиатуры отдают code «Unidentified» — физическая
  // клавиша неизвестна, работает только символ. Фолбэк согласует
  // управление в подземелье с миром (tryMove в main.js использует
  // Game.moveKeyForEvent/deltaForMoveKey, задача 000028). Сейчас падает:
  // локальная keyDir('Unidentified') → undefined, onMove не вызывается.
  const { G, keydown } = loadDungeonUi();
  const moves = [];
  openDungeon(G, moves);
  const CASES = [
    ['ц', 0, -1], ['ф', -1, 0], ['ы', 0, 1], ['в', 1, 0],
  ];
  for (const [key, dx, dy] of CASES) {
    moves.length = 0;
    const e = press(keydown, { code: 'Unidentified', key });
    assert.deepEqual(moves, [[dx, dy]],
      '«' + key + '» → (' + dx + ', ' + dy + '): ' + JSON.stringify(moves));
    assert.equal(e.prevented, true, '«' + key + '»: preventDefault');
    assert.equal(e.stopped, true, '«' + key + '»: stopPropagation');
  }
});

test('подземелье UI: регистр e.key не важен (Shift+«Ц» — вверх)', () => {
  // Символ нормализуется в нижний регистр (паттерн controls.js:
  // keydown/keyup дают одинаковый id при смене регистра).
  const { G, keydown } = loadDungeonUi();
  const moves = [];
  openDungeon(G, moves);
  press(keydown, { code: 'Unidentified', key: 'Ц' });
  assert.deepEqual(moves, [[0, -1]], '«Ц» (верхний регистр) → вверх');
});

test('подземелье UI: структурный — локальной таблицы keyDir нет, маппинг из src/controls.js', () => {
  // Задача 000043: заменить локальную таблицу на Game.deltaForEvent(e)
  // (или Game.moveKeyForEvent(e) + Game.deltaForMoveKey(id)) и удалить
  // keyDir. Локальная таблица содержала мёртвые кириллические e.code
  // (задача 000028) и не знала фолбэк по e.key.
  const text = src('dungeon-ui.js');
  assert.ok(!text.includes('function keyDir'),
    'локальная таблица keyDir удалена');
  assert.ok(
    text.includes('deltaForEvent')
    || (text.includes('moveKeyForEvent') && text.includes('deltaForMoveKey')),
    'маппинг клавиш — через src/controls.js: Game.deltaForEvent(e) '
    + 'или Game.moveKeyForEvent(e) + Game.deltaForMoveKey(id)');
});

test('подземелье UI: битый порядок загрузки (без controls.js) — видимая ошибка, не молчание', () => {
  // UMD-ловушка: dungeon-ui.js снимает const G = globalThis.Game ОДИН
  // раз при загрузке. Если controls.js загрузился ПОСЛЕ, G.deltaForEvent
  // через захваченный G недоступен НАВСЕГДА — подземелье не упадёт при
  // загрузке, а сломается тихо. Домашний паттерн (ui.js, combat-keys.js,
  // combat-ui.js): guard с console.error (видимая ошибка, не молчание);
  // порядок сам по себе закреплён tests/index-order.test.js.
  const { G, errors } = loadDungeonUi({ withoutControls: true });
  assert.equal(typeof G.createDungeon, 'function',
    'dungeon.js в цепочке (guard проверяет controls.js, а не ядро)');
  assert.ok(errors.length > 0,
    'guard обязан оставить след в console.error: ' + JSON.stringify(errors));
});

// --- Красные: требования задачи 000066 (падают до реализации) ---
//
// Полноэкранный вьюпорт с мировой математикой камеры/зума: canvas на
// window.innerWidth/innerHeight, ОДИН общий zoom (из opts + wheel на
// оверлее), cam в клетках с G.cameraStep/CAM_TAU_MS, кламп/центрирование
// для конечной сетки, рендер только G.visibleTileRange, спрайты пола/
// стен через DI spriteLoader, хук state.pos(now) под 000068.
// Песочница: rAF-стабы (кадр — по явным вызовам) + performance.now с
// управляемым T; цепочка зеркалит index.html (motion.js ПОСЛЕ
// dungeon-ui.js — камера читается в момент вызова, не load-time снапсот).

const VW = 800; // window.innerWidth песочницы
const VH = 600; // window.innerHeight песочницы

test('подземелье UI: порядок index.html (motion.js ПОСЛЕ dungeon-ui.js) — Game.dungeonUI создаётся', () => {
  // UMD-ловушка 000038 (повтор): motion.js грузится ПОСЛЕ dungeon-ui.js —
  // при загрузке dungeon-ui.js Game.cameraStep/CAM_TAU_MS ещё нет.
  // Load-time-guard на них (как на createDungeon/deltaForEvent) сломал бы
  // реальный браузер: здесь цепочка в порядке index.html, dungeonUI
  // обязан создаваться, а cameraStep/CAM_TAU_MS читаться в момент вызова.
  const { G } = loadDungeonUi();
  assert.ok(G.dungeonUI, 'Game.dungeonUI создан (motion.js ещё не грузился)');
  assert.equal(typeof G.dungeonUI.start, 'function');
  assert.equal(typeof G.cameraStep, 'function',
    'cameraStep в финальном Game (motion.js доиграл свой UMD)');
  assert.ok(G.CAM_TAU_MS > 0, 'CAM_TAU_MS в финальном Game');
});

test('подземелье UI: canvas — весь вьюпорт, ресайз в rAF-цикле', () => {
  const rafStubs = makeRafStubs();
  const T = { t: 1000 };
  const { G, body, window: win } = loadDungeonUi({
    performance: { now: () => T.t },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  G.dungeonUI.start({ state: makeState(), onMove() {} });
  assert.ok(rafStubs.scheduled.length >= 1,
    'rAF-цикл запущен в start (камера/ресайз живут в цикле)');
  const canvas = findCanvas(body);
  T.t += 16;
  tick(rafStubs);
  assert.equal(canvas.width, VW, 'canvas.width = window.innerWidth');
  assert.equal(canvas.height, VH, 'canvas.height = window.innerHeight');
  // Симуляция ресайза: размеры — в rAF-цикле (паттерн main.js).
  win.innerWidth = 640;
  win.innerHeight = 480;
  T.t += 16;
  tick(rafStubs);
  assert.equal(canvas.width, 640, 'ресайз width в rAF-цикле');
  assert.equal(canvas.height, 480, 'ресайз height в rAF-цикле');
});

test('подземелье UI: wheel на оверлее — ×1.2 (deltaY<0) / ÷1.2 (deltaY>0), onZoom, рендер следует зуму', () => {
  const rafStubs = makeRafStubs();
  const T = { t: 1000 };
  const { G, body } = loadDungeonUi({
    performance: { now: () => T.t },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  const zoomCalls = [];
  G.dungeonUI.start({
    state: makeState(), onMove() {},
    zoom: 40, onZoom: (z) => zoomCalls.push(z),
  });
  const overlay = findByClass(body, 'dungeon-overlay');
  assert.ok(overlay, 'оверлей .dungeon-overlay в body');
  const wheelEntries = overlay.listeners.wheel || [];
  assert.ok(wheelEntries.length >= 1,
    'wheel-слушатель на элементе оверлея (мировой слушатель на #game накрыт)');
  assert.ok(wheelEntries.some(([, o]) => o && o.passive === false),
    'wheel-слушатель с { passive: false } (иначе preventDefault не гасит скролл)');
  const canvas = findCanvas(body);
  // 5×5 при zoom 40/48 — вьюпорт больше подземелья → центрирование
  // cam (2.5, 2.5); угол floor-клетки (1,1) — через ту же worldToScreen.
  T.t += 16;
  tick(rafStubs);
  let n = canvas.drawCalls.length;
  const e1 = wheelOn(overlay, -100);
  tick(rafStubs);
  assert.equal(e1.prevented, true, 'wheel: preventDefault (нет скролла страницы)');
  assert.equal(zoomCalls.length, 1, 'onZoom вызван один раз');
  assert.ok(Math.abs(zoomCalls[0] - 40 * 1.2) <= 1e-9,
    'deltaY<0 → zoom ×1.2 = 48: ' + JSON.stringify(zoomCalls));
  let seg = canvas.drawCalls.slice(n);
  const fr1 = floorRects(seg);
  assert.ok(fr1.length >= 9, 'floor-клетки перерисованы');
  for (const c of fr1) {
    assert.equal(c[1][2], 48, 'размер floor — новый zoom (48), не фиксированный cell');
    assert.equal(c[1][3], 48);
  }
  const p1 = G.worldToScreen(1, 1, 2.5, 2.5, 48, VW, VH);
  assert.ok(floorRectAt(seg, p1.x, p1.y, 48), 'floor (1,1) — по проекции при zoom 48');
  n = canvas.drawCalls.length;
  wheelOn(overlay, +100);
  tick(rafStubs);
  assert.equal(zoomCalls.length, 2);
  assert.ok(Math.abs(zoomCalls[1] - 40 * 1.2 / 1.2) <= 1e-9,
    'deltaY>0 → zoom ÷1.2 = обратно 40: ' + JSON.stringify(zoomCalls));
  seg = canvas.drawCalls.slice(n);
  const fr2 = floorRects(seg);
  assert.ok(fr2.length >= 9);
  for (const c of fr2) {
    assert.equal(c[1][2], 40, 'размер floor — zoom после ÷1.2 (40)');
    assert.equal(c[1][3], 40);
  }
});

test('подземелье UI: wheel-клампы — в ZOOM_MAX не выше, в ZOOM_MIN не ниже', () => {
  // Два «приблизить» в ZOOM_MAX: наивный zoom*1.2 дал бы 153.6 — кламп.
  let rafStubs = makeRafStubs();
  let T = { t: 1000 };
  let loaded = loadDungeonUi({
    performance: { now: () => T.t },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  let G = loaded.G;
  let zoomCalls = [];
  G.dungeonUI.start({
    state: makeState(), onMove() {},
    zoom: G.ZOOM_MAX, onZoom: (z) => zoomCalls.push(z),
  });
  let overlay = findByClass(loaded.body, 'dungeon-overlay');
  wheelOn(overlay, -100);
  wheelOn(overlay, -100);
  T.t += 16;
  tick(rafStubs);
  for (const z of zoomCalls) {
    assert.ok(z <= G.ZOOM_MAX + 1e-9, 'zoom не выше ZOOM_MAX: ' + z);
  }
  const canvas = findCanvas(loaded.body);
  const fr = floorRects(canvas.drawCalls);
  assert.ok(fr.length >= 9, 'floor перерисован');
  for (const c of fr) {
    assert.equal(c[1][2], G.ZOOM_MAX,
      'клетка рисуется в ZOOM_MAX px (×1.2 дважды не пробило кламп)');
    assert.equal(c[1][3], G.ZOOM_MAX);
  }
  // Своя песочница: «удалить» в ZOOM_MIN.
  rafStubs = makeRafStubs();
  T = { t: 1000 };
  loaded = loadDungeonUi({
    performance: { now: () => T.t },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  G = loaded.G;
  zoomCalls = [];
  G.dungeonUI.start({
    state: makeState(), onMove() {},
    zoom: G.ZOOM_MIN, onZoom: (z) => zoomCalls.push(z),
  });
  overlay = findByClass(loaded.body, 'dungeon-overlay');
  wheelOn(overlay, +100);
  wheelOn(overlay, +100);
  T.t += 16;
  tick(rafStubs);
  for (const z of zoomCalls) {
    assert.ok(z >= G.ZOOM_MIN - 1e-9, 'zoom не ниже ZOOM_MIN: ' + z);
  }
  const fr2 = floorRects(findCanvas(loaded.body).drawCalls);
  assert.ok(fr2.length >= 9);
  for (const c of fr2) {
    assert.equal(c[1][2], G.ZOOM_MIN, 'клетка рисуется в ZOOM_MIN px (÷1.2 не пробило кламп)');
    assert.equal(c[1][3], G.ZOOM_MIN);
  }
});

test('подземелье UI: стартовый zoom — из opts (мировое значение); без opts — G.ZOOM_START', () => {
  let rafStubs = makeRafStubs();
  let T = { t: 1000 };
  let loaded = loadDungeonUi({
    performance: { now: () => T.t },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  let G = loaded.G;
  G.dungeonUI.start({
    state: makeState(), onMove() {},
    zoom: 42, onZoom() {},
  });
  T.t += 16;
  tick(rafStubs);
  let calls = findCanvas(loaded.body).drawCalls;
  // 5×5 @ 42 px = 210 px < вьюпорта → центрирование (2.5, 2.5).
  const p = G.worldToScreen(1, 1, 2.5, 2.5, 42, VW, VH);
  assert.ok(floorRectAt(calls, p.x, p.y, 42),
    'opts.zoom = 42 → клетка рисуется 42 px по проекции (не фиксированный cell 22/18)');
  // Дефолт: start без zoom — мировое G.ZOOM_START (существующие вызовы
  // и регрессии 000043 вызывают start без zoom).
  rafStubs = makeRafStubs();
  T = { t: 1000 };
  loaded = loadDungeonUi({
    performance: { now: () => T.t },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  G = loaded.G;
  G.dungeonUI.start({ state: makeState(), onMove() {} });
  T.t += 16;
  tick(rafStubs);
  calls = findCanvas(loaded.body).drawCalls;
  const p2 = G.worldToScreen(1, 1, 2.5, 2.5, G.ZOOM_START, VW, VH);
  assert.ok(floorRectAt(calls, p2.x, p2.y, G.ZOOM_START),
    'без opts.zoom → G.ZOOM_START (' + G.ZOOM_START + ' px/клетку)');
});

test('подземелье UI: рисуется только G.visibleTileRange ∩ границы подземелья', () => {
  const rafStubs = makeRafStubs();
  const T = { t: 1000 };
  const { G, body } = loadDungeonUi({
    performance: { now: () => T.t },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  const s = makeState({ width: 25, height: 25 });
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 40 });
  T.t += 16;
  tick(rafStubs);
  const calls = findCanvas(body).drawCalls;
  // Игрок (1,1) — цель камеры (1.5,1.5) вне [viewW/2/zoom, w−viewW/2/zoom]
  // = [10, 15]×[7.5, 17.5] → снап+кламп: cam (10, 7.5).
  const camX = VW / 2 / 40, camY = VH / 2 / 40;
  const r = G.visibleTileRange(camX, camY, VW, VH, 40);
  let visibleFloor = 0;
  let hiddenFloor = 0;
  for (let y = 0; y < 25; y++) {
    for (let x = 0; x < 25; x++) {
      if (s.dg.cells[y * 25 + x] !== G.CELL_FLOOR) continue;
      const inRange =
        x >= Math.max(0, r.x0) && x <= Math.min(24, r.x1)
        && y >= Math.max(0, r.y0) && y <= Math.min(24, r.y1);
      const p = G.worldToScreen(x, y, camX, camY, 40, VW, VH);
      const drawn = floorRectAt(calls, p.x, p.y, 40);
      if (inRange) {
        assert.ok(drawn, 'видимая floor-клетка (' + x + ',' + y + ') нарисована');
        visibleFloor++;
      } else {
        assert.ok(!drawn,
          'floor-клетка (' + x + ',' + y + ') вне visibleTileRange не нарисована');
        hiddenFloor++;
      }
    }
  }
  assert.ok(visibleFloor > 0 && hiddenFloor > 0,
    'в сверке есть и видимые, и скрытые клетки: '
    + visibleFloor + ' / ' + hiddenFloor);
});

test('подземелье UI: камера — снап к игроку, dt первого кадра 0, сглаживание G.cameraStep(CAM_TAU_MS)', () => {
  const rafStubs = makeRafStubs();
  const T = { t: 1000 };
  const { G, body } = loadDungeonUi({
    performance: { now: () => T.t },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  // 25×25, zoom 40: вьюпорт (20×15 клеток) меньше подземелья — камера
  // подвижна. Игрок (1,1): цель (1.5,1.5) → кламп (10, 7.5) — снап.
  const s = makeState({ width: 25, height: 25 });
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 40 });
  const camX0 = VW / 2 / 40, camY0 = VH / 2 / 40; // 10, 7.5
  const calls = findCanvas(body).drawCalls;
  // Кадр 1 при НЕИЗМЕНЁННОМ now: dt = 0 → камера не сдвинулась
  // (снап+кламп (10, 7.5), не цель (1.5, 1.5)).
  tick(rafStubs);
  const p0 = G.worldToScreen(1, 1, camX0, camY0, 40, VW, VH);
  assert.ok(floorRectAt(calls, p0.x, p0.y, 40),
    'первый кадр (dt=0): cam = снап+кламп (' + camX0 + ', ' + camY0 + ')');
  // Игрок ушёл на (13,13) → цель (13.5,13.5) в пределах клампа.
  s.x = 13;
  s.y = 13;
  let camX = camX0, camY = camY0;
  for (const t of [1016, 1032]) {
    T.t = t; // dt = 16 мс
    camX = G.cameraStep(camX, 13.5, 16, G.CAM_TAU_MS);
    camY = G.cameraStep(camY, 13.5, 16, G.CAM_TAU_MS);
    tick(rafStubs);
    const p = G.worldToScreen(13, 13, camX, camY, 40, VW, VH);
    assert.ok(floorRectAt(calls, p.x, p.y, 40),
      'кадр при now=' + t + ': cam = cameraStep(prev, 13.5, 16, CAM_TAU_MS) по осям');
    const px = G.worldToScreen(13.5, 13.5, camX, camY, 40, VW, VH).x;
    const pm = lastPlayerMoveTo(calls);
    assert.ok(pm, 'ромб игрока в кадре');
    assert.ok(Math.abs(pm[0] - px) <= 1e-9,
      'ромб игрока — та же проекция, что и cameraStep-камера: '
      + pm[0] + ' ≠ ' + px);
  }
});

test('подземелье UI: кламп камеры к границам — cam ∈ [viewW/2/zoom, w−viewW/2/zoom] × по Y', () => {
  const rafStubs = makeRafStubs();
  const T = { t: 1000 };
  const { G, body } = loadDungeonUi({
    performance: { now: () => T.t },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  // Игрок в углу-на-полу (1,1), 25×25, zoom 40: цель (1.5,1.5) вне
  // [10,15]×[7.5,17.5] — камера ПИНится клампом на (10, 7.5) КАЖДЫЙ кадр
  // (кламп ПОСЛЕ cameraStep: сглаживание тянет к 1.5, кламп возвращает).
  const s = makeState({ width: 25, height: 25 });
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 40 });
  const camX = VW / 2 / 40, camY = VH / 2 / 40;
  const calls = findCanvas(body).drawCalls;
  const p = G.worldToScreen(1, 1, camX, camY, 40, VW, VH);
  for (const t of [1000, 1016, 1032, 1048]) {
    T.t = t;
    tick(rafStubs);
    const last = lastFloorRectNear(calls, p.x, p.y, 40, 1e-9);
    assert.ok(last,
      'кадр now=' + t + ': cam удержан клампом (' + camX + ', ' + camY + ') — '
      + 'floor (1,1) в ' + p.x + ',' + p.y);
  }
});

test('подземелье UI: вьюпорт больше подземелья — центрирование, cam = (w/2, h/2)', () => {
  const rafStubs = makeRafStubs();
  const T = { t: 1000 };
  const { G, body } = loadDungeonUi({
    performance: { now: () => T.t },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  // 5×5 при ZOOM_MIN=4 → 20 px «ширины мира» против 800 px вьюпорта:
  // кламп-диапазон пуст (min > max) — обязательная ветка центрирования,
  // иначе cam улетает в NaN/наружу. Снаружи — только фон #0a0d12.
  const s = makeState();
  G.dungeonUI.start({ state: s, onMove() {}, zoom: G.ZOOM_MIN });
  const calls = findCanvas(body).drawCalls;
  tick(rafStubs);
  const cx = 2.5, cy = 2.5;
  const bg = calls.some((c) => c[0] === 'fillRect' && c[2] === '#0a0d12'
    && c[1][0] === 0 && c[1][1] === 0 && c[1][2] === VW && c[1][3] === VH);
  assert.ok(bg, 'фон за пределами подземелья — #0a0d12 на весь вьюпорт');
  const p1 = G.worldToScreen(1, 1, cx, cy, G.ZOOM_MIN, VW, VH);
  assert.ok(floorRectAt(calls, p1.x, p1.y, G.ZOOM_MIN),
    'игрок (1,1) смещён ОТ центра (cam зафиксирован на (2.5,2.5))');
  assert.ok(Math.abs(lastPlayerMoveTo(calls)[0]
    - G.worldToScreen(1.5, 1.5, cx, cy, G.ZOOM_MIN, VW, VH).x) <= 1e-9,
    'ромб игрока — от центра, а не по центру экрана');
  // Игрок сдвинулся — центрирование сохраняется (не гонится за игроком).
  s.x = 3;
  s.y = 3;
  T.t += 16;
  tick(rafStubs);
  const p2 = G.worldToScreen(3, 3, cx, cy, G.ZOOM_MIN, VW, VH);
  assert.ok(floorRectAt(calls, p2.x, p2.y, G.ZOOM_MIN),
    'после сдвига игрока cam всё ещё (2.5, 2.5)');
  assert.ok(Math.abs(lastPlayerMoveTo(calls)[0]
    - G.worldToScreen(3.5, 3.5, cx, cy, G.ZOOM_MIN, VW, VH).x) <= 1e-9,
    'ромб игрока (3,3) — симметрично справа-снизу от центра');
});

test('подземелье UI: пол — фолбэк fillRect #182029 (функции dungeonFloorFrame нет), по проекции, размер zoom', () => {
  // Цепочка без sprites.js: G.dungeonFloorFrame отсутствует (как в
  // песочнице до 000069) → пол — #182029, как сейчас, но по мировой
  // проекции и размером zoom×zoom.
  const rafStubs = makeRafStubs();
  const T = { t: 1000 };
  const { G, body } = loadDungeonUi({
    performance: { now: () => T.t },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  assert.equal(G.dungeonFloorFrame, undefined,
    'предусловие: sprites.js в цепочке нет');
  G.dungeonUI.start({ state: makeState(), onMove() {}, zoom: 48 });
  T.t += 16;
  tick(rafStubs);
  const calls = findCanvas(body).drawCalls;
  // 5×5 @ 48 = 240 < вьюпорта → центрирование (2.5, 2.5); floor 3×3.
  const corners = new Set();
  for (let y = 1; y <= 3; y++) {
    for (let x = 1; x <= 3; x++) {
      const p = G.worldToScreen(x, y, 2.5, 2.5, 48, VW, VH);
      corners.add(p.x + ',' + p.y);
      assert.ok(floorRectAt(calls, p.x, p.y, 48),
        'floor (' + x + ',' + y + ') — фолбэк #182029 по проекции, 48×48');
    }
  }
  const fr = floorRects(calls);
  assert.ok(fr.length >= 9, 'floor-клетки нарисованы');
  for (const c of fr) {
    assert.ok(corners.has(c[1][0] + ',' + c[1][1]),
      'floor только на 9 пол-клетках: ' + c[1][0] + ',' + c[1][1]);
    assert.equal(c[1][2], 48);
    assert.equal(c[1][3], 48);
  }
  assert.ok(!calls.some((c) => c[0] === 'drawImage'),
    'без dungeonFloorFrame — drawImage нет');
});

test('подземелье UI: пол-спрайт — drawImage по G.dungeonFloorFrame, zoom×zoom; изображение не готово → фолбэк', () => {
  const fakeImg = { __fake: 'floor' };
  // (а) dungeonFloorFrame есть + spriteLoader (DI через opts) готов.
  let rafStubs = makeRafStubs();
  let T = { t: 1000 };
  let loaded = loadDungeonUi({
    performance: { now: () => T.t },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  let G = loaded.G;
  G.dungeonFloorFrame = (type, x, y) => 'test/floor.svg';
  const requested = [];
  const loader = {
    image: (p) => { requested.push(p); return fakeImg; },
    isReady: () => true,
  };
  G.dungeonUI.start({
    state: makeState(), onMove() {}, zoom: 48, spriteLoader: loader,
  });
  T.t += 16;
  tick(rafStubs);
  let calls = findCanvas(loaded.body).drawCalls;
  const di = calls.filter((c) => c[0] === 'drawImage');
  assert.ok(di.length >= 9, 'floor-спрайты — drawImage (9 клеток)');
  for (let y = 1; y <= 3; y++) {
    for (let x = 1; x <= 3; x++) {
      const p = G.worldToScreen(x, y, 2.5, 2.5, 48, VW, VH);
      const hit = di.find((c) => c[1][0] === fakeImg
        && Math.abs(c[1][1] - p.x) <= 1e-9 && Math.abs(c[1][2] - p.y) <= 1e-9
        && c[1][3] === 48 && c[1][4] === 48);
      assert.ok(hit, 'floor (' + x + ',' + y + ') — drawImage по пути, 48×48');
    }
  }
  for (const c of di) {
    assert.equal(c[1][0], fakeImg, 'drawImage — изображение лоадера, не null');
  }
  assert.deepEqual(new Set(requested), new Set(['test/floor.svg']),
    'запрошены пути G.dungeonFloorFrame: ' + JSON.stringify(requested));
  assert.equal(floorRects(calls).length, 0,
    'спрайт готов → фолбэк #182029 на floor не рисуется');
  // (б) лоадер не готов (image → null): гард ДО drawImage — фолбэк,
  //     в браузере drawImage(null) — TypeError.
  rafStubs = makeRafStubs();
  T = { t: 1000 };
  loaded = loadDungeonUi({
    performance: { now: () => T.t },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  G = loaded.G;
  G.dungeonFloorFrame = (type, x, y) => 'test/floor.svg';
  const brokenLoader = { image: () => null, isReady: () => false };
  G.dungeonUI.start({
    state: makeState(), onMove() {}, zoom: 48, spriteLoader: brokenLoader,
  });
  T.t += 16;
  tick(rafStubs);
  calls = findCanvas(loaded.body).drawCalls;
  assert.ok(!calls.some((c) => c[0] === 'drawImage'),
    'изображение не готово → drawImage не вызывается (null-guard)');
  const fr = floorRects(calls);
  assert.ok(fr.length >= 9, 'фолбэк #182029 вместо несуществующего спрайта');
});

test('подземелье UI: стены — без d.wallObjs drawImage нет; с wallObjs — drawImage по obj, слой ПОД мобами/игроком', () => {
  const fakeWall = { __fake: 'wall' };
  const loader = { image: () => fakeWall, isReady: () => true };
  // (а) wallObjs нет (старый формат/гард) — обхода нет, drawImage нет.
  let rafStubs = makeRafStubs();
  let T = { t: 1000 };
  let loaded = loadDungeonUi({
    performance: { now: () => T.t },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  loaded.G.dungeonUI.start({
    state: makeState(), onMove() {}, zoom: 48, spriteLoader: loader,
  });
  T.t += 16;
  tick(rafStubs);
  assert.ok(!findCanvas(loaded.body).drawCalls
    .some((c) => c[0] === 'drawImage'),
    'без d.wallObjs — drawImage на стены нет (гард на массив)');
  // (б) wallObjs + G.DUNGEON_WALL_FRAMES + loader: слой стен — ПОД
  //     мобами/игроком (порядок зафиксирован в memory 000070).
  rafStubs = makeRafStubs();
  T = { t: 1000 };
  loaded = loadDungeonUi({
    performance: { now: () => T.t },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  loaded.G.DUNGEON_WALL_FRAMES = { rock_1: 'test/wall.svg' };
  const s = makeState({
    wallObjs: [{ x: 0, y: 0, obj: 'rock_1' }],
    mobs: [{ x: 2, y: 2, level: 5, defeated: false }],
  });
  loaded.G.dungeonUI.start({
    state: s, onMove() {}, zoom: 48, spriteLoader: loader,
  });
  T.t += 16;
  tick(rafStubs);
  const calls = findCanvas(loaded.body).drawCalls;
  // 5×5 @ 48 → центрирование (2.5, 2.5); стена (0,0) — угол клетки.
  const p = loaded.G.worldToScreen(0, 0, 2.5, 2.5, 48, VW, VH);
  const wallIdx = calls.findIndex((c) => c[0] === 'drawImage'
    && c[1][0] === fakeWall
    && Math.abs(c[1][1] - p.x) <= 1e-9 && Math.abs(c[1][2] - p.y) <= 1e-9
    && c[1][3] === 48 && c[1][4] === 48);
  assert.ok(wallIdx >= 0,
    'стена (0,0) — drawImage по obj из G.DUNGEON_WALL_FRAMES, 48×48');
  const mobIdx = calls.findIndex((c) => c[0] === 'fillRect'
    && c[2] === '#d9483b'); // цвет моба (не босс)
  assert.ok(mobIdx >= 0, 'моб нарисован (fillRect #d9483b)');
  let playerIdx = -1;
  for (let i = calls.length - 1; i >= 0; i--) {
    if (calls[i][0] === 'moveTo') { playerIdx = i; break; }
  }
  assert.ok(playerIdx >= 0, 'ромб игрока нарисован');
  assert.ok(wallIdx < mobIdx,
    'стены ПОД мобами: ' + wallIdx + ' < ' + mobIdx);
  assert.ok(mobIdx < playerIdx,
    'мобы ПОД игроком: ' + mobIdx + ' < ' + playerIdx);
});

test('подземелье UI: close() останавливает rAF-цикл (cancelAnimationFrame, поздний tick не рендерит)', () => {
  const rafStubs = makeRafStubs();
  const T = { t: 1000 };
  const { G, body } = loadDungeonUi({
    performance: { now: () => T.t },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  G.dungeonUI.start({ state: makeState(), onMove() {}, zoom: 48 });
  assert.ok(rafStubs.scheduled.length >= 1, 'после start() rAF запланирован');
  T.t += 16;
  tick(rafStubs);
  assert.ok(rafStubs.scheduled.length >= 2, 'цикл жив: следующий tick отложен');
  G.dungeonUI.close();
  assert.equal(G.dungeonUI.isActive(), false, 'оверлей закрыт');
  assert.ok(rafStubs.cancelled.length >= 1,
    'close() — cancelAnimationFrame (паттерн combat-ui.js)');
  const canvas = findCanvas(body);
  const n0 = canvas.drawCalls.length;
  const nSched = rafStubs.scheduled.length;
  // «Потерянный» tick, запланированный до close: активность false →
  // рендера нет, нового schedule нет.
  rafStubs.scheduled[rafStubs.scheduled.length - 1]();
  assert.equal(canvas.drawCalls.length, n0, 'tick после close не рендерит');
  assert.equal(rafStubs.scheduled.length, nSched, 'после close новых ticks нет');
});

test('подземелье UI: state.pos(now) — ромб игрока в pos-позиции (не s.x/s.y); без pos — (s.x, s.y)', () => {
  // Хук для 000068: позиция игрока — функция pos(now) (000068 даст
  // ds.pos = (now) => ds.mover.renderPos(now)); пока — фолбэк (s.x, s.y).
  // 5×5 @ 48 → центрирование (2.5, 2.5): ромб видно по смещению от центра.
  let rafStubs = makeRafStubs();
  let T = { t: 1000 };
  let loaded = loadDungeonUi({
    performance: { now: () => T.t },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  let s = makeState({ pos: () => ({ x: 3, y: 2 }) });
  loaded.G.dungeonUI.start({ state: s, onMove() {}, zoom: 48 });
  T.t += 16;
  tick(rafStubs);
  let calls = findCanvas(loaded.body).drawCalls;
  let px = loaded.G.worldToScreen(3.5, 2.5, 2.5, 2.5, 48, VW, VH).x;
  assert.ok(Math.abs(lastPlayerMoveTo(calls)[0] - px) <= 1e-9,
    'pos(now) → ромб в клетке (3,2), а не (s.x, s.y) = (1,1)');
  rafStubs = makeRafStubs();
  T = { t: 1000 };
  loaded = loadDungeonUi({
    performance: { now: () => T.t },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  s = makeState(); // без pos — фолбэк (s.x, s.y)
  loaded.G.dungeonUI.start({ state: s, onMove() {}, zoom: 48 });
  T.t += 16;
  tick(rafStubs);
  calls = findCanvas(loaded.body).drawCalls;
  px = loaded.G.worldToScreen(1.5, 1.5, 2.5, 2.5, 48, VW, VH).x;
  assert.ok(Math.abs(lastPlayerMoveTo(calls)[0] - px) <= 1e-9,
    'без pos — фолбэк (s.x, s.y) = (1,1)');
});

test('подземелье UI: state.pos(now) — цель КАМЕРЫ тоже pos-позиция (задел 000068)', () => {
  // Та же точка — и для ромба, и для цели камеры: 000068 добавит
  // mover.renderPos, камера обязана следить за глейдом, а не за
  // целочисленным s.x/s.y.
  let rafStubs = makeRafStubs();
  let T = { t: 1000 };
  let loaded = loadDungeonUi({
    performance: { now: () => T.t },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  let G = loaded.G;
  // 25×25, zoom 40: с pos (13,13) — цель (13.5,13.5) в пределах клампа
  // [10,15]×[7.5,17.5] → снап сразу туда (первый кадр, dt=0).
  let s = makeState({ width: 25, height: 25, pos: () => ({ x: 13, y: 13 }) });
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 40 });
  T.t += 16;
  tick(rafStubs);
  let calls = findCanvas(loaded.body).drawCalls;
  let p = G.worldToScreen(13, 13, 13.5, 13.5, 40, VW, VH);
  assert.ok(floorRectAt(calls, p.x, p.y, 40),
    'с pos(now): камера смотрит на (13.5, 13.5) — floor (13,13) в '
    + p.x + ',' + p.y);
  // Без pos: цель (1.5,1.5) → кламп (10, 7.5) — та же сетка, другой cam.
  rafStubs = makeRafStubs();
  T = { t: 1000 };
  loaded = loadDungeonUi({
    performance: { now: () => T.t },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  G = loaded.G;
  s = makeState({ width: 25, height: 25 });
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 40 });
  T.t += 16;
  tick(rafStubs);
  calls = findCanvas(loaded.body).drawCalls;
  p = G.worldToScreen(13, 13, VW / 2 / 40, VH / 2 / 40, 40, VW, VH);
  assert.ok(floorRectAt(calls, p.x, p.y, 40),
    'без pos: камера у клампа (10, 7.5) — floor (13,13) в ' + p.x + ',' + p.y);
});

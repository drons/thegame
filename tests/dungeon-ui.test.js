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
// КРАСНЫЕ 000067 (падают до реализации, зелёные после) — анимированные
// спрайты Флогистона/мобов + спрайт сундука вместо ромба/квадратов:
//   * игрок — drawImage по G.phlogistonFrames('idle')[Math.floor(
//     G.frameIndex(now, pos.x, pos.y, n))], zoom*1.15, центр клетки
//     (хук playerPos); ромба (moveTo/#8cf2fc) нет;
//   * мобы — ПО КАЖДОМУ mobId группы: mobSpriteKind → MOB_FRAMES →
//     кадр Math.floor(G.frameIndex(now, ux, uy, frames.length))
//     (floor ОБЯЗАТЕЛЕН: frameIndex на дробных координатах юнита даёт
//     дробный индекс), zoom*1.2, смещения юнита по индексу
//     [0,0], [−0.35,0.15], [0.35,0.15]; красных квадратов нет;
//   * босс — N спрайтов юнитов + ОДИН #b06ad4-прямоугольник
//     (bounding box юнитов, рисован ПОДО спрайтами), покрывает центр
//     группы; без босса — #b06ad4 нет;
//   * сундук — drawImage assets/dungeon/chest.svg (zoom*0.8, центр
//     клетки) при !opened; opened — НЕ рисуется; image не готов —
//     фолбэк (золотой квадрат + полоса);
//   * смена кадра во времени (разные now → разные кадры) + детерминизм
//     (тот же now → тот же кадр);
//   * фолбэки ПЕР-ЮНИТ: image null на одном виде — квадрат ИМЕННО для
//     этого юнита, остальные — спрайты; legacy-группа БЕЗ mobIds —
//     полный фолбэк без падения;
//   * spriteLoader=null / sprites.js не в цепочке — drawImage нет,
//     полные фолбэки (регрессия);
//   * sprites.js: G.DUNGEON_CHEST, путь в allAssetPaths, файл есть;
//   * tests/svg.test.js: EXPECTED_SVG_BY_DIR 'dungeon': 1 (chest.svg).
// Песочница 000067: loadDungeonUi({ withSprites: true }) — sprites.js
// в цепочке ДО dungeon-ui.js (opt-in; цепочка по умолчанию НЕ меняется
// — тест пола предусловием требует G.dungeonFloorFrame === undefined).
// Кадр — только явным G.dungeonUI.render(now) (событийный рендер,
// performance-стаб задаёт now start()-рендера).
//
// КРАСНЫЕ 000068 (падают до реализации, зелёные после) — плавное
// движение в подземелье (мувер motion.js, паттерн мира 000033):
//   * во время глейда (pos(now) ≠ (s.x, s.y)) — кадр игрока из
//     G.phlogistonFrames('walk'), а не 'idle' (хук playerAction из
//     000067: раньше ВСЕГДА 'idle');
//   * спрайт — в дробной экранной точке МЕЖДУ клетками (drawCalls
//     сверяются по координатам; позиция пересчитывается тестом через
//     ТОТ ЖЕ ядро-модуль — реальный G.createMover: цепочка песочницы
//     уже грузит motion.js в КОНЦЕ, порядок index.html).
// Сам мувер живёт в dungeonState, создаётся в main.js (клеянка, в
// node не покрывается): тест «клеит» — форма состояния
// maybeEnterDungeon { dg, contents, x, y, pos } + симуляция
// dungeonMove (s.x/s.y обновляются ДО mover.step, from = старая
// клетка; интервал — move_interval_ms из global-settings, тот же
// источник MOVE_INTERVAL_MS; «Ловкий шаг» в подземелье НЕ применяется
// — ограничение задачи).
// ЗЕЛЁНЫЕ с первого запуска (регрессия-фиксация задела 000066/000067):
//   * ДО шага и НА/ПОСЛЕ конца глейда (p >= 1) — 'idle' и ТОЧНАЯ
//     клетка (s.x, s.y) — без «перетриггера» walk;
//   * дробная точка без лоадера — ромб МЕЖДУ клетками;
//   * цель КАМЕРЫ тоже дробная (25×25, zoom 40 — внутри клампа,
//     без округления к целой клетке);
//   * без pos() — (s.x, s.y) и 'idle' (тесты 000066/000067,
//     без изменений — весь файл остаётся зелёным);
//   * структурный: dungeon-ui.js НЕ ссылается на createMover
//     (UMD-ловушка: в index.html motion.js грузится ПОСЛЕ
//     dungeon-ui.js — мувер создаётся только в main.js).
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
//     typeof-гарды, паттерн combat-ui.js);
//   withSprites — sprites.js в цепочке ДО dungeon-ui.js (порядок
//     index.html, 000067). OPT-IN: цепочка по умолчанию без sprites.js
//     НЕ меняется (тест пола предусловием проверяет
//     G.dungeonFloorFrame === undefined).
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
  chain.push('dungeon.js');
  // sprites.js — в index.html ДО dungeon-ui.js (379 vs 381); UMD-модуль
  // ЗАМЕНЯЕТ Game, поэтому dungeon-ui.js грузится ПОСЛЕ него (снапшот G
  // уже видит phlogistonFrames/MOB_FRAMES и т.д.).
  if (opts.withSprites) chain.push('sprites.js');
  chain.push('dungeon-ui.js');
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
//   type — DUNGEON_TYPES (по умолчанию 0, CAVE);
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

// --- Красные: требования задачи 000067 (падают до реализации) ---
//
// Анимированные спрайты Флогистона и мобов + спрайт сундука. 5×5 @ zoom
// 48 → вьюпорт больше подземелья → cam (2.5, 2.5) (центрирование),
// координаты — через G.worldToScreen (та же формула, что мир). Кадр —
// явным G.dungeonUI.render(now) (событийный рендер; start() рендерит при
// T.t = 1000). Все функции спрайтов в тесте читаются из G песочницы
// (withSprites) — имена/числа кадров НЕ хардкодим (только
// frames.length, паттерн задачи: 000062 расширит MOB_FRAMES).

// Детерминированные смещения юнита группы ПО ИНДЕКСУ (спека 000067):
// группа «встает» вокруг своей клетки.
const MOB_UNIT_OFF = [[0, 0], [-0.35, 0.15], [0.35, 0.15]];

// DI spriteLoader-стаб (контракт createSpriteLoader, 000047/000066):
// «ready»-изображение — ТОЛЬКО для путей из paths; у каждого пути —
// СОБСТВЕННЫЙ объект { __img: path } (drawCalls сверяем по изображению,
// путь читаем из стаба). Остальные пути — не готовы (image → null).
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

// Юниты группы (спека 000067): mobIds по индексу юнита со смещениями.
function mobUnits(m) {
  return m.mobIds.map((id, i) => ({
    id,
    x: m.x + MOB_UNIT_OFF[i % MOB_UNIT_OFF.length][0],
    y: m.y + MOB_UNIT_OFF[i % MOB_UNIT_OFF.length][1],
  }));
}

// Ожидаемый спрайт юнита группы i (спека 000067):
// mobSpriteKind → MOB_FRAMES → кадр Math.floor(G.frameIndex(now, ux, uy,
// frames.length)) (floor ОБЯЗАТЕЛЕН — frameIndex на дробных координатах
// юнита возвращает ДРОБНЫЙ индекс, frames[1.6] = undefined), размер
// zoom*1.2 (мобы мира), центр — (ux+0.5, uy+0.5).
function expectedMobSprite(G, now, m, i, zoom, camX, camY) {
  const u = mobUnits(m)[i];
  const frames = G.MOB_FRAMES[G.mobSpriteKind(u.id)];
  const fi = Math.floor(G.frameIndex(now, u.x, u.y, frames.length));
  const p = G.worldToScreen(u.x + 0.5, u.y + 0.5, camX, camY, zoom, VW, VH);
  const s = zoom * 1.2;
  return { path: frames[fi], x: p.x - s / 2, y: p.y - s / 2, s };
}

// drawImage с точными координатами/размером (спрайт центрирован:
// drawImage(img, cx−s/2, cy−s/2, s, s)); возвращает совпавшие вызовы.
function drawImageAt(calls, x, y, s, tol = 1e-9) {
  return calls.filter((c) => c[0] === 'drawImage'
    && Math.abs(c[1][1] - x) <= tol
    && Math.abs(c[1][2] - y) <= tol
    && Math.abs(c[1][3] - s) <= tol
    && Math.abs(c[1][4] - s) <= tol);
}

// fillRect цветом color в точных координатах/размерах.
function fillRectAt(calls, color, x, y, w, h, tol = 1e-9) {
  return calls.some((c) => c[0] === 'fillRect' && c[2] === color
    && Math.abs(c[1][0] - x) <= tol
    && Math.abs(c[1][1] - y) <= tol
    && Math.abs(c[1][2] - w) <= tol
    && Math.abs(c[1][3] - h) <= tol);
}

// fillText текстом text в fillStyle color в пределах tol px от точки.
function fillTextNear(calls, text, color, x, y, tol) {
  return calls.some((c) => c[0] === 'fillText' && c[1][0] === text
    && c[2] === color
    && Math.abs(c[1][1] - x) <= tol
    && Math.abs(c[1][2] - y) <= tol);
}

// Песочница 000067: sprites.js в цепочке (withSprites) + performance-стаб
// (now start()-рендера = T.t = 1000). Без rAF — кадр только явным
// G.dungeonUI.render(now) (событийный рендер, паттерн 000043/000066).
function loadSpriteDungeon(opts = {}) {
  const T = { t: 1000 };
  const loaded = loadDungeonUi(Object.assign({
    withSprites: true,
    performance: { now: () => T.t },
  }, opts));
  return { G: loaded.G, body: loaded.body, T };
}

test('подземелье UI 000067: игрок — спрайт Флогистона вместо ромба (ready-лоадер)', () => {
  // Игрок — кадры G.phlogistonFrames('idle') (в этой задаче всегда
  // 'idle'), размер zoom*1.15 (формула мира), центр — (pos.x+0.5,
  // pos.y+0.5) (тот же хук playerPos, что и у ромба/камеры).
  const { G, body } = loadSpriteDungeon();
  const idle = G.phlogistonFrames('idle');
  const loader = makeSpriteLoader(idle); // ready — только кадры idle
  G.dungeonUI.start({
    state: makeState(), onMove() {}, zoom: 48, spriteLoader: loader,
  });
  const calls = findCanvas(body).drawCalls; // start() — render при T.t=1000
  const i = Math.floor(G.frameIndex(1000, 1, 1, idle.length));
  const p = G.worldToScreen(1.5, 1.5, 2.5, 2.5, 48, VW, VH);
  const s = 48 * 1.15;
  const hit = drawImageAt(calls, p.x - s / 2, p.y - s / 2, s)
    .find((c) => c[1][0] && c[1][0].__img === idle[i]);
  assert.ok(hit,
    'игрок — drawImage кадра ' + idle[i] + ' (G.phlogistonFrames + '
    + 'G.frameIndex), zoom*1.15 = ' + s + ', центр клетки (1,1)');
  assert.ok(!calls.some((c) => c[0] === 'moveTo'),
    'ромба игрока нет (moveTo не вызывается)');
  assert.ok(!calls.some((c) => c[2] === '#8cf2fc'),
    'цвета ромба #8cf2fc нет');
});

test('подземелье UI 000067: мобы — по числу mobIds, zoom*1.2, смещения по индексу юнита', () => {
  // Группа из 3 mobIds (мобы пещеры, type 0): каждый юнит — СВОЙ
  // спрайт (не «одна группа = один спрайт», как мир):
  // mobSpriteKind(mobIds[i]) → MOB_FRAMES[kind] → кадр по
  // Math.floor(G.frameIndex(now, ux, uy, frames.length)), ux/uy =
  // g.x+off[i].x / g.y+off[i].y.
  const { G, body } = loadSpriteDungeon();
  const group = {
    x: 2, y: 2, level: 5, defeated: false,
    mobIds: ['skeleton', 'ant', 'crawling_bones'],
  };
  const loader = makeSpriteLoader(allMobFramePaths(G));
  G.dungeonUI.start({
    state: makeState({ mobs: [group] }), onMove() {}, zoom: 48,
    spriteLoader: loader,
  });
  const calls = findCanvas(body).drawCalls;
  const s = 48 * 1.2;
  const mobImgs = calls.filter((c) => c[0] === 'drawImage'
    && Math.abs(c[1][3] - s) <= 1e-9 && Math.abs(c[1][4] - s) <= 1e-9);
  assert.equal(mobImgs.length, 3,
    'drawImage по числу mobIds (3 юнита), zoom*1.2 = ' + s
    + ': найдено ' + mobImgs.length);
  group.mobIds.forEach((id, i) => {
    const e = expectedMobSprite(G, 1000, group, i, 48, 2.5, 2.5);
    const hit = drawImageAt(calls, e.x, e.y, s)
      .find((c) => c[1][0] && c[1][0].__img === e.path);
    assert.ok(hit,
      'юнит ' + i + ' (' + id + ') — drawImage ' + e.path
      + ' (mobSpriteKind → MOB_FRAMES → Math.floor(frameIndex)), '
      + 'центр (' + (group.x + MOB_UNIT_OFF[i][0] + 0.5) + ', '
      + (group.y + MOB_UNIT_OFF[i][1] + 0.5) + ')');
  });
  assert.ok(!calls.some((c) => c[0] === 'fillRect' && c[2] === '#d9483b'),
    'красных квадратов #d9483b нет: вся группа — спрайты');
  const c = G.worldToScreen(2.5, 2.5, 2.5, 2.5, 48, VW, VH);
  assert.ok(fillTextNear(calls, '5', '#fff', c.x, c.y, 4),
    'белый номер уровня группы сохранён');
  // Слои (memory/000070): мобы ПОД игроком. Игрок здесь — ромб (idle
  // не в ready-наборе) — последний path-вызов (moveTo).
  const playerIdx = calls.findIndex((c) => c[0] === 'moveTo');
  assert.ok(playerIdx >= 0, 'игрок нарисован (ромб: idle-кадры не ready)');
  for (const m of mobImgs) {
    assert.ok(calls.indexOf(m) < playerIdx,
      'спрайт моба ПОД игроком (порядок слоёв)');
  }
});

test('подземелье UI 000067: босс — N спрайтов юнитов + ОДИН #b06ad4-прямоугольник группы + номер; без босса — подсветки нет', () => {
  // Босс Бездны — 3 юнита (abomination + 2 lower_demon, все 'abyss'):
  // 3 drawImage (число вызовов, а не distinct-путей — фаза кадра
  // различается по юнитам) + ОДИН #b06ad4-прямоугольник (bounding box
  // юнитов, рисован ДО спрайтов, покрывает центр группы). Обычная
  // группа — без #b06ad4.
  const boss = {
    x: 2, y: 2, level: 7, defeated: false, boss: true,
    mobIds: ['abomination', 'lower_demon', 'lower_demon'],
  };
  const regular = {
    x: 3, y: 1, level: 5, defeated: false, mobIds: ['succubus'],
  };
  // (а) босс и не-босс группа в одном стейте.
  let { G, body } = loadSpriteDungeon();
  let loader = makeSpriteLoader(allMobFramePaths(G));
  G.dungeonUI.start({
    state: makeState({ type: 4, mobs: [boss, regular] }),
    onMove() {}, zoom: 48, spriteLoader: loader,
  });
  let calls = findCanvas(body).drawCalls;
  const s = 48 * 1.2;
  const mobImgs = calls.filter((c) => c[0] === 'drawImage'
    && Math.abs(c[1][3] - s) <= 1e-9 && Math.abs(c[1][4] - s) <= 1e-9);
  assert.equal(mobImgs.length, 4,
    '3 юнита босса + 1 юнит обычной группы — 4 спрайта');
  for (const g of [boss, regular]) {
    for (let i = 0; i < g.mobIds.length; i++) {
      const e = expectedMobSprite(G, 1000, g, i, 48, 2.5, 2.5);
      const hit = drawImageAt(calls, e.x, e.y, s)
        .find((c) => c[1][0] && c[1][0].__img === e.path);
      assert.ok(hit, (g.boss ? 'босс ' : 'обычная группа ') + 'юнит '
        + i + ' (' + g.mobIds[i] + ') — спрайт ' + e.path);
    }
  }
  const purple = calls.filter((c) => c[0] === 'fillRect' && c[2] === '#b06ad4');
  assert.equal(purple.length, 1,
    'boss-подсветка — ровно ОДИН прямоугольник #b06ad4: ' + purple.length);
  const [bx, by, bw, bh] = purple[0][1];
  const bc = G.worldToScreen(2.5, 2.5, 2.5, 2.5, 48, VW, VH); // центр босса
  assert.ok(bx <= bc.x + 1e-9 && bc.x <= bx + bw + 1e-9
    && by <= bc.y + 1e-9 && bc.y <= by + bh + 1e-9,
    'подсветка покрывает центр группы босса (bounding box юнитов): '
    + '[' + bx + ',' + by + ' ' + bw + 'x' + bh + ']');
  const bossRectIdx = calls.indexOf(purple[0]);
  for (let i = 0; i < 3; i++) {
    const e = expectedMobSprite(G, 1000, boss, i, 48, 2.5, 2.5);
    const hit = drawImageAt(calls, e.x, e.y, s)
      .find((c) => c[1][0] && c[1][0].__img === e.path);
    assert.ok(calls.indexOf(hit) > bossRectIdx,
      'boss-подсветка рисуется ДО спрайтов юнитов (под ними)');
  }
  assert.ok(fillTextNear(calls, '7', '#fff', bc.x, bc.y, 4),
    'белый номер уровня босса «7» сохранён');
  const rc = G.worldToScreen(3.5, 1.5, 2.5, 2.5, 48, VW, VH);
  assert.ok(fillTextNear(calls, '5', '#fff', rc.x, rc.y, 4),
    'номер обычной группы «5» сохранён');
  // (б) не-босс группа одна — подсветки нет совсем.
  ({ G, body } = loadSpriteDungeon());
  loader = makeSpriteLoader(allMobFramePaths(G));
  G.dungeonUI.start({
    state: makeState({ type: 4, mobs: [regular] }),
    onMove() {}, zoom: 48, spriteLoader: loader,
  });
  calls = findCanvas(body).drawCalls;
  assert.ok(!calls.some((c) => c[0] === 'fillRect' && c[2] === '#b06ad4'),
    'без босса — прямоугольника #b06ad4 нет');
  assert.equal(calls.filter((c) => c[0] === 'drawImage').length, 1,
    'не-босс группа — её спрайт (фолбэков нет)');
});

test('подземелье UI 000067: смена кадра во времени + детерминизм (тот же now — тот же кадр)', () => {
  // Рендер (1000) → (1480) → (1000): кадр игрока в 1-м и 3-м рендерах
  // РАВЕН, во 2-м ДРУГОЙ (frameIndex(1000,1,1,2)=0,
  // frameIndex(1480,1,1,2)=1 — проверено). Индекс всегда целый в
  // [0, n) — pinned Math.floor (защита от дробного frameIndex на
  // дробных координатах).
  const { G, body } = loadSpriteDungeon();
  const idle = G.phlogistonFrames('idle');
  assert.ok(idle.length >= 2, 'предусловие: у idle 2+ кадра');
  const i1000 = Math.floor(G.frameIndex(1000, 1, 1, idle.length));
  const i1480 = Math.floor(G.frameIndex(1480, 1, 1, idle.length));
  assert.notEqual(i1480, i1000,
    'предусловие: 1000 и 1480 дают РАЗНЫЕ кадры (FRAME_MS=480)');
  const loader = makeSpriteLoader(idle);
  G.dungeonUI.start({
    state: makeState(), onMove() {}, zoom: 48, spriteLoader: loader,
  });
  const canvas = findCanvas(body);
  const n0 = canvas.drawCalls.length; // start(): render при T.t = 1000
  G.dungeonUI.render(1480);
  const n1 = canvas.drawCalls.length;
  G.dungeonUI.render(1000);
  const segs = [
    canvas.drawCalls.slice(0, n0),
    canvas.drawCalls.slice(n0, n1),
    canvas.drawCalls.slice(n1),
  ];
  const p = G.worldToScreen(1.5, 1.5, 2.5, 2.5, 48, VW, VH);
  const s = 48 * 1.15;
  const playerImg = (segCalls) => drawImageAt(segCalls, p.x - s / 2, p.y - s / 2, s)
    .map((c) => c[1][0]).find(Boolean);
  const img0 = playerImg(segs[0]);
  const img1 = playerImg(segs[1]);
  const img2 = playerImg(segs[2]);
  assert.ok(img0 && img1 && img2, 'спрайт игрока в каждом из 3 рендеров');
  assert.equal(img0.__img, idle[i1000], 'now=1000 → кадр G.frameIndex(1000,1,1,n)');
  assert.equal(img1.__img, idle[i1480], 'now=1480 → другой кадр');
  assert.equal(img2.__img, idle[i1000],
    'now=1000 снова → тот же кадр, что в 1-м рендере (детерминизм)');
});

test('подземелье UI 000067: без лоадера (spriteLoader=null) — drawImage нет, полные фолбэки (регрессия)', () => {
  // spriteLoader=null (и sprites.js в цепочке нет — цепочка по
  // умолчанию): НИЧЕГО спрайт-ного — прежние ромб/квадраты/сундук,
  // выход/вход. Зелёный с первого запуска.
  const { G, body } = loadDungeonUi();
  const s = makeState({
    chests: [{ x: 1, y: 3, opened: false }],
    mobs: [
      { x: 2, y: 2, level: 5, defeated: false, mobIds: ['skeleton', 'ant'] },
      {
        x: 3, y: 1, level: 7, defeated: false, boss: true,
        mobIds: ['abomination', 'lower_demon', 'lower_demon'],
      },
    ],
  });
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 48 });
  const calls = findCanvas(body).drawCalls;
  assert.ok(!calls.some((c) => c[0] === 'drawImage'),
    'без spriteLoader — drawImage не вызывается вообще');
  // Игрок — прежний ромб.
  assert.ok(calls.some((c) => c[0] === 'moveTo' && c[2] === '#8cf2fc'),
    'игрок — ромб (moveTo + #8cf2fc)');
  // Мобы — прежние квадраты (прямоугольник на ГРУППУ).
  const pMob = G.worldToScreen(2, 2, 2.5, 2.5, 48, VW, VH);
  assert.ok(fillRectAt(calls, '#d9483b', pMob.x + 3, pMob.y + 3, 42, 42),
    'не-босс группа — красный квадрат #d9483b');
  const pBoss = G.worldToScreen(3, 1, 2.5, 2.5, 48, VW, VH);
  assert.ok(fillRectAt(calls, '#b06ad4', pBoss.x + 3, pBoss.y + 3, 42, 42),
    'босс — фиолетовый квадрат #b06ad4');
  assert.ok(fillTextNear(calls, '5', '#fff', pMob.x + 24, pMob.y + 24, 4),
    'номер группы «5» сохранён');
  assert.ok(fillTextNear(calls, '7', '#fff', pBoss.x + 24, pBoss.y + 24, 4),
    'номер босса «7» сохранён');
  // Сундук — прежний золотой квадрат + полоса.
  const pCh = G.worldToScreen(1, 3, 2.5, 2.5, 48, VW, VH);
  assert.ok(fillRectAt(calls, '#e0b13c', pCh.x + 3, pCh.y + 3, 42, 42),
    'сундук — золотой квадрат #e0b13c');
  assert.ok(fillRectAt(calls, '#7a5c16', pCh.x + 3, pCh.y + 23, 42, 2),
    'сундук — тёмная полоса #7a5c16');
  // Выход/вход — текстовые/цветовые маркеры (решение задачи).
  const pEx = G.worldToScreen(3, 3, 2.5, 2.5, 48, VW, VH);
  assert.ok(fillRectAt(calls, '#d4b45a', pEx.x + 2, pEx.y + 2, 44, 44),
    'выход — жёлтый квадрат #d4b45a');
  assert.ok(calls.some((c) => c[0] === 'fillText' && c[1][0] === 'X'
    && c[2] === '#101418'), 'выход — буква «X»');
  const pEn = G.worldToScreen(1, 1, 2.5, 2.5, 48, VW, VH);
  assert.ok(fillRectAt(calls, '#3f9d55', pEn.x + 4, pEn.y + 4, 40, 40),
    'вход — зелёный квадрат #3f9d55');
});

test('подземелье UI 000067: фолбэк ПЕР-ЮНИТ (вид не готов — квадрат только для этого юнита)', () => {
  // Группа ['skeleton', 'ant']: ready — только кадры 'skeleton'
  // ('ant' → 'spider' не готов). Ожидаемо: 1 drawImage (юнит 0) +
  // 1 fillRect #d9483b на месте юнита 1 (смещение [−0.35, +0.15]);
  // drawImage(null) не вызывается (null-гард — в браузере TypeError).
  const { G, body } = loadSpriteDungeon();
  const group = { x: 2, y: 2, level: 5, defeated: false, mobIds: ['skeleton', 'ant'] };
  const loader = makeSpriteLoader(G.MOB_FRAMES[G.mobSpriteKind('skeleton')]);
  G.dungeonUI.start({
    state: makeState({ mobs: [group] }), onMove() {}, zoom: 48,
    spriteLoader: loader,
  });
  const calls = findCanvas(body).drawCalls;
  const di = calls.filter((c) => c[0] === 'drawImage');
  assert.ok(!di.some((c) => c[1][0] == null),
    'drawImage не вызывается с null-изображением (гард)');
  assert.equal(di.length, 1,
    'спрайт — только у ready-юнита (skeleton): найдено ' + di.length);
  const e0 = expectedMobSprite(G, 1000, group, 0, 48, 2.5, 2.5);
  assert.ok(di[0][1][0] && di[0][1][0].__img === e0.path,
    'спрайт — юнит 0 (skeleton, смещение [0,0])');
  const pUnit1 = G.worldToScreen(2 - 0.35, 2 + 0.15, 2.5, 2.5, 48, VW, VH);
  assert.ok(fillRectAt(calls, '#d9483b', pUnit1.x + 3, pUnit1.y + 3, 42, 42),
    'юнит 1 (ant, смещение [−0.35, +0.15]) — прежний квадрат #d9483b');
  const c = G.worldToScreen(2.5, 2.5, 2.5, 2.5, 48, VW, VH);
  assert.ok(fillTextNear(calls, '5', '#fff', c.x, c.y, 4),
    'номер уровня группы сохранён');
});

test('подземелье UI 000067: legacy-группа БЕЗ mobIds + ready-лоадер — фолбэк, не падение (регрессия)', () => {
  // Группа {x, y, level, defeated} без mobIds (формат существующих
  // тестов стен): полная группа-фолбэк — квадрат + номер, drawImage по
  // этой группе нет, падения на for..of undefined нет. Зелёный с
  // первого запуска.
  const { G, body } = loadSpriteDungeon();
  const loader = makeSpriteLoader(allMobFramePaths(G)); // всё готово
  G.dungeonUI.start({
    state: makeState({ mobs: [{ x: 2, y: 2, level: 5, defeated: false }] }),
    onMove() {}, zoom: 48, spriteLoader: loader,
  });
  const calls = findCanvas(body).drawCalls;
  assert.ok(!calls.some((c) => c[0] === 'drawImage'),
    'без mobIds — спрайтов нет (группа — полный фолбэк)');
  const p = G.worldToScreen(2, 2, 2.5, 2.5, 48, VW, VH);
  assert.ok(fillRectAt(calls, '#d9483b', p.x + 3, p.y + 3, 42, 42),
    'группа — прежний квадрат #d9483b');
  assert.ok(fillTextNear(calls, '5', '#fff', p.x + 24, p.y + 24, 4),
    'номер «5» сохранён');
});

test('подземелье UI 000067: сундук — спрайт при !opened (zoom*0.8, центр клетки), НЕ рисуется при opened', () => {
  const CHEST = 'assets/dungeon/chest.svg'; // путь спрайта (спека 000067)
  // (а) !opened + ready-лоадер — спрайт сундука.
  let { G, body } = loadSpriteDungeon();
  let loader = makeSpriteLoader([CHEST]);
  G.dungeonUI.start({
    state: makeState({ chests: [{ x: 1, y: 3, opened: false }] }),
    onMove() {}, zoom: 48, spriteLoader: loader,
  });
  let calls = findCanvas(body).drawCalls;
  const c = G.worldToScreen(1.5, 3.5, 2.5, 2.5, 48, VW, VH); // центр клетки
  const s = 48 * 0.8;
  const hit = drawImageAt(calls, c.x - s / 2, c.y - s / 2, s)
    .find((im) => im[1][0] && im[1][0].__img === CHEST);
  assert.ok(hit, 'сундук — drawImage ' + CHEST + ' (zoom*0.8 = ' + s
    + ', по центру клетки (1,3))');
  assert.ok(!calls.some((im) => im[2] === '#e0b13c'),
    'золотого квадрата #e0b13c нет (спрайт заменил цвет)');
  assert.ok(!calls.some((im) => im[2] === '#7a5c16'),
    'тёмной полосы #7a5c16 нет');
  // (б) opened — НЕ рисуется вообще (клетка пуста).
  ({ G, body } = loadSpriteDungeon());
  loader = makeSpriteLoader([CHEST]);
  G.dungeonUI.start({
    state: makeState({ chests: [{ x: 1, y: 3, opened: true }] }),
    onMove() {}, zoom: 48, spriteLoader: loader,
  });
  calls = findCanvas(body).drawCalls;
  assert.ok(!calls.some((im) => im[0] === 'drawImage'),
    'открытый сундук не рисуется (drawImage нет)');
  assert.ok(!calls.some((im) => im[2] === '#e0b13c'),
    'открытый сундук — и золотого квадрата тоже нет');
  // (в) !opened + image не готов — прежний золотой квадрат + полоса.
  ({ G, body } = loadSpriteDungeon());
  G.dungeonUI.start({
    state: makeState({ chests: [{ x: 1, y: 3, opened: false }] }),
    onMove() {}, zoom: 48, spriteLoader: makeSpriteLoader([]),
  });
  calls = findCanvas(body).drawCalls;
  assert.ok(!calls.some((im) => im[0] === 'drawImage'),
    'изображение не готово — drawImage не вызывается');
  const pc = G.worldToScreen(1, 3, 2.5, 2.5, 48, VW, VH);
  assert.ok(fillRectAt(calls, '#e0b13c', pc.x + 3, pc.y + 3, 42, 42),
    'фолбэк — золотой квадрат #e0b13c');
  assert.ok(fillRectAt(calls, '#7a5c16', pc.x + 3, pc.y + 23, 42, 2),
    'фолбэк — тёмная полоса #7a5c16');
});

test('sprites.js 000067: DUNGEON_CHEST экспортирован, путь в allAssetPaths, файл существует', () => {
  // Константа-путь (паттерн BUILDING_SPRITES — литерал) + allAssetPaths
  // += путь (очередь загрузчика подхватит автоматически).
  const { G } = loadSpriteDungeon();
  assert.equal(G.DUNGEON_CHEST, 'assets/dungeon/chest.svg',
    'G.DUNGEON_CHEST — путь спрайта сундука');
  assert.ok(G.allAssetPaths().includes('assets/dungeon/chest.svg'),
    'путь в allAssetPaths()');
  assert.ok(fs.existsSync(path.join(ROOT, 'assets', 'dungeon', 'chest.svg')),
    'файл assets/dungeon/chest.svg существует');
});

// --- Красные: требования задачи 000068 (падают до реализации) ---
//
// Плавное движение в подземелье: мувер (motion.js) живёт в
// dungeonState (клеянка в main.js — в node не покрывается);
// dungeon-ui вызывает только s.pos(now) и обязан переключить
// действие кадра на 'walk' ВО ВРЕМЯ глейда (хук 000067:
// playerAction раньше всегда 'idle'). Песочница 000068 — withSprites
// (phlogistonFrames) + реальный G.createMover (motion.js — в КОНЦЕ
// цепочки, порядок index.html: на момент теста доступен): тест
// симулирует dungeonMove из main.js — s.x/s.y обновляются ДО
// mover.step, from = старая клетка; интервал — move_interval_ms из
// global-settings (420 мс, тот же источник MOVE_INTERVAL_MS, что и
// мувер подземелья в main.js); «Ловкий шаг» в подземелье НЕ
// применяется (ограничение задачи).

// Песочница 000068: реальный мувер + форма состояния
// maybeEnterDungeon из main.js { dg, contents, x, y, pos }.
function loadGlideDungeon() {
  const loaded = loadSpriteDungeon();
  const G = loaded.G;
  assert.equal(typeof G.createMover, 'function',
    'motion.js в конце цепочки (порядок index.html) — '
    + 'G.createMover доступен на момент теста');
  const settings = G.GlobalSettings && G.GlobalSettings.SETTINGS;
  const interval = (settings && Number.isFinite(settings.move_interval_ms)
    && settings.move_interval_ms > 0)
    ? settings.move_interval_ms : 420;
  const mover = G.createMover({ x: 1, y: 1, intervalMs: interval });
  // Форма, которую 000068 даст main.js: pos — функция (мувер),
  // остальное — литерал maybeEnterDungeon.
  const s = makeState({ pos: (now) => mover.position(now) });
  return { G, body: loaded.body, T: loaded.T, mover, s, interval };
}

// Спрайт игрока в ТОЧНЫХ координатах центра (cx, cy) размером zoom*1.15
// (48*1.15, формула Флогистона): пути изображений совпавших drawImage.
function playerSpriteAt(calls, cx, cy, tol = 1e-9) {
  const sz = 48 * 1.15;
  return calls.filter((c) => c[0] === 'drawImage'
    && Math.abs(c[1][1] - (cx - sz / 2)) <= tol
    && Math.abs(c[1][2] - (cy - sz / 2)) <= tol
    && Math.abs(c[1][3] - sz) <= tol
    && Math.abs(c[1][4] - sz) <= tol)
    .map((c) => c[1][0] && c[1][0].__img);
}

test('подземелье UI 000068: во время глейда — кадр из phlogistonFrames(«walk») (не «idle»), спрайт в дробной точке между клетками', () => {
  const { G, body, T, mover, s, interval } = loadGlideDungeon();
  const idle = G.phlogistonFrames('idle');
  const walk = G.phlogistonFrames('walk');
  assert.ok(idle.length >= 1 && walk.length >= 1,
    'предусловие: кадры idle и walk существуют');
  // И idle, и walk ready — видно, ИМЕННО какое действие выбрано
  // (кадр читаем из G — имена/числа не хардкодим, паттерн 000067).
  const loader = makeSpriteLoader([...idle, ...walk]);
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 48, spriteLoader: loader });
  const canvas = findCanvas(body);
  // 5×5 @ 48 → вьюпорт больше подземелья → cam (2.5, 2.5)
  // (центрирование; rAF-цикла нет — камера в тесте не движется).
  const snap = (now) => {
    const n0 = canvas.drawCalls.length;
    G.dungeonUI.render(now);
    return canvas.drawCalls.slice(n0);
  };
  // Шаг (1,1) → (2,1) в t = 1000 — симуляция main.js dungeonMove:
  // s.x/s.y обновляются ДО глейда, from = старая клетка.
  T.t = 1000;
  s.x = 2;
  s.y = 1;
  mover.step({ x: 1, y: 1 }, { x: 2, y: 1 }, 1000);
  // (а) Момент шага (p = 0): спрайт ещё на СТАРОЙ клетке (1,1), но
  //     логическая уже (2,1) — pos ≠ (s.x, s.y) → действие 'walk'.
  let pos = mover.position(1000);
  // Объекты мувера — из vm-песочницы (чужой realm): deepEqual на
  // объекте упёрся бы в прототип, сверяем поля.
  assert.equal(pos.x, 1, 'p = 0 — X позиции ещё старая клетка');
  assert.equal(pos.y, 1, 'p = 0 — Y позиции ещё старая клетка');
  assert.ok(Math.abs(pos.x - s.x) > 1e-9,
    'предусловие: pos ≠ (s.x, s.y) в момент шага');
  let seg = snap(1000);
  let p = G.worldToScreen(pos.x + 0.5, pos.y + 0.5, 2.5, 2.5, 48, VW, VH);
  let fi = Math.floor(G.frameIndex(1000, pos.x, pos.y, walk.length));
  let imgs = playerSpriteAt(seg, p.x, p.y);
  assert.equal(imgs.length, 1,
    'в момент шага — спрайт игрока (единственный drawImage)');
  assert.equal(imgs[0], walk[fi],
    'в момент шага — кадр «walk» (сейчас код рисует «idle»): '
    + (imgs[0] || 'спрайта в точке нет'));
  // (б) Середина глейда (p = 0.5): ДРОБНАЯ точка строго МЕЖДУ
  //     клетками (drawCalls сверяются по координатам).
  const mid = 1000 + interval / 2;
  T.t = mid;
  pos = mover.position(mid);
  assert.ok(pos.x > 1 && pos.x < 2 && pos.y === 1,
    'предусловие: дробная позиция между (1,1) и (2,1): '
    + JSON.stringify(pos));
  seg = snap(mid);
  p = G.worldToScreen(pos.x + 0.5, pos.y + 0.5, 2.5, 2.5, 48, VW, VH);
  const cFrom = G.worldToScreen(1.5, 1.5, 2.5, 2.5, 48, VW, VH);
  const cTo = G.worldToScreen(2.5, 1.5, 2.5, 2.5, 48, VW, VH);
  assert.ok(p.x > cFrom.x && p.x < cTo.x,
    'экранная точка строго между центрами клеток: ' + p.x
    + ' ∈ (' + cFrom.x + ', ' + cTo.x + ')');
  fi = Math.floor(G.frameIndex(mid, pos.x, pos.y, walk.length));
  imgs = playerSpriteAt(seg, p.x, p.y);
  assert.equal(imgs.length, 1,
    'в середине глейда — спрайт игрока (единственный drawImage)');
  assert.equal(imgs[0], walk[fi],
    'во время глейда — кадр «walk», а не «idle» (сейчас код '
    + 'ВСЕГДА рисует «idle»): ' + (imgs[0] || 'спрайта в точке нет'));
});

test('подземелье UI 000068: до шага и на/после конца глейда — «idle» и точная клетка (без «перетриггера» walk)', () => {
  // Зелёный с первого запуска: защищает границу walk/idle от наивной
  // реализации (например, по флагу «мувер глейдит», а не по
  // сравнению pos с (s.x, s.y): в конце глейда pos = (s.x, s.y)
  // ТОЧНО — позиция() возвращает литерал to при p >= 1).
  const { G, body, T, mover, s, interval } = loadGlideDungeon();
  const idle = G.phlogistonFrames('idle');
  const walk = G.phlogistonFrames('walk');
  const loader = makeSpriteLoader([...idle, ...walk]);
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 48, spriteLoader: loader });
  const canvas = findCanvas(body);
  const snap = (now) => {
    const n0 = canvas.drawCalls.length;
    G.dungeonUI.render(now);
    return canvas.drawCalls.slice(n0);
  };
  const noWalkFrame = (seg) => seg.every((c) => c[0] !== 'drawImage'
    || !walk.includes(c[1][0] && c[1][0].__img));
  // (а) ДО шага: pos = (s.x, s.y) = (1,1) → 'idle' в точной клетке.
  let seg = snap(1000);
  let p = G.worldToScreen(1.5, 1.5, 2.5, 2.5, 48, VW, VH);
  let fi = Math.floor(G.frameIndex(1000, 1, 1, idle.length));
  let imgs = playerSpriteAt(seg, p.x, p.y);
  assert.equal(imgs.length, 1, 'до шага — спрайт игрока');
  assert.equal(imgs[0], idle[fi],
    'pos = (s.x, s.y) → «idle», а не «walk»');
  assert.ok(noWalkFrame(seg), 'до шага — walk-кадров в кадре нет');
  // (б) Шаг; ТОЧНО в конце (p = 1): pos = (2,1) = (s.x, s.y) — 'idle'
  //     в ТОЧНОЙ клетке-цели.
  T.t = 1000;
  s.x = 2;
  s.y = 1;
  mover.step({ x: 1, y: 1 }, { x: 2, y: 1 }, 1000);
  const end = 1000 + interval;
  T.t = end;
  // Поля, а не deepEqual (объект из vm-песочницы — чужой realm).
  const posEnd = mover.position(end);
  assert.equal(posEnd.x, 2, 'p = 1 — позиция ТОЧНО в клетке-цели (x)');
  assert.equal(posEnd.y, 1, 'p = 1 — позиция ТОЧНО в клетке-цели (y)');
  seg = snap(end);
  p = G.worldToScreen(2.5, 1.5, 2.5, 2.5, 48, VW, VH);
  fi = Math.floor(G.frameIndex(end, 2, 1, idle.length));
  imgs = playerSpriteAt(seg, p.x, p.y);
  assert.equal(imgs.length, 1,
    'в конце глейда — спрайт в ТОЧНОЙ клетке (2,1)');
  assert.equal(imgs[0], idle[fi], 'в конце глейда — «idle», а не «walk»');
  assert.ok(noWalkFrame(seg), 'в конце глейда — walk-кадров в кадре нет');
  // (в) Дальше конца — то же (без отката к стартовой клетке).
  const after = end + 80;
  T.t = after;
  seg = snap(after);
  fi = Math.floor(G.frameIndex(after, 2, 1, idle.length));
  imgs = playerSpriteAt(seg, p.x, p.y);
  assert.equal(imgs.length, 1);
  assert.equal(imgs[0], idle[fi],
    'дальше конца глейда — «idle» в точной клетке (2,1)');
  assert.ok(noWalkFrame(seg), 'дальше конца глейда — walk-кадров нет');
});

test('подземелье UI 000068: дробная точка без лоадера — ромб МЕЖДУ клетками (форма состояния { dg, contents, x, y, pos })', () => {
  // Цепочка БЕЗ sprites.js (ромб — фолбэк игрока), pos — функция:
  // форма, которую 000068 даст main.js (фолбэк-ветка БЕЗ pos() —
  // (s.x, s.y) — зафиксирована тестами 000066, без изменений).
  const rafStubs = makeRafStubs();
  const T = { t: 1000 };
  const { G, body } = loadDungeonUi({
    performance: { now: () => T.t },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  const s = makeState({ pos: () => ({ x: 1.5, y: 1 }) });
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 48 });
  T.t += 16;
  tick(rafStubs);
  const calls = findCanvas(body).drawCalls;
  // 5×5 @ 48 → центрирование cam (2.5, 2.5); вершина ромба —
  // (p.x, p.y − r), r = zoom*0.3.
  const p = G.worldToScreen(2.0, 1.5, 2.5, 2.5, 48, VW, VH);
  const r = 48 * 0.3;
  const m = lastPlayerMoveTo(calls);
  assert.ok(m, 'ромб игрока в кадре');
  assert.ok(Math.abs(m[0] - p.x) <= 1e-9 && Math.abs(m[1] - (p.y - r)) <= 1e-9,
    'ромб в дробной экранной точке (2.0, 1.5): ' + JSON.stringify(m));
  const cFrom = G.worldToScreen(1.5, 1.5, 2.5, 2.5, 48, VW, VH);
  const cTo = G.worldToScreen(2.5, 1.5, 2.5, 2.5, 48, VW, VH);
  assert.ok(p.x > cFrom.x && p.x < cTo.x,
    'точка строго МЕЖДУ клетками (не целочисленная клетка)');
});

test('подземелье UI 000068: цель КАМЕРЫ тоже дробная (25×25, zoom 40 — внутри клампа, без округления)', () => {
  // Та же точка playerPos — и цель камеры (хук 000066): во время
  // глейда камера смотрит на дробную точку (14.0, 13.5), а не на
  // целочисленную клетку (13.5, 13.5).
  const rafStubs = makeRafStubs();
  const T = { t: 1000 };
  const { G, body } = loadDungeonUi({
    performance: { now: () => T.t },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  // Игрок логически (13,13), точка глейда (13.5, 13): цель (14.0,
  // 13.5) ВНУТРИ кламп-диапазона [10, 15]×[7.5, 17.5] — дробная цель
  // видна (снап в первом кадре, dt = 0).
  const s = makeState({
    width: 25, height: 25, px: 13, py: 13,
    pos: () => ({ x: 13.5, y: 13 }),
  });
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 40 });
  T.t += 16;
  tick(rafStubs);
  const calls = findCanvas(body).drawCalls;
  const pFrac = G.worldToScreen(13, 13, 14.0, 13.5, 40, VW, VH);
  assert.ok(floorRectAt(calls, pFrac.x, pFrac.y, 40),
    'floor (13,13) в проекции cam (14.0, 13.5) — цель pos-точка: '
    + pFrac.x + ',' + pFrac.y);
  const pInt = G.worldToScreen(13, 13, 13.5, 13.5, 40, VW, VH);
  assert.ok(Math.abs(pInt.x - pFrac.x) > 1e-9
    || Math.abs(pInt.y - pFrac.y) > 1e-9,
    'предусловие: целочисленная и дробная цели дают разные проекции');
  assert.ok(!floorRectAt(calls, pInt.x, pInt.y, 40),
    'floor НЕ в проекции целочисленного cam (13.5, 13.5) — '
    + 'округления цели камеры нет');
});

test('подземелье UI 000068: структурный — dungeon-ui.js НЕ создаёт мувер (UMD-ловушка: createMover только в main.js)', () => {
  // В index.html motion.js грузится ПОСЛЕ dungeon-ui.js (000038): при
  // загрузке dungeon-ui.js G.createMover ещё НЕТ — load-time-ссылка
  // была бы UMD-ловушкой (снапшот G). Мувер — ОТДЕЛЬНЫЙ инстанс в
  // dungeonState, создаётся в main.js; dungeon-ui вызывает только
  // s.pos(now) и фолбэк (s.x, s.y).
  const text = src('dungeon-ui.js');
  assert.ok(!text.includes('createMover'),
    'dungeon-ui.js не ссылается на createMover '
    + '(мувер создаётся в main.js, не в оверлее)');
});

// =====================================================================
// Задача 000105: экран города — режим dungeon-ui (по state.kind).
// =====================================================================
//
// Состояние города — форма main.js enterCity (000105): dungeonState
// с полем kind: 'city', dg = layout из G.Cities.createCityLayout
// (000104; форма { width, height, cells, entrance, exit, seed, kind }
// — БЕЗ type/rooms/wallObjs), contents = null (содержимое — 000106),
// name = название_карты каталога. Экран: заголовок — имя города,
// СВОИ тайлы пола/стен (детерминированный выбор варианта по
// (x, y, seed); палитра ограничена: пол ≤3, стена ≤2), маркеры
// выхода/входа — те же, что подземелье, hint — без «Сундук и мобы»
// (город пуст) и без «[E] — постройки» (взаимодействие — 000107),
// глейд/зум/камера — общий движок 000066/000068 (без изменений).
//
// Состояние подземелья (без kind) — БЕЗ ИЗМЕНЕНИЙ: пол #182029,
// прежний hint, маркеры.
//
// КРАСНЫЕ (до реализации): S1 (stateEl «undefined»/Группы/Сундуки),
// S2 (стены города не рисуются, пол — фолбэк подземелья), S3
// (палитра/детерминированность), S5 (hint с «Сундук и мобы»).
// ЗЕЛЁНЫЕ (регрессии, зелёные с первого запуска): S4 (маркеры),
// S6 (глейд), S7 (rAF/центрирование 2x2), S8 (подземный пол),
// S8b (структурный).

const CITIES = require('../src/cities.js');

// Состояние города — форма main.js enterCity (000105): dg = layout
// (createCityLayout), contents = null (000106), kind = 'city',
// name = название_карты, первая клетка — layout.entrance.
function makeCityState(opts = {}) {
  const fp = opts.fp != null ? opts.fp : 1;
  const cx = opts.cx != null ? opts.cx : -119;
  const cy = opts.cy != null ? opts.cy : -104;
  const d = CITIES.createCityLayout(cx, cy, fp);
  const name = opts.name != null ? opts.name : 'Хутор';
  const s = {
    dg: d,
    contents: null, // город пока пуст (содержимое — 000106)
    kind: 'city',
    name,
    x: d.entrance.x,
    y: d.entrance.y,
    prevX: d.entrance.x,
    prevY: d.entrance.y,
    log: [name + ': вход.'],
  };
  if (opts.px != null) s.x = opts.px;
  if (opts.py != null) s.y = opts.py;
  if (opts.pos) s.pos = opts.pos;
  return s;
}

// Все элементы в дереве с className, содержащим cls (в порядке
// обхода): у оверлея dungeon-ui «combat-state» — ДВА (stateEl и
// hint — одноимённый класс по паттерну combat-ui).
function allByClass(el, cls) {
  const out = [];
  (function walk(n) {
    if (typeof n.className === 'string' && n.className.includes(cls)) {
      out.push(n);
    }
    for (const ch of n.children || []) walk(ch);
  })(el);
  return out;
}

// Карта «x,y → fillStyle» по КЛЕТКАМ layout: fillRect с ТОЧНЫМ
// экранным углом клетки (G.worldToScreen — та же формула, что
// рендер) и размером zoom×zoom. Маркеры входа/выхода исключены
// (размер zoom−4/zoom−8, смещение +2/+4), фон (w,h) — тоже.
// Клетка, не нарисованная fillRect'ом — null.
function cityCellColors(calls, G, s, zoom, camX, camY) {
  const d = s.dg;
  const out = {};
  for (let y = 0; y < d.height; y++) {
    for (let x = 0; x < d.width; x++) {
      const p = G.worldToScreen(x, y, camX, camY, zoom, VW, VH);
      const c = calls.find((c) => c[0] === 'fillRect'
        && Math.abs(c[1][0] - p.x) <= 1e-9
        && Math.abs(c[1][1] - p.y) <= 1e-9
        && c[1][2] === zoom
        && c[1][3] === zoom);
      out[x + ',' + y] = c ? c[2] : null;
    }
  }
  return out;
}

test('город UI 000105: stateEl — имя города, текущая клетка, «До выхода»; без «undefined»/«Группы»/«Сундуки»', () => {
  const loaded = loadDungeonUi({ performance: { now: () => 1000 } });
  const G = loaded.G;
  const s = makeCityState({ fp: 1, cx: -119, cy: -104, name: 'Хутор' });
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 40 });
  const states = allByClass(loaded.body, 'combat-state');
  assert.ok(states.length >= 2, 'оверлей: stateEl + hint (combat-state)');
  const text = states[0].textContent;
  assert.ok(text.includes('Хутор'),
    'stateEl: имя города (название_карты): ' + JSON.stringify(text));
  assert.ok(text.includes('(0, 1)'),
    'stateEl: текущая клетка героя (0,1) — layout.entrance: '
    + JSON.stringify(text));
  assert.ok(/До выхода: \d+ клеток/.test(text),
    'stateEl: «До выхода: N клеток»: ' + JSON.stringify(text));
  assert.ok(!text.includes('undefined'),
    'stateEl: без «undefined» (у layout города нет DUNGEON_NAMES[type]): '
    + JSON.stringify(text));
  assert.ok(!text.includes('Группы'),
    'stateEl: без «Группы» (у города contents нет): ' + JSON.stringify(text));
  assert.ok(!text.includes('Сундуки'),
    'stateEl: без «Сундуки» (у города contents нет): ' + JSON.stringify(text));
});

test('город UI 000105: СВОИ тайлы — 2x2 хутор: пол/стены рисуются, не фолбэк-подземные; палитра пол ≤3, стена ≤2', () => {
  const loaded = loadDungeonUi({ performance: { now: () => 1000 } });
  const G = loaded.G;
  const s = makeCityState({ fp: 1, cx: -119, cy: -104, name: 'Хутор' });
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 40 });
  assert.ok(2 * 40 <= VW && 2 * 40 <= VH,
    '2x2 @ 40 — вьюпорт больше layout → cam центрирован (1,1)');
  const colors = cityCellColors(findCanvas(loaded.body).drawCalls,
    G, s, 40, 1, 1);
  const d = s.dg;
  const floorKeys = [];
  const wallKeys = [];
  for (let y = 0; y < d.height; y++) {
    for (let x = 0; x < d.width; x++) {
      (d.cells[y * d.width + x] === G.CELL_FLOOR
        ? floorKeys : wallKeys).push(x + ',' + y);
    }
  }
  assert.deepEqual(floorKeys.sort(), ['0,0', '0,1'],
    '2x2: пол — вход (0,1) и выход (0,0)');
  assert.deepEqual(wallKeys.sort(), ['1,0', '1,1'],
    '2x2: стены — остальные две клетки');
  for (const k of floorKeys) {
    assert.ok(colors[k], 'город: пол (' + k + ') нарисован');
    assert.notEqual(colors[k], '#182029',
      'город: пол (' + k + ') — не фолбэк-пол подземелья');
    assert.notEqual(colors[k], '#0a0d12',
      'город: пол (' + k + ') — не фон «за пределами»');
  }
  for (const k of wallKeys) {
    assert.ok(colors[k],
      'город: стена (' + k + ') нарисована (у города стены — рисуются)');
    assert.notEqual(colors[k], '#0a0d12',
      'город: стена (' + k + ') — не фон «за пределами»');
  }
  const floorPalette = new Set(floorKeys.map((k) => colors[k]));
  assert.ok(floorPalette.size <= 3,
    'городский пол: ≤3 варианта (сейчас ' + floorPalette.size + ')');
  const wallPalette = new Set(wallKeys.map((k) => colors[k]));
  assert.ok(wallPalette.size <= 2,
    'городская стена: ≤2 варианта (сейчас ' + wallPalette.size + ')');
});

test('город UI 000105: СВОИ тайлы — 14x14 столица: все клетки; ≥2 варианта пола по (x,y,seed); без фолбэка #182029', () => {
  const loaded = loadDungeonUi({ performance: { now: () => 1000 } });
  const G = loaded.G;
  const s = makeCityState({ fp: 7, cx: -37, cy: 21, name: 'Столица' });
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 40 });
  assert.ok(14 * 40 <= VW && 14 * 40 <= VH,
    '14x14 @ 40 — вьюпорт больше layout → cam центрирован (7,7)');
  const colors = cityCellColors(findCanvas(loaded.body).drawCalls,
    G, s, 40, 7, 7);
  const d = s.dg;
  let undrawn = 0;
  const floorPalette = new Set();
  const wallPalette = new Set();
  for (let y = 0; y < d.height; y++) {
    for (let x = 0; x < d.width; x++) {
      const col = colors[x + ',' + y];
      if (!col) { undrawn++; continue; }
      (d.cells[y * d.width + x] === G.CELL_FLOOR
        ? floorPalette : wallPalette).add(col);
    }
  }
  assert.equal(undrawn, 0,
    '14x14: все 196 клеток layout нарисованы fillRect' +
    (undrawn ? ' (не нарисовано: ' + undrawn + ')' : ''));
  assert.ok(floorPalette.size >= 2,
    'город: ≥2 варианта пола (детерминированный выбор по (x,y,seed), '
    + 'не один цвет на всё поле); сейчас: ' + floorPalette.size);
  assert.ok(floorPalette.size <= 3,
    'городский пол: ≤3 варианта; сейчас: ' + floorPalette.size);
  assert.ok(wallPalette.size <= 2,
    'городская стена: ≤2 варианта; сейчас: ' + wallPalette.size);
  assert.ok(!floorPalette.has('#182029'),
    'город: пол — не фолбэк-пол подземелья #182029');
  assert.ok(!wallPalette.has('#182029'),
    'город: стена — не фолбэк-пол подземелья #182029');
});

test('город UI 000105: детерминированность тайлов — два рендера одного города идентичны; разные якоря (seed) — раскраска различается', () => {
  // (а) Два рендера ОДНОГО города (seed, layout) — одинаковая
  // раскраска: вариант клетки — чистая функция (x, y, seed).
  const A = loadDungeonUi({ performance: { now: () => 1000 } });
  const sA = makeCityState({ fp: 5, cx: 100, cy: -40, name: 'Город' });
  A.G.dungeonUI.start({ state: sA, onMove() {}, zoom: 40 });
  const canvasA = findCanvas(A.body);
  const n0 = canvasA.drawCalls.length;
  A.G.dungeonUI.render(1000); // тот же now — второй рендер
  const mStart = cityCellColors(canvasA.drawCalls.slice(0, n0),
    A.G, sA, 40, 5, 5);
  const mSecond = cityCellColors(canvasA.drawCalls.slice(n0),
    A.G, sA, 40, 5, 5);
  assert.equal(JSON.stringify(mStart), JSON.stringify(mSecond),
    'два рендера одного города — идентичная раскраска (чистая функция)');
  // (б) Разные якоря → разные seed → раскраска хотя бы одной
  // клетки различается (seed 3580905026 vs 2388422751, 000104).
  const B = loadDungeonUi({ performance: { now: () => 1000 } });
  const sB = makeCityState({ fp: 5, cx: 101, cy: -40, name: 'Город' });
  B.G.dungeonUI.start({ state: sB, onMove() {}, zoom: 40 });
  assert.notEqual(sA.dg.seed, sB.dg.seed,
    'предусловие: layout от разных якорей — разные seed');
  const mB = cityCellColors(findCanvas(B.body).drawCalls, B.G, sB, 40, 5, 5);
  const mAs = cityCellColors(findCanvas(A.body).drawCalls, A.G, sA, 40, 5, 5);
  assert.notEqual(JSON.stringify(mAs), JSON.stringify(mB),
    'разные seed → раскраска хотя бы одной клетки различается');
});

test('город UI 000105 (регрессия маркеров): выход «X»/вход — те же маркеры, что подземелье', () => {
  const loaded = loadDungeonUi({ performance: { now: () => 1000 } });
  const G = loaded.G;
  const s = makeCityState({ fp: 1, cx: -119, cy: -104, name: 'Хутор' });
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 40 });
  const calls = findCanvas(loaded.body).drawCalls;
  // 2x2 @ 40, cam (1,1): выход (0,0), вход (0,1) — layout 000104.
  const ex = G.worldToScreen(0, 0, 1, 1, 40, VW, VH);
  const en = G.worldToScreen(0, 1, 1, 1, 40, VW, VH);
  assert.ok(fillRectAt(calls, '#d4b45a', ex.x + 2, ex.y + 2, 36, 36),
    'выход: жёлтый квадрат (zoom−4)');
  assert.ok(fillTextNear(calls, 'X', '#101418', ex.x + 20, ex.y + 35, 2),
    'выход: буква «X»');
  assert.ok(fillRectAt(calls, '#3f9d55', en.x + 4, en.y + 4, 32, 32),
    'вход: зелёный квадрат (zoom−8)');
});

test('город UI 000105: contents: null — без сундуков/мобов, рендер не падает; hint — без «Сундук и мобы» и без «[E]»', () => {
  const loaded = loadDungeonUi({ performance: { now: () => 1000 } });
  const G = loaded.G;
  const s = makeCityState({ fp: 2, cx: -114, cy: -119, name: 'Деревня' });
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 48 });
  const calls = findCanvas(loaded.body).drawCalls;
  assert.ok(calls.length > 0, 'render при contents: null — без падения');
  assert.ok(!calls.some((c) => c[0] === 'fillRect' && c[2] === '#e0b13c'),
    'город: фолбэк-сундука #e0b13c нет (сундуков нет)');
  assert.ok(!calls.some((c) => c[0] === 'fillRect' && c[2] === '#d9483b'),
    'город: фолбэк-моба #d9483b нет (мобов нет)');
  assert.ok(!calls.some((c) => c[0] === 'fillRect' && c[2] === '#b06ad4'),
    'город: boss-подсветка #b06ad4 нет');
  const states = allByClass(loaded.body, 'combat-state');
  const hint = states[1].textContent;
  assert.ok(hint.includes('Жёлтая клетка «X» — выход.'),
    'hint: указание на выход: ' + JSON.stringify(hint));
  assert.ok(!hint.includes('Сундук'),
    'hint: без «Сундук и мобы» (город пуст; содержимое — 000106): '
    + JSON.stringify(hint));
  assert.ok(!hint.includes('[E]'),
    'hint: без «[E] — постройки» (взаимодействие — 000107): '
    + JSON.stringify(hint));
  // Регрессия: у ПОДЗЕМЕЛЬЯ hint не меняется.
  const D = loadDungeonUi({ performance: { now: () => 1000 } });
  D.G.dungeonUI.start({ state: makeState(), onMove() {}, zoom: 48 });
  const dHint = allByClass(D.body, 'combat-state')[1].textContent;
  assert.ok(dHint.includes('Сундук и мобы'),
    'подземелье: hint — прежний текст («Сундук и мобы»)');
});

test('город UI 000105 (регрессия глейда): общий движок 000066/000068 — pos-хук, walk-кадр, дробная точка', () => {
  const { G, body, T } = loadSpriteDungeon();
  const walk = G.phlogistonFrames('walk');
  const idle = G.phlogistonFrames('idle');
  const loader = makeSpriteLoader([...idle, ...walk]);
  const settings = G.GlobalSettings && G.GlobalSettings.SETTINGS;
  const interval = (settings && Number.isFinite(settings.move_interval_ms)
    && settings.move_interval_ms > 0)
    ? settings.move_interval_ms : 420;
  // 14x14 (fp7, −37,21): вход (9,13); шаг на север (9,12) — FLOOR.
  const mover = G.createMover({ x: 9, y: 13, intervalMs: interval });
  const s = makeCityState({
    fp: 7, cx: -37, cy: 21, name: 'Столица',
    pos: (now) => mover.position(now),
  });
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 40, spriteLoader: loader });
  const canvas = findCanvas(body);
  // 14x14 @ 40 → 560 ≤ 800/600 → cam центрирован (7,7).
  // Шаг (9,13) → (9,12) в t = 1000 — симуляция main.js cityMove:
  // s.x/s.y обновляются ДО глейда (паттерн dungeonMove, 000068).
  T.t = 1000;
  s.x = 9;
  s.y = 12;
  mover.step({ x: 9, y: 13 }, { x: 9, y: 12 }, 1000);
  const mid = 1000 + interval / 2;
  const n0 = canvas.drawCalls.length;
  G.dungeonUI.render(mid);
  const seg = canvas.drawCalls.slice(n0);
  const pos = mover.position(mid);
  assert.equal(pos.x, 9, 'x не меняется (шаг на север)');
  assert.ok(pos.y > 12 && pos.y < 13,
    'предусловие: дробная точка строго между клетками: ' + JSON.stringify(pos));
  const p = G.worldToScreen(pos.x + 0.5, pos.y + 0.5, 7, 7, 40, VW, VH);
  const sz = 40 * 1.15; // формула Флогистона (zoom*1.15)
  const imgs = seg.filter((c) => c[0] === 'drawImage'
    && Math.abs(c[1][1] - (p.x - sz / 2)) <= 1e-9
    && Math.abs(c[1][2] - (p.y - sz / 2)) <= 1e-9
    && c[1][3] === sz && c[1][4] === sz);
  assert.equal(imgs.length, 1,
    'спрайт игрока в дробной точке глейда (zoom*1.15)');
  const fi = Math.floor(G.frameIndex(mid, pos.x, pos.y, walk.length));
  assert.equal(imgs[0][1][0] && imgs[0][1][0].__img, walk[fi],
    'во время глейда — кадр «walk» (посредник — общий движок)');
});

test('город UI 000105 (регрессия rAF): rAF-цикл в режиме города; вырожденный 2x2 — камера центрирована (нет NaN)', () => {
  const rafStubs = makeRafStubs();
  const T = { t: 1000 };
  const loaded = loadDungeonUi({
    performance: { now: () => T.t },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  const G = loaded.G;
  const s = makeCityState({ fp: 1, cx: -119, cy: -104, name: 'Хутор' });
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 40 });
  assert.ok(rafStubs.scheduled.length >= 1,
    'start: rAF-цикл запланирован (режим города)');
  const canvas = findCanvas(loaded.body);
  T.t += 16;
  tick(rafStubs);
  T.t += 16;
  tick(rafStubs);
  // 2x2 @ 40 → 80 ≤ 800/600 → жёсткое центрирование cam (1,1)
  // (degenerate: диапазон клампа пуст — без центрирования cam ушёл
  // бы в NaN, паттерн 000066).
  const p00 = G.worldToScreen(0, 0, 1, 1, 40, VW, VH);
  assert.ok(Number.isFinite(p00.x) && Number.isFinite(p00.y),
    'проекция клетки — конечные числа');
  const cellRect = (seg) => seg.some((c) => c[0] === 'fillRect'
    && Math.abs(c[1][0] - p00.x) <= 1e-9
    && Math.abs(c[1][1] - p00.y) <= 1e-9
    && c[1][2] === 40 && c[1][3] === 40);
  assert.ok(cellRect(canvas.drawCalls),
    '2x2: cam центрирован (1,1) — клетка (0,0) в проекции');
  // Герой на выходной клетке (0,0) — камера остаётся центрированной.
  s.x = 0;
  s.y = 0;
  T.t += 16;
  tick(rafStubs);
  assert.ok(cellRect(canvas.drawCalls),
    'камера — по-прежнему центрирована (2*40 ≤ 800/600)');
});

test('город UI 000105 (регрессия): состояние без kind (подземелье) — пол #182029 как раньше (городские тайлы не «переливаются»)', () => {
  const loaded = loadDungeonUi({ performance: { now: () => 1000 } });
  const G = loaded.G;
  const s = makeState(); // 5x5, без kind — существующая форма dungeonState
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 48 });
  const calls = findCanvas(loaded.body).drawCalls;
  // 5x5 @ 48 → 240 ≤ 800/600 → cam центрирован (2.5, 2.5).
  for (let y = 1; y <= 3; y++) {
    for (let x = 1; x <= 3; x++) {
      const p = G.worldToScreen(x, y, 2.5, 2.5, 48, VW, VH);
      assert.ok(floorRectAt(calls, p.x, p.y, 48),
        'подземный пол (' + x + ',' + y + ') — #182029 (фолбэк), без изменений');
    }
  }
});

test('город UI 000105: структурный — dungeon-ui.js НЕ создаёт layout города (layout — в main.js, enterCity)', () => {
  // UMD-ловушка, как с createMover (motion.js после dungeon-ui.js):
  // dungeon-ui не должен ГЕНЕРИРОВАТЬ layout (createCityLayout) —
  // layout создаётся в main.js (enterCity) и передаётся в state.dg;
  // оверлей только РИСУЕТ его (и читает s.kind для режима).
  const text = src('dungeon-ui.js');
  assert.ok(!text.includes('createCityLayout'),
    'dungeon-ui.js не ссылается на createCityLayout '
    + '(layout создаётся в main.js)');
});

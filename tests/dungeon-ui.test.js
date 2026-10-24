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
//   * стены (000258): wallTileIndex ≠ 0 → G.WALL_AUTOTILES
//     [wallKindFor][idx] → drawImage, слой ПОД мобами/игроком;
//     без таблицы/маски — drawImage нет (гард);
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
//   withBuildings — buildings.js в цепочке ПОСЛЕ map.js (порядок
//     index.html 858<875, 000148.02). OPT-IN: цепочка по умолчанию
//     БЕЗ buildings.js НЕ меняется (существующие 53 теста её не
//     читают). buildings.js самодостаточен (чист на загрузке,
//     console.error не генерирует).
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
  const chain = ['global-settings.js'];
  // withoutPerlin (000105, раунд-ревью): цепочка БЕЗ perlin.js —
  // Game.hash2 отсутствует, рендер города обязан пройти
  // fallback-ветку cityTileVariant (детерминированность по
  // (x, y, seed) без perlin).
  if (!opts.withoutPerlin) chain.push('perlin.js');
  chain.push('map.js');
  // 000148.02: buildings.js ПОСЛЕ map.js (порядок index.html 858<875) —
  // каталог для резолва каталожного id → слот (getBuilding).
  if (opts.withBuildings) chain.push('buildings.js');
  if (!opts.withoutControls) chain.push('controls.js');
  if (opts.withCombat) {
    // 000151: combat-scale.js — ПЕРЕД combat-ui.js (та же пара, что в
    // index.html; цепочка зеркалит браузер). Без него битый порядок →
    // console.error-гард combat-ui.js → ассерты errors.length === 0
    // падали бы (техническая правка проводки, ассерты без правок).
    chain.push('skills-data.js', 'items-data.js', 'sheet.js',
      'player.js', 'items.js',
      'combat.js', 'combat-keys.js', 'combat-scale.js', 'combat-ui.js');
  }
  chain.push('dungeon.js');
  // 000153.03: locations.js ПОСЛЕ dungeon.js (порядок index.html
  // 908>900) — единый helper floorStatusLine (D5, finding G).
  // load-pure (LOC-2: ноль require/RNG в source) → на существующие
  // тесты файла влияния НЕТ (фикстуры без depth → строки нет).
  chain.push('locations.js');
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
//   seed — d.seed (000258: wallKindFor; по умолчанию отсутствует —
//          hash2-ToInt32 даёт 0, детерминировано);
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
    // 000177: единый тайл — exit = entrance (инвариант createDungeon).
    entrance: { x: 1, y: 1 },
    exit: { x: 1, y: 1 },
  };
  // 000258: d.seed — wallKindFor (hash2 ^ seed); по умолчанию нет.
  if (opts.seed != null) dg.seed = opts.seed;
  // 000153.03: аддитивные opts (фабрика; существующие вызовы без
  // правок — без opts глубина/лестница отсутствуют, рендер тот же).
  if (opts.depth != null) dg.depth = opts.depth;
  if (opts.stairsDown) dg.stairsDown = opts.stairsDown;
  const s = {
    dg,
    // 000157.02: +deposits (красные UI-DEP-*; рендер/состояние — зелёная
    // фаза). По умолчанию пустой массив — существующие тесты не тронуты.
    contents: { chests: opts.chests || [], mobs: opts.mobs || [],
      deposits: opts.deposits || [] },
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

test('подземелье UI: рисуется = G.visibleTileRange ∩ границы ∩ маска видимости (000136)', () => {
  const rafStubs = makeRafStubs();
  const T = { t: 1000 };
  const { G, body } = loadDungeonUi({
    performance: { now: () => T.t },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  // 000136: туман войны — ядро видимости G.dungeonUI.vision
  // (контракт memory/000136-dungeon-fog-vision.md): клетка floor
  // нарисована ⟺ в inRange И в радиусе: чебышёв(kлетка, hero) ≤
  // radiusFor(mult). КРАСНО: экспорт ещё не существует.
  const vision = G.dungeonUI.vision;
  assert.ok(vision && typeof vision.radiusFor === 'function',
    'G.dungeonUI.vision.radiusFor — экспорт ядра видимости (000136)');
  const s = makeState({ width: 25, height: 25 });
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 40 });
  T.t += 16;
  tick(rafStubs);
  const calls = findCanvas(body).drawCalls;
  // Игрок (1,1) — цель камеры (1.5,1.5) вне [viewW/2/zoom, w−viewW/2/zoom]
  // = [10, 15]×[7.5, 17.5] → снап+кламп: cam (10, 7.5).
  // Центр маски = playerPos = (s.x, s.y) = (1, 1) (pos-функции нет);
  // hero без «Кошачьего глаза»: mult 1 → R = radiusFor(1.0).
  const camX = VW / 2 / 40, camY = VH / 2 / 40;
  const R = vision.radiusFor(1.0);
  const r = G.visibleTileRange(camX, camY, VW, VH, 40);
  let visibleFloor = 0;
  let hiddenFloor = 0;
  for (let y = 0; y < 25; y++) {
    for (let x = 0; x < 25; x++) {
      if (s.dg.cells[y * 25 + x] !== G.CELL_FLOOR) continue;
      const inRange =
        x >= Math.max(0, r.x0) && x <= Math.min(24, r.x1)
        && y >= Math.max(0, r.y0) && y <= Math.min(24, r.y1);
      // 000136: чебышёв-расстояние до КЛЕТКИ героя (целочисленная
      // позиция; +0.5-сдвигов НЕТ — контракт D3).
      const inMask =
        Math.max(Math.abs(x - s.x), Math.abs(y - s.y)) <= R;
      const p = G.worldToScreen(x, y, camX, camY, 40, VW, VH);
      const drawn = floorRectAt(calls, p.x, p.y, 40);
      if (inRange && inMask) {
        assert.ok(drawn, 'видимая floor-клетка (' + x + ',' + y + ') нарисована');
        visibleFloor++;
      } else {
        assert.ok(!drawn,
          'floor-клетка (' + x + ',' + y + ') вне inRange/радиуса '
          + 'не нарисована');
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
    // 000215: пол — снап-прямоугольник (позиция — Math.round(сырая
    // проекция), тот же порядок операций, что worldToScreen; размер
    // = zoom — целый зум). Камера дробная (mid-glide) — именно тот
    // сценарий, где снап отличим от сырой проекции.
    assert.ok(floorRectAt(calls, Math.round(p.x), Math.round(p.y), 40),
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

test('подземелье UI: стены — маска (000258): без G.WALL_AUTOTILES drawImage нет; с таблицей — corner (0,0) idx 16, слой ПОД мобами/игроком', () => {
  const fakeWall = { __fake: 'wall' };
  const loader = { image: () => fakeWall, isReady: () => true };
  // (а) G.WALL_AUTOTILES нет (sprites.js вне цепочки) — drawImage нет
  //     (гард; floor — фолбэк #182029).
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
    'без G.WALL_AUTOTILES — drawImage на стены нет (гард на таблицу)');
  // (б) G.WALL_AUTOTILES + wallTileIndex/wallKindFor (dungeon.js в
  //     цепочке) + loader: слой стен — ПОД мобами/игроком
  //     (z-порядок 000066, стены — в floor-pass 000258).
  rafStubs = makeRafStubs();
  T = { t: 1000 };
  loaded = loadDungeonUi({
    performance: { now: () => T.t },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  loaded.G.WALL_AUTOTILES = {
    rock: Array.from({ length: 20 }, (_, i) => 'test/rock_w' + i + '.svg'),
    stalactite: Array.from({ length: 20 }, (_, i) =>
      'test/stalactite_w' + i + '.svg'),
  };
  const s = makeState({
    mobs: [{ x: 2, y: 2, level: 5, defeated: false }],
  });
  loaded.G.dungeonUI.start({
    state: s, onMove() {}, zoom: 48, spriteLoader: loader,
  });
  T.t += 16;
  tick(rafStubs);
  const calls = findCanvas(loaded.body).drawCalls;
  // 5×5 @ 48 → центрирование (2.5, 2.5); стена (0,0) — угол: маска 0
  // + ровно одна диагональ пола (SE) → idx 16 (cSE).
  const kind = loaded.G.wallKindFor(0, 0, s.dg);
  assert.ok(['rock', 'stalactite'].includes(kind),
    'wallKindFor — вид из набора CAVE');
  const p = loaded.G.worldToScreen(0, 0, 2.5, 2.5, 48, VW, VH);
  const wallIdx = calls.findIndex((c) => c[0] === 'drawImage'
    && c[1][0] === fakeWall
    && Math.abs(c[1][1] - p.x) <= 1e-9 && Math.abs(c[1][2] - p.y) <= 1e-9
    && c[1][3] === 48 && c[1][4] === 48);
  assert.ok(wallIdx >= 0,
    'стена (0,0) — drawImage из G.WALL_AUTOTILES[kind][16], 48×48');
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
  // 000136 (ложная регрессия, правка пина по ТЗ): floor (13,13) в
  // клампе (10, 7.5) — чебышёв 12 от центра маски (1,1) → с туманом
  // войны НЕ рисуется ПО ЗАПРОЕКТУ (не баг). Пин механизма (камера
  // у клампа, cell-клетка в вьюпорте) — клетка (1,1) = центр маски
  // (hero, без pos), в вьюпорте [0,20]×[0,15].
  p = G.worldToScreen(1, 1, VW / 2 / 40, VH / 2 / 40, 40, VW, VH);
  assert.ok(floorRectAt(calls, p.x, p.y, 40),
    'без pos: камера у клампа (10, 7.5) — floor (1,1) в ' + p.x + ',' + p.y
    + ' (000136: (13,13) — чебышёв 12 от центра маски (1,1) — '
    + 'не рисуется по проекту)');
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
  assert.ok(!fillTextNear(calls, '5', '#fff', c.x, c.y, 4),
    'белый номер уровня группы НЕ рисуется (000153.04)');
  // Слои (memory/000070): мобы ПОД игроком. Игрок здесь — ромб (idle
  // не в ready-наборе) — последний path-вызов (moveTo).
  const playerIdx = calls.findIndex((c) => c[0] === 'moveTo');
  assert.ok(playerIdx >= 0, 'игрок нарисован (ромб: idle-кадры не ready)');
  for (const m of mobImgs) {
    assert.ok(calls.indexOf(m) < playerIdx,
      'спрайт моба ПОД игроком (порядок слоёв)');
  }
});

test('подземелье UI 000067: босс — N спрайтов юнитов + ОДИН #b06ad4-прямоугольник группы; без босса — подсветки нет', () => {
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
  assert.ok(!fillTextNear(calls, '7', '#fff', bc.x, bc.y, 4),
    'белый номер уровня босса «7» НЕ рисуется (000153.04)');
  const rc = G.worldToScreen(3.5, 1.5, 2.5, 2.5, 48, VW, VH);
  assert.ok(!fillTextNear(calls, '5', '#fff', rc.x, rc.y, 4),
    'номер обычной группы «5» НЕ рисуется (000153.04)');
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
  assert.ok(!fillTextNear(calls, '5', '#fff', pMob.x + 24, pMob.y + 24, 4),
    'номер группы «5» НЕ рисуется (000153.04)');
  assert.ok(!fillTextNear(calls, '7', '#fff', pBoss.x + 24, pBoss.y + 24, 4),
    'номер босса «7» НЕ рисуется (000153.04)');
  // Сундук — прежний золотой квадрат + полоса.
  const pCh = G.worldToScreen(1, 3, 2.5, 2.5, 48, VW, VH);
  assert.ok(fillRectAt(calls, '#e0b13c', pCh.x + 3, pCh.y + 3, 42, 42),
    'сундук — золотой квадрат #e0b13c');
  assert.ok(fillRectAt(calls, '#7a5c16', pCh.x + 3, pCh.y + 23, 42, 2),
    'сундук — тёмная полоса #7a5c16');
  // 000177: единый тайл (exit = entrance = (1,1)) — ОДИН маркер:
  // жёлтый квадрат + «E» (фолбэк без лоадера). Старых «X»/#3f9d55
  // маркеров нет.
  const pEx = G.worldToScreen(1, 1, 2.5, 2.5, 48, VW, VH);
  assert.ok(fillRectAt(calls, '#d4b45a', pEx.x + 2, pEx.y + 2, 44, 44),
    'единый тайл — жёлтый квадрат #d4b45a');
  assert.ok(fillTextNear(calls, 'E', '#101418', pEx.x + 24, pEx.y + 43, 4),
    'единый тайл — буква «E»');
  assert.ok(!calls.some((c) => c[0] === 'fillText' && c[1][0] === 'X'),
    'старый маркер «X» — нет (000177: единый тайл)');
  assert.ok(!calls.some((c) => c[0] === 'fillRect' && c[2] === '#3f9d55'),
    'старый вход-квадрат #3f9d55 — нет (000177: единый тайл)');
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
  assert.ok(!fillTextNear(calls, '5', '#fff', c.x, c.y, 4),
    'номер уровня группы НЕ рисуется (000153.04)');
});

test('подземелье UI 000067: legacy-группа БЕЗ mobIds + ready-лоадер — фолбэк, не падение (регрессия)', () => {
  // Группа {x, y, level, defeated} без mobIds (формат существующих
  // тестов стен): полная группа-фолбэк — квадрат (номер уровня не
  // рисуется — 000153.04), drawImage по этой группе нет, падения на
  // for..of undefined нет. Зелёный с первого запуска.
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
  assert.ok(!fillTextNear(calls, '5', '#fff', p.x + 24, p.y + 24, 4),
    'номер «5» НЕ рисуется (000153.04)');
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
// — БЕЗ type/rooms/wallObjs; 000177: exit = entrance — единый
// тайл-дверь), contents = null (содержимое — 000106),
// name = название_карты каталога. Экран: заголовок — имя города,
// СВОИ тайлы пола/стен (детерминированный выбор варианта по
// (x, y, seed); палитра ограничена: пол ≤3, стена ≤2), маркер
// единого тайла — тот же, что маркер подземелья (000177),
// hint — без «Сундук и мобы» (город пуст) и с «[E] — постройки»
// (взаимодействие — 000107), глейд/зум/камера — общий движок
// 000066/000068 (без изменений).
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
// 000148.02: cityContents — ТОЧНАЯ production-форма (locations.js:
// ds.cityContents = {buildings, seed} | null); ПО УМОЛЧАНИЮ null
// (аддитивно — существующие тесты его не читают). opts.cityContents —
// прокидывание (имя = поле состояния).
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
    cityContents: null, // 000148.02: {buildings:[{x,y,buildingId}], seed} | null
  };
  if (opts.px != null) s.x = opts.px;
  if (opts.py != null) s.y = opts.py;
  if (opts.pos) s.pos = opts.pos;
  if (opts.cityContents !== undefined) s.cityContents = opts.cityContents;
  return s;
}

// Все элементы в дереве с className, содержащим cls (в порядке
// обхода): у оверлея dungeon-ui «combat-state» — НОЛЬ в обоих
// kind'ах (000247: панель .combat-side (stateEl/logEl/hint) убрана
// из оверлея локации СОВСЕМ — оверлей = canvas; 000229: подземелье
// — ноль).
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

test('город UI 000105 (re-pin 000247): панель убрана СОВСЕМ — 0 .combat-side/.combat-state/.combat-log; оверлей = canvas (1 ребёнок); рендер жив; инфо города — в #hud', () => {
  const loaded = loadDungeonUi({ performance: { now: () => 1000 } });
  const G = loaded.G;
  const s = makeCityState({ fp: 1, cx: -119, cy: -104, name: 'Хутор' });
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 40 });
  assert.equal(allByClass(loaded.body, 'combat-side').length, 0,
    'город: .combat-side НЕТ (000247: панель убрана совсем)');
  assert.equal(allByClass(loaded.body, 'combat-state').length, 0,
    'город: .combat-state (stateEl/hint) НЕТ (000247: панель убрана '
    + 'совсем: имя города/клетка/«До выхода» — в #hud, 000106)');
  assert.equal(allByClass(loaded.body, 'combat-log').length, 0,
    'город: .combat-log (журнал) НЕТ (000247: панель убрана совсем)');
  const overlay = findByClass(loaded.body, 'dungeon-overlay');
  assert.ok(overlay, 'оверлей .dungeon-overlay на месте (экран цел)');
  assert.equal(overlay.children.length, 1,
    'город: оверлей = canvas — ОДИН прямой ребёнок (000247): '
    + overlay.children.map((c) => c.tagName + '.' + c.className).join(' | '));
  assert.equal(overlay.children[0].tagName, 'canvas',
    'единственный ребёнок оверлея — canvas');
  assert.ok(findCanvas(loaded.body).drawCalls.length > 0,
    'рендер жив: drawCalls > 0');
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
  assert.deepEqual(floorKeys.sort(), ['0,1'],
    '2x2: пол — единый тайл-дверь (0,1) (000177)');
  assert.deepEqual(wallKeys.sort(), ['0,0', '1,0', '1,1'],
    '2x2: стены — остальные три клетки');
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

test('город UI 000105: СВОИ тайлы — 26x26 столица: все клетки; ≥2 варианта пола по (x,y,seed); без фолбэка #182029', () => {
  const loaded = loadDungeonUi({ performance: { now: () => 1000 } });
  const G = loaded.G;
  const s = makeCityState({ fp: 7, cx: -37, cy: 21, name: 'Столица' });
  // 000148.01 (layout 4f−2): 14x14 → 26x26; zoom 40 → 20, чтобы весь
  // layout влез в вьюпорт (26*20 = 520 ≤ 600) — full-coverage-ассерты.
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 20 });
  assert.ok(26 * 20 <= VW && 26 * 20 <= VH,
    '26x26 @ 20 — вьюпорт больше layout → cam центрирован (13,13)');
  const colors = cityCellColors(findCanvas(loaded.body).drawCalls,
    G, s, 20, 13, 13);
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
    '26x26: все 676 клеток layout нарисованы fillRect' +
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
  // 000148.01 (layout 4f−2): fp5 — 18x18; zoom 40 → 30, cam (5,5) →
  // (9,9): 18*30 = 540 ≤ 600 → layout целиком в вьюпорте.
  const A = loadDungeonUi({ performance: { now: () => 1000 } });
  const sA = makeCityState({ fp: 5, cx: 100, cy: -40, name: 'Город' });
  A.G.dungeonUI.start({ state: sA, onMove() {}, zoom: 30 });
  const canvasA = findCanvas(A.body);
  const n0 = canvasA.drawCalls.length;
  A.G.dungeonUI.render(1000); // тот же now — второй рендер
  const mStart = cityCellColors(canvasA.drawCalls.slice(0, n0),
    A.G, sA, 30, 9, 9);
  const mSecond = cityCellColors(canvasA.drawCalls.slice(n0),
    A.G, sA, 30, 9, 9);
  assert.equal(JSON.stringify(mStart), JSON.stringify(mSecond),
    'два рендера одного города — идентичная раскраска (чистая функция)');
  // (б) Разные якоря → разные seed → раскраска хотя бы одной
  // клетки различается (seed 3580905026 vs 2388422751, 000104).
  const B = loadDungeonUi({ performance: { now: () => 1000 } });
  const sB = makeCityState({ fp: 5, cx: 101, cy: -40, name: 'Город' });
  B.G.dungeonUI.start({ state: sB, onMove() {}, zoom: 30 });
  assert.notEqual(sA.dg.seed, sB.dg.seed,
    'предусловие: layout от разных якорей — разные seed');
  const mB = cityCellColors(findCanvas(B.body).drawCalls, B.G, sB, 30, 9, 9);
  const mAs = cityCellColors(findCanvas(A.body).drawCalls, A.G, sA, 30, 9, 9);
  assert.notEqual(JSON.stringify(mAs), JSON.stringify(mB),
    'разные seed → раскраска хотя бы одной клетки различается');
});

test('город UI 000105 (фолбэк без perlin): без Game.hash2 вариант тайла всё равно функция (x, y, seed) — тот же layout, другой seed → раскраска различается', () => {
  // perlin.js НЕ в цепочке — liveGame().hash2 нет → рендер города
  // идёт по fallback-ветке cityTileVariant. Фолбэк обязан оставаться
  // чистой функцией (x, y, seed) по КОНТРАКТУ: без seed-зависимости
  // разные города (разные layout.seed) окрасились бы одинаково
  // (регрессия раунда-ревью 000105). Изолируем seed: layout (cells)
  // ОДИН, seed — РАЗНЫЙ (копия dg с подменённым seed).
  const A = loadDungeonUi({ withoutPerlin: true,
    performance: { now: () => 1000 } });
  assert.equal(typeof A.G.hash2, 'undefined',
    'предусловие: perlin.js не в цепочке — Game.hash2 нет (fallback)');
  // 000148.01 (layout 4f−2): fp5 — 18x18; zoom 30, cam (9,9)
  // (18*30 = 540 ≤ 600 — layout целиком в вьюпорте).
  const sA = makeCityState({ fp: 5, cx: 100, cy: -40, name: 'Город' });
  A.G.dungeonUI.start({ state: sA, onMove() {}, zoom: 30 });
  const canvasA = findCanvas(A.body);
  const n0 = canvasA.drawCalls.length;
  A.G.dungeonUI.render(1000); // второй рендер того же города
  const mFirst = cityCellColors(canvasA.drawCalls.slice(0, n0),
    A.G, sA, 30, 9, 9);
  const mSecond = cityCellColors(canvasA.drawCalls.slice(n0),
    A.G, sA, 30, 9, 9);
  assert.equal(JSON.stringify(mFirst), JSON.stringify(mSecond),
    'фолбэк: два рендера одного города — идентичны (чистая функция)');
  const B = loadDungeonUi({ withoutPerlin: true,
    performance: { now: () => 1000 } });
  assert.equal(typeof B.G.hash2, 'undefined',
    'предусловие (B): Game.hash2 нет (fallback)');
  // Тот же layout (те же cells/entrance/exit), ТОЛЬКО seed другой —
  // переменная под тестом одна.
  const sB = Object.assign({}, sA, {
    dg: Object.assign({}, sA.dg, { seed: (sA.dg.seed ^ 0x12345678) >>> 0 }),
  });
  assert.deepEqual(sB.dg.cells, sA.dg.cells,
    'предусловие: layout один (cells совпадают)');
  assert.notEqual(sB.dg.seed, sA.dg.seed,
    'предусловие: seed другой');
  B.G.dungeonUI.start({ state: sB, onMove() {}, zoom: 30 });
  const mB = cityCellColors(findCanvas(B.body).drawCalls, B.G, sB, 30, 9, 9);
  assert.notEqual(JSON.stringify(mFirst), JSON.stringify(mB),
    'фолбэк: seed НЕ игнорируется — раскраска различается');
});

test('город UI 000105 (GOLDEN-ПИН): CITY_TILE_SEED = 0x43495459 и палитры зафиксированы (ревью раунда 3)', () => {
  // Соль выбора городского тайла закреплена ЛИТЕРАЛОМ (паттерн
  // CITY_SEED_CONST 000103 / CITY_LAYOUT_CONST 000104): смена
  // CITY_TILE_SEED в src/dungeon-ui.js = перекраска ВСЕХ городов —
  // недопустима после мержа. Пересчёт варианта в тесте независим от
  // модуля (hash2 перlin.js + литерал соли): смена константы в коде —
  // вариант клеток не совпадёт и тест упадёт. Палитры тоже пины.
  const CITY_TILE_SEED_PIN = 0x43495459; // ASCII «CITY»
  const FLOOR = ['#b3a284', '#a5947a', '#c0b090']; // CITY_FLOOR_VARIANTS
  const WALL = ['#77685a', '#66594c'];             // CITY_WALL_VARIANTS
  const loaded = loadDungeonUi({ performance: { now: () => 1000 } });
  const G = loaded.G;
  const s = makeCityState({ fp: 5, cx: 100, cy: -40, name: 'Город' });
  // 000148.01 (layout 4f−2): fp5 — 18x18; zoom 30, cam (9,9): цикл
  // по ВСЕМ 324 клеткам требует full coverage (18*30 = 540 ≤ 600).
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 30 });
  G.dungeonUI.render(1000);
  const colors = cityCellColors(findCanvas(loaded.body).drawCalls,
    G, s, 30, 9, 9);
  const d = s.dg;
  for (let y = 0; y < d.height; y++) {
    for (let x = 0; x < d.width; x++) {
      const isFloor = d.cells[y * d.width + x] === G.CELL_FLOOR;
      const pal = isFloor ? FLOOR : WALL;
      const idx = ((G.hash2(x, y,
        (d.seed + CITY_TILE_SEED_PIN) >>> 0)) >>> 0) % pal.length;
      assert.equal(colors[x + ',' + y], pal[idx],
        'клетка ' + x + ',' + y + ': вариант по соли 0x43495459 ' +
        '+ палитра ' + (isFloor ? 'пол' : 'стена'));
    }
  }
});

test('город UI 000105 (регрессия маркеров): единый тайл-дверь (000177) — ОДИН маркер, те же, что подземелье', () => {
  const loaded = loadDungeonUi({ performance: { now: () => 1000 } });
  const G = loaded.G;
  const s = makeCityState({ fp: 1, cx: -119, cy: -104, name: 'Хутор' });
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 40 });
  const calls = findCanvas(loaded.body).drawCalls;
  // 2x2 @ 40, cam (1,1): единый тайл (0,1) — layout 000177.
  const en = G.worldToScreen(0, 1, 1, 1, 40, VW, VH);
  assert.ok(fillRectAt(calls, '#d4b45a', en.x + 2, en.y + 2, 36, 36),
    'единый тайл: жёлтый квадрат (zoom−4)');
  assert.ok(fillTextNear(calls, 'E', '#101418', en.x + 20, en.y + 35, 2),
    'единый тайл: буква «E»');
  assert.ok(!calls.some((c) => c[0] === 'fillText' && c[1][0] === 'X'),
    'старый маркер «X» — нет (000177: единый тайл)');
  assert.ok(!calls.some((c) => c[0] === 'fillRect' && c[2] === '#3f9d55'),
    'старый вход-квадрат #3f9d55 — нет (000177: единый тайл)');
});

test('город UI 000105/000107: contents: null — без сундуков/мобов, рендер не падает; панель — 0 (000247: hint убран вместе с ней); подземелье — панели НЕТ (000229)', () => {
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
  // 000247: панель .combat-side (stateEl/logEl/hint) убрана СОВСЕМ —
  // hint («[E] — постройки», 000107) — вместе с ней (подсказка
  // управления — в мире; [E] — locationOnInteract — интактен).
  assert.equal(allByClass(loaded.body, 'combat-side').length, 0,
    'город: .combat-side НЕТ (000247: панель убрана совсем)');
  assert.equal(allByClass(loaded.body, 'combat-state').length, 0,
    'город: .combat-state (stateEl/hint) НЕТ (000247: панель убрана '
    + 'совсем)');
  // Регрессия 000229: у ПОДЗЕМЕЛЬЯ панели НЕТ (.combat-side/
  // .combat-state — 0; инфо-окно — #hud, 000212).
  const D = loadDungeonUi({ performance: { now: () => 1000 } });
  D.G.dungeonUI.start({ state: makeState(), onMove() {}, zoom: 48 });
  assert.equal(allByClass(D.body, 'combat-side').length, 0,
    'подземелье: .combat-side НЕТ (000229: панель убрана)');
  assert.equal(allByClass(D.body, 'combat-state').length, 0,
    'подземелье: .combat-state (hint) НЕТ (000229: панель убрана)');
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
  // 26x26 (fp7, −37,21): вход (18,25); шаг на север (18,24) — FLOOR.
  // 000148.01 (layout 4f−2): 14x14 → 26x26, вход (9,13) → (18,25);
  // zoom 40 → 20 (26*20 = 520 ≤ 600 — layout целиком в вьюпорте).
  const mover = G.createMover({ x: 18, y: 25, intervalMs: interval });
  const s = makeCityState({
    fp: 7, cx: -37, cy: 21, name: 'Столица',
    pos: (now) => mover.position(now),
  });
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 20, spriteLoader: loader });
  const canvas = findCanvas(body);
  // 26x26 @ 20 → 520 ≤ 800/600 → cam центрирован (13,13).
  // Шаг (18,25) → (18,24) в t = 1000 — симуляция main.js cityMove:
  // s.x/s.y обновляются ДО глейда (паттерн dungeonMove, 000068).
  T.t = 1000;
  s.x = 18;
  s.y = 24;
  mover.step({ x: 18, y: 25 }, { x: 18, y: 24 }, 1000);
  const mid = 1000 + interval / 2;
  const n0 = canvas.drawCalls.length;
  G.dungeonUI.render(mid);
  const seg = canvas.drawCalls.slice(n0);
  const pos = mover.position(mid);
  assert.equal(pos.x, 18, 'x не меняется (шаг на север)');
  assert.ok(pos.y > 24 && pos.y < 25,
    'предусловие: дробная точка строго между клетками: ' + JSON.stringify(pos));
  const p = G.worldToScreen(pos.x + 0.5, pos.y + 0.5, 13, 13, 20, VW, VH);
  const sz = 20 * 1.15; // формула Флогистона (zoom*1.15)
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

// =====================================================================
// Задача 000148.02: рендер построек внутри города (слой СПРАЙТОВ
// cityContents.buildings поверх пола, finding G1 аудита 000148).
// =====================================================================
//
// Контракт: memory/000148.02-city-building-sprites.md. Внутренний
// экран города остаётся hex-палитрой (000110/R10) — добавляется слой
// СПРАЙТОВ (drawImage), а не SVG-из-экрана. Спрайты — ОБЩИЙ набор с
// картой мира (G.buildingSprite, assets/sprites/buildings/). buildingSprite
// КЛЮЧИРОВАН ПО СЛОТУ (BUILDING_TYPES 0..12), cityContents.buildings —
// КАТАЛОЖНЫЕ id → резолв через каталог (getBuilding): базовые —
// особых_параметры.map_index, субтипы — особых_параметры.размещение.слот.
// НОВЫХ RNG НЕТ (D10) — рендер чистая функция. ds.contents у города
// null — слой читает ТОЛЬКО s.cityContents (000109).
//
// КРАСНЫЕ (падают ДО реализации — слоя в dungeon-ui.js нет):
//   * базовая постройка (id 44, map_index) → drawImage спрайта СЛОТА,
//     позиция = клетка (worldToScreen), размер zoom×zoom, hex-пол сохранён;
//   * субтип (размещение.слот, без map_index) + несколько построек;
//   * базовые id (1/25/36/44) + неизвестный id (999) — skip;
//   * viewport-клип (18×18 @ 40, cam clamp (9,10.5)): клетка (0,0)
//     урезана, (9,9) нарисована.
// ЗЕЛЁНЫЕ (регрессия-фиксация, зелёные с первого запуска):
//   * свободные клетки / buildings: [] / cityContents: null — спрайтов нет;
//   * деградация (цепочка без sprites.js/buildings.js) — краха нет;
//   * изображение не готово (loader без путей) — skip;
//   * детерминизм (D10) — два рендера идентичны.
//
// Песочница: loadDungeonUi({ withSprites: true, withBuildings: true }) —
// sprites.js (G.buildingSprite) и buildings.js (G.getBuilding) в цепочке
// ДО dungeon-ui.js (порядок index.html). УМД-ловушка учтена: слой читает
// getBuilding/buildingSprite через liveGame() в момент вызова.

// 000148.02: каталожный id → путь спрайта СЛОТА (зеркало резолва из
// ТЗ/контракта: map_index | размещение.слот → G.buildingSprite).
// 000238.01: анимированные слоты — путь КАДРА (1:1 cityBuildingPath:
// buildingFrames(slot) + buildingFrameIndex(now, x, y, n)).
// Тестируем резолв ОТСУТСТВИЕМ/НАЛИЧИЕМ drawImage, а не этим хелпером —
// хелпер — независимая реконструкция ожидаемого пути (как worldToScreen).
function buildingSpritePath(G, id, now, x, y) {
  const rec = typeof G.getBuilding === 'function' ? G.getBuilding(id) : null;
  if (!rec) return null;
  const op = rec.особые_параметры || {};
  const slot = Number.isInteger(op.map_index)
    ? op.map_index
    : (op.размещение && Number.isInteger(op.размещение.слот)
       ? op.размещение.слот : null);
  if (slot == null) return null;
  const frames = typeof G.buildingFrames === 'function'
    ? G.buildingFrames(slot) : null;
  if (frames && frames.length > 1
      && typeof G.buildingFrameIndex === 'function') {
    return frames[G.buildingFrameIndex(now, x, y, frames.length)];
  }
  return G.buildingSprite(slot);
}

// 000148.02: drawImage-вызовы СПРАЙТОВ ПОСТРОЕК (префикс
// assets/sprites/buildings/ — не пересекается с door.svg (assets/
// dungeon/) и игроком (assets/sprites/phlogiston/)).
function buildingDrawCalls(calls) {
  return calls.filter((c) => c[0] === 'drawImage'
    && c[1][0] && typeof c[1][0].__img === 'string'
    && c[1][0].__img.indexOf('assets/sprites/buildings/') === 0);
}

test('город UI 000148.02 (RED): базовая постройка (id 44, map_index) → drawImage спрайта СЛОТА на клетке, zoom×zoom, hex-пол сохранён', () => {
  const loaded = loadDungeonUi({ performance: { now: () => 1000 },
    withSprites: true, withBuildings: true });
  const G = loaded.G;
  const path = buildingSpritePath(G, 44, 1000, 2, 2);
  // id 44 «Таверна» → слот 11 → кадр таблицы (2,2) @ now=1000.
  assert.ok(path && path.indexOf('assets/sprites/buildings/') === 0,
    'предусловие: каталожный id 44 резолвится в путь спрайта СЛОТА: ' + path);
  // Ревью 000148.02: ЛИТЕРАЛЬНЫЙ якорь резолва (44 → map_index 11 →
  // кадр таблицы: (2,2) @ now=1000 → tavern_2.svg) — защита от общего
  // дефекта зеркального резолва (тест и реализация считают путь одним
  // выражением; префикс-пин этого не видит).
  assert.equal(path, 'assets/sprites/buildings/tavern_2.svg',
    'предусловие: id 44 — литеральный путь tavern_2.svg (якорь резолва)');
  const s = makeCityState({ fp: 2, cx: -114, cy: -119, name: 'Деревня',
    cityContents: { buildings: [{ x: 2, y: 2, buildingId: 44 }], seed: 0 } });
  // 6x6 @ 48 → 288 ≤ 600 → cam центрирован (3,3). Позиция = угол клетки.
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 48,
    spriteLoader: makeSpriteLoader([path]) });
  const calls = findCanvas(loaded.body).drawCalls;
  const p = G.worldToScreen(2, 2, 3, 3, 48, VW, VH);
  const hit = calls.find((c) => c[0] === 'drawImage'
    && Math.abs(c[1][1] - p.x) <= 1e-9
    && Math.abs(c[1][2] - p.y) <= 1e-9
    && c[1][3] === 48 && c[1][4] === 48
    && c[1][0] && c[1][0].__img === path);
  assert.ok(hit,
    'базовая постройка (2,2) id 44 — drawImage спрайта СЛОТА (' + path + ') '
    + 'на угле клетки, zoom×zoom (worldToScreen(2,2,3,3,48)); '
    + 'сейчас building-спрайтов: ' + buildingDrawCalls(calls).length);
  // hex-палитра сохранена (R10): пол (2,2) — fillRect городского цвета
  // (спрайт лежит НА поле, НЕ заменяет его).
  const colors = cityCellColors(calls, G, s, 48, 3, 3);
  assert.ok(colors['2,2'], 'пол (2,2) нарисован fillRect (под постройкой)');
  assert.notEqual(colors['2,2'], '#182029',
    'пол (2,2) — не фолбэк-пол подземелья (hex сохранён)');
  assert.notEqual(colors['2,2'], '#0a0d12', 'пол (2,2) — не фон «за пределами»');
  assert.equal(loaded.errors.length, 0, 'ошибок нет: ' + loaded.errors.join('; '));
});

test('город UI 000148.02 (RED): субтип (размещение.слот, без map_index) + несколько построек', () => {
  const loaded = loadDungeonUi({ performance: { now: () => 1000 },
    withSprites: true, withBuildings: true });
  const G = loaded.G;
  // id 45 «Колодец» — СУБТИП без map_index (размещение.слот 11 →
  // кадр tavern_N по now, клетке; tavern_2.svg при now=1000, клетка (2,2));
  // id 37 «Храм луны» — СУБТИП (размещение.слот 8 → temple.svg). ЕДИНСТВЕННЫЙ
  // тест ветки размещения.слот (без map_index).
  const p45 = buildingSpritePath(G, 45, 1000, 2, 2);
  const p37 = buildingSpritePath(G, 37, 1000, 4, 4);
  assert.ok(p45 && p45.indexOf('assets/sprites/buildings/') === 0,
    'предусловие: субтип id 45 резолвится через размещение.слот: ' + p45);
  assert.ok(p37 && p37.indexOf('assets/sprites/buildings/') === 0,
    'предусловие: субтип id 37 резолвится через размещение.слот: ' + p37);
  const rec45 = G.getBuilding(45);
  assert.ok(!Number.isInteger((rec45.особые_параметры || {}).map_index),
    'предусловие: у id 45 НЕТ map_index (ветка размещения.слот)');
  const s = makeCityState({ fp: 2, cx: -114, cy: -119, name: 'Деревня',
    cityContents: { buildings: [
      { x: 2, y: 2, buildingId: 45 },
      { x: 4, y: 4, buildingId: 37 },
    ], seed: 0 } });
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 48,
    spriteLoader: makeSpriteLoader([p45, p37]) });
  const calls = findCanvas(loaded.body).drawCalls;
  const bdc = buildingDrawCalls(calls);
  assert.equal(bdc.length, 2,
    'две постройки — ровно 2 building-спрайта (сейчас: ' + bdc.length + ')');
  const at = (id, x, y) => {
    const pp = G.worldToScreen(x, y, 3, 3, 48, VW, VH);
    const exp = buildingSpritePath(G, id, 1000, x, y);
    return bdc.some((c) => Math.abs(c[1][1] - pp.x) <= 1e-9
      && Math.abs(c[1][2] - pp.y) <= 1e-9
      && c[1][3] === 48 && c[1][4] === 48
      && c[1][0] && c[1][0].__img === exp);
  };
  assert.ok(at(45, 2, 2),
    'субтип id 45 — спрайт ' + p45 + ' на клетке (2,2) (размещение.слот)');
  assert.ok(at(37, 4, 4),
    'субтип id 37 — спрайт ' + p37 + ' на клетке (4,4) (размещение.слот)');
  assert.equal(loaded.errors.length, 0, 'ошибок нет: ' + loaded.errors.join('; '));
});

test('город UI 000148.02: свободные клетки / buildings: [] / cityContents: null — спрайтов постройки нет, пол как раньше', () => {
  // (а) buildings: [] — по построению нет спрайтов, пол/стены как раньше.
  {
    const loaded = loadDungeonUi({ performance: { now: () => 1000 },
      withSprites: true, withBuildings: true });
    const G = loaded.G;
    const s = makeCityState({ fp: 2, cx: -114, cy: -119, name: 'Деревня',
      cityContents: { buildings: [], seed: 0 } });
    G.dungeonUI.start({ state: s, onMove() {}, zoom: 48 });
    const calls = findCanvas(loaded.body).drawCalls;
    assert.equal(buildingDrawCalls(calls).length, 0,
      'buildings: [] — building-спрайтов нет');
    const colors = cityCellColors(calls, G, s, 48, 3, 3);
    assert.ok(colors['2,2'], 'пол (2,2) нарисован (как раньше)');
    assert.notEqual(colors['2,2'], '#182029', 'пол — hex (не фолбэк)');
    assert.equal(loaded.errors.length, 0, 'ошибок нет: ' + loaded.errors.join('; '));
  }
  // (б) cityContents: null (дефолт makeCityState) — гард skip.
  {
    const loaded = loadDungeonUi({ performance: { now: () => 1000 },
      withSprites: true, withBuildings: true });
    const G = loaded.G;
    const s = makeCityState({ fp: 2, cx: -114, cy: -119, name: 'Деревня' });
    assert.equal(s.cityContents, null,
      'предусловие: makeCityState по умолчанию — cityContents: null');
    G.dungeonUI.start({ state: s, onMove() {}, zoom: 48 });
    const calls = findCanvas(loaded.body).drawCalls;
    assert.ok(calls.length > 0, 'render при cityContents: null — без падения');
    assert.equal(buildingDrawCalls(calls).length, 0,
      'cityContents: null — building-спрайтов нет (гард skip)');
    const colors = cityCellColors(calls, G, s, 48, 3, 3);
    assert.ok(colors['2,2'], 'пол (2,2) нарисован (как раньше)');
    assert.equal(loaded.errors.length, 0, 'ошибок нет: ' + loaded.errors.join('; '));
  }
});

test('город UI 000148.02 (деградация): цепочка без sprites.js/buildings.js + buildings в state — drawImage нет, краха нет, errors 0', () => {
  // Дефолтный loadDungeonUi — БЕЗ sprites.js (нет G.buildingSprite) и
  // БЕЗ buildings.js (нет G.getBuilding). Гарды слоя обязаны тихо
  // skipнуть (без console.error) — клетка остаётся полом.
  const loaded = loadDungeonUi({ performance: { now: () => 1000 } });
  const G = loaded.G;
  assert.equal(typeof G.getBuilding, 'undefined',
    'предусловие: buildings.js не в цепочке — G.getBuilding нет');
  assert.equal(typeof G.buildingSprite, 'undefined',
    'предусловие: sprites.js не в цепочке — G.buildingSprite нет');
  const s = makeCityState({ fp: 2, cx: -114, cy: -119, name: 'Деревня',
    cityContents: { buildings: [{ x: 2, y: 2, buildingId: 44 }], seed: 0 } });
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 48 });
  const calls = findCanvas(loaded.body).drawCalls;
  assert.ok(calls.length > 0, 'render — без краха (нет каталога/спрайтов)');
  assert.equal(buildingDrawCalls(calls).length, 0,
    'нет getBuilding/buildingSprite — building-спрайтов нет (тихий skip)');
  const colors = cityCellColors(calls, G, s, 48, 3, 3);
  assert.ok(colors['2,2'], 'пол (2,2) нарисован (клетка осталась полом)');
  assert.equal(loaded.errors.length, 0,
    'тихая деградация — без console.error: ' + loaded.errors.join('; '));
});

test('город UI 000148.02 (деградация): изображение не готово (loader без путей) — drawImage нет, errors 0, пол как раньше', () => {
  const loaded = loadDungeonUi({ performance: { now: () => 1000 },
    withSprites: true, withBuildings: true });
  const G = loaded.G;
  const s = makeCityState({ fp: 2, cx: -114, cy: -119, name: 'Деревня',
    cityContents: { buildings: [{ x: 2, y: 2, buildingId: 44 }], seed: 0 } });
  // Loader без готовых путей — isReady → false, image → null.
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 48,
    spriteLoader: makeSpriteLoader([]) });
  const calls = findCanvas(loaded.body).drawCalls;
  assert.equal(buildingDrawCalls(calls).length, 0,
    'изображение не готово — building-спрайт skip');
  const colors = cityCellColors(calls, G, s, 48, 3, 3);
  assert.ok(colors['2,2'], 'пол (2,2) нарисован (как раньше)');
  assert.notEqual(colors['2,2'], '#182029', 'пол — hex (не фолбэк)');
  assert.equal(loaded.errors.length, 0,
    'тихая деградация — без console.error: ' + loaded.errors.join('; '));
});

test('город UI 000148.02 (RED): базовые id (1/25/36/44) + неизвестный id (999) — спрайты по слотам, 999 skip', () => {
  const loaded = loadDungeonUi({ performance: { now: () => 1000 },
    withSprites: true, withBuildings: true });
  const G = loaded.G;
  // Базовые id: 1 «Оружейная»(слот 0), 25 «Дом кузнеца»(12),
  // 36 «Храм солнца»(8, каталог 3×3 → город 1×1), 44 «Таверна»(11).
  const cells = [
    [1, 1, 1], [25, 2, 1], [36, 3, 1], [44, 4, 1],
  ];
  const paths = cells.map(([id, x, y]) => buildingSpritePath(G, id, 1000, x, y));
  cells.forEach(([id], i) => {
    assert.ok(paths[i] && paths[i].indexOf('assets/sprites/buildings/') === 0,
      'предусловие: id ' + id + ' резолвится в спрайт СЛОТА: ' + paths[i]);
  });
  assert.equal(buildingSpritePath(G, 999, 1000, 1, 2), null,
    'предусловие: id 999 — нет каталожной записи (null)');
  const s = makeCityState({ fp: 2, cx: -114, cy: -119, name: 'Деревня',
    cityContents: { buildings: [
      { x: 1, y: 1, buildingId: 1 },
      { x: 2, y: 1, buildingId: 25 },
      { x: 3, y: 1, buildingId: 36 },
      { x: 4, y: 1, buildingId: 44 },
      { x: 1, y: 2, buildingId: 999 }, // неизвестный — skip
    ], seed: 0 } });
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 48,
    spriteLoader: makeSpriteLoader(paths) });
  const calls = findCanvas(loaded.body).drawCalls;
  const bdc = buildingDrawCalls(calls);
  assert.equal(bdc.length, 4,
    '4 известные постройки — ровно 4 спрайта; id 999 — skip '
    + '(сейчас: ' + bdc.length + ')');
  cells.forEach(([id, x, y]) => {
    const pp = G.worldToScreen(x, y, 3, 3, 48, VW, VH);
    const exp = buildingSpritePath(G, id, 1000, x, y);
    assert.ok(bdc.some((c) => Math.abs(c[1][1] - pp.x) <= 1e-9
        && Math.abs(c[1][2] - pp.y) <= 1e-9
        && c[1][3] === 48 && c[1][4] === 48
        && c[1][0] && c[1][0].__img === exp),
      'id ' + id + ' — спрайт ' + exp + ' на клетке (' + x + ',' + y + ')');
  });
  // id 999 — клетки (1,2) building-спрайта НЕТ.
  const p999 = G.worldToScreen(1, 2, 3, 3, 48, VW, VH);
  assert.ok(!bdc.some((c) => Math.abs(c[1][1] - p999.x) <= 1e-9
    && Math.abs(c[1][2] - p999.y) <= 1e-9),
    'id 999 (1,2) — спрайта нет (тихий skip)');
  assert.equal(loaded.errors.length, 0,
    'неизвестный id — без console.error: ' + loaded.errors.join('; '));
});

test('город UI 000148.02 (RED): viewport-клип — 18×18 @ 40 (cam clamp (9,10.5)): (0,0) урезана, (9,9) нарисована', () => {
  const loaded = loadDungeonUi({ performance: { now: () => 1000 },
    withSprites: true, withBuildings: true });
  const G = loaded.G;
  const path = buildingSpritePath(G, 44, 1000, 9, 9);
  assert.ok(path && path.indexOf('assets/sprites/buildings/') === 0,
    'предусловие: id 44 резолвится в спрайт СЛОТА: ' + path);
  // 18x18 @ 40: по X 18*40=720 ≤ 800 → cam.x=9; по Y 720 > 600 →
  // cam.y = clamp(вход (14,17)+0.5) = 10.5. visibleTileRange (margin 2)
  // → y [2,17]: клетка (0,0) УРЕЗАНА, (9,9) в вьюпорте.
  const s = makeCityState({ fp: 5, cx: 100, cy: -40, name: 'Город',
    cityContents: { buildings: [
      { x: 0, y: 0, buildingId: 44 }, // за вьюпортом (y=0 < y0=2)
      { x: 9, y: 9, buildingId: 44 }, // в вьюпорте
    ], seed: 0 } });
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 40,
    spriteLoader: makeSpriteLoader([path]) });
  const calls = findCanvas(loaded.body).drawCalls;
  const bdc = buildingDrawCalls(calls);
  assert.equal(bdc.length, 1,
    'viewport-клип: нарисована ТОЛЬКО (9,9), (0,0) урезана '
    + '(сейчас: ' + bdc.length + ')');
  const p99 = G.worldToScreen(9, 9, 9, 10.5, 40, VW, VH);
  assert.ok(bdc.some((c) => Math.abs(c[1][1] - p99.x) <= 1e-9
    && Math.abs(c[1][2] - p99.y) <= 1e-9
    && c[1][3] === 40 && c[1][4] === 40
    && c[1][0] && c[1][0].__img === path),
    '(9,9) — спрайт ' + path + ' на угле клетки, zoom×zoom (cam (9,10.5))');
  assert.equal(loaded.errors.length, 0, 'ошибок нет: ' + loaded.errors.join('; '));
});

test('город UI 000148.02: детерминизм (D10) — два рендера одного города с постройками идентичны', () => {
  const loaded = loadDungeonUi({ performance: { now: () => 1000 },
    withSprites: true, withBuildings: true });
  const G = loaded.G;
  const s = makeCityState({ fp: 2, cx: -114, cy: -119, name: 'Деревня',
    cityContents: { buildings: [
      { x: 2, y: 2, buildingId: 44 },
      { x: 4, y: 4, buildingId: 1 },
    ], seed: 0 } });
  const paths = [[44, 2, 2], [1, 4, 4]]
    .map(([id, x, y]) => buildingSpritePath(G, id, 1000, x, y));
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 48,
    spriteLoader: makeSpriteLoader(paths) });
  const canvas = findCanvas(loaded.body);
  const n0 = canvas.drawCalls.length;
  G.dungeonUI.render(1000); // тот же now — второй рендер
  const sig = (seg) => buildingDrawCalls(seg)
    .map((c) => JSON.stringify([c[1][0].__img, c[1][1], c[1][2], c[1][3], c[1][4]]))
    .sort();
  const first = sig(canvas.drawCalls.slice(0, n0));
  const second = sig(canvas.drawCalls.slice(n0));
  assert.deepEqual(first, second,
    'два рендера одного города с постройками — идентичная последовательность '
    + 'building-спрайтов (D10: в рендере НЕТ RNG)');
  assert.equal(loaded.errors.length, 0, 'ошибок нет: ' + loaded.errors.join('; '));
});

// 000191 — ретро-покрытие (retro-20261012): горячая ветка 000148.02
// «каталожная запись есть, слота НЕТ» + z-порядок слоя построек.

test('город UI 000191.5: каталожная запись есть, слота НЕТ (id 5 «Лавка странника») — горячая ветка cityBuildingPath → null: ТИХИЙ skip — building-drawImage на (2,2) НЕТ, пол (2,2) на месте, errors 0', () => {
  const loaded = loadDungeonUi({ performance: { now: () => 1000 },
    withSprites: true, withBuildings: true });
  const G = loaded.G;
  // Предусловие: id 5 — в каталоге, но БЕЗ map_index/размещение.слот
  // (городской тип — канал NPC-торговли, spec/buildings.md «Магазины»).
  const rec5 = G.getBuilding(5);
  assert.ok(rec5, 'предусловие: каталожная запись id 5 есть');
  assert.equal(rec5.название, 'Лавка странника',
    'предусловие: id 5 — «Лавка странника»');
  assert.equal(buildingSpritePath(G, 5, 1000, 2, 2), null,
    'предусловие: у id 5 нет слота (cityBuildingPath → null)');
  const s = makeCityState({ fp: 2, cx: -114, cy: -119, name: 'Деревня',
    cityContents: { buildings: [{ x: 2, y: 2, buildingId: 5 }], seed: 0 } });
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 48,
    spriteLoader: makeSpriteLoader([]) });
  const calls = findCanvas(loaded.body).drawCalls;
  assert.equal(buildingDrawCalls(calls).length, 0,
    'slot == null → тихий skip: спрайта постройки на (2,2) НЕТ');
  // Клетка остаётся ПОЛЕМ: fillRect (2,2) нарисован (6x6 @ 48 → cam (3,3)).
  const colors = cityCellColors(calls, G, s, 48, 3, 3);
  assert.ok(colors['2,2'],
    'пол (2,2) нарисован fillRect (клетка — пол, не пропала)');
  assert.equal(loaded.errors.length, 0,
    'тихий skip — без console.error: ' + loaded.errors.join('; '));
});

test('город UI 000191.6a: z-порядок слоя — building-drawImage (2,2) ПОСЛЕ floor-fillRect (2,2): index(building) > index(floor)', () => {
  const loaded = loadDungeonUi({ performance: { now: () => 1000 },
    withSprites: true, withBuildings: true });
  const G = loaded.G;
  const path = buildingSpritePath(G, 44, 1000, 2, 2);
  assert.ok(path, 'предусловие: id 44 резолвится в спрайт слота');
  const s = makeCityState({ fp: 2, cx: -114, cy: -119, name: 'Деревня',
    cityContents: { buildings: [{ x: 2, y: 2, buildingId: 44 }], seed: 0 } });
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 48,
    spriteLoader: makeSpriteLoader([path]) });
  const calls = findCanvas(loaded.body).drawCalls;
  const p = G.worldToScreen(2, 2, 3, 3, 48, VW, VH);
  const floorIdx = calls.findIndex((c) => c[0] === 'fillRect'
    && Math.abs(c[1][0] - p.x) <= 1e-9
    && Math.abs(c[1][1] - p.y) <= 1e-9
    && c[1][2] === 48 && c[1][3] === 48);
  assert.ok(floorIdx !== -1,
    'floor-fillRect (2,2) найден в последовательности draw-вызовов');
  const bdc = buildingDrawCalls(calls);
  assert.equal(bdc.length, 1, 'ровно 1 building-спрайт (id 44 на (2,2))');
  const buildIdx = calls.indexOf(bdc[0]);
  assert.ok(buildIdx !== -1 && buildIdx > floorIdx,
    'z-порядок: спрайт постройки (idx ' + buildIdx + ') нарисован ПОСЛЕ '
    + 'полосы пола (idx ' + floorIdx + ') — слой ПО ВЕРХУ');
  assert.equal(loaded.errors.length, 0,
    'ошибок нет: ' + loaded.errors.join('; '));
});

// --- Тач-D-pad: touchHold/touchRelease (задача 000121) ---
//
// КРАСНЫЕ (TDD): падают, пока G.dungeonUI.touchHold/touchRelease не
// существуют. Контракт (memory/000121-touch-dungeon-combat.md, D4):
//  * тап = ОДИН шаг — тело keydown 1:1 (deltaForMoveKey('touch:'+dir)
//    → ctx.onMove → render); гарды каждого шага: isActive() +
//    liveGame().combatUI.isActive() (бой выше по стеке);
//  * повтор при удержании — в СУЩЕСТВУЮЩЕМ rAF-цикле (hook в tick),
//    интервал — живое move_interval_ms (000063, дефолт 420 мс);
//  * сброс состояния в start()/close() — утечек между подземельями нет.

test('подземелье UI: touchHold/touchRelease — тап = один шаг, повтор при удержании (rAF), стоп в бою и после release (000121)', () => {
  // (а) Тап — ровно ОДИН шаг по направлениям (песочница без rAF —
  // повтора по определению нет; как существующие тесты 000043).
  {
    const { G } = loadDungeonUi();
    const moves = [];
    openDungeon(G, moves);
    const CASES = [
      ['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0],
    ];
    for (const [dir, dx, dy] of CASES) {
      moves.length = 0;
      G.dungeonUI.touchHold(dir);
      G.dungeonUI.touchRelease(dir);
      assert.deepEqual(moves, [[dx, dy]],
        dir + ' → ровно ОДИН шаг (' + dx + ', ' + dy + '): ' + JSON.stringify(moves));
    }
    // Не-направления — onMove не вызывается, без краха.
    for (const a of ['interact', 'inventory', 'jump', 'nope']) {
      moves.length = 0;
      G.dungeonUI.touchHold(a);
      G.dungeonUI.touchRelease(a);
      assert.equal(moves.length, 0, a + ': onMove не вызывается');
    }
    // После close() — onMove не вызывается (состояние сброшено).
    G.dungeonUI.close();
    G.dungeonUI.touchHold('up');
    assert.equal(moves.length, 0, 'после close — onMove не вызывается');
  }
  // (б) До start() — onMove не вызывается (своя песочница).
  {
    const { G } = loadDungeonUi();
    const moves = [];
    G.dungeonUI.touchHold('up');
    assert.equal(moves.length, 0, 'до start — onMove не вызывается');
  }
  // (в) Повтор при удержании — в rAF-цикле, интервал move_interval_ms
  // (420 мс, global-settings); touchRelease — стоп.
  {
    const rafStubs = makeRafStubs();
    const T = { t: 1000 };
    const { G } = loadDungeonUi({
      performance: { now: () => T.t },
      requestAnimationFrame: rafStubs.requestAnimationFrame,
      cancelAnimationFrame: rafStubs.cancelAnimationFrame,
    });
    const moves = [];
    openDungeon(G, moves);
    G.dungeonUI.touchHold('up');
    assert.deepEqual(moves, [[0, -1]], 'тап — шаг 1');
    T.t += 420; // move_interval_ms
    tick(rafStubs);
    assert.deepEqual(moves, [[0, -1], [0, -1]], 'повтор — шаг 2 (420 мс)');
    T.t += 419; // ещё не 420 — третьего шага нет
    tick(rafStubs);
    assert.deepEqual(moves, [[0, -1], [0, -1]],
      'до 420 мс — повтор НЕ наступил');
    G.dungeonUI.touchRelease('up');
    T.t += 420;
    tick(rafStubs);
    assert.deepEqual(moves, [[0, -1], [0, -1]],
      'после touchRelease — повтор остановлен');
  }
  // (г) Активный бой выше по стеку — onMove НЕ вызывается, без
  // console.error (гард каждого шага; боевые действия не выпускаются).
  {
    const { G, errors } = loadDungeonUi({ withCombat: true });
    assert.ok(G.combatUI, 'Game.combatUI создан');
    const moves = [];
    openDungeon(G, moves);
    const c = G.combatUI.startCombat({
      hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
    });
    assert.ok(c, 'бой создан');
    assert.equal(G.combatUI.isActive(), true, 'бой активен');
    G.dungeonUI.touchHold('up');
    G.dungeonUI.touchRelease('up');
    assert.equal(moves.length, 0, 'во время боя onMove не вызывается');
    assert.equal(errors.length, 0,
      'нет console.error (гард, не крах): ' + JSON.stringify(errors));
  }
});

// --- Ревью 000121: touchStepMs() — live move_interval_ms, кламп,
// фолбэк (ветки, которые R5 покрывала только по пути 420 мс) ---
//
// global-settings.js — ПЕРВЫЙ в цепочке песочницы: G.GlobalSettings.
// SETTINGS — живой объект (000098), перезапись видна touchStepMs()
// (live-чтение liveGame() в момент вызова). Каждый кейс — своя
// песочница: чужие тесты не затрагиваются.

test('подземелье UI: touchHold — интервал повтора: live move_interval_ms, кламп ≥ 60, фолбэк 420 (000121, ревью)', () => {
  // (а) Кастомное move_interval_ms = 100 — повтор через 100 мс
  // (ЖИВОЕ чтение, не зашитое 420).
  {
    const rafStubs = makeRafStubs();
    const T = { t: 1000 };
    const { G } = loadDungeonUi({
      performance: { now: () => T.t },
      requestAnimationFrame: rafStubs.requestAnimationFrame,
      cancelAnimationFrame: rafStubs.cancelAnimationFrame,
    });
    assert.ok(G.GlobalSettings && G.GlobalSettings.SETTINGS,
      'GlobalSettings.SETTINGS в песочнице (global-settings.js в цепочке)');
    G.GlobalSettings.SETTINGS.move_interval_ms = 100;
    const moves = [];
    openDungeon(G, moves);
    G.dungeonUI.touchHold('up');
    assert.deepEqual(moves, [[0, -1]], 'тап — шаг 1');
    T.t += 100;
    tick(rafStubs);
    assert.deepEqual(moves, [[0, -1], [0, -1]], 'повтор — шаг 2 (100 мс)');
    T.t += 99; // ещё не 100 — третьего шага нет
    tick(rafStubs);
    assert.deepEqual(moves, [[0, -1], [0, -1]],
      '99 мс — повтор НЕ наступил (интервал 100, не 420)');
  }
  // (б) move_interval_ms = 10 — кламп ≥ 60 (MIN_MOVE_INTERVAL_MS).
  {
    const rafStubs = makeRafStubs();
    const T = { t: 1000 };
    const { G } = loadDungeonUi({
      performance: { now: () => T.t },
      requestAnimationFrame: rafStubs.requestAnimationFrame,
      cancelAnimationFrame: rafStubs.cancelAnimationFrame,
    });
    G.GlobalSettings.SETTINGS.move_interval_ms = 10;
    const moves = [];
    openDungeon(G, moves);
    G.dungeonUI.touchHold('up');
    assert.deepEqual(moves, [[0, -1]], 'тап — шаг 1');
    T.t += 60; // кламп 60, а не 10
    tick(rafStubs);
    assert.deepEqual(moves, [[0, -1], [0, -1]],
      'повтор — шаг 2 (кламп 60 мс)');
    T.t += 59; // 59 < 60 — третьего шага нет
    tick(rafStubs);
    assert.deepEqual(moves, [[0, -1], [0, -1]],
      '59 мс — повтор НЕ наступил (кламп 60, не 10)');
  }
  // (в) Мусор/не-число/≤ 0 — фолбэк 420 (граница 419/420).
  for (const v of ['junk', 0, -5, NaN]) {
    const rafStubs = makeRafStubs();
    const T = { t: 1000 };
    const { G, errors } = loadDungeonUi({
      performance: { now: () => T.t },
      requestAnimationFrame: rafStubs.requestAnimationFrame,
      cancelAnimationFrame: rafStubs.cancelAnimationFrame,
    });
    G.GlobalSettings.SETTINGS.move_interval_ms = v;
    const moves = [];
    openDungeon(G, moves);
    G.dungeonUI.touchHold('up');
    assert.deepEqual(moves, [[0, -1]],
      'move_interval_ms=' + String(v) + ': тап — шаг 1');
    T.t += 419;
    tick(rafStubs);
    assert.deepEqual(moves, [[0, -1]],
      'move_interval_ms=' + String(v) + ': 419 мс — повтора нет');
    T.t += 1; // итого 420 — фолбэк
    tick(rafStubs);
    assert.deepEqual(moves, [[0, -1], [0, -1]],
      'move_interval_ms=' + String(v) + ': 420 мс — фолбэк, шаг 2');
    assert.equal(errors.length, 0,
      'move_interval_ms=' + String(v) + ': без console.error (деградация)');
  }
  // (г) GlobalSettings отсутствует вовсе — фолбэк 420.
  {
    const rafStubs = makeRafStubs();
    const T = { t: 1000 };
    const { G, errors } = loadDungeonUi({
      performance: { now: () => T.t },
      requestAnimationFrame: rafStubs.requestAnimationFrame,
      cancelAnimationFrame: rafStubs.cancelAnimationFrame,
    });
    delete G.GlobalSettings;
    const moves = [];
    openDungeon(G, moves);
    G.dungeonUI.touchHold('up');
    assert.deepEqual(moves, [[0, -1]], 'тап — шаг 1');
    T.t += 419;
    tick(rafStubs);
    assert.deepEqual(moves, [[0, -1]], '419 мс — повтора нет');
    T.t += 1;
    tick(rafStubs);
    assert.deepEqual(moves, [[0, -1], [0, -1]],
      '420 мс — фолбэк (GlobalSettings отсутствует), шаг 2');
    assert.equal(errors.length, 0,
      'без console.error (деградация, не крах): ' + JSON.stringify(errors));
  }
});

// =====================================================================
// 000157.02: КРАСНЫЕ тесты UI-DEP-1..3 — рендер/состояние/hint
// залежей. Контракт: memory/000157.02-dungeon-deposits.md §4.4.
// =====================================================================

test('подземелье UI 000157.02: залежи — спрайт G.DUNGEON_DEPOSIT по виду (zoom*0.8, центр клетки); gathered — не рисуется; fog-маска 000136; фолбэк-цвета по виду (UI-DEP-1, RED)', () => {
  const ORE = 'assets/dungeon/deposit_ore.svg';
  const MINERAL = 'assets/dungeon/deposit_mineral.svg';
  const GEM = 'assets/dungeon/deposit_gem.svg';
  const FB = {
    'руда': ['#b5722f', '#6e4218'],
    'минерал': ['#7f8ea3', '#46525f'],
    'самоцвет': ['#2fa06b', '#175c3c'],
  };
  const allColors = Object.values(FB).flat();
  // (a) Спрайт по виду: CAVE (type 0) — iron_ore (руда), quartz
  // (минерал); RUINS (type 2) — ruby (самоцвет). Вид — из
  // DUNGEON_ORES[type] по предмету (vm-цепь без dungeons-data —
  // fallback-таблица; цепь loadSpriteDungeon НЕ включает каталог).
  let { G, body } = loadSpriteDungeon();
  assert.ok(G.DUNGEON_DEPOSIT && typeof G.DUNGEON_DEPOSIT === 'object',
    'sprites.js: G.DUNGEON_DEPOSIT — таблица вид → путь спрайта');
  assert.equal(G.DUNGEON_DEPOSIT['руда'], ORE,
    'DUNGEON_DEPOSIT.руда — ' + ORE);
  assert.equal(G.DUNGEON_DEPOSIT['минерал'], MINERAL,
    'DUNGEON_DEPOSIT.минерал — ' + MINERAL);
  assert.equal(G.DUNGEON_DEPOSIT['самоцвет'], GEM,
    'DUNGEON_DEPOSIT.самоцвет — ' + GEM);
  let loader = makeSpriteLoader([ORE, MINERAL, GEM]);
  G.dungeonUI.start({
    state: makeState({ deposits: [
      { id: 'd0', x: 1, y: 3, item: 'iron_ore', amount: 2,
        gathered: false },
      { id: 'd1', x: 3, y: 1, item: 'quartz', amount: 1,
        gathered: false },
    ] }),
    onMove() {}, zoom: 48, spriteLoader: loader,
  });
  let calls = findCanvas(body).drawCalls;
  const s = 48 * 0.8;
  let c1 = G.worldToScreen(1.5, 3.5, 2.5, 2.5, 48, VW, VH);
  assert.ok(drawImageAt(calls, c1.x - s / 2, c1.y - s / 2, s)
    .some((im) => im[1][0] && im[1][0].__img === ORE),
    'залежь (1,3) iron_ore (руда) — drawImage ' + ORE + ' (zoom*0.8, '
    + 'центр клетки)');
  let c2 = G.worldToScreen(3.5, 1.5, 2.5, 2.5, 48, VW, VH);
  assert.ok(drawImageAt(calls, c2.x - s / 2, c2.y - s / 2, s)
    .some((im) => im[1][0] && im[1][0].__img === MINERAL),
    'залежь (3,1) quartz (минерал) — drawImage ' + MINERAL);
  for (const col of allColors) {
    assert.ok(!calls.some((im) => im[2] === col),
      'фолбэк-квадрата ' + col + ' нет (спрайт заменил цвет)');
  }
  // Самоцвет — пул RUINS (type 2: ruby).
  ({ G, body } = loadSpriteDungeon());
  loader = makeSpriteLoader([ORE, MINERAL, GEM]);
  G.dungeonUI.start({
    state: makeState({ type: 2, deposits: [
      { id: 'd0', x: 1, y: 3, item: 'ruby', amount: 3, gathered: false },
    ] }),
    onMove() {}, zoom: 48, spriteLoader: loader,
  });
  calls = findCanvas(body).drawCalls;
  const c3 = G.worldToScreen(1.5, 3.5, 2.5, 2.5, 48, VW, VH);
  assert.ok(drawImageAt(calls, c3.x - s / 2, c3.y - s / 2, s)
    .some((im) => im[1][0] && im[1][0].__img === GEM),
    'залежь (1,3) ruby (самоцвет) — drawImage ' + GEM);
  // (b) gathered — не рисуется вообще (паттерн открытого сундука).
  ({ G, body } = loadSpriteDungeon());
  loader = makeSpriteLoader([ORE, MINERAL, GEM]);
  G.dungeonUI.start({
    state: makeState({ deposits: [
      { id: 'd0', x: 1, y: 3, item: 'iron_ore', amount: 2,
        gathered: true },
      { id: 'd1', x: 3, y: 1, item: 'quartz', amount: 1,
        gathered: true },
    ] }),
    onMove() {}, zoom: 48, spriteLoader: loader,
  });
  calls = findCanvas(body).drawCalls;
  assert.ok(!calls.some((im) => im[0] === 'drawImage'
      && im[1][0] && (im[1][0].__img === ORE
        || im[1][0].__img === MINERAL || im[1][0].__img === GEM)),
    'gathered-залежи не рисуются (drawImage deposit_*.svg нет)');
  for (const col of allColors) {
    assert.ok(!calls.some((im) => im[2] === col),
      'gathered-залежи — и фолбэк ' + col + ' нет');
  }
  // (c) Fog-маска 000136: 25×25, игрок (1,1), R = radiusFor(1) = 5
  // (Chebyshev). Залежь (3,3) — видима (drawn); (8,4) — вне радиуса,
  // НО внутри вьюпорта → не рисуется (маска 0).
  ({ G, body } = loadSpriteDungeon());
  loader = makeSpriteLoader([ORE, MINERAL, GEM]);
  G.dungeonUI.start({
    state: makeState({
      width: 25, height: 25,
      deposits: [
        { id: 'd0', x: 3, y: 3, item: 'iron_ore', amount: 2,
          gathered: false },
        { id: 'd1', x: 8, y: 4, item: 'coal', amount: 1,
          gathered: false },
      ],
    }),
    onMove() {}, zoom: 48, spriteLoader: loader,
  });
  calls = findCanvas(body).drawCalls;
  const camX = Math.min(Math.max(1.5, VW / 2 / 48), 25 - VW / 2 / 48);
  const camY = Math.min(Math.max(1.5, VH / 2 / 48), 25 - VH / 2 / 48);
  const pNear = G.worldToScreen(3.5, 3.5, camX, camY, 48, VW, VH);
  assert.ok(drawImageAt(calls, pNear.x - s / 2, pNear.y - s / 2, s)
    .some((im) => im[1][0] && im[1][0].__img === ORE),
    'залежь (3,3) в радиусе видимости — рисуется');
  const pFar = G.worldToScreen(8.5, 4.5, camX, camY, 48, VW, VH);
  assert.ok(!drawImageAt(calls, pFar.x - s / 2, pFar.y - s / 2, s)
    .some((im) => im[1][0] && (im[1][0].__img === ORE
      || im[1][0].__img === MINERAL)),
    'залежь (8,4) вне радиуса видимости (fog) — не рисуется');
  // (d) Фолбэк (изображения нет): квадрат + полоса, цвета ПО ВИДУ.
  // type 2 (RUINS-пул): iron_ore — руда, quartz — минерал,
  // ruby — самоцвет.
  ({ G, body } = loadSpriteDungeon());
  G.dungeonUI.start({
    state: makeState({ type: 2, deposits: [
      { id: 'd0', x: 1, y: 3, item: 'iron_ore', amount: 2,
        gathered: false },
      { id: 'd1', x: 3, y: 1, item: 'quartz', amount: 1,
        gathered: false },
      { id: 'd2', x: 3, y: 3, item: 'ruby', amount: 3,
        gathered: false },
    ] }),
    onMove() {}, zoom: 48, spriteLoader: makeSpriteLoader([]),
  });
  calls = findCanvas(body).drawCalls;
  assert.ok(!calls.some((im) => im[0] === 'drawImage'),
    'изображений нет — drawImage не вызывается');
  const pc1 = G.worldToScreen(1, 3, 2.5, 2.5, 48, VW, VH);
  assert.ok(fillRectAt(calls, FB['руда'][0], pc1.x + 3, pc1.y + 3, 42, 42),
    'фолбэк «руда» (iron_ore) — квадрат ' + FB['руда'][0]);
  assert.ok(fillRectAt(calls, FB['руда'][1], pc1.x + 3, pc1.y + 23, 42, 2),
    'фолбэк «руда» — полоса ' + FB['руда'][1]);
  const pc2 = G.worldToScreen(3, 1, 2.5, 2.5, 48, VW, VH);
  assert.ok(fillRectAt(calls, FB['минерал'][0], pc2.x + 3, pc2.y + 3, 42, 42),
    'фолбэк «минерал» (quartz) — квадрат ' + FB['минерал'][0]);
  assert.ok(fillRectAt(calls, FB['минерал'][1], pc2.x + 3, pc2.y + 23, 42, 2),
    'фолбэк «минерал» — полоса ' + FB['минерал'][1]);
  const pc3 = G.worldToScreen(3, 3, 2.5, 2.5, 48, VW, VH);
  assert.ok(fillRectAt(calls, FB['самоцвет'][0], pc3.x + 3, pc3.y + 3, 42, 42),
    'фолбэк «самоцвет» (ruby) — квадрат ' + FB['самоцвет'][0]);
  assert.ok(fillRectAt(calls, FB['самоцвет'][1], pc3.x + 3, pc3.y + 23, 42, 2),
    'фолбэк «самоцвет» — полоса ' + FB['самоцвет'][1]);
});

test('подземелье UI 000212/000229: панель УБРАНА СОВСЕМ: в оверлее НЕТ .combat-side/.combat-state/.combat-log (UI-DEP-2 re-pin 000229)', () => {
  const { G, body } = loadDungeonUi({ performance: { now: () => 1000 } });
  const s = makeState({
    mobs: [{ x: 2, y: 2, level: 3, defeated: false }],
    chests: [{ x: 1, y: 3, opened: false }],
    deposits: [
      { id: 'd0', x: 1, y: 3, item: 'iron_ore', amount: 2,
        gathered: false },
      { id: 'd1', x: 2, y: 1, item: 'quartz', amount: 1,
        gathered: false },
      { id: 'd2', x: 3, y: 2, item: 'coal', amount: 3, gathered: true },
    ],
  });
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 48 });
  assert.equal(allByClass(body, 'combat-side').length, 0,
    'оверлей: .combat-side НЕТ (000229: панель — только город)');
  const states = allByClass(body, 'combat-state');
  assert.equal(states.length, 0,
    'оверлей: .combat-state НЕТ (000212: stateEl; 000229: hint — '
    + 'вместе с панелью)');
  assert.equal(allByClass(body, 'combat-log').length, 0,
    'оверлей: .combat-log (журнал) НЕТ (000229: окно убрано совсем)');
});

test('подземелье UI 000157.02: панель подземелья УБРАНА — hint (строка про залежи) в подземелье НЕТ (000229); город — панели НЕТ СОВСЕМ (000247: UI-DEP-3 re-pin)', () => {
  const D = loadDungeonUi({ performance: { now: () => 1000 } });
  D.G.dungeonUI.start({ state: makeState(), onMove() {}, zoom: 48 });
  // 000229: в подземелье панели нет — .combat-state (hint) НЕТ
  // (000212: stateEl; 000229: log + hint).
  assert.equal(allByClass(D.body, 'combat-state').length, 0,
    'подземелье: .combat-state (hint) НЕТ (000229: панель убрана)');
  const C = loadDungeonUi({ performance: { now: () => 1000 } });
  C.G.dungeonUI.start({
    state: makeCityState({ fp: 2, cx: -114, cy: -119, name: 'Деревня' }),
    onMove() {}, zoom: 48,
  });
  // 000247: в городе панели тоже нет (убрана совсем) — строки
  // «Залежи» нет: hint отсутствует целиком (залежей в городе нет —
  // 000157.02).
  assert.equal(allByClass(C.body, 'combat-state').length, 0,
    'город: .combat-state (stateEl/hint) НЕТ (000247: панель убрана '
    + 'совсем — «Залежи» негде рендериться)');
});

// =====================================================================
// 000157.03: UI-GRD-1 — контекстная строка «Залежь — [E]». Re-pin
// 000229/000247: панель (hint — .combat-state) УБРАНА в обоих
// kind'ах (000247: механизм hintEl/hintBase + onDeposit в render()
// удалён СОВСЕМ) — строки НЕТ во всех фазах.
// =====================================================================

test('000157.03: строка «Залежь — [E]» в подземелье НЕТ — панель убрана (000229): во всех фазах 0 .combat-state (UI-GRD-1 re-pin 000229)', () => {
  // (а) Герой на клетке не-собранной залежи (2,1) → панели НЕТ.
  const A = loadDungeonUi({ performance: { now: () => 1000 } });
  A.G.dungeonUI.start({
    state: makeState({
      deposits: [{ id: 'd0', x: 2, y: 1, item: 'coal', amount: 2,
        gathered: false }],
      px: 2, py: 1,
    }),
    onMove() {}, zoom: 48,
  });
  assert.equal(allByClass(A.body, 'combat-state').length, 0,
    '(а) стоя на не-собранной залежи: .combat-state (hint) НЕТ '
    + '(000229: панель убрана)');
  assert.equal(allByClass(A.body, 'combat-side').length, 0,
    '(а) .combat-side НЕТ (000229)');
  // (б) Герой в другой клетке (3,1) → панели НЕТ.
  const B = loadDungeonUi({ performance: { now: () => 1000 } });
  B.G.dungeonUI.start({
    state: makeState({
      deposits: [{ id: 'd0', x: 2, y: 1, item: 'coal', amount: 2,
        gathered: false }],
      px: 3, py: 1,
    }),
    onMove() {}, zoom: 48,
  });
  assert.equal(allByClass(B.body, 'combat-state').length, 0,
    '(б) в другой клетке: .combat-state (hint) НЕТ (000229)');
  // (в) Уже собрана (gathered: true) → панели НЕТ.
  const C = loadDungeonUi({ performance: { now: () => 1000 } });
  C.G.dungeonUI.start({
    state: makeState({
      deposits: [{ id: 'd0', x: 2, y: 1, item: 'coal', amount: 2,
        gathered: true }],
      px: 2, py: 1,
    }),
    onMove() {}, zoom: 48,
  });
  assert.equal(allByClass(C.body, 'combat-state').length, 0,
    '(в) залежь собрана: .combat-state (hint) НЕТ (000229)');
});
// ============================================================
// 000153.03: переходы этажей — HUD «Глубина: N» (единый helper),
// depth-aware хинты, маркеры stairs-down + stairs-выход.
// Контракт: memory/000153.03-floor-transitions.md (D5/D8/D11).
// ============================================================

// 9×9-фикстура с лестницей: герой в центре (4,4) — весь этаж в
// радиусе тумана (R=5, Чебышёв ≤ 4) → mask 2 всюду. exit/entrance
// (1,1), stairsDown (7,7) — РАЗНЫЕ клетки (FLOOR, interior).
function makeStairsState(opts = {}) {
  return makeState(Object.assign({
    width: 9, height: 9, px: 4, py: 4,
    stairsDown: { x: 7, y: 7 },
  }, opts));
}

test('000153.03: «Глубина: N» ТОЛЬКО depth>1 + «До выхода: ~N клеток» (D5) — в подземелье инфо — #hud (000212), панель УБРАНА (000229); город — панели НЕТ СОВСЕМ (000247: re-pin)', () => {
  const loaded = loadDungeonUi({ performance: { now: () => 1000 } });
  const G = loaded.G;
  // 000229: подземелье — панель УБРАНА СОВСЕМ (000212: stateEl;
  // 000229: log + hint): .combat-side/.combat-state — 0 (инфо-окно —
  // #hud, единый helper floorStatusLine).
  const s = makeState({ depth: 2, px: 3, py: 3 });
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 40 });
  assert.equal(allByClass(loaded.body, 'combat-side').length, 0,
    'оверлей: .combat-side НЕТ (000229: панель убрана)');
  assert.equal(allByClass(loaded.body, 'combat-state').length, 0,
    'оверлей: .combat-state НЕТ (000229: hint — вместе с панелью)');
  G.dungeonUI.close();
  // City — панели НЕТ СОВСЕМ (000247) — строки «Глубина» негде
  // рендериться (у layout города depth нет). Своя песочница на фазу
  // (паттерн файла: DOM-стаб remove() — no-op, старый оверлей
  // остался бы в body → allByClass[0] — чужой).
  const loadedC = loadDungeonUi({ performance: { now: () => 1000 } });
  const sC = makeCityState({ fp: 1, cx: -119, cy: -104, name: 'Хутор' });
  loadedC.G.dungeonUI.start({ state: sC, onMove() {}, zoom: 40 });
  assert.equal(allByClass(loadedC.body, 'combat-state').length, 0,
    'city: .combat-state (stateEl) НЕТ (000247: панель убрана — '
    + 'строки «Глубина» негде рендериться): «Глубина» только depth>1');
});

test('000153.03 (RED): hud.js locationLine — ОДИН helper (finding G): dungeon depth=2 — «Глубина: 2» + «~N клеток»; city — побайтово; структурный пин: floorStatusLine в src/hud.js, dungeon-ui.js НЕ содержит (000247)', () => {
  // Структурный пин finding G: ОДИН источник строки — helper из
  // locations.js. 000247: ЕДИНСТВЕННЫЙ потребитель — hud.js
  // (хвост render() dungeon-ui.js с consumer'ом удалён — панель
  // убрана).
  assert.ok(src('hud.js').includes('floorStatusLine'),
    'src/hud.js — читает единый helper floorStatusLine (g.locations)');
  assert.ok(!src('dungeon-ui.js').includes('floorStatusLine'),
    'src/dungeon-ui.js — НЕ содержит floorStatusLine (000247: '
    + 'механизм панели удалён; единый потребитель — hud.js)');
  const hud = require('../src/hud.js');
  const D = require('../src/dungeon.js');
  const L = require('../src/locations.js');
  const g = { DUNGEON_NAMES: D.DUNGEON_NAMES, locations: L };
  // dungeon depth=2: helper-ветка — «\nГлубина: 2\nДо выхода: ~5
  // клеток» (D5; 000212: без рамки и «групп(ы)» — имя в 1-й строке
  // buildLine).
  const ds = {
    kind: 'dungeon',
    dg: { type: 0, exit: { x: 0, y: 0 }, depth: 2 },
    x: 2, y: 3,
    contents: { mobs: [{ defeated: false }, { defeated: true }] },
  };
  assert.equal(hud.locationLine(g, ds),
    '\nГлубина: 2\nДо выхода: ~5 клеток',
    'dungeon depth=2 — побайтово (000212): '
    + JSON.stringify(hud.locationLine(g, ds)));
  // city — ПОБАЙТОВО (pin (k) hud.js.test.js: exit (10,14) — dist 2):
  // helper без «Глубина» даёт те же legacy-байты.
  const dsC = {
    kind: 'city',
    dg: { exit: { x: 10, y: 14 } },
    x: 10, y: 12, name: 'Старый город',
  };
  assert.equal(hud.locationLine(g, dsC),
    '\n--- Старый город (10, 12) ---\nДо выхода: ~2 клеток',
    'city — побайтово (helper = legacy-байты при depth-нет)');
  // dungeon depth=1 — БЕЗ «Глубина» (000212: рамка/счётчик — без).
  const ds1 = {
    kind: 'dungeon',
    dg: { type: 0, exit: { x: 0, y: 0 }, depth: 1 },
    x: 2, y: 3,
    contents: { mobs: [{ defeated: false }, { defeated: false }] },
  };
  assert.equal(hud.locationLine(g, ds1),
    '\nДо выхода: ~5 клеток',
    'dungeon depth=1 — побайтово (000212): '
    + JSON.stringify(hud.locationLine(g, ds1)));
});

test('000153.03: hint depth-aware (D8) — в подземелье УБРАН (000229: панель целиком; строки «Лестница»/«Вход в пещеру» вместе с ней); city — панели НЕТ СОВСЕМ (000247: re-pin)', () => {
  const loaded = loadDungeonUi({ performance: { now: () => 1000 } });
  const G = loaded.G;
  // Подземелье depth ≤ 1 (depth отсутствует — makeState-фикстура):
  // 000229 — панели НЕТ: hint (и depth-aware строки) — вместе с ней.
  G.dungeonUI.start({ state: makeState(), onMove() {}, zoom: 40 });
  assert.equal(allByClass(loaded.body, 'combat-state').length, 0,
    'hint depth≤1: .combat-state (hint) НЕТ (000229: панель убрана)');
  G.dungeonUI.close();
  // Подземелье depth=2 — панели тоже НЕТ. Своя песочница на фазу
  // (паттерн файла: DOM-стаб remove() — no-op, старый оверлей
  // остался бы в body).
  const loaded2 = loadDungeonUi({ performance: { now: () => 1000 } });
  loaded2.G.dungeonUI.start({ state: makeState({ depth: 2 }),
    onMove() {}, zoom: 40 });
  assert.equal(allByClass(loaded2.body, 'combat-state').length, 0,
    'hint depth=2: .combat-state (hint) НЕТ (000229: панель убрана)');
  loaded2.G.dungeonUI.close();
  // Город — панели НЕТ СОВСЕМ (000247): hint отсутствует целиком —
  // строки «Лестница»/«Дверь» негде рендериться.
  const C = loadDungeonUi({ performance: { now: () => 1000 } });
  C.G.dungeonUI.start({
    state: makeCityState({ fp: 2, cx: -114, cy: -119, name: 'Деревня' }),
    onMove() {}, zoom: 48,
  });
  assert.equal(allByClass(C.body, 'combat-state').length, 0,
    'city: .combat-state (hint) НЕТ (000247: панель убрана — '
    + 'без «Лестница»/«Дверь»: hint отсутствует целиком)');
});

test('000153.03 (RED): маркер stairs-down — drawImage stairs.svg на proj(stairsDown) (D11): depth=1 — cave_mouth на exit + stairs на stairsDown (2 маркера, разные клетки); depth=2 — stairs на exit И stairs на stairsDown', () => {
  let { G, body } = loadSpriteDungeon();
  const stairs = G.DUNGEON_PORTAL.stairs;
  const cave = G.DUNGEON_PORTAL.cave_mouth;
  const loader = makeSpriteLoader([stairs, cave]);
  // depth=1: exit (1,1) — cave_mouth; stairsDown (7,7) — stairs.
  G.dungeonUI.start({ state: makeStairsState({ depth: 1 }), onMove() {},
    zoom: 40, spriteLoader: loader });
  let calls = findCanvas(body).drawCalls;
  // 9×9 @ 40: вьюпорт (800/40=20 > 9) покрывает этаж → cam (4.5,4.5).
  const pExit = G.worldToScreen(1, 1, 4.5, 4.5, 40, VW, VH);
  const pStairs = G.worldToScreen(7, 7, 4.5, 4.5, 40, VW, VH);
  const at = (img, x, y) => calls.filter((c) => c[0] === 'drawImage'
    && c[1][0] && c[1][0].__img === img
    && Math.abs(c[1][1] - x) <= 1e-9
    && Math.abs(c[1][2] - y) <= 1e-9
    && Math.abs(c[1][3] - 40) <= 1e-9);
  assert.equal(at(cave, pExit.x, pExit.y).length, 1,
    'depth=1: cave_mouth на exit — 1 (без изменений)');
  assert.equal(at(stairs, pStairs.x, pStairs.y).length, 1,
    'depth=1: маркер stairs-down — drawImage stairs.svg ровно 1 на '
    + 'proj(stairsDown)');
  assert.equal(at(stairs, pExit.x, pExit.y).length, 0,
    'depth=1: на exit — НЕ stairs (cave_mouth)');
  G.dungeonUI.close();
  // depth=2: exit — stairs (ВВЕРХ) + stairsDown — stairs (ВНИЗ) =
  // 2 drawImage stairs.svg в РАЗНЫХ клетках.
  // Своя песочница на фазу — DOM-стаб remove() no-op, findCanvas(body)
  // вернул бы старый canvas из depth=1-фазы.
  const loadedS2 = loadSpriteDungeon();
  G = loadedS2.G;
  body = loadedS2.body;
  G.dungeonUI.start({ state: makeStairsState({ depth: 2 }), onMove() {},
    zoom: 40, spriteLoader: loader });
  calls = findCanvas(body).drawCalls;
  assert.equal(at(stairs, pStairs.x, pStairs.y).length, 1,
    'depth=2: маркер stairs-down — 1');
  assert.equal(at(stairs, pExit.x, pExit.y).length, 1,
    'depth=2: exit — stairs (ВВЕРХ, D11) — 1');
  assert.equal(at(cave, pExit.x, pExit.y).length, 0,
    'depth=2: на exit — НЕ cave_mouth');
  const totalStairs = calls.filter((c) => c[0] === 'drawImage'
    && c[1][0] && c[1][0].__img === stairs).length;
  assert.equal(totalStairs, 2,
    'depth=2: всего 2 drawImage stairs.svg (разные клетки)');
});

test('000153.03 (RED): фолбэк stairs — квадрат #d4b45a (inset 2) + буква «L» #101418 (D11); «E» — только exit-тайл; «X» нигде', () => {
  // Без loader — полные фолбэки (паттерн 000067 без-лоадер).
  const { G, body } = loadSpriteDungeon();
  G.dungeonUI.start({ state: makeStairsState({ depth: 2 }), onMove() {},
    zoom: 40 });
  const calls = findCanvas(body).drawCalls;
  const pExit = G.worldToScreen(1, 1, 4.5, 4.5, 40, VW, VH);
  const pStairs = G.worldToScreen(7, 7, 4.5, 4.5, 40, VW, VH);
  assert.ok(fillRectAt(calls, '#d4b45a', pStairs.x + 2, pStairs.y + 2,
      36, 36),
    'фолбэк stairs: квадрат #d4b45a (inset 2, zoom−4) на proj'
    + '(stairsDown)');
  assert.ok(fillTextNear(calls, 'L', '#101418', pStairs.x + 20,
      pStairs.y + 35, 2),
    'фолбэк stairs: буква «L» (bold zoom−8, низ клетки) #101418');
  assert.ok(fillTextNear(calls, 'E', '#101418', pExit.x + 20,
      pExit.y + 35, 2),
    'фолбэк exit: буква «E» на exit-тайле (без изменений)');
  assert.ok(!calls.some((c) => c[0] === 'fillText' && c[1][0] === 'X'),
    '«X» нигде (000177)');
  const eCount = calls.filter((c) => c[0] === 'fillText'
    && c[1][0] === 'E').length;
  assert.equal(eCount, 1, '«E» — ровно 1 (только exit-тайл)');
});

test('000153.03 (guard): туман-gate stairs-down (D11/D13) — клетка stairsDown вне радиуса/не исследована → маркера НЕТ; exit-маркер без изменений', () => {
  // 9×9, герой (1,1): до (7,7) Чебышёв 6 > R=5 → не видно, не
  // исследовано (start(): explored пуст) → mask 0 → маркера нет.
  const { G, body } = loadSpriteDungeon();
  G.dungeonUI.start({
    state: makeStairsState({ depth: 2, px: 1, py: 1 }), onMove() {},
    zoom: 40,
  });
  const calls = findCanvas(body).drawCalls;
  const pExit = G.worldToScreen(1, 1, 4.5, 4.5, 40, VW, VH);
  const pStairs = G.worldToScreen(7, 7, 4.5, 4.5, 40, VW, VH);
  assert.ok(!fillRectAt(calls, '#d4b45a', pStairs.x + 2, pStairs.y + 2,
      36, 36),
    'туман-gate: фолбэк stairs на НЕИССЛЕДОВАННОЙ клетке — нет');
  assert.ok(!fillTextNear(calls, 'L', '#101418', pStairs.x + 20,
      pStairs.y + 35, 2),
    'туман-gate: буква «L» на НЕИССЛЕДОВАННОЙ клетке — нет');
  assert.ok(!calls.some((c) => c[0] === 'drawImage'
      && c[1][0]
      && Math.abs(c[1][1] - pStairs.x) <= 1e-9
      && Math.abs(c[1][2] - pStairs.y) <= 1e-9),
    'туман-gate: drawImage на НЕИССЛЕДОВАННОЙ клетке — нет');
  // Exit-маркер — на месте (клетка (1,1) видна, бит-в-бит).
  assert.ok(fillTextNear(calls, 'E', '#101418', pExit.x + 20,
      pExit.y + 35, 2),
    'exit-маркер — без изменений (клетка видна)');
});

test('000153.03 (guard): город — drawImage stairs.svg — 0 (D11: !isCity); door — 1 на едином тайле', () => {
  const { G, body } = loadSpriteDungeon();
  const stairs = G.DUNGEON_PORTAL.stairs;
  const door = G.DUNGEON_PORTAL.door;
  const loader = makeSpriteLoader([stairs, door]);
  G.dungeonUI.start({
    state: makeCityState({ fp: 1, cx: -119, cy: -104, name: 'Хутор' }),
    onMove() {}, zoom: 40, spriteLoader: loader,
  });
  const calls = findCanvas(body).drawCalls;
  const pDoor = G.worldToScreen(0, 1, 1, 1, 40, VW, VH);
  const doorAt = calls.filter((c) => c[0] === 'drawImage'
    && c[1][0] && c[1][0].__img === door
    && Math.abs(c[1][1] - pDoor.x) <= 1e-9
    && Math.abs(c[1][2] - pDoor.y) <= 1e-9);
  assert.equal(doorAt.length, 1,
    'город: door — 1 на едином тайле (000177, без изменений)');
  const stairsAt = calls.filter((c) => c[0] === 'drawImage'
    && c[1][0] && c[1][0].__img === stairs);
  assert.equal(stairsAt.length, 0,
    'город: drawImage stairs.svg — 0 (лестниц в городе нет)');
});

// --- 000224: анимированные элементы зданий в ГОРОДЕ (кадр-свитч).
//
// Контракты: memory/000224-building-anim-overlays.md
//   * cityBuildingPath(live, buildingId, now, x, y) — городская ветка
//     того же строгого селектора: анимированный слот (каталожный id
//     4 «Магазин магии» → map_index 3; id 8 «Кузница» → map_index 5)
//     → ТЕКУЩИЙ КАДР G.buildingFrames(slot)[buildingFrameIndex(now,
//     x, y, n)]; кадр не готов → skip (клетка остаётся полом —
//     контракт 000148.02); FALLBACK НА БАЗУ ЗАПРЕЩЁН (строгая
//     семантика, прецедент воды);
//   * детерминизм (D10): два рендера на одном now — идентичны;
//     кадр = f(now, x, y), BUILDING_FRAME_MS = 800.
//
// КРАСНЫЕ (падают на ТЕКУЩЕМ коде, осмысленно — экспорты
// buildingFrames/buildingFrameIndex/BUILDING_FRAME_MS отсутствуют):
//   CU-BA-1: город (деревня 6×6) с магазином магии (id 4) и кузницей
//            (id 8) — на клетках drawImage КАДРА таблицы (не
//            статичной базы), zoom×zoom на угле клетки; рендер через
//            800 мс — кадр ДРУГОЙ (анимация видна); повторный рендер
//            на том же now — идентичен (D10); hex-пол сохранён;
//            errors 0.
//   CU-BA-2: строгая готовность — loader без кадров (ready только
//            статичные базы) → building-спрайта НЕТ (skip, клетка
//            остаётся полом), fallback на базу ЗАПРЕЩЁН, без
//            console.error (тихий гард).
//
// Таблица кадров — ЛИТЕРАЛЫ ниже (не G.buildingFrames): сценарий
// работает даже на RED-стадии, где G.buildingFrames ещё отсутствует.

const BA_FR_MAGIC = [
  'assets/sprites/buildings/magic_shop_1.svg',
  'assets/sprites/buildings/magic_shop_2.svg',
  'assets/sprites/buildings/magic_shop_3.svg',
  'assets/sprites/buildings/magic_shop_4.svg',
];
const BA_FR_BLACK = [
  'assets/sprites/buildings/blacksmith_1.svg',
  'assets/sprites/buildings/blacksmith_2.svg',
  'assets/sprites/buildings/blacksmith_3.svg',
  'assets/sprites/buildings/blacksmith_4.svg',
];

// Деревня 6×6 @ 48 → 288 ≤ 600 → cam центрирован (3,3) (паттерн
// 000148.02). buildings — cityContents.buildings production-форма.
function baCityState(buildings) {
  return makeCityState({ fp: 2, cx: -114, cy: -119, name: 'Деревня',
    cityContents: { buildings, seed: 0 } });
}

// drawImage-вызовы на ТОЧНОМ угле клетки (x, y) размером zoom×zoom.
function baCellDraws(calls, G, x, y, zoom) {
  const p = G.worldToScreen(x, y, 3, 3, zoom, VW, VH);
  return calls.filter((c) => c[0] === 'drawImage'
    && Math.abs(c[1][1] - p.x) <= 1e-9
    && Math.abs(c[1][2] - p.y) <= 1e-9
    && c[1][3] === zoom && c[1][4] === zoom);
}

test('000224 CU-BA-1 (RED): город — магазин магии (id 4) и кузница (id 8) — на клетках КАДР таблицы (не статичная база), zoom×zoom на угле; +800 мс — кадр другой (анимация видна); тот же now — идентично (D10); hex-пол сохранён; errors 0', () => {
  const loaded = loadDungeonUi({ performance: { now: () => 1000 },
    withSprites: true, withBuildings: true });
  const G = loaded.G;
  // Предусловия — контракты кадров (отсутствуют в sprites.js сейчас).
  assert.equal(typeof G.buildingFrames, 'function',
    'sprites.js: экспорт buildingFrames(slot) — отсутствует (Задача 000224)');
  assert.equal(typeof G.buildingFrameIndex, 'function',
    'sprites.js: экспорт buildingFrameIndex(nowMs, tx, ty, n) — отсутствует (Задача 000224)');
  assert.equal(G.BUILDING_FRAME_MS, 800,
    'sprites.js: BUILDING_FRAME_MS = 800 — отсутствует (Задача 000224)');
  // Array.from — технически: G из vm-песочницы, массивы другого
  // realm (Array.prototype ≠) — deepEqual без конверсии не пройдёт.
  assert.deepEqual(Array.from(G.buildingFrames(3)), BA_FR_MAGIC,
    'buildingFrames(3) — кадры магазина магии');
  assert.deepEqual(Array.from(G.buildingFrames(5)), BA_FR_BLACK,
    'buildingFrames(5) — кадры кузницы');
  const s = baCityState([
    { x: 2, y: 2, buildingId: 4 }, // магазин магии → слот 3
    { x: 4, y: 3, buildingId: 8 }, // кузница → слот 5 (фаза ≠ фазе (2,2))
  ]);
  // ВСЁ готово: кадры И статичные базы (строгая семантика: кадр
  // готов — рисуется кадр; база ready — но НЕ фолбэк).
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 48,
    spriteLoader: makeSpriteLoader(
      [...BA_FR_MAGIC, ...BA_FR_BLACK,
       G.buildingSprite(3), G.buildingSprite(5)]) });
  const canvas = findCanvas(loaded.body);
  const n1 = canvas.drawCalls.length;
  const d1m = baCellDraws(canvas.drawCalls.slice(0, n1), G, 2, 2, 48);
  const d1b = baCellDraws(canvas.drawCalls.slice(0, n1), G, 4, 3, 48);
  assert.equal(d1m.length, 1, 'id 4 — building-спрайт на клетке (2,2)');
  assert.equal(d1b.length, 1, 'id 8 — building-спрайт на клетке (4,3)');
  assert.ok(BA_FR_MAGIC.includes(d1m[0][1][0].__img),
    'id 4 — нарисован КАДР таблицы (не статичная база): '
    + d1m[0][1][0].__img);
  assert.notEqual(d1m[0][1][0].__img, G.buildingSprite(3),
    'id 4 — кадр ≠ статичной базе');
  assert.ok(BA_FR_BLACK.includes(d1b[0][1][0].__img),
    'id 8 — нарисован КАДР таблицы (не статичная база): '
    + d1b[0][1][0].__img);
  assert.notEqual(d1b[0][1][0].__img, G.buildingSprite(5),
    'id 8 — кадр ≠ статичной базе');
  // +800 мс (один BUILDING_FRAME_MS) — кадр сменился (анимация видна).
  G.dungeonUI.render(1000 + 800);
  const n2 = canvas.drawCalls.length;
  const seg2 = canvas.drawCalls.slice(n1, n2);
  const d2m = baCellDraws(seg2, G, 2, 2, 48);
  const d2b = baCellDraws(seg2, G, 4, 3, 48);
  assert.equal(d2m.length, 1, 'id 4 — через 800 мс спрайт на месте');
  assert.equal(d2b.length, 1, 'id 8 — через 800 мс спрайт на месте');
  assert.notEqual(d2m[0][1][0].__img, d1m[0][1][0].__img,
    'id 4 — через 800 мс кадр ДРУГОЙ (анимация): ' + d1m[0][1][0].__img
    + ' → ' + d2m[0][1][0].__img);
  assert.notEqual(d2b[0][1][0].__img, d1b[0][1][0].__img,
    'id 8 — через 800 мс кадр ДРУГОЙ (анимация): ' + d1b[0][1][0].__img
    + ' → ' + d2b[0][1][0].__img);
  // D10: повторный рендер на ТОМ ЖЕ now (1000) — идентичен первому.
  G.dungeonUI.render(1000);
  const seg3 = canvas.drawCalls.slice(n2);
  const d3m = baCellDraws(seg3, G, 2, 2, 48);
  const d3b = baCellDraws(seg3, G, 4, 3, 48);
  assert.equal(d3m[0][1][0].__img, d1m[0][1][0].__img,
    'D10: тот же now — тот же кадр (id 4)');
  assert.equal(d3b[0][1][0].__img, d1b[0][1][0].__img,
    'D10: тот же now — тот же кадр (id 8)');
  // Индекс кадра — контрактная формула (зеркало): кадр =
  // frames[buildingFrameIndex(now, клетка.x, клетка.y, n)].
  const i1m = G.buildingFrameIndex(1000, 2, 2, BA_FR_MAGIC.length);
  const i2m = G.buildingFrameIndex(1000 + 800, 2, 2, BA_FR_MAGIC.length);
  const i1b = G.buildingFrameIndex(1000, 4, 3, BA_FR_BLACK.length);
  const i2b = G.buildingFrameIndex(1000 + 800, 4, 3, BA_FR_BLACK.length);
  assert.equal(d1m[0][1][0].__img, BA_FR_MAGIC[i1m],
    'id 4 — кадр = buildingFrameIndex(now, клетка)');
  assert.equal(d2m[0][1][0].__img, BA_FR_MAGIC[i2m],
    'id 4 — +800 мс — индекс шагнул на 1');
  assert.equal(d1b[0][1][0].__img, BA_FR_BLACK[i1b],
    'id 8 — кадр = buildingFrameIndex(now, клетка)');
  assert.equal(d2b[0][1][0].__img, BA_FR_BLACK[i2b],
    'id 8 — +800 мс — индекс шагнул на 1');
  // hex-палитра сохранена (спрайт лежит НА поле, не заменяет его).
  const colors = cityCellColors(canvas.drawCalls, G, s, 48, 3, 3);
  assert.ok(colors['2,2'] && colors['4,3'],
    'пол под постройками нарисован fillRect');
  assert.notEqual(colors['2,2'], '#182029',
    'пол (2,2) — не фолбэк-пол подземелья (hex сохранён)');
  assert.notEqual(colors['4,3'], '#0a0d12',
    'пол (4,3) — не фон «за пределами»');
  assert.equal(loaded.errors.length, 0, 'ошибок нет: ' + loaded.errors.join('; '));
});

test('000224 CU-BA-2 (RED): строгая готовность в городе — loader БЕЗ кадров (ready только статичные базы) → building-спрайта НЕТ (skip, клетка остаётся полом — контракт 000148.02); fallback на базу ЗАПРЕЩЁН; без console.error', () => {
  const loaded = loadDungeonUi({ performance: { now: () => 1000 },
    withSprites: true, withBuildings: true });
  const G = loaded.G;
  assert.equal(typeof G.buildingFrames, 'function',
    'sprites.js: экспорт buildingFrames(slot) — отсутствует (Задача 000224)');
  const s = baCityState([
    { x: 2, y: 2, buildingId: 4 },
    { x: 4, y: 3, buildingId: 8 },
  ]);
  // Только СТАТИЧНЫЕ БАЗЫ готовы — кадры в loader НЕТ.
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 48,
    spriteLoader: makeSpriteLoader(
      [G.buildingSprite(3), G.buildingSprite(5)]) });
  const calls = findCanvas(loaded.body).drawCalls;
  assert.equal(buildingDrawCalls(calls).length, 0,
    'кадры не готовы — building-спрайта НЕТ (строгая семантика: '
    + 'fallback на статичную базу запрещён); сейчас: '
    + buildingDrawCalls(calls).length);
  // Клетки остаются полом (hex-палитра, контракт 000148.02).
  const colors = cityCellColors(calls, G, s, 48, 3, 3);
  assert.ok(colors['2,2'] && colors['4,3'], 'клетки (2,2)/(4,3) — пол');
  assert.notEqual(colors['2,2'], '#182029',
    'пол (2,2) — не фолбэк-пол подземелья');
  assert.notEqual(colors['2,2'], '#0a0d12', 'пол (2,2) — не фон');
  assert.notEqual(colors['4,3'], '#0a0d12', 'пол (4,3) — не фон');
  assert.equal(loaded.errors.length, 0,
    'тихий skip — без console.error: ' + loaded.errors.join('; '));
});

// --- Задача 000238 (СТАДИЯ КРАСНЫХ ТЕСТОВ): расширение анимации на
// слот 2 «Аптекарь» (каталожный id 3, map_index 2). Городской
// канал — cityBuildingPath УЖЕ generic по слоту (000224): новая
// строка BUILDING_FRAMES[2] подхватывается БЕЗ правки dungeon-ui.js
// (ТЗ: «НЕ трогаются: dungeon-ui.js»). Контракт:
// memory/000238-building-anim-extension.md (§4).
//
// КРАСНЫЕ (падают на ТЕКУЩЕМ коде, осмысленно — строка
// BUILDING_FRAMES[2] отсутствует, buildingFrames(2) = null):
//   CU-BA-3: на клетке id 3 — СТАТИЧНАЯ БАЗА apothecary.svg, а не
//            кадр (ассерт «кадр таблицы» падает);
//   CU-BA-4: loader без кадров — рисуется база (fallback), а
//            ожидаемый strict-skip (0 building-drawImage) не
//            случается.

const BA_FR_APOT = [
  'assets/sprites/buildings/apothecary_1.svg',
  'assets/sprites/buildings/apothecary_2.svg',
  'assets/sprites/buildings/apothecary_3.svg',
  'assets/sprites/buildings/apothecary_4.svg',
];
const BA_FR_ACAD = [
  'assets/sprites/buildings/academy_1.svg',
  'assets/sprites/buildings/academy_2.svg',
  'assets/sprites/buildings/academy_3.svg',
  'assets/sprites/buildings/academy_4.svg',
];

test('000238 CU-BA-3 (RED): город — Аптекарь (id 3, слот 2) — на клетке КАДР таблицы (не статичная база apothecary.svg), zoom×zoom на угле; +800 мс — кадр другой (анимация видна); тот же now — идентично (D10); hex-пол сохранён; errors 0', () => {
  const loaded = loadDungeonUi({ performance: { now: () => 1000 },
    withSprites: true, withBuildings: true });
  const G = loaded.G;
  // Предусловия: строка BUILDING_FRAMES[2] (Задача 000238) — 4 кадра.
  assert.ok(Array.isArray(G.buildingFrames(2))
      && G.buildingFrames(2).length === 4,
    'строка BUILDING_FRAMES[2] (Аптекарь) — 4 кадра (Задача 000238)');
  assert.equal(typeof G.buildingFrameIndex, 'function',
    'sprites.js: экспорт buildingFrameIndex(nowMs, tx, ty, n) (000224)');
  assert.deepEqual(Array.from(G.buildingFrames(2)), BA_FR_APOT,
    'buildingFrames(2) — кадры аптекаря');
  const s = baCityState([
    { x: 2, y: 2, buildingId: 3 }, // Аптекарь → слот 2
  ]);
  // ВСЁ готово: кадры И статичная база (строгая семантика).
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 48,
    spriteLoader: makeSpriteLoader(
      [...BA_FR_APOT, G.buildingSprite(2)]) });
  const canvas = findCanvas(loaded.body);
  const n1 = canvas.drawCalls.length;
  const d1 = baCellDraws(canvas.drawCalls.slice(0, n1), G, 2, 2, 48);
  assert.equal(d1.length, 1, 'id 3 — building-спрайт на клетке (2,2)');
  assert.ok(BA_FR_APOT.includes(d1[0][1][0].__img),
    'id 3 — нарисован КАДР таблицы (не статичная база): '
    + d1[0][1][0].__img);
  assert.notEqual(d1[0][1][0].__img, G.buildingSprite(2),
    'id 3 — кадр ≠ статичной базе (' + G.buildingSprite(2) + ')');
  // +800 мс (один BUILDING_FRAME_MS) — кадр сменился (анимация).
  G.dungeonUI.render(1000 + 800);
  const n2 = canvas.drawCalls.length;
  const d2 = baCellDraws(canvas.drawCalls.slice(n1, n2), G, 2, 2, 48);
  assert.equal(d2.length, 1, 'id 3 — через 800 мс спрайт на месте');
  assert.notEqual(d2[0][1][0].__img, d1[0][1][0].__img,
    'id 3 — через 800 мс кадр ДРУГОЙ (анимация): '
    + d1[0][1][0].__img + ' → ' + d2[0][1][0].__img);
  // D10: повторный рендер на ТОМ ЖЕ now (1000) — идентичен.
  G.dungeonUI.render(1000);
  const d3 = baCellDraws(canvas.drawCalls.slice(n2), G, 2, 2, 48);
  assert.equal(d3.length, 1, 'D10: тот же now — спрайт на месте');
  assert.equal(d3[0][1][0].__img, d1[0][1][0].__img,
    'D10: тот же now — тот же кадр (id 3)');
  // Индекс кадра — контрактная формула (зеркало селектора).
  const i1 = G.buildingFrameIndex(1000, 2, 2, BA_FR_APOT.length);
  const i2 = G.buildingFrameIndex(1000 + 800, 2, 2, BA_FR_APOT.length);
  assert.equal(d1[0][1][0].__img, BA_FR_APOT[i1],
    'id 3 — кадр = buildingFrameIndex(now, клетка)');
  assert.equal(d2[0][1][0].__img, BA_FR_APOT[i2],
    'id 3 — +800 мс — индекс шагнул на 1');
  // hex-палитра сохранена (спрайт лежит НА поле, не заменяет его).
  const colors = cityCellColors(canvas.drawCalls, G, s, 48, 3, 3);
  assert.ok(colors['2,2'], 'пол под постройкой нарисован fillRect');
  assert.notEqual(colors['2,2'], '#182029',
    'пол (2,2) — не фолбэк-пол подземелья (hex сохранён)');
  assert.notEqual(colors['2,2'], '#0a0d12',
    'пол (2,2) — не фон «за пределами»');
  assert.equal(loaded.errors.length, 0, 'ошибок нет: ' + loaded.errors.join('; '));
});

test('000238 CU-BA-4 (RED): строгая готовность в городе — Аптекарь (id 3, слот 2), loader БЕЗ кадров (ready только статичная база) → building-спрайта НЕТ (skip, клетка остаётся полом — контракт 000148.02); fallback на базу ЗАПРЕЩЁН; без console.error', () => {
  const loaded = loadDungeonUi({ performance: { now: () => 1000 },
    withSprites: true, withBuildings: true });
  const G = loaded.G;
  assert.ok(Array.isArray(G.buildingFrames(2))
      && G.buildingFrames(2).length === 4,
    'строка BUILDING_FRAMES[2] (Аптекарь) — 4 кадра (Задача 000238)');
  const s = baCityState([
    { x: 2, y: 2, buildingId: 3 }, // Аптекарь → слот 2
  ]);
  // Только СТАТИЧНАЯ БАЗА готова — кадры в loader НЕТ.
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 48,
    spriteLoader: makeSpriteLoader([G.buildingSprite(2)]) });
  const calls = findCanvas(loaded.body).drawCalls;
  assert.equal(buildingDrawCalls(calls).length, 0,
    'кадры не готовы — building-спрайта НЕТ (строгая семантика: '
    + 'fallback на статичную базу запрещён); сейчас: '
    + buildingDrawCalls(calls).length);
  // Клетка остаётся полом (hex-палитра, контракт 000148.02).
  const colors = cityCellColors(calls, G, s, 48, 3, 3);
  assert.ok(colors['2,2'], 'клетка (2,2) — пол');
  assert.notEqual(colors['2,2'], '#182029',
    'пол (2,2) — не фолбэк-пол подземелья');
  assert.notEqual(colors['2,2'], '#0a0d12', 'пол (2,2) — не фон');
  assert.equal(loaded.errors.length, 0,
    'тихий skip — без console.error: ' + loaded.errors.join('; '));
});

test('000238.02 R3 (ретро): город — Аптекарь (id 3, слот 2) и Школа акробатов (id 11, слот 7) — ОБА слота волны в одном тесте (паттерн CU-BA-1): на клетках (2,2)/(4,3) КАДР таблицы (не статичная база), zoom×zoom на угле; +800 мс — кадр другой; тот же now — идентично (D10); hex-пол сохранён; errors 0', () => {
  const loaded = loadDungeonUi({ performance: { now: () => 1000 },
    withSprites: true, withBuildings: true });
  const G = loaded.G;
  assert.ok(Array.isArray(G.buildingFrames(2))
      && G.buildingFrames(2).length === 4,
    'строка BUILDING_FRAMES[2] (Аптекарь) — 4 кадра (Задача 000238)');
  assert.ok(Array.isArray(G.buildingFrames(7))
      && G.buildingFrames(7).length === 4,
    'строка BUILDING_FRAMES[7] (академия) — 4 кадра (Задача 000238)');
  assert.equal(typeof G.buildingFrameIndex, 'function',
    'sprites.js: экспорт buildingFrameIndex(nowMs, tx, ty, n) (000224)');
  assert.deepEqual(Array.from(G.buildingFrames(2)), BA_FR_APOT,
    'buildingFrames(2) — кадры аптекаря');
  assert.deepEqual(Array.from(G.buildingFrames(7)), BA_FR_ACAD,
    'buildingFrames(7) — кадры академии');
  const s = baCityState([
    { x: 2, y: 2, buildingId: 3 }, // Аптекарь → слот 2
    { x: 4, y: 3, buildingId: 11 }, // Школа акробатов → слот 7
  ]);
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 48,
    spriteLoader: makeSpriteLoader(
      [...BA_FR_APOT, ...BA_FR_ACAD,
       G.buildingSprite(2), G.buildingSprite(7)]) });
  const canvas = findCanvas(loaded.body);
  const n1 = canvas.drawCalls.length;
  const d1a = baCellDraws(canvas.drawCalls.slice(0, n1), G, 2, 2, 48);
  const d1b = baCellDraws(canvas.drawCalls.slice(0, n1), G, 4, 3, 48);
  assert.equal(d1a.length, 1, 'id 3 — building-спрайт на клетке (2,2)');
  assert.equal(d1b.length, 1, 'id 11 — building-спрайт на клетке (4,3)');
  assert.ok(BA_FR_APOT.includes(d1a[0][1][0].__img),
    'id 3 — нарисован КАДР таблицы (не статичная база): '
    + d1a[0][1][0].__img);
  assert.notEqual(d1a[0][1][0].__img, G.buildingSprite(2),
    'id 3 — кадр ≠ статичной базе');
  assert.ok(BA_FR_ACAD.includes(d1b[0][1][0].__img),
    'id 11 — нарисован КАДР таблицы (не статичная база): '
    + d1b[0][1][0].__img);
  assert.notEqual(d1b[0][1][0].__img, G.buildingSprite(7),
    'id 11 — кадр ≠ статичной базе');
  // +800 мс (один BUILDING_FRAME_MS) — кадр сменился (анимация видна).
  G.dungeonUI.render(1000 + 800);
  const n2 = canvas.drawCalls.length;
  const seg2 = canvas.drawCalls.slice(n1, n2);
  const d2a = baCellDraws(seg2, G, 2, 2, 48);
  const d2b = baCellDraws(seg2, G, 4, 3, 48);
  assert.equal(d2a.length, 1, 'id 3 — через 800 мс спрайт на месте');
  assert.equal(d2b.length, 1, 'id 11 — через 800 мс спрайт на месте');
  assert.notEqual(d2a[0][1][0].__img, d1a[0][1][0].__img,
    'id 3 — через 800 мс кадр ДРУГОЙ (анимация): ' + d1a[0][1][0].__img
    + ' → ' + d2a[0][1][0].__img);
  assert.notEqual(d2b[0][1][0].__img, d1b[0][1][0].__img,
    'id 11 — через 800 мс кадр ДРУГОЙ (анимация): ' + d1b[0][1][0].__img
    + ' → ' + d2b[0][1][0].__img);
  // D10: повторный рендер на ТОМ ЖЕ now (1000) — идентичен первому.
  G.dungeonUI.render(1000);
  const seg3 = canvas.drawCalls.slice(n2);
  const d3a = baCellDraws(seg3, G, 2, 2, 48);
  const d3b = baCellDraws(seg3, G, 4, 3, 48);
  assert.equal(d3a[0][1][0].__img, d1a[0][1][0].__img,
    'D10: тот же now — тот же кадр (id 3)');
  assert.equal(d3b[0][1][0].__img, d1b[0][1][0].__img,
    'D10: тот же now — тот же кадр (id 11)');
  const i1a = G.buildingFrameIndex(1000, 2, 2, BA_FR_APOT.length);
  const i2a = G.buildingFrameIndex(1000 + 800, 2, 2, BA_FR_APOT.length);
  const i1b = G.buildingFrameIndex(1000, 4, 3, BA_FR_ACAD.length);
  const i2b = G.buildingFrameIndex(1000 + 800, 4, 3, BA_FR_ACAD.length);
  assert.equal(d1a[0][1][0].__img, BA_FR_APOT[i1a],
    'id 3 — кадр = buildingFrameIndex(now, клетка)');
  assert.equal(d2a[0][1][0].__img, BA_FR_APOT[i2a],
    'id 3 — +800 мс — индекс шагнул на 1');
  assert.equal(d1b[0][1][0].__img, BA_FR_ACAD[i1b],
    'id 11 — кадр = buildingFrameIndex(now, клетка)');
  assert.equal(d2b[0][1][0].__img, BA_FR_ACAD[i2b],
    'id 11 — +800 мс — индекс шагнул на 1');
  // hex-палитра сохранена (спрайт лежит НА поле, не заменяет его).
  const colors = cityCellColors(canvas.drawCalls, G, s, 48, 3, 3);
  assert.ok(colors['2,2'] && colors['4,3'],
    'пол под постройками нарисован fillRect');
  assert.notEqual(colors['2,2'], '#182029',
    'пол (2,2) — не фолбэк-пол подземелья (hex сохранён)');
  assert.notEqual(colors['2,2'], '#0a0d12', 'пол (2,2) — не фон');
  assert.notEqual(colors['4,3'], '#182029',
    'пол (4,3) — не фолбэк-пол подземелья (hex сохранён)');
  assert.notEqual(colors['4,3'], '#0a0d12',
    'пол (4,3) — не фон «за пределами»');
  assert.equal(loaded.errors.length, 0, 'ошибок нет: ' + loaded.errors.join('; '));
});

// --- Задача 000238.01 (СТАДИЯ КРАСНЫХ ТЕСТОВ): расширение анимации
// на слот 0 «Оружейная» (каталожный id 1, map_index 0) и слот 11
// «Таверна» (каталожный id 44, map_index 11). Городской канал —
// cityBuildingPath УЖЕ generic по слоту (000224): новые строки
// BUILDING_FRAMES[0]/[11] подхватываются БЕЗ правки dungeon-ui.js
// (ТЗ: «НЕ трогаются: dungeon-ui.js»). Города 51/52/54 — в
// tests/main-visuals.test.js (MV-C5..C8), слоты 0/11 на карте — в
// tests/global-map-draw.test.js (RM-BA-5/6). Контракты:
// memory/000238.01-building-anim-wave2.md (§4, §7).
//
// КРАСНЫЕ (падают на ТЕКУЩЕМ коде, осмысленно — строки
// BUILDING_FRAMES[0]/[11] отсутствуют, buildingFrames(0/11) = null):
//   CU-BA-5: на клетках id 1 / id 44 — СТАТИЧНЫЕ БАЗЫ
//            weapons_shop.svg / tavern.svg, а не кадры (ассерт
//            «кадр таблицы» падает);
//   CU-BA-6: loader без кадров — рисуется база (fallback), а
//            ожидаемый strict-skip (0 building-drawImage) не
//            случается.

const BA_FR_WEAP = [
  'assets/sprites/buildings/weapons_shop_1.svg',
  'assets/sprites/buildings/weapons_shop_2.svg',
  'assets/sprites/buildings/weapons_shop_3.svg',
  'assets/sprites/buildings/weapons_shop_4.svg',
];
const BA_FR_TAV = [
  'assets/sprites/buildings/tavern_1.svg',
  'assets/sprites/buildings/tavern_2.svg',
  'assets/sprites/buildings/tavern_3.svg',
  'assets/sprites/buildings/tavern_4.svg',
];

test('000238.01 CU-BA-5 (RED): город — Оружейная (id 1, слот 0) и Таверна (id 44, слот 11) — на клетках КАДР таблицы (не статичные базы), zoom×zoom на угле; +800 мс — кадры ДРУГИЕ (анимация видна); тот же now — идентично (D10); hex-пол сохранён; errors 0', () => {
  const loaded = loadDungeonUi({ performance: { now: () => 1000 },
    withSprites: true, withBuildings: true });
  const G = loaded.G;
  // Предусловия: строки BUILDING_FRAMES[0]/[11] (Задача 000238.01) —
  // 4 кадра каждая.
  assert.ok(Array.isArray(G.buildingFrames(0))
      && G.buildingFrames(0).length === 4,
    'строка BUILDING_FRAMES[0] (Оружейная) — 4 кадра (Задача 000238.01)');
  assert.ok(Array.isArray(G.buildingFrames(11))
      && G.buildingFrames(11).length === 4,
    'строка BUILDING_FRAMES[11] (Таверна) — 4 кадра (Задача 000238.01)');
  assert.equal(typeof G.buildingFrameIndex, 'function',
    'sprites.js: экспорт buildingFrameIndex(nowMs, tx, ty, n) (000224)');
  assert.deepEqual(Array.from(G.buildingFrames(0)), BA_FR_WEAP,
    'buildingFrames(0) — кадры оружейной');
  assert.deepEqual(Array.from(G.buildingFrames(11)), BA_FR_TAV,
    'buildingFrames(11) — кадры таверны');
  const s = baCityState([
    { x: 2, y: 2, buildingId: 1 }, // Оружейная → слот 0
    { x: 4, y: 4, buildingId: 44 }, // Таверна → слот 11
  ]);
  // ВСЁ готово: кадры И статичные базы (строгая семантика: кадр
  // готов — рисуется кадр; база ready — но НЕ фолбэк).
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 48,
    spriteLoader: makeSpriteLoader(
      [...BA_FR_WEAP, ...BA_FR_TAV,
       G.buildingSprite(0), G.buildingSprite(11)]) });
  const canvas = findCanvas(loaded.body);
  const n1 = canvas.drawCalls.length;
  const d1w = baCellDraws(canvas.drawCalls.slice(0, n1), G, 2, 2, 48);
  const d1t = baCellDraws(canvas.drawCalls.slice(0, n1), G, 4, 4, 48);
  assert.equal(d1w.length, 1, 'id 1 — building-спрайт на клетке (2,2)');
  assert.equal(d1t.length, 1, 'id 44 — building-спрайт на клетке (4,4)');
  assert.ok(BA_FR_WEAP.includes(d1w[0][1][0].__img),
    'id 1 — нарисован КАДР таблицы (не статичная база): '
    + d1w[0][1][0].__img);
  assert.notEqual(d1w[0][1][0].__img, G.buildingSprite(0),
    'id 1 — кадр ≠ статичной базе (' + G.buildingSprite(0) + ')');
  assert.ok(BA_FR_TAV.includes(d1t[0][1][0].__img),
    'id 44 — нарисован КАДР таблицы (не статичная база): '
    + d1t[0][1][0].__img);
  assert.notEqual(d1t[0][1][0].__img, G.buildingSprite(11),
    'id 44 — кадр ≠ статичной базе (' + G.buildingSprite(11) + ')');
  // +800 мс (один BUILDING_FRAME_MS) — кадры сменились.
  G.dungeonUI.render(1000 + 800);
  const n2 = canvas.drawCalls.length;
  const seg2 = canvas.drawCalls.slice(n1, n2);
  const d2w = baCellDraws(seg2, G, 2, 2, 48);
  const d2t = baCellDraws(seg2, G, 4, 4, 48);
  assert.equal(d2w.length, 1, 'id 1 — через 800 мс спрайт на месте');
  assert.equal(d2t.length, 1, 'id 44 — через 800 мс спрайт на месте');
  assert.notEqual(d2w[0][1][0].__img, d1w[0][1][0].__img,
    'id 1 — через 800 мс кадр ДРУГОЙ (анимация): ' + d1w[0][1][0].__img
    + ' → ' + d2w[0][1][0].__img);
  assert.notEqual(d2t[0][1][0].__img, d1t[0][1][0].__img,
    'id 44 — через 800 мс кадр ДРУГОЙ (анимация): ' + d1t[0][1][0].__img
    + ' → ' + d2t[0][1][0].__img);
  // D10: повторный рендер на ТОМ ЖЕ now (1000) — идентичен.
  G.dungeonUI.render(1000);
  const seg3 = canvas.drawCalls.slice(n2);
  const d3w = baCellDraws(seg3, G, 2, 2, 48);
  const d3t = baCellDraws(seg3, G, 4, 4, 48);
  assert.equal(d3w[0][1][0].__img, d1w[0][1][0].__img,
    'D10: тот же now — тот же кадр (id 1)');
  assert.equal(d3t[0][1][0].__img, d1t[0][1][0].__img,
    'D10: тот же now — тот же кадр (id 44)');
  // Индекс кадра — контрактная формула (зеркало селектора).
  const i1w = G.buildingFrameIndex(1000, 2, 2, BA_FR_WEAP.length);
  const i2w = G.buildingFrameIndex(1000 + 800, 2, 2, BA_FR_WEAP.length);
  const i1t = G.buildingFrameIndex(1000, 4, 4, BA_FR_TAV.length);
  const i2t = G.buildingFrameIndex(1000 + 800, 4, 4, BA_FR_TAV.length);
  assert.equal(d1w[0][1][0].__img, BA_FR_WEAP[i1w],
    'id 1 — кадр = buildingFrameIndex(now, клетка)');
  assert.equal(d2w[0][1][0].__img, BA_FR_WEAP[i2w],
    'id 1 — +800 мс — индекс шагнул на 1');
  assert.equal(d1t[0][1][0].__img, BA_FR_TAV[i1t],
    'id 44 — кадр = buildingFrameIndex(now, клетка)');
  assert.equal(d2t[0][1][0].__img, BA_FR_TAV[i2t],
    'id 44 — +800 мс — индекс шагнул на 1');
  // hex-палитра сохранена (спрайт лежит НА поле, не заменяет его).
  const colors = cityCellColors(canvas.drawCalls, G, s, 48, 3, 3);
  assert.ok(colors['2,2'] && colors['4,4'],
    'пол под постройками нарисован fillRect');
  assert.notEqual(colors['2,2'], '#182029',
    'пол (2,2) — не фолбэк-пол подземелья (hex сохранён)');
  assert.notEqual(colors['4,4'], '#0a0d12',
    'пол (4,4) — не фон «за пределами»');
  assert.equal(loaded.errors.length, 0, 'ошибок нет: ' + loaded.errors.join('; '));
});

test('000238.01 CU-BA-6 (RED): строгая готовность в городе — Оружейная (id 1, слот 0) + Таверна (id 44, слот 11), loader БЕЗ кадров (ready только статичные базы) → building-спрайтов НЕТ (skip, клетки остаются полом — контракт 000148.02); fallback на базу ЗАПРЕЩЁН; без console.error', () => {
  const loaded = loadDungeonUi({ performance: { now: () => 1000 },
    withSprites: true, withBuildings: true });
  const G = loaded.G;
  assert.ok(Array.isArray(G.buildingFrames(0))
      && G.buildingFrames(0).length === 4,
    'строка BUILDING_FRAMES[0] (Оружейная) — 4 кадра (Задача 000238.01)');
  assert.ok(Array.isArray(G.buildingFrames(11))
      && G.buildingFrames(11).length === 4,
    'строка BUILDING_FRAMES[11] (Таверна) — 4 кадра (Задача 000238.01)');
  const s = baCityState([
    { x: 2, y: 2, buildingId: 1 }, // Оружейная → слот 0
    { x: 4, y: 4, buildingId: 44 }, // Таверна → слот 11
  ]);
  // Только СТАТИЧНЫЕ БАЗЫ готовы — кадры в loader НЕТ.
  G.dungeonUI.start({ state: s, onMove() {}, zoom: 48,
    spriteLoader: makeSpriteLoader(
      [G.buildingSprite(0), G.buildingSprite(11)]) });
  const calls = findCanvas(loaded.body).drawCalls;
  assert.equal(buildingDrawCalls(calls).length, 0,
    'кадры не готовы — building-спрайтов НЕТ (строгая семантика: '
    + 'fallback на статичные базы запрещён); сейчас: '
    + buildingDrawCalls(calls).length);
  // Клетки остаются полом (hex-палитра, контракт 000148.02).
  const colors = cityCellColors(calls, G, s, 48, 3, 3);
  assert.ok(colors['2,2'] && colors['4,4'], 'клетки (2,2)/(4,4) — пол');
  assert.notEqual(colors['2,2'], '#182029',
    'пол (2,2) — не фолбэк-пол подземелья');
  assert.notEqual(colors['2,2'], '#0a0d12', 'пол (2,2) — не фон');
  assert.notEqual(colors['4,4'], '#0a0d12', 'пол (4,4) — не фон');
  assert.equal(loaded.errors.length, 0,
    'тихий skip — без console.error: ' + loaded.errors.join('; '));
});

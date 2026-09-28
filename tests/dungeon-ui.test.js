// Управление в подземелье через маппинг src/controls.js (задача 000043).
//
// Браузерный модуль dungeon-ui.js исполняется в vm-песочнице с
// минимальным DOM-стабом (паттерн tests/combat-ui.test.js: скрипты
// игры — обычные <script>, каждый собирает globalThis.Game; в песочнице
// `module` нет, UMD-модули идут браузерной веткой).
//
// КРАСНЫЕ (падают до реализации, зелёные после):
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
// Каждый ВЫЗОВ метода — в el.drawCalls как [имя, args].
function makeContext2d(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
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
    addEventListener(type, fn) {
      (this.listeners[type] || (this.listeners[type] = [])).push(fn);
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
//     index.html (проверка «бой выше по стеку»).
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
    addEventListener: (type, fn) => { if (type === 'keydown') keydown.push(fn); },
  };
  const sandbox = {
    console: { error: (m) => errors.push(String(m)) },
    document, window,
  };
  vm.createContext(sandbox);
  const chain = ['global-settings.js', 'perlin.js', 'map.js'];
  if (!opts.withoutControls) chain.push('controls.js');
  if (opts.withCombat) {
    chain.push('skills-data.js', 'items-data.js', 'player.js', 'items.js',
      'combat.js', 'combat-keys.js', 'combat-ui.js');
  }
  chain.push('dungeon.js', 'dungeon-ui.js');
  for (const f of chain) vm.runInContext(src(f), sandbox, { filename: f });
  return { G: sandbox.Game, keydown, body: document.body, errors };
}

// Минимальное состояние подземелья — форма main.js (maybeEnterDungeon):
// { dg, contents, x, y, log }. Ядро createDungeon не вызываем (покрыто
// tests/dungeon.test.js); 5×5, стены по периметру, пол внутри.
function makeState() {
  return {
    dg: {
      type: 0, // DUNGEON_TYPES.CAVE → G.DUNGEON_NAMES[0]
      width: 5, height: 5,
      cells: [
        0, 0, 0, 0, 0,
        0, 1, 1, 1, 0,
        0, 1, 1, 1, 0,
        0, 1, 1, 1, 0,
        0, 0, 0, 0, 0,
      ],
      entrance: { x: 1, y: 1 },
      exit: { x: 3, y: 3 },
    },
    contents: { chests: [], mobs: [] },
    x: 1, y: 1,
    log: ['простая пещера: вход.'],
  };
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

// Задача 000376 — скрытие экранного d-pad (.tc-dpad) на время активного
// окна расстановки перед боем (контракт 000260; движение в расстановке
// уже перехвачено 000305 — контрол лишь перекрывает угловые клетки).
//
// КРАСНЫЕ тесты (TDD, RED до правки). На текущем коде (база e90bc26e):
//   * ui.js: Game.touchControls.setDpadSuppressed ОТСУТСТВУЕТ (grep по
//     src/ пуст) — D1/D2 падают на typeof-гарде (осмысленный
//     ERR_ASSERTION, не TypeError);
//   * combat-ui.js: ни одна точка не уведомляет о окне расстановки —
//     spy-вызовов нет (D3/D4), в e2e d-pad видим в расстановке
//     (D6/D7/D8 падают display !== 'none');
//   * D5/D9 — guard-пины (зелёные в ОБЕИХ фазах): деградация mixed-
//     версий и неизменность чистого предиката touchControlsVisibility
//     (Т2) + applyVisibility без подавления.
//
// Механизм (утверждённый контракт): ортогональный флаг dpadSuppressed в
// ui.js-каскаде — applyVisibility пишет dpad как (parts.dpad &&
// !dpadSuppressed); combat-ui уведомляет ОТКРЫТИЕ (build, placeOpen=
// true) и ЗАКРЫТИЯ (closePlacementWindow — все выходы 000260 через неё;
// finish и catch startCombat — обе точки teardown 000170) через
// liveGame().touchControls.setDpadSuppressed (UMD-замена Game 000038 —
// только ленивое чтение видит поздние потребителей, motion-паттерн).
// Чистый предикат controls.js и клей main.js — 0-diff (Т2).
//
// Три слоя: A — минимальный vm ui.js (D1/D2, паттерн bootMinimalVm
// ui-touch-visibility.test.js); B — цепь combat-ui.test.js без ui.js +
// spy G.touchControls (D3/D4/D5, матрица вызовов); C — e2e полная цепь
// index.html ?controls=touch (D6/D7/D8, паттерн bootTouch/frameMain).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const controlsCode = src('controls.js');
const uiCode = src('ui.js');
// node-ветка UMD (паттерн ui-touch-visibility): деструктуризация в
// шапке невозможна — падение при загрузке файла, а не в тесте.
const C = require('../src/controls.js');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(
  html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));

// ---------------------------------------------------------------------------
// Слой A — минимальный vm (controls.js + ui.js), паттерн bootMinimalVm
// (tests/ui-touch-visibility.test.js:150-200; дублирование стабов
// принято — 000083/000087).
// ---------------------------------------------------------------------------

function stubEl376(tag) {
  const n = {
    tagName: tag,
    className: '',
    textContent: '',
    id: '',
    style: {},
    children: [],
    listeners: {},
    classList: { add() {}, remove() {} },
    appendChild(ch) { n.children.push(ch); return ch; },
    addEventListener(type, fn) {
      (n.listeners[type] || (n.listeners[type] = [])).push(fn);
    },
    removeEventListener() {},
    setAttribute() {},
    blur() {},
  };
  return n;
}

function bootMinimalVm376(dpadFlag) {
  const errors = [];
  const body = stubEl376('body');
  const sandbox = {
    console: { error: (m) => errors.push(String(m)), log() {} },
    document: {
      createElement: (tag) => stubEl376(tag),
      body,
      addEventListener() {},
      removeEventListener() {},
      querySelector: () => null,
      hidden: false,
    },
    window: {
      innerWidth: 1280,
      innerHeight: 720,
      addEventListener() {},
      removeEventListener() {},
    },
  };
  sandbox.Game = {};
  vm.createContext(sandbox);
  vm.runInContext(controlsCode, sandbox, { filename: 'controls.js' });
  vm.runInContext(uiCode, sandbox, { filename: 'ui.js' });
  const tc = sandbox.Game.touchControls;
  tc.init({ dpad: dpadFlag });
  tc.show();
  const root = body.children.find((c) => c.id === 'touch-controls');
  return { errors, tc, root };
}

test('000376-D1: touchControls.setDpadSuppressed — скрытие/restaurация d-pad, идемпотентность, строгий === true, keyboard-схема не крахнет', () => {
  const m = bootMinimalVm376(true);
  assert.equal(m.errors.length, 0,
    'ошибок загрузки нет: ' + m.errors.join('; '));
  assert.equal(typeof m.tc.setDpadSuppressed, 'function',
    'RED: поверхность touchControls несёт setDpadSuppressed (000376)');
  const [dpad, action] = m.root.children;
  assert.equal(dpad.className, 'tc-dpad', 'child 0 — D-pad');
  // Подавление — d-pad скрыт (инлайн display по конвенции 000150).
  m.tc.setDpadSuppressed(true);
  assert.equal(dpad.style.display, 'none',
    'подавление: d-pad скрыт (display none)');
  // Повтор — без исключений, состояние сохраняется.
  m.tc.setDpadSuppressed(true);
  assert.equal(dpad.style.display, 'none',
    'идемпотентно: остаётся скрыт');
  // Снятие — возврат КАСКАДА ('', не 'block' — конвенция 000150).
  m.tc.setDpadSuppressed(false);
  assert.equal(dpad.style.display, '',
    'снятие: restore — пустая строка (каскад, 000150)');
  // Строгая нормализация: не-true значения НЕ подавляют.
  for (const junk of ['yes', 1, {}, [], 'true']) {
    m.tc.setDpadSuppressed(junk);
    assert.notEqual(dpad.style.display, 'none',
      'не-true → БЕЗ подавления: ' + JSON.stringify(junk));
    m.tc.setDpadSuppressed(false);
  }
  // Кнопки подавлением НЕ затронуты (только d-pad — ТЗ).
  m.tc.setDpadSuppressed(true);
  assert.notEqual(action.style.display, 'none',
    'кнопка [E] подавлением НЕ скрыта (d-pad — единственный)');
  m.tc.setDpadSuppressed(false);
  // Keyboard-схема (dpadEl === null): метод есть, НЕ крах (000123).
  const m2 = bootMinimalVm376(false);
  assert.equal(typeof m2.tc.setDpadSuppressed, 'function',
    'keyboard-схема: setDpadSuppressed доступен');
  assert.doesNotThrow(() => { m2.tc.setDpadSuppressed(true); },
    'keyboard: подавление — no-op без dpadEl, не крах');
  assert.doesNotThrow(() => { m2.tc.setDpadSuppressed(false); },
    'keyboard: снятие — no-op без dpadEl, не крах');
  assert.equal(m2.root.children[0].className, 'tc-action',
    'keyboard: children — кнопки (dpad не строился)');
});

test('000376-D2: композиция с applyVisibility — скрытие переживает кадры, ресторант уважает предикат экрана, кнопки не затронуты', () => {
  const m = bootMinimalVm376(true);
  assert.equal(m.errors.length, 0,
    'ошибок загрузки нет: ' + m.errors.join('; '));
  assert.equal(typeof m.tc.setDpadSuppressed, 'function',
    'RED: setDpadSuppressed на поверхности (000376)');
  const [dpad, action, inventory, squad, spellbook] = m.root.children;
  const hidden = (e) => e.style.display === 'none';
  // Кадр боя (предикат: dpad живой) БЕЗ подавления — видим.
  m.tc.applyVisibility({ buttons: false, dpad: true });
  assert.notEqual(dpad.style.display, 'none',
    'бой без расстановки: d-pad видим (предикат 000150)');
  assert.ok(hidden(action), 'бой: [E] скрыта (единица buttons)');
  // Подавление ПОВЕРХ боя — d-pad скрыт, buttons-состояние не изменилось.
  m.tc.setDpadSuppressed(true);
  assert.equal(dpad.style.display, 'none',
    'расстановка в бою: d-pad скрыт');
  assert.ok(hidden(action),
    'подавление НЕ показывает кнопки (boj: скрыты)');
  // КАСКАД КАДРА ПРИ СМЕНЕ buttons: applyVisibility обязан пересобрать
  // dpad как (dpad && !suppressed) — иначе кадр с изменением buttons
  // перезаписал бы '' поверх скрытия (мутация M6).
  m.tc.applyVisibility({ buttons: true, dpad: true });
  assert.notEqual(action.style.display, 'none',
    'смена buttons: [E] восстановлена');
  assert.equal(dpad.style.display, 'none',
    'смена buttons НЕ показывает подавленный d-pad (композиция)');
  assert.notEqual(squad.style.display, 'none',
    'смена buttons: «Отряд» восстановлен');
  assert.notEqual(spellbook.style.display, 'none',
    'смена buttons: книга восстановлена');
  // Экран инвентаря поверх подавления (предикат dpad=false) — скрыто.
  m.tc.applyVisibility({ buttons: false, dpad: false });
  assert.equal(dpad.style.display, 'none', 'инвентарь+подавление: скрыт');
  // Снятие подавления ПРИ dpad=false (инвентарь) — остаётся 'none':
  // ресторант обязан уважать parts.dpad (мутация M7 ловится здесь).
  m.tc.setDpadSuppressed(false);
  assert.equal(dpad.style.display, 'none',
    'снятие подавления при инвентаре: d-pad СКРЫТ предикатом (000150)');
  // Возврат в мир — всё видимо.
  m.tc.applyVisibility({ buttons: true, dpad: true });
  assert.notEqual(dpad.style.display, 'none',
    'мир: d-pad восстановлен полностью');
  assert.notEqual(action.style.display, 'none', 'мир: [E] видима');
  // Обратный порядок: сначала кадр скрыл (инвентарь), потом подавление —
  // снятие при открытой панели НЕ показывает.
  m.tc.applyVisibility({ buttons: false, dpad: false });
  m.tc.setDpadSuppressed(true);
  m.tc.applyVisibility({ buttons: true, dpad: false });
  m.tc.setDpadSuppressed(false);
  assert.equal(dpad.style.display, 'none',
    'подавление + dpad=false: снятие не показывает (композиция)');
  m.tc.applyVisibility({ buttons: true, dpad: true });
  assert.notEqual(dpad.style.display, 'none',
    'мир (после полной разгрузки): d-pad видим');
  // Подавление при МИРЕ — только d-pad, все кнопки видны (M8).
  m.tc.setDpadSuppressed(true);
  assert.equal(dpad.style.display, 'none', 'мир+подавление: d-pad скрыт');
  for (const btn of [action, inventory, squad, spellbook]) {
    assert.notEqual(btn.style.display, 'none',
      'подавление d-pad НЕ трогает кнопки: ' + btn.className);
  }
  m.tc.setDpadSuppressed(false);
  assert.notEqual(dpad.style.display, 'none',
    'всё снято: d-pad видим');
});

// ---------------------------------------------------------------------------
// Слой B — цепь combat-ui (паттерн tests/combat-ui.test.js loadCombatUi,
// ui.js В ЦЕПИ НЕТ): G.touchControls подменяется spy-объектом ДО
// startCombat; матрица вызовов setDpadSuppressed по всем точкам
// открытия/закрытия окна 000260 (+ teardown-точки 000170).
// ---------------------------------------------------------------------------

function make2dStub376() {
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : () => undefined),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

function makeP376El(tag, buttons, opts = {}) {
  const el = {
    tagName: tag,
    className: '',
    textContent: '',
    title: '',
    disabled: false,
    style: {
      setProperty() {}, getPropertyValue: () => '', removeProperty() {},
    },
    dataset: {},
    children: [],
    listeners: {},
    appendChild(ch) {
      el.children.push(ch);
      ch.parentElement = el;
      return ch;
    },
    remove() {},
    addEventListener(type, fn) {
      (el.listeners[type] || (el.listeners[type] = [])).push(fn);
    },
    removeEventListener() {},
    querySelectorAll() { return buttons; },
    querySelector() { return null; },
    closest() { return null; },
    setAttribute() {},
    getBoundingClientRect() {
      return { left: 0, top: 0, width: el.width, height: el.height };
    },
    blur() {},
  };
  if (tag === 'canvas') {
    el.width = 0;
    el.height = 0;
    el.getContext = () => {
      if (opts.poisonContext) throw new Error('000376 poison getContext');
      return make2dStub376();
    };
  }
  return el;
}

// Цепь — зеркало loadCombatUi (без sprites-веток не обходится: render
// синхронен в startCombat): sprites.js + combat-scale.js ПЕРЕД
// combat-ui.js, motion.js ПОСЛЕ (index.html).
function loadPlacement376(opts = {}) {
  const keydown = [];
  const buttons = [];
  const document = {
    createElement: (tag) => {
      const el = makeP376El(tag, buttons, opts);
      if (tag === 'button') buttons.push(el);
      return el;
    },
    body: makeP376El('body', buttons, opts),
  };
  const window = {
    addEventListener: (type, fn) => {
      if (type === 'keydown') keydown.push(fn);
    },
    removeEventListener() {},
  };
  const sandbox = {
    console: { error() {}, log() {}, warn() {} },
    document,
    window,
  };
  vm.createContext(sandbox);
  for (const f of [
    'global-settings.js', 'perlin.js', 'map.js', 'skills-data.js',
    'items-data.js', 'sheet.js', 'player.js', 'items.js', 'controls.js',
    'combat.js', 'combat-keys.js', 'spellbook.js', 'sprites.js',
    'combat-scale.js', 'combat-ui.js', 'motion.js',
  ]) {
    vm.runInContext(src(f), sandbox, { filename: f });
  }
  return { G: sandbox.Game, keydown, buttons, body: document.body };
}

function findByClass376(el, cls) {
  if (String(el.className).split(/\s+/).includes(cls)) return el;
  for (const ch of el.children || []) {
    const found = findByClass376(ch, cls);
    if (found) return found;
  }
  return null;
}

function findCanvas376(el) {
  if (el.tagName === 'canvas') return el;
  for (const ch of el.children || []) {
    const found = findCanvas376(ch);
    if (found) return found;
  }
  return null;
}

function press376(keydown, code) {
  const e = { code, preventDefault() {}, stopPropagation() {} };
  for (const fn of keydown) fn(e);
}

// spy-сцена: touchControls-заглушка пишется на ФИНАЛЬНЫЙ Game (после
// UMD-замены motion.js) — combat-ui обязан читать его лениво
// (liveGame), паттерн 000038/000174.
function scene376(opts = {}) {
  const H = loadPlacement376(opts);
  const calls = [];
  if (opts.spy === undefined) {
    H.G.touchControls = {
      setDpadSuppressed(on) { calls.push(on === true); },
    };
  } else if (opts.spy !== 'none') {
    H.G.touchControls = opts.spy;
  }
  H.calls = calls;
  H.c = H.G.combatUI.startCombat({
    hero: H.G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  return H;
}

const winVictory376 = (G, c) => {
  for (const m of c.units.filter((x) => x.side === 'mob' && x.alive)) {
    G.combatInternals.dealDamageToMob(c, m, 9999);
  }
  assert.ok(c.result && c.result.outcome === 'victory',
    'победа (win-mobs): ' + JSON.stringify(c.result));
};

test('000376-D3: матрица уведомлений — старт [true]; Enter/«В бой»/действие/побег/result/finish → false; НЕ-выходы (reset/Escape/шаг/отказ/клик-по-мобу) — без новых вызовов', () => {
  // (0) Открытие окна ровно одно: placeOpen=true в build().
  {
    const H = scene376();
    assert.ok(H.c, 'бой создан');
    assert.deepEqual(H.calls, [true], 'startCombat: ровно [true]');
  }
  // (1) Enter — подтверждение.
  {
    const H = scene376();
    press376(H.keydown, 'Enter');
    assert.deepEqual(H.calls, [true, false], 'Enter → false');
    assert.equal(H.G.combatUI.isActive(), true,
      'Enter: бой продолжается (окно — не конец боя)');
  }
  // (2) «В бой» — клик.
  {
    const H = scene376();
    findByClass376(H.body, 'combat-placebar-btn--go')
      .listeners.click[0]();
    assert.deepEqual(H.calls, [true, false], 'клик «В бой» → false');
  }
  // (3) Принятое действие (Space = endTurn) закрывает окно (000260).
  {
    const H = scene376();
    press376(H.keydown, 'Space');
    assert.deepEqual(H.calls, [true, false], 'Space (действие) → false');
  }
  // (4) Побег: F — принятое действие (окно закрывает :1262-путь), «да»
  //     (:706) вызывает closePlacementWindow повторно — ранний return
  //     по !placeOpen НЕ порождает лишних уведомлений.
  {
    const H = scene376();
    press376(H.keydown, 'KeyF');
    assert.deepEqual(H.calls, [true, false],
      'F (побег — принятое действие) → false');
    const yes = findByClass376(H.body, 'combat-flee-btn--yes');
    assert.ok(yes, 'прекон: панель подтверждения побега собрана');
    yes.listeners.click[0]();
    assert.deepEqual(H.calls, [true, false],
      '«да» побега: закрытое окно — без лишних вызовов (ранний return)');
  }
  // (5) result-ветка closePlacementWindow (окно живо при готовом
  //     результате — победе через ядро без действий UI).
  {
    const H = scene376();
    winVictory376(H.G, H.c);
    assert.deepEqual(H.calls, [true],
      'победа ядром — окно НЕ закрыто сама собой');
    findByClass376(H.body, 'combat-placebar-btn--go').listeners.click[0]();
    assert.deepEqual(H.calls, [true, false],
      'result-ветка → false (ранний return после нотификации)');
  }
  // (6) finish (Space после боя) — точка teardown 000170.
  {
    const H = scene376();
    winVictory376(H.G, H.c);
    press376(H.keydown, 'Space');
    assert.equal(H.G.combatUI.isActive(), false, 'Space → finish');
    assert.deepEqual(H.calls, [true, false],
      'finish при незакрытой расстановке → false');
  }
  // (7) НЕ-выходы: ни одного нового вызова, бой тот же.
  const noExits = [
    ['«По умолчанию» (reset)', (H) => {
      findByClass376(H.body, 'combat-placebar-btn--reset')
        .listeners.click[0]();
    }],
    ['Escape без выбора', (H) => press376(H.keydown, 'Escape')],
    ['шаг в расстановке (000305)', (H) => press376(H.keydown, 'ArrowUp')],
    ['отклонённое действие (KeyE, слоты пусты)', (H) => {
      press376(H.keydown, 'KeyE');
    }],
    ['клик по клетке моба (выбор цели)', (H) => {
      const m = H.c.units.find((x) => x.side === 'mob' && x.alive);
      assert.ok(m, 'фикстура: живой моб');
      findCanvas376(H.body).listeners.click[0]({
        clientX: (m.x + 0.5) * 48, clientY: (m.y + 0.5) * 48 });
    }],
  ];
  for (const [label, act] of noExits) {
    const H = scene376();
    act(H);
    assert.deepEqual(H.calls, [true],
      'НЕ-выход («' + label + '»): новых вызовов нет');
    assert.equal(H.G.combatUI.current(), H.c,
      'НЕ-выход («' + label + '»): бой не пересоздан');
    assert.equal(H.G.combatUI.isActive(), true,
      'НЕ-выход («' + label + '»): бой активен');
  }
});

test('000376-D4: catch startCombat (исключение build после placeOpen=true) — restoration false на teardown-точке 000170', () => {
  const H = scene376({ poisonContext: true });
  assert.equal(H.c, null,
    'фикстура: build бросил (canvas.getContext) → startCombat вернул null');
  assert.equal(H.G.combatUI.isActive(), false,
    '000170: активного состояния не осталось');
  assert.deepEqual(H.calls, [true, false],
    'catch: [true на placeOpen, false на teardown]');
});

test('000376-D5: деградация mixed-версий — touchControls без setDpadSuppressed (и без touchControls вовсе) → старт и выходы НЕ бросают, бой живёт', () => {
  for (const spy of [{}, 'none']) {
    const label = spy === 'none' ? 'нет G.touchControls'
      : 'touchControls без нового метода';
    const H = loadPlacement376();
    if (spy !== 'none') H.G.touchControls = spy;
    let c = null;
    assert.doesNotThrow(() => {
      c = H.G.combatUI.startCombat({
        hero: H.G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
      });
    }, label + ': startCombat не бросает');
    assert.ok(c, label + ': бой создан');
    assert.doesNotThrow(() => press376(H.keydown, 'Enter'),
      label + ': Enter не бросает');
    winVictory376(H.G, H.G.combatUI.current());
    assert.doesNotThrow(() => press376(H.keydown, 'Space'),
      label + ': finish не бросает');
    assert.equal(H.G.combatUI.isActive(), false,
      label + ': бой корректно закрыт');
  }
});

// ---------------------------------------------------------------------------
// Слой C — e2e ПОЛНАЯ цепь index.html (?controls=touch), паттерн
// bootSandbox/frameMain/touchDom/resolveCombatVictory из
// tests/ui-touch-visibility.test.js:310-540 (дублирование стабов
// принято — 000083/000087).
// ---------------------------------------------------------------------------

const NOW = 1000;

function makeGl376() {
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
  gl.bufferData = noop;
  gl.vertexAttribPointer = noop;
  gl.viewport = noop;
  gl.clearColor = noop;
  gl.clear = noop;
  gl.uniformMatrix4fv = noop;
  gl.drawArrays = noop;
  return gl;
}

function makeContext2d376(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

function makeEl376(tag) {
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
      ? makeContext2d376(target) : null);
  }
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return () => undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function bootSandbox376() {
  const winListeners = {};
  const raf = [];
  const errors = [];
  const gameCanvas = makeEl376('canvas');
  const spriteCanvas = makeEl376('canvas');
  const hud = makeEl376('div');
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl376() : makeContext2d376(gameCanvas));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? makeContext2d376(spriteCanvas) : null);
  const document = {
    createElement: (tag) => makeEl376(tag),
    getElementById: (id) => (
      id === 'game' ? gameCanvas
        : id === 'sprites' ? spriteCanvas
          : id === 'hud' ? hud
            : null
    ),
    body: makeEl376('body'),
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    hidden: false,
  };
  const window = {
    innerWidth: 1280,
    innerHeight: 720,
    location: { search: '?controls=touch' },
    addEventListener: (t, f) => {
      (winListeners[t] || (winListeners[t] = [])).push(f);
    },
    removeEventListener() {},
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
      warn: () => {},
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
    vm.runInContext(src(f), sandbox, { filename: f });
  }
  return { sandbox, winListeners, raf, errors };
}

const drain376 = () => new Promise((r) => setImmediate(r));

async function bootTouch376() {
  const h = bootSandbox376();
  for (let i = 0; i < 3; i++) await drain376();
  return h;
}

function frameMain376(h) {
  h.raf[0](NOW);
}

function touchDom376(documentStub) {
  const root = documentStub.body.children
    .find((c) => c.id === 'touch-controls');
  assert.ok(root, 'сценарий: #touch-controls в body (init при загрузке)');
  assert.equal(root.children.length, 5,
    'touch-схема — children [dpad, action, inventory, squad, spellbook]');
  const [dpad, action, inventory, squad, spellbook] = root.children;
  assert.equal(dpad.className, 'tc-dpad', 'child 0 — D-pad');
  assert.equal(action.className, 'tc-action', 'child 1 — кнопка [E]');
  assert.equal(inventory.className, 'tc-action', 'child 2 — кнопка [I]');
  return { root, dpad, action, inventory, squad, spellbook };
}

function findByClassE2e(el, cls) {
  if (String(el.className).split(/\s+/).includes(cls)) return el;
  for (const ch of el.children || []) {
    const found = findByClassE2e(ch, cls);
    if (found) return found;
  }
  return null;
}

test('000376-D6: e2e — старт боя (окно расстановки): d-pad скрыт СКВОЗЬ КАДР; кнопки [E]/[I] скрыты как раньше; Enter + кадр — d-pad восстановлен, бой жив', async () => {
  const h = await bootTouch376();
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.ok(g, '__game (main.js выполнен)');
  assert.equal(g.state.controls, 'touch',
    'сценарий: принудительная схема ?controls=touch (dpad в DOM)');
  const { dpad, action, inventory } = touchDom376(h.sandbox.document);
  for (const e of [dpad, action, inventory]) {
    assert.notEqual(e.style.display, 'none',
      'до боя — видимо: ' + e.className);
  }
  const c = g.actions.startCombat(0);
  assert.ok(c, 'отладочный бой создан');
  assert.equal(G.combatUI.isActive(), true, 'прекон: бой активен');
  frameMain376(h);
  assert.equal(action.style.display, 'none', 'бой: кнопка [E] скрыта');
  assert.equal(inventory.style.display, 'none', 'бой: кнопка [I] скрыта');
  // ГЛАВНЫЙ RED-ассерт: расстановка открыта в КАЖДОМ старте боя
  // (контракт 000260) — d-pad скрыт, кадр (applyVisibility dpad:true)
  // обязан его НЕ показывать (композиция).
  assert.equal(dpad.style.display, 'none',
    'RED: расстановка: d-pad скрыт сквозь кадр (000376)');
  // Подтверждение «В бой» (Enter) + кадр — возвращён ровно в состояние
  // предиката (бой: dpad=true), бой продолжается.
  G.combatUI.handleCode('Enter');
  frameMain376(h);
  assert.notEqual(dpad.style.display, 'none',
    'Enter: d-pad восстановлен (каскад, display !== none)');
  assert.equal(G.combatUI.isActive(), true,
    'Enter: бой активен (не конец)');
  assert.equal(action.style.display, 'none',
    'Enter: кнопки [E] по-прежнему скрыты боем');
});

test('000376-D7: e2e — клик «В бой» закрывает окно и возвращает d-pad (после кадра)', async () => {
  const h = await bootTouch376();
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const { dpad } = touchDom376(h.sandbox.document);
  const c = g.actions.startCombat(0);
  assert.ok(c, 'отладочный бой создан');
  frameMain376(h);
  assert.equal(dpad.style.display, 'none',
    'RED: расстановка: d-pad скрыт (000376)');
  const go = findByClassE2e(h.sandbox.document.body,
    'combat-placebar-btn--go');
  assert.ok(go, 'прекон: кнопка «В бой» в DOM');
  go.listeners.click[0]();
  frameMain376(h);
  assert.notEqual(dpad.style.display, 'none',
    'клик «В бой»: d-pad восстановлен');
  assert.equal(G.combatUI.isActive(), true, 'бой продолжается');
});

test('000376-D8: e2e — победа при НЕ закрытой расстановке: finish (Space) возвращает d-pad (teardown-точка 000170)', async () => {
  const h = await bootTouch376();
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const { dpad, action, inventory } = touchDom376(h.sandbox.document);
  const c = g.actions.startCombat(0);
  assert.ok(c, 'отладочный бой создан');
  frameMain376(h);
  assert.equal(dpad.style.display, 'none',
    'RED: расстановка: d-pad скрыт (000376)');
  // Победа ЯДРОМ (без боевых действий UI) — окно расстановки живо.
  for (const m of c.units.filter((x) => x.side === 'mob' && x.alive)) {
    G.combatInternals.dealDamageToMob(c, m, 9999);
  }
  assert.ok(c.result && c.result.outcome === 'victory',
    'победа (checkVictory)');
  frameMain376(h);
  assert.equal(dpad.style.display, 'none',
    'победа при живом окне: d-pad всё ещё скрыт');
  G.combatUI.handleCode('Space');
  assert.equal(G.combatUI.isActive(), false, 'Space → finish');
  frameMain376(h);
  assert.notEqual(dpad.style.display, 'none',
    'finish: d-pad восстановлен (точка teardown 000170)');
  assert.notEqual(action.style.display, 'none',
    'finish: [E] восстановлена (мир)');
  assert.notEqual(inventory.style.display, 'none',
    'finish: [I] восстановлена (мир)');
});

test('000376-D9: Т2 — предикат touchControlsVisibility НЕ изменён (таблица + не-потребление чужих полей + мусор) и applyVisibility без подавления бит-в-бит', () => {
  const f = C.touchControlsVisibility;
  for (const combat of [false, true]) {
    for (const inventory of [false, true]) {
      for (const building of [false, true]) {
        const r = f({ combat, inventory, building });
        assert.equal(r.buttons, !(combat || inventory || building),
          'buttons: ' + combat + '/' + inventory + '/' + building);
        assert.equal(r.dpad, !(inventory || building),
          'dpad: ' + combat + '/' + inventory + '/' + building);
      }
    }
  }
  assert.deepEqual(f({ combat: true }), { buttons: false, dpad: true },
    'бой: [I]/[E] скрыты, D-pad ОСТАЁТСЯ (000150 — вне расстановки)');
  // Поле-«расстановка» (любое имя) — принимаются и НЕ потребляются:
  // предикат 000150 не расширяется (наш флаг живёт в ui.js).
  assert.deepEqual(f({ combat: true, placement: true }),
    { buttons: false, dpad: true },
    'placement:true — не потребляется (dpad жив в предикате)');
  assert.deepEqual(f({ placement: true }), f({}),
    'placement без боя — как пустой снимок');
  for (const junk of [null, undefined, 'x', 1, { combat: 'yes' }]) {
    assert.deepEqual(f(junk), { buttons: true, dpad: true },
      'мусор → всё видимо: ' + JSON.stringify(junk));
  }
  // applyVisibility БЕЗ вызова setDpadSuppressed — поведение бит-в-бит
  // (TV3-последовательность): инвентарь скрывает d-pad, бой оставляет.
  const m = bootMinimalVm376(true);
  assert.equal(m.errors.length, 0, 'ошибок загрузки нет');
  const [dpad, action] = m.root.children;
  m.tc.applyVisibility({ buttons: false, dpad: false });
  assert.equal(dpad.style.display, 'none', 'инвентарь: d-pad скрыт');
  assert.equal(action.style.display, 'none', 'инвентарь: [E] скрыта');
  m.tc.applyVisibility({ buttons: false, dpad: true });
  assert.notEqual(dpad.style.display, 'none',
    'бой: d-pad видим (никакого подавления не было)');
  assert.equal(action.style.display, 'none', 'бой: [E] скрыта');
  m.tc.applyVisibility({ buttons: true, dpad: true });
  assert.notEqual(dpad.style.display, 'none', 'мир: d-pad видим');
  assert.notEqual(action.style.display, 'none', 'мир: [E] видима');
});

// ---------------------------------------------------------------------------
// Зуб статической защиты инварианта memory/000376-dpad-placement.md
// (задача 000381): каждая запись закрытия окна расстановки в combat-ui.js
// обязана быть покрытой хуком синхронизации d-pad. readFileSync-зуб,
// соседние тесты не require-ятся (прецеденты 000371/000372/000375);
// якоря собраны конкатенацией — само-вхождение исключено.
// ---------------------------------------------------------------------------

test('000376-D10: зуб — каждая запись закрытия окна расстановки в combat-ui.js покрыта хуком d-pad (000381)', () => {
  const code = src('combat-ui.js');
  const lineOf = (i) => code.slice(0, i).split('\n').length;
  const writeRe = new RegExp('place' + 'Open' + '\\s*=\\s*false', 'g');
  const hookRe = new RegExp('sync' + 'PlacementDpad' + '\\(false\\)', 'g');
  const writes = [...code.matchAll(writeRe)].map((m) => m.index);
  const isDecl = (o) => /\blet\s+$/.test(code.slice(Math.max(0, o - 8), o));
  // Пин Б — форма по ФАКТУ ДИСКА (анализ 000381): запись покрыта, если
  // (лежит внутри тела closePlacementWindow и хук false строго РАНЬШЕ
  // неё — общий хук сразу после раннего return-гарда покрывает и
  // result-ветку, и хвост) ИЛИ хук false лежит в окне ±8 строк
  // (teardown-блоки finish/catch правила 000170: смещение +5).
  const i0 = code.indexOf('function close' + 'PlacementWindow(');
  assert.ok(i0 >= 0,
    'src/combat-ui.js: определение функции закрытия окна расстановки найдено');
  const i1 = code.indexOf('\n  }\n', i0);
  assert.ok(i1 > i0,
    'src/combat-ui.js: тело функции закрытия окна расстановки извлечено '
    + '(якорь закрывающей скобки в 2 отступа)');
  assert.ok(code.indexOf('function ' + 'sync' + 'PlacementDpad(') >= 0,
    'src/combat-ui.js: определение хука синхронизации d-pad найдено');
  const bodyStart = lineOf(i0);
  const bodyEnd = lineOf(i1);
  const hookLines = [...code.matchAll(hookRe)].map((m) => lineOf(m.index));
  const uncovered = [];
  for (const o of writes) {
    if (isDecl(o)) continue;
    const ln = lineOf(o);
    const coveredBody = ln > bodyStart && ln < bodyEnd
      && hookLines.some((h) => h > bodyStart && h < ln);
    const coveredNear = hookLines.some((h) => Math.abs(h - ln) <= 8);
    if (!coveredBody && !coveredNear) uncovered.push('src/combat-ui.js:' + ln);
  }
  // Пин А — ФАКТ ДИСКА базы (000381): объявление let + result-ветка +
  // хвост closePlacementWindow + finish + catch. Живое число в имени
  // теста НЕ заморожено; при легитимном росте — переснимать ПО ДИСКУ
  // финальной базы и проверять покрытие новой записи пином Б.
  assert.equal(writes.length, 5,
    'src/combat-ui.js: мест закрытия расстановки ожидалось 5 (ФАКТ ДИСКА '
    + 'базы; при легитимном росте переснимать), факт: ' + writes.length
    + (uncovered.length ? '; вне покрытия хука: ' + uncovered.join(', ') : ''));
  assert.equal(writes.filter(isDecl).length, 1,
    'src/combat-ui.js: объявление с инициализацией должно быть ровно одно');
  assert.deepEqual(uncovered, [],
    'src/combat-ui.js: записи закрытия расстановки вне покрытия хука '
    + 'd-pad (добавьте хук рядом с записью или внутри тела функции '
    + 'закрытия окна): ' + uncovered.join('; '));
});

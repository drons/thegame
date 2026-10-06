// Задача 000154 (регистр: tasks/pending/000150.md) — скрывать кнопки
// [I]/[E] и джойстик (D-pad) на экранах боя/инвентаря/входа.
//
// КРАСНЫЕ тесты (TDD, станция RED). На текущем коде (master 3c0e1b4)
// функциональности НЕТ — это осмысленная причина каждого падения:
//   * grep touchControlsVisibility|applyVisibility по src/ — пуст;
//   * touchControls.show() вызывается ОДИН РАЗ при загрузке (main.js)
//     — механизма per-screen скрытия нет: кнопки/D-pad видимы на
//     ВСЕХ экранах.
// Все 6 тестов (TV1-TV6) падают на НЕИЗМЕНЁННОМ коде по символу/
// методу/поведению (НЕ синтаксису): файл парсится, цепочка
// index.html грузится в vm-песочницах без ошибок (errors.length === 0).
//
// Закреплённые контракты (дизайн — memory/000150-hud-screen-hide.md;
// карта тестов — /tmp/thegame-wf-000154/a3-tests.md §6):
//   * src/controls.js — ЧИСТАЯ touchControlsVisibility(screens)
//     → {buttons, dpad}: кнопки [I]/[E] скрываются на всех трёх
//     экранах (бой/инвентарь/вход), D-pad — только на инвентаре
//     и входе (в бою ДВИЖЕНИЕ по полю — 000121); мусор/не-boolean
//     (жёсткие === true, паттерн routeTouchScreen) → всё видимо
//     (безопасное направление); dungeon/dialog не потребляются
//     («не больше и не меньше»); аргумент не мутируется;
//   * src/ui.js — Game.touchControls.applyVisibility(v): инлайн
//     style.display 'none'/'', идемпотентность, null-guard dpadEl
//     (схема 'keyboard' — dpadEl === null, НЕ крах), root
//     show()/hide()/isActive() — БЕЗ ИЗМЕНЕНИЙ (независимы от
//     per-control видимости);
//   * src/main.js — клей в frame(): пересчёт каждый кадр от снимка
//     экранов (inCombat / playerUI.isOpen() / inBuilding) —
//     e2e-ассерты видимости валидны ТОЛЬКО ПОСЛЕ кадра.
//
// Номера: workflow/ветка/коммиты — 000154 (рассогласование реестра
// оркестратора); файл ТЗ — tasks/pending/000150.md; tasks/pending/
// 000154.md — ДРУГАЯ задача («инициатива») — НЕ выполняется в этом
// workflow (memory/000154-initiative.md).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const controlsCode = fs.readFileSync(
  path.join(ROOT, 'src', 'controls.js'), 'utf8');
const uiCode = fs.readFileSync(path.join(ROOT, 'src', 'ui.js'), 'utf8');
// node-ветка UMD (тот же модуль, что браузерная). RED: обращение
// C.touchControlsVisibility — только в телах тестов (паттерн
// controls.test.js: деструктурировать неопределённый экспорт в
// шапке нельзя — упадёт при загрузке файла, а не в тесте).
const C = require('../src/controls.js');

// Цепочка скриптов — из index.html (не хардкод: паттерн
// tests/main-visuals.test.js — при изменении порядка подхватится).
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(
  html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));

// ---------------------------------------------------------------------------
// TV1: экспорт touchControlsVisibility — node-ветка + браузерная UMD
// ---------------------------------------------------------------------------

test('TV1: controls.js экспортирует touchControlsVisibility (node-ветка + браузерная ветка UMD)', () => {
  // node-ветка: require даёт функцию.
  assert.equal(typeof C.touchControlsVisibility, 'function',
    'touchControlsVisibility экспортируется (node-ветка require)');
  // Браузерная ветка: controls.js в ГОЛОМ vm-realm — функция на Game,
  // чужие ключи Game не потеряны (UMD-мерж, паттерн HU1/index-order).
  const sandbox = { Game: { Marker: 1 } };
  vm.runInNewContext(controlsCode, sandbox);
  assert.equal(sandbox.Game.Marker, 1, 'Game не перезаписан (UMD-мерж)');
  assert.equal(typeof sandbox.Game.touchControlsVisibility, 'function',
    'браузерная ветка: Game.touchControlsVisibility на месте');
  assert.equal(typeof sandbox.Game.routeTouchScreen, 'function',
    'существующие экспорты controls.js не потеряны');
});

// ---------------------------------------------------------------------------
// TV2: экран → видимость — полная таблица + мусор + чистота
// ---------------------------------------------------------------------------

test('TV2: touchControlsVisibility — таблица 8 комбинаций, dungeon/dialog не влияют, мусор → всё видимо, чистота', () => {
  const f = C.touchControlsVisibility;
  // Тотальность: ВСЕ 8 комбинаций {combat, inventory, building}.
  for (const combat of [false, true]) {
    for (const inventory of [false, true]) {
      for (const building of [false, true]) {
        const label = `combat:${combat} inventory:${inventory} ` +
          `building:${building}`;
        const r = f({ combat, inventory, building });
        // Кнопки [I]/[E] — скрыты на ЛЮБОМ из трёх экранов.
        assert.equal(r.buttons, !(combat || inventory || building),
          'buttons: ' + label);
        // D-pad — скрыт на инвентаре/входе, ЖИВ в бою (движение по
        // полю боя — 000121; скрывают только два других экрана).
        assert.equal(r.dpad, !(inventory || building), 'dpad: ' + label);
      }
    }
  }
  // Ключевые пины (ТЗ 000150, дословно).
  assert.deepEqual(f({ combat: true }), { buttons: false, dpad: true },
    'бой: [I]/[E] скрыты, D-pad ОСТАЁТСЯ');
  assert.deepEqual(f({ inventory: true }), { buttons: false, dpad: false },
    'инвентарь [I]: всё скрыто');
  assert.deepEqual(f({ building: true }), { buttons: false, dpad: false },
    'вход в здание [E]: всё скрыто');
  assert.deepEqual(f({}), { buttons: true, dpad: true },
    'карта (ничего не активно): всё видимо');
  // dungeon/dialog — принимаются в снимке, но НЕ ПОТРЕБЛЯЮТСЯ (ТЗ их
  // не упоминает — «не больше и не меньше»; D-pad в подземелье
  // НУЖЕН для движения, 000121).
  assert.deepEqual(f({ dungeon: true }), f({}),
    'dungeon — на видимость не влияет');
  assert.deepEqual(f({ dialog: true }), f({}),
    'dialog — на видимость не влияет');
  assert.deepEqual(f({ combat: true, dungeon: true, dialog: true }),
    { buttons: false, dpad: true },
    'бой + dungeon/dialog — как бой');
  // Мусор/не-boolean (жёсткие === true, паттерн routeTouchScreen
  // 000121): БЕЗОПАСНОЕ направление — всё видимо, исключений нет.
  for (const junk of [
    null, undefined, 'x', 1, NaN,
    { combat: 'yes' }, { combat: 1 }, { inventory: 'yes' },
    { building: 1 },
    { combat: false, inventory: false, building: false },
  ]) {
    assert.deepEqual(f(junk), { buttons: true, dpad: true },
      'мусор → всё видимо: ' + JSON.stringify(junk));
  }
  // Чистота (пин-паттерн routeTouchScreen, tests/controls.test.js):
  // повторный вызов — тот же результат, аргумент не мутируется.
  const snap = { combat: true, inventory: true, building: true };
  const before = JSON.parse(JSON.stringify(snap));
  const r1 = f(snap);
  const r2 = f(snap);
  assert.deepEqual(r1, r2, 'повторный вызов — тот же результат');
  assert.deepEqual(snap, before, 'снимок не мутирован');
});

// ---------------------------------------------------------------------------
// TV3: Game.touchControls.applyVisibility — per-control видимость (DOM)
//
// Минимальный vm (controls.js + ui.js) + DOM-стаб (паттерн
// index-order + makeEl main-visuals: style — ОБЫКНОВЕННЫЙ ОБЪЕКТ,
// children — массив). Ассерты — ТОЛЬКО style.display: classList/
// setAttribute в стабах — no-op, assert-непригодны.
// ---------------------------------------------------------------------------

function stubEl(tag) {
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

function bootMinimalVm(dpadFlag) {
  const errors = [];
  const body = stubEl('body');
  const sandbox = {
    console: { error: (m) => errors.push(String(m)), log() {} },
    document: {
      createElement: (tag) => stubEl(tag),
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

test('TV3: touchControls.applyVisibility — style.display пер-контрола (идемпотентность, null-guard dpad, root show/hide без изменений)', () => {
  // --- Схема 'touch' (dpad в DOM) ---
  const m = bootMinimalVm(true);
  assert.equal(m.errors.length, 0,
    'ошибок загрузки нет: ' + m.errors.join('; '));
  assert.ok(m.tc, 'Game.touchControls существует (controls.js + ui.js)');
  assert.ok(m.root, 'корень #touch-controls в body');
  assert.equal(m.root.children.length, 3,
    'dpad:true — children [dpad, action, inventory] (порядок build)');
  const [dpad, action, inventory] = m.root.children;
  assert.equal(dpad.className, 'tc-dpad', 'child 0 — D-pad');
  assert.equal(action.className, 'tc-action', 'child 1 — кнопка [E]');
  assert.equal(inventory.className, 'tc-action', 'child 2 — кнопка [I]');
  // До applyVisibility — всё видимо.
  for (const e of [dpad, action, inventory]) {
    assert.notEqual(e.style.display, 'none',
      'до applyVisibility — видимо: ' + e.className);
  }
  // Инвентарь/вход: ВСЁ скрыто (кнопки + D-pad).
  m.tc.applyVisibility({ buttons: false, dpad: false });
  for (const e of [dpad, action, inventory]) {
    assert.equal(e.style.display, 'none',
      'после applyVisibility(false) — скрыт: ' + e.className);
  }
  // Рестор: инлайн-display обратно '' (каскад: .tc-action —
  // display:flex, поэтому restore — НЕ 'block').
  m.tc.applyVisibility({ buttons: true, dpad: true });
  for (const e of [dpad, action, inventory]) {
    assert.notEqual(e.style.display, 'none',
      'после restore — видимо: ' + e.className);
  }
  // Бой: кнопки скрыты, D-pad жив; идемпотентность (повтор того же
  // состояния — без исключений, результат сохраняется).
  m.tc.applyVisibility({ buttons: false, dpad: true });
  assert.equal(action.style.display, 'none', 'бой: кнопки [E] скрыты');
  assert.notEqual(dpad.style.display, 'none', 'бой: D-pad жив');
  m.tc.applyVisibility({ buttons: false, dpad: true });
  assert.equal(action.style.display, 'none',
    'идемпотентно: [E] всё ещё скрыты');
  assert.notEqual(dpad.style.display, 'none',
    'идемпотентно: D-pad всё ещё жив');
  // Root show()/hide()/isActive() — БЕЗ ИЗМЕНЕНИЙ; per-control
  // видимость НЕЗАВИСИМА от root (hide не сбрасывает display).
  assert.equal(m.tc.isActive(), true, 'show() → isActive() === true');
  m.tc.hide();
  assert.equal(m.tc.isActive(), false, 'hide() → isActive() === false');
  assert.equal(action.style.display, 'none',
    'root hide() НЕ сбрасывает per-control видимость');
  m.tc.show();
  assert.equal(m.tc.isActive(), true, 'show() снова → isActive');
  // --- Схема 'keyboard' (dpadEl === null): null-guard, НЕ крах;
  // кнопки работают (ТЗ — кнопки в ОБЕИХ схемах, 000123). ---
  const m2 = bootMinimalVm(false);
  assert.equal(m2.errors.length, 0,
    'ошибок загрузки нет (dpad:false): ' + m2.errors.join('; '));
  assert.ok(m2.root, 'корень существует (dpad:false)');
  assert.equal(m2.root.children.length, 2,
    'dpad:false — children [action, inventory]');
  const [action2, inventory2] = m2.root.children;
  assert.equal(action2.className, 'tc-action', 'child 0 — кнопка [E]');
  assert.equal(inventory2.className, 'tc-action', 'child 1 — кнопка [I]');
  m2.tc.applyVisibility({ buttons: false, dpad: false }); // без исключений
  assert.equal(action2.style.display, 'none',
    'keyboard: [E] скрыта (dpad-часть — no-op)');
  assert.equal(inventory2.style.display, 'none',
    'keyboard: [I] скрыта');
  m2.tc.applyVisibility({ buttons: true, dpad: true });
  assert.notEqual(action2.style.display, 'none', 'keyboard: [E] — restore');
  assert.notEqual(inventory2.style.display, 'none', 'keyboard: [I] — restore');
});

// ---------------------------------------------------------------------------
// TV4-TV6: vm-e2e, ПОЛНАЯ цепочка index.html.
//
// Песочница — КОПИЯ bootSandbox (tests/main-visuals.test.js L158;
// дублирование стабов принято — 000083/000087). ЧТО НОВОЕ/ВАЖНОЕ:
// (a) window.location.search = '?controls=touch' — В КОНСТРУКТОРЕ
//     window-стаба ДО прогона CHAIN: main.js читает search при
//     ЗАГРУЗКЕ (L1617-1618) и НЕ перечитывает; forced-схема 'touch'
//     (chooseControlsScheme) гарантирует dpadEl — без него D-pad не
//     проверить (все существующие harness'ы — keyboard);
// (b) после startCombat h.raf[last] — tick боевого оверлея
//     (combat-ui rAF), НЕ frame main.js — frameMain вызывает ПЕРВУЮ
//     rAF-запись: все регистрации frame в main.js — ОДИН и тот же
//     замыкатель (L2484/L2701).
//
// Идентификация DOM: document.body.children → id 'touch-controls' →
// children [0]=.tc-dpad, [1]=.tc-action ([E]), [2]=.tc-action ([I])
// (порядок appendChild в build, ui.js). Ассерты — ТОЛЬКО
// style.display (classList/setAttribute в стабах no-op).
// ---------------------------------------------------------------------------

// Фиксированное время кадра (performance.now тоже = NOW): кадр
// детерминирован (паттерн main-visuals).
const NOW = 1000;

// --- WebGL-стаб (main.js: compile/link/буферы) — копия main-visuals ---

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

// --- Canvas 2d-стаб — копия main-visuals ---

function makeContext2d(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

// --- «Снисходительный» DOM-элемент — копия main-visuals: known-
// свойства настоящие (style — ОБЫКНОВЕННЫЙ ОБЪЕКТ, children — массив),
// неизвестные — no-op через Proxy. ---

function makeEl(tag) {
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
    // 000081: боевой оверлей создаёт canvas через
    // document.createElement — без 2d-стаба startCombat в песочнице
    // падал бы (паттерн main-visuals).
    target.getContext = (kind) => (kind === '2d'
      ? makeContext2d(target) : null);
  }
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return () => undefined; // неизвестный метод DOM — no-op
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

// --- Песочница: вся цепочка index.html (браузерная ветка UMD) ---

function bootSandbox() {
  const winListeners = {};
  const raf = [];
  const errors = [];
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
  // #game — WebGL (без него main.js уходит в фолбэк-ветку и игра не
  // стартует); #sprites — 2d со спрайтами.
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl() : makeContext2d(gameCanvas));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? makeContext2d(spriteCanvas) : null);
  const document = {
    createElement: (tag) => makeEl(tag),
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
  const window = {
    innerWidth: 1280,
    innerHeight: 720,
    // ПРИНУДИТЕЛЬНАЯ touch-схема (см. (a) выше): search задаётся ДО
    // прогона CHAIN — main.js читает его при ЗАГРУЗКЕ и не перечитывает.
    location: { search: '?controls=touch' },
    addEventListener: (t, f) => {
      (winListeners[t] || (winListeners[t] = [])).push(f);
    },
    removeEventListener() {},
    // localStorage нет → main.js: saveStorage = undefined (try/catch)
    // → сейвы в песочнице не пишутся (паттерн main-visuals).
  };
  // Image-стаб: assets/map.png ВСЕГДА onerror (детерминированный
  // фолбэк G.generateSeedPixels, main.js loadMapPixels), остальные —
  // onload (паттерн main-visuals).
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
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox,
      { filename: f });
  }
  return { sandbox, winListeners, raf, errors };
}

// Промывка микротасков (все загрузки Image + loadMapPixels().then:
// карта, спавн, requestAnimationFrame(frame)).
const drain = () => new Promise((r) => setImmediate(r));

async function bootTouch() {
  const h = bootSandbox();
  for (let i = 0; i < 3; i++) await drain();
  return h;
}

// Один кадр main.js (см. (b) выше): ПЕРВАЯ rAF-запись — frame
// (все его регистрации — один замыкатель); после startCombat
// h.raf[last] — tick combat-ui, его вместо frame вызывать нельзя
// (kleе пересчитывает видимость в frame).
function frameMain(h) {
  h.raf[0](NOW);
}

// DOM: #touch-controls в body; children [dpad, action, inventory].
function touchDom(documentStub) {
  const root = documentStub.body.children
    .find((c) => c.id === 'touch-controls');
  assert.ok(root, 'сценарий: #touch-controls в body (init при загрузке)');
  assert.equal(root.children.length, 3,
    'touch-схема — children [dpad, action, inventory]');
  const [dpad, action, inventory] = root.children;
  assert.equal(dpad.className, 'tc-dpad', 'child 0 — D-pad');
  assert.equal(action.className, 'tc-action', 'child 1 — кнопка [E]');
  assert.equal(inventory.className, 'tc-action', 'child 2 — кнопка [I]');
  return { root, dpad, action, inventory };
}

// Победа в бою (паттерн resolveCombatVictory
// tests/mob-zones-e2e.test.js): Эфир 9999 (dealDamageToAlly) + мобы
// 9999 (dealDamageToMob) → checkVictory → Space (finish → onEnd).
function resolveCombatVictory(G, c, label) {
  const u = c.units.find((x) => x.kind === 'efir');
  assert.ok(u, label + ': Эфир в бою (main.js передаёт efir ВСЕГДА)');
  G.combatInternals.dealDamageToAlly(c, u, 9999);
  assert.equal(u.alive, false, label + ': Эфир пал (dealDamageToAlly)');
  for (const m of c.units.filter((x) => x.side === 'mob' && x.alive)) {
    G.combatInternals.dealDamageToMob(c, m, 9999);
  }
  assert.ok(c.result && c.result.outcome === 'victory',
    label + ': победа (checkVictory)');
  G.combatUI.handleCode('Space');
  assert.equal(G.combatUI.isActive(), false,
    label + ': панель закрыта (Space → finish)');
}

// ---------------------------------------------------------------------------
// TV4: ЭКРАН БОЯ — кнопки [I]/[E] скрыты, D-pad видим; после конца
// боя — всё восстановлено.
// ---------------------------------------------------------------------------

test('TV4: e2e — бой: кнопки [I]/[E] скрыты, D-pad остаётся; после конца боя — восстановлено', async () => {
  const h = await bootTouch();
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.ok(g, '__game (main.js выполнен)');
  assert.equal(g.state.controls, 'touch',
    'сценарий: принудительная схема ?controls=touch (dpad в DOM)');
  assert.equal(h.raf.length, 1,
    'сценарий: до первого кадра rAF — только frame main.js');
  const { dpad, action, inventory } = touchDom(h.sandbox.document);
  // Пре-состояние: всё видимо.
  for (const e of [dpad, action, inventory]) {
    assert.notEqual(e.style.display, 'none',
      'до боя — видимо: ' + e.className);
  }
  // Бой (отладочный, паттерн save.test.js L1504 / startCombatAt).
  const c = g.actions.startCombat(0);
  assert.ok(c, 'отладочный бой создан');
  assert.equal(G.combatUI.isActive(), true, 'прекон: бой активен');
  // Клей пересчитывает видимость в кадре — ассерт валиден ТОЛЬКО
  // после frameOnce (до кадра — невалиден).
  frameMain(h);
  assert.equal(action.style.display, 'none', 'бой: кнопка [E] скрыта');
  assert.equal(inventory.style.display, 'none', 'бой: кнопка [I] скрыта');
  assert.notEqual(dpad.style.display, 'none',
    'бой: D-pad ОСТАЁТСЯ видимым (движение по полю, 000121)');
  // Конец боя (victory → Space) — всё восстановлено.
  resolveCombatVictory(G, c, 'TV4');
  frameMain(h);
  for (const e of [dpad, action, inventory]) {
    assert.notEqual(e.style.display, 'none',
      'после конца боя — видимо снова: ' + e.className);
  }
});

// ---------------------------------------------------------------------------
// TV5: ЭКРАН ИНВЕНТАРЯ [I] — кнопки И D-pad скрыты; закрытие панели —
// восстановление.
// ---------------------------------------------------------------------------

test('TV5: e2e — инвентарь [I]: кнопки и D-pad скрыты; закрытие панели — восстановлено', async () => {
  const h = await bootTouch();
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.ok(g, '__game (main.js выполнен)');
  assert.equal(g.state.controls, 'touch',
    'сценарий: принудительная схема ?controls=touch (dpad в DOM)');
  const { dpad, action, inventory } = touchDom(h.sandbox.document);
  assert.equal(G.playerUI.isOpen(), false, 'сценарий: панель закрыта');
  // Панель персонажа — публичный API (паттерн building-effects B7).
  G.playerUI.toggle(true);
  assert.equal(G.playerUI.isOpen(), true, 'прекон: панель открыта');
  frameMain(h);
  assert.equal(action.style.display, 'none',
    'инвентарь: кнопка [E] скрыта');
  assert.equal(inventory.style.display, 'none',
    'инвентарь: кнопка [I] скрыта');
  assert.equal(dpad.style.display, 'none',
    'инвентарь: D-pad скрыт (ТЗ: джойстик на инвентаре)');
  // Закрытие — восстановление.
  G.playerUI.toggle(false);
  assert.equal(G.playerUI.isOpen(), false, 'прекон: панель закрыта');
  frameMain(h);
  for (const e of [dpad, action, inventory]) {
    assert.notEqual(e.style.display, 'none',
      'после закрытия панели — видимо: ' + e.className);
  }
});

// ---------------------------------------------------------------------------
// TV6: ЭКРАН ВХОДА В ЗДАНИЕ [E] — кнопки И D-pad скрыты; закрытие
// оверлея — восстановление.
// ---------------------------------------------------------------------------

test('TV6: e2e — вход в здание [E]: кнопки и D-pad скрыты; закрытие оверлея — восстановлено', async () => {
  const h = await bootTouch();
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.ok(g, '__game (main.js выполнен)');
  assert.equal(g.state.controls, 'touch',
    'сценарий: принудительная схема ?controls=touch (dpad в DOM)');
  const { dpad, action, inventory } = touchDom(h.sandbox.document);
  assert.equal(G.buildingUI.isActive(), false,
    'сценарий: оверлей постройки закрыт');
  // Оверлей действий постройки — публичный API (паттерн
  // building-effects B6): «экран входа в здание» по ТЗ.
  G.buildingUI.open({
    title: 'Смоук', actions: [{ id: 'a', имя: 'А', доступен: true }],
    onAction: () => {},
  });
  assert.equal(G.buildingUI.isActive(), true, 'прекон: оверлей открыт');
  frameMain(h);
  assert.equal(action.style.display, 'none',
    'вход: кнопка [E] скрыта');
  assert.equal(inventory.style.display, 'none',
    'вход: кнопка [I] скрыта');
  assert.equal(dpad.style.display, 'none',
    'вход: D-pad скрыт (ТЗ: джойстик на входе в здание)');
  // Закрытие — восстановление.
  G.buildingUI.close();
  assert.equal(G.buildingUI.isActive(), false, 'прекон: оверлей закрыт');
  frameMain(h);
  for (const e of [dpad, action, inventory]) {
    assert.notEqual(e.style.display, 'none',
      'после закрытия оверлея — видимо: ' + e.className);
  }
});

// ---------------------------------------------------------------------------
// TV7: ДЕГРАДАЦИЯ mixed-версий (правка по итогам ревью) — гард frame()
// накрывает ОБА чужих экспорта: controls.js без touchControlsVisibility
// (старая версия) + новые ui.js/main.js → frame() не падает (было:
// TypeError «G.touchControlsVisibility is not a function» — смерть
// rAF-лупа, проверено vm-песочницей), контролы остаются видимыми
// (деградация = текущее поведение).
// ---------------------------------------------------------------------------

test('TV7: e2e — нет Game.touchControlsVisibility (mixed-версии) → frame() не падает, контролы видимы', async () => {
  const h = await bootTouch();
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  // Симуляция mixed-версий: старый controls.js (без нового экспорта)
  // + новые ui.js/main.js. delete легален: браузерная UMD-ветка
  // делает Object.assign({}, Game, factory()) — обычные свойства.
  delete G.touchControlsVisibility;
  assert.equal(typeof G.touchControlsVisibility, 'undefined',
    'прекон: чистое ядро недоступно (controls.js без экспорта)');
  assert.equal(typeof G.touchControls.applyVisibility, 'function',
    'прекон: applyVisibility на месте (ui.js новый)');
  assert.equal(h.raf.length, 1,
    'сценарий: до первого кадра rAF — только frame main.js');
  const { dpad, action, inventory } = touchDom(h.sandbox.document);
  assert.doesNotThrow(() => { frameMain(h); },
    'frame() не падает при отсутствии touchControlsVisibility');
  // Деградация = текущее поведение: клей не применён — всё видимо.
  for (const e of [dpad, action, inventory]) {
    assert.notEqual(e.style.display, 'none',
      'деградация: контролы видимы: ' + e.className);
  }
});

// Задача 000157.03: сбор залежей в подземельях — клавиша [E]. Стоя
// на клетке залежи: +N предмета в инвентарь, лог-строка «Залежь: +N
// <имя из каталога>», hud-flash; контекстный hint «Залежь — [E]»
// (000229: панель/hint в подземелье УБРАНА — строки в подземелье
// НЕТ, механизм — только город, залежей в городе нет);
// при полном инвентаре — flash-отказ, заложь НЕ тронута (повтор после
// освобождения). Выход — [E]-приоритет (000177): конфликт исключён по
// построению (залежь ≠ выходная клетка — LOC-18) и запитывается здесь
// (DE-3/DE-5). Сейв: deposits — опциональный pass-through валидатора
// (D4) — gathered персистирует ПРАВО как opened (DE-4; e2e-сторона
// GRD-4).
//
// Контракт: memory/000157.03-deposit-gather.md; ТЗ —
// tasks/pending/000157.03.md. Конвенция «1 e2e на механику» (D11):
// механика «сбор [E]» отдельна от выхода (portal-exit-e2e) и лута
// (dungeon-loot-e2e) → НОВЫЙ файл.
//
// КРАСНЫЕ тесты (TDD): функциональности ЕЩЁ НЕТ в src (ветка [E]-залежи
// в locationOnInteract, gatherDeposit, interactDeposit, hint). Все пять
// падают ОСМЫСЛЕННО на master f7b4d3c — НЕ синтаксически:
//   * DE-1 — hint-строки нет, [E] на клетке залежи = no-op (000121) →
//     «+2 в инвентаре» не случается;
//   * DE-2 — no-op → слоты не пополнены, flash-отказа нет (и retry не
//     сработает);
//   * DE-3 — выход работает (000177), НО валидатор сейва отбрасывает
//     deposits → ассерт «запись содержит залежь (gathered:false)»
//     падает (pass-through D4 ещё не реализован);
//   * DE-4 — [E]-сбора нет → gathered никогда не ставится; сейв —
//     deposits отброшены валидатором;
//   * DE-5 — finally/watchdog-сценарий 000170 через выход: err null и
//     т.д. проходят (существующий путь), НО сейв-запись без deposits
//     (валидатор) → падает ассерт «запись содержит залежь».
//
// Harness — СВОЙ, дубль tests/dungeon-loot-e2e.test.js (000186) —
// ближайший шаблон (enterDungeon + мутация ds.contents + stepTo +
// keydown; дублирование харнессов — принятая конвенция 000083/000087).
// Мутация contents — ПОЛНАЯ замена с валидным набором полей
// (seed/createdAtXp/step/mobs/chests/deposits) — ОБЯЗАТЕЛЬНО: DE-3/4/5
// гонят запись через saveNow → validateDungeonContents.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { SAVE_KEY } = require('../src/save.js');
const P = require('../src/player.js');

const ROOT = path.join(__dirname, '..');
const NOW = 1000; // performance.now() в песочнице заморожен

// --- Цепочка скриптов — из index.html (000157.03 — 0 новых тегов) ---
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));

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

// --- Canvas 2d-стаб (запись вызовов — sanity, что слой жив) ---

function makeContext2d(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

// --- «Снисходительный» DOM (полный: dungeon-ui build()/render()) ---

function matchesSel(el, sel) {
  // Поддерживает: 'tag', '.class', '[attr]', '[attr="value"]' и их
  // композиты без пробела — то, что использует игра (ui.js и др.).
  let rest = String(sel).trim();
  let tag = null;
  let cls = null;
  let attr = null;
  const bm = rest.match(/\[([^\]=]+)(?:="([^"]*)")?\]$/);
  if (bm) {
    attr = [bm[1], bm[2]];
    rest = rest.slice(0, bm.index);
  }
  const cm = rest.match(/\.([A-Za-z0-9_-]+)$/);
  if (cm) {
    cls = cm[1];
    rest = rest.slice(0, cm.index);
  }
  if (rest) tag = rest;
  if (tag && String(el.tagName || '').toLowerCase() !== tag.toLowerCase()) {
    return false;
  }
  if (cls &&
      !String(el.className || '').split(/\s+/).includes(cls)) {
    return false;
  }
  if (attr) {
    if (!attr[0].startsWith('data-')) return false;
    const v = el.dataset ? el.dataset[attr[0].slice(5)] : undefined;
    if (attr[1] !== undefined && v !== attr[1]) return false;
  }
  return true;
}

function findAll(root, sel) {
  const out = [];
  const walk = (n) => {
    for (const ch of n.children || []) {
      if (matchesSel(ch, sel)) out.push(ch);
      walk(ch);
    }
  };
  walk(root);
  return out;
}

function makeEl(tag) {
  const target = {
    tagName: tag,
    className: '',
    _text: '',
    title: '',
    disabled: false,
    style: {},
    dataset: {},
    children: [],
    parent: null,
    listeners: {},
    // children хранят СУРЫЕ target (а не прокси): remove() ищёт по
    // identity.
    appendChild(ch) {
      const raw = ch && ch.__raw ? ch.__raw : ch;
      if (raw.parent) {
        raw.parent.children.splice(raw.parent.children.indexOf(raw), 1);
      }
      raw.parent = target;
      target.children.push(raw);
      return ch;
    },
    remove() {
      if (!target.parent) return;
      const i = target.parent.children.indexOf(target);
      if (i >= 0) target.parent.children.splice(i, 1);
      target.parent = null;
    },
    addEventListener(type, fn) {
      (target.listeners[type] || (target.listeners[type] = [])).push(fn);
    },
    removeEventListener(type, fn) {
      const a = target.listeners[type];
      if (!a) return;
      const i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    },
    // data-* → dataset.
    setAttribute(name, value) {
      if (name.startsWith('data-')) {
        target.dataset[name.slice(5)] = value;
      }
    },
    // canvas: 2d/WebGL-контексты — no-op-прокси. dungeon-ui создаёт
    // canvas оверлея (document.createElement('canvas')).
    getContext(kind) {
      if (tag !== 'canvas') return null;
      return kind === 'webgl' ? makeGl() : makeContext2d(target);
    },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    blur() {},
    closest(sel) {
      let n = target;
      while (n) {
        if (matchesSel(n, sel)) return n;
        n = n.parent;
      }
      return null;
    },
    querySelector(sel) { return findAll(target, sel)[0] || null; },
    querySelectorAll(sel) { return findAll(target, sel); },
  };
  // textContent — как в DOM: сбрасывает детей (render() очищает секции).
  Object.defineProperty(target, 'textContent', {
    get() { return this._text; },
    set(v) {
      this._text = String(v);
      for (const ch of target.children) ch.parent = null;
      target.children.length = 0;
    },
  });
  target.__raw = target;
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return () => undefined; // неизвестный метод DOM — no-op
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

// --- localStorage-мок: seed — досеянная оболочка сейва (v1) ---

function makeStorage(seed) {
  const m = new Map();
  if (seed != null) m.set(SAVE_KEY, JSON.stringify(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

function seedSave(data) {
  return { version: 1, savedAt: new Date(0).toISOString(), data };
}

// --- Песочница: вся цепочка index.html (браузерная ветка UMD) ---

function bootSandbox(seed) {
  const winListeners = {};
  const raf = [];
  const warns = [];
  const errors = [];
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
  // #game — WebGL (без него main.js уходит в фолбэк-ветку и не стартует).
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl() : makeContext2d(gameCanvas));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? makeContext2d(spriteCanvas) : null);
  const storage = makeStorage(seed);
  const body = makeEl('body');
  const document = {
    createElement: (tag) => makeEl(tag),
    getElementById: (id) => (
      id === 'game' ? gameCanvas
        : id === 'sprites' ? spriteCanvas
          : id === 'hud' ? hud
            : null),
    body,
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    hidden: false,
  };
  const window = {
    innerWidth: 1280,
    innerHeight: 720,
    location: { search: '' },
    localStorage: storage,
    confirm: () => false,
    // Семантика браузерного window: повторный add — no-op, remove —
    // реально снимает (без этого накапливались устаревшие keydown).
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
  // Image-стаб: assets/map.png ВСЕГДА onerror (детерминированный
  // фолбэк G.generateSeedPixels, main.js loadMapPixels), остальные —
  // onload. Загрузка — микротаск.
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
    // Таймеры не гоняем (флаши UI): no-op, чтобы не держать процесс.
    setTimeout: () => 0,
    clearTimeout: () => {},
  };
  vm.createContext(sandbox);
  for (const f of CHAIN) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox,
      { filename: f });
  }
  return { sandbox, winListeners, raf, warns, errors, storage, body, hud };
}

// Промывка микротасков (загрузки Image + loadMapPixels().then: карта,
// спавн, restoreFromSave, requestAnimationFrame).
const drain = () => new Promise((r) => setImmediate(r));

async function boot(seed) {
  const h = bootSandbox(seed);
  await drain();
  await drain();
  await drain();
  return h;
}

// --- Наблюдение ---

// Кросс-реалм: vm-объекты → JSON (паттерн 000085; Array.isArray
// проверяется ДО вызова — host(undefined) бросает).
const host = (o) => JSON.parse(JSON.stringify(o));

// Персонаж для досеянного сейва (форма sanitizeSavedHero).
function mkHero(over = {}) {
  return Object.assign(P.createCharacter(), over);
}

// КАДР ГЛАВНОГО ЦИКЛА: ВСЕ rAF-записи main-цикла — ОДНА функция
// frame (requestAnimationFrame(frame) в конце frame + первичная
// на старт), поэтому raf[0] — main frame ВЕЧНО.
function mainFrameAt(h, now = NOW + 500) {
  h.raf[0](now);
}

// --- Хелперы подземелья (паттерны dungeon-loot-e2e / portal-exit) ---

// Клетка на пути: первый FLOOR-сосед ВХОДА в порядке
// [[1,0],[-1,0],[0,1],[0,-1]], НЕ выход (000177 — шаг на выход не
// триггерит ничего особенного, но избегаем). НЕ хардкод x+1: может
// быть стеной. Подземелье связное (createDungeon), у входа ВСЕГДА
// есть FLOOR-сосед.
function asideDir(G, d) {
  const w = d.width;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of dirs) {
    const nx = d.entrance.x + dx, ny = d.entrance.y + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= d.height) continue;
    if (nx === d.exit.x && ny === d.exit.y) continue;
    if (d.cells[ny * w + nx] === G.CELL_FLOOR) return { x: nx, y: ny };
  }
  return null;
}

// Один шаг героя в подземелье: диспатч keydown {code:'Arrow*'} в
// window-слушатели (dungeon-ui: гейты isActive() + !combatUI.isActive()
// → ctx.onMove → dungeonMove синхронно + render() в том же ключе:
// hint-строка СВЕЖАЯ сразу после шага; 1 клавиша = 1 клетка).
// Мир НЕ сдвигается: keydown main.js имеет гейт dungeonUI.isActive().
function stepTo(h, tx, ty) {
  const g = h.sandbox.__game;
  const dx = tx - g.dungeon.x, dy = ty - g.dungeon.y;
  assert.ok(Math.abs(dx) + Math.abs(dy) === 1,
    'шаг на соседнюю клетку (манхэттен = 1)');
  const code = dx === 1 ? 'ArrowRight' : dx === -1 ? 'ArrowLeft'
    : dy === 1 ? 'ArrowDown' : 'ArrowUp';
  const e = { code, key: code, preventDefault() {}, stopPropagation() {} };
  for (const fn of h.winListeners['keydown'] || []) fn(e);
}

// [E] — единый путь (000121): window-слушатель dungeon-ui (зарегистрирован
// ДО main.js) → preventDefault+stopPropagation → ctx.onInteract() →
// locationOnInteract (main.js). keydown main.js тоже видит [E]
// (stopPropagation не снимает слушателей того же узла) →
// buildingActions.toggle() — no-op при активном dungeonUI.
function pressE(h) {
  const e = { code: 'KeyE', key: 'e', preventDefault() {}, stopPropagation() {} };
  for (const fn of h.winListeners['keydown'] || []) fn(e);
  return e;
}

// Оверлей dungeon-ui (подземелье): 000229 — панели НЕТ: 0
// .combat-state (hint убран вместе с панелью; инфо-окно — #hud,
// 000212). Возвращает '' (длина 0) — ассерты читают строку.
function hintText(h) {
  const states = findAll(h.body, '.combat-state');
  assert.equal(states.length, 0,
    'оверлей: .combat-state (hint) НЕТ (000229: панель подземелья '
    + 'убрана)');
  return '';
}

// Сейв из localStorage (паттерн readSave loot-e2e).
function readSave(h) {
  const raw = h.storage.getItem(SAVE_KEY);
  assert.ok(raw, 'сейв присутствует в localStorage: ' + SAVE_KEY);
  return JSON.parse(raw);
}

// Contents-замена — ПОЛНЫЙ валидный набор полей (000186-паттерн +
// deposits; ОБЯЗАТЕЛЬНО — saveNow гонит запись через
// validateDungeonContents, DE-3/4/5). coal: 0.5 кг/ед (reagent,
// стек до 99) — 2 ед. = 1 кг.
function depositContents(cell, gathered = false) {
  return {
    seed: 1, createdAtXp: 0, step: 0, mobs: [], chests: [],
    deposits: [{ id: 'd9', x: cell.x, y: cell.y, item: 'coal',
      amount: 2, gathered }],
  };
}

// --- Мир после выхода (DE-5: «движение мира живо», паттерн PE-5) ---

// Проходной сосед от позиции (мировая карта — детерминирована:
// G.createMap(G.generateSeedPixels()) = та же карта, что в мире).
function passableDir(G, myMap, x, y) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of DIRS) {
    const t = myMap.tileAt(x + dx, y + dy);
    if (t && t.passable && !t.hasMobGroup) return [dx, dy];
  }
  return null;
}

function keydownFor(dx, dy) {
  return dx === 1 ? 'ArrowRight' : dx === -1 ? 'ArrowLeft'
    : dy === 1 ? 'ArrowDown' : 'ArrowUp';
}

// Держим клавишу до первого шага (≤12 кадров) + keyup (паттерн PE-5;
// кадры — mainFrameAt: raf[0] — main frame).
function holdUntilStep(h, code, now) {
  const g = h.sandbox.__game;
  const x0 = g.state.player.x, y0 = g.state.player.y;
  const e = { code, key: code, preventDefault() {}, stopPropagation() {} };
  for (const fn of (h.winListeners['keydown'] || []).slice()) fn(e);
  for (let i = 0; i < 12; i++) {
    now += 200;
    mainFrameAt(h, now);
    if (g.state.player.x !== x0 || g.state.player.y !== y0) break;
  }
  const up = { code, key: code, preventDefault() {}, stopPropagation() {} };
  for (const fn of (h.winListeners['keyup'] || []).slice()) fn(up);
  return {
    moved: g.state.player.x !== x0 || g.state.player.y !== y0,
    now,
  };
}

// =====================================================================
// DE-1. happy path: [E] → +N + лог + flash + gathered; повтор [E] —
//       no-op; шаг в сторону — панели (hint) НЕТ (000229: панель
//       подземелья убрана целиком — инфо-окно #hud)
// =====================================================================

test('000157.03-DE-1: happy path: шаг на клетку залежи → [E] → +2 в инвентаре + ds.log «Залежь: +2 <имя из каталога>» + hud-flash + gathered:true; повторный [E] — no-op; шаг в сторону — панели (hint) НЕТ (000229) (RED)', async () => {
  const h = await boot();
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.ok(g, 'globalThis.__game выставлен (main.js выполнен)');
  // Имя — из каталога (НЕ хардкод): coal → «Уголь».
  const coalName = G.getItem('coal').name;
  assert.ok(typeof coalName === 'string' && coalName.length > 0,
    'каталог: имя coal');
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon — состояние подземелья (отладочный вход)');
  const cell = asideDir(G, ds.dg);
  assert.ok(cell, 'FLOOR-клетка-сосед входа найдена (подземелье связное)');
  // Мутация contents — ПОЛНАЯ замена (000186-паттерн + deposits).
  ds.contents = depositContents(cell);
  // Шаг на клетку залежи (dungeonOnMove; render — синхронно).
  stepTo(h, cell.x, cell.y);
  // 000229: панель (hint) в подземелье УБРАНА — 0 .combat-state
  // (000247: строки «Залежь — [E]» нет нигде — панель удалена).
  assert.equal(hintText(h), '',
    '000229: .combat-state (hint) НЕТ — панель убрана (стоя на '
    + 'не-собранной залежи)');
  // [E] — сбор.
  pressE(h);
  // +N в инвентаре (coal reagent — одна стопка).
  assert.deepEqual(host(g.state.hero.inventory),
    [{ id: 'coal', qty: 2 }],
    '+2 coal в инвентаре (reagent-стопка)');
  // Лог-строка с каталожным именем.
  assert.ok(ds.log.some((l) => l === 'Залежь: +2 ' + coalName),
    'ds.log «Залежь: +2 ' + coalName + '» (имя из каталога): '
    + JSON.stringify(ds.log));
  // Отметка (однократность).
  assert.equal(ds.contents.deposits[0].gathered, true,
    'gathered: true (залежь собрана)');
  // hud-flash = та же строка (PE-6-стиль; после кадра; performance.now
  // заморожен на NOW=1000 < flashUntil=6000 — flash виден).
  mainFrameAt(h);
  const hud = String(h.hud.textContent);
  assert.ok(hud.endsWith('Залежь: +2 ' + coalName),
    'hud-flash = строка сбора (последняя строка HUD): ' + hud);
  // Повторный [E] на той же клетке — no-op: +N не дублируется,
  // лог не растёт, console.error не появляются.
  const logLen = ds.log.length;
  const errs0 = h.errors.length;
  pressE(h);
  assert.deepEqual(host(g.state.hero.inventory),
    [{ id: 'coal', qty: 2 }], 'повторный [E] — +N не дублируется');
  assert.equal(ds.log.length, logLen, 'повторный [E] — лог без прироста');
  assert.equal(h.errors.length, errs0,
    'повторный [E] — console.error не появились (no-op молчит)');
  // Шаг в сторону: панели (hint) НЕТ (000229: панель подземелья
  // убрана целиком — инфо-окно #hud).
  stepTo(h, ds.dg.entrance.x, ds.dg.entrance.y);
  assert.equal(hintText(h), '',
    '000229: .combat-state (hint) НЕТ после ухода с клетки');
});

// =====================================================================
// DE-2. отказ по весу: flash-отказ, слот НЕ пополнен, gathered не
//       ставится, ds.log без строки, БЕЗ авто-золота (D7); освобождение
//       → retry → +N
// =====================================================================

test('000157.03-DE-2: отказ по весу: 30 кг (лимит) → [E] → слот НЕ пополнен, gathered:false, ds.log БЕЗ «Залежь: +», flash «Залежь: не влезает в инвентарь», console.error не вырос, золота не начислено; освобождение → [E] → +N (retry) (RED)', async () => {
  const h = await boot();
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon — состояние подземелья (отладочный вход)');
  // 15 × wood_log (2 кг, reagent) = 30 кг = BASE_CARRY_WEIGHT (лимит
  // достигнут, 1 слот). B1-паттерн (000186).
  const r = g.actions.giveItem('wood_log', 15);
  assert.ok(r && r.ok,
    'giveItem: 30 кг = лимит веса — принято: ' + JSON.stringify(r));
  const cell = asideDir(G, ds.dg);
  assert.ok(cell, 'FLOOR-клетка-сосед входа найдена (подземелье связное)');
  ds.contents = depositContents(cell); // coal ×2 = 1 кг → 31 > 30
  stepTo(h, cell.x, cell.y);
  const gold0 = g.state.hero.gold;
  const errs0 = h.errors.length;
  pressE(h);
  // Отказ: инвентарь НЕ пополнен (wood_log на месте, coal нет).
  assert.deepEqual(host(g.state.hero.inventory),
    [{ id: 'wood_log', qty: 15 }],
    'отказ: слот НЕ пополнен (лимит веса)');
  // Залежь осталась (не отмечена — повтор после освобождения).
  assert.equal(ds.contents.deposits[0].gathered, false,
    'gathered: false (не влезло — заложь остаётся)');
  // Лог БЕЗ строки сбора (ds.log НЕ мутируется при отказе).
  assert.ok(!ds.log.some((l) => l.startsWith('Залежь: +')),
    'ds.log без «Залежь: +» (отказ не пишет строку): ' + JSON.stringify(ds.log));
  // НЕТ авто-золота (осознанная разница с сундуком 000186 — D7).
  assert.equal(g.state.hero.gold, gold0,
    'отказ: золота не начислено (D7 — предмет не теряется, а ждёт)');
  // Flash-отказ + console.error не появились (CI-V5-культура).
  mainFrameAt(h);
  assert.ok(String(h.hud.textContent).endsWith('Залежь: не влезает в инвентарь'),
    'flash «Залежь: не влезает в инвентарь»: ' + h.hud.textContent);
  assert.equal(h.errors.length, errs0,
    'console.error не вырос (отказ — тихий UX)');
  // Освобождение инвентаря (live-массив slots, мутация на месте) →
  // retry: [E] → +N.
  g.state.hero.inventory.length = 0;
  pressE(h);
  assert.deepEqual(host(g.state.hero.inventory),
    [{ id: 'coal', qty: 2 }], 'retry после освобождения: +2 coal');
  assert.equal(ds.contents.deposits[0].gathered, true,
    'retry: gathered: true');
});

// =====================================================================
// DE-3. приоритет выхода (000177): залежь на СОСЕДЕ, герой на
//       exit-тайле (spawn) → [E] → ВЫХОД; залежь НЕ потреблена;
//       saveNow-запись содержит залежь (pass-through D4, gathered:false)
// =====================================================================

test('000157.03-DE-3: приоритет выхода (000177): залежь на соседе, герой на exit-тайле (spawn) → [E] → ВЫХОД (день+1, состояние снято, dungeonUI закрыт, flash «Вы вышли из …», герой на мировом тайле) — залежь НЕ потреблена; сейв-запись содержит залежь (gathered:false, позиция сохранена) (RED)', async () => {
  const h = await boot();
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon — состояние подземелья (отладочный вход)');
  const cell = asideDir(G, ds.dg);
  assert.ok(cell, 'FLOOR-клетка-сосед входа найдена (подземелье связное)');
  ds.contents = depositContents(cell); // залежь на СОСЕДЕ; герой — spawn
  const day0 = g.state.day;
  // [E] на exit-тайле — выход ВЫИГРЫВАЕТ (000177), сбор не случается.
  pressE(h);
  assert.equal(g.dungeon, null, 'выход: состояние снято');
  assert.equal(G.dungeonUI.isActive(), false, 'выход: dungeonUI закрыт');
  assert.equal(g.state.day, day0 + 1, 'выход: день проходит (000177)');
  assert.ok(g.state.player.x === 0 && g.state.player.y === 0,
    'герой — обратно на спавне (0,0)');
  // Залежь НЕ потреблена (ветка сбора не сработала — герой не на ней).
  assert.equal(ds.contents.deposits[0].gathered, false,
    'залежь НЕ потреблена (приоритет выхода)');
  assert.deepEqual(host(g.state.hero.inventory), [],
    'инвентарь без coal (сбора не было)');
  mainFrameAt(h);
  assert.ok(String(h.hud.textContent).endsWith(
      'Вы вышли из ' + G.DUNGEON_NAMES[ds.dg.type] + '.'),
    'flash «Вы вышли из …» (НЕ строка сбора)');
  // Сейв: saveNow (finally выхода) записал запись — и она СОДЕРЖИТ
  // залежь (pass-through D4; RED: валидатор deposits отбрасывает).
  const save = readSave(h);
  const memKey = ds.worldKey + ':' + ds.dg.depth;
  const dm = save.data.dungeonMemory;
  assert.ok(dm && typeof dm === 'object' && !Array.isArray(dm),
    'сейв: секция dungeonMemory — объект');
  const rec = dm[memKey];
  assert.ok(rec,
    'сейв: запись «' + memKey + '» (worldKey + depth): '
    + JSON.stringify(Object.keys(dm || {})));
  const deps = rec && rec.contents && rec.contents.deposits;
  assert.ok(Array.isArray(deps) && deps.length === 1,
    'сейв: contents.deposits (pass-through D4, ПРАВО как opened): '
    + JSON.stringify(rec && rec.contents));
  assert.deepEqual(host(deps[0]),
    { id: 'd9', x: cell.x, y: cell.y, item: 'coal', amount: 2,
      gathered: false },
    'сейв: залежь сохранена с gathered:false и позицией');
  assert.equal(rec.lastVisitDay, day0,
    'сейв: lastVisitDay = день выхода (000153.01)');
});

// =====================================================================
// DE-4. сейв: СБОР залежи → выход → запись: contents.deposits[0]
//       .gathered === true (валидатор скопировал флаг — e2e-сторона
//       GRD-4); позиция сохранена
// =====================================================================

test('000157.03-DE-4: сейв: сбор залежи → выход → запись dungeonMemory: contents.deposits[0].gathered === true (валидатор скопировал флаг — e2e-сторона GRD-4); позиция и состав сохранены (RED)', async () => {
  const h = await boot();
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon — состояние подземелья (отладочный вход)');
  const cell = asideDir(G, ds.dg);
  assert.ok(cell, 'FLOOR-клетка-сосед входа найдена (подземелье связное)');
  ds.contents = depositContents(cell);
  // Сбор: шаг на клетку + [E].
  stepTo(h, cell.x, cell.y);
  pressE(h);
  assert.deepEqual(host(g.state.hero.inventory),
    [{ id: 'coal', qty: 2 }], 'сбор: +2 coal в инвентаре');
  assert.equal(ds.contents.deposits[0].gathered, true,
    'сбор: gathered: true (live contents)');
  // Шаг на выход + [E]-выход.
  stepTo(h, ds.dg.entrance.x, ds.dg.entrance.y);
  pressE(h);
  assert.equal(g.dungeon, null, 'выход: состояние снято');
  // Сейв: live contents (с gathered:true) → exitDungeon → memory →
  // saveNow → validateDungeonContents (должен скопировать deposits).
  const save = readSave(h);
  const memKey = ds.worldKey + ':' + ds.dg.depth;
  const dm = save.data.dungeonMemory;
  const rec = dm && dm[memKey];
  assert.ok(rec,
    'сейв: запись «' + memKey + '»: ' + JSON.stringify(Object.keys(dm || {})));
  const deps = rec && rec.contents && rec.contents.deposits;
  assert.ok(Array.isArray(deps) && deps.length === 1,
    'сейв: contents.deposits (pass-through D4): '
    + JSON.stringify(rec && rec.contents));
  assert.equal(deps[0].gathered, true,
    'сейв: gathered: true ПЕРСИСТИРУЕТ (валидатор скопировал флаг; '
    + '«сгорают при save/load» — устарело с 000157.03)');
  assert.deepEqual(host(deps[0]),
    { id: 'd9', x: cell.x, y: cell.y, item: 'coal', amount: 2,
      gathered: true },
    'сейв: состав и позиция залежи сохранены');
});

// =====================================================================
// DE-5. finally-инвариант 000170 через наш путь: throw в
//       G.playerUI.render (PE-5-инъекция) + залежь на соседе, герой на
//       exit-тайле → err null (try/catch exitLocation + try/catch onDay),
//       состояние снято, dungeonUI закрыт, день+1, saveNow (запись с
//       залежью, gathered:false — выход выиграл), движение мира живо —
//       новая [E]-ветка не ломает watchdog
// =====================================================================

test('000157.03-DE-5: 000170 finally через выход: throw в G.playerUI.render (инъекция PE-5) + залежь на соседе, герой на exit-тайле → err null, состояние снято, dungeonUI закрыт, день+1, ровно 1 console.error (catch onDay), saveNow (запись с залежью gathered:false), движение мира живо (RED)', async () => {
  const h = await boot();
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: ' + h.errors.join('; '));
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon — состояние подземелья (отладочный вход)');
  const cell = asideDir(G, ds.dg);
  assert.ok(cell, 'FLOOR-клетка-сосед входа найдена (подземелье связное)');
  // Руда на Соседе; герой на exit-тайле (spawn) — exit выигрывает.
  ds.contents = depositContents(cell);
  const day0 = g.state.day;
  // Инъекция (приём PE-5): throw в G.playerUI.render — onDay при
  // дне+1 его поймает СВОИМ try/catch (не exitLocation-кач).
  const origRender = G.playerUI.render;
  G.playerUI.render = () => { throw new Error('DE-5-inject: render'); };
  let err = null;
  try {
    pressE(h);
  } catch (e) {
    err = e;
  }
  G.playerUI.render = origRender;
  assert.equal(err, null,
    'исключение НЕ улетело вызывателю (try/catch exitLocation + '
    + 'try/catch onDay)');
  assert.equal(g.dungeon, null, 'finally: состояние снято');
  assert.equal(G.dungeonUI.isActive(), false, 'finally: dungeonUI закрыт');
  assert.equal(g.state.day, day0 + 1, 'день+1 (advanceDay до onDay)');
  // onDay-рендер упал в СВОЙ catch: ровно 1 console.error (exitLocation
  // — чистый).
  assert.equal(h.errors.length, 1,
    'ровно 1 console.error (catch onDay): ' + h.errors.join('; '));
  assert.ok(h.errors[0].includes('исключение при смене дня'),
    'строка catch onDay: ' + h.errors[0]);
  // finally: saveNow — запись существует и СОДЕРЖИТ залежь (pass-through
  // D4; RED: валидатор deposits отбрасывает).
  const save = readSave(h);
  const memKey = ds.worldKey + ':' + ds.dg.depth;
  const dm = save.data.dungeonMemory;
  const rec = dm && dm[memKey];
  assert.ok(rec,
    'finally: saveNow — запись «' + memKey + '»: '
    + JSON.stringify(Object.keys(dm || {})));
  const deps = rec && rec.contents && rec.contents.deposits;
  assert.ok(Array.isArray(deps) && deps.length === 1,
    'finally: сейв — contents.deposits (pass-through D4)');
  assert.equal(deps[0].gathered, false,
    'выход выиграл — залежь не потреблена (gathered:false в сейве)');
  assert.deepEqual({ x: deps[0].x, y: deps[0].y }, { x: cell.x, y: cell.y },
    'позиция залежи сохранена в сейве');
  // Движение мира после выхода живо (frame-гейт !inDungeon открыт;
  // watchdog 000170: новая [E]-ветка не ломает мир).
  const myMap = G.createMap(G.generateSeedPixels());
  const dir = passableDir(G, myMap, g.state.player.x, g.state.player.y);
  assert.ok(dir, 'сценарий: проходной сосед на спавне (0,0)');
  const r = holdUntilStep(h, keydownFor(dir[0], dir[1]), NOW + 100000);
  assert.ok(r.moved,
    'движение мира возобновилось после [E]-выхода (T5-смысл для нового '
    + 'пути)');
});

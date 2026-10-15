// Задача 000217: UI — панель «Отряд» (KeyC) невидима в городе/
// подземелье/бою — z-index 10 под оверлеем локации z-20 (баг-близнец
// 000206, задокументирован memory/000206-inventory-over-city.md,
// найден ретро-анализом tasks/result/000206-retro-20261014.md).
// Контракты И решение (корень бага, точный код, тест-карта SQ-0..SQ-7,
// подводные камни): memory/000217-squad-panel-over-location.md.
//
// Корень бага (верифицировано по коду): .squad-panel (src/ui.js
// buildSquad, child body) — z-10; экран города И подземелья — ОДИН
// непрозрачный оверлей .combat-overlay.dungeon-overlay z-20
// (src/dungeon-ui.js), боевой оверлей — .combat-overlay--combat z-20
// (src/combat-ui.js). Root stacking context: 20 > 10 → панель
// РЕНДЕРИТСЯ ПОД оверлеем и невидима. KeyC (src/main.js) — СВОБОДНА,
// выше ВСЕХ гейтов — панель реально открывается (isOpen true,
// display 'flex') в городе/подземелье/бою, но «провалена» — точный
// близнец бага 000206 (там [I], .char-panel).
//
// Фикс (контракт memory/000217-…): ОДИН общий хелпер
// applyPanelLayer (src/ui.js, тело playerUI.applyLayer бит-в-бит) +
// squadUI.applyLayer (замыкание на ленивую панель) + ОДИН guarded
// call в frame() (typeof, паттерн TV7) по той же 7-конъюнктной
// кондиции, что 000195/000206: !! (inDungeon || inCombat) &&
// !inNpc && !inBuilding && !inCraft && !inResurrect &&
// !renameInputActive() — inline zIndex '25' (открытая панель), ''
// (всё остальное/закрытая — базовый CSS z-10). index.html — 0
// изменений (базовый z-10 не меняется, как в 000206).
//
// Тесты (8; харнес — КОПИЯ конвенции tests/city-inventory-e2e.test.js
// + дубль dungeon-хелперов tests/dungeon-city-time-e2e.test.js:
// full-chain <script> из index.html в vm-песочнице (автоматически
// подхватывает изменённые src/ui.js + src/main.js), детерминированный
// мир G.generateSeedPixels, walkTiles + resolveCombat (000135),
// findCityFor/enterCity (bounded re-entry ≤3), dungeonStepTo/
// asideDir/enterDungeonClean (T-7 — прецедент [E]-выхода из
// подземелья); дублирование харнессов — принятая конвенция).
// ВАЖНО: в full-chain песочнице document-слушатели ОТБРАСЫВАЮТСЯ
// (NO-OP) → панель закрывать повторным KeyC, НЕ [Esc] (Esc-семантика
// пинится partial-chain tests/squad-panel.test.js).
//
// RED (4 — падают на master ОСМЫСЛЕННО: нет метода/подъёма, не
// синтаксис; зеленеют после фикса):
//   * SQ-0 (surface): typeof G.squadUI.applyLayer === 'function'
//     (master: undefined — объекта-метода нет, подъёма нигде нет).
//   * SQ-1 (город, ТЗ п.1, паттерн CI-1): enterCity (fp>=2,
//     buildings>=1; walkTiles + bounded re-entry ≤3) →
//     .dungeon-overlay в body + dungeonUI.isActive + kind 'city' →
//     KeyC → панель ОТКРЫТА (isOpen true, display 'flex', корень
//     .squad-panel в body — СУЩЕСТВУЮЩЕЕ поведение, зелёная часть)
//     → кадр → panel.style.zIndex === '25' (master: undefined —
//     осмысленный красный: подъёма нет).
//   * SQ-2 (подземелье, ТЗ п.1, паттерн CI-2): enterDungeon (debug)
//     → kind 'dungeon' + оверлей → KeyC → открыта → кадр → '25' →
//     KeyC (закрыть) → кадр → подъём снят (falsy) + локация ЦЕЛА
//     (isActive, kind, клетка героя не сдвинулась).
//   * SQ-3 (бой, ТЗ п.1, паттерн CI-9): мир → KeyC (открыта) →
//     startCombat (debug) → assert панель АВТО-ЗАКРЫТА (поведенческий
//     пин close-точки 000086) → KeyC (СВОБОДНА в бою — выше гейтов)
//     → кадр → '25' (паритет 000195/CI-9: панель СВЕРХ боевого
//     оверлея z-20) → KeyC (закрыть) → кадр → falsy.
//
// Зелёные гварды (4 — проходят ДО и ПОСЛЕ; фиксируют ГРАНИЦЫ
// контекстности, ТЗ п.2/п.3; срединные кадры — НАСТРОЙКА без
// ассерта '25', иначе гвард был бы красным до фикса):
//   * SQ-4 (мир, ТЗ п.3): KeyC → кадр → подъёма НЕТ (zIndex falsy —
//     базовый CSS z-10; панели нечего накрывать — оверлея нет) +
//     открывается/закрывается (KeyC ×2) (паритет CI-3).
//   * SQ-5 (выход из города, ТЗ п.2, паттерн CI-4): enterCity →
//     KeyC → кадр → [E] на ЕДИНОМ тайле-двери (000177, спавн на
//     двери) → выход (g.dungeon null, isActive false) → кадр →
//     **lift снят** + панель ЕЩЁ открыта (выход не закрывает —
//     существующее поведение) + работает (KeyC закрывает).
//   * SQ-6 (выход из подземелья, ТЗ п.2, прецедент T-7):
//     enterDungeon (чистый контент — путь без мобов/сундуков;
//     000135: бой в подземелье — только на тайле группы) → KeyC →
//     кадр → ping-pong exit→A→exit (dungeonStepTo ×2 — ходьба ВНУТРИ)
//     → [E] → выход → кадр → **lift снят** + панель открыта и
//     работает.
//   * SQ-7 (конец боя, ТЗ п.2, резолв-паттерн CI-6): мир →
//     startCombat → KeyC (открыта — старт боя её закрыл, 000086) →
//     кадр → resolveCombat (dealDamageToMob 9999 по живым + Space) →
//     кадр → **lift снят** (inCombat false) + панель ЕЩЁ открыта и
//     работает (конец боя squad НЕ закрывает — асимметрия c.result
//     000195, вне скоупа ТЗ; гвард НЕ ассертит авто-закрытие).
//
// Инварианты: существующие тесты НЕ правятся (пины CI-0..CI-11,
// 195-LIFT, DH-*, 000214/000215, squad-panel P1-P6/S1-S3, ui-panel,
// index-order, TV-*, svg, goldens, combat-детерминизм, save-*
// обязаны остаться зелёными без правок); ноль новых save-полей/RNG/
// <script>; CSS .squad-panel z-10 в index.html не меняется.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

// Цепочка скриптов — из index.html (не хардкод, паттерн main-visuals).
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));
const NOW = 1000; // performance.now() в песочнице заморожен на NOW

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

function makeContext2d(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

// --- «Снисходительный» DOM-элемент с деревом (dataset, closest,
// querySelectorAll) — дубль конвенции tests/city-interact.test.js. ---
function matchesSel(el, sel) {
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
  if (cls && !String(el.className || '').split(/\s+/).includes(cls)) {
    return false;
  }
  if (attr) {
    if (!attr[0].startsWith('data-')) return false;
    const v = el.dataset ? el.dataset[attr[0].slice(5)] : undefined;
    if (v === undefined) return false;
    return attr[1] === undefined ? true : String(v) === attr[1];
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
    // children хранят СУРЫЕ target (а не прокси): remove() ищет по
    // identity (дубль tests/city-interact.test.js).
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
    setAttribute(name, value) {
      if (name.startsWith('data-')) target.dataset[name.slice(5)] = value;
    },
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

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// --- Песочница: вся цепочка index.html (браузерная ветка UMD) ---
function bootSandbox() {
  const winListeners = {};
  const raf = [];
  const errors = [];
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
  // #game — WebGL (без него main.js уходит в фолбэк-ветку и не
  // стартует); #sprites — 2d со спаем (слой спрайтов).
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl() : makeContext2d(gameCanvas));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? makeContext2d(spriteCanvas) : null);
  const storage = makeStorage();
  const body = makeEl('body');
  const document = {
    createElement: (tag) => makeEl(tag),
    getElementById: (id) => (
      id === 'game' ? gameCanvas
        : id === 'sprites' ? spriteCanvas
          : id === 'hud' ? hud : null),
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
    // реально снимает (дубль tests/city-interact.test.js).
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
  // Image-стаб (паттерн main-visuals): assets/map.png ВСЕГДА onerror
  // → детерминированный фолбэк G.generateSeedPixels; остальные onload.
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
  for (const f of CHAIN) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox,
      { filename: f });
  }
  return { sandbox, winListeners, raf, errors, body, storage };
}

// Промывка микротасков (Image + loadMapPixels().then: карта, спавн,
// requestAnimationFrame(frame)).
const drain = () => new Promise((r) => setImmediate(r));

async function boot() {
  const h = bootSandbox();
  await drain();
  await drain();
  await drain();
  const g = h.sandbox.__game;
  assert.ok(g, 'globalThis.__game выставлен (main.js выполнен)');
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет (порядок цепочки): ' + h.errors.join('; '));
  // frame() main.js — единственный rAF-колбэк после старта; кадр пере
  // планирует себя (одна и та же функция) — frameFn валидна на любом
  // моменте. Кадр вызываем ЕЁ (dungeon-ui tick тоже живёт в rAF).
  h.frameFn = h.raf[h.raf.length - 1];
  return h;
}

// --- Ввод ---
// ВАЖНО: массив слушателей снапшотится ПЕРЕД диспетчем (паттерн B9):
// слушатель, зарегистрированный ВО ВРЕМЯ диспетча, текущее событие
// НЕ видит (семантика браузерного DOM).
function key(h, code, extra = {}) {
  const e = Object.assign(
    { code, preventDefault() {}, stopPropagation() {} }, extra);
  for (const fn of (h.winListeners['keydown'] || []).slice()) fn(e);
  return e;
}

function keyup(h, code, extra = {}) {
  const e = Object.assign({ code }, extra);
  for (const fn of (h.winListeners['keyup'] || []).slice()) fn(e);
  return e;
}

function press(h, code) {
  return key(h, code);
}

function release(h, code) {
  return keyup(h, code);
}

function keydownFor(dx, dy) {
  return dx === 1 ? 'ArrowRight' : dx === -1 ? 'ArrowLeft'
    : dy === 1 ? 'ArrowDown' : 'ArrowUp';
}

// Резолв боевого оверлея (паттерн walkTiles 000135): мобы 9999 →
// Space. Эфир НЕ убиваем.
function resolveCombat(G) {
  assert.equal(G.combatUI.isActive(), true, 'резолв: бой активен');
  const c = G.combatUI.current();
  for (const m of c.units.filter((x) => x.side === 'mob' && x.alive)) {
    G.combatInternals.dealDamageToMob(c, m, 9999);
  }
  assert.ok(c.result && c.result.outcome === 'victory',
    'резолв: победа (9999 по живым мобам)');
  G.combatUI.handleCode('Space');
  assert.equal(G.combatUI.isActive(), false,
    'резолв: бой закрыт (Space → finish)');
}

// --- Ходьба по миру (протокол city-screen/main-visuals) ---
// keydown(направление) → кадры frame(now) по +200 мс, пока игрок не
// перешёл (tryMove — в frame при now−lastMove ≥ stepMs; базовый
// stepMs = 420 мс, 000063) → keyup. Кадр делает ≤ ОДНОГО хода.
function walkTiles(h, now, tiles) {
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  for (const [tx, ty] of tiles) {
    const dx = tx - g.state.player.x, dy = ty - g.state.player.y;
    assert.ok(Math.abs(dx) + Math.abs(dy) === 1, 'BFS: шаг по соседнему тайлу');
    const code = keydownFor(dx, dy);
    press(h, code);
    let guard = 0;
    do {
      now += 200;
      h.frameFn(now);
    } while ((g.state.player.x !== tx || g.state.player.y !== ty)
      && ++guard < 10);
    release(h, code);
    assert.equal(g.state.player.x, tx,
      'сценарий: игрок перешёл на (' + tx + ', ' + ty + ') — x');
    assert.equal(g.state.player.y, ty,
      'сценарий: игрок перешёл на (' + tx + ', ' + ty + ') — y');
    // 000135: маршрут к городу может пересечь 5×5-зону триггерящей
    // группы — авторазрешение zone-боя после КАЖДОГО шага, без него
    // inCombat заморозит tryMove.
    if (G.combatUI.isActive()) resolveCombat(G);
  }
  // Осадочные кадры (глейд мувера и сглаживание камеры завершаются).
  for (let i = 0; i < 4; i++) {
    now += 200;
    h.frameFn(now);
  }
  return now;
}

// --- BFS по миру до целевого тайла. Промежуточные узлы: passable,
// БЕЗ групп мобов (шаг = startCombat) и БЕЗ входов (пещера/город —
// авто-вход сломает протокол); целевой тайл — проверка ДО исключения.
function findTile(G, myMap, start, isTarget, radius = 700) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const startKey = start.x + ',' + start.y;
  const visited = new Set([startKey]);
  const prev = new Map();
  let frontier = [start];
  for (let depth = 0; depth < radius && frontier.length; depth++) {
    const next = [];
    for (const cur of frontier) {
      for (const [dx, dy] of DIRS) {
        const nx = cur.x + dx, ny = cur.y + dy;
        const k = nx + ',' + ny;
        if (visited.has(k)) continue;
        const t = myMap.tileAt(nx, ny);
        if (!t.passable || t.hasMobGroup) continue;
        visited.add(k);
        prev.set(k, cur.x + ',' + cur.y);
        if (isTarget(t)) {
          const steps = [];
          let kk = k;
          while (kk !== startKey) {
            const [px, py] = kk.split(',').map(Number);
            steps.unshift([px, py]);
            kk = prev.get(kk);
          }
          return { tile: t, steps };
        }
        if (t.hasBuilding) continue; // вход (пещера/город) — не на пути
        next.push({ x: nx, y: ny });
      }
    }
    frontier = next;
  }
  return null;
}

// Город + RECOMPUTE содержимого (чистые функции 000106/000108 — те
// же входы, что и production: якорь, wealth из tileAt): layout от
// ЯКОРЯ, не от входного тайла (000105). Возврат: {tile, steps, fp,
// rec, layout, contents, ax, ay, wealth}.
function findCityFor(G, myMap, start, pred, radius = 700) {
  let info = null;
  const isCityTile = (t) => {
    if (!t.hasBuilding || t.building !== G.BUILDING_TYPES.NONE) return false;
    const rec = G.getBuilding(t.buildingId);
    if (!rec || rec.категория !== 'город') return false;
    const fp = rec.размер.ширина;
    const [ax, ay] = t.buildingAnchor;
    const layout = G.Cities.createCityLayout(ax, ay, fp);
    const contents = G.Cities.generateCityContents(layout, ax, ay,
      rec, t.buildingWealth);
    const i = { fp, rec, layout, contents, ax, ay,
      wealth: t.buildingWealth, tile: t };
    if (pred(i) === true) info = i;
    return info !== null;
  };
  const r = findTile(G, myMap, start, isCityTile, radius);
  return r ? Object.assign({ tile: r.tile, steps: r.steps }, info) : null;
}

// Безопасный ОДИН шаг в МИРЕ от тайла входа (000177: выход → герой
// на входном тайле; повторный вход требует шага С тайла и обратно).
// passable, без группы мобов (шаг = бой), без постройки (пещера/город
// — авто-вход сломает протокол). null — нет такого соседа.
function safeWorldNeighbor(G, myMap, from) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of DIRS) {
    const t = myMap.tileAt(from.x + dx, from.y + dy);
    if (!t.passable || t.hasMobGroup || t.hasBuilding) continue;
    return [from.x + dx, from.y + dy];
  }
  return null;
}

// Вход в город (walkTiles + страховка bounded re-entry ≤3): 000135 —
// zone-бой на входном шаге приоритетнее входа (два оверлея в одном
// кадре — сломанное состояние), вход откладывается на ПЕРВЫЙ
// успешный шаг после боя, приходящийся на тайл входа. Резолв (в
// walkTiles) → шаг от входа → шаг назад → кадры. defeatedAt-guard
// (main.js) — повторного боя той же группы нет: сходится за 1
// итерацию; лимит 3 — страховка сценария (ассерт ниже).
function enterCity(h, now, myMap, pred) {
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const found = findCityFor(G, myMap, g.state.player, pred);
  assert.ok(found,
    'сценарий: город достижим пешком (BFS, мир детерминирован)');
  now = walkTiles(h, now, found.steps);
  const entry = { x: found.tile.x, y: found.tile.y };
  for (let attempt = 0; !g.dungeon && attempt < 3; attempt += 1) {
    if (G.combatUI.isActive()) resolveCombat(G);
    const adj = safeWorldNeighbor(G, myMap, entry);
    assert.ok(adj, 'сценарий: безопасный сосед тайла входа есть');
    now = walkTiles(h, now, [adj, [entry.x, entry.y]]);
  }
  assert.ok(g.dungeon, 'сценарий: локация открыта (bounded re-entry ≤3)');
  assert.equal(g.dungeon.kind, 'city', 'экран города (kind city)');
  return { found, entry, now };
}

// --- Подземелье: debug-вход и шаги (дубль хелперов tests/
// dungeon-city-time-e2e.test.js; T-7 — прецедент [E]-выхода) ---

// Отладочный вход (g.actions.enterDungeon) + ЧИСТЫЙ контент: путь
// ping-pong без мобов/сундуков (000135: бой в подземелье — только
// на тайле группы; wanderStep не знает safe-зону — живой моб мог бы
// сломать сценарий боем). Паттерн enterDungeonClean (T-1/T-7).
function enterDungeonClean(h) {
  const g = h.sandbox.__game;
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon — состояние подземелья (отладочный вход)');
  ds.contents = { mobs: [], chests: [], seed: 1, step: 0 };
  return ds;
}

// FLOOR-клетка-сосед ВХОДА в порядке [[1,0],[-1,0],[0,1],[0,-1]]
// (подземелье связное, у входа ВСЕГДА есть FLOOR-сосед; выход
// исключён — 000177: выход === вход, на нём герой спавнит;
// stairsDown исключён ПОСТРОИТЕЛЬСТВУ — safe-зона Chebyshev 2
// вокруг входа/выхода, stairsDownFor).
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

// Один УСПЕШНЫЙ шаг героя в подземелье: keydown {code:'Arrow*'} →
// dungeon-ui (гейты isActive + !combatUI) → ctx.onMove → dungeonMove
// синхронно (1 клавиша = 1 клетка; кадры не нужны — NOW заморожен).
// Мир НЕ сдвигается: keydown main.js имеет гейт dungeonUI.isActive.
function dungeonStepTo(h, tx, ty) {
  const g = h.sandbox.__game;
  const dx = tx - g.dungeon.x, dy = ty - g.dungeon.y;
  assert.ok(Math.abs(dx) + Math.abs(dy) === 1,
    'шаг на соседнюю клетку (манхэттен = 1)');
  press(h, keydownFor(dx, dy));
  assert.equal(g.dungeon.x, tx, 'шаг прошёл: x (' + tx + ',' + ty + ')');
  assert.equal(g.dungeon.y, ty, 'шаг прошёл: y (' + tx + ',' + ty + ')');
}

// --- Элементы body ---
// Корень панели «Отряд» (.squad-panel — child body, src/ui.js
// buildSquad, document.body.appendChild).
function panelOf(h) {
  return findAll(h.body, '.squad-panel')[0] || null;
}

// Оверлей локации (.dungeon-overlay — child body, src/dungeon-ui.js).
function dungeonOverlayOf(h) {
  const ovs = findAll(h.body, '.dungeon-overlay');
  return ovs.length ? ovs[ovs.length - 1] : null;
}

// Оверлей боя (.combat-overlay--combat — child body,
// src/combat-ui.js).
function combatOverlayOf(h) {
  const ovs = findAll(h.body, '.combat-overlay--combat');
  return ovs.length ? ovs[ovs.length - 1] : null;
}

// ============================================================
// SQ-0..SQ-7
// ============================================================

test('000217 SQ-0 (surface, RED): Game.squadUI.applyLayer — функция (контекстный подъём панели «Отряд»)', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  assert.ok(G.squadUI, 'Game.squadUI (ui.js в цепочке)');
  assert.equal(typeof G.squadUI.applyLayer, 'function',
    'RED: surface squadUI — applyLayer (000217: подъём панели над '
    + 'локацией/боем; master: функция отсутствует)');
});

test('000217 SQ-1 (город, RED, ТЗ п.1): вход → KeyC → панель открыта и ВЫШЕ экрана города (zIndex 25 > 20)', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const { found, entry, now } = await enterCity(h, NOW, myMap,
    (c) => c.fp >= 2 && c.contents.buildings.length >= 1);
  assert.ok(found, 'сценарий: город найден (fp>=2, постройки)');
  assert.equal(g.dungeon.kind, 'city', 'kind city');
  assert.equal(G.dungeonUI.isActive(), true, 'dungeonUI активен (город)');
  assert.ok(dungeonOverlayOf(h),
    'экран города — .dungeon-overlay в body (оверлей z-20)');
  assert.deepEqual({ x: g.state.player.x, y: g.state.player.y }, entry,
    'герой — на входном тайле города');
  // KeyC выше ВСЕХ гейтов (main.js) — панель открывается в городе
  // (существующее поведение — зелёная часть; состояние
  // переключалось и до фикса).
  press(h, 'KeyC');
  assert.equal(G.squadUI.isOpen(), true, 'KeyC: панель открыта');
  const panel = panelOf(h);
  assert.ok(panel, 'корень .squad-panel в body');
  assert.equal(panel.style.display, 'flex', 'панель открыта (display flex)');
  // Кадр (frame-driven подъём — render() squad при входе НЕ
  // вызывается): после фикса frame() ставит подъём.
  h.frameFn(now + 16);
  assert.equal(panel.style.zIndex, '25',
    'RED: кадр — панель ПОДНЯТА над экраном города (inline zIndex 25 '
    + '> оверлей 20; master: undefined — «проваливается» под оверлей)');
});

test('000217 SQ-2 (подземелье, RED, ТЗ п.1): debug-вход → KeyC → панель ВЫШЕ экрана подземелья (zIndex 25); закрытие — подъём снят, локация цела', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon — состояние подземелья (отладочный вход)');
  assert.equal(g.dungeon.kind, 'dungeon', 'kind dungeon');
  assert.equal(G.dungeonUI.isActive(), true, 'dungeonUI активен');
  assert.ok(dungeonOverlayOf(h),
    'экран подземелья — .dungeon-overlay в body (оверлей z-20)');
  const heroCell = { x: g.dungeon.x, y: g.dungeon.y };
  press(h, 'KeyC');
  assert.equal(G.squadUI.isOpen(), true, 'KeyC: панель открыта в подземелье');
  const panel = panelOf(h);
  assert.ok(panel && panel.style.display === 'flex',
    'корень .squad-panel в body, открыта (display flex)');
  h.frameFn(NOW + 16);
  assert.equal(panel.style.zIndex, '25',
    'RED: кадр — панель ПОДНЯТА над экраном подземелья (inline zIndex '
    + '25; master: undefined — тот же оверлей, тот же баг)');
  // Закрытие повторным [C] (в full-chain песочнице document-слушатели
  // отброшены — Esc не работает; Esc-семантика — partial-chain).
  press(h, 'KeyC');
  assert.equal(G.squadUI.isOpen(), false, 'KeyC: панель закрыта');
  h.frameFn(NOW + 32);
  assert.ok(!panel.style.zIndex,
    'подъём снят после закрытия (zIndex falsy — базовый CSS z-10)');
  assert.equal(G.dungeonUI.isActive(), true, 'локация цела: dungeonUI активен');
  assert.equal(g.dungeon.kind, 'dungeon', 'локация цела: kind dungeon');
  assert.deepEqual({ x: g.dungeon.x, y: g.dungeon.y }, heroCell,
    'локация цела: клетка героя не сдвинулась');
});

test('000217 SQ-3 (бой, RED, ТЗ п.1): старт боя АВТО-закрыл панель (000086) → KeyC в бою → панель СВЕРХ боевого оверлея (zIndex 25)', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  assert.equal(g.dungeon, null, 'мир (локации нет)');
  press(h, 'KeyC');
  assert.equal(G.squadUI.isOpen(), true, 'KeyC: панель открыта в мире');
  // Debug-бой (000086): закрыл панель автоматически (поведенческий
  // пин close-точки в startCombatAt).
  const c0 = g.actions.startCombat();
  assert.ok(c0, 'startCombat — бой начат (отладочный)');
  assert.equal(G.combatUI.isActive(), true, 'боевой оверлей активен');
  assert.ok(combatOverlayOf(h),
    'боевой оверлей — .combat-overlay--combat в body (z-20)');
  assert.equal(G.squadUI.isOpen(), false,
    '000086: старт боя закрыл панель (существ. поведение)');
  // KeyC выше ВСЕХ гейтов — панель переключается и в бою (паритет
  // 000195/CI-9: панель над боевым оверлеем).
  press(h, 'KeyC');
  assert.equal(G.squadUI.isOpen(), true,
    'KeyC в бою: панель снова открыта');
  const panel = panelOf(h);
  assert.ok(panel && panel.style.display === 'flex', 'панель открыта');
  h.frameFn(NOW + 16);
  assert.equal(panel.style.zIndex, '25',
    'RED: кадр — подъём «25» (панель СВЕРХ боевого оверлея z-20; '
    + 'master: undefined)');
  // Закрытие повторным [C] (full-chain песочница: Esc не работает).
  press(h, 'KeyC');
  assert.equal(G.squadUI.isOpen(), false, 'KeyC: панель закрыта');
  h.frameFn(NOW + 32);
  assert.ok(!panel.style.zIndex,
    'подъём снят после закрытия (zIndex falsy — базовый CSS z-10)');
});

test('000217 SQ-4 (мир, пин, ТЗ п.3): KeyC → кадр → подъёма НЕТ (zIndex falsy — базовый z-10); панель открывается/закрывается', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  assert.equal(g.dungeon, null, 'мир (локации нет)');
  press(h, 'KeyC');
  assert.equal(G.squadUI.isOpen(), true, 'KeyC: панель открыта в мире');
  const panel = panelOf(h);
  assert.ok(panel && panel.style.display === 'flex',
    'корень .squad-panel в body, открыта (display flex)');
  h.frameFn(NOW + 16);
  assert.ok(!panel.style.zIndex,
    'мир: подъёма НЕТ (zIndex falsy — базовый CSS z-10, как раньше); '
    + 'панель и так видима — оверлея нет');
  press(h, 'KeyC');
  assert.equal(G.squadUI.isOpen(), false, 'KeyC: панель закрыта');
});

test('000217 SQ-5 (город, пин, ТЗ п.2): выход с ОТКРЫТОЙ панелью — [E] на едином тайле-двери, lift снят, панель ЕЩЁ открыта', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const { now } = await enterCity(h, NOW, myMap, (c) => c.fp >= 2);
  assert.equal(G.dungeonUI.isActive(), true, 'в городе');
  // 000177: вход = выход — единый тайл, герой спавнится НА нём.
  press(h, 'KeyC');
  assert.equal(G.squadUI.isOpen(), true, 'KeyC: панель открыта в городе');
  const panel = panelOf(h);
  assert.ok(panel && panel.style.display === 'flex', 'панель открыта');
  // Кадр — НАСТРОЙКА (до фикса подъёма нет, после — '25'; пин —
  // состояние ПОСЛЕ выхода, паттерн CI-4).
  h.frameFn(now + 16);
  // Выход (000177): [E] на едином тайле → dungeon-ui keydown →
  // ctx.onInteract → locationOnInteract → exitCity (синхронно).
  press(h, 'KeyE');
  release(h, 'KeyE');
  assert.equal(g.dungeon, null, '[E] на двери: состояние снято (выход)');
  assert.equal(G.dungeonUI.isActive(), false, 'dungeonUI закрыт');
  h.frameFn(now + 32);
  assert.ok(!panel.style.zIndex,
    'подъём снят после выхода (zIndex falsy — базовый CSS z-10)');
  assert.equal(G.squadUI.isOpen(), true,
    'панель ЕЩЁ открыта (выход панель не закрывает — существ. '
    + 'поведение, CI-4-семантика)');
  press(h, 'KeyC');
  assert.equal(G.squadUI.isOpen(), false,
    'панель работает: KeyC закрывает (после выхода)');
});

test('000217 SQ-6 (подземелье, пин, ТЗ п.2): выход с ОТКРЫТОЙ панелью — ходьба exit→A→exit + [E], lift снят, панель открыта и работает', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const ds = enterDungeonClean(h);
  assert.equal(g.dungeon.kind, 'dungeon', 'kind dungeon');
  assert.equal(G.dungeonUI.isActive(), true, 'dungeonUI активен');
  assert.ok(dungeonOverlayOf(h),
    'экран подземелья — .dungeon-overlay в body (оверлей z-20)');
  press(h, 'KeyC');
  assert.equal(G.squadUI.isOpen(), true, 'KeyC: панель открыта в подземелье');
  const panel = panelOf(h);
  assert.ok(panel && panel.style.display === 'flex', 'панель открыта');
  // Кадр — НАСТРОЙКА (до фикса подъёма нет, после — '25'; пин —
  // состояние ПОСЛЕ выхода, прецедент T-7).
  h.frameFn(NOW + 16);
  // Ходьба ВНУТРИ: ping-pong exit→A→exit (000177: герой спавнит НА
  // exit-тайле; A — FLOOR-сосед входа, stairsDown исключён
  // построительно; чистый контент — боя на пути нет).
  const A = asideDir(G, ds.dg);
  assert.ok(A, 'FLOOR-клетка-сосед входа найдена');
  dungeonStepTo(h, A.x, A.y);
  if (G.combatUI.isActive()) resolveCombat(G); // 000135 (страховка)
  dungeonStepTo(h, ds.dg.entrance.x, ds.dg.entrance.y);
  if (G.combatUI.isActive()) resolveCombat(G); // 000135 (страховка)
  assert.equal(g.dungeon.x, ds.dg.exit.x, 'герой на exit-клетке: x');
  assert.equal(g.dungeon.y, ds.dg.exit.y, 'герой на exit-клетке: y');
  press(h, 'KeyE');
  release(h, 'KeyE');
  assert.equal(g.dungeon, null, '[E] на exit-клетке: выход');
  assert.equal(G.dungeonUI.isActive(), false, 'dungeonUI закрыт');
  h.frameFn(NOW + 32);
  assert.ok(!panel.style.zIndex,
    'подъём снят после выхода (zIndex falsy — базовый CSS z-10)');
  assert.equal(G.squadUI.isOpen(), true,
    'панель ЕЩЁ открыта (выход панель не закрывает — существ. '
    + 'поведение)');
  press(h, 'KeyC');
  assert.equal(G.squadUI.isOpen(), false,
    'панель работает: KeyC закрывает (после выхода)');
});

test('000217 SQ-7 (конец боя, пин, ТЗ п.2): resolveCombat → lift снят (inCombat false); панель ЕЩЁ открыта и работает (конец боя squad НЕ закрывает — асимметрия c.result, вне скоупа)', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  assert.equal(g.dungeon, null, 'мир (локации нет)');
  const c = g.actions.startCombat();
  assert.ok(c, 'startCombat — бой начат (отладочный)');
  assert.equal(G.combatUI.isActive(), true, 'боевой оверлей активен');
  assert.equal(G.squadUI.isOpen(), false,
    '000086: старт боя закрыл панель (существ. поведение)');
  // KeyC СВОБОДНА в бою (выше гейтов) — открыла.
  press(h, 'KeyC');
  assert.equal(G.squadUI.isOpen(), true, 'KeyC в бою: панель открыта');
  const panel = panelOf(h);
  assert.ok(panel && panel.style.display === 'flex', 'панель открыта');
  // Кадр — НАСТРОЙКА (до фикса подъёма нет, после — '25'; пин —
  // состояние ПОСЛЕ конца боя, резолв-паттерн CI-6).
  h.frameFn(NOW + 16);
  // Конец боя (победа) — мобы 9999 → Space → finish.
  resolveCombat(G);
  assert.equal(G.combatUI.isActive(), false, 'бой закрыт (резолв)');
  h.frameFn(NOW + 32);
  assert.ok(!panel.style.zIndex,
    'подъём снят после конца боя (inCombat false — базовый CSS z-10)');
  assert.equal(G.squadUI.isOpen(), true,
    'панель ЕЩЁ открыта (конец боя squad не закрывает — существ. '
    + 'асимметрия c.result, ВНЕ скоупа ТЗ; гвард НЕ ассертит '
    + 'авто-закрытие)');
  press(h, 'KeyC');
  assert.equal(G.squadUI.isOpen(), false,
    'панель работает: KeyC закрывает (после боя)');
});

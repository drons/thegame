// Задача 000131: «Лагерь на карте: появление в игре» — e2e
// (СТАДИЯ КРАСНЫХ ТЕСТОВ, vm-полная цепочка index.html).
//
// Структурный сценарий (контракт §8, memory/000131-camp-placement.md):
// исполняем ВЕСЬ <script>-цепочку из index.html в vm-песочнице
// (паттерн tests/city-screen.test.js: DOM/WebGL/Image-стабы,
// детерминированный мир — assets/map.png всегда onerror →
// G.generateSeedPixels ≡ decodePng('assets/map.png') побайтово),
// ведём героя ПЕШКОМ к ближайшему лагерю (BFS + keydown + кадры
// frame(now), как в игре) и проверяем весь игровой путь появления:
//   CP-6 ходьба 30 шагов < steps_per_day (день НЕ прошёл), игрок на
//       тайле лагеря, HUD: «Здесь: лагерь  ([E] Кочевник, действия)»;
//   CP-7 [E] → оверлей действий (единый путь 000071): ровно 3 строки
//       «Диалог»/«Костёр»/«Барахолка» (data-buid dialog/fire/market);
//       Digit1 → npcUI с Кочевником (NPC 000018, постройки [47]);
//       Esc → диалог закрыт (стек: оверлей закрылся при выполнении);
//   CP-8 [E] → Digit3 («Барахолка») → панель персонажа (вкладка
//       «Магазин»); стойка по ключу РЕАЛЬНОГО тайла '-18,-12'
//       (≠ синтетического '40,40' из 000095); seed — формула
//       (hash2(x,y,0x43414d50) ^ ((day+1)·0x9E3779B9)) >>> 0; сток ≡
//       makeCampShop(−18,−12,1,wealth 1,рекорд 47); «Костёр» (Digit2)
//       → день +1 → НОВЫЙ сток (respawn_days 1), тот же (tile, day) —
//       тот же сток;
//   CP-9 ДВЕ независимые vm-песочницы (два boot) — один мир:
//       nearest-лагерь на тех же координатах, сток (tile, day 1)
//       идентичен;
//   CP-10 спрайт лагеря assets/sprites/buildings/camp.svg рисуется
//       в кадре РОВНО 1×: drawImage(camp.svg, worldToScreen(якоря),
//       1·zoom, 1·zoom) (лагерь 1×1, проход 2 drawSprites main.js).
//
// Механика лагеря (костёр/барахолка/кочевник) — 000095 (в master,
// B24–B29 зелёные РЕГРЕССИЯ — не трогаем); 000131 добавляет только
// РАЗМЕЩЕНИЕ — поэтому все сценарии ниже исполняют МИРОВОЙ путь
// ([E] → buildingActions.toggle → buildingRecForTile → getBuilding(47)
// → oверлей), а не синтетические вызовы onBuildingAction.
//
// Красные (падают до реализации, осмысленно): лагеря нет в мире —
// findNearest(camp) → null («сценарий: лагерь достижим пешком»);
// SETTINGS.camp_channel/campSprite/camp.svg отсутствуют.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { SAVE_KEY } = require('../src/save.js');
const P = require('../src/player.js');

const ROOT = path.join(__dirname, '..');

// Цепочка скриптов — из index.html (не хардкод, паттерн main-visuals).
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));

const VIEW_W = 1280;
const VIEW_H = 720;
const NOW = 1000;
const EPS = 1e-6;
const CAMP_ID = 47;
const CAMP_SVG = 'assets/sprites/buildings/camp.svg';
// Сид стока барахолки (src/items.js, 000095) — НЕ сид канала
// размещения (у канала сид-константы НЕТ).
const CAMP_STOCK_SEED = 0x43414d50;

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

// --- Canvas 2D-стаб: каждый ВЫЗОВ метода → el.drawCalls как
// [имя, args, fillStyle] ---

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

// --- Снисходительный DOM-элемент. setAttribute пишет в dataset
// (строки оверлея building-ui — data-buid) ---

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
    setAttribute(k, v) {
      if (String(k).startsWith('data-')) {
        target.dataset[String(k).slice(5)] = v;
      }
    },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    remove() {},
    blur() {},
  };
  if (tag === 'canvas') {
    target.width = 0;
    target.height = 0;
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

// --- localStorage-стаб (наблюдение saveNow) ---

function makeStorage(seed) {
  const store = {};
  // 000200: ДОСЕЯННЫЙ сейв (v1) ДО запуска цепочки — main.js читает
  // его синхронно при загрузке (паттерн tests/save-restore.test.js):
  // посеять после bootSandbox() поздно (restoreFromSave уже прошёл).
  if (seed != null) store[SAVE_KEY] = JSON.stringify(seed);
  return {
    store,
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k)
      ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
}

// Оболочка досеянного сейва актуальной версии (v1, 000200).
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
  // #game — WebGL (без него main.js уходит в фолбэк-ветку);
  // #sprites — 2d со спаем (слой спрайтов; CP-10 — его drawCalls).
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl() : makeContext2d(gameCanvas));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? makeContext2d(spriteCanvas) : null);
  const storage = makeStorage(seed);
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
    innerWidth: VIEW_W,
    innerHeight: VIEW_H,
    location: { search: '' },
    localStorage: storage,
    addEventListener: (t, f) => {
      (winListeners[t] || (winListeners[t] = [])).push(f);
    },
    removeEventListener() {},
  };
  // Image-стаб (паттерн main-visuals): src ставится ПОСЛЕ
  // onload/onerror. assets/map.png ВСЕГДА onerror → детерминированный
  // G.generateSeedPixels (≡ map.png побайтово); остальные — onload.
  // На каждом изображении метка __asset (CP-10 отличает вызовы).
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
  return {
    sandbox, winListeners, raf, warns, errors,
    gameCanvas, spriteCanvas, hud, storage,
    body: document.body, // DOM-хелперы оверлеев ищут .combat-overlay/.npc-overlay
  };
}

// Промывка микротасков (загрузки Image + loadMapPixels().then).
const drain = () => new Promise((r) => setImmediate(r));

async function boot(seed) {
  const h = bootSandbox(seed);
  await drain();
  await drain();
  await drain();
  const g = h.sandbox.__game;
  assert.ok(g, 'globalThis.__game выставлен (main.js выполнен)');
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет (порядок цепочки): ' + h.errors.join('; '));
  // frame() main.js — единственный rAF-колбэк после старта (пере
  // планирует себя); кадр вызываем ЕЁ (hudUpdate/цикл дня).
  h.frameFn = h.raf[h.raf.length - 1];
  return h;
}

// --- Ходьба (паттерн walkTiles tests/city-screen.test.js) ---

function keydownFor(dx, dy) {
  return dx === 1 ? 'ArrowRight' : dx === -1 ? 'ArrowLeft'
    : dy === 1 ? 'ArrowDown' : 'ArrowUp';
}

function press(h, code) {
  const e = {
    code, key: code,
    prevented: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() {},
  };
  for (const fn of h.winListeners['keydown'] || []) fn(e);
  return e;
}

function release(h, e) {
  for (const fn of h.winListeners['keyup'] || []) fn(e);
}

// Действия клавиатуры (KeyE/DigitN/Escape) — без keyup.
function key(h, code) {
  return press(h, code);
}

function walkTiles(h, now, tiles) {
  const g = h.sandbox.__game;
  for (const [tx, ty] of tiles) {
    const dx = tx - g.state.player.x, dy = ty - g.state.player.y;
    assert.ok(Math.abs(dx) + Math.abs(dy) === 1, 'BFS: шаг по соседнему тайлу');
    const e = press(h, keydownFor(dx, dy));
    // Лимит 10 кадров = 2 с: закрывает любой интервал шага от
    // MIN_MOVE_INTERVAL_MS (60 мс) и выше.
    let guard = 0;
    do {
      now += 200;
      h.frameFn(now);
    } while ((g.state.player.x !== tx || g.state.player.y !== ty)
      && ++guard < 10);
    release(h, e);
    assert.equal(g.state.player.x, tx,
      'сценарий: игрок перешёл на (' + tx + ', ' + ty + ') — x');
    assert.equal(g.state.player.y, ty,
      'сценарий: игрок перешёл на (' + tx + ', ' + ty + ') — y');
  }
  // Осадочные кадры (глейд мувера и сглаживание камеры завершаются).
  for (let i = 0; i < 4; i++) {
    now += 200;
    h.frameFn(now);
  }
  return now;
}

// Кадр с управляемым now: возвращает ТОЛЬКО вызовы этого кадра
// (паттерн frameAt tests/main-visuals.test.js).
function frameAt(h, now) {
  const n0 = h.spriteCanvas.drawCalls.length;
  h.frameFn(now);
  return h.spriteCanvas.drawCalls.slice(n0);
}

// BFS по миру до ближайшего тайла-лагеря — 1:1 findNearest
// (city-screen.test.js L365–407): промежуточные узлы passable &&
// !hasMobGroup (моб = startCombat — мир остановится) && НЕ
// CAVE/NONE-входы (авто-вход ломает протокол); ЦЕЛЬ проверяется
// ДО исключения (лагерь — NONE-вход!).
function findNearest(G, myMap, start, isTarget, radius = 600) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const startKey = start.x + ',' + start.y;
  const visited = new Set([startKey]);
  let frontier = [start];
  const prev = new Map();
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
          return { target: { x: nx, y: ny }, t, steps, depth };
        }
        if (t.hasBuilding
            && (t.building === G.BUILDING_TYPES.CAVE_ENTRANCE
                || t.building === G.BUILDING_TYPES.NONE)) continue;
        next.push({ x: nx, y: ny });
      }
    }
    frontier = next;
  }
  return null;
}

// Лагерь: hasBuilding && buildingId === 47 (building = NONE).
function isCampTile(t) {
  return !!(t && t.hasBuilding && t.buildingId === CAMP_ID);
}

// --- DOM-хелперы оверлеев (паттерн tests/building-effects.test.js) ---

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

function textOf(n) {
  let s = String(n.textContent || '');
  for (const ch of n.children || []) s += textOf(ch);
  return s;
}

// Оверлей действий постройки (building-ui: div.combat-overlay,
// БЕЗ 'npc-overlay').
function findOverlay(h) {
  const all = findAll(h.body, '.combat-overlay');
  return all.find((o) => !String(o.className).includes('npc-overlay'))
    || null;
}

function findNpcOverlay(h) {
  return findAll(h.body, '.npc-overlay')[0] || null;
}

// Строка действия по id (dataset.buid).
function findRow(overlay, id) {
  return findAll(overlay, '[data-buid]')
    .find((r) => r.dataset.buid === id) || null;
}

// Ходьба к ближайшему лагерю (общая часть CP-6..CP-11).
async function bootAndWalkToCamp(seed) {
  const h = await boot(seed);
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findNearest(G, myMap, g.state.player, isCampTile);
  assert.ok(found,
    'сценарий: лагерь достижим пешком от спавна (радиус 600) '
    + '(красный: канал размещения не реализован — buildingId 47 '
    + 'в мире нет)');
  const now = walkTiles(h, NOW, found.steps);
  return { h, G, g, myMap, found, now };
}

// ====================================================================
// CP-6: ходьба к лагерю — 30 шагов < steps_per_day (день НЕ прошёл),
// игрок на тайле лагеря, HUD: «Здесь: лагерь  ([E] Кочевник,
// действия)» (hud.js: buildingNameHint 47 → «лагерь», eHint
// npc+effects).
// ====================================================================
test('CP-6: пешком до лагеря — 30 шагов, день не прошёл, HUD-строка «Здесь: лагерь  ([E] Кочевник, действия)»', async () => {
  const { h, G, g, found } = await bootAndWalkToCamp();
  assert.deepEqual(found.target, { x: -18, y: -12 },
    'nearest лагерь — (−18,−12) (golden, контракт §5)');
  assert.equal(found.steps.length, 30,
    'до лагеря — 30 шагов (golden, e2e-семантика)');
  const perDay = G.GlobalSettings.SETTINGS.steps_per_day;
  assert.ok(typeof perDay === 'number' && perDay > 0,
    'SETTINGS.steps_per_day — live-чтение (НЕ хардкод)');
  assert.ok(found.steps.length < perDay,
    `30 шагов < steps_per_day (${perDay}) — запас: день НЕ сдвинется`);
  assert.equal(g.state.player.x, -18, 'игрок на тайле лагеря — x');
  assert.equal(g.state.player.y, -12, 'игрок на тайле лагеря — y');
  assert.equal(g.state.day, 1, 'день не прошёл (30 < steps_per_day)');
  assert.equal(g.state.stepsToday, 30, '30 шагов за день');
  // HUD (кадр после осадки): строка «Здесь:» (двойной пробел —
  // eHint: name + '  ([E] …)').
  const hudLine = String(h.hud.textContent);
  assert.ok(hudLine.includes('Здесь: лагерь  ([E] Кочевник, действия)'),
    'HUD: «Здесь: лагерь  ([E] Кочевник, действия)»: ' + hudLine);
});

// ====================================================================
// CP-7: [E] на тайле лагеря — оверлей действий (единый путь 000071):
// ровно 4 строки «Диалог»/«Костёр»/«Барахолка»/«Полный отдых»
// (data-buid dialog/fire/market/fullrest; NPC 000018 + эффекты
// каталога 000047; fullrest — append 000200, позиции цифр 1/2/3 не
// сдвигаются). Digit1 → npcUI с Кочевником (оверлей при этом ЗАКРЫТ
// — executeAction закрывает ДО onAction, паттерн B4); Esc → диалог
// закрыт.
// ====================================================================
test('CP-7: [E] → оверлей (4 действия), Digit1 → Кочевник, Esc — стек', async () => {
  const { h, G } = await bootAndWalkToCamp();
  // [E] → оверлей (НЕ прямой npcUI).
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true,
    'единый путь: сначала оверлей действий');
  assert.equal(G.npcUI.isActive(), false, 'npcUI НЕ открывается сразу');
  assert.equal(G.playerUI.isOpen(), false, 'панель персонажа закрыта');
  const ov = findOverlay(h);
  assert.ok(ov, 'оверлей .combat-overlay подвешен к body');
  // Заголовок — каталожная запись 47 (название_карты || название,
  // первая буква нижним): «лагерь».
  assert.ok(textOf(ov).includes('лагерь'),
    'заголовок — «лагерь»: ' + textOf(ov));
  // Ровно 4 строки: Диалог (NPC) + эффекты каталога
  // (fire, market, fullrest — append 000200).
  for (const id of ['dialog', 'fire', 'market', 'fullrest']) {
    assert.ok(findRow(ov, id), 'строка действия ' + id + ' в оверлее');
  }
  assert.equal(findAll(ov, '[data-buid]').length, 4,
    'ровно 4 действия (диалог + костёр + барахолка + полный отдых)');
  assert.ok(textOf(findRow(ov, 'dialog')).includes('Диалог'),
    'строка 1 — «Диалог»');
  assert.ok(textOf(findRow(ov, 'fire')).includes('Костёр'),
    'строка 2 — «Костёр»');
  assert.ok(textOf(findRow(ov, 'market')).includes('Барахолка'),
    'строка 3 — «Барахолка»');
  assert.ok(textOf(findRow(ov, 'fullrest')).includes('Полный отдых'),
    'строка 4 — «Полный отдых» (append 000200)');
  // Digit1 → диалог NPC; оверлей закрылся САМ (executeAction:
  // close() ДО onAction — паттерн B4/000071).
  key(h, 'Digit1');
  assert.equal(G.buildingUI.isActive(), false,
    'оверлей закрыт (действие выполнено)');
  assert.equal(G.npcUI.isActive(), true, 'диалог Кочевника открыт');
  const nov = findNpcOverlay(h);
  assert.ok(nov, 'оверлей .npc-overlay подвешен к body');
  assert.ok(textOf(nov).includes('Кочевник'),
    'диалог — Кочевник (NPC 000018, постройки [47])');
  // Esc → диалог закрыт (стек: верхний слой); панель не участвует.
  key(h, 'Escape');
  assert.equal(G.npcUI.isActive(), false, 'Esc закрыл диалог');
  assert.equal(G.buildingUI.isActive(), false,
    'оверлей уже закрыт (executeAction)');
  assert.equal(G.playerUI.isOpen(), false, 'панель персонажа не открыта');
});

// ====================================================================
// CP-8: [E] → Digit3 («Барахолка») → панель «Магазин»; стойка по
// ключу РЕАЛЬНОГО тайла '-18,-12' (≠ '40,40'); seed — формула
// (tile, day); сток ≡ makeCampShop(−18,−12,1,wealth 1,рекорд);
// «Костёр» (Digit2) → день +1 → НОВЫЙ сток (respawn_days 1).
// ====================================================================
test('CP-8: Барахолка — стойка «-18,-12», seed-формула, stock golden, Костёр → день+1 → новый сток', async () => {
  const { h, G, g } = await bootAndWalkToCamp();
  // [E] → Digit3 («Барахолка») → панель персонажа (вкладка «Магазин»).
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, 'оверлей открыт');
  key(h, 'Digit3');
  assert.equal(G.buildingUI.isActive(), false,
    'оверлей закрыт (действие выполнено)');
  assert.equal(G.playerUI.isOpen(), true,
    'панель персонажа открыта (вкладка «Магазин»)');
  // Стойка — по ключу РЕАЛЬНОГО тайла лагеря (000095: ключ 'x,y'
  // ТАЙЛА, не позиции игрока; в e2e игрок НА тайле лагеря).
  const stocks = g.campStocks;
  assert.ok(!('40,40' in stocks),
    'стойки синтетического тайла «40,40» НЕТ (мир — не B-тест)');
  const entry1 = stocks['-18,-12'];
  assert.ok(entry1, 'стойка РЕАЛЬНОГО лагерного тайла «-18,-12»');
  assert.equal(entry1.day, 1, 'стойка — день 1');
  const seed1 = (G.hash2(-18, -12, CAMP_STOCK_SEED)
    ^ ((1 + 1) * 0x9E3779B9)) >>> 0;
  assert.equal(entry1.seed, seed1,
    'seed — формула (hash2(x,y,0x43414d50) ^ ((day+1)·0x9E3779B9)) >>> 0');
  // Сток — golden: makeCampShop(−18,−12, day 1, wealth 1, запись 47)
  // (wealth тайла — golden §5).
  const rec = G.getBuilding(CAMP_ID);
  assert.ok(rec && rec.id === CAMP_ID, 'каталог: запись 000047');
  const shop1 = G.makeCampShop(-18, -12, 1, 1, rec);
  assert.ok(shop1, 'makeCampShop — сток лагеря (виды каталога)');
  assert.equal(shop1.seed, seed1,
    'seed makeCampShop — та же формула (кросс-проверка)');
  // Обе стороны → JSON: makeCampShop возвращает объекты vm-реалма,
  // deepStrictEqual (strict) различает прототипы реалмов.
  assert.deepEqual(JSON.parse(JSON.stringify(entry1.stock)),
    JSON.parse(JSON.stringify(shop1.stock)),
    'сток стойки ≡ makeCampShop(−18,−12, day 1, w1) (vm-реалм → JSON)');
  // «Костёр» (Digit2): панель закрыта оверлеем (стек 000096),
  // оверлей → Digit2 → clock.rest(): день +1, шаги 0.
  key(h, 'KeyE');
  assert.equal(G.playerUI.isOpen(), false,
    'открытие оверлея закрывает панель персонажа (стек)');
  assert.equal(G.buildingUI.isActive(), true, 'оверлей reopened');
  key(h, 'Digit2');
  assert.equal(G.buildingUI.isActive(), false,
    'оверлей закрыт (действие выполнено)');
  assert.equal(g.state.day, 2, 'Костёр: день прошёл (1 → 2)');
  assert.equal(g.state.stepsToday, 0, 'Костёр: шаги дня сброшены');
  // Кадр: hud campShopFor rotated стойку по дню (respawn_days 1).
  h.frameFn(NOW + 200);
  const entry2 = g.campStocks['-18,-12'];
  assert.ok(entry2, 'стойка «-18,-12» жива после дня');
  assert.equal(entry2.day, 2, 'стойка — день 2 (респаун)');
  const seed2 = (G.hash2(-18, -12, CAMP_STOCK_SEED)
    ^ ((2 + 1) * 0x9E3779B9)) >>> 0;
  assert.equal(entry2.seed, seed2,
    'seed дня 2 — формула (tile, day 2)');
  assert.notEqual(entry2.seed, seed1, 'новый день — новый seed');
  const shop2 = G.makeCampShop(-18, -12, 2, 1, rec);
  assert.deepEqual(JSON.parse(JSON.stringify(entry2.stock)),
    JSON.parse(JSON.stringify(shop2.stock)),
    'сток дня 2 ≡ makeCampShop(−18,−12, day 2, w1)');
});

// ====================================================================
// CP-9: детерминизм между мирами — ДВЕ независимые vm-песочницы
// (два boot): nearest-лагерь на тех же координатах (тот же путь),
// сток (tile, day 1) идентичен (ноль Math.random — сид (tile, day)).
// ====================================================================
test('CP-9: два boot — один мир: nearest-лагерь и сток (tile, day 1) идентичны', async () => {
  const a = await bootAndWalkToCamp();
  const b = await bootAndWalkToCamp();
  // Тот же nearest-лагерь и тот же путь.
  assert.deepEqual(b.found.target, a.found.target,
    'nearest лагерь — те же координаты (детерминизм мира)');
  assert.deepEqual(b.found.steps, a.found.steps, 'путь — идентичен');
  // Сток (tile, day 1) — идентичен в двух независимых мирах.
  const s1 = a.g.campStocks['-18,-12'];
  const s2 = b.g.campStocks['-18,-12'];
  // Стойка появляется при ПЕРВОМ обращении campShopFor — в e2e это
  // кадр HUD на тайле лагеря (после ходьбы). Оба мира — день 1.
  assert.ok(s1 && s2, 'стойки «-18,-12» в обоих мирах');
  assert.equal(s1.day, 1, 'мир A: стойка дня 1');
  assert.equal(s2.day, 1, 'мир B: стойка дня 1');
  assert.equal(s1.seed, s2.seed, 'seed — одинаков (сид (tile, day))');
  assert.deepEqual(JSON.parse(JSON.stringify(s1.stock)),
    JSON.parse(JSON.stringify(s2.stock)),
    'один (tile, day) — один сток (vm-реалм → JSON)');
});

// ====================================================================
// CP-10: спрайт лагеря — рисуется в кадре РОВНО 1× (проход 2
// drawSprites main.js: лагерь 1×1, drawImage(img,
// worldToScreen(якоря), 1·zoom, 1·zoom)). Кадр — после переходов к
// лагерю (в спавн-кадре лагерей 0 — зонд §5).
// 000238: техническая синхронизация — лагерю дали КАДРЫ костра
// (CAMP_FRAMES[47], 4 кадра): ожидаемый asset — ЗЕРКАЛО строгого
// селектора buildingAsset main.js на now кадра (typeof-гард: до
// волны — статичная camp.svg, после — ТЕКУЩИЙ кадр camp_N.svg).
// ====================================================================
test('CP-10: спрайт лагеря в кадре 1× на worldToScreen(−18,−12), размер 1·zoom (000238: текущий кадр костра)', async () => {
  const { h, G, now } = await bootAndWalkToCamp();
  const g = h.sandbox.__game;
  // 000238: зеркало селектора main.js (строгая готовность):
  // campFrames(47) — текущий кадр на now; нет селектора (RED) —
  // статичная база.
  const campFrames = typeof G.campFrames === 'function'
    ? G.campFrames(CAMP_ID) : null;
  const campAsset = (campFrames && campFrames.length > 1)
    ? campFrames[G.buildingFrameIndex(now + 200, -18, -12,
          campFrames.length)]
    : CAMP_SVG;
  // Свежий кадр после осадки (walkTiles уже отрисовала 4 кадра).
  const calls = frameAt(h, now + 200);
  const campDraws = calls.filter((c) => c[0] === 'drawImage'
    && c[1][0]
    && c[1][0].__asset === campAsset);
  assert.equal(campDraws.length, 1,
    'спрайт лагеря (' + campAsset + ') нарисован РОВНО 1× '
    + '(красный 000131: campSprite/camp.svg не существуют, лагерь '
    + 'не в allAssetPaths и не рисуется прохождением 2)');
  const [, a] = campDraws[0];
  // Позиция/размер — из ЖИВОГО состояния (cam/zoom ПОСЛЕ кадра;
  // updateCamera идёт ДО drawSprites — точность без терпимости,
  // паттерн main-visuals).
  const st = g.state;
  const p = G.worldToScreen(-18, -12, st.cam.x, st.cam.y,
    st.zoom, VIEW_W, VIEW_H);
  assert.ok(Math.abs(a[1] - p.x) < EPS,
    `позиция x — worldToScreen(якоря): ${a[1]} ≠ ${p.x}`);
  assert.ok(Math.abs(a[2] - p.y) < EPS,
    `позиция y — worldToScreen(якоря): ${a[2]} ≠ ${p.y}`);
  assert.ok(Math.abs(a[3] - st.zoom) < EPS,
    `размер w = 1·zoom: ${a[3]} ≠ ${st.zoom}`);
  assert.ok(Math.abs(a[4] - st.zoom) < EPS,
    `размер h = 1·zoom: ${a[4]} ≠ ${st.zoom}`);
});

// ====================================================================
// CP-11 (задача 000200): «Полный отдых» в лагере — e2e (МИРОВОЙ путь,
// 30 шагов от спавна — день НЕ сдвигается): hero pre-seed {hp:1,
// mp:1, gold:100}; [E] → оверлей 4 строки (dialog/fire/market/
// fullrest); Digit4 → день НЕ прошёл (КЛЮЧЕВОЕ отличие от Костра —
// CP-8-семантика НЕ переносится), stepsToday без изменений, hero hp
// полный (live) / mp полный ЧЕРЕЗ сейв (g.state.hero.mp отсутствует),
// gold 100→90, flash «Полный отдых: HP и MP восстановлены (−10 з.)»,
// saveNow (день тот же), БЕЗ «-18,-12:fullrest» в
// buildingOncePerDay (лимит раз-в-день НЕТ).
// Красный: 3 строки (строки fullrest нет — каталогового поля и
// реестровой записи нет).
// ====================================================================
test('CP-11: 000200 лагерь [E] → Digit4 («Полный отдых») — день НЕ прошёл, gold 100→90, hp/mp полные, БЕЗ марки', async () => {
  const hero0 = Object.assign(P.createCharacter(),
    { hp: 1, mp: 1, gold: 100 });
  const { h, G, g, found } = await bootAndWalkToCamp(
    seedSave({ day: 1, hero: hero0 }));
  assert.deepEqual(found.target, { x: -18, y: -12 },
    'nearest лагерь — (−18,−12) (тот же мир, golden)');
  assert.equal(g.state.day, 1,
    'день 1 (pre-seed; 30 шагов < steps_per_day)');
  assert.equal(g.state.stepsToday, 30, '30 шагов за день');
  const d0 = P.derived(hero0);
  // [E] → оверлей: 4 строки (fullrest — 4-я, Digit4).
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, '[E] открывает оверлей');
  const ov = findOverlay(h);
  assert.ok(ov, 'оверлей подвешен к body');
  const rows = findAll(ov, '[data-buid]');
  assert.deepEqual(rows.map((r) => r.dataset.buid),
    ['dialog', 'fire', 'market', 'fullrest'],
    'строки: dialog + fire + market + fullrest (append 000200; '
    + 'красный: 3 строки — строки fullrest нет)');
  const rowF = findRow(ov, 'fullrest');
  assert.ok(rowF, 'строка fullrest в оверлее (красный: строки нет)');
  assert.ok(textOf(rowF).includes('Полный отдых'),
    'имя строки «Полный отдых»');
  assert.equal(rowF.disabled, false,
    'строка доступна (золото строку не гасит, 000200)');
  key(h, 'Digit4');
  assert.equal(G.buildingUI.isActive(), false, 'оверлей закрылся');
  assert.equal(g.state.day, 1,
    'день ОСТАЁТСЯ 1 (000200: ДЕНЬ НЕ ПРОХОДИТ — отличие от Костра)');
  assert.equal(g.state.stepsToday, 30, 'stepsToday без изменений');
  assert.equal(g.state.hero.hp, d0.maxHP,
    'hero hp — полное (live, 1 → ' + d0.maxHP + ')');
  assert.equal(g.state.hero.gold, 90,
    'hero gold 100→90 (цена 10 из каталога 000047)');
  h.frameFn(NOW + 200);
  assert.ok(String(h.hud.textContent)
    .includes('Полный отдых: HP и MP восстановлены (−10 з.)'),
    'hudFlash — точная строка (U+2212): ' + h.hud.textContent);
  // saveNow: день тот же, gold 90, hp/mp полные; БЕЗ марки.
  const saveRaw = h.storage.getItem(SAVE_KEY);
  assert.ok(saveRaw, 'сейв в localStorage (saveNow вызван)');
  const save = JSON.parse(saveRaw);
  assert.equal(save.data.day, 1, 'save: день 1 (день не прошёл)');
  assert.equal(save.data.hero.gold, 90, 'save: gold 90');
  assert.equal(save.data.hero.hp, d0.maxHP, 'save: hp полное');
  assert.equal(save.data.hero.mp, d0.maxMP,
    'save: mp полное (live g.state.hero.mp отсутствует — через сейв)');
  const marks = save.data.buildingOncePerDay || {};
  for (const k of Object.keys(marks)) {
    assert.ok(!k.endsWith(':fullrest'),
      'НЕТ отметки fullrest в buildingOncePerDay: ' + k);
  }
});

// ====================================================================
// CP-12 (Задача 000238, RED): костёр лагеря — анимация. На якоря
// (−18,−12) — drawImage ТЕКУЩЕГО КАДРА camp_N.svg (таблица
// CAMP_FRAMES[47], ключ — buildingId) РОВНО 1×, 1·zoom — а НЕ
// статичной базы camp.svg (кадр ЗАМЕСТИЛ базу); через 800 мс
// (BUILDING_FRAME_MS) — кадр ДРУГОЙ; тот же now — идентично (D10);
// индекс кадра — buildingFrameIndex(now, якорь, 4); errors 0.
// Контракт: memory/000238-building-anim-extension.md (§3, §6).
// КРАСНЫЙ: экспорт G.campFrames отсутствует (typeof 'undefined').
// (Строгая готовность лагеря — RM-CAMP-2 в
// tests/global-map-draw.test.js, где есть WebGL-слой маркеров.)
// ====================================================================
test('CP-12 (Задача 000238, RED): костёр — кадр camp_N.svg (не camp.svg) на якоря (−18,−12) 1×, 1·zoom; +800 мс — кадр другой; D10; errors 0', async () => {
  const { h, G, now } = await bootAndWalkToCamp();
  const g = h.sandbox.__game;
  assert.equal(typeof G.campFrames, 'function',
    'sprites.js: экспорт campFrames(buildingId) — отсутствует (Задача 000238)');
  assert.equal(typeof G.buildingFrameIndex, 'function',
    'sprites.js: экспорт buildingFrameIndex (механизм 000224)');
  const frames = Array.from(G.campFrames(CAMP_ID));
  assert.equal(frames.length, 4, 'CAMP_FRAMES[47] — 4 кадра костра');
  const st = g.state;
  const p = G.worldToScreen(-18, -12, st.cam.x, st.cam.y,
    st.zoom, VIEW_W, VIEW_H);
  // drawImage КАДРА на ТОЧНОМ угле якоря размером 1·zoom (лагерь
  // 1×1; герой рисуется центром на (−18.5,−12.5) 1.15·zoom — не
  // совпадает с фильтром).
  const campFrameAt = (calls) => calls.filter((c) => c[0] === 'drawImage'
    && c[1][0]
    && frames.includes(c[1][0].__asset)
    && Math.abs(c[1][1] - p.x) < EPS && Math.abs(c[1][2] - p.y) < EPS
    && Math.abs(c[1][3] - st.zoom) < EPS
    && Math.abs(c[1][4] - st.zoom) < EPS);
  const c1 = frameAt(h, now + 200);
  const d1 = campFrameAt(c1);
  assert.equal(d1.length, 1,
    'костёр — ТЕКУЩИЙ КАДР camp_N.svg на якоря (−18,−12) РОВНО 1×, '
    + '1·zoom');
  assert.notEqual(d1[0][1][0].__asset, CAMP_SVG,
    'нарисован КАДР, а не статичная база camp.svg ('
    + d1[0][1][0].__asset + ')');
  assert.equal(d1[0][1][0].__asset,
    frames[G.buildingFrameIndex(now + 200, -18, -12, 4)],
    'кадр = campFrames(47)[buildingFrameIndex(now, якорь, 4)]');
  // Статичная база в кадре НЕ рисуется (кадр заместил базу).
  assert.equal(c1.filter((c) => c[0] === 'drawImage' && c[1][0]
    && c[1][0].__asset === CAMP_SVG).length, 0,
    'статичная camp.svg в кадре не рисуется (строгая замена)');
  // +800 мс (один BUILDING_FRAME_MS) — кадр сменился (анимация).
  const c2 = frameAt(h, now + 1000);
  const d2 = campFrameAt(c2);
  assert.equal(d2.length, 1, 'через 800 мс — кадр костра на якоря');
  assert.notEqual(d2[0][1][0].__asset, d1[0][1][0].__asset,
    'через 800 мс кадр ДРУГОЙ (анимация костра видна): '
    + d1[0][1][0].__asset + ' → ' + d2[0][1][0].__asset);
  assert.equal(d2[0][1][0].__asset,
    frames[G.buildingFrameIndex(now + 1000, -18, -12, 4)],
    '+800 мс — индекс шагнул на 1');
  // D10: повторный рендер на ТОМ ЖЕ now — идентичен (тот же кадр).
  const c3 = frameAt(h, now + 1000);
  const d3 = campFrameAt(c3);
  assert.equal(d3.length, 1, 'D10: рендер на том же now — кадр на якоря');
  assert.equal(d3[0][1][0].__asset, d2[0][1][0].__asset,
    'D10: тот же now — тот же кадр');
  assert.equal(h.errors.length, 0, 'ошибок нет: ' + h.errors.join('; '));
});

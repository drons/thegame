// Задача 000158.04: сбор природного лута — e2e, ПОЛНАЯ ЦЕПОЧКА
// index.html в vm (паттерн tests/camp-map-e2e.test.js: DOM/WebGL/
// Image-стабы, детерминированный мир — assets/map.png ВСЕГДА onerror
// → G.generateSeedPixels ≡ decodePng('assets/map.png') побайтово;
// performance.now() заморожен (NOW = 1000); ходьба ПЕШКОМ — keydown
// + кадры frame(now), как в игре).
//
// Контракт: memory/000158.04-loot-collect.md:
//   * тайл несёт t.loot = { item: id } | null (000158.03, map.js —
//     НЕ ТРОГАЕМ); видимость — G.lootVisible(collectedLoot, x, y)
//     (day.js) с live Map'ом collectedLoot (main.js);
//   * [E] (единый роутер buildingActions.toggle) на тайле с ВИДИМЫМ
//     лутом → G.addItem(hero, id) → успех: collectedLoot.set('x,y',
//     clock.day) → saveNow → flash «Собрано: <имя>» → playerRender;
//   * раздел сейва collectedLoot (отдельный от defeatedAt): restore —
//     raw==null → тихо (старый сейв), G.restoreDayMap (INVALID →
//     отброшены), future-day (день > clock.day) → отброшен; onDay —
//     зачистка G.dueForRespawn(collectedLoot, day) ПОСЛЕ defeatedAt
//     (live respawn_days — ТОТ ЖЕ параметр, что у мобов);
//   * __game.collectedLoot — getter-КОПИЯ (объект, мутации не
//     попадают в состояние); ctx HUD — live Map (строка «[E]
//     Собрать: <имя>»); деградация «старая map.js» (нет поля loot) —
//     console.error 1× (000053), игра не ломается.
//
// Детерминированный мир (node-реплика ≡ vm-миру): спавн (0,0) —
// трава, без лута; ближайший лут-тайл (-1,1) — root_rock «Каменный
// корень» (ход 2 шага: (-1,0)→(-1,1)); второй — (-2,1) berry_wild
// «Дикая ягода» (3 шага). Все пути BFS: passable && !hasMobGroup
// (моб — startCombat остановил бы мир), без CAVE/NONE-входов
// (авто-вход). Ходы мелкие — смена дня в сценарии НЕ происходит
// (steps_per_day = 40); день меняется ТОЛЬКО g.actions.setDay (LM3).
//
// Красные (падают ДО реализации, осмысленно — отсутствие функции,
// не синтаксис): строка HUD-подсказки нет; [E] no-op (инвентарь/
// collectedLoot/сейв не меняются); getter __game.collectedLoot нет;
// раздел сейва нет; onDay-зачистки нет; console.error-гард нет.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createMap } = require('../src/map.js');
const { decodePng } = require('./png.js');
const { SAVE_KEY } = require('../src/save.js');
const { ITEMS } = require('../src/items-data.js');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));

// Node-реплика мира (≡ vm-миру побайтово, см. шапку).
const { width, height, data } = decodePng('assets/map.png');
const myMap = createMap({ width, height, data });
const nameOf = (id) => (ITEMS.find((i) => i.id === id) || { name: id }).name;

const VIEW_W = 1280;
const VIEW_H = 720;
const NOW = 1000;

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

// --- Canvas 2D-стаб ---

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

// --- Снисходительный DOM-элемент ---

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
      return () => undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

// --- localStorage-стаб (наблюдение saveNow) ---

function makeStorage() {
  const store = {};
  return {
    store,
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k)
      ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
}

// --- Песочница: вся цепочка index.html (браузерная ветка UMD) ---
//
// pre.save — JSON-строка сейва, ПРЕДВАРИТЕЛЬНО записанная в
// localStorage (LM4: restore-сценарии). Backdoor Game.__liveMap —
// инъекция ПЕРЕД main.js: обёртка createMap ловит ЖИВОЙ инстанс
// карты (LM5: деградация «старая map.js» — патч tileAt). UMD-скрипты
// копируют Game (Object.assign({}, …)), поэтому обёртка ставится на
// объект, который main.js снимет в G (последний до main.js).

function bootSandbox(pre = {}) {
  const winListeners = {};
  const raf = [];
  const warns = [];
  const errors = [];
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl() : makeContext2d(gameCanvas));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? makeContext2d(spriteCanvas) : null);
  const storage = makeStorage();
  if (pre.save !== undefined) storage.setItem(SAVE_KEY, pre.save);
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
  // Image-стаб: assets/map.png ВСЕГДА onerror → детерминированный
  // G.generateSeedPixels (≡ map.png побайтово); остальные — onload.
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
    if (f === 'main.js') {
      vm.runInContext(
        '(function(){var G=globalThis.Game;' +
        'if(G&&typeof G.createMap==="function"){' +
        'G.__origCreateMap=G.createMap;' +
        'G.createMap=function(){var m=G.__origCreateMap' +
        '.apply(null,arguments);G.__liveMap=m;return m;};}})();',
        sandbox, { filename: '__backdoor-livemap.js' });
    }
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox,
      { filename: f });
  }
  return {
    sandbox, winListeners, raf, warns, errors,
    gameCanvas, spriteCanvas, hud, storage,
    body: document.body,
  };
}

// Промывка микротасков (загрузки Image + loadMapPixels().then).
const drain = () => new Promise((r) => setImmediate(r));

async function boot(pre) {
  const h = bootSandbox(pre);
  await drain();
  await drain();
  await drain();
  const g = h.sandbox.__game;
  assert.ok(g, 'globalThis.__game выставлен (main.js выполнен)');
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет (порядок цепочки): ' + h.errors.join('; '));
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

function key(h, code) {
  return press(h, code);
}

function walkTiles(h, now, tiles) {
  const g = h.sandbox.__game;
  for (const [tx, ty] of tiles) {
    const dx = tx - g.state.player.x, dy = ty - g.state.player.y;
    assert.ok(Math.abs(dx) + Math.abs(dy) === 1,
      'BFS: шаг по соседнему тайлу');
    const e = press(h, keydownFor(dx, dy));
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
  for (let i = 0; i < 4; i++) {
    now += 200;
    h.frameFn(now);
  }
  return now;
}

// beforeunload → saveNow (main.js L815) — принудительный сейв.
function fireSave(h) {
  for (const fn of h.winListeners['beforeunload'] || []) fn({});
}

// BFS по node-реплике до лут-тайла (1:1 findNearest camp-map-e2e).
function findLoot(G, start, isTarget, radius = 600) {
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
          return { target: { x: nx, y: ny }, t, steps };
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

// Ход к ближайшему луту (сценарий всех LM*): (-1,1) root_rock,
// шаги [(-1,0), (-1,1)] — 2 шага (день НЕ проходит).
function walkToNearestLoot(h, now) {
  const res = findLoot(h.sandbox.Game, { x: 0, y: 0 }, (t) =>
    t.loot != null);
  assert.ok(res, 'сценарий: ближайший лут достижим пешком');
  assert.deepEqual(res.target, { x: -1, y: 1 },
    'сценарий: ближайший лут — (-1,1)');
  assert.equal(res.t.loot.item, 'root_rock', 'сценарий: Каменный корень');
  now = walkTiles(h, now, res.steps);
  return { now, res };
}

// Форма героя — 1:1 bootWithSave tests/save.test.js (000072).
const HERO_SAVE = {
  name: 'Смоук', level: 2, xp: 10, totalXp: 100, gold: 50,
  hp: 20, mp: 10, points: 1,
  primary: { strength: 2, dexterity: 1, constitution: 1,
    intelligence: 1, wisdom: 1, charisma: 1 },
  secondary: { forge: 3 },
  skillXp: {},
  spells: ['spark'],
};

// Оболочка сейва v1 (shell save.js: { version, savedAt, data }).
function saveShell(data) {
  return JSON.stringify({
    version: 1, savedAt: new Date(NOW).toISOString(), data,
  });
}

// =====================================================================
// LM1 — базовый сценарий: ходьба → подсказка → [E] → инвентарь/
// ключ/сейв/флэш → подсказка исчезла → повторный [E] no-op.
// =====================================================================

test('LM1. 000158.04 e2e: ходьба к луту, подсказка, [E] → addItem + collectedLoot["x,y"]=день + saveNow + flash; подсказка исчезает; повторный [E] — no-op', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  // Инвентарь ДО: предмета нет (свежий герой).
  assert.ok(!(g.state.hero.inventory || []).some(
    (s) => s.id === 'root_rock'),
    'сценарий: предмета нет в инвентаре до сбора');
  const { now: n0, res } = walkToNearestLoot(h, NOW);
  const K = res.target.x + ',' + res.target.y; // "-1,1"
  // Подсказка HUD на лут-тайле.
  assert.ok(h.hud.textContent.includes('[E] Собрать: Каменный корень'),
    'HUD: подсказка «[E] Собрать: <имя>» (красный: строки нет): ' +
    h.hud.textContent.replace(/\n/g, ' | '));
  // [E] — сбор.
  key(h, 'KeyE');
  let now = n0 + 200;
  h.frameFn(now);
  // Инвентарь: +1 (root_rock — reagent, стакается).
  const slot = (g.state.hero.inventory || []).find(
    (s) => s.id === 'root_rock');
  assert.ok(slot, 'инвентарь: предмет появился (красный: [E] no-op)');
  assert.equal(slot.qty, 1, 'инвентарь: qty 1');
  // Состояние: ключ «-1,1» → день сбора (1).
  assert.equal((g.collectedLoot || {})[K], 1,
    '__game.collectedLoot: ключ → день (красный: getter/ключ нет)');
  // Сейв: раздел collectedLoot в localStorage (saveNow при сборе).
  const raw = h.storage.store[SAVE_KEY];
  assert.ok(raw, 'saveNow: сейв записан при сборе');
  const saved = JSON.parse(raw);
  assert.ok(saved.data && saved.data.collectedLoot,
    'сейв: раздел collectedLoot (красный: раздела нет)');
  assert.equal(saved.data.collectedLoot[K], 1,
    'сейв: ключ → день 1');
  // Флэш «Собрано: <имя>».
  assert.ok(h.hud.textContent.includes('Собрано: Каменный корень'),
    'флэш «Собрано: <имя>» (красный: флэша нет)');
  // Подсказка исчезла (собрано → lootVisible false).
  now += 200;
  h.frameFn(now);
  assert.ok(!h.hud.textContent.includes('[E] Собрать:'),
    'подсказка исчезла после сбора');
  // Повторный [E] — no-op: инвентарь не меняется.
  const before = JSON.stringify(g.state.hero.inventory);
  key(h, 'KeyE');
  now += 200;
  h.frameFn(now);
  assert.equal(JSON.stringify(g.state.hero.inventory), before,
    'повторный [E] — no-op (qty не растёт)');
});

// =====================================================================
// LM2 — __game.collectedLoot: getter-КОПИЯ (plain object, не live
// Map); мутация копии не попадает в состояние.
// =====================================================================

test('LM2. 000158.04 e2e: __game.collectedLoot — копия (plain object, не Map); мутация копии не утекает в состояние', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const { now: n0, res } = walkToNearestLoot(h, NOW);
  const K = res.target.x + ',' + res.target.y;
  key(h, 'KeyE');
  let now = n0 + 200;
  h.frameFn(now);
  // Getter: plain object (не Map — у Map есть has/clear).
  const c1 = g.collectedLoot;
  assert.ok(c1 && typeof c1 === 'object',
    '__game getter collectedLoot (красный: getter отсутствует)');
  assert.equal(typeof c1.has, 'undefined',
    'plain object — НЕ live Map (прямая ссылка запрещена)');
  assert.equal(c1[K], 1, 'ключ → день сбора');
  // Мутация копии — НЕ попадает в состояние.
  c1['9,9'] = 42;
  const c2 = g.collectedLoot;
  assert.equal(c2['9,9'], undefined,
    'мутация копии не утекает в состояние');
  assert.equal(c2[K], 1, 'настоящий ключ на месте');
  // HUD не «заражён» мутацией: тайл (-9,-9)… — проверка через
  // повторный getter: «9,9» не виден как собранный.
  assert.ok(!('9,9' in (g.collectedLoot || {})),
    'состояние чистое: чужого ключа нет');
});

// =====================================================================
// LM3 — respawn «как у мобов»: собран → скрыт; на день
// dayC + respawn_days − 1 ключ ещё есть; на день dayC + respawn_days
// onDay-зачистка → лут снова виден; повторный сбор (qty 2).
// respawn_days — live из GlobalSettings (ТОТ ЖЕ параметр, что у
// мобов; новых настроек НЕТ).
// =====================================================================

test('LM3. 000158.04 e2e: respawn-цикл — key живёт до дня деньСбора+respawn_days, onDay-зачистка возвращает лут, повторный сбор (qty 2)', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const { now: n0, res } = walkToNearestLoot(h, NOW);
  const K = res.target.x + ',' + res.target.y;
  key(h, 'KeyE');
  let now = n0 + 200;
  h.frameFn(now);
  const dayC = g.state.day; // 1 (ход 2 шага — день не прошёл)
  assert.equal(dayC, 1, 'сценарий: сбор на 1-й день');
  assert.equal((g.collectedLoot || {})[K], dayC,
    'марка: ключ → день сбора (красный: [E] no-op)');
  const rd = G.GlobalSettings.SETTINGS.respawn_days; // live (= 3)
  // День dayC + rd − 1: ещё рано — ключ на месте, лута нет.
  g.actions.setDay(dayC + rd - 1);
  now += 200;
  h.frameFn(now);
  assert.equal((g.collectedLoot || {})[K], dayC,
    'день ' + (dayC + rd - 1) + ': key жив (рано, ' +
    (rd - 2) + ' < ' + rd + ')');
  assert.ok(!h.hud.textContent.includes('[E] Собрать:'),
    'день ' + (dayC + rd - 1) + ': лут невидим (подсказки нет)');
  // День dayC + rd: onDay-зачистка (dueForRespawn) — ключ удалён.
  g.actions.setDay(dayC + rd);
  now += 200;
  h.frameFn(now);
  assert.equal((g.collectedLoot || {})[K], undefined,
    'день ' + (dayC + rd) + ': key удалён onDay-зачисткой ' +
    '(красный: зачистки нет)');
  assert.ok(h.hud.textContent.includes('[E] Собрать: Каменный корень'),
    'день ' + (dayC + rd) + ': лут СНОВА виден (подсказка вернулась)');
  // Повторный сбор: qty 2, новая марка = текущий день.
  key(h, 'KeyE');
  now += 200;
  h.frameFn(now);
  const slot = (g.state.hero.inventory || []).find(
    (s) => s.id === 'root_rock');
  assert.equal(slot && slot.qty, 2, 'повторный сбор: qty 2');
  assert.equal((g.collectedLoot || {})[K], dayC + rd,
    'новая марка = день повторного сбора');
});

// =====================================================================
// LM4 — раздел сейва: restore (валидный ключ живёт; INVALID/future-
// day отброшены), сериализация (секция в сейве; «старый» ключ не
// возвращается), старый сейв БЕЗ поля → {} + версия 1 не поднята.
// =====================================================================

test('LM4. 000158.04 e2e: сейв collectedLoot — (a) валидный ключ restore + ресейв; (b) INVALID + future-day отброшены, мусор не возвращается; (c) старый сейв без поля → {}, версия 1', async () => {
  // (a) Валидный ключ '-1,1': 1 — restore: лут НЕ виден, [E] no-op;
  // ресейв: ключ в сейве (не потерян).
  {
    const h = await boot({ save: saveShell({
      day: 1, steps: 0,
      position: { x: 0, y: 0 },
      hero: HERO_SAVE,
      collectedLoot: { '-1,1': 1 },
    }) });
    const g = h.sandbox.__game;
    assert.equal((g.collectedLoot || {})['-1,1'], 1,
      '(a) restore: валидный ключ восстановлен (красный: restore нет)');
    // Ходим на (-1,1): подсказки НЕТ (собрано).
    let now = walkTiles(h, NOW, [[-1, 0], [-1, 1]]);
    assert.ok(!h.hud.textContent.includes('[E] Собрать:'),
      '(a) на собранном тайле подсказки нет');
    // [E] — no-op (предмета нет, не появится).
    key(h, 'KeyE');
    now += 200;
    h.frameFn(now);
    assert.ok(!(g.state.hero.inventory || []).some(
      (s) => s.id === 'root_rock'),
      '(a) [E] no-op: предмет не собран повторно');
    // Ресейв (beforeunload → saveNow): ключ жив в сейве.
    fireSave(h);
    const saved = JSON.parse(h.storage.store[SAVE_KEY]);
    assert.equal(saved.data.collectedLoot &&
      saved.data.collectedLoot['-1,1'], 1,
      '(a) ресейв: валидный ключ не потерян');
  }
  // (b) Мусор + future-day: 'abc': 3 (INVALID), '-2,1': 50 (день 50
  // > clock.day 1) — отброшены; валидный '-1,1': 1 жив. (-2,1) —
  // «Дикая ягода» — ВИДИМ (50 отброшен) → [E] собираем.
  {
    const h = await boot({ save: saveShell({
      day: 1, steps: 0,
      position: { x: 0, y: 0 },
      hero: HERO_SAVE,
      collectedLoot: { 'abc': 3, '-2,1': 50, '-1,1': 1 },
    }) });
    const g = h.sandbox.__game;
    const c0 = g.collectedLoot || {};
    assert.equal(c0['-1,1'], 1,
      '(b) restore: валидный ключ жив (красный: restore нет)');
    assert.equal(c0['-2,1'], undefined,
      '(b) future-day (50 > 1) отброшен');
    assert.equal(c0['abc'], undefined, '(b) INVALID-ключ отброшен');
    // Ходим на (-2,1): лут ВИДИМ (ключ отброшен) → подсказка.
    let now = walkTiles(h, NOW, [[-1, 0], [-2, 0], [-2, 1]]);
    assert.ok(h.hud.textContent.includes('[E] Собрать: Дикая ягода'),
      '(b) отброшенный лут виден (подсказка): ' +
      h.hud.textContent.replace(/\n/g, ' | '));
    // [E] — сбор: qty 1, ключ «-2,1» → день 1.
    key(h, 'KeyE');
    now += 200;
    h.frameFn(now);
    const slot = (g.state.hero.inventory || []).find(
      (s) => s.id === 'berry_wild');
    assert.ok(slot, '(b) предмет собран (красный: [E] no-op)');
    assert.equal((g.collectedLoot || {})['-2,1'], 1,
      '(b) новый ключ → день 1');
    // Ресейв: ровно { '-1,1': 1, '-2,1': 1 } — мусора нет.
    fireSave(h);
    const saved = JSON.parse(h.storage.store[SAVE_KEY]);
    assert.deepEqual(saved.data.collectedLoot,
      { '-1,1': 1, '-2,1': 1 },
      '(b) сейв: только валидные ключи (abc/50 не вернулись)');
  }
  // (c) СТАРЫЙ сейв (поля collectedLoot нет): restore → {};
  // ресейв — пишет collectedLoot: {}; версия 1 НЕ поднята.
  {
    const h = await boot({ save: saveShell({
      day: 1, steps: 0,
      position: { x: 0, y: 0 },
      hero: HERO_SAVE,
    }) });
    const g = h.sandbox.__game;
    // JSON-рондтрип (паттерн host() save.test.js): getter строит
    // объект в vm-realm — deepEqual host-литералу {} падал бы на
    // прототипе (cross-realm), семантика та же: пустой объект.
    assert.deepEqual(JSON.parse(JSON.stringify(g.collectedLoot || {})), {},
      '(c) старый сейв: collectedLoot пуст (тихо, без warn)');
    fireSave(h);
    const saved = JSON.parse(h.storage.store[SAVE_KEY]);
    assert.equal(saved.version, 1,
      '(c) версия 1 НЕ поднята (000031: раздел additive)');
    assert.deepEqual(saved.data.collectedLoot, {},
      '(c) ресейв: пустая секция записана (красный: нет)');
  }
});

// =====================================================================
// LM5 — деградация «старая map.js»: поле loot ОТСУТСТВУЕТ в тайле —
// [E] → console.error РОВНО 1× (000053), игра не ломается (краха
// нет, предмета нет, сейва нет); повторный [E] — второй ошибки нет;
// loot: null (норма) — тихо.
// =====================================================================

test('LM5. 000158.04 e2e: деградация — tileAt без поля loot: console.error 1× (one-shot), краха нет; loot: null — тихо', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const live = G.__liveMap;
  assert.ok(live && typeof live.tileAt === 'function',
    'backdoor: live-инстанс карты (createMap-обёртка)');
  const orig = live.tileAt;
  // (a) Старая map.js: поле loot отсутствует.
  live.tileAt = (x, y) => {
    const t = orig(x, y);
    delete t.loot;
    return t;
  };
  const res = findLoot(G, { x: 0, y: 0 }, (t) => t.loot != null);
  assert.ok(res, 'сценарий: путь к лут-тайлу (реплика знает мир)');
  let now = walkTiles(h, NOW, res.steps);
  const e0 = h.errors.length;
  key(h, 'KeyE');
  now += 200;
  h.frameFn(now);
  assert.equal(h.errors.length - e0, 1,
    'console.error 1× (красный: гард-флаж отсутствует)');
  assert.ok(/loot/.test(h.errors[h.errors.length - 1]),
    'ошибка про отсутствующее поле loot: «' +
    h.errors[h.errors.length - 1] + '»');
  // Игра не ломается: краха нет (boot-инвариант: ошибок загрузки
  // нет), предмета нет, collectedLoot не мутирован.
  assert.ok(!(g.state.hero.inventory || []).some(
    (s) => s.id === 'root_rock'),
    'без проводки-данных: предмет не собран');
  assert.deepEqual(
    JSON.parse(JSON.stringify(g.collectedLoot || {})), {},
    'состояние не мутировано (JSON-рондтрип — cross-realm, host())');
  // Повторный [E] — one-shot: второй ошибки нет.
  key(h, 'KeyE');
  now += 200;
  h.frameFn(now);
  assert.equal(h.errors.length - e0, 1,
    'повторный [E] — без второй ошибки (one-shot флаг)');
  // (b) loot: null (нормальная клетка) — тихо, ошибок НЕ добавляет.
  live.tileAt = (x, y) => {
    const t = orig(x, y);
    t.loot = null;
    return t;
  };
  key(h, 'KeyE');
  now += 200;
  h.frameFn(now);
  assert.equal(h.errors.length - e0, 1,
    'loot:null — тихо (ошибка ≠ норма)');
  live.tileAt = orig;
});

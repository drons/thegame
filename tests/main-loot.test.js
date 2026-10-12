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
//
// Задача 000158.05 (станция RED): рендер природного лута на глобальной
// карте — РАСШИРЯЕМ файл (файл создан 000158.04, LM1–LM5 не трогаем):
//   * LM6 — spawn-кадр: все видимые лут-тайлы нарисованы с ТОЧНОЙ
//     геометрией (пересчёт из песочницы 1:1 с условием рендера:
//     visibleTileRange → live tileAt → lootVisible → lootSprite →
//     worldToScreen); контроль: (-1,1) root_rock в ожидаемом;
//   * LM7 — [E] на (-1,1) → лут тайла НЕВИДИМ, остальные 51 — в
//     точности; декорации — тот же мультимножество, число рисований
//     текстур/построек/мобов/Флогистона неизменно;
//   * LM8 — пороги зума (колесом): 16 ≤ zoom < 24 — лут ВИДИМ,
//     декорации нет; zoom < 16 (LOOT_MIN_ZOOM) — лут нет;
//     zoom ≥ 24 — лут + декорации;
//   * LM9 — порядок слоёв: текстура < декорации < лут < постройка <
//     моб < Флогистон (глобально + по-тайлово ≥ 3 лут-тайла с деко);
//   * LM10 — стена постройки → лут не рисуется (skip 000042). На
//     базе 1ca4904 ВСЕ постройки спавн-вида 1×1 — стеновых тайлов в
//     видимой области НЕТ (структурно лут под постройкой невозможен,
//     000158.03) → СИНТЕТИКА: форс inBuilding через G.__liveMap.
//     tileAt ПЕРЕД первым кадром (tileCache кэширует первые тайлы) +
//     положительный контроль (впрыск лута на соседний тайл рисуется);
//   * LM11 — fallback: спрайт не загрузился (rejectSet) → тайл без
//     иконки, остальные луты — в точности, 0 ошибок.
// Краснота LM6–LM11 — отсутствие G.lootSprite / блока лута в
// drawSprites / каталога assets/sprites/loot/ (осмысленно, не
// синтаксис). Контракты: memory/000158.05-loot-render.md.
// Техническое расширение инфраструктуры: Image-стаб получает
// pre.rejectSet (Set путей → onerror, паттерн boot(rejectSet)
// main-visuals); дефолт — пустой Set → LM1–LM5 байт-незатронуты.

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
// Допуск сравнения геометрии: формулы в тесте и в реализации — те же
// операции; 1e-6 px ловит любой реальный сдвиг, но не ulp-шум
// (паттерн EPS tests/main-visuals.test.js).
const EPS = 1e-6;

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
  // G.generateSeedPixels (≡ map.png побайтово); остальные — onload,
  // кроме pre.rejectSet (явный провал — тест фолбэка 000158.05 LM11;
  // паттерн boot(rejectSet) tests/main-visuals.test.js). Дефолт —
  // пустой Set → LM1–LM5 байт-незатронуты.
  const rejectSet = pre.rejectSet || new Set();
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
          if (v === 'assets/map.png' || rejectSet.has(v)) {
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

// =====================================================================
// Задача 000158.05: рендер природного лута на глобальной карте.
// Общие рендер-помощные (паттерн tests/main-visuals.test.js).
// =====================================================================

// Кадр с заданным now: вызываем ПОСЛЕДНИЙ захваченный rAF-колбэк
// (frame ре-регистрирует себя каждый кадр, finally requestAnimationFrame);
// возвращаем ТОЛЬКО вызовы этого кадра.
function frameAt(h, now) {
  const n0 = h.spriteCanvas.drawCalls.length;
  h.raf[h.raf.length - 1](now);
  return h.spriteCanvas.drawCalls.slice(n0);
}

// Кадр с фиксированным NOW (spawn-сценарии: время не двигается).
function frameOnce(h) {
  return frameAt(h, NOW);
}

// drawImage-вызовы по префиксу ассета (по метке изображения __asset).
function drawsOf(calls, prefix) {
  return calls.filter((c) => c[0] === 'drawImage'
    && c[1][0]
    && typeof c[1][0].__asset === 'string'
    && c[1][0].__asset.startsWith(prefix));
}

const lootDraws = (calls) => drawsOf(calls, 'assets/sprites/loot/');
const decoDraws = (calls) => drawsOf(calls, 'assets/sprites/visuals/');
const tileDraws = (calls) => drawsOf(calls, 'assets/tiles/');
const buildingDraws = (calls) => drawsOf(calls, 'assets/sprites/buildings/');
const mobDraws = (calls) => drawsOf(calls, 'assets/sprites/mobs/');
const phlogistonDraws = (calls) => drawsOf(calls, 'assets/sprites/phlogiston/');

// Колесо мыши на canvas #game (zoom: deltaY > 0 → ÷1.2, deltaY < 0 → ×1.2).
function dispatchWheel(h, deltaY) {
  const e = { deltaY, preventDefault() {} };
  for (const fn of h.gameCanvas.listeners['wheel'] || []) fn(e);
}

// Ожидаемые loot-отрисовки кадра — пересчёт из песочницы 1:1 с
// условием рендера (000158.05 D7): t.loot && lootVisible(collected,
// x, y) && !(inBuilding && !isEntrance) → lootSprite(item, tx, ty)
// → геометрия visualDrawRect (центр e.x/e.y, сторона s = size*zoom).
// map — provider tileAt (G.__liveMap — та же карта, из которой игра
// рисует; LM10 — тот же live-инстанс с патчем tileAt — пересчёт
// видит форс-стены и форс-лут). collected — состояние collectedLoot
// на момент кадра (копия getter __game.collectedLoot; lootVisible
// принимает и Map, и объект).
function expectedLoots(G, map, cam, zoom, collected) {
  const range = G.visibleTileRange(cam.x, cam.y, VIEW_W, VIEW_H, zoom);
  const out = [];
  for (let ty = range.y0; ty <= range.y1; ty++) {
    for (let tx = range.x0; tx <= range.x1; tx++) {
      const t = map.tileAt(tx, ty);
      if (!t.loot || (t.inBuilding && !t.isEntrance)) continue;
      if (!G.lootVisible(collected, tx, ty)) continue;
      const e = G.lootSprite(t.loot.item, tx, ty);
      if (!e) continue;
      const p = G.worldToScreen(tx, ty, cam.x, cam.y, zoom, VIEW_W, VIEW_H);
      const s = e.size * zoom;
      out.push({
        sprite: e.sprite,
        x: p.x + e.x * zoom - s / 2,
        y: p.y + e.y * zoom - s / 2,
        size: s,
      });
    }
  }
  return out;
}

// Мультимножественное равенство loot-отрисовок (спрайт, x, y, size)
// с допуском EPS: каждый фактический — в ожидании (и наоборот).
function assertLootsEqual(actual, expected, label) {
  assert.equal(actual.length, expected.length,
    label + ': число loot-отрисовок ' + actual.length
    + ' ≠ ожидаемых ' + expected.length);
  const pool = expected.slice();
  for (const [, a] of actual) {
    const i = pool.findIndex((e) => e.sprite === a[0].__asset
      && Math.abs(e.x - a[1]) < EPS
      && Math.abs(e.y - a[2]) < EPS
      && Math.abs(e.size - a[3]) < EPS
      && Math.abs(e.size - a[4]) < EPS);
    assert.ok(i >= 0,
      label + ': неожиданный вызов: ' + a[0].__asset
      + ' @ (' + a[1] + ', ' + a[2] + ') размер ' + a[3]);
    pool.splice(i, 1);
  }
  assert.equal(pool.length, 0,
    label + ': не нарисованы: ' + JSON.stringify(pool.slice(0, 3)));
}

// Мультимножественное равенство двух списков drawImage-вызовов
// (ассет, x, y, size) с допуском EPS (LM7: before/after по сборе).
function assertDrawsEqual(actual, expected, label) {
  assert.equal(actual.length, expected.length,
    label + ': число вызовов ' + actual.length + ' ≠ ' + expected.length);
  const pool = expected.slice();
  for (const a of actual) {
    const i = pool.findIndex((e) => a[1][0].__asset === e[1][0].__asset
      && Math.abs(a[1][1] - e[1][1]) < EPS
      && Math.abs(a[1][2] - e[1][2]) < EPS
      && Math.abs(a[1][3] - e[1][3]) < EPS);
    assert.ok(i >= 0, label + ': неожиданный вызов: ' + a[1][0].__asset
      + ' @ (' + a[1][1] + ', ' + a[1][2] + ') размер ' + a[1][3]);
    pool.splice(i, 1);
  }
  assert.equal(pool.length, 0,
    label + ': не нарисованы: '
    + JSON.stringify(pool.slice(0, 3).map((c) => c[1][0].__asset)));
}

// Число рисований по семействам (LM7: сбор не трогает другие слои).
function familyCounts(calls) {
  return {
    tiles: tileDraws(calls).length,
    buildings: buildingDraws(calls).length,
    mobs: mobDraws(calls).length,
    phlogiston: phlogistonDraws(calls).length,
  };
}

// =====================================================================
// LM6 — spawn-кадр (ZOOM_START = 80): каждый видимый лут-тайл
// нарисован спрайтом предмета с ТОЧНОЙ геометрией (пересчёт 1:1).
// =====================================================================

test('LM6. 000158.05 e2e: тайл с видимым лутом → drawImage loot-спрайта с точной геометрией (size×zoom, позиция hash2); контроль (-1,1) root_rock', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  assert.equal(typeof G.lootSprite, 'function',
    'контракт: экспорт G.lootSprite (красный: символа нет в sprites.js)');
  assert.equal(typeof G.lootVisible, 'function',
    'контракт: экспорт G.lootVisible (000158.04)');
  const calls = frameOnce(h);
  assert.ok(tileDraws(calls).length > 0,
    'текстуры тайлов нарисованы (слой спрайтов не пустой)');
  const st = g.state; // cam/zoom — из state (cam на спавне не дрейфует)
  const expected = expectedLoots(G, G.__liveMap, st.cam, st.zoom,
    g.collectedLoot || {});
  assert.ok(expected.length >= 10,
    'сценарий: лут-тайлов в spawn-виде достаточно (ожид. '
    + expected.length + ')');
  assert.ok(expected.some((e) => e.sprite === 'assets/sprites/loot/root_rock.svg'),
    'сценарий: root_rock (ближайший лут (-1,1)) — в ожидаемом наборе');
  assertLootsEqual(lootDraws(calls), expected,
    'геометрия: центр (sx + e.x*zoom, sy + e.y*zoom), сторона e.size*zoom');
});

// =====================================================================
// LM7 — собранный тайл [E] → лут НЕВИДИМ (только через lootVisible),
// остальные луты — в точности; декорации — тот же мультимножество;
// число рисований текстур/построек/мобов/Флогистона — неизменно.
// =====================================================================

test('LM7. 000158.05 e2e: [E] на (-1,1) → лут тайла невидим, остальные 51 в точности; декорации и другие слои не изменились', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  assert.equal(typeof G.lootSprite, 'function',
    'контракт: экспорт G.lootSprite (красный: символа нет в sprites.js)');
  const { now: n0, res } = walkToNearestLoot(h, NOW);
  // Осадочные кадры: камера/мувер — экспоненциальное сглаживание
  // (CAM_TAU_MS ≈ 74.7 мс); 12 кадров по +200 мс сходятся ниже
  // float-разрешения → before/after-кадры при ОДНОМ cam/zoom
  // (мультимножественные сравнения с точным EPS без терпимости).
  let now = n0;
  for (let i = 0; i < 12; i++) {
    now += 200;
    h.frameFn(now);
  }
  const st0 = g.state;
  const before = frameAt(h, now);
  const exp0 = expectedLoots(G, G.__liveMap, st0.cam, st0.zoom,
    g.collectedLoot || {});
  assertLootsEqual(lootDraws(before), exp0,
    'до сбора: точная геометрия лута');
  // Положительный контроль: root_rock на (-1,1) нарисован.
  const ls0 = G.lootSprite('root_rock', res.target.x, res.target.y);
  const p0 = G.worldToScreen(res.target.x, res.target.y,
    st0.cam.x, st0.cam.y, st0.zoom, VIEW_W, VIEW_H);
  const s0 = ls0.size * st0.zoom;
  assert.ok(lootDraws(before).some(([, a]) => a[0].__asset === ls0.sprite
    && Math.abs(a[1] - (p0.x + ls0.x * st0.zoom - s0 / 2)) < EPS
    && Math.abs(a[2] - (p0.y + ls0.y * st0.zoom - s0 / 2)) < EPS),
    'сценарий: root_rock на (-1,1) нарисован ДО сбора');
  const decoBefore = decoDraws(before);
  const countsBefore = familyCounts(before);
  // [E] — сбор (сценарий LM1: подсказка → addItem + ключ).
  key(h, 'KeyE');
  now += 200;
  const after = frameAt(h, now);
  const st1 = g.state;
  assert.equal((g.collectedLoot || {})[res.target.x + ',' + res.target.y], 1,
    'сбор: ключ тайла → день 1 (механика 000158.04)');
  // Лут: пересчёт видит collectedLoot → (-1,1) отсутствует; ровно 51.
  const exp1 = expectedLoots(G, G.__liveMap, st1.cam, st1.zoom,
    g.collectedLoot || {});
  assertLootsEqual(lootDraws(after), exp1,
    'после сбора: остальные луты — в точности');
  assert.equal(exp1.length, exp0.length - 1,
    'ровно ОДИН лут исчез (собраный тайл)');
  // Декорации — тот же мультимножество (cam/zoom не изменились).
  assertDrawsEqual(decoDraws(after), decoBefore,
    'декорации не изменились по сбору');
  // Остальные семейства — число рисований неизменно (спрайт-кадры
  // анимации могут смениться — сравниваем ЧИСЛА, не ассеты).
  assert.deepEqual(familyCounts(after), countsBefore,
    'текстуры/постройки/мобы/Флогистон — число рисований неизменно');
});

// =====================================================================
// LM8 — пороги зума: LOOT_MIN_ZOOM = 16 < VISUALS_MIN_ZOOM = 24 —
// окно различимости 16 ≤ zoom < 24 (лут виден, декорации — нет).
// Колесом (циклы до условия, guard 100 — не хардкод числа шагов).
// =====================================================================

test('LM8. 000158.05 e2e: zoom-пороги — 16 ≤ zoom < 24: лут виден, декорации нет; zoom < 16: лут нет; zoom ≥ 24: оба', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  assert.equal(typeof G.lootSprite, 'function',
    'контракт: экспорт G.lootSprite (красный: символа нет в sprites.js)');
  const st = () => g.state;
  // Старт: ZOOM_START = 80 — и лут, и декорации.
  let calls = frameOnce(h);
  let expected = expectedLoots(G, G.__liveMap, st().cam, st().zoom,
    g.collectedLoot || {});
  assert.ok(expected.length >= 10,
    'сценарий: лут-тайлы в spawn-виде (ожид. ' + expected.length + ')');
  assertLootsEqual(lootDraws(calls), expected, 'zoom 80: точная геометрия');
  assert.ok(decoDraws(calls).length > 0, 'zoom 80: декорации рисуются');
  // Колесо (deltaY > 0 — отдалиться) до zoom < 24.
  let guard = 0;
  while (st().zoom >= 24 && guard++ < 100) dispatchWheel(h, 120);
  assert.ok(st().zoom < 24, 'zoom ушёл ниже 24: ' + st().zoom);
  calls = frameOnce(h);
  expected = expectedLoots(G, G.__liveMap, st().cam, st().zoom,
    g.collectedLoot || {});
  assert.ok(expected.length > 0,
    'окно 16 ≤ zoom < 24: лут ожидает нарисованным (' + expected.length + ')');
  assertLootsEqual(lootDraws(calls), expected,
    'окно 16 ≤ zoom < 24: лут ВИДИМ с точной геометрией');
  assert.equal(decoDraws(calls).length, 0,
    'zoom < 24: декорации НЕ рисуются (порог 000039)');
  assert.ok(tileDraws(calls).length > 0,
    'текстуры тайлов на месте (слой жив)');
  // До zoom < 16 (LOOT_MIN_ZOOM): лут — нет.
  guard = 0;
  while (st().zoom >= 16 && guard++ < 100) dispatchWheel(h, 120);
  assert.ok(st().zoom < 16, 'zoom ушёл ниже 16: ' + st().zoom);
  calls = frameOnce(h);
  assert.equal(lootDraws(calls).length, 0,
    'zoom < LOOT_MIN_ZOOM (16): лут НЕ рисуется');
  assert.equal(decoDraws(calls).length, 0,
    'zoom < 16: декорации тоже нет');
  assert.ok(tileDraws(calls).length > 0,
    'текстуры тайлов на месте (мир не стал пустым)');
  // Колесо (deltaY < 0 — приблизиться) до zoom >= 24: лут вернулся.
  guard = 0;
  while (st().zoom < 24 && guard++ < 100) dispatchWheel(h, -120);
  assert.ok(st().zoom >= 24, 'zoom вернулся к >= 24: ' + st().zoom);
  calls = frameOnce(h);
  expected = expectedLoots(G, G.__liveMap, st().cam, st().zoom,
    g.collectedLoot || {});
  assert.ok(expected.length >= 10,
    'сценарий: лут-тайлы в виде (ожид. ' + expected.length + ')');
  assertLootsEqual(lootDraws(calls), expected,
    'zoom ≥ 24: лут вернулся с точной геометрией');
  assert.ok(decoDraws(calls).length > 0, 'zoom ≥ 24: декорации на месте');
});

// =====================================================================
// LM9 — порядок слоёв: текстура < декорации < лут < постройка <
// моб < Флогистон (глобально — проходы 1 < 2 < 3; по-тайлово —
// лут ПОСЛЕ декораций того же тайла, крупный объект поверх травы).
// =====================================================================

test('LM9. 000158.05 e2e: порядок слоёв — текстура < декорации < лут < постройка < моб < Флогистон', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  assert.equal(typeof G.lootSprite, 'function',
    'контракт: экспорт G.lootSprite (красный: символа нет в sprites.js)');
  const calls = frameOnce(h);
  const st = g.state;
  const zoom = st.zoom;
  const liveMap = G.__liveMap;
  // Глобально: ВСЕ loot-отрисовки — ДО первой постройки/моба
  // (проход 1 < проходы 2/3); постройка/моб — ДО Флогистона.
  const iB = calls.findIndex((c) => c[0] === 'drawImage'
    && c[1][0] && typeof c[1][0].__asset === 'string'
    && c[1][0].__asset.startsWith('assets/sprites/buildings/'));
  const iM = calls.findIndex((c) => c[0] === 'drawImage'
    && c[1][0] && typeof c[1][0].__asset === 'string'
    && c[1][0].__asset.startsWith('assets/sprites/mobs/'));
  const iPh = calls.findIndex((c) => c[0] === 'drawImage'
    && c[1][0] && typeof c[1][0].__asset === 'string'
    && c[1][0].__asset.startsWith('assets/sprites/phlogiston/'));
  assert.ok(iB >= 0, 'сценарий: постройка в кадре');
  assert.ok(iM >= 0, 'сценарий: мобы в кадре');
  assert.ok(iPh >= 0, 'Флогистон нарисован');
  const lootIdx = [];
  for (let i = 0; i < calls.length; i++) {
    const c = calls[i];
    if (c[0] === 'drawImage' && c[1][0]
        && typeof c[1][0].__asset === 'string'
        && c[1][0].__asset.startsWith('assets/sprites/loot/')) lootIdx.push(i);
  }
  assert.ok(lootIdx.length >= 10,
    'сценарий: loot-отрисовки в кадре (красный: блока лута нет — найдено '
    + lootIdx.length + ')');
  const maxLoot = Math.max(...lootIdx);
  assert.ok(maxLoot < Math.min(iB, iM),
    'лут — ДО построек и мобов (проход 1 < проходы 2/3)');
  assert.ok(Math.min(iB, iM) < iPh,
    'Флогистон — ПОСЛЕ построек/мобов');
  // По-тайлово: для ≥ 3 видимых лут-тайлов С декорациями —
  // текстура < каждая декорация < лут того же тайла.
  const range = G.visibleTileRange(st.cam.x, st.cam.y, VIEW_W, VIEW_H, zoom);
  let checked = 0;
  for (let ty = range.y0; ty <= range.y1 && checked < 3; ty++) {
    for (let tx = range.x0; tx <= range.x1 && checked < 3; tx++) {
      const t = liveMap.tileAt(tx, ty);
      if (!t.loot || (t.inBuilding && !t.isEntrance)) continue;
      const decos = G.tileVisuals(tx, ty, t.terrain);
      if (!decos.length) continue;
      checked++;
      const p = G.worldToScreen(tx, ty, st.cam.x, st.cam.y, zoom, VIEW_W, VIEW_H);
      const sx = p.x, sy = p.y;
      // Текстура тайла: drawImage(img, sx, sy, zoom, zoom).
      const iTile = calls.findIndex((c) => c[0] === 'drawImage'
        && c[1][0] && c[1][0].__asset
        && c[1][0].__asset.startsWith('assets/tiles/')
        && Math.abs(c[1][1] - sx) < EPS
        && Math.abs(c[1][2] - sy) < EPS
        && Math.abs(c[1][3] - zoom) < EPS
        && Math.abs(c[1][4] - zoom) < EPS);
      assert.ok(iTile >= 0, `тайл (${tx},${ty}): текстура нарисована`);
      // Лут тайла: точная геометрия lootSprite.
      const e = G.lootSprite(t.loot.item, tx, ty);
      const sL = e.size * zoom;
      const iLoot = calls.findIndex((c) => c[0] === 'drawImage'
        && c[1][0] && c[1][0].__asset === e.sprite
        && Math.abs(c[1][1] - (sx + e.x * zoom - sL / 2)) < EPS
        && Math.abs(c[1][2] - (sy + e.y * zoom - sL / 2)) < EPS);
      assert.ok(iLoot >= 0,
        `тайл (${tx},${ty}): лут нарисован (красный: не найден)`);
      for (const d of decos) {
        const sD = d.size * zoom;
        const iDeco = calls.findIndex((c) => c[0] === 'drawImage'
          && c[1][0] && c[1][0].__asset === d.sprite
          && Math.abs(c[1][1] - (sx + d.x * zoom - sD / 2)) < EPS
          && Math.abs(c[1][2] - (sy + d.y * zoom - sD / 2)) < EPS);
        assert.ok(iDeco >= 0,
          `тайл (${tx},${ty}): декорация нарисована`);
        assert.ok(iTile < iDeco,
          `тайл (${tx},${ty}): декорация — ПОСЛЕ текстуры тайла`);
        assert.ok(iDeco < iLoot,
          `тайл (${tx},${ty}): лут — ПОСЛЕ декораций (крупный объект '
          + 'поверх травы, 000158.05)`);
      }
    }
  }
  assert.ok(checked >= 3,
    'сценарий: ≥ 3 лут-тайлов с декорациями в кадре (найдено ' + checked + ')');
});

// =====================================================================
// LM10 — стена постройки → лут не рисуется (skip 000042, защитный
// код: структурно лут под постройкой невозможен, 000158.03). На
// базе 1ca4904 ВСЕ постройки спавн-вида 1×1 — стеновых тайлов в
// видимой области нет → СИНТЕТИКА через G.__liveMap.tileAt (паттерн
// LM5): форс inBuilding на лут-тайле W = (-1,1) ДО первого кадра
// (tileCache кэширует ПЕРВЫЕ тайлы — патч после кадров не действует)
// + положительный контроль: форс-лут на W2 = (-1,0) рисуется.
// =====================================================================

test('LM10. 000158.05 e2e: стена постройки → лут не рисуется (skip 000042); форс-лут на соседнем тайле рисуется; остальные — в точности', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  assert.equal(typeof G.lootSprite, 'function',
    'контракт: экспорт G.lootSprite (красный: символа нет в sprites.js)');
  const live = G.__liveMap;
  const orig = live.tileAt;
  const W = { x: -1, y: 1 };   // реальный лут-тайл root_rock → «стена»
  const W2 = { x: -1, y: 0 };  // норма без лута → контроль видимости форса
  live.tileAt = (x, y) => {
    const t = orig(x, y);
    if (x === W.x && y === W.y) {
      return { ...t, inBuilding: true, isEntrance: false,
        loot: { item: 'root_rock' } };
    }
    if (x === W2.x && y === W2.y) {
      return { ...t, loot: { item: 'root_ember' } };
    }
    return t;
  };
  const e0 = h.errors.length;
  const calls = frameOnce(h);
  const st = g.state;
  // Положительный контроль: форс-лут W2 нарисован (инъекция видна).
  const ls2 = G.lootSprite('root_ember', W2.x, W2.y);
  const p2 = G.worldToScreen(W2.x, W2.y,
    st.cam.x, st.cam.y, st.zoom, VIEW_W, VIEW_H);
  const s2 = ls2.size * st.zoom;
  assert.ok(lootDraws(calls).some(([, a]) => a[0].__asset === ls2.sprite
    && Math.abs(a[1] - (p2.x + ls2.x * st.zoom - s2 / 2)) < EPS
    && Math.abs(a[2] - (p2.y + ls2.y * st.zoom - s2 / 2)) < EPS),
    'контроль: форс-лут W2 нарисован (инъекция tileAt видна рендеру)');
  // «Стена» W: loot-отрисовки с его геометрией НЕТ (skip 000042).
  const lsW = G.lootSprite('root_rock', W.x, W.y);
  const pW = G.worldToScreen(W.x, W.y,
    st.cam.x, st.cam.y, st.zoom, VIEW_W, VIEW_H);
  const sW = lsW.size * st.zoom;
  assert.ok(!calls.some((c) => c[0] === 'drawImage'
    && c[1][0] && c[1][0].__asset === lsW.sprite
    && Math.abs(c[1][1] - (pW.x + lsW.x * st.zoom - sW / 2)) < EPS
    && Math.abs(c[1][2] - (pW.y + lsW.y * st.zoom - sW / 2)) < EPS),
    'стена постройки: лут НЕ нарисован (skip 000042)');
  // Остальные — в точности по пересчёту с тем же (патченным) tileAt:
  // W исключён (wall), W2 включён.
  assertLootsEqual(lootDraws(calls),
    expectedLoots(G, live, st.cam, st.zoom, g.collectedLoot || {}),
    'остальные луты — ровно ожидаемый набор');
  assert.equal(h.errors.length, e0, 'тихо (ошибок не добавлено)');
});

// =====================================================================
// LM11 — fallback: спрайт лута не загрузился (rejectSet) → тайл без
// иконки, остальные луты — в точности, 0 ошибок, игра не падает
// (паттерн фолбэка декораций: spriteLoader.isReady false → skip).
// =====================================================================

test('LM11. 000158.05 e2e: не загрузившийся loot-спрайт — тайл без иконки, остальные в точности, 0 ошибок', async () => {
  const REJECT = 'assets/sprites/loot/root_rock.svg';
  const h = await boot({ rejectSet: new Set([REJECT]) });
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  assert.equal(typeof G.lootSprite, 'function',
    'контракт: экспорт G.lootSprite (красный: символа нет в sprites.js)');
  assert.equal(h.errors.length, 0,
    'boot-инвариант: ошибок загрузки нет');
  const st = g.state;
  assert.equal(st.sprites.ready, st.sprites.total - 1,
    'именно один ассет не загрузился');
  const calls = frameOnce(h);
  assert.ok(tileDraws(calls).length > 0,
    'текстуры тайлов на месте (слой жив)');
  const all = expectedLoots(G, G.__liveMap, st.cam, st.zoom,
    g.collectedLoot || {});
  const rejected = all.filter((e) => e.sprite === REJECT);
  assert.ok(rejected.length >= 1,
    'сценарий: ' + REJECT + ' присутствует в видимой области');
  const expected = all.filter((e) => e.sprite !== REJECT);
  assert.ok(!lootDraws(calls).some(([, a]) => a[0].__asset === REJECT),
    'не загрузившийся спрайт НЕ рисуется (isReady false → пропуск)');
  assertLootsEqual(lootDraws(calls), expected,
    'остальные луты — точно ожидаемый набор');
  assert.equal(h.errors.length, 0,
    'тихий fallback (0 console.error — паттерн декораций)');
});

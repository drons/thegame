// Задача 000340 (оптимизация рендера B, RENDER-OPTIMIZE §5B): subset-списки
// по слоям вместо полных сканов frameTiles.
//
// Каждый rAF-кадр спрайт-слой делал 4 полных прохода по frameTiles
// (текстуры/вода/декор/лут; якоря построек через Set; агро-окружности;
// мобы) ради горстка объектов — при z=4 ~4×58 604 итераций (1280×720) и
// ~5×131 104 с полным сканом гейта при 1920×1080. Правка: при пересборке
// frameTiles (rebuild-цикл buildFrame, тот же row-major обход) собираются
// субсписки water/decor/loot/anchors/mobs/p1 (p1 = объединённый row-major
// список Прохода 1: тайл, способный дать вызов отрисовки в chunk-режиме);
// на хите кэша проходы итерируют субсписки. Пакет живёт в замыкании
// main.js и зеркалится в __game.state.frameTilesCache.subsets /
// .subsetBuilds (носитель наблюдения, как tiles/hits/rebuilds).
//
// Контракты (НЕ ослаблять; тесты-носители):
//   * live-фильтры collectedLoot/defeatedAt (G.lootVisible/G.groupVisible)
//     остаются В ПЕТЛЕ ОТРИСОВКИ: членство в субсписках статично
//     (map.js детерминирован, 000276 §3), а «собран/повержен» живёт в
//     live-Map'ах — вынос фильтра в сборку = призрак собранного лута /
//     скрытой группы (T3/T4/T7; мутации M2/M2b).
//   * row-major внутри субсписков → draw бит-в-бит: пины CC-2 z-порядка
//     (tests/chunk-render.test.js) и LM-геометрии (tests/main-loot.test.js),
//     FT-2 deepEqual hit≡rebuild (tests/frame-tiles-cache-000276.test.js).
//   * инвалидация субсписков — производная «версия ключа»: идентичность
//     объекта frameTilesKey (любая пересборка frame — новый объект) +
//     collectedLoot.size (collect/respawn) + defeatedAt.size (победа/
//     респаун) + showVisuals (порог 24; сбор decor дёргает G.tileVisuals).
//     Точки collect физически ВНЕ main.js (building-actions.js) — явный
//     bumpWorldVersion-бамп невозможлен вне SCOPE; паттерн exploredVersion
//     (чистое значение из live-Map, 000276 §3).
//   * база содержит 000339 (steady-гейт): сборка субсписков НЕ трогает
//     buildFrame-гейт и условие readyCount()===totalCount(); RM-4/RM-8
//     (частичная загрузка — полный legacy-кадр) не затронуты.
//
// ТЕСТЫ:
//   T1 эквивалентность: на HIT-кадре плоская последовательность вызовов
//      2D-канваса == независимая full-scan референс-последовательность
//      теста (row-major по range + G.tileFrames/frameIndex/вариант
//      статичных 000353/tileVisuals/
//      lootSprite/buildingAt/groupZoneInfo/worldToScreen/ChunkCache —
//      пересчёт 1:1, стиль LM/FT) — бит-в-бит; фикстуры: 3840×2160 при
//      z∈[24;32) (чанки + decor + loot + вода — все слои) и 1280×720 при
//      z=4 (чанки, вода-пер-тайл, без decor/лут).
//   T2 row-major: каждый субсписок — возрастание тайлового индекса
//      (ty-внешний/tx-внутренний) и состав === пересчёт по детерминированному
//      миру (water/decor/loot/anchors first-seen/mobs/p1-объединение);
//      decor пуст при vis=false, непуст на 4K-фикстуре.
//   T3 collect → bump → subset пересобран РОВНО 1×; призрак собранного
//      лута не рисуется; остальные слои по числам неизменны (LM7-паттерн).
//   T4 победа (defeatedAt) → пересборка РОВНО 1×; группа скрыта; смена дня
//      БЕЗ респауна — пересборки НЕТ и группа не «воскресает» (live-фильтр);
//      день ≥ respawn_days — группа возвращается ровно после пересборки.
//   T5 hit-переиспользование: subsetBuilds плато на warm-кадрах, hits+=3;
//      tileVisuals: 0 обращений на hit/rebuild при z<24; на 4K rebuild —
//      сбор decor по всем нестеновым тайлам нового range + проход по p1,
//      на hit — только по нестеновым членам p1 (< |frameTiles|).
//   T6 регресс CC-2/LM z-порядка на HIT-кадре с работающими субсписками:
//      границы ПРОХОДОВ (блиты < Проход1=текстура/deco/лут одним блоком
//      < постройки < агро < мобы < герой; max прохода < min следующего;
//      поэлементный порядок ВНУТРИ Прохода 1 запинен золотым T1), обе
//      фикстуры.
//   T7 live-фильтры БЕЗ rebuild: обёртка G.groupVisible (false для (1,0))
//      убирает спрайт группы на СЛЕДУЮЩЕМ хите без пересборки субсписков;
//      снятие — возвращает; то же G.lootVisible для лута (-1,1).
//
// Красность на HEAD (до правки): во всех тестах — guard «механизм
// субсписков существует» (state.frameTilesCache.subsets/subsetBuilds);
// T3/T4/T5 содержат доп. красные пины (шип/плато счётчика сборок,
// tileVisuals-экономика). Золотая эквивалентность T1 и z-порядок T6 —
// инвариант-пины (зелёны и до, и после: визуал бит-в-бит — цель задачи).
//
// Харнес — копия tests/render-steady-gate-skip-000339.test.js (ВЕСЬ
// <script>-цепочка index.html в vm, gl-стаб, Image-стаб: map.png ВСЕГДА
// onerror → детерминированный спавн-мир) + tracking созданных
// createElement-канвасов (offscreen-чанки; паттерн chunk-render).
// Независимая модель мира — node-ветки UMD src/map.js + src/mapseed.js +
// src/sprites.js (тот же seed). Spy-счётчики G.tileVisuals/G.lootVisible/
// G.groupVisible — обёртки свойств Game (G читается в момент вызова),
// продакшн-код ради наблюдаемости НЕ меняется.
//
// kind=node: node:test + node:assert/strict + node:vm, без npm-зависимостей.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));

const MAP = require(path.join(ROOT, 'src', 'map.js'));
const SEED = require(path.join(ROOT, 'src', 'mapseed.js'));
const SPR = require(path.join(ROOT, 'src', 'sprites.js'));
const GS = require(path.join(ROOT, 'src', 'global-settings.js'));
const WORLD = MAP.createMap(SEED.generateSeedPixels());
const RESPAWN_DAYS = (GS.SETTINGS || GS).respawn_days;

const VIEW_W = 1280;
const VIEW_H = 720;
const K4_W = 3840;
const K4_H = 2160;
const NOW = 1000; // performance.now() в песочнице заморожен на NOW
const HIT_NOW = NOW + 400;

const TILE_PREFIX = 'assets/tiles/';
const DECO_PREFIX = 'assets/sprites/visuals/';
const LOOT_PREFIX = 'assets/sprites/loot/';
const BUILD_PREFIX = 'assets/sprites/buildings/';
const MOB_PREFIX = 'assets/sprites/mobs/';
const HERO_PREFIX = 'assets/sprites/phlogiston/';

function makeGl(glCalls) {
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
  gl.vertexAttribPointer = noop;
  gl.viewport = noop;
  gl.clearColor = noop;
  gl.clear = noop;
  gl.uniformMatrix4fv = noop;
  gl.bufferData = (target, data, usage) => {
    glCalls.push({ fn: 'bufferData', data });
  };
  gl.drawArrays = (mode, first, count) => {
    glCalls.push({ fn: 'drawArrays', count });
  };
  return gl;
}

function makeContext2d(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

function makeEl(tag, createdCanvases) {
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
  const proxy = new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return () => undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  if (tag === 'canvas' && createdCanvases) createdCanvases.add(proxy);
  return proxy;
}

function makeStorage() {
  const store = {};
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k)
      ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
}

function bootSandbox(viewW, viewH) {
  const winListeners = {};
  const raf = [];
  const errors = [];
  const createdCanvases = new Set();
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
  const glCalls = [];
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl(glCalls) : makeContext2d(gameCanvas));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? makeContext2d(spriteCanvas) : null);
  const storage = makeStorage();
  const document = {
    createElement: (tag) => makeEl(tag, createdCanvases),
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
    innerWidth: viewW,
    innerHeight: viewH,
    location: { search: '' },
    localStorage: storage,
    confirm: () => false,
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
          const failed = v === 'assets/map.png';
          if (failed) {
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
  return {
    sandbox, winListeners, raf, errors, storage,
    gameCanvas, spriteCanvas, hud, glCalls, createdCanvases,
    body: document.body,
  };
}

const drain = () => new Promise((r) => setImmediate(r));

// Boot + spy-обёртки счётчиков (только в харнесе; свойство Game читается
// в момент вызова — main.js увидит обёртку; продакшн-код не меняется).
async function boot(viewW = VIEW_W, viewH = VIEW_H) {
  const counts = { tileVisuals: 0, lootVisible: 0, groupVisible: 0 };
  const h = bootSandbox(viewW, viewH);
  const G = h.sandbox.Game;
  for (const name of ['tileVisuals', 'lootVisible', 'groupVisible']) {
    const orig = G[name];
    if (typeof orig !== 'function') continue;
    h['orig_' + name] = orig;
    G[name] = (...args) => {
      counts[name] += 1;
      return orig(...args);
    };
  }
  h.counts = counts;
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

function frameAt(h, now) {
  h.glCalls.length = 0;
  const n0 = h.spriteCanvas.drawCalls.length;
  const r0 = h.raf.length;
  h.frameFn(now);
  return {
    draw: h.spriteCanvas.drawCalls.slice(n0),
    raf: h.raf.length - r0,
  };
}

function stateOf(h) {
  return h.sandbox.__game.state;
}

function cacheOf(h) {
  return stateOf(h).frameTilesCache;
}

// Guard механизма субсписков (КРАСНАЯ точка на HEAD: зеркало не содержит
// субсписков → subsets undefined, subsetBuilds undefined).
function guardMechanism(c) {
  assert.ok(c && c.subsets && Array.isArray(c.subsets.p1)
    && Array.isArray(c.subsets.water) && Array.isArray(c.subsets.decor)
    && Array.isArray(c.subsets.loot) && Array.isArray(c.subsets.anchors)
    && Array.isArray(c.subsets.mobs)
    && typeof c.subsetBuilds === 'number',
    'КРАСНЫЙ guard: субсписки (subsets{water,decor,loot,anchors,mobs,p1})'
    + ' и счётчик сборок subsetBuilds в state.frameTilesCache — правка'
    + ' 000340 не внесена');
}

function assertReady(h) {
  const s = stateOf(h).sprites;
  assert.ok(s && s.total > 0, 'спрайт-лоадер запущен');
  assert.equal(s.ready, s.total, 'steady state: все ассеты ready');
}

function wheelN(h, n, dir = 1) {
  const wheel = (h.gameCanvas.listeners['wheel'] || [])[0];
  assert.ok(typeof wheel === 'function', 'сценарий: wheel-обработчик');
  for (let i = 0; i < n; i++) {
    wheel({ deltaY: 100 * dir, preventDefault() {} });
  }
}

function key(h, code, extra = {}) {
  const e = Object.assign({ code, preventDefault() {}, stopPropagation() {} },
    extra);
  for (const fn of (h.winListeners['keydown'] || []).slice()) fn(e);
  return e;
}

function keyup(h, code, extra = {}) {
  const e = Object.assign({ code }, extra);
  for (const fn of (h.winListeners['keyup'] || []).slice()) fn(e);
  return e;
}

// ОДИН шаг в соседний тайл (walker-паттерн frame-tiles-cache-000276).
function makeWalker(h) {
  const g = h.sandbox.__game;
  let now = NOW;
  return function walk(tx, ty) {
    const px = g.state.player.x, py = g.state.player.y;
    const dx = tx - px, dy = ty - py;
    assert.ok(Math.abs(dx) + Math.abs(dy) === 1,
      'шаг по соседнему тайлу (' + px + ',' + py + ')→(' + tx + ',' + ty + ')');
    const code = dx === 1 ? 'ArrowRight' : dx === -1 ? 'ArrowLeft'
      : dy === 1 ? 'ArrowDown' : 'ArrowUp';
    key(h, code);
    let guard = 0;
    do {
      now += 200;
      frameAt(h, now);
    } while ((g.state.player.x !== tx || g.state.player.y !== ty)
      && ++guard < 12);
    keyup(h, code);
    assert.ok(g.state.player.x === tx && g.state.player.y === ty,
      'сценарий: игрок перешёл на (' + tx + ',' + ty + ')');
    for (let i = 0; i < 4; i++) { now += 200; frameAt(h, now); }
    return now;
  };
}

// Победа в активном бою (RM-7-паттерн global-map-draw).
function resolveCombatVictory(G, c, label) {
  const u = c.units.find((x) => x.kind === 'efir');
  assert.ok(u, label + ': Эфир в бою');
  G.combatInternals.dealDamageToAlly(c, u, 9999);
  assert.equal(u.alive, false, label + ': Эфир пал');
  for (const m of c.units.filter((x) => x.side === 'mob' && x.alive)) {
    G.combatInternals.dealDamageToMob(c, m, 9999);
  }
  assert.ok(c.result && c.result.outcome === 'victory',
    label + ': победа (checkVictory)');
  G.combatUI.handleCode('Space');
  assert.equal(G.combatUI.isActive(), false,
    label + ': панель закрыта (Space → finish)');
}

// --- Нормализация плоской последовательности вызовов 2D-канваса ---

function tokenOf(c, h) {
  const name = c[0];
  const a = c[1];
  if (name === 'drawImage') {
    if (h.createdCanvases.has(a[0])) {
      return ['blit', a[1], a[2], a[3], a[4]];
    }
    return ['img', a[0].__asset, a[1], a[2], a[3], a[4]];
  }
  if (name === 'setLineDash') return ['dash', a[0].join('|')];
  if (name === 'arc') return ['arc', a[0], a[1], a[2], a[3], a[4]];
  return [name];
}

function tokensOf(draw, h) {
  return draw.map((c) => tokenOf(c, h));
}

function familyCounts(tokens) {
  const out = {
    blit: 0, tile: 0, deco: 0, loot: 0, building: 0, arc: 0, mob: 0,
    hero: 0, other: 0,
  };
  for (const t of tokens) {
    if (t[0] === 'blit') out.blit += 1;
    else if (t[0] === 'arc') out.arc += 1;
    else if (t[0] === 'img') {
      const a = t[1];
      if (a.startsWith(TILE_PREFIX)) out.tile += 1;
      else if (a.startsWith(DECO_PREFIX)) out.deco += 1;
      else if (a.startsWith(LOOT_PREFIX)) out.loot += 1;
      else if (a.startsWith(BUILD_PREFIX)) out.building += 1;
      else if (a.startsWith(MOB_PREFIX)) out.mob += 1;
      else if (a.startsWith(HERO_PREFIX)) out.hero += 1;
      else out.other += 1;
    }
  }
  return out;
}

// --- Независимая full-scan референс-реализация проходов (T1/T6) ---
//
// Пересчёт 1:1 по row-major обходу ГЛОБАЛЬНОГО range (не субсписков):
// те же чистые функции песочницы (G.worldToScreen, G.worldAnchoredTileEdges,
// G.visibleTileRange, G.ChunkCache, G.visualDrawRect, G.lootSprite,
// G.groupZoneInfo) + node-спрайты SPR.* (та же таблица, что
// Game.tileFrames/frameIndex/mobFrames/phlogistonFrames) + детерминиро-
// ванный мир WORLD. Steady state (assertReady): spriteLoader.image истинен
// для любого непустого селектора; анимационный now — явный аргумент.

function refBuildingAsset(G, rec, now) {
  const frames = typeof G.buildingFrames === 'function'
    ? G.buildingFrames(rec.type, rec.buildingId) : null;
  if (frames && frames.length > 1) {
    return frames[G.buildingFrameIndex(now, rec.x, rec.y, frames.length)];
  }
  if (rec.buildingId != null && typeof G.buildingFrameIndex === 'function') {
    const nf = (typeof G.cityFrames === 'function'
      ? G.cityFrames(rec.buildingId) : null)
      || (typeof G.campFrames === 'function'
        ? G.campFrames(rec.buildingId) : null);
    if (nf && nf.length > 1) {
      return nf[G.buildingFrameIndex(now, rec.x, rec.y, nf.length)];
    }
  }
  return G.buildingSprite(rec.type, rec.buildingId)
    || (rec.buildingId != null && typeof G.citySprite === 'function'
      ? G.citySprite(rec.buildingId) : null)
    || (rec.buildingId != null && typeof G.campSprite === 'function'
      ? G.campSprite(rec.buildingId) : null)
    || null;
}

function referenceSeq(h, now) {
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const st = g.state;
  const camX = st.cam.x, camY = st.cam.y, zoom = st.zoom;
  const w = h.spriteCanvas.width, hh = h.spriteCanvas.height;
  const r = G.visibleTileRange(camX, camY, w, hh, zoom);
  const nTiles = (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
  const showVisuals = typeof G.tileVisuals === 'function'
    && zoom >= (G.VISUALS_MIN_ZOOM || 0);
  const showLoot = typeof G.lootSprite === 'function'
    && typeof G.lootVisible === 'function'
    && zoom >= (G.LOOT_MIN_ZOOM || 0);
  const useChunks = nTiles > 8192;
  const collected = g.collectedLoot || {};
  const lootVis = (x, y) => !Object.prototype.hasOwnProperty
    .call(collected, x + ',' + y);
  const seq = [['clearRect']];
  if (useChunks) {
    const CC = G.ChunkCache;
    const cr = CC.chunkRange(r.x0, r.y0, r.x1, r.y1);
    for (let cy = cr.cy0; cy <= cr.cy1; cy++) {
      for (let cx = cr.cx0; cx <= cr.cx1; cx++) {
        const local = CC.worldChunkLocalEdges(cx, cy, zoom);
        if (Number.isNaN(local.ex[0])) continue;
        const br = CC.worldChunkBlitRect(cx, cy, zoom, camX, camY, w, hh);
        if (Number.isNaN(br.x) || Number.isNaN(br.y)
            || Number.isNaN(br.w) || Number.isNaN(br.h)) continue;
        seq.push(['blit', br.x, br.y, br.w, br.h]);
      }
    }
  }
  const edges = G.worldAnchoredTileEdges(r.x0, r.y0, r.x1, r.y1,
    camX, camY, zoom, w, hh);
  for (let ty = r.y0; ty <= r.y1; ty++) {
    for (let tx = r.x0; tx <= r.x1; tx++) {
      const t = WORLD.tileAt(tx, ty);
      const p = G.worldToScreen(tx, ty, camX, camY, zoom, w, hh);
      const frames = SPR.tileFrames(t.terrain);
      const isWater = t.terrain === MAP.TERRAIN.WATER
        || t.terrain === MAP.TERRAIN.DEEP_WATER;
      if (frames.length && !(useChunks && !isWater)) {
        // Селектор текстуры (000340) + вариант начертания статичных
        // тайлов (000353): инлайн-формула hash2(x,y,SALT^terrain)%len.
        let path;
        if (frames.length > 1) {
          path = frames[SPR.frameIndex(now, tx, ty, frames.length)];
        } else {
          const pool = SPR.TILE_VARIANTS[t.terrain];
          path = pool
            ? pool[MAP.hash2(tx, ty,
              SPR.MAP_TILE_VARIANT_SALT ^ t.terrain) % pool.length]
            : frames[0];
        }
        const ix = tx - r.x0, iy = ty - r.y0;
        seq.push(['img', path, edges.x[ix], edges.y[iy],
          edges.x[ix + 1] - edges.x[ix], edges.y[iy + 1] - edges.y[iy]]);
      }
      if (showVisuals && !(t.inBuilding && !t.isEntrance)) {
        for (const e of G.tileVisuals(tx, ty, t.terrain)) {
          const rr = G.visualDrawRect(e, p.x, p.y, zoom);
          seq.push(['img', e.sprite, rr.x, rr.y, rr.size, rr.size]);
        }
      }
      if (showLoot && t.loot && lootVis(tx, ty)
          && !(t.inBuilding && !t.isEntrance)) {
        const ls = G.lootSprite(t.loot.item, tx, ty);
        if (ls) {
          const rr = G.visualDrawRect(ls, p.x, p.y, zoom);
          seq.push(['img', ls.sprite, rr.x, rr.y, rr.size, rr.size]);
        }
      }
    }
  }
  const seen = new Set();
  const anchors = [];
  for (let ty = r.y0; ty <= r.y1; ty++) {
    for (let tx = r.x0; tx <= r.x1; tx++) {
      const t = WORLD.tileAt(tx, ty);
      if (!t.inBuilding || !t.buildingAnchor) continue;
      const k = t.buildingAnchor[0] + ',' + t.buildingAnchor[1];
      if (seen.has(k)) continue;
      seen.add(k);
      anchors.push(k);
    }
  }
  for (const k of anchors) {
    const sep = k.indexOf(',');
    const ax = Number(k.slice(0, sep));
    const ay = Number(k.slice(sep + 1));
    const rec = WORLD.buildingAt(ax, ay);
    if (!rec) continue;
    const asset = refBuildingAsset(G, rec, now);
    if (!asset) continue;
    const p = G.worldToScreen(rec.x, rec.y, camX, camY, zoom, w, hh);
    seq.push(['img', asset, p.x, p.y, rec.w * zoom, rec.h * zoom]);
  }
  if (typeof G.groupZoneInfo === 'function') {
    // Спавн-фикстуры: герой никуда не шагал (покой), ни cold_breath, ни
    // dark_presence — сужения радиуса нет (cbR = 0).
    for (let ty = r.y0; ty <= r.y1; ty++) {
      for (let tx = r.x0; tx <= r.x1; tx++) {
        const t = WORLD.tileAt(tx, ty);
        if (!t.hasMobGroup) continue;
        const info = G.groupZoneInfo(t.mobGroup);
        if (!info || !info.triggers || !(info.radius > 0)) continue;
        const c = G.worldToScreen(tx + 0.5, ty + 0.5, camX, camY, zoom,
          w, hh);
        seq.push(['beginPath']);
        seq.push(['dash', '6|6']);
        seq.push(['arc', c.x, c.y, info.radius * zoom, 0, Math.PI * 2]);
        seq.push(['fill']);
        seq.push(['stroke']);
        seq.push(['dash', '']);
      }
    }
  }
  for (let ty = r.y0; ty <= r.y1; ty++) {
    for (let tx = r.x0; tx <= r.x1; tx++) {
      const t = WORLD.tileAt(tx, ty);
      if (!t.hasMobGroup) continue;
      const mf = SPR.mobFrames(t.mobGroup);
      if (!mf.length) continue;
      const idx = mf.length > 1 ? SPR.frameIndex(now, tx, ty, mf.length) : 0;
      const p = G.worldToScreen(tx, ty, camX, camY, zoom, w, hh);
      seq.push(['img', mf[idx], p.x - zoom * 0.1, p.y - zoom * 0.15,
        zoom * 1.2, zoom * 1.2]);
    }
  }
  // Герой: покой → action 'idle' (animUntil=0, lastStepAt — покой),
  // rp = позиция игрока (мувер завершил телепорт); волка нет
  // (isHeroBeastFriend false у нового героя).
  const pf = SPR.phlogistonFrames('idle');
  assert.ok(pf.length > 0, 'сценарий: кадры героя есть');
  const size = zoom * 1.15;
  const pp = G.worldToScreen(st.player.x + 0.5, st.player.y + 0.5,
    camX, camY, zoom, w, hh);
  const hidx = pf.length > 1 ? (Math.floor(now / 240) % pf.length) : 0;
  seq.push(['img', pf[hidx], pp.x - size / 2, pp.y - size / 2, size, size]);
  return { seq, r, nTiles, useChunks, showVisuals, showLoot };
}

// coordList/sliceHost — ПРИНЦИПИАЛЬНО host-массивы: .map/.slice на
// массиве из vm-realm конструируют массив ЧУЖОГО realm (Species —
// sandbox Array), и deepStrictEqual к host-массиву падает при
// поэлементном равенстве (прототипы из разных realm).
function coordList(arr) {
  return Array.prototype.map.call(arr, (t) => t.x + ',' + t.y);
}

function sliceHost(arr) {
  return Array.prototype.slice.call(arr);
}

function isWall(t) {
  return t.inBuilding && !t.isEntrance;
}

function coordWall(c) {
  const sep = c.indexOf(',');
  return isWall(WORLD.tileAt(Number(c.slice(0, sep)),
    Number(c.slice(sep + 1))));
}

function expectedLayers(r, { vis }) {
  const water = [], decor = [], loot = [], mobs = [], p1 = [];
  const anchors = [];
  const seen = new Set();
  for (let ty = r.y0; ty <= r.y1; ty++) {
    for (let tx = r.x0; tx <= r.x1; tx++) {
      const t = WORLD.tileAt(tx, ty);
      const isWater = t.terrain === MAP.TERRAIN.WATER
        || t.terrain === MAP.TERRAIN.DEEP_WATER;
      const wall = isWall(t);
      const hasDecor = vis && !wall
        && SPR.tileVisuals(tx, ty, t.terrain).length > 0;
      const hasLoot = !!t.loot && !wall;
      if (isWater) water.push(tx + ',' + ty);
      if (hasDecor) decor.push(tx + ',' + ty);
      if (hasLoot) loot.push(tx + ',' + ty);
      if (isWater || hasDecor || hasLoot) p1.push(tx + ',' + ty);
      if (t.inBuilding && t.buildingAnchor) {
        const k = t.buildingAnchor[0] + ',' + t.buildingAnchor[1];
        if (!seen.has(k)) { seen.add(k); anchors.push(k); }
      }
      if (t.hasMobGroup) mobs.push(tx + ',' + ty);
    }
  }
  return { water, decor, loot, anchors, mobs, p1 };
}

function nonWallCount(coords) {
  let n = 0;
  for (const c of coords) if (!coordWall(c)) n += 1;
  return n;
}

function nonWallTiles(r) {
  let n = 0;
  for (let ty = r.y0; ty <= r.y1; ty++) {
    for (let tx = r.x0; tx <= r.x1; tx++) {
      if (!isWall(WORLD.tileAt(tx, ty))) n += 1;
    }
  }
  return n;
}

function assertRowMajor(list, label, r) {
  const cols = r.x1 - r.x0 + 1;
  let prev = -Infinity;
  for (const c of list) {
    const sep = c.indexOf(',');
    const x = Number(c.slice(0, sep)), y = Number(c.slice(sep + 1));
    const idx = (y - r.y0) * cols + (x - r.x0);
    assert.ok(idx > prev,
      label + ': row-major — тайловый индекс возрастает строго'
      + ' (нарушение на ' + c + ')');
    prev = idx;
  }
}

// Кадры до ПЛАТО счётчика сборок (cam-сглаживание/разведка после шагов
// ещё могут двигать range несколько кадров).
function settleFrames(h, now, plateau = 4, maxFrames = 24) {
  let stable = 0;
  let prev = cacheOf(h).subsetBuilds;
  let n = 0;
  while (stable < plateau) {
    now += 200;
    frameAt(h, now);
    const cur = cacheOf(h).subsetBuilds;
    stable = cur === prev ? stable + 1 : 0;
    prev = cur;
    assert.ok(++n < maxFrames, 'сценарий: субсписки стабилизировались');
  }
  return now;
}

// =====================================================================
// T1 — эквивалентность: hit-кадр через субсписки == full-scan эталон.
// =====================================================================

test('T1: эквивалентность — плоская последовательность вызовов отрисовки на HIT-кадре через субсписки == независимая full-scan golden-последовательность (бит-в-бит); фикстуры 3840×2160 z∈[24;32) (вода+decor+лут+постройки+агро+мобы+герой) и 1280×720 z=4 (000340)', async () => {
  // Фикстура A: 4K — чанки + decor + лут одновременно (chunk-режим при
  // showVisuals — худший случай p1).
  const hA = await boot(K4_W, K4_H);
  assertReady(hA);
  wheelN(hA, 6); // 80/1.2^6 ≈ 26.79 ≥ 24
  const stA0 = stateOf(hA);
  assert.ok(stA0.zoom >= 24 && stA0.zoom < 32,
    'сценарий A: zoom ∈ [24; 32) (получено ' + stA0.zoom + ')');
  frameAt(hA, NOW + 200); // rebuild + bake
  const cA = cacheOf(hA);
  guardMechanism(cA);
  const A = referenceSeq(hA, HIT_NOW);
  assert.ok(A.useChunks, 'сценарий A: чанковый режим (nTiles > 8192)');
  assert.ok(A.showVisuals && A.showLoot,
    'сценарий A: decor и лут активны вместе с чанками');
  const fA = frameAt(hA, HIT_NOW); // HIT — ассерт
  assert.equal(cacheOf(hA).rebuilds, cA.rebuilds,
    'сценарий A: кадр ассерта — HIT кэша frameTiles');
  const gotA = tokensOf(fA.draw, hA);
  assert.deepStrictEqual(gotA, A.seq,
    'T1-A: hit-кадр бит-в-бит == full-scan эталон (длина ' + gotA.length
    + ' / ' + A.seq.length + ')');

  // Фикстура B: классический z=4 (1280×720) — chunk-режим, вода per-tile,
  // без decor/лута (пороги зума).
  const hB = await boot(VIEW_W, VIEW_H);
  assertReady(hB);
  wheelN(hB, 22);
  assert.equal(stateOf(hB).zoom, 4, 'сценарий B: ZOOM_MIN (4)');
  frameAt(hB, NOW + 200); // rebuild + bake
  const cB = cacheOf(hB);
  guardMechanism(cB);
  const B = referenceSeq(hB, HIT_NOW);
  assert.ok(B.useChunks, 'сценарий B: чанковый режим');
  assert.ok(!B.showVisuals && !B.showLoot,
    'сценарий B: decor/лут выключены порогом зума');
  const fB = frameAt(hB, HIT_NOW); // HIT
  assert.equal(cacheOf(hB).rebuilds, cB.rebuilds,
    'сценарий B: кадр ассерта — HIT');
  const gotB = tokensOf(fB.draw, hB);
  assert.deepStrictEqual(gotB, B.seq,
    'T1-B: hit-кадр z=4 бит-в-бит == full-scan эталон');
  const fam = familyCounts(gotB);
  assert.ok(fam.blit > 0 && fam.tile > 0 && fam.building > 0 && fam.mob > 0
    && fam.hero === 1, 'сценарий B: слои кадра не пусты, герой 1× ('
    + JSON.stringify(fam) + ')');
});

// =====================================================================
// T2 — row-major и состав субсписков.
// =====================================================================

test('T2: row-major субсписков — water/decor/loot/anchors(first-seen)/mobs/p1 в порядке возрастания тайлового индекса и состав === пересчёт по детерминированному миру; decor пуст при z<24 и непуст на 4K; keyRef — идентичность объекта key; lootN/mobN — размеры live-Map (000340)', async () => {
  const h = await boot(VIEW_W, VIEW_H);
  assertReady(h);
  wheelN(h, 22);
  frameAt(h, NOW + 200); // rebuild #1 — сборка субсписков
  const c1 = cacheOf(h);
  guardMechanism(c1);
  assert.equal(c1.subsetBuilds, 1,
    'первый кадр (rebuild): ровно ОДНА сборка субсписков (получено '
    + c1.subsetBuilds + ')');
  assert.equal(c1.subsets.keyRef, c1.key,
    'keyRef субсписков — ИДЕНТИЧНАЯ ссылка на key кадра (инвалидация'
    + ' любой пересборки frame — идентичностью объекта)');
  assert.equal(c1.subsets.vis, false,
    'z=4 < VISUALS_MIN_ZOOM: decor-канал не вычисляется (vis=false)');
  const st = stateOf(h);
  const r = MAP.visibleTileRange(st.cam.x, st.cam.y, VIEW_W, VIEW_H,
    st.zoom);
  const exp = expectedLayers(r, { vis: false });
  assert.deepStrictEqual(coordList(c1.subsets.water), exp.water,
    'waterTiles === пересчёт WATER/DEEP_WATER по range (row-major)');
  assert.deepStrictEqual(coordList(c1.subsets.decor), [],
    'decor пуст при vis=false');
  assert.deepStrictEqual(coordList(c1.subsets.loot), exp.loot,
    'lootCandidates === t.loot без стен по range (row-major)');
  assert.deepStrictEqual(sliceHost(c1.subsets.anchors), exp.anchors,
    'anchors === first-seen row-major дедуп buildingAnchor');
  assert.deepStrictEqual(coordList(c1.subsets.mobs), exp.mobs,
    'mobGroups === hasMobGroup по range (row-major)');
  assert.deepStrictEqual(coordList(c1.subsets.p1), exp.p1,
    'p1 === объединение water∪decor∪loot row-major');
  for (const [name, list] of Object.entries({
    water: coordList(c1.subsets.water), loot: coordList(c1.subsets.loot),
    mobs: coordList(c1.subsets.mobs), p1: coordList(c1.subsets.p1),
  })) {
    assertRowMajor(list, name + ' при z=4', r);
  }
  assert.equal(c1.subsets.lootN,
    Object.keys(h.sandbox.__game.collectedLoot || {}).length,
    'lootN — версия collect: размер collectedLoot');
  assert.equal(c1.subsets.mobN, 0, 'mobN — версия defeatedAt: пуст');
  frameAt(h, HIT_NOW); // hit — переиспользование (детально в T5)
  assert.equal(cacheOf(h).subsetBuilds, 1,
    'hit-кадр: сборка НЕ повторяется');

  // 4K: decor-канал активен, p1 включает декор-кандидатов.
  const hk = await boot(K4_W, K4_H);
  assertReady(hk);
  wheelN(hk, 6);
  frameAt(hk, NOW + 200);
  const ck = cacheOf(hk);
  guardMechanism(ck);
  const stk = stateOf(hk);
  const rk = MAP.visibleTileRange(stk.cam.x, stk.cam.y, K4_W, K4_H,
    stk.zoom);
  const expk = expectedLayers(rk, { vis: true });
  assert.equal(ck.subsets.vis, true,
    'z≥24: decor-канал вычисляется (vis=true)');
  assert.ok(expk.decor.length > 0, 'сценарий: на 4K-фикстуре есть decor');
  assert.deepStrictEqual(coordList(ck.subsets.decor), expk.decor,
    'decorCandidates === tileVisuals-кандидаты без стен (row-major)');
  assert.deepStrictEqual(coordList(ck.subsets.p1), expk.p1,
    'p1 ⊇ decor-кандидаты (объединение row-major)');
  assertRowMajor(coordList(ck.subsets.decor), 'decor при 4K', rk);
});

// =====================================================================
// T3 — collect → bump → пересборка ровно 1×; призрак собранного лута.
// =====================================================================

test('T3: collect лута [E] на (-1,1) → версия КЛЮЧА субсписков (collectedLoot.size) сдвигается → РОВНО одна пересборка пакета на следующем кадре; призрак собранного лута НЕ рисуется; остальные слои по числам неизменны; следующий кадр — плато (000340)', async () => {
  const h = await boot();
  assertReady(h);
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  assert.equal(WORLD.tileAt(-1, 1).loot && WORLD.tileAt(-1, 1).loot.item,
    'root_rock', 'сценарий: (-1,1) — Каменный корень');
  const walk = makeWalker(h);
  let now = walk(-1, 0);
  now = walk(-1, 1);
  now = settleFrames(h, now);
  const cA = cacheOf(h);
  guardMechanism(cA);
  const buildsA = cA.subsetBuilds;
  const fBefore = frameAt(h, now + 200);
  assert.equal(cacheOf(h).subsetBuilds, buildsA,
    'сценарий: кадр до сбора — HIT (плато после шагов)');
  const tokBefore = tokensOf(fBefore.draw, h);
  // Позитивный контроль: лут (-1,1) нарисован (LM7-паттерн).
  const ls = SPR.lootSprite('root_rock', -1, 1);
  assert.ok(ls && ls.sprite.startsWith(LOOT_PREFIX),
    'сценарий: иконка лута существует');
  const st0 = stateOf(h);
  const p0 = G.worldToScreen(-1, 1, st0.cam.x, st0.cam.y, st0.zoom,
    h.spriteCanvas.width, h.spriteCanvas.height);
  const rr0 = G.visualDrawRect(ls, p0.x, p0.y, st0.zoom);
  const atLoot = (tok) => tok[0] === 'img' && tok[1] === ls.sprite
    && Math.abs(tok[2] - rr0.x) < 1e-4 && Math.abs(tok[3] - rr0.y) < 1e-4;
  assert.ok(tokBefore.some(atLoot),
    'сценарий: root_rock на (-1,1) нарисован ДО сбора');
  const famBefore = familyCounts(tokBefore);
  key(h, 'KeyE');
  assert.equal((g.collectedLoot || {})['-1,1'], stateOf(h).day,
    'сценарий: collectedLoot["-1,1"] = день (механика 000158.04)');
  assert.equal(cacheOf(h).subsetBuilds, buildsA,
    'вне кадра сбор НЕ пересобирает пакет (версия — размер Map, бамп'
    + ' производный, в кадре)');
  const fAfter = frameAt(h, now + 400);
  const cB = cacheOf(h);
  assert.equal(cB.subsetBuilds, buildsA + 1,
    'кадр ПОСЛЕ collect: РОВНО ОДНА пересборка субсписков (bump версии'
    + ' collect) — получено +' + (cB.subsetBuilds - buildsA));
  assert.equal(cB.subsets.lootN,
    Object.keys(g.collectedLoot || {}).length,
    'новый пакет: lootN === новый размер collectedLoot');
  const tokAfter = tokensOf(fAfter.draw, h);
  assert.ok(!tokAfter.some(atLoot),
    'ПРИЗРАК: собранный лут нарисован на кадре после collect (live-'
    + 'фильтр lootVisible вынесен из петли отрисовки?)');
  const famAfter = familyCounts(tokAfter);
  assert.equal(famAfter.loot, famBefore.loot - 1,
    'ровно ОДИН лут исчез (собран тайл)');
  for (const k of ['blit', 'tile', 'deco', 'building', 'arc', 'mob',
    'hero', 'other']) {
    assert.equal(famAfter[k], famBefore[k],
      'слой «' + k + '» — число вызовов неизменно после collect');
  }
  const f3 = frameAt(h, now + 600);
  assert.equal(cacheOf(h).subsetBuilds, cB.subsetBuilds,
    'следующий кадр — плато: пересборки нет (версия стабильна)');
  assert.equal(familyCounts(tokensOf(f3.draw, h)).loot, famAfter.loot,
    'лут-множество стабильно');
});

// =====================================================================
// T4 — победа/день/respawn: bump по defeatedAt, группа не «воскресает».
// =====================================================================

test('T4: победа над группой (1,0) → defeatedAt.size bump → ровно одна пересборка; группа скрыта; setDay(+1)/(+2) (< respawn_days) — пересборки НЕТ и группа НЕ воскресает (live-фильтр); день ≥ respawn_days → ровно одна пересборка и группа снова в кадре (000340)', async () => {
  const h = await boot();
  assertReady(h);
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.ok(WORLD.tileAt(1, 0).hasMobGroup,
    'сценарий: (1,0) — тайл группы (спавн-мир)');
  const walk = makeWalker(h);
  let now = walk(1, 0);
  assert.equal(G.combatUI.isActive(), true, 'сценарий: бой начался');
  resolveCombatVictory(G, G.combatUI.current(), 'T4');
  const cPre = cacheOf(h);
  guardMechanism(cPre);
  const buildsPre = cPre.subsetBuilds;
  now = settleFrames(h, now);
  const cA = cacheOf(h);
  assert.equal(cA.subsetBuilds, buildsPre + 1,
    'кадры после победы: ровно ОДНА пересборка субсписков (defeatedAt'
    + ' 0→1) — получено +' + (cA.subsetBuilds - buildsPre));
  assert.equal(cA.subsets.mobN, 1, 'mobN === размер defeatedAt (1)');
  const day = stateOf(h).day;
  const stA = stateOf(h);
  const pM = G.worldToScreen(1, 0, stA.cam.x, stA.cam.y, stA.zoom,
    h.spriteCanvas.width, h.spriteCanvas.height);
  const mobAtOrigin = (tok) => tok[0] === 'img'
    && tok[1].startsWith(MOB_PREFIX)
    && Math.abs(tok[2] - (pM.x - stA.zoom * 0.1)) < 1e-4
    && Math.abs(tok[3] - (pM.y - stA.zoom * 0.15)) < 1e-4;
  const fA = frameAt(h, now + 200);
  assert.ok(!tokensOf(fA.draw, h).some(mobAtOrigin),
    'после победы: спрайт группы на (1,0) НЕ нарисован на hit-кадре');
  const buildsA = cacheOf(h).subsetBuilds;
  // День +1, +2 (< respawn_days): defeatedAt НЕ меняется → пересборки
  // нет; live-фильтр скрывает группу (не «воскресает» без инвалидации).
  for (const dOff of [1, 2]) {
    g.actions.setDay(day + dOff);
    const f = frameAt(h, now + 200 * (2 + dOff));
    assert.equal(cacheOf(h).subsetBuilds, buildsA,
      'день +' + dOff + ' (< respawn_days): пересборки субсписков нет'
      + ' (defeatedAt не изменился)');
    assert.ok(!tokensOf(f.draw, h).some(mobAtOrigin),
      'день +' + dOff + ': группа на (1,0) всё ещё скрыта (преждевременный'
      + ' «респавн» = живой фильтр потерян)');
  }
  assert.ok(RESPAWN_DAYS >= 3,
    'сценарий: respawn_days ≥ 3 (global-settings)');
  g.actions.setDay(day + RESPAWN_DAYS);
  const fR = frameAt(h, now + 2000);
  const cR = cacheOf(h);
  assert.equal(cR.subsetBuilds, buildsA + 1,
    'respawn (defeatedAt зачищен onDay): mobN 1→0 → ровно ОДНА пересборка');
  assert.equal(cR.subsets.mobN, 0, 'mobN вернулся к 0');
  assert.ok(tokensOf(fR.draw, h).some(mobAtOrigin),
    'после респауна спрайт группы (1,0) СНОВА в кадре ровно на этом же'
    + ' пересобранном хите');
  const fR2 = frameAt(h, now + 2200);
  assert.equal(cacheOf(h).subsetBuilds, cR.subsetBuilds,
    'тёплый кадр после respawn — плато');
  assert.ok(tokensOf(fR2.draw, h).some(mobAtOrigin),
    'группа остаётся на хите (переиспользование пакета)');
});

// =====================================================================
// T5 — hit-переиспользование без пересборки; tileVisuals-экономика.
// =====================================================================

test('T5: hit кэша frameTiles → субсписки переиспользуются (subsetBuilds плато, hits+=3, rebuilds не растёт); tileVisuals при z<24 — 0 обращений и на rebuild-, и на hit-кадре; на 4K rebuild-кадре сбор decor зовёт tileVisuals ровно по всем нестеновым тайлам нового range + проход — по членам p1, на hit-кадре — только по нестеновым членам p1 (< |frameTiles|) (000340)', async () => {
  const h = await boot(VIEW_W, VIEW_H);
  assertReady(h);
  wheelN(h, 22);
  frameAt(h, NOW + 200); // rebuild #1
  guardMechanism(cacheOf(h));
  const c0 = cacheOf(h);
  assert.equal(c0.subsetBuilds, 1, 'rebuild-кадр: 1 сборка');
  assert.equal(c0.rebuilds, 1, 'rebuild-кадр: пересборка frameTiles 1');
  const tv0 = h.counts.tileVisuals;
  for (let i = 1; i <= 3; i++) {
    frameAt(h, NOW + 200 * (1 + i));
    const c = cacheOf(h);
    assert.equal(c.subsetBuilds, 1,
      'hit-кадр ' + i + ': субсписки НЕ пересобираются');
    assert.equal(c.rebuilds, 1, 'hit-кадр ' + i + ': frameTiles hit');
    assert.equal(c.hits, c0.hits + i, 'hits растёт по кадру');
    assert.equal(h.counts.tileVisuals - tv0, 0,
      'z=4: ни одного обращения tileVisuals (порог 24; сборка decor'
      + ' не вычисляется при vis=false)');
  }
  // Rebuild при смене диапазона (wheel-in): ровно +1 сборка.
  wheelN(h, 1, -1);
  frameAt(h, NOW + 1000);
  assert.equal(cacheOf(h).subsetBuilds, 2,
    'смена диапазона → ровно одна пересборка пакета');

  // 4K: сборка decor дёргает tileVisuals по кандидатам террейна (полный
  // скан кандидатов — только на miss-кадре), hit-кадр зовёт их только по
  // членам p1 (меньше |frameTiles|) — выигрыш «5 сканов → горстки».
  const hk = await boot(K4_W, K4_H);
  assertReady(hk);
  wheelN(hk, 6);
  frameAt(hk, NOW + 200); // rebuild + bake (decor-сборка)
  const ck = cacheOf(hk);
  guardMechanism(ck);
  assert.equal(ck.subsets.vis, true, 'сценарий: decor-канал активен');
  const tvK0 = hk.counts.tileVisuals;
  frameAt(hk, HIT_NOW); // hit
  assert.equal(cacheOf(hk).subsetBuilds, ck.subsetBuilds,
    '4K: hit-кадр — без пересборки');
  const stk = stateOf(hk);
  const rk = MAP.visibleTileRange(stk.cam.x, stk.cam.y, K4_W, K4_H,
    stk.zoom);
  const expk = expectedLayers(rk, { vis: true });
  const p1Nonwall = nonWallCount(expk.p1);
  const tilesk = cacheOf(hk).size;
  const calledHit = hk.counts.tileVisuals - tvK0;
  assert.equal(calledHit, p1Nonwall,
    '4K hit: tileVisuals вызывается ровно по НЕСТЕНОВЫМ членам p1 ('
    + calledHit + ' vs ожидаем ' + p1Nonwall + ')');
  assert.ok(p1Nonwall < tilesk,
    'сценарий/выигрыш: p1 — горстка кандидатов < |frameTiles| ('
    + p1Nonwall + ' < ' + tilesk + ')');
  wheelN(hk, 1, -1); // новый range (чанки сохраняются)
  const tvK1 = hk.counts.tileVisuals;
  frameAt(hk, NOW + 600);
  const ck2 = cacheOf(hk);
  assert.equal(ck2.subsetBuilds, ck.subsetBuilds + 1,
    '4K: пересборка пакета ровно 1 на miss-кадре');
  const st2 = stateOf(hk);
  assert.ok(ck2.size > 8192,
    'сценарий: после wheel-in диапазон всё ещё чанковый (>8192)');
  const r2 = MAP.visibleTileRange(st2.cam.x, st2.cam.y, K4_W, K4_H,
    st2.zoom);
  const exp2 = expectedLayers(r2, { vis: true });
  const expectRebuildCalls = nonWallTiles(r2) + nonWallCount(exp2.p1);
  assert.equal(hk.counts.tileVisuals - tvK1, expectRebuildCalls,
    '4K rebuild: сборка decor зовёт tileVisuals по всем НЕстеновым'
    + ' тайлям нового range + проход 1 — по p1 ('
    + (hk.counts.tileVisuals - tvK1) + ' vs ' + expectRebuildCalls + ')');
});

// =====================================================================
// T6 — регресс CC-2/LM z-порядка на hit-кадре с субсписками.
// =====================================================================

// МЕЖПРОХОДНЫЙ z-порядок (CC-2): Проход 1 целиком (текстура+decor+лут —
// ВНУТРИ прохода порядок по-тайловый, water/deco/loot чередуются тайл за
// тайлом; поэлементно он запинен золотым T1) < Проход 2 (постройки) <
// Проход 2.5 (агро) < Проход 3 (мобы) < герой. Итерация субсписков НЕ
// должна двигать границы проходов: max(прохода) < min(следующего).
test('T6: регресс z-порядка CC-2/LM на HIT-кадре при итерации субсписков: Проход1 (блиты < текстура/decor/лут) < постройки < агро < мобы < герой (max слоя < min следующего), герой ровно 1×; обе фикстуры (000340)', async () => {
  const check = (h, chain, now) => {
    const f = frameAt(h, now);
    guardMechanism(cacheOf(h));
    const tok = tokensOf(f.draw, h);
    const idx = {};
    tok.forEach((t, i) => {
      let key = null;
      if (t[0] === 'blit') key = 'blit';
      else if (t[0] === 'arc') key = 'arc';
      else if (t[0] === 'img') {
        const a = t[1];
        key = a.startsWith(TILE_PREFIX) ? 'tile'
          : a.startsWith(DECO_PREFIX) ? 'deco'
            : a.startsWith(LOOT_PREFIX) ? 'loot'
              : a.startsWith(BUILD_PREFIX) ? 'building'
                : a.startsWith(MOB_PREFIX) ? 'mob'
                  : a.startsWith(HERO_PREFIX) ? 'hero' : null;
      }
      if (key) (idx[key] || (idx[key] = [])).push(i);
    });
    // границы проходов: p1 = tile∪deco∪loot одним блоком
    const groups = chain.map((name) => {
      if (name !== 'p1') return idx[name] || [];
      const u = [].concat(idx.tile || [], idx.deco || [], idx.loot || []);
      return u.sort((a, b) => a - b);
    });
    for (let i = 1; i < groups.length; i++) {
      const a = groups[i - 1], b = groups[i];
      if (!a.length || !b.length) continue;
      assert.ok(Math.max(...a) < Math.min(...b),
        'z-порядок проходов: «' + chain[i - 1] + '» ПОД «' + chain[i]
        + '» (max ' + Math.max(...a) + ' !< min ' + Math.min(...b) + ')');
    }
    assert.equal((idx.hero || []).length, 1, 'герой ровно 1×');
    return tok;
  };
  const hk = await boot(K4_W, K4_H);
  assertReady(hk);
  wheelN(hk, 6);
  frameAt(hk, NOW + 200); // rebuild+bake
  const famK = familyCounts(check(hk, ['blit', 'p1', 'building', 'arc',
    'mob', 'hero'], HIT_NOW));
  for (const k of ['blit', 'tile', 'deco', 'loot', 'building', 'arc',
    'mob']) {
    assert.ok(famK[k] > 0, 'сценарий 4K: слой «' + k + '» в hit-кадре ('
      + famK[k] + ')');
  }
  assert.equal(cacheOf(hk).rebuilds, 1,
    'сценарий: кадр ассерта 4K — hit (пересборок не было)');

  const h4 = await boot(VIEW_W, VIEW_H);
  assertReady(h4);
  wheelN(h4, 22);
  frameAt(h4, NOW + 200);
  const fam4 = familyCounts(check(h4, ['blit', 'p1', 'building', 'arc',
    'mob', 'hero'], HIT_NOW));
  assert.equal(fam4.deco, 0, 'z=4: decor нет (порог 24)');
  assert.equal(fam4.loot, 0, 'z=4: лута нет (порог 16)');
  assert.ok(fam4.tile > 0, 'z=4: вода-текстуры в Проходе 1');
  assert.equal(cacheOf(h4).rebuilds, 1, 'сценарий z=4: кадр ассерта — hit');
});

// =====================================================================
// T7 — live-фильтры работают БЕЗ rebuild.
// =====================================================================

test('T7: live-фильтры на хите БЕЗ пересборки субсписков: обёртка G.groupVisible(false для (1,0)) убирает спрайт группы на СЛЕДУЮЩЕМ hit-кадре (subsetBuilds плато), снятие — возвращает; то же G.lootVisible для лута (-1,1) — без призрака и без сборки (000340)', async () => {
  const h = await boot();
  assertReady(h);
  frameAt(h, NOW + 200);
  const c0 = cacheOf(h);
  guardMechanism(c0);
  frameAt(h, NOW + 400); // hit
  assert.equal(cacheOf(h).subsetBuilds, c0.subsetBuilds,
    'сценарий: warm-хит — плато сборок');
  const G = h.sandbox.Game;
  const st = stateOf(h);
  const pM = G.worldToScreen(1, 0, st.cam.x, st.cam.y, st.zoom,
    h.spriteCanvas.width, h.spriteCanvas.height);
  const mobAt = (tok) => tok[0] === 'img' && tok[1].startsWith(MOB_PREFIX)
    && Math.abs(tok[2] - (pM.x - st.zoom * 0.1)) < 1e-4
    && Math.abs(tok[3] - (pM.y - st.zoom * 0.15)) < 1e-4;
  const f0 = frameAt(h, NOW + 600);
  assert.ok(tokensOf(f0.draw, h).some(mobAt),
    'сценарий: группа (1,0) нарисована на warm-хите');
  const buildsB = cacheOf(h).subsetBuilds;
  const origGV = G.groupVisible;
  G.groupVisible = (m, x, y) => (x === 1 && y === 0 ? false : origGV(m, x, y));
  try {
    const f1 = frameAt(h, NOW + 800);
    assert.ok(!tokensOf(f1.draw, h).some(mobAt),
      'скрытая группа (1,0) исчезла на hit-кадре (live-фильтр в петле'
      + ' отрисовки)');
    assert.equal(cacheOf(h).subsetBuilds, buildsB,
      'группа скрыта БЕЗ пересборки субсписков (mobs[] не трогается —'
      + ' фильтр live, membership статичен)');
  } finally {
    G.groupVisible = origGV;
  }
  const f2 = frameAt(h, NOW + 1000);
  assert.ok(tokensOf(f2.draw, h).some(mobAt),
    'после снятия обёртки группа (1,0) СНОВА нарисована на hit-кадре');
  assert.equal(cacheOf(h).subsetBuilds, buildsB,
    'и возврат — без пересборки (тот же пакет)');

  // Лут-вариант: (-1,1) root_rock.
  const ls = SPR.lootSprite('root_rock', -1, 1);
  const pL = G.worldToScreen(-1, 1, st.cam.x, st.cam.y, st.zoom,
    h.spriteCanvas.width, h.spriteCanvas.height);
  const rr = G.visualDrawRect(ls, pL.x, pL.y, st.zoom);
  const lootAt = (tok) => tok[0] === 'img' && tok[1] === ls.sprite
    && Math.abs(tok[2] - rr.x) < 1e-4 && Math.abs(tok[3] - rr.y) < 1e-4;
  const f3 = frameAt(h, NOW + 1200);
  assert.ok(tokensOf(f3.draw, h).some(lootAt),
    'сценарий: лут (-1,1) нарисован');
  const buildsC = cacheOf(h).subsetBuilds;
  const origLV = G.lootVisible;
  G.lootVisible = (m, x, y) => (x === -1 && y === 1 ? false
    : origLV(m, x, y));
  try {
    const f4 = frameAt(h, NOW + 1400);
    assert.ok(!tokensOf(f4.draw, h).some(lootAt),
      'lootVisible=false → лут (-1,1) скрыт на hit-кадре');
    assert.equal(cacheOf(h).subsetBuilds, buildsC,
      'сокрытие лута — БЕЗ пересборки субсписков');
  } finally {
    G.lootVisible = origLV;
  }
  const f5 = frameAt(h, NOW + 1600);
  assert.ok(tokensOf(f5.draw, h).some(lootAt),
    'снятие lootVisible-обёртки → лут вернулся');
});

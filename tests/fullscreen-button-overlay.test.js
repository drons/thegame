// Задача 000256: кнопка полноэкранного режима (.fs-btn, правый нижний
// угол) видима и кликабельна на экранах ГОРОДА и ПОДЗЕМЕЛЬЯ.
// ТЗ: tasks/pending/000256.md. Контракт:
// memory/000256-fs-button-city-dungeon.md.
//
// Механика бага (сверено с кодом): .fs-btn создаётся ОДИН раз при
// загрузке (src/main.js:31-46, top-level IIFE: при
// fullscreen.supported) и живёт в DOM на всех экранах; базовый
// z-index 15 (index.html:176-189). Экраны города И подземелья — ОДИН
// непрозрачный оверлей `.combat-overlay .dungeon-overlay`
// (src/dungeon-ui.js build(), fixed inset 0, z-20). z-15 < z-20 →
// кнопка целиком ПОД оверлеем: невидима и некликабельна.
// display:none/медиазапросов у .fs-btn НЕТ — механизм скрытия только
// z-index. Бой — 000017, осознанно: в бою кнопка остаётся под
// оверлеем («не мешает в бою», memory/000017) — НЕ ТРОГАТЬ.
//
// Решение (контракт §2 memory): (a) ХОИСТИНГ — main.js: `let fsBtn =
// null` на топ-уровне ПЕРЕД блоком создания, в ветке supported —
// присваивание (const убран); остальной код блока — байт-в-байт.
// supported=false → fsBtn === null → frame-блок no-op (деградация,
// прецедент CI-12). (b) ПОДЪЁМ В frame() — сразу после блока подъёма
// #hud (main.js:3744-3750), перед «000235.02: книга»: отдельный const
// fsOver (НЕ переиспользование hudOver — банковская копия, §2b) =
// inDungeon && !inCombat && !inNpc && !inBuilding && !inCraft &&
// !inResurrect — ОБА kind'а (город + подземелье, без исключения kind —
// 000247-факт); запись inline zIndex '25'/'' ТОЛЬКО при смене
// (идемпотентность: повторный кадр — 0 DOM-записей). '25' — общий
// динамический слот (000206/000212/000256); CSS-лестница не меняется.
// (c) index.html:174-175 — правка устаревшего комментария.
//
// RED (6 — все падают на master ОСМЫСЛЕННО: fsBtn.style.zIndex ===
// undefined — в frame() НЕТ блока подъёма .fs-btn и нет хоистинга;
// boot чист: h.errors 0, кнопка В body, т.к. fullscreen-мок в
// харнесе — падение на ассерте `=== '25'`/`=== ''`, не на
// загрузке. Сбросные кейсы «''» — СТРОГИЙ пин (assert.equal):
// undefined ≠ '' → красны на master дословно по ТЗ «в бою/мире/на
// NPC-окне — ''» и фиксируют факт записи '' (а не просто отсутствие
// '25'); в FS-3/FS-5 под-ассерты «''» на master не наблюдаемы —
// тесты падают раньше на `=== '25'`; новый красный — FS-4):
//   * FS-1 — подземелье (debug enterDungeon, kind 'dungeon') + кадр →
//     zIndex '25' (кнопка ПОВЕРХ непрозрачного оверлея z-20).
//   * FS-2 — город (walkTiles-протокол, kind 'city', fp >= 2) + кадр →
//     '25'; в body ровно одна .fs-btn.
//   * FS-3 — конъюнкция боя (дубль DH-6): dungeon '25' → startCombat
//     + кадр → '' (в бою — 000017: кнопка остаётся под оверлеем) →
//     resolveCombat (мобы 9999 → Space) + кадр → '25' снова;
//     локация цела.
//   * FS-4 — границы ТЗ «вне условия — сброс»: (a) мир (свежий boot)
//     + кадр → '' (базовые 15 из CSS — подъёма нет: условие не
//     выполнено); (b) выход из подземелья ([E] на едином тайле,
//     000177) + кадр → '' (сброс — ТЗ п.1).
//   * FS-5 — город: '25' → KeyE на Оружейной (buildingId 1, NPC Бренн,
//     «Диалог» гарантирован — протокол CI-V2) + кадр → ''
//     (!inBuilding) → Digit1 → npcUI + кадр → '' (!inNpc) → Escape
//     + кадр → '25' снова.
//   * FS-6 — идемпотентность: подземелье, '25' установлен →
//     counting-Proxy над fsBtn.style (set-трап) → ПОВТОРНЫЙ кадр →
//     sets === 0 (запись только при смене, `!== z`), значение '25'.
//
// Ужесточение сбросных пин — ревью 2026-10-24: falsy-ассерты
// (!zIndex, тривиально истинны на master) заменены на
// assert.equal(zIndex, ''); ТЗ-красный список («в бою/мире/на
// NPC-окне — ''») теперь выполнен дословно: все 6 кейсов красные
// на master.
//
// inCraft/inResurrect — отдельными тестами НЕ покрываются (ТЗ-красный
// список: бой/мир/NPC; конъюнкты — защитные, прецедент DH-6).
//
// Бит-в-бит (зелёные БЕЗ правок): CI-13 (CSS-лестница),
// ui-panel:485-509 (базовый z-15), DH-1..DH-8 (#hud-блок не тронут),
// RW-2/RW-3, fullscreen.test.js (8 — ядро не трогается), index-order
// (новых <script> НЕТ), тач-пины (0 правок controls/ui). Гард
// деградации: 62 fullchain-сьюта БЕЗ fullscreen-мока прогоняют frame()
// с fsBtn === null — блок обязан быть no-op (гард `if (fsBtn &&
// fsBtn.style)`); зелёный полный набор = пин деградации (CI-12).
//
// Харнес: САМОДОСТАТОЧНАЯ full-chain vm-песочница — копия конвенции
// tests/dungeon-info-window.test.js (CHAIN-скрипты из index.html,
// Proxy-DOM makeEl с style:{}, WebGL/Image-стабы, frameFn = последний
// rAF-колбэк, drain, h.errors; хелперы findCityFor/walkCity/
// cityStepsTo/walkTiles — дубли из tests/city-interact.test.js) +
// ЕДИНСТВЕННОЕ отличие: МОК стандартного Fullscreen API в
// sandbox.document (паттерн makeDoc('std') из tests/fullscreen.test.js):
// documentElement.requestFullscreen → Promise.resolve(),
// document.fullscreenElement, document.exitFullscreen. Тогда
// fullscreen.supported === true и main.js СОЗДАЁТ .fs-btn (кнопка —
// h.fsBtn, ровно одна в body). Мок ЛОКАЛЕН этому файлу: просочится в
// чужие харнесы → кнопка появится в DOM всех 62 песочниц (риск a1
// §3.2) — запрещено; documentElement в src/ читает только fullscreen.js
// (grep), querySelector('.fs-btn') — только ui.js bottomInset
// (в харнесе document.querySelector → null → inset 0, как в 62
// сьютах без кнопки).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

// Цепочка скриптов — из index.html (не хардкод, паттерн main-visuals).
// Задача 000256 новых <script> НЕ добавляет — список не меняется.
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
// ЕДИНСТВЕННОЕ отличие от tests/dungeon-info-window.test.js —
// fullscreen-мок (стандартный вариант, паттерн makeDoc('std') из
// tests/fullscreen.test.js): documentElement.requestFullscreen —
// функция → createFullscreenController.supported === true → main.js
// создаёт .fs-btn. ЛОКАЛЕН этому файлу (см. шапку).
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
    // Мок стандартного Fullscreen API (000256): supported === true →
    // main.js создаёт .fs-btn. request/exit — Promise, как в браузере
    // (tests/fullscreen.test.js makeDoc('std')).
    documentElement: {
      requestFullscreen: () => Promise.resolve(),
    },
    fullscreenElement: null,
    exitFullscreen: () => Promise.resolve(),
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
  return { sandbox, winListeners, raf, errors, body, storage, hud };
}

// Промывка микротасков (Image + loadMapPixels().then: карта, спавн,
// requestAnimationFrame(frame)).
const drain = () => new Promise((r) => setImmediate(r));

// Кнопка полноэкранного режима: ровно одна в body (main.js создаёт
// её ОДИН раз при загрузке, fullscreen.supported === true по моку).
function fsBtnOf(h) {
  const btns = findAll(h.body, '.fs-btn');
  assert.equal(btns.length, 1,
    'в body ровно одна .fs-btn (кнопка создаётся один раз при загрузке)');
  return btns[0];
}

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
  // моменте.
  h.frameFn = h.raf[h.raf.length - 1];
  // Премис сценария: fullscreen-мок → main.js создал .fs-btn (на
  // master И после фикса — создание кнопки не меняется задачей).
  h.fsBtn = fsBtnOf(h);
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
// перешёл (tryMove — в frame при now−lastMove ≥ stepMs) → keyup.
// Кадр делает ≤ ОДНОГО хода. 000135: zone-бой по маршруту —
// авторазрешение.
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
// ЯКОРЯ, не от входного тайла (000105).
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
// zone-бой на входном шаге приоритетнее входа, вход откладывается на
// ПЕРВЫЙ успешный шаг после боя, приходящийся на тайл входа.
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

// --- Ходьба В ГОРОДЕ (дубль tests/city-interact.test.js) ---
// L-маршрут: вертикаль, потом горизонталь; каждый шаг — ЦЕЛЕВАЯ
// клетка.
function cityStepsTo(from, tx, ty) {
  const steps = [];
  const vy = ty < from.y ? -1 : 1;
  for (let y = from.y + vy; y !== ty + vy; y += vy) steps.push([from.x, y]);
  const hx = tx < from.x ? -1 : 1;
  for (let x = from.x + hx; x !== tx + hx; x += hx) steps.push([x, ty]);
  return steps;
}

function walkCity(h, steps) {
  const g = h.sandbox.__game;
  for (const [tx, ty] of steps) {
    const dx = tx - g.dungeon.x, dy = ty - g.dungeon.y;
    assert.ok(Math.abs(dx) + Math.abs(dy) === 1,
      'город: шаг по соседней клетке');
    const code = keydownFor(dx, dy);
    press(h, code);
    release(h, code);
    assert.ok(g.dungeon, 'в городе (не вышел)');
    assert.equal(g.dungeon.x, tx, 'город: шаг x (' + tx + ',' + ty + ')');
    assert.equal(g.dungeon.y, ty, 'город: шаг y (' + tx + ',' + ty + ')');
  }
}

// Оверлей локации (.dungeon-overlay — child body, src/dungeon-ui.js).
function dungeonOverlayOf(h) {
  const ovs = findAll(h.body, '.dungeon-overlay');
  return ovs.length ? ovs[ovs.length - 1] : null;
}

// ============================================================
// FS-1..FS-6 (fullchain)
// ============================================================

test('000256 FS-1 (RED, fullchain): подземелье (kind dungeon, depth 1, debug enterDungeon) + кадр — .fs-btn zIndex «25» (кнопка ПОВЕРХ непрозрачного оверлея z-20); h.errors не растут', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon — состояние подземелья (отладочный вход)');
  assert.equal(g.dungeon.kind, 'dungeon', 'kind dungeon');
  assert.equal(g.dungeon.depth, 1, 'debug-вход — depth 1');
  assert.equal(G.dungeonUI.isActive(), true, 'dungeonUI активен');
  assert.ok(dungeonOverlayOf(h),
    'экран подземелья — .dungeon-overlay в body (оверлей z-20)');
  const errBefore = h.errors.length;
  // Кадр (frame-driven подъём — render-driven дал бы дыру, паттерн
  // DH-1: z-статус меняется только в frame).
  h.frameFn(NOW + 16);
  assert.equal(h.fsBtn.style.zIndex, '25',
    'RED: кадр — .fs-btn ПОДНЯТ над экраном подземелья (inline zIndex '
    + '25 > оверлей 20; master: undefined — кнопка целиком под '
    + 'непрозрачным оверлеем, невидима и некликабельна)');
  assert.equal(h.errors.length, errBefore,
    'чистый вход — без новых console.error');
});

test('000256 FS-2 (RED, fullchain): город (kind city, enterCity-протокол walkTiles, fp>=2) + кадр — .fs-btn zIndex «25»; в body ровно одна .fs-btn', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  let now = NOW + 16;
  enterCity(h, now, myMap, (c) => c.fp >= 2);
  now += 16;
  assert.equal(g.dungeon.kind, 'city', 'город (kind city)');
  const errBefore = h.errors.length;
  h.frameFn(now);
  assert.equal(h.fsBtn.style.zIndex, '25',
    'RED: город — .fs-btn ПОДНЯТ (inline zIndex 25; условие — ОБА '
    + 'kind\'а, без исключения kind — 000247-факт: банковская копия '
    + 'hudOver; master: undefined — кнопка под оверлеем)');
  assert.equal(h.errors.length, errBefore,
    'чистый вход — без новых console.error');
  assert.equal(findAll(h.body, '.fs-btn').length, 1,
    'в body ровно одна .fs-btn (создание кнопки — один раз, main.js)');
});

test('000256 FS-3 (RED, fullchain): конъюнкция боя (дубль DH-6) — dungeon «25» → startCombat + кадр: подъём СНЯТ (zIndex «» — бой скрыт, 000017) → resolveCombat (9999 → Space) + кадр: «25» снова; локация цела', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon — состояние подземелья (отладочный вход)');
  const errBefore = h.errors.length;
  h.frameFn(NOW + 16);
  assert.equal(h.fsBtn.style.zIndex, '25',
    'RED: в подземелье кнопка поднята (zIndex 25)');
  assert.equal(h.errors.length, errBefore,
    'чистый вход — без новых console.error');
  // Debug-бой (000096): боевой оверлей z-20 — СВЕРХУ .fs-btn.
  const c0 = g.actions.startCombat();
  assert.ok(c0, 'startCombat — бой начат (отладочный)');
  assert.equal(G.combatUI.isActive(), true, 'боевой оверлей активен');
  h.frameFn(NOW + 32);
  assert.equal(h.fsBtn.style.zIndex, '',
    'в бою подъём СНЯТ (конъюнкт !inCombat — сброс «», базовые 15 '
    + 'из CSS; кнопка под боевым оверлеем, как раньше, 000017): '
    + JSON.stringify(h.fsBtn.style.zIndex));
  // Резолв (мобы 9999 → Space) — бой закрыт, локация цела.
  resolveCombat(G);
  h.frameFn(NOW + 48);
  assert.equal(h.fsBtn.style.zIndex, '25',
    'RED: после боя кнопка снова поднята (локация цела)');
  assert.equal(g.dungeon.kind, 'dungeon', 'локация цела: kind dungeon');
  assert.equal(G.dungeonUI.isActive(), true,
    'локация цела: dungeonUI активен');
});

test('000256 FS-4 (RED, ГРАНИЦЫ ТЗ): мир (свежий boot) + кадр — подъёма НЕТ (zIndex «» — базовый 15 из CSS); выход из подземелья ([E] на едином тайле, 000177) + кадр — подъём снят («» — сброс «вне условия»); красный на master (undefined ≠ «»), зелёный после фикса (сброс на пустое)', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  // (а) мир (свежий boot): условие не выполнено — подъёма НЕТ.
  h.frameFn(NOW + 16);
  assert.equal(h.fsBtn.style.zIndex, '',
    'мир: подъёма НЕТ (zIndex «» — базовые 15 из CSS, условие '
    + 'inDungeon не выполнено): ' + JSON.stringify(h.fsBtn.style.zIndex));
  // (б) подземелье (кадр — подъём, не ассертится: FS-4 — только
  // ГРАНИЦЫ «вне условия — сброс») → выход ([E] на едином
  // тайле-выхода, 000177; debug-вход — герой НА едином тайле).
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon — состояние подземелья (отладочный вход)');
  h.frameFn(NOW + 32);
  press(h, 'KeyE');
  release(h, 'KeyE');
  assert.equal(g.dungeon, null, '[E] на едином тайле — выход');
  assert.equal(G.dungeonUI.isActive(), false, 'dungeonUI закрыт');
  h.frameFn(NOW + 48);
  assert.equal(h.fsBtn.style.zIndex, '',
    'выход: подъём СНЯТ (zIndex «» — сброс «вне условия — сброс», '
    + 'ТЗ п.1): ' + JSON.stringify(h.fsBtn.style.zIndex));
});

test('000256 FS-5 (RED, fullchain): город — подъём «25» → KeyE на Оружейной (buildingId 1, протокол CI-V2) → buildingUI + кадр: «» (!inBuilding) → Digit1 «Диалог» → npcUI + кадр: «» (!inNpc) → Escape → кадр: «25» снова', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  let now = NOW + 16;
  // Протокол CI-V2(a): Оружейная (buildingId 1, NPC Бренн) — «Диалог»
  // гарантирован (npcForBuilding 1 — торговля есть).
  const { found } = enterCity(h, now, myMap, (c) => c.fp >= 2
    && c.contents.buildings.some((b) => b.buildingId === 1));
  now += 16;
  assert.equal(g.dungeon.kind, 'city', 'город (kind city)');
  h.frameFn(now);
  assert.equal(h.fsBtn.style.zIndex, '25',
    'RED: город — .fs-btn поднята (zIndex 25)');
  const w = found.contents.buildings.find((b) => b.buildingId === 1);
  walkCity(h, cityStepsTo({ x: g.dungeon.x, y: g.dungeon.y }, w.x, w.y));
  const errBefore = h.errors.length;
  now += 16;
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true,
    '[E] на Оружейной — buildingUI (000071)');
  h.frameFn(now + 16);
  assert.equal(h.fsBtn.style.zIndex, '',
    'в окне постройки подъём СНЯТ (конъюнкт !inBuilding — сброс «»): '
    + JSON.stringify(h.fsBtn.style.zIndex));
  key(h, 'Digit1');
  assert.equal(G.npcUI.isActive(), true, '«Диалог» (Digit1) → npcUI');
  h.frameFn(now + 32);
  assert.equal(h.fsBtn.style.zIndex, '',
    'в NPC-окне подъём СНЯТ (конъюнкт !inNpc — ТЗ: «на NPC-окне — '
    + "''»): " + JSON.stringify(h.fsBtn.style.zIndex));
  key(h, 'Escape');
  assert.equal(G.npcUI.isActive(), false, 'диалог закрыт (Esc)');
  h.frameFn(now + 48);
  assert.equal(h.fsBtn.style.zIndex, '25',
    'RED: после закрытия окон — подъём ВЕРНУЛСЯ (zIndex 25)');
  assert.equal(G.buildingUI.isActive(), false, 'buildingUI закрыт');
  assert.equal(h.errors.length, errBefore,
    'без console.error: ' + h.errors.slice(errBefore).join('; '));
});

test('000256 FS-6 (RED, fullchain): идемпотентность — подземелье: кадр → «25»; счётчик записей zIndex (fsBtn.style = new Proxy(style, {set: счёт})) → ПОВТОРНЫЙ кадр: sets === 0 (без лишней записи), значение «25»', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon — состояние подземелья (отладочный вход)');
  h.frameFn(NOW + 16);
  assert.equal(h.fsBtn.style.zIndex, '25',
    'RED: в подземелье кнопка поднята (zIndex 25; master: undefined — '
    + 'блока подъёма в frame() нет вовсе)');
  // Снимок состояния: Proxy над style СЧЁТЧИКОМ записей — ставится
  // ПОСЛЕ установления '25' (апперты на значение ниже идут сквозь
  // него).
  let sets = 0;
  const rawStyle = h.fsBtn.style;
  h.fsBtn.style = new Proxy(rawStyle, {
    set(t, k, v) { sets += 1; t[k] = v; return true; },
  });
  assert.equal(h.fsBtn.style.zIndex, '25',
    'снимок: значение 25 (Proxy прозрачен для чтения)');
  // ПОВТОРНЫЙ кадр: состояние не менялось — запись zIndex НЕ должна
  // случиться (идемпотентность: запись только при смене, `!== z`).
  h.frameFn(NOW + 32);
  assert.equal(sets, 0,
    'RED: повторный кадр — 0 записей zIndex (без лишней DOM-записи; '
    + 'master: блока подъёма нет — записей нет, но и значения нет)');
  assert.equal(h.fsBtn.style.zIndex, '25',
    'значение стабильно: 25');
  // Второй повторный кадр — тоже 0 (гард от записи каждый кадр).
  h.frameFn(NOW + 48);
  assert.equal(sets, 0, 'второй повторный кадр — тоже 0 записей');
  assert.equal(h.fsBtn.style.zIndex, '25', 'значение стабильно: 25');
});

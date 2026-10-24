// Задача 000235.02: каст вне боя + книга заклинаний (KeyB) + МП в HUD —
// e2e по полной цепочке. ТЗ: tasks/pending/000235.02.md. Контракт:
// memory/000235.02-spellbook-out-of-combat.md (§2.5-2.7, Д-1..Д-8).
//
// Механика (контракт): #hud — textcontent-движок (pointer-events:none,
// детей нет) → «кнопка» = условный текстовый хинт «  |  [B] книга» в
// key-hint-строке buildLine + горячая клавиша KeyB (П10). Книга —
// новый UMD-модуль src/spellbook-oc.js (Game.spellbookOC): оверлей
// .spellbook-oc z-35, строки через SpellBook.entriesFor + фильтр
// вне_боя по флагу, каст по клику (Spells.castOutOfCombat), ok →
// close, fail → flash(reason) в #hud. Каст вне боя: мана ровно
// «мани», запись {spellId, expiresDay: day+days} в
// hero.outOfCombatEffects, перезаклинание = обновление, кулдаунов
// нет; день-хук (clock.onDay) — expireOutOfCombatEffects.
//
// RED (5 — падают на master ОСМЫСЛЕННО: модуля/тега/экспорта/строки
// нет, не синтаксис):
//   * OC11 — полная цепочка: Game.spellbookOC в снапшоте (тег ДО
//     main.js) + load-clean (h.errors не растут) + аффорданс «  |  [B]
//     книга» + «МП x/y» в строке героя (world).
//   * OC12 — книга показывает ТОЛЬКО известные вне_боя: РОВНО строка
//     известного гостя; боевые spark/mend (дефолтная книга) и
//     неизученный гость — НЕТ.
//   * OC13 — каст по клику: mp 16 → 11 (новый герой maxMP 16 —
//     sheet.js:445; мана — через сейв, g.state.hero.mp НЕТ —
//     конвенция camp-map-e2e CP-11), запись в state-зеркале, ok →
//     книга закрыта; гость «мани: 100» → flash «не хватает маны» в
//     textContent #hud (flashUntil = NOW+5000 > NOW — часы заморожены),
//     mp/эффекты не изменились.
//   * OC14 — ВСЕ ТРИ экрана: мир → подземелье (dungeonUI НЕ блокирует,
//     dungeon-ui.js НЕ хост оверлея) → город (city-screen протокол).
//   * OC15 — истечение по дням: setDay (rest() → onDay) — days=1:
//     пусто в D+1; days=2: жив в D+1, пусто в D+2 (expiresDay <= day).
//
// Гости (П6): инъекция в ЖИВОЙ каталог Game.SpellsData ПОСЛЕ boot
// (main.js держит те же объект-ссылки; e2e-путь НЕ проходит через
// restore повторно — after-boot безопасно; гость — полная форма
// каталога + вне_боя: true). Изучение — push в live hero.spells
// (state-зеркало отдаёт тот же массив-ссылку).
//
// Харнес: дубль tests/dungeon-info-window.test.js (000212):
// самодостаточная full-chain vm-песочница — CHAIN из index.html
// (динамический: тег 000235.02 подхватится автоматически в зелёной
// стадии), Proxy-DOM makeEl (dataset/listeners/R11), WebGL/Image-стабы,
// performance.now() заморожен на NOW=1000, h.hud — тот же элемент, что
// getElementById('hud'). Ошибки на чистых путях — не растут (h.errors).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const S = require('../src/save.js');
const P = require('../src/player.js');

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
// querySelectorAll) — дубль tests/dungeon-info-window.test.js. ---
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
    // identity (дубль tests/dungeon-info-window.test.js).
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

function makeStorage(seed) {
  const m = new Map();
  if (seed != null) m.set(S.SAVE_KEY, JSON.stringify(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// --- Песочница: вся цепочка index.html (браузерная ветка UMD) ---
function bootSandbox(seed) {
  const winListeners = {};
  const raf = [];
  const errors = [];
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
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
    // реально снимает (дубль tests/dungeon-info-window.test.js).
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

async function boot(seed) {
  const h = bootSandbox(seed);
  await drain();
  await drain();
  await drain();
  const g = h.sandbox.__game;
  assert.ok(g, 'globalThis.__game выставлен (main.js выполнен)');
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет (порядок цепочки — load-clean 000038): '
    + h.errors.join('; '));
  // frame() main.js — единственный rAF-колбэк после старта; кадр пере
  // планирует себя (одна и та же функция) — frameFn валидна на любом
  // моменте.
  h.frameFn = h.raf[h.raf.length - 1];
  return h;
}

// --- Ввод ---
// ВАЖНО: массив слушателей снапшотится ПЕРЕД диспетчем (паттерн B9).
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

// Резолв боевого оверлея: мобы 9999 → Space. Эфир НЕ убиваем.
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
  for (let i = 0; i < 4; i++) {
    now += 200;
    h.frameFn(now);
  }
  return now;
}

// --- BFS по миру до целевого тайла ---
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

// Город + RECOMPUTE содержимого (чистые функции 000106/000108).
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

// Безопасный ОДИН шаг в МИРЕ от тайла входа.
function safeWorldNeighbor(G, myMap, from) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of DIRS) {
    const t = myMap.tileAt(from.x + dx, from.y + dy);
    if (!t.passable || t.hasMobGroup || t.hasBuilding) continue;
    return [from.x + dx, from.y + dy];
  }
  return null;
}

// Вход в город (walkTiles + страховка bounded re-entry ≤3).
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

// Оверлей локации (.dungeon-overlay — child body, src/dungeon-ui.js).
function dungeonOverlayOf(h) {
  const ovs = findAll(h.body, '.dungeon-overlay');
  return ovs.length ? ovs[ovs.length - 1] : null;
}

// --- Гости (П6) и helpers ---
//
// Полная форма каталога + вне_боя: true (каталог master: 17 заклинаний,
// НОЛЬ с вне_боя — гость обязателен для положительного сценария).

function ocGuest(id, over = {}) {
  return Object.assign({
    id,
    название: 'Гость (000235.02)',
    школа: 'тень',
    база: null,
    степень: 1,
    атрибут: 'intelligence',
    уровень: 1,
    мани: 5,
    действие: 'внебой',
    вне_боя: true,
    параметры: { days: 1 },
    здания: ['assets/buildings/000001.json'],
    описание: 'Гостевое заклинание (000235.02)',
    icon: 'assets/spell-icons/ghost.svg',
    icon_prompt: 'Тестовая иконка (000235.02)',
  }, over);
}

// Инъекция в живой каталог ПОСЛЕ boot: main.js (снапшот G) держит те
// же объект-ссылки SPELLS/SPELLS_BY_ID — мутация видна во всех модулях.
function injectGuests(h, guests) {
  const data = h.sandbox.Game.SpellsData;
  assert.ok(data && data.SPELLS && data.SPELLS_BY_ID,
    'сценарий: SpellsData в цепочке');
  for (const g of guests) {
    data.SPELLS.push(g);
    data.SPELLS_BY_ID[g.id] = g;
  }
  return guests;
}

// Стартовое окно (000138) активно при КАЖДОЙ загрузке до клика
// «Продолжить» (оверлей, не гейт). Книга — для экранов мир/
// подземелье/город (ТЗ п.4): в сценариях «Продолжить» уже кликнуто.
function dismissStartWindow(h) {
  const g = h.sandbox.__game;
  const sw = g.startWindow;
  assert.ok(sw && typeof sw.hide === 'function',
    'фикстура: __game.startWindow (000138)');
  sw.hide();
  assert.equal(sw.isActive(), false,
    'стартовое окно скрыто (клик «Продолжить»)');
}

// Изучение — push в live hero.spells (state-зеркало: тот же массив).
function learn(h, ids) {
  const spells = h.sandbox.__game.state.hero.spells;
  assert.ok(Array.isArray(spells), 'сценарий: live hero.spells (массив)');
  for (const id of ids) spells.push(id);
}

// Объекты из vm-сэндбокса — чужой realm; JSON-рондтрип (паттерн
// tests/save.test.js host()).
function host(o) { return JSON.parse(JSON.stringify(o)); }

// mp героя — ЧЕРЕЗ СЕЙВ (g.state.hero.mp в зеркале НЕТ — конвенция
// camp-map-e2e CP-11): beforeunload → saveNow → data.hero (live JSON).
function saveHero(h) {
  const bu = h.winListeners['beforeunload'];
  assert.ok(bu && bu.length > 0, 'beforeunload зарегистрирован');
  bu[0]();
  const raw = h.storage.getItem(S.SAVE_KEY);
  assert.ok(raw, 'сейв в localStorage (saveNow вызван)');
  const saved = JSON.parse(raw);
  return saved.data.hero;
}

// Клик по строке книги (строка — setAttribute('data-spell-id') + СВОЙ
// click-listener, makeEl-совместимо: listeners по элементу).
function clickRow(h, id) {
  const row = h.body.querySelector('[data-spell-id="' + id + '"]');
  assert.ok(row, 'строка ' + id + ' в книге');
  const l = row.listeners && row.listeners.click;
  assert.ok(l && l.length > 0,
    'строка ' + id + ' — свой click-listener (makeEl)');
  l[l.length - 1]();
}

// Аффорданс на экране: хинт + МП в строке героя (Д-1/Д-3).
function assertScreenAffordance(h, label) {
  const text = String(h.hud.textContent);
  assert.ok(text.includes('  |  [B] книга'),
    label + ': аффорданс «  |  [B] книга» в key-hint-строке: '
    + JSON.stringify(text));
  assert.ok(
    /\nHP \d+\/\d+  \|  МП \d+\/\d+  \|  Золото: \d+  \|  Очки: \d+\n/
      .test(text),
    label + ': «МП x/y» в строке героя (Д-1): ' + JSON.stringify(text));
}

test('000235.02 OC11: полная цепочка — Game.spellbookOC в снапшоте (тег ДО main.js) + load-clean + аффорданс «  |  [B] книга» + «МП x/y» в строке (world)', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  assert.equal(h.errors.length, 0,
    'RED: load-clean — 0 console.error при загрузке цепочки: '
    + h.errors.join('; '));
  const oc = G.spellbookOC;
  assert.ok(oc,
    'RED: Game.spellbookOC в снапшоте main.js (тег src/spellbook-oc.js '
    + 'ДО src/main.js — 000038)');
  for (const fn of ['init', 'toggle', 'isOpen', 'close',
    'applyVisibility', 'render']) {
    assert.equal(typeof oc[fn], 'function', 'surface: ' + fn + ' — функция');
  }
  const g = h.sandbox.__game;
  const sw = g.startWindow;
  assert.ok(sw && sw.isActive(),
    'фикстура: стартовое окно активно сразу после boot (000138)');
  key(h, 'KeyB');
  assert.ok(!h.body.querySelector('.spellbook-oc'),
    'стартовое окно активно — книга НЕ открывается (блок-список, '
    + 'ревью 000235.02): .spellbook-oc в body НЕТ');
  dismissStartWindow(h);
  const errBefore = h.errors.length;
  injectGuests(h, [ocGuest('oc_e2e_a')]);
  learn(h, ['oc_e2e_a']);
  h.frameFn(NOW + 16);
  assertScreenAffordance(h, 'world');
  assert.equal(h.errors.length, errBefore,
    'чистый путь (кадр с хинтом) — без новых console.error: '
    + h.errors.slice(errBefore).join('; '));
});

test('000235.02 OC12: книга (KeyB) — ТОЛЬКО известные вне_боя: РОВНО строка известного гостя; боевые spark/mend (дефолтная книга) и неизученный гость — НЕТ', async () => {
  const h = await boot();
  dismissStartWindow(h);
  const a = ocGuest('oc_e2e_a');
  const b = ocGuest('oc_e2e_b', { мани: 100, параметры: { days: 2 } });
  const c = ocGuest('oc_e2e_c', { мани: 7, параметры: { days: 3 } });
  injectGuests(h, [a, b, c]);
  learn(h, [a.id]); // B — изучим в OC13-сценариях, здесь НЕ изучен;
                    // C — неизучен (не в списке)
  h.frameFn(NOW + 16);
  key(h, 'KeyB');
  const book = h.body.querySelector('.spellbook-oc');
  assert.ok(book,
    'RED: книга открыта (KeyB): .spellbook-oc в body (master: модуля нет)');
  const rows = findAll(h.body, '.spoc-row');
  assert.equal(rows.length, 1,
    'РОВНО ОДНА строка (известные вне_боя): ' + rows.length +
    (rows.length ? ' — ' + rows.map((r) =>
      JSON.stringify(r.textContent)).join(' ; ') : ''));
  assert.ok(h.body.querySelector('[data-spell-id="' + a.id + '"]'),
    'строка известного гостя A (data-spell-id)');
  assert.ok(!h.body.querySelector('[data-spell-id="spark"]'),
    'боевого spark (дефолтная книга нового героя) — НЕТ');
  assert.ok(!h.body.querySelector('[data-spell-id="mend"]'),
    'боевого mend — НЕТ');
  assert.ok(!h.body.querySelector('[data-spell-id="' + b.id + '"]'),
    'НЕизученного гостя B — НЕТ');
  assert.ok(!h.body.querySelector('[data-spell-id="' + c.id + '"]'),
    'НЕизученного гостя C — НЕТ');
  assert.equal(findAll(h.body, '.spoc-empty').length, 0,
    'строки «Нет изученных заклинаний вне боя» (.spoc-empty) НЕТ — '
    + 'строка есть (книга не пустая)');
});

test('000235.02 OC13: каст по клику — mp ровно «мани», запись в state, ok → книга закрыта; «не хватает маны» — flash в #hud, mp/эффекты без изменений', async () => {
  const h = await boot();
  dismissStartWindow(h);
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const a = ocGuest('oc_e2e_a'); // мани 5, days 1
  const b = ocGuest('oc_e2e_b', { мани: 100, параметры: { days: 2 } });
  injectGuests(h, [a, b]);
  learn(h, [a.id, b.id]);
  assert.equal(g.state.day, 1, 'фикстура: день 1');
  const mp0 = saveHero(h).mp;
  assert.equal(mp0, 16,
    'фикстура: новый герой mp = maxMP 16 (sheet.js:445)');
  h.frameFn(NOW + 16);
  // Каст A (день 1, days 1 → expiresDay 2): mp 16 → 11.
  key(h, 'KeyB');
  assert.ok(h.body.querySelector('.spellbook-oc'), 'книга открыта');
  clickRow(h, a.id);
  assert.deepEqual(host(g.state.hero.outOfCombatEffects),
    [{ spellId: a.id, expiresDay: 2 }],
    'RED: запись {spellId, expiresDay} в state-зеркале (день 1 + days 1)');
  assert.equal(saveHero(h).mp, 11, 'mp ровно «мани» (16 − 5)');
  assert.equal(G.spellbookOC.isOpen(), false,
    'ok → книга ЗАКРЫТА (прецедент боевой книги; успеха-флэша НЕТ)');
  // Каст B: мани 100 > 11 — «не хватает маны».
  key(h, 'KeyB');
  assert.ok(h.body.querySelector('.spellbook-oc'), 'книга снова открыта');
  const mpBeforeFail = saveHero(h).mp;
  clickRow(h, b.id);
  assert.equal(saveHero(h).mp, mpBeforeFail, 'отказ: mp НЕ изменился');
  assert.deepEqual(host(g.state.hero.outOfCombatEffects),
    [{ spellId: a.id, expiresDay: 2 }], 'отказ: эффекты без изменений');
  h.frameFn(NOW + 32);
  const text = String(h.hud.textContent);
  assert.ok(text.includes('не хватает маны'),
    'RED: отказ — flash-строка «не хватает маны» в #hud (flash = '
    + 'hudFlash, flashUntil = NOW+5000 > NOW — часы заморожены): '
    + JSON.stringify(text));
});

test('000235.02 OC14: все ТРИ экрана — мир → подземелье → город: аффорданс + книга + каст; dungeon-ui.js — НЕ хост оверлея', async () => {
  const h = await boot();
  dismissStartWindow(h);
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const a = ocGuest('oc_e2e_a');
  injectGuests(h, [a]);
  learn(h, [a.id]);
  const errBefore = h.errors.length;
  const mp0 = saveHero(h).mp;
  // (1) Мир: аффорданс + каст по клику.
  h.frameFn(NOW + 16);
  assertScreenAffordance(h, 'мир');
  key(h, 'KeyB');
  assert.ok(h.body.querySelector('.spellbook-oc'), 'мир: книга открыта');
  clickRow(h, a.id);
  assert.equal(saveHero(h).mp, mp0 - 5, 'мир: каст по клику (mp −5)');
  // (2) Подземелье: dungeonUI НЕ блокирует; оверлей НЕ в .dungeon-overlay.
  g.actions.enterDungeon();
  h.frameFn(NOW + 32);
  assertScreenAffordance(h, 'подземелье');
  key(h, 'KeyB');
  const ov = dungeonOverlayOf(h);
  assert.ok(ov, 'экран подземелья — .dungeon-overlay в body');
  assert.equal(findAll(ov, '.spellbook-oc').length, 0,
    'dungeon-ui.js — НЕ хост: .spellbook-oc НЕ внутри .dungeon-overlay '
    + '(ТЗ п.6)');
  assert.ok(h.body.querySelector('.spellbook-oc'),
    'подземелье: книга ОТКРЫТА (KeyB работает — dungeonUI не в '
    + 'блок-списке, единое #hud 000229)');
  key(h, 'KeyB');
  assert.ok(!h.body.querySelector('.spellbook-oc'),
    'подземелье: закрыта (KeyB → close)');
  press(h, 'KeyE');
  release(h, 'KeyE');
  assert.equal(g.dungeon, null, '[E] на едином тайле — выход (000177)');
  // (3) Город (city-screen протокол): аффорданс + книга.
  await drain();
  enterCity(h, NOW + 64, myMap, (c) => c.fp >= 2);
  h.frameFn(NOW + 96);
  assertScreenAffordance(h, 'город');
  key(h, 'KeyB');
  assert.ok(h.body.querySelector('.spellbook-oc'), 'город: книга открыта');
  key(h, 'KeyB');
  assert.ok(!h.body.querySelector('.spellbook-oc'),
    'город: закрыта (KeyB → close)');
  assert.equal(h.errors.length, errBefore,
    'все 3 экрана — без новых console.error: '
    + h.errors.slice(errBefore).join('; '));
});

test('000235.02 OC15: истечение по дням (день-хук clock.onDay) — days=1: пусто в D+1; days=2: жив в D+1, пусто в D+2 (expiresDay <= day)', async () => {
  const h = await boot();
  dismissStartWindow(h);
  const g = h.sandbox.__game;
  const a = ocGuest('oc_e2e_a', { параметры: { days: 1 } });
  const d = ocGuest('oc_e2e_d', { мани: 3, параметры: { days: 2 } });
  injectGuests(h, [a, d]);
  learn(h, [a.id, d.id]);
  assert.equal(g.state.day, 1, 'фикстура: день 1');
  h.frameFn(NOW + 16);
  // Каст A в день 1 (days 1 → expiresDay 2).
  key(h, 'KeyB');
  clickRow(h, a.id);
  assert.deepEqual(host(g.state.hero.outOfCombatEffects),
    [{ spellId: a.id, expiresDay: 2 }], 'каст в день 1: expiresDay 2');
  // days=1: в D+1 (день 2) эффект УЖЕ вылетел.
  g.actions.setDay(2); // rest() → onDay → expireOutOfCombatEffects
  assert.deepEqual(host(g.state.hero.outOfCombatEffects), [],
    'RED: days=1 — в D+1 эффектов НЕТ (день-хук main.js:1571-1573 '
    + 'зона; master: хука нет — запись живёт вечно)');
  // Каст D в день 2 (days 2 → expiresDay 4).
  key(h, 'KeyB');
  clickRow(h, d.id);
  assert.deepEqual(host(g.state.hero.outOfCombatEffects),
    [{ spellId: d.id, expiresDay: 4 }], 'каст в день 2: expiresDay 4');
  // days=2: в D+1 (день 3) эффект ЖИВ.
  g.actions.setDay(3);
  assert.deepEqual(host(g.state.hero.outOfCombatEffects),
    [{ spellId: d.id, expiresDay: 4 }],
    'days=2 — в D+1 (день 3) эффект жив (expiresDay > day)');
  // в D+2 (день 4) — вылетел (expiresDay <= day).
  g.actions.setDay(4);
  assert.deepEqual(host(g.state.hero.outOfCombatEffects), [],
    'days=2 — в D+2 (день 4) эффект вылетел (живёт ровно 2 дня)');
});

// =====================================================================
// 000235.07 — Волна Огонь: e2e механики внебоевых (красные)
//
// W-10b — flame_step (телепорт 10 тайлов) через книгу в подземелье.
// W-12b — hearthfire (лагерь, реген HP/MP +10%) — ГРАНИЦА onDay
// (restoreDay ДО expire: ровно ОДИН усиленный день, expiresDay >= day).
//
// Краснота: в каталоге spells записей волны НЕТ (17) — строки
// flame_step/hearthfire в книге отсутствуют (render-фильтр
// вне_боя===true по SPELLS_BY_ID) — clickRow падает на «строка … в
// книге». Дальние ассерты (телепорт/реген) — пины Зелёной стадии.
// =====================================================================

// Досеянная оболочка сейва (v1; паттерн tests/dungeon-loot-e2e.test.js).
function seedSave07(data) {
  return { version: 1, savedAt: new Date(0).toISOString(), data };
}

// Персонаж для досеянного сейва (форма createCharacter + over).
function mkHero07(over = {}) {
  return Object.assign(P.createCharacter(), over);
}

test('000235.07 W-10b: e2e flame_step (книга + подземелье) — телепорт 10 тайлов по последнему движению (mp −7, записей НЕТ); стена → ближайший проходимый; отказы «нет направления движения»/«некуда шагнуть»/город — мана откатилась', async () => {
  // Сид mp 24 (maxMP 70 по primary): кейс D идёт с mp ≥ 7 — пин
  // «некуда шагнуть» остаётся е2е-покрытым после ревью-правки
  // (проверка маны ПЕРЕД cb; mp < 7 давал бы «не хватает маны»).
  const h = await boot(seedSave07({
    day: 1,
    hero: mkHero07({
      mp: 24,
      primary: {
        strength: 1, dexterity: 1, constitution: 10,
        intelligence: 10, wisdom: 10, charisma: 1,
      },
    }),
  }));
  dismissStartWindow(h);
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  assert.equal(saveHero(h).mp, 24, 'фикстура: сид героя mp 24 (maxMP 70)');
  learn(h, ['flame_step']);
  const ds = g.actions.enterDungeon(G.TERRAIN.HILL);
  assert.ok(ds && ds.kind === 'dungeon', 'подземелье открыто');
  h.frameFn(NOW + 16);
  const d = ds.dg;
  const w = d.width;
  const F = G.CELL_FLOOR, WL = G.CELL_WALL;
  // Контролируемая комната: весь интерьер FLOOR, периметр WALL.
  for (let y = 0; y < d.height; y++)
    for (let x = 0; x < w; x++)
      d.cells[y * w + x] = (x === 0 || y === 0 || x === w - 1
        || y === d.height - 1) ? WL : F;
  ds.contents = { seed: 1, mobs: [], chests: [], deposits: [],
    createdAtXp: 0, step: 0 };
  const ex = ds.x, ey = ds.y;
  assert.ok(ex > 1 && ey > 1 && ex < w - 2 && ey < d.height - 2,
    'фикстура: вход — интерьерная клетка: ' + ex + ',' + ey);
  // A. Шаг вправо (направление (1,0)) → телепорт k=10 (максимум).
  press(h, 'ArrowRight');
  assert.equal(ds.x, ex + 1, 'шаг: (ex+1, ey)');
  key(h, 'KeyB');
  assert.ok(h.body.querySelector('.spellbook-oc'), 'книга открыта');
  clickRow(h, 'flame_step');
  assert.equal(G.spellbookOC.isOpen(), false, 'успех → книга закрыта');
  assert.equal(ds.x, ex + 11, 'телепорт: приземление k=10 (макс. дистанция)');
  assert.equal(ds.y, ey, 'телепорт: та же клетка ряда');
  assert.equal(saveHero(h).mp, 17, 'mp ровно «мани» (24 − 7)');
  assert.deepEqual(host(g.state.hero.outOfCombatEffects), [],
    'телепорт — ЗАПИСЕЙ НЕ создаёт');
  // B. Повторный каст без движения → «нет направления движения»,
  //    мана откатилась, позиция/записи без изменений, книга открыта.
  key(h, 'KeyB');
  assert.ok(h.body.querySelector('.spellbook-oc'), 'книга снова открыта');
  clickRow(h, 'flame_step');
  assert.equal(ds.x, ex + 11, 'отказ: позиция без изменений');
  assert.equal(saveHero(h).mp, 17, 'отказ: мана откатилась');
  assert.deepEqual(host(g.state.hero.outOfCombatEffects), [],
    'отказ: записей нет');
  h.frameFn(NOW + 32);
  assert.ok(String(h.hud.textContent).includes('нет направления движения'),
    'отказ: reason в #hud: ' + JSON.stringify(h.hud.textContent));
  key(h, 'KeyB');
  assert.ok(!h.body.querySelector('.spellbook-oc'), 'книга закрыта');
  // C. Стена на k=3 от старта телепорта → приземление на k=2.
  press(h, 'ArrowRight');
  assert.equal(ds.x, ex + 12, 'шаг перед сценарием «стена»');
  d.cells[ey * w + (ex + 15)] = WL;
  key(h, 'KeyB');
  clickRow(h, 'flame_step');
  assert.equal(ds.x, ex + 14,
    'стена на k=3 → ближайший проходимый k=2 (ex+12+2)');
  assert.equal(ds.y, ey, 'стена: та же клетка ряда');
  assert.equal(saveHero(h).mp, 10, 'mp (17 − 7)');
  // D. Стена на k=1 по направлению последнего движения → «некуда
  //    шагнуть», позиция/mp без изменений.
  press(h, 'ArrowLeft');
  assert.equal(ds.x, ex + 13, 'шаг влево (направление (−1,0))');
  d.cells[ey * w + (ex + 12)] = WL;
  key(h, 'KeyB');
  clickRow(h, 'flame_step');
  assert.equal(ds.x, ex + 13, '«некуда шагнуть»: позиция без изменений');
  assert.equal(saveHero(h).mp, 10, '«некуда шагнуть»: мана не тронута (mp 10 ≥ 7)');
  assert.deepEqual(host(g.state.hero.outOfCombatEffects), [],
    '«некуда шагнуть»: записей нет');
  h.frameFn(NOW + 48);
  assert.ok(String(h.hud.textContent).includes('некуда шагнуть'),
    '«некуда шагнуть»: reason в #hud: '
    + JSON.stringify(h.hud.textContent));
  key(h, 'KeyB');
  // E. Город (city-screen протокол) → «в городе телепорт недоступен».
  const h2 = await boot();
  dismissStartWindow(h2);
  const g2 = h2.sandbox.__game;
  const G2 = h2.sandbox.Game;
  const myMap = G2.createMap(G2.generateSeedPixels());
  learn(h2, ['flame_step']);
  const errBefore = h2.errors.length;
  const mp0 = saveHero(h2).mp;
  assert.equal(mp0, 16, 'город: фикстура mp 16');
  await drain();
  enterCity(h2, NOW + 64, myMap, (c) => c.fp >= 2);
  h2.frameFn(NOW + 96);
  key(h2, 'KeyB');
  assert.ok(h2.body.querySelector('.spellbook-oc'), 'город: книга открыта');
  clickRow(h2, 'flame_step');
  assert.equal(saveHero(h2).mp, mp0, 'город: мана откатилась');
  assert.deepEqual(host(g2.state.hero.outOfCombatEffects), [],
    'город: записей нет');
  h2.frameFn(NOW + 112);
  assert.ok(
    String(h2.hud.textContent).includes('в городе телепорт недоступен'),
    'город: reason в #hud: ' + JSON.stringify(h2.hud.textContent));
  assert.equal(h2.errors.length, errBefore,
    'город: без новых console.error: '
    + h2.errors.slice(errBefore).join('; '));
});

test('000235.07 W-12b: e2e hearthfire (книга) — лагерь: ровно ОДИН усиленный реген-день (ГРАНИЦА onDay: restoreDay ДО expire, expiresDay >= day), дальше базовый; запись вылетает; mp −5', async () => {
  // maxHP = (20 + 10×5) = 70; maxMP = 10 + (10+10)×3 = 70;
  // реген-множители 0.10 (без вторичных навыков). Буст ×1.1:
  //   день 2: 1 + round(7.7) = 9 / 10 + round(7.7) = 18
  //   день 3: 9 + round(7.0) = 16 / 18 + round(7.0) = 25
  const h = await boot(seedSave07({
    day: 1,
    hero: mkHero07({
      hp: 1, mp: 15,
      primary: {
        strength: 1, dexterity: 1, constitution: 10,
        intelligence: 10, wisdom: 10, charisma: 1,
      },
    }),
  }));
  dismissStartWindow(h);
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  assert.equal(g.state.day, 1, 'фикстура: день 1 (сид)');
  assert.equal(g.state.hero.hp, 1, 'фикстура: hp 1 (сид)');
  assert.equal(saveHero(h).mp, 15, 'фикстура: mp 15 (сид)');
  learn(h, ['hearthfire']);
  h.frameFn(NOW + 16);
  key(h, 'KeyB');
  assert.ok(h.body.querySelector('.spellbook-oc'), 'книга открыта');
  clickRow(h, 'hearthfire');
  assert.equal(G.spellbookOC.isOpen(), false, 'успех → книга закрыта');
  assert.deepEqual(host(g.state.hero.outOfCombatEffects),
    [{ spellId: 'hearthfire', expiresDay: 2 }],
    'запись {hearthfire, expiresDay: 2} (день 1 + days 1)');
  assert.equal(saveHero(h).mp, 10, 'mp ровно «мани» (15 − 5)');
  // День 2: запись ЕЩЁ в массиве (2 >= 2) → restoreDay ×1.1;
  // ПОСЛЕ restoreDay — expire (2 <= 2) → запись вылетает.
  g.actions.setDay(2);
  assert.equal(g.state.hero.hp, 9,
    'день 2: hp 1 + round(70×0.1×1.1) = 1 + 8 — УСИЛЕННЫЙ (×1.1)');
  assert.equal(saveHero(h).mp, 18,
    'день 2: mp 10 + 8 = 18 — УСИЛЕННЫЙ (×1.1)');
  assert.deepEqual(host(g.state.hero.outOfCombatEffects), [],
    'день 2: запись вылетела (expiresDay <= day)');
  // День 3: базовый реген.
  g.actions.setDay(3);
  assert.equal(g.state.hero.hp, 16,
    'день 3: hp 9 + round(70×0.1) = 9 + 7 — базовый');
  assert.equal(saveHero(h).mp, 25,
    'день 3: mp 18 + 7 = 25 — базовый');
});

// =====================================================================
// 000235.08 — Волна Лёд: W-10b — e2e frost_walk (книга, мир)
//
// Контракт memory/000235.08-ice-wave-content.md §7 W-10(b).
// Фикстура (ФАКТ ПРОБА, детерминированный фолбэк-мир): спавн (0,0);
// берег (0,4)–(0,6) SAND passable; вода (0,7)–(0,8) WATER
// passable:false; (103,75) WATER / (104,75) DEEP_WATER — шаг
// суша→DEEP в мире НЕ существует (все 812 DEEP окружены только
// WATER) → DEEP-нога из позиции-сейва на воде. Сид-позиция (0,6)
// (вне зоны (2,3), d=3) — шаг (0,1)–(0,5) входил бы в trigger-зону
// g4 → зона-бой (фикстура E4/E5).
//
// Краснота: в каталоге spells записи frost_walk НЕТ — строки в книге
// нет (render-фильтр вне_боя===true по SPELLS_BY_ID) — clickRow
// падает на «строка frost_walk в книге». Дальние ассерты
// (проходимость/позиция-сейв) — пины Зелёной стадии.
// =====================================================================

// Один монотонный now на сценарий: walk (шаг ОБЯЗАН состояться) и
// tryStep (шаг МОЖЕТ заблокироваться — без ассерта перехода).
// state.player — getter-СНИМОК (main.js:3665-3667) — телепортов
// НЕТ; позиционные ноги — сид-позиция сейва (паттерн E5).
function makeStepper(h) {
  const g = h.sandbox.__game;
  let now = NOW;
  const tryStep = (tx, ty) => {
    const px = g.state.player.x, py = g.state.player.y;
    const dx = tx - px, dy = ty - py;
    assert.ok(Math.abs(dx) + Math.abs(dy) === 1,
      'шаг по соседнему тайлу (' + px + ',' + py + ')→(' + tx + ',' + ty + ')');
    const code = keydownFor(dx, dy);
    key(h, code);
    let guard = 0;
    do {
      now += 200;
      h.frameFn(now);
    } while ((g.state.player.x !== tx || g.state.player.y !== ty)
      && ++guard < 12);
    keyup(h, code);
    return { moved: g.state.player.x === tx && g.state.player.y === ty, now };
  };
  const walk = (tx, ty) => {
    const r = tryStep(tx, ty);
    assert.ok(r.moved,
      'сценарий: игрок перешёл на (' + tx + ',' + ty + ')');
    return r.now;
  };
  return { walk, tryStep };
}

test('000235.08 W-10b: e2e frost_walk (книга, мир) — (0,6)→(0,7) ЗАБЛОКИРОВАНО без эффекта; каст (mp −7, запись {frost_walk, expiresDay:2}) → (0,7)/(0,8) WATER пройдено; DEEP: позиция-сейв (103,75) + запись → шаг (104,75) DEEP_WATER пройден; сейв на воде → reload → позиция СОХРАНЕНА; setDay(2) — истёк → шаг на воду ЗАБЛОКИРОВАН', async () => {
  const h = await boot(seedSave07({ day: 1, position: { x: 0, y: 6 } }));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  assert.ok(myMap.tileAt(0, 6).passable
    && myMap.tileAt(0, 7).terrain === G.TERRAIN.WATER
    && !myMap.tileAt(0, 7).passable
    && myMap.tileAt(0, 8).terrain === G.TERRAIN.WATER,
    'фикстура: берег (0,6) SAND, вода (0,7)/(0,8) WATER');
  assert.equal(g.state.player.x, 0, 'сид-позиция — x (0,6)');
  assert.equal(g.state.player.y, 6, 'сид-позиция — y');
  assert.equal(g.state.day, 1, 'фикстура: день 1');
  dismissStartWindow(h);
  learn(h, ['frost_walk']);
  const mp0 = saveHero(h).mp;
  assert.equal(mp0, 16, 'фикстура: новый герой mp = maxMP 16');
  const step = makeStepper(h);
  // Контроль (БЕЗ эффекта): шаг на воду ЗАБЛОКИРОВАН.
  const ctrl = step.tryStep(0, 7);
  assert.equal(ctrl.moved, false,
    'контроль: (0,6)→(0,7) — вода непроходима без frost_walk');
  assert.equal(g.state.player.x, 0, 'контроль: x без изменений');
  assert.equal(g.state.player.y, 6, 'контроль: y без изменений');
  assert.equal(G.combatUI.isActive(), false, 'контроль: без боя');
  // Каст ЧЕРЕЗ КНИГУ: RED — строки frost_walk в книге НЕТ (каталог 42,
  // волны нет).
  key(h, 'KeyB');
  assert.ok(h.body.querySelector('.spellbook-oc'), 'книга открыта (KeyB)');
  clickRow(h, 'frost_walk');
  assert.equal(G.spellbookOC.isOpen(), false,
    'каст ok → книга ЗАКРЫТА (RED: строки нет — книга открыта)');
  assert.deepEqual(host(g.state.hero.outOfCombatEffects),
    [{ spellId: 'frost_walk', expiresDay: 2 }],
    'запись {frost_walk, expiresDay: day+1} (RED: [])');
  assert.equal(saveHero(h).mp, mp0 - 7, 'mp ровно «мани» (16 − 7)');
  // Вода пройдена: (0,7) → (0,8).
  step.walk(0, 7);
  assert.equal(g.state.player.y, 7,
    'после каста: (0,7) WATER пройден (heroPassable)');
  assert.equal(myMap.tileAt(0, 7).terrain, G.TERRAIN.WATER,
    'под герой — WATER (не иллюзия проходимости)');
  step.walk(0, 8);
  assert.equal(g.state.player.y, 8, '(0,8) WATER пройден');
  assert.equal(G.combatUI.isActive(), false, 'ход по воде — без боя');
  // Сейв на воде (saveNow при beforeunload) → reload → позиция
  // СОХРАНЕНА (Правка блока «--- Позиция ---»: heroPassable, а не
  // t.passable — иначе герой на спавне: data-loss-like).
  saveHero(h);
  const savedRaw = h.storage.getItem(S.SAVE_KEY);
  assert.ok(savedRaw, 'сейв на воде записан');
  const hR = await boot(JSON.parse(savedRaw));
  const gR = hR.sandbox.__game;
  assert.equal(gR.state.player.x, 0,
    'RED: reload — позиция на воде сохранена (x; master: спавн)');
  assert.equal(gR.state.player.y, 8,
    'RED: reload — позиция на воде сохранена (y; master: спавн)');
  assert.deepEqual(host(gR.state.hero.outOfCombatEffects),
    [{ spellId: 'frost_walk', expiresDay: 2 }],
    'reload: запись восстановлена из сейва');
  assert.equal(saveHero(hR).mp, 9, 'reload: mp 9');
  // setDay(2) → эффект истёк → (0,8) непроходимо → герой
  // ПЕРЕНЕСЁН на ближайший проходимый тайл без группы (правка
  // ревью 000235.08: софтлок; (1,7) — кольцо 1, ФАКТ ПРОБА) →
  // шаг на воду ЗАБЛОКИРОВАН.
  gR.actions.setDay(2);
  assert.equal(gR.state.day, 2, 'день прошёл (setDay)');
  assert.deepEqual(host(gR.state.hero.outOfCombatEffects), [],
    'истечение (expiresDay <= day): запись вылетела');
  assert.equal(gR.state.player.x, 1,
    'истечение: герой перенесён на ближайший проходимый тайл (x)');
  assert.equal(gR.state.player.y, 7,
    'истечение: герой перенесён (y; до правки: позиция без изменений)');
  const stepR = makeStepper(hR);
  const exp = stepR.tryStep(0, 7);
  assert.equal(exp.moved, false,
    'после истечения: (1,7)→(0,7) — вода снова непроходима');
  // DEEP: позиция-сейв (103,75) WATER + запись frost_walk в сейве →
  // позиция сохранена (heroPassable) → шаг (104,75) DEEP_WATER
  // пройден (оба водных тайла в scope).
  const hD = await boot(seedSave07({
    day: 1,
    position: { x: 103, y: 75 },
    hero: Object.assign(P.createCharacter(), {
      outOfCombatEffects: [{ spellId: 'frost_walk', expiresDay: 2 }],
    }),
  }));
  const gD = hD.sandbox.__game;
  assert.ok(myMap.tileAt(103, 75).terrain === G.TERRAIN.WATER
    && myMap.tileAt(104, 75).terrain === G.TERRAIN.DEEP_WATER
    && !myMap.tileAt(104, 75).passable,
    'фикстура: (103,75) WATER, (104,75) DEEP_WATER (непроходимо)');
  assert.equal(gD.state.player.x, 103,
    'RED: DEEP-нога — позиция-сейв на воде сохранена (x; master: спавн)');
  assert.equal(gD.state.player.y, 75,
    'RED: DEEP-нога — позиция-сейв на воде сохранена (y)');
  const stepD = makeStepper(hD);
  stepD.walk(104, 75);
  assert.equal(gD.state.player.x, 104,
    'RED: (104,75) DEEP_WATER пройден под frost_walk (x)');
  assert.equal(gD.state.player.y, 75, '(104,75) DEEP_WATER пройден (y)');
  assert.equal(G.combatUI.isActive(), false, 'DEEP-нога — без боя');
});

// =====================================================================
// 000235.08 — Волна Лёд: W-10c — e2e frost_walk, истечение на воде
// (правка ревью: софтлок)
//
// Сценарий в штатной игре: герой кастует frost_walk, уходит в
// внутренность акватории (все 8 соседей — вода) и там сменяется день
// (addStep — только на успешном шаге): запись purged (expiresDay
// <= day), ни один из 8 шагов не проходится, rest — только
// постройка (лагерь/таверна, недостижима), MP восстанавливается
// ТОЛЬКО в onDay → софтлок до полной перезагрузки; при перезагрузке
// позиция — непроходима → герой на спавне (мир-позиция потеряна).
// Правка: в onDay ПОСЛЕ expireOutOfCombatEffects — если heroPassable
// под героем false, перенос на ближайший проходимый тайл БЕЗ группы
// (спираль, паттерн findSpawn; moveHero — телепорт-снап) + flash-
// строка (день — последняя строка), saveNow уже в конце onDay.
//
// Фикстура (ФАКТ ПРОБА): (104,75) DEEP_WATER, ВСЕ 8 соседей — вода
// (812 DEEP-тайлов окружены WATER только — контракт §2.3); ближайший
// проходимый тайл без группы — кольцо 3: кольца 1–2 — только вода.
// Сид: позиция-сейв на воде + запись {frost_walk, expiresDay: 2}
// (день 1 — запись активна, позиция валидна: паттерн DEEP-ноги W-10b).
// =====================================================================

test('000235.08 W-10c: e2e frost_walk — истечение на воде (суши в 8-соседстве нет): setDay — запись purged, герой ПЕРЕНЕСЁН на ближайший проходимый тайл (кольцо 3, без группы, без боя) — тайл проходим, флэш-строка, сейв с новой позицией, шаг снова доступен (master: герой остаётся на воде — софтлок)', async () => {
  const h = await boot(seedSave07({
    day: 1,
    position: { x: 104, y: 75 },
    hero: Object.assign(P.createCharacter(), {
      outOfCombatEffects: [{ spellId: 'frost_walk', expiresDay: 2 }],
    }),
  }));
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const T = G.TERRAIN;
  const isWater = (tt) => tt.terrain === T.WATER
    || tt.terrain === T.DEEP_WATER;
  assert.equal(myMap.tileAt(104, 75).terrain, T.DEEP_WATER,
    'фикстура: (104,75) DEEP_WATER (непроходимо)');
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      assert.ok(isWater(myMap.tileAt(104 + dx, 75 + dy)),
        'фикстура: 8-соседство (104,75) — вода (' + (104 + dx) + ','
        + (75 + dy) + ')');
    }
  }
  assert.equal(g.state.player.x, 104,
    'сид: позиция-сейв на воде сохранена (активная запись) — x');
  assert.equal(g.state.player.y, 75, 'сид: позиция-сейв на воде — y');
  assert.deepEqual(host(g.state.hero.outOfCombatEffects),
    [{ spellId: 'frost_walk', expiresDay: 2 }],
    'сид: запись восстановлена из сейва');
  assert.equal(G.combatUI.isActive(), false, 'сид: без боя');
  // День сменяется (hero на воде, запись expiresDay=2).
  g.actions.setDay(2);
  assert.equal(g.state.day, 2, 'день прошёл (setDay)');
  assert.deepEqual(host(g.state.hero.outOfCombatEffects), [],
    'истечение (expiresDay <= day): запись purged');
  const px = g.state.player.x, py = g.state.player.y;
  assert.ok(px !== 104 || py !== 75,
    'герой ПЕРЕНЕСЁН с (104,75) (master: остаётся на воде — софтлок)');
  const land = myMap.tileAt(px, py);
  assert.equal(land.passable, true,
    'тайл героя проходим (перенос; master: DEEP_WATER — непроходимо)');
  assert.equal(land.hasMobGroup, false,
    'тайл переноса — без группы мобов (паттерн findSpawn)');
  const d = Math.max(Math.abs(px - 104), Math.abs(py - 75));
  assert.equal(d, 3, 'перенос — на ближайшее кольцо (3)');
  for (let r = 1; r < d; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const t = myMap.tileAt(104 + dx, 75 + dy);
        assert.ok(!t.passable || t.hasMobGroup,
          'кольца 1..(d−1): проходимого тайла без группы нет ('
          + (104 + dx) + ',' + (75 + dy) + ')');
      }
    }
  }
  h.frameFn(NOW + 40);
  const hudText = String(h.hud.textContent);
  assert.ok(hudText.includes(
    'Позиция непроходима — перенос на ближайший проходимый тайл.'),
    'флэш: строка переноса в #hud: ' + JSON.stringify(hudText));
  assert.ok(hudText.includes('День 2.'),
    'флэш: строка дня на месте: ' + JSON.stringify(hudText));
  assert.equal(G.combatUI.isActive(), false, 'перенос — без боя');
  // Сейв (beforeunload) — НОВАЯ позиция, день 2, запись пустая.
  const savedRaw = h.storage.getItem(S.SAVE_KEY);
  assert.ok(savedRaw, 'сейв записан');
  const saved = JSON.parse(savedRaw);
  assert.equal(saved.data.day, 2, 'сейв: день 2');
  assert.deepEqual(saved.data.position, { x: px, y: py },
    'сейв: позиция = тайл переноса (проходимый)');
  assert.deepEqual(host(saved.data.hero.outOfCombatEffects), [],
    'сейв: запись purged');
  // Софтлок снят: шаг с тайла переноса снова доступен.
  const step = makeStepper(h);
  const r1 = step.tryStep(px - 1, py);
  assert.equal(r1.moved, true,
    'шаг после переноса доступен (master: все 8 шагов заблокированы)');
  assert.equal(G.combatUI.isActive(), false, 'шаг после переноса — без боя');
});

// =====================================================================
// Задача 000235.09: W-10b — shadow_step (книга + подземелье).
// shadow_step — переиспользование performFlameStep (10 тайлов, без
// RNG) через НОВЫЙ ctx-ключ shadowStep (R9): позиция-пины — те же,
// что flame_step; mp −5. RED: id «shadow_step» в каталоге нет
// (render-фильтр вне_боя===true по SPELLS_BY_ID) — clickRow падает
// на «строка … в книге». Дальние ассерты (телепорт/отказы) — пины
// Зелёной стадии.
// =====================================================================

test('000235.09 W-10b: e2e shadow_step (книга + подземелье) — телепорт 10 тайлов по последнему движению (mp −5, записей НЕТ); стена → ближайший проходимый; отказы «нет направления движения»/«некуда шагнуть»/город — мана откатилась (ре-пин: позиция-пины = flame_step, performFlameStep)', async () => {
  // Сид mp 24 (maxMP 70 по primary): кейс D идёт с mp ≥ 5 — пин
  // «некуда шагнуть» остаётся e2e-покрытым (проверка маны ПЕРЕД cb).
  const h = await boot(seedSave07({
    day: 1,
    hero: mkHero07({
      mp: 24,
      primary: {
        strength: 1, dexterity: 1, constitution: 10,
        intelligence: 10, wisdom: 10, charisma: 1,
      },
    }),
  }));
  dismissStartWindow(h);
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  assert.equal(saveHero(h).mp, 24, 'фикстура: сид героя mp 24 (maxMP 70)');
  learn(h, ['shadow_step']);
  const ds = g.actions.enterDungeon(G.TERRAIN.HILL);
  assert.ok(ds && ds.kind === 'dungeon', 'подземелье открыто');
  h.frameFn(NOW + 16);
  const d = ds.dg;
  const w = d.width;
  const F = G.CELL_FLOOR, WL = G.CELL_WALL;
  // Контролируемая комната: весь интерьер FLOOR, периметр WALL.
  for (let y = 0; y < d.height; y++)
    for (let x = 0; x < w; x++)
      d.cells[y * w + x] = (x === 0 || y === 0 || x === w - 1
        || y === d.height - 1) ? WL : F;
  ds.contents = { seed: 1, mobs: [], chests: [], deposits: [],
    createdAtXp: 0, step: 0 };
  const ex = ds.x, ey = ds.y;
  assert.ok(ex > 1 && ey > 1 && ex < w - 2 && ey < d.height - 2,
    'фикстура: вход — интерьерная клетка: ' + ex + ',' + ey);
  // A. Шаг вправо (направление (1,0)) → телепорт k=10 (максимум).
  press(h, 'ArrowRight');
  assert.equal(ds.x, ex + 1, 'шаг: (ex+1, ey)');
  key(h, 'KeyB');
  assert.ok(h.body.querySelector('.spellbook-oc'), 'книга открыта');
  clickRow(h, 'shadow_step');
  assert.equal(G.spellbookOC.isOpen(), false, 'успех → книга закрыта');
  assert.equal(ds.x, ex + 11, 'телепорт: приземление k=10 (макс. дистанция)');
  assert.equal(ds.y, ey, 'телепорт: та же клетка ряда');
  assert.equal(saveHero(h).mp, 19, 'mp ровно «мани» (24 − 5)');
  assert.deepEqual(host(g.state.hero.outOfCombatEffects), [],
    'телепорт — ЗАПИСЕЙ НЕ создаёт');
  // B. Повторный каст без движения → «нет направления движения»,
  //    мана откатилась, позиция/записи без изменений, книга открыта.
  key(h, 'KeyB');
  assert.ok(h.body.querySelector('.spellbook-oc'), 'книга снова открыта');
  clickRow(h, 'shadow_step');
  assert.equal(ds.x, ex + 11, 'отказ: позиция без изменений');
  assert.equal(saveHero(h).mp, 19, 'отказ: мана откатилась');
  assert.deepEqual(host(g.state.hero.outOfCombatEffects), [],
    'отказ: записей нет');
  h.frameFn(NOW + 32);
  assert.ok(String(h.hud.textContent).includes('нет направления движения'),
    'отказ: reason в #hud: ' + JSON.stringify(h.hud.textContent));
  key(h, 'KeyB');
  assert.ok(!h.body.querySelector('.spellbook-oc'), 'книга закрыта');
  // C. Стена на k=3 от старта телепорта → приземление на k=2.
  press(h, 'ArrowRight');
  assert.equal(ds.x, ex + 12, 'шаг перед сценарием «стена»');
  d.cells[ey * w + (ex + 15)] = WL;
  key(h, 'KeyB');
  clickRow(h, 'shadow_step');
  assert.equal(ds.x, ex + 14,
    'стена на k=3 → ближайший проходимый k=2 (ex+12+2)');
  assert.equal(ds.y, ey, 'стена: та же клетка ряда');
  assert.equal(saveHero(h).mp, 14, 'mp (19 − 5)');
  // D. Стена на k=1 по направлению последнего движения → «некуда
  //    шагнуть», позиция/mp без изменений.
  press(h, 'ArrowLeft');
  assert.equal(ds.x, ex + 13, 'шаг влево (направление (−1,0))');
  d.cells[ey * w + (ex + 12)] = WL;
  key(h, 'KeyB');
  clickRow(h, 'shadow_step');
  assert.equal(ds.x, ex + 13, '«некуда шагнуть»: позиция без изменений');
  assert.equal(saveHero(h).mp, 14, '«некуда шагнуть»: мана не тронута (mp 14 ≥ 5)');
  assert.deepEqual(host(g.state.hero.outOfCombatEffects), [],
    '«некуда шагнуть»: записей нет');
  h.frameFn(NOW + 48);
  assert.ok(String(h.hud.textContent).includes('некуда шагнуть'),
    '«некуда шагнуть»: reason в #hud: '
    + JSON.stringify(h.hud.textContent));
  key(h, 'KeyB');
  // E. Город (city-screen протокол) → «в городе телепорт недоступен».
  const h2 = await boot();
  dismissStartWindow(h2);
  const g2 = h2.sandbox.__game;
  const G2 = h2.sandbox.Game;
  const myMap = G2.createMap(G2.generateSeedPixels());
  learn(h2, ['shadow_step']);
  const errBefore = h2.errors.length;
  const mp0 = saveHero(h2).mp;
  assert.equal(mp0, 16, 'город: фикстура mp 16');
  await drain();
  enterCity(h2, NOW + 64, myMap, (c) => c.fp >= 2);
  h2.frameFn(NOW + 96);
  key(h2, 'KeyB');
  assert.ok(h2.body.querySelector('.spellbook-oc'), 'город: книга открыта');
  clickRow(h2, 'shadow_step');
  assert.equal(saveHero(h2).mp, mp0, 'город: мана откатилась');
  assert.deepEqual(host(g2.state.hero.outOfCombatEffects), [],
    'город: записей нет');
  h2.frameFn(NOW + 112);
  assert.ok(
    String(h2.hud.textContent).includes('в городе телепорт недоступен'),
    'город: reason в #hud: ' + JSON.stringify(h2.hud.textContent));
  assert.equal(h2.errors.length, errBefore,
    'город: без новых console.error: '
    + h2.errors.slice(errBefore).join('; '));
});

// =====================================================================
// Задача 000239 — flame_step: лендинг = полная после-шажная
// последовательность (расширение W-10b).
// Контракт: memory/000239-flame-step-landing.md (§1, §7); ТЗ:
// tasks/pending/000239.md.
//
// RED (7 — падают на master осмысленно: в performFlameStep
// (main.js:1979-1991) НЕТ пост-лендинговых вызовов —
// dungeonPostMove-пров (бой/сундук/wanderStep), clock.addStep,
// зона-скан, enterLocation, saveNow; не синтаксис/фикстуры):
//   * FS-D1 — ДЗ: моб-группа НА ТАЙЛЕ ЛАНДИНГА → каст → бой;
//   * FS-D2 — ДЗ: сундук НА ТАЙЛЕ ЛАНДИНГА → каст → chest-поток;
//   * FS-W1 — МИР: лендинг ВНУТРИ триггерящей зоны → зона-бой;
//   * FS-W2 — МИР: лендинг на ТАЙЛ ВХОДА города → город сразу;
//   * FS-W3 — МИР: сейв сразу после каста (RAW) — тайл ландинга;
//   * FS-T1 — ДЗ: часы +1 И wanderStep ровно 1 (non-combat);
//   * FS-T3 — МИР: часы +1 после ландинга.
// ЗЕЛЁНЫЕ (2 — coverage-пины, на master уже зелёные):
//   * FS-W4 — МИР: тупик → «некуда шагнуть» (surface-ветка,
//     ретро #5: ноль тестов);
//   * FS-P1 — МИР: луч блокируется footprint постройки.
//
// Фикстуры — assert-внутри-теста (краснота не от фикстур); все
// сценарии: суммарные шаги << 40 (steps_per_day) → день не сдвигается
// (явно ассертится «день не сдвинулся»).
// =====================================================================

// SEED-ПИН (паттерн tests/mob-zones-e2e.test.js): spy-обёртка
// G.combatUI.startCombat — ЕДИНСТВЕННЫЙ путь пиннить opts (seed/tile)
// зона-боя; main.js читает G.combatUI динамически.
function spyStartCombat(G) {
  const cap = { opts: null, calls: 0 };
  const orig = G.combatUI.startCombat;
  G.combatUI = Object.assign({}, G.combatUI, {
    startCombat: (opts) => {
      cap.opts = opts;
      cap.calls += 1;
      return orig(opts);
    },
  });
  return cap;
}

test('000239 FS-D1: e2e dungeon — моб-группа НА ТАЙЛЕ ЛАНДИНГА: каст → бой начинается (а не «герой прошёл сквозь»): combatUI активен, герой на тайле группы, mp −7, книга закрыта, часы +1 (T-6-зеркало: лендинг, запускающий бой, считается), contents.step НЕ тронут (wanderStep при бое не вызывается — LOC-8-зеркало); победа (9999) → group.defeated + log «Группа повержена…» (задача 000239)', async () => {
  const h = await boot(seedSave07({
    day: 1,
    hero: mkHero07({
      mp: 24,
      primary: {
        strength: 1, dexterity: 1, constitution: 10,
        intelligence: 10, wisdom: 10, charisma: 1,
      },
    }),
  }));
  dismissStartWindow(h);
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  assert.equal(saveHero(h).mp, 24, 'фикстура: сид героя mp 24 (maxMP 70)');
  learn(h, ['flame_step']);
  const ds = g.actions.enterDungeon(G.TERRAIN.HILL);
  assert.ok(ds && ds.kind === 'dungeon', 'подземелье открыто');
  h.frameFn(NOW + 16);
  const d = ds.dg;
  const w = d.width;
  const F = G.CELL_FLOOR, WL = G.CELL_WALL;
  // Контролируемая комната: весь интерьер FLOOR, периметр WALL.
  for (let y = 0; y < d.height; y++)
    for (let x = 0; x < w; x++)
      d.cells[y * w + x] = (x === 0 || y === 0 || x === w - 1
        || y === d.height - 1) ? WL : F;
  ds.contents = { seed: 1, mobs: [], chests: [], deposits: [],
    createdAtXp: 0, step: 0 };
  const ex = ds.x, ey = ds.y;
  assert.ok(ex > 1 && ey > 1 && ex < w - 2 && ey < d.height - 2,
    'фикстура: вход — интерьерная клетка: ' + ex + ',' + ey);
  const table = G.DUNGEON_MOBS[d.type];
  assert.ok(Array.isArray(table) && table.length >= 2,
    'фикстура: таблица мобов типа ' + d.type);
  press(h, 'ArrowRight');
  assert.equal(ds.x, ex + 1, 'шаг: (ex+1, ey)');
  const mob = { id: 'g0', mobIds: [table[0], table[1]], x: ex + 11,
    y: ey, level: 1, defeated: false };
  ds.contents.mobs = [mob];
  assert.equal(ds.contents.step, 1,
    'фикстура: step 1 после реального шага (wanderStep)');
  assert.equal(G.combatUI.isActive(), false, 'до каста: боя нет');
  const st0 = g.state.stepsToday;
  const cap = spyStartCombat(G);
  key(h, 'KeyB');
  assert.ok(h.body.querySelector('.spellbook-oc'), 'книга открыта');
  clickRow(h, 'flame_step');
  assert.equal(G.spellbookOC.isOpen(), false, 'успех → книга закрыта');
  assert.equal(ds.x, ex + 11, 'телепорт: ландинг k=10 (ex+11) — x');
  assert.equal(ds.y, ey, 'телепорт: та же клетка ряда — y');
  assert.equal(saveHero(h).mp, 17, 'mp ровно «мани» (24 − 7)');
  assert.equal(G.combatUI.isActive(), true,
    'RED: бой на ландинге (master: ландинг-проверки мобов отсутствуют)');
  assert.equal(cap.calls, 1, 'startCombat РОВНО 1× (лендинг)');
  assert.equal(ds.x, mob.x, 'герой на тайле группы (x)');
  assert.equal(ds.y, mob.y, 'герой на тайле группы (y)');
  assert.equal(g.state.stepsToday, st0 + 1,
    'RED: лендинг тикает часы (T-6-зеркало: шаг, запускающий бой, '
    + 'считается)');
  assert.equal(ds.contents.step, 1,
    'contents.step не тронут: при бое wanderStep НЕ вызывается '
    + '(LOC-8-зеркало)');
  const c = G.combatUI.current();
  assert.equal(c.groupName, 'блуждающая группа', 'бой — группа ДЗ');
  resolveCombat(G);
  assert.equal(mob.defeated, true, 'победа: group.defeated');
  assert.ok(ds.log.some((l) => l.startsWith('Группа повержена')),
    'победа: log «Группа повержена…»: ' + JSON.stringify(ds.log));
  assert.equal(ds.x, ex + 11, 'после победы: герой на тайле ландинга (x)');
  assert.equal(ds.y, ey, 'после победы: герой на тайле ландинга (y)');
  assert.equal(g.state.day, 1, 'день не сдвинулся (шаги << 40)');
});

test('000239 FS-D2: e2e dungeon — сундук НА ТАЙЛЕ ЛАНДИНГА: каст → chest-поток: opened=true, hero.gold +gold, предмет в инвентарь, ds.log «Сундук: +37 золота», флэш в #hud БЕЗ строки смены дня (день не сдвинулся), contents.step +1 (wanderStep ровно раз), mp −7, боя нет (задача 000239)', async () => {
  const h = await boot(seedSave07({
    day: 1,
    hero: mkHero07({
      mp: 24,
      primary: {
        strength: 1, dexterity: 1, constitution: 10,
        intelligence: 10, wisdom: 10, charisma: 1,
      },
    }),
  }));
  dismissStartWindow(h);
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  assert.equal(saveHero(h).mp, 24, 'фикстура: сид героя mp 24 (maxMP 70)');
  learn(h, ['flame_step']);
  const ds = g.actions.enterDungeon(G.TERRAIN.HILL);
  assert.ok(ds && ds.kind === 'dungeon', 'подземелье открыто');
  h.frameFn(NOW + 16);
  const d = ds.dg;
  const w = d.width;
  const F = G.CELL_FLOOR, WL = G.CELL_WALL;
  for (let y = 0; y < d.height; y++)
    for (let x = 0; x < w; x++)
      d.cells[y * w + x] = (x === 0 || y === 0 || x === w - 1
        || y === d.height - 1) ? WL : F;
  ds.contents = { seed: 1, mobs: [], chests: [], deposits: [],
    createdAtXp: 0, step: 0 };
  const ex = ds.x, ey = ds.y;
  assert.ok(ex > 1 && ey > 1 && ex < w - 2 && ey < d.height - 2,
    'фикстура: вход — интерьерная клетка: ' + ex + ',' + ey);
  press(h, 'ArrowRight');
  assert.equal(ds.x, ex + 1, 'шаг: (ex+1, ey)');
  const item = G.DUNGEON_ITEMS[d.type][0];
  assert.ok(item, 'фикстура: предмет пула типа ' + d.type);
  const chest = { id: 'c0', x: ex + 11, y: ey, opened: false,
    gold: 37, item };
  ds.contents.chests = [chest];
  const gold0 = g.state.hero.gold;
  const st0 = g.state.stepsToday;
  key(h, 'KeyB');
  assert.ok(h.body.querySelector('.spellbook-oc'), 'книга открыта');
  clickRow(h, 'flame_step');
  assert.equal(G.spellbookOC.isOpen(), false, 'успех → книга закрыта');
  assert.equal(ds.x, ex + 11, 'телепорт: ландинг k=10 (ex+11) — x');
  assert.equal(saveHero(h).mp, 17, 'mp ровно «мани» (24 − 7)');
  assert.equal(chest.opened, true,
    'RED: сундук открыт (master: chest-поток на ландинге отсутствует)');
  assert.equal(g.state.hero.gold, gold0 + 37,
    'RED: hero.gold +37 (chest-награда с ландинга)');
  assert.ok(ds.log.some((l) => l.startsWith('Сундук: +37 золота')),
    'RED: ds.log «Сундук: +37 золота…»: ' + JSON.stringify(ds.log));
  assert.equal(ds.contents.step, 2,
    'RED: wanderStep ровно 1× (step 1 → 2)');
  assert.equal(g.state.stepsToday, st0 + 1,
    'RED: лендинг тикает часы');
  const inv = host(g.state.hero.inventory);
  assert.ok(inv.some((s) => s && s.id === item),
    'RED: предмет сундука в инвентаре: ' + JSON.stringify(inv));
  assert.equal(G.combatUI.isActive(), false, 'боя нет');
  h.frameFn(NOW + 32);
  const text = String(h.hud.textContent);
  assert.ok(text.includes('Сундук: +37 золота'),
    'RED: флэш «Сундук: +37 золота» в #hud: ' + JSON.stringify(text));
  assert.ok(!text.includes('День 2.'),
    'флэш БЕЗ строки смены дня (день не сдвинулся): '
    + JSON.stringify(text));
  assert.equal(g.state.day, 1, 'день не сдвинулся (шаги << 40)');
});

test('000239 FS-T1: e2e dungeon — УСПЕШНЫЙ (non-combat) лендинг: часы +1 (день не сдвинулся) И G.wanderStep ровно 1×: contents.step +1, досеянная группа (НЕ на тайле ландинга) сдвинулась по своим правилам (новая позиция = G.wanderStep по клону: mulberry32(hash2(step+1, seed, 0x7777))) (задача 000239)', async () => {
  const h = await boot(seedSave07({
    day: 1,
    hero: mkHero07({
      mp: 24,
      primary: {
        strength: 1, dexterity: 1, constitution: 10,
        intelligence: 10, wisdom: 10, charisma: 1,
      },
    }),
  }));
  dismissStartWindow(h);
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  assert.equal(saveHero(h).mp, 24, 'фикстура: сид героя mp 24 (maxMP 70)');
  learn(h, ['flame_step']);
  const ds = g.actions.enterDungeon(G.TERRAIN.HILL);
  assert.ok(ds && ds.kind === 'dungeon', 'подземелье открыто');
  h.frameFn(NOW + 16);
  const d = ds.dg;
  const w = d.width;
  const F = G.CELL_FLOOR, WL = G.CELL_WALL;
  for (let y = 0; y < d.height; y++)
    for (let x = 0; x < w; x++)
      d.cells[y * w + x] = (x === 0 || y === 0 || x === w - 1
        || y === d.height - 1) ? WL : F;
  ds.contents = { seed: 1, mobs: [], chests: [], deposits: [],
    createdAtXp: 0, step: 0 };
  const ex = ds.x, ey = ds.y;
  assert.ok(ex > 1 && ey > 1 && ex < w - 2 && ey < d.height - 2,
    'фикстура: вход — интерьерная клетка: ' + ex + ',' + ey);
  press(h, 'ArrowRight');
  assert.equal(ds.x, ex + 1, 'шаг: (ex+1, ey)');
  const table = G.DUNGEON_MOBS[d.type];
  const mob = { id: 'g0', mobIds: [table[0]], x: ex + 3, y: ey,
    level: 1, defeated: false };
  ds.contents.mobs = [mob];
  assert.ok(!ds.contents.mobs.some((m) => m.x === ex + 11 && m.y === ey),
    'фикстура: группы на тайле ландинга (ex+11, ey) НЕТ');
  assert.equal(ds.contents.step, 1,
    'фикстура: step 1 после реального шага');
  const st0 = g.state.stepsToday;
  const step0 = ds.contents.step;
  const clone = JSON.parse(JSON.stringify(ds.contents));
  key(h, 'KeyB');
  assert.ok(h.body.querySelector('.spellbook-oc'), 'книга открыта');
  clickRow(h, 'flame_step');
  assert.equal(G.spellbookOC.isOpen(), false, 'успех → книга закрыта');
  assert.equal(ds.x, ex + 11, 'телепорт: ландинг k=10 (ex+11) — x');
  assert.equal(saveHero(h).mp, 17, 'mp ровно «мани» (24 − 7)');
  assert.equal(G.combatUI.isActive(), false,
    'non-combat-лендинг: боя нет');
  assert.equal(g.state.stepsToday, st0 + 1,
    'RED: лендинг тикает часы (master: clock.addStep отсутствует)');
  assert.equal(ds.contents.step, step0 + 1,
    'RED: wanderStep ровно 1× (contents.step +1; master: нет)');
  G.wanderStep(clone, d);
  assert.equal(mob.x, clone.mobs[0].x,
    'RED: группа сдвинулась по правилам — x (mulberry32(hash2('
    + '(step+1), seed, 0x7777)))');
  assert.equal(mob.y, clone.mobs[0].y,
    'RED: группа сдвинулась по правилам — y');
  assert.equal(mob.defeated, false, 'группа жива (боя не было)');
  assert.equal(g.state.day, 1, 'день не сдвинулся (шаги << 40)');
});

test('000239 FS-W1: e2e world — боевая зона пересекается лендингом: старт ВНЕ зоны (Чебышёв 3 от тайла группы), каст → луч останавливается ПЕРЕД тайлом ЖИВОЙ группы (новый world-предикат) → ландинг ВНУТРИ зоны (Чебышёв 1) → after-cast-скан: зона-бой (spy: opts.seed = hash2(тайла группы, 0x5eedc0de), opts.tile — тайл ГРУППЫ); герой на ландинге ПЕРЕД тайлом группы; mp −7 (задача 000239)', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  const den = myMap.tileAt(2, 3);
  assert.equal(den.mobGroup, 4, 'фикстура: паучье гнездо (2,3)');
  assert.ok(G.groupZoneInfo(4).triggers,
    'фикстура: триггерящий класс (радиус зоны 2)');
  assert.ok(myMap.tileAt(-2, 3).passable
    && !myMap.tileAt(-2, 3).hasMobGroup, 'фикстура: (−2,3)');
  assert.ok(myMap.tileAt(-1, 3).passable
    && !myMap.tileAt(-1, 3).hasMobGroup, 'фикстура: (−1,3) — старт');
  assert.ok(myMap.tileAt(0, 3).passable
    && !myMap.tileAt(0, 3).hasMobGroup, 'фикстура: (0,3)');
  assert.ok(myMap.tileAt(1, 3).passable
    && !myMap.tileAt(1, 3).hasMobGroup, 'фикстура: (1,3) — ландинг');
  assert.equal(Math.max(Math.abs(-1 - 2), Math.abs(3 - 3)), 3,
    'фикстура: старт (−1,3) ВНЕ зоны (Чебышёв 3 > 2)');
  dismissStartWindow(h);
  learn(h, ['flame_step']);
  const mp0 = saveHero(h).mp;
  assert.equal(mp0, 16, 'фикстура: новый герой mp 16');
  let now = NOW;
  now = walkTiles(h, now, [[-1, 0], [-2, 0], [-2, 1], [-2, 2], [-2, 3],
    [-1, 3]]);
  assert.equal(g.state.player.x, -1, 'старт (−1,3) — x');
  assert.equal(g.state.player.y, 3, 'старт (−1,3) — y');
  assert.equal(G.combatUI.isActive(), false,
    'ход: боя нет (маршрут вне зон)');
  const st0 = g.state.stepsToday;
  const cap = spyStartCombat(G);
  key(h, 'KeyB');
  assert.ok(h.body.querySelector('.spellbook-oc'), 'книга открыта');
  clickRow(h, 'flame_step');
  assert.equal(saveHero(h).mp, mp0 - 7, 'mp ровно «мани» (16 − 7)');
  assert.equal(G.combatUI.isActive(), true,
    'RED: зона-бой с ландинга (master: maybeStartCombat после '
    + 'moveHero отсутствует)');
  assert.ok(cap.opts, 'opts захвачены (spy startCombat)');
  assert.equal(cap.calls, 1, 'бой начат РОВНО 1× (лендинг)');
  assert.equal(cap.opts.seed, G.hash2(2, 3, 0x5eedc0de),
    'seed зона-боя — от тайла ГРУППЫ: hash2(2,3,0x5eedc0de)');
  assert.equal(cap.opts.tile.x, 2, 'opts.tile — тайл группы (x)');
  assert.equal(cap.opts.tile.y, 3, 'opts.tile — тайл группы (y)');
  assert.equal(g.state.player.x, 1,
    'RED: герой на ландинге ПЕРЕД тайлом группы (x; master: луч '
    + 'проходит ЧЕРЕЗ группу)');
  assert.equal(g.state.player.y, 3, 'герой на ландинге (y)');
  assert.equal(g.state.stepsToday, st0 + 1,
    'RED: лендинг тикает часы');
  assert.equal(g.state.day, 1, 'день не сдвинулся (шаги << 40)');
  assert.equal(G.spellbookOC.isOpen(), false, 'книга закрыта');
});

test('000239 FS-W2: e2e world — лендинг РОВНО на тайл ВХОДА города: луч k=1 = вход (isEntrance-исключение), k=2 = footprint (непроходим) → г.dungeon.kind === «city» СРАЗУ после каста + оверлей в body (НЕ «на следующем шаге»); mp −7 (задача 000239)', async () => {
  const h = await boot(seedSave07({ day: 1, position: { x: -23, y: -13 } }));
  dismissStartWindow(h);
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  const E = myMap.tileAt(-26, -13);
  assert.ok(E.passable && E.isEntrance && E.hasBuilding && E.inBuilding,
    'фикстура: E (−26,−13) — входной тайл (passable, inBuilding)');
  assert.equal(E.building, G.BUILDING_TYPES.NONE,
    'фикстура: E — город (building NONE)');
  const rec = G.getBuilding(E.buildingId);
  assert.equal(rec.категория, 'город', 'фикстура: каталожная запись');
  const tIn = myMap.tileAt(-27, -13);
  assert.ok(tIn.inBuilding && !tIn.isEntrance && !tIn.passable,
    'фикстура: E+D (−27,−13) — footprint non-entrance (непроходим — '
    + 'луч остановится на k=2)');
  const T = myMap.tileAt(-25, -13);
  const T2 = myMap.tileAt(-24, -13);
  assert.ok(T.passable && !T.hasMobGroup && !T.inBuilding,
    'фикстура: T (−25,−13) проходим, без группы');
  assert.ok(T2.passable && !T2.hasMobGroup && !T2.inBuilding,
    'фикстура: T2 (−24,−13) проходим, без группы');
  for (let x = -28; x <= -23; x++) {
    for (let y = -15; y <= -11; y++) {
      const t = myMap.tileAt(x, y);
      if (t.hasMobGroup) {
        assert.equal(G.groupZoneInfo(t.mobGroup).triggers, false,
          'фикстура: ЖИВОЙ триггерящей группы в Чебышёве ≤ 2 от '
          + 'E/T нет (' + x + ',' + y + ') — «бой > вход»');
      }
    }
  }
  assert.equal(g.state.player.x, -23, 'сид-позиция — x');
  assert.equal(g.state.player.y, -13, 'сид-позиция — y');
  learn(h, ['flame_step']);
  const mp0 = saveHero(h).mp;
  assert.equal(mp0, 16, 'фикстура: новый герой mp 16');
  let now = NOW;
  now = walkTiles(h, now, [[-24, -13], [-25, -13]]);
  assert.equal(G.combatUI.isActive(), false, 'ход: боя нет');
  assert.equal(g.dungeon, null, 'до каста: города нет');
  key(h, 'KeyB');
  assert.ok(h.body.querySelector('.spellbook-oc'), 'книга открыта');
  clickRow(h, 'flame_step');
  assert.equal(g.state.player.x, -26, 'ландинг: тайл входа (x)');
  assert.equal(g.state.player.y, -13, 'ландинг: тайл входа (y)');
  assert.equal(saveHero(h).mp, mp0 - 7, 'mp ровно «мани» (16 − 7)');
  assert.ok(g.dungeon,
    'RED: город зашёл СРАЗУ (master: enterLocation после moveHero '
    + 'отсутствует)');
  assert.equal(g.dungeon.kind, 'city', 'экран города (kind city)');
  h.frameFn(NOW + 32);
  assert.ok(dungeonOverlayOf(h), '.dungeon-overlay в body');
  assert.equal(G.spellbookOC.isOpen(), false, 'книга закрыта');
  assert.equal(g.state.day, 1, 'день не сдвинулся (шаги << 40)');
});

test('000239 FS-W3: e2e world — сейв СРАЗУ после каста (RAW-чтение localStorage БЕЗ beforeunload) содержит новую позицию: data.position === тайл ландинга (1,3) (saveNow ИЗ хэндлера; на master — позиция ДО каста, последний saveNow = обычный шаг) (задача 000239)', async () => {
  const h = await boot(seedSave07({ day: 1, position: { x: -2, y: 3 } }));
  dismissStartWindow(h);
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  assert.equal(myMap.tileAt(2, 3).mobGroup, 4,
    'фикстура: паучье гнездо (2,3)');
  assert.ok(G.groupZoneInfo(4).triggers,
    'фикстура: триггерящий класс (луч остановится ПЕРЕД группой)');
  assert.ok(myMap.tileAt(0, 3).passable
    && !myMap.tileAt(0, 3).hasMobGroup, 'фикстура: (0,3)');
  assert.ok(myMap.tileAt(1, 3).passable
    && !myMap.tileAt(1, 3).hasMobGroup, 'фикстура: (1,3) — ландинг');
  assert.equal(g.state.player.x, -2, 'сид-позиция — x');
  assert.equal(g.state.player.y, 3, 'сид-позиция — y');
  learn(h, ['flame_step']);
  let now = NOW;
  now = walkTiles(h, now, [[-1, 3]]);
  const raw0 = JSON.parse(h.storage.getItem(S.SAVE_KEY));
  assert.deepEqual(raw0.data.position, { x: -1, y: 3 },
    'фикстура: последний сейв до каста — реальный шаг (saveNow в '
    + 'frame): ' + JSON.stringify(raw0.data.position));
  key(h, 'KeyB');
  assert.ok(h.body.querySelector('.spellbook-oc'), 'книга открыта');
  clickRow(h, 'flame_step');
  const raw = h.storage.getItem(S.SAVE_KEY);
  assert.ok(raw, 'сейв присутствует (RAW-чтение, без beforeunload)');
  const saved = JSON.parse(raw);
  assert.deepEqual(saved.data.position, { x: 1, y: 3 },
    'RED: сейв после каста — тайл ландинга (1,3) (master: saveNow '
    + 'с ландинга отсутствует — позиция до каста)');
  assert.equal(g.state.player.x, 1,
    'RED: герой на ландинге ПЕРЕД тайлом группы (x)');
  assert.equal(g.state.player.y, 3, 'герой на ландинге (y)');
});

test('000239 FS-T3: e2e world — часы: после УСПЕШНОГО ландинга stepsToday +1 (день не сдвинулся) (задача 000239)', async () => {
  const h = await boot(seedSave07({ day: 1, position: { x: -2, y: 3 } }));
  dismissStartWindow(h);
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  assert.equal(myMap.tileAt(2, 3).mobGroup, 4,
    'фикстура: паучье гнездо (2,3)');
  assert.ok(myMap.tileAt(0, 3).passable && myMap.tileAt(1, 3).passable,
    'фикстура: луч проходим');
  assert.equal(g.state.player.x, -2, 'сид-позиция — x');
  assert.equal(g.state.player.y, 3, 'сид-позиция — y');
  learn(h, ['flame_step']);
  let now = NOW;
  now = walkTiles(h, now, [[-1, 3]]);
  const st0 = g.state.stepsToday;
  assert.equal(st0, 1, 'фикстура: stepsToday = 1 (один реальный шаг)');
  key(h, 'KeyB');
  assert.ok(h.body.querySelector('.spellbook-oc'), 'книга открыта');
  clickRow(h, 'flame_step');
  assert.equal(G.spellbookOC.isOpen(), false, 'успех → книга закрыта');
  assert.equal(g.state.stepsToday, st0 + 1,
    'RED: лендинг тикает часы (master: clock.addStep в world-ветке '
    + 'отсутствует)');
  assert.equal(g.state.day, 1, 'день не сдвинулся (шаги << 40)');
});

test('000239 FS-W4: e2e world — окружение тупиком (T проходим, T+d непроходим, T−d проходим; герой на T, направление d): «некуда шагнуть», позиция/записи/mp/stepsToday без изменений (coverage surface-ветки — ретро #5: до этой задачи ноль тестов) (задача 000239)', async () => {
  const h = await boot(seedSave07({ day: 1, position: { x: 0, y: 5 } }));
  dismissStartWindow(h);
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  assert.ok(myMap.tileAt(0, 5).passable
    && !myMap.tileAt(0, 5).hasMobGroup, 'фикстура: (0,5) проходим');
  assert.ok(myMap.tileAt(0, 6).passable
    && !myMap.tileAt(0, 6).hasMobGroup, 'фикстура: (0,6) — T');
  assert.equal(myMap.tileAt(0, 7).passable, false,
    'фикстура: (0,7) — T+d вода (непроходима)');
  assert.equal(g.state.player.x, 0, 'сид-позиция — x');
  assert.equal(g.state.player.y, 5, 'сид-позиция — y');
  learn(h, ['flame_step']);
  const mp0 = saveHero(h).mp;
  assert.equal(mp0, 16, 'фикстура: новый герой mp 16');
  let now = NOW;
  now = walkTiles(h, now, [[0, 6]]);
  assert.equal(g.state.player.x, 0, 'шаг: (0,6) — x');
  assert.equal(g.state.player.y, 6, 'шаг: (0,6) — y (направление (0,1))');
  const st1 = g.state.stepsToday;
  const mp1 = saveHero(h).mp;
  assert.deepEqual(host(g.state.hero.outOfCombatEffects), [],
    'до каста: записей нет');
  key(h, 'KeyB');
  assert.ok(h.body.querySelector('.spellbook-oc'), 'книга открыта');
  clickRow(h, 'flame_step');
  assert.equal(g.state.player.x, 0, '«некуда шагнуть»: x без изменений');
  assert.equal(g.state.player.y, 6, '«некуда шагнуть»: y без изменений');
  assert.equal(saveHero(h).mp, mp1, '«некуда шагнуть»: мана откатилась');
  assert.equal(g.state.stepsToday, st1,
    '«некуда шагнуть»: часы не тикают (ландинга не было)');
  assert.deepEqual(host(g.state.hero.outOfCombatEffects), [],
    '«некуда шагнуть»: записей нет');
  h.frameFn(now + 16);
  assert.ok(String(h.hud.textContent).includes('некуда шагнуть'),
    '«некуда шагнуть»: reason в #hud: ' + h.hud.textContent);
  assert.equal(G.combatUI.isActive(), false, 'боя нет');
});

test('000239 FS-P1: e2e world — луч блокируется ПОСТРОЙКОЙ (footprint non-entrance passable=false): (a) ландинг ПЕРЕД footprint-тайлом (hero НЕ на inBuilding-тайле); (b) footprint на k=1 → «некуда шагнуть» (пин вынесенного world-предиката; входной тайл — FS-W2) (задача 000239)', async () => {
  // (a) ландинг перед footprint: сид (−60,−41) → (−59,−41)
  // (направление (1,0)) → луч: k=1 (−58,−41) проходим, k=2 =
  // footprint (−57,−41) непроходим → ландинг (−58,−41).
  const h = await boot(seedSave07({ day: 1, position: { x: -60, y: -41 } }));
  dismissStartWindow(h);
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  const fp = myMap.tileAt(-57, -41);
  assert.ok(fp.inBuilding && !fp.isEntrance && !fp.passable,
    'фикстура: (−57,−41) — footprint non-entrance (непроходим)');
  const T = myMap.tileAt(-58, -41);
  const T2 = myMap.tileAt(-59, -41);
  assert.ok(T.passable && !T.hasMobGroup && !T.inBuilding,
    'фикстура: (−58,−41) проходим, без группы');
  assert.ok(T2.passable && !T2.hasMobGroup && !T2.inBuilding,
    'фикстура: (−59,−41) проходим, без группы');
  for (let x = -60; x <= -56; x++) {
    for (let y = -43; y <= -39; y++) {
      const t = myMap.tileAt(x, y);
      if (t.hasMobGroup) {
        assert.equal(G.groupZoneInfo(t.mobGroup).triggers, false,
          'фикстура: ЖИВОЙ триггерящей группы рядом с коридором '
          + 'нет (' + x + ',' + y + ')');
      }
    }
  }
  assert.equal(g.state.player.x, -60, 'сид-позиция — x');
  assert.equal(g.state.player.y, -41, 'сид-позиция — y');
  learn(h, ['flame_step']);
  const mp0 = saveHero(h).mp;
  assert.equal(mp0, 16, 'фикстура: новый герой mp 16');
  let now = NOW;
  now = walkTiles(h, now, [[-59, -41]]);
  key(h, 'KeyB');
  assert.ok(h.body.querySelector('.spellbook-oc'), 'книга открыта (a)');
  clickRow(h, 'flame_step');
  assert.equal(g.state.player.x, -58,
    '(a): ландинг ПЕРЕД footprint-тайлом (x)');
  assert.equal(g.state.player.y, -41, '(a): ландинг (y)');
  const land = myMap.tileAt(-58, -41);
  assert.equal(land.inBuilding, false,
    '(a): герой НЕ на inBuilding-тайле');
  assert.equal(saveHero(h).mp, mp0 - 7, '(a): mp (16 − 7)');
  assert.equal(G.spellbookOC.isOpen(), false, '(a): книга закрыта');
  assert.equal(G.combatUI.isActive(), false, '(a): боя нет');
  // (b) footprint на k=1 → «некуда шагнуть»: отдельный boot (сид
  // (−60,−41) → (−59,−41) → (−58,−41), направление (1,0), k=1 =
  // footprint (−57,−41)).
  const h2 = await boot(seedSave07({ day: 1, position: { x: -60, y: -41 } }));
  dismissStartWindow(h2);
  const g2 = h2.sandbox.__game;
  learn(h2, ['flame_step']);
  let now2 = NOW;
  now2 = walkTiles(h2, now2, [[-59, -41], [-58, -41]]);
  assert.equal(g2.state.player.x, -58, 'ход (b): (−58,−41) — x');
  assert.equal(g2.state.player.y, -41, 'ход (b): (−58,−41) — y');
  const st1 = g2.state.stepsToday;
  const mp1 = saveHero(h2).mp;
  key(h2, 'KeyB');
  assert.ok(h2.body.querySelector('.spellbook-oc'), 'книга открыта (b)');
  clickRow(h2, 'flame_step');
  assert.equal(g2.state.player.x, -58,
    '(b) «некуда шагнуть»: x без изменений');
  assert.equal(g2.state.player.y, -41,
    '(b) «некуда шагнуть»: y без изменений');
  assert.equal(saveHero(h2).mp, mp1,
    '(b) «некуда шагнуть»: мана откатилась');
  assert.equal(g2.state.stepsToday, st1,
    '(b) «некуда шагнуть»: часы не тикают');
  h2.frameFn(now2 + 16);
  assert.ok(String(h2.hud.textContent).includes('некуда шагнуть'),
    '(b) «некуда шагнуть»: reason в #hud: ' + h2.hud.textContent);
});

test('000235.10 W-10b: e2e miracle (книга) — seed deadMercs (string-legacy + record) → каст: mp −20, ЗАПИСЕЙ НЕТ, ОБА в партии (record — level/xp/loyalty/hiredDay, string — backfill), deadMercs []; повторный каст (пусто) → «нет погибших», мана не списана; гейты «боевое заклинание»/«воскрешение недоступно здесь»', async () => {
  // mira-record: ядро intact (L3/xp100, ВСЕ 6 primary ≥ 1) — проходит
  // sanitizeMercSheet; string «merc_volk» — legacy (данные утрачены:
  // backfill из каталога, loyalty 50, hiredDay 0 — 000029).
  const miraSheet = {
    kind: 'merc', npcId: 'merc_mira', level: 3, xp: 100, totalXp: 100,
    points: 0,
    primary: { strength: 1, dexterity: 1, constitution: 1,
      intelligence: 3, wisdom: 2, charisma: 1 },
    secondary: { meditation: 2 }, skillXp: {},
    spells: ['mend', 'light_heal'],
  };
  const h = await boot(seedSave07({
    day: 1,
    companions: [],
    dead_mercs: ['merc_volk',
      { npcId: 'merc_mira', sheet: miraSheet, loyalty: 70, hiredDay: 5 }],
    hero: mkHero07({
      mp: 44,
      primary: {
        strength: 1, dexterity: 1, constitution: 10,
        intelligence: 10, wisdom: 10, charisma: 1,
      },
    }),
  }));
  assert.equal(h.errors.length, 0,
    'фикстура: load-clean (revive-конвейер 000161): '
    + h.errors.join('; '));
  dismissStartWindow(h);
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  // mp 44: первый каст −20 → 24; повторный проходит проверку маны
  // (24 ≥ 20) и падает на «нет погибших» — до списания.
  assert.equal(saveHero(h).mp, 44, 'фикстура: герой mp 44 (maxMP 70)');
  // deadMercs после загрузки (порядок сид-массива): string → backfill
  // (каталог volk: str 3/con 2, swordsman 2, spells []), record →
  // sanitize (10 ключей, свежая копия).
  assert.deepEqual(host(g.state.deadMercs), [
    {
      npcId: 'merc_volk',
      sheet: {
        kind: 'merc', npcId: 'merc_volk', level: 1, xp: 0, totalXp: 0,
        points: 0,
        primary: { strength: 3, dexterity: 1, constitution: 2,
          intelligence: 1, wisdom: 1, charisma: 1 },
        secondary: { swordsman: 2 }, skillXp: {}, spells: [],
      },
      loyalty: 50, hiredDay: 0,
    },
    {
      npcId: 'merc_mira',
      sheet: {
        kind: 'merc', npcId: 'merc_mira', level: 3, xp: 100, totalXp: 100,
        points: 0,
        primary: { strength: 1, dexterity: 1, constitution: 1,
          intelligence: 3, wisdom: 2, charisma: 1 },
        secondary: { meditation: 2 }, skillXp: {},
        spells: ['mend', 'light_heal'],
      },
      loyalty: 70, hiredDay: 5,
    },
  ], 'фикстура: deadMercs 2 записи (legacy-backfill + record-sanitize)');
  learn(h, ['miracle']);
  key(h, 'KeyB');
  assert.ok(h.body.querySelector('.spellbook-oc'), 'книга открыта');
  // RED: 000117 (miracle) нет в каталоге → строки в книге нет.
  clickRow(h, 'miracle');
  assert.equal(G.spellbookOC.isOpen(), false, 'успех → книга закрыта');
  assert.equal(saveHero(h).mp, 24, 'mp ровно «мани» (44 − 20)');
  assert.deepEqual(host(g.state.hero.outOfCombatEffects), [],
    'miracle — ЗАПИСЕЙ НЕ создаёт');
  // Оба в партии: обратный splice (конец → начало) → [mira, volk].
  const savedRaw = h.storage.getItem(S.SAVE_KEY);
  assert.ok(savedRaw, 'сейв после воскрешения (performMiracle → saveNow)');
  const saved = JSON.parse(savedRaw);
  assert.deepEqual(saved.data.dead_mercs, [],
    'сейв: dead_mercs [] (все воскрешены)');
  assert.deepEqual(saved.data.companions, [
    {
      npcId: 'merc_mira',
      sheet: {
        kind: 'merc', npcId: 'merc_mira', level: 3, xp: 100, totalXp: 100,
        points: 0,
        primary: { strength: 1, dexterity: 1, constitution: 1,
          intelligence: 3, wisdom: 2, charisma: 1 },
        secondary: { meditation: 2 }, skillXp: {},
        spells: ['mend', 'light_heal'],
      },
      loyalty: 70, hiredDay: 5,
    },
    {
      npcId: 'merc_volk',
      sheet: {
        kind: 'merc', npcId: 'merc_volk', level: 1, xp: 0, totalXp: 0,
        points: 0,
        primary: { strength: 3, dexterity: 1, constitution: 2,
          intelligence: 1, wisdom: 1, charisma: 1 },
        secondary: { swordsman: 2 }, skillXp: {}, spells: [],
      },
      loyalty: 50, hiredDay: 0,
    },
  ], 'сейв: companions — ОБА (record-данные сохранены, string — '
    + 'backfill; порядок [mira, volk] — обратный splice)');
  // Повторный каст (пусто) → «нет погибших»: мана НЕ списана
  // (отказ ДО мутаций), партия/записи не тронуты, книга открыта.
  key(h, 'KeyB');
  assert.ok(h.body.querySelector('.spellbook-oc'), 'книга снова открыта');
  clickRow(h, 'miracle');
  assert.equal(saveHero(h).mp, 24, 'отказ: мана не списана (24 ≥ 20)');
  assert.deepEqual(host(g.state.hero.outOfCombatEffects), [],
    'отказ: записей нет');
  assert.deepEqual(host(g.state.deadMercs), [], 'отказ: deadMercs []');
  const savedRaw2 = h.storage.getItem(S.SAVE_KEY);
  assert.deepEqual(JSON.parse(savedRaw2).data.companions,
    saved.data.companions, 'отказ: партия без изменений');
  h.frameFn(NOW + 16);
  assert.ok(String(h.hud.textContent).includes('нет погибших'),
    'отказ: reason в #hud: ' + JSON.stringify(h.hud.textContent));
  key(h, 'KeyB');
  assert.ok(!h.body.querySelector('.spellbook-oc'), 'книга закрыта');
  // Гейты (прямой вызов, зеркало 000037): боевое заклинание.
  assert.deepEqual(host(G.Spells.castOutOfCombat(
    { spells: ['radiant_heal'], mp: 30, outOfCombatEffects: [] },
    'radiant_heal', 1)),
    { ok: false, reason: 'боевое заклинание' },
    'гейт: боевое заклинание — не вне_боя');
  // Деградация: ctx БЕЗ miracle-cb → «воскрешение недоступно здесь».
  assert.deepEqual(host(G.Spells.castOutOfCombat(
    { spells: ['miracle'], mp: 30, outOfCombatEffects: [] },
    'miracle', 1, {})),
    { ok: false, reason: 'воскрешение недоступно здесь' },
    'гейт: opts без miracle — деградация (mana не списана: 30 ≥ 20)');
});

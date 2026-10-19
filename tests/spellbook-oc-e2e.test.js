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

async function boot() {
  const h = bootSandbox();
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

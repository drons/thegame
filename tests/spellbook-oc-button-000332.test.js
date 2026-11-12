// Задача 000332: кнопка книги заклинаний ВНЕ боя на экране (пункт 3
// задачи 000235: «На экран глобальной карты/подземелья/города добавить
// КНОПКУ КНИГИ ЗАКЛИНАНИЙ для возможности каста заклинаний ВНЕ боя»).
// ТЗ: tasks/done/000332.md. Контракт:
// memory/000332-ooc-spellbook.md.
//
// Корень (анализ): внебоевая книга + [B] + механика каста + 21
// внебоевое заклинание (все 6 школ) + невидимость + порталы уже
// реализованы на master (000235.02/.03/.04/.07–.12) — Р-2 контракта
// 000235.02 явно отложил на отдельную задачу ТОЛЬКО кнопку на экране
// (#hud — textContent-движок, pointer-events:none, детей чистит
// каждый кадр, П10). Дельта: body-уровневая кнопка по паттерну fsBtn
// (src/main.js) + CSS-правило + z-lift в frame-хуке (готовый конст
// fsOver). Кнопка — точка входа в СУЩЕСТВУЮЩИЙ роут: клик =
// G.spellbookOC.toggle() (тот же blocked-политика, что KeyB).
//
// RED (4 — падают на master ОСМЫСЛЕННО, не краш):
//   * B1 — DOM-кнопка: .spellbook-oc-btn в body.children (создаётся
//     JS main.js — скан по className, в стаб-нодах нет id); button
//     type=button, title, aria-label, ОДИН дочерний img
//     (assets/ui/combat_spellbook.svg — переиспользование, иконка на
//     диске + alt); load-clean (h.errors 0 — кнопка создаётся тихой).
//   * B2 — CSS-пин: правило .spellbook-oc-btn (position: fixed;
//     top: 12px; right: 12px; z-index: 15 — свободная зона: правый
//     верхний угол) + лестничный коммент включает кнопку.
//   * B3 — клик открывает книгу на ВСЕХ 3 экранах (прямое
//     тест-требование ТЗ): мир → подземелье (g.actions.enterDungeon)
//     → выход [E] → город (city-screen протокол OC14); на каждом:
//     клик → .spellbook-oc в body + G.spellbookOC.isOpen()===true;
//     закрытие по KeyB.
//   * B4 — z-gating: мир — zIndex '' (CSS-база z-15); подземелье —
//     '25' (frame-lift поверх dungeon-overlay z-20); бой
//     (g.actions.startCombat) — '' (под оверлеем z-20) + клик = no-op
//     (blocked(): combatUI.isActive → isOpen остаётся false).
//
// Регресс (б ТЗ «боевой каст не задет») — покрывают СУЩЕСТВУЮЩИЕ
// тесты master (combat-ui SB1, spellbook-oc-tabs, spells, portal-
// mechanic-e2e, invisibility-e2e) — 0 новых.
//
// 000351 РЕ-ПИН (осознанная смена контракта контейнер/размер/слушатель):
// кнопка переехала из body в общий блок #touch-controls — 4-я
// button.tc-action (стопка E,I,C,B, общий класс/размер с [E]/[I]/[C]);
// слушатель — pointerdown (как сиблинги), click-а нет; правило
// .spellbook-oc-btn и frame-lift z-25 УДАЛЕНЫ — над оверлеями кнопка
// за счёт контейнера #touch-controls z-30 (прецедент 000121), в бою —
// display:none единицей buttons + blocked() внутри toggle(). B1/B2/B4
// пересняты под новый контракт, B3 — тот же сценарий (тап = pointerdown).
//
// Харнес: per-file дубль tests/spellbook-oc-e2e.test.js (конвенция
// проекта): CHAIN из index.html (динамический), Proxy-DOM makeEl
// (данные-свойства, listeners, setAttribute только data-*; в
// стаб-нодах НЕТ id — кнопку ищем сканом body.children по className),
// WebGL/Image-стабы, performance.now() заморожен на NOW=1000.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const S = require('../src/save.js');

const ROOT = path.join(__dirname, '..');

// Цепочка скриптов — из index.html (не хардкод, паттерн main-visuals).
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const uiCode = fs.readFileSync(path.join(ROOT, 'src', 'ui.js'), 'utf8');
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

// Стартовое окно (000138) активно при КАЖДОЙ загрузке до клика
// «Продолжить» (оверлей, не гейт). Книга — для экранов мир/
// подземелье/город (ТЗ): в сценариях «Продолжить» уже кликнуто.
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

// --- Кнопка (000332; 000351 ре-пин: в общем блоке #touch-controls) ---
//
// Кнопка создаётся ui.js в #touch-controls (4-я .tc-action, схема
// 'keyboard' в этой песочнице — D-pad не строится); в стаб-нодах НЕТ
// aria-атрибутов (setAttribute роняет их — прецедент squad-panel
// «идентификация по иконке») — поиск сканом детей корня по img.src.
function tcBlock(h) {
  const root = h.body.children.find((c) => c.id === 'touch-controls');
  assert.ok(root, 'сценарий: #touch-controls в body (init при загрузке)');
  return root.children.filter((c) =>
    String(c.className).includes('tc-action'));
}

function findButton(h) {
  return tcBlock(h).find((b) => b.children.some(
    (ch) => String(ch.src || '') === 'assets/ui/combat_spellbook.svg'))
    || null;
}

// Тап по кнопке — pointerdown-слушатель (click-а нет; тот же
// конвейер, что у [E]/[I]/«Отряд»).
function clickButton(h) {
  const btn = findButton(h);
  assert.ok(btn,
    'кнопка книги (иконка combat_spellbook.svg) — в #touch-controls '
    + '(000351: общий блок .tc-action, не отдельный body-элемент)');
  const l = btn.listeners && btn.listeners.pointerdown;
  assert.ok(l && l.length > 0,
    'кнопка — pointerdown-слушатель (makeEl)');
  l[l.length - 1]({ pointerId: 1, preventDefault() {} });
}

test('000332 B1 (000351 ре-пин): кнопка книги — 4-я button.tc-action в #touch-controls (общий блок с [E]/[I]/«Отряд»), ОДИН дочерний img (assets/ui/combat_spellbook.svg, alt=""), aria-label — src-сканом ui.js; load-clean', async () => {
  const h = await boot();
  dismissStartWindow(h);
  assert.equal(h.errors.length, 0,
    'load-clean — кнопка создаётся тихо (0 console.*): '
    + h.errors.join('; '));
  const btns = tcBlock(h);
  assert.equal(btns.length, 4,
    'блок #touch-controls — 4 кнопки .tc-action (E, I, «Отряд», книга): '
    + btns.length);
  const btn = findButton(h);
  assert.ok(btn, 'кнопка книги — в #touch-controls');
  assert.equal(btn, btns[3],
    'кнопка книги — 4-я (конечная) в блоке (стопка снизу вверх E,I,C,B)');
  assert.equal(String(btn.tagName).toLowerCase(), 'button',
    'элемент — button');
  assert.equal(btn.className, 'tc-action',
    'общий класс .tc-action — тот же, что [E]/[I]/«Отряд» (000351: '
    + 'одного размера и в одном блоке)');
  const imgs = (btn.children || []).filter(
    (c) => String(c.tagName).toLowerCase() === 'img');
  assert.equal(imgs.length, 1, 'ОДИН дочерний img (иконка): ' + imgs.length);
  assert.equal(imgs[0].src, 'assets/ui/combat_spellbook.svg',
    'иконка — переиспользование существующей UI-иконки '
    + '(000302-каталог assets/ui): ' + imgs[0].src);
  assert.equal(imgs[0].alt, '',
    "alt='' — презентационная иконка (паттерн E/I/C, 000124)");
  // makeEl-стаб роняет aria-* (setAttribute — только data-*), имя —
  // src-сканом ui.js (прецедент squad-panel: идентификация по иконке).
  assert.ok(uiCode.includes("setAttribute('aria-label', 'Книга заклинаний')"),
    "ui.js задаёт кнопке книги setAttribute('aria-label', «Книга "
    + 'заклинаний») (паттерн сиблингов)');
  assert.ok(
    fs.existsSync(path.join(ROOT, 'assets', 'ui', 'combat_spellbook.svg')),
    'иконка assets/ui/combat_spellbook.svg — на диске');
});

test('000332 B2 (000351 ре-пин — инверсия): CSS-правило .spellbook-oc-btn УДАЛЕНО из index.html; лестничный коммент кнопку не упоминает', () => {
  assert.ok(!html.includes('.spellbook-oc-btn'),
    'CSS-правило/упоминания .spellbook-oc-btn должны отсутствовать '
    + '(000351: кнопка живёт в #touch-controls как .tc-action)');
  const flat = html.replace(/\s+/g, ' ');
  assert.ok(flat.includes(
    'Лестница: .char-panel 10 < .fs-btn 15 < .combat-overlay/'
    + '.dungeon-overlay 20'),
    'лестничный коммент z цел без сегмента кнопки: ' + JSON.stringify(
      flat.slice(flat.indexOf('Лестница'), flat.indexOf('Лестница') + 140)));
});

test('000332 B3: клик по кнопке открывает книгу на ВСЕХ 3 экранах — мир → подземелье → город (тот же роут, что [B]: G.spellbookOC.toggle)', async () => {
  const h = await boot();
  dismissStartWindow(h);
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  learn(h, ['invisibility']);
  const errBefore = h.errors.length;
  // (1) Мир.
  h.frameFn(NOW + 16);
  clickButton(h);
  assert.ok(h.body.querySelector('.spellbook-oc'),
    'RED: мир — книга открыта (.spellbook-oc в body)');
  assert.equal(G.spellbookOC.isOpen(), true,
    'RED: мир — isOpen() === true');
  key(h, 'KeyB');
  assert.ok(!h.body.querySelector('.spellbook-oc'),
    'мир: закрыта (KeyB)');
  assert.equal(G.spellbookOC.isOpen(), false, 'мир: isOpen() === false');
  // (2) Подземелье.
  g.actions.enterDungeon();
  h.frameFn(NOW + 32);
  clickButton(h);
  assert.ok(h.body.querySelector('.spellbook-oc'),
    'RED: подземелье — книга открыта');
  assert.equal(G.spellbookOC.isOpen(), true,
    'RED: подземелье — isOpen() === true');
  key(h, 'KeyB');
  assert.ok(!h.body.querySelector('.spellbook-oc'),
    'подземелье: закрыта (KeyB)');
  press(h, 'KeyE');
  release(h, 'KeyE');
  assert.equal(g.dungeon, null, '[E] на едином тайле — выход (000177)');
  // (3) Город (city-screen протокол OC14).
  await drain();
  enterCity(h, NOW + 64, myMap, (c) => c.fp >= 2);
  h.frameFn(NOW + 96);
  clickButton(h);
  assert.ok(h.body.querySelector('.spellbook-oc'),
    'RED: город — книга открыта');
  assert.equal(G.spellbookOC.isOpen(), true,
    'RED: город — isOpen() === true');
  key(h, 'KeyB');
  assert.ok(!h.body.querySelector('.spellbook-oc'),
    'город: закрыта (KeyB)');
  assert.equal(h.errors.length, errBefore,
    'все 3 экрана — без новых console.error: '
    + h.errors.slice(errBefore).join('; '));
});

test('000332 B4 (000351 ре-пин): frame-lift снят — inline zIndex НЕ задаётся никогда; над оверлеями — контейнер #touch-controls z-30 (CSS-пин, > dungeon/combat 20); бой: display:none единицей buttons + тап = no-op (blocked)', async () => {
  const h = await boot();
  dismissStartWindow(h);
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const btn = findButton(h);
  assert.ok(btn, 'кнопка (общая фикстура B4)');
  // CSS: контейнер над оверлеями сам — лифт больше не нужен (000121).
  const tcc = html.match(/#touch-controls\s*\{([^}]*)\}/);
  assert.ok(tcc && /z-index:\s*30/.test(tcc[1]),
    'гард: #touch-controls z-index 30');
  // dungeon-overlay несёт z-20 тем же правилом: overlay-элемент —
  // 'combat-overlay dungeon-overlay' (src/dungeon-ui.js).
  const cov = html.match(/\.combat-overlay\s*\{([^}]*)\}/);
  assert.ok(cov && /z-index:\s*20/.test(cov[1]),
    'гард: .combat-overlay z-index 20 (ниже контейнера 30; dungeon-'
    + 'overlay элемент несёт оба класса)');
  const noLift = (label) => {
    const z = btn.style.zIndex;
    assert.ok(z === undefined || z === '',
      label + ': frame-lift снят — inline zIndex не задаётся: '
      + JSON.stringify(z));
  };
  // Мир: лифта нет никогда.
  h.frameFn(NOW + 16);
  noLift('мир');
  // Подземелье: frame-lift (000256-слот для #hud/.fs-btn) кнопки больше
  // НЕ касается — контейнер #touch-controls (30) уже над оверлеем (20).
  g.actions.enterDungeon();
  h.frameFn(NOW + 32);
  noLift('подземелье');
  assert.notEqual(btn.style.display, 'none',
    'подземелье — кнопка видима (юнит buttons не скрыт, 000150)');
  press(h, 'KeyE');
  release(h, 'KeyE');
  assert.equal(g.dungeon, null, '[E] — выход из локации');
  // Бой: кнопка СКРЫТА единицей buttons (ui.js applyVisibility), а не
  // «под оверлеем»; тап (если бы дошёл) — no-op: blocked() внутри
  // toggle() (combatUI.isActive).
  const c0 = g.actions.startCombat();
  assert.ok(c0, 'startCombat — бой начат (отладочный)');
  assert.equal(G.combatUI.isActive(), true, 'боевой оверлей активен');
  h.frameFn(NOW + 64);
  assert.equal(btn.style.display, 'none',
    'бой: кнопка скрыта (display:none, одна единица buttons)');
  noLift('бой');
  clickButton(h);
  assert.equal(G.spellbookOC.isOpen(), false,
    'бой: тап = no-op (blocked: combatUI.isActive — isOpen остаётся '
    + 'false)');
  assert.ok(!h.body.querySelector('.spellbook-oc'),
    'бой: книга НЕ открылась');
});

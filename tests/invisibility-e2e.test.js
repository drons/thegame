// Задача 000235.03: Магия: невидимость — механика и взаимодействие с
// миром — e2e на ПОЛНОЙ цепочке <script> из index.html (vm-песочница).
// ТЗ: tasks/pending/000235.03.md. Контракт:
// memory/000235.03-invisibility-mechanic.md (§6 — IV-E1..E6).
//
// Механика (контракт): внебоевое состояние в днях
// (hero.outOfCombatEffects — паттерн 000235.02, каст через книгу KeyB +
// clickRow, mp — только через сейв saveHero); пока активно герой
// ПРОЗРАЧЕН для триггера зон групп: zoneCombatInfo → null ДО
// findZoneCombat (zone-бой НЕ стартует, HUD «— зона» гаснет — единая
// точка main.js). ТАЙЛ-БОЙ СОХРАНЯЕТСЯ (D6: «моб на одном тайле героя
// видит» — мир + подземелье). Снятие: (а) вступление в бой (хук на 3
// точках старта main.js), (в) истечение дней (день-хук .02 —
// expireOutOfCombatEffects в onDay). Установка/истечение — БЕЗ НОВОГО
// КОДА (generic-ядро .02 + DURATION_ACTIONS уже несёт 'невидимость').
//
// Мир-фолбэк (map.png в стабе ВСЕГДА onerror → G.generateSeedPixels,
// детерминированно), координаты (сверено tests/mob-zones-e2e.test.js):
//   * спавн (0,0);
//   * (1,0) — g2 «логово скелетов» — neutral 3×3, БЕЗ триггера (бой
//     ТОЛЬКО на тайле);
//   * (2,3) — g4 «паучье гнездо» — territorial 5×5 (x∈[0,4], y∈[1,5]),
//     триггер (бой при входе в зону);
//   * (0,1) — Чебышёв d=2 от (2,3) — В ЗОНЕ, не тайл группы;
//   * (1,1) — d=2 от (2,3) — в зоне; (0,0)/(1,0) — d=3 — вне зоны.
//
// Гость (Д-9): id 'invisibility' (будущий реальный id из контракта §7.3
// волны .09), школа 'тень', действие 'невидимость', вне_боя: true,
// параметры {days: 1}, мани 5 — live-инъекция в ЖИВОЙ каталог
// Game.SpellsData ПОСЛЕ boot (file-каталог и пин «ровно 17» не растут;
// main.js — снапшот G — держит те же объект-ссылки).
//
// HARNESS: дубль tests/mob-zones-e2e.test.js (bootSandbox/key/
// makeWalker/spyStartCombat/resolveCombatVictory — walker с
// МОНОТОННЫМ now += 200, guard 12 кадров; spy — main.js читает
// G.combatUI ДИНАМИЧЕСКИ) + helpers книги tests/spellbook-oc-e2e.test.js
// (injectGuests/learn/saveHero/clickRow/dismissStartWindow). DOM — с
// деревом (querySelector для строк книги, паттерн
// tests/dungeon-info-window.test.js). performance.now() заморожен на
// NOW = 1000.
//
// RED (4 из 7 — падают на master ОСМЫСЛЕННО, не синтаксис):
//   * IV-E2 — невидимый герой в зоне: на master первый шаг (0,0)→(0,1)
//     НАЧИНАЕТ zone-бой (существующий триггер 000135 — пропуска зона-
//     скана НЕТ) → ассерт «боя нет» падает;
//   * IV-E3/IV-E4 — там же (первый шаг в зону начинает бой); дальше —
//     хука снятия нет (запись жива после боя);
//   * IV-E7 (ревью) — тайл-бой подземелья: на master хука
//     startDungeonCombat нет — запись невидимости жива после боя.
// Зелёные с момента добавления (пины существующего поведения):
//   * IV-E1 — load-clean + каст через книгу (ядро .02 целиком);
//   * IV-E5 — истечение (день-хук .02) + зона триггерится (000135);
//   * IV-E6 — видимый герой в той же позиции — зона-бой (локальный
//     дубль Z5; самодостаточность файла).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const S = require('../src/save.js');

const ROOT = path.join(__dirname, '..');
// Цепочка — из index.html (не хардкод; регрессия порядка —
// tests/index-order.test.js).
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));

const NOW = 1000; // performance.now() в песочнице заморожен на NOW
// Соль seed боя (main.js: G.hash2(x, y, 0x5eedc0de)).
const SALT = 0x5eedc0de;

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

// --- «Снисходительный» DOM-элемент С ДЕРЕВОМ (dataset, closest,
// querySelector(All)) — дубль tests/dungeon-info-window.test.js; нужен
// для строк книги (data-spell-id + свой click-listener). ---

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
    // реально снимает.
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
    // Таймеры не гоняем (флаши UI): no-op.
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
    'ошибок загрузки нет (load-clean 000038): ' + h.errors.join('; '));
  // frame() main.js — единственный rAF-колбэк после старта; кадр пере
  // планирует себя (одна и та же функция) — frameFn валидна на любом
  // моменте.
  h.frameFn = h.raf[h.raf.length - 1];
  return h;
}

// --- Кадр/ввод (протоколы main-visuals / mob-zones-e2e) ---

function frameAt(h, now) {
  h.raf[h.raf.length - 1](now);
}

// ВАЖНО: массив слушателей снапшотится ПЕРЕД диспетчем (паттерн B9).
function key(h, code) {
  const e = { code, preventDefault() {}, stopPropagation() {} };
  for (const fn of (h.winListeners['keydown'] || []).slice()) fn(e);
  return e;
}

function keyup(h, code) {
  const e = { code };
  for (const fn of (h.winListeners['keyup'] || []).slice()) fn(e);
  return e;
}

// Ход: ОДИН шаг в соседний тайл (keydown → кадры по +200 мс, пока игрок
// фактически не перешёл (stepMs ≤ 420 мс) → keyup). now — МОНОТОННЫЙ
// (stepInterval: шаг только через stepMs от последнего); замыкание
// держит счётчик на тест. Возврат: now последнего кадра (монотонность
// для последующих frameAt).
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
      `сценарий: игрок не перешёл на (${tx},${ty}) за ${guard} кадров`);
    return now;
  };
}

// --- SEED-ПИН: spy-обёртка G.combatUI.startCombat (дубль
// tests/mob-zones-e2e.test.js) ---
//
// main.js читает G.combatUI ДИНАМИЧЕСКИ (G = тот же объект Game,
// 000038) → замена свойства подхватывается; оригинал — замыкание без
// this → цела. captured.opts — ЕДИНСТВЕННЫЙ путь пинить
// seed/tile/terrain (createCombat НЕ хранит opts.seed на объекте боя).

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

// Победа в бою (дубль resolveCombatVictory
// tests/mob-zones-e2e.test.js): Эфир 9999 (dealDamageToAlly) + мобы
// 9999 (dealDamageToMob) → checkVictory → Space (finish → onEnd:
// defeatedAt.set(ключ, день), saveNow).
function resolveCombatVictory(G, c, label) {
  const u = c.units.find((x) => x.kind === 'efir');
  assert.ok(u, label + ': Эфир в бою (main.js передаёт efir ВСЕГДА)');
  G.combatInternals.dealDamageToAlly(c, u, 9999);
  assert.equal(u.alive, false, label + ': Эфир пал (dealDamageToAlly)');
  for (const m of c.units.filter((x) => x.side === 'mob' && x.alive)) {
    G.combatInternals.dealDamageToMob(c, m, 9999);
  }
  assert.ok(c.result && c.result.outcome === 'victory',
    label + ': победа (checkVictory)');
  G.combatUI.handleCode('Space');
  assert.equal(G.combatUI.isActive(), false,
    label + ': панель закрыта (Space → finish)');
}

// --- Гость и helpers книги (дубль tests/spellbook-oc-e2e.test.js) ---

function invGuest(over = {}) {
  return Object.assign({
    id: 'invisibility',
    название: 'Невидимость',
    школа: 'тень',
    база: null,
    степень: 1,
    атрибут: 'intelligence',
    уровень: 2,
    мани: 5,
    действие: 'невидимость',
    вне_боя: true,
    параметры: { days: 1 },
    здания: ['assets/buildings/000001.json'],
    описание: 'Гостевое заклинание (000235.03)',
    icon: 'assets/spell-icons/ghost.svg',
    icon_prompt: 'Тестовая иконка (000235.03)',
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
// «Продолжить» (книга — в его блок-списке).
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

// Объекты из vm-сэндбокса — чужой realm; JSON-рондтрип (паттерн .02).
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

// Каст ЧЕРЕЗ КНИГУ (KeyB → clickRow): live-героя в __game.state НЕТ
// (зеркало — getter-копии, кроме live-массивов spells/
// outOfCombatEffects); debug-хук не вводим («не больше и не меньше»).
function castViaBook(h) {
  key(h, 'KeyB');
  assert.ok(h.body.querySelector('.spellbook-oc'),
    'книга открыта (KeyB)');
  clickRow(h, 'invisibility');
  assert.equal(h.sandbox.Game.spellbookOC.isOpen(), false,
    'ok → книга ЗАКРЫТА (каст выполнен)');
}

// --- Подземелье (IV-E7, паттерн tests/dungeon-loot-e2e.test.js:
// enterDungeon() → замена ds.contents (группа на клетке-соседе входа)
// → keydown-шаг → startDungeonCombat) ---

// Клетка на пути: первый FLOOR-сосед ВХОДА в порядке
// [[1,0],[-1,0],[0,1],[0,-1]], НЕ выход (000177). Подземелье связное
// (createDungeon) — у входа ВСЕГДА есть FLOOR-сосед.
function asideCell(G, d) {
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
// window-слушатели (dungeon-ui: гейты isActive() +
// !combatUI.isActive() → ctx.onMove → dungeonMove синхронно: 1
// клавиша = 1 клетка). Мир НЕ сдвигается: keydown main.js имеет
// гейт G.dungeonUI.isActive() → return.
function stepDungeon(h, tx, ty) {
  const g = h.sandbox.__game;
  const d = g.dungeon;
  assert.ok(d, 'подземелье активно (__game.dungeon)');
  const dx = tx - d.x, dy = ty - d.y;
  assert.ok(Math.abs(dx) + Math.abs(dy) === 1,
    'шаг на соседнюю клетку (манхэттен = 1)');
  const code = dx === 1 ? 'ArrowRight' : dx === -1 ? 'ArrowLeft'
    : dy === 1 ? 'ArrowDown' : 'ArrowUp';
  key(h, code);
}

// Фолбэк-мир: сценарные группы у спавна (дубль сценарных asserts
// tests/mob-zones-e2e.test.js). Возврат: map для terrain-пинов.
function assertFallbackWorld(G) {
  const myMap = G.createMap(G.generateSeedPixels());
  assert.ok(myMap.tileAt(0, 0).passable, 'сценарий: спавн (0,0)');
  assert.equal(myMap.tileAt(2, 3).mobGroup, 4,
    'сценарий: паучье гнездо (2,3) — territorial 5×5 (триггер)');
  assert.equal(myMap.tileAt(1, 0).mobGroup, 2,
    'сценарий: логово скелетов (1,0) — neutral 3×3 (тайл-бой)');
  assert.ok(myMap.tileAt(0, 1).passable
    && !myMap.tileAt(0, 1).hasMobGroup,
    'сценарий: (0,1) — в зоне (d=2), не тайл группы');
  assert.ok(myMap.tileAt(1, 1).passable
    && !myMap.tileAt(1, 1).hasMobGroup,
    'сценарий: (1,1) — в зоне (d=2), не тайл группы');
  return myMap;
}

function assertSpawn(g) {
  // Спавн (0,0): численное равенство (=== 0) — findSpawn может дать
  // -0; strictEqual(-0, 0) — false.
  assert.ok(g.state.player.x === 0, 'сценарий: спавн (0,0) — x');
  assert.ok(g.state.player.y === 0, 'сценарий: спавн (0,0) — y');
}

// --- IV-E1: load-clean + каст ЧЕРЕЗ КНИГУ (ядро .02) ---

test('000235.03 IV-E1. e2e: load-clean (0 console.error) + каст ЧЕРЕЗ КНИГУ (KeyB → clickRow «invisibility») — запись {spellId, expiresDay: day+1} в state-зеркале, mp −5 (saveHero), книга закрыта', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.equal(h.errors.length, 0,
    'load-clean: 0 console.error при загрузке цепочки: '
    + h.errors.join('; '));
  assertSpawn(g);
  assert.equal(g.state.day, 1, 'фикстура: день 1');
  dismissStartWindow(h);
  injectGuests(h, [invGuest()]); // id «invisibility», days 1, мани 5
  learn(h, ['invisibility']);
  const mp0 = saveHero(h).mp;
  assert.equal(mp0, 16, 'фикстура: новый герой mp = maxMP 16');
  castViaBook(h);
  assert.deepEqual(host(g.state.hero.outOfCombatEffects),
    [{ spellId: 'invisibility', expiresDay: 2 }],
    'запись {spellId, expiresDay: day+days} в state-зеркале (день 1 + days 1)');
  assert.equal(saveHero(h).mp, mp0 - 5, 'mp ровно «мани» (16 − 5)');
  assert.equal(h.errors.length, 0,
    'чистый путь (каст через книгу) — без console.error: '
    + h.errors.join('; '));
});

// --- IV-E2: ЯДРО — невидимый герой НЕ триггерит зону (5×5, d=2) ---

test('000235.03 IV-E2. e2e: НЕВИДИМЫЙ герой входит в 5×5-зону паучьего (2,3): (0,0)→(0,1), Чебышёв d=2 — боя НЕТ (isActive false, startCombat 0 вызовов), герой на (0,1); следующие кадры — без боя', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assertFallbackWorld(G);
  assertSpawn(g);
  dismissStartWindow(h);
  injectGuests(h, [invGuest()]);
  learn(h, ['invisibility']);
  castViaBook(h);
  assert.deepEqual(host(g.state.hero.outOfCombatEffects),
    [{ spellId: 'invisibility', expiresDay: 2 }],
    'фикстура: невидимость активна (день 1)');
  const cap = spyStartCombat(G);
  assert.equal(G.combatUI.isActive(), false, 'фикстура: спавн без боя');
  const walk = makeWalker(h);
  const now = walk(0, 1); // ВХОД В ЗОНУ (d=2 от (2,3))
  assert.equal(G.combatUI.isActive(), false,
    'RED: невидимый герой в зоне — боя НЕТ (зона-скан пропускает зону; '
    + 'master: бой на шаге входа — 000135)');
  assert.ok(g.state.player.x === 0, 'игрок в зоне (0,1) — x (не тайл)');
  assert.equal(g.state.player.y, 1, 'игрок в зоне (0,1) — y');
  assert.equal(cap.calls, 0,
    'RED: startCombat 0 вызовов — бой не начался НИКАК (и тайл-боя нет)');
  frameAt(h, now + 200);
  frameAt(h, now + 400);
  assert.equal(G.combatUI.isActive(), false,
    'следующие кадры — боя нет');
  assert.equal(cap.calls, 0, 'следующие кадры — бой не начался');
});

// --- IV-E3: ТАЙЛ-БОЙ сохранён при невидимости (D6) + снятие
// вступлением в бой (хук maybeStartCombat) + defeatedAt ---

test('000235.03 IV-E3. e2e: тайл-бой НЕ подавляется при невидимости (D6): (0,1)→(0,0)→(1,0) — бой на тайле neutral g2; вступление в бой — состояние СНЯТО (outOfCombatEffects пусто); победа → defeatedAt («1,0»): повторный вход без боя', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assertFallbackWorld(G);
  assertSpawn(g);
  dismissStartWindow(h);
  injectGuests(h, [invGuest()]);
  learn(h, ['invisibility']);
  castViaBook(h);
  const cap = spyStartCombat(G);
  const walk = makeWalker(h);
  walk(0, 1); // зона (d=2) — подавлена невидимостью
  assert.equal(G.combatUI.isActive(), false,
    'зона-шаг (0,1) — без боя (невидимость)');
  walk(0, 0); // на спавн: (0,0) — Чебышёв d=1 от (1,0) — В нейтральной
  // зоне g2 (radius 1, БЕЗ триггера): zone-боя нет И у видимого, и у
  // невидимого героя — поведение без изменений (ТЗ-пункт neutral/timid)
  assert.equal(G.combatUI.isActive(), false,
    'нейтральная зона (d=1, без триггера) при невидимости — без боя: '
    + 'поведение без изменений (как для видимого)');
  assert.equal(cap.calls, 0,
    'нейтральная зона — бой не начался НИКАК (то же, что для видимого)');
  walk(1, 0); // шаг НА ТАЙЛ neutral-группы
  assert.equal(G.combatUI.isActive(), true,
    'ТАЙЛ-БОЙ сохранён: моб на одном тайле героя видит (D6) — '
    + 'гард против наивного «пропустить все группы»');
  const c = G.combatUI.current();
  assert.equal(c.groupType, 2, 'бой — логово скелетов (тайл группы)');
  assert.deepEqual(host(g.state.hero.outOfCombatEffects), [],
    'RED: вступление в бой — невидимость СНЯТА (хук старта боя; '
    + 'master: хука нет — запись жива)');
  resolveCombatVictory(G, c, 'тайл-бой');
  walk(0, 0);
  walk(1, 0); // повторный вход на поверженный тайл
  assert.equal(G.combatUI.isActive(), false,
    'defeatedAt (тайл «1,0») — повторный вход без боя (общий guard)');
  assert.equal(cap.calls, 1, 'боев за сценарий РОВНО 1 (тайл)');
});

// --- IV-E4: после снятия зона ТРИГГЕРИТСЯ (zone-бой, seed от тайла
// группы) ---

test('000235.03 IV-E4. e2e: ПОСЛЕ снятия (тайл-боем) зона триггерится: (1,0)→(1,1), d=2 от паучьего — zone-бой (groupType 4, seed hash2(2,3,salt), tile/terrain — тайл ГРУППЫ)', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = assertFallbackWorld(G);
  assertSpawn(g);
  dismissStartWindow(h);
  injectGuests(h, [invGuest()]);
  learn(h, ['invisibility']);
  castViaBook(h);
  const cap = spyStartCombat(G);
  const walk = makeWalker(h);
  walk(0, 1); // зона — подавлена
  assert.equal(G.combatUI.isActive(), false,
    'зона-шаг (0,1) — без боя (невидимость)');
  walk(0, 0);
  walk(1, 0); // тайл-бой — снятие невидимости
  assert.equal(G.combatUI.isActive(), true, 'тайл-бой (1,0) — начался');
  assert.equal(G.combatUI.current().groupType, 2, 'тайл-бой — логово');
  resolveCombatVictory(G, G.combatUI.current(), 'тайл-бой');
  walk(1, 1); // (1,1) — d=2 от (2,3): зона ПОСЛЕ снятия
  assert.equal(G.combatUI.isActive(), true,
    'RED: после снятия невидимости зона ТРИГГЕРИТСЯ (zone-бой)');
  const c = G.combatUI.current();
  assert.equal(c.groupType, 4, 'zone-бой — паучье гнездо');
  assert.ok(cap.opts, 'opts захвачены (spy startCombat)');
  assert.equal(cap.opts.seed, G.hash2(2, 3, SALT),
    'seed zone-боя — от тайла ГРУППЫ: hash2(2,3,salt)');
  assert.equal(cap.opts.tile.x, 2, 'opts.tile — тайл группы (x)');
  assert.equal(cap.opts.tile.y, 3, 'opts.tile — тайл группы (y)');
  assert.equal(cap.opts.terrain, myMap.tileAt(2, 3).terrain,
    'opts.terrain — terrain тайла ГРУППЫ');
  assert.equal(cap.calls, 2, 'боев за сценарий РОВНО 2 (тайл, зона)');
  resolveCombatVictory(G, c, 'zone-бой');
});

// --- IV-E5: снятие ИСТЕЧЕНИЕМ дней (день-хук .02) + зона
// триггерится после ---

test('000235.03 IV-E5. e2e: снятие ИСТЕЧЕНИЕМ (день-хук): каст days 1 в день 1 → setDay(2) (rest → onDay → expireOutOfCombatEffects) — запись вылетела (state пусто) → (0,0)→(0,1) — зона ТРИГГЕРИТСЯ (zone-бой, seed от тайла группы)', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assertFallbackWorld(G);
  assertSpawn(g);
  assert.equal(g.state.day, 1, 'фикстура: день 1');
  dismissStartWindow(h);
  injectGuests(h, [invGuest()]);
  learn(h, ['invisibility']);
  castViaBook(h);
  assert.deepEqual(host(g.state.hero.outOfCombatEffects),
    [{ spellId: 'invisibility', expiresDay: 2 }],
    'каст день 1, days 1 → expiresDay 2 (активна в день 1)');
  g.actions.setDay(2); // rest() → onDay → expireOutOfCombatEffects
  assert.equal(g.state.day, 2, 'день прошёл (setDay)');
  assert.deepEqual(host(g.state.hero.outOfCombatEffects), [],
    'истечение (день-хук .02): в D+1 запись вылетела (expiresDay <= day)');
  const cap = spyStartCombat(G);
  const walk = makeWalker(h);
  walk(0, 1); // герой теперь ВИДИМ — зона триггерится
  assert.equal(G.combatUI.isActive(), true,
    'после истечения герой видим — зона ТРИГГЕРИТСЯ (zone-бой)');
  const c = G.combatUI.current();
  assert.equal(c.groupType, 4, 'zone-бой — паучье гнездо');
  assert.equal(cap.opts.seed, G.hash2(2, 3, SALT),
    'seed — от тайла ГРУППЫ: hash2(2,3,salt)');
  assert.equal(cap.calls, 1, 'бой начался РОВНО 1× за шаг');
  resolveCombatVictory(G, c, 'zone-бой (истечение)');
});

// --- IV-E6: КОНТРОЛЬ — видимый герой (без каста) в той же позиции:
// зона-бой (существующее поведение 000135; локальный дубль Z5 —
// самодостаточность файла) ---

test('000235.03 IV-E6. e2e: КОНТРОЛЬ (существующее поведение): видимый герой БЕЗ каста в той же позиции — (0,0)→(0,1) — ЗОНА-БОЙ (groupType 4, seed hash2(2,3,salt), тайл группы) (локальный дубль Z5)', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = assertFallbackWorld(G);
  assertSpawn(g);
  dismissStartWindow(h);
  assert.deepEqual(host(g.state.hero.outOfCombatEffects), [],
    'фикстура: каста нет — эффектов нет');
  const cap = spyStartCombat(G);
  assert.equal(G.combatUI.isActive(), false, 'фикстура: спавн без боя');
  const walk = makeWalker(h);
  walk(0, 1); // (0,0)→(0,1): ВХОД В ЗОНУ (d=2)
  assert.equal(G.combatUI.isActive(), true,
    'видимый герой в той же позиции — бой (существующее поведение, '
    + 'без изменений)');
  const c = G.combatUI.current();
  assert.equal(c.groupType, 4, 'бой — паучье гнездо (тип тайла группы)');
  assert.ok(cap.opts, 'opts захвачены (spy startCombat)');
  assert.equal(cap.calls, 1, 'бой начался РОВНО 1× за шаг');
  assert.equal(cap.opts.seed, G.hash2(2, 3, SALT),
    'seed zone-боя — от тайла ГРУППЫ: hash2(2,3,salt)');
  assert.equal(cap.opts.tile.x, 2, 'opts.tile — тайл группы (x)');
  assert.equal(cap.opts.tile.y, 3, 'opts.tile — тайл группы (y)');
  assert.equal(cap.opts.terrain, myMap.tileAt(2, 3).terrain,
    'opts.terrain — terrain тайла ГРУППЫ');
  resolveCombatVictory(G, c, 'zone-бой (контроль)');
});

// --- IV-E7 (ревью): подземелье — тайл-бой СОХРАНЁН (D6) + снятие
// вступлением в бой (хук ТРЕТЬЕЙ точки — startDungeonCombat) ---
// ТЗ «Тесты»: «снятие: вступление в бой (тайл-бой в подземелье) —
// состояние снято». IV-E3 покрывает мир-тайл-бой (maybeStartCombat);
// этот пин — startDungeonCombat (main.js): без него (ребейз/мерж)
// третий вызов clearInvisibilityOnCombatStart мог бы пропасть на
// зелёном наборе. Группа — ФИКСУРА на клетке-соседе входа (паттерн
// 000186-A1: замена ds.contents — детерминированно, без wanderStep).

test('000235.03 IV-E7. e2e: ПОДЗЕМЕЛЬЕ — тайл-бой сохранён при невидимости (D6): каст (days 1, день 1) → enterDungeon → группа на клетке-соседе входа → шаг НА КЛЕТКУ МОБА — бой СОХРАНЁН (isActive true); вступление в бой — состояние СНЯТО (outOfCombatEffects пусто — хук startDungeonCombat); победа — группа повержена', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assertSpawn(g);
  assert.equal(g.state.day, 1, 'фикстура: день 1');
  dismissStartWindow(h);
  injectGuests(h, [invGuest()]);
  learn(h, ['invisibility']);
  castViaBook(h);
  assert.deepEqual(host(g.state.hero.outOfCombatEffects),
    [{ spellId: 'invisibility', expiresDay: 2 }],
    'фикстура: невидимость активна (день 1)');
  const cap = spyStartCombat(G);
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon — состояние подземелья (отладочный вход)');
  assert.ok(g.dungeon, 'подземелье активно (__game.dungeon)');
  const cell = asideCell(G, ds.dg);
  assert.ok(cell, 'FLOOR-клетка-сосед входа найдена (подземелье связное)');
  ds.contents = {
    mobs: [{ id: 'g0', mobIds: ['skeleton'], x: cell.x, y: cell.y, level: 1, defeated: false }],
    chests: [],
    seed: 1, step: 0,
  };
  stepDungeon(h, cell.x, cell.y); // шаг НА клетку группы → тайл-бой
  assert.equal(G.combatUI.isActive(), true,
    'ТАЙЛ-БОЙ ПОДЗЕМЕЛЬЯ сохранён: моб на одном тайле героя видит (D6)');
  assert.deepEqual(host(g.state.hero.outOfCombatEffects), [],
    'RED: вступление в бой В ПОДЗЕМЕЛЬЕ — невидимость СНЯТА (хук '
    + 'startDungeonCombat; master: хука нет — запись жива)');
  const c = G.combatUI.current();
  assert.ok(c, 'объект боя доступен');
  for (const m of c.units.filter((x) => x.side === 'mob' && x.alive)) {
    G.combatInternals.dealDamageToMob(c, m, 9999);
  }
  assert.ok(c.result && c.result.outcome === 'victory',
    'победа (checkVictory: все мобы мертвы)');
  G.combatUI.handleCode('Space');
  assert.equal(G.combatUI.isActive(), false,
    'панель закрыта (Space → finish → onEnd)');
  assert.equal(cap.calls, 1, 'боев за сценарий РОВНО 1 (подземельный тайл)');
});

// =====================================================================
// 000422 — «Акробатика» получает горного потребителя acroBonus (a)
//
// Контракт: memory/000422-designer-decision.md (вердикт (a)) +
// memory/000422-acro-fork.md (решения реализации). ТЗ:
// tasks/pending/000422.md п.1.
//
// Механика (детерминизм без rng-стрима, шаблон frost_walk):
//   * heroPassable(t, day): MOUNTAIN проходимhero'ю для СТОЯНИЯ
//     ровно когда acroBonus > 0 — БЕЗ кубика. Читатели «текущей
//     позиции» (позиция-сейв, onDay relocate) никогда не выталкивают
//     героя с занятой горы (переносимость W-10c, память 000235.08
//     §11: гейт текущей клетки без пути отхода = софтлок).
//   * tryMove: кубик ВХОДА (только не-гора → гора):
//     q = ((G.hash2(tx, ty, ACRO_MOUNTAIN_SEED)
//          ^ ((day + 1) · 0x9E3779B9)) >>> 0) / 4294967296,
//     вход ⟺ q < clamp(acroBonus, 0, 1); гора → гора (хребет) —
//     без кубика (иначе карман на хребте: без шага день не тикает).
//     Сид (клетка, день) — паттерн CAMP_STOCK_SEED (items.js).
//   * worldStepCost: MOUNTAIN — 2 хода явной веткой ДО thick-проверки
//     (у гор thick:false — без ветки горы были бы бесплатный срез);
//     path_of_vines горы НЕ удешевляет (контракт thick = только FOREST).
//   * Фолбэк без acro (acroBonus 0) — бит-в-бит поведение до задачи.
//
// Фикстура — горные пары (стоячая проходимая клетка N ↔ гора M)
// находятся НА РАНТАЙМЕ BFS от спавна (ls-доктрина: никаких
// хардкодных координат/количеств; мир детерминирован, но рельеф —
// не константа этого файла).
//
// Харнес-хелперы — дубли tests/path-of-vines-e2e.test.js
// (bootSandbox/boot/makeStepper/installRngCounters/dismissStartWindow/
// learn/clickRow). Краснота RED-стадии: T5,T6,T7,T9,T10,T11,T12,T13,
// T15 — потребитель входа ещё не в коде (гарды T4,T8,T14 зелёные с
// момента добавления).
// =====================================================================

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const S = require('../src/save.js');
const P = require('../src/player.js');
const SH = require('../src/sheet.js');

const ROOT = path.join(__dirname, '..');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));
const NOW = 1000; // performance.now() в песочнице заморожен на NOW

const PRIMARY = {
  strength: 1, dexterity: 1, constitution: 10,
  intelligence: 10, wisdom: 10, charisma: 1,
};

const MAIN_SRC = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');

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

// --- «Снисходительный» DOM-элемент (дубль path-of-vines-e2e) ---
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
      return () => undefined;
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
  h.frameFn = h.raf[h.raf.length - 1];
  return h;
}

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

function keydownFor(dx, dy) {
  return dx === 1 ? 'ArrowRight' : dx === -1 ? 'ArrowLeft'
    : dy === 1 ? 'ArrowDown' : 'ArrowUp';
}

function dismissStartWindow(h) {
  const g = h.sandbox.__game;
  const sw = g.startWindow;
  assert.ok(sw && typeof sw.hide === 'function',
    'фикстура: __game.startWindow (000138)');
  sw.hide();
  assert.equal(sw.isActive(), false,
    'стартовое окно скрыто (клик «Продолжить»)');
}

function learn(h, ids) {
  const spells = h.sandbox.__game.state.hero.spells;
  assert.ok(Array.isArray(spells), 'сценарий: live hero.spells (массив)');
  for (const id of ids) spells.push(id);
}

function clickRow(h, id) {
  const row = h.body.querySelector('[data-spell-id="' + id + '"]');
  assert.ok(row, 'строка ' + id + ' в книге');
  const l = row.listeners && row.listeners.click;
  assert.ok(l && l.length > 0,
    'строка ' + id + ' — свой click-listener (makeEl)');
  l[l.length - 1]();
}

function seedSave(data) {
  return { version: 1, savedAt: new Date(0).toISOString(), data };
}

function mkHero(over = {}) {
  return Object.assign(P.createCharacter(), over);
}

function heroAcro(level) {
  return mkHero({ primary: PRIMARY, secondary: { acro: level } });
}

// Один монотонный now на сценарий: walk (шаг ОБЯЗАН состояться) и
// tryStep (шаг МОЖЕТ заблокироваться — без ассерта перехода).
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
  return { tryStep };
}

// Каст path_of_vines из книги (день 1 → запись expiresDay 2).
function castVines(h) {
  const g = h.sandbox.__game;
  h.frameFn(NOW + 16);
  key(h, 'KeyB');
  assert.ok(h.body.querySelector('.spellbook-oc'), 'книга открыта');
  clickRow(h, 'path_of_vines');
  assert.deepEqual(
    JSON.parse(JSON.stringify(g.state.hero.outOfCombatEffects)),
    [{ spellId: 'path_of_vines', expiresDay: 2 }],
    'запись {path_of_vines, expiresDay: 2} (день 1 + days 1)');
}

// 000235.12.02 (D3) счётчики RNG на сегменте ходьбы — копия харнеса
// path-of-vines-e2e (Math.random контекста, generateSeedPixels,
// воронка combatUI.startCombat). Установка ПОСЛЕ boot/fixture.
function installRngCounters(h) {
  const n = { math: 0, seed: 0, combat: 0 };
  const G = h.sandbox.Game;
  const realMath = vm.runInContext('Math', h.sandbox);
  h.sandbox.Math = new Proxy(realMath, {
    get(t, k) {
      if (k === 'random') {
        return () => { n.math += 1; return 0.99; };
      }
      return t[k];
    },
  });
  const seed0 = G.generateSeedPixels;
  G.generateSeedPixels = (...a) => {
    n.seed += 1;
    return seed0.apply(G, a);
  };
  const start0 = G.combatUI.startCombat;
  G.combatUI.startCombat = (...a) => {
    n.combat += 1;
    return start0.apply(G.combatUI, a);
  };
  return n;
}

// --- Формула кубика входа (пинкулятивно совпадает с main.js) --------
// Сид константы — из src/main.js (grep-модель, источник правды — код).
function enterSeedConst() {
  const m = MAIN_SRC.match(
    /const\s+ACRO_MOUNTAIN_SEED\s*=\s*(0x[0-9a-fA-F]+|\d+)\s*;/);
  return m ? Number(m[1]) : null;
}

function qAt(G, seed, x, y, day) {
  return ((G.hash2(x, y, seed) ^ ((day + 1) * 0x9E3779B9)) >>> 0)
    / 4294967296;
}

function expectedEnter(G, seed, chance, x, y, day) {
  if (!(chance > 0)) return false;
  if (chance >= 1) return true;
  return qAt(G, seed, x, y, day) < chance;
}

// --- Рантайм-фикстура: горные пары (N — стоять, M — вход) ----------
// BFS от спавна по чистым проходимым тайлам; пара: N (passable, без
// группы/постройки, стоимость-1 (не thick)) ↔ соседняя 4-горы M;
// вокруг M в Чебышёве-2 нет групп мобов (иначе шаг-в-гору тянет бой).
let FIX = null;
async function fixture() {
  if (FIX) return FIX;
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const T = G.TERRAIN;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const pairs = [];
  const seenM = new Set();
  const visited = new Set([g.state.player.x + ',' + g.state.player.y]);
  let frontier = [{ x: g.state.player.x, y: g.state.player.y }];
  outer:
  for (let depth = 0; depth < 700 && frontier.length; depth++) {
    const next = [];
    for (const cur of frontier) {
      for (const [dx, dy] of DIRS) {
        const nx = cur.x + dx, ny = cur.y + dy;
        const k = nx + ',' + ny;
        if (visited.has(k)) continue;
        const t = myMap.tileAt(nx, ny);
        if (!t.passable || t.hasMobGroup || t.hasBuilding) continue;
        const td = G.TERRAIN_DATA[t.terrain];
        if (td && td.thick) continue; // N — стоимость 1 (чёткая дельта)
        visited.add(k);
        for (const [mx, my] of DIRS) {
          const mt = myMap.tileAt(nx + mx, ny + my);
          if (mt.terrain !== T.MOUNTAIN) continue;
          const mk = (nx + mx) + ',' + (ny + my);
          if (seenM.has(mk)) continue;
          let safe = true;
          for (let ay = -2; ay <= 2 && safe; ay++) {
            for (let ax = -2; ax <= 2; ax++) {
              if (myMap.tileAt(nx + mx + ax, ny + my + ay).hasMobGroup) {
                safe = false;
                break;
              }
            }
          }
          if (!safe) continue;
          seenM.add(mk);
          pairs.push({
            n: { x: nx, y: ny },
            m: { x: nx + mx, y: ny + my },
          });
          if (pairs.length >= 200) break outer;
        }
        next.push({ x: nx, y: ny });
      }
    }
    frontier = next;
  }
  FIX = { pairs, G: h.sandbox.Game, myMap };
  return FIX;
}

// Хребтовый сосед M2 горы M (4-соседний MOUNTAIN).
function ridgeOf(F, m) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const T = F.G.TERRAIN;
  for (const [dx, dy] of DIRS) {
    if (F.myMap.tileAt(m.x + dx, m.y + dy).terrain === T.MOUNTAIN) {
      return { x: m.x + dx, y: m.y + dy };
    }
  }
  return null;
}

async function bootAt(F, pos, hero) {
  const h = await boot(seedSave({
    day: 1, position: { x: pos.x, y: pos.y },
    hero: hero ? heroAcro(hero) : undefined,
  }));
  dismissStartWindow(h);
  const g = h.sandbox.__game;
  assert.equal(g.state.day, 1, 'фикстура: день 1');
  assert.equal(g.state.stepsToday, 0, 'фикстура: 0 шагов в дне');
  if (hero == null) {
    assert.ok(g.state.player.x === pos.x && g.state.player.y === pos.y,
      'фикстура: позиция-сейв принята (без acro — только проходимая)');
  }
  return { h, g };
}

// =====================================================================
// T4 (guard, зелёная ДО правки): acro 0 — вход в гору закрыт бит-в-бит
// (ни движения, ни списания хода; деградация frost_walk-поведения
// запрещена вердиктом).
// =====================================================================
test('000422 T4 (guard): acro 0 — вход на гору закрыт, шаг не тикает (бит-в-бит к поведению до 000422)', async () => {
  const F = await fixture();
  assert.ok(F.pairs.length > 0,
    'фикстура: найдена проходимая клетка рядом с горой (BFS рантайм)');
  const { n, m } = F.pairs[0];
  const { h, g } = await bootAt(F, n, null);
  const step = makeStepper(h);
  const r = step.tryStep(m.x, m.y);
  assert.equal(r.moved, false,
    'acro 0: ход на горный тайл невозможен (heroPassable(MOUNTAIN) '
    + 'должна быть false при acroBonus 0)');
  assert.equal(g.state.stepsToday, 0, 'acro 0: blocked-шаг не тикает');
  assert.equal(g.state.day, 1, 'acro 0: день не смещён');
});

// =====================================================================
// T5 (RED): acro 20 → acroBonus 1 (клэмп) — вход на ту же гору, что
// закрыта при acro 0, ОБЯЗАН состояться. Карточная проверка «с acro
// 100 проходимость гор растёт» на реальном step-механизме.
// =====================================================================
test('000422 T5: acro 20 (acroBonus 1, клэмп) — шаг на гору состоится (tryMove + heroPassable)', async () => {
  const F = await fixture();
  const { n, m } = F.pairs[0];
  const { h, g } = await bootAt(F, n, 20);
  const step = makeStepper(h);
  const r = step.tryStep(m.x, m.y);
  assert.ok(r.moved,
    'RED: acroBonus 1 обязан давать вход на MOUNTAIN (вердикт (a)) — '
    + 'hero на (' + n.x + ',' + n.y + '), цель-гора (' + m.x + ',' + m.y + ')');
  assert.equal(F.myMap.tileAt(m.x, m.y).terrain, F.G.TERRAIN.MOUNTAIN,
    'цель — действительно горы');
});

// =====================================================================
// T6 (RED): формула входа пин-в-пин по всей выборке гор: для каждой
// горной клетки M из фикстуры __game.acroMountainEnterOk(x, y) при
// acro 1 (шанс из каталога) обязана равняться q < chance с
// q = ((hash2(x,y,ACRO_MOUNTAIN_SEED) ^ ((day+1)·0x9E3779B9))>>>0)/2^32.
// Выборка обязана содержать и входные, и отказные клетки (анти-вакуум
// формулы: реализация «всегда пускает»/«никогда» краснеет).
// =====================================================================
test('000422 T6: формула кубика входа (клетка, день) G.hash2 — пин по всей рантайм-выборке гор при acro 1', async () => {
  const F = await fixture();
  const seed = enterSeedConst();
  assert.ok(seed !== null,
    'RED: кубик входа детерминирован сидом ACRO_MOUNTAIN_SEED в '
    + 'src/main.js — константа не найдена (паттерн CAMP_STOCK_SEED)');
  const chance = SH.derived(heroAcro(1)).acroBonus;
  assert.ok(chance > 0 && chance < 1,
    'фикстура: acro 1 даёт строго промежуточный шанс (факт: ' + chance + ')');
  const { h, g } = await bootAt(F, F.pairs[0].n, 1);
  assert.equal(typeof g.acroMountainEnterOk, 'function',
    'RED: __game.acroMountainEnterOk(x, y) — отладочная поверхность '
    + 'предиката входа (000422) отсутствует');
  let enter = 0;
  let block = 0;
  for (const p of F.pairs) {
    const exp = expectedEnter(F.G, seed, chance, p.m.x, p.m.y, 1);
    const got = g.acroMountainEnterOk(p.m.x, p.m.y);
    assert.equal(got, exp,
      'клетка (' + p.m.x + ',' + p.m.y + '): q=' +
      qAt(F.G, seed, p.m.x, p.m.y, 1).toFixed(4) +
      ', шанс ' + chance + ' — предикат входа ≠ формуле');
    if (exp) enter++; else block++;
  }
  assert.ok(enter > 0 && block > 0,
    'выборка из ' + F.pairs.length + ' горных клеток не различает '
    + 'исходы формулы (enter=' + enter + ', block=' + block +
    ') — расширить фикстуру, пока анти-вакуум формулы не покрыт');
});

// =====================================================================
// T7 (RED): формула на реальном шаге — клетка с q < chance при acro 1
// реально проходится frame loop'ом.
// =====================================================================
test('000422 T7: acro 1 — клетка с q < chance реально проходится шагом', async () => {
  const F = await fixture();
  const seed = enterSeedConst();
  assert.ok(seed !== null, 'RED: ACRO_MOUNTAIN_SEED в src/main.js');
  const chance = SH.derived(heroAcro(1)).acroBonus;
  const hit = F.pairs.find(
    (p) => expectedEnter(F.G, seed, chance, p.m.x, p.m.y, 1));
  assert.ok(hit, 'фикстура: в выборке есть входная клетка (проверить T6)');
  const { h, g } = await bootAt(F, hit.n, 1);
  const step = makeStepper(h);
  const r = step.tryStep(hit.m.x, hit.m.y);
  assert.ok(r.moved,
    'RED: q < chance при acro 1 — шаг на гору (' + hit.m.x + ',' +
    hit.m.y + ') обязан состояться');
});

// =====================================================================
// T8 (guard, зелёная ДО правки): клетка с q ≥ chance при acro 1 —
// шаг блокируется; blocked-шаг не тикает ход.
// =====================================================================
test('000422 T8 (guard): acro 1 — клетка с q ≥ chance блокируется, ход не списан', async () => {
  const F = await fixture();
  const seed = enterSeedConst();
  const chance = seed === null ? 0 : SH.derived(heroAcro(1)).acroBonus;
  const miss = F.pairs.find(
    (p) => !expectedEnter(F.G, seed ?? 0, chance, p.m.x, p.m.y, 1));
  assert.ok(miss, 'фикстура: в выборке есть отказная клетка');
  const { h, g } = await bootAt(F, miss.n, 1);
  const step = makeStepper(h);
  const r = step.tryStep(miss.m.x, miss.m.y);
  assert.equal(r.moved, false,
    'q ≥ chance: вход на гору (' + miss.m.x + ',' + miss.m.y +
    ') обязан блокироваться кубиком');
  assert.equal(g.state.stepsToday, 0, 'blocked-шаг не тикает ход');
});

// =====================================================================
// T9 (RED): стоимость шага по горам — 2 хода явной веткой ДО thick
// (у гор thick:false; без ветки — бесплатный срез маршрутов): вход +
// шаг вдоль хребта + возврат на гору + спуск = 2 + 2 + 2 + 1.
// =====================================================================
test('000422 T9: мировой шаг по горам стоит 2 хода (вход, хребет), спуск — 1; day не смещён', async () => {
  const F = await fixture();
  const { n, m } = F.pairs[0];
  const ridge = ridgeOf(F, m);
  assert.ok(ridge, 'фикстура: у горы (' + m.x + ',' + m.y + ') есть хребтовый сосед');
  const { h, g } = await bootAt(F, n, 20);
  const step = makeStepper(h);
  assert.ok(step.tryStep(m.x, m.y).moved, 'вход на гору');
  assert.equal(g.state.stepsToday, 2,
    'RED: шаг на MOUNTAIN — 2 хода (thick:false без ветки заряжает 1 '
    + '— горы стали бы бесплатным срезом)');
  assert.ok(step.tryStep(ridge.x, ridge.y).moved, 'шаг вдоль хребта');
  assert.equal(g.state.stepsToday, 4, 'хребет — тоже 2 хода');
  assert.ok(step.tryStep(m.x, m.y).moved, 'возврат на M (хребет → хребет)');
  assert.equal(g.state.stepsToday, 6, 'возврат на M — снова 2 хода');
  assert.ok(step.tryStep(n.x, n.y).moved, 'спуск на N');
  assert.equal(g.state.stepsToday, 7, 'спуск на стоимость-1 тайл — 1 ход');
  assert.equal(g.state.day, 1, 'день не смещён (7 < 40)');
});

// =====================================================================
// T10 (RED): ГЕЙТ ТОЛЬКО НА ВХОД — сейв позиции на горе ПРИНИМАЕТСЯ
// (acro > 0, без кубика) и смена дня НЕ выталкивает героя с занятой
// горы (переносимость W-10c: без выхода — софтлок).
// =====================================================================
test('000422 T10: позиция-сейв на горе принята (acro>0) и смена дня не выталкивает (гейт только вход)', async () => {
  const F = await fixture();
  const { m } = F.pairs[0];
  const h = await boot(seedSave({
    day: 1, position: { x: m.x, y: m.y }, hero: heroAcro(20),
  }));
  const g = h.sandbox.__game;
  assert.equal(g.state.player.x, m.x,
    'RED: сейв позиции на горе обязан приниматься при acroBonus > 0 '
    + '(кубик входа — НЕ в heroPassable: иначе ~95% сейвов «остаюсь '
    + 'на спавне»); герой на (' + g.state.player.x + ',' +
    g.state.player.y + '), ждём (' + m.x + ',' + m.y + ')');
  assert.equal(g.state.player.y, m.y, 'сейв позиции на горе — y');
  dismissStartWindow(h);
  g.actions.setDay(2);
  assert.equal(g.state.day, 2, 'день 2 (setDay)');
  assert.equal(g.state.player.x, m.x,
    'смена дня НЕ выталкивает с горы (onDay-релокат кубик не бросает)');
  assert.equal(g.state.player.y, m.y, 'смена дня НЕ выталкивает — y');
  assert.equal(g.state.stepsToday, 0, 'rest обнулил счётчик шагов');
  // Кубик НЕ в heroPassable: при acro 1 (шанс 0.05 < 1) сейв позиции
  // на горе, чей ВХОДНОЙ кубик отказал бы, всё равно принимается —
  // иначе ~95% сейвов на горе лотереей («остаюсь на спавне»).
  const seed = enterSeedConst();
  assert.ok(seed !== null, 'RED: ACRO_MOUNTAIN_SEED в src/main.js');
  const chance1 = SH.derived(heroAcro(1)).acroBonus;
  const miss = F.pairs.find(
    (p) => !expectedEnter(F.G, seed, chance1, p.m.x, p.m.y, 1));
  assert.ok(miss, 'фикстура: в выборке есть горная клетка с q ≥ chance');
  const h2 = await boot(seedSave({
    day: 1, position: { x: miss.m.x, y: miss.m.y }, hero: heroAcro(1),
  }));
  const g2 = h2.sandbox.__game;
  assert.ok(g2.state.player.x === miss.m.x && g2.state.player.y === miss.m.y,
    'сейв позиции на горе ПРИНИМАЕТСЯ при acro>0 даже когда входной '
    + 'кубик клетки ОТКАЗАЛ бы (q ≥ chance) — restore читает стоЯчий '
    + 'предикат без кубика; герой на (' + g2.state.player.x + ',' +
    g2.state.player.y + '), ждём (' + miss.m.x + ',' + miss.m.y + ')');
});

// =====================================================================
// T11 (RED): хребет без кубика — с МОНТАЖНОЙ позиции шаг на соседнюю
// гору, чей входной кубик ПРИ ЦЕЛЕВОМ шансе 0.05 отказал бы, всё
// равно состоится (иначе карман на хребте: без шага день не тикает).
// =====================================================================
test('000422 T11: гора → гора (хребет) — без кубика входа даже для клетки с q ≥ chance', async () => {
  const F = await fixture();
  const seed = enterSeedConst();
  assert.ok(seed !== null, 'RED: ACRO_MOUNTAIN_SEED в src/main.js');
  const chance = SH.derived(heroAcro(1)).acroBonus;
  let picked = null;
  for (const p of F.pairs) {
    const ridge = ridgeOf(F, p.m);
    if (ridge && !expectedEnter(F.G, seed, chance, ridge.x, ridge.y, 1)) {
      picked = { m: p.m, ridge };
      break;
    }
  }
  assert.ok(picked,
    'фикстура: нужен хребтовый сосед с q ≥ chance (иначе тест '
    + 'анти-вакуумно бессилен — расширить выборку)');
  const h = await boot(seedSave({
    day: 1, position: { x: picked.m.x, y: picked.m.y }, hero: heroAcro(1),
  }));
  const g = h.sandbox.__game;
  assert.equal(g.state.player.x, picked.m.x,
    'фикстура: герой стоит на горе (' + picked.m.x + ',' + picked.m.y +
    ') — позиция принята');
  assert.equal(g.state.player.y, picked.m.y, 'фикстура: позиция — y');
  dismissStartWindow(h);
  const step = makeStepper(h);
  const r = step.tryStep(picked.ridge.x, picked.ridge.y);
  assert.ok(r.moved,
    'RED: шаг вдоль хребта на (' + picked.ridge.x + ',' +
    picked.ridge.y + ') не бросает входной кубик (карман-софтлок, '
    + 'прецедент W-10c: без успешного шага день не тикает)');
});

// =====================================================================
// T12 (RED): чистота rng — сегмент «вход в горы + хребет» не трогает
// rng-стримы мира (кубик — hash2-финализатор, как path_of_vines D3).
// =====================================================================
test('000422 T12: горный сегмент — 0 Math.random / 0 generateSeedPixels / 0 стартов боя', async () => {
  const F = await fixture();
  const { n, m } = F.pairs[0];
  const ridge = ridgeOf(F, m);
  assert.ok(ridge, 'фикстура: хребтовый сосед есть');
  const { h, g } = await bootAt(F, n, 20);
  const nn = installRngCounters(h);
  const step = makeStepper(h);
  assert.ok(step.tryStep(m.x, m.y).moved,
    'RED: вход на гору обязан состояться (acroBonus 1)');
  assert.ok(step.tryStep(ridge.x, ridge.y).moved, 'хребет');
  assert.equal(g.state.stepsToday, 4, '2 + 2 хода на горном сегменте');
  assert.equal(nn.math, 0,
    'кубик входа — G.hash2 (детерминированный финализатор), не '
    + 'Math.random: rng-стрим мира побитов чист');
  assert.equal(nn.seed, 0, 'карта на сегменте не перегенерирована');
  assert.equal(nn.combat, 0, 'ни одного старта боя на сегменте');
});

// =====================================================================
// T13 (RED): path_of_vines горы НЕ удешевляет (контракт thick = только
// FOREST; активная запись даёт 1 лишь на thick-тайлах).
// =====================================================================
test('000422 T13: запись path_of_vines активна — шаг на гору всё равно 2 хода', async () => {
  const F = await fixture();
  const { n, m } = F.pairs[0];
  const h = await boot(seedSave({
    day: 1, position: { x: n.x, y: n.y },
    hero: Object.assign(heroAcro(20), { mp: 20 }),
  }));
  const g = h.sandbox.__game;
  dismissStartWindow(h);
  assert.equal(g.state.player.x, n.x, 'фикстура: позиция N принята');
  learn(h, ['path_of_vines']);
  castVines(h);
  const step = makeStepper(h);
  assert.ok(step.tryStep(m.x, m.y).moved, 'вход на гору под лозами');
  assert.equal(g.state.stepsToday, 2,
    'RED: горы — 2 хода и при path_of_vines (лозы удешевляют thick, '
    + 'а горы — явная ветка стоимости, не thick)');
});

// =====================================================================
// T14 (guard, зелёная ДО правки): детерминизм — два независимых boot'а
// с одинаковым (клетка, день, acro) дают одинаковый исход входа.
// =====================================================================
test('000422 T14 (guard): детерминизм входа по (клетка, день, acro) — два boot-а совпали', async () => {
  const F = await fixture();
  const { n, m } = F.pairs[0];
  const a = await bootAt(F, n, 1);
  const ra = makeStepper(a.h).tryStep(m.x, m.y);
  const b = await bootAt(F, n, 1);
  const rb = makeStepper(b.h).tryStep(m.x, m.y);
  assert.equal(ra.moved, rb.moved,
    'один и тот же вход (' + m.x + ',' + m.y + ', день 1, acro 1) в '
    + 'двух boot-ах обязан давать один исход (детерминизм без rng)');
});

// =====================================================================
// T15 (RED): монотонность шанса — множество входных клеток при acro 1
// ⊆ множества при acro 20, и при acro 20 входны ВСЕ клетки выборки
// (клэмп шанса до 1; «с acro 100 проходимость гор растёт» на предикате).
// =====================================================================
test('000422 T15: множество входов монотонно по acro; при acroBonus 1 входны все клетки выборки', async () => {
  const F = await fixture();
  const a = await bootAt(F, F.pairs[0].n, 1);
  assert.equal(typeof a.g.acroMountainEnterOk, 'function',
    'RED: __game.acroMountainEnterOk отсутствует');
  const low = F.pairs.filter((p) => a.g.acroMountainEnterOk(p.m.x, p.m.y));
  const b = await bootAt(F, F.pairs[0].n, 20);
  for (const p of F.pairs) {
    assert.equal(b.g.acroMountainEnterOk(p.m.x, p.m.y), true,
      'acroBonus ≥ 1 (клэмп) — клетка (' + p.m.x + ',' + p.m.y +
      ') обязана быть входной');
  }
  assert.ok(low.length <= F.pairs.length, 'подмножество — по построению');
});

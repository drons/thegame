// Задача 000235.04: Порталы — врата в город, портальная метка,
// возврат, круг защиты — e2e на ПОЛНОЙ цепочке <script> из index.html
// (vm-песочница). ТЗ: tasks/pending/000235.04.md. Контракт:
// memory/000235.04-portals-mechanic.md (§2 — ctx, §4 — dispatch,
// §5 — причины отказов, §7 — зональный скан, §11 — e2e-голдены).
//
// Механика (контракт): 4 заклинания — РЕАЛЬНЫЕ future-ids волны .11
// (гость — live-инъекция в ЖИВОЙ каталог Game.SpellsData ПОСЛЕ boot,
// пин «ровно 17» не растёт):
//   * gate            — телепорт в ближайший built-город (якорь,
//     Чебышёв; якорь непроходим → тайл кольца, findSpawn-порядок);
//   * stone_anchor    — метка hero.portal_marker {x, y, day} на тайле
//     каста (ОДИН объект, перезапись);
//   * recall          — телепорт к ближайшему проходимому тайлу от
//     метки (000075-паттерн);
//   * warding_circle  — внебой days 1 + радиус (каталог) — зональная
//     СУПРЕССИЯ: зона-бой НЕ стартует, пока Чебышёв(зона, герой) ≤
//     wardRadius (единая точка main.js zoneSuppressedReason);
//     тайл-бой — НЕ подавляется (D6 .03 — не трогаем здесь).
// Каст — ЧЕРЕЗ КНИГУ (KeyB → clickRow, helpers tests/spellbook-oc-
// e2e.test.js): ok → книга закрыта; отказ → книга открыта +
// flash(reason) в #hud + mp-откат. mp — только через сейв saveHero.
//
// Мир-фолбэк (map.png в стабе ВСЕГДА onerror → G.generateSeedPixels,
// детерминированно), координаты (сверено tests/mob-zones-e2e.test.js
// + probe /tmp/thegame-wf-000235.04/probe.js):
//   * спавн (0,0);
//   * (1,0) — g2 «логово скелетов» — neutral 3×3, БЕЗ триггера
//     (бой ТОЛЬКО на тайле);
//   * (2,3) — g4 «паучье гнездо» — territorial 5×5, триггер (бой при
//     входе в зону, Чебышёв ≤ 2);
//   * (0,1) — d=2 от (2,3) — в зоне, не тайл группы;
//   * (3,2)/(3,3) — d=1 от (2,3); (4,1)/(4,2) — d=2 от (2,3) —
//     все проходные, НЕ тайлы групп (E5-голдены);
//   * город-якорь фолбэк-мира (20,−16) — ТИЛ НЕПРОХОДИМ; первый
//     проходной тайл кольца r=1 (findSpawn-порядок: (−1,−1)) —
//     (19,−17) (E2-гоlden);
//   * маршрут (0,0)→(−1,0)→(−2,0)→(−3,0)→(−4,0)→(−5,0) — без
//     групп/зон (E1-ход к точке отдаления).
//
// HARNESS: дубль tests/invisibility-e2e.test.js (DOM С ДЕРЕВОМ —
// строки книги; makeWalker с МОНОТОННЫМ now += 200, guard 12 кадров;
// spy — main.js читает G.combatUI ДИНАМИЧЕСКИ) + seedSave
// tests/mob-zones-e2e.test.js (dosey-позиция/cities ДО запуска
// цепочки). performance.now() заморожен на NOW = 1000.
//
// RED (5 из 5 — падают на master ОСМЫСЛЕННО, не синтаксис):
//   * E1 — stone_anchor: на master каст «телепорт» без mode —
//     skeleton ok, НО metka НЕ создаётся (state.hero.portal_marker
//     undefined) → deepEqual падает; далее recall — телепорта нет,
//     герой на (−5,0) → reload-нога тоже красная (метки в сейве нет);
//   * E2 — gate: на master кейса 'город' нет — hero НЕ сдвинут
//     ((0,0), а не (19,−17)); контроль (без городов) — master:
//     skeleton ok (книга закрыта, mp потрачено) против ТЗ-отказа
//     (книга открыта, mp откат, flash «нет города с постройками»);
//   * E3 — recall без метки: master: skeleton ok (проверки метки
//     НЕТ — P-b) против ТЗ-отказа «метка не установлена» (до
//     skeleton, D16) — книга/mp/flash красные;
//   * E4 — warding_circle: запись generic-ядром .02 — зелёная;
//     вход в зону (0,1) — на master зона-бой 000135 (супрессии
//     зоны НЕТ) → «боя нет» падает;
//   * E5(a) — seed (3,2) + круг r=1: шаг (3,3) (d=1 ≤ 1) — на
//     master зона-бой (супрессии нет) → «боя нет» падает;
//     ноги (b)/(c) — зелёные с момента добавления (гарды
//     существующего поведения и от over-супрессии).

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
// querySelector(All)) — дубль tests/dungeon-info-window.test.js;
// нужен для строк книги (data-spell-id + свой click-listener). ---

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

// --- localStorage-мок с ДОСЕЯННЫМ сейвом (Z6б-паттерн
// tests/mob-zones-e2e.test.js: position/cities ДО запуска цепочки) ---

function makeStorage(seed) {
  const m = new Map();
  if (seed != null) m.set(S.SAVE_KEY, JSON.stringify(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

function seedSave(data) {
  return { version: 1, savedAt: new Date(0).toISOString(), data };
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

async function boot(seed) {
  const h = bootSandbox(seed);
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

// Реальные future-ids волны .11 (контракт D7/D8): действие «телепорт»
// + параметры.mode; warding_circle — «внебой» + days/radius.
function portalGuest(over = {}) {
  return Object.assign({
    id: 'gate',
    название: 'Тестовое заклинание (000235.04)',
    школа: 'тень',
    база: null,
    степень: 1,
    атрибут: 'intelligence',
    уровень: 2,
    мани: 5,
    действие: 'телепорт',
    вне_боя: true,
    параметры: { mode: 'город' },
    здания: ['assets/buildings/000001.json'],
    описание: 'Тестовое заклинание (000235.04)',
    icon: 'assets/spell-icons/ghost.svg',
    icon_prompt: 'Тестовая иконка (000235.04)',
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
// undefined → undefined (master: поля ещё нет в state-зеркале —
// JSON.stringify(undefined) — не строка, host бросал бы SyntaxError).
function host(o) {
  return o === undefined ? undefined : JSON.parse(JSON.stringify(o));
}

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

// Каст ЧЕРЕЗ КНИГУ (KeyB → clickRow). Возврат: true → книга закрыта
// (ok), false → книга открыта (отказ: flash + mp-откат, .02).
function castViaBook(h, id) {
  key(h, 'KeyB');
  assert.ok(h.body.querySelector('.spellbook-oc'),
    'книга открыта (KeyB)');
  clickRow(h, id);
  return !h.sandbox.Game.spellbookOC.isOpen();
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
  for (const [tx, ty, d] of [[3, 2, 1], [3, 3, 1], [4, 1, 2], [4, 2, 2]]) {
    assert.ok(myMap.tileAt(tx, ty).passable
      && !myMap.tileAt(tx, ty).hasMobGroup,
      'сценарий: (' + tx + ',' + ty + ') — проходной, не тайл группы');
    assert.equal(Math.max(Math.abs(tx - 2), Math.abs(ty - 3)), d,
      'сценарий: (' + tx + ',' + ty + ') — Чебышёв d=' + d + ' от (2,3)');
  }
  return myMap;
}

function assertSpawn(g) {
  // Спавн (0,0): численное равенство (=== 0) — findSpawn может дать
  // -0; strictEqual(-0, 0) — false.
  assert.ok(g.state.player.x === 0, 'сценарий: спавн (0,0) — x');
  assert.ok(g.state.player.y === 0, 'сценарий: спавн (0,0) — y');
}

// --- E1: stone_anchor (метка на тайле каста) + recall (возврат) +
// reload (метка в сейве) ---

test('000235.04 E1. e2e: stone_anchor — метка {x, y, day} тайла каста (0,0) в state-зеркале, герой НЕ сдвинут, записей нет, mp −5; уход (0,0)→…→(−5,0) без боя; recall — возврат на метку (0,0), день не сместился; reload (сейв) — метка восстановлена', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assertSpawn(g);
  assert.equal(g.state.day, 1, 'фикстура: день 1');
  dismissStartWindow(h);
  injectGuests(h, [
    portalGuest({ id: 'stone_anchor', параметры: { mode: 'метка_установить' } }),
    portalGuest({ id: 'recall', параметры: { mode: 'метка_вернуться' } }),
  ]);
  learn(h, ['stone_anchor', 'recall']);
  const mp0 = saveHero(h).mp;
  assert.equal(mp0, 16, 'фикстура: новый герой mp = maxMP 16');
  const cap = spyStartCombat(G);
  assert.ok(castViaBook(h, 'stone_anchor'),
    'каст метки → книга ЗАКРЫТА (ok)');
  assert.deepEqual(host(g.state.hero.portal_marker),
    { x: 0, y: 0, day: 1 },
    'RED: метка {x, y, day} ТАЙЛА КАСТА в state-зеркале (master: '
    + 'undefined — кейса нет)');
  assert.deepEqual(host(g.state.hero.outOfCombatEffects), [],
    'телепорт — записей НЕТ (generic-ядро .02: days null)');
  assert.ok(g.state.player.x === 0, 'каст метки — герой НЕ сдвинут (x)');
  assert.ok(g.state.player.y === 0,
    'каст метки — герой НЕ сдвинут (y; findSpawn даёт −0 — === 0)');
  assert.equal(saveHero(h).mp, mp0 - 5, 'mp ровно «мани» (16 − 5)');
  // Маршрут без групп/зон (E1-гоlden): (0,0)→…→(−5,0).
  const walk = makeWalker(h);
  walk(-1, 0);
  walk(-2, 0);
  walk(-3, 0);
  walk(-4, 0);
  walk(-5, 0);
  assert.equal(G.combatUI.isActive(), false, 'ход до (−5,0) — без боя');
  assert.equal(cap.calls, 0, 'ход до (−5,0) — startCombat 0 вызовов');
  assert.ok(castViaBook(h, 'recall'), 'recall с меткой — ok, книга закрыта');
  assert.ok(g.state.player.x === 0,
    'RED: возврат на метку — x (master: герой остался на (−5,0))');
  assert.ok(g.state.player.y === 0,
    'RED: возврат на метку — y (метка с тайла спавна несёт −0 — === 0)');
  assert.equal(g.state.day, 1, 'телепорт — день НЕ сместился');
  assert.equal(saveHero(h).mp, mp0 - 10, 'два каста — mp 16 − 10');
  const savedRaw = h.storage.getItem(S.SAVE_KEY);
  assert.ok(savedRaw, 'сейв после возврата (saveNow/ saveHero)');
  const h2 = await boot(JSON.parse(savedRaw));
  const g2 = h2.sandbox.__game;
  assert.ok(g2.state.player.x === 0, 'reload: позиция из сейва — x');
  assert.equal(g2.state.player.y, 0, 'reload: позиция из сейва — y');
  assert.deepEqual(host(g2.state.hero.portal_marker),
    { x: 0, y: 0, day: 1 },
    'RED: reload — метка восстановлена из сейва (master: поля нет)');
});

// --- E2: gate — телепорт в ближайший built-город + контроль отказа ---

test('000235.04 E2. e2e: gate — seed cities (якорь (20,−16) с постройками; (30,10) без built — НЕ кандидат) → телепорт героя (0,0) на тайл КОЛЬЦА вокруг непроходимого якоря — (19,−17) (findSpawn-порядок (−1,−1)), mp −5, без боя; КОНТРОЛЬ (без городов с постройками) — отказ «нет города с постройками»: книга открыта, герой не сдвинут, mp не потрачен, flash в #hud', async () => {
  const cities = {
    '20,-16': {
      name: 'Деревня',
      built: [{ x: 21, y: -15, buildingId: 4 }],
    },
    '30,10': { name: 'Хутор' },
  };
  const h = await boot(seedSave({ day: 1, cities }));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assertSpawn(g);
  dismissStartWindow(h);
  injectGuests(h, [portalGuest({ id: 'gate' })]);
  learn(h, ['gate']);
  const mp0 = saveHero(h).mp;
  assert.equal(mp0, 16, 'фикстура: новый герой mp = maxMP 16');
  const cap = spyStartCombat(G);
  assert.ok(castViaBook(h, 'gate'), 'каст gate → книга ЗАКРЫТА (ok)');
  assert.equal(g.state.player.x, 19,
    'RED: телепорт в ближайший built-город — x (master: кейса нет — '
    + 'герой на (0,0))');
  assert.equal(g.state.player.y, -17,
    'RED: якорь (20,−16) непроходим → первая клетка кольца r=1 '
    + '(findSpawn-порядок (−1,−1)) — (19,−17)');
  assert.equal(saveHero(h).mp, mp0 - 5, 'mp ровно «мани» (16 − 5)');
  assert.equal(G.combatUI.isActive(), false, 'телепорт — без боя');
  assert.equal(cap.calls, 0, 'телепорт — startCombat 0 вызовов');

  // КОНТРОЛЬ: новый boot — городов с постройками НЕТ.
  const h2 = await boot();
  const G2 = h2.sandbox.Game;
  const g2 = h2.sandbox.__game;
  assertSpawn(g2);
  dismissStartWindow(h2);
  injectGuests(h2, [portalGuest({ id: 'gate' })]);
  learn(h2, ['gate']);
  const mp02 = saveHero(h2).mp;
  assert.equal(mp02, 16, 'фикстура: новый герой mp = maxMP 16');
  const cap2 = spyStartCombat(G2);
  key(h2, 'KeyB');
  assert.ok(h2.body.querySelector('.spellbook-oc'), 'книга открыта');
  clickRow(h2, 'gate');
  assert.ok(G2.spellbookOC.isOpen(),
    'RED: отказ — книга остаётся ОТКРЫТА (master: skeleton ok → '
    + 'книга закрыта, мана сжата)');
  assert.ok(g2.state.player.x === 0, 'отказ: герой не сдвинут (x)');
  assert.ok(g2.state.player.y === 0,
    'отказ: герой не сдвинут (y; findSpawn даёт −0 — === 0)');
  assert.equal(saveHero(h2).mp, mp02,
    'RED: отказ: mp НЕ потрачен (откат, D3)');
  assert.equal(cap2.calls, 0, 'телепорта не было (0 вызовов)');
  h2.frameFn(NOW + 16);
  const text = String(h2.hud.textContent);
  assert.ok(text.includes('нет города с постройками'),
    'RED: отказ — flash-строка ДЕСЛОВНО «нет города с постройками» '
    + 'в #hud (flashUntil = NOW+5000 > NOW — часы заморожены): '
    + JSON.stringify(text));
});

// --- E3: recall БЕЗ метки — отказ «метка не установлена» ---

test('000235.04 E3. e2e: recall БЕЗ метки — отказ «метка не установлена» (проверка ПЕРВАЯ, до skeleton — D16): книга остаётся открыта, герой не сдвинут, mp не потрачен, flash в #hud', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assertSpawn(g);
  dismissStartWindow(h);
  injectGuests(h, [
    portalGuest({ id: 'recall', параметры: { mode: 'метка_вернуться' } }),
  ]);
  learn(h, ['recall']);
  const mp0 = saveHero(h).mp;
  assert.equal(mp0, 16, 'фикстура: новый герой mp = maxMP 16');
  const cap = spyStartCombat(G);
  key(h, 'KeyB');
  assert.ok(h.body.querySelector('.spellbook-oc'), 'книга открыта');
  clickRow(h, 'recall');
  assert.ok(G.spellbookOC.isOpen(),
    'RED: отказ — книга остаётся ОТКРЫТА (master: skeleton ok без '
    + 'проверки метки → книга закрыта, мана сжата)');
  assert.ok(g.state.player.x === 0, 'отказ: герой не сдвинут (x)');
  assert.ok(g.state.player.y === 0,
    'отказ: герой не сдвинут (y; findSpawn даёт −0 — === 0)');
  assert.equal(saveHero(h).mp, mp0,
    'RED: отказ: mp НЕ потрачен (откат, D3)');
  assert.equal(cap.calls, 0, 'телепорта не было (0 вызовов)');
  h.frameFn(NOW + 16);
  const text = String(h.hud.textContent);
  assert.ok(text.includes('метка не установлена'),
    'RED: отказ — flash-строка ДЕСЛОВНО «метка не установлена» в '
    + '#hud: ' + JSON.stringify(text));
});

// --- E4: warding_circle — супрессия зоны + истечение + зона
// триггерится после ---

test('000235.04 E4. e2e: warding_circle (radius 5, days 1) — каст → запись {spellId, expiresDay:2} (generic-ядро .02), mp −5; (0,0)→(0,1) (d=2 от (2,3), Чебышёв(зона, герой) ≤ 5) — боя НЕТ (супрессия зоны); setDay(2) — запись вылетела (день-хук .02) → (0,0)→(0,1) — ЗОНА-БОЙ (groupType 4, seed hash2(2,3,salt), тайл/terrain группы)', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = assertFallbackWorld(G);
  assertSpawn(g);
  assert.equal(g.state.day, 1, 'фикстура: день 1');
  dismissStartWindow(h);
  injectGuests(h, [portalGuest({
    id: 'warding_circle',
    действие: 'внебой',
    параметры: { days: 1, radius: 5 },
  })]);
  learn(h, ['warding_circle']);
  const mp0 = saveHero(h).mp;
  assert.equal(mp0, 16, 'фикстура: новый герой mp = maxMP 16');
  assert.ok(castViaBook(h, 'warding_circle'),
    'каст круга → книга ЗАКРЫТА (ok)');
  assert.deepEqual(host(g.state.hero.outOfCombatEffects),
    [{ spellId: 'warding_circle', expiresDay: 2 }],
    'запись generic-ядром .02 (внебой, days 1 → expiresDay day+1)');
  assert.equal(saveHero(h).mp, mp0 - 5, 'mp ровно «мани» (16 − 5)');
  const cap = spyStartCombat(G);
  assert.equal(G.combatUI.isActive(), false, 'фикстура: спавн без боя');
  const walk = makeWalker(h);
  const now = walk(0, 1); // ВХОД В ЗОНУ (d=2 от (2,3)) — под кругом r=5
  assert.equal(G.combatUI.isActive(), false,
    'RED: герой в зоне под кругом защиты (d=2 ≤ r=5) — боя НЕТ '
    + '(master: зона-бой 000135 — супрессии зоны нет)');
  assert.equal(cap.calls, 0,
    'RED: startCombat 0 вызовов — зона-бой не начался НИКАК');
  frameAt(h, now + 200);
  assert.equal(G.combatUI.isActive(), false, 'следующий кадр — боя нет');
  g.actions.setDay(2); // rest() → onDay → expireOutOfCombatEffects
  assert.equal(g.state.day, 2, 'день прошёл (setDay)');
  assert.deepEqual(host(g.state.hero.outOfCombatEffects), [],
    'истечение (день-хук .02): в день 2 запись вылетела');
  walk(0, 0);
  walk(0, 1); // круг истёк — зона триггерится
  assert.equal(G.combatUI.isActive(), true,
    'после истечения круга зона ТРИГГЕРИТСЯ (zone-бой)');
  const c = G.combatUI.current();
  assert.equal(c.groupType, 4, 'zone-бой — паучье гнездо');
  assert.ok(cap.opts, 'opts захвачены (spy startCombat)');
  assert.equal(cap.opts.seed, G.hash2(2, 3, SALT),
    'seed zone-боя — от тайла ГРУППЫ: hash2(2,3,salt)');
  assert.equal(cap.opts.tile.x, 2, 'opts.tile — тайл группы (x)');
  assert.equal(cap.opts.tile.y, 3, 'opts.tile — тайл группы (y)');
  assert.equal(cap.opts.terrain, myMap.tileAt(2, 3).terrain,
    'opts.terrain — terrain тайла ГРУППЫ');
  assert.equal(cap.calls, 1, 'боев за сценарий РОВНО 1 (после истечения)');
  resolveCombatVictory(G, c, 'zone-бой (истечение круга)');
});

// --- E5: арифметика радиуса (из каталога, ленивый lookup): d ≤ r —
// супрессия, d > r — зона-бой ---

test('000235.04 E5. e2e: warding_circle r=1 (радиус ИЗ КАТАЛОГА): (a) seed (3,2) + каст → шаг (3,3) (d=1 ≤ r=1) — боя НЕТ; (b) КОНТРОЛЬ seed (3,2) БЕЗ каста → шаг (3,3) — зона-бой (существующее 000135); (c) seed (4,1) + каст → шаг (4,2) (d=2 > r=1) — зона-бой (гард от over-супрессии: зона НЕ подавляется за радиусом)', async () => {
  // (a) d=1 ≤ r=1 — подавляется.
  const h = await boot(seedSave({ day: 1, position: { x: 3, y: 2 } }));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.equal(g.state.player.x, 3, 'seed-позиция — x (в зоне, d=1)');
  assert.equal(g.state.player.y, 2, 'seed-позиция — y');
  dismissStartWindow(h);
  injectGuests(h, [portalGuest({
    id: 'warding_circle',
    действие: 'внебой',
    параметры: { days: 1, radius: 1 },
  })]);
  learn(h, ['warding_circle']);
  assert.ok(castViaBook(h, 'warding_circle'),
    'каст круга r=1 → книга ЗАКРЫТА (ok)');
  assert.deepEqual(host(g.state.hero.outOfCombatEffects),
    [{ spellId: 'warding_circle', expiresDay: 2 }],
    'круг r=1 активен (день 1)');
  const cap = spyStartCombat(G);
  assert.equal(G.combatUI.isActive(), false,
    'старт ВНУТРИ зоны — без боя (stарт tile-only)');
  const walk = makeWalker(h);
  walk(3, 3); // (2,3) — d=1 ≤ r=1 — подавляется
  assert.equal(G.combatUI.isActive(), false,
    'RED: (3,3) в радиусе круга (d=1 ≤ r=1) — боя НЕТ (master: '
    + 'зона-бой 000135 — супрессии нет)');
  assert.equal(cap.calls, 0, 'RED: startCombat 0 вызовов (d ≤ r)');

  // (b) КОНТРОЛЬ: без каста — зона-бой (существующее поведение).
  const h2 = await boot(seedSave({ day: 1, position: { x: 3, y: 2 } }));
  const G2 = h2.sandbox.Game;
  const g2 = h2.sandbox.__game;
  assert.equal(g2.state.player.x, 3, 'seed-позиция (b) — x');
  assert.equal(g2.state.player.y, 2, 'seed-позиция (b) — y');
  dismissStartWindow(h2);
  const cap2 = spyStartCombat(G2);
  const walk2 = makeWalker(h2);
  walk2(3, 3); // без круга — зона-бой
  assert.equal(G2.combatUI.isActive(), true,
    'КОНТРОЛЬ: без каста (3,3) (d=1) — зона-бой (существующее '
    + 'поведение 000135, без изменений)');
  const c2 = G2.combatUI.current();
  assert.equal(c2.groupType, 4, 'контроль: паучье гнездо');
  assert.ok(cap2.opts, 'opts захвачены (spy startCombat)');
  assert.equal(cap2.opts.seed, G2.hash2(2, 3, SALT),
    'контроль: seed — от тайла ГРУППЫ');
  assert.equal(cap2.calls, 1, 'контроль: бой начался РОВНО 1× за шаг');
  resolveCombatVictory(G2, c2, 'контроль (без каста)');

  // (c) d=2 > r=1 — зона НЕ подавляется (over-супрессии нет).
  const h3 = await boot(seedSave({ day: 1, position: { x: 4, y: 1 } }));
  const G3 = h3.sandbox.Game;
  const g3 = h3.sandbox.__game;
  assert.equal(g3.state.player.x, 4, 'seed-позиция (c) — x (в зоне, d=2)');
  assert.equal(g3.state.player.y, 1, 'seed-позиция (c) — y');
  dismissStartWindow(h3);
  injectGuests(h3, [portalGuest({
    id: 'warding_circle',
    действие: 'внебой',
    параметры: { days: 1, radius: 1 },
  })]);
  learn(h3, ['warding_circle']);
  assert.ok(castViaBook(h3, 'warding_circle'),
    'каст круга r=1 → книга ЗАКРЫТА (ok)');
  assert.deepEqual(host(g3.state.hero.outOfCombatEffects),
    [{ spellId: 'warding_circle', expiresDay: 2 }],
    'круг r=1 активен (c, день 1)');
  const cap3 = spyStartCombat(G3);
  const walk3 = makeWalker(h3);
  walk3(4, 2); // (2,3) — Чебышёв(зона, герой) = 2 > r=1
  assert.equal(G3.combatUI.isActive(), true,
    '(c): (4,2) ЗА радиусом круга (d=2 > r=1) — зона-бой (гард от '
    + 'over-супрессии: круг гасит ТОЛЬКО d ≤ r)');
  const c3 = G3.combatUI.current();
  assert.equal(c3.groupType, 4, '(c): паучье гнездо');
  assert.equal(cap3.calls, 1, '(c): бой начался РОВНО 1× за шаг');
  resolveCombatVictory(G3, c3, 'за радиусом');
});

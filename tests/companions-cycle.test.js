// Задача 000087: отряд в игровом цикле — смена дня (жалованье/уход),
// конец боя (xp/уровни/гибель), повторный найм. Контракт:
// memory/000087-companion-cycle.md (D1–D9, D12), шпаргалка —
// memory/000087-party-game-loop.md. ТЗ: tasks/pending/000087.md.
//
// Поверхность:
//   * S1–S4 — структурный скан src (паттерн day.test.js L406: окно
//     между маркерами + regex) — Точки подвешивания 000087:
//     onDay → payWages ДО saveNow + строки; 3 onEnd → combatEnd-
//     Companions + хелпер (applyCombatXp/allyXp/deadMercs); 3
//     rosterData: companionAllies() + combat-ui opts.rosterData;
//     onDay → перерисовка открытой панели «Отряд» (000086) — S4,
//     правка по итогам ревью (зелёный с первого коммита).
//   * V1–V5 — vm e2e, ПОЛНАЯ цепочка index.html (браузерная ветка
//     UMD): реальные onDay/boi через __game.actions + HUD-флэш
//     (паттерн HU5: rAF-кадры ПЕРЕД чтением hud.textContent —
//     performance.now() заморожен на NOW → флэш всегда «виден»)
//     + сейв (мок localStorage, saveNow из onDay/onEnd).
//
// Harness — СВОЙ (дублирование bootWithSave-паттерна 000085/
// building-effects С ДОБАВЛЕННЫМ возвратом hud-элемента;
// bootWithSave в save.test.js НЕ правится — свойство 000085;
// дублирование харнессов принято, 000083). makeEl — полный
// (combat-ui создаёт СВОЙ canvas боя — без getContext-стаба
// render() роняет TypeError, B8 building-effects).
//
// Кросс-реалм: assert Array.isArray ДО host() (host(undefined)
// бросает — 000085 §6.4); ошибки vm не instanceof Error хоста.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { SAVE_KEY } = require('../src/save.js');
const P = require('../src/player.js');

const ROOT = path.join(__dirname, '..');
const NOW = 1000; // performance.now() в песочнице заморожен

// --- Цепочка скриптов — из index.html (000087 — 0 новых script-тегов) ---
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));

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

// --- Canvas 2d-стаб (запись вызовов — sanity, что слой жив) ---

function makeContext2d(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

// --- «Снисходительный» DOM (полный: combat-ui build()/render()) ---

function matchesSel(el, sel) {
  // Поддерживает: 'tag', '.class', '[attr]', '[attr="value"]' и их
  // композиты без пробела — то, что использует игра (ui.js и др.).
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
  if (cls &&
      !String(el.className || '').split(/\s+/).includes(cls)) {
    return false;
  }
  if (attr) {
    if (!attr[0].startsWith('data-')) return false;
    const v = el.dataset ? el.dataset[attr[0].slice(5)] : undefined;
    if (attr[1] !== undefined && v !== attr[1]) return false;
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
    // children хранят СУРЫЕ target (а не прокси): remove() ищёт по
    // identity (B2 building-effects).
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
    // data-* → dataset.
    setAttribute(name, value) {
      if (name.startsWith('data-')) {
        target.dataset[name.slice(5)] = value;
      }
    },
    // canvas: 2d/WebGL-контексты — no-op-прокси. combat-ui.js создаёт
    // СВОЙ canvas боя (document.createElement('canvas')) — без
    // getContext-стаба render() роняет TypeError (B8).
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
  // textContent — как в DOM: сбрасывает детей (render() очищает секции).
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

// --- localStorage-мок: seed — досеянная оболочка сейва (v1) ---

function makeStorage(seed) {
  const m = new Map();
  if (seed != null) m.set(SAVE_KEY, JSON.stringify(seed));
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
  const warns = [];
  const errors = [];
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
  // #game — WebGL (без него main.js уходит в фолбэк-ветку и не стартует).
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
          : id === 'hud' ? hud
            : null),
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
    // реально снимает (без этого накапливались устаревшие keydown).
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
  // Image-стаб: assets/map.png ВСЕГДА onerror (детерминированный
  // фолбэк G.generateSeedPixels, main.js loadMapPixels), остальные —
  // onload. Загрузка — микротаск.
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
      warn: (m) => warns.push(String(m)),
      error: (m) => errors.push(String(m)),
      log: () => {},
    },
    document,
    window,
    Image,
    performance: { now: () => NOW },
    requestAnimationFrame: (fn) => { raf.push(fn); return raf.length; },
    // Таймеры не гоняем (флаши UI): no-op, чтобы не держать процесс.
    setTimeout: () => 0,
    clearTimeout: () => {},
  };
  vm.createContext(sandbox);
  for (const f of CHAIN) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox,
      { filename: f });
  }
  return { sandbox, winListeners, raf, warns, errors, storage, body, hud };
}

// Промывка микротасков (загрузки Image + loadMapPixels().then: карта,
// спавн, restoreFromSave, requestAnimationFrame).
const drain = () => new Promise((r) => setImmediate(r));

async function boot(seed) {
  const h = bootSandbox(seed);
  await drain();
  await drain();
  await drain();
  return h;
}

// --- Наблюдение ---

// Сейв из мок-хранилища (saveNow уже записал: onDay — существующая
// точка L896, onEnd — существующие L1014/L1313/L1480).
function readSave(h) {
  const text = h.storage.getItem(SAVE_KEY);
  assert.ok(text != null, 'сейв записан в мок-хранилище');
  return JSON.parse(text);
}

// Кросс-реалм: vm-объекты → JSON (паттерн 000085; Array.isArray
// проверяется ДО вызова — host(undefined) бросает).
const host = (o) => JSON.parse(JSON.stringify(o));

// Персонаж для досеянного сейва (форма sanitizeSavedHero: level/xp/
// gold/hp finite + шесть основных ≥ 1; hp клампится до maxHP).
function mkHero(over = {}) {
  return Object.assign(P.createCharacter(), over);
}

// Сейв реально ПРОЧИТАН (boot не «вакуумный»): оболочка v1, день
// мира восстановлен из data.day.
function assertRestored(h, day) {
  const st = h.sandbox.__game.state;
  assert.ok(st.map, 'карта сгенерирована (boot прошёл)');
  assert.ok(st.save, 'сейв прочитан (state.save выставлен)');
  assert.equal(st.save.version, 1, 'оболочка v1');
  assert.equal(st.day, day, 'день мира восстановлен из сейва');
}

// КАДР ГЛАВНОГО ЦИКЛА: ВСЕ rAF-записи main-цикла — ОДНА функция
// frame (requestAnimationFrame(frame) в конце frame + первичная
// на старт), поэтому raf[0] — main frame ВЕЧНО, даже ПОСЛЕ боя
// (последняя запись — устаревший combat-tick, заметка B25: после
// боя main-loop «заморожен» — тик боя больше не рендерит).
function mainFrameAt(h, now = NOW + 500) {
  h.raf[0](now);
}

// =====================================================================
// S1–S4. Структурный скан src — точки подвешивания 000087
// (паттерн day.test.js L406). RED: символов в текущем коде нет
// (S4 — правка по итогам ревью, зелёный с коммита ревью-фиксов).
// =====================================================================

test('S1: onDay — G.companions.payWages( ДО saveNow + 3 фиксированные строки (D1/D9)', () => {
  const text = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  const iOn = text.indexOf('clock.onDay(');
  assert.ok(iOn >= 0, 'main.js: регистрация clock.onDay(');
  const iNext = text.indexOf('function startCombatAt(', iOn);
  assert.ok(iNext > iOn, 'окно onDay — до следующей функции');
  const win = text.slice(iOn, iNext);
  const iSave = win.indexOf('saveNow();');
  assert.ok(iSave > 0, 'onDay: существующий saveNow (000085 D10 — НОЛЬ новых точек)');
  const before = win.slice(0, iSave);
  assert.ok(/G\.companions\.(payWages|loyaltyTick)\s*\(/.test(before),
    'onDay: G.companions.payWages(roster, NPCS, hero, НОВЫЙ day) — ДО saveNow (D1)');
  assert.ok(before.includes('Жалованье выплачено'),
    'строка: «Жалованье выплачено.» (D9)');
  assert.ok(before.includes('Не хватает денег на жалованье — лояльность падает'),
    'строка: «Не хватает денег на жалованье — лояльность падает.» (D9)');
  assert.ok(before.includes('покинул отряд'),
    'строка: «<имя> покинул отряд.» (D9)');
});

test('S4: onDay — открытая панель «Отряд» (000086) перерисовывается после payWages (правка по итогам ревью)', () => {
  const text = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  const iOn = text.indexOf('clock.onDay(');
  assert.ok(iOn >= 0, 'main.js: регистрация clock.onDay(');
  const iNext = text.indexOf('function startCombatAt(', iOn);
  assert.ok(iNext > iOn, 'окно onDay — до следующей функции');
  const win = text.slice(iOn, iNext);
  const iSave = win.indexOf('saveNow();');
  assert.ok(iSave > 0, 'onDay: существующий saveNow в окне');
  const before = win.slice(0, iSave);
  const iPw = before.search(/G\.companions\.payWages\s*\(/);
  assert.ok(iPw >= 0, 'onDay: payWages в окне (D1)');
  assert.ok(before.includes('G.squadUI.isOpen()'),
    'onDay: guard isOpen() — панель рендерится, только если открыта');
  const iSq = before.indexOf('G.squadUI.render()');
  assert.ok(iSq > iPw,
    'onDay: G.squadUI.render() — ПОСЛЕ payWages, ДО saveNow ' +
    '(перерисовка открытой панели 000086 после лояльности/ухода)');
});

test('S2: хелпер combatEndCompanions (applyCombatXp/allyXp/deadMercs/уровень/гибель) + вызов во ВСЕХ 3 onEnd (D2/D3/D5)', () => {
  const text = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  // Хелпер (D4): после roster-блока, ДО якоря «// Задача 000093:».
  const iH = text.indexOf('function combatEndCompanions(');
  assert.ok(iH >= 0, 'main.js: хелпер combatEndCompanions(res, combat)');
  const i93 = text.indexOf('// Задача 000093:', iH);
  assert.ok(i93 > iH, 'хелпер — до якоря «// Задача 000093:»');
  const hwin = text.slice(iH, i93);
  assert.ok(hwin.includes('G.companions.applyCombatXp('),
    'хелпер: applyCombatXp(roster, res.allyXp) — victory-guard (D3)');
  assert.ok(hwin.includes('allyXp'), 'хелпер: читает res.allyXp');
  assert.ok(hwin.includes('deadMercs.push('),
    'хелпер: deadMercs.push — гибель окончательна (D2)');
  assert.ok(hwin.includes('повысил уровень'),
    'хелпер: строка «<имя> повысил уровень (до N).» (D9)');
  assert.ok(hwin.includes('погиб в бою.'),
    'хелпер: строка «<имя> погиб в бою.» (D9)');
  // Три боевые точки: onEnd каждой вызывает хелпер (D5).
  const windows = [
    ['debug-бой startCombatAt', 'function startCombatAt(', 'if (G.buildingActions)'],
    ['мир-бой maybeStartCombat', 'function maybeStartCombat(', 'function enterLocation('],
    ['подземелье startDungeonCombat', 'function startDungeonCombat(', '// --- Камера ---'],
  ];
  for (const [name, start, end] of windows) {
    const i0 = text.indexOf(start);
    assert.ok(i0 >= 0, name + ': функция на месте');
    const i1 = text.indexOf(end, i0);
    assert.ok(i1 > i0, name + ': окно до следующего якоря');
    const win = text.slice(i0, i1);
    assert.ok(/combatEndCompanions\s*\(/.test(win),
      name + ': onEnd вызывает combatEndCompanions(res, combat) ДО saveNow');
  }
});

test('S3: «rosterData: companionAllies()» × 3 в main.js + allies-строка combat-ui (opts.rosterData) (D5/D6)', () => {
  const text = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  const n = (text.match(/rosterData:\s*companionAllies\(\)/g) || []).length;
  assert.equal(n, 3, 'main.js: снимок отряда на старте — ровно 3 боевые точки');
  const ui = fs.readFileSync(path.join(ROOT, 'src', 'combat-ui.js'), 'utf8');
  assert.ok(ui.includes('opts.rosterData'),
    'combat-ui.js: allies — opts.rosterData ПОСЛЕ Эфира (D6)');
});

// =====================================================================
// V1–V5. vm e2e: полная цепочка index.html, реальные onDay/бои.
// =====================================================================

// V1: смена дня БЕЗ золота — лояльность 65→45 (день 3, >40 — без
// ролла) → 25 (день 4: полоса 21…40 — roll по (4, 'merc_volk',
// 'quit'): ЗОЛОТОЙ ПИН — seed 1776998158, roll 0.1351470418740064
// < 0.5 → УХОД) → отряд пуст; gold не тронут; hud + сейв.
test('V1: день без золота — 65→45→25, уход на дне 4 (roll < 0.5), hud + сейв', async () => {
  const h = await boot(seedSave({
    day: 2,
    hero: mkHero({ gold: 0 }),
    companions: [
      { npcId: 'merc_volk', level: 1, xp: 0, loyalty: 65, hiredDay: 2 },
    ],
  }));
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: ' + h.errors.join('; '));
  assertRestored(h, 2);
  const g = h.sandbox.__game;
  assert.ok(Array.isArray(g.state.roster), 'roster — live-массив');
  assert.deepEqual(host(g.state.roster),
    [{ npcId: 'merc_volk', level: 1, xp: 0, loyalty: 65, hiredDay: 2 }],
    'отряд восстановлен из сейва (000085)');
  // День 3: 65 − 20 = 45 (45 > quit_high 40 — остаётся, ролла НЕТ).
  g.actions.setDay(3);
  assert.equal(g.state.day, 3);
  assert.equal(g.state.hero.gold, 0, 'неоплата: gold НЕ списывается');
  assert.ok(Array.isArray(g.state.roster));
  assert.equal(host(g.state.roster)[0].loyalty, 45,
    'день 3: 65 − 20 = 45 (payWages в onDay, D1)');
  mainFrameAt(h);
  let hud = String(h.hud.textContent);
  assert.ok(hud.includes('Не хватает денег на жалованье — лояльность падает.'),
    'hud: «Не хватает денег…»: ' + hud);
  assert.ok(!hud.includes('Жалованье выплачено'), 'hud: без «выплачено»');
  assert.ok(hud.endsWith('День 3.'), 'hud: «День 3.» — последняя строка: ' + hud);
  // День 4: 45 − 20 = 25 (полоса 21…40 — roll по (4, 'merc_volk',
  // 'quit'): seed 1776998158, roll 0.1351470418740064 < 0.5 → УХОД).
  g.actions.setDay(4);
  assert.ok(Array.isArray(g.state.roster));
  assert.equal(host(g.state.roster).length, 0,
    'день 4: лояльность 25, roll < 0.5 — Вольк ушёл (сплис внутри payWages)');
  mainFrameAt(h);
  hud = String(h.hud.textContent);
  assert.ok(hud.includes('Вольк покинул отряд.'),
    'hud: «<имя> покинул отряд.»: ' + hud);
  assert.ok(hud.includes('Не хватает денег на жалованье — лояльность падает.'));
  assert.ok(hud.endsWith('День 4.'), 'hud: «День 4.» — последняя: ' + hud);
  // День 5: отряд пуст — событий НЕТ (000079), gold по-прежнему 0.
  g.actions.setDay(5);
  assert.ok(Array.isArray(g.state.roster));
  assert.equal(host(g.state.roster).length, 0);
  assert.equal(g.state.hero.gold, 0, 'gold так и не списан');
  mainFrameAt(h);
  hud = String(h.hud.textContent);
  assert.ok(!hud.includes('Жалованье') && !hud.includes('покинул отряд'),
    'день 5: пустой отряд — строк отряда нет: ' + hud);
  assert.ok(hud.endsWith('День 5.'), 'hud: «День 5.» — последняя: ' + hud);
  // Сейв (onDay → существующий saveNow): отряд пуст.
  const saved = readSave(h);
  assert.deepEqual(saved.data.companions, [], 'сейв: companions []');
  assert.equal(saved.data.hero.gold, 0, 'сейв: gold 0');
});

// V2: смена дня С золотом — gold 10−1=9, loyalty 65+2=67, flash
// «Жалованье выплачено.» + «День 3.», результат payWages В сейве
// (payWages ДО saveNow — D1/D8).
test('V2: день с золотом — gold −1, loyalty +2, «Жалованье выплачено.», сейв', async () => {
  const h = await boot(seedSave({
    day: 2,
    hero: mkHero({ gold: 10 }),
    companions: [
      { npcId: 'merc_volk', level: 1, xp: 0, loyalty: 65, hiredDay: 2 },
    ],
  }));
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: ' + h.errors.join('; '));
  assertRestored(h, 2);
  const g = h.sandbox.__game;
  g.actions.rest(); // день 2 → 3 (реальный onDay)
  assert.equal(g.state.day, 3);
  assert.equal(g.state.hero.gold, 9, 'gold 10 − 1 (жалованье Волька) = 9');
  assert.ok(Array.isArray(g.state.roster));
  assert.equal(host(g.state.roster)[0].loyalty, 67, 'loyalty 65 + 2 = 67');
  mainFrameAt(h);
  const hud = String(h.hud.textContent);
  assert.ok(hud.includes('Жалованье выплачено.'),
    'hud: «Жалованье выплачено.»: ' + hud);
  assert.ok(!hud.includes('Не хватает денег'), 'hud: без неоплаты');
  assert.ok(hud.endsWith('День 3.'), 'hud: «День 3.» — последняя строка: ' + hud);
  // onDay → saveNow (существующая точка): payWages ДО saveNow —
  // результат виден в сейве.
  const saved = readSave(h);
  assert.equal(saved.data.hero.gold, 9, 'сейв: gold 9');
  assert.equal(saved.data.companions[0].loyalty, 67, 'сейв: loyalty 67');
});

// V3: РЕГРЕССИЯ пустого отряда (зелёный в red-фазе — инвариант
// «без отряда ничего не изменилось»): flash БАЙТ-В-БАЙТ «День N.»
// (D1: compLines пусто → композиция вырождается в старую строку).
test('V3: регрессия — пустой отряд: flash байт-в-байт «День N.» (ничего не изменилось)', async () => {
  const h = await boot(seedSave({
    day: 2,
    hero: mkHero(),
  }));
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: ' + h.errors.join('; '));
  assertRestored(h, 2);
  const g = h.sandbox.__game;
  g.actions.rest();
  assert.equal(g.state.day, 3);
  mainFrameAt(h);
  const hud = String(h.hud.textContent);
  assert.ok(hud.endsWith('\nДень 3.'),
    'flash байт-в-байт «День 3.» (последняя строка): ' + hud);
  assert.ok(!hud.includes('Жалованье'), 'без строк жалованья');
  assert.ok(!hud.includes('покинул отряд'), 'без строк ухода');
});

// V4: конец боя — ПОБЕДА: выживший получает долю (25 = round(50 ×
// 0.5)), xp копится в записи, второй бой — level_up (25+25 ≥ 50 →
// level 2, xp 0) + строки в flash; зелёные пины в том же тесте:
// hero.xp — не тронут (100% — ядро, 000087 НЕ дублирует), Эфир —
// ровно result.xp × 1 (addEfirXp в finish, 000081 — НЕ 2×);
// xp в сейве (onEnd → saveNow). Паттерн мутации B24/B25.
test('V4: победа — xp 25 в запись, 2-й бой — level 2 + строки; hero.xp и Эфир 1× — не тронуты', async () => {
  const h = await boot(seedSave({
    day: 2,
    hero: mkHero({ level: 8, hp: 200, gold: 200 }),
    companions: [
      { npcId: 'merc_volk', level: 1, xp: 0, loyalty: 65, hiredDay: 2 },
    ],
  }));
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: ' + h.errors.join('; '));
  assertRestored(h, 2);
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const heroXp0 = g.state.hero.xp;
  assert.equal(g.state.efir.level, 1, 'Эфир L1 (без efir-раздела в сейве)');
  // Бой 1: отряд в c.units — ПОСЛЕ Эфира (пин 000081: эфир ПЕРВЫМ).
  const c = g.actions.startCombat(0);
  assert.ok(c, 'бой начался (startCombat → combat)');
  const uEfir = (c.units || []).find((u) => u && u.kind === 'efir');
  assert.ok(uEfir, 'в c.units — Эфир (kind «efir», 000081)');
  const uMerc = (c.units || []).find((u) => u && u.kind === 'merc');
  assert.ok(uMerc, 'в c.units — наёмник (kind «merc», id = npcId) — rosterData дошёл до боя (D5/D6)');
  assert.equal(uMerc.id, 'merc_volk');
  assert.equal(uMerc.level, 1, 'level — из записи отряда (000082)');
  assert.ok(c.units.indexOf(uEfir) < c.units.indexOf(uMerc),
    'Эфир ПЕРВЫМ в allies (якорь placeAllies px−1, py−1)');
  // Мутация результата (B24/B25): checkVictory НЕ гоняется — «игрок
  // 100%» ядра не начисляется; onEnd/finish читают c.result.
  c.phase = 'over';
  c.result = {
    outcome: 'victory', xp: 50, gold: 1, defeated: 1,
    allyXp: [{ id: 'merc_volk', xp: 25 }],
  };
  G.combatUI.handleCode('Escape');
  assert.equal(G.combatUI.isActive(), false, 'бой закрыт (finish → onEnd)');
  // Доля в запись: xp 0 → 25 (25 < 50 — уровень пока не растёт).
  assert.ok(Array.isArray(g.state.roster));
  assert.deepEqual(host(g.state.roster),
    [{ npcId: 'merc_volk', level: 1, xp: 25, loyalty: 65, hiredDay: 2 }],
    'roster: xp 0 → 25 (applyCombatXp, D3)');
  // Зелёные пины: герой — НЕ тронут; Эфир — ровно result.xp 1×
  // (0 + 50 ≥ 50 → level 2, xp 0; при 2× было бы level 2, xp 50).
  assert.equal(g.state.hero.xp, heroXp0,
    'hero.xp — не тронут (100% — ядро в реальном бою; 000087 не дублирует)');
  assert.equal(g.state.efir.level, 2, 'Эфир: 0 + 50 → level 2 (ровно 1×)');
  assert.equal(g.state.efir.xp, 0, 'Эфир: порог 50 списан, остаток 0 (не 2×)');
  mainFrameAt(h);
  let hud = String(h.hud.textContent);
  assert.ok(hud.includes('Победа! +50 опыта, +1 золота.'),
    'hud: базовая строка победы НЕ тронута: ' + hud);
  assert.ok(hud.includes('Спутники: +25 опыта (Вольк).'),
    'hud: «Спутники: +N опыта (Имя).» (D9, одна строка): ' + hud);
  assert.ok(hud.endsWith('Спутники: +25 опыта (Вольк).'),
    'hud: xp-строка — ПОСЛЕ базовой (D5): ' + hud);
  // Сейв (onEnd → saveNow): xp в записи.
  let saved = readSave(h);
  assert.equal(saved.data.companions[0].xp, 25, 'сейв: xp 25');
  assert.equal(saved.data.efir.level, 2, 'сейв: Эфир level 2');
  // Бой 2: xp 25 + 25 = 50 ≥ xpForNext(1) = 50 → level 2, xp 0 —
  // уровень растёт в onEnd этого боя (ниже). ДО боя запись — level 1
  // (xp 25 < 50, пин выше) — юнит берёт level ИМЕННО из записи
  // (рост статов ИМПЛИЦИТНЫЙ: makeAlly пересчитывает из level записи).
  const c2 = g.actions.startCombat(0);
  assert.ok(c2, 'второй бой начался');
  const u2 = (c2.units || []).find((u) => u && u.kind === 'merc');
  assert.ok(u2, 'второй бой: наёмник в c.units');
  assert.equal(u2.level, 1, 'рост статов ИМПЛИЦИТНЫЙ: makeAlly пересчитывает из level записи (1, xp 25 < 50)');
  c2.phase = 'over';
  c2.result = {
    outcome: 'victory', xp: 50, gold: 1, defeated: 1,
    allyXp: [{ id: 'merc_volk', xp: 25 }],
  };
  G.combatUI.handleCode('Escape');
  assert.ok(Array.isArray(g.state.roster));
  assert.deepEqual(host(g.state.roster),
    [{ npcId: 'merc_volk', level: 2, xp: 0, loyalty: 65, hiredDay: 2 }],
    'roster: level_up (while-цикл, 000082)');
  assert.equal(g.state.hero.xp, heroXp0, 'hero.xp — по-прежнему не тронут');
  // Эфир: 0 + 50 < 141 (xpForNext(2)) → level 2, xp 50 — ровно 1×
  // result.xp (при 2× было бы level 3, xp 9 — порог 141 перекрыт).
  assert.equal(g.state.efir.level, 2, 'Эфир: 2-й бой — 50 < 141 → level 2 (ровно 1×)');
  assert.equal(g.state.efir.xp, 50, 'Эфир: xp 50 — ровно 1× (при 2×: level 3, xp 9)');
  mainFrameAt(h);
  hud = String(h.hud.textContent);
  assert.ok(hud.includes('Вольк повысил уровень (до 2).'),
    'hud: «<имя> повысил уровень (до N).» (D9): ' + hud);
  assert.ok(hud.includes('Спутники: +25 опыта (Вольк).'));
  assert.ok(hud.indexOf('Вольк повысил уровень (до 2).')
      < hud.indexOf('Спутники: +25 опыта (Вольк).'),
    'hud: порядок — level_up, потом «Спутники:» (D4: xpLines)');
  saved = readSave(h);
  assert.equal(saved.data.companions[0].level, 2, 'сейв: level 2');
  assert.equal(saved.data.companions[0].xp, 0, 'сейв: остаток xp 0');
  assert.equal(saved.data.efir.level, 2, 'сейв: Эфир level 2');
  assert.equal(saved.data.efir.xp, 50, 'сейв: Эфир xp 50 (ровно 1×)');
});

// V5: гибель —merc ПРИБЫЛ в бою (мутация юнита: любой исход — здесь
// victory, D2: фильтрация по живому состоянию, а не по outcome):
// deadMercs ['merc_volk'] (окончательно), roster.splice, строка в
// hud, сейв, повторный найм — НЕЛЬЗЯ (контракт G2). Эфир — НИКОГДА
// в dead_mercs (фильтр kind 'merc').
test('V5: гибель в бою — dead_mercs (окончательно) + splice + «погиб в бою.» + сейв', async () => {
  const h = await boot(seedSave({
    day: 2,
    hero: mkHero({ level: 8, hp: 200, gold: 200 }),
    companions: [
      { npcId: 'merc_volk', level: 1, xp: 0, loyalty: 65, hiredDay: 2 },
    ],
  }));
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: ' + h.errors.join('; '));
  assertRestored(h, 2);
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const c = g.actions.startCombat(0);
  assert.ok(c, 'бой начался');
  const u = (c.units || []).find((x) => x && x.side === 'ally' && x.kind === 'merc');
  assert.ok(u, 'в c.units — merc (id «merc_volk»)');
  assert.equal(u.id, 'merc_volk');
  // Мутация: наёмник погиб в бою.
  u.alive = false;
  u.hp = 0;
  c.phase = 'over';
  c.result = { outcome: 'victory', xp: 50, gold: 1, defeated: 1, allyXp: [] };
  G.combatUI.handleCode('Escape');
  assert.equal(G.combatUI.isActive(), false, 'бой закрыт (finish → onEnd)');
  // Гибель: deadMercs + splice (D2 — живой объект боя, ЛЮБОЙ исход).
  assert.ok(Array.isArray(g.state.deadMercs));
  assert.deepEqual(host(g.state.deadMercs), ['merc_volk'],
    'deadMercs: «merc_volk» (окончательно — 000085)');
  assert.ok(Array.isArray(g.state.roster));
  assert.equal(host(g.state.roster).length, 0, 'roster: запись удалена (splice)');
  assert.ok(!host(g.state.deadMercs).includes('efir'),
    'Эфир — никогда в dead_mercs (SPEC: не умирает навсегда)');
  mainFrameAt(h);
  const hud = String(h.hud.textContent);
  assert.ok(hud.includes('Вольк погиб в бою.'),
    'hud: «<имя> погиб в бою.» (D9): ' + hud);
  assert.ok(!hud.includes('Спутники:'),
    'hud: xp-строк нет (victory, allyXp [] — спутник погиб)');
  // Сейв (onEnd → saveNow): dead_mercs + пустой отряд.
  const saved = readSave(h);
  assert.deepEqual(saved.data.dead_mercs, ['merc_volk'], 'сейв: dead_mercs');
  assert.deepEqual(saved.data.companions, [], 'сейв: companions []');
  // Повторный найм ПОСЛЕ ГИБЕЛИ — НЕЛЬЗЯ (контракт G2): deadMercs
  // отфильтрован навсегда (candidatesForTavern — live-ссылки).
  const cands = G.companions.candidatesForTavern(
    G.NpcData.NPCS, g.state.roster, g.state.deadMercs);
  assert.ok(!cands.some((n) => n.id === 'merc_volk'),
    'мёртвый volk — не кандидат НАВСЕГДА');
  assert.ok(cands.some((n) => n.id === 'merc_ashka'),
    'остальные наёмники — кандидаты (фильтры независимы)');
});

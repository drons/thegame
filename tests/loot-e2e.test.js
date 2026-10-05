// Задача 000132: лут с мобов при победе — предмет(ы) в инвентарь
// героя + авто-золото при переполнении. Контракт —
// memory/000132-mob-loot.md; ТЗ — tasks/pending/000132.md.
//
// Поверхность (TDD — хелпер main.js и c.result.items пока НЕТ):
//   * V1 — «победа → предмет в инвентаре»: полный путь
//     startCombatAt.onEnd → хелпер → G.addItem → slots + flash
//     «Лут: …» (сегодня такого пути НЕТ — победа даёт только xp+gold);
//   * V2 — «переполнение весом → авто-золото по value» + строка
//     «не влезло: +N золота» (предмет НЕ теряется);
//   * S1 — структурный скан main.js: хелпер combatEndLoot в
//     wiring-секции + вызов во ВСЕХ 3 onEnd-окнах (startCombatAt /
//     maybeStartCombat / startDungeonCombat) + в хелпере G.addItem /
//     hero.gold / «не влезло» / guard victory+items (закрывает
//     подземелье без дорогого dungeon-e2e — ТЗ «мир и/или подземелье»).
//
// Мутационный подход e2e (НЕ реальный бой в vm): onEnd реальный,
// checkVictory покрыт node-тестами (combat.test.js 000132-N1..N6).
// Мутация c.result БЕЗ items в чужих e2e (companions-cycle V4/V5) —
// хелпер обязан деградировать no-op (байт-в-байт HUD-пин сохраняется).
//
// Harness — СВОЙ, дубль bootSandbox из tests/companions-cycle.test.js
// (дублирование харнессов принято — 000083/000087; полный makeEl:
// combat-ui создаёт СВОЙ canvas боя — без getContext-стаба render()
// роняет TypeError). Кросс-реалм: assert Array.isArray ДО host()
// (host(undefined) бросает — 000085 §6.4).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { SAVE_KEY } = require('../src/save.js');
const P = require('../src/player.js');

const ROOT = path.join(__dirname, '..');
const NOW = 1000; // performance.now() в песочнице заморожен

// --- Цепочка скриптов — из index.html (000132 — 0 новых тегов) ---
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

// Сейв из мок-хранилища (saveNow уже записал: onEnd — существующая
// пост-боевая точка).
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
// V1–V2. vm e2e: полная цепочка index.html, отладочный бой
// (g.actions.startCombat(0) → startCombatAt, onEnd-место 1) +
// мутация c.result (B24/B25) + Escape → finish → onEnd → хелпер.
// =====================================================================

// V1: «победа → предмет в инвентаре»: результат боя c.result.items
// [{sulfur,1}] → onEnd → хелпер → G.addItem → slot в live-инвентаре;
// flash: базовая строка НЕ тронута + «Лут: Сера.»; gold — дельта 0
// (мутационный бой: ядро не гоняется, дельта = только авто-золото,
// а здесь оно 0); предмет — в сейве (onEnd → saveNow).
test('000132-V1: победа → предмет в инвентаре героя + «Лут: …» в flash + сейв', async () => {
  const h = await boot(seedSave({
    day: 2,
    hero: mkHero({ gold: 100 }),
  }));
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: ' + h.errors.join('; '));
  assertRestored(h, 2);
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const gold0 = g.state.hero.gold;
  assert.ok(Array.isArray(g.state.hero.inventory),
    'инвентарь существует (restoreFromSave → sanitizeInventory)');
  assert.deepEqual(host(g.state.hero.inventory), [], 'slots — пусты ДО боя');
  // Отладочный бой = startCombatAt (onEnd-место 1308, «бой в мире»).
  const c = g.actions.startCombat(0);
  assert.ok(c, 'бой начался (startCombat → combat)');
  // Мутация результата (B24/B25): checkVictory НЕ гоняется — onEnd
  // читает c.result; items — НОВОЕ поле контракта 000132.
  c.phase = 'over';
  c.result = {
    outcome: 'victory', xp: 16, gold: 8, defeated: 1,
    allyXp: [], items: [{ id: 'sulfur', qty: 1 }],
  };
  G.combatUI.handleCode('Escape');
  assert.equal(G.combatUI.isActive(), false, 'бой закрыт (finish → onEnd)');
  // Предмет — в live-инвентаре героя (slots: [{id, qty}]).
  const slots = g.state.hero.inventory;
  assert.ok(Array.isArray(slots), 'инвентарь — массив slots');
  assert.deepEqual(host(slots), [{ id: 'sulfur', qty: 1 }],
    'slots: [{sulfur, 1}] — лут выдан в инвентарь');
  // gold — НЕ изменился (дельта 0: без авто-золота ядро не гоняется).
  assert.equal(g.state.hero.gold, gold0, 'gold — дельта 0 (нет авто-золота)');
  mainFrameAt(h);
  const hud = String(h.hud.textContent);
  assert.ok(hud.includes('Победа! +16 опыта, +8 золота.'),
    'hud: базовая строка победы НЕ тронута: ' + hud);
  assert.ok(hud.includes('Лут: Сера.'),
    'hud: «Лут: Сера.» (имена в порядке c.result.items): ' + hud);
  // Сейв (onEnd → saveNow): предмет зафиксирован.
  const saved = readSave(h);
  assert.deepEqual(host(saved.data.hero.inventory.slots),
    [{ id: 'sulfur', qty: 1 }], 'сейв: лут в inventory');
});

// V2: «переполнение → авто-золото»: 14×wood_log = 28 кг (лимит 30,
// carryWeightMult 1) + knight_plate 7 кг → 35 > 30 → addItem отказ
// «слишком тяжело (лимит веса)» → предмет НЕ теряется: ровно +400
// (value knight_plate — базовая цена каталога, НЕ sellPrice лавки) +
// строка «не влезло: +400 золота»; slots — БЕЗ knight_plate.
test('000132-V2: переполнение весом → авто-золото по value + «не влезло: +400 золота»', async () => {
  const h = await boot(seedSave({
    day: 2,
    hero: mkHero({ gold: 50 }),
  }));
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: ' + h.errors.join('; '));
  assertRestored(h, 2);
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  // 14 × wood_log (2 кг, reagent — складывается) = 28 кг, 1 слот.
  const r = g.actions.giveItem('wood_log', 14);
  assert.ok(r && r.ok, 'giveItem: 28 кг ≤ 30 — принято: ' + JSON.stringify(r));
  const gold0 = g.state.hero.gold;
  const c = g.actions.startCombat(0);
  assert.ok(c, 'бой начался');
  // Лут — knight_plate (7 кг): 28 + 7 = 35 > 30 → отказ по весу.
  c.phase = 'over';
  c.result = {
    outcome: 'victory', xp: 16, gold: 8, defeated: 1,
    allyXp: [], items: [{ id: 'knight_plate', qty: 1 }],
  };
  G.combatUI.handleCode('Escape');
  assert.equal(G.combatUI.isActive(), false, 'бой закрыт (finish → onEnd)');
  // Предмет НЕ в slots (отказ по весу), wood_log на месте.
  const slots = g.state.hero.inventory;
  assert.ok(Array.isArray(slots), 'инвентарь — массив slots');
  assert.deepEqual(host(slots), [{ id: 'wood_log', qty: 14 }],
    'slots: knight_plate НЕ добавлен, wood_log на месте');
  // Авто-золото: РОВНО +400 (value knight_plate — базовая цена).
  assert.equal(g.state.hero.gold, gold0 + 400,
    'gold: ровно +' + 400 + ' (value, не sellPrice)');
  mainFrameAt(h);
  const hud = String(h.hud.textContent);
  assert.ok(hud.includes('Победа! +16 опыта, +8 золота.'),
    'hud: базовая строка победы НЕ тронута: ' + hud);
  assert.ok(hud.includes('не влезло: +400 золота'),
    'hud: «не влезло: +400 золота» (ОДНА агрегированная строка): ' + hud);
  assert.ok(!hud.includes('Лут:'),
    'hud: «Лут: …» — только при выданных (ничего не выдано): ' + hud);
});

// =====================================================================
// S1. Структурный скан main.js (паттерн S2 companions-cycle: окно
// между маркерами + regex) — закрывает ВСЕ 3 onEnd-места (в т.ч.
// подземелье) без дорогого dungeon-e2e (ТЗ «мир и/или подземелье»).
// =====================================================================

test('000132-S1: хелпер combatEndLoot (wiring) + вызов во ВСЕХ 3 onEnd + авто-золото/guard внутри', () => {
  const text = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  // Хелпер — wiring-секция, сразу ПОСЛЕ combatEndCompanions (000087),
  // ДО якоря «// Задача 000093:».
  const iComp = text.indexOf('function combatEndCompanions(');
  assert.ok(iComp >= 0, 'main.js: хелпер combatEndCompanions (000087) на месте');
  const iH = text.indexOf('function combatEndLoot(');
  assert.ok(iH > iComp,
    'main.js: хелпер combatEndLoot(res) — сразу после combatEndCompanions');
  const i93 = text.indexOf('// Задача 000093:', iH);
  assert.ok(i93 > iH, 'хелпер — до якоря «// Задача 000093:»');
  const hwin = text.slice(iH, i93);
  // Выдача: плоский API items.js (G.addItem/G.getItem — flat на Game).
  assert.ok(hwin.includes('G.addItem('),
    'хелпер: G.addItem(hero, id, qty) — плоский API (пред. сундук)');
  assert.ok(hwin.includes('G.getItem('),
    'хелпер: G.getItem(id) — данные предмета (имя, value)');
  // no-op guard: outcome 'victory' + items — массив (иначе ломает
  // байт-в-байт HUD-пин companions-cycle V4 при мутации БЕЗ items).
  assert.ok(/res\.outcome\s*===\s*'victory'/.test(hwin),
    'хелпер: guard outcome === \'victory\'');
  assert.ok(hwin.includes('Array.isArray(res.items)'),
    'хелпер: guard Array.isArray(res.items) (no-op при отсутствии/пустоте)');
  // Авто-золото: ЛЮБОЙ отказ addItem → hero.gold += value × qty.
  assert.ok(hwin.includes('hero.gold'),
    'хелпер: авто-золото — мутация hero.gold (live-ссылка)');
  assert.ok(hwin.includes('не влезло:'),
    'хелпер: строка «не влезло: +N золота» (дословно из ТЗ)');
  // Три боевые точки: onEnd каждой вызывает хелпер (контракт: ВЫДАЧА
  // лута — во ВСЕХ 3 местах победы main.js).
  const windows = [
    ['отладочный бой startCombatAt', 'function startCombatAt(', 'if (G.buildingActions)'],
    ['мир-бой maybeStartCombat', 'function maybeStartCombat(', 'function enterLocation('],
    ['подземелье startDungeonCombat', 'function startDungeonCombat(', '// --- Камера ---'],
  ];
  for (const [name, start, end] of windows) {
    const i0 = text.indexOf(start);
    assert.ok(i0 >= 0, name + ': функция на месте');
    const i1 = text.indexOf(end, i0);
    assert.ok(i1 > i0, name + ': окно до следующего якоря');
    const win = text.slice(i0, i1);
    assert.ok(/combatEndLoot\s*\(/.test(win),
      name + ': onEnd вызывает combatEndLoot(res)');
  }
});

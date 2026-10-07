// Задача 000162 — «Воскрешение в храме»: КРАСНЫЕ тесты (TDD).
//
// Новый e2e-файл (собственный vm-хarness, R-7 — дублирование
// паттерна прецедентов camp-map-e2e / loot-e2e / companions-cycle):
// ПОЛНАЯ цепочка index.html (браузерная ветка UMD), стабы
// DOM/WebGL/localStorage, performance.now заморожен на NOW, мир
// детерминированный (map.png ВСЕГДА onerror → G.generateSeedPixels).
//
// Причина красных (master 0c47f71): услуги «Воскрешение» ещё нет —
// каталоги 36/37/38 без эффекта-массива, в реестре нет записи
// 'resurrect', спец-модуля нет — строка 'resurrect' в оверлее
// buildingUI отсутствует: все 5 сценариев падают на
// findRow(ov, 'resurrect') → null (осмысленно — функциональность
// отсутствует, не синтаксис/окружение). Протокол: ровно 14 красных
// (6 RES-A + 2 RES-BA + 5 RES-E + 1 RES-IO1), остальной свита —
// зелёный.
//
// Контракт: memory/000162-temple-resurrection.md (§3 — чистый
// apply/цена; §4 — спец-модуль и пикер; §8 — RES-E1..E5).
//
// Сценарии:
//   * RES-E1 — полный цикл: dead_mercs (Вольк, ур. 3/xp 100) → храм
//     солнца (36) → [E] → «Воскрешение» → пикер → Enter →
//     gold БАЗА−25 (цена round(20+0.05×100), D2; БАЗА — gold после
//     walk: zone-бой у спавна (000135) авто-решается в walkTo и
//     детерминированно даёт лут — ассерты по ДЕЛЬТЕ от базы),
//     live roster — 1 запись 6 ключей (зеркала level/xp 3/100),
//     live deadMercs — []; сейв: companions 1 (sheet.level 3,
//     sheet.xp 100, loyalty 70, hiredDay 5), dead_mercs [];
//     buildingOncePerDay — без ':resurrect' (R-4: услуга без
//     дневного лимита); flash «Вольк снова в отряде.» (Q-4);
//     пикер закрыт.
//   * RES-E2 — повторная гибель: после воскрешения (сценарий E1) —
//     гибель в бою (паттерн V5 companions-cycle) → deadMercs снова
//     получает запись {npcId, sheet 3/100, loyalty 70, hiredDay 5}
//     (НЕ «призрак» L1/xp0), roster 0, npcId-уникальность 000161.
//   * RES-E3 — «мало золота» в confirm: 2 кандидата (25/70),
//     seed gold 10 → БАЗА после walk 63 (L1-дроп +53 — между
//     25 и 70) → ArrowDown (дорогой, 70) → Enter → flash
//     «мало золота» (63 < 70), НУЛЕВЫЕ мутации, пикер ОТКРЫТ
//     (Q-2) → ArrowUp (дешёвый, 25) → Enter → успех: gold
//     БАЗА−25 = 38, deadMercs 1 (дорогой остался), roster 1
//     (дешёвый).
//   * RES-E4 — «отряд полон»: roster 3 (cap max_companions) +
//     1 погибший → строка 'resurrect' ДСТУПНА (кап НЕ часть
//     available) → нажатие → flash «отряд полон»; пикера нет,
//     мутаций нет, марка ':resurrect' не сгорела (отказ —
//     flash-без-mark/saveNow, BA4(d)).
//   * RES-E5 — «нет погибших»: dead_mercs [] → строка 'resurrect'
//     disabled + reason «нет погибших» (R-2: золото НЕ гасит
//     строку — гасит только список) → нажатие → НОЛЬ: пикера нет,
//     flash нет, сейв не писан, buildingUI открыт (Esc закрывает).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { SAVE_KEY } = require('../src/save.js');
const P = require('../src/player.js');
const { NPCS } = require('../src/npc-data.js');

const ROOT = path.join(__dirname, '..');
const NOW = 1000; // performance.now() в песочнице заморожен на NOW

// --- Цепочка скриптов — из index.html ---
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

function makeContext2d(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

// --- «Снисходительный» DOM-элемент с деревом (дети/родитель,
// dataset, closest) — как harness building-effects (B-секция):
// нужен для оверлея buildingUI (строки, делегированный клик) и
// для пикера .resurrect-overlay (строки .resurrect-row). ---

function matchesSel(el, sel) {
  // Поддерживает: 'tag', '.class', '[attr]', '[attr="value"]' и их
  // композиты без пробела ('button[data-buid]') — то, что
  // используют building-ui.js / ui.js (closest('[data-buid]')).
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
      if (name.startsWith('data-')) {
        target.dataset[name.slice(5)] = value;
      }
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
  // textContent — как в DOM: сбрасывает детей.
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

// Рекурсивный текст элемента (ассерты содержимого строк пикера).
function textOf(n) {
  let s = String(n.textContent || '');
  for (const ch of n.children || []) s += textOf(ch);
  return s;
}

// --- localStorage-мок: seed ДОСЕЯН ДО запуска цепочки (main.js
// читает сейв синхронно при загрузке) ---

function makeStorage(seed) {
  const m = new Map();
  if (seed != null) m.set(SAVE_KEY, JSON.stringify(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// Оболочка досеянного сейва (v1).
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
  // #game — WebGL (без него main.js уходит в фолбэк-ветку).
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
    // реально снимает (иначе накапливались устаревшие keydown).
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
  // фолбэк G.generateSeedPixels), остальные — onload.
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
  return { sandbox, winListeners, raf, errors, storage, body, hud };
}

// Промывка микротасков (Image + loadMapPixels().then: карта, спавн,
// restoreFromSave, requestAnimationFrame).
const drain = () => new Promise((r) => setImmediate(r));

async function boot(seed) {
  const h = bootSandbox(seed);
  await drain();
  await drain();
  await drain();
  return h;
}

// --- Ввод: диспетч по захваченным window-слушателям ---
// ВАЖНО: массив слушателей СНАПШОТИТСЯ перед диспетчем — слушатель,
// зарегистрированный ВО ВРЕМЯ диспетча (buildingUI.open / openPicker
// вешают свои keydown), текущее событие НЕ видит (семантика
// браузерного DOM). Поэтому listener пикера (добавлен при open)
// виден ПОСЛЕДУЮЩИМ нажатиям.

function key(h, code, extra = {}) {
  const e = Object.assign({ code, preventDefault() {}, stopPropagation() {} },
    extra);
  for (const fn of (h.winListeners['keydown'] || []).slice()) fn(e);
  return e;
}

// КАДР ГЛАВНОГО ЦИКЛА: все rAF-записи main-цикла — одна функция
// frame (requestAnimationFrame(frame) в конце frame + первичная на
// старт) → raf[0] — main frame ВЕЧНО (замечание companions-cycle
// B25: после боя последняя запись — устаревший combat-tick).
function mainFrameAt(h, now = NOW + 500) {
  h.raf[0](now);
}

// --- Наблюдение ---

// Сейв из мок-хранилища ({version, savedAt, data}) или null.
function readSave(h) {
  const text = h.storage.getItem(SAVE_KEY);
  return text == null ? null : JSON.parse(text);
}

// Кросс-реалм: vm-массивы → JSON (Array.isArray проверяется ДО
// вызова на стороне теста — host(undefined) бросает).
const host = (o) => JSON.parse(JSON.stringify(o));

// Оверлей buildingUI — .combat-overlay без npc-overlay.
function findOverlay(h) {
  const all = findAll(h.body, '.combat-overlay');
  return all.find((o) => !String(o.className).includes('npc-overlay'))
    || null;
}

// Строка действия buildingUI по id (dataset.buid).
function findRow(overlay, id) {
  return findAll(overlay, '[data-buid]')
    .find((r) => r.dataset.buid === id) || null;
}

// Клик по строке: ЕДИНСТВЕННЫЙ делегированный обработчик оверлея
// (overlay.listeners.click[0]({target: row})).
function clickRow(h, overlay, id) {
  const clickers = overlay.listeners.click || [];
  assert.ok(clickers.length >= 1,
    'на оверлее есть делегированный click-обработчик');
  const row = findRow(overlay, id);
  assert.ok(row, 'строка действия ' + id + ' найдена в оверлее');
  clickers[0]({ target: row });
  return row;
}

// Пикер 000162 — СВОЙ класс .resurrect-overlay (НЕ .combat-overlay,
// R-12: чужие findOverlay не видят его).
function findResurrectOverlay(h) {
  return findAll(h.body, '.resurrect-overlay')[0] || null;
}

// --- Герой и погибшие (seed) ---

// Герой с ядром createCharacter (player.js).
function mkHero(over = {}) {
  return Object.assign(P.createCharacter(), over);
}

// Запись о погибшем (000161, форма сейва 000143): {npcId, sheet,
// loyalty, hiredDay}; level/xp ВНУТРИ sheet. sheet — из каталога
// найма (primary/secondary/spells — явные уровни, 000141) + числа
// из over (over.sheet / over.loyalty / over.hiredDay).
function deadRecord(npcId, over = {}) {
  const npc = NPCS.find((n) => n.id === npcId);
  assert.ok(npc && npc.найм, 'тест: каталожный NPC с наймом: ' + npcId);
  const h = npc.найм;
  const secondary = {};
  for (const [id, lv] of Object.entries(h.начальные_навыки || {})) {
    if (Number.isInteger(lv) && lv >= 1) secondary[id] = lv;
  }
  // Канонический merc-лист — 10 ключей (000140/000143, §2.6):
  // kind, level, xp, totalXp, points, primary{6}, secondary, skillXp,
  // spells, npcId (sanitizeMercSheet: sheet.npcId === npcId записи —
  // иначе revive → null → запись отброшена как подделка).
  const sheet = Object.assign({
    kind: 'merc',
    level: 1, xp: 0, totalXp: 0, points: 0,
    primary: Object.assign({}, h.базовые_характеристики),
    secondary,
    skillXp: {},
    spells: (h.spells || []).slice(),
    npcId: npcId,
  }, over.sheet);
  const rec = { npcId, sheet, loyalty: 70, hiredDay: 5 };
  if (over.loyalty !== undefined) rec.loyalty = over.loyalty;
  if (over.hiredDay !== undefined) rec.hiredDay = over.hiredDay;
  return rec;
}

// --- Ход игрока (протокол building-effects B-секция) ---
// BFS до храма 36 по правилам игрока (4 направления, passable, без
// групп мобов/пещер/городов); на каждый шаг keydown → кадры +200 мс
// (один кадр ≤ один ход) → keyup. 000135: zone-бой по маршруту —
// авторазрешение (мобы 9999 → Space).

function findTempleById(G, myMap, start, wantId) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const startKey = start.x + ',' + start.y;
  const visited = new Set([startKey]);
  const prev = new Map();
  let frontier = [{ x: start.x, y: start.y }];
  for (let depth = 0; depth < 400 && frontier.length; depth++) {
    const next = [];
    for (const cur of frontier) {
      for (const [dx, dy] of DIRS) {
        const nx = cur.x + dx, ny = cur.y + dy;
        const k = nx + ',' + ny;
        if (visited.has(k)) continue;
        const t = myMap.tileAt(nx, ny);
        if (!t.passable || t.hasMobGroup) continue;
        if (t.hasBuilding) {
          if (t.building === G.BUILDING_TYPES.CAVE_ENTRANCE) continue;
          if (t.building === G.BUILDING_TYPES.NONE) continue; // город
        }
        visited.add(k);
        prev.set(k, cur.x + ',' + cur.y);
        if (t.hasBuilding && t.building === G.BUILDING_TYPES.TEMPLE
            && t.buildingId === wantId) {
          const steps = [];
          let kk = k;
          while (kk !== startKey) {
            const [px, py] = kk.split(',').map(Number);
            steps.unshift([px, py]);
            kk = prev.get(kk);
          }
          return { tile: t, steps };
        }
        next.push({ x: nx, y: ny });
      }
    }
    frontier = next;
  }
  return null;
}

function walkTo(h, steps) {
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  let now = NOW;
  for (let i = 0; i < steps.length; i++) {
    const [fx, fy] = i === 0
      ? [g.state.player.x, g.state.player.y]
      : steps[i - 1];
    const [tx, ty] = steps[i];
    const dx = tx - fx, dy = ty - fy;
    assert.ok(Math.abs(dx) + Math.abs(dy) === 1, 'BFS: шаг по соседнему');
    const code = dx === 1 ? 'ArrowRight' : dx === -1 ? 'ArrowLeft'
      : dy === 1 ? 'ArrowDown' : 'ArrowUp';
    const e = { code, preventDefault() {}, stopPropagation() {} };
    for (const fn of (h.winListeners['keydown'] || []).slice()) fn(e);
    let guard = 0;
    do {
      now += 200;
      h.raf[h.raf.length - 1](now);
    } while ((g.state.player.x !== tx || g.state.player.y !== ty)
      && ++guard < 12);
    for (const fn of (h.winListeners['keyup'] || []).slice()) fn(e);
    assert.ok(g.state.player.x === tx && g.state.player.y === ty,
      `сценарий: игрок не перешёл на (${tx},${ty}) за ${guard} кадров`);
    if (G.combatUI.isActive()) {
      // 000135: zone-бой по маршруту — авторазрешение (Эфир НЕ
      // убиваем — ассерты про воскрешение, не про бой).
      const c = G.combatUI.current();
      for (const m of c.units.filter((x) => x.side === 'mob'
          && x.alive)) {
        G.combatInternals.dealDamageToMob(c, m, 9999);
      }
      assert.ok(c.result && c.result.outcome === 'victory',
        '000135: zone-бой по маршруту — победа');
      G.combatUI.handleCode('Space');
      assert.equal(G.combatUI.isActive(), false,
        '000135: zone-бой закрыт (Space → finish)');
    }
  }
  for (let i = 0; i < 4; i++) {
    now += 200;
    h.raf[h.raf.length - 1](now);
  }
  return now;
}

// --- Сценарий: храм солнца (36) → [E] → «Воскрешение» → пикер
// (Enter НЕ давим — его даёт тест). Красная точка: findRow
// 'resurrect' → null (услуги в оверлее нет — 000162). ---

function openPicker(h, G, g) {
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findTempleById(G, myMap, g.state.player, 36);
  assert.ok(found, 'сценарий: достижимый храм солнца (buildingId 36)');
  assert.ok(found.steps.length > 0, 'сценарий: путь не пуст');
  walkTo(h, found.steps);
  const t = myMap.tileAt(g.state.player.x, g.state.player.y);
  assert.equal(t.buildingId, 36, 'игрок на храме солнца');
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, '[E] открывает buildingUI');
  const ov = findOverlay(h);
  assert.ok(ov, 'оверлей подвешен к body');
  const row = findRow(ov, 'resurrect');
  assert.ok(row,
    'строка «Воскрешение» (id resurrect) в оверлее buildingUI — 000162');
  return { ov, row };
}

// =====================================================================
// RES-E1..E5
// =====================================================================

test('RES-E1. полный цикл: dead_mercs (Вольк 3/100) → храм 36 → [E] → «Воскрешение» → пикер → Enter: gold БАЗА−25 (цена ∝ опыту, D2; БАЗА — gold после walk), roster 6 ключей (зеркала 3/100), deadMercs [], сейв (companions/dead_mercs), без марки «…:resurrect», flash, пикер закрыт', async () => {
  const h = await boot(seedSave({
    day: 5,
    hero: mkHero({ gold: 100 }),
    companions: [],
    dead_mercs: [deadRecord('merc_volk', {
      sheet: { level: 3, xp: 100, totalXp: 100 },
    })],
  }));
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.ok(g && g.state.map && g.state.player,
    'игра стартовала (boot прошёл)');
  assert.equal(g.state.day, 5, 'день мира из сейва (boot не вакуумный)');
  // Seed восстановлен: live deadMercs — 1 запись (свежая копия,
  // revive→serialize, 000161).
  assert.ok(Array.isArray(g.state.deadMercs), 'deadMercs — live-массив');
  let dead = host(g.state.deadMercs);
  assert.equal(dead.length, 1, 'deadMercs — 1 запись (seed)');
  assert.equal(dead[0].npcId, 'merc_volk', 'запись — merc_volk');
  assert.equal(dead[0].sheet.totalXp, 100, 'sheet.totalXp 100 (цена)');
  assert.equal(dead[0].loyalty, 70, 'loyalty 70');
  assert.equal(dead[0].hiredDay, 5, 'hiredDay 5');
  assert.equal(g.state.hero.gold, 100, 'gold 100 (seed)');
  // Храм → [E] → строка → клик.
  const { ov } = openPicker(h, G, g);
  assert.equal(findResurrectOverlay(h), null,
    'до клика пикера нет (оверлей — buildingUI)');
  // БАЗА — gold ПОСЛЕ walk: zone-бой у спавна (000135) авто-
  // разрешается в walkTo и детерминированно даёт лут (L1: +53) —
  // ассерты далее по ДЕЛЬТЕ от базы (зелёная стадия 000162).
  const goldBase = g.state.hero.gold;
  clickRow(h, ov, 'resurrect');
  assert.equal(G.buildingUI.isActive(), false,
    'buildingUI закрылся (executeAction: close ДО onAction)');
  // Пикер открыт: строка — «имя · ур. N · M оп.» + цена «−K зол.»,
  // курсор — на первой строке ('▸ ').
  const rov = findResurrectOverlay(h);
  assert.ok(rov, 'пикер .resurrect-overlay открыт');
  const rows = findAll(rov, '.resurrect-row');
  assert.equal(rows.length, 1, 'пикер — 1 строка');
  const rt = textOf(rows[0]);
  assert.ok(rt.includes('Вольк'), 'строка — имя: ' + rt);
  assert.ok(rt.includes('ур. 3'), 'строка — уровень 3: ' + rt);
  assert.ok(rt.includes('100 оп.'), 'строка — опыт 100: ' + rt);
  assert.ok(rt.includes('−25 зол.'),
    'строка — цена −25 (round(20 + 0.05×100), D2): ' + rt);
  assert.ok(rt.includes('▸ '), 'курсор на первой строке: ' + rt);
  // Enter — подтверждение единственного кандидата.
  key(h, 'Enter');
  // Золото: БАЗА − 25 (цена ∝ опыту, D2: round(20 + 0.05×100)).
  assert.equal(g.state.hero.gold, goldBase - 25,
    'gold БАЗА − 25 (цена ∝ опыту, D2)');
  // Live roster — 1 запись 6 ключей (000161/000143): зеркала 3/100.
  const roster = host(g.state.roster);
  assert.equal(roster.length, 1, 'roster — 1 запись');
  assert.deepEqual(Object.keys(roster[0]).sort(),
    ['hiredDay', 'level', 'loyalty', 'npcId', 'sheet', 'xp'],
    'runtime-запись — ровно 6 ключей (000161/000143)');
  assert.equal(roster[0].npcId, 'merc_volk', 'roster[0].npcId');
  assert.equal(roster[0].level, 3, 'зеркало level 3 (из record.sheet)');
  assert.equal(roster[0].xp, 100, 'зеркало xp 100 (из record.sheet)');
  assert.equal(roster[0].loyalty, 70, 'loyalty 70 (из записи)');
  assert.equal(roster[0].hiredDay, 5, 'hiredDay 5 (из записи)');
  assert.equal(roster[0].sheet.level, 3, 'sheet.level 3');
  assert.equal(roster[0].sheet.xp, 100, 'sheet.xp 100');
  assert.equal(roster[0].sheet.totalXp, 100, 'sheet.totalXp 100');
  // Запись УДАЛЕНА из live deadMercs (splice, инвариант 000085).
  dead = host(g.state.deadMercs);
  assert.equal(dead.length, 0,
    'запись удалена из live deadMercs (splice, 000085)');
  // saveNow (confirm — единственная точка): dead_mercs [],
  // companions — воскрешённый (4 поля, 000143).
  const save = readSave(h);
  assert.ok(save, 'saveNow — сейв записан');
  assert.deepEqual(save.data.dead_mercs, [], 'сейв: dead_mercs — []');
  assert.equal(save.data.companions.length, 1, 'сейв: companions — 1');
  assert.equal(save.data.companions[0].npcId, 'merc_volk',
    'сейв: companions[0].npcId');
  assert.equal(save.data.companions[0].sheet.level, 3,
    'сейв: sheet.level 3');
  assert.equal(save.data.companions[0].sheet.xp, 100, 'сейв: sheet.xp 100');
  assert.equal(save.data.companions[0].loyalty, 70, 'сейв: loyalty 70');
  assert.equal(save.data.companions[0].hiredDay, 5, 'сейв: hiredDay 5');
  assert.equal(save.data.hero.gold, goldBase - 25,
    'сейв: gold БАЗА − 25');
  // R-4: марок раз-в-день НЕ ЖГУТ (услуга без лимита).
  assert.ok(!Object.keys(save.data.buildingOncePerDay || {}).some(
      (k) => k.endsWith(':resurrect')),
    'сейв: в buildingOncePerDay нет ключей «…:resurrect» (R-4)');
  // Flash: «<имя> снова в отряде.» (gender-neutral, Q-4).
  mainFrameAt(h, NOW + 600);
  const hud = String(h.hud.textContent);
  assert.ok(hud.includes('Вольк снова в отряде.'),
    'flash «<имя> снова в отряде.»: ' + hud);
  // Пикер закрыт после успеха.
  assert.equal(findResurrectOverlay(h), null,
    'пикер закрыт после успеха');
});

test('RES-E2. повторная гибель: после воскрешения (E1) гибель в бою → deadMercs снова получает запись (3/100/70/5 — НЕ «призрак» L1/xp0), roster 0, npcId-уникальность (000161)', async () => {
  const h = await boot(seedSave({
    day: 5,
    hero: mkHero({ level: 8, hp: 200, gold: 100 }),
    companions: [],
    dead_mercs: [deadRecord('merc_volk', {
      sheet: { level: 3, xp: 100, totalXp: 100 },
    })],
  }));
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.ok(g && g.state.map, 'игра стартовала (boot прошёл)');
  // Сценарий E1: воскрешение. БАЗА — gold после walk (L8 соло:
  // zone-дроп 000135 +125 → 225) — ассерт по дельте (000162).
  const { ov } = openPicker(h, G, g);
  const goldBase = g.state.hero.gold;
  clickRow(h, ov, 'resurrect');
  key(h, 'Enter');
  assert.equal(g.state.hero.gold, goldBase - 25,
    'E1: gold БАЗА − 25 (цена ∝ опыту, D2)');
  assert.equal(host(g.state.roster).length, 1, 'E1: roster — 1');
  assert.equal(host(g.state.deadMercs).length, 0, 'E1: deadMercs — []');
  // Gибель воскрешённого в бою (паттерн V5 companions-cycle:
  // мутация живого объекта боя → onEnd → deadMercs-запись).
  const c = g.actions.startCombat(0);
  assert.ok(c, 'бой начался (startCombat → combat)');
  const u = (c.units || []).find((x) => x && x.side === 'ally'
    && x.kind === 'merc');
  assert.ok(u, 'в c.units — merc (Вольк)');
  assert.equal(u.id, 'merc_volk');
  assert.equal(u.level, 3,
    'level в бою — из записи отряда (зеркало 3, 000082)');
  u.alive = false;
  u.hp = 0;
  c.phase = 'over';
  c.result = { outcome: 'victory', xp: 50, gold: 1, defeated: 1,
    allyXp: [] };
  G.combatUI.handleCode('Escape');
  assert.equal(G.combatUI.isActive(), false, 'бой закрыт (finish → onEnd)');
  // Запись ПОВТОРНО: sheet воскрешённого (3/100), НЕ backfill L1/xp0.
  const dead = host(g.state.deadMercs);
  assert.equal(dead.length, 1,
    'deadMercs: запись получена снова (повторная гибель)');
  assert.equal(dead[0].npcId, 'merc_volk', 'запись — merc_volk');
  assert.equal(dead[0].sheet.level, 3,
    'sheet.level 3 (запись воскрешённого, НЕ «призрак» L1/xp0)');
  assert.equal(dead[0].sheet.xp, 100, 'sheet.xp 100');
  assert.equal(dead[0].sheet.totalXp, 100, 'sheet.totalXp 100');
  assert.equal(dead[0].loyalty, 70, 'loyalty 70 (из записи)');
  assert.equal(dead[0].hiredDay, 5, 'hiredDay 5 (из записи)');
  assert.equal(host(g.state.roster).length, 0,
    'roster: запись удалена (splice)');
  // npcId-уникальность (000161): дублей записи НЕТ.
  assert.equal(
    dead.filter((d) => d.npcId === 'merc_volk').length, 1,
    'npcId-уникальность: ровно одна запись merc_volk (000161)');
});

test('RES-E3. «мало золота» в confirm: 2 кандидата (25/70), gold 50 → дорогой: отказ (flash «мало золота», нулевые мутации, пикер ОТКРЫТ — Q-2) → ArrowUp → дешёвый: успех (gold 25, deadMercs 1 — дорогой остался, roster 1)', async () => {
  const h = await boot(seedSave({
    day: 5,
    // Seed 10: после walk (L1 zone-дроп 000135 +53) БАЗА = 63 —
    // МЕЖДУ 25 (Вольк) и 70 (Ашка): дорогая → «мало золота» (Q-2),
    // дешёвая → успех (зелёная стадия 000162).
    hero: mkHero({ gold: 10 }),
    companions: [],
    dead_mercs: [
      deadRecord('merc_volk', { sheet: { level: 3, xp: 100, totalXp: 100 } }),
      deadRecord('merc_ashka', { sheet: { level: 10, xp: 1000, totalXp: 1000 } }),
    ],
  }));
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.ok(g && g.state.map, 'игра стартовала (boot прошёл)');
  assert.equal(host(g.state.deadMercs).length, 2, 'deadMercs — 2 (seed)');
  // Пикер: 2 строки, порядок = порядок dead_mercs.
  const { ov } = openPicker(h, G, g);
  // БАЗА — gold после walk (L1: +53 → 63): ассерты по дельте.
  const goldBase = g.state.hero.gold;
  clickRow(h, ov, 'resurrect');
  const rov = findResurrectOverlay(h);
  assert.ok(rov, 'пикер открыт');
  const rows = findAll(rov, '.resurrect-row');
  assert.equal(rows.length, 2, 'пикер — 2 строки');
  const r0 = textOf(rows[0]);
  const r1 = textOf(rows[1]);
  assert.ok(r0.includes('Вольк') && r0.includes('−25 зол.'),
    'строка 1 — Вольк, цена 25: ' + r0);
  assert.ok(r1.includes('Ашка') && r1.includes('−70 зол.'),
    'строка 2 — Ашка, цена 70 (round(20 + 0.05×1000)): ' + r1);
  // ArrowDown → курсор на дорогой (Ашка) → Enter → отказ.
  key(h, 'ArrowDown');
  assert.ok(textOf(rows[1]).includes('▸ '),
    'курсор → строка 2 (ArrowDown): ' + textOf(rows[1]));
  assert.ok(!textOf(rows[0]).includes('▸ '), 'курсор снят со строки 1');
  key(h, 'Enter');
  mainFrameAt(h, NOW + 400);
  let hud = String(h.hud.textContent);
  assert.ok(hud.includes('мало золота'),
    'flash «мало золота» (БАЗА < 70, проверка ДО мутации): ' + hud);
  // НУЛЕВЫЕ мутации.
  assert.equal(g.state.hero.gold, goldBase,
    'gold — не списан (БАЗА)');
  assert.equal(host(g.state.roster).length, 0, 'roster — пуст (push не было)');
  assert.equal(host(g.state.deadMercs).length, 2,
    'deadMercs — 2 (splice не было)');
  // Q-2: пикер ОТКРЫТ после отказа (выбрать дешевле / Esc).
  assert.ok(findResurrectOverlay(h),
    'пикер остался ОТКРЫТЫМ после отказа (Q-2)');
  // ArrowUp → дешёвый (Вольк) → Enter → успех.
  key(h, 'ArrowUp');
  assert.ok(textOf(rows[0]).includes('▸ '),
    'курсор → строка 1 (ArrowUp): ' + textOf(rows[0]));
  key(h, 'Enter');
  assert.equal(g.state.hero.gold, goldBase - 25,
    'gold БАЗА − 25 (дешёвый)');
  const roster = host(g.state.roster);
  assert.equal(roster.length, 1, 'roster — 1');
  assert.equal(roster[0].npcId, 'merc_volk', 'воскрешён — дешёвый');
  assert.equal(roster[0].level, 3, 'зеркало level 3');
  assert.equal(roster[0].xp, 100, 'зеркало xp 100');
  const dead = host(g.state.deadMercs);
  assert.equal(dead.length, 1, 'deadMercs — 1');
  assert.equal(dead[0].npcId, 'merc_ashka', 'дорогая запись осталась');
  assert.equal(findResurrectOverlay(h), null,
    'пикер закрыт после успеха');
  // Сейв (saveNow confirm).
  const save = readSave(h);
  assert.ok(save, 'saveNow — сейв записан');
  assert.equal(save.data.hero.gold, goldBase - 25,
    'сейв: gold БАЗА − 25');
  assert.deepEqual(
    (save.data.dead_mercs || []).map((d) => d.npcId), ['merc_ashka'],
    'сейв: в dead_mercs осталась дорогая запись');
  assert.equal(save.data.companions.length, 1, 'сейв: companions — 1');
  assert.equal(save.data.companions[0].npcId, 'merc_volk',
    'сейв: companions[0] — воскрешённый');
});

test('RES-E4. «отряд полон»: roster 3 (cap max_companions) + 1 погибший → строка resurrect ДСТУПНА (кап НЕ часть available) → flash «отряд полон»; пикера нет, мутаций нет, марка «…:resurrect» не сгорела', async () => {
  const h = await boot(seedSave({
    day: 5,
    hero: mkHero({ level: 8, hp: 200, gold: 100 }),
    companions: [
      { npcId: 'merc_volk', level: 1, xp: 0, loyalty: 65, hiredDay: 2 },
      { npcId: 'merc_ashka', level: 1, xp: 0, loyalty: 65, hiredDay: 2 },
      { npcId: 'merc_baldor', level: 1, xp: 0, loyalty: 65, hiredDay: 2 },
    ],
    dead_mercs: [deadRecord('merc_mira', {
      sheet: { level: 2, xp: 20, totalXp: 20, points: 2 },
      loyalty: 75,
      hiredDay: 4,
    })],
  }));
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.ok(g && g.state.map, 'игра стартовала (boot прошёл)');
  assert.equal(host(g.state.roster).length, 3,
    'roster — 3 (cap max_companions = 3)');
  assert.equal(host(g.state.deadMercs).length, 1, 'deadMercs — 1');
  // Храм → [E]: строка 'resurrect' ДСТУПНА — погибшие ЕСТЬ (кап
  // проверяет resurrectPick/confirm, НЕ available, R-2).
  const { ov, row } = openPicker(h, G, g);
  // БАЗА — gold после walk (L8 + 3 спутника: zone-дроп 000135 +122).
  const goldBase = g.state.hero.gold;
  assert.equal(row.disabled, false,
    'строка доступна (погибшие есть; «отряд полон» — НЕ reason available)');
  clickRow(h, ov, 'resurrect');
  assert.equal(G.buildingUI.isActive(), false,
    'buildingUI закрылся (действие доступно)');
  // Отказ: flash «отряд полон»; пикера нет; мутаций нет.
  mainFrameAt(h, NOW + 400);
  const hud = String(h.hud.textContent);
  assert.ok(hud.includes('отряд полон'),
    'flash «отряд полон»: ' + hud);
  assert.equal(findResurrectOverlay(h), null,
    'пикер НЕ открыт (cap-проверка ДО openPicker)');
  assert.equal(g.state.hero.gold, goldBase, 'gold — без изменений (БАЗА)');
  assert.equal(host(g.state.roster).length, 3, 'roster — 3 (push не было)');
  assert.equal(host(g.state.deadMercs).length, 1,
    'deadMercs — 1 (splice не было)');
  // Отказ НЕ жжёт марку раз-в-день (BA4(d): flash без mark/saveNow).
  const save = readSave(h);
  assert.ok(save, 'сейв — seed в хранилище');
  assert.ok(!Object.keys(save.data.buildingOncePerDay || {}).some(
      (k) => k.endsWith(':resurrect')),
    'сейв: в buildingOncePerDay нет «…:resurrect» (отказ не жжёт марку)');
});

test('RES-E5. «нет погибших»: dead_mercs [] → строка resurrect disabled + reason; нажатие → НОЛЬ (пикера нет, flash нет, сейв не писан, buildingUI открыт → Esc)', async () => {
  const h = await boot(seedSave({
    day: 5,
    hero: mkHero({ level: 8, hp: 200, gold: 100 }),
    companions: [],
    dead_mercs: [],
  }));
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.ok(g && g.state.map, 'игра стартовала (boot прошёл)');
  assert.equal(host(g.state.deadMercs).length, 0,
    'deadMercs — пусто (seed)');
  // Храм → [E]: строка 'resurrect' есть, НО disabled + reason.
  const { ov, row } = openPicker(h, G, g);
  assert.equal(row.disabled, true, 'нет погибших — строка disabled');
  assert.ok(textOf(row).includes('нет погибших'),
    'reason «нет погибших» виден в строке: ' + textOf(row));
  // Нажатие (делегированный клик) — НОЛЬ: disabled-строка не
  // выполняется (onOverlayClick/executeAction — ignore).
  const clickers = ov.listeners.click || [];
  assert.ok(clickers.length >= 1,
    'на оверлее есть делегированный click-обработчик');
  clickers[0]({ target: row });
  assert.equal(G.buildingUI.isActive(), true,
    'buildingUI остаётся открытым (disabled — без действия)');
  assert.equal(findResurrectOverlay(h), null, 'пикера нет');
  mainFrameAt(h, NOW + 400);
  const hud = String(h.hud.textContent);
  assert.ok(!hud.includes('мало золота') && !hud.includes('отряд полон'),
    'flash нет (ничего не выполнялось): ' + hud);
  // Сейв не писан: в buildingOncePerDay нет ':resurrect' (марка не
  // сгорела — ничего не выполнялось).
  const save = readSave(h);
  assert.ok(save, 'сейв — seed в хранилище');
  assert.deepEqual(save.data.dead_mercs, [], 'сейв: dead_mercs — []');
  assert.ok(!Object.keys(save.data.buildingOncePerDay || {}).some(
      (k) => k.endsWith(':resurrect')),
    'сейв: в buildingOncePerDay нет «…:resurrect»');
  // Esc закрывает buildingUI.
  key(h, 'Escape');
  assert.equal(G.buildingUI.isActive(), false,
    'оверлей закрыт (Esc)');
});

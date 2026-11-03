// Задача 000299.01 — «Активный персонаж» в контексте постройки:
// переиспользуемый контракт + иконки Флогистон/Эфир/наёмные в оверлее
// [E] (src/building-ui.js) и диалоге NPC (npcUI, src/ui.js).
//
// ТЗ — tasks/pending/000299.01.md; контракт (ID-пространство
// 'flogiston'|'efir'|npcId, per-session В СЕЙВЕ НЕТ, fallback тихо на
// Флогистона, Эфир-гейт efirMet, точки разрешения) — H2 «Активный
// персонаж» spec/companions.md (тот же коммит).
//
// КРАСНЫЕ (до — красные, осмысленно: функциональности нет —
// setActiveCharId undefined, ряд .cp-portraits не рисуется, клик по
// портрету — no-op):
//   * AC1–AC4: Game.playerUI.setActiveCharId — публичный сеттер
//     (идемпотентен, БЕЗ открытия/закрытия панели [I], без saveNow) +
//     ряд в оверлее [E] (N button.cp-portrait[data-memberid], активный
//     — cp-portrait-active, img 'assets/portraits/<icon>', title
//     «имя — роль») + клик (активный сменился, оверлей НЕ закрыт,
//     onAction не зван, saveNow не зван, узел ряда тот же — in place);
//   * AC5: Эфир-гейт: efirMet=false → иконки Эфира НЕТ; stale id
//     'efir' → активный = Флогистон (тихо, без нового console.error);
//   * AC6–AC8: деградация (000053): без PortraitsData — ряд не
//     рисуется + console.error ровно 1× + без краха (восстановление —
//     ряд рисуется снова); без __game — ряд не рисуется, без краха;
//     без Party — hero-фолбэк (1 button 'flogiston'), тихо;
//   * AC9: NPC-диалог — ряд .cp-portraits над рядом вкладок; клик —
//     активный сменился, оверлей НЕ закрыт, saveNow не зван;
//   * AC10–AC11: регрессия (зелёные с нуля — защита существующего
//     роутинга): строка действия — onAction + закрытие; кнопка
//     «закрыть»/Esc — закрытие.
//
// payload openNpcDialog побайтово (character: hero, roster, deadMercs)
// — существующее покрытие W1/BA2 tests/building-actions.test.js;
// building-actions.js в задаче 0-diff (SCOPE-ЛИМИТЫ ТЗ).
//
// vm-песочница — цепочка index.html БЕЗ main.js (паттерн
// tests/ui-tab-skills-active.test.js: main.js не в цепочке — точку
// __game ставит ТЕСТ; __game.state в main.js — getter-снимок с
// скалярными полями — управление efirMet/roster через него
// невозможно). DOM/WebGL/localStorage-стабы — bootSandbox
// (tests/building-actions.test.js). saveNow — наблюдение через
// setItem(SAVE_KEY) localStorage-мока (дельта до/после).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { SAVE_KEY } = require('../src/save.js');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''))
  .filter((f) => f !== 'main.js');
const NOW = 1000;

// --- WebGL-стаб (main.js: compile/link/буферы; как save-restore) ---

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

// --- Снисходительный DOM-элемент с деревом (как
// tests/building-actions.test.js: children/parent/dataset/closest —
// нужен для делегированного клика по оверлею). ---

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

// --- localStorage-мок (сейвы реально пишутся/читаются) ---

function makeStorage(seed) {
  const m = new Map();
  if (seed != null) m.set(SAVE_KEY, JSON.stringify(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// --- Песочница: вся цепочка index.html ---

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
  return { sandbox, winListeners, raf, errors, storage, body, hud };
}

const drain = () => new Promise((r) => setImmediate(r));

async function boot() {
  const h = bootSandbox();
  await drain();
  await drain();
  await drain();
  return h;
}

// --- Хелперы задачи ---

const ROSTER_2 = () => [
  { npcId: 'merc_volk', level: 1, xp: 0, loyalty: 50, hiredDay: 1,
    sheet: { level: 1, xp: 0 } },
  { npcId: 'merc_ashka', level: 1, xp: 0, loyalty: 50, hiredDay: 1,
    sheet: { level: 1, xp: 0 } },
];

// Мировое состояние — подконтрольное ТЕСТУ (main.js не в цепочке:
// его __game.state — getter-снимок, управление через него
// невозможно). hero — ПОЛНЫЙ live-персонаж (G.createCharacter:
// primary/secondary — для dialogOptions в NPC-диалоге).
function seedWorld(h, over = {}) {
  const G = h.sandbox.Game;
  const state = {
    player: { x: 1, y: 1 },
    day: 1,
    hero: over.hero !== undefined ? over.hero
      : G.createCharacter('Флогистон'),
    efir: over.efir !== undefined ? over.efir : { level: 1 },
    efirMet: over.efirMet !== undefined ? over.efirMet : true,
    roster: over.roster !== undefined ? over.roster : ROSTER_2(),
    deadMercs: [],
  };
  h.sandbox.__game = { state: state };
  return state;
}

// Партия для тестов: по умолчанию Эфир встречен + 2 наёмных.
async function bootWithParty(over) {
  const h = await boot();
  seedWorld(h, over);
  return h;
}

// saveNow — дельта setItem(SAVE_KEY) до/после операции.
function trackSaves(h) {
  let saves = 0;
  const orig = h.storage.setItem;
  h.storage.setItem = (k, v) => {
    if (k === SAVE_KEY) saves++;
    return orig(k, v);
  };
  return () => saves;
}

function lastOverlay(h) {
  const ch = h.body.children;
  return ch[ch.length - 1];
}

function openBuilding(h, opts = {}) {
  const G = h.sandbox.Game;
  const acted = [];
  G.buildingUI.open(Object.assign({
    title: 'Тестовая постройка',
    actions: [{ id: 'dlg', имя: 'Диалог', доступен: true }],
    onAction: (a) => acted.push(a),
  }, opts));
  return { G, acted, overlay: lastOverlay(h) };
}

test('AC1. Game.playerUI.setActiveCharId — публичный сеттер (задача 000299.01)', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  assert.ok(G.playerUI, 'Game.playerUI на месте');
  assert.equal(typeof G.playerUI.setActiveCharId, 'function',
    'setActiveCharId — функция (контракт: публичный сеттер активного)');
});

test('AC2. сеттер: идемпотентен, БЕЗ открытия/закрытия панели [I], без saveNow (000299.01)', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const saves = trackSaves(h);
  assert.equal(G.playerUI.isOpen(), false, 'панель [I] закрыта до');
  assert.equal(G.playerUI.getActiveCharId(), null, 'дефолт — null');
  G.playerUI.setActiveCharId('merc_volk');
  G.playerUI.setActiveCharId('merc_volk');
  assert.equal(G.playerUI.getActiveCharId(), 'merc_volk',
    'id записан (строка)');
  assert.equal(G.playerUI.isOpen(), false,
    'сеттер НЕ открывает панель [I] (toggle НЕ используется)');
  G.playerUI.setActiveCharId(null);
  assert.equal(G.playerUI.getActiveCharId(), null,
    'null — сброс на дефолт (Флогистон)');
  assert.equal(saves(), 0, 'saveNow не зван (per-session, в сейв НЕ ПИШЕТСЯ)');
});

test('AC3. оверлей [E]: ряд .cp-portraits перед .cp-items, N портретов, активный (000299.01)', async () => {
  const h = await bootWithParty();
  const { G, overlay } = openBuilding(h);
  const side = overlay.children[0];
  const row = overlay.querySelector('.cp-portraits');
  assert.ok(row, 'ряд .cp-portraits на месте (контракт DOM)');
  const idxRow = side.children.indexOf(row);
  const idxList = side.children.findIndex(
    (ch) => String(ch.className).includes('cp-items'));
  assert.ok(idxRow >= 0 && idxList >= 0 && idxRow < idxList,
    'ряд — В .combat-side ПЕРЕД строками действий');
  const btns = row.querySelectorAll('button.cp-portrait');
  assert.equal(btns.length, 4,
    '4 портрета: Флогистон + Эфир (efirMet) + 2 наёмных (roster)');
  assert.deepEqual(
    btns.map((b) => b.dataset.memberid),
    ['flogiston', 'efir', 'merc_volk', 'merc_ashka'],
    'ID-пространство: flogiston | efir | npcId, порядок партии');
  const f = btns[0];
  assert.ok(String(f.className).includes('cp-portrait-active'),
    'дефолт активный — Флогистон (первый member)');
  assert.equal(String(btns[1].className), 'cp-portrait',
    'остальные — без -active');
  for (const b of btns) {
    const img = b.querySelector('img');
    assert.ok(img, 'у портрета <img>');
    assert.ok(String(img.src).startsWith('assets/portraits/'),
      'префикс assets/portraits/ у потребителя');
    assert.ok(img.alt, 'alt — имя member');
    assert.ok(b.title.includes(' — '),
      'title — «имя — роль»');
  }
  assert.equal(f.querySelector('img').src,
    'assets/portraits/flogiston.svg', 'иконка героя из каталога 000142');
  assert.equal(btns[2].querySelector('img').src,
    'assets/portraits/npc-000012.svg', 'иконка наёмного из каталога');
  assert.ok(btns[2].title.startsWith('Вольк'),
    'имя наёмного — из каталога NPC (000012 — Вольк)');
  assert.equal(btns[0].title, 'Флогистон — Герой', 'title героя');
  assert.ok(G.buildingUI.isActive(), 'оверлей открыт');
});

test('AC4. клик по портрету: активный сменился, оверлей не закрыт, действие не звано, saveNow не зван, ряд in place (000299.01)', async () => {
  const h = await bootWithParty();
  const saves = trackSaves(h);
  const { G, acted, overlay } = openBuilding(h);
  const row = overlay.querySelector('.cp-portraits');
  const volk = row.querySelectorAll('button.cp-portrait')
    .find((b) => b.dataset.memberid === 'merc_volk');
  assert.ok(volk, 'кнопка наёмного найдена');
  overlay.listeners.click[0]({ target: volk });
  assert.equal(G.playerUI.getActiveCharId(), 'merc_volk',
    'клик — setActiveCharId(npcId)');
  assert.equal(G.buildingUI.isActive(), true,
    'оверлей НЕ закрывается (отдельная ветка делегирования)');
  assert.equal(acted.length, 0,
    'действие постройки НЕ выполняется (executeAction не вызван)');
  assert.equal(saves(), 0, 'saveNow/flash не званы');
  assert.equal(overlay.querySelector('.cp-portraits'), row,
    'in-place: узел ряда тот же (оверлей не пересобирается)');
  const btns2 = row.querySelectorAll('button.cp-portrait');
  const volk2 = btns2.find((b) => b.dataset.memberid === 'merc_volk');
  assert.ok(String(volk2.className).includes('cp-portrait-active'),
    'активный — перерисован на кликнутого');
  const f2 = btns2.find((b) => b.dataset.memberid === 'flogiston');
  assert.equal(String(f2.className), 'cp-portrait',
    'прежний активный — снят');
});

test('AC5. Эфир-гейт: efirMet=false → иконки НЕТ; stale id «efir» → тихо Флогистон (000299.01)', async () => {
  const h = await bootWithParty({
    efirMet: false,
    roster: [ROSTER_2()[0]],
  });
  const st = h.sandbox.__game.state;
  assert.equal(st.efirMet, false, 'сид: Эфир не встречен');
  const { G, overlay } = openBuilding(h);
  const ids = overlay.querySelectorAll('button.cp-portrait')
    .map((b) => b.dataset.memberid);
  assert.deepEqual(ids, ['flogiston', 'merc_volk'],
    'Эфир в партии ТОЛЬКО при efirMet === true');
  // stale id: активным выбран «efir», а Эфир не встречен.
  const before = h.errors.length;
  G.playerUI.setActiveCharId('efir');
  const { overlay: overlay2 } = openBuilding(h);
  const btns = overlay2.querySelectorAll('button.cp-portrait');
  const f = btns.find((b) => b.dataset.memberid === 'flogiston');
  assert.ok(String(f.className).includes('cp-portrait-active'),
    'stale «efir» — тихий fallback на Флогистона (Party.active)');
  assert.equal(h.errors.length, before,
    'fallback ТИХИЙ — без console.error');
  G.playerUI.setActiveCharId(null);
});

test('AC6. деградация: без PortraitsData — ряд не рисуется, console.error ровно 1×, без краха (000053)', async () => {
  const h = await bootWithParty();
  const G = h.sandbox.Game;
  const PD = G.PortraitsData;
  delete G.PortraitsData;
  const before = h.errors.length;
  let threw = false;
  let overlay = null;
  try {
    ({ overlay } = openBuilding(h));
  } catch (err) {
    threw = true;
  }
  assert.equal(threw, false, 'без краха');
  assert.ok(overlay, 'оверлей открыт (остальная поверхность жива)');
  assert.equal(overlay.querySelectorAll('button.cp-portrait').length, 0,
    'ряд портретов НЕ рисуется');
  assert.equal(h.errors.length, before + 1,
    'console.error ОДИН раз (one-shot флаг)');
  assert.ok(h.errors[before].includes('PortraitsData'),
    'след в консоли — про PortraitsData');
  // Повторное открытие — без повторного console.error.
  const before2 = h.errors.length;
  openBuilding(h);
  assert.equal(h.errors.length, before2, 'ошибка не повторяется');
  G.PortraitsData = PD;
  const { overlay: overlay3 } = openBuilding(h);
  assert.equal(
    overlay3.querySelectorAll('button.cp-portrait').length, 4,
    'после восстановления — ряд рисуется снова');
});

test('AC7. деградация: без __game — ряд не рисуется, без краха (000053)', async () => {
  const h = await bootWithParty();
  const G = h.sandbox.Game;
  const savedGame = h.sandbox.__game;
  h.sandbox.__game = null;
  const before = h.errors.length;
  let threw = false;
  let overlay = null;
  try {
    ({ overlay } = openBuilding(h));
  } catch (err) {
    threw = true;
  }
  assert.equal(threw, false, 'без краха');
  assert.ok(overlay, 'оверлей открыт');
  assert.equal(overlay.querySelectorAll('button.cp-portrait').length, 0,
    'мирового состояния нет — ряд НЕ рисуется');
  assert.ok(h.errors.length - before <= 1,
    'console.error ≤1× (не каждый open)');
  h.sandbox.__game = savedGame;
  const { overlay: overlay2 } = openBuilding(h);
  assert.equal(
    overlay2.querySelectorAll('button.cp-portrait').length, 4,
    'после восстановления — ряд на месте');
});

test('AC8. деградация: без Party — hero-фолбэк (1 button flogiston), тихо (000053)', async () => {
  const h = await bootWithParty();
  const G = h.sandbox.Game;
  const P = G.Party;
  delete G.Party;
  const before = h.errors.length;
  let threw = false;
  let overlay = null;
  try {
    ({ overlay } = openBuilding(h));
  } catch (err) {
    threw = true;
  }
  assert.equal(threw, false, 'без краха');
  const btns = overlay.querySelectorAll('button.cp-portrait');
  assert.equal(btns.length, 1, 'hero-фолбэк: только Флогистон');
  assert.equal(btns[0].dataset.memberid, 'flogiston', 'id — flogiston');
  assert.ok(String(btns[0].className).includes('cp-portrait-active'),
    'активный — Флогистон');
  assert.equal(h.errors.length, before, 'тихо — без console.error');
  G.Party = P;
  const { overlay: overlay2 } = openBuilding(h);
  assert.equal(
    overlay2.querySelectorAll('button.cp-portrait').length, 4,
    'после восстановления — полный состав');
});

test('AC9. NPC-диалог: ряд .cp-portraits над вкладками; клик — активный сменился, оверлей не закрыт, без saveNow (000299.01)', async () => {
  const h = await bootWithParty();
  const G = h.sandbox.Game;
  const saves = trackSaves(h);
  const npc = (G.NpcData.NPCS.find((n) => n.id === '000001')
    || G.NpcData.NPCS[0]);
  const st = h.sandbox.__game.state;
  G.npcUI.open({
    npc,
    character: st.hero,
    book: G.createQuestBook(),
    tile: { x: 1, y: 1, building: { id: 44 }, buildingWealth: 1 },
    day: 1,
    roster: st.roster,
    deadMercs: [],
  });
  const overlay = lastOverlay(h);
  assert.ok(String(overlay.className).includes('npc-overlay'),
    'оверлей NPC-диалога');
  const side = overlay.children[0];
  const row = overlay.querySelector('.cp-portraits');
  assert.ok(row, 'ряд .cp-portraits в диалоге NPC');
  const idxRow = side.children.indexOf(row);
  const tabsRow = side.children.find(
    (ch) => String(ch.className) === 'cp-itemrow');
  assert.ok(tabsRow, 'ряд вкладок на месте');
  assert.ok(idxRow >= 0 && idxRow < side.children.indexOf(tabsRow),
    'ряд портретов — НАД рядом вкладок');
  const ids = row.querySelectorAll('button.cp-portrait')
    .map((b) => b.dataset.memberid);
  assert.deepEqual(ids, ['flogiston', 'efir', 'merc_volk', 'merc_ashka'],
    'состав — Party.list (hero → Эфир → roster)');
  const efirBtn = row.querySelectorAll('button.cp-portrait')
    .find((b) => b.dataset.memberid === 'efir');
  overlay.listeners.click[0]({ target: efirBtn });
  assert.equal(G.playerUI.getActiveCharId(), 'efir',
    'клик по Эфиру — активный = «efir»');
  assert.ok(G.npcUI.isActive(), 'диалог НЕ закрывается');
  assert.equal(saves(), 0, 'saveNow не зван');
  assert.equal(overlay.querySelector('.cp-portraits'), row,
    'in-place: узел ряда тот же');
  const efirBtn2 = row.querySelectorAll('button.cp-portrait')
    .find((b) => b.dataset.memberid === 'efir');
  assert.ok(String(efirBtn2.className).includes('cp-portrait-active'),
    'активный — перерисован на Эфира');
  G.npcUI.close();
  G.playerUI.setActiveCharId(null);
});

test('AC10. регрессия: клик по строке действия — onAction + закрытие (не затронуто)', async () => {
  const h = await bootWithParty();
  const { G, acted, overlay } = openBuilding(h);
  const rowEl = overlay.querySelector('[data-buid="dlg"]');
  assert.ok(rowEl, 'строка действия найдена');
  overlay.listeners.click[0]({ target: rowEl });
  assert.equal(acted.length, 1, 'действие выполнено');
  assert.equal(acted[0].id, 'dlg', 'передано САМО действие');
  assert.equal(G.buildingUI.isActive(), false, 'оверлей закрылся сам');
});

test('AC11. регрессия: кнопка «закрыть» и Esc — закрытие (не затронуто)', async () => {
  const h = await bootWithParty();
  const { G, overlay } = openBuilding(h);
  const closeBtn = overlay.querySelector('button[data-buact="close"]');
  assert.ok(closeBtn, 'кнопка закрытия найдена');
  overlay.listeners.click[0]({ target: closeBtn });
  assert.equal(G.buildingUI.isActive(), false, 'клик — закрыл');
  openBuilding(h);
  const keydowns = h.winListeners.keydown || [];
  assert.ok(keydowns.length >= 1, 'keyHandler повешен на window');
  keydowns[keydowns.length - 1]({ code: 'Escape', preventDefault() {} });
  assert.equal(G.buildingUI.isActive(), false, 'Esc — закрыл');
});

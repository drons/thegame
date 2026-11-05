// Задача 000300 — обучение у NPC: Эфир и наёмные через механизм
// АКТИВНОГО персонажа (000299); лимит/цена ПО ПЕРСОНАЖУ, золото —
// ВСЕГДА Флогистон (ТЗ tasks/pending/000300.md, п.1/3/4).
//
// Контракт:
//   * Обучающийся — АКТИВНЫЙ персонаж (activeSheetNow, 000299.02):
//     уровень навыка, лимит trainPoints (000298) и стоимость (000296,
//     L — текущий уровень навыка) — ПО ПЕРСОНАЖУ (обучающемуся).
//   * Золото — ВСЕГДА списывает Флогистон (hero, owner): лист
//     Эфира/наёмного БЕЗ gold — NaN-ловушка 000299.03. payChar —
//     ХВОСТОВОЙ опциональный параметр schoolTrain/canSchoolTrain
//     (payChar = character): 3-арг. вызовы — бит-в-бит (A5).
//   * trainPoints — поле ЛЮБОГО листа (createSheet efir/merc, 0..10,
//     старт 10); сброс в 10 при ап-левеле обучающегося — addXp.
//
// КРАСНЫЕ (до — красные, осмысленно, не краш):
//   * A1/A6: 4-й аргумент schoolTrain игнорируется — gold списывает
//     trainee → efir/merc .gold = NaN, hero нетронут; trainPoints
//     trainee не декрементится (поля нет).
//   * A2: fresh-лист Эфира без trainPoints (typeof-guard — лимит
//     пропускается); лимит не по payChar.
//   * A3: gold списывает trainee (efir.gold = NaN), hero нетронут.
//   * A4: createSheet(efir/merc) — trainPoints undefined (лейаута нет).
//   * B1: train-таб хардкодит hero (c) — уровень/цена hero, не
//     активного Эфира.
//   * B2: клик train — мутации на hero, не на активного Эфира.
//   * B3: лимит читает hero, не активного — кнопка активна при
//     efir.trainPoints 0.
//   * B4: клик по портрету при открытой «школе» — ин-плейс ре-рендер
//     НЕТ (ветка dialog|trade не знает 'train') — stale-уровни/цены.
// ЗЕЛЁНЫЕ с первого запуска (регрессия бит-в-бит hero): A5.
//
// vm-песочница — цепочка index.html БЕЗ main.js (паттерн
// tests/npc-dialog-scope.test.js: точку __game ставит ТЕСТ).
//
// expectedRedCount (файл) = 9 (A1, A2, A3, A4, A6, B1, B2, B3, B4).
// Файл НЕ содержит литерала «SPEC» + «453» (скан-тест SPEC-453-GONE).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const P = require('../src/player.js');
const S = require('../src/sheet.js');
const N = require('../src/npc.js');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''))
  .filter((f) => f !== 'main.js');
const NOW = 1000;

// --- WebGL-стаб (дубль tests/npc-dialog-scope.test.js) ---

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

// --- Снисходительный DOM-элемент с деревом (дубль
// tests/npc-dialog-scope.test.js: нужен делегированный клик). ---

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

// --- localStorage-мок ---

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// --- Песочница: цепочка index.html БЕЗ main.js ---

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
  return { sandbox, winListeners, raf, errors, storage, body };
}

const drain = () => new Promise((r) => setImmediate(r));

async function boot() {
  const h = bootSandbox();
  await drain();
  await drain();
  await drain();
  return h;
}

// --- Часть A: ядро (require src/npc.js, src/sheet.js) ---

// Фикстура школы — swordsman БЕЗ requires (primary strength ≥ 1 у
// всех листов); ДУБЛЬ trainNpc из tests/npc.test.js (конвенция).
const trainNpc = {
  id: 't',
  имя: 'Каркаш',
  роль: 'наставник',
  постройки: [7],
  обучение: {
    навыки: ['swordsman', 'heavy', 'archer', 'accuracy'],
    цена_за_уровень: 25,
    цена_переноса_за_уровень: 40,
  },
};

test('A1. schoolTrain(npc, efir, skill, hero) — навык/trainPoints по обучающемуся (efir), gold — с hero; efir.gold undefined', () => {
  const hero = P.createCharacter();
  const efir = S.createSheet('efir');
  const r = N.schoolTrain(trainNpc, efir, 'swordsman', hero);
  assert.equal(r.ok, true, 'обучение успешное: ' + JSON.stringify(r));
  assert.equal(r.level, 1, 'уровень навыка 1');
  assert.equal(r.price, 20, 'цена шага L=0 — 20');
  assert.equal(efir.secondary.swordsman, 1, 'навык — на листе Эфира');
  assert.equal(efir.trainPoints, 9, 'бюджет −1 — на обучающемся (efir)');
  assert.equal(hero.trainPoints, 10, 'бюджет hero (платильщика) нетронут');
  assert.equal(hero.gold, 100 - 20, 'золото — с hero (платильщика)');
  assert.equal(efir.gold, undefined,
    'NaN-ловушка: gold Эфира НЕ существует (owner = hero)');
});

test('A2. лимит ПО ПЕРСОНАЖУ: efir.trainPoints 0 → блок (hero 10); зеркало hero 0 + efir 10 → проходит', () => {
  const efir = S.createSheet('efir');
  assert.equal(efir.trainPoints, 10,
    'fresh-лист Эфира: trainPoints = 10 (лейаут)');
  const hero = P.createCharacter();
  efir.trainPoints = 0;
  hero.trainPoints = 10;
  assert.deepEqual(N.canSchoolTrain(trainNpc, efir, 'swordsman', hero),
    { ok: false, reason: 'нет очков обучения на этом уровне' },
    'бюджет обучающегося (efir) 0 → блок, даже у платильщика (hero) 10');
  const efir2 = S.createSheet('efir');
  const hero2 = P.createCharacter();
  hero2.trainPoints = 0;
  assert.equal(N.canSchoolTrain(trainNpc, efir2, 'swordsman', hero2).ok,
    true,
    'бюджет платильщика (hero) 0 НЕ блокирует — лимит по обучающемуся');
});

test('A3. стоимость ПО ПЕРСОНАЖУ: efir swordsman 2 → 60 (hero 0 → 20); gold — с hero', () => {
  const hero = P.createCharacter();
  const efir = S.createSheet('efir');
  efir.secondary.swordsman = 2;
  assert.equal(N.schoolTrainPrice(trainNpc, efir, 'swordsman'), 60,
    '20 + 10·2² = 60 — цена по обучающемуся (L=2)');
  assert.equal(N.schoolTrainPrice(trainNpc, hero, 'swordsman'), 20,
    'hero swordsman 0 → 20 (цена НЕ по платильщику)');
  const r = N.schoolTrain(trainNpc, efir, 'swordsman', hero);
  assert.deepEqual(r, { ok: true, level: 3, price: 60 },
    'выполнение: уровень 3, цена 60 (по обучающемуся)');
  assert.equal(hero.gold, 100 - 60, 'золото — с hero (платильщика)');
  assert.equal(efir.gold, undefined,
    'NaN-ловушка: gold Эфира НЕ существует');
});

test('A4. лейаут createSheet(efir/merc).trainPoints = 10; сброс в 10 при ап-левеле обучающегося (addXp)', () => {
  const efir = S.createSheet('efir');
  const merc = S.createSheet('merc', { npcId: 'm' });
  assert.equal(efir.trainPoints, 10,
    'createSheet(efir): trainPoints = 10 (лейаут)');
  assert.equal(merc.trainPoints, 10,
    'createSheet(merc): trainPoints = 10 (лейаут)');
  efir.trainPoints = 0;
  const lvlBefore = efir.level;
  const r = S.addXp(efir, S.xpForNext(lvlBefore));
  assert.equal(r.levelsGained, 1, 'ап-левел обучающегося');
  assert.equal(efir.trainPoints, 10,
    'плоский сброс в 10 при ап-левеле (addXp, typeof-guard)');
});

test('A5. регрессия: hero 3-арг. вызовы — бит-в-бит (npc.test.js)', () => {
  const c = P.createCharacter();
  c.gold = 1000000;
  assert.equal(N.schoolTrainPrice(trainNpc, c, 'swordsman'), 20,
    '3-арг. цена L=0 — 20');
  const r = N.schoolTrain(trainNpc, c, 'swordsman');
  assert.deepEqual(r, { ok: true, level: 1, price: 20 },
    '3-арг. schoolTrain — без изменений');
  assert.equal(c.gold, 1000000 - 20, 'gold — с hero (payChar = character)');
  assert.equal(c.trainPoints, 9, 'бюджет −1 (hero)');
  assert.deepEqual(N.canSchoolTrain(trainNpc, c, 'swordsman'),
    { ok: true }, '3-арг. can — согласован');
});

test('A6. merc-путь (зеркало A1): навык/trainPoints по наёмному, gold — с hero; merc.gold undefined', () => {
  const hero = P.createCharacter();
  const merc = S.createSheet('merc', { npcId: 'merc_volk' });
  const r = N.schoolTrain(trainNpc, merc, 'swordsman', hero);
  assert.equal(r.ok, true, 'обучение успешное: ' + JSON.stringify(r));
  assert.equal(merc.secondary.swordsman, 1, 'навык — на листе наёмного');
  assert.equal(merc.trainPoints, 9, 'бюджет −1 — на обучающемся (merc)');
  assert.equal(hero.trainPoints, 10, 'бюджет hero нетронут');
  assert.equal(hero.gold, 100 - 20, 'золото — с hero');
  assert.equal(merc.gold, undefined,
    'NaN-ловушка: gold наёмного НЕ существует (owner = hero)');
});

test('A7. 000334: «мало золота» — 4-арг. (payChar ≠ character): отказ ДО мутаций (hero.gold 10 < 60); gold-чек — по платильщику', () => {
  const hero = P.createCharacter();
  const efir = S.createSheet('efir');
  efir.secondary.swordsman = 2;
  hero.gold = 10;
  assert.deepEqual(N.canSchoolTrain(trainNpc, efir, 'swordsman', hero),
    { ok: false, reason: 'мало золота (нужно 60)' },
    'цена 20 + 10·2² = 60 > hero.gold 10 — отказ (чек — по '
    + 'платильщику, не по обучающемуся)');
  const r = N.schoolTrain(trainNpc, efir, 'swordsman', hero);
  assert.deepEqual(r, { ok: false, reason: 'мало золота (нужно 60)' },
    'schoolTrain — тот же отказ (gold-чек ДО мутаций)');
  assert.equal(hero.gold, 10, 'gold платильщика НЕ списан (отказ)');
  assert.equal(efir.trainPoints, 10, 'бюджет обучающегося нетронут');
  assert.equal(hero.trainPoints, 10, 'бюджет hero нетронут');
  assert.equal(efir.secondary.swordsman, 2, 'навык не вырос');
  assert.equal(efir.gold, undefined,
    'NaN-ловушка: gold Эфира НЕ существует (чек — payChar.gold)');
});

// --- Часть B: vm (src/ui.js) ---

function seedWorld(h, over = {}) {
  const G = h.sandbox.Game;
  const state = {
    day: 1,
    hero: over.hero !== undefined ? over.hero
      : G.createCharacter('Флогистон'),
    efir: over.efir !== undefined ? over.efir
      : G.efir.createEfir(),
    efirMet: over.efirMet !== undefined ? over.efirMet : true,
    roster: over.roster !== undefined ? over.roster : [],
    deadMercs: over.deadMercs !== undefined ? over.deadMercs : [],
  };
  h.sandbox.__game = { state };
  return state;
}

function lastOverlay(h) {
  const ch = h.body.children;
  return ch[ch.length - 1];
}

function openNpc(h, npcId, st) {
  const G = h.sandbox.Game;
  const npc = G.NpcData.NPCS.find((n) => n.id === npcId);
  assert.ok(npc, `NPC ${npcId} в каталоге`);
  G.npcUI.open(Object.assign({
    npc,
    character: st.hero,
    book: G.createQuestBook(),
    tile: { x: 1, y: 1, building: { id: 44 }, buildingWealth: 1 },
    day: 1,
    roster: st.roster,
    deadMercs: st.deadMercs,
  }));
  return { G, overlay: lastOverlay(h) };
}

function clickTrainTab(overlay) {
  const trainTab = overlay.querySelectorAll('button[data-npcact="tab"]')
    .find((b) => b.dataset.tab === 'train');
  assert.ok(trainTab, 'вкладка «школа» на месте');
  overlay.listeners.click[0]({ target: trainTab });
}

function metaLines(root) {
  return root.querySelectorAll('.cp-itemmeta')
    .map((e) => String(e.textContent));
}

test('B1. train-таб при активном Эфире: уровень/цена — по Эфиру (swordsman 2 → 60), ТОЧНАЯ строка «Свободные очки: 3» — points активного (000334)', async () => {
  const h = await boot();
  const st = seedWorld(h);
  st.efir.secondary.swordsman = 2;
  st.hero.points = 0;
  st.efir.points = 3;
  const { G, overlay } = openNpc(h, 'arena_master', st);
  const before = h.errors.length;
  G.playerUI.setActiveCharId('efir');
  clickTrainTab(overlay);
  const names = overlay.querySelectorAll('.cp-itemname')
    .map((e) => String(e.textContent));
  const swName = names.find((s) => s.startsWith('Начинающий мечник'))
    || names.find((s) => s.includes('(2)'));
  assert.ok(swName && swName.endsWith('(2)'),
    'уровень swordsman — 2 (по активному Эфиру): ' + JSON.stringify(names));
  const metas = metaLines(overlay);
  const priceLine = metas.find((s) => s.startsWith('+1 за 60 з'));
  assert.ok(priceLine, 'цена +1 за 60 з (L=2, по активному Эфиру): '
    + JSON.stringify(metas));
  assert.ok(metas.includes('Свободные очки: 3'),
    'ТОЧНАЯ строка «Свободные очки: 3» — points АКТИВНОГО (efir.points '
    + '3, hero.points 0): ' + JSON.stringify(metas));
  assert.equal(h.errors.length, before,
    '0 новых console.error (вкладка «школа» при активном Эфире)');
  G.npcUI.close();
  G.playerUI.setActiveCharId(null);
});

test('B2. клик train-кнопки при активном Эфире: навык на листе Эфира, gold −60 с hero, efir.trainPoints 9, efir.gold undefined, 0 ошибок', async () => {
  const h = await boot();
  const st = seedWorld(h);
  st.efir.secondary.swordsman = 2;
  const { G, overlay } = openNpc(h, 'arena_master', st);
  const before = h.errors.length;
  G.playerUI.setActiveCharId('efir');
  clickTrainTab(overlay);
  const swBtn = overlay.querySelectorAll('button[data-npcact="train"]')
    .find((b) => b.dataset.skill === 'swordsman');
  assert.ok(swBtn, 'кнопка train (swordsman) на месте');
  assert.equal(st.efir.trainPoints, 10, 'fresh: бюджет Эфира 10');
  const goldBefore = st.hero.gold;
  overlay.listeners.click[0]({ target: swBtn });
  assert.equal(st.efir.secondary.swordsman, 3, 'навык +1 — на листе Эфира');
  assert.equal(st.hero.gold, goldBefore - 60,
    'золото −60 (цена L=2) — с hero (платильщика)');
  assert.equal(st.efir.trainPoints, 9, 'бюджет −1 — на обучающемся (efir)');
  assert.equal(st.hero.trainPoints, 10, 'бюджет hero нетронут');
  assert.equal(st.efir.gold, undefined,
    'NaN-ловушка: gold Эфира НЕ тронут (owner = hero)');
  assert.equal(h.errors.length, before, '0 новых console.error');
  G.npcUI.close();
  G.playerUI.setActiveCharId(null);
});

test('B3. лимит в vm при активном Эфире: efir.trainPoints 0 → bTrain disabled + title=reason; бюджет hero цел', async () => {
  const h = await boot();
  const st = seedWorld(h);
  const { G, overlay } = openNpc(h, 'arena_master', st);
  G.playerUI.setActiveCharId('efir');
  st.efir.trainPoints = 0;
  clickTrainTab(overlay);
  const swBtn = overlay.querySelectorAll('button[data-npcact="train"]')
    .find((b) => b.dataset.skill === 'swordsman');
  assert.ok(swBtn, 'кнопка train (swordsman) на месте');
  assert.equal(swBtn.disabled, true,
    'бюджет активного (efir) 0 → кнопка заблокирована');
  assert.equal(swBtn.title, 'нет очков обучения на этом уровне',
    'title — reason лимита (по обучающемуся)');
  assert.equal(st.hero.trainPoints, 10, 'бюджет hero (платильщика) цел');
  G.npcUI.close();
  G.playerUI.setActiveCharId(null);
});

test('B4. клик по портрету при открытой «школе» — ин-плейс ре-рендер (уровни/цены переключаются на активного), вкладка остаётся «школа», оверлей открыт', async () => {
  const h = await boot();
  const st = seedWorld(h);
  st.efir.secondary.swordsman = 2;
  const { G, overlay } = openNpc(h, 'arena_master', st);
  clickTrainTab(overlay);
  let metas = metaLines(overlay);
  assert.ok(metas.some((s) => s.startsWith('+1 за 20 з')),
    'до клика — цена hero (swordsman 0 → 20, дефолт)');
  const row = overlay.querySelector('.cp-portraits');
  const efirBtn = row.querySelectorAll('button.cp-portrait')
    .find((b) => b.dataset.memberid === 'efir');
  assert.ok(efirBtn, 'портрет Эфира в ряду');
  overlay.listeners.click[0]({ target: efirBtn });
  assert.equal(G.playerUI.getActiveCharId(), 'efir', 'активный — «efir»');
  assert.ok(G.npcUI.isActive(), 'диалог НЕ закрылся');
  metas = metaLines(overlay);
  assert.ok(metas.some((s) => s.startsWith('+1 за 60 з')),
    'цены обновлены ин-плейс (активный = Эфир, L=2 → 60): '
    + JSON.stringify(metas));
  assert.ok(overlay.querySelectorAll('button[data-npcact="train"]')
    .length >= 1, 'вкладка «школа» остаётся открытой (не переключилась)');
  G.npcUI.close();
  G.playerUI.setActiveCharId(null);
});

test('B5. 000334: «мало золота» в vm (зеркало A7): hero.gold 10 < 60 → bTrain disabled + title «мало золота (нужно 60)»; мутаций нет', async () => {
  const h = await boot();
  const st = seedWorld(h);
  st.efir.secondary.swordsman = 2;
  st.hero.gold = 10;
  const { G, overlay } = openNpc(h, 'arena_master', st);
  const before = h.errors.length;
  G.playerUI.setActiveCharId('efir');
  clickTrainTab(overlay);
  const swBtn = overlay.querySelectorAll('button[data-npcact="train"]')
    .find((b) => b.dataset.skill === 'swordsman');
  assert.ok(swBtn, 'кнопка train (swordsman) на месте');
  assert.equal(swBtn.disabled, true,
    'gold платильщика (hero) 10 < 60 → кнопка заблокирована');
  assert.equal(swBtn.title, 'мало золота (нужно 60)',
    'title — reason gold-чека (по платильщику, не по обучающемуся)');
  assert.equal(st.hero.gold, 10, 'gold не списан (отказ)');
  assert.equal(st.efir.trainPoints, 10, 'бюджет Эфира нетронут');
  assert.equal(st.efir.secondary.swordsman, 2, 'навык не вырос');
  assert.equal(h.errors.length, before, '0 новых console.error');
  G.npcUI.close();
  G.playerUI.setActiveCharId(null);
});

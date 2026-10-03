// Задача 000126: наставничество по крафту — опция «обучить <вид>»
// в диалоге NPC + её действие (mentorCraft, 000046).
//
// КРАСНЫЕ тесты (TDD): падают на текущем (неизменённом) коде —
// функциональности ещё нет:
//   * src/npc.js: dialogOptions НЕ синтезирует опцию наставничества
//     (решение (b) контракта: опция только если NPC обучает вид
//     (SKILL_CRAFT_TYPE) И стоит в постройке этого вида);
//   * src/ui.js: ветка 'обучить_крафт' в onOverlayClick (акт 'opt')
//     отсутствует.
//
// Контракт — memory/000126-craft-screen.md §3 (код синтеза
// зафиксирован). Ядро canMentorCraft/mentorCraft (000046) — только
// ВЫЗОВ: строки причин — из ядра, не из UI.
//
// ND-1 — node (паттерн craftReprocessHook-тестов: globalThis.Game
// задаётся в рамках кейса и убирается в finally; node-ветки UMD).
// ND-3 — vm-полная цепь index.html (паттерн bootSandbox
// building-actions.test.js BA5): реальный Game.npcUI (диалог),
// делегированный клик по опции.
//
// Карта (красные — падают до реализации):
//   * ND-1 (node): Торн ([8,25], forge) — опция «обучить кузнечное_
//     дело» (id 'mentor_<вид>', действие 'обучить_крафт', вид;
//     доступно при 100 з); мало золота — причина ядра; макс. уровень
//     — причина ядра; мёртвый персонаж — причина ядра; trainNpc
//     ([7], heavy) — опции НЕТ (o.length === 4, регрессия — решение
//     (b): [7] ∉ кузнечного); Карк ([7]) — нет; дедупликация по
//     виду: NPC с двумя навыками одного вида — ОДНА опция.
//   * ND-3 (vm): диалог npcUI с Торном — кнопка опции; клик →
//     mentorCraft: gold −20, уровень виду +1, onChange (сейв), строка
//     в лог; мало золота — кнопка disabled + причина в строке, клик
//     ничего не тратит.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

// --- ND-1: node-ветки (npc.js + craft.js + каталог NPC) ---

const P = require('../src/player.js');
const N = require('../src/npc.js');
const C = require('../src/craft.js');
const { NPCS } = require('../src/npc-data.js');

// Фикстура trainNpc — 1:1 tests/npc.test.js (там pин o.length === 4):
// обучает heavy (→ кузнечное_дело), НО стоит в [7] — не постройка
// кузнечного вида → по решению (b) опции быть не должно.
const trainNpc = {
  id: 't',
  имя: 'Каркаш',
  роль: 'наставник',
  постройки: [7],
  диалог: [
    { id: 'open', текст: 'Тренировка — или просто смотри?', действие: 'обучение' },
    { id: 'char', текст: 'Слух для решительных', действие: 'подсказка', требования: { харизма: 3 } },
    { id: 'orator', текст: 'Слух для красноречивых', действие: 'подсказка', требования: { навык: { id: 'orator', уровень: 2 } } },
    { id: 'check', текст: 'Слух для знатоков', действие: 'подсказка', требования: { проверка: 3 } },
  ],
  обучение: {
    навыки: ['swordsman', 'heavy', 'archer', 'accuracy'],
    цена_за_уровень: 25,
    цена_переноса_за_уровень: 40,
  },
};

const isMentorOpt = (x) =>
  String(x.option.id).startsWith('mentor_')
  && x.option.действие === 'обучить_крафт';

test('ND-1. dialogOptions: опция «обучить <вид>» (Торн) — синтез, причины ядра, фильтры, дедупликация', () => {
  const thor = NPCS.find((n) => n.id === 'blacksmith');
  assert.ok(thor, 'Торн (blacksmith, [8, 25], forge/back) в каталоге');
  const c = P.createCharacter();
  c.gold = 100;
  c.craft = { кузнечное_дело: 1 };
  globalThis.Game = { Craft: C };
  try {
    // (a) Торн: ровно ОДНА ментор-опция (forge → кузнечное_дело;
    // back — без craft-маппинга), вид + действие + доступность.
    const o = N.dialogOptions(thor, c);
    const mentors = o.filter(isMentorOpt);
    assert.equal(mentors.length, 1,
      'у Торна ровно одна ментор-опция (forge → кузнечное_дело, '
      + 'back не маппится); факт: '
      + JSON.stringify(o.map((x) => x.option.id)));
    const m = mentors[0];
    assert.equal(m.option.id, 'mentor_кузнечное_дело',
      'id опции — «mentor_<вид>»');
    assert.equal(m.option.вид, 'кузнечное_дело', 'option.вид — вид крафта');
    assert.ok(/обучить/.test(m.option.текст) && /кузнечное/.test(m.option.текст),
      'текст: «обучить» + имя вида; факт: ' + m.option.текст);
    assert.equal(m.доступен, true, '100 з, уровень 1 — доступно');
    assert.equal(m.причина, null, 'причины нет при успехе');
    // (b) Мало золота — причина из ядра (строка закреплена craft-core).
    c.gold = 10;
    let m2 = N.dialogOptions(thor, c).filter(isMentorOpt)[0];
    assert.ok(m2, 'опция на месте (видна, но недоступна)');
    assert.equal(m2.доступен, false, 'мало золота — недоступно');
    assert.equal(m2.причина, 'мало золота (нужно 20)',
      'причина — из canMentorCraft ядра (цена Торна 20)');
    // (c) Максимальный уровень — причина ядра (чек ДО золота).
    c.gold = 100;
    c.craft = { кузнечное_дело: 100 };
    m2 = N.dialogOptions(thor, c).filter(isMentorOpt)[0];
    assert.equal(m2.доступен, false, 'уровень 100 — недоступно');
    assert.equal(m2.причина, 'максимальный уровень',
      'причина — из canMentorCraft ядра');
    // (d) Мёртвый персонаж — pre-check ядра (первое после вида).
    c.alive = false;
    c.craft = { кузнечное_дело: 1 };
    m2 = N.dialogOptions(thor, c).filter(isMentorOpt)[0];
    assert.equal(m2.доступен, false, 'мёртвый — недоступно');
    assert.equal(m2.причина, 'персонаж погиб',
      'причина — из canMentorCraft ядра');
    c.alive = true;
    c.craft = { кузнечное_дело: 1 };
    // (e) trainNpc ([7], heavy → кузнечное_дело): постройки [7] ∉
    // вида → опции НЕТ; pин о.length === 4 (tests/npc.test.js) жив.
    const o3 = N.dialogOptions(trainNpc, c);
    assert.equal(o3.length, 4,
      'trainNpc — ровно 4 опции диалога (регрессия; решение (b): '
      + 'фильтр по постройке вида); факт: '
      + JSON.stringify(o3.map((x) => x.option.id)));
    assert.ok(!o3.some(isMentorOpt),
      'у trainNpc ментор-опции НЕТ ([7] не постройка кузнечного)');
    // (f) Карк ([7], swordsman+heavy): тоже без постройки вида.
    const kark = NPCS.find((n) => n.id === 'arena_master');
    assert.ok(kark, 'Карк в каталоге');
    assert.ok(!N.dialogOptions(kark, c).some(isMentorOpt),
      'Карк ([7]) — ментор-опции нет (нет постройки вида)');
    // Лейна (accuracy/archer — без craft-маппинга).
    const leina = NPCS.find((n) => n.id === 'archery_master');
    assert.ok(leina, 'Лейна в каталоге');
    assert.ok(!N.dialogOptions(leina, c).some(isMentorOpt),
      'Лейна (accuracy/archer) — ментор-опции нет (маппинга нет)');
    // (g) Дедупликация по виду: два навыка ОДНОГО вида — одна опция.
    const both = {
      id: 'dd', имя: 'ДД', роль: 'наставник', постройки: [8],
      диалог: [],
      обучение: { навыки: ['forge', 'heavy'], цена_за_уровень: 20 },
    };
    const o4 = N.dialogOptions(both, c);
    assert.equal(o4.filter(isMentorOpt).length, 1,
      'дедупликация по виду (Set): forge и heavy — оба '
      + 'кузнечное_дело → ОДНА опция');
  } finally {
    delete globalThis.Game;
  }
});

// --- ND-3: vm — диалог npcUI, клик по опции ---

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g),
  (m) => m[1]);
const NOW = 1000;

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
    scrollTop: 0,
    scrollHeight: 0,
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

function textOf(n) {
  let s = String(n.textContent == null ? '' : n.textContent);
  for (const ch of n.children || []) s += '\n' + textOf(ch);
  return s;
}

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
  const storage = new Map();
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
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => { storage.set(k, String(v)); },
      removeItem: (k) => { storage.delete(k); },
    },
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
      fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox,
      { filename: f });
  }
  return { sandbox, winListeners, raf, errors, body, hud };
}

const drain = () => new Promise((r) => setImmediate(r));

async function boot() {
  const h = bootSandbox();
  await drain();
  await drain();
  await drain();
  return h;
}

test('ND-3. vm: клик по «обучить <вид>» в диалоге npcUI → mentorCraft (gold −20, уровень +1, сейв, лог)', async () => {
  const h = await boot();
  assert.equal(h.errors.length, 0,
    'ошибок загрузки цепочки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const thor = G.NpcData.NPCS.find((n) => n.id === 'blacksmith');
  assert.ok(thor, 'Торн в каталоге vm-песочницы');
  const c = G.createCharacter();
  c.gold = 100;
  c.craft = { кузнечное_дело: 1 };
  assert.equal(G.Craft.craftLevel(c, 'кузнечное_дело'), 1,
    'фикстура: уровень вида 1');
  const changed = [];
  G.npcUI.open({
    npc: thor,
    character: c,
    book: G.createQuestBook(),
    tile: { x: 0, y: 0, building: 5, buildingWealth: 0 },
    shop: null,
    onChange: () => changed.push(1),
    day: 1,
  });
  assert.ok(G.npcUI.isActive(), 'диалог открыт');
  const overlay = h.body.children
    .find((el) => String(el.className).includes('npc-overlay'));
  assert.ok(overlay, 'оверлей .npc-overlay в DOM');
  assert.ok(overlay.listeners && overlay.listeners.click
    && overlay.listeners.click.length, 'делегированный клик на оверлее');
  const click = (btn) => overlay.listeners.click[0]({ target: btn });
  // Кнопка ментор-опции (синтез dialogOptions + отрисовка вкладки).
  const btn = findAll(overlay, 'button[data-npcact="opt"]')
    .find((b) => String(b.dataset.optid || '').startsWith('mentor_'));
  assert.ok(btn,
    'кнопка опции «обучить <вид>» в диалоге (data-optid mentor_…)');
  assert.ok(!btn.disabled, '100 з, уровень 1 — опция доступна');
  const logEl = findAll(overlay, '.npc-log')[0];
  const logBefore = logEl.textContent;
  click(btn);
  assert.equal(c.gold, 80,
    'mentorCraft: золото −20 (цена_за_уровень Торна)');
  assert.equal(G.Craft.craftLevel(c, 'кузнечное_дело'), 2,
    'mentorCraft: уровень виду +1 (1 → 2)');
  assert.equal(changed.length, 1, 'onChange (сейв) вызван один раз');
  assert.ok(logEl.textContent.length > logBefore.length,
    'строка результата в логе; факт: ' + logEl.textContent);
  // Мало золота: опция disabled + причина в строке, клик не тратит.
  c.gold = 10;
  G.npcUI.render();
  const btn2 = findAll(overlay, 'button[data-npcact="opt"]')
    .find((b) => String(b.dataset.optid || '').startsWith('mentor_'));
  assert.ok(btn2, 'опция в списке (видна, но недоступна)');
  assert.ok(btn2.disabled, 'мало золота (10 < 20) — кнопка disabled');
  const row2 = btn2.closest('.cp-itemrow');
  assert.ok(row2 && /мало золота/.test(textOf(row2)),
    'строка опции: причина «мало золота (нужно 20)»; факт: '
    + (row2 ? textOf(row2).replace(/\n/g, ' ') : 'нет строки'));
  const goldBefore = c.gold;
  const levelBefore = G.Craft.craftLevel(c, 'кузнечное_дело');
  click(btn2);
  assert.equal(c.gold, goldBefore, 'disabled-опция не тратит золото');
  assert.equal(G.Craft.craftLevel(c, 'кузнечное_дело'), levelBefore,
    'disabled-опция не даёт уровень');
  G.npcUI.close();
});

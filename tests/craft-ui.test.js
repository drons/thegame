// Задача 000126: экран крафта — UI у крафтовых построек.
//
// КРАСНЫЕ тесты (TDD): написаны ДО реализации, падают на текущем
// (неизменённом) коде — функциональности ещё нет:
//   * src/craft-ui.js отсутствует (Game.craftUI не создаётся);
//   * строка {id:'craft', имя:'Крафт'} не синтезируется в
//     buildingActions (src/building-effects.js не правлен);
//   * спец-действие 'craft' не зарегистрировано (specials 000128);
//   * CSS-блок .craft-* отсутствует (см. tests/craft-layout.test.js).
//
// Контракты — memory/000126-craft-screen.md (главный) и
// memory/000126-craft-ui.md (детали UI). Ядро Game.Craft (000046,
// смержено) — только ЧТЕНИЕ/ВЫЗОВ: здесь фиксируется СВЯЗКА ядро↔UI.
//
// vm-полная цепь index.html (паттерн bootSandbox
// tests/building-actions.test.js BA5 / building-effects.test.js):
// DOM/WebGL/localStorage-стабы, performance.now заморожен, мир
// детерминирован (map.png onerror → generateSeedPixels). Математика
// крафта детерминирована скриптованным Math.random в песочнице
// (window.__seq): craft() роллит СНАЧАЛА качество, затем выход —
// последовательность [0.001, 0.999] даёт качество да / выход нет.
//
// Карта (красные — падают до реализации):
//   * CU-1 wiring: Game.craftUI {open, close, isActive} + specials.craft
//     — функция (саморегистрация при загрузке, 000128).
//   * CU-2 [E] вход без NPC: строка 'craft' у здания 8 (Кузница) →
//     onBuildingAction → Game.craftUI.isActive() true, оверлей
//     .craft-overlay/.craft-panel в DOM, заголовок с именем постройки.
//   * CU-3 [E] вход с NPC: у здания 8 с Торном строки ['dialog','craft']
//     (порядок: диалог первым, крафт концом).
//   * CU-4 состав экрана: группировка по виду + уровень виду; рецепты
//     здания; «нужно ур. N / есть L»; нехватка исходников (disabled +
//     причина по canCraft); «качество/выход»; результат «→ имя ×n»;
//     кнопка «изготовить» (data-craftact='craft' data-recipe=id).
//   * CU-5 крафт: клик «изготовить» (детерминированный Math.random) →
//     исходники списаны, результат + бонус качества (слот), xp виду;
//     повтор без исходников — отказ в лог, инвентарь не тронут.
//   * CU-6 зачарование: пикер ТОЛЬКО изученных заклинаний (с маной);
//     крафт → мана списана, бонус качества+заклинания в один слот;
//     без изученных — «заклинание не изучено», пикера нет.
//   * CU-7 деградация (000053): craft-ui.js грузится чисто без
//     buildingActions/Craft (с buildingActions — саморегистрация
//     'craft'); open() без Game.Craft — console.error, без краха,
//     isActive false. + 40/42: осиротевшая марка 'x,y:craft' НЕ гасит
//     строку (решение 5 контракта).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
// Вся цепь index.html (в т.ч. main.js — init buildingActions сработан).
// В зелёной стадии в ней появится src/craft-ui.js — подхватится
// автоматически; до того цепь та же, что сейчас (чистая).
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g),
  (m) => m[1]);
const NOW = 1000; // performance.now() в песочнице заморожен

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

// --- DOM-стаб с деревом (дети/родитель, dataset, closest) — паттерн
// building-actions.test.js (селекторы: 'tag', '.class',
// '[attr]', '[attr="value"]' и их композиты). ---

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
      return () => undefined; // неизвестный метод DOM — no-op
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

// Рекурсивный текст элемента (свой + потомков) — для пина фраз
// контракта в составе строки/экрана.
function textOf(n) {
  let s = String(n.textContent == null ? '' : n.textContent);
  for (const ch of n.children || []) s += '\n' + textOf(ch);
  return s;
}

// --- Песочница: вся цепь index.html ---

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
  // Image-стаб: assets/map.png ВСЕГДА onerror (детерминированный
  // фолбэк G.generateSeedPixels).
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
  // Детерминированный Math.random (сбрасывается тестом ПРЯМО ПЕРЕД
  // кликом «изготовить»): цикл по window.__seq. craft() расходует
  // ровно два вызова: качество, затем выход (порядок закреплён
  // 000046). [0.001, 0.999] → качество да, выход нет.
  vm.runInContext(
    'window.__seq = [0.001, 0.999]; window.__seqI = 0;\n'
    + 'Math.random = function () {\n'
    + '  return window.__seq[window.__seqI++ % window.__seq.length];\n'
    + '};',
    sandbox, { filename: 'craft-rng-setup.js' });
  for (const f of CHAIN) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox,
      { filename: f });
  }
  return { sandbox, winListeners, raf, errors, body, hud, window };
}

const drain = () => new Promise((r) => setImmediate(r));

async function boot() {
  const h = bootSandbox();
  await drain();
  await drain();
  await drain();
  return h;
}

// Сбросить детерминированную последовательность роллов.
function resetSeq(h, seq = [0.001, 0.999]) {
  h.window.__seq = seq;
  h.window.__seqI = 0;
}

// Оверлей экрана крафта в DOM (body → .craft-overlay).
function findCraftOverlay(h) {
  return h.body.children
    .find((el) => String(el.className).includes('craft-overlay')) || null;
}

// Строка рецепта: кнопка data-recipe=<id> → её контейнер .craft-recipe.
function recipeRow(overlay, recipeId) {
  const btn = findAll(overlay, 'button[data-craftact="craft"]')
    .find((b) => b.dataset.recipe === recipeId);
  if (!btn) return { btn: null, row: null };
  return { btn, row: btn.closest('.craft-recipe') || btn };
}

// --- CU-1: wiring ---

test('CU-1. wiring: Game.craftUI существует, specials.craft — функция (задача 000126)', async () => {
  const h = await boot();
  assert.equal(h.errors.length, 0,
    'ошибок загрузки цепочки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  assert.ok(G.craftUI,
    'Game.craftUI создан (src/craft-ui.js — новый модуль 000126)');
  for (const m of ['open', 'close', 'isActive']) {
    assert.equal(typeof G.craftUI[m], 'function',
      'Game.craftUI.' + m + ' — функция (публичная поверхность)');
  }
  const sp = G.buildingActions && G.buildingActions.specials;
  assert.ok(sp && typeof sp === 'object',
    'таблица спец-действий specials (000128) на месте');
  assert.equal(typeof sp.craft, 'function',
    "спец-действие 'craft' зарегистрировано "
    + '(саморегистрация при загрузке craft-ui.js)');
});

// --- CU-2: [E] вход без NPC ---

test('CU-2. [E] без NPC: Кузница (8) — строка «Крафт» → onBuildingAction открывает экран', async () => {
  const h = await boot();
  assert.equal(h.errors.length, 0,
    'ошибок загрузки цепочки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const b8 = G.getBuilding(8);
  assert.ok(b8, 'постройка 8 (Кузница) в каталоге');
  const state = { day: 1, tile: { x: 0, y: 0 }, hero: {}, save: {} };
  const rows = G.buildingEffects.buildingActions(b8, null, state);
  const row = rows.find((r) => r.id === 'craft');
  assert.ok(row,
    'у крафтового здания (8) есть строка id «craft» в buildingActions '
    + '(синтез, решение 1 контракта); факт: '
    + JSON.stringify(rows.map((r) => r.id)));
  assert.equal(row.имя, 'Крафт', 'имя строки — «Крафт»');
  assert.equal(row.доступен, true, 'строка «Крафт» всегда доступна');
  // Роутинг [E]: клик по строке → спец-хендлер → экран.
  const t = { x: 0, y: 0, hasBuilding: true, building: 5,
    buildingId: 8, buildingWealth: 0 };
  G.buildingActions.onBuildingAction(row, t, b8, null);
  assert.equal(G.craftUI.isActive(), true,
    'onBuildingAction(«craft») открыл Game.craftUI');
  const ov = findCraftOverlay(h);
  assert.ok(ov, 'оверлей .craft-overlay добавлен в DOM');
  assert.ok(findAll(ov, '.craft-panel').length === 1,
    'панель .craft-panel в оверлее');
  const title = findAll(ov, '.cp-title')[0];
  assert.ok(title, 'заголовок .cp-title');
  const tt = textOf(title);
  assert.ok(tt.includes('Кузница') || tt.includes('кузница'),
    'заголовок несёт имя постройки; факт: ' + tt.replace(/\n/g, ' '));
});

// --- CU-3: [E] вход с NPC ---

test('CU-3. [E] с NPC: Кузница + Торн — строки [«Диалог», «Крафт»] (порядок)', async () => {
  const h = await boot();
  assert.equal(h.errors.length, 0,
    'ошибок загрузки цепочки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const b8 = G.getBuilding(8);
  const thor = G.npcForBuilding(G.NpcData.NPCS, 8);
  assert.ok(thor, 'Торн стоит в Кузнице (npcForBuilding)');
  const state = { day: 1, tile: { x: 0, y: 0 }, hero: {}, save: {} };
  const rows = G.buildingEffects.buildingActions(b8, thor, state);
  assert.deepEqual(rows.map((r) => r.id), ['dialog', 'craft'],
    'с NPC строки: «Диалог» ПЕРВЫМ, «Крафт» КОНЦОМ (решение 1: '
    + 'игрок выбирает; порядок — регрессия для тач/клавиш по номеру); '
    + 'факт: ' + JSON.stringify(rows.map((r) => r.id)));
  assert.equal(rows[1].имя, 'Крафт', 'имя второй строки — «Крафт»');
  assert.equal(rows[1].доступен, true, 'крафт-строка доступна с NPC');
});

// --- CU-4: состав экрана ---

test('CU-4. состав экрана: виды с уровнем, рецепты, «нужно ур./есть», нехватка, шансы, результат', async () => {
  const h = await boot();
  assert.equal(h.errors.length, 0,
    'ошибок загрузки цепочки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const b8 = G.getBuilding(8);
  // Кузница: ровно 6 рецептов, все — кузнечное_дело.
  const here = G.Craft.CRAFT
    .filter((r) => Array.isArray(r.здания) && r.здания.includes(8));
  assert.equal(here.length, 6, 'у здания 8 — 6 рецептов (каталог)');
  const c = G.createCharacter();
  c.craft = { кузнечное_дело: 3 };
  assert.ok(G.craftUI && typeof G.craftUI.open === 'function',
    'Game.craftUI.open создан (src/craft-ui.js, задача 000126)');
  G.craftUI.open({ building: b8, hero: c });
  assert.equal(G.craftUI.isActive(), true, 'экран открыт');
  const ov = findCraftOverlay(h);
  assert.ok(ov, 'оверлей .craft-overlay в DOM');
  const all = textOf(ov);
  // Группировка по виду + уровень виду (контракт: «<вид> — уровень L»).
  assert.ok(/кузнечное/.test(all),
    'заголовок группы: имя вида (кузнечное_дело)');
  assert.ok(/уровень\s*3/.test(all),
    'уровень виду L = craftLevel(hero, вид) = 3; факт: '
    + (all.match(/[^\n]*уровень[^\n]*/g) || []).join(' | '));
  // Все 6 рецептов здания — на экране (чужие — нет).
  for (const r of here) {
    assert.ok(all.includes(r.название),
      'рецепт на экране: ' + r.название);
  }
  const foreign = G.Craft.CRAFT.filter((r) =>
    !Array.isArray(r.здания) || !r.здания.includes(8));
  for (const r of foreign) {
    assert.ok(!all.includes(r.название),
      'рецепт ЧУЖОГО здания НЕ на экране: ' + r.название);
  }
  // Кнопки «изготовить»: data-craftact='craft' data-recipe=<id>.
  const btns = findAll(ov, 'button[data-craftact="craft"]');
  assert.equal(btns.length, 6, 'кнопка на каждый рецепт здания');
  const ids = btns.map((b) => b.dataset.recipe).sort();
  assert.deepEqual(ids, here.map((r) => r.id).sort(),
    'data-recipe — id рецепта');
  // «нужно ур. N / есть L»: уровень 3 < 4 у steel_sword — пометка +
  // disabled по canCraft; у iron_sword (ур. 2 ≤ 3) — не хватает
  // исходников (инвентарь пуст) — disabled с причиной.
  const steel = recipeRow(ov, 'steel_sword');
  assert.ok(steel.row && /нужно ур\.?\s*4/.test(textOf(steel.row)),
    'meta steel_sword: «нужно ур. 4 / есть 3»; факт: '
    + (steel.row ? textOf(steel.row).replace(/\n/g, ' ') : 'нет строки'));
  assert.ok(steel.btn && steel.btn.disabled,
    'steel_sword: уровень 3 < 4 — кнопка disabled');
  assert.ok(/недостаточный уровень/.test(steel.btn.title),
    'title steel_sword — причина canCraft; факт: ' + steel.btn.title);
  const sword = recipeRow(ov, 'iron_sword');
  assert.ok(sword.btn && sword.btn.disabled,
    'iron_sword: исходников нет — кнопка disabled');
  assert.ok(/не хватает/.test(sword.btn.title)
    && sword.btn.title.includes('Деревянный меч'),
    'title iron_sword — причина canCraft (первый нехватившийся '
    + 'исходник); факт: ' + sword.btn.title);
  // Исходники в строке рецепта (имена предметов).
  const swordRow = textOf(sword.row);
  assert.ok(swordRow.includes('Деревянный меч')
    && swordRow.includes('Сера'),
    'исходники iron_sword в строке (имена); факт: '
    + swordRow.replace(/\n/g, ' '));
  // Шансы: «качество: X%» / «выход: Y%» (у постройки качество > 0).
  assert.ok(/качество/i.test(all) && /выход/i.test(all),
    'строки шансов «качество…»/«выход…» на экране');
  // Результат: «→ <имя> ×n».
  assert.ok(all.includes('Железный меч'), 'результат: имя предмета');
  assert.ok(/Железный меч[^\n]*×\s*1|×\s*1[^\n]*Железный меч/
    .test(all.replace(/\n/g, ' ')) || all.includes('×1'),
    'результат: количество ×1');
  G.craftUI.close();
  assert.equal(G.craftUI.isActive(), false, 'close() закрыл экран');
  // Исходники ДАНЫ → iron_sword доступен; leather_armor (ур. 3 ≤ 3)
  // всё ещё нет (нужны Кожа/Уголь) — нехватка, а не уровень.
  G.addItem(c, 'wood_sword', 1);
  G.addItem(c, 'sulfur', 2);
  G.craftUI.open({ building: b8, hero: c });
  const ov2 = findCraftOverlay(h);
  assert.ok(ov2, 'экран открыт повторно');
  const sword2 = recipeRow(ov2, 'iron_sword');
  assert.ok(sword2.btn && !sword2.btn.disabled,
    'iron_sword: исходники есть, уровень 3 ≥ 2 — кнопка активна');
  const leather = recipeRow(ov2, 'leather_armor');
  assert.ok(leather.btn && leather.btn.disabled,
    'leather_armor (ур. 3 ≤ 3): без Кожи/Угля — disabled (нехватка)');
  G.craftUI.close();
});

// --- CU-5: крафт (детерминированный Math.random) ---

test('CU-5. крафт: «изготовить» — исходники списаны, бонус качества в слоте, xp виду; повтор — отказ в лог', async () => {
  const h = await boot();
  assert.equal(h.errors.length, 0,
    'ошибок загрузки цепочки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const b8 = G.getBuilding(8);
  const c = G.createCharacter();
  c.craft = { кузнечное_дело: 2 }; // iron_sword: нужно ур. 2
  G.addItem(c, 'wood_sword', 1);
  G.addItem(c, 'sulfur', 2);
  assert.ok(G.craftUI && typeof G.craftUI.open === 'function',
    'Game.craftUI.open создан (src/craft-ui.js, задача 000126)');
  G.craftUI.open({ building: b8, hero: c });
  const ov = findCraftOverlay(h);
  assert.ok(ov, 'экран открыт');
  const before = {
    wood: G.totalQty(c, 'wood_sword'),
    sulfur: G.totalQty(c, 'sulfur'),
    result: G.totalQty(c, 'iron_sword'),
  };
  assert.equal(before.result, 0, 'результата ещё нет');
  // Роллы ПРЯМО ПЕРЕД кликом: качество 0.001 (< 0.055 — да),
  // выход 0.999 (> 0.022 — нет).
  resetSeq(h, [0.001, 0.999]);
  const { btn } = recipeRow(ov, 'iron_sword');
  assert.ok(btn && !btn.disabled, 'iron_sword доступен (ур. 2, исходники)');
  assert.ok(ov.listeners && ov.listeners.click && ov.listeners.click.length,
    'делегированный click-обработчик на оверлее');
  ov.listeners.click[0]({ target: btn });
  // Исходники списаны, результат в инвентаре.
  assert.equal(G.totalQty(c, 'wood_sword'), before.wood - 1,
    'исходник wood_sword ×1 списан');
  assert.equal(G.totalQty(c, 'sulfur'), before.sulfur - 2,
    'исходник sulfur ×2 списан');
  assert.equal(G.totalQty(c, 'iron_sword'), 1, 'результат в инвентаре');
  // Качество: бонус качества — ОТДЕЛЬНЫЙ слот (weapon → damage).
  // Множитель вида у свежего персонажа = 1 (forge 0) → +1.
  const bonusSlot = (c.inventory.slots || [])
    .find((s) => s.id === 'iron_sword' && s.bonus);
  assert.ok(bonusSlot,
    'качество выпало (ролл 0.001 < 0.055): слот результата с бонусом');
  assert.equal(bonusSlot.bonus.damage, 1,
    'бонус качества: damage = max(1, round(1 × mult(вид))) = 1');
  // Xp виду: 10 + уровень рецепта (2) = 12; уровень 2 не меняется
  // (12 < craftXpForNext(2) = 45).
  assert.equal(G.Craft.craftLevel(c, 'кузнечное_дело'), 2, 'уровень виду не вырос');
  assert.equal(c.craftXp['кузнечное_дело'], 12,
    'xp виду = 10 + уровень рецепта (12)');
  // Лог: результат крафта.
  const logEl = findAll(ov, '.craft-log')[0];
  assert.ok(logEl, 'лог .craft-log на экране');
  assert.ok(logEl.textContent.includes('Железный меч'),
    'лог: результат (имя предмета); факт: ' + logEl.textContent);
  // Повтор без исходников — отказ: причина в лог, инвентарь не тронут.
  const { btn: btn2 } = recipeRow(ov, 'iron_sword');
  assert.ok(btn2 && btn2.disabled, 'после крафта исходников нет — disabled');
  ov.listeners.click[0]({ target: btn2 });
  assert.equal(G.totalQty(c, 'iron_sword'), 1,
    'при отказе результат НЕ добавлен');
  assert.equal(G.totalQty(c, 'wood_sword'), 0,
    'при отказе исходники не списаны (их и так не осталось)');
  assert.ok(/не хватает/.test(logEl.textContent),
    'лог: причина отказа; факт: ' + logEl.textContent);
});

// --- CU-6: зачарование (пикер заклинаний) ---

test('CU-6. зачарование: пикер только изученных (с маной), мана списана, бонус качества+заклинания', async () => {
  const h = await boot();
  assert.equal(h.errors.length, 0,
    'ошибок загрузки цепочки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const b18 = G.getBuilding(18);
  assert.ok(b18, 'постройка 18 (Башня мага) в каталоге');
  // (a) Заклинание не изучено — рецепт недоступен, пикера нет.
  const c0 = G.createCharacter();
  c0.craft = { зачарование: 5 };
  c0.spells = [];
  G.addItem(c0, 'short_bow', 1);
  G.addItem(c0, 'phoenix_feather', 1);
  assert.ok(G.craftUI && typeof G.craftUI.open === 'function',
    'Game.craftUI.open создан (src/craft-ui.js, задача 000126)');
  G.craftUI.open({ building: b18, hero: c0 });
  let ov = findCraftOverlay(h);
  let row = recipeRow(ov, 'hunting_bow').row;
  assert.ok(row, 'рецепт hunting_bow на экране (здания 18)');
  const spellBtns0 = row ? findAll(row, '[data-spell]') : [];
  assert.equal(spellBtns0.length, 0,
    'без изученных заклинаний пикера НЕТ');
  const btn0 = recipeRow(ov, 'hunting_bow').btn;
  assert.ok(btn0 && btn0.disabled,
    'hunting_bow: заклинание не изучено — disabled');
  assert.ok(/заклинание не изучено/.test(btn0.title),
    'title — причина canCraft; факт: ' + btn0.title);
  G.craftUI.close();
  // (b) Изучено frost_bolt (мани 4) — пикер с маной, крафт списывает
  // ману, бонус = качество (1) + заклинание (степень 1) = 2.
  const c = G.createCharacter();
  c.craft = { зачарование: 5, алхимия: 6 };
  c.spells = ['frost_bolt'];
  const mp0 = c.mp;
  assert.equal(mp0, 16, 'свежий персонаж: maxMP 16 (проверка фикстуры)');
  G.addItem(c, 'short_bow', 1);
  G.addItem(c, 'phoenix_feather', 1);
  G.craftUI.open({ building: b18, hero: c });
  ov = findCraftOverlay(h);
  // Два вида здания 18: алхимия (greater_healing) + зачарование.
  const all = textOf(ov);
  assert.ok(/алхимия/.test(all) && /зачарование/.test(all),
    'группы по обоим видам здания 18; факт: '
    + (all.match(/[^\n]*(алхимия|зачарование)[^\n]*/g) || []).join(' | '));
  row = recipeRow(ov, 'hunting_bow').row;
  const spellBtn = findAll(row, '[data-spell="frost_bolt"]')[0];
  assert.ok(spellBtn,
    'пикер: кнопка заклинания data-spell="frost_bolt" (изученное)');
  assert.ok(/Морозная стрела/.test(textOf(row)),
    'пикер: имя заклинания');
  assert.ok(/4/.test(textOf(spellBtn)),
    'пикер: мана заклинания (4); факт: ' + textOf(spellBtn).replace(/\n/g, ' '));
  // Неизученного/чужого в пикере нет.
  assert.equal(findAll(row, '[data-spell="fireball"]').length, 0,
    'неизученное заклинание в пикере отсутствует');
  const btn = recipeRow(ov, 'hunting_bow').btn;
  assert.ok(btn && !btn.disabled,
    'hunting_bow: ур. 5 ≤ 5, исходники, изученное заклинание — активна');
  resetSeq(h, [0.001, 0.999]); // качество да, выход нет
  ov.listeners.click[0]({ target: btn });
  assert.equal(G.totalQty(c, 'hunting_bow'), 1, 'результат в инвентаре');
  assert.equal(c.mp, mp0 - 4, 'мана заклинания списана (−4)');
  const bonusSlot = (c.inventory.slots || [])
    .find((s) => s.id === 'hunting_bow' && s.bonus);
  assert.ok(bonusSlot, 'слот результата с бонусом');
  assert.equal(bonusSlot.bonus.damage, 2,
    'бонус = качество (1, mult 1) + заклинание (урон, степень 1) = 2');
  assert.equal(c.craftXp['зачарование'], 15,
    'xp виду = 10 + уровень рецепта (5) = 15');
  G.craftUI.close();
  // (v) Пикер фильтрует recipe.заклинания ∩ hero.spells: синтетический
  // рецепт с ДВУМЯ заклинаниями, изучен только frost_bolt.
  const fake = {
    id: 'zz_test_2sp', название: 'Тест-двойное зачарование',
    тип: 'зачарование', результат: { предмет: 'hunting_bow', количество: 1 },
    исходники: [{ предмет: 'short_bow', количество: 1 }],
    навыки: ['archer'], здания: [18],
    заклинания: ['frost_bolt', 'fireball'], уровень: 1,
    описание: 'тест',
  };
  try {
    G.Craft.CRAFT.push(fake);
    const c3 = G.createCharacter();
    c3.craft = { зачарование: 5 };
    c3.spells = ['frost_bolt'];
    G.addItem(c3, 'short_bow', 1);
    G.craftUI.open({ building: b18, hero: c3 });
    ov = findCraftOverlay(h);
    const frow = recipeRow(ov, 'zz_test_2sp').row;
    assert.ok(frow, 'синтетический рецепт отрисован');
    const fbtns = findAll(frow, '[data-spell]');
    assert.equal(fbtns.length, 1,
      'пикер: только ИЗУЧЕННОЕ из recipe.заклинания (1 из 2)');
    assert.equal(fbtns[0].dataset.spell, 'frost_bolt',
      'единственный вариант — изученное frost_bolt');
  } finally {
    G.Craft.CRAFT.pop(); // возврат каталога (общая песочница)
    G.craftUI.close();
  }
});

// --- CU-7: деградация (000053) + осиротевшая марка 40/42 ---

test('CU-7. деградация: craft-ui.js грузится чисто без зависимостей; open() без Craft — console.error, без краха; 40/42 — осиротевшая марка не гасит строку', async () => {
  // (1) Файл/модуль: без ЛЮБЫХ зависимостей — без исключения (000053);
  // след в консоли допустим (гард саморегистрации specials).
  const p = path.join(ROOT, 'src', 'craft-ui.js');
  assert.ok(fs.existsSync(p), 'src/craft-ui.js создан (задача 000126)');
  const code = fs.readFileSync(p, 'utf8');
  let threw = false;
  {
    const errors = [];
    const sandbox = {
      console: {
        error: (m) => errors.push(String(m)),
        warn: () => {}, log: () => {},
      },
      Game: {},
    };
    vm.createContext(sandbox);
    try {
      vm.runInContext(code, sandbox, { filename: 'craft-ui.js' });
    } catch (e) { threw = true; }
    assert.equal(threw, false, 'загрузка без зависимостей — без исключения');
    assert.ok(sandbox.Game.craftUI,
      'Game.craftUI создан (модуль живёт без зависимостей)');
    // open() без Game.Craft — деградация: console.error, без краха.
    const errs2 = [];
    sandbox.console.error = (m) => errs2.push(String(m));
    let threw2 = false;
    try {
      sandbox.Game.craftUI.open({ building: { id: 8 }, hero: {} });
    } catch (e) { threw2 = true; }
    assert.equal(threw2, false, 'open() без Game.Craft — без исключения');
    assert.ok(errs2.length >= 1, 'гард оставил след в консоли (000053)');
    assert.equal(sandbox.Game.craftUI.isActive(), false,
      'экран не открыт (деградация)');
  }
  // (2) С buildingActions (реестр specials) — загрузка ЧИСТАЯ и
  // спец-действие 'craft' саморегистрировано.
  const reg = [];
  {
    const errors = [];
    const sandbox = {
      console: {
        error: (m) => errors.push(String(m)),
        warn: () => {}, log: () => {},
      },
      Game: {
        buildingActions: {
          registerSpecial(id, fn) { reg.push([id, fn]); },
        },
      },
    };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { filename: 'craft-ui.js' });
    assert.equal(errors.length, 0,
      'загрузка с buildingActions — без ошибок: ' + errors.join('; '));
    assert.equal(reg.length, 1, 'одна саморегистрация при загрузке');
    assert.equal(reg[0][0], 'craft', 'id спец-действия — «craft»');
    assert.equal(typeof reg[0][1], 'function', 'хендлер — функция');
  }
  // (3) 40/42: осиротевшая марка 'x,y:craft' в сейве (её писал бы
  // общий пайплайн после успешного крафта: hasDailyLimit(40, 'craft')
  // — per-building раз_в_день). Строка 'craft' синтезирована ВНЕ
  // цикла effectIds — живого чека марки у неё НЕТ → крафт у 40/42
  // доступен повторно в тот же день (решение 5 контракта).
  const h = await boot();
  assert.equal(h.errors.length, 0,
    'ошибок загрузки цепочки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const b40 = G.getBuilding(40);
  assert.ok(b40, 'постройка 40 (Рунический камень) в каталоге');
  const state = {
    day: 1, tile: { x: 0, y: 0 }, hero: {},
    save: { buildingOncePerDay: { '0,0:craft': 1 } },
  };
  const rows = G.buildingEffects.buildingActions(b40, null, state);
  const row = rows.find((r) => r.id === 'craft');
  assert.ok(row,
    'у здания 40 есть строка id «craft»; факт: '
    + JSON.stringify(rows.map((r) => r.id)));
  assert.equal(row.доступен, true,
    'осиротевшая марка 0,0:craft НЕ гасит строку «Крафт» '
    + '(крафт у 40/42 не ограничен раз-в-день)');
});

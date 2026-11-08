// Задача 000301: книга заклинаний вне боя — вкладки по школам магии
// сверху, каждая — с иконкой школы (красные тесты, станция TDD).
// ТЗ: tasks/pending/000301.md. Контракт:
// memory/000301-spellbook-school-tabs.md (§2.2-2.6, §5).
//
// Контракты (красные): 6 вкладок .spoc-tab c data-school в порядке
// ТЗ [защита, исцеление, лёд, огонь, природа, тень]; вкладка =
// <button> + img.spoc-tab-icon (assets/school-icons/*.svg — 1:1 со
// SCHOOLS, файлы на диске), title/alt = имя школы; дефолт (и после
// close) — «все» = АКТИВНОЙ вкладки нет (нет 7-й вкладки «Все»);
// клик по вкладке = фильтр списка по «школе» (ровно строки этой
// школы); клик по другой = ПЕРЕКЛЮЧЕНИЕ; повторный клик по
// АКТИВНОЙ = снять фильтр; close() сбрасывает к «все»; empty-текст
// с фильтром — динамический «Нет изученных заклинаний школы
// «<name>»», без фильтра — «Нет изученных заклинаний вне боя» БЕЗ
// ИЗМЕНЕНИЙ (пин-контекст OC12); CSS-правила .spoc-tabs/.spoc-tab/
// .spoc-tab--active/.spoc-tab-icon в index.html (union, палитра
// блока .spoc-*), .spoc-row НЕ изменён (гард).
//
// Краснота (на master 9ef5821 — ОСМЫСЛЕННО: функциональности нет,
// не синтаксис): T1-T4 — .spoc-tabs/вкладки/динамический
// empty-текст отсутствуют (книга открывается KeyB'ом, строки
// рисуются — падение в ассертах на отсутствующий DOM/текст); T5 —
// CSS-правил .spoc-tab* в index.html нет; svg.test.js (отдельный
// файл) — пин 'school-icons': 6 при 0 файлов на диске.
//
// Фикстуры — 6 РЕАЛЬНЫХ вне_боя заклинаний по одному на школу
// (каталог assets/spells, сверено 2026-11-02): warding_circle
// (защита), prayer (исцеление), frost_walk (лёд), firelight (огонь),
// wild_growth (природа), shadow_step (тень). Инъекций гостей НЕТ —
// каталог master уже содержит их.
//
// Харнес: дубль tests/spellbook-oc-e2e.test.js (000235.02):
// самодостаточная full-chain vm-песочница — CHAIN из index.html
// (динамический), Proxy-DOM makeEl (dataset/listeners/R11),
// WebGL/Image-стабы, performance.now() заморожен на NOW=1000,
// boot/drain/key, dismissStartWindow, learn.
//
// T6 (правки по итогам ревью): browser-семантика children — в
// браузере element.children = HTMLCollection (Array.isArray ===
// false), а vm-стаб makeEl держит обычный Array и маскирует
// production: регресс-пин, что активный класс вкладок применяется
// и когда children НЕ Array (индекс/length/итератор).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

// Цепочка скриптов — из index.html (не хардкод).
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));
const NOW = 1000; // performance.now() в песочнице заморожен на NOW

// SCHOOLS — ожидаемая мапа школа→(имя, иконка, фикстурное заклинание);
// порядок массива = порядок вкладок = порядок ТЗ (контракт §2.2-2.3).
const SCHOOLS = [
  { id: 'защита', name: 'Защита', icon: 'assets/school-icons/protection.svg', spell: 'warding_circle' },
  { id: 'исцеление', name: 'Исцеление', icon: 'assets/school-icons/healing.svg', spell: 'prayer' },
  { id: 'лёд', name: 'Лёд', icon: 'assets/school-icons/ice.svg', spell: 'frost_walk' },
  { id: 'огонь', name: 'Огонь', icon: 'assets/school-icons/fire.svg', spell: 'firelight' },
  { id: 'природа', name: 'Природа', icon: 'assets/school-icons/nature_school.svg', spell: 'wild_growth' },
  { id: 'тень', name: 'Тень', icon: 'assets/school-icons/shadow.svg', spell: 'shadow_step' },
];
const ALL_SIX = SCHOOLS.map((s) => s.spell);

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

// --- «Снисходительный» DOM-элемент с деревом (dataset, closest,
// querySelectorAll) — дубль tests/spellbook-oc-e2e.test.js. ---
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
      return () => undefined; // неизвестный метод DOM — no-op
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function makeStorage(seed) {
  const m = new Map();
  if (seed != null) m.set('phlogiston.save', JSON.stringify(seed));
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
    'ошибок загрузки нет (порядок цепочки — load-clean 000038): '
    + h.errors.join('; '));
  // frame() main.js — единственный rAF-колбэк после старта; кадр
  // пере планирует себя (одна и та же функция) — frameFn валидна.
  h.frameFn = h.raf[h.raf.length - 1];
  return h;
}

// --- Ввод: массив слушателей снапшотится ПЕРЕД диспетчем ---
function key(h, code, extra = {}) {
  const e = Object.assign(
    { code, preventDefault() {}, stopPropagation() {} }, extra);
  for (const fn of (h.winListeners['keydown'] || []).slice()) fn(e);
  return e;
}

// Стартовое окно (000138) активно при КАЖДОЙ загрузке до клика
// «Продолжить» (оверлей, не гейт) — книга в блок-списке.
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

// --- Вкладки (000301): навигация + клики по data-school (паттерн
// clickRow spellbook-oc-e2e) ---

function findTab(h, school) {
  const tab = h.body.querySelector('.spoc-tab[data-school="' + school + '"]');
  assert.ok(tab,
    'RED: вкладка школы «' + school + '» — .spoc-tab[data-school=…] '
    + 'в книге (master: ряд вкладок .spoc-tabs отсутствует)');
  return tab;
}

function clickTab(h, school) {
  const tab = findTab(h, school);
  const l = tab.listeners && tab.listeners.click;
  assert.ok(l && l.length > 0,
    'вкладка «' + school + '» — свой click-listener (makeEl)');
  l[l.length - 1]();
}

// Строки книги — ровно список (data-spell-id, порядок рендера).
function assertRows(h, ids, label) {
  const rows = findAll(h.body, '.spoc-row');
  const got = rows.map((r) => r.dataset['spell-id']);
  assert.deepEqual(got, ids,
    (label || 'строки') + ': .spoc-row (data-spell-id): '
    + JSON.stringify(got));
}

// Активные вкладки (класс-маркер выбора).
function activeSchools(h) {
  return findAll(h.body, '.spoc-tab--active').map((t) => t.dataset.school);
}

// boot + стартовое окно + 6 фикстурных заклинаний (по одному на
// школу, сверено с каталогом) + книга открыта (KeyB).
async function bootBook(h) {
  dismissStartWindow(h);
  const G = h.sandbox.Game;
  for (const s of SCHOOLS) {
    const rec = G.SpellsData.SPELLS_BY_ID[s.spell];
    assert.ok(rec && rec['вне_боя'] === true && rec['школа'] === s.id,
      'фикстура: ' + s.spell + ' — ' + s.id + ' / вне_боя (каталог)');
  }
  learn(h, ALL_SIX);
  h.frameFn(NOW + 16);
  key(h, 'KeyB');
  assert.ok(h.body.querySelector('.spellbook-oc'),
    'книга открыта (KeyB): .spellbook-oc в body');
  return h;
}

// =====================================================================
// T1-T4, T6 — vm (full-chain из index.html); T5 — node (fs-read CSS)
// =====================================================================

test('000301 T1: книга — 6 вкладок .spoc-tab c иконками в порядке ТЗ; у каждой img.spoc-tab-icon (src = assets/school-icons/*.svg, файл на диске, alt = имя); title = имя; НИ ОДНОЙ .spoc-tab--active (дефолт «все»); строк .spoc-row ровно 6 (поведение книги не изменилось); errors не растут', async () => {
  const h = await boot();
  await bootBook(h);
  const errBefore = h.errors.length;
  const tabsWrap = h.body.querySelector('.spoc-tabs');
  assert.ok(tabsWrap,
    'RED: ряд вкладок .spoc-tabs в .spoc-panel (master: отсутствует)');
  const panel = tabsWrap.parent;
  assert.ok(panel && String(panel.className).includes('spoc-panel'),
    'вкладки внутри .spoc-panel');
  const kids = panel.children.map((c) => c.className);
  assert.deepEqual(kids, ['spoc-title', 'spoc-tabs', '', 'spoc-hint'],
    'вкладки СВЕРХУ списка: .spoc-panel > [title, tabs, rows(без '
    + 'класса), hint]');
  const tabs = findAll(h.body, '.spoc-tab');
  assert.equal(tabs.length, 6,
    'РОВНО 6 вкладок (вкладки «Все» НЕТ — 7-й элемент дублирует '
    + 'режим): ' + tabs.length);
  tabs.forEach((t, i) => {
    const s = SCHOOLS[i];
    assert.equal(t.dataset.school, s.id,
      'вкладка ' + (i + 1) + ': data-school = «' + s.id + '» '
      + '(порядок ТЗ)');
    assert.equal(String(t.tagName).toLowerCase(), 'button',
      'вкладка «' + s.id + '» — <button> (a11y: иконка-без-текста)');
    assert.equal(t.type, 'button',
      'вкладка «' + s.id + '»: type="button"');
    const icons = findAll(t, 'img.spoc-tab-icon');
    assert.equal(icons.length, 1,
      'у вкладки «' + s.id + '» ровно ОДНА img.spoc-tab-icon');
    const ic = icons[0];
    assert.equal(ic.src, s.icon,
      'иконка «' + s.id + '»: src = ' + s.icon + ' (1:1 со SCHOOLS)');
    assert.equal(ic.alt, s.name,
      'иконка «' + s.id + '»: alt = «' + s.name + '»');
    assert.ok(fs.existsSync(path.join(ROOT, s.icon)),
      'иконка на диске: ' + s.icon);
    assert.equal(t.title, s.name,
      'вкладка «' + s.id + '»: title = «' + s.name + '»');
  });
  assert.deepEqual(activeSchools(h), [],
    'дефолт «все»: АКТИВНОЙ вкладки нет (0 активных)');
  assertRows(h, ALL_SIX, 'дефолт «все» — набор строк не изменился');
  assert.equal(h.errors.length, errBefore,
    'чистый путь (вкладки) — без новых console.error: '
    + h.errors.slice(errBefore).join('; '));
});

test('000301 T2: выбор вкладки = фильтр по школе: клик «огонь» → ровно firelight + «огонь» активна (остальные нет); клик «лёд» → ровно frost_walk (ПЕРЕКЛЮЧЕНИЕ: «лёд» активна, «огонь» нет); повторный клик по АКТИВНОЙ «лёд» → 6 строк, активной вкладки НЕТ (toggle off)', async () => {
  const h = await boot();
  await bootBook(h);
  // Клик «огонь»: фильтр — ровно заклинание школы «огонь».
  clickTab(h, 'огонь');
  assertRows(h, ['firelight'], 'клик «огонь»');
  assert.deepEqual(activeSchools(h), ['огонь'],
    '«огонь» — активна, остальные — нет');
  assert.equal(findTab(h, 'защита').className, 'spoc-tab',
    '«защита» НЕ активна (не «все школы активны сразу»)');
  // Клик «лёд»: ПЕРЕКЛЮЧЕНИЕ (не toggle — «лёд» ещё не была
  // активной).
  clickTab(h, 'лёд');
  assertRows(h, ['frost_walk'], 'клик «лёд» (переключение)');
  assert.deepEqual(activeSchools(h), ['лёд'],
    '«лёд» — активна (переключение)');
  assert.equal(findTab(h, 'огонь').className, 'spoc-tab',
    '«огонь» больше не активна (переключение, не toggle)');
  // Повторный клик по АКТИВНОЙ — снять фильтр (дефолт «все»).
  clickTab(h, 'лёд');
  assertRows(h, ALL_SIX, 'повторный клик по активной «лёд» (toggle off)');
  assert.deepEqual(activeSchools(h), [],
    'toggle off: активной вкладки НЕТ');
});

test('000301 T3: сброс к «все» при закрытии: состояние с активной школой → KeyB (close) → KeyB (open) → дефолт: 6 строк, активной вкладки НЕТ (close(): activeSchool=null, tabsEl=null)', async () => {
  const h = await boot();
  await bootBook(h);
  clickTab(h, 'огонь');
  assertRows(h, ['firelight'], 'фикстура: активна «огонь»');
  key(h, 'KeyB');
  assert.ok(!h.body.querySelector('.spellbook-oc'),
    'закрыта (KeyB → close): .spellbook-oc из body');
  key(h, 'KeyB');
  assert.ok(h.body.querySelector('.spellbook-oc'),
    'снова открыта (KeyB)');
  assertRows(h, ALL_SIX, 'после close/open: 6 строк');
  assert.deepEqual(activeSchools(h), [],
    'RED: после close/open — дефолт «все», активной вкладки нет '
    + '(master: состояния activeSchool нет)');
});

test('000301 T4: свежий герой (только боевые spark/mend, вне_боя нет): «все» → .spoc-empty «Нет изученных заклинаний вне боя» (текст БЕЗ ИЗМЕНЕНИЙ), 0 строк; клик «огонь» → .spoc-empty «Нет изученных заклинаний школы «Огонь»», 0 строк', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const spells = g.state.hero.spells;
  assert.ok(Array.isArray(spells) && spells.length > 0,
    'фикстура: hero.spells (массив, новый герой)');
  for (const id of spells) {
    const s = G.SpellsData.SPELLS_BY_ID[id];
    assert.ok(!s || s['вне_боя'] !== true,
      'фикстура: ' + id + ' — не вне_боя (дефолтный герой: только '
      + 'боевые)');
  }
  dismissStartWindow(h);
  h.frameFn(NOW + 16);
  key(h, 'KeyB');
  assert.ok(h.body.querySelector('.spellbook-oc'), 'книга открыта');
  let empties = findAll(h.body, '.spoc-empty');
  assert.equal(empties.length, 1, '«все»: .spoc-empty');
  assert.equal(String(empties[0].textContent),
    'Нет изученных заклинаний вне боя',
    '«все»: текст БЕЗ ИЗМЕНЕНИЙ (пин-контекст OC12)');
  assert.equal(findAll(h.body, '.spoc-row').length, 0, '«все»: 0 строк');
  clickTab(h, 'огонь');
  empties = findAll(h.body, '.spoc-empty');
  assert.equal(empties.length, 1, 'фильтр «огонь»: .spoc-empty');
  assert.equal(String(empties[0].textContent),
    'Нет изученных заклинаний школы «Огонь»',
    'RED: динамический empty-текст школы «Огонь» (master: один '
    + 'текст для обоих режимов)');
  assert.equal(findAll(h.body, '.spoc-row').length, 0,
    'фильтр «огонь»: 0 строк');
});

test('000301 T5: CSS-пины index.html — правила .spoc-tabs/.spoc-tab/.spoc-tab--active/.spoc-tab-icon (union; .spoc-tab: border + cursor pointer + width 32px; --active: border-color #d8c27a; иконка 24px); гард: .spoc-row НЕ изменён (display flex / border / cursor pointer)', () => {
  // rules() — паттерн OC18 (tests/index-order.test.js): ТОЧНЫЙ
  // селектор в начале строки, все вхождения; .spoc-tab ≠ .spoc-tabs
  // (regex `sel[ \t]*\{`).
  const rules = (selector) => {
    const re = new RegExp('^[ \\t]*'
      + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      + '[ \\t]*\\{([^}]*)\\}', 'gm');
    const out = [];
    let m;
    while ((m = re.exec(html))) {
      const decls = {};
      for (const part of m[1].split(';')) {
        const i = part.indexOf(':');
        if (i < 0) continue;
        const prop = part.slice(0, i).trim().toLowerCase();
        if (prop) decls[prop] = part.slice(i + 1).trim();
      }
      out.push(decls);
    }
    return out;
  };
  const first = (selector) => {
    const r = rules(selector);
    assert.ok(r.length > 0,
      'RED: CSS-правило ' + selector + ' { … } не найдено в '
      + 'index.html (задача 000301)');
    return r[0];
  };
  const tabs = first('.spoc-tabs');
  assert.equal(tabs['display'], 'flex', '.spoc-tabs: display flex');
  const tab = first('.spoc-tab');
  assert.ok(tab['border'], '.spoc-tab: border (сброс UA button)');
  assert.equal(tab['cursor'], 'pointer', '.spoc-tab: cursor pointer');
  assert.equal(tab['width'], '32px', '.spoc-tab: width 32px');
  const act = first('.spoc-tab--active');
  assert.equal(act['border-color'], '#d8c27a',
    '.spoc-tab--active: border-color #d8c27a (акцент-актив — '
    + 'прецедент .cp-portrait-active, палитра блока)');
  const ic = first('.spoc-tab-icon');
  assert.equal(ic['width'], '24px', '.spoc-tab-icon: width 24px');
  assert.equal(ic['height'], '24px', '.spoc-tab-icon: height 24px');
  // ГАРД: .spoc-row НЕ изменён (CSS union — чужие правила не
  // модифицировать).
  const row = first('.spoc-row');
  assert.equal(row['display'], 'flex', 'гард: .spoc-row display flex');
  assert.ok(row['border'], 'гард: .spoc-row border');
  assert.equal(row['cursor'], 'pointer', 'гард: .spoc-row cursor pointer');
});

// HTMLCollection-аналог (браузер: element.children — НЕ Array):
// индексные свойства + length + итератор, Array.isArray === false.
function toCollection(arr) {
  const col = {};
  for (let i = 0; i < arr.length; i++) col[i] = arr[i];
  col.length = arr.length;
  col[Symbol.iterator] = function* () {
    for (let i = 0; i < this.length; i++) yield this[i];
  };
  return col;
}

test('000301 T6: refreshTabs — browser-семантика children (.spoc-tabs.children НЕ Array: индекс/length/итератор, как HTMLCollection): клик «огонь» → className «огонь» = «spoc-tab spoc-tab--active», «защита» = «spoc-tab», фильтр = ровно firelight; повторный клик по АКТИВНОЙ «огонь» → 6 строк, активной вкладки НЕТ', async () => {
  const h = await boot();
  await bootBook(h);
  const tabsWrap = h.body.querySelector('.spoc-tabs');
  assert.ok(tabsWrap, 'фикстура: .spoc-tabs в открытой книге');
  const raw = tabsWrap.__raw;
  assert.ok(Array.isArray(raw.children),
    'фикстура: vm-стаб makeEl — children обычный Array (маскирует '
    + 'production)');
  raw.children = toCollection(raw.children);
  assert.ok(!Array.isArray(raw.children),
    'browser-вариант: children — НЕ Array (как HTMLCollection)');
  clickTab(h, 'огонь');
  assertRows(h, ['firelight'], 'фильтр — работает (children не Array)');
  assert.equal(findTab(h, 'огонь').className,
    'spoc-tab spoc-tab--active',
    'RED: активный класс ПРИМЕНЁН, когда children — НЕ Array '
    + '(production-браузер: element.children — HTMLCollection, '
    + 'Array.isArray === false)');
  assert.equal(findTab(h, 'защита').className, 'spoc-tab',
    '«защита» НЕ активна (активна только выбранная школа)');
  clickTab(h, 'огонь');
  assertRows(h, ALL_SIX, 'повторный клик по активной «огонь» '
    + '(toggle off)');
  assert.deepEqual(activeSchools(h), [],
    'toggle off: активной вкладки НЕТ (children не Array)');
});

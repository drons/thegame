// Задача 000331: баг — книга заклинаний В БОЮ без вкладок по школам
// (контракт 000301: 6 вкладок с иконками школ, фильтр строк по
// «школе», toggle off повторным кликом, сброс к «все» при закрытии).
// ТЗ: tasks/pending/000331.md. Контракт 000301 —
// memory/000301-spellbook-school-tabs.md (§2.2-2.6, §4).
//
// Контракты (красные): боевая книга (.combat-spellbook,
// src/combat-ui.js) — ряд вкладок .combat-spellbook-tabs — СИБЛИНГ
// книги в .combat-box (между .combat-spellbook и .combat-flee-confirm):
// 6 вкладок .spoc-tab (div, R9 — НЕ <button>: DOM-счётчики кнопок
// SB1 = 8) в порядке ТЗ 000301 [защита, исцеление, лёд, огонь,
// природа, тень], каждая — img.spoc-tab-icon (src =
// assets/school-icons/*.svg — 1:1 со SCHOOLS, единый источник),
// data-school + title = имя; дефолт «все» — активной вкладки НЕТ;
// клик = фильтр строк книги ПО ШКОЛЕ (строки — только этой школы),
// клик по другой — ПЕРЕКЛЮЧЕНИЕ, повторный клик по АКТИВНОЙ — снять
// фильтр, пустая школа — строка-маркер «—» (паттерн 000145);
// каст по строке из отфильтрованного вклада — путь бит-в-бит
// (castRow не тронут), после успешного каста книга закрыта и вкладка
// сброшена к «все»; строки книги без фильтра НЕ ИЗМЕНЕНЫ (spark,
// mend — бит-в-бит 000149); CSS — правило .combat-spellbook-tabs
// (absolute, зеркало формулы книги, pointer-events none (контейнер) /
// auto (вкладки) — контейнер .combat-spellbook pointer-events none
// (гард CU196)) + padding-top книги под ряд вкладок; portrait-
// зеркало.
//
// Краснота (на master — ОСМЫСЛЕННАЯ, не краш загрузки): ряд вкладок
// в .combat-box отсутствует (assert на отсутствующий DOM), CSS-
// правила отсутствуют (cssRule — assert «правило не найдено»);
// песочница стартует, бой создаётся, книга открывается KeyQ'ом,
// строки рисуются — падение в ассертах на отсутствующий DOM/CSS.
//
// Регрессия (б) — книга ВНЕ боя бит-в-бит: tests/spellbook-oc-tabs-
// test.js (000301 T1-T6) — в срезе, без правок.
//
// Харнес: дубль tests/combat-ui.test.js (vm-песочница, цепочка
// index.html, DOM-стаб makeEl БЕЗ setAttribute/innerHTML — строки при
// перестроении ДОБАВЛЯЮТСЯ, чтение — хвост children.slice(-N),
// 000149 §10).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const NOW = 1000;

// SCHOOLS — 6 школ (000301, единый источник Game.SpellBook.SCHOOLS);
// порядок = порядок вкладок = порядок ТЗ.
const SCHOOLS = [
  { id: 'защита', name: 'Защита', icon: 'assets/school-icons/protection.svg' },
  { id: 'исцеление', name: 'Исцеление', icon: 'assets/school-icons/healing.svg' },
  { id: 'лёд', name: 'Лёд', icon: 'assets/school-icons/ice.svg' },
  { id: 'огонь', name: 'Огонь', icon: 'assets/school-icons/fire.svg' },
  { id: 'природа', name: 'Природа', icon: 'assets/school-icons/nature_school.svg' },
  { id: 'тень', name: 'Тень', icon: 'assets/school-icons/shadow.svg' },
];

// --- Минимальный DOM-стаб (дубль tests/combat-ui.test.js) ---

function makeContext2d() {
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : () => {}),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

function makeEl(tag, buttons) {
  const el = {
    tagName: tag,
    className: '',
    textContent: '',
    title: '',
    style: {},
    dataset: {},
    children: [],
    onclick: null,
    listeners: {},
    appendChild(ch) {
      this.children.push(ch);
      ch.parentElement = this;
      return ch;
    },
    remove() {},
    addEventListener(type, fn) {
      (this.listeners[type] || (this.listeners[type] = [])).push(fn);
    },
    querySelectorAll() { return buttons; },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: this.width, height: this.height };
    },
  };
  if (tag === 'canvas') {
    el.width = 0;
    el.height = 0;
    el.getContext = () => makeContext2d();
  }
  return el;
}

// Цепочка src — порядок index.html (снапшот Game — UMD-ловушка 000038:
// spellbook.js ДО combat-ui.js). withSpells — каталог + движок (000149).
function loadCombatUi(opts = {}) {
  const keydown = [];
  const buttons = [];
  const document = {
    createElement: (tag) => {
      const el = makeEl(tag, buttons);
      if (tag === 'button') buttons.push(el);
      return el;
    },
    body: makeEl('body', buttons),
  };
  const window = {
    addEventListener: (type, fn) => {
      if (type === 'keydown') keydown.push(fn);
    },
  };
  const sandbox = { console, document, window };
  if (opts.performance) sandbox.performance = opts.performance;
  vm.createContext(sandbox);
  for (const f of [
    'global-settings.js', 'perlin.js', 'map.js',
    'skills-data.js', 'items-data.js',
    'sheet.js', 'player.js',
  ]) vm.runInContext(src(f), sandbox, { filename: f });
  for (const f of ['items.js', 'controls.js', 'combat.js']) {
    vm.runInContext(src(f), sandbox, { filename: f });
  }
  if (opts.withSpells) {
    for (const f of ['spells-data.js', 'spells.js']) {
      vm.runInContext(src(f), sandbox, { filename: f });
    }
  }
  vm.runInContext(src('combat-keys.js'), sandbox, { filename: 'combat-keys.js' });
  if (fs.existsSync(path.join(ROOT, 'src', 'spellbook.js'))) {
    vm.runInContext(src('spellbook.js'), sandbox, { filename: 'spellbook.js' });
  }
  vm.runInContext(src('sprites.js'), sandbox, { filename: 'sprites.js' });
  if (fs.existsSync(path.join(ROOT, 'src', 'combat-scale.js'))) {
    vm.runInContext(src('combat-scale.js'), sandbox,
      { filename: 'combat-scale.js' });
  }
  vm.runInContext(src('combat-ui.js'), sandbox, { filename: 'combat-ui.js' });
  vm.runInContext(src('motion.js'), sandbox, { filename: 'motion.js' });
  return { G: sandbox.Game, keydown, buttons, body: document.body };
}

function findByClass(el, cls) {
  if (el.className === cls) return el;
  for (const ch of el.children || []) {
    const found = findByClass(ch, cls);
    if (found) return found;
  }
  return null;
}

function press(keydown, code) {
  const e = { code, preventDefault() {}, stopPropagation() {} };
  for (const fn of keydown) fn(e);
}

// Ряд вкладок боевой книги (.combat-spellbook-tabs в .combat-box).
function tabsElOf(body) {
  const t = findByClass(body, 'combat-spellbook-tabs');
  assert.ok(t,
    '331-RED: ряд вкладок .combat-spellbook-tabs в .combat-box '
    + '(master: вкладки в боевой книге отсутствуют)');
  return t;
}

function tabOf(body, school) {
  const t = tabsElOf(body).children
    .find((x) => x.dataset && x.dataset.school === school);
  assert.ok(t,
    '331-RED: вкладка школы «' + school + '» '
    + '(.spoc-tab[data-school=…]) в боевой книге (master: отсутствует)');
  return t;
}

function clickTab(body, school) {
  const t = tabOf(body, school);
  const l = t.listeners && t.listeners.click;
  assert.ok(l && l.length > 0,
    'вкладка «' + school + '» — свой click-listener');
  l[l.length - 1]();
}

// Строки книги — дети .combat-spellbook с dataset.spell (строка-маркер
// «—» маркера пустой школы dataset.spell НЕ несёт). Хвост — семантика
// перестроения (стаб без innerHTML, 000149 §10).
function rowSpells(bookBox) {
  return bookBox.children
    .filter((ch) => ch.dataset && ch.dataset.spell !== undefined);
}

// Сцена: дефолтный герой (spark — огонь, mend — исцеление), волк,
// seed 42, ход игрока (фикстура 000149).
function scene331() {
  const { G, keydown, body, buttons } = loadCombatUi({
    performance: { now: () => NOW }, withSpells: true,
  });
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  assert.equal(G.activeUnitId(c), 'player', 'фикстура: ход игрока');
  const box = findByClass(body, 'combat-box');
  const bookBox = findByClass(body, 'combat-spellbook');
  assert.ok(box && bookBox, 'фикстура: .combat-box и .combat-spellbook');
  return { G, c, keydown, body, buttons, box, bookBox, tabsEl: null };
}

function openBook(S) {
  press(S.keydown, 'KeyQ');
  assert.notEqual(S.bookBox.style.display, 'none',
    'книга открыта (KeyQ)');
  const tabsEl = tabsElOf(S.body);
  assert.equal(tabsEl.style.display, 'flex',
    'книга открыта — ряд вкладок виден');
  return tabsEl;
}

function assertNoActive(tabsEl) {
  for (const t of tabsEl.children) {
    assert.ok(!String(t.className).includes('spoc-tab--active'),
      'дефолт «все»: активной вкладки нет (' + t.dataset.school + ')');
  }
}

test('боевая книга: 6 вкладок .spoc-tab (div, R9) с иконками школ в порядке ТЗ; дефолт «все»; строки книги НЕ ИЗМЕНЕНЫ (spark, mend) (331-CBT-1)', () => {
  const S = scene331();
  const tabsEl = tabsElOf(S.body);
  assert.equal(tabsEl.style.display, 'none',
    'книга закрыта — ряд вкладок скрыт');
  assert.equal(S.bookBox.style.display, 'none',
    'книга закрыта до KeyQ');
  assert.deepEqual(S.box.children.map((ch) => ch.className),
    ['', 'combat-spellbook', 'combat-spellbook-tabs',
      'combat-flee-confirm', 'combat-banner'],
    '000331: порядок детей .combat-box (вкладки — СИБЛИНГ книги, '
    + 'МЕЖДУ .combat-spellbook и .combat-flee-confirm): '
    + JSON.stringify(S.box.children.map((ch) => ch.className)));
  openBook(S);
  const tabs = tabsEl.children;
  assert.equal(tabs.length, 6,
    'РОВНО 6 вкладок (7-й «Все» НЕТ — прецедент 000301): '
    + tabs.length);
  tabs.forEach((t, i) => {
    const s = SCHOOLS[i];
    assert.equal(t.dataset.school, s.id,
      'вкладка ' + (i + 1) + ': data-school = «' + s.id
      + '» (порядок ТЗ 000301)');
    assert.equal(t.tagName, 'div',
      'вкладка «' + s.id + '» — div (R9: div, не <button> — '
      + 'DOM-счётчики кнопок)');
    assert.equal(t.title, s.name,
      'вкладка «' + s.id + '»: title = «' + s.name + '»');
    const icon = t.children.find((ch) => ch.tagName === 'img');
    assert.ok(icon, 'у вкладки «' + s.id + '» img.spoc-tab-icon');
    assert.equal(icon.className, 'spoc-tab-icon',
      'класс иконки — spoc-tab-icon (000301, переиспользование)');
    assert.equal(icon.src, s.icon,
      'иконка «' + s.id + '»: src = ' + s.icon + ' (1:1 со SCHOOLS)');
    assert.equal(icon.alt, s.name,
      'иконка «' + s.id + '»: alt = «' + s.name + '»');
    assert.ok(fs.existsSync(path.join(ROOT, s.icon)),
      'иконка на диске: ' + s.icon);
  });
  assertNoActive(tabsEl);
  assert.equal(S.buttons.length, 8,
    'кнопок = 8 (7 табличных + lastSpell) — вкладки div, в счётчик '
    + 'кнопок НЕ входят (SB1)');
  const rows = rowSpells(S.bookBox);
  assert.deepEqual(rows.map((r) => r.dataset.spell),
    ['spark', 'mend'],
    'строки книги БЕЗ ФИЛЬТРА НЕ ИЗМЕНЕНЫ (порядок листа)');
  assert.equal(S.bookBox.children.length, 2,
    'первая сборка — ровно 2 строки (бит-в-бит 000149): '
    + S.bookBox.children.length);
});

test('боевая книга: клик по вкладке = фильтр строк по школе; переключение; повторный клик — toggle off; пустая школа — маркер «—» (331-CBT-2)', () => {
  const S = scene331();
  const tabsEl = openBook(S);
  clickTab(S.body, 'огонь');
  assert.equal(tabOf(S.body, 'огонь').className,
    'spoc-tab spoc-tab--active', '«огонь» — активна');
  for (const t of tabsEl.children) {
    if (t.dataset.school !== 'огонь') {
      assert.equal(t.className, 'spoc-tab',
        '«' + t.dataset.school + '» НЕ активна (одна активная)');
    }
  }
  assert.deepEqual(
    rowSpells(S.bookBox).slice(-1).map((r) => r.dataset.spell),
    ['spark'],
    'фильтр «огонь» — ровно spark (строки — только этой школы; '
    + 'хвост children — перестроение, 000149 §10)');
  clickTab(S.body, 'исцеление');
  assert.deepEqual(
    rowSpells(S.bookBox).slice(-1).map((r) => r.dataset.spell),
    ['mend'],
    'переключение — ровно mend (не накопление)');
  assert.equal(tabOf(S.body, 'огонь').className, 'spoc-tab',
    '«огонь» больше не активна (переключение, не toggle)');
  assert.equal(tabOf(S.body, 'исцеление').className,
    'spoc-tab spoc-tab--active', '«исцеление» — активна');
  clickTab(S.body, 'исцеление');
  assert.deepEqual(
    rowSpells(S.bookBox).slice(-2).map((r) => r.dataset.spell),
    ['spark', 'mend'],
    'повторный клик по АКТИВНОЙ — снять фильтр (обе строки)');
  assertNoActive(tabsEl);
  const lenBefore = S.bookBox.children.length;
  clickTab(S.body, 'лёд');
  assert.equal(S.bookBox.children.length, lenBefore + 1,
    'пустая школа — перестроение добавило РОВНО ОДНУ строку');
  const last = S.bookBox.children[S.bookBox.children.length - 1];
  assert.equal(last.textContent, '—',
    'пустая школа — строка-маркер «—» (паттерн 000145)');
  assert.ok(String(last.className).includes('combat-spellrow-off'),
    'маркер — класс -off (НЕ кликабельна): ' + last.className);
  assert.equal(tabOf(S.body, 'лёд').className,
    'spoc-tab spoc-tab--active', '«лёд» — активна (пустой фильтр)');
});

test('боевая книга: каст по строке из отфильтрованного вклада — путь бит-в-бит; после каста книга закрыта, вкладка сброшена к «все» (331-CBT-3)', () => {
  const S = scene331();
  const m0 = S.c.units[0];
  m0.x = S.c.px; m0.y = S.c.py - 1; // в упор
  m0.hp = 9999; // каст НЕ завершает бой: волк переживает урон
  S.c._rng = () => 0.99;
  S.c.selectTarget(m0.id);
  assert.equal(S.c._fx, undefined, 'c._fx не записано до заклинания');
  const tabsEl = openBook(S);
  clickTab(S.body, 'огонь');
  const sparkRow = rowSpells(S.bookBox).slice(-1)[0];
  assert.equal(sparkRow.dataset.spell, 'spark',
    'в отфильтрованном вкладе «огонь» — строка spark');
  sparkRow.listeners.click[0](); // каст — кликом по строке
  assert.equal(S.c._fx && S.c._fx.action, 'cast',
    'c._fx.action = cast (путь каста НЕ тронут — 000149)');
  assert.ok(S.c._fx.until > NOW, 'until > now (FX ≈300 мс)');
  assert.equal(S.c.result, null,
    'фикстура: бой не завершён (волк пережил урон)');
  assert.equal(S.bookBox.style.display, 'none',
    'после успешного каста книга закрыта (зеркало master)');
  assert.equal(tabsEl.style.display, 'none',
    'после каста ряд вкладок скрыт (книга закрыта)');
  press(S.keydown, 'KeyQ');
  assert.notEqual(S.bookBox.style.display, 'none',
    'книга снова открыта (KeyQ)');
  assert.equal(tabsEl.style.display, 'flex',
    'ряд вкладок снова виден');
  assertNoActive(tabsEl);
  assert.deepEqual(
    rowSpells(S.bookBox).slice(-2).map((r) => r.dataset.spell),
    ['spark', 'mend'],
    'после сброса к «все» — сплошная книга (фильтр сброшен)');
});

// --- CSS (index.html): правило ряда вкладок + гард .combat-spellbook ---

function cssRule(selector) {
  const re = new RegExp('^[ \\t]*'
    + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    + '[ \\t]*\\{([^}]*)\\}', 'm');
  const m = html.match(re);
  assert.ok(m,
    '331-RED: CSS-правило ' + selector + ' { … } не найдено в '
    + 'index.html (master: правила ряда вкладок нет)');
  const decls = {};
  for (const part of m[1].split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const prop = part.slice(0, i).trim().toLowerCase();
    if (prop) decls[prop] = part.slice(i + 1).trim();
  }
  return decls;
}

function portraitMediaBody() {
  const m = html.match(
    /@media \(max-width: 640px\)\s*and\s*\(orientation: portrait\)\s*\{([\s\S]*?)\n    \}/);
  assert.ok(m, 'portrait-медиазапрос (max-width: 640px) найден');
  return m[1];
}

function portraitRule(selector) {
  const re = new RegExp('[ \\t]*'
    + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    + '[ \\t]*\\{([^}]*)\\}');
  const mm = portraitMediaBody().match(re);
  assert.ok(mm,
    '331-RED: правило ' + selector
    + ' не найдено в portrait-медиазапросе (master: отсутствует)');
  const block = mm[1].replace(/\/\*[\s\S]*?\*\//g, ' ');
  const decls = {};
  for (const part of block.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const prop = part.slice(0, i).trim().toLowerCase();
    if (prop) decls[prop] = part.slice(i + 1).trim();
  }
  return decls;
}

test('index.html: ряд вкладок боевой книги — absolute, зеркало формулы книги (row/portrait), pointer-events none (контейнер) / auto (вкладки); гард .combat-spellbook (padding-top под ряд, фон, pointer-events none) (331-CBT-CSS)', () => {
  const tb = cssRule('.combat-overlay--combat .combat-spellbook-tabs');
  assert.equal(tb['position'], 'absolute',
    'ряд вкладок — absolute в .combat-box (краснота: правила нет)');
  assert.equal(tb['top'],
    'calc(50% - min(100vh - 32px, 100vw - 304px) / 2 + 10px)',
    'ряд — ВЕРХ книги + 10px (зеркало формулы высоты книги): '
    + tb['top']);
  assert.equal(tb['left'], '50%', 'центрирование по X');
  assert.equal(tb['transform'], 'translateX(-50%)',
    'центрирование по X: translateX(-50%)');
  assert.equal(tb['display'], 'flex', 'ряд — flex');
  assert.equal(tb['flex-wrap'], 'wrap', 'ряд — flex-wrap wrap');
  assert.equal(tb['gap'], '8px', 'ряд — gap 8px (палитра 000301)');
  assert.equal(tb['max-width'],
    'calc(min(100vh - 32px, 100vw - 304px) - 20px)',
    'ряд — max-width = ширина книги − padding 10×2 (не шире книги)');
  assert.equal(tb['pointer-events'], 'none',
    'контейнер ряда — pointer-events none (клики мимо вкладок — '
    + 'в canvas, как .combat-spellbook)');
  const tabCss = cssRule(
    '.combat-overlay--combat .combat-spellbook-tabs .spoc-tab');
  assert.equal(tabCss['pointer-events'], 'auto',
    'вкладки — pointer-events auto (клик-фильтр работает поверх '
    + 'pass-through книги)');
  const sb = cssRule('.combat-overlay--combat .combat-spellbook');
  assert.equal(sb['padding'], '54px 10px 10px',
    'гард 000331: padding-top 54px — место под ряд вкладок '
    + '(32px вкладка + 10px сверху + 12px зазор): ' + sb['padding']);
  assert.equal(sb['background'], 'rgba(10, 12, 16, 0.85)',
    'гард: фон книги НЕ ИЗМЕНЁН (CU196)');
  assert.equal(sb['pointer-events'], 'none',
    'гард: контейнер книги pointer-events none (CU196)');
  assert.equal(sb['width'], 'min(100vh - 32px, 100vw - 304px)',
    'гард: формула ширины книги (CU196)');
  assert.equal(sb['height'], 'min(100vh - 32px, 100vw - 304px)',
    'гард: формула высоты книги (CU196)');
  const ptb = portraitRule('.combat-overlay--combat .combat-spellbook-tabs');
  assert.equal(ptb['top'],
    'calc(50% - min(100vw - 16px, 100vh - 16px - 520px) / 2 + 10px)',
    'portrait: ряд — ВЕРХ книги + 10px (зеркало portrait-формулы)');
  assert.equal(ptb['max-width'],
    'calc(min(100vw - 16px, 100vh - 16px - 520px) - 20px)',
    'portrait: ряд — max-width = ширина книги − padding 10×2');
  const psb = portraitRule('.combat-overlay--combat .combat-spellbook');
  assert.equal(psb['width'], 'min(100vw - 16px, 100vh - 16px - 520px)',
    'гард: portrait-формула книги (CU196)');
  assert.equal(psb['height'], 'min(100vw - 16px, 100vh - 16px - 520px)',
    'гард: portrait-формула книги (CU196)');
});

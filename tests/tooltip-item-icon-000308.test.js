// Задача 000308 — КРАСНЫЕ ТЕСТЫ (TDD): тултип предмета в инвентаре/
// снаряжении — КРУПНАЯ иконка предмета при наведении.
//
// ТЗ — tasks/pending/000308.md; контракт —
// memory/000308-item-tip-icon.md (itemRow + 7-й аргумент tipIcon §2.1,
// CSS §2.2, скоуп §2.3, graceful §2.4, тесты §4).
//
// МЕХАНИКА: vm-песочница + ДИНАМИЧЕСКИЙ CHAIN (ВСЕ <script src>
// index.html до ui.js включительно — паттерн ui.test.js: подхватит
// любой новый тег сам; включает вкладочные модули ui-tab-*) + DOM-
// стаб — дубль tests/ui-panel.test.js (БЕЗ insertBefore/firstChild/
// createTextNode — это и есть условие деградации D4/D5) + ДВУХФАЗНАЯ
// загрузка loadEnv(fx): до items-data.js → (при fx)
// Game.ITEMS.concat(fx) → items.js строит каталог-Map из
// мутированного массива (паттерн ui.test.js). FX — ТОЛЬКО в
// vm-песочнице (каталог/ассеты — 0 diff).
//
// КРАСНЫЕ (4 — падают на неизменённом коде, функциональности ещё нет):
//   308-TI-1  «Инвентарь»: iron_ore → .cp-tip содержит img.cp-tipicon
//                 (src = icon из JSON, alt ''), текст цел, строка
//                 0-diff;
//   308-TI-2  «Снаряжение»: straw_hat (Голова) → .cp-tip содержит
//                 img.cp-tipicon (src из каталога), текст «Броня: 0»;
//   308-TI-3  «Быстрые слоты (бой)»: wood_scyte в Слоте 1 → .cp-tip
//                 содержит img.cp-tipicon (src из каталога) — общий
//                 механизм на второй секции вкладки;
//   308-TI-4  CSS index.html: правило .char-panel .cp-tip .cp-tipicon —
//                 float: left, 44×44px (> 22px), margin-right: 8px;
//                 регрессия .cp-itemicon — 22×22px.
// ЗЕЛЁНЫЙ с первого запуска (гвард, в red-счёт НЕ входит):
//   308-TI-G  предмет БЕЗ иконки (FX-фикстура, не каталог — 000302
//                 добавит иконки всем 193 без) → .cp-tip ЕСТЬ, img
//                 в нём НЕТ (graceful, без плейсхолдера); строка
//                 0-diff (первый ребёнок span.cp-itemname); 6-арг.
//                 семантика: tip есть, tipIcon нет → img нет.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const page = () => fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// --- DOM-стаб с деревом (дубль tests/ui-panel.test.js:202-257:
// «.класс», имя тега, parent/closest, textContent сбрасывает детей;
// insertBefore/firstChild/createTextNode — НЕТ) ---

function matchesSel(el, sel) {
  const m = /^([a-zA-Z][\w-]*)\[([\w-]+)(?:=([^\]]+))?\]$/.exec(sel);
  if (m) {
    if (String(el.tagName || '').toLowerCase() !== m[1].toLowerCase()) {
      return false;
    }
    const keys = [m[2]];
    if (m[2].startsWith('data-')) keys.push(m[2].slice(5));
    const key = keys.find((k) => k in el.dataset);
    if (key === undefined) return false;
    if (m[3] !== undefined) {
      const val = m[3].replace(/^['"]|['"]$/g, '');
      return String(el.dataset[key]) === val;
    }
    return true;
  }
  if (sel.startsWith('.')) {
    return String(el.className || '').split(/\s+/).includes(sel.slice(1));
  }
  return String(el.tagName || '').toLowerCase() === sel.toLowerCase();
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
  const el = {
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
      if (ch.parent) {
        ch.parent.children.splice(ch.parent.children.indexOf(ch), 1);
      }
      ch.parent = this;
      this.children.push(ch);
      return ch;
    },
    remove() {
      if (this.parent) {
        const i = this.parent.children.indexOf(this);
        if (i >= 0) this.parent.children.splice(i, 1);
        this.parent = null;
      }
    },
    addEventListener(type, fn) {
      (this.listeners[type] || (this.listeners[type] = []))
        .push(fn);
    },
    setAttribute(name, value) { this.dataset[name] = value; },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    querySelector(sel) { return findAll(this, sel)[0] || null; },
    querySelectorAll(sel) { return findAll(this, sel); },
    closest(sel) {
      let n = this;
      while (n) {
        if (matchesSel(n, sel)) return n;
        n = n.parent;
      }
      return null;
    },
  };
  Object.defineProperty(el, 'textContent', {
    get() { return this._text; },
    set(v) {
      this._text = String(v);
      for (const ch of this.children) ch.parent = null;
      this.children.length = 0;
    },
  });
  return el;
}

// --- ДИНАМИЧЕСКИЙ CHAIN: ВСЕ <script src> index.html до ui.js
// включительно (паттерн ui.test.js:162-169) — включает ВСЕ
// вкладочные модули ui-tab-* (они грузятся ДО ui.js) + items.js/
// player.js/controls.js ---

const CHAIN = (() => {
  const all = Array.from(
    page().matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
    .map((p) => p.replace(/^src\//, ''));
  const i = all.indexOf('ui.js');
  assert.ok(i >= 0, 'ui.js подключён в index.html');
  return all.slice(0, i + 1);
})();

// --- ДВУХФАЗНАЯ загрузка: phase 1 до items-data.js → (при fx)
// Game.ITEMS.concat(fx) → phase 2 (items.js строит каталог-Map из
// мутированного Game.ITEMS; без fx — один код-путь без concat) ---

function loadEnv(fx) {
  const errors = [];
  const document = {
    createElement: (tag) => makeEl(tag),
    body: makeEl('body'),
    querySelector: () => null,
    hidden: false,
    listeners: {},
    addEventListener(type, fn) {
      (this.listeners[type] || (this.listeners[type] = []))
        .push(fn);
    },
    removeEventListener(type, fn) {
      const a = this.listeners[type];
      if (!a) return;
      const i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    },
  };
  const window = {
    addEventListener: () => {}, removeEventListener: () => {},
  };
  const sandbox = {
    console: {
      log: () => {}, info: () => {}, warn: () => {},
      error: (m) => errors.push(String(m)),
    },
    document, window, setTimeout, clearTimeout,
  };
  vm.createContext(sandbox);
  const idx = CHAIN.indexOf('items-data.js');
  assert.ok(idx >= 0, 'items-data.js в CHAIN (двухфазная загрузка)');
  for (let i = 0; i <= idx; i++) {
    vm.runInContext(src(CHAIN[i]), sandbox, { filename: CHAIN[i] });
  }
  const Gd = sandbox.Game;
  assert.ok(Gd && Array.isArray(Gd.ITEMS) && Gd.ITEMS.length >= 500,
    'Game.ITEMS после items-data.js (реальный каталог)');
  if (fx && fx.length) sandbox.Game.ITEMS = Gd.ITEMS.concat(fx);
  for (let i = idx + 1; i < CHAIN.length; i++) {
    vm.runInContext(src(CHAIN[i]), sandbox, { filename: CHAIN[i] });
  }
  return {
    G: sandbox.Game, body: document.body, doc: document,
    errors, sandbox,
  };
}

// Открыть панель для персонажа c (setCharacter + toggle(true) →
// buildPanel + render(); render рендерит ВСЕ вкладки —
// _invBody/_equipBody/_quickBody доступны без кликов по вкладкам).
// ПЕРВЫЙ ассерт — errors.length === 0 (цепочка грузится чисто —
// осмысленная краснота RED-ассертами, не SyntaxError/ENOENT).
function openPanel(env, c) {
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  assert.ok(env.G.playerUI,
    'Game.playerUI создан (controls.js загружен ДО ui.js)');
  env.G.playerUI.setCharacter(c);
  env.G.playerUI.toggle(true);
  const panel = findAll(env.body, '.char-panel')[0];
  assert.ok(panel, 'панель .char-panel подвешена к body');
  return panel;
}

function itemRowByName(root, namePart) {
  return findAll(root, '.cp-itemrow')
    .find((r) => {
      const name = r.querySelector('.cp-itemname');
      return name && String(name.textContent).includes(namePart);
    }) || null;
}

// --- CSS index.html: декларация правила .sel { ... } (дубль
// tests/ui-panel.test.js cssRule; первое вхождение) ---

function cssRule(html, name) {
  const m = html.match(new RegExp('\\.' + name + '\\s*{([^}]*)}'));
  assert.ok(m, 'CSS-правило .' + name + ' найдено в index.html');
  const decls = {};
  for (const part of m[1].split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const prop = part.slice(0, i).trim().toLowerCase();
    if (prop) decls[prop] = part.slice(i + 1).trim();
  }
  return decls;
}

test('000308: «Инвентарь» — iron_ore: .cp-tip содержит img.cp-tipicon (src = icon из JSON, alt ""), текст цел, строка 0-diff (308-TI-1)', () => {
  const env = loadEnv();
  const c = env.G.createCharacter();
  assert.ok(env.G.addItem(c, 'iron_ore').ok,
    'фикстура: iron_ore в инвентаре');
  const panel = openPanel(env, c);
  const ore = env.G.getItem('iron_ore');
  const oreRow = itemRowByName(panel._invBody, 'Железная руда');
  assert.ok(oreRow, 'строка «Железная руда» найдена');
  const tip = oreRow.querySelector('.cp-tip');
  assert.ok(tip, 'у строки есть .cp-tip (контракт 000097)');
  const timg = tip.querySelector('img');
  assert.ok(timg,
    '000308: крупная иконка в тултипе — img в .cp-tip; факт: img нет');
  assert.equal(timg.className, 'cp-tipicon',
    '000308: класс иконки в тултипе — cp-tipicon');
  assert.equal(timg.src, 'assets/sprites/loot/iron_ore.svg',
    '000308: src = icon из JSON; факт: ' + timg.src);
  assert.equal(timg.src, ore.icon,
    '000308: src === G.getItem("iron_ore").icon');
  assert.equal(timg.alt, '', '000308: alt пуст (иконка презентационная)');
  assert.ok(tip.textContent.includes(ore.desc),
    'текст тултипа цел: desc предмета');
  assert.ok(tip.textContent.includes('Вес: 1 кг'),
    'текст тултипа цел: «Вес: 1 кг»');
  assert.ok(tip.textContent.includes('Цена: 8 з'),
    'текст тултипа цел: «Цена: 8 з»');
  assert.ok(!tip.textContent.includes('Эффект'),
    'реагент — без строки «Эффект»');
  assert.equal(oreRow.children[0].tagName, 'img',
    'строка 0-diff: первым ребёнком мини-иконка; факт: '
    + oreRow.children[0].tagName);
  assert.equal(oreRow.children[0].className, 'cp-itemicon',
    'строка 0-diff: класс мини-иконки cp-itemicon');
  assert.equal(oreRow.children[0].src, 'assets/sprites/loot/iron_ore.svg',
    'строка 0-diff: src мини-иконки не тронут');
  assert.equal(oreRow.querySelector('.cp-itemname').textContent,
    'Железная руда', 'строка 0-diff: имя не тронут');
  assert.equal(oreRow.querySelector('.cp-itemmeta').textContent,
    '1.0 кг, 8 з', 'строка 0-diff: meta не тронута');
});

test('000308: «Снаряжение» — straw_hat (Голова): .cp-tip содержит img.cp-tipicon (src из каталога), текст «Броня: 0» (308-TI-2)', () => {
  const env = loadEnv();
  const c = env.G.createCharacter();
  assert.ok(env.G.addItem(c, 'straw_hat').ok,
    'фикстура: straw_hat в инвентаре');
  assert.ok(env.G.equip(c, 'straw_hat').ok,
    'фикстура: straw_hat экипирован (Голова)');
  const panel = openPanel(env, c);
  const hat = env.G.getItem('straw_hat');
  const hatRow = itemRowByName(panel._equipBody, 'Голова: Соломенная шляпа');
  assert.ok(hatRow, 'строка «Голова: Соломенная шляпа» найдена');
  const tip = hatRow.querySelector('.cp-tip');
  assert.ok(tip, 'у строки есть .cp-tip (контракт 000097)');
  const timg = tip.querySelector('img');
  assert.ok(timg,
    '000308: крупная иконка в тултипе — img в .cp-tip; факт: img нет');
  assert.equal(timg.className, 'cp-tipicon',
    '000308: класс иконки в тултипе — cp-tipicon');
  assert.equal(timg.src, 'assets/sprites/items/straw_hat.svg',
    '000308: src = icon из JSON; факт: ' + timg.src);
  assert.equal(timg.src, hat.icon,
    '000308: src === G.getItem("straw_hat").icon');
  assert.equal(timg.alt, '', '000308: alt пуст (иконка презентационная)');
  assert.ok(tip.textContent.includes(hat.desc),
    'текст тултипа цел: desc предмета');
  assert.ok(tip.textContent.includes('Броня: 0'),
    'текст тултипа цел: «Броня: 0»');
  assert.equal(hatRow.querySelector('.cp-itemmeta').textContent,
    'броня +0', 'строка 0-diff: meta не тронута');
  assert.deepEqual(hatRow.children
      .filter((ch) => ch.tagName === 'button')
      .map((b) => b.dataset.act),
    ['unequip'], 'строка 0-diff: кнопка «снять» не тронута');
});

test('000308: «Быстрые слоты (бой)» — wood_scyte в Слоте 1: .cp-tip содержит img.cp-tipicon (src из каталога) — общий механизм на второй секции (308-TI-3)', () => {
  const env = loadEnv();
  const c = env.G.createCharacter();
  assert.ok(env.G.addItem(c, 'wood_scyte').ok,
    'фикстура: wood_scyte в инвентаре');
  assert.ok(env.G.setQuick(c, 0, 'wood_scyte').ok,
    'фикстура: wood_scyte в быстром слоте 0');
  const panel = openPanel(env, c);
  const scyte = env.G.getItem('wood_scyte');
  const q1 = itemRowByName(panel._quickBody, 'Слот 1: Деревянная коса');
  assert.ok(q1, 'строка «Слот 1: Деревянная коса» найдена');
  const tip = q1.querySelector('.cp-tip');
  assert.ok(tip, 'у строки есть .cp-tip (контракт 000097)');
  const timg = tip.querySelector('img');
  assert.ok(timg,
    '000308: крупная иконка в тултипе — img в .cp-tip; факт: img нет');
  assert.equal(timg.className, 'cp-tipicon',
    '000308: класс иконки в тултипе — cp-tipicon');
  assert.equal(timg.src, 'assets/sprites/items/wood_scyte.svg',
    '000308: src = icon из JSON; факт: ' + timg.src);
  assert.equal(timg.src, scyte.icon,
    '000308: src === G.getItem("wood_scyte").icon');
  assert.equal(timg.alt, '', '000308: alt пуст (иконка презентационная)');
  assert.ok(tip.textContent.includes(scyte.desc),
    'текст тултипа цел: desc предмета');
  assert.ok(tip.textContent.includes('Урон: 4'),
    'текст тултипа цел: «Урон: 4»');
});

test('000308: CSS — .char-panel .cp-tip .cp-tipicon: float: left, 44×44px (> 22px), margin-right: 8px; регрессия .cp-itemicon 22×22px (308-TI-4)', () => {
  const html = page();
  assert.match(html, /\.char-panel \.cp-tip \.cp-tipicon\s*\{/,
    '000308: правило .char-panel .cp-tip .cp-tipicon найдено '
    + '(скоуп .char-panel — конвенция tooltip-правил 000097/000262)');
  const rule = cssRule(html, 'cp-tipicon');
  assert.equal(rule.float, 'left',
    '000308: float: left — иконка вверху-слева, текст обтекает');
  assert.equal(rule.width, '44px',
    '000308: width 44px (ровно 2× мини-иконки строки)');
  assert.equal(rule.height, '44px',
    '000308: height 44px (ровно 2× мини-иконки строки)');
  assert.equal(rule['margin-right'], '8px',
    '000308: margin-right 8px (отступ до обтекающего текста)');
  assert.ok(parseInt(rule.width, 10) > 22,
    '000308: «крупная» — заметно больше миниатюр списка (22px)');
  assert.ok(parseInt(rule.height, 10) > 22,
    '000308: «крупная» — заметно больше миниатюр списка (22px)');
  const mini = cssRule(html, 'cp-itemicon');
  assert.equal(mini.width, '22px',
    'регрессия: мини-иконка строки .cp-itemicon — 22px');
  assert.equal(mini.height, '22px',
    'регрессия: мини-иконка строки .cp-itemicon — 22px');
});

// 308-TI-G — ЗЕЛЁНЫЙ гвард с первого запуска: предмет БЕЗ иконки.
// FX-фикстура (НЕ реальный предмет каталога — 000302 добавит иконки
// ВСЕМ 193 без, пин на живом bread/sulfur стал бы хрупким);
// двухфазная загрузка loadEnv(fx).
const FX_NOICON = [
  {
    id: 'fx_noicon_ore', name: 'Руда без иконки (fx)', kind: 'reagent',
    weight: 1, value: 3,
    desc: 'Руда без иконки (тестовая фикстура 000308).',
  },
];

test('000308: предмет без иконки (fx) — .cp-tip ЕСТЬ, img в нём НЕТ (graceful); строка 0-diff; 6-арг. семантика (308-TI-G)', () => {
  const env = loadEnv(FX_NOICON);
  const c = env.G.createCharacter();
  assert.ok(env.G.addItem(c, 'fx_noicon_ore').ok,
    'фикстура: fx_noicon_ore в инвентаре');
  const panel = openPanel(env, c);
  const it = env.G.getItem('fx_noicon_ore');
  assert.ok(it, 'fx_noicon_ore в каталоге (двухфазная загрузка)');
  assert.ok(!it.icon, 'фикстура: предмета нет иконки в каталоге');
  const row = itemRowByName(panel._invBody, 'Руда без иконки (fx)');
  assert.ok(row, 'строка «Руда без иконки (fx)» найдена');
  const tip = row.querySelector('.cp-tip');
  assert.ok(tip, 'у строки есть .cp-tip (контракт 000097)');
  assert.ok(!tip.children.some((ch) => ch.tagName === 'img'),
    '000308: без иконки — img в тултипе НЕТ (graceful, без '
    + 'плейсхолдера — решение D6)');
  assert.equal(row.children[0].tagName, 'span',
    'строка 0-diff: первым ребёнком имя; факт: ' + row.children[0].tagName);
  assert.equal(row.children[0].className, 'cp-itemname',
    'строка 0-diff: мини-иконки нет (iconOf → null, гард 000237)');
  assert.ok(!row.children.some((ch) => ch.tagName === 'img'),
    'строка 0-diff: img среди детей строки нет');
  assert.equal(row.querySelector('.cp-itemname').textContent,
    'Руда без иконки (fx)', 'строка 0-diff: имя не тронут');
  assert.equal(row.querySelector('.cp-itemmeta').textContent,
    '1.0 кг, 3 з', 'строка 0-diff: meta не тронута');
  assert.deepEqual(row.children
      .filter((ch) => ch.tagName === 'button')
      .map((b) => b.dataset.act),
    ['quick', 'remove'], 'строка 0-diff: кнопки реагента не тронуты');
  assert.ok(tip.textContent.includes(it.desc),
    'текст тултипа цел: desc предмета');
  assert.ok(tip.textContent.includes('Вес: 1 кг'),
    'текст тултипа цел: «Вес: 1 кг»');
  assert.ok(tip.textContent.includes('Цена: 3 з'),
    'текст тултипа цел: «Цена: 3 з»');
});

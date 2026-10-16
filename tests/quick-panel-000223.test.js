// Задача 000223: КРАСНЫЕ тесты (vm) — панель: перенос «быстр.» делает
// предмет НЕВИДИМЫМ в списке инвентаря (единица физически покинула
// инвентарь — B2, memory/000223-quick-move.md); «убрать» — возвращает;
// полный инвентарь — «убрать» отказ + слот сохранён; [I] в бою — строка
// исчезает, пул не тронут; активный союзник — перенос в map и обратно.
//
// Краснота: на старом коде «быстр.» — пин (слот — ссылка): предмет
// остаётся в c.inventory.slots → строка рендерится (inventoryTab
// рисует slots), totalQty не меняется, «убрать» — всегда ok.
//
// Песочницы — динамические цепочки index.html (паттерн CHAIN_194/
// CHAIN_195: город — до ui.js включительно; бой — + combat-ui.js):
// правка src/ui-tab-inventory.js/src/ui.js подхватится сама.
// DOM-стаб с деревом — дублирование харнеса (конвенция проекта).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const page = () => fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// --- DOM-стаб с деревом (копия tests/combat-inventory-panel.test.js:
// canvas + составные селекторы — superset требований обеих цепочек) ---

function matchesSimple(el, sel) {
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

function matchesSel(el, sel) {
  const parts = String(sel).trim().split(/\s+/);
  if (parts.length === 1) return matchesSimple(el, parts[0]);
  if (!matchesSimple(el, parts[parts.length - 1])) return false;
  let n = el.parent;
  for (let i = parts.length - 2; i >= 0; i--) {
    if (!n || !matchesSimple(n, parts[i])) return false;
    n = n.parent;
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

function makeContext2d(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
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
    getBoundingClientRect() {
      return tag === 'canvas'
        ? { left: 0, top: 0, width: this.width, height: this.height }
        : { left: 0, top: 0 };
    },
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
  if (tag === 'canvas') {
    el.width = 0;
    el.height = 0;
    el.getContext = () => makeContext2d(el);
  }
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

// --- Цепочки (динамические — паттерн CHAIN_194/CHAIN_195) ---

const ALL_SCRIPTS = Array.from(
  page().matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));
const I_UI = ALL_SCRIPTS.indexOf('ui.js');
assert.ok(I_UI >= 0, 'ui.js подключён в index.html');
assert.ok(ALL_SCRIPTS.includes('combat-ui.js'),
  'combat-ui.js подключён в index.html');
const CH223_CITY = ALL_SCRIPTS.slice(0, I_UI + 1);
const CH223_COMBAT = CH223_CITY.concat('combat-ui.js');

function makeSandbox(keydown) {
  const errors = [];
  const document = {
    createElement: (tag) => makeEl(tag),
    body: makeEl('body'),
    querySelector: () => null,
    hidden: false,
    listeners: {},
    addEventListener(type, fn) {
      (this.listeners[type] || (this.listeners[type] = [])).push(fn);
    },
    removeEventListener(type, fn) {
      const a = this.listeners[type];
      if (!a) return;
      const i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    },
  };
  const window = {
    addEventListener: (type, fn) => {
      if (type === 'keydown') keydown.push(fn);
    },
    removeEventListener: () => {},
  };
  const sandbox = {
    console: {
      log: () => {}, info: () => {}, warn: () => {},
      error: (m) => errors.push(String(m)),
    },
    document, window, setTimeout, clearTimeout,
    performance: { now: () => 1000 },
  };
  vm.createContext(sandbox);
  return { sandbox, document, errors };
}

function load223(chain) {
  const keydown = [];
  const { sandbox, document, errors } = makeSandbox(keydown);
  for (const f of chain) vm.runInContext(src(f), sandbox, { filename: f });
  return {
    G: sandbox.Game, body: document.body, doc: document,
    keydown, errors, sandbox,
  };
}

function press(keydown, code) {
  const e = { code, preventDefault() {}, stopPropagation() {} };
  for (const fn of keydown) fn(e);
}

function openPanel(env, c) {
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  assert.ok(env.G.playerUI, 'Game.playerUI создан');
  env.G.playerUI.setCharacter(c);
  env.G.playerUI.toggle(true);
  const panel = findAll(env.body, '.char-panel')[0];
  assert.ok(panel, 'панель .char-panel подвешена к body');
  return panel;
}

// Строка предмета в _invBody по подстроку имени (null, если нет).
function findInvRow(panel, namePart) {
  return findAll(panel._invBody, '.cp-itemrow')
    .find((r) => {
      const name = r.querySelector('.cp-itemname');
      return name && String(name.textContent).includes(namePart);
    }) || null;
}

// Строка + её кнопка «быстр.» (assert: строка ЕСТЬ).
function invQuickBtn(panel, namePart) {
  const row = findInvRow(panel, namePart);
  assert.ok(row, 'строка предмета «' + namePart + '» в инвентаре');
  const btn = findAll(row, '.cp-btn')
    .find((b) => b.dataset.act === 'quick');
  assert.ok(btn, 'кнопка «быстр.» (data-act=quick) у строки');
  return btn;
}

// Имя строки по подстроку (для меток «×N»).
function invRowName(panel, namePart) {
  const row = findInvRow(panel, namePart);
  assert.ok(row, 'строка предмета «' + namePart + '» в инвентаре');
  const name = row.querySelector('.cp-itemname');
  return String(name.textContent);
}

// Кнопка «убрать» в _quickBody по data-slot.
function quickClearBtn(panel, slot) {
  return findAll(panel._quickBody, '.cp-btn')
    .find((b) => b.dataset.act === 'quick-clear'
      && Number(b.dataset.slot) === slot) || null;
}

function clickBtn(panel, btn) {
  assert.ok(panel.listeners.click && panel.listeners.click.length,
    'делегированный click-обработчик панели есть');
  panel.listeners.click[0]({ target: btn });
}

function noticeOf(panel) {
  const n = findAll(panel, '.cp-notice')[0];
  assert.ok(n, 'уведомление .cp-notice есть в панели');
  return n;
}

function panelOf(env) {
  const p = findAll(env.body, '.char-panel')[0];
  assert.ok(p, 'панель .char-panel подвешена к body');
  return p;
}

// Ошибки load-цепочки/боя: деградация без combat-scale.js (статика
// G) — ожидаемая 1 console.error; прочее — баг.
function noCombatErrors(env) {
  const bad = env.errors.filter(
    (e) => !e.includes('Game.combatScale'));
  assert.equal(bad.length, 0,
    'неожиданных ошибок нет: ' + bad.join('; '));
}

// Сцена боя: hero + волк, зелье в ОБЩЕМ инвентаре (копия 195 sceneHero).
function sceneHero223() {
  const env = load223(CH223_COMBAT);
  const G = env.G;
  const hero = G.createCharacter();
  G.addItem(hero, 'healing_potion');
  const c = G.combatUI.startCombat({
    hero, mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  assert.ok(c, 'бой начался');
  G.playerUI.setCharacter(c.player);
  G.playerUI.setAllyQuick({});
  noCombatErrors(env);
  return Object.assign({ c, hero }, env);
}

// 19 лёгких реагентов (19 слотов; + 1 предмет = 20).
const REAG19 = [
  'ruby', 'sapphire', 'emerald', 'amethyst', 'diamond',
  'berry_red', 'berry_blue', 'berry_wild', 'herb_sun', 'herb_wind',
  'root_moon', 'root_ember', 'root_rock', 'fruit_apple', 'fruit_plum',
  'fruit_quince', 'mushroom_grey', 'mushroom_glow', 'mushroom_ink',
];

test('223-PNL-1: городская панель — «быстр.» (qty 1) — строка исчезает из инвентаря; единица в слоте', () => {
  const env = load223(CH223_CITY);
  const G = env.G;
  const c = G.createCharacter();
  G.addItem(c, 'healing_potion');
  const panel = openPanel(env, c);
  clickBtn(panel, invQuickBtn(panel, 'Зелье лечения'));
  assert.equal(c.inventory.quick[0], 'healing_potion',
    'слот 0 = предмет (закрепление)');
  assert.equal(G.totalQty(c, 'healing_potion'), 0,
    'краснота: пин-модель — предмет остаётся в инвентаре (1); '
    + 'единица покинула инвентарь');
  assert.equal(findInvRow(panel, 'Зелье лечения'), null,
    'краснота: строка всё ещё в списке инвентаря (строка должна '
    + 'исчезнуть)');
  const qrow = findAll(panel._quickBody, '.cp-itemrow')[0];
  assert.ok(String(qrow.querySelector('.cp-itemname').textContent)
    .includes('Зелье лечения'), '«Слот 1» — закреплённый предмет');
  assert.ok(quickClearBtn(panel, 0), 'кнопка «убрать» у занятого слота');
  assert.equal(env.errors.length, 0,
    'ошибок нет: ' + env.errors.join('; '));
});

test('223-PNL-2: «убрать» — предмет ВЕРНУЛСЯ в список инвентаря', () => {
  const env = load223(CH223_CITY);
  const G = env.G;
  const c = G.createCharacter();
  G.addItem(c, 'healing_potion');
  const panel = openPanel(env, c);
  clickBtn(panel, invQuickBtn(panel, 'Зелье лечения'));
  assert.equal(findInvRow(panel, 'Зелье лечения'), null,
    'краснота: после «быстр.» строка не исчезла (пин-модель)');
  clickBtn(panel, quickClearBtn(panel, 0));
  assert.equal(c.inventory.quick[0], null, 'слот очищен');
  assert.equal(G.totalQty(c, 'healing_potion'), 1,
    'единица вернулась в инвентарь');
  assert.ok(findInvRow(panel, 'Зелье лечения'),
    'краснота: строка вернулась (пин-модель — не исчезала)');
  assert.equal(env.errors.length, 0,
    'ошибок нет: ' + env.errors.join('; '));
});

test('223-PNL-3: стак ×3 — «быстр.» — строка «×2» (одна единица перенесена)', () => {
  const env = load223(CH223_CITY);
  const G = env.G;
  const c = G.createCharacter();
  G.addItem(c, 'healing_potion', 3);
  const panel = openPanel(env, c);
  assert.ok(invRowName(panel, 'Зелье лечения').includes('×3'),
    'строка ДО «быстр.» — «×3»: ' + invRowName(panel, 'Зелье лечения'));
  clickBtn(panel, invQuickBtn(panel, 'Зелье лечения'));
  assert.equal(c.inventory.quick[0], 'healing_potion', 'слот 0 = предмет');
  assert.equal(G.totalQty(c, 'healing_potion'), 2,
    'краснота: пин-модель — в инвентаре остаётся ×3');
  assert.ok(invRowName(panel, 'Зелье лечения').includes('×2'),
    'краснота: метка осталась «×3» (перенесена 1 ед. — «×2»): '
    + invRowName(panel, 'Зелье лечения'));
  assert.equal(env.errors.length, 0,
    'ошибок нет: ' + env.errors.join('; '));
});

test('223-PNL-4: полный инвентарь — «убрать» (союзник активен) — отказ «нет свободных слотов инвентаря», слот СОХРАНЁН', () => {
  const env = load223(CH223_CITY);
  const G = env.G;
  const c = G.createCharacter();
  G.addItem(c, 'healing_potion');
  for (const id of REAG19) G.addItem(c, id); // 20 слотов
  const map = {};
  G.playerUI.setAllyQuick(map);
  const panel = openPanel(env, c);
  G.playerUI.toggle(true, null, 'efir');
  assert.equal(G.playerUI.getActiveCharId(), 'efir',
    'сценарий: активен «efir»');
  clickBtn(panel, invQuickBtn(panel, 'Зелье лечения'));
  assert.equal(JSON.stringify(map.efir),
    JSON.stringify(['healing_potion', null, null]),
    'map[efir] слот 0 = предмет (000194)');
  assert.equal(G.totalQty(c, 'healing_potion'), 0,
    'краснота: пин-модель — предмет остаётся в общем инвентаре (1)');
  assert.equal(findInvRow(panel, 'Зелье лечения'), null,
    'краснота: строка всё ещё в списке инвентаря');
  G.addItem(c, 'meat'); // инвентарь снова полный (20 слотов)
  G.playerUI.render();
  clickBtn(panel, quickClearBtn(panel, 0));
  assert.ok(String(noticeOf(panel).textContent)
    .includes('нет свободных слотов инвентаря'),
    'краснота: старый «убрать» не отказывает (слот просто пустеет); '
    + 'уведомление: «' + noticeOf(panel).textContent + '»');
  assert.equal(map.efir[0], 'healing_potion',
    'краснота: слот очищен (единица потеряна); слот СОХРАНЁН — '
    + 'единица не теряется НИКОГДА');
  assert.equal(G.totalQty(c, 'healing_potion'), 0, 'единица не задвоена');
  assert.equal(env.errors.length, 0,
    'ошибок нет: ' + env.errors.join('; '));
});

test('223-PNL-5: [I] в бою — «быстр.» — строка исчезает из панели; пул и слот не тронуты', () => {
  const S = sceneHero223();
  const { G, c } = S;
  assert.equal(G.activeUnitId(c), 'player', 'сценарий: ход героя');
  press(S.keydown, 'KeyT');
  assert.equal(G.playerUI.isOpen(), true, 'панель открыта');
  const panel = panelOf(S);
  clickBtn(panel, invQuickBtn(panel, 'Зелье лечения'));
  assert.equal(c.player.inventory.quick[0], 'healing_potion',
    'слот 0 героя = предмет');
  assert.equal(G.totalQty(c.player, 'healing_potion'), 0,
    'краснота: пин-модель — предмет остаётся в общем инвентаре (1)');
  assert.equal(findInvRow(panel, 'Зелье лечения'), null,
    'краснота: строка всё ещё в списке инвентаря');
  assert.equal(c.ps.invItem, 1, 'пул invItem переложением не тратится');
  noCombatErrors(S);
});

test('223-PNL-6: активен союзник — «быстр.» — в map, единица покинула общий инвентарь; «убрать» — возврат', () => {
  const env = load223(CH223_CITY);
  const G = env.G;
  const c = G.createCharacter();
  G.addItem(c, 'healing_potion');
  const map = {};
  G.playerUI.setAllyQuick(map);
  const panel = openPanel(env, c);
  G.playerUI.toggle(true, null, 'efir');
  assert.equal(G.playerUI.getActiveCharId(), 'efir',
    'сценарий: активен «efir»');
  clickBtn(panel, invQuickBtn(panel, 'Зелье лечения'));
  assert.equal(JSON.stringify(map.efir),
    JSON.stringify(['healing_potion', null, null]),
    'map[efir] слот 0 = предмет (000194)');
  assert.equal(JSON.stringify(c.inventory.quick),
    JSON.stringify([null, null, null]), 'hero-quick не тронут');
  assert.equal(G.totalQty(c, 'healing_potion'), 0,
    'краснота: пин-модель — предмет остаётся в общем инвентаре (1)');
  assert.equal(findInvRow(panel, 'Зелье лечения'), null,
    'краснота: строка всё ещё в списке инвентаря');
  clickBtn(panel, quickClearBtn(panel, 0));
  assert.equal(map.efir[0], null, 'слот map очищен (000194)');
  assert.equal(G.totalQty(c, 'healing_potion'), 1,
    'единица вернулась в общий инвентарь');
  assert.ok(findInvRow(panel, 'Зелье лечения'),
    'краснота: строка вернулась (пин-модель — не исчезала)');
  assert.equal(env.errors.length, 0,
    'ошибок нет: ' + env.errors.join('; '));
});

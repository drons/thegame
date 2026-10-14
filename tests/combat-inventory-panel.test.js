// Задача 000195: в бою кнопка «Предмет [T]» (act=invItem) открывает
// [I]-панель на ТЕКУЩЕМ персонаже боя (активный юнит хода; герой —
// 'flogiston'), где «быстр.» (000194, не меняется) перекладывает
// ОДИН предмет общего инвентаря в первый свободный быстрый слот.
//
// Красные (5): 195-CUI-OPEN (KeyT — панель не открывается, thunk
// c.invItem() без itemId — только строка в журнал), 195-CUI-BTN
// (кнопка ≡ клавиша), 195-CUI-HERO-QUICK («быстр.» — в
// hero.inventory.quick), 195-CUI-ALLY-OPEN (пре-селект активного
// юнита 'a1'), 195-CUI-ALLY-SYNC (u.quick — снапшот без live-sync;
// опция allyQuickLive + syncAllyQuickLive отсутствуют).
// Якоря (3): 195-CUI-GATE (гейт «нет применимых предметов в
// инвентаре» жив, D2), 195-CUI-DEGRADE (статика без ui.js — старый
// путь c.invItem() бит-в-бит), 195-LIFT (applyLayer-поверхность
// 000206: '25' при открытой, '' при закрытой/без подъёма).
//
// Песочница 1 — динамическая цепочка index.html ДО ui.js включительно
// (паттерн CHAIN_194, tests/ui-ally-quick.test.js: новый <script>
// подхватится сам) + combat-ui.js (следующий боевой скрипт) +
// DOM-стаб с деревом, canvas и составным '.combat-actions button'.
// Песочница 2 — статическая цепочка БЕЗ ui.js (паттерн
// loadCombatUi194, tests/combat-ui-quicklist.test.js) — для
// 195-CUI-DEGRADE. Дублирование харнеса — принятая конвенция.
// Контракт — memory/000195-combat-inventory-panel.md.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const page = () => fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// --- DOM-стаб с деревом (копия tests/ui-ally-quick.test.js +
// canvas-поддержка и составные селекторы для build() combat-ui) ---

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

// Составной селектор ('.combat-actions button'): последний фрагмент —
// сам элемент, остальные — по предкам (render() combat-ui ищет
// кнопки панели так).
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

// --- Песочница 1: динамика index.html до ui.js + combat-ui.js ---

const CHAIN_195 = (() => {
  const all = Array.from(
    page().matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
    .map((p) => p.replace(/^src\//, ''));
  const iUi = all.indexOf('ui.js');
  assert.ok(iUi >= 0, 'ui.js подключён в index.html');
  assert.ok(all.includes('combat-ui.js'),
    'combat-ui.js подключён в index.html');
  return all.slice(0, iUi + 1).concat('combat-ui.js');
})();

// Песочница 2: статика без ui.js (паттерн loadCombatUi194).
const STATIC_CHAIN_195 = [
  'global-settings.js', 'perlin.js', 'map.js',
  'skills-data.js', 'items-data.js',
  'sheet.js', 'player.js',
  'items.js', 'controls.js', 'combat.js',
  'combat-keys.js',
  'spellbook.js',
  'sprites.js',
  'combat-scale.js',
  'combat-ui.js',
  'motion.js',
];

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

function loadCombat195(chain) {
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

function findByClass(el, cls) {
  if (String(el.className).split(/\s+/).includes(cls)) return el;
  for (const ch of el.children || []) {
    const found = findByClass(ch, cls);
    if (found) return found;
  }
  return null;
}

// Ошибки load-цепочки/боя: деградация без combat-scale.js (статика
// боевого снапшота G) — ожидаемая 1 console.error; прочее — баг.
function noCombatErrors(env) {
  const bad = env.errors.filter(
    (e) => !e.includes('Game.combatScale'));
  assert.equal(bad.length, 0,
    'неожиданных ошибок нет: ' + bad.join('; '));
}

function panelOf(env) {
  const p = findAll(env.body, '.char-panel')[0];
  assert.ok(p, 'панель .char-panel подвешена к body');
  return p;
}

// Строка предмета в _invBody по подстроку имени + её кнопка «быстр.»
// (копия tests/ui-ally-quick.test.js).
function invQuickBtn(panel, namePart) {
  const row = findAll(panel._invBody, '.cp-itemrow')
    .find((r) => {
      const name = r.querySelector('.cp-itemname');
      return name && String(name.textContent).includes(namePart);
    });
  assert.ok(row, 'строка предмета «' + namePart + '» в инвентаре');
  const btn = findAll(row, '.cp-btn')
    .find((b) => b.dataset.act === 'quick');
  assert.ok(btn, 'кнопка «быстр.» (data-act=quick) у строки');
  return btn;
}

function clickBtn(panel, btn) {
  assert.ok(panel.listeners.click && panel.listeners.click.length,
    'делегированный click-обработчик панели есть');
  panel.listeners.click[0]({ target: btn });
}

// Сцена: hero + волк, зелье в ОБЩЕМ инвентаре, проводка playerUI как
// в main.js (setCharacter + setAllyQuick — live-карта). extraOpts —
// мок-опции startCombat (контракт §7.1: allyQuickLive).
function sceneHero(extraOpts) {
  const env = loadCombat195(CHAIN_195);
  const G = env.G;
  const hero = G.createCharacter();
  G.addItem(hero, 'healing_potion');
  const liveMap = {};
  const c = G.combatUI.startCombat(Object.assign({
    hero, mobs: ['wolf'], mobLevel: 1, seed: 42,
  }, extraOpts));
  assert.ok(c, 'бой начался');
  G.playerUI.setCharacter(c.player);
  G.playerUI.setAllyQuick(liveMap);
  noCombatErrors(env);
  return Object.assign({ c, hero, liveMap }, env);
}

// Сцена + наёмник 'a1' (в live-карте) рядом с волком: Space
// заканчивает ход героя → ход наёмника (паттерн 194-QUI-ALLY).
function sceneAlly() {
  const env = loadCombat195(CHAIN_195);
  const G = env.G;
  const hero = G.createCharacter();
  G.addItem(hero, 'healing_potion');
  const liveMap = { a1: [null, null, null] };
  const c = G.combatUI.startCombat({
    hero, mobs: ['wolf'], mobLevel: 1, seed: 42,
    allyQuick: { a1: [null, null, null] },
    allyQuickLive: liveMap,
  });
  assert.ok(c, 'бой начался');
  G.playerUI.setCharacter(c.player);
  G.playerUI.setAllyQuick(liveMap);
  const merc = G.makeAlly({
    name: 'Вольк', role: 'melee', level: 2, dmg: 1, hp: 1,
    attrs: { dexterity: 4, intelligence: 4 },
  }, 1);
  merc.x = 3; merc.y = 5;
  c.units.push(merc);
  c.turnOrder.push(merc.id);
  const w = c.units.find((x) => x.id === 'm0');
  w.x = 3; w.y = 4; // d 1 от наёмника
  noCombatErrors(env);
  return Object.assign({ c, hero, liveMap, merc }, env);
}

// --- 195-CUI-OPEN (красный) ---

test('195-CUI-OPEN: KeyT (ход героя, зелье) — [I]-панель открыта на «flogiston», вкладка inventory; открытие бесплатно', () => {
  const S = sceneHero();
  const { G, c } = S;
  assert.equal(G.activeUnitId(c), 'player', 'сценарий: ход героя');
  let rngCalls = 0;
  const oldRng = c._rng;
  c._rng = (...a) => { rngCalls += 1; return oldRng(...a); };
  press(S.keydown, 'KeyT');
  assert.equal(G.playerUI.isOpen(), true,
    'панель открыта (краснота: thunk c.invItem() без itemId — '
    + 'только строка в журнал, на экране ничего)');
  assert.equal(G.playerUI.getActiveCharId(), 'flogiston',
    'текущий персонаж боя = активный юнит — герой (краснота: '
    + G.playerUI.getActiveCharId() + ')');
  const panel = panelOf(S);
  invQuickBtn(panel, 'Зелье лечения');
  assert.equal(c.ps.invItem, 1, 'пул invItem открытием не тратится');
  assert.equal(rngCalls, 0, 'c._rng открытием не вызывается');
  assert.ok(!c.log.some((l) => l.includes('выберите предмет из инвентаря')),
    'в журнале нет старого отказа: ' + c.log.join(' | '));
  noCombatErrors(S);
});

// --- 195-CUI-BTN (красный) ---

test('195-CUI-BTN: клик по кнопке «Предмет» (act=invItem) — панель открыта: кнопка ≡ клавиша', () => {
  const S = sceneHero();
  const { G, c } = S;
  assert.equal(G.activeUnitId(c), 'player', 'сценарий: ход героя');
  const overlay = findByClass(S.body, 'combat-overlay--combat');
  assert.ok(overlay, 'боевой оверлей есть');
  const btn = overlay.querySelectorAll('.combat-actions button')
    .find((b) => b.dataset.act === 'invItem');
  assert.ok(btn, 'кнопка «Предмет» (act=invItem) в панели действий');
  assert.equal(btn.disabled, false,
    'кнопка ВКЛЮЧЕНА при гейте ok (зелье есть); title «'
    + btn.title + '»');
  assert.ok(btn.listeners.click && btn.listeners.click.length,
    'у кнопки click-обработчик');
  btn.listeners.click[0]({ target: btn });
  assert.equal(G.playerUI.isOpen(), true,
    'панель открыта (краснота: клик → c.invItem() — на экране ничего)');
  assert.equal(G.playerUI.getActiveCharId(), 'flogiston',
    'активный юнит = герой');
  const panel = panelOf(S);
  invQuickBtn(panel, 'Зелье лечения');
  assert.equal(c.ps.invItem, 1, 'пул открытием не тратится');
  noCombatErrors(S);
});

// --- 195-CUI-HERO-QUICK (красный) ---

test('195-CUI-HERO-QUICK: после KeyT «быстр.» — ОДИН предмет в быстрый слот героя; предмет не потреблён, пул не тронут', () => {
  const S = sceneHero();
  const { G, c } = S;
  assert.equal(G.activeUnitId(c), 'player', 'сценарий: ход героя');
  press(S.keydown, 'KeyT');
  assert.equal(G.playerUI.isOpen(), true,
    'панель открыта (краснота: её нет — «быстр.» недоступен)');
  const panel = panelOf(S);
  clickBtn(panel, invQuickBtn(panel, 'Зелье лечения'));
  assert.equal(c.player.inventory.quick[0], 'healing_potion',
    'быстрый слот 0 героя = предмет (краснота: '
    + JSON.stringify(c.player.inventory.quick) + ')');
  assert.equal(G.totalQty(c.player, 'healing_potion'), 1,
    'переложить, а не использовать');
  assert.ok(c.player.inventory.slots.some((e) => e.id === 'healing_potion'),
    'предмет остаётся в общем инвентаре');
  assert.equal(c.ps.invItem, 1, 'боевой пул переложением не тратится');
  noCombatErrors(S);
});

// --- 195-CUI-ALLY-OPEN (красный) ---

test('195-CUI-ALLY-OPEN: KeyT на ходу СОЮЗНИКА — панель открыта, активный персонаж = активный юнит (пре-селект)', () => {
  const S = sceneAlly();
  const { G, c } = S;
  press(S.keydown, 'Space');
  assert.equal(G.activeUnitId(c), 'a1',
    'сценарий: ход наёмника (краснота: ' + G.activeUnitId(c) + ')');
  press(S.keydown, 'KeyT');
  assert.equal(G.playerUI.isOpen(), true,
    'панель открыта на ходу союзника (краснота: allyInvItem() без '
    + 'itemId — только строка в журнал)');
  assert.equal(G.playerUI.getActiveCharId(), 'a1',
    'пре-селект активного юнита (краснота: '
    + G.playerUI.getActiveCharId() + ')');
  const panel = panelOf(S);
  invQuickBtn(panel, 'Зелье лечения');
  noCombatErrors(S);
});

// --- 195-CUI-ALLY-SYNC (красный) ---

test('195-CUI-ALLY-SYNC: «быстр.» союзника — в live-карту; u.quick re-sync в бою (KeyE); применение — из общего инвентаря', () => {
  const S = sceneAlly();
  const { G, c, merc } = S;
  press(S.keydown, 'Space');
  assert.equal(G.activeUnitId(c), 'a1',
    'сценарий: ход наёмника (краснота: ' + G.activeUnitId(c) + ')');
  merc.hp = 10; // запас для «Лечит +15»
  press(S.keydown, 'KeyT');
  assert.equal(G.playerUI.isOpen(), true,
    'панель открыта (краснота: её нет — «быстр.» недоступен)');
  const panel = panelOf(S);
  clickBtn(panel, invQuickBtn(panel, 'Зелье лечения'));
  assert.equal(S.liveMap.a1[0], 'healing_potion',
    'live-карта: ПЕРВЫЙ свободный слот (краснота: '
    + JSON.stringify(S.liveMap.a1) + ')');
  press(S.keydown, 'KeyE');
  assert.equal(merc.quick[0], 'healing_potion',
    'u.quick re-sync с live-карты (краснота: снапшот '
    + JSON.stringify(merc.quick) + ' — без allyQuickLive/sync)');
  const ql = findByClass(S.body, 'combat-quicklist');
  assert.ok(ql, 'список .combat-quicklist есть');
  assert.equal(ql.style.display, '', 'список открыт');
  const rows = ql.children.filter((ch) =>
    String(ch.className).includes('combat-quickrow')).slice(-3);
  assert.equal(rows.length, 3, '3 строки (краснота: ' + rows.length + ')');
  assert.ok(!String(rows[0].className).includes('combat-quickrow-off'),
    'строка 0 (зелье в общем инвентаре) — активна');
  assert.ok(rows[0].listeners.click && rows[0].listeners.click.length,
    'строка кликабельна');
  rows[0].listeners.click[0]({ target: rows[0] });
  assert.equal(G.totalQty(c.player, 'healing_potion'), 0,
    'предмет ПОТРЕБЛЁН из общего инвентаря');
  assert.ok(merc.hp > 10, 'эффект на союзника (Лечит +15): hp '
    + merc.hp);
  assert.equal(merc.quickItem, 0, 'пул quickItem союзника 1→0');
  assert.equal(JSON.stringify(c.player.inventory.quick),
    JSON.stringify([null, null, null]), 'быстрые героя не тронуты');
  assert.ok(c.log.some((l) => l.includes('Вольк')),
    'строка действия союзника в журнале: ' + c.log.slice(-3).join(' | '));
  noCombatErrors(S);
});

// --- 195-CUI-GATE (якорь: гейт жив, D2) ---

test('195-CUI-GATE (якорь): пустой инвентарь — панель НЕ открывается, гейт «нет применимых предметов в инвентаре»', () => {
  const env = loadCombat195(CHAIN_195);
  const G = env.G;
  const hero = G.createCharacter(); // инвентарь пуст
  const c = G.combatUI.startCombat({
    hero, mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  assert.ok(c, 'бой начался');
  G.playerUI.setCharacter(c.player);
  G.playerUI.setAllyQuick({});
  assert.equal(G.activeUnitId(c), 'player', 'сценарий: ход героя');
  press(env.keydown, 'KeyT');
  assert.equal(G.playerUI.isOpen(), false,
    'панель НЕ открыта (гейт: нет применимых предметов)');
  assert.ok(c.log.some((l) =>
    l.includes('нет применимых предметов в инвентаре')),
    'причина гейта в журнале: ' + c.log.join(' | '));
  assert.equal(c.ps.invItem, 1, 'пул не тронут');
  noCombatErrors(env);
});

// --- 195-CUI-DEGRADE (якорь: статика без ui.js — старый путь) ---

test('195-CUI-DEGRADE (якорь): без G.playerUI (статика без ui.js) — KeyT идёт на c.invItem() бит-в-бит', () => {
  const S = loadCombat195(STATIC_CHAIN_195);
  const G = S.G;
  const hero = G.createCharacter();
  G.addItem(hero, 'healing_potion');
  const c = G.combatUI.startCombat({
    hero, mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  assert.ok(c, 'бой начался');
  assert.equal(G.playerUI, undefined,
    'сценарий: G.playerUI отсутствует (нет ui.js в цепочке)');
  press(S.keydown, 'KeyT');
  assert.ok(c.log.some((l) =>
    l.includes('выберите предмет из инвентаря')),
    'старый путь: причина ядра в журнале: ' + c.log.join(' | '));
  assert.equal(c.ps.invItem, 1, 'пул не тронут (отказ до траты)');
});

// --- 195-LIFT (якорь: applyLayer-поверхность, 000206) ---

test('195-LIFT (якорь): applyLayer — «25» при открытой панели и подъёме; «» при без-подъёме или закрытой (idempotent, isOpen-зависимость)', () => {
  const env = loadCombat195(CHAIN_195);
  const G = env.G;
  const c = G.createCharacter();
  G.playerUI.setCharacter(c);
  G.playerUI.toggle(true);
  const panel = panelOf(env);
  assert.equal(G.playerUI.isOpen(), true, 'сценарий: панель открыта');
  G.playerUI.applyLayer(true);
  assert.equal(panel.style.zIndex, '25',
    'открытая + applyLayer(true) → «25» (краснота: '
    + panel.style.zIndex + ')');
  G.playerUI.applyLayer(false);
  assert.equal(panel.style.zIndex, '',
    'applyLayer(false) → «» (краснота: ' + panel.style.zIndex + ')');
  G.playerUI.applyLayer(true);
  assert.equal(panel.style.zIndex, '25', 'idempotent повтор');
  G.playerUI.toggle(false);
  G.playerUI.applyLayer(true);
  assert.equal(panel.style.zIndex, '',
    'закрытая + applyLayer(true) → «» (isOpen-зависимость)');
  assert.equal(env.errors.length, 0,
    'ошибок нет: ' + env.errors.join('; '));
});

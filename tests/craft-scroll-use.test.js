// Задача 000232.01: Ретро-правки 000232 — тестовые пины чертежей
// (craft_scroll): ветка useQuickUnit + текст itemTipText.
//
// Источник: tasks/pending/000232.01.md; findings ретро-анализа
// tasks/result/000232-retro-20261021.md: ветка craft_scroll в
// useQuickUnit (src/items.js, 000232, смержена e7de7cb) БЕЗ тестов;
// текст itemTipText для craft_recipe не запинан.
//
// Контракты — memory/000232-craft-learned-kinds.md:
//   D2 — ветка чертежа: отказ «вид уже изучен» ДО расхода, деградация
//        без Game.Craft — «крафт недоступен» (БЕЗ console.error,
//        000053), успех — { ok, name, craft:<тип>,
//        message: 'Изучено: «<название рецепта>»' }.
//   D0b — «изучен» (персонаж): c.craftTypes[type] ∨
//        c.craft[type] !== undefined ∨ c.craftXp[type] > 0 —
//        прогресс = знание.
//   Пара Q-1/2/3 ↔ CR-3/4/5 (tests/craft-scrolls.test.js) —
//        структурно идентична, разница изолирована в useQuickItem-
//        семантике (слот), а не в фикстуре (Д2 контракта 000232.01).
//
// Механика (сверено с кодом): useQuickUnit — зеркало useItem БЕЗ
// расхода: Game.Craft читается ЛЕНИВО в момент вызова; отказ — ДО
// расхода (слот цел — расход у вызывающего useQuickItem: успех →
// quick[slot]=null, 000223). itemTipText (src/ui.js) — ТОЛЬКО в
// panelCtx (не на корне Game, не экспортируется G.playerUI) → тест
// через РЕНДЕРИНГ строки инвентаря .cp-itemrow → .cp-tip (production-
// путь, Д4 контракта 000232.01): craft_recipe-ветка —
// r = C.CRAFT_BY_ID[it.effect.recipe] → r ? r.тип : it.effect.recipe
// (деградация без CRAFT_BY_ID — id, зеркальная id-форма).
//
// Красная стадия — 0 красных (expectedRedCount = 0): код уже смержен
// (e7de7cb), ТЗ предписывает src 0-diff — «краснота» = отсутствие
// ПИНА (неотестированная ветка/строка), а не отсутствие модуля/
// функции/файла (контракт 000232.01 §2 Д12/Д13, a3 §4): ВСЕ новые
// тесты — зелёные с первого запуска. Если новый тест падает — баг в
// самом тесте (неточный expectation: message/reason/тип) — исправить
// тест, НЕ код (src 0-diff).
//
// Q-1..Q-3 — node (прямой require), паттерн 223-USE-5
// (tests/quick-slot-000223.test.js: с withGame — ленивый Game в
// момент вызова). TIP-1..TIP-2 — vm-песочница; харнес — ДУБЛЬ
// tests/craft-ui-learned.test.js (makeEl/matchesSel/findAll/loadEnv —
// у тестов НЕТ общего test-lib, конвенция проекта); ДИНАМИЧЕСКИЙ
// CHAIN — ВСЕ <script src> index.html до src/ui.js включительно
// (Д5 контракта 000232.01: включая craft-data.js/craft.js —
// Game.Craft ЕСТЬ; craft-ui.js ПОСЛЕ ui.js — в цепочку НЕ входит);
// новый script-тег подхватывается сам, лоадер МЕЖДУ ФАЗАМИ не
// правится.
//
// Cross-realm (vm): пины — примитивы/текст/длины (правило 000082).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const I = require('../src/items.js');
const C = require('../src/craft.js');
const { createCharacter } = require('../src/player.js');

const ROOT = path.join(__dirname, '..');

// --- node: Q-1..Q-3 (useQuickItem, паттерн 223-USE-5) ---

// Стуб globalThis.Game (дубль withGame, tests/quick-slot-000223.
// test.js): craft-ветка useQuickUnit читает Game ЛЕНИВО в момент
// ВЫЗОВА.
function withGame(game, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'Game');
  const prev = globalThis.Game;
  globalThis.Game = game;
  try {
    return fn();
  } finally {
    if (had) globalThis.Game = prev;
    else delete globalThis.Game;
  }
}

test('Q-1: useQuickItem — чертёж blueprint_forge: успех — изучен ВИД (isTypeLearned=true), слот очищен, r.craft/message дословно (якорь assets/craft/000001.json)', () =>
  withGame({ Craft: C }, () => {
    const c = createCharacter();
    const add = I.addItem(c, 'blueprint_forge');
    assert.equal(add.ok, true,
      'выдача чертёжа: ' + JSON.stringify(add));
    assert.equal(I.setQuick(c, 0, 'blueprint_forge').ok, true,
      'перенос единицы в быстрый слот (223)');
    const r = I.useQuickItem(c, 0);
    assert.equal(r.ok, true,
      'useQuickItem: ok — ' + JSON.stringify(r));
    assert.equal(r.craft, 'кузнечное_дело',
      'изучен ВИД — из якорного рецепта (D2)');
    assert.equal(r.name, 'Чертёж: кузнечное дело',
      'r.name — имя предмета');
    assert.equal(r.message, 'Изучено: «Ковка железного меча»',
      'flash ДОСЛОВНО (якорный рецепт); факт: ' + r.message);
    assert.equal(C.isTypeLearned(c, 'кузнечное_дело'), true,
      'после useQuickItem — вид изучен (D0b)');
    assert.equal(I.quickItem(c, 0), null,
      'успех — слот очищен (расход у вызывающего, 000223)');
  }));

test('Q-2: useQuickItem — чертёж: отказ «вид уже изучен» (D0b-прогресс c.craft, Д2-фикстура) — слот цел (отказ ДО расхода)', () =>
  withGame({ Craft: C }, () => {
    const c = createCharacter();
    c.craft = { 'кузнечное_дело': 2 }; // «изучен» прогрессом (D0b)
    const add = I.addItem(c, 'blueprint_forge');
    assert.equal(add.ok, true, 'выдача чертёжа: ' + JSON.stringify(add));
    assert.equal(I.setQuick(c, 0, 'blueprint_forge').ok, true,
      'перенос единицы в быстрый слот (223)');
    const r = I.useQuickItem(c, 0);
    assert.equal(r.ok, false, 'отказ: ' + JSON.stringify(r));
    assert.equal(r.reason, 'вид уже изучен',
      'причина ДОСЛОВНО из learnCraftType (D0b); факт: ' + r.reason);
    assert.equal(I.quickItem(c, 0), 'blueprint_forge',
      'слот цел (отказ — НЕ расход, 223-USE-5-паттерн)');
  }));

test('Q-3: useQuickItem — чертёж: без Game.Craft — без исключения, тихий ok:false «крафт недоступен» (БЕЗ console.error, 000053), слот цел', () => {
  const c = createCharacter();
  const add = I.addItem(c, 'blueprint_forge');
  assert.equal(add.ok, true, 'выдача чертёжа: ' + JSON.stringify(add));
  assert.equal(I.setQuick(c, 0, 'blueprint_forge').ok, true,
    'перенос единицы в быстрый слот (223)');
  let r = null;
  let threw = false;
  withGame({}, () => { // Game без Craft — деградация
    try {
      r = I.useQuickItem(c, 0);
    } catch (e) { threw = true; }
  });
  assert.equal(threw, false, 'без исключения (000053: игра не падает)');
  assert.equal(r.ok, false, 'ok:false (тихий отказ деградации)');
  assert.equal(r.reason, 'крафт недоступен',
    'причина ДОСЛОВНО (контракт D2); факт: ' + r.reason);
  assert.equal(I.quickItem(c, 0), 'blueprint_forge',
    'слот цел (отказ — НЕ расход)');
});

// --- vm: TIP-1..TIP-2 (itemTipText через рендер строки инвентаря) ---

const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const page = () => fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// --- Минимальный DOM-стаб с деревом (дубль tests/craft-ui-learned.
// test.js) ---

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
  // textContent = '' — как в DOM, сбрасывает детей (render() панели
  // обновляет body in place: panel._invBody.textContent = '').
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

// ДИНАМИЧЕСКИЙ CHAIN (Д5): ВСЕ <script src> index.html до src/ui.js
// включительно — ВКЛЮЧАЯ craft-data.js/craft.js (Game.Craft ЕСТЬ),
// БЕЗ craft-ui.js (в index.html ПОСЛЕ ui.js). Новый script-тег
// подхватывался бы сам; лоадер МЕЖДУ ФАЗАМИ не правится.
const CHAIN = (() => {
  const all = Array.from(
    page().matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1]);
  const i = all.indexOf('src/ui.js');
  assert.ok(i >= 0, 'ui.js подключён в index.html');
  assert.ok(all.indexOf('src/craft-data.js') >= 0
    && all.indexOf('src/craft-data.js') < i
    && all.indexOf('src/craft.js') >= 0
    && all.indexOf('src/craft.js') < i,
    'craft-data.js/craft.js — ДО ui.js в index.html (Game.Craft '
    + 'в цепочке); факт: ' + JSON.stringify(all.slice(0, i + 1)));
  return all.slice(0, i + 1);
})();

// Загрузка цепочки в vm-песочницу → { G, body, errors, sandbox }
// (дубль loadEnv, tests/craft-ui-learned.test.js).
function loadEnv() {
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
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const sandbox = {
    console: {
      log: () => {}, info: () => {}, warn: () => {},
      error: (m) => errors.push(String(m)),
    },
    document, window, setTimeout, clearTimeout,
  };
  vm.createContext(sandbox);
  for (const f of CHAIN) vm.runInContext(src(f), sandbox,
    { filename: f });
  return { G: sandbox.Game, body: document.body, errors, sandbox };
}

// Строка инвентаря по имени предмета (.cp-itemrow с дочерним
// .cp-itemname textContent = name; itemRow — ядро ui.js, 000097).
function itemRowByName(env, name) {
  const rows = findAll(env.body, '.cp-itemrow');
  for (const row of rows) {
    const nm = row.querySelector('.cp-itemname');
    if (nm && nm.textContent === name) return row;
  }
  return null;
}

const BP_NAME = 'Чертёж: кузнечное дело';

test('TIP-1: itemTipText craft_recipe (с Game.Craft): .cp-tip строки инвентаря содержит «Эффект: изучает вид крафта «кузнечное_дело»» (r.тип якорного рецепта из CRAFT_BY_ID)', () => {
  const env = loadEnv();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  assert.ok(env.G.Craft,
    'Game.Craft в цепочке (craft.js ДО ui.js — Д5)');
  const c = env.G.createCharacter();
  const add = env.G.addItem(c, 'blueprint_forge');
  assert.equal(add.ok, true, 'выдача чертёжа: ' + JSON.stringify(add));
  // render() рисует ВСЕ вкладки — _invBody заполнен независимо от
  // активной (установлено D4).
  env.G.playerUI.setCharacter(c);
  env.G.playerUI.toggle(true);
  assert.equal(env.errors.length, 0,
    'setCharacter/toggle: 0 ошибок: ' + env.errors.join('; '));
  const row = itemRowByName(env, BP_NAME);
  assert.ok(row, 'строка «' + BP_NAME + '» в инвентаре панели');
  const tip = row.querySelector('.cp-tip');
  assert.ok(tip, 'заполненная строка предмета — .cp-tip (000097)');
  assert.ok(tip.textContent.includes(
    'Эффект: изучает вид крафта «кузнечное_дело»'),
    'itemTipText: r.тип якорного рецепта (CRAFT_BY_ID); факт: '
    + tip.textContent);
  assert.equal(env.errors.length, 0, '0 ошибок: ' + env.errors.join('; '));
});

test('TIP-2: itemTipText craft_recipe (деградация, без Game.Craft — delete ПОСЛЕ загрузки цепочки, ДО open, Д3): .cp-tip содержит «Эффект: изучает вид крафта «iron_sword»» (id из effect.recipe — зеркальная id-форма)', () => {
  const env = loadEnv();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  delete env.G.Craft;
  // ui.js снимает `const G = globalThis.Game` ОДИН раз при загрузке —
  // ТОТ ЖЕ объект sandbox.Game: delete виден через замыкание (Д3).
  const c = env.G.createCharacter();
  const add = env.G.addItem(c, 'blueprint_forge');
  assert.equal(add.ok, true, 'выдача чертёжа: ' + JSON.stringify(add));
  env.G.playerUI.setCharacter(c);
  env.G.playerUI.toggle(true);
  assert.equal(env.errors.length, 0,
    'setCharacter/toggle: 0 ошибок (рендер без Game.Craft — '
    + 'typeof-guard): ' + env.errors.join('; '));
  const row = itemRowByName(env, BP_NAME);
  assert.ok(row, 'строка «' + BP_NAME + '» в инвентаре панели');
  const tip = row.querySelector('.cp-tip');
  assert.ok(tip, 'заполненная строка предмета — .cp-tip (000097)');
  assert.ok(tip.textContent.includes(
    'Эффект: изучает вид крафта «iron_sword»'),
    'деградация без CRAFT_BY_ID — id из effect.recipe (зеркало); '
    + 'факт: ' + tip.textContent);
  assert.equal(env.errors.length, 0, '0 ошибок: ' + env.errors.join('; '));
});

// Задача 000309: разборка предметов на составные части (TDD: красные
// тесты, UI-часть): возврат 20%→90% с навыком крафта, разборка
// качает навык сборки. Worktree task-000309 (ветка task/000309,
// база master 52a9041).
//
// ТЗ: tasks/pending/000309.md; контракт: memory/000309-disassemble.md
// (§4 UI, §6 красные тесты UI-1..UI-4):
//   UI-1 кнопка «разобрать» (data-act="disassemble") у iron_sword
//       ЕСТЬ: метка строчная «разобрать» (НЕ строка «Разобрать»
//       постройки), dataset.item = id; ПОЗИЦИЯ — после 'быстр.'
//       ПЕРЕД '−1' (ui-tab-inventory.js L134/L135); у sulfur (нет
//       рецепта) кнопки НЕТ; ошибок загрузки/рендера 0.
//   UI-2 КЛИК: hero secondary.forge=1, L_вида=1 (p=0.2), __seq
//       [0.1, 0.9] (сброс ПРЯМО ПЕРЕД кликом — паттерн
//       tests/craft-ui.test.js): iron_sword −1, wood_sword +1,
//       sulfur +0, c.craftXp['кузнечное_дело'] = 12 (10 + `уровень`
//       2 рецепта), .cp-notice = «Разобрано: Железный меч —
//       возвращено: Деревянный меч ×1» (ТОЧНО, по существующей
//       ветке flashNotice(r.message), ui.js:556); 0 ошибок.
//   UI-3 деградация без Game.Craft (delete ПОСЛЕ загрузки цепочки —
//       ui.js снимает `const G = globalThis.Game` один раз, тот же
//       объект, прецедент craft-scroll-use TIP-2): фаза 1 — кнопка
//       ЕСТЬ (с Game.Craft); фаза 2 — кнопки нет, строки тултипа
//       «Разборка: …» нет, 0 console.error (тихие typeof-guard),
//       игра не падает.
//   UI-4 тултип (itemTipText, строка ПЕРЕД `Вес:`): fresh
//       (связанный навык есть, L=1) → «Разборка: кузнечное_дело —
//       возврат 20%»; c.craft['кузнечное_дело']=100 → «возврат
//       90%» (re-render через setCharacter — render при живой
//       панели); у sulfur (нет рецепта) строки НЕТ; 0 ошибок.
//   UI-5 тултип «Снаряжение» (правка по итогам ревью 000309,
//       раунд 1; Д-ТИП-ЛИСТ memory/000309-disassemble.md §4):
//       строка «Разборка: …» ТОЛЬКО по листу ГЕРОЯ (c ===
//       character): активный герой (sheet = c) → «возврат 20%»
//       (L=1); активный наёмник (sheet = m.sheet, craft 100) →
//       строки НЕТ (тихий skip; до правки — ложное «возврат 90%»
//       по листу мерса). Паттерн makePartyEnv ui.test.js (roster
//       через __game.state; npc-data.js/sheet.js/party.js в
//       CHAIN — ДО ui.js).
//
// Красная стадия: 4 красных (UI-1..UI-4), осмысленная — src/ui.js и
// src/ui-tab-inventory.js загружаются чисто (CHAIN из index.html до
// ui.js включительно, craft-data.js/craft.js ДО ui.js —
// typeof-guard делает рендер без новых функций зелённым), падение —
// на ОТСУТСТВИИ кнопки/строки тултипа/notice-текста (контракт §4),
// а не на синтаксисе/модуле.
//
// Харнес — ДУБЛЬ tests/craft-scroll-use.test.js (makeEl/matchesSel/
// findAll/CHAIN/loadEnv/itemRowByName — у тестов НЕТ общего
// test-lib, конвенция проекта); CHAIN — ДИНАМИЧЕСКИЙ: ВСЕ
// <script src> index.html до src/ui.js включительно (craft-data.js/
// craft.js — В ЦЕПОЧКЕ, Game.Craft ЕСТЬ; craft-ui.js ПОСЛЕ ui.js —
// НЕ входит; ui-tab-inventory.js — ДО ui.js, входит). Клик —
// panel.listeners.click[0]({ target: btn }) (один обработчик кликов
// на всю панель, ui.js:184). Детерминированный Math.random —
// window.__seq в песочнице (паттерн tests/craft-ui.test.js L327-358).
//
// Cross-realm (vm): пины — примитивы/текст/длины (правило 000082).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const page = () => fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// --- Минимальный DOM-стаб с деревом (дубль craft-scroll-use) ---

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
  // обновляет тела in place: panel._invBody.textContent = '').
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

// ДИНАМИЧЕСКИЙ CHAIN: ВСЕ <script src> index.html до src/ui.js
// включительно — ВКЛЮЧАЯ craft-data.js/craft.js (Game.Craft ЕСТЬ)
// и ui-tab-inventory.js (вкладка «Инвентарь»); БЕЗ craft-ui.js
// (в index.html ПОСЛЕ ui.js). Новый script-тег подхватывается сам;
// лоадер МЕЖДУ ФАЗАМИ не правится.
const CHAIN = (() => {
  const all = Array.from(
    page().matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1]);
  const i = all.indexOf('src/ui.js');
  assert.ok(i >= 0, 'ui.js подключён в index.html');
  assert.ok(all.indexOf('src/craft-data.js') >= 0
    && all.indexOf('src/craft-data.js') < i
    && all.indexOf('src/craft.js') >= 0
    && all.indexOf('src/craft.js') < i
    && all.indexOf('src/ui-tab-inventory.js') >= 0
    && all.indexOf('src/ui-tab-inventory.js') < i
    && all.indexOf('src/npc-data.js') >= 0
    && all.indexOf('src/npc-data.js') < i
    && all.indexOf('src/sheet.js') >= 0
    && all.indexOf('src/sheet.js') < i
    && all.indexOf('src/party.js') >= 0
    && all.indexOf('src/party.js') < i,
    'craft-data.js/craft.js/ui-tab-inventory.js/npc-data.js/'
    + 'sheet.js/party.js — ДО ui.js в index.html; факт: '
    + JSON.stringify(all.slice(0, i + 1)));
  return all.slice(0, i + 1);
})();

// Загрузка цепочки в vm-песочницу → { G, body, errors, sandbox }.
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

// Детерминированный Math.random в песочнице (паттерн
// tests/craft-ui.test.js L327-335): цикл по window.__seq.
function patchRng(env) {
  vm.runInContext(
    'window.__seq = [0.001, 0.999]; window.__seqI = 0;\n'
    + 'Math.random = function () {\n'
    + '  return window.__seq[window.__seqI++ % window.__seq.length];\n'
    + '};',
    env.sandbox, { filename: 'disassemble-rng-setup.js' });
}

// Сброс ПРЯМО ПЕРЕД кликом (паттерн craft-ui.test.js L356-358).
function resetSeq(env, seq) {
  env.sandbox.window.__seq = seq;
  env.sandbox.window.__seqI = 0;
}

// Строка инвентаря по имени (.cp-itemrow с дочерним .cp-itemname
// textContent = name; itemRow — ядро ui.js, 000097).
function itemRowByName(env, name) {
  const rows = findAll(env.body, '.cp-itemrow');
  for (const row of rows) {
    const nm = row.querySelector('.cp-itemname');
    if (nm && nm.textContent === name) return row;
  }
  return null;
}

// Панель — ОДИН .char-panel в body (ui.js:119, appendChild в body).
function panelOf(env) {
  const panels = findAll(env.body, '.char-panel');
  assert.equal(panels.length, 1, 'ровно одна .char-panel');
  return panels[0];
}

test('UI-1: вкладка «Инвентарь» — кнопка «разобрать» (data-act="disassemble") у iron_sword ЕСТЬ, ПОСЛЕ \'быстр.\' ПЕРЕД \'−1\'; у sulfur НЕТ; 0 ошибок', () => {
  const env = loadEnv();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  assert.ok(env.G.Craft, 'Game.Craft в цепочке (craft.js ДО ui.js)');
  const c = env.G.createCharacter();
  const add = env.G.addItem(c, 'iron_sword');
  assert.equal(add.ok, true, 'выдача iron_sword: ' + JSON.stringify(add));
  const add2 = env.G.addItem(c, 'sulfur', 3);
  assert.equal(add2.ok, true, 'выдача sulfur: ' + JSON.stringify(add2));
  env.G.playerUI.setCharacter(c);
  env.G.playerUI.toggle(true);
  assert.equal(env.errors.length, 0,
    'setCharacter/toggle: 0 ошибок: ' + env.errors.join('; '));
  const row = itemRowByName(env, 'Железный меч');
  assert.ok(row, 'строка «Железный меч» в инвентаре панели');
  const btn = row.querySelector('button[data-act="disassemble"]');
  assert.ok(btn,
    'кнопка «разобрать» (data-act="disassemble") у строки есть '
    + '(контракт §4); факт: '
    + JSON.stringify(row.querySelectorAll('button')
      .map((b) => b.dataset.act)));
  assert.equal(btn.textContent, 'разобрать',
    'метка СТРОЧНАЯ «разобрать» (НЕ строка «Разобрать» постройки)');
  assert.equal(btn.dataset.item, 'iron_sword', 'dataset.item — id');
  // Позиция: после 'быстр.' (ui-tab-inventory.js L134), перед
  // '−1' (L135).
  const acts = row.querySelectorAll('button').map((b) => b.dataset.act);
  const iQuick = acts.indexOf('quick');
  const iDis = acts.indexOf('disassemble');
  const iRem = acts.indexOf('remove');
  assert.ok(iQuick >= 0 && iDis >= 0 && iRem >= 0
      && iDis > iQuick && iDis < iRem,
    'позиция: ПОСЛЕ \'быстр.\' ПЕРЕД \'−1\'; факт: ' + JSON.stringify(acts));
  // sulfur — нет канонического рецепта → кнопки НЕТ.
  const rowS = itemRowByName(env, 'Сера ×3');
  assert.ok(rowS, 'строка «Сера ×3» в инвентаре панели');
  assert.equal(rowS.querySelector('button[data-act="disassemble"]'), null,
    'у sulfur (нет рецепта) кнопки «разобрать» НЕТ');
  assert.equal(env.errors.length, 0, '0 ошибок: ' + env.errors.join('; '));
});

test('UI-2: клик «разобрать» (__seq [0.1, 0.9], L=1, p=0.2) — iron_sword −1, wood_sword +1, sulfur +0, craftXp 12, .cp-notice ТОЧНО «Разобрано: Железный меч — возвращено: Деревянный меч ×1»; 0 ошибок', () => {
  const env = loadEnv();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  assert.ok(env.G.Craft, 'Game.Craft в цепочке (craft.js ДО ui.js)');
  patchRng(env);
  const c = env.G.createCharacter();
  c.secondary.forge = 1; // связанный навык ≥ 1 (потолок 2), L=1
  const add = env.G.addItem(c, 'iron_sword');
  assert.equal(add.ok, true, 'выдача iron_sword: ' + JSON.stringify(add));
  env.G.playerUI.setCharacter(c);
  env.G.playerUI.toggle(true);
  assert.equal(env.errors.length, 0,
    'setCharacter/toggle: 0 ошибок: ' + env.errors.join('; '));
  const row = itemRowByName(env, 'Железный меч');
  assert.ok(row, 'строка «Железный меч» в инвентаре панели');
  const btn = row.querySelector('button[data-act="disassemble"]');
  assert.ok(btn, 'кнопка «разобрать» есть (UI-1)');
  const panel = panelOf(env);
  // Сброс seq ПРЯМО ПЕРЕД кликом: 1-я позиция (wood_sword) — 0.1
  // < p=0.2 → вернулась; 2-я (sulfur) — 0.9 → нет.
  resetSeq(env, [0.1, 0.9]);
  panel.listeners.click[0]({ target: btn });
  assert.equal(env.errors.length, 0,
    'клик: 0 ошибок: ' + env.errors.join('; '));
  assert.equal(env.G.totalQty(c, 'iron_sword'), 0,
    'предмет снят (×1 → 0)');
  assert.equal(env.G.totalQty(c, 'wood_sword'), 1,
    '1-я позиция вернулась (ролл 0.1 < p=0.2)');
  assert.equal(env.G.totalQty(c, 'sulfur'), 0,
    '2-я позиция не вернулась (ролл 0.9)');
  assert.equal(c.craftXp['кузнечное_дело'], 12,
    'опыт 10 + `уровень` 2 канонического рецепта — виду '
    + '«кузнечное_дело»');
  const notice = panel.querySelector('.cp-notice');
  assert.ok(notice, '.cp-notice в панели (ui.js:174)');
  assert.equal(notice.textContent,
    'Разобрано: Железный меч — возвращено: Деревянный меч ×1',
    'flash в .cp-notice ТОЧНО (существующая ветка '
    + 'flashNotice(r.message), ui.js:556); факт: '
    + (notice.textContent || ''));
});

test('UI-3: деградация без Game.Craft — фаза 1: кнопка ЕСТЬ; фаза 2 (delete ПОСЛЕ загрузки): кнопки нет, строки тултипа «Разборка: …» нет, 0 console.error, игра не падает', () => {
  const env = loadEnv();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  assert.ok(env.G.Craft, 'фаза 1: Game.Craft в цепочке');
  const c = env.G.createCharacter();
  c.secondary.forge = 1;
  const add = env.G.addItem(c, 'iron_sword');
  assert.equal(add.ok, true, 'выдача iron_sword: ' + JSON.stringify(add));
  env.G.playerUI.setCharacter(c);
  env.G.playerUI.toggle(true);
  assert.equal(env.errors.length, 0,
    'фаза 1: setCharacter/toggle: 0 ошибок: ' + env.errors.join('; '));
  const row = itemRowByName(env, 'Железный меч');
  assert.ok(row, 'фаза 1: строка «Железный меч»');
  assert.ok(row.querySelector('button[data-act="disassemble"]'),
    'фаза 1 (с Game.Craft): кнопка «разобрать» ЕСТЬ');
  // Фаза 2: ui.js снимает `const G = globalThis.Game` ОДИН раз при
  // загрузке — ТОТ ЖЕ объект sandbox.Game: delete виден через
  // замыкание (прецедент craft-scroll-use TIP-2).
  delete env.G.Craft;
  env.G.playerUI.setCharacter(c);
  env.G.playerUI.toggle(true);
  assert.equal(env.errors.length, 0,
    'фаза 2: деградация — 0 console.error (тихие typeof-guard): '
    + env.errors.join('; '));
  const row2 = itemRowByName(env, 'Железный меч');
  assert.ok(row2, 'фаза 2: строка предмета рендерится');
  assert.equal(row2.querySelector('button[data-act="disassemble"]'), null,
    'фаза 2: кнопки «разобрать» НЕТ (typeof-guard)');
  const tip = row2.querySelector('.cp-tip');
  assert.ok(tip, 'фаза 2: заполненная строка — .cp-tip (000097)');
  assert.ok(!tip.textContent.includes('Разборка:'),
    'фаза 2: строки тултипа «Разборка: …» НЕТ; факт: '
    + tip.textContent);
});

test('UI-4: тултип — строка «Разборка: кузнечное_дело — возврат 20%» (L=1); c.craft=100 → «возврат 90%»; у sulfur строки НЕТ; 0 ошибок', () => {
  const env = loadEnv();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  assert.ok(env.G.Craft, 'Game.Craft в цепочке (craft.js ДО ui.js)');
  const c = env.G.createCharacter();
  c.secondary.forge = 1; // связанный навык есть, L=1
  const add = env.G.addItem(c, 'iron_sword');
  assert.equal(add.ok, true, 'выдача iron_sword: ' + JSON.stringify(add));
  const add2 = env.G.addItem(c, 'sulfur', 1);
  assert.equal(add2.ok, true, 'выдача sulfur: ' + JSON.stringify(add2));
  env.G.playerUI.setCharacter(c);
  env.G.playerUI.toggle(true);
  assert.equal(env.errors.length, 0,
    'setCharacter/toggle: 0 ошибок: ' + env.errors.join('; '));
  const tip = itemRowByName(env, 'Железный меч').querySelector('.cp-tip');
  assert.ok(tip, 'заполненная строка — .cp-tip (000097)');
  assert.ok(tip.textContent.includes('Разборка: кузнечное_дело — возврат 20%'),
    'L=1 (уровня нет) — «возврат 20%» (тип — id канонического '
    + 'рецепта); факт: ' + tip.textContent);
  // L=100 → 90%: re-render — setCharacter при живой панели шлёт
  // render() (ui.js:895-898).
  c.craft = { 'кузнечное_дело': 100 };
  env.G.playerUI.setCharacter(c);
  assert.equal(env.errors.length, 0,
    're-render (L=100): 0 ошибок: ' + env.errors.join('; '));
  const tip2 = itemRowByName(env, 'Железный меч').querySelector('.cp-tip');
  assert.ok(tip2, 're-render: .cp-tip строки «Железный меч»');
  assert.ok(tip2.textContent.includes('Разборка: кузнечное_дело — возврат 90%'),
    'L=100 — «возврат 90%»; факт: ' + tip2.textContent);
  // sulfur — нет рецепта → строки НЕТ.
  const tipS = itemRowByName(env, 'Сера').querySelector('.cp-tip');
  assert.ok(tipS, 'заполненная строка «Сера» — .cp-tip');
  assert.ok(!tipS.textContent.includes('Разборка:'),
    'sulfur (нет рецепта): строки «Разборка: …» НЕТ; факт: '
    + tipS.textContent);
  assert.equal(env.errors.length, 0, '0 ошибок: ' + env.errors.join('; '));
});

test('UI-5: тултип «Снаряжение» — строка «Разборка: …» ТОЛЬКО по листу ГЕРОЯ: активный герой (sheet = c) — «возврат 20%» (L=1); активный наёмник (sheet мерса, craft 100) — строки НЕТ (тихий skip, Д-ТИП-ЛИСТ); 0 ошибок', () => {
  const env = loadEnv();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  assert.ok(env.G.Craft, 'Game.Craft в цепочке (craft.js ДО ui.js)');
  const hero = env.G.createCharacter();
  hero.secondary.forge = 1; // связанный навык есть, L_вида=1 (20%)
  hero.equipment = { right_hand: 'iron_sword' };
  // Наёмник Вольк (паттерн makePartyEnv ui.test.js): лист мерса с
  // СВОИМ кузнечным видом L=100 — до правки по ревью раунда 1
  // строка в «Снаряжении» мерса показывала «возврат 90%» (число
  // по листу member — неверное: разборка — только с инвентаря
  // ГЕРОЯ, doItemAction c = character).
  const volk = env.G.NpcData.NPCS.find((n) => n.id === 'merc_volk');
  assert.ok(volk, 'Вольк (merc_volk) в каталоге npc-data');
  const mercSheet = env.G.Sheet.createSheet('merc', {
    primary: volk.найм.базовые_характеристики,
    spells: volk.найм.spells,
    npcId: 'merc_volk',
  });
  for (const [id, lv] of Object.entries(volk.найм.начальные_навыки)) {
    mercSheet.secondary[id] = lv;
  }
  mercSheet.craft = { 'кузнечное_дело': 100 };
  mercSheet.equipment = { right_hand: 'iron_sword' };
  env.sandbox.__game = { state: {
    efir: null, efirMet: false,
    roster: [{
      npcId: 'merc_volk', sheet: mercSheet, level: 1,
      xp: 0, loyalty: 51, hiredDay: 1,
    }],
  } };
  env.G.playerUI.setCharacter(hero);
  env.G.playerUI.toggle(true);
  assert.equal(env.errors.length, 0,
    'setCharacter/toggle: 0 ошибок: ' + env.errors.join('; '));
  // Активный ГЕРОЙ (activeCharId = null): «Снаряжение» — лист
  // ГЕРОЯ (sheet = c = character) — строка ЕСТЬ, 20% по L=1 героя.
  let row = itemRowByName(env, 'Правая рука: Железный меч');
  assert.ok(row, 'строка «Правая рука: Железный меч» в «Снаряжение»');
  let tip = row.querySelector('.cp-tip');
  assert.ok(tip, 'заполненная строка героя — .cp-tip (000097)');
  assert.ok(tip.textContent.includes(
      'Разборка: кузнечное_дело — возврат 20%'),
    'активный герой — строка ЕСТЬ (20% по L_вида=1 героя); факт: '
    + tip.textContent);
  // Активный НАЁМНИК (toggle(true, null, 'merc_volk') — 000145):
  // «Снаряжение» — лист мерса (sheet = m.sheet ≠ character) —
  // строки НЕТ (тихий skip Д-ТИП-ЛИСТ).
  env.G.playerUI.toggle(true, null, 'merc_volk');
  assert.equal(env.errors.length, 0,
    're-render (активный наёмник): 0 ошибок: '
    + env.errors.join('; '));
  row = itemRowByName(env, 'Правая рука: Железный меч');
  assert.ok(row, 'строка меча в «Снаряжении» наёмника');
  tip = row.querySelector('.cp-tip');
  assert.ok(tip, 'заполненная строка наёмника — .cp-tip');
  assert.ok(!tip.textContent.includes('Разборка:'),
    'активный наёмник (sheet мерса): строки «Разборка: …» НЕТ '
    + '(тихий skip, Д-ТИП-ЛИСТ); факт: ' + tip.textContent);
  assert.equal(env.errors.length, 0, '0 ошибок: ' + env.errors.join('; '));
});

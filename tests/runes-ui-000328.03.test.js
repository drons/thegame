// Задача 000328.03 — КРАСНЫЕ ТЕСТЫ (TDD): руны в UI — отображение рун
// на предмете (строки «Руна: «<название>»» + описание + иконки) в
// tooltip надетого предмета и инвентарной стопки.
//
// ТЗ — tasks/pending/000328.03.md; контракт — memory/000328-runes.md
// §15 (Поверхность UI): аддитивный 3-й аргумент itemTipText(it, c, runes),
// аддитивный 8-й аргумент itemRow(..., tipIcons), ctx.runeIconsOf;
// порядок — ПО ПОРЯДКУ массива (канон первого вхождения = LIFO);
// неизвестный id — тихий skip.
//
// МЕХАНИКА: vm-песочница + ДИНАМИЧЕСКИЙ CHAIN (все <script src>
// index.html до ui.js — паттерн tooltip-item-icon-000308) + DOM-стаб
// без insertBefore (условие деградации 000308 D4/D5) + ДВУХФАЗНАЯ
// loadEnv(fx). FX-фикстуры — ТОЛЬКО в vm (каталог/ассеты 0-diff;
// волна 000321.01 не задевается — count-пинов каталога нет).
//
// КРАСНЫЕ (7 — падают на базе: функциональности нет, строк рун в
// .cp-tip нет; ПЕРВЫЙ ассерт каждого vm-теста — errors===0, т.е.
// осмысленная краснота ERR_ASSERTION, не крах загрузки):
//   T1    «Снаряжение»: надетое с runes → две строки «Руна: «…»» ПО
//           ПОРЯДКУ массива; зеркальный fixture с обратным массивом →
//           обратный порядок (анти-сортировка);
//   T2    «Инвентарь»: два слота одного id с РАЗНЫМИ runes → разные
//           наборы строк рун, пересечения нет;
//   T3b   полный текст .cp-tip с двумя рунами — золотая строка
//           (руны МЕЖДУ kind-строкой и «Редкость:»);
//   T4    unknown id (руны записаны в обход канона): резолвящаяся
//           строка есть, «no_such_rune» — ни строки, ни img, errors 0;
//   T5    иконки: img.cp-tipicon в .cp-tip = [иконка предмета,
//           assets/sprites/runes/stone_hide.svg, …wall_plate.svg] по
//           порядку; файлы иконок существуют на диске;
//   T6    e2e: клик «надеть» реальным каталожным предметом с рунами →
//           tooltip строки «Снаряжения» содержит строку руны
//           (equipmentBonus[slot].runes донесены — контракт 000328.02);
//   W1    spec/runes.md — буллет поверхности отображения (иглы).
// ЗЕЛЁНЫЕ гварды (с первого запуска, в red-счёт НЕ входят):
//   T3    предмет БЕЗ рун — полный текст .cp-tip золотой строкой
//           бит-в-бит (регрессия пинов 000097/000230.07 — не-рунный
//           путь 0-diff);
//   G1    derived и JSON-снапшот героя — бит-в-бит до/после открытия
//           панели (показ не влияет на производные — M12-стиль).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const page = () => fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// --- DOM-стаб с деревом (дубль tests/tooltip-item-icon-000308.test.js:
// «.класс», имя тега, parent/closest, textContent сбрасывает детей;
// insertBefore/firstChild/createTextNode — НЕТ: в этой среде иконка
// тултипа идёт appendChild-fallback, порядок СРЕДИ img тот же) ---

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
// включительно (паттерн 000308/000328.02) ---

const CHAIN = (() => {
  const all = Array.from(
    page().matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
    .map((p) => p.replace(/^src\//, ''));
  const i = all.indexOf('ui.js');
  assert.ok(i >= 0, 'ui.js подключён в index.html');
  return all.slice(0, i + 1);
})();

// --- ДВУХФАЗНАЯ загрузка (FX в Game.ITEMS до items.js) ---

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
  const Gf = sandbox.Game;
  assert.ok(Gf.RunesData && Array.isArray(Gf.RunesData.RUNES)
    && Gf.RunesData.RUNES.length >= 55,
    'Game.RunesData.RUNES загружен (runes-data.js — ДО ui.js, '
    + 'индекс-контракт 000328.02)');
  return {
    G: sandbox.Game, body: document.body, doc: document,
    errors, sandbox,
  };
}

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

function itemRowsByName(root, namePart) {
  return findAll(root, '.cp-itemrow')
    .filter((r) => {
      const name = r.querySelector('.cp-itemname');
      return name && String(name.textContent).includes(namePart);
    });
}

function clickOn(panel, node) {
  const clickers = panel.listeners.click || [];
  assert.ok(clickers.length >= 1,
    'делегированный click-обработчик панели есть');
  clickers[0]({ target: node });
}

// Имена/описания — из РЕАЛЬНОГО каталога (_fixture_ только предметы;
// id рун — контракт биекции 000328.01 T3, файлы иконок на диске).
function runeCard(env, id) {
  const r = env.G.RunesData.RUNES.find((x) => x && x.id === id);
  assert.ok(r, 'каталог: руна «' + id + '» есть');
  return r;
}

function runeLineText(r) {
  return 'Руна: «' + r.название + '» — ' + r.описание;
}

// FX-фикстуры (ТОЛЬКО в vm): редкий (лимит 2) клинок с иконкой-путём;
// описание-фикстура нейтральное. rarity — для принятия рун (RUNE_LIMITS).
const FX_BLADE = {
  id: 'fx_rune_blade', name: 'Клинок рун (fx)', kind: 'weapon',
  subtype: 'sword', stats: { damage: 7 }, slot: 'right_hand',
  rarity: 'rare',
  icon: 'assets/sprites/items/fx_rune_blade.svg',
  weight: 2, value: 40,
  desc: 'Клинок рун (тестовая фикстура 000328.03).',
};

// --- T1: «Снаряжение» — строки рун по порядку массива (анти-сортировка
// зеркальным fixture с обратным порядком) ---

test('T1. «Снаряжение»: надетое с runes — строки «Руна: «<название>»» ПО ПОРЯДКУ массива; зеркальный порядок — обратный (анти-сортировка)', () => {
  const a = runeCard(loadEnv(), 'stone_hide');
  const b = runeCard(loadEnv(), 'wall_plate');

  const env1 = loadEnv([FX_BLADE]);
  const c1 = env1.G.createCharacter();
  assert.ok(env1.G.addItem(c1, 'fx_rune_blade', 1, null,
    ['stone_hide', 'wall_plate']).ok,
    'фикстура: клинок с [stone_hide, wall_plate] в инвентаре');
  assert.ok(env1.G.equip(c1, 'fx_rune_blade').ok,
    'фикстура: клинок экипирован (Правая рука)');
  const panel1 = openPanel(env1, c1);
  const row1 = itemRowsByName(panel1._equipBody,
    'Правая рука: Клинок рун (fx)')[0];
  assert.ok(row1, 'строка «Правая рука: Клинок рун (fx)» найдена');
  const tip1 = row1.querySelector('.cp-tip');
  assert.ok(tip1, 'у строки есть .cp-tip (контракт 000097)');
  const t1 = String(tip1.textContent);
  assert.ok(t1.includes(runeLineText(a)),
    'RED: строка первой руны («' + a.название + '» — '
    + 'название+описание каталога); факт: ' + t1);
  assert.ok(t1.includes(runeLineText(b)),
    'RED: строка второй руны («' + b.название + '»); факт: ' + t1);
  assert.ok(t1.indexOf(runeLineText(a)) < t1.indexOf(runeLineText(b)),
    'RED: порядок строк = порядку массива [stone_hide, wall_plate]; '
    + 'факт: индексы ' + t1.indexOf(runeLineText(a)) + '/'
    + t1.indexOf(runeLineText(b)));

  const env2 = loadEnv([FX_BLADE]);
  const c2 = env2.G.createCharacter();
  assert.ok(env2.G.addItem(c2, 'fx_rune_blade', 1, null,
    ['wall_plate', 'stone_hide']).ok,
    'фикстура: клинок с [wall_plate, stone_hide] (обратный массив)');
  assert.ok(env2.G.equip(c2, 'fx_rune_blade').ok,
    'фикстура: экипирован');
  const panel2 = openPanel(env2, c2);
  const row2 = itemRowsByName(panel2._equipBody,
    'Правая рука: Клинок рун (fx)')[0];
  assert.ok(row2, 'строка снаряжения найдена');
  const t2 = String(row2.querySelector('.cp-tip').textContent);
  assert.ok(t2.indexOf(runeLineText(b)) < t2.indexOf(runeLineText(a)),
    'RED: обратный массив — обратный порядок строк (сортировка '
    + 'запрещена: канон первого вхождения = LIFO); факт: индексы '
    + t2.indexOf(runeLineText(b)) + '/' + t2.indexOf(runeLineText(a)));
});

// --- T2: «Инвентарь» — две стопки одного id с РАЗНЫМИ runes ---

test('T2. «Инвентарь»: два слота одного id с разными runes — РАЗНЫЕ наборы строк рун, пересечения нет', () => {
  const a = runeCard(loadEnv(), 'stone_hide');
  const b = runeLineText(runeCard(loadEnv(), 'wall_plate'));
  const cc = runeLineText(runeCard(loadEnv(), 'citadel_heart'));
  const env = loadEnv([FX_BLADE]);
  const c = env.G.createCharacter();
  assert.ok(env.G.addItem(c, 'fx_rune_blade', 1, null,
    ['stone_hide', 'wall_plate']).ok, 'фикстура: стопка A');
  assert.ok(env.G.addItem(c, 'fx_rune_blade', 1, null,
    ['citadel_heart']).ok, 'фикстура: стопка B (третья ось ключа)');
  const panel = openPanel(env, c);
  const rows = itemRowsByName(panel._invBody, 'Клинок рун (fx)');
  assert.equal(rows.length, 2,
    'две строки одного id (runes — третья ось ключа стопки)');
  const tips = rows.map((r) => String(r.querySelector('.cp-tip').textContent));
  assert.ok(tips[0].includes(runeLineText(a)) && tips[0].includes(b),
    'RED: строки рун стопки A в tooltip ячейки; факт: ' + tips[0]);
  assert.ok(tips[1].includes(cc),
    'RED: строка руны стопки B; факт: ' + tips[1]);
  assert.ok(!tips[0].includes(cc) && !tips[1].includes(b),
    'RED: наборы НЕ пересекаются (runes не утекают между стопками)');
  // Инвентарная нога иконок: у каждой стопки СВОИ img.cp-tipicon по
  // порядку её массива (после иконки предмета).
  const iconSets = rows.map((r) =>
    findAll(r.querySelector('.cp-tip'), 'img').map((im) => im.src));
  assert.deepEqual(iconSets[0],
    [FX_BLADE.icon, 'assets/sprites/runes/stone_hide.svg',
      'assets/sprites/runes/wall_plate.svg'],
    'RED: иконки инвентарной строки стопки A; факт: '
    + JSON.stringify(iconSets[0]));
  assert.deepEqual(iconSets[1],
    [FX_BLADE.icon, 'assets/sprites/runes/citadel_heart.svg'],
    'RED: иконки инвентарной строки стопки B; факт: '
    + JSON.stringify(iconSets[1]));
});

// --- T3: гвард (зелёный) — предмет БЕЗ рун: полный текст золотой ---

test('T3. гвард: FX-предмет без рун — полный текст .cp-tip золотой строкой бит-в-бит (регрессия пинов 000097)', () => {
  const env = loadEnv([FX_BLADE]);
  const c = env.G.createCharacter();
  assert.ok(env.G.addItem(c, 'fx_rune_blade').ok,
    'фикстура: клинок БЕЗ рун в инвентаре');
  const panel = openPanel(env, c);
  const row = itemRowsByName(panel._invBody, 'Клинок рун (fx)')[0];
  assert.ok(row, 'строка найдена');
  const tip = row.querySelector('.cp-tip');
  assert.equal(String(tip.textContent),
    FX_BLADE.desc + '\nУрон: 7\nРедкость: редкий\nВес: 2 кг\nЦена: 40 з',
    'не-рунный tooltip бит-в-бит (аддитивность 3-го аргумента)');
  assert.ok(!String(tip.textContent).includes('Руна'),
    'без рун — строки «Руна:» нет');
});

// --- T3b: золотая строка С рунами — место вставки (после kind, до
// «Редкость:») ---

test('T3b. золотой полный текст тултипа с двумя рунами: строки рун МЕЖДУ kind-строкой и «Редкость:»', () => {
  const a = runeLineText(runeCard(loadEnv(), 'stone_hide'));
  const b = runeLineText(runeCard(loadEnv(), 'wall_plate'));
  const env = loadEnv([FX_BLADE]);
  const c = env.G.createCharacter();
  assert.ok(env.G.addItem(c, 'fx_rune_blade', 1, null,
    ['stone_hide', 'wall_plate']).ok, 'фикстура: стопка с 2 рунами');
  const panel = openPanel(env, c);
  const row = itemRowsByName(panel._invBody, 'Клинок рун (fx)')[0];
  assert.ok(row, 'строка найдена');
  assert.equal(String(row.querySelector('.cp-tip').textContent),
    FX_BLADE.desc + '\nУрон: 7\n' + a + '\n' + b
    + '\nРедкость: редкий\nВес: 2 кг\nЦена: 40 з',
    'RED: место вставки — после kind-строк (аффиксы → руны → наборы), '
    + 'ДО «Редкость:»');
});

// --- T4: неизвестный id — тихий skip (руны записаны в обход канона;
// после sanitizeInventory недостижимо — фолбэк) ---

test('T4. unknown id в массиве runes (в обход канона): резолвящаяся строка есть, «no_such_rune» — ни строки, ни img; errors 0', () => {
  const a = runeLineText(runeCard(loadEnv(), 'stone_hide'));
  const env = loadEnv([FX_BLADE]);
  const c = env.G.createCharacter();
  assert.ok(env.G.addItem(c, 'fx_rune_blade').ok, 'фикстура: клинок');
  const slot = c.inventory.slots.find((e) => e.id === 'fx_rune_blade');
  slot.runes = ['stone_hide', 'no_such_rune'];
  const panel = openPanel(env, c);
  assert.equal(env.errors.length, 0,
    'показ неизвестного id — тихий skip, не console.error');
  const row = itemRowsByName(panel._invBody, 'Клинок рун (fx)')[0];
  assert.ok(row, 'строка найдена');
  const tip = row.querySelector('.cp-tip');
  const t = String(tip.textContent);
  assert.ok(t.includes(a),
    'RED: резолвящаяся руна показана даже при неизвестном соседе; '
    + 'факт: ' + t);
  assert.ok(!t.includes('no_such_rune'),
    'неизвестный id — НЕ «undefined», не сам id, тихий skip');
  assert.ok(!findAll(tip, 'img').some((im) =>
    String(im.src).includes('no_such_rune')),
    'RED: битого img для неизвестного id нет');
});

// --- T5: иконки рун в .cp-tip (img.cp-tipicon по порядку, после
// иконки предмета); файлы — на диске (биекция 000328.01 T3) ---

test('T5. иконки: img.cp-tipicon в .cp-tip = [иконка предмета, assets/sprites/runes/stone_hide.svg, …wall_plate.svg] по порядку; файлы есть', () => {
  const env = loadEnv([FX_BLADE]);
  const c = env.G.createCharacter();
  assert.ok(env.G.addItem(c, 'fx_rune_blade', 1, null,
    ['stone_hide', 'wall_plate']).ok, 'фикстура: клинок с 2 рунами');
  assert.ok(env.G.equip(c, 'fx_rune_blade').ok, 'фикстура: экипирован');
  const panel = openPanel(env, c);
  const row = itemRowsByName(panel._equipBody,
    'Правая рука: Клинок рун (fx)')[0];
  assert.ok(row, 'строка снаряжения найдена');
  const tip = row.querySelector('.cp-tip');
  assert.ok(tip, '.cp-tip есть');
  const imgs = findAll(tip, 'img');
  assert.deepEqual(imgs.map((im) => im.src),
    [FX_BLADE.icon,
      'assets/sprites/runes/stone_hide.svg',
      'assets/sprites/runes/wall_plate.svg'],
    'RED: иконка предмета первой, иконки рун — по порядку массива; '
    + 'факт: ' + JSON.stringify(imgs.map((im) => im.src)));
  for (const im of imgs) {
    assert.equal(im.className, 'cp-tipicon',
      'класс иконки тултипа — cp-tipicon (механизм 000308, CSS 0-diff)');
    assert.equal(im.alt, '', 'alt пуст (иконка презентационная)');
  }
  assert.ok(fs.existsSync(path.join(ROOT,
    'assets/sprites/runes/stone_hide.svg')),
    'иконка stone_hide на диске (биекция 000328.01 T3)');
  assert.ok(fs.existsSync(path.join(ROOT,
    'assets/sprites/runes/wall_plate.svg')),
    'иконка wall_plate на диске');
});

// --- T6: e2e — клик «надеть» реальным каталожным предметом с руной →
// tooltip снаряжения содержит строку руны ---

test('T6. e2e (M14-стиль): клик «надеть» каталожным предметом с руной → equipmentBonus runes донесены, tooltip «Снаряжения» содержит строку руны', () => {
  const a = runeLineText(runeCard(loadEnv(), 'stone_hide'));
  const env = loadEnv();
  const caps = { common: 1, rare: 2, epic: 3, legendary: 4, impossible: 5 };
  const cand = env.G.ITEMS.find((it) => it
    && (it.kind === 'weapon' || it.kind === 'armor')
    && Object.prototype.hasOwnProperty.call(caps, it.rarity));
  assert.ok(cand, 'каталог: экипируемый предмет с rarity есть');
  const runes = ['stone_hide'].slice(0, caps[cand.rarity]);
  const c = env.G.createCharacter();
  assert.ok(env.G.addItem(c, cand.id, 1, null, runes).ok,
    'фикстура: «' + cand.name + '» с рунами в инвентаре');
  const panel = openPanel(env, c);
  const invRow = itemRowsByName(panel._invBody, cand.name)[0];
  assert.ok(invRow, 'строка инвентаря найдена');
  const equipBtn = findAll(invRow, 'button')
    .find((bx) => bx.dataset.act === 'equip');
  assert.ok(equipBtn, 'кнопка «надеть» есть');
  clickOn(panel, equipBtn);
  const slot = Object.keys(c.equipment || {})
    .find((k) => c.equipment[k] === cand.id);
  assert.ok(slot, 'RED: предмет экипирован кликом (контракт 000328.02)');
  assert.equal(JSON.stringify(c.equipmentBonus[slot].runes),
    JSON.stringify(runes),
    'RED: runes донесены в equipmentBonus[slot] (equip-контракт)');
  const eqRow = itemRowsByName(panel._equipBody, cand.name)[0];
  assert.ok(eqRow, 'строка «Снаряжения» найдена после render');
  assert.ok(String(eqRow.querySelector('.cp-tip').textContent)
    .includes(a),
    'RED: tooltip снаряжённого предмета содержит строку руны');
});

// --- G1: гвард (зелёный) — показ не влияет на derived/состояние ---

test('G1. гвард: derived и снапшот героя бит-в-бит до/после открытия панели (показ ≠ мутация — M12-стиль)', () => {
  const env = loadEnv([FX_BLADE]);
  const c = env.G.createCharacter();
  assert.ok(env.G.addItem(c, 'fx_rune_blade', 1, null,
    ['stone_hide', 'wall_plate']).ok, 'фикстура: клинок с рунами');
  assert.ok(env.G.equip(c, 'fx_rune_blade').ok, 'фикстура: экипирован');
  const d0 = JSON.stringify(env.G.derived(c));
  const s0 = JSON.stringify(c);
  openPanel(env, c);
  assert.equal(JSON.stringify(env.G.derived(c)), d0,
    'derived не меняется от факта показа');
  assert.equal(JSON.stringify(c), s0,
    'герой (инвентарь/оборудование/bonus) — без мутаций от рендера');
});

// --- W1: SPEC-игла буллета поверхности отображения ---

test('W1. spec/runes.md — буллет отображения рун в UI (тултип, порядок массива, иконки)', () => {
  const txt = fs.readFileSync(path.join(ROOT, 'spec', 'runes.md'), 'utf8');
  for (const ph of ['Руна: «<название>»', 'по порядку массива', 'тултип']) {
    assert.ok(txt.includes(ph),
      'RED: игла буллета 000328.03 «' + ph + '» отсутствует');
  }
  assert.equal(txt.includes('(v1)'), false, 'негатив-сканер: «(v1)»');
});

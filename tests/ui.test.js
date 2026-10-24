// Задача 000230.07 — КРАСНЫЕ ТЕСТЫ (TDD): UI — иконки предметов,
// рамки редкости, много-слотовое «Снаряжение» (11 частей тела +
// 8 слотов колец).
//
// ТЗ — tasks/pending/000230.07.md; контракт —
// memory/000230.07-equipment-ui.md (раскладка 19 строк §2, itemRow §3,
// itemTipText §4, маршрутизация §5, equipmentTab §6, CSS §7, тесты §8).
//
// МЕХАНИКА: vm-песочница (паттерн 000083/000169) + ДИНАМИЧЕСКИЙ CHAIN
// (ВСЕ <script src> index.html до ui.js включительно — подхватит любой
// новый тег сам; прецедент ui-panel-htmlcollection.test.js) + ДВУХФАЗНАЯ
// загрузка с фикстурами FX: до items-data.js включительно →
// Game.ITEMS = ITEMS.concat(FX) → items.js строит каталог-Map из
// мутированного массива (прецедент items.test.js E18/E19/SB15).
// FX — ТОЛЬКО в vm-песочнице (assets/items, items-data.js, svg-счётчики
// — 0 diff). Валидные validateItem-формы (D1: явный slot у
// shield/artifact/tool/ring).
//
// КРАСНЫЕ (10 — падают на master, функциональность ещё не существует):
//   230.07-RAR-1  рамка редкости: 5 редкостей → 5 классов
//                 cp-rarity-<r> + 5 CSS-правил (hex ТЗ п.8);
//   230.07-RAR-2  рамка в ТРЁХ местах: инвентарь + «Снаряжение» +
//                 магазин (общий механизм, ТЗ п.2);
//   230.07-EQ-1   «Снаряжение» — ровно 19 строк (10 частей + сводная
//                 «Кольца: N/8» + 8 физ. слотов колец), Точный порядок
//                 имён; пустые — без кнопки/.cp-tip/img;
//   230.07-EQ-2   строки физ. слотов (right_hand/torso/ring_left_1),
//                 meta, «снять» c data-equipslot = физ. слот (НЕ
//                 алиас) → G.unequip + зеркала;
//   230.07-EQ-3   «надеть» — для ВСЕХ 6 EQUIP_KINDS (контракт
//                 memory/000230.02 §5); slotOf по item.slot;
//   230.07-EQ-4   активный наёмник (000230.06): 19 строк ЛИСТА
//                 НАЁМНИКА; «снять» → allyUnequip (предмет в ОБЩИЙ
//                 инвентарь героя, 000194); «надеть» → allyEquip
//                 (предмет с ОБЩЕГО инвентаря на лист наёмника);
//   230.07-EQ-5   Эфир: 19 заблокированных строк «— дух не
//                 экипируется —» (без кнопок/.cp-tip); «надеть» в
//                 «Инвентаре» → notice «Эфир — дух, не экипируется»
//                 (ТОЧНАЯ строка .06, пин companions C3);
//   230.07-TIP-1  тултип — аффиксы: «Аффикс: <навык> <знак><N>» +
//                 «Заклинание без маны: <имя>»;
//   230.07-TIP-2  тултип — активный набор: «Набор <set>: n/4» +
//                 «Бонус набора <t>: <описание>» (set_bonus с КАРТОЧКИ
//                 предмета);
//   230.07-TIP-3  тултип — редкость: 5 текстов
//                 «Редкость: <обычный|редкий|эпический|легендарный|
//                 невозможный>».
// ЗЕЛЁНЫЕ с начала (гарды/регрессия, в red-счёт НЕ входят):
//   230.07-RAR-G  расходники + каталог 182 шт. БЕЗ rarity — БЕЗ рамки
//                 (className побайтово «cp-itemrow»);
//   230.07-ICON-1 img.cp-itemicon ПЕРВЫМ ребёнком, src = icon: loot/
//                 (iron_ore) + items/ (blueprint_forge) — механизм
//                 000237, конвенция ТЗ п.1 (код не меняется);
//   230.07-ICON-G без icon — без img (гард 000237).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const page = () => fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// --- DOM-стаб с деревом (дубль tests/ui-panel.test.js: «.класс»,
// имя тега, 'тег[атрибут=значение]', parent/closest, textContent
// сбрасывает детей) ---

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
// включительно (паттерн ui-panel-htmlcollection.test.js) ---

const CHAIN = (() => {
  const all = Array.from(
    page().matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
    .map((p) => p.replace(/^src\//, ''));
  const i = all.indexOf('ui.js');
  assert.ok(i >= 0, 'ui.js подключён в index.html');
  return all.slice(0, i + 1);
})();

// --- Фикстуры FX (ТОЛЬКО в vm; каталог/ассеты — 0 diff) ---
// 5 редкостей (ТЗ п.8) + affixes (skill+free_cast) + набор fx_guild
// (2 предмета, порог 2) + 4 новых kind'а (D1: явный slot).

const FX = [
  {
    id: 'fx_rare_blade', name: 'Редкий клинок (fx)', kind: 'weapon',
    subtype: 'sword', stats: { damage: 8 }, slot: 'right_hand',
    rarity: 'rare',
    affixes: [
      { type: 'skill', skill: 'swordsman', amount: 0.05 },
      { type: 'free_cast', spell: 'spark' },
    ],
    icon: 'assets/sprites/items/fx_rare_blade.svg',
    weight: 3, value: 100,
    desc: 'Редкий клинок (тестовая фикстура 000230.07).',
  },
  {
    id: 'fx_epic_helm', name: 'Эпический шлем (fx)', kind: 'armor',
    stats: { armor: 3 }, slot: 'head', rarity: 'epic',
    set: 'fx_guild', set_bonus: { 2: { armor: 2 } },
    weight: 2, value: 90,
    desc: 'Эпический шлем (тестовая фикстура 000230.07).',
  },
  {
    id: 'fx_rare_circlet', name: 'Редкий обруч (fx)', kind: 'armor',
    stats: { armor: 1 }, slot: 'ears', rarity: 'rare',
    set: 'fx_guild', set_bonus: { 2: { armor: 2 } },
    weight: 0.5, value: 60,
    desc: 'Редкий обруч (тестовая фикстура 000230.07).',
  },
  {
    id: 'fx_impossible_ring', name: 'Невозможное кольцо (fx)',
    kind: 'ring', slot: 'ring', rarity: 'impossible',
    weight: 0.1, value: 500,
    desc: 'Невозможное кольцо (тестовая фикстура 000230.07).',
  },
  {
    id: 'fx_legend_shield', name: 'Легендарный щит (fx)',
    kind: 'shield', stats: { armor: 4 }, slot: 'left_hand',
    rarity: 'legendary',
    weight: 5, value: 200,
    desc: 'Легендарный щит (тестовая фикстура 000230.07).',
  },
  {
    id: 'fx_common_tool', name: 'Обычный инструмент (fx)',
    kind: 'tool', slot: 'right_hand', rarity: 'common',
    weight: 1, value: 10,
    desc: 'Обычный инструмент (тестовая фикстура 000230.07).',
  },
  {
    id: 'fx_plain_helm', name: 'Простой шлем (fx)', kind: 'armor',
    stats: { armor: 1 }, slot: 'head',
    weight: 1, value: 15,
    desc: 'Простой шлем (тестовая фикстура 000230.07).',
  },
  {
    id: 'fx_artifact', name: 'Талисман (fx)', kind: 'artifact',
    slot: 'left_hand',
    weight: 0.5, value: 40,
    desc: 'Талисман (тестовая фикстура 000230.07).',
  },
];

// --- ДВУХФАЗНАЯ загрузка: phase 1 до items-data.js → concat(FX) →
// phase 2 (items.js строит каталог-Map из мутированного Game.ITEMS) ---

function loadEnv() {
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
  assert.ok(Gd && Array.isArray(Gd.ITEMS) && Gd.ITEMS.length >= 82,
    'Game.ITEMS после items-data.js (реальный каталог)');
  sandbox.Game.ITEMS = Gd.ITEMS.concat(FX);
  for (let i = idx + 1; i < CHAIN.length; i++) {
    vm.runInContext(src(CHAIN[i]), sandbox, { filename: CHAIN[i] });
  }
  return {
    G: sandbox.Game, body: document.body, doc: document,
    errors, sandbox,
  };
}

// ПЕРВЫЙ ассерт каждого теста — errors.length === 0 (цепочка
// грузится чисто — осмысленное падение RED-ассертами, не
// SyntaxError/MODULE_NOT_FOUND).

function openPanel(env, tabId, charId) {
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  assert.ok(env.G.playerUI,
    'Game.playerUI создан (controls.js загружен ДО ui.js)');
  env.G.playerUI.toggle(true, tabId, charId);
  const panel = findAll(env.body, '.char-panel')[0];
  assert.ok(panel, 'панель .char-panel подвешена к body');
  return panel;
}

// Pane по столбцу/позиции (порядок тегов 000130: ЛЕВО —
// Персонаж/Инвентарь/Настройки; ПРАВО — Снаряжение/Магазин/Квесты).
function panesOf(env) {
  const panel = findAll(env.body, '.char-panel')[0];
  assert.ok(panel, 'панель .char-panel в body');
  const cols = findAll(panel, '.cp-column');
  assert.equal(cols.length, 2, 'два столбца (контракт 000096)');
  const l = findAll(cols[0], '.cp-tabpane');
  const r = findAll(cols[1], '.cp-tabpane');
  assert.equal(l.length, 3, 'лево: 3 pane');
  assert.equal(r.length, 3, 'право: 3 pane');
  return {
    character: l[0], inventory: l[1], settings: l[2],
    equipment: r[0], shop: r[1], quests: r[2],
  };
}

function itemRowByName(root, namePart) {
  return findAll(root, '.cp-itemrow')
    .find((r) => {
      const name = r.querySelector('.cp-itemname');
      return name && String(name.textContent).includes(namePart);
    }) || null;
}

// Клик через ЕДИНСТВЕННЫЙ делегированный обработчик панели.
function clickOn(panel, node) {
  const clickers = panel.listeners.click || [];
  assert.ok(clickers.length >= 1,
    'делегированный click-обработчик панели есть');
  clickers[0]({ target: node });
}

function noticeOf(panel) {
  const n = findAll(panel, '.cp-notice')[0];
  assert.ok(n, 'уведомление .cp-notice есть в панели');
  return n;
}

// Классы строки (className — строка стаба).
function rowClasses(row) {
  return String(row.className).split(/\s+/).filter(Boolean);
}

// c.equipment — undefined у свежего героя (ensureEquipment ленив).
function eqSlot(c, slot) {
  return (c.equipment && typeof c.equipment === 'object'
    && !Array.isArray(c.equipment)) ? c.equipment[slot] : undefined;
}

// CSS index.html: декларация правила «.sel { … }» (дубль
// cssRule ui-panel.test.js; неэкранированные точки — any-char,
// имена селекторов уникальны — ложных срабатываний нет).
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

// Партия: герой (ctx.character) + наёмный Вольк (roster live через
// __game.state — как в игре; Эфира нет; паттерн makePartyEnv
// ui-panel-htmlcollection.test.js).
function makePartyEnv() {
  const env = loadEnv();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  assert.ok(env.G.playerUI, 'Game.playerUI создан (ui.js в CHAIN)');
  const hero = env.G.createCharacter();
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
  const roster = [{
    npcId: 'merc_volk', sheet: mercSheet, level: 1,
    xp: 0, loyalty: 51, hiredDay: 1,
  }];
  env.sandbox.__game = { state: { efir: null, efirMet: false, roster } };
  env.hero = hero;
  env.mercSheet = mercSheet;
  env.G.playerUI.setCharacter(hero);
  return env;
}

// --- КРАСНЫЕ ---

test('230.07-RAR-1: рамка редкости — 5 редкостей → 5 классов cp-rarity-<r> на строках «Инвентаря» + 5 CSS-правил в index.html (hex ТЗ п.8: светло-серый/зелёный/синий/фиолетовый/жёлто-оранжевый)', () => {
  const env = loadEnv();
  const c = env.G.createCharacter();
  env.G.playerUI.setCharacter(c);
  const cases = [
    ['fx_common_tool', 'common', 'Обычный инструмент (fx)'],
    ['fx_rare_blade', 'rare', 'Редкий клинок (fx)'],
    ['fx_epic_helm', 'epic', 'Эпический шлем (fx)'],
    ['fx_legend_shield', 'legendary', 'Легендарный щит (fx)'],
    ['fx_impossible_ring', 'impossible', 'Невозможное кольцо (fx)'],
  ];
  for (const [id] of cases) env.G.addItem(c, id);
  const panel = openPanel(env);
  for (const [, rarity, name] of cases) {
    const row = itemRowByName(panel._invBody, name);
    assert.ok(row, 'строка «' + name + '» в «Инвентарь»');
    assert.ok(rowClasses(row).includes('cp-rarity-' + rarity),
      'у строки «' + name + '» класс cp-rarity-' + rarity
      + ' (краснота: itemRow БЕЗ 6-го аргумента rarity); факт: '
      + String(row.className));
  }
  const html = page();
  const colors = {
    common: '#a39b8b', rare: '#58a858', epic: '#5b8fd4',
    legendary: '#9b6bd4', impossible: '#e0952f',
  };
  for (const [r, hex] of Object.entries(colors)) {
    const d = cssRule(html, 'cp-itemrow.cp-rarity-' + r);
    assert.equal(d.border, '1px solid ' + hex,
      'CSS .cp-itemrow.cp-rarity-' + r
      + ' — border 1px solid ' + hex + ' (краснота: правил нет)');
  }
});

test('230.07-RAR-2: ОБЩИЙ механизм рамки (ТЗ п.2) — «Инвентарь» + «Снаряжение» + МАГАЗИН: строка кольца в «Снаряжение» + строка покупки в «Магазин» несут класс редкости', () => {
  const env = loadEnv();
  const c = env.G.createCharacter();
  env.G.playerUI.setCharacter(c);
  env.G.addItem(c, 'fx_impossible_ring');
  env.G.equip(c, 'fx_impossible_ring');
  assert.equal(c.equipment.ring_left_1, 'fx_impossible_ring',
    'фикстура: кольцо в ring_left_1');
  const panel = openPanel(env);
  const eqRow = itemRowByName(panel._equipBody, 'Невозможное кольцо (fx)');
  assert.ok(eqRow,
    'строка кольца в «Снаряжение» (краснота: 2 строки weapon/armor)');
  assert.ok(rowClasses(eqRow).includes('cp-rarity-impossible'),
    'рамка редкости на строке «Снаряжение»; факт: '
    + String(eqRow.className));
  env.G.playerUI.setShop({
    x: 0, y: 0, buildingType: 0, wealth: 1,
    stock: { fx_rare_blade: 1 },
  });
  const shopRow = itemRowByName(panel._shopBody, 'Редкий клинок (fx)');
  assert.ok(shopRow, 'строка покупки в «Магазин»');
  assert.ok(rowClasses(shopRow).includes('cp-rarity-rare'),
    'рамка редкости на строке МАГАЗИНА (краснота: 3-арг. itemRow в '
    + 'ui-tab-shop.js); факт: ' + String(shopRow.className));
});

test('230.07-EQ-1: «Снаряжение» — ровно 19 строк (10 частей + сводная «Кольца: 0/8» + 8 физ. слотов колец), Точный порядок подписей (контракт memory §2); пустые — без кнопки, .cp-tip и img', () => {
  const env = loadEnv();
  const c = env.G.createCharacter();
  env.G.playerUI.setCharacter(c);
  const panel = openPanel(env);
  const rows = findAll(panel._equipBody, '.cp-itemrow');
  assert.equal(rows.length, 19,
    'ровно 19 строк (краснота: 2 строки weapon/armor); факт: '
    + rows.length);
  assert.deepEqual(rows.map((r) =>
    r.querySelector('.cp-itemname').textContent), [
    'Голова: — пусто —',
    'Уши: — пусто —',
    'Шея: — пусто —',
    'Корпус: — пусто —',
    'Предплечья: — пусто —',
    'Правая рука: — пусто —',
    'Левая рука: — пусто —',
    'Ладони: — пусто —',
    'Кольца: 0/8',
    'Ноги: — пусто —',
    'Ступни: — пусто —',
    'Левое кольцо 1: — пусто —',
    'Левое кольцо 2: — пусто —',
    'Левое кольцо 3: — пусто —',
    'Левое кольцо 4: — пусто —',
    'Правое кольцо 1: — пусто —',
    'Правое кольцо 2: — пусто —',
    'Правое кольцо 3: — пусто —',
    'Правое кольцо 4: — пусто —',
  ], 'порядок и подписи 19 строк (контракт memory §2)');
  for (const r of rows) {
    const name = r.querySelector('.cp-itemname').textContent;
    assert.equal(r.querySelectorAll('button').length, 0,
      'пустая строка «' + name + '» — без кнопок');
    assert.equal(r.querySelector('.cp-tip'), null,
      'пустая строка «' + name + '» — без .cp-tip');
    assert.ok(!r.children.some((ch) => ch.tagName === 'img'),
      'пустая строка «' + name + '» — без img');
  }
});

test('230.07-EQ-2: строки физ. слотов (right_hand/torso/ring_left_1) + meta («урон 5»/«броня +2» бит-в-бит) + «снять» c data-equipslot = физ. слот (НЕ алиас) → G.unequip: предмет в инвентарь, слот null, зеркала синхронны', () => {
  const env = loadEnv();
  const c = env.G.createCharacter();
  env.G.playerUI.setCharacter(c);
  env.G.addItem(c, 'iron_sword');
  env.G.equip(c, 'iron_sword');
  env.G.addItem(c, 'leather_armor');
  env.G.equip(c, 'leather_armor');
  env.G.addItem(c, 'fx_impossible_ring');
  env.G.equip(c, 'fx_impossible_ring');
  const panel = openPanel(env);
  const swordRow = itemRowByName(panel._equipBody, 'Железный меч');
  assert.ok(swordRow, 'строка меча в «Снаряжение»');
  assert.equal(swordRow.querySelector('.cp-itemname').textContent,
    'Правая рука: Железный меч',
    'имя строки «<Часть>: <предмет>» (краснота: 2 строки weapon/armor)');
  assert.equal(swordRow.querySelector('.cp-itemmeta').textContent,
    'урон 5', 'meta оружия бит-в-бит (пин 237-INV-2)');
  const wBtn = swordRow.querySelector('button');
  assert.ok(wBtn, 'кнопка «снять» у заполненной строки');
  assert.equal(wBtn.dataset.act, 'unequip');
  assert.equal(wBtn.dataset.equipslot, 'right_hand',
    'data-equipslot = ФИЗ. СЛОТ (краснота: алиас «weapon»); факт: '
    + String(wBtn.dataset.equipslot));
  const armorRow = itemRowByName(panel._equipBody, 'Кожаный доспех');
  assert.ok(armorRow, 'строка брони в «Снаряжение»');
  assert.equal(armorRow.querySelector('.cp-itemname').textContent,
    'Корпус: Кожаный доспех');
  assert.equal(armorRow.querySelector('.cp-itemmeta').textContent,
    'броня +2', 'meta брони бит-в-бит');
  assert.equal(armorRow.querySelector('button').dataset.act, 'unequip');
  assert.equal(armorRow.querySelector('button').dataset.equipslot,
    'torso', 'data-equipslot = физ. слот брони (краснота: алиас «armor»)');
  const ringRow = itemRowByName(panel._equipBody, 'Невозможное кольцо (fx)');
  assert.ok(ringRow, 'строка кольца в «Снаряжение»');
  assert.equal(ringRow.querySelector('.cp-itemname').textContent,
    'Левое кольцо 1: Невозможное кольцо (fx)',
    'кольцо — ПЕРВЫЙ пустой из 8 (порядок RING_SLOTS, 000230.02)');
  assert.ok(rowClasses(ringRow).includes('cp-rarity-impossible'),
    'рамка редкости на строке кольца');
  assert.equal(ringRow.querySelector('button').dataset.equipslot,
    'ring_left_1', 'data-equipslot = физ. слот кольца');
  clickOn(panel, wBtn);
  assert.equal(c.equipment.right_hand, null, 'слот очищен');
  assert.equal(c.equipment.weapon, null, 'зеркало weapon синхронно');
  assert.ok(env.G.hasItem(c, 'iron_sword'),
    'предмет возвращён в инвентарь героя');
});

test('230.07-EQ-3: «надеть» — для ВСЕХ 6 EQUIP_KINDS (weapon/armor/shield/artifact/tool/ring — контракт memory/000230.02 §5); клик → G.equip по slotOf (item.slot); swap — прежний предмет в инвентарь', () => {
  const env = loadEnv();
  const c = env.G.createCharacter();
  env.G.playerUI.setCharacter(c);
  for (const id of ['iron_sword', 'leather_armor', 'fx_legend_shield',
      'fx_artifact', 'fx_common_tool', 'fx_impossible_ring']) {
    env.G.addItem(c, id);
  }
  const panel = openPanel(env);
  const cases = [
    ['Железный меч', 'right_hand', 'iron_sword'],
    ['Кожаный доспех', 'torso', 'leather_armor'],
    ['Легендарный щит (fx)', 'left_hand', 'fx_legend_shield'],
    ['Талисман (fx)', 'left_hand', 'fx_artifact'],
    ['Обычный инструмент (fx)', 'right_hand', 'fx_common_tool'],
    ['Невозможное кольцо (fx)', 'ring_left_1', 'fx_impossible_ring'],
  ];
  for (const [name, slot, id] of cases) {
    const row = itemRowByName(panel._invBody, name);
    assert.ok(row, 'строка «' + name + '» в «Инвентарь»');
    const btn = row.children
      .find((ch) => ch.tagName === 'button' && ch.dataset.act === 'equip');
    assert.ok(btn,
      'у «' + name + '» кнопка «надеть» (краснота: только weapon/'
      + 'armor, ui-tab-inventory.js); факт: '
      + row.children.filter((ch) => ch.tagName === 'button')
      .map((b) => b.dataset.act).join(','));
    clickOn(panel, btn);
    assert.equal(c.equipment[slot], id,
      '«' + name + '» → слот ' + slot + ' (slotOf по item.slot)');
  }
  assert.ok(env.G.hasItem(c, 'fx_legend_shield'),
    'swap: щит (вытеснен талисманом) возвращён в инвентарь');
  assert.ok(env.G.hasItem(c, 'iron_sword'),
    'swap: меч (вытеснен инструментом) возвращён в инвентарь');
});

test('230.07-EQ-4: активный НАЁМНИК (000230.06) — «Снаряжение» рисует лист НАЁМНИКА (19 строк, не героя); «снять» → allyUnequip (предмет в ОБЩИЙ инвентарь героя, 000194); «надеть» → allyEquip (предмет с ОБЩЕГО инвентаря героя на лист наёмника)', () => {
  const env = makePartyEnv();
  const c = env.hero;
  const mercSheet = env.mercSheet;
  env.G.ensureEquipment(mercSheet);
  mercSheet.equipment.right_hand = 'iron_sword';
  env.G.addItem(c, 'fx_legend_shield');
  const panel = openPanel(env, 'equipment', 'merc_volk');
  const rows = findAll(panel._equipBody, '.cp-itemrow');
  assert.equal(rows.length, 19,
    '19 строк ЛИСТА НАЁМНИКА (краснота: render всегда от hero — '
    + '2 строки); факт: ' + rows.length);
  const swordRow = itemRowByName(panel._equipBody, 'Железный меч');
  assert.ok(swordRow,
    '«Правая рука: Железный меч» — лист НАЁМНИКА, не героя (краснота: '
    + 'activeCharId не читается в equipmentTab)');
  assert.equal(swordRow.querySelector('.cp-itemname').textContent,
    'Правая рука: Железный меч');
  clickOn(panel, swordRow.querySelector('button'));
  assert.equal(mercSheet.equipment.right_hand, null,
    'слот наёмника очищен (live-лист записан)');
  assert.ok(env.G.hasItem(c, 'iron_sword'),
    'предмет в ОБЩИЙ инвентарь героя (000194)');
  assert.equal(eqSlot(c, 'right_hand'), undefined,
    'экипировка героя НЕ тронута (не его предмет)');
  const shieldRow = itemRowByName(panel._invBody, 'Легендарный щит (fx)');
  assert.ok(shieldRow, 'строка щита в «Инвентарь» (общий инвентарь)');
  const btn = shieldRow.children
    .find((ch) => ch.tagName === 'button' && ch.dataset.act === 'equip');
  assert.ok(btn, 'кнопка «надеть» у щита');
  clickOn(panel, btn);
  assert.equal(mercSheet.equipment.left_hand, 'fx_legend_shield',
    'предмет на лист НАЁМНИКА (краснота: hero-путь G.equip)');
  assert.ok(!env.G.hasItem(c, 'fx_legend_shield'),
    'предмет списан из ОБЩЕГО инвентаря героя');
  assert.equal(eqSlot(c, 'left_hand'), undefined,
    'экипировка героя НЕ тронута');
});

test('230.07-EQ-5: активный ЭФИР — 19 заблокированных строк «— дух не экипируется —» (без кнопок/.cp-tip); «надеть» в «Инвентаре» → notice «Эфир — дух, не экипируется» (ТОЧНАЯ строка .06), экипировка не изменилась', () => {
  const env = loadEnv();
  const c = env.G.createCharacter();
  const efirSheet = env.G.Sheet.createSheet('efir', { npcId: 'efir' });
  env.sandbox.__game = {
    state: { efir: efirSheet, efirMet: true, roster: [] },
  };
  env.G.addItem(c, 'iron_sword');
  env.G.playerUI.setCharacter(c);
  const panel = openPanel(env, 'equipment', 'efir');
  const rows = findAll(panel._equipBody, '.cp-itemrow');
  assert.equal(rows.length, 19,
    '19 заблокированных строк (краснота: обработка Эфира в UI '
    + 'отсутствует — 2 hero-строки); факт: ' + rows.length);
  for (const r of rows) {
    const name = String(r.querySelector('.cp-itemname').textContent);
    assert.ok(name.endsWith('— дух не экипируется —'),
      'строка заблокирована: ' + name);
    assert.equal(r.querySelectorAll('button').length, 0,
      'без кнопок: ' + name);
    assert.equal(r.querySelector('.cp-tip'), null, 'без .cp-tip: ' + name);
  }
  const swordRow = itemRowByName(panel._invBody, 'Железный меч');
  assert.ok(swordRow, 'строка меча в «Инвентарь» (инвентарь общий)');
  const btn = swordRow.children
    .find((ch) => ch.tagName === 'button' && ch.dataset.act === 'equip');
  assert.ok(btn, 'кнопка «надеть» (не блокируется у Эфира — двойной '
    + 'гард: строки «Снаряжения» без кнопок, doItemAction — отказ)');
  clickOn(panel, btn);
  assert.equal(noticeOf(panel).textContent, 'Эфир — дух, не экипируется',
    'notice — ТОЧНАЯ строка .06 (краснота: hero-путь G.equip — '
    + 'notice пуст); факт: ' + String(noticeOf(panel).textContent));
  assert.equal(eqSlot(c, 'right_hand'), undefined,
    'экипировка не изменилась');
});

test('230.07-TIP-1: тултип предмета с affixes — «Аффикс: <навык> <знак><N>» (swordsman → «Мечник +0.05») + «Заклинание без маны: <имя>» (spark → «Искра» из G.Spells); kind-строки/«Вес»/«Цена» — без изменений', () => {
  const env = loadEnv();
  const c = env.G.createCharacter();
  env.G.playerUI.setCharacter(c);
  env.G.addItem(c, 'fx_rare_blade');
  const panel = openPanel(env);
  const row = itemRowByName(panel._invBody, 'Редкий клинок (fx)');
  assert.ok(row, 'строка предмета найдена');
  const tip = row.querySelector('.cp-tip');
  assert.ok(tip, 'у заполненной строки есть .cp-tip');
  const t = tip.textContent;
  assert.ok(t.includes('Аффикс: Мечник +0.05'),
    'skill-аффикс (краснота: веток affixes в itemTipText нет); факт: '
    + t);
  assert.ok(t.includes('Заклинание без маны: Искра'),
    'free_cast-аффикс (имя из G.Spells.getSpell); факт: ' + t);
  assert.ok(t.includes('Урон: 8'), 'строка kind без изменений');
  assert.ok(t.includes('Вес: 3 кг'), '«Вес» без изменений');
  assert.ok(t.includes('Цена: 100 з'), '«Цена» без изменений');
});

test('230.07-TIP-2: тултип предмета из НАБОРА при 2 надетых (порог 2 активен) — «Набор fx_guild: 2/4» + «Бонус набора 2: броня +2» (set_bonus с КАРТОЧКИ предмета); у обоих предметов набора — одинаково', () => {
  const env = loadEnv();
  const c = env.G.createCharacter();
  env.G.playerUI.setCharacter(c);
  env.G.addItem(c, 'fx_epic_helm');
  env.G.equip(c, 'fx_epic_helm');
  env.G.addItem(c, 'fx_rare_circlet');
  env.G.equip(c, 'fx_rare_circlet');
  assert.equal(c.equipment.head, 'fx_epic_helm', 'фикстура: шлем head');
  assert.equal(c.equipment.ears, 'fx_rare_circlet', 'фикстура: обруч ears');
  assert.deepEqual(
    JSON.parse(JSON.stringify(env.G.activeSets(c).counts)),
    { fx_guild: 2 }, 'фикстура: набор активен (2 предмета)');
  const panel = openPanel(env);
  for (const namePart of ['Эпический шлем (fx)', 'Редкий обруч (fx)']) {
    const row = itemRowByName(panel._equipBody, namePart);
    assert.ok(row, 'надетый предмет «' + namePart + '» в «Снаряжение»');
    const tip = row.querySelector('.cp-tip');
    assert.ok(tip, 'у надетого предмета есть .cp-tip');
    const t = tip.textContent;
    assert.ok(t.includes('Набор fx_guild: 2/4'),
      'прогресс набора (краснота: set-ветки в itemTipText нет); факт: '
      + t);
    assert.ok(t.includes('Бонус набора 2: броня +2'),
      'активный порог 2 (данные set_bonus с карточки предмета); факт: '
      + t);
  }
});

test('230.07-TIP-3: тултип предмета С rarity — «Редкость: <имя>» (5 редкостей → 5 текстов: обычный/редкий/эпический/легендарный/невозможный)', () => {
  const env = loadEnv();
  const c = env.G.createCharacter();
  env.G.playerUI.setCharacter(c);
  const cases = [
    ['fx_common_tool', 'Обычный инструмент (fx)', 'Редкость: обычный'],
    ['fx_rare_blade', 'Редкий клинок (fx)', 'Редкость: редкий'],
    ['fx_epic_helm', 'Эпический шлем (fx)', 'Редкость: эпический'],
    ['fx_legend_shield', 'Легендарный щит (fx)', 'Редкость: легендарный'],
    ['fx_impossible_ring', 'Невозможное кольцо (fx)',
      'Редкость: невозможный'],
  ];
  for (const [id] of cases) env.G.addItem(c, id);
  const panel = openPanel(env);
  for (const [, name, line] of cases) {
    const row = itemRowByName(panel._invBody, name);
    assert.ok(row, 'строка «' + name + '»');
    const tip = row.querySelector('.cp-tip');
    assert.ok(tip, 'у «' + name + '» есть .cp-tip');
    assert.ok(tip.textContent.includes(line),
      '«' + line + '» в тултипе (краснота: rarity-ветки нет); факт: '
      + tip.textContent);
  }
});

// --- ЗЕЛЁНЫЕ с начала (гарды/регрессия; в red-счёт не входят) ---

test('230.07-RAR-G (гард): расходники (potion/food/reagent) БЕЗ rarity — БЕЗ рамки (className побайтово «cp-itemrow»); каталог 382 шт. — rarity только у экипировочных (ре-пин 000230.08: +25 head с rarity; ре-пин 000235.07: +25 свитков 000108–00132, rarity нет; ре-пин 000230.09: +50 уши/шея 000158–000207 с rarity; ре-пин 000230.10: +25 torso 000208–000232 с rarity; ре-пин 000230.11: +50 рук 000283–000332 с rarity — в skip-ветку; ре-пин 000230.12: +25 «правая рука» 000333–000357 с rarity, гард обобщён — slot, не kind armor; ре-пин 000230.13: +25 left_hand 000358–000382 с rarity — в skip-ветку; ре-пин 000230.14: +25 колец 000383–000407 с rarity — в skip-ветку) — в skip-ветку, прочие 147 — без поля rarity', () => {
  const env = loadEnv();
  const c = env.G.createCharacter();
  env.G.playerUI.setCharacter(c);
  for (const id of ['healing_potion', 'bread', 'sulfur']) {
    env.G.addItem(c, id);
  }
  const panel = openPanel(env);
  for (const name of ['Зелье лечения', 'Хлеб', 'Сера']) {
    const row = itemRowByName(panel._invBody, name);
    assert.ok(row, 'строка «' + name + '»');
    assert.equal(String(row.className), 'cp-itemrow',
      'расходник — без cp-rarity-* (0 diff); факт: '
      + String(row.className));
  }
  const data = require(path.join(ROOT, 'src', 'items-data.js'));
  assert.equal(data.ITEMS.length, 382,
    'каталог — 382 предмета (ре-пин 000230.08: 82 + 25 head; ' +
    'ре-пин 000235.07: +25 свитков; ре-пин 000235.08: +25 свитков ' +
    'волны Лёд; ре-пин 000230.09: +50 уши/шея; ре-пин 000230.10: ' +
    '+25 torso; ре-пин 000235.09: +25 свитков 000233–000257, ' +
    'rarity нет; ре-пин 000230.11: +50 рук 000283–000332, rarity ' +
    'есть; ре-пин 000230.12: +25 «правая рука» 000333–000357 ' +
    'с rarity; ре-пин 000230.13: +25 left_hand 000358–000382, rarity ' +
    'есть; ре-пин 000230.14: +25 колец 000383–000407, rarity ' +
    'есть)');
  let others = 0;
  for (const it of data.ITEMS) {
    // Ре-пин 000230.09: guard обобщён (любой экипировочный slot —
    // волны .10–.15 добавят torso/forearms и т.д. без правки пина).
    // Ре-пин 000230.12 (D-14): гард по slot — «правая рука»
    // (weapon/tool/staff) тоже с rarity и slot: right_hand.
    // Ре-пин 000230.13: guard по slot без привязки к kind
    // (left_hand — kind shield/artifact, не armor).
    // Ре-пин 000230.14: кольца slot 'ring' — в skip-ветку (D-11).
    if (it.slot !== undefined) continue;
    assert.equal(it.rarity, undefined,
      'каталожный предмет ' + it.id + ' — без rarity');
    others++;
  }
  assert.equal(others, 147,
    'прочих предметов — ровно 147 (382 − 235 с slot: 178 ' +
    '(103 armor (75 + 25 torso + 3 legacy remap) + 50 рук (000230.11) ' +
    '+ 25 left_hand (000230.13)) + 7 remap-оружий 000001–000007 ' +
    '+ 25 «правая рука» 000333–000357 + 25 колец (000230.14); ' +
    '000232: +6 чертежей без ' +
    'rarity; 000235.07: +25 свитков без rarity; ' +
    '000235.08: +25 свитков волны Лёд без rarity; ' +
    '000235.09: +25 свитков волны Тень без rarity; ре-пин 000230.11: ' +
    '+50 рук — в skip-ветку, others не сдвинулся; ' +
    'ре-пин 000230.12: +25 «правая рука» + 7 remap-оружий — ' +
    'others 154 → 147; ре-пин 000230.13: ' +
    '+25 left_hand — в skip-ветку, others не сдвинулся; ' +
    'ре-пин 000230.14: +25 колец — в skip-ветку, others не сдвинулся)');
});

test('230.07-ICON-1 (регрессия 000237): itemRow с icon — img.cp-itemicon ПЕРВЫМ ребёнком, src = icon: loot/ (iron_ore) + items/ (blueprint_forge) — конвенция пути ТЗ п.1 работает через общий механизм', () => {
  const env = loadEnv();
  const c = env.G.createCharacter();
  env.G.playerUI.setCharacter(c);
  env.G.addItem(c, 'iron_ore');
  env.G.addItem(c, 'blueprint_forge');
  const panel = openPanel(env);
  const oreRow = itemRowByName(panel._invBody, 'Железная руда');
  assert.ok(oreRow, 'строка «Железная руда»');
  assert.equal(oreRow.children[0].tagName, 'img',
    'img ПЕРВЫМ ребёнком (000237)');
  assert.equal(oreRow.children[0].className, 'cp-itemicon');
  assert.equal(oreRow.children[0].src, 'assets/sprites/loot/iron_ore.svg',
    'src = icon каталога (loot/)');
  assert.equal(oreRow.children[0].src, env.G.getItem('iron_ore').icon);
  const bpRow = itemRowByName(panel._invBody, 'Чертёж: кузнечное дело');
  assert.ok(bpRow, 'строка «Чертёж: кузнечное дело»');
  assert.equal(bpRow.children[0].tagName, 'img',
    'items/ — та же механика (000237, схема 000230.01: ОБЕ директории)');
  assert.equal(bpRow.children[0].src,
    'assets/sprites/items/blueprint_forge.svg',
    'src = icon каталога (items/)');
});

test('230.07-ICON-G (гард 000237): без icon (bread/sulfur) — без img, ПЕРВЫМ ребёнком span.cp-itemname (0 diff)', () => {
  const env = loadEnv();
  const c = env.G.createCharacter();
  env.G.playerUI.setCharacter(c);
  env.G.addItem(c, 'bread');
  env.G.addItem(c, 'sulfur');
  const panel = openPanel(env);
  for (const name of ['Хлеб', 'Сера']) {
    const row = itemRowByName(panel._invBody, name);
    assert.ok(row, 'строка «' + name + '»');
    assert.equal(row.children[0].tagName, 'span',
      'ПЕРВЫМ ребёнком — имя (img нет); факт: '
      + row.children[0].tagName);
    assert.equal(row.children[0].className, 'cp-itemname');
    assert.ok(!row.children.some((ch) => ch.tagName === 'img'),
      'img среди детей нет (icon не задан)');
  }
});

// =====================================================================
// Задача 000230.10 — T9 (e2e, H8/EN8-паттерн: vm-песочница, цепочка
// ITEMS_CHAIN минус items.js, затем items.js — live-каталог; НЕ
// фикстуры). Контракт — memory/000230.10-torso-items-wave.md §2/§3.1:
// 5 телесных навыков S=10; база maxHPMult 1.5 / damageTakenMult 0.5 /
// hpRegenMult 0.8 / mpRegenMult 0.3 / equipmentStats.armor 0; affixes
// доходят до derived; free_cast в equipmentAffixes; set-дормантность
// (порог 2 > 1 надетого). RED (TDD): torso-предметов в live-каталоге
// нет — equip падает по ОСМЫСЛЕННОЙ причине «неизвестный предмет:
// волна не добавлена» (не синтаксис/окружение).
// =====================================================================
const VM_TORSO_CHAIN_00023010 = ['global-settings.js', 'perlin.js',
  'map.js', 'skills-data.js', 'items-data.js', 'sheet.js', 'player.js'];
function makeVmSandboxWithConsole00023010() {
  const errors = [];
  const sandbox = {
    console: { log() {}, warn() {}, error: (m) => errors.push(String(m)) },
  };
  return { sandbox, errors };
}
function loadTorsosVmChain00023010(sandbox) {
  for (const f of VM_TORSO_CHAIN_00023010) {
    vm.runInNewContext(src(f), sandbox, { filename: f });
  }
}
// Меж-реальм: значения из vm-песочницы — чужие прототипы;
// deepStrictEqual их отвергает — нормализуем через JSON.
const fromVm00023010 = (v) => JSON.parse(JSON.stringify(v));

test('000230.10 T9 (vm, e2e): РЕАЛЬНЫЕ torso-предметы из live-каталога (не фикстуры) — equip в слот torso (M2-паттерн); при S=10 по ВСЕМ 5 телесным навыкам (constitution 8 — разрешение maxHP): база maxHP 90 (mult 1.5 = round(60·1.5)) / damageTakenMult 0.5 / hpRegenMult 0.8 / mpRegenMult 0.3 / equipmentStats.armor 0; linen_shirt → maxHP 91 (endurance 0.03: round(60·1.509)); cloth_sutan → damageTakenMult 0.475 (hide 0.05: 1 − 0.525); linen_tunic → hpRegenMult 0.825 (breath 0.05: 0.10 + 0.525 + 0.20); rough_kaftan → mpRegenMult 0.31 (meditation 0.05: 0.10 + 0.21); aegis_mantle → equipmentStats.armor 4 + damageTakenMult 0.30 (hide 0.40: 1 − 0.70) + hpRegenMult 0.975 (breath 0.35: 0.10 + 0.675 + 0.20); freeCast(ember_robe) содержит heat_shield; freeCast(shadow_robe) содержит stone_skin; DORMANT: cloth_sutan одна → counts {penitent:1}, бонуса НЕТ; ember_robe одна → {hearth:1}, meditation +0.05 НЕ применён (краснота: неизвестный предмет — волна не добавлена)', () => {
  const { sandbox } = makeVmSandboxWithConsole00023010();
  loadTorsosVmChain00023010(sandbox);
  vm.runInNewContext(src('items.js'), sandbox, { filename: 'items.js' });
  const G = sandbox.Game;
  const near = (a, b, msg) => assert.ok(
    Math.abs(a - b) < 1e-9, msg + ' (факт: ' + a + ')');
  const makeHero = () => {
    const c = G.createCharacter();
    c.primary.constitution = 8;
    c.secondary.endurance = 10;
    c.secondary.golem = 10;
    c.secondary.hide = 10;
    c.secondary.breath = 10;
    c.secondary.meditation = 10;
    return c;
  };
  const equipTorso = (c, id) => {
    const ra = G.addItem(c, id);
    assert.equal(ra.ok, true, id + ': выдача (' + (ra.reason || '')
      + ') — предмет есть в live-каталоге (краснота: неизвестный '
      + 'предмет — волна не добавлена)');
    const r = G.equip(c, id);
    assert.equal(r.ok, true, id + ': equip (' + (r.reason || '') + ')');
    assert.equal(c.equipment.torso, id, id + ': предмет в слоте torso');
  };
  {
    const c = makeHero();
    const d = G.derived(c);
    assert.equal(d.maxHP, 90,
      'база maxHP = round((20 + 8·5)·1.5) = 90 '
      + '(mult 1.5 = 1 + 0.03·10 + 0.02·10)');
    near(d.damageTakenMult, 0.5, 'база damageTakenMult (1 − 0.05·10)');
    near(d.hpRegenMult, 0.8, 'база hpRegenMult (0.10 + 0.05·10 + 0.02·10)');
    near(d.mpRegenMult, 0.3, 'база mpRegenMult (0.10 + 0.02·10)');
    assert.equal(G.equipmentStats(c).armor, 0,
      'база equipmentStats.armor (снаряжения нет)');
  }
  {
    const c = makeHero();
    equipTorso(c, 'linen_shirt');
    assert.equal(G.derived(c).maxHP, 91,
      'linen_shirt: maxHP = round((20 + 8·5)·1.509) = 91 '
      + '(endurance 0.03: mult 1 + 0.03·10·1.03 + 0.02·10)');
    assert.equal(G.equipmentStats(c).armor, 0,
      'linen_shirt: stats.armor 0 — equipmentStats.armor += 0');
  }
  {
    const c = makeHero();
    equipTorso(c, 'cloth_sutan');
    near(G.derived(c).damageTakenMult, 0.475,
      'cloth_sutan: damageTakenMult = max(0.1, 1 − 0.05·10·1.05)');
  }
  {
    const c = makeHero();
    equipTorso(c, 'linen_tunic');
    near(G.derived(c).hpRegenMult, 0.825,
      'linen_tunic: hpRegenMult = 0.10 + 0.05·10·1.05 + 0.02·10');
  }
  {
    const c = makeHero();
    equipTorso(c, 'rough_kaftan');
    near(G.derived(c).mpRegenMult, 0.31,
      'rough_kaftan: mpRegenMult = 0.10 + 0.02·10·1.05');
  }
  {
    const c = makeHero();
    equipTorso(c, 'aegis_mantle');
    assert.equal(G.equipmentStats(c).armor, 4,
      'aegis_mantle: stats.armor 4');
    const d = G.derived(c);
    near(d.damageTakenMult, 0.3,
      'aegis_mantle: damageTakenMult = 1 − 0.05·10·1.40 (hide 0.40)');
    near(d.hpRegenMult, 0.975,
      'aegis_mantle: hpRegenMult = 0.10 + 0.05·10·1.35 + 0.02·10 '
      + '(breath 0.35)');
  }
  {
    const c = makeHero();
    equipTorso(c, 'ember_robe');
    const a = G.equipmentAffixes(c);
    assert.ok(a.freeCast.has('heat_shield'),
      'ember_robe: free_cast heat_shield в equipmentAffixes.freeCast');
  }
  {
    const c = makeHero();
    equipTorso(c, 'shadow_robe');
    const a = G.equipmentAffixes(c);
    assert.ok(a.freeCast.has('stone_skin'),
      'shadow_robe: free_cast stone_skin в equipmentAffixes.freeCast');
  }
  {
    const c = makeHero();
    equipTorso(c, 'cloth_sutan');
    const st = G.activeSets(c);
    assert.deepEqual(fromVm00023010(st.counts), { penitent: 1 },
      'penitent — 1 надетый предмет');
    assert.equal(st.armor, 0, 'set-бонус НЕ активен (порог 2 > 1)');
    assert.deepEqual(fromVm00023010(st.skills), {},
      'set-skill-бонусов нет');
    assert.equal(st.freeCast.size, 0, 'set-free_cast-бонусов нет');
    assert.equal(G.equipmentStats(c).armor, 1,
      'equipmentStats.armor = 1 — только собственный armor cloth_sutan ' +
      '(1, ростер §2.1); set-бонус penitent (+1) НЕ применён (дормантность)');
  }
  {
    const c = makeHero();
    equipTorso(c, 'ember_robe');
    const st = G.activeSets(c);
    assert.deepEqual(fromVm00023010(st.counts), { hearth: 1 },
      'hearth — 1 надетый предмет');
    assert.equal(st.armor, 0, 'set-бонус НЕ активен (порог 2 > 1)');
    near(G.derived(c).mpRegenMult, 0.3,
      'ember_robe одна: mpRegenMult = 0.3 — set-bonus meditation '
      + '+0.05 НЕ применён (дормантность)');
  }
});

// =====================================================================
// Задача 000246 — КРАСНЫЕ ТЕСТЫ (TDD): Экран боя — кнопки управления
// (.combat-actions) — в САМЫЙ НИЗ правой панели (.combat-side);
// информация о выделенном существе + лог боя (.combat-log) — ВСЁ
// оставшееся пространство между линейкой маны и кнопками (flex-grow).
//
// ТЗ — tasks/pending/000246.md; контракт —
// memory/000246-combat-side-actions-bottom.md (порядок 7 детей
// [turnorder, hpbar, mpbar, state, log, quicklist, actions], решение
// по .combat-quicklist, 4 ре-пина на зелёной стадии).
//
// Механика: самодостаточная боевая vm-песочница (НОВЫЙ лоадер —
// существующий CHAIN/loadEnv файла 000230.07 НЕ трогается):
// ДИНАМИЧЕСКИЙ CHAIN = ВСЕ <script src> index.html ДО combat-ui.js
// включительно (порядок = index.html; прецедент — dungeon-info-window.
// test.js, полный префикс грузится чисто) + СНИСХОДИТЕЛЬНЫЙ DOM-стаб
// (Proxy, неизвестный метод — no-op; дубль конвенции
// dungeon-info-window/city-interact) + canvas с getContext('2d') →
// 2d no-op-прокси + lenient getBoundingClientRect {left:0, top:0}
// (→ 1:1-фолбэк measureBacking/computeBacking, 000151) +
// window.addEventListener no-op (keydown не нужен) + storage-стаб.
// Сцена (паттерн scene84 combat-ui.test.js): G.createCharacter() +
// G.combatUI.startCombat({hero, mobs:['wolf'], mobLevel:1, seed:42});
// оверлей — под document.body песочницы (findByClass).
//
// КРАСНЫЕ (2 — падают на master: порядок детей .combat-side в
// существующем build() — actions 5-й из 7, log ПОСЛЕ кнопок; осмысленно,
// не синтаксис/окружение):
//   000246-ACT-LAST  .combat-actions — ПОСЛЕНЕДНИЙ ребёнок .combat-side
//                    (кнопки — в самый низ правой панели);
//                    сейчас lastChild = .combat-log (build() L521/L542).
//   000246-LOG-FLEX  DOM: idx(.combat-log) < idx(.combat-actions)
//                    (лог НАД кнопками — между маной и кнопками;
//                    сейчас ложь: log 6-й, actions 4-й) + CSS-гард:
//                    правило .combat-overlay--combat .combat-log
//                    декларирует рост (flex-шорткат начинается с 1
//                    ИЛИ явный flex-grow ≥ 1 — зелёный с master,
//                    страхует рост при будущих правках; пин
//                    combat-layout.test.js L81–85 читает decls['flex']
//                    — шорткат ОБЯЗАТЕЛЕН).
// ЗЕЛЁНЫЕ с начала (гарды; в red-счёт НЕ входят):
//   000246-TOP-4     первые 4 элемента .combat-side =
//                    [turnorder, hpbar, mpbar, state] (мана — 3-я —
//                    инвариант ТЗ п.2: позиция линейки маны не
//                    меняется).
// Полный порядок всех 7 детей пинят ре-пинами deepEqual (зелёная
// стадия: CU199-MPBAR-1/CU196-POS + 194-QUI-BUILD/FINISH) — здесь не
// дублируется (один факт — один пин).
// =====================================================================

// --- ДИНАМИЧЕСКИЙ CHAIN: ВСЕ <script src> index.html ДО combat-ui.js
// включительно (паттерн dungeon-info-window.test.js: полный префикс) ---

const CHAIN_000246 = (() => {
  const all = Array.from(
    page().matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
    .map((p) => p.replace(/^src\//, ''));
  const i = all.indexOf('combat-ui.js');
  assert.ok(i >= 0, 'combat-ui.js подключён в index.html');
  return all.slice(0, i + 1);
})();

// --- Снисходительный DOM-стаб (дубль конвенции
// tests/dungeon-info-window.test.js / tests/city-interact.test.js:
// дерево + dataset + querySelector(All) + closest; неизвестный метод —
// no-op-функция через Proxy) ---

function matchesSimple000246(el, sel) {
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

// Составной селектор ('.combat-actions button' — render() combat-ui.js
// L1985): последний фрагмент — элемент, остальные — по предкам.
function matchesSel000246(el, sel) {
  const parts = String(sel).trim().split(/\s+/);
  if (parts.length === 1) return matchesSimple000246(el, parts[0]);
  if (!matchesSimple000246(el, parts[parts.length - 1])) return false;
  let n = el.parent;
  for (let i = parts.length - 2; i >= 0; i--) {
    if (!n || !matchesSimple000246(n, parts[i])) return false;
    n = n.parent;
  }
  return true;
}

function findAll000246(root, sel) {
  const out = [];
  const walk = (n) => {
    for (const ch of n.children || []) {
      if (matchesSel000246(ch, sel)) out.push(ch);
      walk(ch);
    }
  };
  walk(root);
  return out;
}

function makeContext2d000246(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

function makeEl000246(tag) {
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
    // children хранят СУРЫЕ target (а не прокси): remove() ищет по
    // identity (дубль tests/city-interact.test.js).
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
      return kind === '2d' ? makeContext2d000246(target) : null;
    },
    // lenient rect (без width/height): 1:1-фолбэк measureBacking/
    // computeBacking (000151) — «кнопки внизу на всех размерах» даёт
    // CSS-колонка, не стаб.
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    get lastChild() {
      return target.children[target.children.length - 1] || null;
    },
    closest(sel) {
      let n = target;
      while (n) {
        if (matchesSel000246(n, sel)) return n;
        n = n.parent;
      }
      return null;
    },
    querySelector(sel) { return findAll000246(target, sel)[0] || null; },
    querySelectorAll(sel) { return findAll000246(target, sel); },
  };
  if (tag === 'canvas') {
    target.width = 0;
    target.height = 0;
  }
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

function makeStorage000246() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// --- Песочница: ДИНАМИЧЕСКИЙ CHAIN до combat-ui.js включительно ---

function bootCombat000246() {
  const errors = [];
  const document = {
    createElement: (tag) => makeEl000246(tag),
    body: makeEl000246('body'),
    getElementById: () => null,
    querySelector: () => null,
    hidden: false,
    addEventListener() {},
    removeEventListener() {},
  };
  const window = {
    // keydown/resize не нужны пирам: no-op (typeof-гарды combat-ui.js
    // L154–159/L263–265 закрывают performance/rAF/devicePixelRatio).
    addEventListener() {},
    removeEventListener() {},
    localStorage: makeStorage000246(),
  };
  const sandbox = {
    console: {
      log: () => {}, info: () => {}, warn: () => {}, debug: () => {},
      trace: () => {},
      error: (m) => errors.push(String(m)),
    },
    document, window, setTimeout, clearTimeout,
  };
  vm.createContext(sandbox);
  for (const f of CHAIN_000246) {
    vm.runInContext(src(f), sandbox, { filename: f });
  }
  return { G: sandbox.Game, body: document.body, errors, sandbox };
}

// Элемент оверлея по className (multi-class — дубль
// combat-inventory-panel.test.js; оверлей подвешен к body песочницы).
function findByClass000246(el, cls) {
  if (String(el.className).split(/\s+/).includes(cls)) return el;
  for (const ch of el.children || []) {
    const found = findByClass000246(ch, cls);
    if (found) return found;
  }
  return null;
}

// ПРАВАЯ панель боя (.combat-side) собранного оверлея.
function sideOf000246(env) {
  const overlay = findByClass000246(env.body, 'combat-overlay--combat');
  assert.ok(overlay, 'боевой оверлей подвешен к body песочницы');
  const side = findByClass000246(overlay, 'combat-side');
  assert.ok(side, '.combat-side есть в боевом оверлее');
  return side;
}

// Сцена: дефолтный герой + волк (паттерн scene84, combat-ui.test.js
// L333) — панель: 7 табличных кнопок + lastSpell (000227) = 8.
function sceneCombat000246() {
  const env = bootCombat000246();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  assert.ok(env.G.combatUI,
    'Game.combatUI создан (combat-ui.js в CHAIN)');
  const hero = env.G.createCharacter();
  const c = env.G.combatUI.startCombat({
    hero, mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  assert.ok(c,
    'бой начался (build()/render() без исключений)');
  assert.equal(env.errors.length, 0,
    'ошибок после startCombat нет: ' + env.errors.join('; '));
  return env;
}

// CSS index.html: декларация скоуп-правила «.a .b { … }» (дубль
// cssRule combat-layout.test.js: точки экранируются, части — через
// \s+; имена селекторов скоупа уникальны — ложных срабатываний нет).
function cssDecl000246(html, sel) {
  const selRe = sel.split(/\s+/)
    .map((p) => p.replace(/\./g, '\\.')).join('\\s+');
  const m = html.match(new RegExp(selRe + '\\s*{([^}]*)}'));
  assert.ok(m, 'CSS-правило ' + sel + ' найдено в index.html');
  const decls = {};
  for (const part of m[1].split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const prop = part.slice(0, i).trim().toLowerCase();
    if (prop) decls[prop] = part.slice(i + 1).trim();
  }
  return decls;
}

// --- 000246-ACT-LAST (КРАСНЫЙ) ---

test('000246-ACT-LAST: .combat-actions — ПОСЛЕНЕДНИЙ дочерний элемент .combat-side (кнопки — в самый низ правой панели); фикстура: панель цела (7 детей, 8 кнопок)', () => {
  const env = sceneCombat000246();
  const side = sideOf000246(env);
  assert.equal(side.children.length, 7,
    'фикстура: .combat-side цела — 7 детей; факт: '
    + side.children.map((ch) => ch.className).join(','));
  const actions = side.children.find(
    (ch) => String(ch.className).split(/\s+/).includes('combat-actions'));
  assert.ok(actions, 'фикстура: .combat-actions есть в панели');
  const btns = findAll000246(actions, 'button');
  assert.equal(btns.length, 8,
    'фикстура: 8 кнопок в .combat-actions (7 табличных + lastSpell, '
    + '000227); факт: ' + btns.length);
  assert.equal(side.lastChild, actions,
    'последний ребёнок .combat-side — .combat-actions (краснота: '
    + 'build() appendChild-ит actions ПЯТЫМ из 7, до quicklist и log — '
    + 'lastChild сейчас .combat-log); факт: '
    + String(side.lastChild && side.lastChild.className));
});

// --- 000246-LOG-FLEX (КРАСНЫЙ по DOM-части + CSS-гард) ---

test('000246-LOG-FLEX: .combat-log ВЫШЕ .combat-actions (всё оставшееся пространство — между линейкой маны и кнопками; при скоуп-колонке flex-лог растягивается на остаток) + CSS: скоуп-правило .combat-overlay--combat .combat-log декларирует рост (flex-шорткат начинается с 1 ИЛИ явный flex-grow ≥ 1)', () => {
  const env = sceneCombat000246();
  const side = sideOf000246(env);
  const idx = (cls) => side.children.findIndex(
    (ch) => String(ch.className).split(/\s+/).includes(cls));
  const iLog = idx('combat-log');
  const iAct = idx('combat-actions');
  assert.ok(iLog >= 0 && iAct >= 0,
    'фикстура: лог и кнопки в панели; факт: '
    + side.children.map((ch) => ch.className).join(','));
  assert.ok(iLog < iAct,
    '.combat-log ВЫШЕ .combat-actions (краснота: на master log 6-й, '
    + 'actions 4-й — лог ПОД кнопками); факт: idx(log)=' + iLog
    + ', idx(actions)=' + iAct);
  const d = cssDecl000246(page(), '.combat-overlay--combat .combat-log');
  const byShortcut = /^1/.test(String(d['flex'] || ''));
  const fg = d['flex-grow'];
  const byLonghand = fg !== undefined && Number.parseFloat(fg) >= 1;
  assert.ok(byShortcut || byLonghand,
    'CSS-правило .combat-overlay--combat .combat-log декларирует рост '
    + '(гард: рост не потеряется при будущих правках; пин '
    + 'combat-layout.test.js читает decls[flex] — шорткат «1…» '
    + 'обязателен); факт: ' + JSON.stringify(d));
});

// --- 000246-TOP-4 (гард, зелёный с master) ---

test('000246-TOP-4 (гард): первые 4 элемента .combat-side — [combat-turnorder, combat-hpbar, combat-mpbar, combat-state] (мана — 3-я — инвариант ТЗ п.2: позиция линейки маны не меняется)', () => {
  const env = sceneCombat000246();
  const side = sideOf000246(env);
  assert.deepEqual(
    side.children.slice(0, 4).map((ch) => String(ch.className).trim()),
    ['combat-turnorder', 'combat-hpbar', 'combat-mpbar', 'combat-state'],
    'первые 4 элемента .combat-side (верхняя зона — инвариант; '
    + 'краснота была бы только при смене порядка в build()); факт: '
    + JSON.stringify(side.children.map((ch) => ch.className)));
});

// Задача 000230.11 — T8 (e2e, H8/EN8-паттерн: vm-песочница, цепочка
// как у T9-000230.10 — ITEMS_CHAIN минус items.js, затем items.js —
// live-каталог; НЕ фикстуры). Контракт — memory/000230.11-forearms-
// palms-items-wave.md §2/§3: 6 skills группы рук/точности S=10;
// база swordHitBonus/archerHitBonus/heavyDamageBonus/fistDamageBonus/
// thiefBonus 0.5 (= 0.05·10·1.0), moveSpeedMult 1.5, armor 0;
// affix-проверки по слотам forearms/palms; KROSS-SLOT sum armor;
// free_cast (2 epic); 2 АКТИВНЫХ кросс-слотовых набора (порог 2
// достижим: forearms+palms надеваются одновременно) + дормантность.
// RED (TDD): forearms/palms-предметов в live-каталоге нет — addItem
// падает по ОСМЫСЛЕННОЙ причине «неизвестный предмет: волна не
// добавлена» (не синтаксис/окружение).
// =====================================================================
const VM_HANDS_CHAIN_00023011 = ['global-settings.js', 'perlin.js',
  'map.js', 'skills-data.js', 'items-data.js', 'sheet.js', 'player.js'];
function makeVmSandboxWithConsole00023011() {
  const errors = [];
  const sandbox = {
    console: { log() {}, warn() {}, error: (m) => errors.push(String(m)) },
  };
  return { sandbox, errors };
}
function loadHandsVmChain00023011(sandbox) {
  for (const f of VM_HANDS_CHAIN_00023011) {
    vm.runInNewContext(src(f), sandbox, { filename: f });
  }
}
// Меж-реальм: значения из vm-песочницы — чужие прототипы;
// deepStrictEqual их отвергает — нормализуем через JSON.
const fromVm00023011 = (v) => JSON.parse(JSON.stringify(v));

test('000230.11 T8 (vm, e2e): РЕАЛЬНЫЕ forearms/palms-предметы из live-каталога (не фикстуры) — equip в слоты forearms/palms (M2-паттерн); при S=10 по ВСЕМ 6 skills группы рук (swordsman/archer/heavy/fists/step/thief): база swordHitBonus/archerHitBonus/heavyDamageBonus/fistDamageBonus/thiefBonus 0.5 (= 0.05·10) / moveSpeedMult 1.5 / equipmentStats.armor 0; leather_cuff → swordHitBonus 0.52 (0.04) + armor 1; archer_gloves → archerHitBonus 0.525 (0.05) + armor 1; iron_gauntlets → heavyDamageBonus 0.525 + armor 2; rough_gauntlets → fistDamageBonus 0.52; linen_wraps → moveSpeedMult 1.52; cloth_wrap → thiefBonus 0.525; KROSS-SLOT: copper_brace (armor 2) + quiver_gloves (armor 1) → armor 3 (M6); titan_brace → armor 4 + heavyDamageBonus 0.70 (0.40) + moveSpeedMult 1.675 (0.35); freeCast(steel_bracers) ⊇ blazing_speed; freeCast(steel_gauntlets) ⊇ invisibility; nimble АКТИВЕН (leather_cuff+leather_gloves): counts {nimble:2}, set-armor 1, equipmentStats.armor 3; blade_guard АКТИВЕН (steel_bracers+steel_gauntlets): counts {blade_guard:2}, swordHitBonus 0.675 (Σ 0.35), armor 6; DORMANT: leather_cuff одна → {nimble:1}, armor 1; steel_bracers один → {blade_guard:1}, swordHitBonus 0.575, armor 3 (краснота: неизвестный предмет — волна не добавлена)', () => {
  const { sandbox } = makeVmSandboxWithConsole00023011();
  loadHandsVmChain00023011(sandbox);
  vm.runInNewContext(src('items.js'), sandbox, { filename: 'items.js' });
  const G = sandbox.Game;
  const near = (a, b, msg) => assert.ok(
    Math.abs(a - b) < 1e-9, msg + ' (факт: ' + a + ')');
  const makeHero = () => {
    const c = G.createCharacter();
    c.secondary.swordsman = 10;
    c.secondary.archer = 10;
    c.secondary.heavy = 10;
    c.secondary.fists = 10;
    c.secondary.step = 10;
    c.secondary.thief = 10;
    return c;
  };
  const equipItem = (c, id, slot) => {
    const ra = G.addItem(c, id);
    assert.equal(ra.ok, true, id + ': выдача (' + (ra.reason || '')
      + ') — предмет есть в live-каталоге (краснота: неизвестный '
      + 'предмет — волна не добавлена)');
    const r = G.equip(c, id);
    assert.equal(r.ok, true, id + ': equip (' + (r.reason || '') + ')');
    assert.equal(r.slot, slot, id + ': equip-слот ' + slot);
    assert.equal(c.equipment[slot], id,
      id + ': предмет в слоте ' + slot);
  };
  {
    const c = makeHero();
    const d = G.derived(c);
    near(d.swordHitBonus, 0.5,
      'база swordHitBonus = 0.05·10·1.0 (swordsman S=10)');
    near(d.archerHitBonus, 0.5, 'база archerHitBonus');
    near(d.heavyDamageBonus, 0.5, 'база heavyDamageBonus');
    near(d.fistDamageBonus, 0.5, 'база fistDamageBonus');
    near(d.moveSpeedMult, 1.5, 'база moveSpeedMult = 1 + 0.05·10');
    near(d.thiefBonus, 0.5, 'база thiefBonus');
    assert.equal(G.equipmentStats(c).armor, 0,
      'база equipmentStats.armor (снаряжения нет)');
  }
  {
    const c = makeHero();
    equipItem(c, 'leather_cuff', 'forearms');
    near(G.derived(c).swordHitBonus, 0.52,
      'leather_cuff: swordHitBonus = 0.05·10·1.04 (swordsman 0.04)');
    assert.equal(G.equipmentStats(c).armor, 1,
      'leather_cuff: equipmentStats.armor 1 (stats.armor 1)');
  }
  {
    const c = makeHero();
    equipItem(c, 'archer_gloves', 'palms');
    near(G.derived(c).archerHitBonus, 0.525,
      'archer_gloves: archerHitBonus = 0.05·10·1.05 (archer 0.05)');
    assert.equal(G.equipmentStats(c).armor, 1,
      'archer_gloves: equipmentStats.armor 1');
  }
  {
    const c = makeHero();
    equipItem(c, 'iron_gauntlets', 'palms');
    near(G.derived(c).heavyDamageBonus, 0.525,
      'iron_gauntlets: heavyDamageBonus = 0.05·10·1.05 (heavy 0.05)');
    assert.equal(G.equipmentStats(c).armor, 2,
      'iron_gauntlets: equipmentStats.armor 2 (stats.armor 2 — '
      + 'единственный common с armor 2 в palms-блоке)');
  }
  {
    const c = makeHero();
    equipItem(c, 'rough_gauntlets', 'palms');
    near(G.derived(c).fistDamageBonus, 0.52,
      'rough_gauntlets: fistDamageBonus = 0.05·10·1.04 (fists 0.04)');
  }
  {
    const c = makeHero();
    equipItem(c, 'linen_wraps', 'palms');
    near(G.derived(c).moveSpeedMult, 1.52,
      'linen_wraps: moveSpeedMult = 1 + 0.05·10·1.04 (step 0.04)');
  }
  {
    const c = makeHero();
    equipItem(c, 'cloth_wrap', 'forearms');
    near(G.derived(c).thiefBonus, 0.525,
      'cloth_wrap: thiefBonus = 0.05·10·1.05 (thief 0.05)');
  }
  {
    const c = makeHero();
    equipItem(c, 'copper_brace', 'forearms');
    equipItem(c, 'quiver_gloves', 'palms');
    assert.equal(G.equipmentStats(c).armor, 3,
      'KROSS-SLOT (M6): armor = copper_brace 2 + quiver_gloves 1 '
      + '= 3 (forearms + palms суммируются)');
  }
  {
    const c = makeHero();
    equipItem(c, 'titan_brace', 'forearms');
    assert.equal(G.equipmentStats(c).armor, 4,
      'titan_brace: equipmentStats.armor 4 (impossible, максимум)');
    near(G.derived(c).heavyDamageBonus, 0.7,
      'titan_brace: heavyDamageBonus = 0.05·10·1.40 (heavy 0.40)');
    near(G.derived(c).moveSpeedMult, 1.675,
      'titan_brace: moveSpeedMult = 1 + 0.05·10·1.35 (step 0.35, '
      + 'двойной affix)');
  }
  {
    const c = makeHero();
    equipItem(c, 'steel_bracers', 'forearms');
    const a = G.equipmentAffixes(c);
    assert.ok(a.freeCast.has('blazing_speed'),
      'steel_bracers: free_cast blazing_speed в '
      + 'equipmentAffixes.freeCast');
  }
  {
    const c = makeHero();
    equipItem(c, 'steel_gauntlets', 'palms');
    const a = G.equipmentAffixes(c);
    assert.ok(a.freeCast.has('invisibility'),
      'steel_gauntlets: free_cast invisibility в '
      + 'equipmentAffixes.freeCast');
  }
  {
    const c = makeHero();
    equipItem(c, 'leather_cuff', 'forearms');
    equipItem(c, 'leather_gloves', 'palms');
    const st = G.activeSets(c);
    assert.deepEqual(fromVm00023011(st.counts), { nimble: 2 },
      'nimble — 2 надетых предмета (forearms + palms)');
    assert.equal(st.armor, 1,
      'nimble: set-бонус {2: {armor: 1}} АКТИВЕН (порог 2)');
    assert.equal(G.equipmentStats(c).armor, 3,
      'nimble: equipmentStats.armor = 1 + 1 + 1 (set) = 3');
  }
  {
    const c = makeHero();
    equipItem(c, 'steel_bracers', 'forearms');
    equipItem(c, 'steel_gauntlets', 'palms');
    const st = G.activeSets(c);
    assert.deepEqual(fromVm00023011(st.counts), { blade_guard: 2 },
      'blade_guard — 2 надетых предмета (forearms + palms)');
    assert.equal(st.armor, 0,
      'blade_guard: set-бонус — только skill, без armor');
    near(G.derived(c).swordHitBonus, 0.675,
      'blade_guard: swordHitBonus = 0.05·10·1.35 (0.15 + 0.15 + '
      + '0.05 set-skill swordsman)');
    assert.equal(G.equipmentStats(c).armor, 6,
      'blade_guard: equipmentStats.armor = 3 + 3 = 6');
  }
  {
    const c = makeHero();
    equipItem(c, 'leather_cuff', 'forearms');
    const st = G.activeSets(c);
    assert.deepEqual(fromVm00023011(st.counts), { nimble: 1 },
      'nimble — 1 надетый предмет');
    assert.equal(st.armor, 0, 'set-бонус НЕ активен (порог 2 > 1)');
    assert.equal(G.equipmentStats(c).armor, 1,
      'leather_cuff одна: equipmentStats.armor = 1 — только '
      + 'собственный armor; set-бонус nimble (+1) НЕ применён '
      + '(дормантность)');
  }
  {
    const c = makeHero();
    equipItem(c, 'steel_bracers', 'forearms');
    const st = G.activeSets(c);
    assert.deepEqual(fromVm00023011(st.counts), { blade_guard: 1 },
      'blade_guard — 1 надетый предмет');
    near(G.derived(c).swordHitBonus, 0.575,
      'steel_bracers один: swordHitBonus = 0.05·10·1.15 (swordsman '
      + '0.15); set-skill +0.05 НЕ применён (дормантность)');
    assert.equal(G.equipmentStats(c).armor, 3,
      'steel_bracers один: equipmentStats.armor = 3 — только '
      + 'собственный armor');
  }
});
// =====================================================================
// Задача 000248 — КРАСНЫЕ ТЕСТЫ (TDD): Бой — анимация СТРЕЛЬБЫ ИЗ
// ЛУКА (стрела стрелок→цель) и УДАРА ОРУЖИЕМ БЛИЖНЕГО БОЯ
// (выпадение к цели) для героев/союзников и мобов.
//
// ТЗ — tasks/pending/000248.md; контракт —
// memory/000248-combat-attack-fx.md (D1–D12): транзиентный DOM-слой
// .combat-atk-layer (ленивый, ребёнок .combat-box, геометрия 1:1 с
// баннером), маркеры .combat-atk-lunge (melee) / .combat-atk-draw +
// .combat-atk-arrow (ranged) / .combat-atk-hit (цель); геометрия —
// проценты (D3); kind — bow по снаряжению героя / role у союзников и
// мобов (D4); цель — victim||intended (D6); источники — runAction
// (герой + новая ветка союзника) + read-only c._unitFx мобов (D7);
// ATTACK_FX_MS = 600 (D8); снятие — по render-tick, без setTimeout
// (D9); кастом-свойства --fx-* — bracket-присвоение (D11);
// @keyframes — ПЕРВЫЕ в проекте (D12).
//
// Механика: ДУБЛЬ песочницы 000246 (CHAIN_000246/makeEl000246/
// makeStorage000246/findAll000246/findByClass000246/cssDecl000246 —
// переиспользуются БЕЗ ПРАВОК) + МУТАБЕЛЬНОЕ ВРЕМЯ:
// performance.now = () => T (T0 = 1000, setT) — песочница 000246
// performance не имеет (nowMs упал бы в реальный Date.now — пин
// истечения FX был бы невоспроизводим). Действия — публичный
// G.combatUI.handleCode (keydown в песочнице не перехватывается —
// window.addEventListener no-op); ре-рендер — consumed-действие
// (движение в стену: «стена» — reason, consumed → render()).
//
// КРАСНЫЕ (8 — падают на master осмысленно: нет элемента/класса/
// keyframe/поля c._attackFx; цепочка грузится чисто, ошибки = 0,
// фикстуры зелёные):
//   000248-LNG  melee-удар героя: слой + .combat-atk-lunge на клетке
//               героя (% клетки), стрелы НЕТ, c._attackFx.kind =
//               'melee', from = 'player';
//   000248-HIT  .combat-atk-hit на клетке цели;
//   000248-ARW  лук: .combat-atk-draw + .combat-atk-arrow,
//               .combat-atk-lunge НЕТ (отличие от melee),
//               .combat-atk-hit на цели; --fx-x0/y0 = центр стрелка,
//               --fx-x1/y1 = центр цели (%); промах (rng 0.99) —
//               стрела ЕСТЬ, hit НЕТ (D6);
//   000248-END  маркеры есть при T0, после setT(T0+601) + ре-рендер —
//               НЕТ (слой удалён — добор по until, D9/D10);
//               steady-state (бой без атаки) — слоя нет;
//   000248-MOB  Space (фаза мобов синхронна): .combat-atk-lunge на
//               тайле волка + .combat-atk-hit на тайле игрока
//               (общий силуэт — у мобов нет оружия; триггер —
//               эвристика 000062 hurt && inStance, read-only);
//   000248-MOBR (фикс ревью 2026-10-23): ranged-моб (имп, d 2..4) —
//               стрела + hit в 300-мс окне моба: --fx-arrow-dur
//               300ms, hit 100+200 (геройский 400/380+220 обрезался);
//   000248-ALLY  Касание духа Эфира (KeyJ на ходу Эфира): lunge на
//               тайле союзника + hit на тайле волка, kind 'melee'
//               (role 'support', D4), c._fx НЕ 'attack' (P11/R15);
//   000248-CSS  index.html: правило .combat-atk-layer (position
//               absolute, pointer-events none, width/height = формулы
//               .combat-banner), 4 @keyframes combat-atk-*, 4 правила
//               маркеров с animation; NEW-only — базовые правила
//               intact;
//   000248-SC   %-пины геометрии: style.left/top/width/height маркеров
//               — строки с %; lunge --fx-lx/--fx-ly = 0.5 клетки в
//               направлении цели (% собственного размера); стрела
//               --fx-* = центры в % слоя; тождество формул слоя и
//               баннера ВКЛЮЧАЯ portrait-override (контракт
//               масштабирования с полем — ТЗ п.3).
//
// ГАРД (зелёный с master; в red-счёт НЕ входит):
//   000248-DET  детерминизм: один сценарий (KeyJ + Space, сид 42) в
//               ДВУХ песочницах → deepEqual [c.log, c.player.hp,
//               HP юнитов, c.result] — анимация не влияет на
//               ход/урон, НОЛЬ новых бросков c._rng (ТЗ «Детерминизм»).
// =====================================================================

// --- Песочница: дубль bootCombat000246 + мутабельное время T ---

function bootCombat000248() {
  const errors = [];
  let T = 1000;
  const document = {
    createElement: (tag) => makeEl000246(tag),
    body: makeEl000246('body'),
    getElementById: () => null,
    querySelector: () => null,
    hidden: false,
    addEventListener() {},
    removeEventListener() {},
  };
  const window = {
    addEventListener() {},
    removeEventListener() {},
    localStorage: makeStorage000246(),
  };
  const sandbox = {
    console: {
      log: () => {}, info: () => {}, warn: () => {}, debug: () => {},
      trace: () => {},
      error: (m) => errors.push(String(m)),
    },
    document, window, setTimeout, clearTimeout,
    performance: { now: () => T },
  };
  vm.createContext(sandbox);
  for (const f of CHAIN_000246) {
    vm.runInContext(src(f), sandbox, { filename: f });
  }
  return {
    G: sandbox.Game, body: document.body, errors, sandbox,
    T0: 1000, setT: (v) => { T = v; }, getT: () => T,
  };
}

function overlayOf000248(env) {
  const overlay = findByClass000246(env.body, 'combat-overlay--combat');
  assert.ok(overlay, 'боевой оверлей подвешен к body песочницы');
  return overlay;
}

function atkEls000248(env, cls) {
  return findAll000246(overlayOf000248(env), '.' + cls);
}

function atkLayer000248(env) {
  return findByClass000246(overlayOf000248(env), 'combat-atk-layer');
}

// Геометрия-пин: style[prop] — строка, значение ≈ expected (±0.01);
// %-суффикс обязателен, кроме нуля (формат нуля реализации не пинует).
function pinPct000248(el, prop, expected, label) {
  const raw = el.style[prop];
  assert.equal(typeof raw, 'string',
    label + ' style[' + prop + '] — строка; факт: ' + String(raw));
  if (expected !== 0) {
    assert.ok(/%$/.test(raw),
      label + ' style[' + prop + '] — %-строка (масштабно-инвариантно, '
      + 'D3); факт: ' + raw);
  }
  assert.ok(Math.abs(Number.parseFloat(raw) - expected) < 0.01,
    label + ' style[' + prop + '] ≈ ' + expected + '%; факт: ' + raw);
}

// Сцена: дефолтный герой + волк (seed 42). melee — волк в упор
// (d=1), bow — на d=3 (даль лука 4); bow — G.addItem + G.equip ДО
// startCombat (паттерн combat.test.js «лук: атака в даль»);
// c._rng = 0.0 — все попадания; цель выбрана. ally — Эфир
// (G.efir.createEfir(), opts.efir): активен с начала боя (инициатива
// Эфира 4 > волка 3 > героя 2), волк d≤1 от Эфира, НЕ d≤1 от игрока.
function sceneAttack000248(opts) {
  const env = bootCombat000248();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  const hero = env.G.createCharacter();
  if (opts.bow) {
    env.G.addItem(hero, 'hunting_bow');
    env.G.equip(hero, 'hunting_bow');
    assert.equal(hero.equipment.weapon, 'hunting_bow',
      'фикстура: лук экипирован до боя');
  }
  const c = env.G.combatUI.startCombat({
    hero, mobs: ['wolf'], mobLevel: 1, seed: 42,
    efir: opts.ally ? env.G.efir.createEfir() : undefined,
  });
  assert.ok(c, 'бой начался (build()/render() без исключений)');
  assert.equal(env.errors.length, 0,
    'ошибок после startCombat нет: ' + env.errors.join('; '));
  const m0 = c.units.find((u) => u.side === 'mob');
  assert.ok(m0 && m0.alive && !m0.fled, 'фикстура: живой волк');
  m0.x = c.px;
  m0.y = c.py - (opts.bow ? 3 : 1);
  if (opts.ally) {
    assert.equal(env.G.activeUnitId(c), 'efir',
      'фикстура: активен Эфир с начала боя (инициатива Эфира 4 > '
      + 'волка 3 > героя 2, seed 42); факт: '
      + String(env.G.activeUnitId(c)));
    const efir = c.units.find((u) => u.side === 'ally');
    assert.ok(efir, 'фикстура: Эфир в c.units');
    m0.x = efir.x - 1;
    m0.y = efir.y;
    const dEfir = Math.abs(m0.x - efir.x) + Math.abs(m0.y - efir.y);
    const dPlayer = Math.abs(m0.x - c.px) + Math.abs(m0.y - c.py);
    assert.ok(dEfir <= 1 && dPlayer > 1,
      'фикстура: волк d≤1 от Эфира и НЕ d≤1 от игрока; факт: dEfir='
      + dEfir + ', dPlayer=' + dPlayer);
  }
  c._rng = () => 0.0;
  c.selectTarget(m0.id);
  assert.equal(c.targetId, m0.id, 'фикстура: волк выбран целью');
  return { env, c, hero, m0 };
}

// --- 000248-LNG (КРАСНЫЙ) ---

test('000248-LNG: melee-удар героя — анимация атакующего: слой .combat-atk-layer + .combat-atk-lunge на клетке героя (% клетки), .combat-atk-arrow НЕТ (отличие от ranged), c._attackFx {kind: melee, from: player}', () => {
  const { env, c } = sceneAttack000248({});
  assert.equal(env.G.activeUnitId(c), 'player', 'фикстура: ход игрока');
  assert.equal(env.G.combatUI.handleCode('KeyJ'), true,
    'фикстура: «Удар» consumed (r.ok → render)');
  assert.ok(c._attackFx,
    'c._attackFx — запись UI-FX атаки (отдельное поле; c._fx не '
    + 'расширяется — контракт D-раздел); краснота: на master поля нет');
  assert.equal(c._attackFx.kind, 'melee',
    'без оружия (кулаки) — melee-силуэт (D4/D5); факт: '
    + String(c._attackFx.kind));
  assert.equal(c._attackFx.from, 'player',
    'источник — герой; факт: ' + String(c._attackFx.from));
  assert.ok(atkLayer000248(env),
    'слой .combat-atk-layer в оверлее (ребёнок .combat-box, D10); '
    + 'краснота: на master слой не создаётся');
  const lungs = atkEls000248(env, 'combat-atk-lunge');
  assert.equal(lungs.length, 1,
    'ровно ОДИН .combat-atk-lunge на атакующем; краснота: на master '
    + 'маркеров нет; факт: ' + lungs.length);
  pinPct000248(lungs[0], 'left', c.px / c.width * 100, 'lunge.left');
  pinPct000248(lungs[0], 'top', c.py / c.height * 100, 'lunge.top');
  pinPct000248(lungs[0], 'width', 1 / c.width * 100, 'lunge.width');
  pinPct000248(lungs[0], 'height', 1 / c.height * 100, 'lunge.height');
  assert.equal(atkEls000248(env, 'combat-atk-arrow').length, 0,
    'melee — снаряда НЕТ (различение атак, ТЗ п.1)');
});

// --- 000248-HIT (КРАСНЫЙ) ---

test('000248-HIT: цель удара — .combat-atk-hit на клетке цели (% клетки)', () => {
  const { env, c, m0 } = sceneAttack000248({});
  assert.equal(env.G.combatUI.handleCode('KeyJ'), true,
    'фикстура: «Удар» consumed (render)');
  const hits = atkEls000248(env, 'combat-atk-hit');
  assert.equal(hits.length, 1,
    'ровно ОДИН .combat-atk-hit на цели; краснота: на master маркера '
    + 'нет; факт: ' + hits.length);
  pinPct000248(hits[0], 'left', m0.x / c.width * 100, 'hit.left');
  pinPct000248(hits[0], 'top', m0.y / c.height * 100, 'hit.top');
  pinPct000248(hits[0], 'width', 1 / c.width * 100, 'hit.width');
  pinPct000248(hits[0], 'height', 1 / c.height * 100, 'hit.height');
});

// --- 000248-ARW (КРАСНЫЙ) ---

test('000248-ARW: стрелок (bow) — .combat-atk-draw + .combat-atk-arrow, .combat-atk-lunge НЕТ (отличие от melee), .combat-atk-hit на цели; стрела: --fx-x0/y0 = центр стрелка, --fx-x1/y1 = центр цели (%); промах (rng 0.99) — стрела ЕСТЬ, hit НЕТ', () => {
  const { env, c, m0 } = sceneAttack000248({ bow: true });
  assert.equal(env.G.combatUI.handleCode('KeyJ'), true,
    'фикстура: выстрел consumed (r.ok → render)');
  assert.equal(atkEls000248(env, 'combat-atk-draw').length, 1,
    'ровно ОДИН .combat-atk-draw у стрелка; краснота: на master '
    + 'ranged-маркеров нет; факт: '
    + atkEls000248(env, 'combat-atk-draw').length);
  const arrows = atkEls000248(env, 'combat-atk-arrow');
  assert.equal(arrows.length, 1,
    'ровно ОДНА .combat-atk-arrow (снаряд стрелок→цель); краснота: '
    + 'на master снаряда нет; факт: ' + arrows.length);
  assert.equal(atkEls000248(env, 'combat-atk-lunge').length, 0,
    'лук — выпадения НЕТ (отличие от melee, ТЗ п.1)');
  assert.equal(atkEls000248(env, 'combat-atk-hit').length, 1,
    '.combat-atk-hit на цели (попадание, rng 0.0)');
  pinPct000248(arrows[0], '--fx-x0', (c.px + 0.5) / c.width * 100,
    'arrow --fx-x0 (центр стрелка)');
  pinPct000248(arrows[0], '--fx-y0', (c.py + 0.5) / c.height * 100,
    'arrow --fx-y0 (центр стрелка)');
  pinPct000248(arrows[0], '--fx-x1', (m0.x + 0.5) / c.width * 100,
    'arrow --fx-x1 (центр цели)');
  pinPct000248(arrows[0], '--fx-y1', (m0.y + 0.5) / c.height * 100,
    'arrow --fx-y1 (центр цели)');
  const s2 = sceneAttack000248({ bow: true });
  s2.c._rng = () => 0.99;
  assert.equal(s2.env.G.combatUI.handleCode('KeyJ'), true,
    'фикстура: промах consumed (ok, hit:false → render)');
  assert.equal(atkEls000248(s2.env, 'combat-atk-arrow').length, 1,
    'промах — стрела ЕСТЬ (действие потрачено, удар есть, D6)');
  assert.equal(atkEls000248(s2.env, 'combat-atk-hit').length, 0,
    'промах — .combat-atk-hit на цели НЕТ (цель не задета, D6)');
});

// --- 000248-END (КРАСНЫЙ) ---

test('000248-END: анимация завершается — маркеры сняты, слой удалён: есть при T0, НЕТ после setT(T0+601) + ре-рендер; steady-state (бой без атаки) — слоя нет', () => {
  const { env } = sceneAttack000248({});
  assert.equal(env.G.combatUI.handleCode('KeyJ'), true,
    'фикстура: «Удар» consumed (render)');
  assert.equal(atkEls000248(env, 'combat-atk-lunge').length, 1,
    'фикстура: маркер есть при T0 (краснота: на master анимации нет)');
  env.setT(env.T0 + 601);
  assert.equal(env.G.combatUI.handleCode('KeyS'), true,
    'ре-рендер: шаг в стену consumed («стена» → render на tick)');
  assert.equal(atkEls000248(env, 'combat-atk-lunge').length, 0,
    'после T0+601 (> ATTACK_FX_MS = 600) lunge снят');
  assert.equal(atkEls000248(env, 'combat-atk-hit').length, 0,
    'после T0+601 hit снят (не остаётся на следующий кадр, ТЗ «Тесты»)');
  assert.equal(atkLayer000248(env), null,
    'слой удалён, когда все источники истекли (ленивый, D10)');
  const s2 = sceneAttack000248({});
  assert.equal(atkLayer000248(s2.env), null,
    'steady-state (бой без атаки) — слоя нет (ноль операций, D1)');
});

// --- 000248-MOB (КРАСНЫЙ) ---

test('000248-MOB: атака МОБА — тот же общий силуэт: .combat-atk-lunge на тайле волка + .combat-atk-hit на тайле игрока (триггер — эвристика 000062 hurt && inStance, read-only c._unitFx)', () => {
  const { env, c, m0 } = sceneAttack000248({});
  assert.equal(env.G.combatUI.handleCode('Space'), true,
    'фикстура: «Конец хода» consumed (фаза мобов синхронна → render)');
  assert.ok(m0.alive, 'фикстура: волк жив после фазы мобов');
  assert.ok(c.player.hp < env.G.derived(c.player).maxHP,
    'фикстура: игрок получил урон (hurt — условие эвристики 000062)');
  const lungs = atkEls000248(env, 'combat-atk-lunge');
  assert.equal(lungs.length, 1,
    'ровно ОДИН .combat-atk-lunge на тайле моба (общий силуэт — у '
    + 'мобов нет оружия, ТЗ п.1); краснота: на master mob-маркеров '
    + 'нет; факт: ' + lungs.length);
  pinPct000248(lungs[0], 'left', m0.x / c.width * 100, 'mob-lunge.left');
  pinPct000248(lungs[0], 'top', m0.y / c.height * 100, 'mob-lunge.top');
  const hits = atkEls000248(env, 'combat-atk-hit');
  assert.equal(hits.length, 1,
    'ровно ОДИН .combat-atk-hit на тайле игрока (моб уронил игрока); '
    + 'краснота: на master маркера нет; факт: ' + hits.length);
  pinPct000248(hits[0], 'left', c.px / c.width * 100, 'mob-hit.left');
  pinPct000248(hits[0], 'top', c.py / c.height * 100, 'mob-hit.top');
});

// --- 000248-MOBR (фикс ревью 2026-10-23) ---

test('000248-MOBR: ranged-моб (имп, d=3) — стрела и вспышка удара влезает в 300-мс окно моба: .combat-atk-draw + .combat-atk-arrow на тайле импа (--fx-arrow-dur 300ms, не 400 — полёт не обрезается на 75%), .combat-atk-hit на тайле игрока (--fx-hit-delay 100ms / --fx-hit-dur 200ms — конец ровно 300, не 380+220=600)', () => {
  const env = bootCombat000248();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  const hero = env.G.createCharacter();
  const c = env.G.combatUI.startCombat({
    hero, mobs: ['imp'], mobLevel: 1, seed: 42,
  });
  assert.ok(c, 'бой начался (build()/render() без исключений)');
  assert.equal(env.errors.length, 0,
    'ошибок после startCombat нет: ' + env.errors.join('; '));
  const imp = c.units.find((u) => u.side === 'mob');
  assert.ok(imp && imp.alive && !imp.fled, 'фикстура: имп жив');
  assert.equal(env.G.activeUnitId(c), 'player',
    'фикстура: ход игрока (pre-roll импа синхронен, 000167); '
    + 'факт: ' + String(env.G.activeUnitId(c)));
  imp.x = c.px;
  imp.y = c.py - 3;
  const d = Math.abs(imp.x - c.px) + Math.abs(imp.y - c.py);
  assert.ok(d >= 2 && d <= 4,
    'фикстура: имп в дальней полосе 2..4 (ударная позиция, '
    + 'эвристика 000062); факт: ' + d);
  c._rng = () => 0.0;
  assert.equal(env.G.combatUI.handleCode('Space'), true,
    'фикстура: «Конец хода» consumed (фаза мобов синхронна → render)');
  assert.ok(imp.alive && !imp.fled, 'фикстура: имп жив после фазы');
  assert.equal(imp.x, c.px, 'фикстура: имп не отступил (inStance)');
  assert.equal(imp.y, c.py - 3, 'фикстура: имп не отступил (inStance)');
  assert.ok(c.player.hp < env.G.derived(c.player).maxHP,
    'фикстура: игрок получил урон (hurt — условие эвристики 000062)');
  const draws = atkEls000248(env, 'combat-atk-draw');
  assert.equal(draws.length, 1,
    'ровно ОДИН .combat-atk-draw на тайле моба (ranged — не выпадение); '
    + 'факт: ' + draws.length);
  pinPct000248(draws[0], 'left', imp.x / c.width * 100,
    'mob-draw.left');
  pinPct000248(draws[0], 'top', imp.y / c.height * 100,
    'mob-draw.top');
  assert.equal(atkEls000248(env, 'combat-atk-lunge').length, 0,
    'ranged-моб — .combat-atk-lunge НЕТ (kind по role, D4)');
  const arrows = atkEls000248(env, 'combat-atk-arrow');
  assert.equal(arrows.length, 1,
    'ровно ОДНА .combat-atk-arrow (моб → игрок); факт: '
    + arrows.length);
  assert.equal(arrows[0].style['--fx-arrow-dur'], '300ms',
    'полёт стрелы влезает в 300-мс окно моба (ревью: 400ms '
    + 'героя обрезалось маркером на 75% полёта); факт: '
    + String(arrows[0].style['--fx-arrow-dur']));
  const hits = atkEls000248(env, 'combat-atk-hit');
  assert.equal(hits.length, 1,
    'ровно ОДИН .combat-atk-hit на тайле игрока (вспышка удара '
    + 'показывается; ревью: с задержкой 380ms она не успевала '
    + 'стартовать в 300-мс окне); факт: ' + hits.length);
  pinPct000248(hits[0], 'left', c.px / c.width * 100, 'mob-hit.left');
  pinPct000248(hits[0], 'top', c.py / c.height * 100, 'mob-hit.top');
  assert.equal(hits[0].style['--fx-hit-delay'], '100ms',
    'старт hit — melee-вариант (380ms героя не стартует в '
    + '300-мс окне); факт: ' + String(hits[0].style['--fx-hit-delay']));
  assert.equal(hits[0].style['--fx-hit-dur'], '200ms',
    'hit заканчивается ровно на 300ms (100+200, не 380+220=600); '
    + 'факт: ' + String(hits[0].style['--fx-hit-dur']));
});

// --- 000248-ALLY (КРАСНЫЙ) ---

test('000248-ALLY: атака СОЮЗНИКА (Касание духа Эфира, KeyJ на ходу Эфира) — lunge на тайле союзника + hit на тайле волка, kind «melee» (role support, D4), c._fx НЕ «attack» (P11/R15: герой не анимируется на ударе союзника)', () => {
  const { env, c, m0 } = sceneAttack000248({ ally: true });
  const efir = c.units.find((u) => u.side === 'ally');
  assert.equal(env.G.combatUI.handleCode('KeyJ'), true,
    'фикстура: «Удар» consumed (Касание → render)');
  assert.match(c.log.join('\n'), /Касание духа/,
    'фикстура: Касание духа применено (всегда попадает)');
  const lungs = atkEls000248(env, 'combat-atk-lunge');
  assert.equal(lungs.length, 1,
    'ровно ОДИН .combat-atk-lunge на тайле СОЮЗНИКА (новая ветка '
    + 'runAction для союзника, D7b); краснота: на master ally-маркеров '
    + 'нет; факт: ' + lungs.length);
  pinPct000248(lungs[0], 'left', efir.x / c.width * 100,
    'ally-lunge.left');
  pinPct000248(lungs[0], 'top', efir.y / c.height * 100,
    'ally-lunge.top');
  const hits = atkEls000248(env, 'combat-atk-hit');
  assert.equal(hits.length, 1,
    'ровно ОДИН .combat-atk-hit на тайле волка; краснота: на master '
    + 'маркера нет; факт: ' + hits.length);
  pinPct000248(hits[0], 'left', m0.x / c.width * 100, 'ally-hit.left');
  pinPct000248(hits[0], 'top', m0.y / c.height * 100, 'ally-hit.top');
  assert.ok(c._attackFx,
    'c._attackFx записана союзной веткой; краснота: на master поля нет');
  assert.equal(c._attackFx.kind, 'melee',
    'role «support» → melee-силуэт (D4: зеркало maxDist allyStrike); '
    + 'факт: ' + String(c._attackFx.kind));
  assert.equal(c._attackFx.from, 'efir',
    'источник — союзник (u.id); факт: ' + String(c._attackFx.from));
  assert.ok(!c._fx || c._fx.action !== 'attack',
    'c._fx НЕ «attack» — герой не анимируется на ударе союзника '
    + '(P11/R15); факт: ' + JSON.stringify(c._fx));
});

// --- 000248-CSS (КРАСНЫЙ) ---

test('000248-CSS: index.html — .combat-atk-layer (position absolute, pointer-events none, width/height = формулы .combat-banner), 4 @keyframes combat-atk-*, 4 правила маркеров с animation; NEW-only-стража: базовые правила intact', () => {
  const html = page();
  const layer = cssDecl000246(
    html, '.combat-overlay--combat .combat-atk-layer');
  assert.equal(layer.position, 'absolute',
    'слой: position absolute (геометрия 1:1 с баннером, D2); факт: '
    + String(layer.position));
  assert.equal(layer['pointer-events'], 'none',
    'слой: pointer-events none (клики проходят, D1); факт: '
    + String(layer['pointer-events']));
  const banner = cssDecl000246(
    html, '.combat-overlay--combat .combat-banner');
  assert.ok(banner.width && banner.height,
    'фикстура: формулы .combat-banner на месте');
  assert.equal(layer.width, banner.width,
    'ширина слоя = формула ширины баннера (D2: бокс слоя ≡ бокс '
    + 'canvas); факт: ' + String(layer.width) + ' vs '
    + String(banner.width));
  assert.equal(layer.height, banner.height,
    'высота слоя = формула высоты баннера (D2); факт: '
    + String(layer.height) + ' vs ' + String(banner.height));
  assert.equal(layer.top, banner.top,
    'центрирование слоя: top = top баннера (D2: бокс слоя ≡ бокс '
    + 'canvas — от этого выравнивание маркеров с клетками); факт: '
    + String(layer.top) + ' vs ' + String(banner.top));
  assert.equal(layer.left, banner.left,
    'центрирование слоя: left = left баннера (D2); факт: '
    + String(layer.left) + ' vs ' + String(banner.left));
  assert.equal(layer.transform, banner.transform,
    'центрирование слоя: transform = transform баннера (D2); '
    + 'факт: ' + String(layer.transform) + ' vs '
    + String(banner.transform));
  const names = ['lunge', 'draw', 'arrow', 'hit'];
  for (const n of names) {
    assert.ok(
      new RegExp('@keyframes\\s+combat-atk-' + n + '\\s*{').test(html),
      '@keyframes combat-atk-' + n + ' в index.html (ПЕРВЫЕ keyframes '
      + 'проекта, D12); краснота: на master в index.html 0 keyframes');
  }
  for (const n of names) {
    const d = cssDecl000246(
      html, '.combat-overlay--combat .combat-atk-' + n);
    assert.ok(d.animation,
      'правило .combat-atk-' + n + ' декларирует animation; факт: '
      + JSON.stringify(d));
  }
  const baseActions = cssDecl000246(html, '.combat-actions');
  assert.equal(baseActions['margin-bottom'], '10px',
    'NEW-only: базовое .combat-actions (000124) intact; факт: '
    + String(baseActions['margin-bottom']));
  const scopedActions = cssDecl000246(
    html, '.combat-overlay--combat .combat-actions');
  assert.equal(scopedActions['margin-bottom'], '0',
    'NEW-only: правило 000246 (конец скоупа — точка вставки) intact; '
    + 'факт: ' + String(scopedActions['margin-bottom']));
});

// --- 000248-SC (КРАСНЫЙ) ---

test('000248-SC: адаптация под масштаб — %-пины геометрии: style.left/top/width/height маркеров — строки с %; lunge --fx-lx/--fx-ly = 0.5 клетки к цели (% собственного размера); стрела --fx-* = центры (% слоя); тождество формул слоя и баннера ВКЛЮЧАЯ portrait-override (ТЗ п.3)', () => {
  const { env, c } = sceneAttack000248({});
  assert.equal(env.G.combatUI.handleCode('KeyJ'), true,
    'фикстура: «Удар» consumed (render)');
  const lungs = atkEls000248(env, 'combat-atk-lunge');
  assert.equal(lungs.length, 1,
    'фикстура: lunge есть (краснота: на master маркеров нет)');
  for (const prop of ['left', 'top', 'width', 'height']) {
    assert.equal(typeof lungs[0].style[prop], 'string',
      'lunge.' + prop + ' — строка; факт: '
      + String(lungs[0].style[prop]));
    assert.ok(/%$/.test(String(lungs[0].style[prop])),
      'lunge.' + prop + ' — %-строка (масштабно-инвариантно, D3); '
      + 'факт: ' + lungs[0].style[prop]);
  }
  // Цель — волк над героем: направление (0, −1); own% = 0.5/1·100 = 50.
  pinPct000248(lungs[0], '--fx-lx', 0, 'lunge --fx-lx (нет x-смещения)');
  pinPct000248(lungs[0], '--fx-ly', -50, 'lunge --fx-ly (0.5 клетки ↑)');
  const b = sceneAttack000248({ bow: true });
  assert.equal(b.env.G.combatUI.handleCode('KeyJ'), true,
    'фикстура: выстрел consumed (render)');
  const arrows = atkEls000248(b.env, 'combat-atk-arrow');
  assert.equal(arrows.length, 1,
    'фикстура: стрела есть (краснота: на master снаряда нет)');
  const W = b.c.width, H = b.c.height, m0 = b.m0;
  const arrowPts = [
    ['--fx-x0', (b.c.px + 0.5) / W * 100],
    ['--fx-y0', (b.c.py + 0.5) / H * 100],
    ['--fx-x1', (m0.x + 0.5) / W * 100],
    ['--fx-y1', (m0.y + 0.5) / H * 100],
  ];
  for (const [prop, v] of arrowPts) {
    assert.equal(typeof arrows[0].style[prop], 'string',
      'arrow ' + prop + ' — строка; факт: ' + String(arrows[0].style[prop]));
    assert.ok(/%$/.test(String(arrows[0].style[prop])),
      'arrow ' + prop + ' — %-строка (% слоя, D3); факт: '
      + arrows[0].style[prop]);
    assert.ok(Math.abs(Number.parseFloat(arrows[0].style[prop]) - v) < 0.01,
      'arrow ' + prop + ' ≈ ' + v + '%; факт: ' + arrows[0].style[prop]);
  }
  const html = page();
  const layer = cssDecl000246(
    html, '.combat-overlay--combat .combat-atk-layer');
  const banner = cssDecl000246(
    html, '.combat-overlay--combat .combat-banner');
  assert.equal(layer.width, banner.width,
    'базовый скоуп: формула ширины слоя = формула баннера; факт: '
    + String(layer.width) + ' vs ' + String(banner.width));
  assert.equal(layer.height, banner.height,
    'базовый скоуп: формула высоты слоя = формула баннера; факт: '
    + String(layer.height) + ' vs ' + String(banner.height));
  const mediaStart = html.indexOf(
    '@media (max-width: 640px) and (orientation: portrait)');
  assert.ok(mediaStart >= 0,
    'фикстура: portrait-медиа (000124) на месте');
  const rest = html.slice(mediaStart);
  const layerMed = cssDecl000246(
    rest, '.combat-overlay--combat .combat-atk-layer');
  const bannerMed = cssDecl000246(
    rest, '.combat-overlay--combat .combat-banner');
  assert.equal(layerMed.width, bannerMed.width,
    'portrait: формула ширины слоя = формула баннера (контракт '
    + 'масштабирования); факт: ' + String(layerMed.width) + ' vs '
    + String(bannerMed.width));
  assert.equal(layerMed.height, bannerMed.height,
    'portrait: формула высоты слоя = формула баннера; факт: '
    + String(layerMed.height) + ' vs ' + String(bannerMed.height));
});

// --- 000248-DET (гард, зелёный с master; в red-счёт НЕ входит) ---

test('000248-DET (гард): детерминизм — один сценарий (KeyJ + Space, сид 42) в ДВУХ песочницах → ТО ЖЕ [c.log, c.player.hp, HP юнитов, c.result] (анимация не влияет на ход/урон, НОЛЬ новых бросков c._rng — ТЗ «Детерминизм»)', () => {
  // Снимок — JSON-рандтрип: объекты боя — из vm-контекста песочницы,
  // а deepStrictEqual сверяет прототипы (Array.prototype каждого
  // контекста свой) — прямое сравнение между двумя песочницами
  // ложно-красное.
  const snap000248 = (c) => JSON.parse(JSON.stringify([
    c.log,
    c.player.hp,
    c.units.map((u) => u.hp),
    c.result,
  ]));
  const runDet000248 = () => {
    const { env, c } = sceneAttack000248({});
    assert.equal(env.G.combatUI.handleCode('KeyJ'), true,
      'сценарий: «Удар» consumed');
    assert.equal(env.G.combatUI.handleCode('Space'), true,
      'сценарий: «Конец хода» consumed');
    return snap000248(c);
  };
  assert.deepEqual(runDet000248(), runDet000248(),
    'два прогона сценария (seed 42) — идентичные результаты: лог, HP '
    + 'и исход боя не зависят от UI-анимации');
});

// =====================================================================
// Задача 000230.14 — T8 (e2e, .10 T9-паттерн: vm-песочница, цепочка
// до items.js, затем items.js — live-каталог; НЕ фикстуры).
// Контракт — memory/000230.14-ring-items-wave.md §3.1 T8: 8 РЕАЛЬНЫХ
// колец → ring_left_1..4 + ring_right_1..4 (до 4 на руку — пин
// 000230.02 M5 на реальных предметах); 9-е → «нет свободных слотов
// колец»; fate n=4 → ОБА порога {2}+{4} кумулятивно (пин 000230.04
// SB2); set-skill/free_cast в equipmentAffixes; derived при S=10.
// RED (TDD): колец в live-каталоге нет — addItem падает по
// ОСМЫСЛЕННОЙ причине «неизвестный предмет: волна не добавлена»
// (не синтаксис/окружение).
// =====================================================================

const VM_RING_CHAIN_00023014 = ['global-settings.js', 'perlin.js',
  'map.js', 'skills-data.js', 'items-data.js', 'sheet.js', 'player.js'];
const RING_SLOTS_00023014 = [
  'ring_left_1', 'ring_left_2', 'ring_left_3', 'ring_left_4',
  'ring_right_1', 'ring_right_2', 'ring_right_3', 'ring_right_4',
];
const fromVm00023014 = (v) => JSON.parse(JSON.stringify(v));

test('000230.14 T8 (vm, e2e): РЕАЛЬНЫЕ кольца из live-каталога (не фикстуры) — 8 колец экипируются ДО 4 на руку: ring_left_1..4 + ring_right_1..4 все заняты (пин 000230.02 на реальных предметах); 9-е (copper_ring) → «нет свободных слотов колец»; экип-набор 4×fate + ruby + phoenix + glacier + frost → fate n=4: ОБА порога {2}+{4} активны кумулятивно (пин 000230.04 SB2): equipmentStats.armor = 1 (fate {2}; armor 0 у всех колец); equipmentAffixes: precog 0.36 (0.28 + 0.08 fate {4}), firelord 0.60 (0.15 + 0.40 + 0.05 ember {2}), icelord 0.20 (0.15 + 0.05 rime {2}), fright 0.35; freeCast {ice_armor, magic_shield}; derived (S(precog)=S(firelord)=S(icelord)=S(fright)=10): dodgeBonus 0.68 / fireDamageBonus 0.80 / iceDamageBonus 0.60 / fearChance 0.675 (краснота: неизвестный предмет — волна не добавлена)', () => {
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
  };
  for (const f of VM_RING_CHAIN_00023014)
    vm.runInNewContext(src(f), sandbox, { filename: f });
  vm.runInNewContext(src('items.js'), sandbox, { filename: 'items.js' });
  const G = sandbox.Game;
  const near = (a, b, msg) => assert.ok(
    Math.abs(a - b) < 1e-9, msg + ' (факт: ' + a + ')');
  const makeHero = () => {
    const c = G.createCharacter();
    c.secondary.precog = 10;
    c.secondary.firelord = 10;
    c.secondary.icelord = 10;
    c.secondary.fright = 10;
    return c;
  };
  const equipRing = (c, id) => {
    const ra = G.addItem(c, id);
    assert.equal(ra.ok, true, id + ': выдача (' + (ra.reason || '')
      + ') — предмет есть в live-каталоге (краснота: неизвестный '
      + 'предмет — волна не добавлена)');
    const r = G.equip(c, id);
    assert.equal(r.ok, true, id + ': equip (' + (r.reason || '') + ')');
    assert.ok(RING_SLOTS_00023014.includes(r.slot),
      id + ': слот — один из 8 физ. слотов колец; факт: ' + r.slot);
  };
  {
    const c = makeHero();
    const d = G.derived(c);
    near(d.dodgeBonus, 0.5, 'база dodgeBonus (0.05·10)');
    near(d.fireDamageBonus, 0.5, 'база fireDamageBonus (0.05·10)');
    near(d.iceDamageBonus, 0.5, 'база iceDamageBonus (0.05·10)');
    near(d.fearChance, 0.5, 'база fearChance (min(0.75, 0.05·10))');
    assert.equal(G.equipmentStats(c).armor, 0,
      'база equipmentStats.armor (снаряжения нет)');
    assert.equal(G.equipmentAffixes(c).freeCast.size, 0,
      'база freeCast — пусто');
  }
  {
    const c = makeHero();
    for (const id of ['silver_signet', 'gold_signet', 'emerald_signet',
        'star_signet', 'ruby_ring', 'phoenix_ring', 'glacier_ring',
        'frost_ring'])
      equipRing(c, id);
    const occupied = Object.keys(c.equipment)
      .filter((k) => k.startsWith('ring_') && c.equipment[k])
      .sort();
    assert.deepEqual(occupied, RING_SLOTS_00023014.slice().sort(),
      '8 колец — ВСЕ 8 физ. слотов заняты (ring_left_1..4 + '
      + 'ring_right_1..4, до 4 на руку — пин 000230.02); факт: '
      + occupied.join(','));
    const ra9 = G.addItem(c, 'copper_ring');
    assert.equal(ra9.ok, true, '9-е кольцо: выдача в инвентарь');
    const r9 = G.equip(c, 'copper_ring');
    assert.equal(r9.ok, false,
      '9-е кольцо: equip — ОТКАЗ (8 слотов заняты)');
    assert.equal(r9.reason, 'нет свободных слотов колец',
      '9-е кольцо: ТОЧНАЯ причина «нет свободных слотов колец» '
      + '(пин M5 на реальных предметах); факт: ' + (r9.reason || ''));
    const st = G.activeSets(c);
    assert.deepEqual(fromVm00023014(st.counts),
      { fate: 4, ember: 2, rime: 2 },
      'counts: fate 4 + ember 2 + rime 2 (экип-набор §3.1)');
    assert.equal(st.armor, 1,
      'fate {2}: armor +1 — АКТИВЕН при n=4 (кумулятивно, SB2)');
    assert.deepEqual(fromVm00023014(st.skills),
      { precog: 0.08, firelord: 0.05, icelord: 0.05 },
      'fate {4}: skill precog 0.08 + ember {2} firelord 0.05 + '
      + 'rime {2} icelord 0.05 — ОБА порога fate активны');
    assert.equal(st.freeCast.size, 0, 'set-free_cast в наборе нет');
    assert.equal(G.equipmentStats(c).armor, 1,
      'equipmentStats.armor = 1 — ТОЛЬКО fate {2} (armor 0 у всех '
      + '8 колец, D-02)');
    const a = G.equipmentAffixes(c);
    near(a.skills.precog, 0.36,
      'precog 0.36 = 0.28 (star_signet) + 0.08 (fate {4})');
    near(a.skills.firelord, 0.60,
      'firelord 0.60 = 0.15 (ruby) + 0.40 (phoenix) + 0.05 (ember {2})');
    near(a.skills.icelord, 0.20,
      'icelord 0.20 = 0.15 (frost) + 0.05 (rime {2})');
    near(a.skills.fright, 0.35, 'fright 0.35 (phoenix, без сетов)');
    assert.ok(a.freeCast.has('ice_armor'),
      'free_cast ice_armor (frost_ring) — в equipmentAffixes');
    const d = G.derived(c);
    near(d.dodgeBonus, 0.68,
      'dodgeBonus 0.68 = 0.05·10·(1 + 0.36)');
    near(d.fireDamageBonus, 0.80,
      'fireDamageBonus 0.80 = 0.05·10·(1 + 0.60)');
    near(d.iceDamageBonus, 0.60,
      'iceDamageBonus 0.60 = 0.05·10·(1 + 0.20)');
    near(d.fearChance, 0.675,
      'fearChance 0.675 = min(0.75, 0.05·10·(1 + 0.35))');
  }
  {
    const c = makeHero();
    equipRing(c, 'frost_ring');
    equipRing(c, 'rune_ring');
    const a = G.equipmentAffixes(c);
    assert.deepEqual([...a.freeCast].sort(),
      ['ice_armor', 'magic_shield'],
      'freeCast — РОВНО {ice_armor, magic_shield} (D-05: два '
      + 'free_cast кольца — оба epic)');
  }
});

// =====================================================================
// Задача 000230.12 — e2e предметов «Правая рука»: множители
// derived() (D8 механика инструмента, нулевой код: right_hand →
// equipmentAffixes → sheet.derived() pct(id) =
// perLevel·S(id)·(1+a)), free_cast посохов, DORMANT-состояние
// наборов harvester/forger и UI: классы редкости cp-rarity-<r>
// на строках «Инвентаря».
// Контракт — memory/000230.12-right-hand-items-wave.md
// §2.5/§2.7/§3.1 (R14).
// RED (TDD): предметов волны нет в каталоге (257, max 000257) —
// addItem → {ok:false, reason:'неизвестный предмет: …'} —
// осмысленное падение «предметы волны не добавлены», не
// SyntaxError.
// Герой: 8 навыками-носителями S=10 (firelord/icelord/forge/
// alchemy/runes/scholar/heavy/fists) — база закреплена:
// fireDamageBonus 0.5 / equipmentDurabilityMult 1.5 /
// potionPowerMult 1.5 / runePowerMult 1.5 / xpMult 1.2.
// =====================================================================

test('000230.12 R14: e2e right_hand — инструмент: derived-множители (ember_staff: fireDamageBonus 0.53; iron_hammer: equipmentDurabilityMult 1.515; clay_crucible: potionPowerMult 1.52; bone_graver: runePowerMult 1.52; sage_staff: xpMult 1.26), посох: free_cast (flame_staff→fireball, ice_staff→frost_bolt), набор DORMANT (wood_scyte одна: counts {harvester:1}, damage 0; silver_crucible одна: counts {forger:1}, skills {}, equipmentDurabilityMult остаётся 1.5) + UI: строка «Деревянная коса» → cp-rarity-common, строка «Посох мудреца» → cp-rarity-legendary (краснота: предметы волны не в каталоге — addItem «неизвестный предмет»)', () => {
  const { sandbox } = makeVmSandboxWithConsole00023010();
  loadTorsosVmChain00023010(sandbox);
  vm.runInNewContext(src('items.js'), sandbox, { filename: 'items.js' });
  const G = sandbox.Game;
  const near = (a, b, msg) => assert.ok(
    Math.abs(a - b) < 1e-9, msg + ' (факт: ' + a + ')');
  const makeHero = () => {
    const c = G.createCharacter();
    c.secondary.firelord = 10;
    c.secondary.icelord = 10;
    c.secondary.forge = 10;
    c.secondary.alchemy = 10;
    c.secondary.runes = 10;
    c.secondary.scholar = 10;
    c.secondary.heavy = 10;
    c.secondary.fists = 10;
    return c;
  };
  const give = (c, id) => {
    const ra = G.addItem(c, id);
    assert.equal(ra.ok, true, id + ': выдача (' + (ra.reason || '')
      + ') — предмет в live-каталоге (краснота: неизвестный '
      + 'предмет — волна не добавлена)');
    const r = G.equip(c, id);
    assert.equal(r.ok, true, id + ': equip (' + (r.reason || '') + ')');
    assert.equal(c.equipment.right_hand, id,
      id + ': предмет в слоте right_hand');
  };
  {
    const c = makeHero();
    const d = G.derived(c);
    near(d.fireDamageBonus, 0.5,
      'база fireDamageBonus = 0.05·10 (S firelord 10)');
    near(d.equipmentDurabilityMult, 1.5,
      'база equipmentDurabilityMult = 1 + 0.05·10');
    near(d.potionPowerMult, 1.5, 'база potionPowerMult = 1 + 0.05·10');
    near(d.runePowerMult, 1.5, 'база runePowerMult = 1 + 0.05·10');
    near(d.xpMult, 1.2, 'база xpMult = 1 + 0.02·10 (scholar)');
  }
  {
    const c = makeHero();
    give(c, 'ember_staff');
    near(G.derived(c).fireDamageBonus, 0.53,
      'ember_staff: fireDamageBonus = 0.05·10·(1+0.06) '
      + '(firelord 0.06, D8: right_hand в equipmentAffixes)');
  }
  {
    const c = makeHero();
    give(c, 'iron_hammer');
    near(G.derived(c).equipmentDurabilityMult, 1.515,
      'iron_hammer: equipmentDurabilityMult = 1 + 0.05·10·1.03 '
      + '(forge 0.03)');
  }
  {
    const c = makeHero();
    give(c, 'clay_crucible');
    near(G.derived(c).potionPowerMult, 1.52,
      'clay_crucible: potionPowerMult = 1 + 0.05·10·1.04 '
      + '(alchemy 0.04)');
  }
  {
    const c = makeHero();
    give(c, 'bone_graver');
    near(G.derived(c).runePowerMult, 1.52,
      'bone_graver: runePowerMult = 1 + 0.05·10·1.04 (runes 0.04)');
  }
  {
    const c = makeHero();
    give(c, 'sage_staff');
    near(G.derived(c).xpMult, 1.26,
      'sage_staff: xpMult = 1 + 0.02·10·1.30 (scholar 0.30)');
  }
  {
    const c = makeHero();
    give(c, 'flame_staff');
    assert.ok(G.equipmentAffixes(c).freeCast.has('fireball'),
      'flame_staff: free_cast fireball в equipmentAffixes.freeCast');
  }
  {
    const c = makeHero();
    give(c, 'ice_staff');
    assert.ok(G.equipmentAffixes(c).freeCast.has('frost_bolt'),
      'ice_staff: free_cast frost_bolt в equipmentAffixes.freeCast');
  }
  {
    const c = makeHero();
    give(c, 'wood_scyte');
    const st = G.activeSets(c);
    assert.deepEqual(fromVm00023010(st.counts), { harvester: 1 },
      'harvester — 1 надетый предмет');
    assert.equal(st.damage, 0,
      'set-бонус damage НЕ активен (порог 2 > 1, дормантность)');
    assert.equal(st.armor, 0, 'set-бонуса armor нет');
    near(G.derived(c).fireDamageBonus, 0.5,
      'wood_scyte одна: fireDamageBonus = база — free_cast нет');
  }
  {
    const c = makeHero();
    give(c, 'silver_crucible');
    const st = G.activeSets(c);
    assert.deepEqual(fromVm00023010(st.counts), { forger: 1 },
      'forger — 1 надетый предмет');
    assert.deepEqual(fromVm00023010(st.skills), {},
      'set-skill-бонусов нет (порог 2 > 1)');
    assert.equal(st.freeCast.size, 0, 'set-free_cast-бонусов нет');
    near(G.derived(c).equipmentDurabilityMult, 1.5,
      'silver_crucible одна: equipmentDurabilityMult = 1.5 — '
      + 'set-bonus forge +0.05 НЕ применён (дормантность)');
  }
  {
    const env = loadEnv();
    const c = env.G.createCharacter();
    env.G.playerUI.setCharacter(c);
    const ra1 = env.G.addItem(c, 'wood_scyte');
    assert.equal(ra1.ok, true, 'wood_scyte: выдача (' + (ra1.reason || '')
      + ') — в live-каталоге (краснота: неизвестный предмет)');
    const ra2 = env.G.addItem(c, 'sage_staff');
    assert.equal(ra2.ok, true, 'sage_staff: выдача ('
      + (ra2.reason || '') + ') — в live-каталоге');
    const panel = openPanel(env);
    const row1 = itemRowByName(panel._invBody, 'Деревянная коса');
    assert.ok(row1, 'строка «Деревянная коса» в «Инвентарь»');
    assert.ok(rowClasses(row1).includes('cp-rarity-common'),
      'у строки «Деревянная коса» класс cp-rarity-common; факт: '
      + String(row1.className));
    const row2 = itemRowByName(panel._invBody, 'Посох мудреца');
    assert.ok(row2, 'строка «Посох мудреца» в «Инвентарь»');
    assert.ok(rowClasses(row2).includes('cp-rarity-legendary'),
      'у строки «Посох мудреца» класс cp-rarity-legendary; факт: '
      + String(row2.className));
  }
});
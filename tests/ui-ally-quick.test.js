// Задача 000194: [I]-панель — раздача быстрых предметов ВСЕМ персонажам.
// Активный персонаж (ctx.activeCharId, 000145): Флогистон — бит-в-бит
// (G.setQuick/G.clearQuick по hero); остальные ('efir'/npcId) — запись в
// allyQuickMap (G.playerUI.setAllyQuick(map), live-ссылка): «быстр.» —
// ПЕРВЫЙ свободный слот (создаёт [null×3]), «все быстрые слоты заняты»,
// «предмета нет в инвентаре» (столб — ДО записи); «убрать» (быстрые
// слоты вкладки «Снаряжение») — quick-clear по map. equipmentTab/
// inventoryTab читают АКТИВНОГО персонажа.
//
// Красные (4): G.playerUI.setAllyQuick отсутствует; «быстр.»/«убрать»
// всегда по hero; equipmentTab — всегда hero. Якоря (2): hero-пути
// бит-в-бит. Правка по ревью (1): двойной отказ — «все быстрые
// слоты заняты» (порядок: слот → hasItem, паритет с героем).
//
// Песочница — динамическая цепочка index.html ДО ui.js включительно
// (паттерн CHAIN_000130, tests/ui-panel.test.js) + DOM-стаб с деревом
// (дублирование стаба принято в проекте).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const page = () => fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// --- DOM-стаб с деревом (копия tests/ui-panel.test.js) ---

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

// Цепочка index.html ДО ui.js включительно (динамическая — паттерн
// CHAIN_000130: новая проводка подхватится сама, RED-фаза падает по
// СИМВОЛУ, не ENOENT).
const CHAIN_194 = (() => {
  const all = Array.from(
    page().matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
    .map((p) => p.replace(/^src\//, ''));
  const i = all.indexOf('ui.js');
  assert.ok(i >= 0, 'ui.js подключён в index.html');
  return all.slice(0, i + 1);
})();

function loadUi194() {
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
  for (const f of CHAIN_194) vm.runInContext(src(f), sandbox, { filename: f });
  return { G: sandbox.Game, body: document.body, doc: document,
    errors, sandbox };
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

// Строка предмета в _invBody по подстроку имени + её кнопка «быстр.».
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

// --- 194-PNL-API (красный) ---

test('194-PNL-API: G.playerUI.setAllyQuick — live-ссылка на map; не-объект — тихо', () => {
  const env = loadUi194();
  const c = env.G.createCharacter();
  assert.equal(typeof env.G.playerUI.setAllyQuick, 'function',
    'G.playerUI.setAllyQuick() — метод (краснота: '
    + typeof env.G.playerUI.setAllyQuick + ')');
  const map = { efir: [null, null, null] };
  env.G.playerUI.setAllyQuick(map);
  const panel = openPanel(env, c);
  // Не-объект — тихо (без ошибок, без падения рендера).
  env.G.playerUI.setAllyQuick(null);
  env.G.playerUI.setAllyQuick('junk');
  assert.equal(env.errors.length, 0,
    'не-объект — тихо: ' + env.errors.join('; '));
  env.G.playerUI.render();
  assert.equal(env.errors.length, 0,
    'render после не-объекта — без ошибок: ' + env.errors.join('; '));
  // LIVE-ссылка: мутация map (БЕЗ повторного setAllyQuick) видна
  // после render() (activeCharId 'efir' — вкладка «Снаряжение»).
  env.G.playerUI.setAllyQuick(map);
  env.G.playerUI.toggle(true, null, 'efir');
  map.efir[0] = 'healing_potion';
  env.G.playerUI.render();
  const rows = findAll(panel._quickBody, '.cp-itemrow');
  assert.equal(rows.length, 3, '3 строки быстрых слотов');
  assert.ok(String(rows[0].querySelector('.cp-itemname').textContent)
    .includes('Зелье лечения'),
    'мутация map видна после render() (live-ссылка): '
    + rows[0].querySelector('.cp-itemname').textContent);
});

// --- 194-PNL-GIVE-ALLY (красный) ---

test('194-PNL-GIVE-ALLY: «быстр.» при активном «efir»/npcId — в map (не в hero); 3-й слот — «все быстрые слоты заняты»; stale — «предмета нет в инвентаре»', () => {
  const env = loadUi194();
  const G = env.G;
  const c = G.createCharacter();
  G.addItem(c, 'healing_potion');
  G.addItem(c, 'bread');
  G.addItem(c, 'meat');
  G.addItem(c, 'mana_potion');
  const map = {};
  G.playerUI.setAllyQuick(map);
  const panel = openPanel(env, c);
  G.playerUI.toggle(true, null, 'efir');
  assert.equal(G.playerUI.getActiveCharId(), 'efir',
    'сценарий: активен «efir»');
  // (a) Раздача по одному в свободный слот; hero не тронут.
  // Сравнения — JSON.stringify (не deepEqual): массивы из vm-
  // песочницы — чужой realm, deepStrictEqual сравнивает прототипы
  // и падает (конвенция tests/ui-panel.test.js L1318).
  clickBtn(panel, invQuickBtn(panel, 'Зелье лечения'));
  assert.equal(JSON.stringify(map.efir),
    JSON.stringify(['healing_potion', null, null]),
    'map[efir] создана, ПЕРВЫЙ свободный слот (краснота: '
    + JSON.stringify(map.efir) + ' — ушло в hero: '
    + JSON.stringify(c.inventory.quick) + ')');
  assert.equal(JSON.stringify(c.inventory.quick),
    JSON.stringify([null, null, null]),
    'hero.inventory.quick не тронут');
  clickBtn(panel, invQuickBtn(panel, 'Хлеб'));
  clickBtn(panel, invQuickBtn(panel, 'Жареное мясо'));
  assert.equal(JSON.stringify(map.efir),
    JSON.stringify(['healing_potion', 'bread', 'meat']), '3 слота заняты');
  // (b) 4-й — «все быстрые слоты заняты».
  clickBtn(panel, invQuickBtn(panel, 'Зелье маны'));
  assert.ok(String(noticeOf(panel).textContent)
    .includes('все быстрые слоты заняты'),
    'уведомление дословно: ' + noticeOf(panel).textContent);
  assert.equal(JSON.stringify(map.efir),
    JSON.stringify(['healing_potion', 'bread', 'meat']),
    'map не изменился (занято)');
  // (c) npcId — та же механика.
  G.playerUI.toggle(true, null, 'merc_volk');
  G.addItem(c, 'sulfur', 2);
  G.playerUI.render();
  clickBtn(panel, invQuickBtn(panel, 'Сера'));
  assert.equal(JSON.stringify(map.merc_volk),
    JSON.stringify(['sulfur', null, null]),
    'map[npcId] создана (краснота: ' + JSON.stringify(map.merc_volk) + ')');
  assert.equal(G.totalQty(c, 'sulfur'), 1,
    '000223: одна единица перенесена в слот (строка ×1)');
  // (d) Stale-строка: единица перенесена в слот, последняя в запасах
  // удалена — отказ ДО записи (map не меняется — слот 0 занят с (c)).
  const btnStale = invQuickBtn(panel, 'Сера');
  G.removeItem(c, 'sulfur', 1); // без render — строка устарела
  clickBtn(panel, btnStale);
  assert.ok(String(noticeOf(panel).textContent)
    .includes('предмета нет в инвентаре'),
    'уведомление дословно: ' + noticeOf(panel).textContent);
  assert.equal(JSON.stringify(map.merc_volk),
    JSON.stringify(['sulfur', null, null]),
    'map не изменилась (отказ до записи): '
    + JSON.stringify(map.merc_volk));
});

// --- 194-PNL-GIVE-ORDER (правка по ревью) ---

test('194-PNL-GIVE-ORDER: двойной отказ (слоты заняты И предмета нет) — «все быстрые слоты заняты» (паритет герой ≡ союзник)', () => {
  const env = loadUi194();
  const G = env.G;
  const c = G.createCharacter();
  G.addItem(c, 'healing_potion');
  G.addItem(c, 'bread');
  G.addItem(c, 'meat');
  G.addItem(c, 'mana_potion');
  const panel = openPanel(env, c);
  // Stale-строка: «Зелье маны» убрано из инвентаря БЕЗ render —
  // кнопка строки закэширована, item из инвентаря исчез (двойной
  // отказ с заполненными слотами ниже).
  const btnStale = invQuickBtn(panel, 'Зелье маны');
  G.removeItem(c, 'mana_potion', 1);
  // (a) Герой: 3 слота заняты + предмета нет — «все быстрые слоты
  // заняты» (freeQuickSlot → null ДО setQuick/hasItem).
  G.setQuick(c, 0, 'healing_potion');
  G.setQuick(c, 1, 'bread');
  G.setQuick(c, 2, 'meat');
  clickBtn(panel, btnStale);
  assert.ok(String(noticeOf(panel).textContent)
    .includes('все быстрые слоты заняты'),
    'герой — причина по СЛОТУ: ' + noticeOf(panel).textContent);
  // (b) Союзник в том же состоянии — ТА ЖЕ причина (контракт
  // §2.10: СНАЧАЛА свободный слот, ПОТОМ hasItem).
  const map = { efir: ['healing_potion', 'bread', 'meat'] };
  G.playerUI.setAllyQuick(map);
  G.playerUI.toggle(true, null, 'efir');
  clickBtn(panel, btnStale);
  assert.ok(String(noticeOf(panel).textContent)
    .includes('все быстрые слоты заняты'),
    'союзник — причина по СЛОТУ (краснота: «'
    + noticeOf(panel).textContent + '» — hasItem проверен первым)');
  assert.equal(JSON.stringify(map.efir),
    JSON.stringify(['healing_potion', 'bread', 'meat']),
    'map не изменилась (отказ до записи)');
  assert.equal(JSON.stringify(c.inventory.quick),
    JSON.stringify(['healing_potion', 'bread', 'meat']),
    'hero не тронут');
});

// --- 194-PNL-CLEAR-ALLY (красный) ---

test('194-PNL-CLEAR-ALLY: «убрать» (быстрые слоты) при активном «efir» — из map, hero не тронут', () => {
  const env = loadUi194();
  const G = env.G;
  const c = G.createCharacter();
  G.addItem(c, 'healing_potion');
  const map = { efir: ['healing_potion', null, null] };
  G.playerUI.setAllyQuick(map);
  const panel = openPanel(env, c);
  G.playerUI.toggle(true, null, 'efir');
  const btn = quickClearBtn(panel, 0);
  assert.ok(btn,
    'кнопка «убрать» (data-act=quick-clear, slot=0) у занятого слота '
    + 'активного «efir» (краснота: её нет — equipmentTab рисует hero)');
  clickBtn(panel, btn);
  assert.equal(map.efir[0], null, 'map[efir][0] очищена');
  assert.equal(JSON.stringify(map.efir),
    JSON.stringify([null, null, null]), 'остальные слоты на месте');
  assert.equal(JSON.stringify(c.inventory.quick),
    JSON.stringify([null, null, null]), 'hero не тронут');
});

// --- 194-PNL-EQUIPTAB (красный) ---

test('194-PNL-EQUIPTAB: «Быстрые слоты (бой)» — из записи АКТИВНОГО персонажа; без записи — 3 «— пусто —» (раздать можно)', () => {
  const env = loadUi194();
  const G = env.G;
  const c = G.createCharacter();
  // (a) Запись у «efir» — строки из map.
  G.playerUI.setAllyQuick({ efir: ['healing_potion', null, null] });
  const panel = openPanel(env, c);
  G.playerUI.toggle(true, null, 'efir');
  let rows = findAll(panel._quickBody, '.cp-itemrow');
  assert.equal(rows.length, 3, '3 строки');
  assert.ok(String(rows[0].querySelector('.cp-itemname').textContent)
    .includes('Зелье лечения'),
    'Слот 1 — из map[efir] (краснота: '
    + rows[0].querySelector('.cp-itemname').textContent + ')');
  assert.ok(String(rows[1].querySelector('.cp-itemname').textContent)
    .includes('— пусто —'), 'Слот 2 — пусто');
  // (b) Без записи — 3 «— пусто —» (раздать можно).
  G.playerUI.setAllyQuick({});
  G.playerUI.toggle(true, null, 'merc_volk');
  rows = findAll(panel._quickBody, '.cp-itemrow');
  assert.equal(rows.length, 3, '3 строки');
  for (const r of rows) {
    assert.ok(String(r.querySelector('.cp-itemname').textContent)
      .includes('— пусто —'), 'слот пуст');
  }
});

// --- Якоря (зелёные до и после реализации) ---

test('194-PNL-QUICK-HERO (якорь): «быстр.»/«убрать» для Флогистона — по hero (бит-в-бит)', () => {
  const env = loadUi194();
  const G = env.G;
  const c = G.createCharacter();
  G.addItem(c, 'healing_potion');
  const panel = openPanel(env, c);
  assert.equal(G.playerUI.getActiveCharId(), null,
    'сценарий: активен дефолт (Флогистон)');
  clickBtn(panel, invQuickBtn(panel, 'Зелье лечения'));
  assert.equal(c.inventory.quick[0], 'healing_potion',
    'hero.inventory.quick[0] = id (G.setQuick)');
  const btn = quickClearBtn(panel, 0);
  assert.ok(btn, 'кнопка «убрать» у занятого слота hero');
  clickBtn(panel, btn);
  assert.equal(c.inventory.quick[0], null, 'G.clearQuick — hero очищен');
});

test('194-PNL-EQUIPTAB-HERO (якорь): «Быстрые слоты (бой)» Флогистона — из hero (бит-в-бит)', () => {
  const env = loadUi194();
  const G = env.G;
  const c = G.createCharacter();
  G.addItem(c, 'healing_potion');
  G.setQuick(c, 0, 'healing_potion');
  const panel = openPanel(env, c);
  const rows = findAll(panel._quickBody, '.cp-itemrow');
  assert.equal(rows.length, 3, '3 строки');
  assert.ok(String(rows[0].querySelector('.cp-itemname').textContent)
    .includes('Зелье лечения'), 'Слот 1 — из hero.inventory.quick');
  assert.ok(String(rows[1].querySelector('.cp-itemname').textContent)
    .includes('— пусто —'), 'Слот 2 — пусто');
});

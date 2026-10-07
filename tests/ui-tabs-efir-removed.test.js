// Задача 000146 (follow-up 000139, волна D — ПЕРВАЯ): Убрать
// вкладку «Эфир» — секции на «Персонаж» (kind 'efir').
//
// Суть — УДАЛЕНИЕ ДУБЛЯ: после 000145 весь контент вкладки «Эфир»
// (книга заклинаний с отметками авто-разблокировок + «Вдох Эфира»)
// УЖЕ живёт на странице «Персонаж» как вид kind 'efir' (контракт
// memory/000145-active-character.md §3/§8: тела _book/_breath/
// _breathSec — стабильный контракт). Красные здесь — про УДАЛЕНИЕ
// дубля и переадресацию навигации, а не про контент (контент —
// B6/B7 000145, зелёные в обеих фазах).
//
// Контракт: memory/000146-efir-tab-removal.md (§9 — R1–R8, §2 —
// решения D1–D10). ТЗ: tasks/pending/000146.md.
//
// КРАСНЫЕ (падают на ТЕКУЩЕМ коде — функциональности НЕТ: вкладка
// ещё в реестре/теге/на диске, строка Эфира открывает вкладку;
// падение — ПО СОСТОЯНИЮ, не SyntaxError/ENOENT — цепочка
// грузится чисто, load-errors === 0 проверяется первым):
//   * R1 (vm) — id 'efir' ещё в реестре (get ≠ null);
//   * R2 (vm) — клик по строке «Эфир» в «Отряде» ещё открывает
//     вкладку «Эфир» (видимый pane — 4-й, panes[0] скрыт,
//     getActiveCharId null);
//   * R3 (vm) — левый столбец ещё 4 .cp-tabpane; «Вдох Эфира»
//     дублируется в ДВУХ pane («Персонаж» + вкладка «Эфир»);
//   * R4 (node) — файл src/ui-tab-efir.js ещё на диске + тег ещё
//     в index.html;
//   * R5/R6/R7/R8 — осознанные пере-пины существующих тестов
//     (index-order R5/R7, ui-panel R6, B8(3) 000145 → R8,
//     D9: __game-инжект) — см. memory/000146-efir-tab-removal.md §8.
//
// Механика — ДУБЛЬ patterns tests/ui-efir.test.js (принято —
// 000086/000130/000145): ДИНАМИЧЕСКИЙ CHAIN из index.html до
// ui.js включительно (тег src/ui-tab-efir.js удалится в GREEN-
// фазе — цепочка адаптируется САМА, лоадер МЕЖДУ ФАЗАМИ не
// правится); DOM-стаб с селекторами «тег[атрибут]» (matchesSel —
// дубль tests/squad-panel.test.js: click-ветка строки Эфира
// использует e.target.closest('div[data-efirtab]')); инжект
// sandbox.__game = { state: { efir, efirMet, roster } } ДО
// toggle (main.js в цепочке нет — точку ставит тест; efirMet —
// ТОЛЬКО из __game.state — partySource, ui-tab-skills.js; без
// него Эфира нет в партии и активный fallback на Флогистона).
//
// Cross-realm (vm): пины — примитивы/текст/длина (правило 000082);
// живые ссылки — только ВНУТРИ одной песочницы.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const page = () => fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// --- Минимальный DOM-стаб с деревом (дубль tests/ui-efir.test.js;
// matchesSel — с «тег[атрибут]», дубль tests/squad-panel.test.js) ---

function matchesSel(el, sel) {
  // 'тег[атрибут]' / 'тег[атрибут=значение]' (делегированные клики:
  // e.target.closest('div[data-efirtab]') и 'button[data-squadact]'),
  // '.класс', имя тега.
  const m = /^([a-zA-Z][\w-]*)\[([\w-]+)(?:=([^\]]+))?\]$/.exec(sel);
  if (m) {
    if (String(el.tagName || '').toLowerCase() !== m[1].toLowerCase()) {
      return false;
    }
    // Стаб хранит атрибуты dataset БЕЗ префикса 'data-' (ui.js
    // пишет row.dataset.efirtab напрямую). Проверяем оба варианта.
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
  // пересобирает тела in place — секции НЕ строятся заново).
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

// ДИНАМИЧЕСКИЙ CHAIN: ВСЕ <script src> index.html до ui.js
// включительно (паттерн tests/ui-efir.test.js L174). GREEN-фаза:
// тег src/ui-tab-efir.js исчезает — цепочка короче на один модуль,
// лоадер не правится. В цепочке уже есть efir.js/spells-data.
// js/skills-data.js/party.js — всё нужное для вида kind 'efir'.
const CHAIN = (() => {
  const all = Array.from(
    page().matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
    .map((p) => p.replace(/^src\//, ''));
  const i = all.indexOf('ui.js');
  assert.ok(i >= 0, 'ui.js подключён в index.html');
  return all.slice(0, i + 1);
})();

// Загрузка цепочки в vm-песочницу. Возвращает { G, body, errors,
// sandbox } (sandbox — для инжекта __game ДО toggle).
function loadUi() {
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
  for (const f of CHAIN) vm.runInContext(src(f), sandbox, { filename: f });
  return { G: sandbox.Game, body: document.body, errors, sandbox };
}

// --- Хелперы ---

// Партия для vm-тестов (дубль makePartyEnv 000145): герой
// (ctx.character — setCharacter) + Эфир (live-лист, efirMet) +
// наёмный Вольк (запись 000143). `__game.state` (efir/efirMet/
// roster — live) — ИНЖЕКЦИЯ ДО toggle (main.js в цепочке нет).
function makePartyEnv(efirMet = true) {
  const env = loadUi();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  assert.ok(env.G.playerUI, 'Game.playerUI создан (ui.js в CHAIN)');
  const hero = env.G.createCharacter();
  const efir = env.G.efir.createEfir();
  const volk = env.G.NpcData.NPCS.find((n) => n.id === 'merc_volk');
  assert.ok(volk, 'Вольк (merc_volk) в каталоге npc-data');
  const mercSheet = env.G.Sheet.createSheet('merc', {
    primary: volk.найм.базовые_характеристики,
    spells: volk.найм.spells,
    npcId: 'merc_volk',
  });
  for (const [id, lv] of Object.entries(volk.найм.начальные_навыки)) {
    mercSheet.secondary[id] = lv; // 000141: начальные навыки
  }
  const roster = [{ npcId: 'merc_volk', sheet: mercSheet, level: 1,
    xp: 0, loyalty: 51, hiredDay: 1 }];
  env.sandbox.__game = { state: { efir, efirMet, roster } };
  env.G.playerUI.setCharacter(hero);
  env.G.playerUI.toggle(true); // buildPanel + render (дефолт — герой)
  env.hero = hero;
  env.efirSheet = efir;
  return env;
}

// Левый столбец панели (первый .cp-column).
function leftColumn(env) {
  const cols = findAll(env.body, '.cp-column');
  assert.ok(cols && cols.length >= 1,
    'панель персонажа построена (.cp-column в body)');
  return cols[0];
}

// Панель «Персонаж» — ПЕРВАЯ .cp-tabpane левом столбце (000130:
// порядок = порядок тегов; 000146: левый столбец — 3 вкладки).
function characterPane(env) {
  const panes = findAll(leftColumn(env), '.cp-tabpane');
  return panes[0] || null;
}

// Секция по СВОЕМУ тексту заголовка (.cp-section; строки — дети).
function hasSection(pane, name) {
  assert.ok(pane, 'pane существует (.cp-tabpane)');
  return !!findAll(pane, '.cp-section')
    .find((s) => s.textContent === name);
}

function sectionOf(pane, name) {
  assert.ok(pane, 'pane существует (.cp-tabpane)');
  return findAll(pane, '.cp-section')
    .find((s) => s.textContent === name) || null;
}

// Полный текст узла (рекурсивно — заголовок секции + тела).
function textOf(node) {
  let s = node._text || '';
  for (const ch of node.children || []) s += textOf(ch);
  return s;
}

// Строка панели «Отряд» по имени (дубль tests/squad-panel.test.js).
function rowByName(panel, name) {
  return findAll(panel, '.cp-itemrow').find((r) => {
    const nm = r.querySelector('.cp-itemname');
    return nm && nm.textContent === name;
  }) || null;
}

// --- R1: id 'efir' отсутствует в реестре ---

test('000146 R1: id «efir» ОТСУТСТВУЕТ в реестре Game.uiTabs: get(«efir») === null; list() = 6 записей в порядке тегов; левый столбец — 3 .cp-tab («Персонаж»/«Инвентарь»/«Игровые настройки», побайтово), НЕТ кнопки data-tabid="efir"; 3 .cp-tabpane; 0 ошибок', () => {
  const env = loadUi();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  const reg = env.G.uiTabs;
  assert.ok(reg && typeof reg.get === 'function',
    'Game.uiTabs — реестр вкладок (000130)');
  assert.equal(reg.get('efir'), null,
    'id «efir» отсутствует в реестре (000146: вкладка «Эфир» убрана ' +
    '— файл src/ui-tab-efir.js удалён; секции — на «Персонаже» как ' +
    'вид kind \'efir\', 000145; сейчас: запись вкладки ещё на месте)');
  assert.deepEqual([...reg.list().map((t) => t.id)],
    ['character', 'inventory', 'equipment', 'settings', 'shop',
     'quests'],
    'реестр — 6 записей в порядке script-тегов (без «efir»)');
  // Левый столбец — 3 вкладки без «Эфира».
  env.G.playerUI.setCharacter(env.G.createCharacter());
  env.G.playerUI.toggle(true);
  const col0 = leftColumn(env);
  const tabs = findAll(col0, '.cp-tab');
  assert.equal(tabs.length, 3,
    'левый столбец — 3 вкладки (000146: «Эфир» убрана): ' +
    tabs.map((t) => t.dataset.tabid).join(','));
  assert.deepEqual(tabs.map((t) => t.dataset.tabid),
    ['character', 'inventory', 'settings'],
    'id левого столбца в порядке тегов (без «efir»)');
  assert.deepEqual(tabs.map((t) => t.textContent),
    ['Персонаж', 'Инвентарь', 'Игровые настройки'],
    'подписи — побайтово (000096)');
  assert.equal(findAll(col0, 'button[data-tabid=efir]').length, 0,
    'кнопки data-tabid="efir" НЕТ (вкладка убрана)');
  const panes = findAll(col0, '.cp-tabpane');
  assert.equal(panes.length, 3,
    'левый столбец — 3 .cp-tabpane (pane «Эфира» удалён)');
  assert.equal(env.errors.length, 0, '0 ошибок: ' + env.errors.join('; '));
});

// --- R2: клик по строке «Эфир» в «Отряде» → вид kind 'efir' ---

test('000146 R2: клик по строке «Эфир» в «Отряде» открывает вид kind \'efir\' на «Персонаж»: «Отряд» закрывается; левый столбец — 3 pane, единственный видимый = panes[0] («Персонаж»); .cp-title = «Эфир»; getActiveCharId() = «efir»; портрет Эфира подсвечен; onChange ×0; строка Эфира побайтово (регрессия P3: без button[data-squadact]); 0 ошибок', () => {
  const env = loadUi();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  const E = env.G.efir;
  const e = E.createEfir();
  const volk = env.G.NpcData.NPCS.find((n) => n.id === 'merc_volk');
  assert.ok(volk, 'Вольк (merc_volk) в каталоге npc-data');
  const mercSheet = env.G.Sheet.createSheet('merc', {
    primary: volk.найм.базовые_характеристики, npcId: 'merc_volk' });
  const roster = [{ npcId: 'merc_volk', sheet: mercSheet, level: 1,
    xp: 0, loyalty: 51, hiredDay: 1 }];
  // efirMet — ТОЛЬКО из __game.state (partySource) — инжект ДО
  // клика (D9): без него Эфира нет в партии.
  env.sandbox.__game = { state: { efir: e, efirMet: true, roster } };
  const hero = env.G.createCharacter();
  env.G.playerUI.setCharacter(hero);
  let saves = 0;
  env.G.squadUI.init({ roster, efir: e,
    onChange: () => { saves += 1; } });
  env.G.squadUI.toggle(true);
  const squad = findAll(env.body, '.squad-panel')[0];
  assert.ok(squad, 'панель «Отряд» построена и открыта');
  const row = rowByName(squad, 'Эфир');
  assert.ok(row, 'строка «Эфир» в панели «Отряд» (000086)');
  // Регрессия P3: строка НЕ переделана — побайтово, без кнопок.
  assert.equal(row.querySelector('.cp-itemmeta').textContent,
    'уровень 1 · HP 16/16 · всегда со мной',
    'строка Эфира побайтово (регрессия 000086 P3)');
  assert.equal(row.querySelector('button[data-squadact]'), null,
    'в строке Эфира НЕТ кнопки действий (P3: Эфир — не наёмник)');

  // Клик по СТРОКЕ через ОДИН делегированный обработчик панели.
  const clickers = squad.listeners.click || [];
  assert.ok(clickers.length >= 1,
    'делегированный click-обработчик панели «Отряд»');
  clickers[0]({ target: row });
  assert.equal(env.errors.length, 0,
    '0 ошибок после клика: ' + env.errors.join('; '));
  assert.equal(env.G.squadUI.isOpen(), false,
    '«Отряд» закрыт (toggle(false) — полная замена поверхности)');
  const char = findAll(env.body, '.char-panel')[0];
  assert.ok(char && char.style.display === 'flex',
    '000146: клик открыл панель «Персонаж» (не вкладку)');
  const panes = findAll(leftColumn(env), '.cp-tabpane');
  assert.equal(panes.length, 3,
    'левый столбец — 3 pane («Персонаж»/«Инвентарь»/«Игровые ' +
    'настройки»); 000146: pane вкладки «Эфир» удалена (сейчас 4 — ' +
    'вкладка ещё существует)');
  const visible = panes.filter((p) => p.style.display !== 'none');
  assert.equal(visible.length, 1, 'ровно одна активная вкладка');
  assert.equal(visible[0], panes[0],
    'единственный видимый pane — panes[0] («Персонаж», вид kind ' +
    '\'efir\'); сейчас: видима 4-я (вкладка «Эфир» — дубль)');
  const pane = panes[0];
  assert.equal(pane.querySelector('.cp-title').textContent, 'Эфир',
    'заголовок — АКТИВНЫЙ персонаж (Эфир, kind \'efir\')');
  assert.equal(env.G.playerUI.getActiveCharId(), 'efir',
    'активный = Эфир (redirect: toggle(true, «character», «efir»))');
  const btns = findAll(pane, '.cp-portrait');
  const efirBtn = btns.find((b) => b.dataset.memberid === 'efir');
  assert.ok(efirBtn, 'портрет Эфира в ряду (efirMet = true, партия)');
  assert.equal(String(efirBtn.className), 'cp-portrait cp-portrait-active',
    'подсветка — на Эфире (контракт 000145 §3.2)');
  assert.equal(saves, 0,
    'клик — без мутаций состояния: onChange (сейв в main.js) НЕ вызван');
});

// --- R3: вид kind 'efir' — все бывшие секции, каждый носитель 1 раз ---

test('000146 R3: вид kind \'efir\' на «Персонаж» содержит ВСЕ бывшие секции вкладки, каждый носитель ОДИН РАЗ: книга — ровно 10 строк канонического порядка с отметками (носитель контента «Открытия»); live L5 «Свет исцеления» = «уровень 5» (in place); «Вдох Эфира» ВИДНА, текст SPEC; левый столбец — ровно 3 .cp-tabpane; по ВЕЙ панели ровно ОДИН pane содержит «Вдох Эфира»; секции «Открытия» НЕТ (D1); hero-дефолт: «Флогистон», книга learned-only без .cp-itemmeta, «Вдох Эфира» СКРЫТА; пул EFIR_START_LIST на едином листе (D2); потолок — единый текст (D3), старый хвост нигде', () => {
  const env = makePartyEnv(true);
  const pane = characterPane(env);
  assert.ok(pane, 'character-pane существует');
  const E = env.G.efir;
  const e = env.efirSheet;
  const bookOf = () => sectionOf(pane, 'Книга заклинаний');

  // (1) hero-дефолт (2-арг toggle — уже открыт): learned-only книга
  // БЕЗ отметок, «Вдох Эфира» СКРЫТА.
  assert.equal(pane.querySelector('.cp-title').textContent, 'Флогистон',
    'дефолтный активный — герой');
  let book = bookOf();
  assert.ok(book, 'секция «Книга заклинаний» на странице (000145)');
  let rows = findAll(book, '.cp-itemrow');
  assert.equal(rows.length, 2, 'hero — learned-only книга (старт)');
  assert.equal(rows[0].querySelector('.cp-itemname').textContent, 'Искра');
  assert.equal(rows[1].querySelector('.cp-itemname').textContent, 'Заговора');
  for (const r of rows) {
    assert.equal(r.querySelector('.cp-itemmeta'), null,
      'hero — БЕЗ отметок (learned-only, .cp-itemmeta нет)');
  }
  const breathSec = sectionOf(pane, 'Вдох Эфира');
  assert.ok(breathSec, 'секция «Вдох Эфира» на странице (носитель)');
  assert.equal(breathSec.style.display, 'none',
    'для hero — СКРЫТА (видна только при active «Эфир»)');

  // (2) активный = Эфир (000145: 3-й аргумент toggle).
  env.G.playerUI.toggle(true, 'character', 'efir');
  assert.equal(env.errors.length, 0,
    '0 ошибок после переключения: ' + env.errors.join('; '));
  assert.equal(pane.querySelector('.cp-title').textContent, 'Эфир',
    'активный — Эфир (kind \'efir\')');
  assert.equal(breathSec.style.display, '',
    '«Вдох Эфира» — ВИДНА для Эфира (000145)');
  const bt = textOf(breathSec.querySelector('.cp-stats'));
  for (const s of ['1 раз за бой', '40%', '20 маны',
      'round(10 + 0.8 * Мудрость)', '×0.8', '2 хода']) {
    assert.ok(bt.includes(s), '«Вдох Эфира» — строка SPEC: ' + s);
  }
  // Книга Эфира — ВСЕГДА ровно 10 строк (канонический порядок:
  // старт сперва — efirSpellsByLevel(1), затем UNLOCKS по
  // возрастанию порога). Метки «уровень N»/«откроется на N-м
  // уровне» — это и есть отметки авто-разблокировок ТЗ = носитель
  // контента бывшей статической таблицы «Открытия» (D1).
  book = bookOf();
  rows = findAll(book, '.cp-itemrow');
  assert.equal(rows.length, 10,
    'книга «Эфира» — ровно 10 строк (2 старт + 8 UNLOCKS)');
  const start = E.efirSpellsByLevel(1);
  const un = E.EFIR_SPELL_UNLOCKS.slice().sort((a, b) => a[0] - b[0]);
  const nameOf = (id) => env.G.SpellsData.SPELLS_BY_ID[id].название;
  const expect = start.map((id) => [nameOf(id), 'уровень 1'])
    .concat(un.map(([lv, id]) =>
      [nameOf(id), 'откроется на ' + lv + '-м уровне']));
  rows.forEach((r, i) => {
    assert.equal(r.querySelector('.cp-itemname').textContent,
      expect[i][0], 'строка ' + i + ' — имя из G.SpellsData');
    assert.equal(r.querySelector('.cp-itemmeta').textContent,
      expect[i][1],
      'строка ' + i + ' — отметка (носитель «Открытия», D1)');
  });
  assert.deepEqual([...un.map((u) => u[0])],
    [5, 8, 10, 12, 15, 20, 25, 30],
    'пороги UNLOCKS — канонический порядок (пин); [...]: массив ' +
    'ЧУЖОГО realm (vm) — спред даёт host-массив (правило 000082)');
  // live: L5 — «Свет исцеления» = «уровень 5» (in place: тело
  // книги _book — тот же узел; строки пересобираются в нём).
  const bookBody = book.querySelector('.cp-items');
  assert.ok(bookBody, 'тело книги (.cp-items — _book)');
  e.level = 5;
  e.spells = E.efirSpellsByLevel(5); // [spark, mend, light_heal]
  env.G.playerUI.render();
  const rows5 = findAll(bookBody, '.cp-itemrow');
  assert.equal(rows5.length, 10, 'после render — 10 строк (in place)');
  const light = rows5.find((r) =>
    r.querySelector('.cp-itemname').textContent === 'Свет исцеления');
  assert.ok(light, '«Свет исцеления» в книге L5');
  assert.equal(light.querySelector('.cp-itemmeta').textContent,
    'уровень 5', 'L5 — изучен: отметка «уровень 5» (in place)');

  // (3) ДЕДУПЛИКАЦИЯ (красное ядро R3): левый столбец — ровно 3
  // .cp-tabpane; по ВЕЙ панели — ровно ОДИН pane с «Вдохом Эфира».
  const panes = findAll(leftColumn(env), '.cp-tabpane');
  assert.equal(panes.length, 3,
    'левый столбец — ровно 3 .cp-tabpane (000146: pane вкладки ' +
    '«Эфир» удалена; сейчас 4 — дубль ещё на месте)');
  const allPanes = findAll(env.body, '.cp-tabpane');
  const withBreath = allPanes.filter((p) => hasSection(p, 'Вдох Эфира'));
  assert.equal(withBreath.length, 1,
    'по ВЕЙ панели ровно ОДИН pane содержит «Вдох Эфира» (000146: ' +
    'дубль-поверхность убрана; сейчас 2 — «Персонаж» + вкладка)');
  assert.equal(withBreath[0], panes[0],
    'единственный носитель — pane «Персонаж»');
  // (4) «Открытия» — отдельной секции НЕТ (D1: контент — отметки).
  assert.equal(hasSection(pane, 'Открытия'), false,
    'секции «Открытия» на «Персонаж» НЕТ (D1: 8 порогов — в ' +
    'отметках книги; отдельная таблица — дубликат)');
  // (5) пул Эфира — на ЕДИНОМ листе 31 навыка (D2: EFIR_START_LIST).
  const cellOf = (skillId) => {
    const btn = findAll(pane, '.cp-btn')
      .find((b) => b.dataset.skill === skillId);
    assert.ok(btn, 'кнопка data-skill=' + skillId + ' найдена');
    const tr = btn.closest('tr');
    assert.ok(tr, 'кнопка в строке <tr>');
    return tr.querySelector('.cp-level');
  };
  assert.equal(cellOf('firelord').textContent, '1',
    'firelord — 1 (EFIR_START_LIST, единый лист 000144)');
  assert.equal(cellOf('icelord').textContent, '0',
    'icelord — 0 (EFIR_START_LIST)');
  assert.equal(cellOf('perception').textContent, '1',
    'perception — 1 (EFIR_START_LIST)');
  assert.equal(cellOf('precog').textContent, '0', 'precog — 0');
  // (6) потолок — ЕДИНЫЙ текст (D3); старый хвост — нигде.
  const cap = env.G.Sheet.practiceCap(e, 'firelord');
  assert.equal(cap, 6, 'сверка API: потолок L1 = Интеллект 3×2 = 6');
  e.secondary.firelord = cap; // на потолке
  env.G.playerUI.render();
  const fireBtn = findAll(pane, '.cp-btn')
    .find((b) => b.dataset.skill === 'firelord');
  const fireReq = fireBtn.closest('tr').querySelector('.cp-req');
  assert.equal(fireReq.textContent,
    'потолок практикой: Интеллект 3×2 — дальше растёт только ' +
    'очками и книгами',
    'пометка потолка — ОДИН текст для всех kinds (000140; D3)');
  assert.ok(!textOf(pane).includes('растёт с уровнем Эфира'),
    'старый хвост «растёт с уровнем Эфира» — нигде на «Персонаж» ' +
    '(D3: в sheet-модели атрибуты растут очками)');
  assert.equal(env.errors.length, 0, '0 ошибок: ' + env.errors.join('; '));
});

// --- R4: node — файл и тег удалены ---

test('000146 R4: node — файла src/ui-tab-efir.js НЕТ на диске (000116: 369 строк, саморегистрация {id:"efir"}) и в index.html НЕТ тега <script src="src/ui-tab-efir.js">', () => {
  assert.equal(
    fs.existsSync(path.join(ROOT, 'src', 'ui-tab-efir.js')), false,
    'src/ui-tab-efir.js отсутствует на диске (000146: вкладка ' +
    'убрана — секции на «Персонаже» (kind \'efir\'), 000145; ' +
    'сейчас: файл ещё существует — не удалён)');
  assert.doesNotMatch(page(), /<script\s+src="src\/ui-tab-efir\.js">/,
    'тег src/ui-tab-efir.js отсутствует в index.html (000146: пин ' +
    'без тега; тег стоит между ui-tab-quests.js и ui.js)');
});

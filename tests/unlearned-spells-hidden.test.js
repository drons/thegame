// Задача 000231: «На странице персонажей не показывать неизученные
// заклинания» (одна строка — решения зафиксированы в памяти).
//
// Скоуп (D1, memory/000231-hidden-unlearned-spells.md): скрыть ОБА
// источника неизученных на странице «Персонаж»:
//   (a) avail-блок 000147 «Доступно к изучению:» (.cp-availrow /
//       .cp-avail-title) — все kinds;
//   (b) неизученные канонические строки Эфира с меткой «откроется
//       на N-м уровне» (efir-ветка renderBook) — каноника теперь
//       фильтруется по learned.
// Книга = spec/spells.md «Известные персонажу заклинания»
// (learned-only). Механика изучения (canLearn/learn, свиток [I],
// руна [E], наставник [E]), боевая книга, тултипы, формат сейва,
// RNG — НЕ ТРОГАЮТСЯ (D9/D10).
//
// Контракт: memory/000231-hidden-unlearned-spells.md (§3, §6).
// ТЗ: tasks/pending/000231.md. Контракты-родители: 000145/000146/
// 000147 (§3.6/D7/§9 — SUPERSEDED в части UI, см. §5 памяти).
//
// КРАСНЫЕ — 3 (expectedRedCount = 3). Все падают на ТЕКУЩЕМ коде:
// renderBook ещё эмитит avail-блок (renderAvailBook, 000147) и
// неизученную канонику Эфира («откроется на N-м уровне»). Падение —
// ПО НАЛИЧИЮ/СЧЁТУ/ТЕКСТУ (assertion), не SyntaxError/крах:
// цепочка грузится чисто (ошибок при загрузке — 0 первым
// ассертом каждого теста):
//   * U-1 (vm) — ГЕРОЙ (свиток fireball_scroll в инвентаре):
//     ровно 2 .cp-itemrow («Искра»/«Заговора» — имена из
//     G.SpellsData, БЕЗ .cp-itemmeta, button === null);
//     .cp-availrow = 0; .cp-avail-title = 0; текста «Доступно к
//     изучению» в pane НЕТ — при наличных источниках (свиток в
//     инвентаре героя + руна 40 в каталоге). RED: avail-строки
//     эмитятся («Огненный шар» — «свиток: нужен ранг школы
//     «Знаток»» и т.п.) + заголовок.
//   * U-2 (vm) — НАЁМНЫЙ (Вольк, Рунопись 1, spells []): ровно 1
//     .cp-itemrow «—»; .cp-availrow = 0; заголовка НЕТ; «Хлад» в
//     секции НЕТ (руна 40 — каталожный источник, «руна: доступно»
//     — максимально провокационный кейс). RED: avail-строки
//     наёмного («Хлад» — «руна: доступно» и др.).
//   * U-3 (vm) — ЭФИР: до — .cp-itemrow =
//     G.efir.efirSpellsByLevel(1).length (2, data-driven), ВСЕ
//     метки «уровень 1»; текста «откроется» в секции НЕТ;
//     «Теневой сгусток» в секции НЕТ; .cp-availrow = 0. Затем
//     G.Spells.learn(efirSheet, 'chill', 'scroll') (t1, INT 3 —
//     Ученик — ok) + re-render: .cp-itemrow = start+1 (3);
//     «Хлад» — .cp-itemrow с меткой «изучено» ПОСЛЕ каноники,
//     button === null; «откроется» всё ещё нет; «Теневой сгусток»
//     всё ещё нет; .cp-availrow = 0. RED: 11 канон. строк
//     («откроется…» × 9) + avail-строки.
// U-4 (зелёный с рождения; НЕ входит в expectedRedCount — правка по
// итогам ревью): D3-плейсхолдер «—» efir-ветки renderBook (0 строк
// после learned-фильтра; в игре недостижимо — createEfir/restore
// всегда ⊇ EFIR_SPELL_START) — live-лист мутацией (spells = []) +
// re-render + восстановление листа.
//
// Механика — ДУБЛЬ ЧАСТИ B tests/spells-any-party.test.js (000147):
// makeEl/findAll/matchesSel, loadEnv с ДИНАМИЧЕСКИМ CHAIN до ui.js
// (подхватит ЛЮБОЙ script-тег — лоадер МЕЖДУ ФАЗАМИ не правится),
// makePartyEnv(opts) (heroScroll — источник свитка в инвентаре
// героя; наёмный ВСЕГДА с Рунописью 1 — провокационный кейс «руна:
// доступно») с `__game.state`-инжекцией ДО openPanel (main.js в
// цепочке нет — точку ставит тест).
//
// Cross-realm (vm): пины — примитивы/текст/длины (правило 000082);
// массивы песочницы — через [...arr] в host-массив.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const page = () => fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// --- Минимальный DOM-стаб с деревом (дубль tests/spells-any-party.
// test.js ЧАСТЬ B; matchesSel — с «тег[атрибут]») ---

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
  // обновляет секции in place).
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
// включительно. Новый script-тег (если бы был — по ТЗ НЕТ)
// подхватывался бы САМ; лоадер МЕЖДУ ФАЗАМИ не правится.
const CHAIN = (() => {
  const all = Array.from(
    page().matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
    .map((p) => p.replace(/^src\//, ''));
  const i = all.indexOf('ui.js');
  assert.ok(i >= 0, 'ui.js подключён в index.html');
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

// Партия для vm-тестов 000231 (дубль makePartyEnv 000147): герой
// (ctx.character — setCharacter) + Эфир (live-объект, efirMet) +
// наёмный Вольк (запись 000143: 6 ключей; sheet — живой лист).
// opts: { heroScroll — свиток в инвентарь ГЕРОЯ }. Наёмный ВСЕГДА
// с Рунописью 1 (000147 — источник «руна»: провоцирующий кейс
// «руна: доступно»).
// `__game.state` (efir/efirMet/roster — live) — ИНЖЕКЦИЯ ДО
// openPanel (main.js в цепочке нет — точку ставит тест).
function makePartyEnv(opts = {}) {
  const env = loadEnv();
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
  // 000231: Рунопись 1 — каталожный источник «руна» на листе
  // наёмного («Хлад» — canLearn ok: t1, Рунопись 1 ≥ 1).
  mercSheet.secondary.runes = 1;
  const roster = [{ npcId: 'merc_volk', sheet: mercSheet, level: 1,
    xp: 0, loyalty: 51, hiredDay: 1 }];
  if (opts.heroScroll) {
    const add = env.G.addItem(hero, opts.heroScroll, 1);
    assert.ok(add && add.ok, 'свиток в инвентаре героя: ' + opts.heroScroll);
  }
  env.sandbox.__game = { state: { efir, efirMet: true, roster } };
  env.G.playerUI.setCharacter(hero);
  env.G.playerUI.toggle(true); // buildPanel + render
  env.hero = hero;
  env.mercSheet = mercSheet;
  env.efirSheet = efir;
  return env;
}

// --- Хелперы (дубль tests/spells-any-party.test.js ЧАСТЬ B) ---

function characterPane(env) {
  const cols = findAll(env.body, '.cp-column');
  assert.ok(cols && cols.length >= 1,
    'панель персонажа построена (.cp-column в body)');
  const panes = findAll(cols[0], '.cp-tabpane');
  return panes[0] || null;
}

function panelOf(env) {
  const p = findAll(env.body, '.char-panel')[0];
  assert.ok(p, 'панель .char-panel в body');
  return p;
}

// Клик через ОДИН делегированный слушатель панели.
function clickPanel(env, target) {
  const panel = panelOf(env);
  const clickers = panel.listeners.click || [];
  assert.ok(clickers.length >= 1,
    'делегированный click-обработчик на панели (ОДИН)');
  clickers[0]({ target });
}

// Секция по СВОЕМУ тексту заголовка (.cp-section; строки — дети).
function sectionOf(pane, name) {
  assert.ok(pane, 'character-pane существует');
  return findAll(pane, '.cp-section')
    .find((s) => s.textContent === name) || null;
}

// Полный текст узла (рекурсивно: заголовок + тела) — для
// негативных пинов «текста в секции НЕТ».
function textOf(node) {
  let s = node._text || '';
  for (const ch of node.children || []) s += textOf(ch);
  return s;
}

// Имя заклинания — каталог (data-driven, без хардкода имён):
// G.SpellsData.SPELLS_BY_ID[id].название.
function nameOf(env, id) {
  return env.G.SpellsData.SPELLS_BY_ID[id].название;
}

// --- U-1: ГЕРОЙ — неизученные НЕ видны при наличных источниках ---

test('000231 U-1: страница — ГЕРОЙ (свиток fireball_scroll в инвентаре): в секции «Книга заклинаний» НЕТ неизученных — .cp-availrow = 0, .cp-avail-title = 0, текста «Доступно к изучению» в pane НЕТ; learned intact (2 .cp-itemrow «Искра»/«Заговора» — имена из G.SpellsData, БЕЗ .cp-itemmeta, button === null); источники ЕСТЬ (свиток в инвентаре героя + руна 40 в каталоге) — блок НЕ рендерится; RED: renderAvailBook эмитит .cp-availrow + заголовок', () => {
  const env = makePartyEnv({ heroScroll: 'fireball_scroll' });
  const pane = characterPane(env);
  assert.equal(pane.querySelector('.cp-title').textContent,
    'Флогистон', 'дефолтный активный — герой');
  // Источники ЕСТЬ (краснота — не из-за их отсутствия):
  assert.equal(env.G.totalQty(env.hero, 'fireball_scroll'), 1,
    'источник: свиток в инвентаре ГЕРОЯ (носитель, 000147 D4)');
  assert.ok(env.G.BUILDINGS.some((b) => {
    const op = b && b.особые_параметры;
    return op && typeof op === 'object' &&
      op.эффект && typeof op.эффект === 'object' &&
      Array.isArray(op.эффект.заклинания) &&
      op.эффект.заклинания.includes('chill');
  }), 'источник: руна-постройка (каталог 40) с «Хлад»');
  const bookSec = sectionOf(pane, 'Книга заклинаний');
  assert.ok(bookSec, 'секция «Книга заклинаний» (все kinds, 000145)');
  // learned — БЕЗ ИЗМЕНЕНИЙ (B7: 2 старт-строки, БЕЗ меток):
  const rows = findAll(bookSec, '.cp-itemrow');
  assert.equal(rows.length, 2, 'книга героя — 2 строки (старт)');
  assert.equal(rows[0].querySelector('.cp-itemname').textContent,
    nameOf(env, 'spark'), 'имя из G.SpellsData.SPELLS_BY_ID');
  assert.equal(rows[1].querySelector('.cp-itemname').textContent,
    nameOf(env, 'mend'), 'имя из G.SpellsData.SPELLS_BY_ID');
  for (const r of rows) {
    assert.equal(r.querySelector('.cp-itemmeta'), null,
      'hero — БЕЗ меток (learned-only, как ДО)');
    assert.equal(r.querySelector('button'), null,
      'книга — read-only: кнопок у строк НЕТ');
  }
  // 000231: неизученные НЕ видны:
  assert.equal(findAll(bookSec, '.cp-availrow').length, 0,
    '000231: .cp-availrow = 0 (блок «Доступно к изучению» убран); ' +
    'RED: avail-строки ещё эмитятся (свиток/руна/наставник)');
  assert.equal(findAll(bookSec, '.cp-avail-title').length, 0,
    '000231: заголовка avail-блока НЕТ');
  assert.ok(!textOf(pane).includes('Доступно к изучению'),
    '000231: текста «Доступно к изучению» в pane НЕТ');
  assert.equal(env.errors.length, 0, '0 ошибок: ' + env.errors.join('; '));
});

// --- U-2: НАЁМНЫЙ — то же на втором kind (Рунопись 1) ---

test('000231 U-2: страница — НАЁМНЫЙ (Вольк, Рунопись 1, spells []): НЕТ avail-строк (.cp-availrow = 0, заголовка НЕТ, «Доступно к изучению» в pane НЕТ) при наличных источниках («Хлад» = «руна: доступно» — руна 40 каталога); learned «—» (1 .cp-itemrow) intact; RED: avail-строки наёмного («Хлад» — «руна: доступно», и др.)', () => {
  const env = makePartyEnv({});
  const pane = characterPane(env);
  // Активный — наёмный:
  env.G.playerUI.toggle(true, 'character', 'merc_volk');
  assert.equal(env.errors.length, 0,
    'переключение активного: 0 ошибок: ' + env.errors.join('; '));
  assert.equal(pane.querySelector('.cp-title').textContent, 'Вольк',
    'активный — наёмный (Вольк)');
  const bookSec = sectionOf(pane, 'Книга заклинаний');
  assert.ok(bookSec, 'секция «Книга заклинаний» (все kinds, 000145)');
  // learned — БЕЗ ИЗМЕНЕНИЙ (B7: пустая книга — «—»):
  const rows = findAll(bookSec, '.cp-itemrow');
  assert.equal(rows.length, 1, 'наёмный без spells — 1 строка «—»');
  assert.equal(rows[0].querySelector('.cp-itemname').textContent, '—',
    'пустая книга — строка «—» (как ДО)');
  // 000231: неизученные НЕ видны:
  assert.equal(findAll(bookSec, '.cp-availrow').length, 0,
    '000231: .cp-availrow = 0; RED: avail-строки ещё эмитятся ' +
    '(Рунопись 1 — «Хлад» = «руна: доступно»)');
  assert.equal(findAll(bookSec, '.cp-avail-title').length, 0,
    '000231: заголовка avail-блока НЕТ');
  assert.ok(!textOf(pane).includes('Доступно к изучению'),
    '000231: текста «Доступно к изучению» в pane НЕТ');
  assert.ok(!textOf(bookSec).includes('Хлад'),
    '000231: «Хлад» (руна 40, canLearn ok) НЕВИДИМ на странице');
  assert.equal(env.errors.length, 0, '0 ошибок: ' + env.errors.join('; '));
});

// --- U-3: ЭФИР — learned-only каноника + learned-не-каноник ---

test('000231 U-3: страница — ЭФИР: ДО — .cp-itemrow = G.efir.efirSpellsByLevel(1).length (data-driven), ВСЕ метки «уровень 1», текста «откроется» в секции НЕТ, «Теневой сгусток» в секции НЕТ, .cp-availrow = 0; ПОСЛЕ G.Spells.learn(efirSheet, "chill", "scroll") (t1, INT 3 — Ученик — ok) + re-render — .cp-itemrow = start+1: «Хлад» — .cp-itemrow с меткой «изучено» ПОСЛЕ каноники, button === null; «откроется» всё ещё нет; «Теневой сгусток» всё ещё нет; .cp-availrow = 0; RED: 11 канон. строк («откроется…» × 9) + avail', () => {
  const env = makePartyEnv({});
  const pane = characterPane(env);
  // Активный — Эфир (fresh L1: INT 3 — Ученик, spells = старт):
  env.G.playerUI.toggle(true, 'character', 'efir');
  assert.equal(env.errors.length, 0,
    'переключение на Эфир: 0 ошибок: ' + env.errors.join('; '));
  assert.equal(pane.querySelector('.cp-title').textContent, 'Эфир',
    'активный — Эфир (kind \'efir\')');
  const bookSec = sectionOf(pane, 'Книга заклинаний');
  assert.ok(bookSec, 'секция «Книга заклинаний»');
  // (1) ДО изучения: learned-only каноника (fresh Эфир = старт):
  const start = [...env.G.efir.efirSpellsByLevel(1)];
  const rows0 = findAll(bookSec, '.cp-itemrow');
  assert.equal(rows0.length, start.length,
    '000231: книга Эфира — learned-only (fresh = старт ' +
    'efirSpellsByLevel(1).length — data-driven, хардкода НЕТ); ' +
    'RED: 11 канон. строк (неизученные с «откроется…»-метками)');
  rows0.forEach((r, i) => {
    assert.equal(r.querySelector('.cp-itemname').textContent,
      nameOf(env, start[i]), 'строка ' + i + ' — имя из G.SpellsData');
    assert.equal(r.querySelector('.cp-itemmeta').textContent,
      'уровень 1',
      'строка ' + i + ' — метка изученного «уровень 1» (старт)');
  });
  assert.equal(findAll(bookSec, '.cp-availrow').length, 0,
    '000231: .cp-availrow = 0 (блока нет); RED: avail-строки ' +
    '(не-канонические с источниками) ещё эмитятся');
  assert.ok(!textOf(bookSec).includes('откроется'),
    '000231: текста «откроется на N-м уровне» в секции НЕТ; ' +
    'RED: 9 неизученных канон. строк с этой меткой');
  assert.ok(!textOf(bookSec).includes('Теневой сгусток'),
    '000231: «Теневой сгусток» (руна 40/наставник 19) НЕВИДИМ ' +
    'на странице; RED: avail-строка «руна: нужен ранг школы «Знаток»»');
  // (2) Изучение НЕ-КАНОНИЧЕСКОГО на live-лист Эфира — ТОТ ЖЕ
  //     мутирующий путь, что у обобщённых источников 000147
  //     (useItem 4-й аргумент / applyMentorSpell → S.learn):
  const lr = env.G.Spells.learn(env.efirSheet, 'chill', 'scroll');
  assert.equal(lr.ok, true, 'chill: t1 + INT 3 (Ученик) — ok');
  assert.ok([...env.efirSheet.spells].includes('chill'),
    'learn — мутация live-листа Эфира');
  // (3) Re-render (toggle — renderBook rebuild in place):
  env.G.playerUI.toggle(true, 'character', 'efir');
  assert.equal(env.errors.length, 0,
    're-render: 0 ошибок: ' + env.errors.join('; '));
  const rows = findAll(bookSec, '.cp-itemrow');
  assert.equal(rows.length, start.length + 1,
    '000231: learned-старт + 1 строка выученного не-каноника ' +
    '(learned-only); RED: 11 + 1');
  const byName = (name) => rows.find((r) =>
    r.querySelector('.cp-itemname').textContent === name);
  const learnedChill = byName('Хлад');
  assert.ok(learnedChill,
    'выученное не-каноническое «Хлад» — ВИДИМО в книге ' +
    '(контракт §3: learned-не-каноник НЕ затирается фильтром)');
  assert.equal(rows.indexOf(learnedChill), start.length,
    '«Хлад» — ПОСЛЕ каноники (контракт AP-6B/§3)');
  assert.equal(learnedChill.querySelector('.cp-itemmeta').textContent,
    'изучено', 'метка — «изучено» (уровня авто-разблокировки нет)');
  assert.equal(learnedChill.querySelector('button'), null,
    'read-only: кнопок НЕТ (как у learned-строк)');
  // (4) Отрицания держатся ПОСЛЕ изучения:
  assert.equal(findAll(bookSec, '.cp-availrow').length, 0,
    '000231: .cp-availrow = 0 и после learn (блока нет)');
  assert.ok(!textOf(bookSec).includes('откроется'),
    '000231: «откроется на N-м уровне» всё ещё нет');
  assert.ok(!textOf(bookSec).includes('Теневой сгусток'),
    '000231: «Теневой сгусток» (НЕ изучен) всё ещё НЕВИДИМ');
  assert.equal(env.errors.length, 0, '0 ошибок: ' + env.errors.join('; '));
});

// --- U-4: ЭФИР — 0 learned (мутация live-листа) — D3-плейсхолдер «—» ---
// Правка по итогам ревью: ветка «0 строк после фильтра» (D3, §6
// памяти) была единственным новым кодом 000231 без теста — U-1..U-3
// проходят через fresh-Эфир (старт ≠ ∅) или hero/merc. В игре
// недостижимо (createEfir/restore всегда ⊇ EFIR_SPELL_START) —
// покрываем мутацией live-листа в vm.

test('000231 U-4: страница — ЭФИР: live-лист с spells = [] (мутация; в игре недостижимо) + re-render — ровно 1 .cp-itemrow с .cp-itemname «—» БЕЗ .cp-itemmeta, button === null (D3-плейсхолдер, паттерн renderLearnedBook); .cp-availrow = 0, «откроется» нет; восстановление листа + re-render — старт возвращается (rebuild in place)', () => {
  const env = makePartyEnv({});
  const pane = characterPane(env);
  env.G.playerUI.toggle(true, 'character', 'efir');
  assert.equal(env.errors.length, 0,
    'переключение на Эфир: 0 ошибок: ' + env.errors.join('; '));
  assert.equal(pane.querySelector('.cp-title').textContent, 'Эфир',
    'активный — Эфир (kind \'efir\')');
  const bookSec = sectionOf(pane, 'Книга заклинаний');
  assert.ok(bookSec, 'секция «Книга заклинаний»');
  const start = [...env.efirSheet.spells];
  assert.ok(start.length > 0, 'fresh Эфир — старт непустой');
  // (1) 0 learned (live-мутация — только здесь, в игре недостижимо):
  env.efirSheet.spells = [];
  env.G.playerUI.toggle(true, 'character', 'efir');
  assert.equal(env.errors.length, 0,
    're-render (0 learned): 0 ошибок: ' + env.errors.join('; '));
  const rows = findAll(bookSec, '.cp-itemrow');
  assert.equal(rows.length, 1,
    'D3: 0 строк после фильтра — ОДНА строка-плейсхолдер ' +
    '(без ветки секция была бы пуста)');
  assert.equal(rows[0].querySelector('.cp-itemname').textContent, '—',
    'D3: плейсхолдер — «—» (паттерн renderLearnedBook)');
  assert.equal(rows[0].querySelector('.cp-itemmeta'), null,
    'D3: у плейсхолдера метки НЕТ (как у «—» hero/merc, U-2)');
  assert.equal(rows[0].querySelector('button'), null,
    'D3: read-only — кнопок НЕТ');
  assert.equal(findAll(bookSec, '.cp-availrow').length, 0,
    '000231: .cp-availrow = 0 и при 0 learned');
  assert.ok(!textOf(bookSec).includes('откроется'),
    'D3: «откроется на N-м уровне» нет и при 0 learned');
  // (2) Восстановление live-листа + re-render:
  env.efirSheet.spells = start;
  env.G.playerUI.toggle(true, 'character', 'efir');
  assert.equal(env.errors.length, 0,
    're-render (восстановлено): 0 ошибок: ' + env.errors.join('; '));
  const rows2 = findAll(bookSec, '.cp-itemrow');
  assert.equal(rows2.length, start.length,
    'D3: после восстановления — старт возвращается (rebuild in place)');
  rows2.forEach((r, i) => {
    assert.equal(r.querySelector('.cp-itemname').textContent,
      nameOf(env, start[i]), 'строка ' + i + ' — старт (G.SpellsData)');
    assert.equal(r.querySelector('.cp-itemmeta').textContent, 'уровень 1',
      'строка ' + i + ' — метка «уровень 1» (старт)');
  });
  assert.equal(env.errors.length, 0, '0 ошибок: ' + env.errors.join('; '));
});

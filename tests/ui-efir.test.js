// Задача 000116 (подзадача 000035): вкладка «Эфир» в панели персонажа —
// src/ui-tab-efir.js (UMD, саморегистрирующаяся, механизм 000130) +
// переход из строки Эфира панели «Отряд» (000086, data-атрибут +
// click-ветка — строка НЕ переделывается).
//
// Слой: ОТОБРАЖЕНИЕ прокачки Эфира (данные — src/efir.js, 000111;
// порог — G.xpForNext, src/player.js):
//   * вкладка { column:0, id:'efir', label:'Эфир' } — ПОСЛЕДНЯЯ (4-я) в
//     левом столбце (контракт memory/000116-efir-tab.md §4);
//   * строка «Уровень N  |  Опыт X/xpForNext(N)» + xp-бар .squad-xp;
//   * «Атрибуты» — 5 строк = G.efir.efirStats(level) (Л1: 3/3/3/16/11);
//   * «Навыки» — таблица пула (G.efir.EFIR_SKILLS, порядок зависимый):
//     .cp-level «lvl (bank/need)» (need = G.efir.efirSkillXpForNext;
//     bank = e.skillXp — при {} — просто «lvl», паттерн 000041),
//     .cp-req — requires-цепочки и «потолок практикой: <ИмЯ> <атт>×2
//     — растёт с уровнем Эфира» (potолок = G.efir.efirSkillCap =
//     основной атрибут навыка × 2);
//   * «Книга заклинаний» — e.spells (имена G.SpellsData) + «с уровня N»;
//   * «Открытия» — СТАТИЧЕСКАЯ таблица G.efir.EFIR_SPELL_UNLOCKS (8
//     строк «уровень N»);
//   * «Вдох Эфира» — ВСЕГДА рендерится: данные 000113 (ленивый read
//     G.efir.EFIR_BREATH) или статичные строки SPEC (000113 не
//     смержена — фолбэк);
//   * live-данные — ЛЕНИВО rootRef.__game.state.efir при render
//     (зарезервированная точка main.js «для 000086/000116», контракт
//     000086 §5); мутация live-объекта + render() — новые значения в
//     ТЕХ ЖЕ узлах (in place); деградация (efir = null / __game нет) —
//     ТИХО: заглушка «Данные Эфира недоступны», xp-бар скрыт, 0
//     console.error;
//   * панель НЕ вызывает saveNow (литерал в модуле запрещён; сейв —
//     только main.js) — каталожный сканер ui-panel подхватит файл сам.
//
// КРАСНЫЕ (падают на текущем коде, зелёные после реализации):
//   * E1–E10 — модуля src/ui-tab-efir.js НЕТ (запись вкладки/строки/
//     перехода отсутствуют — осмысленно: «нет модуля/символа», цепочка
//     грузится чисто);
//   * E11 — файла src/ui-tab-efir.js нет на диске.
//
// Стаб — ДУБЛЬ tests/ui-skills.test.js (makeEl/findAll/closest/
// dataset/style/listeners, textContent сбрасывает children) +
// поддержка селекторов «тег[атрибут]»/«тег[атрибут=значение]» в
// matchesSel (ДУБЛЬ tests/squad-panel.test.js — ОБЯЗАТЕЛЬНО:
// click-ветка перехода использует e.target.closest('div[data-efirtab]'),
// а существующая — 'button[data-squadact]'; голый [attr] стабы не
// понимают). Дублирование стабов принято (000086/000130).
//
// ЧAIN — ДИНАМИЧЕСКИЙ из index.html до ui.js включительно (паттерн
// CHAIN_000130, tests/ui-panel.test.js L1684): RED-фаза — тега
// src/ui-tab-efir.js нет → цепочка грузится ШТАТНО (реестр 6), тесты
// падают ПО СИМВОЛУ, НЕ ENOENT/SyntaxError; GREEN-фаза — тег
// подхватывается САМ, лоадер МЕЖДУ ФАЗАМИ не правится. В цепочке уже
// есть companions.js/efir.js/spells-data.js/skills-data.js/player.js —
// squad-часть (E9) работает в той же песочнице.
//
// Данные — sandbox.__game = { state: { efir: <live-объект> } } (инжект
// ДО openPanel; main.js в цепочке нет — точку ставит тест). Live-
// обновление (E8) — МУТАЦИЯ того же объекта + G.playerUI.render().
//
// Cross-realm (vm): пины — примитивы/текст/длина (правило 000082);
// deepStrictEqual на объекты песочницы — НЕТ.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const page = () => fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// --- Минимальный DOM-стаб с деревом (дубль tests/ui-skills.test.js;
// matchesSel — дубль tests/squad-panel.test.js с тег[attr]) ---

function matchesSel(el, sel) {
  // 'тег[атрибут]' / 'тег[атрибут=значение]' (делегированные клики:
  // e.target.closest('button[data-squadact]') и 'div[data-efirtab]'),
  // '.класс', имя тега.
  const m = /^([a-zA-Z][\w-]*)\[([\w-]+)(?:=([^\]]+))?\]$/.exec(sel);
  if (m) {
    if (String(el.tagName || '').toLowerCase() !== m[1].toLowerCase()) {
      return false;
    }
    // Стаб хранит атрибуты dataset БЕЗ префикса 'data-' (ui.js пишет
    // row.dataset.efirtab напрямую). Проверяем оба варианта ключа.
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
  // пересобирает секции in place — тела обновляются, НЕ строятся).
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

// ДИНАМИЧЕСКИЙ CHAIN: ВСЕ <script src> index.html до ui.js включительно
// (паттерн CHAIN_000130). GREEN-фаза: тег src/ui-tab-efir.js
// подхватится САМ (позиция тега = позиция вкладки в столбце).
const CHAIN = (() => {
  const all = Array.from(
    page().matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
    .map((p) => p.replace(/^src\//, ''));
  const i = all.indexOf('ui.js');
  assert.ok(i >= 0, 'ui.js подключён в index.html');
  return all.slice(0, i + 1);
})();

// Загрузка цепочки в vm-песочницу. Возвращает { G, body, errors,
// sandbox } (sandbox — для инжекта __game ДО openPanel).
function loadEfirUi() {
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

// Открыть панель персонажа (setCharacter + toggle(true) → buildPanel +
// render). Ошибки загрузки (битый порядок) — сразу фейл.
function openPanel(env, c) {
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  assert.ok(env.G.playerUI,
    'Game.playerUI создан (controls.js загружен ДО ui.js)');
  env.G.playerUI.setCharacter(c);
  env.G.playerUI.toggle(true);
}

// Запись вкладки «Эфир» в реестре — ОСМЫСЛЕННЫЙ красный (модуль
// src/ui-tab-efir.js ещё не существует; цепочка грузится чисто).
function efirRec(env) {
  const reg = env.G.uiTabs;
  assert.ok(reg && typeof reg.get === 'function',
    'Game.uiTabs — реестр вкладок (000130)');
  const rec = reg.get('efir');
  assert.ok(rec,
    'вкладка «Эфир» зарегистрирована (src/ui-tab-efir.js, задача 000116)');
  return rec;
}

// Левый столбец панели (первый .cp-column).
function leftColumn(env) {
  const cols = findAll(env.body, '.cp-column');
  assert.ok(cols && cols.length >= 1,
    'панель персонажа построена (.cp-column в body)');
  return cols[0];
}

// Pane вкладки «Эфир» — последняя (4-я) .cp-tabpane левом столбце
// (контракт: позиция = ПОСЛЕДНЯЯ в левом столбце).
function efirPane(env) {
  const panes = findAll(leftColumn(env), '.cp-tabpane');
  return panes.length ? panes[panes.length - 1] : null;
}

// Секция по заголовку (заголовок — СОБСТВЕННЫЙ текст .cp-section;
// строки — её дети).
function sectionOf(pane, name) {
  assert.ok(pane, 'pane вкладки «Эфир» существует (.cp-tabpane)');
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

// --- E1: вкладка существует ---

test('000116 E1: вкладка «Эфир» существует — запись {id, label, column:0} в Game.uiTabs + .cp-tab 4-я в левом столбце + .cp-tabpane; 0 ошибок', () => {
  const env = loadEfirUi();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  const rec = efirRec(env);
  assert.equal(rec.id, 'efir', 'id «efir»');
  assert.equal(rec.label, 'Эфир', 'label «Эфир» (побайтово, ТЗ)');
  assert.equal(rec.column, 0, 'левый столбец (ТЗ)');
  assert.equal(typeof rec.build, 'function', 'build(pane, ctx) — функция');
  assert.equal(typeof rec.render, 'function',
    'render(ctx) — функция (live-обновление)');

  openPanel(env, env.G.createCharacter());
  const col0 = leftColumn(env);
  const tabs = findAll(col0, '.cp-tab');
  assert.equal(tabs.length, 4,
    'левый столбец — 4 вкладки (Персонаж/Инвентарь/Настройки/Эфир, 000116): '
    + tabs.map((t) => t.dataset.tabid).join(','));
  const btn = tabs.find((t) => t.dataset.tabid === 'efir');
  assert.ok(btn, 'кнопка «Эфир» (data-tabid=efir) в левом столбце');
  assert.equal(btn.textContent, 'Эфир', 'подпись кнопки (побайтово)');
  assert.equal(btn.dataset.col, '0', 'кнопка в левом столбце (col=0)');
  assert.equal(tabs[3], btn, '«Эфир» — последняя (4-я) в левом столбце');
  const panes = findAll(col0, '.cp-tabpane');
  assert.equal(panes.length, 4, 'левый столбец — 4 .cp-tabpane');
});

// --- E2: строка уровня/XP ---

test('000116 E2: строка «Уровень N  |  Опыт X/xpForNext(N)» (.cp-stats) + xp-бар .squad-xp (xp 0 → 0%)', () => {
  const env = loadEfirUi();
  const e = env.G.efir.createEfir(); // level 1, xp 0
  env.sandbox.__game = { state: { efir: e } };
  efirRec(env);
  openPanel(env, env.G.createCharacter());
  const pane = efirPane(env);
  const title = pane.querySelector('.cp-title');
  assert.ok(title, 'заголовок (.cp-title) в pane');
  assert.equal(title.textContent, 'Эфир', 'заголовок «Эфир»');
  const xp = pane.querySelector('.cp-stats');
  assert.ok(xp, 'строка уровня/XP (.cp-stats)');
  assert.equal(xp.textContent,
    'Уровень ' + e.level + '  |  Опыт ' + e.xp + '/'
      + env.G.xpForNext(e.level),
    '«Уровень N  |  Опыт X/Y», Y = G.xpForNext(N) (идиома 000041, ' +
    'ДВА пробела по бокам |; createEfir: «Уровень 1  |  Опыт 0/50»)');
  const bar = pane.querySelector('.squad-xp');
  assert.ok(bar, 'xp-бар (.squad-xp) в pane');
  const fill = bar.querySelector('.squad-xp-fill');
  assert.ok(fill, 'заполнение xp-бара (.squad-xp-fill)');
  assert.equal(fill.style.width, '0%', 'xp 0 → width 0%');
});

// --- E3: атрибуты ---

test('000116 E3: «Атрибуты» — 5 строк = G.efir.efirStats(level) (L1: 3/3/3/16/11; live-мутация L5: 5/5/5/20/15)', () => {
  const env = loadEfirUi();
  const e = env.G.efir.createEfir();
  env.sandbox.__game = { state: { efir: e } };
  efirRec(env);
  openPanel(env, env.G.createCharacter());
  const pane = efirPane(env);
  const sec = sectionOf(pane, 'Атрибуты');
  assert.ok(sec, 'секция «Атрибуты»');
  const rows = findAll(sec, '.cp-itemrow');
  assert.equal(rows.length, 5,
    '5 строк (Интеллект/Мудрость/Телосложение/maxHP/maxMP)');
  const names = rows.map((r) => r.querySelector('.cp-itemname').textContent);
  assert.deepEqual(names,
    ['Интеллект', 'Мудрость', 'Телосложение', 'maxHP', 'maxMP'],
    'имён атрибутов (имена из G.PRIMARY_SKILLS + maxHP/maxMP)');
  const st1 = env.G.efir.efirStats(1);
  assert.deepEqual(rows.map((r) => r.querySelector('.cp-itemmeta').textContent),
    [String(st1.intelligence), String(st1.wisdom),
     String(st1.constitution), String(st1.maxHP), String(st1.maxMP)],
    'значения = G.efir.efirStats(level)');
  assert.deepEqual(rows.map((r) => r.querySelector('.cp-itemmeta').textContent),
    ['3', '3', '3', '16', '11'], 'L1-база (пин)');

  // live: level 5 (мутация того же объекта + render) — ТЕ ЖЕ узлы.
  e.level = 5;
  env.G.playerUI.render();
  const st5 = env.G.efir.efirStats(5);
  assert.deepEqual(rows.map((r) => r.querySelector('.cp-itemmeta').textContent),
    [String(st5.intelligence), String(st5.wisdom),
     String(st5.constitution), String(st5.maxHP), String(st5.maxMP)],
    'L5 = G.efir.efirStats(5) (in place: узлы строк не пересоздаются)');
  assert.deepEqual(rows.map((r) => r.querySelector('.cp-itemmeta').textContent),
    ['5', '5', '5', '20', '15'], 'L5 (пин)');
});

// --- E4: пул навыков ---

test('000116 E4: «Навыки» — 4 строки по G.efir.EFIR_SKILLS; bank=0 → «0» БЕЗ скобок (skillXp = {}, 000117 нет — нормальная деградация); bank>0 → «lvl (bank/need)»; requires «Повелитель огня 5»/«Зоркость 5»', () => {
  const env = loadEfirUi();
  const e = env.G.efir.createEfir(); // skillXp = {}, skills = {}
  env.sandbox.__game = { state: { efir: e } };
  efirRec(env);
  openPanel(env, env.G.createCharacter());
  const pane = efirPane(env);
  const sec = sectionOf(pane, 'Навыки');
  assert.ok(sec, 'секция «Навыки»');
  const table = sec.querySelector('.cp-table');
  assert.ok(table, 'таблица пула (.cp-table)');
  const trs = findAll(table, 'tr');
  const E = env.G.efir;
  assert.equal(trs.length, 4, '4 строки (пул Эфира, 000111)');
  const rowOf = {};
  E.EFIR_SKILLS.forEach((d, i) => {
    rowOf[d.id] = {
      name: trs[i].querySelector('.cp-name'),
      req: trs[i].querySelector('.cp-req'),
      lv: trs[i].querySelector('.cp-level'),
      tip: trs[i].querySelector('.cp-tip'),
    };
    assert.ok(rowOf[d.id].name, d.id + ': ячейка .cp-name');
    assert.ok(rowOf[d.id].req, d.id + ': ячейка .cp-req');
    assert.ok(rowOf[d.id].lv, d.id + ': ячейка .cp-level');
    assert.ok(rowOf[d.id].tip, d.id + ': тултип .cp-tip (ячейка .cp-tipcell)');
    assert.equal(rowOf[d.id].name.textContent,
      env.G.SECONDARY_SKILLS[d.id].name,
      d.id + ' — имя из каталога G.SECONDARY_SKILLS');
  });
  // skillXp = {} — все «0», без скобок (нормальная деградация).
  for (const d of E.EFIR_SKILLS) {
    assert.equal(rowOf[d.id].lv.textContent, '0',
      d.id + ': bank 0 → просто «0», без «(0/15)» (паттерн 000041)');
  }
  // requires-цепочки (lvl = 0): icelord/precog — текст требования;
  // без requires — пусто.
  assert.equal(rowOf.icelord.req.textContent, 'Повелитель огня 5',
    'icelord — «Повелитель огня 5» (requiresText, имя из каталога)');
  assert.equal(rowOf.precog.req.textContent, 'Зоркость 5',
    'precog — «Зоркость 5»');
  assert.equal(rowOf.firelord.req.textContent, '', 'firelord — без требует');
  assert.equal(rowOf.perception.req.textContent, '',
    'perception — без требует');

  // bank > 0: «3 (12/60)», need = G.efir.efirSkillXpForNext(3).
  e.skillXp.firelord = 12;
  e.skills.firelord = 3;
  env.G.playerUI.render();
  assert.equal(rowOf.firelord.lv.textContent,
    '3 (12/' + E.efirSkillXpForNext(3) + ')',
    '«lvl (bank/need)», need = efirSkillXpForNext(lvl) = 15·(lvl+1)');
});

// --- E5: потолок ---

test('000116 E5: потолок (lvl = G.efir.efirSkillCap = атрибут×2) — req «потолок практикой: Интеллект 3×2 — растёт с уровнем Эфира»; уровень БЕЗ скобок даже при bank>0', () => {
  const env = loadEfirUi();
  const e = env.G.efir.createEfir();
  env.sandbox.__game = { state: { efir: e } };
  efirRec(env);
  openPanel(env, env.G.createCharacter());
  const pane = efirPane(env);
  const table = sectionOf(pane, 'Навыки').querySelector('.cp-table');
  const trs = findAll(table, 'tr');
  const E = env.G.efir;
  // firelord — первый в EFIR_SKILLS (primary = intelligence).
  const lv = trs[0].querySelector('.cp-level');
  const req = trs[0].querySelector('.cp-req');
  const cap = E.efirSkillCap(e, 'firelord');
  assert.equal(cap, 6, 'сверка API: потолок L1 = Интеллект 3×2 = 6');
  e.skills.firelord = cap; // на потолке
  e.skillXp.firelord = 5;  // bank > 0 — но на потолке скобок НЕТ
  env.G.playerUI.render();
  assert.equal(lv.textContent, '6',
    'на потолке — просто уровень (без «(5/105)» — деградация 000041)');
  assert.equal(req.textContent,
    'потолок практикой: Интеллект 3×2 — растёт с уровнем Эфира',
    'пометка потолка: идиома 000041; хвост «дальше растёт только ' +
    'очками и книгами» НЕПРИМЕНИМ (у Эфира v1 нет очков/книг навыков)');
});

// --- E6: книга + открытия ---

test('000116 E6: «Книга заклинаний» — e.spells: имена G.SpellsData + «с уровня N» (L1: Искра/Заговора; L5: +Свет исцеления «с уровня 5»); «Открытия» — 8 строк «уровень N» (таблица EFIR_SPELL_UNLOCKS, порядок канонический)', () => {
  const env = loadEfirUi();
  const e = env.G.efir.createEfir(); // spells = ['spark', 'mend']
  env.sandbox.__game = { state: { efir: e } };
  efirRec(env);
  openPanel(env, env.G.createCharacter());
  const pane = efirPane(env);
  const E = env.G.efir;

  const bookSec = sectionOf(pane, 'Книга заклинаний');
  assert.ok(bookSec, 'секция «Книга заклинаний»');
  const book = bookSec.querySelector('.cp-items');
  assert.ok(book, 'тело книги (.cp-items)');
  const rows1 = findAll(book, '.cp-itemrow');
  assert.equal(rows1.length, 2, 'L1 — старт [spark, mend]');
  assert.equal(rows1[0].querySelector('.cp-itemname').textContent, 'Искра');
  assert.equal(rows1[0].querySelector('.cp-itemmeta').textContent,
    'с уровня 1', 'старт — «с уровня 1»');
  assert.equal(rows1[1].querySelector('.cp-itemname').textContent, 'Заговора');
  assert.equal(rows1[1].querySelector('.cp-itemmeta').textContent,
    'с уровня 1');

  // live: level 5 + книга таблицы уровня (мутация + render).
  e.level = 5;
  e.spells = E.efirSpellsByLevel(5); // [spark, mend, light_heal]
  env.G.playerUI.render();
  const rows5 = findAll(book, '.cp-itemrow');
  assert.equal(rows5.length, 3, 'L5 — старт + light_heal (in place)');
  const lh = rows5.find((r) =>
    r.querySelector('.cp-itemname').textContent === 'Свет исцеления');
  assert.ok(lh, '«Свет исцеление» в книге L5');
  assert.equal(lh.querySelector('.cp-itemmeta').textContent, 'с уровня 5',
    'unlock — порог таблицы (light_heal → 5)');

  // «Открытия» — СТАТИЧЕСКАЯ таблица (build, 8 строк).
  const unSec = sectionOf(pane, 'Открытия');
  assert.ok(unSec, 'секция «Открытия»');
  const un = unSec.querySelector('.cp-items');
  assert.ok(un, 'тело открытий (.cp-items)');
  const unRows = findAll(un, '.cp-itemrow');
  assert.equal(unRows.length, 8, '8 строк открытий (таблица 000111)');
  E.EFIR_SPELL_UNLOCKS.forEach(([lvl, id], i) => {
    const s = env.G.SpellsData.SPELLS_BY_ID[id];
    assert.equal(unRows[i].querySelector('.cp-itemname').textContent,
      s.название, id + ' — имя из G.SpellsData');
    assert.equal(unRows[i].querySelector('.cp-itemmeta').textContent,
      'уровень ' + lvl, id + ' — «уровень N» (порядок канонический)');
  });
});

// --- E7: «Вдох Эфира» ---

test('000116 E7: «Вдох Эфира» — секция ВСЕГДА; текст: «1 раз за бой», «40%», «20 маны», «round(10 + 0.8 * Мудрость)», «×0.8», «2 хода»; 0 ошибок (000113 не смержена — статичный SPEC-фолбэк)', () => {
  const env = loadEfirUi();
  const e = env.G.efir.createEfir();
  env.sandbox.__game = { state: { efir: e } };
  efirRec(env);
  openPanel(env, env.G.createCharacter());
  const pane = efirPane(env);
  const sec = sectionOf(pane, 'Вдох Эфира');
  assert.ok(sec, 'секция «Вдох Эфира» (ТЗ: описание обязательно)');
  const t = textOf(sec);
  assert.ok(t.includes('1 раз за бой'), '«1 раз за бой»: ' + t);
  assert.ok(t.includes('40%'), 'триггер «игрок ≤ 40% HP»: ' + t);
  assert.ok(t.includes('20 маны'), '«расходует 20 маны»: ' + t);
  assert.ok(t.includes('round(10 + 0.8 * Мудрость)')
    || t.includes('0.8 * Мудрость'),
    'формула лечения союзных: ' + t);
  assert.ok(t.includes('×0.8'), 'ослабление врагов «урон ×0.8»: ' + t);
  assert.ok(t.includes('2 хода'), 'длительность «на 2 хода»: ' + t);
  assert.equal(env.errors.length, 0,
    '0 ошибок (000113 нет — фолбэк без console.error)');
});

// --- E8: live-обновление (in place) ---

test('000116 E8: live-обновление — мутация live-объекта (__game.state.efir) + G.playerUI.render() → новые значения в ТЕХ ЖЕ узлах: XP «…/260», атт. 4, maxHP 18, firelord «2 (8/45)»', () => {
  const env = loadEfirUi();
  const e = env.G.efir.createEfir();
  env.sandbox.__game = { state: { efir: e } };
  efirRec(env);
  openPanel(env, env.G.createCharacter());
  const pane = efirPane(env);
  const E = env.G.efir;
  // Ссылки на ТЕ ЖЕ узлы (in-place-контракт: render не пересобирает).
  const xpNode = pane.querySelector('.cp-stats');
  const attrRows = findAll(sectionOf(pane, 'Атрибуты'), '.cp-itemrow');
  const table = sectionOf(pane, 'Навыки').querySelector('.cp-table');
  const fireLv = findAll(table, 'tr')[0].querySelector('.cp-level');

  e.level = 3;
  e.xp = 100;
  e.skillXp.firelord = 8;
  e.skills.firelord = 2;
  env.G.playerUI.render();

  assert.equal(xpNode.textContent,
    'Уровень 3  |  Опыт 100/' + env.G.xpForNext(3),
    'XP-строка: «Уровень 3  |  Опыт 100/260» (xpForNext(3)); тот же узел');
  const st3 = E.efirStats(3);
  assert.equal(attrRows[0].querySelector('.cp-itemmeta').textContent,
    String(st3.intelligence), 'Интеллект L3 = 4 (in place)');
  assert.equal(attrRows[3].querySelector('.cp-itemmeta').textContent,
    String(st3.maxHP), 'maxHP L3 = 18 (in place)');
  assert.equal(fireLv.textContent,
    '2 (8/' + E.efirSkillXpForNext(2) + ')',
    'firelord «2 (8/45)» (need = 15·(2+1); in place: тот же tr)');
});

// --- E9: переход из панели «Отряд» (стаб 000086) ---

test('000116 E9: переход — клик по строке «Эфир» панели «Отряд»: «Отряд» закрывается, панель персонажа ОТКРЫТА на вкладке «Эфир» (единственный видимый pane в левом столбце); onChange НЕ вызван; строка Эфира побайтово (регрессия P3: без button[data-squadact])', () => {
  const env = loadEfirUi();
  const E = env.G.efir;
  const e = E.createEfir();
  env.sandbox.__game = { state: { efir: e } };
  // Персонаж ДО (playerUI.toggle требует character — как в игре,
  // main.js L225). efirRec — ПОСЛЕ клика: красный E9 — на отсутствии
  // САМОГО ПЕРЕХОДА (ветки в click панели «Отряд»), запись вкладки —
  // отдельный красный E1.
  env.G.playerUI.setCharacter(env.G.createCharacter());
  let saves = 0;
  env.G.squadUI.init({ roster: [], efir: e,
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

  const char = findAll(env.body, '.char-panel')[0];
  assert.ok(char && char.style.display === 'flex',
    'переход (000116): клик по строке «Эфир» открыл панель персонажа');
  assert.equal(env.G.playerUI.isOpen(), true, 'playerUI.isOpen() true');
  efirRec(env);
  assert.equal(squad.style.display, 'none',
    '«Отряд» закрыт (toggle(false) — полная замена поверхности)');
  assert.equal(env.G.squadUI.isOpen(), false, 'squadUI.isOpen() false');
  // Вкладка «Эфир» АКТИВНА: единственный видимый pane в левом
  // столбце — наш (4-й).
  const panes = findAll(leftColumn(env), '.cp-tabpane');
  assert.equal(panes.length, 4, 'левый столбец — 4 pane');
  const visible = panes.filter((p) => p.style.display !== 'none');
  assert.equal(visible.length, 1,
    'ровно одна активная вкладка в левом столбце');
  assert.equal(visible[0], panes[3], 'активна — «Эфир» (4-я, 000116)');
  assert.equal(saves, 0,
    'клик — без мутаций состояния: onChange (сейв в main.js) НЕ вызван');
  assert.equal(env.errors.length, 0,
    'ошибок нет: ' + env.errors.join('; '));
});

// --- E10: деградация (тихая) ---

test('000116 E10: деградация — efir = null / __game не задан: без краха, 0 console.error, «Данные Эфира недоступны», xp-бар скрыт, «Вдох Эфира» на месте', () => {
  // (a) __game.state.efir = null.
  {
    const env = loadEfirUi();
    env.sandbox.__game = { state: { efir: null } };
    efirRec(env);
    openPanel(env, env.G.createCharacter());
    const pane = efirPane(env);
    assert.ok(textOf(pane).includes('Данные Эфира недоступны'),
      'строка-заглушка (аналог «Журнал квестов недоступен.», 000100): '
      + textOf(pane));
    const bar = pane.querySelector('.squad-xp');
    assert.ok(bar, 'xp-бар (.squad-xp) на месте (скрыт)');
    assert.equal(bar.style.display, 'none', 'xp-бар скрыт (display none)');
    const breath = sectionOf(pane, 'Вдох Эфира');
    assert.ok(breath, '«Вдох Эфира» рендерится (статичное описание)');
    assert.ok(textOf(breath).includes('1 раз за бой'),
      'текст «Вдоха» — в деградации тоже: ' + textOf(breath));
    assert.equal(env.errors.length, 0,
      'ТИХАЯ деградация — 0 console.error: ' + env.errors.join('; '));
  }
  // (b) __game не задан вовсе (vm-песочница без main.js).
  {
    const env = loadEfirUi();
    efirRec(env);
    openPanel(env, env.G.createCharacter());
    const pane = efirPane(env);
    assert.ok(textOf(pane).includes('Данные Эфира недоступны'),
      '__game отсутствует — тоже заглушка (без краха)');
    assert.equal(env.errors.length, 0,
      '__game отсутствует — тишина (0 console.error)');
  }
});

// --- E11: node — чистый UMD ---

test('000116 E11: node — require() src/ui-tab-efir.js чист: m.tab = {id, label, column:0, build, render}, game-экспорта нет; в источнике 0 «require(» и 0 «saveNow»', () => {
  const p = path.join(ROOT, 'src', 'ui-tab-efir.js');
  assert.ok(fs.existsSync(p),
    'src/ui-tab-efir.js не существует (задача 000116)');
  // Чистота UMD проверяется самим require: DOM при загрузке в node —
  // краш; взаимные require — тоже.
  const m = require(p);
  assert.ok(m && m.tab, 'm.tab — определение вкладки');
  assert.equal(m.tab.id, 'efir', 'id «efir»');
  assert.equal(m.tab.label, 'Эфир', 'label «Эфир»');
  assert.equal(m.tab.column, 0, 'column 0 (левый столбец)');
  assert.equal(typeof m.tab.build, 'function', 'build(pane, ctx)');
  assert.equal(typeof m.tab.render, 'function', 'render(ctx)');
  assert.equal(m.game, undefined,
    'game-экспорта нет (модуль без flat-функций)');
  const s = fs.readFileSync(p, 'utf8');
  assert.doesNotMatch(s, /require\(/,
    'чистый UMD: в источнике 0 «require(» (прецеденты 000038/000053)');
  assert.doesNotMatch(s, /saveNow/,
    'литерал saveNow запрещён (сейв — только main.js; паттерн ' +
    '000051/000101; каталожный сканер ui-panel подхватит файл)');
});

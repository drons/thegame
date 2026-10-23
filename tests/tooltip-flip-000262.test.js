// Задача 000262: тултипы у верхнего края панелей инвентаря/персонажа/
// снаряжения полностью видны (flip вниз / clamp). ТЗ:
// tasks/pending/000262.md. Контракты: memory/000262-tip-flip-clamp.md
// (раздел «Контракты для RED-стадии» — точные символы/геометрии).
//
// Механизм (зафиксирован на стадии Проектирования, memory §Решения):
// JS-замер rect в обработчиках + CSS-класс flip. Показ/скрытие ОСТАЁТСЯ
// чистым CSS (:hover/:focus-within — правила НЕ трогаются); JS только
// решает, есть ли класс cp-tip--down на .cp-tip (и clamp-margin в
// дегенеративном случае «ни «над», ни «под» не влезают»).
//
//   * Класс flip — cp-tip--down ТОЛЬКО на узле .cp-tip (НЕ на строке —
//     RAR-G ui.test.js: className ряда без rarity побайтово «cp-itemrow»).
//     До flip: className === 'cp-tip'; после: 'cp-tip cp-tip--down'.
//   * Слушатели (делегированные, паттерн click-ветки ui.js:182-242):
//     panel mouseover + focusin (owner = closest('.cp-itemrow') ||
//     closest('tr')), scroll на КАЖДЫЙ .cp-tabpane, window resize
//     (typeof-guard). click — ОДИН (не растёт).
//   * Граница видимости = .cp-tabpane ∩ вьюпорт: vTop = max(0,
//     pane.top), vBottom = min(innerHeight, pane.bottom).
//   * Приоритет: «над» влезает → «над» (бит-в-бит, класс/марджин не
//     ставятся); выше не влезает, ниже влезает → flip; обе нет → flip
//     + clamp: tip.style.marginTop = (vBottom − ownerBottom − 4 − H)px.
//   * Инлайн-стили — ТОЛЬКО clamp (marginTop), очистка no-op, если уже
//     пусто: строка в СЕРЕДИНЕ после hover — style ПОЛНОСТЬЮ ПУСТ.
//   * CSS: ПРАВИЛО .char-panel .cp-tip.cp-tip--down { bottom: auto;
//     top: calc(100% + 4px); } — ОБА янкоря (.cp-tipcell .cp-tip и
//     .cp-itemrow > .cp-tip); базовое правило .cp-tip и правила показа
//     :hover/:focus-within — НЕ ТРОГАЮТСЯ (бит-в-бит).
//
// КРАСНЫЕ (падут на ТЕКУЩЕМ коде — осмысленно: flip-логики НЕТ:
// слушателей mouseover/focusin/scroll на панели нет, CSS-правила flip
// нет, clamp-механизма нет; НЕ синтаксическая ошибка):
//   * TF-1 — строка ПРЕДМЕТА у верхнего края: hover → .cp-tip--down на
//     .cp-tip (flip вниз), style пуст (ниже влезает) + структурные пины
//     слушателей (mouseover/focusin === 1, scroll на каждом pane === 1,
//     click не растёт, window resize === 1).
//   * TF-2 — строка НАВЫКА (третий янкор td.cp-tipcell) у верхнего
//     края: mouseover по tr + focusin по .cp-btn внутри tr (owner =
//     closest('tr')) → flip-класс.
//   * TF-3 — пере-расчёт по СКРОЛЛУ .cp-tabpane: flip у верхнего края,
//     затем строка в середине → класс СНЯТ (над влезает — бит-в-бит),
//     style пуст.
//   * TF-4 — дегенератив (обе позиции не влезают) → flip + CLAMP:
//     style.marginTop === '-29px', эффективный rect ⊆ pane∩viewport.
//   * TF-5 — CSS index.html: правило flip (оба свойства) + базовое
//     правило .cp-tip побайтово на месте + :hover/:focus-within
//     не тронуты.
//
// ЗЕЛЁНЫЕ с первого запуска (гварды, в red-счёт НЕ входят; обязаны
// пройти и до, и после фикса):
//   * TF-6 — строка в СЕРЕДИНЕ: hover → класса flip НЕТ, style ПОЛНОСТЬЮ
//     ПУСТ (бит-в-бит «над строкой»; пин против over-flip).
//   * TF-7 — деградация: rect TIP'а БЕЗ height (стаб по умолчанию
//     {left:0, top:0} — старые стабы) → mouseover/scroll — исключений
//     нет, класс не меняется, style пуст (гард H > 0 → no-op).
//
// Механика: vm-песочница, ДИНАМИЧЕСКИЙ CHAIN (ВСЕ <script src>
// index.html до src/ui.js включительно — паттерн
// tests/craft-scroll-use.test.js: новый script-тег подхватился бы сам,
// но в задаче НОВЫХ МОДУЛЕЙ/ТЕГОВ НЕТ — всё в IIFE src/ui.js).
// СОБСТВЕННЫЙ DOM-стаб с деревом (дублирование — конвенция проекта,
// у тестов нет общего test-lib) + ДВА расширения под flip:
//   (а) makeEl.getBoundingClientRect() читает el._rect (тест подставляет
//       геометрию строки/TIP'а/пани; без _rect — {left:0, top:0} —
//       без height → гард реализации → no-op, TF-7);
//   (б) sandbox window с innerWidth/innerHeight = 1280×720 (как
//       tests/main-visuals.test.js) и записью слушателей.
// Синтетика событий — прямые вызовы зарегистрированных слушателей
// (panel.listeners.<t>[0]({ target }) — паттерн click-тестов
// tests/ui-panel.test.js).
//
// Геометрические фикстуры (по memory «Контракты для RED-стадии»;
// решательные поля — owner.top/bottom, tip.height, pane.top/bottom,
// innerHeight; у TIP'а top/bottom приведены к само-состоянию
// top + height = bottom):
//   * верхний край (flip, ниже влезает): owner {60, 85},
//     tip H 140 (предмет) / H 76 (навык), pane {90, 600}, vh 720.
//   * середина (над влезает): owner {300, 325}, tip {220, 296},
//     H 76, pane {90, 600}: 300 − 76 − 4 = 220 ≥ 90.
//   * дегенератив (обе нет, clamp): owner {55, 85}, tip H 340,
//     pane {50, 400}, vh 720: 55−344 < 50; 85+4+340 = 429 > 400;
//     marginTop = 400 − 85 − 4 − 340 = −29px; эффективный
//     [89−29, 89−29+340] = [60, 400] ⊆ [50, 400].
//
// НОЛЬ изменений существующих тестов/стабов: фиксаторы домена
// (tests/ui-panel.test.js, tests/ui.test.js, tests/craft-scroll-use.
// test.js, tests/main-visuals.test.js, tests/ui-skills.test.js) —
// обязаны пройти БЕЗ ПРАВОК. Тексты 000097, :hover/:focus-within,
// touch-fallback, магазин, NPC-оверлей — не трогаются.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const page = () => fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// --- Минимальный DOM-стаб с деревом (дубль tests/craft-scroll-use.
// test.js / tests/ui-panel.test.js — конвенция: дублирование стабов
// принято, classList в DOM-стабе нет) + расширение (а) 000262:
// getBoundingClientRect() читает el._rect; без _rect — дефолт
// { left: 0, top: 0 } (БЕЗ height — гард реализации → no-op, TF-7).

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
    // 000262: тест подставляет геометрию el._rect (rect строки/TIP'а/
    // пани); без _rect — дефолт { left: 0, top: 0 } (БЕЗ height —
    // гард реализации пропускает замер — TF-7).
    getBoundingClientRect() { return this._rect || { left: 0, top: 0 }; },
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
  // textContent = '' — как в DOM, сбрасывает детей (renderItems()
  // очищает тела секций перед повторной отрисовкой).
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
// включительно (паттерн tests/craft-scroll-use.test.js) — реестр
// вкладок + вкладочные модули В цепочке (строки/тултипы — production-
// рендер), НОВЫХ тегов в задаче нет.
const CHAIN = (() => {
  const all = Array.from(
    page().matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1]);
  const i = all.indexOf('src/ui.js');
  assert.ok(i >= 0, 'ui.js подключён в index.html');
  for (const f of ['src/ui-tabs.js', 'src/ui-tab-skills.js',
                   'src/ui-tab-inventory.js']) {
    assert.ok(all.indexOf(f) >= 0 && all.indexOf(f) < i,
      f + ' — ДО ui.js в index.html (реестр/вкладки в цепочке); факт: '
      + JSON.stringify(all.slice(0, i + 1)));
  }
  return all.slice(0, i + 1);
})();

// Загрузка цепочки в vm-песочницу → { G, body, window, errors }.
// Расширение (б) 000262: window с innerWidth/innerHeight = 1280×720
// (как tests/main-visuals.test.js) и записью слушателей (resize-пин).
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
    innerWidth: 1280,
    innerHeight: 720,
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
  return { G: sandbox.Game, body: document.body, window, errors };
}

// Открыть панель для персонажа c (setCharacter + toggle(true) →
// buildPanel + render()). Дубль openPanel tests/ui-panel.test.js.
function openPanel(env, c) {
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  assert.ok(env.G.playerUI,
    'Game.playerUI создан (controls.js загружен ДО ui.js)');
  env.G.playerUI.setCharacter(c);
  env.G.playerUI.toggle(true);
  const panel = findAll(env.body, '.char-panel')[0];
  assert.ok(panel, 'панель .char-panel подвешена к body');
  assert.equal(env.errors.length, 0,
    'setCharacter/toggle: 0 ошибок: ' + env.errors.join('; '));
  return panel;
}

// Строка предмета (.cp-itemrow) по подстроке .cp-itemname.
function itemRowByName(panel, namePart) {
  return findAll(panel, '.cp-itemrow')
    .find((r) => {
      const name = r.querySelector('.cp-itemname');
      return name && String(name.textContent).includes(namePart);
    }) || null;
}

// Геометрический фиксатор: owner — строка/tr, tip — её .cp-tip,
// pane — owner.closest('.cp-tabpane') (реальный клиппер).
function tipFixture(panel, owner) {
  const tip = owner.querySelector('.cp-tip');
  const pane = owner.closest('.cp-tabpane');
  assert.ok(tip, 'у строки есть .cp-tip (000097)');
  assert.ok(pane, 'строка внутри .cp-tabpane (клиппер)');
  return { tip, pane };
}

// Синтетика событий (паттерн click-тестов ui-panel). hover/focusin/
// scroll — ТЕРПИМЫЕ: если слушателя нет (текущий код) — no-op; это
// делает гварды TF-6/TF-7 зелёными ДО фикса. Красные TF-1..TF-4
// проверяют наличие слушателей отдельным структурным пином ниже.
function hover(panel, target) {
  const ms = panel.listeners.mouseover;
  if (Array.isArray(ms) && ms.length) ms[0]({ target });
}
function focusIn(panel, target) {
  const fin = panel.listeners.focusin;
  if (Array.isArray(fin) && fin.length) fin[0]({ target });
}
function scrollPane(pane) {
  const sc = pane.listeners.scroll;
  if (Array.isArray(sc) && sc.length) sc[0]({});
}

// Структурный пин: РОВНО ОДИН делегированный слушатель type на panel.
// Красный ДО фикса — осмысленно: слушателя НЕТ (flip-механизм не
// существует), факт-список типов слушателей в сообщении.
function singleListener(listeners, type, what) {
  const arr = listeners[type];
  assert.ok(Array.isArray(arr) && arr.length === 1,
    what + ': на панели РОВНО ОДИН делегированный слушатель ' + type
    + ' — факт: ' + JSON.stringify(Object.keys(listeners)));
  return arr[0];
}

// --- TF-1: строка ПРЕДМЕТА у верхнего края — flip вниз ---

test('TF-1: предметная строка у верхнего края пани — hover → .cp-tip--down на .cp-tip (flip под строку), style пуст (ниже влезает); flip-класс НЕ на строке; слушатели: mouseover/focusin === 1, scroll на каждом .cp-tabpane === 1, click не растёт, window resize === 1', () => {
  const env = loadEnv();
  const c = env.G.createCharacter();
  env.G.addItem(c, 'iron_sword');
  const panel = openPanel(env, c);
  const row = itemRowByName(panel, 'Железный меч');
  assert.ok(row, 'строка предмета «Железный меч» найдена');
  const { tip, pane } = tipFixture(panel, row);

  // Структурные пины (контракт 000262): делегированные слушатели.
  singleListener(panel.listeners, 'mouseover', 'TF-1');
  singleListener(panel.listeners, 'focusin', 'TF-1');
  assert.equal((panel.listeners.click || []).length, 1,
    'click — ОДИН делегированный (flip НЕ добавляет click)');
  const panes = findAll(panel, '.cp-tabpane');
  assert.ok(panes.length >= 2, 'вкладки .cp-tabpane есть (оба столбца)');
  for (const p of panes) {
    assert.equal((p.listeners.scroll || []).length, 1,
      'каждый .cp-tabpane: РОВНО ОДИН scroll (пере-расчёт); факт: '
      + JSON.stringify(Object.keys(p.listeners)));
  }
  const rz = env.window.listeners.resize;
  assert.ok(Array.isArray(rz) && rz.length === 1,
    'TF-1: window resize-слушатель РОВНО ОДИН (typeof-guard); факт: '
    + JSON.stringify(Object.keys(env.window.listeners)));

  // Геометрия верхнего края: «над» уезжает (tip.top = −84 < 0),
  // «под» влезает: 85 + 4 + 140 = 229 ≤ 600 (pane ∩ viewport).
  row._rect = { top: 60, bottom: 85 };
  tip._rect = { top: -84, bottom: 56, height: 140 };
  pane._rect = { top: 90, bottom: 600 };

  hover(panel, row);

  assert.equal(tip.className, 'cp-tip cp-tip--down',
    'flip: класс cp-tip--down на .cp-tip (порядок: cp-tip первым); '
    + 'факт: ' + tip.className);
  assert.ok(!String(row.className).includes('cp-tip--down'),
    'flip-класс НЕ на строке (RAR-G: className ряда не меняется); факт: '
    + row.className);
  assert.deepEqual(Object.keys(tip.style), [],
    'ниже влезает — инлайн-стилей НЕТ (clamp только когда обе нет); '
    + 'факт: ' + JSON.stringify(tip.style));
  assert.equal(env.errors.length, 0, '0 ошибок: ' + env.errors.join('; '));
});

// --- TF-2: строка НАВЫКА (второй янкор td.cp-tipcell) + focusin ---

test('TF-2: строка навыка у верхнего края (янкор td.cp-tipcell) — mouseover по tr и focusin по .cp-btn внутри tr (owner = closest tr) → .cp-tip--down на .cp-tip', () => {
  const env = loadEnv();
  const c = env.G.createCharacter();
  const panel = openPanel(env, c);
  const btn = findAll(panel, '.cp-btn')
    .find((b) => b.dataset.skill !== undefined);
  assert.ok(btn, 'кнопка навыка data-skill найдена');
  const tr = btn.closest('tr');
  assert.ok(tr, 'кнопка находится в строке <tr>');
  assert.ok(tr.querySelector('.cp-tipcell'),
    'янкор строки навыка — td.cp-tipcell (000097)');
  const { tip, pane } = tipFixture(panel, tr);

  singleListener(panel.listeners, 'focusin', 'TF-2');

  // Геометрия верхнего края (навык: H 76 — 4 строки): «над» уезжает
  // (60 − 76 − 4 = −20 < 90), «под» влезает: 85 + 4 + 76 = 165 ≤ 600.
  tr._rect = { top: 60, bottom: 85 };
  tip._rect = { top: -20, bottom: 56, height: 76 };
  pane._rect = { top: 90, bottom: 600 };

  hover(panel, tr);
  assert.equal(tip.className, 'cp-tip cp-tip--down',
    'mouseover по tr: flip-класс на .cp-tip (второй янкор); факт: '
    + tip.className);

  // focusin-путь: target = .cp-btn внутри tr — closest('.cp-itemrow')
  // = null → closest('tr') = owner (зеркало click-ветки ui.js:237).
  focusIn(panel, btn);
  assert.equal(tip.className, 'cp-tip cp-tip--down',
    'focusin по .cp-btn внутри tr: owner = closest tr — flip; факт: '
    + tip.className);
  assert.deepEqual(Object.keys(tip.style), [],
    'ниже влезает — style пуст; факт: ' + JSON.stringify(tip.style));
  assert.equal(env.errors.length, 0, '0 ошибок: ' + env.errors.join('; '));
});

// --- TF-3: пере-расчёт по СКРОЛЛУ .cp-tabpane ---

test('TF-3: после flip (верхний край) строка прокручена к середине пани — scroll на .cp-tabpane → flip СНЯТ (над снова влезает — бит-в-бит «над»), style пуст; структурные пины слушателей', () => {
  const env = loadEnv();
  const c = env.G.createCharacter();
  env.G.addItem(c, 'iron_sword');
  const panel = openPanel(env, c);
  const row = itemRowByName(panel, 'Железный меч');
  assert.ok(row, 'строка предмета «Железный меч» найдена');
  const { tip, pane } = tipFixture(panel, row);

  // Структурные пины (контракт 000262).
  singleListener(panel.listeners, 'mouseover', 'TF-3');
  singleListener(panel.listeners, 'focusin', 'TF-3');
  assert.equal((panel.listeners.click || []).length, 1,
    'click — ОДИН делегированный (не растёт)');
  const panes = findAll(panel, '.cp-tabpane');
  assert.ok(panes.length >= 2, 'вкладки .cp-tabpane есть');
  for (const p of panes) {
    assert.equal((p.listeners.scroll || []).length, 1,
      'каждый .cp-tabpane: РОВНО ОДИН scroll-слушатель (пере-расчёт)');
  }

  // Фаза 1: верхний край → flip (как TF-1: 85+4+140 = 229 ≤ 600).
  row._rect = { top: 60, bottom: 85 };
  tip._rect = { top: -84, bottom: 56, height: 140 };
  pane._rect = { top: 90, bottom: 600 };
  hover(panel, row);
  assert.equal(tip.className, 'cp-tip cp-tip--down',
    'фаза 1: flip у верхнего края; факт: ' + tip.className);

  // Фаза 2: прокрутка — строка в СЕРЕДИНЕ пани: «над» влезает
  // (300 − 76 − 4 = 220 ≥ 90) → «над» (бит-в-бит), flip сходит.
  row._rect = { top: 300, bottom: 325 };
  tip._rect = { top: 220, bottom: 296, height: 76 };
  scrollPane(pane);
  assert.equal(tip.className, 'cp-tip',
    'фаза 2: над влезает — flip СНЯТ (бит-в-бит «над строкой»); факт: '
    + tip.className);
  assert.deepEqual(Object.keys(tip.style), [],
    'фаза 2: инлайн-стилей нет (очистка clamp); факт: '
    + JSON.stringify(tip.style));
  assert.equal(env.errors.length, 0, '0 ошибок: ' + env.errors.join('; '));
});

// --- TF-4: дегенератив — flip + CLAMP в границы ---

test("TF-4: ни «над», ни «под» не влезают (низкая пани) — flip + clamp: style.marginTop === '-29px' (vBottom − ownerBottom − 4 − H = 400 − 85 − 4 − 340), эффективный rect ⊆ pane∩viewport", () => {
  const env = loadEnv();
  const c = env.G.createCharacter();
  env.G.addItem(c, 'iron_sword');
  const panel = openPanel(env, c);
  const row = itemRowByName(panel, 'Железный меч');
  assert.ok(row, 'строка предмета «Железный меч» найдена');
  const { tip, pane } = tipFixture(panel, row);

  singleListener(panel.listeners, 'mouseover', 'TF-4');

  // Дегенератив: vTop = max(0, 50) = 50, vBottom = min(720, 400) = 400.
  // «над»: 55 − 340 − 4 = −289 < 50 (не влезает); «под»: 85 + 4 + 340
  // = 429 > 400 (не влезает) → flip + clamp.
  row._rect = { top: 55, bottom: 85 };
  tip._rect = { top: -289, bottom: 51, height: 340 };
  pane._rect = { top: 50, bottom: 400 };

  hover(panel, row);

  assert.equal(tip.className, 'cp-tip cp-tip--down',
    'clamp-кейс: flip-класс (тултип под строкой); факт: ' + tip.className);
  assert.equal(tip.style.marginTop, '-29px',
    'clamp: marginTop = vBottom − ownerBottom − 4 − H = 400 − 85 − 4 − 340 '
    + '= −29px; факт: ' + JSON.stringify(tip.style));
  // Эффективная позиция: belowTop + marginTop = 89 − 29 = 60 →
  // [60, 60+340] = [60, 400] ⊆ [50, 400] (pane ∩ viewport).
  const belowTop = 85 + 4;
  const effTop = belowTop + parseFloat(tip.style.marginTop);
  const effBottom = effTop + 340;
  assert.ok(effTop >= 50 && effBottom <= 400,
    'эффективный rect [' + effTop + ', ' + effBottom
    + '] ⊆ pane∩viewport [50, 400]');
  assert.equal(env.errors.length, 0, '0 ошибок: ' + env.errors.join('; '));
});

// --- TF-5: CSS index.html — правило flip + базовое правило не тронуто ---

// Декларации правила .name { ... } (дубль cssRule
// tests/ui-panel.test.js; матчит ПЕРВОЕ «.name {» — базовое правило
// .cp-tip; новое правило flip «.cp-tip.cp-tip--down» не смещает
// совпадение: после .cp-tip идёт «-», не « {»).
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

test('TF-5: CSS index.html — правило flip .char-panel .cp-tip.cp-tip--down { bottom: auto; top: calc(100% + 4px); } (оба янкоря) + базовое правило .cp-tip побайтово на месте + :hover/:focus-within не тронуты', () => {
  const html = page();
  const m = html.match(/\.char-panel\s+\.cp-tip\.cp-tip--down\s*\{([^}]*)\}/);
  assert.ok(m, 'flip-правило .char-panel .cp-tip.cp-tip--down НЕТ в '
    + 'index.html (нужно: bottom: auto; top: calc(100% + 4px))');
  const decls = {};
  for (const part of m[1].split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const prop = part.slice(0, i).trim().toLowerCase();
    if (prop) decls[prop] = part.slice(i + 1).trim();
  }
  assert.equal(decls.bottom, 'auto',
    'flip: bottom: auto (снимает позицию «над»); факт: '
    + JSON.stringify(decls.bottom));
  assert.equal(decls.top, 'calc(100% + 4px)',
    'flip: top: calc(100% + 4px) (зеркало отступа «над»); факт: '
    + JSON.stringify(decls.top));
  // Базовое правило .cp-tip — побайтово на месте (первое совпадение).
  const t = cssRule(html, 'cp-tip');
  assert.equal(t.position, 'absolute', 'базовое: position: absolute');
  assert.equal(t['z-index'], '11', 'базовое: z-index: 11');
  assert.equal(t.bottom, 'calc(100% + 4px)', 'базовое: bottom «над»');
  assert.equal(t['max-width'], '300px', 'базовое: max-width: 300px');
  assert.equal(t['pointer-events'], 'none',
    'базовое: pointer-events: none (клик проходит в строку)');
  assert.equal(t.opacity, '0', 'базовое: скрыт по умолчанию');
  assert.equal(t.visibility, 'hidden', 'базовое: visibility: hidden');
  // Правила показа (:hover/:focus-within) — НЕ ТРОНУТЫ (regex-пины
  // ui-panel.test.js:935-949 — тот же формат).
  assert.match(html, /:hover[^{]*\.cp-tip[^{]*\{[^}]*opacity:\s*1/,
    'показ по :hover — opacity: 1 (не тронут)');
  assert.match(html, /:focus-within[^{]*\.cp-tip[^{]*\{[^}]*opacity:\s*1/,
    'показ по :focus-within — opacity: 1 (не тронут)');
});

// --- TF-6: ГВАРД (зелёный с первого запуска) — середина: бит-в-бит ---

test('TF-6 (гвард): строка в СЕРЕДИНЕ пани — hover → класса flip НЕТ, style ПОЛНОСТЬЮ ПУСТ (бит-в-бит «над строкой»; пин против over-flip)', () => {
  const env = loadEnv();
  const c = env.G.createCharacter();
  env.G.addItem(c, 'iron_sword');
  const panel = openPanel(env, c);
  const row = itemRowByName(panel, 'Железный меч');
  assert.ok(row, 'строка предмета «Железный меч» найдена');
  const { tip, pane } = tipFixture(panel, row);

  // Геометрия СЕРЕДИНЫ (как TF-3 фаза 2): «над» влезает —
  // 300 − 76 − 4 = 220 ≥ 90 (pane.top) → базовая позиция «над».
  row._rect = { top: 300, bottom: 325 };
  tip._rect = { top: 220, bottom: 296, height: 76 };
  pane._rect = { top: 90, bottom: 600 };

  // Терпимый вызов: до фикса слушателя нет (no-op — зелёный);
  // после фикса — замер, «над» влезает → flip НЕ ставится.
  hover(panel, row);

  assert.equal(tip.className, 'cp-tip',
    'середина: класса flip НЕТ (бит-в-бит «над строкой»); факт: '
    + tip.className);
  assert.equal(Object.keys(tip.style).length, 0,
    'середина: tip.style ПОЛНОСТЬЮ ПУСТ (никаких инлайнов); факт: '
    + JSON.stringify(tip.style));
  assert.equal(env.errors.length, 0, '0 ошибок: ' + env.errors.join('; '));
});

// --- TF-7: ГВАРД (зелёный с первого запуска) — деградация без height ---

test("TF-7 (гвард): rect TIP'а БЕЗ height (стаб по умолчанию { left: 0, top: 0 }) — mouseover/scroll: исключений нет, класс не меняется, style пуст (гард H > 0 → no-op)", () => {
  const env = loadEnv();
  const c = env.G.createCharacter();
  env.G.addItem(c, 'iron_sword');
  const panel = openPanel(env, c);
  const row = itemRowByName(panel, 'Железный меч');
  assert.ok(row, 'строка предмета «Железный меч» найдена');
  const { tip, pane } = tipFixture(panel, row);

  row._rect = { top: 60, bottom: 85 };
  // tip._rect — НЕ задан: дефолт стаба { left: 0, top: 0 } — БЕЗ
  // height (старые стабы/скрытые пани display:none дают нулевой rect).
  pane._rect = { top: 90, bottom: 600 };

  let threw = false;
  try {
    hover(panel, row);
    scrollPane(pane);
  } catch (e) {
    threw = true;
  }
  assert.equal(threw, false, 'нулевой rect — БЕЗ исключения (гард)');
  assert.equal(tip.className, 'cp-tip',
    'класс не меняется (no-op деградации); факт: ' + tip.className);
  assert.equal(Object.keys(tip.style).length, 0,
    'style пуст (no-op деградации); факт: ' + JSON.stringify(tip.style));
  assert.equal(env.errors.length, 0, '0 ошибок: ' + env.errors.join('; '));
});

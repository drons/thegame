// Панель персонажа: полноэкранная двухколоночная верстка со широкими
// вкладками (задача 000096, дочерняя 000051, P0-основание).
//
// Слой: buildPanel() в src/ui.js — два столбца .cp-column, у каждого
// РЯД вкладок .cp-tab (по 3) + скроллящийся контент .cp-tabpane.
// Строки вкладок — data-driven (массивы { id, label, build(pane) }) —
// точка расширения для 000098/000100/000101/000086. Переключение —
// style.display (DOM-стаб не знает classList). DOM-контракт строк
// навыков и item-кнопок сохраняется — tests/ui-skills.test.js обязан
// пройти БЕЗ ИЗМЕНЕНИЙ (делегированный click — ОДИН и ПЕРВЫЙ).
//
// Локальный DOM-стаб — дублирование стаба tests/ui-skills.test.js
// (дублирование стабов принято в проекте) + расширение document:
// addEventListener/removeEventListener сохраняют слушателей (нужен
// keydown для [Esc]), body.
//
// КРАСНЫЕ (падают до реализации, зелёные после):
//   * верстка: ровно 2 .cp-column; в каждом 3 .cp-tab и 3 .cp-tabpane;
//     на столбец ровно ОДИН видимый pane (у остальных display === 'none');
//   * подписи вкладок: лево — «Персонаж/Инвентарь/Игровые настройки»,
//     право — «Снаряжение/Магазин/Квесты»;
//   * .cp-title = ИМЯ персонажа (c.name), НЕ захардкоженное «Флогистон»;
//     render() обновляет имя (переименование — restoreFromSave);
//   * клик по вкладке (делегированный click[0]) переключает
//     style.display; состояние вкладок в столбцах НЕЗАВИСИМО;
//   * состояние вкладки ЖИВЁТ через render(): pane не переключается
//     и не пересобирается (те же DOM-узлы — форма 000098 опирается
//     на живость focus);
//   * CSS index.html: .char-panel — top/left/right, bottom ≥ 56px
//     (панель ВЫШЕ .fs-btn), НЕТ фиксированного width;
//     z-index .char-panel (10) < z-index .fs-btn (15);
//   * [Esc]: document keydown закрывает панель, слушатель СНЯТ,
//     reopen — снова вешается; чужие клавиши не закрывают;
//   * [Esc] при открытом диалоге NPC: панель НЕ закрывается (верхний
//     слой — диалог, z-20 — ревью раунда 2); после закрытия диалога
//     — панель закрывается;
//   * [Esc] при открытом оверлее РЕЗУЛЬТАТА боя: панель НЕ
//     закрывается (оверлей — верхний слой, z-20 — ревью раунда 3);
//     во время боя (result нет) Esc панель закрывает;
//   * main.js (структурный): закрытие панели (playerUI.toggle(false),
//     под guard'ом isOpen()) во ВСЕХ входах боя — мир, подземелье и
//     отладочный actions.startCombat (ревью раунда 1);
//   * при открытии инлайновый display панели — "flex" (как в CSS
//     .char-panel), не "block" — иначе flex-верстка (скролл .cp-tabpane,
//     align-self .cp-close) не действует (регрессия ревью раунда 1).
//
// ЗЕЛЁНЫЕ с первого запуска (регрессия-фиксация, 000096 не ломает):
//   * на панели ОДИН делегированный click-обработчик
//     (panel.listeners.click.length === 1 — паттерн ui-skills.test.js
//     вызывает именно click[0]);
//   * [I] — toggle() скрывает/показывает (поведение без изменений).
//
// ЗЕЛЁНЫЕ после реализации (контракт в НОВОЙ верстке, до реализации
// тоже падают — вкладок ещё нет):
//   * строки навыков .cp-btn[data-skill] внутри <tr>, ячейки
//     .cp-name/.cp-level/.cp-req — находятся и обновляются render()
//     в СКРЫТОМ pane (после переключения на другую вкладку);
//   * item-кнопки data-act: «Магазин» — buy, «Инвентарь» —
//     use/quick/remove (торговля не сломана перестройкой).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const page = () => fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// --- Минимальный DOM-стаб с деревом (дубль tests/ui-skills.test.js) ---
//
// Селекторы, которые использует ui.js: «.класс» и имя тега ('tr').
// [data-...] и combinators стаб НЕ понимает — связка вкладка↔pane
// в тестах — по ПОРЯДКУ записей data-driven-массива (таб i ↔ pane i).

function matchesSel(el, sel) {
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
  }
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

// Цепочка из index.html до ui.js включительно (порядок ВАЖЕН:
// controls.js ДО ui.js — guard в ui.js; регрессия порядка —
// tests/index-order.test.js).
const CHAIN = [
  'global-settings.js', 'perlin.js', 'mapseed.js',
  'skills-data.js', 'items-data.js', 'npc-data.js',
  'map.js', 'player.js', 'day.js', 'items.js', 'buildings.js',
  'npc.js', 'combat.js', 'dungeon.js',
  'controls.js', 'combat-keys.js', 'ui.js',
];

// Загрузка цепочки в vm-песочницу. Возвращает { G, body, doc, errors }:
// G — Game песочницы, body — document.body (к нему подвешена панель),
// doc — document (слушатели keydown для [Esc]), errors — console.error.
function loadPanelUi() {
  const errors = [];
  const document = {
    createElement: (tag) => makeEl(tag),
    body: makeEl('body'),
    querySelector: () => null,
    hidden: false,
    // Расширение стаба (000096): сохраняем слушателей — тест [Esc]
    // проверяет, что панель вешает/снимает свой document keydown.
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
  return { G: sandbox.Game, body: document.body, doc: document, errors };
}

// Открыть панель для персонажа c (setCharacter + toggle(true) →
// buildPanel + render()). Ошибки загрузки (битый порядок) — сразу фейл.
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

function colsOf(panel) {
  const cols = findAll(panel, '.cp-column');
  assert.equal(cols.length, 2, 'ровно 2 столбца .cp-column');
  return cols;
}

function tabsOf(col) { return findAll(col, '.cp-tab'); }
function panesOf(col) { return findAll(col, '.cp-tabpane'); }

// Клик по вкладке через ЕДИНСТВЕННЫЙ делегированный обработчик панели
// (паттерн tests/ui-skills.test.js: panel.listeners.click[0]({ target })).
// Событие — голый { target }: стаб не несёт preventDefault/
// stopPropagation, обработчик обязан не требовать их (т.е. не звать
// без гарда).
function clickTab(panel, col, idx) {
  const clickers = panel.listeners.click || [];
  assert.ok(clickers.length >= 1, 'делегированный click-обработчик на панели');
  const tab = tabsOf(col)[idx];
  assert.ok(tab, 'вкладка ' + idx + ' найдена в столбце');
  clickers[0]({ target: tab });
  return tab;
}

// --- CSS index.html: декларация правила .sel { ... } ---

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

// --- КРАСНЫЕ: верстка двухколоночной панели ---

test('панель: ровно 2 .cp-column; в каждом 3 .cp-tab и 3 .cp-tabpane; один видимый pane', () => {
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  const panel = openPanel(env, c);
  const cols = colsOf(panel);
  cols.forEach((col, i) => {
    const tabs = tabsOf(col);
    const panes = panesOf(col);
    assert.equal(tabs.length, 3, 'столбец ' + i + ': 3 вкладки .cp-tab');
    assert.equal(panes.length, 3, 'столбец ' + i + ': 3 панели .cp-tabpane');
    // Ровно ОДИН видимый pane на столбец: активный — display !== 'none',
    // остальные — 'none'.
    const visible = panes.filter((p) => p.style.display !== 'none');
    assert.equal(visible.length, 1,
      'столбец ' + i + ': ровно один видимый .cp-tabpane (остальные скрыты)');
  });
});

test('панель: подписи вкладок — лево «Персонаж/Инвентарь/Игровые настройки», право «Снаряжение/Магазин/Квесты»', () => {
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  const panel = openPanel(env, c);
  const cols = colsOf(panel);
  assert.deepEqual(tabsOf(cols[0]).map((t) => t.textContent),
    ['Персонаж', 'Инвентарь', 'Игровые настройки'],
    'левый столбец: подписи вкладок в порядке массива');
  assert.deepEqual(tabsOf(cols[1]).map((t) => t.textContent),
    ['Снаряжение', 'Магазин', 'Квесты'],
    'правый столбец: подписи вкладок в порядке массива');
});

test('панель: .cp-title = имя персонажа (не «Флогистон»); render() обновляет имя', () => {
  // Ловит захардкоженный заголовок (ui.js: el('div','cp-title','Флогистон')):
  // createCharacter() без аргумента — «Флогистон», поэтому проверяем на
  // ПЕРЕИМЕНОВАННОМ персонаже: title обязан равняться c.name.
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  c.name = 'Тестовый герой';
  const panel = openPanel(env, c);
  const title = findAll(panel, '.cp-title')[0];
  assert.ok(title, 'заголовок .cp-title есть в панели');
  assert.equal(title.textContent, c.name,
    'заголовок — имя персонажа, не захардкоженное «Флогистон»');
  // Переименование (restoreFromSave) — имя обязано обновиться в render()
  // (build(pane) вызывается один раз, дальше — только in-place).
  c.name = 'Переименованный';
  env.G.playerUI.render();
  assert.equal(title.textContent, 'Переименованный',
    'render() обновляет .cp-title (тот же узел)');
});

test('панель: клик по вкладке переключает pane (style.display); столбцы независимы', () => {
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  const panel = openPanel(env, c);
  const cols = colsOf(panel);
  const left = cols[0], right = cols[1];
  const lp = panesOf(left), rp = panesOf(right);

  // По умолчанию активна ПЕРВАЯ вкладка каждого столбца.
  assert.notEqual(lp[0].style.display, 'none', 'лево: по умолчанию «Персонаж» активен');
  assert.notEqual(rp[0].style.display, 'none', 'право: по умолчанию «Снаряжение» активно');

  // Левый столбец: вторая вкладка — «Инвентарь».
  clickTab(panel, left, 1);
  assert.notEqual(lp[1].style.display, 'none', 'лево: «Инвентарь» показан');
  assert.equal(lp[0].style.display, 'none', 'лево: «Персонаж» скрыт');

  // Правый столбец не пострадал от клика в левом.
  assert.notEqual(rp[0].style.display, 'none',
    'право: активная вкладка НЕЗАВИСИМА от левого столбца');

  // Правый столбец: третья вкладка — «Квесты».
  clickTab(panel, right, 2);
  assert.notEqual(rp[2].style.display, 'none', 'право: «Квесты» показан');
  assert.equal(rp[0].style.display, 'none', 'право: «Снаряжение» скрыто');

  // Левый столбец остался на «Инвентарь».
  assert.notEqual(lp[1].style.display, 'none', 'лево: состояние сохранено (показан «Инвентарь»)');
  assert.equal(lp[0].style.display, 'none', 'лево: состояние сохранено (скрыт «Персонаж»)');
});

test('панель: состояние вкладки живёт через render(); pane не пересобирается', () => {
  // 000098 (форма настроек) опирается на живость focus: render() НЕ
  // переключает активный pane и НЕ пересобирает его содержимое —
  // build(pane) вызывается один раз в buildPanel.
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  const panel = openPanel(env, c);
  const cols = colsOf(panel);
  const left = cols[0];
  const lp = panesOf(left);
  const charPane = lp[0];
  const title = charPane.querySelector('.cp-title');
  assert.ok(title, '.cp-title живёт в pane «Персонаж»');

  clickTab(panel, left, 1); // на «Инвентарь» — «Персонаж» скрыт
  assert.notEqual(lp[1].style.display, 'none', '«Инвентарь» активен');
  assert.equal(lp[0].style.display, 'none', '«Персонаж» скрыт');

  c.points = 2; // причина для render()
  env.G.playerUI.render();

  assert.notEqual(lp[1].style.display, 'none',
    'после render() активный pane НЕ переключился');
  assert.equal(lp[0].style.display, 'none',
    'после render() скрытый pane не показан');
  assert.equal(panesOf(left)[0], charPane,
    'pane «Персонаж» — тот же DOM-узел после render() (не пересобран)');
  assert.equal(charPane.querySelector('.cp-title'), title,
    '.cp-title — тот же DOM-узел после render()');
});

// --- КРАСНЫЕ: CSS .char-panel (полноэкран, выше .fs-btn) ---

test('CSS: .char-panel — top/left/right, bottom ≥ 56px, НЕТ width; z-index 10 < 15 (.fs-btn)', () => {
  const html = page();
  const p = cssRule(html, 'char-panel');
  assert.ok(p.top, '.char-panel: есть top');
  assert.ok(p.left, '.char-panel: есть left');
  assert.ok(p.right, '.char-panel: есть right');
  assert.ok(p.bottom, '.char-panel: есть bottom');
  const bottomPx = parseFloat(p.bottom);
  assert.ok(Number.isFinite(bottomPx) && bottomPx >= 56,
    'bottom ≥ 56px — нижняя кромка панели ВЫШЕ верхней кромки .fs-btn ' +
    '(bottom 12 + высота ≈33px): ' + p.bottom);
  assert.equal(p.width, undefined,
    'фиксированного width НЕТ (380px убран — панель на весь экран)');
  // Нет фиксированной ширины и у столбца — flex:1 (оба пополам).
  assert.equal(cssRule(html, 'cp-column').width, undefined,
    '.cp-column без фиксированной width (flex)');
  const zP = parseFloat(p['z-index']);
  const zF = parseFloat(cssRule(html, 'fs-btn')['z-index']);
  assert.ok(Number.isFinite(zP) && Number.isFinite(zF),
    'z-index задан у .char-panel и .fs-btn');
  assert.equal(zP, 10, 'z-index .char-panel = 10 (лестница 5/10/15/20)');
  assert.equal(zF, 15, 'z-index .fs-btn = 15');
  assert.ok(zP < zF, 'z-index .char-panel < z-index .fs-btn');
});

// --- КРАСНЫЕ: [Esc] закрывает панель (document keydown) ---

test('панель: [Esc] закрывает; слушатель снят; reopen — снова вешается; чужие клавиши не закрывают', () => {
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  const before = (env.doc.listeners.keydown || []).length;
  openPanel(env, c);
  assert.equal(env.G.playerUI.isOpen(), true, 'панель открыта');

  const dispatch = (code) => {
    for (const fn of env.doc.listeners.keydown || []) fn({ code });
  };

  // Чужая клавиша — не закрывает.
  dispatch('KeyX');
  assert.equal(env.G.playerUI.isOpen(), true, 'не-Esc клавиша панель не закрывает');

  dispatch('Escape');
  assert.equal(env.G.playerUI.isOpen(), false, '[Esc] закрывает панель');

  // Слушатель СНЯТ: счётчик вернулся к дооткрытий, повторный
  // dispatch ничего не делает.
  assert.equal((env.doc.listeners.keydown || []).length, before,
    'после закрытия document keydown-слушатель панели снят');
  dispatch('Escape');
  assert.equal(env.G.playerUI.isOpen(), false, 'повторный dispatch — нет (слушателя нет)');

  // Reopen — слушатель вешается снова (и только один).
  env.G.playerUI.toggle(true);
  assert.equal(env.G.playerUI.isOpen(), true, 'панель снова открыта');
  assert.equal((env.doc.listeners.keydown || []).length, before + 1,
    'после reopen слушатель [Esc] вешается снова (один)');
  dispatch('Escape');
  assert.equal(env.G.playerUI.isOpen(), false, 'после reopen [Esc] снова закрывает');
});

// --- КРАСНЫЕ: [Esc] при открытом диалоге NPC (ревью 000096, раунд 2) ---

test('панель: [Esc] при открытом диалоге NPC — панель НЕ закрывается (диалог — верхний слой)', () => {
  // Открыты И диалог NPC (KeyE, .combat-overlay, z-20), И панель
  // (KeyI, .char-panel, z-10). Одно нажатие [Esc] в реальном браузере
  // доходит до ОБОИХ слушателей (bubble: document → window) — без
  // гарда закрываются оба сразу. До 000096 панель по Esc не
  // закрывалась; верхний слой приоритетнее: Esc сначала закрывает
  // диалог, панель остаётся (второй [Esc]/[I] — закроет). Слушатель
  // панели (document) обязан сам проверять npcUI.isActive():
  // слушатель npcUI вешается на window и срабатывает ПОСЛЕ.
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  openPanel(env, c);
  const npc = env.G.NpcData.NPCS[0];
  env.G.npcUI.open({ npc, character: c, book: env.G.createQuestBook() });
  assert.equal(env.G.npcUI.isActive(), true, 'диалог NPC открыт');
  assert.equal(env.G.playerUI.isOpen(), true, 'панель открыта');

  const dispatch = (code) => {
    for (const fn of env.doc.listeners.keydown || []) fn({ code });
  };

  // [Esc] №1: document-слушатель панели не обязан закрывать панель,
  // пока открыт диалог (в реальном браузере именно window-слушатель
  // npcUI закрывает его; в стабе window-слушатели не сохраняются).
  dispatch('Escape');
  assert.equal(env.G.playerUI.isOpen(), true,
    'пока открыт диалог — Esc не закрывает панель (оба не закрываются сразу)');

  // Диалог закрыт — эмуляция window-слушателя npcUI.
  env.G.npcUI.close();
  assert.equal(env.G.npcUI.isActive(), false, 'диалог закрыт');

  // [Esc] №2: панель теперь верхний слой — закрывается.
  dispatch('Escape');
  assert.equal(env.G.playerUI.isOpen(), false,
    'после закрытия диалога Esc закрывает панель');
});

// --- КРАСНЫЕ: [Esc] при открытом оверлее РЕЗУЛЬТАТА боя (ревью 000096, раунд 3) ---

test('панель: [Esc] при открытом результате боя — панель НЕ закрывается (оверлей — верхний слой)', () => {
  // Открыты И оверлей результата боя (combat-ui.js, .combat-overlay,
  // z-20 — бой завершён, c.result установлен), И панель (KeyI,
  // .char-panel, z-10). В реальном браузере одно нажатие [Esc]
  // доходит до ОБОИХ слушателей (bubble: document → window) — без
  // гарда закрываются и панель, и оверлей результата. Гард в
  // document-слушателе панели: combatUI.isActive() &&
  // current().result (accessors combat-ui.js: current() → ctx.combat,
  // .result — результат завершённого боя). combat-ui.js НЕ входит в
  // CHAIN этого файла (canvas 2d в DOM-стабе нет) — G.combatUI
  // эмулируется стабом той же формы API (паттерн дублирования
  // стабов, принятый в проекте).
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  openPanel(env, c);
  env.G.combatUI = {
    isActive: () => true,
    current: () => ({ result: { outcome: 'victory' } }),
  };

  const dispatch = (code) => {
    for (const fn of env.doc.listeners.keydown || []) fn({ code });
  };

  // [Esc] №1: пока оверлей результата открыт — панель НЕ закрывается
  // (в реальном браузере window-слушатель combat-ui.js закрывает
  // оверлей — finish(); в стабе window-слушатели не сохраняются).
  dispatch('Escape');
  assert.equal(env.G.playerUI.isOpen(), true,
    'пока открыт результат боя — Esc не закрывает панель (оба не закрываются сразу)');

  // Оверлей закрыт — finish() обнулил ctx: isActive() → false.
  env.G.combatUI = { isActive: () => false, current: () => null };

  // [Esc] №2: панель теперь верхний слой — закрывается.
  dispatch('Escape');
  assert.equal(env.G.playerUI.isOpen(), false,
    'после закрытия оверлея Esc закрывает панель');
});

test('панель: [Esc] во ВРЕМЯ боя (result нет) — панель закрывается как обычно', () => {
  // Оверлей активен, но бой НЕ завершён (c.result не установлен):
  // Esc оверлей по замыканию 000049/000096 НЕ закрывает — и тогда
  // Esc остаётся штатным управлением панели в бою (000096: «KeyI в
  // бою по-прежнему переключает»). Гард на результат, а не на сам
  // факт открытого боя.
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  openPanel(env, c);
  env.G.combatUI = {
    isActive: () => true,
    current: () => ({ result: undefined }),
  };

  const dispatch = (code) => {
    for (const fn of env.doc.listeners.keydown || []) fn({ code });
  };

  dispatch('Escape');
  assert.equal(env.G.playerUI.isOpen(), false,
    'бой в ходу (результата нет) — Esc закрывает панель');
});

// --- КРАСНЫЕ: display:flex (регрессия — ревью 000096, раунд 1) ---

test('панель: при открытии display = "flex" (не "block") — flex-верстка действует', () => {
  // Инлайновый display:'block' переопределял CSS
  // .char-panel { display: flex; flex-direction: column } — корень
  // панели становился block-контейнером: .cp-columns
  // {flex:1;min-height:0} и .cp-tabpane {flex:1;overflow-y:auto;
  // min-height:0} не ограничивались высотой (контент не скроллился и
  // переливался за нижнюю кромку в полосу .fs-btn), .cp-close
  // {align-self:flex-end} не работал. display:'flex' — верстка
  // из CSS, «скроллящийся контент .cp-tabpane» (цель задачи) в силе.
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  openPanel(env, c);
  const panel = findAll(env.body, '.char-panel')[0];
  assert.equal(panel.style.display, 'flex',
    'открытая панель — display:"flex" (как в CSS .char-panel, не "block")');
  env.G.playerUI.toggle(false);
  assert.equal(panel.style.display, 'none', 'закрытая панель — display:"none"');
  assert.equal(env.G.playerUI.isOpen(), false, 'isOpen() учитывает display');
  env.G.playerUI.toggle(true);
  assert.equal(panel.style.display, 'flex', 'reopen — снова "flex"');
  assert.equal(env.G.playerUI.isOpen(), true, 'isOpen() — открыта');
});

// --- КРАСНЫЕ: main.js — закрытие панели при старте боя (структурный) ---

test('main.js: панель закрывается (toggle(false) под guard' + 'ом isOpen()) во ВСЕХ входах боя', () => {
  // Поведенческого теста main.js в проекте нет (бой не запускается в
  // песочнице) — структурный, паттерн tests/global-settings.test.js.
  // ТРИ входа: мир (maybeStartCombat), подземелье (startDungeonCombat)
  // и отладочный actions.startCombat — пропуск любого = полноэкранная
  // панель накроет карту после боя (цель задачи). Вызов обязан быть
  // УСЛОВНЫМ (isOpen()): голый toggle(false) построит панель при
  // каждом спавне боя.
  const text = src('main.js');
  const closers = text.match(
    /isOpen\s*\(\s*\)[\s\S]{0,120}?playerUI\s*\.\s*toggle\s*\(\s*false\s*\)/g) || [];
  assert.ok(closers.length >= 3,
    'закрытие панели playerUI.toggle(false) под guard' + 'ом isOpen() ' +
    'найдено во ВСЕХ входах боя (мир + подземелье + отладочный), ' +
    'найдено: ' + closers.length);
});

// --- ЗЕЛЁНЫЕ с первого запуска (регрессия-фиксация) ---

test('панель: ОДИН делегированный click-обработчик (panel.listeners.click.length === 1)', () => {
  // tests/ui-skills.test.js вызывает panel.listeners.click[0] —
  // обработчик обязан остаться ЕДИНСТВЕННЫМ (и первым).
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  const panel = openPanel(env, c);
  assert.equal((panel.listeners.click || []).length, 1,
    'делегированный click — единственный click-слушатель на панели');
});

test('панель: [I] — toggle() скрывает/показывает (поведение без изменений)', () => {
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  openPanel(env, c);
  assert.equal(env.G.playerUI.isOpen(), true, 'toggle(true) — открыта');
  env.G.playerUI.toggle();
  assert.equal(env.G.playerUI.isOpen(), false, 'toggle() — скрыта');
  env.G.playerUI.toggle();
  assert.equal(env.G.playerUI.isOpen(), true, 'toggle() — показана');
});

// --- Контракт в НОВОЙ верстке (красные до реализации: вкладок нет) ---

test('панель: строки навыков находятся и обновляются в СКРЫТОМ pane (после переключения)', () => {
  // render() обходит panel.querySelectorAll('.cp-btn') — стаб не знает
  // про display, строки в скрытом pane обязаны быть найдены и
  // обновлены (контракт ui-skills в двухколонковой верстке).
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  c.primary.strength = 10;
  c.secondary.swordsman = 3;
  c.skillXp = { swordsman: 12 };
  const panel = openPanel(env, c);
  const cols = colsOf(panel);

  // Переключить левый столбец на «Инвентарь» — «Персонаж» (и таблицы
  // навыков) становятся скрытым pane.
  clickTab(panel, cols[0], 1);
  assert.equal(panesOf(cols[0])[0].style.display, 'none',
    'pane «Персонаж» скрыт');

  c.points = 1;
  env.G.playerUI.render();

  const btn = findAll(panel, '.cp-btn')
    .find((b) => b.dataset.skill === 'swordsman');
  assert.ok(btn, 'кнопка data-skill=swordsman найдена в скрытом pane');
  const tr = btn.closest('tr');
  assert.ok(tr, 'кнопка в строке <tr>');
  assert.ok(tr.querySelector('.cp-name'), 'ячейка .cp-name на месте');
  assert.equal(tr.querySelector('.cp-level').textContent,
    '3 (12/' + env.G.skillXpForNext(3) + ')',
    'значения обновлены render() в скрытом pane');
  assert.equal(btn.disabled, false, 'очко есть — кнопка «+» активна');
});

test('панель: item-кнопки data-act — «Магазин» (buy) и «Инвентарь» (use/quick/remove)', () => {
  // Торговля и инвентарь обязаны ЖИТЬ в новой верстке: _shopBody в
  // pane «Магазин», _invBody в pane «Инвентарь» (renderItems — in-place).
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  env.G.addItem(c, 'healing_potion', 2);
  const panel = openPanel(env, c);
  const cols = colsOf(panel);
  const left = cols[0], right = cols[1];

  // «Инвентарь» — левый столбец, вкладка 1.
  clickTab(panel, left, 1);
  const invActs = findAll(panesOf(left)[1], '.cp-btn')
    .map((b) => b.dataset.act);
  assert.ok(invActs.includes('use'), 'инвентарь: кнопка «исп.» (use)');
  assert.ok(invActs.includes('quick'), 'инвентарь: кнопка «быстр.» (quick)');
  assert.ok(invActs.includes('remove'), 'инвентарь: кнопка «−1» (remove)');

  // «Магазин» — правый столбец, вкладка 1; герой у аптекаря.
  env.G.playerUI.setShop(
    env.G.makeShop(0, 0, env.G.BUILDING_TYPES.APOTHECARY, 2));
  env.G.playerUI.render();
  const shopActs = findAll(panesOf(right)[1], '.cp-btn')
    .map((b) => b.dataset.act);
  assert.ok(shopActs.includes('buy'),
    'магазин: кнопка «купить» (buy) в pane «Магазин»');
});

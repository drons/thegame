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
//
// 000097 — тултипы навыков и предметов (.cp-tip, чистый CSS-показ по
// hover): :hover в стабе не симулируется — проверяем СОДЕРЖИМОЕ/
// структуру узлов и CSS-текст index.html.
//
// КРАСНЫЕ (падают до реализации, зелёные после):
//   * у КАЖДОЙ строки ОСНОВНОГО навыка (все 6) .cp-tip: desc,
//     «В бою: <combat>», «В мире: <world>», «Требование: —»;
//   * у КАЖДОЙ строки ВТОРИЧНОГО навыка (все 31) .cp-tip: desc,
//     effectType, stat, String(perLevel), титул (lvl = 0 — базовое
//     имя), требование (как в .cp-req, иначе «—»); render() обновляет
//     титул по names[] (G.secondaryName) в том же узле;
//   * у КАЖДОЙ заполненной строки ПРЕДМЕТА (снаряжение/быстрые/
//     инвентарь) .cp-tip: desc, «Вес: <weight> кг», «Цена: <value> з»
//     и строка своего kind (Урон/Броня/Эффект); реагент — БЕЗ строки
//     «Эффект»;
//   * CSS index.html: .cp-tip скрыт по умолчанию (opacity: 0 /
//     visibility: hidden), position: absolute, max-width,
//     pointer-events: none; показ по :hover И :focus-within —
//     opacity: 1;
//   * touch-fallback: клик по СТРОКЕ навыка/предмета (не по кнопке) —
//     <tr> / .cp-itemrow через делегированный click[0] — полное
//     описание в .cp-notice (flashNotice), opacity '1'; навык НЕ
//     прокачан, .cp-req не тронут;
//   * пере-рендер после клика «+» сохраняет .cp-tip (тот же узел) с
//     актуальным титулом; .cp-name/.cp-level/.cp-req/
//     .cp-btn[data-skill] без изменений (контракт ui-skills.test.js);
//   * вспышка reason в .cp-req (1.5 с, паттерн 000041) НЕ смешивается
//     с .cp-tip: reason — только в .cp-req, через 1.5 с — постоянные
//     тексты (пометка потолка), содержимое .cp-tip стабильно.
//
// ЗЕЛЁНЫЕ с первого запуска (отрицательный контракт — зелёные и до
// реализации, обязаны остаться после):
//   * пустые строки («— без оружия —», «— без брони —», «— пусто —»)
//     и строки МАГАЗИНА — БЕЗ .cp-tip (магазин — зона 000101);
//   * клик по КНОПКЕ и по строке магазина — notice НЕ появляется
//     (ветки .cp-btn/.cp-tab не сломаны, у магазина tip нет).
//
// РЕГРЕССИЯ БЕЗ ИЗМЕНЕНИЙ: tests/ui-skills.test.js,
// tests/main-visuals.test.js, полный npm test.

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

// --- 000097: тултипы .cp-tip (красные до реализации) ---

// Строка навыка в таблице: кнопка data-skill → <tr> → .cp-tip.
function skillTipRow(panel, skillId) {
  const btn = findAll(panel, '.cp-btn')
    .find((b) => b.dataset.skill === skillId);
  assert.ok(btn, 'кнопка data-skill=' + skillId + ' найдена');
  const tr = btn.closest('tr');
  assert.ok(tr, 'кнопка находится в строке <tr>');
  return { btn, tr, tip: tr.querySelector('.cp-tip') };
}

// Строка предмета (.cp-itemrow) по подстроке .cp-itemname.
function itemRowByName(root, namePart) {
  return findAll(root, '.cp-itemrow')
    .find((r) => {
      const name = r.querySelector('.cp-itemname');
      return name && String(name.textContent).includes(namePart);
    }) || null;
}

// .cp-notice панели (flashNotice — канал touch-fallback'а).
function noticeOf(panel) {
  const n = findAll(panel, '.cp-notice')[0];
  assert.ok(n, 'уведомление .cp-notice есть в панели');
  return n;
}

test('панель: у КАЖДОЙ строки ОСНОВНОГО навыка (все 6) .cp-tip — desc + «В бою» + «В мире» + требование', () => {
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  const panel = openPanel(env, c);
  // Все строки навыков в панели: 6 основных + 31 вторичный.
  const skillBtns = findAll(panel, '.cp-btn')
    .filter((b) => b.dataset.skill);
  assert.equal(skillBtns.length,
    env.G.PRIMARY_SKILLS.length +
    Object.keys(env.G.SECONDARY_SKILLS).length,
    'строки навыков: все основные + все вторичные');
  for (const p of env.G.PRIMARY_SKILLS) {
    const { tr, tip } = skillTipRow(panel, p.id);
    assert.ok(tip, 'у строки «' + p.name + '» есть .cp-tip');
    assert.ok(tip.textContent.includes(p.desc),
      'desc навыка в тултипе: ' + p.desc);
    assert.ok(tip.textContent.includes('В бою: ' + p.combat),
      '«В бою: ' + p.combat + '» в тултипе');
    assert.ok(tip.textContent.includes('В мире: ' + p.world),
      '«В мире: ' + p.world + '» в тултипе');
    assert.ok(tip.textContent.includes('Требование: —'),
      'у основного требования нет — «Требование: —»');
  }
});

test('панель: у КАЖДОЙ строки ВТОРИЧНОГО навыка (все 31) .cp-tip — desc + эффект + титул + требование; render() обновляет титул по names[]', () => {
  const env = loadPanelUi();
  const c = env.G.createCharacter(); // все вторичные — уровень 0
  const panel = openPanel(env, c);
  const skills = Object.entries(env.G.SECONDARY_SKILLS);
  assert.equal(skills.length, 31, 'в каталоге 31 вторичный навык');
  for (const [id, s] of skills) {
    const { tr, tip } = skillTipRow(panel, id);
    assert.ok(tip, 'у строки «' + s.name + '» есть .cp-tip');
    const t = tip.textContent;
    assert.ok(t.includes(s.desc), 'desc: ' + s.desc);
    assert.ok(t.includes(s.effectType), 'effectType: ' + s.effectType);
    assert.ok(t.includes(s.effect.stat), 'stat эффекта: ' + s.effect.stat);
    assert.ok(t.includes(String(s.effect.perLevel)),
      'perLevel эффекта (как в каталоге): ' + s.effect.perLevel);
    // lvl = 0 — титул ещё базовое имя (не ранг).
    assert.ok(t.includes(s.name), 'базовый титул: ' + s.name);
    // Требование — тот же текст, что в .cp-req (render() уже нарисовал),
    // иначе «—».
    const reqTd = tr.querySelector('.cp-req');
    assert.ok(t.includes('Требование: ' + (reqTd.textContent || '—')),
      'требование совпадает с .cp-req: «' + (reqTd.textContent || '—') + '»');
  }
  // Титул НЕ строится один раз в build(): после прокачки и render()
  // в том же узле — текущий титул по names[].
  c.secondary.swordsman = 5;
  env.G.playerUI.render();
  const tip5 = skillTipRow(panel, 'swordsman').tip;
  assert.ok(tip5, 'узел .cp-tip жив после render()');
  assert.ok(tip5.textContent.includes(env.G.secondaryName('swordsman', 5)),
    'после render() титул по names[]: ' + env.G.secondaryName('swordsman', 5));
});

test('панель: у КАЖДОЙ заполненной строки предмета .cp-tip — desc + вес + цена + строка kind', () => {
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  // Снаряжение: оружие + броня.
  env.G.addItem(c, 'iron_sword');
  env.G.equip(c, 'iron_sword');
  env.G.addItem(c, 'leather_armor');
  env.G.equip(c, 'leather_armor');
  // Быстрый слот: зелье.
  env.G.addItem(c, 'healing_potion');
  env.G.setQuick(c, 0, 'healing_potion');
  // Инвентарь: еда, книга, реагент.
  env.G.addItem(c, 'bread');
  env.G.addItem(c, 'alchemy_manual');
  env.G.addItem(c, 'sulfur');
  const panel = openPanel(env, c);

  const G = env.G;
  const checks = [
    // [корень секции, подстрока имени, предмет, строка kind]
    [panel._equipBody, 'Железный меч', G.getItem('iron_sword'),
      ['Урон: ' + G.getItem('iron_sword').stats.damage]],
    [panel._equipBody, 'Кожаный доспех', G.getItem('leather_armor'),
      ['Броня: ' + G.getItem('leather_armor').stats.armor]],
    [panel._quickBody, 'Слот 1: Зелье лечения', G.getItem('healing_potion'),
      ['Эффект: +' + G.getItem('healing_potion').effect.amount + ' HP']],
    [panel._invBody, 'Хлеб', G.getItem('bread'),
      ['Эффект: +' + G.getItem('bread').effect.amount + ' HP']],
    [panel._invBody, 'Трактат алхимика', G.getItem('alchemy_manual'),
      ['Эффект: +' + G.getItem('alchemy_manual').effect.amount +
        ' опыта («' + G.SECONDARY_SKILLS.alchemy.name + '»)']],
    [panel._invBody, 'Сера', G.getItem('sulfur'), []],
  ];
  for (const [root, namePart, it, kindLines] of checks) {
    const row = itemRowByName(root, namePart);
    assert.ok(row, 'строка предмета «' + namePart + '» найдена');
    const tip = row.querySelector('.cp-tip');
    assert.ok(tip, 'у строки «' + namePart + '» есть .cp-tip');
    const t = tip.textContent;
    assert.ok(t.includes(it.desc), 'desc предмета: ' + it.desc);
    assert.ok(t.includes('Вес: ' + it.weight + ' кг'),
      'вес предмета: ' + it.weight + ' кг');
    assert.ok(t.includes('Цена: ' + it.value + ' з'),
      'цена предмета: ' + it.value + ' з');
    for (const line of kindLines) {
      assert.ok(t.includes(line), 'строка kind: «' + line + '»');
    }
  }
  // Реагент — БЕЗ строки эффекта (effect в каталоге отсутствует).
  const reagentTip = itemRowByName(panel._invBody, 'Сера')
    .querySelector('.cp-tip');
  assert.ok(!reagentTip.textContent.includes('Эффект'),
    'у реагента строки «Эффект» нет');
});

test('панель: пустые строки («— без оружия —», «— без брони —», «— пусто —») БЕЗ .cp-tip', () => {
  const env = loadPanelUi();
  const c = env.G.createCharacter(); // снаряжение и слоты пусты
  const panel = openPanel(env, c);
  for (const namePart of ['— без оружия —', '— без брони —']) {
    const row = itemRowByName(panel._equipBody, namePart);
    assert.ok(row, 'строка «' + namePart + '» найдена');
    assert.equal(row.querySelector('.cp-tip'), null,
      'у пустой строки «' + namePart + '» НЕТ .cp-tip');
  }
  const quickRows = findAll(panel._quickBody, '.cp-itemrow');
  assert.equal(quickRows.length, env.G.QUICK_SLOTS,
    'строк быстрых слотов = QUICK_SLOTS');
  for (const r of quickRows) {
    const name = r.querySelector('.cp-itemname').textContent;
    assert.ok(name.includes('— пусто —'), 'слот пуст: ' + name);
    assert.equal(r.querySelector('.cp-tip'), null,
      'у пустого слота НЕТ .cp-tip');
  }
});

test('CSS: .cp-tip скрыт по умолчанию; absolute/max-width/pointer-events: none; показ по :hover и :focus-within (opacity: 1)', () => {
  const html = page();
  const t = cssRule(html, 'cp-tip');
  assert.ok(t.opacity === '0' || t.visibility === 'hidden',
    'скрыт по умолчанию (opacity: 0 или visibility: hidden)');
  assert.equal(t.position, 'absolute', 'position: absolute');
  assert.ok(t['max-width'], 'max-width задан (переполнение)');
  assert.equal(t['pointer-events'], 'none',
    'pointer-events: none — тултип не перехватывает курсор и клики');
  // Правила показа — compound-селекторы (владельцы: :hover /
  // :focus-within); cssRule() матчит только одиночные «.name {…}» —
  // проверяем отдельными regex.
  assert.match(html, /:hover[^{]*\.cp-tip[^{]*\{[^}]*opacity:\s*1/,
    'показ по :hover — opacity: 1');
  assert.match(html, /:focus-within[^{]*\.cp-tip[^{]*\{[^}]*opacity:\s*1/,
    'показ по :focus-within — opacity: 1 (клавиатура)');
});

test('панель: клик по СТРОКЕ навыка (не по кнопке) — полное описание в .cp-notice; навык НЕ прокачан, .cp-req не тронут', () => {
  // Touch-fallback: hover на таче нет — тап/клик по не-кнопочной части
  // строки выводит полное описание в .cp-notice (flashNotice).
  // Решение зафиксировано тестом: канал — .cp-notice, контент —
  // содержимое .cp-tip.
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  const panel = openPanel(env, c);
  const s = env.G.SECONDARY_SKILLS.heavy; // lvl = 0 — требует «Мечник 5»
  const { tr, tip } = skillTipRow(panel, 'heavy');
  assert.ok(tip, 'у строки «heavy» есть .cp-tip');
  const reqTd = tr.querySelector('.cp-req');
  assert.equal(reqTd.textContent, 'Мечник 5', 'требование до клика');
  const notice = noticeOf(panel);
  assert.equal(notice.textContent, '', 'notice пуст до клика');

  const clickers = panel.listeners.click || [];
  assert.ok(clickers.length === 1,
    'один делегированный click-обработчик (ветка строк — внутри него)');
  clickers[0]({ target: tr });

  assert.ok(notice.textContent.includes(s.desc),
    'в .cp-notice — полное описание навыка: ' + s.desc);
  assert.equal(notice.style.opacity, '1', '.cp-notice подсвечен');
  assert.equal(c.points, 0, 'очки не потрачены');
  assert.ok(!c.secondary.heavy, 'уровень навыка НЕ изменился');
  assert.equal(reqTd.textContent, 'Мечник 5',
    '.cp-req кликом по строке не тронут');
  assert.equal(tr.querySelector('.cp-tip'), tip, 'узел .cp-tip тот же');
});

test('панель: клик по СТРОКЕ предмета — desc предмета в .cp-notice', () => {
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  env.G.addItem(c, 'iron_sword');
  env.G.equip(c, 'iron_sword');
  const panel = openPanel(env, c);
  const row = itemRowByName(panel._equipBody, 'Железный меч');
  assert.ok(row, 'строка оружия найдена');
  const notice = noticeOf(panel);
  const clickers = panel.listeners.click || [];
  assert.ok(clickers.length === 1, 'один делегированный click-обработчик');
  clickers[0]({ target: row });
  const sword = env.G.getItem('iron_sword');
  assert.ok(notice.textContent.includes(sword.desc),
    'в .cp-notice — desc предмета: ' + sword.desc);
  assert.equal(notice.style.opacity, '1', '.cp-notice подсвечен');
});

test('панель: клик по КНОПКЕ и по строке МАГАЗИНА (без .cp-tip) — notice НЕ появляется', () => {
  // Ветка .cp-btn (и .cp-tab) обрабатывается РАНЬШЕ ветки строк —
  // поведение кнопок без изменений; строки магазина tip НЕ получают
  // (зона 000101) — клик по пустой части строки ничего не делает.
  const env = loadPanelUi();
  const c = env.G.createCharacter(); // points = 0 — «+» не пройдёт
  const panel = openPanel(env, c);
  const notice = noticeOf(panel);

  // Клик по кнопке «+»: reason — во вспышку .cp-req, НО не в notice.
  const { btn } = skillTipRow(panel, 'swordsman');
  (panel.listeners.click || [])[0]({ target: btn });
  assert.equal(notice.textContent, '',
    'клик по кнопке notice НЕ заполняет');

  // Строка магазина: нет .cp-tip — клик ничего не делает.
  env.G.playerUI.setShop(
    env.G.makeShop(0, 0, env.G.BUILDING_TYPES.APOTHECARY, 2));
  env.G.playerUI.render();
  const shopRow = findAll(panel._shopBody, '.cp-itemrow')[0];
  assert.ok(shopRow, 'строка магазина найдена');
  assert.equal(shopRow.querySelector('.cp-tip'), null,
    'у строки магазина НЕТ .cp-tip (магазин — зона 000101)');
  (panel.listeners.click || [])[0]({ target: shopRow });
  assert.equal(notice.textContent, '',
    'клик по строке магазина notice НЕ заполняет');
});

test('панель: пере-рендер после клика «+» сохраняет .cp-tip (тот же узел, актуальный титул); DOM-контракт строк не сломан', () => {
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  c.primary.strength = 10;
  c.secondary.swordsman = 3;
  c.points = 1;
  const panel = openPanel(env, c);
  const { btn, tr, tip } = skillTipRow(panel, 'swordsman');
  assert.ok(tip, '.cp-tip есть до клика');

  (panel.listeners.click || [])[0]({ target: btn });
  assert.equal(c.secondary.swordsman, 4, 'кнопка «+» прокачала навык');
  assert.equal(c.points, 0, 'очко потрачено');

  // render() внутри обработчика НЕ пересобирает строку: узел tip тот
  // же, текст — с актуальным титулом (lvl 4).
  const tipAfter = tr.querySelector('.cp-tip');
  assert.equal(tipAfter, tip, '.cp-tip — тот же DOM-узел после render()');
  assert.ok(tipAfter.textContent.includes(env.G.secondaryName('swordsman', 4)),
    'актуальный титул по names[] в сохранённом узле');

  // DOM-контракт (tests/ui-skills.test.js) не сломан.
  const nameTd = tr.querySelector('.cp-name');
  const lvTd = tr.querySelector('.cp-level');
  const reqTd = tr.querySelector('.cp-req');
  assert.ok(nameTd && lvTd && reqTd,
    'ячейки .cp-name/.cp-level/.cp-req на месте');
  assert.equal(nameTd.textContent,
    env.G.secondaryName('swordsman', 4) + ' (4)', 'имя с титулом и уровнем');
  assert.equal(lvTd.textContent, '4', 'уровень');
  assert.equal(reqTd.textContent, '', 'ниже потолка — требование пусто');
  assert.equal(tr.querySelector('.cp-btn').dataset.skill, 'swordsman',
    'кнопка data-skill не сломана');
});

test('панель: вспышка reason в .cp-req НЕ смешивается с .cp-tip; через 1.5 с — постоянные тексты', async () => {
  // Паттерн 000041: reason неудачного «+» пишется в .cp-req на 1.5 с,
  // потом render() возвращает постоянный текст (пометка потолка).
  // Тултип — стабильное содержимое: reason в него НЕ попадает.
  const env = loadPanelUi();
  const c = env.G.createCharacter(); // points = 0 — «+» не пройдёт
  c.primary.strength = 5;
  c.secondary.swordsman = 10; // потолок практикой: 5×2 = 10
  const panel = openPanel(env, c);
  const { btn, tr, tip } = skillTipRow(panel, 'swordsman');
  assert.ok(tip, '.cp-tip есть');
  const reqTd = tr.querySelector('.cp-req');
  const marker = reqTd.textContent;
  assert.ok(marker.startsWith('потолок практикой:'),
    'пометка потолка до клика: ' + marker);
  const tipBefore = tip.textContent;

  (panel.listeners.click || [])[0]({ target: btn });
  assert.equal(reqTd.textContent, 'нет свободных очков навыков',
    'reason виден в .cp-req (вспышка 1.5 с)');
  assert.ok(!tip.textContent.includes('нет свободных очков навыков'),
    'reason НЕ попал в .cp-tip');
  assert.equal(tip.textContent, tipBefore,
    '.cp-tip — стабильное содержимое во время вспышки');

  await new Promise((r) => setTimeout(r, 1700));
  assert.equal(reqTd.textContent, marker,
    'через 1.5 с пометка потолка восстановлена');
  assert.equal(tip.textContent, tipBefore,
    'через 1.5 с содержимое .cp-tip стабильно');
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

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
//
// 000100 — вкладка «Квесты»: read-only зеркало журнала квестов
// (G.playerUI.setQuests({ npcs, book, day }) + рендер в pane).
// КРАСНЫЕ (падают до реализации, зелёные после):
//   * setQuests — функция; setQuests ДО и ПОСЛЕ открытия панели —
//     pane «Квесты» заполняется (сеттер сам шлёт render(); панель
//     строится лениво — оба порядка вызовов);
//   * kill_group — «повержено 2 из 3 — <имя группы> — в работе»
//     (текст ОДИН в слово с npcUI; «N из M» с M>1 — только
//     синтетикой: в production-каталоге все kill_group ×1);
//   * bring_item — «предмет: <name> ×2 (есть: 1)» по G.totalQty;
//     после addItem(×2) + render() — «(есть: 2)» + «— готов к сдаче»
//     (G.refreshBringItems работает ВНУТРИ render, в т.ч. в СКРЫТОМ
//     pane; мутация book);
//   * kill_group после G.notifyGroupDefeated — «— готов к сдаче»;
//   * «Выполнено» — счётчик = book.done.length + названия из
//     каталога; id вне каталога — голый id (фолбэк npcUI);
//   * book = null — «Журнал квестов недоступен.» (текст npcUI);
//   * ОДИН рендерер строк «В работе»: npcUI-оверлей и панель строят
//     ПОСТРОЧНО ОДИНАКОВЫЕ name+meta (production-каталог: orc_raid
//     ready + moon_stone); кнопка «сдать» data-npcact='turnin' —
//     только у npcUI, у панели НЕТ.
//   * main.js (структурный): проводка G.playerUI.setQuests под
//     guard-сеткой с npcs: NPCS, book: questBook; чтение clock.day —
//     НЕ ранее `const clock = G.createClock()` (TDZ-ловушка: clock
//     объявлен ПОСЛЕ questBook); после восстановления журнала —
//     playerUI.render() (журнал мутируется in place — re-wiring
//     не нужен).
// ЗЕЛЁНЫЕ с первого запуска (контракты, обязаны остаться):
//   * read-only: в pane «Квесты» НЕТ кнопок вообще — ни data-npcact,
//     ни .cp-btn (клик по .cp-btn без data.act улетит в ветку
//     навыка — raiseSkill(c, undefined));
//   * saveNow: (а) /saveNow/ НЕ встречается в src/ui.js (структурно);
//     (б) в песочнице G.saveNow = spy — setQuests/render spy НЕ
//     вызывают (refreshBringItems мутирует book, но сейв — только
//     main.js/диалог NPC).
//   * npcUI-регрессия (защита экстракции рендерера): «В работе»
//     диалога NPC — те же строки, у ready — кнопка «сдать», клик по
//     ней (onOverlayClick) сдаёт квест с наградой; «Выполнено» —
//     название (questById не сломан).
//
// РЕГРЕССИЯ БЕЗ ИЗМЕНЕНИЙ: tests/npc.test.js, tests/ui-skills.test.js,
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
// Селекторы, которые использует ui.js: «.класс», имя тега ('tr') и
// (000100) 'тег[атрибут]' / 'тег[атрибут=значение]' — onOverlayClick
// npcUI делает closest('button[data-npcact]'), без этого переключить
// оверлей на вкладку «квесты» в тесте нельзя (расширение regex-
// паттерном — копия tests/npc-hire.test.js; дублирование стабов
// принято в проекте). Связка вкладка↔pane — по ПОРЯДКУ записей
// data-driven-массива (таб i ↔ pane i).

function matchesSel(el, sel) {
  // 'тег[атрибут]' / 'тег[атрибут=значение]' — расширение (000100).
  const m = /^([a-zA-Z][\w-]*)\[([\w-]+)(?:=([^\]]+))?\]$/.exec(sel);
  if (m) {
    if (String(el.tagName || '').toLowerCase() !== m[1].toLowerCase()) {
      return false;
    }
    // Стаб хранит атрибуты dataset БЕЗ префикса 'data-' (ui.js пишет
    // btn.dataset.npcact напрямую); setAttribute — с именем как есть.
    // Проверяем оба варианта ключа.
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
// tests/index-order.test.js). 000130: между combat-keys.js и ui.js —
// реестр + саморегистрирующиеся вкладочные модули (тех. правка:
// файлы переехали, поведение — то же).
const CHAIN = [
  'global-settings.js', 'perlin.js', 'mapseed.js',
  'skills-data.js', 'items-data.js', 'npc-data.js',
  'map.js', 'player.js', 'day.js', 'items.js', 'buildings.js',
  'npc.js', 'combat.js', 'dungeon.js',
  'controls.js', 'combat-keys.js',
  'ui-tabs.js', 'ui-tab-skills.js', 'ui-tab-inventory.js',
  'ui-tab-settings.js', 'ui-tab-shop.js', 'ui-tab-quests.js',
  'ui.js',
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

// --- 000100: вкладка «Квесты» — read-only зеркало журнала квестов ---
//
// Слой: G.playerUI.setQuests({ npcs, book, day }) + рендер тела
// «Квесты» в src/ui.js (панель) и общий рендерер строк «В работе»
// (вынесен из renderQuestsTab npcUI: ОДИН рендерер на оба дерева,
// кнопка «сдать» — параметр; npcUI — true, панель — false).
// Ядро — src/npc.js (activeQuests/refreshBringItems/notifyGroup-
// Defeated — tests/npc.test.js); проводка — src/main.js
// (ОДИН hunk, ПОСЛЕ `const clock = G.createClock()` — TDZ).
//
// Каталог: production-каталог (assets/npc) даёт точные тексты для
// теста «один рендерер» (orc_raid/moon_stone), но ВСЕ его
// kill_group-квесты — количество 1, поэтому форма «N из M» с M>1
// проверяется на ЛОКАЛЬНОМ каталоге-фикстуре (setQuests({ npcs })
// принимает каталог параметром — вся цепочка G.activeQuests →
// строка проходит с фикстурой).

// pane «Квесты» — правый столбец, 3-й таб (порядок RIGHT_TABS).
function questsPaneOf(panel) {
  const cols = colsOf(panel);
  const rp = panesOf(cols[1]);
  assert.equal(rp.length, 3, 'правый столбец: 3 pane');
  return rp[2];
}

// Секция pane/оверлея по точному заголовку (el('div','cp-section',
// «В работе») — как в npcUI; textContent стаба — текст-нод узла).
function sectionByTitle(root, title) {
  return findAll(root, '.cp-section')
    .find((s) => s.textContent === title) || null;
}

// Строки секции «В работе»: { name, meta, row }. name — span
// .cp-itemname (у «Выполнено» — сам текст строки), meta — span
// .cp-itemmeta (отсутствует — '').
function activeRowsOf(root) {
  const sec = sectionByTitle(root, 'В работе');
  assert.ok(sec, 'секция «В работе» найдена');
  return findAll(sec, '.cp-itemrow').map((r) => ({
    name: (r.querySelector('.cp-itemname') || r).textContent,
    meta: (r.querySelector('.cp-itemmeta') || { textContent: '' })
      .textContent,
    row: r,
  }));
}

// Весь текст поддерева: textContent стаба НЕ агрегирует детей —
// собираем текст-ноды листьев (для pane-ассертов).
function textOf(root) {
  const out = [];
  const walk = (n) => {
    if (n._text) out.push(n._text);
    for (const ch of n.children || []) walk(ch);
  };
  walk(root);
  return out.join('\n');
}

// Каталог-фикстура: kill_group с количеством 3 («повержено 2 из 3»
// недостижимо в production-каталоге — все kill_group там ×1) и
// bring_item ×2 (moonstone — в каталоге предметов).
function fixtureCatalog() {
  return [
    {
      id: 'fix_inn', имя: 'Фикса', роль: 'тавернщица',
      квесты: [
        { id: 'fix_kill3', название: 'Очистить перевал',
          описание: 'Три группы мобов на перевале.',
          цель: { тип: 'kill_group', группа: 1, количество: 3 },
          награда: { опыт: 10, золото: 10, предметы: [] },
          предыдущий: null },
        { id: 'fix_bring2', название: 'Собрать лунные камни',
          описание: 'Нужно два лунных камня.',
          цель: { тип: 'bring_item', предмет: 'moonstone', количество: 2 },
          награда: { опыт: 10, золото: 10, предметы: [] },
          предыдущий: null },
      ],
    },
    {
      id: 'fix_hermit', имя: 'Отшельник', роль: 'знахарь',
      квесты: [
        { id: 'fix_done', название: 'Дымный след',
          описание: 'Взять на след дымного вора.',
          цель: { тип: 'kill_group', группа: 2, количество: 1 },
          награда: { опыт: 5, золото: 5, предметы: [] },
          предыдущий: null },
      ],
    },
  ];
}

// --- КРАСНЫЕ: сеттер и порядок вызовов ---

test('000100 RED: G.playerUI.setQuests — функция', () => {
  const env = loadPanelUi();
  assert.equal(typeof env.G.playerUI.setQuests, 'function',
    'G.playerUI.setQuests({ npcs, book, day }) существует ' +
    '(проводка журнала квестов в панель)');
});

test('000100 RED: setQuests ДО открытия панели — первый render заполняет вкладку', () => {
  // Порядок setQuests → toggle: панель ещё не построена (buildPanel —
  // лениво в toggle); сеттер хранит состояние, первый render()
  // (из toggle(true)) обязан нарисовать журнал в pane.
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  const npcs = fixtureCatalog();
  const book = env.G.createQuestBook();
  book.active.fix_kill3 = { npcId: 'fix_inn', questId: 'fix_kill3',
    status: 'active', progress: 1 };
  env.G.playerUI.setQuests({ npcs, book, day: 1 });
  const panel = openPanel(env, c);
  const pane = questsPaneOf(panel);
  assert.ok(textOf(pane).includes('Очистить перевал'),
    'вкладка «Квесты» нарисована при первом render: ' + textOf(pane));
  assert.ok(!textOf(pane).includes('квесты появятся позже'),
    'placeholder «квесты появятся позже» заменён журналом');
});

test('000100 RED: setQuests ПОСЛЕ открытия панели — сеттер сам шлёт render()', () => {
  // Порядок toggle → setQuests: панель уже открыта (активна вкладка
  // «Снаряжение»); сеттер обязан триггернуть render() (паттерн
  // setCharacter/setShop) — БЕЗ явного render() вызывающим.
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  const panel = openPanel(env, c);
  const pane = questsPaneOf(panel);
  const npcs = fixtureCatalog();
  const book = env.G.createQuestBook();
  book.active.fix_kill3 = { npcId: 'fix_inn', questId: 'fix_kill3',
    status: 'active', progress: 2 };
  env.G.playerUI.setQuests({ npcs, book, day: 1 });
  assert.ok(textOf(pane).includes('Очистить перевал'),
    'pane обновлён setQuests без явного render(): ' + textOf(pane));
  assert.ok(!textOf(pane).includes('квесты появятся позже'),
    'placeholder убран');
});

// --- КРАСНЫЕ: строки «В работе» (тексты — дословно из npcUI) ---

test('000100 RED: kill_group — «повержено 2 из 3 — <группа> — в работе»', () => {
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  const npcs = fixtureCatalog();
  const book = env.G.createQuestBook();
  book.active.fix_kill3 = { npcId: 'fix_inn', questId: 'fix_kill3',
    status: 'active', progress: 2 };
  const panel = openPanel(env, c);
  env.G.playerUI.setQuests({ npcs, book, day: 1 });
  const rows = activeRowsOf(questsPaneOf(panel));
  assert.equal(rows.length, 1, '«В работе» — одна строка');
  assert.equal(rows[0].name, 'Очистить перевал', 'название квеста');
  assert.equal(rows[0].meta,
    'повержено 2 из 3 — ' + env.G.mobGroupName(1) + ' — в работе',
    'meta — точная форма npcUI (общий рендерер): ' + rows[0].meta);
});

test('000100 RED: bring_item — «(есть: 1)»; после addItem+render — «(есть: 2)» + «— готов к сдаче» (refreshBringItems внутри render)', () => {
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  const npcs = fixtureCatalog();
  const book = env.G.createQuestBook();
  book.active.fix_bring2 = { npcId: 'fix_inn', questId: 'fix_bring2',
    status: 'active', progress: 0 };
  env.G.addItem(c, 'moonstone'); // 1 из 2
  const panel = openPanel(env, c);
  const pane = questsPaneOf(panel);
  env.G.playerUI.setQuests({ npcs, book, day: 1 });
  let rows = activeRowsOf(pane);
  assert.equal(rows[0].meta,
    'предмет: ' + env.G.getItem('moonstone').name +
    ' ×2 (есть: 1) — в работе',
    'meta — название предмета, цель и реальный count (G.totalQty): ' +
    rows[0].meta);
  assert.equal(book.active.fix_bring2.status, 'active',
    '1 предмета — квест ещё в работе');
  // Второй предмет + render(): refreshBringItems обязан отработать
  // ВНУТРИ render ДО отрисовки строки (паттерн npcUI) — и в СКРЫТОМ
  // pane (активна вкладка «Снаряжение»).
  env.G.addItem(c, 'moonstone');
  env.G.playerUI.render();
  rows = activeRowsOf(pane);
  assert.equal(rows[0].meta,
    'предмет: ' + env.G.getItem('moonstone').name +
    ' ×2 (есть: 2) — готов к сдаче',
    'после refreshBringItems — «(есть: 2)» и маркер готовности: ' +
    rows[0].meta);
  assert.equal(book.active.fix_bring2.status, 'ready',
    'refreshBringItems сработал внутри render (мутация журнала)');
});

test('000100 RED: kill_group после G.notifyGroupDefeated — «— готов к сдаче»', () => {
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  const npcs = fixtureCatalog();
  const book = env.G.createQuestBook();
  book.active.fix_kill3 = { npcId: 'fix_inn', questId: 'fix_kill3',
    status: 'active', progress: 2 };
  const panel = openPanel(env, c);
  env.G.playerUI.setQuests({ npcs, book, day: 1 });
  // Третье поражение группы 1 (в игре — main.js после боя).
  // (join(','), а не deepEqual: массив из vm-песочницы — чужой realm,
  // deepStrictEqual сравнивает прототипы и падает.)
  const ready = env.G.notifyGroupDefeated(npcs, book, 1);
  assert.equal(ready.join(','), 'fix_kill3', 'квест стал готов к сдаче');
  env.G.playerUI.render();
  const rows = activeRowsOf(questsPaneOf(panel));
  assert.equal(rows[0].meta,
    'повержено 3 из 3 — ' + env.G.mobGroupName(1) + ' — готов к сдаче',
    'ready-строка: ' + rows[0].meta);
});

// --- КРАСНЫЕ: «Выполнено», пустой журнал, book = null ---

test('000100 RED: «Выполнено» — счётчик = book.done.length + названия; чужой id — голый', () => {
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  const npcs = fixtureCatalog();
  const book = env.G.createQuestBook();
  book.done.push('fix_done');       // есть в каталоге — название
  book.done.push('no_such_quest');  // вне каталога — голый id (npcUI)
  const panel = openPanel(env, c);
  env.G.playerUI.setQuests({ npcs, book, day: 1 });
  const done = sectionByTitle(questsPaneOf(panel), 'Выполнено');
  assert.ok(done, 'секция «Выполнено» найдена');
  const metas = findAll(done, '.cp-itemmeta').map((m) => m.textContent);
  assert.ok(
    metas.some((t) => t.includes(String(book.done.length))),
    'счётчик = book.done.length (' + book.done.length + '): ' +
    metas.join(' | '));
  const rows = findAll(done, '.cp-itemrow')
    .map((r) => (r.querySelector('.cp-itemname') || r).textContent);
  assert.ok(rows.includes('Дымный след'),
    'название из каталога (общий questById): ' + rows.join(' | '));
  assert.ok(rows.includes('no_such_quest'),
    'id вне каталога — голый id (фолбэк npcUI)');
});

test('000100 RED: пустой журнал — «нет активных квестов» + «пока ничего» (тексты npcUI)', () => {
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  const panel = openPanel(env, c);
  env.G.playerUI.setQuests({ npcs: fixtureCatalog(),
    book: env.G.createQuestBook(), day: 1 });
  const t = textOf(questsPaneOf(panel));
  assert.ok(t.includes('нет активных квестов'),
    'пустая «В работе» — как в npcUI: ' + t);
  assert.ok(t.includes('пока ничего'),
    'пустое «Выполнено» — как в npcUI: ' + t);
});

test('000100 RED: book = null — «Журнал квестов недоступен.» (текст npcUI)', () => {
  // UMD-ловушка main.js (G.createQuestBook отсутствует — book null);
  // в песочнице npc.js загружен, null — только явным setQuests.
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  const panel = openPanel(env, c);
  env.G.playerUI.setQuests({ npcs: fixtureCatalog(), book: null, day: 1 });
  const t = textOf(questsPaneOf(panel));
  assert.ok(t.includes('Журнал квестов недоступен.'),
    'плейсхолдер без журнала — дословно как npcUI: ' + t);
});

// --- КРАСНЫЕ: ОДИН рендерер (npcUI-оверлей ≡ панель) ---

test('000100 RED: npcUI и панель строят ОДИНАКОВЫЕ строки «В работе» (один рендерер); «сдать» — только у npcUI', () => {
  // Production-каталог: npcUI рендерит из G.NpcData, панель получает
  // те же npcs через setQuests — строки обязаны совпасть ПОСТРОЧНО
  // (экстракция рендерера прозрачна). orc_raid — kill_group ready
  // (кнопка «сдать» у npcUI есть, у панели — НЕТ), moon_stone —
  // bring_item ×2 при 1 камне у героя.
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  const NPCS = env.G.NpcData.NPCS;
  const npcElder = env.G.npcById(NPCS, 'elder');
  assert.ok(npcElder, 'Элдира (elder) в каталоге');
  const book = env.G.createQuestBook();
  book.active.orc_raid = { npcId: 'tavern_keeper', questId: 'orc_raid',
    status: 'ready', progress: 1 };
  book.active.moon_stone = { npcId: 'elder', questId: 'moon_stone',
    status: 'active', progress: 0 };
  env.G.addItem(c, 'moonstone'); // 1 из 2

  // 1) npcUI: открыть диалог, переключиться на вкладку «квесты» —
  // делегированный клик оверлея (стаб теперь знает 'button[data-npcact]').
  env.G.npcUI.open({ npc: npcElder, character: c, book });
  const overlay = findAll(env.body, '.npc-overlay')[0];
  assert.ok(overlay, 'оверлей npcUI открыт');
  const tabBtn = findAll(overlay, 'button')
    .find((b) => b.dataset.npcact === 'tab' && b.dataset.tab === 'quests');
  assert.ok(tabBtn, 'кнопка вкладки «квесты» в оверлее');
  const overlayClickers = overlay.listeners.click || [];
  assert.ok(overlayClickers.length >= 1, 'делегированный click оверлея');
  overlayClickers[0]({ target: tabBtn });

  // 2) Панель: те же npcs + ТОТ ЖЕ журнал.
  const panel = openPanel(env, c);
  env.G.playerUI.setQuests({ npcs: NPCS, book, day: 1 });

  // Деревья РАЗНЫЕ: оверлей и панель в одном стаб-body — извлечение
  // строго по своим корням (findAll по body смешало бы оба дерева).
  const npcRows = activeRowsOf(overlay);
  const paneRows = activeRowsOf(questsPaneOf(panel));
  assert.equal(npcRows.length, 2, 'npcUI: 2 активных квеста');
  assert.equal(paneRows.length, 2, 'панель: 2 строки (те же)');
  for (let i = 0; i < npcRows.length; i++) {
    assert.equal(paneRows[i].name, npcRows[i].name,
      'строка ' + i + ': название ОДНО (один рендерер)');
    assert.equal(paneRows[i].meta, npcRows[i].meta,
      'строка ' + i + ': meta ОДНО (один рендерер)');
  }
  // Точные формы (production-каталог):
  const orc = npcRows.find((r) => r.name === 'Орочий набег');
  assert.ok(orc, 'строка «Орочий набег» есть');
  assert.equal(orc.meta,
    'повержено 1 из 1 — ' + env.G.mobGroupName(1) + ' — готов к сдаче');
  const stone = npcRows.find((r) => r.name === 'Лунный обряд');
  assert.ok(stone, 'строка «Лунный обряд» есть');
  assert.equal(stone.meta,
    'предмет: ' + env.G.getItem('moonstone').name +
    ' ×2 (есть: 1) — в работе');

  // Кнопка «сдать» (data-npcact='turnin') — ТОЛЬКО у npcUI.
  const orcNpcRow = findAll(overlay, '.cp-itemrow')
    .find((r) => (r.querySelector('.cp-itemname') || r).textContent
      === 'Орочий набег');
  const turnin = (orcNpcRow.querySelectorAll('button') || [])
    .find((b) => b.dataset.npcact === 'turnin');
  assert.ok(turnin, 'npcUI: ready-квест — кнопка «сдать» data-npcact=turnin');
  assert.equal(turnin.dataset.quest, 'orc_raid', 'кнопка указывает на квест');
  const orcPaneRow = findAll(questsPaneOf(panel), '.cp-itemrow')
    .find((r) => (r.querySelector('.cp-itemname') || r).textContent
      === 'Орочий набег');
  assert.ok(orcPaneRow, 'панель: строка «Орочий набег» есть');
  assert.equal(orcPaneRow.querySelectorAll('button').length, 0,
    'панель: ready-квест БЕЗ кнопок (read-only)');
});

test('000100 RED: скрытый pane обновляется render(); активная вкладка не сбрасывается', () => {
  // render() — in-place (000096): pane не пересобирается, активная
  // вкладка НЕ сбрасывается — и скрытое тело «Квесты» обновляется
  // каждым render (иначе прогресс квестов просрочен после боя).
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  const panel = openPanel(env, c);
  const cols = colsOf(panel);
  const right = cols[1];
  const rp = panesOf(right);
  clickTab(panel, right, 2); // «Квесты»
  clickTab(panel, right, 0); // обратно на «Снаряжение» — «Квесты» скрыт
  assert.equal(rp[2].style.display, 'none', '«Квесты» — скрытый pane');
  const npcs = fixtureCatalog();
  const book = env.G.createQuestBook();
  book.active.fix_kill3 = { npcId: 'fix_inn', questId: 'fix_kill3',
    status: 'active', progress: 2 };
  env.G.playerUI.setQuests({ npcs, book, day: 1 });
  assert.ok(textOf(rp[2]).includes('Очистить перевал'),
    'скрытый pane «Квесты» обновлён render()');
  assert.notEqual(rp[0].style.display, 'none',
    'активная вкладка НЕ сбросилась («Снаряжение» активна)');
  assert.equal(rp[2].style.display, 'none',
    'обновление не переключает вкладку на «Квесты»');
});

// --- КРАСНЫЕ: проводка в main.js (структурный) ---

test('main.js: проводка setQuests (npcs: NPCS, book: questBook) под guard' + 'ом; clock.day — после createClock (TDZ)', () => {
  // Поведенческого теста main.js в проекте нет (игра не запускается
  // в песочнице) — структурный (паттерн теста toggle(false) выше).
  const text = src('main.js');
  const clockIdx = text.indexOf('G.createClock()');
  assert.ok(clockIdx > -1, 'main.js: const clock = G.createClock()');
  const calls = Array.from(text.matchAll(/playerUI\s*\.\s*setQuests\s*\(\s*{/g));
  assert.ok(calls.length >= 1,
    'main.js: журнал квестов передан панели (G.playerUI.setQuests)');
  let wired = false;
  for (const m of calls) {
    const args = text.slice(m.index, m.index + 300);
    if (/npcs\s*:\s*NPCS/.test(args) && /book\s*:\s*questBook/.test(args)) {
      wired = true;
    }
    // TDZ-ловушка: clock объявлен ПОСЛЕ questBook — чтение clock.day
    // ДО `const clock` = ReferenceError при старте.
    if (/clock\s*\.\s*day/.test(args)) {
      assert.ok(m.index > clockIdx,
        'setQuests с day: clock.day читается ПОСЛЕ const clock ' +
        '(иначе TDZ-ReferenceError роняет игру при старте)');
    }
    // UMD-гард: ui.js может не создался (порядок/ошибка) — вызов
    // обязан быть под guard-сеткой G.playerUI.
    const before = text.slice(Math.max(0, m.index - 60), m.index);
    assert.ok(/G\s*\.\s*playerUI/.test(before),
      'вызов setQuests под guard' + 'ом G.playerUI (UMD-ловушка)');
  }
  assert.ok(wired, 'проводка передаёт npcs: NPCS и book: questBook');
});

test('main.js: после восстановления журнала квестов — playerUI.render() (in-place мутация, re-wiring не нужен)', () => {
  // restoreFromSave мутирует questBook in place (та же ссылка) —
  // повторный setQuests не нужен; панель обязана перерисоваться
  // существующим playerUI.render() в зоне восстановления.
  const text = src('main.js');
  const deskIdx = text.indexOf('G.deserializeQuestBook');
  assert.ok(deskIdx > -1, 'main.js: восстановление журнала (deserializeQuestBook)');
  const after = text.slice(deskIdx, deskIdx + 1500);
  assert.match(after, /playerUI[\s\S]{0,60}?render\s*\(\s*\)/,
    'после восстановления журнала панель перерисовывается render()');
});

// --- ЗЕЛЁНЫЕ с первого запуска: read-only, saveNow, npcUI-регрессия ---

test('000100 контракт: в вкладке «Квесты» НЕТ кнопок вообще (read-only: ни data-npcact, ни .cp-btn)', () => {
  // Read-only (решение задачи): взять/сдать — только в диалоге NPC.
  // Строго «ни одной .cp-btn» (не только «нет data-npcact»):
  // делегированный клик панели ведёт .cp-btn без data.act в ветку
  // навыка — raiseSkill(c, undefined), и у кнопки вне <tr>
  // closest('tr') === null → TypeError в обработчике.
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  const npcs = fixtureCatalog();
  const book = env.G.createQuestBook();
  book.active.fix_kill3 = { npcId: 'fix_inn', questId: 'fix_kill3',
    status: 'ready', progress: 3 };
  book.active.fix_bring2 = { npcId: 'fix_inn', questId: 'fix_bring2',
    status: 'ready', progress: 0 };
  const panel = openPanel(env, c);
  if (typeof env.G.playerUI.setQuests === 'function') {
    env.G.playerUI.setQuests({ npcs, book, day: 1 });
  }
  const pane = questsPaneOf(panel);
  assert.equal(findAll(pane, 'button').length, 0,
    'в «Квесты» нет <button> ни одного (готовые квесты — тоже)');
  assert.equal(findAll(pane, '.cp-btn').length, 0,
    '.cp-btn нет — клик не уйдёт в ветку навыка панели');
});

test('000100 контракт: saveNow НЕТ в src/ui.js (структурно) и не вызывается панелью (spy)', () => {
  // refreshBringItems мутирует book прямо из render() панели — но
  // запись в сейв — только main.js/диалог NPC (сейв v1, миграций
  // нет; 'ready' сериализуется ближайшим штатным saveNow — легитимно).
  assert.doesNotMatch(src('ui.js'), /saveNow/,
    'src/ui.js не содержит saveNow (панель сейв не трогает)');
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  let saves = 0;
  env.G.saveNow = () => { saves += 1; };
  const npcs = fixtureCatalog();
  const book = env.G.createQuestBook();
  book.active.fix_bring2 = { npcId: 'fix_inn', questId: 'fix_bring2',
    status: 'active', progress: 0 };
  env.G.addItem(c, 'moonstone', 2); // refreshBringItems отметит ready
  const panel = openPanel(env, c);
  if (typeof env.G.playerUI.setQuests === 'function') {
    env.G.playerUI.setQuests({ npcs, book, day: 1 });
  }
  env.G.playerUI.render();
  env.G.playerUI.render();
  assert.equal(saves, 0,
    'G.saveNow не вызван панелью (setQuests/render), хотя refreshBringItems мутирует журнал');
});

test('npcUI-регрессия (защита экстракции): «В работе» — те же строки, «сдать» (onOverlayClick) сдаёт квест с наградой', () => {
  // До/после выноса общего рендерера: диалог NPC рендерит «В работе»
  // в прежних строках, у ready — кнопка «сдать» data-npcact='turnin',
  // её клик-ветка onOverlayClick не сломана; «Выполнено» — название
  // через questById (общий findQuestInCatalog).
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  const NPCS = env.G.NpcData.NPCS;
  const npc = env.G.npcById(NPCS, 'tavern_keeper');
  assert.ok(npc, 'Берта (tavern_keeper) в каталоге');
  const book = env.G.createQuestBook();
  const acc = env.G.acceptQuest(book, NPCS, npc, 'orc_raid', 1);
  assert.ok(acc.ok, 'квест взят');
  // (join(','): массив из vm-песочницы — чужой realm, deepStrictEqual
  // сравнивает прототипы и падает.)
  assert.equal(env.G.notifyGroupDefeated(NPCS, book, 1).join(','),
    'orc_raid', 'группа повержена — квест ready');
  env.G.npcUI.open({ npc, character: c, book });
  const overlay = findAll(env.body, '.npc-overlay')[0];
  const tabBtn = findAll(overlay, 'button')
    .find((b) => b.dataset.npcact === 'tab' && b.dataset.tab === 'quests');
  assert.ok(tabBtn, 'вкладка «квесты» в оверлее');
  (overlay.listeners.click || [])[0]({ target: tabBtn });

  const rows = activeRowsOf(overlay);
  assert.equal(rows.length, 1, '«В работе» — одна строка');
  assert.equal(rows[0].name, 'Орочий набег', 'название (npcUI-рендер)');
  assert.equal(rows[0].meta,
    'повержено 1 из 1 — ' + env.G.mobGroupName(1) + ' — готов к сдаче',
    'meta-строка npcUI без изменений: ' + rows[0].meta);
  const turnin = rows[0].row.querySelectorAll('button')
    .find((b) => b.dataset.npcact === 'turnin');
  assert.ok(turnin, 'у ready-квеста кнопка «сдать»');
  assert.equal(turnin.dataset.quest, 'orc_raid', 'data-quest');

  // Клик по «сдать» — ветка onOverlayClick: награда ровно один раз.
  const goldBefore = c.gold;
  const xpBefore = c.xp;
  (overlay.listeners.click || [])[0]({ target: turnin });
  assert.equal(book.active.orc_raid, undefined, 'квест сдан (active чист)');
  assert.ok(book.done.includes('orc_raid'), 'квест в done');
  assert.ok(c.gold > goldBefore, 'награда: золото');
  assert.ok(c.xp > xpBefore, 'награда: опыт');
  // «Выполнено» — название квеста (questById не сломан экстракцией).
  const done = sectionByTitle(overlay, 'Выполнено');
  assert.ok(done, 'секция «Выполнено»');
  assert.ok(textOf(done).includes('Орочий набег'),
    'название в «Выполнено»: ' + textOf(done));
});

// =====================================================================
// 000130 — вкладки панели: саморегистрирующиеся модули
// =====================================================================
//
// Задача: вкладки панели персонажа (LEFT_TABS/RIGHT_TABS в src/ui.js)
// переезжают в саморегистрирующиеся модули: src/ui-tabs.js — реестр
// Game.uiTabs = { register(tab), get(id), list() } (вкладки грузятся
// ДО ui.js и регистрируются при ЗАГРУЗКЕ — реестр обязан существовать
// раньше первой вкладки); src/ui-tab-*.js — вкладки (UMD по образцу
// src/cities.js: node-ветка — определение, браузерная —
// self-registration). Ядро панели (два столбца, переключение,
// тултипы, [I]/Esc, setShop/setQuests-проводка, render-цикл) остаётся
// в ui.js и читает реестр ЛЕНИВО в buildPanel.
// Контракт: memory/000130-ui-tabs.md (форма записи { column, id,
// label, build(pane, ctx), render?(ctx) }, ctx, порядок = порядок
// регистрации = порядок script-тегов, зафиксирован пином
// tests/index-order.test.js).
//
// ДОБАВЛЕНИЕ вкладки = новый файл src/ui-tab-*.js + script-тег
// (между ui-tabs.js и ui.js в index.html); ui.js при этом НЕ
// правится — анти-прецедент закреплён тестом R4 (тестовая вкладка
// саморегистрацией в песочнице + doesNotMatch по тексту src/ui.js).
//
// КРАСНЫЕ (падают до реализации — Game.uiTabs/модулей ещё нет,
// зелёные после):
//   * R1: Game.uiTabs — реестр: register/get/list; get(нет) → null;
//   * R2: зарегистрированы ВСЕ 6 вкладок — id/label/column/порядок
//     1:1 с текущими столбцами (левый: character→inventory→settings;
//     правый: equipment→shop→quests; «Навыки» — это строки во вкладке
//     «Персонаж», отдельной вкладки нет — ТЗ 000130 vs 000096);
//   * R3: панель строится ИЗ реестра — кнопки .cp-tab в каждом
//     столбце (порядок/подпись/data-tabid) и pane 1:1 с записями
//     list() для колонки; побайтовый рендер — фиксаторы (42
//     существующих теста файла, тот же запуск);
//   * R4: анти-прецедент — тестовая вкладка ИНЛАЙН-UMD-сниппетом
//     («новый файл» в песочнице, саморегистрация) появляется в
//     панели, а src/ui.js НЕ содержит её id (ui.js не изменялся);
//   * R6: node — require() каждого src/ui-tabs.js/src/ui-tab-*.js
//     чист (UMD-node-ветка: DOM при загрузке — краш в node,
//     взаимных require и RNG — ноль) и возвращает определение
//     вкладки (quests — + плоский game-экспорт
//     buildActiveQuestRow/findQuestInCatalog — ОДИН рендерер строк
//     «В работе» на панель и npcUI, 000100).
// R5 (index.html: теги ДО ui.js, полная цепочка + самоперечисление
// файлов на диске) — в tests/index-order.test.js (пин предписан ТЗ).
//
// ЛОАДЕР секции — СВОЯ динамическая цепочка из index.html (паттерн
// tests/main-visuals.test.js: все <script>-теги до ui.js
// включительно). RED-фаза: тегов ui-tabs.*/ui-tab-* в index.html
// ещё нет — цепочка грузится штатно, тесты падают по СИМВОЛУ
// Game.uiTabs (не ENOENT, не SyntaxError); GREEN-фаза: теги
// подхватываются сами — лоадер между фазами НЕ правится. ЖЁСТКИЙ
// CHAIN существующих 42 тестов этого файла в RED-фазе НЕ трогается
// (техническая правка — GREEN-коммит).
//
// РЕГРЕССИЯ БЕЗ ИЗМЕНЕНИЙ: 42 теста этого файла (верстка/подписи/
// тултипы/квесты/гарды), tests/ui-skills.test.js, tests/npc-hire.
// test.js, tests/main-visuals.test.js, tests/save-restore.test.js,
// полный npm test.

const CHAIN_000130 = (() => {
  const all = Array.from(
    page().matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
    .map((p) => p.replace(/^src\//, ''));
  const i = all.indexOf('ui.js');
  assert.ok(i >= 0, 'ui.js подключён в index.html');
  return all.slice(0, i + 1);
})();

// Песочница секции (дублирование стаба loadPanelUi принято в
// проекте): цепочка — CHAIN_000130 (динамическая, из index.html);
// дополнительно возвращает sandbox — R4 исполняет в нём «новый файл
// вкладки» (инлайн-UMD-сниппет) между загрузкой цепочки и toggle
// (buildPanel ленивый — регистрация успевает до первой сборки).
function loadTabsUi() {
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
  for (const f of CHAIN_000130) vm.runInContext(src(f), sandbox, { filename: f });
  return { G: sandbox.Game, body: document.body, doc: document,
    errors, sandbox };
}

test('000130 RED: Game.uiTabs — реестр: register/get/list', () => {
  const env = loadTabsUi();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  const reg = env.G.uiTabs;
  assert.ok(reg && typeof reg === 'object',
    'Game.uiTabs — реестр вкладок (src/ui-tabs.js, задача 000130): ' +
    'вкладки регистрируются при загрузке ДО ui.js');
  for (const m of ['register', 'get', 'list']) {
    assert.equal(typeof reg[m], 'function', 'Game.uiTabs.' + m + '()');
  }
  assert.ok(Array.isArray(reg.list()),
    'uiTabs.list() — массив записей в порядке регистрации');
  assert.equal(reg.get('no_such_tab_000130'), null,
    'get(отсутствующий id) → null');
});

test('000130 RED: зарегистрированы ВСЕ 6 вкладок (id/label/column/порядок = текущие столбцы)', () => {
  const env = loadTabsUi();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  const reg = env.G.uiTabs;
  assert.ok(reg && typeof reg === 'object',
    'Game.uiTabs — реестр вкладок (задача 000130)');
  const list = reg.list();
  assert.ok(Array.isArray(list), 'uiTabs.list() — массив записей');
  // Текущие столбцы 1:1 (побайтовые подписи — фиксаторы этого же
  // файла). Левый: Персонаж/Инвентарь/Игровые настройки; правый:
  // Снаряжение/Магазин/Квесты. Порядок записей внутри столбца =
  // порядок регистрации = порядок script-тегов (пин index-order).
  const left = list.filter((t) => t.column === 0);
  const right = list.filter((t) => t.column === 1);
  assert.equal(list.length, 6,
    'реестр — ровно 6 записей: ' + list.map((t) => t.id).join(','));
  assert.equal(left.length, 3, 'левый столбец — 3 записи');
  assert.equal(right.length, 3, 'правый столбец — 3 записи');
  const expectLeft = [
    ['character', 'Персонаж'],
    ['inventory', 'Инвентарь'],
    ['settings', 'Игровые настройки'],
  ];
  const expectRight = [
    ['equipment', 'Снаряжение'],
    ['shop', 'Магазин'],
    ['quests', 'Квесты'],
  ];
  for (let i = 0; i < 3; i++) {
    assert.equal(left[i].id, expectLeft[i][0], 'левый ' + i + ': id');
    assert.equal(left[i].label, expectLeft[i][1],
      'левый ' + i + ': label (побайтово, 000096)');
    assert.equal(right[i].id, expectRight[i][0], 'правый ' + i + ': id');
    assert.equal(right[i].label, expectRight[i][1],
      'правый ' + i + ': label (побайтово, 000096)');
    assert.equal(typeof left[i].build, 'function',
      left[i].id + ': build(pane, ctx) — функция');
    assert.equal(typeof right[i].build, 'function',
      right[i].id + ': build(pane, ctx) — функция');
  }
});

test('000130 RED: панель строится ИЗ реестра — DOM-вкладки = записи; рендер тот же', () => {
  const env = loadTabsUi();
  const reg = env.G.uiTabs;
  assert.ok(reg && typeof reg === 'object',
    'Game.uiTabs — реестр вкладок (задача 000130)');
  const list = reg.list();
  assert.ok(Array.isArray(list), 'uiTabs.list() — массив записей');
  const c = env.G.createCharacter();
  const panel = openPanel(env, c);
  const cols = colsOf(panel);
  for (const col of [0, 1]) {
    const expected = list.filter((t) => t.column === col);
    const tabs = tabsOf(cols[col]);
    const panes = panesOf(cols[col]);
    assert.equal(tabs.length, expected.length,
      'столбец ' + col + ': кнопки .cp-tab = записи реестра (' +
      expected.map((t) => t.id).join(','));
    assert.equal(panes.length, expected.length,
      'столбец ' + col + ': pane на каждую запись');
    for (let i = 0; i < expected.length; i++) {
      assert.equal(tabs[i].textContent, expected[i].label,
        'столбец ' + col + ' кнопка ' + i + ': подпись (побайтово)');
      assert.equal(tabs[i].dataset.tabid, expected[i].id,
        'столбец ' + col + ' кнопка ' + i + ': data-tabid');
    }
  }
  // Побайтовый рендер тел — фиксаторы (42 теста этого файла проходят
  // тем же запуском); здесь — только корреляция DOM ↔ реестр.
});

// «Новый файл вкладки» — инлайн-UMD-сниппет в форме браузерной ветки
// вкладочного модуля (контракт §2): self-registration в Game.uiTabs
// при загрузке, НОЛЬ DOM. Коммитный тестовый файл в src — мёртвый
// код; строка в тесте автономна.
const TEST_TAB_130_SNIPPET =
  '(function (root) {\n' +
  "  'use strict';\n" +
  "  const G0 = typeof root.Game === 'object' ? root.Game : {};\n" +
  '  const tab = {\n' +
  '    column: 1,\n' +
  "    id: 'wf_test_tab_130',\n" +
  "    label: 'Тест',\n" +
  '    build(pane, ctx) {\n' +
  "      pane.appendChild(ctx.el('div', 'cp-row', 'тестовая вкладка'));\n" +
  '    },\n' +
  '  };\n' +
  '  if (G0.uiTabs && typeof G0.uiTabs.register === \'function\') {\n' +
  '    G0.uiTabs.register(tab);\n' +
  '  }\n' +
  '})(typeof globalThis !== \'undefined\' ? globalThis : self);\n';

test('000130 RED: анти-прецедент — новая вкладка саморегистрацией (новый файл в песочнице); ui.js не изменялся', () => {
  const env = loadTabsUi();
  const reg = env.G.uiTabs;
  assert.ok(reg && typeof reg === 'object',
    'Game.uiTabs — реестр вкладок (задача 000130)');
  // «Установка» новой вкладки: исполняем её «файл» в песочнице ПОСЛЕ
  // цепочки, ДО toggle (buildPanel ленивый — первая сборка панели
  // увидит регистрацию; порядок хуков/кнопок = порядок регистрации).
  vm.runInContext(TEST_TAB_130_SNIPPET, env.sandbox,
    { filename: 'wf_test_tab_130.js' });
  assert.ok(env.G.uiTabs.get('wf_test_tab_130'),
    'тестовая вкладка зарегистрирована саморегистрацией при загрузке');
  const c = env.G.createCharacter();
  const panel = openPanel(env, c);
  const cols = colsOf(panel);
  const tabs = tabsOf(cols[1]);
  const panes = panesOf(cols[1]);
  assert.equal(tabs.length, 4,
    'правый столбец: 4 кнопки (3 + тестовая) — добавление вкладки не ' +
    'требует правок ui.js');
  assert.equal(tabs[3].textContent, 'Тест', 'четвёртая вкладка — «Тест»');
  assert.equal(tabs[3].dataset.tabid, 'wf_test_tab_130',
    'data-tabid тестовой вкладки');
  assert.ok(panes[3] && textOf(panes[3]).includes('тестовая вкладка'),
    'pane тестовой вкладки собран build(pane, ctx) из реестра: ' +
    (panes[3] ? textOf(panes[3]) : '(нет pane)'));
  // Анти-прецедент (ТЗ): при добавлении вкладки src/ui.js НЕ
  // изменялся — его текст не содержит id тестовой вкладки.
  assert.doesNotMatch(src('ui.js'), /wf_test_tab_130/,
    'src/ui.js не содержит id тестовой вкладки — ui.js не правился');
});

test('000130 RED: node — require() каждого src/ui-tabs.js/ui-tab-*.js чист (UMD-ветка)', () => {
  // UMD по образцу src/cities.js/src/dungeon.js/src/building-effects.js
  // (инвариант ТЗ): node-ветка — require() БЕЗ исключений; DOM при
  // загрузке в node — краш (document не определён) — «чистота»
  // проверяется самим require; взаимных require и RNG при загрузке
  // — ноль (000053). Экспорт — определение вкладки (браузерная ветка
  // — self-registration + плоский spread game-экспорта на Game).
  const files = [
    'ui-tabs.js',
    'ui-tab-quests.js',
    'ui-tab-skills.js',
    'ui-tab-inventory.js',
    'ui-tab-settings.js',
    'ui-tab-shop.js',
  ];
  for (const f of files) {
    const m = require(path.join(ROOT, 'src', f));
    if (f === 'ui-tabs.js') {
      // Реестр — экземпляр (тестируется в node напрямую).
      for (const k of ['register', 'get', 'list']) {
        assert.equal(typeof m[k], 'function', f + ': ' + k + '()');
      }
      continue;
    }
    assert.ok(m.tab && typeof m.tab === 'object', f + ': экспорт .tab');
    assert.equal(typeof m.tab.id, 'string', f + ': tab.id — строка');
    assert.equal(typeof m.tab.label, 'string', f + ': tab.label — строка');
    assert.ok(m.tab.column === 0 || m.tab.column === 1,
      f + ': tab.column — строго 0 или 1');
    assert.equal(typeof m.tab.build, 'function',
      f + ': tab.build(pane, ctx) — функция');
    if (f === 'ui-tab-quests.js') {
      // Плоский game-экспорт (контракт §2): ОДИН рендерер строк
      // «В работе» на панель и npcUI (000100, защита экстракции).
      assert.equal(typeof m.game.buildActiveQuestRow, 'function',
        f + ': game.buildActiveQuestRow');
      assert.equal(typeof m.game.findQuestInCatalog, 'function',
        f + ': game.findQuestInCatalog');
    }
  }
});

// --- GREEN: guards реестра, деградация, фиксаторы экстракции ---

test('000130 GREEN: реестр — guards: дубликат id (первая авторитетна), невалидные записи (skip + console.error), list() — копия', () => {
  // node-ветка UMD: require() — тот же экземпляр реестра (контракт
  // §4.2), тестируется в node напрямую.
  const reg = require(path.join(ROOT, 'src', 'ui-tabs.js'));
  assert.equal(reg.list().length, 0, 'свежий реестр — пуст');
  assert.doesNotThrow(() => reg.register({
    column: 0, id: 'a', label: 'A', build() {},
  }), 'register валидной записи — без броска');
  assert.equal(reg.list().length, 1);
  // Дубликат id — console.error + сохраняется ПЕРВАЯ (порядок
  // скриптов авторитетен).
  assert.equal(reg.get('a').label, 'A', 'до дубликата — первая запись');
  reg.register({ column: 1, id: 'a', label: 'A2', build() {} });
  assert.equal(reg.get('a').label, 'A', 'дубликат — первая авторитетна');
  assert.equal(reg.list().length, 1, 'дубликат не добавлен');
  // Невалидные — console.error + skip, НИКОГДА не бросает.
  for (const bad of [
    null, 42,
    {},
    { id: '', label: 'x', column: 0, build() {} },
    { id: 'b', column: 0, build() {} },  // без label
    { id: 'b', label: 'B', column: 2, build() {} },  // column не 0|1
    { id: 'b', label: 'B', column: 0 },  // без build
    { id: 'b', label: 'B', column: 0, build() {}, render: 42 },
  ]) {
    assert.doesNotThrow(() => reg.register(bad),
      'register невалидной записи — без броска: ' + JSON.stringify(bad));
  }
  assert.equal(reg.list().length, 1, 'невалидные записи — все skip');
  // render — опционально: без поля и с undefined — ок.
  reg.register({ id: 'c', label: 'C', column: 1, build() {} });
  assert.equal(reg.list().length, 2, 'без render — регистрируется');
  assert.equal(reg.get('no_such'), null, 'get(нет) → null');
  // list() — КОПИЯ: мутация возвращённого не влияет на реестр.
  const copy = reg.list();
  copy.length = 0;
  assert.equal(reg.list().length, 2, 'list() — копия, не ссылка');
});

test('000130 GREEN: деградация — вкладочный модуль БЕЗ Game.uiTabs: без throw, console.error, без регистрации', () => {
  // Паттерн 000053: отсутствие зависимости — console.error +
  // деградация, игра не падает (в т.ч. в голом sandbox без Game —
  // G0 = {}, без throw).
  for (const gameVariant of [undefined, {}]) {
    const errors = [];
    const sandbox = {
      console: {
        log: () => {}, info: () => {}, warn: () => {},
        error: (m) => errors.push(String(m)),
      },
    };
    if (gameVariant !== undefined) sandbox.Game = gameVariant;
    vm.createContext(sandbox);
    assert.doesNotThrow(() => vm.runInContext(src('ui-tab-quests.js'),
      sandbox, { filename: 'ui-tab-quests.js' }),
      'ui-tab-quests.js без реестра — без throw');
    assert.ok(errors.length >= 1,
      'console.error при отсутствии Game.uiTabs');
    assert.ok(String(errors[0]).includes('Game.uiTabs не найден'),
      'текст ошибки — про порядок: ' + errors[0]);
    assert.ok(!sandbox.Game || !sandbox.Game.uiTabs,
      'регистрации нет (реестра нет)');
  }
});

test('000130 GREEN: деградация — ui.js БЕЗ ui-tabs.js: загрузка чистая, toggle → console.error + 2 пустых столбца, без краха', () => {
  // ui.js обязан грузиться чисто БЕЗ реестра (tests/index-order.
  // test.js гоняет ui.js один в голом sandbox без document):
  // реестр читается ЛЕНИВО в buildPanel.
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
  const chain = CHAIN_000130.filter((f) =>
    f !== 'ui-tabs.js' && !f.startsWith('ui-tab-'));
  for (const f of chain) vm.runInContext(src(f), sandbox, { filename: f });
  assert.equal(errors.length, 0,
    'загрузка ui.js без реестра — ЧИСТАЯ (ленивое чтение)');
  const c = sandbox.Game.createCharacter();
  let panel = null;
  assert.doesNotThrow(() => {
    sandbox.Game.playerUI.setCharacter(c);
    sandbox.Game.playerUI.toggle(true);
    panel = findAll(document.body, '.char-panel')[0];
  }, 'toggle без реестра — без краха');
  assert.ok(panel, 'панель собрана (деградация, не отказ)');
  assert.ok(errors.length >= 1,
    'console.error при ПЕРВОЙ сборке панели без реестра');
  const cols = findAll(panel, '.cp-column');
  assert.equal(cols.length, 2, 'два столбца');
  for (const col of cols) {
    assert.equal(findAll(col, '.cp-tab').length, 0,
      'пустой столбец: вкладки нет');
    assert.equal(findAll(col, '.cp-tabpane').length, 0,
      'пустой столбец: pane нет');
  }
  assert.equal(sandbox.Game.playerUI.isOpen(), true,
    'панель открыта — деградация не ломает isOpen');
});

test('000130 GREEN: каждый src/ui-tab-*.js на диске НЕ содержит saveNow (панель сейв не трогает)', () => {
  // Фиксатор 000100 расширяется на вкладочные модули (условно по
  // existsSync — будущее: новый файл вкладки подхватится сам).
  const files = fs.readdirSync(path.join(ROOT, 'src'))
    .filter((f) => /^ui-tab-.*\.js$/.test(f));
  assert.ok(files.length >= 5,
    'вкладочные модули на диске: ' + files.join(','));
  for (const f of files) {
    assert.doesNotMatch(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), /saveNow/,
      'src/' + f + ' не содержит saveNow (сейв — только main.js/' +
      'диалог NPC)');
  }
});

test('000130 GREEN: ui.js — ленивые typeof-гарды на Game.buildActiveQuestRow/Game.findQuestInCatalog (защита экстракции) и записи вкладок НЕ в ui.js', () => {
  // npcUI читает общий рендерер квестов (000100) через G с ЛЕНИВЫМ
  // гардом в момент вызова (песочница без ui-tab-quests.js —
  // строка пропускается + console.error, на загрузке ошибок нет —
  // npc-hire.test.js). Записи вкладок (LEFT_TABS/RIGHT_TABS) в
  // ui.js больше НЕТ — только реестр (контракт §1).
  const ui = src('ui.js');
  assert.match(ui, /typeof G\.buildActiveQuestRow === 'function'/,
    'ui.js: ленивый гард G.buildActiveQuestRow');
  assert.match(ui, /typeof G\.findQuestInCatalog === 'function'/,
    'ui.js: ленивый гард G.findQuestInCatalog');
  assert.match(ui, /G\.uiTabs/, 'ui.js: реестр читается (лениво)');
  assert.doesNotMatch(ui, /LEFT_TABS|RIGHT_TABS/,
    'ui.js: записей вкладок нет (переехали в src/ui-tab-*.js)');
});

// =====================================================================
// 000098 — Вкладка «Игровые настройки»: форма по SETTINGS + META,
// кламп, сброс (session-only)
// =====================================================================
//
// Зона 000098 — src/ui-tab-settings.js (контракт 000130; НЕ src/ui.js —
// анти-прецедент R4). Контракты: memory/000098-settings-tab.md (форма/
// apply/session-only) + memory/000098-game-settings-tab.md (ядро
// META/DEFAULTS/clampValue).
//
// Форма (build — ОДИН раз в buildPanel, render() её НЕ трогает):
// 15 ключей SETTINGS = 28 контролов (27 input[type=number] + 1 select)
// + 33 кнопки (15 toповых сбросов + 17 leaf-сбросов + 1 «Сбросить всё»)
// + 32 строки .cp-setrow (28 контрольных + 4 шапки .cp-sethead:
// «Сложности боя» [group] / «Городской канал» / «Лояльность
// спутников» / «Отказ спутников»). У ВСЕХ контролов и кнопок
// dataset.key = dot-path. Классы ТОЛЬКО .cp-set* (ловушка .cp-btn:
// делегированный click ядра → raiseSkill(undefined)).
//
// RED (placeholder 000130 — 2 div, контролов/слушателей нет; зелёные
// после реализации):
//   * U1: форма строится ОДИН раз: 28 контролов с dataset.key,
//     значения = SETTINGS; введённый вручную value и узлы переживают
//     render(); ОДИН делегированный click на панели; 33 кнопки;
//   * U2: change → SETTINGS обновлён (кламп); мусор — НЕ принят +
//     заметка в ядровой .cp-notice; ссылка SETTINGS не меняется;
//   * U3: «сбросить всё» → inputs = DEFAULTS; SETTINGS = DEFAULTS;
//     ссылка не меняется; форма не пересобрана;
//   * U4: «Сложности боя»: ровно 1 select (enum = ключи
//     combat_difficulties) + ровно 6 number (hp/damage × 3) —
//     редактируемы; 0 для hp — ОТКАЗ (float > 0) + заметка.
//     Расхождение ТЗ «8 полей: select + 6 number» (= 7 контролов)
//     зафиксировано: пиним СТРУКТУРУ (1 select + ровно 6 number),
//     не число 8;
//   * U5: steps_per_day 0/−5 из input → SETTINGS ≥ 1 (кламп —
//     бесконечный цикл while в addStep day.js:54 невозможен) + заметка.
//
// Локальный расширенный DOM-стаб (дублирование стабов принято в
// проекте): makeEl + value/type у элементов (input/select). Лоадер —
// ТО ЖЕ динамическое CHAIN_000130 (цепочка из index.html уже содержит
// ui-tab-settings.js — тега нет; лоадер МЕЖДУ ФАЗАМИ не правится).
// Песочница на тест: Game/SETTINGS — свои (браузерная UMD-ветка
// global-settings.js в новом контексте).

function makeElS(tag) {
  const el = makeEl(tag);
  el.value = '';
  el.type = '';
  return el;
}

function loadSettingsUi() {
  const errors = [];
  const document = {
    createElement: (tag) => makeElS(tag),
    body: makeElS('body'),
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
  for (const f of CHAIN_000130) vm.runInContext(src(f), sandbox, { filename: f });
  return { G: sandbox.Game, body: document.body, doc: document,
    errors, sandbox };
}

// Тестовый helper: значение по dot-path.
function getByPath(obj, p) {
  return p.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

// Pane вкладки «Игровые настройки» (левый столбец, 3-я вкладка —
// реестр 000130).
function settingsPane(env, panel) {
  const cols = colsOf(panel);
  const panes = panesOf(cols[0]);
  assert.equal(panes.length, 3, 'левый столбец — 3 pane');
  clickTab(panel, cols[0], 2);
  return panes[2];
}

// Контрол (input/select) по dataset.key (dot-path).
function byKey(pane, key) {
  return findAll(pane, 'input').concat(findAll(pane, 'select'))
    .find((el) => el.dataset && el.dataset.key === key) || null;
}

// dispatch 'change' через ПАНЕВЫЙ слушатель (apply по change, НЕ input).
function dispatchChange(pane, el) {
  const ch = pane.listeners.change;
  assert.ok(Array.isArray(ch) && ch.length >= 1,
    'change-слушатель на ПАНЕ (apply по change, не input)');
  ch[0]({ target: el });
}

test('000098 RED: U1 — форма строится ОДИН раз (buildPanel): 28 контролов = SETTINGS; введённый value и узлы переживают render(); один панельный click; 33 кнопки', () => {
  const env = loadSettingsUi();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  const c = env.G.createCharacter();
  const panel = openPanel(env, c);
  const pane = settingsPane(env, panel);
  const S = env.G.GlobalSettings.SETTINGS;
  const inputs = findAll(pane, 'input');
  const selects = findAll(pane, 'select');
  assert.equal(selects.length, 1,
    'ровно 1 select (combat_difficulty) в pane: ' + selects.length);
  assert.equal(inputs.length, 27,
    '27 input[type=number] (10 плоских + 17 листьев): ' + inputs.length);
  // У ВСЕХ контролов dataset.key = dot-path и value = SETTINGS[path].
  for (const el of inputs.concat(selects)) {
    assert.ok(el.dataset && typeof el.dataset.key === 'string' &&
      el.dataset.key.length > 0,
      'у контрола есть dataset.key (dot-path)');
    assert.equal(el.value, String(getByPath(S, el.dataset.key)),
      'value ' + el.dataset.key + ' = SETTINGS на сборке');
  }
  // Кнопки: 33 = 15 toповых «сброс» + 17 leaf-«сброс» + 1 «Сбросить всё».
  const btns = findAll(pane, 'button');
  assert.equal(btns.length, 33,
    '33 кнопки (15 toповых + 17 leaf + «Сбросить всё»): ' + btns.length);
  assert.ok(btns.some((b) => b.dataset && b.dataset.all === 'all'),
    'кнопка «Сбросить всё» (dataset.all)');
  // Форма НЕ пересобирается render(): тот же узел, введённый вручную
  // value СОХРАНЁН (живость focus — ТЗ); без change SETTINGS не тронут.
  const steps = byKey(pane, 'steps_per_day');
  assert.ok(steps, 'input steps_per_day в форме');
  const s0 = S.steps_per_day;
  steps.value = '123';
  env.G.playerUI.render();
  assert.equal(byKey(pane, 'steps_per_day'), steps,
    'узел input steps_per_day — ТОТ ЖЕ после render() (одна сборка)');
  assert.equal(steps.value, '123',
    'введённый вручную value переживает render()');
  assert.equal(S.steps_per_day, s0,
    'без события change SETTINGS не изменился');
  // ОДИН делегированный click на панели (инвариант 000130): слушатели
  // формы — на ПАНЕ, не на панели.
  assert.equal(panel.listeners.click.length, 1,
    'на панели ОДИН делегированный click (pane-слушатели не считаются)');
});

test('000098 RED: U2 — change → SETTINGS обновлён (кламп); мусор — НЕ принят + заметка в .cp-notice', () => {
  const env = loadSettingsUi();
  const c = env.G.createCharacter();
  const panel = openPanel(env, c);
  const pane = settingsPane(env, panel);
  const S = env.G.GlobalSettings.SETTINGS;
  const sref = S;
  const inp = byKey(pane, 'steps_per_day');
  assert.ok(inp, 'input steps_per_day в форме');
  // Валидное значение — принято, ссылка SETTINGS не меняется.
  inp.value = '7';
  dispatchChange(pane, inp);
  assert.equal(S.steps_per_day, 7, 'SETTINGS обновлён по change');
  assert.equal(inp.value, '7', 'input — принятое значение');
  assert.equal(S, sref, 'ссылка на SETTINGS НЕ меняется (мутация in place)');
  // Мусор — НЕ принят, input восстановлен, заметка в ядровой .cp-notice.
  inp.value = 'abc';
  dispatchChange(pane, inp);
  assert.equal(S.steps_per_day, 7, 'мусор не принят в SETTINGS');
  assert.equal(inp.value, '7', 'input восстановлен к текущему значению');
  const notice = noticeOf(panel);
  assert.ok(String(notice.textContent).length > 0,
    '.cp-notice — заметка (ЕДИНЫЙ ядровой элемент, ленивый доступ)');
  assert.equal(panel.listeners.click.length, 1,
    'на панели по-прежнему ОДИН делегированный click');
});

test('000098 RED: U3 — «Сбросить всё» → inputs = DEFAULTS; SETTINGS = DEFAULTS; ссылка не меняется; форма не пересобрана', () => {
  const env = loadSettingsUi();
  const c = env.G.createCharacter();
  const panel = openPanel(env, c);
  const pane = settingsPane(env, panel);
  const GS = env.G.GlobalSettings;
  const S = GS.SETTINGS;
  const D = GS.DEFAULTS;
  assert.ok(D && typeof D === 'object',
    'Game.GlobalSettings.DEFAULTS присутствует (session-only)');
  const sref = S;
  // Мутации через change (в т.ч. вложенное и enum).
  const steps = byKey(pane, 'steps_per_day');
  assert.ok(steps, 'input steps_per_day в форме');
  steps.value = '99'; dispatchChange(pane, steps);
  const hardHp = byKey(pane, 'combat_difficulties.hard.hp');
  assert.ok(hardHp, 'input combat_difficulties.hard.hp в форме');
  hardHp.value = '0.99'; dispatchChange(pane, hardHp);
  const sel = byKey(pane, 'combat_difficulty');
  assert.ok(sel, 'select combat_difficulty в форме');
  sel.value = 'easy'; dispatchChange(pane, sel);
  // «Сбросить всё» — СВОЙ pane-слушатель click (делегированный click
  // панели .cp-setbtn НЕ обрабатывает — классы .cp-set*, не .cp-btn).
  const btnAll = findAll(pane, 'button')
    .find((b) => b.dataset && b.dataset.all === 'all');
  assert.ok(btnAll, 'кнопка «Сбросить всё» в форме');
  const clicks = pane.listeners.click;
  assert.ok(Array.isArray(clicks) && clicks.length >= 1,
    'click-слушатель на ПАНЕ (кнопки сброса)');
  clicks[0]({ target: btnAll });
  assert.deepEqual(JSON.parse(JSON.stringify(S)),
    JSON.parse(JSON.stringify(D)),
    'SETTINGS = DEFAULTS после «Сбросить всё» (JSON, вложенные целиком)');
  assert.equal(S, sref, 'ссылка на SETTINGS НЕ меняется');
  // ВСЕ inputs/selectы = значения из DEFAULTS (пересборка значений,
  // а не формы).
  for (const el of findAll(pane, 'input').concat(findAll(pane, 'select'))) {
    assert.equal(el.value, String(getByPath(S, el.dataset.key)),
      'input ' + el.dataset.key + ' = значение DEFAULTS');
  }
  assert.equal(byKey(pane, 'steps_per_day'), steps,
    'узел input — ТОТ ЖЕ после сброса (форма не пересобрана)');
});

test('000098 RED: U4 — «Сложности боя»: select (enum = ключи combat_difficulties) + ровно 6 number (hp/damage × 3) редактируемы; 0 для hp — ОТКАЗ', () => {
  const env = loadSettingsUi();
  const c = env.G.createCharacter();
  const panel = openPanel(env, c);
  const pane = settingsPane(env, panel);
  const S = env.G.GlobalSettings.SETTINGS;
  // Ровно 1 select — combat_difficulty; options = live-ключи.
  const selects = findAll(pane, 'select');
  assert.equal(selects.length, 1, 'ровно 1 select в форме');
  const sel = selects[0];
  assert.equal(sel.dataset.key, 'combat_difficulty',
    'select — combat_difficulty');
  assert.deepEqual(sel.children.map((o) => o.value),
    ['easy', 'medium', 'hard'],
    'option\'ы select = ключи combat_difficulties (live)');
  assert.equal(sel.value, String(S.combat_difficulty),
    'select value = текущая сложность');
  // Ровно 6 number — hp/damage × easy/medium/hard.
  const nums = findAll(pane, 'input')
    .filter((i) => i.dataset.key
      && i.dataset.key.indexOf('combat_difficulties.') === 0);
  assert.equal(nums.length, 6,
    'ровно 6 number для сложностей: ' + nums.length);
  for (const d of ['easy', 'medium', 'hard']) {
    for (const f of ['hp', 'damage']) {
      assert.ok(nums.some((i) =>
        i.dataset.key === 'combat_difficulties.' + d + '.' + f),
        'number combat_difficulties.' + d + '.' + f + ' в форме');
    }
  }
  // Редактируемы: select и вложенный лист.
  sel.value = 'hard';
  dispatchChange(pane, sel);
  assert.equal(S.combat_difficulty, 'hard',
    'сложность обновлена по change select');
  const hardHp = byKey(pane, 'combat_difficulties.hard.hp');
  hardHp.value = '0.7';
  dispatchChange(pane, hardHp);
  assert.equal(S.combat_difficulties.hard.hp, 0.7,
    'combat_difficulties.hard.hp обновлён (float)');
  // 0 — НЕ принят (float > 0: 0×HP = поломка боя) + заметка.
  hardHp.value = '0';
  dispatchChange(pane, hardHp);
  assert.equal(S.combat_difficulties.hard.hp, 0.7,
    '0 для hp НЕ принят (positive — отказ, не кламп)');
  assert.equal(hardHp.value, '0.7', 'input восстановлен');
  assert.ok(String(noticeOf(panel).textContent).length > 0,
    'заметка в .cp-notice');
});

test('000098 RED: U5 — steps_per_day 0/−5 из input → SETTINGS ≥ 1 (игра не зависает) + заметка в .cp-notice', () => {
  const env = loadSettingsUi();
  const c = env.G.createCharacter();
  const panel = openPanel(env, c);
  const pane = settingsPane(env, panel);
  const S = env.G.GlobalSettings.SETTINGS;
  const inp = byKey(pane, 'steps_per_day');
  assert.ok(inp, 'input steps_per_day в форме');
  // ФИКСАТОР опасности: steps_per_day ≤ 0 — БЕСКОНЕЧНЫЙ цикл
  // while (steps >= perDay) в addStep (day.js:54) — зависание игры.
  inp.value = '0';
  dispatchChange(pane, inp);
  assert.ok(S.steps_per_day >= 1,
    'steps_per_day ≥ 1 после «0» (кламп — зависание невозможно)');
  assert.equal(S.steps_per_day, 1, '0 клампится в 1 (min)');
  assert.equal(inp.value, '1', 'input нормализован к принятому');
  assert.ok(String(noticeOf(panel).textContent).length > 0,
    'заметка о клампе в .cp-notice');
  inp.value = '-5';
  dispatchChange(pane, inp);
  assert.ok(S.steps_per_day >= 1, '−5 → всё ещё ≥ 1');
  assert.equal(S.steps_per_day, 1, '−5 клампится в 1 (min)');
});

test('000098: U6 — guard build: без Game.GlobalSettings — console.error + деградация «Настройки недоступны», игра не падает (ревью: паттерн 000053)', () => {
  const env = loadSettingsUi();
  assert.equal(env.errors.length, 0,
    'загрузка цепочки — чисто (guard — в build, не при загрузке)');
  const c = env.G.createCharacter();
  // GlobalSettings уберён ДО СБОРКИ панели: t.build — в buildPanel
  // (toggle(true)), НЕ при клике по вкладке.
  delete env.G.GlobalSettings;
  let panel = null;
  let pane = null;
  assert.doesNotThrow(() => {
    panel = openPanel(env, c);      // сборка → guard → console.error
    pane = settingsPane(env, panel); // клик по вкладке (idx 2)
  }, 'сборка панели + клик по вкладке без GlobalSettings не бросают');
  assert.ok(env.errors.some((e) => e.includes('Game.GlobalSettings')),
    'console.error про Game.GlobalSettings: ' + env.errors.join('; '));
  assert.equal(findAll(pane, '.cp-set').length, 0,
    'формы .cp-set нет (деградация, не крах)');
  assert.ok(findAll(pane, '.cp-itemmeta').some((m) =>
      String(m.textContent).includes('Настройки недоступны')),
    'строка деградации «Настройки недоступны» в pane');
});

test('000098: U7 — будущий ключ SETTINGS без записи в META: generic-строка в форме, apply работает, не падает (ревью: ТЗ «новый ключ НЕ падает»)', () => {
  const env = loadSettingsUi();
  assert.equal(env.errors.length, 0, 'ошибок при загрузке нет');
  // Ключ ДО СБОРКИ формы (форма строится в buildPanel/toggle).
  // Песочница — СВОЯ копия SETTINGS (vm-контекст) — node-SETTINGS не
  // затрагивается; других тестов на эту песочницу нет.
  const S = env.G.GlobalSettings.SETTINGS;
  S.tmp_future_key = 2.5;
  const c = env.G.createCharacter();
  const panel = openPanel(env, c);
  assert.equal(env.errors.length, 0,
    'сборка формы с новым ключом — без ошибок: ' + env.errors.join('; '));
  const pane = settingsPane(env, panel);
  const inp = byKey(pane, 'tmp_future_key');
  assert.ok(inp, 'generic-строка нового ключа (dataset.key) в форме');
  assert.equal(String(inp.tagName).toLowerCase(), 'input',
    'generic число — input (не select)');
  assert.equal(inp.type, 'number', 'generic float → input[type=number]');
  assert.equal(inp.value, '2.5', 'value = SETTINGS на сборке');
  // apply: 0.5 → 1 (generic float min 1) + заметка о корректировке.
  inp.value = '0.5';
  dispatchChange(pane, inp);
  assert.equal(S.tmp_future_key, 1,
    'generic кламп: 0.5 → 1 (float min 1)');
  assert.equal(inp.value, '1', 'input нормализован к принятому');
  assert.ok(String(noticeOf(panel).textContent).length > 0,
    'заметка о клампе в .cp-notice');
});

// =====================================================================
// 000101 — Вкладка «Магазин»: строка «Магазина здесь нет» при
// shop === null (placeholder, секция остаётся видимой)
// =====================================================================
//
// Зона 000101 — src/ui-tab-shop.js (контракт 000130; НЕ src/ui.js —
// анти-прецедент). Перенос «Торговли» в pane «Магазин» выполнен
// ДОСРОЧНО в 000096/000130 (одноколоночной секции «Торговля» в DOM
// нет — S3 фиксирует). Остаток 000101, строго по ТЗ: shop === null —
// placeholder-строка «Магазина здесь нет» (ГОЛЫЙ div.cp-itemmeta,
// образцы — «Журнал квестов недоступен.» / «Настройки недоступны»)
// ВМЕСТО скрытия секции (было: display='none' + stale-строки в
// _shopBody — ранний return без очистки). Контракт:
// memory/000101-shop-tab.md.
//
// Лоадер — существующий loadTabsUi() + CHAIN_000130 (цепочка из
// index.html уже содержит ui-tab-shop.js — НОВЫХ тегов/файлов/стабов
// НЕТ; лоадер МЕЖДУ ФАЗАМИ не правится). Help'еры — openPanel/
// colsOf/panesOf/clickTab/findAll/noticeOf/textOf + src().
//
// КРАСНЫЕ (падают до реализации, зелёные после):
//   * S1: shop = null — секция «Магазин» НЕ скрыта, строка
//     «Магазина здесь нет» (.cp-itemmeta), _shopBody — ровно 1 ребёнок,
//     строк .cp-itemrow и кнопок нет;
//   * S2: setShop(shop) — строки магазина (имена/цены — из stock и
//     ядра, без хардкода); setShop(null) — плейсхолдер ВЕРНУЛСЯ,
//     старые строки очищены (stale); краснеет на ПЕРЕХОДЕ
//     setShop(null) (фаза 1 — фиксатор досрочного переноса —
//     зелёная с 1-го).
// ЗЕЛЁНЫЕ с первого запуска (регрессия-фиксаторы):
//   * S3: секции «Торговля» в панели НЕТ; _shopBody живёт в секции
//     «Магазин» внутри pane вкладки «Магазин»;
//   * S4: клик data-act buy через panel.listeners.click[0]
//     (doItemAction) — покупка: gold−buyPrice, stock−1, инвентарь+1,
//     notice «Куплено: <name> за N з» (цена — из результата ядра);
//     строка (qty−1 < 1) убрана после ре-рендера;
//   * S5: клик data-act sell — продажа: gold+sellPrice,
//     инвентарь−1, notice «Продано: … за N з»; строка ×2 → ×1,
//     тот же _shopBody;
//   * S6: смена setShop (s1 → s2-универсам → null) — остальные
//     вкладки сохранены: те же DOM-узлы pane, активные вкладки НЕ
//     сбрасываются render(), строки «Снаряжение»/«Инвентарь» не
//     тронуты;
//   * S7: плейсхолдер живёт в src/ui-tab-shop.js, НЕ в ядре ui.js
//     (литерал уже есть в шапке-комментарии модуля — фиксатор зоны).
//
// РЕГРЕССИЯ БЕЗ ИЗМЕНЕНИЙ: tests/items.test.js (ядро торговли),
// tests/ui-skills.test.js, остальное этого файла, полный npm test.

// Pane вкладки «Магазин» (правый столбец, 2-й pane — порядок
// закреплён пинами 000096/000130).
function shopPaneOf(panel) {
  const cols = colsOf(panel);
  const rp = panesOf(cols[1]);
  assert.equal(rp.length, 3, 'правый столбец — 3 pane');
  return rp[1];
}

test('000101 RED: shop = null — секция видима, строка «Магазина здесь нет» (.cp-itemmeta), строк/кнопок нет', () => {
  const env = loadTabsUi();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  const c = env.G.createCharacter();
  const panel = openPanel(env, c); // setShop не зван — shop === null
  const pane = shopPaneOf(panel);
  assert.ok(panel._shopSec, 'panel._shopSec зафиксирован (секция «Магазин»)');
  assert.ok(panel._shopBody, 'panel._shopBody зафиксирован');
  assert.notEqual(panel._shopSec.style.display, 'none',
    'при shop = null секция «Магазин» НЕ скрыта (placeholder виден)');
  const ph = findAll(pane, '.cp-itemmeta')
    .find((m) => String(m.textContent) === 'Магазина здесь нет');
  assert.ok(ph,
    'плейсхолдер-строка «Магазина здесь нет» (.cp-itemmeta) в pane: '
    + textOf(pane));
  assert.equal(panel._shopBody.children.length, 1,
    '_shopBody — ровно 1 ребёнок (голый placeholder, не .cp-itemrow)');
  assert.equal(findAll(pane, '.cp-itemrow').length, 0,
    'в pane нет строк .cp-itemrow');
  assert.equal(findAll(pane, '.cp-btn').length, 0,
    'в pane нет кнопок купить/продать');
  assert.equal(env.errors.length, 0,
    'консоли-ошибок при рендере плейсхолдера нет');
});

test('000101 RED: setShop → строки магазина; setShop(null) → плейсхолдер снова, старые строки очищены', () => {
  const env = loadTabsUi();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  const c = env.G.createCharacter();
  env.G.addItem(c, 'healing_potion', 2); // продаётся у аптекаря
  const panel = openPanel(env, c);
  const pane = shopPaneOf(panel);
  const s1 = env.G.makeShop(0, 0, env.G.BUILDING_TYPES.APOTHECARY, 2);

  // Фаза 1 (зелёная с 1-го — фиксатор досрочного переноса 000096/
  // 000130): строки из stock — имена/цены из ядра, без хардкода.
  env.G.playerUI.setShop(s1);
  const bname = env.G.buildingNameUi(s1.buildingType) || 'магазин';
  const meta = findAll(panel._shopBody, '.cp-itemmeta')
    .find((m) => String(m.textContent)
      .includes(', богатство ' + s1.wealth + '/3'));
  assert.ok(meta, 'мета-строка «<постройка>, богатство N/3» в _shopBody: '
    + textOf(pane));
  assert.ok(String(meta.textContent).includes(bname),
    'мета — имя постройки из buildingNameUi: ' + meta.textContent);
  for (const [id, qty] of Object.entries(s1.stock)) {
    if (qty < 1) continue;
    const it = env.G.getItem(id);
    const row = findAll(panel._shopBody, '.cp-itemrow')
      .find((r) => {
        const name = r.querySelector('.cp-itemname');
        const btn = r.querySelector('.cp-btn');
        return name && btn
          && String(name.textContent) === it.name + ' ×' + qty
          && btn.dataset.act === 'buy' && btn.dataset.item === id;
      });
    assert.ok(row,
      'buy-строка ' + id + ' («' + it.name + ' ×' + qty + '»): '
      + textOf(pane));
  }
  const sellRow = findAll(panel._shopBody, '.cp-itemrow')
    .find((r) => {
      const btn = r.querySelector('.cp-btn');
      return btn && btn.dataset.act === 'sell'
        && btn.dataset.item === 'healing_potion';
    });
  assert.ok(sellRow,
    'sell-строка healing_potion (инвентарь персонажа) в _shopBody: '
    + textOf(pane));
  // Все кнопки pane — только существующие data-act buy/sell.
  const acts = findAll(pane, '.cp-btn').map((b) => b.dataset.act);
  assert.ok(acts.length >= 1
      && acts.every((a) => a === 'buy' || a === 'sell'),
    'все .cp-btn в pane — data-act ∈ {buy, sell}: ' + acts.join(','));
  assert.ok(!textOf(pane).includes('Магазина здесь нет'),
    'плейсхолдера нет, пока магазин открыт');

  // Фаза 2 (КРАСНАЯ до реализации): setShop(null) — плейсхолдер
  // снова, старые строки очищены (было: display='none' + stale-
  // строки — ранний return не чистил тело).
  env.G.playerUI.setShop(null);
  const ph = findAll(pane, '.cp-itemmeta')
    .find((m) => String(m.textContent) === 'Магазина здесь нет');
  assert.ok(ph,
    'после setShop(null) плейсхолдер «Магазина здесь нет» ВЕРНУЛСЯ: '
    + textOf(pane));
  assert.equal(panel._shopBody.children.length, 1,
    '_shopBody — ровно 1 ребёнок (stale-строки очищены)');
  assert.equal(findAll(pane, '.cp-itemrow').length, 0,
    'после setShop(null) строк магазина нет (stale убран)');
  assert.equal(findAll(pane, '.cp-btn').length, 0,
    'после setShop(null) кнопок купить/продать нет');
  assert.ok(!textOf(pane).includes('покупка')
      && !textOf(pane).includes('продажа'),
    'текста «покупка»/«продажа» в pane после setShop(null) НЕТ');
  assert.equal(env.errors.length, 0,
    'консоли-ошибок при переходе shop → null нет');
});

test('000101 RED: секции «Торговля» в панели НЕТ; _shopBody живёт в pane вкладки «Магазин»', () => {
  // Зелёный с 1-го — фиксатор ТЗ «секция Торговля в одноколоночной
  // раскладке УБИРАЕТСЯ» (выполнено досрочно 000096/000130): чтобы
  // секция не вернулась.
  const env = loadTabsUi();
  const c = env.G.createCharacter();
  const panel = openPanel(env, c);
  // textContent стаба НЕ агрегирует детей (в реальном DOM секция
  // несла бы и текст плейсхолдера из _shopBody) — ассерты на
  // СОБСТВЕННЫЙ текстовый узел секции (заголовок), как читает
  // textOf:
  const trade = findAll(panel, '.cp-section')
    .filter((s) => s._text === 'Торговля');
  assert.equal(trade.length, 0,
    'секции .cp-section «Торговля» в панели нет (торговля — только ' +
    'вкладка «Магазин»)');
  const pane = shopPaneOf(panel);
  assert.ok(panel._shopSec, 'panel._shopSec зафиксирован');
  assert.equal(panel._shopSec._text, 'Магазин',
    'заголовок секции — «Магазин» (собственный текстовый узел)');
  assert.equal(panel._shopBody.parent, panel._shopSec,
    '_shopBody живёт внутри секции «Магазин»');
  assert.equal(panel._shopSec.parent, pane,
    'секция «Магазин» — в pane вкладки «Магазин» (правый столбец)');
});

test('000101 GREEN: клик data-act buy через panel.listeners.click[0] — покупка (регрессия ядра items.js)', () => {
  const env = loadTabsUi();
  const c = env.G.createCharacter();
  const panel = openPanel(env, c);
  const s1 = env.G.makeShop(0, 0, env.G.BUILDING_TYPES.APOTHECARY, 2);
  env.G.playerUI.setShop(s1);
  // Первый в stock предмет с qty ≥ 1 — из фикстуры, без хардкода.
  const entry = Object.entries(s1.stock).find(([, q]) => q >= 1);
  assert.ok(entry, 'в stock есть предмет с qty ≥ 1');
  const [id, qty] = entry;
  const it = env.G.getItem(id);
  const price = env.G.buyPrice(s1, id, c);
  const gold0 = c.gold;
  const before = env.G.totalQty(c, id);
  const btn = findAll(panel._shopBody, '.cp-btn')
    .find((b) => b.dataset.act === 'buy' && b.dataset.item === id);
  assert.ok(btn, 'кнопка «купить» (data-item=' + id + ') в pane');
  const clickers = panel.listeners.click || [];
  assert.equal(clickers.length, 1, 'ОДИН делегированный click на панели');
  clickers[0]({ target: btn });
  assert.equal(c.gold, gold0 - price,
    'gold − buyPrice (' + gold0 + ' − ' + price + ' = '
    + (gold0 - price) + ')');
  assert.equal(env.G.totalQty(c, id), before + 1,
    'инвентарь +1 («' + it.name + '»)');
  assert.equal(s1.stock[id], qty - 1, 'сток магазина −1');
  assert.equal(noticeOf(panel).textContent,
    'Куплено: ' + it.name + ' за ' + price + ' з',
    'notice «Куплено: <name> за N з» (цена — из результата ядра)');
  const buyRowAfter = findAll(panel._shopBody, '.cp-itemrow')
    .find((r) => {
      const b = r.querySelector('.cp-btn');
      return b && b.dataset.act === 'buy' && b.dataset.item === id;
    });
  assert.ok(!buyRowAfter,
    'buy-строка предмета УБРАНА после ре-рендера в обработчике ' +
    '(qty − 1 < 1)');
});

test('000101 GREEN: клик data-act sell — продажа (регрессия)', () => {
  const env = loadTabsUi();
  const c = env.G.createCharacter();
  env.G.addItem(c, 'healing_potion', 2);
  const panel = openPanel(env, c);
  const s1 = env.G.makeShop(0, 0, env.G.BUILDING_TYPES.APOTHECARY, 2);
  env.G.playerUI.setShop(s1);
  const it = env.G.getItem('healing_potion');
  const price = env.G.sellPrice(s1, 'healing_potion', c);
  const gold0 = c.gold;
  const body0 = panel._shopBody;
  const btn = findAll(panel._shopBody, '.cp-btn')
    .find((b) => b.dataset.act === 'sell'
      && b.dataset.item === 'healing_potion');
  assert.ok(btn, 'кнопка «продать» (healing_potion) в pane');
  (panel.listeners.click || [])[0]({ target: btn });
  assert.equal(c.gold, gold0 + price,
    'gold + sellPrice (' + gold0 + ' + ' + price + ' = '
    + (gold0 + price) + ')');
  assert.equal(env.G.totalQty(c, 'healing_potion'), 1,
    'инвентарь −1 (×2 → ×1)');
  assert.equal(noticeOf(panel).textContent,
    'Продано: ' + it.name + ' за ' + price + ' з',
    'notice «Продано: <name> за N з» (цена — из результата ядра)');
  assert.equal(panel._shopBody, body0,
    '_shopBody — тот же узел (тело обновляется in place)');
  const row = findAll(panel._shopBody, '.cp-itemrow')
    .find((r) => {
      const b = r.querySelector('.cp-btn');
      return b && b.dataset.item === 'healing_potion';
    });
  assert.ok(row, 'sell-строка обновлена после ре-рендера в обработчике');
  assert.equal(String(row.querySelector('.cp-itemname').textContent),
    it.name + ' ×1',
    'строка обновлена in place: ×2 → ×1');
});

test('000101 GREEN: смена setShop (shop → другой shop → null) — остальные вкладки сохранены', () => {
  const env = loadTabsUi();
  const c = env.G.createCharacter();
  env.G.addItem(c, 'iron_sword');
  env.G.equip(c, 'iron_sword'); // строка «Снаряжение»
  env.G.addItem(c, 'healing_potion', 2); // строка «Инвентарь»
  const panel = openPanel(env, c);
  const cols = colsOf(panel);
  const left = cols[0], right = cols[1];
  const lp = panesOf(left), rp = panesOf(right);
  clickTab(panel, right, 1); // активен «Магазин»
  assert.ok(textOf(rp[0]).includes('Железный меч'),
    'строка «Снаряжение» (iron_sword): ' + textOf(rp[0]));
  assert.ok(textOf(lp[1]).includes('×2'),
    'строка «Инвентарь» (healing_potion ×2): ' + textOf(lp[1]));

  const s1 = env.G.makeShop(0, 0, env.G.BUILDING_TYPES.APOTHECARY, 2);
  const s2 = env.G.makeShop(1, 1, env.G.BUILDING_TYPES.APOTHECARY, 3);
  const buyCount = () => findAll(shopPaneOf(panel), '.cp-btn')
    .filter((b) => b.dataset.act === 'buy').length;

  env.G.playerUI.setShop(s1);
  assert.equal(buyCount(),
    Object.entries(s1.stock).filter(([, q]) => q >= 1).length,
    's1: buy-строк = предметы стока с qty ≥ 1 (из фикстуры)');

  env.G.playerUI.setShop(s2);
  assert.equal(buyCount(), Object.keys(s2.stock).length,
    's2 (универсам): buy-строк = ВСЕ предметы стока (динамически)');
  assert.ok(textOf(shopPaneOf(panel))
      .includes(', богатство ' + s2.wealth + '/3'),
    'мета обновлена под s2 («богатство ' + s2.wealth + '/3»): '
    + textOf(shopPaneOf(panel)));

  // setShop(null) — последний переход (плейсхолдер — контракт S1/S2;
  // здесь только инварианты «остальные вкладки сохранены»).
  env.G.playerUI.setShop(null);

  // Остальные вкладки сохранены: pane НЕ пересобираются render()
  // (хуки пишут только в свои тела), активные вкладки не сбрасываются.
  const rp2 = panesOf(right), lp2 = panesOf(left);
  for (let i = 0; i < 3; i++) {
    assert.equal(rp2[i], rp[i], 'правый pane ' + i + ' — тот же узел');
    assert.equal(lp2[i], lp[i], 'левый pane ' + i + ' — тот же узел');
  }
  assert.notEqual(rp[1].style.display, 'none',
    'активная правая вкладка ВСЁ ЕЩЁ «Магазин»');
  assert.equal(rp[0].style.display, 'none', 'правый «Снаряжение» скрыт');
  assert.equal(rp[2].style.display, 'none', 'правый «Квесты» скрыт');
  assert.notEqual(lp[0].style.display, 'none',
    'левый «Персонаж» по-прежнему активен');
  assert.ok(textOf(rp[0]).includes('Железный меч'),
    'строка «Снаряжение» не тронута сменой setShop');
  assert.ok(textOf(lp[1]).includes('×2'),
    'строка «Инвентарь» не тронута сменой setShop');
});

test('000101 GREEN: фиксаторы — плейсхолдер в ui-tab-shop.js, НЕ в ядре', () => {
  // Строка «Магазина здесь нет» рендерится вкладочным модулем (зона
  // 000101 по контракту 000130 §5) — ядро ui.js её не знает
  // (аналог анти-прецедента 000130 R4). saveNow-скан не
  // повторять — общий readdirSync-скан 000130.
  assert.match(src('ui-tab-shop.js'), /Магазина здесь нет/,
    'src/ui-tab-shop.js содержит плейсхолдер «Магазина здесь нет»');
  assert.doesNotMatch(src('ui.js'), /Магазина здесь нет/,
    'плейсхолдер НЕ в ядре src/ui.js (анти-прецедент)');
});

// =====================================================================
// 000125 — Диалог NPC на весь экран (декэплинг от .combat-side,
// свой класс панели .npc-panel)
// =====================================================================
//
// Зона: npcBuild() в src/ui.js (725–774 на базе db99913) + NPC-CSS в
// конце <style> index.html (контракт: memory/000125-npc-fullscreen.md;
// ТЗ: tasks/pending/000125.md). МЕХАНИКА не трогается: вкладки
// диалог/торговля/школа/квесты/найм (000010/000078), onChange/сейв
// (000029), Esc, автораскрутка лога — тесты этих зон выше проходят
// без изменений.
//
// Лоадер — существующий loadTabsUi() + CHAIN_000130 (динамическая
// цепочка из index.html до ui.js; новых модулей/скриптов НЕТ —
// лоадер между фазами НЕ правится). Help'еры — findAll/textOf/src().
//
// КРАСНЫЕ (падают до реализации, зелёные после):
//   * R1: npcUI.open — панель несёт СОБСТВЕННЫЙ класс .npc-panel
//     (НЕ .combat-side); оверлей держит .npc-overlay; в поддереве
//     оверлея .combat-side НЕТ (декэплинг: layout диалога не зависит
//     от геометрии .combat-side при ЛЮБОМ порядке мержей 000124/
//     000125).
// ЗЕЛЁНЫЕ с первого запуска (регрессия-фиксаторы нового контракта):
//   * G1: состав панели инвариантен — ровно 4 прямых ребёнка по
//     порядку: .cp-title (span «имя — роль» + button .cp-close
//     «закрыть [Esc]», data-npcact=close) → .cp-itemrow (5×
//     .cp-btn[data-npcact=tab]: dialog/trade/train/quests/hire) →
//     .cp-items (тело) → .npc-log (ПОСЛЕДНИЙ ребёнок, несёт и
//     .combat-state).
// Статическая часть контракта (CSS index.html + текст src/ui.js) —
// отдельный файл tests/npc-layout.test.js (R2–R8 + стража G2).
//
// РЕГРЕССИЯ БЕЗ ИЗМЕНЕНИЙ: tests/npc-hire.test.js (5 вкладок,
// подписи), tests/building-effects.test.js (findOverlay фильтрует
// по 'npc-overlay'), остальные тесты этого файла, полный npm test.

test('000125 RED: npcUI.open — панель .npc-panel (НЕ .combat-side); оверлей держит .npc-overlay; в поддереве .combat-side нет (декэплинг)', () => {
  const env = loadTabsUi();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  const c = env.G.createCharacter();
  const npc = env.G.NpcData.NPCS[0];
  env.G.npcUI.open({ npc, character: c, book: env.G.createQuestBook() });
  assert.equal(env.G.npcUI.isActive(), true, 'диалог NPC открыт');
  const overlay = findAll(env.body, '.npc-overlay')[0];
  assert.ok(overlay, 'оверлей .npc-overlay подвешен к body (регрессия)');
  // Панель — единственный прямой ребёнок оверлея (npcBuild).
  assert.equal(overlay.children.length, 1,
    'оверлей — ровно 1 ребёнок (панель): '
    + overlay.children.length);
  const panel = overlay.children[0];
  assert.ok(String(panel.className).split(/\s+/).includes('npc-panel'),
    'панель несёт СОБСТВЕННЫЙ класс .npc-panel; факт: '
    + panel.className);
  assert.ok(!String(panel.className).split(/\s+/).includes('combat-side'),
    'панель НЕ несёт боевой класс .combat-side (декэплинг); факт: '
    + panel.className);
  assert.equal(findAll(overlay, '.combat-side').length, 0,
    'в поддереве оверлея нет элементов .combat-side — layout диалога '
    + 'не зависит от геометрии боевой панели (000124/000125 — любой '
    + 'порядок мержей)');
});

test('000125: состав панели инвариантен — .cp-title → .cp-itemrow (5 вкладок) → .cp-items → .npc-log (последний ребёнок)', () => {
  const env = loadTabsUi();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  const c = env.G.createCharacter();
  const npc = env.G.NpcData.NPCS[0];
  env.G.npcUI.open({ npc, character: c, book: env.G.createQuestBook() });
  const overlay = findAll(env.body, '.npc-overlay')[0];
  assert.ok(overlay, 'оверлей .npc-overlay подвешен к body');
  const panel = overlay.children[0];
  assert.equal(panel.children.length, 4,
    'панель — ровно 4 прямых ребёнка: '
    + panel.children.map((ch) => ch.className).join(' | '));
  const [title, tabsRow, body, log] = panel.children;
  // 1. Заголовок: span «имя — роль» + кнопка .cp-close «закрыть [Esc]».
  assert.ok(String(title.className).split(/\s+/).includes('cp-title'),
    '1-й ребёнок — .cp-title: ' + title.className);
  const nameSpan = title.querySelector('span');
  assert.ok(nameSpan, '.cp-title несёт span «имя — роль»');
  assert.ok(String(nameSpan.textContent).includes(' — '),
    'span «имя — роль»: ' + nameSpan.textContent);
  const closeBtn = title.querySelector('.cp-close');
  assert.ok(closeBtn, '.cp-title несёт button .cp-close');
  assert.equal(closeBtn.textContent, 'закрыть [Esc]',
    'подпись кнопки «закрыть [Esc]» (тапабельна на мобильном)');
  assert.equal(closeBtn.dataset.npcact, 'close',
    "data-npcact='close' (делегированный onOverlayClick)");
  // 2. Строка вкладок: 5 кнопок .cp-btn[data-npcact=tab] в порядке
  //    npcBuild (найм — 000078; состав БЕЗ ИЗМЕНЕНИЙ).
  assert.ok(String(tabsRow.className).split(/\s+/).includes('cp-itemrow'),
    '2-й ребёнок — .cp-itemrow: ' + tabsRow.className);
  const tabs = findAll(tabsRow, '.cp-btn')
    .filter((b) => b.dataset.npcact === 'tab');
  assert.equal(tabs.length, 5,
    'ряд вкладок — 5 кнопок: '
    + tabs.map((t) => t.dataset.tab).join(','));
  assert.deepEqual(
    tabs.map((t) => t.dataset.tab),
    ['dialog', 'trade', 'train', 'quests', 'hire'],
    'порядок data-tab вкладок');
  // 3. Тело.
  assert.ok(String(body.className).split(/\s+/).includes('cp-items'),
    '3-й ребёнок — .cp-items (тело): ' + body.className);
  // 4. Лог — ПОСЛЕДНИЙ ребёнок панели; несёт и .combat-state
  //    (текстовое оформление, не геометрия).
  assert.ok(String(log.className).split(/\s+/).includes('npc-log'),
    '4-й (последний) ребёнок — .npc-log: ' + log.className);
  assert.ok(String(log.className).split(/\s+/).includes('combat-state'),
    'лог несёт и .combat-state (оформление pre-line/цвет)');
});

// =====================================================================
// 000123 — тач-кнопка [I]: toggle(force, tabId)
// =====================================================================
// Тач-кнопка [I] (src/ui.js touchControls → main.js onInventory) зовёт
// G.playerUI.toggle(undefined, 'inventory') — явная вкладка «Инвентарь».
// Контракт: memory/000123-touch-buttons.md (toggle(force, tabId): tabId
// ищется в columnState (closure); неизвестный id — тихо игнорируется;
// без tabId — поведение БЕЗ ИЗМЕНЕНИЙ).

// ПANE по id вкладки: вкладка i ↔ pane i в ТОМ ЖЕ столбце (000130
// data-driven: порядок .cp-tab и .cp-tabpane = порядок записей).
function paneByTabid(panel, tabid) {
  for (const col of findAll(panel, '.cp-column')) {
    const tabs = findAll(col, '.cp-tab');
    const idx = tabs.findIndex((t) => t.dataset.tabid === tabid);
    if (idx < 0) continue;
    return findAll(col, '.cp-tabpane')[idx];
  }
  return null;
}

test('000123: toggle(true, "inventory") — панель открывается на вкладке «Инвентарь»', () => {
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  env.G.playerUI.setCharacter(c);
  env.G.playerUI.toggle(true, 'inventory');
  const panel = findAll(env.body, '.char-panel')[0];
  assert.ok(panel, 'панель .char-panel подвешена к body');
  assert.equal(panel.style.display, 'flex', 'панель открыта (display: flex)');
  const inv = paneByTabid(panel, 'inventory');
  assert.ok(inv, 'pane «Инвентарь» найден');
  assert.notEqual(inv.style.display, 'none', '«Инвентарь» — ВИДИМ');
  const ch = paneByTabid(panel, 'character');
  assert.equal(ch.style.display, 'none', '«Персонаж» — скрыт');
  const eq = paneByTabid(panel, 'equipment');
  assert.notEqual(eq.style.display, 'none',
    'правый столбец не тронут (дефолтная вкладка «Снаряжение» видима)');
});

test('000123: вкладка «Инвентарь» ЖИВА после повторного открытия БЕЗ tabId (columnState)', () => {
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  env.G.playerUI.setCharacter(c);
  env.G.playerUI.toggle(true, 'inventory');
  env.G.playerUI.toggle(false);
  assert.equal(findAll(env.body, '.char-panel')[0].style.display, 'none',
    'toggle(false) закрыл панель');
  env.G.playerUI.toggle(true);
  const panel = findAll(env.body, '.char-panel')[0];
  const inv = paneByTabid(panel, 'inventory');
  assert.notEqual(inv.style.display, 'none',
    'повторное открытие без tabId — «Инвентарь» всё ещё активен ' +
    '(статус columnState не сбрасывается)');
});

test('000123: toggle(true, "shop") — правый столбец; неизвестный tabId — без краха', () => {
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  env.G.playerUI.setCharacter(c);
  env.G.playerUI.toggle(true, 'shop');
  const panel = findAll(env.body, '.char-panel')[0];
  const shop = paneByTabid(panel, 'shop');
  assert.notEqual(shop.style.display, 'none', 'правый столбец — «Магазин» активен');
  const equip = paneByTabid(panel, 'equipment');
  assert.equal(equip.style.display, 'none', '«Снаряжение» — скрыт');
  // Неизвестный id — тихо игнорируется (activateTab гардится по
  // rec.panes[id]): без краха, панель открыта, активная вкладка не меняется.
  env.G.playerUI.toggle(true, 'nope');
  assert.equal(panel.style.display, 'flex', 'панель по-прежнему открыта');
  assert.notEqual(shop.style.display, 'none', '«Магазин» не сменился');
  const ch = paneByTabid(panel, 'character');
  assert.notEqual(ch.style.display, 'none',
    'левый столбец не тронут (дефолт «Персонаж» видима)');
});

test('000123: toggle() без аргументов — поведение БЕЗ ИЗМЕНЕНИЙ (anchor)', () => {
  const env = loadPanelUi();
  const c = env.G.createCharacter();
  env.G.playerUI.setCharacter(c);
  env.G.playerUI.toggle();
  const panel = findAll(env.body, '.char-panel')[0];
  assert.equal(panel.style.display, 'flex', 'toggle() открыл закрытую панель');
  env.G.playerUI.toggle();
  assert.equal(panel.style.display, 'none', 'toggle() закрыл открытую панель');
  env.G.playerUI.toggle();
  assert.equal(panel.style.display, 'flex', 'toggle() снова открыл');
  const inv = paneByTabid(panel, 'inventory');
  assert.equal(inv.style.display, 'none',
    'без tabId — дефолтная вкладка («Персонаж» видима, «Инвентарь» скрыта)');
});

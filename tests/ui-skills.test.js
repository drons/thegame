// Панель персонажа (src/ui.js): прогресс практики навыков в таблице навыков
// (задача 000041).
//
// Механика практики (c.skillXp[id], skillXpForNext, practiceCap — src/player.js)
// готова с задачи 000013 и покрыта tests/player.test.js / tests/combat.test.js;
// здесь — СЛОЙ ОТОБРАЖЕНИЯ: рендер таблицы навыков в панели.
//
// Браузерный модуль ui.js исполняется в vm-песочнице с минимальным DOM-стабом
// (паттерн tests/combat-ui.test.js / tests/dungeon-ui.test.js: скрипты игры —
// обычные <script>, каждый собирает globalThis.Game; в песочнице `module` нет,
// UMD-модули идут браузерной веткой). Стаб богаче боевых: render() панели
// работает по ДЕРЕВУ (panel.querySelectorAll('.cp-btn'), btn.closest('tr'),
// tr.querySelector('.cp-name'/' .cp-level' /'.cp-req')), поэтому элементы
// несут ссылку parent, а поиск — обход поддерева.
//
// КРАСНЫЕ (падают до реализации, зелёные после):
//   * .cp-level: «lvl (bank/need)» у вторичного навыка с непустой копилкой
//     c.skillXp[skill] и уровнем < 100 (need = G.skillXpForNext(lvl));
//   * .cp-req: у навыка на «потолке практикой» (lvl >= G.practiceCap) —
//     пометка «потолок практикой: <основной> X×2» + указание, что дальше
//     растёт только очками и книгами (и при lvl > cap — поднят книгами);
//   * структурный: текст src/ui.js ссылается на c.skillXp и G.practiceCap.
//
// ЗЕЛЁНЫЕ с первого запуска (регрессия-фиксация, что задача 000041 не ломает):
//   * пустая копилка (нет ключа / bank = 0) — просто «lvl», без шума «(0/N)»;
//   * максимальный уровень 100 — суффикса копилки НЕТ даже при bank > 0
//     (skillXpForNext(100) бессмысленен) и пометки потолка нет;
//   * ниже потолка: lvl > 0 — .cp-req пусто, lvl = 0 — требует (requiresText);
//   * основные навыки — просто число уровня, ячейки .cp-req нет;
//   * кнопка «+» — disabled строго по G.canRaise.
//
// Клик по «+» (вспышка причины неудачи raiseSkill в .cp-req на 1.5 с)
// покрыт отдельным кейсом: reason виден 1.5 с, а затем render() ВОЗВРАЩАЕТ
// постоянный текст ячейки (пометка потолка / требование) — ревью раунд 1
// (до исправления таймаут затыкал .cp-req пустой строкой).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');

// --- Минимальный DOM-стаб с деревом (см. заголовок) ---

// Селекторы, которые использует ui.js: «.класс» и имя тега ('tr').
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
  // textContent = '' — как в DOM, сбрасывает детей (renderItems() очищает
  // секции панели перед повторной отрисовкой).
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

// Цепочка из index.html до ui.js включительно (порядок ВАЖЕН: controls.js
// ДО ui.js — guard в ui.js; регрессия порядка — tests/index-order.test.js).
// 000130: между combat-keys.js и ui.js — реестр + саморегистрирующиеся
// вкладочные модули (тех. правка: файлы переехали, поведение — то же).
const CHAIN = [
  'global-settings.js', 'perlin.js', 'mapseed.js',
  'skills-data.js', 'items-data.js', 'npc-data.js',
  'map.js', 'sheet.js', 'player.js', 'day.js', 'items.js', 'buildings.js',
  'npc.js', 'combat.js', 'dungeon.js',
  'controls.js', 'combat-keys.js',
  'ui-tabs.js', 'ui-tab-skills.js', 'ui-tab-inventory.js',
  'ui-tab-settings.js', 'ui-tab-shop.js', 'ui-tab-quests.js',
  'ui.js',
];

// Загрузка цепочки в vm-песочницу. Возвращает { G, body, errors }:
// G — Game песочницы, body — document.body (к нему подвешена панель),
// errors — сообщения console.error (порядок загрузки).
function loadPlayerUi() {
  const errors = [];
  const document = {
    createElement: (tag) => makeEl(tag),
    body: makeEl('body'),
    querySelector: () => null,
    addEventListener: () => {},
    hidden: false,
  };
  const window = { addEventListener: () => {} };
  const sandbox = {
    console: {
      log: () => {}, info: () => {}, warn: () => {},
      error: (m) => errors.push(String(m)),
    },
    document, window, setTimeout, clearTimeout,
  };
  vm.createContext(sandbox);
  for (const f of CHAIN) vm.runInContext(src(f), sandbox, { filename: f });
  return { G: sandbox.Game, body: document.body, errors };
}

// Открыть панель для персонажа c (setCharacter + toggle(true) → buildPanel
// + render()). Ошибки загрузки (битый порядок) — сразу фейл.
function openPanel(env, c) {
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  assert.ok(env.G.playerUI,
    'Game.playerUI создан (controls.js загружен ДО ui.js)');
  env.G.playerUI.setCharacter(c);
  env.G.playerUI.toggle(true);
}

// Строка навыка в таблице: кнопка data-skill → <tr> → ячейки.
function skillRow(body, skillId) {
  const btn = findAll(body, '.cp-btn')
    .find((b) => b.dataset.skill === skillId);
  assert.ok(btn, 'кнопка data-skill=' + skillId + ' найдена');
  const tr = btn.closest('tr');
  assert.ok(tr, 'кнопка находится в строке <tr>');
  return {
    btn,
    tr,
    nameTd: tr.querySelector('.cp-name'),
    reqTd: tr.querySelector('.cp-req'),
    lvTd: tr.querySelector('.cp-level'),
  };
}

// --- КРАСНЫЕ: копилка опыта практики в .cp-level ---

test('панель: копилка — .cp-level «3 (12/60)» (bank/need, need = skillXpForNext)', () => {
  const env = loadPlayerUi();
  const c = env.G.createCharacter();
  c.primary.strength = 10;
  c.secondary.swordsman = 3;
  c.skillXp = { swordsman: 12 };
  openPanel(env, c);
  const { lvTd } = skillRow(env.body, 'swordsman');
  assert.equal(lvTd.textContent,
    '3 (12/' + env.G.skillXpForNext(3) + ')',
    'копилка: «lvl (bank/need)», need = 15·(lvl+1)');
});

test('панель: копилка при уровне 0 — «0 (3/15)», требование не сломано', () => {
  // Практика начисляется в бою до получения уровня очками: bank > 0,
  // а lvl ещё 0 (напр. fists/hide у свежего персонажа).
  const env = loadPlayerUi();
  const c = env.G.createCharacter(); // strength = 1, swordsman = 0
  c.skillXp = { swordsman: 3 };
  openPanel(env, c);
  const { lvTd, reqTd } = skillRow(env.body, 'swordsman');
  assert.equal(lvTd.textContent,
    '0 (3/' + env.G.skillXpForNext(0) + ')', 'копилка видна и на нулевом уровне');
  assert.equal(reqTd.textContent, '',
    'у «Мечника» нет требований — .cp-req пусто');
});

// --- КРАСНЫЕ: пометка «потолок практикой» в .cp-req ---

test('панель: у потолка (lvl = основной×2) — пометка в .cp-req', () => {
  const env = loadPlayerUi();
  const c = env.G.createCharacter();
  c.primary.strength = 5;
  c.secondary.swordsman = 10; // потолок = 5×2 = 10 = G.practiceCap
  openPanel(env, c);
  const t = skillRow(env.body, 'swordsman').reqTd.textContent;
  assert.ok(t.startsWith('потолок практикой:'), 'пометка начинается с маркера: ' + t);
  assert.ok(t.includes('Сила'), 'имя основного навыка: ' + t);
  assert.ok(t.includes('5×2'), 'X×2, где X — уровень основного: ' + t);
  assert.ok(t.includes('очк') && t.includes('книг'),
    'указание: дальше растёт только очками и книгами: ' + t);
});

test('панель: выше потолка (уровни книгами) — пометка потолка всё ещё показывается', () => {
  const env = loadPlayerUi();
  const c = env.G.createCharacter();
  c.primary.strength = 5;
  c.secondary.swordsman = 12; // > потолка 10: поднят книгами (skillReadBook)
  openPanel(env, c);
  const t = skillRow(env.body, 'swordsman').reqTd.textContent;
  assert.ok(t.startsWith('потолок практикой:'), 'практика не работает — маркер: ' + t);
  assert.ok(t.includes('Сила') && t.includes('5×2'),
    'имя основного и X×2: ' + t);
});

test('панель: структурный — вкладка «Персонаж» рисует c.skillXp и G.practiceCap', () => {
  // Ловит «забыли отрисовать», даже если рендер-тесты пострадают.
  // 000130: рендер строк навыков переехал из ui.js в
  // src/ui-tab-skills.js (саморегистрирующаяся вкладка) — код панели
  // теперь в новом пути; интент фиксатора тот же.
  const ui = src('ui-tab-skills.js');
  assert.match(ui, /skillXp/, 'копилка опыта практикуется (c.skillXp)');
  assert.match(ui, /practiceCap/, 'потолок практики — G.practiceCap');
});

// --- ЗЕЛЁНЫЕ с первого запуска (регрессия-фиксация) ---

test('панель: пустая копилка — просто уровень (нет ключа и bank = 0)', () => {
  const env = loadPlayerUi();
  const c = env.G.createCharacter();
  c.primary.strength = 10;
  c.secondary.swordsman = 3;
  // createCharacter создаёт skillXp: {} — ключа swordsman нет.
  openPanel(env, c);
  assert.equal(skillRow(env.body, 'swordsman').lvTd.textContent, '3',
    'нет ключа в skillXp — без скобок');
  c.skillXp = { swordsman: 0 };
  env.G.playerUI.render();
  assert.equal(skillRow(env.body, 'swordsman').lvTd.textContent, '3',
    'bank = 0 — без шума «(0/N)»');
});

test('панель: максимальный уровень 100 — суффикса копилки нет даже при bank > 0', () => {
  const env = loadPlayerUi();
  const c = env.G.createCharacter();
  c.primary.strength = 100;
  c.secondary.swordsman = 100; // = MAX_SKILL_LEVEL
  c.skillXp = { swordsman: 5 }; // копилка может остаться при максимуме
  openPanel(env, c);
  const { lvTd, reqTd } = skillRow(env.body, 'swordsman');
  assert.equal(lvTd.textContent, '100',
    'без «(5/1515)» — порог на максимуме бессмысленен');
  assert.equal(reqTd.textContent, '', 'на максимуме пометки потолка нет');
});

test('панель: ниже потолка — .cp-req пусто (lvl > 0) и требует (lvl = 0)', () => {
  const env = loadPlayerUi();
  const c = env.G.createCharacter();
  c.primary.strength = 5;
  c.secondary.swordsman = 4; // ниже потолка 10
  openPanel(env, c);
  const sw = skillRow(env.body, 'swordsman');
  assert.equal(sw.lvTd.textContent, '4');
  assert.equal(sw.reqTd.textContent, '',
    'lvl > 0 ниже потолка — .cp-req пусто (как раньше)');
  // «Тяжёлое оружие» требует «Мечник 5» — requiresText не сломан.
  assert.equal(skillRow(env.body, 'heavy').reqTd.textContent, 'Мечник 5',
    'lvl = 0 — текст требования');
});

test('панель: основные навыки — просто число уровня, ячейки .cp-req нет', () => {
  const env = loadPlayerUi();
  const c = env.G.createCharacter();
  c.primary.strength = 1;
  openPanel(env, c);
  const row = skillRow(env.body, 'strength');
  assert.equal(row.nameTd.textContent, 'Сила');
  assert.equal(row.lvTd.textContent, '1',
    'основной навык — число, без копилки (копилки только у вторичных)');
  assert.equal(row.reqTd, null, 'в строках основных навыков нет .cp-req');
});

test('панель: кнопка «+» — disabled строго по G.canRaise', () => {
  const env = loadPlayerUi();
  const c = env.G.createCharacter(); // points = 0
  c.secondary.swordsman = 3;
  openPanel(env, c);
  let { btn } = skillRow(env.body, 'swordsman');
  assert.equal(btn.disabled, true, 'нет очков — кнопка disabled');
  c.points = 1;
  env.G.playerUI.render();
  ({ btn } = skillRow(env.body, 'swordsman'));
  assert.equal(btn.disabled, false, 'очко есть — кнопка активна');
});

test('панель: неудачный клик — reason 1.5 с, потом постоянный текст .cp-req', async () => {
  // Ревью раунд 1: setTimeout от «вспышки» затыкал .cp-req пустой строкой
  // и до следующего render() стирал постоянную пометку «потолок практикой»
  // (раньше — requiresText). Теперь через 1.5 с работает render(): и
  // вспышка реально видна (reason пишется ПОСЛЕ render()), и постоянный
  // текст возвращается.
  const env = loadPlayerUi();
  const c = env.G.createCharacter(); // points = 0 — raiseSkill не пройдёт
  c.primary.strength = 5;
  c.secondary.swordsman = 10; // потолок практикой: 5×2 = 10
  openPanel(env, c);
  const sw = skillRow(env.body, 'swordsman');
  const heavy = skillRow(env.body, 'heavy'); // lvl = 0 — требует «Мечник 5»
  const marker = sw.reqTd.textContent;
  assert.ok(marker.startsWith('потолок практикой:'),
    'постоянная пометка до клика: ' + marker);
  assert.equal(heavy.reqTd.textContent, 'Мечник 5', 'требование до клика');

  // Делегированный кликер на панели: handler({ target: btn }).
  // Кнопка в реальности disabled (нет очков) — симулируем гонку состояния:
  // панель не перерисована после траты очков, клик дошёл до raiseSkill.
  const panel = findAll(env.body, '.char-panel')[0];
  assert.ok(panel && panel.listeners.click && panel.listeners.click.length,
    'делегированный click-обработчик на панели');
  const click = (btn) => panel.listeners.click[0]({ target: btn });

  click(sw.btn);
  assert.equal(sw.reqTd.textContent, 'нет свободных очков навыков',
    'reason виден сразу (вспышка, 1.5 с)');
  click(heavy.btn);
  assert.equal(heavy.reqTd.textContent, 'нет свободных очков навыков',
    'reason виден сразу (строка lvl = 0)');

  await new Promise((r) => setTimeout(r, 1700));
  assert.equal(sw.reqTd.textContent, marker,
    'через 1.5 с пометка потолка НЕ затирается — восстановлена');
  assert.equal(heavy.reqTd.textContent, 'Мечник 5',
    'через 1.5 с текст требования восстановлен');
});

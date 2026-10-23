// Задача 000194: кнопка «Быстрый предмет» → СПИСОК быстрых слотов с
// ОПИСАНИЯМИ, ПОВЕРХ экрана боя (.combat-quicklist); выбор предмета —
// кликом по строке. Список — активного персонажа (герой ИЛИ союзник —
// у.activeUnitId; у союзника — u.quick/пул, диспатч ядра c.quickItem).
//
// Красные (5): .combat-quicklist отсутствует в DOM; KeyE напрямую
// потребляет слот (нет списка); кнопка quickItem на ходу союзника —
// disabled («недоступно активному персонажу»). Якорь (1): finish() —
// isActive/handleCode + относительный порядок .combat-side (R11).
// Правки по ревью (2): блок — список НЕ открывается (194-QUI-BLOCK);
// stale-первый слот союзника — кнопка ≡ клавиша (194-QUI-ALLY-STALE).
//
// Песочница — статическая цепочка (дублирование harness
// tests/combat-ui.test.js принято в проекте): vm + минимальный DOM-стаб,
// UMD-модули браузерной веткой.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');

// --- Минимальный DOM-стаб (копия tests/combat-ui.test.js) ---

function makeContext2d(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

function makeEl(tag, buttons) {
  const el = {
    tagName: tag,
    className: '',
    textContent: '',
    title: '',
    disabled: false,
    style: {},
    dataset: {},
    children: [],
    onclick: null,
    listeners: {},
    appendChild(ch) { this.children.push(ch); return ch; },
    remove() {},
    addEventListener(type, fn) {
      (this.listeners[type] || (this.listeners[type] = [])).push(fn);
    },
    querySelectorAll() { return buttons; },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: this.width, height: this.height };
    },
  };
  if (tag === 'canvas') {
    el.width = 0;
    el.height = 0;
    el.getContext = () => makeContext2d(el);
  }
  return el;
}

function makeRafStubs() {
  const scheduled = [];
  const cancelled = [];
  let id = 0;
  return {
    scheduled, cancelled,
    requestAnimationFrame(fn) { scheduled.push(fn); return ++id; },
    cancelAnimationFrame(x) { cancelled.push(x); },
  };
}

// Цепочка src-скриптов (порядок index.html) + combat-ui.js в песочнице.
// Возврат: { G, keydown, buttons, body }.
function loadCombatUi194() {
  const keydown = [];
  const buttons = [];
  const document = {
    createElement: (tag) => {
      const el = makeEl(tag, buttons);
      if (tag === 'button') buttons.push(el);
      return el;
    },
    body: makeEl('body', buttons),
  };
  const window = {
    addEventListener: (type, fn) => {
      if (type === 'keydown') keydown.push(fn);
    },
  };
  const rafStubs = makeRafStubs();
  const sandbox = {
    console, document, window,
    performance: { now: () => 1000 },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  };
  vm.createContext(sandbox);
  for (const f of [
    'global-settings.js', 'perlin.js', 'map.js',
    'skills-data.js', 'items-data.js',
    'sheet.js', 'player.js',
    'items.js', 'controls.js', 'combat.js',
    'combat-keys.js',
  ]) {
    vm.runInContext(src(f), sandbox, { filename: f });
  }
  if (fs.existsSync(path.join(ROOT, 'src', 'spellbook.js'))) {
    vm.runInContext(src('spellbook.js'), sandbox, { filename: 'spellbook.js' });
  }
  vm.runInContext(src('sprites.js'), sandbox, { filename: 'sprites.js' });
  if (fs.existsSync(path.join(ROOT, 'src', 'combat-scale.js'))) {
    vm.runInContext(src('combat-scale.js'), sandbox, { filename: 'combat-scale.js' });
  }
  vm.runInContext(src('combat-ui.js'), sandbox, { filename: 'combat-ui.js' });
  vm.runInContext(src('motion.js'), sandbox, { filename: 'motion.js' });
  return { G: sandbox.Game, keydown, buttons, body: document.body,
    rafStubs };
}

// Элемент оверлея по className.
function findByClass(el, cls) {
  if (el.className === cls) return el;
  for (const ch of el.children || []) {
    const found = findByClass(ch, cls);
    if (found) return found;
  }
  return null;
}

function findCanvas(el) {
  if (el.tagName === 'canvas') return el;
  for (const ch of el.children || []) {
    const found = findCanvas(ch);
    if (found) return found;
  }
  return null;
}

function press(keydown, code) {
  const e = { code, preventDefault() {}, stopPropagation() {} };
  for (const fn of keydown) fn(e);
}

// Сцена: бой с одним волком, hero со зельем в первом быстром слоте.
function scene() {
  const S = loadCombatUi194();
  const hero = S.G.createCharacter();
  S.G.addItem(hero, 'healing_potion');
  S.G.setQuick(hero, 0, 'healing_potion');
  const c = S.G.combatUI.startCombat({
    hero, mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  return Object.assign({ c, canvas: findCanvas(S.body), hero }, S);
}

// Кнопки панели действий по dataset.act.
function byAct(S) {
  const m = {};
  for (const b of S.body.querySelectorAll('.combat-actions button'))
    m[b.dataset.act] = b;
  return m;
}

// --- 194-QUI-BUILD (красный) ---

test('194-QUI-BUILD: .combat-quicklist — МЕЖДУ .combat-actions и .combat-log в .combat-side, скрыта до KeyE', () => {
  const S = scene();
  const side = findByClass(S.body, 'combat-side');
  assert.ok(side, 'боковая панель .combat-side есть');
  const ql = findByClass(S.body, 'combat-quicklist');
  assert.ok(ql,
    'контейнер списка .combat-quicklist создан build() '
    + '(краснота: отсутствует)');
  const idx = (cls) => side.children.findIndex(
    (ch) => ch.className === cls);
  const iA = idx('combat-actions');
  const iQ = idx('combat-quicklist');
  const iL = idx('combat-log');
  assert.ok(iA >= 0 && iL >= 0,
    'соседи на месте: ' + side.children.map((ch) => ch.className).join(','));
  assert.ok(iL < iQ && iQ < iA,
    'порядок: log < quicklist < actions (000246: кнопки — в самый '
    + 'низ); (краснота: iQ=' + iQ + ')');
  assert.equal(ql.style.display, 'none',
    'скрыт до открытия (краснота: ' + ql.style.display + ')');
});

// --- 194-QUI-OPEN (красный) ---

test('194-QUI-OPEN: KeyE (ход героя) — список ПОВЕРХ боя: 3 строки с именем + ОПИСАНИЕМ, предмет НЕ потреблён', () => {
  const S = scene();
  assert.equal(S.G.activeUnitId(S.c), 'player', 'сценарий: ход героя');
  press(S.keydown, 'KeyE');
  const ql = findByClass(S.body, 'combat-quicklist');
  assert.ok(ql, 'список создан (краснота: отсутствует)');
  assert.equal(ql.style.display, '',
    'открыт (краснота: ' + ql.style.display + ')');
  const rows = ql.children.filter((ch) =>
    String(ch.className).includes('combat-quickrow'));
  assert.equal(rows.length, 3,
    'строк = QUICK_SLOTS = 3 (краснота: ' + rows.length + ')');
  for (const r of rows) assert.notEqual(r.tagName, 'BUTTON',
    'строки — div (R9-паттерн книги)');
  // Строка 0 — занятое зелье: имя + desc предмета.
  const name0 = rows[0].children.find((ch) =>
    String(ch.className).includes('combat-quickname'));
  const desc0 = rows[0].children.find((ch) =>
    String(ch.className).includes('combat-quickrow-desc'));
  assert.ok(name0, 'у строки 0 есть .combat-quickname');
  assert.ok(String(name0.textContent).includes('Зелье лечения'),
    'имя предмета: ' + name0.textContent);
  assert.ok(desc0, 'у строки 0 есть .combat-quickrow-desc');
  assert.equal(desc0.textContent,
    S.G.getItem('healing_potion').desc, 'ОПИСАНИЕ предмета дословно');
  assert.ok(!String(rows[0].className).includes('combat-quickrow-off'),
    'строчка 0 — активна');
  for (const i of [1, 2]) {
    assert.ok(String(rows[i].className).includes('combat-quickrow-off'),
      'пустой слот ' + i + ' — приглушён');
  }
  // Сам список НЕ потребляет: зелье — в своём слоте (000223:
  // перенесено из запасов), пул не сгорел.
  assert.equal(S.G.totalQty(S.c.player, 'healing_potion'), 0,
    '000223: зелье в слоте; открытием списка НЕ потрачено');
  assert.equal(S.c.ps.quickItem, 1, 'пул не сгорел');
});

// --- 194-QUI-CLICK (красный) ---

test('194-QUI-CLICK: клик по строке — действие c.quickItem(slot), список закрыт, предмет потреблён', () => {
  const S = scene();
  press(S.keydown, 'KeyE');
  const ql = findByClass(S.body, 'combat-quicklist');
  assert.ok(ql, 'список создан (краснота: отсутствует)');
  const rows = ql.children.filter((ch) =>
    String(ch.className).includes('combat-quickrow'));
  assert.equal(rows.length, 3, '3 строки (краснота: ' + rows.length + ')');
  assert.ok(rows[0].listeners.click && rows[0].listeners.click.length,
    'у строки есть click-обработчик');
  rows[0].listeners.click[0]({ target: rows[0] });
  assert.equal(S.G.totalQty(S.c.player, 'healing_potion'), 0,
    'зелье потреблено кликом');
  assert.equal(S.c.ps.quickItem, 0, 'пул quickItem 1→0');
  assert.ok(S.c.log.some((l) => l.includes('Зелье лечения')),
    'строка применения в логе: ' + S.c.log.join(' | '));
  assert.equal(ql.style.display, 'none', 'список закрыт после применения');
});

// --- 194-QUI-REJ (красный) ---

test('194-QUI-REJ: строка на неприменимый предмет (реагент) — приглушена; клик — причина в логе, список открыт, пул не тратится', () => {
  const S = scene();
  // 000223: stale-слот недостижим (слот владеет своей единицей);
  // приглушение — по kind-отказу: сера в слоте 0 (overwrite: зелье
  // вернулось в запас).
  S.G.addItem(S.c.player, 'sulfur');
  S.G.setQuick(S.c.player, 0, 'sulfur');
  press(S.keydown, 'KeyE');
  const ql = findByClass(S.body, 'combat-quicklist');
  assert.ok(ql, 'список создан (краснота: отсутствует)');
  const rows = ql.children.filter((ch) =>
    String(ch.className).includes('combat-quickrow'));
  assert.equal(rows.length, 3, '3 строки (краснота: ' + rows.length + ')');
  assert.ok(String(rows[0].className).includes('combat-quickrow-off'),
    'строка на реагент — приглушена');
  assert.ok(rows[0].listeners.click && rows[0].listeners.click.length,
    'у приглушённой строки есть click (причина в лог)');
  const pool = S.c.ps.quickItem;
  const logLen = S.c.log.length;
  rows[0].listeners.click[0]({ target: rows[0] });
  assert.ok(S.c.log.slice(logLen)
    .some((l) => l.includes('реагент нельзя применить (торговый товар)')),
    'причина ядра в журнале: ' + S.c.log.slice(logLen).join(' | '));
  assert.equal(S.c.ps.quickItem, pool, 'пул не тратится');
  assert.equal(ql.style.display, '', 'список остаётся открыт (отказ)');
});

// --- 194-QUI-ALLY (красный) ---

test('194-QUI-ALLY: на ходу СОЮЗНИКА кнопка quickItem включена; KeyE — список из u.quick союзника', () => {
  const S = scene();
  const merc = S.G.makeAlly({
    name: 'Вольк', role: 'melee', level: 2, dmg: 1, hp: 1,
    attrs: { dexterity: 4, intelligence: 4 },
  }, 1);
  merc.x = 3; merc.y = 5;
  S.c.units.push(merc);
  S.c.turnOrder.push(merc.id);
  merc.quick = ['healing_potion', null, null];
  merc.quickItem = 1;
  merc.invItem = 1;
  const w = S.c.units.find((x) => x.id === 'm0');
  w.x = 3; w.y = 4; // d 1 от наёмника
  press(S.keydown, 'Space');
  assert.equal(S.G.activeUnitId(S.c), 'a1',
    'активен наёмник (краснота: ' + S.G.activeUnitId(S.c) + ')');
  // 000223: зелье героя — в его СВОЁМ слоте (scene: setQuick перенесло
  // из запасов); действие союзника слот героя не трогает.
  assert.equal(S.G.totalQty(S.c.player, 'healing_potion'), 0,
    'зелье героя в его слоте (переносом), НЕ потрачено');
  S.G.addItem(S.c.player, 'healing_potion'); // запас для кнопки invItem (000223)
  S.rafStubs.scheduled[S.rafStubs.scheduled.length - 1](); // кадр — пересчёт кнопок
  const acts = byAct(S);
  assert.equal(acts.quickItem.disabled, false,
    'кнопка «Быстрый предмет» ВКЛЮЧЕНА на ходу союзника '
    + '(краснота: disabled, title «' + acts.quickItem.title + '»)');
  assert.equal(acts.invItem.disabled, false,
    'кнопка «Предмет» ВКЛЮЧЕНА на ходу союзника '
    + '(краснота: disabled, title «' + acts.invItem.title + '»)');
  press(S.keydown, 'KeyE');
  const ql = findByClass(S.body, 'combat-quicklist');
  assert.ok(ql, 'список создан (краснота: отсутствует)');
  assert.equal(ql.style.display, '', 'открыт');
  const rows = ql.children.filter((ch) =>
    String(ch.className).includes('combat-quickrow'));
  assert.equal(rows.length, 3, '3 строки (краснота: ' + rows.length + ')');
  const name0 = rows[0].children.find((ch) =>
    String(ch.className).includes('combat-quickname'));
  assert.ok(name0, 'строка 0 — имя');
  assert.ok(String(name0.textContent).includes('Зелье лечения'),
    'из u.quick СОЮЗНИКА: ' + name0.textContent);
  assert.ok(!String(rows[0].className).includes('combat-quickrow-off'),
    'строчка 0 активна');
  for (const i of [1, 2]) {
    assert.ok(String(rows[i].className).includes('combat-quickrow-off'),
      'пустые слоты приглушены');
  }
  // Слоты героя в списке НЕ отображаются (у героя — свой список:
  // 000223: его зелье в его слоте; здесь строки из u.quick наёмника);
  // добавленный запас союзным действием не потрачен.
  assert.equal(S.G.totalQty(S.c.player, 'healing_potion'), 1,
    '000223: добавленный запас НЕ потрачен союзником');
  assert.equal(S.c.player.inventory.quick[0], 'healing_potion',
    'слот героя цел');
});

// --- 194-QUI-BLOCK (правка по ревью) ---

test('194-QUI-BLOCK: блок — список НЕ открывается: KeyE — причина в журнал, кнопка disabled (референс — книга)', () => {
  const S = scene();
  const r = S.c.block();
  assert.ok(r && r.ok, 'сценарий: блок поставлен');
  assert.equal(S.c.ps.blocked, true, 'c.ps.blocked = true');
  assert.equal(S.c.ps.quickItem, 1, 'пул quickItem блоком не тратится');
  press(S.keydown, 'KeyE');
  const ql = findByClass(S.body, 'combat-quicklist');
  assert.ok(ql, 'список создан');
  assert.equal(ql.style.display, 'none',
    'список НЕ открыт при блоке (краснота: ' + ql.style.display + ')');
  assert.ok(S.c.log.some((l) =>
    l.includes('блок — только последнее действие')),
    'причина в журнале: ' + S.c.log.slice(-3).join(' | '));
  const acts = byAct(S);
  assert.equal(acts.quickItem.disabled, true,
    'кнопка disabled при блоке (краснота: title «'
    + acts.quickItem.title + '»)');
  assert.equal(acts.quickItem.title, 'блок — только последнее действие',
    'title — причина (краснота: «' + acts.quickItem.title + '»)');
});

// --- 194-QUI-ALLY-STALE (правка по ревью) ---

test('194-QUI-ALLY-STALE: 000223: слот — своя единица: реагент-строка 0 приглушена (kind-отказ), строка 1 активна; кнопка ≡ KeyE, клик открывает список', () => {
  const S = scene();
  const merc = S.G.makeAlly({
    name: 'Вольк', role: 'melee', level: 2, dmg: 1, hp: 1,
    attrs: { dexterity: 4, intelligence: 4 },
  }, 1);
  merc.x = 3; merc.y = 5;
  S.c.units.push(merc);
  S.c.turnOrder.push(merc.id);
  // 000223: stale недостижим (слот — СВОЯ единица); строка 0
  // приглушена kind-отказом (реагент), строка 1 активна (зелье).
  merc.quick = ['sulfur', 'healing_potion', null];
  merc.quickItem = 1;
  merc.invItem = 1;
  const w = S.c.units.find((x) => x.id === 'm0');
  w.x = 3; w.y = 4; // d 1 от наёмника
  press(S.keydown, 'Space');
  assert.equal(S.G.activeUnitId(S.c), 'a1',
    'активен наёмник (краснота: ' + S.G.activeUnitId(S.c) + ')');
  const acts = byAct(S);
  assert.equal(acts.quickItem.disabled, false,
    'кнопка ВКЛЮЧЕНА (≡ клавиши) '
    + '(краснота: disabled, title «' + acts.quickItem.title + '»)');
  assert.equal(acts.quickItem.title, '',
    'title пуст (клик открывает список, а не отказ)');
  acts.quickItem.listeners.click[0]({ target: acts.quickItem });
  const ql = findByClass(S.body, 'combat-quicklist');
  assert.ok(ql, 'список создан');
  assert.equal(ql.style.display, '',
    'клик по кнопке — список ОТКРЫТ (краснота: ' + ql.style.display + ')');
  const rows = ql.children.filter((ch) =>
    String(ch.className).includes('combat-quickrow'));
  assert.equal(rows.length, 3, '3 строки (краснота: ' + rows.length + ')');
  assert.ok(String(rows[0].className).includes('combat-quickrow-off'),
    'строка 0 (реагент — kind-отказ) — приглушена');
  assert.ok(!String(rows[1].className).includes('combat-quickrow-off'),
    'строка 1 (зелье — своя единица) — активна');
});

// --- 194-QUI-FINISH (якорь) ---

test('194-QUI-FINISH (якорь): finish() — isActive false, KeyE не потребляется; порядок .combat-side (log < quicklist < actions — 000246)', () => {
  const S = scene();
  const side = findByClass(S.body, 'combat-side');
  const idx = (cls) => side.children.findIndex(
    (ch) => ch.className === cls);
  assert.ok(idx('combat-log') < idx('combat-quicklist'),
    '000246: log < quicklist');
  assert.ok(idx('combat-quicklist') < idx('combat-actions'),
    '000246: quicklist < actions');
  S.c.result = { outcome: 'victory', xp: 0, gold: 0, defeated: 1 };
  press(S.keydown, 'Space');
  assert.equal(S.G.combatUI.isActive(), false, 'после finish — не активен');
  assert.equal(S.G.combatUI.handleCode('KeyE'), false,
    'KeyE после боя не потребляется');
});

// --- 000216-B2 (красный) ---
// Быстрый предмет под ОТКРЫТЫМ диалогом побега: модал-контракт 000210 —
// под диалогом ВСЕ JS-точки входа боя — тихий no-op (0 ядра/0 лога/
// 0 c._rng), закрытие — ТОЛЬКО «да»/«нет». Краснота: клик по строке
// быстрого предмета под диалогом применяет предмет и сжигает ход
// (quickUseRow — без fleeOpen-гарда).

test('000216-B2: быстрый предмет под открытым диалогом побега: KeyE (список) → KeyF (диалог) → клик по строке = no-op (снимок бит-в-бит: hp/mp/пул/предмет/лог/round/phase, 0 c._rng); KeyE-повтор и Escape под диалогом — глотаются; после «нет» — клик работает (предмет потреблён, список закрыт)', () => {
  const S = scene();
  const { G, c } = S;
  assert.equal(G.activeUnitId(c), 'player', 'сценарий: ход героя');
  c.player.hp = G.derived(c.player).maxHP - 15; // зазор для +15 на финальном шаге
  let rngCalls = 0;
  c._rng = () => { rngCalls++; return 0.99; };
  const ql = findByClass(S.body, 'combat-quicklist');
  assert.ok(ql, 'список создан (loadCombatUi194)');
  const fleeBox = findByClass(S.body, 'combat-flee-confirm');
  assert.ok(fleeBox, 'диалог побега на месте в цепи (loadCombatUi194)');
  const snap = () => ({
    hp: c.player.hp,
    mp: c.player.mp,
    ps: Object.assign({}, c.ps),
    qty: G.totalQty(c.player, 'healing_potion'),
    logLen: c.log.length,
    round: c.round,
    phase: c.phase,
    quick: ql.style.display,
    flee: fleeBox.style.display,
    units: c.units.map((u) => [u.id, u.x, u.y, u.hp]),
  });
  // Строка 0 — ПОСЛЕДНЯЯ с dataset.slot === '0' (vm-ловушка: перестроение
  // ДОБАВЛЯЕТ строки, innerHTML='' не чистит children — 194-паттерн).
  const row0 = () => {
    const rows = ql.children.filter((ch) =>
      String(ch.className).includes('combat-quickrow')
      && ch.dataset && ch.dataset.slot === '0');
    return rows[rows.length - 1];
  };
  // (1) KeyE — список ПОВЕРХ боя.
  press(S.keydown, 'KeyE');
  assert.equal(ql.style.display, '', 'список открыт (KeyE)');
  // (2) KeyF — диалог побега СВЕРХУ открытого списка (quickOpen не тронут).
  press(S.keydown, 'KeyF');
  assert.notEqual(fleeBox.style.display, 'none', 'диалог открыт (KeyF)');
  assert.equal(rngCalls, 0, 'открытие диалога — 0 c._rng');
  assert.equal(ql.style.display, '',
    'список НЕ закрывается под диалогом (quickOpen не тронут)');
  // (3) Снимок ДО клика.
  const before = snap();
  // (4) КЛИК ПО СТРОКЕ под диалогом = no-op (краснота: предмет применён,
  // снимок расходится по qty/пулу/логу/списку).
  row0().listeners.click[0]({ target: row0() });
  assert.deepEqual(snap(), before,
    'клик по строке под диалогом = no-op (предмет не применён, бит-в-бит)');
  assert.equal(rngCalls, 0, 'no-op — 0 c._rng');
  assert.equal(ql.style.display, '', 'список остался открыт');
  assert.notEqual(fleeBox.style.display, 'none', 'диалог остался открыт');
  // (5) KeyE-повтор под диалогом — глотается (гард handleCode), список
  // НЕ закрывается (пин KeyE-канала).
  press(S.keydown, 'KeyE');
  assert.deepEqual(snap(), before,
    'KeyE-повтор под диалогом — глотается (список не закрылся)');
  assert.equal(ql.style.display, '', 'список открыт после KeyE-повтора');
  // (6) Escape под диалогом — глотается, диалог НЕ закрывается (Д8).
  press(S.keydown, 'Escape');
  assert.deepEqual(snap(), before, 'Escape под диалогом — глотается');
  assert.notEqual(fleeBox.style.display, 'none',
    'диалог остался открыт (Escape НЕ закрывает — только «да»/«нет»)');
  // (7) Закрытие «нет» — тихое, 0 ядра (снимок без изменений, кроме flee).
  fleeBox.children[1].children[1].listeners.click[0]();
  assert.equal(fleeBox.style.display, 'none', 'диалог закрыт «нет»');
  const afterClose = snap();
  assert.equal(afterClose.hp, before.hp, '«нет» — hp нетронут');
  assert.equal(afterClose.qty, before.qty, '«нет» — предмет нетронут');
  assert.equal(afterClose.logLen, before.logLen, '«нет» — 0 строк лога');
  assert.equal(afterClose.ps.quickItem, before.ps.quickItem, '«нет» — пул нетронут');
  assert.equal(afterClose.quick, before.quick, '«нет» — список остался открыт');
  // (8) Клик ПОСЛЕ закрытия РАБОТАЕТ (194-QUI-CLICK восстановлен).
  row0().listeners.click[0]({ target: row0() });
  assert.equal(G.totalQty(c.player, 'healing_potion'), 0, 'зелье потреблено');
  assert.equal(c.ps.quickItem, 0, 'пул quickItem 1→0');
  assert.equal(c.player.hp, G.derived(c.player).maxHP, 'лечение +15 (зазор)');
  assert.equal(c.log.length, afterClose.logLen + 1, 'строка применения в логе');
  assert.ok(c.log.some((l) => l.includes('Зелье лечения')),
    'строка применения: ' + c.log.slice(-2).join(' | '));
  assert.equal(ql.style.display, 'none', 'список закрыт после применения');
});

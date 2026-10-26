// 000278: vm-e2e для пути 000271 (все враги разбежались от страха) —
// баннер конца боя «Противники разбежались.» (корректный субъект) +
// shape-пин поля `by` — и регрессионный пин playerFlee-пути
// «Вы ушли из боя.» (000210).
//
// Баг (RETRO-20261026 F1): путь 000271 переиспользует исход 'fled'
// (исторически — бегство ИГРОКА, 000210), а баннер (src/combat-ui.js)
// ОДИН текст на ОБА исхода → чужое (врагов) бегство показывалось как
// своё. Фикс — аддитивное поле `by` происхождения 'fled'-исхода
// ('mobs'/'player') + ветка баннера; контракт:
// memory/000278-fled-banner.md §2.1/§2.2.
//
// Харнесс — СВОЙ самодостаточный упрощённый дубль loadCombatUi-цепочки
// tests/combat-ui.test.js (прецеденты 000083/000087: хелперы в tests/
// не экспортируются, каждый файл сам за себя): цепочка <script>
// БИТ-В-БИТ по сцене scene84-дефолту (без опций — со sprites.js,
// existsSync-гарды spellbook.js/combat-scale.js — тихий пропуск),
// performance.now = 1000, rAF-стабы. main.js НЕ нужен — пин баннер,
// не onEnd/мир. НОВЫХ <script>-тегов/модулей НЕТ → index.html и
// tests/index-order.test.js не правятся.
//
// Красные до фикса (expectedRedCount = 3, с репином FR-2):
//  * FLB-1 — shape (нет `by`) + баннер («Вы ушли из боя.» вместо
//    «Противники разбежались.»);
//  * FLB-2 — shape {outcome, by:'player'} (нет `by` в playerFlee);
//    banner-часть — зелёная с первого раза (регрессионный пин по ТЗ).
// Кросс-realm (ловушки 000276/000076/000082/000046): vm-объекты
// сравниваются с host-литералами ТОЛЬКО через
// JSON.parse(JSON.stringify(x)) (c.result — плоский: строки+целые,
// потерь нет) или примитивами (banner.textContent, строки c.log —
// String-примитивы, realm-безопасны).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');

// --- Минимальный DOM-стаб (дубль tests/combat-ui.test.js) ---

// Canvas 2D: методы — no-op (каждый вызов — [имя, args] в el.drawCalls),
// свойства — записываются (Proxy get — нет в target → функция).
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
    appendChild(ch) {
      this.children.push(ch);
      ch.parentElement = this;
      return ch;
    },
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

// Цепочка loadCombatUi (БИТ-В-БИТ по дефолту — без опций: со sprites.js,
// existsSync-гарды spellbook.js/combat-scale.js) + scene84-опции
// (performance.now = 1000, rAF-стабы). Возврат: { G, keydown, buttons,
// body, rafStubs } — как loadCombatUi, плюс rafStubs.
function loadHarness() {
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
  ]) {
    vm.runInContext(src(f), sandbox, { filename: f });
  }
  vm.runInContext(src('combat-keys.js'), sandbox, { filename: 'combat-keys.js' });
  if (fs.existsSync(path.join(ROOT, 'src', 'spellbook.js'))) {
    vm.runInContext(src('spellbook.js'), sandbox, { filename: 'spellbook.js' });
  }
  vm.runInContext(src('sprites.js'), sandbox, { filename: 'sprites.js' });
  if (fs.existsSync(path.join(ROOT, 'src', 'combat-scale.js'))) {
    vm.runInContext(src('combat-scale.js'), sandbox, { filename: 'combat-scale.js' });
  }
  vm.runInContext(src('combat-ui.js'), sandbox, { filename: 'combat-ui.js' });
  vm.runInContext(src('motion.js'), sandbox, { filename: 'motion.js' });
  return { G: sandbox.Game, keydown, buttons, body: document.body, rafStubs };
}

// Элемент оверлея по className (оверлей подвешен к body песочницы).
function findByClass(el, cls) {
  if (el.className === cls) return el;
  for (const ch of el.children || []) {
    const found = findByClass(ch, cls);
    if (found) return found;
  }
  return null;
}

// Нажать клавишу через зарегистрированный keydown-обработчик.
function press(keydown, code) {
  const e = { code, preventDefault() {}, stopPropagation() {} };
  for (const fn of keydown) fn(e);
}

// Re-render — последний запланированный rAF-tick (цикл 000047: пока
// оверлей открыт — рендер на каждый tick; идемпотентен).
function tick(rafStubs) {
  rafStubs.scheduled[rafStubs.scheduled.length - 1]();
}

// Ставит игрока вплотную к живому мому (копия хелпера
// tests/fright-000271.test.js — изолированный запуск).
function standNextTo(c, u) {
  const w = (u.size && u.size.w) || 1, h = (u.size && u.size.h) || 1;
  const taken = (x, y) => c.units.some((v) => v.alive && !v.fled
    && x >= v.x && x < v.x + ((v.size && v.size.w) || 1)
    && y >= v.y && y < v.y + ((v.size && v.size.h) || 1));
  const candidates = [];
  for (let x = u.x - 1; x <= u.x + w; x++) {
    candidates.push([x, u.y - 1], [x, u.y + h]);
  }
  for (let y = u.y; y < u.y + h; y++) {
    candidates.push([u.x - 1, y], [u.x + w, y]);
  }
  const near = (x, y) => {
    const dx = x < u.x ? u.x - x : (x > u.x + w - 1 ? x - (u.x + w - 1) : 0);
    const dy = y < u.y ? u.y - y : (y > u.y + h - 1 ? y - (u.y + h - 1) : 0);
    return dx + dy <= 1;
  };
  const spot = candidates.find(([x, y]) =>
    x >= 0 && y >= 0 && x < c.width && y < c.height && !taken(x, y)
    && !(c.obstacles && c.obstacles.has(x + ',' + y)) && near(x, y));
  assert.ok(spot, 'нет свободной клетки рядом с мобом');
  c.px = spot[0];
  c.py = spot[1];
}

test('000278-FLB-1: vm-e2e — fled-путь 000271 (враги): все сбежали от страха — баннер «Противники разбежались.» + shape {by:«mobs», ровно 5 полей} + лог + finish (красный)', () => {
  const { G, keydown, body, rafStubs } = loadHarness();
  // Фикстура FR-1/FR-2 дословно: L5; int 11 + str 10 + con 50 +
  // hp 9999; fright 15 → fearChance 0.75; инициатива 12 > волк 3.
  const p = G.createCharacter();
  p.primary.constitution = 50;
  p.hp = 9999;
  p.level = 5;
  p.primary.intelligence = 11;
  p.primary.strength = 10;
  p.secondary.fright = 15;
  assert.equal(G.derived(p).fearChance, 0.75,
    'фикстура: fearChance = min(0.75, 0.05·15) = 0.75');
  const c = G.combatUI.startCombat({
    hero: p, mobs: ['wolf'], mobLevel: 1, seed: 13,
  });
  assert.ok(c, 'бой создан');
  assert.equal(c.phase, 'player',
    'фикстура: игрок первый (инициатива 12 > 3)');
  const w = c.units[0];
  standNextTo(c, w);
  // hp 200: удар (13) не летален — цель ЖИВА после попадания (гейт
  // t.alive); волк L1 aggro neutral — не timid, fled ТОЛЬКО от
  // механизма 000271.
  w.maxHP = 200;
  w.hp = 200;
  // 0.01 < 0.67 (hitChance L5→L1) — попадание; 0.01 < 0.75 —
  // fear-бросок успешен.
  c._rng = () => 0.01;
  const n0 = c.log.length;
  // e2e: KeyJ → handleCode → COMBAT_KEYS → canDoAction → runAction →
  // c.attack (синхронный render в handleCode).
  press(keydown, 'KeyJ');
  assert.equal(w.fled, true, 'волк паникует (механизм 000271)');
  assert.ok(c.result, 'бой кончился: вся группа fled');
  assert.equal(c.result.outcome, 'fled', 'outcome «fled» (примитив)');
  // Кросс-realm: ТОЛЬКО через JSON-рондтрип (объект плоский —
  // строки+целые, потерь нет).
  assert.deepEqual(
    JSON.parse(JSON.stringify(c.result)),
    { outcome: 'fled', by: 'mobs', xp: 0, gold: 0, defeated: 0 },
    'shape: РОВНО 5 полей, by:«mobs» (красный до фикса — поля нет)');
  tick(rafStubs);
  const banner = findByClass(body, 'combat-banner');
  assert.ok(banner, 'фикстура: .combat-banner');
  assert.equal(banner.style.display, 'block', 'баннер результата виден');
  assert.equal(banner.textContent, 'Противники разбежались.',
    'баннер: субъект КОРРЕКТЕН — сбежали ВРАГИ (красный до фикса — '
    + '«Вы ушли из боя.»)');
  assert.ok(c.log.slice(n0).some((s) => s.includes('в панике убегает')),
    'лог: «…в панике убегает!» (примитивы — realm-безопасно)');
  assert.ok(c.log.slice(n0).some((s) => s === 'Противники разбежались.'),
    'лог: «Противники разбежались.» дословно');
  press(keydown, 'Space');
  assert.equal(G.combatUI.isActive(), false, 'Space — finish');
});

test('000278-FLB-2: vm-e2e — playerFlee-путь (000210): кнопка «Побег» → «да» — баннер «Вы ушли из боя.» + shape {by:«player»} (ровно 2 поля, НЕ унифицировано) + finish (красный по shape)', () => {
  const { G, keydown, body, buttons, rafStubs } = loadHarness();
  // scene84-фикстура: дефолтный герой, wolf L1 seed 42.
  const hero = G.createCharacter();
  const c = G.combatUI.startCombat({
    hero, mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  assert.ok(c, 'бой создан');
  assert.equal(c.phase, 'player', 'фикстура: игрок первый');
  const fleeBtn = buttons.find((b) => b.dataset.act === 'flee');
  assert.ok(fleeBtn, 'фикстура: кнопка «Побег» в панели действий');
  fleeBtn.listeners.click[0]();
  const fleeBox = findByClass(body, 'combat-flee-confirm');
  assert.ok(fleeBox, 'фикстура: confirmation-диалог');
  assert.notEqual(fleeBox.style.display, 'none', 'фикстура: диалог открыт');
  // 0.0 < любого шанса (шанс ≤ 0.9) — детерминированный успех
  // (паттерн CU210-YES-OK).
  c._rng = () => 0.0;
  const n0 = c.log.length;
  // «да» → confirmFlee → c.flee() → синхронный render.
  fleeBox.children[1].children[0].listeners.click[0]();
  assert.equal(fleeBox.style.display, 'none', 'диалог закрыт после «да»');
  assert.ok(c.result, 'бой кончился (успешный побег)');
  assert.equal(c.result.outcome, 'fled', 'outcome «fled» (примитив)');
  // Кросс-realm: JSON-рондтрип. shape ДРУГОЙ — 2 поля (playerFlee —
  // не итог боя: без xp/gold/defeated — явное ТЗ, НЕ унифицировать).
  assert.deepEqual(
    JSON.parse(JSON.stringify(c.result)),
    { outcome: 'fled', by: 'player' },
    'shape: РОВНО 2 поля, by:«player» (красный до фикса — поля нет; '
    + 'регрессия «унифицировали» — тоже красный)');
  tick(rafStubs);
  const banner = findByClass(body, 'combat-banner');
  assert.ok(banner, 'фикстура: .combat-banner');
  assert.equal(banner.style.display, 'block', 'баннер результата виден');
  assert.equal(banner.textContent, 'Вы ушли из боя.',
    'баннер: бегство ИГРОКА — зелёный до и после фикса '
    + '(регрессионный пин 000210/000237)');
  assert.ok(c.log.slice(n0).some((s) => s === 'Вы сбежали из боя.'),
    'лог: «Вы сбежали из боя.» (r.fled — успешный побег)');
  press(keydown, 'Space');
  assert.equal(G.combatUI.isActive(), false, 'Space — finish');
});

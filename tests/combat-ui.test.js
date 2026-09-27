// Смоук-тест боевого UI (ревью 000036): ОДНО нажатие клавиши = ровно
// ОДНО действие ядра. Ловит регрессию runAction из src/combat-ui.js,
// где объект-литерал жадно выполнял ВСЕ 8 действий за одно нажатие
// (баг предсуществующий, введён в задаче 000037): одно нажатие Space
// давало «атака + стрела + исцеление + блок + побег + endTurn», и бой
// мог завершиться побегом от одной клавиши.
//
// Браузерный модуль combat-ui.js исполняется в vm-песочнице с
// минимальным DOM-стабом (паттерн tests/index-order.test.js: скрипты
// игры — обычные <script>, каждый собирает globalThis.Game; в песочнице
// `module` нет, UMD-модули идут браузерной веткой).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');

// --- Минимальный DOM-стаб ---

// Canvas 2D: методы — no-op, свойства (fillStyle и т.п.) — записываются.
function makeContext2d() {
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : () => {}),
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
    // render() спрашивает overlay.querySelectorAll('.combat-actions
    // button') — отдаём список кнопок, созданных в этой песочнице
    // (они и есть кнопки панели действий; в стабе их больше нет).
    querySelectorAll() { return buttons; },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
  };
  if (tag === 'canvas') {
    el.width = 0;
    el.height = 0;
    el.getContext = () => makeContext2d();
  }
  return el;
}

// Загрузка цепочки src-скриптов (порядок из index.html) + combat-ui.js
// в vm-песочнице. Возвращает { G, keydown, buttons }: G — Game из
// песочницы, keydown — зарегистрированные keydown-обработчики, buttons
// — кнопки .combat-actions, созданные build().
function loadCombatUi() {
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
    addEventListener: (type, fn) => { if (type === 'keydown') keydown.push(fn); },
  };
  const sandbox = { console, document, window };
  vm.createContext(sandbox);
  for (const f of [
    'global-settings.js', 'perlin.js', 'skills-data.js', 'items-data.js',
    'player.js', 'items.js', 'controls.js', 'combat.js', 'combat-keys.js',
  ]) {
    vm.runInContext(src(f), sandbox, { filename: f });
  }
  vm.runInContext(src('combat-ui.js'), sandbox, { filename: 'combat-ui.js' });
  return { G: sandbox.Game, keydown, buttons };
}

// Нажать клавишу через зарегистрированный keydown-обработчик.
function press(keydown, code) {
  const e = { code, preventDefault() {}, stopPropagation() {} };
  for (const fn of keydown) fn(e);
}

test('боевой UI: кнопки панели действий собраны из таблицы (8 штук)', () => {
  const { G, keydown, buttons } = loadCombatUi();
  assert.ok(G.combatUI, 'Game.combatUI создан (загрузка в правильном порядке)');
  assert.equal(keydown.length, 1, 'keydown-обработчик зарегистрирован');
  // Кнопки создаёт build() при старте боя.
  G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  assert.equal(buttons.length, 8, 'кнопок действий = 8 (таблица combat-keys.js)');
  const acts = buttons.map((b) => b.dataset.act).sort();
  assert.deepEqual(acts, [
    'attack', 'block', 'endTurn', 'fire', 'flee', 'heal', 'invItem', 'quickItem',
  ]);
});

test('боевой UI: одно нажатие «Блок» (KeyB) = одно действие, одна строка лога', () => {
  const { G, keydown } = loadCombatUi();
  const hero = G.createCharacter();
  const c = G.combatUI.startCombat({
    hero, mobs: ['wolf', 'spider'], mobLevel: 1, seed: 42,
  });
  assert.ok(c, 'бой создан');
  assert.equal(c.phase, 'player');

  const n0 = c.log.length;
  press(keydown, 'KeyB');

  const added = Array.from(c.log).slice(n0);
  assert.deepEqual(added, ['Вы ставите блок.'],
    'ровно ОДНО действие — одна строка лога: ' + JSON.stringify(added));
  assert.equal(c.phase, 'player', 'ход игрока не сгорел (endTurn не вызывался)');
  assert.equal(c.round, 1, 'раунд не наступил');
  assert.equal(c.ps.blocked, true, 'блок поставлен');
  assert.equal(c.result, null, 'бой не закончился (побег не выполнялся)');
});

test('боевой UI: одно нажатие Space (endTurn) — одна волна ходов мобов, round +1', () => {
  const { G, keydown } = loadCombatUi();
  const hero = G.createCharacter();
  const c = G.combatUI.startCombat({
    hero, mobs: ['wolf', 'spider'], mobLevel: 1, seed: 42,
  });
  const [m0, m1] = c.units;
  // Мобы вплотную: их ход — атака (строка «промахивается» с _rng 0.99).
  m0.x = c.px; m0.y = c.py - 1;
  m1.x = c.px + 1; m1.y = c.py;
  c._rng = () => 0.99; // все попадания (чьи бы то ни было) — промахи

  const n0 = c.log.length;
  press(keydown, 'Space');

  const added = Array.from(c.log).slice(n0);
  assert.deepEqual(added, ['Волк промахивается.', 'Гигантский паук промахивается.'],
    'одна волна ходов мобов, по одной строке, в порядке units: '
    + JSON.stringify(added));
  assert.equal(c.phase, 'player', 'новый ход игрока');
  assert.equal(c.round, 2, 'ход сгорел ровно ОДИН раз');
  assert.equal(c.result, null, 'побег/смерть от одного нажатия невозможны');
  assert.ok(!added.some((s) => s.startsWith('Вы')),
    'действий игрока в лог-строках фазы мобов нет: ' + JSON.stringify(added));
});

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
// в vm-песочнице. Возвращает { G, keydown, buttons, body }: G — Game из
// песочницы, keydown — зарегистрированные keydown-обработчики, buttons
// — кнопки .combat-actions, созданные build(), body — document.body
// песочницы (к нему подвешен боевой оверлей).
// withSprites (по умолчанию true) — sprites.js ДО combat-ui.js (та же
// пара, что в index.html; регрессия — tests/index-order.test.js,
// задача 000038); map.js нужен для sprites.js при загрузке (TERRAIN).
// false — цепочка без sprites.js: покрывает фолбэк '#6fdc6f' в
// combat-ui.js (sprites.js отсутствует вовсе — деградация, не падение).
function loadCombatUi(withSprites = true) {
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
    'global-settings.js', 'perlin.js', 'map.js',
    'skills-data.js', 'items-data.js',
    'player.js', 'items.js', 'controls.js', 'combat.js', 'combat-keys.js',
  ]) {
    vm.runInContext(src(f), sandbox, { filename: f });
  }
  if (withSprites) {
    vm.runInContext(src('sprites.js'), sandbox, { filename: 'sprites.js' });
  }
  vm.runInContext(src('combat-ui.js'), sandbox, { filename: 'combat-ui.js' });
  return { G: sandbox.Game, keydown, buttons, body: document.body };
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

test('боевой UI: цвет полосы HP при frac < 0.2 — красный из hpBarColor (регрессия 000038)', () => {
  // Цепочка в порядке index.html: sprites.js ДО combat-ui.js.
  // Старый порядок (sprites.js ПОСЛЕ combat-ui.js) был мёртвым путём:
  // каждый UMD-модуль ЗАМЕНЯЕТ объект Game (Object.assign({}, Game, …)),
  // а combat-ui.js снимает его один раз при загрузке
  // (const G = globalThis.Game) — G.hpBarColor оставался undefined
  // НАВСЕГДА, и полоса героя (DOM и canvas-миниполоса) всегда рисовалась
  // фолбэком '#6fdc6f': пороговые цвета (жёлтый 20–50%, красный <20%)
  // не срабатывали никогда.
  const { G, keydown, body } = loadCombatUi();
  assert.equal(typeof G.hpBarColor, 'function',
    'в порядке index.html Game.hpBarColor есть до загрузки combat-ui.js');
  const hero = G.createCharacter();
  G.combatUI.startCombat({
    hero, mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  const maxHP = G.derived(hero).maxHP;
  assert.ok(maxHP >= 25, 'maxHP >= 25 (player.js: 20 + конст.·5)');
  hero.hp = 1; // frac = 1/25 = 0.04 < 0.2 → красный
  press(keydown, 'KeyQ'); // любое действие — чтобы render() отрисовал полосу
  const fill = findByClass(body, 'combat-hpbar-fill');
  assert.ok(fill, 'DOM-полоса .combat-hpbar-fill создана');
  const frac = 1 / maxHP;
  assert.ok(frac < 0.2, 'сценарий: доля HP ниже порога красного');
  assert.equal(fill.style.background, G.hpBarColor(frac),
    'цвет — из Game.hpBarColor, а не фолбэк: ' + fill.style.background);
  assert.equal(fill.style.background, '#d9483b', 'frac < 0.2 → красный');
  assert.equal(fill.style.width, (frac * 100).toFixed(1) + '%',
    'ширина заполнения = доля HP');
});

test('боевой UI: без sprites.js — фолбэк #6fdc6f, рендер не падает', () => {
  // Деградация, а не поломка: если sprites.js отсутствует вовсе
  // (не тот случай, что он загружен позже — порядок закреплён
  // tests/index-order.test.js), полоса героя остаётся зелёной
  // (цвет полосы мобов), остальные части рендера не затрагиваются.
  const { G, keydown, body } = loadCombatUi(false);
  assert.equal(G.hpBarColor, undefined, 'в цепочке нет sprites.js');
  const hero = G.createCharacter();
  G.combatUI.startCombat({
    hero, mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  hero.hp = 1;
  press(keydown, 'KeyQ');
  const fill = findByClass(body, 'combat-hpbar-fill');
  assert.ok(fill, 'DOM-полоса создана');
  assert.equal(fill.style.background, '#6fdc6f', 'фолбэк — зелёный полосы мобов');
  assert.ok(body, 'оверлей на месте, render() не упал');
});

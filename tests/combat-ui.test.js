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

// Canvas 2D: методы — no-op, свойства (fillStyle и т.п.) —
// записываются. Каждый ВЫЗОВ метода записывается в el.drawCalls как
// [имя, args] — тесты фона (задача 000049) проверяют порядок слоёв
// (фон — первым, после базового fillRect, до сетки).
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
    // render() спрашивает overlay.querySelectorAll('.combat-actions
    // button') — отдаём список кнопок, созданных в этой песочнице
    // (они и есть кнопки панели действий; в стабе их больше нет).
    querySelectorAll() { return buttons; },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
  };
  if (tag === 'canvas') {
    el.width = 0;
    el.height = 0;
    el.getContext = () => makeContext2d(el);
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
function loadCombatUi(withSprites = true, opts = {}) {
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
  // Задача 000047: опциональное внедрение в песочницу (по умолчанию
  // ОТСУТСТВУЕТ — поведение существующих тестов не меняется):
  //  * performance = { now: () => T } — фиксированное время (nowMs()
  //    берёт performance.now() в браузере; детерминизм выбора кадров:
  //    now — аргумент чистого G.frameIndex);
  //  * requestAnimationFrame/cancelAnimationFrame — стабы с записью
  //    scheduled/cancelled (тесты rAF-цикла).
  if (opts.performance) sandbox.performance = opts.performance;
  if (opts.requestAnimationFrame) sandbox.requestAnimationFrame = opts.requestAnimationFrame;
  if (opts.cancelAnimationFrame) sandbox.cancelAnimationFrame = opts.cancelAnimationFrame;
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

// Canvas боевой мини-карты (создаётся build() при старте боя).
function findCanvas(el) {
  if (el.tagName === 'canvas') return el;
  for (const ch of el.children || []) {
    const found = findCanvas(ch);
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

// --- Фон поля боя (задача 000049) ---
//
// ctx.bgPath — из Game.combatBackground (sprites.js ДО combat-ui.js,
// порядок закреплён tests/index-order.test.js); картинка — из
// spriteLoader, переданного в startCombat, — КАЖДЫЙ render (фон,
// загрузившийся после старта, подхватывается без рестарта). Стаб
// canvas-2d записывает вызовы методов в canvas.drawCalls — по
// порядковому номеру проверяем слои: фон — ПЕРВЫМ, сразу после
// базового fillRect, до сетки (stroke).

test('боевой UI: фон (terrain: grass) — первый слой, до сетки', () => {
  const { G, body } = loadCombatUi();
  assert.equal(typeof G.combatBackground, 'function',
    'в порядке index.html Game.combatBackground есть до combat-ui.js');
  const fakeImg = { __fake: 'grass' };
  const hero = G.createCharacter();
  G.combatUI.startCombat({
    hero, mobs: ['wolf'], mobLevel: 1, seed: 42,
    terrain: G.TERRAIN.GRASS,
    spriteLoader: {
      image: (p) => (p === 'assets/combat/bg/grass.svg' ? fakeImg : null),
    },
  });
  const canvas = findCanvas(body);
  assert.ok(canvas, 'canvas боевой мини-карты создан');
  const calls = canvas.drawCalls;
  // Первый вызов — базовый fillRect (#0d1117), второй — drawImage
  // фона; дальше сетка (stroke) и юниты.
  assert.equal(calls[0][0], 'fillRect', 'базовая заливка — первый вызов');
  assert.equal(calls[1][0], 'drawImage', 'фон — первым слоем, сразу после базы');
  const [diName, diArgs] = calls[1];
  assert.equal(diName, 'drawImage');
  assert.equal(diArgs[0], fakeImg, 'рисуется картинка из spriteLoader');
  assert.equal(diArgs[1], 0);
  assert.equal(diArgs[2], 0);
  assert.equal(diArgs[3], canvas.width, 'фон на весь canvas');
  assert.equal(diArgs[4], canvas.height, 'фон на весь canvas');
  // drawImage есть ровно один (один фон на render).
  assert.equal(calls.filter((c) => c[0] === 'drawImage').length, 1);
  // Сетка нарисована ПОСЛЕ фона.
  const firstStroke = calls.findIndex((c) => c[0] === 'stroke');
  assert.ok(firstStroke > 1, 'сетка (stroke) — после фона');
});

test('боевой UI: фон (dungeonType: 4 — abyss) → abyss.svg', () => {
  const { G, body } = loadCombatUi();
  const fakeImg = { __fake: 'abyss' };
  const hero = G.createCharacter();
  G.combatUI.startCombat({
    hero, mobs: ['lower_demon'], mobLevel: 8, seed: 42,
    dungeonType: 4, // DUNGEON_TYPES.ABYSS
    spriteLoader: {
      image: (p) => (p === 'assets/combat/bg/abyss.svg' ? fakeImg : null),
    },
  });
  const calls = findCanvas(body).drawCalls;
  const di = calls.find((c) => c[0] === 'drawImage');
  assert.ok(di, 'фон подземелья отрисован');
  assert.equal(di[1][0], fakeImg);
});

test('боевой UI: фон, загрузившийся ПОСЛЕ старта, — подхвачен без рестарта', () => {
  const { G, keydown, body } = loadCombatUi();
  const fakeImg = { __fake: 'sand' };
  let ready = false;
  const hero = G.createCharacter();
  G.combatUI.startCombat({
    hero, mobs: ['wolf'], mobLevel: 1, seed: 42,
    terrain: G.TERRAIN.SAND,
    spriteLoader: {
      image: (p) => (ready && p === 'assets/combat/bg/sand.svg' ? fakeImg : null),
    },
  });
  const canvas = findCanvas(body);
  assert.ok(!canvas.drawCalls.some((c) => c[0] === 'drawImage'),
    'фон ещё не загружен — render без drawImage (сплошной фолбэк)');
  ready = true; // «загрузилось» во время боя
  press(keydown, 'KeyB'); // любое действие → render()
  const di = canvas.drawCalls.find((c) => c[0] === 'drawImage');
  assert.ok(di, 'загруженный во время боя фон подхвачен без рестарта');
  assert.equal(di[1][0], fakeImg);
});

test('боевой UI: без sprites.js — terrain не ломает бой, drawImage не вызывается', () => {
  // sprites.js отсутствует вовсе → G.combatBackground undefined →
  // bgPath = null → drawImage невозможен (сплошной фон). terrain
  // в opts при этом просто игнорируется (деградация, не падение).
  const { G, body } = loadCombatUi(false);
  assert.equal(G.combatBackground, undefined, 'в цепочке нет sprites.js');
  const hero = G.createCharacter();
  const c = G.combatUI.startCombat({
    hero, mobs: ['wolf'], mobLevel: 1, seed: 42,
    terrain: G.TERRAIN.GRASS,
  });
  assert.ok(c, 'бой создан, рендер не упал');
  const calls = findCanvas(body).drawCalls;
  assert.ok(calls.length > 0, 'render() отрисовал слои');
  assert.ok(!calls.some((c2) => c2[0] === 'drawImage'),
    'drawImage не вызывается — сплошной фон');
});

test('боевой UI: spriteLoader = null (main.js без s2) — фон не рисуется, бой жив', () => {
  const { G, body } = loadCombatUi();
  const hero = G.createCharacter();
  const c = G.combatUI.startCombat({
    hero, mobs: ['wolf'], mobLevel: 1, seed: 42,
    terrain: G.TERRAIN.SAND,
    spriteLoader: null,
  });
  assert.ok(c, 'бой создан');
  const calls = findCanvas(body).drawCalls;
  assert.ok(!calls.some((c2) => c2[0] === 'drawImage'),
    'null-лоадер — null-guard, drawImage не вызывается');
});

// --- Анимированные спрайты (задача 000047) ---
//
// Спрайты — на боевом canvas поверх фона (000049) и сетки; выбор
// кадра — чистая G.frameIndex(now, x, y, n) (now — аргументом;
// фиксированный performance.now в песочнице → детерминизм).
// loadCombatUi(withSprites, opts) — opts внедряет performance и
// стабы rAF/cAF в песочницу (см. loadCombatUi).

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

test('боевой UI: в песочнице без rAF/performance — startCombat не падает (typeof-гарды)', () => {
  const { G, body } = loadCombatUi();
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  assert.ok(c, 'бой создан');
  assert.ok(findCanvas(body), 'оверлей на месте, render() не упал');
});

test('боевой UI: спрайт героя — drawImage по центру клетки, размер CELL*1.15, кадр детерминирован', () => {
  const NOW = 1000;
  const { G, keydown, body } = loadCombatUi(true, { performance: { now: () => NOW } });
  const fake = { __fake: 'hero' };
  const requested = [];
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
    spriteLoader: {
      image: (p) => {
        requested.push(p);
        return p.startsWith('assets/sprites/phlogiston/idle_') ? fake : null;
      },
    },
  });
  const di = findCanvas(body).drawCalls
    .find((x) => x[0] === 'drawImage' && x[1][0] === fake);
  assert.ok(di, 'спрайт героя нарисован (drawImage)');
  const size = 48 * 1.15;
  const cx = (c.px + 0.5) * 48, cy = (c.py + 0.5) * 48;
  assert.equal(di[1][1], cx - size / 2, 'x — по центру клетки (px,py)');
  assert.equal(di[1][2], cy - size / 2, 'y — по центру клетки');
  assert.equal(di[1][3], size, 'ширина ≈ CELL×1.15');
  assert.equal(di[1][4], size, 'высота ≈ CELL×1.15');
  // Кадр детерминирован: тот же now → тот же кадр
  // idle_<idx+1>.svg, idx = frameIndex(NOW, px, py, 2).
  const idx = G.frameIndex(NOW, c.px, c.py, 2);
  const frame = G.phlogistonFrames('idle')[idx];
  assert.ok(requested.includes(frame), 'запрошен кадр: ' + frame
    + ' | ' + JSON.stringify(requested));
  // Второй render при том же (фиксированном) now — тот же кадр.
  press(keydown, 'KeyB'); // любое допустимое действие → render
  assert.equal(requested[requested.length - 1], frame,
    'тот же now → тот же кадр (детерминизм); герой рисуется последним');
});

test('боевой UI: без лоадера — фолбэк (ромб/прямоугольник), drawImage юнитов нет', () => {
  const { G, body } = loadCombatUi();
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  assert.ok(c, 'бой создан');
  const calls = findCanvas(body).drawCalls;
  assert.ok(!calls.some((x) => x[0] === 'drawImage'),
    'drawImage юнитов нет (нет лоадера)');
  assert.ok(calls.some((x) => x[0] === 'beginPath'),
    'ромб героя нарисован (beginPath/fill)');
  assert.ok(calls.some((x) => x[0] === 'fillRect'),
    'прямоугольник моба нарисован (fillRect)');
});

test('боевой UI: спрайт моба — весь прямоугольник с запасом 8px (1×1 и 3×3)', () => {
  const { G, body } = loadCombatUi(true, { performance: { now: () => 1000 } });
  const fakeWolf = { __fake: 'wolf' }, fakeSkel = { __fake: 'skeleton' };
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf', 'bone_coloss'], mobLevel: 1, seed: 42,
    spriteLoader: {
      image: (p) => {
        if (p.startsWith('assets/sprites/mobs/wolf_')) return fakeWolf;
        if (p.startsWith('assets/sprites/mobs/skeleton_')) return fakeSkel;
        return null;
      },
    },
  });
  const wolf = c.units.find((u) => u.mobId === 'wolf');
  const coloss = c.units.find((u) => u.mobId === 'bone_coloss');
  assert.ok(wolf && coloss, 'оба моба в бою');
  const calls = findCanvas(body).drawCalls;
  const dw = calls.find((x) => x[0] === 'drawImage' && x[1][0] === fakeWolf);
  assert.ok(dw, 'спрайт волка нарисован');
  assert.equal(dw[1][1], wolf.x * 48 + 8, 'x = якорь + запас 8px');
  assert.equal(dw[1][2], wolf.y * 48 + 8, 'y = якорь + запас 8px');
  assert.equal(dw[1][3], 48 - 16, '1×1: ширина 32px');
  assert.equal(dw[1][4], 48 - 16, '1×1: высота 32px');
  const db = calls.find((x) => x[0] === 'drawImage' && x[1][0] === fakeSkel);
  assert.ok(db, 'спрайт костяного колосса (3×3) нарисован');
  assert.equal(db[1][1], coloss.x * 48 + 8);
  assert.equal(db[1][2], coloss.y * 48 + 8);
  assert.equal(db[1][3], 3 * 48 - 16, '3×3: ширина 128px');
  assert.equal(db[1][4], 3 * 48 - 16, '3×3: высота 128px');
});

test('боевой UI: спрайт не загружен (image() → null) — фолбэк по юниту, drawImage нет', () => {
  const { G, body } = loadCombatUi();
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
    spriteLoader: { image: () => null }, // лоадер есть, ассеты не готовы
  });
  assert.ok(c, 'бой создан');
  const calls = findCanvas(body).drawCalls;
  assert.ok(!calls.some((x) => x[0] === 'drawImage'), 'drawImage не вызывается');
  assert.ok(calls.some((x) => x[0] === 'fillRect'), 'фолбэк-прямоугольник на месте');
});

test('боевой UI: c._fx — attack после успешной атаки; после until — idle (детерминированный now)', () => {
  const NOW = 1000;
  const { G, keydown, body } = loadCombatUi(true, { performance: { now: () => NOW } });
  const fakeAtk = { __fake: 'atk' }, fakeIdle = { __fake: 'idle' };
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
    spriteLoader: {
      image: (p) => {
        if (p.startsWith('assets/sprites/phlogiston/attack_')) return fakeAtk;
        if (p.startsWith('assets/sprites/phlogiston/idle_')) return fakeIdle;
        return null;
      },
    },
  });
  const m0 = c.units[0];
  m0.x = c.px; m0.y = c.py - 1; // в упор
  c._rng = () => 0.99; // все попадания — промахи: { ok:true, hit:false }
  c.selectTarget(m0.id);
  assert.equal(c._fx, undefined, 'c._fx не записано до действия');
  press(keydown, 'KeyJ');
  assert.equal(c._fx && c._fx.action, 'attack', 'c._fx.action = attack');
  assert.ok(c._fx.until > NOW, 'until > now (≈300 мс)');
  const canvas = findCanvas(body);
  const calls = canvas.drawCalls;
  assert.ok(calls.some((x) => x[0] === 'drawImage' && x[1][0] === fakeAtk),
    'кадр атаки нарисован');
  // Экспирация без sleep: вручную until в прошлое → следующий
  // render рисует idle.
  c._fx.until = NOW - 1;
  const n1 = calls.length;
  press(keydown, 'KeyB'); // блок (допустим) → render
  const after = calls.slice(n1);
  assert.ok(after.some((x) => x[0] === 'drawImage' && x[1][0] === fakeIdle),
    'после истечения — кадр idle');
  assert.ok(!after.some((x) => x[0] === 'drawImage' && x[1][0] === fakeAtk),
    'кадр атаки не рисуется после истечения');
});

test('боевой UI: c._fx — cast после успешного заклинания (fire)', () => {
  const NOW = 1000;
  const { G, keydown } = loadCombatUi(true, { performance: { now: () => NOW } });
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  const m0 = c.units[0];
  m0.x = c.px; m0.y = c.py - 1;
  c._rng = () => 0.99;
  c.selectTarget(m0.id);
  assert.equal(c._fx, undefined, 'c._fx не записано до заклинания');
  press(keydown, 'KeyQ'); // огненная стрела — всегда попадает
  assert.equal(c._fx && c._fx.action, 'cast', 'c._fx.action = cast');
  assert.ok(c._fx.until > NOW, 'until > now');
});

test('боевой UI: c._fx не пишется при отклонённом действии', () => {
  const NOW = 1000;
  const { G, keydown } = loadCombatUi(true, { performance: { now: () => NOW } });
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  press(keydown, 'KeyB'); // блок
  assert.equal(c.ps.blocked, true, 'блок поставлен');
  const n0 = c.log.length;
  press(keydown, 'KeyJ'); // атака под блоком — отклонена
  const added = Array.from(c.log).slice(n0);
  assert.ok(added.some((s) => s.includes('блок')),
    'причина отклонения в журнале: ' + JSON.stringify(added));
  assert.equal(c._fx, undefined, 'отклонённое действие — без анимации');
});

test('боевой UI: y-сортировка — меньший bottomY рисуется раньше (глубина)', () => {
  const NOW = 1000;
  const { G, keydown, body } = loadCombatUi(true, { performance: { now: () => NOW } });
  const fakeWolf = { __fake: 'wolf' }, fakeSkel = { __fake: 'skeleton' };
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf', 'bone_coloss'], mobLevel: 1, seed: 42,
    spriteLoader: {
      image: (p) => {
        if (p.startsWith('assets/sprites/mobs/wolf_')) return fakeWolf;
        if (p.startsWith('assets/sprites/mobs/skeleton_')) return fakeSkel;
        return null;
      },
    },
  });
  const wolf = c.units.find((u) => u.mobId === 'wolf');
  const coloss = c.units.find((u) => u.mobId === 'bone_coloss');
  // Явная геометрия: колосс 3×3 у (0,0) → bottomY = 0+3 = 3;
  // волк 1×1 у (1,3) → bottomY = 3+1 = 4; герой (3,6) → bottomY = 7.
  coloss.x = 0; coloss.y = 0;
  wolf.x = 1; wolf.y = 3;
  const canvas = findCanvas(body);
  const n0 = canvas.drawCalls.length; // первый render (спавн) не учитываем
  press(keydown, 'KeyB'); // любое допустимое действие → render
  const calls = canvas.drawCalls.slice(n0);
  const iColoss = calls.findIndex((x) => x[0] === 'drawImage' && x[1][0] === fakeSkel);
  const iWolf = calls.findIndex((x) => x[0] === 'drawImage' && x[1][0] === fakeWolf);
  assert.ok(iColoss >= 0, 'колосс нарисован');
  assert.ok(iWolf >= 0, 'волк нарисован');
  assert.ok(iColoss < iWolf,
    `bottomY 3 (колосс) рисуется раньше bottomY 4 (волк): ${iColoss} vs ${iWolf}`);
});

test('боевой UI: rAF-цикл — старт в startCombat, tick рендерит, стоп в finish()', () => {
  const rafStubs = makeRafStubs();
  const { G, keydown, body } = loadCombatUi(true, {
    performance: { now: () => 1000 },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  assert.ok(c, 'бой создан');
  assert.equal(rafStubs.scheduled.length, 1,
    'после startCombat отложен ровно один tick');
  const canvas = findCanvas(body);
  // Цикл жив: tick → render → следующий tick.
  const n0 = canvas.drawCalls.length;
  rafStubs.scheduled[0]();
  assert.ok(canvas.drawCalls.length > n0, 'tick вызвал render()');
  assert.equal(rafStubs.scheduled.length, 2, 'отложен следующий tick');
  assert.equal(G.combatUI.isActive(), true, 'оверлей открыт');
  // Конец боя: cancel с активным id, новых schedule нет.
  c.result = { outcome: 'victory' };
  press(keydown, 'Escape');
  assert.equal(G.combatUI.isActive(), false, 'оверлей закрыт');
  assert.equal(rafStubs.cancelled.length, 1, 'cancelAnimationFrame вызван один раз');
  assert.equal(rafStubs.cancelled[0], 2, 'отменён активный id (вторая очередь)');
  assert.equal(rafStubs.scheduled.length, 2, 'после finish новых ticks нет');
  // «Потерянный» tick после finish: isActive false → рендера нет,
  // rafId сбрасывается сам, повторного schedule нет.
  const n1 = canvas.drawCalls.length;
  rafStubs.scheduled[1]();
  assert.equal(canvas.drawCalls.length, n1, 'tick после finish не рендерит');
  assert.equal(rafStubs.scheduled.length, 2, 'нет повторного schedule');
});

test('боевой UI: миниполоса HP героя у краёв поля — внутри canvas (регрессия: верхний ряд)', () => {
  // Ревью 000047: в спрайтовой ветке якорь полосы — «8px над верхом
  // спрайта» (by = hy - size/2 - 8, size = CELL*1.15 = 55.2). У краёв
  // поля якорь уходит за край canvas: c.py = 0 → by = -12, fillRect
  // (…, -12, 55, 4) ЦЕЛИКОМ выше canvas — 4px-полоса HP героя
  // невидима (регрессия 000038: в фолбэке-ромбе там же by = 2 —
  // видима); боковые края (px = 0/6) срезали левый/правый край
  // полосы на 3–4px. Фикс — кламп полосы в canvas (запас 2px); на
  // внутренних клетках кламп не срабатывает (позиция зафиксирована
  // в конце теста).
  const rafStubs = makeRafStubs();
  const { G, body } = loadCombatUi(true, {
    performance: { now: () => 1000 },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  const fake = { __fake: 'hero' };
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
    spriteLoader: {
      image: (p) => (p.startsWith('assets/sprites/phlogiston/idle_') ? fake : null),
    },
  });
  const canvas = findCanvas(body);
  const W = canvas.width, H = canvas.height; // 7×48 = 336×336
  const BW = Math.round(48 * 1.15); // 55 — ширина полосы = ширина спрайта
  // Миниполоса героя — ЕДИНСТВЕННЫЕ fillRect BW×4 в render (у мобов
  // полоса pw-16 = 32/96/128 × 4, база — 336×336, моб-прямоугольник
  // 32×32): по сигнатуре её ищем. Рендер на каждый tick rAF-цикла.
  const heroBars = (calls) => calls.filter(
    (x) => x[0] === 'fillRect' && x[1][2] === BW && x[1][3] === 4);
  const tickRender = () => {
    const n0 = canvas.drawCalls.length;
    rafStubs.scheduled[rafStubs.scheduled.length - 1](); // tick → render
    return canvas.drawCalls.slice(n0);
  };
  // Все углы + центр верхнего ряда (регрессия) + центр нижнего ряда
  // (стандартный спавн).
  for (const [px, py] of [[0, 0], [3, 0], [6, 0], [0, 6], [3, 6], [6, 6]]) {
    c.px = px; c.py = py;
    const bars = heroBars(tickRender());
    assert.equal(bars.length, 2,
      `(${px},${py}): миниполоса нарисована (база + заполнение)`);
    for (const [, args] of bars) {
      assert.ok(args[0] >= 0 && args[1] >= 0
        && args[0] + BW <= W && args[1] + 4 <= H,
        `(${px},${py}): миниполоса внутри canvas: `
        + `(${args[0]}, ${args[1]}, ${BW}, 4), canvas ${W}×${H}`);
    }
  }
  // Внутренняя клетка — кламп НЕ срабатывает: позиция как была
  // (x = round(hx - bw/2) = 141, y = round(hy - size/2 - 8) = 132).
  c.px = 3; c.py = 3;
  const bars = heroBars(tickRender());
  assert.deepEqual(
    bars.map(([, a]) => [a[0], a[1]]),
    [[141, 132], [141, 132]],
    'внутренняя клетка: позиция полосы без изменений');
});

// --- Персональный арт мобов (задача 000062) ---
//
// drawUnits: живой моб — move/attack-кадры (attack — пока FX атаки не
// истёк, пишет unitFxAfterMobPhase после endTurn), мёртвый — одиночный
// dead-кадр без HP-полосы/уровня/цели. Фолбэк-цепочка: персональный
// арт → базовые 6 видов → прямоугольник; у мёртвого без арта — ничего.

test('боевой UI: мёртвый моб — dead-кадр, без HP-полосы/уровня/цели', () => {
  const NOW = 1000;
  const { G, keydown, body } = loadCombatUi(true, { performance: { now: () => NOW } });
  const fakeDead = { __fake: 'dead' }, fakeMove = { __fake: 'move' };
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf', 'spider'], mobLevel: 1, seed: 42,
    spriteLoader: {
      image: (p) => {
        if (p.endsWith('_dead_1.svg')) return fakeDead;
        if (/(wolf|spider)_(move|attack)_[12]\.svg$/.test(p)) return fakeMove;
        return null;
      },
    },
  });
  const wolf = c.units.find((u) => u.mobId === 'wolf');
  const spider = c.units.find((u) => u.mobId === 'spider');
  wolf.x = 1; wolf.y = 1;
  spider.x = 4; spider.y = 2;
  // «Убит» в фазе игрока — UI реагирует только на u.alive.
  wolf.alive = false; wolf.hp = 0;
  c.targetId = wolf.id; // цель — труп: подсветки быть НЕ должно
  const canvas = findCanvas(body);
  const n0 = canvas.drawCalls.length;
  press(keydown, 'KeyB'); // любое допустимое действие → render
  const calls = canvas.drawCalls.slice(n0);
  // Труп — dead-кадр; живой паук — move-кадр.
  assert.ok(calls.some((x) => x[0] === 'drawImage' && x[1][0] === fakeDead),
    'труп нарисован dead-кадром');
  assert.equal(calls.filter((x) => x[0] === 'drawImage' && x[1][0] === fakeMove).length,
    1, 'живой паук — один move-кадр (у трупа move-цикл не крутится)');
  const [dx, dy] = [wolf.x * 48 + 8, wolf.y * 48 + 8];
  const diDead = calls.find((x) => x[0] === 'drawImage' && x[1][0] === fakeDead);
  assert.equal(diDead[1][1], dx, 'dead-кадр на месте трупа (x)');
  assert.equal(diDead[1][2], dy, 'dead-кадр на месте трупа (y)');
  // У трупа нет: HP-полосы (fillRect …, py+2, 32, 4), уровня
  // (fillText в центре), подсветки цели (strokeRect).
  assert.ok(!calls.some((x) => x[0] === 'fillRect'
    && x[1][0] === wolf.x * 48 + 8 && x[1][1] === wolf.y * 48 + 2 && x[1][3] === 4),
    'у трупа нет HP-полосы');
  assert.ok(!calls.some((x) => x[0] === 'fillText'
    && x[1][1] === wolf.x * 48 + 24 && x[1][2] === wolf.y * 48 + 28),
    'у трупа нет уровня');
  assert.ok(!calls.some((x) => x[0] === 'strokeRect'
    && x[1][0] === wolf.x * 48 + 4.5 && x[1][1] === wolf.y * 48 + 4.5),
    'труп не подсвечивается как цель');
});

test('боевой UI: без sprites.js — труп не рисуется, живой — прямоугольник', () => {
  const NOW = 1000;
  const { G, keydown, body } = loadCombatUi(false, { performance: { now: () => NOW } });
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf', 'spider'], mobLevel: 1, seed: 42,
  });
  const wolf = c.units.find((u) => u.mobId === 'wolf');
  const spider = c.units.find((u) => u.mobId === 'spider');
  wolf.x = 1; wolf.y = 1;
  spider.x = 4; spider.y = 2;
  wolf.alive = false; wolf.hp = 0;
  const canvas = findCanvas(body);
  const n0 = canvas.drawCalls.length;
  press(keydown, 'KeyB');
  const calls = canvas.drawCalls.slice(n0);
  assert.ok(!calls.some((x) => x[0] === 'drawImage'),
    'без sprites.js drawImage нет (труп — «ничего»)');
  assert.ok(calls.some((x) => x[0] === 'fillRect'
    && x[1][0] === spider.x * 48 + 8 && x[1][1] === spider.y * 48 + 8
    && x[1][2] === 32 && x[1][3] === 32),
    'живой паук — фолбэк-прямоугольник');
  assert.ok(!calls.some((x) => x[0] === 'fillRect'
    && x[1][0] === wolf.x * 48 + 8 && x[1][1] === wolf.y * 48 + 8
    && x[1][2] === 32 && x[1][3] === 32),
    'труп без арта — ни прямоугольника, ни чего-либо ещё');
});

test('боевой UI: endTurn — _unitFx: сдвинулся = move, атаковал (игрок ранен) = attack', () => {
  const NOW = 1000;
  const { G, keydown, body } = loadCombatUi(true, { performance: { now: () => NOW } });
  const fakeAtk = { __fake: 'atk' }, fakeMove = { __fake: 'move' };
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf', 'orc_archer'], mobLevel: 1, seed: 42,
    spriteLoader: {
      image: (p) => {
        if (p.includes('_attack_')) return fakeAtk;
        if (p.includes('_move_')) return fakeMove;
        return null;
      },
    },
  });
  const wolf = c.units.find((u) => u.mobId === 'wolf');
  const archer = c.units.find((u) => u.mobId === 'orc_archer');
  // Волк в двух клетках → доходит до d=1 (moved → 'move').
  // Лучник в трёх → дальний бой (2..4) — бьёт, не двигаясь.
  wolf.x = c.px + 2; wolf.y = c.py;
  archer.x = c.px + 3; archer.y = c.py;
  // Задача 000050: сценарий проверяет FX-эвристику (move/attack-кадры
  // по позиции/урону), а не навигацию — жадный stepToward волка не
  // обходит камень на его пути (deadlock сценария, не карты; закреплено
  // в анализе 000050) — препятствия сняты.
  c.obstacles.clear();
  c._rng = () => 0.01; // все атаки мобов попадают: HP игрока падает
  const hpBefore = c.player.hp;
  press(keydown, 'Space');
  assert.ok(c.player.hp < hpBefore, 'игрок получил урон (эвристика attack-FX)');
  assert.equal(c._unitFx[wolf.id] && c._unitFx[wolf.id].action, 'move',
    'сдвинувшийся волк — move-FX');
  assert.equal(c._unitFx[archer.id] && c._unitFx[archer.id].action, 'attack',
    'атаковавший лучник — attack-FX');
  assert.ok(c._unitFx[wolf.id].until > NOW, 'until > now (~300 мс)');
  // Рендер в окне FX: лучник — attack-кадр, волк — move-кадр.
  const canvas = findCanvas(body);
  const n0 = canvas.drawCalls.length;
  press(keydown, 'KeyB'); // → render
  const calls = canvas.drawCalls.slice(n0);
  assert.ok(calls.some((x) => x[0] === 'drawImage' && x[1][0] === fakeAtk),
    'лучник нарисован attack-кадром');
  assert.ok(calls.some((x) => x[0] === 'drawImage' && x[1][0] === fakeMove),
    'волк нарисован move-кадром');
  // Истечение (вручную, как в тесте c._fx): следующий render — move.
  c._unitFx[archer.id].until = NOW - 1;
  const n1 = canvas.drawCalls.length;
  press(keydown, 'KeyB');
  const after = canvas.drawCalls.slice(n1);
  assert.ok(!after.some((x) => x[0] === 'drawImage' && x[1][0] === fakeAtk),
    'после истечения attack-кадр не рисуется');
  // Атаки, не задевшие игрока (промах), — без attack-FX: моб в упор
  // стоит (не двигался), игрок не ранен → ни move, ни attack.
  c._unitFx = {};
  const hp2 = c.player.hp;
  c._rng = () => 0.99; // все атаки — промахи
  press(keydown, 'Space');
  assert.equal(c.player.hp, hp2, 'промахи: HP не упало');
  assert.ok(!c._unitFx[archer.id],
    'промах в упор — без attack-FX (удар не нанесён)');
});

// --- Слой препятствий (задача 000050) ---
//
// z-порядок: фон → сетка (stroke) → препятствия → юниты → эффекты.
// Сетка — единственные g2.stroke() в render (подсветка цели —
// strokeRect), поэтому «последний stroke сетки» — последний 'stroke'.
// Картинка — из spriteLoader КАЖДЫЙ render (паттерн фона 000049);
// без лоадера/ассетов — фолбэк-квадрат fillRect(CELL-6) (42×42).
// Спрайт — G.obstacleSprite(x, y) (sprites.js ДО combat-ui.js —
// порядок закреплён tests/index-order.test.js; UMD «G снимается
// один раз» — guard как у hpBarColor).

test('боевой UI: препятствия — слой ПОСЛЕ сетки и ПЕРЕД юнитами (000050)', () => {
  const { G, body } = loadCombatUi();
  assert.equal(typeof G.obstacleSprite, 'function',
    'в порядке index.html Game.obstacleSprite есть до combat-ui.js');
  const fakeObs = { __fake: 'obs' }, fakeWolf = { __fake: 'wolf' };
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
    spriteLoader: {
      image: (p) => {
        if (p.startsWith('assets/combat/obstacles/')) return fakeObs;
        if (p.startsWith('assets/sprites/mobs/wolf_')) return fakeWolf;
        return null;
      },
    },
  });
  assert.ok(c.obstacles.size > 0, 'в бою есть препятствия');
  const calls = findCanvas(body).drawCalls;
  const strokes = calls.map((x, i) => (x[0] === 'stroke' ? i : -1))
    .filter((i) => i >= 0);
  assert.ok(strokes.length > 0, 'сетка нарисована (stroke)');
  const lastGridStroke = strokes[strokes.length - 1];
  const obsDraws = calls
    .map((x, i) => (x[0] === 'drawImage' && x[1][0] === fakeObs ? i : -1))
    .filter((i) => i >= 0);
  assert.equal(obsDraws.length, c.obstacles.size,
    'по одному drawImage на препятствие');
  const iObs = obsDraws[0];
  const iWolf = calls.findIndex((x) => x[0] === 'drawImage' && x[1][0] === fakeWolf);
  assert.ok(iWolf >= 0, 'спрайт волка нарисован');
  assert.ok(iObs > lastGridStroke,
    `препятствия ПОСЛЕ последнего stroke сетки (${iObs} > ${lastGridStroke})`);
  assert.ok(iObs < iWolf, `препятствия ПЕРЕД спрайтом юнита (${iObs} < ${iWolf})`);
  // Позиция — на всю клетку: (x*CELL, y*CELL, CELL, CELL).
  const firstObs = calls[iObs];
  const k = c.obstacles.values().next().value; // Set: порядок вставки
  const [ox, oy] = k.split(',').map(Number);
  assert.equal(firstObs[1][1], ox * 48);
  assert.equal(firstObs[1][2], oy * 48);
  assert.equal(firstObs[1][3], 48);
  assert.equal(firstObs[1][4], 48);
});

test('боевой UI: без лоадера — препятствия тёмным квадратом, drawImage нет (000050)', () => {
  const { G, body } = loadCombatUi();
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  assert.ok(c.obstacles.size > 0, 'в бою есть препятствия');
  const calls = findCanvas(body).drawCalls;
  assert.ok(!calls.some((x) => x[0] === 'drawImage'),
    'нет лоадера — drawImage не вызывается (ни фон, ни юниты, ни препятствия)');
  // Фолбэк-квадрат: fillRect(CELL-6) = 42×42 — сигнатура отлична от
  // моб-прямоугольника 32×32 и базовой заливки 336×336.
  const fallbacks = calls.filter(
    (x) => x[0] === 'fillRect' && x[1][2] === 42 && x[1][3] === 42);
  assert.equal(fallbacks.length, c.obstacles.size,
    'по одному фолбэк-квадрату на препятствие');
  for (const [, a] of fallbacks) {
    assert.equal(a[0] % 48, 3, 'квадрат с отступом 3px от края клетки');
    assert.equal(a[1] % 48, 3, 'квадрат с отступом 3px от края клетки');
  }
});

test('боевой UI: шаг в препятствие по клавише — «препятствие» в журнал, позиция не меняется (000050)', () => {
  const { G, keydown } = loadCombatUi();
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  c.obstacles.clear();
  c.obstacles.add(c.px + ',' + (c.py - 1)); // камень прямо перед героем
  const x0 = c.px, y0 = c.py;
  press(keydown, 'ArrowUp');
  assert.ok(c.log.includes('препятствие'),
    'reason отклонения шага в журнале: ' + JSON.stringify(c.log.slice(-3)));
  assert.equal(c.px, x0, 'позиция не изменилась');
  assert.equal(c.py, y0, 'позиция не изменилась');
});

test('боевой UI: 000076 — startCombat пробрасывает buffMods в createCombat (wiring main.js → ядро боя)', () => {
  const { G } = loadCombatUi();
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
    buffMods: { damageMult: 1.05, armor: 1 },
  });
  assert.ok(c, 'бой создан');
  assert.deepEqual(c.buffMods, { damageMult: 1.05, armor: 1 },
    'buffMods дошёл до контекста боя (G.createCombat)');
  // Без buffMods — нейтральный дефолт (своя песочница: isActive()).
  const h2 = loadCombatUi();
  const c2 = h2.G.combatUI.startCombat({
    hero: h2.G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  assert.ok(c2, 'бой создан');
  assert.deepEqual(c2.buffMods, { damageMult: 1, armor: 0 },
    'без opts.buffMods — нейтральный дефолт');
});

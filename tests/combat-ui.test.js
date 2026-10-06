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
  // Задача 000084 — ТЕХНИЧЕСКОЕ дополнение (семантика drawCalls НЕ
  // меняется, все существующие ассерты индексов/сигнатур без правок):
  //  * styleCalls — журнал присвоений fillStyle/strokeStyle [prop,
  //    value] (пины ЦВЕТОВ: hpBarColor-заполнение ally-бара vs
  //    плоский '#6fdc6f' моб-бара, подложка rgba(140,242,252,0.25),
  //    рамка '#8cf2fc', кольцо '#ffe27a' — где геометрия совпадает с
  //    подсветкой цели);
  //  * events — ЕДИНЫЙ хронологический лог (вызовы + стили) для
  //    перебора «цвет, действовавший в момент вызова» (styledCalls).
  const styleCalls = el.styleCalls = [];
  const events = el.events = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => {
      calls.push([k, args]);
      events.push({ c: [k, args] });
    }),
    set: (t, k, v) => {
      t[k] = v;
      if (k === 'fillStyle' || k === 'strokeStyle') {
        styleCalls.push([k, v]);
        events.push({ s: [k, v] });
      }
      return true;
    },
  });
}

function makeEl(tag, buttons, rect) {
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
    // 000124: rect несёт и width/height (canvas после build = 336×336,
    // т.е. 1:1 — семантика существующих тестов без изменений; новая
    // нормализация клика по фактическому размеру canvas читает
    // r.width/r.height, фолбэк — canvas.width/height).
    // 000151: ТОЛЬКО техническое расширение (backward-compatible):
    // если rect передан явно (opts.displaySize / opts.lenientRect в
    // loadCombatUi) — возвращается ФИКСИРОВАННЫЙ rect сцены «отображение
    // N CSS px» / lenient-rect без размеров (фолбэк 1:1); без параметра
    // — ТЕКУЩЕЕ поведение (живой rect = this.width/this.height →
    // s ≡ 1 во всех песочницах, существующие 54 теста бит-в-бит).
    getBoundingClientRect() {
      if (rect !== undefined) return rect;
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
// opts.withEfir (000081, по умолчанию false) — efir.js в цепочку ПОСЛЕ
// player.js (позиция из index.html): тесты проводки Эфира (wiring) и
// деградации «opts.efir без efir.js». Без параметра — старая цепочка.
// 000151 (ТОЛЬКО техническое расширение стаба — все существующие
// вызовы/ассерты без правок, см. memory/000151-combat-scale.md D13):
//  * opts.displaySize = N — canvas-стаб: getBoundingClientRect() →
//    фиксированный { left: 0, top: 0, width: N, height: N } (сцены
//    «отображение N CSS px»: R1/R2/A2); без параметра — текущее
//    поведение (живой rect = this.width/this.height → s ≡ 1);
//  * opts.lenientRect = true — rect БЕЗ width/height { left: 0, top: 0 }
//    (A3: фолбэк build(); та же семантика, что у lenient-стабов
//    main-visuals/companions-cycle/dungeon-vision);
//  * opts.devicePixelRatio = n — window.devicePixelRatio (dpr-сцены);
//    без параметра — свойство отсутствует → typeof-гард в коде → 1;
//  * window-стаб собирает ВСЕ слушатели в winListeners (карта
//    type → [fn]) — для R3 (вызов «resize»-слушателя, которого ещё
//    нет); keydown-массив сохраняется КАК ЕСТЬ (совместимость);
//    в существующих песочницах «resize» регистрируется (после зелёной)
//    и НИГДЕ не вызывается → поведение бит-в-бит;
//  * ЦЕПОЧКА: 'combat-scale.js' ПЕРЕД 'combat-ui.js' (та же пара, что
//    в index.html; порядок закреплён tests/index-order.test.js) —
//    С existsSync-ГАРДОМ (паттерн motion.js L25-27 index-order,
//    000091): в красной фазе файла нет → чтение пропускается ТИХО
//    (не ENOENT-краш всей песочницы, иначе 54+ существующих теста
//    падали бы крахом, а не осмысленно); осмысленный красный «файл не
//    существует» несёт tests/combat-scale.test.js (P1-P7).
function loadCombatUi(withSprites = true, opts = {}) {
  const keydown = [];
  const winListeners = {};
  const buttons = [];
  const canvasRect = opts.displaySize !== undefined
    ? { left: 0, top: 0, width: opts.displaySize, height: opts.displaySize }
    : (opts.lenientRect ? { left: 0, top: 0 } : undefined);
  const document = {
    createElement: (tag) => {
      const el = makeEl(tag, buttons, tag === 'canvas' ? canvasRect : undefined);
      if (tag === 'button') buttons.push(el);
      return el;
    },
    body: makeEl('body', buttons),
  };
  const window = {
    addEventListener: (type, fn) => {
      (winListeners[type] || (winListeners[type] = [])).push(fn);
      if (type === 'keydown') keydown.push(fn);
    },
  };
  if (opts.devicePixelRatio !== undefined) {
    window.devicePixelRatio = opts.devicePixelRatio;
  }
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
    'sheet.js', 'player.js',
  ]) {
    vm.runInContext(src(f), sandbox, { filename: f });
  }
  if (opts.withEfir) {
    // 000081: efir.js — ПОСЛЕ player.js (та же пара, что в index.html;
    // позиция закреплена в tests/index-order.test.js). Существующие
    // тесты параметр НЕ передают → старая цепочка → бит-в-бит.
    // Красная фаза: файла нет — осмысленный assert.fail.
    let efirCode;
    try {
      efirCode = fs.readFileSync(path.join(ROOT, 'src', 'efir.js'), 'utf8');
    } catch (e) {
      assert.fail('src/efir.js не существует (задача 000081): ' + e.message);
    }
    vm.runInContext(efirCode, sandbox, { filename: 'efir.js' });
  }
  for (const f of ['items.js', 'controls.js', 'combat.js', 'combat-keys.js']) {
    vm.runInContext(src(f), sandbox, { filename: f });
  }
  if (withSprites) {
    vm.runInContext(src('sprites.js'), sandbox, { filename: 'sprites.js' });
  }
  // 000151: combat-scale.js — ПОСЛЕ sprites.js, ПЕРЕД combat-ui.js
  // (позиция из index.html; UMD: combat-ui.js снимает Game один раз —
  // G.combatScale обязан быть в снапшоте; ленивое чтение в момент
  // вызова — гард деградирует, но порядок закреплен пином
  // tests/index-order.test.js). Красная фаза: existsSync-гард (выше).
  if (fs.existsSync(path.join(ROOT, 'src', 'combat-scale.js'))) {
    vm.runInContext(src('combat-scale.js'), sandbox,
      { filename: 'combat-scale.js' });
  }
  vm.runInContext(src('combat-ui.js'), sandbox, { filename: 'combat-ui.js' });
  return { G: sandbox.Game, keydown, buttons, body: document.body,
    winListeners };
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
  // c.buffMods — объект из vm-песочницы (чужой realm): deepStrictEqual
  // сравнивает Object.prototype между realm'ами и падает даже на
  // равные по структуре — сравнение через JSON-нормализацию
  // (контракт — точные значения).
  assert.deepEqual(JSON.parse(JSON.stringify(c.buffMods)),
    { damageMult: 1.05, armor: 1 },
    'buffMods дошёл до контекста боя (G.createCombat)');
  // Без buffMods — нейтральный дефолт (своя песочница: isActive()).
  const h2 = loadCombatUi();
  const c2 = h2.G.combatUI.startCombat({
    hero: h2.G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  assert.ok(c2, 'бой создан');
  assert.deepEqual(JSON.parse(JSON.stringify(c2.buffMods)),
    { damageMult: 1, armor: 0 },
    'без opts.buffMods — нейтральный дефолт');
});

// --- Экран боя: вьюпорт + иконные кнопки (задача 000124) ---
//
// Контракт — memory/000124-combat-layout.md:
//  * кнопки .combat-actions — SVG-иконка (img assets/ui/combat_*.svg)
//    + aria-label = имя действия, текстовой подписи НЕТ (подпись
//    «Имя [клавиша]» уходит; таблица combat-keys.js не меняется);
//  * боевой оверлей несёт скоуп-класс .combat-overlay--combat — весь
//    layout боя (CSS) живёт только в этом скоупе;
//  * клик по клетке — по фактическому (CSS-масштабированному) размеру
//    canvas: getBoundingClientRect().width/height, фолбэк —
//    canvas.width/height (регрессия: при CSS-scale клик падал НЕ В ТУ
//    клетку, см. «Состояние сейчас» в tasks/pending/000124.md).

test('боевой UI: кнопки .combat-actions — иконка (img assets/ui/combat_*.svg) + aria-label, без текстовой подписи (000124)', () => {
  const { G, buttons } = loadCombatUi();
  G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  assert.equal(buttons.length, 8, 'кнопок действий = 8 (таблица combat-keys.js)');
  const byAction = {};
  for (const it of G.CombatKeys.describeCombatKeys()) byAction[it.action] = it;
  for (const b of buttons) {
    const item = byAction[b.dataset.act];
    assert.ok(item, 'кнопка из таблицы: ' + b.dataset.act);
    // Иконка — единственный img-ребёнок; src — файл assets/ui/,
    // и файл СУЩЕСТВУЕТ (контракт иконок — память 000124).
    const imgs = b.children.filter((ch) => ch.tagName === 'img');
    assert.equal(imgs.length, 1,
      'кнопка ' + b.dataset.act + ': ровно одна иконка <img>, найдено: '
      + imgs.length);
    const img = imgs[0];
    assert.match(img.src, /^assets\/ui\/combat_[a-z]+\.svg$/,
      'кнопка ' + b.dataset.act + ': src иконки — assets/ui/combat_*.svg, '
      + 'факт: ' + img.src);
    assert.ok(fs.existsSync(path.join(ROOT, img.src)),
      'кнопка ' + b.dataset.act + ': файл иконки существует: ' + img.src);
    // Доступность: aria-label = имя действия (из describeCombatKeys).
    assert.equal(b.ariaLabel, item.label,
      'кнопка ' + b.dataset.act + ': aria-label = «' + item.label
      + '», факт: ' + b.ariaLabel);
    // Текстовой подписи (и клавиши-подсказки [J] и т.п.) НЕТ.
    assert.equal(b.textContent, '',
      'кнопка ' + b.dataset.act + ': текстовой подписи нет, '
      + 'факт: ' + JSON.stringify(b.textContent));
  }
});

test('боевой UI: боевой оверлей несёт скоуп-класс combat-overlay--combat (000124)', () => {
  const { G, body } = loadCombatUi();
  G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  const overlay = body.children[0];
  assert.ok(overlay, 'оверлей подвешен к body');
  assert.ok(overlay.className.includes('combat-overlay--combat'),
    'оверлей боя — в скоупе .combat-overlay--combat (layout CSS), '
    + 'факт: ' + overlay.className);
});

test('боевой UI: клик по МАСШТАБИРОВАННОМУ canvas (rect 672×672) — правильная цель (000124)', () => {
  const { G, body } = loadCombatUi();
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  const wolf = c.units.find((u) => u.mobId === 'wolf');
  wolf.x = 1; wolf.y = 2; // 1×1 в клетке (1,2)
  // createCombat автоматически берёт ближайшего моба целью
  // (combat.js) — снимаем, чтобы клик должен был ВЫБРАТЬ цель.
  c.targetId = null;
  assert.equal(c.targetId, null, 'до клика цели нет');
  const canvas = findCanvas(body);
  // CSS-масштаб ×2: на экране rect 672×672 при внутреннем 336×336
  // (96 экранных px на клетку).
  canvas.getBoundingClientRect =
    () => ({ left: 0, top: 0, width: 672, height: 672 });
  // Центр клетки (1,2) в экранных координатах: (1.5·96, 2.5·96) = (144, 240).
  canvas.listeners.click[0]({ clientX: 144, clientY: 240 });
  assert.equal(c.targetId, wolf.id,
    'клик (144,240) при rect 672×672 → волк в (1,2); факт: ' + c.targetId);
});

test('боевой UI: клик 1:1 (rect 336×336) — та же цель (000124, якорь)', () => {
  // Якорь: при canvas 1:1 (rect = внутренний размер) поведение клика
  // как было — клетка по clientX/clientY / CELL.
  const { G, body } = loadCombatUi();
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  const wolf = c.units.find((u) => u.mobId === 'wolf');
  wolf.x = 1; wolf.y = 2;
  c.targetId = null; // снять авто-цель: клик должен выбрать цель
  const canvas = findCanvas(body);
  canvas.getBoundingClientRect =
    () => ({ left: 0, top: 0, width: 336, height: 336 });
  // Центр клетки (1,2) при 48px/клетку: (1.5·48, 2.5·48) = (60, 120).
  canvas.listeners.click[0]({ clientX: 60, clientY: 120 });
  assert.equal(c.targetId, wolf.id, '1:1 → волк в (1,2)');
});

test('боевой UI: нулевой rect (width/height = 0) — фолбэк 1:1, без ошибок (000124, якорь)', () => {
  // Якорь фолбэка: rect без размеров (патологии/DOM-стабы) —
  // координаты по внутреннему размеру canvas (canvas.width/height),
  // деление на ноль/NaN невозможны.
  const { G, body } = loadCombatUi();
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  const wolf = c.units.find((u) => u.mobId === 'wolf');
  wolf.x = 1; wolf.y = 2;
  c.targetId = null; // снять авто-цель: клик должен выбрать цель
  const canvas = findCanvas(body);
  canvas.getBoundingClientRect =
    () => ({ left: 0, top: 0, width: 0, height: 0 });
  canvas.listeners.click[0]({ clientX: 60, clientY: 120 });
  assert.equal(c.targetId, wolf.id, 'нулевой rect → фолбэк 1:1, волк в (1,2)');
});

// --- Эфир: постоянный союзник (задача 000081) ---
//
// КРАСНЫЕ тесты (TDD): падают, пока src/efir.js не существует и проводка
// в startCombat/finish (src/combat-ui.js) не сделана.
//
// Контракт (memory/000081-efir.md): ОДИН воронка — startCombat +
// finish() в combat-ui.js (main.js минимален: `efir,` в opts трёх
// startCombat). finish(): после «const result = ctx.combat.result»,
// ДО onEnd и ДО «ctx = null»:
//   if (ctx.efir && result.outcome === 'victory' && result.xp > 0)
//     G.efir.addEfirXp(ctx.efir, result.xp);
// Правило 100%: только victory, ВЕСЬ result.xp, БЕЗ companion_xp_share,
// БЕЗ условия выживания Эфира. vm-правила 000082: ассерты — только
// примитивы (level/xp/alive) и наличие юнита (объекты чужого realm —
// не deepStrictEqual/instanceof).

test('боевой UI: 000081 — startCombat ВСЕГДА добавляет Эфир (wiring), finish: 100% result.xp → в пул (до onEnd)', () => {
  const { G, keydown } = loadCombatUi(true, { withEfir: true });
  const state = G.efir.createEfir();
  assert.ok(state, 'G.efir.createEfir (efir.js в цепочке)');
  let ended = null;
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(),
    mobs: ['wolf'], mobLevel: 1, seed: 42,
    efir: state,
    onEnd: (r) => { ended = r; },
  });
  assert.ok(c, 'бой создан');
  // Юнит Эфира в бою: id/kind 'efir', side 'ally', полный HP,
  // первый якорь placeAllies (px−1, py−1) — «всегда со мной».
  const u = c.units.find((x) => x.kind === 'efir');
  assert.ok(u, 'Эфир в allies (wiring startCombat → createCombat)');
  assert.equal(u.id, 'efir');
  assert.equal(u.side, 'ally');
  assert.equal(u.alive, true);
  assert.equal(u.hp, u.maxHP, 'старт с полным HP');
  assert.equal(u.x, c.px - 1, 'первый якорь (px−1, py−1)');
  assert.equal(u.y, c.py - 1);
  // Имитация победы → finish(): 100% result.xp — в пул, ДО onEnd.
  c.result = { outcome: 'victory', xp: 50, gold: 1, defeated: 1,
    allyXp: [] };
  press(keydown, 'Escape');
  assert.ok(ended, 'onEnd вызван (finish)');
  assert.equal(ended.outcome, 'victory');
  assert.equal(state.level, 2,
    'xp 50 = xpForNext(1) → уровень 2 (100%, НЕ ×0.5)');
  assert.equal(state.xp, 0, 'остаток xp — 0');
});

test('боевой UI: 000081 — деградация: opts.efir БЕЗ efir.js (старая цепочка) → console.error, бой создан без Эфира, без краха', () => {
  const { G } = loadCombatUi(); // старая цепочка (без efir.js)
  const errors = [];
  const realError = console.error;
  console.error = (m) => errors.push(String(m));
  let c = null;
  try {
    c = G.combatUI.startCombat({
      hero: G.createCharacter(),
      mobs: ['wolf'], mobLevel: 1, seed: 42,
      efir: { level: 1, xp: 0, skills: {} },
    });
  } finally {
    console.error = realError;
  }
  assert.ok(c, 'бой создан (деградация, не крах)');
  assert.ok(!c.units.some((x) => x.kind === 'efir'),
    'Эфира в бою нет (G.efir недоступен)');
  assert.ok(errors.length > 0,
    'console.error записан (opts.efir передан, efir.js не загружен)');
});

// --- handleCode: единый путь «code → действие боя» (задача 000121) ---
//
// KРАСНЫЕ (TDD): падают, пока G.combatUI.handleCode не существует.
// Контракт (memory/000121-touch-dungeon-combat.md, D3): тело keydown
// 1:1 вынесено в handleCode(code) (consumed = прежний handled,
// render() внутри при consumed); keydown — тонкая обёртка
// (preventDefault/stopPropagation при consumed). handleCode —
// ЕДИНСТВЕННЫЙ вход «code → действие боя» для клавиатуры и тача:
// тап D-pad = ОДНО нажатие handleCode — БЕЗ повтора (в бою каждое
// действие тратит ход). Существующие keydown-тесты (press) —
// страховка 1:1-рефакторинга, здесь не трогаются.

test('боевой UI: handleCode — единый путь «code → действие боя» (тап = одно действие, БЕЗ повтора) (000121)', () => {
  const { G } = loadCombatUi();
  // Вход существует: функция (единый путь клавиатуры и тача).
  assert.equal(typeof G.combatUI.handleCode, 'function',
    'G.combatUI.handleCode — функция (единый путь code → действие)');
  // До startCombat — false (оверлей неактивен, без действия).
  assert.equal(G.combatUI.handleCode('KeyB'), false,
    'до startCombat — false');

  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf', 'spider'], mobLevel: 1, seed: 42,
  });
  assert.ok(c, 'бой создан');
  assert.equal(c.phase, 'player');

  // (а) Блок: ровно одно действие, одна строка лога (как press KeyB).
  const n0 = c.log.length;
  assert.equal(G.combatUI.handleCode('KeyB'), true, 'блок — consumed');
  assert.deepEqual(Array.from(c.log).slice(n0), ['Вы ставите блок.'],
    'ровно ОДНО действие — одна строка лога: '
    + JSON.stringify(Array.from(c.log).slice(n0)));
  assert.equal(c.ps.blocked, true, 'блок поставлен');

  // (б) Digit1 — none: НЕ «проглатывается» (false), без побочных строк.
  const n1 = c.log.length;
  assert.equal(G.combatUI.handleCode('Digit1'), false,
    'Digit1 — none: не «проглатывается» (false)');
  assert.equal(c.log.length, n1, 'неизвестный code — без строки в журнале');

  // (в) Шаг: handleCode('ArrowUp') — как keydown ArrowUp. Две
  // идентичные песочницы (один seed) — поведение бит-в-бит.
  const a = loadCombatUi();
  const ca = a.G.combatUI.startCombat({
    hero: a.G.createCharacter(), mobs: ['wolf', 'spider'], mobLevel: 1, seed: 42,
  });
  const an = ca.log.length;
  press(a.keydown, 'ArrowUp');
  const b = loadCombatUi();
  const cb = b.G.combatUI.startCombat({
    hero: b.G.createCharacter(), mobs: ['wolf', 'spider'], mobLevel: 1, seed: 42,
  });
  const bn = cb.log.length;
  assert.equal(b.G.combatUI.handleCode('ArrowUp'), true, 'шаг — consumed');
  assert.equal(cb.px, ca.px, 'шаг: позиция x — как у keydown ArrowUp');
  assert.equal(cb.py, ca.py, 'шаг: позиция y — как у keydown ArrowUp');
  assert.deepEqual(Array.from(cb.log).slice(bn), Array.from(ca.log).slice(an),
    'шаг: журнал — как у keydown ArrowUp');

  // (г) [E] → quickItem: ровно ОДНА строка лога (quickItem либо
  // canDo-reason — точный текст не пиним); фаза/раунд не сдвинуты.
  const e1 = loadCombatUi();
  const ce = e1.G.combatUI.startCombat({
    hero: e1.G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  const en = ce.log.length;
  const phaseBefore = ce.phase, roundBefore = ce.round;
  assert.equal(e1.G.combatUI.handleCode('KeyE'), true, 'KeyE — consumed');
  const eAdded = Array.from(ce.log).slice(en);
  assert.equal(eAdded.length, 1,
    'ровно ОДНА строка лога (quickItem или reason): ' + JSON.stringify(eAdded));
  assert.equal(ce.phase, phaseBefore, 'фаза не сдвинута');
  assert.equal(ce.round, roundBefore, 'раунд не сдвинут');

  // (д) result-фаза: Space → finish (onEnd), прочие клавиши — false
  // (паттерн существующего 000081: c.result + Escape/Space закрывают).
  const r1 = loadCombatUi();
  let ended = null;
  const cr = r1.G.combatUI.startCombat({
    hero: r1.G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
    onEnd: (res) => { ended = res; },
  });
  cr.result = { outcome: 'victory' };
  assert.equal(r1.G.combatUI.handleCode('Space'), true,
    'Space после боя — finish (consumed)');
  assert.ok(ended, 'onEnd вызван (finish)');
  assert.equal(ended.outcome, 'victory');
  assert.equal(r1.G.combatUI.isActive(), false, 'оверлей закрыт');
  assert.equal(r1.G.combatUI.handleCode('KeyJ'), false,
    'после finish — false (не «проглатывается»)');
});

// --- Союзники на мини-карте (задача 000084) ---
//
// Контракт: memory/000084-ally-minimap.md (геометрия/цвета/слои
// 'ally'-ветки drawUnits, allyFrames, перевставка героя) и
// memory/000084-ally-render.md (стабильный рендер-контракт для
// 000086/000087/000114). КРАСНЫЕ тесты (TDD): падают, потому что
// 'ally'-ветки в drawUnits НЕТ — союзник рисуется ветвью МОБА:
// ROLE_COLORS-прямоугольник + плоский '#6fdc6f' моб-бар + уровень;
// спрайта союзника, маркера «свой» и канвас-индикатора хода нет.
//
// Сцены: Эфир — opts.withEfir + opts.efir (G.efir.createEfir, 000081);
// наёмник — G.makeAlly (kind 'merc', 000080) + push в c.units и
// c.turnOrder (белая коробка, паттерн мутаций существующих тестов).
// Re-render — rAF-tick (makeRafStubs, чистый render без клавиш) при
// фиксированном performance.now (детерминизм кадров, 000047).
// vm-правила 000082: ассерты — примитивы/сигнатуры; аргумент
// drawImage — по метке запрошенного пути (лоадер-фак пишет
// requested[], изображения — ОБЪЕКТЫ-ДИСТИНКТЫ по пути), не
// deepEqual/identity на объектах.

const NOW84 = 1000;

// Лоадер-фак: prefixes — [[префикс пути, маркер]...]; requested[] —
// все запрошенные пути (порядок); на каждый путь — дистинктный
// объект с меткой __path (нормализация drawImage в golden).
function fakeLoader84(requested, prefixes) {
  const images = new Map();
  return {
    image: (p) => {
      requested.push(p);
      for (const [pre, fake] of prefixes) {
        if (fake && p.startsWith(pre)) {
          if (!images.has(p)) images.set(p, Object.assign({ __path: p }, fake));
          return images.get(p);
        }
      }
      return null;
    },
  };
}

// Сцена 000084: цепочка со sprites.js (+ efir.js, если opts.efir),
// фикс. now, rAF-стабы, моб — волк (1×1). opts.loader — префиксы
// спрайт-факов; без него spriteLoader = null (фолбэк-сцены).
function scene84(opts = {}) {
  const rafStubs = makeRafStubs();
  const { G, keydown, body } = loadCombatUi(true, {
    withEfir: !!opts.efir,
    performance: { now: () => NOW84 },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  const requested = [];
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(),
    mobs: opts.mobs || ['wolf'], mobLevel: 1, seed: 42,
    ...(opts.efir ? { efir: G.efir.createEfir() } : {}),
    ...(opts.loader
      ? { spriteLoader: fakeLoader84(requested, opts.loader) } : {}),
  });
  return { G, c, canvas: findCanvas(body), body, keydown, rafStubs,
    requested };
}

// Re-render через rAF-tick: окно ПОСЛЕДНЕГО рендера (срезы drawCalls /
// styleCalls / единого логa events — один временной интервал).
function tickSlice(canvas, rafStubs) {
  const n0 = canvas.drawCalls.length;
  const s0 = canvas.styleCalls.length;
  const e0 = canvas.events.length;
  rafStubs.scheduled[rafStubs.scheduled.length - 1]();
  return {
    calls: canvas.drawCalls.slice(n0),
    styleCalls: canvas.styleCalls.slice(s0),
    events: canvas.events.slice(e0),
  };
}

// «Цвет, действовавший в момент вызова»: перебор единого логa
// (стили → последующие вызовы несут их до нового присвоения).
function styledCalls(events) {
  const out = [];
  let fillStyle, strokeStyle;
  for (const ev of events) {
    if (ev.s) {
      if (ev.s[0] === 'fillStyle') fillStyle = ev.s[1];
      else strokeStyle = ev.s[1];
    } else {
      out.push({ name: ev.c[0], args: ev.c[1], fillStyle, strokeStyle });
    }
  }
  return out;
}

// Левый верх (x, y) вызова: fillRect/strokeRect — args 0/1;
// drawImage/fillText — args 1/2.
const callXY = (n, a) => (n === 'fillRect' || n === 'strokeRect')
  ? [a[0], a[1]] : [a[1], a[2]];

// Наёмник (kind 'merc', 000080): G.makeAlly + ручные x/y и запись в
// очередь хода (белая коробка, паттерн существующих тестов).
function addMerc84(c, G, x, y, role = 'ranged', name = 'Орк') {
  const merc = G.makeAlly({ name, role, level: 2, dmg: 1, hp: 1 }, 1);
  merc.x = x; merc.y = y;
  c.units.push(merc);
  c.turnOrder.push(merc.id);
  return merc;
}

test('боевой UI: 000084 — Эфир в рендере: спрайт (efirFrames, 000034) на клетке союзника, кадр детерминирован', () => {
  const S = scene84({ efir: true,
    loader: [['assets/sprites/efir/', { __fake: 'efir' }]] });
  const u = S.c.units.find((x) => x.kind === 'efir');
  assert.ok(u, 'Эфир в бою (000081)');
  const { calls } = tickSlice(S.canvas, S.rafStubs);
  const di = calls.find((x) => x[0] === 'drawImage'
    && x[1][0] && x[1][0].__fake === 'efir');
  assert.ok(di, 'спрайт Эфира нарисован (drawImage), а не фолбэк-прямоугольник');
  assert.equal(di[1][1], u.x * 48 + 8, 'x — клетка союзника + запас 8px (как у мобов)');
  assert.equal(di[1][2], u.y * 48 + 8, 'y — клетка союзника');
  assert.equal(di[1][3], 32, '1×1: ширина 32px');
  assert.equal(di[1][4], 32, '1×1: высота 32px');
  // Кадр детерминирован: efirFrames('idle')[frameIndex(NOW, u.x, u.y, 2)]
  // (action v1 = 'idle'; c._unitFx в ally-ветке не читается).
  const idx = S.G.frameIndex(NOW84, u.x, u.y, 2);
  const frame = S.G.efirFrames('idle')[idx];
  assert.ok(S.requested.includes(frame),
    'запрошен кадр: ' + frame + ' | ' + JSON.stringify(S.requested));
});

test('боевой UI: 000084 — полоса HP у союзника: компактная (геометрия моба), цвет заполнения = hpBarColor (паттерн 000038)', () => {
  // Раненый Эфир: hp = 1/8 → frac 0.125 < 0.2 → красный. Сейчас —
  // плоский моб-цвет '#6fdc6f' (красная: пороговый цвет 000038).
  let S = scene84({ efir: true });
  let u = S.c.units.find((x) => x.kind === 'efir');
  u.hp = 1;
  const ex = u.x * 48, ey = u.y * 48;
  const t1 = tickSlice(S.canvas, S.rafStubs);
  const styled1 = styledCalls(t1.events);
  const inBar = (c, w) => c.name === 'fillRect'
    && c.args[0] === ex + 8 && c.args[1] === ey + 2
    && c.args[2] === w && c.args[3] === 4;
  const track = styled1.find((c) => inBar(c, 32) && c.fillStyle === '#3a0d0d');
  assert.ok(track, 'HP-трек (ex+8, ey+2, 32×4 — геометрия моба)');
  const fill = styled1.filter((c) => inBar(c, Math.round(32 * (1 / u.maxHP))));
  assert.equal(fill.length, 1,
    'заполнение: ширина = round(32 × hp/maxHP) = 4px');
  assert.equal(fill[0].fillStyle, S.G.hpBarColor(1 / u.maxHP),
    'цвет заполнения — из Game.hpBarColor (паттерн 000038), '
    + 'а не плоский цвет моб-бара; факт: ' + fill[0].fillStyle);
  assert.equal(fill[0].fillStyle, '#d9483b', 'frac < 0.2 → красный');
  // Якорь: полный HP → '#6fdc6f' (геометрия — как у мобов).
  S = scene84({ efir: true });
  u = S.c.units.find((x) => x.kind === 'efir');
  const ex2 = u.x * 48, ey2 = u.y * 48;
  const bars = styledCalls(tickSlice(S.canvas, S.rafStubs).events)
    .filter((c) => c.name === 'fillRect'
      && c.args[0] === ex2 + 8 && c.args[1] === ey2 + 2
      && c.args[2] === 32 && c.args[3] === 4);
  assert.equal(bars.length, 2, 'полный HP: трек + заполнение');
  assert.ok(bars.some((b) => b.fillStyle === '#3a0d0d'), 'трек — тёмный');
  assert.ok(bars.some((b) => b.fillStyle === '#6fdc6f'),
    'полный HP → «#6fdc6f» (hpBarColor)');
});

test('боевой UI: 000084 — маркер «свой»: синяя подложка 44×44 + рамка 39×39 (без лоадера — фолбэк + маркер)', () => {
  const S = scene84({ efir: true }); // без лоадера: фолбэк-прямоугольник
  const u = S.c.units.find((x) => x.kind === 'efir');
  S.c.targetId = null; // без подсветки цели (сигнатура 39×39)
  const ex = u.x * 48, ey = u.y * 48;
  const t = tickSlice(S.canvas, S.rafStubs);
  assert.ok(t.calls.some((c) => c[0] === 'fillRect'
    && c[1][0] === ex + 2 && c[1][1] === ey + 2
    && c[1][2] === 44 && c[1][3] === 44),
    'подложка «свой» 44×44 (px+2, py+2)');
  assert.ok(t.calls.some((c) => c[0] === 'strokeRect'
    && c[1][0] === ex + 4.5 && c[1][1] === ey + 4.5
    && c[1][2] === 39 && c[1][3] === 39),
    'рамка «свой» 39×39 (px+4.5, py+4.5)');
  assert.equal(t.styleCalls.filter((s) => s[0] === 'fillStyle'
    && s[1] === 'rgba(140, 242, 252, 0.25)').length, 1,
    'цвет подложки — ровно один раз (одна союзная клетка)');
  assert.equal(t.styleCalls.filter((s) => s[0] === 'strokeStyle'
    && s[1] === '#8cf2fc').length, 1,
    'цвет рамки — ровно один раз');
  // Якорь: фолбэк-прямоугольник без лоадера на месте.
  assert.ok(t.calls.some((c) => c[0] === 'fillRect'
    && c[1][0] === ex + 8 && c[1][1] === ey + 8
    && c[1][2] === 32 && c[1][3] === 32),
    'фолбэк-прямоугольник 32×32 (без лоадера)');
});

test('боевой UI: 000084 — индикатор хода у союзника: кольцо 41×41, когда turnOrder[turnIndex] = союзник; в остальное время — нет', () => {
  const S = scene84({ efir: true });
  const u = S.c.units.find((x) => x.kind === 'efir');
  S.c.targetId = null; // без подсветки цели (цвет '#ffe27a')
  const ex = u.x * 48, ey = u.y * 48;
  // Ход Эфира: канвас-индикатор в его клетке.
  S.c.phase = 'mob';
  S.c.turnIndex = S.c.turnOrder.indexOf('efir');
  const t1 = tickSlice(S.canvas, S.rafStubs);
  assert.ok(t1.calls.some((c) => c[0] === 'strokeRect'
    && c[1][0] === ex + 2.5 && c[1][1] === ey + 2.5
    && c[1][2] === 41 && c[1][3] === 41),
    'кольцо хода 41×41 (px+2.5, py+2.5) — снаружи рамки «свой»');
  assert.equal(t1.styleCalls.filter((s) => s[0] === 'strokeStyle'
    && s[1] === '#ffe27a').length, 1,
    'цвет кольца — ровно один раз (цели нет — без коллизии)');
  // Не ход Эфира — кольца нет нигде.
  S.c.turnIndex = 0;
  const t2 = tickSlice(S.canvas, S.rafStubs);
  assert.ok(!t2.calls.some((c) => c[0] === 'strokeRect'
    && c[1][2] === 41 && c[1][3] === 41),
    'не ход союзника — кольца нет');
  assert.equal(t2.styleCalls.filter((s) => s[0] === 'strokeStyle'
    && s[1] === '#ffe27a').length, 0,
    '«#ffe27a» отсутствует (цели нет, кольца нет)');
});

test('боевой UI: 000084 — наёмник (kind «merc»): спрайт моба-архетипа (MOB_FRAMES[«orc»]) + маркер «свой»', () => {
  const S = scene84({ loader:
    [['assets/sprites/mobs/orc_', { __fake: 'orc' }]] });
  const merc = addMerc84(S.c, S.G, 5, 2, 'ranged');
  const t = tickSlice(S.canvas, S.rafStubs);
  const di = t.calls.find((c) => c[0] === 'drawImage'
    && c[1][0] && c[1][0].__fake === 'orc');
  assert.ok(di, 'спрайт наёмника (drawImage моба-архетипа)');
  assert.equal(di[1][1], merc.x * 48 + 8, 'x — клетка наёмника');
  assert.equal(di[1][2], merc.y * 48 + 8, 'y — клетка наёмника');
  assert.equal(di[1][3], 32, '1×1: 32px');
  assert.equal(di[1][4], 32, '1×1: 32px');
  const frame = S.G.MOB_FRAMES['orc'][S.G.frameIndex(NOW84, merc.x, merc.y, 2)];
  assert.ok(S.requested.includes(frame),
    'запрошенный путь = MOB_FRAMES["orc"][frameIndex]: ' + frame
    + ' | ' + JSON.stringify(S.requested));
  // Маркер «свой» на клетке наёмника (сцена с ОДНИМ союзником).
  assert.ok(t.calls.some((c) => c[0] === 'fillRect'
    && c[1][0] === merc.x * 48 + 2 && c[1][1] === merc.y * 48 + 2
    && c[1][2] === 44 && c[1][3] === 44), 'подложка на клетке наёмника');
  assert.ok(t.calls.some((c) => c[0] === 'strokeRect'
    && c[1][0] === merc.x * 48 + 4.5 && c[1][1] === merc.y * 48 + 4.5
    && c[1][2] === 39 && c[1][3] === 39), 'рамка на клетке наёмника');
  assert.equal(t.styleCalls.filter((s) => s[0] === 'fillStyle'
    && s[1] === 'rgba(140, 242, 252, 0.25)').length, 1,
    'подложка — ровно один раз');
  assert.equal(t.styleCalls.filter((s) => s[0] === 'strokeStyle'
    && s[1] === '#8cf2fc').length, 1, 'рамка — ровно один раз');
});

test('боевой UI: 000084 — детерминизм отрисовки (golden): один seed/now/efir-state → одна последовательность вызовов', () => {
  // Эфир + наёмник + волк, препятствий нет, фикс. now: ДВА рендера
  // подряд (rAF-tick'и) — срезы поэлементно идентичны; подпоследо-
  // вательность клеток Эфира = golden-порядок слоёв (контракт §3).
  const S = scene84({
    efir: true,
    loader: [['assets/sprites/efir/', { __fake: 'efir' }],
             ['assets/sprites/mobs/orc_', { __fake: 'orc' }]],
  });
  addMerc84(S.c, S.G, 5, 2, 'ranged');
  S.c.obstacles.clear();
  S.c.targetId = null; // без подсветки цели в golden
  const u = S.c.units.find((x) => x.kind === 'efir');
  const A = tickSlice(S.canvas, S.rafStubs);
  const B = tickSlice(S.canvas, S.rafStubs);
  const norm = (c) => {
    const [n, a] = c;
    // vm-правило 000082: drawImage — по метке пути, не identity.
    // Форма [name, [args...]] — как у записи drawCalls и golden ниже
    // (техническая правка стадии реализации: плоская форма не
    // сравнимая с golden через deepStrictEqual).
    return n === 'drawImage'
      ? [n, [a[0] && a[0].__path, ...a.slice(1)]] : [n, a];
  };
  assert.ok(A.calls.length > 0, 'рендер отрисовал вызовы');
  assert.equal(A.calls.length, B.calls.length,
    'два рендера — одинаковое число вызовов');
  assert.deepEqual(A.calls.map(norm), B.calls.map(norm),
    'тот же now/seed/state → та же последовательность вызовов');
  // Golden: порядок слоёв в клетке Эфира: подложка → спрайт → трек →
  // заполнение → уровень → рамка (кольца нет: turnIndex = 0).
  // Вызовы героя (спрайт 55.2px вылезает за клетку; миниполоса 55×4
  // может попасть в диапазон клетки) исключаются по сигнатуре.
  const ex = u.x * 48, ey = u.y * 48;
  const isHero = (n, a) => (n === 'drawImage' && a[0]
      && a[0].__fake === 'hero')
    || (n === 'fillRect' && a[2] === 55 && a[3] === 4);
  const cell = A.calls.filter(([n, a]) => {
    if (isHero(n, a)) return false;
    const [x, y] = callXY(n, a);
    return x >= ex && x < ex + 48 && y >= ey && y < ey + 48;
  }).map(norm);
  const frame = S.G.efirFrames('idle')[S.G.frameIndex(NOW84, u.x, u.y, 2)];
  const golden = [
    ['fillRect', [ex + 2, ey + 2, 44, 44]],            // подложка «свой»
    ['drawImage', [frame, ex + 8, ey + 8, 32, 32]],    // спрайт
    ['fillRect', [ex + 8, ey + 2, 32, 4]],             // HP-трек
    ['fillRect', [ex + 8, ey + 2, 32, 4]],             // HP-fill (полный)
    ['fillText', [String(u.level), ex + 24, ey + 28]], // уровень
    ['strokeRect', [ex + 4.5, ey + 4.5, 39, 39]],      // рамка «свой»
  ];
  assert.deepEqual(cell, golden,
    'клетка Эфира — golden-порядок слоёв: ' + JSON.stringify(cell));
});

test('боевой UI: 000084 — слои: союзники не перекрывают игрока (герой — ПОСЛЕ всех союзников)', () => {
  // Герой (3,3): спрайт 55.2px вылезает за клетку (левый верх
  // 140.4 < 144), миниполоса (141,132) — герой пинится по СигНАТУРЕ,
  // не по клетке (как существующий пин [[141,132]]).
  const heroCall = (n, a) => (n === 'drawImage' && a[0]
      && a[0].__fake === 'hero')
    || (n === 'fillRect' && a[0] === 141 && a[1] === 132
      && a[2] === 55 && a[3] === 4);
  // (а) Наёмник НИЖЕ героя (3,4): герой после ВСЕХ союзников.
  let S = scene84({
    loader: [['assets/sprites/phlogiston/idle_', { __fake: 'hero' }],
             ['assets/sprites/mobs/orc_', { __fake: 'orc' }]],
  });
  addMerc84(S.c, S.G, 3, 4, 'ranged');
  S.c.obstacles.clear();
  S.c.px = 3; S.c.py = 3;
  const A = tickSlice(S.canvas, S.rafStubs);
  const iHero = A.calls.findIndex((c) => c[0] === 'drawImage'
    && c[1][0] && c[1][0].__fake === 'hero');
  const iOrc = A.calls.findIndex((c) => c[0] === 'drawImage'
    && c[1][0] && c[1][0].__fake === 'orc');
  assert.ok(iHero >= 0, 'спрайт героя нарисован');
  assert.ok(iOrc >= 0, 'спрайт наёмника нарисован');
  assert.ok(iHero > iOrc,
    '(а) герой после всех союзников (наёмник ниже): iHero '
    + iHero + ' vs iOrc ' + iOrc);
  // (б) Ловушка: союзник на (px+1, py) — тот же bottomY, x больше:
  // ВСЕ ally-вызовы раньше ВСЕХ hero-вызовов.
  S = scene84({
    loader: [['assets/sprites/phlogiston/idle_', { __fake: 'hero' }],
             ['assets/sprites/mobs/orc_', { __fake: 'orc' }]],
  });
  addMerc84(S.c, S.G, 4, 3, 'ranged');
  S.c.obstacles.clear();
  S.c.px = 3; S.c.py = 3;
  const B = tickSlice(S.canvas, S.rafStubs);
  const allyIdx = [], heroIdx = [];
  B.calls.forEach(([n, a], i) => {
    const [x, y] = callXY(n, a);
    if (x >= 4 * 48 && x < 5 * 48 && y >= 3 * 48 && y < 4 * 48) {
      allyIdx.push(i);
    }
    if (heroCall(n, a)) heroIdx.push(i);
  });
  assert.ok(allyIdx.length > 0, 'вызовы наёмника в сцене');
  assert.ok(heroIdx.length > 0, 'вызовы героя в сцене');
  assert.ok(Math.max(...allyIdx) < Math.min(...heroIdx),
    '(б) все ally-вызовы раньше всех hero-вызовов: max ally '
    + Math.max(...allyIdx) + ' vs min hero ' + Math.min(...heroIdx));
});

test('боевой UI: 000084 — деградация (без sprites.js): Эфир — фолбэк + маркер, drawImage нет, исключений/ошибок нет', () => {
  const rafStubs = makeRafStubs();
  const { G, body } = loadCombatUi(false, {
    withEfir: true,
    performance: { now: () => NOW84 },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  const errors = [];
  const realError = console.error;
  console.error = (m) => errors.push(String(m));
  let c = null;
  try {
    c = G.combatUI.startCombat({
      hero: G.createCharacter(),
      mobs: ['wolf'], mobLevel: 1, seed: 42,
      efir: G.efir.createEfir(),
    });
    const canvas = findCanvas(body);
    assert.ok(canvas, 'оверлей на месте, render() не упал');
    rafStubs.scheduled[rafStubs.scheduled.length - 1](); // re-render
  } finally {
    console.error = realError;
  }
  assert.ok(c, 'бой создан (деградация, не крах)');
  assert.equal(errors.length, 0, 'console.error = 0: ' + JSON.stringify(errors));
  const u = c.units.find((x) => x.kind === 'efir');
  assert.ok(u, 'Эфир в бою');
  const ex = u.x * 48, ey = u.y * 48;
  const calls = findCanvas(body).drawCalls;
  assert.ok(!calls.some((x) => x[0] === 'drawImage'),
    'drawImage нет (в цепочке нет sprites.js)');
  // Якорь: фолбэк-прямоугольник (геометрия ветки) на месте.
  assert.ok(calls.some((x) => x[0] === 'fillRect'
    && x[1][0] === ex + 8 && x[1][1] === ey + 8
    && x[1][2] === 32 && x[1][3] === 32),
    'фолбэк-прямоугольник 32×32');
  // Красная часть: маркер «свой» — единая ветвь с фолбэком.
  assert.ok(calls.some((x) => x[0] === 'fillRect'
    && x[1][0] === ex + 2 && x[1][1] === ey + 2
    && x[1][2] === 44 && x[1][3] === 44),
    'подложка «свой» без sprites.js');
  assert.ok(calls.some((x) => x[0] === 'strokeRect'
    && x[1][0] === ex + 4.5 && x[1][1] === ey + 4.5
    && x[1][2] === 39 && x[1][3] === 39),
    'рамка «свой» без sprites.js');
});

test('боевой UI: 000084 — мёртвый союзник — «ничего»: без подложки/спрайта/полосы/уровня/рамки/кольца (пин)', () => {
  const S = scene84({ efir: true });
  const u = S.c.units.find((x) => x.kind === 'efir');
  u.alive = false; u.hp = 0;
  const ex = u.x * 48, ey = u.y * 48;
  const t = tickSlice(S.canvas, S.rafStubs);
  assert.ok(!t.calls.some((c) => c[0] === 'fillRect'
    && c[1][0] === ex + 2 && c[1][1] === ey + 2
    && c[1][2] === 44 && c[1][3] === 44), 'без подложки');
  assert.ok(!t.calls.some((c) => c[0] === 'drawImage'
    && c[1][1] === ex + 8 && c[1][2] === ey + 8
    && c[1][3] === 32 && c[1][4] === 32), 'без спрайта');
  assert.ok(!t.calls.some((c) => c[0] === 'fillRect'
    && c[1][0] === ex + 8 && c[1][1] === ey + 2 && c[1][3] === 4),
    'без HP-полосы (ни трек, ни заполнение)');
  assert.ok(!t.calls.some((c) => c[0] === 'fillRect'
    && c[1][0] === ex + 8 && c[1][1] === ey + 8
    && c[1][2] === 32 && c[1][3] === 32), 'без фолбэк-прямоугольника');
  assert.ok(!t.calls.some((c) => c[0] === 'fillText'
    && c[1][1] === ex + 24 && c[1][2] === ey + 28), 'без уровня');
  assert.ok(!t.calls.some((c) => c[0] === 'strokeRect'
    && c[1][0] === ex + 4.5 && c[1][1] === ey + 4.5), 'без рамки «свой»');
  assert.ok(!t.calls.some((c) => c[0] === 'strokeRect'
    && c[1][0] === ex + 2.5 && c[1][1] === ey + 2.5), 'без кольца хода');
});

test('боевой UI: 000084 — ряд очереди: токен Эфира несёт --current, когда его ход (пин, 000080)', () => {
  const S = scene84({ efir: true });
  S.c.phase = 'mob';
  S.c.turnIndex = S.c.turnOrder.indexOf('efir');
  tickSlice(S.canvas, S.rafStubs);
  const el = findByClass(S.body, 'combat-turnorder');
  // ЛОВУШКА стаба: textContent='' НЕ очищает children (настоящий DOM
  // так не ведёт) — читаем ХВОСТ (первый тест в файле, читающий
  // этот элемент).
  const tail = el.children.slice(-S.c.turnOrder.length);
  assert.equal(tail.length, 3, 'токены: герой, Эфир, волк');
  const [heroTok, efirTok, mobTok] = tail;
  assert.ok(heroTok.className.includes('turn-token--hero'),
    'токен героя');
  assert.ok(!heroTok.className.includes('turn-token--current'),
    'герой — не current (turnIndex на Эфире)');
  assert.ok(heroTok.className.includes('turn-token--acted'),
    'герой — уже ходил');
  assert.ok(efirTok.className.includes('turn-token--current'),
    'токен Эфира — current');
  assert.equal(efirTok.title, 'Эфир (ур. 1) — ходит',
    'title токена Эфира: ' + JSON.stringify(efirTok.title));
  assert.ok(!mobTok.className.includes('turn-token--current'),
    'волк — не current');
});

test('боевой UI: 000084 — клик по клетке союзника: цель не изменилась, лог не вырос (пин: ядро отклоняет)', () => {
  const S = scene84({ efir: true });
  const u = S.c.units.find((x) => x.kind === 'efir');
  const wolf = S.c.units.find((x) => x.side === 'mob');
  assert.equal(S.c.targetId, wolf.id, 'авто-цель — волк');
  const n0 = S.c.log.length;
  // Центр клетки Эфира (canvas 1:1 — rect = внутренний размер).
  S.canvas.listeners.click[0]({
    clientX: (u.x + 0.5) * 48, clientY: (u.y + 0.5) * 48,
  });
  assert.equal(S.c.targetId, wolf.id,
    'клик по клетке союзника — цель не изменилась '
    + '(ядро отклонило «недоступная цель», 000080)');
  assert.equal(S.c.log.length, n0,
    'тихий отказ (000080): лог не вырос');
});

// --- Задача 000114: защитный тест (RED-фаза no-op) ---
// 000034/000084 СМЕРЖЕНЫ в базу ветки (master 7ab2c03): союзник
// kind 'efir' уже рисуется кадрами efirFrames + маркером «свой» —
// тест фиксирует СУЩЕСТВУЮЩЕЕ поведение (expectedRedCount = 0).
// Негативный пин scoped на КЛЕТКУ ЭФИРА: hero-ветка легитимно
// запрашивает phlogiston-пути через ТОТ ЖЕ лоадер, но рисует в
// (hx−27.6, …, 55.2×55.2) — пересечения с клеткой (px+8, …, 32×32)
// нет. Контракт — memory/000114-efir-combat-render.md (§2/§5).

test('боевой UI: 000114 — союзник kind «efir»: кадры efirFrames (а не кадрами героя) + маркер «свой»', () => {
  const S = scene84({ efir: true,
    loader: [['assets/sprites/efir/', { __fake: 'efir' }]] });
  const u = S.c.units.find((x) => x.kind === 'efir');
  assert.ok(u, 'Эфир в бою (000081)');
  S.c.targetId = null; // без подсветки цели (сигнатура 39×39)
  const ex = u.x * 48, ey = u.y * 48;
  const t = tickSlice(S.canvas, S.rafStubs);
  // Спрайт на клетке Эфира — изображение с __path из каталога efir
  // (лоадер-фак метит каждое изображение путём запрошенного пути).
  const inCell = (c) => c[0] === 'drawImage'
    && c[1][1] === ex + 8 && c[1][2] === ey + 8
    && c[1][3] === 32 && c[1][4] === 32;
  const di = t.calls.find((c) => inCell(c)
    && c[1][0] && c[1][0].__path
    && c[1][0].__path.startsWith('assets/sprites/efir/'));
  assert.ok(di,
    'спрайт Эфира на клетке: drawImage с путём assets/sprites/efir/…');
  // Кадр = efirFrames('idle')[frameIndex(NOW84, u.x, u.y, 2)]
  // (action v1 = 'idle'; c._unitFx в ally-ветке не читается).
  const frame = S.G.efirFrames('idle')[S.G.frameIndex(NOW84, u.x, u.y, 2)];
  assert.equal(di[1][0].__path, frame,
    'кадр на клетке = efirFrames("idle")[frameIndex(NOW84, u.x, u.y, 2)]');
  assert.ok(S.requested.includes(frame), 'кадр запрошен у лоадера');
  // Негативный пин 000114: на клетке Эфира НЕТ drawImage с
  // phlogiston-путём — кадры героя только в hero-ветке.
  assert.ok(!t.calls.some((c) => inCell(c)
    && c[1][0] && c[1][0].__path
    && c[1][0].__path.startsWith('assets/sprites/phlogiston/')),
    'на клетке Эфира нет кадров героя (assets/sprites/phlogiston/)');
  // Маркер «свой» (паттерн 000084): подложка 44×44 + рамка 39×39.
  assert.ok(t.calls.some((c) => c[0] === 'fillRect'
    && c[1][0] === ex + 2 && c[1][1] === ey + 2
    && c[1][2] === 44 && c[1][3] === 44),
    'подложка «свой» 44×44 (px+2, py+2)');
  assert.ok(t.calls.some((c) => c[0] === 'strokeRect'
    && c[1][0] === ex + 4.5 && c[1][1] === ey + 4.5
    && c[1][2] === 39 && c[1][3] === 39),
    'рамка «свой» 39×39 (px+4.5, py+4.5)');
  assert.equal(t.styleCalls.filter((s) => s[0] === 'fillStyle'
    && s[1] === 'rgba(140, 242, 252, 0.25)').length, 1,
    'цвет подложки — ровно один раз');
  assert.equal(t.styleCalls.filter((s) => s[0] === 'strokeStyle'
    && s[1] === '#8cf2fc').length, 1,
    'цвет рамки — ровно один раз');
});

// --- Задача 000118: UX боя Эфира — лог-строки, fx «Вдоха Эфира»,
// подсказка состава отряда (контракт:
// memory/000118-efir-combat-ux.md; план tests — tasks/000118) ---
//
// КРАСНЫЕ (TDD) — падают, пока функциональности НЕТ в неизменённом
// коде (осмысленная причина — отсутствие, не синтаксис):
//  * CU118-FX: в src/combat-ui.js нет edge-detect c.efirBreathed
//    (контракт 000113 §8: «UI видит переключение при рендере»),
//    под-объекта c._fx.breath {at, until: at + 600} и слоя
//    drawBreathFx ('arc' в файле ВОДОБЩЕ не встречается — grep);
//  * CU118-LOG: ТЗ-паттерны «Эфир исцеляет … (+N).»,
//    «Эфир: «…» — …: N.» (em-dash U+2014), «Касание духа: N.» —
//    нет в src/combat.js (сейчас «Эфир лечит …», «… по …: N.»,
//    «Эфир касается …: N.»);
//  * CU118-HUD: строки «Отряд: …» в .combat-state — нет в render();
//  * CU118-FE2: персистентного флага «уже встречались» (opts.efirMet
//    — вариант (а)) — нет в createCombat/combat-ui/main.js.
// CU118-FE1 — ЗЕЛЁНЫЙ ГВАРД (000113 смержен: сессионный one-shot
// уже работает) — фиксатор, чтобы шов варианта (а) не сломал 000113.
//
// Детерминизм сцен (vm-правила 000082/000047): фикс. performance.now
// (NOW84), c._rng = () => 0.99 (мобы промахиваются — изоляция),
// примитивные ассерты (строки/числа/identity внутри realm).

// Строка первой встречи (efir.js BREATH_INFO.firstEncounter; пин BR-1):
// многоточие — ОДИН символ U+2026.
const EFIR_LINE118 = 'Эфир материализуется рядом с Флогистоном…';

test('боевой UI: 000118 — «Вдох Эфира»: c._fx.breath — заявка при триггере (edge c.efirBreathed в render) + слой «arc»; без триггера (mp 19 / полный HP / без Эфира) — нет (CU118-FX)', () => {
  const S = scene84({ efir: true });
  const c = S.c;
  const u = c.units.find((x) => x.kind === 'efir');
  const wolf = c.units.find((x) => x.side === 'mob');
  const arcsOf = (slice) => slice.calls.filter((x) => x[0] === 'arc');

  // Якорь ДО триггера: рендер без «arc», c._fx.breath не записано.
  const pre = tickSlice(S.canvas, S.rafStubs);
  assert.equal(arcsOf(pre).length, 0,
    'до триггера — «arc» в рендере нет: '
    + JSON.stringify(pre.calls.map((x) => x[0])));
  assert.equal(c._fx && c._fx.breath, undefined,
    'c._fx.breath не записано до триггера');

  // Триггер (ядро 000113 — НЕ ТРОГАЕТСЯ): HP игрока 40% (10/25 = 0.4
  // ТОЧНО), мана Эфира 20 (buildEfirUnit переписал u.mp — L1: 11),
  // волк далеко, c._rng — промахи (изоляция).
  c.player.hp = 10;
  u.mp = 20;
  wolf.x = 0; wolf.y = 0;
  c._rng = () => 0.99;
  press(S.keydown, 'Space'); // endTurn → алли-фаза → «Вдох» (ВЕСЬ ход)

  // Ядро 000113 (зелёные пины — механика без изменений):
  assert.equal(c.efirBreathed, true, 'ядро: c.efirBreathed (000113)');
  assert.ok(c.log.includes('Вдох Эфира!'),
    'ядро: «Вдох Эфира!» в логе: ' + c.log.join(' | '));
  assert.equal(u.mp, 0, 'ядро: мана 20 израсходована (mpCost)');

  // UI 000118: заявка c._fx.breath {at, until: at + 600} (BREATH_FX_MS)
  // — edge-detect в render (синхронный render внутри handleCode ПОСЛЕ
  // c.endTurn — UI видит переключение c.efirBreathed при рендере).
  // Под-объект, НЕ слот действия героя {action, until}: hero-ветка
  // drawUnits читает c._fx.action — undefined → 'idle' (бит-в-бит).
  assert.ok(c._fx && c._fx.breath,
    'c._fx.breath — заявка после триггера: ' + JSON.stringify(c._fx));
  assert.equal(c._fx.breath.at, NOW84, 'at = фикс. now (детерминизм)');
  assert.equal(c._fx.breath.until - c._fx.breath.at, 600,
    'until = at + 600 (BREATH_FX_MS = 2×FX_MS)');

  // FX-слой (000114 §4: эффекты ПОВЕРХ всех слоёв юнита, вызов в
  // render() ПОСЛЕ drawUnits): «arc» появляется в drawCalls;
  // палитра — ТОЛЬКО ALLY_MARKER '#8cf2fc' /
  // ALLY_MARKER_UNDERLAY 'rgba(140, 242, 252, 0.25)'.
  const t1 = tickSlice(S.canvas, S.rafStubs);
  assert.ok(arcsOf(t1).length > 0,
    '«arc» в drawCalls после триггера: '
    + JSON.stringify(t1.calls.map((x) => x[0])));
  const styled1 = styledCalls(t1.events);
  assert.ok(styled1.some((x) => x.name === 'arc'
    && x.strokeStyle === '#8cf2fc'),
    'arc — strokeStyle #8cf2fc (ALLY_MARKER)');
  assert.ok(styled1.some((x) => x.name === 'arc'
    && x.fillStyle === 'rgba(140, 242, 252, 0.25)'),
    'arc — fillStyle rgba(140, 242, 252, 0.25) (ALLY_MARKER_UNDERLAY)');

  // Экспирация без sleep: until в прошлое → следующий render БЕЗ
  // новых «arc» (ранний возврат drawBreathFx по now >= until).
  c._fx.breath.until = NOW84 - 1;
  const t2 = tickSlice(S.canvas, S.rafStubs);
  assert.equal(arcsOf(t2).length, 0,
    '«arc» после истечения until — нет: '
    + JSON.stringify(t2.calls.map((x) => x[0])));

  // One-shot ядра (000113): повторный Space (mp 0) — НОВОЙ заявки
  // fx нет (тот же объект — edge не срабатывает повторно).
  const ref = c._fx.breath;
  press(S.keydown, 'Space');
  assert.equal(c._fx.breath, ref,
    'повторное нажатие — без НОВОЙ заявки c._fx.breath (one-shot ядра)');

  // FX-НЕГАТИВ — три под-сцены БЕЗ триггера: c.efirBreathed
  // undefined, c._fx.breath undefined, «arc» нет (endTurn — действие
  // ИГРОКА, hero-fx c._fx не пишет — негативный контроллер).
  const negScene = (N, setup) => {
    const nc = N.c;
    const nu = nc.units.find((x) => x.kind === 'efir');
    const nw = nc.units.find((x) => x.side === 'mob');
    setup(nc, nu, nw);
    press(N.keydown, 'Space');
    const tn = tickSlice(N.canvas, N.rafStubs);
    assert.equal(nc.efirBreathed, undefined,
      'без триггера: c.efirBreathed undefined: ' + JSON.stringify(nc.log));
    assert.equal(nc._fx && nc._fx.breath, undefined,
      'без триггера: c._fx.breath не записано');
    assert.equal(tn.calls.filter((x) => x[0] === 'arc').length, 0,
      'без триггера: «arc» в рендере нет');
  };
  // (A) мана 19 (< 20 — mpCost):
  negScene(scene84({ efir: true }), (nc, nu, nw) => {
    nc.player.hp = 10; nu.mp = 19; nw.x = 0; nw.y = 0;
    nc._rng = () => 0.99;
  });
  // (B) полный HP (frac 1.0 > 0.4 — playerFrac):
  negScene(scene84({ efir: true }), (nc, nu, nw) => {
    nu.mp = 20; nw.x = 0; nw.y = 0; nc._rng = () => 0.99;
  });
  // (C) без Эфира в сцене (opts.withEfir нет):
  negScene(scene84(), (nc, nu, nw) => {
    nc.player.hp = 10; nc._rng = () => 0.99;
  });
});

test('боевой UI: 000118 — c.log: строки действий Эфира по паттернам ТЗ (CU118-LOG)', () => {
  // Белый каталог ВНУТРИ теста (паттерн 000111 T9): vm-цепочка НЕ
  // грузит spells-data.js/spells.js → G.combatInternals.allySpells
  // undefined → ИИ Эфира не кастует (melee-фолбэк 000080). Каждый
  // под-сценарий — своя песочница (своё G); restore в finally.
  const catalog = require('../src/spells-data.js').SPELLS_BY_ID;
  const mkLogScene = () => {
    const L = scene84({ efir: true });
    const saved = L.G.combatInternals.allySpells;
    L.G.combatInternals.allySpells = catalog;
    return { L, saved };
  };
  const savedCats = [];
  try {
    // (1) heal — игрок 17/25 (frac 0.68 ≤ 0.7), волк ДАЛЕКО
    //     (d 9 > SPELL_MAX_DIST 4): приоритет (1) — самое сильное
    //     известное лечебное (mend, L1: round(3 + 0.5·3 + 1) = 6):
    //     «Эфир исцеляет Флогистон (+6).»
    {
      const { L, saved } = mkLogScene();
      savedCats.push([L.G, saved]);
      const c = L.c;
      const w = c.units.find((x) => x.side === 'mob');
      w.x = 0; w.y = 0;
      c.player.hp = 17;
      c._rng = () => 0.99;
      press(L.keydown, 'Space');
      assert.ok(c.log.includes('Эфир исцеляет Флогистон (+6).'),
        'heal — паттерн ТЗ «Эфир исцеляет <имя> (+N).»: '
        + c.log.join(' | '));
    }
    // (2) cast — игрок ПОЛНЫЙ HP (лечения нет), волк d 2 (≤ 4):
    //     приоритет (3) — урон-каст (spark, L1: round((3 + 0.5·3)·
    //     (1 + 0.05·0)) = 5, ВСЕГДА попадает, игнор брони):
    //     «Эфир: «Искра» — Волк: 5.» (em-dash U+2014).
    {
      const { L, saved } = mkLogScene();
      savedCats.push([L.G, saved]);
      const c = L.c;
      const w = c.units.find((x) => x.side === 'mob');
      w.x = c.px; w.y = c.py - 2; // d 2 от игрока; d 2 от Эфира (px−1,py−1)
      c._rng = () => 0.99;
      press(L.keydown, 'Space');
      assert.ok(c.log.includes('Эфир: «Искра» — Волк: 5.'),
        'cast — паттерн ТЗ «Эфир: «<заклинание>» — <имя>: N.»: '
        + c.log.join(' | '));
    }
    // (3) touch — волк d 1 от Эфира, книга [] (урон-каста НЕТ):
    //     приоритет (4) — «Касание духа» (u.damage, L1: max(1,
    //     round((2 + 0.5·3)·1)) = 4): «Касание духа: 4.»
    {
      const { L, saved } = mkLogScene();
      savedCats.push([L.G, saved]);
      const c = L.c;
      const u = c.units.find((x) => x.kind === 'efir');
      const w = c.units.find((x) => x.side === 'mob');
      u.spells = []; // без каталога-кандидатов урона — каст невозможен
      w.x = c.px; w.y = c.py - 1; // вплотную к Эфиру (px−1, py−1): d 1
      c._rng = () => 0.99;
      press(L.keydown, 'Space');
      assert.ok(c.log.includes('Касание духа: 4.'),
        'touch — паттерн ТЗ «Касание духа: N.»: ' + c.log.join(' | '));
    }
    // (4) «Вдох Эфира!» (000113, ЗЕЛЁНЫЙ якорь — строка уже в
    //     efir.js u.breath.logLine; краснота теста — за счёт (1)–(3)).
    {
      const { L, saved } = mkLogScene();
      savedCats.push([L.G, saved]);
      const c = L.c;
      const u = c.units.find((x) => x.kind === 'efir');
      const w = c.units.find((x) => x.side === 'mob');
      w.x = 0; w.y = 0;
      c.player.hp = 10; // 10/25 = 0.4 (playerFrac)
      u.mp = 20;        // mpCost
      c._rng = () => 0.99;
      press(L.keydown, 'Space');
      assert.ok(c.log.includes('Вдох Эфира!'),
        '«Вдох Эфира!» (000113 — строка уже в master): '
        + c.log.join(' | '));
    }
  } finally {
    for (const [Gx, saved] of savedCats) Gx.combatInternals.allySpells = saved;
  }
});

test('боевой UI: 000118 — HUD: подсказка состава отряда в .combat-state (имя (роль) юнитов side «ally») (CU118-HUD)', () => {
  const S = scene84({ efir: true });
  addMerc84(S.c, S.G, 5, 2, 'ranged'); // Орк (дальний бой) — 000080
  tickSlice(S.canvas, S.rafStubs);
  const state = findByClass(S.body, 'combat-state');
  assert.ok(state, '.combat-state в оверлее');
  const text = state.textContent;
  assert.ok(text.includes('Отряд:'),
    'строка «Отряд:» в .combat-state: ' + JSON.stringify(text));
  assert.ok(text.includes('Эфир (поддержка)'),
    'Эфир: имя + роль (ROLE_NAMES.support): ' + JSON.stringify(text));
  assert.ok(text.includes('Орк (дальний бой)'),
    'наёмник: имя + роль (ROLE_NAMES.ranged): ' + JSON.stringify(text));
  // Без союзников — строки НЕТ (существующий вывод бит-в-бит).
  const P = scene84();
  const state2 = findByClass(P.body, 'combat-state');
  assert.ok(!state2.textContent.includes('Отряд:'),
    'без союзников — строки «Отряд:» нет: '
    + JSON.stringify(state2.textContent));
});

test('боевой UI: 000118 — первая встреча (вариант (а)): флаг «уже встречались» (opts.efirMet — из сейва) — строки НЕТ при ЦЕЛОМ модульном one-shot (CU118-FE2)', () => {
  // СВЕЖАЯ песочница: модульный one-shot efir.js ЦЕЛ (строка
  // повторилась бы, если бы преградой был ТОЛЬКО сессионный флаг
  // 000113). opts.efirMet: true — имитация «сейв с флагом
  // восстановлен»: шов (main.js efirMet → combat-ui opts →
  // createCombat) обязан срезать строку ДО one-shot.
  const { G } = loadCombatUi(true, { withEfir: true });
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
    efir: G.efir.createEfir(),
    efirMet: true,
  });
  assert.ok(c, 'бой создан (неизвестный опс — без краха)');
  assert.ok(c.units.some((x) => x.id === 'efir' && x.side === 'ally'),
    'Эфир в бою (шов не прячет союзника)');
  assert.ok(!c.log.includes(EFIR_LINE118),
    'флаг true — строки первой встречи НЕТ (one-shot цел, флаг режет шов): '
    + c.log.join(' | '));
});

test('боевой UI: 000118 — первая встреча (ГВАРД 000113): строка только в ПЕРВОМ бою сессии (модульный one-shot), во втором — нет (CU118-FE1)', () => {
  // ОДНА песочница (один модуль efir.js): бой №1 — строка; бой №2 —
  // one-shot съеден, строки нет. Зелёный фиксатор: шов варианта (а)
  // (createCombat) не должен сломать сессионное поведение 000113.
  const { G, keydown } = loadCombatUi(true, { withEfir: true });
  const mk = (seed) => G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed,
    efir: G.efir.createEfir(),
  });
  const close = (x) => {
    x.result = { outcome: 'victory', xp: 0, gold: 0, defeated: 0, allyXp: [] };
    press(keydown, 'Escape');
  };
  const c1 = mk(42);
  assert.ok(c1, 'бой 1');
  assert.ok(c1.log.includes(EFIR_LINE118),
    'бой 1: строка первой встречи: ' + c1.log.join(' | '));
  close(c1);
  const c2 = mk(7);
  assert.ok(c2, 'бой 2 (та же песочница — one-shot съеден)');
  assert.ok(!c2.log.includes(EFIR_LINE118),
    'бой 2: строки НЕТ (one-shot 000113): ' + c2.log.join(' | '));
});

// --- Рендер в текущем масштабе отображения (задача 000151) ---
//
// ТЗ: «Для экрана боя добавить рендер текстур персонажей и мобов в
// соответствии с текущим масштабом отображения, сейчас Флогистон и
// мобы выглядят мыльными на больших экранах (десктоп, планшет)».
// Контракт (memory/000151-combat-scale.md, D1-D16) — бэкинг = размер
// отображения × dpr (кап MAX_SCALE = 8), весь рендер — в логических
// единицах (клетки × CELL) через g2.setTransform(sx, 0, 0, sy, 0, 0);
// клик — по логическому baseW; resize — top-level слушатель рядом с
// keydown; чистая функция — src/combat-scale.js (P1-P7 —
// tests/combat-scale.test.js).
//
// КРАСНЫЕ (TDD, R1-R3): падают, потому что функциональности НЕТ в
// неизменённом коде (осмысленная причина — отсутствие, не синтаксис):
//  * R1: build() УСТАНОВЛЕННО ставит canvas.width/height = 336 и НЕ
//    измеряет getBoundingClientRect (единственный rect-рид — клик) →
//    «expected 672, actual 336»;
//  * R2: setTransform/scale по src/ — ПУСТО (grep), bitmap-строки
//    (база/фон/сетка) — в canvas.width/height, герой — 55.2 без
//    трансформа → «setTransform(2,0,0,2,0,0) отсутствует ДО первого
//    fillRect»;
//  * R3: window.addEventListener в src/combat-ui.js — ТОЛЬКО 'keydown'
//    → «resize-слушатель не зарегистрирован».
// ЯКОРЯ (A1-A3): ЗЕЛЁНЫЕ с момента написания (страхуют бит-в-бит при
// s = 1, D5-перебазу клика, фолбэк lenient-rect); в red-count НЕ
// входят. vm-правила 000082: ассерты — примитивы/сигнатуры.

test('боевой UI: 000151 R1 — displaySize 672 (rect ×2) → бэкинг canvas 672×672', () => {
  // Ядро красного ТЗ: бэкинг следует за ТЕКУЩИМ масштабом
  // отображения (rect·dpr, кап 8), а не фиксированный 336 (000124).
  // displaySize 672, dpr отсутствует в песочнице (typeof-гард → 1):
  // s = 672/336 = 2 → бэкинг = 336·2 = 672 ТОЧНО (кап не срабатывает).
  const { G, body } = loadCombatUi(true, { displaySize: 672 });
  G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  const canvas = findCanvas(body);
  assert.ok(canvas, 'canvas боевой мини-карты создан');
  assert.equal(canvas.width, 672,
    'бэкинг = отображение 672 (rect ×2); факт: ' + canvas.width);
  assert.equal(canvas.height, 672,
    'бэкинг = отображение 672; факт: ' + canvas.height);
});

test('боевой UI: 000151 R2 — e2e размера отрисованного спрайта ×2: setTransform до fillRect, фон 336 логический → device 672, герой CELL·1.15 логический (≈55.2) → device ≈110.4', () => {
  // Ядро красного ТЗ: «vm-e2e-проверка размера отрисованного спрайта»
  // — текстуры (фон, Флогистон) рисуются в ЛОГИЧЕСКИХ координатах,
  // трансформ ×2 растит всё до device 672: резкость на больших
  // экранах (движок растрит SVG в drawImage в целевом device-размере).
  const NOW = 1000;
  const { G, body } = loadCombatUi(true, {
    displaySize: 672,
    performance: { now: () => NOW },
  });
  const fakeBg = { __fake: 'bg-grass' }, fakeHero = { __fake: 'hero' };
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
    terrain: G.TERRAIN.GRASS,
    spriteLoader: {
      image: (p) => {
        if (p === 'assets/combat/bg/grass.svg') return fakeBg;
        if (p.startsWith('assets/sprites/phlogiston/idle_')) return fakeHero;
        return null;
      },
    },
  });
  const canvas = findCanvas(body);
  assert.equal(canvas.width, 672, 'бэкинг 672 (R1)');
  assert.equal(canvas.height, 672, 'бэкинг 672 (R1)');
  const calls = canvas.drawCalls;
  // (a) АБСОЛЮТНЫЙ трансформ ×2 — в НАЧАЛЕ render, ДО первого
  // fillRect (после сброса контекста при resize — самовосстановление).
  const iST = calls.findIndex((x) => x[0] === 'setTransform'
    && x[1].length === 6 && x[1][0] === 2 && x[1][1] === 0
    && x[1][2] === 0 && x[1][3] === 2 && x[1][4] === 0 && x[1][5] === 0);
  const iBase = calls.findIndex((x) => x[0] === 'fillRect');
  assert.ok(iST >= 0,
    'setTransform(2, 0, 0, 2, 0, 0) в drawCalls (масштаб ×2) — '
    + 'факт: ' + JSON.stringify(calls.map((x) => x[0]).slice(0, 4)));
  assert.ok(iST < iBase,
    'setTransform — ДО первого fillRect: iST ' + iST + ' vs iBase '
    + iBase);
  // (b) фон НЕ обрезан и не заложен в s² площади: destination —
  // ЛОГИЧЕСКИЙ 336, × трансформ = device 672 = бэкинг. Ловит и
  // «фон в device 672 под трансформом» (672·2 = 1344 ≠ 672), и
  // «336 без трансформа» (бэкинг 336 ≠ 672).
  const bgDi = calls.find((x) => x[0] === 'drawImage' && x[1][0] === fakeBg);
  assert.ok(bgDi, 'фон отрисован (drawImage)');
  assert.equal(bgDi[1][3], 336,
    'фон: ширина — ЛОГИЧЕСКАЯ 336 (не device 672 под трансформом); '
    + 'факт: ' + bgDi[1][3]);
  assert.equal(bgDi[1][3] * 2, canvas.width,
    'фон: логика 336 × 2 = device 672 = бэкинг (фон не обрезан)');
  // (c) базовая заливка — логические W/H (336×336), не бэкинг.
  assert.deepEqual(calls[iBase][1], [0, 0, 336, 336],
    'база fillRect(0, 0, 336, 336) — логические W/H: '
    + JSON.stringify(calls[iBase][1]));
  // (d) герой: drawImage в ЛОГИЧЕСКИХ (hx−size/2, hy−size/2, size,
  // size), size = CELL·1.15 (48·1.15 = 55.199999999999996 — double,
  // ≈55.2; ревью-правок 000151: код — `CELL * 1.15` как до задачи,
  // допуск вместо строгого 55.2) → device-размер ≈55.2·2 = 110.4
  // (цель ТЗ: «не мыльные»).
  const heroDi = calls.find((x) => x[0] === 'drawImage'
    && x[1][0] === fakeHero);
  assert.ok(heroDi, 'спрайт героя отрисован (drawImage)');
  const hx = (c.px + 0.5) * 48, hy = (c.py + 0.5) * 48;
  const hsize = 48 * 1.15; // то же выражение, что в коде (CELL·1.15)
  assert.equal(heroDi[1][1], hx - hsize / 2,
    'герой: x — ЛОГИЧЕСКИЙ (центр клетки − size/2); факт: '
    + heroDi[1][1]);
  assert.equal(heroDi[1][2], hy - hsize / 2,
    'герой: y — ЛОГИЧЕСКИЙ; факт: ' + heroDi[1][2]);
  assert.ok(Math.abs(heroDi[1][3] - 55.2) < 1e-9,
    'герой: ширина — ЛОГИЧЕСКАЯ ≈55.2 (не device 110.4); '
    + 'факт: ' + heroDi[1][3]);
  assert.ok(Math.abs(heroDi[1][4] - 55.2) < 1e-9,
    'герой: высота — ЛОГИЧЕСКАЯ ≈55.2; факт: ' + heroDi[1][4]);
  assert.ok(Math.abs(heroDi[1][3] * 2 - 110.4) < 1e-9,
    'герой: device-размер = ≈55.2 × 2 ≈ 110.4 (резкость на ×2); '
    + 'факт: ' + heroDi[1][3] * 2);
});

test('боевой UI: 000151 R3 — window «resize» в бою: canvas переизмерен под новый размер отображения + перерисован', () => {
  // ТЗ «с учётом ТЕКУЩЕГО масштаба отображения»: масштаб меняется
  // ресайзом окна (CSS 000124 отвечает мгновенно) — слушатель рядом с
  // keydown (паттерн: один раз при загрузке, guard isActive внутри,
  // в finish() НЕ снимается). Прецедент поведения — dungeon-ui.js
  // step() ресайзит canvas под вьюпорт.
  const { G, body, winListeners } = loadCombatUi();
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  assert.ok(c, 'бой создан');
  const canvas = findCanvas(body);
  assert.equal(canvas.width, 336, 'старт: дефолтный бэкинг 336 (rect 1:1)');
  assert.ok(Array.isArray(winListeners.resize)
    && winListeners.resize.length > 0,
    'window «resize»-слушатель зарегистрирован (combat-ui.js)');
  const n0 = canvas.drawCalls.length;
  // Отображение выросло: rect 672 (CSS отвечает мгновенно).
  canvas.getBoundingClientRect
    = () => ({ left: 0, top: 0, width: 672, height: 672 });
  winListeners.resize[0]();
  assert.equal(canvas.width, 672,
    'после resize бэкинг переизмерен до 672; факт: ' + canvas.width);
  assert.equal(canvas.height, 672,
    'после resize бэкинг переизмерен до 672; факт: ' + canvas.height);
  assert.ok(canvas.drawCalls.length > n0,
    'resize вызвал перерисовку (render)');
  assert.equal(G.combatUI.isActive(), true,
    'бой активен (оверлей не закрыт resize-обработчиком)');
});

test('боевой UI: 000151 A1 — якорь 1:1 (дефолтный стаб): бэкинг 336×336, трансформ-вызовов НЕТ, база fillRect(0, 0, 336, 336)', () => {
  // Страховка D7: трансформ — ТОЛЬКО при sx≠1||sy≠1; при 1:1 вызова
  // НЕТ → пины индексов drawCalls (calls[0]=fillRect, calls[1]=фон)
  // всех 54 существующих тестов бит-в-бит (не добавлять в render()
  // НИКАКИХ безусловных вызовов контекста).
  const { G, body } = loadCombatUi();
  G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  const canvas = findCanvas(body);
  assert.equal(canvas.width, 336, '1:1: бэкинг 336 (живой rect = 336)');
  assert.equal(canvas.height, 336, '1:1: бэкинг 336');
  const calls = canvas.drawCalls;
  assert.ok(!calls.some((x) => x[0] === 'setTransform' || x[0] === 'scale'),
    '1:1: setTransform/scale в drawCalls НЕТ (no-op-трансформ '
    + 'пропускается); факт: '
    + JSON.stringify(calls.map((x) => x[0]).slice(0, 4)));
  assert.equal(calls[0][0], 'fillRect',
    'первый вызов — базовый fillRect (индексы бит-в-бит)');
  assert.deepEqual(calls[0][1], [0, 0, 336, 336],
    'база fillRect(0, 0, 336, 336)');
});

test('боевой UI: 000151 A2 — якорь клика на УВЕЛИЧЕННОМ canvas: rect 672×672, клик (144, 240) → волк (1,2)', () => {
  // Страховка D5 (КРИТИЧЕСКАЯ ПРАВКА): числитель нормализации —
  // ЛОГИЧЕСКИЙ baseW (c.width·CELL), НЕ canvas.width. При бэкинге
  // 672 старая формула (canvas.width/rw = 1) даст клетку 3 — промах
  // на s клеток; новая (baseW/rw = 0.5) → (1,2). При s = 1: baseW ===
  // canvas.width → бит-в-бит (3 клика-теста 000124 без правок).
  const { G, body } = loadCombatUi(true, { displaySize: 672 });
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  const wolf = c.units.find((u) => u.mobId === 'wolf');
  wolf.x = 1; wolf.y = 2; // 1×1 в клетке (1,2)
  // createCombat автоматически берёт ближайшего моба целью
  // (combat.js) — снимаем, чтобы клик должен был ВЫБРАТЬ цель.
  c.targetId = null;
  assert.equal(c.targetId, null, 'до клика цели нет');
  const canvas = findCanvas(body);
  // Центр клетки (1,2) в экранных координатах (rect 672, 96 экранных
  // px на клетку): (1.5·96, 2.5·96) = (144, 240).
  canvas.listeners.click[0]({ clientX: 144, clientY: 240 });
  assert.equal(c.targetId, wolf.id,
    'клик (144,240) при rect 672×672 → волк (1,2) — независимо от '
    + 'масштаба; факт: ' + c.targetId);
});

test('боевой UI: 000151 A3 — якорь фолбэка: lenient rect (без width/height) на build → 336×336, render без ошибок', () => {
  // Страховка фолбэка build(): rect без размеров (lenient-стабы
  // main-visuals/companions-cycle/dungeon-vision — {left:0, top:0},
  // проверено; нулевой rect 000124) → r.width undefined → 1:1,
  // бит-в-бит (s=1 — их поведение неизменно после 000151).
  const { G, body } = loadCombatUi(true, { lenientRect: true });
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  assert.ok(c, 'бой создан (lenient rect — без краха)');
  const canvas = findCanvas(body);
  assert.equal(canvas.width, 336, 'фолбэк: бэкинг = база 336');
  assert.equal(canvas.height, 336, 'фолбэк: бэкинг = база 336');
  assert.ok(canvas.drawCalls.length > 0, 'render отрисовал слои');
});

test('боевой UI: 000151 A4 — якорь dpr: displaySize 336 + devicePixelRatio 2 → бэкинг 672×672, setTransform(2, 0, 0, 2, 0, 0)', () => {
  // Страховка D2 (dpr в формуле): Retina-экран с отображением 336 CSS
  // px — бэкинг = 336·2 = 672 (1:1 в device-пикселях, «не мыльные» на
  // основной аудитории ТЗ), трансформ ×2 растит логические координаты.
  // e2e-проверка vm-стаба opts.devicePixelRatio (D13(b), ранее
  // не использовалась; ревью-правки 000151): window.devicePixelRatio
  // в песочнице → measureBacking → computeBacking(…, dpr 2).
  const { G, body } = loadCombatUi(true, {
    displaySize: 336, devicePixelRatio: 2,
  });
  G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  const canvas = findCanvas(body);
  assert.equal(canvas.width, 672,
    'бэкинг = 336·2 = 672 (dpr в формуле); факт: ' + canvas.width);
  assert.equal(canvas.height, 672,
    'бэкинг = 336·2 = 672 по высоте; факт: ' + canvas.height);
  const iST = canvas.drawCalls.findIndex(
    (x) => x[0] === 'setTransform'
    && x[1].length === 6 && x[1][0] === 2 && x[1][1] === 0
    && x[1][2] === 0 && x[1][3] === 2 && x[1][4] === 0 && x[1][5] === 0);
  assert.ok(iST >= 0,
    'setTransform(2, 0, 0, 2, 0, 0) в drawCalls (dpr-масштаб ×2); '
    + 'факт: '
    + JSON.stringify(canvas.drawCalls.map((x) => x[0]).slice(0, 4)));
  const iBase = canvas.drawCalls.findIndex((x) => x[0] === 'fillRect');
  assert.ok(iST < iBase,
    'setTransform — ДО первого fillRect (ядро R2); iST ' + iST
    + ' vs iBase ' + iBase);
});

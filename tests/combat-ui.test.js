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
  // 000182 (CU182-LW) — ТЕХНИЧЕСКОЕ дополнение (все существующие
  // журналы НЕ тронуты): lineWidthSets — журнал присвоений lineWidth
  // [value, evIdx] (evIdx — индекс в events, где присвоение
  // «происходит» = events.length в момент set; стиль действует на
  // события с индексом ≥ evIdx). ОТДЕЛЬНЫЙ массив, НЕ в events/
  // styleCalls: иначе styledCalls/hatchCallIdx175 сочли бы присвоение
  // strokeStyle и ВСЕ z-порядок-пины (000050 lastGridStroke, H1/H6,
  // R5-слайсы) сдвинулись бы.
  const lineWidthSets = el.lineWidthSets = [];
  // 000204 (CU204-*) — ТЕХНИЧЕСКОЕ дополнение (все существующие
  // журналы НЕ тронуты): textStyleSets — журнал присвоений font/textAlign
  // [prop, value]. ОТДЕЛЬНЫЙ массив, НЕ в events/styleCalls/lineWidthSets:
  // пуш в events сдвинул бы evIdx-пины 000175/000182 (H1/H6, R5-слайсы)
  // и итерацию styledCalls (прецедент 000182: отдельный массив). Пины:
  // '6px ui-monospace, monospace' + textAlign 'right' — уровень мобов/
  // спутников в правом верхнем углу тайла (контракт
  // memory/000204-combat-level-corner.md).
  const textStyleSets = el.textStyleSets = [];
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
      if (k === 'lineWidth') {
        lineWidthSets.push([v, events.length]);
      }
      if (k === 'font' || k === 'textAlign') {
        textStyleSets.push([k, v]);
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
// opts.withSpells (000149, по умолчанию false) — spells-data.js +
// spells.js в цепочку ПОСЛЕ combat.js (позиции index.html L807-809):
// тесты книги заклинаний. Без параметра — старая цепочка бит-в-бит
// (000118: ИИ Эфира без каталога — melee-фолбэк, см. CU118-LOG).
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
  for (const f of ['items.js', 'controls.js', 'combat.js']) {
    vm.runInContext(src(f), sandbox, { filename: f });
  }
  if (opts.withSpells) {
    // 000149: каталожная магия — ПОСЛЕ combat.js (позиции index.html
    // L807-809): строки книги читают Game.SpellsData и кастуют через
    // Game.Spells (движок 000045). Существующие тесты флаг НЕ
    // передают → старая цепочка бит-в-бит (000118).
    for (const f of ['spells-data.js', 'spells.js']) {
      vm.runInContext(src(f), sandbox, { filename: f });
    }
  } else if (opts.spellsDataOnly) {
    // 000188 (CU188-ROWCHK, M5): каталог ТОЛЬКО (spells-data.js) —
    // та же позиция цепи, что и withSpells (ПОСЛЕ combat.js, ДО
    // spellbook.js и снапшота combat-ui.js — UMD-ловушка 000038):
    // в снапшоте есть G.SpellsData, НЕТ G.Spells (spells.js
    // пропущен) — ровно состояние rowChk (src/combat-ui.js
    // L1673-1679). Приоритет: withSpells (пара файлов) первым;
    // дефолт (опция не передана) — цепочка бит-в-бит.
    vm.runInContext(src('spells-data.js'), sandbox,
      { filename: 'spells-data.js' });
  }
  vm.runInContext(src('combat-keys.js'), sandbox, { filename: 'combat-keys.js' });
  // 000149: spellbook.js — ДО combat-ui.js (снапшот-ловушка 000038).
  // Красная фаза: файла нет — тихий пропуск (existsSync-гард, паттерн
  // withEfir 000081): осмысленный красный несёт tests/spellbook.test.js,
  // а не ENOENT-крах всех тестов этого файла.
  if (fs.existsSync(path.join(ROOT, 'src', 'spellbook.js'))) {
    vm.runInContext(src('spellbook.js'), sandbox, { filename: 'spellbook.js' });
  }
  if (opts.withAllySpells) {
    // 000193: ally-spells.js — ПОСЛЕ spells/spellbook, ПЕРЕД combat-ui
    // (G-снапшот — UMD-ловушка 000038; паттерн withSpells/withEfir).
    // Старые тесты опцию НЕ передают → цепи бит-в-бит (модуль не
    // грузится → деградация-ветки rowChk/castRow с тем же title, что
    // давал гейт 000179). existsSync-гард (паттерн spellbook.js выше).
    if (fs.existsSync(path.join(ROOT, 'src', 'ally-spells.js'))) {
      vm.runInContext(src('ally-spells.js'), sandbox,
        { filename: 'ally-spells.js' });
    }
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
  // 000182 (CU182-D10, ТОЛЬКО техническая опция): UMD-ловушка 000038 —
  // combat-ui.js снимает Game ОДИН раз при загрузке (const G =
  // globalThis.Game): «отсутствие» G.mobReachCells видно ему ТОЛЬКО
  // при load-time удалении (до runInContext combat-ui.js); post-boot
  // delete бесполезен (снапшот уже снят). Дефолт (опция не передана) —
  // цепочка бит-в-бит.
  if (opts.withoutMobReach) delete sandbox.Game.mobReachCells;
  vm.runInContext(src('combat-ui.js'), sandbox, { filename: 'combat-ui.js' });
  // 000174 (ТОЛЬКО техническая проводка, зеркало index.html 1035/1039):
  // motion.js — ПОСЛЕ combat-ui.js (UMD-ловушка 000038: combat-ui.js
  // снимает Game один раз при загрузке — G.motion в снапшоте отсутствует
  // ВСЕГДА; чтение — только лениво в момент вызова, liveGame()). Чистый
  // UMD без зависимостей — загрузка в песочнице чистая (прецедент
  // цепочки tests/dungeon-ui.test.js: motion.js в конце, порядок
  // index.html). Аудит фиксаторов: ни один существующий тест не зависит
  // от отсутствия Game.motion в песочнице.
  // 000182 (CU182-NOMOTION, ТОЛЬКО техническая опция): пропуск
  // motion.js — песочница без ленивого модуля: liveGame() его не
  // найдёт → оба фолбэка combat-ui.js (mobAnchor — модельный тайл
  // self-clean; startMoveAnims — from = beforePos). Дефолт (опция не
  // передана) — цепочка бит-в-бит.
  if (!opts.withoutMotion) {
    vm.runInContext(src('motion.js'), sandbox, { filename: 'motion.js' });
  }
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

test('боевой UI: кнопки панели действий собраны из таблицы (7 штук)', () => {
  const { G, keydown, buttons } = loadCombatUi();
  assert.ok(G.combatUI, 'Game.combatUI создан (загрузка в правильном порядке)');
  assert.equal(keydown.length, 1, 'keydown-обработчик зарегистрирован');
  // Кнопки создаёт build() при старте боя.
  G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  // 000149: «Огонь» + «Исцел.» сдвинуты в одну кнопку «Книга
  // заклинаний» — действий 8 → 7.
  assert.equal(buttons.length, 7,
    'кнопок действий = 7 (таблица combat-keys.js, задача 000149)');
  const acts = buttons.map((b) => b.dataset.act).sort();
  assert.deepEqual(acts, [
    'attack', 'block', 'endTurn', 'flee', 'invItem', 'quickItem', 'spellbook',
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
  assert.deepEqual(added, ['Гигантский паук промахивается.', 'Волк промахивается.'],
    'одна волна ходов мобов, по одной строке, в порядке ИНИЦИАТИВЫ (000167: паук 4 > волк 3, pre-roll уже отстрелял их долю round 1): '
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

test('боевой UI: c._fx — cast после успешного заклинания из книги (spark) (000149)', () => {
  const NOW = 1000;
  // 000149: KeyQ больше не кастует «огонь» напрямую — он открывает
  // книгу заклинаний; каст — кликом по строке.
  const { G, keydown, body } = loadCombatUi(true, {
    performance: { now: () => NOW }, withSpells: true,
  });
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  const m0 = c.units[0];
  m0.x = c.px; m0.y = c.py - 1;
  c._rng = () => 0.99;
  c.selectTarget(m0.id);
  assert.equal(c._fx, undefined, 'c._fx не записано до заклинания');
  press(keydown, 'KeyQ'); // книга заклинаний (000149) — открылась
  const bookBox = findByClass(body, 'combat-spellbook');
  assert.ok(bookBox,
    'книга заклинаний (.combat-spellbook) не найдена в .combat-side (задача 000149)');
  assert.notEqual(bookBox.style.display, 'none', 'книга открыта (KeyQ)');
  const sparkRow = bookBox.children.slice(-2)
    .find((rw) => rw.dataset.spell === 'spark');
  assert.ok(sparkRow, 'строка «Искра» не найдена в книге (задача 000149)');
  sparkRow.listeners.click[0](); // каст — кликом по строке
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
  // (fillText в углу тайла, 000204), подсветки цели (strokeRect).
  assert.ok(!calls.some((x) => x[0] === 'fillRect'
    && x[1][0] === wolf.x * 48 + 8 && x[1][1] === wolf.y * 48 + 2 && x[1][3] === 4),
    'у трупа нет HP-полосы');
  assert.ok(!calls.some((x) => x[0] === 'fillText'
    && x[1][1] === wolf.x * 48 + 44 && x[1][2] === wolf.y * 48 + 12),
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
// z-порядок: фон → сетка (stroke) → [штриховка 000175] → препятствия
// → юниты → эффекты. «Последний stroke сетки» — последний 'stroke'
// СЕТИ (grid-секция: lineWidth L1368, strokes L1373/L1379); с 000175
// после сетки идут ДОПОЛНИТЕЛЬНЫЕ 'stroke' — штрихи штриховки зоны
// досягаемости выбранного моба (рисуется МЕЖДУ сеткой и
// препятствиями) → общий последний 'stroke' сцены может быть
// штрихом штриховки. Пин iObs > lastGridStroke валиден без правок:
// штриховка идёт ДО препятствий.
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
  assert.equal(buttons.length, 7,
    'кнопок действий = 7 (таблица combat-keys.js, задача 000149)');
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
    // Текстовой (СЛОВЕСНОЙ) подписи (и клавиши-подсказки [J] и т.п.)
    // НЕТ. Ре-пин 000199 (ТЗ: количество действий — ЧИСЛОМ на
    // соотв. кнопке): единственное допущенное текстовое содержимое
    // «Удара»/«Книги заклинаний» — числовой счётчик (бейдж
    // .combat-actcount); на остальных 5 кнопках бейджа НЕТ и
    // textContent '' (vm-стаб НЕ пересчитывает textContent кнопки из
    // children — бейдж читается как child, ловушка spellbook.test.js
    // L27; в реальном DOM button.textContent = текст бейджа).
    const cntBadge = b.children
      .find((ch) => ch.className === 'combat-actcount');
    if (b.dataset.act === 'attack' || b.dataset.act === 'spellbook') {
      assert.ok(cntBadge,
        'кнопка ' + b.dataset.act + ': числовой счётчик (бейдж) есть, '
        + 'факт: ' + JSON.stringify(
          b.children.map((ch) => ch.className)));
      assert.match(cntBadge.textContent, /^\d+(?:\/\d+)?$/,
        'кнопка ' + b.dataset.act + ': счётчик ЧИСЛОВОЙ (словесной '
        + 'подписи нет), факт: '
        + JSON.stringify(cntBadge.textContent));
    } else {
      assert.ok(!cntBadge,
        'кнопка ' + b.dataset.act + ': бейджа НЕТ (счётчики только на '
        + '«Удар»/«Книга заклинаний», 000199): '
        + JSON.stringify(b.children.map((ch) => ch.className)));
      assert.equal(b.textContent, '',
        'кнопка ' + b.dataset.act + ': текстовой подписи нет, '
        + 'факт: ' + JSON.stringify(b.textContent));
    }
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
  // 000168: pre-roll — Эфир (инициатива 4) быстрее всех → pre-roll
  // ОСТАНОВИЛСЯ НА ЕГО СЛОТЕ (ввод игрока, phase 'player') — шага
  // НЕТ (старый ИИ-шаг 000167 удалён): Эфир стоит на якорном
  // (px−1, py−1).
  assert.equal(u.x, c.px - 1,
    '000168: шаг pre-roll НЕТ — якорь px−1 (ввод-стоп)');
  assert.equal(u.y, c.py - 1, 'y — якорь py−1');
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
  const { G, keydown, body, buttons } = loadCombatUi(true, {
    withEfir: !!opts.efir,
    // 000168: каталог заклинаний (spells.js в цепочке, withSpells
    // 000149) — каст Эфира (c.cast → strongestKnown читает
    // combatInternals.allySpells). Без параметра — старая цепочка
    // бит-в-бит (по умолчанию false).
    withSpells: !!opts.spells,
    // 000193: модуль заклинаний союзников (после spells.js, до
    // combat-ui.js — G-снапшот, UMD-ловушка 000038). Без параметра —
    // цепи бит-в-бит (деградация rowChk/castRow — тот же title, что
    // давал гейт 000179).
    withAllySpells: !!opts.allySpells,
    performance: { now: () => NOW84 },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  const requested = [];
  // 000171: hero знает «Воскрешение» (кнопка в панели — гейт
  // canResurrect) — ДО startCombat (build() идёт в нём). Аддитивная
  // опция: существующие вызовы не передают → дефолтный герой бит-в-бит
  // (паттерн 000168 withSpells).
  const hero = G.createCharacter();
  if (opts.resurrect) hero.spells = ['resurrect'];
  const c = G.combatUI.startCombat({
    hero,
    mobs: opts.mobs || ['wolf'], mobLevel: 1, seed: 42,
    ...(opts.efir ? { efir: G.efir.createEfir() } : {}),
    ...(opts.loader
      ? { spriteLoader: fakeLoader84(requested, opts.loader) } : {}),
  });
  return { G, c, canvas: findCanvas(body), body, keydown, rafStubs,
    requested, buttons };
}

// Re-render через rAF-tick: окно ПОСЛЕДНЕГО рендера (срезы drawCalls /
// styleCalls / единого логa events — один временной интервал).
function tickSlice(canvas, rafStubs) {
  const n0 = canvas.drawCalls.length;
  const s0 = canvas.styleCalls.length;
  const e0 = canvas.events.length;
  // 000204: textStyleSets из того же окна (журнал накапливается между
  // рендерами — g2 один раз на бой; паттерн s0/e0, backward-compatible:
  // существующие вызывающие читают именованные поля — без правок).
  const ts0 = canvas.textStyleSets.length;
  rafStubs.scheduled[rafStubs.scheduled.length - 1]();
  return {
    calls: canvas.drawCalls.slice(n0),
    styleCalls: canvas.styleCalls.slice(s0),
    events: canvas.events.slice(e0),
    textStyleSets: canvas.textStyleSets.slice(ts0),
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

test('боевой UI: 000084/000197 — рамка «активный»: голубая подложка 44×44 + рамка 39×39 у активного Эфира (без лоадера — фолбэк + рамка; Эфир активен по дефолту)', () => {
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

test('боевой UI: 000084/000197 — рамка «активный» у союзника: голубая 39×39 + подложка, когда turnOrder[turnIndex] = союзник (кольцо 41×41 удалено); в остальное время — без подложки/рамки/кольца', () => {
  const S = scene84({ efir: true });
  const u = S.c.units.find((x) => x.kind === 'efir');
  S.c.targetId = null; // без подсветки цели (цвет '#ffe27a')
  const ex = u.x * 48, ey = u.y * 48;
  // Ход Эфира: голубая рамка + подложка в его клетке (ре-пин 000197:
  // «чей ход» больше не кольцо 41×41 — рамка 000197, 000199 L4).
  S.c.phase = 'mob';
  S.c.turnIndex = S.c.turnOrder.indexOf('efir');
  const t1 = tickSlice(S.canvas, S.rafStubs);
  assert.ok(t1.calls.some((c) => c[0] === 'strokeRect'
    && c[1][0] === ex + 4.5 && c[1][1] === ey + 4.5
    && c[1][2] === 39 && c[1][3] === 39),
    'голубая рамка 39×39 (px+4.5, py+4.5) — у активного (000197)');
  assert.ok(t1.calls.some((c) => c[0] === 'fillRect'
    && c[1][0] === ex + 2 && c[1][1] === ey + 2
    && c[1][2] === 44 && c[1][3] === 44),
    'подложка 44×44 — у активного (000197)');
  assert.ok(!t1.calls.some((c) => c[0] === 'strokeRect'
    && c[1][2] === 41 && c[1][3] === 41),
    'кольца хода 41×41 НЕТ — удалено (000199 L4: «чей ход» — рамка)');
  assert.equal(t1.styleCalls.filter((s) => s[0] === 'strokeStyle'
    && s[1] === '#ffe27a').length, 0,
    '«#ffe27a» отсутствует (цели нет, кольца нет)');
  // Не ход Эфира — подложки/рамки/кольца нет. 000167: очередь по
  // инициативе [Эфир, волк, герой] — «не Эфир» = слот героя (раньше
  // индекс 0).
  S.c.turnIndex = S.c.turnOrder.indexOf('player');
  const t2 = tickSlice(S.canvas, S.rafStubs);
  assert.ok(!t2.calls.some((c) => c[0] === 'strokeRect'
    && c[1][2] === 41 && c[1][3] === 41),
    'не ход союзника — кольца нет');
  assert.ok(!t2.calls.some((c) => c[0] === 'strokeRect'
    && c[1][0] === ex + 4.5 && c[1][1] === ey + 4.5
    && c[1][2] === 39 && c[1][3] === 39),
    'неактивный Эфир — рамки нет (000197: убрать постоянно горящую)');
  assert.ok(!t2.calls.some((c) => c[0] === 'fillRect'
    && c[1][0] === ex + 2 && c[1][1] === ey + 2
    && c[1][2] === 44 && c[1][3] === 44),
    'неактивный Эфир — подложки нет (000197)');
  assert.equal(t2.styleCalls.filter((s) => s[0] === 'strokeStyle'
    && s[1] === '#ffe27a').length, 0,
    '«#ffe27a» отсутствует (цели нет, кольца нет)');
});

test('боевой UI: 000084/000197 — наёмник (kind «merc»): спрайт моба-архетипа (MOB_FRAMES[«orc»]) + рамка «активный» (000197: рамка/подложка ТОЛЬКО у активного)', () => {
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
  // Ре-пин 000197: наёмник НЕАКТИВЕН (turnIndex — герой, очередь
  // ['m0','player','a1'] @1) — подложки/рамки на клетке НЕТ
  // («постоянно горящая голубая» убрана).
  assert.ok(!t.calls.some((c) => c[0] === 'fillRect'
    && c[1][0] === merc.x * 48 + 2 && c[1][1] === merc.y * 48 + 2
    && c[1][2] === 44 && c[1][3] === 44),
    'подложки НЕТ: наёмник неактивен (000197)');
  assert.ok(!t.calls.some((c) => c[0] === 'strokeRect'
    && c[1][0] === merc.x * 48 + 4.5 && c[1][1] === merc.y * 48 + 4.5
    && c[1][2] === 39 && c[1][3] === 39),
    'рамки НЕТ: наёмник неактивен (000197)');
  assert.equal(t.styleCalls.filter((s) => s[0] === 'strokeStyle'
    && s[1] === '#8cf2fc').length, 1,
    'голубой stroke #8cf2fc за окно — ровно 1: рамка активного героя (ре-пин 000213; активного союзника нет)');
  // АКТИВНЫЙ наёмник (turnIndex → его слот) — подложка + рамка
  // вернулись на его клетку (сцена с ОДНИМ союзником).
  S.c.turnIndex = S.c.turnOrder.indexOf(merc.id);
  const t2 = tickSlice(S.canvas, S.rafStubs);
  assert.ok(t2.calls.some((c) => c[0] === 'fillRect'
    && c[1][0] === merc.x * 48 + 2 && c[1][1] === merc.y * 48 + 2
    && c[1][2] === 44 && c[1][3] === 44),
    'подложка на клетке наёмника (активен)');
  assert.ok(t2.calls.some((c) => c[0] === 'strokeRect'
    && c[1][0] === merc.x * 48 + 4.5 && c[1][1] === merc.y * 48 + 4.5
    && c[1][2] === 39 && c[1][3] === 39),
    'рамка на клетке наёмника (активен)');
  assert.equal(t2.styleCalls.filter((s) => s[0] === 'fillStyle'
    && s[1] === 'rgba(140, 242, 252, 0.25)').length, 1,
    'подложка — ровно один раз');
  assert.equal(t2.styleCalls.filter((s) => s[0] === 'strokeStyle'
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
  // заполнение → уровень → рамка (000168: pre-roll остановился на
  // слоте Эфира — он активный, turnIndex 0). Ре-пин 000197: строка
  // «кольцо активного хода 41×41» УБРАНА — кольцо удалено, «чей ход»
  // показывает голубая рамка 39×39 (000199 L4).
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
    ['fillText', [String(u.level), ex + 44, ey + 12]], // уровень (угол, 6px, 000204)
    ['strokeRect', [ex + 4.5, ey + 4.5, 39, 39]],      // голубая рамка «активный» (000197; Эфир активен — turnIndex 0)
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

test('боевой UI: 000084/000197 — деградация (без sprites.js): Эфир — фолбэк + рамка «активный» (Эфир активен по дефолту), drawImage нет, исключений/ошибок нет', () => {
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
    && c[1][1] === ex + 44 && c[1][2] === ey + 12), 'без уровня');
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
  // 000167: очередь по инициативе [Эфир, волк, герой] (раньше
  // [герой, Эфир, волк]); ti=0 — Эфир current, волк и герой ещё
  // не ходили В РАУНДЕ (i > turnIndex — без --acted).
  assert.equal(tail.length, 3, 'токены: Эфир, волк, герой');
  const [efirTok, mobTok, heroTok] = tail;
  assert.ok(heroTok.className.includes('turn-token--hero'),
    'токен героя');
  assert.ok(!heroTok.className.includes('turn-token--current'),
    'герой — не current (turnIndex на Эфире)');
  assert.ok(!heroTok.className.includes('turn-token--acted'),
    '000167: герой (i 2 > ti 0) — ещё не ходил в раунде');
  assert.ok(efirTok.className.includes('turn-token--current'),
    'токен Эфира — current');
  assert.equal(efirTok.title, 'Эфир (ур. 1) — ходит',
    'title токена Эфира: ' + JSON.stringify(efirTok.title));
  assert.ok(!mobTok.className.includes('turn-token--current'),
    'волк — не current');
  assert.ok(!mobTok.className.includes('turn-token--acted'),
    '000167: волк (i 1 > ti 0) — ещё не ходил в раунде');
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

test('боевой UI: 000114/000197 — союзник kind «efir»: кадры efirFrames (а не кадрами героя) + рамка «активный» (Эфир активен по дефолту)', () => {
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
  // 000168: pre-roll остановился на СЛОТЕ ЭФИРА (ввод) — «Вдох»
  // проверяется на СЛЕДУЮЩЕМ слоте Эфира (round 2): 1-й Space —
  // волк делает шаг (изоляция: d 9 > 1, атаки нет); 2-й Space —
  // round 2, слот Эфира → «Вдох» (ВЕСЬ ход).
  c.player.hp = 10;
  u.mp = 20;
  wolf.x = 0; wolf.y = 0;
  c._rng = () => 0.99;
  press(S.keydown, 'Space'); // endTurn: волк — шаг к игроку (тихо)
  press(S.keydown, 'Space'); // endTurn: round 2 → слот Эфира → «Вдох»

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
    // 000168: ДВА endTurn — 1-й: волк-шаг (изоляция 0.99), 2-й:
    // round 2 → слот Эфира (проверка триггера); без триггера —
    // остановка на вводе, fx/флагов нет.
    press(N.keydown, 'Space');
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
    // 000168: pre-roll остановился на слоте Эфира (ввод игрока) —
    // под-сценарии (2)/(3) драйвятся прямой клавишей на ХОДУ ЭФИРА
    // (без Space); (4) — «Вдох» на 2-м слоте Эфира (round 2); (1) —
    // v1: лечения у Эфира в бою НЕТ (KeyH → отказ в журнал).
    // (1) heal — 000168 v1: «лечения и щита у Эфира в бою нет»
    //     (контракт §3.3): KeyH на ходу Эфира → предпроверка
    //     canDoAction 'heal' → «недоступно активному персонажу»
    //     (в журнал, как любой отказ); мана и HP не меняются.
    {
      const { L, saved } = mkLogScene();
      savedCats.push([L.G, saved]);
      const c = L.c;
      const u = c.units.find((x) => x.kind === 'efir');
      const w = c.units.find((x) => x.side === 'mob');
      w.x = 0; w.y = 0;
      c.player.hp = 17;
      c._rng = () => 0.99;
      press(L.keydown, 'KeyH');
      assert.ok(c.log.includes('недоступно активному персонажу'),
        '000168 v1: KeyH у Эфира — отказ в журнал (лечения нет): '
        + c.log.join(' | '));
      assert.ok(!c.log.some((s) => s.includes('исцеляет')),
        'строки «Эфир исцеляет …» в логе нет (v1): ' + c.log.join(' | '));
      assert.equal(u.mp, 11, 'мана не потрачена (лечения нет)');
      assert.equal(c.player.hp, 17, 'игрок не лечен (HP не меняется)');
    }
    // (2) cast — Эфир АКТИВЕН с pre-roll-стопа (phase 'player'),
    //     волк d 2 (≤ 4): KeyK (на ходу Эфира — каст, 000168) →
    //     сильнейшее урон-заклинание (spark: 3 маны, урон 6 —
    //     round((4+0.5·3)·(1+0.15·(1−1))·(1+0.05·lord)), ВСЕГДА
    //     попадает, игнор брони; формула 000193, 1:1 с книгой):
    //     «Эфир: «Искра» — Волк: 6.» (em-dash U+2014).
    {
      const { L, saved } = mkLogScene();
      savedCats.push([L.G, saved]);
      const c = L.c;
      const w = c.units.find((x) => x.side === 'mob');
      w.x = c.px; w.y = c.py - 2; // d 2 от Эфира (якорь px−1, py−1)
      c._rng = () => 0.99;
      press(L.keydown, 'KeyK');
      assert.ok(c.log.includes('Эфир: «Искра» — Волк: 6.'),
        'cast — паттерн ТЗ «Эфир: «<заклинание>» — <имя>: N.»: '
        + c.log.join(' | '));
    }
    // (3) touch — волк d 1 от Эфира, книга [] (урон-каста НЕТ):
    //     KeyJ — «Касание духа» (u.damage, L1: max(1,
    //     round((2 + 0.5·3)·1)) = 4): «Касание духа: 4.»
    //     000168: Эфир НЕ сдвигается pre-roll'ом — якорь (px−1, py−1)
    //     на месте; «вплотную к Эфиру» = (px, py−1): d 1.
    {
      const { L, saved } = mkLogScene();
      savedCats.push([L.G, saved]);
      const c = L.c;
      const u = c.units.find((x) => x.kind === 'efir');
      const w = c.units.find((x) => x.side === 'mob');
      u.spells = []; // без каталога-кандидатов урона — каст невозможен
      w.x = c.px; w.y = c.py - 1;
      c._rng = () => 0.99;
      press(L.keydown, 'KeyJ');
      assert.ok(c.log.includes('Касание духа: 4.'),
        'touch — паттерн ТЗ «Касание духа: N.»: ' + c.log.join(' | '));
    }
    // (4) «Вдох Эфира!» (000113, ЗЕЛЁНЫЙ якорь — строка уже в
    //     efir.js u.breath.logLine). 000168: «Вдох» — авто-триггер
    //     НАЧАЛА хода Эфира; pre-roll остановился на вводе (mana
    //     проверилась бы только на СЛЕДУЮЩЕМ слоте Эфира) →
    //     2 Space: 1-й — волк-шаг (изоляция 0.99), 2-й — round 2,
    //     слот Эфира: 10/25 = 0.4 (playerFrac), mp 20 → «Вдох».
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
      press(L.keydown, 'Space');
      assert.ok(c.log.includes('Вдох Эфира!'),
        '«Вдох Эфира!» (000113 — строка уже в master): '
        + c.log.join(' | '));
    }
  } finally {
    for (const [Gx, saved] of savedCats) Gx.combatInternals.allySpells = saved;
  }
});

// Ре-пин 000199 (ТЗ: «Не отображать текстом информацию о составе
// отряда»): строка «Отряд: …» ИЗ stateEl УДАЛЕНА — даже с союзниками;
// stateEl — ровно 2 фиксированные строки (кто/раунд + цель).
test('боевой UI: 000118 — HUD: строка состава отряда «Отряд: …» ИЗ .combat-state УБРАНА (000199), stateEl = ровно 2 строки (CU118-HUD)', () => {
  const S = scene84({ efir: true });
  addMerc84(S.c, S.G, 5, 2, 'ranged'); // Орк (дальний бой) — 000080
  tickSlice(S.canvas, S.rafStubs);
  const state = findByClass(S.body, 'combat-state');
  assert.ok(state, '.combat-state в оверлее');
  const text = state.textContent;
  assert.ok(!text.includes('Отряд:'),
    '000199: строки «Отряд:» НЕТ даже с союзниками (состав не '
    + 'дублируется текстом): ' + JSON.stringify(text));
  assert.ok(!text.includes('Эфир (поддержка)'),
    '000199: «Эфир (поддержка)» в stateEl нет: ' + JSON.stringify(text));
  assert.ok(!text.includes('Орк (дальний бой)'),
    '000199: «Орк (дальний бой)» в stateEl нет: ' + JSON.stringify(text));
  assert.equal(text.split('\n').length, 2,
    '000199: stateEl — ровно ДВЕ строки: ' + JSON.stringify(text));
  // Без союзников — строки тоже нет (вывод те же 2 строки).
  const P = scene84();
  const state2 = findByClass(P.body, 'combat-state');
  assert.ok(!state2.textContent.includes('Отряд:'),
    'без союзников — строки «Отряд:» нет: '
    + JSON.stringify(state2.textContent));
  assert.equal(state2.textContent.split('\n').length, 2,
    '000199: без союзников — те же ДВЕ строки: '
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

// --- Задача 000152: ассеты наёмных NPC (экран боя) ---
//
// ТЗ: вид наёмника УНИКАЛЬНЫЙ (per-персонажа, не архетип-заглушка) и
// применяется на экране боя. Сейчас — ВСЕ наёмники (kind 'merc')
// рисуются Г.MOB_FRAMES[ALLY_MERC_KIND] ('orc', 000084) вне
// зависимости от npcId.
//
// Дизайн (контракт memory/000152-merc-assets.md §4): merc-ветка в
// allyFrames — КЛЮЧ ВЫБОРА u.id (в игре u.id = npc.id:
// companions.allyDataForEntry → makeAlly `id: data.id || 'a'+idx` —
// проводка уже работает, combat.js НЕ правится):
//   u.kind === 'merc' && u.id → G.mercFrames(u.id, action) (sprites.js,
//   000152); пустой результат (тестовые наёмники без npcId, id 'a1',
//   и неизвестные id) → orc-FALLBACK G.MOB_FRAMES[ALLY_MERC_KIND] —
//   пин 000084 (ниже, «наёмник (kind «merc»): спрайт моба-архетипа»)
//   и golden-детерминизм остаются зелёными БЕЗ ПРАВОК. Ветка efir —
//   ПЕРВАЯ, не трогается.
//
// Стадия красных тестов: merc-ветки НЕТ — оба наёмника с npcId
// запрашивают orc-путь (краснота = неверный спрайт, не crash).
// Гард G1 — зелёный с первого дня (деградация без sprites.js).

// Наёмник С npcId (id нисходит в makeAlly как есть, combat.js):
// белая коробка, паттерн addMerc84.
function addMerc152(c, G, x, y, npcId, role, name) {
  const merc = G.makeAlly({ id: npcId, name, role, level: 2, dmg: 1, hp: 1 }, 1);
  merc.x = x; merc.y = y;
  c.units.push(merc);
  c.turnOrder.push(merc.id);
  return merc;
}

test('боевой UI: 000152 — наёмник с npcId (id «merc_volk») рисует СВОЙ спрайт assets/sprites/mercs/merc_volk_idle_*.svg; кадр = mercFrames(id, "idle")[frameIndex(NOW84, x, y, n)]; orc НЕ запрашивается; рамка «активный» — только у активного (ре-пин 000197)', () => {
  const S = scene84({ loader:
    [['assets/sprites/mercs/', { __fake: 'merc' }]] });
  const merc = addMerc152(S.c, S.G, 5, 2, 'merc_volk', 'melee', 'Вольк');
  const t = tickSlice(S.canvas, S.rafStubs);
  // КРАСНОЕ: запрашивается именно СВОЙ кадр <npcId>_idle_<n>.svg.
  const mercRequested = S.requested.filter(
    (p) => p.startsWith('assets/sprites/mercs/merc_volk_idle_'));
  assert.ok(mercRequested.length >= 1,
    'наёмник с npcId запрашивает СВОЙ спрайт '
    + 'assets/sprites/mercs/merc_volk_idle_<n>.svg; запрошено: '
    + JSON.stringify(S.requested));
  // orc-архетип для НАЙМЕНОВАННОГО наёмника не запрашивается
  // (fallback — только без/с неизвестным npcId, пин 000084 ниже).
  assert.ok(!S.requested.some((p) => p.startsWith('assets/sprites/mobs/orc_')),
    'orc-путь НЕ запрашивается у наёмника с npcId: '
    + JSON.stringify(S.requested));
  // drawImage своего спрайта на клетке (геометрия 000084: запас 8px,
  // 32×32) — не фолбэк-прямоугольник.
  const di = t.calls.find((c) => c[0] === 'drawImage'
    && c[1][0] && c[1][0].__fake === 'merc');
  assert.ok(di, 'спрайт наёмника (drawImage) — не фолбэк-прямоугольник');
  assert.equal(di[1][1], merc.x * 48 + 8, 'x — клетка наёмника + 8px');
  assert.equal(di[1][2], merc.y * 48 + 8, 'y — клетка наёмника + 8px');
  assert.equal(di[1][3], 32, '1×1: 32px');
  assert.equal(di[1][4], 32, '1×1: 32px');
  // Ре-пин 000197: рамка «активный» — ТОЛЬКО у активного. Наёмник
  // по дефолту НЕАКТИВЕН (turnOrder ['m0','player','merc_volk'] @1
  // — активен player) — подложки/рамки на клетке НЕТ.
  assert.ok(!t.calls.some((c) => c[0] === 'fillRect'
    && c[1][0] === merc.x * 48 + 2 && c[1][1] === merc.y * 48 + 2
    && c[1][2] === 44 && c[1][3] === 44),
    'подложки НЕТ: наёмник неактивен (000197)');
  assert.ok(!t.calls.some((c) => c[0] === 'strokeRect'
    && c[1][0] === merc.x * 48 + 4.5 && c[1][1] === merc.y * 48 + 4.5
    && c[1][2] === 39 && c[1][3] === 39),
    'рамки НЕТ: наёмник неактивен (000197)');
  assert.equal(t.styleCalls.filter((s) => s[0] === 'strokeStyle'
    && s[1] === '#8cf2fc').length, 1,
    'голубой stroke за окно — ровно 1: рамка активного героя (ре-пин 000213; активного союзника нет)');
  // АКТИВНЫЙ наёмник (turnIndex → его слот) — подложка + рамка
  // вернулись (пин 000084: подложка + рамка, теперь с гейтом).
  S.c.turnIndex = S.c.turnOrder.indexOf('merc_volk');
  const t2 = tickSlice(S.canvas, S.rafStubs);
  assert.ok(t2.calls.some((c) => c[0] === 'fillRect'
    && c[1][0] === merc.x * 48 + 2 && c[1][1] === merc.y * 48 + 2
    && c[1][2] === 44 && c[1][3] === 44),
    'подложка «активный» (наёмник активен)');
  assert.ok(t2.calls.some((c) => c[0] === 'strokeRect'
    && c[1][0] === merc.x * 48 + 4.5 && c[1][1] === merc.y * 48 + 4.5
    && c[1][2] === 39 && c[1][3] === 39),
    'рамка «активный» (наёмник активен)');
  assert.equal(t2.styleCalls.filter((s) => s[0] === 'fillStyle'
    && s[1] === 'rgba(140, 242, 252, 0.25)').length, 1,
    'подложка — ровно один раз');
  assert.equal(t2.styleCalls.filter((s) => s[0] === 'strokeStyle'
    && s[1] === '#8cf2fc').length, 1, 'рамка — ровно один раз');
  // Детерминизм кадра (зелёная фаза): запрошенный путь =
  // mercFrames(id, "idle")[frameIndex(NOW84, x, y, n)] — now один на
  // render (000047). Красной фазе проверка недоступна (G.mercFrames
  // ещё нет) — краснота выше, на самом спрайте.
  if (typeof S.G.mercFrames === 'function') {
    const frames = S.G.mercFrames('merc_volk', 'idle');
    assert.ok(frames.length >= 1, 'mercFrames("merc_volk","idle") — кадры');
    const idx = S.G.frameIndex(NOW84, merc.x, merc.y, frames.length);
    assert.equal(mercRequested[0], frames[idx],
      'кадр = mercFrames(id, "idle")[frameIndex(NOW84, x, y, n)]');
  }
});

test('боевой UI: 000152 — два наёмника с РАЗНЫМИ npcId рисуют РАЗНЫЕ спрайты (не «один штамп»); фикстура без npcId (id «a1») — orc-fallback (пин 000084 жив); ветка Эфира не тронута', () => {
  const S = scene84({
    efir: true,
    loader: [
      ['assets/sprites/mercs/', { __fake: 'merc' }],
      ['assets/sprites/mobs/orc_', { __fake: 'orc' }],
      ['assets/sprites/efir/', { __fake: 'efir' }],
    ],
  });
  addMerc152(S.c, S.G, 3, 2, 'merc_volk', 'melee', 'Вольк');
  addMerc152(S.c, S.G, 4, 2, 'merc_ashka', 'ranged', 'Ашка');
  const noid = addMerc84(S.c, S.G, 5, 2, 'ranged'); // id «a1» — БЕЗ npcId
  tickSlice(S.canvas, S.rafStubs);
  // КРАСНОЕ: per-npcId спрайты — РАЗНЫЕ пути (уникальность ТЗ).
  const volk = S.requested.filter(
    (p) => p.startsWith('assets/sprites/mercs/merc_volk_idle_'));
  const ashka = S.requested.filter(
    (p) => p.startsWith('assets/sprites/mercs/merc_ashka_idle_'));
  assert.ok(volk.length >= 1,
    'merc_volk — свой спрайт запрошен: ' + JSON.stringify(S.requested));
  assert.ok(ashka.length >= 1,
    'merc_ashka — свой спрайт запрошен: ' + JSON.stringify(S.requested));
  assert.equal(volk.filter((p) => ashka.includes(p)).length, 0,
    'разные npcId — РАЗНЫЕ изображения (не один штамп): '
    + JSON.stringify(volk) + ' vs ' + JSON.stringify(ashka));
  // drawImage на обеих клетках — дистинктные объекты-картинки
  // (лоадер-фак кэширует объект на путь).
  const diV = S.canvas.drawCalls.find((c) => c[0] === 'drawImage'
    && c[1][0] && c[1][0].__path === volk[0]);
  const diA = S.canvas.drawCalls.find((c) => c[0] === 'drawImage'
    && c[1][0] && c[1][0].__path === ashka[0]);
  assert.ok(diV && diA, 'drawImage обоих наёмников');
  assert.notEqual(diV[1][0], diA[1][0],
    'изображения различаются (дистинктные объекты)');
  // Fallback жив: наёмник БЕЗ npcId (id «a1», фикстура 000084) —
  // orc-архетип (пин 000084 «спрайт моба-архетипа» — без правок).
  const orcFrame = S.G.MOB_FRAMES['orc']
    [S.G.frameIndex(NOW84, noid.x, noid.y, 2)];
  assert.ok(S.requested.includes(orcFrame),
    'a1 (без npcId) → MOB_FRAMES["orc"] (fallback): ' + orcFrame
    + ' | ' + JSON.stringify(S.requested));
  // Ветка Эфира не тронута: кадр = efirFrames("idle")[frameIndex]
  // (существующий пин 000084 — здесь якорь «первой» ветки).
  const u = S.c.units.find((x) => x.kind === 'efir');
  const eFrame = S.G.efirFrames('idle')
    [S.G.frameIndex(NOW84, u.x, u.y, 2)];
  assert.ok(S.requested.includes(eFrame),
    'Эфир → efirFrames("idle") (ветка не тронута): ' + eFrame);
});

test('боевой UI: 000152 G1 — деградация (без sprites.js): наёмник с npcId — фолбэк; рамка «активный» — только у активного (ре-пин 000197), drawImage нет, исключений/ошибок нет', () => {
  // Гард (зелёный с первого дня): G.mercFrames/G.MOB_FRAMES оба
  // undefined (в цепочке нет sprites.js) → allyFrames → null →
  // фолбэк-прямоугольник по роли (паттерн G1-Эфира 000084),
  // console.error = 0 (e2e main-visuals 000081 чувствителен).
  const rafStubs = makeRafStubs();
  const { G, body } = loadCombatUi(false, {
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
      hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
    });
    const canvas = findCanvas(body);
    assert.ok(canvas, 'оверлей на месте, render() не упал');
    const merc = G.makeAlly({
      id: 'merc_volk', name: 'Вольк', role: 'melee', level: 2, dmg: 1, hp: 1,
    }, 1);
    merc.x = 5; merc.y = 2;
    c.units.push(merc);
    c.turnOrder.push(merc.id);
    // Первый re-render — на НЕАКТИВНОМ наёмнике (turnIndex — player,
    // очередь ['m0','player','merc_volk'] @1) — ре-пин 000197.
    rafStubs.scheduled[rafStubs.scheduled.length - 1](); // re-render
  } finally {
    console.error = realError;
  }
  assert.ok(c, 'бой создан (деградация, не крах)');
  assert.equal(errors.length, 0, 'console.error = 0: ' + JSON.stringify(errors));
  const ex = 5 * 48, ey = 2 * 48; // клетка наёмника (5, 2)
  const calls = findCanvas(body).drawCalls;
  assert.ok(!calls.some((x) => x[0] === 'drawImage'),
    'drawImage нет (в цепочке нет sprites.js)');
  // Якорь: фолбэк-прямоугольник (геометрия ветки) на клетке наёмника.
  assert.ok(calls.some((x) => x[0] === 'fillRect'
    && x[1][0] === ex + 8 && x[1][1] === ey + 8
    && x[1][2] === 32 && x[1][3] === 32),
    'фолбэк-прямоугольник 32×32 на клетке наёмника');
  // Ре-пин 000197: НЕАКТИВНЫЙ наёмник — подложки/рамки на клетке
  // НЕТ (та же ветвь, что со спрайтами — рамки не зависят от них).
  assert.ok(!calls.some((x) => x[0] === 'fillRect'
    && x[1][0] === ex + 2 && x[1][1] === ey + 2
    && x[1][2] === 44 && x[1][3] === 44),
    'подложки НЕТ: наёмник неактивен (000197)');
  assert.ok(!calls.some((x) => x[0] === 'strokeRect'
    && x[1][0] === ex + 4.5 && x[1][1] === ey + 4.5
    && x[1][2] === 39 && x[1][3] === 39),
    'рамки НЕТ: наёмник неактивен (000197)');
  // АКТИВНЫЙ наёмник (turnIndex → его слот): re-render через
  // rafStubs — подложка + рамка без спрайта (деградация, не крах).
  c.turnIndex = c.turnOrder.indexOf('merc_volk');
  const n0 = findCanvas(body).drawCalls.length;
  rafStubs.scheduled[rafStubs.scheduled.length - 1](); // re-render
  const calls2 = findCanvas(body).drawCalls.slice(n0);
  assert.ok(calls2.some((x) => x[0] === 'fillRect'
    && x[1][0] === ex + 2 && x[1][1] === ey + 2
    && x[1][2] === 44 && x[1][3] === 44),
    'подложка «активный» без sprites.js (наёмник активен)');
  assert.ok(calls2.some((x) => x[0] === 'strokeRect'
    && x[1][0] === ex + 4.5 && x[1][1] === ey + 4.5
    && x[1][2] === 39 && x[1][3] === 39),
    'рамка «активный» без sprites.js (наёмник активен)');
});

// --- Задача 000167: Бой: инициатива (ядро) — КРАСНЫЕ ТЕСТЫ (UI) ---
// Контракт: memory/000167-initiative-core.md. pre-roll в createCombat
// (startCombat): паук (4) и волк (3) быстрее героя createCharacter (2) →
// очередь отсортирована ['m0','m1','player'], turnIndex на игроке,
// round не сдвинут. UI-контракт: слот УБИТОГО В РАУНДЕ — серый токен
// (turn-token--dead) до конца раунда (очередь фиксируется на старт
// раунда, D12), --current — всегда на слоте СВОЕЙ позиции действующего
// (инвариант 000036), в следующем раунде мёртвый — вне очереди.

test('боевой UI: 000167-TOKEN-1 — слот убитого в раунде: серый токен до конца раунда, --current на позиции действующего, в следующем раунде мёртвый вне очереди', () => {
  const S = scene84({ mobs: ['spider', 'wolf'] });
  const c = S.c;
  const [sp, w] = c.units; // m0 паук (4), m1 волк (3); герой createCharacter (2)
  c.player.hp = 9999; // сценарий: герой не гибнет от мобов
  // Новый поток: pre-roll — паук (4) и волк (3) быстрее героя (2) → уже
  // действовали (сдвинулись к игроку); очередь отсортирована, turnIndex —
  // на СВОЕМ слоте игрока, раунд не сдвинут.
  assert.deepEqual([...c.turnOrder], ['m0', 'm1', 'player'],
    'отсортированная очередь: паук 4 > волк 3 > герой 2');
  assert.equal(c.turnIndex, 2,
    'игрок — на СВОЕМ слоте в отсортированной очереди');
  assert.equal(c.phase, 'player');
  assert.equal(c.round, 1, 'pre-roll не сдвигает раунд');
  // Игрок убивает волка в фазе игрока — слот мёртвого в (устаревшей)
  // очереди сохраняется до конца раунда.
  w.x = c.px; w.y = c.py - 1; // вплотную (белая коробка)
  c._rng = () => 0.01; // попадание гарантировано
  w.hp = 1;
  const r = c.attack(w.id);
  assert.equal(r.killed, true, 'волк повержен в фазе игрока');
  tickSlice(S.canvas, S.rafStubs); // render → пересборка токенов
  const el = findByClass(S.body, 'combat-turnorder');
  // ЛОВУШКА стаба: textContent='' НЕ очищает children — читаем ХВОСТ
  // (прецедент 000084).
  const tail = el.children.slice(-c.turnOrder.length);
  assert.equal(tail.length, 3, 'токены: паук, волк (мёртв), герой');
  const [spTok, wTok, heroTok] = tail;
  assert.ok(wTok.className.includes('turn-token--dead'),
    'слот мёртвого моба в очереди — серый токен');
  assert.ok(!wTok.className.includes('turn-token--current'),
    'мёртвый слот не подсвечен');
  assert.ok(heroTok.className.includes('turn-token--current'),
    'герой — current на своём слоте');
  assert.ok(spTok.className.includes('turn-token--acted'),
    'паук (действовал в pre-roll) — уже ходил');
  // Инвариант 000036 (белая коробка, паттерн 000084): действующий моб —
  // --current на СВОЕЙ позиции, а не на слоте мёртвого.
  c.phase = 'mob';
  c.turnIndex = c.turnOrder.indexOf('m0');
  tickSlice(S.canvas, S.rafStubs);
  const tail2 = el.children.slice(-c.turnOrder.length);
  const [spTok2, wTok2, heroTok2] = tail2;
  assert.ok(spTok2.className.includes('turn-token--current'),
    'действующий моб — current на своей позиции');
  assert.equal(c.turnOrder[c.turnIndex], 'm0',
    'turnOrder[turnIndex] — id действующего (не слот мёртвого)');
  assert.ok(wTok2.className.includes('turn-token--dead'),
    'слот мёртвого по-прежнему серый');
  assert.ok(!wTok2.className.includes('turn-token--current'),
    'мёртвый слот НЕ подсвечен даже «по индексу»');
  assert.ok(!heroTok2.className.includes('turn-token--current'),
    'у героя подсветки нет');
  // Следующий раунд: мёртвый моб вне очереди. (Восстановить настоящее
  // состояние — checkTurn гейтует endTurn по phase 'player'.)
  c.phase = 'player';
  c.turnIndex = 2;
  c.endTurn();
  assert.equal(c.round, 2, 'rollover: round++');
  assert.equal(c.phase, 'player');
  assert.deepEqual([...c.turnOrder], ['m0', 'player'],
    'свежая очередь: мёртвый волк исключён (паук 4 > герой 2)');
  assert.equal(c.turnIndex, 1, 'turnIndex — снова на слоте игрока');
  tickSlice(S.canvas, S.rafStubs);
  const tail3 = el.children.slice(-c.turnOrder.length);
  assert.equal(tail3.length, 2, 'в новом раунде 2 токена: паук, герой');
  assert.ok(!tail3.some((t) => t.className.includes('turn-token--dead')),
    'мёртвых токенов в новом раунде нет');
  assert.ok(tail3[1].className.includes('turn-token--current'),
    'герой — current');
});

// --- Задача 000166: каст «Воскрешения» в бою — выбор цели, мёртвый
// союзник (клетка/подсветка). Контракты:
// memory/000166-combat-resurrect-ui.md (архитектура/границы),
// memory/000166-player-cast-ui.md (поведение для игрока).
//
// КРАСНЫЕ (функциональности нет — канвас-выбор мёртвой цели + маркеры):
// CU166-SEL, CU166-HL, CU166-CAST, CU166-PSEL, CU166-PRI. Падения —
// осмысленные (assert значений: c.targetId / drawCalls / строка книги),
// не крахи: клик-хендлер матчит только живых юнитов, маркер-проход в
// drawUnits отсутствует, HUD-веток td/tHero нет.
// ЗЕЛЁНЫЕ пины (уже работает: data-driven строка 000149 + каталог
// 000163 + ядро resurrectAlly; защита реализации):
// CU166-ROW, CU166-NODEAD, CU166-GATE.
//
// Сцена: seed 42, волк + наёмник «Вольк» (level 1, maxHP =
// round((8+4·1)·1.1) = 13). 000167 pre-roll: координаты читаем
// ДИНАМИЧЕСКИ (u.x/u.y/c.px/c.py), pre-roll-лог не асертим. hero.mp = 50
// и mp/пул читаем ПЕРЕД кастом (D11 — не зависеть от формул). Мёртвый
// игрок — симуляция 000163 R-8 (до 000164 смерть = c.result сразу).

const NOW166 = 1000;
const ALLY_UNDERLAY166 = 'rgba(140, 242, 252, 0.25)'; // 000084: ALLY_MARKER_UNDERLAY

// Фикстура: герой знает 'resurrect' (опция resurrect — иначе дефолт
// ['spark','mend']), союзник — наёмник Вольк, моб — волк. deadAllies —
// dealDamageToAlly(c, u, 9999) (alive=false, hp=0, юнит остаётся в
// c.units, лог «… пал в бою!»); deadPlayer — R-8 (c.result НЕ возникает).
function scene166(opts = {}) {
  // 000182 (CU182-NOSP): spells (по умолчанию true — бит-в-байт) —
  // withSpells-опция loadCombatUi: scene166({spells:false}) — песочница
  // БЕЗ G.Spells/G.SpellsData (спелл-движок не загружен — битый
  // порядок), spellbook.js при этом на месте (G.SpellBook есть).
  // 000188 (CU188-ROWCHK): spellsDataOnly (по умолчанию false —
  // бит-в-байт) — каталог ЕСТЬ, движка НЕТ (rowChk-состояние).
  const { resurrect = true, deadAllies = 0, deadPlayer = false,
    spells = true, spellsDataOnly = false } = opts;
  const rafStubs = makeRafStubs();
  // 000171: buttons — ВСЕ кнопки песочницы (стаб пушит каждый
  // createElement('button')); аддитивный return — существующие вызовы
  // поле не читают (бит-в-байт).
  const { G, keydown, body, buttons } = loadCombatUi(true, {
    withSpells: spells,
    spellsDataOnly: spellsDataOnly,
    performance: { now: () => NOW166 },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  const hero = G.createCharacter();
  hero.mp = 50; // D11: каст 15 маны — не зависеть от maxMP (16 по формуле)
  if (resurrect) hero.spells = ['resurrect'];
  const c = G.combatUI.startCombat({
    hero, mobs: ['wolf'], mobLevel: 1, seed: 42,
    rosterData: [{ name: 'Вольк', role: 'melee', level: 1,
      dmg: 1.2, hp: 1.1, skills: [], spells: [] }],
  });
  const allies = c.units.filter((u) => u.side === 'ally');
  for (let i = 0; i < deadAllies; i++)
    G.combatInternals.dealDamageToAlly(c, allies[i], 9999);
  if (deadPlayer) { c.player.alive = false; c.player.hp = 0; }
  // 000171 (техническое аддитивное расширение): после симуляции смерти
  // — один tick rAF-цикла (в браузере кадр-цикл отрендерил бы новое
  // состояние: гашение кнопок/HUD — из ТЕКУЩЕГО состояния боя, а не
  // из startCombat). Существующие CU166-тесты не задеты: дельты
  // tickSlice / собственные рендеры (render идемпотентен, состояние
  // боя для render read-only); сцена без мутаций ({}) — бит-в-байт.
  if (deadAllies || deadPlayer) {
    rafStubs.scheduled[rafStubs.scheduled.length - 1]();
  }
  return { G, c, canvas: findCanvas(body), body, keydown, rafStubs,
    hero, ally: allies[0] || null, buttons,
    wolf: c.units.find((u) => u.side === 'mob') };
}

// Подложка «свой» раннего прохода 000166: 44×44, inset 2, цвет 000084 —
// геометрия подложки живого союзника.
function underlayAt166(events, x, y) {
  return styledCalls(events).some((ev) => ev.name === 'fillRect'
    && ev.args[0] === x + 2 && ev.args[1] === y + 2
    && ev.args[2] === 44 && ev.args[3] === 44
    && ev.fillStyle === ALLY_UNDERLAY166);
}

// Кольцо выбранной цели 000166: 39×39, inset 4.5, #ffe27a — геометрия
// существующей подсветки цели моба (drawUnits, mob-ветка).
function ringAt166(events, x, y) {
  return styledCalls(events).some((ev) => ev.name === 'strokeRect'
    && ev.args[0] === x + 4.5 && ev.args[1] === y + 4.5
    && ev.args[2] === 39 && ev.args[3] === 39
    && ev.strokeStyle === '#ffe27a');
}

// Стаб-ловушка 000149 §10: children НЕ чистятся при перестроении книги
// (innerHTML='' в стабе no-op) — свежая строка ВСЕГДА хвостом.
const lastRow166 = (bookBox) =>
  bookBox.children[bookBox.children.length - 1];

test('боевой UI: 000166 — клик по клетке МЁРТВОГО союзника — цель выбрана (c.targetId = id), лог не вырос, HUD «— мёртв» (CU166-SEL)', () => {
  const S = scene166({ deadAllies: 1 });
  const { c, ally, wolf } = S;
  assert.ok(!ally.alive && ally.hp === 0, 'фикстура: союзник мёртв');
  assert.equal(c.targetId, wolf.id, 'начальная авто-цель — волк');
  const n0 = c.log.length;
  S.canvas.listeners.click[0]({
    clientX: (ally.x + 0.5) * 48, clientY: (ally.y + 0.5) * 48,
  });
  assert.equal(c.targetId, ally.id,
    'клик по клетке мёртвого союзника — цель выбрана (прямой write c.targetId)');
  assert.equal(c.log.length, n0, 'выбор — не действие: лог не вырос');
  const state = findByClass(S.body, 'combat-state');
  assert.ok(state.textContent.includes('Цель: Вольк (ур. 1) — мёртв'),
    'HUD-строка цели «— мёртв»: ' + JSON.stringify(state.textContent));
});

test('боевой UI: 000166 — мёртвый союзник: подложка всегда, кольцо только при выборе; клетка волка без маркеров (CU166-HL)', () => {
  const S = scene166({ deadAllies: 1 });
  const { c, ally, wolf } = S;
  const ex = ally.x * 48, ey = ally.y * 48;
  const wx = wolf.x * 48, wy = wolf.y * 48;
  let t = tickSlice(S.canvas, S.rafStubs);
  assert.ok(underlayAt166(t.events, ex, ey),
    'подложка «свой» на клетке мёртвого союзника (fillRect +2/+2, 44×44, '
    + ALLY_UNDERLAY166 + ')');
  assert.ok(!ringAt166(t.events, ex, ey), 'до выбора — кольца нет');
  assert.ok(!underlayAt166(t.events, wx, wy),
    'на клетке моба подложки нет (цели воскрешения — только союзники)');
  // Рендер-проверка независимо от клика: цель ставится напрямую.
  c.targetId = ally.id;
  t = tickSlice(S.canvas, S.rafStubs);
  assert.ok(ringAt166(t.events, ex, ey),
    'кольцо выбранной цели на мёртвом союзнике (strokeRect +4.5/+4.5, 39×39, #ffe27a)');
  assert.ok(underlayAt166(t.events, ex, ey), 'подложка сохранена после выбора');
  assert.ok(!underlayAt166(t.events, wx, wy),
    'клетка волка без маркеров и после выбора');
});

test('боевой UI: 000166 — цепочка: клик по мёртвому союзнику → KeyQ → строка «Воскрешение» (без -off) → каст: 50% HP, мана/пул, лог, FX, книга закрыта, ход не сгорел; саб: без дальности (CU166-CAST)', () => {
  const S = scene166({ deadAllies: 1 });
  const { G, c, ally, wolf } = S;
  assert.ok(!ally.alive, 'фикстура: союзник мёртв');
  // 1. Выбор цели — клик по клетке (как играет игрок).
  S.canvas.listeners.click[0]({
    clientX: (ally.x + 0.5) * 48, clientY: (ally.y + 0.5) * 48,
  });
  assert.equal(c.targetId, ally.id, 'клик — мёртвый союзник выбран');
  // 2. Состояние ПЕРЕД кастом (D11: «до-значения» mp/пула).
  const mp0 = c.player.mp;
  const wis0 = c.ps.spellWis;
  const round0 = c.round;
  assert.equal(c.phase, 'player', 'ход игрока');
  // 3. Книга: KeyQ → строка «Воскрешение» готова (цель — мёртвый союзник).
  press(S.keydown, 'KeyQ');
  const bookBox = findByClass(S.body, 'combat-spellbook');
  assert.notEqual(bookBox.style.display, 'none', 'книга открыта');
  const row = lastRow166(bookBox);
  assert.equal(row.dataset.spell, 'resurrect', 'строка «Воскрешение»');
  assert.ok(!row.className.includes('combat-spellrow-off'),
    'строка готова (зеркало canCastSpell: цель — мёртвый союзник): '
    + JSON.stringify(row.className));
  // 4. Каст — клик по строке (castRow → castSpell(c, 'resurrect', c.targetId)).
  row.listeners.click[0]();
  assert.equal(ally.alive, true, 'союзник возвращён в бой');
  assert.equal(ally.hp, Math.round(ally.maxHP / 2),
    'hp = round(maxHP/2) (формула 000163, не хардкод)');
  assert.equal(c.player.mp, mp0 - 15, 'мана −15');
  assert.equal(c.ps.spellWis, wis0 - 1, 'пул «Заклинание» (Мудрость) −1');
  assert.ok(c.log.some((s) => s === 'Возвращён в бой.'), 'лог «Возвращён в бой.»');
  assert.equal(c._fx && c._fx.action, 'cast', 'c._fx — cast');
  assert.ok(c._fx && c._fx.until > NOW166, 'c._fx.until > now');
  assert.equal(bookBox.style.display, 'none', 'книга закрыта');
  assert.equal(c.phase, 'player', 'ход НЕ сгорел');
  assert.equal(c.round, round0, 'раунд не сдвинулся');
  // 5. Саб: ДАЛЬНОСТИ НЕТ (000163 R-2) — союзник на dist > 4 (чебышёв 6
  // от героя (3,6)): клик и каст работают как обычно (защита от UI-гейта).
  G.combatInternals.dealDamageToAlly(c, ally, 9999);
  ally.x = 0; ally.y = 0;
  c.ps.spellWis = 1; // пул 0 после первого каста — прецедент для второго
  c.targetId = wolf.id; // «свежая цель» — паттерн начала хода игрока
  S.canvas.listeners.click[0]({ clientX: 24, clientY: 24 }); // клетка (0,0)
  assert.equal(c.targetId, ally.id,
    'клик по клетке (0,0) — цель выбрана (дальности в UI нет)');
  press(S.keydown, 'KeyQ');
  const row2 = lastRow166(bookBox);
  assert.ok(!row2.className.includes('combat-spellrow-off'),
    'строка готова на dist > 4');
  row2.listeners.click[0]();
  assert.equal(ally.alive, true, 'каст на dist > 4 OK (дальности нет)');
  assert.equal(ally.hp, Math.round(ally.maxHP / 2), 'hp — снова 50%');
  assert.equal(c.player.mp, mp0 - 30, 'мана −15 ещё раз');
});

test('боевой UI: 000166 — мёртвый игрок: подложка на клетке героя, клик → c.targetId=null (автоцель), кольцо + HUD «(вы) — мёртв», каст → 50% derived maxHP (CU166-PSEL)', () => {
  const S = scene166({ deadPlayer: true });
  const { G, c } = S;
  const hx = c.px * 48, hy = c.py * 48;
  assert.ok(!c.player.alive, 'фикстура: игрок мёртв (симуляция 000163 R-8)');
  let t = tickSlice(S.canvas, S.rafStubs);
  assert.ok(underlayAt166(t.events, hx, hy),
    'подложка на клетке мёртвого героя (fillRect +2/+2, 44×44)');
  assert.ok(!ringAt166(t.events, hx, hy),
    'кольца нет, пока есть явная цель (волк)');
  // Клик по клетке героя — снять явную цель → автоцель (мёртвый игрок).
  S.canvas.listeners.click[0]({
    clientX: (c.px + 0.5) * 48, clientY: (c.py + 0.5) * 48,
  });
  assert.equal(c.targetId, null, 'клик — цель снята (автоцель — игрок)');
  t = tickSlice(S.canvas, S.rafStubs);
  assert.ok(ringAt166(t.events, hx, hy),
    'кольцо на клетке героя (автоцель — «вы»)');
  const state = findByClass(S.body, 'combat-state');
  assert.ok(state.textContent.includes('Цель: Флогистон (вы) — мёртв'),
    'HUD-строка «(вы)»: ' + JSON.stringify(state.textContent));
  // Каст из книги: автоцель (evalSpell: мёртвый игрок приоритетно).
  const mp0 = c.player.mp;
  press(S.keydown, 'KeyQ');
  const bookBox = findByClass(S.body, 'combat-spellbook');
  const row = lastRow166(bookBox);
  assert.equal(row.dataset.spell, 'resurrect', 'строка «Воскрешение»');
  assert.ok(!row.className.includes('combat-spellrow-off'),
    'строка готова (авто: мёртвый игрок приоритетно)');
  row.listeners.click[0]();
  assert.equal(c.player.alive, true, 'игрок возвращён');
  assert.equal(c.player.hp, Math.round(G.derived(c.player).maxHP / 2),
    'hp = round(derived maxHP/2) (у игрока НЕТ поля maxHP)');
  assert.equal(c.player.mp, mp0 - 15, 'мана −15');
  assert.ok(c.log.some((s) => s === 'Возвращён в бой.'), 'лог «Возвращён в бой.»');
});

test('боевой UI: 000166 — оба мертвы: авто (targetId=null) — игрок приоритетно; явный клик по союзнику — союзник воскрес, игрок мёртв (CU166-PRI)', () => {
  // (a) Авто: targetId=null → ИГРОК (зеркало evalSpell: мёртвый игрок
  // приоритетнее мёртвого союзника).
  let S = scene166({ deadAllies: 1, deadPlayer: true });
  let { G, c, ally } = S;
  c.targetId = null; // снять явную цель (волк) → авто
  const mp0 = c.player.mp;
  press(S.keydown, 'KeyQ');
  const bookBox = findByClass(S.body, 'combat-spellbook');
  const row = lastRow166(bookBox);
  assert.ok(!row.className.includes('combat-spellrow-off'),
    'строка готова (есть мёртвые: игрок или союзник)');
  row.listeners.click[0]();
  assert.equal(c.player.alive, true, 'авто: игрок воскрешён (приоритет)');
  assert.equal(c.player.hp, Math.round(G.derived(c.player).maxHP / 2),
    'игрок — 50% derived maxHP');
  assert.equal(ally.alive, false, 'союзник мёртв (авто взяла игрока)');
  assert.equal(c.player.mp, mp0 - 15, 'мана −15');
  assert.ok(!c.result, 'c.result не появился');
  // (b) Явная цель: клик по клетке мёртвого СОЮЗНИКА → союзник
  // воскрешён, игрок мёртв (явная > авто).
  S = scene166({ deadAllies: 1, deadPlayer: true });
  ({ G, c, ally } = S);
  S.canvas.listeners.click[0]({
    clientX: (ally.x + 0.5) * 48, clientY: (ally.y + 0.5) * 48,
  });
  assert.equal(c.targetId, ally.id, 'клик — явная цель (союзник)');
  const mp1 = c.player.mp;
  press(S.keydown, 'KeyQ');
  const bookBox2 = findByClass(S.body, 'combat-spellbook');
  const row2 = lastRow166(bookBox2);
  assert.ok(!row2.className.includes('combat-spellrow-off'),
    'строка готова (явная цель — мёртвый союзник)');
  row2.listeners.click[0]();
  assert.equal(ally.alive, true, 'явная: союзник воскрешён');
  assert.equal(ally.hp, Math.round(ally.maxHP / 2), 'союзник — 50% HP');
  assert.equal(c.player.alive, false, 'игрок мёртв (явная > авто)');
  assert.equal(c.player.mp, mp1 - 15, 'мана −15');
  assert.ok(!c.result, 'бой продолжается: c.result не появился');
});

test('боевой UI: 000166 — книга содержит строку «Воскрешение» после изучения: имя/подпись/иконка/описание из каталога 000017 (CU166-ROW)', () => {
  const S = scene166({}); // мёртвых нет
  const { c } = S;
  assert.ok(c.player.spells.includes('resurrect'), 'герой знает «Воскрешение»');
  press(S.keydown, 'KeyQ');
  const bookBox = findByClass(S.body, 'combat-spellbook');
  assert.notEqual(bookBox.style.display, 'none', 'книга открыта');
  const row = lastRow166(bookBox);
  assert.equal(row.dataset.spell, 'resurrect', 'id строки — каталог 000017');
  const icon = row.children.find((ch) => ch.className === 'combat-spellicon');
  assert.ok(icon, 'иконка в строке');
  assert.equal(icon.src, 'assets/spell-icons/resurrect.svg',
    'иконка 000017 (000149: существует в каталоге)');
  const body = row.children.find((ch) => ch.className === 'combat-spellrow-body');
  assert.ok(body, 'тело строки');
  const top = body.children[0];
  assert.equal(top.children[0].className, 'combat-spellname', 'элемент имени');
  assert.equal(top.children[0].textContent, 'Воскрешение', 'имя «Воскрешение»');
  assert.equal(top.children[1].textContent, 'Мана 15 · Заклинание (Мудрость)',
    'подпись — мана и пул');
  const desc = body.children[1];
  assert.equal(desc.className, 'combat-spellrow-desc', 'элемент описания');
  assert.ok(desc.textContent.startsWith('Возвращает павшего союзника'),
    'описание из каталога 000017: ' + JSON.stringify(desc.textContent));
});

test('боевой UI: 000166 — мёртвых нет: строка «Воскрешение» -off «нет цели»; клик → причина в журнале, без трат, книга осталась открыта (CU166-NODEAD)', () => {
  const S = scene166({}); // мёртвых нет
  const { c } = S;
  const mp0 = c.player.mp;
  const wis0 = c.ps.spellWis;
  const n0 = c.log.length;
  press(S.keydown, 'KeyQ');
  const bookBox = findByClass(S.body, 'combat-spellbook');
  const row = lastRow166(bookBox);
  assert.equal(row.dataset.spell, 'resurrect', 'строка есть (изучено)');
  assert.ok(row.className.includes('combat-spellrow-off'),
    'строка -off (мёртвой цели нет)');
  assert.equal(row.title, 'нет цели', 'title — причина (зеркало canCastSpell 000163)');
  row.listeners.click[0]();
  const added = Array.from(c.log).slice(n0);
  assert.ok(added.includes('нет цели'), 'причина в журнале: ' + JSON.stringify(added));
  assert.equal(c.player.mp, mp0, 'мана не потрачена');
  assert.equal(c.ps.spellWis, wis0, 'пул не потрачен');
  assert.equal(c._fx, undefined, 'отказ — без FX');
  assert.notEqual(bookBox.style.display, 'none', 'книга осталась открыта');
});

test('боевой UI: 000166 — герой БЕЗ «Воскрешения»: маркеров на мёртвых нет, клики no-op (гейт canResurrect) (CU166-GATE)', () => {
  const S = scene166({ resurrect: false, deadAllies: 1, deadPlayer: true });
  const { c, ally } = S;
  assert.ok(!c.player.spells.includes('resurrect'),
    'герой НЕ знает «Воскрешение» (дефолт)');
  const ex = ally.x * 48, ey = ally.y * 48;
  const hx = c.px * 48, hy = c.py * 48;
  const t = tickSlice(S.canvas, S.rafStubs);
  assert.ok(!underlayAt166(t.events, ex, ey), 'подложки на мёртвом союзнике нет');
  assert.ok(!ringAt166(t.events, ex, ey), 'кольца на мёртвом союзнике нет');
  assert.ok(!underlayAt166(t.events, hx, hy), 'подложки на мёртвом герое нет');
  assert.ok(!ringAt166(t.events, hx, hy), 'кольца на мёртвом герое нет');
  const n0 = c.log.length;
  const t0 = c.targetId;
  S.canvas.listeners.click[0]({
    clientX: (ally.x + 0.5) * 48, clientY: (ally.y + 0.5) * 48,
  });
  assert.equal(c.targetId, t0, 'клик по мёртвому союзнику — цель не изменилась');
  S.canvas.listeners.click[0]({
    clientX: (c.px + 0.5) * 48, clientY: (c.py + 0.5) * 48,
  });
  assert.equal(c.targetId, t0, 'клик по мёртвому герою — цель не изменилась');
  assert.equal(c.log.length, n0, 'лог не вырос');
});

// =====================================================================
// Задача 000168. Бой: игрок управляет Эфиром и нанятыми NPC
// (ход спутника — ввод). КРАСНЫЕ тесты (TDD), vm-песочница
// (паттерн 000084/000118: scene84/addMerc84/press/tickSlice/
// findByClass). Контракты — memory/000168-companion-control.md
// (§4 UI-контракт, §3.3–3.5), §12 (000168-UI-1/2).
//
// Краснота (базис 000167):
//   * stateEl БЕЗ строки «Ход: …» и БЕЗ строки активного
//     спутника (старый render — только базовые строки);
//   * на ходу спутника очередь НЕ стоит (после Space — активен
//     'player', round уже откатился) → состояние кнопок —
//     игрок-путь (attack «цель слишком далеко» / block ok и т.п.);
//   * на ходу Эфира J/K — игрок-путь (отказ в журнал, Касания/
//     каста нет), c.efs/u.mp не меняются.
// Старый пин «Эфир pre-roll-шаг (px−1,py−1)→(px−2,py−1)»
// (000081-wiring) — re-pin — в коммите GREEN-фазы (§15),
// не в этом коммите.
// =====================================================================

// Ре-пин 000199 (ТЗ: «не отображать текстом чей ход / HP и MP /
// состав отряда»): строки «Ход: …», активного спутника и «Отряд:»
// ИЗ stateEl УБРАНЫ — инфо активного персонажа перенесено на полосы
// HP/MP (следуют за активным) и бейдж «Удара» (c-счётчики на кнопках).
test('боевой UI: 000168-UI-1 — stateEl: строки «Ход: …»/спутника/«Отряд:» убраны (000199); полосы и бейдж «Удара» — значения активного персонажа', () => {
  // (a) Ход наёмника: очередь ['m0','player','a1'] (а1 — push'ом
  //     в конец) — Space (конец хода игрока) → остановка на «a1».
  const S = scene84();
  addMerc84(S.c, S.G, 3, 5, 'melee', 'Вольк');
  const w = S.c.units.find((x) => x.id === 'm0');
  w.x = 3; w.y = 4;
  press(S.keydown, 'Space');
  tickSlice(S.canvas, S.rafStubs);
  assert.equal(S.G.activeUnitId(S.c), 'a1',
    'очередь остановилась на наёмнике (краснота: '
    + S.G.activeUnitId(S.c) + ')');
  const state = findByClass(S.body, 'combat-state');
  const text = state.textContent;
  assert.ok(!text.includes('Ход:'),
    '000199: строки «Ход: Вольк» нет (чей ход — рамка 000197): '
    + JSON.stringify(text));
  assert.ok(!text.includes('Вольк: HP'),
    '000199: строки активного спутника (HP/шаги/удары) нет — '
    + 'инфо на полосках: ' + JSON.stringify(text));
  assert.ok(!text.includes('Отряд:'),
    '000199: строки «Отряд:» (roster) нет: ' + JSON.stringify(text));
  assert.equal(text.split('\n').length, 2,
    '000199: stateEl — ровно ДВЕ строки: ' + JSON.stringify(text));
  // Полосы — активного Волька (16/16, а не раненого/полного игрока):
  // HP 16/16, мана наёмника — в модели (000193/000193.01: u.mp/u.maxMP
  // = 5 → «MP 5/5»; D5 000199 — Superseded); бейдж
  // «Удара» — u.attackLeft (ур. 2 → пул 1).
  const merc = S.c.units.find((x) => x.id === 'a1');
  assert.equal(findByClass(S.body, 'combat-hpbar-text').textContent,
    'HP ' + merc.hp + '/' + merc.maxHP,
    'HP-полоса несёт активного Волька (16/16): '
    + JSON.stringify(findByClass(S.body, 'combat-hpbar-text').textContent));
  assert.equal(findByClass(S.body, 'combat-mpbar-text').textContent,
    'MP 5/5',
    'MP-полоса — мана наёмника u.mp/u.maxMP (000193.01, D5 — '
    + 'Superseded): '
    + JSON.stringify(findByClass(S.body, 'combat-mpbar-text').textContent));
  const atkBadge = S.body.querySelectorAll('.combat-actions button')
    .find((b) => b.dataset.act === 'attack').children
    .find((ch) => ch.className === 'combat-actcount');
  assert.ok(atkBadge, 'бейдж «Удара» есть (счётчики на кнопках, 000199)');
  assert.equal(atkBadge.textContent, String(merc.attackLeft),
    'бейдж «Удара» = u.attackLeft (1): '
    + JSON.stringify(atkBadge.textContent));
  // (b) Ход игрока — полосы/бейдж несут значения ИГРОКА (25/25,
  //     16/16, «1»); без спутников 2 строки, «Отряд:» нет.
  const P = scene84();
  tickSlice(P.canvas, P.rafStubs);
  const st2 = findByClass(P.body, 'combat-state');
  assert.ok(!st2.textContent.includes('Ход:'),
    '000199: на ходу игрока строки «Ход: Вы» нет: '
    + JSON.stringify(st2.textContent));
  assert.equal(st2.textContent.split('\n').length, 2,
    '000199: на ходу игрока — ровно ДВЕ строки: '
    + JSON.stringify(st2.textContent));
  assert.ok(!st2.textContent.includes('Отряд:'),
    'без спутников — строки «Отряд:» нет');
  const d2 = P.G.derived(P.c.player);
  assert.equal(findByClass(P.body, 'combat-hpbar-text').textContent,
    'HP ' + P.c.player.hp + '/' + d2.maxHP,
    'на ходу игрока HP-полоса — значения игрока: '
    + JSON.stringify(findByClass(P.body, 'combat-hpbar-text').textContent));
  assert.equal(findByClass(P.body, 'combat-mpbar-text').textContent,
    'MP ' + P.c.player.mp + '/' + d2.maxMP,
    'на ходу игрока MP-полоса — значения игрока (16/16): '
    + JSON.stringify(findByClass(P.body, 'combat-mpbar-text').textContent));
  const atkBadgeP = P.body.querySelectorAll('.combat-actions button')
    .find((b) => b.dataset.act === 'attack').children
    .find((ch) => ch.className === 'combat-actcount');
  assert.equal(atkBadgeP.textContent, String(P.c.ps.attack),
    'на ходу игрока бейдж «Удара» = c.ps.attack: '
    + JSON.stringify(atkBadgeP.textContent));
});

test('боевой UI: 000168-UI-2 — кнопки на ходу спутника: attack/«Конец хода» включены, player-only — «недоступно активному персонажу»; Эфир — J/K (Касание/сильнейшее урон-заклинание)', () => {
  // (a) Наёмник: attack активен (d 1); block/quickItem/invItem/
  //     flee — disabled с дословным title; 000193: spellbook больше
  //     НЕ player-only — у melee-наёмника книга ПУСТАЯ → disabled с
  //     title «заклинаний нет» (новая ветка allyCanDo).
  const S = scene84();
  addMerc84(S.c, S.G, 3, 5, 'melee', 'Вольк');
  const w = S.c.units.find((x) => x.id === 'm0');
  w.x = 3; w.y = 4; // d 1 от наёмника (3,5)
  press(S.keydown, 'Space');
  tickSlice(S.canvas, S.rafStubs);
  assert.equal(S.G.activeUnitId(S.c), 'a1',
    'активен наёмник (краснота: ' + S.G.activeUnitId(S.c) + ')');
  const byAct = {};
  for (const b of S.body.querySelectorAll('.combat-actions button'))
    byAct[b.dataset.act] = b;
  assert.equal(byAct.attack.disabled, false,
    'attack — включён (краснота: игрок-путь — «'
    + byAct.attack.title + '»)');
  assert.equal(byAct.endTurn.disabled, false, '«Конец хода» — включён');
  for (const act of ['block', 'quickItem', 'invItem', 'flee']) {
    assert.equal(byAct[act].disabled, true, act + ' — запрещён');
    assert.equal(byAct[act].title, 'недоступно активному персонажу',
      act + ' — title дословно (краснота: «' + byAct[act].title + '»)');
  }
  assert.equal(byAct.spellbook.disabled, true,
    '000193: «Книга» на ходу melee-наёмника — запрещена (книга [])');
  assert.equal(byAct.spellbook.title, 'заклинаний нет',
    '000193: title дословно (краснота: «' + byAct.spellbook.title + '»)');
  // (b) Эфир: очередь остановилась на его слоте; J — «Касание духа»
  //     (c.efs.touch, u.damage = 4, всегда попадает), K — сильнейшее
  //     урон-заклинание (Искра: c.efs.spellInt, 3 маны, урон 6 —
  //     round((4+0.5·3)·(1+0.15·(1−1))·(1+0.05·1)); формула 000193);
  //     player-only кнопки — запрещены.
  // 000168: spells — каталог в цепочке (strongestKnown читает
  // combatInternals.allySpells — без него каст «заклинаний нет»).
  const E = scene84({ efir: true, spells: true });
  tickSlice(E.canvas, E.rafStubs);
  assert.equal(E.G.activeUnitId(E.c), 'efir',
    'активен Эфир (краснота: pre-roll прошёл через ИИ → '
    + E.G.activeUnitId(E.c) + ')');
  const u = E.c.units.find((x) => x.kind === 'efir');
  const w2 = E.c.units.find((x) => x.id === 'm0');
  u.x = 3; u.y = 5;
  w2.x = 3; w2.y = 4; // d 1
  w2.maxHP = 100; w2.hp = 100; // запас по HP (Касание + каст)
  tickSlice(E.canvas, E.rafStubs);
  press(E.keydown, 'KeyJ');
  tickSlice(E.canvas, E.rafStubs);
  assert.ok(E.c.log.includes('Касание духа: 4.'),
    'J — «Касание духа» (u.damage = 4; краснота: игрок-путь — строки '
    + 'нет): ' + E.c.log.join(' | '));
  assert.equal(E.c.efs.touch, 0, 'c.efs.touch 1→0');
  assert.equal(w2.hp, 96, 'волк −4');
  press(E.keydown, 'KeyK');
  tickSlice(E.canvas, E.rafStubs);
  assert.ok(E.c.log.includes('Эфир: «Искра» — Волк: 6.'),
    'K — сильнейшее урон-заклинание (краснота: ' + E.c.log.join(' | ')
    + ')');
  assert.equal(E.c.efs.spellInt, 0, 'c.efs.spellInt 1→0');
  assert.equal(u.mp, 8, 'мана 11−3 (краснота: 11 — ИИ не тратит)');
  assert.equal(w2.hp, 90,
    'волк −6 (round((4+0.5·3)·(1+0.15·(1−1))·(1+0.05·1)); 000193)');
  const byActE = {};
  for (const b of E.body.querySelectorAll('.combat-actions button'))
    byActE[b.dataset.act] = b;
  for (const act of ['block', 'quickItem', 'invItem', 'flee']) {
    assert.equal(byActE[act].disabled, true, act + ' — запрещён');
    assert.equal(byActE[act].title, 'недоступно активному персонажу',
      act + ' — title дословно (краснота: «' + byActE[act].title + '»)');
  }
  assert.equal(byActE.spellbook.disabled, false,
    '000193: «Книга» на ходу Эфира — ВКЛЮЧЕНА (книга [spark, mend] '
    + 'непустая)');
  assert.equal(byActE.spellbook.title, '',
    '000193: title пусто (краснота: «' + byActE.spellbook.title + '»)');
});

// =====================================================================
// Задача 000175. Штриховка клеток, до которых выбранный моб доходит
// за один ход. КРАСНЫЕ тесты (TDD), vm-песочница (паттерн 000084/
// 000166: loadCombatUi/makeRafStubs/fakeLoader84/tickSlice/
// styledCalls/addMerc84). Контракт —
// memory/000175-mob-reach-hatch.md §3 (UI).
//
// Штриховка — canvas-слой МЕЖДУ сеткой и препятствиями (z-порядок);
// на тайл — ОДНА диагональ 45°, inset 8px (конвенция спрайта юнита):
// beginPath → moveTo(px+8, py+40) → lineTo(px+40, py+8) → stroke
// (px = x·48, py = y·48, CELL = 48). strokeStyle/lineWidth — ОДИН раз
// до цикла. ГЕЙТ: c.targetId → ЖИВОЙ не-fled юнит side === 'mob'
// (то же условие, что жёлтое кольцо цели). Цвет — производное
// подсветки цели #ffe27a (семья «выделенный моб»):
// 'rgba(255, 226, 122, 0.35)' (D9). Рендер чистый: 0 log-push,
// 0 drawImage (штриховка — stroke-only).
//
// Краснота (осмысленная): слоя штриховки в render() НЕТ — 0
// штрих-вызовов в drawCalls (AssertionError); G.mobReachCells —
// undefined (экспорт ядра отсутствует) — TypeError. Песочница
// стартует, бой создаётся (не load-ошибка, не SyntaxError).
// =====================================================================

const HATCH175 = 'rgba(255, 226, 122, 0.35)'; // D9: производное #ffe27a
const NOW175 = 1000;

// H175: сцена — фикс. now + rAF-стабы + опц. sprite-лоадер (паттерн
// scene84/scene166); dungeonType — только путь фона (H6).
function scene175(opts = {}) {
  const rafStubs = makeRafStubs();
  const { G, keydown, body } = loadCombatUi(true, {
    performance: { now: () => NOW175 },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  const requested = [];
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(),
    mobs: opts.mobs || ['wolf'], mobLevel: 1, seed: 42,
    ...(opts.dungeonType !== undefined
      ? { dungeonType: opts.dungeonType } : {}),
    spriteLoader: fakeLoader84(requested, opts.loader || []),
  });
  return { G, c, canvas: findCanvas(body), body, keydown, rafStubs,
    requested };
}

// H175: декод штриховки из среза рендера (tickSlice): для каждого
// 'stroke' с действовавшим strokeStyle === HATCH175 пара
// (moveTo m, lineTo l) — клетка = (trunc((l[0] − 40)/48),
// trunc((m[1] − 40)/48)) (40 = CELL − 8, inset-конвенция). Нарушение
// сигнатуры (не moveTo/lineTo, геометрия не 8px-inset) — ассерт-
// ошибка (пин геометрии D8).
function hatchTiles175(slice) {
  const sc = styledCalls(slice.events);
  const tiles = [];
  for (let i = 0; i < sc.length; i++) {
    const ev = sc[i];
    if (ev.name !== 'stroke' || ev.strokeStyle !== HATCH175) continue;
    const lt = sc[i - 1], mv = sc[i - 2];
    assert.ok(mv && mv.name === 'moveTo' && lt && lt.name === 'lineTo',
      'сигнатура штриха: … → moveTo → lineTo → stroke');
    const x = Math.trunc((lt.args[0] - 40) / 48);
    const y = Math.trunc((mv.args[1] - 40) / 48);
    assert.equal(mv.args[0], x * 48 + 8, 'moveTo x — клетка + 8px (inset)');
    assert.equal(mv.args[1], y * 48 + 40, 'moveTo y — клетка + 40px (inset)');
    assert.equal(lt.args[0], x * 48 + 40, 'lineTo x — клетка + 40px (inset)');
    assert.equal(lt.args[1], y * 48 + 8, 'lineTo y — клетка + 8px (inset)');
    tiles.push(x + ',' + y);
  }
  return tiles;
}

// H175: индексы штрих-'stroke' в массиве slice.calls (пин z-порядка):
// ci — число вызовов, предшествующих событию.
function hatchCallIdx175(slice) {
  const idx = [];
  let strokeStyle = null;
  let ci = 0;
  for (const ev of slice.events) {
    if (ev.s) {
      if (ev.s[0] === 'strokeStyle') strokeStyle = ev.s[1];
    } else {
      if (ev.c[0] === 'stroke' && strokeStyle === HATCH175) idx.push(ci);
      ci++;
    }
  }
  return idx;
}

test('боевой UI: 000175 H1 — выделение живого моба: штриховка на ТОЧНОМ наборе (== G.mobReachCells), одна 8px-inset диагональ на клетку, z-порядок: сетка < штриховка < препятствия < моб', () => {
  const S = scene175({
    loader: [
      ['assets/combat/obstacles/', { __fake: 'obs' }],
      ['assets/sprites/mobs/wolf_', { __fake: 'wolf' }],
    ],
  });
  const { G, c, canvas, rafStubs } = S;
  const wolf = c.units.find((u) => u.mobId === 'wolf');
  assert.equal(c.targetId, wolf.id, 'авто-цель — волк (единственный моб)');
  const t = tickSlice(canvas, rafStubs);
  const tiles = hatchTiles175(t);
  assert.ok(tiles.length > 0,
    'штриховка в рендере (краснота: слой не реализован — 0 штрихов)');
  // Ключевой пин: НАРИСОВАННЫЙ набор == НАБОР ЯДРА (G.mobReachCells).
  const expected = G.mobReachCells(c, wolf);
  assert.equal(tiles.length, expected.size,
    'число штрихов == число клеток (' + tiles.length + ' vs '
    + expected.size + ')');
  assert.deepEqual(tiles.slice().sort(), [...expected].sort(),
    'декодированный набор == G.mobReachCells(c, wolf) (правильный набор И нарисован)');
  // z-порядок: последний stroke сетки < первый штрих < первое
  // препятствие < спрайт волка.
  const calls = t.calls;
  const firstHatch = hatchCallIdx175(t)[0];
  let lastGrid = -1;
  for (let i = 0; i < firstHatch; i++)
    if (calls[i][0] === 'stroke') lastGrid = i;
  assert.ok(lastGrid >= 0, 'сетка ДО штриховки (есть stroke-сетки)');
  const firstObs = calls.findIndex(
    (x) => x[0] === 'drawImage' && x[1][0] && x[1][0].__fake === 'obs');
  const iWolf = calls.findIndex(
    (x) => x[0] === 'drawImage' && x[1][0] && x[1][0].__fake === 'wolf');
  assert.ok(firstObs >= 0 && iWolf >= 0,
    'препятствия и волк нарисованы (sprite-лоадер, паттерн 000050)');
  assert.ok(lastGrid < firstHatch,
    `штриховка ПОСЛЕ сетки (${lastGrid} < ${firstHatch})`);
  assert.ok(firstHatch < firstObs,
    `штриховка ПЕРЕД препятствиями (${firstHatch} < ${firstObs})`);
  assert.ok(firstObs < iWolf,
    `препятствия ПЕРЕД мобом (${firstObs} < ${iWolf})`);
  // Чистый рендер: лог не вырос (D7 — сейвы/детерминизм).
  const n0 = c.log.length;
  tickSlice(canvas, rafStubs);
  assert.equal(c.log.length, n0, 'рендер не растит c.log');
});

test('боевой UI: 000175 H2 — перецеливание: штриховка следует за выбором (2 моба: авто-centipede → wolf), тайлы прежнего моба исчезают', () => {
  const S = scene175({ mobs: ['wolf', 'centipede'] });
  const { G, c, canvas, rafStubs } = S;
  const wolf = c.units.find((u) => u.mobId === 'wolf');       // m0 (1,1)
  const cent = c.units.find((u) => u.mobId === 'centipede');  // m1 (3,0), fast
  assert.equal(c.targetId, cent.id, 'авто-цель — ближайшая (многоножка)');
  // (a) Авто-цель (fast, movePerTurn=2) — штриховка = ЕЁ набор
  //     (радиус-2 с учётом препятствий — пин fast-моба в UI).
  let t = tickSlice(canvas, rafStubs);
  let tiles = hatchTiles175(t);
  assert.ok(tiles.length > 0, 'краснота: штриховки нет (слой не реализован)');
  assert.deepEqual(tiles.slice().sort(), [...G.mobReachCells(c, cent)].sort(),
    'набор == G.mobReachCells(многоножка)');
  // (b) Перетаргет — волк: набор пересчитан, тайлы многоножки
  //     больше не штрихуются (селективный пересчёт).
  c.targetId = wolf.id;
  t = tickSlice(canvas, rafStubs);
  tiles = hatchTiles175(t);
  assert.deepEqual(tiles.slice().sort(), [...G.mobReachCells(c, wolf)].sort(),
    'набор == G.mobReachCells(волк)');
  assert.ok(!tiles.includes('2,0'),
    'тайл многоножки (2,0) больше не штрихован (селективный пересчёт)');
});

test('боевой UI: 000175 H3 — цель убитая (alive=false, hp=0; targetId не трогаем) — штриховка исчезает', () => {
  const S = scene175();
  const { c, canvas, rafStubs } = S;
  const wolf = c.units.find((u) => u.mobId === 'wolf');
  assert.equal(c.targetId, wolf.id, 'авто-цель — волк');
  assert.ok(hatchTiles175(tickSlice(canvas, rafStubs)).length > 0,
    'живая цель — штриховка есть (краснота: слой не реализован)');
  // Цель убита (прямой write — белая коробка, паттерн 000166).
  wolf.alive = false; wolf.hp = 0;
  assert.equal(c.targetId, wolf.id, 'targetId не тронут');
  assert.equal(hatchTiles175(tickSlice(canvas, rafStubs)).length, 0,
    'мёртвая цель — 0 штрихов (гейт: живой моб)');
});

test('боевой UI: 000175 H4 — c.targetId = null (автоцель — игрок) — штриховка исчезает', () => {
  const S = scene175();
  const { c, canvas, rafStubs } = S;
  const wolf = c.units.find((u) => u.mobId === 'wolf');
  assert.equal(c.targetId, wolf.id, 'авто-цель — волк');
  assert.ok(hatchTiles175(tickSlice(canvas, rafStubs)).length > 0,
    'краснота: штриховки нет (слой не реализован)');
  c.targetId = null;
  assert.equal(hatchTiles175(tickSlice(canvas, rafStubs)).length, 0,
    'targetId = null — 0 штрихов (автоцель — игрок, не моб)');
});

test('боевой UI: 000175 H5 — c.targetId = мёртвый СОЮЗНИК (прямой write, паттерн 000166) — 0 штрихов (гейт side «mob»)', () => {
  const S = scene175();
  const { G, c, canvas, rafStubs } = S;
  const wolf = c.units.find((u) => u.mobId === 'wolf');
  assert.equal(c.targetId, wolf.id, 'авто-цель — волк');
  assert.ok(hatchTiles175(tickSlice(canvas, rafStubs)).length > 0,
    'краснота: штриховки нет (слой не реализован)');
  const merc = addMerc84(c, G, 3, 5, 'melee', 'Вольк');
  merc.alive = false; merc.hp = 0;
  c.targetId = merc.id; // прямой write (ядро отклоняет союзников, 000080)
  assert.equal(hatchTiles175(tickSlice(canvas, rafStubs)).length, 0,
    'цель — союзник (side «ally») — 0 штрихов (гейт: только side «mob»)');
});

test('боевой UI: 000175 H6 — регрессия сцены H1: calls[0] = базовый fillRect, calls[1] = фон; #ffe27a = 1 (кольцо цели цело); число drawImage не изменилось (штриховка — stroke, не drawImage)', () => {
  const S = scene175({
    dungeonType: 4, // abyss → 'assets/combat/bg/abyss.svg'
    loader: [
      ['assets/combat/bg/', { __fake: 'bg' }],
      ['assets/combat/obstacles/', { __fake: 'obs' }],
      ['assets/sprites/mobs/wolf_', { __fake: 'wolf' }],
    ],
  });
  const { G, c, canvas, rafStubs } = S;
  const wolf = c.units.find((u) => u.mobId === 'wolf');
  const t = tickSlice(canvas, rafStubs);
  const tiles = hatchTiles175(t);
  assert.ok(tiles.length > 0, 'краснота: штриховки нет (слой не реализован)');
  assert.equal(tiles.length, G.mobReachCells(c, wolf).size,
    'число штрихов == число клеток');
  // (a) Ранние индексы НЕ сдвинулись: calls[0] — базовый fillRect,
  //     calls[1] — фон (сетка — после, пин 000049 держится).
  assert.equal(t.calls[0][0], 'fillRect', 'calls[0] — базовая заливка');
  assert.deepEqual(t.calls[0][1], [0, 0, 336, 336],
    'calls[0] — всё поле 7×7 (336×336)');
  assert.equal(t.calls[1][0], 'drawImage',
    'calls[1] — фон (до сетки, пин 000049)');
  // (b) #ffe27a — ровно ОДИН раз: кольцо выбранной цели цело
  //     (штриховка — другой цвет, пин 000084 не задет).
  const gold = t.styleCalls
    .filter((s) => s[0] === 'strokeStyle' && s[1] === '#ffe27a');
  assert.equal(gold.length, 1,
    'ровно одно #ffe27a — кольцо цели (штриховка — свой цвет)');
  // (c) Число drawImage НЕ изменилось: фон + препятствия + волк —
  //     штриховка не добавляет drawImage (только stroke).
  const diCount = t.calls.filter((x) => x[0] === 'drawImage').length;
  assert.equal(diCount, c.obstacles.size + 2,
    'drawImage = фон + препятствия + волк (штриховка не добавляет)');
});

// Якорь A175-1 (зелёный с момента написания, в red-count НЕ входит):
// 0 штрихов при targetId=null / мёртвом мобе / мёртвом союзнике /
// fled-мобе — страхует гейт (D6) и дефолтный рендер «вы»; смежные
// 000166/000168 не ломаются.
test('боевой UI: 000175 A175-1 (якорь) — 0 штрихов при targetId=null / мёртвом мобе / мёртвом союзнике / fled-мобе', () => {
  // (a) targetId = null (автоцель — игрок).
  {
    const S = scene175();
    S.c.targetId = null;
    assert.equal(hatchTiles175(tickSlice(S.canvas, S.rafStubs)).length, 0,
      'targetId = null — штриховки нет');
  }
  // (b) Мёртвый моб (прямой write; targetId не трогаем).
  {
    const S = scene175();
    const wolf = S.c.units.find((u) => u.mobId === 'wolf');
    wolf.alive = false; wolf.hp = 0;
    assert.equal(hatchTiles175(tickSlice(S.canvas, S.rafStubs)).length, 0,
      'мёртвый моб — штриховки нет');
  }
  // (c) Мёртвый союзник (прямой write c.targetId — паттерн 000166).
  {
    const S = scene175();
    const merc = addMerc84(S.c, S.G, 3, 5, 'melee', 'Вольк');
    merc.alive = false; merc.hp = 0;
    S.c.targetId = merc.id;
    assert.equal(hatchTiles175(tickSlice(S.canvas, S.rafStubs)).length, 0,
      'мёртвый союзник (side «ally») — штриховки нет');
  }
  // (d) Fled-моб (fled = true, alive).
  {
    const S = scene175();
    const wolf = S.c.units.find((u) => u.mobId === 'wolf');
    wolf.fled = true;
    assert.equal(hatchTiles175(tickSlice(S.canvas, S.rafStubs)).length, 0,
      'fled-моб — штриховки нет');
  }
});


// =====================================================================
// Задача 000174. Бой: анимация передвижения мобов по пути A* (вместо
// телепортации). КРАСНЫЕ тесты (TDD), vm-песочница (паттерн
// scene84/makeRafStubs/press — НО с ИЗМЕНЯЕМОЙ T: let T + performance
// { now: () => T }; без opts.performance nowMs() = Date.now() — реальное
// время, пинить нельзя). Контракт — memory/000174-mob-move-anim.md
// («Механизм анимации»): endTurn-тханк drain'ит c._uiMoves (ядро
// записывает принятые «to»-тайлы волны) → moveAnims; drawUnits рисует
// моба по ДРОБНОМУ якорю mobAnchor(u, now): 300 мс на сегмент,
// ПООТРЕЗОЧНЫЙ smoothstep (каждый сегмент — свой глейд); tAll >= 1 —
// якорь = модель, entry self-cleaned. Новых rAF НЕТ (пин :725) —
// playback на существующем tick-цикле 000047. Pre-roll НЕ анимируется
// (решение C — пины :518/:568/:2656).
//
// Краснота (осмысленная): mob не анимируется — первый же ассерт
// позиции падает «факт: финальная клетка, ожидание: промежуточная»
// (c._uiMoves — undefined → существование); не крах.
//
// expectedRedCount (этот файл) = 2 (R5, R6); G2 — зелёный guard
// (pre-roll не анимируется: первый рендер = пост-pre-roll тайл;
// rAF-цикл не задет).
// =====================================================================

// drawImage-якорь конкретного фэйк-изображения в срезе drawCalls
// (один рендер = один вызов на моба — сигнатура по объекту-метке,
// паттерн :568/:901).
const diOf = (calls, img) => calls
  .find((x) => x[0] === 'drawImage' && x[1][0] === img);

test('боевой UI: 000174-R5 — fast-волк (movePerTurn=2): якорь спрайта едет ПО ПОСЛЕДОВАТЕЛЬНОСТИ тайлов A* (старт → дробная середина → финиш), не телепорт; rAF-цикл не задет', () => {
  let T = 0;
  const rafStubs = makeRafStubs();
  const { G, keydown, body } = loadCombatUi(true, {
    performance: { now: () => T },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  const fakeMove = { __fake: 'move' };
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
    spriteLoader: {
      image: (p) => (p.includes('_move_') ? fakeMove : null),
    },
  });
  const canvas = findCanvas(body);
  const wolf = c.units.find((u) => u.mobId === 'wolf');
  // pre-roll (seed 42: волк (1,0)→(1,1)) не анимируется — ядро выбрасывает
  // шаги pre-roll (решение C): поле null, а не «волна, которую ещё нет».
  assert.equal(c._uiMoves, null,
    'pre-roll выброшен: c._uiMoves === null (краснота: поле отсутствует)');
  // Явная геометрия: волк (3,3), игрок (3,6), камней нет — волна =
  // 2 шага (3,4),(3,5) (fast: movePerTurn=2, test-only override).
  wolf.x = c.px; wolf.y = c.py - 3;
  c.obstacles.clear();
  wolf.movePerTurn = 2;
  c._rng = () => 0.99;
  const pin = (tx, ty, what) => {
    const di = diOf(calls, fakeMove);
    assert.ok(di, what + ': спрайт волка нарисован (move-кадр, регрессия 000062)');
    assert.equal(di[1][1], tx * 48 + 8, what + ': x — дробный якорь + запас 8px');
    assert.equal(di[1][2], ty * 48 + 8, what + ': y — дробный якорь + запас 8px');
  };
  // Волна + синхронный render handleCode (T=0): якорь = СТАРТОВЫЙ тайл
  // (3,3). Краснота: модель уже (3,5) — спрайт на (152,248), «телепорт».
  let n0 = canvas.drawCalls.length;
  press(keydown, 'Space');
  let calls = canvas.drawCalls.slice(n0);
  assert.equal(rafStubs.scheduled.length, 1,
    'анимация НЕ шлёт новых rAF (только цикл 000047)');
  assert.equal(c._uiMoves, null, 'UI забрал данные (drain → null)');
  pin(3, 3, 'T=0: стартовый тайл (3,3)');
  // Глейд: 300 мс на СЕГМЕНТ (2 сегмента = 600 мс), поотрезочный
  // smoothstep: T=150 → (3,3.5); T=300 → граница сегмента (3,4);
  // T=450 → (3,4.5); T=600 → (3,5) = модель.
  for (const [dT, fx, fy, what] of [
    [150, 3, 3.5, 'T=150: дробная середина сегмента (3,3.5)'],
    [150, 3, 4, 'T=300: граница сегмента (3,4)'],
    [150, 3, 4.5, 'T=450: (3,4.5)'],
    [150, 3, 5, 'T=600: (3,5) — финальный тайл = модель'],
  ]) {
    T += dT;
    n0 = canvas.drawCalls.length;
    rafStubs.scheduled[rafStubs.scheduled.length - 1](); // tick → render
    calls = canvas.drawCalls.slice(n0);
    pin(fx, fy, what);
  }
  assert.equal(c._uiMoves, null, 'после глейда поле по-прежнему null');
  // Повторный render при том же now (self-cleaning идемпотентен, пин
  // :1618): entry удалён при tAll >= 1 — якорь = модель, те же координаты.
  n0 = canvas.drawCalls.length;
  rafStubs.scheduled[rafStubs.scheduled.length - 1]();
  calls = canvas.drawCalls.slice(n0);
  pin(3, 5, 'повторный render: те же координаты (entry self-cleaned)');
  // rAF-регрессия: N тиков → N+1 scheduled (цикл один, новых НЕТ).
  assert.equal(rafStubs.scheduled.length, 6,
    '5 тиков → 6 scheduled (1 startCombat + 5, новых циклов нет)');
});

test('боевой UI: 000174-R6 — два fast-моба (orc_rider + centipede): каждый глейдит СВОЙ путь A* (у centipede излом у камней), не «один штамп»; прямой лерп старт→финал срезал бы излом', () => {
  let T = 0;
  const rafStubs = makeRafStubs();
  const { G, keydown, body } = loadCombatUi(true, {
    performance: { now: () => T },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  const fakeRider = { __fake: 'rider' }, fakeCentip = { __fake: 'centip' };
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(),
    mobs: ['orc_rider', 'centipede'], mobLevel: 1, seed: 7,
    spriteLoader: {
      image: (p) => {
        if (!p.includes('_move_')) return null;
        if (p.startsWith('assets/sprites/mobs/orc_rider_')) return fakeRider;
        if (p.startsWith('assets/sprites/mobs/centipede_')) return fakeCentip;
        return null;
      },
    },
  });
  const canvas = findCanvas(body);
  const rider = c.units.find((u) => u.mobId === 'orc_rider');
  const centip = c.units.find((u) => u.mobId === 'centipede');
  // pre-roll (оба инициативы 6) не анимируется (решение C).
  // Явная геометрия: райдер (0,0), centipede (6,0), камни (5,0) и (6,2),
  // игрок (3,6). Волна (оба fast, movePerTurn=2): райдер — прямая
  // (1,0),(2,0); centipede — ИЗЛОМ (6,1),(5,1) (жадный шаг x-first:
  // (5,0) закрыт → вниз, затем влево). Пины проверены прогоном
  // (memory/000174-mob-move-anim.md, «Как проверяли»).
  c.obstacles.clear();
  rider.x = 0; rider.y = 0;
  centip.x = 6; centip.y = 0;
  c.obstacles.add('5,0'); c.obstacles.add('6,2');
  c._rng = () => 0.99;
  let n0;
  const pinPair = (rx, ry, kx, ky, what) => {
    const calls = canvas.drawCalls.slice(n0);
    const dr = diOf(calls, fakeRider);
    assert.ok(dr, what + ': райдер нарисован (move-кадр)');
    assert.equal(dr[1][1], rx * 48 + 8, what + ': райдер x — СВОЙ якорь');
    assert.equal(dr[1][2], ry * 48 + 8, what + ': райдер y — СВОЙ якорь');
    const dk = diOf(calls, fakeCentip);
    assert.ok(dk, what + ': centipede нарисована (move-кадр)');
    assert.equal(dk[1][1], kx * 48 + 8, what + ': centipede x — СВОЙ якорь');
    assert.equal(dk[1][2], ky * 48 + 8, what + ': centipede y — СВОЙ якорь');
  };
  n0 = canvas.drawCalls.length;
  press(keydown, 'Space'); // T=0: волна + синхронный render
  pinPair(0, 0, 6, 0, 'T=0: стартовые тайлы');
  // Т-150: райдер (0.5,0) → (32,8); centipede (6,0.5) → (296,32).
  // КОНТРФАКТ: прямой лерп старт→финал ((6,0)→(5,1), tAll=0.25) дал бы
  // (5.75,0.25) → (284,20) — ДРУГАЯ точка: анимация идёт по записанной
  // A*-полилинии (излом), а не срезает его.
  for (const [dT, rx, ry, kx, ky, what] of [
    [150, 0.5, 0, 6, 0.5, 'T=150: середина сегмента (излом centipede)'],
    [150, 1, 0, 6, 1, 'T=300: граница сегмента (centipede на (6,1) — излом)'],
    [300, 2, 0, 5, 1, 'T=600: финал — каждый на СВОЁМ тайле'],
  ]) {
    T += dT;
    n0 = canvas.drawCalls.length;
    rafStubs.scheduled[rafStubs.scheduled.length - 1](); // tick → render
    pinPair(rx, ry, kx, ky, what);
    if (T === 150) {
      const dk = diOf(canvas.drawCalls.slice(n0), fakeCentip);
      assert.ok(!(dk[1][1] === 284 && dk[1][2] === 20),
        'T=150: НЕ «прямой лерп» старт→финал (284,20) — излом сохраняется');
    }
  }
  assert.equal(rafStubs.scheduled.length, 4,
    '3 тика → 4 scheduled (новых циклов нет)');
});

test('боевой UI: 000174-G2 (guard) — pre-roll не анимируется: первый рендер = пост-pre-roll тайл; rAF-цикл не задет (ровно 1 tick)', () => {
  const rafStubs = makeRafStubs();
  const { G, body } = loadCombatUi(true, {
    performance: { now: () => 1000 },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  const fakeWolf = { __fake: 'wolf' };
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
    spriteLoader: {
      image: (p) =>
        (p.startsWith('assets/sprites/mobs/wolf_') ? fakeWolf : null),
    },
  });
  const wolf = c.units.find((u) => u.mobId === 'wolf');
  // pre-roll (seed 42) сдвинул волка (1,0)→(1,1) ДО первого кадра: первый
  // рендер рисует пост-pre-roll тайл (формализация пина :568 под 000174 —
  // первый кадр НЕ «доигрывает» pre-roll-глейд при фиксированном now).
  const di = diOf(findCanvas(body).drawCalls, fakeWolf);
  assert.ok(di, 'спрайт волка нарисован');
  assert.equal(di[1][1], wolf.x * 48 + 8,
    'x = пост-pre-roll тайл (' + wolf.x + '*48+8), не спавн (1,0)');
  assert.equal(di[1][2], wolf.y * 48 + 8,
    'y = пост-pre-roll тайл (' + wolf.y + '*48+8)');
  assert.equal(rafStubs.scheduled.length, 1,
    'rAF-цикл не задет: ровно 1 tick после startCombat');
});

// Регрессии ревью 000174 (правки по итогам ревью): «истёкший без
// рендера» entry в moveAnims + новая волна того же моба. Окно — между
// концом глейда и следующим тиком (в браузере ~1 rAF-фрейм): Space в
// момент, когда моб «доехал». До фикса: (R7) TypeError в handleCode
// (mobAnchor self-cleaning-обнулял moveAnims, moveAnims.set на null);
// (R8) reverse-глейд — from = НОВАЯ модель (новый финал), а не старый
// финальный тайл. Краснота: R7 — краш при press; R8 — якорь на новом
// финале вместо старого (координаты).

test('боевой UI: 000174-R7 — истёкший без рендера глейд + новая волна того же моба: Space НЕ крашит, якорь = СТАРЫЙ финальный тайл, глейд продолжается (регрессия ревью: TypeError в startMoveAnims)', () => {
  let T = 0;
  const rafStubs = makeRafStubs();
  const { G, keydown, body } = loadCombatUi(true, {
    performance: { now: () => T },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  const fakeMove = { __fake: 'move' };
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
    spriteLoader: {
      image: (p) => (p.includes('_move_') ? fakeMove : null),
    },
  });
  const canvas = findCanvas(body);
  const wolf = c.units.find((u) => u.mobId === 'wolf');
  // Явная геометрия: волк (3,1), игрок (3,6) — d=5: обе волны — ЧИСТО
  // движение (атака — только после финиша 2-й волны), камней нет.
  // fast-волк (2 сегмента = 600 мс глейда): волна 1 (3,1)→(3,2)→(3,3);
  // волна 2 (3,3)→(3,4)→(3,5).
  wolf.x = c.px; wolf.y = c.py - 5;
  c.obstacles.clear();
  wolf.movePerTurn = 2;
  c._rng = () => 0.99;
  let n0;
  const pin = (tx, ty, what) => {
    const di = diOf(canvas.drawCalls.slice(n0), fakeMove);
    assert.ok(di, what + ': спрайт волка нарисован (move-кадр)');
    assert.equal(di[1][1], tx * 48 + 8, what + ': x-якорь');
    assert.equal(di[1][2], ty * 48 + 8, what + ': y-якорь');
  };
  // Волна 1 (T=0) + синхронный render: якорь = стартовый тайл (3,1).
  n0 = canvas.drawCalls.length;
  press(keydown, 'Space');
  assert.equal(c._uiMoves, null, 'волна 1: UI забрал данные (drain)');
  pin(3, 1, 'T=0: стартовый тайл (3,1)');
  // Кадры в пределах глейда (тот же паттерн, что R5): 150/300/450/585 —
  // глейд жив до T=600. ПОСЛЕДНИЙ кадр — T=585 (tAll=0.975); рендера
  // ПОСЛЕ истечения (T≥600) НЕ БЫЛО — entry в moveAnims, окно «до
  // следующего тика» (браузер: ~1 rAF-фрейм; быстрое Space попадает в
  // него).
  for (const dT of [150, 150, 150, 135]) {
    T += dT;
    n0 = canvas.drawCalls.length;
    rafStubs.scheduled[rafStubs.scheduled.length - 1](); // tick → render
  }
  assert.equal(rafStubs.scheduled.length, 5,
    'startCombat + 4 тика = 5 scheduled (новых циклов нет)');
  // T=600: Space БЕЗ промежуточного тика. Волна 2 двигает ТОГО ЖЕ
  // волка; старый entry истёк (tAll = 600/600 = 1) и не был
  // self-cleaned. До фикса: mobAnchor(истёкший) обнулял moveAnims
  // (единственный entry) → moveAnims.set → TypeError в handleCode.
  T = 600;
  n0 = canvas.drawCalls.length;
  assert.doesNotThrow(() => press(keydown, 'Space'), TypeError,
    'Space в момент истечения старого глейда — без TypeError');
  assert.equal(c._uiMoves, null, 'волна 2: UI забрал данные (drain)');
  // Якорь волны 2 = СТАРЫЙ финальный тайл (3,3) (beforePos), а НЕ новый
  // финал (3,5) (модель) и не «телепорт» на него.
  pin(3, 3, 'T=600: якорь волны 2 = старый финал (3,3), не новый (3,5)');
  // Глейд продолжается от старого финала: T=750 → (3,3.5).
  T += 150;
  n0 = canvas.drawCalls.length;
  rafStubs.scheduled[rafStubs.scheduled.length - 1](); // tick → render
  pin(3, 3.5, 'T=750: глейд волны 2 от (3,3): середина (3,3.5)');
  assert.equal(rafStubs.scheduled.length, 6,
    '5 + 1 тик = 6 scheduled (анимация новых rAF не шлёт)');
});

test('боевой UI: 000174-R8 — два моба разной скорости: истёкший entry НЕ последний в Map — краша нет, якорь медленного моба = СТАРЫЙ финал (не reverse-глейд от новой модели) (регрессия ревью)', () => {
  let T = 0;
  const rafStubs = makeRafStubs();
  const { G, keydown, body } = loadCombatUi(true, {
    performance: { now: () => T },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  const fakeRider = { __fake: 'rider' }, fakeWolf = { __fake: 'wolf' };
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(),
    mobs: ['orc_rider', 'wolf'], mobLevel: 1, seed: 7,
    spriteLoader: {
      image: (p) => {
        if (!p.includes('_move_')) return null;
        if (p.startsWith('assets/sprites/mobs/orc_rider_')) return fakeRider;
        if (p.startsWith('assets/sprites/mobs/wolf_')) return fakeWolf;
        return null;
      },
    },
  });
  const canvas = findCanvas(body);
  const rider = c.units.find((u) => u.mobId === 'orc_rider');
  const wolf = c.units.find((u) => u.mobId === 'wolf');
  // Явная геометрия: райдер (0,0) — fast (2 тайла, 600 мс глейда),
  // волк (3,3) — 1 тайл (300 мс), игрок (3,6), камней нет.
  // Волна 1: райдер (1,0),(2,0); волк (3,4). Волна 2 (T=550): райдер
  // (3,0),(3,1) (глейд ЖИВ: 550 < 600); волк (3,5) (глейд ИСТЁК:
  // 550 ≥ 300, рендера после T=150 не было).
  rider.x = 0; rider.y = 0;
  wolf.x = c.px; wolf.y = c.py - 3;
  c.obstacles.clear();
  rider.movePerTurn = 2;
  wolf.movePerTurn = 1;
  c._rng = () => 0.99;
  let n0;
  const pinWolf = (tx, ty, what) => {
    const dw = diOf(canvas.drawCalls.slice(n0), fakeWolf);
    assert.ok(dw, what + ': спрайт волка нарисован (move-кадр)');
    assert.equal(dw[1][1], tx * 48 + 8, what + ': волк x-якорь');
    assert.equal(dw[1][2], ty * 48 + 8, what + ': волк y-якорь');
  };
  n0 = canvas.drawCalls.length;
  press(keydown, 'Space'); // T=0: волна 1 + синхронный render
  const dr0 = diOf(canvas.drawCalls.slice(n0), fakeRider);
  assert.ok(dr0, 'T=0: райдер нарисован');
  assert.equal(dr0[1][1], 0 * 48 + 8, 'T=0: райдер на старте (0,0)');
  assert.equal(dr0[1][2], 0 * 48 + 8, 'T=0: райдер y-якорь');
  pinWolf(3, 3, 'T=0: волк на старте (3,3)');
  // Единственный кадр в пределах глейдов (T=150: райдер 0.25, волк
  // 0.5 — оба живы, entry НЕ self-cleaned).
  T = 150;
  n0 = canvas.drawCalls.length;
  rafStubs.scheduled[rafStubs.scheduled.length - 1](); // tick → render
  // T=550: Space БЕЗ тика между 150 и 550. Волк: entry истёк, но НЕ
  // последний в Map (райдер жив) — до фикса краша не было, НО
  // from = новая модель (3,5) → reverse-глейд/телепорт на новый
  // финал. Райдер: entry жив — re-timing (поведение не меняется).
  T = 550;
  n0 = canvas.drawCalls.length;
  assert.doesNotThrow(() => press(keydown, 'Space'), TypeError,
    'Space при истёкшем entry одного из двух мобов — без TypeError');
  pinWolf(3, 4, 'T=550: волк — старый финал (3,4), не новый (3,5)');
  const dr1 = diOf(canvas.drawCalls.slice(n0), fakeRider);
  assert.ok(dr1, 'T=550: райдер нарисован (re-timing живого глейда)');
  // Глейд волка продолжается от СТАРОГО финала: T=700 → (3,4.5).
  T += 150;
  n0 = canvas.drawCalls.length;
  rafStubs.scheduled[rafStubs.scheduled.length - 1](); // tick → render
  pinWolf(3, 4.5, 'T=700: глейд волка от (3,4): середина (3,4.5)');
  assert.equal(rafStubs.scheduled.length, 3,
    'startCombat + 2 тика = 3 scheduled (новых циклов нет)');
});

// --- Задача 000171: кнопка «Воскрешение» в панели действий (клик/тач).
// Контракты: memory/000171-combat-resurrect-button.md (кнопка/гашение/
// автоцель/каст), memory/000171-touch-buttons.md (общий принцип ТЗ:
// каждое действие UI — видимый элемент, нажимаемый мышкой или тачем).
//
// КРАСНЫЕ (кнопки ещё нет — build() строит ТОЛЬКО 7 табличных кнопок из
// COMBAT_KEYS): CU171-BTN, CU171-CAST, CU171-AUTO, CU171-OFF. Падения —
// осмысленные (assert.ok(b): кнопки с dataset.act=resurrect не
// существует), не крахи: цепочка index.html в песочнице грузится без
// изменений (файлов нет, существующие не тронуты).
// ЗЕЛЁНЫЙ guard: CU171-GATE — гейт canResurrect (дефолтный герой без
// 'resurrect' — кнопки нет; защита пинов «7 штук»/000124/000168-UI-2).
//
// Сцены — scene166 (hero.mp=50, hero.spells=['resurrect'], Вольк, волк,
// NOW166, withSpells, rAF-стабы). Кнопка — S.buttons.find(dataset.act
// === 'resurrect') (стаб пушит каждый createElement('button')); клик —
// b.listeners.click[0]() (стаб-клик работает и на disabled — пин
// предпроверки: стаб-клик/смена состояния → отказ в журнал, каста нет).
//
// ПОСЛЕ ОБЯЗАТЕЛЬНОГО РЕБЕЙЗА (000168) в этот же блок добавляются
// CU171-ALLY/CU171-EFIR (ходы наёмника/Эфира: disabled «недоступно
// активному персонажу», стаб-клик — без каста/трат): их состояния
// (activeUnitId, phase 'player' на ходу союзника) существуют ТОЛЬКО
// после 000168 — до ребейза писать нельзя (были бы красными «не по
// причине»).

test('боевой UI: 000171 — кнопка «Воскрешение» в .combat-actions: иконка/aria-label/без подписи, активна при мёртвом союзнике БЕЗ тапа по клетке (CU171-BTN)', () => {
  const S = scene166({ deadAllies: 1 });
  const { c, ally, wolf } = S;
  assert.ok(!ally.alive && ally.hp === 0, 'фикстура: союзник мёртв');
  const b = S.buttons.find((x) => x.dataset.act === 'resurrect');
  assert.ok(b, 'кнопка «Воскрешение» существует (dataset.act=resurrect)');
  const actions = findByClass(S.body, 'combat-actions');
  assert.ok(actions.children.includes(b), 'кнопка — в панели .combat-actions');
  assert.equal(b.ariaLabel, 'Воскрешение', 'aria-label — имя действия');
  assert.equal(b.textContent, '', 'текстовой подписи нет (000124)');
  assert.equal(b.children.length, 1, 'ровно ОДИН дочерний элемент');
  const img = b.children[0];
  assert.equal(img.tagName, 'img', 'иконка — <img>');
  assert.equal(img.src, 'assets/spell-icons/resurrect.svg',
    'иконка 000017 (та же, что в строке книги; НОВЫХ ассетов нет)');
  assert.ok(fs.existsSync(path.join(ROOT, 'assets/spell-icons/resurrect.svg')),
    'файл иконки существует в каталоге');
  assert.equal(img.alt, '', 'alt="" (иконка презентационная)');
  assert.equal(c.targetId, wolf.id,
    'цель НЕ тапалась (авто-цель начала хода — волк)');
  assert.equal(b.disabled, false,
    'мёртвый союзник = автоцель: кнопка активна БЕЗ тапа по клетке');
});

test('боевой UI: 000171 — тап кнопки «Воскрешение» с выбранным мёртвым союзником: один тап = воскрешение, ход не сгорел, 0 новых c._rng (CU171-CAST)', () => {
  const S = scene166({ deadAllies: 1 });
  const { c, ally, wolf } = S;
  assert.ok(!ally.alive, 'фикстура: союзник мёртв');
  // 1. Выбор цели — клик по клетке мёртвого союзника (000166; кнопка
  // работает и без него — CU171-AUTO).
  S.canvas.listeners.click[0]({
    clientX: (ally.x + 0.5) * 48, clientY: (ally.y + 0.5) * 48,
  });
  assert.equal(c.targetId, ally.id, 'клик — мёртвый союзник выбран');
  // 2. Состояние ПЕРЕД кастом (D11: «до-значения»).
  const mp0 = c.player.mp;
  const wis0 = c.ps.spellWis;
  const round0 = c.round;
  assert.equal(c.phase, 'player', 'ход игрока');
  const realRng = c._rng;
  let rngCalls = 0;
  c._rng = () => (rngCalls++, realRng());
  // 3. Тап кнопки (мобильный путь: книга НЕ открывается).
  const b = S.buttons.find((x) => x.dataset.act === 'resurrect');
  assert.ok(b, 'кнопка «Воскрешение» существует');
  b.listeners.click[0]();
  // 4. Результат ОДНОГО тапа.
  assert.equal(ally.alive, true, 'союзник возвращён в бой');
  assert.equal(ally.hp, Math.round(ally.maxHP / 2),
    'hp = round(maxHP/2) (формула 000163, не хардкод)');
  assert.equal(c.player.mp, mp0 - 15, 'мана −15');
  assert.equal(c.ps.spellWis, wis0 - 1, 'пул «Заклинание» (Мудрость) −1');
  assert.ok(c.log.some((s) => s === 'Возвращён в бой.'),
    'лог «Возвращён в бой.»');
  assert.equal(c._fx && c._fx.action, 'cast', 'c._fx — cast (паттерн castRow)');
  assert.ok(c._fx && c._fx.until > NOW166, 'c._fx.until > now');
  assert.equal(c.phase, 'player', 'ход НЕ сгорел (каст ≠ endTurn)');
  assert.equal(c.round, round0, 'раунд не сдвинулся');
  assert.equal(rngCalls, 0,
    'новых вызовов c._rng — ноль (воскрешение без RNG, 000163)');
});

test('боевой UI: 000171 — АВТО-ЦЕЛЬ (мобильный кейс): цель не выбрана (c.targetId — волк), ОДИН тап — первый мёртвый союзник; саб: мёртвый игрок приоритетно (CU171-AUTO)', () => {
  // (a) Игрок НЕ тапал клетку канваса (не обнаруживаемый трюк 000166):
  // кнопка сама берёт валидную мёртвую цель (resurrectTargetId → null →
  // авто-правило ядра 000163 R-1/R-2).
  const S = scene166({ deadAllies: 1 });
  const { c, ally, wolf } = S;
  assert.ok(!ally.alive, 'фикстура: союзник мёртв');
  assert.equal(c.targetId, wolf.id,
    'цель не тапалась: волк (авто-цель начала хода)');
  const mp0 = c.player.mp;
  const b = S.buttons.find((x) => x.dataset.act === 'resurrect');
  assert.ok(b, 'кнопка «Воскрешение» существует');
  b.listeners.click[0]();
  assert.equal(ally.alive, true, 'один тап — союзник воскрешён (автоцель)');
  assert.equal(ally.hp, Math.round(ally.maxHP / 2), 'hp = round(maxHP/2)');
  assert.equal(c.player.mp, mp0 - 15, 'мана −15');
  assert.ok(c.log.some((s) => s === 'Возвращён в бой.'),
    'лог «Возвращён в бой.»');
  // (b) Саб: мёртвый ИГРОК — приоритет автоцели (000163 R-1): воскрешён
  // игрок, союзник остался мёртв.
  const S2 = scene166({ deadAllies: 1, deadPlayer: true });
  const { G: G2, c: c2, ally: ally2 } = S2;
  assert.ok(!c2.player.alive && !ally2.alive,
    'фикстура: мертвы и игрок, и союзник');
  const mp1 = c2.player.mp;
  const b2 = S2.buttons.find((x) => x.dataset.act === 'resurrect');
  assert.ok(b2, 'кнопка существует (есть мёртвые: игрок и союзник)');
  b2.listeners.click[0]();
  assert.equal(c2.player.alive, true, 'авто: игрок воскрешён (приоритет)');
  assert.equal(c2.player.hp, Math.round(G2.derived(c2.player).maxHP / 2),
    'игрок — 50% derived maxHP');
  assert.equal(ally2.alive, false, 'союзник мёртв (авто взяла игрока)');
  assert.equal(c2.player.mp, mp1 - 15, 'мана −15');
  assert.ok(!c2.result, 'c.result не появился');
});

test('боевой UI: 000171 — гейты кнопки «Воскрешение»: disabled + title ДОСЛОВНО; стаб-клик — причина в журнал, трат нет, мёртвые остаются мёртвы (CU171-OFF)', () => {
  const cases = [
    // (a) мёртвых нет → «нет цели» (сцена без deadAllies — единственный
    // кейс, где отсутствие цели — единственная причина).
    { opts: {}, title: 'нет цели' },
    // (b) мёртвый союзник ЕСТЬ, маны нет → «не хватает маны (15)».
    { opts: { deadAllies: 1 }, title: 'не хватает маны (15)',
      mut: (S) => { S.c.player.mp = 0; } },
    // (c) пул Мудрости 0 → существующая формулировка evalSpell.
    { opts: { deadAllies: 1 },
      title: 'действий «Заклинание» (Мудрость) больше нет',
      mut: (S) => { S.c.ps.spellWis = 0; } },
    // (d) не ход игрока → «не ваш ход» (порядок гейтов: ПЕРЕД целью).
    { opts: { deadAllies: 1 }, title: 'не ваш ход',
      mut: (S) => { S.c.phase = 'mob'; } },
    // (e) бой закончен → «бой закончен» (порядок гейтов: ПЕРВЫЙ).
    { opts: { deadAllies: 1 }, title: 'бой закончен',
      mut: (S) => { S.c.result = { outcome: 'victory', xp: 0, gold: 0 }; } },
  ];
  for (const { opts, title, mut } of cases) {
    const S = scene166(opts);
    const { c, ally } = S;
    if (mut) mut(S);
    tickSlice(S.canvas, S.rafStubs);
    // (ре-рендер: состояние кнопки — из нового состояния боя)
    const b = S.buttons.find((x) => x.dataset.act === 'resurrect');
    assert.ok(b, 'кнопка «Воскрешение» существует: ' + title);
    assert.equal(b.disabled, true, 'disabled: ' + title);
    assert.equal(b.title, title, 'title — причина ДОСЛОВНО: ' + title);
    const mp0 = c.player.mp, wis0 = c.ps.spellWis, n0 = c.log.length;
    b.listeners.click[0](); // стаб-клик: работает и на disabled
    const added = Array.from(c.log).slice(n0);
    assert.deepEqual(added, [title],
      'ровно ОДНА строка — причина в журнал: ' + JSON.stringify(added));
    assert.equal(c.player.mp, mp0, 'мана не потрачена: ' + title);
    assert.equal(c.ps.spellWis, wis0, 'пул не потрачен: ' + title);
    const wasAlive = !!ally.alive;
    assert.equal(ally.alive, wasAlive, 'мёртвые остаются мёртвы: ' + title);
  }
});

test('боевой UI: 000171 — гейт canResurrect: дефолтный герой (без «Воскрешения») — кнопки НЕТ, панель 7 кнопок (CU171-GATE)', () => {
  // Зелёный guard: кнопка создаётся ТОЛЬКО под гейтом canResurrect
  // (носитель знает 'resurrect'); дефолтный герой (sheet.js:
  // ['spark','mend']) — панели бит-в-байт: пины «7 штук»/000124/
  // 000168-UI-2 остаются зелёными БЕЗ ре-пина (спящий пин, паттерн
  // 000166).
  const S = scene166({ resurrect: false, deadAllies: 1 });
  const { c, ally } = S;
  assert.ok(!c.player.spells.includes('resurrect'),
    'герой НЕ знает «Воскрешение» (дефолт)');
  assert.ok(!ally.alive,
    'фикстура: союзник мёртв (гейт — знание, а не «мёртвых нет»)');
  assert.equal(S.buttons.length, 7,
    'панель — 7 кнопок (кнопки «Воскрешение» нет)');
  assert.ok(!S.buttons.some((x) => x.dataset.act === 'resurrect'),
    'dataset.act=resurrect отсутствует');
});

// --- Задача 000171 (ДОБАВЛЕНО ПОСЛЕ РЕБЕЙЗА НА 000168): ходы
// СОЮЗНИКОВ. Контракт — memory/000171-combat-resurrect-button.md
// §3.2/§3.4 (гейт 3 + предпроверка): с 000168 на ходу СОЮЗНИКА
// c.phase === 'player' — checkTurn evalSpell его от хода игрока НЕ
// отличает; без гейта activeUnitId клик кнопки кастовал 'resurrect'
// ИГРОКА за ману/пул игрока (000163: castSpell тратит c.ps/p.mp).
// Пин: на ходах союзников кнопка disabled с дословной строкой 000168
// «недоступно активному персонажу», стаб-клик — отказ в лог,
// каста/трат НЕТ (от имени игрока НЕ кастуется).
// Фикстура — scene84 + аддитивная опция opts.resurrect (hero знает
// 'resurrect' ДО startCombat); addMerc84 (a1) + ручной makeAlly idx 2
// (a2): МЁРТВЫЙ a1 = автоцель (кнопка активна на ходу игрока),
// ЖИВОЙ a2 = стоп очереди (advanceQueue мёртвый слот ПРОПУСКАЕТ —
// «серый слот», 000167/000168 — единственный merc мёртвым до Space
// не остановил бы очередь).

test('боевой UI: 000171 — ход НАЁМНИКА: кнопка «Воскрешение» disabled «недоступно активному персонажу»; стаб-клик — без каста/трат от имени игрока (CU171-ALLY)', () => {
  // (000168-UI-2(a)-паттерн: очередь [m0, player, a1, a2]; pre-roll —
  // волк (m0) ДО игрока; Space — конец хода игрока → a1 (мёртв)
  // пропущен, стоп на ЖИВОМ a2 — activeUnitId 'a2'.)
  // spells: true — каталог/движок заклинаний в цепочке (withSpells
  // 000149/000168): без G.Spells кнопка гасла бы «Заклинания
  // недоступны» (деградация) — а не по гейтам 000171.
  const S = scene84({ resurrect: true, spells: true });
  const a1 = addMerc84(S.c, S.G, 3, 5, 'melee', 'Вольк');
  const a2 = S.G.makeAlly({ name: 'Гарик', role: 'melee', level: 2,
    dmg: 1, hp: 1 }, 2);
  a2.x = 4; a2.y = 5;
  S.c.units.push(a2);
  S.c.turnOrder.push(a2.id);
  S.G.combatInternals.dealDamageToAlly(S.c, a1, 9999); // мёртвый = автоцель
  tickSlice(S.canvas, S.rafStubs);
  assert.equal(S.G.activeUnitId(S.c), 'player', 'ход игрока');
  const byAct = {};
  for (const b of S.body.querySelectorAll('.combat-actions button'))
    byAct[b.dataset.act] = b;
  assert.ok(byAct.resurrect, 'кнопка «Воскрешение» существует (hero знает)');
  assert.equal(byAct.resurrect.disabled, false,
    'на ходу ИГРОКА с мёртвым союзником — активна (автоцель a1)');
  // Конец хода игрока → очередь остановилась на живом наёмнике a2.
  press(S.keydown, 'Space');
  tickSlice(S.canvas, S.rafStubs);
  assert.equal(S.G.activeUnitId(S.c), 'a2',
    'активен наёмник a2 (a1 мёртв — серый слот пропущен)');
  assert.equal(byAct.resurrect.disabled, true,
    'на ходу НАЁМНИКА — disabled (гейт activeUnitId)');
  assert.equal(byAct.resurrect.title, 'недоступно активному персонажу',
    'title дословно (строка 000168 allyCanDo)');
  // Стаб-клик (работает и на disabled): ПИН ПРЕДПРОВЕРКИ — без гейта 3
  // каст прошёл бы checkTurn (phase 'player' на ходу союзника) и
  // воскресил a1 ЗА МАНУ/ПУЛ ИГРОКА.
  const mp0 = S.c.player.mp, wis0 = S.c.ps.spellWis, n0 = S.c.log.length;
  byAct.resurrect.listeners.click[0]();
  const added = Array.from(S.c.log).slice(n0);
  assert.deepEqual(added, ['недоступно активному персонажу'],
    'отказ в лог (ровно ОДНА строка): ' + JSON.stringify(added));
  assert.equal(S.c.player.mp, mp0, 'мана игрока НЕ потрачена');
  assert.equal(S.c.ps.spellWis, wis0, 'пул игрока НЕ потрачен');
  assert.equal(a1.alive, false, 'мёртвый наёмник остался мёртв');
  assert.ok(!S.c._fx || S.c._fx.action !== 'cast', 'cast-FX нет');
  assert.equal(S.G.activeUnitId(S.c), 'a2', 'очередь не сдвинулась');
});

test('боевой UI: 000171 — ход ЭФИРА: кнопка «Воскрешение» disabled «недоступно активному персонажу»; стаб-клик — без трат (Эфир-носитель — не v1) (CU171-EFIR)', () => {
  // (000168-UI-2(b)-паттерн: pre-roll остановился на слоте Эфира —
  // activeUnitId 'efir' СРАЗУ после startCombat; волк (m0) ещё НЕ
  // действовал. Мёртвый наёмник a1 — без гейта 3 кнопка была бы
  // активна (phase 'player' + автоцель есть).)
  const E = scene84({ efir: true, spells: true, resurrect: true });
  const a1 = addMerc84(E.c, E.G, 3, 5, 'melee', 'Вольк');
  E.G.combatInternals.dealDamageToAlly(E.c, a1, 9999); // мёртвый = автоцель
  tickSlice(E.canvas, E.rafStubs);
  assert.equal(E.G.activeUnitId(E.c), 'efir',
    'активен Эфир (pre-roll стоп на его слоте)');
  const byAct = {};
  for (const b of E.body.querySelectorAll('.combat-actions button'))
    byAct[b.dataset.act] = b;
  assert.ok(byAct.resurrect, 'кнопка «Воскрешение» существует (hero знает)');
  assert.equal(byAct.resurrect.disabled, true,
    'на ходу Эфира — disabled (гейт activeUnitId)');
  assert.equal(byAct.resurrect.title, 'недоступно активному персонажу',
    'title дословно (строка 000168 allyCanDo)');
  const mp0 = E.c.player.mp, wis0 = E.c.ps.spellWis, n0 = E.c.log.length;
  byAct.resurrect.listeners.click[0]();
  const added = Array.from(E.c.log).slice(n0);
  assert.deepEqual(added, ['недоступно активному персонажу'],
    'отказ в лог (ровно ОДНА строка): ' + JSON.stringify(added));
  assert.equal(E.c.player.mp, mp0, 'мана игрока НЕ потрачена');
  assert.equal(E.c.ps.spellWis, wis0, 'пул игрока НЕ потрачен');
  assert.equal(a1.alive, false, 'мёртвый наёмник остался мёртв');
  assert.ok(!E.c._fx || E.c._fx.action !== 'cast', 'cast-FX нет');
  assert.equal(E.G.activeUnitId(E.c), 'efir', 'очередь не сдвинулась');
});

// --- Задача 000179 (регрессия 000168, ретро-анализ finding 1 major):
// СТРОКИ ОТКРЫТОЙ книги на ходу СОЮЗНИКА. Контракт —
// memory/000179-book-active-unit-gate.md (суть бага/почему —
// memory/000179-spellbook-ally-turn-gate.md): с 000168 ход спутника —
// интерактивный c.phase === 'player', a rowChk = canCastSpell (движок
// 000045 проверяет лишь checkTurn) → на ходу спутника строки книги
// рисуются АКТИВНЫМИ, а клик по строке (castRow → G.Spells.castSpell)
// кастует заклинание ИГРОКА: пул/мана — из пула/маны игрока, эффект
// (включая убийство моба → победа) — вне его хода. Контракт 000168
// «книга — только игрок» соблюдён для КНОПКИ (canDoAction → allyCanDo,
// пин 000168-UI-2), но не для строк открытой книги; bookOpen не
// сбрасывается endTurn (решение 000179 §2.1: фикс — гейт по активному
// юниту, книга остаётся ОТКРЫТОЙ — строки видимы, -off + tooltip).
// Краснота ДО фикса осмысленная (behavioral AssertionError, не краш):
// без гейта строки БЕЗ -off (падает пункт «-off на ходу спутника»),
// клик → каст: mp 16→13, spellInt 1→0, волк убит, ПОБЕДА (падает
// deepEqual «ровно одна строка отказа»). После фикса: оба зелёные,
// все пины «книга на ходу игрока работает как прежде» (000149/CU166/
// SB4) — без репина (на ходу игрока гейт null → бит-в-бит).
// Фикстуры — СУЩЕСТВУЮЩИЕ хелперы (scene84 с опциями spells/efir,
// addMerc84, tickSlice, press, findByClass) — новых фикстур/модулей/
// require-путей нет; префикс CU179 — уникальный.

test('боевой UI: 000193 — книга на ходу НАЁМНИКА: книга АКТИВНОГО персонажа (unitOf) — melee (книга []) → строка «—» (combat-spellrow-off, слушателей НЕТ, КАСТА невозможного); на возврате хода игрока — строки игрока (CU179-ROW, ре-пин 000193)', () => {
  // (000168-UI-2(a)-паттерн: очередь [m0, player, a1]; pre-roll — волк
  // (m0) ДО игрока → стоп на 'player'; Space — конец хода игрока →
  // стоп на ЖИВОМ наёмнике a1 — activeUnitId 'a1'.
  // 000193 (семантический ре-пин 000179): гейт «недоступно активному
  // персонажу» СНЯТ — книга — АКТИВНОГО персонажа. У melee-наёмника
  // a1 (Вольк) книга ПУСТАЯ (spells []) → renderBook строит ОДНУ
  // строку «—» (паттерн 000145: -off, без dataset.spell, слушателей
  // нет — строка не кликабельна).
  const S = scene84({ spells: true, allySpells: true });
  const { G, c } = S;
  addMerc84(c, G, 3, 5, 'melee', 'Вольк');
  const wolf = c.units.find((x) => x.id === 'm0');
  wolf.x = c.px; wolf.y = c.py - 1; // в упор игрока (d 1 — в радиусе)
  c.selectTarget(wolf.id);
  c._rng = () => 0.99; // все удары волка — промахи (паттерн 000149)
  // (1) АНКЕР (ход игрока, «книга работает как прежде»): строки spark/
  // mend БЕЗ -off, tooltip пуст (пины 000149/CU166-ROW/SB4 — бит-в-бит).
  assert.equal(G.activeUnitId(c), 'player', 'ход игрока (pre-roll)');
  press(S.keydown, 'KeyQ');
  const bookBox = findByClass(S.body, 'combat-spellbook');
  assert.ok(bookBox, 'книга (.combat-spellbook) существует');
  assert.notEqual(bookBox.style.display, 'none', 'книга открыта (KeyQ)');
  let rows = bookBox.children.slice(-2); // хвост (vm-стаб-ловушка 000149 §10)
  for (const id of ['spark', 'mend']) {
    const r = rows.find((x) => x.dataset.spell === id);
    assert.ok(r, 'строка «' + id + '» есть в книге');
    assert.ok(!r.className.includes('combat-spellrow-off'),
      'строка ' + id + ' на ходу ИГРОКА — без -off (как прежде)');
    assert.equal(r.title, '', 'строка ' + id + ' на ходу ИГРОКА — tooltip пуст');
  }
  // (2) Конец хода игрока → стоп на наёмнике a1 (волк уже действовал
  // в pre-roll). Книга НЕ закрывается endTurn (решение 000179 §2.1);
  // строки ПЕРЕСТРОЕНЫ (sig 'empty' ≠ sig строк игрока): книга a1
  // ПУСТАЯ → одна строка «—»: -off, textContent «—», БЕЗ
  // dataset.spell, слушателей НЕТ (строка не кликабельна).
  press(S.keydown, 'Space');
  tickSlice(S.canvas, S.rafStubs);
  assert.equal(G.activeUnitId(c), 'a1', 'активен наёмник a1');
  assert.equal(c.phase, 'player', 'ход спутника — phase player (000168)');
  assert.notEqual(bookBox.style.display, 'none',
    'книга ЕЩЁ ОТКРЫТА (endTurn её не закрывает)');
  rows = bookBox.children.slice(-1);
  assert.equal(rows.length, 1, 'хвост — ровно ОДНА строка (перестроение)');
  const dash = rows[0];
  assert.equal(dash.textContent, '—',
    'строка «—» (пустая книга наёмника, паттерн 000145)');
  assert.ok(dash.className.includes('combat-spellrow-off'),
    'строка «—» — класс -off');
  assert.equal(dash.dataset.spell, undefined,
    'строка «—» — БЕЗ dataset.spell (заклинания для каста нет)');
  assert.equal(Object.keys(dash.listeners).length, 0,
    'строка «—» — слушателей НЕТ (не кликабельна)');
  // (3) Кликабельных строк НЕТ → КАСТА невозможного: лог/траты не
  // растут, эффект НЕТ. Проверка — по ТЕКУЩИМ строкам книги (хвост:
  // пустая книга наёмника = 1 строка «—»; vm-стаб-ловушка 000149 §10:
  // в песочнице старые строки игрока из (1) остаются в children —
  // читается хвост, паттерн slice(-N)).
  const n0 = c.log.length;
  const mp0 = c.player.mp, int0 = c.ps.spellInt, wolfHp0 = wolf.hp;
  const clickable = bookBox.children.slice(-1).filter(
    (x) => x.dataset && x.dataset.spell !== undefined
      && x.listeners && Object.keys(x.listeners).length > 0);
  assert.equal(clickable.length, 0,
    'кликабельных строк среди ТЕКУЩИХ строк книги нет: '
    + JSON.stringify(bookBox.children.map((x) => x.textContent)));
  assert.equal(c.log.length, n0, 'строк в логе не прибавилось (каста нет)');
  assert.equal(c.player.mp, mp0, 'мана игрока НЕ потрачена');
  assert.equal(c.ps.spellInt, int0, 'пул «Заклинание» (Интеллект) НЕ потрачен');
  assert.equal(wolf.hp, wolfHp0, 'волк не задет (эффекта НЕТ)');
  assert.ok(!c.result, 'бой не завершён (нет «Волк повержен!»/«Победа!»)');
  assert.ok(!c._fx || c._fx.action !== 'cast', 'cast-FX нет (только при успехе)');
  assert.equal(G.activeUnitId(c), 'a1', 'очередь не сдвинулась');
  assert.notEqual(bookBox.style.display, 'none',
    'книга остаётся ОТКРЫТОЙ (UX 000149: игрок видит причину)');
  // (4) RESTORE: конец хода наёмника → round 2 (рефилл) → волк
  // (промах, _rng 0.99) → стоп на 'player': книга СНОВА ИГРОКА —
  // строки [spark, mend] активны (нет sticky-состояния), книга
  // всё ещё открыта.
  press(S.keydown, 'Space');
  tickSlice(S.canvas, S.rafStubs);
  assert.equal(G.activeUnitId(c), 'player', 'ход игрока вернулся');
  rows = bookBox.children.slice(-2);
  const spark = rows.find((x) => x.dataset.spell === 'spark');
  assert.ok(spark, 'строка «Искра» (перестроение на ходу игрока)');
  assert.ok(!spark.className.includes('combat-spellrow-off'),
    'строка «Искра» на ходу ИГРОКА — снова без -off (книга игрока)');
  assert.equal(spark.title, '', 'tooltip снова пуст');
  assert.notEqual(bookBox.style.display, 'none', 'книга всё ещё открыта');
});

test('боевой UI: 000193 — книга на ходу ЭФИРА: строки = книга Эфира [spark, mend] БЕЗ -off; стаб-клик — castAllySpell (пул/мана ЭФИРА, лог ядра), игрок нетронут, книга закрыта; restore — книга игрока (CU179-EFIR, ре-пин 000193)', () => {
  // (000168-UI-2(b)-паттерн: очередь [efir, m0, player], pre-roll —
  // стоп на слоте Эфира СРАЗУ после startCombat; u.mp = 11 (естественное
  // maxMP createEfir, < 20) — «Вдох Эфира» (гейт u.mp >= B.mpCost) НЕ
  // сработает → стоп на 'efir' детерминирован; round-2-стоп — после
  // хода волка.)
  // 000193 (семантический ре-пин 000179): гейт «недоступно активному
  // персонажу» СНЯТ — книга — АКТИВНОГО персонажа (unitOf). На ходу
  // Эфира строки = ЕГО книга [spark, mend] (старт-книга createEfir),
  // доступность — G.AllySpells.canCastAllySpell (ресурсы Эфира).
  const E = scene84({ efir: true, spells: true, allySpells: true });
  const { G, c } = E;
  const u = c.units.find((x) => x.kind === 'efir');
  const wolf = c.units.find((x) => x.id === 'm0');
  wolf.maxHP = 100; wolf.hp = 100; // запас по HP под каст (6 урона)
  c._rng = () => 0.99; // все удары волка — промахи (паттерн 000149)
  assert.equal(G.activeUnitId(c), 'efir',
    'активен Эфир (pre-roll стоп на его слоте)');
  assert.equal(u.mp, 11, 'фикстура: mp 11 < 20 — «Вдох» не сработает');
  // (1) Конец хода Эфира → волк (промах) → стоп на игроке.
  press(E.keydown, 'Space');
  tickSlice(E.canvas, E.rafStubs);
  assert.equal(G.activeUnitId(c), 'player', 'ход игрока');
  wolf.x = c.px; wolf.y = c.py - 1; // в упор игрока (d 1 от Эфира)
  c.selectTarget(wolf.id);
  // (2) АНКЕР (ход игрока): строки spark/mend БЕЗ -off (как прежде).
  press(E.keydown, 'KeyQ');
  const bookBox = findByClass(E.body, 'combat-spellbook');
  assert.ok(bookBox, 'книга (.combat-spellbook) существует');
  assert.notEqual(bookBox.style.display, 'none', 'книга открыта (KeyQ)');
  let rows = bookBox.children.slice(-2); // хвост (vm-стаб-ловушка 000149 §10)
  for (const id of ['spark', 'mend']) {
    const r = rows.find((x) => x.dataset.spell === id);
    assert.ok(r, 'строка «' + id + '» есть в книге');
    assert.ok(!r.className.includes('combat-spellrow-off'),
      'строка ' + id + ' на ходу ИГРОКА — без -off (как прежде)');
    assert.equal(r.title, '', 'строка ' + id + ' на ходу ИГРОКА — tooltip пуст');
  }
  // (3) Конец хода игрока → волк (промах) → startRound (round 2,
  // рефилл) → стоп на 'efir' («Вдох» не сработал: mp 11 < 20). Книга
  // ЕЩЁ ОТКРЫТА; строки ПЕРЕСТРОЕНЫ — теперь это книга ЭФИРА
  // [spark, mend] БЕЗ -off: ресурсы полные (spellInt 1 после рефилла,
  // мана 11, волк d 1 ≤ 4) — tooltip пуст (canCastAllySpell ok).
  press(E.keydown, 'Space');
  tickSlice(E.canvas, E.rafStubs);
  assert.equal(G.activeUnitId(c), 'efir', 'активен Эфир (round 2)');
  assert.equal(c.phase, 'player', 'ход спутника — phase player (000168)');
  assert.equal(c.round, 2, 'round 2 (рефилл на стопе)');
  assert.equal(u.mp, 11, '«Вдох» не сработал (mp 11 < 20)');
  assert.equal(c.efs.spellInt, 1, 'пул «Заклинание» (Интеллект) 1 (рефилл)');
  assert.notEqual(bookBox.style.display, 'none',
    'книга ЕЩЁ ОТКРЫТА (endTurn её не закрывает)');
  rows = bookBox.children.slice(-2);
  for (const id of ['spark', 'mend']) {
    const r = rows.find((x) => x.dataset.spell === id);
    assert.ok(r, 'строка «' + id + '» (книга Эфира, перестроение)');
    assert.ok(!r.className.includes('combat-spellrow-off'),
      'строка ' + id + ' на ходу ЭФИРА — БЕЗ -off (ресурсов хватает)');
    assert.equal(r.title, '',
      'строка ' + id + ' на ходу ЭФИРА — tooltip пуст (canCastAllySpell)');
  }
  // (4) Стаб-клик по строке «Искра» — castAllySpell (000193): расход —
  // пул/мана ЭФИРА (не игрока!); до-значения — ПОСЛЕ стопа
  // (рефилл startRound; паттерн D11 000166). Лог — строка ЯДРА
  // (verbatim 000118): «Эфир: «Искра» — Волк: 6.» (формула 000193:
  // round((4+0.5·3)·(1+0.15·(1−1))·(1+0.05·lord))).
  const n0 = c.log.length;
  const pMp0 = c.player.mp, pInt0 = c.ps.spellInt;
  rows.find((x) => x.dataset.spell === 'spark').listeners.click[0]();
  assert.deepEqual(Array.from(c.log).slice(n0),
    ['Эфир: «Искра» — Волк: 6.'],
    'ровно ОДНА строка ядра в лог: '
    + JSON.stringify(Array.from(c.log).slice(n0)));
  assert.equal(c.efs.spellInt, 0, 'пул «Заклинание» (Интеллект) Эфира 1→0');
  assert.equal(u.mp, 8, 'мана Эфира 11→8 (Искра: 3 маны)');
  assert.equal(wolf.hp, 94, 'волк 100→94 (урон 6, формула 000193)');
  assert.equal(c.player.mp, pMp0, 'мана ИГРОКА НЕ потрачена');
  assert.equal(c.ps.spellInt, pInt0, 'пул «Заклинание» (Интеллект) ИГРОКА НЕ потрачен');
  assert.ok(c._fx && c._fx.action === 'cast',
    'cast-FX (только при успехе)');
  assert.equal(G.activeUnitId(c), 'efir', 'очередь не сдвинулась (каст ≠ endTurn)');
  assert.equal(bookBox.style.display, 'none',
    'книга ЗАКРЫТА (действие сделано — UX 000149)');
  assert.ok(!c.result, 'бой не завершён (волк жив: 94 HP)');
  // (5) RESTORE: конец хода Эфира → волк (промах, _rng 0.99) → стоп на
  // 'player': книга ИГРОКА — строки [spark, mend] снова активны.
  press(E.keydown, 'Space');
  tickSlice(E.canvas, E.rafStubs);
  assert.equal(G.activeUnitId(c), 'player', 'ход игрока вернулся');
  press(E.keydown, 'KeyQ');
  assert.notEqual(bookBox.style.display, 'none', 'книга открыта (KeyQ)');
  rows = bookBox.children.slice(-2);
  for (const id of ['spark', 'mend']) {
    const r = rows.find((x) => x.dataset.spell === id);
    assert.ok(r, 'строка «' + id + '» (книга игрока, restore)');
    assert.ok(!r.className.includes('combat-spellrow-off'),
      'строка ' + id + ' — без -off (restore)');
    assert.equal(r.title, '', 'tooltip пуст (restore)');
  }
});

test('боевой UI: 000193 — деградация без G.AllySpells (битый порядок): на ходу наёмника строки -off + title «недоступно активному персонажу», стаб-клик — ровно 1 строка отказа, трат нет, книга открыта, console.error — 1 на сессию; restore — строки игрока (CU193-DEGR)', () => {
  // 000193 (ревью — покрытие деградации): ветка rowChk/castRow
  // «книга открыта на ходу союзника, но src/ally-spells.js не
  // загружен» (битый порядок: тег ally-spells.js ДО combat-ui.js —
  // пин index-order) не была покрыта коммит-тестом (все vm-тесты
  // 000193 грузят модуль). Прецедент — CU182-NOSP (кнопка, G.Spells)
  // и CU188-ROWCHK (строки, G.Spells): та же форма — битый порядок
  // → строки/отказ без краха, 1 console.error (флаг на сессию),
  // трат НЕТ. Песочница: scene84({spells:true}) БЕЗ allySpells —
  // G.SpellBook/G.SpellsData/G.Spells на месте, G.AllySpells НЕТ.
  // Наёмник — НЕНУСТАЯ книга (mend): allyCanDo('spellbook') ok
  // (000193: гейт 000179 снят), строки перестраиваются на его ходу.
  const S = scene84({ spells: true });
  const { G, c } = S;
  const merc = addMerc84(c, G, 3, 5, 'melee', 'Вольк');
  merc.spells = ['mend']; // непустая книга (строки есть, -off — из rowChk)
  const wolf = c.units.find((x) => x.id === 'm0');
  wolf.x = c.px; wolf.y = c.py - 1; // в упор игрока (d 1)
  c.selectTarget(wolf.id);
  c._rng = () => 0.99; // удары волка — мимо (паттерн 000149)
  assert.equal(G.AllySpells, undefined,
    'фикстура: G.AllySpells отсутствует (withAllySpells не передан)');
  assert.ok(G.SpellBook && G.Spells,
    'G.SpellBook/G.Spells на месте (книга ИГРОКА работает)');
  assert.equal(merc.mp, 5, 'фикстура: 000193 — у наёмника мана 5');
  // (1) АНКЕР (ход игрока): строки [spark, mend] БЕЗ -off (бит-в-бит
  // 000149 — деградация НЕ влияет на путь игрока), 0 console.error.
  assert.equal(G.activeUnitId(c), 'player', 'ход игрока (pre-roll)');
  const origErr = console.error;
  const errs = [];
  console.error = (...a) => { errs.push(a.join(' ')); };
  try {
    press(S.keydown, 'KeyQ');
    const bookBox = findByClass(S.body, 'combat-spellbook');
    assert.ok(bookBox, 'книга (.combat-spellbook) существует');
    assert.notEqual(bookBox.style.display, 'none', 'книга открыта (KeyQ)');
    let rows = bookBox.children.slice(-2);
    for (const id of ['spark', 'mend']) {
      const r = rows.find((x) => x.dataset.spell === id);
      assert.ok(r, 'строка «' + id + '» на ходу игрока есть');
      assert.ok(!r.className.includes('combat-spellrow-off'),
        id + ' на ходу игрока — без -off (бит-в-бит)');
      assert.equal(r.title, '', id + ' на ходу игрока — tooltip пуст');
    }
    assert.equal(errs.length, 0,
      'на ходу игрока деградация НЕ срабатывает (0 console.error): '
      + JSON.stringify(errs));
    // (2) Конец хода игрока → стоп на наёмнике a1: книга ЕЩЁ ОТКРЫТА
    // (endTurn не закрывает — 000179 §2.1), строки перестроены —
    // книга НАЁМНИКА [mend]: -off + title ВЕРБАТИМ (деградация
    // rowChk: G.AllySpells нет) — строка 000179, деградация, не
    // крах; ровно ОДИН console.error (флаг allySpellsWarned).
    press(S.keydown, 'Space');
    tickSlice(S.canvas, S.rafStubs);
    assert.equal(G.activeUnitId(c), 'a1', 'активен наёмник a1');
    assert.equal(c.phase, 'player', 'ход спутника — phase player');
    assert.notEqual(bookBox.style.display, 'none',
      'книга ЕЩЁ ОТКРЫТА на ходу наёмника (KeyQ работает: '
      + 'allyCanDo «spellbook» ok — 000193)');
    rows = bookBox.children.slice(-1);
    assert.equal(rows.length, 1, 'хвост — ровно ОДНА строка');
    const mendRow = rows[0];
    assert.equal(mendRow.dataset.spell, 'mend',
      'строка = книга НАЁМНИКА (unitOf — активный); факт: '
      + JSON.stringify(mendRow.dataset && mendRow.dataset.spell));
    assert.ok(mendRow.className.includes('combat-spellrow-off'),
      'строка -off (деградация)');
    assert.equal(mendRow.title, 'недоступно активному персонажу',
      'title вербатим (строка 000179 — деградация, не крах): '
      + mendRow.title);
    assert.equal(errs.length, 1,
      'ровно ОДИН console.error (флаг allySpellsWarned, 1/сессию): '
      + JSON.stringify(errs));
    assert.ok(errs[0].includes('AllySpells'),
      'сообщение — про Game.AllySpells: ' + errs[0]);
    // (3) Стаб-клик по off-строке — castRow (деградация): ровно ОДНА
    // строка отказа в лог, КАСТА НЕТ, трат НЕТ (игрок И наёмник),
    // c._fx нет, книга остаётся ОТКРЫТОЙ (UX 000149: видна причина),
    // очередь не сдвинулась; console.error НЕ прибавился (флаг
    // сессионный — не на каждое событие).
    const n0 = c.log.length;
    const pMp0 = c.player.mp, pInt0 = c.ps.spellInt;
    const mercMp0 = merc.mp, mercWis0 = merc.spellWis, wolfHp0 = wolf.hp;
    mendRow.listeners.click[0]();
    assert.deepEqual(Array.from(c.log).slice(n0),
      ['недоступно активному персонажу'],
      'отказ в лог (ровно ОДНА строка): '
      + JSON.stringify(Array.from(c.log).slice(n0)));
    assert.equal(c.player.mp, pMp0, 'мана игрока НЕ потрачена');
    assert.equal(c.ps.spellInt, pInt0, 'пул игрока НЕ потрачен');
    assert.equal(merc.mp, mercMp0, 'мана наёмника НЕ потрачена');
    assert.equal(merc.spellWis, mercWis0, 'пул наёмника НЕ потрачен');
    assert.equal(wolf.hp, wolfHp0, 'волк не задет (каста нет)');
    assert.ok(!c._fx || c._fx.action !== 'cast', 'cast-FX нет');
    assert.notEqual(bookBox.style.display, 'none',
      'книга остаётся ОТКРЫТОЙ (видна причина)');
    assert.equal(G.activeUnitId(c), 'a1', 'очередь не сдвинулась');
    assert.equal(errs.length, 1,
      'console.error не прибавился (флаг на сессию): '
      + JSON.stringify(errs));
    // (4) RESTORE: конец хода наёмника → round 2 (рефилл) → волк
    // (промах) → стоп на 'player': строки ИГРОКА [spark, mend] снова
    // БЕЗ -off (деградация не sticky — путь игрока бит-в-бит),
    // console.error не прибавился.
    press(S.keydown, 'Space');
    tickSlice(S.canvas, S.rafStubs);
    assert.equal(G.activeUnitId(c), 'player', 'ход игрока вернулся');
    rows = bookBox.children.slice(-2);
    for (const id of ['spark', 'mend']) {
      const r = rows.find((x) => x.dataset.spell === id);
      assert.ok(r, 'строка «' + id + '» (restore, книга игрока)');
      assert.ok(!r.className.includes('combat-spellrow-off'),
        id + ' на ходу игрока — без -off (restore)');
      assert.equal(r.title, '', 'tooltip пуст (restore)');
    }
    assert.equal(errs.length, 1,
      'restore не добавляет console.error: ' + JSON.stringify(errs));
  } finally {
    console.error = origErr;
  }
});

// =====================================================================
// Задача 000180: восстановление ослабленных/пропущенных тестовых
// пинов (ретро 000168/000169) — ТОЛЬКО тесты, src не меняется.
// Контракты — memory/000180-test-pins-restored.md §1.4/§2.
//
// CU180-EFIR-ROW — stateEl: строка АКТИВНОГО Эфира (Д10 000168; minor
// ретро 000168: grep «Мана:» tests/combat-ui.test.js → 0 — строка не
// была закреплена ни одним тестом; 000168-UI-1 пинит только строку
// НАЁМНИКА — Д10-пара теперь полная). Пинится ТЕКУЩИЙ фактический
// текст src/combat-ui.js (область stateEl менялась 000171/000173/
// 000174/000176 ПОСЛЕ ретро — пином является поведение, а не номер
// строки): побайтово «Эфир: HP 16/16  |  Мана: 11  |  Шаги: 3  |
// Касание: 1» (L1-профиль: maxHP=hp=16, mp=11 — EF-1; c.efs
// {spellInt:1, spellWis:1, touch:1, move:3} — 000112; имя «Эфир» —
// src/efir.js; разделитель «  |  ») + fallback c.efs=null → «Шаги: 0
//  |  Касание: 0» (документированная защитная ветка: «без c.efs —
// fallback-цифры 0, строка рисуется»).
//
// «Краснота» ретро = сам пробел покрытия: на текущем master пин
// зелёный (поведение на месте); при откате Д10 (000168) — красный
// (строки Эфира нет в stateEl).
// =====================================================================

// Ре-пин 000199 (ТЗ: HP/MP — на полосках, счётчики — на кнопках,
// строки «Ход: …»/союзника — убраны): побайтовая строка Эфира и
// «Ход: Эфир» ИЗ stateEl УБРАНЫ; инфо активного Эфира несут полосы
// (HP 16/16; Мана 11/11 — u.mp / u.maxMP, снапшот stats.maxMP в
// buildEfirUnit — ревью 000199; L1: = legacy-таблице) и бейдж
// «Удара» (c.efs.touch). Fallback c.efs=null:
// полосы НЕ зависят от c.efs (u.mp/u.maxMP — source), бейдж «0»
// (null-guard), render без краха, stateEl — те же 2 строки.
test('боевой UI: 000180 — строка активного Эфира ИЗ stateEl УБРАНА (000199); полосы несут Эфира (HP 16/16, MP 11/11), бейдж «Удара» — touch; fallback c.efs=null: бейдж «0», полосы не тронуты (CU180-EFIR-ROW)', () => {
  // 000168-UI-2(b)-паттерн: scene84({efir:true, spells:true}) —
  // pre-roll остановился на слоте Эфира СРАЗУ после startCombat
  // (инициатива Эфира 4 — dexterity 1 + intelligence 3,
  // EFIR_START_PRIMARY — > волк 3 > игрок 2); волк (m0) ещё НЕ
  // действовал; игрок полный → «Вдох Эфира» НЕ срабатывает
  // (frac 1.0 > 0.4) — L1-значения нетронуты.
  const S = scene84({ efir: true, spells: true });
  tickSlice(S.canvas, S.rafStubs);
  assert.equal(S.G.activeUnitId(S.c), 'efir',
    'активен Эфир (pre-roll стоп на его слоте)');
  const u = S.c.units.find((x) => x.id === 'efir');
  assert.equal(u.hp, 16, 'L1-профиль: hp = 16 (EF-1)');
  assert.equal(u.maxHP, 16, 'L1-профиль: maxHP = 16 (EF-1)');
  assert.equal(u.mp, 11, 'L1-профиль: mp = 11 — своя мана (EF-1)');
  assert.equal(S.c.efs.move, 3, 'c.efs.move = 3 (000112)');
  assert.equal(S.c.efs.touch, 1, 'c.efs.touch = 1 (000112)');
  const state = findByClass(S.body, 'combat-state');
  const text = state.textContent;
  assert.ok(!text.includes('Ход:'),
    '000199: первой строки «Ход: Эфир» нет (рамка 000197): '
    + JSON.stringify(text));
  assert.ok(!text.includes('Мана:'),
    '000199: строки активного Эфира (HP/Мана/Шаги/Касание) нет — '
    + 'инфо на полосках/кнопках: ' + JSON.stringify(text));
  assert.equal(text.split('\n').length, 2,
    '000199: stateEl — ровно ДВЕ строки: ' + JSON.stringify(text));
  // Полосы — активного Эфира (barUnit = activeUnit): HP 16/16;
  // Мана — u.mp / u.maxMP = 11/11 (снапшот stats.maxMP в
  // buildEfirUnit — ревью 000199; L1-профиль: = legacy-таблице).
  assert.equal(u.maxMP, S.G.efir.efirStats(u.level).maxMP,
    'L1-профиль: снапшот u.maxMP = legacy-значению (11)');
  assert.equal(findByClass(S.body, 'combat-hpbar-text').textContent,
    'HP ' + u.hp + '/' + u.maxHP,
    'HP-полоса несёт Эфира (16/16): '
    + JSON.stringify(findByClass(S.body, 'combat-hpbar-text').textContent));
  assert.equal(findByClass(S.body, 'combat-mpbar-text').textContent,
    'MP ' + u.mp + '/' + u.maxMP,
    'MP-полоса — мана Эфира (11/11, u.mp/u.maxMP): '
    + JSON.stringify(findByClass(S.body, 'combat-mpbar-text').textContent));
  const atkBadge = S.body.querySelectorAll('.combat-actions button')
    .find((b) => b.dataset.act === 'attack').children
    .find((ch) => ch.className === 'combat-actcount');
  assert.ok(atkBadge, 'бейдж «Удара» есть (счётчики на кнопках, 000199)');
  assert.equal(atkBadge.textContent, String(S.c.efs.touch),
    'бейдж «Удара» = c.efs.touch (1): '
    + JSON.stringify(atkBadge.textContent));
  // (b) Fallback: white-box c.efs = null + re-render (rAF-tick) →
  // render не крашится; полосы НЕ зависят от c.efs (source — u.mp
  // и u.maxMP, null-guard только в бейдже): MP-полоса 11/11,
  // бейдж — «0».
  S.c.efs = null;
  tickSlice(S.canvas, S.rafStubs);
  assert.equal(findByClass(S.body, 'combat-mpbar-text').textContent,
    'MP ' + u.mp + '/' + u.maxMP,
    'fallback без c.efs: MP-полоса не тронута (u.mp/u.maxMP): '
    + JSON.stringify(findByClass(S.body, 'combat-mpbar-text').textContent));
  assert.equal(atkBadge.textContent, '0',
    'fallback без c.efs: бейдж «0» (null-guard): '
    + JSON.stringify(atkBadge.textContent));
  assert.equal(findByClass(S.body, 'combat-state').textContent
    .split('\n').length, 2,
    'fallback: stateEl — те же ДВЕ строки: '
    + JSON.stringify(findByClass(S.body, 'combat-state').textContent));
});

// =====================================================================
// Задача 000178. Тач-кнопки «Каст» (K, Эфир) и «Лечение» (H,
// support-наёмник) в панели боя (клик/тач). ТЗ — tasks/pending/
// 000178.md; контракты — memory/000178-combat-cast-heal-buttons.md;
// план тестов — a3. Паттерн — кнопка «Воскрешение» 000171 (memory/
// 000171-combat-resurrect-button.md; общий принцип — memory/000171-
// touch-buttons.md: каждое действие UI — видимый элемент, нажимаемый
// мышкой или тачем).
//
// КРАСНЫЕ (кнопок нет — build() строит 7 табличных + resurrect под
// своим гейтом): CU178-VIS / CU178-CAST / CU178-CAST-OFF / CU178-HEAL /
// CU178-HEAL-OFF. Каждое падает на ПЕРВОМ assert.ok(byAct.cast|heal) —
// осмысленная краснота «нет кнопки» (функциональности ТЗ ещё нет),
// не синтаксис/окружение: сцена178 — локальная копия scene84 +
// rosterData (существующий параметр startCombat, 000087) — сцена
// собирается штатно.
// ЗЕЛЁНЫЙ guard (не входит в red-count): CU178-GATE — гейты build()
// по составу партии: без Эфира «Каст» нет, без support-наёмника
// «Лечение» нет; дефолтный бой и melee-отряд — панель бит-в-байт 7
// (спящий пин «7 штук»/000124/CU171-GATE/SB1, паттерн 000166/000171).
//
// Ключевое отличие от 000171: ветки 'cast'/'heal' ЕСТЬ в
// canDoAction/allyCanDo (000168) — гашение = СТАНДАРТНЫЙ canDoAction
// (без собственного chk-хелпера; строки причины — 1:1 с клавишами
// K/H), спец-кейс в цикле render — только ВИДИМОСТЬ (display) по
// активному юниту. Клик — allyBtn (предпроверка + runAction) —
// зеркало клавиши: стаб-клик disabled → ровно ОДНА строка причины в
// лог, ДЕЙСТВИЯ НЕТ, трат нет (пин предпроверки).
//
// Детерминизм (seed 42; совпадает с эмпирикой 000168-UI-2): hero
// maxHP 25/maxMP 16; геометрия Эфира u(3,5), волк(3,4) — d 1, волк
// 100/100: каст → лог ровно «Эфир: «Искра» — Волк: 6.», efs.spellInt
// 1→0, u.mp 11→8, волк 100→94 (формула 000193), 0 новых c._rng,
// очередь не сдвинулась.
// Лечение (roster-сцена, player.hp 15): лог ровно «Медик лечит
// Флогистон (+6).», hp 15→21, attackLeft 1→0, очередь не сдвинулась.
// Очереди: VIS (efir+roster) turnOrder ['efir','m0','player','a1'],
// pre-roll стоп на 'efir'; HEAL (roster) ['m0','player','a0'],
// pre-roll: волк сам (игрок цел), стоп на 'player'; Space — шаг.
// =====================================================================

// Сцена 000178 — КОПИЯ scene84 (L1416) + аддитивная прокидка
// opts.roster → rosterData startCombat (000087): отряд ДО build() —
// статический гейт build() читает c.units (addMerc84-ПОСЛЕ build не
// проходит гейт — gap, анализ a2). scene84 в mid-file НЕ правим:
// 000179/000180 добавляют блоки в этот же конец файла — self-
// contained блок сводит площадь add/add-конфликта к одному append
// (CONVENTION: при склейке хвоста ВСЕ блоки сохраняются, CU178 —
// последний).
function scene178(opts = {}) {
  const rafStubs = makeRafStubs();
  // 000178: buttons — ВСЕ кнопки песочницы (стаб пушит каждый
  // createElement('button'), паттерн scene166/000171): count-ассерты
  // гейтов build() и «ровно ОДНА кнопка на действие».
  const { G, keydown, body, buttons } = loadCombatUi(true, {
    withEfir: !!opts.efir,
    withSpells: !!opts.spells,
    performance: { now: () => NOW84 },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  const requested = [];
  const hero = G.createCharacter();
  // 000182 (CU182-ORDER): hero знает «Воскрешение» → кнопка resurrect
  // в панели (гейт canResurrect — чистое чтение у.spells). Паттерн
  // scene84 (assignment, не push: hero — свежий createCharacter,
  // дефолтный spells перезаписан целиком). Дефолт (опция не передана)
  // — бит-в-байт.
  if (opts.resurrect) hero.spells = ['resurrect'];
  const c = G.combatUI.startCombat({
    hero,
    mobs: opts.mobs || ['wolf'], mobLevel: 1, seed: 42,
    ...(opts.efir ? { efir: G.efir.createEfir() } : {}),
    ...(opts.roster ? { rosterData: opts.roster } : {}),
    ...(opts.loader
      ? { spriteLoader: fakeLoader84(requested, opts.loader) } : {}),
  });
  return { G, c, canvas: findCanvas(body), body, keydown, rafStubs,
    buttons, requested };
}

// Медик — support-наёмник (role 'support', kind 'merc' по умолчанию
// makeAlly) с 'mend' — единственное/высшее лечение (ур. 2: +6);
// attackLeft 1 (пул 000168). Ищется ПО РОЛИ, не по id (Эфир
// забирает индекс 0: с Эфиром медик 'a1', без — 'a0').
const ROSTER_MEDIC = [{ name: 'Медик', role: 'support', level: 2,
  dmg: 1, hp: 1, spells: ['mend'] }];

// Кнопки панели в byAct (стаб querySelectorAll отдаёт ВСЕ кнопки
// песочницы — спец-кейсы пишем строго по dataset.act, паттерн
// 000168-UI-2/CU171).
const byActOf178 = (S) => {
  const byAct = {};
  for (const b of S.body.querySelectorAll('.combat-actions button'))
    byAct[b.dataset.act] = b;
  return byAct;
};

test('боевой UI: 000178 — кнопки «Каст»/«Лечение»: видимость по ходу активного юнита, гейт build() по составу партии (CU178-VIS)', () => {
  // (a) VIS-сцена (efir + roster): turnOrder ['efir','m0','player',
  // 'a1']; pre-roll — стоп на 'efir' (волк ещё НЕ действовал — игрок
  // цел). display переключается по активному юниту на ПЕРСИСТЕНТНОМ
  // элементе (создан один раз в build() под статическим гейтом).
  const S = scene178({ efir: true, spells: true, roster: ROSTER_MEDIC });
  const c = S.c;
  const medic = c.units.find((x) => x.side === 'ally'
    && x.role === 'support' && x.kind === 'merc');
  assert.ok(medic, 'фикстура: support-наёмник в партии (гейт «Лечения»)');
  assert.equal(Array.from(c.turnOrder).join(','), 'efir,m0,player,a1',
    'фикстура: очередь (Эфир первым, медик a1)');
  assert.equal(S.G.activeUnitId(c), 'efir', 'pre-roll — стоп на ходу Эфира');
  assert.equal(c.player.hp, 25, 'фикстура: игрок цел (волк ещё не действовал)');
  tickSlice(S.canvas, S.rafStubs);
  const byAct = byActOf178(S);
  assert.ok(byAct.cast, 'кнопка «Каст» построена (гейт: Эфир в партии)');
  assert.ok(byAct.heal,
    'кнопка «Лечение» построена (гейт: support-наёмник в партии)');
  assert.equal(S.buttons.filter((b) => b.dataset.act === 'cast').length, 1,
    'ровно ОДНА кнопка «Каст»');
  assert.equal(S.buttons.filter((b) => b.dataset.act === 'heal').length, 1,
    'ровно ОДНА кнопка «Лечение»');
  assert.equal(byAct.cast.ariaLabel, 'Каст', 'aria-label «Каст»');
  assert.equal(byAct.heal.ariaLabel, 'Лечение', 'aria-label «Лечение»');
  const castImg = byAct.cast.children[0];
  assert.equal(castImg.tagName, 'img', '«Каст»: иконка — <img>');
  assert.equal(castImg.src, 'assets/ui/combat_cast.svg',
    '«Каст»: иконка assets/ui/combat_cast.svg (конвенция 000124)');
  const healImg = byAct.heal.children[0];
  assert.equal(healImg.tagName, 'img', '«Лечение»: иконка — <img>');
  assert.equal(healImg.src, 'assets/ui/combat_heal.svg',
    '«Лечение»: иконка assets/ui/combat_heal.svg (конвенция 000124)');
  // Ход ЭФИРА: «Каст» видима; «Лечение» скрыта И disabled (пин kind-
  // гейта: У ЭФИРА role 'support' ТОЖЕ — без kind==='merc' кнопка
  // светилась бы на ходу Эфира).
  assert.equal(byAct.cast.style.display, '',
    'ход Эфира — «Каст» видима (display "")');
  assert.equal(byAct.heal.style.display, 'none',
    'ход Эфира — «Лечение» скрыта (только на ходу support-наёмника)');
  assert.equal(byAct.heal.disabled, true,
    '«Лечение» на ходу Эфира — disabled (canDoAction)');
  assert.equal(byAct.heal.title, 'недоступно активному персонажу',
    'пин kind-гейта: title дословно (Эфир — НЕ support-наёмник)');
  // Space → 'player' (волк m0 действует сам — игрок цел, hp 25).
  press(S.keydown, 'Space');
  tickSlice(S.canvas, S.rafStubs);
  assert.equal(S.G.activeUnitId(c), 'player',
    'волк (m0) авто → стоп на ходу игрока');
  assert.equal(c.player.hp, 25, 'волк не достал игрока');
  assert.equal(byAct.cast.style.display, 'none',
    'ход игрока — «Каст» скрыта (кнопка = тач-путь Эфира)');
  assert.equal(byAct.heal.style.display, 'none',
    'ход игрока — «Лечение» скрыта (кнопка = тач-путь наёмника)');
  // Space → 'a1' (медик): «Лечение» видима; «Каст» скрыта и disabled.
  press(S.keydown, 'Space');
  tickSlice(S.canvas, S.rafStubs);
  assert.equal(S.G.activeUnitId(c), 'a1', 'ход support-наёмника (a1)');
  assert.equal(byAct.heal.style.display, '',
    'ход support-наёмника — «Лечение» видима (display "")');
  assert.equal(byAct.cast.style.display, 'none',
    'ход support-наёмника — «Каст» скрыта (только на ходу Эфира)');
  assert.equal(byAct.cast.disabled, true, '«Каст» на ходу наёмника — disabled');
  assert.equal(byAct.cast.title, 'недоступно активному персонажу',
    '«Каст» на ходу наёмника: title дословно (строка ядра 000168)');
  // (b) efir-only (без roster): гейт «Лечения» ложен — кнопка НЕ
  // построена вовсе (статический гейт состава, не display).
  const E = scene178({ efir: true, spells: true });
  const byActE = byActOf178(E);
  assert.equal(S.G.activeUnitId(E.c), 'efir',
    'efir-only: pre-roll — стоп на ходу Эфира');
  assert.ok(byActE.cast, 'efir-only: «Каст» построена (Эфир в партии)');
  assert.equal(byActE.heal, undefined,
    'efir-only: «Лечение» НЕ построена (support-наёмника нет — гейт build)');
  assert.equal(byActE.cast.style.display, '',
    'efir-only: «Каст» видима на ходу Эфира');
});

test('боевой UI: 000178 — тап «Каст» на ходу Эфира = клавиша K: урон/мана/пул/лог, ход не сгорел, 0 новых c._rng (CU178-CAST)', () => {
  const S = scene178({ efir: true, spells: true });
  const c = S.c;
  const u = c.units.find((x) => x.kind === 'efir');
  const wolf = c.units.find((x) => x.id === 'm0');
  assert.equal(S.G.activeUnitId(c), 'efir', 'pre-roll — стоп на ходу Эфира');
  // Геометрия фикстуры (000168-UI-2): u(3,5), волк(3,4) — d 1;
  // волк 100/100 (запас по HP под каст).
  u.x = 3; u.y = 5;
  wolf.x = 3; wolf.y = 4;
  wolf.maxHP = 100; wolf.hp = 100;
  tickSlice(S.canvas, S.rafStubs);
  const byAct = byActOf178(S);
  assert.ok(byAct.cast, 'кнопка «Каст» построена (гейт: Эфир в партии)');
  assert.equal(byAct.cast.style.display, '', 'видима на ходу Эфира');
  assert.equal(byAct.cast.disabled, false,
    'canDoAction ok (d 1, мана 11, пул Интеллект 1) — активна');
  assert.equal(byAct.cast.title, '', 'без причины — title пусто');
  assert.equal(byAct.cast.ariaLabel, 'Каст', 'aria-label «Каст»');
  assert.equal(byAct.cast.textContent, '', 'текстовой подписи нет (000124)');
  assert.equal(byAct.cast.children.length, 1, 'ровно ОДИН дочерний элемент');
  const img = byAct.cast.children[0];
  assert.equal(img.tagName, 'img', 'иконка — <img>');
  assert.equal(img.src, 'assets/ui/combat_cast.svg',
    'иконка — assets/ui/combat_cast.svg (конвенция 000124)');
  assert.equal(img.alt, '', 'alt="" (иконка презентационная)');
  assert.ok(fs.existsSync(path.join(ROOT, 'assets/ui/combat_cast.svg')),
    'файл иконки существует в каталоге');
  // Снапшот ДО каста («до-значения»).
  assert.equal(u.mp, 11, 'фикстура: мана 11');
  assert.equal(c.efs.spellInt, 1, 'фикстура: пул Интеллект 1');
  assert.equal(wolf.hp, 100, 'фикстура: волк 100');
  const n0 = c.log.length;
  const realRng = c._rng;
  let rngCalls = 0;
  c._rng = () => (rngCalls++, realRng());
  // Тап кнопки (нативный click — стаб-клик).
  byAct.cast.listeners.click[0]();
  tickSlice(S.canvas, S.rafStubs);
  // Результат ОДНОГО тапа (= KeyK): сильнейшее урон-заклинание.
  // Строку строит ЯДРО (efirCastAction) — UI свою строку не ведёт.
  const added = Array.from(c.log).slice(n0);
  assert.deepEqual(added, ['Эфир: «Искра» — Волк: 6.'],
    'лог — ровно ОДНА строка ядра: ' + JSON.stringify(added));
  assert.equal(c.efs.spellInt, 0, 'пул «Заклинание» (Интеллект) 1→0');
  assert.equal(u.mp, 8, 'мана 11→8 (Искра: 3 маны)');
  assert.equal(wolf.hp, 94,
    'волк 100→94 (round((4+0.5·3)·(1+0.15·(1−1))·(1+0.05·lord)); 000193)');
  assert.equal(S.G.activeUnitId(c), 'efir', 'ход НЕ сгорел (каст ≠ endTurn)');
  assert.equal(rngCalls, 0,
    'новых вызовов c._rng — ноль (каст Эфира детерминирован)');
  // После каста — то же, что и клавише K: пул исчерпан.
  const after = S.G.canDoAction(c, 'cast', { targetId: c.targetId });
  assert.equal(after.ok, false, 'после каста — недоступно (пул исчерпан)');
  assert.equal(after.reason, 'действий «Заклинание» (Интеллект) больше нет',
    'причина дословно (та же, что дала бы клавиша)');
});

test('боевой UI: 000178 — «Каст» disabled с дословными title (гейты canDoAction 000168); стаб-клик — ровно одна строка в лог, трат НЕТ (CU178-CAST-OFF)', () => {
  const cases = [
    // (a) Маны нет → «не хватает маны (3)» (Искра: 3 маны).
    { title: 'не хватает маны (3)',
      mut: (S, u) => { u.mp = 0; } },
    // (b) Пул исчерпан → «действий «Заклинание» (Интеллект) больше нет».
    { title: 'действий «Заклинание» (Интеллект) больше нет',
      mut: (S) => { S.c.efs.spellInt = 0; } },
    // (c) Дистанция 5 > 4 → «цель слишком далеко (дальность 4)».
    { title: 'цель слишком далеко (дальность 4)',
      mut: (S, u, wolf) => { wolf.y = 0; } },
  ];
  for (const { title, mut } of cases) {
    const S = scene178({ efir: true, spells: true });
    const c = S.c;
    const u = c.units.find((x) => x.kind === 'efir');
    const wolf = c.units.find((x) => x.id === 'm0');
    u.x = 3; u.y = 5;
    wolf.x = 3; wolf.y = 4;
    wolf.maxHP = 100; wolf.hp = 100;
    mut(S, u, wolf);
    tickSlice(S.canvas, S.rafStubs);
    // (ре-рендер: состояние кнопки — из нового состояния боя)
    const byAct = byActOf178(S);
    assert.ok(byAct.cast, 'кнопка «Каст» построена: ' + title);
    assert.equal(byAct.cast.style.display, '',
      'видима на ходу Эфира (видимость — по активному юниту): ' + title);
    assert.equal(byAct.cast.disabled, true, 'disabled: ' + title);
    assert.equal(byAct.cast.title, title, 'title — причина ДОСЛОВНО: ' + title);
    // Стаб-клик (работает и на disabled): ПИН ПРЕДПРОВЕРКИ — без неё
    // в деградационном состоянии действия не было бы БЕЗ строки в
    // лог (тишина); с ней — ровно одна строка, трат нет.
    const mp0 = u.mp, int0 = c.efs.spellInt, whp0 = wolf.hp, n0 = c.log.length;
    byAct.cast.listeners.click[0]();
    tickSlice(S.canvas, S.rafStubs);
    const added = Array.from(c.log).slice(n0);
    assert.deepEqual(added, [title],
      'ровно ОДНА строка — причина в журнал: ' + JSON.stringify(added));
    assert.equal(u.mp, mp0, 'мана не потрачена: ' + title);
    assert.equal(c.efs.spellInt, int0, 'пул не потрачен: ' + title);
    assert.equal(wolf.hp, whp0, 'волк не задет: ' + title);
    assert.equal(S.G.activeUnitId(c), 'efir', 'очередь не сдвинулась: ' + title);
  }
});

test('боевой UI: 000178 — тап «Лечение» на ходу support-наёмника = клавиша H: +HP/attackLeft/лог, ход не сгорел (CU178-HEAL)', () => {
  // HEAL-сцена (roster-only): turnOrder ['m0','player','a0'];
  // pre-roll: волк m0 действует сам (переместился, НЕ достал игрока),
  // стоп на 'player'; Space → 'a0' (медик, attackLeft 1).
  const S = scene178({ spells: true, roster: ROSTER_MEDIC });
  const c = S.c;
  const medic = c.units.find((x) => x.side === 'ally'
    && x.role === 'support' && x.kind === 'merc');
  assert.ok(medic, 'фикстура: support-наёмник в партии');
  assert.equal(medic.id, 'a0', 'фикстура: медик — a0 (Эфира в бою нет)');
  assert.equal(Array.from(c.turnOrder).join(','), 'm0,player,a0',
    'фикстура: очередь');
  assert.equal(S.G.activeUnitId(c), 'player',
    'pre-roll: волк сам → стоп на ходу игрока');
  press(S.keydown, 'Space');
  tickSlice(S.canvas, S.rafStubs);
  assert.equal(S.G.activeUnitId(c), 'a0', 'Space → ход support-наёмника');
  // Раненый игрок (ядро само выбирает цель: mostWounded).
  assert.equal(S.G.derived(c.player).maxHP, 25, 'фикстура: maxHP 25');
  c.player.hp = 15;
  tickSlice(S.canvas, S.rafStubs);
  const byAct = byActOf178(S);
  assert.ok(byAct.heal,
    'кнопка «Лечение» построена (гейт: support-наёмник в партии)');
  assert.equal(byAct.cast, undefined,
    '«Каст» ОТСУТСТВУЕТ (Эфира в бою нет — гейт build ложен)');
  assert.equal(byAct.heal.style.display, '',
    'видима на ходу support-наёмника (display "")');
  assert.equal(byAct.heal.disabled, false,
    'canDoAction ok (слот 1, раненый есть, mend) — активна');
  assert.equal(byAct.heal.title, '', 'без причины — title пусто');
  assert.equal(byAct.heal.ariaLabel, 'Лечение', 'aria-label «Лечение»');
  assert.equal(byAct.heal.textContent, '', 'текстовой подписи нет (000124)');
  assert.equal(byAct.heal.children.length, 1, 'ровно ОДИН дочерний элемент');
  const img = byAct.heal.children[0];
  assert.equal(img.tagName, 'img', 'иконка — <img>');
  assert.equal(img.src, 'assets/ui/combat_heal.svg',
    'иконка — assets/ui/combat_heal.svg (конвенция 000124)');
  assert.equal(img.alt, '', 'alt="" (иконка презентационная)');
  assert.ok(fs.existsSync(path.join(ROOT, 'assets/ui/combat_heal.svg')),
    'файл иконки существует в каталоге');
  // Снапшот ДО лечения («до-значения»).
  assert.equal(c.player.hp, 15, 'фикстура: игрок ранен 15/25');
  assert.equal(medic.attackLeft, 1, 'фикстура: слот действия 1');
  const n0 = c.log.length;
  // Тап кнопки (нативный click — стаб-клик).
  byAct.heal.listeners.click[0]();
  tickSlice(S.canvas, S.rafStubs);
  // Результат ОДНОГО тапа (= KeyH): высшая степень лечения u.spells
  // (mend ур. 2: +6). Строку строит ЯДРО (allyHealAction — 000193:
  // лечение — ЗАКЛИНАНИЕ: расход пул/мана наёмника, НЕ слот действия;
  // UI свою строку не ведёт).
  const added = Array.from(c.log).slice(n0);
  assert.deepEqual(added, ['Медик лечит Флогистон (+6).'],
    'лог — ровно ОДНА строка ядра: ' + JSON.stringify(added));
  assert.equal(c.player.hp, 21, 'игрок 15→21 (mend: +6)');
  assert.equal(medic.attackLeft, 1,
    'лечение НЕ занимает слот действия (000193: слот 1→1)');
  assert.equal(medic.mp, 2, 'мана 5→2 (mend: 3 маны; 000193: attrs {} → 5)');
  assert.equal(medic.spellWis, 0, 'пул «Заклинание» (Мудрость) 1→0 (000193)');
  assert.equal(S.G.activeUnitId(c), 'a0', 'ход НЕ сгорел (лечение ≠ endTurn)');
  // После лечения — то же, что и клавише H: пул исчерпан (000193:
  // порядок Д-J — раненые → каталог → пул → мана).
  const after = S.G.canDoAction(c, 'heal', { targetId: c.targetId });
  assert.equal(after.ok, false, 'после — недоступно (пул исчерпан)');
  assert.equal(after.reason, 'действий «Заклинание» (Мудрость) больше нет',
    'причина дословно (та же, что дала бы клавиша; 000193)');
});

test('боевой UI: 000178 — «Лечение» disabled с дословными title (гейты allyCanDo); стаб-клик — ровно одна строка в лог, трат НЕТ (CU178-HEAL-OFF)', () => {
  const cases = [
    // (a) Пул исчерпан → «действий «Заклинание» (Мудрость) больше
    // нет» (порядок ядра 000193 Д-J: раненые → каталог → пул →
    // мана: раненый есть, каталог есть, пула нет).
    { title: 'действий «Заклинание» (Мудрость) больше нет',
      mut: (S, medic) => { medic.spellWis = 0; S.c.player.hp = 15; } },
    // (b) Никто не ранен (игрок 25/25, медик цел) → «нет раненых».
    { title: 'нет раненых', mut: null },
    // (c) В у.спells нет лечения → «нет лечения» (порядок ядра
    // 000193: раненые → каталог).
    { title: 'нет лечения',
      roster: [{ name: 'Медик', role: 'support', level: 2, dmg: 1, hp: 1,
        spells: [] }],
      mut: (S) => { S.c.player.hp = 15; } },
  ];
  for (const { title, mut, roster } of cases) {
    const S = scene178({ spells: true, roster: roster || ROSTER_MEDIC });
    const c = S.c;
    press(S.keydown, 'Space'); // ход игрока → a0 (медик)
    tickSlice(S.canvas, S.rafStubs);
    assert.equal(S.G.activeUnitId(c), 'a0', 'ход support-наёмника: ' + title);
    const medic = c.units.find((x) => x.side === 'ally'
      && x.role === 'support' && x.kind === 'merc');
    if (mut) mut(S, medic);
    tickSlice(S.canvas, S.rafStubs);
    // (ре-рендер: состояние кнопки — из нового состояния боя)
    const byAct = byActOf178(S);
    assert.ok(byAct.heal, 'кнопка «Лечение» построена: ' + title);
    assert.equal(byAct.heal.style.display, '',
      'видима на ходу наёмника (видимость — по активному юниту): ' + title);
    assert.equal(byAct.heal.disabled, true, 'disabled: ' + title);
    assert.equal(byAct.heal.title, title, 'title — причина ДОСЛОВНО: ' + title);
    // Стаб-клик (работает и на disabled): причина в журнал, трат НЕТ.
    const hp0 = c.player.hp, al0 = medic.attackLeft, n0 = c.log.length;
    byAct.heal.listeners.click[0]();
    tickSlice(S.canvas, S.rafStubs);
    const added = Array.from(c.log).slice(n0);
    assert.deepEqual(added, [title],
      'ровно ОДНА строка — причина в журнал: ' + JSON.stringify(added));
    assert.equal(c.player.hp, hp0, 'HP не изменился: ' + title);
    assert.equal(medic.attackLeft, al0, 'слот не потрачен: ' + title);
    assert.equal(S.G.activeUnitId(c), 'a0', 'очередь не сдвинулась: ' + title);
  }
});

test('боевой UI: 000178 — гейты build(): без Эфира/support-наёмника кнопок НЕТ, панель бит-в-байт 7 (CU178-GATE)', () => {
  // ЗЕЛЁНЫЙ guard (зелёный и до, и после фикса): кнопки создаются
  // ТОЛЬКО под статическими гейтами состава партии (c.units в
  // build()): «Каст» — Эфир в партии; «Лечение» — support-наёмник
  // (role 'support' && kind 'merc'). Дефолтный бой и melee-отряд
  // (Вольк — не Эфир и не support) — 7 табличных кнопок бит-в-байт:
  // пины «7 штук»/000124/CU171-GATE/SB1 — без ре-пина (спящий пин,
  // паттерн 000166/000171: защита от «кнопок без гейта»).
  const D = scene178({});
  assert.equal(D.buttons.length, 7, 'дефолтный бой — 7 кнопок');
  assert.ok(!D.buttons.some((b) => b.dataset.act === 'cast'),
    'dataset.act=cast отсутствует (Эфира нет)');
  assert.ok(!D.buttons.some((b) => b.dataset.act === 'heal'),
    'dataset.act=heal отсутствует (support-наёмника нет)');
  const M = scene178({ roster: [{ name: 'Вольк', role: 'melee', level: 2,
    dmg: 1, hp: 1 }] });
  assert.equal(M.buttons.length, 7,
    'melee-отряд (Вольк) — 7 кнопок (союзник есть, но НЕ под гейты)');
  assert.ok(!M.buttons.some((b) => b.dataset.act === 'cast'),
    'dataset.act=cast отсутствует (Вольк — не Эфир)');
  assert.ok(!M.buttons.some((b) => b.dataset.act === 'heal'),
    'dataset.act=heal отсутствует (Вольк — не support)');
});

// =====================================================================
// Задача 000182. Пины задекларированных гардов: боевая область
// (ретро-20261010) — ТОЛЬКО ТЕСТЫ (pin/restore, без смены поведения).
//
// expectedRedCount = 0: все 18 целевых гардов УЖЕ существуют в src
// (проверено построчно, 14d2cd6) → все новые тесты ЗЕЛЁНЫЕ на
// master. «Краснота» каждого пина = пробел покрытия (гард не был
// закреплён тестом), доказуемая УДАЛЕНИЕМ соответствующего guard'а
// в src (карта «что краснеет» — memory/000182-combat-test-pins.md §3).
// Контракты — memory/000182-combat-guard-pins.md.
//
// Группы ТЗ: 000175 (D10/LW/H1-2X2), 000171 (BOOK/BTN8/NOSP),
// 000174 (NOMOTION/PRUNE/FRAC/UIMOVES/2X2), 000178 (VIS-MOB/ORDER),
// 000179 (GATE-ORDER). e2e-пины 000170 (D5B/D7/ONCE) —
// tests/movement-freeze-e2e.test.js (MF182-*); формула лечения
// 000180 — tests/efir.test.js (субкейсы (c)/(d) HEAL-1).
//
// Инъекции — ТОЛЬКО через свойства объектов-экспортов (UMD-ловушка
// 000038) + whitebox-мутации c (прецеденты файла); новые RNG-броски
// НЕТ (c._rng = () => 0.99 — страховка, не вызов).
// =====================================================================

test('боевой UI: 000182 — без G.mobReachCells: деградация Д10 — ровно 1 console.error /mobReachCells/ на первый render, 0 штрихов, render жив, 2-й render — предупреждений всё ещё 1 (reachWarned) (CU182-D10)', () => {
  const rafStubs = makeRafStubs();
  const { G, body } = loadCombatUi(true, {
    withoutMobReach: true,
    performance: { now: () => NOW175 },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  assert.equal(G.mobReachCells, undefined,
    'фикстура: снапшот G без mobReachCells (удаление ДО загрузки '
    + 'combat-ui.js — UMD-ловушка 000038)');
  const origErr = console.error;
  const errs = [];
  console.error = (...a) => { errs.push(a.join(' ')); };
  // Обёртка ДО startCombat: синхронный render внутри startCombat
  // (build(); render();) — ПЕРВЫЙ render → предупреждение fires здесь
  // (reachWarned=true), не на первом tickSlice.
  const requested = [];
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(),
    mobs: ['wolf'], mobLevel: 1, seed: 42,
    spriteLoader: fakeLoader84(requested,
      [['assets/sprites/mobs/wolf_', { __fake: 'wolf' }]]),
  });
  const wolf = c.units.find((u) => u.mobId === 'wolf');
  assert.equal(c.targetId, wolf.id, 'фикстура: авто-цель — живой волк');
  const canvas = findCanvas(body);
  try {
    const t1 = tickSlice(canvas, rafStubs);
    assert.equal(errs.length, 1,
      'первый render: ровно 1 console.error (logged once): '
      + JSON.stringify(errs));
    assert.match(errs[0], /mobReachCells/,
      'сообщение о Game.mobReachCells: ' + errs[0]);
    assert.equal(hatchTiles175(t1).length, 0,
      '0 штрихов (штриховки нет, падения нет)');
    assert.ok(!t1.styleCalls.some(
      (x) => x[0] === 'strokeStyle' && x[1] === HATCH175),
      'strokeStyle HATCH175 в стиле нет (слой не рисовался)');
    assert.ok(t1.calls.length > 0,
      'render жив: сетка/юниты нарисованы (не упал в штриховке)');
    tickSlice(canvas, rafStubs);
    assert.equal(errs.length, 1,
      'второй render: предупреждений всё ещё 1 (reachWarned): '
      + JSON.stringify(errs));
  } finally {
    console.error = origErr;
  }
});

test('боевой UI: 000182 — штриховка: lineWidth === 1 на КАЖДОМ штрихе (стиль ОДИН раз до цикла — 000175; декодер lineWidthSets) (CU182-LW)', () => {
  const S = scene175({
    loader: [['assets/sprites/mobs/wolf_', { __fake: 'wolf' }]],
  });
  const t = tickSlice(S.canvas, S.rafStubs);
  // ОБЛАСТЬ ПИНА (правка по ревью 2026-10-10): пин — ЭФФЕКТИВНАЯ
  // толщина в момент КАЖДОГО hatch-stroke, а НЕ строка
  // `g2.lineWidth = 1;` в drawMobReachHatch (combat-ui.js L1303)
  // изолированно: в текущем z-порядке сетка (render, L1368) выставляет
  // lineWidth=1 ДО штриховки (L1387), поэтому удаление ТОЛЬКО строки
  // L1303 поведение не меняет и красноты НЕ даёт. Пин краснеет при
  // ЛЮБОМ изменении эффективной толщины (напр., сетка/слой до
  // штриховки станет 2px, сброс lineWidth внутри цикла).
  // Декодер: действовавшее lineWidth на каждом hatch-'stroke'.
  // lineWidthSets — [value, evIdx] в полных events; срез tickSlice —
  // events[e0..]: присвоение с evIdx действует на события с индексом
  // ≥ evIdx; внутри среза — с индексом ≥ evIdx − e0.
  const e0 = S.canvas.events.length - t.events.length;
  let lw = 1; // canvas-дефолт
  for (const [v, evIdx] of S.canvas.lineWidthSets)
    if (evIdx <= e0) lw = v;
  const inSlice = S.canvas.lineWidthSets
    .filter(([v, evIdx]) => evIdx > e0)
    .map(([v, evIdx]) => [v, evIdx - e0])
    .sort((a, b) => a[1] - b[1]);
  let strokeStyle = null;
  const lws = [];
  for (let i = 0; i < t.events.length; i++) {
    const ev = t.events[i];
    if (ev.s) {
      if (ev.s[0] === 'strokeStyle') strokeStyle = ev.s[1];
    } else {
      while (inSlice.length && inSlice[0][1] <= i) lw = inSlice.shift()[0];
      if (ev.c[0] === 'stroke' && strokeStyle === HATCH175) lws.push(lw);
    }
  }
  assert.ok(lws.length > 0, 'штрихи штриховки в рендере (декод)');
  for (const v of lws)
    assert.equal(v, 1, 'lineWidth === 1 на каждом штрихе штриховки');
});

test('боевой UI: 000182 — H1 «нарисовано == ядро» для 2×2-моба (cave_bear): набор штрихов == G.mobReachCells(c, bear) (CU182-H1-2X2)', () => {
  const S = scene175({
    mobs: ['cave_bear'],
    loader: [['assets/sprites/mobs/cave_bear_', { __fake: 'bear' }]],
  });
  const { G, c, rafStubs } = S;
  const bear = c.units.find((u) => u.mobId === 'cave_bear');
  assert.equal(c.targetId, bear.id, 'фикстура: авто-цель — медведь');
  const t = tickSlice(S.canvas, S.rafStubs);
  const tiles = hatchTiles175(t);
  const expected = G.mobReachCells(c, bear);
  // 000188 (M7, ретро-20261011): анти-вакуум паритета (паттерн
  // CU182-LW `lws.length > 0`): без ассерта непустоты НАБОРА ЯДРА
  // деградация mobReachCells до ∅ проходила бы как 0===0 +
  // deepEqual(∅, ∅) — пустое равенство.
  assert.ok(expected.size > 0, 'ядро: набор достижимости медведя не пуст');
  assert.equal(tiles.length, expected.size,
    'число штрихов == число клеток (2×2-якорь: диагональ на клетку): '
    + tiles.length + ' vs ' + expected.size);
  assert.deepEqual(tiles.slice().sort(), [...expected].sort(),
    'декодированный набор == G.mobReachCells(c, bear)');
});

test('боевой UI: 000182 — книга: закрывается при УСПЕШНОМ тапе (bookOpen=false только при успехе castRow/resurrectCast), при отказе остаётся ОТКРЫТОЙ (CU182-BOOK)', () => {
  // (a) Успех: мёртвый союзник выбран → книга открыта → каст → закрыта.
  const S = scene166({ deadAllies: 1 });
  const { c, ally } = S;
  assert.ok(!ally.alive, 'фикстура: союзник мёртв');
  c.targetId = ally.id; // выбор цели (паттерн CU166: whitebox)
  press(S.keydown, 'KeyQ');
  const bookBox = findByClass(S.body, 'combat-spellbook');
  assert.equal(bookBox.style.display, '', 'книга открыта (KeyQ)');
  const byAct = {};
  for (const b of S.body.querySelectorAll('.combat-actions button'))
    byAct[b.dataset.act] = b;
  const mp0 = c.player.mp;
  byAct.resurrect.listeners.click[0]();
  assert.ok(ally.alive && ally.hp === Math.round(ally.maxHP / 2),
    'каст успешен (50% HP): ' + ally.hp);
  assert.equal(c.player.mp, mp0 - 15, 'каст: мана −15');
  assert.equal(bookBox.style.display, 'none',
    'книга ЗАКРЫТА при успешном тапе (bookOpen=false при успехе)');
  // (b) Отказ: СВЕЖАЯ сцена, мана 0 → ровно 1 строка причины, трат
  // НЕТ, союзник мёртв, книга ОСТАЛАСЬ открыта.
  const B = scene166({ deadAllies: 1 });
  B.c.player.mp = 0;
  B.c.targetId = B.ally.id;
  press(B.keydown, 'KeyQ');
  const bookBox2 = findByClass(B.body, 'combat-spellbook');
  assert.equal(bookBox2.style.display, '', 'фикстура: книга открыта');
  const byAct2 = {};
  for (const b of B.body.querySelectorAll('.combat-actions button'))
    byAct2[b.dataset.act] = b;
  const n0 = B.c.log.length;
  const mp0b = B.c.player.mp;
  byAct2.resurrect.listeners.click[0]();
  const added = Array.from(B.c.log).slice(n0);
  assert.equal(added.length, 1,
    'ровно ОДНА строка причины отказа: ' + JSON.stringify(added));
  assert.equal(B.c.player.mp, mp0b, 'трат НЕТ (мана неизменна)');
  assert.ok(!B.ally.alive, 'союзник остаётся мёртв (каста не было)');
  assert.equal(bookBox2.style.display, '',
    'книга ОСТАЛАСЬ открыта при отказе (игрок видит причину)');
});

test('боевой UI: 000182 — герой знает «Воскрешение» (без Эфира/medica): ровно 8 кнопок; порядок 7 табличных (first-appearance COMBAT_KEYS) + resurrect (CU182-BTN8)', () => {
  const S = scene166();
  assert.equal(S.buttons.length, 8,
    'кнопок 8 (7 табличных + resurrect; гейты: cast нет — Эфира нет, '
    + 'heal нет — support-наёмника нет)');
  assert.deepEqual(S.buttons.map((b) => b.dataset.act),
    ['attack', 'spellbook', 'block', 'quickItem', 'invItem', 'flee',
      'endTurn', 'resurrect'],
    'порядок build(): таблица + resurrect (после cast/heal-блоков)');
});

test('боевой UI: 000182 — без G.Spells (битый порядок): resurrect-кнопка ЕСТЬ (canResurrect — чистое чтение u.spells), disabled + «Заклинания недоступны», стаб-клик → 1 строка, трат НЕТ, книга пустая «—» (CU182-NOSP)', () => {
  const S = scene166({ deadAllies: 1, spells: false });
  const { G, c, ally } = S;
  assert.equal(G.Spells, undefined, 'фикстура: G.Spells отсутствует');
  assert.ok(G.SpellBook, 'G.SpellBook на месте (книга строится; '
    + 'spellBookWarned — только при отсутствии SpellBook)');
  const byAct = {};
  for (const b of S.body.querySelectorAll('.combat-actions button'))
    byAct[b.dataset.act] = b;
  assert.ok(byAct.resurrect,
    'кнопка resurrect построена (canResurrect — чистое чтение)');
  assert.equal(byAct.resurrect.disabled, true,
    'disabled (canCastSpell — движок не загружен)');
  assert.equal(byAct.resurrect.title, 'Заклинания недоступны',
    'title дословно (rowChk-фолбэк): ' + byAct.resurrect.title);
  const n0 = c.log.length;
  const mp0 = c.player.mp;
  byAct.resurrect.listeners.click[0](); // стаб-клик (disabled не помеха)
  const added = Array.from(c.log).slice(n0);
  assert.deepEqual(added, ['Заклинания недоступны'],
    'стаб-клик: ровно ОДНА строка в журнал: ' + JSON.stringify(added));
  assert.equal(c.player.mp, mp0, 'трат НЕТ (мана)');
  assert.ok(!ally.alive, 'союзник остаётся мёртв (каста нет)');
  // Книга: entriesFor(unit, null) → [] → пустая книга — строка «—».
  press(S.keydown, 'KeyQ');
  const bookBox = findByClass(S.body, 'combat-spellbook');
  assert.equal(bookBox.style.display, '', 'книга открывается');
  assert.equal(bookBox.children.length, 1,
    'пустая книга — ОДНА строка: ' + bookBox.children.length);
  assert.equal(bookBox.children[0].textContent, '—',
    'строка «—» (паттерн 000145)');
});

test('боевой UI: 000182 — без motion.js: тихий фолбэк — якорь = МОДЕЛЬНЫЙ тайл («телепорт»), 2 Space без TypeError, c._uiMoves drained, 0 console.error (контракт тишины) (CU182-NOMOTION)', () => {
  let T = 0;
  const rafStubs = makeRafStubs();
  const { G, keydown, body } = loadCombatUi(true, {
    withoutMotion: true,
    performance: { now: () => T },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  const fakeWolf = { __fake: 'wolf' };
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
    spriteLoader: {
      image: (p) => (p.startsWith('assets/sprites/mobs/wolf_')
        ? fakeWolf : null),
    },
  });
  const canvas = findCanvas(body);
  const wolf = c.units.find((u) => u.mobId === 'wolf');
  // R5-геометрия: волк (3,3), fast (movePerTurn 2), игрок (3,6),
  // камней нет: волна 1 — (3,4),(3,5) (модель после волны).
  wolf.x = c.px; wolf.y = c.py - 3;
  c.obstacles.clear();
  wolf.movePerTurn = 2;
  c._rng = () => 0.99;
  const origErr = console.error;
  const errs = [];
  console.error = (...a) => { errs.push(a.join(' ')); };
  let n0;
  try {
    n0 = canvas.drawCalls.length;
    assert.doesNotThrow(() => press(keydown, 'Space'),
      'Space (волна 1) без TypeError (фолбэк без motion.js)');
    const dw = diOf(canvas.drawCalls.slice(n0), fakeWolf);
    assert.ok(dw, 'спрайт волка нарисован');
    assert.equal(dw[1][1], 3 * 48 + 8,
      'x = МОДЕЛЬ (3,5) — «телепорт»-фолбэк (документировано), '
      + 'не дробный: ' + dw[1][1]);
    assert.equal(dw[1][2], 5 * 48 + 8, 'y = МОДЕЛЬ (3,5)');
    assert.equal(c._uiMoves, null, 'drain: c._uiMoves = null');
    T = 150;
    n0 = canvas.drawCalls.length;
    rafStubs.scheduled[rafStubs.scheduled.length - 1](); // tick
    const dw2 = diOf(canvas.drawCalls.slice(n0), fakeWolf);
    assert.equal(dw2[1][1], 3 * 48 + 8, 'T=150: всё ещё модель (нет lerp)');
    assert.equal(dw2[1][2], 5 * 48 + 8, 'T=150: всё ещё модель (нет lerp)');
    assert.doesNotThrow(() => press(keydown, 'Space'),
      '2-й Space без TypeError (волна 2 — атака, d=1)');
  } finally {
    console.error = origErr;
  }
  assert.equal(errs.length, 0,
    'тихий фолбэк: 0 console.error (в ветке фолбэка логов НЕТ): '
    + JSON.stringify(errs));
});

test('боевой UI: 000182 — prune мёртвого/сбежавшего юнита (startMoveAnims) + якорь трупа (mobAnchor !u.alive → модель): труп dead-кадр РОВНО на модели, сбежавший НЕ рисуется, 2-й Space без TypeError (CU182-PRUNE)', () => {
  const runCase = (fled) => {
    let T = 0;
    const rafStubs = makeRafStubs();
    const { G, keydown, body } = loadCombatUi(true, {
      performance: { now: () => T },
      requestAnimationFrame: rafStubs.requestAnimationFrame,
      cancelAnimationFrame: rafStubs.cancelAnimationFrame,
    });
    const fakeRider = { __fake: 'rider' }, fakeWolf = { __fake: 'wolf' },
      fakeWolfDead = { __fake: 'wolf_dead' };
    const c = G.combatUI.startCombat({
      hero: G.createCharacter(),
      mobs: ['orc_rider', 'wolf'], mobLevel: 1, seed: 7,
      spriteLoader: {
        image: (p) => {
          // dead-кадр — отдельный объект ('_dead_'): пин трупа —
          // drawImage только при наличии картинки из лоадера.
          if (p.startsWith('assets/sprites/mobs/orc_rider_'))
            return fakeRider;
          if (p.startsWith('assets/sprites/mobs/wolf_dead_'))
            return fakeWolfDead;
          if (p.startsWith('assets/sprites/mobs/wolf_')) return fakeWolf;
          return null;
        },
      },
    });
    const canvas = findCanvas(body);
    const rider = c.units.find((u) => u.mobId === 'orc_rider');
    const wolf = c.units.find((u) => u.mobId === 'wolf');
    // R8-геометрия (буквальная): райдер (0,0) fast (2 сегмента =
    // 600 мс), волк (3,3) (1 сегмент = 300 мс), игрок (3,6), камней
    // нет. Волна 1: райдер (1,0),(2,0); волк (3,4).
    rider.x = 0; rider.y = 0;
    wolf.x = c.px; wolf.y = c.py - 3;
    c.obstacles.clear();
    rider.movePerTurn = 2;
    wolf.movePerTurn = 1;
    c._rng = () => 0.99;
    let n0 = canvas.drawCalls.length;
    press(keydown, 'Space'); // T=0: волна 1 + синхронный render
    T = 150;
    n0 = canvas.drawCalls.length;
    rafStubs.scheduled[rafStubs.scheduled.length - 1](); // sanity-тик
    if (fled) {
      wolf.fled = true; // сбежавший — НЕ рисуется вообще (drawUnits)
    } else {
      G.combatInternals.dealDamageToMob(c, wolf, 9999); // труп
      assert.ok(!wolf.alive, 'фикстура: волк мёртв');
      assert.equal(c.result, null,
        'фикстура: бой жив (райдер не мёртв — checkVictory нет)');
    }
    T = 300;
    n0 = canvas.drawCalls.length;
    rafStubs.scheduled[rafStubs.scheduled.length - 1](); // tick
    const calls = canvas.drawCalls.slice(n0);
    if (fled) {
      assert.ok(!calls.some((x) => x[0] === 'drawImage'
        && (x[1][0] === fakeWolf || x[1][0] === fakeWolfDead)),
        'fled: волка НЕ нарисовано ВООБЩЕ (drawUnits: if (u.fled) '
        + 'continue — даже труп)');
    } else {
      const dw = diOf(calls, fakeWolfDead);
      assert.ok(dw, 'труп: dead-кадр нарисован (лоадер _dead_)');
      assert.equal(dw[1][1], 3 * 48 + 8,
        'труп РОВНО на модели x=3 (mobAnchor !u.alive → {x:u.x,y:u.y})');
      assert.equal(dw[1][2], 4 * 48 + 8, 'труп РОВНО на модели y=4');
      assert.equal(dw[1][3], 32, '1×1: 32px');
      assert.equal(dw[1][4], 32, '1×1: 32px');
      assert.ok(!calls.some((x) => x[0] === 'drawImage'
        && x[1][0] === fakeWolf),
        'у трупа move-кадра НЕТ (только dead)');
    }
    // Райдер при T=300 — середина глейда ((1,0) — сегмент 2,
    // easeInOut(0) = 0 → граница (1,0)).
    const dr = diOf(calls, fakeRider);
    assert.ok(dr, 'райдер нарисован (глейд жив)');
    assert.equal(dr[1][1], 1 * 48 + 8, 'T=300: райдер (1,0)');
    // 2-й Space (волна 2) — prune entry + re-timing райдера.
    T = 450;
    n0 = canvas.drawCalls.length;
    assert.doesNotThrow(() => press(keydown, 'Space'),
      '2-й Space без TypeError (prune '
      + (fled ? 'fled' : 'мёртвого') + ' entry)');
    const dr2 = diOf(canvas.drawCalls.slice(n0), fakeRider);
    assert.ok(dr2, 'райдер нарисован после волны 2');
    assert.equal(dr2[1][1], 1.5 * 48 + 8,
      'райдер re-timed от дробного якоря (1.5,0) (80)');
    assert.equal(dr2[1][2], 8, 'райдер y — 8 (ряд 0)');
  };
  runCase(false); // (a) труп
  runCase(true);  // (b) fled
});

test('боевой UI: 000182 — Space внутри живого глейда: from = ТЕКУЩИЙ ДРОБНЫЙ якорь (re-timing, startMoveAnims) — райдер x = 8 + 48·(52/27) ≈ 100.4444 (не beforePos (0,0), не модель (2,0)); волк = СТАРЫЙ финал (3,4) (CU182-FRAC)', () => {
  let T = 0;
  const rafStubs = makeRafStubs();
  const { G, keydown, body } = loadCombatUi(true, {
    performance: { now: () => T },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  const fakeRider = { __fake: 'rider' }, fakeWolf = { __fake: 'wolf' };
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(),
    mobs: ['orc_rider', 'wolf'], mobLevel: 1, seed: 7,
    spriteLoader: {
      image: (p) => {
        if (!p.includes('_move_')) return null;
        if (p.startsWith('assets/sprites/mobs/orc_rider_')) return fakeRider;
        if (p.startsWith('assets/sprites/mobs/wolf_')) return fakeWolf;
        return null;
      },
    },
  });
  const canvas = findCanvas(body);
  const rider = c.units.find((u) => u.mobId === 'orc_rider');
  const wolf = c.units.find((u) => u.mobId === 'wolf');
  // R8-геометрия (буквальная): райдер (0,0) fast (2 сегмента =
  // 600 мс), волк (3,3) (1 сегмент = 300 мс), игрок (3,6), камней
  // нет. Волна 1: райдер (1,0),(2,0); волк (3,4).
  rider.x = 0; rider.y = 0;
  wolf.x = c.px; wolf.y = c.py - 3;
  c.obstacles.clear();
  rider.movePerTurn = 2;
  wolf.movePerTurn = 1;
  c._rng = () => 0.99;
  let n0 = canvas.drawCalls.length;
  press(keydown, 'Space'); // T=0: волна 1 + синхронный render
  T = 150;
  n0 = canvas.drawCalls.length;
  rafStubs.scheduled[rafStubs.scheduled.length - 1](); // единственный
  // кадр в пределах глейдов (райдер 0.25, волк 0.5 — оба живы)
  // T=550: Space БЕЗ тика между 150 и 550.
  T = 550;
  n0 = canvas.drawCalls.length;
  assert.doesNotThrow(() => press(keydown, 'Space'), TypeError,
    'Space внутри живого глейда — без TypeError');
  const calls = canvas.drawCalls.slice(n0);
  // Волк: entry истёк (300 ≤ 550, рендера не было) → from = beforePos
  // (3,4) — старый финал (не reverse-глейд от новой модели (3,5)).
  const dw = diOf(calls, fakeWolf);
  assert.ok(dw, 'волк нарисован');
  assert.equal(dw[1][1], 3 * 48 + 8, 'волк x — СТАРЫЙ финал (3,4)');
  assert.equal(dw[1][2], 4 * 48 + 8, 'волк y — СТАРЫЙ финал (3,4)');
  // Райдер: entry жив (550 < 600) → from = mobAnchor(rider, 550):
  // tAll = 550/600 = 11/12; raw = 11/12·2 = 11/6; i = 1;
  // easeInOut(5/6) = (25/36)·(4/3) = 25/27;
  // from = lerpPos((1,0),(2,0), 25/27) = (52/27, 0).
  const dr = diOf(calls, fakeRider);
  assert.ok(dr, 'райдер нарисован (re-timing живого глейда)');
  const expectX = 8 + 48 * (52 / 27); // ≈ 100.4444
  assert.ok(Math.abs(dr[1][1] - expectX) < 1e-9,
    'райдер x = 8 + 48·(52/27) ≈ 100.4444 (ДРОБНЫЙ якорь): '
    + dr[1][1] + ' vs ' + expectX);
  assert.equal(dr[1][2], 8, 'райдер y = 8 (ряд 0)');
  assert.ok(Math.abs(dr[1][1] - 8) > 1,
    'НЕ from = beforePos (0,0) (x=8)');
  assert.ok(Math.abs(dr[1][1] - (8 + 48 * 2)) > 1,
    'НЕ from = модель (2,0) (x=104)');
});

test('боевой UI: 000182 — инвариант c._uiMoves: после КАЖДОЙ endTurn поле содержит ТОЛЬКО шаги текущего вызова (null — если мобы не двигались); после startCombat — null (pre-roll не анимируется, решение C 000174) (CU182-UIMOVES)', () => {
  const { G } = loadCombatUi(true, {});
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  const wolf = c.units.find((u) => u.mobId === 'wolf');
  // Геометрия: волк (3,2), fast (movePerTurn 2), игрок (3,6), d=4,
  // камней нет: волна 1 — 2 шага (3,3),(3,4); волна 2 — 1 шаг (3,5)
  // (d=1 → дальше атака, не шаг); волна 3 — атака (движения нет).
  wolf.x = c.px; wolf.y = c.py - 4;
  c.obstacles.clear();
  wolf.movePerTurn = 2;
  c._rng = () => 0.99;
  assert.equal(c._uiMoves, null,
    'startCombat: pre-roll сброшен c._uiMoves = null (решение C)');
  // VM-кросс-риалм: записи созданы в контексте песочницы →
  // deepStrictEqual (проверка прототипов) не годится; JSON-норма —
  // те же поля/порядок.
  c.endTurn(); // волна 1
  assert.deepEqual(JSON.parse(JSON.stringify(c._uiMoves)),
    [{ id: 'm0', x: 3, y: 3 }, { id: 'm0', x: 3, y: 4 }],
    'волна 1: только to-tiles текущего вызова (форма {id,x,y}): '
    + JSON.stringify(c._uiMoves));
  c.endTurn(); // волна 2
  assert.deepEqual(JSON.parse(JSON.stringify(c._uiMoves)),
    [{ id: 'm0', x: 3, y: 5 }],
    'волна 2: СТАРЫХ записей НЕТ (сброс null до advanceQueue): '
    + JSON.stringify(c._uiMoves));
  c.endTurn(); // волна 3 — атака (d=1), движения нет
  assert.equal(c._uiMoves, null,
    'волна 3 (атака): null (НЕ пустой массив, не чужие шаги): '
    + JSON.stringify(c._uiMoves));
});

test('боевой UI: 000182 — глейд 2×2-моба (cave_bear): ВЕСЬ прямоугольник движется как ОДИН (якорь верхний-левый, mobAnchor); РОВНО ОДИН drawImage 80×80 за кадр (CU182-2X2)', () => {
  let T = 0;
  const rafStubs = makeRafStubs();
  const { G, keydown, body } = loadCombatUi(true, {
    performance: { now: () => T },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  const fakeBear = { __fake: 'bear' };
  const c = G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['cave_bear'], mobLevel: 1, seed: 42,
    spriteLoader: {
      image: (p) => (p.startsWith('assets/sprites/mobs/cave_bear_')
        ? fakeBear : null),
    },
  });
  const canvas = findCanvas(body);
  const bear = c.units.find((u) => u.mobId === 'cave_bear');
  assert.equal(bear.size.w, 2, 'фикстура: медведь 2×2 (w)');
  assert.equal(bear.size.h, 2, 'фикстура: медведь 2×2 (h)');
  // Геометрия ПОСЛЕ startCombat (паттерн R5): медведь (1,3), игрок
  // (3,6), камней нет. Медведь НЕ fast (movePerTurn 1), инициатива
  // 2 = игрок 2 (тай → очередь: игрок первым → pre-roll медведя нет).
  // stepTowardRect: sx=1, sy=1, adx=ady → TIE → x-first → шаг (2,3).
  bear.x = 1; bear.y = 3;
  c.obstacles.clear();
  c._rng = () => 0.99;
  const countDi = (slice, img) => slice
    .filter((x) => x[0] === 'drawImage' && x[1][0] === img).length;
  const pinBear = (slice, x, y, what) => {
    const di = diOf(slice, fakeBear);
    assert.ok(di, what + ': медведь нарисован (move-кадр)');
    assert.equal(di[1][1], x, what + ': x — якорь (верхний-левый)');
    assert.equal(di[1][2], y, what + ': y — якорь');
    assert.equal(di[1][3], 80, what + ': 2×CELL − 16 = 80 (ширина)');
    assert.equal(di[1][4], 80, what + ': 2×CELL − 16 = 80 (высота)');
    assert.equal(countDi(slice, fakeBear), 1,
      what + ': РОВНО ОДИН drawImage (весь прямоугольник как одно)');
  };
  let n0 = canvas.drawCalls.length;
  press(keydown, 'Space'); // T=0: волна (1 шаг (1,3)→(2,3))
  pinBear(canvas.drawCalls.slice(n0), 1 * 48 + 8, 3 * 48 + 8,
    'T=0: стартовый якорь (1,3)');
  T = 150;
  n0 = canvas.drawCalls.length;
  rafStubs.scheduled[rafStubs.scheduled.length - 1]();
  // tAll = 0.5 → easeInOut(0.5) = 0.5 → якорь (1.5, 3) — ДРОБНЫЙ x.
  pinBear(canvas.drawCalls.slice(n0), 1.5 * 48 + 8, 3 * 48 + 8,
    'T=150: дробный якорь (1.5,3)');
  T = 300;
  n0 = canvas.drawCalls.length;
  rafStubs.scheduled[rafStubs.scheduled.length - 1]();
  pinBear(canvas.drawCalls.slice(n0), 2 * 48 + 8, 3 * 48 + 8,
    'T=300: финальный тайл (2,3) (self-clean, модель)');
});

test('боевой UI: 000182 — активный юнит = МОБ (m0): ОБЕ кнопки «Каст»/«Лечение» display none (activeUnit — find(side===\'ally\') моба не находит → null; castHealVis) (CU182-VIS-MOB)', () => {
  const S = scene178({ efir: true, spells: true, roster: ROSTER_MEDIC });
  const c = S.c;
  tickSlice(S.canvas, S.rafStubs);
  // Whitebox (чистое чтение, без shared-инъекции): активный — волк.
  // activeUnitId — ЧИСТОЕ чтение c.turnOrder[c.turnIndex] (без
  // phase-гейта) → на ходу моба activeUnit() → null.
  c.turnIndex = c.turnOrder.indexOf('m0');
  assert.equal(S.G.activeUnitId(c), 'm0', 'фикстура: активен волк (m0)');
  tickSlice(S.canvas, S.rafStubs);
  const byAct = byActOf178(S);
  assert.equal(byAct.cast.style.display, 'none',
    'активен МОБ — «Каст» скрыта (не только на ходу Эфира)');
  assert.equal(byAct.heal.style.display, 'none',
    'активен МОБ — «Лечение» скрыта (не только на ходу наёмника)');
});

test('боевой UI: 000182 — DOM-порядок .combat-actions: [attack, spellbook, block, quickItem, invItem, flee, endTurn, cast, heal, resurrect] (build(): таблица first-appearance → cast (Эфир) → heal (support-merc) → resurrect (canResurrect)) (CU182-ORDER)', () => {
  const S = scene178({ efir: true, spells: true, roster: ROSTER_MEDIC,
    resurrect: true });
  assert.equal(S.buttons.length, 10,
    'кнопок 10 (7 табличных + cast + heal + resurrect)');
  assert.deepEqual(S.buttons.map((b) => b.dataset.act),
    ['attack', 'spellbook', 'block', 'quickItem', 'invItem', 'flee',
      'endTurn', 'cast', 'heal', 'resurrect'],
    'порядок = дотягиваемость тапа (memory/000178 §3.3): новые '
    + 'кнопки — ПОСЛЕ resurrect');
});

test('боевой UI: 000182 — spellbookUnitGate: фиксированный ПОРЯДОК (result → «бой закончен» ПЕРВЫМ; phase → «не ваш ход» вторым; активный персонаж — третьим) — зеркало resurrectChk (000171), закреплённое у CU171 (CU182-GATE-ORDER)', () => {
  // (a) result: ВСЕ строки -off, title «бой закончен», стаб-клик →
  // ровно 1 строка, трат НЕТ.
  {
    const S = scene84({ spells: true });
    const { c, keydown } = S;
    press(keydown, 'KeyQ'); // книга открыта ДО мутаций (R9)
    const bookBox = findByClass(S.body, 'combat-spellbook');
    assert.equal(bookBox.style.display, '', 'фикстура: книга открыта');
    c.result = { outcome: 'victory', xp: 0, gold: 0, defeated: 0,
      allyXp: [] };
    tickSlice(S.canvas, S.rafStubs);
    // Строки ВСЕГДА append в хвост (VM-стаб: innerHTML='' — no-op) →
    // СВЕЖИЕ строки (после мутации c.result — sig изменился,
    // перестроение) — ПОСЛЕДНИЕ дети с dataset.spell; старые (до
    // мутации, chk ok) остаются в children — проверяем ПОСЛЕДНЮЮ.
    const rows = bookBox.children.filter((x) => x.dataset.spell);
    assert.ok(rows.length > 0, 'строки книги есть');
    const last = rows[rows.length - 1];
    assert.ok(last.className.includes('combat-spellrow-off'),
      'свежая строка -off (гейт result): ' + last.dataset.spell);
    assert.equal(last.title, 'бой закончен',
      'title «бой закончен» (гейт result): ' + last.title);
    const n0 = c.log.length;
    const mp0 = c.player.mp;
    last.listeners.click[0]();
    const added = Array.from(c.log).slice(n0);
    assert.deepEqual(added, ['бой закончен'],
      'стаб-клик: ровно ОДНА строка в журнал: ' + JSON.stringify(added));
    assert.equal(c.player.mp, mp0, 'трат НЕТ (мана)');
  }
  // (b) phase (без result): «не ваш ход».
  {
    const S = scene84({ spells: true });
    const { c, keydown } = S;
    press(keydown, 'KeyQ');
    const bookBox = findByClass(S.body, 'combat-spellbook');
    assert.equal(bookBox.style.display, '', 'фикстура: книга открыта');
    c.phase = 'mob';
    tickSlice(S.canvas, S.rafStubs);
    const rows = bookBox.children.filter((x) => x.dataset.spell);
    const last = rows[rows.length - 1];
    assert.equal(last.title, 'не ваш ход',
      'title «не ваш ход» (гейт phase): ' + last.title);
    const n0 = c.log.length;
    last.listeners.click[0]();
    const added = Array.from(c.log).slice(n0);
    assert.deepEqual(added, ['не ваш ход'],
      'стаб-клик: ровно ОДНА строка: ' + JSON.stringify(added));
  }
  // (c) ПОРЯДОК: ОБА (result + phase='mob') → «бой закончен»
  // (result проверяется ПЕРВЫМ — не «не ваш ход»).
  {
    const S = scene84({ spells: true });
    const { c, keydown } = S;
    press(keydown, 'KeyQ');
    const bookBox = findByClass(S.body, 'combat-spellbook');
    c.result = { outcome: 'victory', xp: 0, gold: 0, defeated: 0,
      allyXp: [] };
    c.phase = 'mob';
    tickSlice(S.canvas, S.rafStubs);
    const rows = bookBox.children.filter((x) => x.dataset.spell);
    const last = rows[rows.length - 1];
    assert.equal(last.title, 'бой закончен',
      'ПОРЯДОК: result ПЕРЕД phase («бой закончен», не «не ваш ход»): '
      + last.title);
  }
});

test('боевой UI: 000188 — rowChk: нет G.Spells (движок), G.SpellsData НА МЕСТЕ — ЖИВАЯ строка книги: title «Заклинания недоступны» + клик → ровно 1 строка, трат нет, союзник мёртв, книга открыта (CU188-ROWCHK)', () => {
  // 000188 (M5, ретро-20261011): ЗЕРКАЛО CU182-NOSP на строках книги
  // (кнопка → строки). CU182-NOSP (spells:false) удаляет И G.Spells,
  // И G.SpellsData → entriesFor → [] → строк нет → rowChk-ветка была
  // недосягаема (finding ретро-20261011). Load-time опция
  // spellsDataOnly (GREEN-стадия) грузит spells-data.js в той же
  // позиции цепи, что с withSpells (ПОСЛЕ combat.js, ДО снапшота
  // combat-ui.js — UMD-ловушка 000038), но ПРОПУСКАЕТ spells.js:
  // каталог живой, движок нет — ровно состояние rowChk.
  // КРАСНАЯ фаза (этот коммит): опции в harness НЕТ → каталог не
  // загружен → фикстура-ассерт G.SpellsData падает осмысленно
  // (нет данных каталога — недостающий символ — опция; движка
  // тоже нет — маппинг spells:false), не синтаксисом.
  const S = scene166({ deadAllies: 1, spells: false, spellsDataOnly: true });
  const { G, c } = S;
  assert.equal(G.Spells, undefined, 'фикстура: движок G.Spells отсутствует');
  assert.ok(G.SpellsData && G.SpellsData.SPELLS_BY_ID,
    'фикстура: каталог G.SpellsData.SPELLS_BY_ID на месте '
    + '(spellsDataOnly: spells-data.js в цепи, spells.js пропущен)');
  assert.ok(G.SpellBook, 'G.SpellBook на месте (книга строится)');
  assert.ok(!S.ally.alive, 'фикстура: союзник мёртв (ассерт «каста нет» осмысленен)');
  press(S.keydown, 'KeyQ');
  const bookBox = findByClass(S.body, 'combat-spellbook');
  assert.equal(bookBox.style.display, '', 'книга открыта (KeyQ)');
  // СВЕЖАЯ сцена, ПЕРВОЕ KeyQ: children bookBox = ровно построенные
  // строки (перестроений не было — bookSig=null → один проход).
  const rows = bookBox.children.filter((x) => x.dataset.spell);
  assert.equal(rows.length, 1,
    'ровно ОДНА живая строка (каталог на месте, hero.spells=[resurrect]): '
    + rows.length);
  const row = rows[0];
  assert.equal(row.dataset.spell, 'resurrect', 'строка — спелл героя');
  assert.ok(row.className.includes('combat-spellrow-off'),
    'строка -off (rowChk-фолбэк: движок не загружен)');
  assert.equal(row.title, 'Заклинания недоступны',
    'title ДОСЛОВНО (rowChk-фолбэк combat-ui.js L1676-1678): '
    + row.title);
  // «Живость» строки: имя из каталога (НЕ голый id) — DOM buildSpellRow:
  // children = [img, body]; body: [top, desc]; top: [name, meta].
  assert.equal(row.children[1].children[0].children[0].textContent,
    'Воскрешение',
    'строка живая: имя из каталога (не голый id)');
  const n0 = c.log.length;
  const mp0 = c.player.mp;
  row.listeners.click[0](); // стаб-клик по off-строке
  const added = Array.from(c.log).slice(n0);
  assert.deepEqual(added, ['Заклинания недоступны'],
    'стаб-клик: ровно ОДНА строка в журнал (castRow-фолбэк L1743-1745 '
    + '+ logRejection): ' + JSON.stringify(added));
  assert.equal(c.player.mp, mp0, 'трат НЕТ (мана неизменна)');
  assert.ok(!S.ally.alive, 'союзник остаётся мёртв (каста не было)');
  assert.equal(bookBox.style.display, '',
    'книга ОСТАЛАСЬ открыта при отказе (игрок видит причину)');
});

// =====================================================================
// Задача 000197. БОЙ: рамки — убрать постоянно горящую голубую;
// голубая = активный персонаж; жёлтая = выбранный/цель.
// =====================================================================
// Контракт: memory/000197-combat-frames.md. ТЗ (tasks/pending/000197.md):
//   (1) убрать голубые рамки вокруг NPC и Эфира, горят постоянно;
//   (2) голубая рамка — ТОЛЬКО если персонаж активен (его ход);
//   (3) жёлтая рамка — у выбранных персонажей/мобов-целей удара.
// (000199 L4: «чей ход» теперь показывает рамка 000197 — жёлтое
// кольцо 41×41 активного союзника УБИРАЕТСЯ, роль индикатора хода
// перенята голубой рамкой.)
// Регион — ветвь ally в drawUnits (src/combat-ui.js): подложка 44×44
// (px+2, inset 2), рамка 39×39 (px+4.5, inset 4.5, lw2, '#8cf2fc'),
// кольцо хода 41×41 (px+2.5, inset 2.5, lw2, '#ffe27a'). НЕ тронуты:
// ранний проход 000166 (гейт canResurrect — дефолтный герой без
// «Воскрешения» → в сценах ниже не рисуется), mob-ветвь (жёлтая
// подсветка цели 39×39 у c.targetId — ТЗ её сохраняет), hero-ветвь
// (у героя рамок нет — ТЗ: «NPC и Эфир»; фолбэк-ромб героя —
// fillStyle '#8cf2fc', НЕ stroke — счёт strokeStyle от него не
// зависит), breath FX 000118 (арки, гейт c._fx.breath — в сценах
// ниже не активен), штриховка 000175 (stroke-only, цвет
// rgba(255,226,122,0.35) — ни '#ffe27a', ни strokeRect), ряд очереди
// (DOM-токены).
// Фикстуры — scene84/addMerc84/tickSlice/styledCalls, NOW84. Счёт
// стилей — ЗА ОДИН рендер-окно (tickSlice): styleCalls
// накапливается между рендерами.
// Состояние очереди (000167/000168, проверено пробным прогоном):
// сцены с Эфиром — ['efir','m0','player'], turnIndex 0 → Эфир
// АКТИВЕН по дефолту; без Эфира — ['m0','player'], turnIndex 1 →
// активен player; наёмник (addMerc84 — push в конец) — НЕАКТИВЕН.
// RED-фаза (этот коммит): CU197-A/B/C — падают на ТЕКУЩЕМ коде
// осмысленно (подложка/рамка рисуются БЕСУСЛОВНО у каждого живого
// союзника; жёлтое кольцо рисуется на активном союзнике). Гварды
// CU197-D/E/F/G — зелёные с первого дня (новое условие «активен» +
// сохранённое поведение); после реализации они же ловят
// «перечинку» (рамку бы выкинули во всех состояниях / убили
// жёлтую цель). CU197-H (000166 бит-в-бит) — не дублируется:
// уже покрыт CU166-HL (отдельный ранний проход, гейт canResurrect).
// =====================================================================

test('боевой UI: 000197/000213 — НЕАКТИВНЫЙ наёмник: на клетке нет подложки, нет рамки; голубой strokeStyle #8cf2fc за окно ровно 1 — рамка активного героя (ре-пин 000213) (CU197-A)', () => {
  // Сцена БЕЗ Эфира: turnOrder ['m0','player'], turnIndex 1 →
  // активен player; наёмник (addMerc84 — push в конец очереди) —
  // НЕАКТИВЕН. targetId = null — без жёлтой подсветки (нет
  // коллизии цвета). Без лоадера — фолбэк-сцена: рамки НЕ зависят
  // от спрайтов (контракт §2).
  const S = scene84();
  const merc = addMerc84(S.c, S.G, 5, 2, 'ranged');
  S.c.targetId = null;
  assert.equal(S.c.turnOrder[S.c.turnIndex], 'player',
    'фикстура: активен player, наёмник НЕАКТИВЕН: '
    + JSON.stringify(S.c.turnOrder) + ' @' + S.c.turnIndex);
  const ex = merc.x * 48, ey = merc.y * 48;
  const t = tickSlice(S.canvas, S.rafStubs);
  assert.ok(!t.calls.some((c) => c[0] === 'fillRect'
    && c[1][0] === ex + 2 && c[1][1] === ey + 2
    && c[1][2] === 44 && c[1][3] === 44),
    'подложки 44×44 на клетке НЕАКТИВНОГО наёмника НЕТ '
    + '(ТЗ: убрать постоянно горящую голубую)');
  assert.ok(!t.calls.some((c) => c[0] === 'strokeRect'
    && c[1][0] === ex + 4.5 && c[1][1] === ey + 4.5
    && c[1][2] === 39 && c[1][3] === 39),
    'рамки 39×39 на клетке НЕАКТИВНОГО наёмника НЕТ');
  assert.equal(t.styleCalls.filter((s) => s[0] === 'strokeStyle'
    && s[1] === '#8cf2fc').length, 1,
    'голубой stroke #8cf2fc за окно — ровно 1: рамка активного героя (ре-пин 000213; активного союзника нет)');
});

test('боевой UI: 000197/000213 — НЕАКТИВНЫЙ Эфир (turnIndex → слот player): на клетке нет подложки, нет рамки; голубой stroke за окно ровно 1 — рамка активного героя (ре-пин 000213) (CU197-B)', () => {
  // Дефолтная сцена с Эфиром — Эфир АКТИВЕН (turnIndex 0); сдвига-
  // ем очередь на слот player → Эфир НЕАКТИВЕН. targetId = null.
  const S = scene84({ efir: true });
  const u = S.c.units.find((x) => x.kind === 'efir');
  S.c.targetId = null;
  S.c.turnIndex = S.c.turnOrder.indexOf('player');
  assert.equal(S.c.turnOrder[S.c.turnIndex], 'player',
    'фикстура: активен player, Эфир НЕАКТИВЕН: '
    + JSON.stringify(S.c.turnOrder) + ' @' + S.c.turnIndex);
  const ex = u.x * 48, ey = u.y * 48;
  const t = tickSlice(S.canvas, S.rafStubs);
  assert.ok(!t.calls.some((c) => c[0] === 'fillRect'
    && c[1][0] === ex + 2 && c[1][1] === ey + 2
    && c[1][2] === 44 && c[1][3] === 44),
    'подложки 44×44 на клетке НЕАКТИВНОГО Эфира НЕТ');
  assert.ok(!t.calls.some((c) => c[0] === 'strokeRect'
    && c[1][0] === ex + 4.5 && c[1][1] === ey + 4.5
    && c[1][2] === 39 && c[1][3] === 39),
    'рамки 39×39 на клетке НЕАКТИВНОГО Эфира НЕТ');
  assert.equal(t.styleCalls.filter((s) => s[0] === 'strokeStyle'
    && s[1] === '#8cf2fc').length, 1,
    'голубой stroke #8cf2fc за окно — ровно 1: рамка активного героя (ре-пин 000213; ромб героя — fill, не stroke)');
});

test('боевой UI: 000197 — АКТИВНЫЙ союзник: жёлтого кольца 41×41 нет, #ffe27a за окно нет (Эфир по дефолту; наёмник — активный) (CU197-C)', () => {
  // Жёлтая = ТОЛЬКО «выбранный/цель» (ТЗ п.3 + 000199 L4):
  // «чей ход» больше не показывает жёлтое кольцо — его роль
  // переняла голубая рамка (CU197-D/E). targetId = null — без
  // подсветки цели (нет коллизии '#ffe27a').
  const S = scene84({ efir: true });
  const u = S.c.units.find((x) => x.kind === 'efir');
  S.c.targetId = null;
  assert.equal(S.c.turnOrder[S.c.turnIndex], 'efir',
    'фикстура: Эфир АКТИВЕН по дефолту (pre-roll 000168 на его слоте): '
    + JSON.stringify(S.c.turnOrder) + ' @' + S.c.turnIndex);
  const ex = u.x * 48, ey = u.y * 48;
  // (а) Активный Эфир: кольца 41×41 на его клетке нет.
  const t1 = tickSlice(S.canvas, S.rafStubs);
  assert.ok(!t1.calls.some((c) => c[0] === 'strokeRect'
    && c[1][0] === ex + 2.5 && c[1][1] === ey + 2.5
    && c[1][2] === 41 && c[1][3] === 41),
    'кольца 41×41 на клетке АКТИВНОГО Эфира НЕТ (жёлтая — только '
    + 'выбранный/цель)');
  assert.equal(t1.styleCalls.filter((s) => s[0] === 'strokeStyle'
    && s[1] === '#ffe27a').length, 0,
    '«#ffe27a» за окно отсутствует (цели нет, кольца нет)');
  // (б) Активный НАЁМНИК (turnIndex → его слот): кольцо отсутствует
  // у любого kind ally (рамка следует за активным — любой союзник).
  const merc = addMerc84(S.c, S.G, 5, 2, 'ranged');
  S.c.turnIndex = S.c.turnOrder.indexOf(merc.id);
  const mx = merc.x * 48, my = merc.y * 48;
  const t2 = tickSlice(S.canvas, S.rafStubs);
  assert.ok(!t2.calls.some((c) => c[0] === 'strokeRect'
    && c[1][0] === mx + 2.5 && c[1][1] === my + 2.5
    && c[1][2] === 41 && c[1][3] === 41),
    'кольца 41×41 на клетке АКТИВНОГО наёмника НЕТ');
  assert.equal(t2.styleCalls.filter((s) => s[0] === 'strokeStyle'
    && s[1] === '#ffe27a').length, 0,
    '«#ffe27a» за окно отсутствует (наёмник активен, цели нет)');
});

test('боевой UI: 000197 — АКТИВНЫЙ Эфир (дефолт): голубая рамка 39×39 + подложка 44×44 на клетке, по одному разу за окно (CU197-D)', () => {
  // Гвард нового условия (зелёный с первого дня: на текущем коде
  // слои рисуются бесусловно; после реализации — только у
  // активного; Эфир в сцене активен → слои на месте): голубая
  // рамка ПОЯВЛЯЕТСЯ, когда персонаж активен (ТЗ п.2).
  const S = scene84({ efir: true }); // без лоадера: фолбэк
  const u = S.c.units.find((x) => x.kind === 'efir');
  S.c.targetId = null;
  assert.equal(S.c.turnOrder[S.c.turnIndex], 'efir',
    'фикстура: Эфир АКТИВЕН (чей ход — голубая рамка)');
  const ex = u.x * 48, ey = u.y * 48;
  const t = tickSlice(S.canvas, S.rafStubs);
  assert.ok(t.calls.some((c) => c[0] === 'fillRect'
    && c[1][0] === ex + 2 && c[1][1] === ey + 2
    && c[1][2] === 44 && c[1][3] === 44),
    'подложка 44×44 на клетке АКТИВНОГО Эфира');
  assert.ok(t.calls.some((c) => c[0] === 'strokeRect'
    && c[1][0] === ex + 4.5 && c[1][1] === ey + 4.5
    && c[1][2] === 39 && c[1][3] === 39),
    'голубая рамка 39×39 на клетке АКТИВНОГО Эфира');
  assert.equal(t.styleCalls.filter((s) => s[0] === 'fillStyle'
    && s[1] === 'rgba(140, 242, 252, 0.25)').length, 1,
    'подложка — ровно один раз (одна союзная клетка)');
  assert.equal(t.styleCalls.filter((s) => s[0] === 'strokeStyle'
    && s[1] === '#8cf2fc').length, 1,
    'голубая рамка — ровно один раз');
});

test('боевой UI: 000197 — наёмник становится активным (turnIndex → его слот): рамка + подложка на его клетке, по одному разу (CU197-E)', () => {
  // Гвард: рамка следует за активным — любой kind ally (наёмник
  // kind 'merc'). Без Эфира: по дефолту активен player, наёмник
  // неактивен (CU197-A); сдвигаем очередь на его слот.
  const S = scene84(); // без Эфира: фолбэк-сцена
  const merc = addMerc84(S.c, S.G, 5, 2, 'ranged');
  S.c.targetId = null;
  S.c.turnIndex = S.c.turnOrder.indexOf(merc.id);
  assert.equal(S.c.turnOrder[S.c.turnIndex], merc.id,
    'фикстура: наёмник АКТИВЕН: ' + JSON.stringify(S.c.turnOrder)
    + ' @' + S.c.turnIndex);
  const ex = merc.x * 48, ey = merc.y * 48;
  const t = tickSlice(S.canvas, S.rafStubs);
  assert.ok(t.calls.some((c) => c[0] === 'fillRect'
    && c[1][0] === ex + 2 && c[1][1] === ey + 2
    && c[1][2] === 44 && c[1][3] === 44),
    'подложка 44×44 на клетке АКТИВНОГО наёмника');
  assert.ok(t.calls.some((c) => c[0] === 'strokeRect'
    && c[1][0] === ex + 4.5 && c[1][1] === ey + 4.5
    && c[1][2] === 39 && c[1][3] === 39),
    'голубая рамка 39×39 на клетке АКТИВНОГО наёмника');
  assert.equal(t.styleCalls.filter((s) => s[0] === 'fillStyle'
    && s[1] === 'rgba(140, 242, 252, 0.25)').length, 1,
    'подложка — ровно один раз');
  assert.equal(t.styleCalls.filter((s) => s[0] === 'strokeStyle'
    && s[1] === '#8cf2fc').length, 1,
    'голубая рамка — ровно один раз');
});

test('боевой UI: 000197 — цель-моб: жёлтая рамка 39×39 #ffe27a на клетке моба СОХРАНЕНА; голубого stroke на клетке моба нет (CU197-F)', () => {
  // Гвард сохранённого поведения (ТЗ п.3: жёлтая = цель): подсветка
  // цели в mob-ветви (u.id === c.targetId → 39×39 '#ffe27a') —
  // бит-в-бит, ветвь не трогается. Цвет — через styledCalls
  // («цвет, действовавший в момент вызова»).
  const S = scene84({ efir: true });
  const wolf = S.c.units.find((x) => x.side === 'mob');
  S.c.targetId = wolf.id; // явная цель (не авто)
  const wx = wolf.x * 48, wy = wolf.y * 48;
  const t = tickSlice(S.canvas, S.rafStubs);
  const styled = styledCalls(t.events);
  const yellowFrame = styled.find((c) => c.name === 'strokeRect'
    && c.args[0] === wx + 4.5 && c.args[1] === wy + 4.5
    && c.args[2] === 39 && c.args[3] === 39
    && c.strokeStyle === '#ffe27a');
  assert.ok(yellowFrame,
    'жёлтая рамка цели 39×39 #ffe27a на клетке моба (ТЗ: жёлтая = '
    + 'цель — сохраняется)');
  const blueOnMob = styled.filter((c) => c.name === 'strokeRect'
    && c.strokeStyle === '#8cf2fc'
    && c.args[0] >= wx && c.args[0] < wx + 48
    && c.args[1] >= wy && c.args[1] < wy + 48);
  assert.equal(blueOnMob.length, 0,
    'голубого stroke #8cf2fc на клетке моба нет (голубая — только '
    + 'у активного союзника; моб — не союзник)');
});

test('боевой UI: 000197/000213 — активный player: на клетке героя голубая рамка 39×39 ровно 1 (ре-пин 000213); кольца 41×41 нет (CU197-G)', () => {
  // СЕМАНТИЧЕСКИЙ ре-пин 000213 (санкционирован ТЗ; прецедент —
  // 000197 §3): «герой вне скоупа» — УСТАРЕЛО для состояния «его
  // ход»: у героя теперь РАМКА 39×39 на его слоте в очереди
  // (контракт memory/000213-hero-turn-frame.md; вытесняет 000197
  // §2/§4). Кольцо 41×41 по-прежнему НИГДЕ (000199 L4: «чей ход»
  // показывает голубая рамка; «сходит игрок» — DOM-токен ряда
  // очереди, 000167). Сцена без Эфира: активен player (дефолт).
  const S = scene84(); // без Эфира
  S.c.targetId = null;
  assert.equal(S.c.turnOrder[S.c.turnIndex], 'player',
    'фикстура: активен player (его ход)');
  const hx = S.c.px * 48, hy = S.c.py * 48;
  const t = tickSlice(S.canvas, S.rafStubs);
  assert.equal(t.calls.filter((c) => c[0] === 'strokeRect'
    && c[1][0] === hx + 4.5 && c[1][1] === hy + 4.5
    && c[1][2] === 39 && c[1][3] === 39).length, 1,
    'на клетке героя голубая рамка 39×39 ровно 1 (000213: его ход = рамка)');
  assert.ok(!t.calls.some((c) => c[0] === 'strokeRect'
    && c[1][0] === hx + 2.5 && c[1][1] === hy + 2.5
    && c[1][2] === 41 && c[1][3] === 41),
    'кольца 41×41 на клетке героя НЕТ (000199 L4: «чей ход» — рамка)');
});

// Задача 000198. БОЙ: BUG — выбор цели для удара/заклинания у
// NPC-союзников и Эфира. КРАСНЫЕ тесты UI-слоя (vm) — дополняют
// ядро (tests/combat.test.js, блок «Задача 000198»): UI-клик —
// ЕДИНСТВЕННЫЙ путь выбора цели в бою (кнопок/клавиш выбора цели
// НЕТ), выбор бесплатен (лог не растёт), HUD-строка «Цель:»,
// жёлтая рамка #ffe27a и штриховка 000175 — следуют за c.targetId
// (0 правок UI). Паттерны — 000084/000168-UI-1/000175 (scene84/
// tickSlice/styledCalls/hatchTiles175/addMerc84).
//
// Корень: c.selectTarget — D6-гварда «только игрок» (master
// 7875568, L3078-3081): клик по мобо на ходу наёмника/Эфира
// возвращает null → c.targetId НЕ меняется → действия бьют
// nearestEnemy. Контракты — memory/000198-ally-target-select.md
// (D3/D5/D6) и memory/000198-combat-target-selection.md.
//
// Сцена: scene84 + волк m0 (иниц. 3) + гигантский паук m1 (иниц. 4).
// Наёмник (addMerc84 — push в конец очереди) — слот после Space
// (паттерн 000168-UI-1a). Эфир — pre-roll сам остановился на его
// слоте (паттерн 000168-UI-2b). c.player.hp = 9999 — pre-roll-
// атаки мобы не убивают героя. Whitebox: союзник (3,5), m0 (3,4)
// — d 1, m1 — (4,5) d 1 / (1,3) d 4. Краснота — поведенческая:
// targetId не сместился после клика; лог-строка — с ЧУЖИМ мобом
// (nearestEnemy), а не с выбранным.
// =====================================================================

test('боевой UI: 000198-UI-1 — клик по ЧУЖОМУ мобу на ходу наёмника: c.targetId сместился, лог не вырос (выбор — не действие), HUD «Цель:», жёлтая рамка 39×39 и штриховка 000175 — за выбранной', () => {
  const S = scene84({ spells: true, mobs: ['wolf', 'spider'] });
  const { G, c, canvas, rafStubs, body, keydown } = S;
  c.player.hp = 9999; // pre-roll-фазы не убивают героя
  addMerc84(c, G, 3, 5, 'melee', 'Вольк');
  const a = c.units.find((u) => u.id === 'a1');
  const m0 = c.units.find((u) => u.id === 'm0'); // волк
  const m1 = c.units.find((u) => u.id === 'm1'); // гигантский паук
  press(keydown, 'Space'); tickSlice(canvas, rafStubs);
  assert.equal(G.activeUnitId(c), 'a1',
    'слот наёмника (очередь: мобы → игрок → a1): '
    + G.activeUnitId(c));
  a.x = 3; a.y = 5;
  m0.x = 3; m0.y = 4; m0.maxHP = 100; m0.hp = 100; // d 1
  m1.x = 4; m1.y = 5; m1.maxHP = 100; m1.hp = 100; // d 1
  c.targetId = m0.id; // детерминированный дефолт (auto-приоритет)
  tickSlice(canvas, rafStubs);
  const n0 = c.log.length;
  // (1) Клик по клетке ЧУЖОГО живого моба — c.targetId сместился
  //     (краснота: D6-гварда selectTarget → null → targetId = m0).
  canvas.listeners.click[0]({
    clientX: (m1.x + 0.5) * 48, clientY: (m1.y + 0.5) * 48,
  });
  assert.equal(c.targetId, m1.id,
    'клик по мобо на ходу наёмника — c.targetId = паук (краснота: '
    + c.targetId + ' — selectTarget вернул null, D6 «только игрок»)');
  assert.equal(c.log.length, n0,
    'выбор цели — не действие: лог не вырос');
  // Один тик — рендер ПОСЛЕ клика (stateEl/рамка/штриховка — в нём).
  const t1 = tickSlice(canvas, rafStubs);
  // (2) HUD-строка «Цель:» — за выбранной целью (контракт 000166).
  const state = findByClass(body, 'combat-state');
  assert.ok(
    state.textContent.includes('Цель: Гигантский паук (ур. 1, HP 100/100)'),
    'HUD: «Цель: Гигантский паук (ур. 1, HP 100/100)» (краснота: '
    + JSON.stringify(state.textContent) + ')');
  // (3) Жёлтая рамка цели (strokeStyle #ffe27a, strokeRect 39×39,
  //     +4.5) — на клетке ВЫБРАННОЙ цели и НЕ на прежней.
  const sc1 = styledCalls(t1.events);
  const ringAt = (x, y) => sc1.some((e) =>
    e.name === 'strokeRect' && e.strokeStyle === '#ffe27a'
    && e.args[0] === x * 48 + 4.5 && e.args[1] === y * 48 + 4.5
    && e.args[2] === 39 && e.args[3] === 39);
  assert.ok(ringAt(m1.x, m1.y),
    'жёлтая рамка — на клетке выбранной цели (паук)');
  assert.ok(!ringAt(m0.x, m0.y),
    'рамки НЕТ на прежней цели (волк)');
  // (4) Штриховка дальности 000175 — за c.targetId (набор == ядро).
  assert.deepEqual(
    hatchTiles175(t1).sort(), [...G.mobReachCells(c, m1)].sort(),
    'штриховка — клетки в радиусе ВЫБРАННОЙ цели (000175)');
  // (5) Негатив: клик по СВОЕМУ союзнику — отказ, targetId
  //     не сместился, лог не вырос.
  canvas.listeners.click[0]({
    clientX: (a.x + 0.5) * 48, clientY: (a.y + 0.5) * 48,
  });
  assert.equal(c.targetId, m1.id,
    'клик по своему союзнику — targetId не сместился');
  assert.equal(c.log.length, n0, 'тихий отказ: лог не вырос');
});

test('боевой UI: 000198-UI-2 — e2e наёмник: клик по пауку + KeyJ — удар в ВЫБРАННЫЙ моб (log «Вольк бьёт Гигантский паук: 3.»), c.ps не тронут, пул союзника 1→0', () => {
  const S = scene84({ spells: true, mobs: ['wolf', 'spider'] });
  const { G, c, canvas, rafStubs, keydown } = S;
  c.player.hp = 9999;
  c._rng = () => 0.01; // попадание (бросок allyAttack)
  addMerc84(c, G, 3, 5, 'melee', 'Вольк');
  const a = c.units.find((u) => u.id === 'a1');
  const m0 = c.units.find((u) => u.id === 'm0');
  const m1 = c.units.find((u) => u.id === 'm1');
  press(keydown, 'Space'); tickSlice(canvas, rafStubs);
  assert.equal(G.activeUnitId(c), 'a1',
    'слот наёмника: ' + G.activeUnitId(c));
  a.x = 3; a.y = 5;
  m0.x = 3; m0.y = 4; m0.maxHP = 100; m0.hp = 100; // d 1
  m1.x = 4; m1.y = 5; m1.maxHP = 100; m1.hp = 100; // d 1
  c.targetId = m0.id; // детерминированный дефолт
  // Клик по пауку — выбор цели (краснота: targetId не сместится).
  canvas.listeners.click[0]({
    clientX: (m1.x + 0.5) * 48, clientY: (m1.y + 0.5) * 48,
  });
  assert.equal(c.targetId, m1.id, 'клик — c.targetId = паук');
  const ps0 = c.ps.attack;
  const n0 = c.log.length;
  // KeyJ — «Удар» — по ВЫБРАННОЙ цели.
  press(keydown, 'KeyJ'); tickSlice(canvas, rafStubs);
  assert.deepEqual(Array.from(c.log).slice(n0),
    ['Вольк бьёт Гигантский паук: 3.'],
    'лог: удар по ВЫБРАННОМУ пауку (краснота: «Вольк бьёт Волк: 3.» — '
    + 'nearestEnemy игнорирует c.targetId): '
    + JSON.stringify(c.log.slice(n0)));
  assert.equal(m1.hp, 97, 'паук −3 (dmg Вольк 2 ур.) (краснота: 100)');
  assert.equal(m0.hp, 100, 'волк не задет (краснота: 97)');
  assert.equal(a.attackLeft, 0, 'пул союзника 1→0 (000168 P1)');
  assert.equal(c.ps.attack, ps0, 'c.ps.attack — не тронут (000168 P1)');
  assert.equal(G.activeUnitId(c), 'a1', 'слот не завершился (шаги > 0)');
  const can = G.canDoAction(c, 'attack');
  assert.ok(can.ok === false, 'второй Удар невозможен');
  assert.equal(can.reason, 'действий «Удар» больше нет',
    'причина дословно (краснота: ' + can.reason + ')');
});

test('боевой UI: 000198-UI-3 — e2e Эфир: клик по пауку (d 4) + KeyK — «Искра» в ВЫБРАННЫЙ моб (0 c._rng, мана 11→8, spellInt 0); волк (d 1) не задет', () => {
  const S = scene84({ efir: true, spells: true, mobs: ['wolf', 'spider'] });
  const { G, c, canvas, rafStubs, keydown } = S;
  c.player.hp = 9999;
  const u = c.units.find((x) => x.id === 'efir');
  const m0 = c.units.find((x) => x.id === 'm0'); // волк
  const m1 = c.units.find((x) => x.id === 'm1'); // гигантский паук
  assert.equal(G.activeUnitId(c), 'efir',
    'pre-roll остановился на слоте Эфира (краснота: '
    + G.activeUnitId(c) + ')');
  u.x = 3; u.y = 5;
  m0.x = 3; m0.y = 4; m0.maxHP = 100; m0.hp = 100; // d 1
  m1.x = 1; m1.y = 3; m1.maxHP = 100; m1.hp = 100; // d 4
  c.targetId = m0.id; // детерминированный дефолт
  tickSlice(canvas, rafStubs);
  // Клик по клетке паука — выбор цели (краснота: D6-гварда → null →
  // targetId остаётся m0).
  canvas.listeners.click[0]({ clientX: 72, clientY: 168 }); // (1.5·48, 3.5·48)
  assert.equal(c.targetId, m1.id,
    'клик по пауку на ходу Эфира — c.targetId = паук (краснота: '
    + c.targetId + ' — selectTarget вернул null)');
  let rngCalls = 0;
  const realRng = c._rng;
  c._rng = () => (rngCalls += 1, realRng());
  const n0 = c.log.length;
  // KeyK — каст (сильнейшее известное — «Искра») — по ВЫБРАННОЙ цели.
  press(keydown, 'KeyK'); tickSlice(canvas, rafStubs);
  assert.deepEqual(Array.from(c.log).slice(n0),
    ['Эфир: «Искра» — Гигантский паук: 6.'],
    'лог: «Искра» в ВЫБРАННЫЙ паук (краснота: «— Волк: 6.» — '
    + 'nearestEnemy): ' + JSON.stringify(c.log.slice(n0)));
  assert.equal(m1.hp, 94, 'паук −6 (формула 000193; краснота: 100)');
  assert.equal(m0.hp, 100, 'волк не задет (краснота: 95)');
  assert.equal(c.efs.spellInt, 0, 'spellInt 1→0');
  assert.equal(u.mp, 8, 'мана 11→8 (Искра: 3 маны)');
  assert.equal(rngCalls, 0, '0 c._rng (детерминированный каст)');
  assert.equal(G.activeUnitId(c), 'efir', 'слот не завершился (шаги 3)');
});

// =====================================================================
// Задача 000199. БОЙ: компактный верхний инфоблок справа (2 фикс.
// строки, полоска MP, счётчики действий на кнопках «Удар»/«Книга
// заклинаний»). ТЗ — tasks/pending/000199.md; контракт —
// memory/000199-combat-info-block.md (решения D1–D7), компакт —
// memory/000199-combat-hud-compact.md; план тестов — a3.
//
// КРАСНЫЕ тесты (TDD, этот коммит): 8 vm (CU199-*). Каждый падает на
// ТЕКУЩЕМ (неизменённом) коде — осмысленная краснота «функциональность
// ТЗ ещё не существует»:
//   * stateEl рендерится 5–7 строками («Ход:»/«HP x|MP y»/
//     «Шаги|Удар|Огонь|Леч»/строка активного союзника/«Отряд:»/
//     «БЛОК|ЯД» — render() combat-ui.js L1474–1504): 2-строчного
//     формата нет;
//   * .combat-mpbar — элемента нет в build() (L281–293: очередь →
//     hpbar → state) и CSS-правил нет в index.html;
//   * .combat-actcount — счётчик-бейджей на кнопках нет (у каждой
//     кнопки ровно 1 img-ребёнок, textContent '');
//   * DOM-полоса HP всегда несёт значения ИГРОКА (p.hp/d.maxHP —
//     render() L1513–1518), а не активного персонажа.
// Семантические ре-пины существующих тестов (CU118-HUD, 000168-UI-1,
// CU180-EFIR-ROW, 000124-кнопки L1168) — на ЗЕЛЁНОЙ стадии ВМЕСТЕ с
// кодом (ТЗ явно меняет вывод HUD — инвариант «существенных правок
// нет» здесь отменён ТЗ).
//
// Фикстуры (проверено прогоном на master 7875568, 2026-10-12):
//   * дефолт scene84(): герой 25/25, MP 16/16 (G.derived); волк (m0)
//     4/4 ур. 1, c.targetId='m0' (автоцель); c.ps {moveLeft:3,
//     attack:1, spellInt:1, spellWis:1, …}; activeUnitId='player';
//     stateEl — 5 строк (Ход: Вы / группа, раунд 1 / HP|MP /
//     Шаги…|Удар…|Огонь…|Леч… / Цель: Волк (ур. 1, HP 4/4)).
//   * addMerc84('Вольк', melee) + Space — очередь остановилась на
//     'a1'; Вольк 16/16, moveLeft/attackLeft = 1 (ур. 2).
//   * scene84({efir:true}) — pre-roll стоп на 'efir' (инициатива 4):
//     Эфир 16/16, mp 11 (u.maxMP = 11 — снапшот stats.maxMP в
//     buildEfirUnit; L1: = efirStats(1).maxMP), c.efs
//     {spellInt:1, spellWis:1, touch:1, move:3}.
//   * DOM-стаб: у элементов НЕТ querySelector (только
//     overlay.querySelectorAll); textContent кнопки НЕ
//     пересчитывается из children (ловушка, тесты/spellbook.test.js
//     L27) — бейдж читается как child .combat-actcount (контракт
//     «Подводные камни» 1/2).
// =====================================================================

// 000199: бейдж счётчика действий — ПЕРСИСТЕНТНЫЙ child кнопки
// (создаётся build() один раз, как кнопки — урок 000149; render
// обновляет только textContent/display).
const badgeOf199 = (b) =>
  b.children.find((ch) => ch.className === 'combat-actcount');

// 000199: контракт фикс. 2 строк stateEl — строка 1 =
// «<groupName>, раунд N»; строка 2 = строка цели (побайтово, без
// правок — т/td/tHero/«Цели нет»).
const checkState199 = (S, label) => {
  const text = findByClass(S.body, 'combat-state').textContent;
  const lines = text.split('\n');
  assert.equal(lines.length, 2,
    '000199 ' + label + ': ровно ДВЕ строки, '
    + 'факт: ' + JSON.stringify(text));
  assert.equal(lines[0],
    S.c.groupName + ', раунд ' + S.c.round,
    '000199 ' + label + ': строка 1 — «<groupName>, раунд N», '
    + 'факт: ' + JSON.stringify(lines[0]));
};

test('боевой UI: 000199 — stateEl: ровно ДВЕ строки «<groupName>, раунд N» + строка цели (побайтово в дефолтной сцене) (CU199-STATE-1)', () => {
  const S = scene84();
  const t = S.c.units.find((u) => u.id === S.c.targetId && u.alive
    && !u.fled);
  assert.ok(t, 'фикстура: автоцель (волк) жива');
  const expected = S.c.groupName + ', раунд ' + S.c.round
    + '\nЦель: ' + t.name + ' (ур. ' + t.level + ', HP '
    + t.hp + '/' + t.maxHP + ')';
  const state = findByClass(S.body, 'combat-state');
  assert.equal(state.textContent, expected,
    'stateEl побайтово = ровно 2 строки (краснота: render() '
    + 'combat-ui.js L1494–1504 собирает 5 строк «Ход:/HP|MP/Шаги…»): '
    + JSON.stringify(state.textContent));
  assert.equal(state.textContent.split('\n').length, 2,
    'число строк фиксированное = 2: '
    + JSON.stringify(state.textContent));
});

test('боевой UI: 000199 — stateEl: нет «Ход:», «Отряд:», «HP x/y | MP x/y», «Шаги:|Удар:|Огонь:|Леч:», строки активного союзника, «БЛОК»/«ЯД» (CU199-STATE-2)', () => {
  // Сцена: Вольк + Space (ход наёмника) + white-box blocked/poison —
  // в ТЕКУЩЕМ render ВСЕ запрещённые строки присутствуют (краснота
  // осмысленна по каждому ассерту).
  const S = scene84();
  addMerc84(S.c, S.G, 3, 5, 'melee', 'Вольк');
  const w = S.c.units.find((x) => x.id === 'm0');
  w.x = 3; w.y = 4;
  press(S.keydown, 'Space');
  tickSlice(S.canvas, S.rafStubs);
  assert.equal(S.G.activeUnitId(S.c), 'a1',
    'фикстура: очередь остановилась на наёмнике');
  S.c.ps.blocked = true;
  S.c.ps.poison = 2;
  tickSlice(S.canvas, S.rafStubs);
  const text = findByClass(S.body, 'combat-state').textContent;
  assert.ok(!text.includes('Ход:'),
    'нет строки «Ход:» (чей ход — рамка 000197), факт: '
    + JSON.stringify(text));
  assert.ok(!text.includes('Отряд:'),
    'нет строки «Отряд:» (состав не дублируется), факт: '
    + JSON.stringify(text));
  assert.ok(!/HP \d+\/\d+  \|  MP \d+\/\d+/.test(text),
    'нет строки «HP x/y | MP x/y» (значения — на полосках), факт: '
    + JSON.stringify(text));
  assert.ok(!/Шаги: \d+/.test(text),
    'нет «Шаги:» (счётчик шагов НЕ выводится — D4), факт: '
    + JSON.stringify(text));
  assert.ok(!/Удар: \d+/.test(text),
    'нет «Удар:» (счётчик — на кнопке «Удар»), факт: '
    + JSON.stringify(text));
  assert.ok(!/Огонь: \d+/.test(text),
    'нет «Огонь:» (счётчик — на кнопке «Книга заклинаний»), факт: '
    + JSON.stringify(text));
  assert.ok(!/Леч: \d+/.test(text),
    'нет «Леч:» (счётчик — на кнопке «Книга заклинаний»), факт: '
    + JSON.stringify(text));
  assert.ok(!/Вольк: HP/.test(text),
    'нет строки активного союзника (инфо — на полосках), факт: '
    + JSON.stringify(text));
  assert.ok(!text.includes('БЛОК'),
    'нет префикса «БЛОК» (D1: статус — title кнопки/журнал), факт: '
    + JSON.stringify(text));
  assert.ok(!text.includes('ЯД'),
    'нет префикса «ЯД» (D1: статус — журнал), факт: '
    + JSON.stringify(text));
});

test('боевой UI: 000199 — stateEl: ФИКСИРОВАННО ровно 2 строки во всех состояниях (с целью / без цели / БЛОК / ЯД / отряд / фаза мобов) (CU199-FIXED-2)', () => {
  // (a) без цели — «Цели нет» (безусловная 2-я строка).
  {
    const S = scene84();
    S.c.targetId = null;
    tickSlice(S.canvas, S.rafStubs);
    assert.ok(findByClass(S.body, 'combat-state').textContent
      .includes('Цели нет'), 'фикстура: «Цели нет»');
    checkState199(S, 'без цели');
  }
  // (b) с целью (дефолт).
  {
    const S = scene84();
    tickSlice(S.canvas, S.rafStubs);
    checkState199(S, 'с целью');
  }
  // (c) БЛОК (c.ps.blocked).
  {
    const S = scene84();
    S.c.ps.blocked = true;
    tickSlice(S.canvas, S.rafStubs);
    checkState199(S, 'БЛОК');
  }
  // (d) ЯД (c.ps.poison).
  {
    const S = scene84();
    S.c.ps.poison = 2;
    tickSlice(S.canvas, S.rafStubs);
    checkState199(S, 'ЯД');
  }
  // (e) отряд (Эфир + наёмник).
  {
    const S = scene84({ efir: true });
    addMerc84(S.c, S.G, 5, 2, 'ranged');
    tickSlice(S.canvas, S.rafStubs);
    checkState199(S, 'отряд (эфир + наёмник)');
  }
  // (f) фаза мобов (white-box: turnIndex → m0, phase 'mob') —
  // активных союзников нет: 2 строки те же.
  {
    const S = scene84();
    S.c.turnIndex = S.c.turnOrder.indexOf('m0');
    S.c.phase = 'mob';
    tickSlice(S.canvas, S.rafStubs);
    assert.equal(S.G.activeUnitId(S.c), 'm0', 'фикстура: фаза мобов');
    checkState199(S, 'фаза мобов');
  }
});

test('боевой UI: 000199 — полоса HP: на ходу СОЮЗНИКА показывает HP активного союзника (не игрока) (CU199-HPBAR-ALIAS)', () => {
  // (a) Наёмник: игрок РАНЕН (7/25 — frac 0.28), но полоса несёт
  //     значения активного Волька (16/16).
  {
    const S = scene84();
    S.c.player.hp = 7;
    addMerc84(S.c, S.G, 3, 5, 'melee', 'Вольк');
    const w = S.c.units.find((x) => x.id === 'm0');
    w.x = 3; w.y = 4;
    press(S.keydown, 'Space');
    tickSlice(S.canvas, S.rafStubs);
    assert.equal(S.G.activeUnitId(S.c), 'a1', 'фикстура: активен наёмник');
    const merc = S.c.units.find((x) => x.id === 'a1');
    const text = findByClass(S.body, 'combat-hpbar-text').textContent;
    assert.equal(text, 'HP ' + merc.hp + '/' + merc.maxHP,
      'на ходу союзника полоса несёт союзника (краснота: render() '
      + 'combat-ui.js L1513–1518 ВСЕГДА пишет игрока p.hp/d.maxHP '
      + '— «HP 7/25»): факт ' + JSON.stringify(text));
    const fill = findByClass(S.body, 'combat-hpbar-fill');
    assert.equal(fill.style.width, '100.0%',
      'fill — доля HP союзника (16/16 = 100.0%), факт: '
      + JSON.stringify(fill.style.width));
  }
  // (b) Эфир: pre-roll стоп на 'efir' — полоса несёт Эфира.
  {
    const S = scene84({ efir: true });
    tickSlice(S.canvas, S.rafStubs);
    assert.equal(S.G.activeUnitId(S.c), 'efir', 'фикстура: активен Эфир');
    const u = S.c.units.find((x) => x.id === 'efir');
    const text = findByClass(S.body, 'combat-hpbar-text').textContent;
    assert.equal(text, 'HP ' + u.hp + '/' + u.maxHP,
      'на ходу Эфира полоса несёт Эфира (краснота: игрок 25/25): '
      + 'факт ' + JSON.stringify(text));
  }
});

test('боевой UI: 000199 — полоска MP (.combat-mpbar) ПОД полосой HP: на ходу игрока — «MP x/y» (CU199-MPBAR-1)', () => {
  const S = scene84();
  assert.equal(S.G.activeUnitId(S.c), 'player', 'фикстура: ход игрока');
  const mpbar = findByClass(S.body, 'combat-mpbar');
  assert.ok(mpbar,
    '000199: .combat-mpbar создана в оверлее (краснота: build() '
    + 'combat-ui.js L281–293 строит только hpbar — полоски MP нет)');
  const mpfill = findByClass(S.body, 'combat-mpbar-fill');
  const mptext = findByClass(S.body, 'combat-mpbar-text');
  assert.ok(mpfill && mptext,
    '000199: .combat-mpbar-fill/-text созданы');
  // Позиция: ТРЕТИЙ элемент .combat-side — сразу ПОСЛЕ .combat-hpbar,
  // ПЕРЕД .combat-state.
  const side = findByClass(S.body, 'combat-side');
  assert.deepEqual(side.children.map((ch) => ch.className),
    ['combat-turnorder', 'combat-hpbar', 'combat-mpbar', 'combat-state',
      'combat-actions', 'combat-log'],
    '000199: порядок .combat-side — mpbar третьим (краснота: 5 '
    + 'элементов без mpbar; книга — теперь в .combat-box (000196)): '
    + JSON.stringify(side.children.map((ch) => ch.className)));
  // Дефолт: игрок MP 16/16.
  const d = S.G.derived(S.c.player);
  assert.equal(mpfill.style.width, '100.0%',
    '000199: fill = доля MP (16/16 = 100.0%)');
  assert.equal(mptext.textContent, 'MP ' + S.c.player.mp + '/' + d.maxMP,
    '000199: текст «MP x/y» (игрок 16/16)');
  // Re-render после смены MP: 8/16 = 50.0% (render() — единственный
  // путь обновления, контракт 000038/000047).
  S.c.player.mp = 8;
  tickSlice(S.canvas, S.rafStubs);
  assert.equal(mpfill.style.width, '50.0%',
    '000199: fill обновляется в render (8/16 = 50.0%)');
  assert.equal(mptext.textContent, 'MP ' + S.c.player.mp + '/' + d.maxMP,
    '000199: текст обновляется в render («MP 8/16»)');
});

test('боевой UI: 000199/000193.01 — полоска MP: на ходу Эфира — мана Эфира; на ходу наёмника — мана МОДЕЛИ («MP 5/5», fill 100.0%) (CU199-MPBAR-ALIAS)', () => {
  // (a) Эфир: u.mp = 11, u.maxMP = 11 (снапшот stats.maxMP в
  //     buildEfirUnit; L1-дефолт: Sheet 5+Int+Wis = legacy-таблица —
  //     знаменатель полоски — С ЮНИТА, ревью 000199).
  {
    const S = scene84({ efir: true });
    tickSlice(S.canvas, S.rafStubs);
    assert.equal(S.G.activeUnitId(S.c), 'efir', 'фикстура: активен Эфир');
    const u = S.c.units.find((x) => x.id === 'efir');
    assert.equal(u.maxMP, S.G.efir.efirStats(u.level).maxMP,
      'фикстура: L1-дефолт — снапшот u.maxMP = legacy-значению (11)');
    const mptext = findByClass(S.body, 'combat-mpbar-text');
    assert.ok(mptext,
      '000199: .combat-mpbar-text есть (краснота: полоски MP нет)');
    assert.equal(mptext.textContent, 'MP ' + u.mp + '/' + u.maxMP,
      'на ходу Эфира — мана Эфира («MP 11/11», u.mp/u.maxMP): факт '
      + JSON.stringify(mptext && mptext.textContent));
  }
  // (b) Наёмник: модель ДАЁТ ману (000193: mp = 5+Int+Wis) и HUD её
  //     ПОКАЗЫВАЕТ (000193.01: D5 000199 — Superseded: полоса несёт
  //     u.mp/u.maxMP наёмника; снапшот makeAlly = стартовому mp;
  //     юнит без поля maxMP — деградация «MP —»/0%).
  {
    const S = scene84();
    const merc = addMerc84(S.c, S.G, 3, 5, 'melee', 'Вольк');
    const w = S.c.units.find((x) => x.id === 'm0');
    w.x = 3; w.y = 4;
    press(S.keydown, 'Space');
    tickSlice(S.canvas, S.rafStubs);
    assert.equal(S.G.activeUnitId(S.c), 'a1', 'фикстура: активен наёмник');
    assert.equal(merc.mp, 5,
      'фикстура: 000193 — у наёмника в модели мана 5 (5+Int+Wis, '
      + 'attrs {} у addMerc84)');
    assert.equal(merc.maxMP, 5,
      'фикстура: 000193.01 — снапшот maxMP = стартовому mp (5): факт '
      + JSON.stringify(merc.maxMP));
    const mpfill = findByClass(S.body, 'combat-mpbar-fill');
    const mptext = findByClass(S.body, 'combat-mpbar-text');
    assert.ok(mpfill && mptext,
      '000199: полоска MP есть на ходу наёмника (трек — фикс. '
      + 'геометрия)');
    assert.equal(mpfill.style.width, '100.0%',
      '000193.01: fill наёмника = 100.0% (u.mp/u.maxMP 5/5): факт '
      + JSON.stringify(mpfill && mpfill.style.width));
    assert.equal(mptext.textContent, 'MP 5/5',
      '000193.01: текст наёмника «MP 5/5» (D5 000199 — Superseded): факт '
      + JSON.stringify(mptext && mptext.textContent));
  }
});

test('боевой UI: 000199 — полоска MP Эфира: знаменатель — снапшот Sheet (u.maxMP = 5+Int+Wis), не legacy-таблица efirStats(level) (CU199-MPBAR-SHEET)', () => {
  // Выращенный лист ДО БОЯ (снапшот снимает buildEfirUnit): L1 +
  // 2 очка (white-box ef.points, без level-up — уровень остаётся 1)
  // → Int 4, Wis 4 → stats.maxMP = 5+4+4 = 13 (Sheet-истина, 000144:
  // primary растёт ОЧКАМИ). Legacy-таблица efirStats(1).maxMP = 11 —
  // на старом коде полоска вела «MP 13/11» (знач. > знаменателя).
  const rafStubs = makeRafStubs();
  const { G, body } = loadCombatUi(true, {
    withEfir: true,
    performance: { now: () => NOW84 },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  });
  const ef = G.efir.createEfir();
  ef.points = 2; // white-box: очки без level-up (уровень 1)
  assert.equal(G.Sheet.raiseSkill(ef, 'intelligence').ok, true,
    'очко → Интеллект');
  assert.equal(G.Sheet.raiseSkill(ef, 'wisdom').ok, true,
    'очко → Мудрость');
  assert.equal(ef.primary.intelligence, 4, 'фикстура: Int 3→4');
  assert.equal(ef.primary.wisdom, 4, 'фикстура: Wis 3→4');
  const hero = G.createCharacter();
  const c = G.combatUI.startCombat({
    hero, mobs: ['wolf'], mobLevel: 1, seed: 42, efir: ef,
  });
  tickSlice(findCanvas(body), rafStubs);
  assert.equal(G.activeUnitId(c), 'efir', 'фикстура: активен Эфир');
  const u = c.units.find((x) => x.id === 'efir');
  assert.equal(u.maxMP, 13,
    'снапшот: u.maxMP = 5+Int+Wis = 13 (Sheet-истина): факт '
    + JSON.stringify(u.maxMP));
  assert.equal(G.efir.efirStats(u.level).maxMP, 11,
    'контраст: legacy-таблица L1 = 11 (НЕ источник полоски)');
  assert.equal(u.mp, 13, 'u.mp = stats.maxMP = 13');
  const mpfill = findByClass(body, 'combat-mpbar-fill');
  const mptext = findByClass(body, 'combat-mpbar-text');
  assert.ok(mpfill && mptext, '000199: полоска MP есть');
  assert.equal(mpfill.style.width, '100.0%',
    'fill = 13/13 = 100.0%: факт '
    + JSON.stringify(mpfill.style.width));
  assert.equal(mptext.textContent, 'MP 13/13',
    'знаменатель — u.maxMP (13), не efirStats(1).maxMP (11); на '
    + 'legacy-коде было «MP 13/11»: факт '
    + JSON.stringify(mptext.textContent));
});

test('боевой UI: 000199 — кнопка «Удар»: счётчик действий (c.ps.attack / u.attackLeft / c.efs.touch), ВСЕГДА видим включая 0 (CU199-BTN-ATK)', () => {
  // (a) Дефолт (ход игрока): c.ps.attack = 1 → «1».
  {
    const S = scene84();
    assert.equal(S.G.activeUnitId(S.c), 'player', 'фикстура: ход игрока');
    const byAct = {};
    for (const b of S.body.querySelectorAll('.combat-actions button'))
      byAct[b.dataset.act] = b;
    const badge = badgeOf199(byAct.attack);
    assert.ok(badge,
      '000199: бейдж .combat-actcount есть на кнопке «Удар» '
      + '(краснота: children кнопки = ровно 1 иконка, счётчика нет)');
    assert.equal(badge.textContent, String(S.c.ps.attack),
      'счётчик = c.ps.attack («1»)');
    // White-box: пул ударов исчерпан → «0» (видим всегда — D3).
    S.c.ps.attack = 0;
    tickSlice(S.canvas, S.rafStubs);
    assert.equal(badge.textContent, '0',
      'счётчик обновляется в render: пул 0 → «0»');
  }
  // (b) Ход наёмника: u.attackLeft.
  {
    const S = scene84();
    const merc = addMerc84(S.c, S.G, 3, 5, 'melee', 'Вольк');
    const w = S.c.units.find((x) => x.id === 'm0');
    w.x = 3; w.y = 4;
    press(S.keydown, 'Space');
    tickSlice(S.canvas, S.rafStubs);
    assert.equal(S.G.activeUnitId(S.c), 'a1', 'фикстура: активен наёмник');
    const badge = badgeOf199(
      S.body.querySelectorAll('.combat-actions button')
        .find((b) => b.dataset.act === 'attack'));
    assert.ok(badge, '000199: бейдж есть на ходу наёмника');
    assert.equal(badge.textContent, String(merc.attackLeft),
      'счётчик = u.attackLeft наёмника');
  }
  // (c) Ход Эфира: c.efs.touch; c.efs=null → «0» (null-guard,
  //     re-render не крашится).
  {
    const S = scene84({ efir: true });
    tickSlice(S.canvas, S.rafStubs);
    assert.equal(S.G.activeUnitId(S.c), 'efir', 'фикстура: активен Эфир');
    const badge = badgeOf199(
      S.body.querySelectorAll('.combat-actions button')
        .find((b) => b.dataset.act === 'attack'));
    assert.ok(badge, '000199: бейдж есть на ходу Эфира');
    assert.equal(badge.textContent, String(S.c.efs.touch),
      'счётчик = c.efs.touch («1»)');
    S.c.efs = null;
    tickSlice(S.canvas, S.rafStubs); // re-render без c.efs — краха нет
    assert.equal(badge.textContent, '0',
      'c.efs=null → «0» (null-guard)');
  }
});

test('боевой UI: 000199 — кнопка «Книга заклинаний»: счётчик «int/wis»; скрыт на ходу союзника; БЕЗ бейджа на прочих кнопках (CU199-BTN-BOOK)', () => {
  // (a) Дефолт (ход игрока): «int/wis» — Огонь/Леч, порядок как в
  //     убранной строке (D2).
  {
    const S = scene84();
    assert.equal(S.G.activeUnitId(S.c), 'player', 'фикстура: ход игрока');
    const bookBtn = S.body.querySelectorAll('.combat-actions button')
      .find((b) => b.dataset.act === 'spellbook');
    const badge = badgeOf199(bookBtn);
    assert.ok(badge,
      '000199: бейдж .combat-actcount есть на «Книге заклинаний» '
      + '(краснота: счётчика нет)');
    assert.equal(badge.textContent,
      S.c.ps.spellInt + '/' + S.c.ps.spellWis,
      'счётчик = «int/wis» («1/1»)');
    // White-box: пул Огня исчерпан → «0/1».
    S.c.ps.spellInt = 0;
    tickSlice(S.canvas, S.rafStubs);
    assert.equal(badge.textContent,
      S.c.ps.spellInt + '/' + S.c.ps.spellWis,
      'счётчик обновляется в render: «0/1»');
  }
  // (b) Ход СОЮЗНИКА (Вольк): книга структурно недоступна
  //     (allyCanDo 'spellbook') — бейдж СКРЫТ (display none, text
  //     ''; «0» отклонено — смешивает «нет пула» с «недоступно»).
  {
    const S = scene84();
    addMerc84(S.c, S.G, 3, 5, 'melee', 'Вольк');
    const w = S.c.units.find((x) => x.id === 'm0');
    w.x = 3; w.y = 4;
    press(S.keydown, 'Space');
    tickSlice(S.canvas, S.rafStubs);
    assert.equal(S.G.activeUnitId(S.c), 'a1', 'фикстура: активен наёмник');
    const badge = badgeOf199(
      S.body.querySelectorAll('.combat-actions button')
        .find((b) => b.dataset.act === 'spellbook'));
    assert.ok(badge, '000199: бейдж есть на ходу союзника (скрыт)');
    assert.equal(badge.style.display, 'none',
      'на ходу союзника бейдж скрыт (display none)');
    assert.equal(badge.textContent, '',
      'скрытый бейдж — текст пуст');
  }
  // (c) Бейдж ЕСТЬ только на attack+spellbook: НЕ на
  //     block/quickItem/invItem/flee/endTurn/cast/heal/resurrect.
  {
    const S = scene84();
    for (const act of ['block', 'quickItem', 'invItem', 'flee',
      'endTurn']) {
      const b = S.body.querySelectorAll('.combat-actions button')
        .find((x) => x.dataset.act === act);
      assert.ok(b, 'фикстура: кнопка ' + act + ' есть');
      assert.ok(!badgeOf199(b),
        'бейджа НЕТ на кнопке «' + act + '»');
    }
    // Полная панель: Эфир + медик + «Воскрешение» (cast/heal/
    // resurrect строятся гейтами build() — отряд ДО build через
    // rosterData, 000087; addMerc84-после build гейт не проходит).
    const { G, body } = loadCombatUi(true, { withEfir: true });
    const hero = G.createCharacter();
    hero.spells = ['resurrect'];
    G.combatUI.startCombat({
      hero, mobs: ['wolf'], mobLevel: 1, seed: 42,
      efir: G.efir.createEfir(),
      rosterData: [{ name: 'Медик', role: 'support', level: 2,
        dmg: 1, hp: 1, spells: ['mend'] }],
    });
    const side = findByClass(body, 'combat-side');
    const panelBtns = side.children
      .find((x) => x.className === 'combat-actions').children;
    const acts = panelBtns.map((b) => b.dataset.act);
    assert.ok(acts.includes('cast') && acts.includes('heal')
      && acts.includes('resurrect'),
      'фикстура: полная панель (cast/heal/resurrect построены): '
      + JSON.stringify(acts));
    for (const b of panelBtns) {
      if (b.dataset.act === 'attack' || b.dataset.act === 'spellbook')
        continue;
      assert.ok(!badgeOf199(b),
        'бейджа НЕТ на кнопке «' + b.dataset.act + '»');
    }
  }
});

// ===== 000193.01: MP-полоса наёмника — мана (u.mp/u.maxMP) =====

test('боевой UI: 000193.01 — полоска MP наёмника: «MP 9/9» (u.mp/u.maxMP, attrs); после каста из книги (клик строки → castAllySpell) — «MP 3/9» (fill 33.3%) (CU193.01-MPBAR-MERC)', () => {
  const S = scene84({ spells: true, allySpells: true });
  const { G, c } = S;
  const wolf = c.units.find((x) => x.id === 'm0');
  wolf.x = 3; wolf.y = 4;
  c._rng = () => 0.99; // удары волка — мимо (паттерн CU193-BOOK)
  // Наёмник (паттерн addMerc193, CU193-BOOK): attrs (Dex 1 / Wis 4) →
  // mp 5+0+4 = 9 (≥ 6 — light_heal), spellWis 1; 000193.01: снапшот
  // maxMP в makeAlly = стартовому mp = 9 (регенации маны в бою нет).
  const merc = G.makeAlly({
    name: 'Мира', role: 'support', level: 1, dmg: 0.5, hp: 0.8,
    skills: [], spells: ['light_heal'],
    attrs: { dexterity: 1, wisdom: 4 }, maxHP: 40,
  }, 1);
  merc.x = 3; merc.y = 5;
  c.units.push(merc);
  c.turnOrder.push(merc.id);
  assert.equal(merc.mp, 9,
    'фикстура: 000193 — мана наёмника в модели 5+Wis = 9');
  assert.equal(merc.maxMP, 9,
    'фикстура: 000193.01 — снапшот maxMP = стартовому mp (9): факт '
    + JSON.stringify(merc.maxMP));
  assert.equal(G.activeUnitId(c), 'player', 'ход игрока (pre-roll)');
  // Конец хода игрока → стоп на наёмнике a1 (очередь [m0, player, a1]).
  press(S.keydown, 'Space');
  tickSlice(S.canvas, S.rafStubs);
  assert.equal(G.activeUnitId(c), 'a1', 'фикстура: активен наёмник');
  // Полоса — С ЮНИТА наёмника (краснота: hard-code D5 000199 —
  // fill 0%, «MP —»): полные 9/9.
  const mpfill = findByClass(S.body, 'combat-mpbar-fill');
  const mptext = findByClass(S.body, 'combat-mpbar-text');
  assert.ok(mpfill && mptext, '000193.01: полоска MP есть');
  assert.equal(mpfill.style.width, '100.0%',
    '000193.01: fill = 9/9 = 100.0%: факт '
    + JSON.stringify(mpfill.style.width));
  assert.equal(mptext.textContent, 'MP 9/9',
    '000193.01: текст «MP 9/9» (u.mp/u.maxMP): факт '
    + JSON.stringify(mptext.textContent));
  // Книга на ходу наёмника: ровно одна строка — light_heal, без -off
  // (mp 9 ≥ 6, spellWis 1); клик — каст наёмника (паттерн CU193-BOOK:
  // снимок строк ДО KeyQ — рендер keydown-обработчика синхронный).
  const bookBox = findByClass(S.body, 'combat-spellbook');
  assert.ok(bookBox, 'книга (.combat-spellbook) есть');
  const m2 = bookBox.children.length;
  press(S.keydown, 'KeyQ');
  tickSlice(S.canvas, S.rafStubs);
  assert.notEqual(bookBox.style.display, 'none',
    'книга открыта (KeyQ на ходу наёмника)');
  const rows = bookBox.children.slice(m2);
  assert.equal(rows.length, 1,
    'ровно одна строка — книга наёмника [light_heal]; факт: '
    + rows.map((x) => (x.dataset && x.dataset.spell) || '—').join(','));
  const healRow = rows.find(
    (x) => x.dataset && x.dataset.spell === 'light_heal');
  assert.ok(healRow, 'строка «light_heal» (книга наёмника)');
  assert.ok(!healRow.className.includes('combat-spellrow-off'),
    'строка без -off (ресурса хватает: mp 9 ≥ 6, spellWis 1)');
  assert.equal(healRow.title, '', 'подсказка пуста (canCast ok)');
  const meta = findByClass(healRow, 'combat-spellmeta');
  assert.ok(meta && meta.textContent.includes('Мана 6'),
    'данные строки — из каталога: «Мана 6» (факт: '
    + (meta ? meta.textContent : 'нет meta') + ')');
  // Каст: self-heal +7, пул/мана НАЁМНИКА, игрок нетронут,
  // книга закрыта.
  const n0 = c.log.length;
  const pMp0 = c.player.mp, pWis0 = c.ps.spellWis;
  healRow.listeners.click[0]();
  assert.deepEqual(Array.from(c.log).slice(n0),
    ['Мира лечит себя (+7).'],
    'лог — вычисленный (паттерн 000168): '
    + JSON.stringify(Array.from(c.log).slice(n0)));
  assert.equal(merc.mp, 3, 'мана наёмника 9−6 (light_heal) = 3');
  assert.equal(merc.spellWis, 0, 'пул наёмника spellWis 1→0');
  assert.equal(c.player.mp, pMp0, 'мана игрока не сожжена');
  assert.equal(c.ps.spellWis, pWis0, 'пул игрока не сожжён');
  assert.equal(bookBox.style.display, 'none',
    'книга закрыта (действие совершено)');
  // Re-render (render() — единственный путь обновления, контракт
  // 000038/000047): полоса несёт остаток маны после каста.
  tickSlice(S.canvas, S.rafStubs);
  assert.equal(mptext.textContent, 'MP 3/9',
    '000193.01: после каста — «MP 3/9»: факт '
    + JSON.stringify(mptext.textContent));
  assert.equal(mpfill.style.width, '33.3%',
    '000193.01: fill после каста = 3/9 = 33.3%: факт '
    + JSON.stringify(mpfill.style.width));
});

test('боевой UI: 000193.01 — наёмник БЕЗ maxMP (white-box delete): деградация «MP —», fill 0.0%, краха нет (CU193.01-MPBAR-DEGR)', () => {
  const S = scene84();
  const merc = addMerc84(S.c, S.G, 3, 5, 'melee', 'Вольк');
  const w = S.c.units.find((x) => x.id === 'm0');
  w.x = 3; w.y = 4;
  assert.equal(merc.mp, 5,
    'фикстура: 000193 — mp 5 (5+Int+Wis, attrs {} у addMerc84)');
  assert.equal(merc.maxMP, 5,
    'фикстура: 000193.01 — снапшот maxMP = стартовому mp (5): факт '
    + JSON.stringify(merc.maxMP));
  press(S.keydown, 'Space');
  tickSlice(S.canvas, S.rafStubs);
  assert.equal(S.G.activeUnitId(S.c), 'a1', 'фикстура: активен наёмник');
  const mpfill = findByClass(S.body, 'combat-mpbar-fill');
  const mptext = findByClass(S.body, 'combat-mpbar-text');
  assert.ok(mpfill && mptext, '000193.01: полоска MP есть');
  // White-box «фикстура до апгрейда»: поля maxMP НЕТ → деградация
  // (D5 000199 → 000193.01): mpMax 0 → fill 0.0%, «MP —»; mp не
  // тронут (гарда даёт mpVal 0 — чтение только, мутаций нет).
  delete merc.maxMP;
  tickSlice(S.canvas, S.rafStubs);
  assert.equal(mptext.textContent, 'MP —',
    'деградация: «MP —» (поля maxMP нет): факт '
    + JSON.stringify(mptext.textContent));
  assert.equal(mpfill.style.width, '0.0%',
    'деградация: fill 0.0%: факт ' + JSON.stringify(mpfill.style.width));
  assert.equal(merc.mp, 5, 'mp не тронут (гарда — только чтение)');
});

test('боевой UI: 000193.02 — Эфир-носитель: строка «Воскрешение» без -off при c.targetId === null (автоцель — первый мёртвый союзник, пул/мана Эфира); саб: мёртвых нет — -off «нет цели» (CU193.02-ROW)', () => {
  let S = scene84({ efir: true, spells: true, allySpells: true });
  let { G, c } = S;
  const u = c.units.find((x) => x.kind === 'efir');
  const a1 = addMerc84(c, G, 3, 5, 'melee', 'Вольк');
  G.combatInternals.dealDamageToAlly(c, a1, 9999);
  u.spells.push('resurrect');
  u.mp = 20;
  u.maxMP = 20;
  assert.equal(G.activeUnitId(c), 'efir',
    'фикстура: Эфир активен (pre-roll стоп на его слоте)');
  assert.ok(!a1.alive && a1.hp === 0, 'фикстура: союзник мёртв');
  assert.equal(c.player.alive, true, 'фикстура: игрок жив');
  assert.equal(u.mp, 20, 'фикстура: мана 20 ≥ мани 15');
  assert.equal(c.efs.spellWis, 1,
    'фикстура-факт: пул Эфира spellWis 1 (startRound-рефилл)');
  c.targetId = null;
  tickSlice(S.canvas, S.rafStubs);
  press(S.keydown, 'KeyQ');
  tickSlice(S.canvas, S.rafStubs);
  const bookBox = findByClass(S.body, 'combat-spellbook');
  assert.notEqual(bookBox.style.display, 'none', 'книга открыта');
  assert.deepEqual(
    Array.from(bookBox.children).map((x) => x.dataset.spell),
    ['spark', 'mend', 'resurrect'],
    'книга Эфира — порядок строк [spark, mend, resurrect]');
  const row = lastRow166(bookBox);
  assert.equal(row.dataset.spell, 'resurrect', 'строка «Воскрешение»');
  assert.ok(!row.className.includes('combat-spellrow-off'),
    'строка без -off (автоцель — первый мёртвый союзник): '
    + JSON.stringify(row.className));
  assert.equal(row.title, '',
    'подсказка пуста (canCastAllySpell ok: пул 1, мана 20 ≥ 15)');
  // Саб: мёртвых нет (игрок жив, союзник жив) — -off «нет цели»
  // (mirror CU166-NODEAD: защита от ложного ok без валидации цели).
  S = scene84({ efir: true, spells: true, allySpells: true });
  ({ c } = S);
  const u2 = c.units.find((x) => x.kind === 'efir');
  u2.spells.push('resurrect');
  u2.mp = 20;
  u2.maxMP = 20;
  assert.ok(c.player.alive && c.units.every((x) => x.alive),
    'фикстура саба: мёртвых нет');
  press(S.keydown, 'KeyQ');
  tickSlice(S.canvas, S.rafStubs);
  const bookBox2 = findByClass(S.body, 'combat-spellbook');
  const row2 = lastRow166(bookBox2);
  assert.equal(row2.dataset.spell, 'resurrect', 'строка «Воскрешение»');
  assert.ok(row2.className.includes('combat-spellrow-off'),
    'саб: строка -off (мёртвой цели нет)');
  assert.equal(row2.title, 'нет цели', 'саб: title — причина (mirror CU166-NODEAD)');
});

test('боевой UI: 000193.02 — Эфир-носитель: клик по мёртвому союзнику на канвасе — цель ставится (c.targetId), маркеры (подложка/кольцо), строка открытой книги перестроена, каст: союзник вернулся, расход пул/мана ЭФИРА, 0 новых c._rng (CU193.02-SEL)', () => {
  const S = scene84({ efir: true, spells: true, allySpells: true });
  const { G, c, body, keydown, canvas, rafStubs } = S;
  const u = c.units.find((x) => x.kind === 'efir');
  const wolf = c.units.find((x) => x.id === 'm0');
  const a1 = addMerc84(c, G, 3, 5, 'melee', 'Вольк');
  G.combatInternals.dealDamageToAlly(c, a1, 9999);
  u.spells.push('resurrect');
  u.mp = 20;
  u.maxMP = 20;
  assert.equal(G.activeUnitId(c), 'efir',
    'фикстура: Эфир активен (pre-roll стоп на его слоте)');
  assert.ok(!a1.alive && a1.hp === 0, 'фикстура: союзник мёртв');
  assert.equal(a1.maxHP, 16, 'фикстура: наёмник level 2 — maxHP 16');
  assert.equal(c.player.alive, true, 'фикстура: игрок жив');
  assert.equal(c.targetId, wolf.id,
    'фикстура: СТАЛОЕ targetId — живой волк (авто-цель начала хода)');
  assert.equal(u.mp, 20, 'фикстура: мана 20 ≥ мани 15');
  assert.equal(c.efs.spellWis, 1,
    'фикстура-факт: пул Эфира spellWis 1 (startRound-рефилл)');
  // (1) Книга: строка -off «нет цели» (stale-цель — живой волк;
  // состояние-бага ДО выбора цели).
  const bookBox = findByClass(body, 'combat-spellbook');
  press(keydown, 'KeyQ');
  tickSlice(canvas, rafStubs);
  assert.notEqual(bookBox.style.display, 'none', 'книга открыта');
  const row0 = lastRow166(bookBox);
  assert.equal(row0.dataset.spell, 'resurrect', 'строка «Воскрешение»');
  assert.ok(row0.className.includes('combat-spellrow-off'),
    'строка -off (stale-цель — живой волк)');
  assert.equal(row0.title, 'нет цели', 'title — причина');
  // (2) Маркеры мёртвого союзника — расширенный гейт (носитель —
  // активный СОЮЗНИК): подложка на клетке a1, кольца нет (не выбран),
  // подложки на клетке моба нет.
  const ax = a1.x * 48, ay = a1.y * 48;
  const wx = wolf.x * 48, wy = wolf.y * 48;
  let t = tickSlice(canvas, rafStubs);
  assert.ok(underlayAt166(t.events, ax, ay),
    'подложка на клетке мёртвого союзника (fillRect +2/+2, 44×44, '
    + ALLY_UNDERLAY166 + ') — носитель воскрешения — активный союзник');
  assert.ok(!ringAt166(t.events, ax, ay), 'до выбора — кольца нет');
  assert.ok(!underlayAt166(t.events, wx, wy),
    'на клетке моба подложки нет (цели воскрешения — только союзники)');
  // (3) Клик по клетке мёртвого союзника — выбор цели (не действие).
  const n0 = c.log.length;
  canvas.listeners.click[0]({
    clientX: (a1.x + 0.5) * 48, clientY: (a1.y + 0.5) * 48,
  });
  assert.equal(c.targetId, a1.id,
    'клик по клетке мёртвого союзника — цель выбрана (прямой write c.targetId)');
  assert.equal(c.log.length, n0, 'выбор — не действие: лог не вырос');
  t = tickSlice(canvas, rafStubs);
  assert.ok(ringAt166(t.events, ax, ay),
    'кольцо выбранной цели на мёртвом союзнике (strokeRect +4.5/+4.5, 39×39, #ffe27a)');
  assert.ok(underlayAt166(t.events, ax, ay),
    'подложка сохранена после выбора');
  // (4) Строка открытой книги перестроена (клик → render → renderBook,
  // сигнатура сменилась) — БЕЗ -off.
  const row1 = lastRow166(bookBox);
  assert.equal(row1.dataset.spell, 'resurrect', 'свежая строка — «Воскрешение»');
  assert.ok(!row1.className.includes('combat-spellrow-off'),
    'строка готова (явная цель — мёртвый союзник): '
    + JSON.stringify(row1.className));
  assert.equal(row1.title, '', 'подсказка пуста (canCastAllySpell ok)');
  // (5) Каст — клик по строке: союзник вернулся, расход — пул/мана
  // ЭФИРА, игрок нетронут, книга закрыта, ход не сгорел, 0 c._rng,
  // efirState не мутирован.
  const efirState0 = JSON.parse(JSON.stringify(c.efirState));
  const pMp0 = c.player.mp, pInt0 = c.ps.spellInt, pWis0 = c.ps.spellWis;
  const eInt0 = c.efs.spellInt, eWis0 = c.efs.spellWis;
  const realRng = c._rng;
  let rngCalls = 0;
  c._rng = () => (rngCalls++, realRng());
  row1.listeners.click[0]();
  assert.deepEqual(Array.from(c.log).slice(n0), ['Возвращён в бой.'],
    'лог — ровно ОДНА строка (ядро 000163 R-3): '
    + JSON.stringify(Array.from(c.log).slice(n0)));
  assert.equal(a1.alive, true, 'союзник возвращён в бой');
  assert.equal(a1.hp, Math.round(a1.maxHP / 2),
    'hp = round(maxHP/2) = 8 (формула 000163, не хардкод)');
  assert.equal(c.efs.spellWis, eWis0 - 1,
    'пул Эфира spellWis −1 (poolsOf: Эфир → c.efs)');
  assert.equal(c.efs.spellInt, eInt0, 'пул Эфира spellInt не тронут');
  assert.equal(u.mp, 5, 'мана Эфира 20−15 (мани resurrect) = 5');
  assert.equal(c.player.mp, pMp0, 'мана игрока не сожжена');
  assert.equal(c.ps.spellInt, pInt0, 'пул игрока spellInt не сожжён');
  assert.equal(c.ps.spellWis, pWis0, 'пул игрока spellWis не сожжён');
  assert.ok(c._fx && c._fx.action === 'cast', 'c._fx — cast');
  assert.equal(bookBox.style.display, 'none',
    'книга закрыта (действие совершено)');
  assert.equal(G.activeUnitId(c), 'efir', 'каст ≠ endTurn (очередь не сдвинулась)');
  assert.equal(rngCalls, 0,
    'новых вызовов c._rng — ноль (воскрешение без RNG, 000163)');
  // JSON-раундтрип обеих сторон — объекты vm-песочницы (чужой realm,
  // deepStrictEqual — с прототипами), паттерн c.buffMods в этом файле.
  assert.deepEqual(JSON.parse(JSON.stringify(c.efirState)), efirState0,
    'efirState не мутирован');
});

test('боевой UI: 000193.02 — мёртвый игрок + СТАЛОЕ targetId (живой волк): клик по клетке мёртвого игрока — c.targetId = null (автоцель), строка/строка состояния/кольцо, каст: игрок возвращён (round(derived maxHP/2)), альянс-мёртвый остаётся мёртв, расход — ЭФИР (CU193.02-CLEAR)', () => {
  const S = scene84({ efir: true, spells: true, allySpells: true });
  const { G, c, body, keydown, canvas, rafStubs } = S;
  const u = c.units.find((x) => x.kind === 'efir');
  const wolf = c.units.find((x) => x.id === 'm0');
  const a1 = addMerc84(c, G, 3, 5, 'melee', 'Вольк');
  G.combatInternals.dealDamageToAlly(c, a1, 9999);
  u.spells.push('resurrect');
  u.mp = 20;
  u.maxMP = 20;
  c.player.alive = false;
  c.player.hp = 0;
  assert.equal(G.activeUnitId(c), 'efir',
    'фикстура: Эфир активен (pre-roll стоп на его слоте)');
  assert.ok(!c.player.alive && c.player.hp === 0,
    'фикстура: игрок мёртв (симуляция 000163 R-8 — c.result не возникает)');
  assert.ok(!a1.alive && a1.hp === 0, 'фикстура: союзник тоже мёртв');
  assert.ok(!c.result, 'фикстура: c.result не появился (R-8)');
  assert.equal(c.targetId, wolf.id,
    'фикстура: СТАЛОЕ targetId — живой волк (авто-цель начала хода)');
  // (1) Книга: строка -off «нет цели» (stale-цель — живой волк).
  const bookBox = findByClass(body, 'combat-spellbook');
  press(keydown, 'KeyQ');
  tickSlice(canvas, rafStubs);
  const row0 = lastRow166(bookBox);
  assert.equal(row0.dataset.spell, 'resurrect', 'строка «Воскрешение»');
  assert.ok(row0.className.includes('combat-spellrow-off'),
    'строка -off (stale-цель — живой волк)');
  assert.equal(row0.title, 'нет цели', 'title — причина');
  // (2) Клик по клетке МЁРТВОГО игрока — снять устаревшую цель → null
  // (автоцель — мёртвый игрок приоритетно).
  const n0 = c.log.length;
  canvas.listeners.click[0]({
    clientX: (c.px + 0.5) * 48, clientY: (c.py + 0.5) * 48,
  });
  assert.equal(c.targetId, null,
    'клик по клетке мёртвого игрока — цель снята (автоцель — игрок)');
  assert.equal(c.log.length, n0, 'выбор — не действие: лог не вырос');
  // (3) Строка перестроена БЕЗ -off (автоцель — мёртвый игрок).
  const row1 = lastRow166(bookBox);
  assert.equal(row1.dataset.spell, 'resurrect', 'свежая строка — «Воскрешение»');
  assert.ok(!row1.className.includes('combat-spellrow-off'),
    'строка готова (авто: мёртвый игрок приоритетно): '
    + JSON.stringify(row1.className));
  assert.equal(row1.title, '', 'подсказка пуста (canCastAllySpell ok)');
  // (4) HUD-строка состояния «(вы) — мёртв» + подложка/кольцо на
  // клетке героя (auto-цель «вы»).
  const state = findByClass(body, 'combat-state');
  assert.ok(state.textContent.includes('Цель: Флогистон (вы) — мёртв'),
    'HUD-строка «(вы) — мёртв»: ' + JSON.stringify(state.textContent));
  const hx = c.px * 48, hy = c.py * 48;
  const t = tickSlice(canvas, rafStubs);
  assert.ok(underlayAt166(t.events, hx, hy),
    'подложка на клетке мёртвого героя');
  assert.ok(ringAt166(t.events, hx, hy),
    'кольцо на клетке героя (автоцель — «вы»)');
  // (5) Каст — игрок возвращён, союзник остаётся мёртв (авто взяла
  // игрока), расход — пул/мана ЭфиРА (mana игрока не тратится).
  const pMp0 = c.player.mp, pInt0 = c.ps.spellInt, pWis0 = c.ps.spellWis;
  const eInt0 = c.efs.spellInt, eWis0 = c.efs.spellWis;
  const efirState0 = JSON.parse(JSON.stringify(c.efirState));
  row1.listeners.click[0]();
  assert.deepEqual(Array.from(c.log).slice(n0), ['Возвращён в бой.'],
    'лог — ровно ОДНА строка (ядро 000163 R-3): '
    + JSON.stringify(Array.from(c.log).slice(n0)));
  assert.equal(c.player.alive, true, 'игрок возвращён');
  assert.equal(c.player.hp, Math.round(G.derived(c.player).maxHP / 2),
    'hp = round(derived maxHP/2) (у игрока НЕТ поля maxHP)');
  assert.equal(a1.alive, false, 'союзник мёртв (автоцель взяла игрока)');
  assert.equal(c.efs.spellWis, eWis0 - 1,
    'пул Эфира spellWis −1 (poolsOf: Эфир → c.efs)');
  assert.equal(c.efs.spellInt, eInt0, 'пул Эфира spellInt не тронут');
  assert.equal(u.mp, 5, 'мана Эфира 20−15 (мани resurrect) = 5');
  assert.equal(c.player.mp, pMp0, 'мана игрока НЕ тратится (каст — Эфира)');
  assert.equal(c.ps.spellInt, pInt0, 'пул игрока spellInt не сожжён');
  assert.equal(c.ps.spellWis, pWis0, 'пул игрока spellWis не сожжён');
  assert.ok(!c.result, 'c.result не появился');
  assert.ok(c._fx && c._fx.action === 'cast', 'c._fx — cast');
  assert.equal(bookBox.style.display, 'none',
    'книга закрыта (действие совершено)');
  assert.equal(G.activeUnitId(c), 'efir', 'каст ≠ endTurn (очередь не сдвинулась)');
  assert.deepEqual(JSON.parse(JSON.stringify(c.efirState)), efirState0,
    'efirState не мутирован');
});

test('боевой UI: 000193.02 — ни игрок, ни Эфир НЕ знают «Воскрешение»: клик по мёртвому союзнику no-op (targetId/лог не изменились), маркеров нет — бит-в-байт 000166 НА ХОДУ СОЮЗНИКА (CU193.02-GATE)', () => {
  const S = scene84({ efir: true, spells: true, allySpells: true });
  const { G, c } = S;
  const u = c.units.find((x) => x.kind === 'efir');
  const wolf = c.units.find((x) => x.id === 'm0');
  const a1 = addMerc84(c, G, 3, 5, 'melee', 'Вольк');
  G.combatInternals.dealDamageToAlly(c, a1, 9999);
  assert.equal(G.activeUnitId(c), 'efir',
    'фикстура: Эфир активен (pre-roll стоп на его слоте)');
  assert.ok(!a1.alive && a1.hp === 0, 'фикстура: союзник мёртв');
  assert.equal(c.player.alive, true, 'фикстура: игрок жив');
  assert.ok(!c.player.spells.includes('resurrect'),
    'игрок НЕ знает «Воскрешение» (дефолт [spark, mend])');
  assert.ok(!u.spells.includes('resurrect'),
    'Эфир НЕ знает «Воскрешение» (дефолт [spark, mend])');
  assert.equal(c.targetId, wolf.id,
    'фикстура: СТАЛОЕ targetId — живой волк');
  const ax = a1.x * 48, ay = a1.y * 48;
  const hx = c.px * 48, hy = c.py * 48;
  const t = tickSlice(S.canvas, S.rafStubs);
  assert.ok(!underlayAt166(t.events, ax, ay),
    'подложки на мёртвом союзнике нет (носителя нет)');
  assert.ok(!ringAt166(t.events, ax, ay),
    'кольца на мёртвом союзнике нет (носителя нет)');
  assert.ok(!underlayAt166(t.events, hx, hy),
    'подложки на клетке героя нет (игрок жив)');
  assert.ok(!ringAt166(t.events, hx, hy),
    'кольца на клетке героя нет (игрок жив)');
  const n0 = c.log.length;
  const t0 = c.targetId;
  S.canvas.listeners.click[0]({
    clientX: (a1.x + 0.5) * 48, clientY: (a1.y + 0.5) * 48,
  });
  assert.equal(c.targetId, t0,
    'клик по мёртвому союзнику — цель не изменилась (no-op)');
  assert.equal(c.log.length, n0, 'лог не вырос');
  assert.ok(!c._fx || c._fx.action !== 'cast', 'cast-FX нет');
});

test('боевой UI: 000196 — книга (.combat-spellbook) — в .combat-box ПОЛЕМ: [canvas, spellbook, banner]; .combat-side — 6 элементов без книги; кнопка/KeyQ/KeyR — toggle (CU196-POS)', () => {
  const S = scene84();
  const { c, body, keydown, buttons } = S;
  assert.equal(S.G.activeUnitId(c), 'player', 'фикстура: ход игрока');
  const box = findByClass(body, 'combat-box');
  const side = findByClass(body, 'combat-side');
  assert.ok(box && side, 'фикстура: .combat-box и .combat-side есть');
  assert.deepEqual(side.children.map((ch) => ch.className),
    ['combat-turnorder', 'combat-hpbar', 'combat-mpbar', 'combat-state',
      'combat-actions', 'combat-log'],
    '000196: .combat-side — 6 элементов, книги НЕТ (краснота: 7 элементов — '
    + 'книга между .combat-actions и .combat-log): '
    + JSON.stringify(side.children.map((ch) => ch.className)));
  const canvas = findCanvas(body);
  assert.equal(box.children.length, 3,
    '000196: .combat-box — 3 ребёнка (canvas, книга, баннер); факт: '
    + box.children.length);
  assert.equal(box.children[0], canvas,
    '000196: первый ребёнок .combat-box — боевой canvas');
  assert.deepEqual(box.children.map((ch) => ch.className),
    ['', 'combat-spellbook', 'combat-banner'],
    '000196: .combat-box — [canvas, .combat-spellbook, .combat-banner] '
    + '(краснота: [canvas, .combat-banner] — книга была в .combat-side): '
    + JSON.stringify(box.children.map((ch) => ch.className)));
  const bookBox = findByClass(body, 'combat-spellbook');
  assert.ok(bookBox, 'фикстура: .combat-spellbook существует');
  assert.equal(bookBox.style.display, 'none', 'книга скрыта по умолчанию');
  const bookBtn = buttons.find((b) => b.dataset.act === 'spellbook');
  assert.ok(bookBtn, 'кнопка «Книга заклинаний» (act=spellbook)');
  bookBtn.listeners.click[0]();
  assert.notEqual(bookBox.style.display, 'none',
    'клик по кнопке — книга открыта поверх поля (000196)');
  assert.equal(bookBox.children.length, 1,
    'строки построены (сцена без каталога — одна строка «—»); факт: '
    + bookBox.children.length);
  assert.ok(bookBox.children[0].className.includes('combat-spellrow-off'),
    'пустая книга — строка «—» с -off: ' + bookBox.children[0].className);
  press(keydown, 'KeyQ');
  assert.equal(bookBox.style.display, 'none', 'KeyQ — toggle (закрыла)');
  press(keydown, 'KeyR');
  assert.notEqual(bookBox.style.display, 'none', 'KeyR — toggle (открыла)');
});

test('боевой UI: 000196 — строки оверлея: 1:1 с книгой, desc/имя/meta/иконка — из каталога; пустая книга — «—» без dataset.spell (CU196-DESC)', () => {
  const S = scene84({ spells: true });
  const { G, c, body, buttons, canvas, rafStubs } = S;
  const cat = G.SpellsData.SPELLS_BY_ID;
  assert.ok(cat && cat.spark && cat.mend, 'фикстура: каталог в песочнице');
  assert.deepEqual([...c.player.spells], ['spark', 'mend'],
    'фикстура: стартовая книга героя (sheet.js)');
  const bookBtn = buttons.find((b) => b.dataset.act === 'spellbook');
  bookBtn.listeners.click[0]();
  const bookBox = findByClass(body, 'combat-spellbook');
  assert.notEqual(bookBox.style.display, 'none', 'книга открыта (оверлей)');
  const rows = bookBox.children.slice(-2);
  assert.equal(rows.length, 2, 'строк = заклинаний в книге (2)');
  assert.deepEqual(rows.map((r) => r.dataset.spell), ['spark', 'mend'],
    'порядок строк = порядок c.player.spells');
  for (const [row, id] of [[rows[0], 'spark'], [rows[1], 'mend']]) {
    const img = row.children.find((ch) => ch.tagName === 'img');
    assert.equal(img && img.src, 'assets/spell-icons/' + id + '.svg',
      id + ': иконка src = icon каталога, факт: ' + (img && img.src));
    const bodyDiv = row.children
      .find((ch) => ch.className === 'combat-spellrow-body');
    const top = bodyDiv.children
      .find((ch) => ch.className === 'combat-spellrow-top');
    const nameSpan = top.children
      .find((ch) => ch.className === 'combat-spellname');
    assert.equal(nameSpan.textContent, cat[id].название,
      id + ': имя = название каталога, факт: ' + nameSpan.textContent);
    const attrName = cat[id].атрибут === 'intelligence'
      ? 'Интеллект' : 'Мудрость';
    const metaSpan = top.children
      .find((ch) => ch.className === 'combat-spellmeta');
    assert.equal(metaSpan.textContent,
      'Мана ' + cat[id].мани + ' · Заклинание (' + attrName + ')',
      id + ': мета «Мана N · Заклинание (атрибут)» из данных каталога, '
      + 'факт: ' + metaSpan.textContent);
    const descDiv = bodyDiv.children
      .find((ch) => ch.className === 'combat-spellrow-desc');
    assert.equal(descDiv.textContent, cat[id].описание,
      id + ': описание = описание каталога, факт: ' + descDiv.textContent);
  }
  c.player.spells = [];
  tickSlice(canvas, rafStubs);
  const empty = lastRow166(bookBox);
  assert.equal(empty.textContent.trim(), '—',
    'пустая книга — строка «—», факт: ' + JSON.stringify(empty.textContent));
  assert.ok(empty.className.includes('combat-spellrow-off'),
    'строка «—» — -off (не кликабельна): ' + empty.className);
  assert.equal(empty.dataset.spell, undefined,
    'строка «—» без dataset.spell');
});

test('боевой UI: 000196 — клик по строке оверлея — каст: лог/мана/пул/c._fx, книга закрыта, ход не сгорел; отказ — без расхода, книга открыта (CU196-CAST)', () => {
  {
    const S = scene84({ spells: true });
    const { G, c, body, buttons } = S;
    const m0 = c.units[0];
    m0.x = c.px; m0.y = c.py - 1;
    m0.maxHP += 6; m0.hp += 6;
    c.selectTarget(m0.id);
    c._rng = () => 0.99;
    const p = c.player;
    assert.equal(p.mp, 16, 'фикстура: мана дефолтного героя 16');
    const intBefore = c.ps.spellInt;
    assert.ok(intBefore > 0, 'фикстура: пул Интеллект есть');
    const bookBtn = buttons.find((b) => b.dataset.act === 'spellbook');
    bookBtn.listeners.click[0]();
    const bookBox = findByClass(body, 'combat-spellbook');
    assert.notEqual(bookBox.style.display, 'none', 'книга открыта (оверлей)');
    const sparkRow = bookBox.children.slice(-2)
      .find((rw) => rw.dataset.spell === 'spark');
    assert.ok(sparkRow, 'строка «Искра» в оверлее');
    assert.equal(c._fx, undefined, 'c._fx не записано до каста');
    sparkRow.listeners.click[0]();
    const lastLog = Array.from(c.log).slice(-1)[0];
    assert.match(lastLog, /^Искра по Волк: \d+\.$/,
      'строка лога каталога castSpell, факт: ' + JSON.stringify(lastLog));
    assert.equal(c.ps.spellInt, intBefore - 1,
      'пул «Заклинание» (Интеллект) −1, факт: ' + c.ps.spellInt);
    assert.equal(p.mp, 13, 'мана 16−3 = 13, факт: ' + p.mp);
    assert.equal(c._fx && c._fx.action, 'cast', 'c._fx.action = cast');
    assert.equal(bookBox.style.display, 'none',
      'книга закрыта после каста (действие совершено)');
    assert.equal(c.phase, 'player', 'ход игрока не сгорел (каст — действие)');
    assert.equal(G.activeUnitId(c), 'player', 'очередь не сдвинулась');
    assert.equal(c.round, 1, 'раунд не наступил');
  }
  {
    const S = scene84({ spells: true });
    const { c, body, buttons } = S;
    const m0 = c.units[0];
    m0.x = c.px; m0.y = c.py - 1;
    c.selectTarget(m0.id);
    c.player.mp = 0;
    const intBefore = c.ps.spellInt;
    const bookBtn = buttons.find((b) => b.dataset.act === 'spellbook');
    bookBtn.listeners.click[0]();
    const bookBox = findByClass(body, 'combat-spellbook');
    const sparkRow = bookBox.children.slice(-2)
      .find((rw) => rw.dataset.spell === 'spark');
    assert.ok(sparkRow, 'строка «Искра» (сценарий отказа)');
    assert.ok(sparkRow.className.includes('combat-spellrow-off'),
      '«Искра» без маны — disabled-строка: ' + sparkRow.className);
    assert.equal(sparkRow.title, 'не хватает маны (3)',
      'title = reason canCastSpell, факт: ' + sparkRow.title);
    const n0 = c.log.length;
    sparkRow.listeners.click[0]();
    assert.equal(c.ps.spellInt, intBefore, 'без расхода пула');
    assert.equal(c.player.mp, 0, 'без расхода маны');
    assert.equal(Array.from(c.log).slice(-1)[0], 'не хватает маны (3)',
      'reason отказа — последняя строка журнала, факт: '
      + JSON.stringify(Array.from(c.log).slice(n0)));
    assert.notEqual(bookBox.style.display, 'none',
      'после отказа книга открыта (видна причина)');
  }
});

test('боевой UI: 000196 — «Воскрешение» из книги-оверлея: при ОТКРЫТОЙ книге маркеры мёртвого союзника, canvas-клик — выбор цели (pass-through), строка перестроена без -off, каст — пул/мана Эфира, 0 новых c._rng (CU196-SEL)', () => {
  const S = scene84({ efir: true, spells: true, allySpells: true });
  const { G, c, body, keydown, canvas, rafStubs } = S;
  const u = c.units.find((x) => x.kind === 'efir');
  const wolf = c.units.find((x) => x.id === 'm0');
  const a1 = addMerc84(c, G, 3, 5, 'melee', 'Вольк');
  G.combatInternals.dealDamageToAlly(c, a1, 9999);
  u.spells.push('resurrect');
  u.mp = 20;
  u.maxMP = 20;
  assert.equal(G.activeUnitId(c), 'efir',
    'фикстура: Эфир активен (pre-roll стоп на его слоте)');
  assert.ok(!a1.alive && a1.hp === 0, 'фикстура: союзник мёртв');
  assert.equal(a1.maxHP, 16, 'фикстура: наёмник level 2 — maxHP 16');
  assert.equal(c.player.alive, true, 'фикстура: игрок жив');
  assert.equal(c.efs.spellWis, 1,
    'фикстура-факт: пул Эфира spellWis 1 (startRound-рефилл)');
  assert.equal(c.targetId, wolf.id,
    'фикстура: СТАЛОЕ targetId — живой волк (авто-цель начала хода)');
  const bookBox = findByClass(body, 'combat-spellbook');
  press(keydown, 'KeyQ');
  tickSlice(canvas, rafStubs);
  assert.notEqual(bookBox.style.display, 'none', 'книга открыта (оверлей)');
  const row0 = lastRow166(bookBox);
  assert.equal(row0.dataset.spell, 'resurrect', 'строка «Воскрешение»');
  assert.ok(row0.className.includes('combat-spellrow-off'),
    'строка -off (stale-цель — живой волк)');
  assert.equal(row0.title, 'нет цели', 'title — причина');
  const n0 = c.log.length;
  canvas.listeners.click[0]({
    clientX: (a1.x + 0.5) * 48, clientY: (a1.y + 0.5) * 48,
  });
  assert.equal(c.targetId, a1.id,
    'canvas-клик при ОТКРЫТОЙ книге — цель выбрана (pass-through: клики '
    + 'мимо строк проходят в поле)');
  assert.equal(c.log.length, n0, 'выбор — не действие: лог не вырос');
  assert.notEqual(bookBox.style.display, 'none',
    'книга осталась открыта после выбора цели');
  const ax = a1.x * 48, ay = a1.y * 48;
  const t = tickSlice(canvas, rafStubs);
  assert.ok(ringAt166(t.events, ax, ay),
    'кольцо выбранной цели на мёртвом союзнике (39×39, #ffe27a) — маркеры '
    + '000193.02 не тронуты');
  assert.ok(underlayAt166(t.events, ax, ay), 'подложка сохранена после выбора');
  const row1 = lastRow166(bookBox);
  assert.equal(row1.dataset.spell, 'resurrect', 'свежая строка — «Воскрешение»');
  assert.ok(!row1.className.includes('combat-spellrow-off'),
    'строка открытой книги перестроена БЕЗ -off: '
    + JSON.stringify(row1.className));
  assert.equal(row1.title, '', 'подсказка пуста (canCastAllySpell ok)');
  const pMp0 = c.player.mp, pInt0 = c.ps.spellInt, pWis0 = c.ps.spellWis;
  const eInt0 = c.efs.spellInt, eWis0 = c.efs.spellWis;
  const realRng = c._rng;
  let rngCalls = 0;
  c._rng = () => (rngCalls++, realRng());
  row1.listeners.click[0]();
  assert.deepEqual(Array.from(c.log).slice(n0), ['Возвращён в бой.'],
    'лог — ровно ОДНА строка (ядро 000163 R-3): '
    + JSON.stringify(Array.from(c.log).slice(n0)));
  assert.equal(a1.alive, true, 'союзник возвращён в бой');
  assert.equal(a1.hp, 8, 'hp = round(maxHP/2) = 8 (формула 000163)');
  assert.equal(c.efs.spellWis, 0,
    'пул Эфира spellWis 1−1 = 0, факт: ' + c.efs.spellWis);
  assert.equal(c.efs.spellInt, eInt0, 'пул Эфира spellInt не тронут');
  assert.equal(u.mp, 5, 'мана Эфира 20−15 (мани resurrect) = 5');
  assert.equal(c.player.mp, pMp0, 'мана игрока не сожжена');
  assert.equal(c.ps.spellInt, pInt0, 'пул игрока spellInt не сожжён');
  assert.equal(c.ps.spellWis, pWis0, 'пул игрока spellWis не сожжён');
  assert.ok(c._fx && c._fx.action === 'cast', 'c._fx — cast');
  assert.equal(bookBox.style.display, 'none',
    'книга закрыта (действие совершено)');
  assert.equal(G.activeUnitId(c), 'efir', 'каст ≠ endTurn (очередь не сдвинулась)');
  assert.equal(rngCalls, 0,
    'новых вызовов c._rng — ноль (воскрешение без RNG, 000163)');
});

// 000204: уровень мобов/спутников — вдвое мельче (6px ui-monospace) и
// в правом верхнем углу тайла (якорь fillText (px+pw−4, py+12),
// textAlign 'right', fillStyle '#fff'). Контракт —
// memory/000204-combat-level-corner.md (вытесняет «уровень (fillText,
// центр +4)» контракта 000197 §2).
const hasTextStyleSet = (list, k, v) =>
  list.some(([p, val]) => p === k && val === v);

test('боевой UI: 000204 — уровень ЖИВОГО МОБА: вдвое мельче (6px ui-monospace, monospace), в правом верхнем углу тайла (x*48+44, y*48+12), fillStyle \'#fff\' в момент вызова; на старом центре (x*48+24, y*48+28) — нет (CU204-MOB)', () => {
  const S = scene84();
  const u = S.c.units.find((x) => x.mobId === 'wolf');
  assert.ok(u && u.alive, 'фикстура: живой волк 1×1');
  const t = tickSlice(S.canvas, S.rafStubs);
  const texts = t.calls.filter((c) => c[0] === 'fillText');
  assert.ok(texts.some((c) => c[1][0] === String(u.level)
    && c[1][1] === u.x * 48 + 44 && c[1][2] === u.y * 48 + 12),
    'fillText уровня — в правом верхнем углу тайла (x*48+44, y*48+12): '
    + JSON.stringify(texts));
  assert.ok(hasTextStyleSet(t.textStyleSets, 'font',
    '6px ui-monospace, monospace'),
    'font — 6px ui-monospace, monospace (в 2 раза мельче): '
    + JSON.stringify(t.textStyleSets));
  assert.ok(hasTextStyleSet(t.textStyleSets, 'textAlign', 'right'),
    'textAlign — right (якорь — правая кромка текста): '
    + JSON.stringify(t.textStyleSets));
  assert.ok(!hasTextStyleSet(t.textStyleSets, 'font',
    '12px ui-monospace, monospace'),
    'старый font 12px не выставляется');
  const styled = styledCalls(t.events).find((c) => c.name === 'fillText'
    && c.args[0] === String(u.level));
  assert.ok(styled, 'fillText уровня в едином логе');
  assert.equal(styled.fillStyle, '#fff', 'fillStyle — #fff в момент вызова');
  assert.ok(!texts.some((c) => c[1][1] === u.x * 48 + 24
    && c[1][2] === u.y * 48 + 28),
    'на старом центре тайла (x*48+24, y*48+28) — нет');
});

test('боевой UI: 000204 — уровень СПУТНИКА (ally-ветка: Эфир + наёмник, оба kind): вдвое мельче (6px), textAlign right, в правом верхнем углу тайла (x*48+44, y*48+12), fillStyle \'#fff\' в момент вызова; на старом центре — нет (CU204-ALLY)', () => {
  const S = scene84({ efir: true });
  addMerc84(S.c, S.G, 5, 2, 'ranged');
  S.c.obstacles.clear();
  const allies = S.c.units
    .filter((x) => x.kind === 'efir' || x.kind === 'merc');
  assert.equal(allies.length, 2, 'фикстура: Эфир + наёмник в бою');
  assert.notDeepEqual(
    [allies[0].x, allies[0].y], [allies[1].x, allies[1].y],
    'фикстура: союзники на разных клетках');
  const t = tickSlice(S.canvas, S.rafStubs);
  assert.ok(hasTextStyleSet(t.textStyleSets, 'font',
    '6px ui-monospace, monospace'),
    'font — 6px ui-monospace, monospace (в 2 раза мельче): '
    + JSON.stringify(t.textStyleSets));
  assert.ok(hasTextStyleSet(t.textStyleSets, 'textAlign', 'right'),
    'textAlign — right: ' + JSON.stringify(t.textStyleSets));
  assert.ok(!hasTextStyleSet(t.textStyleSets, 'font',
    '12px ui-monospace, monospace'),
    'старый font 12px не выставляется');
  const styled = styledCalls(t.events);
  for (const u of allies) {
    const ex = u.x * 48, ey = u.y * 48;
    assert.ok(t.calls.some((c) => c[0] === 'fillText'
      && c[1][0] === String(u.level)
      && c[1][1] === ex + 44 && c[1][2] === ey + 12),
      'fillText уровня ' + u.kind + ' — в правом верхнем углу ('
      + (ex + 44) + ', ' + (ey + 12) + '): '
      + JSON.stringify(t.calls.filter((c) => c[0] === 'fillText')));
    const fc = styled.find((c) => c.name === 'fillText'
      && c.args[0] === String(u.level)
      && c.args[1] === ex + 44 && c.args[2] === ey + 12);
    assert.ok(fc, 'fillText уровня ' + u.kind + ' в едином логе');
    assert.equal(fc.fillStyle, '#fff',
      'fillStyle — #fff в момент вызова (' + u.kind + ')');
    assert.ok(!t.calls.some((c) => c[0] === 'fillText'
      && c[1][1] === ex + 24 && c[1][2] === ey + 28),
      'на старом центре тайла ' + u.kind + ' — нет');
  }
});

test('боевой UI: 000204 — мультиклеточный моб 2×2 (cave_bear): уровень в правом верхнем углу ЦЕЛИКОВОГО прямоугольника (x*48+92, y*48+12; pw=96 → px+pw−4), не в центре (x*48+48, y*48+52); 6px (CU204-BIG)', () => {
  const S = scene84({ mobs: ['cave_bear'] });
  const u = S.c.units.find((x) => x.mobId === 'cave_bear');
  assert.ok(u && u.alive, 'фикстура: cave_bear 2×2 в бою');
  assert.equal(u.size.w, 2, 'фикстура: size.w = 2 (примитивы — vm-правило 000082)');
  assert.equal(u.size.h, 2, 'фикстура: size.h = 2');
  const t = tickSlice(S.canvas, S.rafStubs);
  const texts = t.calls.filter((c) => c[0] === 'fillText');
  assert.ok(texts.some((c) => c[1][0] === String(u.level)
    && c[1][1] === u.x * 48 + 92 && c[1][2] === u.y * 48 + 12),
    'fillText — в правом верхнем углу прямоугольника 2×2 (x*48+92, y*48+12): '
    + JSON.stringify(texts));
  assert.ok(hasTextStyleSet(t.textStyleSets, 'font',
    '6px ui-monospace, monospace'),
    'font — 6px ui-monospace, monospace: '
    + JSON.stringify(t.textStyleSets));
  assert.ok(hasTextStyleSet(t.textStyleSets, 'textAlign', 'right'),
    'textAlign — right: ' + JSON.stringify(t.textStyleSets));
  assert.ok(!texts.some((c) => c[1][1] === u.x * 48 + 48
    && c[1][2] === u.y * 48 + 52),
    'в центре прямоугольника 2×2 (x*48+48, y*48+52) — нет');
});

test('боевой UI: 000204 — мёртвые моб/союзник: уровня НЕТ ни в новом углу (x*48+44, y*48+12), ни в центре (x*48+24, y*48+28) — пин против регрессии «уровень на трупе» (CU204-DEAD)', () => {
  const S = scene84({ efir: true });
  const u = S.c.units.find((x) => x.kind === 'efir');
  const wolf = S.c.units.find((x) => x.side === 'mob');
  u.alive = false; u.hp = 0;
  wolf.alive = false; wolf.hp = 0;
  const t = tickSlice(S.canvas, S.rafStubs);
  for (const x of [u, wolf]) {
    const ex = x.x * 48, ey = x.y * 48;
    assert.ok(!t.calls.some((c) => c[0] === 'fillText'
      && c[1][1] === ex + 44 && c[1][2] === ey + 12),
      'у трупа (' + x.kind + ') нет уровня в новом углу');
    assert.ok(!t.calls.some((c) => c[0] === 'fillText'
      && c[1][1] === ex + 24 && c[1][2] === ey + 28),
      'у трупа (' + x.kind + ') нет уровня в центре');
  }
});

// =====================================================================
// Задача 000213. БОЙ: голубая рамка вокруг Флогистона в его ход.
// =====================================================================
// ТЗ (tasks/pending/000213.md, одна строка): «На поле боя рисовать
// голубую рамку вокруг Флогистона в случае его хода». Расширяет
// «голубая = активный» (000197) с союзников на героя. Контракт —
// memory/000213-hero-turn-frame.md (ВЫТЕСНЯЕТ 000197 §2 «у героя
// рамок нет ни в каком состоянии — ТЗ: NPC и Эфир» и §4 «рамка у
// героя — отдельная задача» для состояния «его ход»; старый файл НЕ
// переписывается — 000197 закоммичена в master).
//
// Формула «его ход» — бит-в-бит зеркало isCurrent ally-ветви (000197):
// !c.result && c.turnOrder && c.turnOrder[c.turnIndex] === 'player'
// + c.player.alive (зеркало u.alive && !u.fled; white-box deadPlayer).
// Геометрия — зеркало рамки активного союзника: strokeRect
// (hx+4.5, hy+4.5, 39, 39), hx = px*48, lineWidth 2, strokeStyle
// ALLY_MARKER '#8cf2fc' (НОВЫХ ЦВЕТОВ НЕТ). Слой — ПОСЛЕ
// спрайта/фолбэка и миниполосы HP (поверх, паттерн ally-ветви).
// Подложки 44×44 герою НЕТ (ТЗ: только «рамка» — «не больше, чем ТЗ»).
// Единственная точка кода — hero-ветвь drawUnits (src/combat-ui.js);
// ядро/модули/ассеты/index.html — без правок.
//
// RED-фаза (этот коммит): CU213-A/B падают на ТЕКУЩЕМ коде
// осмысленно (в hero-ветви drawUnits strokeRect-рамки НЕТ: вызов не
// найден, счёт strokeStyle '#8cf2fc' за окно = 0 — не крах/синтаксис).
// Гварды CU213-C/D/E/F — зелёные с первого дня (не-ход, c.result,
// мёртвый герой, без sprites.js); после реализации ловят «перечинку».
// Фикстуры — scene84/scene166/addMerc84/tickSlice/styledCalls/
// underlayAt166, NOW84. Счёт стилей — ЗА ОДИН рендер-окно
// (tickSlice). Координаты героя — ДИНАМИЧЕСКИ (c.px/c.py — pre-roll
// двигает, паттерн 000166); вершина фолбэк-ромба — moveTo
// (центр клетки, −CELL·0.3) (сеточные moveTo не путать).
// =====================================================================

test('боевой UI: 000213 — ход Флогистона: голубая рамка 39×39 на клетке героя (hx+4.5, hy+4.5, lw 2, strokeStyle #8cf2fc ровно 1 за окно); подложки 44×44 герою НЕТ; 41×41 нигде; без лоадера — рамка поверх ромба (CU213-A)', () => {
  // Сцена БЕЗ Эфира: turnOrder ['m0','player'], turnIndex 1 →
  // активен player. targetId = null — без жёлтой цели (нет
  // коллизии геометрии 39×39 на клетке моба).
  const S = scene84();
  S.c.targetId = null;
  assert.equal(S.c.turnOrder[S.c.turnIndex], 'player',
    'фикстура: активен player (его ход): '
    + JSON.stringify(S.c.turnOrder) + ' @' + S.c.turnIndex);
  assert.ok(S.c.player.alive, 'фикстура: герой жив');
  assert.ok(!S.c.result, 'фикстура: бой не окончен');
  const hx = S.c.px * 48, hy = S.c.py * 48;
  const t = tickSlice(S.canvas, S.rafStubs);
  const iFrame = t.calls.findIndex((c) => c[0] === 'strokeRect'
    && c[1][0] === hx + 4.5 && c[1][1] === hy + 4.5
    && c[1][2] === 39 && c[1][3] === 39);
  assert.ok(iFrame >= 0,
    'голубая рамка 39×39 (hx+4.5, hy+4.5) на клетке героя — ЕСТЬ '
    + '(000213): strokeRect окна '
    + JSON.stringify(t.calls.filter((c) => c[0] === 'strokeRect')));
  assert.equal(t.calls.filter((c) => c[0] === 'strokeRect'
    && c[1][0] === hx + 4.5 && c[1][1] === hy + 4.5
    && c[1][2] === 39 && c[1][3] === 39).length, 1,
    'рамка 39×39 на клетке героя — ровно 1 (не дважды)');
  assert.equal(t.styleCalls.filter((s) => s[0] === 'strokeStyle'
    && s[1] === '#8cf2fc').length, 1,
    'strokeStyle #8cf2fc за окно — ровно 1 (рамка героя)');
  const styled = styledCalls(t.events);
  const blue = styled.find((c) => c.name === 'strokeRect'
    && c.args[0] === hx + 4.5 && c.args[1] === hy + 4.5
    && c.args[2] === 39 && c.args[3] === 39);
  assert.ok(blue, 'рамка в едином логе (цвет в момент вызова)');
  assert.equal(blue.strokeStyle, '#8cf2fc',
    'strokeStyle — #8cf2fc (ALLY_MARKER) в момент вызова');
  // lineWidth 2 (декодер lineWidthSets, паттерн CU182-LW).
  const e0 = S.canvas.events.length - t.events.length;
  let lw = 1;
  for (const [v, evIdx] of S.canvas.lineWidthSets)
    if (evIdx <= e0) lw = v;
  const inSlice = S.canvas.lineWidthSets
    .filter(([v, evIdx]) => evIdx > e0)
    .map(([v, evIdx]) => [v, evIdx - e0])
    .sort((a, b) => a[1] - b[1]);
  for (let i = 0; i < t.events.length; i++) {
    const ev = t.events[i];
    if (ev.s) continue;
    while (inSlice.length && inSlice[0][1] <= i) lw = inSlice.shift()[0];
    if (ev.c[0] === 'strokeRect'
      && ev.c[1][0] === hx + 4.5 && ev.c[1][1] === hy + 4.5
      && ev.c[1][2] === 39 && ev.c[1][3] === 39) {
      assert.equal(lw, 2,
        'lineWidth — 2 (зеркало рамки активного союзника)');
    }
  }
  // «Не больше, чем ТЗ»: подложка 44×44 герою НЕ даётся (пара
  // «подложка+рамка» 000197 — только у союзников).
  assert.ok(!t.calls.some((c) => c[0] === 'fillRect'
    && c[1][0] === hx + 2 && c[1][1] === hy + 2
    && c[1][2] === 44 && c[1][3] === 44),
    'подложки 44×44 на клетке героя НЕТ (ТЗ: только рамка)');
  assert.ok(!t.calls.some((c) => c[0] === 'strokeRect'
    && c[1][2] === 41 && c[1][3] === 41),
    'кольца хода 41×41 нигде (000199 L4: «чей ход» — рамка)');
  // Фолбэк-сцена (без лоадера): ромб героя на месте, рамка ПОВЕРХ
  // (рамка не зависит от спрайтов — контракт §2).
  const s = 48 * 0.3;
  const iDiamond = t.calls.findIndex((c) => c[0] === 'moveTo'
    && c[1][0] === (S.c.px + 0.5) * 48
    && c[1][1] === (S.c.py + 0.5) * 48 - s);
  assert.ok(iDiamond >= 0, 'фолбэк-ромб героя (верхняя вершина)');
  assert.ok(iFrame > iDiamond,
    'рамка ПОСЛЕ ромба (поверх, паттерн ally-ветви)');
});

test('боевой UI: 000213 — z-порядок: рамка — ПОСЛЕДНИЙ вызов героя (спрайт → миниполоса HP → рамка поверх) (CU213-B)', () => {
  // Сцена со спрайтом героя (лоадер): player активен (дефолт).
  // Золотая последовательность hero-ветви: drawImage-спрайт →
  // миниполоса (трек + заполнение, bw×4) → strokeRect-рамка.
  const S = scene84({
    loader: [['assets/sprites/phlogiston/idle_', { __fake: 'hero' }]],
  });
  S.c.targetId = null;
  assert.equal(S.c.turnOrder[S.c.turnIndex], 'player',
    'фикстура: активен player: ' + JSON.stringify(S.c.turnOrder)
    + ' @' + S.c.turnIndex);
  const t = tickSlice(S.canvas, S.rafStubs);
  const iSprite = t.calls.findIndex((c) => c[0] === 'drawImage'
    && c[1][0] && c[1][0].__fake === 'hero');
  assert.ok(iSprite >= 0, 'спрайт героя нарисован (drawImage)');
  // Миниполоса спрайт-ветки: bw = round(CELL·1.15), кламп в
  // ЛОГИЧЕСКОЕ поле (формула hero-ветви; ревью 000047/000151).
  const size = 48 * 1.15;
  const hx = (S.c.px + 0.5) * 48, hy = (S.c.py + 0.5) * 48;
  const bw = Math.round(size);
  const bx = Math.max(2, Math.min(S.c.width * 48 - bw - 2,
    Math.round(hx - bw / 2)));
  const by = Math.max(2, Math.round(hy - size / 2 - 8));
  const barIdx = [];
  t.calls.forEach(([n, a], i) => {
    if (n === 'fillRect' && a[0] === bx && a[1] === by
      && a[2] === bw && a[3] === 4) barIdx.push(i);
  });
  assert.equal(barIdx.length, 2,
    'миниполоса героя: трек + заполнение (' + bx + ', ' + by + ', '
    + bw + '×4)');
  const iFrame = t.calls.findIndex((c) => c[0] === 'strokeRect'
    && c[1][0] === S.c.px * 48 + 4.5 && c[1][1] === S.c.py * 48 + 4.5
    && c[1][2] === 39 && c[1][3] === 39);
  assert.ok(iFrame >= 0,
    'рамка 39×39 на клетке героя (000213): strokeRect окна '
    + JSON.stringify(t.calls.filter((c) => c[0] === 'strokeRect')));
  assert.ok(iFrame > iSprite && iFrame > barIdx[0] && iFrame > barIdx[1],
    'рамка ПОСЛЕ спрайта и миниполосы (поверх): iFrame ' + iFrame
    + ' vs iSprite ' + iSprite + ', бары ' + JSON.stringify(barIdx));
  // Рамка — ПОСЛЕДНИЙ слой героя: после неё герой-вызовов нет.
  assert.ok(!t.calls.slice(iFrame + 1).some(([n, a]) => (n
      === 'drawImage' && a[0] && a[0].__fake === 'hero')
    || (n === 'fillRect' && a[0] === bx && a[1] === by
      && a[2] === bw && a[3] === 4)),
    'после рамки герой-вызовов нет (рамка — последний вызов ветви)');
});

test('боевой UI: 000213 — НЕ ход Флогистона: на клетке героя рамки нет — (а) активен Эфир (дефолт), (б) активен наёмник; 41×41 нигде (CU213-C)', () => {
  // Гвард «слот, не фаза» (контракт §2): на ходу Эфира/наёмника
  // (тоже c.phase === 'player') рамка — у активного СОЮЗНИКА
  // (000197 бит-в-бит), у героя — нет.
  const noFrameOnHero = (t, x, y) =>
    !t.calls.some((c) => c[0] === 'strokeRect'
      && c[1][0] === x + 4.5 && c[1][1] === y + 4.5
      && c[1][2] === 39 && c[1][3] === 39)
    && !t.calls.some((c) => c[0] === 'strokeRect'
      && c[1][0] === x + 2.5 && c[1][1] === y + 2.5
      && c[1][2] === 41 && c[1][3] === 41);
  // (а) Активен Эфир (дефолт сцены с Эфиром: turnIndex 0).
  let S = scene84({ efir: true });
  S.c.targetId = null;
  assert.equal(S.c.turnOrder[S.c.turnIndex], 'efir',
    'фикстура: активен Эфир: ' + JSON.stringify(S.c.turnOrder)
    + ' @' + S.c.turnIndex);
  const t1 = tickSlice(S.canvas, S.rafStubs);
  assert.ok(noFrameOnHero(t1, S.c.px * 48, S.c.py * 48),
    '(а) активен Эфир — на клетке героя рамок нет (ни 39×39, ни 41×41)');
  assert.ok(!t1.calls.some((c) => c[0] === 'strokeRect'
    && c[1][2] === 41 && c[1][3] === 41),
    '(а) кольца 41×41 нигде (000199 L4)');
  // (б) Активен наёмник (turnIndex → его слот).
  S = scene84();
  const merc = addMerc84(S.c, S.G, 5, 2, 'ranged');
  S.c.targetId = null;
  S.c.turnIndex = S.c.turnOrder.indexOf(merc.id);
  assert.equal(S.c.turnOrder[S.c.turnIndex], merc.id,
    'фикстура: активен наёмник: ' + JSON.stringify(S.c.turnOrder)
    + ' @' + S.c.turnIndex);
  const t2 = tickSlice(S.canvas, S.rafStubs);
  assert.ok(noFrameOnHero(t2, S.c.px * 48, S.c.py * 48),
    '(б) активен наёмник — на клетке героя рамок нет (ни 39×39, ни 41×41)');
  assert.ok(!t2.calls.some((c) => c[0] === 'strokeRect'
    && c[1][2] === 41 && c[1][3] === 41),
    '(б) кольца 41×41 нигде (000199 L4)');
});

test('боевой UI: 000213 — бой окончен (c.result; turnIndex застыл на слоте «player», герой жив): голубой рамки нет; подложки 44×44 на клетке героя НЕТ (CU213-D)', () => {
  // Гвард !c.result (зеркало isCurrent ally: на result рамка гаснет,
  // как у союзников). White-box c.result: слот 'player' активен
  // (дефолт сцены без Эфира), герой жив — без гейта !c.result
  // рамка бы горела на оконченном бою.
  const S = scene84();
  S.c.targetId = null;
  assert.equal(S.c.turnOrder[S.c.turnIndex], 'player',
    'фикстура: слот «player» активен (turnIndex): '
    + JSON.stringify(S.c.turnOrder) + ' @' + S.c.turnIndex);
  assert.ok(S.c.player.alive, 'фикстура: герой жив');
  S.c.result = { outcome: 'victory' };
  assert.ok(S.c.result, 'фикстура: бой окончен (white-box)');
  const hx = S.c.px * 48, hy = S.c.py * 48;
  const t = tickSlice(S.canvas, S.rafStubs);
  const styled = styledCalls(t.events);
  const blueOnHero = styled.filter((c) => c.name === 'strokeRect'
    && c.args[0] === hx + 4.5 && c.args[1] === hy + 4.5
    && c.args[2] === 39 && c.args[3] === 39
    && c.strokeStyle === '#8cf2fc');
  assert.equal(blueOnHero.length, 0,
    'c.result — голубой рамки героя нет (гейт !c.result, как у '
    + 'союзников)');
  assert.ok(!t.calls.some((c) => c[0] === 'fillRect'
    && c[1][0] === hx + 2 && c[1][1] === hy + 2
    && c[1][2] === 44 && c[1][3] === 44),
    'подложки 44×44 на клетке героя НЕТ (ТЗ: только рамка — «не '
    + 'больше, чем ТЗ»)');
});

test('боевой UI: 000213 — мёртвый герой (scene166 deadPlayer, слот «player» активен): голубой рамки НЕТ (alive-гейт); ранний проход 000166 бит-в-бит (подложка 44×44 на месте) (CU213-E)', () => {
  // Гвард c.player.alive (контракт §2): в white-box сцене c.result
  // НЕ возникает, а слот 'player' активен — без alive-гейта рамка бы
  // горела на трупе. Жёлтое кольцо 000166 ('#ffe27a') на клетке
  // героя НЕ путать: ассерт color-aware (#8cf2fc).
  const S = scene166({ deadPlayer: true });
  assert.ok(!S.c.player.alive, 'фикстура: герой мёртв');
  S.c.turnIndex = S.c.turnOrder.indexOf('player');
  assert.equal(S.c.turnOrder[S.c.turnIndex], 'player',
    'фикстура: слот «player» активен: ' + JSON.stringify(S.c.turnOrder)
    + ' @' + S.c.turnIndex);
  assert.ok(!S.c.result, 'фикстура: c.result не возникает (R-8)');
  const hx = S.c.px * 48, hy = S.c.py * 48;
  const t = tickSlice(S.canvas, S.rafStubs);
  const styled = styledCalls(t.events);
  const blueOnHero = styled.filter((c) => c.name === 'strokeRect'
    && c.args[0] === hx + 4.5 && c.args[1] === hy + 4.5
    && c.args[2] === 39 && c.args[3] === 39
    && c.strokeStyle === '#8cf2fc');
  assert.equal(blueOnHero.length, 0,
    'голубой рамки 39×39 на МЁРТВОМ герое НЕТ (гейт c.player.alive)');
  assert.ok(underlayAt166(t.events, hx, hy),
    'бит-в-бит: подложка раннего прохода 000166 на клетке мёртвого '
    + 'героя на месте (рамка и ранний проход НЕ совмещаются)');
});

test('боевой UI: 000213 — без sprites.js (loadCombatUi(false)): фолбэк-ромб на ходу героя, рендер не падает, console.error = 0; голубые strokeRect в окне — только рамка героя 39×39 на его клетке (0 или 1); 41×41 нигде (CU213-F)', () => {
  // Гвард деградации (контракт §3): рамка НЕ зависит от спрайтов —
  // сцена БЕЗ sprites.js вовсе (G.phlogistonFrames отсутствует →
  // фолбэк-ромб; G-снапшот без модуля — чистая деградация). Ассерт
  // «0 или 1 на клетке героя» — зелёный с первого дня (сейчас 0)
  // и после реализации (1 — на клетке героя, в другой клетке/форме
  // — нет).
  const rafStubs = makeRafStubs();
  const { G, body } = loadCombatUi(false, {
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
    });
  } finally {
    console.error = realError;
  }
  assert.ok(c, 'бой создан (деградация, не крах)');
  console.error = (m) => errors.push(String(m));
  let t = null;
  try {
    c.targetId = null;
    assert.equal(c.turnOrder[c.turnIndex], 'player',
      'фикстура: активен player: ' + JSON.stringify(c.turnOrder)
      + ' @' + c.turnIndex);
    t = tickSlice(findCanvas(body), rafStubs);
  } finally {
    console.error = realError;
  }
  assert.equal(errors.length, 0,
    'console.error = 0 (рамка в лог ничего не пишет): '
    + JSON.stringify(errors));
  const hx = c.px * 48, hy = c.py * 48;
  const s = 48 * 0.3;
  assert.ok(t.calls.some((cv) => cv[0] === 'moveTo'
    && cv[1][0] === (c.px + 0.5) * 48
    && cv[1][1] === (c.py + 0.5) * 48 - s),
    'фолбэк-ромб героя на месте (верхняя вершина, без sprites.js)');
  const styled = styledCalls(t.events);
  const blueRects = styled.filter((cv) => cv.name === 'strokeRect'
    && cv.strokeStyle === '#8cf2fc');
  assert.ok(blueRects.length <= 1,
    'голубых strokeRect за окно — не больше 1 (рамка героя): '
    + JSON.stringify(blueRects.map((x) => x.args)));
  for (const cv of blueRects) {
    assert.equal(cv.args[0], hx + 4.5, 'рамка — на клетке героя (x)');
    assert.equal(cv.args[1], hy + 4.5, 'рамка — на клетке героя (y)');
    assert.equal(cv.args[2], 39, 'рамка 39×39 (w)');
    assert.equal(cv.args[3], 39, 'рамка 39×39 (h)');
  }
  assert.ok(!t.calls.some((cv) => cv[0] === 'strokeRect'
    && cv[1][2] === 41 && cv[1][3] === 41),
    'кольца 41×41 нигде (000199 L4)');
});

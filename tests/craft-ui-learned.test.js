// Задача 000232: «неизученные рецепты НЕ отображаются в диалогах
// крафта» (ТЗ строка 1).
//
// Контракты — memory/000232-craft-learned-kinds.md D0b/D4:
//   * render() src/craft-ui.js — фильтр рецептов:
//     r.здания.includes(building.id) ∩
//     (C.isTypeLearned ? C.isTypeLearned(hero, r.тип) : true);
//   * после фильтра 0 рецептов — строка-подсказка .craft-hint,
//     ДВА текста (контракт D4, правки по ревью): НИ ОДНОГО вида не
//     изучено (UCL-1) — «Виды крафта не изучены. Свитки и чертежи
//     (торговцы, сундуки, лут мобов) открывают целый вид.»; изучены
//     есть, но не этого здания (UCL-4) — «В этом здании нет
//     изученных видов крафта.»;
//   * секции с 0 рецептов и заголовки неизученных типов НЕ
//     показываются (никакого контента неизученного);
//   * строка «Крафт» у постройки в оверлее здания — НЕ гаснет
//     (скроуп строки здания — за задачами building-effects, здесь
//     только тело экрана).
//
// КРАСНЫЕ — 3 (expectedRedCount = 3): фильтра нет — ВСЕ виды здания
// показываются, подсказки нет. Падение — по СЧЁТУ/СОСТАВУ/ТЕКСТУ
// (assertion), не SyntaxError/крах: цепочка до craft-ui.js
// (включая его) грузится чисто — «ошибок при загрузке 0» первым
// ассертом каждого теста:
//   * UCL-1: свежий герой, Рунический камень (40: 9 рецептов, 2 вида)
//     — сейчас 9 строк / 2 секции; ожидаемо 0 / 0 + .craft-hint;
//   * UCL-2: изучена рунопись — сейчас 9 строк; ожидаемо ровно 2
//     (рунопись), без секции «резьба_по_камню»;
//   * UCL-3: изучены кузнечное_дело + рунопись, Дом кузнеца (25:
//     кузнечное 4 + зачарование 2) — сейчас 6 строк; ожидаемо ровно 4
//     (кузнечное), без зачарования; building-intersection сохранён.
//
// Механика — ДУБЛЬ ЧАСТИ B tests/spells-any-party.test.js (000147) и
// tests/unlearned-spells-hidden.test.js (000231): makeEl/findAll/
// matchesSel, loadEnv с ДИНАМИЧЕСКИМ CHAIN (до craft-ui.js —
// саморегистрация спец-действия 'craft' при загрузке; лоадер МЕЖДУ
// ФАЗАМИ не правится), open({building, hero}) — прямое API
// Game.craftUI (UMD, корень Game).
//
// Cross-realm (vm): пины — примитивы/текст/длины (правило 000082);
// массивы песочницы — через [...arr] в host-массив.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const page = () => fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// --- Минимальный DOM-стаб с деревом (дубль tests/spells-any-party.
// test.js ЧАСТЬ B / 000231) ---

function matchesSel(el, sel) {
  const m = /^([a-zA-Z][\w-]*)\[([\w-]+)(?:=([^\]]+))?\]$/.exec(sel);
  if (m) {
    if (String(el.tagName || '').toLowerCase() !== m[1].toLowerCase()) {
      return false;
    }
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
  // textContent = '' — как в DOM, сбрасывает детей (render() экрана
  // обновляет bodyEl in place: bodyEl.textContent = '').
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

// ДИНАМИЧЕСКИЙ CHAIN: ВСЕ <script src> index.html до craft-ui.js
// включительно. Новый script-тег (по ТЗ НЕТ — index-order)
// подхватывался бы САМ; лоадер МЕЖДУ ФАЗАМИ не правится.
const CHAIN = (() => {
  const all = Array.from(
    page().matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1]);
  const i = all.indexOf('src/craft-ui.js');
  assert.ok(i >= 0, 'craft-ui.js подключён в index.html');
  return all.slice(0, i + 1);
})();

// Загрузка цепочки в vm-песочницу → { G, body, errors, sandbox }.
function loadEnv() {
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
  for (const f of CHAIN) vm.runInContext(src(f), sandbox,
    { filename: f });
  return { G: sandbox.Game, body: document.body, errors, sandbox };
}

// --- Фикстуры ---

function buildingOf(env, id) {
  const b = env.G.BUILDINGS.find((x) => x && x.id === id);
  assert.ok(b, 'постройка ' + id + ' в каталоге (G.BUILDINGS)');
  return b;
}

// Изучить вид: ПОЛНЫЙ путь (чертёж → addItem → useItem). Красная
// стадия — предмета нет в каталоге (CR-2..CR-5) → прямая пометка
// состояния c.craftTypes: краснота UCL остаётся на ФИЛЬТРЕ
// отображения (ТЗ строка 1), а не на каталоге предметов.
function learnViaBlueprint(env, c, bpId, type) {
  const add = env.G.addItem(c, bpId, 1);
  if (add && add.ok) {
    const r = env.G.useItem(c, bpId);
    assert.ok(r && r.ok, 'useItem ' + bpId + ': ' + JSON.stringify(r));
  } else {
    c.craftTypes = c.craftTypes || {};
    c.craftTypes[type] = true;
  }
  const learned = env.G.Craft.isTypeLearned
    ? env.G.Craft.isTypeLearned(c, type)
    : !!(c.craftTypes && c.craftTypes[type]);
  assert.ok(learned, 'фикстура: вид «' + type + '» изучен');
}

// Оверлей крафта (маркер .craft-overlay на .combat-overlay).
function findOverlay(env) {
  const ov = findAll(env.body, '.craft-overlay')[0];
  assert.ok(ov, 'оверлей крафта открыт (.craft-overlay в body)');
  return ov;
}

// id рецептов на экране — dataset.recipe кнопок «изготовить»
// (одна на строку, .cp-btn).
function shownRecipes(ov) {
  return findAll(ov, '.cp-btn')
    .filter((b) => b.dataset.craftact === 'craft')
    .map((b) => b.dataset.recipe);
}

// Ожидаемые id — data-driven по каталогу (здания ∩ виды).
function expectIds(env, buildingId, types) {
  return env.G.Craft.CRAFT
    .filter((r) => r.здания.includes(buildingId) && types.includes(r.тип))
    .map((r) => r.id).sort();
}

// Полный текст узла (рекурсивно) — для негативных пинов.
function textOf(node) {
  let s = node._text || '';
  for (const ch of node.children || []) s += textOf(ch);
  return s;
}

test('UCL-1: свежий герой — диалог крафта (Рунический камень, 40: 9 рецептов, 2 вида): 0 .craft-recipe, 0 .craft-type, подсказка .craft-hint (текст контракта D4); RED: 9 строк / 2 секции — фильтра нет', () => {
  const env = loadEnv();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  assert.ok(env.G.craftUI, 'Game.craftUI создан (craft-ui.js в CHAIN)');
  const c = env.G.createCharacter();
  const b = buildingOf(env, 40);
  env.G.craftUI.open({ building: b, hero: c });
  assert.equal(env.errors.length, 0,
    'open: 0 ошибок: ' + env.errors.join('; '));
  const ov = findOverlay(env);
  assert.equal(findAll(ov, '.craft-recipe').length, 0,
    '000232: свежий герой — 0 строк рецептов; RED: 9 (фильтра нет)');
  assert.equal(findAll(ov, '.craft-type').length, 0,
    '000232: ни одной секции (заголовков неизученных типов НЕТ); '
    + 'RED: 2');
  const hint = ov.querySelector('.craft-hint');
  assert.ok(hint,
    '000232: подсказка .craft-hint на пустом экране (RED: нет)');
  assert.equal(hint.textContent,
    'Виды крафта не изучены. Свитки и чертежи (торговцы, сундуки, лут мобов) открывают целый вид.',
    'текст подсказки (контракт D4)');
  assert.equal(env.errors.length, 0, '0 ошибок: ' + env.errors.join('; '));
});

test('UCL-2: после чертёжа рунописи — ТОЛЬКО рецепты этого вида (Рунический камень, 40: ровно 2 строки, id data-driven); секции/заголовка «резьба_по_камню» (7 рецептов) НЕТ; подсказки нет (рецепты есть); RED: 9 строк — все виды', () => {
  const env = loadEnv();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  const c = env.G.createCharacter();
  learnViaBlueprint(env, c, 'blueprint_runecraft', 'рунопись');
  const b = buildingOf(env, 40);
  env.G.craftUI.open({ building: b, hero: c });
  assert.equal(env.errors.length, 0,
    'open: 0 ошибок: ' + env.errors.join('; '));
  const ov = findOverlay(env);
  assert.equal(findAll(ov, '.craft-recipe').length, 2,
    '000232: только рунопись (2); RED: 9 — все виды здания');
  assert.deepEqual([...shownRecipes(ov)].sort(),
    [...expectIds(env, 40, ['рунопись'])],
    'показаны РОВНО рецепты рунописи здания 40 (data-driven); '
    + 'RED: + 7 резьбы_по_камню');
  assert.equal(findAll(ov, '.craft-type').length, 1,
    'ровно 1 секция (изученный вид); RED: 2');
  const t = textOf(ov);
  assert.ok(t.includes('рунопись'), 'заголовок изученного вида — рунопись');
  assert.ok(!t.includes('резьба_по_камню'),
    '000232: неизученная «резьба_по_камню» — ни заголовка ни строк; '
    + 'RED: видна');
  assert.equal(ov.querySelector('.craft-hint'), null,
    'подсказка НЕ показана (рецепты есть)');
  assert.equal(env.errors.length, 0, '0 ошибок: ' + env.errors.join('; '));
});

test('UCL-3: 2 изученных вида (кузнечное_дело + рунопись) — Дом кузнеца (25: кузнечное_дело 37 + зачарование 2; ре-пин 000230.08: +11 head-рецептов; ре-пин 000230.11: +22 руки): ТОЛЬКО кузнечное (ровно 37 строк, id data-driven — объединение ∩ здание), неизученного зачарования ни заголовка ни строк; building-intersection сохранён (только рецепты здания 25); RED: 17 строк — зачарование видно', () => {
  const env = loadEnv();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  const c = env.G.createCharacter();
  learnViaBlueprint(env, c, 'blueprint_forge', 'кузнечное_дело');
  // 2-й изученный вид — рецептов в здании 25 нет (union ∩ здание):
  c.craftTypes = c.craftTypes || {};
  c.craftTypes['рунопись'] = true;
  const b = buildingOf(env, 25);
  env.G.craftUI.open({ building: b, hero: c });
  assert.equal(env.errors.length, 0,
    'open: 0 ошибок: ' + env.errors.join('; '));
  const ov = findOverlay(env);
  assert.equal(findAll(ov, '.craft-recipe').length, 37,
    '000232: объединение — кузнечное_дело (37, ре-пин 000230.08: '
    + '+11 head; ре-пин 000230.11: +22 руки); '
    + 'RED: 17 — + зачарование');
  assert.deepEqual([...shownRecipes(ov)].sort(),
    [...expectIds(env, 25, ['кузнечное_дело'])],
    'РОВНО кузнечные рецепты здания 25 (объединение ∩ здание, '
    + 'data-driven); RED: + 2 зачарования');
  assert.equal(findAll(ov, '.craft-type').length, 1,
    'секции — только у вида с рецептами (рунопись изучена, но в '
    + 'здании 25 её рецептов нет — секции нет); RED: 2');
  const t = textOf(ov);
  assert.ok(t.includes('кузнечное_дело'), 'заголовок — кузнечное_дело');
  assert.ok(!t.includes('зачарование'),
    '000232: неизученное «зачарование» — ни заголовка ни строк; '
    + 'RED: видно');
  assert.equal(env.errors.length, 0, '0 ошибок: ' + env.errors.join('; '));
});

test('UCL-4 (правки по ревью 000232): изучена рунопись (рецепты — здание 40), открыт Дом кузнеца (25: кузнечное_дело + зачарование): 0 .craft-recipe, 0 .craft-type, подсказка .craft-hint — НЕЙТРАЛЬНЫЙ текст «В этом здании нет изученных видов крафта.» (виды-то изучены, просто не этого здания; старая формулировка «не изучены» игроку не точна)', () => {
  const env = loadEnv();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  const c = env.G.createCharacter();
  learnViaBlueprint(env, c, 'blueprint_runecraft', 'рунопись');
  const b = buildingOf(env, 25);
  env.G.craftUI.open({ building: b, hero: c });
  assert.equal(env.errors.length, 0,
    'open: 0 ошибок: ' + env.errors.join('; '));
  const ov = findOverlay(env);
  assert.equal(findAll(ov, '.craft-recipe').length, 0,
    'рунописи в здании 25 нет — 0 строк рецептов');
  assert.equal(findAll(ov, '.craft-type').length, 0,
    'изученного вида нет в этом здании — 0 секций');
  const hint = ov.querySelector('.craft-hint');
  assert.ok(hint,
    '000232-ревью: подсказка .craft-hint на пустом экране');
  assert.equal(hint.textContent,
    'В этом здании нет изученных видов крафта.',
    'нейтральный текст: изучены, но не этого здания (контракт D4)');
  assert.equal(env.errors.length, 0, '0 ошибок: ' + env.errors.join('; '));
});

// Задача 000355 — КРАСНЫЕ ТЕСТЫ (TDD): полёт стрелы из лука виден на поле
// боя (стартовый и конечный концы — в прямоугольнике поля и совпадают с
// центрами клеток стрелка/цели; угол соответствует вектору; вспышка удара
// и выпад живые).
//
// КОРЕНЬ (memory/000355-arrow-flight.md, исправляет ложную D11 из
// memory/000248-combat-attack-fx.md): в реальном CSSOM у style НЕТ
// именованных свойств для custom properties — присваивание
// `el.style['--fx-x0'] = v` создаёт только JS-expando и НИКОГДА не
// попадает в cascade; единственный путь — `style.setProperty('--fx-x0',v)`.
// На HEAD все 10 --fx-*_vars не определены в браузере → IACVT: left/top
// стрелы = auto (static-угол слоя — «рисует вне поля»), keyframes
// нейтрализованы (полёта нет), animation удара = none (вспышки нет),
// transform выпадения = none.
//
// ГЛАВНЫЙ ДЕФЕКТ ПРЕДЫДУЩИХ ХАРНЕСЕЙ (почему 000248-пины были
// вакуумно-зелёными): style-мок — plain object, bracket-запись
// round-trip'ится. Здесь style — БРАУЗЕРНО-ВЕРНЫЙ makeStyle000355:
// getPropertyValue видит ТОЛЬКО setProperty; bracket-запись '--x' —
// expando, getPropertyValue её НЕ видит; реальные свойства — видны обоими
// способами. Это и отличает «значение задано в cascade» от «значение
// записано в JS-мусорку».
//
// ГЕОМЕТРИЯ: слой .combat-atk-layer ≡ border-box canvas-поля (формула
// min(100vh-32px, 100vw-304px) — пин AF6 сверяет слой С canvas напрямую,
// база + portrait) ⇒ % слоя == % поля ⇒ независимый пересчёт центров
// клеток идёт из c.width/c.height (логическое поле).
//
// КРАСНЫЕ на HEAD: AF1, AF2, AF4, AF5 (getPropertyValue('--fx-*') === ''),
// AF6 (translate(-50%, -50%) в transform стрелы нет — якорь угла вместо
// центра клетки). ЗЕЛЁНЫЕ с начала (гарды): AF3 (инлайн left/top = старт
// полёта), CSS-подпины AF6, потребляемость var() в keyframes/hit/lunge.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const page = () => fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const CHAIN_000355 = (() => {
  const all = Array.from(
    page().matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
    .map((p) => p.replace(/^src\//, ''));
  const i = all.indexOf('combat-ui.js');
  assert.ok(i >= 0, 'combat-ui.js подключён в index.html');
  return all.slice(0, i + 1);
})();

// --- Браузерно-верный CSSStyleDeclaration-стаб -------------------------
// Инварианты (реальный браузер):
//  * setProperty('--x', v) → cascade; getPropertyValue('--x') === v.
//  * bracket `style['--x'] = v` → JS-expando: bracket-чтение отдаёт,
//    getPropertyValue — '' (custom properties НЕ именованные свойства).
//  * Реальные свойства: bracket-запись видна и bracket-чтением, и
//    getPropertyValue('kebab'); setProperty('left', v) видна style.left.
//  * Методы — НЕ перечислимы (Object.keys(style) — только декларации).

function camelName000355(name) {
  return String(name).replace(/-+([a-z0-9])/g, (_, ch) => ch.toUpperCase());
}

function makeStyle000355() {
  const custom = new Map();
  const style = {};
  const def = (name, fn) => Object.defineProperty(style, name, {
    value: fn, enumerable: false, writable: true, configurable: true,
  });
  def('setProperty', (name, value) => {
    const n = String(name);
    const v = value === undefined || value === null ? '' : String(value);
    if (n.startsWith('--')) custom.set(n, v);
    else style[camelName000355(n)] = v;
  });
  def('getPropertyValue', (name) => {
    const n = String(name);
    if (n.startsWith('--')) {
      const v = custom.get(n);
      return v === undefined ? '' : v;
    }
    const v = style[camelName000355(n)];
    return v === undefined || v === null ? '' : String(v);
  });
  def('removeProperty', (name) => {
    const n = String(name);
    if (n.startsWith('--')) {
      const v = custom.get(n);
      custom.delete(n);
      return v === undefined ? '' : v;
    }
    const key = camelName000355(n);
    const v = style[key];
    delete style[key];
    return v === undefined || v === null ? '' : String(v);
  });
  return style;
}

// Чтение var() «как браузер»: только cascade (setProperty). '' ⇔ IACVT.
function varOf000355(el, prop) {
  return el.style.getPropertyValue(prop);
}

function matchesSimple000355(el, sel) {
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

function matchesSel000355(el, sel) {
  const parts = String(sel).trim().split(/\s+/);
  if (parts.length === 1) return matchesSimple000355(el, parts[0]);
  if (!matchesSimple000355(el, parts[parts.length - 1])) return false;
  let n = el.parent;
  for (let i = parts.length - 2; i >= 0; i--) {
    if (!n || !matchesSimple000355(n, parts[i])) return false;
    n = n.parent;
  }
  return true;
}

function findAll000355(root, sel) {
  const out = [];
  const walk = (n) => {
    for (const ch of n.children || []) {
      if (matchesSel000355(ch, sel)) out.push(ch);
      walk(ch);
    }
  };
  walk(root);
  return out;
}

function findByClass000355(el, cls) {
  if (String(el.className).split(/\s+/).includes(cls)) return el;
  for (const ch of el.children || []) {
    const found = findByClass000355(ch, cls);
    if (found) return found;
  }
  return null;
}

function makeContext2d000355(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

function makeEl000355(tag) {
  const target = {
    tagName: tag,
    className: '',
    _text: '',
    title: '',
    disabled: false,
    style: makeStyle000355(),
    dataset: {},
    children: [],
    parent: null,
    listeners: {},
    appendChild(ch) {
      const raw = ch && ch.__raw ? ch.__raw : ch;
      if (raw.parent) {
        raw.parent.children.splice(raw.parent.children.indexOf(raw), 1);
      }
      raw.parent = target;
      target.children.push(raw);
      return ch;
    },
    remove() {
      if (!target.parent) return;
      const i = target.parent.children.indexOf(target);
      if (i >= 0) target.parent.children.splice(i, 1);
      target.parent = null;
    },
    addEventListener(type, fn) {
      (target.listeners[type] || (target.listeners[type] = [])).push(fn);
    },
    removeEventListener(type, fn) {
      const a = target.listeners[type];
      if (!a) return;
      const i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    },
    setAttribute(name, value) {
      if (name.startsWith('data-')) target.dataset[name.slice(5)] = value;
    },
    getContext(kind) {
      if (tag !== 'canvas') return null;
      return kind === '2d' ? makeContext2d000355(target) : null;
    },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    get lastChild() {
      return target.children[target.children.length - 1] || null;
    },
    closest(sel) {
      let n = target;
      while (n) {
        if (matchesSel000355(n, sel)) return n;
        n = n.parent;
      }
      return null;
    },
    querySelector(sel) { return findAll000355(target, sel)[0] || null; },
    querySelectorAll(sel) { return findAll000355(target, sel); },
  };
  if (tag === 'canvas') {
    target.width = 0;
    target.height = 0;
  }
  Object.defineProperty(target, 'textContent', {
    get() { return this._text; },
    set(v) {
      this._text = String(v);
      for (const ch of target.children) ch.parent = null;
      target.children.length = 0;
    },
  });
  target.__raw = target;
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return () => undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function makeStorage000355() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// Песочница с мутабельным временем (дубль bootCombat000248).
function bootCombat000355() {
  const errors = [];
  let T = 1000;
  const document = {
    createElement: (tag) => makeEl000355(tag),
    body: makeEl000355('body'),
    getElementById: () => null,
    querySelector: () => null,
    hidden: false,
    addEventListener() {},
    removeEventListener() {},
  };
  const window = {
    addEventListener() {},
    removeEventListener() {},
    localStorage: makeStorage000355(),
  };
  const sandbox = {
    console: {
      log: () => {}, info: () => {}, warn: () => {}, debug: () => {},
      trace: () => {},
      error: (m) => errors.push(String(m)),
    },
    document, window, setTimeout, clearTimeout,
    performance: { now: () => T },
  };
  vm.createContext(sandbox);
  for (const f of CHAIN_000355) {
    vm.runInContext(src(f), sandbox, { filename: f });
  }
  return {
    G: sandbox.Game, body: document.body, errors, sandbox,
    T0: 1000, setT: (v) => { T = v; }, getT: () => T,
  };
}

function overlayOf000355(env) {
  const overlay = findByClass000355(env.body, 'combat-overlay--combat');
  assert.ok(overlay, 'боевой оверлей подвешен к body песочницы');
  return overlay;
}

function atkEls000355(env, cls) {
  return findAll000355(overlayOf000355(env), '.' + cls);
}

// Сцена героя: лук экипирован ДО боя, волк над героем на d=3 (в дальу
// лука 4), rng 0.0, цель выбрана (дубль sceneAttack000248 { bow: true }).
function sceneBow000355() {
  const env = bootCombat000355();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  const hero = env.G.createCharacter();
  env.G.addItem(hero, 'hunting_bow');
  env.G.equip(hero, 'hunting_bow');
  assert.equal(hero.equipment.weapon, 'hunting_bow',
    'фикстура: лук экипирован до боя');
  const c = env.G.combatUI.startCombat({
    hero, mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  assert.ok(c, 'бой начался (build()/render() без исключений)');
  assert.equal(env.errors.length, 0,
    'ошибок после startCombat нет: ' + env.errors.join('; '));
  const m0 = c.units.find((u) => u.side === 'mob');
  assert.ok(m0 && m0.alive && !m0.fled, 'фикстура: живой волк');
  m0.x = c.px;
  m0.y = c.py - 3;
  c._rng = () => 0.0;
  c.selectTarget(m0.id);
  assert.equal(c.targetId, m0.id, 'фикстура: волк выбран целью');
  assert.equal(env.G.activeUnitId(c), 'player', 'фикстура: ход игрока');
  return { env, c, hero, m0 };
}

// Сцена моба: имп (ranged) на d=3 от игрока, «Конец хода» → выстрел
// моба (дубль 000248-MOBR).
function sceneMobImp000355() {
  const env = bootCombat000355();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  const hero = env.G.createCharacter();
  const c = env.G.combatUI.startCombat({
    hero, mobs: ['imp'], mobLevel: 1, seed: 42,
  });
  assert.ok(c, 'бой начался (build()/render() без исключений)');
  const imp = c.units.find((u) => u.side === 'mob');
  assert.ok(imp && imp.alive && !imp.fled, 'фикстура: имп жив');
  imp.x = c.px;
  imp.y = c.py - 3;
  const d = Math.abs(imp.x - c.px) + Math.abs(imp.y - c.py);
  assert.ok(d >= 2 && d <= 4, 'фикстура: имп в дальней полосе; факт: ' + d);
  c._rng = () => 0.0;
  assert.equal(env.G.combatUI.handleCode('Space'), true,
    'фикстура: «Конец хода» consumed (фаза мобов синхронна → render)');
  assert.ok(imp.alive && !imp.fled, 'фикстура: имп жив после фазы');
  assert.ok(c.player.hp < env.G.derived(c.player).maxHP,
    'фикстура: игрок получил урон');
  return { env, c, hero, imp };
}

// Сцена мили: кулаки, волк над героем на d=1 (дубль sceneAttack000248 {}).
function sceneMelee000355() {
  const env = bootCombat000355();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  const hero = env.G.createCharacter();
  const c = env.G.combatUI.startCombat({
    hero, mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  assert.ok(c, 'бой начался (build()/render() без исключений)');
  const m0 = c.units.find((u) => u.side === 'mob');
  assert.ok(m0 && m0.alive && !m0.fled, 'фикстура: живой волк');
  m0.x = c.px;
  m0.y = c.py - 1;
  c._rng = () => 0.0;
  c.selectTarget(m0.id);
  assert.equal(c.targetId, m0.id, 'фикстура: волк выбран целью');
  return { env, c, hero, m0 };
}

// CSS index.html: декларация скоуп-правила (дубль cssDecl000246).
function cssDecl000355(html, sel) {
  const selRe = sel.split(/\s+/)
    .map((p) => p.replace(/\./g, '\\.')).join('\\s+');
  const m = html.match(new RegExp(selRe + '\\s*{([^}]*)}'));
  assert.ok(m, 'CSS-правило ' + sel + ' найдено в index.html');
  const decls = {};
  for (const part of m[1].split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const prop = part.slice(0, i).trim().toLowerCase();
    if (prop) decls[prop] = part.slice(i + 1).trim();
  }
  return decls;
}

// Внутренний блок @keyframes (вложенность 1 уровень).
function keyframesBody000355(html, name) {
  const m = html.match(new RegExp(
    '@keyframes\\s+' + name + '\\s*\\{((?:[^{}]|\\{[^{}]*\\})*)\\}'));
  assert.ok(m, '@keyframes ' + name + ' найдено в index.html');
  return m[1];
}

function keyframeStep000355(body, step) {
  const m = body.match(new RegExp(
    '(?:^|\\s)' + step + '\\s*\\{([^}]*)\\}'));
  assert.ok(m, '@keyframes-шаг ' + step + ' найден');
  const decls = {};
  for (const part of m[1].split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const prop = part.slice(0, i).trim().toLowerCase();
    if (prop) decls[prop] = part.slice(i + 1).trim();
  }
  return decls;
}

const NEAR = 0.01;

function pinVarPct000355(el, prop, expected, label) {
  const raw = varOf000355(el, prop);
  assert.notEqual(raw, '',
    label + ': ' + prop + ' ДОЛЖЕН быть в cascade (getPropertyValue '
    + '≠ \'\') — иначе var() в CSS не определён (IACVT: left/top → auto, '
    + 'полёта нет — корень 000355); факт: \'' + raw + '\'');
  assert.ok(/%$/.test(raw),
    label + ': ' + prop + ' — %-строка (% слоя ≡ % поля); факт: ' + raw);
  assert.ok(Math.abs(Number.parseFloat(raw) - expected) < NEAR,
    label + ': ' + prop + ' ≈ ' + expected + '% (независимый пересчёт '
    + 'центров клеток); факт: ' + raw);
  return Number.parseFloat(raw);
}

// --- AF1 (КРАСНЫЙ): концы полёта = центры клеток, в прямоугольнике поля --

test('AF1 (000355): выстрел из лука — стрела в слое; --fx-x0/y0/x1/y1 в cascade (getPropertyValue) и равны независимому пересчёту ЦЕНТРОВ клеток стрелка/цели ((c+0.5)/c.width·100 %); все концы внутри (0,100)% — полёт в прямоугольнике поля, а не в углу слоя', () => {
  const { env, c, m0 } = sceneBow000355();
  assert.equal(env.G.combatUI.handleCode('KeyJ'), true,
    'фикстура: выстрел consumed (r.ok → render)');
  const arrows = atkEls000355(env, 'combat-atk-arrow');
  assert.equal(arrows.length, 1,
    'фикстура: ровно ОДНА .combat-atk-arrow; факт: ' + arrows.length);
  const arrow = arrows[0];
  assert.ok(findByClass000355(overlayOf000355(env), 'combat-atk-layer'),
    'стрела — в общем слое .combat-atk-layer (ребёнок .combat-box)');
  const W = c.width, H = c.height;
  const x0 = pinVarPct000355(arrow, '--fx-x0',
    (c.px + 0.5) / W * 100, 'старт X = центр клетки стрелка');
  const y0 = pinVarPct000355(arrow, '--fx-y0',
    (c.py + 0.5) / H * 100, 'старт Y = центр клетки стрелка');
  const x1 = pinVarPct000355(arrow, '--fx-x1',
    (m0.x + 0.5) / W * 100, 'финиш X = центр клетки цели');
  const y1 = pinVarPct000355(arrow, '--fx-y1',
    (m0.y + 0.5) / H * 100, 'финиш Y = центр клетки цели');
  for (const [v, label] of [[x0, '--fx-x0'], [y0, '--fx-y0'],
    [x1, '--fx-x1'], [y1, '--fx-y1']]) {
    assert.ok(v > 0 && v < 100,
      label + ' — ВНУТРИ поля (0..100% слоя ≡ % поля; «вне поля» = '
      + 'проjection сломана); факт: ' + v + '%');
    assert.notEqual(Number.isNaN(v), true,
      label + ' — число (parseFloat не NaN)');
  }
});

// --- AF2 (КРАСНЫЙ): прямизна и угол ------------------------------------

test('AF2 (000355): выстрел вверх (m0.y = c.py−3, тот же x) — траектория прямая: --fx-x0 === --fx-x1, --fx-y0 ≠ --fx-y1, --fx-angle = atan2 вектора = −90deg (поворот вдоль полёта); на HEAD var не задан → угол/полёт отсутствуют', () => {
  const { env, c, m0 } = sceneBow000355();
  assert.equal(env.G.combatUI.handleCode('KeyJ'), true,
    'фикстура: выстрел consumed');
  const arrow = atkEls000355(env, 'combat-atk-arrow')[0];
  assert.ok(arrow, 'фикстура: стрела есть');
  const x0 = varOf000355(arrow, '--fx-x0');
  const y0 = varOf000355(arrow, '--fx-y0');
  const x1 = varOf000355(arrow, '--fx-x1');
  const y1 = varOf000355(arrow, '--fx-y1');
  assert.notEqual(x0, '',
    '--fx-x0 в cascade (полёт вообще существует); факт: \'' + x0 + '\'');
  assert.equal(x0, x1,
    'выстрель по вертикали: старт и финиш по X совпадают (прямая '
    + 'вертикаль); факт: x0=' + x0 + ', x1=' + x1);
  assert.notEqual(y0, y1,
    'выстрел вверх: Y меняется (полёт есть, а не точка); факт: y0='
    + y0 + ', y1=' + y1);
  const angle = varOf000355(arrow, '--fx-angle');
  const expected = Math.atan2(
    (m0.y + 0.5) / c.height * 100 - (c.py + 0.5) / c.height * 100,
    (m0.x + 0.5) / c.width * 100 - (c.px + 0.5) / c.width * 100,
  ) * 180 / Math.PI;
  assert.notEqual(angle, '',
    '--fx-angle в cascade (rotate(var(--fx-angle)) иначе IACVT → '
    + 'transform:none, стрела не повёрнута); факт: \'' + angle + '\'');
  assert.ok(Math.abs(
    Number.parseFloat(angle) - expected) < NEAR,
    '--fx-angle = atan2 вектора полёта (% квадр. слоя == клетки); '
    + 'ожидали ' + expected + 'deg; факт: ' + angle);
  assert.ok(angle.endsWith('deg'),
    '--fx-angle — deg-строка; факт: ' + angle);
});

// --- AF3 (гард, зелёный на HEAD): инлайн-старт до анимации --------------

test('AF3 (гард 000355): первый кадр до fill-mode — инлайн style.left/top = центр клетки стрелка (% реальные свойства; работали и на HEAD): стрела стартует ВИДИМОЙ в поле, а не в static-углу', () => {
  const { env, c } = sceneBow000355();
  assert.equal(env.G.combatUI.handleCode('KeyJ'), true,
    'фикстура: выстрел consumed');
  const arrow = atkEls000355(env, 'combat-atk-arrow')[0];
  assert.ok(arrow, 'фикстура: стрела есть');
  assert.ok(/%$/.test(String(arrow.style.left)),
    'инлайн left — %-строка (реальное свойство CSSOM); факт: '
    + String(arrow.style.left));
  assert.ok(/%$/.test(String(arrow.style.top)),
    'инлайн top — %-строка; факт: ' + String(arrow.style.top));
  assert.ok(Math.abs(Number.parseFloat(arrow.style.left)
    - (c.px + 0.5) / c.width * 100) < NEAR,
    'инлайн left = центр клетки стрелка (первый кадр); факт: '
    + arrow.style.left);
  assert.ok(Math.abs(Number.parseFloat(arrow.style.top)
    - (c.py + 0.5) / c.height * 100) < NEAR,
    'инлайн top = центр клетки стрелка; факт: ' + arrow.style.top);
});

// --- AF4 (КРАСНЫЙ): вспышка удара и тайминги живые ----------------------

test('AF4 (000355): тайминги в cascade — герой-лук: hit --fx-hit-delay 380ms / --fx-hit-dur 220ms; моб-имп: --fx-arrow-dur 300ms и hit 100ms/200ms (var без fallback ⇒ animation:none ⇒ вспышки нет вообще — корень 000355; контракт окон 000248-MOBR сохраняется)', () => {
  const hero = sceneBow000355();
  assert.equal(hero.env.G.combatUI.handleCode('KeyJ'), true,
    'фикстура: выстрел consumed');
  const hits = atkEls000355(hero.env, 'combat-atk-hit');
  assert.equal(hits.length, 1, 'фикстура: ровно один .combat-atk-hit');
  assert.equal(varOf000355(hits[0], '--fx-hit-delay'), '380ms',
    'hit-задержка дальнего удара в cascade (ranged 380ms); факт: \''
    + varOf000355(hits[0], '--fx-hit-delay') + '\'');
  assert.equal(varOf000355(hits[0], '--fx-hit-dur'), '220ms',
    'hit-длительность в cascade; факт: \''
    + varOf000355(hits[0], '--fx-hit-dur') + '\'');
  const mob = sceneMobImp000355();
  const arrows = atkEls000355(mob.env, 'combat-atk-arrow');
  assert.equal(arrows.length, 1, 'фикстура: стрела моба есть');
  assert.equal(varOf000355(arrows[0], '--fx-arrow-dur'), '300ms',
    'полёт моба влезает в 300-мс окно (иначе fallback 400ms режет '
    + '75% полёта); факт: \''
    + varOf000355(arrows[0], '--fx-arrow-dur') + '\'');
  const mobHits = atkEls000355(mob.env, 'combat-atk-hit');
  assert.equal(mobHits.length, 1, 'фикстура: hit по игроку есть');
  assert.equal(varOf000355(mobHits[0], '--fx-hit-delay'), '100ms',
    'hit моба стартует в 300-мс окне; факт: \''
    + varOf000355(mobHits[0], '--fx-hit-delay') + '\'');
  assert.equal(varOf000355(mobHits[0], '--fx-hit-dur'), '200ms',
    'hit моба заканчивается ровно на 300ms; факт: \''
    + varOf000355(mobHits[0], '--fx-hit-dur') + '\'');
});

// --- AF5 (КРАСНЫЙ): lunge/draw на месте ---------------------------------

test('AF5 (000355): сосед по слою не сломан — melee lunge --fx-lx/--fx-ly в cascade (0% / −50% own-size для цели сверху: 0.5 клетки), rect lunge/draw = % клетки (реальные свойства); на HEAD var не задан → transform:none (выпада нет)', () => {
  const melee = sceneMelee000355();
  assert.equal(melee.env.G.combatUI.handleCode('KeyJ'), true,
    'фикстура: «Удар» consumed');
  const lungs = atkEls000355(melee.env, 'combat-atk-lunge');
  assert.equal(lungs.length, 1, 'фикстура: ровно один lunge');
  const lunge = lungs[0];
  const lx = varOf000355(lunge, '--fx-lx');
  const ly = varOf000355(lunge, '--fx-ly');
  assert.notEqual(lx, '',
    '--fx-lx в cascade (keyframe translate(var(--fx-lx)…) иначе '
    + 'IACVT → transform:none, выпадения нет); факт: \'' + lx + '\'');
  assert.notEqual(ly, '',
    '--fx-ly в cascade; факт: \'' + ly + '\'');
  assert.ok(Math.abs(Number.parseFloat(lx) - 0) < NEAR,
    'цель сверху → смещения по X нет; факт: ' + lx);
  assert.ok(Math.abs(Number.parseFloat(ly) - (-50)) < NEAR,
    '0.5 клетки вверх = −50% собственной высоты; факт: ' + ly);
  assert.ok(Math.abs(Number.parseFloat(lunge.style.left)
    - melee.c.px / melee.c.width * 100) < NEAR,
    'lunge.left = клетка героя (реальное свойство работало и на HEAD); '
    + 'факт: ' + lunge.style.left);
  const bow = sceneBow000355();
  assert.equal(bow.env.G.combatUI.handleCode('KeyJ'), true,
    'фикстура: выстрел consumed');
  const draws = atkEls000355(bow.env, 'combat-atk-draw');
  assert.equal(draws.length, 1, 'фикстура: ровно один draw у стрелка');
  assert.ok(Math.abs(Number.parseFloat(draws[0].style.left)
    - bow.c.px / bow.c.width * 100) < NEAR,
    'draw.left = клетка стрелка (% поля); факт: ' + draws[0].style.left);
  assert.ok(Math.abs(Number.parseFloat(draws[0].style.top)
    - bow.c.py / bow.c.height * 100) < NEAR,
    'draw.top = клетка стрелка; факт: ' + draws[0].style.top);
});

// --- AF6: CSS-контракт (translate — КРАСНЫЙ, остальное гарды) ----------

test('AF6 (000355): CSS — стрела потребляет var(--fx-x0/y0/angle); transform = translate(-50%, -50%) rotate(...) (якорь ЦЕНТРА бара на точке клетки — КРАСНЫЙ на HEAD: translate нет); keyframes arrow: x0→x1/y0→y1; hit animation ссылается на --fx-hit-delay/dur; lunge keyframe на --fx-lx/ly; слой overflow:hidden + pointer-events:none; формула слоя ≡ формуле canvas (база + portrait) — сдвиг layout-слоя ловится этим пином', () => {
  const html = page();
  const arrow = cssDecl000355(
    html, '.combat-overlay--combat .combat-atk-arrow');
  assert.equal(arrow.left, 'var(--fx-x0)',
    '.combat-atk-arrow left потребляет --fx-x0; факт: '
    + String(arrow.left));
  assert.equal(arrow.top, 'var(--fx-y0)',
    '.combat-atk-arrow top потребляет --fx-y0; факт: '
    + String(arrow.top));
  assert.ok(arrow.transform && /rotate\(\s*var\(--fx-angle\)\s*\)/
    .test(arrow.transform),
    'transform стрелы вращает на var(--fx-angle); факт: '
    + String(arrow.transform));
  assert.ok(arrow.transform
    && arrow.transform.includes('translate(-50%, -50%)'),
    'transform стрелы содержит translate(-50%, -50%) — якорь ЦЕНТРА: '
    + 'центр бара лежит на x0/y0→x1/y1 (центре клеток), ротация вокруг '
    + 'центра; без него бар стартует уголком из центра клетки — контракт '
    + '«старт/финиш в ЦЕНТРЕ клетки»; факт: ' + String(arrow.transform));
  const kf = keyframesBody000355(html, 'combat-atk-arrow');
  const at0 = keyframeStep000355(kf, '0%');
  const at100 = keyframeStep000355(kf, '100%');
  assert.equal(at0.left, 'var(--fx-x0)',
    'keyframe 0% left = var(--fx-x0); факт: ' + String(at0.left));
  assert.equal(at0.top, 'var(--fx-y0)',
    'keyframe 0% top = var(--fx-y0); факт: ' + String(at0.top));
  assert.equal(at100.left, 'var(--fx-x1)',
    'keyframe 100% left = var(--fx-x1); факт: ' + String(at100.left));
  assert.equal(at100.top, 'var(--fx-y1)',
    'keyframe 100% top = var(--fx-y1); факт: ' + String(at100.top));
  const hit = cssDecl000355(
    html, '.combat-overlay--combat .combat-atk-hit');
  assert.ok(hit.animation && hit.animation.includes('--fx-hit-dur')
    && hit.animation.includes('--fx-hit-delay'),
    'hit animation ссылается на --fx-hit-dur/--fx-hit-delay (тайминги '
    + 'из JS доходят до cascade только через setProperty); факт: '
    + String(hit.animation));
  const kfLunge = keyframesBody000355(html, 'combat-atk-lunge');
  const lungeEnd = keyframeStep000355(kfLunge, '100%');
  assert.ok(lungeEnd.transform.includes('var(--fx-lx)')
    && lungeEnd.transform.includes('var(--fx-ly)'),
    'lunge 100% translate(var(--fx-lx), var(--fx-ly)); факт: '
    + String(lungeEnd.transform));
  const layer = cssDecl000355(
    html, '.combat-overlay--combat .combat-atk-layer');
  assert.equal(layer.overflow, 'hidden',
    'слой overflow hidden (маркеры не лезут за поле); факт: '
    + String(layer.overflow));
  assert.equal(layer['pointer-events'], 'none',
    'слой pointer-events none (клики боя проходят); факт: '
    + String(layer['pointer-events']));
  const canvas = cssDecl000355(
    html, '.combat-overlay--combat .combat-box canvas');
  assert.ok(canvas.width && /min\(/.test(canvas.width),
    'фикстура: формула ширины canvas-поля на месте; факт: '
    + String(canvas.width));
  assert.equal(layer.width, canvas.width,
    'геометрия слоя = геометрия поля (база): % слоя ≡ % поля — источник '
    + 'истины проекции маркеров; факт: ' + String(layer.width) + ' vs '
    + String(canvas.width));
  assert.equal(layer.height, canvas.width,
    'высота слоя = ширине поля (поле квадратное aspect-ratio 1/1); '
    + 'факт: ' + String(layer.height));
  const mediaStart = html.indexOf(
    '@media (max-width: 640px) and (orientation: portrait)');
  assert.ok(mediaStart >= 0, 'фикстура: portrait-медиа (000124) на месте');
  const rest = html.slice(mediaStart);
  const layerMed = cssDecl000355(
    rest, '.combat-overlay--combat .combat-atk-layer');
  const canvasMed = cssDecl000355(
    rest, '.combat-overlay--combat .combat-box canvas');
  assert.equal(layerMed.width, canvasMed.width,
    'portrait: формула ширины слоя = формуле canvas (resize-контракт); '
    + 'факт: ' + String(layerMed.width) + ' vs '
    + String(canvasMed.width));
  assert.equal(layerMed.height, canvasMed.width,
    'portrait: высота слоя = ширине поля; факт: '
    + String(layerMed.height));
});

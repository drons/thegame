// Задача 000357 — подсказки клавиш на БОЕВЫХ кнопках (.combat-actions),
// по образцу 000356 (экранные кнопки .tc-action).
//
// Дизайн (анализ, контракт переиспользования memory/000356):
// ВНУТРЕННИЙ span.tc-key-hint ПОСЛЕДНИМ ребёнком кнопки; ГОЛОЕ правило
// .tc-key-hint в index.html (000356) переиспользуется БЕЗ дублирования
// (скоуп-якорь position:relative у .combat-overlay--combat .combat-actions
// button уже есть — 000199 под actcount). Скоуп кнопок = кнопки С ХОТКЕЕМ:
// 7 табличных (src/combat-keys.js: attack J, spellbook Q, block B,
// quickItem E, invItem T, flee F, endTurn Space) + «Каст» (KeyK, ветка
// keydown 000168) + «Лечение» (KeyH). «Последнее заклинание» и
// «Воскрешение» — безклавишные («кнопка — свой путь», таблица заморожена)
// — БЕЗ подсказки (негативы T2/T5). Единица текста для Space — ровно
// '[ ]' (не '[Space]'); маппинг — на стороне view (combat-ui.js),
// CombatKeys.keyLabel 0-diff.
//
// Инварианты: pointer-events:none уже в голом правиле — мишень клика
// остаётся кнопка, слушателей на span НЕТ (T4); видимость кнопок — за
// существующими display (castHealVis/lastSpellVis) — подсказка наследует
// (span остаётся ребёнком скрытой кнопки, T6); render() персистентные
// span'ы НЕ пересоздаёт (урок 000149 — как actcount, T6).
//
// Харнес (конвенция per-file дубли): самодостаточный дубль
// loadCombatUi-цепочки tests/combat-ui.test.js (с расширением
// withEfir/withSpells; хелперы в tests/ не экспортируются); DOM-стаб —
// дубль tests/fled-banner-000278.test.js (makeStyle с setProperty).
// Стаб НЕ агрегирует textContent кнопки из детей (ловушка
// spellbook.test.js L27) — тексты пиним у span, НЕ у кнопки.
//
//   T1 (RED): 7 табличных кнопок — ровно 1 img + ровно 1 span.tc-key-hint
//     последним ребёнком; тексты '[J] [Q] [B] [E] [T] [F]' по действию +
//     endTurn ровно '[ ]' (негатив '[Space]').
//   T2 (RED): полная панель: cast '[K]', heal '[H]'; НЕГАТИВЫ: у
//     lastSpell/resurrect подсказок нет.
//   T3 (green-guard): index.html — правило .tc-key-hint РОВНО ОДНО,
//     absolute/pointer-events:none/user-select:none, font-size ≤14px;
//     негативы скоупинга '.tc-action .tc-key-hint' и z-index; скоуп-якорь
//     .combat-overlay--combat .combat-actions button — position:relative.
//   T4 (RED): у всех подсказок НЕТ слушателей; клик по «Удар» по-прежнему
//     роутит runAction (лог растёт) — хит-тест/роут не изменились.
//   T5 (RED): композиция детей: attack/spellbook/endTurn/cast/heal —
//     [img, combat-actcount, tc-key-hint]; block/quickItem/invItem/flee —
//     [img, tc-key-hint]; lastSpell — [img, combat-actcount] (без
//     подсказки); resurrect — [img].
//   T6 (RED): персистентность: render'ы (tick'ы) не пересоздают span
//     (identity); текст стабилен; скрытая «Каст» (чужой ход) — подсказка
//     остаётся ребёнком (наследование видимости).

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const NOW = 1000;

const TABLE_HINT = {
  attack: '[J]',
  spellbook: '[Q]',
  block: '[B]',
  quickItem: '[E]',
  invItem: '[T]',
  flee: '[F]',
  endTurn: '[ ]',
};
const EXTRA_HINT = { cast: '[K]', heal: '[H]' };

// --- Минимальный DOM-стаб (дубль tests/fled-banner-000278.test.js) ---

function makeContext2d(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

function camelNameFb000357(name) {
  return String(name).replace(/-+([a-z0-9])/g, (_, ch) => ch.toUpperCase());
}

function makeStyleFb000357() {
  const custom = new Map();
  const style = {};
  const def = (name, fn) => Object.defineProperty(style, name, {
    value: fn, enumerable: false, writable: true, configurable: true,
  });
  def('setProperty', (name, value) => {
    const n = String(name);
    const v = value === undefined || value === null ? '' : String(value);
    if (n.startsWith('--')) custom.set(n, v);
    else style[camelNameFb000357(n)] = v;
  });
  def('getPropertyValue', (name) => {
    const n = String(name);
    if (n.startsWith('--')) {
      const v = custom.get(n);
      return v === undefined ? '' : v;
    }
    const v = style[camelNameFb000357(n)];
    return v === undefined || v === null ? '' : String(v);
  });
  def('removeProperty', (name) => {
    const n = String(name);
    if (n.startsWith('--')) {
      const v = custom.get(n);
      custom.delete(n);
      return v === undefined ? '' : v;
    }
    const key = camelNameFb000357(n);
    const v = style[key];
    delete style[key];
    return v === undefined || v === null ? '' : String(v);
  });
  return style;
}

function makeEl(tag, buttons) {
  const el = {
    tagName: tag,
    className: '',
    textContent: '',
    title: '',
    disabled: false,
    style: makeStyleFb000357(),
    dataset: {},
    children: [],
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
  let id = 0;
  return {
    scheduled,
    requestAnimationFrame(fn) { scheduled.push(fn); return ++id; },
    cancelAnimationFrame() {},
  };
}

// Дубль loadCombatUi-цепочки tests/combat-ui.test.js с расширением
// opts.withEfir (efir.js ПОСЛЕ player.js) и opts.withSpells
// (spells-data.js+spells.js ПОСЛЕ combat.js); existsSync-гарды
// spellbook.js/combat-scale.js — паттерн оригинала.
function loadHarness(opts = {}) {
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
    performance: { now: () => NOW },
    requestAnimationFrame: rafStubs.requestAnimationFrame,
    cancelAnimationFrame: rafStubs.cancelAnimationFrame,
  };
  vm.createContext(sandbox);
  for (const f of [
    'global-settings.js', 'perlin.js', 'map.js',
    'skills-data.js', 'items-data.js', 'sheet.js', 'player.js',
  ]) {
    vm.runInContext(src(f), sandbox, { filename: f });
  }
  if (opts.withEfir) {
    vm.runInContext(src('efir.js'), sandbox, { filename: 'efir.js' });
  }
  for (const f of ['items.js', 'controls.js', 'combat.js']) {
    vm.runInContext(src(f), sandbox, { filename: f });
  }
  if (opts.withSpells) {
    vm.runInContext(src('spells-data.js'), sandbox,
      { filename: 'spells-data.js' });
    vm.runInContext(src('spells.js'), sandbox, { filename: 'spells.js' });
  }
  vm.runInContext(src('combat-keys.js'), sandbox,
    { filename: 'combat-keys.js' });
  if (fs.existsSync(path.join(ROOT, 'src', 'spellbook.js'))) {
    vm.runInContext(src('spellbook.js'), sandbox,
      { filename: 'spellbook.js' });
  }
  vm.runInContext(src('sprites.js'), sandbox, { filename: 'sprites.js' });
  if (fs.existsSync(path.join(ROOT, 'src', 'combat-scale.js'))) {
    vm.runInContext(src('combat-scale.js'), sandbox,
      { filename: 'combat-scale.js' });
  }
  vm.runInContext(src('combat-ui.js'), sandbox, { filename: 'combat-ui.js' });
  vm.runInContext(src('motion.js'), sandbox, { filename: 'motion.js' });
  return { G: sandbox.Game, keydown, buttons, body: document.body, rafStubs };
}

const ROSTER_MEDIC = [{ name: 'Медик', role: 'support', level: 2,
  dmg: 1, hp: 1, spells: ['mend'] }];

// Сцены: default (дефолтный герой: 7 табличных + lastSpell) и full
// (Эфир + медик-наёмник с книгой + resurrect у героя: 11 кнопок).
function sceneDefault() {
  const S = loadHarness();
  const c = S.G.combatUI.startCombat({
    hero: S.G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  return { ...S, c };
}

function sceneFull() {
  const S = loadHarness({ withEfir: true, withSpells: true });
  const hero = S.G.createCharacter();
  hero.spells = ['resurrect', 'spark', 'mend'];
  const c = S.G.combatUI.startCombat({
    hero, mobs: ['wolf'], mobLevel: 1, seed: 42,
    efir: S.G.efir.createEfir(),
    rosterData: ROSTER_MEDIC,
  });
  return { ...S, c };
}

const byActOf = (S) => {
  const byAct = {};
  for (const b of S.buttons) byAct[b.dataset.act] = b;
  return byAct;
};

const hintsOf = (b) =>
  b.children.filter((ch) => ch.className === 'tc-key-hint');

const badgeOf = (b) =>
  b.children.find((ch) => ch.className === 'combat-actcount');

const tick = (S) => S.rafStubs.scheduled[S.rafStubs.scheduled.length - 1]();

const press = (S, code) => {
  const e = { code, preventDefault() {}, stopPropagation() {} };
  for (const fn of S.keydown) fn(e);
};

// Ставит игрока вплотную к живому мому (дубль tests/fled-banner-000278).
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

// ---------------------------------------------------------------------------
// T1: 7 табличных кнопок — подсказка последним ребёнком, текст по клавише
// ---------------------------------------------------------------------------

test('000357-T1: табличные боевые кнопки — ровно 1 span.tc-key-hint последним ребёнком с текстом по primaryKey; endTurn — ровно «[ ]», не «[Space]»', () => {
  const S = sceneDefault();
  const byAct = byActOf(S);
  const items = S.G.CombatKeys.describeCombatKeys();
  assert.equal(items.length, 7, 'фикстура: 7 табличных действий');
  const seen = [];
  for (const item of items) {
    const b = byAct[item.action];
    assert.ok(b, 'кнопка ' + item.action + ' построена');
    const imgs = b.children.filter((ch) => ch.tagName === 'img');
    assert.equal(imgs.length, 1,
      item.action + ': ровно один <img> (иконка, 000124)');
    const hints = hintsOf(b);
    assert.equal(hints.length, 1,
      'RED: ' + item.action + ': ровно один span.tc-key-hint — '
      + 'подсказка клавиши (образец 000356)');
    const hint = hints[0];
    assert.equal(hint, b.children[b.children.length - 1],
      'RED: ' + item.action + ': подсказка — ПОСЛЕДНИЙ ребёнок кнопки '
      + '(после img и после бейджа .combat-actcount)');
    assert.equal(hint.tagName, 'span', 'подсказка — span');
    const want = TABLE_HINT[item.action];
    seen.push(want);
    assert.equal(hint.textContent, want,
      'RED: ' + item.action + ' (primaryKey ' + item.primaryKey
      + '): текст подсказки ровно «' + want + '»');
  }
  assert.deepEqual(seen.slice().sort(),
    ['[ ]', '[B]', '[E]', '[F]', '[J]', '[Q]', '[T]'],
    'полный набор табличных подсказок на своих кнопках');
  const spaceHint = byAct.endTurn.children[byAct.endTurn.children.length - 1];
  assert.ok(!String(spaceHint.textContent).includes('Space'),
    "endTurn: НЕГАТИВ — «Space» в тексте подсказки (по ТЗ — «[ ]»): "
    + JSON.stringify(spaceHint.textContent));
  // lastSpell — безклавишная: в дефолтной панели ровно 7 подсказок.
  const total = S.buttons.reduce(
    (n, b) => n + hintsOf(b).length, 0);
  assert.equal(total, 7,
    'RED: дефолтная панель (8 кнопок) — ровно 7 подсказок (у lastSpell '
    + 'их нет): найдено ' + total);
});

// ---------------------------------------------------------------------------
// T2: условные кнопки с хоткеем (cast K / heal H) + негативы безклавишных
// ---------------------------------------------------------------------------

test('000357-T2: полная панель — «Каст» «[K]» и «Лечение» «[H]» последним ребёнком; lastSpell/resurrect — БЕЗ подсказки (безклавишные)', () => {
  const S = sceneFull();
  const byAct = byActOf(S);
  assert.equal(S.buttons.length, 11,
    'фикстура: 11 кнопок (7 табличных + cast + heal + lastSpell + '
    + 'resurrect): ' + S.buttons.length);
  for (const act of ['cast', 'heal']) {
    const b = byAct[act];
    assert.ok(b, 'кнопка ' + act + ' построена');
    const hints = hintsOf(b);
    assert.equal(hints.length, 1,
      'RED: ' + act + ': ровно один span.tc-key-hint');
    assert.equal(hints[0], b.children[b.children.length - 1],
      'RED: ' + act + ': подсказка — ПОСЛЕДНИЙ ребёнок');
    assert.equal(hints[0].textContent, EXTRA_HINT[act],
      'RED: ' + act + ': текст ровно «' + EXTRA_HINT[act] + '» '
      + '(ветки keydown KeyK/KeyH, 000168)');
  }
  for (const act of ['lastSpell', 'resurrect']) {
    const b = byAct[act];
    assert.ok(b, 'кнопка ' + act + ' построена (фикстура полной панели)');
    assert.deepEqual(hintsOf(b), [],
      'НЕГАТИВ: ' + act + ' — безклавишная («кнопка — свой путь», '
      + 'таблица COMBAT_KEYS заморожена) — подсказки НЕТ');
  }
});

// ---------------------------------------------------------------------------
// T3: CSS-guard (зелёный на RED — правило уже в базе 000356; индекс
//     переиспользуется, дубль правила/скоупинг/z-index — красные)
// ---------------------------------------------------------------------------

function ruleDecls(selector) {
  const esc = selector.replace(/[.#]/g, '\\$&');
  const m = html.match(new RegExp(esc + '\\s*\\{([^}]*)\\}'));
  return m ? m[1] : null;
}

function declMap(body) {
  const decls = {};
  for (const part of body.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const prop = part.slice(0, i).trim().toLowerCase();
    if (prop) decls[prop] = part.slice(i + 1).trim();
  }
  return decls;
}

test('000357-T3: CSS — индекс переиспользует ГОЛОЕ правило .tc-key-hint (ровно одно), скоуп-якорь кнопок цел; негативы скоупинга и z-index', () => {
  const occurrences = html.match(/\.tc-key-hint\s*\{/g) || [];
  assert.equal(occurrences.length, 1,
    'правило .tc-key-hint объявлено РОВНО ОДИН раз (дубль — нарушение '
    + 'контракта переиспользования 000356): ' + occurrences.length);
  const body = ruleDecls('.tc-key-hint');
  assert.ok(body, 'правило .tc-key-hint объявлено в index.html (000356)');
  const d = declMap(body);
  assert.equal(d.position, 'absolute', 'position:absolute');
  assert.equal(d['pointer-events'], 'none',
    'pointer-events:none — мишень клика остаётся кнопка (инвариант '
    + 'хит-теста 000356 переносится 1-в-1)');
  assert.equal(d['user-select'], 'none', 'user-select:none');
  const m = String(d['font-size'] || '').match(/^(\d+(?:\.\d+)?)px$/);
  assert.ok(m, 'font-size в px: ' + JSON.stringify(d['font-size']));
  assert.ok(Number(m[1]) <= 14, 'font-size ≤ 14px: ' + m[1]);
  assert.ok(!html.includes('.tc-action .tc-key-hint'),
    'НЕГАТИВ: селектор ГОЛОЙ (не через .tc-action) — иначе боевые кнопки '
    + 'стиль не получат');
  assert.ok(!('z-index' in d),
    'НЕГАТИВ: z-index у подсказки нет (z-лестница не двигается)');
  const scope = declMap(ruleDecls(
    '.combat-overlay--combat .combat-actions button') || '');
  assert.equal(scope.position, 'relative',
    'скоуп-якорь 000199 цел: .combat-overlay--combat .combat-actions '
    + 'button position:relative (иначе absolute-подсказка якорится не на '
    + 'кнопку)');
});

// ---------------------------------------------------------------------------
// T4: слушателей на span нет; клик по кнопке роутит как раньше
// ---------------------------------------------------------------------------

test('000357-T4: у всех подсказок НЕТ слушателей; тап по «Удар» по-прежнему роутит runAction (лог растёт)', () => {
  for (const scene of [sceneDefault, sceneFull]) {
    const S = scene();
    for (const b of S.buttons) {
      const hints = hintsOf(b);
      assert.ok(hints.length <= 1,
        'НЕГАТИВ: не больше одной подсказки на кнопке ' + b.dataset.act);
      for (const hint of hints) {
        assert.deepEqual(Object.keys(hint.listeners), [],
          'RED: на span.tc-key-hint кнопки ' + b.dataset.act
          + ' слушателей НЕТ (мишень события — кнопка)');
      }
    }
  }
  // Роут unchanged: adjacency + click → одна ветка runAction в лог.
  const S = sceneDefault();
  const wolf = S.c.units.find((u) => u.side === 'mob');
  standNextTo(S.c, wolf);
  tick(S);
  const byAct = byActOf(S);
  const b = byAct.attack;
  const hints = hintsOf(b);
  assert.ok(hints.length === 1,
    'RED: у «Удара» есть подсказка (иначе проверка слушателей пуста)');
  assert.deepEqual(Object.keys(hints[0].listeners), [],
    'RED: подсказка «Удара» — без слушателей');
  assert.equal(b.disabled, false,
    'фикстура: «Удар» активен (adjacency, ход игрока)');
  const n0 = Array.from(S.c.log).length;
  b.listeners.click[0]();
  const added = Array.from(S.c.log).slice(n0);
  assert.ok(added.length >= 1,
    'клик по кнопке роутит runAction как раньше (строка в журнале): '
    + JSON.stringify(added));
});

// ---------------------------------------------------------------------------
// T5: точная композиция детей каждой кнопки полной панели
// ---------------------------------------------------------------------------

test('000357-T5: композиция детей: actcount-кнопки [img, actcount, tc-key-hint], прочие табличные [img, tc-key-hint], lastSpell без подсказки, resurrect [img]', () => {
  const S = sceneFull();
  const byAct = byActOf(S);
  const CLS = (ch) => (ch.tagName === 'img' ? 'img' : ch.className);
  const expect = {
    attack: ['img', 'combat-actcount', 'tc-key-hint'],
    spellbook: ['img', 'combat-actcount', 'tc-key-hint'],
    endTurn: ['img', 'combat-actcount', 'tc-key-hint'],
    cast: ['img', 'combat-actcount', 'tc-key-hint'],
    heal: ['img', 'combat-actcount', 'tc-key-hint'],
    block: ['img', 'tc-key-hint'],
    quickItem: ['img', 'tc-key-hint'],
    invItem: ['img', 'tc-key-hint'],
    flee: ['img', 'tc-key-hint'],
    lastSpell: ['img', 'combat-actcount'],
    resurrect: ['img'],
  };
  for (const [act, want] of Object.entries(expect)) {
    const b = byAct[act];
    assert.ok(b, 'кнопка ' + act + ' построена');
    assert.deepEqual(b.children.map(CLS), want,
      'RED: ' + act + ': дети — ровно [' + want.join(', ')
      + '] в этом порядке');
  }
  for (const act of ['attack', 'spellbook', 'endTurn', 'cast', 'heal']) {
    assert.ok(badgeOf(byAct[act]),
      act + ': бейдж .combat-actcount цел (000199/000227 — сосед, не '
      + 'заменён подсказкой)');
  }
});

// ---------------------------------------------------------------------------
// T6: персистентность span'ов через render'ы; скрытие кнопки не трогает детей
// ---------------------------------------------------------------------------

test('000357-T6: render не пересоздаёт подсказки (identity); скрытая на чужом ходу «Каст» сохраняет подсказку-ребёнка (наследование видимости)', () => {
  const S = sceneFull();
  const byAct = byActOf(S);
  const refs = {};
  for (const act of ['attack', 'endTurn', 'cast', 'heal']) {
    const hints = hintsOf(byAct[act]);
    assert.ok(hints.length === 1,
      'RED: ' + act + ': подсказка есть до render-цикла');
    refs[act] = hints[0];
  }
  const badges = {
    attack: badgeOf(byAct.attack),
    cast: badgeOf(byAct.cast),
  };
  tick(S);
  tick(S);
  for (const act of Object.keys(refs)) {
    const now = hintsOf(byAct[act]);
    assert.equal(now.length, 1, act + ': подсказка всё ещё одна');
    assert.equal(now[0], refs[act],
      'RED: ' + act + ': render НЕ пересоздаёт span (тот же объект — '
      + 'персистентный, как actcount, урок 000149)');
    assert.equal(now[0], byAct[act].children[byAct[act].children.length - 1],
      act + ': после render подсказка — по-прежнему последний ребёнок');
  }
  assert.equal(badgeOf(byAct.attack), badges.attack,
    'бейдж attack тоже персистентен (ре-гресс против пересоздания)');
  assert.equal(badgeOf(byAct.cast), badges.cast,
    'бейдж cast тоже персистентен');
  // «Каст» видима на ходу Эфира; уходим с хода Эфира — display:none,
  // а дети (в т.ч. подсказка) не трогаются: видимость наследуется.
  assert.equal(byAct.cast.style.display, '',
    'фикстура: пред-прокат стоит на ходу Эфира — «Каст» видима');
  press(S, 'Space');
  tick(S);
  assert.equal(byAct.cast.style.display, 'none',
    'фикстура: не-ход Эфира — «Каст» скрыта (castHealVis)');
  assert.deepEqual(hintsOf(byAct.cast), [refs.cast],
    'RED: скрытая кнопка сохраняет span.tc-key-hint последним ребёнком '
    + '(0-diff в механизме показа/скрытия — подсказка наследует)');
  assert.equal(hintsOf(byAct.cast)[0],
    byAct.cast.children[byAct.cast.children.length - 1],
    'у скрытой «Каст» подсказка — последний ребёнок');
});

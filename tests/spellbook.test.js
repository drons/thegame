// Задача 000149: боевая магия + лечение — ОДНА кнопка «Книга
// заклинаний» (ТЗ: tasks/pending/000149.md; контракт:
// memory/000149-combat-spellbook.md; план: a3-tests §5).
//
// КРАСНЫЕ тесты (TDD): падают на ТЕКУЩЕМ (неизменённом) коде, потому
// что функциональности ещё НЕТ:
//   * модуля src/spellbook.js (Game.SpellBook.entriesFor) — нет;
//   * действия 'spellbook' в COMBAT_KEYS / на панели — нет (вместо
//     него пара кнопок 'fire'/'heal');
//   * DOM книги (.combat-spellbook) в боевом оверлее — нет;
//   * ветки canDoAction 'spellbook' в ядре — нет («неизвестное
//     действие: spellbook»);
//   * полей icon / icon_prompt в 16 JSON каталога assets/spells — нет;
//   * файлов иконок assets/spell-icons/*.svg — нет.
//
// Нумерация SB1-SB11 (контракт §6, план §5).
// SB1-SB5 — vm-песочница: цепочка как loadCombatUi в
// tests/combat-ui.test.js + spells-data.js/spells.js ПОСЛЕ combat.js
// (позиции index.html) + spellbook.js ДО combat-ui.js (снапшот-ловушка
// 000038) с existsSync-гардом — красная фаза: файла нет → тихий
// пропуск (красный осмысленный — в ассертах на отсутствующую книгу,
// а не ENOENT-крах цепочки).
// SB6-SB11 — node.
//
// Ловушки стаба (документация): document.createElement('button')
// считается в ГЛОБАЛЬНОМ массиве buttons → строки книги — div (R9);
// textContent='' в стабе НЕ обнуляет children → строки читаем хвостом
// children.slice(-N).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SPELLS_DIR = path.join(ROOT, 'assets', 'spells');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');

// ---------------------------------------------------------------------------
// Минимальный DOM-стаб (паттерн tests/combat-ui.test.js)
// ---------------------------------------------------------------------------

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
    listeners: {},
    appendChild(ch) { this.children.push(ch); return ch; },
    remove() {},
    addEventListener(type, fn) {
      (this.listeners[type] || (this.listeners[type] = [])).push(fn);
    },
    querySelectorAll() { return buttons; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; },
  };
  if (tag === 'canvas') {
    el.width = 0;
    el.height = 0;
    el.getContext = () => makeContext2d(el);
  }
  return el;
}

function findByClass(el, cls) {
  for (const ch of el.children || []) {
    if ((ch.className || '').includes(cls)) return ch;
    const found = findByClass(ch, cls);
    if (found) return found;
  }
  return null;
}

function press(handlers, code) {
  const ev = {
    code, key: '', preventDefault() {}, stopPropagation() {},
  };
  for (const h of handlers) h(ev);
  return ev;
}

// Стек rAF-тиков: после ручного изменения c.phase/c.result/c.player.spells
// перерисовку кнопки вызываем последним scheduled-тиком (рисунок идёт в
// rAF-тике, а не в момент мутации).
function rafStubs() {
  const scheduled = [];
  const cancelled = [];
  let id = 0;
  return {
    scheduled, cancelled,
    requestAnimationFrame(fn) { scheduled.push(fn); return ++id; },
    cancelAnimationFrame(x) { cancelled.push(x); },
  };
}

function tick(raf) {
  raf.scheduled[raf.scheduled.length - 1]();
}

// Текст поддерева (в стабе textContent родителя НЕ обновляется детьми).
function textOf(el) {
  let s = el.textContent || '';
  for (const ch of el.children || []) s += textOf(ch);
  return s;
}

// ---------------------------------------------------------------------------
// Песочница: цепочка loadCombatUi + каталожная магия + книга
// ---------------------------------------------------------------------------

function loadBookUi(opts = {}) {
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
  if (opts.performance) sandbox.performance = opts.performance;
  if (opts.requestAnimationFrame) sandbox.requestAnimationFrame = opts.requestAnimationFrame;
  if (opts.cancelAnimationFrame) sandbox.cancelAnimationFrame = opts.cancelAnimationFrame;
  vm.createContext(sandbox);
  for (const f of [
    'global-settings.js', 'perlin.js', 'map.js',
    'skills-data.js', 'items-data.js',
    'sheet.js', 'player.js',
    'items.js', 'controls.js', 'combat.js',
    // 000149: каталожная магия — ПОСЛЕ combat.js (позиции index.html
    // L807-809): строки книги читают Game.SpellsData и кастуют через
    // Game.Spells (движок 000045).
    'spells-data.js', 'spells.js',
    'combat-keys.js',
  ]) {
    vm.runInContext(src(f), sandbox, { filename: f });
  }
  // spellbook.js ДО combat-ui.js (снапшот-ловушка 000038: combat-ui
  // снимает Game при загрузке). Красная фаза: файла нет — тихий
  // пропуск (existsSync-гард): осмысленный красный несёт этот файл
  // (ассерты на отсутствующую книгу), а не ENOENT-крах цепочки.
  if (fs.existsSync(path.join(ROOT, 'src', 'spellbook.js'))) {
    vm.runInContext(src('spellbook.js'), sandbox, { filename: 'spellbook.js' });
  }
  vm.runInContext(src('combat-ui.js'), sandbox, { filename: 'combat-ui.js' });
  return { G: sandbox.Game, keydown, buttons, body: document.body };
}

function bookScene() {
  const r = rafStubs();
  const S = loadBookUi({
    performance: { now: () => 1000 },
    requestAnimationFrame: r.requestAnimationFrame,
    cancelAnimationFrame: r.cancelAnimationFrame,
  });
  return { S, r };
}

function startWolfCombat(S) {
  return S.G.combatUI.startCombat({
    hero: S.G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
}

// ---------------------------------------------------------------------------
// Node-хелперы
// ---------------------------------------------------------------------------

function loadSpellbook() {
  try {
    const SB = require('../src/spellbook.js');
    if (!SB || typeof SB.entriesFor !== 'function') {
      assert.fail('src/spellbook.js: нет SpellBook.entriesFor (задача 000149)');
    }
    return SB;
  } catch (e) {
    assert.fail('src/spellbook.js не существует (задача 000149): ' + e.message);
  }
}

// checkSvg — валидатор SVG из tests/svg.test.js (задача 000120).
// Тест-файл исполняем в ИЗОЛИРОВАННОМ vm-контексте: топ-левые test()
// svg.test.js должны повторной регистрации не происходить (require
// 'node:test' перехватывается стабом-ноупом), а module.exports
// достанем из своего mod-объекта.
function loadCheckSvg() {
  const code = fs.readFileSync(path.join(__dirname, 'svg.test.js'), 'utf8');
  const mod = { exports: {} };
  const sandbox = {
    console,
    __dirname,
    module: mod,
    require: (name) => (name === 'node:test'
      ? { test: () => {}, describe: () => {}, it: () => {} }
      : require(name)),
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'svg.test.js' });
  if (typeof mod.exports.checkSvg !== 'function') {
    assert.fail('tests/svg.test.js: checkSvg не экспортирована');
  }
  return mod.exports.checkSvg;
}

// ---------------------------------------------------------------------------
// SB1: кнопка «Книга заклинаний» вместо пары «Огонь»/«Исцел.»
// ---------------------------------------------------------------------------

test('SB1: нет кнопок fire/heal; ровно одна spellbook; всего 7; иконка+aria (000149)', () => {
  const { G, buttons } = loadBookUi();
  G.combatUI.startCombat({
    hero: G.createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  const acts = buttons.map((b) => b.dataset.act);
  assert.equal(acts.filter((a) => a === 'fire').length, 0,
    'кнопка «Огонь» (act=fire) ещё в панели (задача 000149: магия — в «Книгу заклинаний»)');
  assert.equal(acts.filter((a) => a === 'heal').length, 0,
    'кнопка «Исцел.» (act=heal) ещё в панели (задача 000149: лечение — в «Книгу заклинаний»)');
  const bookBtns = buttons.filter((b) => b.dataset.act === 'spellbook');
  assert.equal(bookBtns.length, 1,
    'кнопок «Книга заклинаний» (act=spellbook) ровно одна, найдено: '
      + bookBtns.length);
  assert.equal(buttons.length, 7,
    'кнопок действий всего 7 (таблица combat-keys.js), факт: '
      + buttons.length);
  const b = bookBtns[0];
  const imgs = b.children.filter((ch) => ch.tagName === 'img');
  assert.equal(imgs.length, 1, 'у кнопки книги ровно одна иконка');
  assert.equal(imgs[0].src, 'assets/ui/combat_spellbook.svg',
    'иконка кнопки — assets/ui/combat_spellbook.svg, факт: ' + imgs[0].src);
  assert.ok(fs.existsSync(path.join(ROOT, imgs[0].src)),
    'файл иконки существует: ' + imgs[0].src);
  assert.equal(b.ariaLabel, 'Книга заклинаний',
    'aria-label — «Книга заклинаний», факт: ' + b.ariaLabel);
});

// ---------------------------------------------------------------------------
// SB2: книга скрыта по умолчанию; кнопка / KeyQ / KeyR — toggle
// ---------------------------------------------------------------------------

test('SB2: книга скрыта; клик/KeyQ/KeyR — toggle; строки 1:1 с книгой (000149)', () => {
  const S = loadBookUi();
  startWolfCombat(S);
  const bookBox = findByClass(S.body, 'combat-spellbook');
  assert.ok(bookBox,
    'книга заклинаний (.combat-spellbook) не найдена в .combat-side (задача 000149)');
  assert.equal(bookBox.style.display, 'none', 'книга скрыта по умолчанию');
  const bookBtn = S.buttons.find((b) => b.dataset.act === 'spellbook');
  assert.ok(bookBtn,
    'кнопка «Книга заклинаний» (act=spellbook) не найдена (задача 000149)');
  // Клик по кнопке — открыть; строки построены (2: spark, mend).
  bookBtn.listeners.click[0]();
  assert.notEqual(bookBox.style.display, 'none', 'клик по кнопке — книга открыта');
  assert.equal(bookBox.children.length, 2,
    'строки построены: 2 (spark, mend), факт: ' + bookBox.children.length);
  assert.deepEqual(
    bookBox.children.map((r) => r.dataset.spell), ['spark', 'mend'],
    'порядок строк = порядок c.player.spells');
  // KeyQ — закрыть (toggle).
  press(S.keydown, 'KeyQ');
  assert.equal(bookBox.style.display, 'none', 'KeyQ — toggle (закрыла)');
  // KeyR — открыть (дубль, без primary).
  press(S.keydown, 'KeyR');
  assert.notEqual(bookBox.style.display, 'none', 'KeyR — toggle (открыла)');
  // Повторный клик по кнопке — закрыть.
  bookBtn.listeners.click[0]();
  assert.equal(bookBox.style.display, 'none',
    'повторный клик по кнопке — закрыла');
});

// ---------------------------------------------------------------------------
// SB3: строки 1:1 с c.player.spells; содержимое строки; пустая книга — «—»
// ---------------------------------------------------------------------------

test('SB3: строки = книга (порядок/имя/meta/описание); пустая — строка «—» (000149)', () => {
  const { S, r } = bookScene();
  const c = startWolfCombat(S);
  const bookBtn = S.buttons.find((b) => b.dataset.act === 'spellbook');
  assert.ok(bookBtn, 'кнопка «Книга заклинаний» не найдена (задача 000149)');
  bookBtn.listeners.click[0]();
  const bookBox = findByClass(S.body, 'combat-spellbook');
  assert.ok(bookBox, 'книга (.combat-spellbook) не найдена (задача 000149)');
  const cat = S.G.SpellsData.SPELLS_BY_ID;
  assert.ok(cat && cat.spark && cat.mend, 'прекондиция: каталог в песочнице');
  assert.deepEqual(c.player.spells, ['spark', 'mend'],
    'прекондиция: стартовая книга героя (sheet.js)');
  const rows = bookBox.children.slice(-2);
  assert.equal(rows.length, 2, 'строк = заклинаний в книге (2)');
  const [rSpark, rMend] = rows;
  assert.deepEqual([rSpark.dataset.spell, rMend.dataset.spell],
    ['spark', 'mend'], 'порядок строк = порядок c.player.spells');
  for (const [row, id] of [[rSpark, 'spark'], [rMend, 'mend']]) {
    assert.ok(row.className.includes('combat-spellrow'),
      'строка — div.combat-spellrow: ' + row.className);
    assert.ok(!row.className.includes('combat-spellrow-off'),
      id + ': живая строка (мана/пул/цель есть), класс: ' + row.className);
    const img = row.children.find((ch) => ch.tagName === 'img');
    assert.ok(img, id + ': иконка <img> в строке');
    assert.equal(img.className, 'combat-spellicon', id + ': класс иконки');
    assert.equal(img.src, 'assets/spell-icons/' + id + '.svg',
      id + ': src иконки = icon из JSON, факт: ' + img.src);
    assert.equal(img.alt, cat[id].название, id + ': alt = название из каталога');
    const bodyDiv = row.children.find((ch) => ch.className === 'combat-spellrow-body');
    assert.ok(bodyDiv, id + ': тело строки (.combat-spellrow-body)');
    const top = bodyDiv.children.find((ch) => ch.className === 'combat-spellrow-top');
    assert.ok(top, id + ': верх строки (.combat-spellrow-top)');
    const nameSpan = top.children.find((ch) => ch.className === 'combat-spellname');
    assert.ok(nameSpan, id + ': имя (.combat-spellname)');
    assert.equal(nameSpan.textContent, cat[id].название,
      id + ': имя = название из каталога, факт: ' + nameSpan.textContent);
    const attrName = cat[id].атрибут === 'intelligence' ? 'Интеллект' : 'Мудрость';
    const metaSpan = top.children.find((ch) => ch.className === 'combat-spellmeta');
    assert.ok(metaSpan, id + ': мета (.combat-spellmeta)');
    assert.equal(metaSpan.textContent,
      'Мана ' + cat[id].мани + ' · Заклинание (' + attrName + ')',
      id + ': мета «Мана N · Заклинание (Атрибут)», факт: '
          + metaSpan.textContent);
    const descDiv = bodyDiv.children.find((ch) => ch.className === 'combat-spellrow-desc');
    assert.ok(descDiv, id + ': описание (.combat-spellrow-desc)');
    assert.equal(descDiv.textContent, cat[id].описание,
      id + ': описание = описание из каталога');
  }
  // Пустая книга — одна строка «—» (паттерн 000145, ui-tab-skills.js).
  c.player.spells = [];
  tick(r);
  const tail = bookBox.children.slice(-1);
  assert.equal(tail.length, 1, 'пустая книга — одна строка');
  assert.equal(textOf(tail[0]).trim(), '—',
    'пустая книга — строка «—», факт: ' + JSON.stringify(textOf(tail[0])));
  assert.ok(!tail[0].children.some((ch) => ch.tagName === 'img'),
    'у строки «—» нет иконки');
});

// ---------------------------------------------------------------------------
// SB4: клик по живой строке = каст через G.Spells.castSpell; отказ —
//      без расхода, причина в журнале, книга открыта
// ---------------------------------------------------------------------------

test('SB4: клик строки — каст (урон/пул/мана/лог/c._fx, ход не сгорел); отказ — без расхода (000149)', () => {
  const NOW = 1000;
  // (a) успешный каст «Искры».
  const S = loadBookUi({ performance: { now: () => NOW } });
  const c = startWolfCombat(S);
  const m0 = c.units[0];
  m0.x = c.px; m0.y = c.py - 1; // в упор (дальность каталога 4)
  c.selectTarget(m0.id);
  c._rng = () => 0.99;
  const p = c.player;
  const mpBefore = p.mp, intBefore = c.ps.spellInt;
  assert.ok(mpBefore >= 3 && intBefore > 0, 'прекондиция: мана/пул есть');
  const bookBtn = S.buttons.find((b) => b.dataset.act === 'spellbook');
  assert.ok(bookBtn, 'кнопка «Книга заклинаний» не найдена (задача 000149)');
  bookBtn.listeners.click[0]();
  const bookBox = findByClass(S.body, 'combat-spellbook');
  assert.ok(bookBox, 'книга (.combat-spellbook) не найдена (задача 000149)');
  const sparkRow = bookBox.children.slice(-2)
    .find((rw) => rw.dataset.spell === 'spark');
  assert.ok(sparkRow, 'строка «Искра» не найдена в книге (задача 000149)');
  assert.equal(c._fx, undefined, 'c._fx не записано до каста');
  sparkRow.listeners.click[0]();
  assert.equal(c.ps.spellInt, intBefore - 1,
    'пул «Заклинание» (Интеллект) −1, факт: ' + c.ps.spellInt);
  assert.equal(p.mp, mpBefore - 3, 'мана −3 (spark.мани), факт: ' + p.mp);
  const lastLog = Array.from(c.log).slice(-1)[0];
  assert.match(lastLog, /^Искра по Волк: \d+\.$/,
    'строка лога каталога castSpell, факт: ' + JSON.stringify(lastLog));
  assert.equal(c._fx && c._fx.action, 'cast', 'c._fx.action = cast');
  assert.ok(c._fx.until > NOW, 'c._fx.until > now');
  assert.equal(bookBox.style.display, 'none', 'книга закрыта после каста');
  assert.equal(c.phase, 'player', 'ход игрока не сгорел (каст — действие)');
  assert.equal(c.round, 1, 'раунд не наступил');
  // (b) отказ: без маны — без расхода, причина в журнале, книга открыта.
  const S2 = loadBookUi({ performance: { now: () => NOW } });
  const c2 = startWolfCombat(S2);
  const m2 = c2.units[0];
  m2.x = c2.px; m2.y = c2.py - 1;
  c2.selectTarget(m2.id);
  c2.player.mp = 0;
  const int2 = c2.ps.spellInt;
  const bookBtn2 = S2.buttons.find((b) => b.dataset.act === 'spellbook');
  assert.ok(bookBtn2, 'кнопка «Книга заклинаний» (сценарий отказа)');
  bookBtn2.listeners.click[0]();
  const bookBox2 = findByClass(S2.body, 'combat-spellbook');
  assert.ok(bookBox2, 'книга (сценарий отказа)');
  const sparkRow2 = bookBox2.children.slice(-2)
    .find((rw) => rw.dataset.spell === 'spark');
  assert.ok(sparkRow2, 'строка «Искра» (сценарий отказа)');
  assert.ok(sparkRow2.className.includes('combat-spellrow-off'),
    '«Искра» без маны — disabled-строка (.combat-spellrow-off), класс: '
        + sparkRow2.className);
  assert.equal(sparkRow2.title, 'не хватает маны (3)',
    'title = reason canCastSpell, факт: ' + sparkRow2.title);
  const n2 = c2.log.length;
  sparkRow2.listeners.click[0]();
  assert.equal(c2.ps.spellInt, int2, 'без расхода пула');
  assert.equal(c2.player.mp, 0, 'без расхода маны');
  const added2 = Array.from(c2.log).slice(n2);
  assert.ok(added2.includes('не хватает маны (3)'),
    'reason отказа в журнале, факт: ' + JSON.stringify(added2));
  assert.notEqual(bookBox2.style.display, 'none',
    'после отказа книга открыта');
});

// ---------------------------------------------------------------------------
// SB5: disabled-логика кнопки «Книга заклинаний»
// ---------------------------------------------------------------------------

test('SB5: disabled: фаза игрока — on; фаза мобов / c.result / пустая книга — off (000149)', () => {
  const { S, r } = bookScene();
  const c = startWolfCombat(S);
  const bookBtn = S.buttons.find((b) => b.dataset.act === 'spellbook');
  assert.ok(bookBtn, 'кнопка «Книга заклинаний» не найдена (задача 000149)');
  assert.equal(bookBtn.disabled, false,
    'фаза игрока + непустая книга — enabled');
  // (b) фаза мобов — disabled.
  c.phase = 'mob';
  tick(r);
  assert.equal(bookBtn.disabled, true, 'фаза мобов — disabled');
  // (c) c.result — disabled.
  c.phase = 'over';
  c.result = { outcome: 'victory', xp: 0, gold: 0, defeated: 1 };
  tick(r);
  assert.equal(bookBtn.disabled, true, 'c.result — disabled');
  // (d) пустая книга — disabled + title «заклинаний нет».
  const { S: S2, r: r2 } = bookScene();
  const c2 = startWolfCombat(S2);
  c2.player.spells = [];
  tick(r2);
  const bookBtn2 = S2.buttons.find((b) => b.dataset.act === 'spellbook');
  assert.ok(bookBtn2, 'кнопка «Книга заклинаний» (сценарий пустой книги)');
  assert.equal(bookBtn2.disabled, true, 'пустая книга — disabled');
  assert.equal(bookBtn2.title, 'заклинаний нет',
    'title = reason canDoAction, факт: ' + bookBtn2.title);
});

// ---------------------------------------------------------------------------
// SB6: Game.SpellBook.entriesFor
// ---------------------------------------------------------------------------

test('SB6: entriesFor — строки 1:1 с листом; некаталожный id — голый; мусор — [] (000149)', () => {
  const SB = loadSpellbook();
  const { SPELLS_BY_ID } = require('../src/spells-data.js');
  const { createCharacter } = require('../src/player.js');
  const cat = SPELLS_BY_ID;
  const hero = createCharacter();
  assert.deepEqual(hero.spells, ['spark', 'mend'], 'прекондиция: стартовая книга');
  const rows = SB.entriesFor(hero, cat);
  assert.ok(Array.isArray(rows), 'entriesFor — массив');
  assert.equal(rows.length, 2, 'строк = заклинаний в листе');
  assert.deepEqual(rows[0], {
    id: 'spark',
    name: cat.spark.название,
    desc: cat.spark.описание,
    mana: cat.spark.мани,
    poolKey: 'spellInt',
    poolName: 'Интеллект',
    icon: 'assets/spell-icons/spark.svg',
  }, 'строка spark — поля/значения');
  assert.deepEqual(rows[1], {
    id: 'mend',
    name: cat.mend.название,
    desc: cat.mend.описание,
    mana: cat.mend.мани,
    poolKey: 'spellWis',
    poolName: 'Мудрость',
    icon: 'assets/spell-icons/mend.svg',
  }, 'строка mend — поля/значения');
  assert.deepEqual(hero.spells, ['spark', 'mend'], 'аргумент не мутирован');
  // Некаталожный id — строка с голым id, без исключения.
  const rows2 = SB.entriesFor({ spells: ['spark', 'bogus_id'] }, cat);
  assert.equal(rows2.length, 2, 'некаталожный id — строка строится');
  assert.deepEqual(rows2[1], {
    id: 'bogus_id', name: 'bogus_id', desc: '', mana: 0,
    poolKey: null, poolName: null, icon: null,
  }, 'некаталожный id — деградация (голый id, пустые поля)');
  // Мусор — [] без исключений.
  assert.deepEqual(SB.entriesFor(null, cat), [], 'null-лист — []');
  assert.deepEqual(SB.entriesFor({}, cat), [], 'без spells — []');
  assert.deepEqual(SB.entriesFor({ spells: 'spark' }, cat), [],
    'spells не массив — []');
  assert.deepEqual(SB.entriesFor(hero, null), [], 'каталог null — []');
  assert.deepEqual(SB.entriesFor(hero, 'x'), [], 'каталог не объект — []');
});

// ---------------------------------------------------------------------------
// SB7: COMBAT_KEYS / describeCombatKeys
// ---------------------------------------------------------------------------

test('SB7: COMBAT_KEYS — нет fire/heal; KeyQ=spellbook (primary) + KeyR; 7 записей (000149)', () => {
  const { COMBAT_KEYS, describeCombatKeys } = require('../src/combat-keys.js');
  const actions = Object.values(COMBAT_KEYS)
    .filter((e) => e.type === 'action').map((e) => e.action);
  assert.ok(!actions.includes('fire'),
    'действие «fire» ещё в таблице (задача 000149: кнопка «Огонь» — в «Книгу заклинаний»)');
  assert.ok(!actions.includes('heal'),
    'действие «heal» ещё в таблице (задача 000149: кнопка «Исцел.»)');
  assert.ok(actions.includes('spellbook'),
    'действия «spellbook» нет в таблице (задача 000149)');
  for (const a of ['attack', 'block', 'quickItem', 'invItem', 'flee', 'endTurn']) {
    assert.ok(actions.includes(a), 'действие «' + a + '» на месте');
  }
  assert.deepEqual(COMBAT_KEYS.KeyQ,
    { type: 'action', action: 'spellbook', primary: true },
    'KeyQ — первичная «Книга заклинаний»');
  assert.deepEqual(COMBAT_KEYS.KeyR,
    { type: 'action', action: 'spellbook' },
    'KeyR — дубль (без primary)');
  const items = describeCombatKeys();
  assert.equal(items.length, 7, 'ровно 7 действий, факт: ' + items.length);
  const sb = items.find((i) => i.action === 'spellbook');
  assert.deepEqual(sb, {
    action: 'spellbook', label: 'Книга заклинаний',
    primaryKey: 'KeyQ', keys: ['KeyQ', 'KeyR'],
  }, 'запись describeCombatKeys');
  assert.equal(items[1].action, 'spellbook',
    'кнопка книги — на позиции «Огня» (2-я), факт: ' + items[1].action);
});

// ---------------------------------------------------------------------------
// SB8: canDoAction «spellbook»
// ---------------------------------------------------------------------------

test('SB8: canDoAction «spellbook» — ok / «заклинаний нет» / «не ваш ход» (000149)', () => {
  const { createCombat, canDoAction } = require('../src/combat.js');
  const { createCharacter } = require('../src/player.js');
  const c = createCombat({
    player: createCharacter(), mobs: ['wolf'], mobLevel: 1, seed: 42,
  });
  assert.ok(Array.isArray(c.player.spells) && c.player.spells.length,
    'прекондиция: непустая книга');
  assert.deepEqual(canDoAction(c, 'spellbook', { targetId: c.targetId }),
    { ok: true },
    'непустая книга + фаза игрока — ok (задача 000149: ветки «spellbook» в ядре нет)');
  c.player.spells = [];
  assert.deepEqual(canDoAction(c, 'spellbook', { targetId: c.targetId }),
    { ok: false, reason: 'заклинаний нет' },
    'пустая книга — «заклинаний нет»');
  c.phase = 'mob';
  c.player.spells = ['spark'];
  assert.deepEqual(canDoAction(c, 'spellbook', { targetId: c.targetId }),
    { ok: false, reason: 'не ваш ход' },
    'фаза мобов — «не ваш ход»');
});

// ---------------------------------------------------------------------------
// SB9: JSON-каталог — icon + icon_prompt, schema
// ---------------------------------------------------------------------------

test('SB9: 16 JSON — непустые icon/icon_prompt; оба поля в schema.required (000149)', () => {
  const files = fs.readdirSync(SPELLS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f)).sort();
  assert.equal(files.length, 16, 'каталог: 16 файлов');
  const schema = JSON.parse(
    fs.readFileSync(path.join(SPELLS_DIR, 'schema.json'), 'utf8'));
  assert.ok(schema.required.includes('icon'),
    'schema.required — «icon» (задача 000149)');
  assert.ok(schema.required.includes('icon_prompt'),
    'schema.required — «icon_prompt» (задача 000149)');
  assert.equal(schema.properties.icon.type, 'string', 'icon — string');
  assert.equal(schema.properties.icon.pattern,
    '^assets/[a-z0-9_-]+/[a-z][a-z0-9_]*\\.svg$',
    'pattern icon — путь от корня внутри assets/ (контракт §4)');
  assert.equal(schema.properties.icon_prompt.type, 'string',
    'icon_prompt — string');
  assert.equal(schema.properties.icon_prompt.pattern, '^\\S(.*\\S)?$',
    'pattern icon_prompt — непустая строка');
  for (const f of files) {
    const d = JSON.parse(fs.readFileSync(path.join(SPELLS_DIR, f), 'utf8'));
    assert.equal(typeof d.icon, 'string',
      f + ': icon — строка (задача 000149)');
    assert.ok(d.icon && d.icon.trim(), f + ': icon — непустая');
    assert.equal(typeof d.icon_prompt, 'string',
      f + ': icon_prompt — строка (задача 000149)');
    assert.ok(d.icon_prompt && d.icon_prompt.trim(),
      f + ': icon_prompt — непустая');
  }
});

// ---------------------------------------------------------------------------
// SB10: файлы иконок; закрытость каталога
// ---------------------------------------------------------------------------

test('SB10: иконки — assets/spell-icons/<id>.svg, существуют; assets/spells закрыт (000149)', () => {
  const files = fs.readdirSync(SPELLS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f)).sort();
  for (const f of files) {
    const d = JSON.parse(fs.readFileSync(path.join(SPELLS_DIR, f), 'utf8'));
    const expected = 'assets/spell-icons/' + d.id + '.svg';
    assert.equal(d.icon, expected,
      f + ': icon — assets/spell-icons/<id>.svg, факт: ' + d.icon);
    assert.ok(fs.existsSync(path.join(ROOT, expected)),
      f + ': файл иконки существует: ' + expected
          + ' (задача 000149: иконка ещё не сгенерирована)');
  }
  // Закрытость каталога (регрессия: иконки — ТОЛЬКО в assets/spell-icons/).
  for (const f of fs.readdirSync(SPELLS_DIR)) {
    assert.ok(/^\d{6}\.json$/.test(f) || f === 'schema.json',
      'чужой файл в assets/spells: ' + f + ' (иконки — в assets/spell-icons/)');
  }
});

// ---------------------------------------------------------------------------
// SB11: все новые SVG проходят checkSvg (000120) ДО каталога
// ---------------------------------------------------------------------------

test('SB11: 17 SVG (16 иконок + кнопка) существуют и проходят checkSvg (000149)', () => {
  const checkSvg = loadCheckSvg();
  const { SPELLS } = require('../src/spells-data.js');
  const rels = SPELLS.map((s) => 'assets/spell-icons/' + s.id + '.svg');
  rels.push('assets/ui/combat_spellbook.svg');
  assert.equal(rels.length, 17, '16 иконок заклинаний + иконка кнопки');
  for (const rel of rels) {
    const abs = path.join(ROOT, rel);
    assert.ok(fs.existsSync(abs),
      rel + ': файл не существует (задача 000149: иконка ещё не сгенерирована)');
    const errs = checkSvg(fs.readFileSync(abs, 'utf8'));
    assert.deepEqual(errs, [],
      rel + ': checkSvg — 0 ошибок, факт: ' + JSON.stringify(errs));
  }
});

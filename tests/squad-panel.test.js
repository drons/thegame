// Задача 000086 (родитель 000065): глобальная панель «Отряд» —
// Game.squadUI (src/ui.js) + проводка (src/main.js: init с ЖИВЫМИ
// ссылками, хоткей KeyC, закрытие при старте боя во всех входах).
//
// Слой: отдельный глобальный оверлей ВНЕ диалога таверны (вкладка
// «найм» 000083 — слой диалога; решение — memory/000086-squad-
// panel.md §1: 000051 смержена, панель — свой оверлей, как панель
// персонажа):
//   * G.squadUI = { init({roster, efir, onChange}), toggle(force),
//     render(), isOpen() } — init (один раз, main.js) получает
//     ЖИВЫЕ ссылки: мутация roster (hire/dismiss) и efir видна
//     панели без re-wiring; до init — toggle/render no-op;
//   * строки наёмников (порядок roster): .cp-itemrow — имя из
//     каталога («призрак» — голый npcId) + «уровень N · лояльность
//     L» (+ « · жалованье W з/день» — ТА ЖА строка, что блок
//     «Отряд» 000083) + кнопка «уволить» (data-squadact='dismiss',
//     data-npcid) → G.companions.dismiss(roster, id) + onChange
//     (точка сейва в main.js) ровно ×1 на успешное увольнение;
//   * строка Эфира — отдельно, ПОСЛЕ наёмников: «Эфир»,
//     «уровень N · HP M/M · всегда со мной» (M = G.efir.efirStats
//     (level).maxHP — лениво; Эфир всегда 100% HP — структурно,
//     000081) + xp-бар .squad-xp/.squad-xp-fill; БЕЗ лояльности/
//     жалованья/кнопок (000081: Эфир — не наёмник);
//   * пустой отряд — ОДНА строка «Отряд пуст. Наймите спутников в
//     таверне.» (БЕЗ .cp-itemrow; другой слой, чем «Отряд пуст.»
//     вкладки 000083 — НЕ путать);
//   * KeyC (в русской раскладке «С» — «Состав отряда») — ветка
//     keydown main.js ПОСЛЕ KeyI, ДО KeyE/гейтов; закрытие при
//     старте боя во ВСЕХ ТРЁХ входах (паттерн 000096);
//   * заголовок «Отряд», close-кнопка «закрыть [C]/[Esc]».
//
// Ядро сводки — чистая функция C.rosterSummary (покрывается
// tests/companions.test.js, секция 000086, S1–S5); деградация без
// ядра — typeof-guard (паттерн 000083/000078).
//
// КРАСНЫЕ (осмысленно, не синтаксис): цепочка грузится ЧИСТО
// (все модули уже существуют и запитаны в index.html); падают
// ассерты на отсутствующую ФУНКЦИОНАЛЬНОСТЬ 000086: G.squadUI
// undefined (панели нет в ui.js) → P1–P5; ветки KeyC в main.js
// нет → P6 (элемент не появляется), S1–S3 (структурные пины).
//
// CHAIN A — цепочка tests/npc-hire-ui.test.js + 'efir.js' ПОСЛЕ
// 'companions.js' (зеркало index.html 599→605; пин порядка —
// tests/index-order.test.js). P6 — ПОЛНЫЙ бут всей цепочки
// index.html (паттерн bootSandbox tests/building-actions.test.js:
// WebGL/DOM-стабы, winListeners, drain setImmediate ×3).
//
// Cross-realm (vm): пины — примитивы/текст/длинами, НЕ
// deepStrictEqual на объекты песочницы (правило 000082).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');

// --- Минимальный DOM-стаб с деревом (дубль tests/npc-hire-ui.
// test.js) — для цепочки A (P1–P5) ---

function matchesSel(el, sel) {
  // 'тег[атрибут]' / 'тег[атрибут=значение]' (делегированный клик:
  // e.target.closest('button[data-squadact]')), '.класс', имя тега.
  const m = /^([a-zA-Z][\w-]*)\[([\w-]+)(?:=([^\]]+))?\]$/.exec(sel);
  if (m) {
    if (String(el.tagName || '').toLowerCase() !== m[1].toLowerCase()) {
      return false;
    }
    // Стаб хранит атрибуты dataset БЕЗ префикса 'data-' (ui.js пишет
    // btn.dataset.squadact напрямую); setAttribute — с именем как
    // есть. Проверяем оба варианта ключа.
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
  // textContent = '' — как в DOM, сбрасывает детей (render()
  // пересобирает .squad-body in place).
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

// --- Цепочка A: до ui.js (P1–P5) ---
// CHAIN tests/npc-hire-ui.test.js + 'efir.js' ПОСЛЕ 'companions.js'
// (зеркало index.html 599→605: companions L599 → efir L605; пин
// порядка — tests/index-order.test.js).
const CHAIN = [
  'global-settings.js', 'perlin.js', 'mapseed.js',
  'skills-data.js', 'items-data.js', 'npc-data.js',
  'map.js', 'sheet.js', 'player.js', 'day.js', 'items.js', 'buildings.js',
  'npc.js', 'companions.js', 'efir.js', 'combat.js', 'dungeon.js',
  'controls.js', 'combat-keys.js', 'ui.js',
];

// Загрузка цепочки в vm-песочницу. Возвращает { G, body, errors }:
// G — Game песочницы, body — document.body (к нему подвешена
// панель), errors — console.error.
function loadSquadUi() {
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
  for (const f of CHAIN) vm.runInContext(src(f), sandbox, { filename: f });
  return { G: sandbox.Game, body: document.body, errors };
}

// --- Хелперы (цепочка A) ---

// Запись отряда в ЗАФИКСИРОВАННОЙ форме (сейв 000085, 000079).
// 000143: runtime-запись — 6 ключей {npcId, sheet, level, xp,
// loyalty, hiredDay}; панель «Отряд» (rosterSummary) читает ТОЛЬКО
// плоские поля level/loyalty — плоская форма остаётся валидным
// входом (FIXTURE-упрощение: sheet здесь не нужен).
const entry = (npcId, level = 1, xp = 0, loyalty = 51, day = 1) =>
  ({ npcId, level, xp, loyalty, hiredDay: day });

// Полный текст узла (рекурсивно).
function textOf(node) {
  let s = node._text || '';
  for (const ch of node.children || []) s += textOf(ch);
  return s;
}

// Панель «Отряд» в body (null, если не построена).
function panelOf(env) {
  return findAll(env.body, '.squad-panel')[0] || null;
}

// G.squadUI — с осмысленным сообщением (красный — на отсутствии
// самой панели в src/ui.js).
function squadOf(env) {
  assert.ok(env.G.squadUI,
    'Game.squadUI на месте (панель «Отряд» в src/ui.js, 000086)');
  return env.G.squadUI;
}

// СТРОКИ панели — все .cp-itemrow (наёмники + Эфир).
function rowsOf(panel) {
  return findAll(panel, '.cp-itemrow');
}

function rowByName(panel, name) {
  return rowsOf(panel).find((r) => {
    const nm = r.querySelector('.cp-itemname');
    return nm && nm.textContent === name;
  }) || null;
}

function rowMeta(row) {
  const m = row.querySelector('.cp-itemmeta');
  return m ? m.textContent : '';
}

// --- P1: цепочка чистая; API панели; до init — no-op ---

test('000086 P1: цепочка до ui.js (+efir.js) грузится чисто; G.squadUI = init/toggle/render/isOpen; до init toggle — no-op', () => {
  const env = loadSquadUi();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  assert.ok(env.G.companions,
    'Game.companions в песочнице (companions.js в CHAIN)');
  assert.ok(env.G.efir, 'Game.efir в песочнице (efir.js после companions.js)');
  const su = squadOf(env);
  for (const m of ['init', 'toggle', 'render', 'isOpen']) {
    assert.equal(typeof su[m], 'function', 'Game.squadUI.' + m);
  }
  // До init — no-op: панель НЕ показана, isOpen false.
  su.toggle();
  assert.equal(su.isOpen(), false, 'toggle до init — no-op (isOpen false)');
  for (const p of findAll(env.body, '.squad-panel')) {
    assert.notEqual(p.style.display, 'flex',
      'toggle до init — панель не показана (display не flex)');
  }
});

// --- P2: строки наёмников — имя/уровень/лояльность/жалованье +
// «уволить» (data-squadact=dismiss) ---

test('000086 P2: панель — строки отряда: имя каталога, «уровень N · лояльность L · жалованье W з/день», кнопка «уволить» [data-squadact=dismiss][data-npcid]', () => {
  const env = loadSquadUi();
  const roster = [entry('merc_volk'), entry('merc_ashka', 3, 100, 77)];
  const efir = env.G.efir.createEfir();
  let saves = 0;
  squadOf(env).init({ roster, efir, onChange: () => { saves += 1; } });
  squadOf(env).toggle();
  assert.equal(env.errors.length, 0,
    'init + toggle: ошибок нет: ' + env.errors.join('; '));
  const panel = panelOf(env);
  assert.ok(panel, 'панель .squad-panel подвешена к body');
  assert.equal(panel.style.display, 'flex',
    'открыта — display flex (CSS .squad-panel обязан действовать)');
  assert.equal(squadOf(env).isOpen(), true, 'isOpen() true');
  // Точные литералы (контракт §7): заголовок + close-кнопка.
  const title = panel.querySelector('.cp-title');
  assert.ok(title, 'заголовок .cp-title');
  assert.equal(title.textContent, 'Отряд', 'заголовок — «Отряд»');
  const closeBtn = panel.querySelector('.cp-close');
  assert.ok(closeBtn, 'close-кнопка .cp-close');
  assert.equal(closeBtn.textContent, 'закрыть [C]/[Esc]',
    'подпись close-кнопки (паттерн «закрыть [I]/[Esc]»)');

  // Строка Волька (запись level 1, loyalty 51; каталог: жалованье 1).
  const rV = rowByName(panel, 'Вольк');
  assert.ok(rV, 'строка «Вольк» (имя из каталога)');
  const mV = rowMeta(rV);
  assert.ok(mV.includes('уровень 1'), 'строка — «уровень 1»: ' + mV);
  assert.ok(mV.includes('лояльность 51'), 'строка — «лояльность 51»: ' + mV);
  assert.ok(mV.includes('жалованье 1 з/день'),
    'строка — «жалованье 1 з/день» (та же строка, что 000083): ' + mV);
  const bV = rV.querySelector('button[data-squadact=dismiss]');
  assert.ok(bV, 'строка — кнопка «уволить» (data-squadact=dismiss)');
  assert.equal(bV.textContent, 'уволить', 'подпись кнопки «уволить»');
  assert.equal(bV.dataset.npcid, 'merc_volk', 'data-npcid — id записи');

  // Строка Ашки (запись level 3, loyalty 77; каталог: жалованье 1).
  const rA = rowByName(panel, 'Ашка');
  assert.ok(rA, 'строка «Ашка» (имя из каталога)');
  const mA = rowMeta(rA);
  assert.ok(mA.includes('уровень 3'), 'строка — «уровень 3» (из записи): ' + mA);
  assert.ok(mA.includes('лояльность 77'), 'строка — «лояльность 77»: ' + mA);
  assert.ok(mA.includes('жалованье 1 з/день'), 'строка — жалованье из каталога: ' + mA);
  const bA = rA.querySelector('button[data-squadact=dismiss]');
  assert.ok(bA, 'строка Ашки — кнопка «уволить»');
  assert.equal(bA.dataset.npcid, 'merc_ashka', 'data-npcid — id записи');
});

// --- P3: строка Эфира — уровень + HP + «всегда со мной», xp-бар;
// без лояльности/жалованья/кнопок; efir: null — строки нет ---

test('000086 P3: панель — строка Эфира «уровень 1 · HP 16/16 · всегда со мной» + xp-бар 0%; БЕЗ лояльности/жалованья/button; efir: null — строки НЕТ, наёмники рендерятся', () => {
  // (a) Эфир на месте (createEfir: level 1, xp 0 → efirStats(1): 16 HP).
  {
    const env = loadSquadUi();
    const roster = [entry('merc_volk')];
    const efir = env.G.efir.createEfir();
    squadOf(env).init({ roster, efir, onChange: () => {} });
    squadOf(env).toggle();
    const panel = panelOf(env);
    assert.ok(panel, 'панель .squad-panel в body');
    const row = rowByName(panel, 'Эфир');
    assert.ok(row, 'строка Эфира (имя «Эфир»)');
    const meta = rowMeta(row);
    assert.ok(meta.includes('уровень 1'), 'Эфир — «уровень 1»: ' + meta);
    assert.ok(meta.includes('HP 16/16'),
      'Эфир — «HP 16/16» (efirStats(1).maxHP = 16): ' + meta);
    assert.ok(meta.includes('всегда со мной'),
      'Эфир — «всегда со мной» (000081): ' + meta);
    assert.ok(!meta.includes('лояльность'),
      'В СТРОКЕ ЭФИРА НЕТ «лояльности» (000081: не наёмник)');
    assert.ok(!meta.includes('жалованье'),
      'В СТРОКЕ ЭФИРА НЕТ «жалованья» (000081: не наёмник)');
    assert.equal(row.querySelector('button[data-squadact]'), null,
      'В СТРОКЕ ЭФИРА НЕТ кнопки действий');
    // xp-бар: при xp 0 — width 0%.
    const bar = row.querySelector('.squad-xp');
    assert.ok(bar, 'xp-бар (.squad-xp) в строке Эфира');
    const fill = bar.querySelector('.squad-xp-fill');
    assert.ok(fill, 'заполнение xp-бара (.squad-xp-fill)');
    assert.equal(fill.style.width, '0%', 'xp 0 → width 0%');
    // Наёмник рядом (Эфир — не вместо, а ПОСЛЕ блока наёмников).
    assert.ok(rowByName(panel, 'Вольк'), 'строка наёмника на месте');
  }
  // (b) efir: null — строки «Эфир» НЕТ, наёмники рендерятся,
  // ошибок не прибавилось.
  {
    const env = loadSquadUi();
    const errs0 = env.errors.length;
    const roster = [entry('merc_volk')];
    squadOf(env).init({ roster, efir: null, onChange: () => {} });
    squadOf(env).toggle();
    const panel = panelOf(env);
    assert.ok(panel, 'панель .squad-panel в body');
    assert.equal(rowByName(panel, 'Эфир'), null, 'efir null — строки Эфира НЕТ');
    assert.ok(rowByName(panel, 'Вольк'), 'наёмники рендерятся');
    assert.equal(env.errors.length, errs0, 'новых ошибок нет: '
      + env.errors.join('; '));
  }
});

// --- P4: пустой отряд — точная строка ТЗ; Эфир — независимо ---

test('000086 P4: панель — пустой отряд: ТОЧНАЯ строка «Отряд пуст. Наймите спутников в таверне.»; .cp-itemrow наёмников НЕТ; строка Эфира ЕСТЬ', () => {
  const env = loadSquadUi();
  const efir = env.G.efir.createEfir();
  squadOf(env).init({ roster: [], efir, onChange: () => {} });
  squadOf(env).toggle();
  const panel = panelOf(env);
  assert.ok(panel, 'панель .squad-panel в body');
  assert.equal(squadOf(env).isOpen(), true, 'isOpen() true');
  const t = textOf(panel);
  assert.ok(t.includes('Отряд пуст. Наймите спутников в таверне.'),
    'точная строка пустого отряда из ТЗ: ' + t);
  // .cp-itemrow — только строка Эфира (наёмников нет).
  const rows = rowsOf(panel);
  assert.equal(rows.length, 1, 'строк наёмников НЕТ (ровно строка Эфира)');
  const nm = rows[0] && rows[0].querySelector('.cp-itemname');
  assert.equal(nm && nm.textContent, 'Эфир', 'единственная строка — Эфир');
});

// --- P5: увольнение из панели — live roster −1, onChange ×1 ---

test('000086 P5: панель — «уволить»: live-roster −1 (ТА ЖА ссылка), onChange ровно ×1, строка исчезла (пусто — точная строка, Эфир остался); повторный клик по отсутствующему id — без краха, onChange НЕ вызван', () => {
  const env = loadSquadUi();
  const roster = [entry('merc_volk')];
  const efir = env.G.efir.createEfir();
  let saves = 0;
  squadOf(env).init({ roster, efir, onChange: () => { saves += 1; } });
  squadOf(env).toggle();
  const panel = panelOf(env);
  assert.ok(panel, 'панель .squad-panel в body');
  const row = rowByName(panel, 'Вольк');
  assert.ok(row, 'строка «Вольк»');
  const btn = row.querySelector('button[data-squadact=dismiss]');
  assert.ok(btn, 'кнопка «уволить» в строке');
  // Клик через ОДИН делегированный обработчик на панели (паттерн
  // ui-panel: panel.listeners.click[0]({ target })).
  const clickers = panel.listeners.click || [];
  assert.ok(clickers.length >= 1, 'делегированный click-обработчик на панели');
  clickers[0]({ target: btn });
  assert.equal(env.errors.length, 0,
    'увольнение: ошибок нет: ' + env.errors.join('; '));
  assert.equal(roster.length, 0,
    'запись вырезана из live-roster (splice, ТА ЖА ссылка)');
  assert.equal(saves, 1, 'onChange ровно ×1 (точка сейва в main.js)');
  assert.equal(rowByName(panel, 'Вольк'), null,
    'строка исчезла (перерисовка панели)');
  assert.ok(textOf(panel).includes('Отряд пуст. Наймите спутников в таверне.'),
    'отряд опустел — точная строка');
  assert.ok(rowByName(panel, 'Эфир'), 'строка Эфира осталась');
  // Повторный клик по СТАЛОЙ кнопке (id уже не в отряде) — re-check
  // ВНУТРИ dismiss (паттерн 000083): без краха, onChange НЕ вызван.
  clickers[0]({ target: btn });
  assert.equal(roster.length, 0, 'roster не изменился (нет такой записи)');
  assert.equal(saves, 1, 'onChange НЕ вызван (увольнение не состоялось)');
});

// --- Полный бут (P6): вся цепочка index.html (паттерн bootSandbox
// tests/building-actions.test.js: WebGL-стаб, «снисходительный»
// Proxy-DOM, winListeners, drain setImmediate ×3) ---

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const FULL_CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g),
  (m) => m[1]).map((p) => p.replace(/^src\//, ''));
const NOW = 1000; // performance.now() в песочнице заморожен

function makeGl() {
  const noop = () => {};
  const gl = {
    VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713, LINK_STATUS: 35714,
    ARRAY_BUFFER: 34962, DYNAMIC_DRAW: 35048, FLOAT: 5126,
    COLOR_BUFFER_BIT: 1024, TRIANGLES: 4,
  };
  gl.createShader = () => ({});
  gl.shaderSource = noop;
  gl.compileShader = noop;
  gl.getShaderParameter = () => true; // иначе main.js бросит Error
  gl.getShaderInfoLog = () => '';
  gl.createProgram = () => ({});
  gl.attachShader = noop;
  gl.linkProgram = noop;
  gl.getProgramParameter = () => true;
  gl.getProgramInfoLog = () => '';
  gl.useProgram = noop;
  let attrib = 0;
  gl.getAttribLocation = () => attrib++;
  gl.getUniformLocation = () => ({});
  gl.enableVertexAttribArray = noop;
  gl.createBuffer = () => ({});
  gl.bindBuffer = noop;
  gl.bufferData = noop;
  gl.vertexAttribPointer = noop;
  gl.viewport = noop;
  gl.clearColor = noop;
  gl.clear = noop;
  gl.uniformMatrix4fv = noop;
  gl.drawArrays = noop;
  return gl;
}

function makeContext2d(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

function matchesSelFull(el, sel) {
  // 'tag', '.class', '[attr]', '[attr="value"]' и композиты без
  // пробела — дубль стаба tests/building-actions.test.js.
  let rest = String(sel).trim();
  let tag = null;
  let cls = null;
  let attr = null;
  const bm = rest.match(/\[([^\]=]+)(?:="([^"]*)")?\]$/);
  if (bm) {
    attr = [bm[1], bm[2]];
    rest = rest.slice(0, bm.index);
  }
  const cm = rest.match(/\.([A-Za-z0-9_-]+)$/);
  if (cm) {
    cls = cm[1];
    rest = rest.slice(0, cm.index);
  }
  if (rest) tag = rest;
  if (tag && String(el.tagName || '').toLowerCase() !== tag.toLowerCase()) {
    return false;
  }
  if (cls &&
      !String(el.className || '').split(/\s+/).includes(cls)) {
    return false;
  }
  if (attr) {
    if (!attr[0].startsWith('data-')) return false;
    const v = el.dataset ? el.dataset[attr[0].slice(5)] : undefined;
    if (v === undefined) return false;
    return attr[1] === undefined ? true : String(v) === attr[1];
  }
  return true;
}

function findAllFull(root, sel) {
  const out = [];
  const walk = (n) => {
    for (const ch of n.children || []) {
      if (matchesSelFull(ch, sel)) out.push(ch);
      walk(ch);
    }
  };
  walk(root);
  return out;
}

function makeElFull(tag) {
  const target = {
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
    // children хранят СУРЫЕ target (а не прокси): remove() ищет по
    // identity (дубль tests/building-actions.test.js).
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
      if (name.startsWith('data-')) {
        target.dataset[name.slice(5)] = value;
      }
    },
    getContext(kind) {
      if (tag !== 'canvas') return null;
      return kind === 'webgl' ? makeGl() : makeContext2d(target);
    },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    blur() {},
    closest(sel) {
      let n = target;
      while (n) {
        if (matchesSelFull(n, sel)) return n;
        n = n.parent;
      }
      return null;
    },
    querySelector(sel) { return findAllFull(target, sel)[0] || null; },
    querySelectorAll(sel) { return findAllFull(target, sel); },
  };
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
      return () => undefined; // неизвестный метод DOM — no-op
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

// --- Песочница: вся цепочка index.html (как building-actions BA5) ---

function bootSandboxFull() {
  const winListeners = {};
  const raf = [];
  const errors = [];
  const gameCanvas = makeElFull('canvas');
  const spriteCanvas = makeElFull('canvas');
  const hud = makeElFull('div');
  // #game — WebGL (без него main.js уходит в фолбэк-ветку и не
  // стартует); #sprites — 2d.
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl() : makeContext2d(gameCanvas));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? makeContext2d(spriteCanvas) : null);
  const body = makeElFull('body');
  const document = {
    createElement: (tag) => makeElFull(tag),
    getElementById: (id) => (
      id === 'game' ? gameCanvas
        : id === 'sprites' ? spriteCanvas
          : id === 'hud' ? hud
            : null),
    body,
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    hidden: false,
  };
  const window = {
    innerWidth: 1280,
    innerHeight: 720,
    location: { search: '' },
    confirm: () => false,
    // Семантика браузерного window: повторный add — no-op, remove —
    // реально снимает (дубль tests/building-actions.test.js).
    addEventListener: (t, f) => {
      const a = winListeners[t] || (winListeners[t] = []);
      if (!a.includes(f)) a.push(f);
    },
    removeEventListener: (t, f) => {
      const a = winListeners[t];
      if (!a) return;
      const i = a.indexOf(f);
      if (i >= 0) a.splice(i, 1);
    },
  };
  // Image-стаб: assets/map.png ВСЕГДА onerror (детерминированный
  // фолбэк G.generateSeedPixels, main.js loadMapPixels), остальные —
  // onload.
  function Image() {
    const self = this;
    self.naturalWidth = 0;
    self.naturalHeight = 0;
    Object.defineProperty(self, 'src', {
      configurable: true,
      get() { return self.__src; },
      set(v) {
        self.__src = v;
        Promise.resolve().then(() => {
          if (v === 'assets/map.png') {
            if (typeof self.onerror === 'function') self.onerror();
          } else if (typeof self.onload === 'function') {
            self.onload();
          }
        });
      },
    });
  }
  const sandbox = {
    console: {
      warn: () => {},
      error: (m) => errors.push(String(m)),
      log: () => {},
    },
    document,
    window,
    Image,
    performance: { now: () => NOW },
    requestAnimationFrame: (fn) => { raf.push(fn); return raf.length; },
    // Таймеры не гоняем: no-op (паттерн building-actions).
    setTimeout: () => 0,
    clearTimeout: () => {},
  };
  vm.createContext(sandbox);
  for (const f of FULL_CHAIN) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox,
      { filename: f });
  }
  return { sandbox, winListeners, raf, errors, body };
}

// Промывка микротасков (Image + loadMapPixels().then: карта, спавн,
// requestAnimationFrame).
const drain = () => new Promise((r) => setImmediate(r));

async function bootFull() {
  const h = bootSandboxFull();
  await drain();
  await drain();
  await drain();
  return h;
}

// --- P6: полный бут — KeyC открывает/закрывает панель; KeyI жив ---

test('000086 P6: полный бут — keydown KeyC: панель «Отряд» открывается (пустой отряд + строка Эфира) и закрывается; РЕГРЕССИЯ — KeyI открывает панель персонажа', async () => {
  const h = await bootFull();
  assert.equal(h.errors.length, 0,
    'ошибок при загрузке полной цепочки нет: ' + h.errors.join('; '));
  assert.ok(h.sandbox.__game, 'игра стартовала (__game выставлен)');
  const G = h.sandbox.Game;
  assert.ok(G.squadUI, 'Game.squadUI в полном боте (ui.js в цепочке)');
  // init проводкой main.js (ЖИВЫЕ ссылки) — панель инициализирована
  // к моменту старта.
  const key = (code) => {
    const e = { code, preventDefault() {} };
    for (const fn of h.winListeners['keydown'] || []) fn(e);
  };

  // (1) KeyC — панель открывается (свежий бут: пустой отряд + Эфир).
  key('KeyC');
  const panel = findAllFull(h.body, '.squad-panel')[0];
  assert.ok(panel, 'keydown KeyC → .squad-panel в body');
  assert.equal(panel.style.display, 'flex', 'панель открыта (display flex)');
  assert.equal(G.squadUI.isOpen(), true, 'isOpen() true');
  const t = textOf(panel);
  assert.ok(t.includes('Отряд пуст. Наймите спутников в таверне.'),
    'свежий бут — пустой отряд: точная строка: ' + t);
  assert.ok(t.includes('всегда со мной'),
    'строка Эфира (efir жив в main.js): ' + t);

  // (2) KeyC ещё раз — панель закрывается.
  key('KeyC');
  assert.equal(panel.style.display, 'none', 'повторный KeyC — display none');
  assert.equal(G.squadUI.isOpen(), false, 'isOpen() false');

  // (3) РЕГРЕССИЯ: KeyI — панель персонажа (KeyI жив, 000051).
  key('KeyI');
  const charPanel = findAllFull(h.body, '.char-panel')[0];
  assert.ok(charPanel, 'keydown KeyI → .char-panel в body (регрессия)');
  assert.equal(charPanel.style.display, 'flex',
    'панель персонажа открыта (KeyI не задет)');
});

// --- S1–S3: структурные пины src/main.js (чтение текста; паттерн
// tests/combat-keys.test.js / tests/ui-panel.test.js) ---

test('000086 S1: main.js (структурный): ветка KeyC в keydown — G.squadUI.toggle() + return; ПОСЛЕ KeyI, ДО KeyE, ДО движения/гейтов', () => {
  const text = src('main.js');
  const kd = text.indexOf("window.addEventListener('keydown'");
  assert.notEqual(kd, -1, 'keydown в main.js не найден');
  const iKeyI = text.indexOf("e.code === 'KeyI'", kd);
  const iKeyC = text.indexOf("e.code === 'KeyC'", kd);
  const iKeyE = text.indexOf("e.code === 'KeyE'", kd);
  const iMove = text.indexOf('const k = moveKey(e);', kd);
  assert.ok(iKeyI > kd, 'ветка KeyI в keydown (регрессия)');
  assert.ok(iKeyC > kd, 'ветка KeyC в keydown (000086)');
  assert.ok(iKeyE > kd, 'ветка KeyE в keydown (регрессия)');
  assert.ok(iMove > kd, 'обработка движения в keydown (регрессия)');
  assert.ok(iKeyC > iKeyI, 'KeyC — ПОСЛЕ ветки KeyI');
  assert.ok(iKeyC < iKeyE, 'KeyC — ДО ветки KeyE');
  assert.ok(iKeyC < iMove, 'KeyC — ДО движения (до всех гейтов, как KeyI)');
  const branch = text.slice(iKeyC, iKeyE);
  assert.ok(/G\.squadUI\s*\.\s*toggle\s*\(/.test(branch),
    'ветка KeyC вызывает G.squadUI.toggle()');
  assert.ok(/return\s*;/.test(branch), 'ветка KeyC заканчивается return');
});

test('000086 S2: main.js (структурный): G.squadUI.init({roster, efir, onChange: saveNow}) — ЖИВЫЕ ссылки + хук сейва', () => {
  const text = src('main.js');
  const i = text.indexOf('G.squadUI.init(');
  assert.ok(i > -1, 'вызов G.squadUI.init( в main.js (проводка 000086)');
  const call = text.slice(i, i + 300);
  assert.ok(call.includes('roster'),
    'init: ЖИВАЯ ссылка roster (мутация hire/dismiss видна панели)');
  assert.ok(call.includes('efir'),
    'init: ЖИВАЯ ссылка efir (addEfirXp виден панели)');
  assert.ok(call.includes('onChange'),
    'init: onChange-хук (сейв в main.js)');
  assert.ok(call.includes('saveNow'),
    'init: onChange — saveNow (ТЗ: «G.companions.dismiss + onChange → saveNow»)');
});

test('000086 S3: main.js (структурный): панель закрывается (squadUI.toggle(false) под guardом isOpen()) во ВСЕХ входах боя (≥3)', () => {
  // Поведенческого теста main.js в проекте нет (бой не запускается
  // в песочнице) — структурный, зеркало пина playerUI в
  // tests/ui-panel.test.js (≥3: мир + подземелье + отладочный).
  const text = src('main.js');
  const closers = text.match(
    /isOpen\s*\(\s*\)[\s\S]{0,120}?squadUI\s*\.\s*toggle\s*\(\s*false\s*\)/g) || [];
  assert.ok(closers.length >= 3,
    'squadUI.toggle(false) под guardом isOpen() найдено во ВСЕХ ' +
    'входах боя (мир + подземелье + отладочный), найдено: '
    + closers.length);
});

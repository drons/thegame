// Задача 000352 — BUG: при нажатии на некоторые кнопки движения
// (экранный D-pad) глифы ▲▼◀▶ выделяются как текст.
//
// Механизм бага: текстовые span-глифы внутри .tc-dpad при отсутствии
// user-select:none в каскаде. preventDefault на pointerdown выделение
// мыши НЕ отменяет (compatibility mousedown диспатчится независимо),
// dblclick/долгое нажатие — свои пути выделения. Средство — прецедент
// мира (.combat-placebar-btn, index.html): декларация user-select:none
// на контейнере D-pad (свойство наследуется ⇒ покрывает все 4 стрелки
// и любой будущий текст контрола). Охват: экранные КНОПКИ ДВИЖЕНИЯ —
// ровно D-pad (в схеме 'keyboard' экранных кнопок движения нет, 000123);
// .tc-action ([E]/[I]/«Отряд») — содержимое только <img>, выделять
// нечего; сверка скоупа — T3 и memory/000352-btn-text-select.md.
//
// Слой проверок (computed-стили DOM-стабами недоступны — пин
// CSS-источника по образцу tests/ui-panel.test.js #touch-controls/
// z-index; поведенческий guard — vm-сборка контролов по образцу
// tests/ui-touch-visibility.test.js TV3):
//   T1 (КРАСНЫЙ до фикса): правило одного из D-pad-селекторов
//     (#touch-controls/.tc-dpad/.tc-arrow) объявляет user-select, и все
//     такие декларации — 'none' (негатив: text/auto/all запрещены).
//   T2 (guard, зелёный и до, и после): фикс не имел права сломать
//     pointer-конвейер (preventDefault на pointerdown D-pad, onHold/
//     onRelease, скольжение) и разметку (4 span.tc-arrow с глифами —
//     «лечить» вырезанием текста нельзя; 3 .tc-action с
//     pointerdown+preventDefault+blur). Механизм — CSS-каскад: на D-pad
//     НЕ висит mousedown-слушателя (обработчик-дубль отвергнут).
//   T3 (скоуп-регистр, зелёный): прецедент .combat-placebar-btn цел;
//     house-style index.html — без -webkit-префиксов; у .tc-action
//     внутри только <img> (выделяемого текста нет ⇒ вне скоупа фикса;
//     000356, легитимно вернувшему туда текст, подавлять выделение
//     обязанному OWN-правки — ре-пин этого теста не требуется).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const controlsCode = fs.readFileSync(
  path.join(ROOT, 'src', 'controls.js'), 'utf8');
const uiCode = fs.readFileSync(path.join(ROOT, 'src', 'ui.js'), 'utf8');

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

function ruleDecls(selector) {
  const esc = selector.replace(/[.#]/g, '\\$&');
  const m = html.match(new RegExp(esc + '\\s*\\{([^}]*)\\}'));
  return m ? declMap(m[1]) : null;
}

const DPAD_SELECTORS = ['#touch-controls', '.tc-dpad', '.tc-arrow'];

test('T1: D-pad невыделяем в CSS-источнике — user-select:none на D-pad-селекторе', () => {
  const declarations = [];
  const found = [];
  for (const sel of DPAD_SELECTORS) {
    const d = ruleDecls(sel);
    if (!d) continue;
    found.push(sel);
    if ('user-select' in d) declarations.push([sel, d['user-select']]);
  }
  assert.ok(found.length > 0,
    'хотя бы одно CSS-правило D-pad-селекторов найдено в index.html');
  assert.ok(declarations.length >= 1,
    'ни одно правило D-pad-селекторов (' + DPAD_SELECTORS.join('/') +
    ') не объявляет user-select — глифы ▲▼◀▶ выделяются как текст ' +
    '(баг 000352: drag/двойное нажатие по кнопкам движения)');
  for (const [sel, value] of declarations) {
    assert.equal(value, 'none',
      'user-select у ' + sel + ' = ' + JSON.stringify(value) +
      ', ожидалось none (selectable-значение вернуло бы баг)');
  }
});

function stubEl(tag) {
  const n = {
    tagName: tag,
    className: '',
    textContent: '',
    id: '',
    style: {},
    children: [],
    listeners: {},
    classList: { add() {}, remove() {} },
    appendChild(ch) { n.children.push(ch); return ch; },
    addEventListener(type, fn) {
      (n.listeners[type] || (n.listeners[type] = [])).push(fn);
    },
    removeEventListener() {},
    setAttribute() {},
    setPointerCapture() {},
    blur() { n.blurCalls = (n.blurCalls || 0) + 1; },
  };
  return n;
}

function bootControls() {
  const errors = [];
  const holds = [], releases = [];
  const fired = { interact: 0, inventory: 0, squad: 0 };
  const body = stubEl('body');
  const sandbox = {
    console: { error: (m) => errors.push(String(m)), log() {} },
    document: {
      createElement: (tag) => stubEl(tag),
      body,
      addEventListener() {},
      removeEventListener() {},
      querySelector: () => null,
      hidden: false,
    },
    window: {
      innerWidth: 1280,
      innerHeight: 720,
      addEventListener() {},
      removeEventListener() {},
    },
  };
  sandbox.Game = {};
  vm.createContext(sandbox);
  vm.runInContext(controlsCode, sandbox, { filename: 'controls.js' });
  vm.runInContext(uiCode, sandbox, { filename: 'ui.js' });
  const tc = sandbox.Game.touchControls;
  tc.init({
    dpad: true,
    onHold: (dir) => holds.push(dir),
    onRelease: (dir) => releases.push(dir),
    onInteract: () => { fired.interact++; },
    onInventory: () => { fired.inventory++; },
    onSquad: () => { fired.squad++; },
  });
  tc.show();
  const root = body.children.find((c) => c.id === 'touch-controls');
  const dpad = root.children.find((c) => c.className === 'tc-dpad');
  const actions = root.children.filter((c) => c.className === 'tc-action');
  const layout = sandbox.Game.layoutTouchControls(1280, 720,
    { bottomInset: 0 });
  // Точки направлений — тот же оффсет 0.30·w от центра, что applyLayout.
  const dpadPoint = (dir) => {
    const d = layout.dpad;
    const off = d.w * 0.30;
    const cx = d.x + d.w / 2, cy = d.y + d.h / 2;
    return dir === 'right' ? { x: cx + off, y: cy }
      : dir === 'left' ? { x: cx - off, y: cy }
        : dir === 'down' ? { x: cx, y: cy + off }
          : { x: cx, y: cy - off };
  };
  return { errors, holds, releases, fired, dpad, actions, dpadPoint };
}

test('T2: pointer-конвейер и разметка D-pad целы — фикс не сломал клики/тач', () => {
  const env = bootControls();
  assert.deepEqual(env.errors, [], 'сборка контролов без ошибок консоли');
  assert.ok(env.dpad, 'div.tc-dpad построен при init({dpad:true})');

  // Разметка: 4 span.tc-arrow с глифами ВНУТРИ dpad — «лечить»
  // выделение вырезанием текста фикс не имеет права.
  const arrows = env.dpad.children.filter((c) => c.className === 'tc-arrow');
  assert.equal(arrows.length, 4, 'ровно 4 span.tc-arrow внутри .tc-dpad');
  for (const a of arrows) assert.equal(a.tagName, 'span');
  assert.deepEqual(arrows.map((a) => a.textContent).sort(),
    ['▼', '◀', '▶', '▲'].sort(),
    'глифы направлений ▲▼◀▶ на месте');

  // Механизм — CSS-каскад: D-pad слушает pointer*-события, НО НЕ mousedown
  // (compatibility-слушатель — отвергнутый дубль средства).
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
    assert.ok(env.dpad.listeners[type] && env.dpad.listeners[type].length === 1,
      'у .tc-dpad ровно один слушатель ' + type);
  }
  assert.equal(env.dpad.listeners.mousedown, undefined,
    'у .tc-dpad нет mousedown-слушателя (выделение подаёт CSS, не JS-дубль)');

  // Поведение: down('right') → move('up') → up — смена направления
  // и отпускание; preventDefault на pointerdown вызывается (гард:
  // фикс не выпилил его).
  const right = env.dpadPoint('right');
  const up = env.dpadPoint('up');
  let pdCalls = 0;
  const pd = () => { pdCalls++; };
  env.dpad.listeners.pointerdown[0](
    { clientX: right.x, clientY: right.y, pointerId: 1, preventDefault: pd });
  assert.equal(pdCalls, 1, 'pointerdown: preventDefault вызван');
  assert.deepEqual(env.holds, ['right'], 'held: right');
  env.dpad.listeners.pointermove[0](
    { clientX: up.x, clientY: up.y, pointerId: 1 });
  assert.deepEqual(env.releases, ['right'], 'скольжение: right отпущен');
  assert.deepEqual(env.holds, ['right', 'up'], 'скольжение: up взят');
  env.dpad.listeners.pointerup[0]({ pointerId: 1 });
  assert.deepEqual(env.releases, ['right', 'up'], 'pointerup: up отпущен');

  // Кнопки [E]/[I]/«Отряд» (вне скоупа ТЗ — скоуп-страховка): тот же
  // конвейер pointerdown → preventDefault → callback → blur.
  assert.equal(env.actions.length, 3, 'три кнопки .tc-action');
  const perButton = [];
  for (const btn of env.actions) {
    let btnPd = 0;
    btn.listeners.pointerdown[0](
      { pointerId: 2, preventDefault: () => { btnPd++; } });
    perButton.push([btnPd, btn.blurCalls || 0]);
  }
  assert.deepEqual(perButton, [[1, 1], [1, 1], [1, 1]],
    'каждая .tc-action: preventDefault и blur ровно по одному разу');
  assert.deepEqual(env.fired, { interact: 1, inventory: 1, squad: 1 },
    'колбэки кнопок вызваны по одному разу');
});

test('T3: скоуп-регистр — прецедент цел, house-style без префиксов, у кнопок выделять нечего', () => {
  const placebar = ruleDecls('.combat-placebar-btn');
  assert.ok(placebar && placebar['user-select'] === 'none',
    'прецедент мира: .combat-placebar-btn сохраняет user-select:none');
  assert.ok(!html.includes('-webkit-'),
    'house-style index.html — без -webkit-префиксов (фикс — без префикса)');
  const env = bootControls();
  for (const btn of env.actions) {
    assert.ok(btn.children.length >= 1, '.tc-action не пуста');
    for (const ch of btn.children) {
      assert.equal(ch.tagName, 'img',
        'содержимое .tc-action — только <img> (текстовых узлов нет ⇒ ' +
        'выделение физически невозможно, кнопка вне скоупа 000352)');
    }
  }
});

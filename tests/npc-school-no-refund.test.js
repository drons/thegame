// Школа NPC: кнопка «Вернуть» удалена (задача 000297, анти-эксплойт) —
// RED-тесты (UI-слой vm + source-пин). Код игры (src/ui.js, src/npc.js)
// НЕ меняется на красной стадии: удаление кнопки/хендлера/метки и API —
// зелёная стадия (конвенция 000296: ТЗ-красные закоммичены, реализация —
// тем же коммитом, что и правки).
//
// Контракт: memory/000297-npc-school-refund-removed.md (§5, T1–T3):
//   T1. vm: NPC 000005 (Карк, постройки [7], обучение
//       ['swordsman','heavy'], диалог-опция id 'train' действие
//       'обучение' БЕЗ требований): клик вкладки data-tab='train' → в
//       оверлее НУЛЬ button[data-npcact="refund"], ни одна .cp-btn не
//       содержит «вернуть», .cp-itemmeta каждой строки = «+1 за 20 з»
//       (L=0, формула 000296) и не содержит «вернуть»; регрессия:
//       button[data-npcact="train"] ×2 на месте, строка «Свободные
//       очки: 0» на месте (D4 — остаётся), errors.length === 0.
//   T2. vm: клик bTrain (swordsman) → gold 100→80, swordsman 0→1,
//       points 0 (очки НЕ чеканятся даже через UI); после перерисовки
//       (renderTab в хендлере) refund-кнопки по-прежнему НЕТ;
//       typeof G.schoolRefund === 'undefined' (API удалён, R1).
//   T3. source-пин: src/ui.js НЕ содержит `npcact = 'refund'` И
//       `act === 'refund'` (защита от воскрешения хендлера: при
//       удалённом API живой хендлер упал бы в TypeError на клике).
//
// Краснота ОСМЫСЛЕННАЯ (все модули грузятся, вкладка рендерится):
//   T1 — кнопка «вернуть (40 з)» на месте (data-npcact="refund") +
//       метка «+1 за 20 з / вернуть 1 за 40 з»;
//   T2 — после перерисовки refund-кнопка на месте + G.schoolRefund
//       определён;
//   T3 — обе подстроки в ui.js (кнопка L1056-1064, ветка
//       onOverlayClick L1369-1376).
// expectedRedCount (файл) = 3 (T1, T2, T3).
//
// Локальный DOM-стаб — дублирование стаба tests/npc-hire.test.js
// (дублирование стабов принято в проекте): onOverlayClick использует
// e.target.closest('button[data-npcact]') — matchesSel расширен под
// атрибут-селекторы. CHAIN — копия цепочки из index.html до ui.js
// включительно (регрессия порядка — tests/index-order.test.js).
//
// Файл НЕ содержит литерала «SPEC» + «453» (скан-тест SPEC-453-GONE в
// tests/spec-split.test.js читает tests/; needle собирается из частей).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');

// --- Минимальный DOM-стаб с деревом (дубль tests/npc-hire.test.js) ---

function matchesSel(el, sel) {
  // 'тег[атрибут]' / 'тег[атрибут=значение]' — для
  // onOverlayClick (e.target.closest('button[data-npcact]')).
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
  // textContent = '' — как в DOM, сбрасывает детей (renderTab()
  // очищает body перед повторной отрисовкой).
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

// Цепочка из index.html до ui.js включительно (порядок ВАЖЕН — как в
// tests/npc-hire.test.js; регрессия порядка — tests/index-order.test.js).
const CHAIN = [
  'global-settings.js', 'perlin.js', 'mapseed.js',
  'skills-data.js', 'items-data.js', 'npc-data.js',
  'map.js', 'sheet.js', 'player.js', 'day.js', 'items.js', 'buildings.js',
  'npc.js', 'combat.js', 'dungeon.js',
  'controls.js', 'combat-keys.js', 'ui.js',
];

// Загрузка цепочки в vm-песочницу. Возвращает { G, body, errors }.
function loadSchoolUi() {
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

// --- Хелперы ---

// NPC 000005 (Карк): постройки [7], диалог-опция id 'train' действие
// 'обучение' БЕЗ требований (открывается свежему персонажу),
// обучение ['swordsman','heavy'] (контракт §5 T1).
function karkOf(env) {
  const npc = (env.G.NpcData && env.G.NpcData.NPCS || [])
    .find((n) => n && n.имя === 'Карк');
  assert.ok(npc, 'NPC «Карк» (000005) в каталоге Game.NpcData.NPCS');
  // Array.from — host-массив: npc-данные — vm-реализм, deepStrictEqual
  // падает на прототипе (паттерн tests/npc-hire.test.js).
  assert.deepEqual(Array.from(npc.обучение.навыки), ['swordsman', 'heavy'],
    'обучение = [swordsman, heavy]');
  const opt = npc.диалог.find((x) => x.id === 'train');
  assert.ok(opt && opt.действие === 'обучение' && !opt.требования,
    'диалог-опция id «train» (действие «обучение», без требований)');
  return npc;
}

// Открыть диалог NPC; вернуть { c, overlay }.
function openNpcDialog(env, npc) {
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  assert.ok(env.G.npcUI, 'Game.npcUI создан (npc.js + ui.js загружены)');
  const c = env.G.createCharacter();
  env.G.npcUI.open({
    npc, character: c, book: env.G.createQuestBook(),
  });
  const overlay = findAll(env.body, '.npc-overlay')[0];
  assert.ok(overlay, 'оверлей .npc-overlay подвешен к body');
  assert.equal(env.G.npcUI.isActive(), true, 'диалог открыт');
  return { c, overlay };
}

// Кнопка вкладки «школа» (data-tab='train') в ряде вкладок.
function trainTabButton(overlay) {
  const b = findAll(overlay, '.cp-btn')
    .find((x) => x.dataset.npcact === 'tab' && x.dataset.tab === 'train');
  assert.ok(b, 'вкладка «школа» (data-tab="train") в ряде вкладок');
  return b;
}

// Клик через ЕДИНСТВЕННЫЙ делегированный обработчик оверлея
// (паттерн npc-hire: overlay.listeners.click[0]({ target })).
function overlayClick(overlay, target) {
  const clickers = overlay.listeners.click || [];
  assert.ok(clickers.length >= 1, 'делегированный click-обработчик оверлея');
  clickers[0]({ target });
}

function bodyOf(overlay) {
  const body = findAll(overlay, '.cp-items')[0];
  assert.ok(body, 'тело оверлея .cp-items найдено');
  return body;
}

// Полный текст узла (рекурсивно).
function textOf(node) {
  let s = node._text || '';
  for (const ch of node.children || []) s += textOf(ch);
  return s;
}

// --- KРАСНЫЕ: ТЗ 000297 «Красные» — кнопки в UI школы нет ---

test('npcUI школа 000297 T1: вкладка train (Карк) — НЕТ button[data-npcact="refund"], ни одна .cp-btn без «вернуть», метка строки = «+1 за 20 з» (регрессия: train ×2, «Свободные очки: 0», 0 ошибок)', () => {
  const env = loadSchoolUi();
  const { overlay } = openNpcDialog(env, karkOf(env));
  overlayClick(overlay, trainTabButton(overlay));

  assert.equal(findAll(overlay, 'button[data-npcact="refund"]').length, 0,
    'кнопок button[data-npcact="refund"] в оверлее НЕТ');
  for (const b of findAll(overlay, '.cp-btn')) {
    assert.ok(!textOf(b).includes('вернуть'),
      'кнопка «' + textOf(b) + '» не содержит «вернуть»');
  }
  const body = bodyOf(overlay);
  const rows = findAll(body, '.cp-itemrow');
  assert.equal(rows.length, 2,
    'строки: swordsman и heavy (обучение Карка)');
  for (const r of rows) {
    const meta = r.querySelector('.cp-itemmeta');
    assert.ok(meta, 'строка несёт .cp-itemmeta');
    assert.equal(meta.textContent, '+1 за 20 з',
      'метка строки = «+1 за 20 з» (L=0, формула 000296), без «вернуть»');
  }
  assert.equal(findAll(overlay, 'button[data-npcact="train"]').length, 2,
    'кнопки button[data-npcact="train"] ×2 на месте (регрессия)');
  const metas = findAll(body, '.cp-itemmeta').map((m) => m.textContent);
  assert.ok(metas.includes('Свободные очки: 0'),
    'строка «Свободные очки: 0» на месте (D4 — остаётся)');
  assert.equal(env.errors.length, 0,
    'ошибок цепочки нет: ' + env.errors.join('; '));
});

test('npcUI школа 000297 T2: клик bTrain (swordsman) — gold 100→80, swordsman 1, points 0 (очки НЕ чеканятся); после перерисовки refund-кнопок НЕТ, G.schoolRefund undefined', () => {
  const env = loadSchoolUi();
  const { c, overlay } = openNpcDialog(env, karkOf(env));
  overlayClick(overlay, trainTabButton(overlay));
  const bTrain = findAll(overlay, 'button[data-npcact="train"]')
    .find((b) => b.dataset.skill === 'swordsman');
  assert.ok(bTrain, 'bTrain (swordsman) на месте');
  assert.equal(c.gold, 100, 'старт: gold 100');

  overlayClick(overlay, bTrain);

  assert.equal(c.gold, 80, 'gold 100→80 (L=0 → 20, формула 000296)');
  assert.equal(c.secondary.swordsman, 1, 'swordsman 0→1');
  assert.equal(c.points, 0, 'очки НЕ чеканятся (даже через UI)');
  // Хендлер train перерисовал вкладку (renderTab): refund-кнопки
  // по-прежнему НЕТ, API на Game не определён.
  assert.equal(findAll(overlay, 'button[data-npcact="refund"]').length, 0,
    'после перерисовки refund-кнопок нет');
  assert.equal(typeof env.G.schoolRefund, 'undefined',
    'G.schoolRefund — undefined (API удаления, R1)');
  assert.equal(env.errors.length, 0,
    'ошибок нет: ' + env.errors.join('; '));
});

test('ui.js 000297 T3: source-пин — нет `npcact = \'refund\'` и `act === \'refund\'` (кнопка и ветка хендлера удалены)', () => {
  const ui = src('ui.js');
  assert.ok(!ui.includes("npcact = 'refund'"),
    "src/ui.js: нет привязки `npcact = 'refund'` (кнопка удалена)");
  assert.ok(!ui.includes("act === 'refund'"),
    "src/ui.js: нет ветки `act === 'refund'` в onOverlayClick");
});

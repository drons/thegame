// Вкладка «найм» диалога NPC (Game.npcUI) — задача 000078 (слой данных).
//
// Слой: ряд вкладок оверлея .npc-overlay и тонкий DOM-слой вкладки
// «найм» (src/ui.js, блок Game.npcUI). Ядро — src/npc.js
// (hireCandidates — tests/npc.test.js); данные — каталог assets/npc
// (зеркало src/npc-data.js — tests/npc-data.test.js).
//
// Требования (КРАСНЫЕ — падают до реализации, зелёные после):
//   * ряд вкладок — 5 вкладок, включая «найм» (data-tab='hire',
//     подпись «найм»); базовые 4 вкладки на месте (регрессия);
//   * опция диалога с действием «найм» ОТКРЫВАЕТ вкладку «найм»:
//     список кандидатов ЧИТАЕМЫЙ (имя, боевая роль, цена контракта,
//     жалованье/день) — из данных (Game.NpcData) через G.hireCandidates;
//   * список кандидатов — из данных, детерминированно: порядок строк
//     = порядок файлов каталога; строка — .cp-itemrow с .cp-itemname
//     (имя) и .cp-itemmeta (роль/контракт/жалованье);
//   * доступ к найму — через СУЩЕСТВУЮЩИЙ механизм «требования»
//     (паттерн Оратора): найм-опция с требованиями — кнопка disabled,
//     title = причина; после прокачки — доступна, клик открывает
//     вкладку. НОВОЙ системы проверок нет.
//
// Кнопки «нанять»/«уволить» и блок «Отряд» — НЕ здесь (задача 000083);
// эта задача добавляет ЧИТАЕМЫЙ список кандидатов и проводку
// действие→вкладка.
//
// Локальный DOM-стаб — дублирование стаба tests/ui-panel.test.js
// (дублирование стабов принято в проекте) + расширение: onOverlayClick
// использует e.target.closest('button[data-npcact]') — атрибут-селектор,
// которого нет в стабе ui-panel (только '.class' и теги). matchesSel
// расширен: 'тег[атрибут]' и 'тег[атрибут=значение]'.
//
// CHAIN — копия цепочки из index.html до ui.js включительно
// (как в tests/ui-panel.test.js): global-settings.js … ui.js.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');

// --- Минимальный DOM-стаб с деревом (дубль tests/ui-panel.test.js) ---

function matchesSel(el, sel) {
  // 'тег[атрибут]' / 'тег[атрибут=значение]' — расширение для
  // onOverlayClick (e.target.closest('button[data-npcact]')).
  const m = /^([a-zA-Z][\w-]*)\[([\w-]+)(?:=([^\]]+))?\]$/.exec(sel);
  if (m) {
    if (String(el.tagName || '').toLowerCase() !== m[1].toLowerCase()) {
      return false;
    }
    // Стаб хранит атрибуты dataset БЕЗ префикса 'data-' (ui.js пишет
    // btn.dataset.npcact напрямую); setAttribute — с именем как есть.
    // Проверяем оба варианта ключа.
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
// tests/ui-panel.test.js; регрессия порядка — tests/index-order.test.js).
const CHAIN = [
  'global-settings.js', 'perlin.js', 'mapseed.js',
  'skills-data.js', 'items-data.js', 'npc-data.js',
  'map.js', 'player.js', 'day.js', 'items.js', 'buildings.js',
  'npc.js', 'combat.js', 'dungeon.js',
  'controls.js', 'combat-keys.js', 'ui.js',
];

// Загрузка цепочки в vm-песочницу. Возвращает { G, body, errors }:
// G — Game песочницы, body — document.body (к нему подвешен оверлей),
// errors — console.error.
function loadHireUi() {
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

// Кандидаты найма в каталоге (порядок файлов = порядок NPCS).
function candidatesOf(G) {
  return (G.NpcData && G.NpcData.NPCS || [])
    .filter((n) => n && n.найм && typeof n.найм === 'object');
}

function assertCandidates(env) {
  const candidates = candidatesOf(env.G);
  assert.ok(candidates.length >= 1,
    'в каталоге есть NPC с найм-данными (задача 000078): найдено '
    + candidates.length);
  return candidates;
}

// Первый кандидат в каталоге, у которого найм-опция БЕЗ требований
// (открывается свежему персонажу) — для сценария «клик → вкладка».
function firstPlainHireOption(env) {
  for (const n of env.G.NpcData.NPCS || []) {
    if (!n || !n.найм || typeof n.найм !== 'object') continue;
    const o = n.диалог.find((x) => x.действие === 'найм');
    if (o && !o.требования) return { npc: n, opt: o };
  }
  return null;
}

// Первая в каталоге найм-опция С требованиями (механизм доступа).
function firstReqHireOption(env) {
  for (const n of env.G.NpcData.NPCS || []) {
    if (!n || !n.найм || typeof n.найм !== 'object') continue;
    const o = n.диалог.find(
      (x) => x.действие === 'найм' && x.требования);
    if (o) return { npc: n, opt: o };
  }
  return null;
}

// Открыть диалог NPC; вернуть { c, overlay, btn(optId) }.
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

// Кнопка опции диалога по optId (renderDialogTab: dataset.npcact='opt').
function optButton(overlay, optId) {
  return findAll(overlay, '.cp-btn')
    .find((b) => b.dataset.npcact === 'opt' && b.dataset.optid === optId);
}

// Клик через ЕДИНСТВЕННЫЙ делегированный обработчик оверлея
// (паттерн ui-panel/ui-skills: overlay.listeners.click[0]({ target }));
// onOverlayClick ищет кнопку closest('button[data-npcact]') — стаб
// расширен под атрибут-селектор (см. matchesSel).
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

// Полный текст узла (рекурсивно) — для проверки «ЧИТАЕМЫЙ список».
function textOf(node) {
  let s = node._text || '';
  for (const ch of node.children || []) s += textOf(ch);
  return s;
}

// --- КРАСНЫЕ: вкладка «найм» в ряде вкладок ---

test('npcUI: ряд вкладок — 5 вкладок, включая «найм» (data-tab="hire")', () => {
  const env = loadHireUi();
  assertCandidates(env);
  const entry = firstPlainHireOption(env);
  assert.ok(entry, 'кандидат без требований доступа к найму есть в каталоге');
  const { overlay } = openNpcDialog(env, entry.npc);

  const tabs = findAll(overlay, '.cp-btn')
    .filter((b) => b.dataset.npcact === 'tab');
  const byId = new Map(tabs.map((t) => [t.dataset.tab, t]));
  for (const id of ['dialog', 'trade', 'train', 'quests']) {
    assert.ok(byId.has(id), 'базовая вкладка ' + id + ' на месте (регрессия)');
  }
  const hire = byId.get('hire');
  assert.ok(hire, 'вкладка «найм» (data-tab="hire") в ряде вкладок');
  assert.equal(hire.textContent, 'найм', 'подпись вкладки «найм»');
});

// --- КРАСНЫЕ: действие «найм» → вкладка «найм» (ЧИТАЕМЫЙ список) ---

test('npcUI: опция «найм» открывает вкладку найм — кандидаты из данных', () => {
  const env = loadHireUi();
  const candidates = assertCandidates(env);
  const entry = firstPlainHireOption(env);
  assert.ok(entry, 'кандидат без требований доступа к найму есть в каталоге');
  const { c, overlay } = openNpcDialog(env, entry.npc);
  assert.ok(c, 'персонаж создан');

  const btn = optButton(overlay, entry.opt.id);
  assert.ok(btn, 'найм-опция диалога отрисована кнопкой');
  assert.equal(btn.disabled, false, 'без требований — опция доступна');

  overlayClick(overlay, btn);

  // Вкладка переключилась на «найм»: тело — ЧИТАЕМЫЙ список ВСЕХ
  // кандидатов каталога (имя, боевая роль, цена контракта, жалованье).
  const text = textOf(bodyOf(overlay));
  for (const m of candidates) {
    assert.ok(text.includes(m.имя),
      'кандидат «' + m.имя + '» есть во вкладке найм');
    assert.ok(text.includes(String(m.найм.роль)),
      m.имя + ': боевая роль «' + m.найм.роль + '» отрисована');
    assert.ok(text.includes(String(m.найм.цена)),
      m.имя + ': цена контракта ' + m.найм.цена + ' отрисована');
    assert.ok(text.includes(String(m.найм.жалованье)),
      m.имя + ': жалованье ' + m.найм.жалованье + ' отрисовано');
  }
});

// --- КРАСНЫЕ: список кандидатов — из данных, детерминированно ---

test('npcUI: список кандидатов — из данных, порядок = порядок каталога', () => {
  const env = loadHireUi();
  const candidates = assertCandidates(env);
  const entry = firstPlainHireOption(env);
  assert.ok(entry, 'кандидат без требований доступа к найму есть в каталоге');
  const { overlay } = openNpcDialog(env, entry.npc);

  overlayClick(overlay, optButton(overlay, entry.opt.id));

  const body = bodyOf(overlay);
  const rows = findAll(body, '.cp-itemrow');
  // Array.from (а не candidates.map): candidates — массив vm-контекста,
  // .map на нём вернул бы массив VM-реализма (другой prototype) —
  // deepStrictEqual упал бы на прототипе, несмотря на равные строки.
  const expected = Array.from(candidates, (n) => n.имя);
  const names = rows.map((r) => {
    const nm = r.querySelector('.cp-itemname');
    assert.ok(nm, 'строка кандидата несёт .cp-itemname (имя)');
    return nm.textContent;
  });
  assert.deepEqual(names, expected,
    'строки кандидатов в порядке каталога (без дублей и пропусков)');

  // У каждой строки — .cp-itemmeta с ролью, ценой контракта и жалованьем.
  rows.forEach((r, i) => {
    const meta = r.querySelector('.cp-itemmeta');
    assert.ok(meta, 'строка ' + i + ' несёт .cp-itemmeta');
    const t = meta.textContent;
    const m = candidates.find((x) => x.имя === names[i]);
    assert.ok(m, 'строка ' + i + ' соответствует кандидату каталога');
    assert.ok(t.includes(String(m.найм.роль)),
      m.имя + ': meta содержит роль «' + m.найм.роль + '»');
    assert.ok(t.includes(String(m.найм.цена)),
      m.имя + ': meta содержит цену контракта ' + m.найм.цена);
    assert.ok(t.includes(String(m.найм.жалованье)),
      m.имя + ': meta содержит жалованье ' + m.найм.жалованье);
  });

  // Детерминизм: повторный render той же вкладки — тот же список.
  env.G.npcUI.render();
  const names2 = findAll(bodyOf(overlay), '.cp-itemrow')
    .map((r) => r.querySelector('.cp-itemname').textContent);
  assert.deepEqual(names2, expected, 'render() не меняет порядок списка');
});

// --- КРАСНЫЕ: доступ к найму — существующие «требования» (паттерн Оратора) ---

test('npcUI: найм-опция с требованиями — disabled + причина; после прокачки — вкладка', () => {
  const env = loadHireUi();
  assertCandidates(env);
  const entry = firstReqHireOption(env);
  assert.ok(entry,
    'хотя бы одна найм-опция с требованиями (механизм доступа к найму, '
    + 'паттерн Оратора): не найдена');
  const { c, overlay } = openNpcDialog(env, entry.npc);

  const reqNpc = entry.npc;
  const reqOpt = entry.opt;
  const req = reqOpt.требования;
  // Свежий персонаж требований НЕ выполняет (Харизма старт = 1,
  // вторичных навыков нет; пороги требований ≥ 2).
  const fresh = env.G.createCharacter();
  assert.equal(env.G.dialogOptions(reqNpc, fresh)
    .find((x) => x.option.id === reqOpt.id).доступен, false,
    'свежий персонаж — требования не выполнены');

  const blocked = env.G.dialogOptions(reqNpc, c)
    .find((x) => x.option.id === reqOpt.id);
  assert.equal(blocked.доступен, false, 'требования не выполнены — закрыта');
  assert.ok(blocked.причина, 'есть причина закрытия');

  let btn = optButton(overlay, reqOpt.id);
  assert.ok(btn, 'найм-опция с требованиями отрисована кнопкой');
  assert.equal(btn.disabled, true, 'кнопка disabled (доступ запрещён)');
  assert.equal(btn.title, blocked.причина, 'title = причина закрытия');

  // Клик по disabled-кнопке — не проходит (guard в onOverlayClick):
  // вкладка не переключается — в теле диалога нет строк кандидатов
  // (.cp-itemname живёт только во вкладке найм).
  overlayClick(overlay, btn);
  assert.equal(findAll(bodyOf(overlay), '.cp-itemname').length, 0,
    'клик по disabled-кнопке игнорируется (вкладка не переключилась)');

  // Выполняем требования напрямую (поля схемы «требования»).
  if (typeof req.харизма === 'number') {
    c.primary.charisma = Math.max(c.primary.charisma, req.харизма);
  }
  if (req.навык && typeof req.навык.id === 'string') {
    c.secondary[req.навык.id] = Math.max(
      c.secondary[req.навык.id] || 0, req.навык.уровень);
  }
  if (typeof req.проверка === 'number') {
    // dialogueBonus = «Старейшина» + «Оратор» (player.js).
    c.secondary.elder = Math.max(c.secondary.elder || 0, req.проверка);
  }
  const opened = env.G.dialogOptions(reqNpc, c)
    .find((x) => x.option.id === reqOpt.id);
  assert.equal(opened.доступен, true, 'после прокачки — требования выполнены');
  assert.equal(opened.причина, null);

  // Перерисовка диалога: кнопка становится активной (старый узел —
  // всё ещё disabled — renderDialogTab пересоздаёт строки).
  env.G.npcUI.render();
  btn = optButton(overlay, reqOpt.id);
  assert.ok(btn, 'найм-опция после render() на месте');
  assert.equal(btn.disabled, false, 'после прокачки — кнопка активна');
  overlayClick(overlay, btn);

  const candidates = assertCandidates(env);
  const text = textOf(bodyOf(overlay));
  assert.ok(text.includes(candidates[0].имя),
    'вкладка «найм» открыта: список кандидатов на месте');
});

// --- 000083: деградация БЕЗ G.companions (CHAIN файла — без
// companions.js — теперь явная РЕГРЕССИЯ ДЕГРАДАЦИИ) ---
//
// Инвариант 000038/000053/000130: отсутствие зависимости —
// console.error + деградация, игра не падает. Вкладка «найм» без
// ядра отряда — ровно рендер 000078 (ЧИТАЕМЫЙ список, те же
// .cp-itemrow/.cp-itemname/.cp-itemmeta) БЕЗ кнопок «нанять» и БЕЗ
// блока «Отряд» (даже если roster передан) + ОДИН console.error
// про Game.companions. Интерактивная ветка (кнопки/«Отряд») — только
// при наличии ядра: без ЖИВОГО массива найм списал бы золото, а
// запись ушла бы в одноразовый [] (контракт 000083 §2).
// (Существующие 4 теста — без изменений: их assert errors.length===0
// срабатывает на ОТКРЫТИИ, до рендера вкладки найм.)

test('npcUI: нет G.companions (CHAIN без companions.js) — читаемый список 000078 + console.error, кнопок/«Отряда» нет', () => {
  const env = loadHireUi();
  const candidates = assertCandidates(env);
  const entry = firstPlainHireOption(env);
  assert.ok(entry, 'кандидат без требований доступа к найму есть в каталоге');
  const { overlay } = openNpcDialog(env, entry.npc);

  overlayClick(overlay, optButton(overlay, entry.opt.id));

  const body = bodyOf(overlay);
  // Деградация — ровно рендер 000078: ЧИТАЕМЫЙ список ВСЕХ
  // кандидатов в порядке каталога (регрессионный пин побайтового
  // совпадения — 000083 не меняет слой данных).
  const rows = findAll(body, '.cp-itemrow');
  const names = rows.map((r) => {
    const nm = r.querySelector('.cp-itemname');
    assert.ok(nm, 'строка кандидата несёт .cp-itemname (имя)');
    return nm.textContent;
  });
  assert.deepEqual(names, Array.from(candidates, (n) => n.имя),
    'деградация: читаемый список кандидатов (как 000078)');
  // Интерактивного слоя НЕТ: ни кнопок «нанять», ни блока «Отряд».
  assert.equal(findAll(body, 'button[data-npcact=hire]').length, 0,
    'деградация: кнопок «нанять» (data-npcact=hire) НЕТ');
  assert.equal(findAll(body, '.cp-section').length, 0,
    'деградация: блока «Отряд» (.cp-section) НЕТ');
  // Отсутствие зависимости — след в консоли (инвариант:
  // console.error + деградация, паттерн 000130 в том же ui.js).
  assert.ok(
    env.errors.some((e) => e.includes('Game.companions')),
    'console.error про Game.companions: ' + env.errors.join('; '));
});

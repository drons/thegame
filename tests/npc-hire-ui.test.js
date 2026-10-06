// Задача 000083 (родитель 000065): вкладка «найм» диалога NPC —
// ИНТЕРАКТИВНЫЙ слой (Game.npcUI, src/ui.js).
//
// Слой: вкладка «найм» оверлея .npc-overlay:
//   * кандидаты — из G.companions.candidatesForTavern (ядро 000079):
//     нанятые (roster) и погибшие (deadMercs) исключены, порядок
//     каталога; строка — 000078 (.cp-itemname + .cp-itemmeta) + кнопка
//     cp-btn «нанять» (data-npcact='hire', data-npcid), disabled+title
//     по G.companions.canHire (паттерн renderTrainTab);
//   * блок «Отряд» (.cp-section ПОСЛЕ списка кандидатов): по записи
//     {npcId, sheet, level, xp, loyalty, hiredDay} (000143: 6 ключей —
//     sheet + плоские зеркала level/xp; UI читает только плоские поля)
//     — строка имя/уровень/лояльность/жалованье + кнопка «уволить»
//     (data-npcact='dismiss');
//     пустой отряд — «Отряд пуст.» БЕЗ .cp-itemrow; «призрак»
//     (npcId нет в каталоге) — голый id, тихо;
//   * найм/увольнение — G.companions.hire/dismiss: лог .npc-log
//     («Нанят: X за N з» / отказ + «следующий день» / «Уволен: X»),
//     onChange (точка saveNow) ровно при успешных событиях,
//     G.playerUI.render — ТОЛЬКО при успешном найме (смена золота).
// Ядро (src/companions.js) — НЕ меняется (покрыто
// tests/companions.test.js, 000079/000082); проводка — W1/W2 в
// tests/building-actions.test.js; деградация без модуля —
// tests/npc-hire.test.js (CHAIN без companions.js).
//
// Требования (КРАСНЫЕ — падают до реализации, зелёные после):
//   * U1 — цепочка (CHAIN tests/npc-hire.test.js + 'companions.js'
//     ПОСЛЕ 'npc.js' — зеркало index.html 598→599) грузится ЧИСТО;
//     G.companions и G.npcUI в песочнице; диалог, открытый с
//     roster/deadMercs/day/onChange, — вкладка «найм» ИНТЕРАКТИВНА:
//     у каждой строки кандидата кнопка «нанять»;
//   * U2 — строка кандидата: ПЕРВАЯ .cp-itemname = имя; ПЕРВАЯ
//     .cp-itemmeta — строка 000078 (роль/навыки/контракт/жалованье);
//     кнопка «нанять» (data-npcid = id кандидата) — ПОСЛЕ meta;
//     блок «Отряд» (.cp-section) ПОСЛЕ списка: пустой отряд —
//     «Отряд пуст.», .cp-itemrow внутри секции НЕТ; список = все
//     кандидаты каталога в порядке каталога;
//   * U3 — фильтрация: нанятый (roster) и мёртвый (deadMercs) — НЕ в
//     списке; остальные — в порядке каталога;
//   * U4 — canHire в рендере: полный отряд (3 записи) — все кнопки
//     disabled, title «отряд полный (максимум 3)»; свежий персонаж
//     (gold 100) — Рена (120) disabled, title «мало золота (нужно
//     120)», Торга (100 ≤ 100) активна; STALE-кнопка (roster вырос
//     ПОСЛЕ рендера) — клик → re-check ВНУТРИ hire() в момент клика:
//     «NPC уже в отряде» в лог, БЕЗ onChange/playerUI.render;
//     c.gold = 300 → после render() кнопка Рены активна;
//   * U5 — найм-успех (SETTINGS.companion_refusal.base = 0 — live-
//     чтение, restore в finally): live-roster += {npcId, level:1,
//     xp:0, loyalty: start+Харизма, hiredDay:day} (форма зафиксирована
//     под сейв 000085), c.gold −= цена, лог «Нанят: <имя> за N з»,
//     onChange ×1, G.playerUI.render; кандидат исчез из списка и
//     ПОЯВИЛСЯ в «Отряде» (имя/уровень/лояльность/жалованье +
//     «уволить»);
//   * U6 — найм-отказ (base = 1.0): лог — имя + отказ + «следующий
//     день» (детерминизм 000079: тот же (day, npcId) — тот же
//     исход); золото НЕ тронуто, roster не тронут, onChange НЕ
//     вызван, playerUI.render НЕ вызван, кандидат остаётся в списке;
//   * U7 — «призрак» в roster (npcId нет в каталоге): строка с ГОЛЫМ
//     id (тихо, без краха и console.error), «уволить» работает
//     (запись убрана из live-roster, лог «Уволен: <id>», onChange ×1);
//   * U8 — увольнение ПОСЛЕ найма (base = 0): запись вырезана из
//     live-roster, кандидат ВЕРНУЛСЯ в список, лог «Уволен: <имя>»,
//     onChange ×1, G.playerUI.render НЕ вызван (возврата денег нет —
//     пин); повторный найм того же в тот же день (base = 0) — успех;
//   * U9 — open БЕЗ roster/deadMercs (модуль НА месте) — ТИХАЯ
//     деградация: читаемый список 000078, кнопок «нанять» НЕТ, секции
//     «Отряд» НЕТ, НОВЫХ console.error НЕТ; тот же диалог, открытый
//     С roster — интерактивен.
//
// Детерминизм UI-сценариев (инвариант 000065#9 — «мирового» rng нет):
// успех найма — SETTINGS.companion_refusal.base = 0 (никаких отказов),
// отказ — base = 1.0 (отказ на любом (day, npcId)); ядро читает
// настройки ЖИВО (прецедент tests/companion_refusal: «base = 0 →
// отказа нет»), восстановление в finally. day — через open (o.day —
// в игре clock.day, 000128). Лояльность — вычисляется из SETTINGS
// (companion_loyalty.start + Харизма), не хардкодом.
//
// CHAIN — цепочка tests/npc-hire.test.js + 'companions.js' ПОСЛЕ
// 'npc.js' (зеркало index.html 598→599; пин порядка —
// tests/index-order.test.js, задача 000079). DOM-стаб — дубль стаба
// tests/npc-hire.test.js (дублирование стабов принято в проекте).
//
// Почему КРАСНЫЕ (осмысленно, не синтаксис): цепочка грузится чисто
// (companions.js уже в src/ и уже запитан в index.html — 000079);
// падают ассерты на отсутствующую ФУНКЦИОНАЛЬНОСТЬ 000083: ui.js
// (блок Game.npcUI) не знает о G.companions — open() не принимает
// roster/deadMercs, renderHireTab не рисует кнопки/секцию «Отряд»,
// onOverlayClick не имеет веток hire/dismiss (кнопки/секция не
// создаются, состояние не мутируется).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');

// --- Минимальный DOM-стаб с деревом (дубль tests/npc-hire.test.js) ---

function matchesSel(el, sel) {
  // 'тег[атрибут]' / 'тег[атрибут=значение]' (onOverlayClick:
  // e.target.closest('button[data-npcact]'); поиск по data-npcact).
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

// Цепочка = tests/npc-hire.test.js + 'companions.js' ПОСЛЕ 'npc.js'
// (зеркало index.html 598→599; регрессия порядка —
// tests/index-order.test.js, 000079).
const CHAIN = [
  'global-settings.js', 'perlin.js', 'mapseed.js',
  'skills-data.js', 'items-data.js', 'npc-data.js',
  'map.js', 'sheet.js', 'player.js', 'day.js', 'items.js', 'buildings.js',
  'npc.js', 'companions.js', 'combat.js', 'dungeon.js',
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

function npcById(env, id) {
  const n = (env.G.NpcData.NPCS || []).find((x) => x && x.id === id);
  assert.ok(n, 'в каталоге NPC ' + id + ' (каталог 000078)');
  return n;
}

// Первый кандидат в каталоге, у которого найм-опция БЕЗ требований
// (тавернщик Берта — сценарий ТЗ «диалог тавернщика → вкладка найм»).
function firstPlainHireNpc(env) {
  for (const n of env.G.NpcData.NPCS || []) {
    if (!n || !n.найм || typeof n.найм !== 'object') continue;
    const o = n.диалог.find((x) => x.действие === 'найм');
    if (o && !o.требования) return n;
  }
  return null;
}

// Запись отряда в ЗАФИКСИРОВАННОЙ форме (сейв 000085, 000079).
const entry = (npcId, loyalty = 51, day = 3) =>
  ({ npcId, level: 1, xp: 0, loyalty, hiredDay: day });

// Открыть диалог NPC. params: character/roster/deadMercs/day/onChange
// — передаются в open ТОЛЬКО при наличии ключа (U9: open БЕЗ
// roster/deadMercs). Возвращает { c, overlay }.
function openDialog(env, npc, params = {}) {
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  assert.ok(env.G.npcUI, 'Game.npcUI создан (npc.js + ui.js загружены)');
  const p = { npc, book: env.G.createQuestBook() };
  for (const k of ['character', 'roster', 'deadMercs', 'day', 'onChange']) {
    if (params[k] !== undefined) p[k] = params[k];
  }
  if (!p.character) p.character = env.G.createCharacter();
  env.G.npcUI.open(p);
  const overlay = findAll(env.body, '.npc-overlay')[0];
  assert.ok(overlay, 'оверлей .npc-overlay подвешен к body');
  assert.equal(env.G.npcUI.isActive(), true, 'диалог открыт');
  return { c: p.character, overlay };
}

// Переключение на вкладку «найм» (кнопка ряда вкладок, 000078).
function clickHireTab(overlay) {
  const tabBtn = findAll(overlay, '.cp-btn')
    .find((b) => b.dataset.npcact === 'tab' && b.dataset.tab === 'hire');
  assert.ok(tabBtn, 'вкладка «найм» (data-tab=hire) в ряде вкладок');
  overlayClick(overlay, tabBtn);
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

// Полный текст узла (рекурсивно) — для проверки читаемого списка и
// строки лога .npc-log (renderTab: logEl.textContent = log.join('\n')).
function textOf(node) {
  let s = node._text || '';
  for (const ch of node.children || []) s += textOf(ch);
  return s;
}

function logText(overlay) {
  const logEl = findAll(overlay, '.npc-log')[0];
  assert.ok(logEl, 'лог диалога .npc-log на месте');
  return textOf(logEl);
}

// СТРОКИ КАНДИДАТОВ — прямые дети .cp-items (cp-itemrow). Строки блока
// «Отряд» живут ВНУТРИ .cp-section и сюда НЕ попадают.
function candidateRows(overlay) {
  return bodyOf(overlay).children
    .filter((ch) => String(ch.className).split(/\s+/)
      .includes('cp-itemrow'));
}

function rowName(row) {
  const nm = row.querySelector('.cp-itemname');
  return nm ? nm.textContent : null;
}

function names(overlay) {
  return candidateRows(overlay).map(rowName);
}

function rowByName(overlay, name) {
  return candidateRows(overlay)
    .find((r) => rowName(r) === name) || null;
}

// Блок «Отряд» — .cp-section с заголовком 'Отряд' (000083).
function squadSection(overlay) {
  return findAll(bodyOf(overlay), '.cp-section')
    .find((s) => s._text === 'Отряд') || null;
}

function squadRows(overlay) {
  const s = squadSection(overlay);
  if (!s) return [];
  return s.children
    .filter((ch) => String(ch.className).split(/\s+/)
      .includes('cp-itemrow'));
}

// SETTINGS.companion_refusal.base — live-чтение ядра (000079): 0 —
// никогда не отказывает (успех верный), 1.0 — всегда отказывает
// (отказ верный). Прецедент — tests/companions.test.js; restore —
// в finally (тесты не зомбируют настройки для следующих тестов).
function withBase(env, base, fn) {
  const r = env.G.GlobalSettings.SETTINGS.companion_refusal;
  const old = r.base;
  r.base = base;
  try {
    fn();
  } finally {
    r.base = old;
  }
}

// Счётчик G.playerUI.render (ветка найма/увольнения — паттерн
// buy/sell: render при смене золота; на увольнении возврата денег
// нет — pин «НЕ вызван»). Заменяем render (в песочнице панель
// персонажа не собрана — оригинал ушёл бы в ранний return);
// restore — в finally.
function playerRenderSpy(env) {
  let calls = 0;
  const orig = env.G.playerUI.render;
  env.G.playerUI.render = () => { calls += 1; };
  return {
    count: () => calls,
    restore: () => { env.G.playerUI.render = orig; },
  };
}

// --- U1: цепочка грузится чисто; диалог с roster — интерактивный ---

test('000083 U1: цепочка с companions.js — чисто; диалог с roster — интерактивная вкладка найм (кнопки «нанять»)', () => {
  const env = loadHireUi();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  assert.ok(env.G.companions,
    'Game.companions в песочнице (companions.js — после npc.js в CHAIN)');
  for (const m of ['candidatesForTavern', 'canHire', 'hire', 'dismiss']) {
    assert.equal(typeof env.G.companions[m], 'function',
      'Game.companions.' + m + ' (сигнатуры 000079)');
  }
  assert.ok(env.G.npcUI, 'Game.npcUI в песочнице');

  const npc = firstPlainHireNpc(env);
  assert.ok(npc, 'кандидат без требований доступа к найму есть в каталоге');
  const { overlay } = openDialog(env, npc, {
    roster: [], deadMercs: [], day: 7, onChange: () => {},
  });
  clickHireTab(overlay);
  assert.equal(env.errors.length, 0,
    'open + вкладка «найм»: новых ошибок нет: ' + env.errors.join('; '));

  const rows = candidateRows(overlay);
  assert.ok(rows.length >= 1, 'во вкладке найм — строки кандидатов');
  for (const row of rows) {
    assert.ok(row.querySelector('button[data-npcact=hire]'),
      'строка кандидата несёт кнопку «нанять» (data-npcact=hire) — ' +
      'интерактивный слой 000083');
  }
});

// --- U2: строка кандидата + кнопка; блок «Отряд» (пустой) ---

test('000083 U2: интерактивная вкладка — строка с кнопкой «нанять» (data-npcid) + блок «Отряд» (пустой: «Отряд пуст.», строк нет)', () => {
  const env = loadHireUi();
  const cands = candidatesOf(env.G);
  assert.ok(cands.length >= 1, 'в каталоге есть наёмники (000078)');
  const npc = firstPlainHireNpc(env);
  const { overlay } = openDialog(env, npc, {
    roster: [], deadMercs: [], day: 7, onChange: () => {},
  });
  clickHireTab(overlay);

  // Список = ВСЕ кандидаты каталога в порядке каталога (000078).
  // Array.from (а не cands.map): cands — массив vm-контекста (NpcData
  // рожден в песочнице), .map на нём вернул бы vm-массив (другой
  // prototype) — deepStrictEqual упал бы на прототипе (см.
  // tests/npc-hire.test.js).
  assert.deepEqual(names(overlay), Array.from(cands, (n) => n.имя),
    'список кандидатов — все, в порядке каталога');
  for (const m of cands) {
    const row = rowByName(overlay, m.имя);
    assert.ok(row, 'строка «' + m.имя + '» есть');
    const nm = row.querySelector('.cp-itemname');
    assert.equal(nm.textContent, m.имя, m.имя + ': .cp-itemname = имя');
    // ПЕРВАЯ .cp-itemmeta — строка 000078: роль/навыки/контракт/
    // жалованье (регрессия — tests/npc-hire.test.js).
    const metas = row.querySelectorAll('.cp-itemmeta');
    assert.ok(metas.length >= 1, m.имя + ': строка несёт .cp-itemmeta');
    const t = metas[0].textContent;
    assert.ok(t.includes(String(m.найм.роль)),
      m.имя + ': meta содержит роль «' + m.найм.роль + '»');
    assert.ok(t.includes(String(m.найм.цена)),
      m.имя + ': meta содержит контракт ' + m.найм.цена);
    assert.ok(t.includes(String(m.найм.жалованье)),
      m.имя + ': meta содержит жалованье ' + m.найм.жалованье);
    // Кнопка «нанять» — ПОСЛЕ meta (строка: имя → meta → кнопка).
    const b = row.querySelector('button[data-npcact=hire]');
    assert.ok(b, m.имя + ': кнопка «нанять» (data-npcact=hire)');
    assert.equal(b.textContent, 'нанять', 'подпись кнопки «нанять»');
    assert.equal(b.dataset.npcid, m.id, 'data-npcid — id кандидата');
    const idxName = row.children.indexOf(nm);
    const idxMeta = row.children.indexOf(metas[0]);
    const idxBtn = row.children.indexOf(b);
    assert.ok(idxName >= 0 && idxMeta > idxName && idxBtn > idxMeta,
      m.имя + ': порядок строки — имя → meta → кнопка «нанять»');
  }

  // Блок «Отряд» — .cp-section ПОСЛЕ списка кандидатов; пустой —
  // «Отряд пуст.», .cp-itemrow внутри секции НЕТ (ограничение-пин:
  // deepEqual всех .cp-itemrow тела в tests/npc-hire.test.js).
  const s = squadSection(overlay);
  assert.ok(s, 'блок «Отряд» (.cp-section) — ПОСЛЕ списка кандидатов');
  assert.equal(squadRows(overlay).length, 0,
    'пустой отряд: .cp-itemrow внутри секции «Отряд» НЕТ');
  const empty = s.children
    .find((ch) => String(ch.className).split(/\s+/).includes('cp-itemmeta'));
  assert.ok(empty && empty._text === 'Отряд пуст.',
    'пустой отряд — строка «Отряд пуст.»');
});

// --- U3: фильтрация — нанятые (roster) и мёртвые (deadMercs) ---

test('000083 U3: фильтрация списка — нанятый (roster) и мёртвый (deadMercs) не в списке; остальные — порядок каталога', () => {
  const env = loadHireUi();
  const cands = candidatesOf(env.G);
  const npc = firstPlainHireNpc(env);
  const { overlay } = openDialog(env, npc, {
    roster: [entry('merc_volk')],
    deadMercs: ['merc_rena'],
    day: 7, onChange: () => {},
  });
  clickHireTab(overlay);

  // Array.from — cands vm-массив (см. U2): host-массив строк.
  const expected = Array.from(
    cands.filter((n) => n.id !== 'merc_volk' && n.id !== 'merc_rena'),
    (n) => n.имя);
  assert.deepEqual(names(overlay), expected,
    'нанятый (merc_volk) и мёртвый (merc_rena) исключены; ' +
    'остальные — в порядке каталога (контракт candidatesForTavern)');
});

// --- U10: 000161 — deadMercs ЗАПИСЯМИ (D1) ---
//
// КРАСНОЕ: deadMercs — записи {npcId, sheet, loyalty, hiredDay}
// (новая форма live-массива, 000161): candidatesForTavern
// «new Set(deadMercs)» держит ОБЪЕКТЫ — «dead.has(n.id)» false →
// мёртвый наёмник В списке найма (повторный найм после гибели —
// должен быть невозможен, D1). Зелёное — адаптер двух форматов
// (record.npcId + legacy-строки, U3 — без правок).

test('000161 U10: deadMercs — запись {npcId, sheet, loyalty, hiredDay}: мёртвый НЕ в списке найма (повторный найм после гибели — НЕЛЬЗЯ); остальные — порядок каталога', () => {
  const env = loadHireUi();
  const cands = candidatesOf(env.G);
  const rena = npcById(env, 'merc_rena');
  // Запись погибшего — форма сейва (ровно 4 поля, 000143/000161):
  // sheet — merc-лист (песочница — Game.Sheet, 000140).
  const sh = env.G.Sheet.createSheet('merc', { npcId: 'merc_rena' });
  const rec = { npcId: 'merc_rena', sheet: sh, loyalty: 77, hiredDay: 3 };
  const npc = firstPlainHireNpc(env);
  const { overlay } = openDialog(env, npc, {
    roster: [entry('merc_volk')],
    deadMercs: [rec],
    day: 7, onChange: () => {},
  });
  clickHireTab(overlay);
  const expected = Array.from(
    cands.filter((n) => n.id !== 'merc_volk' && n.id !== 'merc_rena'),
    (n) => n.имя);
  assert.deepEqual(names(overlay), expected,
    'мёртвый в ЗАПИСИ (merc_rena) исключён — повторный найм после ' +
    'гибели НЕЛЬЗЯ (D1); остальные — в порядке каталога');
  assert.equal(rowByName(overlay, rena.имя), null,
    'строки «' + rena.имя + '» в списке найма НЕТ (кнопка «нанять» ' +
    'не создаётся)');
});

// --- U4: canHire в рендере — disabled + title; stale-кнопка ---

test('000083 U4: disabled+title по canHire (отряд полный / мало золота / stale-дубль — re-check в клике / gold=300 → активна)', () => {
  // (a) Полный отряд (3 записи) — ВСЕ «нанять» disabled:
  // «отряд полный (максимум 3)» (max_companions — live SETTINGS).
  {
    const env = loadHireUi();
    const roster = [entry('merc_volk'), entry('merc_ashka'),
      entry('merc_baldor')];
    const npc = firstPlainHireNpc(env);
    const { overlay } = openDialog(env, npc, {
      roster, deadMercs: [], day: 7, onChange: () => {},
    });
    clickHireTab(overlay);
    const rows = candidateRows(overlay);
    assert.ok(rows.length >= 1, 'остальные кандидаты в списке');
    for (const row of rows) {
      const b = row.querySelector('button[data-npcact=hire]');
      assert.ok(b, 'строка несёт кнопку «нанять»');
      assert.equal(b.disabled, true, 'отряд полный — кнопка disabled');
      assert.equal(b.title, 'отряд полный (максимум 3)',
        'title — причина canHire «отряд полный (максимум 3)»');
    }
  }
  // (b) Свежий персонаж (gold 100): Рена (120) — disabled «мало
  // золота (нужно 120)»; Торга (100 ≤ 100) — активна.
  {
    const env = loadHireUi();
    const c = env.G.createCharacter();
    assert.equal(c.gold, 100, 'свежий персонаж — gold 100');
    const rena = npcById(env, 'merc_rena');
    const torga = npcById(env, 'merc_torga');
    const npc = firstPlainHireNpc(env);
    const { overlay } = openDialog(env, npc, {
      character: c, roster: [], deadMercs: [], day: 7,
      onChange: () => {},
    });
    clickHireTab(overlay);
    const rowR = rowByName(overlay, rena.имя);
    assert.ok(rowR, 'строка «' + rena.имя + '» есть');
    const b = rowR.querySelector('button[data-npcact=hire]');
    assert.ok(b, rena.имя + ': кнопка «нанять»');
    assert.equal(b.disabled, true,
      'gold ' + c.gold + ' < ' + rena.найм.цена + ' — disabled');
    assert.equal(b.title, 'мало золота (нужно ' + rena.найм.цена + ')',
      'title — причина «мало золота (нужно ' + rena.найм.цена + ')»');
    const rowT = rowByName(overlay, torga.имя);
    const bt = rowT && rowT.querySelector('button[data-npcact=hire]');
    assert.ok(bt && bt.disabled === false,
      torga.имя + ' (' + torga.найм.цена + ' ≤ ' + c.gold + ') — активна');
  }
  // (c) STALE-кнопка: roster вырос ПОСЛЕ рендера (live-ссылка) —
  // клик по просроченной активной кнопке → re-check ВНУТРИ hire() в
  // момент клика: «NPC уже в отряде» в лог, БЕЗ onChange и
  // playerUI.render (состояние не менялось).
  {
    const env = loadHireUi();
    const spy = playerRenderSpy(env);
    const roster = [];
    let saves = 0;
    const volk = npcById(env, 'merc_volk');
    const npc = firstPlainHireNpc(env);
    const { overlay } = openDialog(env, npc, {
      roster, deadMercs: [], day: 7,
      onChange: () => { saves += 1; },
    });
    try {
      clickHireTab(overlay);
      const row = rowByName(overlay, volk.имя);
      assert.ok(row, 'строка «' + volk.имя + '» есть');
      const b = row.querySelector('button[data-npcact=hire]');
      assert.ok(b, volk.имя + ': кнопка «нанять»');
      assert.equal(b.disabled, false, 'roster пуст — кнопка активна');
      // «Мир» изменил roster без перерисовки (live-ссылка: 000085/
      // 000087 мутируют тот же массив).
      roster.push(entry('merc_volk'));
      overlayClick(overlay, b); // stale-клик
      assert.ok(logText(overlay).includes('NPC уже в отряде'),
        're-check в момент клика — «NPC уже в отряде» в лог');
      assert.equal(roster.length, 1, 'roster не изменился (дубль)');
      assert.equal(saves, 0, 'onChange НЕ вызван (состояние не менялось)');
      assert.equal(spy.count(), 0, 'playerUI.render НЕ вызван');
    } finally {
      spy.restore();
    }
  }
  // (г) c.gold = 300 → после render() кнопка Рены активна
  // (состояние кнопок пересчитывается при рендере).
  {
    const env = loadHireUi();
    const c = env.G.createCharacter();
    const rena = npcById(env, 'merc_rena');
    const npc = firstPlainHireNpc(env);
    const { overlay } = openDialog(env, npc, {
      character: c, roster: [], deadMercs: [], day: 7,
      onChange: () => {},
    });
    clickHireTab(overlay);
    const row = rowByName(overlay, rena.имя);
    assert.ok(row, 'строка «' + rena.имя + '» есть');
    const b0 = row.querySelector('button[data-npcact=hire]');
    assert.ok(b0 && b0.disabled === true, 'до: Рена disabled (100 < 120)');
    c.gold = 300;
    env.G.npcUI.render(); // перерисовка текущей вкладки
    const b1 = rowByName(overlay, rena.имя)
      .querySelector('button[data-npcact=hire]');
    assert.ok(b1, 'после render(): кнопка «нанять» Рены на месте');
    assert.equal(b1.disabled, false, 'gold 300 ≥ 120 — кнопка активна');
  }
});

// --- U5: найм — успех (base = 0) ---

test('000083 U5: найм-успех (base=0) — запись в live-roster, gold −= цена, лог «Нанят: …», onChange ×1, playerUI.render, кандидат в «Отряде»', () => {
  const env = loadHireUi();
  const spy = playerRenderSpy(env);
  const roster = [];
  const deadMercs = [];
  let saves = 0;
  const c = env.G.createCharacter();
  const gold0 = c.gold;
  const S = env.G.GlobalSettings.SETTINGS;
  // Лояльность — из SETTINGS (start + Харизма), НЕ хардкод: 50 + 1.
  const loyalty = S.companion_loyalty.start + c.primary.charisma;
  const volk = npcById(env, 'merc_volk');
  const npc = firstPlainHireNpc(env);
  const { overlay } = openDialog(env, npc, {
    character: c, roster, deadMercs, day: 7,
    onChange: () => { saves += 1; },
  });
  try {
    withBase(env, 0, () => {
      clickHireTab(overlay);
      const row = rowByName(overlay, volk.имя);
      assert.ok(row, 'строка «' + volk.имя + '» есть');
      const b = row.querySelector('button[data-npcact=hire]');
      assert.ok(b, volk.имя + ': кнопка «нанять»');
      assert.equal(b.disabled, false,
        volk.имя + ' (' + volk.найм.цена + ' ≤ ' + gold0 + ') — активна');
      overlayClick(overlay, b);

      // live-roster: запись (000143: 6 ключей — sheet + плоские
      // зеркала level/xp; читатели UI — не меняем).
      // По полям (не deepEqual): запись создана в vm-контексте —
      // другой prototype, строгое сравнение объектов ложится на нём
      // (см. примечание к U2).
      assert.equal(roster.length, 1, 'запись добавлена в live-roster');
      const e = roster[0];
      assert.equal(e.npcId, 'merc_volk', 'запись.npcId — id кандидата');
      assert.equal(e.level, 1, 'запись.level — 1 (новичок, зеркало)');
      assert.equal(e.xp, 0, 'запись.xp — 0 (зеркало)');
      assert.equal(e.loyalty, loyalty,
        'запись.loyalty — start+Харизма (из SETTINGS, не хардкод)');
      assert.equal(e.hiredDay, 7, 'запись.hiredDay — day из open');
      assert.ok(e.sheet && typeof e.sheet === 'object',
        'запись.sheet — лист (000143)');
      assert.equal(e.sheet.kind, 'merc', 'sheet.kind — merc');
      assert.deepEqual(Object.keys(e).sort(),
        ['hiredDay', 'level', 'loyalty', 'npcId', 'sheet', 'xp'],
        'запись — ровно 6 ключей (000143: sheet + зеркала level/xp)');
      assert.equal(c.gold, gold0 - volk.найм.цена,
        'gold −= цена контракта (' + gold0 + ' → ' +
        (gold0 - volk.найм.цена) + ')');
      assert.ok(logText(overlay).includes(
        'Нанят: ' + volk.имя + ' за ' + volk.найм.цена + ' з'),
        'лог — «Нанят: ' + volk.имя + ' за ' + volk.найм.цена + ' з»');
      assert.equal(saves, 1, 'onChange ×1 (точка saveNow)');
      assert.ok(spy.count() >= 1, 'G.playerUI.render вызван (смена золота)');

      // Список ОБНОВЛЁН: кандидат исчез из списка и ПОЯВИЛСЯ в
      // «Отряде» (имя/уровень/лояльность/жалованье + «уволить»).
      assert.ok(!names(overlay).includes(volk.имя),
        'кандидат исчез из списка кандидатов (candidatesForTavern)');
      const s = squadSection(overlay);
      assert.ok(s, 'блок «Отряд» на месте');
      const rows = squadRows(overlay);
      assert.equal(rows.length, 1, 'в «Отряде» — одна строка');
      const nm = rows[0].querySelector('.cp-itemname');
      assert.equal(nm.textContent, volk.имя, 'строка «Отряда» — имя');
      const meta = rows[0].querySelector('.cp-itemmeta').textContent;
      assert.ok(meta.includes('уровень 1'), 'строка — «уровень 1»');
      assert.ok(meta.includes('лояльность ' + loyalty),
        'строка — «лояльность ' + loyalty + '» (start+Харизма)');
      assert.ok(
        meta.includes('жалованье ' + volk.найм.жалованье + ' з/день'),
        'строка — «жалованье ' + volk.найм.жалованье + ' з/день»');
      const bd = rows[0].querySelector('button[data-npcact=dismiss]');
      assert.ok(bd, 'строка «Отряда» — кнопка «уволить»');
      assert.equal(bd.dataset.npcid, 'merc_volk',
        'data-npcid — id записи отряда');
    });
  } finally {
    spy.restore();
  }
});

// --- U6: найм — отказ (base = 1.0) ---

test('000083 U6: найм-отказ (base=1.0) — текст в лог, gold/roster не тронуты, onChange НЕ вызван, кандидат в списке', () => {
  const env = loadHireUi();
  const spy = playerRenderSpy(env);
  const roster = [];
  let saves = 0;
  const c = env.G.createCharacter();
  const gold0 = c.gold;
  const volk = npcById(env, 'merc_volk');
  const npc = firstPlainHireNpc(env);
  const { overlay } = openDialog(env, npc, {
    character: c, roster, deadMercs: [], day: 7,
    onChange: () => { saves += 1; },
  });
  try {
    withBase(env, 1, () => {
      clickHireTab(overlay);
      const row = rowByName(overlay, volk.имя);
      assert.ok(row, 'строка «' + volk.имя + '» есть');
      const b = row.querySelector('button[data-npcact=hire]');
      assert.ok(b, volk.имя + ': кнопка «нанять»');
      overlayClick(overlay, b);
    });
    const t = logText(overlay);
    assert.ok(t.includes(volk.имя), 'лог — имя кандидата');
    assert.ok(t.includes('отказался'), 'лог — отказ («…отказался…»)');
    assert.ok(t.includes('следующий день'),
      'лог — «повторить попытку можно на следующий день» ' +
      '(игрокоориентированный детерминизм 000079)');
    assert.equal(c.gold, gold0, 'золото НЕ списано при отказе');
    assert.equal(roster.length, 0, 'roster не тронут');
    assert.equal(saves, 0, 'onChange НЕ вызван (состояние не менялось)');
    assert.equal(spy.count(), 0, 'playerUI.render НЕ вызван');
    assert.ok(names(overlay).includes(volk.имя),
      'кандидат остаётся в списке');
  } finally {
    spy.restore();
  }
});

// --- U7: «призрак» в roster (npcId нет в каталоге) ---

test('000083 U7: «призрак» в roster (npcId нет в каталоге) — строка с голым id, без краха; «уволить» работает', () => {
  const env = loadHireUi();
  const spy = playerRenderSpy(env);
  const roster = [entry('merc_ghost', 42, 3)];
  let saves = 0;
  const npc = firstPlainHireNpc(env);
  const { overlay } = openDialog(env, npc, {
    roster, deadMercs: [], day: 7,
    onChange: () => { saves += 1; },
  });
  try {
    clickHireTab(overlay);
    assert.equal(env.errors.length, 0,
      '«призрак» — тихо: новых console.error нет: '
      + env.errors.join('; '));
    const s = squadSection(overlay);
    assert.ok(s, 'блок «Отряд» на месте');
    const rows = squadRows(overlay);
    assert.equal(rows.length, 1, 'в «Отряде» — одна строка');
    const nm = rows[0].querySelector('.cp-itemname');
    assert.equal(nm.textContent, 'merc_ghost',
      '«призрак» — строка с ГОЛЫМ id (тихий, паттерн 000029/000085)');
    const meta = rows[0].querySelector('.cp-itemmeta').textContent;
    assert.ok(meta.includes('уровень 1') && meta.includes('лояльность 42'),
      'строка — уровень/лояльность из записи: ' + meta);
    assert.ok(!meta.includes('жалованье'),
      'каталога нет — жалованья в строке нет: ' + meta);
    const bd = rows[0].querySelector('button[data-npcact=dismiss]');
    assert.ok(bd, 'строка «призрака» — кнопка «уволить»');
    assert.equal(bd.dataset.npcid, 'merc_ghost',
      'data-npcid — id записи отряда');

    overlayClick(overlay, bd);
    assert.equal(roster.length, 0, 'запись убрана из live-roster');
    assert.ok(logText(overlay).includes('Уволен: merc_ghost'),
      'лог — «Уволен: merc_ghost» (голый id)');
    assert.equal(saves, 1, 'onChange ×1 (точка saveNow)');
    assert.equal(squadRows(overlay).length, 0,
      'после увольнения — «Отряд пуст.» (строк нет)');
  } finally {
    spy.restore();
  }
});

// --- U8: увольнение после найма; повторный найм в тот же день ---

test('000083 U8: увольнение (после найма, base=0) — запись вырезана, кандидат вернулся, лог, onChange ×1, playerUI.render НЕ вызван; повторный найм в тот же день — успех', () => {
  const env = loadHireUi();
  const spy = playerRenderSpy(env);
  const roster = [];
  let saves = 0;
  const c = env.G.createCharacter();
  const S = env.G.GlobalSettings.SETTINGS;
  const loyalty = S.companion_loyalty.start + c.primary.charisma;
  const volk = npcById(env, 'merc_volk');
  const npc = firstPlainHireNpc(env);
  const { overlay } = openDialog(env, npc, {
    character: c, roster, deadMercs: [], day: 7,
    onChange: () => { saves += 1; },
  });
  try {
    withBase(env, 0, () => {
      // (1) Найм (base = 0 — без отказа).
      clickHireTab(overlay);
      const row = rowByName(overlay, volk.имя);
      assert.ok(row, 'строка «' + volk.имя + '» есть');
      const bh = row.querySelector('button[data-npcact=hire]');
      assert.ok(bh, volk.имя + ': кнопка «нанять»');
      overlayClick(overlay, bh);
      assert.equal(roster.length, 1, 'нанят: запись в live-roster');
      assert.equal(saves, 1, 'найм: onChange ×1');

      // (2) Увольнение — кнопка «уволить» строки в «Отряде».
      const srows = squadRows(overlay);
      assert.equal(srows.length, 1, 'в «Отряде» — строка нанятого');
      const bd = srows[0].querySelector('button[data-npcact=dismiss]');
      assert.ok(bd, 'строка «Отряда» — кнопка «уволить»');
      overlayClick(overlay, bd);
      assert.equal(roster.length, 0,
        'запись вырезана из live-roster (splice в ядре)');
      assert.ok(names(overlay).includes(volk.имя),
        'кандидат ВЕРНУЛСЯ в список');
      assert.ok(logText(overlay).includes('Уволен: ' + volk.имя),
        'лог — «Уволен: ' + volk.имя + '»');
      assert.equal(saves, 2, 'увольнение: onChange ×1 (точка saveNow)');
      assert.equal(spy.count(), 1,
        'playerUI.render — ТОЛЬКО при найме (возврата денег нет — ' +
        'золото не изменилось)');

      // (3) Повторный найм того же в тот же день (base = 0) — успех
      // (тот же (day, npcId)-сид; при base 0 отказа нет).
      const row2 = rowByName(overlay, volk.имя);
      assert.ok(row2, 'после увольнения — строка кандидата на месте');
      const b2 = row2.querySelector('button[data-npcact=hire]');
      assert.ok(b2, 'после увольнения — кнопка «нанять» на месте');
      overlayClick(overlay, b2);
      assert.equal(roster.length, 1, 'повторно нанят');
      assert.equal(roster[0].npcId, 'merc_volk', 'повторный найм: запись');
      assert.equal(roster[0].loyalty, loyalty,
        'повторный найм: лояльность start+Харизма');
      assert.equal(c.gold, 100 - 2 * volk.найм.цена,
        'gold: 100 − ' + volk.найм.цена + ' − ' + volk.найм.цена);
    });
  } finally {
    spy.restore();
  }
});

// --- U9: open без roster/deadMercs — тихая деградация; с roster —
// интерактив ---

test('000083 U9: open БЕЗ roster/deadMercs (модуль на месте) — тихая деградация (список 000078, без кнопок/«Отряда», без новых console.error); open С roster — интерактив', () => {
  const env = loadHireUi();
  const cands = candidatesOf(env.G);
  assert.ok(cands.length >= 1, 'в каталоге есть наёмники (000078)');
  const npc = firstPlainHireNpc(env);

  // (1) БЕЗ roster/deadMercs (ключи в open отсутствуют) — слой 000078:
  // читаемый список, деградация ТИХАЯ (модуль на месте — console.error
  // НЕ про него; console.error — только при отсутствии G.companions,
  // регрессия — tests/npc-hire.test.js).
  const { overlay } = openDialog(env, npc, { day: 7 });
  clickHireTab(overlay);
  assert.equal(env.errors.length, 0,
    'модуль на месте: тихая деградация — НОВЫХ console.error нет: '
    + env.errors.join('; '));
  assert.deepEqual(names(overlay), Array.from(cands, (n) => n.имя),
    'читаемый список — все кандидаты (000078)');
  assert.equal(findAll(bodyOf(overlay), 'button[data-npcact=hire]').length,
    0, 'без roster — кнопок «нанять» НЕТ');
  assert.equal(squadSection(overlay), null,
    'без roster — блока «Отряд» НЕТ');

  // (2) Тот же диалог, открытый С roster — ИНТЕРАКТИВЕН.
  const p2 = openDialog(env, npc, {
    roster: [], deadMercs: [], day: 7,
  });
  clickHireTab(p2.overlay);
  assert.equal(env.errors.length, 0,
    'интерактивный путь: ошибок нет: ' + env.errors.join('; '));
  const row = rowByName(p2.overlay, cands[0].имя);
  assert.ok(row, 'строка кандидата на месте');
  const b = row.querySelector('button[data-npcact=hire]');
  assert.ok(b, 'с roster — кнопка «нанять» в строке (интерактив)');
  const s = squadSection(p2.overlay);
  assert.ok(s, 'с roster — блок «Отряд»');
  assert.ok(
    s.children.some((ch) =>
      String(ch.className).split(/\s+/).includes('cp-itemmeta')
      && ch._text === 'Отряд пуст.'),
    'пустой отряд — «Отряд пуст.»');
});

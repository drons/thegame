// Задача 000299.02 — каталожный ключ опции диалога `для` (scope) +
// фильтр dialogOptions по активному персонажу партии + два call-site
// в npcUI (src/ui.js: renderDialogTab + opt-ветка onOverlayClick).
//
// ТЗ — tasks/pending/000299.02.md; родительская 000299
// (memory/000299-split.md); контракт активного персонажа —
// H2 «Активный персонаж» spec/companions.md (000299.01,
// memory/000299.01-active-char-building.md).
//
// Семантика `для` (ключ КОНЦОМ объекта опции): отсутствует/"все" —
// любому активному; "efir" — только Эфир; "merc" — любой наёмный;
// {роль: melee|ranged|shield|support} — наёмный с соответствующим
// найм.роль (каталог). kind переданного character — identity-резолв
// из LIVE __game.state (st.efir === character; st.roster[i].sheet
// === character → найм.роль из Game.NpcData); hero — ПО УМОЛЧАНИЮ
// (identity на hero НЕ используется: main.js state.hero — снимок).
// Мусорный scope — скрыт (fail-closed). Требования (харизма/навык/
// проверка) — по тому же character (без изменений). Владелец мутаций
// в диалоге — ВСЕГДА hero (o.character): золото платит Флогистон.
//
// КРАСНЫЕ (до — красные, осмысленно, не краш):
//   * A1/A3/A4: scope игнорируется — hero получает efir/merc/{роль}
//     опции (краснота на стороне «НЕ отдаётся»; «отдаётся
//     соответствующему» тривиально зелёное — всё отдаётся всем);
//   * A8c: schema additionalProperties:false отвергает `для`
//     («лишнее поле») — валидация 000009/000010 по schema.json;
//   * B1: npcUI — у hero (Флогистон, дефолт) кнопки efir/support-
//     опций Берты ОТСУТСТВУЮТ (до — core не фильтрует, кнопки
//     рисуются всем);
//   * B2/B3: scope-смена видна БЕЗ переключения вкладки (клик по
//     портрету — re-render вкладки «диалог»).
//
// 000311 (ретро 20261104: пины СУЩЕСТВУЮЩЕГО контракта — только
// тесты, src/ 0-diff; зелёные с первого запуска):
//   * A9 — НОВОЕ: Game.NpcData нет → роль наёмного null: опция
//     «merc» совпадёт, {роль} — нет (fail-closed, src/npc.js:82);
//     save/restore globalThis в finally (node --test = 1 процесс);
//   * A10 — НОВОЕ: лист без primary/secondary (bare {level:1}) —
//     требования «не выполнено», строки причин ТОЖЕ («нужна Харизма
//     3»/«нужен Оратор 2»/«бонус к диалогу меньше 3»), без краха
//     (000053);
//   * B6 — НОВОЕ: ВТОРОЙ call-site (ТЗ 000299.02 п.3) — opt-ветка
//     onOverlayClick (src/ui.js:1416, G.dialogOptions(npc,
//     activeSheetNow())): клик по scoped-опции (efir_whisper) при
//     активном Эфире — текст в .npc-log, оверлей НЕ закрыт, вкладка
//     НЕ переключена; регресс ветки к dialogOptions(npc, c) дал бы
//     find→undefined→return — лог пуст;
//   * A8c — расширение: schema ОТКЛОНЯЕТ {роль:"bogus"} (вне enum)
//     и {} (required «роль») — отрицательная сторона объекта scope
//     (до — только строковый мусор).
//
// vm-песочница — цепочка index.html БЕЗ main.js (паттерн
// tests/active-char-building.test.js: main.js не в цепочке — точку
// __game ставит ТЕСТ; live-ссылки (efir/roster.sheet) — норма).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { SAVE_KEY } = require('../src/save.js');

const P = require('../src/player.js');
const N = require('../src/npc.js');
const { NPCS } = require('../src/npc-data.js');
const { validateData } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''))
  .filter((f) => f !== 'main.js');
const NOW = 1000;

// --- WebGL-стаб (как tests/active-char-building.test.js) ---

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
  gl.getShaderParameter = () => true;
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

// --- Снисходительный DOM-элемент с деревом (дубль
// tests/active-char-building.test.js: нужен делегированный клик). ---

function matchesSel(el, sel) {
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
        if (matchesSel(n, sel)) return n;
        n = n.parent;
      }
      return null;
    },
    querySelector(sel) { return findAll(target, sel)[0] || null; },
    querySelectorAll(sel) { return findAll(target, sel); },
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
      return () => undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

// --- localStorage-мок ---

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// --- Песочница: цепочка index.html БЕЗ main.js ---

function bootSandbox() {
  const winListeners = {};
  const raf = [];
  const errors = [];
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl() : makeContext2d(gameCanvas));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? makeContext2d(spriteCanvas) : null);
  const storage = makeStorage();
  const body = makeEl('body');
  const document = {
    createElement: (tag) => makeEl(tag),
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
    localStorage: storage,
    confirm: () => false,
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
    setTimeout: () => 0,
    clearTimeout: () => {},
  };
  vm.createContext(sandbox);
  for (const f of CHAIN) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox,
      { filename: f });
  }
  return { sandbox, winListeners, raf, errors, storage, body };
}

const drain = () => new Promise((r) => setImmediate(r));

async function boot() {
  const h = bootSandbox();
  await drain();
  await drain();
  await drain();
  return h;
}

// --- Часть A: ядро (require src/npc.js) ---

// Фикстура со всеми видами scope (ключ `для` — концом объекта).
const SCOPE_NPC = {
  id: 'scope_tavern',
  имя: 'Табличка',
  роль: 'тестовый',
  постройки: [44],
  диалог: [
    { id: 'plain', текст: 'Общий разговор', действие: 'подсказка' },
    { id: 'all', текст: 'Разговор для всех', действие: 'подсказка', для: 'все' },
    { id: 'efir_opt', текст: 'Шёпот духу', действие: 'подсказка', для: 'efir' },
    { id: 'efir_char', текст: 'Духу решительному', действие: 'подсказка', для: 'efir', требования: { харизма: 9 } },
    { id: 'merc_opt', текст: 'Слово наёмным', действие: 'подсказка', для: 'merc' },
    { id: 'support_opt', текст: 'Слово целителю', действие: 'подсказка', для: { роль: 'support' } },
    { id: 'melee_opt', текст: 'Слово бойцу', действие: 'подсказка', для: { роль: 'melee' } },
    { id: 'garbage_opt', текст: 'Мусорный scope', действие: 'подсказка', для: 'nobody' },
  ],
};

function makeWorld(over) {
  return Object.assign({
    hero: P.createCharacter('Флогистон'),
    efir: P.createCharacter('Эфир'),
    efirMet: true,
    roster: [],
    deadMercs: [],
  }, over || {});
}

// LIVE __game.state + Game-каталог на время сценария: node --test =
// один процесс на файл — globalThis ставим/убираем, утечка в другие
// тесты файла запрещена (прецедент чтения G.Craft в dialogOptions).
function withWorld(w, fn) {
  const hadGame = Object.prototype.hasOwnProperty.call(globalThis, '__game');
  const hadG = Object.prototype.hasOwnProperty.call(globalThis, 'Game');
  const prevGame = globalThis.__game;
  const prevG = globalThis.Game;
  globalThis.__game = { state: w };
  globalThis.Game = { NpcData: { NPCS } };
  try {
    return fn(w);
  } finally {
    if (hadGame) globalThis.__game = prevGame; else delete globalThis.__game;
    if (hadG) globalThis.Game = prevG; else delete globalThis.Game;
  }
}

const ids = (o) => o.map((e) => e.option.id);

test('A1. `для:"efir"` — НЕ при active=hero (без __game; __game, но character ≠ state.efir)', () => {
  const hero = P.createCharacter();
  const got0 = ids(N.dialogOptions(SCOPE_NPC, hero));
  for (const hidden of ['efir_opt', 'efir_char', 'merc_opt',
      'support_opt', 'melee_opt', 'garbage_opt']) {
    assert.ok(!got0.includes(hidden),
      `hero (без __game): «${hidden}» — скрыта (scope не по hero)`);
  }
  assert.ok(got0.includes('plain') && got0.includes('all'),
    'отсутствует/"все" — hero видит');
  withWorld(makeWorld(), (w) => {
    const other = P.createCharacter();
    const got = ids(N.dialogOptions(SCOPE_NPC, other));
    assert.ok(!got.includes('efir_opt'),
      'character ≠ state.efir (identity) — efir-опция скрыта');
    assert.ok(!got.includes('merc_opt'),
      'character не в roster — merc-опция скрыта');
    assert.ok(!got.includes('support_opt'),
      'hero — {роль}-опция скрыта');
  });
});

test('A2. `для:"efir"` — при character === state.efir (identity), не merc/{роль}', () => {
  withWorld(makeWorld(), (w) => {
    const got = ids(N.dialogOptions(SCOPE_NPC, w.efir));
    assert.ok(got.includes('efir_opt'), 'Эфир видит efir-опцию (identity)');
    assert.ok(!got.includes('merc_opt'), 'Эфир — не наёмный');
    assert.ok(!got.includes('support_opt'), 'Эфир — не {роль}');
    assert.ok(!got.includes('melee_opt'), 'Эфир — не {роль}');
  });
});

test('A3. `для:"merc"` — только roster[i].sheet === character; не hero/efir', () => {
  const mira = P.createCharacter('Мира');
  withWorld(makeWorld({ roster: [{
    npcId: 'merc_mira', level: 1, xp: 0, loyalty: 50, hiredDay: 1,
    sheet: mira,
  }] }), (w) => {
    assert.ok(ids(N.dialogOptions(SCOPE_NPC, mira)).includes('merc_opt'),
      'наёмный (identity roster.sheet) видит merc-опцию');
    assert.ok(!ids(N.dialogOptions(SCOPE_NPC, w.hero)).includes('merc_opt'),
      'hero — не наёмный');
    assert.ok(!ids(N.dialogOptions(SCOPE_NPC, w.efir)).includes('merc_opt'),
      'Эфир — не наёмный');
  });
});

test('A4. `для:{роль}` — по найм.роль каталога (support — только Мира, melee — только Вольк)', () => {
  const mira = P.createCharacter('Мира');
  const volk = P.createCharacter('Вольк');
  withWorld(makeWorld({ roster: [
    { npcId: 'merc_mira', level: 1, xp: 0, loyalty: 50, hiredDay: 1, sheet: mira },
    { npcId: 'merc_volk', level: 1, xp: 0, loyalty: 50, hiredDay: 1, sheet: volk },
  ] }), (w) => {
    const gotMira = ids(N.dialogOptions(SCOPE_NPC, mira));
    assert.ok(gotMira.includes('support_opt'),
      'Мира (найм.роль support) видит support-опцию');
    assert.ok(!gotMira.includes('melee_opt'),
      'Мира — не melee');
    const gotVolk = ids(N.dialogOptions(SCOPE_NPC, volk));
    assert.ok(gotVolk.includes('melee_opt'),
      'Вольк (найм.роль melee) видит melee-опцию');
    assert.ok(!gotVolk.includes('support_opt'),
      'Вольк — не support');
    assert.ok(!ids(N.dialogOptions(SCOPE_NPC, w.hero)).includes('support_opt'),
      'hero — {роль}-опция скрыта');
    assert.ok(!ids(N.dialogOptions(SCOPE_NPC, w.efir)).includes('melee_opt'),
      'Эфир — {роль}-опция скрыта');
  });
});

test('A5. отсутствует и `для:"все"` — всем 4 kind', () => {
  const mira = P.createCharacter('Мира');
  const stranger = P.createCharacter();
  withWorld(makeWorld({ roster: [{
    npcId: 'merc_mira', level: 1, xp: 0, loyalty: 50, hiredDay: 1,
    sheet: mira,
  }] }), (w) => {
    for (const ch of [w.hero, w.efir, mira, stranger]) {
      const got = ids(N.dialogOptions(SCOPE_NPC, ch));
      assert.ok(got.includes('plain'), 'отсутствует `для` — всем');
      assert.ok(got.includes('all'), '`для:"все"` — всем');
    }
  });
});

test('A6. фильтр сохраняет порядок/форму; требования — по переданному character', () => {
  withWorld(makeWorld(), (w) => {
    const o = N.dialogOptions(SCOPE_NPC, w.efir);
    assert.deepEqual(ids(o), ['plain', 'all', 'efir_opt', 'efir_char'],
      'порядок остатка = порядок данных; несовпавшие — НЕ в списке');
    const ec = o.find((e) => e.option.id === 'efir_char');
    assert.equal(ec.доступен, false,
      'Эфир (Харизма 1) — efir-опция с харизмой 9 закрыта');
    assert.equal(ec.причина, 'нужна Харизма 9',
      'причина — по переданному character (не по hero)');
    assert.deepEqual(Object.keys(o[0]),
      ['option', 'доступен', 'причина'], 'форма записи не изменилась');
  });
});

test('A7. hero бит-в-бит: фикстура без `для` (trainNpc) — выход как в npc.test.js', () => {
  const trainNpc = {
    id: 't',
    имя: 'Каркаш',
    роль: 'наставник',
    постройки: [7],
    диалог: [
      { id: 'open', текст: 'Тренировка — или просто смотри?', действие: 'обучение' },
      { id: 'char', текст: 'Слух для решительных', действие: 'подсказка', требования: { харизма: 3 } },
      { id: 'orator', текст: 'Слух для красноречивых', действие: 'подсказка', требования: { навык: { id: 'orator', уровень: 2 } } },
      { id: 'check', текст: 'Слух для знатоков', действие: 'подсказка', требования: { проверка: 3 } },
    ],
    обучение: {
      навыки: ['swordsman', 'heavy', 'archer', 'accuracy'],
      цена_за_уровень: 25,
      цена_переноса_за_уровень: 40,
    },
  };
  const c = P.createCharacter(); // Харизма 1, вторичных навыков нет
  const o = N.dialogOptions(trainNpc, c);
  assert.equal(o.length, 4, 'все 4 опции (без `для` — hero видит всё)');
  assert.deepEqual(o[0], { option: trainNpc.диалог[0], доступен: true, причина: null });
  assert.equal(o[1].доступен, false);
  assert.equal(o[1].причина, 'нужна Харизма 3');
  assert.equal(o[2].доступен, false);
  assert.match(o[2].причина, /Оратор/);
  assert.equal(o[3].доступен, false);
  assert.match(o[3].причина, /бонус к диалогу/);
});

// --- Часть A8: данные каталога (assets/npc) ---

const NPC_DIR = path.join(ROOT, 'assets', 'npc');

function loadNpcFiles() {
  return fs.readdirSync(NPC_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f)).sort()
    .map((f) => ({
      f,
      data: JSON.parse(fs.readFileSync(path.join(NPC_DIR, f), 'utf8')),
    }));
}

test('A8a. каталог: Берта — `для:"efir"` + `для:{роль:"support"}`; Элдира — `для:"merc"` + `для:"все"`; остальные — 0 опций с `для`', () => {
  const files = loadNpcFiles();
  const berta = files.find((x) => x.data.id === 'tavern_keeper');
  assert.ok(berta, 'Берта (tavern_keeper) в каталоге');
  assert.ok(berta.data.диалог.some((o) => o.для === 'efir'),
    'Берта: опция `для:"efir"`');
  assert.ok(berta.data.диалог.some((o) =>
    o.для && typeof o.для === 'object' && o.для.роль === 'support'),
    'Берта: опция `для:{роль:"support"}`');
  const elder = files.find((x) => x.data.id === 'elder');
  assert.ok(elder, 'Элдира (elder) в каталоге');
  assert.ok(elder.data.диалог.some((o) => o.для === 'merc'),
    'Элдира: опция `для:"merc"`');
  assert.ok(elder.data.диалог.some((o) => o.для === 'все'),
    'Элдира: опция `для:"все"` (пин дефолт-семантики)');
  for (const { f, data } of files) {
    if (data.id === 'tavern_keeper' || data.id === 'elder') continue;
    assert.equal(
      data.диалог.filter((o) => o.для !== undefined).length, 0,
      `${f}: опций с «для» нет (остальные NPC — 0-diff)`);
  }
});

test('A8b. каталог: `для` — концом объекта опции, id уникальны, действие — «подсказка»', () => {
  for (const { f, data } of loadNpcFiles()) {
    const seen = new Set();
    for (const o of data.диалог) {
      assert.ok(!seen.has(o.id), `${f}: дубль id опции «${o.id}»`);
      seen.add(o.id);
      if (o.для !== undefined) {
        const keys = Object.keys(o);
        assert.equal(keys[keys.length - 1], 'для',
          `${f} ${o.id}: «для» — концом объекта опции`);
        assert.equal(o.действие, 'подсказка',
          `${f} ${o.id}: действие без мутаций («подсказка»)`);
      }
    }
  }
});

test('A8c. каталог: все файлы валидны по schema.json (ключ `для` принят схемой; мусорный scope — нет)', () => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(NPC_DIR, 'schema.json'), 'utf8'));
  for (const { f, data } of loadNpcFiles()) {
    assert.deepEqual(validateData(schema, data, f), [],
      `${f}: валиден по schema.json`);
  }
  const optSchema = schema.properties.диалог.items;
  assert.notDeepEqual(
    validateData(optSchema,
      { id: 'x', текст: 'Т', действие: 'подсказка', для: 'nobody' },
      'опция'),
    [], 'мусорный scope — невалиден (anyOf: "все"|"efir"|"merc"|{роль})');
  assert.deepEqual(
    validateData(optSchema,
      { id: 'x', текст: 'Т', действие: 'подсказка', для: { роль: 'support' } },
      'опция'),
    [], '`для:{роль:"support"}` — валиден');
  assert.deepEqual(
    validateData(optSchema,
      { id: 'x', текст: 'Т', действие: 'подсказка', для: 'все' },
      'опция'),
    [], '`для:"все"` — валиден');
  assert.notDeepEqual(
    validateData(optSchema,
      { id: 'x', текст: 'Т', действие: 'подсказка',
        для: { роль: 'bogus' } },
      'опция'),
    [], 'объект {роль} вне enum — невалиден (000311)');
  assert.notDeepEqual(
    validateData(optSchema,
      { id: 'x', текст: 'Т', действие: 'подсказка', для: {} },
      'опция'),
    [], 'пустой объект scope — невалиден: required «роль» (000311)');
});

test('A9. Game.NpcData нет → роль наёмного null: «merc» совпадёт, {роль} — нет (деградация, 000311)', () => {
  const mira = P.createCharacter('Мира');
  const w = makeWorld({ roster: [{
    npcId: 'merc_mira', level: 1, xp: 0, loyalty: 50, hiredDay: 1,
    sheet: mira,
  }] });
  const hadGame = Object.prototype.hasOwnProperty.call(globalThis, '__game');
  const hadG = Object.prototype.hasOwnProperty.call(globalThis, 'Game');
  const prevGame = globalThis.__game;
  const prevG = globalThis.Game;
  globalThis.__game = { state: w };
  globalThis.Game = {};
  try {
    const got = ids(N.dialogOptions(SCOPE_NPC, mira));
    assert.ok(got.includes('merc_opt'),
      '«merc» — по kind, роль из каталога не нужна');
    assert.ok(!got.includes('support_opt'),
      '{роль} — role null → не совпадёт (fail-closed, 000311)');
    assert.ok(!got.includes('melee_opt'),
      '{роль} — role null → не совпадёт (fail-closed, 000311)');
    assert.ok(!got.includes('efir_opt'),
      'efir — не по наёмному');
  } finally {
    if (hadGame) globalThis.__game = prevGame;
    else delete globalThis.__game;
    if (hadG) globalThis.Game = prevG;
    else delete globalThis.Game;
  }
});

test('A10. лист без primary/secondary (bare {level:1}): требования «не выполнено», строки причин те же (000053, 000311)', () => {
  const npc = {
    id: 'bare_req',
    имя: 'Каркаш',
    роль: 'наставник',
    постройки: [7],
    диалог: [
      { id: 'char', текст: 'Слух для решительных', действие: 'подсказка', требования: { харизма: 3 } },
      { id: 'orator', текст: 'Слух для красноречивых', действие: 'подсказка', требования: { навык: { id: 'orator', уровень: 2 } } },
      { id: 'check', текст: 'Слух для знатоков', действие: 'подсказка', требования: { проверка: 3 } },
    ],
  };
  const bare = { level: 1 };
  const o = N.dialogOptions(npc, bare);
  assert.equal(o.length, 3, 'опции на месте (scope отсутствует)');
  assert.deepEqual(o[0],
    { option: npc.диалог[0], доступен: false, причина: 'нужна Харизма 3' },
    'харизма: 0 < 3 — строка причины та же (000053)');
  assert.deepEqual(o[1],
    { option: npc.диалог[1], доступен: false, причина: 'нужен Оратор 2' },
    'навык: 0 < 2 — строка причины та же (000053)');
  assert.deepEqual(o[2],
    { option: npc.диалог[2], доступен: false, причина: 'бонус к диалогу меньше 3' },
    'проверка: dialogueBonus 0 < 3 — строка причины та же (000053)');
});

// --- Часть B: vm npcUI (src/ui.js) ---

function seedWorld(h, over = {}) {
  const G = h.sandbox.Game;
  const state = {
    day: 1,
    hero: over.hero !== undefined ? over.hero
      : G.createCharacter('Флогистон'),
    efir: over.efir !== undefined ? over.efir
      : G.efir.createEfir(),
    efirMet: over.efirMet !== undefined ? over.efirMet : true,
    roster: over.roster !== undefined ? over.roster : [],
    deadMercs: over.deadMercs !== undefined ? over.deadMercs : [],
  };
  h.sandbox.__game = { state };
  return state;
}

function lastOverlay(h) {
  const ch = h.body.children;
  return ch[ch.length - 1];
}

function openNpc(h, npcId, st, over = {}) {
  const G = h.sandbox.Game;
  const npc = G.NpcData.NPCS.find((n) => n.id === npcId);
  assert.ok(npc, `NPC ${npcId} в каталоге`);
  G.npcUI.open(Object.assign({
    npc,
    character: st.hero,
    book: G.createQuestBook(),
    tile: { x: 1, y: 1, building: { id: 44 }, buildingWealth: 1 },
    day: 1,
    roster: st.roster,
    deadMercs: st.deadMercs,
  }, over));
  return { G, overlay: lastOverlay(h) };
}

// id опций Берты по scope (из каталога — не хардкод).
function bertaScopeOpt(G, pred) {
  const npc = G.NpcData.NPCS.find((n) => n.id === 'tavern_keeper');
  return npc.диалог.find(pred);
}

function dialogOptIds(overlay) {
  return overlay.querySelectorAll('button[data-optid]')
    .map((b) => b.dataset.optid);
}

test('B1. npcUI Берта, активный = Флогистон (дефолт): efir/support-опций НЕТ, обычные на месте, 0 новых console.error', async () => {
  const h = await boot();
  const st = seedWorld(h);
  const mira = h.sandbox.Game.createCharacter('Мира');
  st.roster.push({
    npcId: 'merc_mira', level: 1, xp: 0, loyalty: 50, hiredDay: 1,
    sheet: mira,
  });
  const { G, overlay } = openNpc(h, 'tavern_keeper', st);
  const before = h.errors.length;
  const idsNow = dialogOptIds(overlay);
  for (const optId of ['prives', 'rumors', 'quests', 'hire']) {
    assert.ok(idsNow.includes(optId), `обычная опция «${optId}» на месте`);
  }
  const efirOpt = bertaScopeOpt(G, (o) => o.для === 'efir');
  const supportOpt = bertaScopeOpt(G, (o) =>
    o.для && typeof o.для === 'object' && o.для.роль === 'support');
  assert.ok(efirOpt, 'в каталоге Берты есть efir-опция');
  assert.ok(supportOpt, 'в каталоге Берты есть support-опция');
  assert.ok(!idsNow.includes(efirOpt.id),
    'efir-опция НЕ рисуется при активном Флогистоне');
  assert.ok(!idsNow.includes(supportOpt.id),
    'support-опция НЕ рисуется при активном Флогистоне');
  assert.equal(h.errors.length, before,
    '0 новых console.error (оверлей + ряд портретов)');
  G.npcUI.close();
});

test('B2. клик по портрету Эфира: efir-опция ВИДНА без переключения вкладки, support — НЕТ (re-render «диалог»)', async () => {
  const h = await boot();
  const st = seedWorld(h);
  const mira = h.sandbox.Game.createCharacter('Мира');
  st.roster.push({
    npcId: 'merc_mira', level: 1, xp: 0, loyalty: 50, hiredDay: 1,
    sheet: mira,
  });
  const { G, overlay } = openNpc(h, 'tavern_keeper', st);
  const row = overlay.querySelector('.cp-portraits');
  const efirBtn = row.querySelectorAll('button.cp-portrait')
    .find((b) => b.dataset.memberid === 'efir');
  assert.ok(efirBtn, 'портрет Эфира в ряду (efirMet)');
  overlay.listeners.click[0]({ target: efirBtn });
  const idsNow = dialogOptIds(overlay);
  const efirOpt = bertaScopeOpt(G, (o) => o.для === 'efir');
  const supportOpt = bertaScopeOpt(G, (o) =>
    o.для && typeof o.для === 'object' && o.для.роль === 'support');
  assert.ok(idsNow.includes(efirOpt.id),
    'efir-опция видна при активном Эфире (сразу, без смены вкладки)');
  assert.ok(!idsNow.includes(supportOpt.id),
    'support-опция НЕ видна при активном Эфире');
  for (const optId of ['prives', 'quests', 'hire']) {
    assert.ok(idsNow.includes(optId),
      `обычная опция «${optId}» видна Эфиру (scope нет → всем)`);
  }
  assert.equal(G.playerUI.getActiveCharId(), 'efir', 'активный — «efir»');
  assert.ok(G.npcUI.isActive(), 'диалог НЕ закрылся');
  G.npcUI.close();
  G.playerUI.setActiveCharId(null);
});

test('B3. клик по портрету наёмного (Мира, support): support-опция видна, efir — нет', async () => {
  const h = await boot();
  const st = seedWorld(h);
  const mira = h.sandbox.Game.createCharacter('Мира');
  st.roster.push({
    npcId: 'merc_mira', level: 1, xp: 0, loyalty: 50, hiredDay: 1,
    sheet: mira,
  });
  const { G, overlay } = openNpc(h, 'tavern_keeper', st);
  const row = overlay.querySelector('.cp-portraits');
  const miraBtn = row.querySelectorAll('button.cp-portrait')
    .find((b) => b.dataset.memberid === 'merc_mira');
  assert.ok(miraBtn, 'портрет наёмного в ряду');
  overlay.listeners.click[0]({ target: miraBtn });
  const idsNow = dialogOptIds(overlay);
  const efirOpt = bertaScopeOpt(G, (o) => o.для === 'efir');
  const supportOpt = bertaScopeOpt(G, (o) =>
    o.для && typeof o.для === 'object' && o.для.роль === 'support');
  assert.ok(idsNow.includes(supportOpt.id),
    'support-опция видна наёмному с найм.роль support');
  assert.ok(!idsNow.includes(efirOpt.id),
    'efir-опция НЕ видна наёмному');
  assert.equal(G.playerUI.getActiveCharId(), 'merc_mira',
    'активный — npcId');
  G.npcUI.close();
  G.playerUI.setActiveCharId(null);
});

test('B4. владелец мутаций — hero: активный = Эфир, торговля Берты-соседа (Бренн): «Золото» = hero.gold, покупка — с hero, предмет — в hero-инвентаре, gold hero конечен', async () => {
  const h = await boot();
  const st = seedWorld(h);
  const { G } = openNpc(h, 'weapons_merchant', st);
  const heroGoldBefore = st.hero.gold;
  assert.ok(Number.isFinite(heroGoldBefore) && heroGoldBefore > 10,
    'у hero есть золото');
  G.playerUI.setActiveCharId('efir');
  assert.equal(Number.isFinite(st.efir.gold), false,
    'sheet Эфира без gold (ловушка NaN — владелец не Эфир)');
  const overlay = lastOverlay(h);
  const tradeTab = overlay.querySelectorAll('button[data-npcact="tab"]')
    .find((b) => b.dataset.tab === 'trade');
  overlay.listeners.click[0]({ target: tradeTab });
  const goldLine = overlay.querySelectorAll('.cp-itemmeta')
    .map((e) => String(e.textContent)).find((s) => s.startsWith('Золото:'));
  assert.equal(goldLine, 'Золото: ' + heroGoldBefore,
    'вкладка «торговля» — золото hero (активный не меняет владельца)');
  const buyBtn = overlay.querySelectorAll('button[data-npcact="buy"]')[0];
  assert.ok(buyBtn, 'кнопка «купить» на месте');
  const itemId = buyBtn.dataset.item;
  overlay.listeners.click[0]({ target: buyBtn });
  assert.equal(st.hero.gold, heroGoldBefore - 10,
    'покупка (wood_sword, цена 10) — с hero');
  assert.ok(Number.isFinite(st.hero.gold), 'gold hero — конечное (не NaN)');
  assert.ok(G.hasItem(st.hero, itemId, 1),
    'предмет — в инвентаре hero (общий, 000194)');
  G.npcUI.close();
  G.playerUI.setActiveCharId(null);
});

test('B5. вкладка «найм» — без изменений (hero активный: кандидаты + найм-кнопки)', async () => {
  const h = await boot();
  const st = seedWorld(h);
  const mira = h.sandbox.Game.createCharacter('Мира');
  st.roster.push({
    npcId: 'merc_mira', level: 1, xp: 0, loyalty: 50, hiredDay: 1,
    sheet: mira,
  });
  const { G, overlay } = openNpc(h, 'tavern_keeper', st);
  const hireTab = overlay.querySelectorAll('button[data-npcact="tab"]')
    .find((b) => b.dataset.tab === 'hire');
  overlay.listeners.click[0]({ target: hireTab });
  const hireBtns = overlay.querySelectorAll('button[data-npcact="hire"]');
  assert.ok(hireBtns.length >= 5,
    'кандидаты на найм рисуются (≥5: 6 наёмников − 1 в отряде)');
  const squad = overlay.querySelectorAll('.cp-section')
    .find((s) => String(s.textContent).includes('Отряд'));
  assert.ok(squad, 'блок «Отряд» на месте');
  const dismissBtns = overlay.querySelectorAll('button[data-npcact="dismiss"]');
  assert.equal(dismissBtns.length, 1, 'в отряде 1 наёмный (Мира)');
  G.npcUI.close();
});

test('B6. ВТОРОЙ call-site: opt-ветка onOverlayClick — клик по scoped-опции при активном ≠ hero — действие по АКТИВНОМУ (000311)', async () => {
  const h = await boot();
  const st = seedWorld(h);
  const { G, overlay } = openNpc(h, 'tavern_keeper', st);
  const row = overlay.querySelector('.cp-portraits');
  const efirBtn = row.querySelectorAll('button.cp-portrait')
    .find((b) => b.dataset.memberid === 'efir');
  assert.ok(efirBtn, 'портрет Эфира в ряду (efirMet)');
  overlay.listeners.click[0]({ target: efirBtn });
  assert.equal(G.playerUI.getActiveCharId(), 'efir', 'активный — «efir»');
  const efirOpt = bertaScopeOpt(G, (o) => o.для === 'efir');
  assert.ok(efirOpt, 'в каталоге Берты есть efir-опция');
  const optBtn = overlay.querySelectorAll('button[data-optid]')
    .find((b) => b.dataset.optid === efirOpt.id);
  assert.ok(optBtn, 'efir-опция видна активному (renderDialogTab)');
  const logEl = overlay.querySelector('.npc-log');
  const logBefore = String(logEl.textContent);
  overlay.listeners.click[0]({ target: optBtn });
  const logAfter = String(logEl.textContent);
  assert.ok(logAfter.includes(efirOpt.текст),
    'действие применено: текст опции — в .npc-log (opt-ветка ' +
    'резолвит по activeSheetNow(), не по hero)');
  assert.notEqual(logAfter, logBefore, 'лог обновился');
  assert.ok(G.npcUI.isActive(), 'диалог НЕ закрылся');
  assert.ok(overlay.querySelectorAll('button[data-optid]')
    .some((b) => b.dataset.optid === efirOpt.id),
    'вкладка «диалог» НЕ переключена (renderTab перерисовал её)');
  G.npcUI.close();
  G.playerUI.setActiveCharId(null);
});

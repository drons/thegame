// Школа NPC: лимит 10 обучений за уровень + очки обучения на панели
// персонажа [I] (задача 000298) — КРАСНЫЕ тесты (UI-слой, vm).
// Код игры (src/ui-tab-skills.js, src/npc.js, src/sheet.js) НЕ
// меняется на красной стадии: строка «Очки обучения: N» в hero-
// ветвке панели, лимит в ядре (canSchoolTrain/schoolTrain), сброс
// при ап-левеле — зелёная стадия (конвенция lane 000296/000297).
//
// Контракт: memory/000298-npc-school-level-limit.md (D8, §5 U1–U2):
//   U1. Панель [I] (вкладка «Персонаж»): .cp-stats — строка «Очки
//       обучения: 10» (fresh-герой); 10 × клик button[data-npcact=
//       "train"] (swordsman) через делегированный click диалога Карка
//       (000005) — хендлер сам зовёт G.playerUI.render() — после
//       КАЖДОГО «Очки обучения: 9…0»; после 10-го: bTrain
//       disabled === true, title === 'нет очков обучения на этом
//       уровне'; регрессии: «Свободные очки: 0» в train-табе, gold
//       1e6 − 3050, errors.length === 0.
//   U2. Ап-левел в vm: после 10 (0) — G.addXp(c, G.xpForNext(1)) →
//       level 2 → render → «Очки обучения: 10», кнопка снова активна;
//       ещё 10 обучений → 0 → disabled; 11-й клик — no-op (gold /
//       level / secondary не изменились — guard disabled в
//       onOverlayClick).
//
// CHAIN — ДИНАМИЧЕСКИЙ: ВСЕ <script src> index.html до ui.js
// включительно (IIFE-паттерн tests/ui-panel-htmlcollection.test.js —
// ВКЛЮЧАЕТ ui-tabs.js/ui-tab-skills.js, которые нужны вкладке
// «Персонаж»; НЕ статичный CHAIN 000297 — там нет ui-tab-skills.js).
// DOM-стаб — дубль tests/npc-school-no-refund.test.js (атрибут-
// селекторы для e.target.closest('button[data-npcact]') в
// onOverlayClick); panel-утилиты (panesOf/стат-панель) — по образцу
// tests/ui-panel-htmlcollection.test.js.
//
// Краснота ОСМЫСЛЕННАЯ (цепочка грузится чисто — первым ассертом
// errors 0; панели рендерятся):
//   U1 — строки «Очки обучения: …» в .cp-stats НЕТ (ui-tab-skills.js
//       её не рисует); после 10-го bTrain активен (лимит в ядре нет);
//   U2 — нет строки + нет сброса (кнопка после 10-го активна).
// expectedRedCount (файл) = 2 (U1, U2).
// Файл НЕ содержит литерала «SPEC» + «453» (скан-тест SPEC-453-GONE).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const page = () => fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// --- Минимальный DOM-стаб с деревом (дубль
// tests/npc-school-no-refund.test.js): matchesSel — с атрибутивными
// селекторами для onOverlayClick ---

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

// --- ДИНАМИЧЕСКИЙ CHAIN: ВСЕ <script src> index.html до ui.js
// включительно (паттерн tests/ui-panel-htmlcollection.test.js) ---
const CHAIN = (() => {
  const all = Array.from(
    page().matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
    .map((p) => p.replace(/^src\//, ''));
  const i = all.indexOf('ui.js');
  assert.ok(i >= 0, 'ui.js подключён в index.html');
  return all.slice(0, i + 1);
})();

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
  for (const f of CHAIN) vm.runInContext(src(f), sandbox, { filename: f });
  return { G: sandbox.Game, body: document.body, errors, sandbox };
}

// Окружение: цепочка чистая + герой (gold 1e6) + панель [I] на
// герое (setCharacter). __game.state — live-роль main.js (roster
// пуст — партия = только герой).
function makeEnv() {
  const env = loadEnv();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  assert.ok(env.G.playerUI, 'Game.playerUI создан (ui.js в CHAIN)');
  const hero = env.G.createCharacter();
  hero.gold = 1000000;
  env.sandbox.__game = { state: { efir: null, efirMet: false,
    roster: [] } };
  env.hero = hero;
  env.G.playerUI.setCharacter(hero);
  return env;
}

// toggle(true) с ловлей выброса (осмысленное падение, не крах файла).
function openPanel(env) {
  let err = null;
  try {
    env.G.playerUI.toggle(true);
  } catch (e) {
    err = e;
  }
  assert.equal(err, null,
    'playerUI.toggle(true) — БЕЗ выброса: '
    + (err ? err.constructor.name + ': ' + err.message : ''));
}

// .cp-stats вкладки «Персонаж» (левый столбец, первая pane) —
// СВЕЖИЙ запрос (панель рендерится в месте, но запрос по дереву —
// истина после каждого render).
function statsOf(env) {
  const panel = findAll(env.body, '.char-panel')[0];
  assert.ok(panel, 'панель .char-panel в body');
  const cols = findAll(panel, '.cp-column');
  assert.equal(cols.length, 2, 'два столбца (контракт 000096)');
  const left = findAll(cols[0], '.cp-tabpane');
  assert.equal(left.length, 3, 'лево: 3 pane (Персонаж/Инвентарь/Настройки)');
  const stats = left[0].querySelector('.cp-stats');
  assert.ok(stats, '.cp-stats в character-pane');
  return stats;
}

// Значение строки «Очки обучения: N» в .cp-stats | null (строки нет).
function trainPointsOf(env) {
  const m = statsOf(env).textContent.match(/Очки обучения: (\d+)/);
  return m ? Number(m[1]) : null;
}

// --- Хелперы диалога NPC (дубль tests/npc-school-no-refund.test.js) ---

// NPC 000005 (Карк): постройки [7], обучение ['swordsman','heavy'],
// диалог-опция id 'train' действие 'обучение' БЕЗ требований.
function karkOf(env) {
  const npc = (env.G.NpcData && env.G.NpcData.NPCS || [])
    .find((n) => n && n.имя === 'Карк');
  assert.ok(npc, 'NPC «Карк» (000005) в каталоге Game.NpcData.NPCS');
  assert.deepEqual(Array.from(npc.обучение.навыки),
    ['swordsman', 'heavy'], 'обучение = [swordsman, heavy]');
  const opt = npc.диалог.find((x) => x.id === 'train');
  assert.ok(opt && opt.действие === 'обучение' && !opt.требования,
    'диалог-опция id «train» (действие «обучение», без требований)');
  return npc;
}

function openNpcDialog(env, npc, character) {
  assert.ok(env.G.npcUI, 'Game.npcUI создан (npc.js + ui.js загружены)');
  env.G.npcUI.open({
    npc, character, book: env.G.createQuestBook(),
  });
  const overlay = findAll(env.body, '.npc-overlay')[0];
  assert.ok(overlay, 'оверлей .npc-overlay подвешен к body');
  assert.equal(env.G.npcUI.isActive(), true, 'диалог открыт');
  return { overlay };
}

function trainTabButton(overlay) {
  const b = findAll(overlay, '.cp-btn')
    .find((x) => x.dataset.npcact === 'tab' && x.dataset.tab === 'train');
  assert.ok(b, 'вкладка «школа» (data-tab="train") в ряде вкладок');
  return b;
}

// Клик через ЕДИНСТВЕННЫЙ делегированный обработчик оверлея.
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

// Кнопка обучения swordsman в train-табе (СВЕЖИЙ запрос после
// renderTab — узел пересоздаётся при каждой отрисовке вкладки).
function swordsmanBtn(overlay) {
  const b = findAll(overlay, 'button[data-npcact="train"]')
    .find((x) => x.dataset.skill === 'swordsman');
  assert.ok(b, 'bTrain (swordsman) в train-табе');
  return b;
}

test('000298 U1: панель [I] — «Очки обучения: 10» → 10 обучений через диалог Карка → 9…0; после 10-го — disabled + title=reason; регрессии: «Свободные очки: 0», gold 1e6−3050, errors 0', () => {
  const env = makeEnv();
  const c = env.hero;
  openPanel(env);
  assert.equal(trainPointsOf(env), 10,
    'fresh-герой — строка «Очки обучения: 10» (полный бюджет): '
    + JSON.stringify(statsOf(env).textContent));

  const kark = karkOf(env);
  const { overlay } = openNpcDialog(env, kark, c);
  overlayClick(overlay, trainTabButton(overlay));

  let bTrain = swordsmanBtn(overlay);
  assert.equal(bTrain.disabled, false, 'старт — кнопка swordsman активна');
  for (let i = 1; i <= 10; i++) {
    overlayClick(overlay, bTrain);
    assert.equal(trainPointsOf(env), 10 - i,
      'после #' + i + ' обучения — «Очки обучения: ' + (10 - i)
      + '» (хендлер сам зовёт G.playerUI.render()): '
      + JSON.stringify(statsOf(env).textContent));
    bTrain = swordsmanBtn(overlay);
  }
  assert.equal(c.gold, 1000000 - 3050,
    'gold 1e6 − 3050 (сумма 10 шагов 20 + 10·L²)');
  assert.equal(bTrain.disabled, true,
    'после 10-го — кнопка swordsman disabled (бюджет исчерпан)');
  assert.equal(bTrain.title, 'нет очков обучения на этом уровне',
    'title — точный reason (renderTrainTab: disabled + title=can.reason)');
  const metas = findAll(bodyOf(overlay), '.cp-itemmeta')
    .map((m) => m.textContent);
  assert.ok(metas.includes('Свободные очки: 0'),
    'регрессия: строка «Свободные очки: 0» в train-табе на месте');
  assert.equal(env.errors.length, 0,
    'ошибок цепочки нет: ' + env.errors.join('; '));
});

test('000298 U2: ап-левел в vm — G.addXp: 0 → «Очки обучения: 10», кнопка активна; ещё 10 → 0 → disabled; 11-й клик — no-op (gold/level/secondary не изменились)', () => {
  const env = makeEnv();
  const c = env.hero;
  openPanel(env);
  const kark = karkOf(env);
  const { overlay } = openNpcDialog(env, kark, c);
  overlayClick(overlay, trainTabButton(overlay));

  let bTrain = swordsmanBtn(overlay);
  for (let i = 1; i <= 10; i++) {
    overlayClick(overlay, bTrain);
    bTrain = swordsmanBtn(overlay);
  }
  assert.equal(bTrain.disabled, true,
    'после 10-го (уровень 1) — disabled (бюджет 0)');
  assert.equal(c.level, 1, 'старт: уровень 1');

  env.G.addXp(c, env.G.xpForNext(1));
  assert.equal(c.level, 2, 'level 1→2 (G.addXp)');
  env.G.playerUI.render();
  assert.equal(trainPointsOf(env), 10,
    'ап-левел — лимит восстанавливается (панель «Очки обучения: 10»): '
    + JSON.stringify(statsOf(env).textContent));
  // Таб оверлея перерисовывает renderTab() при СМЕНЕ/повторном
  // выборе вкладки (реальный поток; playerUI.render не трогает
  // оверлей — D8): повторный клик по вкладке «школа».
  overlayClick(overlay, trainTabButton(overlay));
  bTrain = swordsmanBtn(overlay);
  assert.equal(bTrain.disabled, false,
    'после ап-левела — кнопка снова активна');

  for (let i = 1; i <= 10; i++) {
    overlayClick(overlay, bTrain);
    bTrain = swordsmanBtn(overlay);
  }
  assert.equal(trainPointsOf(env), 0,
    'уровень 2: после 10 обучений — «Очки обучения: 0»');
  assert.equal(bTrain.disabled, true, 'уровень 2: 0 → disabled');

  const goldBefore = c.gold;
  const swBefore = c.secondary.swordsman;
  overlayClick(overlay, bTrain);
  assert.equal(c.gold, goldBefore, '11-й клик — золото не тронуто (no-op)');
  assert.equal(c.level, 2, '11-й клик — уровень не изменился');
  assert.equal(c.secondary.swordsman, swBefore,
    '11-й клик — навык не изменился (guard disabled в onOverlayClick)');
  assert.equal(env.errors.length, 0,
    'ошибок цепочки нет: ' + env.errors.join('; '));
});

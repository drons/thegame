// Задача 000145 (follow-up 000139): «Персонаж» — выбор активного
// персонажа + прокачка его навыков: ряд иконок-портретов СВЕРХУ
// страницы (000142), per-session выбор (в сейв НЕ пишем — 000031),
// единый лист (sheet 000140/000143/000144) для ВСЕХ kinds + raise на
// любого, книга заклинаний, Эфир-вид («Вдох Эфира» + отметки
// авто-разблокировок), навигация из «Отряда» (строка наёмного → его
// страница), toggle(force, tabId, charId).
//
// Контракт: memory/000145-active-character.md (§2 — Game.Party,
// §3 — DOM страницы, §4 — выбор активного, §5 — raise-маршрутизация,
// §12 — порядок веток «Отряда»). ТЗ: tasks/pending/000145.md.
//
// КРАСНЫЕ (падают на ТЕКУЩЕМ коде — функциональности НЕТ; падение —
// ПО СИМВОЛУ, а не SyntaxError/крах файла; цепочки грузятся чисто —
// load-errors === 0 проверяется первым ассертом):
//   * A1–A8 (node) — модуля src/party.js НЕТ: Game.Party =
//     {list, active} — ЧИСТЫЕ функции списка партии + выбора
//     (ТЗ дословно: «Красный ДО: функция списка партии не
//     существует»);
//   * B1–B3, B5–B9 (vm) — ряда .cp-portraits в DOM НЕТ (активный
//     всегда = герой — ctx.character; raise только
//     G.raiseSkill(герой); «Книга заклинаний»/«Вдох Эфира» на
//     странице нет; 3-го аргумента toggle НЕТ;
//     playerUI.getActiveCharId() НЕТ; у строк «Отряда»
//     data-partytab НЕТ → навигации строкой НЕТ).
//   * B4 — ЗЕЛЁНЫЙ с первого запуска (регрессийный hero-raise —
//     старый путь выживает после роутинга).
//
// Механика — как существующие UI-тесты проекта:
//   * ЧАСТЬ A — node: require('src/party.js') (UMD node-ветка —
//     определение {list, active}, без DOM/регистрации);
//   * ЧАСТЬ B — vm-песочницы: ДИНАМИЧЕСКИЙ CHAIN — ВСЕ <script src>
//     index.html до ui.js включительно (паттерн
//     tests/ui-efir.test.js L174) — подхватит ЛЮБОЙ новый тег
//     (src/party.js) сам; `__game.state` (efir/efirMet/roster —
//     live) инжестируется ДО openPanel (main.js в цепочке нет —
//     точку ставит тест); герой — G.createCharacter() +
//     G.playerUI.setCharacter(hero) (ctx.character — НЕ
//     __game.state.hero: СНАПШОТ, ловушка §13.1 контракта).
//   * клик — ОДИН делегированный слушатель панели:
//     panel.listeners.click[0]({ target: el }).
//
// Стаб — дубль tests/ui-efir.test.js (makeEl/findAll/closest/
// dataset/style/listeners; textContent сбрасывает children) +
// «тег[атрибут]»-селекторы в matchesSel (дубль
// tests/squad-panel.test.js L63-88: кликер «Отряда» текущий код
// уже использует 'div[data-efirtab]'/'button[data-squadact]';
// голый [attr] стабы не понимают).
//
// Cross-realm (vm): пины — примитивы/текст/длина (правило 000082);
// живые ссылки (sheet === hero) — только ВНУТРИ одной песочницы/
// одного require (ЧАСТЬ A).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const page = () => fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// --- Минимальный DOM-стаб с деревом (дубль tests/ui-efir.test.js;
// matchesSel — с «тег[атрибут]», дубль tests/squad-panel.test.js) ---

function matchesSel(el, sel) {
  // 'тег[атрибут]' / 'тег[атрибут=значение]' (делегированные клики:
  // e.target.closest('button[data-squadact]') и 'div[data-efirtab]'),
  // '.класс', имя тега.
  const m = /^([a-zA-Z][\w-]*)\[([\w-]+)(?:=([^\]]+))?\]$/.exec(sel);
  if (m) {
    if (String(el.tagName || '').toLowerCase() !== m[1].toLowerCase()) {
      return false;
    }
    // Стаб хранит атрибуты dataset БЕЗ префикса 'data-' (ui.js пишет
    // row.dataset.partytab напрямую). Проверяем оба варианта ключа.
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
  // textContent = '' — как в DOM, сбрасывает детей (render() панели
  // пересобирает секции in place — тела обновляются, НЕ строятся).
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

// ============================================================
// ЧАСТЬ A — node: Game.Party (src/party.js) — ЧИСТЫЕ функции
// списка партии + выбора (ТЗ: «Красный ДО: функция списка
// партии не существует»)
// ============================================================

// Guarded-require: RED-фаза — файла НЕТ; падение — ОСМЫСЛЕННОЕ
// assert.fail («модуль отсутствует»), не MODULE_NOT_FOUND-крах
// всего файла (каждый A-тест падает независимо).
function loadParty() {
  let m;
  try {
    m = require('../src/party.js');
  } catch (e) {
    assert.fail(
      'модуль src/party.js отсутствует (задача 000145: Game.Party = ' +
      '{list, active} — чистые функции списка партии + выбора): ' +
      e.message);
  }
  return m;
}

// Листы-заглушки (ЧАСТЬ A): Party.list — ЧИСТАЯ функция — ссылки
// прокидывает как есть; данные листов (level/points/primary/...) не
// читает (имя героя — hero.name, имена/роли наёмных — каталог npcs).
const heroObj = (name = 'Флогистон') =>
  ({ name, level: 1, xp: 0, points: 0,
     primary: { strength: 1 }, secondary: {}, skillXp: {} });
const sheetObj = (npcId) =>
  ({ kind: 'merc', level: 1, xp: 0, points: 0,
     primary: { strength: 3 }, secondary: {}, skillXp: {}, npcId });
const entryObj = (npcId, sheet, level = 1) =>
  ({ npcId, sheet, level, xp: 0, loyalty: 50, hiredDay: 1 });
const npcsCatalog = [
  { id: 'merc_volk', имя: 'Вольк', роль: 'наёмник',
    найм: { роль: 'melee' } },
  { id: 'merc_ashka', имя: 'Ашка', роль: 'наёмница',
    найм: { роль: 'ranged' } },
];

test('000145 A1: node — модуль src/party.js существует: UMD node-ветка возвращает {list, active} — функции', () => {
  const m = loadParty();
  assert.equal(typeof m, 'object', 'экспорт — объект (определение)');
  assert.equal(typeof m.list, 'function',
    'Game.Party.list(src) — функция списка партии (ТЗ: «Красный ДО: ' +
    'функция списка партии не существует»)');
  assert.equal(typeof m.active, 'function',
    'Game.Party.active(list, id) — функция выбора активного');
});

test('000145 A2: list — состав и порядок: hero → efir → roster; {kind,id,name,role,sheet,npc?}; sheet — ЖИВЫЕ ссылки; id-пространство (000142); role из каталога (ТЗ: «Наёмник (роль)»)', () => {
  const m = loadParty();
  const hero = heroObj();
  const efir = { kind: 'efir', level: 1, xp: 0, points: 0 };
  const sA = sheetObj('merc_volk');
  const sB = sheetObj('merc_ashka');
  const roster = [entryObj('merc_volk', sA), entryObj('merc_ashka', sB, 3)];
  const list = m.list({ hero, efir, efirMet: true, roster,
    npcs: npcsCatalog });
  assert.equal(list.length, 4, 'hero + efir + 2 наёмных');
  assert.deepEqual(list.map((x) => x.kind),
    ['hero', 'efir', 'merc', 'merc'], 'порядок: hero → efir → roster');
  // hero — ВСЕГДА ПЕРВЫМ (id 'flogiston' — 000142)
  assert.equal(list[0].id, 'flogiston', 'id героя — «flogiston»');
  assert.equal(list[0].name, 'Флогистон', 'имя героя — hero.name');
  assert.equal(list[0].role, 'Герой', 'role героя — «Герой»');
  assert.equal(list[0].sheet, hero, 'sheet — ЖИВАЯ ссылка (raise in place)');
  // efir — вторым (id 'efir')
  assert.equal(list[1].id, 'efir', 'id «efir»');
  assert.equal(list[1].name, 'Эфир', 'имя — «Эфир»');
  assert.equal(list[1].role, 'Дух', 'role — «Дух»');
  assert.equal(list[1].sheet, efir, 'sheet — живая ссылка');
  // наёмные — в порядке roster (id = entry.npcId)
  assert.equal(list[2].id, 'merc_volk', 'id наёмного = entry.npcId');
  assert.equal(list[2].name, 'Вольк', 'имя — из каталога npc-data');
  assert.equal(list[2].role, 'Наёмник (melee)',
    'role — каталожная роль + найм.роль в скобках (ТЗ tooltip)');
  assert.equal(list[2].sheet, sA, 'sheet — живая ссылка entry.sheet');
  assert.equal(list[2].npc, npcsCatalog[0], 'npc — запись каталога');
  assert.equal(list[3].id, 'merc_ashka', 'порядок = порядок roster');
  assert.equal(list[3].name, 'Ашка');
  assert.equal(list[3].role, 'Наёмница (ranged)');
  assert.equal(list[3].sheet, sB);
  assert.equal(list[3].npc, npcsCatalog[1]);
});

test('000145 A3: list — гейт Эфира (efirMet === true И efir — объект) и позиция: Эфир — между героем и наёмными; без hero — Эфир первым', () => {
  const m = loadParty();
  const hero = heroObj();
  const efir = { kind: 'efir' };
  const sA = sheetObj('merc_volk');
  const roster = [entryObj('merc_volk', sA)];
  // (a) efirMet: false → Эфира НЕТ (даже с объектом)
  let l = m.list({ hero, efir, efirMet: false, roster,
    npcs: npcsCatalog });
  assert.deepEqual(l.map((x) => x.kind), ['hero', 'merc'],
    'efirMet=false → Эфира нет (гейт save-поля, ТЗ: «только при efir_met»)');
  // (b) efir: null → Эфира НЕТ (даже с efirMet)
  l = m.list({ hero, efir: null, efirMet: true, roster,
    npcs: npcsCatalog });
  assert.deepEqual(l.map((x) => x.kind), ['hero', 'merc'],
    'efir=null → Эфира нет');
  // (c) мет + объект → Эфир вторым (после hero, до mercs)
  l = m.list({ hero, efir, efirMet: true, roster, npcs: npcsCatalog });
  assert.deepEqual(l.map((x) => x.kind),
    ['hero', 'efir', 'merc'], 'Эфир — между героем и наёмными');
  assert.equal(l[1].sheet, efir, 'sheet Эфира — живая ссылка');
  // (d) без hero → Эфир первым
  l = m.list({ efir, efirMet: true, roster: [], npcs: npcsCatalog });
  assert.deepEqual(l.map((x) => x.kind), ['efir'], 'без hero — Эфир первым');
});

test('000145 A4: list — деградация: битые записи roster (нет npcId/sheet, не-объект) — тихий skip; roster не-массив → без наёмных; name-fallbacks (npc нет в каталоге → String(npcId), npc: null, role «наёмник»; hero без name → «Флогистон»); list({})/list(null) → []', () => {
  const m = loadParty();
  const sA = sheetObj('merc_volk');
  const sT = sheetObj('merc_torga');
  const roster = [
    null,                      // мусор — тихий skip
    { sheet: sA },             // без npcId — «призрак» — skip
    { npcId: 'merc_volk' },    // без sheet — «призрак» — skip
    { npcId: 'merc_torga', sheet: sT }, // каталог не передан — fallback
  ];
  const l = m.list({ hero: {}, roster, npcs: null });
  assert.equal(l.length, 2, 'hero + 1 валидный наёмный (остальные — skip)');
  assert.equal(l[0].id, 'flogiston');
  assert.equal(l[0].name, 'Флогистон', 'hero без name → «Флогистон»');
  assert.equal(l[1].id, 'merc_torga', 'валидная запись — на месте');
  assert.equal(l[1].name, 'merc_torga',
    'npc нет в каталоге → голый npcId (тихо, паттерн 000029)');
  assert.equal(l[1].role, 'наёмник', 'без каталога → «наёмник»');
  assert.equal(l[1].npc, null, 'npc: null (нет в каталоге)');
  assert.equal(l[1].sheet, sT, 'sheet — как есть (ссылка)');
  // roster не-массив → наёмных нет, краха нет
  const l2 = m.list({ hero: heroObj(), roster: 'мусор' });
  assert.equal(l2.length, 1, 'roster не-массив → только hero (тихо)');
  assert.equal(l2[0].kind, 'hero');
  assert.deepEqual(m.list({}), [], 'пустой src → []');
  assert.deepEqual(m.list(null), [], 'src=null → [] (деградация без краха)');
  assert.deepEqual(m.list('мусор'), [], 'src не-объект → []');
});

test('000145 A5: active — list не-массив/пусто → null (деградация без краха)', () => {
  const m = loadParty();
  assert.equal(m.active(null, 'flogiston'), null, 'null → null');
  assert.equal(m.active(undefined, null), null, 'undefined → null');
  assert.equal(m.active('мусор', 'flogiston'), null, 'не-массив → null');
  assert.equal(m.active([], 'flogiston'), null, 'пусто → null');
});

test('000145 A6: active — дефолт и stale: id null/«» → первый (Флогистон); неизвестный/stale id → первый (тихий fallback: уволен/не встречен — НЕ ошибка, без краха и без console.error)', () => {
  const m = loadParty();
  const hero = heroObj();
  const sA = sheetObj('merc_volk');
  const list = m.list({ hero, roster: [entryObj('merc_volk', sA)],
    npcs: npcsCatalog });
  assert.equal(list.length, 2);
  assert.equal(m.active(list, null), list[0], 'id null → первый (дефолт)');
  assert.equal(m.active(list, ''), list[0], 'id «» → первый (дефолт)');
  assert.equal(m.active(list, 'unknown'), list[0],
    'неизвестный id → первый (тихо)');
  assert.equal(m.active(list, 'merc_gone'), list[0],
    'stale id (наёмник «уволен») → первый (тихо)');
});

test('000145 A7: active — известный id → тот member (hero/efir/merc: id-пространство ОДНО на всё — id портрета 000142 = data-partytab = аргумент toggle)', () => {
  const m = loadParty();
  const hero = heroObj();
  const efir = { kind: 'efir' };
  const sA = sheetObj('merc_volk');
  const list = m.list({ hero, efir, efirMet: true,
    roster: [entryObj('merc_volk', sA)], npcs: npcsCatalog });
  assert.equal(list.length, 3);
  assert.equal(m.active(list, 'flogiston'), list[0], 'hero по id');
  assert.equal(m.active(list, 'efir'), list[1], 'efir по id');
  assert.equal(m.active(list, 'merc_volk'), list[2], 'merc по id (npcId)');
});

test('000145 A8: чистота: list/active НЕ мутируют аргументы; hero БЕЗ поля kind (000140 R-1 — байты сейва 000031); active возвращает member-ссылку', () => {
  const m = loadParty();
  const hero = heroObj();
  const sA = sheetObj('merc_volk');
  const roster = [entryObj('merc_volk', sA)];
  const srcObj = { hero, efir: { kind: 'efir' }, efirMet: true,
    roster, npcs: npcsCatalog };
  const before = JSON.stringify(srcObj);
  const list = m.list(srcObj);
  assert.equal(JSON.stringify(srcObj), before,
    'list НЕ мутирует src (пуританство контракта §2.1)');
  assert.ok(!('kind' in hero),
    'hero БЕЗ поля kind — kind присваивает list на member-записи ' +
    '(000140 R-1: JSON-байты сейва героя не меняются)');
  assert.ok(!('kind' in roster[0]),
    'запись roster не мутируется (kind — на member, не на entry)');
  assert.equal(m.active(list, 'merc_volk'), list[2],
    'active — ссылка на member (не копия)');
  assert.equal(m.active(list, null), list[0], 'дефолт — ссылка на первого');
});

// ============================================================
// ЧАСТЬ B — vm-песочницы: страница «Персонаж» (dyn CHAIN)
// ============================================================

// ДИНАМИЧЕСКИЙ CHAIN: ВСЕ <script src> index.html до ui.js
// включительно (паттерн tests/ui-efir.test.js L174). RED-фаза —
// тега src/party.js нет → цепочка грузится ШТАТНО (load-errors 0),
// тесты падают ПО СИМВОЛУ; GREEN-фаза — тег подхватывается САМ,
// лоадер МЕЖДУ ФАЗАМИ не правится.
const CHAIN = (() => {
  const all = Array.from(
    page().matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
    .map((p) => p.replace(/^src\//, ''));
  const i = all.indexOf('ui.js');
  assert.ok(i >= 0, 'ui.js подключён в index.html');
  return all.slice(0, i + 1);
})();

// Загрузка цепочки в vm-песочницу. Возвращает { G, body, errors,
// sandbox } (sandbox — для инжекта __game ДО openPanel).
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

// Партия для vm-тестов: герой (ctx.character — setCharacter) +
// Эфир (live-объект, efirMet) + наёмный Вольк (запись 000143:
// 6 ключей {npcId, sheet, level, xp, loyalty, hiredDay}; sheet —
// живой лист 000141: базовые_характеристики + начальные_навыки).
// `__game.state` (efir/efirMet/roster — live) — ИНЖЕКЦИЯ ДО
// openPanel (main.js в цепочке нет — точку ставит тест, паттерн
// tests/ui-efir.test.js L316).
function makePartyEnv(efirMet = true) {
  const env = loadEnv();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  assert.ok(env.G.playerUI, 'Game.playerUI создан (ui.js в CHAIN)');
  const hero = env.G.createCharacter();
  const efir = env.G.efir.createEfir();
  const volk = env.G.NpcData.NPCS.find((n) => n.id === 'merc_volk');
  assert.ok(volk, 'Вольк (merc_volk) в каталоге npc-data');
  const mercSheet = env.G.Sheet.createSheet('merc', {
    primary: volk.найм.базовые_характеристики,
    spells: volk.найм.spells,
    npcId: 'merc_volk',
  });
  for (const [id, lv] of Object.entries(volk.найм.начальные_навыки)) {
    mercSheet.secondary[id] = lv; // 000141: начальные навыки
  }
  const roster = [{ npcId: 'merc_volk', sheet: mercSheet, level: 1,
    xp: 0, loyalty: 51, hiredDay: 1 }];
  env.sandbox.__game = { state: { efir, efirMet, roster } };
  env.G.playerUI.setCharacter(hero);
  env.G.playerUI.toggle(true); // buildPanel + render
  env.hero = hero;
  env.mercSheet = mercSheet;
  env.efirSheet = efir;
  return env;
}

// --- Хелперы (ЧАСТЬ B) ---

// Левый столбец → ПЕРВАЯ .cp-tabpane = «Персонаж» (column 0,
// первая в порядке тегов 000130).
function characterPane(env) {
  const cols = findAll(env.body, '.cp-column');
  assert.ok(cols && cols.length >= 1,
    'панель персонажа построена (.cp-column в body)');
  const panes = findAll(cols[0], '.cp-tabpane');
  return panes[0] || null;
}

function panelOf(env) {
  const p = findAll(env.body, '.char-panel')[0];
  assert.ok(p, 'панель .char-panel в body');
  return p;
}

// Клик через ОДИН делегированный слушатель панели (пин ui-panel:
// ровно 1 click-обработчик — новая ветка ВНУТРИ него, не новый).
function clickPanel(env, target) {
  const panel = panelOf(env);
  const clickers = panel.listeners.click || [];
  assert.ok(clickers.length >= 1,
    'делегированный click-обработчик на панели (ОДИН)');
  clickers[0]({ target });
}

function portraitsRow(pane) {
  assert.ok(pane, 'character-pane существует');
  return pane.querySelector('.cp-portraits');
}

// Секция по СВОЕМУ тексту заголовка (.cp-section; строки — дети).
function sectionOf(pane, name) {
  assert.ok(pane, 'character-pane существует');
  return findAll(pane, '.cp-section')
    .find((s) => s.textContent === name) || null;
}

// Строка навыка: кнопка data-skill → <tr> → ячейки (таблицы —
// БЕЗ ИЗМЕНЕНИЙ, DOM-контракт tests/ui-skills.test.js).
function skillCell(pane, skillId) {
  const btn = findAll(pane, '.cp-btn')
    .find((b) => b.dataset.skill === skillId);
  assert.ok(btn, 'кнопка data-skill=' + skillId + ' найдена');
  const tr = btn.closest('tr');
  assert.ok(tr, 'кнопка находится в строке <tr>');
  return {
    btn,
    lvTd: tr.querySelector('.cp-level'),
    reqTd: tr.querySelector('.cp-req'),
  };
}

// Строка панели «Отряд» по имени (дубль tests/squad-panel.test.js).
function rowByName(panel, name) {
  return findAll(panel, '.cp-itemrow').find((r) => {
    const nm = r.querySelector('.cp-itemname');
    return nm && nm.textContent === name;
  }) || null;
}

// --- B1: ряд иконок СВЕРХУ ---

test('000145 B1: СВЕРХУ character-pane — ряд .cp-portraits: 3 иконки (hero+Эфир+наёмный) button.cp-portrait[data-memberid][title]>img; icon «assets/portraits/<icon>» (префикс у потребителя, 000142 D2); title «имя — роль»; порядок = Party.list; дефолт-подсветка Флогистона; 0 ошибок', () => {
  const env = makePartyEnv(true);
  const pane = characterPane(env);
  const row = portraitsRow(pane);
  assert.ok(row, 'ряд .cp-portraits СВЕРХУ страницы (задача 000145)');
  assert.equal(pane.children[0], row,
    'ряд — ПЕРВЫМ (до .cp-title/.cp-stats — «СВЕРХУ», ТЗ)');
  const btns = findAll(row, '.cp-portrait');
  assert.equal(btns.length, 3,
    '3 иконки: hero + Эфир (met) + наёмный: ' + btns.length);
  assert.equal(btns[0].tagName, 'button', 'иконка — button');
  // порядок = Party.list (hero → efir → roster)
  assert.equal(btns[0].dataset.memberid, 'flogiston');
  assert.equal(btns[0].querySelector('img').src,
    'assets/portraits/flogiston.svg', 'img = префикс + icon (000142 D2)');
  assert.equal(btns[0].title, 'Флогистон — Герой', 'title «имя — роль»');
  assert.equal(btns[1].dataset.memberid, 'efir');
  assert.equal(btns[1].querySelector('img').src,
    'assets/portraits/efir.svg');
  assert.equal(btns[1].title, 'Эфир — Дух');
  assert.equal(btns[2].dataset.memberid, 'merc_volk',
    'id наёмного = entry.npcId (000142: иконка наёмного = npc)');
  assert.equal(btns[2].querySelector('img').src,
    'assets/portraits/npc-000012.svg');
  assert.equal(btns[2].title, 'Вольк — Наёмник (melee)',
    'tooltip: имя, роль (ТЗ)');
  // дефолт-активный — Флогистон (подсветка className)
  assert.ok(String(btns[0].className).includes('cp-portrait-active'),
    'активный (дефолт) — подсвечен');
  assert.ok(!String(btns[2].className).includes('cp-portrait-active'),
    'неактивный — НЕ подсвечен');
  // Ловушка 000098 (пин ревью 000145): портрет НЕ .cp-btn — иначе
  // делегированное ядро (e.target.closest('.cp-btn')) и render-итерация
  // panel.querySelectorAll('.cp-btn') подхватили бы его с
  // dataset.skill === undefined. Пин ТОЧНЫХ className + negative.
  assert.equal(String(btns[0].className),
    'cp-portrait cp-portrait-active',
    'активный — точный className (контракт §3.2)');
  assert.equal(String(btns[1].className), 'cp-portrait',
    'неактивный (Эфир) — точный className');
  assert.equal(String(btns[2].className), 'cp-portrait',
    'неактивный (наёмный) — точный className');
  for (const b of btns)
    assert.ok(!String(b.className).includes('cp-btn'),
      'портрет НЕ .cp-btn (ловушка 000098)');
  assert.equal(env.errors.length, 0, '0 ошибок: ' + env.errors.join('; '));
});

// --- B2: клик — переключение активного ---

test('000145 B2: клик по иконке наёмного — активный переключён: .cp-title = «Вольк», .cp-stats — 2 строки ЕГО листа, таблицы — его навыки (strength 3, swordsman 2 — каталог 000141), подсветка переехала', () => {
  const env = makePartyEnv(true);
  const pane = characterPane(env);
  const row = portraitsRow(pane);
  assert.ok(row, 'ряд .cp-portraits существует');
  const btns = findAll(row, '.cp-portrait');
  const heroBtn = btns.find((b) => b.dataset.memberid === 'flogiston');
  const mercBtn = btns.find((b) => b.dataset.memberid === 'merc_volk');
  assert.ok(heroBtn && mercBtn, 'иконки героя и наёмного');
  clickPanel(env, mercBtn);
  assert.equal(env.errors.length, 0, 'клик: 0 ошибок: ' + env.errors.join('; '));
  const title = pane.querySelector('.cp-title');
  assert.equal(title.textContent, 'Вольк',
    'заголовок — имя АКТИВНОГО (не героя)');
  const stats = pane.querySelector('.cp-stats');
  assert.equal(stats.textContent,
    'Уровень 1  |  Опыт 0/' + env.G.xpForNext(1) +
    '\nСвободные очки: 0',
    'лист наёмного — 2 строки (уровень/опыт + свободные очки; ' +
    'gold/hp-полей у merc-листа нет, 000140/000143)');
  // таблицы — навыки НАЁМНОГО (каталог 000141: strength 3,
  // начальный swordsman 2)
  assert.equal(skillCell(pane, 'strength').lvTd.textContent, '3',
    'основной — из листА НАЁМНОГО');
  assert.equal(skillCell(pane, 'swordsman').lvTd.textContent, '2',
    'вторичный — из начальных навыков (000141)');
  // подсветка переехала
  assert.ok(String(mercBtn.className).includes('cp-portrait-active'),
    'подсветка — на наёмном');
  assert.ok(!String(heroBtn.className).includes('cp-portrait-active'),
    'подсветка снята с героя');
});

// --- B3: raise на активного наёмного (единый sheet) ---

test('000145 B3: «+» у АКТИВНОГО наёмного — прокачка через единый sheet: entry.sheet.points −1, primary +1; лист ГЕРОЯ не тронут; без очков — ВСЕ «+» disabled (canRaise по активному листу)', () => {
  const env = makePartyEnv(true);
  const pane = characterPane(env);
  const row = portraitsRow(pane);
  assert.ok(row, 'ряд .cp-portraits существует');
  const mercBtn = findAll(row, '.cp-portrait')
    .find((b) => b.dataset.memberid === 'merc_volk');
  assert.ok(mercBtn, 'иконка наёмного');
  clickPanel(env, mercBtn);
  // (1) без очков — ВСЕ «+» disabled (гейт — по АКТИВНОМУ листу)
  const allBtns = findAll(pane, '.cp-btn')
    .filter((b) => b.dataset.skill);
  assert.ok(allBtns.length >= 6,
    'кнопки навыков в таблицах: ' + allBtns.length);
  for (const b of allBtns) {
    assert.equal(b.disabled, true,
      'без очков наёмного — «+» disabled (canRaise по активному)');
  }
  // (2) очко — тратится на лист АКТИВНОГО (наёмного), герой в покое
  const p0 = env.mercSheet.primary.strength;
  env.mercSheet.points = 1;
  env.G.playerUI.render();
  const st = skillCell(pane, 'strength');
  assert.equal(st.btn.disabled, false, 'очко есть — «+» активно');
  clickPanel(env, st.btn);
  assert.equal(env.errors.length, 0,
    'raise: 0 ошибок: ' + env.errors.join('; '));
  assert.equal(env.mercSheet.primary.strength, p0 + 1,
    'primary АКТИВНОГО наёмного +1 (единый sheet, 000143)');
  assert.equal(env.mercSheet.points, 0,
    'очко потрачено (entry.sheet.points — расход, 000143)');
  assert.equal(env.hero.points, 0, 'очки ГЕРОЯ не тронуты');
  assert.equal(env.hero.primary.strength, 1,
    'лист героя — без изменений (raise — только активного)');
});

// --- B4: РЕГРЕССИЯ (зелёный с первого запуска) ---

test('000145 B4: РЕГРЕССИЯ (зелёный с первого запуска): «+» у АКТИВНОГО героя — как ДО: primary +1, points −1; без очков — reason-вспышка «нет свободных очков навыков» (строка sheet.js дословно)', () => {
  const env = makePartyEnv(true);
  const hero = env.hero;
  const pane = characterPane(env);
  // (1) успех: hero-путь (G.raiseSkill — обёртка player.js с
  // craft-хуком) — поведение как ДО задачи
  hero.points = 1;
  env.G.playerUI.render();
  const st = skillCell(pane, 'strength');
  assert.equal(st.btn.disabled, false,
    'очко есть — «+» активно (canRaise hero)');
  clickPanel(env, st.btn);
  assert.equal(hero.primary.strength, 2, 'hero primary +1 (как ДО)');
  assert.equal(hero.points, 0, 'очко потрачено');
  // (2) неудача: без очков — reason-вспышка в .cp-req (1,5 с).
  // Клик — по ВТОРИЧНОМУ навыку (у строк основной таблицы нет
  // .cp-req — ячейка требований только у вторичных, DOM 000139).
  env.G.playerUI.render();
  const st2 = skillCell(pane, 'swordsman');
  assert.equal(st2.btn.disabled, true, 'без очков — disabled');
  clickPanel(env, st2.btn);
  assert.equal(st2.reqTd.textContent, 'нет свободных очков навыков',
    'reason-вспышка дословно (строка из sheet.js — не расползается)');
  assert.equal(env.errors.length, 0, '0 ошибок: ' + env.errors.join('; '));
});

// --- B5: банк/потолок практики активного наёмного ---

test('000145 B5: банк практики АКТИВНОГО наёмного: .cp-level «2 (7/45)» (need = skillXpForNext(2) — единая кривая 15·(lvl+1)); на practiceCap (strength 3 → 3×2) — пометка «потолок практикой: Сила 3×2 — дальше растёт только очками и книгами» (ОДИН текст для всех kinds, 000140)', () => {
  const env = makePartyEnv(true);
  const pane = characterPane(env);
  const row = portraitsRow(pane);
  assert.ok(row, 'ряд .cp-portraits существует');
  const mercBtn = findAll(row, '.cp-portrait')
    .find((b) => b.dataset.memberid === 'merc_volk');
  assert.ok(mercBtn, 'иконка наёмного');
  clickPanel(env, mercBtn);
  // (1) банк: swordsman 2, bank 7 → «2 (7/45)»
  env.mercSheet.skillXp.swordsman = 7;
  env.G.playerUI.render();
  assert.equal(skillCell(pane, 'swordsman').lvTd.textContent,
    '2 (7/' + env.G.Sheet.skillXpForNext(2) + ')',
    'банк «lvl (bank/need)» (need = 15·(lvl+1) = 45)');
  // (2) потолок: practiceCap = strength(3)×2 = 6 → swordsman 6
  env.mercSheet.secondary.swordsman = 6;
  env.G.playerUI.render();
  assert.equal(skillCell(pane, 'swordsman').reqTd.textContent,
    'потолок практикой: Сила 3×2 — дальше растёт только очками и ' +
    'книгами',
    'пометка потолка — ОДИН текст для всех kinds (000140 §2.3; ' +
    'nuance «растёт с уровнем Эфира» НЕ переносится)');
});

// --- B6: Эфир-вид на странице ---

test('000145 B6: Эфир-вид на странице: «Вдох Эфира» (тексты BREATH_INFO) + «Книга заклинаний» 10 строк с отметками «уровень N»/«откроется на N-м уровне»; секции СКРЫТЫ для hero; efirMet=false → Эфира нет в ряду (2 иконки)', () => {
  const env = makePartyEnv(true);
  const pane = characterPane(env);
  const bookSec = sectionOf(pane, 'Книга заклинаний');
  assert.ok(bookSec,
    'секция «Книга заклинаний» на странице (для ВСЕХ kinds, ТЗ)');
  const breathSec = sectionOf(pane, 'Вдох Эфира');
  assert.ok(breathSec, 'секция «Вдох Эфира» на странице (ТЗ)');
  assert.equal(breathSec.style.display, 'none',
    'для hero — СКРЫТА (видна только при active «Эфир»)');
  // активный = Эфир
  const row = portraitsRow(pane);
  assert.ok(row, 'ряд .cp-portraits существует');
  const efirBtn = findAll(row, '.cp-portrait')
    .find((b) => b.dataset.memberid === 'efir');
  assert.ok(efirBtn, 'иконка Эфира (efirMet = true)');
  clickPanel(env, efirBtn);
  assert.equal(breathSec.style.display, '', 'для «Эфира» — видна');
  const breath = breathSec.querySelector('.cp-stats');
  assert.ok(breath, 'тело «Вдоха» (.cp-stats — паттерн ui-tab-efir)');
  const bt = breath.textContent;
  for (const s of ['1 раз за бой', '40%', '20 маны',
      'round(10 + 0.8 * Мудрость)', '×0.8', '2 хода']) {
    assert.ok(bt.includes(s), '«Вдох Эфира» — строка SPEC: ' + s);
  }
  // книга «Эфира» — ВСЕГДА 10 строк (канонический порядок: старт
  // сперва, затем UNLOCKS по возрастанию порога)
  const rows = findAll(bookSec, '.cp-itemrow');
  assert.equal(rows.length, 10,
    'книга «Эфира» — 10 строк (2 старт + 8 UNLOCKS)');
  const expect = [
    ['Искра', 'уровень 1'],
    ['Заговора', 'уровень 1'],
    ['Свет исцеления', 'откроется на 5-м уровне'],
    ['Морозная стрела', 'откроется на 8-м уровне'],
    ['Огненный шар', 'откроется на 10-м уровне'],
    ['Магический щит', 'откроется на 12-м уровне'],
    ['Плетень', 'откроется на 15-м уровне'],
    ['Сильное исцеление', 'откроется на 20-м уровне'],
    ['Ограда', 'откроется на 25-м уровне'],
    ['Благословение природы', 'откроется на 30-м уровне'],
  ];
  rows.forEach((r, i) => {
    assert.equal(r.querySelector('.cp-itemname').textContent,
      expect[i][0], 'строка ' + i + ' — имя из G.SpellsData');
    assert.equal(r.querySelector('.cp-itemmeta').textContent,
      expect[i][1],
      'строка ' + i + ' — отметка (изучен — «уровень N» / порог ' +
      'UNLOCKS — «откроется на N-м уровне»)');
  });
  assert.equal(env.errors.length, 0, '0 ошибок: ' + env.errors.join('; '));

  // (2) efirMet=false → Эфира НЕТ в ряду (только hero + merc)
  const env2 = makePartyEnv(false);
  const pane2 = characterPane(env2);
  const row2 = portraitsRow(pane2);
  assert.ok(row2, 'ряд существует (без Эфира)');
  const btns2 = findAll(row2, '.cp-portrait');
  assert.deepEqual(btns2.map((b) => b.dataset.memberid),
    ['flogiston', 'merc_volk'], 'efirMet=false → 2 иконки (гейт, ТЗ)');
});

// --- B7: книга заклинаний — для любого kind, read-only ---

test('000145 B7: книга заклинаний — для АКТИВНОГО любого kind: hero — hero.spells → имена из SpellsData; наёмный без spells — строка «—»; книга — ЧТЕНИЕ (кнопок «+» у строк НЕТ)', () => {
  const env = makePartyEnv(true);
  const pane = characterPane(env);
  const bookSec = sectionOf(pane, 'Книга заклинаний');
  assert.ok(bookSec, 'секция «Книга заклинаний»');
  // (1) hero: старт [spark, mend] → «Искра»/«Заговора»
  let rows = findAll(bookSec, '.cp-itemrow');
  assert.equal(rows.length, 2, 'книга героя — 2 строки (старт)');
  assert.equal(rows[0].querySelector('.cp-itemname').textContent,
    'Искра', 'имя из G.SpellsData.SPELLS_BY_ID');
  assert.equal(rows[1].querySelector('.cp-itemname').textContent,
    'Заговора');
  for (const r of rows) {
    assert.equal(r.querySelector('button'), null,
      'книга — read-only: кнопок у строк НЕТ');
  }
  // (2) наёмный (Вольк, найм.spells: []) — строка «—»
  const row = portraitsRow(pane);
  assert.ok(row, 'ряд .cp-portraits существует');
  const mercBtn = findAll(row, '.cp-portrait')
    .find((b) => b.dataset.memberid === 'merc_volk');
  assert.ok(mercBtn, 'иконка наёмного');
  clickPanel(env, mercBtn);
  rows = findAll(bookSec, '.cp-itemrow');
  assert.equal(rows.length, 1, 'книга наёмного без spells — 1 строка');
  assert.equal(rows[0].querySelector('.cp-itemname').textContent, '—',
    'пустая книга — строка «—» (паттерн вкладки «Эфир»)');
});

// --- B8: навигация из «Отряда» ---

test('000145 B8: «Отряд» — навигация: клик по СТРОКЕ наёмного (не по кнопке) → «Отряд» закрывается + панель персонажа ОТКРЫТА на странице этого наёмного (playerUI.toggle(true, «character», id)); «уволить» — БЕЗ ИЗМЕНЕНИЙ (roster −1, onChange ×1, без навигации); строка Эфира (000146): клик → «Персонаж» с Эфиром активным (вкладка «Эфир» убрана — секции на «Персонаже» (kind \'efir\'), 000145; строка побайтово, onChange ×0 на редирект)', () => {
  const env = loadEnv();
  assert.equal(env.errors.length, 0,
    'загрузка: 0 ошибок: ' + env.errors.join('; '));
  const hero = env.G.createCharacter();
  const efir = env.G.efir.createEfir();
  const volk = env.G.NpcData.NPCS.find((n) => n.id === 'merc_volk');
  const mercSheet = env.G.Sheet.createSheet('merc', {
    primary: volk.найм.базовые_характеристики, npcId: 'merc_volk' });
  const roster = [{ npcId: 'merc_volk', sheet: mercSheet, level: 1,
    xp: 0, loyalty: 51, hiredDay: 1 }];
  let saves = 0;
  env.G.squadUI.init({ roster, efir, onChange: () => { saves += 1; } });
  env.G.playerUI.setCharacter(hero);
  const squadPanel = () => findAll(env.body, '.squad-panel')[0];
  // (1) клик по СТРОКЕ наёмного (target — строка, НЕ кнопка) →
  // его страница
  env.G.squadUI.toggle(true);
  let panel = squadPanel();
  assert.ok(panel, 'панель «Отряд» в body');
  const rowV = rowByName(panel, 'Вольк');
  assert.ok(rowV, 'строка «Вольк»');
  assert.ok(rowV.dataset.partytab,
    'у строки наёмного data-partytab (маркер навигации, 000145)');
  const squadClick = (t) => {
    const clickers = panel.listeners.click || [];
    assert.ok(clickers.length >= 1,
      'делегированный click-обработчик «Отряда»');
    clickers[0]({ target: t });
  };
  squadClick(rowV);
  assert.equal(env.errors.length, 0, 'клик: 0 ошибок: ' + env.errors.join('; '));
  assert.equal(env.G.squadUI.isOpen(), false, '«Отряд» закрыт');
  const charPanel = panelOf(env);
  assert.notEqual(charPanel.style.display, 'none',
    'панель персонажа ОТКРЫТА (полная замена поверхности, z-10)');
  const pane = characterPane(env);
  assert.equal(pane.querySelector('.cp-title').textContent, 'Вольк',
    'открыта на странице НАЁМНОГО (active = id строки)');
  // (2) «уволить» — БЕЗ ИЗМЕНЕНИЙ (кнопка ВНУТРИ строки — её клик
  // НЕ уходит в навигацию: явный return / guard, P5-контракт)
  env.G.squadUI.toggle(true);
  panel = squadPanel();
  const btn = rowByName(panel, 'Вольк')
    .querySelector('button[data-squadact=dismiss]');
  assert.ok(btn, 'кнопка «уволить» в строке');
  squadClick(btn);
  assert.equal(roster.length, 0, '«уволить»: live-roster −1 (как ДО)');
  assert.equal(saves, 1, 'onChange ровно ×1 (точка сейва — как ДО)');
  // (3) строка Эфира (000146: вкладка «Эфир» УБРАНА — клик
  // открывает «Персонаж» с Эфиром активным, toggle(true,
  // «character», «efir»); строка сама — БЕЗ ИЗМЕНЕНИЙ, P3).
  // __game-инжект (D9): efirMet читается ТОЛЬКО из __game.state
  // (partySource, ui-tab-skills.js) — без него Эфира нет в партии
  // и активный fallback на Флогистона. На этот момент roster ПУСТ
  // (Вольк уволен в части (2)) — live-ссылки те же, что init.
  env.sandbox.__game = { state: { efir, efirMet: true, roster } };
  env.G.squadUI.toggle(true);
  panel = squadPanel();
  const rowE = rowByName(panel, 'Эфир');
  assert.ok(rowE, 'строка «Эфир» (после увольнения — осталась)');
  assert.equal(rowE.querySelector('.cp-itemmeta').textContent,
    'уровень 1 · HP 16/16 · всегда со мной',
    'строка Эфира побайтово (P3: строка не переделана)');
  squadClick(rowE);
  assert.equal(env.errors.length, 0,
    'клик: 0 ошибок: ' + env.errors.join('; '));
  assert.equal(env.G.squadUI.isOpen(), false, '«Отряд» закрыт');
  const col0 = findAll(env.body, '.cp-column')[0];
  const panes = findAll(col0, '.cp-tabpane');
  assert.equal(panes.length, 3,
    'левый столбец — 3 pane (000146: pane вкладки «Эфир» удалена; ' +
    'сейчас 4 — вкладка ещё существует)');
  assert.equal(panes[0].style.display, '',
    'клик по строке Эфира — «Персонаж» активна (panes[0], 000146)');
  assert.equal(pane.querySelector('.cp-title').textContent, 'Эфир',
    'активный = Эфир (вид kind \'efir\' на «Персонаже», 000145)');
  assert.equal(env.G.playerUI.getActiveCharId(), 'efir',
    'активный = Эфир (redirect toggle(true, «character», «efir»))');
  assert.equal(saves, 1,
    'onChange ×0 на редирект (счётчик — только «уволить» части (2))');
});

// --- B9: toggle(force, tabId, charId) + getActiveCharId() ---

test('000145 B9: playerUI.toggle(force, tabId, charId) — 3-й аргумент задаёт активного на открытии (литерал ТЗ: playerUI.toggle(true, «character», activeId)); без 3-го — дефолт (обратно-совместимо: ВСЕ существующие вызовы 2-аргументные); getActiveCharId() — публичный getter (000147); stale id — тихий fallback на первого', () => {
  const env = makePartyEnv(true);
  const pane = characterPane(env);
  // (1) 2 аргумента — как раньше: дефолт = Флогистон
  env.G.playerUI.toggle(false);
  env.G.playerUI.toggle(true, 'character');
  assert.equal(pane.querySelector('.cp-title').textContent,
    'Флогистон', 'без 3-го аргумента — дефолт (поведение не меняется)');
  // (2) публичный getter (ОДИН новый метод; публичного сеттера НЕТ)
  assert.equal(typeof env.G.playerUI.getActiveCharId, 'function',
    'playerUI.getActiveCharId() — публичный getter (контракт 000147)');
  assert.equal(env.G.playerUI.getActiveCharId(), null,
    'дефолт — null (явной установки не было)');
  // (3) 3-й аргумент — активный на открытии
  env.G.playerUI.toggle(true, 'character', 'efir');
  assert.equal(pane.querySelector('.cp-title').textContent, 'Эфир',
    '3-й аргумент — открыто на странице Эфира');
  assert.equal(env.G.playerUI.getActiveCharId(), 'efir',
    'getter — установленный id');
  // (4) неизвестный/stale id — тихий fallback на первого (без краха
  // и без console.error — наёмник уволен / Эфир не встречен)
  env.G.playerUI.toggle(true, 'character', 'stale_id');
  assert.equal(pane.querySelector('.cp-title').textContent,
    'Флогистон', 'stale id → первый (тихий fallback)');
  assert.equal(env.errors.length, 0, '0 ошибок: ' + env.errors.join('; '));
});

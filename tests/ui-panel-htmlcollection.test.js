// Задача 000169 (BUG): после мержа task/000145 перестал
// отображаться текст на панелях, открываемых по [I]: инвентарь,
// навыки персонажей, снаряжение, магазин и квесты. На панели
// настроек текст виден.
//
// КОРЕНЬ (установлен анализом): src/ui-tab-skills.js — цикл
// «Устаревшие узлы» ряда портретов (000145):
//   `for (const ch of row.children.slice())` — в РЕАЛЬНОМ браузере
//   element.children — HTMLCollection: length/item() — НО БЕЗ
//   Array-методов (.slice/.forEach/.find) → TypeError. В ВСЕХ
//   существующих DOM-стабах проекта children — plain Array
//   (`children: []`) → .slice() проходит → регрессия незаметна
//   тестам. В ядре ui.js render() — ЦИКЛ по вкладкам БЕЗ
//   try/catch (ui.js:350): выброс в render() вкладки «Персонаж»
//   (ПЕРВАЯ в порядке регистрации) рвёт цикл — render-хуки
//   «Инвентарь»/«Снаряжение»/«Магазин»/«Квесты» не выполняются →
//   их динамический текст отсутствует. «Настройки» — render-хука
//   НЕТ (статика build()) → текст виден (симптом ТЗ дословно).
//
// МЕХАНИКА (паттерн tests/ui-tab-skills-active.test.js ЧАСТЬ B):
// vm-песочница, ДИНАМИЧЕСКИЙ CHAIN — ВСЕ <script src> index.html
// до ui.js включительно (подхватит любой новый тег сам);
// __game.state (roster live) инжестируется ДО openPanel
// (main.js в цепочке нет — точку ставит тест).
//
// ОТЛИЧИЕ ОТ ПРОЧИХ СТАБОВ (суть фикса-ловушки): children —
// HTMLCollection-семантика: length + item() + Symbol.iterator,
// НО БЕЗ Array-методов — как в реальном DOM. Тест падает НА
// ТЕКУЩЕМ коде ПО СИМВОЛУ (.slice у HTMLCollection-стаба), не по
// SyntaxError: цепочка грузится чисто (load-errors 0 первым
// ассертом). GREEN-фаза — итерация в src переписана на
// array-like-безопасную (Array.prototype.slice.call /
// Array.from / индексный цикл) — стаб НЕ правится.
//
// КРАСНЫЕ: R1–R5 (toggle(true) выбрасывает / текст панелей
// отсутствует — render-хуки после «Персонажа» не выполняются),
// R7 (устаревший портрет уволенного наёмного НЕ убирается —
// sweep-цикл не доходит до конца / выброс; блокирует дегенератный
// фикс «выбросить sweep-цикл», который сломал бы фичу 000145).
// ЗЕЛЁНЫЕ: R0 (чистота цепочки + верность стаба), R6 (статика
// «Настроек» не счищается — фикс не должен ломать build-контент),
// R8 (000180: закрытие панели по [Esc] — пин фикса 000169 под
// HTMLCollection-семантикой; plain-Array-стабы слепы к классу бага).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const page = () => fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// --- DOM-стаб: ДУБЛЬ tests/ui-tab-skills-active.test.js с
// children = HTMLCollection-семантика (length/item/iterator,
// БЕЗ .slice/.forEach/.find/.map) ---

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

// HTMLCollection-аналог: length + ИНДЕКСНЫЙ доступ + item() +
// Symbol.iterator — БЕЗ Array-методов (как children в реальном
// браузере). Новый объект на каждое обращение (live-семантика
// «на момент чтения»). Array-методы (slice/forEach/find/map/
// filter/includes) ОСОЗНАНО ОТСУТСТВУЮТ — это браузерная правда,
// которую plain-Array-стабы проекта скрывают.
function childList(kids) {
  const view = { length: kids.length,
    item: (i) => kids[i] || null,
    [Symbol.iterator]: () => kids[Symbol.iterator]() };
  for (let i = 0; i < kids.length; i++) view[i] = kids[i];
  return view;
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
    _kids: [],
    parent: null,
    listeners: {},
  };
  Object.defineProperty(el, 'children', {
    get() { return childList(el._kids); },
  });
  el.appendChild = function (ch) {
    if (ch.parent) {
      ch.parent._kids.splice(ch.parent._kids.indexOf(ch), 1);
    }
    ch.parent = this;
    this._kids.push(ch);
    return ch;
  };
  el.remove = function () {
    if (this.parent) {
      const i = this.parent._kids.indexOf(this);
      if (i >= 0) this.parent._kids.splice(i, 1);
      this.parent = null;
    }
  };
  el.addEventListener = function (type, fn) {
    (this.listeners[type] || (this.listeners[type] = [])).push(fn);
  };
  el.setAttribute = function (name, value) { this.dataset[name] = value; };
  el.getBoundingClientRect = () => ({ left: 0, top: 0 });
  el.querySelector = function (sel) { return findAll(this, sel)[0] || null; };
  el.querySelectorAll = function (sel) { return findAll(this, sel); };
  el.closest = function (sel) {
    let n = this;
    while (n) {
      if (matchesSel(n, sel)) return n;
      n = n.parent;
    }
    return null;
  };
  // textContent = '' — как в DOM, сбрасывает детей.
  Object.defineProperty(el, 'textContent', {
    get() { return this._text; },
    set(v) {
      this._text = String(v);
      for (const ch of this._kids) ch.parent = null;
      this._kids.length = 0;
    },
  });
  return el;
}

// Весь текст поддерева (textContent стаба НЕ агрегирует детей).
function textOf(root) {
  const out = [];
  const walk = (n) => {
    if (n._text) out.push(n._text);
    for (const ch of n.children || []) walk(ch);
  };
  walk(root);
  return out.join('\n');
}

// --- ДИНАМИЧЕСКИЙ CHAIN: ВСЕ <script src> index.html до ui.js
// включительно (паттерн tests/ui-tab-skills-active.test.js L370) ---
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
  const window = { addEventListener: () => {}, removeEventListener: () => {} };
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

// Партия: герой (ctx.character) + наёмный Вольк (roster live через
// __game.state — как в игре; Эфира нет — efirMet: false).
// ВАЖНО: toggle()/render() могут ВЫБРАСЫВАТЬ на баге — все
// RED-тесты оборачивают их в try/catch и проверяют отсутствие
// выброса ПЕРВЫМ ассертом (осмысленное падение, не крах файла).
function makePartyEnv() {
  const env = loadEnv();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  assert.ok(env.G.playerUI, 'Game.playerUI создан (ui.js в CHAIN)');
  const hero = env.G.createCharacter();
  const volk = env.G.NpcData.NPCS.find((n) => n.id === 'merc_volk');
  assert.ok(volk, 'Вольк (merc_volk) в каталоге npc-data');
  const mercSheet = env.G.Sheet.createSheet('merc', {
    primary: volk.найм.базовые_характеристики,
    spells: volk.найм.spells,
    npcId: 'merc_volk',
  });
  for (const [id, lv] of Object.entries(volk.найм.начальные_навыки)) {
    mercSheet.secondary[id] = lv;
  }
  const roster = [{ npcId: 'merc_volk', sheet: mercSheet, level: 1,
    xp: 0, loyalty: 51, hiredDay: 1 }];
  env.sandbox.__game = { state: { efir: null, efirMet: false, roster } };
  env.hero = hero;
  env.mercSheet = mercSheet;
  env.G.playerUI.setCharacter(hero);
  return env;
}

// toggle(force, tabId, charId) с ловлей выброса (регрессия 000169:
// TypeError в render() вкладки «Персонаж» рвёт цикл render ядра).
// 000145: 3-й аргумент — активный персонаж на открытии (id —
// ID-пространство party.js §2.4: hero = 'flogiston', наёмный =
// entry.npcId).
function openPanel(env, tabId, charId) {
  let err = null;
  try {
    env.G.playerUI.toggle(true, tabId, charId);
  } catch (e) {
    err = e;
  }
  assert.equal(err, null,
    'playerUI.toggle(true' +
    (tabId != null ? ", '" + tabId + "'" : '') +
    (charId != null ? ", '" + charId + "'" : '') +
    ') — БЕЗ выброса (регрессия 000169: render() «Персонаж» бросает — ' +
    'row.children — HTMLCollection, нет .slice — цикл render ядра ' +
    'рвётся, текст остальных вкладок не рисуется): ' +
    (err ? err.constructor.name + ': ' + err.message : ''));
}

// playerUI.render() с ловлей выброса (та же регрессия 000169:
// render-хук «Персонаж» бросает в ядровом цикле БЕЗ try/catch).
function callRender(env) {
  let err = null;
  try {
    env.G.playerUI.render();
  } catch (e) {
    err = e;
  }
  assert.equal(err, null,
    'playerUI.render() — БЕЗ выброса (регрессия 000169: render() ' +
    '«Персонаж» бросает — row.children — HTMLCollection, нет .slice): ' +
    (err ? err.constructor.name + ': ' + err.message : ''));
}

// Pane по столбцу/позиции (порядок тегов 000130: ЛЕВО —
// Персонаж/Инвентарь/Настройки; ПРАВО — Снаряжение/Магазин/Квесты).
function panesOf(env) {
  const panel = findAll(env.body, '.char-panel')[0];
  assert.ok(panel, 'панель .char-panel в body');
  const cols = findAll(panel, '.cp-column');
  assert.equal(cols.length, 2, 'два столбца (контракт 000096)');
  const l = findAll(cols[0], '.cp-tabpane');
  const r = findAll(cols[1], '.cp-tabpane');
  assert.equal(l.length, 3, 'лево: 3 pane');
  assert.equal(r.length, 3, 'право: 3 pane');
  return {
    character: l[0], inventory: l[1], settings: l[2],
    equipment: r[0], shop: r[1], quests: r[2],
  };
}

test('000169 R0: цепочка грузится чисто; стаб — HTMLCollection-семантика children (length/item/iterator, БЕЗ .slice) — браузерная правда, которую существующие стабы скрывают', () => {
  const env = loadEnv();
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  assert.equal(typeof env.G.playerUI, 'object', 'playerUI существует');
  // Верность стаба (защита от «починки» стаба в сторону Array —
  // тогда тест перестанет отражать браузер и будет ложно-зелёным).
  const p = makeEl('div');
  p.appendChild(makeEl('span'));
  p.appendChild(makeEl('span'));
  assert.equal(p.children.length, 2, 'children.length — array-like');
  assert.equal(p.children.item(0), p._kids[0], 'children.item(i)');
  assert.ok(!Array.isArray(p.children), 'children — НЕ Array');
  assert.equal(typeof p.children.slice, 'undefined',
    'children.slice — НЕТ (HTMLCollection; в реальном DOM — TypeError)');
  assert.equal(typeof p.children.forEach, 'undefined',
    'children.forEach — НЕТ (HTMLCollection)');
  // for...of — РАБОТАЕТ (HTMLCollection итерируемый) — код игры
  // должен полагаться только на length/item/индексы/итерацию.
  const seen = [];
  for (const ch of p.children) seen.push(ch);
  assert.equal(seen.length, 2, 'for...of по children работает');
});

test('000169 R1: [I] — вкладка «Персонаж»: toggle без выброса; .cp-title = имя; .cp-stats — 4 строки статов («Уровень 1») — render() ДОШЁЛ до конца', () => {
  const env = makePartyEnv();
  openPanel(env);
  const panes = panesOf(env);
  const title = panes.character.querySelector('.cp-title');
  assert.ok(title, '.cp-title в character-pane');
  assert.equal(title.textContent, 'Флогистон', '.cp-title = имя героя');
  const stats = panes.character.querySelector('.cp-stats');
  assert.ok(stats, '.cp-stats в character-pane');
  assert.ok(stats.textContent.includes('Уровень 1'),
    'статы нарисованы (render() «Персонаж» завершился): ' +
    JSON.stringify(stats.textContent));
  assert.ok(stats.textContent.includes('Золото:'),
    '4-строчный шаблон статов (побеги в цикле портретов): ' +
    JSON.stringify(stats.textContent));
});

test('000169 R2: [I] — вкладка «Инвентарь»: предмет из addItem виден (render-хук inventory выполнен — цикл render ядра не рван раньше)', () => {
  const env = makePartyEnv();
  const r = env.G.addItem(env.hero, 'iron_sword');
  assert.ok(r && r.ok, 'addItem(iron_sword) — ок: ' + JSON.stringify(r));
  openPanel(env);
  const panes = panesOf(env);
  const t = textOf(panes.inventory);
  assert.ok(t.includes('Железный меч'),
    'вкладка «Инвентарь» нарисовала предмет (render() дошёл): ' +
    JSON.stringify(t.slice(0, 120)));
});

test('000169 R3: [I] — вкладка «Снаряжение»: надетое оружие видно (render-хук equipment выполнен)', () => {
  const env = makePartyEnv();
  env.G.addItem(env.hero, 'iron_sword');
  env.G.equip(env.hero, 'iron_sword');
  assert.equal(env.hero.equipment.weapon, 'iron_sword', 'оружие надето');
  openPanel(env);
  const panes = panesOf(env);
  const t = textOf(panes.equipment);
  assert.ok(t.includes('Железный меч'),
    'вкладка «Снаряжение» нарисовала оружие (render() дошёл): ' +
    JSON.stringify(t.slice(0, 120)));
  assert.ok(!t.includes('— без оружия —'),
    'строка «— без оружия —» заменена предметом');
});

test('000169 R4: [I] — вкладка «Магазин»: шапка и строки стока видны (render-хук shop выполнен)', () => {
  const env = makePartyEnv();
  // makeShop — детерминированный сток (seed x/y/type/wealth;
  // «магазин не пуст» — items.js гарантирует ≥1 строку).
  const shop = env.G.makeShop(0, 0, env.G.BUILDING_TYPES.WEAPONS_SHOP, 2);
  assert.ok(shop && Object.keys(shop.stock).length > 0,
    'makeShop — магазин с не-пустым стоком');
  env.G.playerUI.setShop(shop);
  openPanel(env);
  const panes = panesOf(env);
  const t = textOf(panes.shop);
  assert.ok(t.includes('богатство 2/3'),
    'шапка магазина нарисована (render() дошёл): ' +
    JSON.stringify(t.slice(0, 120)));
  const rows = findAll(panes.shop, '.cp-itemrow');
  assert.ok(rows.length > 0,
    'строки стока нарисованы (render() дошёл): ' + rows.length);
  assert.ok(t.includes('покупка'),
    'мета строки «покупка N з» нарисована: ' +
    JSON.stringify(t.slice(0, 120)));
});

test('000169 R5: [I] — вкладка «Квесты»: активный квест виден (render-хук quests выполнен)', () => {
  const env = makePartyEnv();
  const npcs = [
    {
      id: 'fix_inn', имя: 'Фикса', роль: 'тавернщица',
      квесты: [
        {
          id: 'fix_kill3', название: 'Очистить перевал',
          описание: 'Три группы мобов на перевале.',
          цель: { тип: 'kill_group', группа: 1, количество: 3 },
          награда: { опыт: 10, золото: 10, предметы: [] },
          предыдущий: null,
        },
      ],
    },
  ];
  const book = env.G.createQuestBook();
  book.active.fix_kill3 = { npcId: 'fix_inn', questId: 'fix_kill3',
    status: 'active', progress: 1 };
  env.G.playerUI.setQuests({ npcs, book, day: 1 });
  openPanel(env);
  const panes = panesOf(env);
  const t = textOf(panes.quests);
  assert.ok(t.includes('Очистить перевал'),
    'вкладка «Квесты» нарисовала журнал (render() дошёл): ' +
    JSON.stringify(t.slice(0, 120)));
});

test('000169 R6: регрессийный пин — «Настройки»: статика build() видна (render-хука нет — единственная вкладка, чей текст ТЗ видит; фикс НЕ должен счищать build-контент)', () => {
  const env = makePartyEnv();
  // Верность игре: на баге toggle выбрасывает ПОСЛЕ
  // panel.style.display = 'flex' (render() — последняя стадия
  // toggle) — панель ОСТАЁТСЯ видимой со статикой «Настроек»
  // (симптом ТЗ: «на панели настроек текст виден»). Поэтому здесь
  // выброс НЕ считаем провалом — проверяем только статику.
  try {
    env.G.playerUI.toggle(true);
  } catch (e) {
    assert.ok(e, ''); // на баге — ожидаем выброс (R1–R5 его пинят)
  }
  const panes = panesOf(env);
  const t = textOf(panes.settings);
  assert.ok(t.includes('Шагов за день'),
    'статика «Настроек» на месте: ' + JSON.stringify(t.slice(0, 120)));
  assert.ok(t.includes('Игровые настройки'),
    'заголовок секции «Настройки» на месте');
});

test('000169 R7: sweep устаревших портретов — ПОД РЕАЛЬНОЙ семантикой коллекций: уволенный наёмный (splice live-roster) убран из ряда .cp-portraits, лист вернулся к герою (stale-fallback Party.active → listArr[0])', () => {
  const env = makePartyEnv();
  // 1) Открыть панель на СТРАНИЦЕ ВОЛЬКА (000145: toggle(true,
  // 'character', charId)) — активный = наёмный, ряд: 2 кнопки.
  openPanel(env, 'character', 'merc_volk');
  const panes = panesOf(env);
  const row = panes.character.querySelector('.cp-portraits');
  assert.ok(row, 'ряд .cp-portraits в character-pane');
  let btns = findAll(row, '.cp-portrait');
  assert.equal(btns.length, 2, 'ряд: hero + наёмный: ' + btns.length);
  assert.equal(btns[0].dataset.memberid, 'flogiston');
  assert.equal(btns[1].dataset.memberid, 'merc_volk');
  assert.equal(String(btns[1].className),
    'cp-portrait cp-portrait-active', 'Вольк активный (подсвечен)');
  assert.equal(String(btns[0].className), 'cp-portrait',
    'герой — НЕ подсвечен (активен Вольк)');
  const title = panes.character.querySelector('.cp-title');
  assert.equal(title.textContent, 'Вольк', '.cp-title = имя активного');

  // 2) Увольнение: splice из LIVE-roster (те же ссылки, что в игре —
  // main.js мутирует __game.state.roster на месте).
  env.sandbox.__game.state.roster.splice(0, 1);

  // 3) Пере-рендер (setShop/смена ключа/кадр зовут render() — ядро):
  //    sweep-цикл обязан убрать УСТАРЕВШУЮ кнопку merc_volk из ряда
  //    (фича 000145) — под HTMLCollection-семантикой children.
  callRender(env);

  // 4) Результат: ряд = 1 кнопка (устаревший узел УБРАН), лист
  //    вернулся к герою (stale id 'merc_volk' — Party.active →
  //    listArr[0] — тихий fallback), статы = 4-строчный шаблон героя.
  btns = findAll(row, '.cp-portrait');
  assert.equal(btns.length, 1,
    'устаревший портрет merc_volk УБРАН из ряда (sweep 000145): ' +
    btns.length + ' кн.' +
    (btns.length > 1
      ? ' [' + btns.map((b) => b.dataset.memberid).join(',') + ']' : ''));
  assert.equal(btns[0].dataset.memberid, 'flogiston',
    'единственная кнопка ряда — герой');
  assert.equal(String(btns[0].className),
    'cp-portrait cp-portrait-active', 'герой — активный (подсвечен)');
  assert.equal(panes.character.querySelector('.cp-title').textContent,
    'Флогистон', '.cp-title вернулся к герою (stale-fallback)');
  const stats = panes.character.querySelector('.cp-stats');
  assert.ok(stats.textContent.includes('Уровень 1'),
    'статы героя нарисованы (render() дошёл до конца): ' +
    JSON.stringify(stats.textContent));
  assert.ok(stats.textContent.includes('Золото:'),
    '4-строчный шаблон героя (у наёмного поля нет): ' +
    JSON.stringify(stats.textContent));
});

test('000169 R8 (000180): [Esc] — закрытие панели через document-слушатель (000169: attachEsc ПОСЛЕ render) под HTMLCollection-семантикой: openPanel → isOpen()===true, ровно 1 keydown-слушатель → dispatch {code:"Escape"} → isOpen()===false, слушатель снят (0)', () => {
  // Пин фикса 000169 (major ретро 000169): закрытие панели по [Esc]
  // восстановлено и обещано в CHANGELOG, но не было покрыто —
  // единственный Esc-пин (tests/ui-panel.test.js) работает на
  // plain-Array-стабе (children: []), где render() НЕ бросает →
  // пин был зелёным на баговом базлайне (классовая слепота стаба).
  // Суть порядка: toggle(true) → render() → attachEsc() (ui.js) —
  // на баге pre-000169 render() вкладки «Персонаж» бросал ДО
  // attachEsc → слушатель не вешался.
  const env = makePartyEnv();
  // Первый ассерт — openPanel (toggle(true) БЕЗ выброса): пин самого
  // фикса 000169 (render() «Персонаж» доходит до конца под
  // HTMLCollection-стабом).
  openPanel(env);
  assert.equal(env.G.playerUI.isOpen(), true,
    'панель открыта (isOpen: display flex)');
  // Гарды escHandler пусты в песочнице — Esc доходит до toggle(false):
  assert.equal(env.G.npcUI.isActive(), false,
    'диалог NPC не открыт (npcUI.isActive() — !!overlay)');
  assert.equal(env.G.combatUI, undefined,
    'combatUI вне CHAIN (combat-ui.js ПОСЛЕ ui.js в index.html) — '
    + 'typeof-гард пропущен');
  const kd = env.sandbox.document.listeners.keydown;
  assert.ok(Array.isArray(kd), 'document-слушатели keydown есть');
  assert.equal(kd.length, 1,
    'ровно ОДИН document-keydown-слушатель — attachEsc ПОСЛЕ render '
    + '(toggle: render() → attachEsc(), ui.js); в CHAIN на document '
    + 'вешает только playerUI (npcUI-attachEsc — на window)');
  // Dispatch как в DOM: по КОПИИ слушателей (слушатель может сняться
  // в процессе диспатча); гард escHandler — по e.code, НЕ e.key.
  for (const fn of kd.slice()) fn({ code: 'Escape' });
  assert.equal(env.G.playerUI.isOpen(), false,
    '[Esc] закрыл панель (escHandler: e.code === "Escape" → toggle(false))');
  assert.equal(env.sandbox.document.listeners.keydown.length, 0,
    'detachEsc — слушатель снят на close (живёт только пока панель открыта)');
});

// Задача 000186: согласованность лута подземелья — (a) строка победы
// «Группа/Босс повержена.» показывает ЗОЛОТО (Y = res.gold) — паритет
// с мирской «Победа! +X опыта, +Y золота.» (main.js L1638/L2081) и
// ядром (combat.js L1208); (b) сундук при переполнении инвентаря —
// предмет НЕ теряется: overflow → авто-золото по каталожному value
// (семантика 000132, прецедент combatEndLoot) + строка «не влезло:
// +V золота». Контракт — memory/000186-dungeon-loot.md; ТЗ —
// tasks/pending/000186.md.
//
// КРАСНЫЕ тесты (TDD): функциональность ЕЩЁ НЕ СУЩЕСТВУЕТ в src/main.js.
//   * A1 — dungeon-победа: строка ds.log сейчас «…повержена. +X опыта.»
//     (члена «+Y золота» НЕТ) → ассерт «+<res.gold> золота» в строке
//     падает;
//   * B1 — сундук при полном инвентаре: сейчас «(инвентарь полон:
//     … потерян)», начисления hero.gold += it.value в chest-ветке НЕТ
//     → ассерт строки «(не влезло: +400 золота)» и Δhero.gold = 437
//     падают;
//   * P1 — паритет-пин: формат dungeon-строки победы = мирской
//     (regex «опыта, +N золота») — сейчас шаблона НЕТ.
//
// Все три падают ОСМЫСЛЕННО (несопадение текста/Δgold) — НЕ
// синтаксически: модули/функции на месте, фикс меняет строку и
// начисление. Реальный dungeon-бой (НЕ мутация c.result — решение 2):
// enterDungeon() → замена ds.contents (группа на клетке-соседе входа)
// → keydown-шаг → startDungeonCombat → dealDamageToMob(9999) по живым
// мобам → checkVictory (ядро, c.result = victory) → Space → finish →
// onEnd. Y = c.result.gold ЧИТАЕТСЯ из результата (ручного расчёта
// ролла нет; seed боя детерм.: hash2(17, level, 0xb055) для id 'g0').
//
// Harness — СВОЙ, дубль bootSandbox из tests/loot-e2e.test.js
// (дублирование харнессов — принятая конвенция 000083/000087/сам
// loot-e2e; полный makeEl: combat-ui создаёт СВОЙ canvas боя — без
// getContext-стаба render() роняет TypeError). Д-протокол rAF и
// stepDungeon — паттерн tests/main-visuals.test.js (CB-9).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { SAVE_KEY } = require('../src/save.js');
const P = require('../src/player.js');

const ROOT = path.join(__dirname, '..');
const NOW = 1000; // performance.now() в песочнице заморожен

// --- Цепочка скриптов — из index.html (000186 — 0 новых тегов) ---
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));

// --- WebGL-стаб (main.js: compile/link/буферы) ---

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

// --- Canvas 2d-стаб (запись вызовов — sanity, что слой жив) ---

function makeContext2d(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

// --- «Снисходительный» DOM (полный: combat-ui build()/render()) ---

function matchesSel(el, sel) {
  // Поддерживает: 'tag', '.class', '[attr]', '[attr="value"]' и их
  // композиты без пробела — то, что использует игра (ui.js и др.).
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
    if (attr[1] !== undefined && v !== attr[1]) return false;
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
    // children хранят СУРЫЕ target (а не прокси): remove() ищёт по
    // identity.
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
    // data-* → dataset.
    setAttribute(name, value) {
      if (name.startsWith('data-')) {
        target.dataset[name.slice(5)] = value;
      }
    },
    // canvas: 2d/WebGL-контексты — no-op-прокси. combat-ui.js создаёт
    // СВОЙ canvas боя (document.createElement('canvas')) — без
    // getContext-стаба render() роняет TypeError.
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
  // textContent — как в DOM: сбрасывает детей (render() очищает секции).
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

// --- localStorage-мок: seed — досеянная оболочка сейва (v1) ---

function makeStorage(seed) {
  const m = new Map();
  if (seed != null) m.set(SAVE_KEY, JSON.stringify(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

function seedSave(data) {
  return { version: 1, savedAt: new Date(0).toISOString(), data };
}

// --- Песочница: вся цепочка index.html (браузерная ветка UMD) ---

function bootSandbox(seed) {
  const winListeners = {};
  const raf = [];
  const warns = [];
  const errors = [];
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
  // #game — WebGL (без него main.js уходит в фолбэк-ветку и не стартует).
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl() : makeContext2d(gameCanvas));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? makeContext2d(spriteCanvas) : null);
  const storage = makeStorage(seed);
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
    // Семантика браузерного window: повторный add — no-op, remove —
    // реально снимает (без этого накапливались устаревшие keydown).
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
  // onload. Загрузка — микротаск.
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
      warn: (m) => warns.push(String(m)),
      error: (m) => errors.push(String(m)),
      log: () => {},
    },
    document,
    window,
    Image,
    performance: { now: () => NOW },
    requestAnimationFrame: (fn) => { raf.push(fn); return raf.length; },
    // Таймеры не гоняем (флаши UI): no-op, чтобы не держать процесс.
    setTimeout: () => 0,
    clearTimeout: () => {},
  };
  vm.createContext(sandbox);
  for (const f of CHAIN) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox,
      { filename: f });
  }
  return { sandbox, winListeners, raf, warns, errors, storage, body, hud };
}

// Промывка микротасков (загрузки Image + loadMapPixels().then: карта,
// спавн, restoreFromSave, requestAnimationFrame).
const drain = () => new Promise((r) => setImmediate(r));

async function boot(seed) {
  const h = bootSandbox(seed);
  await drain();
  await drain();
  await drain();
  return h;
}

// --- Наблюдение ---

// Кросс-реалм: vm-объекты → JSON (паттерн 000085; Array.isArray
// проверяется ДО вызова — host(undefined) бросает).
const host = (o) => JSON.parse(JSON.stringify(o));

// Персонаж для досеянного сейва (форма sanitizeSavedHero: level/xp/
// gold/hp finite + шесть основных ≥ 1; hp клампится до maxHP).
function mkHero(over = {}) {
  return Object.assign(P.createCharacter(), over);
}

// КАДР ГЛАВНОГО ЦИКЛА: ВСЕ rAF-записи main-цикла — ОДНА функция
// frame (requestAnimationFrame(frame) в конце frame + первичная
// на старт), поэтому raf[0] — main frame ВЕЧНО.
function mainFrameAt(h, now = NOW + 500) {
  h.raf[0](now);
}

// --- Хелперы подземелья (000186) ---

// Клетка на пути: первый FLOOR-сосед ВХОДА в порядке
// [[1,0],[-1,0],[0,1],[0,-1]], НЕ выход (000177 — шаг на выход не
// триггерит ничего особенного, но избегаем). НЕ хардкод x+1: может
// быть стеной (шаг = no-op → бой не начался бы → ложный красный).
// Подземелье связное (createDungeon), у входа ВСЕГДА есть FLOOR-сосед.
function asideDir(G, d) {
  const w = d.width;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of dirs) {
    const nx = d.entrance.x + dx, ny = d.entrance.y + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= d.height) continue;
    if (nx === d.exit.x && ny === d.exit.y) continue;
    if (d.cells[ny * w + nx] === G.CELL_FLOOR) return { x: nx, y: ny };
  }
  return null;
}

// Один шаг героя в подземелье: диспатч keydown {code:'Arrow*'} в
// window-слушатели (dungeon-ui L276: гейты isActive() +
// !combatUI.isActive() → ctx.onMove → dungeonMove синхронно:
// 1 клавиша = 1 клетка). Мир НЕ сдвигается: keydown main.js имеет
// гейт G.dungeonUI.isActive() → return.
function stepTo(h, tx, ty) {
  const g = h.sandbox.__game;
  const dx = tx - g.dungeon.x, dy = ty - g.dungeon.y;
  assert.ok(Math.abs(dx) + Math.abs(dy) === 1,
    'шаг на соседнюю клетку (манхэттен = 1)');
  const code = dx === 1 ? 'ArrowRight' : dx === -1 ? 'ArrowLeft'
    : dy === 1 ? 'ArrowDown' : 'ArrowUp';
  const e = { code, key: code, preventDefault() {}, stopPropagation() {} };
  for (const fn of h.winListeners['keydown'] || []) fn(e);
}

// Реальный dungeon-бой (CB-9): группа на клетке → шаг → combat.
// УБИВАЕМ ТОЛЬКО мобов (dealDamageToMob 9999 → checkVictory по живым
// мобам; Эфир НЕ убиваем — ядро считает только мобов). Возврат:
// c (live-объект боя, c.result = victory после kill).
function winDungeonCombat(h, G, g) {
  assert.equal(G.combatUI.isActive(), true,
    'бой начался (dungeonOnMove → startDungeonCombat)');
  const c = G.combatUI.current();
  assert.ok(c, 'объект боя доступен');
  for (const m of c.units.filter((u) => u.side === 'mob' && u.alive)) {
    G.combatInternals.dealDamageToMob(c, m, 9999);
  }
  assert.ok(c.result && c.result.outcome === 'victory',
    'победа (checkVictory: все мобы мертвы)');
  assert.ok(c.result.xp > 0, 'xp > 0 (победа над группой)');
  assert.ok(c.result.gold > 0, 'gold > 0 (за ≥1 моба — «+0» невозможен)');
  G.combatUI.handleCode('Space');
  assert.equal(G.combatUI.isActive(), false,
    'бой закрыт (Space → finish → onEnd)');
  return c;
}

// =====================================================================
// A1. (a) строка победы в подземелье показывает ЗОЛОТО (Y = res.gold)
// =====================================================================

// boot(seedSave day:2, hero gold:100) → enterDungeon() → замена
// ds.contents.mobs = [группа skeleton на клетке-соседе входа],
// chests=[] → шаг на группу → реальный бой → Space. Ассерт: строка
// ds.log (по ПРЕФИКСУ, НЕ последняя — за ней «Лут: …»/отряд) содержит
// «+<c.result.xp> опыта, +<c.result.gold> золота.». Красный: до фикса
// строка «…опыта.» (без золота). Бонус: Δhero.gold = +res.gold
// (ядро combat.js L1183 — live-ссылка на hero).
test('000186-A1: dungeon-победа — золото в строке ds.log (Y = res.gold)', async () => {
  const h = await boot(seedSave({ day: 2, hero: mkHero({ gold: 100 }) }));
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.equal(g.state.hero.gold, 100, 'gold восстановлен из сейва (boot не вакуумный)');
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon — состояние подземелья (отладочный вход)');
  const cell = asideDir(G, ds.dg);
  assert.ok(cell, 'FLOOR-клетка-сосед входа найдена (подземелье связное)');
  ds.contents = {
    mobs: [{ id: 'g0', mobIds: ['skeleton'], x: cell.x, y: cell.y, level: 1, defeated: false }],
    chests: [],
    seed: 1, step: 0,
  };
  const gold0 = g.state.hero.gold;
  stepTo(h, cell.x, cell.y); // шаг на группу → бой
  const c = winDungeonCombat(h, G, g);
  // Строка НЕ обязательно последняя (за ней — лут/отряд) → find по префиксу.
  const line = ds.log.find((l) => l.startsWith('Группа повержена. +'));
  assert.ok(line, 'victory-строка в ds.log: ' + JSON.stringify(ds.log));
  assert.ok(
    line.includes('+' + c.result.xp + ' опыта, +' + c.result.gold + ' золота.'),
    'строка содержит «+X опыта, +Y золота.» (Y = c.result.gold): ' + line);
  // Бонус: золото НАЧАЛИСЯ в ядре (c.player = live hero) — дельта = res.gold.
  assert.equal(g.state.hero.gold, gold0 + c.result.gold,
    'Δhero.gold = +' + c.result.gold + ' (ядро combat.js)');
});

// =====================================================================
// B1. (b) сундук при переполнении → авто-золото по value (000132)
// =====================================================================

// boot(day:2, hero gold:50) → enterDungeon() → giveItem('wood_log',14)
// (28 кг ≤ 30, полный инвентарь по весу) → замена ds.contents: mobs=[],
// chests=[{c1, клетка-сосед, opened:false, gold:37, item:'knight_plate'}]
// → шаг на сундук (openChest — без rng: собственные gold/item) →
// chest-ветка: hero.gold += 37 (ВСЕГДА) + knight_plate 7 кг → 28+7=35>30
// → отказ по весу → overflow = value 400 → hero.gold += 400. Ассерт:
// строка ds.log ПОБАЙТОВО «Сундук: +37 золота (не влезло: +400 золота)»,
// Δhero.gold = 37+400 = 437, slots [{wood_log,14}] (предмет НЕ добавлен
// и НЕ потерян — конвертирован), «потерян»/«инвентарь полон» в строке
// НЕТ. Красный: до фикса — «(инвентарь полон: Рыцарский доспех потерян)»,
// Δgold = +37 (без +400).
test('000186-B1: сундук при полном инвентаре → авто-золото по value + «не влезло: +400 золота»', async () => {
  const h = await boot(seedSave({ day: 2, hero: mkHero({ gold: 50 }) }));
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.equal(g.state.hero.gold, 50, 'gold восстановлен из сейва (boot не вакуумный)');
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon — состояние подземелья (отладочный вход)');
  // 14 × wood_log (2 кг, reagent — складывается) = 28 кг, 1 слот; лимит 30.
  const r = g.actions.giveItem('wood_log', 14);
  assert.ok(r && r.ok, 'giveItem: 28 кг ≤ 30 — принято: ' + JSON.stringify(r));
  const cell = asideDir(G, ds.dg);
  assert.ok(cell, 'FLOOR-клетка-сосед входа найдена (подземелье связное)');
  ds.contents = {
    mobs: [],
    chests: [{ id: 'c1', x: cell.x, y: cell.y, opened: false, gold: 37, item: 'knight_plate' }],
    seed: 1, step: 0,
  };
  const gold0 = g.state.hero.gold;
  stepTo(h, cell.x, cell.y); // шаг на сундук → openChest → chest-ветка
  // Строка ds.log ПОБАЙТОВО.
  const line = ds.log.find((l) => l.startsWith('Сундук: +'));
  assert.ok(line, 'строка сундука в ds.log: ' + JSON.stringify(ds.log));
  assert.equal(line, 'Сундук: +37 золота (не влезло: +400 золота)',
    'строка побайтово (семантика 000132): ' + line);
  assert.ok(!line.includes('потерян') && !line.includes('инвентарь полон'),
    '«потерян»/«инвентарь полон» в строке НЕТ (предмет не теряется): ' + line);
  // Авто-золото: РОВНО +37 (chest.gold, ВСЕГДА) + 400 (value knight_plate).
  assert.equal(g.state.hero.gold, gold0 + 37 + 400,
    'Δhero.gold = +37 (chest) + 400 (overflow value) = +437');
  // Предмет НЕ в slots (отказ по весу), wood_log на месте.
  const slots = g.state.hero.inventory;
  assert.ok(Array.isArray(slots), 'инвентарь — массив slots');
  assert.deepEqual(host(slots), [{ id: 'wood_log', qty: 14 }],
    'slots: knight_plate НЕ добавлен (конвертирован в золото), wood_log на месте');
  // Бонус: hudFlash = та же строка (после кадра).
  mainFrameAt(h);
  const hud = String(h.hud.textContent);
  assert.ok(hud.includes('Сундук: +37 золота (не влезло: +400 золота)'),
    'hudFlash = строка сундука: ' + hud);
});

// =====================================================================
// P1. паритет-пин: формат dungeon-строки победы = мирской
// =====================================================================

// Сценарий — как A1 (независимый запуск). Ассерт: строка ПОЛНОСТЬЮ
// совпадает с /^Группа повержена\. \+(\d+) опыта, \+(\d+) золота\.$/
// И числа === c.result.xp / c.result.gold — хвост «опыта, +N золота»
// идентичен мирскому «Победа! +X опыта, +Y золота.» (main.js
// L1638/L2081, combat.js L1208). Префикс «Группа/Босс» — без изменений.
// Красный: до фикса строка оканчивается « опыт.» (шаблона
// «опыта, +N золота» в dungeon-ветке onEnd НЕТ — только у мира/combat.js).
test('000186-P1: паритет — dungeon-строка победы = мирской формат (опыта, +N золота)', async () => {
  const h = await boot(seedSave({ day: 2, hero: mkHero({ gold: 100 }) }));
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon — состояние подземелья (отладочный вход)');
  const cell = asideDir(G, ds.dg);
  assert.ok(cell, 'FLOOR-клетка-сосед входа найдена (подземелье связное)');
  ds.contents = {
    mobs: [{ id: 'g0', mobIds: ['skeleton'], x: cell.x, y: cell.y, level: 1, defeated: false }],
    chests: [],
    seed: 1, step: 0,
  };
  stepTo(h, cell.x, cell.y); // шаг на группу → бой
  const c = winDungeonCombat(h, G, g);
  const line = ds.log.find((l) => l.startsWith('Группа повержена. +'));
  assert.ok(line, 'victory-строка в ds.log: ' + JSON.stringify(ds.log));
  const m = line.match(/^Группа повержена\. \+(\d+) опыта, \+(\d+) золота\.$/);
  assert.ok(m, 'формат строки = мирской (хвост «опыта, +N золота»): ' + line);
  assert.equal(Number(m[1]), c.result.xp, 'число опыта в строке === c.result.xp');
  assert.equal(Number(m[2]), c.result.gold, 'число золота в строке === c.result.gold');
});

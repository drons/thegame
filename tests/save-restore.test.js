// Задача 000072: состояние эффектов построек в сейве — разделы
// data.buildingOncePerDay ('x,y:effectId' → день применения эффекта)
// и data.buffs (благословения { source: 'x,y', day, kind: 'damage'|'armor' }).
//
// main.js в node не грузится (IIFE: WebGL-контекст + DOM) — поэтому здесь
// исполняем ВЕСЬ <script>-цепочку из index.html в vm-песочнице с
// DOM/WebGL-стабами (паттерн tests/main-visuals.test.js), НО с МОКОМ
// localStorage — в песочнице main-visuals хранилища нет (saveStorage =
// undefined, сейвы не читаются/не пишутся), и тесты сейва прошли бы
// «вакуумно». Вариант песочницы: досеянный сейв (v1) до запуска цепочки;
// restoreFromSave сам вызывается при boot (main.js), а наблюдение —
// через захваченный window-слушатель beforeunload: dispatch → saveNow()
// → чтение мок-хранилища.
//
// ТЕСТ-ФИКСАТОР против прецедент-дефекта _lastUnkillDay (combat.js:321):
// то поле живёт на объекте персонажа и ВНЕ сейва — эффект повторно
// доступен в тот же день после перезагрузки. Новое состояние эффектов
// обязано лежать в разделе сейва: лимит и благословение ТОГО ЖЕ дня
// переживают «перезагрузку», на hero новых полей не появляется.
//
// Дни — АБСОЛЮТНЫЕ (fastForward без слушателей — 000031): подделанный
// «будущий» день (запись с днём > clock.day) отбрасывается, иначе
// эффект был бы заблокирован на N дней / бафф «из будущего»; истёкшее
// благословение (day < clock.day) отбрасывается при восстановлении
// (очистка в onDay НЕ пройдёт — fastForward не оповещает слушателей).
// Версию сейва НЕ поднимают (неломкое расширение v1, 000031).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { SAVE_KEY } = require('../src/save.js');
// 000153.01 (RD): node-реплики детерминированного мира/подземелья.
const D = require('../src/dungeon.js');
const M = require('../src/map.js');
const PS = require('../src/mapseed.js');
const P = require('../src/player.js');

const ROOT = path.join(__dirname, '..');

// Цепочка скриптов — из index.html (не хардкод: изменения порядка
// подхватятся сами; регрессия порядка — tests/index-order.test.js).
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));

// --- WebGL-стаб (main.js: compile/link/буферы; как main-visuals) ---

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

// --- «Снисходительный» DOM-элемент (как main-visuals) ---

function makeEl(tag) {
  const target = {
    tagName: tag,
    className: '',
    textContent: '',
    title: '',
    style: {},
    dataset: {},
    children: [],
    listeners: {},
    appendChild(ch) { target.children.push(ch); return ch; },
    addEventListener(type, fn) {
      (target.listeners[type] || (target.listeners[type] = [])).push(fn);
    },
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    setAttribute() {},
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    remove() {},
    blur() {},
  };
  if (tag === 'canvas') {
    // 000153.01 (RD): dungeon-ui оверлей создаёт canvas через
    // document.createElement — без 2d-стаба render() падает
    // (g2 = undefined → TypeError при set fillStyle). Паттерн
    // tests/main-visuals.test.js (makeEl, canvas-ветка).
    target.getContext = (kind) => (kind === '2d'
      ? makeContext2d(target) : null);
  }
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

// Оболочка досеянного сейва актуальной версии (v1).
function seedSave(data) {
  return { version: 1, savedAt: new Date(0).toISOString(), data };
}

// --- Песочница: вся цепочка index.html (браузерная ветка UMD),
// window.localStorage — мок с досеянным сейвом ---

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
  const document = {
    createElement: (tag) => makeEl(tag),
    getElementById: (id) => (
      id === 'game' ? gameCanvas
        : id === 'sprites' ? spriteCanvas
          : id === 'hud' ? hud
            : null
    ),
    body: makeEl('body'),
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
    confirm: () => false, // миграция не должна потребовать согласия (v1)
    addEventListener: (t, f) => {
      (winListeners[t] || (winListeners[t] = [])).push(f);
    },
    removeEventListener() {},
  };
  // Image-стаб: src ставится ПОСЛЕ onload/onerror (main.js). Загрузка —
  // микротаск: assets/map.png ВСЕГДА onerror (детерминированный фолбэк
  // G.generateSeedPixels, main.js loadMapPixels), остальные — onload.
  function Image() {
    const self = this;
    self.naturalWidth = 0;
    self.naturalHeight = 0;
    Object.defineProperty(self, 'src', {
      configurable: true,
      get() { return self.__src; },
      set(v) {
        self.__src = v;
        self.__asset = v;
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
    performance: { now: () => 1000 },
    requestAnimationFrame: (fn) => { raf.push(fn); return raf.length; },
  };
  vm.createContext(sandbox);
  for (const f of CHAIN) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox,
      { filename: f });
  }
  return { sandbox, winListeners, raf, warns, errors, storage };
}

// Промывка микротасков (загрузки Image + loadMapPixels().then: карта,
// спавн, restoreFromSave, requestAnimationFrame).
const drain = () => new Promise((r) => setImmediate(r));

async function boot(seed) {
  const h = bootSandbox(seed);
  await drain();
  await drain();
  await drain();
  // 000153.01 (RD): frame() main.js — последний rAF-колбэк на момент
  // старта; frame пере планирует себя (одна и та же функция) —
  // frameFn валидна постоянно (паттерн portal-exit-e2e:279).
  h.frameFn = h.raf[h.raf.length - 1];
  return h;
}

// Сейв из мок-хранилища (после beforeunload).
function readSave(h) {
  const text = h.storage.getItem(SAVE_KEY);
  assert.ok(text != null, 'сейв записан в мок-хранилище');
  return JSON.parse(text);
}

// Dispatch захваченного window-слушателя beforeunload → saveNow().
function fireBeforeUnload(h) {
  const fns = h.winListeners['beforeunload'];
  assert.ok(fns && fns.length, 'слушатель beforeunload зарегистрирован');
  for (const fn of fns) fn({});
}

// Сейв реально ПРОЧИТАН (boot не «вакуумный»): оболочка v1 и день
// мира восстановлен из data.day.
function assertRestored(h, day) {
  const st = h.sandbox.__game.state;
  assert.ok(st.map, 'карта сгенерирована (boot прошёл)');
  assert.ok(st.save, 'сейв прочитан (state.save выставлен)');
  assert.equal(st.save.version, 1, 'оболочка v1');
  assert.equal(st.day, day, 'день мира восстановлен из сейва (fastForward)');
}

// --- Тесты ---

test('фиксатор: лимит «раз в день» и благословение того же дня переживают «перезагрузку»', async () => {
  // Прецедент _lastUnkillDay (combat.js:321): состояние на hero, вне
  // сейва — после перезагрузки эффект повторно доступен в тот же день.
  // Здесь: значение раздела buildingOncePerDay (день === день мира)
  // должно ПРОЙТИ через boot → beforeunload без сброса.
  const h = await boot(seedSave({
    day: 7,
    buildingOncePerDay: { '1,1:heal': 7 },
    buffs: [{ source: '2,2', day: 7, kind: 'armor' }],
  }));
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: ' + h.errors.join('; '));
  assertRestored(h, 7);

  fireBeforeUnload(h);
  const saved = readSave(h);
  assert.equal(saved.version, 1, 'версия НЕ повышена (неломкое расширение)');
  assert.equal(saved.data.day, 7);
  assert.deepEqual(saved.data.buildingOncePerDay, { '1,1:heal': 7 },
    'лимит того же дня сохранён в разделе сейва');
  assert.equal(
    h.sandbox.Game.canUseToday(
      saved.data.buildingOncePerDay['1,1:heal'], saved.data.day),
    false, 'canUseToday(значение из сейва, день) — false: эффект недоступен');
  assert.deepEqual(saved.data.buffs, [{ source: '2,2', day: 7, kind: 'armor' }],
    'активное благословение сохранено (АБСОЛЮТНЫЙ день)');
  // Состояние — в разделе сейва, а НЕ на hero: на персонаже не
  // появляется никаких «дневных» полей (в отличие от _lastUnkillDay).
  assert.ok(saved.data.hero, 'hero записан в сейв');
  assert.ok(!Object.keys(saved.data.hero).some((k) => /day/i.test(k)),
    'на hero нет полей с «день» в имени (лимит не на персонаже): '
    + Object.keys(saved.data.hero).join(', '));
});

test('битые разделы: цепочка не падает, console.warn, разделы сброшены в {} / []', async () => {
  const h = await boot(seedSave({
    day: 3,
    buildingOncePerDay: 'junk',
    buffs: 'junk',
    // 000093: explored — тоже битый раздел (fail-open 000029).
    explored: 'junk',
  }));
  assert.equal(h.errors.length, 0, 'игра не роняется: ' + h.errors.join('; '));
  assertRestored(h, 3);
  assert.ok(h.warns.some((m) => m.includes('buildingOncePerDay')),
    'предупреждение о разделе buildingOncePerDay: ' + h.warns.join(' | '));
  assert.ok(h.warns.some((m) => m.includes('buffs')),
    'предупреждение о разделе buffs: ' + h.warns.join(' | '));
  // 000093: предупреждение о разделе explored (warn — main.js,
  // паттерн 000072; сам restoreExplored — тихий).
  assert.ok(h.warns.some((m) => m.includes('explored')),
    'предупреждение о разделе explored: ' + h.warns.join(' | '));

  fireBeforeUnload(h);
  const saved = readSave(h);
  assert.deepEqual(saved.data.buildingOncePerDay, {}, 'битый раздел сброшен в {}');
  assert.deepEqual(saved.data.buffs, [], 'битый раздел сброшен в []');
  assert.deepEqual(saved.data.explored, {},
    'битый раздел explored сброшен в {} (000093)');
});

test('подделанный «будущий» день: отброшен (запись day > day, бафф day > day)', async () => {
  const h = await boot(seedSave({
    day: 7,
    buildingOncePerDay: { '1,1:heal': 99 },
    buffs: [{ source: '2,2', day: 9, kind: 'armor' }],
  }));
  assertRestored(h, 7);

  fireBeforeUnload(h);
  const saved = readSave(h);
  assert.deepEqual(saved.data.buildingOncePerDay, {},
    '«использовано в будущем» отброшено (иначе эффект заблокирован на N дней)');
  assert.deepEqual(saved.data.buffs, [],
    'благословение «из будущего» отброшено');
});

test('истёкшее благословение из сейва отброшено при восстановлении (fastForward без слушателей)', async () => {
  // onDay-очистка НЕ пройдёт (clock.fastForward не оповещает слушателей,
  // 000031) — restoreFromSave обязан отбросить истёкшее САМ.
  const h = await boot(seedSave({
    day: 7,
    buffs: [{ source: '1,1', day: 5, kind: 'damage' }],
  }));
  assertRestored(h, 7);

  fireBeforeUnload(h);
  const saved = readSave(h);
  assert.deepEqual(saved.data.buffs, [],
    'buff.day 5 < 7 — истёкшее благословение не восстанавливается');
});

test('старый v1-сейв без новых разделов: boot ок, новый сейв пишет {} / [] (без миграции)', async () => {
  const h = await boot(seedSave({ day: 3 }));
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: ' + h.errors.join('; '));
  assertRestored(h, 3);

  fireBeforeUnload(h);
  const saved = readSave(h);
  assert.equal(saved.version, 1, 'версия НЕ повышена');
  assert.deepEqual(saved.data.buildingOncePerDay, {},
    'отсутствующий раздел восстановился пустым и так же записан');
  assert.deepEqual(saved.data.buffs, []);
  // 000093: explored — тоже неломкое расширение: старый v1-сейв без
  // раздела → восстановлен пустым → новый сейв пишет {}.
  assert.deepEqual(saved.data.explored, {},
    'explored: отсутствующий раздел → {} (без миграции)');
});

// --- Задача 000153.01: модель глубины + раздел сейва dungeonMemory
// (КРАСНЫЕ, §6) ---
// Флагман RD-1 — re-loot e2e: содержимое этажа (открытые сундуки /
// побеждённые группы / step / позиция) обязано персистрироваться в
// НОВОМ разделе сейва dungeonMemory (ключ 'x,y:depth') и повторный
// вход на тот же этаж НЕ должен регенерировать «свежее» содержимое
// (открытый сундук не даёт повторное золото, побеждённая группа не
// оживает). ВХОД — ТОЛЬКО через world-step (maybeEnterDungeon);
// g.actions.enterDungeon (debug) намеренно не читает память (CB-9).
//
// Детерминированный мир (mapseed 20260926; в vm: map.png → onerror →
// G.generateSeedPixels() ≡ PS.generateSeedPixels() в node): spawn
// (0,0); пещера — ближайший CAVE_ENTRANCE от спавна: (-20,-20)
// (BFS 39), terrain GRASS, тайл без mob-групп, zone-боя на тайле
// НЕТ (предвычислено node-репликой). Фикс-сценарий: 2 сундука
// (ближайший к входу — c1 (13,4), gold 20), 3 группы.

const WORLD_MAP = M.createMap(PS.generateSeedPixels());
const CAVE = { x: -20, y: -20 };
const OUT_TILE = { x: -19, y: -20 }; // passable, без групп, не пещера
const CAVE_TERRAIN = WORLD_MAP.tileAt(CAVE.x, CAVE.y).terrain;
const MEM_KEY = CAVE.x + ',' + CAVE.y + ':1'; // ключ dungeonMemory этажа
assert.ok(WORLD_MAP.tileAt(CAVE.x, CAVE.y).passable,
  'преконтрак: пещерный тайл passable');
assert.equal(CAVE_TERRAIN, M.TERRAIN.GRASS,
  'преконтрак: terrain пещеры = GRASS');
assert.ok(WORLD_MAP.tileAt(OUT_TILE.x, OUT_TILE.y).passable
  && !WORLD_MAP.tileAt(OUT_TILE.x, OUT_TILE.y).hasMobGroup,
  'преконтрак: выходной тайл passable без групп');

// node-реплика пещерного подземелья (hero-дефолты: gold 100,
// totalXp 0, level 1 — сид контента зависит только от totalXp;
// герой в vm создаётся при boot с теми же дефолтами). 5-й аргумент
// depth=1 — для зелёной стадии (красный: игнорируется).
function dungeonReplica() {
  const px = PS.generateSeedPixels();
  const d = D.createDungeon(CAVE.x, CAVE.y, px, CAVE_TERRAIN, 1);
  const contents = D.generateDungeonContents(d, P.createCharacter());
  return { d, contents };
}
const REPLICA = dungeonReplica();
const N_CHESTS = REPLICA.contents.chests.length;
const N_GROUPS = REPLICA.contents.mobs.length;
assert.equal(N_CHESTS, 2, 'преконтрак: 2 сундука');
assert.equal(N_GROUPS, 3, 'преконтрак: 3 группы');
const CHEST1 = REPLICA.contents.chests[1];
assert.deepEqual({ x: CHEST1.x, y: CHEST1.y, gold: CHEST1.gold },
  { x: 13, y: 4, gold: 20 }, 'преконтрак: c1 (13,4), gold 20');

// FLOOR по клеткам реплики (проверка pos на стороне теста).
function replicaFloor(x, y) {
  return x >= 0 && y >= 0 && x < REPLICA.d.width && y < REPLICA.d.height
    && REPLICA.d.cells[y * REPLICA.d.width + x] === D.CELL_FLOOR;
}

// --- Ввод (паттерн press/release, tests/portal-exit-e2e.test.js) ---

function keydownFor(dx, dy) {
  return dx === 1 ? 'ArrowRight' : dx === -1 ? 'ArrowLeft'
    : dy === 1 ? 'ArrowDown' : 'ArrowUp';
}

function press(h, code) {
  const e = {
    code, key: code,
    prevented: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() {},
  };
  for (const fn of (h.winListeners['keydown'] || []).slice()) fn(e);
  return e;
}

function release(h, e) {
  for (const fn of (h.winListeners['keyup'] || []).slice()) fn(e);
}

// --- Ходьба по миру (паттерн walkTiles, portal-exit-e2e) ---
// Каждый шаг — keydown(направление) → кадры frame(now) по +200 мс,
// пока игрок не перешёл (tryMove в frame, не более ОДНОГО хода за
// кадр) → keyup. 000135: zone-бой по маршруту — авторазрешение.
// Шаг НА пещерный тайл = авто-вход (enterLocation в том же tryMove).
function walkTiles(h, now, tiles) {
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  for (const [tx, ty] of tiles) {
    const dx = tx - g.state.player.x, dy = ty - g.state.player.y;
    assert.ok(Math.abs(dx) + Math.abs(dy) === 1,
      'BFS: шаг по соседнему тайлу');
    const e = press(h, keydownFor(dx, dy));
    let guard = 0;
    do {
      now += 200;
      h.frameFn(now);
    } while ((g.state.player.x !== tx || g.state.player.y !== ty)
      && ++guard < 10);
    release(h, e);
    assert.equal(g.state.player.x, tx,
      'сценарий: игрок перешёл на (' + tx + ', ' + ty + ') — x');
    assert.equal(g.state.player.y, ty,
      'сценарий: игрок перешёл на (' + tx + ', ' + ty + ') — y');
    if (G.combatUI.isActive()) {
      const c = G.combatUI.current();
      for (const m of c.units.filter((x) => x.side === 'mob'
          && x.alive)) {
        G.combatInternals.dealDamageToMob(c, m, 9999);
      }
      assert.ok(c.result && c.result.outcome === 'victory',
        'zone-бой по маршруту — победа');
      G.combatUI.handleCode('Space');
      assert.equal(G.combatUI.isActive(), false, 'zone-бой закрыт');
    }
  }
  for (let i = 0; i < 4; i++) {
    now += 200;
    h.frameFn(now);
  }
  return now;
}

// --- Подземелье: один шаг — ОДИН keydown (паттерн stepDungeon,
// tests/main-visuals.test.js: dungeonMove синхронно: 1 клавиша = 1
// клетка). Бой, если живая группа на клетке — после шага
// combatUI.isActive() = true.
function stepDungeon(h, tx, ty) {
  const g = h.sandbox.__game;
  const dx = tx - g.dungeon.x, dy = ty - g.dungeon.y;
  assert.ok(Math.abs(dx) + Math.abs(dy) === 1,
    'BFS: шаг по соседней клетке');
  const code = keydownFor(dx, dy);
  const e = { code, key: code, preventDefault() {}, stopPropagation() {} };
  for (const fn of h.winListeners['keydown'] || []) fn(e);
}

// --- Подземелье: бой — победа (группа выбита) + закрытие (Space) ---
function winCombat(h, G, c) {
  for (const m of c.units.filter((x) => x.side === 'mob' && x.alive)) {
    G.combatInternals.dealDamageToMob(c, m, 9999);
  }
  assert.ok(c.result && c.result.outcome === 'victory',
    'подземный бой: победа');
  G.combatUI.handleCode('Space');
  assert.equal(G.combatUI.isActive(), false,
    'подземный бой закрыт (Space → finish)');
}

// --- BFS по клеткам подземелья (FLOOR) от (sx,sy) к (tx,ty),
// обходя живые группы (accessor g.dungeon.mobs — позиции живых).
// Клетка-цель под группой НЕ проходима (бой — через тупиковый шаг).
// Возврат: массив шагов (первый — сосед старта) или null.
function dungeonBfs(g, sx, sy, tx, ty) {
  const d = g.dungeon;
  const W = d.width;
  const floor = (x, y) => x >= 0 && y >= 0 && x < W && y < d.height
    && d.cells[y * W + x] === D.CELL_FLOOR;
  const blocked = new Set();
  for (const m of d.mobs) blocked.add(m.x + ',' + m.y);
  if (sx === tx && sy === ty) return [];
  const startKey = sx + ',' + sy;
  const visited = new Set([startKey]);
  let frontier = [{ x: sx, y: sy }];
  const prev = new Map();
  for (let i = 0; i < 400 && frontier.length; i++) {
    const next = [];
    for (const cur of frontier) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cur.x + dx, ny = cur.y + dy;
        const k = nx + ',' + ny;
        if (visited.has(k) || !floor(nx, ny)) continue;
        if (blocked.has(k)) continue; // группы — непроходимы
        visited.add(k);
        prev.set(k, cur.x + ',' + cur.y);
        if (nx === tx && ny === ty) {
          const steps = [];
          let kk = k;
          while (kk !== startKey) {
            const [px, py] = kk.split(',').map(Number);
            steps.unshift({ x: px, y: py });
            kk = prev.get(kk);
          }
          return steps;
        }
        next.push({ x: nx, y: ny });
      }
    }
    frontier = next;
  }
  return null;
}

// --- Путь к клетке: BFS-реплан на КАЖДЫЙ шаг; нет пути (цель под
// группой / коридор занят) — тупиковый шаг в сторону цели (или
// любой floor-сосед), продвигающий wanderStep; группа на клетке
// шага → бой → победа → реплан. Бюджет — число шагов.
function dungeonWalkTo(h, G, g, tx, ty, budget) {
  for (let i = 0; i < budget; i++) {
    if (g.dungeon.x === tx && g.dungeon.y === ty) return true;
    const plan = dungeonBfs(g, g.dungeon.x, g.dungeon.y, tx, ty);
    let step;
    if (plan && plan.length) {
      step = plan[0];
    } else {
      const d = g.dungeon;
      const W = d.width;
      const floor = (x, y) => x >= 0 && y >= 0 && x < W && y < d.height
        && d.cells[y * W + x] === D.CELL_FLOOR;
      const cands = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .map(([dx, dy]) => ({ x: g.dungeon.x + dx, y: g.dungeon.y + dy }))
        .filter((p) => floor(p.x, p.y));
      assert.ok(cands.length, 'сценарий: не в глухом углу стен');
      cands.sort((a, b) =>
        (Math.abs(a.x - tx) + Math.abs(a.y - ty))
        - (Math.abs(b.x - tx) + Math.abs(b.y - ty)));
      step = cands[0];
    }
    stepDungeon(h, step.x, step.y);
    if (G.combatUI.isActive()) winCombat(h, G, G.combatUI.current());
  }
  return g.dungeon.x === tx && g.dungeon.y === ty;
}

// --- Флоор-сосед клетки (для «отойти и вернуться») ---
function neighborFloor(g, x, y) {
  const d = g.dungeon;
  const W = d.width;
  const floor = (px, py) => px >= 0 && py >= 0 && px < W && py < d.height
    && d.cells[py * W + px] === D.CELL_FLOOR;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (floor(x + dx, y + dy)) return { x: x + dx, y: y + dy };
  }
  assert.fail('сценарий: нет floor-соседа у (' + x + ',' + y + ')');
}

// --- Доходка к сундуку с гарантией открытия: если группа заняла
// клетку сундука и бой «съел» шаг (сундук не открылся) — отойти на
// соседний floor и вернуться. Возврат: { delta } по золоту.
function arriveAtChest(h, G, g, c, budget) {
  const before = g.dungeon.chests;
  const gold0 = g.state.hero.gold;
  let guard = 0;
  while (g.dungeon.chests !== before - 1 && guard++ < 6) {
    if (g.dungeon.x !== c.x || g.dungeon.y !== c.y) {
      assert.ok(dungeonWalkTo(h, G, g, c.x, c.y, budget),
        'сценарий: путь к сундуку (' + c.x + ',' + c.y + ')');
      continue;
    }
    const n = neighborFloor(g, c.x, c.y);
    stepDungeon(h, n.x, n.y);
    if (G.combatUI.isActive()) winCombat(h, G, G.combatUI.current());
    stepDungeon(h, c.x, c.y);
    if (G.combatUI.isActive()) winCombat(h, G, G.combatUI.current());
  }
  assert.equal(g.dungeon.chests, before - 1,
    'сундук (' + c.x + ',' + c.y + ') открыт');
  return { delta: g.state.hero.gold - gold0 };
}

// --- Победа над ближайшей живой группой (путь к её клетке; бой —
// на приходе; группа сбежала — реплан). Возврат: true.
function killNearestGroup(h, G, g, budget) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const mobs = g.dungeon.mobs;
    assert.ok(mobs.length, 'сценарий: живые группы есть');
    const cur = { x: g.dungeon.x, y: g.dungeon.y };
    const t = [...mobs].sort((a, b) =>
      (Math.abs(a.x - cur.x) + Math.abs(a.y - cur.y))
      - (Math.abs(b.x - cur.x) + Math.abs(b.y - cur.y)))[0];
    const before = mobs.length;
    dungeonWalkTo(h, G, g, t.x, t.y, budget);
    if (g.dungeon.mobs.length < before) return true;
  }
  assert.fail('сценарий: группа не повержена за бюджет');
}

test('RD-1: re-loot e2e — содержимое этажа переживает «перезагрузку»', async () => {
  const h = await boot(seedSave({
    day: 7,
    position: { x: CAVE.x, y: CAVE.y },
  }));
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: ' + h.errors.join('; '));
  assertRestored(h, 7);
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  // Герой на пещере; подземелье НЕ активно (вход — на world-шаге).
  assert.ok(g.dungeon == null, 'после boot подземелья нет (вход — на шаге)');
  assert.equal(g.state.hero.gold, 100, 'hero-дефолт (gold 100)');
  let now = 1000;
  // Шаг ВЫХОД с пещерного тайла и НАЗАД — авто-вход.
  now = walkTiles(h, now, [[OUT_TILE.x, OUT_TILE.y]]);
  now = walkTiles(h, now, [[CAVE.x, CAVE.y]]);
  assert.ok(g.dungeon, 'авто-вход в пещеру (world-step)');
  assert.equal(g.dungeon.depth, 1, 'depth = 1 (первый этаж)');
  assert.equal(g.dungeon.chests, N_CHESTS, 'сундуки — полный набор');
  assert.equal(g.dungeon.mobs.length, N_GROUPS, 'группы — полный набор');
  // К ближайшему сундуку c1 (13,4, gold 20) — открывается ОДИН раз.
  const gold0 = g.state.hero.gold;
  const arr = arriveAtChest(h, G, g, CHEST1, 120);
  assert.equal(arr.delta, CHEST1.gold,
    'сундук: +' + CHEST1.gold + ' золота (один раз)');
  // Победа над одной группой.
  killNearestGroup(h, G, g, 80);
  // In-flight сейв (герой в подземелье).
  fireBeforeUnload(h);
  const saved = readSave(h);
  assert.equal(saved.version, 1, 'версия НЕ повышена (неломкость)');
  assert.ok(saved.data.dungeonMemory,
    'раздел dungeonMemory в сейве (фикс re-loot)');
  const rec = saved.data.dungeonMemory[MEM_KEY];
  assert.ok(rec, 'запись пещеры ' + MEM_KEY);
  assert.equal(rec.lastVisitDay, 7, 'lastVisitDay = день мира');
  assert.ok(Number.isInteger(rec.contents.step) && rec.contents.step >= 0,
    'contents.step сохранён (ход продолжается с него)');
  const c1 = rec.contents.chests.find((c) => c.id === CHEST1.id);
  assert.ok(c1 && c1.opened === true, 'сундук c1 в сейве — открыт');
  assert.ok(rec.contents.mobs.some((m) => m.defeated === true),
    'побеждённая группа в сейве — defeated');
  assert.ok(rec.pos && Number.isInteger(rec.pos.x)
    && Number.isInteger(rec.pos.y),
    'in-flight сейв — позиция героя (pos)');
  assert.ok(replicaFloor(rec.pos.x, rec.pos.y),
    'pos — FLOOR-клетка пещеры');
  assert.ok(saved.data.hero.gold >= gold0 + CHEST1.gold,
    'золото сохранено (минимум ' + (gold0 + CHEST1.gold)
    + ' = сундук; +боевой лут)');
  assert.equal(saved.data.hero.gold, g.state.hero.gold,
    'золото сейва = золоту героя в момент сейва');

  // --- «Перезагрузка» ---
  const h2 = await boot(saved);
  assertRestored(h2, 7);
  const g2 = h2.sandbox.__game;
  const G2 = h2.sandbox.Game;
  assert.equal(g2.state.hero.gold, saved.data.hero.gold,
    'золото НЕ удвоено после перезагрузки');
  assert.equal(g2.state.hero.xp, saved.data.hero.xp,
    'XP не удвоено после перезагрузки (000191.7: ТЗ описывает эксплойт '
    + 'gold/item/XP, флагманский пин держал только золото)');
  let now2 = 1000;
  now2 = walkTiles(h2, now2, [[OUT_TILE.x, OUT_TILE.y]]);
  now2 = walkTiles(h2, now2, [[CAVE.x, CAVE.y]]);
  assert.ok(g2.dungeon, 'повторный вход через мир');
  assert.equal(g2.dungeon.depth, 1, 'depth = 1');
  const savedOpen = rec.contents.chests.filter((c) => c.opened).length;
  const savedDef = rec.contents.mobs.filter((m) => m.defeated).length;
  assert.equal(g2.dungeon.chests, N_CHESTS - savedOpen,
    'открытый сундук НЕ открывается повторно (re-loot закрыт)');
  assert.equal(g2.dungeon.mobs.length, N_GROUPS - savedDef,
    'побеждённая группа не оживает');
  // Шаг на ОТКРЫТЫЙ сундук: Δgold === 0.
  const gold2 = g2.state.hero.gold;
  assert.ok(dungeonWalkTo(h2, G2, g2, CHEST1.x, CHEST1.y, 120),
    'сценарий: путь к открытому сундуку');
  assert.equal(g2.state.hero.gold, gold2,
    'открытый сундук — больше не даёт золота (re-loot закрыт)');
  assert.ok(g2.dungeon.mobs.length <= N_GROUPS - savedDef,
    'группы не оживли по ходу');
});

test('RD-2: старый сейв без dungeonMemory: без ошибок/warn, новый пишет {}', async () => {
  const h = await boot(seedSave({
    day: 7,
    position: { x: 0, y: 0 },
  }));
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: ' + h.errors.join('; '));
  assertRestored(h, 7);
  assert.ok(!h.warns.some((m) => m.includes('dungeonMemory')),
    'нет предупреждения об отсутствующем разделе: ' + h.warns.join(' | '));
  fireBeforeUnload(h);
  const saved = readSave(h);
  assert.equal(saved.version, 1, 'версия НЕ повышена');
  assert.deepEqual(saved.data.dungeonMemory, {},
    'раздел пишется ВСЕГДА ({} — памяти нет)');
});

test('RD-3: restore раздела + re-anchor спавна из pos', async () => {
  const { contents } = dungeonReplica();
  const contents3 = JSON.parse(JSON.stringify(contents));
  contents3.chests[0].opened = true; // c0 (21,11) — открыт
  contents3.mobs[0].defeated = true; // g0 (12,5) — побеждена
  contents3.step = 3;
  const POS = { x: 6, y: 15 }; // FLOOR ≠ entrance (5,15) — предвычислено
  assert.ok(replicaFloor(POS.x, POS.y), 'преконтрак: pos — FLOOR');
  const h = await boot(seedSave({
    day: 7,
    position: { x: CAVE.x, y: CAVE.y },
    dungeonMemory: {
      [MEM_KEY]: { contents: contents3, lastVisitDay: 7, pos: POS },
    },
  }));
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: ' + h.errors.join('; '));
  assertRestored(h, 7);
  const g = h.sandbox.__game;
  let now = 1000;
  now = walkTiles(h, now, [[OUT_TILE.x, OUT_TILE.y]]);
  now = walkTiles(h, now, [[CAVE.x, CAVE.y]]);
  assert.ok(g.dungeon, 'авто-вход (1-й)');
  assert.equal(g.dungeon.depth, 1, 'depth = 1');
  assert.deepEqual({ x: g.dungeon.x, y: g.dungeon.y }, POS,
    'спавн — из сохранённого pos (не entrance)');
  assert.equal(g.dungeon.chests, N_CHESTS - 1, 'открытый сундук — открыт');
  assert.equal(g.dungeon.mobs.length, N_GROUPS - 1,
    'побеждённая группа — отсутствует');
});

test('RD-4: обрезка истёкшей записи раздела (e2e)', async () => {
  const { contents } = dungeonReplica();
  const contentsJ = JSON.parse(JSON.stringify(contents));
  const VALID_KEY = '18,14:1'; // lastVisitDay 7 — валидная запись
  const h = await boot(seedSave({
    day: 7,
    position: { x: CAVE.x, y: CAVE.y },
    dungeonMemory: {
      // истёкшая: lastVisitDay 3, окно 3 → 7−3 = 4 > 3 — обрезается
      [MEM_KEY]: { contents: contentsJ, lastVisitDay: 3 },
      [VALID_KEY]: { contents: contentsJ, lastVisitDay: 7 },
    },
  }));
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: ' + h.errors.join('; '));
  assertRestored(h, 7);
  fireBeforeUnload(h);
  const saved = readSave(h);
  assert.equal(saved.version, 1, 'версия НЕ повышена');
  assert.ok(saved.data.dungeonMemory, 'раздел dungeonMemory пишется');
  assert.ok(!saved.data.dungeonMemory[MEM_KEY],
    'истёкшая запись (lastVisitDay 3, окно 3) — обрезана');
  assert.ok(saved.data.dungeonMemory[VALID_KEY],
    'валидная запись (lastVisitDay 7) — сохранена');
});

// --- Правки по итогам ревью 000153.01 (RD-5/RD-6) ---
// Ревью-файндинг (minor): (1) сундук с «призрак»-id предмета (id
// удалён из каталога МЕЖДУ сборками — содержимое сундуков теперь
// персистируется в сейве) — G.getItem → null → TypeError в пути
// keydown/touch (it.name на null, dungeonOnMove main.js); нажатие
// теряется, а сундук уже открыт и gold начислен. Паттерн-защита —
// buyItem (items.js: !it → ok:false). (2) debug-вход с вынужденным
// terrain ≠ terrain тайла (g.actions.enterDungeon(N)) создаёт
// подземелье чужой формы/типа под мирским ключом 'x,y:1' — запись
// переживает перезагрузку и мирской вход читает контент вне сетки.
// Поправка: ds.memoryBanned — exitDungeon + activeDungeonMemoryRec
// (main.js) пропускают запись.

// Призрак-предмет: id, которого НЕТ в каталоге assets/items.
const GHOST_ITEM = 'ghost_item_000153';

test('RD-5: сундук с призрак-предметом (id вне каталога) — открывается, gold начислен, предмета нет, БЕЗ TypeError (ревью 000153.01)', async () => {
  const { contents } = dungeonReplica();
  const contentsJ = JSON.parse(JSON.stringify(contents));
  contentsJ.chests[1].item = GHOST_ITEM; // c1 (13,4): открыт=false, item — призрак
  const h = await boot(seedSave({
    day: 7,
    position: { x: CAVE.x, y: CAVE.y },
    dungeonMemory: {
      [MEM_KEY]: { contents: contentsJ, lastVisitDay: 7 },
    },
  }));
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: ' + h.errors.join('; '));
  assertRestored(h, 7);
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  assert.equal(G.getItem(GHOST_ITEM), null,
    'преконтрак: id НЕТ в каталоге assets/items (призрак)');
  let now = 1000;
  now = walkTiles(h, now, [[OUT_TILE.x, OUT_TILE.y]]);
  now = walkTiles(h, now, [[CAVE.x, CAVE.y]]);
  assert.ok(g.dungeon, 'авто-вход (world-step)');
  assert.equal(g.dungeon.chests, N_CHESTS,
    'сундуки — полный набор (c1 ещё не открыт)');
  const invCount0 = g.state.hero.inventory.length;
  // Шаг на сундук: ДО поправки — TypeError (it.name на null) в
  // keydown-обработчике (тест падал бы на stepDungeon); ПОСЛЕ —
  // сундук открыт, gold начислен, предмет-призрак молча не
  // начисляется (паттерн buyItem).
  const arr = arriveAtChest(h, G, g, CHEST1, 120);
  assert.equal(arr.delta, CHEST1.gold,
    'сундук: +' + CHEST1.gold + ' золота (один раз; призрак не ломает открытие)');
  assert.equal(g.state.hero.inventory.length, invCount0,
    'призрак-предмет НЕ начислен (число слотов не изменилось)');
  assert.ok(!g.state.hero.inventory.some((s) => s.id === GHOST_ITEM),
    'призрак-id не появился в инвентаре');
});

test('RD-6: debug-вход с вынужденным terrain ≠ тайла — чужой контент НЕ в разделе dungeonMemory (ревью 000153.01)', async () => {
  const h = await boot(seedSave({ day: 7, position: { x: 0, y: 0 } }));
  assert.equal(h.errors.length, 0, 'ошибок загрузки нет: ' + h.errors.join('; '));
  assertRestored(h, 7);
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  assert.ok(g.state.player.x === 0 && g.state.player.y === 0,
    'сценарий: герой на спавне (0,0) — тайл GRASS (3)');
  // (а) Вынужденный terrain SWAMP (7) ≠ GRASS (3) → DROWNED 27×27 —
  //     контент ЧУЖОЙ формы под мирским ключом '0,0:1'.
  const ds = g.actions.enterDungeon(M.TERRAIN.SWAMP);
  assert.ok(ds, 'debug-вход (вынужденный terrain SWAMP)');
  assert.equal(ds.memoryBanned, true, 'вынужденный terrain — memoryBanned');
  assert.equal(g.dungeon.type, D.DUNGEON_TYPES.DROWNED,
    'вынужденный terrain → DROWNED (не CAVE тайла)');
  // In-flight сейв (герой в подземелье): activeRec НЕ мержится.
  fireBeforeUnload(h);
  let saved = readSave(h);
  assert.equal(saved.version, 1, 'версия НЕ повышена');
  assert.deepEqual(saved.data.dungeonMemory, {},
    'in-flight: записи под мирским ключом НЕТ (memoryBanned)');
  // (б) [E]-выход: запись на выходе тоже не пишется; ДЕНЬ проходит
  //     (D5 — проводка не меняется).
  const dayBeforeExit = g.state.day;
  const e = press(h, 'KeyE');
  release(h, e);
  assert.equal(g.dungeon, null, '[E] — выход');
  assert.equal(g.state.day, dayBeforeExit + 1, 'на выходе ДЕНЬ проходит (D5)');
  saved = readSave(h);
  assert.deepEqual(saved.data.dungeonMemory, {},
    'после выхода: записи под мирским ключом 0,0:1 НЕТ ' +
    '(иначе переживёт перезагрузку → мирской вход сломан)');
  // (в) Debug-вход БЕЗ аргумента (terrain = тайла) — запись СОХРАНЯЕТСЯ
  //     (поведение master / §5.3: контент = как у мирского входа).
  const ds2 = g.actions.enterDungeon();
  assert.ok(ds2, 'debug-вход (без аргумента)');
  assert.ok(!ds2.memoryBanned, 'terrain = тайла — без memoryBanned');
  const e2 = press(h, 'KeyE');
  release(h, e2);
  assert.equal(g.dungeon, null, '[E] — выход (2)');
  saved = readSave(h);
  const rec = saved.data.dungeonMemory['0,0:1'];
  assert.ok(rec, 'debug-вход без аргумента — запись пишется (сохранено)');
  // Запись пишется с днём ВЫЕЗДКИ (o.day — до clock.event), выход
  // забирает день → lastVisitDay = day − 1.
  assert.equal(rec.lastVisitDay, g.state.day - 1,
    'lastVisitDay = день вылазки (перед тем, как выход забрал день)');
});

// 000191 — ретро-покрытие (retro-20261012): явно битый dungeonMemory
// (контракт warn + сброс не покрыт) и live-чтение dungeon_memory_days
// (зафиксировано только default 3).

test('000191.8: явно битый dungeonMemory (non-object) — console.warn «dungeonMemory» + сброс; после сейва раздел {}; массив — то же; «ключи есть, валидных 0» — warn «валидных записей нет»', async () => {
  // (а) Строка (non-object).
  {
    const h = await boot(seedSave({ day: 7, dungeonMemory: 'junk' }));
    assert.equal(h.errors.length, 0,
      'без console.error (fail-open): ' + h.errors.join('; '));
    assert.ok(h.warns.some((m) => m.includes('dungeonMemory')),
      'warn содержит «dungeonMemory»: ' + JSON.stringify(h.warns));
    fireBeforeUnload(h);
    assert.deepEqual(readSave(h).data.dungeonMemory, {},
      'после save раздел {} (сброшенный Map пуст)');
  }
  // (б) Массив (Array.isArray — тоже non-object-ветка).
  {
    const h = await boot(seedSave({ day: 7, dungeonMemory: [1, 2] }));
    assert.equal(h.errors.length, 0,
      'без console.error (fail-open): ' + h.errors.join('; '));
    assert.ok(h.warns.some((m) => m.includes('dungeonMemory')),
      'warn содержит «dungeonMemory»: ' + JSON.stringify(h.warns));
    fireBeforeUnload(h);
    assert.deepEqual(readSave(h).data.dungeonMemory, {},
      'после save раздел {}');
  }
  // (в) Ключи есть, валидных 0 (lastVisitDay не целое — запись
  //     отбрасывается restoreDungeonMemory тихо; main.js печатает warn).
  {
    const h = await boot(seedSave({
      day: 7,
      dungeonMemory: {
        [MEM_KEY]: {
          contents: JSON.parse(JSON.stringify(REPLICA.contents)),
          lastVisitDay: 'junk',
        },
      },
    }));
    assert.equal(h.errors.length, 0,
      'без console.error (fail-open): ' + h.errors.join('; '));
    assert.ok(h.warns.some((m) => m.includes('валидных записей нет')),
      'warn «валидных записей нет»: ' + JSON.stringify(h.warns));
    fireBeforeUnload(h);
    assert.deepEqual(readSave(h).data.dungeonMemory, {},
      'после save раздел {} (live-Map пуст после trim)');
  }
});

test('000191.9: live-чтение dungeon_memory_days (SETTINGS — в момент вызова): (а) = 9 — запись (lastVisitDay = day − 4) валидна: содержимое ВОССТАНОВЛЕНО (не fresh) и в сейве (lastVisitDay = day); (б) = 2.5 (не integer) — fallback 3: запись истекла → warn «валидных записей нет», save {}', async () => {
  // Контент записи: реплика с ОДНИМ открытым сундуком и ОДНОЙ
  // побеждённой группой — fresh-подвал их НЕ даст (дискриминация
  // «восстановлено vs перегенерировано»).
  const modifiedContents = () => {
    const c = JSON.parse(JSON.stringify(REPLICA.contents));
    c.chests[0].opened = true;
    c.mobs[0].defeated = true;
    return c;
  };
  const seed = () => seedSave({
    day: 7,
    position: { x: CAVE.x, y: CAVE.y },
    dungeonMemory: {
      [MEM_KEY]: { contents: modifiedContents(), lastVisitDay: 3 },
    },
  });
  // (а) SETTINGS.dungeon_memory_days = 9 (до drains — restore читает
  //     live-объект в момент вызова; main.js G — тот же объект).
  {
    const h = bootSandbox(seed());
    h.sandbox.Game.GlobalSettings.SETTINGS.dungeon_memory_days = 9;
    await drain();
    await drain();
    await drain();
    h.frameFn = h.raf[h.raf.length - 1];
    assert.equal(h.errors.length, 0,
      'без console.error: ' + h.errors.join('; '));
    assertRestored(h, 7);
    const g = h.sandbox.__game;
    assert.ok(g.dungeon == null, 'до входа подземелья нет (вход — на шаге)');
    let now = walkTiles(h, 1000, [[OUT_TILE.x, OUT_TILE.y]]);
    now = walkTiles(h, now, [[CAVE.x, CAVE.y]]);
    assert.ok(g.dungeon, 'авто-вход в пещеру (world-step)');
    // 7 − 3 = 4 < 9 → запись валидна: ВОССТАНОВЛЕНО, не fresh.
    assert.equal(g.dungeon.chests, N_CHESTS - 1,
      'содержимое ВОССТАНОВЛЕНО (сундук в сейве — уже открыт); '
      + 'fresh-подвал дал бы ' + N_CHESTS);
    assert.equal(g.dungeon.mobs.length, N_GROUPS - 1,
      'содержимое ВОССТАНОВЛЕНО (группа в сейве — уже побеждена)');
    fireBeforeUnload(h);
    const saved = readSave(h);
    const rec = saved.data.dungeonMemory[MEM_KEY];
    assert.ok(rec, 'запись в сейве (live-Map — не обрезана при 9 днях)');
    assert.equal(rec.lastVisitDay, 7,
      'lastVisitDay = день (продлён при входе)');
    assert.equal(rec.contents.chests.filter((c) => c.opened).length, 1,
      'содержимое сейва — восстановленное (сундук открыт)');
  }
  // (б) SETTINGS.dungeon_memory_days = 2.5 — Number, но не integer →
  //     Number.isInteger-гард → fallback 3: 7 − 3 = 4 > 3 → обрезка.
  {
    const h = bootSandbox(seed());
    h.sandbox.Game.GlobalSettings.SETTINGS.dungeon_memory_days = 2.5;
    await drain();
    await drain();
    await drain();
    h.frameFn = h.raf[h.raf.length - 1];
    assert.equal(h.errors.length, 0,
      'без console.error: ' + h.errors.join('; '));
    assert.ok(h.warns.some((m) => m.includes('валидных записей нет')),
      'fallback 3: запись истекла (4 > 3) → warn «валидных записей нет»: '
      + JSON.stringify(h.warns));
    // Без входа — запись НЕ создаётся заново: live-Map пуст.
    fireBeforeUnload(h);
    assert.deepEqual(readSave(h).data.dungeonMemory, {},
      'save {} (live-Map пуст после trim; входа не было)');
  }
});

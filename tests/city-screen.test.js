// Задача 000105: вход/выход в город и экран города (подзадача 000052, П1).
//
// Структурные интеграционные тесты: исполняем ВЕСЬ <script>-цепочку из
// index.html в vm-песочнице (паттерн tests/main-visuals.test.js:
// DOM/WebGL/Image-стабы, детерминированный мир — assets/map.png всегда
// onerror → G.generateSeedPixels), ведём героя пешком к входу города /
// пещеры (BFS + keydown + кадры frame(now), как в игре) и проверяем:
//   * enterCity: шаг на входной тайл категории «город» →
//     dungeonState.kind 'city', имя — название_карты каталога,
//     герой остаётся на входном тайле, dungeonUI активен;
//   * layout — от G.Cities.createCityLayout (000104) от ЯКОРЯ
//     (t.buildingAnchor), а не от позиции героя: цель выбирается
//     динамически — многотайловый город, у которого layout от якоря
//     ОТЛИЧАЕТСЯ от layout от входного тайла (иначе сценарий
//     неразличим);
//   * exitCity: [E] на ЕДИНОМ тайле-двери (000177: вход = выход,
//     спавн на двери) → состояние снято, герой на входном тайле
//     города, saveNow вызван (localStorage-стаб), ДЕНЬ НЕ проходит
//     (регрессия-фиксатор против переноса clock.event('dungeon'));
//   * подземелье (РЕГРЕССИЯ): kind 'dungeon', имя — DUNGEON_NAMES,
//     выход — [E] на едином тайле (000177), ДЕНЬ ПРОХОДИТ
//     (существующее поведение — взаимный фиксатор с городом);
//   * кадры main.js ПОСЛЕ входа в город не падают (hudUpdate —
//     city-ветка; contents у города null) — HUD показывает
//     заголовок города.
//
// Расширение песочницы относительно main-visuals: 2d-контекст с
// drawCalls — и для ДИНАМИЧЕСКИ созданных canvas (оверлей
// dungeon-ui), и window.localStorage-стаб (наблюдение saveNow).
//
// Мир детерминирован (фикс. сид generateSeedPixels); цели ищутся
// ДИНАМИЧЕСКИ (BFS от спавна, обход групп мобов и входов пещер/
// городов как промежуточных узлов), чтобы пережить будущие
// ре-пины; радиус BFS 600 с явным ассертом-ошибкой сценария.
// Ход безопасен: BFS исключает тайлы групп мобов (startCombat
// остановил бы мир) и входов пещер/городов (авто-вход). Выход из
// города/подземелья (000177) — [E] на ЕДИНОМ тайле-двери (спавн
// сразу на нём), шагов ВНУТРИ layout к layout.exit нет.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

// Цепочка скриптов — из index.html (не хардкод, паттерн main-visuals).
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));

// Окно «браузера» песочницы.
const VIEW_W = 1280;
const VIEW_H = 720;
// Фиксированное время performance.now (анимации детерминированы;
// кадры frame(now) вызываем с управляемым now, как main-visuals).
const NOW = 1000;

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

// --- Canvas 2D-стаб: каждый ВЫЗОВ метода → el.drawCalls как
// [имя, args, fillStyle] (fillStyle на момент вызова) ---

function makeContext2d(el) {
  const calls = el.drawCalls = [];
  let fillStyle = null;
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => {
      calls.push([k, args, fillStyle]);
    }),
    set: (t, k, v) => {
      if (k === 'fillStyle') fillStyle = v;
      t[k] = v;
      return true;
    },
  });
}

// --- Снисходительный DOM-элемент. Canvas — с РЕАЛЬНЫМИ width/height
// и getContext('2d') (оверлей dungeon-ui создаёт canvas динамически:
// без 2d-контекса render упадёт на g2.fillStyle) ---

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
    target.width = 0;
    target.height = 0;
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

// --- localStorage-стаб (наблюдение saveNow, src/save.js) ---

function makeStorage() {
  const store = {};
  return {
    store,
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k)
      ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
}

// --- Песочница: вся цепочка index.html (браузерная ветка UMD) ---

function bootSandbox(seedData) {
  const winListeners = {};
  const raf = [];
  const warns = [];
  const errors = [];
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
  // #game — WebGL (без него main.js уходит в фолбэк-ветку и не стартует);
  // #sprites — 2d со спаем (слой спрайтов).
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl() : makeContext2d(gameCanvas));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? makeContext2d(spriteCanvas) : null);
  const storage = makeStorage();
  // 000109: опциональный засеянный сейв (раздел data) — пишется ДО
  // запуска цепочки (restoreFromSave — при загрузке).
  if (seedData) {
    storage.store['phlogiston.save'] = JSON.stringify({
      version: 1,
      savedAt: new Date(0).toISOString(),
      data: seedData,
    });
  }
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
    // documentElement/requestFullscreen не заданы →
    // fullscreen.supported = false → кнопки нет (безопасно).
  };
  const window = {
    innerWidth: VIEW_W,
    innerHeight: VIEW_H,
    location: { search: '' },
    localStorage: storage,
    addEventListener: (t, f) => {
      (winListeners[t] || (winListeners[t] = [])).push(f);
    },
    removeEventListener() {},
  };
  // Image-стаб (паттерн main-visuals): src ставится ПОСЛЕ onload/onerror.
  // assets/map.png ВСЕГДА onerror → детерминированный фолбэк
  // G.generateSeedPixels (loadMapPixels, main.js); остальные — onload.
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
  };
  vm.createContext(sandbox);
  for (const f of CHAIN) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox,
      { filename: f });
  }
  return {
    sandbox, winListeners, raf, warns, errors,
    gameCanvas, spriteCanvas, hud, storage,
    // 000148.02: body — для поиска динамического canvas оверлея
    // dungeon-ui (build() → document.body.appendChild(overlay));
    // аддитивно — ни один существующий тест его не читает.
    body: document.body,
  };
}

// 000148.02: ПОСЛЕДНИЙ canvas в порядке документа в поддереве el.
// Оверлей dungeon-ui создаётся динамически (build) и добавляется в
// body ПОСЛЕДНИМ; боевой оверлей (canvas) при close() «удаляется»
// (remove() — no-op в стабе, но оверлей города создаётся позже),
// поэтому последний canvas в дереве body — canvas города. Мир-канвасы
// (#game/#sprites) НЕ в дереве body (getElementById) — изоляция.
function findLastCanvas(el) {
  let last = null;
  (function walk(n) {
    if (n && n.tagName === 'canvas') last = n;
    for (const ch of (n && n.children) || []) walk(ch);
  })(el);
  return last;
}

// Промывка микротасков (загрузки Image + loadMapPixels().then:
// создание карты, спавн, requestAnimationFrame(frame)).
const drain = () => new Promise((r) => setImmediate(r));

async function boot() {
  const h = bootSandbox();
  await drain();
  await drain();
  await drain();
  const g = h.sandbox.__game;
  assert.ok(g, 'globalThis.__game выставлен (main.js выполнен)');
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет (порядок цепочки): ' + h.errors.join('; '));
  // frame() main.js — единственный rAF-колбэк после старта; frame
  // пере планирует себя (одна и та же функция), поэтому frameFn
  // валидна на любом моменте. Кадр вызываем ЕЁ (dungeon-ui tick
  // после входа в город/подземелье тоже живёт в rAF, но кадр
  // main.js обязан идти — в нём hudUpdate/цикл дня).
  h.frameFn = h.raf[h.raf.length - 1];
  return h;
}

// 000109: песочница с засеянным сейвом (раздел data: day, cities,
// hero) — тот же boot, данные записаны ДО запуска цепочки.
async function bootSeeded(seedData) {
  const h = bootSandbox(seedData);
  await drain();
  await drain();
  await drain();
  const g = h.sandbox.__game;
  assert.ok(g, 'globalThis.__game выставлен (main.js выполнен)');
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет (порядок цепочки): ' + h.errors.join('; '));
  h.frameFn = h.raf[h.raf.length - 1];
  return h;
}

// --- Ходьба по миру (паттерн walkToMulti, tests/main-visuals.test.js) ---
//
// Каждый шаг — как в игре: keydown(направление) → кадры frame(now)
// по +200 мс, пока игрок фактически не перешёл (tryMove выполняется
// в frame при now−lastMove ≥ stepMs; базовый stepMs = 420 мс —
// глобальные настройки, 000063) → keyup. Кадр делает не более
// ОДНОГО хода — перелёта через целевой тайл быть не может.

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
  for (const fn of h.winListeners['keydown'] || []) fn(e);
  return e;
}

function release(h, e) {
  for (const fn of h.winListeners['keyup'] || []) fn(e);
}

function walkTiles(h, now, tiles) {
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  for (const [tx, ty] of tiles) {
    const dx = tx - g.state.player.x, dy = ty - g.state.player.y;
    assert.ok(Math.abs(dx) + Math.abs(dy) === 1, 'BFS: шаг по соседнему тайлу');
    const e = press(h, keydownFor(dx, dy));
    // Лимит 10 кадров = 2 с: закрывает любой интервал шага от
    // MIN_MOVE_INTERVAL_MS (60 мс) и выше.
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
    // 000135: маршрут к городу/постройке может пересечь 5×5-зону
    // триггерящей группы — авторазрешение zone-боя после КАЖДОГО
    // шага (мобы 9999 → Space; Эфир НЕ убиваем — отличие от
    // resolveCombatVictory), без него inCombat заморозит tryMove.
    // Ассерты тестов — про HUD/город, не про бой.
    if (G.combatUI.isActive()) {
      const c = G.combatUI.current();
      for (const m of c.units.filter((x) => x.side === 'mob'
          && x.alive)) {
        G.combatInternals.dealDamageToMob(c, m, 9999);
      }
      assert.ok(c.result && c.result.outcome === 'victory',
        '000135: zone-бой по маршруту — победа');
      G.combatUI.handleCode('Space');
      assert.equal(G.combatUI.isActive(), false,
        '000135: zone-бой закрыт (Space → finish)');
    }
  }
  // Осадочные кадры (глейд мувера и сглаживание камеры завершаются).
  for (let i = 0; i < 4; i++) {
    now += 200;
    h.frameFn(now);
  }
  return now;
}

// BFS по миру до ближайшего тайла с целевым свойством. Промежуточные
// узлы: только passable, БЕЗ групп мобов (шаг = startCombat — мир
// остановится) и БЕЗ входов пещер/городов (шаг = авто-вход — сломает
// протокол; целевой тайл — проверка до исключения).
function findNearest(G, myMap, start, isTarget, radius = 600) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const startKey = start.x + ',' + start.y;
  const visited = new Set([startKey]);
  let frontier = [start];
  const prev = new Map();
  for (let depth = 0; depth < radius && frontier.length; depth++) {
    const next = [];
    for (const cur of frontier) {
      for (const [dx, dy] of DIRS) {
        const nx = cur.x + dx, ny = cur.y + dy;
        const k = nx + ',' + ny;
        if (visited.has(k)) continue;
        const t = myMap.tileAt(nx, ny);
        if (!t.passable || t.hasMobGroup) continue;
        visited.add(k);
        prev.set(k, cur.x + ',' + cur.y);
        if (isTarget(t)) {
          const steps = [];
          let kk = k;
          while (kk !== startKey) {
            const [px, py] = kk.split(',').map(Number);
            steps.unshift([px, py]);
            kk = prev.get(kk);
          }
          return { target: { x: nx, y: ny }, t, steps, depth };
        }
        // Задача 000073: город — по building = NONE (до 000073 —
        // buildingId != null; слотовые 8..12 тоже получили buildingId
        // — подтип, и старое условие сделало бы ВСЕ слотовые входы
        // непроходимыми для BFS). Слотовые входы — не авто-вход
        // (подземелье/город), путь может через них идти — как до
        // задачи.
        if (t.hasBuilding
            && (t.building === G.BUILDING_TYPES.CAVE_ENTRANCE
                || t.building === G.BUILDING_TYPES.NONE)) continue;
        next.push({ x: nx, y: ny });
      }
    }
    frontier = next;
  }
  return null;
}

// Городской вход: hasBuilding && buildingId != null && категория
// «город» (каталожная запись, НЕ хардкод id 51..54).
function isCity(G, t) {
  if (!t.hasBuilding || t.buildingId == null) return false;
  const rec = G.getBuilding(t.buildingId);
  return !!rec && rec.категория === 'город';
}

// Многотайловый город, у которого layout от ЯКОРЯ отличается от
// layout от входного тайла (сценарий «якорь, не позиция героя»
// различим): anchor ≠ entrance только у footprint ≥ 2.
function isDistinguishableCity(G, t) {
  if (!isCity(G, t)) return false;
  const fp = G.getBuilding(t.buildingId).размер.ширина;
  if (fp < 2) return false;
  const [ax, ay] = t.buildingAnchor;
  return JSON.stringify(G.Cities.createCityLayout(ax, ay, fp))
      !== JSON.stringify(G.Cities.createCityLayout(t.x, t.y, fp));
}

// --- Тесты ---

test('город 000105: вход — шаг на входной тайл (категория «город») → kind city, имя — название_карты, герой на входном тайле', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findNearest(G, myMap, g.state.player, (t) => isCity(G, t));
  assert.ok(found,
    'сценарий: город достижим пешком от спавна (BFS, мир детерминирован)');
  const rec = G.getBuilding(found.t.buildingId);
  assert.equal(rec.категория, 'город', 'сценарий: цель — категория «город»');
  walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg,
    'после шага на входной тайл — dungeonState установлена (экран города)');
  assert.equal(dg.kind, 'city', 'dungeonState.kind === «city»');
  assert.equal(dg.name, rec.особые_параметры.название_карты,
    'имя города — название_карты каталога');
  // Контракт __game.dungeon для города (ревью 000105, раунд 1):
  // type — null (у layout города поля type нет; НЕ undefined —
  // JSON-сериализация drop'ит undefined), mobs/chests — null
  // (contents у города null).
  assert.equal(dg.type, null,
    'город: type — null (у layout города нет поля type)');
  assert.equal(dg.mobs, null, 'город: mobs — null (contents null)');
  assert.equal(dg.chests, null, 'город: chests — null (contents null)');
  assert.equal(G.dungeonUI.isActive(), true, 'dungeonUI активен (режим города)');
  assert.deepEqual({ x: g.state.player.x, y: g.state.player.y },
    found.target, 'мировой герой остаётся на входном тайле города');
});

test('город 000105: layout — от createCityLayout(якорь, footprint), а не от позиции героя; width = cityLayoutSize(footprint)', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findNearest(G, myMap, g.state.player, (t) => isDistinguishableCity(G, t));
  assert.ok(found,
    'сценарий: достижим многотайловый город, у которого layout от якоря '
    + 'отличается от layout от входного тайла');
  const [ax, ay] = found.t.buildingAnchor;
  assert.ok(ax !== found.target.x || ay !== found.target.y,
    'предусловие: якорь ≠ тайл входа (многотайловый город)');
  walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg, 'в городе');
  const rec = G.getBuilding(found.t.buildingId);
  const fp = rec.размер.ширина;
  const L = G.Cities.createCityLayout(ax, ay, fp);
  const Lhero = G.Cities.createCityLayout(found.target.x, found.target.y, fp);
  assert.notEqual(JSON.stringify(L), JSON.stringify(Lhero),
    'сценарий: для этого якоря layout от якоря ≠ layout от позиции героя');
  assert.equal(dg.width, L.width, 'width = createCityLayout(якорь).width');
  assert.equal(dg.height, L.height, 'height = createCityLayout(якорь).height');
  for (let i = 0; i < L.cells.length; i++) {
    assert.equal(dg.cells[i], L.cells[i], 'cells[' + i + '] = layout.cells');
  }
  assert.equal(dg.entrance.x, L.entrance.x, 'entrance.x = layout.entrance');
  assert.equal(dg.entrance.y, L.entrance.y, 'entrance.y = layout.entrance');
  assert.equal(dg.exit.x, L.exit.x, 'exit.x = layout.exit');
  assert.equal(dg.exit.y, L.exit.y, 'exit.y = layout.exit');
  assert.equal(dg.x, L.entrance.x, 'первая клетка героя — layout.entrance (x)');
  assert.equal(dg.y, L.entrance.y, 'первая клетка героя — layout.entrance (y)');
  assert.equal(dg.width, G.Cities.cityLayoutSize(fp),
    'width = cityLayoutSize(размер.ширина)');
});

test('город 000105: выход — [E] на едином тайле (000177) → состояние снято, герой на входном тайле, saveNow, ДЕНЬ НЕ проходит', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  // Многотайловый город: спавн — НА едином тайле-двери (000177:
  // вход = выход), выход — [E] стоя на нём (шагов ВНУТРИ города
  // нет — BFS-путь к layout.exit упразднён).
  const found = findNearest(G, myMap, g.state.player, (t) => isCity(G, t)
    && G.getBuilding(t.buildingId).размер.ширина >= 2);
  assert.ok(found, 'сценарий: достижимый многотайловый город');
  const tiles = found.steps;
  let now = walkTiles(h, NOW, tiles.slice(0, -1));
  // День/шаги ДО входного шага (сравнение после выхода — «день не
  // проходит»: единственный мировой шаг между ними — вход).
  const day0 = g.state.day;
  const steps0 = g.state.stepsToday;
  now = walkTiles(h, now, [tiles[tiles.length - 1]]);
  const dg = g.dungeon;
  assert.ok(dg, 'в городе');
  assert.equal(dg.kind, 'city');
  // 000177: единый тайл — layout.exit = layout.entrance, герой
  // спавнится НА двери.
  assert.deepEqual({ x: dg.exit.x, y: dg.exit.y },
    { x: dg.entrance.x, y: dg.entrance.y },
    '000177: exit = entrance (layout)');
  assert.deepEqual({ x: dg.x, y: dg.y },
    { x: dg.exit.x, y: dg.exit.y },
    '000177: спавн на едином тайле');
  // saveNow: входной мировой шаг уже записал сейв — УДАЛЯЕМ его.
  // Внутри города saveNow не вызывает НИКАКОЙ другой путь (frame
  // сейвит только при мировом шаге, а внутри города мировых шагов
  // нет): если запись появится после выхода — это exitCity.
  delete h.storage.store['phlogiston.save'];
  // Выход (000177): [E] на едином тайле → dungeon-ui keydown →
  // ctx.onInteract → locationOnInteract → interactExit → exitCity
  // (синхронно; мировой listener гасится гардом dungeonUI.isActive).
  const e = press(h, 'KeyE');
  release(h, e);
  assert.equal(g.dungeon, null, 'после [E] на едином тайле — состояние снято');
  assert.equal(G.dungeonUI.isActive(), false, 'dungeonUI закрыт');
  assert.deepEqual({ x: g.state.player.x, y: g.state.player.y },
    found.target, 'герой — на входном тайле города (как при выходе из пещеры)');
  // ДЕНЬ (регрессия-фиксатор): город НЕ тратит день. Единственный
  // мировой шаг между day0/steps0 и выходом — входной; смена дня
  // допустима ТОЛЬКО как натуральный перенос счётчика шагов.
  const perDay = G.GlobalSettings.SETTINGS.steps_per_day;
  if (steps0 + 1 < perDay) {
    assert.equal(g.state.day, day0,
      'вход/выход из города НЕ меняют день (clock.event не переносится)');
    assert.equal(g.state.stepsToday, steps0 + 1,
      'ровно ОДИН мировой шаг (вход); шаги города мир не тикают');
  } else {
    assert.equal(g.state.day, day0 + 1,
      'смена дня — только от шагов мира (перенос счётчика)');
    assert.equal(g.state.stepsToday, (steps0 + 1) % perDay,
      'счётчик шагов — перенос, как в addStep');
  }
  // saveNow (exitCity): запись УДАЛЕНА после входа появилась снова —
  // вызвал exitCity; позиция — входной тайл; день — текущий.
  const saveText = h.storage.store['phlogiston.save'];
  assert.ok(saveText,
    'exitCity: saveNow вызван (сейв, удалённый после входа, появился после выхода)');
  const save = JSON.parse(saveText);
  assert.deepEqual(save.data.position,
    { x: found.target.x, y: found.target.y },
    'сейв: позиция — входной тайл города');
  assert.equal(save.data.day, g.state.day,
    'сейв: день — текущий (день не прошёл)');
  // HUD после выхода (ревью 000105, раунд 1): герой стоит на
  // городском тайле (мировых шагов после выхода нет) — строка
  // «Здесь: » обязана показывать ИМЯ города: у города building —
  // NONE, buildingNameUi(NONE) = '' (до фикса — пустое имя строкой
  // «Здесь: » до следующего шага). Имя — из каталожной записи
  // (название_карты || название), регистр — конвенция buildingNameUi.
  const rec = G.getBuilding(found.t.buildingId);
  const rawName = (rec.особые_параметры &&
    rec.особые_параметры.название_карты) || rec.название;
  const cityName = rawName.charAt(0).toLowerCase() + rawName.slice(1);
  for (let i = 0; i < 2; i++) {
    now += 16;
    h.frameFn(now);
  }
  const hudText = h.hud.textContent;
  assert.ok(hudText.includes('Здесь: ' + cityName),
    'HUD после выхода: «Здесь: <имя города>»: ' + JSON.stringify(hudText));
  assert.ok(!hudText.includes('Здесь: \n'),
    'HUD после выхода: нет строки «Здесь: » с пустым именем: '
    + JSON.stringify(hudText));
});

test('подземелье 000105 (регрессия): kind dungeon, имя — DUNGEON_NAMES[type]; выход — состояние снято, ДЕНЬ проходит', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  // Задача 000073: развалины (слот 9, buildingId 48) — ПОСТРОЙКА, не
  // вход: шаг на них dungeon НЕ открывает (maybeEnterDungeon-гард) —
  // сценарий сломается ДО HUD-пина. Исключаем из целей; базовая 31
  // (остальные ~80% слота 9) остаётся.
  const found = findNearest(G, myMap, g.state.player,
    (t) => t.hasBuilding &&
      t.building === G.BUILDING_TYPES.CAVE_ENTRANCE &&
      t.buildingId !== 48);
  assert.ok(found, 'сценарий: пещера достижима пешком от спавна');
  walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg, 'после шага на тайл пещеры — dungeonState');
  assert.equal(dg.kind, 'dungeon',
    'dungeonState.kind === «dungeon» (подземный путь без изменений)');
  assert.equal(dg.name, G.DUNGEON_NAMES[dg.type],
    'имя — DUNGEON_NAMES[type] (как раньше)');
  assert.equal(G.dungeonUI.isActive(), true, 'dungeonUI активен');
  assert.deepEqual({ x: g.state.player.x, y: g.state.player.y },
    found.target, 'герой — на тайле пещеры');
  // 000177: вход = выход — единый тайл (рота): герой спавнится НА
  // нём, выход — [E] стоя на нём (BFS-путь в обход мобов
  // упразднён).
  assert.deepEqual({ x: dg.exit.x, y: dg.exit.y },
    { x: dg.entrance.x, y: dg.entrance.y },
    '000177: exit = entrance (подземелье)');
  assert.deepEqual({ x: dg.x, y: dg.y },
    { x: dg.exit.x, y: dg.exit.y },
    '000177: спавн на едином тайле');
  // Реконструкция подземелья (чистая детерминированная функция;
  // те же аргументы, что main.js: тайл, пиксели фолбэка) —
  // сверка с реальным dungeonState.
  const d2 = G.createDungeon(found.target.x, found.target.y,
    G.generateSeedPixels(), found.t.terrain);
  assert.equal(d2.width, dg.width, 'реконструкция: width');
  assert.equal(d2.height, dg.height, 'реконструкция: height');
  for (let i = 0; i < d2.cells.length; i++) {
    assert.equal(d2.cells[i], dg.cells[i],
      'реконструкция: cells[' + i + '] совпадает с реальным подземельем');
  }
  assert.deepEqual({ x: d2.entrance.x, y: d2.entrance.y },
    { x: dg.entrance.x, y: dg.entrance.y }, 'реконструкция: entrance');
  assert.deepEqual({ x: d2.exit.x, y: d2.exit.y },
    { x: dg.exit.x, y: dg.exit.y }, 'реконструкция: exit (000177)');
  const dayBefore = g.state.day;
  // Выход (000177): [E] на едином тайле → dungeon-ui keydown →
  // ctx.onInteract → locationOnInteract → interactExit →
  // exitLocation (синхронно).
  const e = press(h, 'KeyE');
  release(h, e);
  assert.equal(g.dungeon, null, 'после [E] на едином тайле — состояние снято');
  assert.equal(G.dungeonUI.isActive(), false, 'dungeonUI закрыт');
  assert.equal(g.state.day, dayBefore + 1,
    'подземелье: на выходе ДЕНЬ проходит (clock.event — существующее)');
  assert.equal(g.state.stepsToday, 0, 'event() — счётчик шагов сброшен');
  // HUD после выхода из пещеры (РЕГРЕССИЯ ветки «Здесь:», переделанной
  // под города — ревью 000105, раунд 1): строка пещеры НЕ меняется —
  // имя из каталога + «(вход — шагните)». Кадр без нажатых клавиш
  // (keys пуста — мировых шагов нет): только рендер + hudUpdate.
  h.frameFn(NOW + 100000);
  const hudCave = h.hud.textContent;
  assert.ok(hudCave.includes('Здесь: вход в пещеру (вход — шагните)'),
    'HUD после выхода из пещеры: «Здесь: вход в пещеру (вход — шагните)»: '
    + JSON.stringify(hudCave));
});

// --- Задача 000073: подтипы слотов на карте — игровое поведение ---
//
// Подтипы (слот 9: 31 «вход в пещеру» 80 / 48 «развалины» 20; слот 8:
// 36 «храм солнца» 70 / 37 «храм луны» 10 / 38 «храм горы» 10 /
// 39 «заброшенный храм» 10 и т.д.) — НЕРЕЗЕРВИРУЮЩИЕ: геометрия
// (footprint/вход) — базовой записи слота, buildingId тайла — id
// записи подтипа. Игровое поведение:
//   * развалины (buildingId 48) — ПОСТРОЙКА, а не вход: шаг на тайл
//     НЕ открывает dungeon (maybeEnterDungeon-гард buildingId 48),
//     HUD — «Здесь: развалины» БЕЗ «(вход — шагните)» (подавление
//     хинта связано с гардом парой);
//   * HUD «Здесь: …» подтипов — имя из КАТАЛОЖНОЙ записи по
//     t.buildingId (название_карты || название, регистр конвенции
//     buildingNameUi), а не обобщённое имя слота (у храма — «храм
//     солнца»).
// Цели ищутся ДИНАМИЧЕСКИ (BFS от спавна, паттерн файла); до
// реализации (buildingId слотовых = null) целей нет — тесты падают.

test('подземелье 000073: развалины (слот 9, buildingId 48) — постройка, НЕ вход: шаг не открывает dungeon; HUD «развалины» без «(вход — шагните)»', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findNearest(G, myMap, g.state.player,
    (t) => t.hasBuilding &&
      t.building === G.BUILDING_TYPES.CAVE_ENTRANCE &&
      t.buildingId === 48);
  assert.ok(found,
    'сценарий: развалины (подтип слота 9) достижимы пешком от спавна');
  walkTiles(h, NOW, found.steps);
  assert.equal(g.dungeon, null,
    'шаг на развалины — dungeonState НЕ открыт (постройка, не вход: гард buildingId 48)');
  assert.deepEqual({ x: g.state.player.x, y: g.state.player.y },
    found.target, 'герой — на тайле развалин');
  // HUD (кадр без нажатых клавиш — только рендер + hudUpdate): имя —
  // из каталожной записи 48 (название_карты || название), НЕ обобщённое
  // «вход в пещеру»; хинт «(вход — шагните)» подавлен для развалин.
  h.frameFn(NOW + 100000);
  const hud = h.hud.textContent;
  const rec = G.getBuilding(48);
  const raw = (rec.особые_параметры &&
    rec.особые_параметры.название_карты) || rec.название;
  const name = raw.charAt(0).toLowerCase() + raw.slice(1);
  assert.ok(hud.includes('Здесь: ' + name),
    'HUD: «Здесь: развалины» (каталожное имя по buildingId): '
    + JSON.stringify(hud));
  assert.ok(!hud.includes('Здесь: вход в пещеру'),
    'HUD: обобщённое имя слота «вход в пещеру» у развалин НЕ показывается: '
    + JSON.stringify(hud));
  assert.ok(!hud.includes('(вход — шагните)'),
    'HUD: хинт «(вход — шагните)» у развалин подавлен: '
    + JSON.stringify(hud));
});

test('HUD 000073: «Здесь: <имя подтипа>» — из каталожной записи по buildingId (храм не-солнечного подтипа ≠ «храм солнца»)', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  // Ближайший храм-подтип (37/38/39) — любой: цель динамическая,
  // переживает будущие ре-пины мира.
  const found = findNearest(G, myMap, g.state.player,
    (t) => t.hasBuilding &&
      t.building === G.BUILDING_TYPES.TEMPLE &&
      (t.buildingId === 37 || t.buildingId === 38 || t.buildingId === 39));
  assert.ok(found,
    'сценарий: храм-подтип (37/38/39) достижим пешком от спавна');
  walkTiles(h, NOW, found.steps);
  const rec = G.getBuilding(found.t.buildingId);
  assert.ok(rec, 'каталожная запись подтипа есть');
  assert.equal(rec.категория, 'храм', 'цель — храм (не базовый храм солнца)');
  // HUD (кадр без нажатых клавиш): имя подтипа — из каталожной записи
  // (название_карты || название), регистр — конвенция buildingNameUi.
  h.frameFn(NOW + 100000);
  const hud = h.hud.textContent;
  const raw = (rec.особые_параметры &&
    rec.особые_параметры.название_карты) || rec.название;
  const name = raw.charAt(0).toLowerCase() + raw.slice(1);
  assert.ok(hud.includes('Здесь: ' + name),
    'HUD: «Здесь: <имя подтипа>» из каталога: ' + JSON.stringify(hud));
  assert.ok(!hud.includes('Здесь: храм солнца'),
    'HUD: обобщённое имя слота «храм солнца» у подтипа НЕ показывается: '
    + JSON.stringify(hud));
});

test('город 000105: кадры main.js после входа не падают; HUD — заголовок города и «До выхода»', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findNearest(G, myMap, g.state.player, (t) => isCity(G, t));
  assert.ok(found, 'сценарий: город достижим пешком от спавна');
  const rec = G.getBuilding(found.t.buildingId);
  let now = walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg, 'в городе');
  // Кадры main.js (frame → buildFrame/drawSprites/hudUpdate) ПОСЛЕ
  // входа в город обязаны не падать: contents у города null —
  // hudUpdate обязан развести подземную ветку по kind.
  for (let i = 0; i < 3; i++) {
    now += 16;
    h.frameFn(now);
  }
  const text = h.hud.textContent;
  assert.ok(text.includes('--- ' + rec.особые_параметры.название_карты
      + ' (' + dg.x + ', ' + dg.y + ') ---'),
    'HUD: заголовок города «--- <имя> (x, y) ---»: ' + JSON.stringify(text));
  assert.ok(text.includes('До выхода: ~'),
    'HUD: «До выхода: ~N клеток»');
  assert.ok(!text.includes('undefined'),
    'HUD: без «undefined» (у города нет DUNGEON_NAMES[type])');
});

// --- 000109: сейв и респаун состояния города (экран города) ---
//
// Фикстура (детерминированный мир, фикс. сид generateSeedPixels):
// деревня 52, ЯКОРЬ (20, −16), вход (21, −15) — единственный
// проходимый тайл footprint'а, wealth 1, 36 шагов от спавна (0,0)
// (< steps_per_day = 40 — вход НЕ сдвигает день). Содержимое: 3
// постройки: (4,4) трактир 44, (2,3) оружейная 1, (2,2) трактир 44;
// в сейве-фикстуре сток клетки (2,2) (000148.01: layout 6×6;
// таверна (2,2) СОХРАНИЛАСЬ — фикстура cell: '2,2' без изменений);
// в R10b — плюс мёртвая клетка (2,1) (орфан — НЕ постройка 6×6;
// должен отброситься при входе, D8/R13 — см. DEAD_CELL_STOCK).
//
// Контракт (memory/000109-city-save-respawn.md): при входе
// `day − lastVisitDay >= city_respawn_days` → ПЕРЕГЕНЕРАЦИЯ стока
// (новый полный, детерминированный — без соли по дню), иначе —
// ВОССТАНОВЛЕНИЕ из сейва; lastVisitDay = day при входе; сейв
// входного шага — frame() (enterLocation → saveNow) — уже содержит
// состояние города.

const V109 = {
  buildingId: 52,
  anchor: [20, -16],
  entrance: [21, -15],
  steps: 36,
  wealth: 1,
  cell: '2,2',
  day: 20,
};
const DEPLETED_STOCK = { bread: 0, healing_potion: 0, minor_healing: 0 };
// Ревью 000148.01 (ТЗ п.4, D8/R13): сток МЁРТВОЙ клетки (2,1) — НЕ
// постройка в layout 6×6 (постройки: (4,4), (2,3), (2,2)).
// Входит в сейв-фикстуру R10b, чья запись ЖИВА (в окне респауна):
// после входа ключ НЕ должен сохраниться — prepareCityState строит
// карту стока строго по текущим contents.buildings (орфаны
// отбрасываются; маппинг клеток НЕ делается). deepEqual-ассерт
// R10b (точный набор ключей {2,2, 2,3, 4,4}) фиксирует отсутствие.
const DEAD_CELL_STOCK = { bread: 7, healing_potion: 7, minor_healing: 7 };
const HERO109 = {
  name: 'Смоук', level: 2, xp: 10, totalXp: 100, gold: 50,
  hp: 20, mp: 10, points: 1,
  primary: {
    strength: 2, dexterity: 1, constitution: 1,
    intelligence: 1, wisdom: 1, charisma: 1,
  },
  secondary: { forge: 3 },
  skillXp: {},
  spells: ['spark'],
};

// Деревня 52 по якорю (НЕ «ближайший город» — тот хутор 51 на
// 30 шагов; цель — явная, фикстура стабильна).
function isVillage109(G, t) {
  return isCity(G, t) && t.buildingId === V109.buildingId
    && JSON.stringify(t.buildingAnchor) === JSON.stringify(V109.anchor);
}

async function enterVillage109(h) {
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findNearest(G, myMap, g.state.player, (t) => isVillage109(G, t));
  assert.ok(found,
    'сценарий: деревня 52 @ якорь (20,-16) достижима пешком (BFS)');
  assert.deepEqual(found.target,
    { x: V109.entrance[0], y: V109.entrance[1] },
    'фикстура: вход (21,-15)');
  assert.equal(found.steps.length, V109.steps,
    'фикстура: ' + V109.steps + ' шагов от спавна (0,0)');
  assert.equal(found.t.buildingWealth, V109.wealth,
    'фикстура: wealth ' + V109.wealth);
  walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg, 'в городе (dungeonState установлена)');
  assert.equal(dg.kind, 'city', 'экран города');
  assert.equal(g.state.day, V109.day,
    'вход НЕ сдвигает день (36 < steps_per_day = 40)');
  return { g, G, dg, found };
}

test('000109 R10a: вход через city_respawn_days после визита (20 − 17 = 3 >= 3) — сток ПЕРЕГЕНЕРИРОВАН (fresh, детерминированный), lastVisitDay = day; сейв входного шага', async () => {
  const h = await bootSeeded({
    day: V109.day, steps: 0, hero: HERO109,
    cities: { '20,-16': { lastVisitDay: 17, stock: { '2,2': DEPLETED_STOCK } } },
  });
  const { g, G, dg, found } = await enterVillage109(h);
  assert.equal(dg.entrance.x, 1, 'фикстура: layout 6x6, entrance (1,5)');
  assert.equal(dg.entrance.y, 5, 'фикстура: layout 6x6, entrance (1,5)');
  // Фреш-сток — детерминированный (якорь, клетка): wealth 1. Чужой
  // realm — JSON-рондтрип (паттерн host()). 000177 + 000148.01:
  // layout 6x6 (4f−2) — 16 placeable-клеток, и эта деревня ставит
  // ТРИ постройки: (4,4) трактир 44, (2,3) оружейная 1,
  // (2,2) трактир 44 (в сейве-фикстуре сток только клетки (2,2) —
  // DEPLETED_STOCK) → все свежие (000148.01: layout сменился —
  // стоки на мёртвых клетках — осознанный сброс).
  const [ax, ay] = found.t.buildingAnchor;
  const fresh = G.Cities.makeCityShop(ax, ay, 2, 2, 44, V109.wealth).stock;
  const freshHost = JSON.parse(JSON.stringify(fresh));
  assert.ok(freshHost && Object.keys(freshHost).length > 0,
    'фикстура: fresh-сток трактира непуст');
  assert.notDeepEqual(freshHost, DEPLETED_STOCK,
    'сценарий: fresh ≠ истощённый сток (тест различим)');
  const fresh23 = JSON.parse(JSON.stringify(
    G.Cities.makeCityShop(ax, ay, 2, 3, 1, V109.wealth).stock));
  const fresh44 = JSON.parse(JSON.stringify(
    G.Cities.makeCityShop(ax, ay, 4, 4, 44, V109.wealth).stock));
  // Сейв входного шага (frame: enterLocation → saveNow) — состояние
  // города уже в localStorage, выходить из города не нужно.
  const saveText = h.storage.store['phlogiston.save'];
  assert.ok(saveText, 'входной шаг: saveNow вызван (сейв записан)');
  const saved = JSON.parse(saveText);
  assert.deepEqual(saved.data.cities, {
    '20,-16': { lastVisitDay: V109.day, stock: {
      '2,2': freshHost, '2,3': fresh23, '4,4': fresh44,
    } },
  }, '20 − 17 = 3 >= city_respawn_days: сток ПЕРЕГЕНЕРИРОВАН '
    + '(fresh, а не истощённый), lastVisitDay = day');
  // __game.cities (контракт 000107): getter — поверхностная копия
  // записей; значения — LIVE-объекты (cityStates Map), не копии.
  const c1 = g.cities, c2 = g.cities;
  assert.notEqual(c1, c2, 'getter: новый контейнер при каждом вызове');
  assert.ok(Object.prototype.hasOwnProperty.call(c1, '20,-16'),
    'cities: запись по якорю (20,-16)');
  assert.equal(c1['20,-16'].lastVisitDay, V109.day,
    'cities: lastVisitDay = day (день визита)');
  assert.equal(c1['20,-16'], c2['20,-16'],
    'LIVE: запись — тот же объект при двух вызовах getter');
  assert.equal(c1['20,-16'].stock['2,2'], c2['20,-16'].stock['2,2'],
    'LIVE: сток — тот же объект сессии (не копия)');
});

test('000109 R10b: вход через день после визита (20 − 19 = 1 < 3) — сток ВОССТАНОВЛЕН из сейва (НЕ перегенерирован), lastVisitDay = day; орфан мёртвой клетки (2,1) отброшен', async () => {
  const h = await bootSeeded({
    day: V109.day, steps: 0, hero: HERO109,
    cities: { '20,-16': { lastVisitDay: 19, stock: {
      '2,2': DEPLETED_STOCK, '2,1': DEAD_CELL_STOCK,
    } } },
  });
  const { g, G, dg, found } = await enterVillage109(h);
  const [ax, ay] = found.t.buildingAnchor;
  const fresh = G.Cities.makeCityShop(ax, ay, 2, 2, 44, V109.wealth).stock;
  assert.notDeepEqual(JSON.parse(JSON.stringify(fresh)), DEPLETED_STOCK,
    'сценарий: fresh ≠ истощённый сток (тест различим)');
  // 000177 + 000148.01: в сейве стока (2,2) (трактир 44) — он
  // ВОССТАНОВЛЕН (истощённый, не перегенерирован) — и мёртвая
  // клетка (2,1) (НЕ постройка 6×6; ревью 000148.01, D8/R13):
  // запись сейва ЖИВА (в окне респауна), значит орфан отбрасывает
  // именно prepareCityState-пересборка строго по текущим
  // contents.buildings (маппинг клеток НЕ делается) — deepEqual
  // ниже фиксирует отсутствие '2,1'. Остальные постройки деревни —
  // (2,3) оружейная 1 и (4,4) трактир 44 — в сейве НЕТ → их стоки
  // свежие (как у R10a).
  const fresh23 = JSON.parse(JSON.stringify(
    G.Cities.makeCityShop(ax, ay, 2, 3, 1, V109.wealth).stock));
  const fresh44 = JSON.parse(JSON.stringify(
    G.Cities.makeCityShop(ax, ay, 4, 4, 44, V109.wealth).stock));
  const saveText = h.storage.store['phlogiston.save'];
  assert.ok(saveText, 'входной шаг: saveNow вызван (сейв записан)');
  const saved = JSON.parse(saveText);
  assert.deepEqual(saved.data.cities, {
    '20,-16': { lastVisitDay: V109.day, stock: {
      '2,2': DEPLETED_STOCK, '2,3': fresh23, '4,4': fresh44,
    } },
  }, '20 − 19 = 1 < city_respawn_days: сток (2,2) ВОССТАНОВЛЕН из '
    + 'сейва (НЕ перегенерирован), орфан (2,1) отброшен (D8), '
    + 'lastVisitDay обновлён до дня входа');
  // __game.cities (контракт 000107): getter — поверхностная копия
  // записей; значения — LIVE-объекты (cityStates Map), не копии;
  // мутация через getter → cityStates → следующий сейв.
  const c1 = g.cities, c2 = g.cities;
  assert.notEqual(c1, c2, 'getter: новый контейнер при каждом вызове');
  assert.ok(Object.prototype.hasOwnProperty.call(c1, '20,-16'),
    'cities: запись по якорю (20,-16)');
  assert.equal(c1['20,-16'].lastVisitDay, V109.day,
    'cities: lastVisitDay = day (день визита)');
  assert.equal(c1['20,-16'], c2['20,-16'],
    'LIVE: запись — тот же объект при двух вызовах getter');
  assert.equal(c1['20,-16'].stock['2,2'], c2['20,-16'].stock['2,2'],
    'LIVE: сток — тот же объект сессии (не копия)');
  c1['20,-16'].stock['2,2'].sentinel000109 = 1;
  const fns = h.winListeners['beforeunload'];
  assert.ok(fns && fns.length, 'beforeunload зарегистрирован (saveNow)');
  for (const fn of fns) fn({});
  const saved2 = JSON.parse(h.storage.store['phlogiston.save']);
  assert.deepEqual(saved2.data.cities['20,-16'].stock['2,2'],
    { ...DEPLETED_STOCK, sentinel000109: 1 },
    'LIVE: мутация стока через getter попала в сейв (000107)');
});

// --- 000148.02 (G1): рендер построек внутри города (e2e) ---
//
// ТЗ: «город с buildings ≥1 в layout → ≥1 drawImage-вызов со спрайтом
// постройки; свободная клетка — спрайтов постройки нет. Красный ДО:
// drawCalls-спрайты на экране города = 0 (grep cityContents в
// dungeon-ui.js = 0)». Фикстура — деревня 52 (V109): 6×6, cam (3,3)
// (6*80=480 ≤ 720 → центрирован), zoom = ZOOM_START 80, 3 постройки:
// (4,4) таверна 44, (2,3) оружейная 1, (2,2) таверна 44.
//
// Изоляция: мир (canvas #sprites) ТОЖЕ рисует assets/sprites/buildings/
// (карта мира) — ассерты берут drawCalls canvas ОВЕРЛЕЯ (findLastCanvas
// по body), НЕ spriteCanvas. Префикс-фильтр 'assets/sprites/buildings/'
// не пересекается с door.svg (assets/dungeon/) и игроком
// (assets/sprites/phlogiston/).
//
// КАДР = ровно ОДИН render из start() (вход синхронный); frame() main.js
// оверлей НЕ рендерит (dungeonUI.render — только в onEnd боя). После
// входа НЕ ходить (onMove → новый render → drawCalls кумулируются).

test('город 000148.02 G1 (e2e): постройки деревни РЕНДЕРЯТСЯ — ровно 3 спрайта (2×tavern + 1×weapons_shop), свободные клетки/дверь — без спрайтов, hex-пол сохранён', async () => {
  // Засеянный старт Р10a (day = V109.day, steps = 0): enterVillage109
  // широким контрактом требует day === V109.day ПОСЛЕ входа (36 < 40
  // шагов → день НЕ сдвигается); обычный boot() стартует с day 1.
  // Раздел cities в сейве НЕ нужен — сток перегенерируется fresh
  // (тест не ассертит сток).
  const h = await bootSeeded({ day: V109.day, steps: 0, hero: HERO109 });
  const { g, G, dg } = await enterVillage109(h);
  // Фикстура 000148.01 (защита от дрейфа генерации): 3 постройки.
  // JSON-раундтрип: dg.buildings — массив realm-песочницы (прототипы
  // чужие → deepStrictEqual падал бы даже на равных данных); паттерн
  // R10a — сравнение host-разобранных объектов.
  assert.deepEqual(JSON.parse(JSON.stringify(dg.buildings)), [
    { x: 4, y: 4, buildingId: 44 },
    { x: 2, y: 3, buildingId: 1 },
    { x: 2, y: 2, buildingId: 44 },
  ], 'фикстура: деревня 52 — 3 постройки (2×таверна + 1×оружейная)');
  const canvas = findLastCanvas(h.body);
  assert.ok(canvas && Array.isArray(canvas.drawCalls),
    'оверлей dungeon-ui: canvas в дереве body (drawCalls)');
  const calls = canvas.drawCalls;
  // buildingCalls — спрайты построек (префикс assets/sprites/buildings/).
  const buildingCalls = calls.filter((c) =>
    c[0] === 'drawImage'
    && c[1][0] && typeof c[1][0].__src === 'string'
    && c[1][0].__src.indexOf('assets/sprites/buildings/') === 0);
  assert.equal(buildingCalls.length, 3,
    'ровно 3 building-спрайта (2×tavern + 1×weapons_shop); сейчас: '
    + buildingCalls.length);
  // Множество путей = ТЕМ ЖЕ резолвом, что код (getBuilding →
  // map_index/размещение.слот → кадр таблицы (000238.01) /
  // G.buildingSprite), без хардкода имён.
  const resolve = (id, now, x, y) => {
    const rec = G.getBuilding(id);
    const op = (rec && rec.особые_параметры) || {};
    const slot = Number.isInteger(op.map_index) ? op.map_index
      : (op.размещение && Number.isInteger(op.размещение.слот)
         ? op.размещение.слот : null);
    if (slot == null) return null;
    const frames = typeof G.buildingFrames === 'function'
      ? G.buildingFrames(slot) : null;
    if (frames && frames.length > 1
        && typeof G.buildingFrameIndex === 'function') {
      return frames[G.buildingFrameIndex(now, x, y, frames.length)];
    }
    return G.buildingSprite(slot);
  };
  const expectedPaths = JSON.parse(JSON.stringify(
    dg.buildings.map((b) => resolve(b.buildingId, 1000, b.x, b.y)))).sort();
  const actualPaths = buildingCalls.map((c) => c[1][0].__src).sort();
  assert.deepEqual(actualPaths, expectedPaths,
    'множество путей спрайтов = резолв id→слот (2×tavern + 1×weapons_shop): '
    + JSON.stringify(actualPaths));
  // 6×6 @ ZOOM_START (80): 6*80 = 480 ≤ 720 → cam центрирован (3,3).
  const CAM = 3, ZOOM = 80;
  const cellPos = (x, y) => G.worldToScreen(x, y, CAM, CAM, ZOOM, VIEW_W, VIEW_H);
  // Каждая постройка: спрайт на позиции/размере floor-fillRect ЕГО клетки
  // (сам-пин: спрайт лежит НА поле своей клетки) И на позиции worldToScreen.
  for (const b of dg.buildings) {
    const p = cellPos(b.x, b.y);
    const floorHere = calls.some((c) => c[0] === 'fillRect'
      && Math.abs(c[1][0] - p.x) <= 1e-9
      && Math.abs(c[1][1] - p.y) <= 1e-9
      && c[1][2] === ZOOM && c[1][3] === ZOOM);
    assert.ok(floorHere,
      'клетка (' + b.x + ',' + b.y + '): floor-fillRect на позиции worldToScreen');
    const here = buildingCalls.some((c) =>
      Math.abs(c[1][1] - p.x) <= 1e-9
      && Math.abs(c[1][2] - p.y) <= 1e-9
      && c[1][3] === ZOOM && c[1][4] === ZOOM);
    assert.ok(here,
      'постройка (' + b.x + ',' + b.y + ') id ' + b.buildingId
      + ' — спрайт на позиции пола своей клетки, ' + ZOOM + '×' + ZOOM);
  }
  // Свободная клетка (1,1) и дверь (1,5) — БЕЗ спрайта постройки.
  const noSpriteAt = (x, y) => !buildingCalls.some((c) =>
    Math.abs(c[1][1] - cellPos(x, y).x) <= 1e-9
    && Math.abs(c[1][2] - cellPos(x, y).y) <= 1e-9);
  assert.ok(noSpriteAt(1, 1), 'свободная клетка (1,1) — без спрайта постройки');
  assert.ok(noSpriteAt(1, 5), 'дверь (1,5) — без спрайта постройки');
  // Hex-палитра (R10): пол — fillStyle из CITY_FLOOR_VARIANTS; фолбэк
  // подземелья #182029 — нет.
  const CITY_FLOOR = ['#b3a284', '#a5947a', '#c0b090']; // CITY_FLOOR_VARIANTS
  assert.ok(calls.some((c) => c[0] === 'fillRect'
    && CITY_FLOOR.indexOf(c[2]) !== -1),
    'hex-пол: fillRect с fillStyle из CITY_FLOOR_VARIANTS (R10)');
  assert.ok(!calls.some((c) => c[0] === 'fillRect' && c[2] === '#182029'),
    'hex-пол: нет фолбэк-пола подземелья #182029 (R10)');
  assert.equal(h.errors.length, 0, 'ошибок нет: ' + h.errors.join('; '));
});

// 000191 — ретро-покрытие (retro-20261012, find G2): z-порядок слоя
// не закреплён ни одним тестом (dungeon-ui.js:569 — «пол → ПОСТРОЙКИ
// → стена-слой → дверь → игрок»).

test('город 000191.6b (e2e): z-порядок слоя — ВСЕ building-drawImage (2×tavern + 1×weapons_shop) ПЕРЕД door-drawImage (assets/dungeon/door.svg), door ПЕРЕД player-drawImage (assets/sprites/phlogiston/): index(building) < index(door) < index(player)', async () => {
  const h = await bootSeeded({ day: V109.day, steps: 0, hero: HERO109 });
  const { dg } = await enterVillage109(h);
  assert.equal(dg.buildings.length, 3,
    'фикстура: деревня 52 — 3 постройки (2×таверна + 1×оружейная)');
  const canvas = findLastCanvas(h.body);
  assert.ok(canvas && Array.isArray(canvas.drawCalls),
    'оверлей dungeon-ui: canvas в дереве body (drawCalls)');
  const calls = canvas.drawCalls;
  const buildingIdx = [];
  const doorIdx = [];
  const playerIdx = [];
  calls.forEach((c, i) => {
    if (c[0] !== 'drawImage' || !c[1][0]) return;
    const src = typeof c[1][0].__src === 'string' ? c[1][0].__src : null;
    if (!src) return;
    if (src.indexOf('assets/sprites/buildings/') === 0) buildingIdx.push(i);
    else if (src === 'assets/dungeon/door.svg') doorIdx.push(i);
    else if (src.indexOf('assets/sprites/phlogiston/') === 0)
      playerIdx.push(i);
  });
  assert.equal(buildingIdx.length, 3,
    '3 building-спрайта (один рендер): ' + buildingIdx.length);
  assert.ok(doorIdx.length >= 1,
    'дверь (assets/dungeon/door.svg) — нарисована drawImage');
  assert.ok(playerIdx.length >= 1,
    'игрок (assets/sprites/phlogiston/) — нарисован drawImage');
  for (const bi of buildingIdx)
    assert.ok(bi < doorIdx[0],
      'z-порядок: постройка (idx ' + bi + ') — ПЕРЕД дверью '
      + '(idx ' + doorIdx[0] + ') — слой ПО ВЕРХУ пола, ПОД дверью');
  assert.ok(doorIdx[0] < playerIdx[0],
    'z-порядок: дверь (idx ' + doorIdx[0] + ') — ПЕРЕД игроком '
    + '(idx ' + playerIdx[0] + ')');
  assert.equal(h.errors.length, 0, 'ошибок нет: ' + h.errors.join('; '));
});

// --- 000202 (e2e): UI списка зданий — РЕАЛЬНЫЙ buildingUI в деревне ---
//
// ТЗ: tasks/pending/000202.md; контракт — memory/000202-building-menu-
// ui.md. Фикстура — деревня 52 (V109): 6×6, вход (1,5), постройки
// (4,4) таверна 44, (2,3) оружейная 1, (2,2) таверна 44; герой
// HERO109 (золото 50, ПРЕДМЕТОВ НЕТ). Ходьба (1,5)→(1,4)→(1,3)→
// (1,2)→(1,1) (все — интерьерный FLOOR) и [E] на СВОБОДНОЙ (1,1) →
// buildingUI «Строительство»: 22 build-строки (набор D3) + rename.
// Ходьба в городе — синхронная (keydown → ctx.onMove → cityMove,
// кадры не нужны; позиция — g.dungeon.x/y, не g.state.player — в
// городе player = мировой якорь входа). Красный: в текущем коде
// pre-check геометрический (20 из 22 строк доступны, reason у 3×3
// строчными «нет места»), icon нет, --build/cp-itemreason нет.

const D3_202 = [1, 2, 3, 4, 7, 8, 10, 11, 25, 36, 37, 38, 39, 40, 42,
  43, 44, 45, 46, 48, 49, 55];

function walkCity202(h, steps) {
  const g = h.sandbox.__game;
  for (const [tx, ty] of steps) {
    const dx = tx - g.dungeon.x, dy = ty - g.dungeon.y;
    assert.ok(Math.abs(dx) + Math.abs(dy) === 1,
      'город: шаг по соседней клетке');
    const e = press(h, keydownFor(dx, dy));
    release(h, e);
    assert.ok(g.dungeon, 'в городе (не вышел)');
    assert.equal(g.dungeon.x, tx, 'город: шаг x (' + tx + ',' + ty + ')');
    assert.equal(g.dungeon.y, ty, 'город: шаг y (' + tx + ',' + ty + ')');
  }
}

test('000202 (e2e): [E] на свободной (1,1) деревни 52 — РЕАЛЬНОЕ «Строительство»: оверлей combat-overlay--build; 22 строки с IMG.cp-itemicon (реальный путь G.buildingSprite) + чип rename; ВСЕ 22 строки disabled + reason cp-itemreason (без dim); 7/36 (3×3 перекрытие) — «Нет места», 1 — «Не хватает 2 бревна» (золото 50 ≥ 50), 48 — «Не хватает 1 каменного обломка» (золото 50 ≥ 30); без console.error; второй [E] — закрыть', async () => {
  const h = await bootSeeded({ day: V109.day, steps: 0, hero: HERO109 });
  const { g, G } = await enterVillage109(h);
  walkCity202(h, [[1, 4], [1, 3], [1, 2], [1, 1]]);
  assert.equal(g.dungeon.x, 1, 'герой на (1,1): x');
  assert.equal(g.dungeon.y, 1, 'герой на (1,1): y');
  press(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true,
    '[E] на свободной клетке — buildingUI «Строительство»');
  // Оверлей buildingUI в body: div.combat-overlay, НО не городской
  // оверлей dungeon-ui (.combat-overlay.dungeon-overlay).
  const findOverlayEl = (n) => {
    for (const ch of n.children || []) {
      const cls = String(ch.className || '');
      if (cls.includes('combat-overlay')
          && !cls.includes('dungeon-overlay')) return ch;
      const r = findOverlayEl(ch);
      if (r) return r;
    }
    return null;
  };
  const overlay = findOverlayEl(h.body);
  assert.ok(overlay, 'RED: оверлей buildingUI в body');
  assert.ok(String(overlay.className).includes('combat-overlay--build'),
    'RED: scroll — класс combat-overlay--build (000202 R6/R7): '
    + overlay.className);
  const side = overlay.children[0];
  const list = side.children.find((ch) =>
    String(ch.className || '').includes('cp-items'));
  assert.ok(list, '.cp-items в оверлее');
  const rows = list.children;
  assert.equal(rows.length, 23,
    '23 строки (22 набора D3 + «Переименовать город», 000148.05); '
    + 'факт: ' + rows.length);
  // Иконка — реальный слот-спрайт (резолв 1:1 с тестом G1 000148.02:
  // getBuilding → map_index/размещение.слот → G.buildingSprite).
  const resolve = (id) => {
    const rec = G.getBuilding(id);
    const op = (rec && rec.особые_параметры) || {};
    const slot = Number.isInteger(op.map_index) ? op.map_index
      : (op.размещение && Number.isInteger(op.размещение.слот)
         ? op.размещение.слот : null);
    return slot == null ? null : G.buildingSprite(slot);
  };
  const lastChild = (row) => row.children[row.children.length - 1];
  const reasonOf = (row) => String(lastChild(row).textContent || '');
  for (let i = 0; i < 22; i += 1) {
    const id = D3_202[i];
    const row = rows[i];
    assert.equal(row.disabled === true, true,
      'RED: строка build-' + id + ' — disabled (герой без предметов, '
      + 'золото 50): ' + row.disabled);
    assert.notEqual(String(row.style.opacity), '0.3',
      'RED: с reasonRed — без dim (красный — маркер): ' + row.style.opacity);
    const icon = row.children[0];
    assert.equal(String(icon.tagName).toLowerCase(), 'img',
      'RED: строка build-' + id + ' — первый ребёнок IMG (не чип): '
      + icon.tagName);
    assert.equal(String(icon.className), 'cp-itemicon',
      'RED: класс cp-itemicon (000202 R5): ' + icon.className);
    assert.equal(String(icon.src), resolve(id),
      'RED: иконка — реальный путь слот-спрайта (build-' + id + '): '
      + icon.src);
    assert.ok(String(lastChild(row).className).includes('cp-itemreason'),
      'RED: reason строки build-' + id + ' — класс cp-itemreason: '
      + lastChild(row).className);
  }
  // 23-я строка — «Переименовать город»: нумерационный чип (без
  // иконки), доступна.
  const rename = rows[22];
  assert.equal(String(rename.children[0].className), 'cp-btn',
    'rename-строка — нумерационный чип (без иконки)');
  assert.equal(String(rename.children[0].textContent), '23',
    'чип — номер 23');
  assert.equal(rename.disabled === false, true,
    'rename-строка — доступна (000148.05)');
  // Reasons: геометрия приоритетнее (7/36 3×3 — перекрытие
  // (2,2)/(2,3) → «Нет места»), затем «Не хватает …» — золото ОК
  // (50 ≥ 50 / 50 ≥ 30), предметы — отсутствуют.
  assert.ok(reasonOf(rows[D3_202.indexOf(7)]).includes('Нет места'),
    'RED: строка 7 (3×3) — «Нет места» (приоритет геометрии): '
    + reasonOf(rows[D3_202.indexOf(7)]));
  assert.ok(reasonOf(rows[D3_202.indexOf(36)]).includes('Нет места'),
    'RED: строка 36 (3×3) — «Нет места»: '
    + reasonOf(rows[D3_202.indexOf(36)]));
  assert.ok(reasonOf(rows[D3_202.indexOf(1)]).includes('Не хватает 2 бревна'),
    'RED: строка 1 — «Не хватает 2 бревна» (золото 50 ≥ 50, бревно 0 < 2): '
    + reasonOf(rows[0]));
  assert.ok(reasonOf(rows[D3_202.indexOf(48)]).includes('Не хватает 1 каменного обломка'),
    'RED: строка 48 — «Не хватает 1 каменного обломка» (золото 50 ≥ 30, '
    + 'каменный обломок 0 < 1): '
    + reasonOf(rows[D3_202.indexOf(48)]));
  assert.equal(h.errors.length, 0,
    'console.error нет (тихие гарды, R8): ' + h.errors.join('; '));
  // Второй [E] — закрыть оверлей (стек, 000148.03).
  press(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), false,
    'второй [E] — оверлей закрыт');
});

// --- 000264 (e2e): здание w×h в городе — ОДИН w×h-спрайт от якоря ---
//
// Контракт: memory/000264-city-3x3-sprite.md. ТЗ: tasks/pending/
// 000264.md. Фикстура — ДЕТЕРМИНИРОВАННЫЙ мир: ближайший город
// fp≥3 — id 53 «Город» (якорь (93,18), вход (95,22), layout 18×18,
// дверь (1,17)); BFS ≈ 119 шагов от спавна (0,0). Якорь built —
// ПЕРВЫЙ row-major canBuildAt-OK для id 7 в видимых строках
// (y ∈ 9..13 — строки первого кадра при cam.y = 13.5) против
// base-содержимого (generateCityContents occ=null — то, что
// РЕАЛЬНЫЙ buildCityAt видит до постройки): (1,9).
//
// Камера (start): снап к игроку (дверь) + clampCam — 18×80 = 1440 >
// 1280/720 → cam = (clamp(1.5, 8, 10), clamp(17.5, 4.5, 13.5)) =
// (8, 13.5). Целый zoom 80 + целая/полунцелая камера + чётный
// вьюпорт → снап-rect = worldToScreen (identity 000215).
//
// КРАСНЫЕ (падают на ТЕКУЩЕМ коде осмысленно — слоя группировки в
// dungeon-ui.js нет; мир/вход/данные — существующее поведение):
//   E1: seeded-сейв cities['93,18'].built = [ANCHOR-запись id 7]
//       → вход → prepareCityState: per-cell view (ровно 9 записей
//       id 7, player:true) + built сохранён → ОДИН building-спрайт
//       3Z×3Z от якоря (arena.svg); базовые 1×1 — один на видимую
//       запись (viewport-клип бит-в-бит); errors 0.
//   E2: тот же сценарий + demolish: walkCity на клетку Арены (1,9)
//       → [E] → строка «Разобрать (возврат 120 з., Кожа ×2)» → клик
//       (делегированный onOverlayClick) → per-cell ДАННЫЕ: 9
//       записей удалены, built чист (дубль CI-U19 в e2e: золото
//       +120, Кожа +2) → ЯВНЫЙ G.dungeonUI.render (rAF в песочнице
//       нет) → срез последнего рендера (от последнего full-viewport
//       fillRect #0a0d12, dungeon-ui.js:462–463): крупный спрайт
//       ИСЧЕЗ; базовые 1×1 на месте; errors 0.
//
// Бит-в-бит (не трогаются): G1 «ровно 3 спрайта», z-порядок
// 000191.6b, 000202 (меню), все data-пины (CI-U19 и др.).

const V264 = {
  buildingId: 53,
  anchor: [93, 18],
  entrance: [95, 22],
  layoutW: 18,
  door: [1, 17],
  cam: [8, 13.5],
  buildAnchor: { x: 1, y: 9 },
  refund: 120,
};

// Город fp≥3 (каталожные footprint 5/7 — id 53/54).
function isCity264(G, t) {
  return isCity(G, t) && G.getBuilding(t.buildingId).размер.ширина >= 3;
}

// ПЕРВЫЙ row-major canBuildAt-OK якорь id 7 в строках y ∈ 9..13
// (видимые в первом кадре, см. заголовок) против base-занятости.
function findBuildAnchor264(G, L, t) {
  const [wax, way] = t.buildingAnchor;
  const base = G.Cities.generateCityContents(L, wax, way,
    G.getBuilding(t.buildingId), t.buildingWealth, null).buildings;
  const occ = G.Cities.cityOccupied(base);
  for (let y = 9; y <= 13; y++)
    for (let x = 1; x <= 13; x++) {
      if (G.Cities.canBuildAt(L, { x, y }, 7, occ).ok)
        return { x, y };
    }
  return null;
}

// L-маршрут в городе (сначала строка, потом колонна): все клетки —
// интерьерный FLOOR (layout открыт; по постройкам герой ходит —
// cityMove). from — дверь, to — клетка Арены.
function cityWalkL(from, to) {
  const steps = [];
  let x = from.x;
  let y = from.y;
  while (y !== to.y) { y += (to.y > y ? 1 : -1); steps.push([x, y]); }
  while (x !== to.x) { x += (to.x > x ? 1 : -1); steps.push([x, y]); }
  return steps;
}

// Оверлей buildingUI (последний .combat-overlay, НЕ dungeon-overlay
// и НЕ npc-overlay) в дереве body.
function findBuildingOverlay(root) {
  let out = null;
  (function walk(n) {
    for (const ch of n.children || []) {
      const cls = String(ch.className || '');
      if (cls.includes('combat-overlay')
          && !cls.includes('dungeon-overlay')
          && !cls.includes('npc-overlay')) out = ch;
      walk(ch);
    }
  })(root);
  return out;
}

// Строка .cp-itemrow, у которой .cp-itemname содержит text.
function findRowByText(root, text) {
  let found = null;
  (function walk(n) {
    if (found) return;
    for (const ch of n.children || []) {
      const cls = String(ch.className || '');
      if (cls.includes('cp-itemrow')) {
        for (const c of ch.children || [])
          if (String(c.className || '').includes('cp-itemname')
              && String(c.textContent || '').includes(text)) {
            found = ch;
            return;
          }
      }
      walk(ch);
    }
  })(root);
  return found;
}

// Рендер-ассерты города с Ареной (общие E1/E2, пре-demolish):
// ОДИН крупный 3Z×3Z-спрайт от якоря; клеток footprint'а — без
// 1×1; базовые 1×1 — один на видимую resolvable запись (клип
// бит-в-бит 000148.02). RED — на первом же assert (крупного
// спрайта нет — per-cell рисуются по 1×1).
function assertArenaRender(calls, G, dg, CAMX, CAMY, Z, arenaPath,
    resolve) {
  const buildingCalls = calls.filter((c) =>
    c[0] === 'drawImage' && c[1][0]
    && typeof c[1][0].__src === 'string'
    && c[1][0].__src.indexOf('assets/sprites/buildings/') === 0);
  const pa = G.worldToScreen(V264.buildAnchor.x, V264.buildAnchor.y,
    CAMX, CAMY, Z, VIEW_W, VIEW_H);
  const big = buildingCalls.filter((c) =>
    Math.abs(c[1][1] - pa.x) <= 1e-9
    && Math.abs(c[1][2] - pa.y) <= 1e-9
    && c[1][3] === 3 * Z && c[1][4] === 3 * Z
    && c[1][0].__src === arenaPath);
  assert.equal(big.length, 1,
    'RED: Арена — ровно ОДИН 3Z×3Z-спрайт (arena.svg) от якоря '
    + 'worldToScreen(' + V264.buildAnchor.x + ',' + V264.buildAnchor.y
    + ', ' + CAMX + ',' + CAMY + ', ' + Z + ') (снап-rect footprint'
    + 'а; identity при целом зуме/камере); сейчас: ' + big.length
    + ' (per-cell записи рисуются по 1×1 — спрайтов '
    + buildingCalls.length + ')');
  for (let dy = 0; dy < 3; dy++)
    for (let dx = 0; dx < 3; dx++) {
      const cp = G.worldToScreen(V264.buildAnchor.x + dx,
        V264.buildAnchor.y + dy, CAMX, CAMY, Z, VIEW_W, VIEW_H);
      const small = buildingCalls.filter((c) =>
        Math.abs(c[1][1] - cp.x) <= 1e-9
        && Math.abs(c[1][2] - cp.y) <= 1e-9
        && c[1][3] === Z && c[1][4] === Z);
      assert.equal(small.length, 0,
        'RED: клетка Арены (' + (V264.buildAnchor.x + dx) + ','
        + (V264.buildAnchor.y + dy) + ') — без 1×1-спрайта; сейчас: '
        + small.length);
    }
  const range = G.visibleTileRange(CAMX, CAMY, VIEW_W, VIEW_H, Z);
  const x0 = Math.max(0, range.x0);
  const x1 = Math.min(dg.width - 1, range.x1);
  const y0 = Math.max(0, range.y0);
  const y1 = Math.min(dg.height - 1, range.y1);
  const baseRecs = dg.buildings.filter((b) => b.buildingId !== 7);
  let expectedVisible = 0;
  for (const b of baseRecs) {
    const bPath = resolve(b.buildingId, NOW, b.x, b.y);
    const inView = b.x >= x0 && b.x <= x1 && b.y >= y0 && b.y <= y1;
    const bp = G.worldToScreen(b.x, b.y, CAMX, CAMY, Z, VIEW_W, VIEW_H);
    const at = buildingCalls.filter((c) =>
      Math.abs(c[1][1] - bp.x) <= 1e-9
      && Math.abs(c[1][2] - bp.y) <= 1e-9
      && c[1][3] === Z && c[1][4] === Z);
    if (inView && bPath) {
      expectedVisible += 1;
      assert.equal(at.length, 1,
        'базовая (' + b.x + ',' + b.y + ') id ' + b.buildingId
        + ' — один 1×1-спрайт (бит-в-бит); сейчас: ' + at.length);
      assert.equal(at[0][1][0].__src, bPath,
        'базовая (' + b.x + ',' + b.y + ') — путь слот-спрайта');
    } else {
      assert.equal(at.length, 0,
        'базовая (' + b.x + ',' + b.y + ') id ' + b.buildingId
        + ' — без спрайта (viewport-клип / skip без слота); сейчас: '
        + at.length);
    }
  }
  const smalls = buildingCalls.filter((c) =>
    c[1][3] === Z && c[1][4] === Z);
  assert.equal(smalls.length, expectedVisible,
    '1×1-спрайтов — ровно по видимым базовым записям; сейчас: '
    + smalls.length);
}

test('000264 E1 (RED): e2e — seeded built (Арена id 7, canBuildAt-OK якорь (1,9)) → вход → per-cell view (ровно 9 записей) → ОДИН building-спрайт 3Z×3Z от якоря; базовые 1×1 — один на видимую запись; errors 0', async () => {
  // Якорь built — чистая функция детерминированного мира: считаем
  // в чистом боте (до засева), сейвим в ANCHOR-записи.
  const h0 = await boot();
  const G0 = h0.sandbox.Game;
  const g0 = h0.sandbox.__game;
  const map0 = G0.createMap(G0.generateSeedPixels());
  const found0 = findNearest(G0, map0, g0.state.player,
    (t) => isCity264(G0, t), 700);
  assert.ok(found0, 'сценарий: город fp≥3 достижим пешком (BFS ≤ 700)');
  assert.equal(found0.t.buildingId, V264.buildingId,
    'фикстура: id 53 «Город»');
  assert.deepEqual(
    [found0.t.buildingAnchor[0], found0.t.buildingAnchor[1]],
    V264.anchor, 'фикстура: мировой якорь (93,18)');
  assert.deepEqual(found0.target,
    { x: V264.entrance[0], y: V264.entrance[1] },
    'фикстура: вход (95,22)');
  const fp0 = G0.getBuilding(found0.t.buildingId).размер.ширина;
  const L0 = G0.Cities.createCityLayout(
    found0.t.buildingAnchor[0], found0.t.buildingAnchor[1], fp0);
  assert.equal(L0.width, V264.layoutW, 'фикстура: layout 18×18');
  assert.deepEqual([L0.entrance.x, L0.entrance.y], V264.door,
    'фикстура: дверь (1,17)');
  const buildAnchor = findBuildAnchor264(G0, L0, found0.t);
  assert.ok(buildAnchor,
    'сценарий: canBuildAt-OK якорь id 7 существует (y ∈ 9..13)');
  assert.deepEqual(buildAnchor, V264.buildAnchor,
    'фикстура: якорь built (1,9)');
  const [wax, way] = found0.t.buildingAnchor;
  const h = await bootSeeded({
    day: 1, steps: 0, hero: HERO109,
    cities: { [wax + ',' + way]: { built: [{
      x: buildAnchor.x, y: buildAnchor.y, buildingId: 7, player: true,
    }] } },
  });
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findNearest(G, myMap, g.state.player,
    (t) => isCity264(G, t), 700);
  assert.ok(found, 'сценарий: город fp≥3 достижим (BFS ≤ 700)');
  walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg, 'в городе (dungeonState установлена)');
  assert.equal(dg.kind, 'city', 'экран города');
  assert.deepEqual([dg.entrance.x, dg.entrance.y], V264.door,
    'спавн на двери (1,17)');
  // ДАННЫЕ (000264 не меняет): live-вид — ровно 9 per-cell записей
  // id 7 (player:true) + built — ОДНА ANCHOR-запись.
  const arenaRecs = dg.buildings.filter((b) => b.buildingId === 7);
  assert.equal(arenaRecs.length, 9,
    'per-cell view: ровно 9 записей id 7 (3×3)');
  for (const b of arenaRecs)
    assert.equal(b.player, true, 'per-cell запись — player:true');
  const cs = g.cities[V264.anchor[0] + ',' + V264.anchor[1]];
  assert.ok(cs, 'сценарий: запись города в cityStates (ключ — якорь)');
  assert.deepEqual(JSON.parse(JSON.stringify(cs.built)), [
    { x: V264.buildAnchor.x, y: V264.buildAnchor.y, buildingId: 7,
      player: true },
  ], 'built — ANCHOR-запись (1,9)');
  // Камера start (снап к двери + clamp; 18×80 = 1440 > 1280/720).
  const clampCam = (v, extent, viewPx, z) => {
    if (extent * z <= viewPx) return extent / 2;
    const lo = viewPx / 2 / z;
    const hi = extent - viewPx / 2 / z;
    return Math.min(hi, Math.max(lo, v));
  };
  const Z = 80;
  const CAMX = clampCam(dg.entrance.x + 0.5, dg.width, VIEW_W, Z);
  const CAMY = clampCam(dg.entrance.y + 0.5, dg.height, VIEW_H, Z);
  assert.equal(CAMX, V264.cam[0],
    'фикстура: cam.x = 8 (дверь (1,17) → clamp [8, 10])');
  assert.equal(CAMY, V264.cam[1],
    'фикстура: cam.y = 13.5 (clamp [4.5, 13.5])');
  const canvas = findLastCanvas(h.body);
  assert.ok(canvas && Array.isArray(canvas.drawCalls),
    'оверлей dungeon-ui: canvas в дереве body (drawCalls)');
  // Резолв id → путь слот-спрайта (тот же, что код и тест G1).
  const resolve = (id, now, x, y) => {
    const rec = G.getBuilding(id);
    const op = (rec && rec.особые_параметры) || {};
    const slot = Number.isInteger(op.map_index) ? op.map_index
      : (op.размещение && Number.isInteger(op.размещение.слот)
         ? op.размещение.слот : null);
    if (slot == null) return null;
    const frames = typeof G.buildingFrames === 'function'
      ? G.buildingFrames(slot) : null;
    if (frames && frames.length > 1
        && typeof G.buildingFrameIndex === 'function')
      return frames[G.buildingFrameIndex(now, x, y, frames.length)];
    return G.buildingSprite(slot);
  };
  const arenaPath = resolve(7, NOW, V264.buildAnchor.x,
    V264.buildAnchor.y);
  assert.equal(arenaPath, 'assets/sprites/buildings/arena.svg',
    'фикстура: id 7 → слот 4 — статичный arena.svg');
  assertArenaRender(canvas.drawCalls, G, dg, CAMX, CAMY, Z, arenaPath,
    resolve);
  assert.equal(h.errors.length, 0, 'ошибок нет: ' + h.errors.join('; '));
});

test('000264 E2 (RED): e2e — тот же сценарий + demolish: walkCity на клетку Арены (1,9) → [E] → «Разобрать (возврат 120 з., Кожа ×2)» → клик → 9 per-cell записей удалены, built чист (дубль CI-U19); ЯВНЫЙ render → крупный спрайт ИСЧЕЗ; базовые 1×1 на месте; errors 0', async () => {
  // Тот же сетап, что E1 (детерминированно: тот же якорь/вход).
  const h0 = await boot();
  const G0 = h0.sandbox.Game;
  const g0 = h0.sandbox.__game;
  const map0 = G0.createMap(G0.generateSeedPixels());
  const found0 = findNearest(G0, map0, g0.state.player,
    (t) => isCity264(G0, t), 700);
  assert.ok(found0, 'сценарий: город fp≥3 достижим (BFS ≤ 700)');
  const fp0 = G0.getBuilding(found0.t.buildingId).размер.ширина;
  const L0 = G0.Cities.createCityLayout(
    found0.t.buildingAnchor[0], found0.t.buildingAnchor[1], fp0);
  const buildAnchor = findBuildAnchor264(G0, L0, found0.t);
  assert.ok(buildAnchor, 'сценарий: canBuildAt-OK якорь id 7');
  assert.deepEqual(buildAnchor, V264.buildAnchor,
    'фикстура: якорь built (1,9)');
  const [wax, way] = found0.t.buildingAnchor;
  const h = await bootSeeded({
    day: 1, steps: 0, hero: HERO109,
    cities: { [wax + ',' + way]: { built: [{
      x: buildAnchor.x, y: buildAnchor.y, buildingId: 7, player: true,
    }] } },
  });
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findNearest(G, myMap, g.state.player,
    (t) => isCity264(G, t), 700);
  assert.ok(found, 'сценарий: город fp≥3 достижим (BFS ≤ 700)');
  walkTiles(h, NOW, found.steps);
  const dg = g.dungeon;
  assert.ok(dg && dg.kind === 'city', 'в городе');
  assert.deepEqual([dg.entrance.x, dg.entrance.y], V264.door,
    'спавн на двери (1,17)');
  const Z = 80;
  const clampCam = (v, extent, viewPx, z) => {
    if (extent * z <= viewPx) return extent / 2;
    const lo = viewPx / 2 / z;
    const hi = extent - viewPx / 2 / z;
    return Math.min(hi, Math.max(lo, v));
  };
  const CAMX = clampCam(dg.entrance.x + 0.5, dg.width, VIEW_W, Z);
  const CAMY = clampCam(dg.entrance.y + 0.5, dg.height, VIEW_H, Z);
  const canvas = findLastCanvas(h.body);
  assert.ok(canvas && Array.isArray(canvas.drawCalls),
    'оверлей dungeon-ui: canvas в дереве body (drawCalls)');
  const resolve = (id, now, x, y) => {
    const rec = G.getBuilding(id);
    const op = (rec && rec.особые_параметры) || {};
    const slot = Number.isInteger(op.map_index) ? op.map_index
      : (op.размещение && Number.isInteger(op.размещение.слот)
         ? op.размещение.слот : null);
    if (slot == null) return null;
    const frames = typeof G.buildingFrames === 'function'
      ? G.buildingFrames(slot) : null;
    if (frames && frames.length > 1
        && typeof G.buildingFrameIndex === 'function')
      return frames[G.buildingFrameIndex(now, x, y, frames.length)];
    return G.buildingSprite(slot);
  };
  const arenaPath = resolve(7, NOW, V264.buildAnchor.x,
    V264.buildAnchor.y);
  // RED (как E1): первый кадр — ОДИН крупный спрайт от якоря.
  assertArenaRender(canvas.drawCalls, G, dg, CAMX, CAMY, Z, arenaPath,
    resolve);
  // Ходьба в городе на клетку Арены (1,9) — синхронный L-путь
  // (каждый шаг keydown → onMove + render; кадры мира не нужны).
  walkCity202(h, cityWalkL({ x: dg.entrance.x, y: dg.entrance.y },
    V264.buildAnchor));
  assert.equal(g.dungeon.x, V264.buildAnchor.x,
    'герой на клетке Арены: x');
  assert.equal(g.dungeon.y, V264.buildAnchor.y,
    'герой на клетке Арены: y');
  // До-статистика (бой по маршруту может дать лут/золото —
  // ассерты по ДИФФЕРЕНЦИАЛУ).
  const gold0 = g.state.hero.gold;
  const qtyOf = (id) => (g.state.hero.inventory || [])
    .filter((e) => e && e.id === id)
    .reduce((s, e) => s + (e.qty || 0), 0);
  const hide0 = qtyOf('hide');
  // [E] на постройке игрока — buildingUI-меню со строкой «Разобрать».
  press(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true,
    '[E] на постройке игрока — buildingUI (000071)');
  const ov = findBuildingOverlay(h.body);
  assert.ok(ov, 'оверлей buildingUI прикреплён к body');
  const demRow = findRowByText(ov,
    'Разобрать (возврат ' + V264.refund + ' з., Кожа ×2)');
  assert.ok(demRow,
    'RED: строка «Разобрать (возврат 120 з., Кожа ×2)» в меню '
    + '(дубль CI-U19 в e2e)');
  // Клик — делегированный onOverlayClick строки. Песочница
  // city-screen без closest()/data-* в стабе — target-заглушка с
  // контрактом строки (closest('[data-buid]') → строка,
  // dataset.buid = 'demolish'); РЕАЛЬНЫЙ обработчик выполняет
  // РЕАЛЬНЫЙ demolish (building-actions.js).
  const fakeRow = {
    dataset: { buid: 'demolish' },
    disabled: false,
    closest: (sel) => (sel === '[data-buid]' ? fakeRow : null),
  };
  ov.listeners.click[0]({ target: fakeRow });
  assert.equal(G.buildingUI.isActive(), false,
    'оверлей закрыт действием (executeAction)');
  // ДАННЫЕ (дубль CI-U19 в e2e): 9 per-cell записей удалены
  // in-place из live-вида, built чист, возврат 120 з. + Кожа ×2.
  assert.equal(dg.buildings.filter((b) => b.buildingId === 7).length,
    0, 'per-cell записи id 7 удалены из live-вида (9 → 0)');
  const cs2 = g.cities[V264.anchor[0] + ',' + V264.anchor[1]];
  assert.deepEqual(JSON.parse(JSON.stringify(cs2.built)), [],
    'built чист (ANCHOR-запись удалена)');
  assert.equal(g.state.hero.gold, gold0 + V264.refund,
    'золото +' + V264.refund + ' (возврат floor(400·30/100))');
  assert.equal(qtyOf('hide'), hide0 + 2,
    'Кожа +2 (возврат floor 30% от ×8)');
  // ЯВНЫЙ повторный рендер (rAF в песочнице нет; demolish сам
  // рендер НЕ вызывает).
  const nBefore = canvas.drawCalls.length;
  G.dungeonUI.render(NOW);
  const callsAll = canvas.drawCalls;
  assert.ok(callsAll.length > nBefore, 'render добавил кадр');
  // Срез ПОСЛЕДНЕГО рендера: от последнего full-viewport fillRect
  // #0a0d12 (каждый render начинается с него, dungeon-ui.js:
  // 462–463).
  let lastBg = -1;
  for (let i = callsAll.length - 1; i >= 0; i--) {
    const c = callsAll[i];
    if (c[0] === 'fillRect' && c[1][0] === 0 && c[1][1] === 0
        && c[1][2] === VIEW_W && c[1][3] === VIEW_H
        && c[2] === '#0a0d12') {
      lastBg = i;
      break;
    }
  }
  assert.ok(lastBg >= 0, 'последний full-viewport фон #0a0d12');
  const seg = callsAll.slice(lastBg + 1);
  // Крупный спрайт ИСЧЕЗ; клеток Арены — без 1×1-спрайтов.
  const segBuilding = seg.filter((c) =>
    c[0] === 'drawImage' && c[1][0]
    && typeof c[1][0].__src === 'string'
    && c[1][0].__src.indexOf('assets/sprites/buildings/') === 0);
  const pa = G.worldToScreen(V264.buildAnchor.x, V264.buildAnchor.y,
    CAMX, CAMY, Z, VIEW_W, VIEW_H);
  const bigSeg = segBuilding.filter((c) =>
    Math.abs(c[1][1] - pa.x) <= 1e-9
    && Math.abs(c[1][2] - pa.y) <= 1e-9
    && c[1][3] === 3 * Z && c[1][4] === 3 * Z);
  assert.equal(bigSeg.length, 0,
    'крупный спрайт Арены после demolish — ИСЧЕЗ');
  for (let dy = 0; dy < 3; dy++)
    for (let dx = 0; dx < 3; dx++) {
      const cp = G.worldToScreen(V264.buildAnchor.x + dx,
        V264.buildAnchor.y + dy, CAMX, CAMY, Z, VIEW_W, VIEW_H);
      const small = segBuilding.filter((c) =>
        Math.abs(c[1][1] - cp.x) <= 1e-9
        && Math.abs(c[1][2] - cp.y) <= 1e-9
        && c[1][3] === Z && c[1][4] === Z);
      assert.equal(small.length, 0,
        'клетка бывшей Арены (' + (V264.buildAnchor.x + dx) + ','
        + (V264.buildAnchor.y + dy) + ') — без 1×1-спрайта');
    }
  // Базовые 1×1 — на месте (один на видимую запись).
  const range = G.visibleTileRange(CAMX, CAMY, VIEW_W, VIEW_H, Z);
  const x0 = Math.max(0, range.x0);
  const x1 = Math.min(dg.width - 1, range.x1);
  const y0 = Math.max(0, range.y0);
  const y1 = Math.min(dg.height - 1, range.y1);
  const baseRecs = dg.buildings.filter((b) => b.buildingId !== 7);
  let expectedVisible = 0;
  for (const b of baseRecs) {
    const bPath = resolve(b.buildingId, NOW, b.x, b.y);
    const inView = b.x >= x0 && b.x <= x1 && b.y >= y0 && b.y <= y1;
    const bp = G.worldToScreen(b.x, b.y, CAMX, CAMY, Z, VIEW_W, VIEW_H);
    const at = segBuilding.filter((c) =>
      Math.abs(c[1][1] - bp.x) <= 1e-9
      && Math.abs(c[1][2] - bp.y) <= 1e-9
      && c[1][3] === Z && c[1][4] === Z);
    if (inView && bPath) {
      expectedVisible += 1;
      assert.equal(at.length, 1,
        'базовая (' + b.x + ',' + b.y + ') id ' + b.buildingId
        + ' — 1×1-спрайт НА МЕСТЕ после demolish');
    } else {
      assert.equal(at.length, 0,
        'базовая (' + b.x + ',' + b.y + ') id ' + b.buildingId
        + ' — без спрайта (клип/skip)');
    }
  }
  const smallsSeg = segBuilding.filter((c) =>
    c[1][3] === Z && c[1][4] === Z);
  assert.equal(smallsSeg.length, expectedVisible,
    '1×1-спрайтов после demolish — ровно по видимым базовым '
    + 'записям; сейчас: ' + smallsSeg.length);
  assert.equal(h.errors.length, 0,
    'ошибок нет: ' + h.errors.join('; '));
});

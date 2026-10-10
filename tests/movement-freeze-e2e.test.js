// Задача 000170 — «Иногда зависает движение персонажа» (мержи 2026.10.07):
// КРАСНЫЕ тесты (TDD).
//
// Новый e2e-файл (собственный vm-хarness, паттерн прецедентов
// resurrect-e2e / city-screen / camp-map-e2e): ПОЛНАЯ цепочка index.html
// (браузерная ветка UMD), стабы DOM/WebGL/localStorage,
// performance.now — monotonичный (кадры +200 мс), мир детерминированный
// (map.png ВСЕГДА onerror → G.generateSeedPixels).
//
// Диагностика (контракт: memory/000170-movement-freeze.md): баг-класс
// «заморозка ввода без механизма восстановления», ДВА бага:
//   Баг 1 (детерминированный, 100% на тач) — пикер «Воскрешение»
//   (000162, мерж 9768efe 10-07): DOM без кликабельных элементов,
//   D-pad/кнопки скрыты (resurrect → building), frame-гейт inResurrect
//   блокирует tryMove — тач-пути закрытия НЕТ → постоянная заморозка.
//   Баг 2 (нendетерминированный, реальный браузер) — исключение в
//   input-критичной точке жизненного цикла ВЕЧНО убивает/отравляет
//   ввод (rAF-цепь frame, ctx боя, флаг пикера, dungeonState — нет
//   механизмов восстановления; мержи 10-07/10-09 расширили
//   исключительную поверхность ровно в этих точках).
//
// RED-состав (6 тестов — функциональность/гард еще не существует):
//   T1 — пикер (тач): клик .resurrect-close → пикер закрыт → D-pad ведёт
//        (на master: элемента .resurrect-close НЕТ — open() строит
//        только title/rows/hint; тач-путей закрытия 0 → заморозка).
//   T2 — watchdog frame(): исключение в кадре (hud.update) НЕ убивает
//        rAF-цепь; клавиша → шаг (на master: исключение до
//        requestAnimationFrame(frame) — цикл мёртв, keys не
//        потребляется → «игра не реагирует», ВЕЧНО).
//   T3 — startCombat: исключение build() (canvas) НЕ улетает вызывателю,
//        не оставляет активного состояния; повторный бой стартует
//        (на master: ctx={open:true} присвоен ДО build() →
//        isActive()===true застревает → гейты мира/подземелья/exit-тайла
//        закрыты навсегда).
//   T4 — finish(): исключение addEfirXp НЕ роняет finish; оверлей снят,
//        ctx обнулён, onEnd применён (на master: throw в addEfirXp →
//        оверлей в DOM (тач мёртв), onEnd не вызван (награды/подъём
//        потеряны), ctx не обнулён, исключение улетело).
//   T5 — exit-тайл: исключение в onDay (playerUI.render) при выходе НЕ
//        оставляет героя в подземельи; dungeonState снят, dungeonUI
//        закрыт, день+1, мир идёт (на master: throw пропускает
//        dungeonState=null + dungeonUI.close() → застряли; КАЖДАЯ
//        повторная попытка выхода снова срабатывает {type:'exit'} —
//        дни уходят, позиция не сдвигается).
//   T6 — confirmResurrect: исключение в w.saveNow НЕ оставляет пикер
//        открытым; мутации применены, пикер закрыт (на master: throw
//        в saveNow ДО close() → active=true ВЕЧНО → гейты keydown/frame
//        закрыты навсегда).
//
// Защитные пины (GREEN до и после — фикс не должен их сломать):
//   T7 — карта: клавиша → шаг (канал клавиш жив).
//   T8 — подземелье: спавн на совмещённом тайле (000177: вход =
//        выход), [E] → выход, день+1, главный цикл жив (ТЧ ТЗ
//        «входит на выходную клетку» — с 000177 герой СПАВНИТСЯ
//        на выходной клетке).
//   T9 — пикер (десктоп): пока открыт — клавиши НЕ в keys, движения нет
//        (модал-семантика НЕ деградирует: тач-кнопка не разблокирует
//        клавиши при открытом пикере); Esc → движение возобновилось.
//   T10 — окно смерти (000164): гибель (partyLost) через яд-тик
//        (000164 точка 2, 0 RNG) → подъём → движение возобновилось.
//
// Контракты (memory/000170-movement-freeze.md §5):
//   * frame() — цикл гарантированно продолжается при ЛЮБОМ исключении;
//   * exitLocation — после ЛЮБОЙ попытки выхода dungeonState=null +
//     dungeonUI.close() + saveNow() (finally);
//   * startCombat — null при неудаче build/render, без активного
//     состояния (ctx=null, ended=false, оверлей снят); повторный вызов
//     стартует норм;
//   * finish — ВСЕГДА снимает оверлей, обнуляет ctx, вызывает onEnd;
//   * resurrect-пикер — DOM = title + rows + hint + div.resurrect-close
//     (click → close()); гейты R-3 и Q-2 без изменений.
//
// Ввод: vm-диспетч по захваченным window-слушателям; listener пикера
// (вешается при open) виден СЛЕДУЮЩИМ нажатиям (снaпшот массива до
// диспетча — семантика браузерного DOM). rAF — все записи в h.raf,
// raf[0] = main frame (пере планирует себя той же функцией); детектор
// смерти цикла — рост h.raf.length после вызова кадра.
//
// Инъекции (UMD-ловушка 000038): через свойства ОБЪЕКТОВ-ЭКСПОРТОВ
// (G.hud.update / G.efir.addEfirXp / G.playerUI.render — общие ссылки
// для всех снапшотов G), НЕ переприсваиванием Game.X. document —
// общий объект closure всех модулей → обёртка createElement действует
// на build() боя.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { SAVE_KEY } = require('../src/save.js');
const P = require('../src/player.js');
const { NPCS } = require('../src/npc-data.js');

const ROOT = path.join(__dirname, '..');
const NOW = 1000; // performance.now() в песочнице — база monotonичного now

// --- Цепочка скриптов — из index.html ---
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

function makeContext2d(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

// --- «Снисходительный» DOM-элемент с деревом (дети/родитель,
// dataset, closest, querySelector) — паттерн resurrect-e2e ---

function matchesSel(el, sel) {
  // Поддерживает: 'tag', '.class', '[attr]', '[attr="value"]' и их
  // композиты без пробела ('button[data-buid]').
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
  // textContent — как в DOM: сбрасывает детей.
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

// Рекурсивный текст элемента (ассерты содержимого строк пикера).
function textOf(n) {
  let s = String(n.textContent || '');
  for (const ch of n.children || []) s += textOf(ch);
  return s;
}

// --- localStorage-мок: seed ДОСЕЯН ДО запуска цепочки (main.js
// читает сейв синхронно при загрузке) ---

function makeStorage(seed) {
  const m = new Map();
  if (seed != null) m.set(SAVE_KEY, JSON.stringify(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// Оболочка досеянного сейва (v1).
function seedSave(data) {
  return { version: 1, savedAt: new Date(0).toISOString(), data };
}

// --- Песочница: вся цепочка index.html (браузерная ветка UMD) ---

function bootSandbox(seed, search) {
  const winListeners = {};
  const raf = [];
  const errors = [];
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
  // #game — WebGL (без него main.js уходит в фолбэк-ветку).
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
    location: { search: search || '' },
    localStorage: storage,
    confirm: () => false,
    // Семантика браузерного window: повторный add — no-op, remove —
    // реально снимает (иначе накапливались устаревшие keydown).
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
  // фолбэк G.generateSeedPixels), остальные — onload.
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
  return { sandbox, winListeners, raf, errors, storage, body, hud, document };
}

// Промывка микротасков (Image + loadMapPixels().then: карта, спавн,
// restoreFromSave, requestAnimationFrame).
const drain = () => new Promise((r) => setImmediate(r));

async function boot(seed, search) {
  const h = bootSandbox(seed, search);
  await drain();
  await drain();
  await drain();
  const g = h.sandbox.__game;
  assert.ok(g && g.state.map, '__game выставлен, карта загружена');
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  return h;
}

// --- Ввод: диспетч по захваченным window-слушателям ---
// ВАЖНО: массив слушателей СНАПШОТИТСЯ перед диспетчем — слушатель,
// зарегистрированный ВО ВРЕМЯ диспетча (пикер вешает свой keydown
// при open), текущее событие НЕ видит (семантика браузерного DOM).
// Listener пикера виден ПОСЛЕДУЮЩИМ нажатиям.

function key(h, code, extra = {}) {
  const e = Object.assign(
    { code, key: code, preventDefault() {}, stopPropagation() {} }, extra);
  for (const fn of (h.winListeners['keydown'] || []).slice()) fn(e);
  return e;
}

function keyup(h, code) {
  const e = { code, key: code, preventDefault() {}, stopPropagation() {} };
  for (const fn of (h.winListeners['keyup'] || []).slice()) fn(e);
}

// КАДР ГЛАВНОГО ЦИКЛА: все rAF-записи main-цикла — одна функция frame
// (requestAnimationFrame(frame) в конце frame + первичная на старт) →
// raf[0] — main frame ВЕЧНО. УСПЕШНЫЙ кадр дописывает СВОЮ запись
// reschedule → h.raf.length растёт; МЁРТВЫЙ цикл — нет.
function mainFrameAt(h, now) {
  h.raf[0](now);
}

// Кадр с ловлей (для watchdog-сценариев: на master исключение
// улетает вызывателю).
function tryMainFrameAt(h, now) {
  let err = null;
  try {
    mainFrameAt(h, now);
  } catch (e) {
    err = e;
  }
  return err;
}

// --- Наблюдение ---

const host = (o) => JSON.parse(JSON.stringify(o));

// Оверлей buildingUI — .combat-overlay без npc-overlay.
function findOverlay(h) {
  const all = findAll(h.body, '.combat-overlay');
  return all.find((o) => !String(o.className).includes('npc-overlay'))
    || null;
}

// Строка действия buildingUI по id (dataset.buid).
function findRow(overlay, id) {
  return findAll(overlay, '[data-buid]')
    .find((r) => r.dataset.buid === id) || null;
}

// Клик по строке: делегированный обработчик оверлея.
function clickRow(h, overlay, id) {
  const clickers = overlay.listeners.click || [];
  assert.ok(clickers.length >= 1,
    'на оверлее есть делегированный click-обработчик');
  const row = findRow(overlay, id);
  assert.ok(row, 'строка действия ' + id + ' найдена в оверлее');
  clickers[0]({ target: row });
  return row;
}

// Пикер 000162 — СВОЙ класс .resurrect-overlay (НЕ .combat-overlay).
function findResurrectOverlay(h) {
  return findAll(h.body, '.resurrect-overlay')[0] || null;
}

// --- Герой и погибшие (формы resurrect-e2e) ---

function mkHero(over = {}) {
  return Object.assign(P.createCharacter(), over);
}

// Запись о погибшем (000161, форма сейва 000143): {npcId, sheet,
// loyalty, hiredDay}; level/xp ВНУТРИ sheet (канонический merc-лист
// 10 ключей — sanitizeMercSheet: sheet.npcId === npcId, иначе revive
// → null → запись отброшена как подделка).
function deadRecord(npcId, over = {}) {
  const npc = NPCS.find((n) => n.id === npcId);
  assert.ok(npc && npc.найм, 'тест: каталожный NPC с наймом: ' + npcId);
  const h = npc.найм;
  const secondary = {};
  for (const [id, lv] of Object.entries(h.начальные_навыки || {})) {
    if (Number.isInteger(lv) && lv >= 1) secondary[id] = lv;
  }
  const sheet = Object.assign({
    kind: 'merc',
    level: 1, xp: 0, totalXp: 0, points: 0,
    primary: Object.assign({}, h.базовые_характеристики),
    secondary,
    skillXp: {},
    spells: (h.spells || []).slice(),
    npcId: npcId,
  }, over.sheet);
  const rec = { npcId, sheet, loyalty: 70, hiredDay: 5 };
  if (over.loyalty !== undefined) rec.loyalty = over.loyalty;
  if (over.hiredDay !== undefined) rec.hiredDay = over.hiredDay;
  return rec;
}

// --- Ход игрока (глобальная карта, клавиши) ---

function keydownFor(dx, dy) {
  return dx === 1 ? 'ArrowRight' : dx === -1 ? 'ArrowLeft'
    : dy === 1 ? 'ArrowDown' : 'ArrowUp';
}

// BFS до храма wantId по правилам игрока (4 направления, passable,
// без групп мобов; промежуточные постройки/пещеры/города — не цели,
// обход). Возвращает { tile, steps }.
function findTempleById(G, myMap, start, wantId) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const startKey = start.x + ',' + start.y;
  const visited = new Set([startKey]);
  const prev = new Map();
  let frontier = [{ x: start.x, y: start.y }];
  for (let depth = 0; depth < 400 && frontier.length; depth++) {
    const next = [];
    for (const cur of frontier) {
      for (const [dx, dy] of DIRS) {
        const nx = cur.x + dx, ny = cur.y + dy;
        const k = nx + ',' + ny;
        if (visited.has(k)) continue;
        const t = myMap.tileAt(nx, ny);
        if (!t.passable || t.hasMobGroup) continue;
        if (t.hasBuilding) {
          if (t.building === G.BUILDING_TYPES.CAVE_ENTRANCE) continue;
          if (t.building === G.BUILDING_TYPES.NONE) continue; // город
        }
        visited.add(k);
        prev.set(k, cur.x + ',' + cur.y);
        if (t.hasBuilding && t.building === G.BUILDING_TYPES.TEMPLE
            && t.buildingId === wantId) {
          const steps = [];
          let kk = k;
          while (kk !== startKey) {
            const [px, py] = kk.split(',').map(Number);
            steps.unshift([px, py]);
            kk = prev.get(kk);
          }
          return { tile: t, steps };
        }
        next.push({ x: nx, y: ny });
      }
    }
    frontier = next;
  }
  return null;
}

// BFS до пещеры (CAVE_ENTRANCE, buildingId ≠ 48 — НЕ развалины).
function findCaveById(G, myMap, start) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const startKey = start.x + ',' + start.y;
  const visited = new Set([startKey]);
  const prev = new Map();
  let frontier = [{ x: start.x, y: start.y }];
  for (let depth = 0; depth < 400 && frontier.length; depth++) {
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
        if (t.hasBuilding
            && t.building === G.BUILDING_TYPES.CAVE_ENTRANCE
            && t.buildingId !== 48) {
          const steps = [];
          let kk = k;
          while (kk !== startKey) {
            const [px, py] = kk.split(',').map(Number);
            steps.unshift([px, py]);
            kk = prev.get(kk);
          }
          return { tile: t, steps };
        }
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

// Ход по шагам BFS: keydown → кадры +200 мс (один кадр ≤ один ход) →
// keyup. 000135: zone-бой по маршруту — авторазрешение (мобы 9999 →
// Space; Эфир не убиваем).
function walkTo(h, steps) {
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  let now = NOW;
  for (let i = 0; i < steps.length; i++) {
    const [fx, fy] = i === 0
      ? [g.state.player.x, g.state.player.y]
      : steps[i - 1];
    const [tx, ty] = steps[i];
    const dx = tx - fx, dy = ty - fy;
    assert.ok(Math.abs(dx) + Math.abs(dy) === 1, 'BFS: шаг по соседнему');
    const code = keydownFor(dx, dy);
    key(h, code);
    let guard = 0;
    do {
      now += 200;
      mainFrameAt(h, now);
    } while ((g.state.player.x !== tx || g.state.player.y !== ty)
      && ++guard < 12);
    keyup(h, code);
    assert.ok(g.state.player.x === tx && g.state.player.y === ty,
      'сценарий: игрок не перешёл на (' + tx + ',' + ty + ')');
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
  for (let i = 0; i < 4; i++) {
    now += 200;
    mainFrameAt(h, now);
  }
  return now;
}

// Проходной сосед от позиции (для контроля «движение есть»).
function passableDir(G, myMap, x, y) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of DIRS) {
    const t = myMap.tileAt(x + dx, y + dy);
    if (t && t.passable && !t.hasMobGroup) return [dx, dy];
  }
  return null;
}

// Держим клавишу до первого шага (≤12 кадров) или до guard; keyup в
// конце. Возвращает { moved, now }.
function holdUntilStep(h, code, now) {
  const g = h.sandbox.__game;
  const x0 = g.state.player.x, y0 = g.state.player.y;
  key(h, code);
  for (let i = 0; i < 12; i++) {
    now += 200;
    tryMainFrameAt(h, now);
    if (g.state.player.x !== x0 || g.state.player.y !== y0) break;
  }
  keyup(h, code);
  return {
    moved: g.state.player.x !== x0 || g.state.player.y !== y0,
    now,
  };
}

// --- Тач D-pad (схема ?controls=touch) ---

function findTouchRoot(h) {
  const walk = (n) => {
    for (const ch of n.children || []) {
      if (ch.id === 'touch-controls') return ch;
      const r = walk(ch);
      if (r) return r;
    }
    return null;
  };
  return walk(h.body);
}

function dpadPoint(G, dir) {
  const L = G.layoutTouchControls(1280, 720, { bottomInset: 0 });
  const d = L.dpad;
  const off = d.w * 0.30;
  const pos = {
    up: [d.w / 2, d.w / 2 - off],
    down: [d.w / 2, d.w / 2 + off],
    left: [d.w / 2 - off, d.h / 2],
    right: [d.w / 2 + off, d.h / 2],
  };
  return { x: d.x + pos[dir][0], y: d.y + pos[dir][1] };
}

function dpadNameFor(dx, dy) {
  return dx === 1 ? 'right' : dx === -1 ? 'left'
    : dy === 1 ? 'down' : 'up';
}

function dpadTap(h, dir) {
  const root = findTouchRoot(h);
  assert.ok(root, '#touch-controls собран (схема touch)');
  const dpad = (root.children || []).find(
    (c) => String(c.className).includes('tc-dpad'));
  assert.ok(dpad, 'D-pad есть в #touch-controls');
  const G = h.sandbox.Game;
  const p = dpadPoint(G, dir);
  const down = (dpad.listeners.pointerdown || []);
  assert.ok(down.length >= 1, 'у D-pad есть pointerdown');
  down[0]({
    clientX: p.x, clientY: p.y, pointerId: 1,
    preventDefault() {},
  });
  return dpad;
}

function dpadRelease(h) {
  const root = findTouchRoot(h);
  const dpad = (root.children || []).find(
    (c) => String(c.className).includes('tc-dpad'));
  for (const fn of (dpad.listeners.pointerup || []).slice()) {
    fn({ pointerId: 1, preventDefault() {} });
  }
}

// Тач-шаг: taп направления → кадры до шага (≤12) → отпускание.
function touchStep(h, dx, dy, now) {
  const g = h.sandbox.__game;
  const x0 = g.state.player.x, y0 = g.state.player.y;
  dpadTap(h, dpadNameFor(dx, dy));
  for (let i = 0; i < 12; i++) {
    now += 200;
    tryMainFrameAt(h, now);
    if (g.state.player.x !== x0 || g.state.player.y !== y0) break;
  }
  dpadRelease(h);
  return {
    moved: g.state.player.x !== x0 || g.state.player.y !== y0,
    now,
  };
}

// --- Подземелье: выход (000177) ---
// Вход = выход — ЕДИНЫЙ тайл (000177): герой спавнится НА выходной
// клетке, выход — [E] стоя на ней (BFS-путь к exit-клетке упразднён:
// layout больше не содержит отдельного exit-тайла).

// =====================================================================
// T1. пикер «Воскрешение» (тач): клик .resurrect-close → пикер
//     закрыт тачем → D-pad ведёт персонажа (КРАСНЫЙ)
// =====================================================================

test('T1. пикер (тач): клик .resurrect-close закрывает пикер, движение тачем возобновляется', async () => {
  const h = await boot(seedSave({
    day: 5,
    hero: mkHero({ gold: 100 }),
    companions: [],
    dead_mercs: [deadRecord('merc_volk', {
      sheet: { level: 3, xp: 100, totalXp: 100 },
    })],
  }), '?controls=touch');
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  assert.equal(g.state.controls, 'touch', 'схема — touch (URL-переопределение)');
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findTempleById(G, myMap, g.state.player, 36);
  assert.ok(found, 'сценарий: достижимый храм солнца (buildingId 36)');
  assert.ok(found.steps.length > 0, 'сценарий: путь не пуст');
  let now = walkTo(h, found.steps);
  const t = myMap.tileAt(g.state.player.x, g.state.player.y);
  assert.equal(t.buildingId, 36, 'игрок на храме солнца');
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, '[E] открывает buildingUI');
  const ov = findOverlay(h);
  assert.ok(ov, 'оверлей подвешен к body');
  clickRow(h, ov, 'resurrect');
  assert.equal(G.resurrectUI.isActive(), true, 'пикер открыт');
  const rov = findResurrectOverlay(h);
  assert.ok(rov, 'DOM пикера .resurrect-overlay');
  // (a) На тач-экране D-pad/кнопки скрыты (resurrect → building) —
  //     ЕДИНСТВЕННЫЙ путь снять заморозку — тач-элемент в DOM пикера.
  const dir = passableDir(G, myMap, g.state.player.x, g.state.player.y);
  assert.ok(dir, 'сценарий: проходной сосед на храме');
  // (b) КНОПКА ЗАКРЫТИЯ (000170, D1/D2): div.resurrect-close —
  //     последний ребёнок оверлея, click → close().
  const closeEl = findAll(rov, '.resurrect-close')[0] || null;
  assert.ok(closeEl,
    'в пикере «Воскрешение» есть тач-кнопка закрытия .resurrect-close '
    + '(000170: тач-путей закрытия нет — D-pad скрыт, frame-гейт '
    + 'inResurrect, заморозка мира на тач-устройстве)');
  const closeClickers = closeEl.listeners.click || [];
  assert.ok(closeClickers.length >= 1,
    'у .resurrect-close есть click-обработчик (close)');
  closeClickers[0]({ target: closeEl });
  assert.equal(G.resurrectUI.isActive(), false,
    'пикер закрыт тачем (клик .resurrect-close → close)');
  assert.equal(findResurrectOverlay(h), null, 'DOM пикера снят');
  // (c) Движение тачем возобновилось: тап D-pad → 'touch:<dir>' в
  //     keys → frame-гейт открыт → tryMove → шаг.
  const r = touchStep(h, dir[0], dir[1], now);
  assert.ok(r.moved,
    'после тач-закрытия пикера D-pad ведёт персонажа (frame-гейт '
    + 'inResurrect снят)');
  assert.ok(!g.state.keys.includes('touch:' + dpadNameFor(dir[0], dir[1])),
    'после отпускания keys чист');
});

// =====================================================================
// T2. watchdog frame(): исключение в кадре не убивает rAF-цепь
//     (КРАСНЫЙ)
// =====================================================================

test('T2. watchdog frame: исключение в кадре (hud.update) — цикл жив, клавиша ведёт', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  assert.equal(g.state.controls, 'keyboard', 'схема — keyboard (дефолт)');
  const myMap = G.createMap(G.generateSeedPixels());
  const dir = passableDir(G, myMap, g.state.player.x, g.state.player.y);
  assert.ok(dir, 'сценарий: проходной сосед от спавна');
  // Инъекция: исключение в renderHud (renderHud → G.hud.update —
  // КАЖДЫЙ кадр; G.hud — общий объект-экспорт, виден снапшоту main.js).
  const origUpdate = G.hud.update;
  G.hud.update = () => { throw new Error('T2-inject: hud.update'); };
  // (a) Кадр с исключением: исключение НЕ улетает вызывателю…
  const rafBefore = h.raf.length;
  const frameErr = tryMainFrameAt(h, NOW + 200);
  assert.equal(frameErr, null,
    'исключение в кадре не улетает из frame (watchdog, logged once)');
  // …и НЕ убивает rAF-цепь: reschedule случился (raf.length вырос).
  assert.ok(h.raf.length > rafBefore,
    'rAF-цепь frame жива после исключения в кадре: записей '
    + rafBefore + ' → ' + h.raf.length + ' (на master: исключение до '
    + 'requestAnimationFrame(frame) — цикл мёртв навсегда, listener\'ы '
    + 'живы, Set keys не потребляется — «игра не реагирует»)');
  // (b) Клавиша → шаг: ввод жив.
  const x0 = g.state.player.x, y0 = g.state.player.y;
  key(h, keydownFor(dir[0], dir[1]));
  assert.ok(g.state.keys.length === 1, 'клавиша попала в keys Set');
  for (let i = 0; i < 12; i++) {
    tryMainFrameAt(h, NOW + 200 + (i + 1) * 200);
    if (g.state.player.x !== x0 || g.state.player.y !== y0) break;
  }
  keyup(h, keydownFor(dir[0], dir[1]));
  G.hud.update = origUpdate;
  assert.ok(g.state.player.x !== x0 || g.state.player.y !== y0,
    'персонаж перешёл в ответ на клавишу (ввод не отравлен '
    + 'исключением кадра)');
});

// =====================================================================
// T3. startCombat: исключение build() (canvas) — бой не начался чисто,
//     активное состояние не осталось, повторный бой стартует
//     (КРАСНЫЙ)
// =====================================================================

test('T3. startCombat: исключение build() — нет утечки исключения, нет застрявшего состояния, повторный бой стартует', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  // Инъекция: document.createElement бросает ТОЛЬКО для 'canvas'
  // (build() L~207 — единственный canvas через createElement; мир/
  // спрайты — getElementById). document — общий объект closure всех
  // модулей.
  const origCreate = h.document.createElement;
  h.document.createElement = (tag) => {
    if (String(tag).toLowerCase() === 'canvas') {
      throw new Error('T3-inject: canvas');
    }
    return origCreate(tag);
  };
  const rafBeforeFail = h.raf.length;
  let threw = null;
  try {
    g.actions.startCombat(6);
  } catch (err) {
    threw = err;
  }
  h.document.createElement = origCreate;
  assert.equal(threw, null,
    'исключение build() НЕ улетело вызывателю (startCombat сам '
    + 'ловит и чистит; на master: ctx={open:true} присвоен ДО build() '
    + '→ isActive()===true застревает, исключение улетело вверх)');
  assert.equal(G.combatUI.isActive(), false,
    'боевого состояния нет: застрявший ctx НЕ остался '
    + '(на master: isActive()===true ВЕЧНО → гейты keydown/frame/'
    + 'dungeon закрыты → движение мира, подземелья и exit-тайла '
    + 'замертво)');
  assert.equal(G.combatUI.current(), null,
    'current() — null (ctx обнулён)');
  assert.equal(h.raf.length, rafBeforeFail,
    'неуспешный startCombat не оставил боевой rAF-цикл (tick не '
    + 'запущен)');
  const ov = findAll(h.body, '.combat-overlay--combat');
  assert.equal(ov.length, 0,
    'обломков боевого оверлея в DOM нет (overlay снят)');
  // (b) Восстановление: повторный бой стартует (self-heal: ended=false,
  //     ctx=null — зеркало post-state finish()).
  const c2 = g.actions.startCombat(6);
  assert.ok(c2, 'повторный startCombat — бой начался (self-heal)');
  assert.equal(G.combatUI.isActive(), true, 'повторный бой активен');
  assert.equal(G.combatUI.current(), c2, 'current() — новый бой');
  // (c) Мир не замёрз: гейты открыты, клавиша → шаг. (На master этот
  //     блок недостижим — isActive()===true застрял, но проверяем
  //     полное восстановление.)
  G.combatUI.handleCode('Escape'); // бой без result — Esc не закрывает
  assert.equal(G.combatUI.isActive(), true, 'без result бой открыт (Esc — no-op)');
  // Замыкаем бой честно (result victory), чтобы гейт открылся.
  c2.phase = 'over';
  c2.result = { outcome: 'victory', xp: 1, gold: 1, defeated: 1,
    allyXp: [] };
  G.combatUI.handleCode('Escape');
  assert.equal(G.combatUI.isActive(), false, 'бой закрыт');
  const dir = passableDir(G, myMap, g.state.player.x, g.state.player.y);
  assert.ok(dir, 'сценарий: проходной сосед от спавна');
  const r = holdUntilStep(h, keydownFor(dir[0], dir[1]), NOW);
  assert.ok(r.moved,
    'мировое движение не застряло после скомпрометированного '
    + 'startCombat (гейты combatUI открыты)');
});

// =====================================================================
// T4. finish(): исключение addEfirXp — бой закрыт, оверлей снят,
//     onEnd применён (КРАСНЫЙ)
// =====================================================================

test('T4. finish: исключение addEfirXp — оверлей снят, ctx обнулён, onEnd применён', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const c = g.actions.startCombat(6);
  assert.ok(c, 'боевой оверлей открыт (startCombat(6))');
  assert.equal(G.combatUI.isActive(), true, 'бой активен');
  c.phase = 'over';
  c.result = { outcome: 'victory', xp: 50, gold: 1, defeated: 1,
    allyXp: [] };
  // Инъекция: исключение в Г.efir.addEfirXp (finish: 100% боевого
  // опыта Эфиру — ДО onEnd; G.efir — общий объект-экспорт, виден
  // снапшоту combat-ui.js).
  const origAddXp = G.efir.addEfirXp;
  G.efir.addEfirXp = () => { throw new Error('T4-inject: addEfirXp'); };
  let threw = null;
  try {
    G.combatUI.handleCode('Escape');
  } catch (err) {
    threw = err;
  }
  G.efir.addEfirXp = origAddXp;
  assert.equal(threw, null,
    'исключение finish() НЕ улетело вызывателю (на master: throw в '
    + 'addEfirXp пробился через finish/handleCode наверх)');
  assert.equal(G.combatUI.isActive(), false, 'боевой гейт открыт');
  assert.equal(G.combatUI.current(), null,
    'ctx обнулён (на master: ctx != null — finish оборвался ДО '
    + 'ctx=null; следующий startCombat ломается)');
  const ov = findAll(h.body, '.combat-overlay--combat');
  assert.equal(ov.length, 0,
    'боевой оверлей снят из DOM (на master: оверлей остался — '
    + 'на тач-устройстве тач-ввод сворачивается оверлеем — МОБАЙЛ '
    + 'мёртв)');
  // onEnd применён: startCombatAt → hudFlash «Победа! +50 опыта…» →
  // кадр → HUD.
  mainFrameAt(h, NOW + 600);
  const hud = String(h.hud.textContent);
  assert.ok(hud.includes('Победа! +50 опыта'),
    'onEnd сработал (награды/подъём/dead-mercs-записи не потеряны): '
    + hud);
});

// =====================================================================
// T5. exit-тайл: исключение в onDay (playerUI.render) при выходе —
//     подземелье снято, день+1, мир идёт (КРАСНЫЙ)
// =====================================================================

test('T5. exit-тайл: исключение в onDay при выходе — dungeonState снят (finally), день+1, движение мира возобновилось', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const cave = findCaveById(G, myMap, g.state.player);
  assert.ok(cave, 'сценарий: пещера достижима пешком от спавна');
  let now = walkTo(h, cave.steps);
  const dg = g.dungeon;
  assert.ok(dg, 'вход в подземелье');
  // 000177: вход = выход — единый тайл: герой спавнится НА выходной
  // клетке, выход — [E] стоя на ней.
  assert.deepEqual({ x: dg.x, y: dg.y }, { x: dg.exit.x, y: dg.exit.y },
    '000177: спавн на едином тайле (exit = entrance)');
  const dayBefore = g.state.day;
  // Инъекция: исключение в G.playerUI.render (onDay — ЛЮБАЯ смена
  // дня: G.playerUI.render — новая DOM-поверхность 000145/146/152;
  // G.playerUI — общий объект-экспорт, виден снапшоту main.js).
  const origRender = G.playerUI.render;
  G.playerUI.render = () => { throw new Error('T5-inject: playerUI.render'); };
  // Выход (000177): [E] на едином тайле (синхронно, кадров нет).
  let err = null;
  try {
    key(h, 'KeyE');
  } catch (e) {
    err = e;
  }
  G.playerUI.render = origRender;
  assert.equal(err, null,
    'исключение попытки выхода НЕ улетело вызывателю (exitLocation '
    + 'ловит; на master: throw из onDay пробился через clock.event/'
    + 'exitDungeon/exitLocation/keydown наверх — listener-цепь мёртва)');
  assert.equal(g.dungeon, null,
    'exit-тайл: dungeonState снят (на master: throw в onDay '
    + 'пропускает dungeonState=null — герой застрял В подземельи '
    + 'на выходной клетке: повторный выход снова {type:exit} — дни '
    + 'уходят, позиция не сдвигается)');
  assert.equal(G.dungeonUI.isActive(), false,
    'dungeonUI закрыт (гейт world keydown/frame снова открыт)');
  assert.equal(g.state.day, dayBefore + 1,
    'на выходе из подземелья день проходит (clock.event — день+1)');
  // Движение мира возобновилось: герой на тайле пещеры, клавиша → шаг.
  const dir = passableDir(G, myMap, g.state.player.x, g.state.player.y);
  assert.ok(dir, 'сценарий: проходной сосед на тайле пещеры');
  const r = holdUntilStep(h, keydownFor(dir[0], dir[1]), now);
  assert.ok(r.moved,
    'движение мира возобновилось после выхода из подземелья '
    + '(dungeonState=null, frame-гейт !inDungeon открыт)');
});

// =====================================================================
// T6. confirmResurrect: исключение в w.saveNow — пикер закрыт,
//     мутации применены (КРАСНЫЙ)
// =====================================================================

test('T6. confirmResurrect: исключение в w.saveNow — пикер закрыт (close снаружи try), мутации применены', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  // World-бандл (deps-форма main.js) с инъекцией: w.saveNow бросает
  // (квота localStorage — реальный триггер; saveNow — ЕДИНСТВЕННАЯ
  // точка сейва пикера, ДО close()).
  const rec = deadRecord('merc_volk', {
    sheet: { level: 3, xp: 100, totalXp: 100 },
  });
  const flashes = [];
  let playerRenders = 0;
  const world = {
    hero: { gold: 100 },
    roster: [],
    deadMercs: [rec],
    npcs: NPCS,
    game: {
      companions: G.companions, // реальный reviveEntryFromRecord
      GlobalSettings: G.GlobalSettings,
    },
    flash: (s) => { flashes.push(String(s)); },
    saveNow: () => { throw new Error('T6-inject: saveNow'); },
    playerRender: () => { playerRenders++; },
  };
  G.resurrectUI.open({ world }, [{ record: rec, цена: 25 }]);
  assert.equal(G.resurrectUI.isActive(), true, 'пикер открыт (open)');
  assert.ok(findResurrectOverlay(h), 'DOM пикера подвешен');
  // Enter — подтверждение (listener пикера вешается при open — виден
  // СЛЕДУЮЩЕМУ диспетчу; main.js-гейт no-op на время пикера).
  let threw = null;
  try {
    key(h, 'Enter');
  } catch (err) {
    threw = err;
  }
  assert.equal(threw, null,
    'исключение confirmResurrect НЕ улетело вызывателю (watchdog '
    + 'завершения, logged once; на master: throw в w.saveNow пробился '
    + 'через confirmResurrect/onKey/keydown наверх)');
  assert.equal(G.resurrectUI.isActive(), false,
    'пикер ЗАКРЫТ после подтверждения (close — снаружи try, ВСЕГДА; '
    + 'на master: close() не достигнут → active=true ВЕЧНО → гейты '
    + 'keydown L1596 / frame inResurrect закрыты навсегда — мир '
    + 'не ходит)');
  assert.equal(findResurrectOverlay(h), null, 'DOM пикера снят');
  // Мутации (L208-211 — ДО saveNow) применены: воскрешение в памяти
  // (сейв потерян — допустимая деградация, лучше застрявшего флага).
  assert.equal(world.hero.gold, 75,
    'gold 100 − 25 (цена round(20+0.05×100), D2): мутации применены');
  assert.equal(world.roster.length, 1, 'roster — 1 запись (push)');
  assert.equal(world.roster[0].npcId, 'merc_volk', 'воскрешён — Вольк');
  assert.equal(world.roster[0].level, 3, 'зеркало level 3');
  assert.equal(world.deadMercs.length, 0,
    'запись удалена из deadMercs (splice)');
  assert.equal(playerRenders, 0,
    'playerRender НЕ выполнен (бросок ДО него — допустимо, не мутирует)');
  assert.ok(!flashes.some((s) => s.includes('снова в отряде')),
    'flash успеха не показан (бросок ДО flash — допустимая деградация)');
});

// =====================================================================
// T7. защитный пин: карта — клавиша → движение (канал клавиш жив)
// =====================================================================

test('T7. пин: клавиша перемещения → шаг на глобальной карте (vm-полная цепочка)', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  assert.equal(g.state.controls, 'keyboard', 'схема — keyboard (дефолт)');
  const myMap = G.createMap(G.generateSeedPixels());
  const dir = passableDir(G, myMap, g.state.player.x, g.state.player.y);
  assert.ok(dir, 'сценарий: проходной сосед от спавна');
  const x0 = g.state.player.x, y0 = g.state.player.y;
  const rafBefore = h.raf.length;
  key(h, keydownFor(dir[0], dir[1]));
  assert.ok(g.state.keys.length === 1, 'клавиша попала в keys Set');
  let now = NOW;
  for (let i = 0; i < 10; i++) {
    now += 200;
    mainFrameAt(h, now);
    if (g.state.player.x !== x0 || g.state.player.y !== y0) break;
  }
  keyup(h, keydownFor(dir[0], dir[1]));
  assert.ok(h.raf.length > rafBefore, 'rAF-цепь frame жива');
  const p = g.state.player;
  assert.ok(p.x !== x0 || p.y !== y0,
    'персонаж перешёл в ответ на клавишу (было ' + x0 + ',' + y0
    + ' стало ' + p.x + ',' + p.y + ')');
});

// =====================================================================
// T8. защитный пин: подземелье — спавн на совмещённом тайле (000177)
//     → [E] → выход, день+1 (ТЧ ТЗ «персонаж входит на выходную
//     клетку» — с 000177 герой спавнится прямо на ней)
// =====================================================================

test('T8. пин: подземелье — персонаж на совмещённом тайле, [E] (выход, день+1, цикл жив)', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const cave = findCaveById(G, myMap, g.state.player);
  assert.ok(cave, 'сценарий: пещера достижима пешком от спавна');
  let now = walkTo(h, cave.steps);
  const dg = g.dungeon;
  assert.ok(dg, 'вход в подземелье');
  assert.equal(G.dungeonUI.isActive(), true, 'dungeonUI активен');
  // 000177: единый тайл — персонаж спавнится НА выходной клетке.
  assert.deepEqual({ x: dg.x, y: dg.y }, { x: dg.exit.x, y: dg.exit.y },
    '000177: спавн на совмещённом тайле (exit = entrance)');
  const dayBefore = g.state.day;
  key(h, 'KeyE'); // 000177: [E] на едином тайле → exitLocation
  assert.equal(g.dungeon, null, 'exit-тайл: состояние снято');
  assert.equal(G.dungeonUI.isActive(), false, 'dungeonUI закрыт');
  assert.equal(g.state.day, dayBefore + 1,
    'на выходе из подземелья день проходит');
  // Главный цикл жив после выхода.
  const rafBefore = h.raf.length;
  mainFrameAt(h, now + 200);
  assert.ok(h.raf.length > rafBefore, 'rAF-цепь frame жива после выхода');
  // Герой на тайле пещеры в мире; движение не сломано.
  const t = myMap.tileAt(g.state.player.x, g.state.player.y);
  assert.equal(t.building, G.BUILDING_TYPES.CAVE_ENTRANCE,
    'герой — на тайле пещеры (мировой координаты не сдвинуты выходом)');
});

// =====================================================================
// T9. защитный пин: пикер (десктоп) — модал-семантика: пока открыт
//     клавиши НЕ в keys и движения нет; Esc → движение возобновилось
// =====================================================================

test('T9. пин: пикер (десктоп) — пока открыт ввод в блоке (модал не деградирует); Esc → движение возобновилось', async () => {
  const h = await boot(seedSave({
    day: 5,
    hero: mkHero({ gold: 100 }),
    companions: [],
    dead_mercs: [deadRecord('merc_volk', {
      sheet: { level: 3, xp: 100, totalXp: 100 },
    })],
  }));
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findTempleById(G, myMap, g.state.player, 36);
  assert.ok(found, 'сценарий: храм солнца (36) достижим');
  let now = walkTo(h, found.steps);
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, '[E] открыл buildingUI');
  const ov = findOverlay(h);
  assert.ok(ov, 'оверлей buildingUI подвешен');
  clickRow(h, ov, 'resurrect');
  assert.equal(G.resurrectUI.isActive(), true, 'пикер открыт');
  now += 200;
  mainFrameAt(h, now); // applyVisibility (пикер → building)
  // Движение в блоке: клавиша НЕ попадает в keys (гейт R-3) —
  // тач-кнопка закрытия НЕ разблокирует клавиши при открытом пикере.
  const dir = passableDir(G, myMap, g.state.player.x, g.state.player.y);
  assert.ok(dir, 'сценарий: проходной сосед на храме');
  const x0 = g.state.player.x, y0 = g.state.player.y;
  key(h, keydownFor(dir[0], dir[1]));
  assert.equal(g.state.keys.length, 0,
    'клавиша перемещения НЕ в keys (гейт пикера, R-3): '
    + JSON.stringify(g.state.keys));
  for (let i = 0; i < 12; i++) { now += 200; mainFrameAt(h, now); }
  keyup(h, keydownFor(dir[0], dir[1]));
  assert.equal(g.state.player.x, x0, 'x не изменился (движение в блоке)');
  assert.equal(g.state.player.y, y0, 'y не изменился (движение в блоке)');
  // Escape → пикер закрыт (десктопный путь снятия жив).
  key(h, 'Escape');
  assert.equal(G.resurrectUI.isActive(), false, 'Escape закрыл пикер');
  assert.equal(findResurrectOverlay(h), null, 'DOM пикера снят');
  // Движение возобновилось.
  const dir2 = passableDir(G, myMap, g.state.player.x, g.state.player.y);
  assert.ok(dir2, 'сценарий: проходной сосед после пикера');
  const r = holdUntilStep(h, keydownFor(dir2[0], dir2[1]), now);
  assert.ok(r.moved,
    'движение возобновилось после закрытия пикера (Esc)');
});

// =====================================================================
// T10. защитный пин: окно смерти (000164) — гибель (partyLost) через
//      яд-тик → подъём → движение возобновилось
// =====================================================================

test('T10. пин: окно смерти (000164) — после гибели (partyLost) движение возобновляется', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  assert.equal(g.state.hero.level, 1, 'герой L1 (свежий старт)');
  const goldBefore = g.state.hero.gold;
  // groupType = id − 1 (combat.js): «дух бездны» (id 7) → 6.
  const started = g.actions.startCombat(6);
  assert.ok(started, 'боевой оверлей открыт (startCombat(6))');
  assert.equal(G.combatUI.isActive(), true, 'бой активен');
  const c = G.combatUI.current();
  // Детерминированная гибель игрока: яд-тик в startRound (000164
  // точка 2) — P.takeDamage БЕЗ RNG, «Несокрушимость» в яд-путь не
  // входит. (Мобы в арене могут быть замурованы препятствиями —
  // pathStepTo false — тогда пассивный «просто кончаем ходы» вечен;
  // яд — каноническая детерминированная точка гибели, 0 RNG.)
  c.ps.poison = 99;
  let guard = 0;
  while (!c.result && ++guard < 400) {
    G.combatUI.handleCode('Space'); // конец хода
  }
  assert.ok(c.result, 'бой завершился (result за ' + guard + ' ходов)');
  assert.equal(c.result.outcome, 'dead',
    'сценарий: гибель героя (окно смерти, 000164)');
  assert.equal(c.result.partyLost, true, 'partyLost — true (000164)');
  // Закрытие окна: Space → finish → onEnd (подъём).
  G.combatUI.handleCode('Space');
  assert.equal(G.combatUI.isActive(), false, 'окно смерти закрыто');
  assert.equal(g.state.hero.alive, true, 'подъём: alive');
  assert.ok(g.state.hero.gold < goldBefore,
    'подъём: −20% золота (' + goldBefore + ' → ' + g.state.hero.gold + ')');
  // Движение возобновилось.
  const dir = passableDir(G, myMap, g.state.player.x, g.state.player.y);
  assert.ok(dir, 'сценарий: проходной сосед от спавна');
  const r = holdUntilStep(h, keydownFor(dir[0], dir[1]), NOW);
  assert.ok(r.moved,
    'движение возобновилось после окна смерти (боевой гейт снят)');
});

// =====================================================================
// MF182 (задача 000182, ретро-20261010): пины защитных гвард 000170
// в vm-e2e (main.js в полной цепи). expectedRedCount = 0 — поведения
// существуют в master; краснота = coverage gap (карта —
// memory/000182-combat-test-pins.md §3).
// =====================================================================

// =====================================================================
// MF182-D5B. finish(): исключение в onEnd (G.playerUI.render) — бой
//     закрыт чисто (оверлей/ctx), logged ONCE, onEnd-эффекты ПОСЛЕ
//     точки броска потеряны (hudFlashUntil/saveNow не достигнуты),
//     мир не замёрз (пин 000170 D5b)
// =====================================================================

test('MF182-D5B. finish: исключение в onEnd (playerUI.render) — оверлей снят, ctx обнулён, logged ONCE, пост-боевой сейв потерян, движение мира живо', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const c = g.actions.startCombat(6);
  assert.ok(c, 'боевой оверлей открыт (startCombat(6))');
  assert.equal(G.combatUI.isActive(), true, 'бой активен');
  c.phase = 'over';
  c.result = { outcome: 'victory', xp: 50, gold: 1, defeated: 1,
    allyXp: [] };
  // Инъекция: G.playerUI.render бросает — на victory-пути onEnd
  // (main.js) он вызывается Л1584, ПОСЛЕ hudFlash «Победа! +N опыта…»
  // (L1554) и loot/companions. G.playerUI — общий объект-экспорт,
  // виден снапшоту main.js (паттерн T5).
  const origRender = G.playerUI.render;
  G.playerUI.render = () => { throw new Error('MF182-D5B-inject'); };
  let threw = null;
  try {
    G.combatUI.handleCode('Escape');
  } catch (err) {
    threw = err;
  }
  G.playerUI.render = origRender;
  assert.equal(threw, null,
    'исключение onEnd НЕ улетело вызывателю (D5b: finish ловит; '
    + 'на master: throw из onEnd пробился через finish/handleCode '
    + 'наверх — listener-цепь мёртва)');
  assert.equal(G.combatUI.isActive(), false, 'боевой гейт открыт');
  assert.equal(G.combatUI.current(), null, 'ctx обнулён');
  assert.equal(findAll(h.body, '.combat-overlay--combat').length, 0,
    'боевой оверлей снят из DOM');
  assert.equal(h.errors.length, 1,
    'D5b logged ONCE (один warning на скомпрометированный onEnd): '
    + h.errors.join(' | '));
  assert.ok(h.errors[0].includes('исключение в onEnd'),
    'текст D5b-предупреждения: ' + h.errors[0]);
  // onEnd применён ЧАСТИЧНО: hudFlash-СТРОКА (L1554) и loot/отряд
  // (L1577-1583) — ДО playerUI.render (L1584); НО hudFlashUntil
  // (L1585) и saveNow (L1586) — ПОСЛЕ точки броска → ПОТЕРЯНЫ:
  // (a) флэш «Победа!» на HUD не виден (hud.js: performance.now() <
  //     flashUntil; flashUntil = 0 — не обновлён),
  mainFrameAt(h, NOW + 600);
  const hud = String(h.hud.textContent);
  assert.ok(!hud.includes('Победа! +50 опыта'),
    'hudFlashUntil не обновлён (throw ДО L1585) — флэш победы '
    + 'потерян (допустимая деградация D5b): ' + hud);
  // (b) пост-боевой saveNow (L1586) не достигнут: свежий старт,
  //     до боя сейвов не было → в storage сейва НЕТ (на чистом onEnd
  //     saveNow записал бы SAVE_KEY).
  assert.equal(h.storage.getItem(SAVE_KEY), null,
    'пост-боевой saveNow потерян (throw ДО L1586 — D5b: onEnd-эффекты '
    + 'после броска не доходят)');
  // Мир не замёрз: гейты открыты, клавиша → шаг.
  const dir = passableDir(G, myMap, g.state.player.x, g.state.player.y);
  assert.ok(dir, 'сценарий: проходной сосед от спавна');
  const r = holdUntilStep(h, keydownFor(dir[0], dir[1]), NOW + 600);
  assert.ok(r.moved,
    'мировое движение живо после скомпрометированного onEnd '
    + '(боевые гейты сняты чисто)');
});

// =====================================================================
// MF182-D7. saveNow(): исключение в collectSaveData (G.serializeBuffs)
//     — сейв пропущен (logged ONCE), вызывающие точки (мировой шаг,
//     onDay) не рвёт, день+1 прошёл, следующий шаг сейвится
//     (пин 000170 D7)
// =====================================================================

test('MF182-D7. saveNow: исключение в collectSaveData (serializeBuffs) — logged ONCE, день+1 прошёл, следующий шаг сейвится', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const day0 = g.state.day;
  assert.equal(g.state.stepsToday, 0, 'свежий старт: 0 шагов в дне');
  // Инъекция: G.serializeBuffs бросает (collectSaveData — единственный
  // потребитель; G — общий объект-экспорт, виден снапшоту main.js).
  // perDay 40 → 2 (SETTINGS — LIVE-объект, addStep читает на каждый
  // вызов, 000099): смена дня — детерминированно на 2-м шаге.
  const hadSerialize = 'serializeBuffs' in G;
  const origSerialize = G.serializeBuffs;
  const origPerDay = G.GlobalSettings.SETTINGS.steps_per_day;
  G.serializeBuffs = () => { throw new Error('MF182-D7-inject'); };
  G.GlobalSettings.SETTINGS.steps_per_day = 2;
  let t = NOW;
  try {
    const dir1 = passableDir(G, myMap, g.state.player.x, g.state.player.y);
    assert.ok(dir1, 'сценарий: проходной сосед от спавна');
    const r1 = holdUntilStep(h, keydownFor(dir1[0], dir1[1]), t);
    t = r1.now;
    assert.ok(r1.moved, 'шаг 1 прошёл (D7 не рвёт кадр)');
    assert.equal(h.errors.length, 1,
      'D7 logged ONCE на первом скомпрометированном сейве: '
      + h.errors.join(' | '));
    assert.ok(h.errors[0].includes('исключение в collectSaveData'),
      'текст D7-предупреждения: ' + h.errors[0]);
    const dir2 = passableDir(G, myMap, g.state.player.x, g.state.player.y);
    assert.ok(dir2, 'сценарий: проходной сосед после шага 1');
    const r2 = holdUntilStep(h, keydownFor(dir2[0], dir2[1]), t);
    t = r2.now;
    assert.ok(r2.moved, 'шаг 2 прошёл (onDay-цепь цела)');
    assert.equal(g.state.day, day0 + 1,
      'шаг 2 (perDay=2) → смена дня: saveNow в onDay не рванул '
      + 'день-цепь (D7 — внутри saveNow, не в onDay)');
    assert.equal(h.errors.length, 1,
      'повторные D7-предупреждения подавлены (флаг saveDataErrLogged, '
      + 'в т.ч. сейв в onDay): ' + h.errors.join(' | '));
  } finally {
    if (hadSerialize) G.serializeBuffs = origSerialize;
    else delete G.serializeBuffs;
    G.GlobalSettings.SETTINGS.steps_per_day = origPerDay;
  }
  // (c) Восстановление: следующий шаг сейвится реально, ошибок нет.
  const dir3 = passableDir(G, myMap, g.state.player.x, g.state.player.y);
  assert.ok(dir3, 'сценарий: проходной сосед после шага 2');
  const r3 = holdUntilStep(h, keydownFor(dir3[0], dir3[1]), t);
  assert.ok(r3.moved, 'шаг 3 прошёл (реальный collectSaveData)');
  assert.equal(h.errors.length, 1,
    'реальный сейв шага 3 — без новых предупреждений: '
    + h.errors.join(' | '));
});

// =====================================================================
// MF182-ONCE. watchdog frame: исключение в кадре (G.hud.update) —
//     logged ONCE за 3 кадра (флаг frameErrLogged), rAF-цепь жива
//     каждый кадр (пин 000170 frame-watchdog; T2 покрывает 1-й кадр,
//     пин — «повторные предупреждения подавлены»)
// =====================================================================

test('MF182-ONCE. watchdog frame: исключение в кадре (hud.update) — logged ONCE за 3 кадра, rAF-цепь жива', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  // Инъекция: G.hud.update бросает КАЖДЫЙ кадр (renderHud →
  // G.hud.update; G.hud — общий объект-экспорт, паттерн T2).
  const origUpdate = G.hud.update;
  G.hud.update = () => { throw new Error('MF182-ONCE-inject'); };
  try {
    for (let i = 1; i <= 3; i++) {
      const rafBefore = h.raf.length;
      const err = tryMainFrameAt(h, NOW + 200 * (i + 1));
      assert.equal(err, null,
        'кадр ' + i + ': исключение не улетает вызывателю (watchdog)');
      assert.ok(h.raf.length > rafBefore,
        'кадр ' + i + ': rAF-цепь жива (reschedule в finally): '
        + rafBefore + ' → ' + h.raf.length);
    }
  } finally {
    G.hud.update = origUpdate;
  }
  assert.equal(h.errors.length, 1,
    'logged ONCE: 3 кадра с исключением — ОДНО предупреждение '
    + '(флаг frameErrLogged): ' + h.errors.join(' | '));
  assert.ok(h.errors[0].includes('исключение в кадре'),
    'текст frame-watchdog-предупреждения: ' + h.errors[0]);
});

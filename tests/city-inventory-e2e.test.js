// Задача 000206: BUG — инвентарь проваливается под экран города
// (для подземелья — проверить доступность). Рефакторинг без смены
// поведения. Контракты: memory/000206-inventory-over-city.md.
//
// Корень бага (верифицировано по коду): экран города И подземелья —
// ОДИН непрозрачный оверлей .combat-overlay.dungeon-overlay (z-20,
// src/dungeon-ui.js:394, child body); «инвентарь» — вкладка панели
// персонажа .char-panel (z-10, src/ui.js buildPanel, child body).
// Оба узла — дети body в root stacking context: оверлей (20) > панель
// (10) → панель РЕНДЕРИТСЯ ПОД непрозрачным экраном локации и
// невидима. KeyI (main.js:1821) выше всех гейтов — панель реально
// открывается (isOpen() === true), но «проваливается».
//
// Решение (согласовано, a2 с уточнениями): КОНТЕКСТНЫЙ подъём панели
// инлайн-стилем в frame() (render-driven z-index дал бы ДЫРУ —
// render() playerUI не вызывается при входе/выходе из локации):
//   * src/ui.js (closure playerUI): Z_OVER_LOCATION = 25;
//     applyLayer(overLocation) — идемпотентная запись
//     panel.style.zIndex ('25' | ''), до buildPanel — no-op;
//     экспорт в G.playerUI;
//   * src/main.js frame(): ОДИН guarded call (typeof, паттерн TV7)
//     после блока 000150 (до stepMs), кондиция — локация
//     ЕДИНСТВЕННЫЙ верхний оверлей: inDungeon && !inCombat &&
//     !inNpc && !inBuilding && !inCraft && !inResurrect &&
//     !renameInputActive() (снимок кадра + фасад 000148.05 —
//     правки по итогам ревью: седьмой z-20 оверлей, input
//     переименования города, не покрывался 6 флагами).
// З-лестница (новый ДИНАМИЧЕСКИЙ слот 25): базовая .char-panel 10
// (CSS НЕ МЕНЯЕТСЯ — пин tests/ui-panel.test.js:487-519 зелёный без
// правок) < .fs-btn 15 < оверлеи .combat-overlay/.dungeon-overlay/
// .resurrect-overlay 20 < подъём (inline 25) < #touch-controls 30 <
// .start-window 40. Мир/диалог — БЕЗ подъёма (паритет 000096:
// открытый позже оверлей — сверху; панель под диалогом z-20);
// бой — С подъёмом «25» с 000195 (панель над боевым оверлеем).
// index.html — БЕЗ ИЗМЕНЕНИЙ (нет новых <script>/CSS); тач-dead-end
// (скрытая открытая панель прячет ВСЕ on-screen-контролы) устраняется
// фиксом — панель видна, у неё своя кнопка закрытия.
//
// Тесты (новый файл; харнес — конвенция tests/city-screen.test.js +
// helpers tests/city-interact.test.js: full-chain <script> из
// index.html в vm-песочнице, детерминированный мир
// G.generateSeedPixels, walkTiles с резолвом zone-боя 000135,
// findCityFor/walkCity/cityStepsTo; дублирование харнессов —
// принятая конвенция).
//
// RED (3 — падают на master ОСМЫСЛЕННО: нет функции/поведения, не
// синтаксис; зеленеют после фикса):
//   * CI-0 surface — typeof Game.playerUI.applyLayer === 'function'
//     (master: undefined — функция ещё не существует).
//   * CI-1 город (ТЗ п.1) — walkTiles к входу (fp>=2, buildings>=1 —
//     протокол CI-V1; страховка — bounded re-entry ≤3 при zone-бое на
//     входном шаге, 000135) → KeyI → панель открыта (isOpen, display
//     'flex', корень .char-panel в body — существующее поведение) +
//     .dungeon-overlay в body + dungeonUI активен + kind 'city' →
//     кадр → panel.style.zIndex === '25' (master: undefined —
//     осмысленный красный: подъёма нет).
//   * CI-2 подземелье (ТЗ п.2) — debug enterDungeon → KeyI → кадр →
//     zIndex '25' + kind 'dungeon' + оверлей; KeyI (закрыть) → кадр →
//     подъём снят (falsy) + локация ЦЕЛА (isActive, kind, клетка
//     героя не сдвинулась).
//
// ЗЕЛЁНЫЕ гварды (6 — фиксируют ГРАНИЦЫ контекстности подъёма;
// CI-3..CI-7 проходят ДО и ПОСЛЕ, CI-8 — правки по итогам ревью,
// красный до фикса / зелёный после):
//   * CI-3 мир — KeyI → кадр → подъёма НЕТ (falsy: базовый CSS z-10
//     в силе) + панель открывается/закрывается.
//   * CI-4 выход из города с ОТКРЫТОЙ панелью — [E] на едином
//     тайле-двери (000177) → выход → кадр → подъём снят + панель
//     ЕЩЁ открыта (выход панель не закрывает — существ. поведение).
//   * CI-5 город + панель + [E] на постройке — buildingUI.open
//     ЗАКРЫВАЕТ панель ПЕРВОЙ (000071: состояние
//     «город+панель+buildingUI» недостижимо — пин ФАКТА закрытия) +
//     buildingUI активен → кадр → подъёма нет.
//   * CI-6 подземелье + бой — enterDungeon → KeyI → debug-бой
//     (закрыл панель, 000096) → KeyI (открыл снова — 000195: панель
//     над боевым оверлеем) → кадр → подъём «25» (репин 000195);
//     KeyI (закрыть) → кадр → подъём снят; резолв (dealDamageToMob
//     9999 по живым + Space) — бой закрыт, локация цела.
//   * CI-7 мир + NPC-диалог — KeyI → кадр (подъёма нет) →
//     npcUI.open → кадр → подъёма всё ещё нет (мир не изменился;
//     приоритет Esc-стека не тронут).
//   * CI-8 город + buildingUI + [I] + «Переименовать город» (правки
//     по итогам ревью, major — красный до фикса): input-оверлей
//     переименования (000148.05: div.combat-overlay z-20, child body,
//     building-actions.js openCityRenameInput) — СЕДЬМОЙ z-20 оверлей.
//     Сценарий: [E] на пустой клетке (меню «Строительство» —
//     buildingUI; 000071: панель закрыта ПЕРВОЙ) → KeyI (панель
//     открыта, СКРЫТА под меню — существ.
//     поведение; кадр — подъёма нет, !inBuilding) → клик строки
//     rename-city (executeAction: close ДО onAction — buildingUI
//     закрылся сам, input-оверлей открыт, renameInputActive()) →
//     кадр → подъёма НЕТ (з-25 накрывал бы input-оверлей z-20 —
//     паритет с master: панель z-10 ПОД оверлеем, строка-черновик
//     имени видна; [I] под оверлеем заблокирован гейтом 000148.05).
//
// Инварианты (рефакторинг без смены поведения): ноль новых вызовов
// RNG; сейвы/формы не тронуты (zIndex — инлайн-стиль, не
// сериализуется); вывод панели побайтово (DOM/HTML не меняются);
// [E]-путь и гарды isActive (dungeonUI/buildingUI/npcUI) не тронуты.
// В full-chain песочнице document-слушатели ОТБРАСЫВАЮТСЯ (NO-OP) —
// панель закрывать повторным [I], НЕ [Esc] (Esc-семантика пинится в
// partial-chain, tests/ui-panel.test.js).

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
const NOW = 1000; // performance.now() в песочнице заморожен на NOW

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

// --- «Снисходительный» DOM-элемент с деревом (dataset, closest,
// querySelectorAll) — дубль конвенции tests/city-interact.test.js. ---
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
  if (cls && !String(el.className || '').split(/\s+/).includes(cls)) {
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
    // children хранят СУРЫЕ target (а не прокси): remove() ищет по
    // identity (дубль tests/city-interact.test.js).
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
      if (name.startsWith('data-')) target.dataset[name.slice(5)] = value;
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
      return () => undefined; // неизвестный метод DOM — no-op
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// --- Песочница: вся цепочка index.html (браузерная ветка UMD) ---
function bootSandbox() {
  const winListeners = {};
  const raf = [];
  const errors = [];
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
  // #game — WebGL (без него main.js уходит в фолбэк-ветку и не
  // стартует); #sprites — 2d со спаем (слой спрайтов).
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
          : id === 'hud' ? hud : null),
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
    // реально снимает (дубль tests/city-interact.test.js).
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
  // Image-стаб (паттерн main-visuals): assets/map.png ВСЕГДА onerror
  // → детерминированный фолбэк G.generateSeedPixels; остальные onload.
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
  return { sandbox, winListeners, raf, errors, body, storage };
}

// Промывка микротасков (Image + loadMapPixels().then: карта, спавн,
// requestAnimationFrame(frame)).
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
  // frame() main.js — единственный rAF-колбэк после старта; кадр пере
  // планирует себя (одна и та же функция) — frameFn валидна на любом
  // моменте. Кадр вызываем ЕЁ (dungeon-ui tick тоже живёт в rAF).
  h.frameFn = h.raf[h.raf.length - 1];
  return h;
}

// --- Ввод ---
// ВАЖНО: массив слушателей снапшотится ПЕРЕД диспетчем (паттерн B9):
// слушатель, зарегистрированный ВО ВРЕМЯ диспетча, текущее событие
// НЕ видит (семантика браузерного DOM).
function key(h, code, extra = {}) {
  const e = Object.assign(
    { code, preventDefault() {}, stopPropagation() {} }, extra);
  for (const fn of (h.winListeners['keydown'] || []).slice()) fn(e);
  return e;
}

function keyup(h, code, extra = {}) {
  const e = Object.assign({ code }, extra);
  for (const fn of (h.winListeners['keyup'] || []).slice()) fn(e);
  return e;
}

function press(h, code) {
  return key(h, code);
}

function release(h, code) {
  return keyup(h, code);
}

function keydownFor(dx, dy) {
  return dx === 1 ? 'ArrowRight' : dx === -1 ? 'ArrowLeft'
    : dy === 1 ? 'ArrowDown' : 'ArrowUp';
}

// Резолв боевого оверлея (паттерн walkTiles 000135): мобы 9999 →
// Space. Эфир НЕ убиваем.
function resolveCombat(G) {
  assert.equal(G.combatUI.isActive(), true, 'резолв: бой активен');
  const c = G.combatUI.current();
  for (const m of c.units.filter((x) => x.side === 'mob' && x.alive)) {
    G.combatInternals.dealDamageToMob(c, m, 9999);
  }
  assert.ok(c.result && c.result.outcome === 'victory',
    'резолв: победа (9999 по живым мобам)');
  G.combatUI.handleCode('Space');
  assert.equal(G.combatUI.isActive(), false,
    'резолв: бой закрыт (Space → finish)');
}

// --- Ходьба по миру (протокол city-screen/main-visuals) ---
// keydown(направление) → кадры frame(now) по +200 мс, пока игрок не
// перешёл (tryMove — в frame при now−lastMove ≥ stepMs; базовый
// stepMs = 420 мс, 000063) → keyup. Кадр делает ≤ ОДНОГО хода.
function walkTiles(h, now, tiles) {
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  for (const [tx, ty] of tiles) {
    const dx = tx - g.state.player.x, dy = ty - g.state.player.y;
    assert.ok(Math.abs(dx) + Math.abs(dy) === 1, 'BFS: шаг по соседнему тайлу');
    const code = keydownFor(dx, dy);
    press(h, code);
    let guard = 0;
    do {
      now += 200;
      h.frameFn(now);
    } while ((g.state.player.x !== tx || g.state.player.y !== ty)
      && ++guard < 10);
    release(h, code);
    assert.equal(g.state.player.x, tx,
      'сценарий: игрок перешёл на (' + tx + ', ' + ty + ') — x');
    assert.equal(g.state.player.y, ty,
      'сценарий: игрок перешёл на (' + tx + ', ' + ty + ') — y');
    // 000135: маршрут к городу/пещере может пересечь 5×5-зону
    // триггерящей группы — авторазрешение zone-боя после КАЖДОГО
    // шага, без него inCombat заморозит tryMove.
    if (G.combatUI.isActive()) resolveCombat(G);
  }
  // Осадочные кадры (глейд мувера и сглаживание камеры завершаются).
  for (let i = 0; i < 4; i++) {
    now += 200;
    h.frameFn(now);
  }
  return now;
}

// --- BFS по миру до целевого тайла. Промежуточные узлы: passable,
// БЕЗ групп мобов (шаг = startCombat) и БЕЗ входов (пещера/город —
// авто-вход сломает протокол); целевой тайл — проверка ДО исключения.
function findTile(G, myMap, start, isTarget, radius = 700) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const startKey = start.x + ',' + start.y;
  const visited = new Set([startKey]);
  const prev = new Map();
  let frontier = [start];
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
          return { tile: t, steps };
        }
        if (t.hasBuilding) continue; // вход (пещера/город) — не на пути
        next.push({ x: nx, y: ny });
      }
    }
    frontier = next;
  }
  return null;
}

// Город + RECOMPUTE содержимого (чистые функции 000106/000108 — те
// же входы, что и production: якорь, wealth из tileAt): layout от
// ЯКОРЯ, не от входного тайла (000105). Возврат: {tile, steps, fp,
// rec, layout, contents, ax, ay, wealth}.
function findCityFor(G, myMap, start, pred, radius = 700) {
  let info = null;
  const isCityTile = (t) => {
    if (!t.hasBuilding || t.building !== G.BUILDING_TYPES.NONE) return false;
    const rec = G.getBuilding(t.buildingId);
    if (!rec || rec.категория !== 'город') return false;
    const fp = rec.размер.ширина;
    const [ax, ay] = t.buildingAnchor;
    const layout = G.Cities.createCityLayout(ax, ay, fp);
    const contents = G.Cities.generateCityContents(layout, ax, ay,
      rec, t.buildingWealth);
    const i = { fp, rec, layout, contents, ax, ay,
      wealth: t.buildingWealth, tile: t };
    if (pred(i) === true) info = i;
    return info !== null;
  };
  const r = findTile(G, myMap, start, isCityTile, radius);
  return r ? Object.assign({ tile: r.tile, steps: r.steps }, info) : null;
}

// Безопасный ОДИН шаг в МИРЕ от тайла входа (000177: выход → герой
// на входном тайле; повторный вход требует шага С тайла и обратно).
// passable, без группы мобов (шаг = бой), без постройки (пещера/город
// — авто-вход сломает протокол). null — нет такого соседа.
function safeWorldNeighbor(G, myMap, from) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of DIRS) {
    const t = myMap.tileAt(from.x + dx, from.y + dy);
    if (!t.passable || t.hasMobGroup || t.hasBuilding) continue;
    return [from.x + dx, from.y + dy];
  }
  return null;
}

// --- Ходьба ВНУТРИ города: синхронная (keydown → ctx.onMove →
// cityMove; кадры не нужны). Layout города: периметр WALL, вся
// внутренность — FLOOR (000104); постройки (000106) НЕ мутируют
// cells → клетки построек проходимы. L-путь (дубль city-interact).
function cityStepsTo(from, tx, ty) {
  const steps = [];
  const vy = ty < from.y ? -1 : 1;
  for (let y = from.y + vy; y !== ty + vy; y += vy) steps.push([from.x, y]);
  const hx = tx < from.x ? -1 : 1;
  for (let x = from.x + hx; x !== tx + hx; x += hx) steps.push([x, ty]);
  return steps;
}

function walkCity(h, steps) {
  const g = h.sandbox.__game;
  for (const [tx, ty] of steps) {
    const dx = tx - g.dungeon.x, dy = ty - g.dungeon.y;
    assert.ok(Math.abs(dx) + Math.abs(dy) === 1, 'город: шаг по соседней клетке');
    const code = keydownFor(dx, dy);
    press(h, code);
    release(h, code);
    assert.ok(g.dungeon, 'в городе (не вышел)');
    assert.equal(g.dungeon.x, tx, 'город: шаг x (' + tx + ',' + ty + ')');
    assert.equal(g.dungeon.y, ty, 'город: шаг y (' + tx + ',' + ty + ')');
  }
}

// --- Элементы body ---
// Корень панели персонажа (.char-panel — child body, src/ui.js:229).
function panelOf(h) {
  return findAll(h.body, '.char-panel')[0] || null;
}

// Оверлей локации (.dungeon-overlay — child body, src/dungeon-ui.js).
function dungeonOverlayOf(h) {
  const ovs = findAll(h.body, '.dungeon-overlay');
  return ovs.length ? ovs[ovs.length - 1] : null;
}

// Вход в город (walkTiles + страховка bounded re-entry ≤3): 000135 —
// zone-бой на входном шаге приоритетнее входа (два оверлея в одном
// кадре — сломанное состояние), вход откладывается на ПЕРВЫЙ
// успешный шаг после боя, приходящийся на тайл входа. Резолв (в
// walkTiles) → шаг от входа → шаг назад → кадры. defeatedAt-guard
// (main.js) — повторного боя той же группы нет: сходится за 1
// итерацию; лимит 3 — страховка сценария (ассерт ниже).
function enterCity(h, now, myMap, pred) {
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const found = findCityFor(G, myMap, g.state.player, pred);
  assert.ok(found,
    'сценарий: город достижим пешком (BFS, мир детерминирован)');
  now = walkTiles(h, now, found.steps);
  const entry = { x: found.tile.x, y: found.tile.y };
  for (let attempt = 0; !g.dungeon && attempt < 3; attempt += 1) {
    if (G.combatUI.isActive()) resolveCombat(G);
    const adj = safeWorldNeighbor(G, myMap, entry);
    assert.ok(adj, 'сценарий: безопасный сосед тайла входа есть');
    now = walkTiles(h, now, [adj, [entry.x, entry.y]]);
  }
  assert.ok(g.dungeon, 'сценарий: локация открыта (bounded re-entry ≤3)');
  assert.equal(g.dungeon.kind, 'city', 'экран города (kind city)');
  return { found, entry, now };
}

// Значение CELL_FLOOR (dungeon.js/cities.js) — внутренняя
// напольная клетка layout.
const G_CELL_FLOOR = 1;

// ПЕРВАЯ свободная внутренняя клетка layout города (протокол
// CI-V16): пол, не входная клетка, не занята постройкой. Строка
// «Переименовать город» есть ТОЛЬКО в меню «Строительство» пустой
// клетки (openCityBuildMenu) — сценарию нужна такая клетка.
function freeCityCell(c) {
  const d = c.layout;
  const occ = new Set(c.contents.buildings
    .map((b) => b.x + ',' + b.y));
  for (let y = 1; y < d.height - 1; y++) {
    for (let x = 1; x < d.width - 1; x++) {
      if (x === d.entrance.x && y === d.entrance.y) continue;
      if (d.cells[y * d.width + x] !== G_CELL_FLOOR) continue;
      if (occ.has(x + ',' + y)) continue;
      return { x, y };
    }
  }
  return null;
}

// Вход в город СО СВОБОДНОЙ клеткой (enterCity + pred с
// freeCityCell) — для сценария rename (CI-8).
function enterCityFree(h, now, myMap) {
  const r = enterCity(h, now, myMap,
    (c) => c.fp >= 2 && freeCityCell(c) !== null);
  return { found: r.found, entry: r.entry, now: r.now,
    free: freeCityCell(r.found) };
}

// Оверлей buildingUI в городе (меню «Строительство» ИЛИ input-
// оверлей переименования) — child body .combat-overlay, НЕ экран
// города (.dungeon-overlay). Одновременно в body НЕ БОЛЬШЕ ОДНОГО
// такого узла: executeAction закрывает меню ДО открытия ввода,
// повторный [E] под input-оверлеем заблокирован (D-.05k).
function buildingMenuOf(h) {
  const ovs = findAll(h.body, '.combat-overlay')
    .filter((o) => !String(o.className).includes('dungeon-overlay'));
  return ovs.length ? ovs[ovs.length - 1] : null;
}

// ============================================================
// CI-0..CI-8
// ============================================================

test('000206 CI-0 (surface, RED): Game.playerUI.applyLayer — функция (контекстный подъём панели)', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  assert.ok(G.playerUI, 'Game.playerUI (ui.js в цепочке)');
  assert.equal(typeof G.playerUI.applyLayer, 'function',
    'RED: surface playerUI — applyLayer (000206: подъём панели над '
    + 'локацией; master: функция отсутствует)');
});

test('000206 CI-1 (город, RED, ТЗ п.1): вход → KeyI → панель открыта и ВЫШЕ экрана города (zIndex 25 > 20)', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const { found, entry, now } = await enterCity(h, NOW, myMap,
    (c) => c.fp >= 2 && c.contents.buildings.length >= 1);
  const dg = g.dungeon;
  assert.equal(G.dungeonUI.isActive(), true, 'dungeonUI активен (город)');
  assert.ok(dungeonOverlayOf(h),
    'экран города — .dungeon-overlay в body (оверлей z-20)');
  assert.deepEqual({ x: g.state.player.x, y: g.state.player.y }, entry,
    'герой — на входном тайле города');
  // KeyI выше ВСЕХ гейтов (main.js:1821) — панель открывается в
  // городе (существующее поведение — зелёная часть; состояние
  // переключалось и до фикса).
  press(h, 'KeyI');
  assert.equal(G.playerUI.isOpen(), true, 'KeyI: панель открыта');
  const panel = panelOf(h);
  assert.ok(panel, 'корень .char-panel в body');
  assert.equal(panel.style.display, 'flex', 'панель открыта (display flex)');
  // Кадр (frame-driven подъём — render() playerUI при входе НЕ
  // вызывается): после фикса frame() ставит подъём.
  h.frameFn(now + 16);
  assert.equal(panel.style.zIndex, '25',
    'RED: кадр — панель ПОДНЯТА над экраном города (inline zIndex 25 '
    + '> оверлей 20; master: undefined — «проваливается» под oверлей)');
});

test('000206 CI-2 (подземелье, RED, ТЗ п.2): debug-вход → KeyI → панель ВЫШЕ экрана подземелья (zIndex 25); закрытие — подъём снят, локация цела', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon — состояние подземелья (отладочный вход)');
  assert.equal(g.dungeon.kind, 'dungeon', 'kind dungeon');
  assert.equal(G.dungeonUI.isActive(), true, 'dungeonUI активен');
  assert.ok(dungeonOverlayOf(h),
    'экран подземелья — .dungeon-overlay в body (оверлей z-20)');
  const heroCell = { x: g.dungeon.x, y: g.dungeon.y };
  press(h, 'KeyI');
  assert.equal(G.playerUI.isOpen(), true, 'KeyI: панель открыта в подземелье');
  const panel = panelOf(h);
  assert.ok(panel && panel.style.display === 'flex',
    'корень .char-panel в body, открыта (display flex)');
  h.frameFn(NOW + 16);
  assert.equal(panel.style.zIndex, '25',
    'RED: кадр — панель ПОДНЯТА над экраном подземелья (inline zIndex '
    + '25; master: undefined — тот же оверлей, тот же баг)');
  // Закрытие повторным [I] (в full-chain песочнице document-слушатели
  // отброшены — Esc не работает; Esc-семантика — partial-chain).
  press(h, 'KeyI');
  assert.equal(G.playerUI.isOpen(), false, 'KeyI: панель закрыта');
  h.frameFn(NOW + 32);
  assert.ok(!panel.style.zIndex,
    'подъём снят после закрытия (zIndex falsy — базовый CSS z-10)');
  assert.equal(G.dungeonUI.isActive(), true, 'локация цела: dungeonUI активен');
  assert.equal(g.dungeon.kind, 'dungeon', 'локация цела: kind dungeon');
  assert.deepEqual({ x: g.dungeon.x, y: g.dungeon.y }, heroCell,
    'локация цела: клетка героя не сдвинулась');
});

test('000206 CI-3 (мир, пин): KeyI → кадр → подъёма НЕТ (zIndex falsy); панель открывается/закрывается', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  assert.equal(g.dungeon, null, 'мир (локации нет)');
  press(h, 'KeyI');
  assert.equal(G.playerUI.isOpen(), true, 'KeyI: панель открыта в мире');
  const panel = panelOf(h);
  assert.ok(panel && panel.style.display === 'flex',
    'корень .char-panel в body, открыта (display flex)');
  h.frameFn(NOW + 16);
  assert.ok(!panel.style.zIndex,
    'мир: подъёма НЕТ (zIndex falsy — базовый CSS z-10, как раньше)');
  press(h, 'KeyI');
  assert.equal(G.playerUI.isOpen(), false, 'KeyI: панель закрыта');
});

test('000206 CI-4 (город, пин): выход с ОТКРЫТОЙ панелью — [E] на едином тайле-двери, подъём снят, панель ЕЩЁ открыта', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const { now } = await enterCity(h, NOW, myMap, (c) => c.fp >= 2);
  assert.equal(G.dungeonUI.isActive(), true, 'в городе');
  // 000177: вход = выход — единый тайл, герой спавнится НА нём.
  press(h, 'KeyI');
  assert.equal(G.playerUI.isOpen(), true, 'KeyI: панель открыта в городе');
  const panel = panelOf(h);
  assert.ok(panel && panel.style.display === 'flex', 'панель открыта');
  // Выход (000177): [E] на едином тайле → dungeon-ui keydown →
  // ctx.onInteract → locationOnInteract → exitCity (синхронно).
  press(h, 'KeyE');
  release(h, 'KeyE');
  assert.equal(g.dungeon, null, '[E] на двери: состояние снято (выход)');
  assert.equal(G.dungeonUI.isActive(), false, 'dungeonUI закрыт');
  h.frameFn(now + 16);
  assert.ok(!panel.style.zIndex,
    'подъём снят после выхода (zIndex falsy — базовый CSS z-10)');
  assert.equal(G.playerUI.isOpen(), true,
    'панель ЕЩЁ открыта (выход панель не закрывает — существ. поведение)');
});

test('000206 CI-5 (город, пин): панель + [E] на постройке — buildingUI.open ЗАКРЫВАЕТ панель ПЕРВОЙ (000071); buildingUI активен; подъёма нет', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const { found, now } = await enterCity(h, NOW, myMap,
    (c) => c.fp >= 2 && c.contents.buildings.length >= 1);
  const target = found.contents.buildings[0]; // 000106: таверна первой
  walkCity(h, cityStepsTo({ x: g.dungeon.x, y: g.dungeon.y },
    target.x, target.y));
  assert.ok(g.dungeon, 'в городе (не вышел)');
  press(h, 'KeyI');
  assert.equal(G.playerUI.isOpen(), true, 'KeyI: панель открыта в городе');
  // [E] на клетке постройки: dungeon-ui → interactCity →
  // openBuildingUI → buildingUI.open ЗАКРЫВАЕТ панель ПЕРВОЙ (000071:
  // оверлей z-20 не должен накрывать мир вместе с панелью z-10) —
  // состояние «город+панель+buildingUI» НЕДОСТИЖИМО, пин — ФАКТ.
  press(h, 'KeyE');
  release(h, 'KeyE');
  assert.equal(G.playerUI.isOpen(), false,
    '000071: buildingUI.open закрыл панель ПЕРВОЙ');
  assert.equal(G.buildingUI.isActive(), true, 'buildingUI активен');
  assert.equal(G.dungeonUI.isActive(), true,
    'dungeonUI остаётся активен (городский режим)');
  const panel = panelOf(h);
  h.frameFn(now + 16);
  assert.ok(panel && !panel.style.zIndex,
    'кадр: подъёма нет (buildingUI выше — конъюнкт !inBuilding)');
});

test('000206 CI-6 (подземелье+бой, пин; репин 000195): debug-бой → KeyI; кадр — подъём «25» (в бою панель над боем); закрытие — подъём снят; резолв — локация цела', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const ds = g.actions.enterDungeon();
  assert.ok(ds, 'enterDungeon — состояние подземелья (отладочный вход)');
  press(h, 'KeyI');
  assert.equal(G.playerUI.isOpen(), true, 'KeyI: панель открыта в подземелье');
  const panel = panelOf(h);
  assert.ok(panel && panel.style.display === 'flex', 'панель открыта');
  // Debug-бой (000096): закрыл панель автоматически.
  const c0 = g.actions.startCombat();
  assert.ok(c0, 'startCombat — бой начат (отладочный)');
  assert.equal(G.combatUI.isActive(), true, 'боевой оверлей активен');
  assert.equal(G.playerUI.isOpen(), false,
    '000096: старт боя закрыл панель (существ. поведение)');
  // KeyI выше ВСЕХ гейтов — панель переключается и в бою (000195:
  // ВИДНА поверх боевого оверлея — граница 000206 «подъёма нет» снята).
  press(h, 'KeyI');
  assert.equal(G.playerUI.isOpen(), true,
    'KeyI в бою: панель снова открыта');
  h.frameFn(NOW + 16);
  assert.equal(panel.style.zIndex, '25',
    'кадр: подъём «25» (000195: панель над боевым оверлеем z-20)');
  // Закрытие повторным [I] (в full-chain песочнице document-слушатели
  // отброшены — Esc не работает; Esc-семантика — partial-chain).
  press(h, 'KeyI');
  assert.equal(G.playerUI.isOpen(), false, 'KeyI: панель закрыта');
  h.frameFn(NOW + 32);
  assert.ok(!panel.style.zIndex,
    'подъём снят после закрытия (zIndex falsy — базовый CSS z-10)');
  // Резолв (мобы 9999 → Space) — бой закрыт, локация цела.
  resolveCombat(G);
  assert.equal(g.dungeon.kind, 'dungeon', 'локация цела: kind dungeon');
  assert.equal(G.dungeonUI.isActive(), true, 'локация цела: dungeonUI активен');
});

test('000206 CI-7 (мир+диалог, пин): KeyI → кадр (подъёма нет) → npcUI.open → кадр — подъёма всё ещё нет (паритет: позже открытый оверлей — сверху)', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  assert.equal(g.dungeon, null, 'мир (локации нет)');
  press(h, 'KeyI');
  assert.equal(G.playerUI.isOpen(), true, 'KeyI: панель открыта в мире');
  const panel = panelOf(h);
  assert.ok(panel && panel.style.display === 'flex', 'панель открыта');
  h.frameFn(NOW + 16);
  assert.ok(!panel.style.zIndex, 'мир: подъёма НЕТ (zIndex falsy)');
  // NPC-диалог (.npc-overlay, z-20) — позже открытый оверлей СВЕРХУ
  // панели (паритет с миром, 000096); приоритет Esc-стека не тронут.
  G.npcUI.open({
    npc: G.NpcData.NPCS[0],
    character: G.createCharacter(),
    book: G.createQuestBook(),
  });
  assert.equal(G.npcUI.isActive(), true, 'NPC-диалог открыт');
  const ovs = findAll(h.body, '.npc-overlay');
  assert.ok(ovs.length >= 1, 'оверлей .npc-overlay подвешен к body');
  h.frameFn(NOW + 32);
  assert.ok(!panel.style.zIndex,
    'кадр: подъёма всё ещё НЕТ (мир не изменился — только локация)');
});

test('000206 CI-8 (город, пин, правки по итогам ревью): buildingUI «Строительство» + [I] + клик «Переименовать город» → input-оверлей (z-20) → кадр — подъёма НЕТ (renameInputActive: оверлей СВЕРХУ панели, паритет с master)', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  // Город с СОБСТВЕННОЙ свободной внутренней клеткой (строка
  // «Переименовать город» — ТОЛЬКО в меню «Строительство» пустой
  // клетки, openCityBuildMenu; протокол сценария — CI-V16).
  const found = await enterCityFree(h, NOW, myMap);
  const free = found.free;
  walkCity(h, cityStepsTo({ x: g.dungeon.x, y: g.dungeon.y },
    free.x, free.y));
  assert.ok(g.dungeon, 'в городе (не вышел)');
  // [E] на пустой клетке: меню «Строительство» (buildingUI);
  // 000071: buildingUI.open закрыл панель ПЕРВОЙ (если была).
  press(h, 'KeyE');
  release(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true,
    '[E] на пустой клетке: меню «Строительство» (buildingUI)');
  // KeyI выше ВСЕХ гейтов (main.js) — панель открывается ПОВЕРХ
  // открытого меню (скрыта под оверлеем z-20 — существующее
  // поведение).
  press(h, 'KeyI');
  assert.equal(G.playerUI.isOpen(), true, 'KeyI: панель открыта');
  const panel = panelOf(h);
  assert.ok(panel && panel.style.display === 'flex', 'панель открыта');
  h.frameFn(found.now + 16);
  assert.ok(!panel.style.zIndex,
    'кадр: подъёма нет (конъюнкт !inBuilding — панель под меню)');
  // Клик по строке «Переименовать город» (building-ui onOverlayClick
  // → executeAction: close ДО onAction — buildingUI ЗАКРЫЛСЯ САМ;
  // renameCityAt → openCityRenameInput — input-оверлей
  // div.combat-overlay z-20, child body, 000148.05).
  const ov = buildingMenuOf(h);
  assert.ok(ov, 'меню «Строительство» — оверлей в body');
  const rowRen = findAll(ov, '[data-buid="rename-city"]')[0];
  assert.ok(rowRen, 'строка «Переименовать город» (data-buid)');
  ov.listeners.click[0]({ target: rowRen });
  assert.equal(G.buildingUI.isActive(), false,
    'executeAction: buildingUI закрылся (close ДО onAction)');
  assert.equal(G.buildingActions.renameInputActive(), true,
    'input-фаза переименования активна (renameInputActive)');
  const ovIn = buildingMenuOf(h);
  assert.ok(ovIn && ovIn !== ov,
    'input-оверлей переименования в body (свой узел, z-20)');
  assert.equal(G.playerUI.isOpen(), true,
    'панель ЕЩЁ открыта (поток rename её не закрывает — существ. '
    + 'поведение; [I] под оверлеем заблокирован гейтом 000148.05 — '
    + 'повторным [I] панель НЕ закрыть)');
  // Кадр: inDungeon && !inCombat && !inNpc && !inBuilding && !inCraft
  // && !inResurrect — БЕЗ седьмого конъюнкта здесь applyLayer(true)
  // → z-25 — полноэкранная почти непрозрачная панель рендерилась
  // СВЕРХ input-оверлея z-20 (игрок вводит имя вслепую — инверсия
  // layering относительно master). С конъюнктом — подъём снят:
  // паритет с master (панель z-10 ПОД оверлеем z-20: строка-черновик
  // имени и подсказка видны/используемы; эталон CI-V16).
  h.frameFn(found.now + 32);
  assert.ok(!panel.style.zIndex,
    'кадр: подъёма НЕТ (конъюнкт renameInputActive — input-оверлей '
    + 'z-20 СВЕРХУ панели; master-паритет)');
  assert.equal(G.dungeonUI.isActive(), true,
    'локация цела: dungeonUI активен');
  assert.equal(g.dungeon.kind, 'city', 'локация цела: город');
});

test('000195 CI-9 (мир+бой, полный loop ТЗ): debug-бой → KeyT → панель на герое (вкладка «Инвентарь») + подъём «25» → «быстр.» — предмет в быстрый слот → [I] — панель закрыта, подъём снят', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  assert.equal(g.dungeon, null, 'мир (локации нет)');
  const c = g.actions.startCombat();
  assert.ok(c, 'startCombat — debug-бой на тайле');
  assert.equal(G.combatUI.isActive(), true, 'боевой оверлей активен');
  // Эфир — постоянный союзник ПЕРВЫЙ в очереди (main.js: efir
  // ВСЕГДА, 000081) — сжигаем его ход (Space), чтобы тест шел на
  // ходу ГЕРОЯ (ТЗ: «текущему персонажу» = активный юнит).
  assert.equal(G.activeUnitId(c), 'efir', 'сценарий: ход Эфира (первый)');
  press(h, 'Space');
  assert.equal(G.activeUnitId(c), 'player', 'сценарий: ход героя');
  G.addItem(c.player, 'healing_potion');
  press(h, 'KeyT');
  assert.equal(G.playerUI.isOpen(), true,
    'KeyT: панель открыта (ТЗ: кнопка «Предмет» открывает панель)');
  assert.equal(G.playerUI.getActiveCharId(), 'flogiston',
    'текущий персонаж боя = герой (активный юнит)');
  h.frameFn(NOW + 16);
  const panel = panelOf(h);
  assert.ok(panel && panel.style.display === 'flex', 'панель открыта');
  assert.equal(panel.style.zIndex, '25',
    'кадр: подъём «25» (000195: панель над боевым оверлеем в мире)');
  assert.equal(c.ps.invItem, 1, 'открытие пул invItem не тратит');
  // Вкладка «Инвентарь» активна (pane-тело — _invBody; rec.apply
  // ставит активному pane display '', остальным 'none').
  let pane = panel._invBody;
  while (pane && !String(pane.className).includes('cp-tabpane')) {
    pane = pane.parent;
  }
  assert.ok(pane, 'pane вкладки «Инвентарь» (предок _invBody)');
  assert.equal(pane.style.display, '',
    'вкладка «Инвентарь» активна');
  // «быстр.» (000194): ОДИН предмет из общего инвентаря → ПЕРВЫЙ
  // свободный быстрый слот героя (ТЗ: «переложить ... ОДИН предмет ...
  // в быстрые предметы»).
  const row = findAll(panel._invBody, '.cp-itemrow')
    .find((r) => {
      const name = r.querySelector('.cp-itemname');
      return name && String(name.textContent).includes('Зелье лечения');
    });
  assert.ok(row, 'строка предмета «Зелье лечения» в инвентаре');
  const qbtn = row.querySelectorAll('.cp-btn')
    .find((b) => b.dataset.act === 'quick');
  assert.ok(qbtn, 'кнопка «быстр.» (data-act=quick) у строки');
  assert.ok(panel.listeners.click && panel.listeners.click.length,
    'делегированный click-обработчик панели есть');
  panel.listeners.click[0]({ target: qbtn });
  assert.equal(c.player.inventory.quick[0], 'healing_potion',
    'быстрый слот 0 героя = предмет (переложить)');
  assert.equal(G.totalQty(c.player, 'healing_potion'), 0,
    '000223: единица в слоте (перенос, а не использование)');
  assert.equal(c.ps.invItem, 1, 'боевой пул переложением не тратится');
  // Закрытие повторным [I] (full-chain песочница: document-слушатели
  // отброшены — Esc не работает; Esc-семантика — partial-chain).
  press(h, 'KeyI');
  assert.equal(G.playerUI.isOpen(), false, '[I]: панель закрыта');
  h.frameFn(NOW + 32);
  assert.ok(!panel.style.zIndex, 'подъём снят после закрытия');
  resolveCombat(G);
  assert.equal(g.dungeon, null, 'локация цела: мир');
});

test('000195 CI-10 (мир+бой, гейт-якорь): пустой инвентарь — KeyT: панель НЕ открыта, гейт «нет применимых предметов в инвентаре», подъёма нет', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  assert.equal(g.dungeon, null, 'мир (локации нет)');
  const c = g.actions.startCombat();
  assert.ok(c, 'startCombat — debug-бой на тайле');
  assert.ok(!c.player.inventory
    || c.player.inventory.slots.length === 0,
    'сценарий: инвентарь пуст');
  press(h, 'KeyT');
  assert.equal(G.playerUI.isOpen(), false,
    'панель НЕ открыта (гейт: нет применимых предметов)');
  assert.ok(c.log.some((l) =>
    l.includes('нет применимых предметов в инвентаре')),
    'причина гейта в журнале: ' + c.log.join(' | '));
  assert.equal(c.ps.invItem, 1, 'пул не тронут (отказ до траты)');
  h.frameFn(NOW + 16);
  const panel = panelOf(h);
  assert.ok(!panel || !panel.style.zIndex,
    'подъёма нет (панель не построена/закрыта — isOpen-зависимость)');
  resolveCombat(G);
  assert.equal(g.dungeon, null, 'локация цела: мир');
});

// --- 000195 CI-11 (правки по итогам ревью) ---
// Поднятая панель (z-25, 000195) не должна накрывать РЕЗУЛЬТАТ
// боя: в фазе c.result панель закрывается (баннер — z-20; Esc в
// этой фазе панель не закрывает — ui.js-гард cc.result). До фикса:
// панель оставалась открытой — текст результата невидим.

test('000195 CI-11 (мир+бой, пин; ревью): c.result — панель закрывается сама; баннер результата виден (перекрытия z-25 > z-20 нет)', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const rafBefore = h.raf.length;
  const c = g.actions.startCombat();
  assert.ok(c, 'startCombat — бой начат (отладочный)');
  assert.equal(G.combatUI.isActive(), true, 'боевой оверлей активен');
  // Боевой rAF-тик (000047) — ОДИН новый rAF-колбэк в startCombat
  // (main.js-кадр уже в очереди с boot); баннер результата
  // рисуется на нём (браузер — rAF-цикл; vm — прямой вызов).
  assert.equal(h.raf.length, rafBefore + 1,
    'startCombat поставил в очередь боевой rAF-тик');
  const tick = h.raf[h.raf.length - 1];
  press(h, 'KeyI');
  assert.equal(G.playerUI.isOpen(), true, 'KeyI: панель открыта');
  h.frameFn(NOW + 16);
  const panel = panelOf(h);
  assert.equal(panel.style.zIndex, '25',
    'настройка: подъём «25» (панель над боевым оверлеем z-20)');
  // Конец боя (победа) — c.result устанавливается синхронно.
  for (const m of c.units.filter((x) => x.side === 'mob' && x.alive)) {
    G.combatInternals.dealDamageToMob(c, m, 9999);
  }
  assert.ok(c.result && c.result.outcome === 'victory',
    'победа (9999 по живым мобам)');
  tick();
  assert.equal(G.playerUI.isOpen(), false,
    'правка ревью: панель ЗАКРЫТА в фазе c.result (краснота: '
    + 'панель z-25 накрывает баннер z-20, Esc её не закрывает)');
  const banner = findAll(h.body, '.combat-banner')[0];
  assert.ok(banner, 'баннер результата подвешен к оверлею');
  assert.equal(banner.style.display, 'block', 'баннер виден');
  assert.ok(String(banner.textContent).includes('ПОБЕДА'),
    'текст результата виден: ' + banner.textContent);
  h.frameFn(NOW + 32);
  assert.ok(!panel.style.zIndex,
    'подъём снят после закрытия (zIndex falsy — базовый CSS z-10)');
  press(h, 'Space');
  assert.equal(G.combatUI.isActive(), false,
    'бой закрыт (Space → finish)');
  assert.equal(g.dungeon, null, 'локация цела: мир');
});

// ============================================================
// 000206 CI-12 / CI-13 (ретро-пин 000219; контракт-названия
// CI-9/CI-10 заняты 000195 — см. tasks/result/000219)
// ============================================================

test('000206 CI-12 (город, гард TV7): full-chain → вход → KeyI (панель открыта, подъём ещё не ставился) → delete G.playerUI.applyLayer → кадр НЕ падает (typeof-гард main.js frame()); деградация: zIndex falsy, панель работает как на master (isOpen true)', async () => {
  const h = await boot();
  const g = h.sandbox.__game;
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const { now } = await enterCity(h, NOW, myMap,
    (c) => c.fp >= 2 && c.contents.buildings.length >= 1);
  assert.equal(G.dungeonUI.isActive(), true, 'dungeonUI активен (город)');
  press(h, 'KeyI');
  assert.equal(G.playerUI.isOpen(), true, 'KeyI: панель открыта');
  const panel = panelOf(h);
  assert.ok(panel, 'корень .char-panel в body');
  assert.ok(!panel.style.zIndex,
    'фикстура: кадр с открытой панелью ещё не было (zIndex falsy)');
  // Гард (main.js frame, паттерн TV7): applyLayer удалён —
  // frame() не должен падать (typeof-проверка), подъём не ставится.
  delete G.playerUI.applyLayer;
  assert.doesNotThrow(() => h.frameFn(now + 16),
    'кадр без applyLayer — без исключения (typeof-гард)');
  assert.ok(!panel.style.zIndex,
    'деградация: подъём НЕ поставлен (zIndex falsy — как на master)');
  assert.equal(G.playerUI.isOpen(), true,
    'деградация: панель работает (открыта, закрывается)');
  press(h, 'KeyI');
  assert.equal(G.playerUI.isOpen(), false, 'деградация: [I] закрывает панель');
});

test('000206 CI-13 (статичный, пин): лестница z-index из index.html — .char-panel 10 < .fs-btn 15 < .combat-overlay 20 < 25 (подъём панели, inline) < #touch-controls 30 (zO < 25 < zT)', () => {
  const cssZ = (re) => {
    const m = html.match(re);
    assert.ok(m, 'CSS-правило найдено: ' + re);
    const zm = m[1].match(/z-index:\s*([\d.]+)/);
    assert.ok(zm, 'z-index в правиле: ' + re);
    return Number(zm[1]);
  };
  const zP = cssZ(/\.char-panel\s*{([^}]*)}/);
  const zF = cssZ(/\.fs-btn\s*{([^}]*)}/);
  const zO = cssZ(/\.combat-overlay\s*{([^}]*)}/);
  const zT = cssZ(/#touch-controls\s*{([^}]*)}/);
  assert.equal(zP, 10, '.char-panel z-index 10 (факт: ' + zP + ')');
  assert.equal(zF, 15, '.fs-btn z-index 15 (факт: ' + zF + ')');
  assert.equal(zO, 20, '.combat-overlay z-index 20 (факт: ' + zO + ')');
  assert.equal(zT, 30, '#touch-controls z-index 30 (факт: ' + zT + ')');
  assert.ok(zO < 25, 'подъём панели (25, inline) ВЫШЕ оверлея (факт: '
    + zO + ')');
  assert.ok(25 < zT, 'подъём панели (25) НИЖЕ тач-управления (факт: '
    + zT + ')');
});

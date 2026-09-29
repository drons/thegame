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
  }));
  assert.equal(h.errors.length, 0, 'игра не роняется: ' + h.errors.join('; '));
  assertRestored(h, 3);
  assert.ok(h.warns.some((m) => m.includes('buildingOncePerDay')),
    'предупреждение о разделе buildingOncePerDay: ' + h.warns.join(' | '));
  assert.ok(h.warns.some((m) => m.includes('buffs')),
    'предупреждение о разделе buffs: ' + h.warns.join(' | '));

  fireBeforeUnload(h);
  const saved = readSave(h);
  assert.deepEqual(saved.data.buildingOncePerDay, {}, 'битый раздел сброшен в {}');
  assert.deepEqual(saved.data.buffs, [], 'битый раздел сброшен в []');
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
});

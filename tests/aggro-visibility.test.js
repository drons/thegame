// Задача 000233: видимость окружности радиуса агрессии мобов на глобальной
// карте. Третий отчёт пользователя (2026-10-16): «линии радиуса агрессии
// (000172/000203) не видны, закрываются тайлами» — отрисовка идёт (stroke
// вызывается), линия не воспринимается.
//
// Контракт (memory/000233-aggro-circle-visibility.md, ЗАМОРОЗКА):
//   * корневая причина — КОНТРАСТ, не layering (проба §1 memory: z-порядок
//     внутри #sprites корректен — тайлы ДО окружности; тайлов над #sprites
//     в DOM-стеке нет) → усиливаем СТИЛЬ линии, слойность не трогаем;
//   * новый стиль: strokeStyle rgba(255, 64, 56, 0.9) (hue 000172 без
//     изменений; alpha 0.4 → 0.9), lineWidth 2 (константа
//     AGGRO_CIRCLE_WIDTH, был инлайн 1), dash [6, 6] — без изменений,
//     + заливка диска зоны rgba(255, 64, 56, 0.10) (константа
//     AGGRO_CIRCLE_FILL); порядок: style-блок → arc → fill → stroke →
//     setLineDash([]);
//   * геометрия/гарды/позиция Прохода 2.5 — бит-в-бит (M1/M2/M4–M10,
//     LV1 — не трогать; ре-пины M1/M3/M9 — в коммите реализации).
//
// Метрика видимости (ЗАМОРОЖЕНА, вывод/калибровка — memory §3.3):
//   ΔE CIE76 (Lab, sRGB → XYZ D65) между фоном тайла T и смешанным
//   пикселем линии B = α·C + (1−α)·T (сложение в sRGB — канвас-
//   композитинг ПОЛНОСТИЮ покрытого ряда; C — цвет stroke/fill).
//   Модели валидность (предусловие): lineWidth ≥ 2 — тогда у худшего
//   пикселя ровно ОБЪЯВЛЕННАЯ альфа (хотя бы один ряд пикселей покрыт
//   полностью при ЛЮБОМ дробном сдвиге камеры); для w < 2 модель
//   невалидна — 1px-линия растворяется AA (главный дефект 000172).
//   TOL_STROKE = 40: JND 8-бит sRGB ≈ 18–25 → 40 ≈ 1.6–2.2× JND;
//     старый стиль (α 0.4, w 1) — worst 32.8 < 40 (RED), новый
//     (α 0.9, w 2) — worst 69.7 (запас 1.74×).
//   TOL_FILL = [4, 12]: «лёгкий тон — зона читается, тайлы под тоном
//     читаемы» («не заслоняет» — принцип 000172); замерено 5.9..10.1.
//   ТЗ-(а): худший тайл = min ΔE по ВСЕМ фоновым цветам ВСЕХ
//     assets/tiles/*.svg (дуга r = 2·zoom пересекает любые соседние
//     тайлы — вода/горы; спавн групп — только passable, map.js).
//   ПОЧЕМУ НЕ WCAG (memory §3.3): красный (255,64,56) на grass/hill —
//     совпадение по LUMINANCE (WCAG worst: старый = новый = 1.01 —
//     РОВНЯ) → порог НЕ разделяет старый/новый стиль; видимость на этих
//     фонах несёт ХРОМА — ΔE76 её ловит (ΔE 71.6–94.1 на hill/grass).
//
// Фоновые цвета тайлов — ПРАВИЛО ПАРСИНГА (memory §3.3): в каждом
// assets/tiles/*.svg — градиент, на который ссылается ПЕРВЫЙ (по порядку
// документа) <rect width="64" height="64" fill="url(#id)"> (фон тайла;
// оверлей-rect — виньетка — идёт ПОСЛЕ); фоны = <stop> этого градиента
// БЕЗ атрибута stop-opacity. Сейчас: 12 файлов, 24 стопа, 16 distinct.
// Исключено: виньетка deepwater (#deep, stop-opacity 0/0.55 — НЕ фон),
// снежные шапки mountain (polygon-филлы, не стопы градиента).
//
// КРАСНАЯ стадия (TDD): src/main.js НЕ ИЗМЕНЁН (стиль 000172: alpha 0.4,
// lineWidth 1 — инлайн, AGGRO_CIRCLE_FILL/AGGRO_CIRCLE_WIDTH НЕТ,
// fill() в Проходе 2.5 НЕТ). Ожидание: ровно 2 fail из 2604 — AV1/AV2,
// оба — по символам/числам новой функциональности, не по синтаксису:
//   AV1 (node): AGGRO_CIRCLE_FILL отсутствует в main.js (осмысленный
//     fail: заливка зоны не реализована); далее были бы w = 1 < 2
//     (линия растворяется AA) и worst ΔE 32.8 < 40 (sand_1 #b6a676);
//   AV2 (vm, e2e): санитайз/геометрия ЧИСТЫЕ (арки ЕСТЬ, (cx,cy,r) =
//     ожидаемые — M1/M2 зелёные), применённые старые байты (α 0.4) →
//     worst ΔE 32.8 < TOL_STROKE — падает РОВНО порог видимости
//     (симптом жалобы); fill() после arc — нет (заливка не реализована).
//
// ТЗ «Тесты»: (а) проба контраста на реальных тайлах — AV1;
// (б) e2e — кадр рисует окружность в новом стиле (геометрия прежняя)
// — AV2; (в) старые стилевые пины M3-семейства ре-пиннуты — В КОММИТЕ
// РЕАЛИЗАЦИИ (на красной стадии M3 со старыми байтами — зелёный,
// main.js не тронут; M1/M2/M4–M10, LV1–LV7 — геометрия/z-порядок/гарды
// — не задеваются).
//
// Детерминизм AV2 — паттерн tests/mob-aggro-circle.test.js: assets/map.png
// в стабе ВСЕГДА onerror → детерминированный фолбэк G.generateSeedPixels
// (фикс. сид, main.js); ожидаемые окружности тест пересчитывает САМ из
// Game песочницы (мирозависимо). Харнес 1:1-копия того же файла:
// makeContext2d с set-trap — единственный журнал property-SETов в репо.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

// ДОПУСКИ (ЗАМОРОЖЕНЫ — memory/000233-aggro-circle-visibility.md §3.3;
// вывод/калибровка — там, тест несёт только числа).
const TOL_STROKE = 40;
const TOL_FILL_MIN = 4;
const TOL_FILL_MAX = 12;

// Окно «браузера» песочницы + фикс. время кадра (паттерн
// mob-aggro-circle: frame() каждый кадр перезаписывает canvas.width/
// height из window.innerWidth/innerHeight; performance.now = NOW).
const VIEW_W = 1280;
const VIEW_H = 720;
const NOW = 1000;
// Допуск сравнения геометрии: формулы в тесте и в реализации — те же
// операции (G.worldToScreen, radius * zoom) — 1e-6 px ловит любой
// реальный сдвиг, но не ulp-шум.
const EPS = 1e-6;

// --- Метрика: sRGB → XYZ (D65) → Lab; ΔE CIE76 (memory §3.3) ---

function srgb2lin(c) {
  c = c / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function rgb2lab(rgb) {
  const [r, g, b] = rgb.map(srgb2lin);
  const X = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
  const Y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
  const Z = 0.0193339 * r + 0.1191920 * g + 0.9503041 * b;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function dE76(rgbA, rgbB) {
  const a = rgb2lab(rgbA);
  const b = rgb2lab(rgbB);
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

// Канвас-композитинг полностью покрытого ряда: B = α·C + (1−α)·T
// (сложение в sRGB, 0..255).
function mixRgb(alpha, c, t) {
  return [0, 1, 2].map((i) => alpha * c[i] + (1 - alpha) * t[i]);
}

function rgb2hex(rgb) {
  return '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0'))
    .join('');
}

// 'rgba(r, g, b, a)' → {r, g, b, a} или null (валидация у вызывающего —
// с контекстным сообщением).
function rgbaOf(s) {
  const m = /^\s*rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9]*\.?[0-9]+)\s*\)\s*$/.exec(String(s));
  if (!m) return null;
  return { r: +m[1], g: +m[2], b: +m[3], a: +m[4] };
}

// --- Фоновые цвета тайлов (правило парсинга — memory §3.3) ---

function hex2rgb(h) {
  let x = String(h).replace('#', '');
  if (x.length === 3) x = x.split('').map((ch) => ch + ch).join('');
  return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16),
    parseInt(x.slice(4, 6), 16)];
}

// Фоны одного тайла: ПЕРВЫЙ 64×64 rect (фон; оверлей-виньетка идёт
// после) → градиент по id → <stop> БЕЗ stop-opacity.
function tileBackgrounds(file) {
  const s = fs.readFileSync(path.join(ROOT, 'assets', 'tiles', file), 'utf8');
  const m = s.match(/<rect[^>]*width="64"[^>]*height="64"[^>]*fill="url\(#([A-Za-z0-9_-]+)\)"/);
  assert.ok(m,
    file + ': нет фонового <rect width="64" height="64" fill="url(#…)">'
    + ' (правило парсинга нарушено?)');
  const gm = s.match(new RegExp(
    '<(?:linear|radial)Gradient[^>]*id="' + m[1] + '"[^>]*>([\\s\\S]*?)</(?:linear|radial)Gradient>'));
  assert.ok(gm,
    file + ': градиент ' + m[1] + ' не найден (ссылка rect сломана?)');
  const out = [];
  for (const sm of gm[1].matchAll(/<stop[^>]*>/g)) {
    const tag = sm[0];
    if (/stop-opacity=/.test(tag)) continue; // виньетка — НЕ фон
    const c = tag.match(/stop-color="([^"]+)"/);
    assert.ok(c, file + ': <stop> без stop-color');
    out.push(hex2rgb(c[1]));
  }
  assert.ok(out.length >= 2,
    file + ': фоновых стоп < 2 (правило парсинга нарушено?)');
  return out;
}

// ВСЕ фоновые цвета ВСЕХ тайлов + анти-«вакуум» (12 файлов, ≥ 24 стопов —
// иначе проба контраста проверяет не «все тайлы» → осмысленный fail,
// не skip).
function allTileBackgrounds() {
  const dir = path.join(ROOT, 'assets', 'tiles');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).sort();
  assert.ok(files.length >= 12,
    'ассетов тайлов assets/tiles/*.svg < 12 (найдено ' + files.length
    + ') — проба контраста вакуумна (анти-вакуум)');
  const out = [];
  for (const f of files) {
    for (const rgb of tileBackgrounds(f)) out.push({ file: f, rgb });
  }
  assert.ok(out.length >= 24,
    'фоновых цветов тайлов < 24 (найдено ' + out.length
    + ') — проба контраста вакуумна (анти-вакуум)');
  return out;
}

// --- Стиль окружности из ТЕКСТА src/main.js (AV1, kind: node) ---
// Ширина — константа AGGRO_CIRCLE_WIDTH (новый контракт) ИЛИ единственная
// инлайн-запись s2.lineWidth = N (контракт 000172 — сейчас, L3242; во
// всём main.js она одна — парсинг устойчив к обеим формам реализации).

function parseAggroStyle() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  const styleM = src.match(/AGGRO_CIRCLE_STYLE\s*=\s*'([^']+)'/);
  assert.ok(styleM,
    'AGGRO_CIRCLE_STYLE нет в src/main.js (регрессия 000172?)');
  const style = rgbaOf(styleM[1]);
  assert.ok(style,
    'AGGRO_CIRCLE_STYLE — rgba(r, g, b, a): ' + styleM[1]);
  const dashM = src.match(/AGGRO_CIRCLE_DASH\s*=\s*\[([^\]]+)\]/);
  assert.ok(dashM,
    'AGGRO_CIRCLE_DASH нет в src/main.js (регрессия 000172?)');
  const dash = dashM[1].split(',').map((x) => Number(x.trim()));
  assert.ok(dash.length >= 1 && dash.every((x) => Number.isFinite(x) && x > 0),
    'AGGRO_CIRCLE_DASH — положительные числа (px): [' + dashM[1] + ']');
  let width = null;
  const widthM = src.match(/AGGRO_CIRCLE_WIDTH\s*=\s*([0-9]+(?:\.[0-9]+)?)/);
  if (widthM) {
    width = Number(widthM[1]);
  } else {
    const inlines = Array.from(src.matchAll(/s2\.lineWidth\s*=\s*([0-9]+(?:\.[0-9]+)?)/g),
      (m) => Number(m[1]));
    assert.equal(inlines.length, 1,
      'инлайн s2.lineWidth = N: ровно одна запись во всём src/main.js '
      + '(найдено ' + inlines.length + ') — парсинг lineWidth ненадёжен');
    width = inlines[0];
  }
  const fillM = src.match(/AGGRO_CIRCLE_FILL\s*=\s*'([^']+)'/);
  assert.ok(fillM,
    'AGGRO_CIRCLE_FILL нет в src/main.js — заливка зоны НЕ реализована '
    + '(000233: окружность не видна — только линии недостаточно, зона '
    + 'должна читаться областью)');
  const fill = rgbaOf(fillM[1]);
  assert.ok(fill,
    'AGGRO_CIRCLE_FILL — rgba(r, g, b, a): ' + fillM[1]);
  return { style, width, dash, fill };
}

// --- Тесты ---

test('AV1: проба контраста (ТЗ-а): объявленный в main.js стиль окружности виден на худшем реальном тайле', () => {
  const { style, width, fill } = parseAggroStyle();
  const bgs = allTileBackgrounds();
  // Предусловия модели (memory §3.3): w ≥ 2 — худший пиксель несёт ровно
  // ОБЪЯВЛЕННУЮ альфу; α ∈ (0, 1]; α_fill ∈ (0, 1). Для w < 2 модель
  // невалидна — осмысленный fail «линия растворяется AA», не синтаксис.
  assert.ok(width >= 2,
    'lineWidth ' + width + ' < 2 — тонкая линия растворяется AA-растворением '
    + 'при дробном сдвиге камеры (хотя бы одна полная строка пикселей не '
    + 'гарантирована; модель видимости невалидна)');
  assert.ok(style.a > 0 && style.a <= 1,
    'stroke-alpha ' + style.a + ' ∉ (0, 1] (предусловие модели)');
  assert.ok(fill.a > 0 && fill.a < 1,
    'fill-alpha ' + fill.a + ' ∉ (0, 1) — заливка должна быть ЛЁГКОЙ '
    + '(«не заслоняет» — принцип 000172)');
  // Линия: worst ΔE76 по ВСЕМ фоновым цветам ВСЕХ тайлов ≥ TOL_STROKE.
  let worst = Infinity, worstBg = null;
  for (const { file, rgb } of bgs) {
    const d = dE76(mixRgb(style.a, [style.r, style.g, style.b], rgb), rgb);
    if (d < worst) { worst = d; worstBg = { file, rgb }; }
  }
  assert.ok(worst >= TOL_STROKE,
    'worst ΔE76 = ' + worst.toFixed(1) + ' (' + worstBg.file + ' '
    + rgb2hex(worstBg.rgb) + ') < ' + TOL_STROKE
    + ' — линия НЕ видна на худшем тайле (симптом пользователя: '
    + 'окружность не воспринимается)');
  // Заливка: лёгкий тон на КАЖДОМ фоне: ΔE76 ∈ [TOL_FILL_MIN, TOL_FILL_MAX]
  // (зона читается, тайлы под тоном читаемы).
  for (const { file, rgb } of bgs) {
    const d = dE76(mixRgb(fill.a, [fill.r, fill.g, fill.b], rgb), rgb);
    assert.ok(d >= TOL_FILL_MIN && d <= TOL_FILL_MAX,
      file + ' ' + rgb2hex(rgb) + ': ΔE76 заливки = ' + d.toFixed(1)
      + ' ∉ [' + TOL_FILL_MIN + ', ' + TOL_FILL_MAX + '] — зона либо '
      + 'не читается, либо заливка заслоняет тайл');
  }
});

// --- VM-харнес: 1:1-копия паттерна tests/mob-aggro-circle.test.js ---

// Цепочка скриптов — из index.html (не хардкод: изменения порядка
// подхватятся сами; регрессия порядка — tests/index-order.test.js).
// НОВОГО <script>-тега в задаче НЕТ (усиление — внутри Прохода 2.5).
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

// --- Canvas 2d-стаб: ВЫЗОВЫ методов — [имя, args], property-SETы —
// ['set:' + свойство, [значение]] (set-trap — единственный журнал
// strokeStyle/lineWidth/fillStyle в репо; порядок записей = порядок
// операций кадра). ---

function makeContext2d(el) {
  const calls = el.drawCalls = [];
  // Аргумент/значение из vm-рема (у него СВОЙ Array.prototype):
  // массив копируем [ ...v ] в хост-рем, иначе deepStrictEqual([6,6]
  // из песочницы, [6,6] хоста) падает по прототипу, а не по значению.
  const norm = (v) => (Array.isArray(v) ? [...v] : v);
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k]
      : (...args) => { calls.push([k, args.map(norm)]); }),
    set: (t, k, v) => {
      t[k] = v;
      calls.push(['set:' + k, [norm(v)]]);
      return true;
    },
  });
}

// --- «Снисходительный» DOM-элемент: known-свойства настоящие,
// неизвестные методы — no-op (утилита main-visuals без изменений). ---

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

// --- Песочница: вся цепочка index.html (браузерная ветка UMD) ---

function bootSandbox(rejectSet) {
  const winListeners = {};
  const raf = [];
  const warns = [];
  const errors = [];
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
  // #game — WebGL (без него main.js уходит в фолбэк-ветку «WebGL не
  // поддерживается» и игра не стартует); #sprites — 2d со спаем.
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl() : makeContext2d(gameCanvas));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? makeContext2d(spriteCanvas) : null);
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
    addEventListener: (t, f) => {
      (winListeners[t] || (winListeners[t] = [])).push(f);
    },
    removeEventListener() {},
    // localStorage нет → main.js: saveStorage = undefined (try/catch) →
    // сейвы в песочнице не пишутся.
  };
  // Image-стаб: src ставится ПОСЛЕ onload/onerror (main.js). Загрузка —
  // микротаск: assets/map.png ВСЕГДА onerror (детерминированный фолбэк
  // G.generateSeedPixels, main.js loadMapPixels), остальные пути —
  // onload. На каждом изображении метка __asset — по ней тест
  // отличает вызовы drawImage.
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
    gameCanvas, spriteCanvas, hud,
  };
}

// Промывка микротасков (все загрузки Image + loadMapPixels().then:
// создание карты, спавн, requestAnimationFrame(frame)).
const drain = () => new Promise((r) => setImmediate(r));

async function boot(rejectSet) {
  const h = bootSandbox(rejectSet);
  await drain();
  await drain();
  await drain();
  return h;
}

// Один кадр: вызываем последний захваченный rAF-колбэк (frame) с
// фиксированным now; возвращаем ТОЛЬКО записи этого кадра (clearRect
// кадра — первая запись).
function frameOnce(h) {
  const n0 = h.spriteCanvas.drawCalls.length;
  h.raf[h.raf.length - 1](NOW);
  return h.spriteCanvas.drawCalls.slice(n0);
}

// drawImage-вызовы текстур тайлов (санитайз: слой реально нарисован,
// а не пустой — иначе тесты прошли бы «вакуумно»).
function tileDraws(calls) {
  return calls.filter((c) => c[0] === 'drawImage'
    && c[1][0]
    && typeof c[1][0].__asset === 'string'
    && c[1][0].__asset.startsWith('assets/tiles/'));
}

// ВСЕ arc-вызовы кадра с индексом в журнале. Спрайт-слой (drawSprites)
// до 000172 НЕ содержал arc-вызовов (WebGL-слой — отдельный контекст,
// в drawCalls не пишется) → каждый arc журнала — агро-окружность.
function arcsOf(calls) {
  const out = [];
  for (let i = 0; i < calls.length; i++) {
    if (calls[i][0] === 'arc') {
      out.push({
        i,
        cx: calls[i][1][0], cy: calls[i][1][1], r: calls[i][1][2],
        a0: calls[i][1][3], a1: calls[i][1][4],
      });
    }
  }
  return out;
}

// Ближайшая ПРЕДЫДУЩАЯ запись журнала с именем (состояние, выставленное
// перед операцией): {j, v} — индекс + значение ([v][0] для set-*).
// Стиль выставляется ПЕР-КРУГ (каждая окружность — свой блок set-*)
// → «state на момент операции» корректен при любом числе окружностей.
function prevEntry(calls, i, name) {
  for (let j = i - 1; j >= 0; j--) {
    if (calls[j][0] === name) return { j, v: calls[j][1][0] };
  }
  return null;
}

// Ближайшая СЛЕДУЮЩАЯ запись журнала с именем.
function nextEntry(calls, i, name) {
  for (let j = i + 1; j < calls.length; j++) {
    if (calls[j][0] === name) return { j, v: calls[j][1][0] };
  }
  return null;
}

// --- Ожидаемые агро-окружности кадра: пересчёт из Game песочницы
// (мирозависимо, паттерн expectedDecos) ---
// ТОЛЬКО триггерящие группы; радиус — из G.groupZoneInfo (ЕДИНЫЙ
// источник, combat.js 000135 — НЕ хардкод); центр — центр тайла той же
// проекцией G.worldToScreen, что и все слои. Окно — visibleTileRange
// (margin 2 — то же, что frameTiles в buildFrame main.js).
function expectedAgroCircles(G, myMap, cam, zoom) {
  const range = G.visibleTileRange(cam.x, cam.y, VIEW_W, VIEW_H, zoom);
  const out = [];
  for (let ty = range.y0; ty <= range.y1; ty++) {
    for (let tx = range.x0; tx <= range.x1; tx++) {
      const t = myMap.tileAt(tx, ty);
      if (!t.hasMobGroup) continue;
      const info = G.groupZoneInfo(t.mobGroup);
      if (!info || !info.triggers || !(info.radius > 0)) continue;
      const c = G.worldToScreen(tx + 0.5, ty + 0.5, cam.x, cam.y,
        zoom, VIEW_W, VIEW_H);
      out.push({ x: tx, y: ty, cx: c.x, cy: c.y, r: info.radius * zoom });
    }
  }
  return out;
}

// --- Общий сценарий: чистая загрузка + первый кадр + санитайз ---
// Анти-«вакуум»: ошибок загрузки нет (h.errors === 0), все ассеты
// готовы, слой реально нарисован (текстуры тайлов в кадре).
async function scene() {
  const h = await boot(new Set());
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет (порядок цепочки): ' + h.errors.join('; '));
  const g = h.sandbox.__game;
  const st = g.state;
  assert.ok(st.map, 'карта сгенерирована');
  assert.equal(st.map.fromPng, false,
    'map.png в стабе провалился → фолбэк G.generateSeedPixels');
  assert.ok(st.player, 'спавн найден');
  assert.equal(st.sprites.ready, st.sprites.total, 'все ассеты загрузились');
  const calls = frameOnce(h);
  assert.ok(tileDraws(calls).length > 0,
    'текстуры тайлов нарисованы (слой спрайтов не пустой)');
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  return { h, g, st, calls, G, myMap };
}

test('AV2: e2e (ТЗ-б): кадр рисует окружность в стиле, видимом на худшем тайле; геометрия прежняя', async () => {
  const { h, st, calls, G, myMap } = await scene();
  const arcs = arcsOf(calls);
  // Пресуппозиция (анти-вакуум): в кадре ЕСТЬ агро-arc — иначе проверка
  // стиля/порядка «вакуумна» (0 окружностей — 0 проверок).
  assert.ok(arcs.length >= 1,
    'в кадре есть агро-arc (пресуппозиция); найдено 0 — окружности '
    + 'не нарисованы');
  // --- Геометрия (НЕ МЕНЯЕТСЯ, ТЗ: центр тайла группы, radius·zoom):
  // мультимножественное равенство (cx, cy, r) — арки = ожидаемые.
  const expected = expectedAgroCircles(G, myMap, st.cam, st.zoom);
  assert.ok(expected.length >= 2,
    'сценарий: >= 2 триггерящих группы в кадре (найдено '
    + expected.length + ')');
  assert.equal(arcs.length, expected.length,
    'окружностей в кадре = ожидаемых: фактически ' + arcs.length
    + ', ожидаемо ' + expected.length);
  const pool = expected.slice();
  for (const a of arcs) {
    const i = pool.findIndex((e) =>
      Math.abs(e.cx - a.cx) < EPS
      && Math.abs(e.cy - a.cy) < EPS
      && Math.abs(e.r - a.r) < EPS);
    assert.ok(i >= 0,
      'неожиданная окружность: центр (' + a.cx + ', ' + a.cy
      + '), r = ' + a.r + ' (геометрия изменилась? ТЗ: центр/радиус — '
      + 'без изменений)');
    pool.splice(i, 1);
  }
  assert.equal(pool.length, 0,
    'не нарисованы: ' + JSON.stringify(pool.slice(0, 3)));
  // --- Стиль (ТЗ-б): применённый в кадре стиль проходит ТОТ ЖЕ
  // TOL, что и объявленный в AV1.
  const bgs = allTileBackgrounds();
  for (const a of arcs) {
    const strokeJ = nextEntry(calls, a.i, 'stroke');
    assert.ok(strokeJ, 'arc: stroke()-вызов после arc (кольцо рисуется)');
    const ss = prevEntry(calls, strokeJ.j, 'set:strokeStyle');
    assert.ok(ss, 'arc: strokeStyle выставлен перед stroke');
    const lw = prevEntry(calls, strokeJ.j, 'set:lineWidth');
    assert.ok(lw, 'arc: lineWidth выставлен перед stroke');
    const stroke = rgbaOf(ss.v);
    assert.ok(stroke,
      'применённый strokeStyle — rgba(r, g, b, a): ' + ss.v);
    // Порог видимости САМ (ТЗ: НАДЁЖНО видна): даже при полной
    // занятости ряда пикселей на ОБЪЯВЛЕННОЙ альфе контраст ≥ TOL.
    // Старый стиль (α 0.4) — worst 32.8 < 40 (RED: ровно порог).
    let worst = Infinity, worstBg = null;
    for (const { file, rgb } of bgs) {
      const d = dE76(mixRgb(stroke.a, [stroke.r, stroke.g, stroke.b], rgb), rgb);
      if (d < worst) { worst = d; worstBg = { file, rgb }; }
    }
    assert.ok(worst >= TOL_STROKE,
      'применённый стиль: worst ΔE76 = ' + worst.toFixed(1) + ' ('
      + worstBg.file + ' ' + rgb2hex(worstBg.rgb) + ') < ' + TOL_STROKE
      + ' — окружность НЕ видна на худшем тайле (симптом жалобы: '
      + 'линия не воспринимается)');
    // Предусловия модели: w ≥ 2 — полный ряд пикселей; α ∈ (0, 1].
    assert.ok(lw.v >= 2,
      'применённый lineWidth ' + lw.v + ' < 2 — линия растворяется '
      + 'AA-растворением при дробном сдвиге камеры (модель видимости '
      + 'невалидна)');
    assert.ok(stroke.a > 0 && stroke.a <= 1,
      'применённый stroke-alpha ' + stroke.a + ' ∉ (0, 1] '
      + '(предусловие модели)');
    // Заливка зоны (диск): лёгкий тон, memory §3.1/§4.3.
    const fillJ = nextEntry(calls, a.i, 'fill');
    assert.ok(fillJ,
      'arc: fill() после arc НЕТ — заливка зоны не реализована (000233: '
      + 'зона должна читаться областью)');
    const fsJ = prevEntry(calls, fillJ.j, 'set:fillStyle');
    assert.ok(fsJ, 'arc: fillStyle выставлен перед fill');
    const fillc = rgbaOf(fsJ.v);
    assert.ok(fillc,
      'применённый fillStyle — rgba(r, g, b, a): ' + fsJ.v);
    assert.ok(fillc.a > 0 && fillc.a < 1,
      'применённый fill-alpha ' + fillc.a + ' ∉ (0, 1) — заливка '
      + 'должна быть ЛЁГКОЙ');
    for (const { file, rgb } of bgs) {
      const d = dE76(mixRgb(fillc.a, [fillc.r, fillc.g, fillc.b], rgb), rgb);
      assert.ok(d >= TOL_FILL_MIN && d <= TOL_FILL_MAX,
        file + ' ' + rgb2hex(rgb) + ': ΔE76 заливки = ' + d.toFixed(1)
        + ' ∉ [' + TOL_FILL_MIN + ', ' + TOL_FILL_MAX + ']');
    }
  }
  // --- Порядок (memory §3.2): fill сразу после arc (диск зоны), stroke
  // сразу после fill (кольцо — верхний элемент при полном alpha),
  // setLineDash([]) после stroke (dash-состояние не «висит»).
  for (const a of arcs) {
    assert.equal(calls[a.i + 1][0], 'fill',
      'сразу после arc — fill() (диск зоны)');
    const fillJ = nextEntry(calls, a.i, 'fill');
    assert.equal(calls[fillJ.j + 1][0], 'stroke',
      'сразу после fill — stroke() (кольцо поверх диска)');
    const reset = nextEntry(calls, fillJ.j + 1, 'setLineDash');
    assert.ok(reset, 'после stroke — сброс setLineDash');
    assert.deepEqual(reset.v, [],
      'setLineDash([]) — dash-состояние не остаётся после stroke');
  }
  assert.equal(h.errors.length, 0,
    'ошибок нет после кадра: ' + h.errors.join('; '));
});

// Задача 000343 (оптимизация рендера G1, RENDER-OPTIMIZE §5G/§5.1(G1)):
// реюз Float32Array в buildFrame (src/main.js — загрузка verts в ARRAY_BUFFER).
//
// До правки каждый rAF-кадр аллоцировал НОВЫЙ Float32Array(verts) для
// gl.bufferData (steady — из 0 вершин, legacy-кадр — до единиц МБ). Правка —
// модифицированный путь (а) БЕЗ bufferSubData: capacity-растущий склад
// `uploadBuf` в замыкании + СВЕЖИЙ exact-length subarray-view на кадр +
// bufferData ВСЕГДА (1 вызов/кадр, DYNAMIC_DRAW). Вывод — бит-в-бит:
// view.set(plainArray) ≡ new Float32Array(plainArray) (побайтовая проба
// V8 на 1.5/NaN/±Infinity/−0), count для drawArrays считается из
// verts.length в frame(), не из буфера.
//
// ЗАПРЕЩЁННЫЕ ветки (пины мастера, ТЗ 000343):
//   * «bufferSubData при неизменной capacity» и «пропуск bufferData при
//     0 вершин» — обе убирают вызов bufferData с кадра и красят RM-10
//     (tests/global-map-draw.test.js:840 — «ровно 1 bufferData + 1
//     drawArrays count=0» на пустом кадре; ассерции :864/:866). Нумерация
//     по эррате 000342: bufferData-пин несёт RM-10, НЕ RM-6 (RM-6 — 1 rAF
//     + 1 clearRect, :597); дубль этого пина — 000339 T4.
//   * «отдать тот же объект» (кэш EMPTY-константы, возврат склада целиком)
//     — красит 000339 T4 (:486–488 assert.notEqual между кадрами). Поэтому
//     subarray ОБЯЗАТЕЛЕН: он всегда возвращает свежий view (V8-проба,
//     включая subarray(0,0) на пустом буфере), data-block при этом общий.
//
// Контракты (НЕ ослаблять; тесты-носители, все 0-diff):
//   * RM-6 (global-map-draw :597) и RM-10 (:840) — без ре-пинов;
//     render-steady-gate-skip-000339 T4 (1 bufferData/кадр, свежесть),
//     frame-tiles-cache-000276 FT-1 (бюджет buildFrameOnce — только
//     выигрыш), main-visuals / mob-chase-e2e / chunk-render.
//   * Стаб-запись хранит data ПО ССЫЛКЕ, а склад мутируется следующим
//     кадром: контентные чтения payload — только немедленные (после
//     frameAt-сброса); единственный живущий — prevData в 000339 T4,
//     читает ТОЛЬКО идентичность (не содержимое).
//
// ТЕСТЫ (RED на HEAD: T2 и T6 — переиспользование склада/счётчик
// аллокаций; HEAD делает new Float32Array(verts) каждый кадр, причём V8
// zero-length буферы НЕ шарит — T2 красен и на steady-серии. T1/T3/T4/
// T5/T7 — инвариант-пины, зелены до и после — прецедент 000340 T1/T6):
//   T1 GOLD бит-в-бит: серии pump'ов (rebuild → hit → spawnBuildingTile →
//      hit-с-маркером → тёплые) в partial-boot (не готовы assets/tiles/) и
//      steady-boot на крошечном вьюпорте 16×16 (диапазон 3×3 тайла); после
//      каждого pumpa bufNorm === золотой литерал (снят на HEAD); допы:
//      miss ≡ hit и повторный boot ≡ boot (T5-паттерн 000339). Ловит
//      обрезку/сдвиг контента (мутация M2).
//   T2 ПЕРЕИСПОЛЬЗОВАНИЕ БУФЕРА (КРАСНЫЙ на HEAD): ≥3 тёплых кадра —
//      Set(ArrayBuffer'ов payload) размера РОВНО 1; серия с НЕвозрастающим
//      числом вершин (wheel-in) — склад тот же.
//   T3 RM-10-ПАРИТЕТ: steady — bufferData РОВНО 1/кадр, length 0,
//      target ARRAY_BUFFER, usage DYNAMIC_DRAW, drawArrays РОВНО 1, count 0.
//   T4 СВЕЖЕСТЬ VIEW (зеркало 000339 T4): соседние payload-ссылки покодрово
//      notEqual при length 0 и при непустых кадрах — запрещает отдавать
//      склад/кэш-константу (мутация M3 красит и 000339 T4).
//   T5 ТОЧНАЯ ДЛИНА: каждый кадр data.length === 6 × drawArrays count;
//      после wheel-in (вершин меньше) длина МЕНЬШЕ прежней — запрещает
//      загрузку полного capacity (ловит M3).
//   T6 СЧЁТЧИК АЛЛОКАЦИЙ Float32Array (КРАСНЫЙ на HEAD): отдельный boot с
//      Counted-подклассом Float32Array ВНУТРИ vm (Symbol.species → нативный,
//      иначе subarray-вью засчитывались бы аллокациями); мера — дельты
//      __f32Allocs вокруг изолированных g.actions.buildFrameOnce (путь
//      БЕЗ orthoMatrix-шума map.js): тёплые steady/partial — дельта 0
//      (HEAD: 1/вызов); рост после wheel-out в ZOOM_MIN — ровно 1 на первом
//      таком кадре, следующие 0; контроль wiring: полный frameAt-кадр даёт
//      дельту ≥ 1 (там orthoMatrix).
//   T7 НОЛЬ bufferSubData: в glCalls нет ни одной записи fn==='bufferSubData'
//      (ловит M4 вместе с RM-10 срезом global-map-draw).
//
// Харнес — копия tests/render-frame-subsets-000340.test.js /
// render-steady-gate-skip-000339.test.js (ВЕСЬ <script>-цепочка index.html
// в vm, gl-стаб РАСШИРЕН записью {fn, data, buffer: data.buffer, target,
// usage} и bufferSubData-записью, Image-стаб: map.png — ВСЕГДА onerror →
// детерминированный спавн-мир; reject-предикат по префиксу — частичная
// загрузка 000339; NOW = 1000; frameAt сбрасывает glCalls). Сравнения
// НАГРУЗОК — только Array.from/Buffer.from (кросс-realm: deepStrictEqual
// sandbox-typed-array против host-эталона падает по прототипу — паттерн
// bufNorm 000339).
//
// kind=node: node:test + node:assert/strict + node:vm, без npm-зависимостей.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));

const VIEW_W = 1280;
const VIEW_H = 720;
const SMALL_W = 16;
const SMALL_H = 16;
const NOW = 1000; // performance.now() в песочнице заморожен на NOW

const ARRAY_BUFFER = 34962;
const DYNAMIC_DRAW = 35048;
const BUILDING_COLOR = [0.98, 0.83, 0.30];
const EPS = 1e-4;
// Частичная загрузка (000339-паттерн): НЕ готовы assets/tiles/* → базовые
// legacy-квады рисуются; спрайты мобов/построек/героя ready → маркерных
// веток нет ( кроющий маркер даёт только spawnBuildingTile).
const TILES_BROKEN = (v) => v.startsWith('assets/tiles/');

// --- Золотые буферы (RED-фаза, HEAD до правки; крошечный вьюпорт 16×16, ---
// --- диапазон 3×3 тайла вокруг спавна (0,0); по 6 floats на вершину)   ---

const GOLD_PARTIAL_L0 = [
  -1, -1, 0.33908164501190186, 0.5490816235542297, 0.24908164143562317, 1,
  0, -1, 0.33908164501190186, 0.5490816235542297, 0.24908164143562317, 1,
  0, 0, 0.33908164501190186, 0.5490816235542297, 0.24908164143562317, 1,
  -1, -1, 0.33908164501190186, 0.5490816235542297, 0.24908164143562317, 1,
  0, 0, 0.33908164501190186, 0.5490816235542297, 0.24908164143562317, 1,
  -1, 0, 0.33908164501190186, 0.5490816235542297, 0.24908164143562317, 1,
  0, -1, 0.3605678677558899, 0.5705678462982178, 0.2705678641796112, 1,
  1, -1, 0.3605678677558899, 0.5705678462982178, 0.2705678641796112, 1,
  1, 0, 0.3605678677558899, 0.5705678462982178, 0.2705678641796112, 1,
  0, -1, 0.3605678677558899, 0.5705678462982178, 0.2705678641796112, 1,
  1, 0, 0.3605678677558899, 0.5705678462982178, 0.2705678641796112, 1,
  0, 0, 0.3605678677558899, 0.5705678462982178, 0.2705678641796112, 1,
  1, -1, 0.3264312446117401, 0.5364312529563904, 0.23643124103546143, 1,
  2, -1, 0.3264312446117401, 0.5364312529563904, 0.23643124103546143, 1,
  2, 0, 0.3264312446117401, 0.5364312529563904, 0.23643124103546143, 1,
  1, -1, 0.3264312446117401, 0.5364312529563904, 0.23643124103546143, 1,
  2, 0, 0.3264312446117401, 0.5364312529563904, 0.23643124103546143, 1,
  1, 0, 0.3264312446117401, 0.5364312529563904, 0.23643124103546143, 1,
  -1, 0, 0.3300960659980774, 0.5400960445404053, 0.2400960624217987, 1,
  0, 0, 0.3300960659980774, 0.5400960445404053, 0.2400960624217987, 1,
  0, 1, 0.3300960659980774, 0.5400960445404053, 0.2400960624217987, 1,
  -1, 0, 0.3300960659980774, 0.5400960445404053, 0.2400960624217987, 1,
  0, 1, 0.3300960659980774, 0.5400960445404053, 0.2400960624217987, 1,
  -1, 1, 0.3300960659980774, 0.5400960445404053, 0.2400960624217987, 1,
  0, 0, 0.3388267755508423, 0.5488267540931702, 0.2488267719745636, 1,
  1, 0, 0.3388267755508423, 0.5488267540931702, 0.2488267719745636, 1,
  1, 1, 0.3388267755508423, 0.5488267540931702, 0.2488267719745636, 1,
  0, 0, 0.3388267755508423, 0.5488267540931702, 0.2488267719745636, 1,
  1, 1, 0.3388267755508423, 0.5488267540931702, 0.2488267719745636, 1,
  0, 1, 0.3388267755508423, 0.5488267540931702, 0.2488267719745636, 1,
  1, 0, 0.34105396270751953, 0.5510539412498474, 0.25105395913124084, 1,
  2, 0, 0.34105396270751953, 0.5510539412498474, 0.25105395913124084, 1,
  2, 1, 0.34105396270751953, 0.5510539412498474, 0.25105395913124084, 1,
  1, 0, 0.34105396270751953, 0.5510539412498474, 0.25105395913124084, 1,
  2, 1, 0.34105396270751953, 0.5510539412498474, 0.25105395913124084, 1,
  1, 1, 0.34105396270751953, 0.5510539412498474, 0.25105395913124084, 1,
  -1, 1, 0.3284331262111664, 0.5384331345558167, 0.2384331077337265, 1,
  0, 1, 0.3284331262111664, 0.5384331345558167, 0.2384331077337265, 1,
  0, 2, 0.3284331262111664, 0.5384331345558167, 0.2384331077337265, 1,
  -1, 1, 0.3284331262111664, 0.5384331345558167, 0.2384331077337265, 1,
  0, 2, 0.3284331262111664, 0.5384331345558167, 0.2384331077337265, 1,
  -1, 2, 0.3284331262111664, 0.5384331345558167, 0.2384331077337265, 1,
  0, 1, 0.3538551330566406, 0.5638551712036133, 0.2638551592826843, 1,
  1, 1, 0.3538551330566406, 0.5638551712036133, 0.2638551592826843, 1,
  1, 2, 0.3538551330566406, 0.5638551712036133, 0.2638551592826843, 1,
  0, 1, 0.3538551330566406, 0.5638551712036133, 0.2638551592826843, 1,
  1, 2, 0.3538551330566406, 0.5638551712036133, 0.2638551592826843, 1,
  0, 2, 0.3538551330566406, 0.5638551712036133, 0.2638551592826843, 1,
  1, 1, 0.3458840250968933, 0.5558840036392212, 0.2558840215206146, 1,
  2, 1, 0.3458840250968933, 0.5558840036392212, 0.2558840215206146, 1,
  2, 2, 0.3458840250968933, 0.5558840036392212, 0.2558840215206146, 1,
  1, 1, 0.3458840250968933, 0.5558840036392212, 0.2558840215206146, 1,
  2, 2, 0.3458840250968933, 0.5558840036392212, 0.2558840215206146, 1,
  1, 2, 0.3458840250968933, 0.5558840036392212, 0.2558840215206146, 1,
];

const GOLD_PARTIAL_L1 = [
  -1, -1, 0.33908164501190186, 0.5490816235542297, 0.24908164143562317, 1,
  0, -1, 0.33908164501190186, 0.5490816235542297, 0.24908164143562317, 1,
  0, 0, 0.33908164501190186, 0.5490816235542297, 0.24908164143562317, 1,
  -1, -1, 0.33908164501190186, 0.5490816235542297, 0.24908164143562317, 1,
  0, 0, 0.33908164501190186, 0.5490816235542297, 0.24908164143562317, 1,
  -1, 0, 0.33908164501190186, 0.5490816235542297, 0.24908164143562317, 1,
  0, -1, 0.3605678677558899, 0.5705678462982178, 0.2705678641796112, 1,
  1, -1, 0.3605678677558899, 0.5705678462982178, 0.2705678641796112, 1,
  1, 0, 0.3605678677558899, 0.5705678462982178, 0.2705678641796112, 1,
  0, -1, 0.3605678677558899, 0.5705678462982178, 0.2705678641796112, 1,
  1, 0, 0.3605678677558899, 0.5705678462982178, 0.2705678641796112, 1,
  0, 0, 0.3605678677558899, 0.5705678462982178, 0.2705678641796112, 1,
  0.30000001192092896, -0.699999988079071, 0.9800000190734863, 0.8299999833106995, 0.30000001192092896, 1,
  0.699999988079071, -0.699999988079071, 0.9800000190734863, 0.8299999833106995, 0.30000001192092896, 1,
  0.699999988079071, -0.30000001192092896, 0.9800000190734863, 0.8299999833106995, 0.30000001192092896, 1,
  0.30000001192092896, -0.699999988079071, 0.9800000190734863, 0.8299999833106995, 0.30000001192092896, 1,
  0.699999988079071, -0.30000001192092896, 0.9800000190734863, 0.8299999833106995, 0.30000001192092896, 1,
  0.30000001192092896, -0.30000001192092896, 0.9800000190734863, 0.8299999833106995, 0.30000001192092896, 1,
  1, -1, 0.3264312446117401, 0.5364312529563904, 0.23643124103546143, 1,
  2, -1, 0.3264312446117401, 0.5364312529563904, 0.23643124103546143, 1,
  2, 0, 0.3264312446117401, 0.5364312529563904, 0.23643124103546143, 1,
  1, -1, 0.3264312446117401, 0.5364312529563904, 0.23643124103546143, 1,
  2, 0, 0.3264312446117401, 0.5364312529563904, 0.23643124103546143, 1,
  1, 0, 0.3264312446117401, 0.5364312529563904, 0.23643124103546143, 1,
  -1, 0, 0.3300960659980774, 0.5400960445404053, 0.2400960624217987, 1,
  0, 0, 0.3300960659980774, 0.5400960445404053, 0.2400960624217987, 1,
  0, 1, 0.3300960659980774, 0.5400960445404053, 0.2400960624217987, 1,
  -1, 0, 0.3300960659980774, 0.5400960445404053, 0.2400960624217987, 1,
  0, 1, 0.3300960659980774, 0.5400960445404053, 0.2400960624217987, 1,
  -1, 1, 0.3300960659980774, 0.5400960445404053, 0.2400960624217987, 1,
  0, 0, 0.3388267755508423, 0.5488267540931702, 0.2488267719745636, 1,
  1, 0, 0.3388267755508423, 0.5488267540931702, 0.2488267719745636, 1,
  1, 1, 0.3388267755508423, 0.5488267540931702, 0.2488267719745636, 1,
  0, 0, 0.3388267755508423, 0.5488267540931702, 0.2488267719745636, 1,
  1, 1, 0.3388267755508423, 0.5488267540931702, 0.2488267719745636, 1,
  0, 1, 0.3388267755508423, 0.5488267540931702, 0.2488267719745636, 1,
  1, 0, 0.34105396270751953, 0.5510539412498474, 0.25105395913124084, 1,
  2, 0, 0.34105396270751953, 0.5510539412498474, 0.25105395913124084, 1,
  2, 1, 0.34105396270751953, 0.5510539412498474, 0.25105395913124084, 1,
  1, 0, 0.34105396270751953, 0.5510539412498474, 0.25105395913124084, 1,
  2, 1, 0.34105396270751953, 0.5510539412498474, 0.25105395913124084, 1,
  1, 1, 0.34105396270751953, 0.5510539412498474, 0.25105395913124084, 1,
  -1, 1, 0.3284331262111664, 0.5384331345558167, 0.2384331077337265, 1,
  0, 1, 0.3284331262111664, 0.5384331345558167, 0.2384331077337265, 1,
  0, 2, 0.3284331262111664, 0.5384331345558167, 0.2384331077337265, 1,
  -1, 1, 0.3284331262111664, 0.5384331345558167, 0.2384331077337265, 1,
  0, 2, 0.3284331262111664, 0.5384331345558167, 0.2384331077337265, 1,
  -1, 2, 0.3284331262111664, 0.5384331345558167, 0.2384331077337265, 1,
  0, 1, 0.3538551330566406, 0.5638551712036133, 0.2638551592826843, 1,
  1, 1, 0.3538551330566406, 0.5638551712036133, 0.2638551592826843, 1,
  1, 2, 0.3538551330566406, 0.5638551712036133, 0.2638551592826843, 1,
  0, 1, 0.3538551330566406, 0.5638551712036133, 0.2638551592826843, 1,
  1, 2, 0.3538551330566406, 0.5638551712036133, 0.2638551592826843, 1,
  0, 2, 0.3538551330566406, 0.5638551712036133, 0.2638551592826843, 1,
  1, 1, 0.3458840250968933, 0.5558840036392212, 0.2558840215206146, 1,
  2, 1, 0.3458840250968933, 0.5558840036392212, 0.2558840215206146, 1,
  2, 2, 0.3458840250968933, 0.5558840036392212, 0.2558840215206146, 1,
  1, 1, 0.3458840250968933, 0.5558840036392212, 0.2558840215206146, 1,
  2, 2, 0.3458840250968933, 0.5558840036392212, 0.2558840215206146, 1,
  1, 2, 0.3458840250968933, 0.5558840036392212, 0.2558840215206146, 1,
];

const GOLD_STEADY_MARKER = [
  0.30000001192092896, -0.699999988079071, 0.9800000190734863, 0.8299999833106995, 0.30000001192092896, 1,
  0.699999988079071, -0.699999988079071, 0.9800000190734863, 0.8299999833106995, 0.30000001192092896, 1,
  0.699999988079071, -0.30000001192092896, 0.9800000190734863, 0.8299999833106995, 0.30000001192092896, 1,
  0.30000001192092896, -0.699999988079071, 0.9800000190734863, 0.8299999833106995, 0.30000001192092896, 1,
  0.699999988079071, -0.30000001192092896, 0.9800000190734863, 0.8299999833106995, 0.30000001192092896, 1,
  0.30000001192092896, -0.30000001192092896, 0.9800000190734863, 0.8299999833106995, 0.30000001192092896, 1,
];

function makeGl(glCalls) {
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
  gl.getShaderParameter = () => true;
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
  gl.vertexAttribPointer = noop;
  gl.viewport = noop;
  gl.clearColor = noop;
  gl.clear = noop;
  gl.uniformMatrix4fv = noop;
  gl.bufferData = (target, data, usage) => {
    glCalls.push({ fn: 'bufferData', data, buffer: data.buffer, target,
      usage });
  };
  gl.bufferSubData = (target, offset, data) => {
    glCalls.push({ fn: 'bufferSubData', target, offset, data });
  };
  gl.drawArrays = (mode, first, count) => {
    glCalls.push({ fn: 'drawArrays', count });
  };
  return gl;
}

function makeContext2d(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

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
    setAttribute(k, v) {
      if (String(k).startsWith('data-')) {
        target.dataset[String(k).slice(5)] = v;
      }
    },
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
      return () => undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function makeStorage() {
  const store = {};
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k)
      ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
}

function bootSandbox(opts = {}) {
  const { reject = null, viewW = VIEW_W, viewH = VIEW_H,
    counted = false } = opts;
  const winListeners = {};
  const raf = [];
  const errors = [];
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
  const glCalls = [];
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl(glCalls) : makeContext2d(gameCanvas));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? makeContext2d(spriteCanvas) : null);
  const storage = makeStorage();
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
    innerWidth: viewW,
    innerHeight: viewH,
    location: { search: '' },
    localStorage: storage,
    confirm: () => false,
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
          const failed = v === 'assets/map.png'
            || (reject != null && reject(v));
          if (failed) {
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
  if (counted) {
    // Счётчик аллокаций ВНУТРИ realm песочницы, ДО цепочки (T6): каждый
    // конструктор Counted (все new Float32Array продакшн-кода) инкрементирует
    // __f32Allocs. Symbol.species → нативный Float32Array ОБЯЗАТЕЛЕН:
    // иначе TypedArraySpeciesCreate в subarray порождает Counted (V8-проба
    // n=2) и вью-объекты засчитываются аллокациями — «0 аллокаций» стал бы
    // недостижим даже при идеальном реюзе.
    vm.runInContext(`(() => {
      const NativeF32 = Float32Array;
      globalThis.__f32Allocs = 0;
      class CountedF32 extends NativeF32 {
        constructor(...a) { super(...a); globalThis.__f32Allocs += 1; }
      }
      Object.defineProperty(CountedF32, Symbol.species,
        { get: () => NativeF32 });
      globalThis.Float32Array = CountedF32;
    })();`, sandbox, { filename: 'counted-f32.js' });
  }
  for (const f of CHAIN) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox,
      { filename: f });
  }
  return {
    sandbox, winListeners, raf, errors, storage,
    gameCanvas, spriteCanvas, hud, glCalls,
    body: document.body,
  };
}

const drain = () => new Promise((r) => setImmediate(r));

async function boot(opts = {}) {
  const h = bootSandbox(opts);
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

function frameAt(h, now) {
  h.glCalls.length = 0;
  const n0 = h.spriteCanvas.drawCalls.length;
  const r0 = h.raf.length;
  h.frameFn(now);
  return {
    draw: h.spriteCanvas.drawCalls.slice(n0),
    raf: h.raf.length - r0,
  };
}

function bufferDataCalls(glCalls) {
  return glCalls.filter((c) => c.fn === 'bufferData');
}

function bufferDataOf(glCalls) {
  return bufferDataCalls(glCalls).map((c) => c.data);
}

function bufferSubDataCalls(glCalls) {
  return glCalls.filter((c) => c.fn === 'bufferSubData');
}

function drawArraysCalls(glCalls) {
  return glCalls.filter((c) => c.fn === 'drawArrays');
}

// Снапшот НАГРУЗКИ текущего кадра нормализованным host-массивом (Array.from
// читает sandbox-typed-array ПО ЭЛЕМЕНТНО — values примитивны, кросс-realm
// безопасен; прототипи deepStrictEqual с sandbox-массивом не использовать).
function bufNorm(glCalls) {
  return Array.from(bufferDataOf(glCalls)[0], (v) => (v === 0 ? 0 : v));
}

function countColor(glCalls, rgb) {
  let n = 0;
  for (const d of bufferDataOf(glCalls)) {
    for (let i = 0; i + 5 < d.length; i += 6) {
      if (Math.abs(d[i + 2] - rgb[0]) < EPS
          && Math.abs(d[i + 3] - rgb[1]) < EPS
          && Math.abs(d[i + 4] - rgb[2]) < EPS) n += 1;
    }
  }
  return n;
}

function wheelN(h, n, dir = 1) {
  const wheel = (h.gameCanvas.listeners['wheel'] || [])[0];
  assert.ok(typeof wheel === 'function', 'сценарий: wheel-обработчик');
  for (let i = 0; i < n; i++) {
    wheel({ deltaY: 100 * dir, preventDefault() {} });
  }
}

function allocs(h) {
  return h.sandbox.__f32Allocs;
}

// =====================================================================
// T1 — GOLD бит-в-бит (инвариант; золотые литералы сняты на HEAD).
// =====================================================================

test('T1: GOLD бит-в-бит — серии pump’ов (rebuild → hit → spawnBuildingTile → hit-с-маркером → тёплые) в partial- и steady-boot дают пословно золотые буферы HEAD (16×16, диапазон 3×3); miss ≡ hit; повторный boot ≡ boot (000343)', async () => {
  const h = await boot({ reject: TILES_BROKEN, viewW: SMALL_W,
    viewH: SMALL_H });
  const st = h.sandbox.__game.state;
  assert.equal(st.cam.x, 0.5, 'сценарий: камера на спавне (0.5)');
  const g = h.sandbox.__game;
  frameAt(h, NOW + 200);
  assert.ok(bufferDataOf(h.glCalls)[0].length > 0,
    'сценарий: partial-rebuild — непустой буфер (legacy-квады)');
  assert.deepStrictEqual(bufNorm(h.glCalls), GOLD_PARTIAL_L0,
    'partial rebuild-кадр: буфер пословно == золотой L0 HEAD');
  frameAt(h, NOW + 400);
  assert.deepStrictEqual(bufNorm(h.glCalls), GOLD_PARTIAL_L0,
    'partial hit-кадр ≡ rebuild (miss ≡ hit, бит-в-бит)');
  g.actions.spawnBuildingTile(0, -1); // в диапазоне [-1..1]²
  frameAt(h, NOW + 600);
  assert.equal(countColor(h.glCalls, BUILDING_COLOR), 6,
    'сценарий: кадр после spawnBuildingTile содержит маркер (6 вершин)');
  assert.deepStrictEqual(bufNorm(h.glCalls), GOLD_PARTIAL_L1,
    'partial rebuild-с-маркером: буфер пословно == золотой L1 HEAD');
  frameAt(h, NOW + 800);
  assert.deepStrictEqual(bufNorm(h.glCalls), GOLD_PARTIAL_L1,
    'partial hit-с-маркером ≡ rebuild-с-маркером');
  frameAt(h, NOW + 1000);
  assert.deepStrictEqual(bufNorm(h.glCalls), GOLD_PARTIAL_L1,
    'partial тёплый кадр — тот же буфер');

  const hs = await boot({ viewW: SMALL_W, viewH: SMALL_H });
  const gs = hs.sandbox.__game;
  frameAt(hs, NOW + 200);
  assert.deepStrictEqual(bufNorm(hs.glCalls), [],
    'steady rebuild: 0 вершин (RM-3/RM-10-режим)');
  frameAt(hs, NOW + 400);
  assert.deepStrictEqual(bufNorm(hs.glCalls), [],
    'steady hit: 0 вершин');
  gs.actions.spawnBuildingTile(0, -1);
  frameAt(hs, NOW + 600);
  assert.deepStrictEqual(bufNorm(hs.glCalls), GOLD_STEADY_MARKER,
    'steady rebuild-с-маркером: пословно == золотой маркер HEAD (FT-6-тип:'
    + ' спрайт ненастоящей постройки нерезолвим → маркер выживает)');
  frameAt(hs, NOW + 800);
  assert.deepStrictEqual(bufNorm(hs.glCalls), GOLD_STEADY_MARKER,
    'steady hit-с-маркером ≡ rebuild-с-маркером');

  const hr = await boot({ reject: TILES_BROKEN, viewW: SMALL_W,
    viewH: SMALL_H });
  frameAt(hr, NOW + 200);
  assert.deepStrictEqual(bufNorm(hr.glCalls), GOLD_PARTIAL_L0,
    'повторный partial boot: первый кадр идентичен (детерминизм фикстуры)');
  const hsr = await boot({ viewW: SMALL_W, viewH: SMALL_H });
  frameAt(hsr, NOW + 200);
  assert.deepStrictEqual(bufNorm(hsr.glCalls), [],
    'повторный steady boot: первый кадр идентичен');
});

// =====================================================================
// T2 — ПЕРЕИСПОЛЬЗОВАНИЕ БУФЕРА (КРАСНЫЙ на HEAD).
// =====================================================================

test('T2: переиспользование склада — ≥3 тёплых кадра подряд загружают payload из ОДНОГО ArrayBuffer (Set размеров == 1); серия с НЕвозрастающим числом вершин (wheel-in) — склад тот же; на HEAD каждый new Float32Array — свой ArrayBuffer (V8 zero-length НЕ шарит) (000343)', async () => {
  const hs = await boot({ viewW: VIEW_W, viewH: VIEW_H });
  const buffers = new Set();
  for (let i = 1; i <= 4; i++) {
    frameAt(hs, NOW + 200 * i);
    const bds = bufferDataCalls(hs.glCalls);
    assert.equal(bds.length, 1, 'steady кадр ' + i + ': 1 bufferData');
    buffers.add(bds[0].buffer);
  }
  assert.equal(buffers.size, 1,
    'steady: все payload’ы — ВЬЮ ОДНОГО склада (на HEAD — 4 разных'
    + ' ArrayBuffer’а, «новая аллокация каждый кадр»)');

  const h = await boot({ reject: TILES_BROKEN });
  const seen = [];
  for (let i = 1; i <= 3; i++) {
    frameAt(h, NOW + 200 * i);
    const bds = bufferDataCalls(h.glCalls);
    assert.equal(bds.length, 1, 'partial кадр ' + i + ': 1 bufferData');
    seen.push({ buf: bds[0].buffer, len: bds[0].data.length });
  }
  assert.equal(new Set(seen.map((s) => s.buf)).size, 1,
    'partial: тёплые кадры (одинаковое число вершин) — тот же склад');
  wheelN(h, 6, -1); // deltaY<0 → zoom-in: вершин МЕНЬШЕ, capacity не растёт
  for (let i = 4; i <= 5; i++) {
    frameAt(h, NOW + 200 * i);
    const bds = bufferDataCalls(h.glCalls);
    assert.equal(bds.length, 1, 'partial кадр ' + i + ': 1 bufferData');
    seen.push({ buf: bds[0].buffer, len: bds[0].data.length });
  }
  const uniq = new Set(seen.map((s) => s.buf));
  assert.equal(uniq.size, 1,
    'серия с НЕвозрастающим числом вершин: Set ArrayBuffer’ов остаётся'
    + ' размера 1 (рост capacity не триггерился)');
  assert.ok(seen[4].len < seen[0].len,
    'сценарий: после wheel-in вершин стало меньше (' + seen[4].len
    + ' < ' + seen[0].len + ') — при этом склад не пересобран');
});

// =====================================================================
// T3 — RM-10-ПАРИТЕТ (инвариант).
// =====================================================================

test('T3: RM-10-паритет — steady-кадр: bufferData РОВНО 1 с length 0, target ARRAY_BUFFER, usage DYNAMIC_DRAW; drawArrays РОВНО 1 с count 0 (000343)', async () => {
  const h = await boot();
  for (let i = 1; i <= 3; i++) {
    frameAt(h, NOW + 200 * i);
    const bds = bufferDataCalls(h.glCalls);
    assert.equal(bds.length, 1,
      'steady кадр ' + i + ': ровно 1 bufferData (проход выполнен)');
    assert.equal(bds[0].data.length, 0, 'steady: пустая нагрузка');
    assert.equal(bds[0].target, ARRAY_BUFFER, 'target === gl.ARRAY_BUFFER');
    assert.equal(bds[0].usage, DYNAMIC_DRAW, 'usage === gl.DYNAMIC_DRAW');
    const da = drawArraysCalls(h.glCalls);
    assert.equal(da.length, 1, 'ровно 1 drawArrays на кадр');
    assert.equal(da[0].count, 0, 'steady: drawArrays count === 0');
  }
});

// =====================================================================
// T4 — СВЕЖЕСТЬ VIEW (инвариант; зеркало 000339 T4; ловит M3).
// =====================================================================

test('T4: свежесть view — соседние payload-ссылки покодрово РАЗНЫЕ при length 0 (steady) и при непустых кадрах (partial); запрещено отдавать склад/кэш-константу (режет 000339 T4) (000343)', async () => {
  const hs = await boot();
  let prev = null;
  for (let i = 1; i <= 4; i++) {
    frameAt(hs, NOW + 200 * i);
    const cur = bufferDataOf(hs.glCalls)[0];
    assert.equal(cur.length, 0, 'steady: payload пуст');
    if (prev !== null) {
      assert.notEqual(cur, prev,
        'steady кадр ' + i + ': каждый кадр — НОВЫЙ view (subarray свежий),'
        + ' не тот же объект');
    }
    prev = cur;
  }
  const h = await boot({ reject: TILES_BROKEN });
  prev = null;
  for (let i = 1; i <= 3; i++) {
    frameAt(h, NOW + 200 * i);
    const cur = bufferDataOf(h.glCalls)[0];
    assert.ok(cur.length > 0, 'partial: payload непуст');
    if (prev !== null) {
      assert.notEqual(cur, prev,
        'partial кадр ' + i + ': непустой payload — свежий view каждый кадр');
    }
    prev = cur;
  }
});

// =====================================================================
// T5 — ТОЧНАЯ ДЛИНА (инвариант; запрещает загрузку capacity; ловит M3).
// =====================================================================

test('T5: точная длина — каждый кадр data.length === 6 × drawArrays count; после wheel-in payload СТРОГО короче прежнего (загрузка полного capacity запрещена; мутация M3 красит и этот пин, и 000339 T4) (000343)', async () => {
  const check = (h, i, label) => {
    const bds = bufferDataCalls(h.glCalls);
    const da = drawArraysCalls(h.glCalls);
    assert.equal(bds.length, 1, label + ' ' + i + ': 1 bufferData');
    assert.equal(da.length, 1, label + ' ' + i + ': 1 drawArrays');
    assert.equal(bds[0].data.length, da[0].count * 6,
      label + ' ' + i + ': data.length === 6 × count (ровно вершины кадра,'
      + ' без хвоста capacity)');
    return bds[0].data.length;
  };
  const hs = await boot();
  for (let i = 1; i <= 2; i++) {
    frameAt(hs, NOW + 200 * i);
    assert.equal(check(hs, i, 'steady'), 0, 'steady: длина 0');
  }
  const h = await boot({ reject: TILES_BROKEN });
  let len = 0;
  for (let i = 1; i <= 3; i++) {
    frameAt(h, NOW + 200 * i);
    len = check(h, i, 'partial');
    assert.ok(len > 0, 'partial: ненулевая нагрузка');
  }
  wheelN(h, 6, -1); // zoom-in: вершин меньше
  frameAt(h, NOW + 800);
  const lenSmall = check(h, 4, 'partial после wheel-in');
  assert.ok(lenSmall < len,
    'payload укоротился вместе с числом вершин (' + lenSmall + ' < ' + len
    + ') — при загрузке всего capacity длина бы НЕ менялась');
});

// =====================================================================
// T6 — СЧЁТЧИК АЛЛОКАЦИЙ Float32Array (КРАСНЫЙ на HEAD).
// =====================================================================

test('T6: счётчик аллокаций (Counted+species ВНУТРИ vm, мера — дельты вокруг actions.buildFrameOnce): тёплые steady и partial-вызовы — РОВНО 0 аллокаций (HEAD: 1/вызов); рост после wheel-out в ZOOM_MIN — ровно 1 на первом таком кадре, следующий 0; контроль wiring: полный frameAt-кадр ≥ 1 (orthoMatrix map.js) (000343)', async () => {
  const hs = await boot({ viewW: SMALL_W, viewH: SMALL_H, counted: true });
  const gs = hs.sandbox.__game;
  for (let i = 1; i <= 3; i++) {
    const a0 = allocs(hs);
    gs.actions.buildFrameOnce(NOW + 200 * i);
    assert.equal(allocs(hs) - a0, 0,
      'steady buildFrameOnce ' + i + ': 0 аллокаций Float32Array'
      + ' (склад переиспользован; HEAD: new Float32Array(verts) = 1)');
  }
  wheelN(hs, 22);
  assert.equal(hs.sandbox.__game.state.zoom, 4,
    'сценарий: wheel-out до ZOOM_MIN');
  for (let i = 4; i <= 5; i++) {
    const a0 = allocs(hs);
    gs.actions.buildFrameOnce(NOW + 200 * i);
    assert.equal(allocs(hs) - a0, 0,
      'steady после wheel-out ' + i + ': 0 вершин — роста capacity нет →'
      + ' 0 аллокаций');
  }

  const h = await boot({ reject: TILES_BROKEN, viewW: SMALL_W,
    viewH: SMALL_H, counted: true });
  const g = h.sandbox.__game;
  // РАЗМЕРНЫЙ pump кадром: canvas.width/height задаются только в frame()
  // (до первого кадра canvas 0×0 → диапазон 2×2 не растёт от зума);
  // аллокации этого кадра НЕ замеряем (в них orthoMatrix + первичный рост).
  frameAt(h, NOW + 200);
  const warm = g.actions.buildFrameOnce(NOW + 400);
  assert.ok(warm.verts > 0, 'сценарий: partial-кадр непустой (вершины '
    + warm.verts + ')');
  const warmVerts = warm.verts;
  for (let i = 3; i <= 4; i++) {
    const a0 = allocs(h);
    g.actions.buildFrameOnce(NOW + 200 * i);
    assert.equal(allocs(h) - a0, 0,
      'partial тёплый buildFrameOnce ' + i + ': 0 аллокаций (HEAD: 1/вызов;'
      + ' без species-pin subarray тоже считался бы — пин обязателен)');
  }
  wheelN(h, 22);
  const aG = allocs(h);
  const rG = g.actions.buildFrameOnce(NOW + 800);
  assert.ok(rG.verts > warmVerts,
    'сценарий: wheel-out поднял вершины выше исторического максимума ('
    + rG.verts + ' > ' + warmVerts + ')');
  assert.equal(allocs(h) - aG, 1,
    'первый кадр после роста — РОВНО 1 аллокация склада');
  const a2 = allocs(h);
  g.actions.buildFrameOnce(NOW + 1000);
  assert.equal(allocs(h) - a2, 0,
    'следующий кадр на выросшем складе — снова 0 аллокаций');

  const aW = allocs(h);
  frameAt(h, NOW + 1200);
  assert.ok(allocs(h) - aW >= 1,
    'контроль wiring счётчика: полный frameAt-кадр аллоцирует ≥ 1'
    + ' (G.orthoMatrix map.js) — счётчик видит конструкторы продакшн-кода');
});

// =====================================================================
// T7 — НОЛЬ bufferSubData (инвариант; фиксирует обязательный путь).
// =====================================================================

test('T7: ноль bufferSubData — за warm-серию (rebuild → hit → hit, одинаковая capacity) в glCalls нет НИ ОДНОЙ записи fn===bufferSubData; путь «bufferSubData при неизменной capacity» заперт пином RM-10 (000343)', async () => {
  const h = await boot({ reject: TILES_BROKEN, viewW: SMALL_W,
    viewH: SMALL_H });
  for (let i = 1; i <= 3; i++) {
    frameAt(h, NOW + 200 * i);
    assert.equal(bufferDataCalls(h.glCalls).length, 1,
      'кадр ' + i + ': bufferData ровно 1');
    assert.equal(bufferSubDataCalls(h.glCalls).length, 0,
      'кадр ' + i + ': bufferSubData нет (запрещённая ветка ТЗ 000343)');
  }
  const hs = await boot();
  for (let i = 1; i <= 2; i++) {
    frameAt(hs, NOW + 200 * i);
    assert.equal(bufferSubDataCalls(hs.glCalls).length, 0,
      'steady кадр ' + i + ': и при 0 вершин — bufferData, не bufferSubData');
  }
});

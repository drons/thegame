// Задача 000294 (BUG тайлы пещер: вертикальный шов пола, стены
// неотличимы от пола, пересоздать SVG) — RED-тесты, стадия КРАСНЫХ
// ТЕСТОВ (TDD). kind: node.
//
// Контракты: memory/000294-cave-tiles.md — §1 корень, §2 scope (63 SVG),
// §3 конвенция бесшовности, §4 палитра/порог контраста, §5 тесты
// CT-1..CT-5; ТЗ tasks/pending/000294.md «Красные»; план
// /tmp/thegame-wf-000294/a3-tests.md §3.
//
// Корневая причина красноты (сверено с ТЕКУЩИМ контентом — осмысленные
// падения на цветах/геометрии, не синтаксис и не отсутствие модуля):
//  CT-1: база пола cave = вертикальный 2-стопный градиент #6e655a→#4b443b
//        — цвет в середине верхнего края ≠ цвет в середине нижнего
//        (видимый шов на КАЖДОМ вертикальном стыке тайлов; по горизонтали
//        градиент однороден по x — шва нет, что совпадает с баг-репортом).
//  CT-2: cave_2.svg — радиальное пятно ellipse cx=15.1 rx=15.7, bbox
//        x=−0.6: пересекает левый край тайла (микрошов на горизонтальном
//        стыке; контракт 000069 «детали — во внутренности тайла»).
//  CT-3: диапазоны яркостей баз стен и пола пересеклись — минимальный
//        WCAG-contrast по всем парам стопов всех 5 типов каталога = 1.024
//        (пара #7a7164×#7a6f60, руины; у пещеры — 1.036, #4e463d×#4b443b);
//        у нижних стопов стена ТЕМНЕЕ пола (направление «стена светлее»
//        ломается); базы 3 dungeon-видов стен НЕ идентичны
//        (rock/stalactite #7d7468|#4e463d, column #7a7164|#4c453b).
//  CT-4: базы ВСЕХ 60 wall-плиток — вертикальный градиент с неравными
//        стопами (top ≠ bottom): тот же механизм шва в вертикальных
//        рядах стен (заголовок бага «вертикальный стык пола/стен»).
// CT-4b/CT-5 — ГАУАРДЫ (зелёные ДО и ПОСЛЕ фикса):
//  CT-4b: центральные детали стен (элементы, не касающиеся края) в зоне
//        [10.5, 53.5]² (худший extent текущего арта — 10.9, stalactite_m04).
//  CT-5: 63 пересоздаваемых файла на диске byte-идентичны выходу
//        генераторов (контракт 000069/000258 «регенерация — source of
//        truth»; защита от рассинхрона «правка только файлов/генератора»).
//
// Self-contained: fs/path + require двух генераторов (паттерн
// tests/sprites.test.js:1835); новых require src/, новых <script>,
// новых SVG-файлов НЕТ (пересоздание in-place). vm-песочницы SVG НЕ
// растеризируют (Image-стабы) → стык текстуры проверяется структурно:
// цвет базового градиента в серединах рёбер + bbox элементов (fallback
// ТЗ «тест по геометрии/краям SVG»; тестовый паттерн репо tile-seam.
// test.js — про сетку рендера, не про текстуру).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const { TILES, buildDungeonFloorTile } = require('../scripts/gen-dungeon-tiles.js');
const { TILES: WALL_TILES, buildTile, NAMES } = require('../scripts/gen-wall-autotiles.js');

// Виды стен подземелий, пересоздаваемые 000294 (объекты_стен каталога —
// ровно эти 3; city — город, вне scope ТЗ).
const WALL_KINDS = ['rock', 'column', 'stalactite'];
// Слог пола по id подземелья — зеркало src/sprites.js (DUNGEON_FLOOR_
// FRAMES / COMBAT_BG_DUNGEON; равенство с каталогом пиныт тестом
// tests/sprites.test.js «DUNGEON_FLOOR_FRAMES ≡ каталог»).
const SLUG_BY_ID = { 0: 'cave', 1: 'crypt', 2: 'ruins', 3: 'drowned', 4: 'abyss' };

// Пороги бесшовности/контраста (memory/000294-cave-tiles.md §3/§4).
const FLOOR_INNER = { min: 0.5, max: 63.5 };   // тело пола ⊆ сюда
const WALL_CENTER = { min: 10.5, max: 53.5 };  // центр стены ⊆ сюда
const EDGE_EPS = 0.01;                          // «касается края тайла»
const CONTRAST_MIN = 1.5;                       // стена vs пол (WCAG)
const COLOR_EPS = 0.5;                          // на канал (0..255)

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const hexOfRgb = (rgb) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const fmtBox = (b) => `x=[${b.minX}..${b.maxX}] y=[${b.minY}..${b.maxY}]`;

// --- Цвет: относительная яркость и контраст (WCAG) ---

function hexToRgb(hex) {
  assert.match(hex, /^#[0-9a-fA-F]{6}$/, `hex-цвет: ${hex}`);
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function lum(rgb) {
  const lin = rgb.map((c) => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrast(la, lb) {
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

// --- Базовый градиент тайла (первый linearGradient = заливка базы) ---

function attrsOf(s) {
  const out = {};
  for (const m of s.matchAll(/([\w:-]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

// ПЕРВЫЙ linearGradient: атрибуты оси + стопы. Строго (паттерн 000120):
// ровно 2 стопа с offset 0/1, ось невырождена, stop-color — hex, единицы
// objectBoundingBox.
function baseGradient(svg, label) {
  const m = svg.match(/<linearGradient\b[^>]*>[\s\S]*?<\/linearGradient>/);
  assert.ok(m, `${label}: нет linearGradient (базовая заливка)`);
  const a = attrsOf(m[0].match(/<linearGradient\b([^>]*)>/)[1]);
  assert.ok(!a.gradientUnits || a.gradientUnits === 'objectBoundingBox',
    `${label}: единицы градиента — objectBoundingBox`);
  const num = (n, d) => {
    if (a[n] === undefined) return d;
    return a[n].endsWith('%') ? parseFloat(a[n]) / 100 : parseFloat(a[n]);
  };
  const g = { x1: num('x1', 0), y1: num('y1', 0), x2: num('x2', 1), y2: num('y2', 0), stops: [] };
  for (const s of m[0].matchAll(/<stop\b([^>]*)\/?>/g)) {
    const sa = attrsOf(s[1]);
    assert.ok(sa['stop-color'], `${label}: стоп без stop-color`);
    const off = sa.offset === undefined ? g.stops.length
      : sa.offset.endsWith('%') ? parseFloat(sa.offset) / 100 : parseFloat(sa.offset);
    g.stops.push({
      t: off,
      rgb: hexToRgb(sa['stop-color']),
      op: sa['stop-opacity'] === undefined ? 1 : parseFloat(sa['stop-opacity']),
    });
  }
  assert.equal(g.stops.length, 2, `${label}: базовый градиент = ровно 2 стопа`);
  assert.ok(Math.abs(g.stops[0].t) < 1e-9 && Math.abs(g.stops[1].t - 1) < 1e-9,
    `${label}: offset стопов = 0 и 1`);
  assert.ok(Math.hypot(g.x2 - g.x1, g.y2 - g.y1) > 1e-9,
    `${label}: ось градиента вырождена`);
  return g;
}

// Середины рёбер тайла (координаты objectBoundingBox: базовый rect =
// весь 64×64 тайл, проверено в assertSeamlessBase).
const EDGE_MID = { top: [0.5, 0], bottom: [0.5, 1], left: [0, 0.5], right: [1, 0.5] };

// Цвет заливки в середине ребра: проекция точки на ось градиента,
// clamp [0,1] (spreadMethod pad), линейная интерполяция стопов (sRGB +
// stop-opacity).
function edgeMidpointColor(g, edge, label) {
  const [px, py] = EDGE_MID[edge];
  const ax = g.x2 - g.x1, ay = g.y2 - g.y1;
  const t = Math.min(1, Math.max(0,
    ((px - g.x1) * ax + (py - g.y1) * ay) / (ax * ax + ay * ay)));
  const [s0, s1] = g.stops;
  const u = (t - s0.t) / (s1.t - s0.t);
  return [
    s0.rgb[0] + (s1.rgb[0] - s0.rgb[0]) * u,
    s0.rgb[1] + (s1.rgb[1] - s0.rgb[1]) * u,
    s0.rgb[2] + (s1.rgb[2] - s0.rgb[2]) * u,
    s0.op + (s1.op - s0.op) * u,
  ];
}

function sameColor(c1, c2, label) {
  assert.ok(c1.every((v, i) => Math.abs(v - c2[i]) < COLOR_EPS),
    `${label}: ${hexOfRgb(c1.slice(0, 3))}(op ${c1[3].toFixed(2)}) ≠ ${hexOfRgb(c2.slice(0, 3))}(op ${c2[3].toFixed(2)})`);
}

// --- Bbox элементов тела (вне defs), stroke/2 учтён ---

// Грамматика path в наших ассетах: «M x y (l dx dy | L x y)+» (трещина
// пола, линия шва стены, диагональный шов угла). Прочее — нарушение
// контракта (assert.fail).
function pathBbox(d, label) {
  const m = d.match(/^M\s*([-\d.]+)\s+([-\d.]+)((?:\s*[lL]\s*[-\d.]+\s+[-\d.]+)+)\s*$/);
  assert.ok(m, `${label}: неподдерживаемая грамматика path: ${d}`);
  const pts = [[parseFloat(m[1]), parseFloat(m[2])]];
  let x = pts[0][0], y = pts[0][1];
  for (const s of m[3].matchAll(/\s*([lL])\s*([-\d.]+)\s+([-\d.]+)/g)) {
    if (s[1] === 'l') { x += parseFloat(s[2]); y += parseFloat(s[3]); }
    else { x = parseFloat(s[2]); y = parseFloat(s[3]); }
    pts.push([x, y]);
  }
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

// Bbox всех элементов тела (rect/circle/ellipse/polygon/path вне defs).
// Строго: все элементы — self-closing (иначе assert.fail).
function elementBoxes(svg, label) {
  const body = svg.replace(/<defs\b[\s\S]*?<\/defs>/, '');
  const total = (body.match(/<(?:rect|circle|ellipse|polygon|path)\b/g) || []).length;
  const boxes = [];
  for (const m of body.matchAll(/<(rect|circle|ellipse|polygon|path)\b([^>]*)\/>/g)) {
    const a = attrsOf(m[2]);
    const sw = (a.stroke !== undefined && a.stroke !== 'none')
      ? (a['stroke-width'] === undefined ? 0.5 : parseFloat(a['stroke-width']) / 2)
      : 0;
    let b;
    if (m[1] === 'rect') {
      const x = a.x === undefined ? 0 : parseFloat(a.x);
      const y = a.y === undefined ? 0 : parseFloat(a.y);
      b = { minX: x - sw, minY: y - sw,
            maxX: x + parseFloat(a.width) + sw, maxY: y + parseFloat(a.height) + sw };
    } else if (m[1] === 'circle') {
      b = { minX: parseFloat(a.cx) - parseFloat(a.r) - sw, minY: parseFloat(a.cy) - parseFloat(a.r) - sw,
            maxX: parseFloat(a.cx) + parseFloat(a.r) + sw, maxY: parseFloat(a.cy) + parseFloat(a.r) + sw };
    } else if (m[1] === 'ellipse') {
      b = { minX: parseFloat(a.cx) - parseFloat(a.rx) - sw, minY: parseFloat(a.cy) - parseFloat(a.ry) - sw,
            maxX: parseFloat(a.cx) + parseFloat(a.rx) + sw, maxY: parseFloat(a.cy) + parseFloat(a.ry) + sw };
    } else if (m[1] === 'polygon') {
      const pts = a.points.trim().split(/\s+/).map((p) => p.split(',').map(parseFloat));
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      b = { minX: Math.min(...xs) - sw, minY: Math.min(...ys) - sw,
            maxX: Math.max(...xs) + sw, maxY: Math.max(...ys) + sw };
    } else {
      b = pathBbox(a.d, label);
      b = { minX: b.minX - sw, minY: b.minY - sw, maxX: b.maxX + sw, maxY: b.maxY + sw };
    }
    boxes.push({ tag: m[1], fill: a.fill || '', b });
  }
  assert.equal(boxes.length, total,
    `${label}: не все элементы распознаны (self-closing обязательно)`);
  return boxes;
}

const isBaseRect = (x) => x.tag === 'rect' && x.b.minX === 0
  && x.b.maxX === 64 && x.b.minY === 0 && x.b.maxY === 64;
const touchesEdge = (b) =>
  b.minX <= EDGE_EPS || b.maxX >= 64 - EDGE_EPS
  || b.minY <= EDGE_EPS || b.maxY >= 64 - EDGE_EPS;
const inRect = (b, r) =>
  b.minX >= r.min && b.maxX <= r.max && b.minY >= r.min && b.maxY <= r.max;

// Бесшовная база: ровно один базовый rect на весь тайл. Градиентная
// база (стены): цвета в серединах рёбер верх == низ и лево == право.
// Плоская база (полы, 000323): fill = один 6-значный hex (все кромки
// идентичны тождественно).
function assertSeamlessBase(svg, label) {
  const bases = elementBoxes(svg, label).filter(isBaseRect);
  assert.equal(bases.length, 1, `${label}: ровно 1 базовый rect`);
  const bb = bases[0].b;
  assert.ok(bb.minX <= 0 && bb.maxX >= 64 && bb.minY <= 0 && bb.maxY >= 64,
    `${label}: базовый rect = весь тайл (${fmtBox(bb)})`);
  if (!svg.includes('<linearGradient')) {
    assert.match(bases[0].fill, /^#[0-9a-fA-F]{6}$/,
      `${label}: плоская база — fill базового rect = 6-значный hex`);
    return;
  }
  const g = baseGradient(svg, label);
  const top = edgeMidpointColor(g, 'top', label);
  const bottom = edgeMidpointColor(g, 'bottom', label);
  const left = edgeMidpointColor(g, 'left', label);
  const right = edgeMidpointColor(g, 'right', label);
  sameColor(top, bottom,
    `${label}: ВЕРТИКАЛЬНЫЙ шов — цвет у верхней кромки ≠ у нижней`);
  sameColor(left, right,
    `${label}: ГОРИЗОНТАЛЬНЫЙ шов — цвет у левой кромки ≠ у правой`);
}

// Стопы базовой заливки пола: градиент (до 000323) — стопы
// linearGradient; плоская (000323) — единственный стоп = fill базы.
function floorBaseStops(svg, label) {
  if (svg.includes('<linearGradient')) return baseGradient(svg, label).stops;
  const base = elementBoxes(svg, label).filter(isBaseRect)[0];
  assert.ok(base, `${label}: базовый rect`);
  return [{ t: 0, rgb: hexToRgb(base.fill), op: 1 }];
}

// --- CT-1: пол пещеры — бесшовная база в оба направления ---

test('CT-1: пол пещеры (cave_1..8): базовая заливка бесшовна вертикально (верх == низ) и горизонтально (лево == право) — диск + генератор', () => {
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const t = TILES.find((x) => x.key === `cave_${n}`);
    assert.ok(t, `в генераторе есть тайл cave_${n}`);
    assertSeamlessBase(read(`assets/dungeon/floor/cave_${n}.svg`), `cave_${n} (диск)`);
    assertSeamlessBase(buildDungeonFloorTile(t), `cave_${n} (генератор)`);
  }
});

// --- CT-2: пол пещеры — элементы тела не пересекают край тайла ---

test('CT-2: пол пещеры (cave_1..8): ни один текстурный элемент не выходит за внутреннюю зону [0.5, 63.5]² (bbox строго внутри) — диск + генератор', () => {
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const t = TILES.find((x) => x.key === `cave_${n}`);
    assert.ok(t, `в генераторе есть тайл cave_${n}`);
    const sources = [
      [`cave_${n} (диск)`, read(`assets/dungeon/floor/cave_${n}.svg`)],
      [`cave_${n} (генератор)`, buildDungeonFloorTile(t)],
    ];
    for (const [label, svg] of sources) {
      const body = elementBoxes(svg, label).filter((x) => !isBaseRect(x));
      assert.ok(body.length > 0, `${label}: текстурные элементы присутствуют`);
      for (const x of body) {
        assert.ok(inRect(x.b, FLOOR_INNER),
          `${label}: элемент ${x.tag} пересекает край тайла / выходит за [0.5, 63.5]²: ${fmtBox(x.b)}`);
      }
    }
  }
});

// --- CT-3: стены заметнее пола — во всех 5 типах каталога ---

test('CT-3: стены каждого подземелья из каталога: базовый тон заметно отличается от пола того же типа (WCAG contrast ≥ 1.5 И стена светлее пола) по ВСЕМ парам стопов; базы rock/column/stalactite идентичны', () => {
  const dir = path.join(ROOT, 'assets', 'dungeons');
  const cats = fs.readdirSync(dir)
    .filter((f) => f !== 'schema.json'
      && require('../scripts/lib/json-ref.js')
        .SHAPE_BASENAME_RES[require('../scripts/lib/json-ref.js')
          .ASSET_NAME_SHAPES.dungeons].test(f))
    .map((f) => JSON.parse(read('assets/dungeons/' + f)))
    .sort((a, b) => a.id - b.id);
  assert.equal(cats.length, 5, 'каталог подземелий = 5 типов');
  for (const c of cats) {
    const slug = SLUG_BY_ID[c.id];
    assert.ok(slug, `тип ${c.id}: слог пола известен`);
    const floorStops = floorBaseStops(
      read(`assets/dungeon/floor/${slug}_1.svg`), `пол ${slug}_1`);
    for (const K of c['объекты_стен']) {
      assert.ok(WALL_KINDS.includes(K),
        `${slug}: объект_стен ${K} ∈ {${WALL_KINDS.join(', ')}}`);
      const wallStops = baseGradient(
        read(`assets/dungeon/walls/${K}_m00.svg`), `стена ${K}_m00`).stops;
      for (const w of wallStops) {
        for (const fl of floorStops) {
          assert.ok(lum(w.rgb) > lum(fl.rgb),
            `тип ${c.id} (${c['название']}) × стена ${K}: стена НЕ светлее пола — `
            + `L(${hexOfRgb(w.rgb)}) = ${lum(w.rgb).toFixed(4)} ≤ L(${hexOfRgb(fl.rgb)}) = ${lum(fl.rgb).toFixed(4)}`);
          assert.ok(contrast(lum(w.rgb), lum(fl.rgb)) >= CONTRAST_MIN,
            `тип ${c.id} (${c['название']}) × стена ${K}: contrast(${hexOfRgb(w.rgb)}, ${hexOfRgb(fl.rgb)}) = ${contrast(lum(w.rgb), lum(fl.rgb)).toFixed(3)} < ${CONTRAST_MIN} — стены неотличимы от пола`);
        }
      }
    }
  }
  const baseOf = (K) => baseGradient(
    read(`assets/dungeon/walls/${K}_m00.svg`), `стена ${K}_m00`).stops
    .map((s) => hexOfRgb(s.rgb)).join('|');
  assert.equal(baseOf('column'), baseOf('rock'),
    `базы wall-видов различаются (межвидовая ступенька): column ${baseOf('column')} ≠ rock ${baseOf('rock')}`);
  assert.equal(baseOf('stalactite'), baseOf('rock'),
    `базы wall-видов различаются (межвидовая ступенька): stalactite ${baseOf('stalactite')} ≠ rock ${baseOf('rock')}`);
});

// --- CT-4: все 60 wall-плиток — плоская база ---

test('CT-4: стены (rock/column/stalactite × 20 = 60 плиток): базовая заливка плоская — верх == низ и лево == право — диск + генератор', () => {
  let checked = 0;
  for (const style of WALL_KINDS) {
    for (const name of NAMES) {
      const t = WALL_TILES.find((x) => x.style === style && x.name === name);
      assert.ok(t, `в генераторе есть плитка ${style}_${name}`);
      assertSeamlessBase(read(`assets/dungeon/walls/${style}_${name}.svg`), `${style}_${name} (диск)`);
      assertSeamlessBase(buildTile(t), `${style}_${name} (генератор)`);
      checked += 2;
    }
  }
  assert.equal(checked, 120, 'проверено 60 файлов × 2 источника');
});

// --- CT-4b (гвард): центральный блок стен вне края в зоне [10.5, 53.5]² ---

test('CT-4b (гвард): стены (60 плиток): любой элемент тела, не касающийся края тайла, в центральной зоне [10.5, 53.5]²', () => {
  for (const style of WALL_KINDS) {
    for (const name of NAMES) {
      const label = `${style}_${name}`;
      const boxes = elementBoxes(read(`assets/dungeon/walls/${label}.svg`), label);
      let inner = 0;
      for (const x of boxes) {
        if (isBaseRect(x) || touchesEdge(x.b)) continue;
        inner += 1;
        assert.ok(inRect(x.b, WALL_CENTER),
          `${label}: центральный элемент вне зоны [10.5, 53.5]²: ${x.tag} ${fmtBox(x.b)}`);
      }
      assert.ok(inner > 0, `${label}: центральные элементы присутствуют (гвард не вхолостую)`);
    }
  }
});

// --- CT-5 (гвард): диск ≡ генераторы, побайтово ---

test('CT-5 (гвард): 68 пересоздаваемых тайла на диске byte-идентичны выходу генераторов (8 пола cave + 60 стен rock/column/stalactite)', () => {
  let n = 0;
  for (const t of TILES) {
    if (!t.key.startsWith('cave_')) continue;
    assert.equal(read(`assets/dungeon/floor/${t.key}.svg`), buildDungeonFloorTile(t),
      `файл на диске ≠ выход генератора: assets/dungeon/floor/${t.key}.svg`);
    n += 1;
  }
  for (const t of WALL_TILES) {
    if (!WALL_KINDS.includes(t.style)) continue;
    assert.equal(read(t.path), buildTile(t),
      `файл на диске ≠ выход генератора: ${t.path}`);
    n += 1;
  }
  assert.equal(n, 68, 'пересоздаваемых тайлов = 8 + 60');
});

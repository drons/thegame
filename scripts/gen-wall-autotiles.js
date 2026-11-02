'use strict';
// Генерация 80 SVG для автотайлинга кромки стены (задача 000258) —
// 4 стиля × 20 плиток:
//   city       → assets/city/walls/city_<name>.svg       (НОВОЕ каталог)
//   rock       → assets/dungeon/walls/rock_<name>.svg
//   column     → assets/dungeon/walls/column_<name>.svg
//   stalactite → assets/dungeon/walls/stalactite_<name>.svg
// Заменяет 6 фасадных SVG 000070 (rock_1/2, column_1/2,
// stalactite_1/2) и их генератор gen-dungeon-walls.js.
//
// idx плитки (контракт WALL_AUTOTILE_NAMES, sprites.js; стена рисует
// кромку — маска соседей стены, инволюция 000258):
//   0..15 — маска 4 соседей (N=1/E=2/S=4/W=8; бит = «сосед — пол»):
//           свес/bevel вдоль каждого граничного края (внутрь плитки);
//   16..19 — углы cSE/cSW/cNE/cNW (маска 0 + ровно одна диагональ пола):
//           диагональный свес в углу (SE=16, SW=17, NE=18, NW=19).
// m00 — чистая стена без кромки (idx 0; в подземелье не рисуется).
//
// Бесшовность (паттерн 000069): базовый вертикальный linearGradient
// (2 стопа) идентичен во ВСЕХ 20 плитках стиля; детали (фасетки/
// крапинки) — только в центральной области 12..52, внешние ~8 px —
// чистая база. Палитры: city — градиент #77685a→#66594c (фолбэк-палитра
// города), фасетки/крапинки #948a7b / #332c25, кромка 0.55/0.4;
// rock/column/stalactite — плоская база #9c9488 (2 равных стопа, 000294),
// фасетки/крапинки #b7b0a4 / #322c24, кромка 0.8/0.65.
//
// Генерация полностью детерминирована: сид от (стиль, idx), порядок
// элементов и атрибутов фиксирован, координаты округлены до 0.1 px,
// без дат — повторный прогон даёт byte-идентичные файлы.
//
// Запуск: node scripts/gen-wall-autotiles.js
//         (npm run gen:wallautotiles)

const { writeFileSync, mkdirSync } = require('node:fs');
const { join, dirname } = require('node:path');

const isMain = require.main === module;

const SIZE = 64;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function() {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Округление координат до 0.1 px (чистый SVG, детерминизм).
function f(v) {
  return Math.round(v * 10) / 10;
}

const NAMES = [
  'm00', 'm01', 'm02', 'm03', 'm04', 'm05', 'm06', 'm07',
  'm08', 'm09', 'm10', 'm11', 'm12', 'm13', 'm14', 'm15',
  'cSE', 'cSW', 'cNE', 'cNW',
];

const STYLES = [
  { name: 'city',       top: '#77685a', bottom: '#66594c', dir: 'assets/city/walls',    prefix: 'city_',       base: 0x57a10001,
    light: '#948a7b', dark: '#332c25', edgeLightOp: 0.55, edgeDarkOp: 0.4 },
  { name: 'rock',       top: '#9c9488', bottom: '#9c9488', dir: 'assets/dungeon/walls', prefix: 'rock_',       base: 0x57a20001,
    light: '#b7b0a4', dark: '#322c24', edgeLightOp: 0.8, edgeDarkOp: 0.65 },
  { name: 'column',     top: '#9c9488', bottom: '#9c9488', dir: 'assets/dungeon/walls', prefix: 'column_',     base: 0x57a30001,
    light: '#b7b0a4', dark: '#322c24', edgeLightOp: 0.8, edgeDarkOp: 0.65 },
  { name: 'stalactite', top: '#9c9488', bottom: '#9c9488', dir: 'assets/dungeon/walls', prefix: 'stalactite_', base: 0x57a40001,
    light: '#b7b0a4', dark: '#322c24', edgeLightOp: 0.8, edgeDarkOp: 0.65 },
];

// Кромка вдоль края: светлый свес (4 px от края) + тонкая тёмная линия
// шва (1.5 px), рисуются ВНУТРЬ плитки от граничного края.
function edgeBand(bit, st) {
  let overhang, seam;
  if (bit === 1) {
    overhang = { x: 0, y: 0, w: SIZE, h: 4 };
    seam = { x: 0, y: 4, w: SIZE, h: 1.5 };
  } else if (bit === 2) {
    overhang = { x: SIZE - 4, y: 0, w: 4, h: SIZE };
    seam = { x: SIZE - 5.5, y: 0, w: 1.5, h: SIZE };
  } else if (bit === 4) {
    overhang = { x: 0, y: SIZE - 4, w: SIZE, h: 4 };
    seam = { x: 0, y: SIZE - 5.5, w: SIZE, h: 1.5 };
  } else {
    overhang = { x: 0, y: 0, w: 4, h: SIZE };
    seam = { x: 4, y: 0, w: 1.5, h: SIZE };
  }
  const r = (b) => `<rect x="${f(b.x)}" y="${f(b.y)}" width="${f(b.w)}" height="${f(b.h)}"/>`;
  return `<g fill="${st.light}" opacity="${st.edgeLightOp}">${r(overhang)}</g>` +
    `<g fill="${st.dark}" opacity="${st.edgeDarkOp}">${r(seam)}</g>`;
}

// Угловая плитка: диагональный свес в углу (катеты 12 px) + линия шва,
// параллельная гипотенузе, с зазором 4 px.
const CORNERS = {
  cSE: { tri: '64,52 64,64 52,64', seam: 'M64 56 L56 64' },
  cSW: { tri: '0,52 0,64 12,64',   seam: 'M0 56 L8 64' },
  cNE: { tri: '64,0 64,12 52,0',   seam: 'M64 8 L56 0' },
  cNW: { tri: '0,0 12,0 0,12',     seam: 'M8 0 L0 8' },
};

function cornerBand(name, st) {
  const c = CORNERS[name];
  return `<polygon points="${c.tri}" fill="${st.light}" opacity="${st.edgeLightOp}"/>` +
    `<path d="${c.seam}" stroke="${st.dark}" stroke-width="1.5" fill="none" opacity="${st.edgeDarkOp}"/>`;
}

// Центральные детали (только область 12..52 — внешние ~8 px чистая
// база, бесшовность по краю плитки): одна фасетка + 4 крапинки.
function centerDetails(rnd, st) {
  const px = () => f(12 + rnd() * 40);
  const out = [];
  const cx = 16 + rnd() * 32;
  const cy = 16 + rnd() * 32;
  const s = 4 + rnd() * 4;
  const pts = [
    [f(cx - s / 2), f(cy - s / 2)],
    [f(cx + s / 2), f(cy - s / 4)],
    [f(cx + s / 3), f(cy + s / 2)],
  ].map((p) => p.join(',')).join(' ');
  out.push(`<polygon points="${pts}" fill="${rnd() < 0.5 ? st.light : st.dark}" opacity="${f(0.12 + rnd() * 0.08)}"/>`);
  for (let i = 0; i < 4; i++) {
    out.push(`<circle cx="${px()}" cy="${px()}" r="${f(0.5 + rnd() * 0.9)}" fill="${rnd() < 0.5 ? st.light : st.dark}" opacity="${f(0.2 + rnd() * 0.2)}"/>`);
  }
  return out.join('');
}

function buildTile(tile) {
  const st = STYLES[tile.styleIdx];
  const rnd = mulberry32((st.base + tile.idx) >>> 0);
  const bits = tile.idx & 15;
  const edge = tile.idx < 16
    ? (bits & 1 ? edgeBand(1, st) : '') + (bits & 2 ? edgeBand(2, st) : '') +
      (bits & 4 ? edgeBand(4, st) : '') + (bits & 8 ? edgeBand(8, st) : '')
    : cornerBand(NAMES[tile.idx], st);
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    `<defs><linearGradient id="wg" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${st.top}"/>` +
    `<stop offset="1" stop-color="${st.bottom}"/>` +
    '</linearGradient></defs>' +
    '<g>' +
    `<rect x="0" y="0" width="${SIZE}" height="${SIZE}" fill="url(#wg)"/>` +
    centerDetails(rnd, st) +
    edge +
    '</g></svg>';
}

const TILES = [];
for (let si = 0; si < STYLES.length; si++) {
  const st = STYLES[si];
  for (let idx = 0; idx < NAMES.length; idx++) {
    TILES.push({
      style: st.name,
      name: NAMES[idx],
      idx,
      styleIdx: si,
      path: join(st.dir, st.prefix + NAMES[idx] + '.svg'),
    });
  }
}

if (isMain) {
  let written = 0;
  for (const t of TILES) {
    const svg = buildTile(t);
    const full = join(__dirname, '..', t.path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, svg, 'utf8');
    written++;
  }
  console.log(`gen-wall-autotiles: ${written} SVG (4 стиля × 20 плиток)`);
}

module.exports = { TILES, buildTile, STYLES, NAMES };

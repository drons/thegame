// Генератор 40 статичных SVG-тайлов пола подземелья (задачи 000069/
// 000294 — градиентная база, 000323 — плоская flat-база, 8 вариантов
// на тип) — assets/dungeon/floor/<slug>_<n>.svg: 5 типов подземелий
// (cave/crypt/ruins/drowned/abyss — те же слоги, что у фонов боя
// 000049), по 8 вариантов на тип (n = 1..8).
//
// Flat-SVG (паттерн 000302): базовый rect 64×64 fill=hex + детали
// ТОЛЬКО rect/circle/ellipse/polygon — без градиентов/defs/path/
// текста/transform/обводок. Бесшовность: база типа — ОДИН плоский
// тон у всех 8 вариантов (края совпадают в произвольном порядке);
// детали (камешки, швы, волны, лужи, искры) строго внутри [0.5,
// 63.5]². Контракт — memory/000323-dungeon-tiles.md.
//
// Детерминирован: фиксированный сид на тайл, стабильный порядок,
// округление до 0.1 px, без дат — повторный запуск byte-identical
// (проверка: второй запуск → git diff пуст).
//
// Запуск: node scripts/gen-dungeon-tiles.js  (или npm run gen:dungeon)

const { writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

const isMain = require.main === module;

const SIZE = 64;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function f(v) {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
}

function inner(rnd, margin) {
  const m = margin === undefined ? 8 : margin;
  return { x: m + rnd() * (SIZE - 2 * m), y: m + rnd() * (SIZE - 2 * m) };
}

function unit(rnd) {
  const a = rnd() * Math.PI;
  return [Math.cos(a), Math.sin(a)];
}

function poly(pts, c, o) {
  const s = pts.map((p) => `${f(p[0])},${f(p[1])}`).join(' ');
  return `<polygon points="${s}" fill="${c}" opacity="${o}" />`;
}

function dot(x, y, r, c, o) {
  return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${c}" opacity="${o}" />`;
}

function pebble(x, y, r, c, o) {
  return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(r)}" ry="${f(r * 0.7)}" fill="${c}" opacity="${o}" />`;
}

function stone(x, y, s, c, o) {
  return poly([
    [x - s, y - 0.2 * s], [x - 0.3 * s, y - 0.8 * s], [x + 0.7 * s, y - 0.5 * s],
    [x + s, y + 0.4 * s], [x - 0.7 * s, y + 0.6 * s],
  ], c, o);
}

function slab(x, y, w, h, c, o) {
  return poly([
    [x, y], [x + w, y + h * 0.3], [x + w * 0.8, y + h], [x + w * 0.1, y + h * 0.8],
  ], c, o);
}

function strip(x, y, len, ux, uy, w, c, o) {
  const hl = len / 2;
  const px = -uy * w / 2, py = ux * w / 2;
  return poly([
    [x - ux * hl + px, y - uy * hl + py],
    [x + ux * hl + px, y + uy * hl + py],
    [x + ux * hl - px, y + uy * hl - py],
    [x - ux * hl - px, y - uy * hl - py],
  ], c, o);
}

const TYPES = [
  {
    slug: 'cave',
    base: '#5d554d',
    details(rnd, out) {
      for (let i = 0; i < 6; i++) {
        const p = inner(rnd);
        out.push(stone(p.x, p.y, 2.5 + rnd() * 2.5, '#4b423a', f(0.5 + rnd() * 0.3)));
      }
      for (let i = 0; i < 5; i++) {
        const p = inner(rnd);
        out.push(pebble(p.x, p.y, 1.2 + rnd() * 1.6, '#574e44', f(0.5 + rnd() * 0.3)));
      }
      for (let i = 0; i < 4; i++) {
        const p = inner(rnd);
        const [ux, uy] = unit(rnd);
        out.push(strip(p.x, p.y, 3 + rnd() * 3, ux, uy, 0.9, '#362f29', f(0.3 + rnd() * 0.2)));
      }
      for (let i = 0; i < 5; i++) {
        const p = inner(rnd);
        out.push(dot(p.x, p.y, 0.7 + rnd() * 0.7, '#837969', f(0.35 + rnd() * 0.3)));
      }
    },
  },
  {
    slug: 'crypt',
    base: '#5a6170',
    details(rnd, out) {
      for (let i = 0; i < 5; i++) {
        const p = { x: 8 + rnd() * 38, y: 8 + rnd() * 38 };
        const horiz = rnd() < 0.5;
        const len = 10 + rnd() * 6;
        out.push(strip(p.x, p.y, len, horiz ? 1 : 0, horiz ? 0 : 1, 0.9,
          '#2a2f3c', 0.35));
      }
      for (let i = 0; i < 4; i++) {
        const p = inner(rnd);
        const s = 3 + rnd() * 2.5;
        out.push(pebble(p.x, p.y, s * 0.55, '#cfd3da', f(0.45 + rnd() * 0.25)));
        out.push(dot(p.x + s * 0.3, p.y - s * 0.25, s * 0.22, '#cfd3da', f(0.45 + rnd() * 0.25)));
        out.push(dot(p.x - s * 0.3, p.y + s * 0.25, s * 0.22, '#cfd3da', f(0.45 + rnd() * 0.25)));
      }
      for (let i = 0; i < 3; i++) {
        const p = inner(rnd);
        const s = 3.5 + rnd() * 2.5;
        out.push(strip(p.x, p.y, s, 1, 0, 0.9, '#8fa3c4', f(0.3 + rnd() * 0.2)));
        out.push(strip(p.x + s / 2, p.y, s, -0.45, 1, 0.9, '#8fa3c4', f(0.3 + rnd() * 0.2)));
      }
      for (let i = 0; i < 5; i++) {
        const p = inner(rnd);
        out.push(dot(p.x, p.y, 0.7 + rnd() * 0.9, '#6d7586', f(0.3 + rnd() * 0.25)));
      }
    },
  },
  {
    slug: 'ruins',
    base: '#7a6f60',
    details(rnd, out) {
      for (let i = 0; i < 5; i++) {
        const p = inner(rnd);
        out.push(slab(p.x, p.y, 4 + rnd() * 4, 3 + rnd() * 3, '#6a5f50', f(0.5 + rnd() * 0.3)));
      }
      for (let i = 0; i < 4; i++) {
        const p = inner(rnd);
        out.push(stone(p.x, p.y, 2.5 + rnd() * 3, '#453e35', f(0.5 + rnd() * 0.3)));
      }
      for (let i = 0; i < 4; i++) {
        const p = inner(rnd);
        const [ux, uy] = unit(rnd);
        out.push(strip(p.x, p.y, 3 + rnd() * 5, ux, uy, 0.9, '#544c41', f(0.3 + rnd() * 0.2)));
      }
      for (let i = 0; i < 5; i++) {
        const p = inner(rnd);
        out.push(pebble(p.x, p.y, 1.2 + rnd() * 1.8, '#8f8574', f(0.4 + rnd() * 0.3)));
      }
    },
  },
  {
    slug: 'drowned',
    base: '#2a5494',
    details(rnd, out) {
      for (let i = 0; i < 3; i++) {
        const p = inner(rnd, 10);
        const rx = 4 + rnd() * 4.5;
        out.push(`<ellipse cx="${f(p.x)}" cy="${f(p.y)}" rx="${f(rx)}" ry="${f(rx * 0.62)}" fill="#16325c" opacity="0.55" />`);
        out.push(`<ellipse cx="${f(p.x + rx * 0.18)}" cy="${f(p.y - rx * 0.1)}" rx="${f(rx * 0.5)}" ry="${f(rx * 0.3)}" fill="#4a7fc0" opacity="0.4" />`);
      }
      for (let i = 0; i < 4; i++) {
        const p = { x: 10 + rnd() * 30, y: 10 + rnd() * 44 };
        const len = 8 + rnd() * 6;
        const seg = len / 3;
        out.push(strip(p.x, p.y, seg, 1, 0.4, 1, '#4a7fc0', f(0.3 + rnd() * 0.2)));
        out.push(strip(p.x + seg, p.y, seg, 1, -0.4, 1, '#4a7fc0', f(0.3 + rnd() * 0.2)));
        out.push(strip(p.x + 2 * seg, p.y, seg, 1, 0.4, 1, '#4a7fc0', f(0.3 + rnd() * 0.2)));
      }
      for (let i = 0; i < 5; i++) {
        const p = inner(rnd);
        out.push(dot(p.x, p.y, 0.9 + rnd() * 1.4, '#7fa8d9', f(0.3 + rnd() * 0.25)));
      }
      for (let i = 0; i < 3; i++) {
        const p = { x: 10 + rnd() * 44, y: 10 + rnd() * 34 };
        const h = 5 + rnd() * 5;
        out.push(strip(p.x, p.y, h, 0.2, 1, 1.1, '#3f7f8f', f(0.3 + rnd() * 0.2)));
        out.push(dot(p.x, p.y + h / 2, 0.9, '#3f7f8f', f(0.3 + rnd() * 0.2)));
      }
    },
  },
  {
    slug: 'abyss',
    base: '#171221',
    details(rnd, out) {
      for (let i = 0; i < 7; i++) {
        const p = inner(rnd);
        out.push(dot(p.x, p.y, 0.7 + rnd() * 1.1, '#8a6fc0', f(0.25 + rnd() * 0.25)));
      }
      for (let i = 0; i < 5; i++) {
        const p = inner(rnd);
        out.push(dot(p.x, p.y, 0.6 + rnd() * 0.8, '#4a2f6b', f(0.4 + rnd() * 0.25)));
      }
      for (let i = 0; i < 3; i++) {
        const p = inner(rnd);
        const [ux, uy] = unit(rnd);
        out.push(strip(p.x, p.y, 3 + rnd() * 4, ux, uy, 0.9, '#04020a', f(0.4 + rnd() * 0.2)));
      }
      for (let i = 0; i < 3; i++) {
        const p = inner(rnd);
        out.push(dot(p.x, p.y, 0.8 + rnd() * 1, '#8a6fc0', f(0.15 + rnd() * 0.15)));
      }
    },
  },
];

const TILES = [];
TYPES.forEach((t, i) => {
  for (let n = 1; n <= 8; n++) {
    TILES.push({
      key: t.slug + '_' + n,
      seed: 0x69000100 + i * 8 + n,
      base: t.base,
      details: t.details,
    });
  }
});

function buildDungeonFloorTile(t) {
  const rnd = mulberry32(t.seed);
  const L = [];
  L.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">`);
  L.push(`  <rect width="${SIZE}" height="${SIZE}" fill="${t.base}"/>`);
  const det = [];
  t.details(rnd, det);
  if (det.length) {
    L.push(`  <g>`);
    for (const d of det) L.push(`    ${d}`);
    L.push(`  </g>`);
  }
  L.push(`</svg>`);
  return L.join('\n') + '\n';
}

if (isMain) {
  const root = join(__dirname, '..');
  const dir = join(root, 'assets', 'dungeon', 'floor');
  mkdirSync(dir, { recursive: true });
  for (const t of TILES) {
    const p = join(dir, t.key + '.svg');
    writeFileSync(p, buildDungeonFloorTile(t));
    console.log(`Записано ${p}`);
  }
  console.log(`Всего: ${TILES.length} тайлов (${SIZE}×${SIZE})`);
}

module.exports = { TILES, buildDungeonFloorTile };

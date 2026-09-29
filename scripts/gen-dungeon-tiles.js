// Генератор 15 статичных SVG-тайлов пола подземелья (задача 000069) —
// assets/dungeon/floor/<slug>_<n>.svg: 5 типов подземелий
// (cave/crypt/ruins/drowned/abyss — те же слоги, что у фонов боя 000049),
// по 3 варианта на тип (n = 1..3).
//
// Стиль — единый, как у assets/tiles/*.svg и assets/combat/bg:
// вертикальный linearGradient из двух близких тонов + мягкая текстура
// (пятна света/тени через radialGradient, fade до opacity 0) + мелкие
// низкоконтрастные детали (stroke-linecap round). Ключевое отличие от
// фонов боя — требования к стыкам при по-клеточной отрисовке:
// * базовый linearGradient ОДИНАКОВ для всех 3 вариантов одного типа
//   (сид меняет только раскладку деталей) — тональный фон клеток
//   одного типа совпадает, без «шахматных» контрастных прыжков;
// * детали НИЗКОКОНТРАСТНЫЕ и стоят во ВНУТРЕННОСТИ тайла (не доходят
//   до краёв) — жёсткий контраст на границе тайла дал бы видимый шов
//   на стыке клеток;
// * виньетки НЕТ (у фонов боя она есть): потемнение краёв каждого
//   тайла дало бы сетку тёмных линий между клетками.
//
// Генерация полностью детерминирована: фиксированный сид на тайл,
// стабильный порядок элементов и атрибутов, округление до 0.1 px,
// без дат — повторный запуск даёт byte-identical файлы
// (проверка: второй запуск → git diff пуст).
//
// Запуск: node scripts/gen-dungeon-tiles.js  (или npm run gen:dungeon)

const { writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

const isMain = require.main === module;

const SIZE = 64; // 64×64 — тот же базовый размер, что у мировых тайлов

/** Детерминированный PRNG (mulberry32) — один поток на тайл. */
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

/** Число с 1 знаком после точки (устойчивый вывод, без шума -0). */
function f(v) {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
}

/** Точка во внутренней части тайла (margin — запас от краёв). */
function inner(rnd, margin) {
  const m = margin === undefined ? 10 : margin;
  return { x: m + rnd() * (SIZE - 2 * m), y: m + rnd() * (SIZE - 2 * m) };
}

// --- Детали (одна строка SVG на элемент) ---
//
// Все размеры — малые (2..8 px), контраст — низкий (opacity 0.15..0.8,
// оттенки той же палитры, что базовый градиент): деталь читается как
// фактура, а не как чужеродный объект, и на стыках клеток не
// «прыгает».

function dot(x, y, r, c, o) {
  return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${c}" opacity="${o}" />`;
}

function pebble(x, y, r, c, o) {
  return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(r)}" ry="${f(r * 0.7)}" fill="${c}" opacity="${o}" />`;
}

/** Неровный камешек — неправильный пятиугольник вокруг (x, y). */
function stone(x, y, s, c, o) {
  const pts = [[-1, -0.2], [-0.3, -0.8], [0.7, -0.5], [1, 0.4], [-0.7, 0.6]]
    .map((p) => `${f(x + p[0] * s)},${f(y + p[1] * s)}`).join(' ');
  return `<polygon points="${pts}" fill="${c}" opacity="${o}" />`;
}

/** Трещина — короткая ломаная (три звена). */
function crack(x, y, s, c, o) {
  return `<path d="M${f(x)} ${f(y)} l${f(s * 0.7)} ${f(s * 0.4)} l${f(s * 0.5)} ${f(-s * 0.3)} l${f(s * 0.6)} ${f(s * 0.5)}" ` +
    `stroke="${c}" stroke-width="1" fill="none" stroke-linecap="round" opacity="${o}" />`;
}

/** Шов плиты (склеп) — короткий отрезок. */
function seam(x, y, w, h, c, o) {
  return `<path d="M${f(x)} ${f(y)} l${f(w)} ${f(h)}" stroke="${c}" stroke-width="1" stroke-linecap="round" opacity="${o}" />`;
}

/** Косточка (склеп) — короткая линия с «головкой». */
function boneFrag(x, y, s, c, o) {
  return `<path d="M${f(x)} ${f(y)} l${f(s)} ${f(s * 0.4)}" stroke="${c}" ` +
    `stroke-width="${f(s * 0.4)}" stroke-linecap="round" opacity="${o}" />` +
    dot(x + s * 0.2, y - s * 0.25, s * 0.22, c, o);
}

/** Рунный след (склеп) — короткая ломаная из двух звеньев. */
function runeFrag(x, y, s, c, o) {
  return `<path d="M${f(x)} ${f(y)} l${f(s)} 0 l${f(-s * 0.5)} ${f(s * 0.7)}" ` +
    `stroke="${c}" stroke-width="1" fill="none" stroke-linecap="round" opacity="${o}" />`;
}

/** Обломок кладки (руины) — скошенная пластина. */
function slab(x, y, w, h, c, o) {
  return `<polygon points="${f(x)},${f(y)} ${f(x + w)},${f(y + h * 0.3)} ${f(x + w * 0.8)},${f(y + h)} ${f(x + w * 0.1)},${f(y + h * 0.8)}" ` +
    `fill="${c}" opacity="${o}" />`;
}

/** Волна (затопленная) — короткая S-дуга (приём фонов боя). */
function wavelet(x, y, len, c, o) {
  const h = len / 2;
  return `<path d="M${f(x)} ${f(y)} Q${f(x + h / 2)} ${f(y - 2.2)} ${f(x + h)} ${f(y)} Q${f(x + h * 1.5)} ${f(y + 2.2)} ${f(x + len)} ${f(y)}" ` +
    `stroke="${c}" stroke-width="1.2" fill="none" stroke-linecap="round" opacity="${o}" />`;
}

/** Подтёк (затопленная) — короткая вертикальная дуга с каплей. */
function drip(x, y, h, c, o) {
  return `<path d="M${f(x)} ${f(y)} q${f(h * 0.2)} ${f(h * 0.4)} 0 ${f(h)}" ` +
    `stroke="${c}" stroke-width="1.3" fill="none" stroke-linecap="round" opacity="${o}" />` +
    dot(x, y + h, 0.9, c, f(o * 0.8));
}

/** Тусклый огонёк (бездна). */
function glowDot(x, y, r, o) {
  return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="#8a6fc0" opacity="${o}" />`;
}

// --- Состав 5 типов (5 типов × 3 варианта = 15 тайлов) ---
//
// Палитры — те же базовые пары тонов, что у фонов боя 000049 (cave —
// бурый, crypt — холодный серый, ruins — тёплая кладка, drowned —
// синий с сине-зелёными подтёками, abyss — чёрно-фиолетовый):
// «пять типов — пять разных видов». Базовый градиент типа общий для
// всех 3 вариантов — сид меняет только раскладку деталей.

const TYPES = [
  {
    slug: 'cave', top: '#6e655a', bottom: '#4b443b',
    light: '#837969', lightOp: 0.35, dark: '#362f29', darkOp: 0.45,
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
        out.push(crack(p.x, p.y, 3 + rnd() * 4, '#362f29', f(0.3 + rnd() * 0.2)));
      }
      for (let i = 0; i < 5; i++) {
        const p = inner(rnd);
        out.push(dot(p.x, p.y, 0.7 + rnd() * 0.7, '#837969', f(0.35 + rnd() * 0.3)));
      }
    },
  },
  {
    slug: 'crypt', top: '#5a6170', bottom: '#3a404e',
    light: '#6d7586', lightOp: 0.35, dark: '#2a2f3c', darkOp: 0.45,
    details(rnd, out) {
      for (let i = 0; i < 5; i++) {
        // Отрезок целиком внутри тайла: старт ≤ 46, длина ≤ 16 → ≤ 62.
        const p = { x: 8 + rnd() * 38, y: 8 + rnd() * 38 };
        const horiz = rnd() < 0.5;
        out.push(seam(p.x, p.y,
          horiz ? 10 + rnd() * 6 : 0, horiz ? 0 : 10 + rnd() * 6,
          '#2a2f3c', 0.35));
      }
      for (let i = 0; i < 4; i++) {
        const p = inner(rnd);
        out.push(boneFrag(p.x, p.y, 3 + rnd() * 2.5, '#cfd3da', f(0.45 + rnd() * 0.25)));
      }
      for (let i = 0; i < 3; i++) {
        const p = inner(rnd);
        out.push(runeFrag(p.x, p.y, 3.5 + rnd() * 2.5, '#8fa3c4', f(0.3 + rnd() * 0.2)));
      }
      for (let i = 0; i < 5; i++) {
        const p = inner(rnd);
        out.push(dot(p.x, p.y, 0.7 + rnd() * 0.9, '#6d7586', f(0.3 + rnd() * 0.25)));
      }
    },
  },
  {
    slug: 'ruins', top: '#7a6f60', bottom: '#544c41',
    light: '#8f8574', lightOp: 0.35, dark: '#403a31', darkOp: 0.45,
    details(rnd, out) {
      for (let i = 0; i < 5; i++) {
        const p = inner(rnd);
        out.push(slab(p.x, p.y, 4 + rnd() * 4, 3 + rnd() * 3, '#5b5344', f(0.5 + rnd() * 0.3)));
      }
      for (let i = 0; i < 4; i++) {
        const p = inner(rnd);
        out.push(stone(p.x, p.y, 2.5 + rnd() * 3, '#453e35', f(0.5 + rnd() * 0.3)));
      }
      for (let i = 0; i < 4; i++) {
        const p = inner(rnd);
        out.push(crack(p.x, p.y, 3 + rnd() * 5, '#403a31', f(0.3 + rnd() * 0.2)));
      }
      for (let i = 0; i < 5; i++) {
        const p = inner(rnd);
        out.push(pebble(p.x, p.y, 1.2 + rnd() * 1.8, '#8f8574', f(0.4 + rnd() * 0.3)));
      }
    },
  },
  {
    slug: 'drowned', top: '#2a5494', bottom: '#16295c',
    light: '#3a6cb0', lightOp: 0.4, dark: '#0f1f4a', darkOp: 0.5,
    details(rnd, out) {
      for (let i = 0; i < 6; i++) {
        // Волна целиком внутри тайла: старт ≤ 40, длина ≤ 14 → ≤ 54.
        const p = { x: 10 + rnd() * 30, y: 10 + rnd() * 44 };
        out.push(wavelet(p.x, p.y, 8 + rnd() * 6, '#4a7fc0', f(0.3 + rnd() * 0.2)));
      }
      for (let i = 0; i < 5; i++) {
        const p = inner(rnd);
        out.push(dot(p.x, p.y, 0.9 + rnd() * 1.4, '#7fa8d9', f(0.3 + rnd() * 0.25)));
      }
      for (let i = 0; i < 4; i++) {
        const p = { x: 10 + rnd() * 44, y: 10 + rnd() * 34 };
        out.push(drip(p.x, p.y, 5 + rnd() * 5, '#3f7f8f', f(0.3 + rnd() * 0.2)));
      }
      for (let i = 0; i < 4; i++) {
        const p = inner(rnd);
        out.push(dot(p.x, p.y, 0.6 + rnd() * 0.8, '#3f7f8f', f(0.35 + rnd() * 0.25)));
      }
    },
  },
  {
    slug: 'abyss', top: '#171221', bottom: '#0a0713',
    light: '#241a33', lightOp: 0.5, dark: '#04020a', darkOp: 0.5,
    details(rnd, out) {
      for (let i = 0; i < 7; i++) {
        const p = inner(rnd);
        out.push(glowDot(p.x, p.y, 0.7 + rnd() * 1.1, f(0.25 + rnd() * 0.25)));
      }
      for (let i = 0; i < 5; i++) {
        const p = inner(rnd);
        out.push(dot(p.x, p.y, 0.6 + rnd() * 0.8, '#4a2f6b', f(0.4 + rnd() * 0.25)));
      }
      for (let i = 0; i < 3; i++) {
        const p = inner(rnd);
        out.push(crack(p.x, p.y, 3 + rnd() * 4, '#04020a', f(0.4 + rnd() * 0.2)));
      }
      for (let i = 0; i < 3; i++) {
        const p = inner(rnd);
        out.push(dot(p.x, p.y, 0.8 + rnd() * 1, '#8a6fc0', f(0.15 + rnd() * 0.15)));
      }
    },
  },
];

// 15 спецификаций: ключ <slug>_<n> (n = 1..3), свой сид (сид меняет
// только раскладку — базовые тона типа общие, см. TYPES).
const TILES = [];
TYPES.forEach((t, i) => {
  for (let n = 1; n <= 3; n++) {
    TILES.push({
      key: t.slug + '_' + n,
      seed: 0x69000100 + i * 3 + n,
      top: t.top, bottom: t.bottom,
      light: t.light, lightOp: t.lightOp,
      dark: t.dark, darkOp: t.darkOp,
      details: t.details,
    });
  }
});

/** SVG-документ тайла (чистая функция от t-спецификации). */
function buildDungeonFloorTile(t) {
  const rnd = mulberry32(t.seed);
  const L = [];
  L.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">`);
  L.push(`  <defs>`);
  // Базовый градиент — ПЕРВЫЙ и ОДИНАКОВ для всех 3 вариантов типа
  // (тест сверяет пару stop-цветов первого linearGradient).
  L.push(`    <linearGradient id="gb" x1="0" y1="0" x2="0" y2="1">`);
  L.push(`      <stop offset="0" stop-color="${t.top}"/>`);
  L.push(`      <stop offset="1" stop-color="${t.bottom}"/>`);
  L.push(`    </linearGradient>`);
  L.push(`    <radialGradient id="gl">`);
  L.push(`      <stop offset="0" stop-color="${t.light}" stop-opacity="${t.lightOp}"/>`);
  L.push(`      <stop offset="1" stop-color="${t.light}" stop-opacity="0"/>`);
  L.push(`    </radialGradient>`);
  L.push(`    <radialGradient id="gd">`);
  L.push(`      <stop offset="0" stop-color="${t.dark}" stop-opacity="${t.darkOp}"/>`);
  L.push(`      <stop offset="1" stop-color="${t.dark}" stop-opacity="0"/>`);
  L.push(`    </radialGradient>`);
  L.push(`  </defs>`);
  L.push(`  <rect width="${SIZE}" height="${SIZE}" fill="url(#gb)"/>`);
  // Мягкая текстура: пятна света/тени (radialGradient, fade до opacity
  // 0 — без периода и без жёсткого края, на стыках не рвётся).
  L.push(`  <g>`);
  for (let i = 0; i < 4; i++) {
    const p = inner(rnd, 14);
    const rx = 8 + rnd() * 8, ry = rx * (0.55 + rnd() * 0.3);
    L.push(`    <ellipse cx="${f(p.x)}" cy="${f(p.y)}" rx="${f(rx)}" ry="${f(ry)}" fill="url(#gl)"/>`);
  }
  for (let i = 0; i < 4; i++) {
    const p = inner(rnd, 14);
    const rx = 8 + rnd() * 8, ry = rx * (0.55 + rnd() * 0.3);
    L.push(`    <ellipse cx="${f(p.x)}" cy="${f(p.y)}" rx="${f(rx)}" ry="${f(ry)}" fill="url(#gd)"/>`);
  }
  L.push(`  </g>`);
  // Мелкие детали (низкоконтрастные, во внутренности тайла).
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

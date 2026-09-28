// Генерирует 11 статичных SVG-фонов поля боя (задача 000049) —
// assets/combat/bg/<name>.svg: 5 проходимых террейнов (палитра TILE_BASE
// из src/sprites.js), 5 подземелий (DUNGEON_TYPES из src/dungeon.js)
// и 1 фолбэк (plain — нейтральный тёмный, в духе текущего #0d1117).
//
// Стиль — единый, как у assets/tiles/*.svg: вертикальный linearGradient
// из двух близких тонов + мягкая текстура (пятна света/тени через
// radialGradient) + мелкие детали (stroke-linecap round). Препятствия в
// фон НЕ запекаются (их рисует задача 000050 отдельными спрайтами поверх).
//
// Геометрия: viewBox 0 0 336 336 = 7×7×CELL(48 px) — боевой canvas
// (src/combat-ui.js) в device px, без CSS-апскейла (индекс.html:
// .combat-box canvas без width/height). Для векторного SVG «запас под
// retina» не нужен: браузер растеризует SVG под размер drawImage.
// Тесселяций с периодом нет (мягкая нетекстура) — конфликта с сеткой
// 48 px нет. Жёсткие детали стоят на внешнем кольце карты: центр
// (3×3 клетки) — зона юнитов, там только мягкая текстура (низкий
// контраст).
//
// Генерация полностью детерминирована: фиксированный сид на фон,
// стабильный порядок элементов и атрибутов, округление до 0.1 px,
// без дат — повторный запуск даёт byte-identical файлы
// (проверка: второй запуск → git diff пуст).
//
// Запуск: node scripts/gen-combat-bg.js  (или npm run gen:combatbg)

const { writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

const isMain = require.main === module;

const SIZE = 336; // 7 × 7 клеток × 48 px (боевой canvas)
const CELL = 48;

/** Детерминированный PRNG (mulberry32) — один поток на фон. */
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

// --- Детали (одна строка SVG на элемент) ---

/** Точка на внешнем кольце (1 клетка по периметру, вне центра 3×3). */
function ringPoint(rnd) {
  const edge = Math.floor(rnd() * 4);
  const t = 6 + rnd() * (SIZE - 12);
  const o = 4 + rnd() * (CELL - 8);
  if (edge === 0) return { x: t, y: o };
  if (edge === 1) return { x: t, y: SIZE - o };
  if (edge === 2) return { x: o, y: t };
  return { x: SIZE - o, y: t };
}

/** Пучок травы/сухостоя — три короткие дуги (приём тайлов). */
function tuft(x, y, c, o, s = 1) {
  const w = f(1.4 * s);
  return `<g stroke="${c}" stroke-width="${w}" stroke-linecap="round" fill="none" opacity="${o}">` +
    `<path d="M${f(x)} ${f(y)} q${f(1.5 * s)} ${f(-6 * s)} 0 ${f(-9 * s)}" />` +
    `<path d="M${f(x + 4 * s)} ${f(y)} q${f(0.5 * s)} ${f(-6 * s)} ${f(2.5 * s)} ${f(-8 * s)}" />` +
    `<path d="M${f(x - 3 * s)} ${f(y)} q${f(-2 * s)} ${f(-4 * s)} 0 ${f(-8 * s)}" />` +
    `</g>`;
}

function pebble(x, y, r, c, o) {
  return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(r)}" ry="${f(r * 0.7)}" fill="${c}" opacity="${o}" />`;
}

function dot(x, y, r, c, o) {
  return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${c}" opacity="${o}" />`;
}

/** Волнистая линия (дюны/вода) — две сопряженные дуги. */
function wave(x, y, len, c, o) {
  const h = len / 2;
  return `<path d="M${f(x)} ${f(y)} Q${f(x + h / 2)} ${f(y - 4.5)} ${f(x + h)} ${f(y)} Q${f(x + h * 1.5)} ${f(y + 4.5)} ${f(x + len)} ${f(y)}" ` +
    `stroke="${c}" stroke-width="1.5" fill="none" stroke-linecap="round" opacity="${o}" />`;
}

/** Неровный камень (неправильный шестиугольник вокруг (x, y)). */
function rock(x, y, s, c, o) {
  const pts = [[-1, -0.15], [-0.55, -0.7], [0.25, -0.8], [0.9, -0.3],
    [0.6, 0.5], [-0.55, 0.55]]
    .map((p) => `${f(x + p[0] * s)},${f(y + p[1] * s)}`).join(' ');
  return `<polygon points="${pts}" fill="${c}" opacity="${o}" />`;
}

/** Крона дерева — кластер кругов (лес). */
function canopy(x, y, s) {
  return `<g opacity="0.8">` +
    `<circle cx="${f(x - s * 0.7)}" cy="${f(y + s * 0.25)}" r="${f(s * 0.7)}" fill="#28542e" />` +
    `<circle cx="${f(x + s * 0.7)}" cy="${f(y + s * 0.3)}" r="${f(s * 0.65)}" fill="#2c5e33" />` +
    `<circle cx="${f(x)}" cy="${f(y - s * 0.15)}" r="${f(s)}" fill="#31683a" />` +
    `<circle cx="${f(x - s * 0.25)}" cy="${f(y - s * 0.35)}" r="${f(s * 0.45)}" fill="#3f7a44" />` +
    `</g>`;
}

/** Гриб — ножка + полуокружность шляпы (лес). */
function mushroom(x, y, s) {
  return `<g><rect x="${f(x - 1)}" y="${f(y)}" width="2" height="${f(s * 0.6)}" fill="#d8cfa8" />` +
    `<path d="M${f(x - s * 0.55)} ${f(y)} a${f(s * 0.55)} ${f(s * 0.55)} 0 0 1 ${f(s * 1.1)} 0 z" fill="#b0413e" /></g>`;
}

/** Цветок — из тайла grass_1.svg. */
function flower(x, y) {
  return `<circle cx="${f(x)}" cy="${f(y)}" r="1.6" fill="#f4f0e0" />` +
    `<circle cx="${f(x)}" cy="${f(y)}" r="0.7" fill="#e8c25a" />`;
}

/** Тростинка — две изогнутые линии (болото). */
function reed(x, y, h, c, o) {
  return `<g stroke="${c}" stroke-width="1.6" fill="none" stroke-linecap="round" opacity="${o}">` +
    `<path d="M${f(x)} ${f(y)} q${f(h * 0.18)} ${f(-h * 0.55)} ${f(h * 0.42)} ${f(-h)}" />` +
    `<path d="M${f(x + 5)} ${f(y)} q${f(-h * 0.12)} ${f(-h * 0.45)} ${f(h * 0.22)} ${f(-h * 0.85)}" />` +
    `</g>`;
}

/** Кувшинка — эллипс с разрезом (болото; есть и в декорациях 000021). */
function lily(x, y, s, o) {
  return `<g opacity="${o}">` +
    `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(s)}" ry="${f(s * 0.55)}" fill="#5f7f45" />` +
    `<path d="M${f(x)} ${f(y)} L${f(x + s)} ${f(y)}" stroke="#33452a" stroke-width="1.2" /></g>`;
}

function bubble(x, y, r, c, o) {
  return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="none" stroke="${c}" stroke-width="1.2" opacity="${o}" />`;
}

/** Сосулька с потолка / сталагмит с пола (пещера). */
function stalactite(x, w, h, c) {
  return `<path d="M${f(x)} 0 L${f(x + w)} 0 L${f(x + w / 2)} ${f(h)} z" fill="${c}" opacity="0.85" />`;
}
function stalagmite(x, w, h, c) {
  return `<path d="M${f(x)} ${SIZE} L${f(x + w)} ${SIZE} L${f(x + w / 2)} ${f(SIZE - h)} z" fill="${c}" opacity="0.85" />`;
}

/** Крест из костей (склеп). */
function bone(x, y, s, c, o) {
  return `<g stroke="${c}" stroke-width="${f(s * 0.24)}" stroke-linecap="round" opacity="${o}">` +
    `<path d="M${f(x - s)} ${f(y + s)} L${f(x + s)} ${f(y - s)}" />` +
    `<path d="M${f(x - s)} ${f(y - s)} L${f(x + s)} ${f(y + s)}" /></g>`;
}

/** Рунная метка (склеп). */
function rune(x, y, s, c, o) {
  return `<g stroke="${c}" stroke-width="1.4" stroke-linecap="round" fill="none" opacity="${o}">` +
    `<path d="M${f(x)} ${f(y)} l${f(s)} 0 l${f(-s * 0.5)} ${f(s * 0.7)} l${f(s * 0.6)} ${f(s * 0.4)}" />` +
    `<path d="M${f(x + s * 0.45)} ${f(y + s * 0.2)} l0 ${f(s * 0.5)}" /></g>`;
}

/** Столб/руинный ствол с капителью (руины). */
function column(x, y, w, h, withCap) {
  let s = '';
  if (withCap) {
    s += `<rect x="${f(x - 3)}" y="${f(y - 5)}" width="${f(w + 6)}" height="5" fill="#7b7160" opacity="0.9" />`;
  }
  s += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="#6a6152" opacity="0.9" />`;
  s += `<path d="M${f(x + w / 3)} ${f(y + 2)} l0 ${f(h - 4)} M${f(x + 2 * w / 3)} ${f(y + 2)} l0 ${f(h - 4)}" ` +
    `stroke="#5b5344" stroke-width="1.2" opacity="0.7" fill="none" />`;
  return s;
}

/** Обломок камня (руины). */
function rubble(x, y, s, c, o) {
  const pts = [[-1, 0.3], [-0.4, -0.6], [0.5, -0.4], [1, 0.3]]
    .map((p) => `${f(x + p[0] * s)},${f(y + p[1] * s)}`).join(' ');
  return `<polygon points="${pts}" fill="${c}" opacity="${o}" />`;
}

/** Тусклый светящийся точечный элемент (бездна). */
function glow(x, y, r, o) {
  return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="#8a6fc0" opacity="${o}" />`;
}

/** Мягкое пятно тумана (бездна/затопленная пещера). */
function mist(x, y, rx, ry, c, o) {
  return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${c}" opacity="${o}" />`;
}

// --- Состав 11 фонов ---
//
// Палитра: базовые тона — TILE_BASE (src/sprites.js); свет/тень —
// соседние оттенки того же тона (приём тайлов: два близких цвета
// в linearGradient). Цифры — «на глаз», под читабельность сетки и
// юнитов (центр карты).

const BACKGROUNDS = [
  {
    key: 'sand', seed: 0x49010001, top: '#cabf94', bottom: '#b0a06d',
    light: '#dccfa6', lightOp: 0.5, dark: '#9c8c5f', darkOp: 0.4,
    details(rnd, out) {
      for (let i = 0; i < 14; i++) {
        const p = ringPoint(rnd);
        out.push(wave(p.x, p.y, 20 + rnd() * 18, '#a3946b', f(0.35 + rnd() * 0.3)));
      }
      for (let i = 0; i < 12; i++) {
        const p = ringPoint(rnd);
        out.push(pebble(p.x, p.y, 1.5 + rnd() * 2.5, '#a2946a', f(0.5 + rnd() * 0.35)));
      }
      for (let i = 0; i < 8; i++) {
        const p = ringPoint(rnd);
        out.push(tuft(p.x, p.y, '#8f8158', f(0.4 + rnd() * 0.3)));
      }
      for (let i = 0; i < 10; i++) {
        const p = ringPoint(rnd);
        out.push(dot(p.x, p.y, 0.8 + rnd(), '#d9cda6', f(0.4 + rnd() * 0.3)));
      }
    },
  },
  {
    key: 'grass', seed: 0x49010002, top: '#5c9145', bottom: '#45713a',
    light: '#74b25c', lightOp: 0.5, dark: '#3a6a2e', darkOp: 0.4,
    details(rnd, out) {
      for (let i = 0; i < 14; i++) {
        const p = ringPoint(rnd);
        out.push(tuft(p.x, p.y, '#3f7030', f(0.55 + rnd() * 0.3), 1 + rnd() * 0.4));
      }
      for (let i = 0; i < 10; i++) {
        const p = ringPoint(rnd);
        out.push(tuft(p.x, p.y, '#77b85e', f(0.45 + rnd() * 0.3), 1 + rnd() * 0.4));
      }
      for (let i = 0; i < 8; i++) {
        const p = ringPoint(rnd);
        out.push(flower(p.x, p.y));
      }
      for (let i = 0; i < 8; i++) {
        const p = ringPoint(rnd);
        out.push(pebble(p.x, p.y, 1.5 + rnd() * 2, '#4d7f39', f(0.5 + rnd() * 0.3)));
      }
    },
  },
  {
    key: 'forest', seed: 0x49010003, top: '#35713c', bottom: '#234e28',
    light: '#478a4f', lightOp: 0.45, dark: '#1b3d1f', darkOp: 0.45,
    details(rnd, out) {
      for (let i = 0; i < 10; i++) {
        const p = ringPoint(rnd);
        out.push(canopy(p.x, p.y, 10 + rnd() * 8));
      }
      for (let i = 0; i < 8; i++) {
        const p = ringPoint(rnd);
        out.push(tuft(p.x, p.y, '#245229', f(0.5 + rnd() * 0.3), 1 + rnd() * 0.5));
      }
      for (let i = 0; i < 5; i++) {
        const p = ringPoint(rnd);
        out.push(mushroom(p.x, p.y, 5 + rnd() * 3));
      }
      for (let i = 0; i < 6; i++) {
        const p = ringPoint(rnd);
        out.push(dot(p.x, p.y, 1 + rnd(), '#6fae57', f(0.35 + rnd() * 0.3)));
      }
    },
  },
  {
    key: 'hill', seed: 0x49010004, top: '#7d7852', bottom: '#615c3d',
    light: '#918b62', lightOp: 0.5, dark: '#514c34', darkOp: 0.4,
    details(rnd, out) {
      for (let i = 0; i < 12; i++) {
        const p = ringPoint(rnd);
        out.push(rock(p.x, p.y, 6 + rnd() * 9, '#5f5a3e', f(0.6 + rnd() * 0.3)));
      }
      for (let i = 0; i < 10; i++) {
        const p = ringPoint(rnd);
        out.push(tuft(p.x, p.y, '#6b6547', f(0.45 + rnd() * 0.3), 1 + rnd() * 0.3));
      }
      for (let i = 0; i < 8; i++) {
        const p = ringPoint(rnd);
        out.push(pebble(p.x, p.y, 1.5 + rnd() * 2.5, '#8f8a63', f(0.5 + rnd() * 0.3)));
      }
    },
  },
  {
    key: 'swamp', seed: 0x49010005, top: '#556a44', bottom: '#3c4f30',
    light: '#6d8452', lightOp: 0.45, dark: '#2c3d24', darkOp: 0.45,
    details(rnd, out) {
      for (let i = 0; i < 12; i++) {
        const p = ringPoint(rnd);
        out.push(reed(p.x, p.y, 14 + rnd() * 12, '#6f8a4e', f(0.5 + rnd() * 0.3)));
      }
      for (let i = 0; i < 8; i++) {
        const p = ringPoint(rnd);
        out.push(lily(p.x, p.y, 8 + rnd() * 6, f(0.55 + rnd() * 0.3)));
      }
      for (let i = 0; i < 8; i++) {
        const p = ringPoint(rnd);
        out.push(bubble(p.x, p.y, 1.5 + rnd() * 2, '#7d9a68', f(0.4 + rnd() * 0.3)));
      }
      for (let i = 0; i < 6; i++) {
        const p = ringPoint(rnd);
        out.push(tuft(p.x, p.y, '#3d5031', f(0.4 + rnd() * 0.25)));
      }
    },
  },
  {
    key: 'cave', seed: 0x49010006, top: '#6e655a', bottom: '#4b443b',
    light: '#837969', lightOp: 0.4, dark: '#362f29', darkOp: 0.5,
    details(rnd, out) {
      for (let i = 0; i < 10; i++) {
        out.push(stalactite(10 + rnd() * (SIZE - 40), 8 + rnd() * 10, 14 + rnd() * 22, '#574e44'));
      }
      for (let i = 0; i < 8; i++) {
        const p = ringPoint(rnd);
        out.push(stalagmite(p.x, 9 + rnd() * 10, 12 + rnd() * 20, '#514840'));
      }
      for (let i = 0; i < 8; i++) {
        const p = ringPoint(rnd);
        out.push(rock(p.x, p.y, 5 + rnd() * 8, '#4b423a', f(0.6 + rnd() * 0.3)));
      }
      for (let i = 0; i < 6; i++) {
        const p = ringPoint(rnd);
        out.push(pebble(p.x, p.y, 1.5 + rnd() * 2, '#837969', f(0.4 + rnd() * 0.3)));
      }
    },
  },
  {
    key: 'crypt', seed: 0x49010007, top: '#5a6170', bottom: '#3a404e',
    light: '#6d7586', lightOp: 0.4, dark: '#2a2f3c', darkOp: 0.5,
    details(rnd, out) {
      for (let i = 0; i < 10; i++) {
        const p = ringPoint(rnd);
        out.push(bone(p.x, p.y, 6 + rnd() * 5, '#cfd3da', f(0.55 + rnd() * 0.3)));
      }
      for (let i = 0; i < 8; i++) {
        const p = ringPoint(rnd);
        out.push(rune(p.x, p.y, 7 + rnd() * 5, '#8fa3c4', f(0.4 + rnd() * 0.25)));
      }
      for (let i = 0; i < 8; i++) {
        const p = ringPoint(rnd);
        out.push(rock(p.x, p.y, 5 + rnd() * 8, '#313644', f(0.6 + rnd() * 0.3)));
      }
      for (let i = 0; i < 6; i++) {
        const p = ringPoint(rnd);
        out.push(dot(p.x, p.y, 0.9 + rnd() * 1.2, '#6d7586', f(0.35 + rnd() * 0.3)));
      }
    },
  },
  {
    key: 'ruins', seed: 0x49010008, top: '#7a6f60', bottom: '#544c41',
    light: '#8f8574', lightOp: 0.4, dark: '#403a31', darkOp: 0.5,
    details(rnd, out) {
      for (let i = 0; i < 6; i++) {
        const p = ringPoint(rnd);
        out.push(column(p.x, p.y, 10 + rnd() * 5, 26 + rnd() * 18, rnd() < 0.7));
      }
      for (let i = 0; i < 10; i++) {
        const p = ringPoint(rnd);
        out.push(rubble(p.x, p.y, 4 + rnd() * 6, '#5b5344', f(0.6 + rnd() * 0.3)));
      }
      for (let i = 0; i < 8; i++) {
        const p = ringPoint(rnd);
        out.push(pebble(p.x, p.y, 1.5 + rnd() * 2.5, '#8f8574', f(0.45 + rnd() * 0.3)));
      }
      for (let i = 0; i < 6; i++) {
        const p = ringPoint(rnd);
        out.push(rock(p.x, p.y, 5 + rnd() * 7, '#453e35', f(0.55 + rnd() * 0.3)));
      }
    },
  },
  {
    key: 'drowned', seed: 0x49010009, top: '#2a5494', bottom: '#16295c',
    light: '#3a6cb0', lightOp: 0.5, dark: '#0f1f4a', darkOp: 0.5,
    details(rnd, out) {
      for (let i = 0; i < 16; i++) {
        const p = ringPoint(rnd);
        out.push(wave(p.x, p.y, 20 + rnd() * 20, '#4a7fc0', f(0.35 + rnd() * 0.25)));
      }
      for (let i = 0; i < 10; i++) {
        const p = ringPoint(rnd);
        out.push(bubble(p.x, p.y, 1.5 + rnd() * 2.5, '#7fa8d9', f(0.35 + rnd() * 0.3)));
      }
      for (let i = 0; i < 6; i++) {
        out.push(mist(rnd() * SIZE, rnd() * SIZE, 30 + rnd() * 30, 14 + rnd() * 10, '#3a6cb0', f(0.15 + rnd() * 0.1)));
      }
    },
  },
  {
    key: 'abyss', seed: 0x4901000a, top: '#171221', bottom: '#0a0713',
    light: '#241a33', lightOp: 0.6, dark: '#04020a', darkOp: 0.6,
    details(rnd, out) {
      for (let i = 0; i < 10; i++) {
        const p = ringPoint(rnd);
        out.push(glow(p.x, p.y, 1 + rnd() * 1.5, f(0.35 + rnd() * 0.25)));
      }
      for (let i = 0; i < 6; i++) {
        out.push(mist(rnd() * SIZE, rnd() * SIZE, 40 + rnd() * 40, 18 + rnd() * 14, '#241a33', f(0.3 + rnd() * 0.15)));
      }
      for (let i = 0; i < 6; i++) {
        const p = ringPoint(rnd);
        out.push(dot(p.x, p.y, 0.8 + rnd() * 0.8, '#4a2f6b', f(0.4 + rnd() * 0.3)));
      }
    },
  },
  {
    // Фолбэк: нейтральный тёмный в духе текущего сплошного #0d1117
    // + лёгкая виньетка и редкие тусклые точки.
    key: 'plain', seed: 0x4901000b, top: '#141922', bottom: '#0a0d12',
    light: '#1b2230', lightOp: 0.5, dark: '#04060a', darkOp: 0.5,
    details(rnd, out) {
      for (let i = 0; i < 10; i++) {
        const p = ringPoint(rnd);
        out.push(dot(p.x, p.y, 0.8 + rnd() * 0.8, '#2a3140', f(0.35 + rnd() * 0.2)));
      }
    },
  },
];

/** SVG-документ фона (чистая функция от bg-спецификации). */
function buildCombatBackground(bg) {
  const rnd = mulberry32(bg.seed);
  const L = [];
  L.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">`);
  L.push(`  <defs>`);
  L.push(`    <linearGradient id="gb" x1="0" y1="0" x2="0" y2="1">`);
  L.push(`      <stop offset="0" stop-color="${bg.top}"/>`);
  L.push(`      <stop offset="1" stop-color="${bg.bottom}"/>`);
  L.push(`    </linearGradient>`);
  L.push(`    <radialGradient id="gl">`);
  L.push(`      <stop offset="0" stop-color="${bg.light}" stop-opacity="${bg.lightOp}"/>`);
  L.push(`      <stop offset="1" stop-color="${bg.light}" stop-opacity="0"/>`);
  L.push(`    </radialGradient>`);
  L.push(`    <radialGradient id="gd">`);
  L.push(`      <stop offset="0" stop-color="${bg.dark}" stop-opacity="${bg.darkOp}"/>`);
  L.push(`      <stop offset="1" stop-color="${bg.dark}" stop-opacity="0"/>`);
  L.push(`    </radialGradient>`);
  // Виньетка: края чуть темнее — центр (зона юнитов) светлее и чище.
  L.push(`    <radialGradient id="gv" cx="0.5" cy="0.5" r="0.75">`);
  L.push(`      <stop offset="0.55" stop-color="#000000" stop-opacity="0"/>`);
  L.push(`      <stop offset="1" stop-color="#000000" stop-opacity="0.3"/>`);
  L.push(`    </radialGradient>`);
  L.push(`  </defs>`);
  L.push(`  <rect width="${SIZE}" height="${SIZE}" fill="url(#gb)"/>`);
  // Мягкая текстура: пятна света/тени (radialGradient, без периода —
  // не конфликтует с сеткой 48 px).
  L.push(`  <g>`);
  for (let i = 0; i < 8; i++) {
    const x = rnd() * SIZE, y = rnd() * SIZE;
    const rx = 40 + rnd() * 50, ry = rx * (0.5 + rnd() * 0.3);
    L.push(`    <ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="url(#gl)"/>`);
  }
  for (let i = 0; i < 8; i++) {
    const x = rnd() * SIZE, y = rnd() * SIZE;
    const rx = 40 + rnd() * 50, ry = rx * (0.5 + rnd() * 0.3);
    L.push(`    <ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="url(#gd)"/>`);
  }
  L.push(`  </g>`);
  // Жёсткие детали — только внешнее кольцо (центр — зона юнитов).
  const det = [];
  bg.details(rnd, det);
  if (det.length) {
    L.push(`  <g>`);
    for (const d of det) L.push(`    ${d}`);
    L.push(`  </g>`);
  }
  L.push(`  <rect width="${SIZE}" height="${SIZE}" fill="url(#gv)"/>`);
  L.push(`</svg>`);
  return L.join('\n') + '\n';
}

if (isMain) {
  const root = join(__dirname, '..');
  const dir = join(root, 'assets', 'combat', 'bg');
  mkdirSync(dir, { recursive: true });
  for (const bg of BACKGROUNDS) {
    const p = join(dir, bg.key + '.svg');
    writeFileSync(p, buildCombatBackground(bg));
    console.log(`Записано ${p}`);
  }
  console.log(`Всего: ${BACKGROUNDS.length} фонов (${SIZE}×${SIZE})`);
}

module.exports = { BACKGROUNDS, buildCombatBackground };

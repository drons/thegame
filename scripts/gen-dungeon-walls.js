'use strict';
// Генерирует 6 SVG «непроходимых» предметов стен подземелья
// (задача 000070) — assets/dungeon/walls/<key>.svg: rock_1, rock_2,
// column_1, column_2, stalactite_1, stalactite_2.
//
// Назначение: стены (клетки CELL_WALL) на «фасаде» (у стены есть
// floor-сосед по 8-соседству) рисуются предметом, а не сплошным
// тёмным фоном (отрисовка — задача 000066). Вид предмета и вариант
// _1/_2 на клетке — чистая функция wallObjFor (src/dungeon.js) от
// сида ФОРМЫ подземелья; набор видов на тип — каталог assets/dungeons
// (поле `предметы_стен`). Ключи WALLS здесь = объединение
// `предметы_стен` × варианты 1..2 по всем 5 типам (ровно 6 —
// закреплено тестом tests/sprites.test.js).
//
// Стиль — единый, в духе assets/combat/bg (задача 000049) и
// assets/tiles: вертикальный linearGradient из двух близких тонов +
// фасетки (свет/тень — дополнительные полигоны) + мелкие детали
// (трещины, крапинки, stroke-linecap round). Фон прозрачный: сквозь
// предмет видно тёмный фон подземелья.
//
// Геометрия: viewBox 0 0 64 64 — одна клетка подземелья.
//   rock_*       — приземлённый объём в нижней половине клетки
//                  (+ тень на «полу»);
//   column_*     — колонна на всю высоту клетки (базис — столб —
//                  капитель);
//   stalactite_* — свисает с ВЕРХНЕГО края клетки (кончик вниз).
//
// Генерация полностью детерминирована: фиксированный сид на предмет,
// стабильный порядок элементов и атрибутов, округление до 0.1 px,
// без дат — повторный запуск даёт byte-identical файлы
// (проверка: второй запуск → git diff пуст).
//
// Запуск: node scripts/gen-dungeon-walls.js  (или npm run gen:dungeonwalls)

const { writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

const isMain = require.main === module;

const SIZE = 64; // одна клетка подземелья

/** Детерминированный PRNG (mulberry32) — один поток на предмет. */
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

/** Тень на «полу» под объёмным предметом. */
function shadow(x, y, rx, ry) {
  return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="url(#ws)"/>`;
}

/** Крапинка камня. */
function speck(x, y, r, c, o) {
  return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${c}" opacity="${f(o)}"/>`;
}

/** Трещина — короткая ломаная. */
function crack(x, y, l1, l2, o = 0.65) {
  return `<path d="M${f(x)} ${f(y)} l${f(l1)} ${f(l1 * 0.6)} l${f(l2)} ${f(l2 * 0.5)}" ` +
    `stroke="#332c25" stroke-width="1.1" fill="none" stroke-linecap="round" opacity="${f(o)}"/>`;
}

/** Приземлённый валун: многоугольник с фасетками.
 * @returns {string[]} элементы (тень + полигон + фасетки + крапинки)
 */
function boulder(rnd, cx, cy, r, op = 1) {
  const L = [];
  const n = 9;
  const offs = [];
  for (let i = 0; i < n; i++) offs.push((rnd() - 0.5) * 0.3);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + offs[i] - Math.PI / 2;
    const rr = r * (0.85 + rnd() * 0.3);
    let py = Math.sin(a) * rr;
    if (py > 0) py *= 0.6; // нижняя половина приплющена — валун «на полу»
    pts.push([cx + Math.cos(a) * rr, Math.min(cy + py, 55)]);
  }
  L.push(shadow(cx, 55, r * 1.15, 3.6));
  const poly = pts.map((p) => `${f(p[0])},${f(p[1])}`).join(' ');
  L.push(`<polygon points="${poly}" fill="url(#wg)" opacity="${f(op)}"/>`);
  // Светлая фасетка (сверху-слева) и тёмная (снизу-справа).
  const facet = (i, j, k, c, o) =>
    `<polygon points="${f(pts[i][0])},${f(pts[i][1])} ${f(pts[j][0])},${f(pts[j][1])} ${f(pts[k][0])},${f(pts[k][1])}" fill="${c}" opacity="${f(o)}"/>`;
  L.push(facet(0, 2, 4, '#948a7b', 0.35));
  L.push(facet(4, 6, 7, '#332c25', 0.35));
  L.push(crack(pts[3][0], pts[3][1], 3 + rnd() * 3, 2 + rnd() * 2));
  for (let i = 0; i < 6; i++) {
    const a = rnd() * Math.PI * 2, rr = rnd() * r * 0.55;
    L.push(speck(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.55,
      0.5 + rnd() * 0.9, '#8d8477', 0.25 + rnd() * 0.3));
  }
  return L;
}

// --- Состав 6 предметов ---
//
// Палитра — каменные тона подземелий (родство с палитрами фонов
// cave/ruins из assets/combat/bg, задача 000049): два близких оттенка
// в градиенте, фасетки светлее/темнее той же гаммы.

const WALLS = [
  {
    key: 'rock_1', seed: 0x49770001, top: '#7d7468', bottom: '#4e463d',
    build(rnd) {
      const L = [];
      L.push(...boulder(rnd, 30 + rnd() * 5, 40 + rnd() * 3, 17 + rnd() * 3));
      return L;
    },
  },
  {
    key: 'rock_2', seed: 0x49770002, top: '#776e62', bottom: '#4a423a',
    build(rnd) {
      const L = [];
      // Два валуна: крупный сзади, мелкий спереди (перекрыть).
      L.push(...boulder(rnd, 23 + rnd() * 4, 40 + rnd() * 2, 14 + rnd() * 2, 0.95));
      L.push(...boulder(rnd, 44 + rnd() * 3, 46 + rnd() * 2, 9 + rnd() * 2));
      L.push(speck(16 + rnd() * 30, 53 + rnd() * 3, 0.7 + rnd() * 0.8,
        '#8d8477', 0.3 + rnd() * 0.25));
      return L;
    },
  },
  {
    key: 'column_1', seed: 0x49770003, top: '#7a7164', bottom: '#4c453b',
    build(rnd) {
      const L = [];
      const w = 18, x = 32 - w / 2;
      L.push(shadow(32, 60, 18, 3.4));
      // Базис (цоколь): две ступени.
      L.push(`<rect x="${f(32 - 15)}" y="54" width="30" height="7" fill="#4d463c"/>`);
      L.push(`<rect x="${f(32 - 12.5)}" y="51" width="25" height="3" fill="#5b5348"/>`);
      // Шафт — на всю высоту (между цоколем и капителью).
      L.push(`<rect x="${f(x)}" y="11" width="${w}" height="40" fill="url(#wg)"/>`);
      // Вертикальные желобки.
      L.push(`<path d="M${f(x + w / 3)} 13 v36 M${f(x + 2 * w / 3)} 13 v36" ` +
        `stroke="#4a4238" stroke-width="1.2" opacity="0.65" fill="none"/>`);
      // Светлая грань слева.
      L.push(`<rect x="${f(x + 1.5)}" y="11" width="2.5" height="40" fill="#948a7b" opacity="0.4"/>`);
      // Капитель: абака + эхин.
      L.push(`<rect x="${f(32 - 13)}" y="7" width="26" height="4" fill="#5b5348"/>`);
      L.push(`<rect x="${f(32 - 10.5)}" y="3.5" width="21" height="3.5" fill="#6a6154"/>`);
      L.push(crack(x + w * (0.3 + rnd() * 0.4), 20 + rnd() * 18, 2 + rnd() * 2, 2 + rnd() * 2));
      for (let i = 0; i < 5; i++) {
        L.push(speck(x + rnd() * w, 13 + rnd() * 36, 0.5 + rnd() * 0.8,
          '#8d8477', 0.25 + rnd() * 0.3));
      }
      return L;
    },
  },
  {
    key: 'column_2', seed: 0x49770004, top: '#837b6e', bottom: '#514a40',
    build(rnd) {
      const L = [];
      const w = 14, x = 32 - w / 2;
      L.push(shadow(32, 60, 16, 3.2));
      // Базис: одна широкая ступень (вариант формы).
      L.push(`<rect x="${f(32 - 14)}" y="55" width="28" height="6" fill="#4d463c"/>`);
      L.push(`<polygon points="${f(32 - 11)},55 ${f(32 + 11)},55 ${f(32 + 9)},52 ${f(32 - 9)},52" fill="#5b5348"/>`);
      // Шафт — тоньше, на всю высоту.
      L.push(`<rect x="${f(x)}" y="10" width="${w}" height="42" fill="url(#wg)"/>`);
      // Три желобка.
      L.push(`<path d="M${f(x + w / 4)} 12 v38 M${f(x + w / 2)} 12 v38 M${f(x + 3 * w / 4)} 12 v38" ` +
        `stroke="#4a4238" stroke-width="1.1" opacity="0.6" fill="none"/>`);
      L.push(`<rect x="${f(x + 1.5)}" y="10" width="2.2" height="42" fill="#948a7b" opacity="0.4"/>`);
      // Капитель: трапеция (вариант формы).
      L.push(`<polygon points="${f(32 - 11)},10 ${f(32 + 11)},10 ${f(32 + 8)},5 ${f(32 - 8)},5" fill="#5b5348"/>`);
      L.push(`<rect x="${f(32 - 8)}" y="2" width="16" height="3" fill="#6a6154"/>`);
      L.push(crack(x + w * (0.25 + rnd() * 0.5), 18 + rnd() * 22, 2 + rnd() * 2, 2 + rnd() * 2));
      for (let i = 0; i < 5; i++) {
        L.push(speck(x + rnd() * w, 12 + rnd() * 38, 0.5 + rnd() * 0.8,
          '#948a7b', 0.25 + rnd() * 0.3));
      }
      return L;
    },
  },
  {
    key: 'stalactite_1', seed: 0x49770005, top: '#7d7468', bottom: '#4e463d',
    build(rnd) {
      const L = [];
      const cx = 30 + rnd() * 5;
      const tip = 42 + rnd() * 8; // кончик (вниз)
      const base = 13 + rnd() * 4; // полуширина у потолка
      // Главный свис с верхнего края: две половины (свет/тень).
      L.push(`<polygon points="${f(cx - base)},0 ${f(cx)},0 ${f(cx)},${f(tip)}" fill="url(#wg)"/>`);
      L.push(`<polygon points="${f(cx)},0 ${f(cx + base * 0.8)},0 ${f(cx)},${f(tip)}" fill="#453d34" opacity="0.9"/>`);
      // Боковые свисы.
      L.push(`<polygon points="${f(cx - base - 8)},0 ${f(cx - base - 2)},0 ${f(cx - base - 5)},${f(15 + rnd() * 8)}" fill="#6d6458" opacity="0.85"/>`);
      L.push(`<polygon points="${f(cx + base + 2)},0 ${f(cx + base + 9)},0 ${f(cx + base + 5)},${f(19 + rnd() * 10)}" fill="#57503f" opacity="0.85"/>`);
      // Фасетная грань.
      L.push(`<path d="M${f(cx - 1)} 2 l0 ${f(tip - 8)}" stroke="#3a332b" stroke-width="1.1" opacity="0.6" fill="none" stroke-linecap="round"/>`);
      for (let i = 0; i < 5; i++) {
        const t = rnd();
        L.push(speck(cx - base * (1 - t) * 0.8 + rnd() * 3, t * tip * 0.7,
          0.5 + rnd() * 0.8, '#948a7b', 0.25 + rnd() * 0.3));
      }
      return L;
    },
  },
  {
    key: 'stalactite_2', seed: 0x49770006, top: '#776e62', bottom: '#4a423a',
    build(rnd) {
      const L = [];
      const l = 20 + rnd() * 4, r = 42 + rnd() * 4;
      const tipx = 30 + rnd() * 5, tipy = 46 + rnd() * 10;
      // Изогнутый свис с верхнего края (вариант формы).
      L.push(`<path d="M${f(l)} 0 L${f(r)} 0 Q${f(r - 6)} ${f(tipy * 0.45)} ${f(tipx)} ${f(tipy)} ` +
        `Q${f(l + 3)} ${f(tipy * 0.4)} ${f(l)} 0 z" fill="url(#wg)"/>`);
      // Теневая половина.
      const mid = (l + r) / 2;
      L.push(`<path d="M${f(mid)} 0 L${f(r)} 0 Q${f(r - 6)} ${f(tipy * 0.45)} ${f(tipx)} ${f(tipy)} ` +
        `Q${f(mid + 1)} ${f(tipy * 0.42)} ${f(mid)} 0 z" fill="#453d34" opacity="0.55"/>`);
      // Мелкий боковой свис.
      L.push(`<polygon points="${f(l - 9)},0 ${f(l - 3)},0 ${f(l - 6)},${f(16 + rnd() * 8)}" fill="#6d6458" opacity="0.85"/>`);
      L.push(`<polygon points="${f(r + 2)},0 ${f(r + 7)},0 ${f(r + 4)},${f(13 + rnd() * 7)}" fill="#57503f" opacity="0.85"/>`);
      for (let i = 0; i < 5; i++) {
        const t = rnd();
        L.push(speck(mid - (r - l) * (1 - t) * 0.4, t * tipy * 0.6,
          0.5 + rnd() * 0.8, '#948a7b', 0.25 + rnd() * 0.3));
      }
      return L;
    },
  },
];

/** SVG-документ предмета (чистая функция от wall-спецификации). */
function buildWall(wall) {
  const rnd = mulberry32(wall.seed);
  const L = [];
  L.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">`);
  L.push(`  <defs>`);
  L.push(`    <linearGradient id="wg" x1="0" y1="0" x2="0" y2="1">`);
  L.push(`      <stop offset="0" stop-color="${wall.top}"/>`);
  L.push(`      <stop offset="1" stop-color="${wall.bottom}"/>`);
  L.push(`    </linearGradient>`);
  L.push(`    <radialGradient id="ws">`);
  L.push(`      <stop offset="0" stop-color="#000000" stop-opacity="0.45"/>`);
  L.push(`      <stop offset="1" stop-color="#000000" stop-opacity="0"/>`);
  L.push(`    </radialGradient>`);
  L.push(`  </defs>`);
  L.push(`  <g>`);
  for (const s of wall.build(rnd)) L.push(`    ${s}`);
  L.push(`  </g>`);
  L.push(`</svg>`);
  return L.join('\n') + '\n';
}

if (isMain) {
  const root = join(__dirname, '..');
  const dir = join(root, 'assets', 'dungeon', 'walls');
  mkdirSync(dir, { recursive: true });
  for (const w of WALLS) {
    const p = join(dir, w.key + '.svg');
    writeFileSync(p, buildWall(w));
    console.log(`Записано ${p}`);
  }
  console.log(`Всего: ${WALLS.length} предметов (${SIZE}×${SIZE})`);
}

module.exports = { WALLS, buildWall };

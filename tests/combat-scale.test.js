// Боевой масштаб (задача 000151): чистая функция
// «размер canvas/масштаб → размер отрисовки» — src/combat-scale.js.
//
// ТЗ: «Для экрана боя добавить рендер текстур персонажей и мобов в
// соответствии с текущим масштабом отображения» — красное ТЗ: чистая
// функция «размер canvas/масштаб → размер отрисовки» (прямой
// node-require, БЕЗ vm-песочницы — UMD-модуль) + vm-e2e размера
// отрисованного спрайта (tests/combat-ui.test.js, R1-R3/A1-A3).
//
// Контракт (memory/000151-combat-scale.md):
//   * Game.combatScale = { MAX_SCALE, computeBacking } — НОВЫЙ UMD-модуль
//     (паттерн cities.js/building-effects.js): node — module.exports,
//     браузер — root.Game = Object.assign({}, G0, { combatScale: … });
//     чистая загрузка: 0 DOM/require/чтения Game;
//   * computeBacking(baseW, baseH, dispW, dispH, dpr) → {w, h, sx, sy}:
//     sx = min(MAX_SCALE, max(1, dispW·dpr/baseW)), sy симметрично;
//     w = round(baseW·sx), h = round(baseH·sy) — ЦЕЛЫЕ;
//     НЕДАУНСКЕЙЛ (max от 1) — маленькие экраны/мобайл не трогаем;
//     фолбэки: base → 336, disp (на оси) → 1:1, dpr → 1;
//   * MAX_SCALE = 8 — GOLDEN-ПИН (P4): смена = пересчёт пинов +
//     пометка номера задачи в memory/000151-combat-scale.md.
//
// КРАСНЫЕ (TDD, P1-P7): падают, потому что src/combat-scale.js НЕ
// СУЩЕСТВУЕТ (осмысленная причина — отсутствие модуля, не синтаксис):
// чтение ленивое, existsSync-гард (паттерн 000091) → assert.fail
// «src/combat-scale.js не существует (задача 000151)» — каждый тест
// падает отдельно осмысленным сообщением (НЕ ENOENT-краш всего файла).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SCALE_PATH = path.join(__dirname, '..', 'src', 'combat-scale.js');

// Ленивое чтение (красная фаза: файла нет — осмысленный assert.fail;
// зелёная: require UMD — node-ветка module.exports).
function loadCombatScale() {
  if (!fs.existsSync(SCALE_PATH)) {
    assert.fail('src/combat-scale.js не существует (задача 000151)');
  }
  return require(SCALE_PATH);
}

test('боевой масштаб: P1 — 1:1 (base = display) → {w:336, h:336, sx:1, sy:1}', () => {
  const mod = loadCombatScale();
  assert.equal(typeof mod.computeBacking, 'function',
    'computeBacking — функция (UMD: node-ветка module.exports)');
  // Поле 7×7: база 336×336 (CELL 48), отображение 336, dpr 1 —
  // поведение ДО 000151 (бэкинг 336, бит-в-бит).
  assert.deepEqual(
    mod.computeBacking(336, 336, 336, 336, 1),
    { w: 336, h: 336, sx: 1, sy: 1 },
    '1:1 — без масштаба');
});

test('боевой масштаб: P2 — display ×2 (672) → бэкинг 672×672, sx = sy = 2', () => {
  const mod = loadCombatScale();
  // Десктоп/планшет dpr 1: отображение 672 CSS px = ×2 от базы 336.
  assert.deepEqual(
    mod.computeBacking(336, 336, 672, 672, 1),
    { w: 672, h: 672, sx: 2, sy: 2 },
    '×2 — бэкинг = отображение точно (кап не срабатывает)');
});

test('боевой масштаб: P3 — НЕДАУНСКЕЙЛ: display меньше поля (200) → 336, 1:1', () => {
  const mod = loadCombatScale();
  // Маленькие экраны/мобайл (display 308-396 < 336·…): даунскейл —
  // та же мыльность в обратную сторону; бэкинг остаётся базой,
  // браузер сам уменьшит отображение (ТЗ-контекст: «не ломать
  // маленькие экраны/мобайл»).
  assert.deepEqual(
    mod.computeBacking(336, 336, 200, 200, 1),
    { w: 336, h: 336, sx: 1, sy: 1 },
    'max от 1: даунскейла НЕТ — бэкинг = база 336');
});

test('боевой масштаб: P4 — КАП MAX_SCALE = 8: display 5000 → бэкинг 2688 (336·8)', () => {
  const mod = loadCombatScale();
  // GOLDEN-ПИН: MAX_SCALE — экспортированная константа (смена =
  // пересчёт пинов + пометка номера задачи в memory). 5K+ (5000) —
  // без капа бэкинг 5000² px ≈ 100 МБ RGBA; с капом — 2688².
  assert.equal(mod.MAX_SCALE, 8, 'MAX_SCALE = 8 (golden-пин)');
  assert.deepEqual(
    mod.computeBacking(336, 336, 5000, 5000, 1),
    { w: 2688, h: 2688, sx: 8, sy: 8 },
    'кап: sx = min(8, 5000/336 = 14.9) = 8 → 336·8 = 2688');
});

test('боевой масштаб: P5 — dpr: display = база при dpr 2 (Retina) → бэкинг 672, sx = 2', () => {
  const mod = loadCombatScale();
  // Цель ТЗ «десктоп, планшет» — в основном Retina (dpr 2): без dpr
  // бэкинг = CSS-размер и упскайлится ещё ×2 — мыльность сохраняется.
  assert.deepEqual(
    mod.computeBacking(336, 336, 336, 336, 2),
    { w: 672, h: 672, sx: 2, sy: 2 },
    'dpr входит в формулу: s = 336·2/336 = 2');
});

test('боевой масштаб: P6 — фолбэки (disp undefined/0/NaN → 1:1; dpr undefined/0/NaN → ×1) + оси независимы', () => {
  const mod = loadCombatScale();
  const F = { w: 336, h: 336, sx: 1, sy: 1 };
  // display без размеров (lenient-стабы main-visuals/companions-
  // cycle/dungeon-vision: rect {left:0, top:0} → r.width undefined).
  assert.deepEqual(
    mod.computeBacking(336, 336, undefined, undefined, 1), F,
    'disp undefined → 1:1 (фолбэк lenient-стабов)');
  assert.deepEqual(
    mod.computeBacking(336, 336, 0, 0, 1), F,
    'disp 0 (нулевой rect, 000124) → 1:1');
  assert.deepEqual(
    mod.computeBacking(336, 336, NaN, NaN, 1), F,
    'disp NaN → 1:1');
  // dpr — typeof-гард: vm-песочница (отсутствует) и патология.
  assert.deepEqual(
    mod.computeBacking(336, 336, 672, 672, undefined), F,
    'dpr undefined → ×1 (vm-песочница)');
  assert.deepEqual(
    mod.computeBacking(336, 336, 672, 672, 0), F,
    'dpr 0 → ×1');
  assert.deepEqual(
    mod.computeBacking(336, 336, 672, 672, NaN), F,
    'dpr NaN → ×1');
  // Фолбэк — ПО ОСИ: 672×336 → sx 2, sy 1 (CSS aspect-ratio 1/1
  // делает это вырожденным, формула честная).
  assert.deepEqual(
    mod.computeBacking(336, 336, 672, 336, 1),
    { w: 672, h: 336, sx: 2, sy: 1 },
    'оси независимы: mixed 672×336 → sx 2, sy 1');
});

test('боевой масштаб: P7 — w/h ЦЕЛЫЕ (round), при s = 1 ровно база', () => {
  const mod = loadCombatScale();
  // canvas.width — unsigned long: дробный бэкинг невозможен.
  for (const [bW, bH, dW, dH, dpr] of [
    [336, 336, 336, 336, 1.5],   // s 1.5 → 504
    [336, 336, 700, 336, 1],     // s 2.083… → round
    [336, 336, 336, 700, 1],     // ось h
    [100, 100, 336, 336, 2],     // другая база
    [336, 336, 5000, 5000, 1],   // кап
  ]) {
    const r = mod.computeBacking(bW, bH, dW, dH, dpr);
    assert.ok(Number.isInteger(r.w),
      `w целое для (${bW},${bH},${dW},${dH},${dpr}): ` + r.w);
    assert.ok(Number.isInteger(r.h),
      `h целое для (${bW},${bH},${dW},${dH},${dpr}): ` + r.h);
  }
  // При s = 1 (1:1 и НЕДАУНСКЕЙЛ) — ровно база (не round базы
  // от дробного s: база не «плывёт»).
  assert.deepEqual(
    mod.computeBacking(336, 336, 336, 336, 1),
    { w: 336, h: 336, sx: 1, sy: 1 }, 's=1 → ровно 336');
  assert.deepEqual(
    mod.computeBacking(100, 100, 50, 50, 1),
    { w: 100, h: 100, sx: 1, sy: 1 }, 's=1 (недаунскейл) → ровно база');
});

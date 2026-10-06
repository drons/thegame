// Боевой масштаб (задача 000151): чистая функция
// «размер canvas/масштаб → размер отрисовки». Бэкинг боевого canvas
// следует за ТЕКУЩИМ масштабом отображения: бэкинг = размер
// отображения × dpr (кап MAX_SCALE) — спрайты (Флогистон, мобы, фон)
// рисуются в логических единицах (клетки × CELL) через
// g2.setTransform(sx, 0, 0, sy, 0, 0) в combat-ui.js, движок растрит
// SVG в drawImage в целевом device-размере → резкость на больших
// экранах (десктоп/планшет, цель ТЗ).
//
// Чистый модуль: ноль зависимостей, ноль DOM, ноль require, ноль
// чтения Game при загрузке (UMD-паттерн cities.js /
// building-effects.js; взаимных require нет — 000053; G0 — только
// база Object.assign, 000038). Тесты в node — tests/combat-scale.
// test.js (P1-P7, прямой require); vm-песочницы — браузерная ветка
// (root.Game = Object.assign({}, G0, { combatScale })).
//
// Контракт (memory/000151-combat-scale.md, D1-D16):
//   * MAX_SCALE = 8 — GOLDEN-ПИН (P4): смена = пересчёт пинов +
//     пометка номера задачи в memory-файле. Бэкинг ≤ 336·8 = 2688 px
//     (~29 МБ RGBA) — кап срабатывает только на дисплеях с
//     отображение·dpr > 2688 (5K+); ниже капа бэкинг = отображение
//     ТОЧНО;
//   * baseW/baseH — логическое поле (c.width·CELL; 336×336 при 7×7);
//     не-число/NaN/≤0 → 336 (ветка защитная: структурно
//     c.width·CELL ≥ 48; без гарда NaN-бэкинг = canvas 0);
//   * dispW/dispH — ТЕКУЩИЙ CSS-размер (getBoundingClientRect);
//     не-число/NaN/≤0/undefined → 1:1 на ЭТОЙ оси (фолбэк lenient-
//     стабов, rect без width/height, и нулевого rect);
//   * dpr — window.devicePixelRatio; не-число/NaN/≤0/undefined → 1:1
//     ЦЕЛИКОМ (безопасный фолбэк, P6; vm-песочница сюда не попадает —
//     typeof-гард measureBacking передаёт 1);
//   * sx = min(MAX_SCALE, max(1, dispW·dpr/baseW)), sy симметрично;
//     **НЕДАУНСКЕЙЛ (max от 1) ОБЯЗАТЕЛЕН** — маленькие экраны/мобайл
//     не трогаем (даунскейл = та же мыльность в обратную сторону);
//   * w = round(baseW·sx), h = round(baseH·sy) — ЦЕЛЫЕ
//     (canvas.width — unsigned long);
//   * НОЛЬ побочных эффектов, НОЛЬ Math.random/Date — детерминирована.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const G0 = typeof root.Game === 'object' ? root.Game : {};
    root.Game = Object.assign({}, G0, { combatScale: factory() });
  }
})(typeof globalThis !== 'undefined' ? globalThis : self,
function () {

  // Кап масштаба бэкинга (GOLDEN-ПИН, P4): см. заголовок.
  const MAX_SCALE = 8;

  // Фолбэк базы: поле 7×7 × CELL 48 = 336.
  const BASE = 336;

  // Число или фолбэк: не-число/NaN/≤0 → фолбэк.
  function num(v, fallback) {
    return (typeof v === 'number' && isFinite(v) && v > 0)
      ? v : fallback;
  }

  // Масштаб ОСИ: min(MAX_SCALE, max(1, disp·dpr/base)).
  // НЕДАУНСКЕЙЛ (max от 1): отображение меньше поля — бэкинг = база
  // (маленькие экраны/мобайл — поведение до 000151). Недействительный
  // disp (lenient-стабы: r.width undefined; нулевой rect) → 1:1.
  function axisScale(base, disp, dpr) {
    if (!(typeof disp === 'number' && isFinite(disp) && disp > 0)) {
      return 1;
    }
    return Math.min(MAX_SCALE, Math.max(1, disp * dpr / base));
  }

  /**
   * Бэкинг боевого canvas под текущий масштаб отображения.
   * @param {number} baseW логическое поле, px (c.width·CELL)
   * @param {number} baseH логическое поле, px (c.height·CELL)
   * @param {number} dispW текущий CSS-размер отображения, px
   *   (canvas.getBoundingClientRect().width)
   * @param {number} dispH текущий CSS-размер отображения, px
   * @param {number} dpr window.devicePixelRatio (в vm — отсутствует → 1)
   * @returns {{w:number, h:number, sx:number, sy:number}} w/h —
   *   ЦЕЛОЧИСЛЕННЫЙ бэкинг canvas (canvas.width/height); sx/sy —
   *   масштаб осей (render — g2.setTransform, логические единицы).
   */
  function computeBacking(baseW, baseH, dispW, dispH, dpr) {
    const bw = num(baseW, BASE);
    const bh = num(baseH, BASE);
    // dpr — НЕДЕЙСТВИТЕЛЕН (undefined/NaN/≤0 — патология; vm-песочница
    // сюда НЕ попадает: typeof-гард measureBacking передаёт 1) →
    // 1:1 ЦЕЛИКОМ (безопасный фолбэк = поведение ДО 000151, P6).
    if (!(typeof dpr === 'number' && isFinite(dpr) && dpr > 0)) {
      return { w: bw, h: bh, sx: 1, sy: 1 };
    }
    const sx = axisScale(bw, dispW, dpr);
    const sy = axisScale(bh, dispH, dpr);
    return {
      w: Math.round(bw * sx),
      h: Math.round(bh * sy),
      sx: sx,
      sy: sy,
    };
  }

  return { MAX_SCALE, computeBacking };
});

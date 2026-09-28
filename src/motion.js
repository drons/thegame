// Плавное передвижение (задача 000033): чистое ядро.
//
// Почему оно нужно: раньше tryMove() в main.js прыжком менял player.x/y
// (целочисленный тайл) каждые 140 мс, а камера между шагами ехала плавно
// (lerp 0.2/кадр) — мир ехал, персонаж телепортировался. Решение:
//   * глейд prev→next за интервал шага с easing'ом (createMover) —
//     рендер получает ДРОБНУЮ позицию между тайлами;
//   * fps-независимое экспоненциальное сглаживание камеры (cameraStep +
//     CAM_TAU_MS) — старое 0.2/кадр ловило цель при 144 Гц в ~2.4 раза
//     быстрее, чем при 60 Гц;
//   * интервал шага с учётом «Ловкого шага» (moveIntervalMs, SPEC:
//     Ловкость → «Скорость перемещения по карте»): навык только
//     ускоряет — множитель всегда >= 1, нижний кламп — MIN_MOVE_INTERVAL_MS;
//   * окно анимации walk/idle от интервала шага (walkWindowMs,
//     задача 000063): фикс-окно 260 мс подобрано под старый интервал
//     140 мс и замиряло героя при новом базовом 420 мс.
//
// Чистый модуль без зависимостей — тестируется в node
// (tests/motion.test.js). Правки main.js (DOM/WebGL-клей) — в той же
// задаче; в node не тестируются (устоявшийся паттерн проекта).
//
// Униформный модуль: в браузере — globalThis.Game, в node — require().

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Game = Object.assign({}, root.Game, factory());
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {

  'use strict';

  /**
   * Кламп числа в [0, 1]. Мусорное время (NaN) → 0 (начало глейда),
   * +∞ → 1, −∞ → 0. Чистая функция.
   * @param {number} t
   * @returns {number}
   */
  function clamp01(t) {
    const n = Number(t);
    if (Number.isNaN(n)) return 0;
    if (n <= 0) return 0;
    if (n >= 1) return 1;
    return n;
  }

  /**
   * Линейная интерполяция a → b в точке t (t НЕ клампится — кламп на
   * стороне lerpPos; «сырой» lerp нужен для точных формул).
   * @param {number} a
   * @param {number} b
   * @param {number} t
   * @returns {number}
   */
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /**
   * Интерполяция двух точек {x, y} в точке t (t клампится в [0,1]:
   * вне отрезка — не вылетает за него). Всегда новый объект.
   * @param {{x: number, y: number}} prev
   * @param {{x: number, y: number}} next
   * @param {number} t
   * @returns {{x: number, y: number}}
   */
  function lerpPos(prev, next, t) {
    const tt = clamp01(t);
    return { x: lerp(prev.x, next.x, tt), y: lerp(prev.y, next.y, tt) };
  }

  /**
   * Плавный старт/финиш глейда: f(t) = t²(3−2t) (smoothstep), t клампится
   * в [0,1]. Симметрична: f(t) = 1 − f(1−t), f(0.5) = 0.5.
   * @param {number} t
   * @returns {number}
   */
  function easeInOut(t) {
    const tt = clamp01(t);
    return tt * tt * (3 - 2 * tt);
  }

  /**
   * Прогресс шага: 0 до старта, линейный рост, 1 на конце и за ним
   * (кламп — без пересчёта в >1 и без отката). interval <= 0 (или нечисло)
   * — шаг мгновенный (1). Мусорное время (NaN) → 0.
   * @param {number} nowMs текущее время
   * @param {number} startMs время начала шага
   * @param {number} intervalMs длительность шага
   * @returns {number} p ∈ [0, 1]
   */
  function stepProgress(nowMs, startMs, intervalMs) {
    const iv = Number(intervalMs);
    if (!Number.isFinite(iv) || iv <= 0) return 1;
    const p = (nowMs - startMs) / iv;
    if (!Number.isFinite(p)) return 0; // NaN время — начало глейда
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    return p;
  }

  // Время сглаживания камеры. Выбрано так, что при 60 fps коэффициент
  // за кадр = 1 − exp(−(1000/60)/tau) ≈ 0.2 — ровно ощущение текущего
  // lerp 0.2/кадр (и устоявшееся чувство игры), но теперь за РЕАЛЬНОЕ
  // время, а не за кадр: 144 Гц больше не «догоняет» быстрее.
  const CAM_TAU_MS = 1000 / 60 / -Math.log(0.8); // ≈ 74.7 мс

  /**
   * Один шаг экспоненциального сглаживания cur → target за dt:
   *   cur + (target − cur) * (1 − exp(−dt/tau)).
   * Свойства (все покрыты тестами):
   *   * dt <= 0 — без движения; cur == target — без движения;
   *   * движение строго к цели, перелёта нет (коэффициент ∈ (0,1));
   *   * независимость от fps: два кадра по 8 мс = один кадр 16 мс
   *     (безпамятность экспоненты);
   *   * tau <= 0 (или нечисло) — мгновенный снап в target.
   * @param {number} cur текущее значение
   * @param {number} target цель
   * @param {number} dtMs длительность кадра
   * @param {number} tauMs время сглаживания
   * @returns {number}
   */
  function cameraStep(cur, target, dtMs, tauMs) {
    if (!(dtMs > 0)) return cur; // dt<=0 или NaN — без движения
    if (cur === target) return cur;
    if (!(tauMs > 0)) return target; // мгновенный снап
    const k = 1 - Math.exp(-dtMs / tauMs);
    return cur + (target - cur) * k;
  }

  // Нижний кламп интервала шага: даже с бесконечно высоким «Ловким шагом»
  // шаг короче 60 мс (≈16 кадров/с) не делается — не мельтешит.
  const MIN_MOVE_INTERVAL_MS = 60;

  /**
   * Интервал шага с учётом «Ловкого шага» (derived().moveSpeedMult,
   * player.js; SPEC «Скорость перемещения по карте»). Навык только
   * ускоряет: множитель < 1 (или нечисло) игнорируется → база.
   * Результат >= MIN_MOVE_INTERVAL_MS, но кламп НЕ удлиняет шаг сверх
   * базы (короткая база — как есть). Невалидная база — как есть
   * (модуль не выдумывает числа).
   * @param {number} baseMs базовый интервал шага
   * @param {number} speedMult moveSpeedMult (>= 1)
   * @returns {number}
   */
  function moveIntervalMs(baseMs, speedMult) {
    const m = Number(speedMult);
    if (!Number.isFinite(m) || m < 1) return baseMs;
    const base = Number(baseMs);
    const raw = base / m;
    if (!Number.isFinite(base) || base <= 0) return raw;
    return Math.min(Math.max(MIN_MOVE_INTERVAL_MS, raw), base);
  }

  // Минимум окна анимации walk/idle (задача 000063): старое фикс-окно
  // 260 мс подобрано под старый интервал шага 140 мс (см.
  // memory/000033-smooth-movement.md). Окно не сжимается ниже —
  // ощущение анимации сохранено.
  const WALK_WINDOW_MIN_MS = 260;

  /**
   * Окно анимации walk/idle от интервала шага (задача 000063):
   *   window = max(WALK_WINDOW_MIN_MS, stepMs).
   * Окно не короче старого 260 мс (старое ощущение сохранено) и не
   * короче самого шага: при базовом интервале 420 мс (скорость ×1/3,
   * задача 000063) фикс-окно 260 дало бы 260 мс walk + 160 мс ЗАМИРАНИЯ
   * в idle за цикл при удержании клавиш — рваная ходьба, откат
   * ощущения, которое дала 000033. Мусорный интервал (NaN/нечисло),
   * <= 0 — старое окно 260 мс, без выброса.
   * @param {number} stepMs текущий интервал шага
   * @returns {number} >= WALK_WINDOW_MIN_MS
   */
  function walkWindowMs(stepMs) {
    const s = Number(stepMs);
    if (!Number.isFinite(s) || s <= 0) return WALK_WINDOW_MIN_MS;
    return Math.max(WALK_WINDOW_MIN_MS, s);
  }

  /**
   * «Мувёр» — маленькая машина состояния для плавного передвижения:
   * глейд prev→next за интервал шага (с easing'ом) либо снап (телепорт).
   * Позиция — в тайловых координатах мира (ЦЕЛЫЕ точки от/до); центр
   * тайла (+0.5) рендер добавляет сам.
   *
   *   const m = createMover({ x, y, intervalMs });
   *   m.step(from, to, nowMs[, intervalMs]); // начать глейд (interval —
   *                                          // на шаг: динамическая
   *                                          // скорость «Ловкого шага»)
   *   m.position(nowMs); // {x, y} ДРОБНАЯ: до шага — старт, в глейде —
   *                      // lerp(easeInOut(p)), после — цель (без отката)
   *   m.teleport(x, y);  // мгновенный снап, отменяет текущий глейд
   *                      // (побег/смерть из боя, сейв, спавн)
   *
   * position() — чистый: повторные вызовы дают равные (но разные)
   * объекты; мутирование результата состояние не ломает.
   * @param {{x: number, y: number, intervalMs?: number}} opts
   * @returns {{position: (nowMs: number) => {x: number, y: number},
   *            step: (from: {x: number, y: number},
   *                     to: {x: number, y: number},
   *                     nowMs: number, intervalMs?: number) => void,
   *            teleport: (x: number, y: number) => void}}
   */
  function createMover(opts) {
    const o = opts || {};
    const factoryInterval = Number(o.intervalMs);
    let init = { x: Number(o.x) || 0, y: Number(o.y) || 0 };
    let glide = null; // { from, to, startMs, intervalMs }
    let snap = null;  // { x, y } — после teleport

    /**
     * Текущая (дробиная) позиция в момент nowMs.
     * @param {number} nowMs
     * @returns {{x: number, y: number}} новый объект
     */
    function position(nowMs) {
      if (glide) {
        const p = stepProgress(nowMs, glide.startMs, glide.intervalMs);
        if (p >= 1) return { x: glide.to.x, y: glide.to.y };
        if (p <= 0) return { x: glide.from.x, y: glide.from.y };
        return lerpPos(glide.from, glide.to, easeInOut(p));
      }
      if (snap) return { x: snap.x, y: snap.y };
      return { x: init.x, y: init.y };
    }

    /**
     * Начать глейд from → to в момент nowMs. intervalMs на шаг
     * переопределяет интервал фабрики (динамическая скорость);
     * невалидный (NaN/нечисло) — интервал фабрики. interval <= 0 —
     * шаг мгновенный (см. stepProgress).
     */
    function step(from, to, nowMs, intervalMs) {
      const n = Number(intervalMs);
      const iv = (intervalMs != null && Number.isFinite(n))
        ? n : factoryInterval;
      glide = {
        from: { x: from.x, y: from.y },
        to: { x: to.x, y: to.y },
        startMs: Number(nowMs),
        intervalMs: iv,
      };
      snap = null;
    }

    /**
     * Мгновенный снап в (x, y): отменяет текущий глейд. После снапа
     * position() возвращает (x, y) для ЛЮБОГО now, пока не начат новый
     * глейд.
     */
    function teleport(x, y) {
      glide = null;
      const p = { x: Number(x), y: Number(y) };
      snap = p;
      init = p;
    }

    return { position, step, teleport };
  }

  return {
    clamp01, lerp, lerpPos, easeInOut,
    stepProgress, cameraStep, CAM_TAU_MS,
    moveIntervalMs, MIN_MOVE_INTERVAL_MS,
    walkWindowMs,
    createMover,
  };
});

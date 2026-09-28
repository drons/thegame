// Тесты плавного передвижения (задача 000033): чистое ядро src/motion.js.
//
// Задача: «Сделать передвижение персонажа более плавным». Почему сейчас
// «рвано»: tryMove() в main.js прыжком меняет player.x/y (целочисленный
// тайл) каждые 140 мс, оба слоя рендера (WebGL-ромб и спрайт) рисуют
// Флогистона в центре целого тайла, а камера между шагами едет плавно —
// персонаж телепортируется, пока мир едет. Решение: глейд prev→next за
// интервал шага с easing'ом, fps-независимое сглаживание камеры и
// фабрика «мувера» (глейд/снап) в чистом UMD-модуле src/motion.js
// (паттерн src/controls.js). Правки main.js (DOM/WebGL-клей) в node
// не тестируются — устоявшийся паттерн проекта; чистое ядро — здесь.
//
// Контракт модуля (то, что проверяют эти тесты):
//   clamp01(t), lerp(a,b,t), lerpPos(prev,next,t) → {x,y},
//   easeInOut(t) = t²(3−2t) (кламп в [0,1]),
//   stepProgress(nowMs, startMs, intervalMs) → p∈[0,1],
//   cameraStep(cur, target, dtMs, tauMs) — экспоненциальное сглаживание,
//   константа CAM_TAU_MS (≈74.7 мс: при 60 fps коэффициент ≈ 0.2),
//   moveIntervalMs(baseMs, speedMult) — интервал шага с учётом
//   «Ловкого шага» (moveSpeedMult из player.js), нижний кламп —
//   константа MIN_MOVE_INTERVAL_MS,
//   createMover({x, y, intervalMs}) → { step, position, teleport }.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  clamp01, lerp, lerpPos, easeInOut,
  stepProgress, cameraStep, CAM_TAU_MS,
  moveIntervalMs, MIN_MOVE_INTERVAL_MS,
  walkWindowMs,
  createMover,
} = require('../src/motion.js');

// ---------------------------------------------------------------------------
// Базовые примитивы
// ---------------------------------------------------------------------------

test('clamp01: границы, кламп, мусор', () => {
  assert.equal(clamp01(0), 0);
  assert.equal(clamp01(1), 1);
  assert.equal(clamp01(0.37), 0.37);
  assert.equal(clamp01(-0.5), 0);
  assert.equal(clamp01(1.5), 1);
  assert.equal(clamp01(Infinity), 1);
  assert.equal(clamp01(-Infinity), 0);
  assert.equal(clamp01(NaN), 0); // не NaN: мусорное время = начало глейда
});

test('lerp: линейная интерполяция', () => {
  assert.equal(lerp(0, 1, 0), 0);
  assert.equal(lerp(0, 1, 1), 1);
  assert.equal(lerp(0, 1, 0.5), 0.5);
  assert.equal(lerp(2, 5, 0.25), 2.75);
  assert.equal(lerp(5, 2, 0.5), 3.5);
});

test('lerpPos: концы, середина, все 4 направления, кламп вне [0,1]', () => {
  assert.deepEqual(lerpPos({ x: 1, y: 2 }, { x: 2, y: 2 }, 0), { x: 1, y: 2 });
  assert.deepEqual(lerpPos({ x: 1, y: 2 }, { x: 2, y: 2 }, 1), { x: 2, y: 2 });
  assert.deepEqual(lerpPos({ x: 1, y: 2 }, { x: 2, y: 2 }, 0.5), { x: 1.5, y: 2 });
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const prev = { x: 4, y: 4 };
    const next = { x: 4 + dx, y: 4 + dy };
    assert.deepEqual(lerpPos(prev, next, 0), prev, [dx, dy]);
    assert.deepEqual(lerpPos(prev, next, 1), next, [dx, dy]);
    assert.deepEqual(lerpPos(prev, next, 0.5),
      { x: 4 + dx / 2, y: 4 + dy / 2 }, [dx, dy]);
  }
  // Вне [0,1] — не вылетает за отрезок.
  assert.deepEqual(lerpPos({ x: 0, y: 0 }, { x: 1, y: 0 }, 2), { x: 1, y: 0 });
  assert.deepEqual(lerpPos({ x: 0, y: 0 }, { x: 1, y: 0 }, -1), { x: 0, y: 0 });
});

test('easeInOut: концы, середина, монотонность, симметрия, кламп', () => {
  assert.equal(easeInOut(0), 0);
  assert.equal(easeInOut(1), 1);
  assert.equal(easeInOut(0.5), 0.5);
  // Плавный старт/финиш.
  assert.ok(easeInOut(0.25) < 0.25);
  assert.ok(easeInOut(0.75) > 0.75);
  // Строго монотонна.
  let last = -1;
  for (let i = 0; i <= 40; i++) {
    const v = easeInOut(i / 40);
    assert.ok(v > last, 'монотонность в t=' + (i / 40));
    last = v;
  }
  // Симметрия относительно середины.
  for (const t of [0.1, 0.25, 0.4, 0.55, 0.9]) {
    assert.ok(Math.abs(easeInOut(t) - (1 - easeInOut(1 - t))) < 1e-12,
      'симметрия t=' + t);
  }
  assert.equal(easeInOut(-0.2), 0);
  assert.equal(easeInOut(1.2), 1);
});

// ---------------------------------------------------------------------------
// Прогресс шага
// ---------------------------------------------------------------------------

test('stepProgress: 0 до старта, линейный рост, 1 на и после конца', () => {
  assert.equal(stepProgress(99, 100, 140), 0);
  assert.equal(stepProgress(100, 100, 140), 0);
  assert.equal(stepProgress(170, 100, 140), 0.5);
  assert.equal(stepProgress(240, 100, 140), 1);
  assert.equal(stepProgress(1000, 100, 140), 1); // за концом — кламп, не >1
  assert.equal(stepProgress(1e15, 100, 140), 1);
  // Мгновенный шаг (interval <= 0).
  assert.equal(stepProgress(100, 100, 0), 1);
  assert.equal(stepProgress(100, 100, -5), 1);
  // Чистота: повторный вызов — тот же результат.
  assert.equal(stepProgress(130, 100, 140), stepProgress(130, 100, 140));
  // Мусорное время → 0 (не NaN).
  assert.equal(stepProgress(NaN, 100, 140), 0);
  assert.equal(stepProgress(130, NaN, 140), 0);
});

// ---------------------------------------------------------------------------
// Камера: fps-независимое экспоненциальное сглаживание
// ---------------------------------------------------------------------------

test('cameraStep: CAM_TAU_MS — ощущение 60 fps сохранено (≈0.2/кадр)', () => {
  assert.ok(Number.isFinite(CAM_TAU_MS) && CAM_TAU_MS > 0,
    'CAM_TAU_MS должен быть положительным');
  const k60 = 1 - Math.exp(-(1000 / 60) / CAM_TAU_MS);
  assert.ok(Math.abs(k60 - 0.2) < 0.01,
    'при 60 fps коэффициент сглаживания ≈ 0.2 (как у текущего lerp), ' +
    'получено ' + k60);
});

test('cameraStep: dt<=0 и cur==target — без движения', () => {
  assert.equal(cameraStep(1, 5, 0, 75), 1);
  assert.equal(cameraStep(1, 5, -16, 75), 1);
  assert.equal(cameraStep(3, 3, 16.7, 75), 3);
});

test('cameraStep: движение строго к цели, перелёта нет', () => {
  const tau = 75;
  for (const dt of [0.5, 16.7, 75, 300, 1e6]) {
    const lo = cameraStep(0, 1, dt, tau);
    assert.ok(lo > 0 && lo <= 1, 'с низа dt=' + dt + ': ' + lo);
    const hi = cameraStep(2, 1, dt, tau);
    assert.ok(hi >= 1 && hi < 2, 'с верха dt=' + dt + ': ' + hi);
  }
  // Возврат из фоновой вкладки (огромный dt) — доезжает, не перелетает.
  assert.equal(cameraStep(0, 1, 1e6, tau), 1);
  assert.equal(cameraStep(3, 1, 1e6, tau), 1);
});

test('cameraStep: независимость от частоты кадров', () => {
  const tau = 75;
  // 12 кадров по 60 fps == 24 кадра по 120 fps (тот же реальный интервал):
  // при фикс-коэффициенте 0.2/кадр 144 Гц ловила цель в ~2.4 раза быстрее.
  let a = 0;
  for (let i = 0; i < 12; i++) a = cameraStep(a, 1, 1000 / 60, tau);
  let b = 0;
  for (let i = 0; i < 24; i++) b = cameraStep(b, 1, 1000 / 120, tau);
  assert.ok(Math.abs(a - b) < 1e-9,
    'одна и та же длительность — тот же результат: ' + a + ' vs ' + b);
  // Безпамятность экспоненты: два коротких кадра == один длинный.
  for (const [d1, d2] of [[8, 8], [1, 16.6], [50, 12], [0.5, 33.3]]) {
    const two = cameraStep(cameraStep(0.3, 4, d1, tau), 4, d2, tau);
    const one = cameraStep(0.3, 4, d1 + d2, tau);
    assert.ok(Math.abs(two - one) < 1e-9, 'd1=' + d1 + ', d2=' + d2);
  }
});

test('cameraStep: сходимость к цели', () => {
  const tau = 75;
  const c = cameraStep(0, 1, 10 * tau, tau);
  assert.ok(Math.abs(c - 1) < 1e-3,
    'после 10*tau расстояние до цели ' + Math.abs(1 - c));
});

test('cameraStep: tau<=0 — мгновенный снап', () => {
  assert.equal(cameraStep(0, 7, 16, 0), 7);
  assert.equal(cameraStep(0, 7, 16, -3), 7);
});

// ---------------------------------------------------------------------------
// Интервал шага: «Ловкий шаг» (moveSpeedMult) — SPEC «Скорость
// перемещения по карте». Навык только ускоряет: множитель всегда >= 1.
// ---------------------------------------------------------------------------

test('moveIntervalMs: невалидный множитель — базовый интервал', () => {
  for (const bad of [null, undefined, NaN, Infinity, -Infinity, 0, -2, 0.5]) {
    assert.equal(moveIntervalMs(140, bad), 140, 'mult=' + String(bad));
  }
  // Невалидная база — как есть (модуль не выдумывает числа).
  assert.equal(moveIntervalMs(NaN, 2), NaN);
  assert.equal(moveIntervalMs(0, 2), 0);
});

test('moveIntervalMs: множитель >= 1 — короче, но не длиннее базы', () => {
  assert.equal(moveIntervalMs(140, 1), 140);
  assert.ok(Math.abs(moveIntervalMs(140, 1.05) - 140 / 1.05) < 1e-9);
  assert.ok(Math.abs(moveIntervalMs(140, 2) - 70) < 1e-9);
  // Монотонно: чем выше навык — тем короче шаг.
  assert.ok(moveIntervalMs(140, 1.5) > moveIntervalMs(140, 2));
  assert.ok(moveIntervalMs(140, 1) >= moveIntervalMs(140, 100));
});

test('moveIntervalMs: кламп в минимальный интервал', () => {
  assert.ok(Number.isFinite(MIN_MOVE_INTERVAL_MS) && MIN_MOVE_INTERVAL_MS > 0,
    'MIN_MOVE_INTERVAL_MS > 0');
  assert.ok(MIN_MOVE_INTERVAL_MS <= 140,
    'минимум не длиннее типичного базового интервала');
  for (const mult of [1e3, 1e6]) {
    const r = moveIntervalMs(140, mult);
    assert.ok(Number.isFinite(r) && r > 0, 'mult=' + mult);
    assert.ok(r >= MIN_MOVE_INTERVAL_MS, 'mult=' + mult);
    assert.ok(r <= 140, 'интервал не длиннее базы, mult=' + mult);
  }
  assert.equal(moveIntervalMs(140, 1e6), MIN_MOVE_INTERVAL_MS);
  // Короткая база: кламп не удлиняет шаг сверх базы.
  assert.ok(moveIntervalMs(30, 1e6) <= 30);
});

test('moveIntervalMs: навык работает с новой базой 420 мс (задача 000063)', () => {
  // База = 140 * 3 = 420 мс (задача 000063: скорость ×1/3). «Ловкий
  // шаг» должен укорачивать шаг от НОВОЙ базы, а нижний кламп —
  // оставаться НИЖЕ неё: иначе min(max(MIN, raw), base) при любом
  // mult >= 1 вернул бы base и навык бы замолчал. (Эти проверки
  // зелёные и до реализации: moveIntervalMs универсален к базе — тесты
  // фиксируют контракт, что будущие правки MIN не сломают навык.)
  const base = 140 * 3;
  assert.equal(moveIntervalMs(base, 1), base, 'без навыка — база');
  assert.ok(moveIntervalMs(base, 1.05) < base, 'навык укорачивает шаг');
  assert.ok(MIN_MOVE_INTERVAL_MS < base,
    'нижний кламп ниже новой базы (иначе навык мёртв)');
  assert.equal(moveIntervalMs(base, 1e6), MIN_MOVE_INTERVAL_MS,
    'кламп срабатывает с новой базы');
  assert.ok(moveIntervalMs(base, 1.2) > moveIntervalMs(base, 2),
    'монотонно: чем выше навык — тем короче шаг');
});

// ---------------------------------------------------------------------------
// Окно анимации walk/idle — от интервала шага (задача 000063)
// ---------------------------------------------------------------------------
// Фикс-окно 260 мс подобрано под старый интервал 140 мс
// (memory/000033-smooth-movement.md): «при фикс. 140 мс — бег всегда в
// walk». При новом базовом интервале 420 мс фикс-окно 260 дало бы
// 260 мс walk + 160 мс ЗАМИРАНИЯ в idle за цикл при удержании клавиш —
// рваная ходьба, откат ровно того ощущения, что дала 000033. Окно
// масштабируется от интервала шага: window = max(260, stepMs) — не
// короче старого окна и не короче самого шага (при удержании клавиш
// герой всегда в walk).

test('walkWindowMs: окно не короче 260 мс — старое ощущение сохранено', () => {
  assert.equal(walkWindowMs(140), 260, 'при интервале 140 мс — как раньше');
  assert.equal(walkWindowMs(60), 260,
    'короткий шаг (высокий «Ловкий шаг») — окно не сжимается');
  assert.equal(walkWindowMs(0), 260, 'нулевой интервал — окно не сжимается');
});

test('walkWindowMs: окно покрывает шаг — нет замирания в idle', () => {
  assert.equal(walkWindowMs(420), 420,
    'новая база 420 мс: окно = шаг, герой не замирает');
  for (const s of [140, 260, 261, 420, 840, 1e4]) {
    assert.ok(walkWindowMs(s) >= s, `window >= step при step=${s}`);
  }
});

test('walkWindowMs: граница 260, монотонность, мусорное время', () => {
  assert.equal(walkWindowMs(260), 260, 'граница 260');
  assert.ok(walkWindowMs(200) <= walkWindowMs(300) &&
    walkWindowMs(300) <= walkWindowMs(500), 'монотонно');
  assert.equal(walkWindowMs(NaN), 260, 'мусор — старое окно (без выброса)');
  assert.equal(walkWindowMs(-5), 260, 'отрицательный интервал — старое окно');
});

// --- main.js (клей) — структурный фиксатор (не тестируется в node) ---

test('main.js: окно walk/idle — через walkWindowMs, фикс 260 мс удалён (структурный)', () => {
  // При базовом интервале 420 мс (задача 000063) фикс-окно
  // «now - lastStepAt < 260» замиряет героя в idle 160 мс за цикл —
  // рваная ходьба (откат ощущения 000033). Окно должно браться из
  // walkWindowMs(stepMs) (src/motion.js) и масштабироваться от
  // интервала шага, а не от зашитой константы.
  const text = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.ok(text.includes('walkWindowMs'),
    'окно walk/idle — через walkWindowMs (motion.js)');
  assert.ok(!text.includes('now - lastStepAt < 260'),
    'фикс-окно «now - lastStepAt < 260» в main.js удалено');
});

// ---------------------------------------------------------------------------
// Мувёр: машина состояния «глейд prev→next / снап»
// ---------------------------------------------------------------------------

test('createMover: до первого шага — начальная точка (для любого now)', () => {
  const m = createMover({ x: 3, y: -2, intervalMs: 140 });
  assert.deepEqual(m.position(0), { x: 3, y: -2 });
  assert.deepEqual(m.position(1234), { x: 3, y: -2 });
  assert.deepEqual(m.position(1e9), { x: 3, y: -2 });
});

test('createMover: глейд prev→next — старт, середина, конец, за концом', () => {
  const m = createMover({ x: 0, y: 0, intervalMs: 200 });
  const t0 = 1000;
  m.step({ x: 0, y: 0 }, { x: 1, y: 0 }, t0);
  assert.deepEqual(m.position(t0), { x: 0, y: 0 });
  assert.deepEqual(m.position(t0 - 10), { x: 0, y: 0 }); // раньше — старт
  assert.deepEqual(m.position(t0 + 100), { x: 0.5, y: 0 }); // easeInOut(0.5)=0.5
  assert.deepEqual(m.position(t0 + 200), { x: 1, y: 0 }); // ровно в конце
  assert.deepEqual(m.position(t0 + 2000), { x: 1, y: 0 }); // за концом — цель
  assert.deepEqual(m.position(t0 + 1e9), { x: 1, y: 0 }); // без отката
});

test('createMover: все 4 направления, без перелёта за отрезок', () => {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const m = createMover({ x: 5, y: 5, intervalMs: 100 });
    const from = { x: 5, y: 5 };
    const to = { x: 5 + dx, y: 5 + dy };
    m.step(from, to, 0);
    const mid = m.position(50);
    assert.equal(mid.x, 5 + dx / 2, 'x [' + dx + ',' + dy + ']');
    assert.equal(mid.y, 5 + dy / 2, 'y [' + dx + ',' + dy + ']');
    for (const t of [10, 25, 60, 90]) {
      const p = m.position(t);
      assert.ok(
        p.x >= Math.min(from.x, to.x) - 1e-12 &&
        p.x <= Math.max(from.x, to.x) + 1e-12 &&
        p.y >= Math.min(from.y, to.y) - 1e-12 &&
        p.y <= Math.max(from.y, to.y) + 1e-12,
        'перелёт t=' + t + ': ' + JSON.stringify(p));
    }
  }
});

test('createMover: easing — плавный старт и финиш', () => {
  const m = createMover({ x: 0, y: 0, intervalMs: 100 });
  m.step({ x: 0, y: 0 }, { x: 1, y: 0 }, 0);
  assert.ok(m.position(25).x < 0.25,
    'в четверти времени пройдено меньше четверти пути');
  assert.ok(m.position(75).x > 0.75,
    'в трёх четвертях пройдено больше трёх четвертей');
});

test('createMover: interval на шаг переопределяет интервал фабрики', () => {
  const m = createMover({ x: 0, y: 0, intervalMs: 140 });
  m.step({ x: 0, y: 0 }, { x: 1, y: 0 }, 0, 300);
  assert.notDeepEqual(m.position(140), { x: 1, y: 0 },
    'при глейде 300 мс к 140 мс шаг ещё не завершён');
  assert.deepEqual(m.position(300), { x: 1, y: 0 });
  // Без явного interval — как в фабрике.
  const m2 = createMover({ x: 0, y: 0, intervalMs: 140 });
  m2.step({ x: 0, y: 0 }, { x: 1, y: 0 }, 0);
  assert.deepEqual(m2.position(140), { x: 1, y: 0 });
});

test('createMover: невалидный interval на шаг — интервал фабрики', () => {
  const m = createMover({ x: 0, y: 0, intervalMs: 200 });
  m.step({ x: 0, y: 0 }, { x: 1, y: 0 }, 0, NaN);
  assert.deepEqual(m.position(100), { x: 0.5, y: 0 });
  assert.deepEqual(m.position(200), { x: 1, y: 0 });
});

test('createMover: цепочка — следующий глейд от предыдущей цели', () => {
  const m = createMover({ x: 0, y: 0, intervalMs: 140 });
  m.step({ x: 0, y: 0 }, { x: 1, y: 0 }, 0);
  m.step({ x: 1, y: 0 }, { x: 2, y: 0 }, 140);
  assert.deepEqual(m.position(140), { x: 1, y: 0 });
  assert.deepEqual(m.position(210), { x: 1.5, y: 0 });
  assert.deepEqual(m.position(280), { x: 2, y: 0 });
});

test('createMover: teleport — мгновенный снап, отмена глейда', () => {
  const m = createMover({ x: 0, y: 0, intervalMs: 140 });
  m.step({ x: 0, y: 0 }, { x: 5, y: 5 }, 0);
  m.teleport(42, -7); // побег/смерть/восстановление сейва/спавн
  assert.deepEqual(m.position(70), { x: 42, y: -7 },
    'НЕ середина старого глейда');
  assert.deepEqual(m.position(140), { x: 42, y: -7 },
    'НЕ цель старого глейда');
  assert.deepEqual(m.position(1e9), { x: 42, y: -7 });
  // Дальнейшие глейды после снапа работают.
  m.step({ x: 42, y: -7 }, { x: 43, y: -7 }, 5000);
  assert.deepEqual(m.position(5000), { x: 42, y: -7 });
  assert.deepEqual(m.position(5070), { x: 42.5, y: -7 });
  assert.deepEqual(m.position(5140), { x: 43, y: -7 });
});

test('createMover: interval<=0 — шаг мгновенный', () => {
  const m = createMover({ x: 0, y: 0, intervalMs: 0 });
  m.step({ x: 0, y: 0 }, { x: 1, y: 1 }, 100);
  assert.deepEqual(m.position(101), { x: 1, y: 1 });
  assert.deepEqual(m.position(1e9), { x: 1, y: 1 });
});

test('createMover: position() — чистые повторные вызовы, новые объекты', () => {
  const m = createMover({ x: 0, y: 0, intervalMs: 100 });
  m.step({ x: 0, y: 0 }, { x: 2, y: 1 }, 0);
  const a = m.position(50);
  const b = m.position(50);
  assert.deepEqual(a, b);
  assert.notEqual(a, b, 'каждый вызов возвращает новый объект');
  a.x = 999;
  assert.deepEqual(m.position(50), b, 'мутирование не ломает состояние');
  const m2 = createMover({ x: 0, y: 0, intervalMs: 100 });
  m2.step({ x: 0, y: 0 }, { x: 2, y: 1 }, 0);
  assert.deepEqual(m2.position(50), b);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  STEPS_PER_DAY, RESPAWN_DAYS, createClock, dueForRespawn, canUseToday,
  serializeDefeatedAt, restoreDefeatedAt,
} = require('../src/day.js');

test('часы: старт на 1-м дне, шаги копятся до порога', () => {
  const c = createClock({ stepsPerDay: 5 });
  assert.equal(c.day, 1);
  assert.equal(c.steps, 0);
  c.addStep(4);
  assert.equal(c.day, 1);
  assert.equal(c.steps, 4);
  c.addStep(1); // порог 5 → день 2
  assert.equal(c.day, 2);
  assert.equal(c.steps, 0);
});

test('часы: избыток шагов переходит в следующий день', () => {
  const c = createClock({ stepsPerDay: 3 });
  c.addStep(7); // 3 → день 2, 3 → день 3, остаток 1
  assert.equal(c.day, 3);
  assert.equal(c.steps, 1);
});

test('часы: отдых и события сразу сменяют день, слушатели получают причину', () => {
  const c = createClock();
  const seen = [];
  c.onDay((e) => seen.push(e));
  c.rest();
  c.event('dungeon');
  assert.equal(c.day, 3);
  assert.equal(c.steps, 0);
  assert.deepEqual(seen.map((e) => [e.day, e.reason]), [[2, 'rest'], [3, 'dungeon']]);
});

test('часы: по умолчанию steps_per_day = 40, respawn_days = 3', () => {
  const c = createClock();
  assert.equal(c.stepsPerDay, 40);
  assert.equal(STEPS_PER_DAY, 40);
  assert.equal(RESPAWN_DAYS, 3);
  c.addStep(STEPS_PER_DAY - 1);
  assert.equal(c.day, 1);
  c.addStep(1);
  assert.equal(c.day, 2);
});

test('респаун: группа возвращается через respawn_days дней', () => {
  const at = new Map([['1,1', 1], ['2,2', 5]]);
  // День 3: первая группа (3 - 1 = 2 < 3) ещё нет, вторая (3 - 5) — в прошлом, не считаем.
  assert.deepEqual(dueForRespawn(at, 4), ['1,1']); // 4 - 1 = 3 >= 3
  assert.deepEqual(dueForRespawn(at, 3), []);
  assert.deepEqual(dueForRespawn(at, 8, 3), ['1,1', '2,2']); // обе: 7 и 3 >= 3
  // Настраиваемый параметр.
  assert.deepEqual(dueForRespawn(at, 6, 1), ['1,1', '2,2']);
  assert.deepEqual(dueForRespawn(at, 1, 3), []);
});

test('«раз в день»: эффект нельзя применить повторно в тот же день', () => {
  assert.ok(canUseToday(undefined, 1), 'первое применение — можно');
  assert.ok(canUseToday(1, 1) === false, 'повторно в тот же день — нельзя');
  assert.ok(canUseToday(1, 2), 'на следующий день — можно снова');
});

// --- fastForward (восстановление сейва, задача 000031) ---
// Ключевое свойство: день доводится БЕЗ оповещения слушателей —
// при day=100000 это 99999 перерисовок DOM (заморозка браузера),
// а эффекты прошедших дней уже учтены в данных сейва (снимок).

test('часы: fastForward доводит день, сбрасывает шаги, слушатели НЕ вызваны', () => {
  const c = createClock({ stepsPerDay: 40 });
  const seen = [];
  c.onDay((e) => seen.push(e));
  c.addStep(35);
  assert.equal(c.day, 1);
  assert.equal(c.steps, 35);
  c.fastForward(99999);
  assert.equal(c.day, 100000);
  assert.equal(c.steps, 0);
  assert.equal(seen.length, 0, 'слушатели onDay не должны вызываться');
});

test('часы: fastForward с n < 1 или нецелым — корректно (floor, нет-оп)', () => {
  const c = createClock({ stepsPerDay: 5 });
  c.addStep(3);
  assert.equal(c.fastForward(0), 1);
  assert.equal(c.day, 1);
  assert.equal(c.steps, 3, 'n=0 — шаги не трогаем');
  assert.equal(c.fastForward(-7), 1);
  assert.equal(c.day, 1);
  assert.equal(c.steps, 3, 'n<0 — шаги не трогаем');
  assert.equal(c.fastForward(2.9), 3); // floor(2.9) = 2
  assert.equal(c.steps, 0, 'n >= 1 — шаги сбрасываются');
});

test('fastForward + addStep: восстановление дня и шагов первого дня', () => {
  // Сейв {day: 1, steps: 35} — шаги первого дня должны восстановиться
  // (было: блок был вложен в d.day > clock.day и пропускался).
  const c = createClock({ stepsPerDay: 40 });
  c.fastForward(0);
  c.addStep(35);
  assert.equal(c.day, 1);
  assert.equal(c.steps, 35);
});

test('defeatedAt: serialize → restore roundtrip (включая отрицательные координаты)', () => {
  const m = new Map([['-3,7', 5], ['0,0', 2], ['12,-1', 42]]);
  const saved = serializeDefeatedAt(m);
  assert.deepEqual(saved, { '-3,7': 5, '0,0': 2, '12,-1': 42 });
  const back = restoreDefeatedAt(saved);
  assert.equal(back.size, 3);
  assert.equal(back.get('-3,7'), 5);
  assert.equal(back.get('12,-1'), 42);
});

test('defeatedAt: restoreDefeatedAt отбрасывает мусор, валидные записи сохраняет', () => {
  const saved = {
    '1,2': 4,          // валидная
    'abc': 1,          // не координаты
    '3,': 1,           // сломанный ключ
    ',4': 1,           // сломанный ключ
    '4,5': 0,          // день < 1
    '6,7': 1.5,        // нецелый день
    '8,9': 'x',        // строка
    '10,11': -2,       // отрицательный день
  };
  const m = restoreDefeatedAt(saved);
  assert.equal(m.size, 1);
  assert.equal(m.get('1,2'), 4);
});

test('defeatedAt: restoreDefeatedAt на не-объекте → пустой Map, serialize на мусоре → {}', () => {
  assert.ok(restoreDefeatedAt(null) instanceof Map);
  assert.equal(restoreDefeatedAt(null).size, 0);
  assert.equal(restoreDefeatedAt('junk').size, 0);
  assert.equal(restoreDefeatedAt([['1,2', 3]]).size, 0); // массив — не словарь
  assert.equal(restoreDefeatedAt(42).size, 0);
  assert.deepEqual(serializeDefeatedAt(null), {});
  assert.deepEqual(serializeDefeatedAt({}), {});
  assert.deepEqual(serializeDefeatedAt(new Map([['1,1', 2]])), { '1,1': 2 });
});

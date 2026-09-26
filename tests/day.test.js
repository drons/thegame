const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  STEPS_PER_DAY, RESPAWN_DAYS, createClock, dueForRespawn, canUseToday,
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

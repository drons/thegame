const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPerlin2D, mulberry32, hash2 } = require('../src/perlin.js');

test('mulberry32 детерминирован и даёт значения в [0, 1)', () => {
  const a = mulberry32(123);
  const b = mulberry32(123);
  for (let i = 0; i < 100; i++) {
    const va = a();
    const vb = b();
    assert.equal(va, vb);
    assert.ok(va >= 0 && va < 1, `значение ${va} вне [0,1)`);
  }
  // Разные сиды → разные последовательности.
  const c = mulberry32(124);
  const seqA = Array.from({ length: 5 }, () => a());
  const seqC = Array.from({ length: 5 }, () => c());
  assert.notDeepEqual(seqA, seqC);
});

test('noise2 детерминирован для одного сида', () => {
  const p1 = createPerlin2D(42);
  const p2 = createPerlin2D(42);
  for (let i = 0; i < 50; i++) {
    const x = Math.random() * 100 - 50;
    const y = Math.random() * 100 - 50;
    assert.equal(p1.noise2(x, y), p2.noise2(x, y));
  }
});

test('noise2 даёт другие значения для другого сида', () => {
  const p1 = createPerlin2D(1);
  const p2 = createPerlin2D(2);
  let same = 0;
  for (let i = 0; i < 100; i++) {
    const x = Math.random() * 20;
    const y = Math.random() * 20;
    if (p1.noise2(x, y) === p2.noise2(x, y)) same++;
  }
  assert.ok(same < 5, 'шумы с разными сидами почти совпали');
});

test('noise2 ограничен по амплитуде', () => {
  const p = createPerlin2D(7);
  for (let i = 0; i < 2000; i++) {
    const v = p.noise2(Math.random() * 200 - 100, Math.random() * 200 - 100);
    assert.ok(Math.abs(v) <= 1, `амплитуда ${v} > 1`);
  }
});

test('noise2 непрерывен: близкие точки близки по значению', () => {
  const p = createPerlin2D(99);
  for (let i = 0; i < 100; i++) {
    const x = Math.random() * 50;
    const y = Math.random() * 50;
    const d = Math.abs(p.noise2(x, y) - p.noise2(x + 0.01, y + 0.01));
    assert.ok(d < 0.05, `разрыв ${d} в точке (${x}, ${y})`);
  }
});

test('fbm детерминирован, нормирован в [-1, 1], зависит от числа октав', () => {
  const p1 = createPerlin2D(5);
  const p2 = createPerlin2D(5);
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * 10;
    const y = Math.random() * 10;
    const v = p1.fbm(x, y);
    assert.ok(v >= -1 && v <= 1, `fbm ${v} вне [-1,1]`);
    assert.equal(v, p2.fbm(x, y));
  }
  // Разное число октав меняет результат (в общем случае).
  let differ = 0;
  for (let i = 0; i < 50; i++) {
    const x = Math.random() * 10;
    const y = Math.random() * 10;
    if (p1.fbm(x, y, 3) !== p1.fbm(x, y, 5)) differ++;
  }
  assert.ok(differ > 40, 'fbm с разным числом октав не различается');
});

test('noise2 корректно зациклен по модулю 256 (бесшовность решётки)', () => {
  const p = createPerlin2D(3);
  // Значения на решётке периодичны: f(x, y) ≈ f(x + 256, y + 256).
  // Допуск 1e-9: в FP вычитание дробной части у x и x+256 различается
  // на ~1 ulp, что даёт различие порядка 1e-14, а не тождество.
  const eq = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
  for (let i = 0; i < 20; i++) {
    const x = Math.random() * 100;
    const y = Math.random() * 100;
    eq(p.noise2(x, y), p.noise2(x + 256, y + 256));
    eq(p.noise2(x, y), p.noise2(x - 256, y - 256));
  }
});

test('hash2 детерминирован, беззнаковый, зависит от аргументов', () => {
  assert.equal(hash2(10, 20, 999), hash2(10, 20, 999));
  assert.notEqual(hash2(10, 20, 999), hash2(11, 20, 999));
  assert.notEqual(hash2(10, 20, 999), hash2(10, 21, 999));
  assert.notEqual(hash2(10, 20, 999), hash2(10, 20, 1000));
  for (let i = 0; i < 100; i++) {
    const h = hash2(i, i * 2, 42);
    assert.ok(Number.isInteger(h) && h >= 0 && h <= 0xffffffff);
  }
});

// Детерминированный 2D-шум Перлина (классический «improved» алгоритм).
// Тот же сид всегда даёт те же значения — это основа воспроизводимой
// процедурной генерации мира (см. SPEC.md, раздел «Карта мира»).
//
// Униформный модуль: в браузере грузится обычным <script> и кладёт API
// в globalThis.Game, в node — через require() (CommonJS).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Game = Object.assign({}, root.Game, factory());
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {

  // PRNG mulberry32: быстрый детерминированный генератор [0, 1).
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Перестановочная таблица 512 = 2x256, зацикленная по модулю 256.
  function buildPermutation(seed) {
    const rand = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    const perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    return perm;
  }

  const GRAD2 = [
    [1, 1], [-1, 1], [1, -1], [-1, -1],
    [1, 0], [-1, 0], [0, 1], [0, -1],
  ];

  function fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function lerp(a, b, t) {
    return a + t * (b - a);
  }

  function grad(hash, x, y) {
    const g = GRAD2[hash & 7];
    return g[0] * x + g[1] * y;
  }

  /**
   * Создаёт генератор 2D-шума Перлина с указанным сидом.
   * @returns {{ noise2: (x:number, y:number) => number,
   *             fbm: (x:number, y:number, octaves?:number,
   *                   lacunarity?:number, gain?:number) => number }}
   *   noise2 — значение шума в [-1, 1]
   *   fbm    — сумма октав (fractal Brownian motion), нормирована в [-1, 1]
   */
  function createPerlin2D(seed) {
    const perm = buildPermutation(seed);

    function noise2(x, y) {
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      const X = xi & 255;
      const Y = yi & 255;
      const xf = x - xi;
      const yf = y - yi;
      const u = fade(xf);
      const v = fade(yf);
      const aa = perm[perm[X] + Y];
      const ab = perm[perm[X] + Y + 1];
      const ba = perm[perm[X + 1] + Y];
      const bb = perm[perm[X + 1] + Y + 1];
      const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
      const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
      return lerp(x1, x2, v);
    }

    // Сумма октав: каждая следующая октава вдвое мельче и вдвое тише.
    function fbm(x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
      let amp = 1;
      let freq = 1;
      let sum = 0;
      let norm = 0;
      for (let i = 0; i < octaves; i++) {
        sum += amp * noise2(x * freq, y * freq);
        norm += amp;
        amp *= gain;
        freq *= lacunarity;
      }
      return sum / norm;
    }

    return { noise2, fbm };
  }

  // Детерминированное целочисленное хэширование пары координат (finalizer
  // murmur3). Используется для выбора типа постройки/группы мобов в тайле.
  function hash2(x, y, seed) {
    let h = (seed ^ Math.imul(x + 0x9e3779b9, 0x85ebca6b) ^
      Math.imul(y + 0x1b377c1d, 0xc2b2ae35)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    return (h ^ (h >>> 16)) >>> 0;
  }

  return { mulberry32, createPerlin2D, hash2 };
});

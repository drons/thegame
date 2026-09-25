// «Глобальная затравка» карты мира (SPEC.md, раздел «Карта мира»).
// Чистый код без зависимостей от node — используется и браузером,
// и скриптом генерации assets/map.png, и тестами.
//
// Генерируется детерминированная RGBA-картинка: один пиксель = один тайл.
// Каналы пикселя (конвенция: тёмный канал усиливает свой эффект):
//   R — смещение уровня моря      (тёмный R = море поднимается)
//   G — смещение горной линии     (тёмный G = горы чаще)
//   B — смещение лесной линии     (тёмный B = леса чаще)
//   A — плотность построек/мобов  (тёмный A = реже)
//
// Униформный модуль: в браузере — globalThis.Game, в node — require().

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./perlin.js'));
  } else {
    root.Game = Object.assign({}, root.Game,
      factory(typeof root.Game === 'object' ? root.Game : {}));
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function (perlin) {

  const createPerlin2D = perlin.createPerlin2D;

  const MAP_PNG_SIZE = 256;
  const MAP_PNG_SEED = 20260926;

  function clamp255(v) {
    return Math.max(0, Math.min(255, Math.round(v)));
  }

  /**
   * Генерирует пиксели «глобальной затравки».
   * @returns {{ width:number, height:number, data:Uint8Array }} data — RGBA
   */
  function generateSeedPixels(size = MAP_PNG_SIZE, seed = MAP_PNG_SEED) {
    const elev = createPerlin2D(seed);
    const cols = createPerlin2D(seed ^ 0x9e3779b9);
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const o = (y * size + x) * 4;
        // Разные масштабы и сдвиги — чтобы каналы были некоррелированы.
        const e = elev.fbm(x / 64, y / 64, 4);
        const m = elev.fbm(x / 97 + 311.7, y / 97 + 311.7, 3);
        const c = cols.fbm(x / 43 + 707.3, y / 43 + 707.3, 3);
        const d = cols.fbm(x / 121 + 913.1, y / 121 + 913.1, 3);
        data[o + 0] = clamp255(127.5 + 127.5 * e); // R — уровень моря
        data[o + 1] = clamp255(127.5 + 127.5 * m); // G — горная линия
        data[o + 2] = clamp255(127.5 + 127.5 * c); // B — лесная линия
        data[o + 3] = clamp255(127.5 + 127.5 * d); // A — плотность фич
      }
    }
    return { width: size, height: size, data };
  }

  // --- Минимальный PNG-энкодер (8-bit RGBA, без интерлейса) ---
  // Используется только в node (scripts/generate-map-png.js); в браузере не нужен.

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function chunk(type, data) {
    const out = new Uint8Array(8 + data.length + 4);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    const typeAndData = new Uint8Array(4 + data.length);
    for (let i = 0; i < 4; i++) typeAndData[i] = type.charCodeAt(i);
    typeAndData.set(data, 4);
    dv.setUint32(8 + data.length, crc32(typeAndData));
    return out;
  }

  function concatUint8(parts) {
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  /**
   * Кодирует RGBA-пиксели в PNG.
   * @param {{width:number,height:number,data:Uint8Array|Buffer}} px
   * @param {Function} deflateSync — zlib.deflateSync из node
   * @returns {Uint8Array}
   */
  function encodePng(px, deflateSync) {
    const { width, height, data } = px;
    const ihdr = new Uint8Array(13);
    const dv = new DataView(ihdr.buffer);
    dv.setUint32(0, width);
    dv.setUint32(4, height);
    ihdr[8] = 8;  // битность
    ihdr[9] = 6;  // color type: RGBA

    const stride = width * 4;
    const raw = new Uint8Array((stride + 1) * height);
    for (let y = 0; y < height; y++) {
      raw[y * (stride + 1)] = 0; // фильтр None
      raw.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
    }

    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const idat = new Uint8Array(deflateSync(raw, { level: 9 }));
    return concatUint8([
      new Uint8Array(sig),
      chunk('IHDR', ihdr),
      chunk('IDAT', idat),
      chunk('IEND', new Uint8Array(0)),
    ]);
  }

  return { MAP_PNG_SIZE, MAP_PNG_SEED, generateSeedPixels, encodePng };
});

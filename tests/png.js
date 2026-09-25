// Минимальный PNG-декодер (8-bit RGB/RGBA, без интерлейса) — только для тестов:
// позволяет в node проверить, что assets/map.png действительно
// содержит то, что генерирует scripts/generate-map-png.js,
// а также прочитать скриншоты (RGB) в смоук-тестах.
//
// Поддерживаются все 5 типов фильтров строк.

const { readFileSync } = require('node:fs');
const { inflateSync } = require('node:zlib');

function decodePng(path) {
  const buf = readFileSync(path);
  const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== SIG[i]) throw new Error('не PNG: неверная сигнатура');
  }

  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error('интерлейс не поддерживается');
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }
    off += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`неподдерживаемый формат: depth=${bitDepth}, colorType=${colorType}`);
  }

  const raw = inflateSync(Buffer.concat(idat));
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const rowStart = y * (stride + 1) + 1;
    const outStart = y * stride;
    for (let x = 0; x < stride; x++) {
      const v = raw[rowStart + x];
      const left = x >= channels ? out[outStart + x - channels] : 0;
      const up = y > 0 ? out[outStart - stride + x] : 0;
      const upLeft = x >= channels && y > 0 ? out[outStart - stride + x - channels] : 0;
      let val;
      switch (filter) {
        case 0: val = v; break; // None
        case 1: val = v + left; break; // Sub
        case 2: val = v + up; break; // Up
        case 3: val = v + ((left + up) >> 1); break; // Average
        case 4: { // Paeth
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          val = v + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
          break;
        }
        default:
          throw new Error(`неизвестный фильтр строки: ${filter}`);
      }
      out[outStart + x] = val & 0xff;
    }
  }
  return { width, height, data: out };
}

module.exports = { decodePng };

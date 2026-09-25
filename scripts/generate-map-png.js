// Генерирует assets/map.png — RGBA-файл «глобальной затравки» карты мира.
// Один пиксель = один тайл карты (см. SPEC.md). Генерация полностью
// детерминирована: при том же SEED файл всегда одинаков.
//
// Запуск: node scripts/generate-map-png.js  (или npm run gen:map)

const { deflateSync } = require('node:zlib');
const { writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { fileURLToPath } = require('node:url');
const { generateSeedPixels, encodePng, MAP_PNG_SIZE } = require('../src/mapseed.js');

const isMain = require.main === module;
if (isMain) {
  const root = join(dirname(fileURLToPath(__filename)), '..');
  const outPath = join(root, 'assets', 'map.png');
  const pixels = generateSeedPixels();
  const png = encodePng(pixels, deflateSync);
  writeFileSync(outPath, png);
  console.log(`Записано ${outPath}: ${png.length} байт, ${MAP_PNG_SIZE}x${MAP_PNG_SIZE} RGBA`);
}

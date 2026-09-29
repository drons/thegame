#!/usr/bin/env node
'use strict';
// Перегенерирует униформный JS-модуль src/npc-data.js из каталога
// assets/npc/*.json (source of truth — JSON-файлы).
//
// Зачем: игра открывается двойным кликом (file://), где fetch() локальных
// JSON недоступен, поэтому каталог NPC дублируется в JS-модуле
// (в браузере — Game.NpcData, в node — require()).
// После правки JSON в assets/npc/ запустите:
//
//   node scripts/sync-npc-data.js
//
// и закоммитьте оба каталога вместе (тесты tests/npc-data.test.js
// проверяют консистентность JSON <-> JS-модуля).

const fs = require('fs');
const path = require('path');
const { writeFileAtomic } = require('./lib/write-atomic.js');

const ROOT = path.join(__dirname, '..');
const NPC_DIR = path.join(ROOT, 'assets', 'npc');
const OUT_FILE = path.join(ROOT, 'src', 'npc-data.js');

// --- Чтение каталога ---
const files = fs.readdirSync(NPC_DIR)
  .filter((f) => /^\d{6}\.json$/.test(f))
  .sort();
if (files.length === 0) {
  console.error('assets/npc: не найдено ни одного файла 0000NN.json');
  process.exit(1);
}

const npcs = [];
for (const f of files) {
  const data = JSON.parse(
    fs.readFileSync(path.join(NPC_DIR, f), 'utf8'));
  // Минимальная проверка (полная структура закреплена в schema.json,
  // ссылочная целостность — в tests/npc-data.test.js).
  if (!data || typeof data.id !== 'string' ||
      !/^[a-z][a-z0-9_]*$/.test(data.id) ||
      typeof data.имя !== 'string' || data.имя.trim() === '' ||
      typeof data.роль !== 'string' || data.роль.trim() === '' ||
      !Array.isArray(data.постройки) || data.постройки.length === 0 ||
      !Array.isArray(data.диалог) || data.диалог.length === 0) {
    console.error(`${f}: нет валидных полей id/имя/роль/постройки/диалог`);
    process.exit(1);
  }
  npcs.push({ file: f, data });
}

// --- Генерация JS ---
const range = `${npcs[0].file} … ${npcs[npcs.length - 1].file}`;

// Форматирует значение JS-литералом (JSON-совместимо).
function jsValue(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return '[' + v.map(jsValue).join(', ') + ']';
  if (typeof v === 'object') {
    return '{ ' +
      Object.keys(v).map((k) => k + ': ' + jsValue(v[k])).join(', ') + ' }';
  }
  return JSON.stringify(v);
}

// Блок «{ ... }», открывающая скобка на колонке col, поля на col+2.
function jsObjectAt(data, col) {
  const pad = ' '.repeat(col);
  const inner = ' '.repeat(col + 2);
  const lines = Object.keys(data)
    .map((k) => `${inner}${k}: ${jsValue(data[k])},`);
  return pad + '{\n' + lines.join('\n') + '\n' + pad + '}';
}

const L = [];
L.push('// Каталог NPC: униформный JS-модуль (фолбэк для file://).');
L.push('//');
L.push('// Source of truth — JSON-файлы каталога assets/npc/*.json');
L.push('// (один NPC — один файл, схема — assets/npc/schema.json).');
L.push('// Файл ГЕНЕРИРУЕТСЯ скриптом scripts/sync-npc-data.js,');
L.push('// не редактируйте вручную: правьте JSON и пересобирайте модуль.');
L.push('//');
L.push('// Униформный модуль: в браузере — globalThis.Game.NpcData,');
L.push('// в node — require() (CommonJS).');
L.push('');
L.push('(function (root, factory) {');
L.push('  if (typeof module === "object" && module.exports) {');
L.push('    module.exports = factory();');
L.push('  } else {');
L.push('    // В браузере — пространство Game.NpcData (не смешивать с Game).');
L.push('    root.Game = Object.assign({}, root.Game, { NpcData: factory() });');
L.push('  }');
L.push('})(typeof globalThis !== "undefined" ? globalThis : self, function () {');
L.push('');
L.push(`  // Записи NPC (assets/npc/${range});`);
L.push('  // порядок массива = нумерация файлов.');
L.push('  const NPCS = [');
for (const { file, data } of npcs) {
  L.push(`    // ${file}`);
  L.push(jsObjectAt(data, 4) + ',');
}
L.push('  ];');
L.push('');
L.push('  return { NPCS };');
L.push('});');
L.push('');

// Атомарная замена (tmp + rename): параллельные require под node --test
// не видят частичный файл (задача 000054, правки по итогам ревью).
writeFileAtomic(OUT_FILE, L.join('\n'));
console.log(`src/npc-data.js перегенерирован: ${npcs.length} NPC.`);

#!/usr/bin/env node
'use strict';
// Перегенерирует униформный JS-модуль src/spells-data.js из каталога
// assets/spells/*.json (source of truth — JSON-файлы, задача 000023).
//
// Зачем: игра открывается двойным кликом (file://), где fetch() локальных
// JSON недоступен, поэтому каталог заклинаний дублируется в JS-модуле.
// После правки JSON в assets/spells/ запустите:
//
//   node scripts/sync-spells-data.js
//
// и закоммитьте оба каталога вместе (тесты tests/spells.test.js
// проверяют точное зеркало JSON <-> JS-модуля).
//
// СТИЛЬ — как scripts/sync-skills-data.js (jsValue/jsObjectAt), но зеркало
// ДОВОЛЬНОЕ: выводятся ТОЛЬКО ключи, присутствующие в JSON, в каноническом
// порядке (схемные ключи без дополнений) — иначе deepEqual каталога в
// тестах не сойдётся.

const fs = require('fs');
const path = require('path');
const { writeFileAtomic } = require('./lib/write-atomic.js');

const ROOT = path.join(__dirname, '..');
const SPELLS_DIR = path.join(ROOT, 'assets', 'spells');
const OUT_FILE = path.join(ROOT, 'src', 'spells-data.js');

// --- Чтение каталога ---
const files = fs.readdirSync(SPELLS_DIR)
  .filter((f) => /^\d{6}\.json$/.test(f))
  .sort();
if (files.length === 0) {
  console.error('assets/spells: не найдено ни одного файла 0000NN.json');
  process.exit(1);
}

const spells = [];
for (const f of files) {
  const data = JSON.parse(
    fs.readFileSync(path.join(SPELLS_DIR, f), 'utf8'));
  if (!data || typeof data.id !== 'string') {
    console.error(`${f}: не найдено поле id — не файл заклинания`);
    process.exit(1);
  }
  spells.push({ file: f, data });
}

// Канонический порядок ключей (схема assets/spells/schema.json).
const KEYS = ['id', 'название', 'школа', 'база', 'степень', 'атрибут',
  'уровень', 'мани', 'действие', 'предметы', 'здания', 'описание'];

// --- Генерация JS ---
const range = `${files[0]} … ${files[files.length - 1]}`;

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

// Блок «{ ... }» с ключами data в каноническом порядке; выводится ТОЛЬКО
// то, что есть в файле (дополнительных ключей не добавляем).
function jsSpellAt(data, col) {
  const pad = ' '.repeat(col);
  const inner = ' '.repeat(col + 2);
  const keys = KEYS.filter((k) => k in data);
  const extra = Object.keys(data).filter((k) => !KEYS.includes(k));
  if (extra.length) {
    console.error(`${data.id}: ключи вне схемы: ${extra.join(', ')}`);
    process.exit(1);
  }
  const lines = keys.map((k) => `${inner}${k}: ${jsValue(data[k])},`);
  return pad + '{\n' + lines.join('\n') + '\n' + pad + '}';
}

const L = [];
L.push('// Каталог заклинаний: униформный JS-модуль (фолбэк для file://).');
L.push('//');
L.push('// Source of truth — JSON-файлы каталога assets/spells/*.json');
L.push('// (одно заклинание — один файл, схема — assets/spells/schema.json,');
L.push('// задача 000023).');
L.push('// Файл ГЕНЕРИРУЕТСЯ скриптом scripts/sync-spells-data.js,');
L.push('// не редактируйте вручную: правьте JSON и пересобирайте модуль.');
L.push('//');
L.push('// Униформный модуль: в браузере — globalThis.Game.SpellsData,');
L.push('// в node — require() (CommonJS).');
L.push('// SPELLS — массив заклинаний В ПОРЯДКЕ ФАЙЛОВ каталога;');
L.push('// SPELLS_BY_ID — индекс по id.');
L.push('');
L.push('(function (root, factory) {');
L.push('  if (typeof module === "object" && module.exports) {');
L.push('    module.exports = factory();');
L.push('  } else {');
L.push('    // В браузере — пространство Game.SpellsData (не смешивать с Game).');
L.push('    root.Game = Object.assign({}, root.Game, { SpellsData: factory() });');
L.push('  }');
L.push('})(typeof globalThis !== "undefined" ? globalThis : self, function () {');
L.push('');
L.push(`  // Заклинания (assets/spells/${range}).`);
L.push('  const SPELLS = [');
for (const s of spells) {
  L.push(`    // ${s.file}`);
  L.push(jsSpellAt(s.data, 4) + ',');
}
L.push('  ];');
L.push('');
L.push('  // Индекс по id — ТЕ ЖЕ объекты, что в SPELLS (идентичность');
L.push('  // важна для сравнений «высшая степень цепочки» в src/spells.js).');
L.push('  const SPELLS_BY_ID = {};');
L.push('  for (const s of SPELLS) SPELLS_BY_ID[s.id] = s;');
L.push('');
L.push('  return { SPELLS, SPELLS_BY_ID };');
L.push('});');
L.push('');

// Атомарная запись (конвенция, SPEC): параллельные читатели под
// node --test не видят частичный файл.
writeFileAtomic(OUT_FILE, L.join('\n'));
console.log(
  `src/spells-data.js перегенерирован: ${spells.length} заклинаний.`);

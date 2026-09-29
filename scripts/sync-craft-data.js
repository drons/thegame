#!/usr/bin/env node
'use strict';
// Перегенерирует униформный JS-модуль src/craft-data.js из каталога
// assets/craft/*.json (source of truth — JSON-файлы, задача 000024).
//
// Зачем: игра открывается двойным кликом (file://), где fetch() локальных
// JSON недоступен, поэтому каталог крафта дублируется в JS-модуле.
// После правки JSON в assets/craft/ запустите:
//
//   node scripts/sync-craft-data.js
//
// и закоммитьте оба каталога вместе (тесты tests/craft.test.js
// проверяют точное зеркало JSON <-> JS-модуля).
//
// СТИЛЬ — как scripts/sync-spells-data.js (jsValue/jsObjectAt), но зеркало
// ДОВОЛЬНОЕ: выводятся ТОЛЬКО ключи, присутствующие в JSON, в каноническом
// порядке (схемные ключи без дополнений) — иначе deepEqual каталога в
// тестах не сойдётся.

const fs = require('fs');
const path = require('path');
const { writeFileAtomic } = require('./lib/write-atomic.js');

const ROOT = path.join(__dirname, '..');
const CRAFT_DIR = path.join(ROOT, 'assets', 'craft');
const OUT_FILE = path.join(ROOT, 'src', 'craft-data.js');

// --- Чтение каталога ---
const files = fs.readdirSync(CRAFT_DIR)
  .filter((f) => /^\d{6}\.json$/.test(f))
  .sort();
if (files.length === 0) {
  console.error('assets/craft: не найдено ни одного файла 0000NN.json');
  process.exit(1);
}

const recipes = [];
for (const f of files) {
  const data = JSON.parse(
    fs.readFileSync(path.join(CRAFT_DIR, f), 'utf8'));
  if (!data || typeof data.id !== 'string') {
    console.error(`${f}: не найдено поле id — не файл рецепта`);
    process.exit(1);
  }
  recipes.push({ file: f, data });
}

// Канонический порядок ключей (схема assets/craft/schema.json).
const KEYS = ['id', 'название', 'тип', 'база', 'результат', 'исходники',
  'навыки', 'здания', 'заклинания', 'уровень', 'описание'];

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
function jsRecipeAt(data, col) {
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
L.push('// Каталог крафта: униформный JS-модуль (фолбэк для file://).');
L.push('//');
L.push('// Source of truth — JSON-файлы каталога assets/craft/*.json');
L.push('// (один рецепт — один файл, схема — assets/craft/schema.json,');
L.push('// задача 000024).');
L.push('// Файл ГЕНЕРИРУЕТСЯ скриптом scripts/sync-craft-data.js,');
L.push('// не редактируйте вручную: правьте JSON и пересобирайте модуль.');
L.push('//');
L.push('// Униформный модуль: в браузере — globalThis.Game.CraftData,');
L.push('// в node — require() (CommonJS).');
L.push('// CRAFT — массив рецептов В ПОРЯДКЕ ФАЙЛОВ каталога;');
L.push('// CRAFT_BY_ID — индекс по id.');
L.push('');
L.push('(function (root, factory) {');
L.push('  if (typeof module === "object" && module.exports) {');
L.push('    module.exports = factory();');
L.push('  } else {');
L.push('    // В браузере — пространство Game.CraftData (не смешивать с Game).');
L.push('    root.Game = Object.assign({}, root.Game, { CraftData: factory() });');
L.push('  }');
L.push('})(typeof globalThis !== "undefined" ? globalThis : self, function () {');
L.push('');
L.push(`  // Рецепты (assets/craft/${range}).`);
L.push('  const CRAFT = [');
for (const r of recipes) {
  L.push(`    // ${r.file}`);
  L.push(jsRecipeAt(r.data, 4) + ',');
}
L.push('  ];');
L.push('');
L.push('  // Индекс по id — ТЕ ЖЕ объекты, что в CRAFT (идентичность');
L.push('  // важна: тесты проверяют CRAFT_BY_ID[id] === CRAFT[i]).');
L.push('  const CRAFT_BY_ID = {};');
L.push('  for (const r of CRAFT) CRAFT_BY_ID[r.id] = r;');
L.push('');
L.push('  return { CRAFT, CRAFT_BY_ID };');
L.push('});');
L.push('');

writeFileAtomic(OUT_FILE, L.join('\n'));
console.log(
  `src/craft-data.js перегенерирован: ${recipes.length} рецептов.`);

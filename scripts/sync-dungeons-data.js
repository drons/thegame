#!/usr/bin/env node
'use strict';
// Перегенерирует униформный JS-модуль src/dungeons-data.js из каталога
// assets/dungeons/0000*.json (source of truth — JSON-файлы, задача 000058).
//
// Зачем: игра открывается двойным кликом (file://), где fetch() локальных
// JSON недоступен, поэтому каталог подземелий дублируется в JS-модуле.
// После правки JSON в assets/dungeons/ запустите:
//
//   node scripts/sync-dungeons-data.js
//
// и закоммитьте оба каталога вместе (тесты tests/dungeon.test.js
// проверяют точное зеркало JSON <-> JS-модуля).
//
// Конвенция id: файл 0000NN.json хранит id NN−1 (0..4 = значения
// DUNGEON_TYPES, перенумерации НЕТ — фон боя выбирается по этим
// числам, задача 000049). Множество id по файлам — ровно {0..4}:
// уникальность схемой не выразима, проверяется здесь и в
// tests/dungeon.test.js.
//
// СТИЛЬ — как scripts/sync-spells-data.js (jsValue), но зеркало
// ДОВОЛЬНОЕ: выводятся ТОЛЬКО ключи, присутствующие в JSON, в
// каноническом порядке (схемные ключи без дополнений) — иначе
// deepEqual каталога в тестах не сойдётся.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'assets', 'dungeons');
const OUT_FILE = path.join(ROOT, 'src', 'dungeons-data.js');

// --- Чтение каталога ---
const files = fs.readdirSync(DIR)
  .filter((f) => /^\d{6}\.json$/.test(f))
  .sort();
if (files.length === 0) {
  console.error('assets/dungeons: не найдено ни одного файла 0000NN.json');
  process.exit(1);
}

const dungeons = [];
for (const f of files) {
  const n = parseInt(f, 10);
  const data = JSON.parse(
    fs.readFileSync(path.join(DIR, f), 'utf8'));
  // id = номер файла − 1 (значения DUNGEON_TYPES, 000049).
  if (!data || !Number.isInteger(data.id) || data.id !== n - 1) {
    console.error(`${f}: id ≠ номер файла − 1 (ожидалось ${n - 1})`);
    process.exit(1);
  }
  dungeons.push({ file: f, data });
}
// Множество id — ровно {0..4} (уникальность схемой не выразима).
const ids = dungeons.map((d) => d.data.id).sort((a, b) => a - b);
if (JSON.stringify(ids) !== JSON.stringify([0, 1, 2, 3, 4])) {
  console.error(`множество id ≠ {0..4}: ${ids.join(', ')}`);
  process.exit(1);
}

// Канонический порядок ключей (схема assets/dungeons/schema.json).
const KEYS = ['id', 'название', 'мобы', 'предметы', 'размер', 'постройка'];

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
function jsDungeonAt(data, col) {
  const pad = ' '.repeat(col);
  const inner = ' '.repeat(col + 2);
  const keys = KEYS.filter((k) => k in data);
  const extra = Object.keys(data).filter((k) => !KEYS.includes(k));
  if (extra.length) {
    console.error(`id ${data.id}: ключи вне схемы: ${extra.join(', ')}`);
    process.exit(1);
  }
  const lines = keys.map((k) => `${inner}${k}: ${jsValue(data[k])},`);
  return pad + '{\n' + lines.join('\n') + '\n' + pad + '}';
}

const L = [];
L.push('// Каталог подземелий: униформный JS-модуль (фолбэк для file://).');
L.push('//');
L.push('// Source of truth — JSON-файлы каталога assets/dungeons/0000*.json');
L.push('// (один тип подземелья — один файл, схема —');
L.push('// assets/dungeons/schema.json, задача 000058).');
L.push('// Файл ГЕНЕРИРУЕТСЯ скриптом scripts/sync-dungeons-data.js,');
L.push('// не редактируйте вручную: правьте JSON и пересобирайте модуль.');
L.push('//');
L.push('// Униформный модуль: в браузере — globalThis.Game.DungeonsData,');
L.push('// в node — require() (CommonJS).');
L.push('// DUNGEONS — массив записей В ПОРЯДКЕ ФАЙЛОВ каталога;');
L.push('// DUNGEONS_BY_ID — индекс по id (значения DUNGEON_TYPES, 0..4).');
L.push('');
L.push('(function (root, factory) {');
L.push('  if (typeof module === "object" && module.exports) {');
L.push('    module.exports = factory();');
L.push('  } else {');
L.push('    // В браузере — пространство Game.DungeonsData (не смешивать с Game).');
L.push('    root.Game = Object.assign({}, root.Game, { DungeonsData: factory() });');
L.push('  }');
L.push('})(typeof globalThis !== "undefined" ? globalThis : self, function () {');
L.push('');
L.push(`  // Подземелья (assets/dungeons/${range}).`);
L.push('  const DUNGEONS = [');
for (const d of dungeons) {
  L.push(`    // ${d.file}`);
  L.push(jsDungeonAt(d.data, 4) + ',');
}
L.push('  ];');
L.push('');
L.push('  // Индекс по id — ТЕ ЖЕ объекты, что в DUNGEONS.');
L.push('  const DUNGEONS_BY_ID = {};');
L.push('  for (const d of DUNGEONS) DUNGEONS_BY_ID[d.id] = d;');
L.push('');
L.push('  return { DUNGEONS, DUNGEONS_BY_ID };');
L.push('});');
L.push('');

fs.writeFileSync(OUT_FILE, L.join('\n'), 'utf8');
console.log(
  `src/dungeons-data.js перегенерирован: ${dungeons.length} подземелий.`);

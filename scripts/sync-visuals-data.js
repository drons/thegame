#!/usr/bin/env node
'use strict';
// Перегенерирует униформный JS-модуль src/visuals-data.js из каталога
// assets/visuals/*.json (source of truth — JSON-файлы, задача 000059).
//
// Зачем: декорации тайлов (задача 000021) ранее держались ручной
// JS-копией (литерал VISUALS) прямо внутри src/sprites.js, рядом с
// логикой. Теперь данные — в отдельном генерируемом модуле
// (в браузере — Game.VisualsData, в node — require()), а sprites.js —
// потребитель без собственной копии. После правки JSON в
// assets/visuals/ запустите:
//
//   node scripts/sync-visuals-data.js
//
// и закоммитьте оба каталога вместе (тесты tests/sprites.test.js
// проверяют точное зеркало JSON <-> JS-модуля).
//
// Конвенция id: файл 0000NN.json хранит id NN (000001.json → id 1,
// закреплено тестом «id = номер файла», tests/sprites.test.js).
// Множество id по файлам — ровно {1..N}: уникальность схемой не
// выразима, проверяется здесь и в тестах. Перенумерации НЕТ —
// визуалы в сейв не пишутся, но порядок каталога входит в формулы
// tileVisuals (seed от id) — golden-тесты его фиксируют.
//
// СТИЛЬ — как scripts/sync-npc-data.js / sync-dungeons-data.js:
// идемпотентность (повторный запуск byte-identical, дрейф-гейт 000054),
// читабельные ошибки на битом входе (id ≠ номер файла, дубли id,
// ключи вне схемы → exit 1), атомарная запись
// (scripts/lib/write-atomic.js).

const fs = require('fs');
const path = require('path');
const { writeFileAtomic } = require('./lib/write-atomic.js');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'assets', 'visuals');
const OUT_FILE = path.join(ROOT, 'src', 'visuals-data.js');

// --- Чтение каталога ---
const files = fs.readdirSync(DIR)
  .filter((f) => /^\d{6}\.json$/.test(f))
  .sort();
if (files.length === 0) {
  console.error('assets/visuals: не найдено ни одного файла 0000NN.json');
  process.exit(1);
}

const visuals = [];
for (const f of files) {
  const n = parseInt(f, 10);
  const data = JSON.parse(
    fs.readFileSync(path.join(DIR, f), 'utf8'));
  // id = номер файла (конвенция каталога, 000021).
  if (!data || !Number.isInteger(data.id) || data.id !== n) {
    console.error(`${f}: id ≠ номер файла (ожидалось ${n})`);
    process.exit(1);
  }
  visuals.push({ file: f, data });
}
// Множество id — ровно {1..N} (уникальность схемой не выразима).
const ids = visuals.map((v) => v.data.id).sort((a, b) => a - b);
for (let i = 0; i < ids.length; i++) {
  if (ids[i] !== i + 1) {
    console.error(`множество id ≠ {1..${ids.length}}: ${ids.join(', ')}`);
    process.exit(1);
  }
}

// Канонический порядок ключей (схема assets/visuals/schema.json).
const KEYS = ['id', 'название', 'террейны', 'спрайт', 'частота', 'размер'];

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
// то, что есть в файле (дополнительных ключей не добавляем — deepEqual
// каталога в тестах обязан сойтись).
function jsVisualAt(data, col) {
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
L.push('// Каталог декораций тайлов: униформный JS-модуль (фолбэк для');
L.push('// file://, задача 000021).');
L.push('//');
L.push('// Source of truth — JSON-файлы каталога assets/visuals/*.json');
L.push('// (один элемент — один файл, схема — assets/visuals/schema.json);');
L.push('// id = номер файла. Спрайты — assets/sprites/visuals/.');
L.push('// GENERATED — не править руками, синхронизируется из assets/visuals (scripts/sync-visuals-data.js).');
L.push('// Не редактируйте вручную: правьте JSON и пересобирайте модуль');
L.push('// (node scripts/sync-visuals-data.js, npm sync:visuals).');
L.push('//');
L.push('// Униформный модуль: в браузере — globalThis.Game.VisualsData,');
L.push('// в node — require() (CommonJS). Потребитель — src/sprites.js:');
L.push('// данные снимаются ОДИН раз при загрузке (index.html:');
L.push('// visuals-data.js ДО sprites.js), собственной копии каталога');
L.push('// в потребителе нет (задача 000059).');
L.push('');
L.push('(function (root, factory) {');
L.push('  if (typeof module === "object" && module.exports) {');
L.push('    module.exports = factory();');
L.push('  } else {');
L.push('    // В браузере — пространство Game.VisualsData (не смешивать с Game).');
L.push('    root.Game = Object.assign({}, root.Game, { VisualsData: factory() });');
L.push('  }');
L.push('})(typeof globalThis !== "undefined" ? globalThis : self, function () {');
L.push('');
L.push(`  // Декорации (assets/visuals/${range});`);
L.push('  // порядок массива = нумерация файлов (id = номер файла).');
L.push('  const VISUALS = [');
for (const { file, data } of visuals) {
  L.push(`    // ${file}`);
  L.push(jsVisualAt(data, 4) + ',');
}
L.push('  ];');
L.push('');
L.push('  return { VISUALS };');
L.push('});');
L.push('');

// Атомарная замена (tmp + rename): параллельные require под node --test
// не видят частичный файл (задача 000054, правки по итогам ревью).
writeFileAtomic(OUT_FILE, L.join('\n'));
console.log(`src/visuals-data.js перегенерирован: ${visuals.length} декораций.`);

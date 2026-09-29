#!/usr/bin/env node
'use strict';
// Перегенерирует униформный JS-модуль src/items-data.js из каталога
// assets/items/*.json (source of truth — JSON-файлы, задача 000059).
//
// Зачем: игра открывается двойным кликом (file://), где fetch() локальных
// JSON недоступен, поэтому каталог предметов дублируется в JS-модуле
// (в браузере — Game.ITEMS, в node — require()).
// После правки JSON в assets/items/ запустите:
//
//   node scripts/sync-items-data.js
//
// и закоммитьте оба каталога вместе (тесты tests/items.test.js
// проверяют консистентность JSON <-> JS-модуля).
//
// Контракт файла СОХРАНЯЕТСЯ (плоский namespace Game.ITEMS, а не
// Game.ItemsData): items.js и все vm-цепочки читают G.ITEMS — ноль
// правок в потребителях (задача 000059).
//
// Конвенция id: id предметов НЕ перенумеруются и не меняются — сейв v1
// ссылается на id (npcStocks/quests, задача 000031); данные переносятся
// 1:1 (дополнительных ключей не добавляем, глубокий deepEqual каталога
// в тестах обязан сойтись).
//
// СТИЛЬ — как scripts/sync-npc-data.js / sync-dungeons-data.js:
// идемпотентность (повторный запуск byte-identical, дрейф-гейт 000054),
// читабельные ошибки на битом входе (id по паттерну, дубли id, ключи
// вне схемы → exit 1), атомарная запись (scripts/lib/write-atomic.js).

const fs = require('fs');
const path = require('path');
const { writeFileAtomic } = require('./lib/write-atomic.js');

const ROOT = path.join(__dirname, '..');
const ITEMS_DIR = path.join(ROOT, 'assets', 'items');
const OUT_FILE = path.join(ROOT, 'src', 'items-data.js');

// --- Чтение каталога ---
const files = fs.readdirSync(ITEMS_DIR)
  .filter((f) => /^\d{6}\.json$/.test(f))
  .sort();
if (files.length === 0) {
  console.error('assets/items: не найдено ни одного файла 0000NN.json');
  process.exit(1);
}

const items = [];
const seenIds = new Set();
for (const f of files) {
  const data = JSON.parse(
    fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8'));
  // Минимальная проверка (полная структура закреплена в
  // schema.json, задача 000015; семантика — в src/items.js).
  if (!data || typeof data.id !== 'string' ||
      !/^[a-z][a-z0-9_]*$/.test(data.id) ||
      typeof data.name !== 'string' ||
      typeof data.kind !== 'string' ||
      typeof data.weight !== 'number' ||
      typeof data.value !== 'number' ||
      typeof data.desc !== 'string') {
    console.error(`${f}: нет валидных полей id/name/kind/weight/value/desc`);
    process.exit(1);
  }
  if (seenIds.has(data.id)) {
    console.error(`${f}: дубликат id ${data.id}`);
    process.exit(1);
  }
  seenIds.add(data.id);
  items.push({ file: f, data });
}

// Канонический порядок ключей (схема assets/items/schema.json).
const KEYS = ['id', 'name', 'kind', 'subtype', 'weight', 'value', 'desc',
  'stats', 'effect'];

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
// то, что есть в файле (довольное зеркало — deepEqual каталога в тестах).
function jsItemAt(data, file, col) {
  const pad = ' '.repeat(col);
  const inner = ' '.repeat(col + 2);
  const keys = KEYS.filter((k) => k in data);
  const extra = Object.keys(data).filter((k) => !KEYS.includes(k));
  if (extra.length) {
    console.error(`${file}: ${data.id}: ключи вне схемы: ${extra.join(', ')}`);
    process.exit(1);
  }
  const lines = keys.map((k) => `${inner}${k}: ${jsValue(data[k])},`);
  return pad + '{\n' + lines.join('\n') + '\n' + pad + '}';
}

const L = [];
L.push('// Каталог предметов: униформный JS-модуль (фолбэк для file://).');
L.push('//');
L.push('// Source of truth — JSON-файлы каталога assets/items/*.json');
L.push('// (один предмет — один файл, схема — assets/items/schema.json).');
L.push('// GENERATED — не править руками, синхронизируется из assets/items (scripts/sync-items-data.js).');
L.push('// Не редактируйте вручную: правьте JSON и пересобирайте модуль');
L.push('// (node scripts/sync-items-data.js, npm sync:items).');
L.push('//');
L.push('// Униформный модуль: в браузере — flat-namespace globalThis.Game');
L.push('// (поле ITEMS — items.js и vm-цепочки читают G.ITEMS, контракт');
L.push('// без изменений, задача 000059), в node — require() (CommonJS).');
L.push('');
L.push('(function (root, factory) {');
L.push('  if (typeof module === "object" && module.exports) {');
L.push('    module.exports = factory();');
L.push('  } else {');
L.push('    // В браузере — плоское поле Game.ITEMS (не Game.ItemsData).');
L.push('    root.Game = Object.assign({}, root.Game, factory());');
L.push('  }');
L.push('})(typeof globalThis !== "undefined" ? globalThis : self, function () {');
L.push('');
L.push(`  // Предметы (assets/items/${range});`);
L.push('  // порядок массива = нумерация файлов.');
L.push('  const ITEMS = [');
for (const { file, data } of items) {
  L.push(`    // ${file}`);
  L.push(jsItemAt(data, file, 4) + ',');
}
L.push('  ];');
L.push('');
L.push('  return { ITEMS };');
L.push('});');
L.push('');

// Атомарная замена (tmp + rename): параллельные require под node --test
// не видят частичный файл (задача 000054, правки по итогам ревью).
writeFileAtomic(OUT_FILE, L.join('\n'));
console.log(`src/items-data.js перегенерирован: ${items.length} предметов.`);

#!/usr/bin/env node
'use strict';
// Перегенерирует униформный JS-модуль src/portraits-data.js из каталога
// assets/portraits/*.json (source of truth — JSON-файлы, задача 000142).
//
// Зачем: игра открывается двойным кликом (file://), где fetch() локальных
// JSON недоступен, поэтому каталог портретов партии (Флогистон, Эфир,
// 6 наёмных) дублируется в JS-модуле (в браузере — Game.PortraitsData,
// в node — require()).
// После правки JSON в assets/portraits/ запустите:
//
//   node scripts/sync-portraits.js
//
// (часть npm run sync:all; дрейф-гейт — npm run sync:check).
//
// Вход — ЯВНЫЙ канонический список из 8 файлов (смешанные имена
// flogiston.json / npc-0000NN.json не охватывает фильтр 0000NN.json);
// лишний файл в каталоге — ошибка (защита от мусора). Связка наёмных
// с assets/npc/ (id/имя/роль/описание) — одна точка правды.

const fs = require('fs');
const path = require('path');
const { writeFileAtomic } = require('./lib/write-atomic.js');

const ROOT = path.join(__dirname, '..');
const PDIR = path.join(ROOT, 'assets', 'portraits');
const NPC_DIR = path.join(ROOT, 'assets', 'npc');
const OUT_FILE = path.join(ROOT, 'src', 'portraits-data.js');

// Канонический порядок каталога (зеркало генерируется в нём, не по
// readdir): герой, дух, 6 наёмных — номера NPC-каталога 000012..17.
const CANON_FILES = [
  'flogiston.json', 'efir.json',
  'npc-000012.json', 'npc-000013.json', 'npc-000014.json',
  'npc-000015.json', 'npc-000016.json', 'npc-000017.json',
];
const KIND_BY_FILE = { 'flogiston.json': 'hero', 'efir.json': 'efir' };

function fail(msg) {
  console.error('sync-portraits: ' + msg);
  process.exit(1);
}

const upperFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// --- Чтение каталога и валидация ---
if (!fs.existsSync(PDIR)) {
  fail('assets/portraits/ отсутствует (каталог портретов партии)');
}
const onDisk = new Set(fs.readdirSync(PDIR));
const known = new Set();
for (const f of CANON_FILES) {
  known.add(f);
  known.add(f.replace(/\.json$/, '.svg'));
  if (!onDisk.has(f)) fail(f + ': нет файла каталога (assets/portraits/)');
}
for (const f of onDisk) {
  if (!known.has(f)) {
    fail(f + ': лишний файл в каталоге портретов (канон — 8 JSON + 8 SVG)');
  }
}

const portraits = [];
const seenIds = new Set();
for (const f of CANON_FILES) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(path.join(PDIR, f), 'utf8'));
  } catch (e) {
    fail(f + ': не JSON: ' + e.message);
  }
  // Схема записи (порядок ключей — канонический:
  // id, имя, icon, title, kind, description).
  const expectKeys = ['id', 'имя', 'icon', 'title', 'kind', 'description'];
  if (JSON.stringify(Object.keys(data || {})) !== JSON.stringify(expectKeys)) {
    fail(f + ': порядок/состав ключей обязан быть ' + expectKeys.join('/'));
  }
  for (const k of expectKeys) {
    if (typeof data[k] !== 'string' || data[k].trim() === '') {
      fail(f + ': поле «' + k + '» — не пустая строка');
    }
  }
  if (!/^[a-z][a-z0-9_]*$/.test(data.id)) {
    fail(f + ': id «' + data.id + '» (^[a-z][a-z0-9_]*$)');
  }
  if (seenIds.has(data.id)) fail(f + ': дубликат id «' + data.id + '»');
  seenIds.add(data.id);
  if (!/^[a-z0-9-]+\.svg$/.test(data.icon)) {
    fail(f + ': icon «' + data.icon + '» (имя SVG-файла каталога)');
  }
  const expectIcon = f.replace(/\.json$/, '.svg');
  if (data.icon !== expectIcon) {
    fail(f + ': icon обязан быть «' + expectIcon + '» (basename JSON)');
  }
  if (!onDisk.has(data.icon)) {
    fail(f + ': иконка assets/portraits/' + data.icon + ' отсутствует');
  }
  const expectKind = f.startsWith('npc-') ? 'merc' : KIND_BY_FILE[f];
  if (data.kind !== expectKind) {
    fail(f + ': kind «' + data.kind + '» обязан совпадать с файлом («' +
      expectKind + '»)');
  }
  // Связка наёмных с каталогом NPC: одна точка правды — assets/npc/
  // (id = npcId спутника; title = upperFirst(роль); description verbatim).
  if (f.startsWith('npc-')) {
    const num = f.slice(4, -5);
    const npcPath = path.join(NPC_DIR, num + '.json');
    if (!fs.existsSync(npcPath)) {
      fail('assets/npc/' + num + '.json отсутствует (каталог NPC)');
    }
    const npc = JSON.parse(fs.readFileSync(npcPath, 'utf8'));
    if (data.id !== npc.id) {
      fail(f + ': id обязан совпадать с id NPC («' + npc.id + '»)');
    }
    if (data.имя !== npc.имя) {
      fail(f + ': имя обязан совпадать с именем NPC («' + npc.имя + '»)');
    }
    if (data.title !== upperFirst(npc.роль)) {
      fail(f + ': title обязан быть «' + upperFirst(npc.роль) +
        '» (upperFirst роли NPC)');
    }
    if (data.description !== npc.описание) {
      fail(f + ': description обязан совпадать с описанием NPC verbatim');
    }
  }
  portraits.push({ file: f, data });
}

// --- Генерация JS ---

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
L.push('// Портреты партии: униформный JS-модуль (фолбэк для file://).');
L.push('//');
L.push('// Source of truth — JSON-файлы каталога assets/portraits/*.json');
L.push('// (задача 000142: герой, дух, 6 наёмных; наёмные связаны с');
L.push('// assets/npc/000012..000017.json).');
L.push('// Файл ГЕНЕРИРУЕТСЯ скриптом scripts/sync-portraits.js,');
L.push('// не редактируйте вручную: правьте JSON и пересобирайте модуль');
L.push('// (npm run sync:all).');
L.push('//');
L.push('// Униформный модуль: в браузере — globalThis.Game.PortraitsData,');
L.push('// в node — require() (CommonJS).');
L.push('');
L.push('(function (root, factory) {');
L.push('  if (typeof module === "object" && module.exports) {');
L.push('    module.exports = factory();');
L.push('  } else {');
L.push('    // В браузере — пространство Game.PortraitsData (не смешивать с Game).');
L.push('    root.Game = Object.assign({}, root.Game, { PortraitsData: factory() });');
L.push('  }');
L.push('})(typeof globalThis !== "undefined" ? globalThis : self, function () {');
L.push('');
L.push('  // Записи каталога (канонический порядок:');
L.push('  // flogiston, efir, npc-000012 … npc-000017).');
L.push('  const PORTRAITS = [');
for (const { file, data } of portraits) {
  L.push(`    // ${file}`);
  L.push(jsObjectAt(data, 4) + ',');
}
L.push('  ];');
L.push('');
L.push('  return { PORTRAITS };');
L.push('});');
L.push('');

// Атомарная замена (tmp + rename): параллельные require под node --test
// не видят частичный файл (задача 000054).
writeFileAtomic(OUT_FILE, L.join('\n'));
console.log(`src/portraits-data.js перегенерирован: ${portraits.length} портретов.`);

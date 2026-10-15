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
//
// Задача 000211.05: 4 группы ссылочных полей (мобы[], предметы[],
// постройка, руда[].предмет) — ссылки на файлы каталогов
// («assets/<каталог>/NNNNNN.json», контракт 000211.01 §1). При
// сборке резолюция в id файла-цели — зеркало src/dungeons-data.js
// остаётся в id-форме (ссылки живут ТОЛЬКО в JSON). Fail-closed:
// значение не-ссылка (включая голый id — дрейф) или цель-файл
// отсутствует / не JSON / без id → exit 1 (зеркало только id-форма,
// lenient pass-through запрещён: ссылка в зеркале → гард
// validDungeonCatalog отклонил бы каталог в рантайме).

const fs = require('fs');
const path = require('path');
const { writeFileAtomic } = require('./lib/write-atomic.js');
const { isRef, resolveRef } = require('./lib/json-ref.js');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'assets', 'dungeons');
const OUT_FILE = path.join(ROOT, 'src', 'dungeons-data.js');

// Строгий резолв значения ссылочного поля → id файла-цели (000211.05).
// where — where-стиль (мобы[2] / постройка / руда[3].предмет).
function resolveRefField(file, where, value) {
  if (!isRef(value)) {
    console.error(
      `${file}: ${where} «${JSON.stringify(value)}» — не ссылка на файл`
      + ' каталога (формат "assets/<каталог>/NNNNNN.json")');
    process.exit(1);
  }
  const r = resolveRef(ROOT, value);
  if (!r.ok) {
    console.error(`${file}: ${where} «${value}» — не резолвится: ${r.reason}`);
    process.exit(1);
  }
  return r.id;
}

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
  // 000211.05: ссылки 4 групп → id (ПЕРЕД эмиссией; зеркало —
  // id-форма). Поля резолвятся только при присутствии (схема не
  // требует «руда» — гард рантайма допускает отсутствие).
  if (Array.isArray(data.мобы)) {
    data.мобы = data.мобы.map(
      (v, i) => resolveRefField(f, `мобы[${i}]`, v));
  }
  if (Array.isArray(data.предметы)) {
    data.предметы = data.предметы.map(
      (v, i) => resolveRefField(f, `предметы[${i}]`, v));
  }
  if (data.постройка !== undefined) {
    data.постройка = resolveRefField(f, 'постройка', data.постройка);
  }
  if (Array.isArray(data.руда)) {
    data.руда = data.руда.map((rec, i) => {
      if (rec && typeof rec === 'object') {
        rec.предмет =
          resolveRefField(f, `руда[${i}].предмет`, rec.предмет);
      }
      return rec;
    });
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
const KEYS = ['id', 'название', 'мобы', 'предметы', 'размер', 'постройка', 'объекты_стен', 'руда'];

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

// Атомарная запись (конвенция, SPEC): параллельные читатели под
// node --test не видят частичный файл.
writeFileAtomic(OUT_FILE, L.join('\n'));
console.log(
  `src/dungeons-data.js перегенерирован: ${dungeons.length} подземелий.`);

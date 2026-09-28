#!/usr/bin/env node
'use strict';
// Перегенерирует блок данных BUILDINGS в src/buildings.js из каталога
// assets/buildings/0000*.json (source of truth — JSON-файлы).
//
// Зачем: игра открывается двойным кликом (file://), где fetch() локальных
// JSON недоступен, поэтому каталог зданий дублируется в JS-модуле
// (в браузере — Game.BUILDINGS, в node — require()).
// После правки JSON в assets/buildings/ запустите:
//
//   node scripts/sync-buildings-data.js
//
// и закоммитьте оба каталога вместе (тесты tests/buildings.test.js
// проверяют консистентность JSON <-> JS-модуля и идемпотентность).
//
// Скрипт регенерирует ТОЛЬКО блок данных между маркерами
// «// BEGIN GENERATED (scripts/sync-buildings-data.js)» и
// «// END GENERATED»; шапка файла и вся не-данные логика (индексы,
// buildingSize/buildingEntranceRel/sizeChain/placeBuilding) не
// затрагиваются. Форматирование детерминировано (порядок ключей JSON),
// повторный запуск — byte-identical (идемпотентность).

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'assets', 'buildings');
const OUT_FILE = path.join(ROOT, 'src', 'buildings.js');
const BEGIN = '// BEGIN GENERATED (scripts/sync-buildings-data.js)';
const END = '// END GENERATED';
const HEADER =
  'GENERATED — не править руками, синхронизируется из assets/buildings ' +
  '(scripts/sync-buildings-data.js)';

// --- Чтение каталога ---
const files = fs.readdirSync(DIR)
  .filter((f) => /^\d{6}\.json$/.test(f))
  .sort();
if (files.length === 0) {
  console.error('assets/buildings: не найдено ни одного файла 0000NN.json');
  process.exit(1);
}

// Обязательные поля (список — assets/buildings/schema.json, «required»).
const REQUIRED = [
  'id', 'название', 'категория', 'функция',
  'типичный_npc', 'допустимые_тайлы', 'особые_параметры',
];
const buildings = [];
for (const f of files) {
  const n = parseInt(f, 10);
  const data = JSON.parse(
    fs.readFileSync(path.join(DIR, f), 'utf8'));
  // Минимальная проверка (полная структура закреплена в schema.json,
  // сверка с JS-модулем — в tests/buildings.test.js).
  if (!data || data.id !== n) {
    console.error(`${f}: id ≠ номер файла (${n})`);
    process.exit(1);
  }
  for (const k of REQUIRED) {
    if (!(k in data)) {
      console.error(`${f}: нет обязательного поля «${k}»`);
      process.exit(1);
    }
  }
  buildings.push({ file: f, data });
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

// Заголовок секции при смене категории (в каталоге записи идут
// категорией — порядок закреплён тестом tests/buildings.test.js).
const CATEGORY_TITLES = {
  магазин: 'Магазины',
  школа_навыков: 'Школы навыков',
  дом_npc: 'Дома NPC',
  пещера: 'Пещеры',
  храм: 'Храмы',
  магический_знак: 'Магические знаки',
  прочее: 'Прочие',
};

const L = [];
let lastCat = null;
for (const { file, data } of buildings) {
  if (data.категория !== lastCat) {
    L.push(`    // --- ${CATEGORY_TITLES[data.категория] || data.категория} ---`);
    lastCat = data.категория;
  }
  L.push(`    // ${file}`);
  L.push(jsObjectAt(data, 4) + ',');
}
const block = '  const BUILDINGS = [\n' + L.join('\n') + '\n  ];';

// --- Подмена блока данных в src/buildings.js ---
let src = fs.readFileSync(OUT_FILE, 'utf8');
if (!src.includes(HEADER)) {
  console.error(`${OUT_FILE}: в шапке нет пометки «${HEADER}»`);
  process.exit(1);
}
const bIdx = src.indexOf(BEGIN);
const eIdx = src.indexOf(END);
if (bIdx === -1 || eIdx === -1 || eIdx < bIdx) {
  console.error(
    `${OUT_FILE}: не найдены маркеры «${BEGIN}» и «${END}»`);
  process.exit(1);
}
const out = src.slice(0, bIdx + BEGIN.length) + '\n' + block + '\n' +
  src.slice(eIdx);
fs.writeFileSync(OUT_FILE, out, 'utf8');
console.log(`src/buildings.js перегенерирован: ${buildings.length} типов.`);

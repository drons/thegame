#!/usr/bin/env node
'use strict';
// Перегенерирует униформный JS-модуль src/mob-groups-data.js из каталога
// assets/mob_groups/*.json (source of truth — JSON-файлы, задача 000057).
//
// Зачем: игра открывается двойным кликом (file://), где fetch() локальных
// JSON недоступен, поэтому каталог стационарных групп мобов дублируется
// в JS-модуле (в браузере — Game.MobGroupsData, в node — require()).
// После правки JSON в assets/mob_groups/ запустите:
//
//   node scripts/sync-mob-groups-data.js
//
// (npm sync:mobgroups) и закоммитьте оба каталога вместе (тесты
// tests/mob-groups.test.js проверяют консистентность JSON <-> JS-модуля
// и идемпотентность).
//
// ВАЖНО: сгенерированный модуль НЕ содержит require внутри (паттерн
// 000049/000053): vm-песочницы (combat-ui/sprites) исполняют его без
// module-окружения и не должны тянуть зависимости. Форматирование
// детерминировано (порядок ключей JSON), повторный запуск —
// byte-identical (идемпотентность).

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'assets', 'mob_groups');
const OUT_FILE = path.join(ROOT, 'src', 'mob-groups-data.js');
const HEADER =
  'GENERATED — не править руками, синхронизируется из assets/mob_groups ' +
  '(scripts/sync-mob-groups-data.js)';

// --- Чтение каталога ---
const files = fs.readdirSync(DIR)
  .filter((f) => /^\d{6}\.json$/.test(f))
  .sort();
if (files.length === 0) {
  console.error('assets/mob_groups: не найдено ни одного файла 0000NN.json');
  process.exit(1);
}

const groups = [];
for (const f of files) {
  const n = parseInt(f, 10);
  const data = JSON.parse(
    fs.readFileSync(path.join(DIR, f), 'utf8'));
  // Минимальная проверка (полная структура закреплена в schema.json,
  // ссылочная целостность id мобов — в tests/mob-groups.test.js).
  if (!data || data.id !== n) {
    console.error(`${f}: id ≠ номер файла (${n})`);
    process.exit(1);
  }
  if (typeof data.название !== 'string' || data.название.trim() === '' ||
      !data.состав || typeof data.состав !== 'object' ||
      typeof data.состав.название !== 'string' ||
      data.состав.название.trim() === '' ||
      !Array.isArray(data.состав.мобы) || data.состав.мобы.length === 0 ||
      typeof data.спрайт !== 'string' || data.спрайт.trim() === '') {
    console.error(`${f}: нет валидных полей название/состав/спрайт`);
    process.exit(1);
  }
  groups.push({ file: f, data });
}

// --- Генерация JS ---
const range = `${groups[0].file} … ${groups[groups.length - 1].file}`;

// Форматирует значение JS-литералом (JSON-совместимо).
function jsValue(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return '[' + v.map(jsValue).join(', ') + ']';
  if (typeof v === 'object') {
    const inner = Object.keys(v)
      .map((k) => k + ': ' + jsValue(v[k])).join(', ');
    return inner === '' ? '{}' : '{ ' + inner + ' }';
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
L.push('// Каталог стационарных групп мобов: униформный JS-модуль');
L.push('// (фолбэк для file://).');
L.push('//');
L.push('// Source of truth — JSON-файлы каталога assets/mob_groups/*.json');
L.push('// (одна группа — один файл, схема — assets/mob_groups/schema.json).');
L.push('// Файл ГЕНЕРИРУЕТСЯ скриптом scripts/sync-mob-groups-data.js,');
L.push(`// ${HEADER}`);
L.push('//');
L.push('// Униформный модуль: в браузере — globalThis.Game.MobGroupsData,');
L.push('// в node — CommonJS. Внутри модуля нет обращений к загрузчику');
L.push('// (паттерн 000049/000053): vm-песочницы (combat-ui/sprites)');
L.push('// исполняют файл без module-окружения и не должны тянуть');
L.push('// зависимости.');
L.push('');
L.push('(function (root, factory) {');
L.push('  if (typeof module === "object" && module.exports) {');
L.push('    module.exports = factory();');
L.push('  } else {');
L.push('    // В браузере — пространство Game.MobGroupsData (не смешивать с Game).');
L.push('    root.Game = Object.assign({}, root.Game, { MobGroupsData: factory() });');
L.push('  }');
L.push('})(typeof globalThis !== "undefined" ? globalThis : self, function () {');
L.push('');
L.push(`  // Записи групп (assets/mob_groups/${range});`);
L.push('  // порядок массива = нумерация файлов; позиция = id − 1 =');
L.push('  // кодовый индекс группы (hash2 % N, MOB_GROUP_TYPES в src/map.js).');
L.push('  const MOB_GROUPS = [');
for (const { file, data } of groups) {
  L.push(`    // ${file}`);
  L.push(jsObjectAt(data, 4) + ',');
}
L.push('  ];');
L.push('');
L.push('  return { MOB_GROUPS };');
L.push('});');
L.push('');

fs.writeFileSync(OUT_FILE, L.join('\n'), 'utf8');
console.log(`src/mob-groups-data.js перегенерирован: ${groups.length} групп.`);

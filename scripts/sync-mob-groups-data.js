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
// Запись выхода — атомарная (tmp + rename, scripts/lib/write-atomic.js,
// конвенция ВСЕХ sync-скриптов из 000054): параллельные require под
// node --test не видят частичный файл.
//
// ВАЖНО: сгенерированный модуль НЕ содержит require внутри (паттерн
// 000049/000053): vm-песочницы (combat-ui/sprites) исполняют его без
// module-окружения и не должны тянуть зависимости. Форматирование
// детерминировано (порядок ключей JSON), повторный запуск —
// byte-identical (идемпотентность).

const fs = require('fs');
const path = require('path');
const { writeFileAtomic } = require('./lib/write-atomic.js');
const { isRefPath, ASSET_NAME_SHAPES, SHAPE_BASENAME_RES } =
  require('./lib/json-ref.js');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'assets', 'mob_groups');
const OUT_FILE = path.join(ROOT, 'src', 'mob-groups-data.js');
const HEADER =
  'GENERATED — не править руками, синхронизируется из assets/mob_groups ' +
  '(scripts/sync-mob-groups-data.js)';

// --- Чтение каталога ---
const files = fs.readdirSync(DIR)
  .filter((f) => f !== 'schema.json'
    && SHAPE_BASENAME_RES[ASSET_NAME_SHAPES.mob_groups].test(f));
if (files.length === 0) {
  console.error('assets/mob_groups: не найдено ни одного файла <slug>.json');
  process.exit(1);
}

// Задача 000211.08: состав.мобы — ссылка на файл
// «assets/mobs/<id>.json» (контракт 000211 §2, шейп slug — 000318.04);
// при запекании
// резолюция в id файла-цели — зеркало src/mob-groups-data.js остаётся
// в id-форме (ссылки живут ТОЛЬКО в JSON). Fail-closed: значение
// вне паттерна (включая голый id — дрейф), файл-цель отсутствует /
// не JSON / без непустого строкового id → exit 1 (000207); кэш
// цели — 1 чтение на уникальную ссылку (000208).
const MOBS_REF_CACHE = new Map();
function resolveMobRef(file, ref, where) {
  const prefix = 'assets/mobs/';
  if (typeof ref !== 'string' || !ref.startsWith(prefix)
    || !isRefPath('mobs', ref.slice(prefix.length))) {
    console.error(
      `${file}: ${where} «${ref}» — не ссылка `
      + 'на файл mobs (формат "assets/mobs/<id>.json")');
    process.exit(1);
  }
  if (MOBS_REF_CACHE.has(ref)) return MOBS_REF_CACHE.get(ref);
  const target = path.join(ROOT, ref);
  let tj;
  try {
    tj = JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch {
    console.error(
      `${file}: ${where} цель ссылки «${ref}» — файл отсутствует или не JSON`);
    process.exit(1);
  }
  if (!tj || typeof tj.id !== 'string' || tj.id === '') {
    console.error(`${file}: ${where} цель ссылки «${ref}» — id отсутствует`);
    process.exit(1);
  }
  MOBS_REF_CACHE.set(ref, tj.id);
  return tj.id;
}

const entries = [];
for (const f of files) {
  const data = JSON.parse(
    fs.readFileSync(path.join(DIR, f), 'utf8'));
  // Минимальная проверка (полная структура закреплена в schema.json,
  // ссылочная целостность id мобов — в tests/mob-groups.test.js).
  // Номера в имени файла НЕТ (000318.04) — id проверяется как целое,
  // множество {1..N} и уникальность — после сбора каталога.
  if (!data || !Number.isInteger(data.id)) {
    console.error(`${f}: id отсутствует или не целый`);
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
  // Задача 000211.08: ссылки состав.мобы → id целей (до генерации;
  // зеркало — в id-форме); «кадры» — аддитивное поле, as-is.
  entries.push({ file: f, data });
}

// Множество id — ровно {1..N}, уникально (номера файлов более не носитель).
const sortedIds = entries.map((e) => e.data.id).sort((a, b) => a - b);
const expectIds = Array.from({ length: entries.length }, (_, i) => i + 1);
if (JSON.stringify(sortedIds) !== JSON.stringify(expectIds)) {
  console.error(
    `множество id ≠ {1..${entries.length}}: ${sortedIds.join(', ')}`);
  process.exit(1);
}

// Порядок зеркал — ПО ЧИСЛОВИЧ data.id: позиция = id − 1 = кодовый индекс
// группы (MOB_GROUP_TYPES), lex-порядок slug-имён ему не равен (000318.04).
const groups = entries.sort((a, b) => a.data.id - b.data.id);
for (const { file: f, data } of groups) {
  data.состав.мобы = data.состав.мобы.map((m, n) =>
    resolveMobRef(f, m, 'состав.мобы[' + n + ']'));
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
L.push('  // порядок массива = возрастание id; позиция = id − 1 =');
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

// Атомарная замена (tmp + rename): параллельные require под node --test
// не видят частичный файл (задача 000054, правки по итогам ревью).
writeFileAtomic(OUT_FILE, L.join('\n'));
console.log(`src/mob-groups-data.js перегенерирован: ${groups.length} групп.`);

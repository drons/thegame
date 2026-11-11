#!/usr/bin/env node
'use strict';
// Перегенерирует блок данных BUILDINGS в src/buildings.js из каталога
// assets/buildings/<slug>.json (source of truth — JSON-файлы; имя —
// 000318.06: basename «спрайт» / таблица, порядок блока — по data.id).
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
const { writeFileAtomic } = require('./lib/write-atomic.js');
const { isRefPath, ASSET_NAME_SHAPES, SHAPE_BASENAME_RES } =
  require('./lib/json-ref.js');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'assets', 'buildings');
const OUT_FILE = path.join(ROOT, 'src', 'buildings.js');
const BEGIN = '// BEGIN GENERATED (scripts/sync-buildings-data.js)';
const END = '// END GENERATED';
const HEADER =
  'GENERATED — не править руками, синхронизируется из assets/buildings ' +
  '(scripts/sync-buildings-data.js)';

// --- Чтение каталога ---
// Форма имени — из ЖИВОГО реестра lib (000318.06: buildings — slug);
// slug-regex матчит и schema.json — исключаем явно (прецедент .02).
const files = fs.readdirSync(DIR)
  .filter((f) => f !== 'schema.json'
    && SHAPE_BASENAME_RES[ASSET_NAME_SHAPES.buildings].test(f))
  .sort();
if (files.length === 0) {
  console.error('assets/buildings: не найдено ни одного файла каталога');
  process.exit(1);
}

// Обязательные поля (список — assets/buildings/schema.json, «required»).
const REQUIRED = [
  'id', 'название', 'категория', 'функция',
  'типичный_npc', 'допустимые_тайлы', 'особые_параметры', 'icon',
];

// Задача 000207: .стройка.исходники[].предмет — ссылка на файл
// «assets/items/NNNNNN.json» (контракт 000211 §2); при запекании
// резолюция в id файла-цели — зеркало src/buildings.js остаётся
// в id-форме (ссылки живут ТОЛЬКО в JSON). Fail-closed: значение
// вне паттерна (включая голый id — дрейф), файл-цель отсутствует /
// не JSON / без непустого строкового id → exit 1.
function isCatalogRef(catalog, ref) {
  const prefix = 'assets/' + catalog + '/';
  return typeof ref === 'string' && ref.startsWith(prefix)
    && isRefPath(catalog, ref.slice(prefix.length));
}

function resolveItemRef(file, entry) {
  const ref = entry.предмет;
  if (!isCatalogRef('items', ref)) {
    console.error(
      `${file}: .стройка.исходники.предмет «${ref}» — не ссылка `
      + 'на файл items (формат "assets/items/NNNNNN.json")');
    process.exit(1);
  }
  const target = path.join(ROOT, ref);
  let tj;
  try {
    tj = JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch {
    console.error(
      `${file}: цель ссылки «${ref}» — файл отсутствует или не JSON`);
    process.exit(1);
  }
  if (!tj || typeof tj.id !== 'string' || tj.id === '') {
    console.error(`${file}: цель ссылки «${ref}» — id отсутствует`);
    process.exit(1);
  }
  entry.предмет = tj.id;
}
// Задача 000211.07: .особые_параметры.тренирует — ссылки на файлы
// «assets/skills/NNNNNN.json» (контракт 000211 §2); при запекании
// резолюция в id файла-цели — зеркало src/buildings.js остаётся
// в id-форме (ссылки живут ТОЛЬКО в JSON). Fail-closed 1:1
// resolveItemRef: значение вне паттерна (включая голое ИМЯ —
// дрейф), файл-цель отсутствует / не JSON / без непустого
// строкового id → exit 1.
function resolveSkillRef(file, ref) {
  if (!isCatalogRef('skills', ref)) {
    console.error(
      `${file}: .особые_параметры.тренирует «${ref}» — не ссылка `
      + 'на файл skills (формат "assets/skills/NNNNNN.json")');
    process.exit(1);
  }
  const target = path.join(ROOT, ref);
  let tj;
  try {
    tj = JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch {
    console.error(
      `${file}: цель ссылки «${ref}» — файл отсутствует или не JSON`);
    process.exit(1);
  }
  if (!tj || typeof tj.id !== 'string' || tj.id === '') {
    console.error(`${file}: цель ссылки «${ref}» — id отсутствует`);
    process.exit(1);
  }
  return tj.id;
}
const buildings = [];
const seenIds = new Set();
for (const f of files) {
  const data = JSON.parse(
    fs.readFileSync(path.join(DIR, f), 'utf8'));
  // Минимальная проверка (полная структура закреплена в schema.json,
  // сверка с JS-модулем — в tests/buildings.test.js). С 000318.06 имя
  // файла — slug-носитель, «id = номер файла» более не контракт:
  // целостность — целочисленность и уникальность id (порядок блока —
  // компаратор по data.id ниже, байт-в-байт прежний id-порядок).
  if (!data || !Number.isInteger(data.id)) {
    console.error(`${f}: id отсутствует или не целое`);
    process.exit(1);
  }
  if (seenIds.has(data.id)) {
    console.error(`${f}: дубль id ${data.id}`);
    process.exit(1);
  }
  seenIds.add(data.id);
  for (const k of REQUIRED) {
    if (!(k in data)) {
      console.error(`${f}: нет обязательного поля «${k}»`);
      process.exit(1);
    }
  }
  // Задача 000207: ссылки .стройка.исходники[].предмет → id цели
  // (до генерации; зеркало — в id-форме).
  const s = data.особые_параметры && data.особые_параметры.стройка;
  if (s && Array.isArray(s.исходники)) {
    for (const e of s.исходники) {
      resolveItemRef(f, e);
    }
  }
  // Задача 000211.07: «тренирует» — ссылки skills → id цели
  // (до генерации; зеркало — в id-форме; «спрайт» — поле-данные,
  // проходное as-is).
  const tr = data.особые_параметры && data.особые_параметры.тренирует;
  if (tr && Array.isArray(tr)) {
    data.особые_параметры.тренирует = tr.map((v) =>
      resolveSkillRef(f, v));
  }
  buildings.push({ file: f, data });
}
// Порядок блока — по data.id (000318.06): прежний .sort() по имени файла
// был контрактом id-порядка только пока имя = номер; lex-порядок slug-
// имён ≠ id-порядку — без компаратора сдвинулся бы позиционный контракт
// BUILDINGS (getBuilding(i) === BUILDINGS[i-1], секции категорий).
buildings.sort((a, b) => a.data.id - b.data.id);

// --- Генерация JS ---

// Ключ объекта: валидный JS-идентификатор (включая кириллицу) или
// чистый числовой литерал — как есть, иначе — в кавычках (задача
// 000137: ключ per-эффектного раз_в_день «44_perform» — цифра впереди
// НЕ идентификатор: без кавычек `44_perform: true` — синтаксическая
// ошибка «numeric separator», JS-модуль не загружался).
const JS_IDENT_RE = /^\p{ID_Start}\p{ID_Continue}*$/u;
function jsKey(k) {
  if (JS_IDENT_RE.test(k) || /^[+-]?\d+$/.test(k)) {
    return k;
  }
  return JSON.stringify(k);
}

// Форматирует значение JS-литералом (JSON-совместимо).
function jsValue(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return '[' + v.map(jsValue).join(', ') + ']';
  if (typeof v === 'object') {
    return '{ ' +
      Object.keys(v).map((k) => jsKey(k) + ': ' + jsValue(v[k])).join(', ') +
      ' }';
  }
  return JSON.stringify(v);
}

// Блок «{ ... }», открывающая скобка на колонке col, поля на col+2.
function jsObjectAt(data, col) {
  const pad = ' '.repeat(col);
  const inner = ' '.repeat(col + 2);
  const lines = Object.keys(data)
    .map((k) => `${inner}${jsKey(k)}: ${jsValue(data[k])},`);
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
  город: 'Города',
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
// Атомарная запись (конвенция, SPEC): параллельные читатели под
// node --test не видят частичный файл.
writeFileAtomic(OUT_FILE, out);
console.log(`src/buildings.js перегенерирован: ${buildings.length} типов.`);

#!/usr/bin/env node
'use strict';
// Перегенерирует униформный JS-модуль src/skills-data.js из каталога
// assets/skills/*.json (source of truth — JSON-файлы).
//
// Зачем: игра открывается двойным кликом (file://), где fetch() локальных
// JSON недоступен, поэтому каталог навыков дублируется в JS-модуле.
// После правки JSON в assets/skills/ запустите:
//
//   node scripts/sync-skills-data.js
//
// и закоммитьте оба каталога вместе (тесты tests/skills.test.js проверяют
// консистентность JSON <-> JS-модуля <-> player.js).

const fs = require('fs');
const path = require('path');
const { writeFileAtomic } = require('./lib/write-atomic.js');

const ROOT = path.join(__dirname, '..');
const SKILLS_DIR = path.join(ROOT, 'assets', 'skills');
const OUT_FILE = path.join(ROOT, 'src', 'skills-data.js');

// --- Чтение каталога ---
const files = fs.readdirSync(SKILLS_DIR)
  .filter((f) => /^\d{6}\.json$/.test(f))
  .sort();
if (files.length === 0) {
  console.error('assets/skills: не найдено ни одного файла 0000NN.json');
  process.exit(1);
}

const skills = [];
for (const f of files) {
  const data = JSON.parse(
    fs.readFileSync(path.join(SKILLS_DIR, f), 'utf8'));
  if (!data || (data.type !== 'primary' && data.type !== 'secondary')) {
    console.error(`${f}: поле type должно быть "primary" или "secondary"`);
    process.exit(1);
  }
  skills.push({ file: f, data });
}

const primary = skills.filter((s) => s.data.type === 'primary');
const secondary = skills.filter((s) => s.data.type === 'secondary');
if (primary.length === 0 || secondary.length === 0) {
  console.error('assets/skills: каталог должен содержать основные и вторичные навыки');
  process.exit(1);
}

// --- Генерация JS ---
const primaryRange =
  `${primary[0].file} … ${primary[primary.length - 1].file}`;
const secondaryRange =
  `${secondary[0].file} … ${secondary[secondary.length - 1].file}`;

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
L.push('// Каталог навыков: униформный JS-модуль (фолбэк для file://).');
L.push('//');
L.push('// Source of truth — JSON-файлы каталога assets/skills/*.json');
L.push('// (один навык — один файл, схема — assets/skills/schema.json).');
L.push('// Файл ГЕНЕРИРУЕТСЯ скриптом scripts/sync-skills-data.js,');
L.push('// не редактируйте вручную: правьте JSON и пересобирайте модуль.');
L.push('//');
L.push('// Униформный модуль: в браузере — globalThis.Game.SkillsData,');
L.push('// в node — require() (CommonJS).');
L.push('');
L.push('(function (root, factory) {');
L.push('  if (typeof module === "object" && module.exports) {');
L.push('    module.exports = factory();');
L.push('  } else {');
L.push('    // В браузере — пространство Game.SkillsData (не смешивать с Game).');
L.push('    root.Game = Object.assign({}, root.Game, { SkillsData: factory() });');
L.push('  }');
L.push('})(typeof globalThis !== "undefined" ? globalThis : self, function () {');
L.push('');
L.push(`  // Основные навыки (assets/skills/${primaryRange}).`);
L.push('  const PRIMARY_SKILLS = [');
for (const s of primary) {
  L.push(`    // ${s.file}`);
  L.push(jsObjectAt(s.data, 4) + ',');
}
L.push('  ];');
L.push('');
L.push(`  // Вторичные навыки (assets/skills/${secondaryRange}).`);
L.push('  // requires: null | { skill, level } — требование к другому навыку');
L.push('  // (в JSON поле requires опущено, если требования нет).');
L.push('  const SECONDARY_SKILLS = {');
for (const s of secondary) {
  // Порядок ключей канонический; requires: null при отсутствии в JSON.
  const ordered = {
    id: s.data.id,
    type: s.data.type,
    name: s.data.name,
    primary: s.data.primary,
    requires: s.data.requires === undefined ? null : s.data.requires,
    effect: s.data.effect,
    effectType: s.data.effectType,
    desc: s.data.desc,
    names: s.data.names,
  };
  L.push(`    // ${s.file}`);
  L.push(`    ${s.data.id}: {`);
  for (const [k, v] of Object.entries(ordered)) {
    L.push(`      ${k}: ${jsValue(v)},`);
  }
  L.push('    },');
}
L.push('  };');
L.push('');
L.push('  return { PRIMARY_SKILLS, SECONDARY_SKILLS };');
L.push('});');
L.push('');

// Атомарная замена (tmp + rename): параллельные require под node --test
// не видят частичный файл (задача 000054, правки по итогам ревью).
writeFileAtomic(OUT_FILE, L.join('\n'));
console.log(`src/skills-data.js перегенерирован: ${primary.length} основных, ${secondary.length} вторичных навыков.`);

#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { writeFileAtomic } = require('./lib/write-atomic.js');

const ROOT = path.join(__dirname, '..');
const RUNES_DIR = path.join(ROOT, 'assets', 'runes');
const OUT_FILE = path.join(ROOT, 'src', 'runes-data.js');

const ID_RE = /^[a-z][a-z0-9_]*$/;
const TEXT_RE = /^\S(.*\S)?$/;

const files = fs.readdirSync(RUNES_DIR)
  .filter((f) => /^\d{6}\.json$/.test(f))
  .sort();
if (files.length === 0) {
  console.error('assets/runes: не найдено ни одного файла 0000NN.json');
  process.exit(1);
}

const runes = [];
for (const f of files) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(path.join(RUNES_DIR, f), 'utf8'));
  } catch (e) {
    console.error(`${f}: не JSON (${e.message})`);
    process.exit(1);
  }
  if (!data || typeof data !== 'object' ||
      typeof data.id !== 'string' || !ID_RE.test(data.id) ||
      typeof data.название !== 'string' || !TEXT_RE.test(data.название) ||
      typeof data.описание !== 'string' || !TEXT_RE.test(data.описание) ||
      !data.эффект || typeof data.эффект !== 'object' ||
      typeof data.эффект.amount !== 'number' ||
      !Number.isFinite(data.эффект.amount)) {
    console.error(`${f}: нет валидных полей id/название/описание/эффект.amount`);
    process.exit(1);
  }
  const e = data.эффект;
  if (e.type === 'derived') {
    if (typeof e.stat !== 'string' || e.skill !== undefined) {
      console.error(`${f}: derived-эффект без stat (или со skill)`);
      process.exit(1);
    }
  } else if (e.type === 'skill') {
    if (typeof e.skill !== 'string' || !ID_RE.test(e.skill) ||
        e.stat !== undefined) {
      console.error(`${f}: skill-эффект без skill (или со stat)`);
      process.exit(1);
    }
  } else {
    console.error(`${f}: эффект.type «${e.type}» вне derived/skill`);
    process.exit(1);
  }
  runes.push(data);
}

function jsValue(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return '[' + v.map(jsValue).join(', ') + ']';
  if (typeof v === 'object') {
    return '{ ' +
      Object.keys(v).map((k) => k + ': ' + jsValue(v[k])).join(', ') + ' }';
  }
  return JSON.stringify(v);
}

function jsObjectAt(data, col) {
  const pad = ' '.repeat(col);
  const inner = ' '.repeat(col + 2);
  const lines = Object.keys(data)
    .map((k) => `${inner}${k}: ${jsValue(data[k])},`);
  return pad + '{\n' + lines.join('\n') + '\n' + pad + '}';
}

const range = `${files[0]} … ${files[files.length - 1]}`;
const L = [];
L.push('(function (root, factory) {');
L.push('  if (typeof module === "object" && module.exports) {');
L.push('    module.exports = factory();');
L.push('  } else {');
L.push('    root.Game = Object.assign({}, root.Game, { RunesData: factory() });');
L.push('  }');
L.push('})(typeof globalThis !== "undefined" ? globalThis : self, function () {');
L.push('');
L.push(`  const RUNES = [ // assets/runes/${range}`);
for (const data of runes) {
  L.push(jsObjectAt(data, 4) + ',');
}
L.push('  ];');
L.push('');
L.push('  return { RUNES };');
L.push('});');
L.push('');

writeFileAtomic(OUT_FILE, L.join('\n'));
console.log(`src/runes-data.js перегенерирован: ${runes.length} рун.`);

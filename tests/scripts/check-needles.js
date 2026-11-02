#!/usr/bin/env node
'use strict';
// Задача 000284.02: CLI-порт одноразового /tmp/thegame-wf-000284.01/
// check-needles.js (не был закоммичен — теперь воспроизводим).
// 25 констант tests/spec-000230.16-wording.test.js (фикс-regex, видит
// W7B1/W7B2) vs spec/items.md (norm'd, FOUND/NOT FOUND) + вербально
// vs иглы канона §4.2 + W8F-space detail-проверка (пробел после
// «кузнечное_дело/» пинует игла — факт spec, не баг).
// Назначение: быстрая диагностика rebase-станции ДО полного прогона
// (красный = канон/иглы устарели — НЕ мержить). Контракт —
// memory/000284.02-canon-items-sync-test.md.
// Запуск: node tests/scripts/check-needles.js [root] (exit 0/1).

const fs = require('node:fs');
const path = require('node:path');
const core = require('./canon-items-sync-core.js');

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..', '..'));
const SPEC = fs.readFileSync(path.join(ROOT, 'spec', 'items.md'), 'utf8');
const CANON = fs.readFileSync(path.join(ROOT, 'memory', '000230.16-spec-equipment-doc.md'), 'utf8');
const WORDING = fs.readFileSync(path.join(ROOT, 'tests', 'spec-000230.16-wording.test.js'), 'utf8');

const ns = core.norm(SPEC);
const needles = new Set(core.extractCanonNeedles(CANON));
const consts = core.extractConsts(WORDING);
let bad = consts.length !== needles.size;
for (const c of consts) {
  const inSpec = ns.includes(core.norm(c.value));
  const inCanon = needles.has(c.value);
  if (!inSpec || !inCanon) bad = true;
  console.log((inSpec ? 'FOUND    ' : 'NOT FOUND') + ' ' + c.name + (inCanon ? '' : ' (нет вербально в каноне §4.2)'));
}
const w8f = /кузнечное_дело\/ резьба_по_камню/.test(ns);
if (!w8f) bad = true;
console.log((w8f ? 'FOUND    ' : 'NOT FOUND') + ' W8F-space (пробел после «кузнечное_дело/» — norm’d spec)');
if (consts.length !== needles.size) console.log('NOT FOUND const-count=' + consts.length + ' (ожидаемо ' + needles.size + ')');
console.log(bad ? 'NEEDLES STALE — ре-синхрон (контракт 000284.01 §3)' : 'ALL NEEDLES SYNCED WITH SPEC');
process.exit(bad ? 1 : 0);

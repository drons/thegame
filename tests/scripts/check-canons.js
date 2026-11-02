#!/usr/bin/env node
'use strict';
// Задача 000284.02: CLI-порт одноразового /tmp/thegame-wf-000284.01/
// check-canons.js (не был закоммичен — теперь воспроизводим).
// Синхрон оборудования-канона memory/000230.16-spec-equipment-doc.md
// vs spec/items.md (norm'd): иглы §4.2 [SYNCED]/[STALE] + блоки
// C1/D/E [SYNCED]/[STALE] (блок в блок). C2 в проверку НЕ входит
// (артефакт: пробел «синий/ фиолетовый» от переноса строки — канон
// НЕ norm'd-равен spec; open item — рефлоу буллета, см.
// memory/000284.02-canon-items-sync-test.md «подводные камни»).
// Назначение: быстрая диагностика rebase-станции ДО полного прогона
// (красный = канон устарел — НЕ мержить).
// Запуск: node tests/scripts/check-canons.js [root] (exit 0/1).

const fs = require('node:fs');
const path = require('node:path');
const core = require('./canon-items-sync-core.js');

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..', '..'));
const SPEC = fs.readFileSync(path.join(ROOT, 'spec', 'items.md'), 'utf8');
const CANON = fs.readFileSync(path.join(ROOT, 'memory', '000230.16-spec-equipment-doc.md'), 'utf8');

let stale = 0;
function report(label, ok, detail) {
  console.log((ok ? '[SYNCED] ' : '[STALE]  ') + label + (detail ? ' — ' + detail : ''));
  if (!ok) stale++;
}
const head = (s) => s.slice(0, 60) + (s.length > 60 ? '…' : '');

const ns = core.norm(SPEC);
const needles = core.extractCanonNeedles(CANON);
for (const n of needles) {
  const ok = ns.includes(core.norm(n));
  report('игла §4.2: «' + head(n) + '»', ok, ok ? '' : 'игла не найдена в spec/items.md');
}

const BLOCKS = [
  ['C1', () => core.specBulletInH2(SPEC, 'Редкость и дроп экипировки', 'EQUIP_POOLS', 'НИКОГДА не в пулах.')],
  ['D', () => core.specH2(SPEC, 'Наборы и аффиксы')],
  ['E', () => core.specH2(SPEC, 'Каталог новых предметов экипировки')],
];
for (const [key, specSide] of BLOCKS) {
  try {
    const c = core.extractBlock(CANON, key);
    const ok = c === specSide();
    report('блок ' + key, ok, ok ? '' : 'канон ≠ spec — ре-синхрон канона в том же коммите (контракт 000284.01 §3)');
  } catch (e) {
    report('блок ' + key, false, 'структурно не читается: ' + e.message);
  }
}

console.log(stale === 0 ? 'ALL CANONS SYNCED WITH SPEC' : stale + ' STALE — НЕ мержить до ре-синхрона');
process.exit(stale === 0 ? 0 : 1);

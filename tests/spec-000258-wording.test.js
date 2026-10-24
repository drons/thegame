// Задача 000258 (автотайлинг кромки стены, вариант A) — RED-тесты
// wording (docs only; код игры и существующие тесты НЕ меняются на
// красной стадии).
//
// Контракты (memory/000258-wall-autotiling.md §6):
// * W1 — spec/buildings.md «Вход и внутреннее пространство»: строка
//   «стены города (периметр) рисуются автотайлом по маске соседей
//   (000258) …»; пол остаётся плоским; фолбэк fillRect (hash2+соль).
// * W2 — spec/world-map.md буллет подземелий: «кромка стены подземелья
//   — автотайл по маске 4 соседей (000258) …»; внутренние стены без
//   floor-соседа — фон; fog-гейт 000136 на стены.
// * W3 — ВСЁ spec/: дословных «wallObjFor»/«d.wallObjs» ПОСЛЕ правки
//   НЕТ (фасад 8-соседства 000070 заменён маской — буллеты
//   dungeons-storage переписаны на wallKindFor/wallTileIndex/4-маску).
//
// Красные «отсутствием» (осмысленно — правок SPEC ещё нет, не
// синтаксис: все spec-файлы существуют и читаются, падения —
// ERR_ASSERTION по отсутствию/присутствию ТЕКСТА). Паттерн
// tests/spec-dungeon-depth-wording.test.js: esc()/norm() (SPEC ломает
// строки, фразы-ассерты встают в строку после norm).
//
// expectedRedCount = 3 (W1..W3). Вместе с tests/wall-autotile.test.js
// (AT-1..AT-7) — ровно 10 красных.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// Нормализация белых: фразы, сломавшиеся переносом, встают в строку.
function norm(s) {
  return s.replace(/\s+/g, ' ');
}

const BUILDINGS = norm(fs.readFileSync(
  path.join(ROOT, 'spec', 'buildings.md'), 'utf8'));
const WORLD_MAP = norm(fs.readFileSync(
  path.join(ROOT, 'spec', 'world-map.md'), 'utf8'));
const SPEC_FILES = fs.readdirSync(path.join(ROOT, 'spec'))
  .filter((f) => f.endsWith('.md'));

test('SPEC 000258 W1: buildings — «стены города (периметр) рисуются автотайлом по маске соседей (000258)» (раздел «Вход и внутреннее пространство»)', () => {
  assert.ok(
    BUILDINGS.includes(
      'стены города (периметр) рисуются автотайлом по маске соседей (000258)'),
    'spec/buildings.md: строка «стены города (периметр) рисуются ' +
    'автотайлом по маске соседей (000258) …» отсутствует: стена — ' +
    'краевой спрайт по маске 4 соседей + 4 угловые плитки (клетка с ' +
    'ровно одной диагональю пола), пол города остаётся плоским, ' +
    'фолбэк (без спрайтов) — fillRect (hash2+соль, палитра не ' +
    'меняется)');
});

test('SPEC 000258 W2: world-map — «кромка стены подземелья — автотайл по маске 4 соседей (000258)» (буллет подземелий)', () => {
  assert.ok(
    /кромка стены подземелья [—−-] автотайл по маске 4 соседей \(000258\)/
      .test(WORLD_MAP),
    'spec/world-map.md: буллет «кромка стены подземелья — автотайл по ' +
    'маске 4 соседей (000258) …» отсутствует: wall-клетка с ' +
    'floor-соседом — краевой спрайт вида (rock/column/stalactite) по ' +
    'индексу маски, внутренние стены без floor-соседа — фон, стеновой ' +
    'слой под fog-гейтом 000136 (неисследованная — не рисуется)');
});

test('SPEC 000258 W3: все spec/*.md — без «wallObjFor»/«d.wallObjs» (фасад 8-соседства 000070 заменён маской)', () => {
  const bad = [];
  for (const f of SPEC_FILES) {
    const text = fs.readFileSync(path.join(ROOT, 'spec', f), 'utf8');
    if (text.includes('wallObjFor')) bad.push(f + ': wallObjFor');
    if (text.includes('d.wallObjs')) bad.push(f + ': d.wallObjs');
  }
  assert.deepEqual(bad, [],
    'spec: старая фасадная формулировка (wallObjFor/d.wallObjs, 8-' +
    'соседство, варианты _1/_2) осталась: ' + bad.join(', ') +
    ' — переписать на wallKindFor/wallTileIndex/4-маску (буллеты ' +
    '«объекты_стен» + экспорты spec/dungeons-storage.md)');
});

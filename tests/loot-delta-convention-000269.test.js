// Задача 000269: унификация конвенции разности уровней в victory-
// флоу (lootChance/scrollChance) — именованные дельты
// heroLevelDelta/mobLevelDelta + коммент-блок-контракт; формулы,
// значения и порядок вызовов c._rng — БЕЗ ИЗМЕНЕНИЙ (бит-в-бит,
// рефакторинг без смены поведения, P2; ловушка sign-багов 000245 §7).
//
// ТЗ — tasks/pending/000269.md; контракт — memory/000269-victory-
// delta-convention.md (§1 moveList, §2 конвенции и инварианты, §7
// план тестов).
//
// Node, прямой require src/combat.js (UMD node-ветка — паттерн
// tests/combat.test.js) + source-scan (прецедент 000235.05 S2(c) —
// fs-скан src/combat.js на литерал SALT_SCROLL; loot-e2e S1 —
// структурный скан). VM-цепочка НЕ нужна: НОВЫХ МОДУЛЕЙ И SCRIPT-
// ТЕГОВ НЕТ — хелперы живут в combat.js (уже в index.html).
//
// КРАСНЫЕ (5 — падают на master 01e73d0: функциональность ещё не
// существует; все падения осмысленные TypeError/AssertionError —
// отсутствующие экспорты/определения/строки spec, НЕ load-ошибка:
// combat.js грузится, UMD-целостность сохранена — прецедент
// 000132/000155/000167/000245):
//   000269-H1  хелперы с зафиксированной конвенцией — знак дельты
//              для каждого call-site: typeof = 'function';
//              heroLevelDelta(10,15) = −5 / (15,10) = +5 / (10,10)
//              = 0 / (1,2) = −1 (лут: D = heroLevel − mobLevel);
//              mobLevelDelta(4,1) = +3 (S2-золото wolf L4 / hero L1)
//              / (15,10) = +5 / (10,15) = −5 / (10,10) = 0 (свитки:
//              D = maxLvl − playerLevel); противоположность знаков:
//              одни уровни — знаки конвенций противоположны;
//   000269-H2  формулы принимают дельту в нужном знаке (хелпер ↔
//              формула, бит-в-бит значения): сетки пар через
//              clamp/min-формулы + пины lootChance(10,15) = 0.05
//              (L1-пример, P(−5) = floor) и
//              scrollChance(mobLevelDelta(4,1)) = 0.11 (S2-золото);
//   000269-H3  пин «ОБА пути D через именованные хелперы»
//              (source-scan, компонентный контракт): определения с
//              сигнатурой-конвенцией; heroLevelDelta( — ровно 2
//              (определение + lootChance — ОДИН D-вычислитель
//              обслуживает ОБА loot call-sites rollVictoryLoot
//              базовый :1317 / редкий :1322; сигнатура
//              lootChance(heroLevel, mobLevel) закреплена
//              000245-L1); mobLevelDelta( — ровно 2 (определение +
//              rollScrollDrop — заменяет inline :1284); ASCII-
//              вычитания heroLevel − mobLevel / maxLvl − playerLevel
//              — по 1 (тела хелперов; коммент-контракт — символом
//              U+2212, канон SPEC); тело scrollChance — без
//              Delta-вызовов (D приходит аргументом в своём знаке);
//   000269-W1  spec/dungeons-storage.md «## Лут»: имена обоих
//              хелперов + кросс-ссылка на spec/spells.md «Свитки:
//              тир и лут» (один знак — два файла, ТЗ п.2);
//   000269-W2  spec/spells.md «## Свитки: тир и лут»: имена обоих
//              хелперов + кросс-ссылка на spec/dungeons-storage.md
//              «Лут» (последняя уже есть :222 — красная часть
//              имена хелперов).
//
// ЗЕЛЁНЫЕ ассерты в красных тестах (регрессия — значения НЕ
// меняются): формулы P(D)/P_scroll через именованные дельты
// (H2-сетки), P(−5) = 0.05 (L1), P(3) = 0.11 (S2-золото), паритет
// = 0.
//
// РЕ-ПИН tests/spec-split.test.js R7 (spells.md 269 → 272,
// dungeons-storage.md 200 → 203) — в коммите spec-правки (станция
// GREEN, протокол memory/000159-spec-split.md §5.1), НЕ в этом.
//
// expectedRedCount = 5 (H1, H2, H3, W1, W2).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// --- node-ветка combat.js (прямой require — как в tests/combat.test.js) ---
const C = require(path.join(ROOT, 'src', 'combat.js'));
const {
  lootChance, scrollChance,
} = C;
// Новые экспорты 000269 (имена зафиксированы контрактом
// memory/000269-victory-delta-convention.md):
const heroLevelDelta = C.heroLevelDelta;
const mobLevelDelta = C.mobLevelDelta;

function esc(s) { return s.replace(/[.*+^${}()|[\]\\]/g, '\\$&'); }
function h2(sec, name) {
  const m = sec.match(new RegExp('^## ' + esc(name) + '\\s*$', 'm'));
  assert.ok(m, 'spec: подраздел «' + name + '» не найден');
  const i = m.index;
  const j = sec.indexOf('\n## ', i + 1);
  return sec.slice(i, j === -1 ? sec.length : j);
}
function norm(s) { return s.replace(/\s+/g, ' '); }

// H1 ----------------------------------------------------------------------
test('000269-H1: хелперы с зафиксированной конвенцией — знак дельты для каждого call-site (RED)', () => {
  assert.equal(typeof heroLevelDelta, 'function',
    'экспорт heroLevelDelta(heroLevel, mobLevel) (лут-пулы: D = hero − mob)');
  assert.equal(typeof mobLevelDelta, 'function',
    'экспорт mobLevelDelta(maxLvl, playerLevel) (свитки: D = maxLvl − player)');
  // Лут (000245): D = heroLevel − mobLevel.
  assert.equal(heroLevelDelta(10, 15), -5, 'лут: 10 − 15 = −5 (пример 000245-L1)');
  assert.equal(heroLevelDelta(15, 10), 5, 'лут: 15 − 10 = +5');
  assert.equal(heroLevelDelta(10, 10), 0, 'лут: паритет = 0');
  assert.equal(heroLevelDelta(1, 2), -1, 'лут: 1 − 2 = −1');
  // Свитки (000235.05): D = maxLvl − playerLevel.
  assert.equal(mobLevelDelta(4, 1), 3, 'свитки: S2-золотой wolf L4 / hero L1 = +3 (P = 0.11)');
  assert.equal(mobLevelDelta(15, 10), 5, 'свитки: 15 − 10 = +5');
  assert.equal(mobLevelDelta(10, 15), -5, 'свитки: 10 − 15 = −5');
  assert.equal(mobLevelDelta(10, 10), 0, 'свитки: паритет = 0');
  // ПРОТИВОПОЛОЖНЫЕ знаки — суть ловушки (memory/000245 §7):
  assert.equal(heroLevelDelta(10, 15), -mobLevelDelta(15, 10),
    'одни и те же уровни — знаки конвенций противоположны');
});

// H2 ----------------------------------------------------------------------
test('000269-H2: формулы принимают дельту в нужном знаке (хелпер ↔ формула, бит-в-бит значения) (RED)', () => {
  for (const [h, m] of [[10, 15], [15, 10], [10, 10], [1, 4], [20, 1], [5, 5]]) {
    const D = heroLevelDelta(h, m);
    const want = Math.min(0.25, Math.max(0.05, 0.25 + 0.04 * D));
    assert.equal(lootChance(h, m), want,
      'lootChance(' + h + ', ' + m + ') = clamp(0.25 + 0.04·D, 0.05, 0.25), D = ' + D);
  }
  for (const [ml, pl] of [[4, 1], [15, 10], [10, 15], [10, 10], [0, 3]]) {
    const D = mobLevelDelta(ml, pl);
    const want = Math.min(0.25, 0.05 + 0.02 * Math.max(0, D));
    assert.equal(scrollChance(D), want,
      'scrollChance(D = ' + D + ') = min(0.25, 0.05 + 0.02·max(0, D))');
  }
  // Сценарии-пины существующих золотых (значения НЕ меняются):
  assert.equal(lootChance(10, 15), 0.05, 'L1-пример: P(−5) = 0.05 (floor)');
  assert.equal(scrollChance(mobLevelDelta(4, 1)), 0.11, 'S2-золото: P(3) = 0.11');
});

// H3 ----------------------------------------------------------------------
test('000269-H3: пин — ОБА пути D идут через именованные хелперы (source-scan, компонентный контракт) (RED)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'combat.js'), 'utf8');
  // Определения хелперов (сигнатура = конвенция):
  assert.ok(/function\s+heroLevelDelta\s*\(\s*heroLevel\s*,\s*mobLevel\s*\)/.test(src),
    'определение heroLevelDelta(heroLevel, mobLevel) в src/combat.js');
  assert.ok(/function\s+mobLevelDelta\s*\(\s*maxLvl\s*,\s*playerLevel\s*\)/.test(src),
    'определение mobLevelDelta(maxLvl, playerLevel) в src/combat.js');
  // Лут-путь: heroLevelDelta( — ровно 2 места: определение + использование
  // в lootChance (один D-вычислитель обслуживает ОБА loot call-sites
  // rollVictoryLoot :1317 базовый / :1322 редкий — сигнатура
  // lootChance(heroLevel, mobLevel) закреплена 000245-L1):
  assert.equal((src.match(/heroLevelDelta\(/g) || []).length, 2,
    'heroLevelDelta( — ровно 2 места (определение + lootChance)');
  // Свитки-путь: mobLevelDelta( — ровно 2 места: определение +
  // rollScrollDrop (заменяет inline :1284):
  assert.equal((src.match(/mobLevelDelta\(/g) || []).length, 2,
    'mobLevelDelta( — ровно 2 места (определение + rollScrollDrop)');
  // «Голые» вычитания — ТОЛЬКО внутри хелперов (по 1 в src; коммент-контракт
  // пишется символом «−» U+2212 — канон SPEC, не ASCII '-'):
  assert.equal((src.match(/heroLevel\s*-\s*mobLevel/g) || []).length, 1,
    'heroLevel − mobLevel — ровно 1 место (тело heroLevelDelta)');
  assert.equal((src.match(/maxLvl\s*-\s*playerLevel/g) || []).length, 1,
    'maxLvl − playerLevel — ровно 1 место (тело mobLevelDelta)');
  // scrollChance(D) — без изменений (D приходит уже в своём знаке):
  const scBody = src.slice(src.indexOf('function scrollChance('),
    src.indexOf('function scrollTier('));
  assert.ok(!/Delta\(/.test(scBody), 'scrollChance — не считает дельту сам (D аргумент)');
});

// W1/W2 --------------------------------------------------------------------
test('000269-W1: spec/dungeons-storage.md «Лут» — кросс-ссылка на хелперы и на spec/spells.md «Свитки: тир и лут» (RED)', () => {
  const ds = fs.readFileSync(path.join(ROOT, 'spec', 'dungeons-storage.md'), 'utf8');
  const lut = norm(h2(ds, 'Лут'));
  assert.ok(lut.includes('heroLevelDelta') && lut.includes('mobLevelDelta'),
    '«## Лут»: именованные дельты хелперы зафиксированы (контракт конвенций)');
  assert.ok(lut.includes('spec/spells.md «Свитки: тир и лут»'),
    '«## Лут»: кросс-ссылка на соседнюю секцию (один знак — два файла)');
});

test('000269-W2: spec/spells.md «Свитки: тир и лут» — кросс-ссылка на хелперы и на spec/dungeons-storage.md «Лут» (RED)', () => {
  const sp = fs.readFileSync(path.join(ROOT, 'spec', 'spells.md'), 'utf8');
  const sc = norm(h2(sp, 'Свитки: тир и лут'));
  assert.ok(sc.includes('heroLevelDelta') && sc.includes('mobLevelDelta'),
    '«Свитки: тир и лут»: именованные дельты хелперы зафиксированы');
  assert.ok(sc.includes('spec/dungeons-storage.md «Лут»'),
    '«Свитки: тир и лут»: кросс-ссылка на соседнюю секцию');
});

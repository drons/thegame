// Задача 000243: финальные ре-пины тестов после закрытия каталога —
// КРАСНЫЕ source-пины (TDD). Контракт —
// memory/000243-final-test-repins.md (§2 финальные числа, §4 форма S1,
// §8 закреплённое/запрещённое, §12 точки правок P1–P6).
//
// source-пин строки/блока тест-файла (техника — прецеденты
// tests/rar-g-heading-000252.test.js / tests/e9-header-canary-000274.test.js:
// объект пина — тест-файл, не spec; vm-цепочка не нужна):
//  * 000243-S1-B — в S1-блоке (якорь test('S1. 000133: → следующий test())
//    per-school-цикл несёт верхнюю границу (структура «n >= 1 && n <=» +
//    точное выражение «n <= SCHOOL_SCROLL_MAX[sch]» без fallback —
//    fail-closed, 000243.02; не точный текст КАРТЫ — форма зафиксирована
//    контрактом §4) + live-кросс-чек: SCHOOL_SCROLL_MAX, извлечённый из
//    исходника S1, deepEqual живому per-school счёту (пин = факт каталога);
//  * 000243-S1-T — строка test('S1. 000133: (ровно одна): «161» (ре-пин
//    000348: 160 → 161), «Природа», «000243»; НЕ «133 свитка»;
//  * 000243-RAR-H — строка комментария //   230.07-RAR-G (ровно одна;
//    title-строка :739 НЕ матчит — закреплена пином 000252 и в scope НЕ
//    входит): «каталог 814 шт.», «прочие 225» (ре-пин 000348: 763 → 764,
//    224 → 225; ре-пин 000321.06: 764 → 814); НЕ «182 шт.»;
//    live-кросс-чек 814 == ITEMS.length, 225 == count(ITEMS без slot);
//  * 000243-I1-T — строка test("000211.06 I1: (ровно одна): «прочие 0»,
//    «814», «000243»; НЕ «прочие 23» (срез 000302.07); live-кросс-чек по
//    live-скану каталога: 0 без icon, 814 с icon;
//  * 000243-I1-H — шапочный блок между // --- Задача 000211.06: и строкой
//    test("000211.06 I1: — ровно одна строка с «прочие»: «0», «814»;
//    НЕ «прочие 23 предмета»;
//  * 000243-EN1-T — строка test('000230.09 EN1: (ровно одна): НЕ
//    «последних 75» / «len−75» / «окно 50 → 75»; содержит
//    «slot-фильтр» (тело уже slot-якорное с 000235.09, паттерн H1) и
//    «000243».
//
// Краснота осмысленная: файлы существуют и читаются, падение =
// ERR_ASSERTION на stale-тексте/отсутствующей границе — НЕ missing
// module, НЕ синтаксис. До правки P1–P6: ровно 6 fail; после: 0.
// Живые кросс-чеки (каталог финален на 6ac25db) — зелёные и фиксируют,
// что пинные числа = факт каталога; красноту даёт первый ассерт.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const I = require('../src/items.js');
const SPELLS = require('../src/spells.js');
const DATA = require('../src/items-data.js');

const ITEMS_SRC = fs.readFileSync(
  path.join(__dirname, 'items.test.js'), 'utf8');
const UI_SRC = fs.readFileSync(path.join(__dirname, 'ui.test.js'), 'utf8');
const ITEMS_DIR = path.join(__dirname, '..', 'assets', 'items');

function s1Block() {
  const lines = ITEMS_SRC.split('\n');
  const start = lines.findIndex(l => l.startsWith("test('S1. 000133:"));
  assert.notEqual(start, -1,
    'якорь S1-блока: строка test(\'S1. 000133: не найдена');
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('test(')) { end = i; break; }
  }
  assert.notEqual(end, -1, 'конец S1-блока (следующая строка test() не найдена');
  return lines.slice(start, end).join('\n');
}

test('000243-S1-B: S1 per-school цикл несёт верхнюю границу (n >= 1 && n <= K; 000243.02: точное «n <= SCHOOL_SCROLL_MAX[sch]» без fallback — fail-closed), K-карта SCHOOL_SCROLL_MAX = live-факт каталога (ретро 2026-10-22, 000235.07 minor — фоллоуп закрыт)', () => {
  const block = s1Block();
  const loopStart = block.indexOf(
    'for (const [sch, n] of Object.entries(bySchool))');
  assert.notEqual(loopStart, -1,
    'якорь: per-school-цикл S1 не найден в S1-блоке');
  const loopEnd = block.indexOf('\n  }', loopStart);
  const loop = loopEnd === -1
    ? block.slice(loopStart) : block.slice(loopStart, loopEnd);
  assert.ok(loop.includes('n >= 1 && n <='),
    'S1 per-school: верхняя граница «n >= 1 && n <= K» отсутствует — '
    + 'пин-арбитр баланса школ потерян (должен вернуть ре-пин 000243); '
    + 'цикл сейчас: ' + JSON.stringify(loop));
  assert.ok(loop.includes('n <= SCHOOL_SCROLL_MAX[sch]'),
    'S1 per-school: точная отсылка «n <= SCHOOL_SCROLL_MAX[sch]» без '
    + 'fallback не найдена — защитный fallback (??/||/Math.max/алиас) '
    + 'отменяет fail-closed арбитра (новая школа ∉ карты → n <= '
    + 'undefined → пин должен падать; ре-пин 000243.02); цикл сейчас: '
    + JSON.stringify(loop));
  const km = block.match(/const SCHOOL_SCROLL_MAX = \{([^}]+)\}/);
  assert.ok(km,
    'S1-блок: блок-локальный литерал SCHOOL_SCROLL_MAX (решение '
    + '000243 §4) не найден — граница не восстановлена');
  const kmap = {};
  for (const m of km[1].matchAll(/([\p{L}_]+):\s*(\d+)/gu)) {
    kmap[m[1]] = Number(m[2]);
  }
  const liveBySchool = {};
  for (const it of I.allItems()) {
    if (it.kind !== 'spell_scroll') continue;
    const sch = SPELLS.SPELLS_BY_ID[it.effect.spell].школа;
    liveBySchool[sch] = (liveBySchool[sch] || 0) + 1;
  }
  assert.deepEqual(kmap, liveBySchool,
    'S1 K-карта ≠ live-факт каталога (пин = факт): карта '
    + JSON.stringify(kmap) + ' ≠ ' + JSON.stringify(liveBySchool));
});

test('000243-S1-T: заголовок S1 = телу: «161 свитков» + волна «Природа» + «финальный ре-пин 000243» (устаревшее «133 свитка» отсутствует)', () => {
  const heading = ITEMS_SRC.split('\n')
    .filter(l => l.startsWith("test('S1. 000133:"));
  assert.equal(heading.length, 1,
    'строка test(\'S1. 000133: — ровно одна; найдено: ' + heading.length);
  const line = heading[0];
  assert.ok(line.includes('161'),
    'заголовок S1 — «161 свитков» (тело: scrolls.length === 161; '
    + 'ре-пин 000333: 158 → 160; ре-пин 000348: +1 Декаданс); '
    + 'факт: ' + line.slice(0, 160));
  assert.ok(line.includes('Природа'),
    'заголовок S1 — 6-я волна «Природа» (тело: все 6 школ); '
    + 'факт: ' + line.slice(0, 160));
  assert.ok(line.includes('000243'),
    'заголовок S1 — пометка «финальный ре-пин 000243: каталог '
    + 'запечатан»; факт: ' + line.slice(0, 160));
  assert.ok(!line.includes('133 свитка'),
    'устаревшее «133 свитка» (срез 000235.11) — отсутствует; '
    + 'факт: ' + line.slice(0, 160));
});

test('000243-RAR-H: шапочный комментарий 230.07-RAR-G (ui.test.js) = телу: «каталог 814 шт.», «прочие 225» (ре-пин 000333: 511 → 513, 222 → 224; ре-пин 000321.01: 513 → 563 (+50 оружия с rarity — в skip-ветку); ре-пин 000321.02: 563 → 613 (+50 брони с rarity — в skip-ветку); ре-пин 000321.03: 613 → 663 (+50 щитов с rarity — в skip-ветку); ре-пин 000321.04: 663 → 713 (+50 артефактов 000664–000713 с rarity — в skip-ветку; ре-пин 000348: 763 → 764, 224 → 225 (+1 свиток Декаданс 000764, rarity нет — в прочие); ре-пин 000321.06: 764 → 814 (+50 колец 000765–000814 с rarity — в skip-ветку, прочие не сдвинулись); устаревшее «182 шт.» отсутствует; title :739 — пин 000252, вне scope)', () => {
  const heading = UI_SRC.split('\n')
    .filter(l => l.startsWith('//   230.07-RAR-G'));
  assert.equal(heading.length, 1,
    'строка комментария //   230.07-RAR-G — ровно одна (строка test( '
    + ':739 не матчит — прецедент 000252); найдено: ' + heading.length);
  const line = heading[0];
  assert.ok(line.includes('каталог 814 шт.'),
    'шапка RAR-G — «каталог 814 шт.» (тело: ITEMS.length === 814; '
    + 'ре-пин 000333: 511 → 513; ре-пин 000321.01: 513 → 563; '
    + 'ре-пин 000321.02: 563 → 613; '
    + 'ре-пин 000321.03: 613 → 663; '
    + 'ре-пин 000321.04: 663 → 713; ре-пин 000321.05: 713 → 763; '
    + 'ре-пин 000348: 763 → 764; ре-пин 000321.06: 764 → 814); '
    + 'факт: ' + line);
  assert.ok(line.includes('прочие 225'),
    'шапка RAR-G — «прочие 225» (тело: others = 225, по slot; '
    + 'ре-пин 000333: 222 → 224; ре-пин 000348: 224 → 225); факт: ' + line);
  assert.ok(!line.includes('182 шт.'),
    'устаревшее «182 шт.» (срез 000230.08) — отсутствует; факт: ' + line);
  const items = DATA.ITEMS;
  assert.equal(items.length, 814,
    'live-каталог — 814 (шапка = факт; ре-пин 000321.01; '
    + 'ре-пин 000321.02; ре-пин 000321.03; ре-пин 000321.04; ре-пин 000321.05; '
    + 'ре-пин 000348; ре-пин 000321.06); '
    + 'факт: ' + items.length);
  const noSlot = items.filter(it => it.slot === undefined).length;
  assert.equal(noSlot, 225,
    'live-каталог — 225 без slot (шапка = факт); факт: ' + noSlot);
});

test('000243-I1-T: заголовок I1 (000211.06) = телу: «прочие 0» / «814 с icon» (ре-пин 000333: 511 → 513; ре-пин 000321.01: 513 → 563; ре-пин 000321.02: 563 → 613; ре-пин 000321.03: 613 → 663; ре-пин 000321.04: 663 → 713; ре-пин 000321.05: 713 → 763; ре-пин 000348: 763 → 764; ре-пин 000321.06: 764 → 814) / «000243: финальный» (устаревшее «прочие 23» отсутствует — срез 000302.07)', () => {
  const heading = ITEMS_SRC.split('\n')
    .filter(l => l.startsWith('test("000211.06 I1:'));
  assert.equal(heading.length, 1,
    'строка test("000211.06 I1: — ровно одна; найдено: ' + heading.length);
  const line = heading[0];
  assert.ok(line.includes('прочие 0'),
    'заголовок I1 — «прочие 0» (тело: others = 0); '
    + 'факт: ' + line.slice(0, 160));
  assert.ok(line.includes('814'),
    'заголовок I1 — «814 с icon» (тело: icon-count = 814; '
    + 'ре-пин 000333: 511 → 513; ре-пин 000321.01: 513 → 563; '
    + 'ре-пин 000321.02: 563 → 613; '
    + 'ре-пин 000321.03: 613 → 663; '
    + 'ре-пин 000321.04: 663 → 713; ре-пин 000321.05: 713 → 763; '
    + 'ре-пин 000348: 763 → 764; ре-пин 000321.06: 764 → 814); '
    + 'факт: ' + line.slice(0, 160));
  assert.ok(line.includes('000243'),
    'заголовок I1 — пометка «000243: финальный, каталог 511» '
    + '(историческая; ре-пин 000333 — каталог 513; ре-пин 000321.01 — 563; '
    + 'ре-пин 000321.02 — 613; ре-пин 000321.03 — 663; '
    + 'ре-пин 000321.04 — 713; ре-пин 000321.05 — 763); '
    + 'факт: ' + line.slice(0, 160));
  assert.ok(!line.includes('прочие 23'),
    'устаревшее «прочие 23» (срез 000302.07) — отсутствует; '
    + 'факт: ' + line.slice(0, 160));
  const files = fs.readdirSync(ITEMS_DIR)
    .filter(f => /^\d{6}\.json$/.test(f));
  let withIcon = 0;
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8'));
    if ('icon' in j) withIcon++;
  }
  assert.equal(withIcon, 814,
    'live-каталог — 814 с icon (заголовок = факт; ре-пин 000333; '
    + 'ре-пин 000321.01; ре-пин 000321.02; ре-пин 000321.03; '
    + 'ре-пин 000321.04; ре-пин 000321.05; ре-пин 000321.06); '
    + 'факт: ' + withIcon);
  assert.equal(files.length - withIcon, 0,
    'live-каталог — 0 без icon (заголовок = факт); факт: '
    + (files.length - withIcon));
});

test('000243-I1-H: шапочный блок I1 (секция 000211.06) — «прочие 0 / 814 с icon» (ре-пин 000333; ре-пин 000321.01: 513 → 563; ре-пин 000321.02: 563 → 613; ре-пин 000321.03: 613 → 663; ре-пин 000321.04: 663 → 713; ре-пин 000321.05: 713 → 763; ре-пин 000348: 763 → 764; ре-пин 000321.06: 764 → 814; устаревшее «прочие 23 предмета» отсутствует — срез 000302.07)', () => {
  const lines = ITEMS_SRC.split('\n');
  const start = lines.findIndex(l => l.startsWith('// --- Задача 000211.06:'));
  assert.notEqual(start, -1,
    'якорь шапки: строка // --- Задача 000211.06: не найдена');
  const end = lines.findIndex(
    (l, i) => i > start && l.startsWith('test("000211.06 I1:'));
  assert.notEqual(end, -1,
    'конец шапочного блока I1 (строка test("000211.06 I1:) не найден');
  const others = lines.slice(start, end).filter(l => l.includes('прочие'));
  assert.equal(others.length, 1,
    'в шапочном блоке I1 ровно одна строка с «прочие»; найдено: '
    + others.length);
  const line = others[0];
  assert.ok(line.includes('0'),
    'шапка I1 — «0» (тело: others = 0); факт: ' + line);
  assert.ok(line.includes('814'),
    'шапка I1 — «814 с icon» (тело: icon-count = 814; '
    + 'ре-пин 000333; ре-пин 000321.02; ре-пин 000321.04; ре-пин 000321.05; ре-пин 000348; '
    + 'ре-пин 000321.06: 764 → 814); '
    + 'факт: ' + line);
  assert.ok(!line.includes('прочие 23 предмета'),
    'устаревшее «прочие 23 предмета» (срез 000302.07: live-шапка '
    + 'стала «прочие 0 предметов» — прежний пин сделал бы себя '
    + 'красным) — отсутствует; факт: ' + line);
});

test('000243-EN1-T: заголовок EN1 = телу: slot-якорь (паттерн H1) + «000243: финальный», без tail-75 формулировок (тело slot-якорное с 000235.09 — не трогать)', () => {
  const heading = ITEMS_SRC.split('\n')
    .filter(l => l.startsWith("test('000230.09 EN1:"));
  assert.equal(heading.length, 1,
    'строка test(\'000230.09 EN1: — ровно одна; найдено: ' + heading.length);
  const line = heading[0];
  assert.ok(!line.includes('последних 75'),
    'устаревшее «последних 75» (якорь tail-75, удалён телом 000235.09) '
    + '— отсутствует; факт: ' + line.slice(0, 160));
  assert.ok(!line.includes('len−75'),
    'устаревшее «len−75» (якорь tail-75) — отсутствует; '
    + 'факт: ' + line.slice(0, 160));
  assert.ok(!line.includes('окно 50 → 75'),
    'устаревшее «окно 50 → 75» (ре-пин 000230.10 по tail-якорю) — '
    + 'отсутствует; факт: ' + line.slice(0, 160));
  assert.ok(line.includes('slot-фильтр'),
    'заголовок EN1 — slot-якорная формулировка «slot-фильтр» (тело: '
    + 'files.filter по slot, паттерн H1); факт: ' + line.slice(0, 160));
  assert.ok(line.includes('000243'),
    'заголовок EN1 — пометка «000243: финальный якорь»; '
    + 'факт: ' + line.slice(0, 160));
});

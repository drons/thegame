// Задача 000124: статические тесты layout экрана боя в index.html.
//
// Паттерн — статический разбор <style> index.html (как cssRule в
// tests/ui-panel.test.js и разбор html в tests/index-order.test.js):
// CSS-текст — источник правды, браузер/vm не нужны.
//
// Контракт — memory/000124-combat-layout.md:
//  * БАЗА .combat-side (320px), .combat-log (170px) и правило
//    .dungeon-overlay .combat-side НЕ ТРОГАЮТСЯ (стражи ниже,
//    зелёные): эти классы переиспользуют чужие оверлеи —
//    подземелье (000066), постройка; вся геометрия боя 000124
//    живёт ТОЛЬКО в скоупе .combat-overlay--combat. Диалог NPC
//    декэплен от .combat-side в 000125 (свой класс .npc-panel,
//    правило .npc-overlay .combat-side удалено) — его layout не
//    зависит от этих правил при ЛЮБОМ порядке мержей 000124/000125.
//  * .combat-actions — класс только боевой (grep по src/), его базовое
//    правило правится: 4 колонки (8 кнопок = 2 ряда, ТЗ п. 2).
//  * .combat-overlay--combat .combat-log — flex: 1 без фиксированной
//    высоты (журнал занимает оставшееся место под кнопками, ТЗ п. 3).
//  * Правки ревью 2026-10-01: portrait-кап панели 512px и формула
//    canvas без циркулярного 100%; баннер результата = размер canvas.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// ПЕРВОЕ вхождение правила с ТОЧНЫМ селектором (селектор в начале
// строки — сложное правило вида «.a .b {» не матчит селектору «.b»):
// возвращается объект { свойство: значение }.
function cssRule(selector) {
  const re = new RegExp('^[ \\t]*'
    + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    + '[ \\t]*\\{([^}]*)\\}', 'm');
  const m = html.match(re);
  assert.ok(m, 'CSS-правило ' + selector + ' { … } найдено в index.html');
  const decls = {};
  for (const part of m[1].split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const prop = part.slice(0, i).trim().toLowerCase();
    if (prop) decls[prop] = part.slice(i + 1).trim();
  }
  return decls;
}

// --- Стражи базовых правил (подземелье / постройка) ---

test('index.html: стража — база .combat-side = 320px (000124 не переписывает базу)', () => {
  assert.equal(cssRule('.combat-side')['width'], '320px',
    'база .combat-side — 320px (геометрия боя — только в скоупе '
    + '.combat-overlay--combat)');
});

test('index.html: стража — база .combat-log = 170px (подземелье, 000066)', () => {
  assert.equal(cssRule('.combat-log')['height'], '170px',
    'база .combat-log — 170px (плавающая панель подземелья её использует)');
});

// Правило диалога NPC (.npc-overlay .combat-side) — УДАЛЕНО в 000125:
// диалог декэплен от .combat-side, панель — свой класс .npc-panel
// (стража — tests/npc-layout.test.js, секция 000125).
test('index.html: стража — .dungeon-overlay .combat-side на месте', () => {
  const d = cssRule('.dungeon-overlay .combat-side');
  assert.equal(d['width'], '270px', 'панель подземелья — 270px (000066)');
  assert.equal(d['position'], 'absolute', 'панель подземелья — плавающая');
});

// --- Красные: layout боя по ТЗ 000124 ---

test('index.html: .combat-actions — ЧЕТЫРЕ колонки (repeat(4, …)) (000124)', () => {
  const decls = cssRule('.combat-actions');
  assert.match(decls['grid-template-columns'] || '', /repeat\(\s*4\s*,/,
    'база .combat-actions — 4 колонки (8 кнопок = 2 ряда), '
    + 'факт: ' + decls['grid-template-columns']);
});

test('index.html: .combat-overlay--combat .combat-log — flex: 1, без фиксированной высоты (000124)', () => {
  const decls = cssRule('.combat-overlay--combat .combat-log');
  assert.ok(decls['flex'] && /^\s*1(\s|$)/.test(decls['flex']),
    'журнал боя — flex: 1 (оставшееся место под кнопками), '
    + 'факт: ' + decls['flex']);
  assert.ok(!decls['height'] || !/^\s*\d/.test(decls['height']),
    'фиксированной высоты нет (height: 170px — только база), '
    + 'факт: ' + decls['height']);
});

// --- Правки по итогам ревью (2026-10-01) ---
//
// Пины layout-математики, которую старым тестам не видно (статический
// разбор не моделирует flex): (a) в portrait при заполненном журнале
// панель превышала бюджет и canvas вылезал за верх вьюпорта;
// (b) ширина canvas min(100%, …) — циркулярный процент (box в колонке
// определяется самим canvas) — риск схлопнуться в 0; (c) баннер
// перестал совпадать с canvas, когда .combat-box растянулся.
//
// cssRule() берёт ПЕРВОЕ вхождение в файле (row-скоуп); правила ВНУТРИ
// portrait-медиазапроса разбираем отдельно.

function portraitMediaBody() {
  const m = html.match(/@media \(max-width: 640px\)\s*and\s*\(orientation: portrait\)\s*\{([\s\S]*?)\n    \}/);
  assert.ok(m, 'portrait-медиазапрос (max-width: 640px) найден в index.html');
  return m[1];
}

function portraitRule(selector) {
  const re = new RegExp('[ \\t]*'
    + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    + '[ \\t]*\\{([^}]*)\\}');
  const mm = portraitMediaBody().match(re);
  assert.ok(mm, 'правило ' + selector + ' найдено в portrait-медиазапросе');
  // Комментарии внутри блока объявлений режем (конвенция — до
  // правила, но парсер не должен от них ломаться: } в комментарии
  // иначе режет блок).
  const block = mm[1].replace(/\/\*[\s\S]*?\*\//g, ' ');
  const decls = {};
  for (const part of block.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const prop = part.slice(0, i).trim().toLowerCase();
    if (prop) decls[prop] = part.slice(i + 1).trim();
  }
  return decls;
}

test('index.html: portrait — панель в капе 512px, canvas без циркулярного 100% (ревью 2026-10-01)', () => {
  const side = portraitRule('.combat-overlay--combat .combat-side');
  assert.equal(side['max-height'], '512px',
    'портрет: панель ограничена бюджетом 512px — иначе при '
    + 'заполненном журнале (до 9 строк) и кнопках, растущих с '
    + 'шириной, canvas вылезает за верх вьюпорта (390×844/568×748/'
    + '430×932); факт: ' + side['max-height']);
  assert.equal(side['min-height'], '0',
    'портрет: min-height 0 — max-height действительно ограничивает '
    + 'панель; факт: ' + side['min-height']);
  const cv = portraitRule('.combat-overlay--combat .combat-box canvas');
  assert.ok(!/100%/.test(cv['width'] || ''),
    'портрет: в формуле ширины canvas нет 100% — ширина .combat-box '
    + 'в колонке определяется самим canvas (циркулярный процент → '
    + 'риск схлопнуться в 0); факт: ' + cv['width']);
  assert.equal(cv['width'], 'min(100vw - 16px, 100vh - 16px - 520px)',
    'портрет: canvas = доступная ширина (100vw − padding 8×2) ∩ '
    + 'высотный бюджет (100vh − 16 − (gap 8 + кап панели 512)); '
    + 'факт: ' + cv['width']);
  assert.ok(!/\.combat-overlay--combat \.combat-log/.test(portraitMediaBody()),
    'портрет: своего правила .combat-log нет — журнал берёт '
    + 'min-height: 0 из скоупа и скроллится (кап 512px держится и '
    + 'при широких вьюпортах, где 2 ряда кнопок ≈ 294px)');
});

test('index.html: баннер результата — ровно размером с canvas в скоупе боя (ревью 2026-10-01)', () => {
  const cv = cssRule('.combat-overlay--combat .combat-box canvas');
  const bn = cssRule('.combat-overlay--combat .combat-banner');
  assert.equal(bn['transform'], 'translate(-50%, -50%)',
    'баннер центрируется в .combat-box (box больше canvas: row — '
    + 'высота оверлея, portrait — остаток колонки); факт: '
    + bn['transform']);
  assert.equal(bn['width'], cv['width'],
    'баннер (row) = формула ширины canvas — как на master, где box '
    + 'был размером с canvas; факт: ' + bn['width']);
  assert.equal(bn['height'], cv['width'],
    'баннер (row) квадратен, та же формула; факт: ' + bn['height']);
  const pcv = portraitRule('.combat-overlay--combat .combat-box canvas');
  const pb = portraitRule('.combat-overlay--combat .combat-banner');
  assert.equal(pb['width'], pcv['width'],
    'баннер (portrait) = формула ширины canvas (portrait); факт: '
    + pb['width']);
  assert.equal(pb['height'], pcv['width'],
    'баннер (portrait) квадратен, та же формула; факт: ' + pb['height']);
});

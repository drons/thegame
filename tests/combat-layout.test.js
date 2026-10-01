// Задача 000124: статические тесты layout экрана боя в index.html.
//
// Паттерн — статический разбор <style> index.html (как cssRule в
// tests/ui-panel.test.js и разбор html в tests/index-order.test.js):
// CSS-текст — источник правды, браузер/vm не нужны.
//
// Контракт — memory/000124-combat-layout.md:
//  * БАЗА .combat-side (320px), .combat-log (170px) и правила
//    .dungeon-overlay .combat-side / .npc-overlay .combat-side НЕ
//    ТРОГАЮТСЯ (стражи ниже, зелёные): эти классы переиспользуют
//    чужие оверлеи — подземелье (000066), диалог NPC (000010),
//    постройка; вся геометрия боя 000124 живёт ТОЛЬКО в скоупе
//    .combat-overlay--combat. Это гарантирует «layout диалога не
//    ломается при ЛЮБОМ порядке мержей 000124/000125».
//  * .combat-actions — класс только боевой (grep по src/), его базовое
//    правило правится: 4 колонки (8 кнопок = 2 ряда, ТЗ п. 2).
//  * .combat-overlay--combat .combat-log — flex: 1 без фиксированной
//    высоты (журнал занимает оставшееся место под кнопками, ТЗ п. 3).

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

// --- Стражи базовых правил (000125 / подземелье / NPC / постройка) ---

test('index.html: стража — база .combat-side = 320px (000124 не переписывает базу)', () => {
  assert.equal(cssRule('.combat-side')['width'], '320px',
    'база .combat-side — 320px (геометрия боя — только в скоупе '
    + '.combat-overlay--combat)');
});

test('index.html: стража — база .combat-log = 170px (подземелье, 000066)', () => {
  assert.equal(cssRule('.combat-log')['height'], '170px',
    'база .combat-log — 170px (плавающая панель подземелья её использует)');
});

test('index.html: стража — .dungeon-overlay .combat-side и .npc-overlay .combat-side на месте', () => {
  const d = cssRule('.dungeon-overlay .combat-side');
  assert.equal(d['width'], '270px', 'панель подземелья — 270px (000066)');
  assert.equal(d['position'], 'absolute', 'панель подземелья — плавающая');
  assert.equal(cssRule('.npc-overlay .combat-side')['max-height'], '84vh',
    'правило диалога NPC — на месте');
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

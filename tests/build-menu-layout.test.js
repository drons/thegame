// Задача 000202: UI списка зданий — layout: скролл, ширина, перенос.
//
// Паттерн — статический парсинг <style> index.html (cssRule в
// tests/combat-layout.test.js): текст CSS — источник правды, браузер
// и vm не нужны.
//
// Контракт — memory/000202-building-menu-ui.md (R7): 4 новых правила
// вставляются ПОСЛЕ `.cp-itemrow .cp-btn` и ДО блока 000147
// (`.cp-availrow`):
//   .cp-itemreason — красный #e65f52 (существующая палитра) + 700;
//   .combat-overlay--build .combat-side — width min(520px, 94vw)
//   (вписать в экран по горизонтали);
//   .combat-overlay--build .cp-items — max-height calc(100vh − 170px)
//   + overflow-y auto (вертикальный скролл ТЕЛА списка; шапка и
//   футер — вне скролла);
//   .combat-overlay--build .cp-itemrow .cp-itemname — min-width 0 +
//   overflow-wrap break-word (flex-ловушка min-width:auto: длинное
//   название не растягивает панель).
// База НЕ трогается (гард-тесты ниже — зелёные).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// Первое правило с точным селектором (паттерн cssRule из
// tests/combat-layout.test.js): { свойство: значение }.
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

// --- Гард-тесты базовых правил (зелёные: 000202 базу не трогает) ---

test('index.html: гард — базовый .combat-side = 320px (000202 не трогает базу; геометрия списка — только в скопе .combat-overlay--build)', () => {
  assert.equal(cssRule('.combat-side')['width'], '320px',
    'базовый .combat-side — 320px');
});

test('index.html: гард — базовый .cp-items = margin-top 4px', () => {
  assert.equal(cssRule('.cp-items')['margin-top'], '4px',
    'базовый .cp-items — margin-top 4px');
});

test('index.html: гард — базовый .cp-itemrow = display flex', () => {
  assert.equal(cssRule('.cp-itemrow')['display'], 'flex',
    'базовый .cp-itemrow — display: flex');
});

test('index.html: гард — базовый .cp-itemmeta = #9a8f76 (серые reason других меню)', () => {
  assert.equal(cssRule('.cp-itemmeta')['color'], '#9a8f76',
    'базовый .cp-itemmeta — серый #9a8f76 (красный — только .cp-itemreason)');
});

test('index.html: гард — базовый .cp-itemicon = 22px (существующий класс иконки)', () => {
  const d = cssRule('.cp-itemicon');
  assert.equal(d['width'], '22px', 'базовый .cp-itemicon — width 22px');
  assert.equal(d['height'], '22px', 'базовый .cp-itemicon — height 22px');
});

// --- Красные: 4 правила 000202 (ТЗ: скролл, вписать, красным) ---

test('index.html: .cp-itemreason — красный #e65f52 + font-weight 700 (000202: нехватка — явно красным)', () => {
  const d = cssRule('.cp-itemreason');
  assert.equal(d['color'], '#e65f52',
    'RED: reason красный #e65f52 (существующая палитра, restart-hover); '
    + 'факт: ' + d['color']);
  assert.equal(d['font-weight'], '700',
    'RED: reason font-weight 700 (дополнительный маркер); факт: '
    + d['font-weight']);
});

test('index.html: .combat-overlay--build .combat-side — width min(520px, 94vw) (000202: вписать по горизонтали)', () => {
  const d = cssRule('.combat-overlay--build .combat-side');
  assert.equal(d['width'], 'min(520px, 94vw)',
    'RED: панель строительного меню — width min(520px, 94vw) '
    + '(22 строки читаемы без переноса; на мобильном — 94vw); факт: '
    + d['width']);
});

test('index.html: .combat-overlay--build .cp-items — max-height calc(100vh - 170px) + overflow-y auto (000202: вертикальный скролл)', () => {
  const d = cssRule('.combat-overlay--build .cp-items');
  assert.equal(d['max-height'], 'calc(100vh - 170px)',
    'RED: тело списка — max-height calc(100vh - 170px) (шапка и футер '
    + 'вне скролла); факт: ' + d['max-height']);
  assert.equal(d['overflow-y'], 'auto',
    'RED: тело списка — overflow-y: auto; факт: ' + d['overflow-y']);
});

test('index.html: .combat-overlay--build .cp-itemrow .cp-itemname — min-width 0 + overflow-wrap break-word (000202: flex-ловушка min-width:auto)', () => {
  const d = cssRule('.combat-overlay--build .cp-itemrow .cp-itemname');
  assert.equal(d['min-width'], '0',
    'RED: название — min-width: 0 (flex-ловушка min-width:auto); факт: '
    + d['min-width']);
  assert.equal(d['overflow-wrap'], 'break-word',
    'RED: название — overflow-wrap: break-word (длинная подпись «Построить: '
    + '… — N з. (…)» переносится внутри панели, только в скопе --build); '
    + 'факт: ' + d['overflow-wrap']);
});

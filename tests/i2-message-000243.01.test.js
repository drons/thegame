// Задача 000243.01: I2-сообщение items.test.js «прочие 43 предмета» →
// финальный каталог (микро-ре-пин текста сообщения; TDD-красный пин).
// Усиление 000243.03 (ретро 20261028b, 2 minor): матчеры live-цифр
// «511»/«318» + regex-экстракция «N предмет(а|ов)» = live (files.length
// − withIcon); матчер «193» — подстраховка (один маскируется токеном
// «193 без»).
// Контракт — memory/000243.01-i2-message-repin.md §2 +
// memory/000243.03-i2-message-matchers.md.
//
// source-пин выреза ассерт-сообщения I2 (техника — паттерн
// tests/final-repins-000243.test.js; объект пина — тест-файл, kind=node,
// без vm): 000243.01-I2-M — в I2-блоке (якорь test('000211.06 I2: →
// следующий test()) ровно одна строка с «icon НЕ в required»; вырез
// сообщения (до JSON.stringify(s.required))): «193» (подстраховка),
// «000243.01», «511», «318» (000243.03), НЕ «43 предмета»,
// /(\d+)\s*предмет[аов]/ = live (files.length − withIcon) (000243.03);
// live-кросс-чек 318 с icon / 193 без icon (паттерн 000243-I1-T).
//
// Краснота осмысленная: файл существует и читается, падение =
// ERR_ASSERTION на устаревшей цифре сообщения — НЕ missing module, НЕ
// синтаксис (критерий — шапка final-repins-000243.test.js). До правки
// :2743: ровно 1 fail (ассерт «193»); после: 0.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ITEMS_SRC = fs.readFileSync(
  path.join(__dirname, 'items.test.js'), 'utf8');
const ITEMS_DIR = path.join(__dirname, '..', 'assets', 'items');

test('000243.01-I2-M: I2-сообщение (items.test.js) — «прочие 193 предметов» + «финал 000243.01: каталог 511 = 318 с icon + 193 без» (устаревшее «43 предмета» отсутствует; 000243.03: токены 511/318 + regex «N предмет(а|ов)» = live files.length−withIcon); live-кросс-чек 193/318 = счёт каталога (паттерн 000243-I1-T)', () => {
  const lines = ITEMS_SRC.split('\n');
  const anchors = lines
    .filter(l => l.startsWith("test('000211.06 I2:"));
  assert.equal(anchors.length, 1,
    'якорь I2-блока: строка test(\'000211.06 I2: — ровно одна; '
    + 'найдено: ' + anchors.length);
  const start = lines.findIndex(l => l.startsWith("test('000211.06 I2:"));
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('test(')) { end = i; break; }
  }
  assert.notEqual(end, -1,
    'конец I2-блока (следующая строка test() не найдена');
  const block = lines.slice(start, end);
  const iconLines = block.filter(l => l.includes('icon НЕ в required'));
  assert.equal(iconLines.length, 1,
    'в I2-блоке ровно одна строка с «icon НЕ в required» (title с '
    + 'кавычками «icon» не матчит); найдено: ' + iconLines.length);
  const msgIdx = block.findIndex(l => l.includes('icon НЕ в required'));
  const endIdx = block.findIndex(l => l.includes('JSON.stringify(s.required))'));
  assert.notEqual(endIdx, -1,
    'конец assert.ok-выражения (JSON.stringify(s.required))) — не найден '
    + 'в I2-блоке');
  assert.ok(endIdx > msgIdx,
    'вырез сообщения: конец обязан идти после строки «icon НЕ в '
    + 'required»');
  const msg = block.slice(msgIdx, endIdx + 1).join(' ');
  assert.ok(msg.includes('193'),
    'I2-сообщение — «прочие 193 предметов остаются валидными» (тело '
    + 'I1: others = 193; каталог 511 = 318 с icon + 193 без); '
    + 'факт: ' + msg);
  assert.ok(msg.includes('000243.01'),
    'I2-сообщение — атрибуция ре-пина «финал 000243.01: каталог 511 = '
    + '318 с icon + 193 без» (паттерн S1-T/I1-T: id задачи в сообщении); '
    + 'факт: ' + msg);
  assert.ok(msg.includes('511'),
    'I2-сообщение — «каталог 511 = 318 с icon + 193 без» (live-счёт '
    + 'каталога; усиление 000243.03, ретро 20261028b); факт: ' + msg);
  assert.ok(msg.includes('318'),
    'I2-сообщение — «318 с icon» (511 = 318 + 193; live-счёт каталога; '
    + 'усиление 000243.03, ретро 20261028b); факт: ' + msg);
  assert.ok(!msg.includes('43 предмета'),
    'устаревшее «43 предмета» (RED-стадия 000211.06, каталог 76: 76 − 33 '
    + 'лут-предмета) — отсутствует; факт: ' + msg);
  const files = fs.readdirSync(ITEMS_DIR)
    .filter(f => /^\d{6}\.json$/.test(f));
  let withIcon = 0;
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8'));
    if ('icon' in j) withIcon++;
  }
  assert.equal(withIcon, 318,
    'live-каталог — 318 с icon (сообщение = факт); факт: ' + withIcon);
  assert.equal(files.length - withIcon, 193,
    'live-каталог — 193 без icon (сообщение = факт); факт: '
    + (files.length - withIcon));
  const mN = /(\d+)\s*предмет[аов]/.exec(msg);
  assert.ok(mN,
    'вырез I2-сообщения несёт форму «N предмет(а|ов)» (число, дрейф '
    + 'которого пин создан ловить: 43→193, 6 волн); fail-closed: без '
    + 'токена пин падает; усиление 000243.03, ретро 20261028b; факт: '
    + msg);
  assert.equal(Number(mN[1]), files.length - withIcon,
    '«N предметов» в I2-сообщении = live (files.length − withIcon); '
    + 'матчер «193» — подстраховка (маскируется токеном «193 без»); '
    + 'усиление 000243.03, ретро 20261028b; факт: «' + mN[0] + '» vs '
    + (files.length - withIcon));
});

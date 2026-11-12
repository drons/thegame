// Задача 000243.01: I2-сообщение items.test.js «прочие 43 предмета» →
// финальный каталог (микро-ре-пин текста сообщения; TDD-красный пин).
// Усиление 000243.03 (ретро 20261028b, 2 minor): матчеры live-цифр
// «764»/«0» (текущие тела; ре-пины волн до 000348) + regex-экстракция
// «N предмет(а|ов)» = live (files.length − withIcon); матчер «0» —
// подстраховка (маскируется токенами «000243.01»/«000302.08»).
// Контракт — memory/000243.01-i2-message-repin.md §2 +
// memory/000243.03-i2-message-matchers.md.
//
// source-пин выреза ассерт-сообщения I2 (техника — паттерн
// tests/final-repins-000243.test.js; объект пина — тест-файл, kind=node,
// без vm): 000243.01-I2-M — в I2-блоке (якорь test('000211.06 I2: →
// следующий test()) ровно одна строка с «icon НЕ в required»; вырез
// сообщения (до JSON.stringify(s.required))): «0» (подстраховка),
// «000243.01», «764» (000243.03; ре-пин 000348: 763 → 764), НЕ
// « 23 предмета» (с пробелом-якорем — срез 000302.07),
// /(\d+)\s*предмет[аов]/ = live (files.length − withIcon) (000243.03);
// live-кросс-чек 764 с icon / 0 без icon (паттерн 000243-I1-T).
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

test('000243.01-I2-M: I2-сообщение (items.test.js) — «без icon — 0 предметов» + «финал: каталог 764 = 764 с icon» (ре-пин 000333: +2 свитка навигации с icon; ре-пин 000321.01: +50 оружия с icon; ре-пин 000321.02: +50 брони с icon; ре-пин 000321.03: +50 щитов с icon; ре-пин 000321.04: +50 артефактов с icon; ре-пин 000321.05: +50 инструментов с icon; ре-пин 000348: +1 свиток Декаданс с icon) + атрибуция «финал 000243.01: 318 с icon + 193 без» (устаревшее «23 предмета» отсутствует — срез 000302.07; 000243.03: токен 613 + regex «N предмет(а|ов)» = live files.length−withIcon); live-кросс-чек 0/613 = счёт каталога (паттерн 000243-I1-T)', () => {
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
  assert.ok(msg.includes('0'),
    'I2-сообщение — «без icon — 0 предметов» (тело I1: others = 0; '
    + 'финал: каталог 764 = 764 с icon (ре-пин 000333; ре-пин 000321.01; '
    + 'ре-пин 000321.02; ре-пин 000321.03; ре-пин 000321.04; ре-пин 000321.05; '
    + 'ре-пин 000348); '
    + 'токен — подстраховка, '
    + 'маскируется «000243.01»/«000302.08»; несущий пин — regex); '
    + 'факт: ' + msg);
  assert.ok(msg.includes('000243.01'),
    'I2-сообщение — атрибуция «финал 000243.01: 318 с icon + 193 без» '
    + '(паттерн S1-T/I1-T: id задачи в сообщении; историческая форма '
    + 'сохранена); факт: ' + msg);
  assert.ok(msg.includes('764'),
    'I2-сообщение — «каталог 764 = 764 с icon» (live-счёт каталога; '
    + 'усиление 000243.03, ретро 20261028b; ре-пин 000333: 511 → 513; '
    + 'ре-пин 000321.01: 513 → 563; ре-пин 000321.02: 563 → 613; '
    + 'ре-пин 000321.03: 613 → 663; '
    + 'ре-пин 000321.04: 663 → 713; ре-пин 000321.05: 713 → 763; '
    + 'ре-пин 000348: 763 → 764); '
    + 'факт: ' + msg);
  assert.ok(!msg.includes(' 23 предмета'),
    'устаревшее «23 предмета» (срез 000302.07: «прочие 23 предмета») '
    + '— отсутствует (с пробелом-якорем: live «0 предметов» не '
    + 'маскирует пин подстрокой « 23 предмета»); факт: ' + msg);
  const files = fs.readdirSync(ITEMS_DIR)
    .filter(f => /^\d{6}\.json$/.test(f));
  let withIcon = 0;
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8'));
    if ('icon' in j) withIcon++;
  }
  assert.equal(withIcon, 764,
    'live-каталог — 764 с icon (сообщение = факт; факт: ' + withIcon);
  assert.equal(files.length - withIcon, 0,
    'live-каталог — 0 без icon (сообщение = факт); факт: '
    + (files.length - withIcon));
  const mN = /(\d+)\s*предмет[аов]/.exec(msg);
  assert.ok(mN,
    'вырез I2-сообщения несёт форму «N предмет(а|ов)» (число, дрейф '
    + 'которого пин создан ловить: 43→193→68→43→23→0, 14 волн (6 + 6 '
    + 'иконных 000302.01–.06 + 000302.07 + 000302.08)); fail-closed: '
    + 'без токена пин падает; усиление 000243.03, ретро 20261028b; '
    + 'факт: ' + msg);
  assert.equal(Number(mN[1]), files.length - withIcon,
    '«N предметов» в I2-сообщении = live (files.length − withIcon); '
    + 'матчер «0» — подстраховка (маскируется токенами «000243.01»/'
    + '«000302.08»); усиление 000243.03, ретро 20261028b; '
    + 'факт: «' + mN[0] + '» vs ' + (files.length - withIcon));
});

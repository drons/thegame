// Задача 000259 (хутор 5×5: интерьер ≥ 3×3; монотонность размеров
// городов) — RED-тесты wording (docs only; код игры и существующие
// тесты НЕ меняются на красной стадии).
//
// Контракты (memory/000259-hamlet-5x5-monotone.md §4 — фикс. пин-
// фразы; реализатор пишет spec ДословНО так, чтобы пины проходили):
// * W1 — spec/buildings.md «Вход и внутреннее пространство»: формула
//   «max(4f−2, 5)» (минус U+2212), строка таблицы «| 1 | 5×5 | 9 |»
//   (× U+00D7), монотонность «9 < 16 < 256 < 576»; старого «вырожден-
//   ный, интерьер 0» НЕТ (строки 2/5/7 таблицы — без изменений).
// * W2 — spec/buildings.md «Содержимое города»: исключение убрано —
//   «задокументированное исключение (интерьер 0, buildings: [])»
//   НЕТ; «мин_постройки = 0 — таверны при wealth ≥ 1» (≥ U+2265)
//   ЕСТЬ (таверна — первая постройка).
// * W3 — spec/buildings.md «Строительство и цены»: «Хутор
//   (интерьер 0) — НЕ застраивается» НЕТ; «потолок = floor(9/2) = 4»
//   ЕСТЬ (хутор застраивается на общих основаниях).
// * W4 — ВСЕ spec/*.md + assets/buildings/000051.json — «интерьер 0»
//   и «без внутренностей» НЕТ (сейчас: 3 хита в spec/buildings.md —
//   все в правимых строках + функция 000051.json). Зеркало
//   src/buildings.js — регенерация scripts/sync-buildings-data.js
//   (JSON↔JS-консистентность пинят tests/buildings.test.js).
//
// Красные «отсутствием/присутствием» (осмысленно — правок SPEC ещё
// нет, не синтаксис: все файлы существуют и читаются, падения —
// ERR_ASSERTION по отсутствию/присутствию ТЕКСТА). Паттерн
// tests/spec-000258-wording.test.js: norm() (SPEC ломает строки,
// фразы-ассерты встают в строку после norm).
//
// expectedRedCount = 4 (W1..W4). Вместе с 000259-L1..L3, M1, B1
// (tests/cities.test.js) — ровно 9 красных задачи.

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
const SPEC_FILES = fs.readdirSync(path.join(ROOT, 'spec'))
  .filter((f) => f.endsWith('.md'));
const HAMLET_JSON = fs.readFileSync(
  path.join(ROOT, 'assets', 'buildings', '000051.json'), 'utf8');

test('SPEC 000259 W1: buildings «Вход и внутреннее пространство» — «max(4f−2, 5)» + строка «| 1 | 5×5 | 9 |» + «9 < 16 < 256 < 576»; без «вырожденный, интерьер 0»', () => {
  assert.ok(
    BUILDINGS.includes('max(4f−2, 5)'),
    'spec/buildings.md: формула «max(4f−2, 5)» (000259: хутор 5×5) ' +
    'отсутствует — сейчас «сторона = 4f−2» (хутор 2×2)');
  assert.ok(
    BUILDINGS.includes('| 1 | 5×5 | 9 |'),
    'строка таблицы «| 1 | 5×5 | 9 |» отсутствует — сейчас ' +
    '«| 1 | 2×2 | 0 |» (строки 2/5/7 — без изменений)');
  assert.ok(
    BUILDINGS.includes('9 < 16 < 256 < 576'),
    'монотонность интерьеров «9 < 16 < 256 < 576» отсутствует');
  assert.ok(
    !BUILDINGS.includes('вырожденный, интерьер 0'),
    'старое wording «хутор (f=1) — вырожденный, интерьер 0» осталось — ' +
    'переписать: 5×5 (интерьер 3×3 = 9; минимум 3×3)');
});

test('SPEC 000259 W2: buildings «Содержимое города» — без «задокументированное исключение (интерьер 0, buildings: [])»; «мин_постройки = 0 — таверны при wealth ≥ 1»', () => {
  assert.ok(
    !BUILDINGS.includes(
      'задокументированное исключение (интерьер 0, buildings: [])'),
    'старое wording «хутор — задокументированное исключение ' +
    '(интерьер 0, buildings: [])» осталось — 000259: хутор ' +
    'застраивается на общих основаниях (интерьер 9)');
  assert.ok(
    BUILDINGS.includes(
      'мин_постройки = 0 — таверны при wealth ≥ 1'),
    'новое wording «мин_постройки = 0 — таверны при wealth ≥ 1» ' +
    'отсутствует (таверна — первая постройка; wealth 0 — без ' +
    'построек)');
});

test('SPEC 000259 W3: buildings «Строительство и цены» — без «Хутор (интерьер 0) — НЕ застраивается»; «потолок = floor(9/2) = 4»', () => {
  assert.ok(
    !BUILDINGS.includes('Хутор (интерьер 0) — НЕ застраивается'),
    'старое wording «Хутор (интерьер 0) — НЕ застраивается ' +
    '(вырожденный)» осталось — 000259: хутор (интерьер 9) ' +
    'застраивается на общих основаниях');
  assert.ok(
    BUILDINGS.includes('потолок = floor(9/2) = 4'),
    'новое wording «потолок = floor(9/2) = 4» отсутствует');
});

test('SPEC 000259 W4: ВСЕ spec/*.md + assets/buildings/000051.json — без «интерьер 0» и без «без внутренностей»', () => {
  const bad = [];
  for (const f of SPEC_FILES) {
    const text = fs.readFileSync(path.join(ROOT, 'spec', f), 'utf8');
    if (text.includes('интерьер 0')) bad.push('spec/' + f + ': интерьер 0');
    if (text.includes('без внутренностей'))
      bad.push('spec/' + f + ': без внутренностей');
  }
  if (HAMLET_JSON.includes('интерьер 0'))
    bad.push('assets/buildings/000051.json: интерьер 0');
  if (HAMLET_JSON.includes('без внутренностей'))
    bad.push('assets/buildings/000051.json: без внутренностей');
  assert.deepEqual(bad, [],
    'старое wording (интерьер 0 / без внутренностей) осталось: ' +
    bad.join(', ') + ' — переписать по 000259 (хутор 5×5, интерьер ' +
    '3×3 = 9)');
});

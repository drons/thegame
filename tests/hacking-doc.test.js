// HACKING.md: технические подробности вынесены из README.md в отдельный
// корневой файл (задача 000160; workflow запущен с меткой 000151 — разбор
// расхождения: memory/000151-hacking.md).
//
// Пин сплита (контракт D-4, memory/000160-hacking-doc.md):
//  * HACKING.md (корень репозитория) обязан существовать и содержать три
//    раздела, перенесённых из README.md VERBATIM (побайтово):
//    «## Запуск», «## Тесты и утилиты», «## Структура проекта» — плюс
//    verbatim-маркеры содержимого (`python3 -m http.server`,
//    `npm run gen:map`, `globalThis.Game`);
//  * README.md обязан ссылаться на [HACKING.md](HACKING.md) и НЕ содержать
//    вынесенных разделов; «## Рабочий процесс» и футапр остаются в README
//    (граница D-1: охват ТЗ — «сборка, тестирование, архитектура»,
//    процесс не выносится).
//
// Любая будущая правка README.md/HACKING.md обязана держать этот файл
// зелёным; ре-пин — только с комментарием номера задачи.
//
// Красные на текущем коде: HACKING.md не существует (файл новой
// функциональности) и README.md ещё содержит все три вынесенных раздела и
// не содержит ссылки — функциональность задачи 000160 ещё не реализована.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const HACKING = path.join(ROOT, 'HACKING.md');
const README = path.join(ROOT, 'README.md');

// Три раздела, которые обязан содержать HACKING.md (и которых обязан НЕ
// содержать README.md) — список одинаковый для обоих тестов.
const MOVED_SECTIONS = ['## Запуск', '## Тесты и утилиты', '## Структура проекта'];

// Verbatim-маркеры: по одному из каждого вынесенного раздела — защищают
// перенос «как есть» (контракт D-4 проверяет наличие маркеров, полноту —
// глазами на зелёной стадии; verbatim-долг D-2/D-3 — НЕ чинить без
// отдельной задачи).
const VERBATIM_MARKERS = [
  'python3 -m http.server', // «## Запуск» (локальный сервер)
  'npm run gen:map',        // «## Тесты и утилиты» (генерация превью карты)
  'globalThis.Game',        // «## Структура проекта» (описание JS-модулей)
];

test('HACKING.md: существует и содержит вынесенные из README.md разделы (000160)', () => {
  // Красный сейчас: файла нет (fs.existsSync === false) — технические
  // подробности ещё не вынесены из README.md.
  assert.ok(fs.existsSync(HACKING),
    'HACKING.md отсутствует: технические подробности (сборка, тестирование, ' +
    'архитектура) ещё не вынесены из README.md (задача 000160)');
  const doc = fs.readFileSync(HACKING, 'utf8');
  for (const h of MOVED_SECTIONS) {
    assert.ok(doc.includes(h),
      'HACKING.md: нет раздела «' + h + '» (задача 000160: раздел обязан быть ' +
      'перенесён из README.md)');
  }
  for (const m of VERBATIM_MARKERS) {
    assert.ok(doc.includes(m),
      'HACKING.md: нет verbatim-маркера «' + m + '» (задача 000160: перенос ' +
      'побайтово, без пересказа)');
  }
});

test('README.md: ссылка на HACKING.md, вынесенных разделов нет (000160)', () => {
  const readme = fs.readFileSync(README, 'utf8');
  // Красный сейчас: ссылки нет — README ещё сам содержит все три раздела.
  assert.ok(readme.includes('[HACKING.md](HACKING.md)'),
    'README.md: нет ссылки на [HACKING.md](HACKING.md) (задача 000160: ' +
    'технические подробности вынесены, README обязан на них ссылаться)');
  for (const h of MOVED_SECTIONS) {
    assert.ok(!readme.includes(h),
      'README.md: раздел «' + h + '» обязан быть перенесён в HACKING.md, а ' +
      'не оставаться в README (задача 000160)');
  }
  // D-1: «## Рабочий процесс» НЕ выносится — охват ТЗ (сборка,
  // тестирование, архитектура) его не называет.
  assert.ok(readme.includes('## Рабочий процесс'),
    'README.md: «## Рабочий процесс» обязан остаться в README (задача 000160, ' +
    'граница D-1)');
  // Футер README — на месте.
  assert.ok(readme.includes('README дополняется по мере развития проекта.'),
    'README.md: футапр «README дополняется по мере развития проекта.» обязан ' +
    'остаться (задача 000160)');
});

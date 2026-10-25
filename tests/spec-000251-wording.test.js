// Задача 000251 (сундуки подземелий: фантомные legacy-брони вне пулов
// CRYPT/RUINS + раздел «Лут» в SPEC — chest-equip-блок) — RED-тесты
// wording (docs only; код игры и существующие тесты НЕ меняются на
// красной стадии).
//
// Контракты (memory/000251-chest-phantoms.md §6.3–6.4 — фикс.
// пин-фразы; реализатор пишет spec ДословНО так, чтобы пины
// проходили; переносы свободны, порядок слов закреплён W1–W5):
// * W1 — триггер: «Снаряжение сундуков (000230.05; 000251 —
//   задокументировано): роулнутый предмет с ЯВНЫМ `slot`».
// * W2 — поток/порядок: «СВОЙ rng-поток mulberry32(hash2(seed,
//   depth, CHEST_EQ_SALT = 0x0E5C) >>> 0) — блок ПОСЛЕ залежей».
// * W3 — плоская модель (D-2): «редкость — ПЛОСКАЯ RARITY
//   50/30/15/4.9/0.1: глубина НЕ участвует в редкости (принятая
//   модель сундуков».
// * W4 — сейв: «замена IN-PLACE (НОВЫХ КЛЮЧЕЙ В ОБЪЕКТЕ СУНДУКА
//   НЕТ — сейв v1 не тронут)».
// * W5 — чистка 000251: «chainmail (CRYPT, dungeons/000002.json) и
//   knight_plate (RUINS, dungeons/000003.json) — УБРАНЫ из пулов
//   «предметы»».
//
// Красные «отсутствием» (осмысленно — правок SPEC ещё нет, не
// синтаксис: файл существует и читается, падение — ERR_ASSERTION по
// отсутствию ТЕКСТА в секции «## Лут»). Паттерн
// tests/spec-000235-wording.test.js: h2() (срез «## Лут» до
// следующего '\n## ') + norm() (SPEC ломает строки, фразы-ассерты
// встают в строку после norm). Существующие пины «## Лут»
// (spec-000235-wording) — НЕ ТРОГАТЬСЯ (C-8).
//
// expectedRedCount = 1 (S1; вместе с 000251-P1/P2 — 3 красные
// задачи).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DUNGEONS_STORAGE = fs.readFileSync(
  path.join(ROOT, 'spec', 'dungeons-storage.md'), 'utf8');

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Срез H2-подраздела «## <name>» внутри текста (до следующего '\n## ').
function h2(sec, name) {
  const m = sec.match(new RegExp('^## ' + esc(name) + '\\s*$', 'm'));
  assert.ok(m, 'spec: подраздел «' + name + '» не найден');
  const i = m.index;
  const j = sec.indexOf('\n## ', i + 1);
  return sec.slice(i, j === -1 ? sec.length : j);
}

// Нормализация белых: фразы, сломавшиеся переносом, встают в строку.
function norm(s) {
  return s.replace(/\s+/g, ' ');
}

test('SPEC 000251 S1: dungeons-storage «Лут» — chest-equip-блок задокументирован (триггер — явный slot; СВОЙ rng-поток ПОСЛЕ залежей; плоская RARITY — глубина не участвует; IN-PLACE — сейв v1 не тронут; чистка фантомов)', () => {
  const lut = norm(h2(DUNGEONS_STORAGE, 'Лут'));
  assert.ok(
    lut.includes(
      'Снаряжение сундуков (000230.05; 000251 — задокументировано): ' +
      'роулнутый предмет с ЯВНЫМ `slot`'),
    'W1 (триггер — явный slot) отсутствует — абзац chest-equip ещё ' +
    'не добавлен (000251)');
  assert.ok(
    lut.includes(
      'СВОЙ rng-поток mulberry32(hash2(seed, depth, ' +
      'CHEST_EQ_SALT = 0x0E5C) >>> 0) — блок ПОСЛЕ залежей'),
    'W2 (rng-поток/порядок: ПОСЛЕ залежей) отсутствует — абзац ' +
    'chest-equip ещё не добавлен (000251)');
  assert.ok(
    lut.includes(
      'редкость — ПЛОСКАЯ RARITY 50/30/15/4.9/0.1: глубина НЕ ' +
      'участвует в редкости (принятая модель сундуков'),
    'W3 (плоская RARITY; глубина не участвует — принятая модель) ' +
    'отсутствует — абзац chest-equip ещё не добавлен (000251)');
  assert.ok(
    lut.includes(
      'замена IN-PLACE (НОВЫХ КЛЮЧЕЙ В ОБЪЕКТЕ СУНДУКА НЕТ — сейв ' +
      'v1 не тронут)'),
    'W4 (IN-PLACE; сейв v1 не тронут) отсутствует — абзац ' +
    'chest-equip ещё не добавлен (000251)');
  assert.ok(
    lut.includes(
      'chainmail (CRYPT, dungeons/000002.json) и knight_plate ' +
      '(RUINS, dungeons/000003.json) — УБРАНЫ из пулов «предметы»'),
    'W5 (чистка фантомов 000251) отсутствует — абзац chest-equip ' +
    'ещё не добавлен (000251)');
});

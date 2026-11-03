// Задача 000295 (на-экранная кнопка «Отряд» [C] рядом с [I]/[E] —
// глобальная карта, подземелья, города; ТЗ tasks/pending/000295.md;
// контракт memory/000295-squad-button.md) — RED-тест (SPEC-слово).
// Код игры, существующие тесты и spec/ НЕ меняются на красной стадии:
// приложение буллета «Активация панели «Отряд»…» в конец раздела
// «## UI» (= 4 строки, companions.md 152 → 156) + ре-пин
// SPEC_FILE_LINES (tests/spec-split.test.js 152 → 156, 000159 §5.1)
// — зелёная стадия (том же коммите).
//
// Фиксация (контракт §2):
//   W1. Раздел «## UI» spec/companions.md — буллет «Активация
//       панели «Отряд» — клавиша [C] (С в русской раскладке) и
//       на-экранная кнопка «Отряд» (иконка, без текстовой буквы —
//       как кнопки [I]/[E]) рядом с ними; видима во всех трёх
//       контекстах: глобальная карта, подземелья, города
//       (задача 000295).»; guard specLines(companions.md) = 156
//       (152 → 156: +4).
//
// Срезы: COMPANIONS = весь spec/companions.md (readFileSync ОДИН
// РАЗ); h2() — 1:1 tests/spec-000298-wording.test.js; norm() —
// коллапс белых (SPEC переносит строки).
//
// Краснота ОСМЫСЛЕННАЯ (файл существует и читается; раздел «UI»
// на HEAD ЕСТЬ — h2-ассерт зелёный): W1 — phrase(): буллета нет
// + guard specLines(companions.md) = 156 (файл 152).
// SELF-SCAN (HEAD): все positive-needle W1 отсутствуют.
//
// expectedRedCount (файл) = 1 (W1).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const COMPANIONS = fs.readFileSync(
  path.join(ROOT, 'spec', 'companions.md'), 'utf8');

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Срез H2-подраздела «## <name>» (до следующего '\n## ' или конца).
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

// positive-needle в срезе (нормализованном): падение — ERR_ASSERTION
// «фраза не найдена» (файл существует — осмысленная краснота, правок
// SPEC ещё нет).
function phrase(slice, label, needle, why) {
  assert.ok(
    norm(slice).includes(needle),
    label + ': фраза не найдена: «' + needle + '» — ' + why);
}

// Конвенция 000159 R5: split('\n') + pop хвостового ''.
function specLines(s) {
  const lines = s.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines.length;
}

test('SPEC 000295 W1: spec/companions.md — «UI»: активация «Отряда» — клавиша [C] + на-экранная кнопка (иконка), 3 контекста; 196 строк (000299.01: +25 H2 «Активный персонаж»; 000304: +15 абзац «Сейв» — squad_placement; 000295: +4 буллет «UI»)', () => {
  const sc = h2(COMPANIONS, 'UI');
  phrase(sc, '«UI»', 'Активация панели «Отряд» — клавиша [C]',
    'заголовок буллета не зафиксирован');
  phrase(sc, '«UI»', '(С в русской раскладке)',
    'обозначение клавиши в русской раскладке не зафиксировано');
  phrase(sc, '«UI»', 'на-экранная кнопка «Отряд» (иконка, без текстовой буквы',
    'кнопка-иконка без текстовой буквы не зафиксирована');
  phrase(sc, '«UI»', 'как кнопки [I]/[E]) рядом с ними',
    'расположение рядом с [I]/[E] не зафиксировано');
  phrase(sc, '«UI»',
    'видима во всех трёх контекстах: глобальная карта, подземелья, города',
    'три контекста видимости не зафиксированы');
  phrase(sc, '«UI»', '(задача 000295)',
    'отсылка к задаче 000295 не зафиксирована');
  assert.equal(specLines(COMPANIONS), 196,
    'spec/companions.md: строк != 196 (000295: +4 строки буллета '
    + '«Активация панели «Отряд»» в конец раздела «## UI», 152 → '
    + '156; 000304: +15 абзац «Сейв» — squad_placement, 156 → 171; '
    + '000299.01: +25 H2 «Активный персонаж», 171 → 196) '
    + '+ ре-пин SPEC_FILE_LINES (000159 §5.1) в том же коммите');
});

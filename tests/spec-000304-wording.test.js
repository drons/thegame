// Задача 000304 (расстановка перед боем: запоминание в общем сейве
// между боями + порядок на вкладке «Отряд» [C]; ТЗ
// tasks/pending/000304.md; контракт
// memory/000304-squad-placement-persist.md) — RED-тест (SPEC-слово).
// Код игры, существующие тесты и spec/ НЕ меняются на красной стадии:
// приложение 15 строк в конец абзаца раздела «## Сейв»
// (companions.md 156 → 171) + ре-пин SPEC_FILE_LINES
// (tests/spec-split.test.js 156 → 171, 000159 §5.1) — зелёная стадия
// (том же коммите).
//
// Фиксация (контракт §2):
//   W1. Раздел «## Сейв» spec/companions.md — 15 строк про
//       squad_placement: «результат расстановки живёт в общем
//       сейве между боями»; раздел `squad_placement` (id боевого
//       юнита 'player'/'efir'/npcId → [x, y]); Запись — при
//       закрытии окна расстановки со сменой позиций; следующий бой
//       стартует с последней расстановки; невалидная расстановка —
//       тихо на якоря; старый сейв (v1, без раздела) — восстановление
//       чисто (паттерн 000109 R5): первый бой — дефолтная
//       расстановка (якоря); версию НЕ поднимаем, миграций нет
//       (000031); невалидные записи — тихий сброс (паттерн 000029);
//       порядок расстановки показывается на вкладке «Отряд» [C]
//       (000295). guard specLines(companions.md) = 171
//       (156 → 171: +15).
//
// Срезы: COMPANIONS = весь spec/companions.md (readFileSync ОДИН
// РАЗ); h2() — 1:1 tests/spec-000295-wording.test.js; norm() —
// коллапс белых (SPEC переносит строки).
//
// Краснота ОСМЫСЛЕННАЯ (файл существует и читается; раздел «Сейв»
// на HEAD ЕСТЬ — h2-ассерт зелёный): W1 — phrase(): фраз нет
// + guard specLines(companions.md) = 171 (файл 156).
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

test('SPEC 000304 W1: spec/companions.md — «Сейв»: squad_placement (расстановка между боями + порядок на вкладке «Отряд» [C]); 171 строка', () => {
  const sc = h2(COMPANIONS, 'Сейв');
  phrase(sc, '«Сейв»',
    'результат расстановки живёт в общем сейве между боями',
    'хранение расстановки между боями не зафиксировано');
  phrase(sc, '«Сейв»', '`squad_placement`',
    'имя раздела сейва не зафиксировано');
  phrase(sc, '«Сейв»', "id боевого юнита 'player'/'efir'/npcId → [x, y]",
    'формат записи раздела (id боевого юнита → клетка) не зафиксирован');
  phrase(sc, '«Сейв»',
    'Запись — при закрытии окна расстановки со сменой позиций',
    'точка записи не зафиксирована');
  phrase(sc, '«Сейв»',
    'следующий бой стартует с последней расстановки',
    'чтение расстановки на старте боя не зафиксировано');
  phrase(sc, '«Сейв»', 'версию НЕ поднимаем, миграций нет',
    'неломкое расширение v1 (без миграций) не зафиксировано');
  phrase(sc, '«Сейв»', 'дефолтная расстановка (якоря)',
    'fallback старого сейва — дефолтная расстановка — не зафиксирован');
  phrase(sc, '«Сейв»',
    'Порядок расстановки показывается на вкладке «Отряд» [C] (000295)',
    'отображение порядка расстановки на вкладке «Отряд» не зафиксировано');
  assert.equal(specLines(COMPANIONS), 171,
    'spec/companions.md: строк != 171 (156 → 171: +15 строк в абзац '
    + '«Сейв» — squad_placement) + ре-пин SPEC_FILE_LINES (000159 §5.1) '
    + 'в том же коммите');
});

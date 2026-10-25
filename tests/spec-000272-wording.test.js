// Задача 000272 (реген призывного: потребитель traits.regen у союзников;
// follow-up RETRO-20261025 F2; ТЗ tasks/pending/000272.md; контракт
// memory/000272-summon-regen.md §5.3/§5.4) — RED-тест (docs only; код
// игры и существующие тесты НЕ меняются на красной стадии).
//
// ТЗ п.3: в spec/spells.md «## Действия заклинаний», буллет
// «Потребление статов (000267)» — пометка «traits.regen призывного —
// startRound, паттерн моба (+10% maxHP, 000272)» (одна физическая
// строка ПОСЛЕ буллета lifesteal, ПЕРЕД строкой «потребителей нет»).
//
// Красный «отсутствием» (осмысленно — spec/spells.md существует и
// читается, H2 «## Действия заклинаний» и буллет «Потребление статов»
// на месте — отсутствует ТОЛЬКО новая фраза, ERR_ASSERTION, не
// load-ошибка). Прецедент: spec-000267-wording (нормализация
// esc/h2/norm 1:1; 1 правка = 1 test). Нормализация белых ОБЯЗАТЕЛЬНА
// (SPEC переносит строки ~64-70 кол., фразы ломаются по словам) +
// регистронезависимость (пины — срединные фразы, начало строк в SPEC
// может капситься).
//
// expectedRedCount (файл) = 1. Файл НЕ создаёт файлов в spec/
// (R1 spec-split: ровно 23).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
// 000159: SPEC.md разбит на spec/*.md — пины читают подфайлы напрямую.
const SPELLS = fs.readFileSync(path.join(ROOT, 'spec', 'spells.md'), 'utf8');

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Срез H2-подраздела «## <name>» внутри текста раздела.
function h2(sec, name) {
  const m = sec.match(new RegExp('^## ' + esc(name) + '\\s*$', 'm'));
  assert.ok(m, 'spec: подраздел «' + name + '» не найден');
  const i = m.index;
  const j = sec.indexOf('\n## ', i + 1);
  return sec.slice(i, j === -1 ? sec.length : j);
}

// Нормализация: белые → пробел, регистр → lower (фразы, сломавшиеся
// переносом, встают в строку; капс начала строки не ломает пин).
function norm(s) {
  return s.replace(/\s+/g, ' ').toLowerCase();
}

// Срез: H2 «## Действия заклинаний» → следующий H2 («Каст вне боя»).
const D = () => norm(h2(SPELLS, 'Действия заклинаний'));

test('SPEC 000272: spells.md «Действия заклинаний» — буллет «Потребление статов» содержит пометку «traits.regen призывного — startRound, паттерн моба (+10% maxHP, 000272)»', () => {
  const d = D();
  assert.ok(
    d.includes('потребление статов'),
    '«## Действия заклинаний»: буллет «Потребление статов» (000267) '
    + 'отсутствует (контекст)');
  assert.ok(
    d.includes('traits.regen призывного — startround, паттерн моба '
    + '(+10% maxhp, 000272)'),
    '«Потребление статов»: пометка «traits.regen призывного — '
    + 'startRound, паттерн моба (+10% maxHP, 000272)» (ТЗ п.3) '
    + 'отсутствует — фиксация, где у союзников читается трейт '
    + 'призывного (контракт memory/000272-summon-regen.md §5.4)');
});

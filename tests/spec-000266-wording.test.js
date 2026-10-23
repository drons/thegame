// Задача 000266 (SPEC: dungeons-storage «Залежи» — хвост буллета
// «Рендер» под факт 000247: механизм hintEl/hintBase/onDeposit удалён
// СОВСЕМ, hint нет ни в городе, ни в подземелье, единственный
// потребитель floorStatusLine — locationLine hud.js; findings ревью
// волны 000247, 2026-10-23; отложенный шаг 000247 §7/§9) — RED-тест
// (docs only; код игры и существующие тесты НЕ меняются на красной
// стадии).
//
// ТЗ (tasks/pending/000266.md): буллет «Рендер» «## Залежи»
// (spec/dungeons-storage.md L168-170) описывает механизм hint
// (hintEl/hintBase/onDeposit, onDeposit = !isCity), удалённый СОВСЕМ
// в 000247 — переписать хвост под факт: строка «Залежь — [E]»
// отсутствует нигде; единственный потребитель floorStatusLine
// (locations.js) — locationLine hud.js.
//
// Контракты: memory/000266-render-bullet-repin.md (§3 — дословное
// новое предложение 478 зн.; §4.1 — этот тест; §4.2/§4.3 — re-pin
// W2 000218 + guard 000234 в одном RED-коммите).
//
// Красные «отсутствием» (осмысленно — правок SPEC ещё нет, не
// синтаксис: spec/dungeons-storage.md существует и читается, H2
// «## Залежи» на месте — падение ERR_ASSERTION по отсутствию нового
// текста; негативы — по присутствию старого). Прецеденты: 000218
// (wording-пины + нормализация; 1 правка = 1 test), 000234 (re-pin
// в том же тест-файле: позитив заменён, негатив сохранён, шапка не
// трогается). Нормализация белых — ОБЯЗАТЕЛЬНА (SPEC переносит строки
// ~64-70 кол., фразы ломаются по словам). Хелперы esc/h2/norm — 1:1
// из tests/spec-000218-wording.test.js (h1 не нужен: один файл,
// срез H2 → EOF — «## Залежи» последний H2).
//
// expectedRedCount = 1 (W-000266; полный RED сьют — 3 «not ok»
// вместе с re-pin W2 000218 и guard 000234). Файл НЕ содержит
// литерала «SPEC» + «453» (SPEC-453-GONE сканит tests/+src/ — сам
// файл читается сканом) и НЕ создаёт файлов в spec/ (R1
// spec-split: ровно 23).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
// 000159: SPEC.md разбит на spec/*.md — пины читают подфайлы напрямую.
const DUNGEONS_STORAGE = fs.readFileSync(path.join(ROOT, 'spec', 'dungeons-storage.md'), 'utf8');

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

// Нормализация белых: фразы, сломавшиеся переносом, встают в строку.
function norm(s) {
  return s.replace(/\s+/g, ' ');
}

// Срез: H2 «## Залежи» → EOF (последний H2 dungeons-storage.md).
const Z = () => norm(h2(DUNGEONS_STORAGE, 'Залежи'));

// ФИНАЛЬНОЕ слово 000266 — полное норм-предложение хвоста буллета
// «Рендер» (контракт §3; 478 зн., сверено вычислением; на GREEN —
// из фактически отредактированного SPEC нормализацией, не с
// клавиатуры — §8(a), протокол 000234).
const NEW_TAIL = 'HUD — счётчик «Залежи: N» в инфо-окне НЕ выводится (000212); строка hint «Залежь — [E]» — в подземелье/пещерах убрана вместе с панелью `.combat-side` (000229), в городе — панель убрана СОВСЕМ (000247): hint нет ни в городе, ни в подземелье — строка «Залежь — [E]» отсутствует нигде; механизм (hintEl/hintBase/onDeposit) удалён СОВСЕМ (`src/dungeon-ui.js`: 0 ссылок на `.combat-state`/`.combat-log`); единственный потребитель floorStatusLine (locations.js) — locationLine hud.js.';

test('SPEC 000266: dungeons-storage «Залежи» (Рендер) — хвост под факт 000247: механизм (hintEl/hintBase/onDeposit) удалён СОВСЕМ; hint нет ни в городе, ни в подземелье — строка «Залежь — [E]» отсутствует нигде; единственный потребитель floorStatusLine — locationLine hud.js; старый текст — ОТСУТСТВУЕТ', () => {
  const z = Z();
  assert.ok(
    z.includes(NEW_TAIL),
    '«## Залежи» (буллет «Рендер»): хвост обязан гласить «HUD — счётчик' +
      '«Залежи: N» в инфо-окне НЕ выводится (000212); строка hint «Залежь' +
      '— [E]» — в подземелье/пещерах убрана вместе с панелью' +
      '`.combat-side` (000229), в городе — панель убрана СОВСЕМ (000247):' +
      'hint нет ни в городе, ни в подземелье — строка «Залежь — [E]»' +
      'отсутствует нигде; механизм (hintEl/hintBase/onDeposit) удалён' +
      'СОВСЕМ (`src/dungeon-ui.js`: 0 ссылок на' +
      '`.combat-state`/`.combat-log`); единственный потребитель' +
      'floorStatusLine (locations.js) — locationLine hud.js.» (000247:' +
      'панель .combat-side (stateEl/logEl/hint) не создаётся в обоих' +
      'kind\'ах — запись об удалении dungeon-ui.js L42-44; 0 ссылок на' +
      '.combat-state/.combat-log; floorStatusLine (locations.js L768,' +
      'экспорт L836) — ЕДИНЫЙ источник, ЕДИНСТВЕННЫЙ потребитель —' +
      'locationLine hud.js (L152; call L163-164); структурный пин' +
      'dungeon-ui.test.js (floorStatusLine в hud.js, НЕ в dungeon-ui.js);' +
      'фиксаторы: RW-1..4/RW-G1, DH-4, DE-1, CI-V3; текст пина — из' +
      'фактически отредактированного SPEC нормализацией, протокол 000234)');
  assert.ok(
    !z.includes('механизм render() сохранён'),
    '«## Залежи» (буллет «Рендер»): старая формула «механизм render() ' +
      'сохранён» не удалена — 000247: механизм (hintEl/hintBase/onDeposit) ' +
      'удалён СОВСЕМ из src/dungeon-ui.js');
  assert.ok(
    !z.includes('hint — только город'),
    '«## Залежи» (буллет «Рендер»): старая формула «hint — только город» ' +
      'не удалена — 000247: hint нет ни в городе, ни в подземелье (строка ' +
      '«Залежь — [E]» отсутствует нигде)');
});

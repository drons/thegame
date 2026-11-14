// Задача 000379: развязка тройки «замороженный items-реестр ≡ живые
// bijection-зубья ≡ рост каталога items» (ретро-b22 P2; прецедент
// discovery-манифеста 000375 — число не пинуется, обнаружение предикатом).
//
// Реальное состояние базы (мастер 52b75f90): каталог assets/items и реестр
// tests/scripts/items-num2id-000318.08.json выросли до 914 волной 000321.08,
// а память memory/000318-asset-rename.md §5 продолжала велеть реестр
// «НЕ расширять» — директива мертва де-факто. При этом «рост без строки
// реестра» физически невозможен: loadCatalog в tests/scripts/
// canon-items-sync-core.js берёт num из ЭТОГО реестра, а
// canon-items-sync-000284.02 (игла c1) требует nums ≡ {1..N} без дыр —
// предмет вне реестра даёт num === undefined и краснит канон молча.
//
// Значит канон один: реестр растёт ВМЕСТЕ с каталогом построчно
// APPEND-ONLY, заморожены СТРОКИ (запрет пере-нумерации), а не длина.
// Механика зубов в tests/items-rename-000318.08.test.js переведена на живые
// предикаты (+ зуб append-only против HEAD + self-gate T12); этот файл
// сторожит ОБРАТНУЮ сторону: память правдива, контракт волновых хелперов
// описан и выполняется, и никто из нас не стал держателем base_price-иглы.
//
// Красные тесты (TDD) на чистой базе: осмысленные ERR_ASSERTION у Т1 (память
// §5 всё ещё велит «НЕ расширять») и у Т2 (контракт вне-реестровых id в
// памяти не описан), Т3 зелёный и на базе; загрузка сьюта не падает.
//
// Вне SCOPE: tests/skills-rename-000318.09.test.js и tests/npc-* — 0-diff
// (параллельные волны 000384/000320.28); перенос паттерна на skills/npc —
// задача 000387. CHANGELOG 0-diff (tests/memory-only, прецеденты
// 000371/000375/000381).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ITEMS_DIR = path.join(ROOT, 'assets', 'items');
const LEDGER_REL = path.join('tests', 'scripts',
  'items-num2id-000318.08.json');
const MEMORY_RENAME = path.join(ROOT, 'memory', '000318-asset-rename.md');
const MEMORY_I08 = path.join(ROOT, 'memory',
  '000318.08-items-slug-rename.md');
const GUARDED_FILES = [
  'tests/items-rename-000318.08.test.js',
  'tests/items-registry-unfetter-000379.test.js',
];

const LEDGER_PATH = 'tests/scripts/items-num2id' + '-000318.08.json';

function readLedger() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, LEDGER_REL), 'utf8'));
}

function catalogIds() {
  const JR = require('../scripts/lib/json-ref.js');
  const re = JR.SHAPE_BASENAME_RES[JR.ASSET_NAME_SHAPES.items];
  return fs.readdirSync(ITEMS_DIR)
    .filter((f) => f !== 'schema.json' && re.test(f))
    .map((f) => JSON.parse(fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8')).id);
}

// Память читается БЛОКАМИ, а не регэкспом по всему файлу: §5 — это один
// физический параграф, в котором подряд идут clause'ы «С 000318.06 …»,
// «С 000318.07 …», «С 000318.08 …», «С 000318.09 …». Граница clause-ов —
// сам маркер, поэтому items-плечо проверяется НЕ глядя на skills/npc
// (их тексты — скоуп 000387, и «НЕ расширять» для них остаётся в силе).
function clauseAfter(text, startRe, endRe) {
  const m = startRe.exec(text);
  assert.ok(m, 'в памяти не найден блок по якорю ' + startRe
    + ' — блок переименован: перенести якорь осознанно');
  const rest = text.slice(m.index);
  const end = endRe ? rest.slice(1).search(endRe) : -1;
  return end < 0 ? rest : rest.slice(0, end + 1);
}

test('000379 T1: память правдива для items — ни один блок memory/000318-asset-rename.md про items-реестр не велит «НЕ расширять» и не называет его замороженным; §5 содержит append-only-рецепт', () => {
  assert.ok(fs.existsSync(MEMORY_RENAME),
    'RED: memory/000318-asset-rename.md отсутствует — зубу не на что ссылаться');
  const text = fs.readFileSync(MEMORY_RENAME, 'utf8');
  const itemsClause = clauseAfter(text, /С 000318\.08 в волнах:/,
    /С 0003\d\d\.\d\d в волнах:/);
  assert.ok(itemsClause.includes(LEDGER_PATH),
    'clause «С 000318.08 в волнах» не упоминает ' + LEDGER_PATH
    + ' — якорь зуба (путь реестра) потерялся из §5');
  assert.doesNotMatch(itemsClause, /НЕ\s+расширять/,
    'память §5 (items-clause) по-прежнему велит «НЕ расширять» ' + LEDGER_PATH
    + ' — ложная директива: волна 000321.08 уже расширила реестр 864→914, а'
    + ' canon-items-sync (c1: nums ≡ {1..N}) физически не переживает предмет'
    + ' без строки реестра. Рецепт: реестр растёт ВМЕСТЕ с каталогом'
    + ' append-only (строки заморожены, длина — нет),'
    + ' см. memory/000379-items-registry-unfetter.md');
  assert.doesNotMatch(itemsClause, /замороженн/i,
    'память §5 (items-clause) называет items-реестр замороженным — ложь'
    + ' диском: длина растёт; заморожены только существующие СТРОКИ'
    + ' (зуб append-only в items-rename T11)');
  assert.match(itemsClause, /append[- ]only/,
    'память §5 (items-clause) не описывает append-only-режим роста реестра —'
    + ' волна без рецепта снова придёт править чужой items-rename');
  assert.match(itemsClause, /растёт вместе с каталогом/,
    'память §5 (items-clause) не содержит формулировки «растёт вместе с'
    + ' каталогом» — тот же рецепт, словами, которые ищут волны');

  const bullet = clauseAfter(text, /^\* items → slug/m, /^\* [a-z]/m);
  assert.ok(bullet.includes(LEDGER_PATH),
    'блок §4.1 «items → slug» не упоминает ' + LEDGER_PATH
    + ' — якорь зуба потерялся');
  assert.doesNotMatch(bullet, /НЕ\s+расширять/,
    'память §4.1 (items-блок) велит «НЕ расширять» items-реестр — та же'
    + ' ложная директива, что и в §5 (см. 000379 T1 выше)');
  assert.doesNotMatch(bullet, /замороженн/i,
    'память §4.1 (items-блок) называет items-реестр замороженным — реестр'
    + ' append-only: длина живая, строки неизменные');

  const skillsClause = clauseAfter(text, /С 000318\.09 в волнах:/, null);
  assert.ok(skillsClause.length > 0 && !itemsClause.includes(skillsClause),
    'страж границы: items-clause обязан быть ОТДЕЛЬНЫМ блоком от skills-clause'
    + ' (иначе проверка «НЕ расширять» для items ловит чужой скоуп 000387)');
});

test('000379 T2: контракт волновых хелперов на вне-реестровые id описан в памяти и выполняется диском — виртуальные номера покрывают каталог, ключи реестра = префикс 000001..N', () => {
  const text = fs.readFileSync(MEMORY_I08, 'utf8');
  const sections = text.split(/(?=^## )/m).filter((s) => s.includes('VIRTNUMI08'));
  assert.equal(sections.length, 1,
    'в memory/000318.08-items-slug-rename.md должен быть РОВНО один раздел,'
    + ' описывающий хелперы волн (VIRTNUMI08); факт: ' + sections.length);
  assert.match(sections[0], /append[- ]only/,
    'раздел «хелперы волн» не описывает append-only-режим реестра (память'
    + ' всё ещё обещает «не дописывать») — контракт для волны, добавляющей'
    + ' предметы, описан в memory/000379-items-registry-unfetter.md');
  assert.doesNotMatch(sections[0], /не дописывать/i,
    'раздел «хелперы волн» по-прежнему велит новые строки реестра «не'
    + ' дописывать» — ложь диском (000321.08 дописала 000865–000914) и'
    + ' ловушка для 000321.09/.10');
  assert.match(sections[0], /КОНЕЦ/,
    'раздел «хелперы волн» не описывает, куда попадает ВНЕ-РЕЕСТРОВЫЙ id в'
    + ' FILES_I08(): сортировка строковая и «0» < «a», поэтому id без'
    + ' строки реестра идёт в КОНЕЦ виртуально-номерного списка — это'
    + ' текущий контракт позиционных пинов канареек');

  const led = readLedger();
  const keys = Object.keys(led);
  const want = [];
  for (let i = 1; i <= keys.length; i++) want.push(String(i).padStart(6, '0'));
  assert.deepEqual([...keys].sort(), want,
    'реестр ' + LEDGER_PATH + ': ключи обязаны быть ПРЕФИКСОМ 000001..'
    + String(keys.length).padStart(6, '0') + ' без дыр — иначе num у'
    + ' canon-items-sync (loadCatalog) перестаёт быть {1..N} и канон c1'
    + ' краснеет невнятным сообщением');
  const valSet = new Set(Object.values(led));
  assert.equal(valSet.size, keys.length,
    'реестр: значения не уникальны — виртуальные имена канареек теряют'
    + ' биективность (дубли: ' + (keys.length - valSet.size) + ')');
  const ids = catalogIds();
  assert.equal(new Set(ids).size, ids.length,
    'каталог assets/items: дубликаты id — состав не читается');
  const missing = ids.filter((id) => !valSet.has(id));
  assert.deepEqual(missing, [],
    'каталог: id БЕЗ строки в ' + LEDGER_PATH + ' (' + missing.slice(0, 8)
    .join(', ') + (missing.length > 8 ? ' … (' + missing.length + ')' : '')
    + ') — рост каталога обязан сопровождаться APPEND строк реестра (шаг 1'
    + ' рецепта memory/000379-items-registry-unfetter.md), иначе num'
    + ' === undefined в canon-items-sync и канон c1 («nums != {1..N}»)'
    + ' краснеет без указания причины');
});

// Игла манифеста 000375 («base_price … ровно у <число>») собирается
// concat-ом сегментов — собственный текст файла ей не совпадает, а
// проверка обязана остаться нулевой: десятый держатель нам не нужен
// (tests/base-price-manifest-000375.test.js — 0-diff, BP1/BP2 зелёные).
const BP_NEEDLE_SRC = 'base_price' + '\\s*\\u2014?\\s*' + 'ровно'
  + '\\s+у\\s+(\\d+)';

test('000379 T3: наши файлы не стали держателями глобального счётчика base_price (манифест 000375 остаётся 0-diff, BP1/BP2 зелёные без правки .375)', () => {
  const needle = () => new RegExp(BP_NEEDLE_SRC, 'gi');
  for (const rel of GUARDED_FILES) {
    const p = path.join(ROOT, rel);
    assert.ok(fs.existsSync(p), 'RED: ожидаемый файл задачи не найден: ' + rel);
    const hits = [...fs.readFileSync(p, 'utf8').matchAll(needle())];
    assert.equal(hits.length, 0,
      rel + ' содержит ' + hits.length + ' совпадений иглы глобального'
      + ' счётчика base_price — файл стал бы держателем из манифеста 000375'
      + ' и покраснил бы его BP1 при любом росте каталога; форма'
      + ' зарезервирована за тем счётчиком (memory/000375-base-price-manifest.md)');
  }
  assert.ok(GUARDED_FILES.length >= 2,
    'страж обязан покрывать ОБА файла задачи (миграция items-rename + новый'
    + ' мета-файл); факт: ' + GUARDED_FILES.length);
});

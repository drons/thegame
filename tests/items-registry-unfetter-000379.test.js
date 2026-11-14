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
// Задача 000388 (ретро-b24 F2/К2 + кросс X-3; time-critical — влиться ДО или
// синхронно с 000387): Т1 усилен — запрет лжи сделан КЛАСС-предикатом
// findLies (любая форма «не расширять» в обоих регистрах, «заморож*», прямые
// отрицания роста) с ЦИТАТНОЙ ГРАНИЦЕЙ по образцу предиката «метка в той же
// строке» из memory/000385-b23-memory-errata.md и truth-table 000378: ложная
// форма легальна как цитата, если в строке есть маркер «эррата / была ложна /
// прежняя директива», либо форма стоит внутри «ёлочек» и в строке есть
// ссылка на задачу (или в блоке есть маркер эрраты). Эндпоинт items-блока —
// ЛЮБОЙ следующий заголовок «С 000…» (или пустая строка перед новым блоком
// «- »/«* », или заголовок раздела), а не точный матч «С 000NN.NN в
// волнах:» — перефраз соседнего skills-clause («С 000318.09 (навыки)…»)
// больше не втягивает чужой текст в items-блок. Страж чужого скоупа идёт ДО
// скана лжи и именует блок-виновник, а не приписывает items. НОВЫЙ Т4 —
// self-check предикатов на синтетике (бессрочная регрессия мутационной
// матрицы tasks/result/000388.md). Тестов в файле: 3 → 4.
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
//
// Эндпоинт (000388, F2(в)/X-3): не точный матч следующего «С 000NN.NN в
// волнах:», а РАННИЙ из стоп-маркеров: любой заголовок строки «С 000…»,
// пустая строка перед новым блоком «- »/«* », заголовок раздела «## ».
// Стартовый якорь остаётся точным — потеря своего заголовка обязана красить
// с сообщением «перенести якорь осознанно».
function blockAfter(text, startRe, stopRes) {
  const m = startRe.exec(text);
  assert.ok(m, 'в памяти не найден блок по якорю ' + startRe
    + ' — блок переименован: перенести якорь осознанно');
  const rest = text.slice(m.index);
  let end = -1;
  for (const stopRe of stopRes) {
    const s = rest.slice(1).search(stopRe);
    if (s >= 0 && (end < 0 || s < end)) end = s;
  }
  return end < 0 ? rest : rest.slice(0, end + 1);
}

const ITEMS_STOPS = [
  /^С 000/m,
  /\n[ \t]*\n(?=[ \t]*[-*] )/,
  /^##\s/m,
];

const BULLET_STOPS = [
  /^\* [a-z]/m,
  /^С 000/m,
  /\n[ \t]*\n/,
  /^##\s/m,
];

// Класс лжи (000388, F2(а)): словоформы «НЕ расширять»/«замороженн*» не
// покрывали ни строчную директиву, ни «заморожен ЦЕЛИКОМ и не растёт
// вовсе». Список форм — класс-предикат: любое живое (не цитатное) вхождение
// ложной директивы красит зуб.
const LIE_FORMS = [
  { re: /не\s+расширять/i, why: 'директива не расширять реестр' },
  { re: /заморож\w*/i, why: 'называющий реестр замороженным' },
  { re: /не\s+раст[её]т/i, why: 'прямое отрицание роста' },
  { re: /раст[её]?т?\s+не\s+будет/i, why: 'прямое отрицание роста' },
  { re: /не\s+расширяется/i, why: 'прямое отрицание роста' },
];

// ЦИТАТНАЯ ГРАНИЦА (000388; образец — предикат «метка в той же строке» из
// memory/000385-b23-memory-errata.md и truth-table 000378): ложная форма
// легальна, если строка сама объявляет её цитатой (эррата / была ложна /
// прежняя директива), либо форма стоит внутри «ёлочек» и рядом ссылка на
// задачу-носитель эрраты, а маркер эрраты живёт где-то в блоке. Кавычки
// без маркеров лжу НЕ легализуют (защита от отмывания директивы кавычками).
const LIE_QUOTE_LINE_RE = /эррата|была ложна|прежняя директива/i;
const LIE_QUOTE_BLOCK_RE = /эррата|была ложна/i;
const LIE_TASK_REF_RE = /0003\d\d(\.\d+)?/;
const GUILLEMET_SPAN_RE = /«[^»«]*»/g;

function isCitedLie(line, block, at) {
  if (LIE_QUOTE_LINE_RE.test(line)) return true;
  const quoted = [...line.matchAll(GUILLEMET_SPAN_RE)]
    .some((m) => at >= m.index && at < m.index + m[0].length);
  if (!quoted) return false;
  return LIE_TASK_REF_RE.test(line) || LIE_QUOTE_BLOCK_RE.test(block);
}

function findLies(block, blockName) {
  const hits = [];
  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim();
    for (const form of LIE_FORMS) {
      const re = new RegExp(form.re.source, 'gi');
      let m;
      while ((m = re.exec(line)) !== null) {
        if (!isCitedLie(line, block, m.index)) {
          hits.push({ block: blockName, why: form.why, found: m[0],
            line: line.slice(0, 160) });
        }
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    }
  }
  return hits;
}

function describeLies(hits) {
  return hits.map((h) => ' — [' + h.block + '] форма «' + h.found + '» ('
    + h.why + ') в строке: «' + h.line + '»').join(';');
}

// Страж границы (000388, X-3): если эндпоинт всё-таки проглотил соседний
// блок (чужой заголовок снят целиком, реформат §5), зуб обязан покрасить
// СООБЩЕНИЕМ ПРО ВИНОВНИКА — имя чужого блока и найденный текст, — а не
// ложноатрибутированной директивой на items. Проверка идёт ДО скана лжи.
const FOREIGN_BLOCK_SIGNATURES = [
  { re: /skills-num2id-000318\.09/,
    who: 'skills-блок (реестр skills-num2id-000318.09.json, §5/§4.1'
      + ' «навыки») — чужой скоуп 000387' },
  { re: /^С 000318\.09[^\n]*/m,
    who: 'skills-clause «С 000318.09…» — чужой скоуп 000387' },
];

function foreignScopeHit(block) {
  for (const sig of FOREIGN_BLOCK_SIGNATURES) {
    const m = sig.re.exec(block);
    if (m) return { who: sig.who, found: m[0].slice(0, 80) };
  }
  return null;
}

function assertNoForeignScope(block, blockName) {
  const intruder = foreignScopeHit(block);
  if (intruder) {
    assert.fail('страж границы зуба: в ' + blockName + ' врезан ' + intruder.who
      + ' — найдено: «' + intruder.found + '». Обвиняется НЕ items-реестр:'
      + ' почините эндпоинт блока в этом зубе (стоп по заголовку «С 000…»/'
      + ' пустой строке/разделу) или верните соседнему блоку его заголовок;'
      + ' чужой текст — скоуп 000387');
  }
}

test('000379 T1: память правдива для items — ни один блок memory/000318-asset-rename.md про items-реестр не велит «НЕ расширять» и не называет его замороженным (класс-предикат лжи с цитатной границей, 000388); §5 содержит append-only-рецепт', () => {
  assert.ok(fs.existsSync(MEMORY_RENAME),
    'RED: memory/000318-asset-rename.md отсутствует — зубу не на что ссылаться');
  const text = fs.readFileSync(MEMORY_RENAME, 'utf8');
  const itemsClause = blockAfter(text, /С 000318\.08 в волнах:/, ITEMS_STOPS);
  assert.ok(itemsClause.includes(LEDGER_PATH),
    'clause «С 000318.08 в волнах» не упоминает ' + LEDGER_PATH
    + ' — якорь зуба (путь реестра) потерялся из §5');

  assertNoForeignScope(itemsClause, 'items-блок «С 000318.08 в волнах» (§5)');

  const itemsLies = findLies(itemsClause, '§5 «С 000318.08 в волнах»');
  assert.equal(itemsLies.length, 0,
    'память §5 (items-clause ' + LEDGER_PATH + ') содержит живые ложные'
    + ' директивы (цитаты с маркером эрраты легальны):' + describeLies(itemsLies)
    + ' — волна 000321.08 уже расширила реестр, а canon-items-sync (c1:'
    + ' nums ≡ {1..N}) физически не переживает предмет без строки реестра.'
    + ' Рецепт: реестр растёт ВМЕСТЕ с каталогом append-only (строки'
    + ' заморожены, длина — нет), см. memory/000379-items-registry-unfetter.md');
  assert.match(itemsClause, /append[- ]only/,
    'память §5 (items-clause) не описывает append-only-режим роста реестра —'
    + ' волна без рецепта снова придёт править чужой items-rename');
  assert.match(itemsClause, /растёт вместе с каталогом/,
    'память §5 (items-clause) не содержит формулировки «растёт вместе с'
    + ' каталогом» — тот же рецепт, словами, которые ищут волны');

  const bullet = blockAfter(text, /^\* items → slug/m, BULLET_STOPS);
  assert.ok(bullet.includes(LEDGER_PATH),
    'блок §4.1 «items → slug» не упоминает ' + LEDGER_PATH
    + ' — якорь зуба потерялся');

  assertNoForeignScope(bullet, 'блок §4.1 «items → slug»');

  const bulletLies = findLies(bullet, '§4.1 «items → slug»');
  assert.equal(bulletLies.length, 0,
    'память §4.1 (items-блок) содержит живые ложные директивы (цитаты с'
    + ' маркером эрраты легальны):' + describeLies(bulletLies)
    + ' — реестр append-only: длина живая, строки неизменные'
    + ' (см. 000379 T1 выше)');
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
    'раздел «хелперов волн» по-прежнему велит новые строки реестра «не'
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

test('000388 T4: self-check зуба правдивости — класс-предикат ловит ложь без цитаты (включая строчную директиву и отрицания роста), ЦИТАТНАЯ ГРАНИЦА легализует эррата-цитаты, ослабленный эндпоинт не боится перефразованного заголовка, а страж границы именует skills-блок-виновник', () => {
  const anchor = LEDGER_PATH;
  const head = 'С 000318.08 в волнах: предметы — реестр ' + anchor
    + ' растёт вместе с каталогом append-only';
  const skillsHeader = 'С 000318.09 в волнах: навыки\n';
  const synth = (body, tail) => head + '\n' + body
    + (tail === undefined ? skillsHeader : tail);

  const blockA = blockAfter(synth('Реестр заморожен ЦЕЛИКОМ и не растёт вовсе\n'
    + 'Реестр не расширять; он растёт не будет и не расширяется\n'),
  /С 000318\.08 в волнах:/, ITEMS_STOPS);
  const hitsA = findLies(blockA, 'синт (а)');
  assert.equal(hitsA.length, 5,
    'ложь без цитаты обязана ловиться всеми формами класса (заморож* / не'
    + ' растёт / не расширять строчную / растёт не будет / не расширяется);'
    + ' найдено ' + hitsA.length + ':' + describeLies(hitsA));
  assert.ok(hitsA.every((h) => h.block === 'синт (а)' && h.line.length > 0),
    'каждый hit обязан именовать блок и строку-виновника (F2(в): сообщение не'
    + ' должно приписывать items чужой текст)');

  const blockB = blockAfter(synth('эррата 000379: прежняя директива'
    + ' «НЕ расширять» была ложна\n'
    + 'директива «НЕ расширять» мертва (000379)\n'
    + 'реестр неприкосновенен лишь строками, длина живая\n'),
  /С 000318\.08 в волнах:/, ITEMS_STOPS);
  assert.equal(findLies(blockB, 'синт (б)').length, 0,
    'честные цитаты (маркер в строке; «ёлочки» + ссылка на задачу;'
    + ' «неприкосновенен» вообще не форма класса) обязаны быть зелёными'
    + ':' + describeLies(findLies(blockB, 'синт (б)')));

  const blockB2 = blockAfter(synth('эррата 000379:\n'
    + 'директива «НЕ расширять» мертва\n'),
  /С 000318\.08 в волнах:/, ITEMS_STOPS);
  assert.equal(findLies(blockB2, 'синт (б2)').length, 0,
    'uppercase-цитата в «ёлочках» легальна и при маркере эрраты НЕ в строке,'
    + ' а в блоке (требование (2) 000388):'
    + describeLies(findLies(blockB2, 'синт (б2)')));

  const paraSynth = synth('правильный рост — дописывать строки\n',
    'С 000318.09 (навыки) в волнах: навыки — реестр '
    + 'tests/scripts/skills-num2id-000318.09.json замороженный,'
    + ' (НЕ расширять)\n');
  const blockC = blockAfter(paraSynth, /С 000318\.08 в волнах:/, ITEMS_STOPS);
  assert.ok(blockC.includes(anchor) && !blockC.includes('skills-num2id'),
    'перефраз заголовка skills-clause не должен втягивать skills-текст в'
    + ' items-блок (F2(в)/X-3)');
  assert.equal(findLies(blockC, 'синт (в)').length, 0,
    'items-блок на перефразированном соседе обязан быть зелёным:'
    + describeLies(findLies(blockC, 'синт (в)')));

  const blockD = blockAfter(synth('правильный рост — дописывать строки\n',
    'реестр навыков tests/scripts/skills-num2id-000318.09.json (НЕ расширять),'
    + ' замороженный\n'),
  /С 000318\.08 в волнах:/, ITEMS_STOPS);
  const intruderD = foreignScopeHit(blockD);
  assert.ok(intruderD,
    'при снятом заголовке skills-блока страж границы обязан сработать'
    + ' РАНЬШЕ скана лжи (в T1 он стоит до findLies) и назвать виновника');
  assert.match(intruderD.who, /skills|навыки/,
    'страж обязан именовать skills-блок, а не items; факт: ' + intruderD.who);
  assert.ok(intruderD.found.length > 0,
    'сообщение стража обязано приводить найденный текст-виновника');

  const blockE = blockAfter(synth('реестр работает в режиме «НЕ расширять»\n'),
  /С 000318\.08 в волнах:/, ITEMS_STOPS);
  assert.equal(findLies(blockE, 'синт (д)').length, 1,
    '«ёлочки» без маркеров эрраты и без ссылки на задачу НЕ легализуют'
    + ' ложь (защита от отмывания директивы кавычками); факт:'
    + describeLies(findLies(blockE, 'синт (д)')));

  const blockF = blockAfter(head + '\nправильный рост — дописывать\n\n'
    + '- следующий блок: замороженный реестр (НЕ расширять)\n',
  /С 000318\.08 в волнах:/, ITEMS_STOPS);
  assert.ok(!blockF.includes('заморож') && !blockF.includes('расширять'),
    'пустая строка перед новым блоком «- » обязана быть эндпоинтом'
    + ' items-блока (требование (3) 000388)');
});

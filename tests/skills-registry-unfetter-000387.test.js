// Задача 000387: развязка тройки «замороженный skills-реестр ≡ живые
// bijection-зубья ≡ рост каталога skills» (ретро-b23 П4 / b22 P8; перенос
// решения 000379 на skills-плечо; память контракта —
// memory/000387-frozen-prefix-contract.md).
//
// Отличие от items (.379): у skills-реестра НЕТ потребителя nums ≡ {1..N}
// (canon-items-sync-класса нет), поэтому рост каталога НЕ обязан трогать
// tests/scripts/skills-num2id-000318.09.json: компаратор
// scripts/sync-skills-data.js (000384) ставит вне-реестровые id «в конец по
// lex» — shipped-фолбэк, прямо названный «механизм роста каталога — 000387».
// Канон: замороженный ПРЕФИКС (строки ключей 000001..44 неизменны —
// append-only против HEAD), длина живая; bijection «реестр ≡ каталогу»
// снята в пользу реестр ⊆ каталог.
//
// Этот файл сторожит ОБРАТНУЮ сторону механики из skills-rename-000318.09:
//   Т1 — память правдива для skills-плеча (§5 skills-clause, §4.1
//        skills-буллет, §1 skills-строка, memory/000318.09-файл): директивы
//        «НЕ расширять» сняты, рецепт роста/фолбэка описан;
//   Т2 — growth-канарейка на tmp-макете: +1 фейковый secondary ВНЕ реестра —
//        sync exit 0, взаимный порядок реестровых id сохранён, фейк в хвосте
//        SECONDARY, две независимые генерации побайтово ≡ (детерминизм
//        канона порядка .384 при росте);
//   Т3 — контракт npc-num2id ДЛЯ 000318.10 зафиксирован в
//        memory/000387-frozen-prefix-contract.md + живые предикаты каталога
//        npc и живые строки sync-npc-data.js (числа файлов НЕ пинуются);
//   «000396 T2» — правда ли проза append-зуба T11 в skills-rename: живая
//        (нецитатная) форма «… НАВСЕГДА» — тот же класс лжи F1, что снят в
//        items-плече задачей 000392, — запрещена, а сообщение обязано
//        называть ОБА стража (HEAD-зуб до коммита, digest-зуб после).
//        Красен на чистой базе (честное TDD-RED: ложь ещё в исходнике).
//
// Красные тесты (TDD) на чистой базе: осмысленные ERR_ASSERTION у Т1 (память
// §5/§4.1/§1 и memory/000318.09 всё ещё велют «НЕ расширять» и пинуют
// bijection), у Т3 (memory/000387-frozen-prefix-contract.md отсутствует);
// Т2 зелёная и на базе (фолбэк shipped в 000384 — это страж регресса, не
// RED-зуб). Загрузка сьюта не падает.
//
// Вне SCOPE: tests/items-* и память 000379 (их финальная форма первична,
// прецедент .379); npc-тесты-держатели счётчика (скоуп 000387.01);
// assets-schemas/skills-nature/efir (скоуп 000387.02); CHANGELOG 0-diff
// (tests/memory-only).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SKILLS_DIR = path.join(ROOT, 'assets', 'skills');
const NPC_DIR = path.join(ROOT, 'assets', 'npc');
const SYNC = path.join(ROOT, 'scripts', 'sync-skills-data.js');
const SYNC_NPC = path.join(ROOT, 'scripts', 'sync-npc-data.js');
const REGISTRY = path.join(ROOT, 'tests', 'scripts',
  'skills-num2id-000318.09.json');
const MEMORY_RENAME = path.join(ROOT, 'memory', '000318-asset-rename.md');
const MEMORY_I09 = path.join(ROOT, 'memory', '000318.09-skills-slug-rename.md');
const MEMORY_387 = path.join(ROOT, 'memory',
  '000387-frozen-prefix-contract.md');

const TEST_I09_SRC = path.join(ROOT, 'tests',
  'skills-rename-000318.09.test.js');

const LEDGER_PATH = 'tests/scripts/skills-num2id' + '-000318.09.json';
const NPC_LEDGER_PATH = 'tests/scripts/npc-num2id' + '-000318.10.json';

const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
const REG_VALUES = Object.values(registry);
const POS = new Map(REG_VALUES.map((id, i) => [id, i]));

// Та же семантика, что у компаратора sync-skills-data.js (000384): позиция
// в реестре, вне реестра — хвост по lex.
function byCanon(ids) {
  return [...ids].sort((a, b) => {
    const pa = POS.has(a) ? POS.get(a) : Infinity;
    const pb = POS.has(b) ? POS.get(b) : Infinity;
    if (pa !== pb) return pa < pb ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

function catalogTypeMap(dir) {
  return new Map(fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f !== 'schema.json')
    .map((f) => {
      const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      return [d.id, d.type];
    }));
}

// Блочное чтение памяти — как в tests/items-registry-unfetter-000379.test.js:
// §5 — параграф с clause'ами «С 000318.0N в волнах:»; skills-clause читается
// от своего якоря до EOF (items-clause заканчивается нашим якорем — он обязан
// остаться байтово-точным, его читает .379).
function clauseAfter(text, startRe, endRe) {
  const m = startRe.exec(text);
  assert.ok(m, 'в памяти не найден блок по якорю ' + startRe
    + ' — блок переименован: перенести якорь осознанно');
  const rest = text.slice(m.index);
  const end = endRe ? rest.slice(1).search(endRe) : -1;
  return end < 0 ? rest : rest.slice(0, end + 1);
}

test('000387 T1: память правдива для skills-плеча — §5 skills-clause, §4.1 skills-буллет, §1 skills-строка и memory/000318.09 не велют «НЕ расширять»; рецепт роста (замороженный префикс, append-only строк, фолбэк хвоста по lex) описан', () => {
  assert.ok(fs.existsSync(MEMORY_RENAME),
    'RED: memory/000318-asset-rename.md отсутствует — зубу не на что ссылаться');
  const text = fs.readFileSync(MEMORY_RENAME, 'utf8');

  const skillsClause = clauseAfter(text, /С 000318\.09 в волнах:/, null);
  assert.ok(!skillsClause.includes('С 000318.08 в волнах:'),
    'страж границы: skills-clause (якорь «С 000318.09 в волнах:» → EOF) '
    + 'поглотил items-clause — порядок clause-ов в §5 сломан, а зуб .379 '
    + 'режет items-блок концом нашего якоря');
  assert.ok(skillsClause.includes(LEDGER_PATH),
    'clause «С 000318.09 в волнах» не упоминает ' + LEDGER_PATH
    + ' — якорь зуба (путь реестра) потерялся из §5');
  assert.doesNotMatch(skillsClause, /НЕ\s+расширять/,
    'память §5 (skills-clause) по-прежнему велит «НЕ расширять» ' + LEDGER_PATH
    + ' — директива мертва: механизм роста — shipped-фолбэк компаратора '
    + '(scripts/sync-skills-data.js, 000384: вне-реестровые id — в хвост по '
    + 'lex), реестр при росте каталога править НЕ нужно. РЕЦЕПТ: '
    + 'замороженный префикс — строки ключей append-only против HEAD; рост '
    + 'каталога без строки реестра легален; append pad(N+1)… — только когда '
    + 'нужна позиция сразу после хвоста реестра; '
    + 'memory/000387-frozen-prefix-contract.md');
  assert.match(skillsClause, /append[- ]only/i,
    'память §5 (skills-clause) не описывает append-only-режим СТРОК реестра '
    + '— волна без рецепта снова придёт править чужой skills-rename '
    + '(memory/000387-frozen-prefix-contract.md)');
  assert.match(skillsClause, /по lex|хвост/,
    'память §5 (skills-clause) не описывает фолбэк роста «в хвост по lex» '
    + '— именно им живёт каталог skills вне реестра '
    + '(memory/000387-frozen-prefix-contract.md)');

  const bullet = clauseAfter(text, /^\* skills → slug/m, /^\* [a-z]/m);
  assert.ok(bullet.includes(LEDGER_PATH),
    'блок §4.1 «skills → slug» не упоминает ' + LEDGER_PATH
    + ' — якорь зуба потерялся');
  assert.doesNotMatch(bullet, /НЕ\s+расширять/,
    'память §4.1 (skills-блок) велит «НЕ расширять» skills-реестр — та же '
    + 'ложная директива, что и в §5 (рецепт — '
    + 'memory/000387-frozen-prefix-contract.md)');

  const row = text.match(/^\| skills \|[^\n]*/m);
  assert.ok(row, 'в §1 таблицы реестра каталогов не найдена skills-строка');
  assert.ok(row[0].includes('замороженный префикс')
    && row[0].includes(LEDGER_PATH),
    'память §1 (skills-строка) не переведена на канон 000387: строка обязана '
    + 'называть реестр замороженным префиксом (строки — append-only, '
    + 'длина живая) и вести путь ' + LEDGER_PATH + ' — по образцу '
    + 'items-строки после .379 (memory/000387-frozen-prefix-contract.md)');

  assert.ok(fs.existsSync(MEMORY_I09),
    'RED: memory/000318.09-skills-slug-rename.md отсутствует');
  const i09 = fs.readFileSync(MEMORY_I09, 'utf8');
  assert.doesNotMatch(i09, /НЕ\s+расширять/,
    'memory/000318.09 по-прежнему велит «НЕ расширять» при росте каталога '
    + '— снято 000387 (фолбэк хвоста shipped; '
    + 'memory/000387-frozen-prefix-contract.md)');
  assert.doesNotMatch(i09, /bijection с диском пинует/,
    'memory/000318.09 всё ещё обещает, что T11 пинует bijection «реестр ≡ '
    + 'каталогу» — с 000387 T11 пинует только реестр ⊆ каталога '
    + '(memory/000387-frozen-prefix-contract.md)');
  assert.ok(i09.includes('skills-num2id-000318.09.json'),
    'memory/000318.09 потеряла путь реестра skills-num2id-000318.09.json');
});

// Growth-канарейка: фейковый slug вне реестра — имя живёт ТОЛЬКО здесь, в
// committed-артефактах (память/зеркала) не оседает.
const CANARY_FAKE_ID = 'zzz_canary_000387';

function buildCanaryTree(dir) {
  fs.mkdirSync(path.join(dir, 'scripts', 'lib'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'assets', 'skills'), { recursive: true });
  fs.copyFileSync(SYNC, path.join(dir, 'scripts', 'sync-skills-data.js'));
  for (const f of fs.readdirSync(path.join(ROOT, 'scripts', 'lib'))) {
    fs.copyFileSync(path.join(ROOT, 'scripts', 'lib', f),
      path.join(dir, 'scripts', 'lib', f));
  }
  fs.mkdirSync(path.join(dir, 'tests', 'scripts'), { recursive: true });
  fs.copyFileSync(REGISTRY, path.join(dir, 'tests', 'scripts',
    'skills-num2id-000318.09.json'));
  for (const f of fs.readdirSync(SKILLS_DIR)) {
    fs.copyFileSync(path.join(SKILLS_DIR, f),
      path.join(dir, 'assets', 'skills', f));
  }
  fs.writeFileSync(path.join(dir, 'assets', 'skills', CANARY_FAKE_ID + '.json'),
    JSON.stringify({
      id: CANARY_FAKE_ID,
      type: 'secondary',
      name: 'Канарейка',
      primary: 'assets/skills/strength.json',
      effect: { stat: 'canary', perLevel: 0.01 },
      effectType: 'Тест',
      desc: 'maket-only',
      names: ['1', '2', '3', '4', '5', '6'],
    }, null, 2) + '\n', 'utf8');
  return spawnSync(process.execPath,
    [path.join(dir, 'scripts', 'sync-skills-data.js')],
    { cwd: dir, encoding: 'utf8' });
}

test('000387 T2: growth-канарейка на tmp-макете (+1 fake skill вне реестра) — sync exit 0; взаимный порядок реестровых id канона .384 сохранён; фейк — в хвосте SECONDARY; две независимые генерации побайтово ≡ (детерминизм). Зелена и на базе: фолбэк shipped в 000384', () => {
  const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-unfetter-a-'));
  const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-unfetter-b-'));
  try {
    const rA = buildCanaryTree(dirA);
    assert.equal(rA.status, 0, 'sync на макете +fake → exit 0: '
      + (rA.stdout || '') + (rA.stderr || ''));
    const rB = buildCanaryTree(dirB);
    assert.equal(rB.status, 0, 'вторая генерация → exit 0: '
      + (rB.stdout || '') + (rB.stderr || ''));
    const genA = fs.readFileSync(path.join(dirA, 'src', 'skills-data.js'),
      'utf8');
    const genB = fs.readFileSync(path.join(dirB, 'src', 'skills-data.js'),
      'utf8');
    assert.equal(genA, genB,
      'детерминизм канона порядка при росте: две независимые генерации '
      + 'разошлись побайтово — компаратор читает порядок ключей реестра '
      + '(000384) + lex-хвост, nothing else');

    const M = require(path.join(dirA, 'src', 'skills-data.js'));
    const types = catalogTypeMap(path.join(dirA, 'assets', 'skills'));
    const wantPrimary = byCanon([...types]
      .filter(([, t]) => t === 'primary').map(([id]) => id));
    const wantSecondary = byCanon([...types]
      .filter(([, t]) => t === 'secondary').map(([id]) => id));
    const wantSchools = byCanon([...types]
      .filter(([, t]) => t === 'school').map(([id]) => id));
    assert.deepEqual(M.PRIMARY_SKILLS.map((s) => s.id), wantPrimary,
      'PRIMARY при росте — канон порядка (реестр + lex-хвост), не алфавит');
    assert.deepEqual(Object.keys(M.SECONDARY_SKILLS), wantSecondary,
      'SECONDARY при росте — канон порядка; вне-реестровые — хвост по lex '
      + '(фолбэк компаратора 000384)');
    assert.deepEqual(M.SCHOOLS.map((s) => s.id), wantSchools,
      'SCHOOLS при росте — канон порядка');
    const secKeys = Object.keys(M.SECONDARY_SKILLS);
    assert.ok(secKeys.includes(CANARY_FAKE_ID),
      'фейк вне реестра обязан попасть в зеркало (иначе рост каталога '
      + 'теряется — регресс фильтра)');
    const extraTail = secKeys.filter((id) => !POS.has(id)).sort();
    assert.deepEqual(secKeys.slice(secKeys.length - extraTail.length),
      extraTail,
      'хвост SECONDARY = ВСЕ вне-реестровые id по lex (ровно как их '
      + 'ставит компаратор 000384; на базе хвост — один канареечный фейк, '
      + 'на уже выросшем каталоге — он вместе с чужими extras)');
    const mirrorSecondary = Object.keys(M.SECONDARY_SKILLS);
    assert.deepEqual(mirrorSecondary.filter((id) => POS.has(id)),
      REG_VALUES.filter((id) => types.get(id) === 'secondary'),
      'взаимный порядок РЕЕСТРОВЫХ id канона .384 сохранён при росте '
      + '(иначе байты сейва/панель [I] поедут — ретро-b23 П1)');
    assert.deepEqual(M.PRIMARY_SKILLS.map((s) => s.id)
      .filter((id) => POS.has(id)),
      REG_VALUES.filter((id) => types.get(id) === 'primary'),
      'PRIMARY: порядок реестровых id в зеркале ≡ порядку ключей реестра');
  } finally {
    fs.rmSync(dirA, { recursive: true, force: true });
    fs.rmSync(dirB, { recursive: true, force: true });
  }
});

test('000387 T3: контракт npc-num2id ДЛЯ 000318.10 зафиксирован в memory/000387-frozen-prefix-contract.md (sha-скоуп «Актуально на»); живой предикат каталога npc (префикс 000001..N, N счётчиком диска) и живые строки sync-npc-data.js', () => {
  assert.ok(fs.existsSync(MEMORY_387),
    'RED: memory/000387-frozen-prefix-contract.md отсутствует — контракт '
    + 'npc-num2id для 000318.10 (замороженный префикс + append-only строк '
    + '+ предикат роста, БЕЗ зубов bijection на весь каталог) нигде не '
    + 'зафиксирован; волны .320.29–.320.100 продолжат ре-пинить счётчик');
  const text = fs.readFileSync(MEMORY_387, 'utf8');
  assert.ok(text.includes('npc-num2id'),
    'память 000387 не описывает контракт формата npc-num2id');
  assert.ok(text.includes('000318.10'),
    'память 000387 не привязана к задаче 000318.10 (флип npc)');
  assert.ok(text.includes(NPC_LEDGER_PATH),
    'память 000387 не называет путь будущего реестра ' + NPC_LEDGER_PATH);
  assert.ok(text.includes('замороженный префикс'),
    'память 000387 не содержит термина канона «замороженный префикс»');
  assert.match(text, /append[- ]only/i,
    'память 000387 не описывает append-only строк реестра');
  assert.match(text, /Актуально на [0-9a-f]{8}/,
    'память 000387: счётчики каталогов обязаны идти с sha-скоупом '
    + '(маркер «Актуально на <sha>») — урок 000385 П2: без скоупа строка '
    + 'рождает ложь при первом же мерже чужой волны');
  assert.doesNotMatch(text, /НЕ\s+расширять|не расширяется|не растёт|целиком заморожен/i,
    'память 000387 содержит запретную формулировку роста-в-отрицании — '
    + 'страж границы зубов .379 (усиление .388) покрасит её как ложную '
    + 'директиву; канон формулируется положительно');

  const syncSrc = fs.readFileSync(SYNC_NPC, 'utf8');
  assert.ok(syncSrc.includes('readdirSync(NPC_DIR)'),
    'sync-npc-data.js: живая строка чтения каталога переехала — память '
    + '000387 цитирует её и обязана быть переснята диском');
  assert.ok(syncSrc.includes('/^\\d{6}\\.json$/.test(f)'),
    'sync-npc-data.js: numeric-фильтр изменён — контракт порядка в памяти '
    + '000387 устарел, переснять');
  assert.ok(syncSrc.includes('.sort()'),
    'sync-npc-data.js: сортировка изменена — переснять контракт в памяти');
  assert.ok(syncSrc.includes('порядок массива = нумерация файлов'),
    'sync-npc-data.js: комментарий-генератор «порядок массива = нумерация '
    + 'файлов» переехал — память 000387 цитирует его живьём');
  assert.ok(text.includes('readdirSync(NPC_DIR)'),
    'память 000387 не цитирует живую строку sync-npc-data.js '
    + '(контракт порядка зеркала npc должен читаться с диска, а не по памяти)');

  assert.equal(fs.existsSync(path.join(ROOT, NPC_LEDGER_PATH)), false,
    'реестр ' + NPC_LEDGER_PATH + ' уже существует — флип 000318.10 '
    + 'случился; контракт 000387 переснимается по финальной форме .10 '
    + '(реестр = замороженный префикс, покрывающий ВСЕ файлы каталога на '
    + 'базе флипа; зубов bijection «реестр ≡ всему каталогу» не заводить)');

  const nums = fs.readdirSync(NPC_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f)).sort().map((f) => f.slice(0, 6));
  const N = nums.length;
  assert.ok(N > 0, 'каталог assets/npc пуст — предикат не читается');
  const want = [];
  for (let i = 1; i <= N; i++) want.push(String(i).padStart(6, '0'));
  assert.deepEqual(nums, want,
    'каталог npc: файлы обязаны идти префиксом 000001..N подряд (N — '
    + 'ЖИВОЙ счётчик диска, не литерал; контракт 000318.10 — '
    + 'memory/000387-frozen-prefix-contract.md)');
  const strays = fs.readdirSync(NPC_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'schema.json'
      && !/^\d{6}\.json$/.test(f));
  assert.deepEqual(strays, [],
    'каталог npc: вне-numeric файлы при number-шейпе (шейп флипнется '
    + 'только в 000318.10): ' + strays.join(', '));
});

// Правдивость прозы append-зуба (задача 000396, класс лжи F1 по образцу
// 000392 на items-плече): сообщение T11 утверждало вечную заморозку строк,
// хотя сам предикат транзиентен (сверка с HEAD). Зуб читает исходник
// skills-rename и требует ОБЕ части правдивой формы, поэтому перефраз,
// оставивший только одну из них, тоже покраснен.
test('000396 T2: проза append-зуба T11 в tests/skills-rename-000318.09.test.js правдива — форма «заморожены НАВСЕГДА» снята, сообщение называет ОБА стража (HEAD-зуб до коммита, digest-зуб 000396 после), предикат T11 не ослаблен', () => {
  assert.ok(fs.existsSync(TEST_I09_SRC),
    'RED: исходник ' + TEST_I09_SRC + ' не найден — зубу не на что смотреть');
  const src = fs.readFileSync(TEST_I09_SRC, 'utf8');
  assert.doesNotMatch(src, /заморожены\s+НАВСЕГДА/,
    'в сообщение append-зуба T11 вернулась ложь класса F1: строки реестра'
    + ' названы замороженными «НАВСЕГДА», тогда как сам предикат сверяется'
    + ' только с HEAD (закоммиченная пере-нумерация становится новой нормой'
    + ' HEAD — ретро-b24 F1). Правдивая форма — как в items-плече (000392):'
    + ' «до коммита сторожит этот HEAD-зуб, после коммита — постоянный'
    + ' digest-зуб 000396» (memory/000379-items-registry-unfetter.md,'
    + ' §Постоянный digest-зуб)');
  assert.match(src, /до коммита сторожит этот HEAD-зуб/,
    'в сообщении append-зуба T11 нет первой правдивой половины («до коммита'
    + ' сторожит этот HEAD-зуб») — проза снова обещает больше, чем мерит'
    + ' предикат; эталон wording: tests/items-rename-000318.08.test.js'
    + ' (T11/000392)');
  assert.match(src, /постоянный digest-зуб 000396/,
    'в сообщении append-зуба T11 нет второй правдивой половины («постоянный'
    + ' digest-зуб 000396») — читатель не узнает, кто сторожит префикс'
    + ' после коммита; носитель зуба — 000396 T1 того же файла');
  assert.ok(src.includes('const rewritten = LEDGER_APPEND_ONLY_I09();'),
    'append-зуб T11 утратил вызов LEDGER_APPEND_ONLY_I09() — предикат'
    + ' ослаблен (правке подлежит только строка сообщения, не он)');
  assert.ok(src.includes('assert.deepEqual(rewritten, [],'),
    'append-зуб T11 утратил предикат assert.deepEqual(rewritten, [], …) —'
    + ' правка сообщения не имеет права менять проверяемое выражение');
});

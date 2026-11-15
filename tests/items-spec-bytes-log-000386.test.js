// Задача 000386: c9-цепь без общего литерала — append-only лог байтовых
// дельт spec/items.md (memory/000230.16-c9/<taskid>.md, файл на волну).
// Контракт и решение станции — memory/000386-c9-bytes-log.md.
//
// P0 схема entry; P1 биекция entry ↔ коммиты «Задача <id>…», трогавшие
// spec/items.md (по SUBJECT — rebase/ff меняют хеши, subject сохраняется);
// P2 историческая правда на своём срезе: bytes ≡ byteLength(git show
// <коммит волны>:spec/items.md), Δ ≡ против предыдущего трогателя В
// ИСТОРИИ КОММИТА; P3 tip ≡ живой байт с диска + «ровно одна ≡ диску»;
// P4 append-only HEAD-guard (исторические entry побайтово равны диску —
// класс items-rename-000318.08 T9: зелёно только на чистом дереве);
// P5 форма §2 без байтового литерала; T7 — читатели без движущихся
// литералов; T8 — синтетика двух параллельных волн: 3-way merge логов
// без конфликта + станционный протокол rebase+re-замер+ff с зелёным
// механизмом; T9 — миграция накопленного литерала без потери дельт
// (пять именованных в ТЗ волн + создание файла).

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SPEC_REL = 'spec/items.md';
const LOG_REL = path.join('memory', '000230.16-c9');

const ENTRY_RE = /^(\d{6}(?:\.\d+)*): (\d+) \(([+-]\d+)\)$/;
const SUBJECT_RE = /^Задача (\d{6}(?:\.\d+)*)/;

function gitOut(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}
function gitBuf(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args],
    { maxBuffer: 64 * 1024 * 1024 });
}
function specBytesAt(cwd, hash) {
  return gitBuf(cwd, ['show', hash + ':' + SPEC_REL]).length;
}
function liveBytes(cwd) {
  return fs.readFileSync(path.join(cwd, SPEC_REL)).length;
}
// Коммиты-трогатели spec/items.md из истории HEAD, oldest → newest.
// --no-merges: мерж в проекте — ff (merge-коммитов в живой истории нет),
// а временный 3-way merge в синтетике T8 — не волна и не запись лога.
function specCommitters(cwd) {
  const rows = gitOut(cwd, ['log', '--no-merges', '--format=%H\x09%s', '--', SPEC_REL])
    .trim().split('\n').filter(Boolean)
    .map((l) => {
      const [hash, subject] = l.split('\t');
      const m = subject.match(SUBJECT_RE);
      return { hash, subject, taskid: m ? m[1] : null };
    });
  return rows.reverse();
}
function prevToucher(cwd, hash) {
  const rows = gitOut(cwd, ['log', '--no-merges', '--format=%H', '-2', hash, '--', SPEC_REL])
    .trim().split('\n').filter(Boolean);
  return rows.length > 1 ? rows[1] : null;
}
function readEntries(cwd) {
  const dir = path.join(cwd, LOG_REL);
  if (!fs.existsSync(dir)) return null;
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort().map((f) => {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    const m = raw.split('\n')[0].match(ENTRY_RE);
    return {
      file: f,
      raw,
      name: f.slice(0, -3),
      parsed: !!m,
      id: m ? m[1] : null,
      bytes: m ? +m[2] : null,
      delta: m ? +m[3] : null,
    };
  });
}
// Механизм целиком (P0–P3) для ЛЮБОГО репозитория с той же структурой —
// общий для живого дерева и синтетического T8.
function checkMechanism(cwd) {
  const entries = readEntries(cwd);
  assert.ok(entries, 'лог-каталог ' + LOG_REL + ' не существует в ' + cwd
    + ' — миграция 000386 (append-only лог байтовых дельт) не выполнена');
  assert.ok(entries.length > 0, 'лог ' + LOG_REL + ' пуст — дельты волн не перенесены');
  const badSchema = entries.filter((e) => !e.parsed || e.id !== e.name);
  assert.deepEqual(badSchema, [], 'entry со сломанной схемой «<taskid>: <байты> (+Δ)» '
    + 'или id ≠ basename: ' + JSON.stringify(badSchema.map((e) => e.file)));
  const comm = specCommitters(cwd);
  const commIds = comm.map((c) => c.taskid);
  assert.ok(commIds.every((x) => x !== null), 'коммит-трогатель spec без taskid в subject: '
    + JSON.stringify(comm.filter((c) => !c.taskid).map((c) => c.subject.slice(0, 50))));
  assert.deepEqual(entries.map((e) => e.id).sort(), [...new Set(commIds)].sort(),
    'P1: множество entry ≠ множеству коммитов, трогавших ' + SPEC_REL
    + ' (лишние entry — фантомные волны; недостающие — миграция/ратчет)');
  const bytesById = {};
  for (const c of comm) bytesById[c.taskid] = specBytesAt(cwd, c.hash);
  for (const e of entries) {
    const prev = prevToucher(cwd, comm.find((c) => c.taskid === e.id).hash);
    const base = prev === null ? 0 : specBytesAt(cwd, prev);
    assert.equal(e.bytes, bytesById[e.id], 'P2: entry ' + e.file + ' байты=' + e.bytes
      + ' ≠ живой замер git show коммита волны (' + bytesById[e.id] + ') — историческая строка лога переписана');
    assert.equal(e.delta, bytesById[e.id] - base, 'P2: entry ' + e.file + ' Δ=' + e.delta
      + ' ≠ bytes − bytes(предыдущий трогатель в истории коммита) ('
      + (bytesById[e.id] - base) + ') — дельта не сходится с git');
  }
  const tip = comm[comm.length - 1];
  const tipEntry = entries.find((e) => e.id === tip.taskid);
  assert.equal(tipEntry.bytes, liveBytes(cwd), 'P3: tip-запись ' + tipEntry.file
    + ' = ' + tipEntry.bytes + ' ≠ живой Buffer.byteLength(' + SPEC_REL + ') = '
    + liveBytes(cwd) + ' — после правки spec (или финальной ре-базы) нужен re-замер entry');
  const eqDisk = entries.filter((e) => e.bytes === liveBytes(cwd));
  assert.equal(eqDisk.length, 1, 'P3: записей, равных живому байту, ровно ' + eqDisk.length
    + ' (нужна одна — tip; совпадение исторической дельты с текущим объёмом — разбирается вручную)');
  return { entries, comm };
}

test('000386 T1: лог memory/000230.16-c9 существует и каждая entry соответствует схеме «<taskid>: <байты после> (+Δ)» (P0; краснота: каталог не создан)', () => {
  const entries = readEntries(ROOT);
  assert.ok(entries, 'лог-каталог memory/000230.16-c9 не существует — миграция 000386 не выполнена (P0)');
  const bad = entries.filter((e) => !e.parsed || e.id !== e.name);
  assert.deepEqual(bad, [], 'сломанная первая строка (schema/id≠basename): '
    + JSON.stringify(bad.map((e) => e.file + ' → ' + e.raw.split('\n')[0])));
  const stray = fs.readdirSync(path.join(ROOT, LOG_REL)).filter((f) => !f.endsWith('.md'));
  assert.deepEqual(stray, [], 'в логе не-.md файлы: ' + JSON.stringify(stray));
});

test('000386 T2: P1 биекция entry ↔ коммиты «Задача <id>…», трогавшие spec/items.md (по subject; краснота: фантомная entry или потерянная волна)', () => {
  const entries = readEntries(ROOT);
  assert.ok(entries, 'лог memory/000230.16-c9 не существует (P1)');
  const comm = specCommitters(ROOT);
  assert.ok(comm.length >= 36, 'история spec/items.md короче миграции (36 трогателей на базе 000386): ' + comm.length);
  const commIds = new Set(comm.map((c) => c.taskid));
  assert.equal(commIds.size, comm.length, 'дубли taskid в коммитах-трогателях: ' + comm.length + ' ≠ ' + commIds.size);
  assert.equal(comm.every((c) => c.taskid), true, 'трогатель spec без taskid в subject: '
    + JSON.stringify(comm.filter((c) => !c.taskid).map((c) => c.subject.slice(0, 50))));
  assert.deepEqual(entries.map((e) => e.id).sort(), [...commIds].sort(),
    'P1: множество entry-файлов ≠ множеству taskid коммитов, трогавших spec/items.md');
});

test('000386 T3: P2 историческая правда — каждая entry ≡ Buffer.byteLength(git show коммита волны:spec/items.md), Δ ≡ против предыдущего трогателя в ИСТОРИИ КОММИТА (краснота: переписанная строка лога)', () => {
  const entries = readEntries(ROOT);
  assert.ok(entries, 'лог memory/000230.16-c9 не существует (P2)');
  assert.ok(entries.length > 0, 'лог пуст');
  checkMechanism(ROOT);
});

test('000386 T4: P3 tip-запись лога ≡ живому байту spec/items.md и «ровно одна запись ≡ диску» (краснота: spec изменён без re-замера entry)', () => {
  const { entries, comm } = checkMechanism(ROOT);
  const tip = comm[comm.length - 1];
  const tipEntry = entries.find((e) => e.id === tip.taskid);
  assert.equal(tipEntry.bytes, liveBytes(ROOT),
    'tip-запись ' + tipEntry.file + ' ≠ Buffer.byteLength(spec/items.md)=' + liveBytes(ROOT));
});

test('000386 T5: P4 append-only — entry-файлы из HEAD побайтово равны диску, исчезновение исторической entry запрещено (HEAD-guard класс; краснота на грязном дереве — норма станции, переписывание истории — цель зуба)', () => {
  const tracked = gitOut(ROOT, ['ls-tree', '-r', '--name-only', 'HEAD', '--', LOG_REL])
    .trim().split('\n').filter(Boolean);
  const comm = specCommitters(ROOT);
  assert.ok(tracked.length >= 36, 'в HEAD лога меньше 36 записей миграции (' + tracked.length
    + ') — исторические entry пропали (P4) либо коммит 000386 ещё не создан (станция: тесты на чистом закоммиченном дереве)');
  for (const t of tracked) {
    const inHead = gitBuf(ROOT, ['show', 'HEAD:' + t]).toString('utf8');
    const onDisk = fs.readFileSync(path.join(ROOT, t), 'utf8');
    assert.equal(onDisk, inHead, 'историческая entry ' + path.basename(t)
      + ' ПЕРЕПИСАНА относительно HEAD — лог append-only (P4)');
  }
  const diskIds = new Set(comm.map((c) => c.taskid));
  for (const t of tracked) {
    const id = path.basename(t, '.md');
    assert.ok(diskIds.has(id), 'entry ' + id + ' есть в HEAD, но коммита-трогателя spec «Задача ' + id + '…» нет — рассинхрон лог↔git (P1↔P4)');
  }
});

test('000386 T6: P5 форма §2 канона — абзац «Текущий spec/items.md:» без байтового литерала: живой расчёт + указатель на лог; мета-числа (строк/H2/H3) берутся с живого spec, поэтому тест не требует ручного ре-пина волнами (краснота: абсолютные байты вернулись в память)', () => {
  const specSrc = fs.readFileSync(path.join(ROOT, SPEC_REL), 'utf8');
  const sl = specSrc.split('\n');
  if (sl[sl.length - 1] === '') sl.pop();
  const h2 = (specSrc.match(/^## /gm) || []).length;
  const h3 = (specSrc.match(/^### /gm) || []).length;
  const canonSrc = fs.readFileSync(path.join(ROOT, 'memory', '000230.16-spec-equipment-doc.md'), 'utf8');
  const a = canonSrc.indexOf('\n## 2.');
  const b = canonSrc.indexOf('\n## 3.');
  assert.ok(a !== -1 && b > a, 'канон: срез «## 2.»…«## 3.» не найден');
  const sec2 = canonSrc.slice(a, b).replace(/\s+/g, ' ');
  const form = new RegExp('Текущий spec/items\\.md: ' + sl.length
    + ' строк.*?, ' + h2 + ' H2, ' + h3 + ' H3 — байтовый канон = живой расчёт');
  assert.ok(form.test(sec2),
    '§2: стабильная форма абзаца c9 не найдена (ожидан якорь «… ' + h2
    + ' H2, ' + h3 + ' H3 — байтовый канон = живой расчёт» без байт-числа)');
  assert.ok(sec2.includes('memory/000230.16-c9/'),
    '§2: абзац c9 не указывает на append-only лог memory/000230.16-c9/');
  const byteLiterals = sec2.match(/\d+ байт/g) || [];
  assert.deepEqual(byteLiterals, [], 'абсолютный байтовый литерал вернулся в §2 (запрещён с 000386): '
    + JSON.stringify(byteLiterals));
});

test('000386 T7: читатели без движущихся литералов — wording/skillbook/food/potion НЕ содержат «NNN файлов (на момент …)» в исполняемых строках (комментарии-история разрешены) и §4.2-срез канона тоже (иначе следующая волна правит чужую строку; краснота: литерал приклеен к дельта-хвосту)', () => {
  const files = [
    'tests/spec-000230.16-wording.test.js',
    'tests/items-skillbook-000321.09.test.js',
    'tests/items-food-000321.08.test.js',
    'tests/items-potion-000321.07.test.js',
  ];
  const executable = (src) => src.split('\n')
    .filter((l) => !l.trim().startsWith('//')).join('\n');
  const hits = [];
  for (const f of files) {
    if (/\d+ файлов \(на момент/.test(executable(fs.readFileSync(path.join(ROOT, f), 'utf8')))) hits.push(f);
  }
  assert.deepEqual(hits, [], 'движущийся литерал счётчика каталога в тесте-читателе (выводить на живой механизм — рецепт memory/000386-c9-bytes-log.md §3): ' + JSON.stringify(hits));
  const canonSrc = fs.readFileSync(path.join(ROOT, 'memory', '000230.16-spec-equipment-doc.md'), 'utf8');
  const a = canonSrc.indexOf('\n### 4.2');
  const b = canonSrc.indexOf('\n### 4.3');
  assert.ok(a !== -1 && b > a, 'канон: срез «### 4.2»…«### 4.3» не найден');
  assert.ok(!/\d+ файлов \(на момент/.test(canonSrc.slice(a, b)),
    'игла §4.2 приклеена к счётчику «NNN файлов (на момент …)» — движущаяся середина вне игл (000386)');
});

test('000386 T8: синтетика механизма — две параллельные волны: 3-way merge entry-каталога БЕЗ конфликта, история волн побайтово цела; станционный протокол rebase+re-замер+ff даёт зелёный механизм на обеих ветках и на merged (P1/P2/P3 в tmp-репозитории)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c9-merge-'));
  const g = (args) => gitOut(tmp, ['-c', 'user.name=c9-test', '-c', 'user.email=c9@test.invalid', '-c', 'commit.gpgsign=false', ...args]);
  try {
    const specPath = path.join(tmp, 'spec', 'items.md');
    const logDir = path.join(tmp, LOG_REL);
    fs.mkdirSync(path.dirname(specPath), { recursive: true });
    fs.mkdirSync(logDir, { recursive: true });
    const writeSpec = (l1, l5) => fs.writeFileSync(specPath,
      l1 + '\nстрока-2\nстрока-3\nстрока-4\n' + l5 + '\nстрока-6\n');
    const writeEntry = (id, bytes, delta) => fs.writeFileSync(
      path.join(logDir, id + '.md'),
      id + ': ' + bytes + ' (' + (delta >= 0 ? '+' : '') + delta + ')\n\n'
        + 'Синтетическая запись механизма 000386.\n');
    writeSpec('строка-1', 'строка-5');
    const b0 = liveBytes(tmp);
    writeEntry('000100', b0, b0);
    g(['init', '-q', '-b', 'master']);
    g(['add', '-A']);
    g(['commit', '-q', '-m', 'Задача 000100: база c9-механизма']);
    const baseHash = g(['rev-parse', 'HEAD']).trim();

    g(['checkout', '-q', '-b', 'wave-a']);
    writeSpec('строка-1 (волна A)', 'строка-5');
    const bA = liveBytes(tmp);
    writeEntry('000101', bA, bA - b0);
    g(['add', '-A']);
    g(['commit', '-q', '-m', 'Задача 000101: волна A — правка строки 1']);
    checkMechanism(tmp);
    g(['checkout', '-q', 'master']);
    g(['merge', '-q', '--ff-only', 'wave-a']);
    checkMechanism(tmp);

    g(['checkout', '-q', '-b', 'wave-b', baseHash]);
    writeSpec('строка-1', 'строка-5 (волна B)');
    const bB = liveBytes(tmp);
    writeEntry('000102', bB, bB - b0);
    g(['add', '-A']);
    g(['commit', '-q', '-m', 'Задача 000102: волна B — правка строки 5']);
    checkMechanism(tmp);
    g(['checkout', '-q', 'master']);

    const entryA101 = fs.readFileSync(path.join(logDir, '000101.md'), 'utf8');
    const entryA100 = fs.readFileSync(path.join(logDir, '000100.md'), 'utf8');
    const m = spawnSync('git', ['-C', tmp, '-c', 'user.name=c9-test',
      '-c', 'user.email=c9@test.invalid', 'merge', '--no-ff', '-m',
      'merge wave-b', 'wave-b'], { encoding: 'utf8' });
    assert.equal(m.status, 0, '3-way merge двух параллельных волн дал конфликт:\n'
      + m.stdout + m.stderr + ' — лог «файл на волну» обязан мерджиться автоматически');
    assert.ok(!/CONFLICT/.test(m.stdout + m.stderr), 'CONFLICT в выводе merge: ' + m.stdout);
    assert.equal(fs.readFileSync(path.join(logDir, '000101.md'), 'utf8'), entryA101,
      'merge двигает чужую entry (append-only нарушен слиянием)');
    assert.equal(fs.readFileSync(path.join(logDir, '000100.md'), 'utf8'), entryA100,
      'merge двигает базовую entry (append-only нарушен слиянием)');
    assert.ok(fs.existsSync(path.join(logDir, '000102.md')), 'entry волны B не долетела через merge');
    const tipAfterRawMerge = specBytesAt(tmp,
      specCommitters(tmp)[specCommitters(tmp).length - 1].hash);
    assert.notEqual(tipAfterRawMerge, liveBytes(tmp),
      'наивный 3-way merge: tip-запись СОВПАЛА с диском без ре-замера — механизм '
      + 'разъехался (ожидание: out-of-order merge требует станционного re-замера)');
    g(['reset', '-q', '--hard', 'HEAD^1']);

    g(['checkout', '-q', 'wave-b']);
    const rb = spawnSync('git', ['-C', tmp, '-c', 'user.name=c9-test',
      '-c', 'user.email=c9@test.invalid', 'rebase', 'master'], { encoding: 'utf8' });
    assert.equal(rb.status, 0, 'rebase чужой волны на нашу (разные строки spec + разные '
      + 'пути entry) должен быть чистым:\n' + rb.stdout + rb.stderr);
    const bB2 = liveBytes(tmp);
    const bMaster = specBytesAt(tmp, g(['rev-parse', 'master']).trim());
    writeEntry('000102', bB2, bB2 - bMaster);
    g(['add', '-A']);
    g(['commit', '-q', '--amend', '--no-edit']);
    g(['checkout', '-q', 'master']);
    g(['merge', '-q', '--ff-only', 'wave-b']);
    checkMechanism(tmp);
    assert.deepEqual(readEntries(tmp).map((e) => e.id), ['000100', '000101', '000102'],
      'после ff-цепочки двух волн лог ≠ ростера коммитов');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('000386 T9: миграция накопленного c9-литерала без потери дельт — именованные в ТЗ волны (000347.02/000374/000321.07/000321.08/000321.09) и создание файла (000159) имеют entry с git-дельтами литерала и непустым prose-телом (краснота: волна потеряна при переносе)', () => {
  const entries = readEntries(ROOT);
  assert.ok(entries, 'лог memory/000230.16-c9 не существует (миграция)');
  const byId = new Map(entries.map((e) => [e.id, e]));
  const expected = [
    ['000159', 9128], ['000347.02', 14], ['000374', 44],
    ['000321.07', 178], ['000321.08', 174], ['000321.09', 148],
  ];
  for (const [id, delta] of expected) {
    const e = byId.get(id);
    assert.ok(e, 'миграция потеряла entry волны ' + id + ' из c9-литерала §2');
    assert.ok(e.parsed && e.parsed !== false, 'entry ' + id + ' не парсится');
    assert.equal(e.delta, delta, 'дельта entry ' + id + ' ≠ историческому числу c9-литерала §2 (' + delta + ')');
    const body = e.raw.split('\n').slice(2).join('').trim();
    assert.ok(body.length > 0, 'entry ' + id + ' без prose-тела — проза дельты из §2 потеряна');
  }
});

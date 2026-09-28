// Общий запуск синк-скриптов + дрейф-гейт (задача 000054).
//
// «Сборка» assets/*/*.json в JS-бандлы — это НЕ бандлер, а запуск
// устоявших sync-скриптов по конвенции scripts/sync-*.js
// (JSON — source of truth, src/*-data.js — фолбэк под file://).
// scripts/sync-all.js:
//  * находит ВСЕ sync-скрипты по конвенции имён (новые каталоги —
//    buildings 000055, items/visuals 000059 — подключатся без правок);
//  * gen-*.js (generate-map-png.js, gen-combat-bg.js) НЕ синк-скрипты;
//  * runAll(root, {check}) — прогоняет скрипты по очереди (node,
//    CommonJS, без зависимостей); возвращает { code, output, changed }:
//    - code: 0 | 1;
//    - output: строка (stdout/stderr скриптов + отчёт sync-all);
//    - changed: пути из `git status --porcelain -- src/` (repo-relative);
//  * обычный режим: регенерация + отчёт «изменилось N / синхронно», exit 0
//    (git недоступен → предупреждение: в --check дрейф-чек пропущен и
//    «синхронно» не утверждается — не проверено, в обычном режиме
//    «синхронно (ничего не изменилось)» не утверждается — список
//    изменений собрать нельзя; exit 0 в обоих случаях — локальный
//    режим, в CI git всегда доступен);
//  * синк-скрипты пишут JS-зеркала атомарно (scripts/lib/write-atomic.js:
//    tmp-файл + rename) — параллельные файлы node --test (top-level
//    require('../src/npc-data.js') и т.п.) не видят частичный файл.
//  * --check: дрейф-гейт. Непустой git-статус src/ ДО регенерации (локальные
//    правки — не переписывать их молча) или ПОСЛЕ (закоммиченный дрейф —
//    сценарий CI) → exit 1 с именем файла и подсказкой «npm run sync:all
//    локально и закоммитьте».
//
// Дрейф-чек ограничен src/: конвенция «выход — src/<имя>-data.js»
// зафиксирована в SPEC.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SYNC_ALL = path.join(ROOT, 'scripts', 'sync-all.js');
const { writeFileAtomic } = require(path.join(
  ROOT, 'scripts', 'lib', 'write-atomic.js'));

function loadSyncAll() {
  assert.ok(fs.existsSync(SYNC_ALL),
    'scripts/sync-all.js не существует (задача 000054: красные тесты)');
  return require(SYNC_ALL);
}

// --- git-хелпер для tmp-«репозиториев» (явная идентичность: глобальная
// может отсутствовать) ---
function git(dir, args) {
  const r = spawnSync('git',
    ['-C', dir,
     '-c', 'user.name=sync-all-test',
     '-c', 'user.email=sync-all-test@example.com',
     ...args],
    { encoding: 'utf8' });
  if (r.error) throw new Error('git ' + args.join(' ') + ': ' + r.error.message);
  if (r.status !== 0) {
    throw new Error('git ' + args.join(' ') + ' → ' + r.status + ': ' +
      (r.stderr || r.stdout));
  }
  return r.stdout;
}

const statusSrc = (dir) =>
  git(dir, ['status', '--porcelain', '--', 'src/']).trim();

// --- Тестовый «репозиторий»: один синк-скрипт по конвенции + генератор ---
// Фейковый sync-скрипт детерминирован (byte-идентичная регенерация) —
// как реальные sync-npc-data.js / sync-skills-data.js.
const FUTURE_BODY =
  '// Каталог future (тестовый): сгенерирован sync-future-data.js.\n' +
  'module.exports = { FUTURE: [1, 2, 3] };\n';

const FAKE_SYNC = `'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const BODY = ${JSON.stringify(FUTURE_BODY)};
fs.mkdirSync(path.join(ROOT, 'src'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'src', 'future-data.js'), BODY, 'utf8');
console.log('src/future-data.js перегенерирован (тест).');
`;

function makeTmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-all-'));
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.mkdirSync(path.join(dir, 'assets', 'future'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets', 'future', '000001.json'),
    '{"id": "future"}\n');
  fs.writeFileSync(path.join(dir, 'scripts', 'sync-future-data.js'), FAKE_SYNC);
  // Генератор (конвенция gen-*.js) — НЕ синк-скрипт, runAll его не трогает.
  fs.writeFileSync(path.join(dir, 'scripts', 'gen-future.js'),
    '// генератор, не sync-скрипт\n');
  // Базовое состояние: синк уже прогнан, сгенерированный файл закоммичен.
  const base = spawnSync(process.execPath,
    [path.join(dir, 'scripts', 'sync-future-data.js')], { encoding: 'utf8' });
  assert.equal(base.status, 0,
    'фейковый sync-скрипт обязан выполниться: ' +
    (base.stdout || '') + (base.stderr || ''));
  git(dir, ['init', '-q']);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-qm', 'base']);
  return dir;
}

const rmTmp = (dir) => fs.rmSync(dir, { recursive: true, force: true });

// --- listSyncScripts ---

test('sync-all.js: существует, отдаёт listSyncScripts и runAll', () => {
  const syncAll = loadSyncAll();
  assert.equal(typeof syncAll.listSyncScripts, 'function');
  assert.equal(typeof syncAll.runAll, 'function');
});

test('listSyncScripts: реальный каталог — все sync-*.js, gen-* и сам себя не включает', () => {
  const syncAll = loadSyncAll();
  const found = syncAll.listSyncScripts(ROOT);
  const expected = fs.readdirSync(path.join(ROOT, 'scripts'))
    .filter((f) => /^sync-.+\.js$/.test(f) && f !== 'sync-all.js')
    .sort();
  assert.deepEqual(found, expected);
  assert.ok(expected.includes('sync-npc-data.js'),
    'sync-npc-data.js обязан найтись');
  assert.ok(expected.includes('sync-skills-data.js'),
    'sync-skills-data.js обязан найтись');
  assert.ok(!found.some((f) => f.startsWith('gen')),
    'генераторы gen-*.js — не синк-скрипты');
  assert.ok(!found.includes('sync-all.js'),
    'sync-all.js не должен запускать сам себя (рекурсия)');
});

test('listSyncScripts: будущее совместимо — новый sync-скрипт подхватится (000055/000059)', () => {
  const syncAll = loadSyncAll();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-all-'));
  try {
    fs.mkdirSync(path.join(dir, 'scripts'));
    fs.writeFileSync(path.join(dir, 'scripts', 'sync-future-data.js'),
      '// будущий синк-скрипт (000055/000059)\n');
    fs.writeFileSync(path.join(dir, 'scripts', 'gen-x.js'), '// генератор\n');
    fs.writeFileSync(path.join(dir, 'scripts', 'other.js'), '// другое\n');
    assert.deepEqual(syncAll.listSyncScripts(dir), ['sync-future-data.js'],
      'только sync-*.js, по имени; новые каталоги подключаются без правок');
  } finally {
    rmTmp(dir);
  }
});

// --- runAll: идемпотентность и дрейф-гейт в tmp-репозитории ---

test('runAll: синхронное дерево — exit 0, ничего не изменилось (идемпотентность)', () => {
  const syncAll = loadSyncAll();
  const dir = makeTmpRepo();
  try {
    const r1 = syncAll.runAll(dir);
    assert.equal(r1.code, 0, 'синхронное дерево: обычный режим → 0: ' +
      r1.output);
    assert.deepEqual(r1.changed, [], 'ничего не изменилось');
    assert.equal(statusSrc(dir), '', 'дерево src/ осталось чистым');
    const r2 = syncAll.runAll(dir, { check: true });
    assert.equal(r2.code, 0,
      'синхронное дерево: --check обязан пройти: ' + r2.output);
    assert.deepEqual(r2.changed, []);
    // Повторный прогон byte-идентичен: дерево чистое.
    assert.equal(statusSrc(dir), '');
  } finally {
    rmTmp(dir);
  }
});

test('runAll(check): закоммиченный дрейф (сценарий CI) — exit 1, в выводе имя файла', () => {
  // CI: fresh checkout, где src/future-data.js правили вручную и
  // закоммитили (или правили JSON без регенерации). После регенерации
  // git-статус src/ непуст → гейт красный.
  const syncAll = loadSyncAll();
  const dir = makeTmpRepo();
  try {
    const f = path.join(dir, 'src', 'future-data.js');
    fs.appendFileSync(f, '// ручная правка — дрейф\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-qm', 'drift']);
    const r = syncAll.runAll(dir, { check: true });
    assert.notEqual(r.code, 0,
      'drift обязано быть поймано --check: ' + r.output);
    assert.match(String(r.output), /future-data\.js/,
      'в выводе --check должно быть имя дрейфующего файла');
  } finally {
    rmTmp(dir);
  }
});

test('runAll: дрейф восстановлен обычным режимом — exit 0, changed = файлы к коммиту', () => {
  const syncAll = loadSyncAll();
  const dir = makeTmpRepo();
  try {
    const f = path.join(dir, 'src', 'future-data.js');
    fs.appendFileSync(f, '// ручная правка — дрейф\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-qm', 'drift']);
    const r = syncAll.runAll(dir);
    assert.equal(r.code, 0, 'обычный режим не падает на дрейфе: ' +
      r.output);
    assert.deepEqual(r.changed, ['src/future-data.js'],
      'отчёт: какой файл регенерация изменила (его надо закоммитить)');
    assert.equal(fs.readFileSync(f, 'utf8'), FUTURE_BODY,
      'регенерация вернула состояние JSON (byte-идентично)');
  } finally {
    rmTmp(dir);
  }
});

// --- Реальное дерево + CLI ---

test('package.json: npm-скрипты sync:all и sync:check (CI использует sync:check)', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const s = pkg.scripts;
  assert.ok(s['sync:all'], 'нет npm-скрипта sync:all');
  assert.ok(s['sync:check'], 'нет npm-скрипта sync:check');
  assert.match(s['sync:all'], /sync-all\.js/);
  assert.match(s['sync:check'], /sync-all\.js/);
  assert.match(s['sync:check'], /--check/);
});

test('CLI: дрейф src/npc-data.js — --check exit 1 с именем файла, обычный режим восстанавливает зеркало', () => {
  // Интеграция на настоящем дереве: ручная (незачем править JSON)
  // правка JS-зеркала → гейт красный; npm run sync:all → регенерация
  // из JSON, дрейф ушёл.
  // ВАЖНО (правки по итогам ревью): тест НЕ требует чистого дерева
  // src/ — при локальной разработке в src/ могут быть незакоммиченные
  // правки ИНЫХ файлов (например, src/main.js в работе); требовать
  // пустой git-статус всего src/ — ложный красный. Тест сравнивает
  // множество изменённых файлов до и после себя: регенерация
  // byte-идентична, а чужие локальные правки он не трогает.
  const syncAll = loadSyncAll();
  const npcFile = path.join(ROOT, 'src', 'npc-data.js');
  const statusBefore = syncAll.gitStatusSrc(ROOT);
  assert.ok(Array.isArray(statusBefore),
    'тест требует доступный git (настоящее дерево), git-статус: ' +
    String(statusBefore));
  const orig = fs.readFileSync(npcFile, 'utf8');
  const marker = '\n// drift marker (тест 000054)\n';
  const drifted = orig + marker;
  try {
    // Атомарные записи (tmp + rename): параллельные файлы node --test
    // (top-level require('../src/npc-data.js') в npc-data.test.js) не
    // должны видеть частичный файл в окне записи (правки по ревью).
    writeFileAtomic(npcFile, drifted);

    const check = spawnSync(process.execPath, [SYNC_ALL, '--check'],
      { encoding: 'utf8' });
    assert.equal(check.status, 1,
      'sync-all.js --check обязан упасть при дрейфе (status=' +
      check.status + '): ' + (check.stdout || '') + (check.stderr || ''));
    assert.match((check.stdout || '') + (check.stderr || ''),
      /src\/npc-data\.js/,
      'в выводе --check должно быть имя дрейфующего файла');
    // Check не переписывает незакоммиченные правки молча (не разрушает
    // чужую работу): файл после check остался с marker.
    assert.equal(fs.readFileSync(npcFile, 'utf8'), drifted,
      '--check не обязан регенерировать поверх локальных правок');

    const norm = spawnSync(process.execPath, [SYNC_ALL], { encoding: 'utf8' });
    assert.equal(norm.status, 0,
      'обычный режим: регенерация, exit 0: ' +
      (norm.stdout || '') + (norm.stderr || ''));
    const leftovers = fs.readdirSync(path.join(ROOT, 'src'))
      .filter((f) => f.endsWith('.tmp'));
    assert.deepEqual(leftovers, [],
      'в src/ не должно остаться tmp-файлов синк-скриптов: ' + leftovers);
  } finally {
    // Тест не оставляет дрейф: зеркало возвращено в то состояние, в
    // каком его застал тест (последующие стадии workflow).
    writeFileAtomic(npcFile, orig);
  }
  const statusAfter = syncAll.gitStatusSrc(ROOT);
  assert.ok(Array.isArray(statusAfter),
    'git обязан остаться доступным, git-статус: ' + String(statusAfter));
  assert.deepEqual(statusAfter, statusBefore,
    'тест не обязан менять множество изменённых файлов src/: ' +
    'регенерация byte-идентична (дрейф зеркала ушёл), а чужие ' +
    'локальные правки (например, src/main.js в работе) — не ' +
    'повод для красного. До: ' + JSON.stringify(statusBefore) +
    ', после: ' + JSON.stringify(statusAfter));
});

// --- Атомарная запись (правки по итогам ревью) ---

test('writeFileAtomic: запись и перезапись точны, tmp-остатков нет', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'write-atomic-'));
  try {
    const f = path.join(dir, 'data.js');
    writeFileAtomic(f, 'v1\n');
    assert.equal(fs.readFileSync(f, 'utf8'), 'v1\n',
      'первая запись: содержимое точное');
    const v2 = 'v2-строка подлиннее для правдоподобности\n';
    writeFileAtomic(f, v2.repeat(100));
    assert.equal(fs.readFileSync(f, 'utf8'), v2.repeat(100),
      'перезапись существующего файла: содержимое точное');
    assert.deepEqual(fs.readdirSync(dir), ['data.js'],
      'после записей не должно остаться tmp-файлов');
  } finally {
    rmTmp(dir);
  }
});

// --- git недоступен (локальный edge-кейс) ---

test('runAll: git недоступен — обычный режим: exit 0, предупреждение, без ложного «синхронно»', () => {
  // Каталог вне git-репозитория: gitStatusSrc → null — тот же путь
  // кода, что и «git недоступен» (spawnSync git → status 128).
  // Реграц на вводящий в заблуждение отчёт «синхронно (ничего не
  // изменилось)» при отсутствии git (правки по итогам ревью).
  const syncAll = loadSyncAll();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-all-nogit-'));
  try {
    assert.equal(syncAll.gitStatusSrc(dir), null,
      'прединд: каталог обязан быть вне git-репозитория');
    fs.mkdirSync(path.join(dir, 'scripts'));
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'assets', 'future'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'assets', 'future', '000001.json'),
      '{"id": "future"}\n');
    fs.writeFileSync(path.join(dir, 'scripts', 'sync-future-data.js'),
      FAKE_SYNC);
    const r = syncAll.runAll(dir);
    assert.equal(r.code, 0,
      'git недоступен — обычный режим обязан завершиться 0: ' + r.output);
    assert.deepEqual(r.changed, [], 'без git список изменений пуст');
    assert.ok(fs.existsSync(path.join(dir, 'src', 'future-data.js')),
      'регенерация при этом выполнена (скрипты отработали)');
    assert.match(String(r.output), /git недоступен/,
      'обязано быть предупреждением о недоступности git: ' + r.output);
    assert.doesNotMatch(String(r.output),
      /синхронно \(ничего не изменилось\)/,
      'без git нельзя утверждать «ничего не изменилось» — отчёт ' +
      'вводит в заблуждение: ' + r.output);
  } finally {
    rmTmp(dir);
  }
});

test('runAll(check): git недоступен — exit 0, «синхронно» не утверждается', () => {
  // Каталог вне git-репозитория: gitStatusSrc → null — тот же путь
  // кода, что и «git недоступен». Регресс (правки по итогам ревью):
  // в --check без собранного git-статуса после регенерации вывод
  // оканчивался «синхронно (JSON-каталоги и JS-зеркала совпадают)» —
  // утверждение, не подтверждённое никакой проверкой и противоречащее
  // предшествующему предупреждению «дрейф-чек пропущен».
  const syncAll = loadSyncAll();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-all-nogit-'));
  try {
    assert.equal(syncAll.gitStatusSrc(dir), null,
      'прединд: каталог обязан быть вне git-репозитория');
    fs.mkdirSync(path.join(dir, 'scripts'));
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'assets', 'future'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'assets', 'future', '000001.json'),
      '{"id": "future"}\n');
    fs.writeFileSync(path.join(dir, 'scripts', 'sync-future-data.js'),
      FAKE_SYNC);
    const r = syncAll.runAll(dir, { check: true });
    assert.equal(r.code, 0,
      'git недоступен — --check обязан завершиться 0 (локальный ' +
      'режим): ' + r.output);
    assert.deepEqual(r.changed, [], 'без git список изменений пуст');
    assert.ok(fs.existsSync(path.join(dir, 'src', 'future-data.js')),
      'регенерация при этом выполнена (скрипты отработали)');
    assert.match(String(r.output), /git недоступен/,
      'обязано быть предупреждением о недоступности git: ' + r.output);
    assert.doesNotMatch(String(r.output),
      /синхронно \(JSON-каталоги и JS-зеркала совпадают\)/,
      'без git «синхронно» утверждать нельзя — дрейф не проверен: ' +
      r.output);
  } finally {
    rmTmp(dir);
  }
});

test('runAll(check): git «умер» после регенерации — exit 0, без ложного «синхронно»', () => {
  // Точный сценарий из ревью: git доступен ДО регенерации (pre-статус
  // собран), но недоступен ПОСЛЕ — changed=[] без проверки. Та же
  // ветка отчёта, что и при недоступности с самого начала, но без
  // предшествующего предупреждения — регресс требует отдельного теста.
  // gitStatus-хук заменяет только вызовы внутри runAll (реальный git
  // в tmp-репозитории при этом не трогаем).
  const syncAll = loadSyncAll();
  const dir = makeTmpRepo();
  try {
    let calls = 0;
    const flaky = () => { calls += 1; return calls === 1 ? [] : null; };
    const r = syncAll.runAll(dir, { check: true, gitStatus: flaky });
    assert.equal(r.code, 0,
      'локальный режим: --check обязан завершиться 0: ' + r.output);
    assert.deepEqual(r.changed, [], 'статус не собран — список пуст');
    assert.equal(calls, 2,
      'git-статус обязан собираться и до, и после регенерации');
    assert.match(String(r.output), /git недоступен/,
      'обязано быть предупреждением о недоступности git: ' + r.output);
    assert.doesNotMatch(String(r.output),
      /синхронно \(JSON-каталоги и JS-зеркала совпадают\)/,
      'без git-статуса после регенерации «синхронно» утверждать ' +
      'нельзя — дрейф не проверен: ' + r.output);
  } finally {
    rmTmp(dir);
  }
});

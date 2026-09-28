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
//    (git недоступен → предупреждение, дрейф-чек пропущен);
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
  fs.mkdirSync(path.join(dir, 'assets', 'future'));
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

test('CLI: дрейф src/npc-data.js — --check exit 1 с именем файла, обычный режим чистит дерево', () => {
  // Интеграция на настоящем дереве: ручная (незачем править JSON)
  // правка JS-зеркала → гейт красный; npm run sync:all → регенерация
  // из JSON, дерево src/ снова чистое.
  const npcFile = path.join(ROOT, 'src', 'npc-data.js');
  const orig = fs.readFileSync(npcFile, 'utf8');
  const marker = '\n// drift marker (тест 000054)\n';
  const drifted = orig + marker;
  try {
    fs.writeFileSync(npcFile, drifted, 'utf8');

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
    const st = spawnSync('git',
      ['-C', ROOT, 'status', '--porcelain', '--', 'src/'],
      { encoding: 'utf8' }).stdout.trim();
    assert.equal(st, '',
      'после sync:all дерево src/ чистое (регенерация byte-идентична), ' +
      'реально: ' + st);
  } finally {
    // Тест не оставляет dirty-дерево (последующие стадии workflow).
    fs.writeFileSync(npcFile, orig, 'utf8');
  }
});

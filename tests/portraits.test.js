// Каталог портретов партии (задача 000142, родитель 000139).
//
// Иконки-портреты для выбора активного персонажа (потребитель — 000145):
//  * assets/portraits/ — source of truth: 8 JSON + 8 SVG (Флогистон,
//    Эфир, 6 наёмных = assets/npc/000012..000017.json, паттерн 000053);
//  * scripts/sync-portraits.js → src/portraits-data.js (UMD-зеркало
//    Game.PortraitsData; конвенция 000054: идемпотентная byte-
//    идентичная генерация + writeFileAtomic);
//  * тег src/portraits-data.js в index.html — «после данных, до ui.js»
//    (пин P7 — tests/index-order.test.js).
//
// Красное ДО (сверено с кодом 45bbada): каталог assets/portraits/
// отсутствует; «портрет»/«portrait» в assets/npc и src/ — 0 вхождений;
// src/portraits-data.js, scripts/sync-portraits.js и тег — не созданы.
//
// Все чтения — ЛЕНИВЫЕ в телах test() (fs.existsSync/readFileSync),
// чтобы каждый красный был осмысленным (ENOENT/«нет поля»), а не крахом
// всего файла (паттерн ленивого чтения motion.js в
// tests/index-order.test.js; прецедент 000091).
//
// Well-formedness и полную схему SVG НЕ повторяем — территория
// tests/svg.test.js (000120); здесь только лёгкий regex-чекер
// (паттерн checkCharacterFrameErrors, tests/sprites.test.js).
//
// Контракты D1–D16 — memory/000142-portraits-catalog.md;
// данные и силуэты — memory/000142-portraits.md.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const PDIR = path.join(ROOT, 'assets', 'portraits');
const NPC_DIR = path.join(ROOT, 'assets', 'npc');
const MIRROR = path.join(ROOT, 'src', 'portraits-data.js');
const SYNC = path.join(ROOT, 'scripts', 'sync-portraits.js');

// scripts/sync-all.js — существующий модуль (задача 000054):
// listSyncScripts — конвенция sync-*.js, gitStatusSrc — дрейф-статус src/.
const { listSyncScripts, gitStatusSrc } = require(
  path.join(ROOT, 'scripts', 'sync-all.js'));

// Канонический порядок каталога (зеркало генерируется в НЁМ, не по
// readdir): герой, дух, 6 наёмных — номера NPC-каталога 000012..17.
const CANON_FILES = [
  'flogiston.json', 'efir.json',
  'npc-000012.json', 'npc-000013.json', 'npc-000014.json',
  'npc-000015.json', 'npc-000016.json', 'npc-000017.json',
];
const CANON_SVG = new Set(
  CANON_FILES.map((f) => f.replace(/\.json$/, '.svg')));
const KIND_BY_FILE = { 'flogiston.json': 'hero', 'efir.json': 'efir' };
const KINDS = new Set(['hero', 'efir', 'merc']);

// Каталог обязан существовать — осмысленный красный, а не ENOENT в
// глубоком чекере (ленивое чтение в теле теста).
function assertCatalogExists() {
  assert.ok(fs.existsSync(PDIR),
    'assets/portraits/ отсутствует — каталог портретов партии не создан ' +
    '(задача 000142)');
}

// JSON-запись каталога; ошибки — с именем файла в сообщении.
function readEntry(f) {
  let text;
  try {
    text = fs.readFileSync(path.join(PDIR, f), 'utf8');
  } catch (e) {
    throw new Error(f + ': ' + e.message);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(f + ': не JSON: ' + e.message);
  }
}

// Лёгкий regex-чекер иконки (фикс 128×128 — D13). Полная схема 000120 —
// tests/svg.test.js; здесь — то, что закрывает «иконка не та»: размер,
// заголовок, NaN (урок 000062), <title> с именем персонажа.
function checkPortraitSvgErrors(text, name) {
  const errors = [];
  const t = text.toLowerCase();
  if (!/^<svg[^>]*\bxmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(t)) {
    errors.push('нет корневого <svg> с xmlns');
  }
  if (!t.includes('viewbox="0 0 128 128"')) {
    errors.push('нет viewBox="0 0 128 128"');
  }
  const w = (t.match(/\bwidth="([^"]*)"/) || [])[1];
  const h = (t.match(/\bheight="([^"]*)"/) || [])[1];
  if (w !== '128' || h !== '128') {
    errors.push('width/height обязаны быть 128 (фикс 128×128)');
  }
  if (/\bNaN\b|\bInfinity\b/.test(text)) {
    errors.push('подстроки NaN/Infinity (урок 000062)');
  }
  const tm = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!tm || tm[1].trim() === '') {
    errors.push('нет <title>');
  } else if (!tm[1].includes(name)) {
    errors.push('<title> не содержит имя «' + name + '»');
  }
  return errors;
}

// P1 — состав каталога и схема записи.
test('портреты: каталог assets/portraits — 8 персон (flogiston.json, efir.json, npc-000012.json … npc-000017.json), у каждой id/имя/icon/title/kind (задача 000142)', () => {
  assertCatalogExists();
  const files = fs.readdirSync(PDIR).sort();
  const canonJson = new Set(CANON_FILES);
  for (const f of files) {
    assert.ok(canonJson.has(f) || CANON_SVG.has(f),
      'чужой файл в каталоге портретов: ' + f);
  }
  for (const f of CANON_FILES) {
    assert.ok(files.includes(f), 'нет файла каталога: ' + f);
  }
  assert.equal(files.length, 16,
    'в каталоге ровно 8 JSON + 8 SVG, а файлов: ' + files.length);

  const seenIds = new Set();
  for (const f of CANON_FILES) {
    const p = readEntry(f);
    assert.ok(p && typeof p === 'object' && !Array.isArray(p),
      f + ': запись — объект');
    for (const k of ['id', 'имя', 'icon', 'title', 'kind']) {
      assert.equal(typeof p[k], 'string',
        f + ': поле «' + k + '» — строка');
      assert.ok(p[k].trim() !== '', f + ': поле «' + k + '» не пустое');
    }
    assert.match(p.id, /^[a-z][a-z0-9_]*$/, f + ': id «' + p.id + '»');
    assert.ok(!seenIds.has(p.id), 'дубликат id «' + p.id + '» в ' + f);
    seenIds.add(p.id);
    assert.match(p.icon, /^[a-z0-9-]+\.svg$/,
      f + ': icon «' + p.icon + '» — имя SVG-файла каталога');
    assert.ok(KINDS.has(p.kind),
      f + ': kind «' + p.kind + '» из hero/efir/merc');
    // kind закреплён файлом (D3.1): фолбэк на 000145 — kind листа 000139.
    const expectKind = f.startsWith('npc-') ? 'merc' : KIND_BY_FILE[f];
    assert.equal(p.kind, expectKind,
      f + ': kind «' + p.kind + '» обязан совпадать с файлом (' +
      expectKind + ')');
  }
});

// P2 — иконки существуют на диске.
test('портреты: у всех 8 иконки существуют (assets/portraits/<icon>) (задача 000142)', () => {
  assertCatalogExists();
  let n = 0;
  for (const f of CANON_FILES) {
    const p = readEntry(f);
    const svg = path.join(PDIR, p.icon);
    assert.ok(fs.existsSync(svg),
      f + ': иконка assets/portraits/' + p.icon + ' отсутствует');
    n += 1;
  }
  assert.equal(n, 8, 'проверено ровно 8 иконок');
});

// P3 — svg-схема иконок (лёгкий чекер; 000120 — территория svg.test.js).
test('портреты: иконки — svg-схема (корень <svg> с xmlns, viewBox "0 0 128 128", width/height 128, <title> с именем, без NaN/Infinity) (задача 000142)', () => {
  assertCatalogExists();
  for (const f of CANON_FILES) {
    const p = readEntry(f);
    const svgPath = path.join(PDIR, p.icon);
    assert.ok(fs.existsSync(svgPath),
      f + ': svg assets/portraits/' + p.icon + ' отсутствует');
    const text = fs.readFileSync(svgPath, 'utf8');
    const errors = checkPortraitSvgErrors(text, p.имя);
    assert.deepEqual(errors, [], p.icon + ': ' + errors.join('; '));
  }
});

// P4 — связка наёмных с каталогом NPC (ТЗ: портрет = его npcId).
test('портреты: связка наёмных — id портрета = id NPC каталога (npc-0000NN.json ↔ assets/npc/0000NN.json), имя совпадает (задача 000142)', () => {
  assertCatalogExists();
  const mercFiles = CANON_FILES.filter((f) => f.startsWith('npc-'));
  const nums = mercFiles.map((f) => f.slice(4, -5)).sort();
  assert.deepEqual(
    nums, ['000012', '000013', '000014', '000015', '000016', '000017'],
    'ровно 6 наёмных, номера NPC-каталога по одному разу');
  for (const f of mercFiles) {
    const num = f.slice(4, -5);
    const npcPath = path.join(NPC_DIR, num + '.json');
    assert.ok(fs.existsSync(npcPath),
      'assets/npc/' + num + '.json отсутствует (каталог NPC)');
    const npc = JSON.parse(fs.readFileSync(npcPath, 'utf8'));
    const p = readEntry(f);
    assert.equal(p.id, npc.id,
      f + ': id портрета обязан совпадать с id NPC («' + npc.id +
      '» — npcId спутника, companions.js)');
    assert.equal(p.имя, npc.имя,
      f + ': имя портрета обязан совпадать с именем NPC («' + npc.имя + '»)');
  }
});

// P5 — зеркало src/portraits-data.js: 1:1 с каталогом, канонический
// порядок. Ленивое require: файл отсутствует → осмысленный красный.
test('портреты: зеркало src/portraits-data.js — 1:1 с каталогом JSON (все поля, канонический порядок) (задача 000142)', () => {
  assert.ok(fs.existsSync(MIRROR),
    'src/portraits-data.js отсутствует — сгенерируйте ' +
    'scripts/sync-portraits.js (npm run sync:all, задача 000142)');
  assertCatalogExists();
  const { PORTRAITS } = require(MIRROR);
  assert.ok(Array.isArray(PORTRAITS), 'PORTRAITS — массив');
  assert.equal(PORTRAITS.length, 8, 'в зеркале ровно 8 записей');
  for (let i = 0; i < CANON_FILES.length; i++) {
    const f = CANON_FILES[i];
    const fromFile = readEntry(f);
    assert.ok(PORTRAITS[i] && typeof PORTRAITS[i] === 'object'
      && !Array.isArray(PORTRAITS[i]),
      'PORTRAITS[' + i + '] (' + f + '): объект');
    assert.deepEqual(PORTRAITS[i], fromFile,
      f + ': запись зеркала = записи каталога 1:1 (все поля, включая ' +
      'description)');
  }
});

// P6 — sync: скрипт существует, пишет атомарно (конвенция 000054),
// регенерация byte-идентична (идемпотентность), подхвачен конвенцией
// sync-*.js, CI-гейт sync-all --check зелёный.
test('портреты: sync — scripts/sync-portraits.js (write-atomic), регенерация byte-идентична (идемпотентность), sync-all --check → exit 0 (задача 000142)', (t) => {
  assert.ok(fs.existsSync(SYNC),
    'scripts/sync-portraits.js отсутствует (задача 000142: каталог ' +
    'assets/portraits → зеркало src/portraits-data.js)');
  const src = fs.readFileSync(SYNC, 'utf8');
  // Конвенция SPEC (задача 000054): вывод — ТОЛЬКО writeFileAtomic.
  assert.ok(/require\(['"][^'"]*write-atomic\.js['"]\)/.test(src),
    'scripts/sync-portraits.js обязан использовать ' +
    'scripts/lib/write-atomic.js (SPEC)');
  assert.ok(!/fs\.writeFileSync\s*\(/.test(src),
    'scripts/sync-portraits.js: прямой fs.writeFileSync — неатомарная ' +
    'запись; нужен writeFileAtomic');
  // Идемпотентность: повторный запуск byte-идентичен.
  const before = fs.existsSync(MIRROR) ? fs.readFileSync(MIRROR) : null;
  const r = spawnSync(process.execPath, [SYNC], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0,
    'scripts/sync-portraits.js обязан завершиться с кодом 0' +
    (r.stderr ? ': ' + r.stderr : ''));
  assert.ok(before !== null,
    'src/portraits-data.js должен быть сгенерирован скриптом');
  assert.ok(fs.readFileSync(MIRROR).equals(before),
    'повторный запуск sync-portraits.js обязан быть byte-идентичным ' +
    '(идемпотентность)');
  // Конвенция имён подхватывает скрипт без правок sync-all/CI.
  assert.ok(listSyncScripts(ROOT).includes('sync-portraits.js'),
    'listSyncScripts: sync-portraits.js подхватывается конвенцией ' +
    'sync-*.js');
  // CI-гейт. --check по конструкции exit 1 на незакоммиченных src/
  // (dev-состояние до коммита) — подпункт честно пропущен (t.comment);
  // реальная проверка — после коммита и в CI (D10).
  const dirty = gitStatusSrc(ROOT);
  if (Array.isArray(dirty) && dirty.length > 0) {
    t.comment('sync-all --check: в src/ есть незакоммиченные изменения ' +
      '(dev-состояние) — подпункт честно пропущен');
  } else {
    const c = spawnSync(process.execPath,
      [path.join(ROOT, 'scripts', 'sync-all.js'), '--check'],
      { cwd: ROOT, encoding: 'utf8' });
    assert.equal(c.status, 0,
      'sync-all --check обязан завершиться с кодом 0 (гейт включает ' +
      'portraits)' + (c.stdout ? ': ' + c.stdout : ''));
  }
});

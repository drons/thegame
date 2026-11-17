const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const LEDGER_PATH = path.join(__dirname, 'scripts', 'npc-forbidden-ledger.json');
const LEDGER_REL = 'tests/scripts/npc-forbidden-ledger.json';

const pad2 = (n) => String(n).padStart(2, '0');
const chainFile = (n) => path.join(__dirname, `npc-000320.${pad2(n)}.test.js`);

const t5Marker = (n) => (n >= 35 ? `000320.${pad2(n)} T5:` : 'T5:');

const extractGuard = (n) => {
  const file = chainFile(n);
  assert.ok(fs.existsSync(file),
    `цепное звено ${path.basename(file)} существует на диске`);
  const src = fs.readFileSync(file, 'utf8');
  const at = src.indexOf("test('" + t5Marker(n));
  assert.ok(at >= 0,
    `${path.basename(file)}: якорь T5 «${t5Marker(n)}» не найден — `
    + 'провенанс-сверка реестра опирается на него (ERR_ASSERTION, не крах)');
  const m = src.slice(at).match(/for \(const w of \[([\s\S]*?)\]\)/);
  assert.ok(m, `${path.basename(file)}: guard-массив не найден после якоря T5`);
  return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
};

const extractMine = (n) => {
  const src = fs.readFileSync(chainFile(n), 'utf8');
  const m = src.match(/const MINE = \[([\s\S]*?)\];/);
  assert.ok(m, `const MINE не найден в ${path.basename(chainFile(n))}`);
  return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
};

const readLedger = () => {
  assert.ok(fs.existsSync(LEDGER_PATH),
    'реестра ещё нет — он собран extraction-ом из legacy guard-массивов '
    + '(RED: отсутствует ' + LEDGER_REL + ')');
  return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
};

const chainLast = () => {
  let last = 22;
  for (let n = 23; n <= 80; n++) {
    if (fs.existsSync(chainFile(n))) last = n;
  }
  return last;
};

const linkKeys = (links) => Object.keys(links).map(Number).sort((a, b) => a - b);

const aggregateThrough = (ledger, upto) => {
  const out = [...ledger.basis];
  for (const k of linkKeys(ledger.links)) {
    if (k <= upto) out.push(...ledger.links[String(k)]);
  }
  return out;
};

const aggregateAll = (ledger) => aggregateThrough(ledger, Number.MAX_SAFE_INTEGER);

const forbidHits = (texts, list) => {
  const joined = texts.join(' ');
  return list.filter((w) => joined.includes(w));
};

const appendViolations = (head, disk) => {
  const v = [];
  if (JSON.stringify(head.basis) !== JSON.stringify(disk.basis)) {
    v.push('базис изменён (заморожен)');
  }
  const hk = linkKeys(head.links);
  const dk = linkKeys(disk.links);
  const maxHead = hk.length ? Math.max(...hk) : 0;
  for (const k of hk) {
    const key = String(k);
    if (!Object.prototype.hasOwnProperty.call(disk.links, key)) {
      v.push(`звено ${k} удалено`);
      continue;
    }
    if (JSON.stringify(head.links[key]) !== JSON.stringify(disk.links[key])) {
      v.push(`звено ${k} переписано`);
    }
  }
  const added = dk.filter((k) => !hk.includes(k));
  if (added.some((k) => k <= maxHead)) {
    v.push('новое звено вставлено не в хвост (есть ключ <= конца HEAD)');
  }
  return v;
};

test('000424 T1: носитель реестра существует и имеет ровно две верхние нечисловые клавиши в порядке ["basis","links"], basis — непустой массив, links — объект (не массив)', () => {
  const raw = (() => {
    assert.ok(fs.existsSync(LEDGER_PATH),
      'реестра ещё нет — он собран extraction-ом из legacy guard-массивов '
      + '(RED: отсутствует ' + LEDGER_REL + ')');
    return fs.readFileSync(LEDGER_PATH, 'utf8');
  })();
  const ledger = JSON.parse(raw);
  assert.deepEqual(Object.keys(ledger), ['basis', 'links'],
    'верхний порядок нечисловых ключей ≡ ["basis","links"] '
    + '(прецедент манифеста 000414); факт: '
    + JSON.stringify(Object.keys(ledger)));
  assert.ok(Array.isArray(ledger.basis) && ledger.basis.length > 0,
    'basis — непустой массив фраз');
  assert.ok(ledger.links !== null && typeof ledger.links === 'object'
    && !Array.isArray(ledger.links),
    'links — объект звеньев');
});

test('000424 T2: базис реестра побайтово ≡ guard-массиву T5 файла .22 (дисковый провенанс) и не содержит дублей', () => {
  const ledger = readLedger();
  const disk22 = extractGuard(22);
  assert.deepEqual(ledger.basis, disk22,
    'basis ≡ disk .22 ТЦЕЛОМ (и порядок, и значения); длина с диска: '
    + disk22.length);
  assert.equal(new Set(ledger.basis).size, ledger.basis.length,
    'в базисе нет дублей');
});

test('000424 T3: клавиши links образуют непрерывный возрастающий ряд 23..<хвост цепи с диска> без дыр и дублей; каждое звено — ровно 4 уникальные фразы', () => {
  const ledger = readLedger();
  const keys = linkKeys(ledger.links);
  const last = chainLast();
  const expected = [];
  for (let n = 23; n <= last; n++) expected.push(n);
  assert.deepEqual(keys, expected,
    'ключи links — подряд 23..' + last + ' (хвост цепи взят живым списком '
    + 'файлов), без дыр/лишних; факт: ' + JSON.stringify(keys));
  for (const k of keys) {
    const link = ledger.links[String(k)];
    assert.ok(Array.isArray(link), `звено ${k} — массив`);
    assert.equal(link.length, 4,
      `звено ${k} — ровно 4 фразы (режим +4 с .23); факт: ${link.length}`);
    assert.equal(new Set(link).size, 4, `в звене ${k} нет дублей`);
  }
});

test('000424 T4: провенанс каждого звена — агрегат(basis + links 23..k) побайтово ≡ дисковому guard-массиву .k, а сами 4 фразы звена ≡ const MINE предыдущего файла', () => {
  const ledger = readLedger();
  for (const k of linkKeys(ledger.links)) {
    const agg = aggregateThrough(ledger, k);
    assert.deepEqual(agg, extractGuard(k),
      `агрегат через ${k} ≡ disk .${pad2(k)} (формула наследования живьём)`);
    assert.deepEqual(ledger.links[String(k)], extractMine(k - 1),
      `звено ${k} ≡ const MINE файла .${pad2(k - 1)} (4 оборота предыдущего)`);
  }
});

test('000424 T5: хвост реестра — полный агрегат (basis + все звенья) побайтово ≡ guard-массиву последнего звена цепи и целиком уникален', () => {
  const ledger = readLedger();
  const last = chainLast();
  const agg = aggregateAll(ledger);
  assert.deepEqual(agg, extractGuard(last),
    'агрегат ≡ disk .' + pad2(last) + ' ТЦЕЛОМ; длина: ' + agg.length);
  assert.equal(new Set(agg).size, agg.length,
    'всем агрегате нет дублей; длина: ' + agg.length);
});

test('000424 T6: инвариант длины — для каждого префикса |агрегат| = |basis| + 4 × число звеньев в префиксе (ловит и лишнюю 5-ю фразу, и вырез)', () => {
  const ledger = readLedger();
  const basisLen = ledger.basis.length;
  let count = 0;
  for (const k of linkKeys(ledger.links)) {
    count += 1;
    const len = aggregateThrough(ledger, k).length;
    assert.equal(len, basisLen + 4 * count,
      `префикс до ${k}: ${basisLen} + 4×${count} = ${basisLen + 4 * count}`);
  }
});

test('000424 T7: append-only — реестр на диске отличается от HEAD только добавлением звеньев в хвост (базис и все прежние звенья заморожены); предикат проверен синтетической таблицей истинности', () => {
  const disk = readLedger();
  let headRaw;
  try {
    headRaw = execFileSync('git',
      ['-C', ROOT, 'show', 'HEAD:tests/scripts/npc-forbidden-ledger.json'],
      { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  } catch (e) {
    assert.fail('до коммита реестра в HEAD нет — append-зуб краснён на RED '
      + '(легальная форма; зелёным станет после фиксации реестра в HEAD)');
  }
  const head = JSON.parse(headRaw);
  assert.deepEqual(appendViolations(head, disk), [],
    'диск относительно HEAD — чистый append без правки замороженных частей');

  const H = { basis: ['x', 'y'], links: { 23: ['p', 'q', 'r', 's'], 24: ['t', 'u', 'v', 'w'] } };
  const clone = () => JSON.parse(JSON.stringify(H));
  const clean = clone();
  clean.links[25] = ['a', 'b', 'c', 'd'];
  assert.deepEqual(appendViolations(H, clean), [],
    'таблица: чистый append в хвост — зелёный');
  const rewrite = clone();
  rewrite.links[23] = ['p', 'q', 'r', 'Z'];
  assert.ok(appendViolations(H, rewrite).length > 0,
    'таблица: перепись звена — красное');
  const del = clone();
  delete del.links[23];
  assert.ok(appendViolations(H, del).length > 0,
    'таблица: удаление звена — красное');
  const back = clone();
  back.links[22] = ['a', 'b', 'c', 'd'];
  assert.ok(appendViolations(H, back).length > 0,
    'таблица: новое звено НЕ в хвост (ключ <= конца HEAD) — красное');
  const frozen = clone();
  frozen.basis = ['x', 'y', 'z'];
  assert.ok(appendViolations(H, frozen).length > 0,
    'таблица: правка замороженного базиса — красное');
});

test('000424 T8: синтетический шаг следующего звена в tmp — диалог фиктивного NPC со СВОИМИ 4 оборотами (резерв) даёт 0 попаданий сканера по forbid-списку aggregate(реестра), а новое guard-звено = aggregate + эти 4 и удовлетворяет формуле длины', () => {
  const ledger = readLedger();
  const forbid = aggregateAll(ledger);
  const fresh = [
    'тропа чужого каравана не помнит моего шага',
    'монета звенит только в чужом кошелёчке',
    'ветер не спрашивает разрешения у flags',
    'утренний туман прячет больше ночного'];
  assert.deepEqual(forbidHits(fresh, forbid), [],
    'чистый следующий NPC: его тексты (свои резервные обороты) не содержат '
    + 'ни одной фразы из prev-списка (aggregate реестра)');
  const nextGuard = [...forbid, ...fresh];
  assert.equal(nextGuard.length, ledger.basis.length
    + 4 * (linkKeys(ledger.links).length + 1),
    'следующее звено = aggregate(реестра) + 4 свои MINE — формула длины');
  assert.equal(new Set(nextGuard).size, nextGuard.length,
    'новое звено целиком уникально');
});

test('000424 T9: анти-вакуум — сканер ловит инжект КАЖДОЙ фразы prev-списка в диалог tmp, а предикат prev ⊆ own краснеет при вырезе элемента из guard-копии', () => {
  const ledger = readLedger();
  const forbid = aggregateAll(ledger);
  for (const phrase of forbid) {
    const texts = ['нейтральная строка диалога', 'текст с подстрокой [' + phrase + '] внутри'];
    assert.ok(forbidHits(texts, forbid).length >= 1,
      'зуб не вакуумный: инжект фразы «' + phrase.slice(0, 24) + '…» '
      + 'обязан быть пойман сканером');
  }
  const fake = ['первый фиктивный оборот резерва', 'второй фиктивный оборот',
    'третий фиктивный оборот', 'четвёртый фиктивный оборот'];
  const prev = [...forbid];
  const own = [...forbid, ...fake];
  const ownSet = new Set(own);
  assert.deepEqual(prev.filter((x) => !ownSet.has(x)), [],
    'синтетическое звено: prev ⊆ own (ни одна фраза агрегата не потеряна)');
  const prevSet = new Set(prev);
  assert.deepEqual(own.filter((x) => !prevSet.has(x)), fake,
    'дельта (own минус prev) ≡ ровно 4 фиктивных MINE нового звена');
  const damaged = own.filter((_, i) => i !== 5);
  const damagedSet = new Set(damaged);
  assert.ok(prev.filter((x) => !damagedSet.has(x)).length > 0,
    'тот же предикат ловит вырез элемента предыдущего звена из guard-копии');
});

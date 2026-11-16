// Задача 000408 (ретро-b27 тема в): зуб «буллет CHANGELOG ≡ фактическая дата ff-мержа».
//
// Источник нарушения (подтверждён диском): буллет «Дымарь» влит ff 2026-11-16 00:59
// (committer-date landing-коммита), но лежал в секции «## 2026-11-15». Зуб
// changelog-day-structure-000389 читает ТОЛЬКО структуру дня (антидубль ###,
// порядок типов) и git не читает вовсе — на семантическом сдвиге буллета относительно
// даты мержа он зелёный. Канон memory/changelog-merge-date-section применялся
// непоследовательно: .321.11 перенесён приёмкой, .33 — нет.
//
// Носитель истины — ЧЕК-ИННУТЫЙ МАНИФЕСТ tests/data/changelog-merge-dates.json:
//   { "<bold-title>": { "date": "ГГГГ-ММ-ДД", "sha": "<landing>"? } }
// date — фактическая дата ff-мержа (источник seed-а — committer-date мержевого
// коммита, сверяется приёмкой ОРКЕСТРАТОРА, не тестом); sha — informational-поле
// (sha будущего мержа неизвестна до мержа, прецедент sha-скоупа .406), НЕ
// сверяется с git — зуб обязан работать из git-archive-копий, потому git-вызовов
// здесь нет вообще (self-гейт в T5).
//
// Предикат (T2): каждая запись манифеста матчится ровно на ОДИН буллет вида
// «- **<title>.** …» и обязана лежать в дне «## <date>», равном дате манифеста.
//
// Строгость coverage (T3, осмысленный компромисс — см. result/память): буллеты
// ВЕРХНЕГО (первого) дня обязаны иметь запись в манифесте (исторические дни —
// легальная дыра, заносятся приёмкой постепенно); не-bold буллет верхнего дня
// тоже краснота (иначе «неформатный буллет» молча выпадает из coverage).
//
// Парсер дня СОВПАДАЕТ по семантике с усиленным parseDays 000389/.401
// (датный заголовок «## ГГГГ-ММ-ДД» + граница токена, хвост — приписка; не-датный
// «## » расклеивает) — но это СВОЙ минимальный парсер, НЕ require 000389:
// require чужого .test.js удвоил бы регистрацию его тестов в едином прогоне.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md');
const MANIFEST_PATH = path.join(ROOT, 'tests', 'data', 'changelog-merge-dates.json');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SHA_RE = /^[0-9a-f]{7,40}$/;

function parseDaysWithBullets(text) {
  const days = [];
  let current = null;
  for (const line of text.split('\n')) {
    const dateMatch = /^## (\d{4}-\d{2}-\d{2})\b/.exec(line);
    if (dateMatch) {
      current = { date: dateMatch[1], bullets: [] };
      days.push(current);
      continue;
    }
    if (/^## /.test(line)) {
      current = null;
      continue;
    }
    if (!current) continue;
    if (/^- /.test(line)) current.bullets.push(line);
  }
  return days;
}

function bulletTitle(line) {
  const m = /^- \*\*(.+?)\.\*\*/.exec(line);
  return m ? m[1] : null;
}

function schemaHits(manifest) {
  const hits = [];
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return ['манифест обязан быть объектом { "<title>": { "date", "sha"? } }'];
  }
  for (const [k, v] of Object.entries(manifest)) {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) {
      hits.push(`«${k}»: запись обязана быть объектом`);
      continue;
    }
    if (typeof v.date !== 'string' || !DATE_RE.test(v.date)) {
      hits.push(`«${k}»: date обязана быть строкой ГГГГ-ММ-ДД`);
    }
    if ('sha' in v && (typeof v.sha !== 'string' || !SHA_RE.test(v.sha))) {
      hits.push(`«${k}»: sha informational-поле, обязано быть hex 7..40 или отсутствовать`);
    }
    for (const key of Object.keys(v)) {
      if (key !== 'date' && key !== 'sha') hits.push(`«${k}»: неизвестное поле «${key}»`);
    }
  }
  return hits;
}

function mergeDateHits(manifest, text) {
  const days = parseDaysWithBullets(text);
  const pos = new Map();
  for (const d of days) {
    for (const b of d.bullets) {
      const t = bulletTitle(b);
      if (t === null) continue;
      if (!pos.has(t)) pos.set(t, []);
      pos.get(t).push(d.date);
    }
  }
  const hits = [];
  for (const [title, rec] of Object.entries(manifest)) {
    const found = pos.get(title) || [];
    if (found.length === 0) {
      hits.push(`«${title}»: нет ни одного буллета «- **${title}.**»`);
      continue;
    }
    if (found.length > 1) {
      hits.push(`«${title}»: буллет встречается ${found.length} раз (дубль)`);
      continue;
    }
    if (found[0] !== rec.date) {
      hits.push(`«${title}»: буллет лежит в дне «## ${found[0]}», а манифест — дата мержа ${rec.date} — перенеси буллет в секцию фактической даты`);
    }
  }
  return hits;
}

function coverageHits(manifest, text) {
  const days = parseDaysWithBullets(text);
  if (days.length === 0) return [];
  const top = days[0];
  const hits = [];
  for (const b of top.bullets) {
    const t = bulletTitle(b);
    if (t === null) {
      hits.push(`верхний день «${top.date}»: буллет без bold-заголовка «- **Т.**» — выпадает из coverage: ${b.slice(0, 40)}`);
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(manifest, t)) {
      hits.push(`верхний день «${top.date}»: буллет «${t}» без записи — добавь «${t}» в tests/data/changelog-merge-dates.json с фактической датой мержа`);
    }
  }
  return hits;
}

function readManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

test('000408 T1: манифест tests/data/changelog-merge-dates.json — объект с уникальными keys, date ≡ ГГГГ-ММ-ДД, sha (если есть) ≡ hex 7..40, без неизвестных полей', () => {
  const hits = schemaHits(readManifest());
  assert.deepEqual(hits, [], 'схема манифеста нарушена: ' + hits.join('; '));
});

test('000408 T2: каждая запись манифеста матчится ровно на один буллет и лежит в дне «## <дата>», равном дате манифеста', () => {
  const text = fs.readFileSync(CHANGELOG_PATH, 'utf8');
  const hits = mergeDateHits(readManifest(), text);
  assert.deepEqual(hits, [], 'буллет ≠ фактическая дата ff-мержа из манифеста: ' + hits.join('; '));
});

test('000408 T3: coverage — каждый буллет ВЕРХНЕГО дня CHANGELOG имеет запись в манифесте; не-bold буллет верхнего дня красен (исторические дни — легальная дыра, заносятся приёмкой постепенно)', () => {
  const text = fs.readFileSync(CHANGELOG_PATH, 'utf8');
  const hits = coverageHits(readManifest(), text);
  assert.deepEqual(hits, [], 'непрокрытый буллет верхнего дня: ' + hits.join('; '));
});

test('000408 T4: self-check предикатов на синтетике — не-в-своей-дате красен, перенесён зелёный, дубль/отсутствующий/не-bold/пустой-манифест/приписка-даты ловятся', () => {
  const CLEAN = '## 2026-11-16\n\n### Игровой процесс\n- **Альфа.** текст\n- **Бета.** текст\n\n## 2026-11-15\n\n### Игровой процесс\n- **Гамма.** текст\n';
  const cases = [
    { name: 'а: чистая пара (все буллеты в своих днях, верхний день покрыт)',
      manifest: { Альфа: { date: '2026-11-16' }, Бета: { date: '2026-11-16' }, Гамма: { date: '2026-11-15' } },
      text: CLEAN, merge: 0, cov: 0, schema: 0 },
    { name: 'б: буллет не в своей дате (Гамма физически в 11-15, манифест — 11-16)',
      manifest: { Альфа: { date: '2026-11-16' }, Бета: { date: '2026-11-16' }, Гамма: { date: '2026-11-16' } },
      text: CLEAN, merge: 1, cov: 0, schema: 0 },
    { name: 'в: буллет перенесён в свою дату → зелёный',
      manifest: { Дым: { date: '2026-11-16' } },
      text: '## 2026-11-16\n\n### Игровой процесс\n- **Дым.** текст\n', merge: 0, cov: 0, schema: 0 },
    { name: 'г: запись манифеста без буллета → merge красен',
      manifest: { Неткого: { date: '2026-11-16' } },
      text: CLEAN, merge: 1, cov: 2, schema: 0 },
    { name: 'д: буллет верхнего дня без записи → coverage красен',
      manifest: { Альфа: { date: '2026-11-16' } },
      text: CLEAN, merge: 0, cov: 1, schema: 0 },
    { name: 'е: одноимённый буллет в двух днях → merge красен (дубль)',
      manifest: { Дубль: { date: '2026-11-16' } },
      text: '## 2026-11-16\n\n### Игровой процесс\n- **Дубль.** раз\n\n## 2026-11-15\n\n### Игровой процесс\n- **Дубль.** два\n',
      merge: 1, cov: 0, schema: 0 },
    { name: 'ж: не-bold буллет верхнего дня → coverage красен',
      manifest: { Бета: { date: '2026-11-16' } },
      text: '## 2026-11-16\n\n### Игровой процесс\n- Альфа без жирного заголовка\n- **Бета.** текст\n',
      merge: 0, cov: 1, schema: 0 },
    { name: 'з: кривой sha → schema красен (sha informational, но форматно hex 7..40)',
      manifest: { Альфа: { date: '2026-11-16', sha: 'zz' }, Бета: { date: '2026-11-16' } },
      text: '## 2026-11-16\n\n### Игровой процесс\n- **Альфа.** текст\n- **Бета.** текст\n',
      merge: 0, cov: 0, schema: 1 },
    { name: 'и: пустой манифест при непустом верхнем дне → coverage красен',
      manifest: {},
      text: CLEAN, merge: 0, cov: 2, schema: 0 },
    { name: 'к: дата с припиской (усиление .401) распознаётся как день',
      manifest: { Альфа: { date: '2026-11-16' } },
      text: '## 2026-11-16 (пре-релиз)\n\n### Игровой процесс\n- **Альфа.** текст\n',
      merge: 0, cov: 0, schema: 0 },
  ];
  const mismatches = [];
  for (const c of cases) {
    const m = mergeDateHits(c.manifest, c.text).length;
    const cv = coverageHits(c.manifest, c.text).length;
    const sc = schemaHits(c.manifest).length;
    if (m !== c.merge) mismatches.push(`${c.name}: merge ${m} ≠ ${c.merge}`);
    if (cv !== c.cov) mismatches.push(`${c.name}: coverage ${cv} ≠ ${c.cov}`);
    if (sc !== c.schema) mismatches.push(`${c.name}: schema ${sc} ≠ ${c.schema}`);
  }
  assert.deepEqual(mismatches, [], 'предикаты врут на синтетике: ' + mismatches.join('; '));
});

test('000408 T5: архивная инертность — tmp-копии пары (CHANGELOG + манифест) дают тот же вывод предикатов (зуб работает из git-архивных копий); self-гейт: в тексте файла нет механизмов запуска внешних процессов (иглы собраны динамически)', () => {
  const selfText = fs.readFileSync(__filename, 'utf8');
  const needles = ['child' + '_' + 'process', 'ex' + 'ecSync', 'spawn' + 'Sync', 'exec' + 'File' + 'Sync'];
  const leaks = needles.filter((n) => selfText.includes(n));
  assert.deepEqual(leaks, [], 'зуб обязан работать из git-archive-копий — запрещённый git-механизм в тексте: ' + leaks.join(', '));

  const diskLog = fs.readFileSync(CHANGELOG_PATH, 'utf8');
  const diskMan = fs.readFileSync(MANIFEST_PATH, 'utf8');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chgdate408-'));
  try {
    const tLog = path.join(dir, 'CHANGELOG.md');
    const tMan = path.join(dir, 'changelog-merge-dates.json');
    fs.writeFileSync(tLog, diskLog);
    fs.writeFileSync(tMan, diskMan);
    const man2 = JSON.parse(fs.readFileSync(tMan, 'utf8'));
    const log2 = fs.readFileSync(tLog, 'utf8');
    assert.deepEqual(mergeDateHits(man2, log2), mergeDateHits(JSON.parse(diskMan), diskLog),
      'merge-плечо не инертно к копии');
    assert.deepEqual(coverageHits(man2, log2), coverageHits(JSON.parse(diskMan), diskLog),
      'coverage-плечо не инертно к копии');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

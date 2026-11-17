// =====================================================================
// 000422 — свип «руна продаёт живое» (СИСТЕМНАЯ дыра карточки п.3)
//
// Контракт spec/runes.md:17: руна — «названием/описанием, механика
// реальная». Гейт каталога рун (tests/runes-catalog-000328.01)
// проверяет ПРИНАДЛЕЖНОСТЬ derived-стата ключам derived(), но не
// ЖИВОСТЬ потребителя: руна могла продавать стат, который никто,
// кроме определения в sheet.js и генерируемого runes-data, не читает
// (прецедент: sure_foot → acroBonus жили мёртвыми до 000422).
//
// Модель живости (греп-модель по src/, эмпирически сверена на базе):
// стат ЖИВОЙ, если выполнено ЛЮБОЕ из двух плеч:
//   1) dot-чтение `\.{stat}\b` в src/ (кроме генерируемых зеркал
//      src/runes-data.js и src/skills-data.js) — ловит, например,
//      hpRegenMult/mpRegenMult (внутренний консьюмер sheet.js
//      restoreDay) и acroBonus после consumer в main.js (000422);
//   2) токен стат в src/ (кроме src/sheet.js — там определения ВСЕХ
//      derived-ключей: включение sheet.js в это плечо = вакуум,
//      каждый стат проходил бы сам за себя — и генерируемых зеркал).
// Чистое токен-плечо с sheet.js пропускало бы мёртвый стат через
// его определение; чистое dot-плечо краснило бы iceDamageBonus
// (консьюмер — строковый ключ SCHOOL_BONUS в spells.js, не dot).
//
// Анти-вакуум (иначе задача не выполнена, карточка п.3): свип
// параметризован КАТАЛОГОМ — tmp-копия каталога с sure_foot →
// синтетический мёртвый стат обязана красить checker (T2); тем же
// копированием проверяется инертность параметризации (T2b).
//
// sure_foot → acroBonus (pair 000328.01) и пары derived-ключей НЕ
// трогаются — ветка (a) вердикта 000422: чинится потребитель, а не
// перепривязка руны (T3 — пин, что перепривязка (b) не случилась).
// =====================================================================

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CATALOG = path.join(ROOT, 'assets', 'runes');
const SRC = path.join(ROOT, 'src');

// Генерируемые зеркала — носители ПРОДАЖИ стата (stat: "..."), не
// консьюмеры; всегда исключены из обоих плеч.
const GENERATED = new Set(['runes-data.js', 'skills-data.js']);

const srcFiles = fs.readdirSync(SRC).filter((f) => f.endsWith('.js'));
const srcTexts = new Map();
for (const f of srcFiles) {
  if (GENERATED.has(f)) continue;
  srcTexts.set(f, fs.readFileSync(path.join(SRC, f), 'utf8'));
}
const srcFilesNoSheet = [...srcTexts.keys()].filter((f) => f !== 'sheet.js');

function derivedStats(catalogDir) {
  const stats = new Set();
  for (const f of fs.readdirSync(catalogDir)
    .filter((x) => x.endsWith('.json') && x !== 'schema.json').sort()) {
    const d = JSON.parse(fs.readFileSync(path.join(catalogDir, f), 'utf8'));
    const e = d && d['эффект'];
    if (e && e.type === 'derived' && typeof e.stat === 'string') {
      stats.add(e.stat);
    }
  }
  return stats;
}

// Плечо 1 (dot) — по всем включённым файлам (sheet.js включён:
// внутренний консьюмер restoreDay легален); плечо 2 (токен) — без
// sheet.js (там определения — иначе вакуум).
function deadStatsIn(catalogDir) {
  const dead = [];
  for (const stat of [...derivedStats(catalogDir)].sort()) {
    const dot = new RegExp('\\.' + stat + '\\b');
    const tok = new RegExp('\\b' + stat + '\\b');
    const dotHit = [...srcTexts.entries()].some(([, t]) => dot.test(t));
    const tokHit = srcFilesNoSheet.some((f) => tok.test(srcTexts.get(f)));
    if (!dotHit && !tokHit) dead.push(stat);
  }
  return dead;
}

test('000422 T1: свип живости — ни одна руна каталога не даёт derived-стат без чтения вне определений (spec/runes.md «механика реальная»; RED: acroBonus без потребителя до 000422)', () => {
  const stats = derivedStats(CATALOG);
  assert.ok(stats.size > 0,
    'свип не вакуум: каталог рун должен отдавать derived-статы '
    + '(иначе T1 — пустой прогон)');
  const dead = deadStatsIn(CATALOG);
  assert.deepEqual(dead, [],
    'RED: мёртвые derived-статы каталога рун (продаются, но их никто '
    + 'не читает вне sheet.js-определений и генерируемых зеркал) — '
    + 'нарушение «механика реальная» (spec/runes.md): '
    + dead.join(', '));
});

test('000422 T2: анти-вакуум — tmp-копия каталога с sure_foot → синтетический мёртвый стат красит свип; свип параметризован каталогом, а не захардкожен на рабочий путь', () => {
  const probe = 'deadFootProbe422';
  assert.equal(
    [...srcTexts.values()].some((t) => new RegExp('\\b' + probe + '\\b').test(t)),
    false,
    'пробное имя не должно встречаться в src/ — иначе анти-вакуум ложен');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runes422-'));
  try {
    for (const f of fs.readdirSync(CATALOG)
      .filter((x) => x.endsWith('.json') && x !== 'schema.json')) {
      const src = fs.readFileSync(path.join(CATALOG, f), 'utf8');
      let out = src;
      const d = JSON.parse(src);
      if (d && d.id === 'sure_foot' && d['эффект']) {
        d['эффект'].stat = probe;
        out = JSON.stringify(d, null, 2);
      }
      fs.writeFileSync(path.join(dir, f), out);
    }
    const dead = deadStatsIn(dir);
    assert.ok(dead.includes(probe),
      'RED-контроль: checker обязан красить синтетический мёртвый стат '
      + '(иначе T1 — вакуум); мёртвые: ' + dead.join(', '));
    assert.equal(dead.includes('acroBonus'), false,
      'после отвязки sure_foot acroBonus больше не продаётся каталогом '
      + 'и не может быть в списке мёртвых этого среза');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('000422 T2b: инертность параметризации — чистая tmp-копия каталога даёт ровно тот же вердикт, что рабочий каталог', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runes422c-'));
  try {
    for (const f of fs.readdirSync(CATALOG)
      .filter((x) => x.endsWith('.json') && x !== 'schema.json')) {
      fs.copyFileSync(path.join(CATALOG, f), path.join(dir, f));
    }
    assert.deepEqual(deadStatsIn(dir), deadStatsIn(CATALOG),
      'checker зависит от КАТАЛОГА-параметра, а не от пути рабочих файлов');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('000422 T3: ветка (a) вердикта 000422 — sure_foot остаётся при acroBonus (перепривязка (b) не случилась), определение живёт в sheet.js', () => {
  let sure = null;
  for (const f of fs.readdirSync(CATALOG)
    .filter((x) => x.endsWith('.json') && x !== 'schema.json')) {
    const d = JSON.parse(fs.readFileSync(path.join(CATALOG, f), 'utf8'));
    if (d && d.id === 'sure_foot') sure = d;
  }
  assert.ok(sure, 'руна sure_foot в каталоге');
  assert.equal(sure['эффект'].stat, 'acroBonus',
    'вердикт 000422 — ветка (a): sure_foot НЕ перепривязывается, '
    + 'чинится потребитель stата');
  const sheet = srcTexts.get('sheet.js');
  assert.ok(sheet, 'sheet.js в скане (плечо dot)');
  assert.ok(/acroBonus:/.test(sheet),
    'acroBonus — derived-ключ sheet.js (определение; само по себе '
    + 'потребительством НЕ считается — см. модель живости в шапке)');
});

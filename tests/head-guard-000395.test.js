// Задача 000395 (п.4): машинный запрет класса «src-файл ≡ git show HEAD» на ВСЕ
// tests/*.test.js — локальный HEAD_GUARD_HITS_I08 (items-rename T12) ловил только
// 3 записанные формы, template-literal и скобочная конкатенации ПРОХОДИЛИ
// (finding кросса C аудита 000393). Здесь класс закрыт полностью: F1 литерал
// «HEAD:»+«src», F2 конкатенация переменной вне файлов-скоупного allowlist, F3
// quoted-src, F4 template-literal (закрытие кросса C), F5 конкатенация с
// parenthesized-выражением (закрытие кросса C), F6 голый элемент «HEAD:» с
// запятой (join/массивная сборка). RAW-скан (без маскирования), иглы собираются из
// сегментов — собственный текст файла формам не совпадает (self-match = 0,
// УРОК .393 п.3). Легальны: документ-гейты полными литералами (HEAD:spec/…,
// HEAD:memory/…), append-зубы реестров/лога (allowlist), sync:check/sync-all
// (вне tests/*.test.js). Носители и границы — memory/000395-live-regen-migration.md.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const TESTS_DIR = path.join(__dirname);
const HEAD_REF_COLON_000395 = 'HEAD' + ':';
const Q000395 = '[\\x27"]';

// Allowlist ПО ФИЛАМ (глобальные имена-идентификаторы дырявы: `rel`/`t`
// из чужого файла открыли бы дыру): идентификатор разрешён только внутри
// своего файла-носителя append-зуба.
const HEAD_BAN_ALLOW_000395 = {
  'items-rename-000318.08.test.js': ['LEDGER_I08_REL'],
  'skills-rename-000318.09.test.js': ['REGISTRY_REL_I09'],
  'items-spec-bytes-log-000386.test.js': ['t'],
};

function HEAD_BAN_HITS_000395(text, allow) {
  const A = allow || [];
  const bad = [];
  const lineOf = (idx) => text.slice(0, idx).split('\n').length;
  const res = [
    { why: 'побайтовая сверка src-файла с HEAD (литерал пути)',
      re: new RegExp(HEAD_REF_COLON_000395 + 'src', 'g') },
    { why: 'сверка с HEAD через конкатенацию переменной (вне allowlist)',
      re: new RegExp(Q000395 + HEAD_REF_COLON_000395 + Q000395
        + '\\s*\\+\\s*([A-Za-z_$][\\w$]*)', 'g'),
      ident: true },
    { why: 'сверка с HEAD через конкатенацию quoted-src',
      re: new RegExp(Q000395 + HEAD_REF_COLON_000395 + Q000395
        + '\\s*\\+\\s*' + Q000395 + 'src', 'g') },
    { why: 'template-literal HEAD:\${…} (закрытие кросса C .393)',
      re: new RegExp(HEAD_REF_COLON_000395 + '\\$\\{', 'g') },
    { why: 'конкатенация HEAD с parenthesized-выражением (закрытие кросса C)',
      re: new RegExp(Q000395 + HEAD_REF_COLON_000395 + Q000395
        + '\\s*\\+\\s*\\(', 'g') },
    { why: 'голый элемент «HEAD:» в массивной/join-сборке',
      re: new RegExp(Q000395 + HEAD_REF_COLON_000395 + Q000395
        + '\\s*,', 'g') },
  ];
  for (const r of res) {
    for (const m of text.matchAll(r.re)) {
      if (r.ident && A.includes(m[1])) continue;
      bad.push('строка ' + lineOf(m.index) + ': ' + r.why);
    }
  }
  return bad;
}

function testFiles_000395() {
  return fs.readdirSync(TESTS_DIR)
    .filter((f) => f.endsWith('.test.js'))
    .sort();
}

test('000395 T7: машинный запрет класса HEAD-guard на всех tests/*.test.js — ни одной исполняемой/текстовой формы сверки src с HEAD (F1 литерал, F2 конкатенация переменной вне allowlist, F3 quoted-src, F4 template-literal, F5 скобочная конкатенация, F6 join-элемент); allowlist файлов-скоупный и НЕ протухает (каждый запись обязана существовать на диске); сам носитель запрета сканируется на self-match', () => {
  const files = testFiles_000395();
  assert.ok(files.length >= 200,
    'анти-вакуум обхода: отсканировано файлов ' + files.length
    + ' — меньше монотонного поля 200, свип деградировал (каталог не тот?)');
  const hits = [];
  for (const f of files) {
    const found = HEAD_BAN_HITS_000395(
      fs.readFileSync(path.join(TESTS_DIR, f), 'utf8'),
      HEAD_BAN_ALLOW_000395[f]);
    for (const h of found) hits.push(f + ' ' + h);
  }
  const stale = Object.keys(HEAD_BAN_ALLOW_000395)
    .filter((f) => !files.includes(f));
  assert.deepEqual(stale, [],
    'allowlist протух: файлов из списка нет в tests/ — переименование/удаление'
    + ' обязано синхронизировать список (иначе дыра класса переезжает молча): '
    + stale.join(', '));
  assert.ok(files.includes(path.basename(__filename)),
    'анти-вакуум: сам носитель запрета не попал в скан (self-match не'
    + ' проверяется)');
  assert.deepEqual(hits, [],
    'в tests/ вернулся класс побайдовых сверок src-файлов с HEAD ('
    + hits.length + '): ' + hits.join(' | ')
    + ' — до коммита они красят легитимную перегенерацию зеркал,'
    + ' после коммита тавтологичны (ретро-b24 F4). РЕЦЕПТ: зеркала-регены'
    + ' — tmp-реген своего выхода генератором (механизм 000393,'
    + ' полная tmp-дерево: ПОЛНЫЕ assets + scripts + tests/scripts/*.json'
    + ' + пустой src), hand-файлы — структурные пины выражений'
    + ' (memory/000393-selfgate-headguard.md п.6, п.4-решение и allowlist'
    + ' — memory/000395-live-regen-migration.md)');
});

test('000395 T8: ПОСТОЯННАЯ таблица истинности ban-детектора — все шесть запрещённых форм пойманы (включая template-literal и скобочную конкатенации — finding кросса C .393), легальные формы не задеты (документ-гейты spec/памяти, allowlist-идент, проза «HEAD: » с пробелом, объектный ключ); красные строки обязательны (иначе зуб-пустышка)', () => {
  const B = String.fromCharCode(96);
  const Qc = String.fromCharCode(39);
  const table = [
    ['F1 литерал src-пути', Qc + HEAD_REF_COLON_000395 + 'src/probe.js'
      + Qc, [], true],
    ['F2 конкатенация переменной вне allowlist',
      "['show', " + Qc + HEAD_REF_COLON_000395 + Qc
      + ' + probeFile]', [], true],
    ['F3 quoted-src конкатенация',
      Qc + HEAD_REF_COLON_000395 + Qc + ' + ' + Qc
      + 'src/probe.js' + Qc, [], true],
    ['F4 template-literal (кросс C)',
      B + HEAD_REF_COLON_000395 + '$' + '{rel}' + B, [], true],
    ['F5 скобочная конкатенация (кросс C)',
      Qc + HEAD_REF_COLON_000395 + Qc + ' + (' + Qc
      + 'src/probe.js' + Qc + ')', [], true],
    ['F6 голый join-элемент',
      "['show', " + Qc + HEAD_REF_COLON_000395 + Qc + ', rel]'
      + ".join('')", [], true],
    ['allowlist: идентификатор в разрешённом контексте',
      "['-C', ROOT, 'show', " + Qc + HEAD_REF_COLON_000395 + Qc
      + ' + probeFile]', ['probeFile'], false],
    ['документ-гейт spec (полный литерал)',
      Qc + HEAD_REF_COLON_000395 + 'spec/items.md' + Qc, [], false],
    ['документ-гейт памяти (полный литерал)',
      Qc + HEAD_REF_COLON_000395
      + 'memory/000230.16-spec-equipment-doc.md' + Qc, [], false],
    ['проза assert-сообщения («HEAD: » с пробелом)',
      Qc + 'сверка с ' + HEAD_REF_COLON_000395 + ' легитимна в прозе'
      + Qc, [], false],
    ['объектный ключ HEAD: в данных',
      "  HEAD: 'head', EARS: 'ears'", [], false],
  ];
  const misses = [];
  for (const [name, synth, allow, mustCatch] of table) {
    const caught = HEAD_BAN_HITS_000395(synth, allow).length > 0;
    if (caught !== mustCatch) {
      misses.push('форма «' + name + '» ' + (mustCatch
        ? 'НЕ поймана (обход класса возвращается молча)'
        : 'поймана ложно (легальный гейт запрещён)'));
    }
  }
  assert.ok(table.some((r) => r[3] === true)
    && table.some((r) => r[3] === false),
    'анти-вакуум таблицы: нужны и красные, и зелёные строки');
  assert.deepEqual(misses, [],
    'таблица истинности ban-детектора покраснела: ' + misses.join(' | ')
    + ' — детектор обязан ловить ВСЕ шесть форм (F1–F6) и не трогать'
    + ' легальные (документ-гейты, allowlist); форма-источник кросса C —'
    + ' memory/000393-selfgate-headguard.md');
});

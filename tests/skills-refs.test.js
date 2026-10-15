// skills: primary/requires.skill — ссылки на json-файлы навыков (000211.02).
//
// Зелёная фаза: каталог assets/skills — ref-форма (45 ссылок), схема —
// REF_RE-паттерны, sync резолвит ссылки → id — SR1–SR6 зелёные,
// SR7 — пин, зелёный до и после, SR8 — негативный hard-fail sync
// (полумигрированный каталог → exit 1). Все тесты — node, без vm.
// «Прежнее значение» (ground truth) — зеркало src/skills-data.js
// (id-форма, byte-идентичная регенерация): сверка без хардкода таблиц.
// Контракт: memory/000211.02-skills-refs.md; формат ссылки —
// memory/000211.01-json-ref-format.md (REF_RE из scripts/lib/json-ref.js).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const { REF_RE, isRef, resolveRef, collectRefs } = require(
  path.join(ROOT, 'scripts', 'lib', 'json-ref.js'));
const { SECONDARY_SKILLS } = require(
  path.join(ROOT, 'src', 'skills-data.js'));
const { runAll } = require(path.join(ROOT, 'scripts', 'sync-all.js'));

const SKILLS_DIR = path.join(ROOT, 'assets', 'skills');

function listSkillFiles() {
  return fs.readdirSync(SKILLS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
}

function loadSecondary() {
  const out = [];
  for (const f of listSkillFiles()) {
    const data = JSON.parse(
      fs.readFileSync(path.join(SKILLS_DIR, f), 'utf8'));
    if (data.type === 'secondary') out.push({ file: f, data });
  }
  return out;
}

function git(dir, args) {
  const r = spawnSync('git',
    ['-C', dir,
     '-c', 'user.name=skills-refs-test',
     '-c', 'user.email=skills-refs-test@example.com',
     ...args],
    { encoding: 'utf8' });
  if (r.error) throw new Error('git ' + args.join(' ') + ': ' + r.error.message);
  if (r.status !== 0) {
    throw new Error('git ' + args.join(' ') + ' → ' + r.status + ': ' +
      (r.stderr || r.stdout));
  }
  return r.stdout;
}

test('SR1: secondary: primary — якорная ссылка на файл навыков (31 файл)', () => {
  const sec = loadSecondary();
  assert.equal(sec.length, 31, 'вторичных навыков 31');
  for (const { file, data } of sec) {
    assert.equal(typeof data.primary, 'string', `${file}: primary — строка`);
    assert.ok(isRef(data.primary),
      `${file}: primary "${data.primary}" — не якорная ссылка ` +
      '(REF_RE: ссылка на assets/skills/<NNNNNN>.json)');
  }
});

test('SR2: 31 primary-ссылка резолвится, id таргета = прежнее значение (зеркало)', () => {
  const sec = loadSecondary();
  for (const { file, data } of sec) {
    const r = resolveRef(ROOT, data.primary);
    assert.ok(r.ok,
      `${file}: primary-ссылка не резолвится: ${r.reason} (${data.primary})`);
    const expected = SECONDARY_SKILLS[data.id].primary;
    assert.equal(r.id, expected,
      `${file}: id таргета primary "${r.id}" != прежнему значению "${expected}"`);
  }
});

test('SR3: 14 requires.skill — ссылки резолвятся, id = зеркало, level не тронут', () => {
  const sec = loadSecondary();
  const withRequires = sec.filter(({ data }) => data.requires !== undefined);
  assert.equal(withRequires.length, 14, 'навыков с requires — 14');
  for (const { file, data } of withRequires) {
    const r = resolveRef(ROOT, data.requires.skill);
    assert.ok(r.ok,
      `${file}: requires.skill не резолвится: ${r.reason} ` +
      `(${data.requires.skill})`);
    const m = SECONDARY_SKILLS[data.id];
    assert.ok(m.requires, `${file}: в зеркале есть requires`);
    assert.equal(r.id, m.requires.skill,
      `${file}: id таргета requires.skill "${r.id}" != прежнему значению ` +
      `"${m.requires.skill}"`);
    assert.ok(Number.isInteger(data.requires.level) &&
      data.requires.level >= 1 && data.requires.level <= 100,
      `${file}: requires.level целое 1..100 (не мигрирует)`);
    assert.equal(data.requires.level, m.requires.level,
      `${file}: requires.level == зеркалу`);
  }
});

test('SR4: ровно 45 ссылок в каталоге (31 primary + 14 requires.skill)', () => {
  const byPath = new Map();
  for (const f of listSkillFiles()) {
    const data = JSON.parse(
      fs.readFileSync(path.join(SKILLS_DIR, f), 'utf8'));
    for (const { path: p } of collectRefs(data)) {
      assert.ok(p === 'primary' || p === 'requires.skill',
        `${f}: ссылка на непредусмотренном пути "${p}"`);
      byPath.set(p, (byPath.get(p) || 0) + 1);
    }
  }
  assert.equal(byPath.get('primary'), 31, 'ссылок primary — 31');
  assert.equal(byPath.get('requires.skill'), 14, 'ссылок requires.skill — 14');
  assert.equal((byPath.get('primary') || 0) + (byPath.get('requires.skill') || 0),
    45, 'всего ссылок — 45');
});

test('SR5: схема — поля-ссылки закреплены REF_RE-паттерном, additionalProperties интактен', () => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(SKILLS_DIR, 'schema.json'), 'utf8'));
  const sec = schema.oneOf[1];
  assert.deepEqual(sec.properties.primary,
    { type: 'string', pattern: REF_RE.source },
    'secondary.primary — якорный паттерн ссылки (единый REF_RE)');
  assert.ok(!('enum' in sec.properties.primary),
    'primary: enum убран (ref-значение не проходит enum)');
  assert.deepEqual(sec.properties.requires.properties.skill,
    { type: 'string', pattern: REF_RE.source },
    'requires.skill — якорный паттерн ссылки (единый REF_RE)');
  assert.equal(schema.oneOf[0].additionalProperties, false,
    'oneOf[0] (primary): additionalProperties false');
  assert.equal(sec.additionalProperties, false,
    'oneOf[1] (secondary): additionalProperties false');
  assert.equal(sec.properties.requires.additionalProperties, false,
    'requires: additionalProperties false');
  assert.equal(sec.properties.effect.additionalProperties, false,
    'effect: additionalProperties false');
});

// SR6: tmp-фикстура — 1 primary + 2 secondary из реального каталога
// (000001 → 000002 без requires; 000003 с requires.skill на 000002),
// значения primary/requires.skill (id или ссылка в каталоге)
// заменены ссылками на файлы фикстуры.
function buildFixture(dir) {
  const src = ['000001.json', '000007.json', '000008.json'];
  const name = ['000001.json', '000002.json', '000003.json'];
  const data = src.map((f) => JSON.parse(
    fs.readFileSync(path.join(SKILLS_DIR, f), 'utf8')));
  assert.equal(data[0].type, 'primary', 'фикстура: 000001 — primary');
  assert.equal(data[1].type, 'secondary', 'фикстура: 000002 — secondary');
  assert.equal(data[2].type, 'secondary', 'фикстура: 000003 — secondary');
  assert.ok(data[2].requires, 'фикстура: 000003 имеет requires');
  const fileOf = new Map(data.map((d, i) => [d.id, src[i]]));
  const toFixtureRef = (target, where) => {
    const realFile = isRef(target)
      ? path.basename(target)
      : fileOf.get(target);
    const idx = src.indexOf(realFile);
    assert.ok(idx !== -1, `фикстура: ${where}-таргет в фикстуре`);
    return 'assets/skills/' + name[idx];
  };
  const dirOut = path.join(dir, 'assets', 'skills');
  fs.mkdirSync(dirOut, { recursive: true });
  data.forEach((d, i) => {
    if (d.type === 'secondary') {
      d.primary = toFixtureRef(d.primary, 'primary');
      assert.ok(isRef(d.primary), 'фикстура: primary — ссылка');
      if (d.requires) {
        d.requires.skill = toFixtureRef(d.requires.skill, 'requires.skill');
        assert.ok(isRef(d.requires.skill), 'фикстура: requires.skill — ссылка');
      }
    }
    fs.writeFileSync(path.join(dirOut, name[i]),
      JSON.stringify(d, null, 2) + '\n', 'utf8');
  });
  return {
    id0: data[0].id, id1: data[1].id, id2: data[2].id,
    level: data[2].requires.level,
  };
}

test('SR6: sync резолвит ссылки → зеркало в id-форме (tmp-фикстура)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-refs-sync-'));
  try {
    fs.mkdirSync(path.join(dir, 'scripts', 'lib'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'scripts', 'sync-skills-data.js'),
      path.join(dir, 'scripts', 'sync-skills-data.js'));
    for (const f of fs.readdirSync(path.join(ROOT, 'scripts', 'lib'))) {
      fs.copyFileSync(path.join(ROOT, 'scripts', 'lib', f),
        path.join(dir, 'scripts', 'lib', f));
    }
    const fx = buildFixture(dir);
    const r = spawnSync(process.execPath,
      [path.join(dir, 'scripts', 'sync-skills-data.js')],
      { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0,
      'sync над ref-формным каталогом → exit 0: ' +
      (r.stdout || '') + (r.stderr || ''));
    const mirror = require(path.join(dir, 'src', 'skills-data.js'));
    const a = mirror.SECONDARY_SKILLS[fx.id1];
    assert.ok(a, 'зеркало: навык ' + fx.id1);
    assert.equal(a.primary, fx.id0,
      'зеркало primary — id-форма (прежнее значение), не путь');
    assert.ok(!isRef(a.primary), 'зеркало primary — не ссылка');
    const b = mirror.SECONDARY_SKILLS[fx.id2];
    assert.ok(b, 'зеркало: навык ' + fx.id2);
    assert.equal(b.primary, fx.id0, 'зеркало primary — id-форма');
    assert.deepEqual(b.requires, { skill: fx.id1, level: fx.level },
      'зеркало requires.skill — id-форма, level не тронут');
    assert.ok(!isRef(b.requires.skill), 'зеркало requires.skill — не ссылка');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('SR7 (пин): sync-all --check на копии реального каталога — нет дрейфа', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-refs-pin-'));
  try {
    fs.mkdirSync(path.join(dir, 'scripts', 'lib'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'assets', 'skills'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'scripts', 'sync-skills-data.js'),
      path.join(dir, 'scripts', 'sync-skills-data.js'));
    for (const f of fs.readdirSync(path.join(ROOT, 'scripts', 'lib'))) {
      fs.copyFileSync(path.join(ROOT, 'scripts', 'lib', f),
        path.join(dir, 'scripts', 'lib', f));
    }
    for (const f of fs.readdirSync(SKILLS_DIR)) {
      fs.copyFileSync(path.join(SKILLS_DIR, f),
        path.join(dir, 'assets', 'skills', f));
    }
    fs.copyFileSync(path.join(ROOT, 'src', 'skills-data.js'),
      path.join(dir, 'src', 'skills-data.js'));
    git(dir, ['init', '-q']);
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-qm', 'base']);
    const r = runAll(dir, { check: true });
    assert.equal(r.code, 0,
      'нет дрейфа (зеркало id-форма): ' + r.output);
    assert.match(String(r.output), /синхронно/,
      '--check утверждает «синхронно»: ' + r.output);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('SR8: полумигрированный каталог (primary в id-форме) → sync hard-fail: exit 1, stderr «не ссылка», зеркало не записано', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-refs-negative-'));
  try {
    fs.mkdirSync(path.join(dir, 'scripts', 'lib'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'scripts', 'sync-skills-data.js'),
      path.join(dir, 'scripts', 'sync-skills-data.js'));
    for (const f of fs.readdirSync(path.join(ROOT, 'scripts', 'lib'))) {
      fs.copyFileSync(path.join(ROOT, 'scripts', 'lib', f),
        path.join(dir, 'scripts', 'lib', f));
    }
    const fx = buildFixture(dir);
    const semi = JSON.parse(fs.readFileSync(
      path.join(dir, 'assets', 'skills', '000002.json'), 'utf8'));
    semi.primary = fx.id0;
    fs.writeFileSync(path.join(dir, 'assets', 'skills', '000002.json'),
      JSON.stringify(semi, null, 2) + '\n', 'utf8');
    const r = spawnSync(process.execPath,
      [path.join(dir, 'scripts', 'sync-skills-data.js')],
      { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 1,
      'полумигрированный каталог → sync exit 1: ' +
      (r.stdout || '') + (r.stderr || ''));
    assert.match(String(r.stderr), /не ссылка/,
      'stderr — причина «не ссылка на файл каталога»: ' + (r.stderr || ''));
    assert.ok(!fs.existsSync(path.join(dir, 'src', 'skills-data.js')),
      'зеркало не записано (hard-fail до генерации)');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Задача 000384: канон порядка зеркала навыков (находка ретро-b23 П1).
//
// Регрессия мержа 000318.09: компаратор по data.id перефлипнул зеркало
// src/skills-data.js на алфавит, а src/ui-tab-skills.js итерирует зеркало
// без собственного sort ⇒ панель [I] «Навыки» пересортировалась видимо;
// src/player.js sanitizeSavedHero строил primary в порядке зеркала и
// разошёлся с PRIMARY_KEYS src/sheet.js (контракт 000031: «порядок создания
// героя = байты сейва»).
//
// Источник канона: ПОРЯДОК КЛЮЧЕЙ замороженного реестра
// tests/scripts/skills-num2id-000318.09.json — ключи 000001..000044 идут
// ровно в дизайн-порядке numeric-эпохи (основные Сила→Харизма; вторичные
// боевые→…→посох; школы protection, healing, ice, fire, nature_school,
// shadow). Реестр только читается (строки заморожены append-only; рост
// каталога вне реестра легален фолбэком «в конец по lex» — 000387).
//
// SO1 — экспорт PRIMARY_KEYS из sheet.js и его порядок;
// SO2 — байтовый round-trip primary сейва create→serialize→sanitize;
// SO3 — структурный: sanitizeSavedHero обходит PRIMARY_KEYS, не PRIMARY_SKILLS
//       (после починки зеркала поведенчески неотличим — ловит только этот зуб);
// SO4 — структурный: sync-skills-data.js читает канон из реестра;
// SO5 — sync без реестра → exit 1 (страж канона), с реестром → exit 0;
// SO6 — порядок записей зеркала ≡ канону (значения реестра, затем
//       вне-реестровые — хвост своей группы по lex; с 000387 вне-реестровые
//       id ЛЕГАЛЬНЫ и зуб ждёт их именно в хвосте, а не запрещает их).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SKILLS_DIR = path.join(ROOT, 'assets', 'skills');
const SYNC = path.join(ROOT, 'scripts', 'sync-skills-data.js');
const REGISTRY_REL = path.join('tests', 'scripts',
  'skills-num2id-000318.09.json');
const REGISTRY = path.join(ROOT, REGISTRY_REL);

const DESIGN = Object.values(JSON.parse(fs.readFileSync(REGISTRY, 'utf8')));
const MIRROR = require('../src/skills-data.js');
const typeById = new Map(
  fs.readdirSync(SKILLS_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'schema.json')
    .map((f) => {
      const d = JSON.parse(fs.readFileSync(path.join(SKILLS_DIR, f), 'utf8'));
      return [d.id, d.type];
    }));
// Канон порядка = компаратор sync-skills-data.js (000384): позиция в
// реестре, вне реестра — хвост по lex (механизм роста каталога, 000387).
// На базе, где реестр ≡ каталогу, совпадает с прежним DESIGN-фильтром.
const POS_SO = new Map(DESIGN.map((id, i) => [id, i]));
const designOf = (type) => [...typeById.keys()]
  .filter((id) => typeById.get(id) === type)
  .sort((a, b) => {
    const pa = POS_SO.has(a) ? POS_SO.get(a) : Infinity;
    const pb = POS_SO.has(b) ? POS_SO.get(b) : Infinity;
    if (pa !== pb) return pa < pb ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });

test('000384 SO1: sheet.js экспортирует PRIMARY_KEYS в дизайн-порядке (единый источник байтов сейва)', () => {
  const Sheet = require('../src/sheet.js');
  assert.ok(Array.isArray(Sheet.PRIMARY_KEYS),
    'src/sheet.js: экспорт PRIMARY_KEYS — единый источник порядка primary '
    + '(контракт 000031 «порядок создания героя = байты сейва»)');
  assert.deepEqual(Sheet.PRIMARY_KEYS, designOf('primary'),
    'PRIMARY_KEYS ≡ дизайн-порядок основных навыков (значения ключей '
    + 'замороженного реестра 000001..000006)');
});

test('000384 SO2: байтовый round-trip сейва — JSON.stringify(primary) после sanitizeSavedHero ≡ исходному', () => {
  const { createCharacter, sanitizeSavedHero } = require('../src/player.js');
  const c = createCharacter('Сейв-раунд');
  const before = JSON.stringify(c.primary);
  const back = sanitizeSavedHero(JSON.parse(JSON.stringify(c)));
  assert.ok(back, 'сейв восстановлен (не null)');
  assert.equal(JSON.stringify(back.primary), before,
    'порядок ключей primary в восстановленном сейве = порядку создателя '
    + '(sheet PRIMARY_KEYS), не алфавиту зеркала');
  assert.deepEqual(Object.keys(back.primary), designOf('primary'),
    'sanitizeSavedHero печатает дизайн-порядок основных навыков');
});

test('000384 SO3: структурный — sanitizeSavedHero обходит PRIMARY_KEYS (sheet.js), не массив PRIMARY_SKILLS зеркала', () => {
  const p = fs.readFileSync(path.join(ROOT, 'src', 'player.js'), 'utf8');
  const start = p.indexOf('function sanitizeSavedHero');
  assert.ok(start !== -1, 'src/player.js: функция sanitizeSavedHero найдена');
  const end = p.indexOf('\n  }\n', start);
  assert.ok(end !== -1, 'src/player.js: тело sanitizeSavedHero извлечено');
  const body = p.slice(start, end);
  assert.ok(body.includes('PRIMARY_KEYS'),
    'src/player.js: обход основных навыков — по единому источнику '
    + 'PRIMARY_KEYS из sheet.js (000384)');
  assert.ok(!body.includes('PRIMARY_SKILLS'),
    'src/player.js: sanitizeSavedHero не должен строить primary обходом '
    + 'PRIMARY_SKILLS — порядок зеркала ≠ канон сейва (000031)');
});

test('000384 SO4: структурный — sync-skills-data.js читает канон порядка из замороженного реестра', () => {
  const src = fs.readFileSync(SYNC, 'utf8');
  assert.ok(src.includes('skills-num2id-000318.09.json'),
    'scripts/sync-skills-data.js: компаратор обязан читать порядок ключей '
    + 'реестра (страж канона 000384 живёт в sync-скрипте)');
});

function makeSyncTree(dir, catalog, withRegistry) {
  fs.mkdirSync(path.join(dir, 'scripts', 'lib'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'assets', 'skills'), { recursive: true });
  fs.copyFileSync(SYNC, path.join(dir, 'scripts', 'sync-skills-data.js'));
  for (const f of fs.readdirSync(path.join(ROOT, 'scripts', 'lib'))) {
    fs.copyFileSync(path.join(ROOT, 'scripts', 'lib', f),
      path.join(dir, 'scripts', 'lib', f));
  }
  for (const [name, data] of Object.entries(catalog)) {
    fs.writeFileSync(path.join(dir, 'assets', 'skills', name),
      JSON.stringify(data, null, 2) + '\n', 'utf8');
  }
  if (withRegistry) {
    fs.mkdirSync(path.join(dir, 'tests', 'scripts'), { recursive: true });
    fs.copyFileSync(REGISTRY, path.join(dir, REGISTRY_REL));
  }
  return spawnSync(process.execPath,
    [path.join(dir, 'scripts', 'sync-skills-data.js')],
    { cwd: dir, encoding: 'utf8' });
}

const MIN_CATALOG = {
  'strength.json': {
    id: 'strength', type: 'primary', name: 'Сила', desc: 'd',
    combat: 'c', world: 'w',
  },
  'swordsman.json': {
    id: 'swordsman', type: 'secondary', name: 'Мечник',
    primary: 'assets/skills/strength.json',
    effect: { stat: 'x', perLevel: 0.05 }, effectType: 'Бой',
    desc: 'd', names: ['1', '2', '3', '4', '5', '6'],
  },
};

test('000384 SO5: sync без замороженного реестра — hard-fail exit 1; с копией реестра — exit 0', () => {
  const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-order-noreg-'));
  try {
    const r = makeSyncTree(dirA, MIN_CATALOG, false);
    assert.equal(r.status, 1,
      'sync без реестра → exit 1 (иначе компаратор тихо деградирует в lex '
      + '— ровно регрессия 000318.09): ' + (r.stdout || '') + (r.stderr || ''));
    assert.match(String(r.stderr), /skills-num2id-000318\.09\.json/,
      'stderr указывает отсутствующий канон: ' + (r.stderr || ''));
  } finally {
    fs.rmSync(dirA, { recursive: true, force: true });
  }
  const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-order-reg-'));
  try {
    const r = makeSyncTree(dirB, MIN_CATALOG, true);
    assert.equal(r.status, 0, 'sync с копией реестра → exit 0: '
      + (r.stdout || '') + (r.stderr || ''));
    const m = require(path.join(dirB, 'src', 'skills-data.js'));
    assert.deepEqual(m.PRIMARY_SKILLS.map((s) => s.id), ['strength'],
      'зеркало построено (primary из миникаталога)');
  } finally {
    fs.rmSync(dirB, { recursive: true, force: true });
  }
});

test('000384 SO6 (ре-пин 000387): зеркало — PRIMARY/ключи SECONDARY/SCHOOLS в каноне порядка (реестр + lex-хвост вне-реестровых); вне-реестровые id легальны и стоят в хвосте своей группы', () => {
  assert.deepEqual(MIRROR.PRIMARY_SKILLS.map((s) => s.id), designOf('primary'),
    'PRIMARY_SKILLS — канон порядка (сила, ловкость, телосложение, '
    + 'интеллект, мудрость, харизма; вне-реестровые — хвост по lex)');
  assert.deepEqual(Object.keys(MIRROR.SECONDARY_SKILLS), designOf('secondary'),
    'SECONDARY_SKILLS — ключи в каноне реестра (боевые вперёд, '
    + 'staff — последний реестровый, 000044; extras — после него по lex)');
  assert.deepEqual(MIRROR.SCHOOLS.map((s) => s.id), designOf('school'),
    'SCHOOLS — protection, healing, ice, fire, nature_school, shadow '
    + '(порядок 000301)');
  // 000387: свип инвертирован — «реестр ≡ каталогу» больше НЕ требование;
  // вне-реестровые id ЛЕГАЛЬНЫ (механизм роста) и обязаны стоять в ХВОСТЕ
  // своей группы по lex — ровно как их ставит компаратор (000384).
  const unregistered = [...typeById.keys()]
    .filter((id) => !POS_SO.has(id));
  for (const type of ['primary', 'secondary', 'school']) {
    const tail = unregistered.filter((id) => typeById.get(id) === type).sort();
    const group = designOf(type);
    assert.ok(group.length >= tail.length,
      'группа «' + type + '» короче своего lex-хвоста — внутренних '
      + 'непротиворечивых данных нет');
    assert.deepEqual(group.slice(group.length - tail.length), tail,
      'вне-реестровые id группы «' + type + '» обязаны идти ПОСЛЕДНИМИ'
      + ' по lex (фолбэк компаратора, механизм роста 000387); хвост:'
      + ' ' + tail.join(', ') + ', факт: ' + group.join(', '));
  }
});

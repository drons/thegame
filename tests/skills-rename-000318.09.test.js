// Задача 000318.09: CORE-rename файлов assets/skills из numeric-имён в <id>.json
// (шестая флипающаяся МИШЕНЬ цепочки 000318 после mobs .04 / spells .05 /
// buildings .06 / craft .07 / items .08; предусловие — 000318.11,
// инвариант basename == id цел с её коммита).
//
// ФАКТ ДИСКА базы (переснят на диске, НЕ по ТЗ): 44 файла; внутренние
// ссылки 32 primary + 14 requires.skill = 46; referrer'ы: craft 693 файла
// / 954 вхождения, mobs 27/27, buildings 18/34; spells/npc/dungeons/items/
// mob_groups — НОЛЬ skills-путей. Реестр «номер→id» заморожен в
// tests/scripts/skills-num2id-000318.09.json.
//
// После флипа ASSET_NAME_SHAPES.skills='slug' (npc — последняя number-
// ветка): REF_RE = slug-группа (items|skills|spells|mobs|mob_groups|
// buildings|craft|dungeons) + '|^assets\/npc\/\d{6}\.json$'; зеркало
// src/skills-data.js (ре-пин 000384): компаратор = ПОРЯДОК КЛЮЧЕЙ
// замороженного реестра (дизайн-порядок numeric-эпохи), а не lex по id —
// lex из .09 пересортировал панель [I] и байты сейва (ретро-b23 П1).
//
// T1  — ростер: 44 slug-файла, basename == id, numeric-имён нет, ≡ реестру.
// T2  — зеркало: PRIMARY/SCHOOLS/ключи SECONDARY в дизайн-порядке (= ключи
//       реестра, 000384), комментарии «// <id>.json», numeric-имён и
//       «нумерации» нет, шапка-ranges в slug-форме.
// T3  — REF_RE побайтово ≡ новому двухгруппному source (skills в slug-
//       группе по REF_LINKED_CATALOGS, number-ветка — ОДНА npc) + таблица
//       истинности + реестр шейпов (skills/npc, порядок 9 мишеней).
// T4  — схемы-носители ≡ живому REF_RE в том же коммите: skills/schema ×2,
//       dungeons/schema UNION ×4, одиночные паттерны mobs/craft/buildings
//       — slug-форма skills.
// T5  — referrer-свип: numeric-путей skills РОВНО 0; позитивно: 954/27/34
//       slug-путей в 693/27/18 файлах craft/mobs/buildings, счётчики ≡
//       снапшоту по номерам; spells/npc/dungeons/items/mob_groups — 0
//       skills-путей любого вида; внутренние 46 ссылок живы (32+14) и
//       резолвятся; probes — мультимножества basenames ≡ реестру (в т.ч.
//       «hide» — коллизия id навыка 000018 и предмета 000037).
// T6  — sync-skills-data.js: фильтр через живой реестр + schema.json
//       исключён, компаратор по позиции data.id в замороженном реестре
//       (ре-пин 000384), guard пустого каталога exit 1, numeric-фильтра/
//       «0000NN»/сортировки по имени файла нет.
// T7  — tmp-дерево (с копией реестра — sync читает канон порядка): regen
//       полного каталога побайтово ≡ закоммиченному зеркалу и идемпотентен;
//       компаратор наблюдаем (имена файлов и ids переставлены ПРОТИВОПОЛОЖНО
//       — зеркало по id; id вне реестра — фолбэк в хвост по lex).
// T8  — стражи 0-diff: чужие зеркала (items/spells/npc/craft/buildings) и
//       CHANGELOG побайтово ≡ HEAD; миграция skills — ТОЛЬКО пути
//       (данные каждого файла ≡ HEAD-версии после denorm по реестру).
// T9  — spec/skills-storage.md: 38 строк (пин spec-split цел), numeric-
//       путей и «нумерации» нет, формулировка «<id>.json».
// T10 — данные зеркала не изменились множеством: мультимножество записей
//       (id→содержимое) ≡ HEAD-зеркалу (изменился только ПОРЯДОК — 000384:
//       дизайн-порядок реестра; потребители порядка — дерево [I]/ключи
//       reprocessSkillXp, RNG-каналов skills-порядок не питает —
//       tests/spells.test.js сидам порядок skills не нужен).
// T11 — реестр tests/scripts/skills-num2id-000318.09.json: ключи подряд
//       000001..000044, значения уникальны ≡ множеству id (двусторонне),
//       disk-файл <value>.json несёт id == value, spot-строки.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SKILLS_DIR = path.join(ROOT, 'assets', 'skills');
const MIRROR = path.join(ROOT, 'src', 'skills-data.js');
const SYNC = path.join(ROOT, 'scripts', 'sync-skills-data.js');
const REGISTRY = path.join(ROOT, 'tests', 'scripts',
  'skills-num2id-000318.09.json');
const JR = require('../scripts/lib/json-ref.js');

const NUM_RE = /^\d{6}\.json$/;
const EXPECTED_COUNT = 44;

const registry = (() => {
  assert.ok(fs.existsSync(REGISTRY),
    'реестр tests/scripts/skills-num2id-000318.09.json обязан существовать '
    + '(замороженные пары «номер→id» факта диска до rename)');
  return JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
})();
const REG_VALUES = Object.values(registry);

// Снапшот referrer'ов по ФАКТУ ДИСКА базы 0c17f66b (ТЗ 344/28/19 — устарели;
// пересчёт: craft 693/954, mobs 27/27, buildings 18/34).
const REFCOUNT_00031809 = [
  ['craft', 693, 954],
  ['mobs', 27, 27],
  ['buildings', 18, 34],
];
const NO_SKILLS_PATHS_00031809 = ['spells', 'npc', 'dungeons', 'items',
  'mob_groups'];
// Probes (первые по сортировке файлы каждого referrer-каталога +hide-коллизия):
// мультимножество basenames numeric-ссылок HEAD → ожидаемые slug-имена.
const PROBES_00031809 = [
  ['craft/adobe_shield.json', ['000002']],
  ['craft/aegis_mantle.json', ['000027', '000018']],
  ['mobs/abomination.json', ['000035']],
  ['buildings/academy.json', ['000016', '000014']],
];

// Замороженный source «до 000318.09» (живой JR.REF_RE.source после флипа
// равен новому — анти-вакуум обязан читать замороженную строку).
const OLD_REF_RE_SOURCE =
  '^assets\\/(items|spells|mobs|mob_groups|buildings|craft|dungeons)'
  + '\\/[a-z][a-z0-9_]*\\.json$'
  + '|^assets\\/(skills|npc)\\/\\d{6}\\.json$';
const NEW_REF_RE_SOURCE =
  '^assets\\/(items|skills|spells|mobs|mob_groups|buildings|craft|dungeons)'
  + '\\/[a-z][a-z0-9_]*\\.json$'
  + '|^assets\\/(npc)\\/\\d{6}\\.json$';
// Канон UNION dungeons-схемы — number-ветка ПЕРВОЙ (порядок побайтово как
// печатал .08: (skills|npc)→(npc), slug-группа в REF_LINKED_CATALOGS).
const NEW_UNION = '^assets/((npc)/\\d{6}'
  + '|(items|skills|spells|mobs|mob_groups|buildings|craft|dungeons)'
  + '/[a-z][a-z0-9_]*)\\.json$';
const SKILL_SLUG_PAT = '^assets/skills/[a-z][a-z0-9_]*\\.json$';

function skillFilesAll() {
  return fs.readdirSync(SKILLS_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'schema.json')
    .sort();
}

function gitShow(rel) {
  return execFileSync('git', ['-C', ROOT, 'show', 'HEAD:' + rel],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

// denorm по реестру: numeric-путь → id; slug-путь → basename (≡ id).
function denormRefs(v) {
  if (typeof v === 'string') {
    const m = v.match(/^assets\/skills\/([a-z0-9_]+)\.json$/);
    return m ? (registry[m[1]] || m[1]) : v;
  }
  if (Array.isArray(v)) return v.map(denormRefs);
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = denormRefs(x);
    return o;
  }
  return v;
}

function refsIn(text) {
  return text.match(/assets\/skills\/[a-z0-9_]+\.json/g) || [];
}

test('000318.09 T1: ростер assets/skills — шейп slug, 44 файла, 0 numeric-имён, basename == id, id уникальны; ≡ реестру; schema.json ∈ slug-regex (guard исключения)', () => {
  const files = skillFilesAll();
  assert.equal(files.length, EXPECTED_COUNT,
    '44 файла каталога (факт: ' + files.length + ')');
  const numeric = files.filter((f) => NUM_RE.test(f));
  assert.deepEqual(numeric, [],
    'numeric-имён после rename остаться 0: ' + numeric.join(', '));
  for (const f of files) {
    assert.ok(JR.SHAPE_BASENAME_RES.slug.test(f),
      f + ': не slug-форма имени');
    const id = JSON.parse(
      fs.readFileSync(path.join(SKILLS_DIR, f), 'utf8')).id;
    assert.equal(f, id + '.json', f + ': basename != id');
  }
  const dup = files.filter((f, i) => files.indexOf(f) !== i);
  assert.deepEqual(dup, [], 'дублей имён нет');
  const ids = new Set(REG_VALUES);
  assert.equal(ids.size, EXPECTED_COUNT, 'реестр: 44 уникальных id');
  for (const num of Object.keys(registry)) {
    const id = registry[num];
    const p = path.join(SKILLS_DIR, id + '.json');
    assert.ok(fs.existsSync(p), 'реестр ' + num + ': нет ' + id + '.json');
    assert.equal(JSON.parse(fs.readFileSync(p, 'utf8')).id, id,
      id + '.json: id в файле ≠ реестру');
  }
  // schema.json легально проходит slug-regex — фильтрация каталога обязана
  // исключать его явно (конвенция .05/.08).
  assert.ok(JR.SHAPE_BASENAME_RES.slug.test('schema.json'),
    'schema.json совпадает с slug-regex (почему нужно явное исключение)');
});

test('000318.09 T2 (ре-пин 000384): зеркало src/skills-data.js — PRIMARY/SECONDARY-ключи/SCHOOLS в дизайн-порядке (= порядок ключей замороженного реестра), комментарии «// <id>.json», numeric-имён и «нумерации» нет, шапка-ranges в slug-форме', () => {
  const text = fs.readFileSync(MIRROR, 'utf8');
  assert.doesNotMatch(text, /\b\d{6}\.json\b/,
    'numeric-имён файлов в зеркале остаться 0');
  assert.doesNotMatch(text, /нумерация/);
  const M = require('../src/skills-data.js');
  const typeById = new Map(skillFilesAll().map((f) => {
    const d = JSON.parse(fs.readFileSync(path.join(SKILLS_DIR, f), 'utf8'));
    return [d.id, d.type];
  }));
  const design = (type) => REG_VALUES.filter((id) => typeById.get(id) === type);
  const pIds = design('primary');
  assert.deepEqual(M.PRIMARY_SKILLS.map((s) => s.id), pIds,
    'PRIMARY_SKILLS — дизайн-порядок (ключи реестра 000001..000006: '
    + 'сила→харизма), не алфавит (регрессия .09 снята 000384)');
  const sIds = design('secondary');
  assert.deepEqual(Object.keys(M.SECONDARY_SKILLS), sIds,
    'SECONDARY_SKILLS — ключи в дизайн-порядке реестра (staff — хвост)');
  const schIds = design('school');
  assert.deepEqual(M.SCHOOLS.map((s) => s.id), schIds,
    'SCHOOLS — дизайн-порядок реестра (protection…shadow ≡ порядок 000301)');
  for (const id of [...pIds, ...sIds, ...schIds]) {
    assert.ok(text.includes('// ' + id + '.json'),
      'комментарий-носитель «// ' + id + '.json» в зеркале');
  }
  const pin = (ids) => 'assets/skills/' + ids[0] + '.json … '
    + ids[ids.length - 1] + '.json';
  assert.ok(text.includes('Основные навыки (' + pin(pIds) + ')'),
    'шапка primary-ranges — slug endpoints дизайн-порядка (факт: '
    + text.match(/Основные навыки \([^)]*\)/)[0] + ')');
  assert.ok(text.includes('Вторичные навыки (' + pin(sIds) + ')'),
    'шапка secondary-ranges — slug endpoints дизайн-порядка');
  assert.ok(text.includes('Школы магии (' + pin(schIds) + ')'),
    'шапка schools-ranges — slug endpoints дизайн-порядка');
});

test('000318.09 T3: REF_RE — побайтовый пин НОВОГО source (skills в slug-группе по REF_LINKED_CATALOGS; number-ветка — ОДНА npc) + таблица истинности + реестр шейпов', () => {
  assert.notEqual(OLD_REF_RE_SOURCE, NEW_REF_RE_SOURCE,
    'анти-вакуум RED-фазы: старый source ≠ нового (флипа ещё не было?)');
  assert.equal(JR.REF_RE.source, NEW_REF_RE_SOURCE,
    'REF_RE.source побайтово ≡ новому двухгруппному литералу');
  for (const [p, want] of [
    ['assets/skills/strength.json', true],
    ['assets/skills/nature_school.json', true],
    ['assets/skills/' + '000001' + '.json', false],
    ['assets/skills/' + '000044' + '.json', false],
    ['assets/npc/000018.json', true],
    ['assets/items/wood_sword.json', true],
    ['assets/spells/spark.json', true],
    ['assets/mobs/abomination.json', true],
    ['assets/buildings/gymnasium.json', true],
    ['assets/craft/iron_sword.json', true],
    ['assets/dungeons/abyss.json', true],
    ['assets/runes/stone_hide.json', false],
  ]) {
    assert.equal(JR.isRef(p), want, 'isRef: ' + p);
    assert.equal(JR.REF_RE.test(p), want, 'REF_RE ≡ isRef: ' + p);
  }
  assert.equal(JR.ASSET_NAME_SHAPES.skills, 'slug',
    'skills — slug (переименован 000318.09)');
  assert.equal(JR.ASSET_NAME_SHAPES.npc, 'number',
    'npc — ПОСЛЕДНЯЯ number-ветка (не трогать)');
  assert.deepEqual([...JR.REF_LINKED_CATALOGS],
    ['items', 'skills', 'spells', 'mobs', 'mob_groups', 'buildings',
      'craft', 'dungeons', 'npc'],
    'REF_LINKED_CATALOGS — 9 мишеней в исходном порядке');
});

test('000318.09 T4: схемы-носители ≡ живому REF_RE.source — skills ×2; dungeons UNION ×4; одиночные паттерны mobs/craft/buildings — slug-форма skills', () => {
  const live = JR.REF_RE.source;
  const skills = JSON.parse(
    fs.readFileSync(path.join(SKILLS_DIR, 'schema.json'), 'utf8'));
  const secSkills = skills.oneOf[1];
  assert.equal(secSkills.properties.primary.pattern, live,
    'skills/schema.json: secondary.primary ≢ живому REF_RE.source');
  assert.equal(secSkills.properties.requires.properties.skill.pattern, live,
    'skills/schema.json: secondary.requires.skill ≢ живому REF_RE.source');
  const dungs = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'assets', 'dungeons', 'schema.json'), 'utf8'));
  for (const where of [['мобы', dungs.properties.мобы.items.pattern],
    ['предметы', dungs.properties.предметы.items.pattern],
    ['постройка', dungs.properties.постройка.pattern],
    ['руда.предмет',
      dungs.properties.руда.items.properties.предмет.pattern]]) {
    assert.equal(where[1], NEW_UNION,
      'dungeons/schema.json: «' + where[0] + '» — UNION не перезаписан '
      + 'под skills-slug (skills не в slug-ветке)');
  }
  const mobs = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'assets', 'mobs', 'schema.json'), 'utf8'));
  assert.equal(mobs.properties.skills.items.pattern, SKILL_SLUG_PAT,
    'mobs/schema.json: skills.items — не slug-паттерн skills');
  const craft = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'assets', 'craft', 'schema.json'), 'utf8'));
  assert.equal(craft.properties.навыки.items.pattern, SKILL_SLUG_PAT,
    'craft/schema.json: навыки.items — не slug-паттерн skills');
  const buildings = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'assets', 'buildings', 'schema.json'), 'utf8'));
  const train = findTrainPattern(buildings);
  assert.ok(train && train.items && train.items.pattern === SKILL_SLUG_PAT,
    'buildings/schema.json: тренирует — не slug-паттерн skills ('
    + JSON.stringify(train) + ')');
});

function findTrainPattern(node) {
  if (Array.isArray(node)) {
    for (const v of node) {
      const r = findTrainPattern(v);
      if (r) return r;
    }
    return null;
  }
  if (node && typeof node === 'object') {
    if (node.тренирует) return node.тренирует;
    for (const v of Object.values(node)) {
      const r = findTrainPattern(v);
      if (r) return r;
    }
  }
  return null;
}

test('000318.09 T5: referrer-свип — numeric-путей skills РОВНО 0; 954/27/34 slug-путей в 693/27/18 файлах craft/mobs/buildings ≡ снапшоту; spells/npc/dungeons/items/mob_groups — 0 skills-путей; probes ≡ реестру (включая «hide»-колизию); внутренние 46 ссылок живы', () => {
  let numTotal = 0;
  for (const dirName of ['assets', 'src', 'scripts', 'spec', 'tests']) {
    const walk = (d) => {
      for (const f of fs.readdirSync(d)) {
        if (f === '.git' || f === 'node_modules') continue;
        const p = path.join(d, f);
        if (fs.statSync(p).isDirectory()) { walk(p); continue; }
        if (!/\.(js|json|html|md)$/.test(f)) continue;
        const m = fs.readFileSync(p, 'utf8')
          .match(/assets\/skills\/\d{6}\.json/g);
        if (m) numTotal += m.length;
      }
    };
    walk(path.join(ROOT, dirName));
  }
  assert.equal(numTotal, 0,
    'гейт «assets/skills/ + цифра» = 0 по всему дереву (факт: '
    + numTotal + ')');
  for (const [cat, filesW, occW] of REFCOUNT_00031809) {
    const dir = path.join(ROOT, 'assets', cat);
    let occ = 0; let cf = 0;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json') || f === 'schema.json') continue;
      const m = refsIn(fs.readFileSync(path.join(dir, f), 'utf8'))
        .filter((r) => /^assets\/skills\/[a-z][a-z0-9_]*\.json$/.test(r));
      if (m.length) cf += 1;
      occ += m.length;
    }
    assert.deepEqual([cf, occ], [filesW, occW],
      'referrer ' + cat + ': файлы/вхождения ≡ снапшоту (факт ' + cf
      + '/' + occ + ', ждём ' + filesW + '/' + occW + ')');
  }
  for (const cat of NO_SKILLS_PATHS_00031809) {
    const dir = path.join(ROOT, 'assets', cat);
    let n = 0;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json') || f === 'schema.json') continue;
      n += refsIn(fs.readFileSync(path.join(dir, f), 'utf8')).length;
    }
    assert.equal(n, 0, cat + ': skills-путей в данных быть не должно');
  }
  for (const [rel, nums] of PROBES_00031809) {
    const text = fs.readFileSync(path.join(ROOT, 'assets', rel), 'utf8');
    const got = refsIn(text)
      .map((r) => path.basename(r, '.json')).sort();
    assert.deepEqual(got, nums.map((n) => registry[n]).sort(),
      rel + ': мультимножество skills-ссылок ≡ HEAD-номерам через реестр');
    for (const r of refsIn(text)) {
      assert.ok(JR.resolveRef(ROOT, r).ok, rel + ': «' + r + '» не резолвится');
    }
  }
  let prim = 0; let req = 0;
  for (const f of skillFilesAll()) {
    const data = JSON.parse(
      fs.readFileSync(path.join(SKILLS_DIR, f), 'utf8'));
    for (const { path: where, ref } of JR.collectRefs(data)) {
      if (where === 'primary') prim += 1;
      else if (where === 'requires.skill') req += 1;
      assert.ok(JR.resolveRef(ROOT, ref).ok,
        f + ': ' + where + ' «' + ref + '» не резолвится');
    }
  }
  assert.equal(prim, 32, 'primary-ссылок 32 (000337: +1 staff)');
  assert.equal(req, 14, 'requires.skill-ссылок 14');
});

test('000318.09 T6 (ре-пин 000384): sync-skills-data.js — живой реестр в фильтре, schema.json исключён, компаратор по позиции data.id в замороженном реестре, guard пустого каталога; numeric-фильтра, «0000NN» и сортировки по имени файла нет', () => {
  const src = fs.readFileSync(SYNC, 'utf8');
  assert.match(src, /SHAPE_BASENAME_RES\[ASSET_NAME_SHAPES\.skills\]/,
    'фильтр каталога — через живой реестр шейпов');
  assert.match(src, /!== 'schema\.json'/,
    'schema.json исключён из фильтра явным условием');
  assert.match(src, /data\.id/,
    'компаратор сортировки — по data.id (не по имени файла — урок .07)');
  assert.match(src, /skills-num2id-000318\.09\.json/,
    'канон порядка — замороженный реестр «номер→id» (000384: дизайн-порядок, '
    + 'не lex по id)');
  assert.doesNotMatch(src, /\\d\{6\}/,
    'numeric-регулярки в sync остаться не должно');
  assert.doesNotMatch(src, /0000NN/,
    'текстов «0000NN» в sync остаться не должно');
  assert.match(src, /exit\(1\)/, 'guard пустого каталога — exit 1');
});

function runSyncOn(catalogFiles, dir) {
  fs.mkdirSync(path.join(dir, 'scripts', 'lib'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'assets', 'skills'), { recursive: true });
  fs.copyFileSync(SYNC, path.join(dir, 'scripts', 'sync-skills-data.js'));
  for (const f of fs.readdirSync(path.join(ROOT, 'scripts', 'lib'))) {
    fs.copyFileSync(path.join(ROOT, 'scripts', 'lib', f),
      path.join(dir, 'scripts', 'lib', f));
  }
  // 000384: sync читает канон порядка из замороженного реестра — без него
  // hard-fail (страж), поэтому tmp-дерево обязано возить его копию.
  fs.mkdirSync(path.join(dir, 'tests', 'scripts'), { recursive: true });
  fs.copyFileSync(REGISTRY, path.join(dir, 'tests', 'scripts',
    'skills-num2id-000318.09.json'));
  for (const [name, content] of catalogFiles) {
    fs.writeFileSync(path.join(dir, 'assets', 'skills', name), content);
  }
  return spawnSync(process.execPath,
    [path.join(dir, 'scripts', 'sync-skills-data.js')],
    { cwd: dir, encoding: 'utf8' });
}

test('000318.09 T7 (ре-пин 000384): tmp-дерево с реестром — regen полного каталога побайтово ≡ закоммиченному зеркалу и идемпотентен; компаратор наблюдаем (имя файла ≠ позиция в реестре; id вне реестра — хвост по lex)', () => {
  const committed = fs.readFileSync(MIRROR, 'utf8');
  const full = fs.readdirSync(SKILLS_DIR)
    .map((f) => [f, fs.readFileSync(path.join(SKILLS_DIR, f), 'utf8')]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-rename-regen-'));
  try {
    const r1 = runSyncOn(full, dir);
    assert.equal(r1.status, 0, 'regen полного каталога → exit 0: '
      + (r1.stdout || '') + (r1.stderr || ''));
    assert.equal(fs.readFileSync(path.join(dir, 'src', 'skills-data.js'),
      'utf8'), committed,
      'regen побайтово ≡ закоммиченному зеркалу (0 дрейфа)');
    const r2 = runSyncOn(full, dir);
    assert.equal(r2.status, 0);
    assert.equal(fs.readFileSync(path.join(dir, 'src', 'skills-data.js'),
      'utf8'), committed, 'идемпотентность');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const min = [
    ['zeta.json', JSON.stringify({
      id: 'alpha', type: 'primary', name: 'А', desc: 'd', combat: 'c',
      world: 'w',
    }, null, 2) + '\n'],
    ['alpha.json', JSON.stringify({
      id: 'zeta', type: 'primary', name: 'Б', desc: 'd', combat: 'c',
      world: 'w',
    }, null, 2) + '\n'],
    ['mid.json', JSON.stringify({
      id: 'mid', type: 'secondary', name: 'В',
      primary: 'assets/skills/zeta.json',
      effect: { stat: 'x', perLevel: 0.05 }, effectType: 'Бой',
      desc: 'd', names: ['1', '2', '3', '4', '5', '6'],
    }, null, 2) + '\n'],
  ];
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-rename-cmp-'));
  try {
    const r = runSyncOn(min, dir2);
    assert.equal(r.status, 0, 'mini-каталог → exit 0: '
      + (r.stdout || '') + (r.stderr || ''));
    const m = require(path.join(dir2, 'src', 'skills-data.js'));
    assert.deepEqual(m.PRIMARY_SKILLS.map((s) => s.id), ['alpha', 'zeta'],
      'id вне реестра — фолбэк «в хвост по lex» (000384): сравнение по '
      + 'data.id, а не по имени файла');
  } finally {
    fs.rmSync(dir2, { recursive: true, force: true });
  }
});

test('000318.09 T8: стражи 0-diff — чужие зеркала и CHANGELOG побайтово ≡ HEAD; миграция skills — только пути (данные каждого файла ≡ HEAD после denorm)', () => {
  for (const rel of ['src/items-data.js', 'src/spells-data.js',
    'src/npc-data.js', 'src/craft-data.js', 'src/dungeons-data.js',
    'CHANGELOG.md', 'index.html']) {
    assert.equal(fs.readFileSync(path.join(ROOT, rel), 'utf8'),
      gitShow(rel), rel + ': побайтово ≡ HEAD');
  }
  for (const num of Object.keys(registry)) {
    const id = registry[num];
    const p = path.join(SKILLS_DIR, id + '.json');
    assert.ok(fs.existsSync(p), 'миграция: нет ' + id + '.json');
    const raw = fs.readFileSync(p, 'utf8');
    const d = JSON.parse(raw);
    assert.equal(raw, JSON.stringify(d, null, 2) + '\n',
      id + '.json: roundtrip-канон JSON.stringify(obj,null,2)+\\n цел');
    assert.equal(d.id, id, id + '.json: id == basename');
    assert.doesNotMatch(raw, /\d{6}\.json/,
      id + '.json: numeric-ссылки внутри быть не должно');
  }
});

test('000318.09 T9: spec/skills-storage.md — 38 строк (line-neutral, пин spec-split цел), numeric-путей и «нумерации» нет, формулировка «<id>.json»', () => {
  const p = path.join(ROOT, 'spec', 'skills-storage.md');
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  assert.equal(lines.length, 38,
    'spec/skills-storage.md остаётся 38 строк (SPEC_FILE_LINES пин)');
  const specSplit = fs.readFileSync(
    path.join(ROOT, 'tests', 'spec-split.test.js'), 'utf8');
  assert.ok(specSplit.includes('"skills-storage.md": 38'),
    'пин SPEC_FILE_LINES skills-storage.md=38 в spec-split цел');
  const text = lines.join('\n');
  assert.doesNotMatch(text, /assets\/skills\/\d/,
    'numeric-путей skills в спеке остаться 0');
  assert.doesNotMatch(text, /нумерация/);
  assert.match(text, /<id>\.json/,
    'формулировка имени файла — «<id>.json»');
});

test('000318.09 T10 (ре-пин 000384): данные зеркала ≡ HEAD-зеркалу МНОЖЕСТВОМ (изменился только порядок — 000384: дизайн-порядок реестра; потребители по id/ключам intact)', () => {
  const headText = gitShow('src/skills-data.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-rename-head-'));
  try {
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'skills-data.js'), headText);
    const H = require(path.join(dir, 'src', 'skills-data.js'));
    const M = require('../src/skills-data.js');
    const norm = (x) => JSON.stringify(x);
    const byId = (arr) => [...arr].sort((a, b) => (a.id < b.id ? -1 : 1));
    assert.deepEqual(byId(M.PRIMARY_SKILLS), byId(H.PRIMARY_SKILLS),
      'PRIMARY — то же мультимножество записей');
    assert.deepEqual(Object.keys(M.SECONDARY_SKILLS).sort(),
      Object.keys(H.SECONDARY_SKILLS).sort(),
      'SECONDARY — тот же набор ключей');
    for (const k of Object.keys(H.SECONDARY_SKILLS)) {
      assert.equal(norm(M.SECONDARY_SKILLS[k]), norm(H.SECONDARY_SKILLS[k]),
        'SECONDARY.' + k + ': запись бит-в-бит ≡ HEAD');
    }
    assert.deepEqual(byId(M.SCHOOLS), byId(H.SCHOOLS),
      'SCHOOLS — то же мультимножество записей');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('000318.09 T11: реестр tests/scripts/skills-num2id-000318.09.json — ключи подряд 000001..000044, значения уникальны и ≡ множеству id каталога (двусторонне), spot-строки', () => {
  const keys = Object.keys(registry).sort();
  assert.equal(keys.length, EXPECTED_COUNT, '44 пары');
  assert.deepEqual(keys,
    Array.from({ length: EXPECTED_COUNT },
      (_, i) => String(i + 1).padStart(6, '0')),
    'ключи подряд 000001..000044 без дыр и дублей');
  assert.equal(new Set(REG_VALUES).size, EXPECTED_COUNT,
    'значения уникальны');
  const diskIds = skillFilesAll().map((f) => JSON.parse(
    fs.readFileSync(path.join(SKILLS_DIR, f), 'utf8')).id).sort();
  assert.deepEqual([...REG_VALUES].sort(), diskIds,
    'множество id реестра ≡ множеству id каталога (двусторонне)');
  assert.equal(registry['000001'], 'strength', 'spot 000001');
  assert.equal(registry['000018'], 'hide', 'spot 000018 (коллизия id с предметом hide)');
  assert.equal(registry['000042'], 'nature_school', 'spot 000042 (000318.11)');
  assert.equal(registry['000044'], 'staff', 'spot 000044 (000337)');
});

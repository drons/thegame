// Задача 000318.09: CORE-rename файлов assets/skills из numeric-имён в <id>.json
// (шестая флипающаяся МИШЕНЬ цепочки 000318 после mobs .04 / spells .05 /
// buildings .06 / craft .07 / items .08; предусловие — 000318.11,
// инвариант basename == id цел с её коммита).
//
// ФАКТ ДИСКА базы rename (переснят на диске, НЕ по ТЗ): 44 файла (= длина
// замороженного префикса реестра, нижняя граница зубов 000387, НЕ литерал);
// внутренние ссылки 32 primary + 14 requires.skill = 46; referrer'ы: craft
// 693 файла / 954 вхождения, mobs 27/27, buildings 18/34; spells/npc/
// dungeons/items/mob_groups — НОЛЬ skills-путей. Реестр «номер→id» —
// замороженный префикс в tests/scripts/skills-num2id-000318.09.json:
// строки append-only против HEAD, длина живая; рост каталога без строки
// реестра легален фолбэком компаратора «в хвост по lex» (000384/000387,
// контракт — memory/000387-frozen-prefix-contract.md).
//
// После флипа ASSET_NAME_SHAPES.skills='slug' (npc — последняя number-
// ветка): REF_RE = slug-группа (items|skills|spells|mobs|mob_groups|
// buildings|craft|dungeons) + '|^assets\/npc\/\d{6}\.json$'; зеркало
// src/skills-data.js (ре-пин 000384): компаратор = ПОРЯДОК КЛЮЧЕЙ
// замороженного реестра (дизайн-порядок numeric-эпохи), а не lex по id —
// lex из .09 пересортировал панель [I] и байты сейва (ретро-b23 П1).
//
// T1  — ростер: slug-файлов ≥ границы rename (реестр ⊆ каталога, число не
//       пинуется — 000387), basename == id, numeric-имён нет.
// T2  — зеркало: PRIMARY/SCHOOLS/ключи SECONDARY в каноне порядка (= ключи
//       реестра, затем вне-реестровые по lex — 000384/000387), комментарии
//       «// <id>.json», numeric-имён и «нумерации» нет, шапка-ranges в
//       slug-форме.
// T3  — REF_RE побайтово ≡ новому двухгруппному source (skills в slug-
//       группе по REF_LINKED_CATALOGS, number-ветка — ОДНА npc) + таблица
//       истинности + реестр шейпов (skills/npc, порядок 9 мишеней).
// T4  — схемы-носители ≡ живому REF_RE в том же коммите: skills/schema ×2,
//       dungeons/schema UNION ×4, одиночные паттерны mobs/craft/buildings
//       — slug-форма skills.
// T5  — referrer-свип: numeric-путей skills РОВНО 0; позитивно: slug-пути
//       в craft/mobs/buildings — монотонные НИЖНИЕ поля MIN_* (факт базы
//       rename 693/954, 27/27, 18/34 — история; точные снапшоты сняты
//       000387, легитимный рост не красит); spells/npc/dungeons/items/
//       mob_groups — 0 skills-путей любого вида; внутренние ссылки ≥32
//       primary + ≥14 requires.skill резолвятся; probes — мультимножества
//       basenames ≡ реестру (в т.ч. «hide» — коллизия id навыка 000018 и
//       предмета 000037).
// T6  — sync-skills-data.js: фильтр через живой реестр + schema.json
//       исключён, компаратор по позиции data.id в замороженном реестре
//       (ре-пин 000384), guard пустого каталога exit 1, numeric-фильтра/
//       «0000NN»/сортировки по имени файла нет.
// T7  — tmp-дерево (с копией реестра — sync читает канон порядка): regen
//       полного каталога побайтово ≡ закоммиченному зеркалу и идемпотентен;
//       компаратор наблюдаем (имена файлов и ids переставлены ПРОТИВОПОЛОЖНО
//       — зеркало по id; id вне реестра — фолбэк в хвост по lex).
// T8  — миграционные данные: ТОЛЬКО пути (roundtrip/id/numeric каждого
//       файла после denorm по реестру); HEAD-сверка чужих зеркал снята
//       000395 — их кроет живой tmp-реген-свип items-rename T8 (строже
//       HEAD: легальная регенерация зелена ДО коммита, дрейф красен
//       навсегда); HEAD-сверка CHANGELOG/index.html (hand-файлы без
//       regen-источника) убрана — она красила легитимные документ-волны,
//       структура CHANGELOG сторожится changelog-day-structure.
// T9  — spec/skills-storage.md: 38 строк (пин spec-split цел), numeric-
//       путей и «нумерации» нет, формулировка «<id>.json».
// T10 — данные зеркала ≡ побайтовому РЕГЕНУ sync-skills-data.js из
//       ТЕКУЩЕГО каталога в tmp (перенос 000395 с HEAD-множества 000384:
//       реген даёт канон порядка, побайтовая форма строже; анти-вакуум
//       переноса — «000395 T1» этого файла).
// T11 — реестр tests/scripts/skills-num2id-000318.09.json: APPEND-ONLY
//       против HEAD (000387: заморожены СТРОКИ, а не длина), ключи —
//       префикс 000001..N (N живой, ≥ границы rename), значения уникальны,
//       реестр ⊆ множеству id каталога (двусторонняя bijection снята
//       000387), disk-файл <value>.json несёт id == value, spot-строки.
// T12 — SELF-GATE (000387, формат 000375/000379): в исходнике этого файла
//       нет замороженного живого счётчика каталога — ни имени-константы,
//       ни assert.equal(<…length|size>, <литерал>) (кроме line-пинов
//       документов через split()); positive-маркеры живой механики на месте
//       (с 000396 — и паттерн декларации hex-литерала digest-пина).
// 000396 T1 — ПОСТОЯННЫЙ digest-зуб замороженного префикса (перенос
//       000392/T13 на skills-плечо): sha256 канонической сериализации
//       первых FROZEN_PREFIX_END_I09 пар num→id реестра ≡ неизменному
//       литералу FROZEN_PREFIX_DIGEST_SHA256_I09. В отличие от HEAD-зуба
//       T11 красен и ПОСЛЕ коммита пере-нумерации; легальный append в хвост
//       литерал не двигает.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const SKILLS_DIR = path.join(ROOT, 'assets', 'skills');
const MIRROR = path.join(ROOT, 'src', 'skills-data.js');
const SYNC = path.join(ROOT, 'scripts', 'sync-skills-data.js');
const REGISTRY = path.join(ROOT, 'tests', 'scripts',
  'skills-num2id-000318.09.json');
const JR = require('../scripts/lib/json-ref.js');

const NUM_RE = /^\d{6}\.json$/;

// Ростер: ЖИВОЙ счётчик (задача 000387 — тройка «замороженный реестр ≡
// живые зубы ≡ рост каталога» развязана в пользу роста; перенос 000379).
// Литерала, равного живому числу каталога, в этом файле БОЛЬШЕ НЕТ (self-gate
// T12 не даст его вернуть): состав сверяется МЕЖДУ дисковыми источниками
// (реестр ⊆ каталог, basename == id, уникальность id), а вниз ограничен
// монотонной границей FROZEN_PREFIX_END_I09 — 44 пары реестра на базе
// rename 0c17f66b (дальше каталог может только расти; вне-реестровые id —
// законный хвост по lex, механизм 000384).
const FROZEN_PREFIX_END_I09 = 44;
const REGISTRY_REL_I09 = 'tests/scripts/skills-num2id-000318.09.json';

// Реестр APPEND-ONLY относительно HEAD — выполнимая форма «замороженности»
// (000387, port LEDGER_APPEND_ONLY_I08 из 000379): заморожены СТРОКИ
// (запрет пере-нумерации и удаления), длина ЖИВАЯ. Возвращает список
// нарушений (пустой список = контракт выполнен).
function LEDGER_APPEND_ONLY_I09() {
  const before = JSON.parse(execFileSync('git',
    ['-C', ROOT, 'show', 'HEAD:' + REGISTRY_REL_I09],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  const now = registry;
  const bad = [];
  for (const num of Object.keys(before)) {
    if (now[num] === undefined) {
      bad.push(num + ' → «' + before[num] + '» — СТРОКА УДАЛЕНА');
    } else if (now[num] !== before[num]) {
      bad.push(num + ': HEAD «' + before[num] + '» → диск «' + now[num]
        + '» — строка ПЕРЕПИСАНА');
    }
  }
  return bad;
}

const registry = (() => {
  assert.ok(fs.existsSync(REGISTRY),
    'реестр tests/scripts/skills-num2id-000318.09.json обязан существовать '
    + '(замороженные пары «номер→id» факта диска до rename)');
  return JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
})();
const REG_VALUES = Object.values(registry);

// Постоянный (НЕ HEAD-относительный) пин первых FROZEN_PREFIX_END_I09 пар
// num→id — задача 000396 (перенос digest-паттерна 000392 с items-плеча):
// HEAD-зуб T11 транзиентен (закоммиченная пере-нумерация префикса становится
// новой нормой `git show HEAD:…` и съедает доказательство — дефект F1
// ретро-b24), digest-зуб «000396 T1» красен навсегда. Каноническая
// сериализация — JSON.stringify(Object.keys(r).slice(0, N).map(k => [k,
// r[k]])) при N = FROZEN_PREFIX_END_I09; порядок ключей = порядок строк в
// файле (все ключи с ведущими нулями — НЕ integer-index ⇒ insertion order),
// поэтому дописка строки в конец литерал не двигает, а вставка в середину
// файла красит его — сознательное следствие формулы (как у items). Литерал
// снят диском на 67357db4: реестр этой базы содержит ровно
// FROZEN_PREFIX_END_I09 строк (файл не рос с момента rename 5c978b06), то
// есть граница префикса совпадает с длиной; при законном append хвоста
// литерал остаётся прежним. Пересчёт литерала допустим ТОЛЬКО при инциденте
// F1 в мастере и по эскалации оркестратору, не молча.
const FROZEN_PREFIX_DIGEST_SHA256_I09 =
  'd04a5d80fecc74ec4b45de26024a096d7246e537858717ea81ee787282760d88';

function FROZEN_PREFIX_DIGEST_I09() {
  const pairs = Object.keys(registry).slice(0, FROZEN_PREFIX_END_I09)
    .map((k) => [k, registry[k]]);
  return createHash('sha256').update(JSON.stringify(pairs)).digest('hex');
}

// Монотонные НИЖНИЕ границы referrer-свипа вместо точных снапшотов
// (000387, прецедент .379 T5). ФАКТ ДИСКА базы rename 0c17f66b (ТЗ
// 344/28/19 — устарели; пересчёт: craft 693/954, mobs 27/27, buildings
// 18/34) остаётся здесь историей: каждая skills/loot-волна легитимно
// добавляет ссылки, точный снапшот красил бы skills-rename по корректной
// причине. Запас ниже факта: массовую ПОТЕРЮ ссылок ловим, рост — нет.
const MIN_REFCOUNT_00031809 = [
  ['craft', 660, 900],
  ['mobs', 25, 25],
  ['buildings', 17, 33],
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

test('000318.09 T1 (ре-пин 000387): ростер assets/skills — шейп slug, живой рост (каталог ⊇ замороженного префикса реестра, число не пинуется), 0 numeric-имён, basename == id, id уникальны; реестр ⊆ каталога; schema.json ∈ slug-regex (guard исключения)', () => {
  const files = skillFilesAll();
  assert.ok(files.length >= FROZEN_PREFIX_END_I09,
    'файлов каталога не меньше границы rename (' + FROZEN_PREFIX_END_I09
    + '); факт: ' + files.length + ' — монотонный ПОЛ, не литерал: рост'
    + ' каталога волнами легален без строки реестра (фолбэк «в хвост по'
    + ' lex», 000384); рецепт — memory/000387-frozen-prefix-contract.md');
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
  assert.equal(ids.size, REG_VALUES.length,
    'реестр: значения уникальны (живая сверка множества с длиной, не'
    + ' литерал; длина реестра — живой счётчик, строки append-only — T11)');
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

const POS_I09 = new Map(REG_VALUES.map((id, i) => [id, i]));

// Та же семантика, что у компаратора scripts/sync-skills-data.js (000384):
// позиция в замороженном реестре, вне реестра — хвост по lex (механизм
// роста 000387). Строится ПОЛНЫМ каталогом: extras получают тип из файла.
function byCanonI09(ids) {
  return [...ids].sort((a, b) => {
    const pa = POS_I09.has(a) ? POS_I09.get(a) : Infinity;
    const pb = POS_I09.has(b) ? POS_I09.get(b) : Infinity;
    if (pa !== pb) return pa < pb ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

test('000318.09 T2 (ре-пин 000384/000387): зеркало src/skills-data.js — PRIMARY/SECONDARY-ключи/SCHOOLS в каноне порядка (= порядок ключей замороженного реестра, затем вне-реестровые по lex), комментарии «// <id>.json», numeric-имён и «нумерации» нет, шапка-ranges в slug-форме', () => {
  const text = fs.readFileSync(MIRROR, 'utf8');
  assert.doesNotMatch(text, /\b\d{6}\.json\b/,
    'numeric-имён файлов в зеркале остаться 0');
  assert.doesNotMatch(text, /нумерация/);
  const M = require('../src/skills-data.js');
  const typeById = new Map(skillFilesAll().map((f) => {
    const d = JSON.parse(fs.readFileSync(path.join(SKILLS_DIR, f), 'utf8'));
    return [d.id, d.type];
  }));
  const design = (type) => byCanonI09([...typeById.keys()]
    .filter((id) => typeById.get(id) === type));
  const pIds = design('primary');
  assert.deepEqual(M.PRIMARY_SKILLS.map((s) => s.id), pIds,
    'PRIMARY_SKILLS — канон порядка (ключи реестра 000001..000006: '
    + 'сила→харизма; вне-реестровые — хвост по lex), не алфавит '
    + '(регрессия .09 снята 000384; рост легален с 000387)');
  const sIds = design('secondary');
  assert.deepEqual(Object.keys(M.SECONDARY_SKILLS), sIds,
    'SECONDARY_SKILLS — ключи в каноне порядка реестра (staff — хвост '
    + 'реестровой части; вне-реестровые — после неё по lex)');
  const schIds = design('school');
  assert.deepEqual(M.SCHOOLS.map((s) => s.id), schIds,
    'SCHOOLS — канон порядка реестра (protection…shadow ≡ порядок 000301)');
  for (const id of [...pIds, ...sIds, ...schIds]) {
    assert.ok(text.includes('// ' + id + '.json'),
      'комментарий-носитель «// ' + id + '.json» в зеркале');
  }
  const pin = (ids) => 'assets/skills/' + ids[0] + '.json … '
    + ids[ids.length - 1] + '.json';
  const capOf = (re) => {
    const m = text.match(re);
    return m ? m[0] : 'ШАПКА НЕ НАЙДЕНА';
  };
  assert.ok(text.includes('Основные навыки (' + pin(pIds) + ')'),
    'шапка primary-ranges — slug endpoints канона порядка (факт: '
    + capOf(/Основные навыки \([^)]*\)/) + ')');
  assert.ok(text.includes('Вторичные навыки (' + pin(sIds) + ')'),
    'шапка secondary-ranges — slug endpoints канона порядка (факт: '
    + capOf(/Вторичные навыки \([^)]*\)/) + ')');
  assert.ok(text.includes('Школы магии (' + pin(schIds) + ')'),
    'шапка schools-ranges — slug endpoints канона порядка (факт: '
    + capOf(/Школы магии \([^)]*\)/) + ')');
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

test('000318.09 T5 (ре-пин 000387): referrer-свип — numeric-путей skills РОВНО 0; slug-пути craft/mobs/buildings — монотонные поля MIN_* (факт rename 693/954, 27/27, 18/34 — история); spells/npc/dungeons/items/mob_groups — 0 skills-путей; probes ≡ реестру (включая «hide»-колизию); внутренние ≥32 primary + ≥14 requires.skill живы', () => {
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
  for (const [cat, minFiles, minOcc] of MIN_REFCOUNT_00031809) {
    const dir = path.join(ROOT, 'assets', cat);
    let occ = 0; let cf = 0;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json') || f === 'schema.json') continue;
      const m = refsIn(fs.readFileSync(path.join(dir, f), 'utf8'))
        .filter((r) => /^assets\/skills\/[a-z][a-z0-9_]*\.json$/.test(r));
      if (m.length) cf += 1;
      occ += m.length;
    }
    assert.ok(cf >= minFiles && occ >= minOcc,
      'referrer ' + cat + ': файлы/вхождения ниже поля MIN_* (факт ' + cf
      + '/' + occ + ', пол ' + minFiles + '/' + minOcc + ') — массовая'
      + ' потеря skills-ссылок (000387: точные снапшоты сняты, легитимный'
      + ' рост волн не красит, потеря — красит)');
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
    assert.ok(nums.length > 0 && got.length > 0,
      rel + ': анти-вакуум probe — ни ссылок, ни ожидания пусты быть не'
      + ' может (иначе deepEqual ниже — фиктивная проверка)');
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
  assert.ok(prim >= 32,
    'primary-ссылок не меньше 32 (факт rename: 32, из них +1 staff от 000337;'
    + ' 000387: рост легален, потеря — красная)');
  assert.ok(req >= 14,
    'requires.skill-ссылок не меньше 14 (факт rename; пол, не литерал)');
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

test('000318.09 T8 (миграция 000395): миграционные данные — ТОЛЬКО пути (roundtrip-канон/id==basename/0 numeric-ссылок каждого файла после denorm по реестру); прежняя HEAD-сверка чужих зеркал (items/spells/npc/craft/dungeons) снята — её заменяет ЖИВОЙ tmp-реген-свип items-rename T8 (≡ регену из текущего assets — строже HEAD: легальная регенерация зелена ДО коммита, закоммиченный дрейф красен навсегда), HEAD-сверка hand-файлов CHANGELOG.md/index.html убрана вовсе (regen-источника нет; зуб красил легитимные документ-волны ещё ДО их коммита; структура CHANGELOG — changelog-day-structure)', () => {
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
  const specText = fs.readFileSync(p, 'utf8');
  const lines = specText.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  assert.equal(String(lines.join('\n')).split('\n').length, 38,
    'spec/skills-storage.md остаётся 38 строк (SPEC_FILE_LINES пин;'
    + ' line-neutral, пин spec-split цел — док-пин, не счётчик каталога,'
    + ' форма со split( легализована фильтром self-gate T12)');
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

test('000318.09 T10 (ре-пин 000384, миграция 000395): данные зеркала ≡ побайтовому РЕГЕНУ sync-skills-data.js из ТЕКУЩЕГО каталога в tmp (полный каталог через runSyncOn, идемпотентно) + записи/ключи модуля ≡ модулю регена (HEAD-множество снято: побайтовая форма строже, реген даёт канон порядка 000384; потребители по id/ключам intact)', () => {
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
      'src/skills-data.js ≢ побайтовому регену из ТЕКУЩЕГО assets/skills '
      + '(tmp-запуск sync-skills-data.js; 000395 вместо сверки с HEAD-зеркалом:'
      + ' легальная регенерация зелена уже ДО коммита, закоммиченный дрейф'
      + ' красен навсегда — HEAD-сверка на нём тавтологична)');
    const r2 = runSyncOn(full, dir);
    assert.equal(r2.status, 0, 'повторный tmp-реген → exit 0: '
      + (r2.stdout || '') + (r2.stderr || ''));
    assert.equal(fs.readFileSync(path.join(dir, 'src', 'skills-data.js'),
      'utf8'), committed, 'идемпотентность tmp-регена');
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
        'SECONDARY.' + k + ': запись бит-в-бит ≡ регену');
    }
    assert.deepEqual(byId(M.SCHOOLS), byId(H.SCHOOLS),
      'SCHOOLS — то же мультимножество записей');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('000395 T1 (skills-носитель): анти-вакуум перенесённого regen-зуба — порт ПОЛЯ одного skill-ассета в tmp (name + суффикс) обязан покраснить regen src/skills-data.js ≠ живому зеркалу (иначе сверка «≡ регену» ничего не сторожит — стандарт пустого зуба .393)', () => {
  const committed = fs.readFileSync(MIRROR, 'utf8');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-rename-vac-'));
  try {
    const full = fs.readdirSync(SKILLS_DIR).map((f) => {
      const text = fs.readFileSync(path.join(SKILLS_DIR, f), 'utf8');
      if (f === 'strength.json') {
        const d = JSON.parse(text);
        d.name = d.name + ' (порт)';
        return [f, JSON.stringify(d, null, 2) + '\n'];
      }
      return [f, text];
    });
    const r = runSyncOn(full, dir);
    assert.equal(r.status, 0, 'regen после порта → exit 0: '
      + (r.stdout || '') + (r.stderr || ''));
    assert.notEqual(fs.readFileSync(path.join(dir, 'src', 'skills-data.js'),
      'utf8'), committed,
      'порт поля name в strength.json (tmp) НЕ покрасил реген — механизм'
      + ' «≡ побайтовому регену» вакуумный: зуб Т10 ничего не сторожит,'
      + ' верни живой сверки (port-tooth стандарт memory/000393'
      + '-selfgate-headguard.md п.5)');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('000318.09 T11 (ре-пин 000387): реестр tests/scripts/skills-num2id-000318.09.json — APPEND-ONLY против HEAD (заморожены СТРОКИ, а не длина), ключи — префикс 000001..N (N живой, ≥ границы rename), значения уникальны, реестр ⊆ множеству id каталога (двусторонняя bijection снята 000387), spot-строки', () => {
  const keys = Object.keys(registry);
  const N = keys.length;
  assert.ok(N >= FROZEN_PREFIX_END_I09,
    'реестр: ' + N + ' строк — меньше границы rename ('
    + FROZEN_PREFIX_END_I09 + '): существующие строки удалять нельзя'
    + ' (append-only), а порядок ключей — канон зеркала и байтов сейва'
    + ' (000384); РЕЦЕПТ роста: каталог без правки реестра (фолбэк хвоста'
    + ' по lex) либо append pad(' + String(N + 1).padStart(6, '0')
    + ')… — memory/000387-frozen-prefix-contract.md');
  const want = [];
  for (let i = 1; i <= N; i++) {
    want.push(String(i).padStart(6, '0'));
  }
  assert.deepEqual([...keys].sort(), want,
    'реестр: ключи — префикс 000001..' + want[N - 1] + ' подряд, без дыр'
    + ' и дублей (N = ' + N + ' — ЖИВОЙ счётчик, не литерал)');
  assert.equal(new Set(REG_VALUES).size, REG_VALUES.length,
    'значения уникальны (живая сверка); дубли ломают канон порядка');
  const diskIds = new Set(skillFilesAll().map((f) => JSON.parse(
    fs.readFileSync(path.join(SKILLS_DIR, f), 'utf8')).id));
  for (const id of REG_VALUES) {
    assert.ok(diskIds.has(id),
      'реестр: id «' + id + '» вне каталога — реестр ⊆ каталога (удаление'
      + ' файла навыка из-под замороженного префикса недопустимо);'
      + ' ОБРАТНОЕ НЕЛЬЗЯ требовать: каталог вправе расти вне реестра'
      + ' (фолбэк хвоста, 000387)');
  }
  assert.equal(registry['000001'], 'strength', 'spot 000001');
  assert.equal(registry['000018'], 'hide', 'spot 000018 (коллизия id с предметом hide)');
  assert.equal(registry['000042'], 'nature_school', 'spot 000042 (000318.11)');
  assert.equal(registry['000044'], 'staff', 'spot 000044 (000337)');
  const rewritten = LEDGER_APPEND_ONLY_I09();
  assert.deepEqual(rewritten, [],
    'реестр ' + REGISTRY_REL_I09 + ' изменён относительно HEAD НЕ-append'
    + ' правкой (' + rewritten.length + '): ' + rewritten.slice(0, 6)
    .join('; ') + (rewritten.length > 6 ? ' …' : '')
    + ' — существующие «номер → id» до коммита сторожит этот HEAD-зуб,'
    + ' после коммита — постоянный digest-зуб 000396 T1 (пере-нумерация'
    + ' префикса красна навсегда: порядок-канон зеркала и байтов сейва'
    + ' 000384, позиционные пины); дописывать pad(N+1)… в конец —'
    + ' единственная легальная правка реестра, а чаще реестр править НЕ'
    + ' нужно вовсе (рост каталога — фолбэк хвоста по lex),'
    + ' memory/000387-frozen-prefix-contract.md');
});

// SELF-GATE (задача 000387) — по образцу 000375/000379: имя замороженного
// счётчика и форма ассертов собираются concat-ом сегментов, поэтому
// собственный текст зуба им не совпадает (иначе T12 был бы вечно красным).
// Ограничение (осознанное, как у .379): ассерт-форма ловится в пределах
// ОДНОЙ физической строки — перенос аргумента на новую строку от зуба
// не спрячешь, но и не оправдан (style соседних файлов).
const FROZEN_IDENT_RE_I09 = () => new RegExp('EXPECTED_' + 'COUNT\\b', 'g');
const FROZEN_ASSERT_RE_I09 = () => new RegExp('assert' + '\\.equal\\([^\\n]*?'
  + '\\.(?:length|size)\\s*,\\s*\\d+', 'g');

test('000318.09 T12: self-gate — в исходнике этого файла нет замороженного живого счётчика каталога (ни имени-константы, ни assert.equal(<…length|size>, <литерал>)); positive-маркеры живой механики на месте', () => {
  const src = fs.readFileSync(__filename, 'utf8');
  const identHits = src.match(FROZEN_IDENT_RE_I09()) || [];
  assert.ok(identHits.length === 0,
    'в исходник skills-rename вернулся замороженный счётчик каталога ('
    + identHits.length + ' вхождений имени): рост assets/skills волнами '
    + 'легален БЕЗ строки реестра (фолбэк компаратора «в хвост по lex» '
    + 'shipped в 000384), поэтому живое число здесь пинить нельзя. '
    + 'РЕЦЕПТ вместо литерала: каталог ⊇ замороженного префикса реестра'
    + ' (T1, пол FROZEN_' + 'PREFIX_END_I09), зеркало ≡ канону порядка'
    + ' (T2/SO6), ключи реестра — префикс 000001..N с APPEND-ONLY по HEAD'
    + ' (T11), агрегаты referrer-ов — монотонные поля MIN_* (T5);'
    + ' границы и рецепт — memory/000387-frozen-prefix-contract.md');
  // Исключение (осознанное): line-пины документов вида
  // `String(x).split('\n').length === <число>` — это НЕ счётчик каталога,
  // а контракт line-neutral (SPEC_FILE_LINES / spec-split), он живёт по
  // своим правилам и меняется только вместе с документом.
  const frozenAsserts = [...src.matchAll(FROZEN_ASSERT_RE_I09())]
    .filter((m) => !m[0].includes('split('))
    .map((m) => src.slice(0, m.index).split('\n').length);
  assert.ok(frozenAsserts.length === 0,
    'в исходнике ' + frozenAsserts.length + ' ассерт-ов вида'
    + ' assert.equal(<выражение .length|.size>, <литерал>) на строках '
    + frozenAsserts.join(', ') + ' — это замороженный живой счётчик'
    + ' (мощность каталога/реестра/зеркала). РЕЦЕПТ: сравнивать с живой'
    + ' величиной с диска, либо с монотонным полом'
    + ' (FROZEN_' + 'PREFIX_END_I09 / MIN_*), либо выводить из данных.'
    + ' Мутационный класс зуба — см. tasks/result/000387.md');
  assert.ok(src.includes('FROZEN_' + 'PREFIX_END_I09'),
    'пропал positive-маркер FROZEN_' + 'PREFIX_END_I09 — монотонная граница'
    + ' замороженного префикса (44 пары реестра на момент rename),'
    + ' ниже которой каталог/реестр упасть не могут');
  assert.ok(src.includes('LEDGER_' + 'APPEND_ONLY_I09'),
    'пропал positive-маркер LEDGER_' + 'APPEND_ONLY_I09 — зуб «реестр'
    + ' append-only относительно HEAD» (заморожены СТРОКИ, а не длина);'
    + ' без него волна, дописавшая реестр, остаётся без стража'
    + ' пере-нумерации');
  // Форма-паттерн (а не includes имени): маркер требует саму декларацию
  // hex-литерала, поэтому собственный текст этого зуба ему НЕ совпадает
  // (self-match = 0) — удаление константы FROZEN_PREFIX_DIGEST_SHA256_I09
  // красит self-gate, а не проходит молча (урок 000392/M7; порт формы
  // 000318.08 T12, тот же принцип, что у concat-регэкспов выше).
  assert.ok(/FROZEN_PREFIX_DIGEST_SHA256_I09 =\s*\n?\s*'[0-9a-f]{64}'/.test(src),
    'пропал positive-маркер FROZEN_PREFIX_DIGEST_SHA256_I09 (sha256-'
    + 'литерал замороженного префикса реестра, зуб «000396 T1»): без'
    + ' постоянной digest-пины закоммиченная пере-нумерация префикса снова'
    + ' машиной невидима (ретро-b24 F1) — возвращай зуб, а не глуши его');
});

test('000396 T1 (skills-плечо, перенос 000392/T13): постоянный digest-зуб замороженного префикса реестра tests/scripts/skills-num2id-000318.09.json — sha256 канонической сериализации первых FROZEN_PREFIX_END_I09 пар num→id ≡ неизменному литералу: подмена/пере-нумерация строк префикса красна и ПОСЛЕ коммита (там HEAD-зуб T11 слепнет), легальный append pad(N+1)… в хвост литерал не двигает', () => {
  assert.ok(fs.existsSync(REGISTRY),
    'RED: реестра «номер → id» ещё нет — digest-зуб считается от него');
  const digest = FROZEN_PREFIX_DIGEST_I09();
  assert.equal(digest, FROZEN_PREFIX_DIGEST_SHA256_I09,
    'digest префикса 000001..' + FROZEN_PREFIX_END_I09 + ' пар реестра '
    + REGISTRY_REL_I09 + ' = «' + digest + '» ≠ каноническому литералу —'
    + ' пары внутри префикса пере-нумерованы или подменены (в том числе'
    + ' закоммиченно: HEAD-зуб T11 на это слеп, это дефект F1 ретро-b24).'
    + ' РЕЦЕПТ: строки замороженного префикса неприкосновенны; рост'
    + ' каталога дописывает pad(N+1)… в КОНЕЦ реестра (а чаще не трогает'
    + ' его вовсе — фолбэк хвоста по lex), литерал от этого не меняется'
    + ' (граница, формула и рецепт —'
    + ' memory/000387-frozen-prefix-contract.md)');
});

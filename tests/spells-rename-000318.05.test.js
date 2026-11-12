// Задача 000318.05 (родитель 000318): переименование assets/spells —
// 0000NN.json → <id>.json (169 файлов, имя = строковый id, как runes .02 /
// mobs .04: NameOf по умолчанию d.id + '.json') с флипом реестра
// ASSET_NAME_SHAPES.spells = 'slug'. spells ∈ REF_LINKED_CATALOGS (мишень
// ссылок — 34 self-ссылки «база») ⇒ REF_RE ДРЕЙФУЕТ: spells переходит из
// number-группы в slug-группу (прецедент .04, где флипались три мишени).
// Отличие от .03/.04: числовой порядок файлов ≠ id-лексическому во ВСЕХ
// 169 позициях ⇒ зеркало src/spells-data.js ПЕРЕНОСИТСЯ ПОЛНОСТЬЮ
// (сортировка sync — по data.id; форма — прецедент runes .02). Аудит
// потребителей ПОРЯДКА SPELLS (память memory/000318-spells.md): рантайм
// порядок не читает (резолвы по id/BOOK, индексных и rng-выборов по
// SPELLS нет, golden-симуляции id-стабильны) — CHANGELOG без буллета.
// Контекст разбивки — tasks/result/000318-split-20261108.md, реестр —
// memory/000318-asset-rename.md, контракт — memory/000318-spells.md.
//
// КРАСНЫЕ тесты (TDD): до rename/флипа T1–T7 краснеют ОСМЫСЛЕННО
// (ERR_ASSERTION: шейп number, файлы числовые, зеркало в прежнем порядке,
// REF_RE прежний source, sync-грепы не найдены, tmp-sync exit 1), без
// краха загрузки.
//
// Контракты:
//   * T1 — ростер: 169 файлов ≡ пин-множеству slug-имён, 0 numeric;
//     basename === id + '.json' (default NameOf), id уникальны ∈ slug-форме;
//     schema.json ∈ slug-regex (исключение обязательно в каждом фильтре).
//   * T2 — зеркало: SPELLS позиции — id-порядок СТРОГО возрастающий;
//     записи deepEqual каталогу (резолв ссылок в id-форму); шапка-диапазон
//     absolute_zero.json … winter_haste.json; построчные комментарии
//     «// <slug>.json», numeric-имён в зеркале нет.
//   * T3 — ссылки: РОВНО 34 self-ссылки «база» в slug-форме (isRef,
//     resolveRef ok, id цели == basename); numeric-spells-путей в данных
//     (assets/**.json + src + scripts + index.html) — 0; items/buildings
//     остаются number; mobs.data-ссылок на spells 0 (паттерн-носитель —
//     mobs/schema.json).
//   * T4 — REF_RE побайтовый пин НОВОГО двухгруппного source (number:
//     items|skills|buildings|craft|npc; slug: spells|mobs|mob_groups|dungeons)
//     + таблица истинности (spells slug — ref, spells numeric — НЕ ref).
//   * T5 — sync-spells-data.js: фильтр ЧЕРЕЗ живой реестр lib + ЯВНОЕ
//     исключение schema.json + компаратор по data.id, numeric-фильтра и
//     «0000NN» нет; схемы-носители: skills ×2 ≡ живой REF_RE.source,
//     dungeons ×4 (spells в slug-ветке), mobs «spells»-паттерн, spells
//     «база» (null-ветка сохранена).
//   * T6 — tmp-дерево: sync на полном каталоге (schema.json внутри —
//     исключающим фильтром) — выход ПОБАЙТОВО ≡ закоммиченному зеркалу,
//     повтор идемпотентен; перестановка СОДЕРЖИМОГО имя↔имя двух файлов
//     (basename==id иначе делает компаратор ненаблюдаемым — прецедент
//     runes T5/M2) — выход всё равно в id-порядке и записи ≡ зеркалу.
//   * T7 — иконки: биекция каталога с assets/spell-icons/<id>.svg —
//     basename json === basename svg (иконки УЖЕ id-именованы — 0-diff).
//   * T8 (000338, follow-up ретро-b14 Finding 1) — SPEC-guard: § «Архитектура
//     хранения (каталог assets/spells)» spec/spells.md (читается с диска,
//     скоуп — только срез H2) предписывает slug-именование (`<id>.json`,
//     basename === `id`) и НЕ содержит «сквозная нумерация» / numeric-имён
//     0000NN.json / «нумерацию»; краснеет при возврате spec-текста на
//     числовую схему (правится вместе с Δ0-правкой spec, пин 470 не двигать).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SPELLS_DIR = path.join(ROOT, 'assets', 'spells');
const MIRROR = path.join(ROOT, 'src', 'spells-data.js');
const SYNC = path.join(ROOT, 'scripts', 'sync-spells-data.js');
const JR = require('../scripts/lib/json-ref.js');

// Пин-множество (lex-порядок — как readdir().sort(); состав каталога
// пиннуцеликом — «подряд 1..N» slug-носителю несвойственен, прецедент
// visuals .03 / mobs .04).
const SPELLS_SLUGS_000318 = [
  "absolute_zero", "acid_splash", "aegis", "arctic_touch",
  "ashen_debilitation", "attraction", "aura_of_protection", "barkskin", "beast_friend",
  "blazing_speed", "blessing", "blizzard", "blizzard_field", "bulwark_ward",
  "burning_cage", "burning_ground", "burning_haze", "chill", "cinder",
  "circle_of_light", "cold_breath", "corrode", "dark_ensnare", "dark_nova",
  "dark_presence", "decadance", "deep_freeze", "despair", "divine_favor",
  "divine_protection", "doom_mark", "drain_life", "ember", "entangle",
  "faith_shield", "fear", "fire_aura", "fire_nova", "fireball", "firelight",
  "flame_burst", "flame_imp", "flame_step", "flame_strike", "forest_beast",
  "fortitude", "freeze", "frost_aura", "frost_bolt", "frost_walk",
  "frost_wisp", "frostbite", "frostbite_blessing", "frozen_stillness",
  "gate", "glacial_spike", "glacier_grasp", "greater_heal",
  "guardian_blessing", "guardian_field", "guardian_oath", "hail",
  "heart_of_forest", "hearthfire", "heat_shield", "hellfire", "holy_bind",
  "holy_ground", "holy_guardian", "holy_light", "holy_mending", "hurricane",
  "ice_armor", "ice_field", "ice_lance", "ignite", "inferno", "invisibility",
  "iron_bastion", "iron_bulwark", "iron_sentinel", "lava_burst",
  "lava_snare", "life_bloom", "life_force", "light_heal", "light_sprite",
  "magic_shield", "magical_barrier", "mass_heal", "mass_holy_light", "mend",
  "meteor", "miracle", "nature_blessing", "nature_haste", "nature_wrath",
  "night_blade", "night_strike", "nightmare", "paralyzing_spore",
  "path_of_vines", "permafrost", "phlogiston_blast", "phoenix", "poison",
  "poison_cloud", "poison_spore", "prayer", "purify", "radiant_heal",
  "recall", "regeneration", "resilience", "resurrect", "rime_bolt",
  "root_grasp", "rot", "scorch", "shadow_bind", "shadow_bolt",
  "shadow_curse", "shadow_pool", "shadow_step", "shadow_wraith",
  "shadowflame", "shatter", "shield_wall", "shroud", "shroud_of_night",
  "slow", "smite", "soul_drain", "spark", "spirit_healer", "stalwart",
  "stone_anchor", "stone_golem", "stone_grasp", "stone_skin", "stone_wall",
  "stony_hide", "stun_of_light", "sunfire", "swift_prayer", "thorn_field",
  "thorn_storm", "thorn_whip", "thorns", "time_slow", "treant", "umbra_bolt",
  "unholy_wrath", "vampire_touch", "veil_of_night", "vine", "vine_lash",
  "vitality", "void_arrow", "void_horror", "wall_of_fire", "wall_of_ice",
  "wall_of_thorns", "ward", "warding_circle", "way_down", "way_up",
  "weaken_defense", "wild_growth", "winter_elemental", "winter_haste",
].map((s) => s + '.json').sort();

// Первый/последний в финальном id-порядке (шапка-диапазон зеркала).
const FIRST_SLUG = 'absolute_zero.json';
const LAST_SLUG = 'winter_haste.json';

function shapeFiles(dir) {
  const re = JR.SHAPE_BASENAME_RES[JR.ASSET_NAME_SHAPES.spells];
  return fs.readdirSync(dir)
    .filter((f) => f !== 'schema.json' && re.test(f)).sort();
}

function readJson(f) {
  return JSON.parse(fs.readFileSync(path.join(SPELLS_DIR, f), 'utf8'));
}

// Заклинание в id-форме — то же преобразование, что resolveSpellData в
// sync-spells-data.js (поля-ссылки резолвятся в id цели).
function resolveSpell(data) {
  return {
    ...data,
    база: data.база === null ? null : JR.resolveRef(ROOT, data.база).id,
    ...(Array.isArray(data.предметы)
      ? { предметы: data.предметы.map((it) => JR.resolveRef(ROOT, it).id) }
      : {}),
    здания: data.здания.map((b) => JR.resolveRef(ROOT, b).id),
  };
}

test('000318.05 T1: ростер — шейп slug, 171 файл ≡ пин-множеству, 0 numeric, basename == id + \'.json\', id уникальны; schema.json ∈ slug-regex (исключение обязательно)', () => {
  assert.equal(JR.ASSET_NAME_SHAPES.spells, 'slug',
    'spells: шейп в реестре — slug (000318.05)');
  const all = fs.readdirSync(SPELLS_DIR);
  const numeric = all.filter((f) => /^\d{6}\.json$/.test(f));
  assert.deepEqual(numeric, [],
    'spells: остались numeric-файлы после rename: ' + numeric.join(', '));
  assert.deepEqual(shapeFiles(SPELLS_DIR), SPELLS_SLUGS_000318,
    'spells: 171 файл ≡ пин-множеству slug-имён (ре-пин 000348: +decadance; ре-пин 000349: +attraction)');
  assert.ok(JR.SHAPE_BASENAME_RES.slug.test('schema.json'),
    'guard: schema.json обязан матчиться slug-regex (иначе фильтр-исключение '
    + 'ничего не сторожит и анти-вакуум T6 протухает)');
  const ids = [];
  for (const f of shapeFiles(SPELLS_DIR)) {
    const data = readJson(f);
    assert.equal(f, data.id + '.json',
      `spells: basename ≠ id + '.json' (${f}, id «${data.id}») — default NameOf`);
    assert.ok(/^[a-z][a-z0-9_]*$/.test(data.id),
      `spells: id «${data.id}» — не slug-форма (схема пинит её же)`);
    ids.push(data.id);
  }
  assert.equal(new Set(ids).size, 171, 'spells: 171 id уникальны');
});

test('000318.05 T2: зеркало — SPELLS в строгом id-порядку, записи ≡ каталогу (резолв в id); шапка-диапазон absolute_zero … winter_haste; построчные «// <slug>.json», numeric-имён нет', () => {
  const { SPELLS, SPELLS_BY_ID } = require(MIRROR);
  const ids = SPELLS.map((s) => s.id);
  assert.deepEqual(ids, [...ids].sort(),
    'SPELLS: порядок id — не lex-возрастающий (sync обязан сортировать по data.id, '
    + 'а не по имени файла каталога прежней нумерации)');
  for (let i = 1; i < ids.length; i++) {
    assert.ok(ids[i - 1] < ids[i], `дубль/непорядок на позиции ${i}`);
  }
  assert.equal(SPELLS.length, 171, 'SPELLS — 171 запись');
  for (const f of shapeFiles(SPELLS_DIR)) {
    const data = readJson(f);
    assert.deepEqual(SPELLS[ids.indexOf(data.id)], resolveSpell(data),
      `${f}: зеркало SPELLS ≠ каталогу (id-позиция)`);
    assert.deepEqual(SPELLS_BY_ID[data.id], resolveSpell(data),
      `${f}: SPELLS_BY_ID ≠ каталогу`);
  }
  const text = fs.readFileSync(MIRROR, 'utf8');
  assert.ok(text.includes(
    `  // Заклинания (assets/spells/${FIRST_SLUG} … ${LAST_SLUG}).`),
    'шапка-диапазон зеркала — финальный id-порядок (absolute_zero … '
    + 'winter_haste)');
  assert.ok(text.includes(`    // ${FIRST_SLUG}\n`),
    'построчный комментарий «// absolute_zero.json» (slug-имя)');
  assert.ok(text.includes(`    // ${LAST_SLUG}\n`),
    'построчный комментарий «// winter_haste.json» (slug-имя)');
  assert.ok(!/^\s*\/\/ 000\d{3}\.json$/m.test(text),
    'в зеркале остались числовые комментарии-файлы «// 0000NN.json»');
});

test('000318.05 T3: ссылки — РОВНО 34 self-«база» в slug-форме (isRef, резолв, id == basename); numeric-spells-путей в данных/рантайме 0; items — number (buildings — slug с 000318.06); mobs.data-ссылок нет', () => {
  let nBase = 0;
  for (const f of shapeFiles(SPELLS_DIR)) {
    const data = readJson(f);
    if (data.база === null) continue;
    nBase += 1;
    assert.ok(JR.isRef(data.база),
      `spells/${f}: «база» «${data.база}» — не ref (slug?)`);
    const r = JR.resolveRef(ROOT, data.база);
    assert.ok(r.ok, `spells/${f}: «база» «${data.база}» — ${r.reason}`);
    assert.equal(r.id, path.basename(data.база, '.json'),
      `spells/${f}: id цели «${r.id}» ≠ basename «${data.база}»`);
    for (const it of (data.предметы || [])) {
      assert.match(it, /^assets\/items\/\d{6}\.json$/,
        `spells/${f}: items-ссылка «${it}» — не numeric (шейп items не менялся)`);
    }
    for (const b of data.здания) {
      assert.match(b, /^assets\/buildings\/[a-z][a-z0-9_]*\.json$/,
        `spells/${f}: здания-ссылка «${b}» — не slug (000318.06: buildings — slug)`);
    }
  }
  assert.equal(nBase, 34, 'self-ссылки «база»: ровно 34 (прежний счёт)');
  // numeric-spells-путей — 0 во ВСЕХ данных и рантайме (тестовые
  // негативные фикстуры вне скоупа: tests/ намеренно содержат отрицания).
  const NUM_RE = /assets\/spells\/\d{6}\.json/;
  const hits = [];
  const scanText = (file, text) => {
    if (NUM_RE.test(text)) hits.push(path.relative(ROOT, file));
  };
  const walkDir = (dir, pred) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walkDir(p, pred);
      else if (pred(e.name)) scanText(p, fs.readFileSync(p, 'utf8'));
    }
  };
  walkDir(path.join(ROOT, 'assets'), (n) => n.endsWith('.json'));
  walkDir(path.join(ROOT, 'src'), (n) => n.endsWith('.js'));
  walkDir(path.join(ROOT, 'scripts'), (n) => n.endsWith('.js'));
  scanText(path.join(ROOT, 'index.html'),
    fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
  assert.deepEqual(hits, [],
    'остались numeric-spells-пути: ' + hits.join(', '));
  // mobs: data-ссылок на spells нет (все массивы «spells» пусты — факт
  // диска, уточнение к ТЗ); носитель — только pattern в mobs/schema.json.
  for (const f of fs.readdirSync(path.join(ROOT, 'assets', 'mobs'))) {
    if (f === 'schema.json') continue;
    if (!JR.SHAPE_BASENAME_RES.slug.test(f)) continue;
    const j = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'assets', 'mobs', f), 'utf8'));
    assert.deepEqual(j.spells, [],
      `mobs/${f}: непустой «spells» — data-ссылка на spells вне учёта`);
  }
});

test('000318.05 T4: REF_RE — побайтовый пин ДВУХгруппного source с spells в slug-ветке + таблица истинности', () => {
  assert.equal(JR.REF_RE.source,
    '^assets\\/(items|skills|craft|npc)\\/\\d{6}\\.json$'
    + '|^assets\\/(spells|mobs|mob_groups|buildings|dungeons)\\/[a-z][a-z0-9_]*\\.json$',
    'REF_RE группами по шейпам: number-группа (items первым в '
    + 'REF_LINKED_CATALOGS) + slug-группа (spells первым из slug); '
    + 'прежний source (spells ∈ number-группы) — «до 000318.05», память '
    + 'memory/000211.01-json-ref-format.md (ADDENDUM); рантайм-носитель — '
    + 'pattern в assets/skills/schema.json (SR5/skills.test сверяют живо)');
  for (const [p, want] of [
    ['assets/spells/spark.json', true],
    ['assets/spells/000017.json', false],
    ['assets/spells/resurrect.json', true],
    ['assets/mobs/abomination.json', true],
    ['assets/mobs/000036.json', false],
    ['assets/dungeons/abyss.json', true],
    ['assets/items/000001.json', true],
    ['assets/items/wood_sword.json', false],
    ['assets/buildings/weapons_shop.json', true],
    ['assets/runes/stone_hide.json', false],
  ]) {
    assert.equal(JR.isRef(p), want, 'isRef: ' + p);
    assert.equal(JR.REF_RE.test(p), want, 'REF_RE ≡ isRef: ' + p);
  }
});

test('000318.05 T5: sync + схемы-носители — фильтр через живой реестр, schema.json исключён, компаратор по data.id, numeric-фильтра и «0000NN» нет; skills ×2 ≡ живой REF_RE.source; dungeons ×4 (spells в slug-ветке); mobs и spells «база» — slug', () => {
  const src = fs.readFileSync(SYNC, 'utf8');
  assert.match(src, /require\('\.\/lib\/json-ref\.js'\)/,
    'sync: нет require lib (фильтр обязан читаться из реестра живо)');
  assert.ok(src.includes('SHAPE_BASENAME_RES')
    && src.includes('ASSET_NAME_SHAPES.spells'),
    'sync: фильтр не через SHAPE_BASENAME_RES[ASSET_NAME_SHAPES.spells]');
  assert.ok(src.includes("'schema.json'"),
    'sync: schema.json не исключён из фильтра (slug-regex матчит его)');
  assert.ok(!/\\d\{6\}\\\.json\$/.test(src),
    'sync: остался numeric-фильтр/паттерн имён файлов');
  assert.ok(!src.includes('0000NN'),
    'sync: осталось упоминание «0000NN»');
  assert.match(src, /spells\.sort\(\(a, b\) => \(a\.data\.id < b\.data\.id/,
    'sync: нет компаратора порядка по data.id');
  // Схемы-носители.
  const live = JR.REF_RE.source;
  const skills = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'assets', 'skills', 'schema.json'), 'utf8'));
  const secSkills = skills.oneOf[1]; // структура: oneOf primary|secondary|school
  assert.equal(secSkills.properties.primary.pattern, live,
    'skills/schema.json: secondary.primary ≢ живому REF_RE.source');
  assert.equal(secSkills.properties.requires.properties.skill.pattern, live,
    'skills/schema.json: secondary.requires.skill ≢ живому REF_RE.source');
  const dungs = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'assets', 'dungeons', 'schema.json'), 'utf8'));
  const UNION = '^assets/((items|skills|craft|npc)/\\d{6}'
    + '|(spells|mobs|mob_groups|buildings|dungeons)/[a-z][a-z0-9_]*)\\.json$';
  assert.equal(dungs.properties.мобы.items.pattern, UNION,
    'dungeons/schema.json: «мобы» — spells не в slug-ветке');
  assert.equal(dungs.properties.предметы.items.pattern, UNION,
    'dungeons/schema.json: «предметы» — spells не в slug-ветке');
  assert.equal(dungs.properties.постройка.pattern, UNION,
    'dungeons/schema.json: «постройка» — spells не в slug-ветке');
  assert.equal(dungs.properties.руда.items.properties.предмет.pattern, UNION,
    'dungeons/schema.json: «руда.предмет» — spells не в slug-ветке');
  const mobs = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'assets', 'mobs', 'schema.json'), 'utf8'));
  assert.equal(mobs.properties.spells.items.pattern,
    '^assets/spells/[a-z][a-z0-9_]*\\.json$',
    'mobs/schema.json: «spells» pattern — не slug');
  const sp = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'assets', 'spells', 'schema.json'), 'utf8'));
  assert.deepEqual(sp.properties['база'].anyOf,
    [
      { type: 'string', pattern: '^assets/spells/[a-z][a-z0-9_]*\\.json$' },
      { type: 'null' },
    ],
    'spells/schema.json: «база» — slug-ссылка (null-ветка сохраняется)');
});

// tmp-«репозиторий»: sync + lib (write-atomic + json-ref — прецедент
// MODULE_NOT_FOUND .01–.04) + ПОЛНЫЙ каталог spells (schema.json внутри)
// + цели ссылок (items/buildings/spells) из данных.
function makeTmpSpellsTree() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spells-00031805-'));
  for (const sub of ['scripts/lib', 'src', 'assets/spells',
    'assets/items', 'assets/buildings']) {
    fs.mkdirSync(path.join(tmp, sub), { recursive: true });
  }
  for (const libFile of ['write-atomic.js', 'json-ref.js']) {
    fs.copyFileSync(path.join(ROOT, 'scripts', 'lib', libFile),
      path.join(tmp, 'scripts', 'lib', libFile));
  }
  fs.copyFileSync(SYNC, path.join(tmp, 'scripts', 'sync-spells-data.js'));
  fs.copyFileSync(path.join(SPELLS_DIR, 'schema.json'),
    path.join(tmp, 'assets', 'spells', 'schema.json'));
  for (const f of shapeFiles(SPELLS_DIR)) {
    fs.copyFileSync(path.join(SPELLS_DIR, f),
      path.join(tmp, 'assets', 'spells', f));
    const data = readJson(f);
    for (const ref of [data.база, ...(data.предметы || []), ...data.здания]) {
      if (typeof ref !== 'string' || ref.startsWith('assets/spells/')) continue;
      const dst = path.join(tmp, ref);
      if (!fs.existsSync(dst)) {
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(path.join(ROOT, ref), dst);
      }
    }
  }
  return tmp;
}

test('000318.05 T6: tmp-дерево — sync на полном каталоге (schema.json внутри) побайтово ≡ закоммиченному зеркалу и идемпотентен; перестановка СОДЕРЖИМОГО пары файлов — выход всё равно в id-порядке и ≡ зеркалу (компаратор наблюдаем)', () => {
  assert.ok(fs.existsSync(SYNC), 'RED: scripts/sync-spells-data.js не существует');
  assert.ok(fs.existsSync(MIRROR), 'RED: зеркало не сгенерировано');
  for (const f of [FIRST_SLUG, LAST_SLUG]) {
    assert.ok(fs.existsSync(path.join(SPELLS_DIR, f)),
      'RED: каталог не переименован — нет файла ' + f);
  }
  const committed = fs.readFileSync(MIRROR, 'utf8');
  const tmp = makeTmpSpellsTree();
  const script = path.join(tmp, 'scripts', 'sync-spells-data.js');
  const out = path.join(tmp, 'src', 'spells-data.js');
  try {
    const run1 = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    assert.equal(run1.status, 0,
      'tmp-запуск (schema.json в каталоге — фильтр обязан исключать): '
      + (run1.stderr || run1.stdout));
    assert.equal(fs.readFileSync(out, 'utf8'), committed,
      'полный tmp-каталог → выход побайтово ≡ закоммиченному зеркалу');
    const run2 = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    assert.equal(run2.status, 0, 'повторный запуск: ' + (run2.stderr || run2.stdout));
    assert.equal(fs.readFileSync(out, 'utf8'), committed,
      'повторный запуск byte-identical');
    // Перестановка СОДЕРЖИМОГО (имена остаются basename==id — при ином
    // раскладе компаратор ненаблюдаем, прецедент runes T5/M2): первый и
    // последний файлы меняются данными — выход обязан остаться в
    // id-порядке (сортировка по имени вынесла бы winter_haste в начало).
    const a = path.join(tmp, 'assets', 'spells', FIRST_SLUG);
    const b = path.join(tmp, 'assets', 'spells', LAST_SLUG);
    const aRaw = fs.readFileSync(a, 'utf8');
    const bRaw = fs.readFileSync(b, 'utf8');
    fs.writeFileSync(a, bRaw, 'utf8');
    fs.writeFileSync(b, aRaw, 'utf8');
    const run3 = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    assert.equal(run3.status, 0, 'tmp-запуск после перестановки: '
      + (run3.stderr || run3.stdout));
    const swapped = require(out);
    const committedMod = require(MIRROR);
    assert.deepEqual(swapped.SPELLS.map((s) => s.id),
      committedMod.SPELLS.map((s) => s.id),
      'порядок id выхода — по data.id (по имени файла winter_haste встал '
      + 'бы первым вместо последнего)');
    assert.deepEqual(swapped.SPELLS, committedMod.SPELLS,
      'записи выхода ≡ закоммиченному зеркалу');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('000318.05 T7: иконки — биекция каталога assets/spell-icons/<id>.svg (basename json === basename svg, 171 — ре-пин 000348: +decadance; ре-пин 000349: +attraction)', () => {
  const iconsDir = path.join(ROOT, 'assets', 'spell-icons');
  const svgs = new Set(fs.readdirSync(iconsDir).filter((f) => f.endsWith('.svg')));
  const files = shapeFiles(SPELLS_DIR);
  assert.equal(files.length, svgs.size, 'иконка на каждое заклинание (171)');
  for (const f of files) {
    const data = readJson(f);
    assert.equal(data.icon, 'assets/spell-icons/' + f.replace(/\.json$/, '.svg'),
      `${f}: icon ≠ assets/spell-icons/<basename>.svg`);
    assert.ok(svgs.has(f.replace(/\.json$/, '.svg')),
      `${f}: файла иконки нет в assets/spell-icons`);
  }
});

// SPEC-guard (000338): § «Архитектура хранения» с диска == slug-контракт
// каталога (диск пиннут T1; здесь — только текст SPEC, скоуп — срез H2,
// прецедент h2-хелпера spec-000235-wording: до следующего '\n## ' или EOF).
test('000318.05 T8 (000338): spec/spells.md § «Архитектура хранения» — slug-именование (`<id>.json`, basename === `id`), без «сквозная нумерация»/numeric-имён/«нумерацию»', () => {
  const text = fs.readFileSync(path.join(ROOT, 'spec', 'spells.md'), 'utf8');
  const NAME = 'Архитектура хранения (каталог assets/spells)';
  const esc = NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = text.match(new RegExp('^## ' + esc + '\\s*$', 'm'));
  assert.ok(m, 'spec/spells.md: H2 «' + NAME + '» не найден');
  const j = text.indexOf('\n## ', m.index + 1);
  const sec = text.slice(m.index, j === -1 ? text.length : j);
  assert.ok(sec.includes('<id>.json'),
    'RED (000338): § не предписывает slug-именование `<id>.json` '
    + '(каталог — 169 `<id>.json`, numeric-имён 0 — диск пиннут T1)');
  assert.ok(sec.includes('basename === `id`'),
    'RED (000338): § не связывает имя файла с id (basename === `id` — '
    + 'default NameOf, прецедент runes .02)');
  assert.ok(!sec.includes('сквозная нумерация'),
    'RED (000338): § содержит устаревшее «сквозная нумерация» (000318.05: '
    + 'каталог slug-именован, нумерации нет)');
  assert.ok(!/000\d{3}\.json/.test(sec),
    'RED (000338): § содержит numeric-имена файлов 000NNN.json '
    + '(легальные skills-id-ссылки § — без «.json», regex их не трогает)');
  assert.ok(!sec.includes('нумерацию'),
    'RED (000338): § предписывает тесту проверять «нумерацию» '
    + '(spells.test.js проверяет именование, numeric-нумерации больше нет)');
});

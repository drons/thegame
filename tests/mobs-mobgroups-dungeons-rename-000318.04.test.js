// Задача 000318.04 (родитель 000318): переименование ТРЁХ каталогов одним
// коммитом — assets/mobs (36, имя = строковый id), assets/mob_groups (7,
// рукописный slug, id 1..7 = позиция+1 = MOB_GROUP_TYPES), assets/dungeons
// (5, рукописный slug по названиям, id 0..4 = DUNGEON_TYPES) — с флипом
// реестра ASSET_NAME_SHAPES (все три ∈ REF_LINKED_CATALOGS ⇒ REF_RE ДРЕЙФУЕТ
// в две группы — в отличие от runes .02 / visuals .03) и переписью
// межкаталожных ссылок mob_groups→mobs (24) и dungeons→mobs (21) в том же
// коммите. Контекст разбивки — tasks/result/000318-split-20261108.md,
// реестр и таблицы — memory/000318-asset-rename.md, контракт —
// memory/000318-mobs-mobgroups-dungeons.md.
//
// КРАСНЫЕ тесты (TDD): до rename/флипа T1–T6 краснеют ОСМЫСЛЕННО
// (ERR_ASSERTION: файлы числовые, slug-ссылки не isRef, sync-грепы не
// найдены), без краха загрузки.
//
// Контракты:
//   * T1 — ростеры: пин-множества slug-имён (36/7/5), 0 numeric-файлов;
//     mobs: basename == id + '.json'; mob_groups/dungeons: таблица id→slug
//     (рукописные имена — честный пин таблицей, не ослабление свипа).
//   * T2 — порядок зеркал: позиции MOB_GROUPS = id [1..7] (позиция = id−1 =
//     MOB_GROUP_TYPES, src/map.js), DUNGEONS = ids [0..4]; guard
//     notDeepEqual(lex-порядок файлов, id-порядок) — компаратор sync
//     наблюдаем (иначе сортировка по имени прошла бы незамеченной);
//     records ≡ каталогу (резолв ссылок в id-форму).
//   * T3 — цепочек ссылок: РОВНО 24 + 21 ссылок на mobs в slug-форме,
//     isRef + resolveRef ok + id цели == basename; numeric-форм в данных
//     трёх каталогов — 0; items/buildings-ссылки dungeons — numeric (шейп
//     не менялся).
//   * T4 — REF_RE побайтовый пин ДВУХгруппного source + таблица истинности
//     (numeric — ref для number-каталогов и НЕ ref для slug-каталогов;
//     наоборот).
//   * T5 — sync-скрипты: фильтр ЧЕРЕЗ живой реестр lib, исключение
//     schema.json, компаратор по data.id, нет numeric-фильтра/«0000NN»;
//     gen-mob-art — тоже через реестр.
//   * T6 — tmp-дерево: запуск sync-mob-groups-data.js на копии каталога —
//     выход в id-порядке и ≡ закоммиченному зеркалу (lex-порядок файлов
//     tmp ≠ id-порядку — компаратор наблюдаем).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const JR = require('../scripts/lib/json-ref.js');

const MOB_GROUPS_SLUG_00031804 = {
  1: 'orc_camp', 2: 'orc_raiders', 3: 'skeleton_den', 4: 'wolf_pack',
  5: 'spider_nest', 6: 'elemental_circle', 7: 'abyss_spirit',
};
const DUNGEON_SLUG_00031804 = {
  0: 'simple_cave', 1: 'crypt', 2: 'castle_ruins', 3: 'flooded_cave',
  4: 'abyss',
};
// Пин-множества (lex-порядок — как readdir().sort()).
const MOB_SLUG_SET = [
  'abomination.json', 'ant.json', 'ant_queen.json', 'bone_coloss.json',
  'boar.json', 'cave_bear.json', 'centipede.json', 'crawling_bones.json',
  'earth_elemental.json', 'fairy.json', 'fire_elemental.json',
  'giant_larva.json', 'imp.json', 'lower_demon.json', 'orc_archer.json',
  'orc_captain.json',
  'orc_chief.json', 'orc_grunt.json', 'orc_mad.json', 'orc_rider.json',
  'orc_shaman.json', 'orc_warrior.json', 'rot.json', 'salamander.json',
  'scorpion.json', 'skeleton.json', 'skeleton_archer.json', 'spider.json',
  'stone_golem.json', 'succubus.json', 'troll.json', 'vampire.json',
  'water_elemental.json', 'wind_elemental.json', 'wolf.json',
  'wolf_pack.json',
].sort();
const MOB_GROUPS_SLUG_SET = Object.values(MOB_GROUPS_SLUG_00031804)
  .map((s) => s + '.json').sort();
const DUNGEON_SLUG_SET = Object.values(DUNGEON_SLUG_00031804)
  .map((s) => s + '.json').sort();

function shapeFiles(cat) {
  const re = JR.SHAPE_BASENAME_RES[JR.ASSET_NAME_SHAPES[cat]];
  return fs.readdirSync(path.join(ROOT, 'assets', cat))
    .filter((f) => f !== 'schema.json' && re.test(f)).sort();
}

function readJson(cat, f) {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT, 'assets', cat, f), 'utf8'));
}

test('000318.04 T1: ростеры — пин-множества slug, 0 numeric, mobs basename==id, таблицы id→slug для mob_groups/dungeons', () => {
  for (const cat of ['mobs', 'mob_groups', 'dungeons']) {
    assert.equal(JR.ASSET_NAME_SHAPES[cat], 'slug',
      cat + ': шейп в реестре — slug (000318.04)');
    const dir = path.join(ROOT, 'assets', cat);
    const all = fs.readdirSync(dir);
    const numeric = all.filter((f) => /^\d{6}\.json$/.test(f));
    assert.deepEqual(numeric, [],
      cat + ': остались numeric-файлы после rename: ' + numeric.join(', '));
  }
  assert.deepEqual(shapeFiles('mobs'), MOB_SLUG_SET,
    'mobs: 36 файлов ≡ пин-множеству slug');
  assert.deepEqual(shapeFiles('mob_groups'), MOB_GROUPS_SLUG_SET,
    'mob_groups: 7 файлов ≡ пин-множеству slug (таблица 000318.04)');
  assert.deepEqual(shapeFiles('dungeons'), DUNGEON_SLUG_SET,
    'dungeons: 5 файлов ≡ пин-множеству slug (таблица 000318.04)');
  for (const f of shapeFiles('mobs')) {
    const data = readJson('mobs', f);
    assert.equal(f, data.id + '.json',
      `mobs: basename ≠ id + '.json' (${f}, id «${data.id}») — default NameOf`);
    assert.ok(/^[a-z][a-z0-9_]*$/.test(data.id),
      `mobs: id «${data.id}» — не slug-форма`);
  }
  const mobIds = shapeFiles('mobs').map((f) => readJson('mobs', f).id);
  assert.equal(new Set(mobIds).size, 36, 'mobs: id уникальны (36)');
  const mgIds = shapeFiles('mob_groups').map((f) => {
    const data = readJson('mob_groups', f);
    assert.equal(f, MOB_GROUPS_SLUG_00031804[data.id] + '.json',
      `mob_groups: ${f} ≠ таблице id→slug для id ${data.id}`);
    return data.id;
  });
  assert.deepEqual(mgIds.slice().sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7],
    'mob_groups: множество id — ровно {1..7}');
  const dunIds = shapeFiles('dungeons').map((f) => {
    const data = readJson('dungeons', f);
    assert.equal(f, DUNGEON_SLUG_00031804[data.id] + '.json',
      `dungeons: ${f} ≠ таблице id→slug для id ${data.id}`);
    return data.id;
  });
  assert.deepEqual(dunIds.slice().sort((a, b) => a - b), [0, 1, 2, 3, 4],
    'dungeons: множество id — ровно {0..4}');
});

test('000318.04 T2: зеркала позиционно — MOB_GROUPS ids [1..7], DUNGEONS ids [0..4], записи ≡ каталогу (резолв в id); guard: lex-порядок файлов ≠ id-порядку (компаратор наблюдаем)', () => {
  const MG = require(path.join(ROOT, 'src', 'mob-groups-data.js'));
  assert.deepEqual(MG.MOB_GROUPS.map((g) => g.id), [1, 2, 3, 4, 5, 6, 7],
    'MOB_GROUPS: id по позициям (позиция = id − 1 = MOB_GROUP_TYPES)');
  const lexMg = shapeFiles('mob_groups')
    .map((f) => readJson('mob_groups', f).id);
  assert.notDeepEqual(lexMg, [1, 2, 3, 4, 5, 6, 7],
    'guard: lex-порядок slug-файлов совпал с id-порядком — guard T2 '
    + 'стал бы ненаблюдаем (переименовать фикстуру нельзя, порядок — контракт)');
  MG.MOB_GROUPS.forEach((rec, i) => {
    const data = readJson('mob_groups', MOB_GROUPS_SLUG_00031804[i + 1] + '.json');
    const expected = Object.assign({}, data, {
      состав: Object.assign({}, data.состав, {
        мобы: data.состав.мобы.map((m) => {
          assert.ok(JR.isRef(m), `ссылка не isRef: ${m}`);
          return JR.resolveRef(ROOT, m).id;
        }),
      }),
    });
    assert.deepEqual(rec, expected, `MOB_GROUPS[${i}] ≠ каталогу`);
  });
  const DUN = require(path.join(ROOT, 'src', 'dungeons-data.js'));
  assert.deepEqual(DUN.DUNGEONS.map((d) => d.id), [0, 1, 2, 3, 4],
    'DUNGEONS: id по позициям (DUNGEON_TYPES 0..4)');
  const lexDun = shapeFiles('dungeons')
    .map((f) => readJson('dungeons', f).id);
  assert.notDeepEqual(lexDun, [0, 1, 2, 3, 4],
    'guard: lex-порядок slug-файлов dungeons совпал с id-порядком — '
    + 'guard T2 ненаблюдаем');
  DUN.DUNGEONS.forEach((rec, i) => {
    const data = readJson('dungeons', DUNGEON_SLUG_00031804[i] + '.json');
    const expected = Object.assign({}, data);
    if (Array.isArray(data.мобы)) {
      expected.мобы = data.мобы.map((m) => JR.resolveRef(ROOT, m).id);
    }
    if (Array.isArray(data.предметы)) {
      expected.предметы = data.предметы.map((m) => JR.resolveRef(ROOT, m).id);
    }
    if (data.постройка !== undefined) {
      expected.постройка = JR.resolveRef(ROOT, data.постройка).id;
    }
    if (Array.isArray(data.руда)) {
      expected.руда = data.руда.map((r) => Object.assign({}, r,
        r && r.предмет !== undefined
          ? { предмет: JR.resolveRef(ROOT, r.предмет).id } : {}));
    }
    assert.deepEqual(rec, expected, `DUNGEONS[${i}] ≠ каталогу`);
  });
});

test('000318.04 T3: цепочка ссылок — РОВНО 24 mob_groups→mobs + 21 dungeons→mobs в slug-форме (isRef, резолв, id==basename); numeric-форм в данных 0; items/buildings dungeons — numeric', () => {
  const NUM_MOB_REF = /assets\/mobs\/\d{6}\.json/g;
  let nMg = 0;
  for (const f of shapeFiles('mob_groups')) {
    const raw = fs.readFileSync(path.join(ROOT, 'assets', 'mob_groups', f), 'utf8');
    assert.equal((raw.match(NUM_MOB_REF) || []).length, 0,
      `mob_groups/${f}: остались numeric-ссылки на mobs`);
    for (const m of readJson('mob_groups', f).состав.мобы) {
      assert.ok(JR.isRef(m), `mob_groups/${f}: «${m}» — не ref (slug?)`);
      const r = JR.resolveRef(ROOT, m);
      assert.ok(r.ok, `mob_groups/${f}: «${m}» — ${r.reason}`);
      assert.equal(r.id, path.basename(m, '.json'),
        `mob_groups/${f}: id цели «${r.id}» ≠ basename «${m}»`);
      nMg += 1;
    }
  }
  assert.equal(nMg, 24, 'mob_groups→mobs: ровно 24 ссылки (прежний счёт)');
  let nDun = 0;
  for (const f of shapeFiles('dungeons')) {
    const raw = fs.readFileSync(path.join(ROOT, 'assets', 'dungeons', f), 'utf8');
    assert.equal((raw.match(NUM_MOB_REF) || []).length, 0,
      `dungeons/${f}: остались numeric-ссылки на mobs`);
    const data = readJson('dungeons', f);
    for (const m of (data.мобы || [])) {
      assert.ok(JR.isRef(m), `dungeons/${f}: «${m}» — не ref (slug?)`);
      const r = JR.resolveRef(ROOT, m);
      assert.ok(r.ok, `dungeons/${f}: «${m}» — ${r.reason}`);
      assert.equal(r.id, path.basename(m, '.json'),
        `dungeons/${f}: id цели «${r.id}» ≠ basename «${m}»`);
      nDun += 1;
    }
    for (const m of (data.предметы || [])) {
      assert.ok(JR.isRef(m), `dungeons/${f}: предметы «${m}» — не ref`);
      assert.match(m, /^assets\/items\/\d{6}\.json$/,
        `dungeons/${f}: items-ссылка «${m}» — не numeric (шейп items не менялся)`);
    }
    if (data.постройка !== undefined) {
      assert.match(data.постройка, /^assets\/buildings\/\d{6}\.json$/,
        `dungeons/${f}: постройка «${data.постройка}» — не numeric`);
    }
    for (const rec of (data.руда || [])) {
      if (rec && rec.предмет !== undefined) {
        assert.match(rec.предмет, /^assets\/items\/\d{6}\.json$/,
          `dungeons/${f}: руда.предмет «${rec.предмет}» — не numeric`);
      }
    }
  }
  assert.equal(nDun, 21, 'dungeons→mobs: ровно 21 ссылка (прежний счёт)');
});

test('000318.04 T4: REF_RE — побайтовый пин ДВУХгруппного source + таблица истинности формы × каталога', () => {
  assert.equal(JR.REF_RE.source,
    '^assets\\/(items|skills|spells|buildings|craft|npc)\\/\\d{6}\\.json$'
    + '|^assets\\/(mobs|mob_groups|dungeons)\\/[a-z][a-z0-9_]*\\.json$',
    'REF_RE группами по шейпам: number-группа (items первым в '
    + 'REF_LINKED_CATALOGS) + slug-группа (mobs) — drift узаконен .04; '
    + 'рантайм-носитель pattern обновлён в assets/skills/schema.json');
  for (const [p, want] of [
    ['assets/mobs/abomination.json', true],
    ['assets/mobs/000036.json', false],
    ['assets/mob_groups/orc_camp.json', true],
    ['assets/mob_groups/000001.json', false],
    ['assets/dungeons/abyss.json', true],
    ['assets/dungeons/000005.json', false],
    ['assets/items/000001.json', true],
    ['assets/items/wood_sword.json', false],
    ['assets/buildings/000001.json', true],
    ['assets/runes/stone_hide.json', false],
    ['assets/visuals/bush.json', false],
  ]) {
    assert.equal(JR.isRef(p), want, 'isRef: ' + p);
    assert.equal(JR.REF_RE.test(p), want, 'REF_RE ≡ isRef: ' + p);
  }
});

test('000318.04 T5: sync/инструменты — фильтр через живой реестр, schema.json исключён, компаратор по data.id, numeric-фильтра и «0000NN» нет', () => {
  for (const [script, cat] of [
    ['scripts/sync-mob-groups-data.js', 'mob_groups'],
    ['scripts/sync-dungeons-data.js', 'dungeons'],
  ]) {
    const src = fs.readFileSync(path.join(ROOT, script), 'utf8');
    assert.match(src, /require\('\.\/lib\/json-ref\.js'\)/,
      `${script}: нет require lib (фильтр обязан читаться из реестра живо)`);
    assert.ok(src.includes('SHAPE_BASENAME_RES')
      && src.includes(`ASSET_NAME_SHAPES.${cat}`),
      `${script}: фильтр не через SHAPE_BASENAME_RES[ASSET_NAME_SHAPES.${cat}]`);
    assert.ok(src.includes("'schema.json'"),
      `${script}: schema.json не исключён из фильтра (slug-regex матчит его)`);
    assert.ok(!/\\d\{6\}\\\.json\$/.test(src),
      `${script}: остался numeric-фильтр/паттерн имён файлов`);
    assert.ok(!src.includes('0000NN'),
      `${script}: осталось упоминание «0000NN»`);
    assert.match(src, /sort\(\(a, b\) => a\.data\.id - b\.data\.id\)/,
      `${script}: нет компаратора порядка по data.id`);
  }
  const gen = fs.readFileSync(path.join(ROOT, 'scripts/gen-mob-art.js'), 'utf8');
  assert.ok(gen.includes('SHAPE_BASENAME_RES')
    && gen.includes('ASSET_NAME_SHAPES.mobs'),
    'gen-mob-art.js: фильтр mobs не через реестр');
  assert.ok(!/\^\\d\{6\}\\\.json\$/.test(gen),
    'gen-mob-art.js: остался numeric-фильтр каталога mobs');
});

test('000318.04 T6: tmp-дерево — запуск sync-mob-groups-data.js: выход в id-порядке и ≡ закоммиченному зеркалу (lex tmp-порядок ≠ id-порядку)', () => {
  const SYNC = path.join(ROOT, 'scripts', 'sync-mob-groups-data.js');
  const MIRROR = path.join(ROOT, 'src', 'mob-groups-data.js');
  assert.ok(fs.existsSync(SYNC), 'RED: scripts/sync-mob-groups-data.js не существует');
  assert.ok(fs.existsSync(MIRROR), 'RED: зеркало не сгенерировано');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mobs04-00031804-'));
  try {
    for (const d of [['scripts', 'lib'], ['src'], ['assets', 'mob_groups'],
      ['assets', 'mobs']]) {
      fs.mkdirSync(path.join(tmp, ...d), { recursive: true });
    }
    for (const libFile of ['write-atomic.js', 'json-ref.js']) {
      fs.copyFileSync(path.join(ROOT, 'scripts', 'lib', libFile),
        path.join(tmp, 'scripts', 'lib', libFile));
    }
    fs.copyFileSync(SYNC, path.join(tmp, 'scripts', 'sync-mob-groups-data.js'));
    for (const f of shapeFiles('mob_groups')) {
      fs.copyFileSync(path.join(ROOT, 'assets', 'mob_groups', f),
        path.join(tmp, 'assets', 'mob_groups', f));
    }
    for (const f of shapeFiles('mobs')) {
      fs.copyFileSync(path.join(ROOT, 'assets', 'mobs', f),
        path.join(tmp, 'assets', 'mobs', f));
    }
    // Guard наблюдаемости компаратора: lex-имена файлов tmp ≠ id-порядку.
    const lex = fs.readdirSync(path.join(tmp, 'assets', 'mob_groups')).sort()
      .map((f) => JSON.parse(
        fs.readFileSync(path.join(tmp, 'assets', 'mob_groups', f), 'utf8')).id);
    assert.notDeepEqual(lex, [1, 2, 3, 4, 5, 6, 7],
      'guard: lex-порядок tmp-файлов совпал с id — выход не различал бы '
      + 'сортировки');
    const run = spawnSync(process.execPath,
      [path.join(tmp, 'scripts', 'sync-mob-groups-data.js')],
      { encoding: 'utf8' });
    assert.equal(run.status, 0, 'tmp-запуск exit 0: '
      + (run.stderr || run.stdout));
    const tmpMod = require(path.join(tmp, 'src', 'mob-groups-data.js'));
    const committed = require(MIRROR);
    assert.deepEqual(tmpMod.MOB_GROUPS.map((g) => g.id),
      committed.MOB_GROUPS.map((g) => g.id),
      'порядок id выхода — по data.id (по имени файла abyss_spirit встал '
      + 'бы первым вместо седьмого)');
    assert.deepEqual(tmpMod.MOB_GROUPS, committed.MOB_GROUPS,
      'записи выхода ≡ закоммиченному зеркалу');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

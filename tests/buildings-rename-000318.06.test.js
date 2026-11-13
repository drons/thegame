// Задача 000318.06 (родитель 000318): переименование assets/buildings —
// 0000NN.json → <slug>.json (55 файлов; имя-носитель — basename поля
// «спрайт» для 29 записей (25 × assets/sprites/buildings/<slug>.svg +
// 4 города 51–54 × assets/sprites/cities/city_5N.svg — прецедент visuals
// .03: имя НЕ равно id, носитель имени — спрайт) и РУКОПИСНАЯ таблица
// BUILDING_SLUG_00031806 для 26 записей БЕЗ «спрайт» (иконки numeric
// assets/building-icons/0000NN.svg — контракт 000293, их имена НЕ
// трогаются) — прецедент .04 mob_groups/dungeons) с флипом реестра
// ASSET_NAME_SHAPES.buildings = 'slug'. buildings ∈ REF_LINKED_CATALOGS
// (МИШЕНЬ ссылок: ~1044 входа из craft/spells/npc/dungeons) ⇒ REF_RE
// ДРЕЙФУЕТ: number-группа теряет buildings, slug-группа получает его
// (прецедент .04/.05) — побайтовый пин AR11 и все дубли source в
// rename-тестах перепинуты в том же коммите. ЗЕРКАЛО — БЛОК BUILDINGS в
// src/buildings.js (НЕ buildings-data.js): sync сортирует ПО data.id
// (прежний .sort() по имени файла был контрактом id-порядка; lex-порядок
// slug ≠ id-порядку ⇒ компаратор обязателен, иначе сдвиг позиционного
// контракта — guard T2/T5). Аудит потребителей порядка (память
// memory/000318-buildings.md): видимого сдвига нет — CHANGELOG без
// буллета. Контекст разбивки — tasks/result/000318-split-20261108.md,
// реестр — memory/000318-asset-rename.md, контракт —
// memory/000318-buildings.md.
//
// КРАСНЫЕ тесты (TDD): до rename/флипа T1–T9 краснеют ОСМЫСЛЕННО
// (ERR_ASSERTION: шейп number, файлы numeric, зеркальные комментарии
// числовые, REF_RE прежний source, sync-грепы не найдены, numeric-пути
// referrer'ов ещё есть), без краха загрузки.
//
// Контракты:
//   * T1 — ростер: 55 файлов ≡ пин-множеству slug-имён, 0 numeric;
//     basename == NameOf (29 — basename «спрайт», 26 — таблица);
//     id === прежнему номеру файла (множество id — ровно 1..55);
//     schema.json ∈ slug-regex (исключение обязательно в каждом фильтре).
//   * T2 — зеркало: BUILDINGS позиции — id СТРОГО возрастающий 1..55;
//     записи deepEqual каталогу byId (резолв items/skills-ссылок в
//     id-форму); построчные комментарии «// <slug>.json», numeric-имён в
//     зеркале нет; guard: lex-порядок файлов ≠ id-порядку (наблюдаемость
//     компаратора — прецедент visuals T3).
//   * T3 — REF_RE побайтовый пин НОВОГО двухгруппного source (number:
//     items|skills|craft|npc; slug: spells|mobs|mob_groups|buildings|
//     dungeons — порядок групп = REF_LINKED_CATALOGS) + таблица
//     истинности (buildings slug — ref, buildings numeric — НЕ ref).
//   * T4 — схемы-носители: skills ×2 ≡ живой REF_RE.source; dungeons ×4
//     composite (buildings в slug-ветке); craft «здания» / spells
//     «здания» / npc «постройки» — slug-паттерны.
//   * T5 — referrer-свип: numeric-путей «assets/buildings/\d{6}\.json»
//     в данных/рантайме (assets/**.json, src/**.js, scripts/**.js,
//     index.html) РОВНО 0 (страж полноты M-sweep: после флипа numeric —
//     НЕ ref, AR8 их НЕ видит); при этом позитивный свип: каждая
//     buildings-ссылка в craft/spells/npc/dungeons — slug, isRef, резолв
//     ok, id == прежнему номеру файла имени (анти-вакуум + счётчик).
//   * T6 — sync-buildings-data.js: фильтр ЧЕРЕЗ живой реестр lib +
//     ЯВНОЕ исключение schema.json + компаратор по data.id; numeric-
//     фильтра, гарда «id ≠ номер файла» и «0000NN» нет.
//   * T7 — tmp-дерево (копирка scripts/lib ОБА файла — write-atomic +
//     json-ref, прецедент MODULE_NOT_FOUND): sync на полном каталоге
//     (schema.json внутри) — выход ПОБАЙТОВО ≡ закоммиченному зеркалу,
//     повтор идемпотентен; перестановка СОДЕРЖИМОГО имя↔имя пары файлов
//     — выход всё равно в id-порядке и ≡ зеркалу (сортировка по имени
//     вынесла бы abandoned_temple в начало).
//   * T8 — sync-npc-data.js buildRefMap: shape-aware (buildings-ключи
//     карты — slug-файлы каталога, schema.json исключён); на РЕАЛЬНЫХ
//     данных sync-npc резолвит все 34 npc («постройки» → целые id).
//   * T9 — иконки 0-diff: assets/building-icons РОВНО 26 numeric-имён
//     (контракт 000293 BI-2), assets/sprites/buildings РОВНО 53 svg,
//     assets/sprites/cities ⊇ city_51..54; icon у всех 55 записей —
//     прежний побайтовый; уникальность icon 55.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'assets', 'buildings');
const MIRROR = path.join(ROOT, 'src', 'buildings.js');
const SYNC = path.join(ROOT, 'scripts', 'sync-buildings-data.js');
const SYNC_NPC = path.join(ROOT, 'scripts', 'sync-npc-data.js');
const JR = require('../scripts/lib/json-ref.js');

// Имя-носитель: 29 записей — basename поля «спрайт» (25 buildings-svg +
// 4 города city_5N — basename всё равно slug-легalen); 26 записей БЕЗ
// «спрайт» — РУКОПИСНАЯ таблица (прецедент .04 mob_groups/dungeons: для
// них имя существует ТОЛЬКО здесь и в памяти). 32–34/35 зеркалят slug
// связанных подземелий (crypt/castle_ruins/flooded_cave/abyss).
const BUILDING_SLUG_00031806 = {
  1: 'weapons_shop', 2: 'armor_shop', 3: 'apothecary', 4: 'magic_shop',
  5: 'wanderer_shop', 6: 'universam', 7: 'arena', 8: 'blacksmith',
  9: 'gladiator_yard', 10: 'archery_range', 11: 'academy',
  12: 'hunting_estate', 13: 'gymnasium', 14: 'gladiator_camp',
  15: 'bathhouse', 16: 'library', 17: 'alchemy_lab', 18: 'mage_tower',
  19: 'monastery', 20: 'elders_hut', 21: 'healing_temple',
  22: 'tavern_school', 23: 'theater', 24: 'town_hall', 25: 'npc_house',
  26: 'healer_house', 27: 'scribe_house', 28: 'merchant_house',
  29: 'hermit_hut', 30: 'orc_pagan_house', 31: 'cave_entrance',
  32: 'crypt', 33: 'castle_ruins', 34: 'flooded_cave', 35: 'abyss',
  36: 'temple', 37: 'moon_temple', 38: 'mountain_temple',
  39: 'abandoned_temple', 40: 'rune_stone', 41: 'teleport_circle',
  42: 'obelisk', 43: 'magic_circle', 44: 'tavern', 45: 'well',
  46: 'watchtower', 47: 'camp', 48: 'ruins', 49: 'fountain',
  50: 'bridge_gate', 51: 'city_51', 52: 'city_52', 53: 'city_53',
  54: 'city_54', 55: 'storage',
};
// id с полем «спрайт» (29): имя = basename(«спрайт») — NameOf по спрайту.
const SPRITE_BORN_00031806 = new Set([
  1, 2, 3, 4, 7, 8, 10, 11, 25, 31, 36, 37, 38, 39, 40, 41, 42, 43, 44,
  45, 46, 47, 48, 49, 51, 52, 53, 54, 55,
]);

const BUILDING_SLUG_FILES_00031806 = Object.values(BUILDING_SLUG_00031806)
  .map((s) => s + '.json').sort();

function nameOf(data) {
  if (typeof data.спрайт === 'string') {
    return path.basename(data.спрайт, '.svg') + '.json';
  }
  return BUILDING_SLUG_00031806[data.id] + '.json';
}

function shapeFiles(dir) {
  return shapeFilesOf(dir, 'buildings');
}

function shapeFilesOf(dir, cat) {
  const re = JR.SHAPE_BASENAME_RES[JR.ASSET_NAME_SHAPES[cat]];
  return fs.readdirSync(dir)
    .filter((f) => f !== 'schema.json' && re.test(f)).sort();
}

function readJson(f) {
  return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
}

// Запись в id-форме — то же преобразование, что sync-buildings-data.js:
// .стройка.исходники[].предмет (items) и «тренирует» (skills) → id цели.
function resolveRecord(data) {
  const out = JSON.parse(JSON.stringify(data));
  const op = out.особые_параметры;
  const s = op && op.стройка;
  if (s && Array.isArray(s.исходники)) {
    for (const e of s.исходники) {
      if (e && typeof e.предмет === 'string'
        && /^assets\/items\/\d{6}\.json$/.test(e.предмет)) {
        e.предмет = JR.resolveRef(ROOT, e.предмет).id;
      }
    }
  }
  const tr = op && op.тренирует;
  if (tr && Array.isArray(tr)) {
    out.особые_параметры.тренирует = tr.map((v) => {
      const r = JR.resolveRef(ROOT, v);
      assert.ok(r.ok, `тренирует «${v}» — ${r.reason}`);
      return r.id;
    });
  }
  return out;
}

test('000318.06 T1: ростер — шейп slug, 55 файлов ≡ пин-множеству, 0 numeric; basename == NameOf (29 — «спрайт», 26 — таблица); id === прежнему номеру (множество 1..55); schema.json ∈ slug-regex', () => {
  assert.equal(JR.ASSET_NAME_SHAPES.buildings, 'slug',
    'buildings: шейп в реестре — slug (000318.06)');
  const all = fs.readdirSync(DIR);
  const numeric = all.filter((f) => /^\d{6}\.json$/.test(f));
  assert.deepEqual(numeric, [],
    'buildings: остались numeric-файлы после rename: ' + numeric.join(', '));
  assert.ok(JR.SHAPE_BASENAME_RES.slug.test('schema.json'),
    'guard: schema.json обязан матчиться slug-regex (иначе фильтр-исключение '
    + 'ничего не сторожит — прецедент .02)');
  const files = shapeFiles(DIR);
  assert.deepEqual(files, BUILDING_SLUG_FILES_00031806,
    'buildings: 55 файлов ≡ пин-множеству slug-имён (состав пиннован '
    + 'целиком — прецедент visuals .03 / mobs .04)');
  const ids = [];
  for (const f of files) {
    const data = readJson(f);
    assert.ok(Number.isInteger(data.id) && data.id >= 1 && data.id <= 55,
      `buildings/${f}: id «${data.id}» — не число 1..55`);
    if (SPRITE_BORN_00031806.has(data.id)) {
      assert.equal(typeof data.спрайт, 'string',
        `${f}: id ${data.id} — «спрайт» обязан быть (29 спрайт-записей)`);
    } else {
      assert.ok(!('спрайт' in data),
        `${f}: id ${data.id} — не спрайт-запись, поля «спрайт» быть не должно`);
    }
    assert.equal(f, nameOf(data),
      `buildings: basename ≠ NameOf-имени (${f}, ожидалось «${nameOf(data)}») `
      + '— гибрид: 29 по «спрайт», 26 по таблице 000318.06');
    ids.push(data.id);
  }
  assert.deepEqual([...ids].sort((a, b) => a - b),
    Array.from({ length: 55 }, (_, i) => i + 1),
    'buildings: множество id — ровно 1..55 (id == прежнему номеру файла, '
    + 'контент 0-diff под R100)');
});

test('000318.06 T2: зеркало — BUILDINGS id-порядок СТРОГО возрастающий 1..55, записи ≡ каталогу byId (резолв в id-форму); комментарии «// <slug>.json», numeric-имён нет; guard lex ≠ id (компаратор наблюдаем)', () => {
  const { BUILDINGS } = require(MIRROR);
  const ids = BUILDINGS.map((b) => b.id);
  assert.deepEqual(ids, Array.from({ length: 55 }, (_, i) => i + 1),
    'BUILDINGS: порядок id — не 1..55 (sync обязан сортировать по data.id: '
    + 'lex-порядок slug-файлов ≠ id-порядку, прежний .sort() по имени '
    + 'сдвинул бы позиционный контракт)');
  const byFile = new Map();
  for (const f of shapeFiles(DIR)) {
    const data = readJson(f);
    byFile.set(data.id, data);
  }
  assert.equal(byFile.size, 55, 'каталог: 55 записей по id');
  for (const b of BUILDINGS) {
    assert.ok(byFile.has(b.id), `BUILDINGS: id ${b.id} нет в каталоге`);
    assert.deepEqual(b, resolveRecord(byFile.get(b.id)),
      `id ${b.id}: зеркало ≠ каталогу (резолв items/skills-ссылок в id)`);
  }
  const text = fs.readFileSync(MIRROR, 'utf8');
  const bIdx = text.indexOf('// BEGIN GENERATED (scripts/sync-buildings-data.js)');
  const eIdx = text.indexOf('// END GENERATED', bIdx);
  assert.ok(bIdx !== -1 && eIdx > bIdx, 'маркеры GENERATED-блока на месте');
  const block = text.slice(bIdx, eIdx);
  assert.ok(block.includes('    // camp.json\n'),
    'построчный комментарий «// camp.json» (slug-имя, id 47)');
  assert.ok(block.includes('    // weapons_shop.json\n'),
    'построчный комментарий «// weapons_shop.json» (slug-имя, id 1)');
  assert.ok(!/^\s*\/\/ 000\d{3}\.json$/m.test(block),
    'в блоке зеркала остались числовые комментарии-файлы «// 0000NN.json»');
  // Guard наблюдаемости компаратора (прецедент visuals T3): lex-порядок
  // slug-имён ОТЛИЧАЕТСЯ от id-порядка — иначе сортировка «по имени» и
  // «по id» неразличимы и T7-перестановка ничего не сторожит.
  const lexIds = shapeFiles(DIR)
    .map((f) => readJson(f).id)
    .sort((a, b) => a - b);
  assert.notDeepEqual(
    shapeFiles(DIR).map((f) => readJson(f).id), lexIds,
    'lex-порядок файлов == id-порядку (guard устарел: компаратор '
    + 'наблюдаемый только при различии порядков)');
});

test('000318.06 T3: REF_RE — побайтовый пин НОВОГО двухгруппного source со buildings в slug-ветке + таблица истинности', () => {
  assert.equal(JR.REF_RE.source,
    '^assets\\/(items|skills|npc)\\/\\d{6}\\.json$'
    + '|^assets\\/(spells|mobs|mob_groups|buildings|craft|dungeons)\\/[a-z][a-z0-9_]*\\.json$',
    'REF_RE группами по шейпам: number (items/skills/npc) + slug '
    + '(spells/mobs/mob_groups/buildings/craft/dungeons — buildings встал после '
    + 'mob_groups по REF_LINKED_CATALOGS, craft — после buildings в 000318.07); '
    + 'прежний source (craft в number-группе) — «до 000318.07»; '
    + 'рантайм-носитель — pattern в '
    + 'assets/skills/schema.json (SR5/skills.test сверяют живо)');
  for (const [p, want] of [
    ['assets/buildings/weapons_shop.json', true],
    ['assets/buildings/city_54.json', true],
    ['assets/buildings/camp.json', true],
    ['assets/buildings/' + '000001' + '.json', false],
    ['assets/buildings/' + '000054' + '.json', false],
    ['assets/items/000001.json', true],
    ['assets/craft/iron_sword.json', true],
    ['assets/spells/spark.json', true],
    ['assets/dungeons/abyss.json', true],
    ['assets/npc/000018.json', true],
    ['assets/runes/stone_hide.json', false],
  ]) {
    assert.equal(JR.isRef(p), want, 'isRef: ' + p);
    assert.equal(JR.REF_RE.test(p), want, 'REF_RE ≡ isRef: ' + p);
  }
});

test('000318.06 T4: схемы-носители — skills ×2 ≡ живой REF_RE.source; dungeons ×4 composite (buildings в slug-ветке); craft/spells «здания» и npc «постройки» — slug-паттерны', () => {
  const live = JR.REF_RE.source;
  const skills = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'assets', 'skills', 'schema.json'), 'utf8'));
  const secSkills = skills.oneOf[1];
  assert.equal(secSkills.properties.primary.pattern, live,
    'skills/schema.json: secondary.primary ≢ живому REF_RE.source');
  assert.equal(secSkills.properties.requires.properties.skill.pattern, live,
    'skills/schema.json: secondary.requires.skill ≢ живому REF_RE.source');
  const dungs = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'assets', 'dungeons', 'schema.json'), 'utf8'));
  const UNION = '^assets/((items|skills|npc)/\\d{6}'
    + '|(spells|mobs|mob_groups|buildings|craft|dungeons)/[a-z][a-z0-9_]*)\\.json$';
  assert.equal(dungs.properties.мобы.items.pattern, UNION,
    'dungeons/schema.json: «мобы» — buildings не в slug-ветке');
  assert.equal(dungs.properties.предметы.items.pattern, UNION,
    'dungeons/schema.json: «предметы» — buildings не в slug-ветке');
  assert.equal(dungs.properties.постройка.pattern, UNION,
    'dungeons/schema.json: «постройка» — buildings не в slug-ветке');
  assert.equal(dungs.properties.руда.items.properties.предмет.pattern, UNION,
    'dungeons/schema.json: «руда.предмет» — buildings не в slug-ветке');
  const SLUG_BUILDING = '^assets/buildings/[a-z][a-z0-9_]*\\.json$';
  const craft = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'assets', 'craft', 'schema.json'), 'utf8'));
  assert.equal(craft.properties.здания.items.pattern, SLUG_BUILDING,
    'craft/schema.json: «здания» — не slug');
  const spells = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'assets', 'spells', 'schema.json'), 'utf8'));
  assert.equal(spells.properties.здания.items.pattern, SLUG_BUILDING,
    'spells/schema.json: «здания» — не slug');
  const npc = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'assets', 'npc', 'schema.json'), 'utf8'));
  assert.equal(npc.properties.постройки.items.pattern, SLUG_BUILDING,
    'npc/schema.json: «постройки» — не slug');
});

test('000318.06 T5: referrer-свип — numeric-путей buildings в данных/рантайме РОВНО 0 (после флипа numeric — НЕ ref, AR8 их не видит — единственный страж); позитивно: каждая buildings-ссылка — slug, резолв ok, id == прежнему номеру', () => {
  const NUM_RE = /assets\/buildings\/\d{6}\.json/;
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
    'остались numeric-пути buildings (M-sweep неполон — после флипа они '
    + 'невидимы AR8): ' + hits.join(', '));
  // Позитивный свип referrer-каталогов (тестовые негативные фикстуры —
  // вне скоупа: tests/ намеренно содержит отрицания, паттерн .05 T3).
  const EXPECT_ID = {};
  for (const [id, slug] of Object.entries(BUILDING_SLUG_00031806)) {
    EXPECT_ID[slug] = Number(id);
  }
  let total = 0;
  for (const cat of ['craft', 'spells', 'npc', 'dungeons']) {
    const dir = path.join(ROOT, 'assets', cat);
    for (const f of shapeFilesOf(dir, cat)) {
      const data = JSON.parse(
        fs.readFileSync(path.join(dir, f), 'utf8'));
      const refs = JR.collectRefs(data)
        .filter(({ ref }) => ref.startsWith('assets/buildings/'));
      for (const { path: where, ref } of refs) {
        total += 1;
        const slug = path.basename(ref, '.json');
        assert.ok(slug in EXPECT_ID,
          `${cat}/${f} ${where}: неизвестный buildings-slug «${slug}»`);
        const r = JR.resolveRef(ROOT, ref);
        assert.ok(r.ok, `${cat}/${f} ${where}: «${ref}» — ${r.reason}`);
        assert.equal(r.id, EXPECT_ID[slug],
          `${cat}/${f} ${where}: id цели ${r.id} ≠ прежнему номеру `
          + `файла для «${slug}» (${EXPECT_ID[slug]})`);
      }
    }
  }
  assert.ok(total >= 1044,
    'анти-вакуум: buildings-ссылок в referrer-каталогах было ≥1044 на базе; '
    + `факт: ${total} (потерянных ссылок быть не должно — AR8 их не заметит)`);
});

test('000318.06 T6: sync-buildings-data.js — фильтр через живой реестр, schema.json исключён, компаратор по data.id; numeric-фильтра, гарда «id ≠ номер файла» и «0000NN» нет', () => {
  const src = fs.readFileSync(SYNC, 'utf8');
  assert.match(src, /require\('\.\/lib\/json-ref\.js'\)/,
    'sync: нет require lib (фильтр обязан читаться из реестра живо)');
  assert.ok(src.includes('SHAPE_BASENAME_RES')
    && src.includes('ASSET_NAME_SHAPES.buildings'),
    'sync: фильтр не через SHAPE_BASENAME_RES[ASSET_NAME_SHAPES.buildings]');
  assert.ok(src.includes("'schema.json'"),
    'sync: schema.json не исключён из фильтра (slug-regex матчит его — '
    + 'прецедент .02)');
  assert.ok(!/\\d\{6\}\\\.json\$/.test(src),
    'sync: остался numeric-фильтр/паттерн имён файлов');
  assert.ok(!src.includes('0000NN'),
    'sync: осталось упоминание «0000NN»');
  assert.ok(!src.includes('id ≠ номер файла'),
    'sync: гард «id ≠ номер файла» ещё снимает валидные slug-файлы');
  assert.match(src, /\.sort\(\(a, b\) => a\.data\.id - b\.data\.id/,
    'sync: нет компаратора порядка по data.id (lex slug ≠ id ⇒ сдвиг '
    + 'позиционного контракта BUILDINGS)');
});

// tmp-«репозиторий»: sync-buildings + lib ОБА файла (write-atomic +
// json-ref — прецедент MODULE_NOT_FOUND .01–.05) + ПОЛНЫЙ каталог
// buildings (schema.json внутри) + цели ссылок (items/skills) из данных.
function makeTmpBuildingsTree() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'buildings-00031806-'));
  for (const sub of ['scripts/lib', 'src', 'assets/buildings',
    'assets/items', 'assets/skills']) {
    fs.mkdirSync(path.join(tmp, sub), { recursive: true });
  }
  for (const libFile of ['write-atomic.js', 'json-ref.js']) {
    fs.copyFileSync(path.join(ROOT, 'scripts', 'lib', libFile),
      path.join(tmp, 'scripts', 'lib', libFile));
  }
  fs.copyFileSync(SYNC, path.join(tmp, 'scripts', 'sync-buildings-data.js'));
  fs.copyFileSync(MIRROR, path.join(tmp, 'src', 'buildings.js'));
  fs.copyFileSync(path.join(DIR, 'schema.json'),
    path.join(tmp, 'assets', 'buildings', 'schema.json'));
  for (const f of shapeFiles(DIR)) {
    fs.copyFileSync(path.join(DIR, f), path.join(tmp, 'assets', 'buildings', f));
    const data = readJson(f);
    const op = data.особые_параметры;
    const refs = [];
    const s = op && op.стройка;
    if (s && Array.isArray(s.исходники)) {
      for (const e of s.исходники) refs.push(e.предмет);
    }
    if (op && Array.isArray(op.тренирует)) refs.push(...op.тренирует);
    for (const ref of refs) {
      if (typeof ref !== 'string') continue;
      const dst = path.join(tmp, ref);
      if (!fs.existsSync(dst)) {
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(path.join(ROOT, ref), dst);
      }
    }
  }
  return tmp;
}

test('000318.06 T7: tmp-дерево — sync на полном каталоге (schema.json внутри) побайтово ≡ закоммиченному зеркалу и идемпотентен; перестановка СОДЕРЖИМОГО пары файлов — выход всё равно в id-порядке и ≡ зеркалу (компаратор наблюдаем)', () => {
  assert.ok(fs.existsSync(SYNC), 'RED: scripts/sync-buildings-data.js не существует');
  assert.ok(fs.existsSync(MIRROR), 'RED: зеркало не сгенерировано');
  for (const f of ['weapons_shop.json', 'abandoned_temple.json']) {
    assert.ok(fs.existsSync(path.join(DIR, f)),
      'RED: каталог не переименован — нет файла ' + f);
  }
  const committed = fs.readFileSync(MIRROR, 'utf8');
  const tmp = makeTmpBuildingsTree();
  const script = path.join(tmp, 'scripts', 'sync-buildings-data.js');
  const out = path.join(tmp, 'src', 'buildings.js');
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
    // Перестановка СОДЕРЖИМОГО пары (lex-первый slug-файл ↔ lex-поздний):
    // сортировка по имени поставила бы abandoned_temple (в нём оказался
    // id 1) в НАЧАЛО блока — при компараторе по data.id выход не меняется.
    const a = path.join(tmp, 'assets', 'buildings', 'abandoned_temple.json');
    const b = path.join(tmp, 'assets', 'buildings', 'weapons_shop.json');
    const aRaw = fs.readFileSync(a, 'utf8');
    const bRaw = fs.readFileSync(b, 'utf8');
    fs.writeFileSync(a, bRaw, 'utf8');
    fs.writeFileSync(b, aRaw, 'utf8');
    const run3 = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    assert.equal(run3.status, 0, 'tmp-запуск после перестановки: '
      + (run3.stderr || run3.stdout));
    const blockOf = (text) => text.slice(
      text.indexOf('const BUILDINGS = ['),
      text.indexOf('// END GENERATED'))
      .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    assert.equal(blockOf(fs.readFileSync(out, 'utf8')),
      blockOf(committed),
      'порядок записей выхода — по data.id (по имени файла '
      + 'abandoned_temple с id-1-содержимым встал бы первым вместо 39-го; '
      + 'комментарий-файл сопровождает запись и после перестановки '
      + 'отличается законно — сравниваются только записи)');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('000318.06 T8: sync-npc-data.js buildRefMap — shape-aware (buildings-ключи — slug-файлы каталога, schema.json исключён); на реальных данных — exit 0, зеркало в id-форме', () => {
  const src = fs.readFileSync(SYNC_NPC, 'utf8');
  assert.ok(!/buildRefMap[\s\S]{0,400}\/\^\\d\{6\}\\\.json\$/.test(src),
    'buildRefMap: numeric-фильтр каталога целей — после rename карта '
    + 'buildings стала бы ПУСТОЙ и sync упал бы «ссылка не резолвится» '
    + 'на всех npc (главная ловушка .06, мутация M4)');
  // Реальный прогон: tmp-копия репо дорогого не требует — sync идемпотен
  // на настоящем дереве (записывает зеркало атомарно; сравнение с
  // закоммиченным — sync:check, здесь — exit 0 + форма).
  const run = spawnSync(process.execPath, [SYNC_NPC],
    { cwd: ROOT, encoding: 'utf8' });
  assert.equal(run.status, 0,
    'sync-npc на реальных данных: ' + (run.stderr || run.stdout));
  const { NPCS } = require(path.join(ROOT, 'src', 'npc-data.js'));
  assert.equal(NPCS.length, 47, 'зеркало NPCS — 47 записей (ре-пин 000320.15: Пергамент; 000320.16: Пробник; 000320.17: Переписчик; 000320.18: Странствующий торговец; 000320.19: Торговец специями; 000320.20: Торговец каравана; 000347.02: жрец солнца, жрица луны, горный жрец; 000320.21: Проводник; 000320.22: Перекати; 000320.23: Сарбон; 000320.24: Просол; 000320.25: Насечка; 000320.26: Костяшка)');
  for (const n of NPCS) {
    for (const b of n.постройки) {
      assert.ok(Number.isInteger(b),
        `${n.id}: постройки в зеркале — целые id, факт ${JSON.stringify(b)}`);
    }
  }
});

test('000318.06 T9: иконки 0-diff — building-icons РОВНО 26 numeric (BI-2 000293), sprites/buildings РОВНО 53 svg, city_51..54 на месте; icon записей побайтово прежние, уникальность 55', () => {
  const iconFiles = fs.readdirSync(path.join(ROOT, 'assets', 'building-icons'));
  assert.deepEqual(iconFiles.filter((f) => f.endsWith('.svg')).sort(),
    Array.from({ length: 26 }, (_, i) =>
      String([5, 6, 9, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
        26, 27, 28, 29, 30, 32, 33, 34, 35, 50][i]).padStart(6, '0') + '.svg')
      .sort(),
    'assets/building-icons — те же 26 numeric-имён (rename JSON их НЕ трогает)');
  const spr = fs.readdirSync(path.join(ROOT, 'assets', 'sprites', 'buildings'));
  assert.equal(spr.filter((f) => f.endsWith('.svg')).length, 53,
    'assets/sprites/buildings — 53 svg (25 баз + 28 tier-вариантов) без изменений');
  const cities = fs.readdirSync(path.join(ROOT, 'assets', 'sprites', 'cities'));
  for (const n of [51, 52, 53, 54]) {
    assert.ok(cities.includes(`city_${n}.svg`), `city_${n}.svg на месте`);
  }
  const icons = new Set();
  for (const f of shapeFiles(DIR)) {
    const data = readJson(f);
    const n = data.id;
    const expected = SPRITE_BORN_00031806.has(n)
      ? data.спрайт
      : `assets/building-icons/${String(n).padStart(6, '0')}.svg`;
    assert.equal(data.icon, expected,
      `${f}: icon сместился — rename НЕ трогает иконки (0-diff)`);
    assert.ok(fs.existsSync(path.join(ROOT, data.icon)),
      `${f}: файла иконки нет: ${data.icon}`);
    icons.add(data.icon);
  }
  assert.equal(icons.size, 55, 'уникальность icon по 55 записям');
});

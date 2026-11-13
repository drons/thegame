// Задача 000318.07 (родитель 000318): переименование assets/craft —
// 0000NN.json → <id>.json (643 файла; имя-носитель — строковый id того же
// файла, как runes .02 и spells .05) с флипом реестра
// ASSET_NAME_SHAPES.craft = 'slug'. craft ∈ REF_LINKED_CATALOGS (мишень
// ссылок: «база» внутри самого каталога + effect.recipe чертежей
// assets/items) ⇒ REF_RE ДРЕЙФУЕТ: number-группа теряет craft, slug-группа
// получает его (порядок REF_LINKED_CATALOGS: …buildings|craft|dungeons) —
// побайтовый пин AR11 и все дубли source в rename-тестах перепинуты в том
// же коммите. СЕГМЕНТНЫЙ пин каталога (дыры 000200–000209, 000238–000259,
// 000288–000309, 000338–000359 — резервы волн 000230.x) после rename
// ЗАМЕНЁН свипом basename == id: числовые дыры теряют смысл (имена больше
// не нумерованные), полноту состава сторожат счётчик 643 + уникальность id
// + побайтовая сверка зеркала (решение — memory/000318.07-craft-slug-
// rename.md). ЗЕРКАЛО — src/craft-data.js: sync сортирует ПО data.id
// (прежний .sort() по имени файла был контрактом ПОРЯДКА НОМЕРОВ файлов,
// а не id-порядку ⇒ после rename компаратор обязателен: 641 запись из 643
// меняет позицию). Аудит потребителей порядка: единственный —
// DISASSEMBLY_BY_ITEM (src/craft.js:208, тай-брейк «первый по порядку
// каталога»); единственный тай (предмет 000002: iron_sword ↔ 000015
// iron_sword_ore, оба ур. 2) разрешается в того же победителя префиксным
// правилом lex — поведение сохранено (пин craft-disassemble D2).
// Контекст разбивки — tasks/result/000318-split-20261108.md, реестр —
// memory/000318-asset-rename.md, контракт — memory/000318.07-craft-slug-
// rename.md.
//
// КРАСНЫЕ тесты (TDD): до rename/флипа краснеют ОСМЫСЛЕННО 9 из 10
// (T1–T7, T9, T10; ERR_ASSERTION: шейп number, файлы numeric, зеркальный
// порядок и комментарии числовые, REF_RE прежний source, sync-грепы не
// найдены, numeric-пути «база»/recipe ещё есть, spec § старый), без краха
// загрузки. T8 — ГЕЙТ-страж «вне scope не тронуто»: он зелёный и ДО (его
// назначение — подтвердить, что rename не задел зеркало предметов), а зуб
// у него мутационный: правка src/items-data.js в рабочем дереве красит
// РОВНО T8 (сверка рабочего файла с блобом HEAD — конвенция npc-refs:400)
// + счётчики 643/612/579/546/33/43 (матрица — tasks/result/000318.07.md).
//
// Контракты:
//   * T1 — ростер: шейп craft == slug, 643 файла, 0 numeric-имён,
//     basename == id каждого файла, id уникальны, schema.json ∈ slug-regex
//     (guard: исключение обязательно).
//   * T2 — зеркало: CRAFT — строгий lex-порядок по id (≠ прежнему
//     номерному), записи ≡ каталогу (резолв ссылок в id-форму),
//     комментарии «// <id>.json», numeric-имён в зеркале нет, шапка-range
//     из slug-имён.
//   * T3 — REF_RE побайтовый пин НОВОГО двухгруппного source (number:
//     items|skills|npc; slug: spells|mobs|mob_groups|buildings|craft|
//     dungeons) + таблица истинности (craft slug — ref, craft numeric —
//     НЕ ref).
//   * T4 — схемы-носители: skills ×2 ≡ живому REF_RE.source; dungeons ×4
//     composite (craft в slug-ветке); craft «база» и items «recipe» —
//     slug-паттерны каталога craft.
//   * T5 — referrer-свип: numeric-путей «assets/craft/\d{6}\.json» в
//     данных/рантайме РОВНО 0 (после флипа numeric — НЕ ref, AR8 их не
//     видит — единственный страж); позитивно: 43 self-«база» + 6
//     items-recipe — slug, isRef, резолв ok, id цели == прежнему номеру
//     файла.
//   * T6 — grep-пины scripts/sync-craft-data.js: фильтр ЧЕРЕЗ живой
//     реестр lib + ЯВНОЕ исключение schema.json + компаратор по data.id;
//     numeric-фильтра, «0000NN» и сортировки по имени файла нет.
//   * T7 — tmp-дерево (копирка scripts/lib ОБА файла — write-atomic +
//     json-ref): sync на полном каталоге (schema.json внутри) — выход
//     ПОБАЙТОВО ≡ закоммиченному зеркалу, повтор идемпотентен;
//     перестановка СОДЕРЖИМОГО пары файлов — записи всё равно в id-порядке
//     (компаратор наблюдаем).
//   * T8 — 0-diff стражи: src/items-data.js ПОБАЙТОВО прежний (эффект
//     чертежей хранит РАЗРЕШЁННЫЙ id, не путь) + счётчики 643/612/546/33
//     инвариантны.
//   * T9 — SPEC-guard (прецедент 000318.05 T8/000338): § «Архитектура
//     хранения (каталог assets/craft)» — slug-именование `<id>.json` +
//     basename === `id`, БЕЗ «сквозная нумерация» / numeric-имён /
//     «нумерацию»; ЧИСЛО СТРОК spec/craft.md не двигается (пин
//     SPEC_FILE_LINES в tests/spec-split.test.js — line-neutral правка).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'assets', 'craft');
const ITEMS_DIR = path.join(ROOT, 'assets', 'items');
const MIRROR = path.join(ROOT, 'src', 'craft-data.js');
const SYNC = path.join(ROOT, 'scripts', 'sync-craft-data.js');
const JR = require('../scripts/lib/json-ref.js');

const NUM_RE = /^\d{6}\.json$/;

function craftFiles() {
  const re = JR.SHAPE_BASENAME_RES[JR.ASSET_NAME_SHAPES.craft];
  return fs.readdirSync(DIR)
    .filter((f) => f !== 'schema.json' && re.test(f)).sort();
}

function readCraft(f) {
  return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
}

// 43 self-ссылки «база» ДО rename: [прежний номер файла, его id, прежний
// номер цели, id цели]. Снимок базы c0013918 (grep '^assets/craft/[0-9]'
// по assets/craft/*.json → ровно 43 файла) — МАППИНГ номер→id снят с
// ЖИВОГО диска до rename (scripts/sync-craft-data.js резолвит «база» в id
// цели, так что номер файла в тесте — историческая справка; инвариант
// «тот же рецепт, что и до rename» держат T2 «база == id цели» + T7
// побайтовая генерация + T5 резолв каждой цели).
const BASE_SELF_00031807 = [
  ['000009', 'iron_sword_fine', '000001', 'iron_sword'],
  ['000010', 'healing_potion_fine', '000004', 'healing_potion'],
  ['000020', 'steel_sword_ore', '000015', 'iron_sword_ore'],
  ['000021', 'war_hammer_copper', '000003', 'war_hammer'],
  ['000022', 'war_hammer_mithril', '000021', 'war_hammer_copper'],
  ['000023', 'quartz_chisel', '000013', 'stone_chisel'],
  ['000028', 'mana_elixir_rare', '000006', 'mana_elixir'],
  ['000029', 'knight_plate_ruby', '000007', 'knight_plate'],
  ['000030', 'hunting_bow_sapphire', '000008', 'hunting_bow'],
  ['000031', 'amethyst_moonstone', '000019', 'moonstone_runes'],
  ['000057', 'rune_hoop_mithril', '000054', 'rune_hoop'],
  ['000058', 'star_hoop_mithril', '000055', 'star_hoop'],
  ['000059', 'crown_flame_diamond', '000056', 'crown_flame'],
  ['000110', 'star_earring_mithril', '000082', 'star_earring'],
  ['000111', 'whisper_hoop_diamond', '000083', 'whisper_hoop'],
  ['000112', 'soul_bell_mithril', '000084', 'soul_bell'],
  ['000113', 'star_pendant_mithril', '000108', 'star_pendant'],
  ['000114', 'rune_necklace_diamond', '000107', 'rune_necklace'],
  ['000115', 'dawn_pendant_diamond', '000109', 'dawn_pendant'],
  ['000141', 'pilgrim_sutan_mithril', '000138', 'pilgrim_sutan'],
  ['000142', 'void_robe_diamond', '000139', 'void_robe'],
  ['000143', 'aegis_mantle_mithril', '000140', 'aegis_mantle'],
  ['000194', 'rune_bracers_mithril', '000166', 'rune_bracers'],
  ['000195', 'star_armguard_diamond', '000167', 'star_armguard'],
  ['000196', 'titan_brace_mithril', '000168', 'titan_brace'],
  ['000197', 'rune_gauntlets_mithril', '000191', 'rune_gauntlets'],
  ['000198', 'star_gloves_diamond', '000192', 'star_gloves'],
  ['000199', 'void_gauntlet_mithril', '000193', 'void_gauntlet'],
  ['000235', 'sage_staff_mithril', '000232', 'sage_staff'],
  ['000236', 'mithril_hammer_diamond', '000233', 'mithril_hammer'],
  ['000237', 'philosopher_staff_mithril', '000234', 'philosopher_staff'],
  ['000285', 'arcane_eye_diamond', '000282', 'arcane_eye'],
  ['000286', 'snow_focus_mithril', '000283', 'snow_focus'],
  ['000287', 'heart_of_elements_mithril', '000284', 'heart_of_elements'],
  ['000335', 'star_signet_mithril', '000332', 'star_signet'],
  ['000336', 'void_ring_diamond', '000333', 'void_ring'],
  ['000337', 'phoenix_ring_mithril', '000334', 'phoenix_ring'],
  ['000410', 'rune_greaves_mithril', '000382', 'rune_greaves'],
  ['000411', 'storm_leggings_diamond', '000383', 'storm_leggings'],
  ['000412', 'titan_greaves_diamond', '000384', 'titan_greaves'],
  ['000413', 'rune_boots_mithril', '000408', 'rune_boots'],
  ['000414', 'storm_sandals_diamond', '000407', 'storm_sandals'],
  ['000415', 'swift_boots_diamond', '000409', 'swift_boots'],
];

// 6 чертежей assets/items (effect.recipe) ДО rename: [файл предмета,
// его id, прежний номер файла рецепта, id рецепта].
const RECIPE_REFS_00031807 = [
  ['000077.json', 'blueprint_forge', '000001', 'iron_sword'],
  ['000078.json', 'blueprint_alchemy', '000004', 'healing_potion'],
  ['000079.json', 'blueprint_carving', '000013', 'stone_chisel'],
  ['000080.json', 'blueprint_woodwork', '000011', 'wood_sword'],
  ['000081.json', 'blueprint_enchant', '000008', 'hunting_bow'],
  ['000082.json', 'blueprint_runecraft', '000019', 'moonstone_runes'],
];

// Ожидаемое множество id == множество прежних номеров (643) — сверяется
// живым свипом каталога в T1.
const EXPECTED_COUNT = 643;

test('000318.07 T1: ростер assets/craft — шейп slug, 643 файла, 0 numeric-имён, basename == id, id уникальны; schema.json ∈ slug-regex (guard исключения)', () => {
  assert.equal(JR.ASSET_NAME_SHAPES.craft, 'slug',
    'craft: шейп в реестре — slug (000318.07); факт: «'
    + JR.ASSET_NAME_SHAPES.craft + '»');
  assert.ok(JR.SHAPE_BASENAME_RES.slug.test('schema.json'),
    'guard: schema.json обязан матчиться slug-regex (иначе фильтр-исключение '
    + 'ничего не сторожит — прецедент .02)');
  const all = fs.readdirSync(DIR);
  const numeric = all.filter((f) => NUM_RE.test(f));
  assert.deepEqual(numeric, [],
    'craft: остались numeric-файлы после rename: ' + numeric.join(', '));
  const foreign = all.filter((f) => f !== 'schema.json'
    && !JR.SHAPE_BASENAME_RES.slug.test(f));
  assert.deepEqual(foreign, [],
    'craft: чужие файлы вне slug-формы: ' + foreign.join(', '));
  const files = craftFiles();
  assert.equal(files.length, EXPECTED_COUNT,
    'craft: 643 файла (ростер базы c0013918: сегменты 1..199 + 210..237 + '
    + '260..287 + 310..337 + 360..719); факт: ' + files.length
    + ' (краснота: rename не выполнен — slug-фильтр даёт меньше)');
  const ids = [];
  for (const f of files) {
    const data = readCraft(f);
    assert.equal(typeof data.id, 'string', `${f}: id — строка`);
    assert.equal(f, data.id + '.json',
      `craft: basename ≠ id (${f}, ожидалось «${data.id}.json») — `
      + 'контракт 000318.07: имя-носитель = id файла (прецедент spells .05)');
    ids.push(data.id);
  }
  const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
  assert.deepEqual(dup, [], 'craft: дубликаты id после rename');
  assert.equal(new Set(ids).size, EXPECTED_COUNT,
    'craft: 643 уникальных id (сегментные дыры прежней нумерации после '
    + 'rename теряют смысл — состав сторожат счётчик + basename==id)');
});

test('000318.07 T2: зеркало src/craft-data.js — CRAFT в строгом lex-порядке по id (≠ прежнему номерному), записи ≡ каталогу (резолв ссылок), комментарии «// <id>.json», numeric-имён нет, шапка-range из slug', () => {
  const { CRAFT, CRAFT_BY_ID } = require(MIRROR);
  assert.equal(CRAFT.length, EXPECTED_COUNT,
    'craft-data: 643 записи; факт: ' + CRAFT.length);
  const ids = CRAFT.map((r) => r.id);
  const sorted = [...ids].sort();
  assert.deepEqual(ids, sorted,
    'craft-data: порядок CRAFT — строгий lex по id (sync обязан сортировать '
    + 'по data.id: прежний .sort() по ИМЕНИ ФАЙЛА после rename дал бы тот же '
    + 'порядок лишь случайно, а на tmp-перестановке контента — уже нет)');
  assert.equal(new Set(ids).size, EXPECTED_COUNT,
    'craft-data: уникальность id в зеркале');
  assert.equal(CRAFT[0].id, 'adobe_shield',
    'craft-data: lex-первый рецепт — adobe_shield (бывший 000533); '
    + 'прежний первый — iron_sword (000001) — сдвиг наблюдаем');
  assert.equal(CRAFT[EXPECTED_COUNT - 1].id, 'yew_longbow',
    'craft-data: lex-последний рецепт — yew_longbow (бывший 000433)');
  assert.notEqual(ids[0], 'iron_sword',
    'craft-data: зеркало всё ещё в прежнем номерном порядке (rename не '
    + 'отражён в генерации)');
  const byId = new Map(craftFiles().map((f) => {
    const d = readCraft(f);
    return [d.id, d];
  }));
  assert.equal(byId.size, EXPECTED_COUNT, 'каталог: 643 записей по id');
  for (const r of CRAFT) {
    assert.equal(byId.has(r.id), true, `craft-data: id «${r.id}» нет в каталоге`);
    assert.equal(CRAFT_BY_ID[r.id], r, `${r.id}: CRAFT_BY_ID — тот же объект`);
    const src = byId.get(r.id);
    assert.equal(r.тип, src.тип, `${r.id}: тип`);
    assert.equal(r.уровень, src.уровень, `${r.id}: уровень`);
    const m = /^assets\/items\/(\d{6})\.json$/.exec(src.результат.предмет);
    assert.ok(m, `${r.id}: результат.предмет в JSON — не item-путь `
      + `(sources of truth — пути, зеркало — id; 000318.07 items НЕ трогает: `
      + 'это .318.08)');
    const itemFile = path.join(ROOT, src.результат.предмет);
    assert.ok(fs.existsSync(itemFile),
      `${r.id}: цель результата ${src.результат.предмет} — файла нет`);
    assert.equal(r.результат.предмет,
      JSON.parse(fs.readFileSync(itemFile, 'utf8')).id,
      `${r.id}: результат — резолв item-ссылки в id ЦЕЛИ (не в номер файла)`);
    assert.equal(r.исходники.length, src.исходники.length,
      `${r.id}: число исходников`);
    assert.ok(r.навыки.every((s) => typeof s === 'string'
      && /^[a-z][a-z0-9_]*$/.test(s)),
      `${r.id}: навыки в зеркале — id-строки: ${JSON.stringify(r.навыки)}`);
    assert.ok(r.здания.every((b) => Number.isInteger(b)),
      `${r.id}: здания в зеркале — целые id: ${JSON.stringify(r.здания)}`);
    assert.equal(r.здания.length, src.здания.length, `${r.id}: здания ⊆`);
    if (src.база === undefined) {
      assert.equal(r.база, undefined, `${r.id}: «база» не выдумана`);
    } else {
      assert.ok(!String(r.база).startsWith('assets/'),
        `${r.id}: «база» в зеркале осталась сырым путём: ${r.база}`);
      const targetFile = path.basename(String(src.база), '.json') + '.json';
      assert.ok(fs.existsSync(path.join(DIR, targetFile)),
        `${r.id}: цель «база» ${src.база} — файла нет (rename потерял цель?)`);
      assert.equal(r.база, readCraft(targetFile).id,
        `${r.id}: «база» — резолв self-ссылки в id цели (${src.база})`);
    }
  }
  const text = fs.readFileSync(MIRROR, 'utf8');
  assert.ok(text.includes('    // adobe_shield.json\n'),
    'построчный комментарий «// adobe_shield.json» (slug-имя, lex-первое)');
  assert.ok(text.includes('    // iron_sword.json\n'),
    'построчный комментарий «// iron_sword.json» (slug-имя, бывший 000001)');
  assert.ok(!/^\s*\/\/ \d{6}\.json$/m.test(text),
    'в зеркале остались числовые комментарии-файлы «// 0000NN.json»');
  assert.match(text,
    /\/\/ Рецепты \(assets\/craft\/adobe_shield\.json … yew_longbow\.json\)\./,
    'шапка-диапазон «// Рецепты (assets/craft/<первый> … <последний>)» не в '
    + 'slug-форме (факт: ' + (text.match(/\/\/ Рецепты \([^\n]*\)\./) || [''])[0]
    + ')');
  assert.doesNotMatch(text, /assets\/craft\/\d{6}\.json/,
    'в зеркале остались numeric-пути каталога craft (шапка либо данные)');
});

test('000318.07 T3: REF_RE — побайтовый пин НОВОГО двухгруппного source с craft в slug-ветке + таблица истинности', () => {
  assert.equal(JR.REF_RE.source,
    '^assets\\/(items|skills|npc)\\/\\d{6}\\.json$'
    + '|^assets\\/(spells|mobs|mob_groups|buildings|craft|dungeons)\\/[a-z][a-z0-9_]*\\.json$',
    'REF_RE группами по шейпам: number (items/skills/npc — craft ушёл) + '
    + 'slug (spells|mobs|mob_groups|buildings|craft|dungeons — craft встал '
    + 'после buildings по REF_LINKED_CATALOGS); прежний source (craft в '
    + 'number-группе) — «до 000318.07»; рантайм-носитель — pattern в '
    + 'assets/skills/schema.json (SR5/skills.test сверяют живо)');
  for (const [p, want] of [
    ['assets/craft/iron_sword.json', true],
    ['assets/craft/adobe_shield.json', true],
    ['assets/craft/yew_longbow.json', true],
    ['assets/craft/' + '000001' + '.json', false],
    ['assets/craft/' + '000031' + '.json', false],
    ['assets/items/000001.json', true],
    ['assets/skills/000001.json', true],
    ['assets/npc/000018.json', true],
    ['assets/buildings/weapons_shop.json', true],
    ['assets/spells/spark.json', true],
    ['assets/dungeons/abyss.json', true],
    ['assets/runes/stone_hide.json', false],
  ]) {
    assert.equal(JR.isRef(p), want, 'isRef: ' + p);
    assert.equal(JR.REF_RE.test(p), want, 'REF_RE ≡ isRef: ' + p);
  }
  assert.equal(JR.isRefPath('craft', 'iron_sword.json'), true,
    'isRefPath: craft slug — ref');
  assert.equal(JR.isRefPath('craft', '000001.json'), false,
    'isRefPath: craft numeric — прежняя форма, больше НЕ ref');
});

test('000318.07 T4: схемы-носители — skills ×2 ≡ живому REF_RE.source; dungeons ×4 (craft в slug-ветке); craft «база» и items «recipe» — slug-паттерны каталога craft', () => {
  const live = JR.REF_RE.source;
  const skills = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'assets', 'skills', 'schema.json'), 'utf8'));
  const secSkills = skills.oneOf[1];
  assert.equal(secSkills.properties.primary.pattern, live,
    'skills/schema.json: secondary.primary ≢ живому REF_RE.source');
  assert.equal(secSkills.properties.requires.properties.skill.pattern, live,
    'skills/schema.json: secondary.requires.skill ≢ живому REF_RE.source');
  const UNION = '^assets/((items|skills|npc)/\\d{6}'
    + '|(spells|mobs|mob_groups|buildings|craft|dungeons)/[a-z][a-z0-9_]*)\\.json$';
  const dungs = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'assets', 'dungeons', 'schema.json'), 'utf8'));
  for (const where of [['мобы', dungs.properties.мобы.items.pattern],
    ['предметы', dungs.properties.предметы.items.pattern],
    ['постройка', dungs.properties.постройка.pattern],
    ['руда.предмет',
      dungs.properties.руда.items.properties.предмет.pattern]]) {
    assert.equal(where[1], UNION,
      'dungeons/schema.json: «' + where[0] + '» — craft не в slug-ветке');
  }
  const SLUG_CRAFT = '^assets/craft/[a-z][a-z0-9_]*\\.json$';
  const craft = JSON.parse(fs.readFileSync(
    path.join(DIR, 'schema.json'), 'utf8'));
  assert.deepEqual(craft.properties.база,
    { type: 'string', pattern: SLUG_CRAFT },
    'craft/schema.json: «база» — не slug-паттерн каталога craft');
  const items = JSON.parse(fs.readFileSync(
    path.join(ITEMS_DIR, 'schema.json'), 'utf8'));
  assert.equal(items.properties.effect.properties.recipe.pattern, SLUG_CRAFT,
    'items/schema.json: effect.recipe — не slug-паттерн каталога craft');
  assert.equal(new RegExp(SLUG_CRAFT).test('assets/craft/iron_sword.json'), true,
    'сам паттерн не матчит slug-путь');
  assert.equal(new RegExp(SLUG_CRAFT).test('assets/craft/' + '000001' + '.json'),
    false, 'сам паттерн матчит прежний numeric-путь');
});

test('000318.07 T5: referrer-свип — numeric-путей craft в данных/рантайме РОВНО 0; позитивно: 43 self-«база» + 6 items-recipe — slug, резолв ok, id цели == прежнему номеру; цепочка «база» ациклична', () => {
  const NUM_REF = /assets\/craft\/\d{6}\.json/;
  const hits = [];
  const walk = (dir, pred) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, pred);
      else if (pred(e.name) && NUM_REF.test(fs.readFileSync(p, 'utf8'))) {
        hits.push(path.relative(ROOT, p));
      }
    }
  };
  walk(path.join(ROOT, 'assets'), (n) => n.endsWith('.json'));
  walk(path.join(ROOT, 'src'), (n) => n.endsWith('.js'));
  walk(path.join(ROOT, 'scripts'), (n) => n.endsWith('.js'));
  hits.push(...(NUM_REF.test(fs.readFileSync(path.join(ROOT, 'index.html'),
    'utf8')) ? ['index.html'] : []));
  assert.deepEqual(hits, [],
    'остались numeric-пути craft (после флипа реестра они НЕ ref — AR8 их '
    + 'не заметит, это единственный страж): ' + hits.join(', '));
  // Позитив: 43 self-«база» — прежний номер → slug, резолв ok, id цели.
  const liveFiles = new Set(craftFiles());
  let checked = 0;
  for (const [oldNum, id, oldBaseNum, baseId] of BASE_SELF_00031807) {
    const f = id + '.json';
    assert.equal(liveFiles.has(f), true,
      'craft: файл № ' + oldNum + ' обязан был стать ' + f);
    const data = readCraft(f);
    const ref = data.база;
    assert.equal(ref, 'assets/craft/' + baseId + '.json',
      `craft/${f}: «база» № ${oldBaseNum} не переписана в slug (${ref})`);
    assert.equal(JR.isRef(ref), true, `${f}: «${ref}» — не ref`);
    const r = JR.resolveRef(ROOT, ref);
    assert.ok(r.ok, `${f}: «${ref}» — ${r.reason}`);
    assert.equal(r.id, baseId,
      `${f}: id цели «${ref}» = ${r.id} ≠ прежнему номеру ${oldBaseNum} `
      + '(id цели: ' + baseId + ')');
    checked += 1;
  }
  assert.equal(checked, 43, 'анти-вакуум: таблица self-ссылок «база» — 43');
  const liveSelf = craftFiles()
    .filter((f) => readCraft(f).база !== undefined).sort();
  assert.deepEqual(liveSelf,
    BASE_SELF_00031807.map(([, id]) => id + '.json').sort(),
    'свип живого каталога: множество файлов с «база» ≠ ростеру 43 self-ссылок '
    + 'базы c0013918 (факт: ' + liveSelf.length + ')');
  // Ацикличность цепочки «база» (глубина на базе — ровно 1; запас на
  // будущие улучшенные-улучшенные: 8 шагов, иначе — цикл).
  const dataById = new Map(craftFiles().map((f) => [readCraft(f).id, readCraft(f)]));
  for (const f of craftFiles()) {
    const seen = new Set([path.basename(f, '.json')]);
    let cur = dataById.get(path.basename(f, '.json'));
    for (let step = 0; cur && cur.база !== undefined; step += 1) {
      assert.ok(step < 8,
        `${f}: цепочка «база» длиннее 8 — цикл или вырожденный рост`);
      const cid = path.basename(String(cur.база), '.json');
      assert.ok(!seen.has(cid), `${f}: цикл «база» через ${cid}`);
      seen.add(cid);
      cur = dataById.get(cid);
      assert.ok(cur, `${f}: цель «база» ${cid} вне каталога`);
    }
  }

  // Позитив: 6 чертежей assets/items — effect.recipe в slug-форме.
  for (const [itemFile, itemId, oldRecNum, recId] of RECIPE_REFS_00031807) {
    const j = JSON.parse(fs.readFileSync(path.join(ITEMS_DIR, itemFile),
      'utf8'));
    assert.equal(j.id, itemId, `items/${itemFile}: id предмета`);
    assert.equal(j.effect.kind, 'craft_recipe', `${itemFile}: effect.kind`);
    assert.equal(j.effect.recipe, 'assets/craft/' + recId + '.json',
      `items/${itemFile}: recipe № ${oldRecNum} не переписана в slug `
      + `(факт: ${j.effect.recipe})`);
    const r = JR.resolveRef(ROOT, j.effect.recipe);
    assert.ok(r.ok, `${itemFile}: «${j.effect.recipe}» — ${r.reason}`);
    assert.equal(r.id, recId,
      `${itemFile}: id цели recipe ≠ прежнему номеру ${oldRecNum}`);
  }
  let recipeRefs = 0;
  for (const f of fs.readdirSync(ITEMS_DIR)
    .filter((x) => NUM_RE.test(x))) {
    const j = JSON.parse(fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8'));
    if (j.effect && j.effect.kind === 'craft_recipe') recipeRefs += 1;
  }
  assert.equal(recipeRefs, 6,
    'анти-вакуум: ровно 6 чертежей craft_recipe; факт: ' + recipeRefs);
});

test('000318.07 T6: sync-craft-data.js — фильтр через живой реестр (SHAPE_BASENAME_RES[ASSET_NAME_SHAPES.craft]), schema.json исключён, компаратор записей по data.id; numeric-фильтра и «0000NN» нет', () => {
  const src = fs.readFileSync(SYNC, 'utf8');
  assert.match(src, /require\('\.\/lib\/json-ref\.js'\)/,
    'sync: нет require lib (фильтр обязан читаться из реестра живо)');
  assert.ok(src.includes('SHAPE_BASENAME_RES')
    && src.includes('ASSET_NAME_SHAPES.craft'),
    'sync: фильтр не через SHAPE_BASENAME_RES[ASSET_NAME_SHAPES.craft] '
    + '(форма имени — из ЖИВОГО реестра lib, прецедент .06)');
  assert.ok(src.includes("'schema.json'"),
    'sync: schema.json не исключён из фильтра (slug-regex матчит его — '
    + 'прецедент .02/.06)');
  assert.ok(!/\\d\{6\}\\\.json\$/.test(src),
    'sync: остался numeric-фильтр/паттерн имён файлов каталога craft');
  assert.ok(!src.includes('0000NN'),
    'sync: осталось упоминание «0000NN» в сообщении/комментарии');
  assert.match(src, /sort\(\(a, b\) => \(a\.data\.id < b\.data\.id/,
    'sync: нет компаратора порядка записей по data.id (сравнение строк «<», '
    + 'тот же code-unit порядок, что и у .sort() по именам: порядок выхода '
    + ' contract-пinned зеркалом, а не случайностью имён)');
});

// tmp-«репозиторий»: sync-craft-data.js + lib ОБА файла (write-atomic +
// json-ref — прецедент MODULE_NOT_FOUND .01–.06) + ПОЛНЫЙ каталог craft
// (schema.json внутри) + цели ссылок (items/skills/buildings) из данных.
function makeTmpCraftTree() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'craft-00031807-'));
  for (const sub of ['scripts/lib', 'src', 'assets/craft']) {
    fs.mkdirSync(path.join(tmp, sub), { recursive: true });
  }
  for (const libFile of ['write-atomic.js', 'json-ref.js']) {
    fs.copyFileSync(path.join(ROOT, 'scripts', 'lib', libFile),
      path.join(tmp, 'scripts', 'lib', libFile));
  }
  fs.copyFileSync(SYNC, path.join(tmp, 'scripts', 'sync-craft-data.js'));
  fs.copyFileSync(path.join(DIR, 'schema.json'),
    path.join(tmp, 'assets', 'craft', 'schema.json'));
  for (const f of craftFiles()) {
    fs.copyFileSync(path.join(DIR, f), path.join(tmp, 'assets', 'craft', f));
    const data = readCraft(f);
    const refs = [data.результат.предмет, ...data.исходники.map((i) => i.предмет),
      ...data.навыки, ...data.здания];
    if (data.база !== undefined) refs.push(data.база);
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

test('000318.07 T7: tmp-дерево — sync на полном каталоге (schema.json внутри) побайтово ≡ закоммиченному зеркалу и идемпотентен; перестановка СОДЕРЖИМОГО пары файлов — записи всё равно в id-порядке (компаратор наблюдаем)', () => {
  assert.ok(fs.existsSync(SYNC), 'RED: scripts/sync-craft-data.js не существует');
  assert.ok(fs.existsSync(MIRROR), 'RED: зеркало не сгенерировано');
  for (const f of ['adobe_shield.json', 'iron_sword.json',
    'yew_longbow.json']) {
    assert.ok(fs.existsSync(path.join(DIR, f)),
      'RED: каталог не переименован — нет файла ' + f);
    assert.equal(readCraft(f).id, path.basename(f, '.json'),
      'RED: ' + f + ' — id не совпадает с basename');
  }
  const committed = fs.readFileSync(MIRROR, 'utf8');
  const tmp = makeTmpCraftTree();
  const script = path.join(tmp, 'scripts', 'sync-craft-data.js');
  const out = path.join(tmp, 'src', 'craft-data.js');
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
    // Перестановка СОДЕРЖИМОГО пары: lex-первому файлу отдаём содержимое
    // lex-последнего и наоборот. Сортировка по ИМЕНИ файла поставила бы
    // запись yew_longbow (оказавшуюся в adobe_shield.json) ПЕРВОЙ — при
    // компараторе по data.id выход не меняется.
    const a = path.join(tmp, 'assets', 'craft', 'adobe_shield.json');
    const b = path.join(tmp, 'assets', 'craft', 'yew_longbow.json');
    const aRaw = fs.readFileSync(a, 'utf8');
    const bRaw = fs.readFileSync(b, 'utf8');
    fs.writeFileSync(a, bRaw, 'utf8');
    fs.writeFileSync(b, aRaw, 'utf8');
    const run3 = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    assert.equal(run3.status, 0, 'tmp-запуск после перестановки: '
      + (run3.stderr || run3.stdout));
    const records = (text) => text.split('\n')
      .filter((l) => !/^\s*\/\/ /.test(l)).join('\n');
    assert.equal(records(fs.readFileSync(out, 'utf8')),
      records(committed),
      'порядок записей выхода — по data.id (по имени файла adobe_shield '
      + 'с содержимым yew_longbow встал бы первым вместо последнего; '
      + 'комментарий-файл сопровождает запись и после перестановки '
      + 'отличается законно — сравниваются только записи)');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('000318.07 T8: 0-diff стражи — src/items-data.js побайтово прежний (чертежи несут РАЗРЕШЁННЫЙ id, не путь) + счётчики craft 643/612/579/546/33 инвариантны', () => {
  const before = execFileSync('git',
    ['-C', ROOT, 'show', 'HEAD:src/items-data.js'], { encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024 });
  const after = fs.readFileSync(path.join(ROOT, 'src', 'items-data.js'),
    'utf8');
  assert.equal(after, before,
    'src/items-data.js ИЗМЕНЁНrename craft его не касается: effect.recipe '
    + 'хранит РАЗРЕШЁННЫЙ id рецепта, а не путь файла');
  const { CRAFT } = require(MIRROR);
  assert.equal(CRAFT.length, 643, 'craft — 643');
  const withRarity = CRAFT.filter((r) => {
    const it = require(path.join(ROOT, 'src', 'items.js'))
      .getItem(r.результат.предмет);
    return it && typeof it.rarity === 'string';
  });
  assert.equal(withRarity.length, 612,
    'craft → rarity-экипировка: 612 (канон spec-000230.16 W8E/W8F, '
    + 'счётчик ОТ порядка не зависит); факт: ' + withRarity.length);
  const perItem = new Map();
  for (const r of withRarity) {
    const k = r.результат.предмет;
    perItem.set(k, (perItem.get(k) || 0) + 1);
  }
  assert.equal(perItem.size, 579,
    'rarity-экипировка, покрытая крафтом — 579 предметов (канон W8E/W8F); '
    + 'факт: ' + perItem.size);
  let one = 0;
  let two = 0;
  for (const [, n] of perItem) {
    if (n === 1) one += 1;
    else if (n === 2) two += 1;
  }
  assert.equal(one, 546, 'предметов ровно с 1 рецептом — 546; факт: ' + one);
  assert.equal(two, 33, 'предметов с 2 рецептами («база») — 33; факт: ' + two);
  assert.equal(CRAFT.filter((r) => r.база !== undefined).length, 43,
    'рецептов с «база» — ровно 43 (переписаны в slug-форме)');
});

// SPEC-guard (прецедент 000318.05 T8 + 000338): § «Архитектура хранения»
// с диска == slug-контракт каталога (диск пиннут T1; здесь — только текст
// SPEC, скоуп — срез H2 до следующего '\n## ').
test('000318.07 T9: spec/craft.md § «Архитектура хранения (каталог assets/craft)» — slug-именование (`<id>.json`, basename === `id`), без «сквозная нумерация»/numeric-имён/«нумерацию» (правка line-neutral, пин числа строк не двигается)', () => {
  const text = fs.readFileSync(path.join(ROOT, 'spec', 'craft.md'), 'utf8');
  const NAME = 'Архитектура хранения (каталог assets/craft)';
  const esc = NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = text.match(new RegExp('^## ' + esc + '\\s*$', 'm'));
  assert.ok(m, 'spec/craft.md: H2 «' + NAME + '» не найден');
  const j = text.indexOf('\n## ', m.index + 1);
  const sec = text.slice(m.index, j === -1 ? text.length : j);
  assert.ok(sec.includes('<id>.json'),
    'RED (000318.07): § не предписывает slug-именование `<id>.json` '
    + '(каталог — 643 `<id>.json`, numeric-имён 0 — диск пиннут T1)');
  assert.ok(sec.includes('basename === `id`'),
    'RED (000318.07): § не связывает имя файла с id (basename === `id` — '
    + 'default NameOf, прецедент runes .02 / spells .05)');
  assert.ok(!sec.includes('сквозная нумерация'),
    'RED (000318.07): § содержит устаревшее «сквозная нумерация» '
    + '(сегменты с дырами 000200–000209/… сняты: имена больше не номера)');
  assert.ok(!/`000\d{3}\.json`/.test(sec),
    'RED (000318.07): § содержит numeric-имена файлов `000NNN.json`');
  assert.ok(!sec.includes('нумерацию'),
    'RED (000318.07): § предписывает тесту проверять «нумерацию» '
    + '(craft.test.js проверяет именование, numeric-нумерации больше нет)');
});

// Порядок каталога — единственный наблюдаемый потребителем src/craft.js
// (DISASSEMBLY_BY_ITEM, тай-брейк «первый по порядку»); на базе — ОДИН
// тай (предмет iron_sword: рецепты 000001/000015, оба ур. 2), победитель
// совпадает с lex-меньшим id ⇒ поведение под новым порядком zacherано
// (проверено полным симуляционным пересчётом 598 записей — 0 смещений).
test('000318.07 T10: потребитель порядка — DISASSEMBLY_BY_ITEM: 598 канонических рецептов, единственный тай (iron_sword ↔ iron_sword_ore, оба ур. 2) разрешается прежнему победителю (lex-меньший id == прежний первый по номеру)', () => {
  const C = require(path.join(ROOT, 'src', 'craft.js'));
  const { CRAFT, CRAFT_BY_ID } = require(MIRROR);
  const map = C.DISASSEMBLY_BY_ITEM;
  const expected = {};
  for (const r of CRAFT) {
    if (r.база !== undefined) continue;
    const res = r.результат.предмет;
    if (!(res in expected)
      || r.уровень < CRAFT_BY_ID[expected[res]].уровень) {
      expected[res] = r.id;
    }
  }
  assert.deepEqual(map, expected,
    'DISASSEMBLY_BY_ITEM ≡ правилу по НОВОМУ порядку зеркала (иначе — '
    + 'порядок каталога поехал мимо правила)');
  assert.equal(Object.keys(expected).length, 598,
    'канонических рецептов — 598 (число от порядка НЕ зависит — инвариант '
    + 'состава); факт: ' + Object.keys(expected).length);
  const ties = {};
  const perItem = new Map();
  for (const r of CRAFT) {
    if (r.база !== undefined) continue;
    const list = perItem.get(r.результат.предмет) || [];
    list.push(r);
    perItem.set(r.результат.предмет, list);
  }
  for (const [item, list] of perItem) {
    const min = Math.min(...list.map((r) => r.уровень));
    const at = list.filter((r) => r.уровень === min).map((r) => r.id).sort();
    if (at.length > 1) ties[item] = at;
  }
  assert.deepEqual(ties, { iron_sword: ['iron_sword', 'iron_sword_ore'] },
    'множество ТАЙОВ (≥2 базовых рецепта на одном минимальном уровне) — '
    + 'ровно {iron_sword: [iron_sword, iron_sword_ore]} (бывшие 000001/'
    + '000015, оба ур. 2): при ином множестве прежнее совпадение «первый '
    + 'по номеру» ↔ «lex-меньший id» надо проверять заново');
  assert.equal(map.iron_sword, 'iron_sword',
    'тай-брейк: победитель — iron_sword (прежний первый по номеру файла '
    + 'и lex-меньший id — поведение сохранено)');
  assert.notEqual(CRAFT[0].id, 'iron_sword',
    'guard: iron_sword больше НЕ первый в каталоге — иначе тай-брейк '
    + 'наблюдается тривиально (проверка ничего не сторожит)');
});

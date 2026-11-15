// Задача 000318.08 (родитель 000318): переименование assets/items —
// 000NNN.json → <id>.json (864 файла; имя-носитель — строковый id того же
// файла, как craft .07/runes .02) с флипом реестра ASSET_NAME_SHAPES.items
// = 'slug'. items ∈ REF_LINKED_CATALOGS ПЕРВЫЙ (самый массовый каталог
// ссылок: craft 2453 + npc 244 + dungeons 225 + spells 167 + mobs 50 +
// buildings 24 = 3163 вхождения в 942 referrer-файла на базе 6330d2ec) ⇒
// REF_RE ДРЕЙФУЕТ: number-группа теряет items (остаются skills|npc),
// slug-группа получает его ПЕРВЫМ по REF_LINKED_CATALOGS — побайтовый пин
// AR11, дубли source в rename-тестах .02–.07 и схемы-носители (skills ×2,
// dungeons ×4, одиночные паттерны craft/spells/mobs/buildings/npc)
// перепинуты в том же коммите. ЗЕРКАЛО src/items-data.js: sync сортирует
// ПО data.id; ПОРЯДОК ЗАПИСЕЙ МЕНЯЕТСЯ ЦЕЛИКОМ (numeric → lex) — в отличие
// от craft, где порядок потребителей не двигался: все rng-хвосты
// (makeShop/kindPool, GOLDEN*, лут-хэш map.js по позиции в ITEMS)
// пересняты ЖИВЫМ кодом (сиды 0-diff). Дизайнерские вилки (решение
// прогоном, основание — memory/000318.08-items-slug-rename.md): F1-ПРИНЯТЬ
// — src/map.js 0-diff, лут-золотые пересняты под lex-порядок (инвариант
// «append-only по позиции» после rename деградирует — долг в памяти);
// F2-P1 — src/loot-equip-data.js 0-diff, пулы EQUIP_POOLS сохраняют свой
// append-порядок (порядок ролла winLoot НЕ двигается), пины «пул ≡
// каталогу по редкости» переведены numeric→set-равенство.
// spec/items.md — byte-identical (канон memory/000230.16 пинует байты
// диска; docs-эррата ложной прозы :324 — долг в памяти/result, НЕ правится).
//
// КРАСНЫЕ тесты (TDD): до rename/флипа краснеют ОСМЫСЛЕННО 8 из 11
// (T1–T7 + T11; ERR_ASSERTION: шейп number, файлы numeric, зеркальный
// порядок номерной, REF_RE прежний source, схемы прежние паттерны,
// numeric-пути рефереров 3163, sync-грепы не найдены, tmp-дерево
// не переименовано, реестра num→id ещё нет — existsSync-гейт T11),
// без краха загрузки. T8/T9/T10 — ГЕЙТ-стражи «вне scope не тронуто»
// и инварианты, не зависящие от порядка имён: зелёные и ДО, зуб
// мутационный (M7/M8/M9/M10).
//
// Контракты (миграция 000379: ни ОДНОго литерала, равного живому счётчику;
// self-gate T12 сторожит это машиной — вернуть число в файл нельзя):
//   * T1 — ростер: шейп items == slug, каталог ≡ реестру по мощности (live)
//     и ≥ FROZEN_PREFIX_END_I08 (864 — граница базы rename, монотонный пол),
//     0 numeric-имён, basename == id каждого файла, id уникальны,
//     schema.json ∈ slug-regex (guard: исключение обязательно), чужих нет.
//   * T2 — зеркало: ITEMS — строгий lex-порядок по id (≠ прежний
//     номерной: wood_sword был первым), записи ≡ каталогу по факту
//     (effect.recipe — резолв в id цели), комментарии «// <id>.json»,
//     numeric-имён нет, шапка-range ВЫВЕДЕНА из живых краёв каталога,
//     фразы «нумерация файлов» нет, чертежей ≥ MIN_CRAFT_RECIPES_I08.
//   * T3 — REF_RE побайтовый пин НОВОГО двухгруппного source (slug-группа
//     ПЕРВОЙ по REF_LINKED_CATALOGS: items|spells|…; number: skills|npc) +
//     таблица истинности (items slug — ref, items numeric — НЕ ref,
//     skills/npc numeric — по-прежнему ref).
//   * T4 — схемы-носители: skills ×2 ≡ живому REF_RE.source; dungeons ×4
//     composite (items в slug-ветке); одиночные паттерны craft/spells/
//     mobs/buildings/npc → slug-форма каталога items; items/schema.json —
//     собственных item-путей НЕ содержит (0-diff guard).
//   * T5 — referrer-свип: numeric-путей «assets/items/\d{6}\.json» в
//     данных/рантайме РОВНО 0 (после флипа numeric — НЕ ref, AR8 их не
//     видит — единственный страж; НЕ ПОДВИЖНО); позитивно — монотонные
//     поля MIN_OCCURRENCES_I08 / MIN_REF_FILES_I08 /
//     MIN_DISTINCT_REFERENCED_I08 (факт базы 52b75f90: 3166 / 943 / 860)
//     вместо снапшотов, ref-integrity (каждая slug-ссылка ведёт на
//     существующий файл каталога), non-vacuity по каждому из шести
//     каталогов-рефереров, присутствие реферера у каждого id из
//     REFERENCED_00031808 (точные счётчики сняты), выборки из 6 каталогов
//     резолвятся ok, id цели == прежнему номеру файла.
//   * T6 — grep-пины scripts/sync-items-data.js: фильтр ЧЕРЕЗ живой реестр
//     lib + ЯВНОЕ исключение schema.json + компаратор по data.id + guard
//     пустого каталога; numeric-фильтра, «0000NN» и сортировки по имени
//     файла нет.
//   * T7 — tmp-дерево (копирка scripts/lib ОБА файла + цели effect.recipe
//     из assets/craft): sync на полном каталоге (schema.json внутри) —
//     выход ПОБАЙТОВО ≡ закоммиченному зеркалу, повтор идемпотентен;
//     перестановка СОДЕРЖИМОГО пары файлов — записи всё равно в id-порядке
//     (компаратор наблюдаем). Главный зуб свежести зеркала после снятия
//     head/tail-литералов из T2.
//   * T8 — 0-diff стражи: прочие src/*-data.js ЗЕРКАЛА побайтово прежние
//     (item-ссылки в них — РАЗРЕШЁННЫЕ id, не пути) + зеркало ≡ каталогу
//     (live), лут ≥ MIN_LOOT_I08 (факт базы: 33), EQUIP_POOLS по длине ≡
//     rarity-таблице, ПОСЧИТАННОЙ с диска (литералы 232/161/117/46/23
//     сняты 000379).
//   * T9 — spec/items.md побайтово прежний (канон memory/000230.16
//     byte-identical — гейт; docs-эррата :324 — долг, не правится) +
//     SPEC_FILE_LINES items.md = 477 не двигается.
//   * T10 — порядок-чувствительные потребители (вилки): EQUIP_POOLS —
//     set-равенство каталогу по редкости для КАЖДОГО ключа пулов
//     (обход по Object.keys(LE.EQUIP_POOLS), не по таблице-литералу);
//     F2-P1: ПОРЯДОК пулов — свой append, не lex — guard; сид-каналы
//     map.js/items.js побайтово прежние (0x4C4F4F54/0x43414d50 — переснят
//     только контент золотых, F1-принять); makeShop bt2 — детерминизм и
//     валидность id под НОВЫМ порядком allItems.
//   * T11 — реестр «номер → id» tests/scripts/items-num2id-000318.08.json
//     (его load'ят переписанные тесты ради ВИРТУАЛЬНЫХ numeric-имён —
//     позиционные пины рядов) — APPEND-ONLY: ключи — префикс 000001..N,
//     где N ЖИВОЙ (≥ границы rename; факт базы: 914 после 000321.08),
//     ни одна строка HEAD не переписана/не удалена
//     (LEDGER_APPEND_ONLY_I08) — заморожены СТРОКИ, а не длина; значения
//     уникальны и ≡ множеству id диска двусторонне (live), disk-файл
//     <value>.json несёт id == value, 10 spot-строк. Порча реестра массово
//     красит items-семейку — зуб здесь.
//   * T12 — SELF-GATE (000379, формат 000375): в исходнике этого файла нет
//     имени замороженного счётчика и нет ассертов вида
//     assert.equal(<…length|size>, <литерал>); positive-маркеры
//     FROZEN_PREFIX_END_I08 и LEDGER_APPEND_ONLY_I08 на месте. Красен на
//     базе миграции, зелёный после; сообщение содержит РЕЦЕПТ роста, чтобы
//     волна «чинила» его правкой данных, а не возвратом числа.
//   * T13 — ПОСТОЯННЫЙ digest-зуб замороженного префикса (000392,
//     ретро-b24 F1): sha256 от канонической сериализации первых
//     FROZEN_PREFIX_END_I08 пар num→id реестра ≡ неизменному литералу
//     FROZEN_PREFIX_DIGEST_SHA256_I08. В отличие от HEAD-зуба T11 красен и
//     ПОСЛЕ коммита пере-нумерации (HEAD тогда совпадает с порчей);
//     легальный append в хвост реестра литерал не двигает.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'assets', 'items');
const CRAFT_DIR = path.join(ROOT, 'assets', 'craft');
const MIRROR = path.join(ROOT, 'src', 'items-data.js');
const SYNC = path.join(ROOT, 'scripts', 'sync-items-data.js');
const JR = require('../scripts/lib/json-ref.js');

const NUM_RE = /^\d{6}\.json$/;

function itemFiles() {
  const re = JR.SHAPE_BASENAME_RES[JR.ASSET_NAME_SHAPES.items];
  return fs.readdirSync(DIR)
    .filter((f) => f !== 'schema.json' && re.test(f)).sort();
}

function readItem(f) {
  return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
}

function catIdsT5() {
  return itemFiles().map((f) => path.basename(f, '.json'));
}

// Ростер: ЖИВОЙ счётчик (задача 000379 — тройка «замороженный реестр ≡
// живые зубы ≡ рост каталога» развязана в пользу роста). Литерала, равного
// живому числу каталога/реестра/зеркала, в этом файле БОЛЬШЕ НЕТ (self-gate
// T12 не даст его вернуть): мощность сверяется МЕЖДУ дисковыми источниками,
// а вниз ограничена монотонной границей FROZEN_PREFIX_END_I08 — 864
// предмета на базе rename 6330d2ec (513 на 000318-split + волны
// 000321.01–.07); дальше каталог может только расти (+50 за волну 000321.YY).
// Состав сторожат basename==id + уникальность id + биекция с реестром
// (сегментные дыры прежней нумерации после rename теряют смысл —
// прецедент craft .07).
const FROZEN_PREFIX_END_I08 = 864;

const LEDGER_I08_PATH = path.join(__dirname, 'scripts',
  'items-num2id-000318.08.json');
const LEDGER_I08_REL = 'tests/scripts/items-num2id-000318.08.json';

function REGISTRY_I08() {
  return JSON.parse(fs.readFileSync(LEDGER_I08_PATH, 'utf8'));
}

// Реестр APPEND-ONLY относительно HEAD — выполнимая форма «замороженности»:
// заморожены СТРОКИ (запрет пере-нумерации и удаления), длина ЖИВАЯ.
// Возвращает список нарушений (пустой список = контракт выполнен).
function LEDGER_APPEND_ONLY_I08() {
  const before = JSON.parse(execFileSync('git',
    ['-C', ROOT, 'show', 'HEAD:' + LEDGER_I08_REL],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  const now = REGISTRY_I08();
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

// Постоянный (НЕ HEAD-относительный) пин первых FROZEN_PREFIX_END_I08 пар
// num→id реестра — задача 000392 (ретро-b24 F1/К1 + кросс X-5): HEAD-зуб
// T11 транзиентен (закоммиченная пере-нумерация становится новой нормой
// HEAD), digest-зуб T13 красен навсегда. Каноническая сериализация —
// JSON.stringify(Object.keys(r).slice(0,864).map(k => [k, r[k]])); порядок
// ключей = порядок строк в файле (все ключи с ведущими нулями — НЕ
// integer-index ⇒ insertion order), поэтому дописка в конец литерал не
// двигает, а вставка в середину файла красит T13 — сознательное следствие
// формулы. Литерал снят диском на 832a5d81 (стабилен по 7 базам роста
// хвоста 914→964); пересчёт литерала допустим ТОЛЬКО при инциденте F1 в
// мастере по эскалации оркестратору, не молча.
const FROZEN_PREFIX_DIGEST_SHA256_I08 =
  '8bb0a1c526913a84d68c9c98d3fa0265cc3adddd42a04c33b0bb4657a5ad0945';

function FROZEN_PREFIX_DIGEST_I08() {
  const r = REGISTRY_I08();
  const pairs = Object.keys(r).slice(0, FROZEN_PREFIX_END_I08)
    .map((k) => [k, r[k]]);
  return createHash('sha256').update(JSON.stringify(pairs)).digest('hex');
}

// [прежний номер, id] — предметы, обязанные иметь ХОТЯ БЫ ОДНОГО referrer-а
// во всех assets/* (анти-вакуум «rewrite не потерял ссылки»). Точные per-id
// счётчики (6/13/11/165/101/2/1/45/3/1/2/1 на базе 6330d2ec; healing_potion
// 10→11 — ре-пин 000320.27) были ЗУБОМ МИГРАЦИИ и постоянными быть не
// могут: их двигает каждая npc/loot-волна. Снято задачей 000379 в пользу
// присутствия (числа остаются здесь историей).
const REFERENCED_00031808 = [
  ['000001', 'wood_sword'],
  ['000002', 'iron_sword'],
  ['000012', 'healing_potion'],
  ['000035', 'wood_log'],
  ['000036', 'stone_chunk'],
  ['000043', 'fireball_scroll'],
  ['000051', 'resurrect_scroll'],
  ['000062', 'diamond'],
  ['000077', 'blueprint_forge'],
  ['000283', 'cloth_cuff'],
  ['000764', 'decadance_scroll'],
  ['000765', 'tin_band'],
];
// Зуб «4 предмета без рефереров» (ice_spellbook/archer_scroll/fruit_apple/
// fruit_plum) СНЯТ задачей 000379: он уже легитимно устарел диском — без
// рефереров 54 предмета (50 из них — еда 000321.08), а следующая торговая
// волна красила бы items-rename по корректной причине.
//
// Монотонные НИЖНИЕ границы агрегатов referrer-свипа вместо точных
// снапшотов (факт базы 52b75f90: 3166 slug-путей в 943 файлах, 860
// различных id; прежний ре-пин .27 «3166/943» снят задачей 000379, .28
// готовила 3169/944). Запас ~3.5 % ниже факта: массовую ПОТЕРЮ ссылок
// ловим, легитимный рост — нет.
const MIN_OCCURRENCES_I08 = 3050;
const MIN_REF_FILES_I08 = 915;
const MIN_DISTINCT_REFERENCED_I08 = 830;
// Те же поля там, где раньше были литералы T2/T8 (факт базы: 6 чертежей,
// 33 лут-кандидата).
const MIN_CRAFT_RECIPES_I08 = 6;
const MIN_LOOT_I08 = 33;

// Выборки из 6 каталогов-рефереров [файл (slug-имя на базе), ожидаемый
// slug-путь на предмет, id цели] — позитив T5: путь переписан, резолв ok.
const REFERRER_PROBES_00031808 = [
  ['craft/iron_sword.json', 'assets/items/iron_sword.json', 'iron_sword'],
  ['npc/000001.json', 'assets/items/wood_sword.json', 'wood_sword'],
  ['dungeons/castle_ruins.json', 'assets/items/steel_sword.json', 'steel_sword'],
  ['spells/absolute_zero.json', 'assets/items/absolute_zero_scroll.json', 'absolute_zero_scroll'],
  ['mobs/ant.json', 'assets/items/honey_cake.json', 'honey_cake'],
  ['buildings/academy.json', 'assets/items/wood_log.json', 'wood_log'],
];

test('000318.08 T1: ростер assets/items — шейп slug, живой рост (каталог ≡ реестру по мощности и ≥ границы rename; 000379 — число не пинуется), 0 numeric-имён, basename == id, id уникальны; schema.json ∈ slug-regex (guard исключения)', () => {
  assert.equal(JR.ASSET_NAME_SHAPES.items, 'slug',
    'items: шейп в реестре — slug (000318.08); факт: «'
    + JR.ASSET_NAME_SHAPES.items + '»');
  assert.ok(JR.SHAPE_BASENAME_RES.slug.test('schema.json'),
    'guard: schema.json обязан матчиться slug-regex (иначе фильтр-исключение '
    + 'ничего не сторожит — прецедент .02/.06/.07)');
  const all = fs.readdirSync(DIR);
  const numeric = all.filter((f) => NUM_RE.test(f));
  assert.deepEqual(numeric, [],
    'items: остались numeric-файлы после rename: ' + numeric.slice(0, 8).join(', ')
    + (numeric.length > 8 ? ' …' : '') + ' (' + numeric.length + ' шт)');
  const foreign = all.filter((f) => f !== 'schema.json'
    && !JR.SHAPE_BASENAME_RES.slug.test(f));
  assert.deepEqual(foreign, [],
    'items: чужие файлы вне slug-формы: ' + foreign.join(', '));
  const files = itemFiles();
  const registryKeys = Object.keys(REGISTRY_I08());
  assert.ok(files.length >= FROZEN_PREFIX_END_I08,
    'items: каталог МЕНЬШЕ границы rename (' + FROZEN_PREFIX_END_I08
    + ' предмета на базе 6330d2ec: 513 на split + волны 000321.01–.07);'
    + ' факт: ' + files.length + ' (краснота: rename не выполнен — slug-фильтр'
    + ' даёт 0, либо каталог урезан; РАСТИ он может легально — ниже поля)');
  assert.equal(files.length, registryKeys.length,
    'items: каталог (' + files.length + ' slug-файлов) ≢ реестру «номер→id» ('
    + registryKeys.length + ' строк) по мощности — РЕЦЕПТ (000379):'
    + ' рост assets/items волной 000321.YY сопровождается APPEND строк'
    + ' ' + LEDGER_I08_REL + ' (pad(N+1)..pad(N+k)) + regen'
    + ' src/items-data.js в том же коммите; обход реестра даёт'
    + ' num === undefined в canon-items-sync (игла c1: nums ≢ {1..N}) и'
    + ' краснит канон без указания причины. Сам этот файл дальше не правится');
  const ids = [];
  for (const f of files) {
    const data = readItem(f);
    assert.equal(typeof data.id, 'string', `${f}: id — строка`);
    assert.equal(f, data.id + '.json',
      `items: basename ≠ id (${f}, ожидалось «${data.id}.json») — `
      + 'контракт 000318.08: имя-носитель = id файла (прецедент craft .07)');
    ids.push(data.id);
  }
  const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
  assert.deepEqual(dup, [], 'items: дубликаты id после rename');
  assert.equal(new Set(ids).size, files.length,
    'items: id не уникальны (уникальных ' + new Set(ids).size + ' из '
    + files.length + ') — состав сторожат basename==id + уникальность'
    + ' + биекция с реестром (живые зубы, 000379)');
});

test('000318.08 T2: зеркало src/items-data.js — ITEMS в строгом lex-порядке по id (≠ прежний номерной), записи ≡ каталогу (recipe — id цели), комментарии «// <id>.json», numeric-имён нет, шапка-range из slug, «нумерация файлов» снята', () => {
  const { ITEMS } = require(MIRROR);
  const catFiles = itemFiles();
  const catIds = catFiles.map((f) => path.basename(f, '.json'));
  assert.equal(ITEMS.length, catFiles.length,
    'items-data: зеркало ≢ каталогу по мощности (зеркало: ' + ITEMS.length
    + ', диск: ' + catFiles.length + ') — regen scripts/sync-items-data.js'
    + ' обязан идти в ТОМ ЖЕ коммите, что и рост assets/items (живой'
    + ' счётчик вместо литерала — 000379)');
  const ids = ITEMS.map((r) => r.id);
  const sorted = [...ids].sort();
  assert.deepEqual(ids, sorted,
    'items-data: порядок ITEMS — строгий lex по id (sync обязан сортировать '
    + 'по data.id: прежний .sort() по ИМЕНИ ФАЙЛА = нумерации; после rename '
    + 'lex-порядок отличается от номерного ПОЛНОСТЬЮ — 860/864 позиций)');
  assert.equal(new Set(ids).size, ids.length,
    'items-data: id в зеркале не уникальны (уникальных '
    + new Set(ids).size + ' из ' + ids.length + ')');
  // Голова/хвост lex-порядка ВЫВОДЯТСЯ из диска (000379): литералы
  // absolute_zero_scroll / zveroboy_chay красили бы чужой файл при
  // легитимном росте, отсортированном раньше/позже прежнего края; свежесть самого
  // зеркала сторожит T7 (regen побайтово ≡ коммиту).
  assert.equal(ids[0], catIds[0],
    'items-data: lex-первый зеркалу ≠ lex-первому каталога (зеркало: '
    + ids[0] + ', диск: ' + catIds[0] + ') — прежний номерной первый'
    + ' — wood_sword (000001), сдвиг наблюдаем');
  assert.equal(ids[ids.length - 1], catIds[catIds.length - 1],
    'items-data: lex-последний зеркалу ≠ lex-последнему каталога (зеркало: '
    + ids[ids.length - 1] + ', диск: ' + catIds[catIds.length - 1]
    + ') — прежний номерной конец — ash_elixir');
  assert.notEqual(ids[0], 'wood_sword',
    'items-data: зеркало всё ещё в прежнем номерном порядке (rename не '
    + 'отражён в генерации)');
  const byId = new Map(catFiles.map((f) => {
    const d = readItem(f);
    return [d.id, d];
  }));
  assert.equal(byId.size, catFiles.length,
    'каталог: id не уникальны (по id ' + byId.size + ' из '
    + catFiles.length + ' файлов)');
  let recipes = 0;
  for (const r of ITEMS) {
    assert.equal(byId.has(r.id), true, `items-data: id «${r.id}» нет в каталоге`);
    const src = byId.get(r.id);
    assert.equal(r.name, src.name, `${r.id}: name`);
    assert.equal(r.kind, src.kind, `${r.id}: kind`);
    assert.equal(r.value, src.value, `${r.id}: value`);
    if (src.effect && src.effect.kind === 'craft_recipe') {
      recipes += 1;
      assert.ok(!String(r.effect.recipe).startsWith('assets/'),
        `${r.id}: effect.recipe в зеркале осталась сырым путём: `
        + r.effect.recipe);
      const target = JSON.parse(fs.readFileSync(
        path.join(CRAFT_DIR, src.effect.recipe.split('/').pop()), 'utf8'));
      assert.equal(r.effect.recipe, target.id,
        `${r.id}: recipe — резолв в id ЦЕЛИ (${src.effect.recipe})`);
    }
  }
  assert.ok(recipes >= MIN_CRAFT_RECIPES_I08,
    'анти-вакуум: чертежей craft_recipe не меньше ' + MIN_CRAFT_RECIPES_I08
    + ' (факт базы 52b75f90: 6); факт: ' + recipes + ' — пол, а не «ровно»:'
    + ' рецепты — легитимный рост соседних волн (000379)');
  const text = fs.readFileSync(MIRROR, 'utf8');
  assert.ok(text.includes('    // wood_sword.json\n'),
    'построчный комментарий «// wood_sword.json» (slug-имя, бывший 000001)');
  assert.ok(text.includes('    // absolute_zero_scroll.json\n'),
    'построчный комментарий «// absolute_zero_scroll.json» (lex-первое)');
  assert.ok(!/^\s*\/\/ \d{6}\.json$/m.test(text),
    'в зеркале остались числовые комментарии-файлы «// 000NNN.json»');
  const HEADER_I08 = new RegExp('// Предметы \\(assets/items/'
    + catIds[0] + '\\.json … ' + catIds[catIds.length - 1]
    + '\\.json\\);');
  assert.ok(HEADER_I08.test(text),
    'шапка-диапазон «// Предметы (assets/items/<первый> … <последний>)»'
    + ' не соответствует ЖИВЫМ краям каталога (ожидалось: ' + catIds[0]
    + ' … ' + catIds[catIds.length - 1] + '; факт: '
    + (text.match(/\/\/ Предметы \([^\n]*\);/) || [''])[0] + ')');
  assert.doesNotMatch(text, /assets\/items\/\d{6}\.json/,
    'в зеркале остались numeric-пути каталога items (шапка либо данные)');
  assert.ok(!text.includes('нумерация файлов'),
    'в зеркале осталась фраза «порядок массива = нумерация файлов» '
    + '(порядок теперь lex по id)');
});

test('000318.08 T3: REF_RE — побайтовый пин НОВОГО двухгруппного source (slug-группа ПЕРВОЙ: items встала в начало по REF_LINKED_CATALOGS, skills встал в неё же 000318.09; number: npc) + таблица истинности', () => {
  assert.equal(JR.REF_RE.source,
    '^assets\\/(items|skills|spells|mobs|mob_groups|buildings|craft|dungeons)\\/[a-z][a-z0-9_]*\\.json$'
    + '|^assets\\/(npc)\\/\\d{6}\\.json$',
    'REF_RE группами по шейпам: slug (items|mobs|… — items встала ПЕРВОЙ, '
    + 'она первый в REF_LINKED_CATALOGS) + number (npc — items ушла 000318.08, '
    + 'skills ушёл 000318.09); '
    + 'прежний source (number-группа items|skills|npc первой) — «до '
    + '000318.08»; рантайм-носитель — pattern в assets/skills/schema.json '
    + '(SR5/skills.test сверяют живо)');
  for (const [p, want] of [
    ['assets/items/wood_sword.json', true],
    ['assets/items/absolute_zero_scroll.json', true],
    ['assets/items/yew_longbow.json', true],
    ['assets/items/' + '000001' + '.json', false],
    ['assets/items/' + '000864' + '.json', false],
    ['assets/skills/' + '000001' + '.json', false],
    ['assets/skills/strength.json', true],
    ['assets/npc/000018.json', true],
    ['assets/craft/iron_sword.json', true],
    ['assets/buildings/weapons_shop.json', true],
    ['assets/spells/spark.json', true],
    ['assets/dungeons/abyss.json', true],
    ['assets/runes/stone_hide.json', false],
  ]) {
    assert.equal(JR.isRef(p), want, 'isRef: ' + p);
    assert.equal(JR.REF_RE.test(p), want, 'REF_RE ≡ isRef: ' + p);
  }
  assert.equal(JR.isRefPath('items', 'wood_sword.json'), true,
    'isRefPath: items slug — ref');
  assert.equal(JR.isRefPath('items', '000001' + '.json'), false,
    'isRefPath: items numeric — прежняя форма, больше НЕ ref');
});

test('000318.08 T4: схемы-носители — skills ×2 ≡ живому REF_RE.source; dungeons ×4 (items в slug-ветке); одиночные паттерны craft/spells/mobs/buildings/npc — slug-форма каталога items; items/schema.json собственных item-путей не содержит', () => {
  const live = JR.REF_RE.source;
  const skills = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'assets', 'skills', 'schema.json'), 'utf8'));
  const secSkills = skills.oneOf[1];
  assert.equal(secSkills.properties.primary.pattern, live,
    'skills/schema.json: secondary.primary ≢ живому REF_RE.source');
  assert.equal(secSkills.properties.requires.properties.skill.pattern, live,
    'skills/schema.json: secondary.requires.skill ≢ живому REF_RE.source');
  const UNION = '^assets/((npc)/\\d{6}'
    + '|(items|skills|spells|mobs|mob_groups|buildings|craft|dungeons)/[a-z][a-z0-9_]*)\\.json$';
  const dungs = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'assets', 'dungeons', 'schema.json'), 'utf8'));
  for (const where of [['мобы', dungs.properties.мобы.items.pattern],
    ['предметы', dungs.properties.предметы.items.pattern],
    ['постройка', dungs.properties.постройка.pattern],
    ['руда.предмет',
      dungs.properties.руда.items.properties.предмет.pattern]]) {
    assert.equal(where[1], UNION,
      'dungeons/schema.json: «' + where[0] + '» — items не в slug-ветке');
  }
  const SLUG_ITEMS = '^assets/items/[a-z][a-z0-9_]*\\.json$';
  const at = (obj, keys) => keys.reduce((o, k) => o[k], obj);
  const craft = JSON.parse(fs.readFileSync(
    path.join(CRAFT_DIR, 'schema.json'), 'utf8'));
  assert.equal(at(craft, ['properties', 'результат', 'properties',
    'предмет', 'pattern']), SLUG_ITEMS,
    'craft/schema.json: результат.предмет — не slug-паттерн каталога items');
  assert.equal(at(craft, ['properties', 'исходники', 'items', 'properties',
    'предмет', 'pattern']), SLUG_ITEMS,
    'craft/schema.json: исходники.предмет — не slug-паттерн каталога items');
  const spells = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'assets', 'spells', 'schema.json'), 'utf8'));
  assert.equal(at(spells, ['properties', 'предметы', 'items', 'pattern']),
    SLUG_ITEMS, 'spells/schema.json: предметы — не slug-паттерн');
  const mobs = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'assets', 'mobs', 'schema.json'), 'utf8'));
  assert.equal(at(mobs, ['properties', 'loot', 'items', 'properties',
    'item', 'pattern']), SLUG_ITEMS, 'mobs/schema.json: loot.item — не slug-паттерн');
  // Свип: во ВСЕХ схемах-реферерах любая pattern-строка с item-путём ≡
  // SLUG_ITEMS; numeric-паттернов не остаётся (craft 2 + spells 1 + mobs 1 +
  // buildings 1 + npc 3 = 8 одиночных паттернов на базе 6330d2ec).
  const SINGLES_EXPECTED = { craft: 2, spells: 1, mobs: 1, buildings: 1, npc: 3 };
  const collectPatterns = (v, out) => {
    if (Array.isArray(v)) { for (const x of v) collectPatterns(x, out); return; }
    if (v !== null && typeof v === 'object') {
      for (const k of Object.keys(v)) {
        if (k === 'pattern' && typeof v[k] === 'string'
          && v[k].includes('assets/items/')) out.push(v[k]);
        else collectPatterns(v[k], out);
      }
    }
  };
  for (const [cat, expected] of Object.entries(SINGLES_EXPECTED)) {
    const schema = JSON.parse(fs.readFileSync(
      path.join(ROOT, 'assets', cat, 'schema.json'), 'utf8'));
    const pats = [];
    collectPatterns(schema, pats);
    assert.equal(pats.length, expected,
      `assets/${cat}/schema.json: паттернов item-путей — ${expected}, `
      + 'факт: ' + pats.length);
    for (const p of pats) {
      assert.equal(p, SLUG_ITEMS,
        `assets/${cat}/schema.json: item-паттерн ≠ slug-форме: ${p}`);
    }
  }
  assert.equal(new RegExp(SLUG_ITEMS).test('assets/items/wood_sword.json'), true,
    'сам паттерн не матчит slug-путь');
  assert.equal(new RegExp(SLUG_ITEMS).test(
    'assets/items/' + '000012' + '.json'), false,
    'сам паттерн матчит прежний numeric-путь');
  const itemsSchema = fs.readFileSync(path.join(DIR, 'schema.json'), 'utf8');
  assert.ok(!itemsSchema.includes('assets/items/'),
    'items/schema.json: содержит item-пути (ожидание: НЕ содержит — '
    + 'собственный basename схемой не пинуется, 000318.08 её не трогает)');
});

test('000318.08 T5: referrer-свип — numeric-путей items в данных/рантайме РОВНО 0; позитивно (000379): монотонные поля агрегатов вместо снапшотов, каждая ссылка резолвится в файл каталога, non-vacuity по шести каталогам-реферерам, выборки резолвятся в прежние id', () => {
  const NUM_REF = /assets\/items\/\d{6}\.json/;
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
    'остались numeric-пути items (после флипа реестра они НЕ ref — AR8 их '
    + 'не заметит, это единственный страж): ' + hits.slice(0, 10).join(', ')
    + (hits.length > 10 ? ' … (' + hits.length + ' файлов)' : ''));
  // Позитив (000379): ЖИВОЙ свип по факту диска с монотонными полями
  // вместо снапшотов «3166/943» + реф-целостность + анти-вакуум по
  // каталогам-реферерам.
  const SLUG_REF = /assets\/items\/[a-z][a-z0-9_]*\.json/g;
  let occurrences = 0;
  const refFiles = [];
  const perId = new Map();
  const perCatalog = new Map();
  const dangling = [];
  const catalogBase = new Set(catIdsT5());
  const walk2 = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk2(p); continue; }
      if (!e.name.endsWith('.json')) continue;
      const m = fs.readFileSync(p, 'utf8').match(SLUG_REF);
      if (!m || m.length === 0) continue;
      const rel = path.relative(ROOT, p);
      refFiles.push(rel);
      occurrences += m.length;
      const top = path.relative(path.join(ROOT, 'assets'), p)
        .split(path.sep)[0];
      perCatalog.set(top, (perCatalog.get(top) || 0) + 1);
      for (const s of m) {
        const id = s.slice('assets/items/'.length, -'.json'.length);
        perId.set(id, (perId.get(id) || 0) + 1);
        if (!catalogBase.has(id)) {
          dangling.push(rel + ' → ' + s);
        }
      }
    }
  };
  walk2(path.join(ROOT, 'assets'));
  assert.ok(occurrences >= MIN_OCCURRENCES_I08,
    'items: суммарное число item-путей во всех referrer-файлах упало ниже'
    + ' поля ' + MIN_OCCURRENCES_I08 + ' (факт базы 52b75f90: 3166); факт: '
    + occurrences + ' — массовая ПОТЕРЯ ссылок на каталог items (поле'
    + ' намеренно с запасом: легитимный рост его не красит, 000379)');
  assert.ok(refFiles.length >= MIN_REF_FILES_I08,
    'items: файлов-рефереров стало меньше поля ' + MIN_REF_FILES_I08
    + ' (факт базы 52b75f90: 943); факт: ' + refFiles.length);
  assert.ok(perId.size >= MIN_DISTINCT_REFERENCED_I08,
    'items: РАЗЛИЧНЫХ id, на которые ссылаются assets/*, меньше поля '
    + MIN_DISTINCT_REFERENCED_I08 + ' (факт базы 52b75f90: 860); факт: '
    + perId.size + ' — ссылки схлопнулись на узкое подмножество');
  // Реф-целостность: КАЖДАЯ slug-ссылка на каталог указывает на
  // существующий файл (битую ссылку AR8/sync:check по shape-правилам НЕ
  // видят — путь легальной формы, файла нет).
  assert.deepEqual(dangling, [],
    'items: ссылки формы assets/items/<id>.json ведут на ОТСУТСТВУЮЩИЙ файл'
    + ' каталога (' + dangling.length + ' шт): ' + dangling.slice(0, 8)
    .join(', ') + (dangling.length > 8 ? ' …' : '')
    + ' — shape-валидность это проходит, ломается резолв в рантайме');
  // Анти-вакуум по каждому каталогу-рефереру (вместо трёх агрегатных
  // чисел): исчезновение класса ссылок целиком красится здесь, а не в
  // общем агрегате.
  const referCats = new Set(REFERRER_PROBES_00031808
    .map(([rel]) => rel.split('/')[0]));
  assert.equal(referCats.size === 6, true,
    'ожидается шесть каталогов-рефереров (craft/npc/dungeons/spells/mobs/'
    + 'buildings); факт: ' + [...referCats].join(', '));
  for (const cat of referCats) {
    assert.ok((perCatalog.get(cat) || 0) >= 1,
      'assets/' + cat + '/ не содержит НИ ОДНОЙ ссылки на каталог items —'
      + ' класс referrer-ов исчез (на базе 52b75f90: '
      + JSON.stringify(Object.fromEntries(perCatalog)) + ')');
  }
  // Присутствие реферера вместо точного счётчика (000379): per-id числа
  // двигает каждая npc/loot-волна (.27 сдвинул healing_potion 10→11).
  for (const [oldNum, id] of REFERENCED_00031808) {
    assert.ok((perId.get(id) || 0) >= 1,
      `items: «${id}» (бывший ${oldNum}) вообще без рефереров — снапшот`
      + ' миграции требовал хотя бы одной ссылки ( rewrite потерял их все)');
  }
  // Выборки из 6 каталогов: путь переписан, это ref, резолв ok, id цели.
  for (const [rel, ref, targetId] of REFERRER_PROBES_00031808) {
    const raw = fs.readFileSync(path.join(ROOT, 'assets', rel), 'utf8');
    assert.ok(raw.includes('"' + ref + '"'),
      `${rel}: ссылка ${ref} не найдена (rewrite не прошёл?)`);
    assert.equal(JR.isRef(ref), true, `${rel}: ${ref} — не ref`);
    const r = JR.resolveRef(ROOT, ref);
    assert.ok(r.ok, `${rel}: ${ref} — ${r.reason}`);
    assert.equal(r.id, targetId,
      `${rel}: id цели ${ref} = ${r.id} ≠ прежнему файлу-номеру`);
  }
});

test('000318.08 T6: sync-items-data.js — фильтр через живой реестр (SHAPE_BASENAME_RES[ASSET_NAME_SHAPES.items]), schema.json исключён, компаратор записей по data.id; numeric-фильтра, «0000NN» и сортировки по имени файла нет', () => {
  const src = fs.readFileSync(SYNC, 'utf8');
  assert.match(src, /require\('\.\/lib\/json-ref\.js'\)/,
    'sync: нет require lib (фильтр обязан читаться из реестра живо)');
  assert.ok(src.includes('SHAPE_BASENAME_RES')
    && src.includes('ASSET_NAME_SHAPES.items'),
    'sync: фильтр не через SHAPE_BASENAME_RES[ASSET_NAME_SHAPES.items] '
    + '(форма имени — из ЖИВОГО реестра lib, прецедент .06/.07)');
  assert.ok(src.includes("'schema.json'"),
    'sync: schema.json не исключён из фильтра (slug-regex матчит его — '
    + 'прецедент .02/.06/.07)');
  assert.ok(!/\\d\{6\}\\\.json\$/.test(src),
    'sync: остался numeric-фильтр/паттерн имён файлов каталога items');
  assert.ok(!src.includes('0000NN'),
    'sync: осталось упоминание «0000NN» в сообщении/комментарии');
  assert.match(src, /sort\(\(a, b\) => \(a\.data\.id < b\.data\.id/,
    'sync: нет компаратора порядка записей по data.id (урок .07: компаратор '
    + 'за ДАННЫМИ, а не за совпадением имени файла — на tmp-перестановке '
    + 'выход остаётся id-упорядоченным)');
});

// tmp-«репозиторий»: sync-items-data.js + lib ОБА файла (write-atomic +
// json-ref — прецедент MODULE_NOT_FOUND .01–.07) + ПОЛНЫЙ каталог items
// (schema.json внутри) + цели effect.recipe (assets/craft) из данных.
function makeTmpItemsTree() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'items-00031808-'));
  for (const sub of ['scripts/lib', 'src', 'assets/items']) {
    fs.mkdirSync(path.join(tmp, sub), { recursive: true });
  }
  for (const libFile of ['write-atomic.js', 'json-ref.js']) {
    fs.copyFileSync(path.join(ROOT, 'scripts', 'lib', libFile),
      path.join(tmp, 'scripts', 'lib', libFile));
  }
  fs.copyFileSync(SYNC, path.join(tmp, 'scripts', 'sync-items-data.js'));
  fs.copyFileSync(path.join(DIR, 'schema.json'),
    path.join(tmp, 'assets', 'items', 'schema.json'));
  for (const f of itemFiles()) {
    fs.copyFileSync(path.join(DIR, f), path.join(tmp, 'assets', 'items', f));
    const data = readItem(f);
    if (data.effect && data.effect.kind === 'craft_recipe'
      && typeof data.effect.recipe === 'string') {
      const dst = path.join(tmp, data.effect.recipe);
      if (!fs.existsSync(dst)) {
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(path.join(ROOT, data.effect.recipe), dst);
      }
    }
  }
  return tmp;
}

test('000318.08 T7: tmp-дерево — sync на полном каталоге (schema.json внутри) побайтово ≡ закоммиченному зеркалу и идемпотентен; перестановка СОДЕРЖИМОГО пары файлов — записи всё равно в id-порядке (компаратор наблюдаем)', () => {
  assert.ok(fs.existsSync(SYNC), 'RED: scripts/sync-items-data.js не существует');
  assert.ok(fs.existsSync(MIRROR), 'RED: зеркало не сгенерировано');
  for (const f of ['absolute_zero_scroll.json', 'wood_sword.json',
    'yew_longbow.json']) {
    assert.ok(fs.existsSync(path.join(DIR, f)),
      'RED: каталог не переименован — нет файла ' + f);
    assert.equal(readItem(f).id, path.basename(f, '.json'),
      'RED: ' + f + ' — id не совпадает с basename');
  }
  const committed = fs.readFileSync(MIRROR, 'utf8');
  const tmp = makeTmpItemsTree();
  const script = path.join(tmp, 'scripts', 'sync-items-data.js');
  const out = path.join(tmp, 'src', 'items-data.js');
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
    // Перестановка СОДЕРЖИМОГО пары: lex-первому файлу — содержимое
    // lex-последнего и наоборот. Сортировка по ИМЕНИ файла поставила бы
    // запись yew_longbow (оказавшуюся в absolute_zero_scroll.json) ПЕРВОЙ
    // — при компараторе по data.id выход не меняется.
    const a = path.join(tmp, 'assets', 'items', 'absolute_zero_scroll.json');
    const b = path.join(tmp, 'assets', 'items', 'yew_longbow.json');
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
      'порядок записей выхода — по data.id (по имени файла yew_longbow '
      + 'с содержимым встал бы первым; комментарий-файл сопровождает запись '
      + 'и после перестановки отличается законно — сравниваются записи)');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('000318.08 T8: 0-diff стражи — прочие src/*-data.js зеркала побайтово прежние (item-ссылки в них — РАЗРЕШЁННЫЕ id, не пути) + живые мощности (зеркало ≡ каталогу), пол лута и rarity-таблица, ВЫВЕДЕННАЯ с диска (000379: литералы 914/33/232-161-117-46-23 сняты)', () => {
  for (const mirror of ['craft-data.js', 'dungeons-data.js',
    'loot-equip-data.js', 'mob-groups-data.js', 'npc-data.js',
    'portraits-data.js', 'runes-data.js', 'skills-data.js',
    'spells-data.js', 'visuals-data.js']) {
    const before = execFileSync('git',
      ['-C', ROOT, 'show', 'HEAD:src/' + mirror],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const after = fs.readFileSync(path.join(ROOT, 'src', mirror), 'utf8');
    assert.equal(after, before,
      'src/' + mirror + ' ИЗМЕНЁН: rename items его не касается — '
      + 'зеркала хранят РАЗРЕШЁННЫЕ id предметов (sync резолвит пути), '
      + 'не файловые пути (пути item-ссылок живут ТОЛЬКО в assets)');
  }
  const { ITEMS } = require(MIRROR);
  assert.equal(ITEMS.length, itemFiles().length,
    'items — зеркало ≢ каталогу (зеркало: ' + ITEMS.length + ', диск: '
    + itemFiles().length + '); живая мощность вместо литерала — 000379');
  const lootCount = ITEMS.filter((i) => i.loot).length;
  assert.ok(lootCount >= MIN_LOOT_I08,
    'лут-кандидатов (поле loot) меньше поля ' + MIN_LOOT_I08 + ' (факт базы'
    + ' 6330d2ec: 33; состав от rename не зависит — переставляется ПОРЯДОК'
    + ' кандидатов, пины map.js пересняты, F1-принять); факт: ' + lootCount);
  const LE = require(path.join(ROOT, 'src', 'loot-equip-data.js'));
  const byRarity = new Map();
  for (const i of ITEMS) {
    if (!i.rarity) continue;
    byRarity.set(i.rarity, (byRarity.get(i.rarity) || 0) + 1);
  }
  assert.deepEqual(Object.keys(LE.EQUIP_POOLS).sort(),
    [...byRarity.keys()].sort(),
    'набор редкостей в EQUIP_POOLS ≢ rarity-таблице каталога (пулы: '
    + Object.keys(LE.EQUIP_POOLS).sort().join(',') + ', каталог: '
    + [...byRarity.keys()].sort().join(',') + ')');
  for (const [rarity, count] of byRarity) {
    assert.equal(LE.EQUIP_POOLS[rarity].length, count,
      `EQUIP_POOLS.${rarity} (${LE.EQUIP_POOLS[rarity].length}) ≢`
      + ' числу предметов этой редкости в каталоге (' + count
      + ') — таблица выводится с диска, литералы 232/161/117/46/23 сняты'
      + ' задачей 000379; F2-P1 (данные пулов 0-diff) остаётся зубом');
  }
});

test('000318.08 T9: spec/items.md побайтово прежний (канон memory/000230.16 byte-identical — гейт задачи; docs-эррата :324 — долг в памяти, НЕ правится) + SPEC_FILE_LINES items.md = 477 (line-neutral)', () => {
  const spec = fs.readFileSync(path.join(ROOT, 'spec', 'items.md'));
  const before = execFileSync('git',
    ['-C', ROOT, 'show', 'HEAD:spec/items.md'],
    { maxBuffer: 64 * 1024 * 1024 });
  assert.ok(spec.equals(before),
    'spec/items.md ИЗМЕНЁН: канон memory/000230.16 пинует БАЙТЫ диска '
    + '(canon-items-sync-000284.02 / check-canons) — rename файлов каталога '
    + 'в spec не переносится; docs-эррата ложной прозы «(000001.json, '
    + '000002.json, …)» — долг, фиксируется в memory/000318.08');
  assert.equal(String(spec).split('\n').length, 477,
    'items.md — 477 строк по счётчику spec-split (без trailing-\\n); '
    + 'пин SPEC_FILE_LINES["items.md"] не двигается');
  const canon = fs.readFileSync(
    path.join(ROOT, 'memory', '000230.16-spec-equipment-doc.md'));
  const canonBefore = execFileSync('git',
    ['-C', ROOT, 'show', 'HEAD:memory/000230.16-spec-equipment-doc.md'],
    { maxBuffer: 64 * 1024 * 1024 });
  assert.ok(canon.equals(Buffer.from(canonBefore)),
    'канон memory/000230.16-spec-equipment-doc.md ИЗМЕНЁН — byte-identical гейт (число строк '
    + 'items.md и числовые иглы заморожены; rename их НЕ трогает)');
});

// Порядок-чувствительные потребители (разбор — memory/000318.08 §потребители):
// (A) makeShop/kindPool по allItems — золотые пересняты живым кодом, сиды
//     0-diff; (B) лут-хэш map.js по ПОЗИЦИИ в ITEMS — F1-принять: map.js
//     0-diff, GOLDEN_TILES/loot пересняты, инвариант деградирует (долг);
//     (C) EQUIP_POOLS — F2-P1: данные 0-diff, пины → set-равенство.
test('000318.08 T10: потребители порядка — EQUIP_POOLS set-≡ каталогу по редкости при НЕ-lex порядке самих пулов (F2-P1); сид-каналы 0x4C4F4F54/0x43414d50 побайтово прежние (F1-принять); makeShop bt2 детерминирован и валиден под НОВЫМ lex-порядком allItems', () => {
  const { ITEMS } = require(MIRROR);
  const LE = require(path.join(ROOT, 'src', 'loot-equip-data.js'));
  for (const rarity of Object.keys(LE.EQUIP_POOLS)) {
    const pool = LE.EQUIP_POOLS[rarity];
    const cat = ITEMS.filter((i) => i.rarity === rarity).map((i) => i.id);
    assert.equal(new Set(pool).size, pool.length,
      `${rarity}: дубликаты в пуле`);
    assert.deepEqual([...pool].sort(), [...cat].sort(),
      `${rarity}: EQUIP_POOLS ≢ каталогу по редкости МНОЖЕСТВОМ (F2-P1: `
      + 'состав инвариантен; порядковое равенство снято сознательно — '
      + 'порядок пула ≠ lex, см. следующий assert)');
    const lexSorted = [...pool].sort();
    if (pool.length > 2) {
      assert.notDeepEqual(pool, lexSorted,
        `${rarity}: пул пересортирован в lex (F2-P1 нарушен: это сдвинуло бы `
        + 'порядок ролла winLoot — дропы; данные loot-equip-data.js обязаны '
        + 'оставаться 0-diff)');
    }
  }
  for (const [file, needle] of [['src/map.js', '0x4C4F4F54'],
    ['src/items.js', '0x43414d50']]) {
    const before = execFileSync('git',
      ['-C', ROOT, 'show', 'HEAD:' + file], { encoding: 'utf8' });
    const after = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.equal(after, before,
      file + ' ИЗМЕНЁН: F1-принять — сид-канал и формулы 0-diff, под lex-'
      + 'порядок пересняты ТОЛЬКО золотые (GOLDEN_TILES/loot, SHOP_GOLDEN, '
      + 'GOLDEN_MAKESHOP, GOLDEN_CAMP, A57/B26/B27, T7/T6 счётчики)');
    assert.ok(after.includes(needle), file + ': сид-константа ' + needle
      + ' пропала');
  }
  const I = require(path.join(ROOT, 'src', 'items.js'));
  const M = require(path.join(ROOT, 'src', 'map.js'));
  const B = M.BUILDING_TYPES;
  const s1 = I.makeShop(10, 20, B.APOTHECARY, 2);
  const s2 = I.makeShop(10, 20, B.APOTHECARY, 2);
  assert.notEqual(s1, null, 'makeShop(Аптекарь) — магазин');
  assert.deepEqual(Object.keys(s1.stock), Object.keys(s2.stock),
    'makeShop(bt2, wealth2) — детерминизм под новым lex-порядком allItems');
  const ids1 = Object.keys(s1.stock);
  assert.ok(ids1.length > 0, 'сток аптекаря — непустой');
  assert.equal(new Set(ids1).size, ids1.length, 'сток: дублей нет');
  for (const id of ids1) {
    assert.ok(ITEMS.some((i) => i.id === id),
      'сток bt2: id «' + id + '» нет в каталоге (stock под старым '
      + 'порядком/битый)');
  }
});

test('000318.08 T11: реестр tests/scripts/items-num2id-000318.08.json — APPEND-ONLY против HEAD (000379: заморожены СТРОКИ, а не длина), ключи — префикс 000001..N (N живой, ≥ границы rename), значения уникальны и ≡ множеству id каталога (двусторонне), disk-файл <value>.json несёт id == value, spot-строки', () => {
  const LED = LEDGER_I08_PATH;
  assert.ok(fs.existsSync(LED),
    'RED: реестра «номер → id» ещё нет — его load' + 'ят переписанные тесты '
    + 'ради виртуальных numeric-имён (позиционные пины рядов)');
  const led = REGISTRY_I08();
  const keys = Object.keys(led);
  const N_I08 = keys.length;
  assert.ok(N_I08 >= FROZEN_PREFIX_END_I08,
    'реестр: ' + N_I08 + ' строк — меньше границы rename ('
    + FROZEN_PREFIX_END_I08 + '): существующие строки удалять нельзя'
    + ' (append-only), а расти реестр обязан ВМЕСТЕ с каталогом — без'
    + ' строки реестра num === undefined в canon-items-sync и канон c1'
    + ' («nums ≢ {1..N}») краснеет невнятно');
  const want = [];
  for (let i = 1; i <= N_I08; i++) {
    want.push(String(i).padStart(6, '0'));
  }
  assert.deepEqual([...keys].sort(), want,
    'реестр: ключи — префикс 000001..' + want[N_I08 - 1] + ' подряд'
    + ' (дыр и «хвостов» нет; N = ' + N_I08 + ' — ЖИВОЙ счётчик, не литерал)');
  const SPOTS = [
    ['000001', 'wood_sword'],
    ['000012', 'healing_potion'],
    ['000032', 'nature_scroll'],
    ['000035', 'wood_log'],
    ['000108', 'ember_scroll'],
    ['000139', 'absolute_zero_scroll'],
    ['000527', 'yew_longbow'],
    ['000764', 'decadance_scroll'],
    ['000864', 'ash_elixir'],
    ['000914', 'zvany_obed'],
  ];
  for (const [num, id] of SPOTS) {
    assert.equal(led[num], id,
      `реестр: spot ${num} → «${led[num]}» ≠ «${id}» (lex-первый каталога — `
      + '000139, lex-последний — 000527: порядки mirror-ов после rename '
      + 'полностью номерного)');
  }
  const vals = Object.values(led);
  const valSet = new Set(vals);
  assert.equal(valSet.size, keys.length,
    'реестр: значения НЕ уникальны (' + (vals.length - valSet.size)
    + ' дублей) — виртуальные имена перестают быть биективными');
  for (const num of want) {
    const id = led[num];
    const f = id + '.json';
    assert.equal(JR.SHAPE_BASENAME_RES.slug.test(f), true,
      `реестр: значение ${num} → «${id}» вне slug-формы каталога items`);
    assert.ok(fs.existsSync(path.join(DIR, f)),
      `реестр: ${num} → «${id}», а диска ${f} нет (реестр рассинхронизован `
      + 'с каталогом — виртуальные имена переписанных тестов врут)');
    assert.equal(readItem(f).id, id,
      `реестр: disk-файл ${f} несёт внутренний id ≠ значению реестра`);
  }
  const diskIds = new Set(itemFiles().map((f) => readItem(f).id));
  assert.equal(diskIds.size, N_I08,
    'каталог (' + diskIds.size + ' id на диске) ≢ реестру (' + N_I08
    + ' строк) по мощности — рост каталога без APPEND строк реестра'
    + ' (рецепт — memory/000379-items-registry-unfetter.md)');
  for (const id of diskIds) {
    assert.ok(valSet.has(id),
      'каталог: id «' + id + '» отсутствует в реестре (реестр неполон — '
      + 'зуб на удаление/подмену записи либо на недописанный рост)');
  }
  // Замороженность в выполнимой форме (000379): относительно HEAD легален
  // ТОЛЬКО чистый append в конец. Пере-нумерация или удаление строки
  // ломают виртуальные номера, на которые смотрят канон c1 и позиционные
  // пины волн 000321.0{1..8}.
  const rewritten = LEDGER_APPEND_ONLY_I08();
  assert.deepEqual(rewritten, [],
    'реестр ' + LEDGER_I08_REL + ' изменён относительно HEAD НЕ-append'
    + ' правкой (' + rewritten.length + '): ' + rewritten.slice(0, 6)
    .join('; ') + (rewritten.length > 6 ? ' …' : '')
    + ' — существующие «номер → id» до коммита сторожит этот HEAD-зуб,'
    + ' после коммита — постоянный digest-зуб T13 (000392): пере-нумерация'
    + ' строк 000001..864 красна навсегда (виртуальные номера позиционных'
    + ' пинов и канона c1); дописывать pad(N+1)… в конец — единственная'
    + ' легальная правка');
});

// SELF-GATE (задача 000379) — по образцу 000375: имя замороженного
// счётчика и форма ассертов собираются concat-ом сегментов, поэтому
// собственный текст зуба им не совпадает (иначе T12 был бы вечно красным).
// Ограничение (осознанное, как у .375): ассерт-форма ловится в пределах
// ОДНОЙ физической строки — перенос аргумента на новую строку от зуба
// не спрячешь, но и не оправдан (style соседних файлов).
const FROZEN_IDENT_RE_I08 = () => new RegExp('EXPECTED_' + 'COUNT\\b', 'g');
const FROZEN_ASSERT_RE_I08 = () => new RegExp('assert' + '\\.equal\\([^\\n]*?'
  + '\\.(?:length|size)\\s*,\\s*\\d+', 'g');

test('000318.08 T12: self-gate — в исходнике этого файла нет замороженного живого счётчика каталога (ни имени-константы, ни assert.equal(<…length|size>, <литерал>)); positive-маркеры живой механики на месте', () => {
  const src = fs.readFileSync(__filename, 'utf8');
  const identHits = src.match(FROZEN_IDENT_RE_I08()) || [];
  assert.ok(identHits.length === 0,
    'в исходник items-rename вернулся замороженный счётчик каталога ('
    + identHits.length + ' вхождений имени): '
    + 'рост assets/items волнами 000321.YY легален, поэтому живое число'
    + ' здесь пинить нельзя. РЕЦЕПТ вместо литерала: каталог ≡ реестру'
    + ' по мощности (T1), зеркало ≡ каталогу (T2), ключи реестра — префикс'
    + ' 000001..N с APPEND-ONLY по HEAD (T11), агрегаты referrer-ов —'
    + ' монотонные поля MIN_* (T5); границы и рецепт —'
    + ' memory/000379-items-registry-unfetter.md');
  // Исключение (осознанное): line-пины документов вида
  // `String(x).split('\n').length === <число>` — это НЕ счётчик каталога,
  // а контракт line-neutral (SPEC_FILE_LINES / spec-split), он живёт по
  // своим правилам и меняется только вместе с документом.
  const frozenAsserts = [...src.matchAll(FROZEN_ASSERT_RE_I08())]
    .filter((m) => !m[0].includes('split('))
    .map((m) => src.slice(0, m.index).split('\n').length);
  assert.ok(frozenAsserts.length === 0,
    'в исходнике ' + frozenAsserts.length + ' ассерт-ов вида'
    + ' assert.equal(<выражение .length|.size>, <литерал>) на строках '
    + frozenAsserts.join(', ') + ' — это замороженный живой счётчик'
    + ' (мощность каталога/реестра/зеркала или длина пула). РЕЦЕПТ:'
    + ' сравнивать с живой величиной с диска (`=== itemFiles().length`),'
    + ' либо с монотонным полом (FROZEN_PREFIX_END_I08 / MIN_*), либо'
    + ' выводить из данных (rarity-таблица, lex-голова/хвост).'
    + ' Мутационный класс зуба — см. tasks/result/000379.md');
  assert.ok(src.includes('FROZEN_PREFIX_END_I08'),
    'пропал positive-маркер FROZEN_PREFIX_END_I08 — монотонная граница'
    + ' замороженного префикса (864 предмета на момент rename), ниже которой'
    + ' каталог/реестр упасть не могут');
  assert.ok(src.includes('LEDGER_APPEND_ONLY_I08'),
    'пропал positive-маркер LEDGER_APPEND_ONLY_I08 — зуб «реестр'
    + ' append-only относительно HEAD» (заморожены СТРОКИ, а не длина);'
    + ' без него волна, дописавшая реестр, остаётся без стража пере-нумерации');
  // Форма-паттерн (а не includes имени): маркер требует саму декларацию
  // hex-литерала, поэтому собственный текст этого зуба ему НЕ совпадает
  // (self-match = 0) — удаление константы FROZEN_PREFIX_DIGEST_SHA256_I08
  // красит self-gate, а не молча проходит (тот же принцип concat-регэкспов,
  // что FROZEN_IDENT_RE_I08 выше).
  assert.ok(/FROZEN_PREFIX_DIGEST_SHA256_I08 =\s*\n?\s*'[0-9a-f]{64}'/.test(src),
    'пропал positive-маркер FROZEN_PREFIX_DIGEST_SHA256_I08 (sha256-'
    + 'литерал замороженного префикса 000001..864, T13/000392): без'
    + ' постоянной digest-пины закоммиченная пере-нумерация префикса снова'
    + ' машиной невидима (ретро-b24 F1) — возвращай зуб, а не глуши его');
});

test('000318.08 T13: постоянный digest-зуб замороженного префикса (000392, ретро-b24 F1/К1) — sha256 канонической сериализации первых FROZEN_PREFIX_END_I08 пар num→id реестра ≡ неизменному литералу: подмена/пере-нумерация строк 000001..864 красна и ПОСЛЕ коммита (там HEAD-зуб T11 слепнет), легальный append pad(N+1)… в хвост литерал не двигает', () => {
  assert.ok(fs.existsSync(LEDGER_I08_PATH),
    'RED: реестра «номер → id» ещё нет — digest-зуб считается от него');
  const digest = FROZEN_PREFIX_DIGEST_I08();
  assert.equal(digest, FROZEN_PREFIX_DIGEST_SHA256_I08,
    'digest префикса 000001..' + FROZEN_PREFIX_END_I08 + ' пар реестра '
    + LEDGER_I08_REL + ' = «' + digest + '» ≠ каноническому литералу —'
    + ' пары внутри префикса пере-нумерованы или подменены (в том числе'
    + ' закоммиченно: HEAD-зуб T11 на это слеп, это дефект F1 ретро-b24).'
    + ' РЕЦЕПТ: строки 000001..864 неприкосновенны; рост каталога дописывает'
    + ' pad(N+1)… в КОНЕЦ реестра — литерал от этого не меняется'
    + ' (граница, формула и рецепт — memory/000379-items-registry-unfetter.md)');
});

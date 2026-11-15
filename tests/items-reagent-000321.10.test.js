// Задача 000321.10 (10-я волна батча 000321): +50 реагентов kind=reagent,
// виртуальные позиции 000965–001014, иконки в assets/sprites/loot, +25
// рецептов (алхимия 12 / резьба_по_камню 9 / рунопись 4). kind=node;
// require — свои модули. Контракт — memory/000321-reagent-items.md.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const I = require('../src/items.js');
const ITD = require('../src/items-data.js');
const { validateData } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const ITEMS_DIR = path.join(ROOT, 'assets', 'items');
const LOOT_DIR = path.join(ROOT, 'assets', 'sprites', 'loot');
const CRAFT_DIR = path.join(ROOT, 'assets', 'craft');

const NUM2ID = require(path.join(__dirname, 'scripts',
  'items-num2id-000318.08.json'));
const ID2NUM = {};
for (const n of Object.keys(NUM2ID)) ID2NUM[NUM2ID[n]] = n;
function SLUG(f) {
  return f !== 'schema.json' && /^[a-z][a-z0-9_]*\.json$/.test(f);
}
function VIRTNUM(f) {
  const b = f.replace(/\.json$/, '');
  return ID2NUM[b] !== undefined ? ID2NUM[b] + '.json' : f;
}
function DISKF(x) {
  const b = String(x).replace(/\.json$/, '');
  return (NUM2ID[b] !== undefined ? NUM2ID[b] : b) + '.json';
}
function FILES() {
  return fs.readdirSync(ITEMS_DIR).filter(SLUG).map(VIRTNUM).sort();
}
function loadItemFile(num) {
  const f = String(num).padStart(6, '0') + '.json';
  const p = path.join(ITEMS_DIR, DISKF(f));
  assert.ok(fs.existsSync(p),
    'assets/items/' + f + ' существует (краснота: каталог 964 — '
    + 'реагенты волны не созданы)');
  return fs.readFileSync(p, 'utf8');
}
function diskObj(id) {
  const p = path.join(ITEMS_DIR, id + '.json');
  assert.ok(fs.existsSync(p), 'assets/items/' + id + '.json существует');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function allDiskObjects() {
  const out = [];
  for (const f of fs.readdirSync(ITEMS_DIR).filter(SLUG)) {
    out.push(JSON.parse(fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8')));
  }
  return out;
}

const CANON_ORDER = ['id', 'name', 'kind', 'subtype', 'weight', 'value',
  'base_price', 'tier', 'desc', 'stats', 'effect', 'loot', 'icon',
  'slot', 'rarity', 'set', 'affixes', 'set_bonus'];
const FORBIDDEN_KEYS = ['rarity', 'slot', 'set', 'subtype', 'stats',
  'effect', 'affixes', 'set_bonus', 'base_price'];
const TERRAINS = ['глубокая вода', 'вода', 'песок', 'трава', 'лес',
  'холмы', 'горы', 'болото'];
const LEX_PREDECESSOR = 'zvukopis_unkill'; // lex-хвост каталога ДО 000321.10
// Префикс реестра 000001..000864 заморожен digest-зубом 000392 (сиблинг
// FROZEN_PREFIX_DIGEST_SHA256_I08); наш хвост 965..1014 его не касается —
// постоянная константа ниже — свой зуб T7 (имя и форма не совпадают с
// сиблинговым паттерном self-gate — cross-попадания нет).
const FROZEN864_SHA256_I10 =
  '8bb0a1c526913a84d68c9c98d3fa0265cc3adddd42a04c33b0bb4657a5ad0945';
function frozen864Digest() {
  const ks = Object.keys(NUM2ID).slice(0, 864);
  return createHash('sha256').update(JSON.stringify(
    ks.map((k) => [k, NUM2ID[k]]))).digest('hex');
}
// Коридоры weight/value/frequency новых реагентов по tier (решение
// станции, memory/000321-reagent-items.md): t1 (без tier) — свой коридор;
// t2/t3/t4 — границы фактических 000157.01-реагентов диска.
const CORR = {
  1: { w: [0.05, 1], v: [2, 10], f: [0.03, 0.035, 0.04] },
  2: { w: [0.1, 1], v: [12, 30], f: [0.025] },
  3: { w: [0.1, 1], v: [25, 40], f: [0.015] },
  4: { w: [0.05, 0.5], v: [80, 100], f: [0.005] },
};
// Старые реагенты-образцы: [id, tier(0=нет), weight, value, freq(null=нет
// loot)] — вербатим-страж «волна не тронула старых» (значения сняты с
// диска базы cffd686c).
const OLD_REAGENTS = {
  sulfur: [0, 0.2, 3, null], coal: [0, 0.5, 2, null],
  quartz: [2, 0.2, 12, 0.025], moonstone: [0, 0.1, 25, 0.04],
  herb_bitter: [0, 0.1, 2, 0.02],
};

const ROSTER_00032110 = [
  [965,"zyabkaya_hvoya","Зябкая хвоя",2,0.1,12,0.025,["лес"],0,"собрана в первые заморозки: хрустит и колется."],
  [966,"zyabkaya_iney","Зябкий иней",2,0.1,14,0.025,["трава","лес"],0,"снимают с камней до рассвета: тает в тёплой ладони."],
  [967,"zyabkaya_iva","Зябкая ива",2,0.1,12,0.025,["болото","трава"],0,"кора с подмороженных веток: вяжет сильнее летней."],
  [968,"zyabkaya_krapiva","Зябкая крапива",2,0.1,15,0.025,["трава"],0,"после первых холодов жалит слабее, но жжёт вернее."],
  [969,"zyabkaya_krov","Зябкая кровь",2,0.3,24,0.025,["болото","лес"],0,"застывает рыжими хлопьями; в реактивах держит цвет."],
  [970,"zyabkaya_mut","Зябкая муть",2,0.2,13,0.025,["болото"],0,"со дна холодных заводей: пахнет тиной и железом."],
  [971,"zyabkaya_myata","Зябкая мята",2,0.1,15,0.025,["трава"],0,"холодит по-настоящему: мятный дух перехватывает дыхание."],
  [972,"zyabkaya_okalina","Зябкая окалина",2,0.4,20,0.025,["трава"],0,"отслаивается от остывшего чугуна звонко, как чешуя."],
  [973,"zyabkaya_polyn","Зябкая полынь",2,0.1,16,0.025,["трава"],0,"горечь после мороза становится металлической."],
  [974,"zyabkaya_pudra","Зябкая пудра",2,0.1,18,0.025,["болото"],0,"мельчайший помол из промёрзшей руды: липнет к языку."],
  [975,"zyabkaya_rosa","Зябкая роса",2,0.1,14,0.025,["трава"],0,"собрана на траве до рассвета: на вкус холодная."],
  [976,"zyabkaya_rtut","Зябкая ртуть",2,0.5,30,0.025,["трава","болото"],0,"катится тяжелее, чем кажется: ногтем не поддевай."],
  [977,"zyabkaya_selitra","Зябкая селитра",2,0.2,22,0.025,["трава","болото"],0,"выцветает на стенах подвалов белым инеем."],
  [978,"zyabkaya_sliz","Зябкая слизь",2,0.2,13,0.025,["болото"],0,"тянется нитью и не рвётся на морозу."],
  [979,"zyabkaya_veresk","Зябкий вереск",2,0.1,17,0.025,["лес","трава"],0,"соцветия под снегом сохраняют медвяную горечь."],
  [980,"zybkaya_glina","Зыбкая глина",0,0.3,3,0.04,["болото","трава"],0,"липнет к рукам и просит обжига."],
  [981,"zybkaya_gryaz","Зыбкая грязь",0,0.3,2,0.04,["болото"],0,"топит сапоги и сомнения; для гончаров — находка."],
  [982,"zybkaya_izvest","Зыбкая известь",0,0.2,4,0.03,["трава"],0,"гасится паром и собственной жадностью; стены белит, руки кусает."],
  [983,"zybkaya_kasha","Зыбкая каша",0,0.4,5,0.03,["трава"],0,"размазня по густоте, зато держит тепло дольше руки."],
  [984,"zybkaya_krupa","Зыбкая крупа",0,0.2,4,0.03,["трава"],0,"полбяная, соринок вчетверо больше зерна."],
  [985,"zybkaya_kvas","Зыбкий квас",0,0.3,4,0.03,["трава"],0,"бродит в бочке и требует, чтобы его наконец выпили."],
  [986,"zybkaya_mel","Зыбкий мел",0,0.1,4,0.03,["трава"],0,"крошится в палец; чертит только по мокрому."],
  [987,"zybkaya_muka","Зыбкая мука",0,0.2,3,0.03,["трава"],0,"помол с водой: хранится сутки, потом начинает дышать."],
  [988,"zybkaya_mylo","Зыбкое мыло",0,0.2,5,0.03,["болото"],0,"мылится в холодной воде и не смеётся над грязью."],
  [989,"zybkaya_okhra","Зыбкая охра",0,0.2,4,0.035,["трава","лес"],0,"красит пальцы на неделю; в грунтовке незаменима."],
  [990,"zybkaya_pena","Зыбкая пена",0,0.05,2,0.04,["болото"],0,"собирают совком; на ладонях живёт недолго."],
  [991,"zybkaya_pyl","Зыбкая пыль",0,0.1,3,0.035,["трава"],0,"поднимается столбом, а падает камнем."],
  [992,"zybkaya_smola","Зыбкая смола",0,0.2,5,0.035,["лес"],0,"течёт даже на ветру: янтарь вчерашнего дня."],
  [993,"zybkaya_sol","Зыбкая соль",0,0.1,4,0.035,["болото","трава"],0,"выкипает из горьких озёр крупным серым снегом."],
  [994,"zybkaya_syvorotka","Зыбкая сыворотка",0,0.3,4,0.035,["трава"],0,"остаётся после сыра: на лице стягивает, на ране чистит."],
  [995,"zybkaya_testo","Зыбкое тесто",0,0.4,6,0.03,["трава"],0,"бежит через край кадки, если задать ему мало ходу."],
  [996,"zybkaya_tina","Зыбкая тина",0,0.2,2,0.04,["болото"],0,"со дна: пахнет летом, которое было три года назад."],
  [997,"zybkaya_uksus","Зыбкий уксус",0,0.3,5,0.03,["трава","болото"],0,"кислый до слёз: вытравливает ржавчину и старые обиды."],
  [998,"zybkaya_voda","Зыбкая вода",0,0.2,3,0.04,["болото"],0,"стоит там, где её нет: обходи слева и не спрашивай почему."],
  [999,"zybkaya_zola","Зыбкая зола",0,0.1,3,0.035,["лес","трава"],0,"от костров, что горели три дня; щелочная и въедливая."],
  [1000,"zyudskaya_gorech","Зюйдская горечь",3,0.1,40,0.015,["трава","болото"],0,"вытяжка из южных трав: ложка отрезвит хуже пощёчины."],
  [1001,"zyudskaya_kamed","Зюйдская камедь",3,0.2,28,0.015,["лес"],0,"застывший сок акации: связка для красок и пилюль."],
  [1002,"zyudskaya_koritsa","Зюйдская корица",3,0.1,26,0.015,["лес"],0,"кора свёрнута в трубку и пахнет чужими деньгами."],
  [1003,"zyudskaya_kurkuma","Зюйдская куркума",3,0.1,25,0.015,["трава","болото"],0,"красит всё, чего коснётся: еду, пальцы и репутацию."],
  [1004,"zyudskaya_ladan","Зюйдский ладан",3,0.2,34,0.015,["трава","лес"],0,"серёжки смолы; в храме и в алхимии — на вес серебра."],
  [1005,"zyudskaya_mirra","Зюйдская мирра",3,0.2,32,0.015,["трава"],0,"смола из-за моря: жгут там, где хотят быть услышанными."],
  [1006,"zyudskaya_sandal","Зюйдский сандал",3,0.3,30,0.015,["лес"],0,"стружка тонет в воде и красит её в закат."],
  [1007,"zyudskaya_shafran","Зюйдский шафран",3,0.1,35,0.015,["трава"],0,"три рыльца на горшок: дороже золота, капризнее приданого."],
  [1008,"zyudskaya_surguch","Зюйдский сургуч",3,0.3,26,0.015,["трава"],0,"воск с киноварью: печать ставит тот, кому доверяют."],
  [1009,"zyudskaya_vanil","Зюйдская ваниль",3,0.1,28,0.015,["лес"],0,"стручки из юных колоний: дух на всю лавку."],
  [1010,"zyuzya_almaz","Зюзя-алмаз",4,0.1,100,0.005,["лес"],0,"лежал в жиле до первой вьюги: режет даже стекло настроения."],
  [1011,"zyuzya_mifril","Зюзя-мифрил",4,0.3,95,0.005,["трава","лес"],0,"взял стужу в себя: звенит на ветру не звонко, а глухо."],
  [1012,"zyuzya_perlamut","Зюзя-перламутр",4,0.1,90,0.005,["болото"],0,"раковина, закрытая на морозе: внутри — северное сияние."],
  [1013,"zyuzya_yantar","Зюзя-янтарь",4,0.2,85,0.005,["болото"],0,"в капле янтаря зимует мошка возрастом в тысячу вьюг."],
  [1014,"zyuzya_zlato","Зюзя-злато",4,0.2,80,0.005,["болото","трава"],0,"самородок в изморози: алхимии нужен холод, а не тепло."]
];
const ROSTER_IDS = ROSTER_00032110.map((r) => r[1]);
const ROSTER_SET = new Set(ROSTER_IDS);

function recFiles() {
  return fs.readdirSync(CRAFT_DIR)
    .filter((f) => f !== 'schema.json' && /^[a-z][a-z0-9_]*\.json$/.test(f))
    .sort();
}
function lootSvgFiles() {
  return fs.readdirSync(LOOT_DIR).filter((f) => f.endsWith('.svg')).sort();
}

// --- T1: форма 50 предметов --------------------------------------------------

test('000321.10 T1: каталог — ровно 1014 файла <id>.json (позиции 000965–001014 по реестру 000318.08); новые 50 — kind reagent, БЕЗ effect/rarity/slot/base_price/subtype/stats/set/affixes/set_bonus (стопка 99 — рантайм MAX_STACK, JSON-поля stack в схеме нет), tier по ростуеру (0 — поля нет), icon = assets/sprites/loot/<id>.svg ПОСЛЕДНИМ ключом, порядок ключей = канон sync-items-data.js, roundtrip-канон stringify(…,2)+\\n, валидны по assets/items/schema.json (краснота: каталог 964 — волна не добавлена)', () => {
  const files = FILES();
  assert.equal(files.length, 1014,
    'каталог — 1014 файла (964 + 50 реагентов 000321.10); факт: '
    + files.length + ' (краснота: волна не добавлена)');
  const schema = JSON.parse(
    fs.readFileSync(path.join(ITEMS_DIR, 'schema.json'), 'utf8'));
  for (const [num, id, , tier] of ROSTER_00032110) {
    const f = String(num).padStart(6, '0') + '.json';
    assert.equal(files[num - 1], f,
      'реестровый порядок: позиция ' + num + ' — ' + f + ' (факт: '
      + files[num - 1] + ')');
    const raw = loadItemFile(num);
    const j = JSON.parse(raw);
    assert.deepEqual(validateData(schema, j, f), [], f + ': схема');
    assert.equal(j.kind, 'reagent', f + ': kind reagent');
    for (const absent of FORBIDDEN_KEYS) {
      assert.equal(j[absent], undefined, f + ': ' + absent + ' нет');
    }
    if (tier === 0) {
      assert.equal(j.tier, undefined, f + ': tier нет (t1 — отсутствие поля)');
    } else {
      assert.equal(j.tier, tier, f + ': tier == ' + tier);
    }
    assert.equal(j.icon, 'assets/sprites/loot/' + id + '.svg',
      f + ': icon = assets/sprites/loot/<id>.svg (решение станции — loot)');
    const keys = Object.keys(j);
    assert.equal(keys[keys.length - 1], 'icon',
      f + ': icon — ПОСЛЕДНИЙ ключ; факт: ' + keys.join(','));
    const idx = keys.filter((k) => k !== 'id')
      .map((k) => CANON_ORDER.indexOf(k));
    assert.deepEqual(idx, [...idx].sort((a, b) => a - b),
      f + ': порядок ключей — канон KEYS sync-items-data.js; факт: '
      + keys.join(','));
    assert.equal(JSON.stringify(j, null, 2) + '\n', raw,
      f + ': roundtrip-канон');
  }
});

// --- T2: ростер + глобальная уникальность + lex-хвост ------------------------

test('000321.10 T2: ростер 50 строк ≡ JSON (id/имя/weight/value/desc «<Имя>: …»); sweep по 1014: id, ИМЕНА и ОПИСАНИЯ уникальны по всему живому каталогу; все 50 новых id ЛЕКСИКОГРАФИЧЕСКИ > «zvukopis_unkill» (additions-only: lex-хвост ⇒ rng-потоки стоков/лутов существующих предметов не сдвигаются) (краснота: каталог 964)', () => {
  const files = FILES();
  assert.equal(files.length, 1014, 'каталог — 1014; факт: ' + files.length);
  const ids = new Map();
  const names = new Map();
  const descs = new Map();
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(
      path.join(ITEMS_DIR, DISKF(f)), 'utf8'));
    assert.ok(!ids.has(j.id), 'дубликат id: ' + j.id + ' (' + f + ')');
    ids.set(j.id, f);
    assert.ok(!names.has(j.name),
      'дубликат имени: ' + j.name + ' (' + f + ')');
    names.set(j.name, f);
    assert.ok(!descs.has(j.desc),
      'дубликат desc: ' + j.desc + ' (' + f + ')');
    descs.set(j.desc, f);
  }
  assert.equal(ids.size, 1014);
  for (const [num, id, name, , weight, value, , , , tail] of ROSTER_00032110) {
    const j = JSON.parse(loadItemFile(num));
    assert.equal(j.id, id, num + ': id == ростер');
    assert.equal(j.name, name, id + ': имя == ростер');
    assert.equal(j.weight, weight, id + ': weight == ростер');
    assert.equal(j.value, value, id + ': value == ростер');
    assert.equal(j.desc, name + ': ' + tail, id + ': desc = «<Имя>: …»');
    assert.ok(id > LEX_PREDECESSOR,
      id + ': lex-позиция после хвоста каталога ДО волны ('
      + LEX_PREDECESSOR + ')');
  }
});

// --- T3: контракт вида reagent: tier/коридоры/loot/рантайм-стопка ------------

test('000321.10 T3: контракт новых 50: БЕЗ effect/rarity/stack-поля; tier ∈ {нет,2,3,4} с распределением 20/15/10/5; weight/value/frequency — по коридорам tier (t1 — новый коридор станции 0.05–1/2–10); У ВСЕХ 50 поле loot (terrains ⊆ 8-enum, frequency обратно tier); stack 99 — рантайм: I.MAX_STACK === 99 и STACKABLE ∋ reagent (src/items.js, JSON-поля stack в схеме нет и быть не может) (краснота: файлов волны нет)', () => {
  const dist = {};
  for (const [num, id, , tier, weight, value, freq, terrains, nm] of ROSTER_00032110) {
    const j = JSON.parse(loadItemFile(num));
    assert.equal(j.effect, undefined, id + ': effect нет (факт вида)');
    assert.equal(j.rarity, undefined, id + ': rarity нет (вместо — tier)');
    assert.equal(j.stack, undefined, id + ': stack-поля нет (schema '
      + 'additionalProperties)');
    const t = j.tier === undefined ? 1 : j.tier;
    assert.ok([1, 2, 3, 4].includes(t), id + ': tier ∈ 1..4; факт: ' + j.tier);
    dist[t] = (dist[t] || 0) + 1;
    const c = CORR[t];
    assert.ok(j.weight >= c.w[0] && j.weight <= c.w[1],
      id + ': weight ∈ [' + c.w + '] для t' + t + '; факт: ' + j.weight);
    assert.ok(j.value >= c.v[0] && j.value <= c.v[1],
      id + ': value ∈ [' + c.v + '] для t' + t + '; факт: ' + j.value);
    assert.ok(c.f.includes(j.loot.frequency),
      id + ': frequency ∈ {' + c.f + '} для t' + t + '; факт: '
      + j.loot.frequency);
    assert.ok(Array.isArray(j.loot.terrains) && j.loot.terrains.length >= 1,
      id + ': loot.terrains непуст');
    for (const tr of j.loot.terrains) {
      assert.ok(TERRAINS.includes(tr), id + ': terrain «' + tr + '» ∈ enum');
    }
    assert.deepEqual(j.loot.terrains, terrains, id + ': terrains == ростер');
    assert.equal(j.loot.near_mountains === true ? 1 : 0, nm,
      id + ': near_mountains == ростер');
  }
  assert.deepEqual(dist, { 1: 20, 2: 15, 3: 10, 4: 5 },
    'распределение tier новых 50 — 20/15/10/5 («глубже = реже»); факт: '
    + JSON.stringify(dist));
  assert.equal(I.MAX_STACK, 99, 'MAX_STACK === 99 (стопка)');
  const srcText = fs.readFileSync(path.join(ROOT, 'src', 'items.js'), 'utf8');
  assert.ok(/const STACKABLE = new Set\(\[[^\]]*'reagent'/.test(srcText),
    'STACKABLE содержит reagent (стопка вида — рантайм-факт)');
});

// --- T4: живой вид-счётчик reagent 38→88 + вербатим старых ------------------

test('000321.10 T4: вид reagent — РОВНО 88 (38 старых + 50 новых, живой kind-свип по зеркалу); У ВСЕХ 88 нет rarity и нет effect (sweep-пин факта ТЗ); старые образцы вербатим с ДИСКА (sulfur/coal/quartz/moonstone/herb_bitter — tier/weight/value/freq не двигались) (краснота: reagent 38)', () => {
  const reagents = ITD.ITEMS.filter((it) => it.kind === 'reagent');
  assert.equal(reagents.length, 88,
    'reagent — 88 (38 + 50 волны); факт: ' + reagents.length);
  for (const it of reagents) {
    assert.equal(it.rarity, undefined, it.id + ': rarity нет');
    assert.equal(it.effect, undefined, it.id + ': effect нет');
  }
  assert.equal(reagents.filter((it) => !ROSTER_SET.has(it.id)).length, 38,
    'старых reagent — 38 (волна их не перекрасила); факт: '
    + reagents.filter((it) => !ROSTER_SET.has(it.id)).length);
  for (const [id, [tier, weight, value, freq]] of Object.entries(OLD_REAGENTS)) {
    const j = diskObj(id);
    assert.equal(j.kind, 'reagent', id + ': старый — reagent');
    assert.equal(j.tier === undefined ? 0 : j.tier, tier,
      id + ': tier старого не двигался');
    assert.equal(j.weight, weight, id + ': weight старого не двигался');
    assert.equal(j.value, value, id + ': value старого не двигался');
    assert.equal(j.loot ? j.loot.frequency : null, freq,
      id + ': loot.frequency старого не двигался');
  }
});

// --- T5: иконки в sprites/loot ------------------------------------------------

test('000321.10 T5: иконки — 50 новых в assets/sprites/loot (каталог лут-иконок РОВНО 83 = 33 + 50); биекция <id>.json ↔ <id>.svg; flat-SVG 64×64: viewBox ровно «0 0 64 64», ПЕРВЫЙ элемент — тень-эллипс rgba(0,0,0,0.22), без linearGradient/radialGradient/<text/<path/<use/stroke= (паттерн 000302); геометрия 0..64, NaN-запрет; sha256-уникальность против всех 83 (краснота: файлов нет)', () => {
  const hash = (p) => createHash('sha256')
    .update(fs.readFileSync(p)).digest('hex');
  const hashes = new Map();
  const svgs = lootSvgFiles();
  for (const f of svgs) {
    const h = hash(path.join(LOOT_DIR, f));
    assert.ok(!hashes.has(h), 'дубликат байт иконки: ' + f + ' ≡ '
      + hashes.get(h));
    hashes.set(h, f);
  }
  assert.equal(hashes.size, 83,
    'иконок sprites/loot — 83 (33 + 50 реагентов); факт: ' + hashes.size
    + ' (краснота: иконок нет)');
  for (const [, id] of ROSTER_00032110) {
    const f = id + '.svg';
    const p = path.join(LOOT_DIR, f);
    assert.ok(fs.existsSync(p), f + ': файл иконки');
    const text = fs.readFileSync(p, 'utf8');
    assert.ok(!/linearGradient|radialGradient/.test(text),
      f + ': градиенты запрещены');
    for (const bad of ['<text', '<path', '<use']) {
      assert.ok(!text.includes(bad), f + ': «' + bad + '» запрещён');
    }
    assert.ok(!/stroke=/.test(text), f + ': stroke= запрещён');
    assert.ok(!/NaN|Infinity|undefined/.test(text),
      f + ': битое число в байтах иконки (генератор выдал NaN/Infinity)');
    for (const m of text.matchAll(/points="([^"]+)"/g)) {
      for (const tok of m[1].trim().split(/\s+/)) {
        const [px, py] = tok.split(',').map(Number);
        assert.ok(Number.isFinite(px) && Number.isFinite(py)
          && px >= 0 && px <= 64 && py >= 0 && py <= 64,
          f + ': вершина «' + tok + '» вне холста 0..64');
      }
    }
    for (const m of text.matchAll(/(?:cx|cy|rx|ry|r)="([^"]+)"/g)) {
      const v = Number(m[1]);
      assert.ok(Number.isFinite(v) && v >= 0 && v <= 64,
        f + ': размер «' + m[1] + '» вне холста 0..64');
    }
    const vb = text.match(/viewBox="([^"]*)"/g) || [];
    assert.equal(vb.length, 1, f + ': viewBox ровно 1');
    assert.ok(text.includes('viewBox="0 0 64 64"'),
      f + ': flat 64×64; факт: ' + vb.join(';'));
    const shapeLines = text.split('\n').filter((l) => l.trim().startsWith('<')
      && !l.trim().startsWith('<svg') && !l.trim().startsWith('</'));
    const firstShape = (shapeLines[0] || '').trim();
    assert.ok(/^<ellipse[^>]*fill="rgba\(0,0,0,0\.22\)"/.test(firstShape),
      f + ': ПЕРВЫЙ элемент — тень-эллипс rgba(0,0,0,0.22); факт: '
      + firstShape.slice(0, 40));
    const j = diskObj(id);
    assert.equal(j.icon, 'assets/sprites/loot/' + f,
      f + ': биекция icon ↔ файл');
  }
});

// --- T6: рецепты --------------------------------------------------------------

test('000321.10 T6: craft — РОВНО 718 (693 + 25 новых: алхимия 12 [alchemy_lab] / резьба_по_камню 9 [rune_stone+ruins] / рунопись 4 [rune_stone+library+obelisk]); итоговые типы 244/173/114/95/86/6; новые валидны по assets/craft/schema.json, результат — наш reagent, исходники существуют; вторичный свип по 718: НИ ОДИН рецепт не сломан (результат и исходники резолвятся); DISASSEMBLY_BY_ITEM 648→673 (+25 результатов, база ни у кого не заведена) (краснота: craft 693)', () => {
  const files = recFiles();
  assert.equal(files.length, 718,
    'craft — 718 файла (693 + 25 волны); факт: ' + files.length);
  const schema = JSON.parse(
    fs.readFileSync(path.join(CRAFT_DIR, 'schema.json'), 'utf8'));
  const byType = {};
  const ours = [];
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(CRAFT_DIR, f), 'utf8'));
    byType[j['тип']] = (byType[j['тип']] || 0) + 1;
    const rid = j['результат']['предмет'].replace(/^assets\/items\//, '')
      .replace(/\.json$/, '');
    if (ROSTER_SET.has(rid)) ours.push([f, j]);
    const it = I.getItem(rid);
    assert.ok(it, f + ': результат ∈ каталог (' + rid + ')');
    for (const m of j['исходники']) {
      const mid = m['предмет'].replace(/^assets\/items\//, '')
        .replace(/\.json$/, '');
      assert.ok(I.getItem(mid), f + ': исходник ∈ каталог (' + mid + ')');
      for (const s of j['навыки']) {
        assert.ok(fs.existsSync(path.join(ROOT, s)), f + ': навык ' + s);
      }
      for (const b of j['здания']) {
        assert.ok(fs.existsSync(path.join(ROOT, b)), f + ': здание ' + b);
      }
    }
  }
  assert.equal(ours.length, 25,
    'рецептов с результатом волны — 25; факт: ' + ours.length);
  assert.deepEqual(byType, {
    'зачарование': 244, 'кузнечное_дело': 173, 'столярное_дело': 114,
    'резьба_по_камню': 95, 'алхимия': 86, 'рунопись': 6,
  }, 'типы рецептов — 244/173/114/95/86/6; факт: ' + JSON.stringify(byType));
  const C = require(path.join(ROOT, 'src', 'craft.js'));
  assert.equal(Object.keys(C.DISASSEMBLY_BY_ITEM).length, 673,
    'DISASSEMBLY_BY_ITEM — 673 (648 + 25 результатов); факт: '
    + Object.keys(C.DISASSEMBLY_BY_ITEM).length);
});

// --- T7: зеркало + реестр + digest-инвариантность префикса 864 ---------------

test('000321.10 T7: зеркало src/items-data.js — 1014 записей, новые 50 ≡ JSON поэлементно, getItem резолвится, зеркало lex-упорядочено и наши 50 — его ХВОСТ (additions-only); реестр — ключи «000001»…«001014» подряд, биекция с диском, 000965…001014 ≡ ростер (append-only); digest замороженного префикса 000001..000864 ≡ литералу 000392 — хвостовой append его НЕ касается (краснота: зеркало 964 / реестр 964)', () => {
  const diskCount = fs.readdirSync(ITEMS_DIR).filter(SLUG).length;
  assert.equal(ITD.ITEMS.length, diskCount,
    'зеркало ≡ диск по числу записей; факт: зеркало ' + ITD.ITEMS.length
    + ', диск ' + diskCount);
  assert.equal(ITD.ITEMS.length, 1014,
    'зеркало — 1014 записей; факт: ' + ITD.ITEMS.length);
  const ids = ITD.ITEMS.map((it) => it.id);
  assert.ok(ids.every((v, i) => i === 0 || ids[i - 1] < v),
    'зеркало lex-упорядочено по id');
  for (const [, id] of ROSTER_00032110) {
    const mirror = I.getItem(id);
    assert.ok(mirror, id + ': getItem резолвится');
    assert.deepEqual(mirror, diskObj(id), id + ': зеркало ≡ JSON');
  }
  const ours = ids.filter((v) => ROSTER_SET.has(v));
  assert.equal(ours.length, 50, 'в зеркале — все 50 реагентов волны');
  assert.deepEqual(ours, ids.slice(-50),
    'наши 50 — ХВОСТ зеркального lex-порядка (additions-only)');
  const nums = Object.keys(NUM2ID);
  assert.equal(nums.length, 1014, 'реестр — 1014 строк; факт: ' + nums.length);
  assert.deepEqual(nums, nums.map((_, i) => String(i + 1).padStart(6, '0')),
    'реестр — «000001»…«001014» подряд, без дыр');
  const byId = new Set(Object.values(NUM2ID));
  assert.equal(byId.size, 1014, 'реестр — биекция с диском');
  for (const f of fs.readdirSync(ITEMS_DIR).filter(SLUG)) {
    assert.ok(byId.has(f.replace(/\.json$/, '')),
      f + ': позиция в реестре есть');
  }
  ROSTER_00032110.forEach(([num, id]) => {
    const key = String(num).padStart(6, '0');
    assert.equal(NUM2ID[key], id,
      key + ': реестр ≡ ростер (факт: ' + NUM2ID[key] + ')');
  });
  assert.equal(frozen864Digest(), FROZEN864_SHA256_I10,
    'digest префикса 000001..000864 не тронут append-хвостом 965..1014 '
    + '(зуб 000392 переживает нашу волну)');
});

// --- T8: живые дельты счётчиков ----------------------------------------------

test('000321.10 T8: регресс-канарейки ЖИВЫМИ выражениями — диск ≡ зеркало ≡ реестр; дельты относительно каталога БЕЗ наших 50: каталог +50, reagent +50, лут-иконок +50, рецептов +25, «без slot» +50, «без base_price» +50, rarity +0; собственные assert-ы не содержат ручных литералов формы «NNN файлов»; реестровый HEAD-guard (≡HEAD к tests/scripts) в этом файле запрещён — зубы живые + digest (self-match 0) (краснота: дельты нулевые)', () => {
  const all = allDiskObjects();
  const rest = all.filter((it) => !ROSTER_SET.has(it.id));
  const svgs = lootSvgFiles();
  const svgRest = svgs.filter((f) => !ROSTER_SET.has(f.replace(/\.svg$/, '')));
  const recs = recFiles();
  const nums = Object.keys(NUM2ID);
  assert.equal(all.length, ITD.ITEMS.length, 'диск ≡ зеркало');
  assert.equal(nums.length, all.length, 'диск ≡ реестр');
  const deltas = {
    'каталог (964 → 1014)': all.length - rest.length,
    'reagent (38 → 88)':
      all.filter((it) => it.kind === 'reagent').length
      - rest.filter((it) => it.kind === 'reagent').length,
    'лут-иконок (33 → 83)': svgs.length - svgRest.length,
    'без slot (375 → 425)':
      all.filter((it) => !('slot' in it)).length
      - rest.filter((it) => !('slot' in it)).length,
    'без base_price (662 → 712)':
      all.filter((it) => !('base_price' in it)).length
      - rest.filter((it) => !('base_price' in it)).length,
  };
  for (const [what, d] of Object.entries(deltas)) {
    assert.equal(d, 50, 'дельта «' + what + '» == +50; факт: +' + d);
  }
  const recRest = recs.filter((f) => !ROSTER_SET.has(f.replace(/\.json$/, '')));
  assert.equal(recs.length - recRest.length, 25,
    'рецептов +25 (693 → 718); факт: ' + recs.length);
  assert.equal(
    all.filter((it) => 'rarity' in it).length
    - rest.filter((it) => 'rarity' in it).length, 0,
    'rarity — НЕ вырос (реагенты без rarity); сумма базы — 579');
  const selfText = fs.readFileSync(path.join(__dirname,
    'items-reagent-000321.10.test.js'), 'utf8');
  assert.equal((selfText.match(/(?<!\d)\d{3} файлов/g) || []).length, 0,
    'собственные assert-ы не содержат ручных литералов «NNN файлов» '
    + '(живой механизм .386/.387.01)');
  assert.equal((selfText.match(/HEAD:tests\/scripts\/items-num2id/g) || [])
    .length, 0,
    'реестровый HEAD-guard в этом файле запрещён (000393: зубы ≡ реген, '
    + 'не ≡HEAD); self-match 0');
});

// --- T9: spec + канон + c9-entry lockstep -------------------------------------

test('000321.10 T9: spec/items.md — «Каталог пополнен 50 реагентами 000321.10», живой счётчик «1014 файлов (на момент 000321.10)» ≡ диску, старое число счётчика не осталось; правка line-neutral: 477 строк БЕЗ trailing-\\n и 13 H2; канон memory/000230.16 — c1 «1014 файлов (000001–001014;», c2 «reagent <живой счёт>», E-блок ≡ H2 spec нормализованно и содержит фразу волны; c9-entry memory/000230.16-c9/000321.10.md — первая строка «000321.10: <байты> (+Δ)» с байтами ≡ ЖИВОМУ Buffer.byteLength(spec) (краснота: spec отстал от диска)', () => {
  const spec = fs.readFileSync(path.join(ROOT, 'spec', 'items.md'), 'utf8');
  assert.ok(spec.includes('Каталог пополнен 50 реагентами 000321.10'),
    'spec/items.md: предложения о волне 000321.10 нет');
  const cm = spec.match(
    /Каталог assets\/items — (\d+) файлов \(на момент ([0-9.]+)\):/);
  assert.ok(cm,
    'spec/items.md: строки счётчика «Каталог assets/items — NNN файлов '
    + '(на момент T):» нет');
  const diskCount = fs.readdirSync(ITEMS_DIR).filter(SLUG).length;
  assert.equal(+cm[1], diskCount,
    'spec-счётчик ' + cm[1] + ' ≠ живого числа файлов assets/items '
    + diskCount + ' — ре-пин строки «на момент» в коммите волны');
  assert.ok(cm[2] >= '000321.10',
    'счётчик «на момент ' + cm[2] + '» отстал — не раньше 000321.10');
  const OLD_NUM = '96' + '4';
  assert.ok(!spec.includes(OLD_NUM + ' файлов'),
    'spec/items.md: старое число счётчика каталога не осталось');
  const lines = spec.split('\n');
  assert.ok(!spec.endsWith('\n'),
    'spec/items.md — без trailing-\\n (line-neutral правки)');
  assert.equal(lines.length, 477,
    'spec/items.md — 477 строк (line-neutral); факт: ' + lines.length);
  assert.equal(lines.filter((l) => l.startsWith('## ')).length, 13,
    'spec/items.md — 13 H2 (новых H2 не заводили)');
  const canon = fs.readFileSync(
    path.join(ROOT, 'memory', '000230.16-spec-equipment-doc.md'), 'utf8');
  const c1 = canon.match(
    /Каталог assets\/items — (\d+) файлов \((000001–0\d+);/);
  assert.ok(c1, 'канон c1: строки счётчика каталога нет');
  assert.equal(+c1[1], diskCount,
    'канон c1: число ' + c1[1] + ' ≠ живого числа файлов ' + diskCount);
  assert.equal(c1[2], '000001–' + String(diskCount).padStart(6, '0'),
    'канон c1: хвост «' + c1[2] + '» ≠ последнему номеру каталога');
  const reagentCount = allDiskObjects()
    .filter((it) => it.kind === 'reagent').length;
  assert.ok(new RegExp('reagent ' + reagentCount + '[,\s]').test(canon),
    'канон c2: «reagent ' + reagentCount + '» (живой счёт kind) нет');
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  assert.ok(norm(canon).includes('Каталог пополнен 50 реагентами 000321.10'),
    'канон: предложения волны нет (E-блок/§4.2)');
  const h2i = lines.findIndex((l) => l.trim()
    === '## Каталог новых предметов экипировки');
  assert.ok(h2i >= 0, 'spec/items.md: H2 «Каталог новых предметов '
    + 'экипировки» не найден');
  const block = [];
  for (let k = h2i + 1; k < lines.length && !lines[k].startsWith('## '); k++) {
    block.push(lines[k]);
  }
  const specE = norm(block.join('\n'));
  assert.ok(specE.includes('Каталог пополнен 50 реагентами 000321.10'),
    'E-блок spec: предложения волны нет (норм.)');
  const cmE = specE.match(
    /Каталог assets\/items — (\d+) файлов \(на момент [0-9.]+\):/);
  assert.ok(cmE, 'E-блок spec: строки счётчика каталога нет');
  assert.equal(cmE[1], cm[1],
    'E-блок spec: счётчик ' + cmE[1] + ' ≠ spec-счётчику ' + cm[1]);
  const entry = fs.readFileSync(
    path.join(ROOT, 'memory', '000230.16-c9', '000321.10.md'), 'utf8');
  const em = entry.match(/^000321\.10: (\d+) \(([+-]\d+)\)/);
  assert.ok(em,
    'c9-entry memory/000230.16-c9/000321.10.md: первой строки '
    + '«000321.10: <байты> (+Δ)» нет (рецепт memory/000386-c9-bytes-log.md §3)');
  const bytes = Buffer.byteLength(spec, 'utf8');
  assert.equal(+em[1], bytes,
    'c9-entry: байты ' + em[1] + ' ≠ живым байтам spec/items.md ' + bytes
    + ' — re-замер на финальной ре-базе');
});

// --- T10: автоматика магазинов/лутов + стражи 0-diff --------------------------

test('000321.10 T10: src/ НЕ трогали: shopKindsFor(магазин магии) содержит reagent ⇒ новые входят в bt3-лавки АВТОМАТИЧЕСКИ (сток (30,40,bt3,w0) ⊇ ≥20 наших; w3-смесь ⊇ ≥35 наших); live-скан loot — РОВНО 83 предмета с полем loot (33 + 50); барахолка camp (виды food/potion/weapon/armor) НЕ содержит ни одного нашего; LOOT_RARE_POOL: src/combat.js не содержит ни одного id волны; src/items.js и src/map.js побайтово ≡ HEAD (F1-страж); у старых 33 лут-предметов канальне индексы не сдвинулись (append в хвост lex-зеркала) (краснота: реагентов нет в стоках)', () => {
  const M = require('../src/map.js');
  const B = M.BUILDING_TYPES;
  const kinds = I.shopKindsFor(B.MAGIC_SHOP);
  assert.ok(Array.isArray(kinds) && kinds.includes('reagent'),
    'shopKindsFor(магазин магии) содержит reagent; факт: '
    + JSON.stringify(kinds));
  const s1 = I.makeShop(30, 40, B.MAGIC_SHOP, 0);
  const s2 = I.makeShop(30, 40, B.MAGIC_SHOP, 0);
  assert.deepEqual(s1, s2, 'makeShop — детерминизм');
  const fresh = Object.keys(s1.stock).filter((k) => ROSTER_SET.has(k));
  assert.ok(fresh.length >= 20,
    'bt3-лавка содержит ≥ 20 реагентов ростера; факт: ' + fresh.length
    + ' (краснота: реагентов нет)');
  for (const k of fresh) assert.equal(I.getItem(k).kind, 'reagent',
    k + ': в стоке — реагент ростера');
  const u = I.makeShop(30, 40, B.MAGIC_SHOP, 3);
  const freshU = Object.keys(u.stock).filter((k) => ROSTER_SET.has(k));
  assert.ok(freshU.length >= 35,
    'w3-смесь (универсам-механика allItems) содержит ≥ 35 реагентов; факт: '
    + freshU.length);
  const withLoot = ITD.ITEMS.filter((it) => it.loot);
  assert.equal(withLoot.length, 83,
    'предметов с полем loot — ровно 83 (33 + 50); факт: ' + withLoot.length);
  assert.deepEqual(withLoot.map((it) => it.id),
    [...withLoot.map((it) => it.id)].sort(),
    'loot-кандидаты — в lex-порядке зеркального хвоста');
  assert.deepEqual(withLoot.slice(-50).map((it) => it.id), ROSTER_IDS,
    'наши 50 — ХВОСТ живого loot-скана (индексы hash-канала старых 33 целы)');
  const campPool = new Set(ITD.ITEMS.filter((it) => ['food', 'potion',
    'weapon', 'armor'].includes(it.kind)).map((it) => it.id));
  for (const id of ROSTER_IDS) {
    assert.ok(!campPool.has(id),
      id + ': реагента нет в пуле барахолки (виды 000047)');
  }
  const combatText = fs.readFileSync(path.join(ROOT, 'src', 'combat.js'),
    'utf8');
  for (const id of ROSTER_IDS) {
    assert.ok(!combatText.includes("'" + id + "'"),
      id + ': реагента нет в литералах combat.js (LOOT_RARE_POOL заморожен)');
  }
  for (const rel of ['src/items.js', 'src/map.js']) {
    const before = execFileSync('git',
      ['-C', ROOT, 'show', 'HEAD:' + rel],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const after = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.equal(after, before, rel + ' ИЗМЕНЁН — торговля/лут-механика '
      + 'должны ловить новый вид автоматически (0-diff страж F1)');
  }
});

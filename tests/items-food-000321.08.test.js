'use strict';
// 000321.08 — волна 50 ЕДЫ (виртуальные номера 000865–000914, файлы <id>.json)
// + 50 иконок. БЕЗ рецептов (факт диска: рецептов с результатом food нет —
// страж T6) и БЕЗ кода: еда входит в магазины автоматически по виду
// (shopKindsFor — факт кода, страж T11). Ростер фиксируется здесь и в
// memory/000321-food-items.md. Строка ростера:
// [номер, id, имя, effect.amount, weight, value, base_price,
//  хвост desc («<Имя>: …»)]
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const I = require('../src/items.js');
const ITD = require('../src/items-data.js');
const L = require('../src/loot-equip-data.js');
const { validateData } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const ITEMS_DIR = path.join(ROOT, 'assets', 'items');

// 000318.08: assets/items — файлы <id>.json. Замороженный реестр
// «номер → id» (tests/scripts/items-num2id-000318.08.json) даёт
// файлам прежние ВИРТУАЛЬНЫЕ имена «000NNN.json» для позиционных
// пинов (тот же порядок), чтение с диска — DISKF_I08().
const NUM2ID_I08 = require(path.join(__dirname, 'scripts',
  'items-num2id-000318.08.json'));
const ID2NUM_I08 = {};
for (const n08 of Object.keys(NUM2ID_I08)) {
  ID2NUM_I08[NUM2ID_I08[n08]] = n08;
}
function SLUGI08(f) {
  return f !== 'schema.json' && /^[a-z][a-z0-9_]*\.json$/.test(f);
}
function VIRTNUMI08(f) {
  const b = f.replace(/\.json$/, '');
  return ID2NUM_I08[b] !== undefined ? ID2NUM_I08[b] + '.json' : f;
}
function DISKF_I08(x) {
  const b = String(x).replace(/\.json$/, '');
  return (NUM2ID_I08[b] !== undefined ? NUM2ID_I08[b] : b) + '.json';
}
function FILES_I08() {
  return fs.readdirSync(ITEMS_DIR).filter(SLUGI08)
    .map(VIRTNUMI08).sort();
}
const CRAFT_DIR = path.join(ROOT, 'assets', 'craft');
const SPR_DIR = path.join(ROOT, 'assets', 'sprites', 'items');
const JRC = require('../scripts/lib/json-ref.js');
const CRAFT_FILE_RE = JRC.SHAPE_BASENAME_RES[JRC.ASSET_NAME_SHAPES.craft];
function recFiles() {
  return fs.readdirSync(CRAFT_DIR)
    .filter((f) => f !== 'schema.json' && CRAFT_FILE_RE.test(f)).sort();
}

const ROSTER_00032108 = [[865,"zveroboy_chay","Зверобойный чай",5,0.2,3,3,"горчит, зато уносит хворь до порога."],
  [866,"zavarka_medovaya","Медовая заварка",7,0.2,4,5,"сладка на язык, тепла на сердце."],
  [867,"zhur_lesnoy","Лесной жур",9,0.3,5,5,"жидкий, а силы прибавляет."],
  [868,"yogurt_domashniy","Домашний йогурт",10,0.3,6,7,"сквашен с утра, съеден до полудня."],
  [869,"yuzhny_mors","Южный морс",11,0.3,7,7,"в нём лето, отжатое в стекляшку."],
  [870,"zakuska_garlic","Чесночная закуска",12,0.2,8,9,"зубок к зубку — и хворь без укуса."],
  [871,"zakuska_beet","Свёкольная закуска",13,0.3,9,9,"бордовая, сладкая, крови полезна."],
  [872,"zakuska_cabbage","Капустная закуска",14,0.3,10,11,"хрустит на всю улицу."],
  [873,"zakuska_egg","Яичная закуска",15,0.2,11,11,"всмятку, с солью и зелёным луком."],
  [874,"zasol_ogurcov","Огурцы засоленные",16,0.4,12,13,"хруст на два зуба, сок на всю тарелку."],
  [875,"zakuska_mushroom","Грибная закуска",17,0.4,13,13,"из тех, что растут за околицей."],
  [876,"zakuska_fish","Рыбная закуска",18,0.4,14,15,"речная, с укропом и перцем."],
  [877,"zeleny_sup","Зелёный суп",19,0.5,15,15,"щавель да яйцо — и весна в тарелке."],
  [878,"zimniy_kompot","Зимний компот",20,0.4,16,17,"варен из сада, подан в январе."],
  [879,"zernistaya_kasha","Зернистая каша",21,0.5,17,17,"зерно к зерну — солдату и пахарю."],
  [880,"zernisty_hleb","Зернистый хлеб",22,0.5,18,19,"на зубах хруст, в руках вес."],
  [881,"zakvaska_hleb","Заквасочный хлеб",23,0.6,19,19,"печён на закваске дня вчерашнего."],
  [882,"zhyto_kasha","Житняя каша",24,0.6,20,21,"варится долго, естся быстро."],
  [883,"zefir_vanilny","Ванильный зефир",25,0.2,21,21,"белый, лёгкий, тает на бегу."],
  [884,"zefir_yagodny","Ягодный зефир",26,0.2,22,23,"розовый, с ягодной пылью на зубах."],
  [885,"zucchini_patty","Кабачковый оладушек",27,0.3,23,23,"обжарен на сильном огне, отдан на тихом."],
  [886,"zucchini_salad","Кабачковый салат",28,0.4,24,25,"свежий, с маслом и щепоткой соли."],
  [887,"zhele_yagodnoe","Ягодное желе",29,0.3,25,25,"дрожит, как струна, и тает на языке."],
  [888,"zhele_limonnoe","Лимонное желе",30,0.3,26,27,"кисло, зато глаза проясняет."],
  [889,"zefir_shokoladny","Шоколадный зефир",31,0.3,27,27,"тает в руке — береги рукава."],
  [890,"zucchini_boat","Кабачковая лодочка",32,0.5,28,29,"начинка внутри, корочка снаружи."],
  [891,"zucchini_soup","Кабачковый крем-суп",34,0.5,29,29,"густой, бархатный, с сухариком."],
  [892,"ziti_tomato","Зити с томатами",36,0.6,30,31,"томаты с грядки, чеснок с печки."],
  [893,"ziti_cheese","Зити сырные",38,0.6,31,31,"сыр тянется ниткой до самой ложки."],
  [894,"zatirka_lapshovaya","Затирка лапшовая",40,0.5,32,33,"лапша ручная, бульон сердечный."],
  [895,"ziti_zapechennye","Зити запечённые",42,0.7,33,33,"корочка сверху, расплав внутри."],
  [896,"zeppole_medovye","Цепполе медовые",44,0.4,34,35,"во фритюре жарены, в меду купаны."],
  [897,"yushka_rybnaya","Юшка рыбная",46,0.6,35,35,"навар такой, что ложка стоит."],
  [898,"zapekanka_kartofelnaya","Картофельная запеканка",48,0.8,36,37,"печёная корка, мягкое сердце."],
  [899,"zapekanka_tvorozhnaya","Творожная запеканка",50,0.7,37,37,"тает во рту, как летнее облако."],
  [900,"zapekanka_yablochnaya","Яблочная запеканка",53,0.7,38,39,"корица, яблоки, дух на весь дом."],
  [901,"zubrovka_med","Мёд-зубровка",56,0.4,39,39,"трава в меду, солнце в ложке."],
  [902,"zapechennye_yabloki","Печёные яблоки",59,0.5,40,41,"мёдом мазаны, корицей посыпаны."],
  [903,"zharkoe_kartofelnoe","Жаркое картофельное",62,0.9,41,41,"в горшочке томлено, к вечеру подано."],
  [904,"zhulien_gribnoy","Жюльен грибной",65,0.6,42,43,"сливки, лес, чуть-чуть муската."],
  [905,"zhulien_syrny","Жюльен сырный",68,0.6,43,43,"сыр тянется, ложка тонет."],
  [906,"zharkoe_myasnoe","Мясное жаркое",71,1,44,45,"с пылу, с жару, гостям в радость."],
  [907,"zaychatina_tushonaya","Тушёная зайчатина",75,1,45,45,"тушилась весь день, съедена за вечер."],
  [908,"zharovnya_kuritsa","Жаровня куриная",79,1.1,46,47,"золотая корочка, пар из-под крышки."],
  [909,"zharkoe_lesnoe","Жаркое лесное",83,0.9,47,47,"дичь, можжевельник, терпеливый огонь."],
  [910,"zapechennaya_kuritsa","Запечённая курочка",87,1.2,50,51,"румяна, горяча, к столу зовёт."],
  [911,"zefir_trekhsvetny","Трёхцветный зефир",91,0.3,53,53,"три цвета, три вкуса, одна радость."],
  [912,"zapechenny_gus","Запечённый гусь",95,1.2,57,57,"на яблоках печён, на весь пир."],
  [913,"zolotoe_zharkoe","Золотое жаркое",98,1,61,61,"корочка золотом, начинка сказкой."],
  [914,"zvany_obed","Званый обед",100,1.1,65,65,"на двенадцать персон и одного гостя без зова."]];

const ROSTER_IDS = ROSTER_00032108.map((r) => r[1]);
const OLD_FOOD = {
  bread: ['eat', 4, 0.2, 2, 2],
  honey_cake: ['eat', 6, 0.3, 8, 9],
  meat: ['eat', 8, 0.4, 5, 5],
};
const CANON_ORDER = ['id', 'name', 'kind', 'subtype', 'weight', 'value',
  'base_price', 'tier', 'desc', 'stats', 'effect', 'loot', 'icon',
  'slot', 'rarity', 'set', 'affixes', 'set_bonus'];
const LEX_PREDECESSOR = 'yew_longbow'; // lex-хвост каталога ДО волны

function loadItemFile(num) {
  const f = String(num).padStart(6, '0') + '.json';
  const p = path.join(ITEMS_DIR, DISKF_I08(f));
  assert.ok(fs.existsSync(p),
    'assets/items/' + f + ' существует (краснота: каталог 864 — '
    + 'еда волны не создана)');
  return fs.readFileSync(p, 'utf8');
}

// --- T1: форма 50 предметов -------------------------------------------

test('000321.08 T1: каталог — ровно 964 файла <id>.json (позиции — виртуальные номера по реестру 000318.08) (ре-пин: +50 еды 000865–000914); новые 50 — kind food, effect {kind: eat, amount} по ростеру, БЕЗ rarity/slot/set/subtype/tier/stats/loot/affixes/set_bonus, base_price ПОСЛЕ value, порядок ключей = канон sync-items-data.js, roundtrip-канон stringify(…,2)+\\n, валидны по assets/items/schema.json (краснота: каталог 864 — волна не добавлена)', () => {
  const files = FILES_I08();
  assert.equal(files.length, 964,
    'каталог — 964 файла (864 + 50 еды 000321.08); факт: '
    + files.length + ' (краснота: волна не добавлена)');
  const schema = JSON.parse(
    fs.readFileSync(path.join(ITEMS_DIR, 'schema.json'), 'utf8'));
  for (const [num, id, , amount] of ROSTER_00032108) {
    const f = String(num).padStart(6, '0') + '.json';
    assert.equal(files[num - 1], f,
      'каталожный порядок: позиция ' + num + ' — ' + f);
    const raw = loadItemFile(num);
    const j = JSON.parse(raw);
    assert.deepEqual(validateData(schema, j, f), [], f + ': схема');
    assert.equal(j.kind, 'food', f + ': kind food');
    assert.deepEqual(j.effect, { kind: 'eat', amount },
      f + ': effect {kind: eat, amount} == ростер');
    for (const absent of ['rarity', 'slot', 'set', 'subtype', 'tier',
      'loot', 'affixes', 'set_bonus', 'stats']) {
      assert.equal(j[absent], undefined, f + ': ' + absent + ' нет');
    }
    assert.equal(j.icon, 'assets/sprites/items/' + id + '.svg',
      f + ': icon = assets/sprites/items/<id>.svg');
    const keys = Object.keys(j);
    assert.equal(keys.indexOf('base_price'),
      keys.indexOf('value') + 1, f + ': base_price сразу после value');
    const idx = keys.filter((k) => k !== 'id')
      .map((k) => CANON_ORDER.indexOf(k));
    assert.deepEqual(idx, [...idx].sort((a, b) => a - b),
      f + ': порядок ключей — канон KEYS sync-items-data.js; факт: '
      + keys.join(','));
    assert.equal(JSON.stringify(j, null, 2) + '\n', raw,
      f + ': roundtrip-канон');
  }
});

// --- T2: ростер + глобальная уникальность + additions-only хвост --------

test('000321.08 T2: ростер 50 строк ≡ JSON (id/имя/effect.amount/weight/value/base_price/desc «<Имя>: …»); sweep по 964: id, ИМЕНА и ОПИСАНИЯ уникальны по всему каталогу; все 50 новых id ЛЕКСИКОГРАФИЧЕСКИ > «yew_longbow» (additions-only: хвост зеркального lex-порядка ⇒ rng-потоки существующих стоков не сдвигаются) (краснота: каталог 864)', () => {
  const files = FILES_I08();
  assert.equal(files.length, 964, 'каталог — 964; факт: ' + files.length);
  const ids = new Map();
  const names = new Map();
  const descs = new Map();
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(
      path.join(ITEMS_DIR, DISKF_I08(f)), 'utf8'));
    assert.ok(!ids.has(j.id), 'дубликат id: ' + j.id + ' (' + f + ')');
    ids.set(j.id, f);
    assert.ok(!names.has(j.name),
      'дубликат имени: ' + j.name + ' (' + f + ')');
    names.set(j.name, f);
    assert.ok(!descs.has(j.desc),
      'дубликат desc: ' + j.desc + ' (' + f + ')');
    descs.set(j.desc, f);
  }
  assert.equal(ids.size, 964);
  for (const [num, id, name, amount, weight, value, bp,
    tail] of ROSTER_00032108) {
    const j = JSON.parse(loadItemFile(num));
    assert.equal(j.id, id, num + ': id == ростер');
    assert.equal(j.name, name, id + ': имя == ростер');
    assert.equal(j.effect.kind, 'eat', id + ': effect.kind eat');
    assert.equal(j.effect.amount, amount, id + ': effect.amount == ростер');
    assert.equal(j.weight, weight, id + ': weight == ростер');
    assert.equal(j.value, value, id + ': value == ростер');
    assert.equal(j.base_price, bp, id + ': base_price == ростер');
    assert.equal(j.desc, name + ': ' + tail, id + ': desc = «<Имя>: …»');
    assert.ok(id > LEX_PREDECESSOR,
      id + ': lex-позиция после хвоста каталога ДО волны');
  }
});

// --- T3: масштаб эффекта и цен ------------------------------------------

test('000321.08 T3: масштаб — eat-лестница ростера строго возрастает 5…100 И объединённая лестница со старыми 4/6/8 без повторов (продолжение масштаба — решение в memory); amount < 500; У ВСЕХ food effect.kind === eat (src/items.js:412 — валидатор food); base_price − value ∈ [0,1] (паттерн старых 2/2, 8/9, 5/5); weight ∈ [0.2,1.2]; value строго растёт 3…65 (краснота: еды волны нет)', () => {
  const amounts = ROSTER_00032108.map((r) => r[3]);
  assert.equal(amounts.length, 50);
  assert.deepEqual([...amounts].sort((a, b) => a - b), amounts,
    'eat-лестница строго возрастает по каталожному порядку');
  assert.equal(new Set(amounts).size, 50, 'amount уникальны');
  assert.equal(amounts[0], 5, 'лестница начинается со слабого 5');
  assert.equal(amounts[49], 100, 'потолок волны — 100');
  assert.deepEqual(amounts.filter((a) => [4, 6, 8].includes(a)), [],
    'лестница не повторяет старые 4/6/8');
  const union = [...amounts, 4, 6, 8].sort((a, b) => a - b);
  assert.equal(new Set(union).size, 53,
    'объединённая лестница 3 старых + 50 новых — без повторов');
  for (const [, id, , amount, weight, value, bp] of ROSTER_00032108) {
    assert.ok(amount >= 1 && amount < 500,
      id + ': amount в схемном потолке (<500)');
    assert.ok(bp - value === 0 || bp - value === 1,
      id + ': base_price − value ∈ [0,1]; факт: ' + (bp - value));
    assert.ok(weight >= 0.2 && weight <= 1.2,
      id + ': weight ∈ [0.2,1.2]; факт: ' + weight);
    assert.ok(value >= 3 && value <= 65,
      id + ': value в полосе [3,65]; факт: ' + value);
  }
  let pv = 0;
  for (const [, id, , , , value] of ROSTER_00032108) {
    assert.ok(value > pv, id + ': value строго растёт');
    pv = value;
  }
  const kinds = new Set(I.allItems()
    .filter((it) => it.kind === 'food')
    .map((it) => it.effect.kind));
  assert.deepEqual([...kinds], ['eat'],
    'kind food — только eat (валидатор src/items.js:412); факт: '
    + [...kinds].join(','));
});

// --- T4: вид food + старые 3 verbatim -------------------------------------

test('000321.08 T4: вид food — РОВНО 53 (3 старых + 50 новых); старые 3 verbatim (bread eat4 0.2/2/2, honey_cake eat6 0.3/8/9, meat eat8 0.4/5/5); sweep: У ВСЕХ 53 food нет rarity/slot; все 53 имеют effect.amount ≥ 1 и base_price (краснота: food 3)', () => {
  const foods = I.allItems().filter((it) => it.kind === 'food');
  assert.equal(foods.length, 53,
    'kind food — 53 (3 + 50); факт: ' + foods.length
    + ' (краснота: волна не добавлена)');
  for (const [id, [kind, amount, weight, value, bp]]
    of Object.entries(OLD_FOOD)) {
    const it = JSON.parse(
      fs.readFileSync(path.join(ITEMS_DIR, id + '.json'), 'utf8'));
    assert.ok(it, 'старая еда «' + id + '» на месте (диск)');
    assert.equal(it.kind, 'food', id + ': kind food');
    assert.equal(it.effect.kind, kind, id + ': effect.kind verbatim');
    assert.equal(it.effect.amount, amount, id + ': effect.amount verbatim');
    assert.equal(it.weight, weight, id + ': weight verbatim');
    assert.equal(it.value, value, id + ': value verbatim');
    assert.equal(it.base_price, bp, id + ': base_price verbatim');
  }
  for (const it of foods) {
    assert.equal(it.rarity, undefined,
      it.id + ': у food НЕ БЫВАЕТ rarity (sweep-пин ТЗ)');
    assert.equal(it.slot, undefined, it.id + ': у food НЕ БЫВАЕТ slot');
    assert.ok(typeof it.effect.amount === 'number'
      && it.effect.amount >= 1, it.id + ': amount ≥ 1');
    assert.ok(Number.isInteger(it.base_price) && it.base_price >= 1,
      it.id + ': base_price — целое ≥ 1 (еда торгует)');
  }
});

// --- T5: иконки ----------------------------------------------------------

test('000321.08 T5: иконки — у 50 новых поле icon ↔ файл существует; биекция json↔svg по basename; flat-SVG 64×64: viewBox ровно «0 0 64 64», ПЕРВЫЙ элемент — тень-эллипс rgba(0,0,0,0.22), без linearGradient/radialGradient/<text/<path/<use/stroke= (паттерн 000302); sha256-уникальность против всех 931 иконок (краснота: файлы не созданы)', () => {
  const hash = (p) => createHash('sha256')
    .update(fs.readFileSync(p)).digest('hex');
  const hashes = new Map();
  for (const f of fs.readdirSync(SPR_DIR)) {
    if (!f.endsWith('.svg')) continue;
    const h = hash(path.join(SPR_DIR, f));
    assert.ok(!hashes.has(h), 'дубликат байт иконки: ' + f + ' ≡ '
      + hashes.get(h));
    hashes.set(h, f);
  }
  assert.equal(hashes.size, 931,
    'иконок sprites/items — ровно 931 (831 + 50); факт: '
    + hashes.size + ' (краснота: иконок нет)');
  for (const [, id] of ROSTER_00032108) {
    const f = id + '.svg';
    const p = path.join(SPR_DIR, f);
    assert.ok(fs.existsSync(p), f + ': файл иконки');
    const text = fs.readFileSync(p, 'utf8');
    assert.ok(!/linearGradient|radialGradient/.test(text),
      f + ': градиенты запрещены');
    for (const bad of ['<text', '<path', '<use']) {
      assert.ok(!text.includes(bad), f + ': «' + bad + '» запрещён');
    }
    assert.ok(!/stroke=/.test(text), f + ': stroke= запрещён');
    const vb = text.match(/viewBox="([^"]*)"/g) || [];
    assert.equal(vb.length, 1, f + ': viewBox ровно 1');
    assert.ok(text.includes('viewBox="0 0 64 64"'),
      f + ': flat 64×64; факт: ' + vb.join(';'));
    const lines = text.split('\n').filter((l) => l.trim().startsWith('<')
      && !l.trim().startsWith('<svg') && !l.trim().startsWith('</'));
    const firstShape = (lines[0] || '').trim();
    assert.ok(/^<ellipse[^>]*fill="rgba\(0,0,0,0\.22\)"/.test(firstShape),
      f + ': ПЕРВЫЙ элемент — тень-эллипс rgba(0,0,0,0.22); факт: '
      + firstShape.slice(0, 40));
    const row = ROSTER_00032108.find((r) => r[1] === id);
    const j = JSON.parse(loadItemFile(row[0]));
    assert.equal(j.icon, 'assets/sprites/items/' + f,
      f + ': биекция icon ↔ файл');
  }
});

// --- T6: страж «рецептов с результатом food нет» (зелёный и до волны) ----

test('000321.08 T6: страж факта диска — каталог craft РОВНО 693; НИ У ОДНОГО рецепта результат не kind food (sweep по 693 через реестр 000318.08); ни один id волны не является результатом рецепта (еда — лут/торговля, ТЗ-п.2)', () => {
  const files = recFiles();
  assert.equal(files.length, 693,
    'craft — 693 файла (не вырос: рецептов еды нет); факт: '
    + files.length);
  const roster = new Set(ROSTER_IDS);
  for (const f of files) {
    const j = JSON.parse(
      fs.readFileSync(path.join(CRAFT_DIR, f), 'utf8'));
    const ref = j['результат']['предмет'];
    const num = /([a-z0-9_]+)\.json$/.exec(ref);
    assert.ok(num, f + ': ссылка результата — <id>.json');
    const id = NUM2ID_I08[num[1]] !== undefined ? num[1] : num[1];
    const it = I.getItem(id);
    assert.ok(it, f + ': результат ∈ каталог');
    assert.notEqual(it.kind, 'food',
      f + ': результат — НЕ еда (факт диска: рецептов еды нет)');
    assert.ok(!roster.has(it.id),
      f + ': результат — НЕ предмет волны 000321.08');
  }
});

// --- T7: зеркало + реестр --------------------------------------------------

test('000321.08 T7: зеркало src/items-data.js — 964 записей, новые 50 ≡ JSON поэлементно и getItem резолвится; реестр tests/scripts/items-num2id-000318.08.json — ключи «000001»…«000914» подряд, биекция с диском, 000865…000914 ≡ ростер (краснота: зеркало 864 / реестр 864)', () => {
  assert.equal(ITD.ITEMS.length, 964,
    'items-data — 964; факт: ' + ITD.ITEMS.length);
  const mirrorById = new Map(ITD.ITEMS.map((it) => [it.id, it]));
  for (const [num, id] of ROSTER_00032108) {
    const j = JSON.parse(loadItemFile(num));
    const m = mirrorById.get(id);
    assert.ok(m, 'items-data: предмет «' + id + '»');
    assert.deepEqual(m, j, id + ': зеркало ≡ JSON поэлементно');
    assert.equal(I.getItem(id).name, j.name,
      id + ': getItem резолвится');
  }
  const keys = Object.keys(NUM2ID_I08);
  assert.equal(keys.length, 964, 'реестр — 964 ключей; факт: '
    + keys.length);
  assert.deepEqual(keys,
    keys.map((_, i) => String(i + 1).padStart(6, '0')),
    'реестр — ключи подряд 000001…000914');
  const diskIds = new Set(FILES_I08()
    .map((f) => JSON.parse(fs.readFileSync(
      path.join(ITEMS_DIR, DISKF_I08(f)), 'utf8')).id));
  assert.equal(new Set(Object.values(NUM2ID_I08)).size, 964,
    'реестр — значения уникальны');
  assert.deepEqual([...Object.values(NUM2ID_I08)].sort(),
    [...diskIds].sort(), 'реестр ≡ диску (биекция)');
  for (const [num, id] of ROSTER_00032108) {
    assert.equal(NUM2ID_I08[String(num).padStart(6, '0')], id,
      'реестр ' + num + ' == ростер');
  }
});

// --- T8: счётчики/канарейки ----------------------------------------------

test('000321.08 T8: регресс-канарейки — каталог 964 ≡ items-data; food 53; potion 55 / weapon 72 / armor 257 / tool 60 / artifact 63 / shield 62 / ring 75 / spell_scroll 161 (не выросли); rarity — 579 (еда без rarity); slot — у 589 (не выросло), «прочих» без slot — 375 (275 + 50 еды); держателей base_price — 302 (252 + 50), без base_price — 662 (не двигается); craft 693: зачарование 244 / кузнечное 173 / столярное 114 / резьба 86 / алхимия 74 / рунопись 2; иконки 931; stroke= — ровно 46 legacy (краснота: каталог 864)', () => {
  const all = I.allItems();
  assert.equal(all.length, 964);
  assert.equal(ITD.ITEMS.length, 964, 'items-data ≡ каталог (964)');
  const byKind = {};
  for (const it of all) byKind[it.kind] = (byKind[it.kind] || 0) + 1;
  assert.equal(byKind.food, 53, 'food — 53 (3 + 50); факт: '
    + byKind.food);
  assert.equal(byKind.potion, 55, 'potion — 55 (не вырос)');
  assert.equal(byKind.weapon, 72, 'weapon — 72 (не вырос)');
  assert.equal(byKind.armor, 257, 'armor — 257 (не вырос)');
  assert.equal(byKind.tool, 60, 'tool — 60 (не вырос)');
  assert.equal(byKind.artifact, 63, 'artifact — 63 (не вырос)');
  assert.equal(byKind.shield, 62, 'shield — 62 (не вырос)');
  assert.equal(byKind.ring, 75, 'ring — 75 (не вырос)');
  assert.equal(byKind.spell_scroll, 161, 'spell_scroll — 161 (не вырос)');
  assert.equal(all.filter((it) => it.rarity).length, 579,
    'rarity-множество — 579 (еда без rarity); факт: '
    + all.filter((it) => it.rarity).length);
  assert.equal(all.filter((it) => 'slot' in it).length, 589,
    'slot — у 589 (не выросло); факт: '
    + all.filter((it) => 'slot' in it).length);
  assert.equal(all.filter((it) => !('slot' in it)).length, 375,
    '«прочих» без slot — 375 (275 + 50 еды); факт: '
    + all.filter((it) => !('slot' in it)).length);
  assert.equal(all.filter((it) => 'base_price' in it).length, 302,
    'base_price-держателей — 302 (252 + 50 еды); факт: '
    + all.filter((it) => 'base_price' in it).length);
  assert.equal(all.filter((it) => !('base_price' in it)).length, 662,
    'без base_price — 662 (НЕ двигается); факт: '
    + all.filter((it) => !('base_price' in it)).length);
  const craft = recFiles();
  assert.equal(craft.length, 693, 'craft — 693; факт: ' + craft.length);
  const typeCounts = {};
  for (const f of craft) {
    const j = JSON.parse(
      fs.readFileSync(path.join(CRAFT_DIR, f), 'utf8'));
    typeCounts[j['тип']] = (typeCounts[j['тип']] || 0) + 1;
  }
  assert.deepEqual(typeCounts, {
    'зачарование': 244, 'кузнечное_дело': 173, 'столярное_дело': 114,
    'резьба_по_камню': 86, 'алхимия': 74, 'рунопись': 2,
  }, 'типы рецептов; факт: ' + JSON.stringify(typeCounts));
  const icons = fs.readdirSync(SPR_DIR).filter((f) => f.endsWith('.svg'));
  assert.equal(icons.length, 931, 'иконок — 931; факт: ' + icons.length);
  let strokes = 0;
  for (const f of icons) {
    if (fs.readFileSync(path.join(SPR_DIR, f), 'utf8')
      .includes('stroke=')) strokes++;
  }
  assert.equal(strokes, 46,
    'stroke= — ровно 46 legacy; факт: ' + strokes);
});

// --- T9: spec/items.md ------------------------------------------------------

test('000321.08 T9: spec/items.md — живой счётчик «Каталог assets/items — NNN файлов … на момент …» (ре-пин 000386: литерал 964 выведен на сверку с живым каталогом — будущая волна не правит эту строку) (единственный number-факт, паттерн 000312), тип-таблица содержит описательную строку «Еда», правки line-neutral: файл — 477 строк без trailing-\\n (SPEC_FILE_LINES["items.md"] = 477 не двигается) (краснота: «на момент 000321.07»)', () => {
  const text = fs.readFileSync(path.join(ROOT, 'spec', 'items.md'),
    'utf8');
  const cm = text.match(
    /Каталог assets\/items — (\d+) файлов \(на момент ([0-9.]+)\):/);
  assert.ok(cm,
    'spec/items.md: строки счётчика каталога нет (000386: сверка на '
    + 'живом механизме, литерал выведен из теста)');
  const diskCount = fs.readdirSync(ITEMS_DIR).filter(SLUGI08).length;
  assert.equal(+cm[1], diskCount,
    'spec-счётчик каталога ' + cm[1] + ' ≠ живого числа файлов '
    + 'assets/items ' + diskCount + ' — ре-пин строки «на момент» в '
    + 'коммите волны (рецепт memory/000386-c9-bytes-log.md §3)');
  assert.ok(cm[2] >= '000321.09',
    'счётчик «на момент ' + cm[2] + '» отстал — еда 000321.08 уже '
    + 'учтена, не раньше 000321.09');
  assert.ok(/\|\s*Еда\s*\|/.test(text),
    'spec/items.md: тип-таблица содержит строку «Еда»');
  assert.ok(!/(?<!\d)864 файлов/.test(text),
    'spec/items.md: старое число 864 не осталось');
  assert.ok(!text.endsWith('\n'),
    'spec/items.md — без trailing-\\n (line-neutral правки)');
  assert.equal(text.split('\n').length, 477,
    'spec/items.md — 477 строк (SPEC_FILE_LINES 477 не двигается)');
});

// --- T10: 0-diff стражи ------------------------------------------------------

test('000321.08 T10: 0-diff стражи — src/loot-equip-data.js побайтово прежний (еда НЕ equip, пулы/таблицы не тронуты); EQUIP_POOLS размеры 232/161/117/46/23 инвариантны; DROP-таблица 50/30/15/4.9/0.1 ≡ 1; DISASSEMBLY_BY_ITEM — 648 канонических рецептов (рецептов еды нет — множество НЕ выросло) и ни одного id волны; у всех 50 новых предметов НЕТ поля loot', () => {
  const before = execFileSync('git',
    ['-C', ROOT, 'show', 'HEAD:src/loot-equip-data.js'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const after = fs.readFileSync(path.join(ROOT, 'src',
    'loot-equip-data.js'), 'utf8');
  assert.equal(after, before,
    'src/loot-equip-data.js ИЗМЕНЁН — еда не должна влиять на '
    + 'equip-пулы и DROP-контракт 000230');
  const P = L.EQUIP_POOLS;
  assert.deepEqual(L.RARITY.map((t) => P[t.id].length), [232, 161, 117,
    46, 23], 'EQUIP_POOLS — 232/161/117/46/23 (не выросли); факт: '
    + L.RARITY.map((t) => P[t.id].length).join('/'));
  assert.equal(L.RARITY.reduce((s, t) => s + t.chance, 0), 1,
    'DROP-таблица — Σ 1 (НЕ тронута)');
  const C = require(path.join(ROOT, 'src', 'craft.js'));
  const map = C.DISASSEMBLY_BY_ITEM;
  assert.equal(Object.keys(map).length, 648,
    'DISASSEMBLY_BY_ITEM — 648 (еда рецептов не добавила); факт: '
    + Object.keys(map).length);
  for (const id of ROSTER_IDS) {
    assert.ok(!(id in map), id + ': еды нет в DISASSEMBLY_BY_ITEM');
    const it = I.getItem(id);
    assert.ok(it, id + ': предмет волны ∈ getItem '
      + '(краснота: волна не добавлена)');
    assert.equal(it.loot, undefined, id + ': loot нет (еда не лут-флаг)');
  }
});

// --- T11: факт автоматизации торговли (живой код) ----------------------------

test('000321.08 T11: еда входит в магазины АВТОМАТИЧЕСКИ по виду (факт кода, кода НЕ трогали): shopKindsFor(аптека) и shopKindsFor(таверна) содержат «food»; makeShop детерминирован (двойной вызов бит-в-бит); стоки (10,20,аптека,1) и (5,7,таверна,0) содержат ≥10 и ≥3 новых блюд ростера (rng-хвост lex-порядка) (краснота: новых блюд в стоках нет)', () => {
  const M = require('../src/map.js');
  const B = M.BUILDING_TYPES;
  assert.ok(I.shopKindsFor(B.APOTHECARY).includes('food'),
    'shopKindsFor(аптека) содержит food');
  assert.ok(I.shopKindsFor(B.TAVERN).includes('food'),
    'shopKindsFor(таверна) содержит food');
  const roster = new Set(ROSTER_IDS);
  const cases = [
    [[10, 20, B.APOTHECARY, 1], 10],
    [[5, 7, B.TAVERN, 0], 3],
  ];
  for (const [args, minNew] of cases) {
    const s1 = I.makeShop(...args);
    const s2 = I.makeShop(...args);
    assert.deepEqual(s1, s2,
      'makeShop(' + args.join(',') + ') — детерминизм');
    const fresh = Object.keys(s1.stock).filter((k) => roster.has(k));
    assert.ok(fresh.length >= minNew,
      'makeShop(' + args.join(',') + '): новых блюд ≥ ' + minNew
      + '; факт: ' + fresh.length);
    for (const k of fresh) {
      const it = I.getItem(k);
      assert.equal(it.kind, 'food', k + ': в стоке — еда ростера');
    }
  }
});


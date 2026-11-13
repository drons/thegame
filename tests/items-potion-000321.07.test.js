'use strict';
// 000321.07 — волна 50 зелий (000815–000864) + 50 рецептов (slug по id)
// + 50 иконок. Ростер фиксируется здесь и в memory/000321-potion-items.md.
// Строка ростера:
// [номер, id, имя, effect.kind, effect.amount, weight, value, base_price,
//  хвост desc («<Имя>: …»), название рецепта, уровень, исходники
//  [[реагент-id, количество]], здания ('l' alchemy_lab / 'a'
//  apothecary+alchemy_lab / 'm' alchemy_lab+mage_tower), nature-навык
//  (алхимия+природа), описание рецепта]
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const I = require('../src/items.js');
const ITD = require('../src/items-data.js');
const CRD = require('../src/craft-data.js');
const L = require('../src/loot-equip-data.js');
const { validateData } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const ITEMS_DIR = path.join(ROOT, 'assets', 'items');
const CRAFT_DIR = path.join(ROOT, 'assets', 'craft');
const SPR_DIR = path.join(ROOT, 'assets', 'sprites', 'items');
const SKILLS_DIR = path.join(ROOT, 'assets', 'skills');
const BUILDINGS_DIR = path.join(ROOT, 'assets', 'buildings');

const NEW_FROM = 815;
const NEW_TO = 864;

const ROSTER_00032107 = [[815,"weak_healing","Слабое зелье лечения","heal",3,0.3,3,3,"едва греет, но кровь останавливает.","Варка слабого зелья лечения",2,[["herb_healing",1]],"l",false,"Слабую заварку держат на малом огне."],
  [816,"herb_draught","Травяной отвар","heal",5,0.3,5,5,"горчит, зато сращивает рёбра.","Настаивание травяного отвара",2,[["herb_healing",2]],"l",false,"Траву кладут в воду, а не воду в траву."],
  [817,"forest_balm","Лесной бальзам","heal",8,0.3,7,8,"пахнет хвоей и мокрой корой.","Вытапливание лесного бальзама",3,[["herb_healing",2],["berry_wild",1]],"l",true,"Хвою топят на медленном пару."],
  [818,"crimson_sip","Красный глоток","heal",12,0.3,10,11,"терпкий, как недозрелая вишня.","Сбраживание красного глотка",4,[["berry_red",2],["herb_healing",1]],"l",false,"Ягоды сбраживают до оскомины."],
  [819,"field_tonic","Полевой тоник","heal",18,0.4,14,15,"сбор лета, разведённый водой.","Заваривание полевого тоника",5,[["herb_sun",1],["herb_wind",1],["herb_healing",1]],"l",true,"Полевой сбор рвут до росы."],
  [820,"honey_brew","Медовый отвар","heal",22,0.4,18,19,"сладкий на язык, бодрый на сердце.","Киплачение медового отвара",5,[["berry_red",1],["herb_bitter",1]],"l",false,"Мёд кипятят трижды, иначе слипнется."],
  [821,"resin_brew","Смолистый настой","heal",25,0.4,20,21,"липнет к ране и не отпускает боль.","Пропаривание смолистого настоя",6,[["wood_log",1],["herb_healing",1]],"l",false,"Смолу выгоняют из полена над паром."],
  [822,"oak_tonic","Дубильный отвар","heal",30,0.4,25,26,"вяжет во рту, стягивает раны.","Варка дубильного отвара",7,[["root_rock",1],["herb_bitter",1],["fruit_quince",1]],"l",false,"Кору и айву варят до черноты."],
  [823,"dawn_tonic","Рассветный настой","heal",35,0.4,30,31,"варят на первом свету, пьют на последнем.","Напаривание рассветного настоя",8,[["herb_sun",2],["berry_red",1]],"a",false,"Солнечную траву парят на первом свету."],
  [824,"sun_potion","Солнечное зелье","heal",45,0.4,38,40,"в склянке держится лето.","Отгонка солнечного зелья",10,[["herb_sun",2],["root_ember",1]],"a",false,"Зелье гонят, когда небо чистое."],
  [825,"forge_tonic","Кузнечное зелье","heal",50,0.4,42,44,"на вкус как вода, которой остужают сталь.","Промывка кузнечного зелья",12,[["root_rock",2],["herb_bitter",1]],"a",false,"Остужают впрок — горячее не пьют."],
  [826,"amber_elixir","Янтарный эликсир","heal",55,0.4,48,49,"греет изнутри, как печка.","Растворение янтарного эликсира",14,[["herb_wind",1],["berry_wild",2]],"a",false,"Янтарь растворяют на тёплом ветру."],
  [827,"deep_balm","Глубинный бальзам","heal",60,0.5,52,54,"тёмный, холодный, из пещерных трав.","Стояние глубинного бальзама",16,[["mushroom_grey",2],["root_rock",1]],"a",false,"Пещерные грибы держат в темноте."],
  [828,"alpine_brew","Альпийский отвар","heal",65,0.5,58,59,"горький, как подъём, целительный, как спуск.","Перегонка альпийского отвара",18,[["herb_bitter",2],["root_moon",1]],"a",false,"Перегоняют дважды — выше гор."],
  [829,"ember_tonic","Угольный настой","heal",70,0.5,62,64,"терпкий дымком, согревает до костей.","Каление угольного настоя",20,[["root_ember",2],["mushroom_ink",1]],"a",false,"Уголь прокаливают на углях же."],
  [830,"marsh_balm","Болотный бальзам","heal",75,0.5,68,70,"запах топи, а лечит по-королевски.","Сгущение болотного бальзама",22,[["mushroom_ink",2],["herb_healing",1],["root_rock",1]],"a",true,"Топкую жижу сгущают до тягучести."],
  [831,"stone_brew","Каменный отвар","heal",80,0.5,72,74,"целит то, что камень и надломил.","Растирание каменного отвара",24,[["stone_chunk",1],["root_rock",1]],"a",false,"Каменную крошку растирут в пыль."],
  [832,"gale_tonic","Ветреный настой","heal",85,0.5,78,80,"пьётся быстро, действует быстрее.","Смешение ветреного настоя",26,[["herb_wind",2],["berry_wild",1]],"a",false,"Ветреный сбор месят быстро."],
  [833,"pearl_draught","Жемчужный отвар","heal",90,0.5,84,85,"перламутровый, варится на воде из-под камня.","Промывка жемчужного отвара",28,[["quartz",2],["root_moon",1]],"a",false,"Кварц промывают до блеска."],
  [834,"silver_tonic","Серебряный настой","heal",95,0.5,90,92,"серебро в осадке, чистота в действии.","Осаждение серебряного настоя",30,[["silver_ore",1],["herb_healing",2]],"a",false,"Осадок снимают медной ложкой."],
  [835,"ruby_draught","Рубиновый отвар","heal",100,0.5,96,98,"красный, тяжёлый, дорогущий.","Растворение рубинового отвара",32,[["ruby",1],["berry_red",2]],"m",false,"Рубин в ступке не терпит спешки."],
  [836,"sapphire_balm","Сапфировый бальзам","heal",110,0.5,105,107,"синий, густой, заживляет не торопясь.","Сгущение сапфирового бальзама",36,[["sapphire",1],["moonstone",1]],"m",false,"Сапфир сгущают на лунном холоду."],
  [837,"emerald_tonic","Изумрудный настой","heal",120,0.5,115,117,"зелёный, как первая трава после боя.","Заваривание изумрудного настоя",40,[["emerald",1],["herb_sun",1],["root_rock",1]],"m",false,"Изумруд заваривают в глине, не в железе."],
  [838,"amethyst_draught","Аметистовый отвар","heal",130,0.5,125,127,"дымит фиолетовым и снимает жар.","Курение аметистового отвара",44,[["amethyst",1],["mushroom_glow",1]],"m",false,"Аметист дымит на убывающую луну."],
  [839,"obsidian_balm","Обсидиановый бальзам","heal",140,0.5,135,137,"чёрный, блестящий, режет боль начисто.","Плавление обсидианового бальзама",48,[["obsidian",1],["root_ember",1],["herb_healing",1]],"m",false,"Обсидиан плавят только с жаром."],
  [840,"moonlight_draught","Лунный отвар","heal",150,0.5,148,150,"варят только в полнолуние, хранят в темноте.","Напаривание лунного отвара",52,[["moonstone",2],["root_moon",1]],"m",false,"Лунный камень кладут полной горстью."],
  [841,"phoenix_tonic","Фениксово зелье","heal",175,0.5,175,177,"в склянке тлеет перо феникса.","Варка фениксова зелья",56,[["phoenix_feather",1],["moonstone",1],["herb_healing",2]],"m",false,"Перо держат над паром, не касаясь."],
  [842,"diamond_draught","Алмазный эликсир","heal",200,0.5,205,207,"прозрачный, как капля, и крепче гранита.","Толчение алмазного эликсира",60,[["diamond",1],["phoenix_feather",1]],"m",false,"Алмаз трут дольше, чем варят."],
  [843,"mint_draught","Мятный настой","mp",4,0.3,6,7,"холодит язык, прочищает разум.","Заваривание мятного настоя",2,[["herb_mana",1]],"l",false,"Мяту заваривают один раз: дольше горчит."],
  [844,"blue_sip","Синий глоток","mp",6,0.3,8,9,"один глоток — и пальцы снова слушаются.","Смешение синего глотка",3,[["berry_blue",1],["herb_mana",1]],"l",false,"Синеву снимают со дна черпаком."],
  [845,"night_brew","Ночной отвар","mp",8,0.3,11,12,"варён в темноте, светится изнутри.","Стояние ночного отвара",4,[["berry_blue",2],["mushroom_glow",1]],"l",false,"Ночной отвар не мешают при свете."],
  [846,"frost_draught","Морозный настой","mp",12,0.3,15,16,"иней на горлышке, сила на кончиках пальцев.","Вымораживание морозного настоя",5,[["herb_mana",1],["root_moon",1]],"l",false,"Настой вымораживают на росе."],
  [847,"glass_tonic","Стеклянный тоник","mp",14,0.4,18,19,"прозрачный, как вода, а на вкус — как гроза.","Прозрачение стеклянного тоника",6,[["quartz",1],["herb_mana",1]],"l",false,"Кварц толкут, пока не станет прозрачным."],
  [848,"violet_brew","Фиалковый отвар","mp",18,0.4,24,25,"отдаёт синевой в висках.","Напаривание фиалкового отвара",7,[["herb_bitter",1],["berry_blue",1]],"l",false,"Фиалковый пар ведут через ткань."],
  [849,"star_tonic","Звёздный тоник","mp",22,0.4,28,30,"капля светится, как дальняя звезда.","Сгущение звёздного тоника",8,[["mushroom_glow",2]],"a",false,"Светящие шляпки сушат целиком."],
  [850,"rain_draught","Дождевой настой","mp",25,0.4,32,33,"собирают дождь, копят силу.","Отгонка дождевого настоя",9,[["herb_wind",1],["berry_wild",1]],"a",false,"Дождевую воду для настоя не кипятят."],
  [851,"indigo_brew","Индиговый отвар","mp",30,0.4,38,39,"густой синий, горький до оскомины.","Киплачение индигового отвара",10,[["herb_mana",2],["herb_bitter",1]],"a",false,"Индиговый цвет вываривают насовсем."],
  [852,"azure_tonic","Лазурный тоник","mp",35,0.5,44,46,"цвет летнего неба, вкус зимней воды.","Растворение лазурного тоника",12,[["root_moon",1],["berry_blue",2]],"a",false,"Лазурь ловят в синюю чашу."],
  [853,"glacier_draught","Ледниковый настой","mp",40,0.5,50,52,"тают льдинки, крепнут руны.","Вымораживание ледникового настоя",14,[["moonstone",1],["root_moon",1]],"a",false,"Лёд для настоя берут из ночного кувшина."],
  [854,"dusk_brew","Вечерний отвар","mp",45,0.5,56,58,"варят на закате, пьют перед боем.","Варка вечернего отвара",16,[["herb_sun",1],["herb_mana",1]],"a",false,"Закат ждут, огонь не гасят."],
  [855,"tide_draught","Приливный отвар","mp",50,0.5,64,65,"солёный, как прилив, и такой же сильный.","Перегонка приливного отвара",18,[["root_rock",1],["herb_bitter",2]],"a",false,"Воду берут солёную, траву — горькую."],
  [856,"quartz_tonic","Кварцевый тоник","mp",55,0.5,70,72,"на дне склянки поблёскивает крошка кварца.","Промывка кварцевого тоника",20,[["quartz",2],["herb_mana",1]],"a",false,"Кварц промывают семь раз."],
  [857,"phosphor_brew","Фосфорный отвар","mp",60,0.5,78,79,"светится в темноте, жжёт язык.","Курение фосфорного отвара",22,[["phosphorite",1],["mushroom_glow",1]],"a",false,"Фосфор курят под тягой."],
  [858,"shadow_tonic","Теневой настой","mp",70,0.5,90,92,"тень в склянке шевелится без ветра.","Стояние теневого настоя",24,[["mushroom_ink",2],["root_moon",1]],"a",false,"Теневой настой хранят в чёрной посуде."],
  [859,"argent_draught","Серебряный отвар","mp",80,0.5,104,106,"посеребрённый, звонкий на вкус.","Осаждение серебряного отвара",26,[["silver_ore",1],["herb_mana",2]],"a",false,"Серебро осаждают медленно."],
  [860,"royal_elixir","Королевский эликсир","mp",90,0.5,120,122,"достоин стола, но не казны простолюдина.","Варка королевского эликсира",30,[["amethyst",1],["herb_mana",1],["root_moon",1]],"m",false,"Королевское варят в меру, а не в спеху."],
  [861,"arcane_tonic","Арканный настой","mp",100,0.5,138,140,"руны на стенках склянки загораются сами.","Выстаивание арканного настоя",34,[["amethyst",1],["mushroom_glow",1],["herb_mana",1]],"m",false,"Аркан выстаивают до первых искр."],
  [862,"eclipse_draught","Затменный отвар","mp",120,0.5,170,172,"две половинки тьмы в одной склянке.","Соединение зелья затмения",38,[["moonstone",1],["obsidian",1],["mushroom_ink",1]],"m",false,"Тьбу с тьмой соединяют в равных долях."],
  [863,"void_tonic","Пустотный настой","mp",140,0.5,200,202,"пустой на вкус, полный на деле.","Сгущение пустотного настоя",42,[["obsidian",2],["phosphorite",1]],"m",false,"Пустоту сгущают, иначе расплывётся."],
  [864,"ash_elixir","Пепельный эликсир","mp",150,0.5,220,222,"пепел помнит пламя, склянка — колдуна.","Вытапливание пепельного эликсира",48,[["phoenix_feather",1],["amethyst",1],["root_ember",1]],"m",false,"Пепел вытапливают до искры."]];

const ROSTER_IDS = ROSTER_00032107.map((r) => r[1]);
const OLD_POTION_EFFECTS = {
  minor_healing: ['heal', 6],
  healing_potion: ['heal', 15],
  greater_healing: ['heal', 40],
  mana_potion: ['mp', 10],
  mana_elixir: ['mp', 20],
};
const BUILDINGS_BY_TIER = {
  l: ['assets/buildings/alchemy_lab.json'],
  a: ['assets/buildings/apothecary.json',
    'assets/buildings/alchemy_lab.json'],
  m: ['assets/buildings/alchemy_lab.json',
    'assets/buildings/mage_tower.json'],
};
const CANON_ORDER = ['id', 'name', 'kind', 'subtype', 'weight', 'value',
  'base_price', 'tier', 'desc', 'stats', 'effect', 'loot', 'icon',
  'slot', 'rarity', 'set', 'affixes', 'set_bonus'];
const CANON_REC = ['id', 'название', 'тип', 'база', 'результат',
  'исходники', 'навыки', 'здания', 'заклинания', 'уровень', 'описание'];

function refNum(ref) {
  const m = /(\d{6})\.json$/.exec(ref);
  return m ? m[1] : null;
}

function loadItemFile(num) {
  const f = String(num).padStart(6, '0') + '.json';
  const p = path.join(ITEMS_DIR, f);
  assert.ok(fs.existsSync(p),
    'assets/items/' + f + ' существует (краснота: каталог 814 — '
    + 'зелье волны не создано)');
  return fs.readFileSync(p, 'utf8');
}

// 000318.07: craft — файл <id>.json (basename === id рецепта).
function loadRecFile(id) {
  const f = id + '.json';
  const p = path.join(CRAFT_DIR, f);
  assert.ok(fs.existsSync(p),
    'assets/craft/' + f + ' существует (краснота: рецептов нет)');
  return fs.readFileSync(p, 'utf8');
}

function itemFiles() {
  return fs.readdirSync(ITEMS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f)).sort();
}

const JRC = require('../scripts/lib/json-ref.js');
const CRAFT_FILE_RE = JRC.SHAPE_BASENAME_RES[JRC.ASSET_NAME_SHAPES.craft];
function recFiles() {
  return fs.readdirSync(CRAFT_DIR)
    .filter((f) => f !== 'schema.json' && CRAFT_FILE_RE.test(f)).sort();
}

// --- T1: форма 50 предметов -------------------------------------------

test('000321.07 T1: каталог — ровно 864 файла 000001–000864 подряд (ре-пин: +50 зелий 000815–000864); новые 50 — kind potion, effect {kind: heal|mp, amount} по ростеру, БЕЗ rarity/slot/set/subtype/tier/effect.loot-поля/affixes/set_bonus, base_price ПОСЛЕ value, порядок ключей = канон sync-items-data.js, roundtrip-канон stringify(…,2)+\\n, валидны по assets/items/schema.json (краснота: каталог 814 — волна не добавлена)', () => {
  const files = itemFiles();
  assert.equal(files.length, 864,
    'каталог — 864 файла (814 + 50 зелий 000321.07); факт: '
    + files.length + ' (краснота: волна не добавлена)');
  const schema = JSON.parse(
    fs.readFileSync(path.join(ITEMS_DIR, 'schema.json'), 'utf8'));
  for (const [num, id, , eff, amount] of ROSTER_00032107) {
    const f = String(num).padStart(6, '0') + '.json';
    assert.equal(files[num - 1], f,
      'каталожный порядок: позиция ' + num + ' — ' + f);
    const raw = loadItemFile(num);
    const j = JSON.parse(raw);
    assert.deepEqual(validateData(schema, j, f), [], f + ': схема');
    assert.equal(j.kind, 'potion', f + ': kind potion');
    assert.deepEqual(j.effect, { kind: eff, amount },
      f + ': effect {kind, amount} == ростер');
    assert.equal(j.rarity, undefined, f + ': rarity нет');
    assert.equal(j.slot, undefined, f + ': slot нет');
    assert.equal(j.set, undefined, f + ': set нет');
    assert.equal(j.subtype, undefined, f + ': subtype нет');
    assert.equal(j.tier, undefined, f + ': tier нет');
    assert.equal(j.loot, undefined, f + ': loot нет');
    assert.equal(j.affixes, undefined, f + ': affixes нет');
    assert.equal(j.set_bonus, undefined, f + ': set_bonus нет');
    assert.equal(j.stats, undefined, f + ': stats нет');
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

// --- T2: ростер + глобальная уникальность ------------------------------

test('000321.07 T2: ростер 50 строк ≡ JSON (id/имя/effect.kind/effect.amount/weight/value/base_price/desc «<Имя>: …»); sweep по 864: id, ИМЕНА и ОПИСАНИЯ уникальны по всему каталогу (краснота: каталог 814)', () => {
  const files = itemFiles();
  assert.equal(files.length, 864, 'каталог — 864; факт: ' + files.length);
  const ids = new Map();
  const names = new Map();
  const descs = new Map();
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8'));
    assert.ok(!ids.has(j.id), 'дубликат id: ' + j.id + ' (' + f + ')');
    ids.set(j.id, f);
    assert.ok(!names.has(j.name),
      'дубликат имени: ' + j.name + ' (' + f + ')');
    names.set(j.name, f);
    assert.ok(!descs.has(j.desc),
      'дубликат desc: ' + j.desc + ' (' + f + ')');
    descs.set(j.desc, f);
  }
  assert.equal(ids.size, 864);
  for (const [num, id, name, eff, amount, weight, value, bp,
    tail] of ROSTER_00032107) {
    const j = JSON.parse(loadItemFile(num));
    assert.equal(j.id, id, num + ': id == ростер');
    assert.equal(j.name, name, id + ': имя == ростер');
    assert.equal(j.effect.kind, eff, id + ': effect.kind == ростер');
    assert.equal(j.effect.amount, amount,
      id + ': effect.amount == ростер');
    assert.equal(j.weight, weight, id + ': weight == ростер');
    assert.equal(j.value, value, id + ': value == ростер');
    assert.equal(j.base_price, bp, id + ': base_price == ростер');
    assert.equal(j.desc, name + ': ' + tail, id + ': desc = «<Имя>: …»');
  }
});

// --- T3: масштаб эффекта и цен ------------------------------------------

test('000321.07 T3: масштаб — heal-лестница ростера строго возрастает 3…200 И продолжается со старыми 6/15/40 (объединённая лестница без повторов, amount < 500); mp-лестница 4…150 со старыми 10/20; НОВЫЕ effect.kind ⊆ {heal,mp} (src/items.js:411 — валидатор potion); base_price − value ∈ [0,2] (паттерн старых зелий 4/4, 10/11, 35/37, 12/13, 40/42); weight ∈ [0.3,0.5]; value строго растёт внутри вида; полоса heal [3,205], mp [6,220] (краснота: зелий нет)', () => {
  const oldHeal = [6, 15, 40];
  const oldMp = [10, 20];
  const heal = ROSTER_00032107.filter((r) => r[3] === 'heal')
    .map((r) => r[4]);
  const mp = ROSTER_00032107.filter((r) => r[3] === 'mp')
    .map((r) => r[4]);
  assert.equal(heal.length, 28, 'heal-волна — 28; факт: ' + heal.length);
  assert.equal(mp.length, 22, 'mp-волна — 22; факт: ' + mp.length);
  assert.deepEqual([...heal].sort((a, b) => a - b), heal,
    'heal-лестница строго возрастает по каталожному порядку');
  assert.deepEqual([...mp].sort((a, b) => a - b), mp,
    'mp-лестница строго возрастает по каталожному порядку');
  assert.equal(new Set(heal).size, 28, 'heal-amount уникальны');
  assert.equal(new Set(mp).size, 22, 'mp-amount уникальны');
  assert.equal(heal[0], 3, 'heal начинается со слабого 3');
  assert.equal(heal[heal.length - 1], 200, 'heal-потолок волны — 200');
  assert.equal(mp[0], 4, 'mp начинается с 4');
  assert.equal(mp[mp.length - 1], 150, 'mp-потолок волны — 150');
  assert.deepEqual(heal.filter((a) => oldHeal.includes(a)), [],
    'heal-лестница не повторяет старые 6/15/40');
  assert.deepEqual(mp.filter((a) => oldMp.includes(a)), [],
    'mp-лестница не повторяет старые 10/20');
  for (const r of ROSTER_00032107) {
    const [, id, , , amount, weight, value, bp] = r;
    assert.ok(amount >= 1 && amount < 500,
      id + ': amount в схемном потолке (<500)');
    assert.ok(bp - value >= 0 && bp - value <= 2,
      id + ': base_price − value ∈ [0,2]; факт: ' + (bp - value));
    assert.ok(weight >= 0.3 && weight <= 0.5,
      id + ': weight ∈ [0.3,0.5]; факт: ' + weight);
    const band = r[3] === 'heal' ? [3, 205] : [6, 220];
    assert.ok(value >= band[0] && value <= band[1],
      id + ': value ' + value + ' в полосе ' + r[3] + ' [' + band + ']');
  }
  let hv = 0;
  let mv = 0;
  for (const [, , , eff, , , value] of ROSTER_00032107) {
    if (eff === 'heal') {
      assert.ok(value > hv, 'heal: value строго растёт');
      hv = value;
    } else {
      assert.ok(value > mv, 'mp: value строго растёт');
      mv = value;
    }
  }
  const kinds = new Set(I.allItems()
    .filter((it) => it.kind === 'potion')
    .map((it) => it.effect.kind));
  assert.deepEqual([...kinds].sort(), ['heal', 'mp'],
    'kind potion — только heal|mp (валидатор src/items.js); факт: '
    + [...kinds].join(','));
});

// --- T4: вид potion + старые 5 verbatim -----------------------------------

test('000321.07 T4: вид potion — РОВНО 55 (5 старых + 50 новых); старые 5 verbatim (minor_healing/healing_potion/greater_healing mana-пара — эффект и цена по факту диска); sweep: У ВСЕХ 55 potion нет rarity/slot; все 55 имеют effect.amount ≥ 1 и base_price (краснота: potion 5)', () => {
  const potions = I.allItems().filter((it) => it.kind === 'potion');
  assert.equal(potions.length, 55,
    'kind potion — 55 (5 + 50); факт: ' + potions.length
    + ' (краснота: волна не добавлена)');
  for (const [id, [kind, amount]] of Object.entries(OLD_POTION_EFFECTS)) {
    const it = I.getItem(id);
    assert.ok(it, 'старое зелье «' + id + '» на месте');
    assert.equal(it.kind, 'potion', id + ': kind potion');
    assert.equal(it.effect.kind, kind, id + ': effect.kind verbatim');
    assert.equal(it.effect.amount, amount, id + ': effect.amount verbatim');
  }
  for (const it of potions) {
    assert.equal(it.rarity, undefined,
      it.id + ': у potion НЕ БЫВАЕТ rarity (sweep-пин ТЗ)');
    assert.equal(it.slot, undefined, it.id + ': у potion НЕ БЫВАЕТ slot');
    assert.ok(typeof it.effect.amount === 'number'
      && it.effect.amount >= 1, it.id + ': amount ≥ 1');
    assert.ok(Number.isInteger(it.base_price) && it.base_price >= 1,
      it.id + ': base_price — целое ≥ 1 (зелья торгуют)');
  }
});

// --- T5: иконки ----------------------------------------------------------

test('000321.07 T5: иконки — у 50 новых поле icon ↔ файл существует; биекция json↔svg по basename; flat-SVG 64×64: viewBox ровно «0 0 64 64», ПЕРВЫЙ элемент — тень-эллипс rgba(0,0,0,0.22), без linearGradient/radialGradient/<text/<path/<use/stroke= (паттерн 000302); sha256-уникальность против всех 831 иконок (краснота: файлы не созданы)', () => {
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
  assert.equal(hashes.size, 831,
    'иконок sprites/items — ровно 831 (781 + 50); факт: '
    + hashes.size + ' (краснота: иконок нет)');
  for (const [, id] of ROSTER_00032107) {
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
    const row = ROSTER_00032107.find((r) => r[1] === id);
    const j = JSON.parse(loadItemFile(row[0]));
    assert.equal(j.icon, 'assets/sprites/items/' + f,
      f + ': биекция icon ↔ файл');
  }
});

// --- T6: рецепты ----------------------------------------------------------

test('000321.07 T6: 50 рецептов — файлы <id>.json (000318.07: basename === id, slug сразу); каталог 693 (643 + 50); результат покрывает НОВЫЕ зелья 1:1 тем же порядком; id рецепта = id предмета (D-01); тип «алхимия»; «база» отсутствует (все 50 базовые — relation 1:1, решение в памяти); «заклинаний» нет; навыки [алхимия 000025] (+природа 000031 у 3 ростера); здания по факту диска: 14 [alchemy_lab] / 23 [apothecary, alchemy_lab] / 13 [alchemy_lab, mage_tower]; исходники — только СТАРЫЕ реагенты (existsSync, номер < 000815); «название»/«описание» уникальны по 693; roundtrip-канон; валидны по assets/craft/schema.json (краснота: craft 643 — рецептов нет)', () => {
  const files = recFiles();
  assert.equal(files.length, 693,
    'craft — 693 файла (643 + 50); факт: ' + files.length
    + ' (краснота: рецепты не созданы)');
  const schema = JSON.parse(
    fs.readFileSync(path.join(CRAFT_DIR, 'schema.json'), 'utf8'));
  const itemNums = new Set(fs.readdirSync(ITEMS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f)).map(refNum));
  const recNames = new Map();
  const recDescs = new Map();
  for (const f of files) {
    const j = JSON.parse(
      fs.readFileSync(path.join(CRAFT_DIR, f), 'utf8'));
    assert.ok(!recNames.has(j['название']),
      'дубликат «название»: ' + j['название'] + ' (' + f + ')');
    recNames.set(j['название'], f);
    assert.ok(!recDescs.has(j['описание']),
      'дубликат «описание»: ' + j['описание'] + ' (' + f + ')');
    recDescs.set(j['описание'], f);
  }
  for (const [num, id, , , , , , , , recName, level, srcs, bld,
    nature, recDesc] of ROSTER_00032107) {
    const f = id + '.json';
    assert.ok(files.includes(f),
      'рецепт зелья — файл ' + f + ' ∈ assets/craft (basename === id)');
    const raw = loadRecFile(id);
    const j = JSON.parse(raw);
    assert.deepEqual(validateData(schema, j, f), [], f + ': схема');
    assert.equal(j['id'], id, f + ': id рецепта = id результата (D-01)');
    assert.equal(j['результат']['предмет'],
      'assets/items/' + String(num).padStart(6, '0') + '.json',
      f + ': результат — предмет волны ' + num);
    assert.equal(j['результат']['количество'], 1, f + ': количество 1');
    assert.equal(j['тип'], 'алхимия', f + ': тип «алхимия»');
    assert.equal(j['база'], undefined, f + ': «база» отсутствует');
    assert.equal(j['заклинания'], undefined, f + ': «заклинаний» нет');
    assert.equal(j['название'], recName, f + ': название == ростер');
    assert.equal(j['описание'], recDesc, f + ': описание == ростер');
    const expectedSk = nature
      ? ['000025', '000031']
      : ['000025'];
    assert.deepEqual(j['навыки'].map(refNum), expectedSk,
      f + ': навыки ' + expectedSk.join(',') + '; факт: '
      + j['навыки'].map(refNum).join(','));
    assert.deepEqual(j['здания'], BUILDINGS_BY_TIER[bld],
      f + ': здания по тир-карте ростера');
    assert.equal(j['уровень'], level, f + ': уровень == ростер');
    assert.ok(j['исходники'].length >= 1 && j['исходники'].length <= 8,
      f + ': исходники 1–8');
    assert.deepEqual(srcs.map(([rid, q]) => [idNumsByReagent[rid], q]),
      j['исходники'].map((s) => [refNum(s['предмет']), s['количество']]),
      f + ': исходники ≡ ростеру');
    for (const s of j['исходники']) {
      const sn = refNum(s['предмет']);
      assert.ok(itemNums.has(sn), f + ': исходник ' + sn + ' ∈ каталог');
      assert.ok(Number(sn) < NEW_FROM,
        f + ': исходник ' + sn + ' — СТАРЫЙ (новых реагентов нет)');
      assert.ok(s['количество'] >= 1 && s['количество'] <= 8,
        f + ': количество ' + s['количество']);
    }
    const oi = Object.keys(j).map((k) => CANON_REC.indexOf(k));
    assert.ok(oi.every((x) => x >= 0), f + ': только схемные ключи');
    assert.deepEqual(oi, [...oi].sort((a, b) => a - b),
      f + ': порядок ключей — канон; факт: ' + Object.keys(j).join(','));
    assert.equal(JSON.stringify(j, null, 2) + '\n', raw,
      f + ': roundtrip-канон');
  }
  let natures = 0;
  for (const [num] of ROSTER_00032107) {
    const j = JSON.parse(loadItemFile(num));
    assert.equal(j.kind, 'potion', 'результат ' + num + ' — potion');
  }
  for (const r of ROSTER_00032107) if (r[13]) natures++;
  assert.equal(natures, 3, 'nature-навык ровно у 3 рецептов ростера');
});

const idNumsByReagent = (() => {
  const m = {};
  for (const f of fs.readdirSync(ITEMS_DIR)) {
    if (!/^\d{6}\.json$/.test(f)) continue;
    const d = JSON.parse(
      fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8'));
    m[d.id] = f.slice(0, 6);
  }
  return m;
})();

// --- T7: зеркала -----------------------------------------------------------

test('000321.07 T7: зеркала — src/items-data.js 864 записей, новые 50 ≡ JSON поэлементно и getItem резолвится; src/craft-data.js 693 записей в lex-порядке по id (000318.07) с резолвом результат/исходники/навыки/здания в id (краснота: зеркало не регенерировано)', () => {
  assert.equal(ITD.ITEMS.length, 864,
    'items-data — 864; факт: ' + ITD.ITEMS.length);
  const mirrorById = new Map(ITD.ITEMS.map((it) => [it.id, it]));
  for (const [num, id] of ROSTER_00032107) {
    const j = JSON.parse(loadItemFile(num));
    const m = mirrorById.get(id);
    assert.ok(m, 'items-data: предмет «' + id + '»');
    assert.deepEqual(m, j, id + ': зеркало ≡ JSON поэлементно');
    assert.equal(I.getItem(id).name, j.name,
      id + ': getItem резолвится');
  }
  assert.equal(CRD.CRAFT.length, 693,
    'craft-data — 693; факт: ' + CRD.CRAFT.length);
  const lexIds = CRD.CRAFT.map((r) => r.id);
  assert.deepEqual(lexIds, [...lexIds].sort(),
    'craft-data — lex по id (контракт 000318.07)');
  for (const [num, id] of ROSTER_00032107) {
    const f = id + '.json';
    const j = JSON.parse(loadRecFile(id));
    const m = CRD.CRAFT_BY_ID[id];
    assert.ok(m, 'craft-data: рецепт «' + id + '» (' + f + ')');
    const itemById = (ref) => JSON.parse(fs.readFileSync(
      path.join(ITEMS_DIR, refNum(ref) + '.json'), 'utf8')).id;
    assert.deepEqual(m['результат'],
      { предмет: itemById(j['результат']['предмет']), количество: 1 },
      f + ': зеркало — результат резолвлен в id');
    assert.deepEqual(m['исходники'], j['исходники'].map((s) => ({
      предмет: itemById(s['предмет']),
      количество: s['количество'],
    })), f + ': зеркало — исходники резолвлены в id');
    assert.deepEqual(m['навыки'], j['навыки'].map(
      (s) => JSON.parse(fs.readFileSync(
        path.join(SKILLS_DIR, refNum(s) + '.json'), 'utf8')).id),
      f + ': зеркало — навыки резолвлены в id');
    assert.deepEqual(m['здания'], j['здания'].map(
      (b) => JSON.parse(fs.readFileSync(
        path.join(ROOT, b), 'utf8')).id),
      f + ': зеркало — здания резолвлены');
    assert.equal(m['тип'], 'алхимия', f + ': зеркало — тип');
  }
});

// --- T8: счётчики/канарейки ----------------------------------------------

test('000321.07 T8: регресс-канарейки — каталог 864 ≡ items-data; potion 55; weapon 72 / armor 257 / tool 60 / artifact 63 / shield 62 / ring 75 / spell_scroll 161 (не выросли); rarity — 579 (зелья без rarity); slot — у 589 (не выросло), «прочих» без slot — 275 (225 + 50 зелий); base_price РОВНО у 252 (202 + 50), без — 612 (не двигается); craft 693: зачарование 244 / кузнечное 173 / столярное 114 / резьба 86 / алхимия 74 / рунопись 2; иконки 831; stroke= — ровно 46 legacy (краснота: каталог 814)', () => {
  const all = I.allItems();
  assert.equal(all.length, 864);
  assert.equal(ITD.ITEMS.length, 864, 'items-data ≡ каталог (864)');
  const byKind = {};
  for (const it of all) byKind[it.kind] = (byKind[it.kind] || 0) + 1;
  assert.equal(byKind.potion, 55, 'potion — 55 (5 + 50); факт: '
    + byKind.potion);
  assert.equal(byKind.weapon, 72, 'weapon — 72 (не вырос)');
  assert.equal(byKind.armor, 257, 'armor — 257 (не вырос)');
  assert.equal(byKind.tool, 60, 'tool — 60 (не вырос)');
  assert.equal(byKind.artifact, 63, 'artifact — 63 (не вырос)');
  assert.equal(byKind.shield, 62, 'shield — 62 (не вырос)');
  assert.equal(byKind.ring, 75, 'ring — 75 (не вырос)');
  assert.equal(byKind.spell_scroll, 161, 'spell_scroll — 161 (не вырос)');
  assert.equal(all.filter((it) => it.rarity).length, 579,
    'rarity-множество — 579 (зелья без rarity); факт: '
    + all.filter((it) => it.rarity).length);
  assert.equal(all.filter((it) => 'slot' in it).length, 589,
    'slot — у 589 (не выросло); факт: '
    + all.filter((it) => 'slot' in it).length);
  assert.equal(all.filter((it) => !('slot' in it)).length, 275,
    '«прочих» без slot — 275 (225 + 50 зелий); факт: '
    + all.filter((it) => !('slot' in it)).length);
  assert.equal(all.filter((it) => 'base_price' in it).length, 252,
    'base_price — ровно у 252 (202 + 50 зелий); факт: '
    + all.filter((it) => 'base_price' in it).length);
  assert.equal(all.filter((it) => !('base_price' in it)).length, 612,
    'без base_price — 612 (НЕ двигается); факт: '
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
  assert.equal(icons.length, 831, 'иконок — 831; факт: ' + icons.length);
  let strokes = 0;
  for (const f of icons) {
    if (fs.readFileSync(path.join(SPR_DIR, f), 'utf8')
      .includes('stroke=')) strokes++;
  }
  assert.equal(strokes, 46,
    'stroke= — ровно 46 legacy; факт: ' + strokes);
});

// --- T9: spec/items.md ------------------------------------------------------

test('000321.07 T9: spec/items.md — строка «Каталог assets/items — 864 файлов (на момент 000321.07)» (единственный number-факт, паттерн 000312), тип-таблица содержит описательную строку «Зелья», правки line-neutral: файл — 477 строк без trailing-\\n (SPEC_FILE_LINES["items.md"] = 477 не двигается) (краснота: «на момент 000321.06»)', () => {
  const text = fs.readFileSync(path.join(ROOT, 'spec', 'items.md'),
    'utf8');
  assert.ok(text.includes(
    'Каталог assets/items — 864 файлов (на момент 000321.07)'),
    'spec/items.md: строка счётчика каталога не ре-пиннута '
    + '(иголка W8A wording-теста обязана совпадать обеим сторонам)');
  assert.ok(/\|\s*Зелья\s*\|/.test(text),
    'spec/items.md: тип-таблица содержит строку «Зелья»');
  assert.ok(!text.includes('814 файлов'),
    'spec/items.md: старое число 814 не осталось');
  assert.ok(!text.endsWith('\n'),
    'spec/items.md — без trailing-\\n (line-neutral правки)');
  assert.equal(text.split('\n').length, 477,
    'spec/items.md — 477 строк (SPEC_FILE_LINES 477 не двигается)');
});

// --- T10: 0-diff стражи ------------------------------------------------------

test('000321.07 T10: 0-diff стражи — src/loot-equip-data.js побайтово прежний (зелья НЕ equip, пулы/таблицы не тронуты); EQUIP_POOLS размеры 232/161/117/46/23 инвариантны; DROP-таблица 50/30/15/4.9/0.1 ≡ 1; DISASSEMBLY_BY_ITEM — 648 канонических рецептов (598 + 50 новых базовых), единственный тай прежний (iron_sword), новых тайов нет (краснота: 598 — рецептов волны нет)', () => {
  const before = execFileSync('git',
    ['-C', ROOT, 'show', 'HEAD:src/loot-equip-data.js'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const after = fs.readFileSync(path.join(ROOT, 'src',
    'loot-equip-data.js'), 'utf8');
  assert.equal(after, before,
    'src/loot-equip-data.js ИЗМЕНЁН — зелья не должны влиять на '
    + 'equip-пулы и DROP-контракт 000230');
  const P = L.EQUIP_POOLS;
  assert.deepEqual(L.RARITY.map((t) => P[t.id].length), [232, 161, 117,
    46, 23], 'EQUIP_POOLS — 232/161/117/46/23 (не выросли); факт: '
    + L.RARITY.map((t) => P[t.id].length).join('/'));
  assert.equal(L.RARITY.reduce((s, t) => s + t.chance, 0), 1,
    'DROP-таблица — Σ 1 (НЕ тронута)');
  const C = require(path.join(ROOT, 'src', 'craft.js'));
  const { CRAFT, CRAFT_BY_ID } = CRD;
  const expected = {};
  for (const r of CRAFT) {
    if (r.база !== undefined) continue;
    const res = r.результат.предмет;
    if (!(res in expected)
      || r.уровень < CRAFT_BY_ID[expected[res]].уровень) {
      expected[res] = r.id;
    }
  }
  assert.equal(Object.keys(expected).length, 648,
    'канонических рецептов — 648 (598 + 50 зелий); факт: '
    + Object.keys(expected).length);
  const map = C.DISASSEMBLY_BY_ITEM;
  assert.deepEqual(map, expected,
    'DISASSEMBLY_BY_ITEM ≡ правилу по порядку зеркала');
  const perItem = new Map();
  for (const r of CRAFT) {
    if (r.база !== undefined) continue;
    const list = perItem.get(r.результат.предмет) || [];
    list.push(r);
    perItem.set(r.результат.предмет, list);
  }
  let ties = 0;
  for (const [, list] of perItem) {
    const min = Math.min(...list.map((r) => r.уровень));
    if (list.filter((r) => r.уровень === min).length > 1) ties++;
  }
  assert.equal(ties, 1,
    'тайов — ровно 1 (iron_sword, зелья дают только уникальные '
    + 'результаты); факт: ' + ties);
  for (const [, id] of ROSTER_00032107) {
    assert.ok(id in map, id + ': новое зелье — в DISASSEMBLY_BY_ITEM');
    assert.equal(map[id], id, id + ': канонический рецепт — свой же');
  }
});

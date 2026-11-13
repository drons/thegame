'use strict';
// 000321.06 — волна 50 колец (000765–000814) + 50 рецептов (000670–000719)
// + 50 иконок. Ростер фиксируется здесь и в memory/000321-ring-items.md.
// Строка ростера:
// [номер, id, имя, rarity, weight, value, skill, amount, set|null,
//  free_cast|null, тип рецепта ('r' резьба_по_камню / 'e' зачарование),
//  название рецепта, уровень рецепта, «заклинания»|null, исходники,
//  хвост desc, описание рецепта]
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
const SPELLS_DIR = path.join(ROOT, 'assets', 'spells');

const NEW_FROM = 765;
const NEW_TO = 814;
const REC_FROM = 670;
const REC_TO = 719;

const ROSTER_00032106 = [[765,"tin_band","Оловянный ободок","common",0.05,12,"step",0.03,null,null,"r","Резьба оловянного ободка",2,null,[[36,2],
  [38,1]],"тёплый от руки, холодный по утру.","Олово режется тёплым."],
  [766,"antler_band","Олений ободок","common",0.05,13,"back",0.03,null,null,"r","Резьба оленьего ободка",3,null,[[37,2],
  [36,1]],"рог, снятый с охотничьей добычи.","Рог берут в мягкую лапу."],
  [767,"woven_ring","Плетёное кольцо","common",0.05,14,"endurance",0.03,null,null,"r","Резьба плетёного кольца",3,null,[[35,2]],"сплетено из сухой травы на удачу.","Траву режут по узору."],
  [768,"amber_disc","Янтарный диск","common",0.06,15,"merchant",0.04,null,null,"r","Резьба янтарного диска",4,null,[[55,1],
  [38,1]],"в смолу навек запечатан мох.","Смола помнит каждое касание."],
  [769,"glass_band","Стеклянный ободок","common",0.06,17,"catseye",0.04,null,null,"r","Резьба стеклянного ободка",4,null,[[36,2],
  [38,1]],"дудка стеклодува, остывшая кольцом.","Стекло ловит взгляд первым."],
  [770,"resin_ring","Смоляное кольцо","common",0.05,18,"acro",0.04,null,null,"r","Резьба смоляного кольца",5,null,[[35,1],
  [38,1]],"пахнет хвоей, липнет к добру.","Смоляной ком греют в ладони."],
  [771,"wire_ring","Проволочное кольцо","common",0.05,20,"thief",0.04,null,null,"r","Резьба проволочного кольца",5,null,[[34,2],
  [38,1]],"виток меди на один палец.","Проволока запоминает пальцы."],
  [772,"sinew_knot","Сухожильный узел","common",0.05,21,"hide",0.04,null,null,"r","Резьба сухожильного узла",6,null,[[37,2]],"охотничья память, завязанная узлом.","Жилу тянут на медленном огне."],
  [773,"pumice_ring","Пемзовое кольцо","common",0.07,23,"perception",0.05,null,null,"r","Резьба пемзового кольца",6,null,[[36,3]],"дырчатый камень из жерла.","Пемзу точат о пемзу."],
  [774,"fluorite_seal","Флюоритовая печать","common",0.07,25,"orator",0.05,null,null,"r","Резьба флюоритовой печати",7,null,[[36,2],
  [55,1]],"меняет цвет на чужой взгляд.","Флюорит режут под маслом."],
  [775,"smoky_signet","Дымчатый перстень","common",0.06,26,"breath",0.05,null,null,"r","Резьба дымчатого перстня",7,null,[[56,1],
  [38,1]],"внутри застыл серый смерч.","Дым в камине виднее."],
  [776,"pebble_ring","Галечное кольцо","common",0.07,28,"artist",0.05,null,null,"r","Резьба галечного кольца",8,null,[[36,1],
  [35,1]],"река отшлифовала его за век.","Гальку выбирают по узору."],
  [777,"flint_ring","Кремнёвое кольцо","common",0.06,29,"archer",0.05,null,null,"r","Резьба кремнёвого кольца",8,null,[[36,2]],"искра по-прежнему рядом.","Кремень любят за терпение."],
  [778,"bronze_loop","Бронзовый ободок","common",0.06,30,"fists",0.05,null,null,"r","Резьба бронзового ободка",8,null,[[34,2]],"служил монетой, стал кольцом.","Бронзу гнут на весу."],
  [779,"cast_iron_ring","Чугунное кольцо","common",0.07,31,"heavy",0.05,null,null,"r","Резьба чугунного кольца",8,null,[[33,2],
  [38,1]],"тяжелее выглядит, чем есть.","Чугун режут ровно вдвое."],
  [780,"brass_signet","Латунный перстень","common",0.06,32,"swordsman",0.04,null,null,"r","Резьба латунного перстня",8,null,[[34,1],
  [33,1]],"печатка приказного старшины.","Латунь берут спевшись."],
  [781,"blackened_band","Воронёный ободок","common",0.06,33,"accuracy",0.05,null,null,"r","Резьба воронёного ободка",9,null,[[33,2],
  [38,2]],"воронение бережёт от ржавчины.","Воронят в тишине."],
  [782,"forge_washer","Кузнечная шайба","common",0.07,35,"forge",0.05,null,null,"r","Резьба кузнечной шайбы",9,null,[[33,1],
  [36,1],
  [38,1]],"осталась после большой сборки.","Шайбу режут по калёному."],
  [783,"etched_seal","Травлёная печать","common",0.06,37,"alchemy",0.05,null,null,"r","Резьба травлёной печати",9,null,[[55,1],
  [37,1]],"узор выеден кислотой.","Травят в вытяжку."],
  [784,"chief_signet","Начальственный перстень","common",0.07,40,"leader",0.05,null,null,"r","Резьба начальственного перстня",9,null,[[34,2],
  [36,1]],"им выдавали наряды.","Печать ставят без чернил."],
  [785,"garnet_band","Гранатовый ободок","rare",0.08,60,"elder",0.06,null,null,"r","Резьба гранатового ободка",12,null,[[52,1],
  [58,1],
  [38,1]],"зерно граната в серебре.","Гранат режут острым резцом."],
  [786,"jade_signet","Нефритовый перстень","rare",0.08,64,"golem",0.06,null,null,"r","Резьба нефритового перстня",14,null,[[52,2],
  [36,1]],"нефрит знает терпение камня.","Нефрит пилят водой."],
  [787,"moon_setting","Лунная оправа","rare",0.09,68,"meditation",0.06,"moonlight",null,"r","Резьба лунной оправы",16,null,[[23,1],
  [52,1]],"оправа, что ждёт луну и ловит её.","Оправу полируют ночью."],
  [788,"tide_knot","Приливный узел","rare",0.09,72,"breath",0.07,"tide",null,"r","Резьба приливного узла",18,null,[[23,1],
  [37,1]],"морской узел, что помнит прилив.","Узел вяжут на мокром."],
  [789,"serpent_signet","Змеиный перстень","rare",0.09,76,"scholar",0.07,null,null,"r","Резьба змеиного перстня",20,null,[[55,2],
  [52,1]],"змея, свернувшись, читает свитки.","Чешую снимают строго по спирали."],
  [790,"dread_seal","Ворожбина печать","rare",0.1,80,"fright",0.07,null,null,"e","Зачарование ворожбиной печати",22,"shroud",[[52,2],
  [55,1],
  [38,2]],"печать для чужого страха.","Ворожбу ведут шёпотом."],
  [791,"thorn_band","Терновый ободок","rare",0.1,84,"nature",0.07,null,null,"e","Зачарование тернового ободка",23,"vine",[[35,2],
  [52,1]],"шип помнит, кто трогал лес.","Терень берут в полнолуние."],
  [792,"windwalker_ring","Ветроступ","rare",0.08,88,"step",0.08,null,null,"e","Зачарование ветроступа",24,"blazing_speed",[[52,1],
  [55,1]],"дорога сама ложится под шаг.","Ветер ловят в открытую дверь."],
  [793,"hawk_eye_ring","Кольцо ястреба","rare",0.08,92,"catseye",0.08,null,null,"e","Зачарование кольца ястреба",25,"blessing",[[55,2],
  [38,1]],"видит мышь за тремя холмами.","Взгляд точат на свету."],
  [794,"blade_braid","Клинковая лента","rare",0.09,96,"swordsman",0.08,null,null,"e","Зачарование клинковой ленты",26,"iron_bulwark",[[33,2],
  [52,1]],"косичка из лезвийной стали.","Сталь плетут на двоих."],
  [795,"whetstone_ring","Оселковый перстень","rare",0.09,100,"accuracy",0.08,null,null,"e","Зачарование оселкового перстня",27,"hurricane",[[36,2],
  [52,1],
  [38,1]],"точит не клинок, а глаз.","Оселок молят перед правкой."],
  [796,"umbral_band","Тенистый обруч","rare",0.09,104,"hide",0.08,null,null,"e","Зачарование тенистого обруча",28,"invisibility",[[52,1],
  [56,1]],"тень носит его вместо себя.","Тень режут без света."],
  [797,"marksman_loop","Дальнобой","rare",0.1,110,"archer",0.09,null,null,"e","Зачарование дальнобоя",29,"chill",[[55,1],
  [52,2]],"стрела слышит это кольцо.","Даль измеряют дыханьем."],
  [798,"trade_seal","Товарная печать","rare",0.1,120,"merchant",0.09,null,null,"e","Зачарование товарной печати",29,"mend",[[53,1],
  [52,1],
  [38,1]],"складывает счёт сама.","Печать ставят на доверии."],
  [799,"rune_alloy","Рунный сплав","epic",0.12,190,"runes",0.12,null,null,"e","Зачарование рунного сплава",30,"ward",[[53,2],
  [61,1],
  [38,1]],"руны сплавились в одно слово.","Сплав называют руной."],
  [800,"ash_band","Пепельный обод","epic",0.12,210,"firelord",0.14,null,null,"e","Зачарование пепельного обода",32,"fireball",[[53,1],
  [58,1],
  [38,2]],"уголь, что помнит жар.","Пепел берут из чужого костра."],
  [801,"silver_frost","Иней на серебре","epic",0.12,230,"icelord",0.13,null,null,"e","Зачарование инея на серебре",35,"frost_bolt",[[52,2],
  [59,1]],"серебро, одетое в изморозь.","Иней снимают пером."],
  [802,"icewalker","Ледоход","epic",0.13,250,"endurance",0.12,null,"frost_walk","e","Зачарование ледохода",38,"frost_walk",[[53,1],
  [59,1],
  [38,1]],"идёт по воде, как по мосту.","Лёд пробуют на дышащих."],
  [803,"clay_warden","Глиняный страж","epic",0.13,270,"golem",0.14,null,"aegis","e","Зачарование глиняного стража",40,"aegis",[[53,1],
  [60,1],
  [36,1]],"маленький страж больших ворот.","Стража лепят из жирной глины."],
  [804,"ink_signet","Чернильный перстень","epic",0.12,290,"scholar",0.15,null,null,"e","Зачарование чернильного перстня",42,"light_heal",[[53,2],
  [61,1]],"пишет ответы до вопросов.","Чернила варят из дубов."],
  [805,"root_braid","Корневая оплётка","epic",0.13,310,"nature",0.13,null,null,"e","Зачарование корневой оплётки",45,"heart_of_forest",[[53,1],
  [60,2]],"корни держат круче клея.","Корни просят, а не берут."],
  [806,"augur_band","Вещий ободок","epic",0.12,340,"precog",0.14,null,null,"e","Зачарование вещего ободка",48,"divine_favor",[[53,2],
  [59,1],
  [38,1]],"звенит перед бедой.","Вещают над остывшим."],
  [807,"selenite_ring","Лунный селенит","epic",0.13,370,"meditation",0.16,"moonlight",null,"e","Зачарование лунного селенита",50,"circle_of_light",[[53,1],
  [23,1],
  [55,1]],"селенит светит без луны.","Селенит расщепляют по слоям."],
  [808,"tidebreath","Дыхание прилива","epic",0.12,400,"breath",0.15,"tide",null,"e","Зачарование дыхания прилива",55,"greater_heal",[[53,1],
  [59,2]],"дышит морем в штиль.","Дыхание учат на берегу."],
  [809,"moon_crown","Лунный венец","legendary",0.15,520,"elder",0.22,"moonlight",null,"e","Зачарование лунного венца",60,"faith_shield",[[54,1],
  [53,2],
  [62,1]],"венец, ношенный ночью.","Венец куют из тишины."],
  [810,"frost_squall","Ледяной шквал","legendary",0.16,560,"icelord",0.25,"tide",null,"e","Зачарование ледяного шквала",65,"blizzard",[[54,1],
  [59,2],
  [38,1]],"буря, сжатая в кольцо.","Шквал встречают стоя."],
  [811,"undying_bough","Бессмертный сук","legendary",0.15,610,"unkill",0.28,null,null,"e","Зачарование бессмертного сука",70,"guardian_oath",[[54,2],
  [60,1]],"сук, что не узнал зимы.","Сук берут только с пня."],
  [812,"forewarning","Предвещание","legendary",0.16,660,"precog",0.3,null,null,"e","Зачарование предвещания",75,"meteor",[[54,1],
  [61,2],
  [38,1]],"приходит раньше беды.","Предупреждения варят медленно."],
  [813,"eclipse_band","Затмение","impossible",0.2,1200,"fright",0.35,"moonlight",null,"e","Зачарование затмения",95,"void_horror",[[54,2],
  [62,1],
  [23,2]],"тень, съевшая луну.","Затмение смотрят в воду."],
  [814,"caldera_core","Сердце кальдеры","impossible",0.2,1500,"firelord",0.4,null,null,"e","Зачарование сердца кальдеры",100,"phoenix",[[54,2],
  [58,1],
  [62,1]],"осколок спящего огня.","Сердце не вытаскивают до конца."]];

const ROSTER_IDS = ROSTER_00032106.map((r) => r[1]);
const COMPOSITION_00032106 = { common: 20, rare: 14, epic: 10,
  legendary: 4, impossible: 2 };
const POOL_OLD_00032106 = { common: 212, rare: 147, epic: 107,
  legendary: 42, impossible: 21 };
const POOL_NEW_00032106 = { common: 232, rare: 161, epic: 117,
  legendary: 46, impossible: 23 };
const VALUE_BAND_00032106 = { common: [10, 45], rare: [55, 140],
  epic: [170, 450], legendary: [480, 750], impossible: [1000, 1600] };
const WEIGHT_BAND_00032106 = { common: [0.05, 0.07], rare: [0.08, 0.1],
  epic: [0.12, 0.13], legendary: [0.15, 0.16], impossible: [0.2, 0.2] };
const AFFIX_SCALE_00032106 = { common: [0.02, 0.05], rare: [0.05, 0.1],
  epic: [0.1, 0.2], legendary: [0.2, 0.35], impossible: [0.35, 0.45] };
const LEVEL_BAND_00032106 = { common: [2, 9], rare: [10, 29],
  epic: [30, 59], legendary: [60, 89], impossible: [90, 100] };
// 31 secondary-навык,использованы в каталоге предметов (staff 000044 вне
// оборота — прецедент .14 §2.2).
const SKILLS_31_00032106 = ['accuracy', 'acro', 'alchemy', 'archer',
  'artist', 'back', 'breath', 'catseye', 'elder', 'endurance',
  'firelord', 'fists', 'forge', 'fright', 'golem', 'heavy', 'hide',
  'icelord', 'leader', 'meditation', 'merchant', 'nature', 'orator',
  'perception', 'precog', 'runes', 'scholar', 'step', 'swordsman',
  'thief', 'unkill'];
const NEW_SETS_00032106 = [
  { set: 'moonlight',
    members: ['moon_setting', 'selenite_ring', 'moon_crown',
      'eclipse_band'],
    bonus: { 2: { armor: 1 },
      4: [{ type: 'skill', skill: 'meditation', amount: 0.1 }] } },
  { set: 'tide',
    members: ['tide_knot', 'tidebreath', 'frost_squall'],
    bonus: { 2: [{ type: 'skill', skill: 'breath', amount: 0.05 }],
      3: [{ type: 'skill', skill: 'icelord', amount: 0.08 }] } },
];
const FREE_CAST_WAVE_00032106 = {
  icewalker: 'frost_walk', clay_warden: 'aegis',
};

const canonKeys = (j) => Object.keys(j);
const CANON_ORDER = ['id', 'name', 'kind', 'subtype', 'weight', 'value',
  'base_price', 'tier', 'desc', 'stats', 'effect', 'loot', 'icon',
  'slot', 'rarity', 'set', 'affixes', 'set_bonus'];

function refNum(ref) {
  const m = /(\d{6})\.json$/.exec(ref);
  return m ? m[1] : null;
}

function loadItemFile(num) {
  const f = String(num).padStart(6, '0') + '.json';
  const p = path.join(ITEMS_DIR, f);
  assert.ok(fs.existsSync(p),
    'assets/items/' + f + ' существует (краснота: каталог 764 — '
    + 'кольцо волны не создано)');
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

function spellIds() {
  const JR = require('../scripts/lib/json-ref.js');
  return new Set(fs.readdirSync(SPELLS_DIR)
    .filter((f) => f !== 'schema.json'
      && JR.SHAPE_BASENAME_RES[JR.ASSET_NAME_SHAPES.spells].test(f))
    .map((f) => JSON.parse(
      fs.readFileSync(path.join(SPELLS_DIR, f), 'utf8')).id));
}

function itemFiles() {
  return fs.readdirSync(ITEMS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f)).sort();
}

const JRC_REC = require('../scripts/lib/json-ref.js');
const CRAFT_FILE_RE = JRC_REC.SHAPE_BASENAME_RES[JRC_REC.ASSET_NAME_SHAPES.craft];
function recFiles() {
  return fs.readdirSync(CRAFT_DIR)
    .filter((f) => f !== 'schema.json' && CRAFT_FILE_RE.test(f)).sort();
}

// --- T1: форма 50 предметов ------------------------------------------

test('000321.06 T1: каталог — ровно 864 файла 000001–000864 подряд (ре-пин 000321.07: +50 зелий 000815–000864 — новый конец каталога; ре-пин: +50 колец 000765–000814); новые 50 — kind ring, slot ring, stats РОВНО {armor: 0} (ювелирная группа D-02 .14), БЕЗ subtype/base_price/tier/effect/loot, порядок ключей = канон sync-items-data.js (set перед affixes, set_bonus последний), roundtrip-канон stringify(…,2)+\\n, валидны по assets/items/schema.json (краснота: каталог 764 — волна не добавлена)', () => {
  const files = itemFiles();
  assert.equal(files.length, 864,
    'каталог — 864 файла (764 + 50 колец 000321.06 + 50 зелий 000321.07); факт: '
    + files.length + ' (краснота: волна не добавлена)');
  const schema = JSON.parse(
    fs.readFileSync(path.join(ITEMS_DIR, 'schema.json'), 'utf8'));
  for (const [num, id] of ROSTER_00032106) {
    const f = String(num).padStart(6, '0') + '.json';
    assert.equal(files[num - 1], f,
      'каталожный порядок: позиция ' + num + ' — ' + f);
    const raw = loadItemFile(num);
    const j = JSON.parse(raw);
    assert.deepEqual(validateData(schema, j, f), [], f + ': схема');
    assert.equal(j.kind, 'ring', f + ': kind ring');
    assert.equal(j.slot, 'ring', f + ': slot ring');
    assert.deepEqual(j.stats, { armor: 0 },
      f + ': stats РОВНО {armor: 0}');
    assert.equal(j.tier, undefined, f + ': tier нет');
    assert.equal(j.base_price, undefined, f + ': base_price нет');
    assert.equal(j.subtype, undefined, f + ': subtype нет');
    assert.equal(j.effect, undefined, f + ': effect нет');
    assert.equal(j.loot, undefined, f + ': loot нет');
    assert.equal(j.icon, 'assets/sprites/items/' + id + '.svg',
      f + ': icon = assets/sprites/items/<id>.svg');
    const order = canonKeys(j).filter((k) => k !== 'id');
    const idx = order.map((k) => CANON_ORDER.indexOf(k));
    assert.deepEqual(idx, [...idx].sort((a, b) => a - b),
      f + ': порядок ключей — канон KEYS sync-items-data.js; факт: '
      + canonKeys(j).join(','));
    assert.equal(JSON.stringify(j, null, 2) + '\n', raw,
      f + ': roundtrip-канон');
  }
});

// --- T2: ростер + глобальная уникальность -----------------------------

test('000321.06 T2: ростер 50 строк ≡ JSON (id/имя/rarity/weight/value/skill/amount/set/free_cast/desc «<Имя>: …»); sweep по 864: id, ИМЕНА и ОПИСАНИЯ уникальны по всему каталогу (краснота: каталог 764)', () => {
  const files = itemFiles();
  assert.equal(files.length, 864, 'каталог — 864; факт: ' + files.length);
  const ids = new Map();
  const names = new Map();
  const descs = new Map();
  for (const f of files) {
    const j = JSON.parse(
      fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8'));
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
  for (const [num, id, name, rarity, weight, value, skill, amount,
      set, fc, , , , , , descTail] of ROSTER_00032106) {
    const j = JSON.parse(loadItemFile(num));
    assert.equal(j.id, id, num + ': id == ростер');
    assert.equal(j.name, name, id + ': имя == ростер');
    assert.equal(j.rarity, rarity, id + ': rarity == ростер');
    assert.equal(j.weight, weight, id + ': weight == ростер');
    assert.equal(j.value, value, id + ': value == ростер');
    assert.equal(j.desc, name + ': ' + descTail,
      id + ': desc = «<Имя>: …»');
    assert.equal(j.set === null ? undefined : j.set,
      set === null ? undefined : set, id + ': set == ростер');
    const sk = j.affixes.filter((a) => a.type === 'skill');
    assert.equal(sk.length, 1, id + ': ровно 1 skill-аффикс');
    assert.equal(sk[0].skill, skill, id + ': skill == ростер');
    assert.equal(sk[0].amount, amount, id + ': amount == ростер');
    const fcs = j.affixes.filter((a) => a.type === 'free_cast');
    assert.equal(fcs.length, fc === null ? 0 : 1,
      id + ': free_cast по ростеру');
    if (fc) assert.equal(fcs[0].spell, fc, id + ': spell == ростер');
  }
});

// --- T3: состав волны, rarity-множество, пулы, лавки ------------------

test('000321.06 T3: редкость волны РОВНО 20/14/10/4/2 в каталожном порядке; slot ring — 75 предмета (25 + 50); EQUIP_POOLS: размеры 232/161/117/46/23 (ре-пин с 212/147/107/42/21), пул ≡ live-каталогу по редкости (EQ2/LF6), прежний префикс цел, хвосты = id волны; универсам (wealth 3) видит кольца, ARMOR_SHOP/Оружейная (w=1) и барахолка кампа — нет; DROP/pickRarityTier 0-diff (краснота: в пулах новых id нет)', () => {
  const rarCount = {};
  for (const [num] of ROSTER_00032106) {
    const j = JSON.parse(loadItemFile(num));
    rarCount[j.rarity] = (rarCount[j.rarity] || 0) + 1;
  }
  assert.deepEqual(rarCount, COMPOSITION_00032106,
    'редкость волны РОВНО 20/14/10/4/2 (контракт 000230 на 50); факт: '
    + JSON.stringify(rarCount));
  let pos = 0;
  for (const tier of ['common', 'rare', 'epic', 'legendary',
    'impossible']) {
    const n = COMPOSITION_00032106[tier];
    for (let k = 0; k < n; k++) {
      const j = JSON.parse(loadItemFile(NEW_FROM + pos));
      assert.equal(j.rarity, tier,
        'каталожный порядок тиров: позиция ' + (NEW_FROM + pos)
        + ' = ' + tier);
      pos++;
    }
  }
  const all = I.allItems();
  assert.equal(all.length, 864, 'live-каталог — 864');
  assert.equal(all.filter((it) => it.kind === 'ring').length, 75,
    'kind ring — 75 (25 + 50); факт: '
    + all.filter((it) => it.kind === 'ring').length);
  assert.equal(all.filter((it) => it.slot === 'ring').length, 75,
    'slot ring — 75 (.14 T1-якорь, ре-пин 000321.06: 25 → 75)');
  const rarAll = {};
  for (const it of all) {
    if (it.rarity) rarAll[it.rarity] = (rarAll[it.rarity] || 0) + 1;
  }
  assert.equal(Object.values(rarAll).reduce((a, b) => a + b, 0), 579,
    'rarity-множество каталога — 579 (529 + 50); факт: '
    + JSON.stringify(rarAll));
  assert.deepEqual(rarAll, POOL_NEW_00032106,
    'rarity-множество РОВНО 232/161/117/46/23; факт: '
    + JSON.stringify(rarAll));
  const P = L.EQUIP_POOLS;
  for (const [t, len] of Object.entries(POOL_NEW_00032106)) {
    assert.equal(P[t].length, len,
      'пул «' + t + '» — ' + len + ' (был ' + POOL_OLD_00032106[t]
      + '); факт: ' + P[t].length
      + ' (краснота: append в пулы не сделан)');
  }
  for (const t of L.RARITY) {
    assert.deepEqual(P[t.id],
      all.filter((it) => it.rarity === t.id).map((it) => it.id),
      'пул «' + t.id + '» ≡ live-каталогу по редкости (EQ2/LF6; '
      + 'прежний префикс цел, append каталожным порядком)');
  }
  for (const tier of ['common', 'rare', 'epic', 'legendary',
    'impossible']) {
    const wave = ROSTER_00032106.filter((r) => r[3] === tier)
      .map((r) => r[1]);
    assert.deepEqual(P[tier].slice(-wave.length), wave,
      tier + '-хвост = ' + wave.length + ' новых ' + tier
      + ' каталожным порядком');
  }
  const B = require('../src/map.js').BUILDING_TYPES;
  const waveSet = new Set(ROSTER_IDS);
  let uniHits = 0;
  let armorHits = 0;
  let weaponHits = 0;
  for (const [x, y] of [[10, 20], [3, 8], [41, 13]]) {
    for (const w of [1, 3]) {
      const uni = I.makeShop(x, y, B.WEAPONS_SHOP, w);
      for (const id of Object.keys(uni.stock)) {
        if (waveSet.has(id)) uniHits++;
      }
    }
    const am = I.makeShop(x, y, B.ARMOR_SHOP, 1);
    for (const id of Object.keys(am.stock)) {
      if (waveSet.has(id)) armorHits++;
    }
    const wp = I.makeShop(x, y, B.WEAPONS_SHOP, 1);
    for (const id of Object.keys(wp.stock)) {
      if (waveSet.has(id)) weaponHits++;
    }
  }
  assert.ok(uniHits >= 1,
    'кольца попадают в сток универсама (пул allItems) хотя бы на одном '
    + 'семени; факт hits=' + uniHits);
  assert.equal(armorHits, 0,
    'ARMOR_SHOP (виды [armor]) НЕ видит kind ring — сток брони 0-diff; '
    + 'факт hits=' + armorHits);
  assert.equal(weaponHits, 0,
    'Оружейная (виды [weapon]) НЕ видит kind ring; факт hits='
    + weaponHits);
  const campRec = JSON.parse(fs.readFileSync(
    path.join(BUILDINGS_DIR, 'camp.json'), 'utf8'));
  for (const w of [2, 3]) {
    const camp = I.makeCampShop(10, 20, 1, w, campRec);
    for (const id of Object.keys(camp.stock)) {
      assert.ok(!waveSet.has(id),
        'барахолка кампа НЕ видит кольца — GOLDEN_CAMP 0-diff; факт: '
        + id + ' (w=' + w + ')');
    }
  }
  assert.equal(L.RARITY.reduce((s, t) => s + t.chance, 0), 1,
    'DROP-таблица — Σ 1 (НЕ тронута)');
  assert.equal(L.RARITY.map((t) => t.id).join(','),
    'common,rare,epic,legendary,impossible',
    'канонический порядок тиров — цел');
});

// --- T4: полосы value/weight + armor:0 --------------------------------

test('000321.06 T4: полосы новых колец ⊂ полос старых 25 (общие полосы 75 колец): value common [10,45] … impossible [1000,1600], weight [0.05,0.07]/[0.08,0.10]/[0.12,0.13]/[0.15,0.16]/[0.2,0.2]; stats.armor === 0 у ВСЕХ 75 slot-ring (контракт canon c11g — ре-пин 25 → 75); value строго неубывает внутри тира волны (краснота: колец нет)', () => {
  function all() {
    return I.allItems().filter((it) => it.slot === 'ring');
  }
  const slotRings = all();
  assert.equal(slotRings.length, 75,
    'slot-ring — 75 (25 + 50): полосы считаем по всем; факт: '
    + slotRings.length + ' (краснота: волна не добавлена)');
  for (const it of slotRings) {
    const band = VALUE_BAND_00032106[it.rarity];
    assert.ok(it.value >= band[0] && it.value <= band[1],
      it.id + ': value ' + it.value + ' в полосе ' + it.rarity
      + ' [' + band + ']');
    const wb = WEIGHT_BAND_00032106[it.rarity];
    assert.ok(it.weight >= wb[0] && it.weight <= wb[1],
      it.id + ': weight ' + it.weight + ' в полосе ' + it.rarity
      + ' [' + wb + ']');
    assert.deepEqual(it.stats, { armor: 0 },
      it.id + ': stats.armor = 0 (75 колец — canon c11g)');
  }
  let prevTier = null;
  let prevValue = -Infinity;
  for (const [num, id, , rarity, , value] of ROSTER_00032106) {
    assert.ok(num >= NEW_FROM && num <= NEW_TO, id + ': диапазон');
    if (rarity !== prevTier) {
      prevTier = rarity;
      prevValue = -Infinity;
    }
    assert.ok(value >= prevValue,
      id + ': value не убывает внутри тира ' + rarity);
    prevValue = value;
  }
});

// --- T5: affix-матрица -------------------------------------------------

test('000321.06 T5: матрица волны — Σ 50 skill-записей (РОВНО 1 skill на кольцо), покрытия = РОВНО 31 secondary-навык (каждый ≥1; точная карта повторений из ростера); amount в шкале редкости; free_cast волны РОВНО 2, ТОЛЬКО epic: icewalker → frost_walk, clay_warden → aegis; spell ∈ assets/spells и НЕ пересекается с free_cast старых колец; все 6 приоритетных (.14 §2.2) представлены (краснота: колец нет)', () => {
  const spells = spellIds();
  const oldWaveSpells = new Set(['ice_armor', 'magic_shield']);
  const skillFiles = new Map();
  for (const f of fs.readdirSync(SKILLS_DIR)
    .filter((x) => /^\d{6}\.json$/.test(x))) {
    const j = JSON.parse(
      fs.readFileSync(path.join(SKILLS_DIR, f), 'utf8'));
    skillFiles.set(j.id, j);
  }
  const coverage = {};
  const freeCast = [];
  let records = 0;
  for (const [num, id, , rarity] of ROSTER_00032106) {
    const j = JSON.parse(loadItemFile(num));
    for (const a of j.affixes) {
      if (a.type === 'skill') {
        records += 1;
        assert.ok(SKILLS_31_00032106.includes(a.skill),
          id + ': skill «' + a.skill + '» — в 31 secondary');
        assert.ok(skillFiles.has(a.skill),
          id + ': skill «' + a.skill + '» — live skill-каталог');
        assert.equal(skillFiles.get(a.skill).type, 'secondary',
          id + ': «' + a.skill + '» — secondary (первичник = '
          + 'TypeError derived(), D-04 .14)');
        coverage[a.skill] = (coverage[a.skill] || 0) + 1;
        const [lo, hi] = AFFIX_SCALE_00032106[rarity];
        assert.ok(a.amount >= lo && a.amount <= hi,
          id + ': amount ' + a.amount + ' в шкале ' + rarity
          + ' [' + lo + ', ' + hi + ']');
      } else if (a.type === 'free_cast') {
        freeCast.push({ id, rarity, spell: a.spell });
        assert.ok(spells.has(a.spell),
          id + ': spell «' + a.spell + '» ∈ assets/spells');
        assert.ok(!oldWaveSpells.has(a.spell),
          id + ': spell «' + a.spell + '» — НОВЫЙ free_cast '
          + '(не повторяет .14)');
      } else {
        assert.fail(id + ': неизвестный type affix: ' + a.type);
      }
    }
  }
  assert.equal(records, 50,
    'Σ skill-записей волны — ровно 50 (по 1 на кольцо); факт: '
    + records);
  assert.deepEqual(Object.keys(coverage).sort(),
    [...SKILLS_31_00032106].sort(),
    'покрытие — РОВНО 31 secondary-навык; факт: '
    + Object.keys(coverage).length);
  const expCov = {};
  for (const [, , , , , , skill] of ROSTER_00032106) {
    expCov[skill] = (expCov[skill] || 0) + 1;
  }
  assert.deepEqual(coverage, expCov,
    'карта повторений ≡ ростеру (упор редких навыков в epic+)');
  for (const s of ['firelord', 'icelord', 'runes', 'scholar',
    'precog', 'unkill'])
    assert.ok(coverage[s], 'приоритетный навык «' + s + '» — в матрице');
  assert.equal(freeCast.length, 2,
    'free_cast волны — ровно 2 (ТЗ: epic+ 1–2); факт: '
    + freeCast.length);
  for (const f of freeCast) {
    assert.equal(f.rarity, 'epic',
      f.id + ': free_cast — ТОЛЬКО epic; факт: ' + f.rarity);
    assert.equal(FREE_CAST_WAVE_00032106[f.id], f.spell,
      f.id + ': spell == ростер');
  }
  assert.deepEqual(Object.keys(FREE_CAST_WAVE_00032106).sort(),
    freeCast.map((f) => f.id).sort(),
    'free_cast — ровно icewalker + clay_warden');
});

// --- T6: наборы ---------------------------------------------------------

test('000321.06 T6: наборы волны — РОВНО 2 новых: moonlight (4 члена rare/epic/legendary/impossible, set_bonus {2:{armor:1}, 4:[skill meditation 0.10]} — паттерн {2,4} fate) и tide (3 члена rare/epic/legendary, {2:[skill breath 0.05], 3:[skill icelord 0.08]}); set_bonus ОДИНАКОВ у всех участников (SB13/D-03); члены — только кольца волны; старые 3 набора .14 не тронуты; всего наборов 20 / предметов с set 67 (краснота: сетов нет)', () => {
  for (const s of NEW_SETS_00032106) {
    for (const id of s.members) {
      const row = ROSTER_00032106.find((r) => r[1] === id);
      assert.ok(row, id + ': член набора — в ростере волны');
      const j = JSON.parse(loadItemFile(row[0]));
      assert.equal(j.set, s.set, id + ': set «' + s.set + '»');
      assert.deepEqual(j.set_bonus, s.bonus,
        id + ': set_bonus ≡ таблице (одинаков у всех)');
      assert.equal(j.kind, 'ring', id + ': член — кольцо');
    }
    const keys = Object.keys(s.bonus);
    for (const k of keys)
      assert.ok(['2', '3', '4'].includes(k),
        s.set + ': порог «' + k + '» ⊆ {2,3,4}');
  }
  assert.deepEqual(Object.keys(NEW_SETS_00032106[0].bonus),
    ['2', '4'],
    'moonlight — ОБА порога {2,4}; формы: 2 → объект {armor}, '
    + '4 → массив [skill]');
  assert.deepEqual(Object.keys(NEW_SETS_00032106[1].bonus),
    ['2', '3'], 'tide — пороги {2,3}');
  const all = I.allItems();
  const fate = all.filter((it) => it.set === 'fate');
  assert.equal(fate.length, 4,
    'fate (.14) — 4 члена, не тронут; факт: ' + fate.length);
  const bySet = {};
  for (const it of all) if (it.set) bySet[it.set] = (bySet[it.set] || 0) + 1;
  assert.equal(Object.keys(bySet).length, 20,
    'наборов — ровно 20 (18 + 2); факт: ' + Object.keys(bySet).length);
  assert.equal(Object.values(bySet).reduce((a, b) => a + b, 0), 67,
    'предметов с set — 67 (60 + 7); факт: '
    + Object.values(bySet).reduce((a, b) => a + b, 0));
  assert.equal(bySet.moonlight, 4, 'moonlight — 4');
  assert.equal(bySet.tide, 3, 'tide — 3');
});

// --- T7: иконки ---------------------------------------------------------

test('000321.06 T7: иконки — у 50 новых поле icon ↔ файл существует; биекция json↔svg по basename; flat-SVG 64×64: viewBox ровно «0 0 64 64», ПЕРВЫЙ элемент — тень-эллипс rgba(0,0,0,0.22), без linearGradient/radialGradient/<text/<path/<use/stroke= (паттерн 000302); sha256-уникальность против всех 831 иконок (ре-пин 000321.07: +50 зелий) (краснота: файлы не созданы)', () => {
  const hash = (p) => createHash('sha256')
    .update(fs.readFileSync(p)).digest('hex');
  const hashes = new Map();
  for (const f of fs.readdirSync(SPR_DIR)) {
    if (!f.endsWith('.svg')) continue;
    hashes.set(hash(path.join(SPR_DIR, f)), f);
  }
  assert.equal(hashes.size, 831,
    'иконок sprites/items — ровно 831 (731 + 50 колец + 50 зелий 000321.07); факт: '
    + hashes.size + ' (уникальных); (краснота: иконок нет)');
  for (const [, id] of ROSTER_00032106) {
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
    const j = JSON.parse(loadItemFile(
      ROSTER_00032106.find((r) => r[1] === id)[0]));
    assert.equal(j.icon, 'assets/sprites/items/' + f,
      f + ': биекция icon ↔ файл');
  }
  const waveBasenames = new Set(ROSTER_IDS.map((id) => id + '.svg'));
  const diskSvg = new Set(fs.readdirSync(SPR_DIR)
    .filter((f) => f.endsWith('.svg')));
  for (const b of waveBasenames)
    assert.ok(diskSvg.has(b), b + ': svg по basename id');
});

// --- T8: рецепты ---------------------------------------------------------

test('000321.06 T8: 50 рецептов — файлы по id (прежние номера 000670–000719, 000318.07: basename === id); результат покрывает НОВЫЕ кольца 1:1 (тот же порядок); id рецепта = id результата; тип-состав резьба_по_камню 25 / зачарование 25 (масштаб факта 15/13 старых); здания: резьба [rune_stone, ruins], зачарование [mage_tower]; навыки: резьба [runes], зачарование [runes + навык-аффикс результата]; «заклинания» РОВНО 1 ∈ assets/spells только у зачарования (у free_cast-колец — свой spell); «база» отсутствует; «уровень» ∈ полосе редкости результата; исходники ∈ СТАРЫЙ каталог (НОВЫХ реагентов нет); «название»/«описание» уникальны по craft; roundtrip-канон (краснота: craft 593 — рецептов нет)', () => {
  const files = recFiles();
  assert.equal(files.length, 693,
    'craft — 693 файла (593 + 50 колец + 50 зелий 000321.07); факт: ' + files.length
    + ' (краснота: рецепты не созданы)');
  const schema = JSON.parse(
    fs.readFileSync(path.join(CRAFT_DIR, 'schema.json'), 'utf8'));
  const itemNums = new Set(fs.readdirSync(ITEMS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f)).map(refNum));
  const spells = spellIds();
  const skillFileById = new Map();
  for (const f of fs.readdirSync(SKILLS_DIR)
    .filter((x) => /^\d{6}\.json$/.test(x))) {
    const j = JSON.parse(
      fs.readFileSync(path.join(SKILLS_DIR, f), 'utf8'));
    skillFileById.set(j.id, f);
  }
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
  const CANON_REC = ['id', 'название', 'тип', 'база', 'результат',
    'исходники', 'навыки', 'здания', 'заклинания', 'уровень', 'описание'];
  ROSTER_00032106.forEach(([num, id, , rarity, , , skill, , , fc,
      recType, recName, level, spell, sources, , recDesc], i) => {
    const recNum = REC_FROM + i;
    const f = id + '.json';
    assert.ok(files.includes(f),
      'рецепт кольца (прежний номер ' + String(recNum).padStart(6, '0')
      + ') — файл ' + f + ' ∈ assets/craft (000318.07: имя файла === id, '
      + 'окно позиций по номерам заменено свипом присутствия + '
      + 'basename === id; memory/000318.07-craft-slug-rename.md)');
    const raw = loadRecFile(id);
    const j = JSON.parse(raw);
    assert.deepEqual(validateData(schema, j, f), [], f + ': схема');
    assert.equal(j['id'], id, f + ': id рецепта = id результата');
    assert.equal(j['результат']['предмет'],
      'assets/items/' + String(num).padStart(6, '0') + '.json',
      f + ': результат — предмет волны ' + num);
    assert.equal(j['результат']['количество'], 1, f + ': количество 1');
    const type = recType === 'r' ? 'резьба_по_камню' : 'зачарование';
    assert.equal(j['тип'], type, f + ': тип «' + type + '»');
    assert.equal(j['база'], undefined, f + ': «база» отсутствует');
    assert.equal(j['название'], recName, f + ': название == ростер');
    assert.equal(j['описание'], recDesc, f + ': описание == ростер');
    const expectedSk = recType === 'r'
      ? ['000027']
      : ['000027', skillFileById.get(skill).slice(0, 6)];
    assert.deepEqual(j['навыки'].map(refNum).sort(),
      [...expectedSk].sort(),
      f + ': навыки ' + expectedSk.join(',') + '; факт: '
      + j['навыки'].map(refNum).join(','));
    const expectedBld = recType === 'r'
      ? ['assets/buildings/rune_stone.json',
        'assets/buildings/ruins.json']
      : ['assets/buildings/mage_tower.json'];
    assert.deepEqual(j['здания'], expectedBld, f + ': здания');
    if (recType === 'e') {
      assert.equal(j['заклинания'].length, 1,
        f + ': зачарование — РОВНО 1 заклинание');
      assert.equal(j['заклинания'][0], spell, f + ': spell == ростер');
      assert.ok(spells.has(j['заклинания'][0]),
        f + ': spell ∈ assets/spells');
      if (fc) assert.equal(j['заклинания'][0], fc,
        f + ': free_cast-кольцо — рецепт с тем же spell');
    } else {
      assert.equal(j['заклинания'], undefined,
        f + ': резьба — без «заклинания»');
    }
    const [lo, hi] = LEVEL_BAND_00032106[rarity];
    assert.equal(j['уровень'], level, f + ': уровень == ростер');
    assert.ok(j['уровень'] >= lo && j['уровень'] <= hi,
      f + ': уровень ' + j['уровень'] + ' ∈ полосе ' + rarity
      + ' [' + lo + ', ' + hi + ']');
    assert.ok(j['исходники'].length >= 1 && j['исходники'].length <= 8,
      f + ': исходники 1–8');
    for (const s of j['исходники']) {
      const sn = refNum(s['предмет']);
      assert.ok(itemNums.has(sn),
        f + ': исходник ' + sn + ' ∈ каталог');
      assert.ok(Number(sn) < NEW_FROM,
        f + ': исходник ' + sn + ' — СТАРЫЙ (новых реагентов нет)');
      assert.ok(s['количество'] >= 1 && s['количество'] <= 8,
        f + ': количество ' + s['количество']);
    }
    assert.deepEqual(sources.map(([sn, q]) =>
      [String(sn).padStart(6, '0'), q]),
      j['исходники'].map((s) => [refNum(s['предмет']),
        s['количество']]),
      f + ': исходники ≡ ростеру');
    assert.ok(Number(refNum(j['результат']['предмет'])) >= NEW_FROM
      && Number(refNum(j['результат']['предмет'])) <= NEW_TO,
      f + ': результат — в диапазоне волны');
    const order = Object.keys(j);
    const oi = order.map((k) => CANON_REC.indexOf(k));
    assert.ok(oi.every((x) => x >= 0),
      f + ': только схемные ключи в каноне; факт: ' + order.join(','));
    assert.deepEqual(oi, [...oi].sort((a, b) => a - b),
      f + ': порядок ключей — канон; факт: ' + order.join(','));
    assert.equal(JSON.stringify(j, null, 2) + '\n', raw,
      f + ': roundtrip-канон');
  });
});

// --- T9: зеркала ----------------------------------------------------------

test('000321.06 T9: зеркала — src/items-data.js содержит 50 новых колец ≡ JSON (getItem резолвится); src/craft-data.js содержит 50 рецептов с резолвом результат/исходники/навыки/здания в id (краснота: зеркало не регенерировано)', () => {
  assert.equal(ITD.ITEMS.length, 864,
    'items-data — 864; факт: ' + ITD.ITEMS.length);
  const mirrorById = new Map(ITD.ITEMS.map((it) => [it.id, it]));
  for (const [num, id] of ROSTER_00032106) {
    const j = JSON.parse(loadItemFile(num));
    const m = mirrorById.get(id);
    assert.ok(m, 'items-data: предмет «' + id + '»');
    assert.deepEqual(m, j, id + ': зеркало ≡ JSON поэлементно');
    assert.equal(I.getItem(id).name, j.name,
      id + ': getItem резолвится');
  }
  assert.equal(CRD.CRAFT.length, 693,
    'craft-data — 693; факт: ' + CRD.CRAFT.length);
  ROSTER_00032106.forEach(([, id]) => {
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
    assert.deepEqual(m['заклинания'], j['заклинания'],
      f + ': зеркало — «заклинания» (slug) целы');
  });
});

// --- T10: счётчики/канарейки ----------------------------------------------

test('000321.06 T10: регресс-канарейки — каталог 864 ≡ items-data (ре-пин 000321.07: +50 зелий); ring 75/75, weapon 72 / armor 257 / tool 60 / artifact 63 / shield 62 (не выросли), spell_scroll 161; slot — у 589, «прочих» без slot — 275 (ре-пин 000321.07: +50 зелий без slot); base_price РОВНО у 252 (кольца не торгуют; ре-пин 000321.07: +50 зелий); free_cast — 28 (26 + 2 epic); наборы 20 / 67 предметов; skill-аффиксов 589 на 31 навык; craft 693: зачарование 244 / кузнечное 173 / столярное 114 / резьба 86 / алхимия 74 / рунопись 2 (ре-пин 000321.07: +50 алхимии); иконки 831; stroke= — ровно 46 legacy (краснота: каталог 764)', () => {
  const all = I.allItems();
  assert.equal(all.length, 864);
  assert.equal(ITD.ITEMS.length, 864, 'items-data ≡ каталог (864)');
  const byKind = {};
  for (const it of all) byKind[it.kind] = (byKind[it.kind] || 0) + 1;
  assert.equal(byKind.ring, 75, 'ring — 75 (25 + 50); факт: '
    + byKind.ring);
  assert.equal(byKind.weapon, 72, 'weapon — 72 (не вырос)');
  assert.equal(byKind.armor, 257, 'armor — 257 (не вырос)');
  assert.equal(byKind.tool, 60, 'tool — 60 (не вырос)');
  assert.equal(byKind.artifact, 63, 'artifact — 63 (не вырос)');
  assert.equal(byKind.shield, 62, 'shield — 62 (не вырос)');
  assert.equal(byKind.spell_scroll, 161,
    'spell_scroll — 161 (ре-пин 000348)');
  assert.equal(all.filter((it) => 'base_price' in it).length, 252,
    'base_price — ровно у 252 (кольца не торгуют; ре-пин 000321.07: +50 зелий); факт: '
    + all.filter((it) => 'base_price' in it).length);
  assert.equal(all.filter((it) => 'slot' in it).length, 589,
    'slot — у 589 (539 + 50); факт: '
    + all.filter((it) => 'slot' in it).length);
  assert.equal(all.filter((it) => !('slot' in it)).length, 275,
    '«прочих» без slot — 275 (ре-пин 000321.07: +50 зелий без slot); факт: '
    + all.filter((it) => !('slot' in it)).length);
  const fc = all.filter((it) => (it.affixes || [])
    .some((a) => a.type === 'free_cast'));
  assert.equal(fc.length, 28, 'free_cast — 28 (26 + 2); факт: '
    + fc.length);
  assert.equal(fc.filter((it) => it.rarity === 'epic').length, 25,
    'free_cast epic — 25 (23 + 2)');
  const withSet = all.filter((it) => it.set);
  assert.equal(withSet.length, 67,
    'предметов с set — 67 (60 + 7); факт: ' + withSet.length);
  assert.equal(new Set(withSet.map((it) => it.set)).size, 20,
    'наборов — 20 (18 + 2)');
  let skillAffixes = 0;
  const skillSeen = new Set();
  for (const it of all) {
    for (const a of it.affixes || []) {
      if (a.type === 'skill') {
        skillAffixes += 1;
        skillSeen.add(a.skill);
      }
    }
  }
  assert.equal(skillAffixes, 589,
    'skill-аффиксов — 589 (539 + 50); факт: ' + skillAffixes);
  assert.equal(skillSeen.size, 31,
    'навыков в аффиксах — 31; факт: ' + skillSeen.size);
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

// Задача 000321.01 (1-я из 13 дочерних 000321) — волна оружия
// right_hand: 50 предметов kind=weapon (slot right_hand, подтипы
// sword/heavy/bow/staff), 50 рецептов assets/craft, 50 flat-иконок
// 64×64 (паттерн 000302/000335 — иконки В ЭТОЙ дочерней: equip без
// icon ломает E-канон «иконки у всех», промежуточный master был бы
// красен). Редкость — 20/14/10/4/2 (двойной паттерн волны 10/7/5/2/1,
// контракт 000230). Пулы EQUIP_POOLS — append КОНЦОМ тиров каталожным
// порядком (data-правка loot-equip-data.js — единственный src-файл
// кроме зеркал); DROP-таблица/pickRarityTier/rollVictoryLoot — 0-diff
// (попадание в лут-путь — тестом T8). Контракт — memory/000321-
// weapon-items.md + сводка батча memory/000321-items-batch.md.
// kind=node; require — node-модули + src-модули (зеркала/пулы) +
// tests/json-schema.js (без vm).
//
// Нумерация (резерв волны, факт диска на базе):
//   предметы 000514–000563; рецепты 000420–000469; иконки —
//   assets/sprites/items/<id>.svg.

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

const NEW_FROM = 514;
const NEW_TO = 563;
const REC_FROM = 420;
const REC_TO = 469;

// --- Ростер волны (источник: ТЗ + анализ; фиксируется здесь и в
// memory/000321-weapon-items.md). Строка:
// [номер, id, имя, подтип, редкость, damage, value, weight,
//  skill-аффикс, amount, free_cast (spell|null)]
const ROSTER_00032101 = [
  [514, 'copper_short_sword', 'Медный короткий меч', 'sword', 'common', 3, 20, 1.3, 'swordsman', 0.02, null],
  [515, 'drill_sword', 'Учебный меч', 'sword', 'common', 3, 18, 1.5, 'swordsman', 0.02, null],
  [516, 'poacher_dirk', 'Кинжал браконьера', 'sword', 'common', 3, 19, 1.2, 'swordsman', 0.03, null],
  [517, 'kopis_curved', 'Кривой копис', 'sword', 'common', 4, 28, 1.5, 'swordsman', 0.03, null],
  [518, 'legion_sword', 'Легионный меч', 'sword', 'common', 4, 26, 1.6, 'swordsman', 0.03, null],
  [519, 'battered_falx', 'Потёрнутый фалкс', 'sword', 'common', 4, 24, 1.7, 'swordsman', 0.04, null],
  [520, 'merchant_sword', 'Купеческий меч', 'sword', 'common', 3, 22, 1.4, 'swordsman', 0.02, null],
  [521, 'patrol_sword', 'Дозорный меч', 'sword', 'common', 5, 32, 1.8, 'swordsman', 0.04, null],
  [522, 'lumber_machete', 'Мачете лесоруба', 'sword', 'common', 5, 30, 1.9, 'swordsman', 0.04, null],
  [523, 'sapling_bow', 'Лук из поросли', 'bow', 'common', 3, 18, 1.3, 'archer', 0.02, null],
  [524, 'trade_bow', 'Торговый лук', 'bow', 'common', 3, 20, 1.4, 'archer', 0.02, null],
  [525, 'patrol_bow', 'Дозорный лук', 'bow', 'common', 4, 26, 1.5, 'archer', 0.03, null],
  [526, 'poacher_bow', 'Лук браконьера', 'bow', 'common', 4, 28, 1.6, 'archer', 0.03, null],
  [527, 'yew_longbow', 'Тисовый длинный лук', 'bow', 'common', 5, 34, 1.7, 'archer', 0.04, null],
  [528, 'copper_maul', 'Медная кувалда', 'heavy', 'common', 4, 24, 2.8, 'heavy', 0.02, null],
  [529, 'stone_mace', 'Каменная булава', 'heavy', 'common', 4, 26, 3.0, 'heavy', 0.03, null],
  [530, 'flanged_mace', 'Железный чекан', 'heavy', 'common', 5, 32, 3.1, 'heavy', 0.04, null],
  [531, 'lumber_axe', 'Топор лесоруба', 'heavy', 'common', 5, 30, 2.9, 'heavy', 0.04, null],
  [532, 'miner_pickaxe', 'Кирка рудокопа', 'heavy', 'common', 4, 28, 3.0, 'heavy', 0.03, null],
  [533, 'campaign_maul', 'Походная кувалда', 'heavy', 'common', 6, 40, 3.2, 'heavy', 0.05, null],
  [534, 'silvered_sword', 'Меч с серебряной кромкой', 'sword', 'rare', 6, 85, 1.8, 'swordsman', 0.06, null],
  [535, 'legion_gladius', 'Гладиус легиона', 'sword', 'rare', 6, 90, 1.9, 'swordsman', 0.07, null],
  [536, 'arming_sword', 'Рыцарский меч', 'sword', 'rare', 7, 105, 2.0, 'swordsman', 0.08, null],
  [537, 'rebel_brand', 'Меч повстанца', 'sword', 'rare', 6, 80, 1.7, 'swordsman', 0.06, null],
  [538, 'warder_sword', 'Меч стражи', 'sword', 'rare', 7, 110, 2.1, 'swordsman', 0.08, null],
  [539, 'silver_inlaid_bow', 'Лук с серебряной насечкой', 'bow', 'rare', 6, 88, 1.7, 'archer', 0.06, null],
  [540, 'long_warbow', 'Длинный военный лук', 'bow', 'rare', 7, 108, 2.0, 'archer', 0.08, null],
  [541, 'scout_bow', 'Разведочный лук', 'bow', 'rare', 6, 78, 1.6, 'archer', 0.05, null],
  [542, 'silvered_mace', 'Серебряная булава', 'heavy', 'rare', 6, 82, 3.2, 'heavy', 0.06, null],
  [543, 'storm_maul', 'Штурмовая кувалда', 'heavy', 'rare', 7, 112, 3.5, 'heavy', 0.08, null],
  [544, 'siege_axe', 'Осадный топор', 'heavy', 'rare', 7, 100, 3.4, 'heavy', 0.07, null],
  [545, 'silver_bound_staff', 'Посох, окованный серебром', 'staff', 'rare', 6, 95, 2.2, 'scholar', 0.07, null],
  [546, 'warden_quarterstaff', 'Стражевой посох', 'staff', 'rare', 6, 88, 2.1, 'nature', 0.06, null],
  [547, 'vine_staff', 'Лозовый посох', 'staff', 'rare', 5, 72, 2.0, 'alchemy', 0.05, null],
  [548, 'gilded_broadsword', 'Позолоченный меч', 'sword', 'epic', 8, 240, 2.2, 'swordsman', 0.14, null],
  [549, 'damascus_blade', 'Дамасский клинок', 'sword', 'epic', 9, 285, 2.3, 'swordsman', 0.16, null],
  [550, 'gilt_war_hammer', 'Золочёный боевой молот', 'heavy', 'epic', 8, 250, 3.8, 'heavy', 0.14, null],
  [551, 'thunder_maul', 'Грозовой молот', 'heavy', 'epic', 9, 295, 4.0, 'heavy', 0.17, null],
  [552, 'goldstring_bow', 'Лук с золотопрядной тетивой', 'bow', 'epic', 8, 235, 2.0, 'archer', 0.13, null],
  [553, 'windfletch_bow', 'Ветряной лук', 'bow', 'epic', 9, 290, 2.2, 'archer', 0.16, null],
  [554, 'tempest_staff', 'Посох бури', 'staff', 'epic', 8, 260, 2.5, 'nature', 0.15, 'hurricane'],
  [555, 'pyre_staff', 'Посох кострища', 'staff', 'epic', 8, 255, 2.4, 'firelord', 0.15, 'wall_of_fire'],
  [556, 'hoarfrost_staff', 'Посох изморози', 'staff', 'epic', 9, 300, 2.6, 'icelord', 0.18, null],
  [557, 'archivist_staff', 'Посох архивариуса', 'staff', 'epic', 7, 220, 2.3, 'scholar', 0.12, null],
  [558, 'dawnedge_blade', 'Рассветный клинок', 'sword', 'legendary', 11, 620, 2.5, 'swordsman', 0.28, null],
  [559, 'gate_hammer', 'Молот горных врат', 'heavy', 'legendary', 12, 690, 4.2, 'heavy', 0.32, null],
  [560, 'aurora_bow', 'Лук северного сияния', 'bow', 'legendary', 11, 640, 2.3, 'archer', 0.30, null],
  [561, 'starvault_staff', 'Посох звёздного свода', 'staff', 'legendary', 12, 680, 2.9, 'runes', 0.31, null],
  [562, 'fate_cleaver', 'Клинок, рассекающий судьбу', 'sword', 'impossible', 14, 1480, 2.6, 'swordsman', 0.42, null],
  [563, 'genesis_staff', 'Посох сотворения', 'staff', 'impossible', 13, 1380, 3.0, 'nature', 0.40, null],
];

const ROSTER_IDS_00032101 = ROSTER_00032101.map((r) => r[1]);

// Композиция волны (ТЗ: 20/14/10/4/2; распределение подтипов —
// анализ: sword 18 / heavy 12 / bow 11 / staff 9; staff без common —
// посох по модели 000230.12 магический).
const COMPOSITION_00032101 = {
  common: 20, rare: 14, epic: 10, legendary: 4, impossible: 2,
};
const SUBTYPES_00032101 = { sword: 18, heavy: 12, bow: 11, staff: 9 };

// Полосы damage/value/weight по редкости (прецедент 000230.12-полосы
// + legacy-границы: common dmg 3–6 v 18–45 … impossible 13–14
// v 1300–1500); вес — по виду (факт диска для heavy-полосы .12).
const DAMAGE_BAND_00032101 = {
  common: [3, 6], rare: [5, 8], epic: [7, 10], legendary: [11, 12],
  impossible: [13, 14],
};
const VALUE_BAND_00032101 = {
  common: [18, 45], rare: [65, 125], epic: [200, 310],
  legendary: [500, 700], impossible: [1300, 1500],
};
const WEIGHT_BAND_00032101 = {
  common: { sword: [1.2, 2.2], bow: [1.3, 2.0], heavy: [2.5, 3.2] },
  rare: { sword: [1.4, 2.4], bow: [1.5, 2.2], heavy: [3.0, 3.6],
    staff: [2.0, 2.4] },
  epic: { sword: [1.6, 2.6], bow: [1.7, 2.4], heavy: [3.4, 4.1],
    staff: [2.3, 2.7] },
  legendary: { sword: [1.8, 2.8], bow: [1.9, 2.5], heavy: [3.7, 4.3],
    staff: [2.6, 3.0] },
  impossible: { sword: [2.0, 3.2], staff: [2.8, 3.2] },
};
// Шкала amount (research §6, матрица 000230.03):
const AFFIX_SCALE_00032101 = {
  common: [0.02, 0.05], rare: [0.05, 0.10], epic: [0.10, 0.20],
  legendary: [0.20, 0.35], impossible: [0.35, 0.45],
};
// Skill-маппинг подтипа (меч/лук/тяжёлое — «свой» навык владения;
// посох — школа из множества ниже):
const SUBTYPE_SKILL_00032101 = {
  sword: 'swordsman', bow: 'archer', heavy: 'heavy',
};
// Школы посохов: магическая right_hand-часть матрицы 000230.03
// {firelord icelord alchemy runes scholar} + nature — исключение из
// матрицы (в каталоге есть школа «Природа» assets/skills/000042 без
// своего школьного вторичного навыка-мастера; аффикс резолвится во
// вторичный nature 000031; tempest_staff → hurricane — школа
// «природа», genesis_staff — создание/призыв, warden_quarterstaff —
// ясеневое древко). Решение зафиксировано в
// memory/000321-weapon-items.md §1 (прецедент оформления D8 forge@tool).
const STAFF_SKILLS_00032101 = new Set(['firelord', 'icelord',
  'alchemy', 'runes', 'scholar', 'nature']);

// Порядок ключей equip-канона (1:1 с 000345; icon МЕЖДУ stats и slot
// — ловушка пина 000335):
const KEY_ORDER_00032101 = ['id', 'name', 'kind', 'subtype', 'weight',
  'value', 'desc', 'stats', 'icon', 'slot', 'rarity', 'affixes'];

// Рецепты (000420–000469 — тот же порядок, что ростер; результат
// 000420 → первый предмет). Строка: [номер, id, тип, уровень,
// заклинания (для зачарования; null иначе)]. Состав типа — решение
// дизайнера (фиксация в memory): «кузнечное_дело» из ТЗ — для
// smithing-подтипов (sword+heavy = 30); посохи и не-common луки —
// зачарование (инвариант 000191.14: ≥1 заклинание; прецедент 000008
// «frost_bolt» и волны .12), common-луки — столярное (прецедент
// 000011 «Тёска деревянного меча»).
const RECIPES_00032101 = [
  [420, 'copper_short_sword', 'кузнечное_дело', 4, null],
  [421, 'drill_sword', 'кузнечное_дело', 3, null],
  [422, 'poacher_dirk', 'кузнечное_дело', 3, null],
  [423, 'kopis_curved', 'кузнечное_дело', 5, null],
  [424, 'legion_sword', 'кузнечное_дело', 5, null],
  [425, 'battered_falx', 'кузнечное_дело', 5, null],
  [426, 'merchant_sword', 'кузнечное_дело', 4, null],
  [427, 'patrol_sword', 'кузнечное_дело', 6, null],
  [428, 'lumber_machete', 'кузнечное_дело', 6, null],
  [429, 'sapling_bow', 'столярное_дело', 2, null],
  [430, 'trade_bow', 'столярное_дело', 3, null],
  [431, 'patrol_bow', 'столярное_дело', 5, null],
  [432, 'poacher_bow', 'столярное_дело', 5, null],
  [433, 'yew_longbow', 'столярное_дело', 7, null],
  [434, 'copper_maul', 'кузнечное_дело', 5, null],
  [435, 'stone_mace', 'кузнечное_дело', 5, null],
  [436, 'flanged_mace', 'кузнечное_дело', 6, null],
  [437, 'lumber_axe', 'кузнечное_дело', 6, null],
  [438, 'miner_pickaxe', 'кузнечное_дело', 5, null],
  [439, 'campaign_maul', 'кузнечное_дело', 8, null],
  [440, 'silvered_sword', 'кузнечное_дело', 16, null],
  [441, 'legion_gladius', 'кузнечное_дело', 17, null],
  [442, 'arming_sword', 'кузнечное_дело', 20, null],
  [443, 'rebel_brand', 'кузнечное_дело', 15, null],
  [444, 'warder_sword', 'кузнечное_дело', 21, null],
  [445, 'silver_inlaid_bow', 'зачарование', 16, ['spark']],
  [446, 'long_warbow', 'зачарование', 20, ['hail']],
  [447, 'scout_bow', 'зачарование', 14, ['flame_strike']],
  [448, 'silvered_mace', 'кузнечное_дело', 16, null],
  [449, 'storm_maul', 'кузнечное_дело', 22, null],
  [450, 'siege_axe', 'кузнечное_дело', 19, null],
  [451, 'silver_bound_staff', 'зачарование', 18, ['shatter']],
  [452, 'warden_quarterstaff', 'зачарование', 16, ['barkskin']],
  [453, 'vine_staff', 'зачарование', 13, ['vine']],
  [454, 'gilded_broadsword', 'кузнечное_дело', 38, null],
  [455, 'damascus_blade', 'кузнечное_дело', 44, null],
  [456, 'gilt_war_hammer', 'кузнечное_дело', 39, null],
  [457, 'thunder_maul', 'кузнечное_дело', 46, null],
  [458, 'goldstring_bow', 'зачарование', 40, ['sunfire']],
  [459, 'windfletch_bow', 'зачарование', 45, ['hurricane']],
  [460, 'tempest_staff', 'зачарование', 42, ['hurricane']],
  [461, 'pyre_staff', 'зачарование', 41, ['wall_of_fire']],
  [462, 'hoarfrost_staff', 'зачарование', 48, ['rime_bolt']],
  [463, 'archivist_staff', 'зачарование', 36, ['mend']],
  [464, 'dawnedge_blade', 'кузнечное_дело', 70, null],
  [465, 'gate_hammer', 'кузнечное_дело', 74, null],
  [466, 'aurora_bow', 'зачарование', 68, ['stun_of_light']],
  [467, 'starvault_staff', 'зачарование', 72, ['circle_of_light']],
  [468, 'fate_cleaver', 'кузнечное_дело', 96, null],
  [469, 'genesis_staff', 'зачарование', 97, ['life_bloom']],
];
const TYPE_MIX_00032101 = {
  'кузнечное_дело': 30, 'зачарование': 15, 'столярное_дело': 5,
};
// «уровень» ∈ диапазону редкости РЕЗУЛЬТАТА (конвенция
// RARITY_LEVEL_RANGE_00023008, craft.test.js):
const LEVEL_BAND_00032101 = {
  common: [1, 10], rare: [10, 30], epic: [30, 60], legendary: [60, 90],
  impossible: [90, 100],
};
// Здания по типу (факт каталога рецептов): кузнечное common — [8];
// кузнечное rare+ — [8,25]; столярное — [5]; зачарование — [18].
const REC_BUILDINGS_00032101 = {
  common_smith: ['000008'], smith: ['000008', '000025'],
  carp: ['000005'], ench: ['000018'],
};

const NEW_FILES = [];
for (let n = NEW_FROM; n <= NEW_TO; n++) {
  NEW_FILES.push(String(n).padStart(6, '0') + '.json');
}

function refNum(ref) {
  const m = /(\d{6})\.json$/.exec(ref);
  return m ? m[1] : null;
}
function loadItemFile(num) {
  const f = String(num).padStart(6, '0') + '.json';
  const p = path.join(ITEMS_DIR, f);
  assert.ok(fs.existsSync(p),
    'assets/items/' + f + ' существует (краснота: каталог 513 — '
    + 'предмет волны не создан)');
  return fs.readFileSync(p, 'utf8');
}
function skillIds() {
  return new Set(fs.readdirSync(SKILLS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .map((f) => JSON.parse(fs.readFileSync(path.join(SKILLS_DIR, f), 'utf8')).id));
}
function spellIds() {
  return new Set(fs.readdirSync(SPELLS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .map((f) => JSON.parse(fs.readFileSync(path.join(SPELLS_DIR, f), 'utf8')).id));
}

// --- T1: каталог и форма 50 предметов ------------------------------

test('000321.01 T1: каталог — ровно 613 файла 000001–000613 подряд (ре-пин 000321.02: +50 брони); 50 новых (000514–000563) — kind weapon, slot right_hand, subtype ∈ enum-4 схемы, полный equip-набор полей, порядок ключей = канон 000345 (icon МЕЖДУ stats и slot), roundtrip-канон stringify(…,2)+\\n, валидность по assets/items/schema.json (краснота: каталог 513 — волна не добавлена)', () => {
  const files = fs.readdirSync(ITEMS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f)).sort();
  assert.equal(files.length, 613,
    'каталог — 613 файла (513 + 50 оружия 000321.01 + 50 брони '
    + '000321.02); факт: '
    + files.length + ' (краснота: волна не добавлена)');
  const schema = JSON.parse(
    fs.readFileSync(path.join(ITEMS_DIR, 'schema.json'), 'utf8'));
  const subtypeEnum = schema.properties.subtype.enum;
  assert.deepEqual(subtypeEnum, ['sword', 'bow', 'heavy', 'staff'],
    'enum подтипов схемы — sword/bow/heavy/staff (факт)');
  for (const [num, id] of ROSTER_00032101) {
    const f = String(num).padStart(6, '0') + '.json';
    assert.equal(files[num - 1], f,
      'каталожный порядок: позиция ' + num + ' — ' + f);
    const raw = loadItemFile(num);
    const j = JSON.parse(raw);
    assert.deepEqual(validateData(schema, j, f), [], f + ': схема');
    assert.equal(j.id, id, f + ': id «' + id + '»');
    assert.equal(j.kind, 'weapon', f + ': kind weapon');
    assert.equal(j.slot, 'right_hand', f + ': slot right_hand');
    assert.ok(subtypeEnum.includes(j.subtype),
      f + ': subtype в enum; факт: ' + j.subtype);
    assert.deepEqual(Object.keys(j), KEY_ORDER_00032101,
      f + ': порядок ключей = канон equip');
    assert.deepEqual(j.stats, { damage: j.stats.damage },
      f + ': stats — ровно { damage }');
    assert.equal(j.icon, 'assets/sprites/items/' + id + '.svg',
      f + ': icon = assets/sprites/items/<id>.svg');
    assert.equal(j.base_price, undefined,
      f + ': base_price НЕТ (крафтовое оружие, магазин от value)');
    assert.equal(j.set, undefined, f + ': set нет');
    assert.equal(j.tier, undefined, f + ': tier нет');
    assert.equal(JSON.stringify(j, null, 2) + '\n', raw,
      f + ': roundtrip-канон');
  }
});

// --- T2: композиция и аффиксы --------------------------------------

test('000321.01 T2: композиция волны — редкость РОВНО 20/14/10/4/2, подтипы РОВНО sword 18 / heavy 12 / bow 11 / staff 9; ≥1 аффикс, ровно 1 skill-аффикс (sword→swordsman, bow→archer, heavy→heavy, staff — школа ∈ {firelord/icelord/alchemy/runes/scholar} + nature — исключение из матрицы зафиксировано memory/000321-weapon-items.md, аффикс == колонка ростера); free_cast — ровно 2, оба epic, spell ∈ каталог assets/spells; amount в шкале §6 по редкости (краснота: счётчик 0 — волна не добавлена)', () => {
  const rarCount = {};
  const subCount = {};
  const skillSet = skillIds();
  const spells = spellIds();
  const freeCast = [];
  for (const [num, id, name, subtype, rarity, damage, value, weight,
      skill, amount, fc] of ROSTER_00032101) {
    const j = JSON.parse(loadItemFile(num));
    rarCount[j.rarity] = (rarCount[j.rarity] || 0) + 1;
    subCount[j.subtype] = (subCount[j.subtype] || 0) + 1;
    assert.ok(Array.isArray(j.affixes) && j.affixes.length >= 1,
      id + ': ≥1 аффикс');
    const skills = j.affixes.filter((a) => a.type === 'skill');
    const fcs = j.affixes.filter((a) => a.type === 'free_cast');
    assert.equal(skills.length, 1, id + ': ровно 1 skill-аффикс');
    assert.equal(fcs.length, j.affixes.length - 1,
      id + ': остальные — только free_cast');
    if (SUBTYPE_SKILL_00032101[subtype]) {
      assert.equal(skills[0].skill, SUBTYPE_SKILL_00032101[subtype],
        id + ': skill «' + SUBTYPE_SKILL_00032101[subtype]
        + '» для подтипа ' + subtype);
    } else {
      assert.equal(subtype, 'staff',
        id + ': подтип вне sword/bow/heavy — только staff');
      assert.ok(STAFF_SKILLS_00032101.has(skills[0].skill),
        id + ': школа посоха «' + skills[0].skill + '» вне'
        + ' {firelord,icelord,alchemy,runes,scholar} + nature'
        + ' (исключение матрицы — memory/000321-weapon-items.md §1)');
    }
    assert.equal(skills[0].skill, skill,
      id + ': аффикс skill == колонка skill ростера');
    assert.ok(skillSet.has(skills[0].skill),
      id + ': skill ∈ каталогу assets/skills');
    const [alo, ahi] = AFFIX_SCALE_00032101[j.rarity];
    assert.ok(skills[0].amount >= alo && skills[0].amount <= ahi,
      id + ': amount ' + skills[0].amount + ' в шкале ' + j.rarity
      + ' ' + alo + '–' + ahi);
    for (const a of fcs) {
      assert.ok(spells.has(a.spell), id + ': free_cast spell ∈ каталогу');
      assert.equal(j.rarity, 'epic',
        id + ': free_cast — не ниже epic (конвенция 000230); здесь — ровно epic');
      freeCast.push(a.spell);
    }
  }
  assert.deepEqual(rarCount, COMPOSITION_00032101,
    'редкость волны РОВНО 20/14/10/4/2 (контракт 000230 на 50); факт: '
    + JSON.stringify(rarCount));
  assert.deepEqual(subCount, SUBTYPES_00032101,
    'подтипы РОВНО sword 18 / heavy 12 / bow 11 / staff 9; факт: '
    + JSON.stringify(subCount));
  assert.equal(freeCast.length, 2,
    'free_cast в волне — ровно 2 (прецедент .12); факт: '
    + freeCast.length);
});

// --- T3: уникальность и полосы --------------------------------------

test('000321.01 T3: уникум id и имён — sweep против ВСЕХ 613 файлов каталога (id/имя не пересекаются со старыми 513 и внутри волны); desc уникальны против всего каталога; damage/value/weight в полосах таблицы по редкости (краснота: каталог 513)', () => {
  const files = fs.readdirSync(ITEMS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f)).sort();
  assert.equal(files.length, 613, 'каталог — 613; факт: ' + files.length);
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
  for (const [num, id, name, subtype, rarity] of ROSTER_00032101) {
    const j = JSON.parse(loadItemFile(num));
    const [dlo, dhi] = DAMAGE_BAND_00032101[rarity];
    assert.ok(j.stats.damage >= dlo && j.stats.damage <= dhi,
      id + ': damage ' + j.stats.damage + ' в полосе ' + rarity + ' '
      + dlo + '–' + dhi);
    const [vlo, vhi] = VALUE_BAND_00032101[rarity];
    assert.ok(j.value >= vlo && j.value <= vhi,
      id + ': value ' + j.value + ' в полосе ' + rarity + ' '
      + vlo + '–' + vhi);
    const [wlo, whi] = WEIGHT_BAND_00032101[rarity][j.subtype];
    assert.ok(j.weight >= wlo && j.weight <= whi,
      id + ': weight ' + j.weight + ' в полосе ' + rarity + '/'
      + j.subtype + ' ' + wlo + '–' + whi);
    assert.ok(j.desc.length > 0, id + ': desc непустая');
  }
});

// --- T4: рецепты -----------------------------------------------------

test('000321.01 T4: 50 рецептов 000420–000469 подряд; результат покрывает НОВЫЕ предметы 1:1 (тот же порядок); id рецепта = id результата (конвенция); тип-состав РОВНО кузнечное 30 / зачарование 15 / столярное 5; здания по типу (common-кузнечное [8], кузнечное rare+ [8,25], столярное [5], зачарование [18]); у каждого зачарования «заклинания» ≥1 ∈ каталог; «база» отсутствует (базовые рецепты); навыки/исходники/здания ∈ каталогу (динамический sweep); «уровень» ∈ диапазону редкости результата (краснота: каталог craft 343 — рецептов нет)', () => {
  const files = fs.readdirSync(CRAFT_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f)).sort();
  assert.equal(files.length, 443,
    'craft — 443 файла (343 + 50 рецептов 000321.01 + 50 рецептов '
    + '000321.02); факт: '
    + files.length + ' (краснота: рецепты не созданы)');
  const schema = JSON.parse(
    fs.readFileSync(path.join(CRAFT_DIR, 'schema.json'), 'utf8'));
  const itemFiles = new Set(fs.readdirSync(ITEMS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f)));
  const skills = new Set(fs.readdirSync(SKILLS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f)));
  const buildings = new Set(fs.readdirSync(BUILDINGS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f)));
  const spells = spellIds();
  const typeCount = {};
  const results = [];
  for (const [num, id, тип, level, spellz] of RECIPES_00032101) {
    const f = String(num).padStart(6, '0') + '.json';
    assert.equal(files[files.length - 100 + num - RECIPES_00032101[0][0]], f,
      'каталожный порядок: позиция ' + num + ' — ' + f + ' ' +
      '(ре-пин 000321.02: рецепты брони 000470–000519 — новый ' +
      'конец каталога, окно сфиксировано по номеру)');
    const raw = fs.readFileSync(path.join(CRAFT_DIR, f), 'utf8');
    const j = JSON.parse(raw);
    assert.deepEqual(validateData(schema, j, f), [], f + ': схема');
    assert.equal(j['id'], id, f + ': id рецепта = id результата');
    assert.equal(j['тип'], тип, f + ': тип «' + тип + '»');
    typeCount[тип] = (typeCount[тип] || 0) + 1;
    assert.equal(j['результат']['предмет'],
      'assets/items/' + String(NEW_FROM
        + RECIPES_00032101.findIndex((r) => r[1] === id)).padStart(6, '0')
      + '.json', f + ': результат — предмет волны');
    results.push(j['результат']['предмет']);
    assert.equal(j['база'], undefined,
      f + ': «база» отсутствует (базовые рецепты, ТЗ «50 рецептов»)');
    assert.equal(j['результат']['количество'], 1, f + ': количество 1');
    assert.ok(j['уровень'] >= LEVEL_BAND_00032101[
      ROSTER_00032101[RECIPES_00032101.findIndex((r) => r[1] === id)][4]
    ][0]
      && j['уровень'] <= LEVEL_BAND_00032101[
        ROSTER_00032101[RECIPES_00032101.findIndex((r) => r[1] === id)][4]
      ][1],
      f + ': уровень ' + j['уровень'] + ' ∈ диапазону редкости '
      + 'результата (RARITY_LEVEL_RANGE)');
    assert.equal(j['уровень'], level, f + ': уровень ' + level);
    const buildingNums = j['здания'].map((b) => refNum(b));
    const rarity = ROSTER_00032101[
      RECIPES_00032101.findIndex((r) => r[1] === id)][4];
    const expectedBuildings = тип === 'зачарование'
      ? REC_BUILDINGS_00032101.ench
      : тип === 'столярное_дело'
        ? REC_BUILDINGS_00032101.carp
        : rarity === 'common'
          ? REC_BUILDINGS_00032101.common_smith
          : REC_BUILDINGS_00032101.smith;
    assert.deepEqual(buildingNums, expectedBuildings,
      f + ': здания ' + JSON.stringify(expectedBuildings));
    for (const b of buildingNums) {
      assert.ok(buildings.has(b + '.json'), f + ': здание ' + b);
    }
    for (const s of j['навыки']) {
      assert.ok(skills.has(refNum(s) + '.json'),
        f + ': навык ' + s + ' ∈ каталогу');
    }
    for (const src of j['исходники']) {
      assert.ok(itemFiles.has(refNum(src['предмет']) + '.json'),
        f + ': исходник ' + src['предмет'] + ' ∈ каталогу');
    }
    if (тип === 'зачарование') {
      assert.ok(Array.isArray(j['заклинания'])
        && j['заклинания'].length >= 1,
        f + ': зачарование — «заклинания» ≥1 (инвариант 000191.14)');
      assert.deepEqual(j['заклинания'], spellz, f + ': заклинания');
      for (const sp of j['заклинания']) {
        assert.ok(spells.has(sp), f + ': заклинание ' + sp + ' ∈ каталогу');
      }
    } else {
      assert.equal(j['заклинания'], undefined,
        f + ': не зачарование — без «заклинания»');
    }
    assert.equal(JSON.stringify(j, null, 2) + '\n', raw,
      f + ': roundtrip-канон');
  }
  assert.deepEqual(typeCount, TYPE_MIX_00032101,
    'тип-состав РОВНО кузнечное 30 / зачарование 15 / столярное 5; '
    + 'факт: ' + JSON.stringify(typeCount));
  assert.equal(new Set(results).size, 50,
    'результаты покрывают новые предметы 1:1');
});

// --- T5: пулы дропа ---------------------------------------------------

test('000321.01 T5: EQUIP_POOLS — новые id КОНЦОМ своего тира каталожным порядком; размеры РОВНО 152/105/77/30/15 (Σ 379; ре-пин 000321.02: +50 брони КОНЦОМ тиров — окна срезаются на 20/14/10/4/2 раньше); каждый пул ≡ live-каталогу по редкости (EQ2/CH4/LF6-инвариант); RARITY/pickRarityTier — НЕ затронуты (5 тиров, Σ=1) (краснота: в пулах новых id нет)', () => {
  const P = L.EQUIP_POOLS;
  const expected = { common: 152, rare: 105, epic: 77, legendary: 30,
    impossible: 15 };
  for (const [t, len] of Object.entries(expected)) {
    assert.equal(P[t].length, len,
      'пул «' + t + '» — ' + len + '; факт: ' + P[t].length
      + ' (краснота: append в пулы не сделан — в дроп оружие не попадёт)');
  }
  const all = I.allItems();
  assert.equal(all.length, 613, 'live-каталог — 613');
  for (const t of L.RARITY) {
    assert.deepEqual(P[t.id],
      all.filter((it) => it.rarity === t.id).map((it) => it.id),
      'пул «' + t.id + '» ≡ live-каталогу по редкости (EQ2/LF6)');
  }
  for (const [num, id, name, subtype, rarity] of ROSTER_00032101) {
    const pool = P[rarity];
    assert.ok(pool.includes(id), id + ': в пуле «' + rarity + '»');
  }
  const wave = ROSTER_00032101.filter((r) => r[4] === 'common')
    .map((r) => r[1]);
  assert.deepEqual(P.common.slice(-40, -20), wave,
    'common-хвост = 20 новых common каталожным порядком + 20 брони '
    + '000321.02 ПОСЛЕ (append-only; ре-пин 000321.02)');
  const rarw = ROSTER_00032101.filter((r) => r[4] === 'rare')
    .map((r) => r[1]);
  assert.deepEqual(P.rare.slice(-28, -14), rarw,
    'rare-хвост = 14 новых rare + 14 брони 000321.02 ПОСЛЕ '
    + '(ре-пин 000321.02)');
  const epw = ROSTER_00032101.filter((r) => r[4] === 'epic')
    .map((r) => r[1]);
  assert.deepEqual(P.epic.slice(-20, -10), epw,
    'epic-хвост = 10 новых epic + 10 брони 000321.02 ПОСЛЕ '
    + '(ре-пин 000321.02)');
  const lgw = ROSTER_00032101.filter((r) => r[4] === 'legendary')
    .map((r) => r[1]);
  assert.deepEqual(P.legendary.slice(-8, -4), lgw,
    'legendary-хвост = 4 новых legendary + 4 брони 000321.02 '
    + 'ПОСЛЕ (ре-пин 000321.02)');
  const imw = ROSTER_00032101.filter((r) => r[4] === 'impossible')
    .map((r) => r[1]);
  assert.deepEqual(P.impossible.slice(-4, -2), imw,
    'impossible-хвост = 2 новых impossible + 2 брони 000321.02 '
    + 'ПОСЛЕ (ре-пин 000321.02)');
  assert.equal(L.RARITY.reduce((s, t) => s + t.chance, 0), 1,
    'DROP-таблица — Σ 1 (НЕ тронута)');
  assert.equal(L.RARITY.length, 5);
  assert.equal(L.RARITY.map((t) => t.id).join(','),
    'common,rare,epic,legendary,impossible',
    'канонический порядок тиров — цел');
});

// --- T6: иконки -------------------------------------------------------

test('000321.01 T6: иконки — у 50 новых поле icon ↔ файл существует; flat-SVG 64×64: viewBox ровно 1, ПЕРВЫЙ элемент — тень-эллипс rgba(0,0,0,0.22), без linearGradient/radialGradient/text/path/use/stroke (паттерн 000302/000335); sha256-уникальность против всех 580 иконок (ре-пин 000321.02: +50 брони; краснота: ENOENT — иконки не созданы)', () => {
  const allSvg = fs.readdirSync(SPR_DIR).filter((f) => f.endsWith('.svg'));
  assert.equal(allSvg.length, 580,
    'assets/sprites/items — 580 (480 + 50 оружия + 50 брони '
    + '000321.02); факт: ' + allSvg.length);
  const hash = (p) => createHash('sha256').update(fs.readFileSync(p))
    .digest('hex');
  const hashes = new Map();
  for (const f of allSvg) {
    hashes.set(hash(path.join(SPR_DIR, f)), f);
  }
  assert.equal(hashes.size, 580, 'все 580 иконок byte-уникальны');
  for (const [, id] of ROSTER_00032101) {
    const f = id + '.svg';
    const p = path.join(SPR_DIR, f);
    assert.ok(fs.existsSync(p), f + ': файл существует');
    const text = fs.readFileSync(p, 'utf8');
    assert.equal(text.split('viewBox="0 0 64 64"').length - 1, 1,
      f + ': viewBox ровно 1');
    for (const tok of ['<linearGradient', '<radialGradient', '<text',
      '<path', '<use']) {
      const re = new RegExp(tok.replace(/[<\\]/g, '\\$&') + '[\\s>/]');
      assert.ok(!re.test(text), f + ': ' + tok + ' запрещён');
    }
    assert.ok(!/stroke=/.test(text), f + ': stroke= запрещён');
    const firstShape = text.replace(/^[\s\S]*?<svg[^>]*>/, '').trimStart()
      .slice(0, 200);
    assert.ok(/^<ellipse[^>]*fill="rgba\(0,0,0,0\.22\)"/.test(firstShape),
      f + ': первый элемент — тень-эллипс rgba(0,0,0,0.22)');
  }
});

// --- T7: зеркала -------------------------------------------------------

test('000321.01 T7: зеркала — src/items-data.js содержит 50 новых предметов ≡ JSON (getItem ≡ диск); src/craft-data.js содержит 50 рецептов с резолвом результат/исходники/навыки/здания в id, «заклинания» — ID-форма (краснота: зеркало не регенерировано — новой записи нет)', () => {
  assert.equal(ITD.ITEMS.length, 613,
    'items-data — 613; факт: ' + ITD.ITEMS.length);
  const mirrorById = new Map(ITD.ITEMS.map((it) => [it.id, it]));
  for (const [num, id] of ROSTER_00032101) {
    const j = JSON.parse(loadItemFile(num));
    const m = mirrorById.get(id);
    assert.ok(m, 'items-data: предмет «' + id + '»');
    assert.deepEqual(m, j, id + ': зеркало ≡ JSON поэлементно');
    assert.equal(I.getItem(id).name, j.name, id + ': getItem резолвится');
  }
  assert.equal(CRD.CRAFT.length, 443,
    'craft-data — 443; факт: ' + CRD.CRAFT.length);
  for (const [num, id, тип, level, spellz] of RECIPES_00032101) {
    const f = String(num).padStart(6, '0') + '.json';
    const j = JSON.parse(fs.readFileSync(path.join(CRAFT_DIR, f), 'utf8'));
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
      (b) => Number(refNum(b))),
      f + ': зеркало — здания резолвлены в числовой id');
    assert.deepEqual(m['заклинания'] === undefined ? null : m['заклинания'],
      spellz, f + ': зеркало — заклинания (ID-форма) без резолва');
  }
});

// --- T8: лут-путь и магазин -------------------------------------------

test('000321.01 T8: лут-путь БЕЗ правки кода — каждый новый id ∈ EQUIP_POOLS своего тира (rollVictoryLoot выбирает из пулов по виду — данные, 0-diff); weapon-магазин (makeShop) на фиксированных координатах: новое оружие появляется в стоке хотя бы одного из 3 seeds (пул kind-фильтрованный, base_price не нужен — цена от value) (краснота: ни в одном стоке новой позиции нет)', () => {
  const P = L.EQUIP_POOLS;
  for (const [num, id, name, subtype, rarity] of ROSTER_00032101) {
    assert.ok(P[rarity].includes(id),
      id + ': в EQUIP_POOLS.' + rarity + ' (путь дропа)');
  }
  const B = require('../src/map.js').BUILDING_TYPES;
  const coords = [[10, 20], [3, 7], [41, 12]];
  const seen = new Set();
  for (const [x, y] of coords) {
    for (const w of [1, 3]) {
      const shop = I.makeShop(x, y, B.WEAPONS_SHOP, w);
      assert.ok(shop, 'магазин ' + x + ',' + y + '/' + w);
      for (const id of Object.keys(shop.stock)) seen.add(id);
    }
  }
  let hits = 0;
  for (const id of ROSTER_IDS_00032101) {
    if (seen.has(id)) hits++;
  }
  assert.ok(hits >= 1,
    'новое оружие попадает в сток weapon-магазина хотя бы на одном '
    + 'семене; факт hits=' + hits + ' (краснота: магазин не видит оружие — '
    + 'пул kind-фильтрованный)');
});

// --- T9: spec -----------------------------------------------------------

test('000321.01 T9: spec/items.md — буллет волны 000321.01 + append-only диапазон 000514–000563 в разделе номеров (описательно, паттерн 000312) (краснота: spec не обновлён)', () => {
  const spec = fs.readFileSync(path.join(ROOT, 'spec', 'items.md'),
    'utf8');
  assert.ok(spec.includes('000321.01'),
    'spec/items.md: упоминание волны 000321.01');
  assert.ok(spec.includes('000514–000563'),
    'spec/items.md: append-only строка right_hand 000514–000563');
});

// --- T10: канарейки -----------------------------------------------------

test('000321.01 T10: регресс-канарейки — каталог 613 ≡ items-data (ре-пин 000321.02: +50 брони); base_price РОВНО у 41 (новое оружие не продаётся фиксированно); slot — у 389, «прочих» без slot — 224 (613−389); stroke= в assets/sprites/items — ровно 46 legacy (заморозка 000335 — новые иконки без stroke); spell_scroll — 160 (свитки НЕ росли) (краснота: каталог 513)', () => {
  assert.equal(I.allItems().length, 613);
  assert.equal(ITD.ITEMS.length, 613,
    'items-data ≡ каталог (613)');
  const withBase = I.allItems().filter((it) => 'base_price' in it);
  assert.equal(withBase.length, 41,
    'base_price — ровно у 41; факт: ' + withBase.length);
  const withSlot = I.allItems().filter((it) => 'slot' in it);
  assert.equal(withSlot.length, 389,
    'slot — у 389 (289 + 50 оружия + 50 брони 000321.02); факт: '
    + withSlot.length);
  assert.equal(613 - withSlot.length, 224,
    'прочих без slot — 224 (не меняется)');
  const allSvg = fs.readdirSync(SPR_DIR).filter((f) => f.endsWith('.svg'));
  let strokeSeen = 0;
  for (const f of allSvg) {
    if (/stroke=/.test(fs.readFileSync(path.join(SPR_DIR, f), 'utf8'))) {
      strokeSeen++;
    }
  }
  assert.equal(strokeSeen, 46,
    'stroke= — ровно 46 legacy (заморозка 000335); факт: ' + strokeSeen);
  const scrolls = I.allItems().filter((it) => it.kind === 'spell_scroll');
  assert.equal(scrolls.length, 160,
    'spell_scroll — 160 (без смены); факт: ' + scrolls.length);
});

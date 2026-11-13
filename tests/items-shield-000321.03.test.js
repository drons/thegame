// Задача 000321.03 (3-я из 13 дочерних 000321) — волна щитов: 50
// предметов kind=shield slot left_hand, 50 рецептов assets/craft, 50
// flat-иконок 64×64 (паттерн 000302/000335 — иконки В ЭТОЙ дочерней:
// прецедент .01/.02 — 50 иконок донесены одной дочерней). Редкость —
// 20/14/10/4/2 (контракт 000230). Сет: ПРОДОЛЖЕНИЕ bulwark (+3 члена
// epic/legendary/impossible; бонус побайтово ≡ существующим членам —
// SB13), сет остаётся DORMANT (порог «2» при единственном слоте
// left_hand — документированный disk-факт 000230.13 D-07, не регресс).
// Пулы EQUIP_POOLS — append КОНЦОМ тиров каталожным порядком
// (единственный src-файл кроме зеркал); DROP/pickRarityTier/
// rollVictoryLoot — 0-diff. НОВЫХ реагентов НЕТ (прецедент .01/.02 —
// T8 анти-страж: исходники ∈ старый каталог). Щит ∉ виды кампа
// [food,potion,weapon/armor] → GOLDEN_CAMP/магазин-стоки брони 0-diff
// (держать зелёными БЕЗ правки); сдвигается только универсам
// (makeShop wealth 3, пул allItems — rng-хвост). Контракт —
// memory/000321-shield-items.md + сводка memory/000321-items-batch.md.
// kind=node; require — node-модули + src-модули + tests/json-schema.js.
//
// Нумерация (резерв волны, факт диска на базе):
//   предметы 000614–000663; рецепты 000520–000569; иконки —
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

const NEW_FROM = 614;
const NEW_TO = 663;
const REC_FROM = 520;
const REC_TO = 569;

// --- Ростер волны (ТЗ + анализ; фиксируется здесь и в
// memory/000321-shield-items.md §1). Строка:
// [номер, id, имя, редкость, armor, value, weight, skill-аффикс,
//  amount, free_cast (spell|null), set|null, тип рецепта, уровень]
const ROSTER_00032103 = [
  [614, 'splint_shield', 'Фанерный щит', 'common', 1, 15, 0.8, 'endurance', 0.03, null, null, 'столярное_дело', 2],
  [615, 'reed_buckler', 'Тростниковый буклер', 'common', 1, 17, 0.9, 'golem', 0.04, null, null, 'столярное_дело', 3],
  [616, 'birch_shield', 'Берёзовый щит', 'common', 1, 18, 1, 'hide', 0.05, null, null, 'столярное_дело', 2],
  [617, 'pine_shield', 'Сосновый щит', 'common', 1, 20, 1.1, 'breath', 0.02, null, null, 'столярное_дело', 4],
  [618, 'rawhide_shield', 'Сыромятный щит', 'common', 1, 21, 1.2, 'endurance', 0.04, null, null, 'столярное_дело', 3],
  [619, 'rattan_buckler', 'Ротанговый буклер', 'common', 1, 22, 1.3, 'golem', 0.02, null, null, 'столярное_дело', 5],
  [620, 'felt_shield', 'Войлочный щит', 'common', 1, 24, 1.4, 'hide', 0.03, null, null, 'столярное_дело', 4],
  [621, 'straw_shield', 'Соломенный щит', 'common', 1, 25, 1.5, 'breath', 0.05, null, null, 'столярное_дело', 6],
  [622, 'oak_shield', 'Дубовый щит', 'common', 1, 27, 1.6, 'endurance', 0.05, null, null, 'столярное_дело', 5],
  [623, 'resin_shield', 'Смолистый щит', 'common', 1, 28, 0.9, 'golem', 0.03, null, null, 'столярное_дело', 3],
  [624, 'stitched_shield', 'Прошитый щит', 'common', 1, 30, 1, 'hide', 0.04, null, null, 'столярное_дело', 4],
  [625, 'antler_buckler', 'Олений буклер', 'common', 1, 31, 1.2, 'breath', 0.03, null, null, 'столярное_дело', 7],
  [626, 'shingle_shield', 'Дощатый щит', 'common', 1, 33, 1.1, 'endurance', 0.02, null, null, 'столярное_дело', 6],
  [627, 'adobe_shield', 'Саманный щит', 'common', 1, 34, 1.3, 'golem', 0.05, null, null, 'столярное_дело', 4],
  [628, 'rushtwine_buckler', 'Ситниковый буклер', 'common', 1, 36, 1.4, 'hide', 0.02, null, null, 'столярное_дело', 5],
  [629, 'goatskin_shield', 'Козьекожий щит', 'common', 1, 38, 1.2, 'breath', 0.04, null, null, 'столярное_дело', 8],
  [630, 'tarred_shield', 'Дегтярный щит', 'common', 1, 39, 1.5, 'endurance', 0.03, null, null, 'столярное_дело', 7],
  [631, 'wicker_targe', 'Ивовая тарга', 'common', 1, 41, 1.6, 'golem', 0.02, null, null, 'столярное_дело', 5],
  [632, 'ashround_buckler', 'Ясеневый буклер', 'common', 1, 43, 1.3, 'hide', 0.05, null, null, 'столярное_дело', 6],
  [633, 'hidefaced_shield', 'Обтяжной щит', 'common', 1, 45, 1.7, 'breath', 0.05, null, null, 'столярное_дело', 9],
  [634, 'rimmed_shield', 'Окованный щит', 'rare', 2, 55, 1.8, 'endurance', 0.06, null, null, 'кузнечное_дело', 12],
  [635, 'iron_boss_shield', 'Щит с железным умбоном', 'rare', 2, 58, 2, 'golem', 0.08, null, null, 'кузнечное_дело', 14],
  [636, 'bronze_buckler', 'Бронзовый буклер', 'rare', 2, 62, 2.2, 'hide', 0.05, null, null, 'кузнечное_дело', 11],
  [637, 'brass_buckler', 'Латунный буклер', 'rare', 2, 65, 2.4, 'breath', 0.07, null, null, 'кузнечное_дело', 15],
  [638, 'spiked_buckler', 'Колючий буклер', 'rare', 2, 68, 1.9, 'endurance', 0.09, null, null, 'кузнечное_дело', 13],
  [639, 'ironbark_shield', 'Железнокорый щит', 'rare', 2, 72, 2.6, 'golem', 0.06, null, null, 'кузнечное_дело', 16],
  [640, 'lamellar_shield', 'Ламеллярный щит', 'rare', 2, 75, 2.8, 'hide', 0.08, null, null, 'кузнечное_дело', 18],
  [641, 'tower_shield', 'Башенный щит', 'rare', 2, 80, 3, 'breath', 0.1, null, null, 'кузнечное_дело', 20],
  [642, 'quenched_shield', 'Калёный щит', 'rare', 2, 84, 2.3, 'endurance', 0.07, null, null, 'кузнечное_дело', 17],
  [643, 'riveted_shield', 'Клёпаный щит', 'rare', 2, 88, 2.1, 'golem', 0.1, null, null, 'кузнечное_дело', 22],
  [644, 'boar_shield', 'Вепревый щит', 'rare', 2, 92, 2.5, 'hide', 0.06, null, null, 'кузнечное_дело', 19],
  [645, 'scalefront_shield', 'Чешуйчатый щит', 'rare', 2, 96, 2.9, 'breath', 0.05, null, null, 'кузнечное_дело', 24],
  [646, 'crown_shield', 'Венцовый щит', 'rare', 2, 102, 3.1, 'endurance', 0.08, null, null, 'кузнечное_дело', 21],
  [647, 'garrison_buckler', 'Гарнизонный буклер', 'rare', 2, 110, 3.2, 'golem', 0.09, null, null, 'кузнечное_дело', 26],
  [648, 'runeward_shield', 'Рунный щит', 'epic', 3, 150, 3, 'endurance', 0.12, null, null, 'кузнечное_дело', 32],
  [649, 'steel_targe', 'Стальная тарга', 'epic', 3, 170, 3.2, 'golem', 0.15, null, null, 'кузнечное_дело', 34],
  [650, 'blacksteel_shield', 'Воронёный щит', 'epic', 3, 190, 3.4, 'hide', 0.11, null, null, 'кузнечное_дело', 36],
  [651, 'mirror_buckler', 'Зерцальный буклер', 'epic', 3, 210, 3.6, 'breath', 0.18, null, null, 'кузнечное_дело', 38],
  [652, 'bulwark_shield', 'Щит бастиона', 'epic', 3, 250, 3.8, 'endurance', 0.14, 'shield_wall', 'bulwark', 'кузнечное_дело', 40],
  [653, 'thorn_shield', 'Терновый щит', 'epic', 3, 270, 3.1, 'golem', 0.2, null, null, 'кузнечное_дело', 42],
  [654, 'garrison_shield', 'Караульный щит', 'epic', 3, 300, 4, 'hide', 0.13, null, null, 'кузнечное_дело', 44],
  [655, 'lion_shield', 'Львиный щит', 'epic', 3, 330, 4.2, 'breath', 0.16, null, null, 'кузнечное_дело', 46],
  [656, 'sentinel_shield', 'Часовой щит', 'epic', 3, 350, 3.5, 'endurance', 0.19, 'iron_bulwark', null, 'кузнечное_дело', 48],
  [657, 'carved_shield', 'Резной щит', 'epic', 3, 360, 4.4, 'golem', 0.1, null, null, 'кузнечное_дело', 52],
  [658, 'frontier_shield', 'Рубежный щит', 'legendary', 3, 400, 4, 'hide', 0.22, null, null, 'кузнечное_дело', 62],
  [659, 'dragonplate_shield', 'Драконий щит', 'legendary', 3, 520, 4.5, 'breath', 0.28, null, null, 'кузнечное_дело', 68],
  [660, 'ironbulwark_shield', 'Железный бастион', 'legendary', 4, 650, 5, 'endurance', 0.3, null, 'bulwark', 'кузнечное_дело', 74],
  [661, 'dawnwall_shield', 'Рассветная стена', 'legendary', 4, 820, 5.5, 'golem', 0.34, null, null, 'кузнечное_дело', 80],
  [662, 'aegis_shield', 'Эгида Первозданная', 'impossible', 4, 1000, 5, 'hide', 0.38, null, 'bulwark', 'кузнечное_дело', 94],
  [663, 'lastwall_shield', 'Последняя стена', 'impossible', 4, 1400, 6, 'breath', 0.42, null, null, 'кузнечное_дело', 98],
];

const ROSTER_IDS_00032103 = ROSTER_00032103.map((r) => r[1]);

const COMPOSITION_00032103 = {
  common: 20, rare: 14, epic: 10, legendary: 4, impossible: 2,
};

// stats.armor/value/weight — envelope по тирам (факт диска 12 щитов
// 000230.13: common armor 1 / value 15–40 / weight 0.8–1.6, rare
// armor 2 / 60–65 / 2.5–3; выше — масштаб 000230.08-семейства по
// артефактному соседству; T4-полосы покрывают факт старых 12):
const ARMOR_BAND_00032103 = {
  common: [1, 1], rare: [2, 2], epic: [3, 3], legendary: [3, 4],
  impossible: [4, 4],
};
const VALUE_BAND_00032103 = {
  common: [15, 45], rare: [55, 110], epic: [150, 360],
  legendary: [400, 820], impossible: [1000, 1400],
};
const WEIGHT_BAND_00032103 = {
  common: [0.8, 1.7], rare: [1.8, 3.2], epic: [3.0, 4.5],
  legendary: [4.0, 5.5], impossible: [4.5, 6.0],
};
// Шкала amount (research §6, матрица 000230.03 — канон .01/.02):
const AFFIX_SCALE_00032103 = {
  common: [0.02, 0.05], rare: [0.05, 0.10], epic: [0.10, 0.20],
  legendary: [0.20, 0.35], impossible: [0.35, 0.45],
};
// Skill-матрица слота (research §6: «left_hand — shield: endurance,
// golem, hide, breath» — memory/000230-equipment-research.md:164;
// ЯВНОЕ множество — урок раунда 3 .01: ветвь «любой навык каталога»
// запрещена):
const SHIELD_SKILLS_00032103 = new Set(['endurance', 'golem', 'hide',
  'breath']);

// Сет-контракт: ПРОДОЛЖЕНИЕ bulwark (+3 члена epic/legendary/
// impossible; бонус НОВЫХ членов побайтово ≡ существующим — SB13).
// DORMANT (порог «2» при единственном слоте left_hand — 000230.13
// D-07; disk-прецеденты arcane_focus/penitent; ember/rime — НЕ dormancy:
// у колец 8 экипировочных позиций, src/items.js:110 — ретро-b14):
const BULWARK_BONUS_00032103 = { 2: { armor: 1 } };
const BULWARK_NEW_MEMBERS_00032103 = ['bulwark_shield',
  'ironbulwark_shield', 'aegis_shield'];
const BULWARK_REF_00032103 = 358; // wooden_buckler (живой член)

// Порядок ключей equip-канона для shield (icon МЕЖДУ stats и slot —
// ловушка пина 000335; set МЕЖДУ rarity и affixes, set_bonus —
// последним, факт wooden_buckler/000358):
const KEYS_SHIELD_00032103 = ['id', 'name', 'kind', 'weight', 'value',
  'desc', 'stats', 'icon', 'slot', 'rarity', 'affixes'];
const KEYS_SHIELD_SET_00032103 = ['id', 'name', 'kind', 'weight',
  'value', 'desc', 'stats', 'icon', 'slot', 'rarity', 'set', 'affixes',
  'set_bonus'];

// Рецепты (000520–000569 — тот же порядок, что ростер; id рецепта =
// id результата; контракт .02 «результат покрывает волну 1:1 тем же
// порядком»). Тип-состав по факту старых 12 рецептов (столярное 10 /
// кузнечное 2), тип по тиру: common — столярное [5] dexterity; rare —
// кузнечное [8] forge; epic+ — кузнечное [8,25]. Откат rare до ОДНОЙ
// постройки [8] — ОСОЗНАННОЕ ОТСТУПЛЕНИЕ .03 (решение волны в
// memory/000321-shield-items.md): процитированная ниже норма верна для
// .01/.02 и старых щитов, но на rare её НЕ распространяли
// (errata-уточнение 000360 по b16; ранее здесь «rare+ [8,25]» стояло
// как обоснование строки «rare — [8]» — самопротиворечиво).
// Диск-факт: старые кузнечные iron_round/steel_buckler — RARE, [8,25]
// (blacksmith+npc_house); у .01/.02 ВСЕ rare+ кузнечные — [8,25];
// .03: rare → [8], epic+ → [8,25].
// «база» НЕ используется: фиксированный диапазон ровно 50 при
// 1:1-покрытии не оставляет слотов improved-рецептам (семантика
// 000230.11: улучшенный даёт ТОТ ЖЕ результат) — обоснование в
// memory/000321-shield-items.md.
const TYPE_MIX_00032103 = {
  'столярное_дело': 20, 'кузнечное_дело': 30,
};
// «уровень» ∈ диапазону редкости РЕЗУЛЬТАТА (конвенция
// RARITY_LEVEL_RANGE_00023008, craft.test.js — факт кода) + полоса
// волны:
const LEVEL_BAND_00032103 = {
  common: [2, 9], rare: [10, 29], epic: [30, 59], legendary: [60, 89],
  impossible: [90, 100],
};
// Здания: столярка [5]; кузнечное rare [8]; кузнечное epic+ [8,25].
const REC_SKILL_00032103 = {
  'столярное_дело': ['dexterity'],
  'кузнечное_дело': ['forge'],
};

const OLD_MAX = 613; // анти-страж «НОВЫХ реагентов нет»: исходники ∈ старый каталог

// 000318.07: craft — файл <id>.json (basename === id рецепта).
const JRC = require('../scripts/lib/json-ref.js');
const CRAFT_FILE_RE = JRC.SHAPE_BASENAME_RES[JRC.ASSET_NAME_SHAPES.craft];
function craftDataFiles(dir) {
  return fs.readdirSync(dir)
    .filter((f) => f !== 'schema.json' && CRAFT_FILE_RE.test(f)).sort();
}

function refNum(ref) {
  const m = /(\d{6})\.json$/.exec(ref);
  return m ? m[1] : null;
}

function buildingTargetId(ref) {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT, ref), 'utf8')).id;
}
function loadItemFile(num) {
  const f = String(num).padStart(6, '0') + '.json';
  const p = path.join(ITEMS_DIR, f);
  assert.ok(fs.existsSync(p),
    'assets/items/' + f + ' существует (краснота: каталог 613 — '
    + 'предмет волны не создан)');
  return fs.readFileSync(p, 'utf8');
}
function skillIds() {
  return new Set(fs.readdirSync(SKILLS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .map((f) => JSON.parse(fs.readFileSync(path.join(SKILLS_DIR, f), 'utf8')).id));
}
function spellIds() {
  const JR = require('../scripts/lib/json-ref.js');
  return new Set(fs.readdirSync(SPELLS_DIR)
    .filter((f) => f !== 'schema.json'
      && JR.SHAPE_BASENAME_RES[JR.ASSET_NAME_SHAPES.spells].test(f))
    .map((f) => JSON.parse(fs.readFileSync(path.join(SPELLS_DIR, f), 'utf8')).id));
}

// --- T1: каталог и форма 50 предметов ------------------------------

test('000321.03 T1: каталог — ровно 814 файла 000001–000814 подряд (ре-пин 000321.06: +50 колец 000765–000814 — новый конец каталога; ре-пин 000348: +1 свиток Декаданс 000764; ре-пин 000321.05: +50 инструментов 000714–000763; ре-пин 000321.04: +50 артефактов, новый конец каталога); 50 новых (000614–000663) — kind shield, slot РОВНО left_hand, полный equip-набор полей БЕЗ subtype/base_price/tier, порядок ключей = канон (icon МЕЖДУ stats и slot; set/set_bonus для сетовых), roundtrip-канон stringify(…,2)+\\n, валидность по assets/items/schema.json (краснота: каталог 613 — волна не добавлена)', () => {
  const files = fs.readdirSync(ITEMS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f)).sort();
  assert.equal(files.length, 814,
    'каталог — 814 файла (613 + 50 щитов 000321.03 + 50 артефактов '
    + '000321.04 + 50 инструментов 000321.05 + 1 свиток Декаданс 000348 + 50 колец 000321.06); факт: '
    + files.length + ' (краснота: волна не добавлена)');
  const schema = JSON.parse(
    fs.readFileSync(path.join(ITEMS_DIR, 'schema.json'), 'utf8'));
  for (const [num, id, name] of ROSTER_00032103) {
    const f = String(num).padStart(6, '0') + '.json';
    assert.equal(files[num - 1], f,
      'каталожный порядок: позиция ' + num + ' — ' + f);
    const raw = loadItemFile(num);
    const j = JSON.parse(raw);
    assert.deepEqual(validateData(schema, j, f), [], f + ': схема');
    assert.equal(j.id, id, f + ': id «' + id + '»');
    assert.equal(j.name, name, f + ': имя «' + name + '»');
    assert.equal(j.kind, 'shield', f + ': kind shield');
    assert.equal(j.slot, 'left_hand',
      f + ': slot РОВНО left_hand; факт: ' + j.slot);
    const withSet = j.set !== undefined;
    assert.deepEqual(Object.keys(j),
      withSet ? KEYS_SHIELD_SET_00032103 : KEYS_SHIELD_00032103,
      f + ': порядок ключей = канон equip' + (withSet ? ' (сетового)' : ''));
    assert.deepEqual(j.stats, { armor: j.stats.armor },
      f + ': stats — ровно { armor }');
    assert.equal(j.subtype, undefined, f + ': subtype НЕТ (не оружие)');
    assert.equal(j.base_price, undefined,
      f + ': base_price НЕТ (цена вычисляемая от value)');
    assert.equal(j.tier, undefined, f + ': tier нет');
    assert.equal(j.icon, 'assets/sprites/items/' + id + '.svg',
      f + ': icon = assets/sprites/items/<id>.svg');
    assert.equal(JSON.stringify(j, null, 2) + '\n', raw,
      f + ': roundtrip-канон');
  }
});

// --- T2: ростер и уникальность --------------------------------------

test('000321.03 T2: ростер — 50 строк id/rarity/armor/value/weight/аффикс/set сверяются с JSON; sweep: id уникальны в 814, ИМЕНА и ОПИСАНИЯ уникальны по ВСЕМУ каталогу (включая броню 000564–000613) (краснота: каталог 613)', () => {
  const files = fs.readdirSync(ITEMS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f)).sort();
  assert.equal(files.length, 814, 'каталог — 814; факт: ' + files.length);
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
  assert.equal(ids.size, 814);
  for (const [num, id, name, rarity, armor, value, weight,
      skill, amount, fc, set] of ROSTER_00032103) {
    const j = JSON.parse(loadItemFile(num));
    assert.equal(j.name, name, id + ': имя == ростер');
    assert.equal(j.rarity, rarity, id + ': rarity == ростер');
    assert.equal(j.stats.armor, armor,
      id + ': armor ' + armor + '; факт: ' + j.stats.armor);
    assert.equal(j.value, value, id + ': value == ростер');
    assert.equal(j.weight, weight, id + ': weight == ростер');
    assert.equal(j.set === null ? undefined : j.set,
      set === null ? undefined : set, id + ': set == ростер');
    const sk = j.affixes.filter((a) => a.type === 'skill');
    assert.equal(sk.length, 1, id + ': ровно 1 skill-аффикс');
    assert.equal(sk[0].skill, skill,
      id + ': аффикс skill == колонка skill ростера; факт: '
      + sk[0].skill);
    assert.equal(sk[0].amount, amount, id + ': amount == ростер');
    const fcs = j.affixes.filter((a) => a.type === 'free_cast');
    assert.equal(fcs.length, fc === null ? 0 : 1, id + ': free_cast == ростер');
    if (fc !== null) assert.equal(fcs[0].spell, fc, id + ': free_cast spell == ростер');
    assert.ok(j.desc.length > 0, id + ': desc непустая');
  }
});

// --- T3: смеси, rarity-множество, пулы ------------------------------

test('000321.03 T3: редкость волны РОВНО 20/14/10/4/2; rarity-множество каталога 579 (232/161/117/46/23); EQUIP_POOLS: размеры 232/161/117/46/23, прежние префиксы целы (пул ≡ live-каталогу по редкости — EQ2/CH4; ре-пин 000321.06: +50 колец КОНЦОМ тиров), хвосты = id волны каталожным порядком ПЕРЕД 50 артефактов 000321.04, 50 инструментов 000321.05 и 50 колец 000321.06; универсам (makeShop wealth 3, пул allItems) видит щиты без правки кода; ARMOR_SHOP и барахолка кампа НЕ видят щитов (вид shield ∉ их виды — GOLDEN_CAMP/броневые стоки 0-diff); DROP/pickRarityTier 0-diff (краснота: в пулах новых id нет)', () => {
  const rarCount = {};
  for (const [num] of ROSTER_00032103) {
    const j = JSON.parse(loadItemFile(num));
    rarCount[j.rarity] = (rarCount[j.rarity] || 0) + 1;
  }
  assert.deepEqual(rarCount, COMPOSITION_00032103,
    'редкость волны РОВНО 20/14/10/4/2 (контракт 000230 на 50); факт: '
    + JSON.stringify(rarCount));
  const all = I.allItems();
  assert.equal(all.length, 814, 'live-каталог — 814');
  const rarAll = {};
  for (const it of all) {
    if (it.rarity) rarAll[it.rarity] = (rarAll[it.rarity] || 0) + 1;
  }
  assert.equal(Object.values(rarAll).reduce((a, b) => a + b, 0), 579,
    'rarity-множество каталога — 579 (429 + 50 артефактов 000321.04 '
    + '+ 50 инструментов 000321.05 + 50 колец 000321.06); '
    + 'факт: '
    + JSON.stringify(rarAll));
  assert.deepEqual(rarAll, { common: 232, rare: 161, epic: 117,
    legendary: 46, impossible: 23 },
    'rarity-множество РОВНО 232/161/117/46/23; факт: '
    + JSON.stringify(rarAll));
  const P = L.EQUIP_POOLS;
  const expected = { common: 232, rare: 161, epic: 117, legendary: 46,
    impossible: 23 };
  for (const [t, len] of Object.entries(expected)) {
    assert.equal(P[t].length, len,
      'пул «' + t + '» — ' + len + '; факт: ' + P[t].length
      + ' (краснота: append в пулы не сделан)');
  }
  for (const t of L.RARITY) {
    assert.deepEqual(P[t.id],
      all.filter((it) => it.rarity === t.id).map((it) => it.id),
      'пул «' + t.id + '» ≡ live-каталогу по редкости (EQ2/LF6; '
      + 'прежний префикс цел, append каталожным порядком)');
  }
  for (const tier of ['common', 'rare', 'epic', 'legendary', 'impossible']) {
    const wave = ROSTER_00032103.filter((r) => r[3] === tier).map((r) => r[1]);
    assert.deepEqual(P[tier].slice(-(4 * wave.length),
        -(3 * wave.length)), wave,
      tier + '-хвост = ' + wave.length + ' новых ' + tier
      + ' каталожным порядком + артефакты 000321.04 + инструменты '
      + '000321.05 + кольца 000321.06 ПОСЛЕ (append-only; ре-пин '
      + '000321.04/.05/.06)');
  }
  const B = require('../src/map.js').BUILDING_TYPES;
  const waveSet = new Set(ROSTER_IDS_00032103);
  let uniHits = 0;
  let armorHits = 0;
  for (const [x, y] of [[10, 20], [3, 8], [41, 13]]) {
    for (const w of [1, 3]) {
      const uni = I.makeShop(x, y, B.WEAPONS_SHOP, w);
      for (const id of Object.keys(uni.stock)) {
        if (waveSet.has(id)) uniHits++;
      }
    }
    // wealth<3 — пул по видам постройки (shopKindsFor(ARMOR_SHOP)
    // == [armor]; wealth===3 — «смесь всего» для ЛЮБОЙ постройки,
    // факт makeShop — потому ARMOR_SHOP проверяем на w=1):
    const am = I.makeShop(x, y, B.ARMOR_SHOP, 1);
    for (const id of Object.keys(am.stock)) {
      if (waveSet.has(id)) armorHits++;
    }
  }
  assert.ok(uniHits >= 1,
    'щиты попадают в сток универсама (пул allItems) хотя бы на одном '
    + 'семене; факт hits=' + uniHits + ' (краснота: зеркало не '
    + 'регнерировано)');
  assert.equal(armorHits, 0,
    'ARMOR_SHOP (виды [armor]) НЕ видит kind shield — сток брони '
    + '0-diff; факт hits=' + armorHits);
  const campRec = JSON.parse(fs.readFileSync(
    path.join(BUILDINGS_DIR, 'camp.json'), 'utf8'));
  for (const w of [2, 3]) {
    const camp = I.makeCampShop(10, 20, 1, w, campRec);
    for (const id of Object.keys(camp.stock)) {
      assert.ok(!waveSet.has(id),
        'барахолка кампа (виды food/potion/weapon/armor) НЕ видит '
        + 'щиты — GOLDEN_CAMP 0-diff; факт: ' + id + ' (w=' + w + ')');
    }
  }
  assert.equal(L.RARITY.reduce((s, t) => s + t.chance, 0), 1,
    'DROP-таблица — Σ 1 (НЕ тронута)');
  assert.equal(L.RARITY.map((t) => t.id).join(','),
    'common,rare,epic,legendary,impossible',
    'канонический порядок тиров — цел');
});

// --- T4: envelope armor/weight/value --------------------------------

test('000321.03 T4: stats.armor ∈ envelope редкости (факт диска 12 щитов: common 1 / rare 2; масштаб 000230.08: epic 3, legendary 3–4, impossible 4 — не выше disk-max); value ∈ полосам тира (покрывают факт старых: common 15–40, rare 60–65); weight ∈ полосам тира (факт старых 0.8–3.0); base_price/tier/subtype отсутствуют (краснота: файлы волны не созданы)', () => {
  for (const [num, id, name, rarity] of ROSTER_00032103) {
    const j = JSON.parse(loadItemFile(num));
    const [alo, ahi] = ARMOR_BAND_00032103[rarity];
    assert.ok(j.stats.armor >= alo && j.stats.armor <= ahi,
      id + ': armor ' + j.stats.armor + ' в envelope ' + rarity + ' '
      + alo + '–' + ahi);
    const [vlo, vhi] = VALUE_BAND_00032103[rarity];
    assert.ok(j.value >= vlo && j.value <= vhi,
      id + ': value ' + j.value + ' в полосе ' + rarity + ' ' + vlo
      + '–' + vhi);
    const [wlo, whi] = WEIGHT_BAND_00032103[rarity];
    assert.ok(j.weight >= wlo && j.weight <= whi,
      id + ': weight ' + j.weight + ' в полосе ' + rarity + ' ' + wlo
      + '–' + whi);
    assert.equal(j.base_price, undefined, id + ': base_price нет');
    assert.equal(j.tier, undefined, id + ': tier нет');
    assert.equal(j.subtype, undefined, id + ': subtype нет');
  }
  // Покрываем факт старых 12 щитов (полосы не уехали ниже диска):
  for (const num of [358, 367, 368, 369]) {
    const j = JSON.parse(fs.readFileSync(path.join(ITEMS_DIR,
      String(num).padStart(6, '0') + '.json'), 'utf8'));
    const [vlo, vhi] = VALUE_BAND_00032103[j.rarity];
    const [wlo, whi] = WEIGHT_BAND_00032103[j.rarity];
    assert.ok(j.value >= vlo && j.value <= vhi,
      'старый ' + num + ': value ' + j.value + ' в полосе тира');
    assert.ok(j.weight >= wlo && j.weight <= whi,
      'старый ' + num + ': weight ' + j.weight + ' в полосе тира');
  }
});

// --- T5: аффиксы ------------------------------------------------------

test('000321.03 T5: аффиксы — РОВНО 1 skill-аффикс на предмет; skill ∈ ЯВНОЙ матрице left_hand (research §6: endurance/golem/hide/breath); amount ∈ шкале редкости (канон .01/.02); free_cast РОВНО 2, оба epic (объект-аффикс {type,spell}), spell ∈ каталог assets/spells (краснота: файлы волны не созданы)', () => {
  const skillSet = skillIds();
  const spells = spellIds();
  const freeCast = [];
  for (const [num, id] of ROSTER_00032103) {
    const j = JSON.parse(loadItemFile(num));
    assert.ok(Array.isArray(j.affixes) && j.affixes.length >= 1,
      id + ': ≥1 аффикс');
    const skills = j.affixes.filter((a) => a.type === 'skill');
    const fcs = j.affixes.filter((a) => a.type === 'free_cast');
    assert.equal(skills.length, 1, id + ': ровно 1 skill-аффикс');
    assert.equal(fcs.length, j.affixes.length - 1,
      id + ': остальные — только free_cast');
    assert.ok(SHIELD_SKILLS_00032103.has(skills[0].skill),
      id + ': skill «' + skills[0].skill + '» вне матрицы left_hand');
    assert.ok(skillSet.has(skills[0].skill),
      id + ': skill ∈ каталогу assets/skills');
    const [alo, ahi] = AFFIX_SCALE_00032103[j.rarity];
    assert.ok(skills[0].amount >= alo && skills[0].amount <= ahi,
      id + ': amount ' + skills[0].amount + ' в шкале ' + j.rarity
      + ' ' + alo + '–' + ahi);
    for (const a of fcs) {
      assert.ok(spells.has(a.spell), id + ': free_cast spell ∈ каталогу');
      assert.equal(j.rarity, 'epic',
        id + ': free_cast — ровно epic (прецедент .01/.02 — РОВНО 2 epic)');
      freeCast.push(a.spell);
    }
  }
  assert.equal(freeCast.length, 2,
    'free_cast в волне — ровно 2; факт: ' + freeCast.length);
});

// --- T6: сеты ---------------------------------------------------------

test('000321.03 T6: сеты — bulwark ПРОДОЛЖЕН: РОВНО 6 членов каталога (3 старых c/c/r + 3 новых e/l/i), set_bonus НОВЫХ членов deepEqual существующим (SB13: {2:{armor:1}}); других новых set в волне нет; set без set_bonus не встречается; DORMANT зафиксирован явно: все 6 членов в ОДНОМ слоте left_hand — порог «2» неактивируем (disk-факт 000230.13 D-07, прецеденты arcane_focus/penitent — лестница тиров для коллекционера, НЕ регресс; ember/rime — НЕ dormancy, у колец 8 экипировочных позиций) (краснота: файлы волны не созданы)', () => {
  for (const [num, id] of ROSTER_00032103) {
    const j = JSON.parse(loadItemFile(num));
    if (j.set === undefined) {
      assert.equal(j.set_bonus, undefined, id + ': set без set_bonus');
      continue;
    }
    assert.equal(j.set, 'bulwark',
      id + ': новых сетов в волне нет — только продолжение bulwark; '
      + 'факт: ' + j.set);
  }
  const members = [];
  for (const f of fs.readdirSync(ITEMS_DIR)
    .filter((x) => /^\d{6}\.json$/.test(x))) {
    const j = JSON.parse(
      fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8'));
    if (j.set === 'bulwark') members.push(j);
  }
  assert.equal(members.length, 6,
    'bulwark — ровно 6 членов (3 + 3 волны); факт: ' + members.length);
  assert.deepEqual(members.map((j) => j.id).sort(),
    ['aegis_shield', 'bulwark_shield', 'horn_shield', 'iron_round',
      'ironbulwark_shield', 'wooden_buckler'],
    'bulwark: состав членов');
  assert.deepEqual(members.map((j) => j.rarity).sort(),
    ['common', 'common', 'epic', 'impossible', 'legendary', 'rare'],
    'bulwark: лестница тиров c/c/r/e/l/i');
  const ref = JSON.parse(fs.readFileSync(path.join(ITEMS_DIR,
    String(BULWARK_REF_00032103).padStart(6, '0') + '.json'), 'utf8'));
  for (const j of members) {
    assert.deepEqual(j.set_bonus, BULWARK_BONUS_00032103,
      j.id + ': set_bonus bulwark побайтово ≡ существующим членам '
      + '(SB13/D-03)');
    assert.deepEqual(j.set_bonus, ref.set_bonus,
      j.id + ': set_bonus ≡ wooden_buckler');
  }
  assert.deepEqual(new Set(members.map((j) => j.slot)),
    new Set(['left_hand']),
    'DORMANT: все члены в единственном слоте left_hand — порог «2» '
    + 'недостижим (зафиксированный disk-факт, не регресс)');
  assert.ok(BULWARK_NEW_MEMBERS_00032103.every((id) =>
    members.some((j) => j.id === id)),
    'новые члены bulwark: bulwark_shield/ironbulwark_shield/aegis_shield');
});

// --- T7: иконки -------------------------------------------------------

test('000321.03 T7: иконки — у 50 новых поле icon ↔ файл существует; биекция json↔svg по basename; flat-SVG 64×64: viewBox ровно 1, ПЕРВЫЙ элемент — тень-эллипс rgba(0,0,0,0.22), без linearGradient/radialGradient/text/path/use/stroke (паттерн 000302/000335); sha256-уникальность против всех 781 иконок (ре-пин 000321.06: +50 колец; ре-пин 000348: +1 иконка decadance_scroll; ре-пин 000321.05: 680 → 730 +50 инструментов; ре-пин 000321.04: 630 → 680 +50 артефактов; краснота: файлы не созданы)', () => {
  const allSvg = fs.readdirSync(SPR_DIR).filter((f) => f.endsWith('.svg'));
  assert.equal(allSvg.length, 781,
    'assets/sprites/items — 781 (580 + 50 + 50 артефактов 000321.04 '
    + '+ 50 инструментов 000321.05 + 1 свиток Декаданс + 50 колец '
    + '000321.06); '
    + 'факт: ' + allSvg.length);
  const hash = (p) => createHash('sha256').update(fs.readFileSync(p))
    .digest('hex');
  const hashes = new Map();
  for (const f of allSvg) {
    hashes.set(hash(path.join(SPR_DIR, f)), f);
  }
  assert.equal(hashes.size, 781, 'все 781 иконок byte-уникальны');
  for (const [, id] of ROSTER_00032103) {
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
  const svgBase = new Set(allSvg.map((f) => f.replace(/\.svg$/, '')));
  for (const f of fs.readdirSync(ITEMS_DIR)
    .filter((x) => /^\d{6}\.json$/.test(x))) {
    const j = JSON.parse(
      fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8'));
    if (j.icon && j.icon.startsWith('assets/sprites/items/')) {
      assert.ok(svgBase.has(j.id), j.id + ': svg по basename=id');
    }
  }
});

// --- T8: рецепты ------------------------------------------------------

test('000321.03 T8: 50 рецептов — файлы по id (прежние номера 000520–000569, 000318.07: basename === id); результат покрывает НОВЫЕ предметы 1:1 (тот же порядок); id рецепта = id результата; тип-состав РОВНО столярное 20 / кузнечное 30; здания: столярка [5], кузнечное rare [8], кузнечное epic+ [8,25] (факт старых щитов 000260–000271); навыки по типу (dexterity/forge); «заклинания» отсутствуют (не зачарование); «база» отсутствует (схема не требует; improved-семантика 000230.11 не в 1:1-диапазоне); «уровень» ∈ полосе редкости результата; исходники ∈ СТАРЫЙ каталог 000001–000613 (НОВЫХ реагентов нет — прецедент .01/.02); «название»/«описание» рецептов уникальны по каталогу craft; roundtrip-канон (краснота: каталог craft 443 — рецептов нет)', () => {
  const files = craftDataFiles(CRAFT_DIR);
  assert.equal(files.length, 643,
    'craft — 643 файла (443 + 50 рецептов 000321.03 + 50 рецептов '
    + '000321.04 + 50 рецептов 000321.05 + 50 рецептов 000321.06); факт: '
    + files.length + ' (краснота: рецепты не созданы)');
  const schema = JSON.parse(
    fs.readFileSync(path.join(CRAFT_DIR, 'schema.json'), 'utf8'));
  const itemFiles = new Set(fs.readdirSync(ITEMS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f)));
  const skills = new Set(fs.readdirSync(SKILLS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f)));
  const buildings = new Set(fs.readdirSync(BUILDINGS_DIR)
    .filter((f) => f !== 'schema.json'
      && /^[a-z][a-z0-9_]*\.json$/.test(f)));
  const skillById = new Map();
  for (const f of fs.readdirSync(SKILLS_DIR)
    .filter((x) => /^\d{6}\.json$/.test(x))) {
    const j = JSON.parse(
      fs.readFileSync(path.join(SKILLS_DIR, f), 'utf8'));
    skillById.set(f, j.id);
  }
  const recNames = new Map();
  const recDescs = new Map();
  for (const f of files) {
    const j = JSON.parse(
      fs.readFileSync(path.join(CRAFT_DIR, f), 'utf8'));
    assert.ok(!recNames.has(j['название']),
      'дубликат «название» рецепта: ' + j['название'] + ' (' + f + ')');
    recNames.set(j['название'], f);
    assert.ok(!recDescs.has(j['описание']),
      'дубликат «описание» рецепта: ' + j['описание'] + ' (' + f + ')');
    recDescs.set(j['описание'], f);
  }
  const typeCount = {};
  const results = [];
  ROSTER_00032103.forEach(([num, id, name, rarity, armor, value, weight,
      skill, amount, fc, set, тип, level], i) => {
    const recNum = REC_FROM + i;
    const f = id + '.json';
    assert.ok(files.includes(f),
      'рецепт щита (прежний номер ' + String(recNum).padStart(6, '0')
      + ') — файл ' + f + ' ∈ assets/craft (000318.07: имя файла === id, '
      + 'окно позиций по номерам заменено свипом присутствия + '
      + 'basename === id; memory/000318.07-craft-slug-rename.md)');
    const raw = fs.readFileSync(path.join(CRAFT_DIR, f), 'utf8');
    const j = JSON.parse(raw);
    assert.deepEqual(validateData(schema, j, f), [], f + ': схема');
    assert.equal(j['id'], id, f + ': id рецепта = id результата');
    assert.equal(j['тип'], тип, f + ': тип «' + тип + '»');
    typeCount[тип] = (typeCount[тип] || 0) + 1;
    assert.equal(j['результат']['предмет'],
      'assets/items/' + String(num).padStart(6, '0') + '.json',
      f + ': результат — предмет волны (тот же порядок)');
    results.push(j['результат']['предмет']);
    assert.equal(j['база'], undefined,
      f + ': «база» отсутствует (схема не требует; 1:1-диапазон '
      + 'ровно 50 — improved-слотов нет, memory)');
    assert.equal(j['заклинания'], undefined,
      f + ': не зачарование — без «заклинания»');
    assert.equal(j['результат']['количество'], 1, f + ': количество 1');
    assert.ok(j['уровень'] >= LEVEL_BAND_00032103[rarity][0]
        && j['уровень'] <= LEVEL_BAND_00032103[rarity][1],
      f + ': уровень ' + j['уровень'] + ' ∈ полосе ' + rarity + ' '
      + LEVEL_BAND_00032103[rarity].join('–') + ' (RARITY_LEVEL_RANGE)');
    assert.equal(j['уровень'], level, f + ': уровень ' + level);
    const high = ['epic', 'legendary', 'impossible'].includes(rarity);
    const expectedB = тип === 'столярное_дело'
      ? [5]
      : (high ? [8, 25] : [8]);
    assert.deepEqual(j['здания'].map((b) => buildingTargetId(b)), expectedB,
      f + ': здания ' + JSON.stringify(expectedB));
    for (const b of j['здания']) {
      assert.ok(buildings.has(b.split('/').pop()), f + ': здание ' + b);
    }
    const skillNames = j['навыки'].map((s) => skillById.get(refNum(s) + '.json'));
    for (const s of j['навыки']) {
      assert.ok(skills.has(refNum(s) + '.json'), f + ': навык ' + s);
    }
    assert.deepEqual(skillNames, REC_SKILL_00032103[тип],
      f + ': навыки = [' + REC_SKILL_00032103[тип] + ']');
    assert.ok(Array.isArray(j['исходники'])
      && j['исходники'].length >= 1, f + ': исходники ≥1');
    for (const src of j['исходники']) {
      const n = refNum(src['предмет']);
      assert.ok(itemFiles.has(n + '.json'),
        f + ': исходник ' + src['предмет'] + ' ∈ каталогу');
      assert.ok(Number(n) <= OLD_MAX,
        f + ': исходник ' + src['предмет'] + ' ∈ СТАРЫЙ каталог '
        + '(НОВЫХ реагентов не создаём — прецедент .01/.02)');
    }
    assert.ok(j['название'].length > 0, f + ': «название» непустое');
    assert.ok(j['описание'].length > 0, f + ': «описание» непустое');
    assert.equal(JSON.stringify(j, null, 2) + '\n', raw,
      f + ': roundtrip-канон');
  });
  assert.deepEqual(typeCount, TYPE_MIX_00032103,
    'тип-состав РОВНО столярное 20 / кузнечное 30; факт: '
    + JSON.stringify(typeCount));
  assert.equal(new Set(results).size, 50,
    'результаты покрывают новые предметы 1:1');
});

// --- T9: зеркала -------------------------------------------------------

test('000321.03 T9: зеркала — src/items-data.js содержит 50 новых предметов ≡ JSON (getItem ≡ диск); src/craft-data.js содержит 50 рецептов с резолвом результат/исходники/навыки/здания в id (краснота: зеркало не регенерировано)', () => {
  assert.equal(ITD.ITEMS.length, 814,
    'items-data — 814; факт: ' + ITD.ITEMS.length);
  const mirrorById = new Map(ITD.ITEMS.map((it) => [it.id, it]));
  for (const [num, id] of ROSTER_00032103) {
    const j = JSON.parse(loadItemFile(num));
    const m = mirrorById.get(id);
    assert.ok(m, 'items-data: предмет «' + id + '»');
    assert.deepEqual(m, j, id + ': зеркало ≡ JSON поэлементно');
    assert.equal(I.getItem(id).name, j.name, id + ': getItem резолвится');
  }
  assert.equal(CRD.CRAFT.length, 643,
    'craft-data — 643; факт: ' + CRD.CRAFT.length);
  ROSTER_00032103.forEach(([, id], i) => {
    const f = id + '.json';
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
      (b) => buildingTargetId(b)),
      f + ': зеркало — здания резолвлены в числовой id');
  });
});

// --- T10: счётчики/канарейки -----------------------------------------

test('000321.03 T10: регресс-канарейки — каталог 814 ≡ items-data (ре-пин 000321.06: +50 колец); shield 62 (12 + 50), armor 257, weapon 72 (не выросли), spell_scroll 161 (ре-пин 000348: +1 Декаданс); slot — у 589, «прочих» без slot — 225 (не меняется); base_price РОВНО у 202 (ре-пин 000347.02) (ре-пин 000320.15: +3 свитка Торговца свитками — base_price=value); free_cast — 28 (25 epic + 2 legendary + 1 impossible; ре-пин 000321.04: +4; ре-пин 000321.06: +2 epic колец); наборы 20 / 67 предмет (bulwark 3→6; arcane_focus +3 000321.04; forger +3 000321.05; moonlight 4 + tide 3 — новые сеты 000321.06); craft — 643 с типами зачарование 244 / кузнечное 173 / столярное 114 / резьба 86 / алхимия 24 / рунопись 2 (ре-пин 000321.06: +25 зачарование +25 резьбы); иконки 781; stroke= — ровно 46 legacy (краснота: каталог 613)', () => {
  assert.equal(I.allItems().length, 814);
  assert.equal(ITD.ITEMS.length, 814, 'items-data ≡ каталог (814)');
  const all = I.allItems();
  assert.equal(all.filter((it) => it.kind === 'shield').length, 62,
    'shield — 62 (12 + 50); факт: '
    + all.filter((it) => it.kind === 'shield').length);
  assert.equal(all.filter((it) => it.kind === 'armor').length, 257,
    'armor — 257 (не вырос)');
  assert.equal(all.filter((it) => it.kind === 'weapon').length, 72,
    'weapon — 72 (не вырос)');
  assert.equal(all.filter((it) => it.kind === 'spell_scroll').length, 161,
    'spell_scroll — 161 (ре-пин 000348: +1 Декаданс)');
  const withBase = all.filter((it) => 'base_price' in it);
  assert.equal(withBase.length, 202,
    'base_price — ровно у 202 (ре-пин 000320.15; ре-пин 000347.02: '
    + '+158 свитков — E1: base_price=value у всех spell_scroll); '
    + 'факт: ' + withBase.length);
  const withSlot = all.filter((it) => 'slot' in it);
  assert.equal(withSlot.length, 589,
    'slot — у 589 (389 + 50 щитов + 50 артефактов 000321.04 + 50 '
    + 'инструментов 000321.05 + 50 колец 000321.06); факт: '
    + withSlot.length);
  assert.equal(814 - withSlot.length, 225,
    'прочих без slot — 225 (у щитов slot есть, свиток Декаданс — без slot)');
  const fc = [];
  for (const it of all) {
    for (const a of (it.affixes || [])) {
      if (a.type === 'free_cast') fc.push(it.rarity);
    }
  }
  assert.equal(fc.length, 28,
    'free_cast — 28 (22 + 4 артефактов 000321.04 + 2 колец '
    + '000321.06); факт: ' + fc.length);
  assert.deepEqual({ epic: fc.filter((r) => r === 'epic').length,
    legendary: fc.filter((r) => r === 'legendary').length,
    impossible: fc.filter((r) => r === 'impossible').length },
  { epic: 25, legendary: 2, impossible: 1 },
  'free_cast: 25 epic + 2 legendary + 1 impossible');
  const sets = {};
  for (const it of all) {
    if (it.set) (sets[it.set] = sets[it.set] || []).push(it.id);
  }
  assert.equal(Object.keys(sets).length, 20,
    'наборы — 20 (bulwark продолжен; +moonlight +tide 000321.06); '
    + 'факт: ' + Object.keys(sets).length);
  assert.equal(Object.values(sets).reduce((a, v) => a + v.length, 0), 67,
    'сетовых предметов — 67 (51 + 3 bulwark + 3 arcane_focus '
    + '000321.04 + 3 forger 000321.05 + 4 moonlight + 3 tide '
    + '000321.06); факт: '
    + Object.values(sets).reduce((a, v) => a + v.length, 0));
  assert.equal(sets.bulwark.length, 6, 'bulwark — 6 членов');
  const craftFiles = craftDataFiles(CRAFT_DIR);
  assert.equal(craftFiles.length, 643, 'craft — 643');
  const ct = {};
  for (const f of craftFiles) {
    const t = JSON.parse(
      fs.readFileSync(path.join(CRAFT_DIR, f), 'utf8'))['тип'];
    ct[t] = (ct[t] || 0) + 1;
  }
  assert.deepEqual(ct, {
    'зачарование': 244, 'кузнечное_дело': 173, 'столярное_дело': 114,
    'резьба_по_камню': 86, 'алхимия': 24, 'рунопись': 2,
  }, 'craft по типам; факт: ' + JSON.stringify(ct));
  const allSvg = fs.readdirSync(SPR_DIR).filter((f) => f.endsWith('.svg'));
  assert.equal(allSvg.length, 781, 'иконки sprites/items — 781');
  let strokeSeen = 0;
  for (const f of allSvg) {
    if (/stroke=/.test(fs.readFileSync(path.join(SPR_DIR, f), 'utf8'))) {
      strokeSeen++;
    }
  }
  assert.equal(strokeSeen, 46,
    'stroke= — ровно 46 legacy (заморозка 000335); факт: ' + strokeSeen);
});

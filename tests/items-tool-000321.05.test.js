// Задача 000321.05 (5-я из 13 дочерних 000321) — волна инструментов: 50
// предметов kind=tool slot right_hand, 50 рецептов assets/craft
// (кузнечное 23 / алхимия 14 / зачарование 13 — масштаб факта старых
// рецептов инструментов 5/3/3), 50 flat-иконок 64×64 (паттерн
// 000302/000335 — иконки В ЭТОЙ дочерней: прецедент .01–.04 — 50 иконок
// донесены одной дочерней). Редкость — 20/14/10/4/2 (контракт 000230).
// Аффиксы — ЯВНОЕ множество TOOL_SKILLS_00032105 {forge, alchemy}
// (паттерн iron_hammer — факт старых; runes у 3 старых инструментов
// ЕСТЬ, но волна его не продолжает: фикс ТЗ/расчёта — первичен,
// memory/000321-tool-items.md). Сет: ПРОДОЛЖЕНИЕ forger (+3 члена
// epic/legendary/impossible; бонус побайтово ≡ существующим — SB13),
// сет остаётся DORMANT (порог «2» при единственном слоте right_hand —
// прецеденты .03 bulwark/.04 arcane_focus, лестница тиров — не регресс).
// free_cast — НЕ ДОБАВЛЯЕМ: факт старых инструментов 0 из 10 (решение
// по ТЗ «только если факт показывает»); T5 пинует 0 в волне, T10 —
// глобальные 26 без смены. stats/subtype/base_price/tier у предметов
// волны НЕТ (факт старых 10 — stats нет ни у одного). Пулы
// EQUIP_POOLS — append КОНЦОМ тиров каталожным порядком (+20/+14/+10/
// +4/+2 → 212/147/107/42/21); tool УЖЕ в пулах с 000230.12 (10 старых),
// append легитимен. DROP/pickRarityTier/rollVictoryLoot — 0-diff.
// НОВЫХ реагентов НЕТ (прецедент .01–.04; T8 анти-страж OLD_MAX=713).
// «заклинания» зачарований — SLUG-форма ∈ assets/spells (после
// 000318.05 — id, не numeric). Tool ∉ виды кампа/оружейной/броневой →
// GOLDEN_CAMP/камповые и видовые стоки 0-diff; сдвигается только
// универсам (makeShop wealth 3, пул allItems — rng-хвост). Контракт —
// memory/000321-tool-items.md + сводка memory/000321-items-batch.md.
// kind=node; require — node-модули + src-модули + tests/json-schema.js.
//
// Нумерация (резерв волны, факт диска на базе):
//   предметы 000714–000763; рецепты 000620–000669; иконки —
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

const NEW_FROM = 714;
const NEW_TO = 763;
const REC_FROM = 620;
const REC_TO = 669;

// --- Ростер волны (ТЗ + анализ; фиксируется здесь и в
// memory/000321-tool-items.md §1). Строка:
// [номер, id, имя, редкость, skill-аффикс, amount, value, weight,
//  set|null, тип рецепта, «заклинания» рецепта (null = ключа нет),
//  уровень рецепта]
const ROSTER_00032105 = [
  [714, 'ash_mallet', 'Пепельная колотушка', 'common', 'forge', 0.03, 18, 1.2, null, 'кузнечное_дело', null, 2],
  [715, 'clay_anvil', 'Глиняная наковальня', 'common', 'forge', 0.04, 19, 1.5, null, 'кузнечное_дело', null, 3],
  [716, 'copper_tongs', 'Медные клещи', 'common', 'forge', 0.03, 20, 1.2, null, 'кузнечное_дело', null, 3],
  [717, 'iron_punch', 'Железное пробойное', 'common', 'forge', 0.04, 20, 1.2, null, 'кузнечное_дело', null, 4],
  [718, 'forge_bellows', 'Кузнечные мехи', 'common', 'forge', 0.03, 21, 1.5, null, 'кузнечное_дело', null, 5],
  [719, 'slag_rake', 'Шлаковая грабелька', 'common', 'forge', 0.03, 18, 1.2, null, 'кузнечное_дело', null, 5],
  [720, 'quench_pail', 'Закалочное ведро', 'common', 'forge', 0.05, 19, 1.3, null, 'кузнечное_дело', null, 6],
  [721, 'cross_file', 'Надфиль-крестовка', 'common', 'forge', 0.04, 21, 1.0, null, 'кузнечное_дело', null, 7],
  [722, 'rawhide_mallet', 'Сыромятная колотушка', 'common', 'forge', 0.03, 18, 1.1, null, 'кузнечное_дело', null, 8],
  [723, 'tin_solder', 'Оловянная паялка', 'common', 'forge', 0.05, 22, 1.0, null, 'кузнечное_дело', null, 9],
  [724, 'clay_funnel', 'Глиняная воронка', 'common', 'alchemy', 0.04, 18, 1.0, null, 'алхимия', null, 2],
  [725, 'wood_pestle', 'Деревянный пест', 'common', 'alchemy', 0.03, 18, 1.0, null, 'алхимия', null, 3],
  [726, 'reed_sieve', 'Тростниковое сито', 'common', 'alchemy', 0.04, 19, 1.0, null, 'алхимия', null, 4],
  [727, 'bark_tray', 'Лоток из коры', 'common', 'alchemy', 0.03, 18, 1.1, null, 'алхимия', null, 4],
  [728, 'wax_jar', 'Восковка', 'common', 'alchemy', 0.04, 20, 1.0, null, 'алхимия', null, 5],
  [729, 'linen_filter', 'Льняной фильтр', 'common', 'alchemy', 0.04, 19, 1.0, null, 'алхимия', null, 6],
  [730, 'salt_scales', 'Соляные весы', 'common', 'alchemy', 0.05, 21, 1.4, null, 'алхимия', null, 7],
  [731, 'shell_spoon', 'Ложка из раковины', 'common', 'alchemy', 0.03, 18, 1.0, null, 'алхимия', null, 8],
  [732, 'flint_burner', 'Огонь-каменка', 'common', 'alchemy', 0.04, 22, 1.3, null, 'алхимия', null, 8],
  [733, 'dew_measure', 'Росная мерка', 'common', 'alchemy', 0.05, 23, 1.1, null, 'алхимия', null, 9],
  [734, 'steel_chisel', 'Стальное зубило', 'rare', 'forge', 0.06, 58, 1.5, null, 'кузнечное_дело', null, 11],
  [735, 'forge_hook', 'Кузнечный крюк', 'rare', 'forge', 0.05, 56, 1.2, null, 'кузнечное_дело', null, 12],
  [736, 'bronze_bellows', 'Бронзовые мехи', 'rare', 'forge', 0.07, 62, 1.8, null, 'кузнечное_дело', null, 14],
  [737, 'swage_block', 'Штамп-подкладка', 'rare', 'forge', 0.06, 65, 1.8, null, 'кузнечное_дело', null, 16],
  [738, 'iron_drill', 'Железное сверло', 'rare', 'forge', 0.08, 60, 1.5, null, 'кузнечное_дело', null, 18],
  [739, 'forge_stake', 'Рогач', 'rare', 'forge', 0.05, 64, 1.6, null, 'кузнечное_дело', null, 21],
  [740, 'fuller', 'Валок', 'rare', 'forge', 0.07, 66, 1.4, null, 'кузнечное_дело', null, 24],
  [741, 'glass_retort', 'Стеклянная реторта', 'rare', 'alchemy', 0.06, 70, 1.5, null, 'алхимия', null, 13],
  [742, 'bronze_alembic', 'Бронзовый алембик', 'rare', 'alchemy', 0.07, 72, 1.8, null, 'алхимия', null, 17],
  [743, 'quartz_muller', 'Кварцевый мусер', 'rare', 'alchemy', 0.06, 68, 1.6, null, 'алхимия', null, 20],
  [744, 'silver_spatula', 'Серебряная лопатка', 'rare', 'alchemy', 0.08, 75, 1.2, null, 'алхимия', null, 23],
  [745, 'brass_tongs', 'Латунные щипцы', 'rare', 'alchemy', 0.06, 62, 1.3, null, 'зачарование', 'cinder', 15],
  [746, 'oil_lamp', 'Жаровня-лампада', 'rare', 'alchemy', 0.09, 78, 1.4, null, 'зачарование', 'firelight', 19],
  [747, 'glass_measure', 'Мерное стекло', 'rare', 'alchemy', 0.10, 80, 1.2, null, 'зачарование', 'mend', 25],
  [748, 'damascus_hammer', 'Дамасский молот', 'epic', 'forge', 0.16, 260, 2.2, 'forger', 'зачарование', 'flame_strike', 35],
  [749, 'great_bellows', 'Двукрылые мехи', 'epic', 'forge', 0.12, 200, 2.5, null, 'кузнечное_дело', null, 32],
  [750, 'forge_hardy', 'Харди', 'epic', 'forge', 0.14, 210, 2.0, null, 'кузнечное_дело', null, 38],
  [751, 'blacksteel_tongs', 'Черностальные клещи', 'epic', 'forge', 0.13, 230, 1.8, null, 'кузнечное_дело', null, 44],
  [752, 'diamond_file', 'Алмазный надфиль', 'epic', 'forge', 0.15, 240, 1.2, null, 'кузнечное_дело', null, 50],
  [753, 'silver_alembic', 'Серебряный алембик', 'epic', 'alchemy', 0.12, 220, 1.8, null, 'зачарование', 'frost_aura', 33],
  [754, 'glass_athanor', 'Стеклянный афанор', 'epic', 'alchemy', 0.13, 215, 2.4, null, 'зачарование', 'heat_shield', 40],
  [755, 'silver_retort', 'Серебряная реторта', 'epic', 'alchemy', 0.14, 235, 1.6, null, 'зачарование', 'chill', 45],
  [756, 'moon_balance', 'Равновесие', 'epic', 'alchemy', 0.11, 250, 1.5, null, 'зачарование', 'circle_of_light', 48],
  [757, 'cinder_lamp', 'Жар-лампада', 'epic', 'alchemy', 0.17, 225, 1.5, null, 'зачарование', 'flame_burst', 52],
  [758, 'meteor_hammer', 'Метеорный молот', 'legendary', 'forge', 0.30, 700, 2.4, 'forger', 'кузнечное_дело', null, 65],
  [759, 'magma_hammer', 'Магмовая кувалда', 'legendary', 'forge', 0.26, 680, 2.5, null, 'кузнечное_дело', null, 72],
  [760, 'golden_athanor', 'Золотой афанор', 'legendary', 'alchemy', 0.24, 720, 2.3, null, 'зачарование', 'fire_aura', 68],
  [761, 'phoenix_still', 'Феникс-перегон', 'legendary', 'alchemy', 0.33, 760, 2.2, null, 'зачарование', 'holy_mending', 80],
  [762, 'worldforge_hammer', 'Молот Мировой Кузни', 'impossible', 'forge', 0.42, 1300, 2.8, 'forger', 'зачарование', 'meteor', 92],
  [763, 'prima_vessel', 'Сосуд Первоматерии', 'impossible', 'alchemy', 0.38, 1400, 2.7, null, 'зачарование', 'absolute_zero', 97],
];

const ROSTER_IDS_00032105 = ROSTER_00032105.map((r) => r[1]);

const COMPOSITION_00032105 = {
  common: 20, rare: 14, epic: 10, legendary: 4, impossible: 2,
};

// value/weight — полосы тира (факт старых 10 инструментов 000230.12:
// common 18–22 / 1–1.5, rare 60–65 / 1–2, epic 200–210 / 1–1.5,
// legendary 650 / 2; impossible факта нет — лестница .03/.04
// [1100,1500]); полосы ПОКРЫВАЮТ факт старых (T4):
const VALUE_BAND_00032105 = {
  common: [18, 28], rare: [55, 90], epic: [180, 280],
  legendary: [520, 780], impossible: [1100, 1500],
};
const WEIGHT_BAND_00032105 = {
  common: [1, 1.5], rare: [1, 2], epic: [1, 2.5],
  legendary: [2, 2.5], impossible: [2.5, 3],
};
// Шкала amount (research §6, матрица 000230.03 — канон .01–.04):
const AFFIX_SCALE_00032105 = {
  common: [0.02, 0.05], rare: [0.05, 0.10], epic: [0.10, 0.20],
  legendary: [0.20, 0.35], impossible: [0.35, 0.45],
};
// ЯВНОЕ множество крафтовых навыков волны (паттерн iron_hammer — факт
// старых forge/alchemy; runes у 3 старых ЕСТЬ, но фикс ТЗ/расчёта
// {forge, alchemy} первичен — расхождение в memory): ветвь «любой
// навык каталога» запрещена (урок раунда 3 .01/.03):
const TOOL_SKILLS_00032105 = new Set(['forge', 'alchemy']);
// Покрытие матрицы волной (факт ростера — сумма 50):
const SKILL_COVERAGE_00032105 = { forge: 25, alchemy: 25 };

// Сет-контракт: ПРОДОЛЖЕНИЕ forger (+3 члена epic/legendary/impossible;
// бонус НОВЫХ членов побайтово ≡ существующим — SB13). DORMANT (порог
// «2» при единственном слоте right_hand — все 5 членов в нём;
// прецеденты .03 bulwark 3→6, .04 arcane_focus 2→5 — лестница тиров
// для коллекционера, НЕ регресс):
const FORGER_BONUS_00032105 = {
  2: [{ type: 'skill', skill: 'forge', amount: 0.05 }],
};
const FORGER_NEW_MEMBERS_00032105 = ['damascus_hammer', 'meteor_hammer',
  'worldforge_hammer'];
const FORGER_REF_00032105 = 353; // silver_crucible (живой член)

// Порядок ключей equip-канона для tool (факт старых 10:
// id,name,kind,weight,value,desc,icon,slot,rarity,affixes — stats КЛЮЧА
// НЕТ ни у одного старого инструмента; set МЕЖДУ rarity и affixes,
// set_bonus — последним, факт silver_crucible/000353):
function keysForTool(set) {
  const k = ['id', 'name', 'kind', 'weight', 'value', 'desc', 'icon',
    'slot', 'rarity'];
  if (set) k.push('set');
  k.push('affixes');
  if (set) k.push('set_bonus');
  return k;
}

// Рецепты (000620–000669 — тот же порядок, что ростер; id рецепта =
// id результата; контракт .02 «результат покрывает волну 1:1 тем же
// порядком»). Тип-состав — масштаб факта старых 11 рецептов
// инструментов (кузнечное 5 / алхимия 3 / зачарование 3) на 50:
// кузнечное_дело 23 / алхимия 14 / зачарование 13. Здания — факт
// старых: кузнечное [blacksmith=8], epic+ += [npc_house=25] (факт
// steel_hammer lvl14/mithril_hammer lvl75 + конвенция .03), алхимия
// [alchemy_lab=17], зачарование [mage_tower=18]. «заклинания» —
// СЛАГ-форма ∈ assets/spells (после 000318.05) ровно 1 у зачарования.
// «база» НЕ используется: 1:1-покрытие, improved-слотов не остаётся
// (семантика 000230.11) — обоснование в memory/000321-tool-items.md.
const REC_TYPES_00032105 = ['кузнечное_дело', 'алхимия', 'зачарование'];
const REC_TYPE_COUNTS_00032105 = {
  'кузнечное_дело': 23, 'алхимия': 14, 'зачарование': 13,
};
const SKILL_FILE_00032105 = { forge: '000010', alchemy: '000025',
  heavy: '000008', runes: '000027' };
// «уровень» ∈ диапазону редкости РЕЗУЛЬТАТА (конвенция
// RARITY_LEVEL_RANGE_00023008, craft.test.js — факт кода) + полоса
// волны:
const LEVEL_BAND_00032105 = {
  common: [2, 9], rare: [10, 29], epic: [30, 59], legendary: [60, 89],
  impossible: [90, 100],
};

const OLD_MAX = 713; // анти-страж «НОВЫХ реагентов нет»: исходники ∈ старый каталог
const OLD_TOOL_NUMS = [338, 339, 340, 341, 342, 348, 349, 353, 354, 356]; // факт старых 10 (T4 покрытие полос)

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
    'assets/items/' + f + ' существует (краснота: каталог 713 — '
    + 'предмет волны не создан)');
  return fs.readFileSync(p, 'utf8');
}
function spellIds() {
  const JR = require('../scripts/lib/json-ref.js');
  return new Set(fs.readdirSync(SPELLS_DIR)
    .filter((f) => f !== 'schema.json'
      && JR.SHAPE_BASENAME_RES[JR.ASSET_NAME_SHAPES.spells].test(f))
    .map((f) => JSON.parse(fs.readFileSync(path.join(SPELLS_DIR, f), 'utf8')).id));
}

// --- T1: каталог и форма 50 предметов ------------------------------

test('000321.05 T1: каталог — ровно 864 файла 000001–000864 подряд (ре-пин 000321.07: +50 зелий 000815–000864 — новый конец каталога; ре-пин 000348: +1 свиток Декаданс 000764; ре-пин 000321.06: +50 колец 000765–000814); 50 новых (000714–000763) — kind tool, slot РОВНО right_hand, equip-набор полей БЕЗ subtype/base_price/tier/stats (факт старых 10), порядок ключей = канон (set/set_bonus для сетовых), roundtrip-канон stringify(…,2)+\\n, валидность по assets/items/schema.json (краснота: каталог 713 — волна не добавлена)', () => {
  const files = fs.readdirSync(ITEMS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f)).sort();
  assert.equal(files.length, 864,
    'каталог — 864 файла (713 + 50 инструментов 000321.05 + 1 свиток Декаданс 000348 + 50 колец 000321.06 + 50 зелий 000321.07); факт: '
    + files.length + ' (краснота: волна не добавлена)');
  const schema = JSON.parse(
    fs.readFileSync(path.join(ITEMS_DIR, 'schema.json'), 'utf8'));
  for (const [num, id, name] of ROSTER_00032105) {
    const f = String(num).padStart(6, '0') + '.json';
    assert.equal(files[num - 1], f,
      'каталожный порядок: позиция ' + num + ' — ' + f);
    const raw = loadItemFile(num);
    const j = JSON.parse(raw);
    assert.deepEqual(validateData(schema, j, f), [], f + ': схема');
    assert.equal(j.id, id, f + ': id «' + id + '»');
    assert.equal(j.name, name, f + ': имя «' + name + '»');
    assert.equal(j.kind, 'tool', f + ': kind tool');
    assert.equal(j.slot, 'right_hand',
      f + ': slot РОВНО right_hand; факт: ' + j.slot);
    assert.deepEqual(Object.keys(j), keysForTool(j.set !== undefined),
      f + ': порядок ключей = канон equip'
      + (j.set !== undefined ? ' (сетевого)' : ''));
    assert.equal(j.stats, undefined,
      f + ': stats КЛЮЧА НЕТ (факт старых 10 инструментов — ни у '
      + 'одного stats нет)');
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

test('000321.05 T2: ростер — 50 строк id/rarity/value/weight/аффикс/set сверяются с JSON; sweep: id уникальны в 864, ИМЕНА и ОПИСАНИЯ уникальны по ВСЕМУ каталогу (включая артефакты 000664–000713) (краснота: каталог 713)', () => {
  const files = fs.readdirSync(ITEMS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f)).sort();
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
  for (const [num, id, name, rarity, skill, amount, value, weight,
      set] of ROSTER_00032105) {
    const j = JSON.parse(loadItemFile(num));
    assert.equal(j.name, name, id + ': имя == ростер');
    assert.equal(j.rarity, rarity, id + ': rarity == ростер');
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
    assert.equal(j.affixes.length, 1, id + ': affixes РОВНО 1 (free_cast не добавляем)');
    assert.ok(j.desc.length > 0, id + ': desc непустая');
  }
});

// --- T3: смеси, rarity-множество, пулы ------------------------------

test('000321.05 T3: редкость волны РОВНО 20/14/10/4/2; rarity-множество каталога 579 (232/161/117/46/23); EQUIP_POOLS: размеры 232/161/117/46/23, прежние префиксы целы (пул ≡ live-каталогу по редкости — EQ2/CH4; ре-пин 000321.06: +50 колец КОНЦОМ тиров — окно хвоста сдвинуто), хвосты = id волны каталожным порядком; tool УЖЕ в пулах с 000230.12 (10 старых) — append легитимен; универсам (makeShop wealth 3, пул allItems) видит инструменты без правки кода; ARMOR_SHOP, Оружейная (w<3) и барахолка кампа НЕ видят инструментов (вид tool ∉ их виды — GOLDEN_CAMP/видовые стоки 0-diff); DROP/pickRarityTier 0-diff (краснота: в пулах новых id нет)', () => {
  const rarCount = {};
  for (const [num] of ROSTER_00032105) {
    const j = JSON.parse(loadItemFile(num));
    rarCount[j.rarity] = (rarCount[j.rarity] || 0) + 1;
  }
  assert.deepEqual(rarCount, COMPOSITION_00032105,
    'редкость волны РОВНО 20/14/10/4/2 (контракт 000230 на 50); факт: '
    + JSON.stringify(rarCount));
  const all = I.allItems();
  assert.equal(all.length, 864, 'live-каталог — 864');
  const rarAll = {};
  for (const it of all) {
    if (it.rarity) rarAll[it.rarity] = (rarAll[it.rarity] || 0) + 1;
  }
  assert.equal(Object.values(rarAll).reduce((a, b) => a + b, 0), 579,
    'rarity-множество каталога — 579 (479 + 50 + 50 колец 000321.06); факт: '
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
    const wave = ROSTER_00032105.filter((r) => r[3] === tier).map((r) => r[1]);
    assert.deepEqual(P[tier].slice(-(2 * wave.length),
        -wave.length), wave,
      tier + '-хвост = ' + wave.length + ' новых ' + tier
      + ' каталожным порядком + кольца 000321.06 ПОСЛЕ '
      + '(append-only; ре-пин 000321.06)');
  }
  const B = require('../src/map.js').BUILDING_TYPES;
  const waveSet = new Set(ROSTER_IDS_00032105);
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
    // wealth<3 — пул по видам постройки (shopKindsFor(ARMOR_SHOP)
    // == [armor], WEAPONS_SHOP == [weapon]; wealth===3 — «смесь всего»
    // для ЛЮБОЙ постройки, факт makeShop — потому видовые проверяем
    // на w=1):
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
    'инструменты попадают в сток универсама (пул allItems) хотя бы на '
    + 'одном семени; факт hits=' + uniHits + ' (краснота: зеркало не '
    + 'регнерировано)');
  assert.equal(armorHits, 0,
    'ARMOR_SHOP (виды [armor]) НЕ видит kind tool — сток брони '
    + '0-diff; факт hits=' + armorHits);
  assert.equal(weaponHits, 0,
    'Оружейная (виды [weapon]) НЕ видит kind tool — пулы/виды '
    + 'разделены (факт loot-equip-data: в right_hand-тиражах оружие и '
    + 'инструменты СОСУЩЕСТВУЮТ, но видовые лавки tool не видят); '
    + 'факт hits=' + weaponHits);
  const campRec = JSON.parse(fs.readFileSync(
    path.join(BUILDINGS_DIR, 'camp.json'), 'utf8'));
  for (const w of [2, 3]) {
    const camp = I.makeCampShop(10, 20, 1, w, campRec);
    for (const id of Object.keys(camp.stock)) {
      assert.ok(!waveSet.has(id),
        'барахолка кампа (виды food/potion/weapon/armor) НЕ видит '
        + 'инструменты — GOLDEN_CAMP 0-diff; факт: ' + id + ' (w=' + w + ')');
    }
  }
  assert.equal(L.RARITY.reduce((s, t) => s + t.chance, 0), 1,
    'DROP-таблица — Σ 1 (НЕ тронута)');
  assert.equal(L.RARITY.map((t) => t.id).join(','),
    'common,rare,epic,legendary,impossible',
    'канонический порядок тиров — цел');
});

// --- T4: envelope weight/value ----------------------------------------

test('000321.05 T4: value ∈ полосам тира (покрывают факт старых 10: common 18–22, rare 60–65, epic 200–210, legendary 650); weight ∈ полосам тира (факт старых 1–2); stats/subtype/base_price/tier отсутствуют; полосы покрывают факт старых 10 инструментов (краснота: файлы волны не созданы)', () => {
  for (const [num, id, name, rarity] of ROSTER_00032105) {
    const j = JSON.parse(loadItemFile(num));
    const [vlo, vhi] = VALUE_BAND_00032105[rarity];
    assert.ok(j.value >= vlo && j.value <= vhi,
      id + ': value ' + j.value + ' в полосе ' + rarity + ' ' + vlo
      + '–' + vhi);
    const [wlo, whi] = WEIGHT_BAND_00032105[rarity];
    assert.ok(j.weight >= wlo && j.weight <= whi,
      id + ': weight ' + j.weight + ' в полосе ' + rarity + ' ' + wlo
      + '–' + whi);
    assert.equal(j.base_price, undefined, id + ': base_price нет');
    assert.equal(j.tier, undefined, id + ': tier нет');
    assert.equal(j.subtype, undefined, id + ': subtype нет');
    assert.equal(j.stats, undefined, id + ': stats нет');
  }
  // Покрываем факт старых 10 инструментов (полосы не уехали):
  for (const num of OLD_TOOL_NUMS) {
    const j = JSON.parse(fs.readFileSync(path.join(ITEMS_DIR,
      String(num).padStart(6, '0') + '.json'), 'utf8'));
    const [vlo, vhi] = VALUE_BAND_00032105[j.rarity];
    const [wlo, whi] = WEIGHT_BAND_00032105[j.rarity];
    assert.ok(j.value >= vlo && j.value <= vhi,
      'старый ' + num + ': value ' + j.value + ' в полосе тира');
    assert.ok(j.weight >= wlo && j.weight <= whi,
      'старый ' + num + ': weight ' + j.weight + ' в полосе тира');
  }
});

// --- T5: аффиксы ------------------------------------------------------

test('000321.05 T5: аффиксы — РОВНО 1 skill-аффикс на предмет; skill ∈ ЯВНОГО TOOL_SKILLS_00032105 {forge, alchemy} (паттерн iron_hammer; runes у 3 старых ЕСТЬ, волной не продолжается — фикс первичен, memory); покрытие РОВНО 25/25 (оба навыка в каждом тире); amount ∈ шкале редкости (канон .01–.04); free_cast в волне РОВНО 0 (факт старых инструментов 0 из 10 — НЕ добавляем; глобальные 26 не двигаются); spell-ссылки не участвуют (краснота: файлы волны не созданы)', () => {
  let freeCast = 0;
  const coverage = {};
  for (const [num, id] of ROSTER_00032105) {
    const j = JSON.parse(loadItemFile(num));
    assert.ok(Array.isArray(j.affixes) && j.affixes.length === 1,
      id + ': РОВНО 1 аффикс; факт: ' + JSON.stringify(j.affixes));
    const a = j.affixes[0];
    assert.equal(a.type, 'skill', id + ': тип аффикса skill');
    assert.ok(TOOL_SKILLS_00032105.has(a.skill),
      id + ': skill «' + a.skill + '» вне TOOL_SKILLS_00032105 '
      + '{forge, alchemy} (мутация «любой навык» запрещена)');
    coverage[a.skill] = (coverage[a.skill] || 0) + 1;
    const [alo, ahi] = AFFIX_SCALE_00032105[j.rarity];
    assert.ok(a.amount >= alo && a.amount <= ahi,
      id + ': amount ' + a.amount + ' в шкале ' + j.rarity
      + ' ' + alo + '–' + ahi);
    assert.equal(a.free_cast, undefined, id + ': free_cast нет');
    if (a.type === 'free_cast') freeCast++;
  }
  assert.equal(freeCast, 0,
    'free_cast в волне — ровно 0 (факт старых 10: 0 — НЕ добавляем); '
    + 'факт: ' + freeCast);
  assert.deepEqual(coverage, SKILL_COVERAGE_00032105,
    'покрытие матрицы волной РОВНО forge 25 / alchemy 25 (=50); факт: '
    + JSON.stringify(coverage));
});

// --- T6: сеты ---------------------------------------------------------

test('000321.05 T6: сеты — forger ПРОДОЛЖЕН: РОВНО 5 членов каталога (2 старых epic+legendary + 3 новых e/l/i), set_bonus НОВЫХ членов deepEqual существующим (SB13: {2:[{skill forge 0.05}]}); других новых set в волне нет; set без set_bonus не встречается; DORMANT зафиксирован явно: все 5 членов в ОДНОМ слоте right_hand — порог «2» неактивируем (прецеденты .03 bulwark/.04 arcane_focus — лестница тиров для коллекционера, НЕ регресс) (краснота: файлы волны не созданы)', () => {
  for (const [num, id] of ROSTER_00032105) {
    const j = JSON.parse(loadItemFile(num));
    if (j.set === undefined) {
      assert.equal(j.set_bonus, undefined, id + ': set без set_bonus');
      continue;
    }
    assert.equal(j.set, 'forger',
      id + ': новых сетов в волне нет — только продолжение '
      + 'forger; факт: ' + j.set);
  }
  const members = [];
  for (const f of fs.readdirSync(ITEMS_DIR)
    .filter((x) => /^\d{6}\.json$/.test(x))) {
    const j = JSON.parse(
      fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8'));
    if (j.set === 'forger') members.push(j);
  }
  assert.equal(members.length, 5,
    'forger — ровно 5 членов (2 + 3 волны); факт: '
    + members.length);
  assert.deepEqual(members.map((j) => j.id).sort(),
    ['damascus_hammer', 'meteor_hammer', 'mithril_hammer',
      'silver_crucible', 'worldforge_hammer'],
    'forger: состав членов');
  assert.deepEqual(members.map((j) => j.rarity).sort(),
    ['epic', 'epic', 'impossible', 'legendary', 'legendary'],
    'forger: лестница тиров e/e/l/l/i');
  const ref = JSON.parse(fs.readFileSync(path.join(ITEMS_DIR,
    String(FORGER_REF_00032105).padStart(6, '0') + '.json'), 'utf8'));
  for (const j of members) {
    assert.deepEqual(j.set_bonus, FORGER_BONUS_00032105,
      j.id + ': set_bonus forger побайтово ≡ существующим членам '
      + '(SB13/D-03)');
    assert.deepEqual(j.set_bonus, ref.set_bonus,
      j.id + ': set_bonus ≡ silver_crucible');
  }
  assert.deepEqual(new Set(members.map((j) => j.slot)),
    new Set(['right_hand']),
    'DORMANT: все члены в единственном слоте right_hand — порог «2» '
    + 'недостижим (зафиксированный disk-факт, не регресс)');
  assert.ok(FORGER_NEW_MEMBERS_00032105.every((id) =>
    members.some((j) => j.id === id)),
    'новые члены forger: damascus_hammer/meteor_hammer/'
    + 'worldforge_hammer');
});

// --- T7: иконки -------------------------------------------------------

test('000321.05 T7: иконки — у 50 новых поле icon ↔ файл существует; биекция json↔svg по basename; flat-SVG 64×64: viewBox ровно 1, ПЕРВЫЙ элемент — тень-эллипс rgba(0,0,0,0.22), без linearGradient/radialGradient/text/path/use/stroke (паттерн 000302/000335); sha256-уникальность против всех 831 иконок (ре-пин 000321.07: +50 зелий) (краснота: файлы не созданы)', () => {
  const allSvg = fs.readdirSync(SPR_DIR).filter((f) => f.endsWith('.svg'));
  assert.equal(allSvg.length, 831,
    'assets/sprites/items — 831 (680 + 50 + 1 иконка decadance_scroll '
    + '+ 50 колец 000321.06 + 50 зелий 000321.07); факт: ' + allSvg.length);
  const hash = (p) => createHash('sha256').update(fs.readFileSync(p))
    .digest('hex');
  const hashes = new Map();
  for (const f of allSvg) {
    hashes.set(hash(path.join(SPR_DIR, f)), f);
  }
  assert.equal(hashes.size, 831, 'все 831 иконок byte-уникальны');
  for (const [, id] of ROSTER_00032105) {
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

test('000321.05 T8: 50 рецептов — файлы по id (прежние номера 000620–000669, 000318.07: basename === id); результат покрывает НОВЫЕ предметы 1:1 (тот же порядок); id рецепта = id результата; тип-состав — масштаб факта старых рецептов инструментов (кузнечное_дело 23 / алхимия 14 / зачарование 13); здания: кузнечное common/rare [8], epic+ [8,25], алхимия [17], зачарование [18]; навыки: кузнечное [forge], epic+ [forge,heavy] (факт mithril_hammer), алхимия [alchemy], зачарование [runes + навык-аффикс результата]; «заклинания» РОВНО 1 SLAG-формы только у зачарования ∈ каталог assets/spells; «база» отсутствует (1:1-диапазон, improved-семантика 000230.11 не в резерве); «уровень» ∈ полосе редкости результата; исходники ∈ СТАРЫЙ каталог 000001–000713 (НОВЫХ реагентов нет — прецедент .01–.04); «название»/«описание» рецептов уникальны по каталогу craft; roundtrip-канон (краснота: каталог craft 543 — рецептов нет)', () => {
  const files = craftDataFiles(CRAFT_DIR);
  assert.equal(files.length, 693,
    'craft — 693 файла (543 + 50 рецептов 000321.05 + 50 рецептов 000321.06 + 50 рецептов 000321.07); факт: '
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
  const spells = spellIds();
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
  const typeCounts = {};
  const results = [];
  ROSTER_00032105.forEach(([num, id, name, rarity, skill, amount,
      value, weight, set, recType, spell, level], i) => {
    const recNum = REC_FROM + i;
    const f = id + '.json';
    assert.ok(files.includes(f),
      'рецепт инструмента (прежний номер ' + String(recNum).padStart(6, '0')
      + ') — файл ' + f + ' ∈ assets/craft (000318.07: имя файла === id, '
      + 'окно позиций по номерам заменено свипом присутствия + '
      + 'basename === id; memory/000318.07-craft-slug-rename.md)');
    const raw = fs.readFileSync(path.join(CRAFT_DIR, f), 'utf8');
    const j = JSON.parse(raw);
    assert.deepEqual(validateData(schema, j, f), [], f + ': схема');
    assert.equal(j['id'], id, f + ': id рецепта = id результата');
    assert.equal(j['тип'], recType, f + ': тип «' + recType + '»');
    typeCounts[j['тип']] = (typeCounts[j['тип']] || 0) + 1;
    assert.equal(j['результат']['предмет'],
      'assets/items/' + String(num).padStart(6, '0') + '.json',
      f + ': результат — предмет волны (тот же порядок)');
    results.push(j['результат']['предмет']);
    assert.equal(j['база'], undefined,
      f + ': «база» отсутствует (схема не требует; 1:1-диапазон '
      + 'ровно 50 — improved-слотов нет, memory)');
    assert.equal(j['результат']['количество'], 1, f + ': количество 1');
    assert.ok(j['уровень'] >= LEVEL_BAND_00032105[rarity][0]
        && j['уровень'] <= LEVEL_BAND_00032105[rarity][1],
      f + ': уровень ' + j['уровень'] + ' ∈ полосе ' + rarity + ' '
      + LEVEL_BAND_00032105[rarity].join('–') + ' (RARITY_LEVEL_RANGE)');
    assert.equal(j['уровень'], level, f + ': уровень ' + level);
    const buildingIds = j['здания'].map((b) => buildingTargetId(b));
    for (const b of j['здания']) {
      assert.ok(buildings.has(b.split('/').pop()), f + ': здание ' + b);
    }
    const skillNames = j['навыки'].map(
      (s) => skillById.get(refNum(s) + '.json'));
    for (const s of j['навыки']) {
      assert.ok(skills.has(refNum(s) + '.json'), f + ': навык ' + s);
    }
    if (recType === 'кузнечное_дело') {
      assert.equal(skill, 'forge',
        f + ': кузнечный рецепт → forge-предмет (аффикс↔тип)');
      if (rarity === 'epic' || rarity === 'legendary') {
        assert.deepEqual(buildingIds, [8, 25],
          f + ': кузнечное epic+ — [blacksmith=8, npc_house=25] '
          + '(факт steel_hammer lvl14/mithril_hammer lvl75 + '
          + 'конвенция .03)');
        assert.deepEqual(skillNames, ['forge', 'heavy'],
          f + ': навыки [forge, heavy] (факт mithril_hammer)');
      } else {
        assert.deepEqual(buildingIds, [8],
          f + ': кузнечное common/rare — [blacksmith=8]');
        assert.deepEqual(skillNames, ['forge'],
          f + ': навыки [forge]');
      }
    } else if (recType === 'алхимия') {
      assert.equal(skill, 'alchemy',
        f + ': алхимический рецепт → alchemy-предмет');
      assert.deepEqual(buildingIds, [17],
        f + ': здания [alchemy_lab=17] (факт alchemy_lab.json)');
      assert.deepEqual(skillNames, ['alchemy'],
        f + ': навыки [alchemy]');
    } else {
      assert.equal(recType, 'зачарование');
      assert.deepEqual(buildingIds, [18],
        f + ': здания [mage_tower=18] (факт зачарования)');
      assert.deepEqual(skillNames, ['runes', skill],
        f + ': навыки [runes, навык-аффикс ' + skill
        + '] (паттерн .04 enchanting + навык результата)');
      assert.ok(Array.isArray(j['заклинания'])
        && j['заклинания'].length === 1,
        f + ': «заклинания» РОВНО 1 (зачарование — факт старых)');
      assert.ok(spells.has(j['заклинания'][0]),
        f + ': «заклинания» slug ∈ каталогу assets/spells; факт: '
        + j['заклинания'][0]);
      assert.equal(j['заклинания'][0], spell,
        f + ': спелл рецепта == ростер; факт: ' + j['заклинания'][0]);
    }
    if (recType !== 'зачарование') {
      assert.equal(j['заклинания'], undefined,
        f + ': «заклинания» только у зачарования (факт старых)');
    }
    assert.ok(Array.isArray(j['исходники'])
      && j['исходники'].length >= 1, f + ': исходники ≥1');
    for (const src of j['исходники']) {
      const n = refNum(src['предмет']);
      assert.ok(itemFiles.has(n + '.json'),
        f + ': исходник ' + src['предмет'] + ' ∈ каталогу');
      assert.ok(Number(n) <= OLD_MAX,
        f + ': исходник ' + src['предмет'] + ' ∈ СТАРЫЙ каталог '
        + '(НОВЫХ реагентов не создаём — прецедент .01–.04)');
    }
    assert.ok(j['название'].length > 0, f + ': «название» непустое');
    assert.ok(j['описание'].length > 0, f + ': «описание» непустое');
    assert.equal(JSON.stringify(j, null, 2) + '\n', raw,
      f + ': roundtrip-канон');
  });
  assert.equal(new Set(results).size, 50,
    'результаты покрывают новые предметы 1:1');
  assert.deepEqual(typeCounts, REC_TYPE_COUNTS_00032105,
    'тип-состав рецептов — масштаб факта 5/3/3 на 50: кузнечное 23 / '
    + 'алхимия 14 / зачарование 13; факт: ' + JSON.stringify(typeCounts));
});

// --- T9: зеркала -------------------------------------------------------

test('000321.05 T9: зеркала — src/items-data.js содержит 50 новых предметов ≡ JSON (getItem ≡ диск); src/craft-data.js содержит 50 рецептов с резолвом результат/исходники/навыки/здания в id (краснота: зеркало не регенерировано)', () => {
  assert.equal(ITD.ITEMS.length, 864,
    'items-data — 864; факт: ' + ITD.ITEMS.length);
  const mirrorById = new Map(ITD.ITEMS.map((it) => [it.id, it]));
  for (const [num, id] of ROSTER_00032105) {
    const j = JSON.parse(loadItemFile(num));
    const m = mirrorById.get(id);
    assert.ok(m, 'items-data: предмет «' + id + '»');
    assert.deepEqual(m, j, id + ': зеркало ≡ JSON поэлементно');
    assert.equal(I.getItem(id).name, j.name, id + ': getItem резолвится');
  }
  assert.equal(CRD.CRAFT.length, 693,
    'craft-data — 693; факт: ' + CRD.CRAFT.length);
  ROSTER_00032105.forEach(([, id]) => {
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
    assert.deepEqual(m['заклинания'], j['заклинания'],
      f + ': зеркало — «заклинания» (slug) целы');
  });
});

// --- T10: счётчики/канарейки -----------------------------------------

test('000321.05 T10: регресс-канарейки — каталог 864 ≡ items-data (ре-пин 000321.07: +50 зелий); tool 60 (10 + 50), artifact 63, shield 62, armor 257, weapon 72 (не выросли), spell_scroll 161 (ре-пин 000348: +1 Декаданс); slot — у 589, «прочих» без slot — 275 (свиток Декаданс + 50 зелий 000321.07 без slot); base_price РОВНО у 252 (ре-пин 000347.02) (у инструментов цены вычисляемые, НЕ вырос); free_cast — 28 (ре-пин 000321.06: +2 epic колец — в wave .05 добавлено 0); наборы 20 / 67 предметов (forger 2→5; moonlight 4 + tide 3 — новые сеты 000321.06); craft — 693 с типами зачарование 244 / кузнечное 173 / столярное 114 / резьба 86 / алхимия 74 / рунопись 2 (ре-пин 000321.07: +50 алхимии; ре-пин 000321.06: +25 зачарование +25 резьбы); иконки 831; stroke= — ровно 46 legacy (краснота: каталог 713)', () => {
  assert.equal(I.allItems().length, 864);
  assert.equal(ITD.ITEMS.length, 864, 'items-data ≡ каталог (864)');
  const all = I.allItems();
  assert.equal(all.filter((it) => it.kind === 'tool').length, 60,
    'tool — 60 (10 + 50); факт: '
    + all.filter((it) => it.kind === 'tool').length);
  assert.equal(all.filter((it) => it.kind === 'artifact').length, 63,
    'artifact — 63 (не вырос)');
  assert.equal(all.filter((it) => it.kind === 'shield').length, 62,
    'shield — 62 (не вырос)');
  assert.equal(all.filter((it) => it.kind === 'armor').length, 257,
    'armor — 257 (не вырос)');
  assert.equal(all.filter((it) => it.kind === 'weapon').length, 72,
    'weapon — 72 (не вырос)');
  assert.equal(all.filter((it) => it.kind === 'spell_scroll').length, 161,
    'spell_scroll — 161 (ре-пин 000348: +1 Декаданс)');
  const withBase = all.filter((it) => 'base_price' in it);
  assert.equal(withBase.length, 252,
    'base_price — ровно у 252 (инструменты не торгуют — не они '
    + 'добавили; ре-пин 000347.02: E1, base_price=value у всех '
    + 'spell_scroll); факт: ' + withBase.length);
  const withSlot = all.filter((it) => 'slot' in it);
  assert.equal(withSlot.length, 589,
    'slot — у 589 (489 + 50 + 50 колец 000321.06); факт: '
    + withSlot.length);
  assert.equal(864 - withSlot.length, 275,
    'прочих без slot — 275 (свиток Декаданс + 50 зелий 000321.07 — без slot)');
  const fc = [];
  for (const it of all) {
    for (const a of (it.affixes || [])) {
      if (a.type === 'free_cast') fc.push(it.rarity);
    }
  }
  assert.equal(fc.length, 28,
    'free_cast — 28 (волна .05 не добавляла; +2 epic кольца '
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
    'наборы — 20 (forger продолжен; +moonlight +tide 000321.06); '
    + 'факт: ' + Object.keys(sets).length);
  assert.equal(Object.values(sets).reduce((a, v) => a + v.length, 0), 67,
    'сетовых предметов — 67 (57 + 3 forger + 4 moonlight + 3 tide '
    + '000321.06); факт: '
    + Object.values(sets).reduce((a, v) => a + v.length, 0));
  assert.equal(sets.forger.length, 5, 'forger — 5 членов');
  const craftFiles = craftDataFiles(CRAFT_DIR);
  assert.equal(craftFiles.length, 693, 'craft — 693');
  const ct = {};
  for (const f of craftFiles) {
    const t = JSON.parse(
      fs.readFileSync(path.join(CRAFT_DIR, f), 'utf8'))['тип'];
    ct[t] = (ct[t] || 0) + 1;
  }
  assert.deepEqual(ct, {
    'зачарование': 244, 'кузнечное_дело': 173, 'столярное_дело': 114,
    'резьба_по_камню': 86, 'алхимия': 74, 'рунопись': 2,
  }, 'craft по типам; факт: ' + JSON.stringify(ct));
  const allSvg = fs.readdirSync(SPR_DIR).filter((f) => f.endsWith('.svg'));
  assert.equal(allSvg.length, 831, 'иконки sprites/items — 831');
  let strokeSeen = 0;
  for (const f of allSvg) {
    if (/stroke=/.test(fs.readFileSync(path.join(SPR_DIR, f), 'utf8'))) {
      strokeSeen++;
    }
  }
  assert.equal(strokeSeen, 46,
    'stroke= — ровно 46 legacy (заморозка 000335); факт: ' + strokeSeen);
});

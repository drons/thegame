// Задача 000321.04 (4-я из 13 дочерних 000321) — волна артефактов: 50
// предметов kind=artifact slot left_hand, 50 рецептов «зачарование»
// assets/craft, 50 flat-иконок 64×64 (паттерн 000302/000335 — иконки
// В ЭТОЙ дочерней: прецедент .01/.02/.03 — 50 иконок донесены одной
// дочерней). Редкость — 20/14/10/4/2 (контракт 000230). Сет:
// ПРОДОЛЖЕНИЕ arcane_focus (+3 члена epic/legendary/impossible; бонус
// побайтово ≡ существующим членам — SB13), сет остаётся DORMANT
// (порог «2» при единственном слоте left_hand — документированный
// disk-факт 000230.13 D-07, не регресс). stats.armor — у 12 из 50
// (факт старых 13: armor у 3 — «у части», ТЗ). free_cast — РОВНО 4
// (2 epic + 1 legendary + 1 impossible, по ОДНОМУ объекту-аффиксу на
// предмет — контракт канона c10c «26 предмета = 23 epic + 2 legendary
// + 1 impossible»). Пулы EQUIP_POOLS — append КОНЦОМ тиров каталожным
// порядком (единственный src-файл кроме зеркал); DROP/pickRarityTier/
// rollVictoryLoot — 0-diff. НОВЫХ реагентов НЕТ (прецедент .01–.03 —
// T8 анти-страж: исходники ∈ старый каталог). Артефакт ∉ виды кампа и
// броневидного магазина → GOLDEN_CAMP/броневые стоки 0-diff
// (держать зелёными БЕЗ правки); сдвигается только универсам
// (makeShop wealth 3, пул allItems — rng-хвост). Контракт —
// memory/000321-artifact-items.md + сводка memory/000321-items-batch.md.
// kind=node; require — node-модули + src-модули + tests/json-schema.js.
//
// Нумерация (резерв волны, факт диска на базе):
//   предметы 000664–000713; рецепты 000570–000619; иконки —
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

const NEW_FROM = 664;
const NEW_TO = 713;
const REC_FROM = 570;
const REC_TO = 619;

// --- Ростер волны (ТЗ + анализ; фиксируется здесь и в
// memory/000321-artifact-items.md §1). Строка:
// [номер, id, имя, редкость, armor (0 = stats КЛЮЧА НЕТ), value,
//  weight, skill-аффикс, amount, free_cast (spell|null), set|null,
//  «заклинания» рецепта, уровень]
const ROSTER_00032104 = [
  [664, 'bone_charm', 'Костяной оберег', 'common', 0, 30, 0.4, 'perception', 0.03, null, null, 'spark', 2],
  [665, 'ash_charm', 'Зольный оберег', 'common', 0, 32, 0.4, 'firelord', 0.04, null, null, 'firelight', 2],
  [666, 'reed_charm', 'Камышовый оберег', 'common', 1, 34, 0.45, 'icelord', 0.05, null, null, 'frost_bolt', 3],
  [667, 'pebble_charm', 'Галечный оберег', 'common', 0, 36, 0.4, 'runes', 0.03, null, null, 'ward', 3],
  [668, 'tin_charm', 'Оловянный оберег', 'common', 0, 38, 0.45, 'scholar', 0.04, null, null, 'blessing', 3],
  [669, 'shell_charm', 'Ракушечный оберег', 'common', 0, 40, 0.45, 'perception', 0.05, null, null, 'spark', 4],
  [670, 'straw_idol', 'Соломенный идол', 'common', 0, 42, 0.45, 'firelord', 0.03, null, null, 'firelight', 4],
  [671, 'flint_idol', 'Кременевой идол', 'common', 0, 44, 0.5, 'runes', 0.04, null, null, 'shatter', 4],
  [672, 'bark_idol', 'Корьяной идол', 'common', 0, 46, 0.5, 'scholar', 0.05, null, null, 'mend', 5],
  [673, 'dew_fetish', 'Росный фетиш', 'common', 0, 48, 0.45, 'precog', 0.03, null, null, 'veil_of_night', 5],
  [674, 'bone_fetish', 'Костяной фетиш', 'common', 0, 50, 0.5, 'icelord', 0.04, null, null, 'chill', 5],
  [675, 'amber_bead', 'Янтарная бусина', 'common', 0, 52, 0.5, 'perception', 0.04, null, null, 'spark', 6],
  [676, 'jet_bead', 'Гагатовая бусина', 'common', 0, 54, 0.5, 'precog', 0.05, null, null, 'veil_of_night', 6],
  [677, 'resin_bead', 'Смолистая бусина', 'common', 0, 56, 0.55, 'firelord', 0.05, null, null, 'flame_burst', 6],
  [678, 'salt_eye', 'Соляной глаз', 'common', 0, 57, 0.5, 'icelord', 0.03, null, null, 'freeze', 7],
  [679, 'moss_eye', 'Мховой глаз', 'common', 0, 58, 0.55, 'precog', 0.04, null, null, 'mend', 7],
  [680, 'clay_lens', 'Глиняная линза', 'common', 0, 60, 0.55, 'scholar', 0.03, null, null, 'mend', 7],
  [681, 'wood_lens', 'Деревянная линза', 'common', 0, 61, 0.55, 'runes', 0.05, null, null, 'ward', 8],
  [682, 'wool_tassel', 'Шерстяной султан', 'common', 1, 63, 0.6, 'perception', 0.05, null, null, 'blessing', 8],
  [683, 'hide_tassel', 'Кожаный султан', 'common', 1, 65, 0.6, 'firelord', 0.04, null, null, 'fireball', 9],
  [684, 'ember_bead', 'Тлеющая бусина', 'rare', 0, 70, 0.6, 'firelord', 0.05, null, null, 'flame_strike', 11],
  [685, 'frost_bead', 'Морозная бусина', 'rare', 0, 72, 0.6, 'icelord', 0.06, null, null, 'frost_bolt', 12],
  [686, 'rune_stone', 'Рунный камень', 'rare', 0, 75, 0.65, 'runes', 0.05, null, null, 'ward', 13],
  [687, 'scholar_lens', 'Линза учёного', 'rare', 0, 78, 0.6, 'scholar', 0.06, null, null, 'blessing', 14],
  [688, 'hawk_eye', 'Ястребиный глаз', 'rare', 0, 80, 0.65, 'perception', 0.07, null, null, 'spark', 15],
  [689, 'seer_stone', 'Камень провидца', 'rare', 0, 82, 0.65, 'precog', 0.06, null, null, 'veil_of_night', 16],
  [690, 'cinder_charm', 'Пепельный оберег', 'rare', 1, 84, 0.65, 'firelord', 0.07, null, null, 'flame_burst', 17],
  [691, 'rime_charm', 'Инейный оберег', 'rare', 1, 86, 0.7, 'icelord', 0.08, null, null, 'blizzard', 18],
  [692, 'ward_stone', 'Обережный камень', 'rare', 0, 88, 0.65, 'runes', 0.06, null, null, 'aegis', 19],
  [693, 'ink_tablet', 'Чернильная дощечка', 'rare', 0, 90, 0.65, 'scholar', 0.07, null, null, 'mend', 20],
  [694, 'watch_stone', 'Дозорный камень', 'rare', 0, 92, 0.7, 'precog', 0.07, null, null, 'blessing', 22],
  [695, 'spark_totem', 'Искрящийся тотем', 'rare', 0, 94, 0.65, 'firelord', 0.08, null, null, 'spark', 23],
  [696, 'chill_totem', 'Студящий тотем', 'rare', 0, 95, 0.7, 'icelord', 0.09, null, null, 'chill', 24],
  [697, 'glass_eye', 'Стеклянный глаз', 'rare', 1, 96, 0.7, 'perception', 0.09, null, null, 'aegis', 26],
  [698, 'runeglass', 'Руническое стекло', 'epic', 0, 180, 0.8, 'runes', 0.12, null, null, 'ward', 32],
  [699, 'prism_focus', 'Призматический фокус', 'epic', 0, 200, 0.85, 'runes', 0.14, null, 'arcane_focus', 'shatter', 34],
  [700, 'ward_prism', 'Обережная призма', 'epic', 1, 210, 0.9, 'perception', 0.11, null, null, 'ward', 36],
  [701, 'seer_monocle', 'Монокль провидца', 'epic', 0, 220, 0.85, 'precog', 0.15, null, null, 'veil_of_night', 38],
  [702, 'ember_core', 'Углевое ядро', 'epic', 1, 230, 0.9, 'firelord', 0.13, null, null, 'fireball', 40],
  [703, 'frost_core', 'Морозное ядро', 'epic', 0, 240, 0.9, 'icelord', 0.16, null, null, 'frostbite', 42],
  [704, 'mind_lattice', 'Решётка разума', 'epic', 0, 250, 0.95, 'precog', 0.12, 'shroud', null, 'shroud', 44],
  [705, 'flame_sigil', 'Печатка пламени', 'epic', 0, 260, 0.95, 'firelord', 0.17, null, null, 'flame_strike', 46],
  [706, 'ice_sigil', 'Ледяная печатка', 'epic', 1, 270, 1, 'icelord', 0.14, 'chill', null, 'chill', 48],
  [707, 'rune_tablet', 'Рунная дощечка', 'epic', 0, 300, 1, 'runes', 0.19, null, null, 'ward', 52],
  [708, 'archmage_eye', 'Око архимага', 'legendary', 1, 500, 1.2, 'scholar', 0.24, null, null, 'blessing', 62],
  [709, 'arcane_diadem', 'Венец тайн', 'legendary', 1, 560, 1.25, 'runes', 0.28, null, 'arcane_focus', 'aegis', 68],
  [710, 'star_compass', 'Звёздный компас', 'legendary', 0, 600, 1.25, 'precog', 0.32, null, null, 'circle_of_light', 72],
  [711, 'sun_reliquary', 'Солнечный реликварий', 'legendary', 0, 650, 1.3, 'firelord', 0.22, 'fire_aura', null, 'fire_aura', 78],
  [712, 'arcane_nexus', 'Арканный узел', 'impossible', 1, 1250, 1.5, 'runes', 0.4, null, 'arcane_focus', 'shatter', 94],
  [713, 'crown_of_ages', 'Корона веков', 'impossible', 0, 1290, 1.55, 'precog', 0.36, 'meteor', null, 'meteor', 98],
];

const ROSTER_IDS_00032104 = ROSTER_00032104.map((r) => r[1]);

const COMPOSITION_00032104 = {
  common: 20, rare: 14, epic: 10, legendary: 4, impossible: 2,
};

// value/weight — полосы тира (факт диска 13 артефактов 000230.13:
// rare value 70–100 weight 0.6–0.7, epic 180–300 / 0.8–1.0, legendary
// 500–650 / 1.2, impossible 1200 / 1.5 — полосы покрывают факт;
// common 30–65 / 0.4–0.6 — ниже старых rare, артефактного common
// факт не имел; impossible НИЖНЯЯ граница 1200 = ровно факт «Сердца
// Стихий»):
const VALUE_BAND_00032104 = {
  common: [30, 65], rare: [70, 100], epic: [180, 300],
  legendary: [500, 650], impossible: [1200, 1300],
};
const WEIGHT_BAND_00032104 = {
  common: [0.4, 0.6], rare: [0.6, 0.7], epic: [0.8, 1.0],
  legendary: [1.1, 1.3], impossible: [1.4, 1.6],
};
// Шкала amount (research §6, матрица 000230.03 — канон .01/.02/.03):
const AFFIX_SCALE_00032104 = {
  common: [0.02, 0.05], rare: [0.05, 0.10], epic: [0.10, 0.20],
  legendary: [0.20, 0.35], impossible: [0.35, 0.45],
};
// Skill-матрица слота (исследовательская матрица left_hand-артефакт:
// маг. школа + знание + восприятие + предвидение — соседство старых
// 13 артефактов: firelord/icelord/runes/scholar/perception/precog;
// ЯВНОЕ множество — урок раунда 3 .01: ветвь «любой навык каталога»
// запрещена):
const ARTIFACT_SKILLS_00032104 = new Set(['firelord', 'icelord',
  'runes', 'scholar', 'perception', 'precog']);
// Покрытие матрицы волной (факт ростера — сумма 50):
const SKILL_COVERAGE_00032104 = {
  firelord: 10, icelord: 8, runes: 10, scholar: 6, perception: 7,
  precog: 9,
};

// Сет-контракт: ПРОДОЛЖЕНИЕ arcane_focus (+3 члена epic/legendary/
// impossible; бонус НОВЫХ членов побайтово ≡ существующим — SB13).
// DORMANT (порог «2» при единственном слоте left_hand — 000230.13
// D-07; disk-прецеденты penitent/bulwark — лестница тиров для
// коллекционера, НЕ регресс; ember/rime из списка УБРАНЫ — ре-пин
// 000321.05 поглощено из реестра b16 (c): кольца ember/rime —
// EQUIP_PHYS_SLOTS, мощность >1 — АКТИВНЫ, факт b14 №2):
const FOCUS_BONUS_00032104 = {
  2: [{ type: 'skill', skill: 'runes', amount: 0.05 }],
};
const FOCUS_NEW_MEMBERS_00032104 = ['prism_focus', 'arcane_diadem',
  'arcane_nexus'];
const FOCUS_REF_00032104 = 375; // ward_crystal (живой член)

// Порядок ключей equip-канона для artifact (icon МЕЖДУ stats и slot —
// ловушка пина 000335; stats — КЛЮЧА НЕТ, когда armor нет (факт
// rune_charm/000370); set МЕЖДУ rarity и affixes, set_bonus —
// последним, факт ward_crystal/000375):
function keysForArtifact(armor, set) {
  const k = ['id', 'name', 'kind', 'weight', 'value', 'desc'];
  if (armor) k.push('stats');
  k.push('icon', 'slot', 'rarity');
  if (set) k.push('set');
  k.push('affixes');
  if (set) k.push('set_bonus');
  return k;
}

// Рецепты (000570–000619 — тот же порядок, что ростер; id рецепта =
// id результата; контракт .02 «результат покрывает волну 1:1 тем же
// порядком»). Тип — РОВНО «зачарование» (факт: ВСЕ 16 старых
// рецептов артефактов — зачарование, постройки 000018; ТЗ
// «постройки 18/40 — по факту»: 40 = резьба, артефактных рецептов
// на 40 нет). Навыки — [руны 000027 + навык-аффикс] (факт старых;
// у runes-аффикса второй — scholar 000026, прецедент rune_charm —
// дубль runes запрещён). «заклинания» — ровно 1 slug (минимум
// схемы для зачарования носит осмысленно); у free_cast-носителей —
// СВОЙ спелл free_cast. «база» НЕ используется: фиксированный
// диапазон ровно 50 при 1:1-покрытии не оставляет слотов
// improved-рецептам (семантика 000230.11) — обоснование в
// memory/000321-artifact-items.md.
const REC_TYPE_00032104 = 'зачарование';
const SKILL_FILE_00032104 = {
  firelord: '000023', icelord: '000024', scholar: '000026',
  runes: '000027', perception: '000028', precog: '000030',
};
// «уровень» ∈ диапазону редкости РЕЗУЛЬТАТА (конвенция
// RARITY_LEVEL_RANGE_00023008, craft.test.js — факт кода) + полоса
// волны:
const LEVEL_BAND_00032104 = {
  common: [2, 9], rare: [11, 26], epic: [32, 52], legendary: [62, 80],
  impossible: [94, 98],
};

const OLD_MAX = 663; // анти-страж «НОВЫХ реагентов нет»: исходники ∈ старый каталог
const OLD_ARTIFACT_NUMS = [370, 371, 372, 373, 374, 375, 376, 377,
  378, 379, 380, 381, 382]; // факт старых 13 (T4 покрытие полос)

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
    'assets/items/' + f + ' существует (краснота: каталог 663 — '
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

test('000321.04 T1: каталог — ровно 764 файла 000001–000764 подряд (ре-пин 000348: +1 свиток Декаданс 000764; ре-пин 000321.05: +50 инструментов 000714–000763); 50 новых (000664–000713) — kind artifact, slot РОВНО left_hand, полный equip-набор полей БЕЗ subtype/base_price/tier, порядок ключей = канон (stats — только у armor-предметов; icon МЕЖДУ stats и slot; set/set_bonus для сетовых), roundtrip-канон stringify(…,2)+\\n, валидность по assets/items/schema.json (краснота: каталог 663 — волна не добавлена)', () => {
  const files = fs.readdirSync(ITEMS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f)).sort();
  assert.equal(files.length, 764,
    'каталог — 764 файла (663 + 50 артефактов 000321.04 + 50 '
    + 'инструментов 000321.05 + 1 свиток Декаданс 000348); факт: '
    + files.length + ' (краснота: волна не добавлена)');
  const schema = JSON.parse(
    fs.readFileSync(path.join(ITEMS_DIR, 'schema.json'), 'utf8'));
  for (const [num, id, name, , armor] of ROSTER_00032104) {
    const f = String(num).padStart(6, '0') + '.json';
    assert.equal(files[num - 1], f,
      'каталожный порядок: позиция ' + num + ' — ' + f);
    const raw = loadItemFile(num);
    const j = JSON.parse(raw);
    assert.deepEqual(validateData(schema, j, f), [], f + ': схема');
    assert.equal(j.id, id, f + ': id «' + id + '»');
    assert.equal(j.name, name, f + ': имя «' + name + '»');
    assert.equal(j.kind, 'artifact', f + ': kind artifact');
    assert.equal(j.slot, 'left_hand',
      f + ': slot РОВНО left_hand; факт: ' + j.slot);
    assert.deepEqual(Object.keys(j),
      keysForArtifact(armor === 1, j.set !== undefined),
      f + ': порядок ключей = канон equip'
      + (j.set !== undefined ? ' (сетового)' : '')
      + (armor ? ' (armor)' : ' (без stats)'));
    if (armor) {
      assert.deepEqual(j.stats, { armor: 1 },
        f + ': stats — ровно { armor: 1 }');
    } else {
      assert.equal(j.stats, undefined,
        f + ': stats КЛЮЧА НЕТ (armor только «у части» — факт '
        + 'rune_charm 000370, НЕ armor:0)');
    }
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

test('000321.04 T2: ростер — 50 строк id/rarity/armor/value/weight/аффикс/set сверяются с JSON; sweep: id уникальны в 764, ИМЕНА и ОПИСАНИЯ уникальны по ВСЕМУ каталогу (включая щиты 000614–000663) (краснота: каталог 663)', () => {
  const files = fs.readdirSync(ITEMS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f)).sort();
  assert.equal(files.length, 764, 'каталог — 764; факт: ' + files.length);
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
  assert.equal(ids.size, 764);
  for (const [num, id, name, rarity, armor, value, weight,
      skill, amount, fc, set] of ROSTER_00032104) {
    const j = JSON.parse(loadItemFile(num));
    assert.equal(j.name, name, id + ': имя == ростер');
    assert.equal(j.rarity, rarity, id + ': rarity == ростер');
    assert.equal((j.stats || {}).armor, armor ? 1 : undefined,
      id + ': armor ' + armor + '; факт stats: ' + JSON.stringify(j.stats));
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

test('000321.04 T3: редкость волны РОВНО 20/14/10/4/2; rarity-множество каталога 529 (212/147/107/42/21); EQUIP_POOLS: размеры 212/147/107/42/21, прежние префиксы целы (пул ≡ live-каталогу по редкости — EQ2/CH4), хвосты = id волны каталожным порядком ПЕРЕД 50 инструментов 000321.05; универсам (makeShop wealth 3, пул allItems) видит артефакты без правки кода; ARMOR_SHOP и барахолка кампа НЕ видят артефактов (вид artifact ∉ их виды — GOLDEN_CAMP/броневые стоки 0-diff); DROP/pickRarityTier 0-diff (краснота: в пулах новых id нет)', () => {
  const rarCount = {};
  for (const [num] of ROSTER_00032104) {
    const j = JSON.parse(loadItemFile(num));
    rarCount[j.rarity] = (rarCount[j.rarity] || 0) + 1;
  }
  assert.deepEqual(rarCount, COMPOSITION_00032104,
    'редкость волны РОВНО 20/14/10/4/2 (контракт 000230 на 50); факт: '
    + JSON.stringify(rarCount));
  const all = I.allItems();
  assert.equal(all.length, 764, 'live-каталог — 764');
  const rarAll = {};
  for (const it of all) {
    if (it.rarity) rarAll[it.rarity] = (rarAll[it.rarity] || 0) + 1;
  }
  assert.equal(Object.values(rarAll).reduce((a, b) => a + b, 0), 529,
    'rarity-множество каталога — 529 (479 + 50 инструментов '
    + '000321.05); факт: '
    + JSON.stringify(rarAll));
  assert.deepEqual(rarAll, { common: 212, rare: 147, epic: 107,
    legendary: 42, impossible: 21 },
    'rarity-множество РОВНО 212/147/107/42/21; факт: '
    + JSON.stringify(rarAll));
  const P = L.EQUIP_POOLS;
  const expected = { common: 212, rare: 147, epic: 107, legendary: 42,
    impossible: 21 };
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
    const wave = ROSTER_00032104.filter((r) => r[3] === tier).map((r) => r[1]);
    assert.deepEqual(P[tier].slice(-(2 * wave.length),
        -wave.length), wave,
      tier + '-хвост = ' + wave.length + ' новых ' + tier
      + ' каталожным порядком + инструменты 000321.05 ПОСЛЕ '
      + '(append-only; ре-пин 000321.05)');
  }
  const B = require('../src/map.js').BUILDING_TYPES;
  const waveSet = new Set(ROSTER_IDS_00032104);
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
    'артефакты попадают в сток универсама (пул allItems) хотя бы на '
    + 'одном семени; факт hits=' + uniHits + ' (краснота: зеркало не '
    + 'регнерировано)');
  assert.equal(armorHits, 0,
    'ARMOR_SHOP (виды [armor]) НЕ видит kind artifact — сток брони '
    + '0-diff; факт hits=' + armorHits);
  const campRec = JSON.parse(fs.readFileSync(
    path.join(BUILDINGS_DIR, 'camp.json'), 'utf8'));
  for (const w of [2, 3]) {
    const camp = I.makeCampShop(10, 20, 1, w, campRec);
    for (const id of Object.keys(camp.stock)) {
      assert.ok(!waveSet.has(id),
        'барахолка кампа (виды food/potion/weapon/armor) НЕ видит '
        + 'артефакты — GOLDEN_CAMP 0-diff; факт: ' + id + ' (w=' + w + ')');
    }
  }
  assert.equal(L.RARITY.reduce((s, t) => s + t.chance, 0), 1,
    'DROP-таблица — Σ 1 (НЕ тронута)');
  assert.equal(L.RARITY.map((t) => t.id).join(','),
    'common,rare,epic,legendary,impossible',
    'канонический порядок тиров — цел');
});

// --- T4: envelope armor/weight/value --------------------------------

test('000321.04 T4: stats.armor — РОВНО у 12 из 50 (ростер: 3/3/3/2/1 по тирам — «у части», факт старых 3/13), у остальных stats КЛЮЧА НЕТ; armor РОВНО 1 (факт старых: у амулетов left_hand armor 1); value ∈ полосам тира (покрывают факт старых 13: rare 70–100, epic 180–300, legendary 500–650, impossible 1200); weight ∈ полосам тира (факт старых 0.6–1.5); base_price/tier/subtype отсутствуют (краснота: файлы волны не созданы)', () => {
  let armorCount = 0;
  for (const [num, id, name, rarity, armor] of ROSTER_00032104) {
    const j = JSON.parse(loadItemFile(num));
    if (armor) {
      armorCount++;
      assert.equal(j.stats.armor, 1,
        id + ': armor РОВНО 1 (факт леворуких амулетов); факт: '
        + j.stats.armor);
    } else {
      assert.equal(j.stats, undefined, id + ': stats нет');
    }
    const [vlo, vhi] = VALUE_BAND_00032104[rarity];
    assert.ok(j.value >= vlo && j.value <= vhi,
      id + ': value ' + j.value + ' в полосе ' + rarity + ' ' + vlo
      + '–' + vhi);
    const [wlo, whi] = WEIGHT_BAND_00032104[rarity];
    assert.ok(j.weight >= wlo && j.weight <= whi,
      id + ': weight ' + j.weight + ' в полосе ' + rarity + ' ' + wlo
      + '–' + whi);
    assert.equal(j.base_price, undefined, id + ': base_price нет');
    assert.equal(j.tier, undefined, id + ': tier нет');
    assert.equal(j.subtype, undefined, id + ': subtype нет');
  }
  assert.equal(armorCount, 12,
    'armor — ровно 12 из 50 (3 common + 3 rare + 3 epic + 2 legendary '
    + '+ 1 impossible — «у части», ТЗ/анализ); факт: ' + armorCount);
  // Покрываем факт старых 13 артефактов (полосы не уехали):
  for (const num of OLD_ARTIFACT_NUMS) {
    const j = JSON.parse(fs.readFileSync(path.join(ITEMS_DIR,
      String(num).padStart(6, '0') + '.json'), 'utf8'));
    const [vlo, vhi] = VALUE_BAND_00032104[j.rarity];
    const [wlo, whi] = WEIGHT_BAND_00032104[j.rarity];
    assert.ok(j.value >= vlo && j.value <= vhi,
      'старый ' + num + ': value ' + j.value + ' в полосе тира');
    assert.ok(j.weight >= wlo && j.weight <= whi,
      'старый ' + num + ': weight ' + j.weight + ' в полосе тира');
  }
});

// --- T5: аффиксы ------------------------------------------------------

test('000321.04 T5: аффиксы — РОВНО 1 skill-аффикс на предмет; skill ∈ ЯВНОЙ матрицы left_hand-артефакт (firelord/icelord/runes/scholar/perception/precog — соседство старых 13); покрытие матрицы волном РОВНО 10/8/10/6/7/9; amount ∈ шкале редкости (канон .01/.02/.03); free_cast РОВНО 4 (2 epic + 1 legendary + 1 impossible, по ОДНОМУ объекту-аффиксу на предмет — epic+ по ТЗ, каталожный итог 26), spell ∈ каталог assets/spells (краснота: файлы волны не созданы)', () => {
  const skillSet = skillIds();
  const spells = spellIds();
  const freeCast = [];
  const coverage = {};
  for (const [num, id] of ROSTER_00032104) {
    const j = JSON.parse(loadItemFile(num));
    assert.ok(Array.isArray(j.affixes) && j.affixes.length >= 1,
      id + ': ≥1 аффикс');
    const skills = j.affixes.filter((a) => a.type === 'skill');
    const fcs = j.affixes.filter((a) => a.type === 'free_cast');
    assert.equal(skills.length, 1, id + ': ровно 1 skill-аффикс');
    assert.equal(fcs.length, j.affixes.length - 1,
      id + ': остальные — только free_cast');
    assert.ok(ARTIFACT_SKILLS_00032104.has(skills[0].skill),
      id + ': skill «' + skills[0].skill
      + '» вне матрицы left_hand-артефакт');
    assert.ok(skillSet.has(skills[0].skill),
      id + ': skill ∈ каталогу assets/skills');
    coverage[skills[0].skill] = (coverage[skills[0].skill] || 0) + 1;
    const [alo, ahi] = AFFIX_SCALE_00032104[j.rarity];
    assert.ok(skills[0].amount >= alo && skills[0].amount <= ahi,
      id + ': amount ' + skills[0].amount + ' в шкале ' + j.rarity
      + ' ' + alo + '–' + ahi);
    assert.ok(fcs.length <= 1,
      id + ': не больше ОДНОГО free_cast-объекта (канон c10c: '
      + 'предметов == объектов — memory/000321-artifact-items.md)');
    for (const a of fcs) {
      assert.ok(spells.has(a.spell), id + ': free_cast spell ∈ каталогу');
      assert.ok(['epic', 'legendary', 'impossible'].includes(j.rarity),
        id + ': free_cast — epic+ (ТЗ «free_cast epic+»)');
      freeCast.push(a.spell);
    }
  }
  assert.equal(freeCast.length, 4,
    'free_cast в волне — ровно 4; факт: ' + freeCast.length);
  assert.equal(new Set(freeCast).size, 4,
    '4 РАЗНЫХ спелла free_cast; факт: ' + freeCast.join(','));
  assert.deepEqual(coverage, SKILL_COVERAGE_00032104,
    'покрытие skill-матрицы волной РОВНО firelord 10 / icelord 8 / '
    + 'runes 10 / scholar 6 / perception 7 / precog 9 (=50); факт: '
    + JSON.stringify(coverage));
});

// --- T6: сеты ---------------------------------------------------------

test('000321.04 T6: сеты — arcane_focus ПРОДОЛЖЕН: РОВНО 5 членов каталога (2 старых epic + 3 новых e/l/i), set_bonus НОВЫХ членов deepEqual существующим (SB13: {2:[{skill runes 0.05}]}); других новых set в волне нет; set без set_bonus не встречается; DORMANT зафиксирован явно: все 5 членов в ОДНОМ слоте left_hand — порог «2» неактивируем (disk-факт 000230.13 D-07, прецеденты penitent/bulwark — лестница тиров для коллекционера, НЕ регресс; ember/rime — кольца, АКТИВНЫ — ре-пин 000321.05, поглощено из реестра b16 (c)) (краснота: файлы волны не созданы)', () => {
  for (const [num, id] of ROSTER_00032104) {
    const j = JSON.parse(loadItemFile(num));
    if (j.set === undefined) {
      assert.equal(j.set_bonus, undefined, id + ': set без set_bonus');
      continue;
    }
    assert.equal(j.set, 'arcane_focus',
      id + ': новых сетов в волне нет — только продолжение '
      + 'arcane_focus; факт: ' + j.set);
  }
  const members = [];
  for (const f of fs.readdirSync(ITEMS_DIR)
    .filter((x) => /^\d{6}\.json$/.test(x))) {
    const j = JSON.parse(
      fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8'));
    if (j.set === 'arcane_focus') members.push(j);
  }
  assert.equal(members.length, 5,
    'arcane_focus — ровно 5 членов (2 + 3 волны); факт: '
    + members.length);
  assert.deepEqual(members.map((j) => j.id).sort(),
    ['arcane_diadem', 'arcane_nexus', 'cinder_eye', 'prism_focus',
      'ward_crystal'],
    'arcane_focus: состав членов');
  assert.deepEqual(members.map((j) => j.rarity).sort(),
    ['epic', 'epic', 'epic', 'impossible', 'legendary'],
    'arcane_focus: лестница тиров e/e/e/l/i');
  const ref = JSON.parse(fs.readFileSync(path.join(ITEMS_DIR,
    String(FOCUS_REF_00032104).padStart(6, '0') + '.json'), 'utf8'));
  for (const j of members) {
    assert.deepEqual(j.set_bonus, FOCUS_BONUS_00032104,
      j.id + ': set_bonus arcane_focus побайтово ≡ существующим '
      + 'членам (SB13/D-03)');
    assert.deepEqual(j.set_bonus, ref.set_bonus,
      j.id + ': set_bonus ≡ ward_crystal');
  }
  assert.deepEqual(new Set(members.map((j) => j.slot)),
    new Set(['left_hand']),
    'DORMANT: все члены в единственном слоте left_hand — порог «2» '
    + 'недостижим (зафиксированный disk-факт, не регресс)');
  assert.ok(FOCUS_NEW_MEMBERS_00032104.every((id) =>
    members.some((j) => j.id === id)),
    'новые члены arcane_focus: prism_focus/arcane_diadem/arcane_nexus');
});

// --- T7: иконки -------------------------------------------------------

test('000321.04 T7: иконки — у 50 новых поле icon ↔ файл существует; биекция json↔svg по basename; flat-SVG 64×64: viewBox ровно 1, ПЕРВЫЙ элемент — тень-эллипс rgba(0,0,0,0.22), без linearGradient/radialGradient/text/path/use/stroke (паттерн 000302/000335); sha256-уникальность против всех 731 иконок (ре-пин 000348: +1 иконка decadance_scroll; ре-пин 000321.05: 680 → 730 +50 инструментов; краснота: файлы не созданы)', () => {
  const allSvg = fs.readdirSync(SPR_DIR).filter((f) => f.endsWith('.svg'));
  assert.equal(allSvg.length, 731,
    'assets/sprites/items — 731 (680 + 50 инструментов '
    + '000321.05 + 1 свиток Декаданс 000348); факт: ' + allSvg.length);
  const hash = (p) => createHash('sha256').update(fs.readFileSync(p))
    .digest('hex');
  const hashes = new Map();
  for (const f of allSvg) {
    hashes.set(hash(path.join(SPR_DIR, f)), f);
  }
  assert.equal(hashes.size, 731, 'все 731 иконок byte-уникальны');
  for (const [, id] of ROSTER_00032104) {
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

test('000321.04 T8: 50 рецептов 000570–000619 подряд; результат покрывает НОВЫЕ предметы 1:1 (тот же порядок); id рецепта = id результата; тип РОВНО «зачарование» (факт: все 16 старых артефактных рецептов); здания РОВНО [000018] (факт зачарования; 40 — резьба, не трогать); навыки [руны 000027 + навык-аффикс] (у runes-аффикса — scholar 000026, прецедент rune_charm); «заклинания» РОВНО 1 slug ∈ каталог spells (у free_cast-носителей — свой спелл); «база» отсутствует (схема не требует; improved-семантика 000230.11 не в 1:1-диапазоне); «уровень» ∈ полосе редкости результата; исходники ∈ СТАРЫЙ каталог 000001–000663 (НОВЫХ реагентов нет — прецедент .01/.02/.03); «название»/«описание» рецептов уникальны по каталогу craft; roundtrip-канон (краснота: каталог craft 493 — рецептов нет)', () => {
  const files = fs.readdirSync(CRAFT_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f)).sort();
  assert.equal(files.length, 593,
    'craft — 593 файла (493 + 50 рецептов 000321.04 + 50 рецептов '
    + '000321.05); факт: '
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
  const results = [];
  ROSTER_00032104.forEach(([num, id, name, rarity, armor, value,
      weight, skill, amount, fc, set, spell, level], i) => {
    const recNum = REC_FROM + i;
    const f = String(recNum).padStart(6, '0') + '.json';
    assert.equal(files[files.length - 100 + i], f,
      'каталожный порядок: 50 новых — предпоследние 50, перед 50 '
      + 'рецептов инструментов 000321.05 (ре-пин 000321.05), ' + f);
    const raw = fs.readFileSync(path.join(CRAFT_DIR, f), 'utf8');
    const j = JSON.parse(raw);
    assert.deepEqual(validateData(schema, j, f), [], f + ': схема');
    assert.equal(j['id'], id, f + ': id рецепта = id результата');
    assert.equal(j['тип'], REC_TYPE_00032104, f + ': тип «зачарование»');
    assert.equal(j['результат']['предмет'],
      'assets/items/' + String(num).padStart(6, '0') + '.json',
      f + ': результат — предмет волны (тот же порядок)');
    results.push(j['результат']['предмет']);
    assert.equal(j['база'], undefined,
      f + ': «база» отсутствует (схема не требует; 1:1-диапазон '
      + 'ровно 50 — improved-слотов нет, memory)');
    assert.equal(j['результат']['количество'], 1, f + ': количество 1');
    assert.ok(j['уровень'] >= LEVEL_BAND_00032104[rarity][0]
        && j['уровень'] <= LEVEL_BAND_00032104[rarity][1],
      f + ': уровень ' + j['уровень'] + ' ∈ полосе ' + rarity + ' '
      + LEVEL_BAND_00032104[rarity].join('–') + ' (RARITY_LEVEL_RANGE)');
    assert.equal(j['уровень'], level, f + ': уровень ' + level);
    assert.deepEqual(j['здания'].map((b) => buildingTargetId(b)), [18],
      f + ': здания РОВНО [mage_tower=18] (зачарование — факт старых '
      + 'артефактных рецептов; 000040 = резьба не трогать)');
    for (const b of j['здания']) {
      assert.ok(buildings.has(b.split('/').pop()), f + ': здание ' + b);
    }
    const second = skill === 'runes' ? 'scholar' : skill;
    const skillNames = j['навыки'].map(
      (s) => skillById.get(refNum(s) + '.json'));
    for (const s of j['навыки']) {
      assert.ok(skills.has(refNum(s) + '.json'), f + ': навык ' + s);
    }
    assert.deepEqual(skillNames, ['runes', second],
      f + ': навыки = [runes, ' + second + ']'
      + (skill === 'runes' ? ' (runes-аффикс → scholar — прецедент '
        + 'rune_charm, дубль runes запрещён)' : ''));
    assert.ok(Array.isArray(j['заклинания'])
      && j['заклинания'].length === 1,
      f + ': «заклинания» РОВНО 1 (зачарование — факт старых 16)');
    assert.ok(spells.has(j['заклинания'][0]),
      f + ': «заклинания» slug ∈ каталогу assets/spells; факт: '
      + j['заклинания'][0]);
    assert.equal(j['заклинания'][0], spell,
      f + ': спелл рецепта == ростер; факт: ' + j['заклинания'][0]);
    if (fc !== null) {
      assert.equal(j['заклинания'][0], fc,
        f + ': free_cast-носитель — СВОЙ спелл free_cast («' + fc + '»)');
    }
    assert.ok(Array.isArray(j['исходники'])
      && j['исходники'].length >= 1, f + ': исходники ≥1');
    for (const src of j['исходники']) {
      const n = refNum(src['предмет']);
      assert.ok(itemFiles.has(n + '.json'),
        f + ': исходник ' + src['предмет'] + ' ∈ каталогу');
      assert.ok(Number(n) <= OLD_MAX,
        f + ': исходник ' + src['предмет'] + ' ∈ СТАРЫЙ каталог '
        + '(НОВЫХ реагентов не создаём — прецедент .01/.02/.03)');
    }
    assert.ok(j['название'].length > 0, f + ': «название» непустое');
    assert.ok(j['описание'].length > 0, f + ': «описание» непустое');
    assert.equal(JSON.stringify(j, null, 2) + '\n', raw,
      f + ': roundtrip-канон');
  });
  assert.equal(new Set(results).size, 50,
    'результаты покрывают новые предметы 1:1');
});

// --- T9: зеркала -------------------------------------------------------

test('000321.04 T9: зеркала — src/items-data.js содержит 50 новых предметов ≡ JSON (getItem ≡ диск); src/craft-data.js содержит 50 рецептов с резолвом результат/исходники/навыки/здания в id (краснота: зеркало не регенерировано)', () => {
  assert.equal(ITD.ITEMS.length, 764,
    'items-data — 764; факт: ' + ITD.ITEMS.length);
  const mirrorById = new Map(ITD.ITEMS.map((it) => [it.id, it]));
  for (const [num, id] of ROSTER_00032104) {
    const j = JSON.parse(loadItemFile(num));
    const m = mirrorById.get(id);
    assert.ok(m, 'items-data: предмет «' + id + '»');
    assert.deepEqual(m, j, id + ': зеркало ≡ JSON поэлементно');
    assert.equal(I.getItem(id).name, j.name, id + ': getItem резолвится');
  }
  assert.equal(CRD.CRAFT.length, 593,
    'craft-data — 593; факт: ' + CRD.CRAFT.length);
  ROSTER_00032104.forEach(([, id], i) => {
    const f = String(REC_FROM + i).padStart(6, '0') + '.json';
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

test('000321.04 T10: регресс-канарейки — каталог 764 ≡ items-data; artifact 63 (13 + 50), shield 62, armor 257, weapon 72 (не выросли), spell_scroll 161 (ре-пин 000348: +1 Декаданс); slot — у 539, «прочих» без slot — 225 (не меняется); base_price РОВНО у 44 (ре-пин 000320.15: +3 свитка Торговца свитками — base_price=value; у артефактов цены вычисляемые, НЕ вырос из-за волны); free_cast — 26 (22 + 2 epic + 1 legendary + 1 impossible — 23 epic + 2 legendary + 1 impossible); наборы 18 / 60 предмет (arcane_focus 2→5, forger +3 000321.05, новых сетов нет); craft — 593 с типами зачарование 219 / кузнечное 173 / столярное 114 / резьба 61 / алхимия 24 / рунопись 2 (ре-пин 000321.05: +50 рецептов инструментов); иконки 731; stroke= — ровно 46 legacy (краснота: каталог 663)', () => {
  assert.equal(I.allItems().length, 764);
  assert.equal(ITD.ITEMS.length, 764, 'items-data ≡ каталог (764)');
  const all = I.allItems();
  assert.equal(all.filter((it) => it.kind === 'artifact').length, 63,
    'artifact — 63 (13 + 50); факт: '
    + all.filter((it) => it.kind === 'artifact').length);
  assert.equal(all.filter((it) => it.kind === 'shield').length, 62,
    'shield — 62 (не вырос)');
  assert.equal(all.filter((it) => it.kind === 'armor').length, 257,
    'armor — 257 (не вырос)');
  assert.equal(all.filter((it) => it.kind === 'weapon').length, 72,
    'weapon — 72 (не вырос)');
  assert.equal(all.filter((it) => it.kind === 'spell_scroll').length, 161,
    'spell_scroll — 161 (ре-пин 000348: +1 Декаданс)');
  const withBase = all.filter((it) => 'base_price' in it);
  assert.equal(withBase.length, 44,
    'base_price — ровно у 44 (ре-пин 000320.15: +3 свитка Торговца свитками '
    + '— base_price=value); факт: ' + withBase.length);
  const withSlot = all.filter((it) => 'slot' in it);
  assert.equal(withSlot.length, 539,
    'slot — у 539 (439 + 50 + 50 инструментов 000321.05); факт: '
    + withSlot.length);
  assert.equal(764 - withSlot.length, 225,
    'прочих без slot — 225 (у артефактов slot есть, свиток Декаданс — без slot)');
  const fc = [];
  for (const it of all) {
    for (const a of (it.affixes || [])) {
      if (a.type === 'free_cast') fc.push(it.rarity);
    }
  }
  assert.equal(fc.length, 26,
    'free_cast — 26 (22 + 4 волны); факт: ' + fc.length);
  assert.deepEqual({ epic: fc.filter((r) => r === 'epic').length,
    legendary: fc.filter((r) => r === 'legendary').length,
    impossible: fc.filter((r) => r === 'impossible').length },
  { epic: 23, legendary: 2, impossible: 1 },
  'free_cast: 23 epic + 2 legendary + 1 impossible');
  const sets = {};
  for (const it of all) {
    if (it.set) (sets[it.set] = sets[it.set] || []).push(it.id);
  }
  assert.equal(Object.keys(sets).length, 18,
    'наборы — 18 (новых нет — arcane_focus продолжен); факт: '
    + Object.keys(sets).length);
  assert.equal(Object.values(sets).reduce((a, v) => a + v.length, 0), 60,
    'сетовых предметов — 60 (54 + 3 arcane_focus + 3 forger '
    + '000321.05); факт: '
    + Object.values(sets).reduce((a, v) => a + v.length, 0));
  assert.equal(sets.arcane_focus.length, 5, 'arcane_focus — 5 членов');
  const craftFiles = fs.readdirSync(CRAFT_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f));
  assert.equal(craftFiles.length, 593, 'craft — 593');
  const ct = {};
  for (const f of craftFiles) {
    const t = JSON.parse(
      fs.readFileSync(path.join(CRAFT_DIR, f), 'utf8'))['тип'];
    ct[t] = (ct[t] || 0) + 1;
  }
  assert.deepEqual(ct, {
    'зачарование': 219, 'кузнечное_дело': 173, 'столярное_дело': 114,
    'резьба_по_камню': 61, 'алхимия': 24, 'рунопись': 2,
  }, 'craft по типам; факт: ' + JSON.stringify(ct));
  const allSvg = fs.readdirSync(SPR_DIR).filter((f) => f.endsWith('.svg'));
  assert.equal(allSvg.length, 731, 'иконки sprites/items — 731');
  let strokeSeen = 0;
  for (const f of allSvg) {
    if (/stroke=/.test(fs.readFileSync(path.join(SPR_DIR, f), 'utf8'))) {
      strokeSeen++;
    }
  }
  assert.equal(strokeSeen, 46,
    'stroke= — ровно 46 legacy (заморозка 000335); факт: ' + strokeSeen);
});

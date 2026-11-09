// Задача 000321.02 (2-я из 13 дочерних 000321) — волна брони: 50
// предметов kind=armor (slot из 8-слотового набора head/ears/neck/
// torso/forearms/palms/legs/feet), 50 рецептов assets/craft, 50
// flat-иконок 64×64 (паттерн 000302/000335 — иконки В ЭТОЙ дочерней:
// equip без icon ломает E-канон «иконки у всех»; прецедент .01 — 50
// иконок донесены одной дочерней). Редкость — 20/14/10/4/2 (контракт
// 000230). Сеты: НОВЫЙ vigil (4 члена в 4 разных слотах, тиры
// c/r/e/l) + завершение порогов «4» у traveller (+feet) и mystic
// (+ears) — бонусы байт-в-байт с существующими членами (SB13).
// Пулы EQUIP_POOLS — append КОНЦОМ тиров каталожным порядком
// (единственный src-файл кроме зеркал); DROP/pickRarityTier/
// rollVictoryLoot — 0-diff. НОВЫХ реагентов НЕТ (прецедент .01 —
// T8 анти-страж: исходники ∈ старый каталог). Контракт —
// memory/000321-armor-items.md + сводка memory/000321-items-batch.md.
// kind=node; require — node-модули + src-модули + tests/json-schema.js.
//
// Нумерация (резерв волны, факт диска на базе):
//   предметы 000564–000613; рецепты 000470–000519; иконки —
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

const NEW_FROM = 564;
const NEW_TO = 613;
const REC_FROM = 470;
const REC_TO = 519;

// --- Ростер волны (ТЗ + анализ; фиксируется здесь и в
// memory/000321-armor-items.md §1). Строка:
// [номер, id, имя, slot, редкость, armor, value, weight,
//  skill-аффикс, amount, free_cast (spell|null), set|null]
const ROSTER_00032102 = [
  [564, 'patched_helm', 'Драный шлемок', 'head', 'common', 1, 16, 0.4, 'perception', 0.04, null, null],
  [565, 'felt_coif', 'Войлочный подшлемник', 'head', 'common', 0, 14, 0.3, 'meditation', 0.03, null, null],
  [566, 'tin_morion', 'Оловянный ерихон', 'head', 'common', 1, 20, 0.6, 'precog', 0.03, null, null],
  [567, 'riveted_helm', 'Клёпаный шлем', 'head', 'rare', 2, 80, 1.0, 'scholar', 0.06, null, null],
  [568, 'steel_shishak', 'Стальной шишак', 'head', 'rare', 1, 90, 1.1, 'perception', 0.07, null, null],
  [569, 'rune_circlet', 'Рунный венец', 'head', 'epic', 3, 260, 0.8, 'elder', 0.13, null, null],
  [570, 'vigil_helm', 'Шлем дозорной заставы', 'head', 'legendary', 3, 700, 1.4, 'precog', 0.24, null, 'vigil'],
  [571, 'boar_tusk_earring', 'Серьга с кабаньим клыком', 'ears', 'common', 0, 12, 0.05, 'perception', 0.03, null, null],
  [572, 'spiral_earring', 'Спиральная серьга', 'ears', 'common', 1, 14, 0.08, 'artist', 0.02, null, null],
  [573, 'shell_wire_earring', 'Ракушка на проволокке', 'ears', 'common', 0, 13, 0.06, 'orator', 0.04, null, null],
  [574, 'silver_drop_earring', 'Серебряная капля', 'ears', 'rare', 1, 60, 0.1, 'meditation', 0.06, null, null],
  [575, 'moonstone_stud', 'Серёжка с лунным камнем', 'ears', 'rare', 0, 70, 0.12, 'elder', 0.07, null, null],
  [576, 'mystic_earring', 'Мистическая серьга', 'ears', 'epic', 1, 280, 0.15, 'meditation', 0.15, null, 'mystic'],
  [577, 'dawn_ear_cuff', 'Серьга утренней зари', 'ears', 'legendary', 1, 520, 0.2, 'precog', 0.22, null, null],
  [578, 'fang_lanyard', 'Шнурок с клыком', 'neck', 'common', 0, 13, 0.1, 'artist', 0.03, null, null],
  [579, 'vial_charm', 'Пузырёк на шнурке', 'neck', 'common', 1, 15, 0.12, 'meditation', 0.02, null, null],
  [580, 'copper_beads', 'Медная мониста', 'neck', 'common', 0, 16, 0.15, 'scholar', 0.04, null, null],
  [581, 'silver_pendant_chain', 'Серебряная цепь с кулоном', 'neck', 'rare', 1, 65, 0.16, 'orator', 0.06, null, null],
  [582, 'amethyst_collar', 'Ожерелье с аметистовой бусиной', 'neck', 'rare', 0, 75, 0.18, 'perception', 0.08, null, null],
  [583, 'warder_pendant', 'Оберег щита', 'neck', 'epic', 1, 240, 0.2, 'scholar', 0.12, 'magic_shield', null],
  [584, 'twilight_necklace', 'Ожерелье сумерек', 'neck', 'epic', 1, 230, 0.2, 'meditation', 0.16, null, null],
  [585, 'quilted_jack', 'Короткая стёганка', 'torso', 'common', 1, 22, 1.8, 'endurance', 0.03, null, null],
  [586, 'warder_cuirass', 'Кираса дозорного', 'torso', 'rare', 2, 95, 4.5, 'hide', 0.07, null, null],
  [587, 'vigil_plate', 'Панцирь дозорной заставы', 'torso', 'epic', 3, 330, 6.5, 'breath', 0.14, null, 'vigil'],
  [588, 'hide_bracers', 'Кожаные наручи', 'forearms', 'common', 1, 18, 0.4, 'swordsman', 0.03, null, null],
  [589, 'wool_bracers', 'Суконные наручи', 'forearms', 'common', 1, 20, 0.3, 'step', 0.04, null, null],
  [590, 'silver_bracers', 'Серебряные наручи', 'forearms', 'rare', 2, 85, 0.8, 'swordsman', 0.06, null, null],
  [591, 'thorn_bracers', 'Колючие наручи', 'forearms', 'rare', 1, 88, 0.7, 'fists', 0.08, null, null],
  [592, 'engraved_bracers', 'Резные наручи', 'forearms', 'epic', 3, 310, 1.2, 'thief', 0.15, null, null],
  [593, 'gilded_vambraces', 'Латные наручи гвардии', 'forearms', 'legendary', 4, 640, 1.8, 'heavy', 0.25, null, null],
  [594, 'vigil_vambrace', 'Рукавицы дозорной заставы', 'palms', 'common', 1, 19, 0.5, 'fists', 0.03, null, 'vigil'],
  [595, 'driver_mitts', 'Варежки возницы', 'palms', 'common', 2, 17, 0.4, 'step', 0.02, null, null],
  [596, 'studded_mitts', 'Рукавицы с костяшками', 'palms', 'rare', 2, 82, 0.9, 'swordsman', 0.07, null, null],
  [597, 'grip_gloves', 'Хваткие рукавицы', 'palms', 'rare', 1, 86, 0.8, 'thief', 0.06, null, null],
  [598, 'frostgrip_gauntlets', 'Рукавицы зимней росы', 'palms', 'epic', 3, 290, 1.3, 'archer', 0.13, null, null],
  [599, 'golem_gauntlets', 'Длани спящего голема', 'palms', 'impossible', 4, 1150, 2.0, 'fists', 0.38, null, null],
  [600, 'coarse_trousers', 'Грубые порты', 'legs', 'common', 1, 21, 0.7, 'step', 0.03, null, null],
  [601, 'hide_hose', 'Кожаные шоссы', 'legs', 'common', 1, 23, 0.6, 'hide', 0.04, null, null],
  [602, 'wool_breeches', 'Суконные штаны', 'legs', 'common', 1, 24, 1.2, 'endurance', 0.02, null, null],
  [603, 'vigil_greaves', 'Поножи дозорной заставы', 'legs', 'rare', 2, 92, 2.2, 'endurance', 0.06, null, 'vigil'],
  [604, 'scale_hose', 'Чешуйчатые шоссы', 'legs', 'rare', 3, 98, 2.0, 'hide', 0.08, null, null],
  [605, 'sigil_greaves', 'Поножи со знаками', 'legs', 'epic', 3, 320, 3.0, 'breath', 0.14, null, null],
  [606, 'dusk_greaves', 'Латные поножи заката', 'legs', 'legendary', 4, 660, 4.0, 'step', 0.26, null, null],
  [607, 'woven_sandals', 'Плетёные постолы', 'feet', 'common', 1, 15, 0.5, 'step', 0.02, null, null],
  [608, 'tar_boots', 'Смоляные сапоги', 'feet', 'common', 1, 18, 0.8, 'endurance', 0.03, null, null],
  [609, 'traveler_boots', 'Страннические ботинки', 'feet', 'common', 1, 25, 1.0, 'step', 0.05, null, 'traveller'],
  [610, 'nailed_boots', 'Башмаки, подбитые гвоздями', 'feet', 'rare', 2, 78, 1.6, 'step', 0.07, null, null],
  [611, 'thorn_boots', 'Шипастые сапоги', 'feet', 'epic', 3, 300, 1.2, 'step', 0.12, 'thorns', null],
  [612, 'pathfinder_boots', 'Сапоги следопыта', 'feet', 'epic', 3, 340, 1.1, 'hide', 0.15, null, null],
  [613, 'lostroad_boots', 'Сапоги заблудившейся дороги', 'feet', 'impossible', 4, 1080, 1.4, 'step', 0.40, null, null],
];

const ROSTER_IDS_00032102 = ROSTER_00032102.map((r) => r[1]);

// Смеси (анализ slotMix/rarityArmorTable):
const SLOT_MIX_00032102 = {
  head: 7, ears: 7, neck: 7, torso: 3, forearms: 6, palms: 6,
  legs: 7, feet: 7,
};
const COMPOSITION_00032102 = {
  common: 20, rare: 14, epic: 10, legendary: 4, impossible: 2,
};

// stats.armor — envelope слот×редкость (факт диска 207 armor,
// масштаб 000230.08-семейства: head 0–3; боевая броня до 4):
const ARMOR_BAND_00032102 = {
  ears: { common: [0, 1], rare: [0, 1], epic: [1, 1], legendary: [1, 1], impossible: [1, 1] },
  neck: { common: [0, 1], rare: [0, 1], epic: [1, 1], legendary: [1, 1], impossible: [1, 1] },
  head: { common: [0, 1], rare: [1, 2], epic: [2, 3], legendary: [3, 3], impossible: [3, 3] },
  torso: { common: [0, 1], rare: [1, 2], epic: [2, 3], legendary: [4, 4], impossible: [4, 4] },
  forearms: { common: [1, 1], rare: [1, 2], epic: [2, 3], legendary: [4, 4], impossible: [4, 4] },
  palms: { common: [1, 2], rare: [1, 2], epic: [2, 3], legendary: [4, 4], impossible: [4, 4] },
  legs: { common: [1, 1], rare: [2, 3], epic: [3, 3], legendary: [4, 4], impossible: [4, 4] },
  feet: { common: [1, 1], rare: [2, 3], epic: [3, 3], legendary: [4, 4], impossible: [4, 4] },
};
// value — полосы по тирам (украшения head/ears/neck epic ≤300):
const VALUE_BAND_00032102 = {
  common: [10, 25], rare: [40, 100],
  epic: [150, 350], legendary: [400, 800], impossible: [1000, 1200],
};
const VALUE_BAND_TRINKET_00032102 = { epic: [150, 300] };
const TRINKET_SLOTS_00032102 = new Set(['head', 'ears', 'neck']);
// weight — полосы по слоту (факт диска armor):
const WEIGHT_BAND_00032102 = {
  ears: [0.05, 0.2], neck: [0.1, 0.2], head: [0.2, 1.5],
  torso: [0.5, 7], forearms: [0.2, 2], palms: [0.2, 2],
  legs: [0.5, 4.5], feet: [0.5, 4],
};
// Шкала amount (research §6, матрица 000230.03):
const AFFIX_SCALE_00032102 = {
  common: [0.02, 0.05], rare: [0.05, 0.10], epic: [0.10, 0.20],
  legendary: [0.20, 0.35], impossible: [0.35, 0.45],
};
// Skill-матрица по слоту (research §6; ЯВНЫЕ множества — урок
// раунда 3 .01: ветвь «любой навык каталога» запрещена):
const SLOT_SKILLS_00032102 = {
  head: new Set(['perception', 'precog', 'meditation', 'elder', 'scholar']),
  ears: new Set(['perception', 'precog', 'meditation', 'elder', 'scholar', 'orator', 'artist']),
  neck: new Set(['perception', 'precog', 'meditation', 'elder', 'scholar', 'orator', 'artist']),
  torso: new Set(['endurance', 'golem', 'hide', 'breath', 'meditation']),
  forearms: new Set(['swordsman', 'archer', 'heavy', 'fists', 'step', 'thief']),
  palms: new Set(['swordsman', 'archer', 'heavy', 'fists', 'step', 'thief']),
  legs: new Set(['step', 'endurance', 'hide', 'breath', 'golem']),
  feet: new Set(['step', 'endurance', 'hide', 'breath', 'golem']),
};

// Сет-контракты: vigil — НОВЫЙ (4 члена, 4 разных слота, тиры
// c/r/e/l; бонус одинаков у всех, пороги ⊆ {2,3,4}); traveller и
// mystic — завершение порога «4» (бонус НОВОГО члена побайтово ≡
// существующим членам — SB13 cross-pin):
const VIGIL_BONUS_00032102 = { 2: { armor: 2 }, 3: { armor: 3 }, 4: { armor: 4 } };
const VIGIL_MEMBERS_00032102 = ['vigil_vambrace', 'vigil_greaves',
  'vigil_plate', 'vigil_helm'];
const TRAVELLER_BONUS_REF_00032102 = 458; // traveler_cloak (живой член)
const MYSTIC_BONUS_REF_00032102 = 100; // silver_helm (живой член)

// Порядок ключей equip-канона для armor (icon МЕЖДУ stats и slot —
// ловушка пина 000335; set МЕЖДУ rarity и affixes, set_bonus —
// последним, факт fur_hat/000086):
const KEYS_ARMOR_00032102 = ['id', 'name', 'kind', 'weight', 'value',
  'desc', 'stats', 'icon', 'slot', 'rarity', 'affixes'];
const KEYS_ARMOR_SET_00032102 = ['id', 'name', 'kind', 'weight', 'value',
  'desc', 'stats', 'icon', 'slot', 'rarity', 'set', 'affixes', 'set_bonus'];

// Рецепты (000470–000519 — тот же порядок, что ростер; id рецепта =
// id результата). Тип по слоту по факту диска брони: ears/neck —
// резьба_по_камню [40,48] + зачарование [18]; head/torso/forearms/
// palms/legs/feet — столярное [5] (soft/common) + кузнечное [8,25]
// (metal/rare+, факт диска: броня-кузнечное на ЛЮБОЙ редкости
// [8,25]) + зачарование [18] (epic+). Состав: резьба 8 / столярка 14
// / кузнечное 13 / зачарование 15 (фиксация в memory).
// Строка: [номер, id, тип, уровень, заклинания (для зачарования)].
const RECIPES_00032102 = [
  [470, 'patched_helm', 'столярное_дело', 3, null],
  [471, 'felt_coif', 'столярное_дело', 2, null],
  [472, 'tin_morion', 'столярное_дело', 5, null],
  [473, 'riveted_helm', 'кузнечное_дело', 17, null],
  [474, 'steel_shishak', 'кузнечное_дело', 19, null],
  [475, 'rune_circlet', 'зачарование', 42, ['spark']],
  [476, 'vigil_helm', 'кузнечное_дело', 72, null],
  [477, 'boar_tusk_earring', 'резьба_по_камню', 4, null],
  [478, 'spiral_earring', 'резьба_по_камню', 3, null],
  [479, 'shell_wire_earring', 'резьба_по_камню', 5, null],
  [480, 'silver_drop_earring', 'резьба_по_камню', 14, null],
  [481, 'moonstone_stud', 'зачарование', 16, ['prayer']],
  [482, 'mystic_earring', 'зачарование', 40, ['mend']],
  [483, 'dawn_ear_cuff', 'зачарование', 70, ['stun_of_light']],
  [484, 'fang_lanyard', 'резьба_по_камню', 3, null],
  [485, 'vial_charm', 'резьба_по_камню', 4, null],
  [486, 'copper_beads', 'резьба_по_камню', 6, null],
  [487, 'silver_pendant_chain', 'резьба_по_камню', 15, null],
  [488, 'amethyst_collar', 'зачарование', 18, ['stone_skin']],
  [489, 'warder_pendant', 'зачарование', 38, ['magic_shield']],
  [490, 'twilight_necklace', 'зачарование', 44, ['shatter']],
  [491, 'quilted_jack', 'столярное_дело', 4, null],
  [492, 'warder_cuirass', 'кузнечное_дело', 16, null],
  [493, 'vigil_plate', 'зачарование', 46, ['barkskin']],
  [494, 'hide_bracers', 'столярное_дело', 3, null],
  [495, 'wool_bracers', 'столярное_дело', 5, null],
  [496, 'silver_bracers', 'кузнечное_дело', 15, null],
  [497, 'thorn_bracers', 'кузнечное_дело', 18, null],
  [498, 'engraved_bracers', 'зачарование', 39, ['flame_strike']],
  [499, 'gilded_vambraces', 'кузнечное_дело', 69, null],
  [500, 'vigil_vambrace', 'столярное_дело', 2, null],
  [501, 'driver_mitts', 'столярное_дело', 4, null],
  [502, 'studded_mitts', 'кузнечное_дело', 14, null],
  [503, 'grip_gloves', 'кузнечное_дело', 17, null],
  [504, 'frostgrip_gauntlets', 'зачарование', 41, ['frost_bolt']],
  [505, 'golem_gauntlets', 'зачарование', 96, ['wall_of_fire']],
  [506, 'coarse_trousers', 'столярное_дело', 3, null],
  [507, 'hide_hose', 'столярное_дело', 4, null],
  [508, 'wool_breeches', 'столярное_дело', 6, null],
  [509, 'vigil_greaves', 'кузнечное_дело', 20, null],
  [510, 'scale_hose', 'кузнечное_дело', 22, null],
  [511, 'sigil_greaves', 'зачарование', 37, ['vine']],
  [512, 'dusk_greaves', 'зачарование', 73, ['blizzard']],
  [513, 'woven_sandals', 'столярное_дело', 2, null],
  [514, 'tar_boots', 'столярное_дело', 4, null],
  [515, 'traveler_boots', 'столярное_дело', 6, null],
  [516, 'nailed_boots', 'кузнечное_дело', 21, null],
  [517, 'thorn_boots', 'зачарование', 43, ['thorns']],
  [518, 'pathfinder_boots', 'зачарование', 47, ['barkskin']],
  [519, 'lostroad_boots', 'кузнечное_дело', 97, null],
];
const TYPE_MIX_00032102 = {
  'столярное_дело': 14, 'кузнечное_дело': 13, 'зачарование': 15,
  'резьба_по_камню': 8,
};
// «уровень» ∈ диапазону редкости РЕЗУЛЬТАТА (конвенция
// RARITY_LEVEL_RANGE_00023008, craft.test.js) + полоса волны:
const LEVEL_BAND_00032102 = {
  common: [2, 8], rare: [13, 22], epic: [36, 48], legendary: [68, 74],
  impossible: [96, 97],
};
// Здания по типу (факт рецептов брони): резьба [40,48]; зачарование
// [18]; столярное [5]; кузнечное [8,25] (броня — на любой редкости).
const REC_BUILDINGS_00032102 = {
  'резьба_по_камню': ['000040', '000048'],
  'зачарование': ['000018'],
  'столярное_дело': ['000005'],
  'кузнечное_дело': ['000008', '000025'],
};
// Навыки по типу (факт): резьба — [runes]; столярка — [dexterity];
// кузнечное — [forge]; зачарование — [runes, тематический].
const REC_SKILL_00032102 = {
  'резьба_по_камню': ['runes'],
  'столярное_дело': ['dexterity'],
  'кузнечное_дело': ['forge'],
  'зачарование': ['runes'],
};

const OLD_MAX = 563; // анти-страж «НОВЫХ реагентов нет»: исходники ∈ старый каталог

function refNum(ref) {
  const m = /(\d{6})\.json$/.exec(ref);
  return m ? m[1] : null;
}
function loadItemFile(num) {
  const f = String(num).padStart(6, '0') + '.json';
  const p = path.join(ITEMS_DIR, f);
  assert.ok(fs.existsSync(p),
    'assets/items/' + f + ' существует (краснота: каталог 563 — '
    + 'предмет волны не создан)');
  return fs.readFileSync(p, 'utf8');
}
function rosterOf(id) {
  return ROSTER_00032102.find((r) => r[1] === id);
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

test('000321.02 T1: каталог — ровно 613 файла 000001–000613 подряд; 50 новых (000564–000613) — kind armor, slot ∈ 8-набор волны, полный equip-набор полей БЕЗ subtype/base_price/tier, порядок ключей = канон (icon МЕЖДУ stats и slot; set/ set_bonus для сетовых), roundtrip-канон stringify(…,2)+\\n, валидность по assets/items/schema.json (краснота: каталог 563 — волна не добавлена)', () => {
  const files = fs.readdirSync(ITEMS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f)).sort();
  assert.equal(files.length, 613,
    'каталог — 613 файла (563 + 50 брони 000321.02); факт: '
    + files.length + ' (краснота: волна не добавлена)');
  const schema = JSON.parse(
    fs.readFileSync(path.join(ITEMS_DIR, 'schema.json'), 'utf8'));
  const armorSlots = ['head', 'ears', 'neck', 'torso', 'forearms',
    'palms', 'legs', 'feet'];
  for (const [num, id, name, slot] of ROSTER_00032102) {
    const f = String(num).padStart(6, '0') + '.json';
    assert.equal(files[num - 1], f,
      'каталожный порядок: позиция ' + num + ' — ' + f);
    const raw = loadItemFile(num);
    const j = JSON.parse(raw);
    assert.deepEqual(validateData(schema, j, f), [], f + ': схема');
    assert.equal(j.id, id, f + ': id «' + id + '»');
    assert.equal(j.name, name, f + ': имя «' + name + '»');
    assert.equal(j.kind, 'armor', f + ': kind armor');
    assert.ok(armorSlots.includes(j.slot),
      f + ': slot ∈ 8-набор; факт: ' + j.slot);
    const withSet = j.set !== undefined;
    assert.deepEqual(Object.keys(j),
      withSet ? KEYS_ARMOR_SET_00032102 : KEYS_ARMOR_00032102,
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

test('000321.02 T2: ростер — 50 строк id/slot/rarity/armor/value/weight/аффикс/set сверяются с JSON; sweep: id уникальны в 613, ИМЕНА и ОПИСАНИЯ уникальны по ВСЕМУ каталогу (включая оружие 000514–000563) (краснота: каталог 563)', () => {
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
  assert.equal(ids.size, 613);
  for (const [num, id, name, slot, rarity, armor, value, weight,
      skill, amount, fc, set] of ROSTER_00032102) {
    const j = JSON.parse(loadItemFile(num));
    assert.equal(j.name, name, id + ': имя == ростер');
    assert.equal(j.slot, slot, id + ': slot == ростер');
    assert.equal(j.rarity, rarity, id + ': rarity == ростер');
    assert.equal(j.stats.armor, armor,
      id + ': armor ' + armor + '; факт: ' + j.stats.armor);
    assert.equal(j.value, value, id + ': value == ростер');
    assert.equal(j.weight, weight, id + ': weight == ростер');
    assert.equal(j.set === null ? undefined : j.set, set === null ? undefined : set,
      id + ': set == ростер');
    const sk = j.affixes.filter((a) => a.type === 'skill');
    assert.equal(sk.length, 1, id + ': ровно 1 skill-аффикс');
    assert.equal(sk[0].skill, skill,
      id + ': аффикс skill == колонка skill ростера; факт: ' + sk[0].skill);
    assert.equal(sk[0].amount, amount, id + ': amount == ростер');
    const fcs = j.affixes.filter((a) => a.type === 'free_cast');
    assert.equal(fcs.length, fc === null ? 0 : 1, id + ': free_cast == ростер');
    if (fc !== null) assert.equal(fcs[0].spell, fc, id + ': free_cast spell == ростер');
    assert.ok(j.desc.length > 0, id + ': desc непустая');
  }
});

// --- T3: смеси, rarity-множество, пулы ------------------------------

test('000321.02 T3: смеси — слоты волны РОВНО head 7/ears 7/neck 7/torso 3/forearms 6/palms 6/legs 7/feet 7; редкость волны РОВНО 20/14/10/4/2; rarity-множество каталога 379 (152/105/77/30/15); EQUIP_POOLS: размеры 152/105/77/30/15, прежние префиксы целы (пул ≡ live-каталогу по редкости — EQ2/CH4), хвосты = id волны каталожным порядком; armor-магазин (makeShop) видит новые позиции без правки кода; DROP/pickRarityTier 0-diff (краснота: в пулах новых id нет)', () => {
  const slotCount = {};
  const rarCount = {};
  for (const [num] of ROSTER_00032102) {
    const j = JSON.parse(loadItemFile(num));
    slotCount[j.slot] = (slotCount[j.slot] || 0) + 1;
    rarCount[j.rarity] = (rarCount[j.rarity] || 0) + 1;
  }
  assert.deepEqual(slotCount, SLOT_MIX_00032102,
    'слоты волны РОВНО 7/7/7/3/6/6/7/7; факт: '
    + JSON.stringify(slotCount));
  assert.deepEqual(rarCount, COMPOSITION_00032102,
    'редкость волны РОВНО 20/14/10/4/2 (контракт 000230 на 50); факт: '
    + JSON.stringify(rarCount));
  const all = I.allItems();
  assert.equal(all.length, 613, 'live-каталог — 613');
  const rarAll = {};
  for (const it of all) {
    if (it.rarity) rarAll[it.rarity] = (rarAll[it.rarity] || 0) + 1;
  }
  assert.equal(Object.values(rarAll).reduce((a, b) => a + b, 0), 379,
    'rarity-множество каталога — 379 (329 + 50); факт: '
    + JSON.stringify(rarAll));
  assert.deepEqual(rarAll, { common: 152, rare: 105, epic: 77,
    legendary: 30, impossible: 15 },
    'rarity-множество РОВНО 152/105/77/30/15; факт: '
    + JSON.stringify(rarAll));
  const P = L.EQUIP_POOLS;
  const expected = { common: 152, rare: 105, epic: 77, legendary: 30,
    impossible: 15 };
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
    const wave = ROSTER_00032102.filter((r) => r[4] === tier).map((r) => r[1]);
    assert.deepEqual(P[tier].slice(-wave.length), wave,
      tier + '-хвост = ' + wave.length + ' новых ' + tier
      + ' каталожным порядком');
  }
  const B = require('../src/map.js').BUILDING_TYPES;
  const coords = [[10, 21], [3, 8], [41, 13]];
  const seen = new Set();
  for (const [x, y] of coords) {
    for (const w of [1, 3]) {
      const shop = I.makeShop(x, y, B.ARMOR_SHOP, w);
      assert.ok(shop, 'магазин ' + x + ',' + y + '/' + w);
      for (const id of Object.keys(shop.stock)) seen.add(id);
    }
  }
  let hits = 0;
  for (const id of ROSTER_IDS_00032102) {
    if (seen.has(id)) hits++;
  }
  assert.ok(hits >= 1,
    'новая броня попадает в сток armor-магазина хотя бы на одном '
    + 'семене; факт hits=' + hits + ' (краснота: магазин не видит — '
    + 'пул kind-фильтрованный)');
  assert.equal(L.RARITY.reduce((s, t) => s + t.chance, 0), 1,
    'DROP-таблица — Σ 1 (НЕ тронута)');
  assert.equal(L.RARITY.map((t) => t.id).join(','),
    'common,rare,epic,legendary,impossible',
    'канонический порядок тиров — цел');
});

// --- T4: envelope armor/weight/value --------------------------------

test('000321.02 T4: stats.armor ∈ envelope слота×редкости (факт диска 207 armor, 000230.08-масштаб); value ∈ полосам тира (украшения head/ears/neck epic ≤300); weight ∈ полосам слота; base_price/tier/subtype отсутствуют (краснота: файлы волны не созданы)', () => {
  for (const [num, id, name, slot, rarity] of ROSTER_00032102) {
    const j = JSON.parse(loadItemFile(num));
    const [alo, ahi] = ARMOR_BAND_00032102[slot][rarity];
    assert.ok(j.stats.armor >= alo && j.stats.armor <= ahi,
      id + ': armor ' + j.stats.armor + ' в envelope ' + slot + '/'
      + rarity + ' ' + alo + '–' + ahi);
    let [vlo, vhi] = VALUE_BAND_00032102[rarity];
    if (TRINKET_SLOTS_00032102.has(slot)
        && VALUE_BAND_TRINKET_00032102[rarity]) {
      const [tl, th] = VALUE_BAND_TRINKET_00032102[rarity];
      vlo = Math.max(vlo, tl); vhi = Math.min(vhi, th);
    }
    assert.ok(j.value >= vlo && j.value <= vhi,
      id + ': value ' + j.value + ' в полосе ' + rarity
      + (TRINKET_SLOTS_00032102.has(slot) ? ' (украшение)' : '') + ' '
      + vlo + '–' + vhi);
    const [wlo, whi] = WEIGHT_BAND_00032102[slot];
    assert.ok(j.weight >= wlo && j.weight <= whi,
      id + ': weight ' + j.weight + ' в полосе ' + slot + ' ' + wlo
      + '–' + whi);
    assert.equal(j.base_price, undefined, id + ': base_price нет');
    assert.equal(j.tier, undefined, id + ': tier нет');
    assert.equal(j.subtype, undefined, id + ': subtype нет');
  }
});

// --- T5: аффиксы ------------------------------------------------------

test('000321.02 T5: аффиксы — РОВНО 1 skill-аффикс на предмет; skill ∈ ЯВНОЙ матрице слота (research §6: head — perception/precog/meditation/elder/scholar; ears/neck — те + orator/artist; torso — endurance/golem/hide/breath/meditation; forearms/palms — swordsman/archer/heavy/fists/step/thief; legs/feet — step/endurance/hide/breath/golem); amount ∈ шкале редкости; free_cast РОВНО 2, оба epic (объект-аффикс {type,spell}), spell ∈ каталог assets/spells (краснота: файлы волны не созданы)', () => {
  const skillSet = skillIds();
  const spells = spellIds();
  const freeCast = [];
  for (const [num, id, name, slot] of ROSTER_00032102) {
    const j = JSON.parse(loadItemFile(num));
    assert.ok(Array.isArray(j.affixes) && j.affixes.length >= 1,
      id + ': ≥1 аффикс');
    const skills = j.affixes.filter((a) => a.type === 'skill');
    const fcs = j.affixes.filter((a) => a.type === 'free_cast');
    assert.equal(skills.length, 1, id + ': ровно 1 skill-аффикс');
    assert.equal(fcs.length, j.affixes.length - 1,
      id + ': остальные — только free_cast');
    assert.ok(SLOT_SKILLS_00032102[slot].has(skills[0].skill),
      id + ': skill «' + skills[0].skill + '» вне матрицы слота ' + slot);
    assert.ok(skillSet.has(skills[0].skill),
      id + ': skill ∈ каталогу assets/skills');
    const [alo, ahi] = AFFIX_SCALE_00032102[j.rarity];
    assert.ok(skills[0].amount >= alo && skills[0].amount <= ahi,
      id + ': amount ' + skills[0].amount + ' в шкале ' + j.rarity
      + ' ' + alo + '–' + ahi);
    for (const a of fcs) {
      assert.ok(spells.has(a.spell), id + ': free_cast spell ∈ каталогу');
      assert.equal(j.rarity, 'epic',
        id + ': free_cast — ровно epic (прецедент .01 — РОВНО 2 epic)');
      freeCast.push(a.spell);
    }
  }
  assert.equal(freeCast.length, 2,
    'free_cast в волне — ровно 2; факт: ' + freeCast.length);
});

// --- T6: сеты ---------------------------------------------------------

test('000321.02 T6: сеты — vigil РОВНО 4 члена (c/r/e/l в 4 РАЗНЫХ слотах), set_bonus deepEqual у всех, пороги ⊆ {2,3,4}; traveller +feet (000609) и mystic +ears (000576) — бонус НОВОГО члена deepEqual существующим членам (SB13: traveller 2/3/4 armor 1/2/3; mystic — meditation .05/.1/.15), порог «4» обоих наборов становится ДОСТИЖИМЫМ (4 разных слота); других новых set в волне нет; set без set_bonus не встречается (краснота: файлы волны не созданы)', () => {
  const vigilItems = [];
  for (const [num, id] of ROSTER_00032102) {
    const j = JSON.parse(loadItemFile(num));
    if (j.set === undefined) {
      assert.equal(j.set_bonus, undefined, id + ': set без set_bonus');
      continue;
    }
    if (j.set === 'vigil') vigilItems.push(j);
    assert.ok(['vigil', 'traveller', 'mystic'].includes(j.set),
      id + ': новых сетов в волне только vigil (+traveller/mystic '
      + 'достраиваются); факт: ' + j.set);
  }
  assert.equal(vigilItems.length, 4,
    'vigil — ровно 4 члена в волне; факт: ' + vigilItems.length);
  assert.deepEqual(vigilItems.map((j) => j.id).sort(),
    [...VIGIL_MEMBERS_00032102].sort(), 'vigil: состав членов');
  assert.deepEqual(new Set(vigilItems.map((j) => j.slot)).size, 4,
    'vigil: 4 РАЗНЫХ слота (набор достижим целиком)');
  assert.deepEqual(vigilItems.map((j) => j.rarity).sort(),
    ['common', 'epic', 'legendary', 'rare'],
    'vigil: тиры c/r/e/l (форма-прецедент fate)');
  for (const j of vigilItems) {
    assert.deepEqual(j.set_bonus, VIGIL_BONUS_00032102,
      j.id + ': set_bonus vigil одинаков у всех (SB13/D-03)');
    assert.deepEqual(Object.keys(j.set_bonus).sort(), ['2', '3', '4'],
      j.id + ': пороги ⊆ {2,3,4}');
  }
  const boots = JSON.parse(loadItemFile(609));
  const refTrav = JSON.parse(fs.readFileSync(
    path.join(ITEMS_DIR, String(TRAVELLER_BONUS_REF_00032102)
      .padStart(6, '0') + '.json'), 'utf8'));
  assert.equal(boots.set, 'traveller', '000609: set traveller');
  assert.deepEqual(boots.set_bonus, refTrav.set_bonus,
    'traveler_boots: бонус побайтово ≡ существующим членам '
    + '(traveler_cloak)');
  const earring = JSON.parse(loadItemFile(576));
  const refMyst = JSON.parse(fs.readFileSync(
    path.join(ITEMS_DIR, String(MYSTIC_BONUS_REF_00032102)
      .padStart(6, '0') + '.json'), 'utf8'));
  assert.equal(earring.set, 'mystic', '000576: set mystic');
  assert.deepEqual(earring.set_bonus, refMyst.set_bonus,
    'mystic_earring: бонус побайтово ≡ существующим членам '
    + '(silver_helm)');
  const worn4 = (setId) => {
    const set = new Set();
    for (const f of fs.readdirSync(ITEMS_DIR)
      .filter((x) => /^\d{6}\.json$/.test(x))) {
      const j = JSON.parse(
        fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8'));
      if (j.kind === 'armor' && j.set === setId && j.slot) set.add(j.slot);
    }
    return set.size;
  };
  assert.ok(worn4('traveller') >= 4,
    'traveller: 4 РАЗНЫХ слота — порог «4» достижим');
  assert.ok(worn4('mystic') >= 4,
    'mystic: 4 РАЗНЫХ слота — порог «4» достижим');
});

// --- T7: иконки -------------------------------------------------------

test('000321.02 T7: иконки — у 50 новых поле icon ↔ файл существует; биекция id↔svg; flat-SVG 64×64: viewBox ровно 1, ПЕРВЫЙ элемент — тень-эллипс rgba(0,0,0,0.22), без linearGradient/radialGradient/text/path/use/stroke (паттерн 000302/000335); sha256-уникальность против всех 580 иконок (краснота: файлы не созданы)', () => {
  const allSvg = fs.readdirSync(SPR_DIR).filter((f) => f.endsWith('.svg'));
  assert.equal(allSvg.length, 580,
    'assets/sprites/items — 580 (530 + 50); факт: ' + allSvg.length);
  const hash = (p) => createHash('sha256').update(fs.readFileSync(p))
    .digest('hex');
  const hashes = new Map();
  for (const f of allSvg) {
    hashes.set(hash(path.join(SPR_DIR, f)), f);
  }
  assert.equal(hashes.size, 580, 'все 580 иконок byte-уникальны');
  for (const [, id] of ROSTER_00032102) {
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

// --- T8: рецепты ------------------------------------------------------

test('000321.02 T8: 50 рецептов 000470–000519 подряд; результат покрывает НОВЫЕ предметы 1:1 (тот же порядок); id рецепта = id результата; тип-состав РОВНО столярное 14 / кузнечное 13 / зачарование 15 / резьба 8; здания по типу (резьба [40,48], зачарование [18], столярка [5], кузнечное [8,25] — факт брони); навыки по типу (runes/dexterity/forge; зачарование — runes+тематический); у зачарований «заклинания» ≥1 ∈ каталог; «база» отсутствует; «уровень» ∈ полосе редкости результата; исходники ∈ СТАРЫЙ каталог 000001–000563 (НОВЫХ реагентов нет); roundtrip-канон (краснота: каталог craft 393 — рецептов нет)', () => {
  const files = fs.readdirSync(CRAFT_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f)).sort();
  assert.equal(files.length, 443,
    'craft — 443 файла (393 + 50 рецептов 000321.02); факт: '
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
  const skillById = new Map();
  for (const f of fs.readdirSync(SKILLS_DIR)
    .filter((x) => /^\d{6}\.json$/.test(x))) {
    const j = JSON.parse(
      fs.readFileSync(path.join(SKILLS_DIR, f), 'utf8'));
    skillById.set(f, j.id);
  }
  const typeCount = {};
  const results = [];
  for (const [num, id, тип, level, spellz] of RECIPES_00032102) {
    const f = String(num).padStart(6, '0') + '.json';
    assert.equal(files[files.length - 50 + num - RECIPES_00032102[0][0]], f,
      'каталожный порядок: 50 новых — последние 50 подряд, ' + f);
    const raw = fs.readFileSync(path.join(CRAFT_DIR, f), 'utf8');
    const j = JSON.parse(raw);
    assert.deepEqual(validateData(schema, j, f), [], f + ': схема');
    assert.equal(j['id'], id, f + ': id рецепта = id результата');
    assert.equal(j['тип'], тип, f + ': тип «' + тип + '»');
    typeCount[тип] = (typeCount[тип] || 0) + 1;
    assert.equal(j['результат']['предмет'],
      'assets/items/' + String(NEW_FROM
        + ROSTER_00032102.findIndex((r) => r[1] === id)).padStart(6, '0')
      + '.json', f + ': результат — предмет волны');
    results.push(j['результат']['предмет']);
    assert.equal(j['база'], undefined,
      f + ': «база» отсутствует (базовые рецепты, 1:1 как .01)');
    assert.equal(j['результат']['количество'], 1, f + ': количество 1');
    const rarity = ROSTER_00032102[
      ROSTER_00032102.findIndex((r) => r[1] === id)][4];
    assert.ok(j['уровень'] >= LEVEL_BAND_00032102[rarity][0]
      && j['уровень'] <= LEVEL_BAND_00032102[rarity][1],
      f + ': уровень ' + j['уровень'] + ' ∈ полосе ' + rarity + ' '
      + LEVEL_BAND_00032102[rarity].join('–') + ' (RARITY_LEVEL_RANGE)');
    assert.equal(j['уровень'], level, f + ': уровень ' + level);
    assert.deepEqual(j['здания'].map((b) => refNum(b)),
      REC_BUILDINGS_00032102[тип], f + ': здания '
      + JSON.stringify(REC_BUILDINGS_00032102[тип]));
    for (const b of j['здания']) {
      assert.ok(buildings.has(refNum(b) + '.json'), f + ': здание ' + b);
    }
    const skillNames = j['навыки'].map((s) => skillById.get(refNum(s) + '.json'));
    for (const s of j['навыки']) {
      assert.ok(skills.has(refNum(s) + '.json'), f + ': навык ' + s);
    }
    if (тип === 'зачарование') {
      assert.deepEqual(skillNames.slice(0, 1), REC_SKILL_00032102[тип],
        f + ': зачарование — 1-й навык runes');
      assert.equal(skillNames.length, 2,
        f + ': зачарование — runes + тематический (прецедент .01)');
    } else {
      assert.deepEqual(skillNames, REC_SKILL_00032102[тип],
        f + ': навыки = [' + REC_SKILL_00032102[тип] + ']');
    }
    for (const src of j['исходники']) {
      const n = refNum(src['предмет']);
      assert.ok(itemFiles.has(n + '.json'),
        f + ': исходник ' + src['предмет'] + ' ∈ каталогу');
      assert.ok(Number(n) <= OLD_MAX,
        f + ': исходник ' + src['предмет'] + ' ∈ СТАРЫЙ каталог '
        + '(НОВЫХ реагентов не создаём — прецедент .01)');
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
  assert.deepEqual(typeCount, TYPE_MIX_00032102,
    'тип-состав РОВНО столярка 14 / кузнечное 13 / зачарование 15 / '
    + 'резьба 8; факт: ' + JSON.stringify(typeCount));
  assert.equal(new Set(results).size, 50,
    'результаты покрывают новые предметы 1:1');
});

// --- T9: зеркала -------------------------------------------------------

test('000321.02 T9: зеркала — src/items-data.js содержит 50 новых предметов ≡ JSON (getItem ≡ диск); src/craft-data.js содержит 50 рецептов с резолвом результат/исходники/навыки/здания в id, «заклинания» — ID-форма (краснота: зеркало не регенерировано)', () => {
  assert.equal(ITD.ITEMS.length, 613,
    'items-data — 613; факт: ' + ITD.ITEMS.length);
  const mirrorById = new Map(ITD.ITEMS.map((it) => [it.id, it]));
  for (const [num, id] of ROSTER_00032102) {
    const j = JSON.parse(loadItemFile(num));
    const m = mirrorById.get(id);
    assert.ok(m, 'items-data: предмет «' + id + '»');
    assert.deepEqual(m, j, id + ': зеркало ≡ JSON поэлементно');
    assert.equal(I.getItem(id).name, j.name, id + ': getItem резолвится');
  }
  assert.equal(CRD.CRAFT.length, 443,
    'craft-data — 443; факт: ' + CRD.CRAFT.length);
  for (const [num, id, тип, level, spellz] of RECIPES_00032102) {
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

// --- T10: счётчики/канарейки -----------------------------------------

test('000321.02 T10: регресс-канарейки — каталог 613 ≡ items-data; armor 257, weapon 72 (не вырос), spell_scroll 160; slot — у 389, «прочих» без slot — 224; base_price РОВНО у 41 (броня волны не продаётся фиксированно); free_cast — 20 (19 epic + 1 legendary); наборы 18 / 51 предмет (vigil +4, traveller/mystic достроены); craft — 443 с типами зачарование 156 / кузнечное 120 / столярное 94 / резьба 61 / алхимия 10 / рунопись 2; stroke= в assets/sprites/items — ровно 46 legacy (краснота: каталог 563)', () => {
  assert.equal(I.allItems().length, 613);
  assert.equal(ITD.ITEMS.length, 613, 'items-data ≡ каталог (613)');
  const all = I.allItems();
  assert.equal(all.filter((it) => it.kind === 'armor').length, 257,
    'armor — 257 (207 + 50); факт: '
    + all.filter((it) => it.kind === 'armor').length);
  assert.equal(all.filter((it) => it.kind === 'weapon').length, 72,
    'weapon — 72 (не вырос)');
  assert.equal(all.filter((it) => it.kind === 'spell_scroll').length, 160,
    'spell_scroll — 160 (без смены)');
  const withBase = all.filter((it) => 'base_price' in it);
  assert.equal(withBase.length, 41,
    'base_price — ровно у 41; факт: ' + withBase.length);
  const withSlot = all.filter((it) => 'slot' in it);
  assert.equal(withSlot.length, 389,
    'slot — у 389 (339 + 50); факт: ' + withSlot.length);
  assert.equal(613 - withSlot.length, 224,
    'прочих без slot — 224 (не меняется)');
  const fc = [];
  for (const it of all) {
    for (const a of (it.affixes || [])) {
      if (a.type === 'free_cast') fc.push(it.rarity);
    }
  }
  assert.equal(fc.length, 20,
    'free_cast — 20 (18 + 2 epic волны); факт: ' + fc.length);
  assert.deepEqual({ epic: fc.filter((r) => r === 'epic').length,
    legendary: fc.filter((r) => r === 'legendary').length },
  { epic: 19, legendary: 1 }, 'free_cast: 19 epic + 1 legendary');
  const sets = {};
  for (const it of all) {
    if (it.set) (sets[it.set] = sets[it.set] || []).push(it.id);
  }
  assert.equal(Object.keys(sets).length, 18,
    'наборы — 18 (17 + vigil); факт: ' + Object.keys(sets).length);
  assert.equal(Object.values(sets).reduce((a, v) => a + v.length, 0), 51,
    'сетовых предметов — 51 (45 + 6); факт: '
    + Object.values(sets).reduce((a, v) => a + v.length, 0));
  const craftFiles = fs.readdirSync(CRAFT_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f));
  assert.equal(craftFiles.length, 443, 'craft — 443');
  const ct = {};
  for (const f of craftFiles) {
    const t = JSON.parse(
      fs.readFileSync(path.join(CRAFT_DIR, f), 'utf8'))['тип'];
    ct[t] = (ct[t] || 0) + 1;
  }
  assert.deepEqual(ct, {
    'зачарование': 156, 'кузнечное_дело': 120, 'столярное_дело': 94,
    'резьба_по_камню': 61, 'алхимия': 10, 'рунопись': 2,
  }, 'craft по типам; факт: ' + JSON.stringify(ct));
  const allSvg = fs.readdirSync(SPR_DIR).filter((f) => f.endsWith('.svg'));
  let strokeSeen = 0;
  for (const f of allSvg) {
    if (/stroke=/.test(fs.readFileSync(path.join(SPR_DIR, f), 'utf8'))) {
      strokeSeen++;
    }
  }
  assert.equal(strokeSeen, 46,
    'stroke= — ровно 46 legacy (заморозка 000335); факт: ' + strokeSeen);
});

// Задача 000321.13: +50 предметов вида craft_scroll («издания» существующих 6 типов крафта).
// Вариант (a) по анализу: effect {kind:'craft_recipe', recipe:<якорь>} — валидатор src/items.js
// уже поддерживает (src/ НЕ меняется); каждый свиток якорится на СВОЙ новый рецепт
// cherteg_<слово>.json; рецепты — типы из существующих 6 (enum НЕ расширять), результат —
// существующий предмет БЕЗ rarity. Среди 50 результатов: 32 ранее НЕПОКРЫТЫХ
// (множество DISASSEMBLY-ключей +32 → 705), 18 — «tied» по прецеденту 000321.10: минимум
// из прежних уровней строго ниже уровня чертежа (канонический разбор не едет, нового тайа
// нет). Ни один результат не имеет rarity — иначе rarity-слот получил бы ВТОРОЙ базовый
// рецепт и сломался бы ростерный пин §2.4 («ровно 1 базовый рецепт-результат»).
// «база» у новых рецептов НЕТ (ростер 43 заморожен контрактом),
// торговля/лут не пополняются. Id-диапазон 001115–001164 зафиксирован
// при запуске волны; value == base_price (паттерн blueprint_*). Решения: memory/000321-craftscroll-items.md.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const I = require('../src/items.js');
const M = require('../src/map.js');
const ITD = require('../src/items-data.js');
const C = require('../src/craft.js');
const { validateData } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const ITEMS_DIR = path.join(ROOT, 'assets', 'items');
const SPR_DIR = path.join(ROOT, 'assets', 'sprites', 'items');
const CRAFT_DIR = path.join(ROOT, 'assets', 'craft');
const NPC_DIR = path.join(ROOT, 'assets', 'npc');
const MOBS_DIR = path.join(ROOT, 'assets', 'mobs');

const KZ = 'кузнечное_дело', ALH = 'алхимия', ENC = 'зачарование',
  STL = 'столярное_дело', RZB = 'резьба_по_камню', RUN = 'рунопись';

const ROSTER = [
  ['uglya', 'угля', KZ, 'coal', 'wood_log:2,stone_chunk:1', 2, 120, null],
  ['medi', 'меди', KZ, 'copper_ore', 'stone_chunk:2,coal:1', 3, 130, null],
  ['zheleza', 'железа', KZ, 'iron_ore', 'stone_chunk:2,coal:1', 4, 140, null],
  ['serebra', 'серебра', KZ, 'silver_ore', 'stone_chunk:2,quartz:1', 6, 160, null],
  ['zolota', 'золота', KZ, 'gold_ore', 'stone_chunk:2,phosphorite:1', 8, 180, null],
  ['mifrita', 'мифрита', KZ, 'mithril_ore', 'obsidian:1,phosphorite:1', 10, 200, null],
  ['obsidiana', 'обсидиана', KZ, 'obsidian', 'stone_chunk:3', 5, 150, null],
  ['kvarca', 'кварца', KZ, 'quartz', 'stone_chunk:2,root_rock:1', 4, 150, null],
  ['fosforita', 'фосфорита', KZ, 'phosphorite', 'coal:1,stone_chunk:2', 7, 170, null],
  ['ametista', 'аметиста', KZ, 'amethyst', 'quartz:2,herb_bitter:1', 9, 190, null],
  ['gorechavki', 'горечавки', ALH, 'herb_bitter', 'root_rock:1,zybkaya_uksus:1', 3, 130, null],
  ['isceleniya', 'исцеления', ALH, 'herb_healing', 'root_rock:1,mushroom_grey:1', 3, 135, null],
  ['many', 'манны', ALH, 'herb_mana', 'herb_bitter:1,zybkaya_glina:1', 5, 155, null],
  ['solntsa', 'солнца', ALH, 'herb_sun', 'herb_bitter:1,berry_wild:1', 6, 165, null],
  ['vetra', 'ветра', ALH, 'herb_wind', 'root_moon:1,zybkaya_pena:1', 4, 145, null],
  ['svetlyachka', 'светлячка', ALH, 'mushroom_glow', 'mushroom_grey:1,root_ember:1', 4, 150, null],
  ['tlevshey_kory', 'тлеющей коры', ALH, 'root_ember', 'wood_log:1,root_rock:1', 5, 160, null],
  ['lunnogo_kornya', 'лунного корня', ALH, 'root_moon', 'root_rock:1,herb_mana:1', 5, 160, null],
  ['cherniki', 'черники', ENC, 'berry_blue', 'berry_wild:1,herb_mana:1', 7, 170, 'barkskin'],
  ['klubniki', 'клубники', ENC, 'berry_red', 'berry_wild:1,herb_sun:1', 6, 165, 'chill'],
  ['dikikh_yagod', 'диких ягод', ENC, 'berry_wild', 'fruit_apple:1,zybkaya_smola:1', 2, 125, 'attraction'],
  ['pancirja_rjazara', 'рыцарского панциря', ENC, 'knight_plate', 'bread:1,fruit_apple:1', 9, 140, 'blessing'],
  ['chernoprjada', 'чернопряда', ENC, 'mushroom_ink', 'mushroom_grey:1,zybkaya_smola:1', 4, 150, 'dark_presence'],
  ['stalnogo_mecha', 'стального меча', ENC, 'steel_sword', 'berry_wild:1,zybkaya_testo:1', 10, 175, 'aura_of_protection'],
  ['kamennoj_stameski', 'каменной стамески', ENC, 'stone_chisel', 'meat:1,zybkaya_sol:1', 11, 210, 'blazing_speed'],
  ['lunnogo_kamnya', 'лунного камня', ENC, 'moonstone', 'root_rock:1,zybkaya_smola:1', 12, 185, 'divine_favor'],
  ['kolchugi', 'кольчуги', ENC, 'chainmail', 'quartz:1,gold_ore:1', 16, 220, 'aegis'],
  ['ayvy', 'айвы', ENC, 'fruit_quince', 'fruit_apple:1,fruit_plum:1', 3, 135, 'attraction'],
  ['breven', 'бревна', STL, 'wood_log', 'zybkaya_muka:2,zybkaya_sol:1', 3, 120, null],
  ['derevyannogo_mecha', 'деревянного меча', STL, 'wood_sword', 'zybkaya_muka:2,mushroom_grey:1', 5, 130, null],
  ['boevogo_molota', 'боевого молота', STL, 'war_hammer', 'zybkaya_muka:1,zybkaya_uksus:1', 7, 130, null],
  ['korotkogo_luka', 'короткого лука', STL, 'short_bow', 'zybkaya_testo:1,berry_blue:1', 6, 155, null],
  ['kozhanogo_dospeha', 'кожаного доспеха', STL, 'leather_armor', 'zybkaya_testo:1,berry_wild:1', 5, 160, null],
  ['ohotnichego_luka', 'охотничьего лука', STL, 'hunting_bow', 'zybkaya_testo:1,herb_wind:1', 8, 145, null],
  ['boevogo_topora', 'боевого топора', STL, 'battle_axe', 'fruit_apple:1,zybkaya_sol:1', 4, 150, null],
  ['malogo_izceleija', 'малого исцеления', STL, 'minor_healing', 'zybkaya_muka:1,zybkaya_pena:1', 6, 145, null],
  ['yabloka', 'яблока', RZB, 'fruit_apple', 'stone_chunk:1,wood_log:1', 2, 125, null],
  ['slivy', 'сливы', RZB, 'fruit_plum', 'stone_chunk:1,berry_wild:1', 3, 130, null],
  ['rubina', 'рубина', RZB, 'ruby', 'root_rock:1,zybkaya_sol:1', 7, 135, null],
  ['safira', 'сапфира', RZB, 'sapphire', 'root_rock:1,zybkaya_uksus:1', 8, 135, null],
  ['izmruda', 'изумруда', RZB, 'emerald', 'zybkaya_pena:1,herb_sun:1', 7, 150, null],
  ['almaza', 'алмаза', RZB, 'diamond', 'zybkaya_pena:1,berry_wild:1', 9, 150, null],
  ['kamennogo_oblomka', 'каменного обломка', RZB, 'stone_chunk', 'mushroom_grey:2,zybkaya_smola:1', 2, 165, null],
  ['kamennogo_kornya', 'каменного корня', RZB, 'root_rock', 'zybkaya_pena:1,zybkaya_muka:1', 4, 165, null],
  ['kozhi', 'кожи', RUN, 'hide', 'wood_log:1,zybkaya_smola:1', 3, 140, null],
  ['starshogo_izceleija', 'старшего исцеления', RUN, 'greater_healing', 'stone_chunk:2,wood_log:1', 20, 125, null],
  ['eliksira_manny', 'эликсира манны', RUN, 'mana_elixir', 'wood_log:2,hide:1', 60, 135, null],
  ['zelya_manny', 'зелья манны', RUN, 'mana_potion', 'fruit_apple:1,zybkaya_glina:1', 14, 135, null],
  ['iscelejajushhego_zelya', 'исцеляющего зелья', RUN, 'healing_potion', 'fruit_quince:1,berry_red:1', 15, 150, null],
  ['pera_feniksa', 'пера феникса', RUN, 'phoenix_feather', 'herb_wind:1,root_rock:1', 6, 150, null],
];

const SKILL_BY = {
  [KZ]: ['forge'], [ALH]: ['alchemy'], [ENC]: ['runes', 'scholar'],
  [STL]: ['dexterity'], [RZB]: ['runes'], [RUN]: ['runes', 'scholar'],
};
const BLD_BY = {
  [KZ]: ['blacksmith'], [ALH]: ['alchemy_lab'], [ENC]: ['mage_tower'],
  [STL]: ['wanderer_shop'], [RZB]: ['rune_stone', 'ruins'],
  [RUN]: ['rune_stone', 'library', 'obelisk'],
};

const N = ROSTER.length;
const IDS = ROSTER.map((r) => 'zyv_zyv_' + r[0]);
const CRAFT_IDS = ROSTER.map((r) => 'cherteg_' + r[0]);
const SORTED_IDS = [...IDS].sort();
const ITEM_KEYS = ['id', 'name', 'kind', 'weight', 'value', 'base_price', 'desc', 'effect', 'icon'];
const RECIPE_KEYS = ['id', 'название', 'тип', 'результат', 'исходники', 'навыки', 'здания', 'уровень', 'описание'];
const RECIPE_KEYS_ENC = ['id', 'название', 'тип', 'результат', 'исходники', 'навыки', 'здания', 'заклинания', 'уровень', 'описание'];
const FORBIDDEN_KEYS = ['rarity', 'slot', 'set', 'affixes', 'tier'];
const TAIL_REF = 'zyv_zykuchego_golosa_scroll';
const SIX_TYPES = [KZ, ALH, ENC, STL, RZB, RUN];

const itemSlugFiles = () => fs.readdirSync(ITEMS_DIR)
  .filter((f) => f.endsWith('.json') && f !== 'schema.json');
const craftSlugFiles = () => fs.readdirSync(CRAFT_DIR)
  .filter((f) => f.endsWith('.json') && f !== 'schema.json');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const itemOf = (id) => readJson(path.join(ITEMS_DIR, id + '.json'));
const recipeOf = (id) => readJson(path.join(CRAFT_DIR, id + '.json'));
const REG = readJson(path.join(ROOT, 'tests', 'scripts',
  'items-num2id-000318.08.json'));
const REG_KEYS = Object.keys(REG).sort();
const sha = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const parseInputs = (s) => s.split(',').map((p) => {
  const [item, qty] = p.split(':');
  return { 'предмет': 'assets/items/' + item + '.json', 'количество': Number(qty) };
});

const numAttrsIn = (text, hi) => {
  const out = [];
  for (const m of text.matchAll(/(?:(?:x|y|cx|cy|r|rx|ry|width|height)="([^"]*)"|points="([^"]*)"|d="([^"]*)"|viewBox="([^"]*)")/g)) {
    const chunk = m[1] || m[2] || m[3] || m[4] || '';
    for (const n of chunk.matchAll(/-?\d+(?:\.\d+)?/g)) {
      const v = Number(n[0]);
      if (!(v >= 0 && v <= hi)) out.push(n[0]);
    }
  }
  return out;
};

test('000321.13 T1: формы — 50 предметов craft_scroll: roundtrip, схема, порядок ключей, value==base_price, БЕЗ rarity/slot/tier', () => {
  const itemSchema = readJson(path.join(ITEMS_DIR, 'schema.json'));
  assert.equal(new Set(IDS).size, N, 'ростер без дублей id');
  assert.equal(N, 50, 'волна — ровно 50 записей');
  for (const [word, rus, typ, res, inputs, lv, value, spell] of ROSTER) {
    const id = 'zyv_zyv_' + word;
    const ip = path.join(ITEMS_DIR, id + '.json');
    assert.ok(fs.existsSync(ip), ip + ': существует (RED: нет)');
    const raw = fs.readFileSync(ip, 'utf8');
    const it = JSON.parse(raw);
    assert.equal(raw, JSON.stringify(it, null, 2) + '\n', ip + ': roundtrip');
    assert.deepEqual(Object.keys(it), ITEM_KEYS, ip + ': порядок ключей канон');
    assert.deepEqual(validateData(itemSchema, it, ip), [], ip + ': схема items');
    assert.equal(it.id, id, ip + ': id == имя файла');
    assert.equal(it.kind, 'craft_scroll', ip + ': kind craft_scroll');
    assert.equal(it.name, 'Чертежи ' + rus, ip + ': name-шаблон «Чертежи …»');
    assert.equal(it.desc, 'Сборник чертежей вида «' + typ + '»: образец — '
      + itemOf(res).name + '.', ip + ': desc-шаблон с живым именем образца');
    assert.equal(it.weight, 0.2, ip + ': weight как у эталона blueprint_*');
    assert.equal(it.value, value, ip + ': value из ростера');
    assert.equal(it.base_price, value, ip + ': base_price == value (паттерн blueprint_*)');
    assert.deepEqual(it.effect, { kind: 'craft_recipe', recipe: 'assets/craft/cherteg_' + word + '.json' },
      ip + ': effect {kind: craft_recipe, recipe: <файловая ссылка на свой рецепт>}');
    assert.equal(it.icon, 'assets/sprites/items/' + id + '.svg', ip + ': icon = конвенция');
    for (const k of FORBIDDEN_KEYS) {
      assert.equal(it[k], undefined, ip + ': ключа ' + k + ' нет');
    }
  }
});

test('000321.13 T2: ростер ≡ диску; уникальность id/имён/описаний по каталогу; лекс-хвост строго после zyv_zykuchego_golosa_scroll', () => {
  const itemIds = itemSlugFiles().map((f) => f.slice(0, -5));
  assert.equal(IDS.filter((s) => itemIds.includes(s)).length, N,
    'все ' + N + ' чертежей на диске');
  assert.equal(new Set(itemIds).size, itemIds.length, 'id каталога уникальны');
  const names = []; const descs = [];
  for (const f of itemSlugFiles()) {
    const j = readJson(path.join(ITEMS_DIR, f));
    names.push(j.name); descs.push(j.desc);
  }
  assert.equal(new Set(names).size, names.length, 'имена каталога уникальны');
  assert.equal(new Set(descs).size, descs.length, 'desc каталога уникальны');
  const others = itemIds.filter((s) => !IDS.includes(s)).sort();
  assert.equal(others[others.length - 1], TAIL_REF,
    'предыдущий лекс-хвост каталога — ' + TAIL_REF + ' (наши строго после него)');
  for (const id of IDS) {
    assert.ok(id > TAIL_REF, id + ': больше хвостового эталона по ASCII');
  }
  assert.deepEqual([...IDS].sort(), SORTED_IDS, 'нумерация идёт в лекс-порядке роста');
});

test('000321.13 T3: контракт вида — effect craft_recipe у ВСЕХ craft_scroll резолвится в существующий рецепт типа из 6; база blueprint_* не тронута; enum не расширен', () => {
  const kindItems = itemSlugFiles()
    .map((f) => readJson(path.join(ITEMS_DIR, f)))
    .filter((j) => j.kind === 'craft_scroll');
  const mine = kindItems.filter((j) => IDS.includes(j.id));
  assert.equal(mine.length, N, 'наши ' + N + ' — в виде craft_scroll');
  assert.equal(kindItems.length, 6 + N, 'вид craft_scroll: 6 эталона + ' + N + ' новых');
  const craftIds = new Set(craftSlugFiles().map((f) => f.slice(0, -5)));
  for (const j of kindItems) {
    assert.equal(j.effect.kind, 'craft_recipe', j.id + ': effect.kind craft_recipe');
    const raw = j.effect.recipe;
    const slug = String(raw || '').split('/').pop().replace('.json', '');
    assert.ok(craftIds.has(slug), j.id + ': рецепт-якорь существует в assets/craft');
    assert.ok(SIX_TYPES.includes(recipeOf(slug).тип),
      j.id + ': тип якоря из шести существующих');
    assert.equal(j.rarity, undefined, j.id + ': rarity нет (sweep-пин факта)');
  }
  for (const [word] of ROSTER) {
    const it = itemOf('zyv_zyv_' + word);
    assert.equal(it.effect.recipe, 'assets/craft/cherteg_' + word + '.json',
      it.id + ': якорь — СВОЙ рецепт (1-в-1)');
  }
  for (const b of ['blueprint_alchemy', 'blueprint_carving', 'blueprint_woodwork',
    'blueprint_enchant', 'blueprint_forge', 'blueprint_runecraft']) {
    const it = itemOf(b);
    assert.equal(it.weight, 0.2, b + ': вес эталона не двинут');
    assert.equal(it.value, 80, b + ': value эталона не двинут');
    assert.equal(it.base_price, 120, b + ': base_price эталона не двинут');
  }
  const itemSchema = readJson(path.join(ITEMS_DIR, 'schema.json'));
  assert.equal(itemSchema.properties.kind.enum.filter((k) => k === 'craft_scroll').length, 1,
    'enum kind не расширен (craft_scroll — единственный наш)');
  assert.equal(itemSchema.properties.kind.enum.length, 13, 'enum kind — 13 значений (факт базы)');
  const mirror = ITD.ITEMS.find((e) => e.id === IDS[0]) !== undefined;
  assert.ok(mirror, 'зеркало несёт наши id (загрузка src без краха)');
  for (const [word] of ROSTER) {
    const e = ITD.ITEMS.find((x) => x.id === 'zyv_zyv_' + word);
    assert.equal(e.effect.recipe, 'cherteg_' + word,
      'зеркало: sync-items-data резолвит файловую ссылку в id рецепта');
  }
});

test('000321.13 T4: живые ls-предикаты — каталог ≡ реестру ≡ зеркалу; реестр 000001..N подряд; зеркало отсортировано', () => {
  const items = itemSlugFiles();
  assert.equal(items.length, REG_KEYS.length, 'каталог ≡ мощности реестра (ls-предикат)');
  assert.equal(I.allItems().length, items.length, 'зеркало items ≡ каталогу');
  assert.equal(ITD.ITEMS.length, items.length, 'items-data ≡ каталогу');
  assert.equal(REG_KEYS[0], '000001', 'реестр начинается с 000001');
  assert.equal(Number(REG_KEYS[REG_KEYS.length - 1]), REG_KEYS.length,
    'реестр 000001..N подряд, без дыр');
  for (let k = 0; k < REG_KEYS.length; k++) {
    assert.equal(REG_KEYS[k], String(k + 1).padStart(6, '0'),
      'непрерывность позиции ' + REG_KEYS[k]);
  }
  const mirror = ITD.ITEMS.map((e) => e.id);
  assert.deepEqual(mirror, [...mirror].sort(), 'зеркало отсортировано по id');
});

test('000321.13 T5: иконки 50 — формат, тень, координаты в канве, пин против NaN/Infinity, sha256-уникальность по каталогу иконок', () => {
  const FORBID = ['<path', '<text', '<use', 'stroke', 'Gradient', 'NaN', 'Infinity'];
  for (const id of IDS) {
    const ip = path.join(SPR_DIR, id + '.svg');
    assert.ok(fs.existsSync(ip), ip + ': иконка (RED: нет)');
    const t = fs.readFileSync(ip, 'utf8');
    assert.ok(t.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'),
      ip + ': header 64×64');
    assert.ok(t.split('\n')[1].includes('fill="rgba(0,0,0,0.22)"'),
      ip + ': тень-эллипс первым элементом');
    assert.ok(t.trimEnd().endsWith('</svg>'), ip + ': закрывающий тег');
    for (const bad of FORBID) {
      assert.ok(!t.includes(bad), ip + ': нет «' + bad + '»');
    }
    assert.deepEqual(numAttrsIn(t, 64), [], ip + ': координаты вне канвы 0..64');
  }
  const allHash = new Map();
  for (const f of fs.readdirSync(SPR_DIR).filter((x) => x.endsWith('.svg'))) {
    const h = sha(path.join(SPR_DIR, f));
    assert.ok(!allHash.has(h), f + ' == ' + allHash.get(h) + ': дубль байтов иконки');
    allHash.set(h, f);
  }
});

test('000321.13 T6: рецепты 50 — roundtrip, схема craft, порядок ключей, тип из 6, результат/исходники/навыки/здания резолвятся, БЕЗ «база», заклинания только у зачарования', () => {
  const craftSchema = readJson(path.join(CRAFT_DIR, 'schema.json'));
  const itemIdSet = new Set(itemSlugFiles().map((f) => f.slice(0, -5)));
  const kindById = new Map();
  for (const f of itemSlugFiles()) {
    kindById.set(f.slice(0, -5), readJson(path.join(ITEMS_DIR, f)).kind);
  }
  const craftIds = craftSlugFiles().map((f) => f.slice(0, -5));
  assert.equal(CRAFT_IDS.filter((s) => craftIds.includes(s)).length, N,
    'все ' + N + ' рецептов на диске');
  const blockSet6 = new Set(IDS);
  const ourStart = REG_KEYS.findIndex((k) => blockSet6.has(REG[k])) + 1;
  const numById = new Map(Object.entries(REG).map(([k, v]) => [v, Number(k)]));
  assert.equal(new Set(craftIds).size, craftIds.length, 'id рецептов уникальны');
  for (const [word, rus, typ, res, inputs, lv, value, spell] of ROSTER) {
    const cid = 'cherteg_' + word;
    const cp = path.join(CRAFT_DIR, cid + '.json');
    assert.ok(fs.existsSync(cp), cp + ': существует (RED: нет)');
    const raw = fs.readFileSync(cp, 'utf8');
    const rc = JSON.parse(raw);
    assert.equal(raw, JSON.stringify(rc, null, 2) + '\n', cp + ': roundtrip');
    assert.deepEqual(Object.keys(rc), spell ? RECIPE_KEYS_ENC : RECIPE_KEYS,
      cp + ': порядок ключей канон');
    assert.deepEqual(validateData(craftSchema, rc, cp), [], cp + ': схема craft');
    assert.equal(rc.id, cid, cp + ': id == имя файла');
    assert.equal(rc.название, 'Переписывание чертежей ' + rus, cp + ': название-шаблон');
    assert.equal(rc.тип, typ, cp + ': тип из шести существующих');
    assert.equal(rc.база, undefined, cp + ': «база» НЕ ставится (ростер 43 заморожен)');
    assert.deepEqual(rc.результат, { 'предмет': 'assets/items/' + res + '.json', 'количество': 1 },
      cp + ': результат — существующий предмет-образец');
    assert.deepEqual(rc.исходники, parseInputs(inputs), cp + ': исходники из ростера');
    for (const src of rc.исходники) {
      const slug = src['предмет'].split('/').pop().replace('.json', '');
      assert.ok(itemIdSet.has(slug), cp + ': исходник ' + slug + ' в каталоге');
    }
    assert.deepEqual(rc.навыки, SKILL_BY[typ].map((s) => 'assets/skills/' + s + '.json'),
      cp + ': навыки по типу');
    for (const s of rc.навыки) {
      assert.ok(fs.existsSync(path.join(ROOT, s)), cp + ': навык ' + s + ' на диске');
    }
    assert.deepEqual(rc.здания, BLD_BY[typ].map((b) => 'assets/buildings/' + b + '.json'),
      cp + ': здания по типу');
    for (const b of rc.здания) {
      assert.ok(fs.existsSync(path.join(ROOT, b)), cp + ': здание ' + b + ' на диске');
    }
    if (typ === ENC) {
      assert.deepEqual(rc.заклинания, [spell], cp + ': зачарование — ровно своё заклинание');
      assert.ok(fs.existsSync(path.join(ROOT, 'assets/spells', spell + '.json')),
        cp + ': заклинание ' + spell + ' на диске');
    } else {
      assert.equal(rc.заклинания, undefined, cp + ': не-зачарование — без заклинаний');
    }
    assert.equal(rc.уровень, lv, cp + ': уровень из ростера');
    assert.equal(rc.описание, 'Мастер переносит на чистую бумагу узор изделия «'
      + itemOf(res).name + '»: ' + typ + ', уровень ' + lv + ', исходники — только под рукой.',
      cp + ': описание-шаблон с живым именем образца');
    const rk = kindById.get(res);
    assert.equal(itemOf(res).rarity, undefined,
      cp + ': результат БЕЗ rarity (иначе rarity-слот получает второй базовый рецепт — '
      + 'ростеры §2.4 «ровно 1 базовый рецепт-результат» покраснеют)');
    for (const forb of ['food', 'spell_scroll', 'resurrection_scroll', 'skill_book', 'craft_scroll']) {
      assert.notEqual(rk, forb, cp + ': результат — НЕ «' + forb + '» (запрет-гейты смежных волн)');
    }
    assert.notEqual(res, 'sulfur', cp + ': результат — НЕ sulfur (craft-disassemble-гейт)');
    const num = numById.get(res);
    assert.ok(num === undefined || !(num >= ourStart - 6 * N && num < ourStart),
      cp + ': результат вне id-диапазонов лут-волн-сиблингов (число ' + num
      + ', наши ' + ourStart + '..' + (ourStart + N - 1) + ')');
  }
  const names = craftIds.map((c) => recipeOf(c).название);
  assert.equal(new Set(names).size, names.length, 'названия рецептов уникальны');
  const resSet = ROSTER.map((r) => r[3]);
  assert.equal(new Set(resSet).size, N, '50 результатов — разные предметы');
  const mineSet = new Set(CRAFT_IDS);
  const prevLevels = new Map();
  for (const r of C.CRAFT) {
    if (r.база !== undefined || mineSet.has(r.id)) continue;
    const list = prevLevels.get(r.результат.предмет) || [];
    list.push({ id: r.id, lv: r.уровень });
    prevLevels.set(r.результат.предмет, list);
  }
  const prevCanon = {};
  for (const [res, list] of prevLevels) {
    let best = list[0];
    for (const e of list) {
      if (e.lv < best.lv) best = e;
    }
    prevCanon[res] = best.id;
  }
  const liveCanon = C.DISASSEMBLY_BY_ITEM;
  let adds = 0;
  let tiedN = 0;
  for (const [word, rus, typ, res, inputs, lv] of ROSTER) {
    const pl = prevLevels.get(res);
    if (pl === undefined) {
      adds += 1;
      assert.equal(liveCanon[res], 'cherteg_' + word,
        res + ': непокрытый образец — канонический разбор теперь наш чертёж');
    } else {
      tiedN += 1;
      const minPrev = Math.min(...pl.map((e) => e.lv));
      assert.ok(minPrev < lv, res + ': уровень чертежа строго выше МИНИМУМА прежних ('
        + minPrev + ' < ' + lv + ') — канон не едет, нового тайа на минимуме нет');
      assert.equal(liveCanon[res], prevCanon[res],
        res + ': tied — канон остался прежним рецептом «' + prevCanon[res] + '»');
    }
  }
  assert.equal(adds + tiedN, N,
    'каждый из ' + N + ' результатов — либо новый DISASSEMBLY-ключ, либо tied');
  assert.ok(tiedN > 0 && adds > 0,
    'анти-вакуум: обе ветки живые (новых ' + adds + ', tied ' + tiedN + ')');
  assert.equal(Object.keys(liveCanon).length, Object.keys(prevCanon).length + adds,
    'DISASSEMBLY-ключи: дельта == числу непокрытых образцов (tied ключей не добавляют); '
    + 'прежних ' + Object.keys(prevCanon).length + ', новых ' + adds);
});

test('000321.13 T7: реестр — хвостовой append в лекс-порядке (блок по первому вхождению); префикс additions-only; зеркало несёт блок', () => {
  const total = REG_KEYS.length;
  const blockSet = new Set(IDS);
  const firstIdx = REG_KEYS.findIndex((k) => blockSet.has(REG[k]));
  assert.ok(firstIdx >= 0, 'блок наших id найден в реестре (RED: нет)');
  const tail = REG_KEYS.slice(firstIdx, firstIdx + N);
  assert.equal(tail.length, N, 'блок длиной ровно ' + N);
  assert.deepEqual(tail.map((k) => REG[k]), SORTED_IDS,
    'блок реестра == новые чертежи по лекси');
  const prefixVals = REG_KEYS.slice(0, firstIdx).map((k) => REG[k]);
  const laterVals = new Set(REG_KEYS.slice(firstIdx + N).map((k) => REG[k]));
  const diskOld = itemSlugFiles().map((f) => f.slice(0, -5))
    .filter((s) => !blockSet.has(s) && !laterVals.has(s));
  assert.deepEqual([...prefixVals].sort(), [...diskOld].sort(),
    'префикс реестра ≡ диску без новых и без поздних волн (additions-only)');
  const mirror = ITD.ITEMS.map((e) => e.id);
  assert.equal(mirror.length, total, 'зеркало items ≡ мощности реестра');
  assert.deepEqual(mirror, [...mirror].sort(), 'зеркало отсортировано по id');
  const mIdx = mirror.indexOf(SORTED_IDS[0]);
  assert.ok(mIdx >= 0, 'новые чертежи в зеркале');
  assert.deepEqual(mirror.slice(mIdx, mIdx + N), SORTED_IDS,
    'зеркало несёт новые чертежи подряд по лекси');
});

test('000321.13 T8: живые дельты +N и self-gate: запрет движущихся счётчиков-литералов в этом файле', () => {
  for (const id of IDS) {
    assert.ok(fs.existsSync(path.join(ITEMS_DIR, id + '.json')),
      id + '.json на диске (RED: нет)');
  }
  const items = itemSlugFiles().map((f) => f.slice(0, -5));
  const icons = fs.readdirSync(SPR_DIR).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4));
  const recipes = craftSlugFiles().map((f) => f.slice(0, -5));
  assert.equal(IDS.filter((s) => items.includes(s)).length, N, 'чертежей ровно ' + N);
  assert.equal(IDS.filter((s) => icons.includes(s)).length, N, 'иконок ровно ' + N);
  assert.equal(CRAFT_IDS.filter((s) => recipes.includes(s)).length, N, 'рецептов ровно ' + N);
  const kindOf = (slug) => {
    const p = path.join(ITEMS_DIR, slug + '.json');
    return fs.existsSync(p) ? readJson(p).kind : undefined;
  };
  const blockSet = new Set(IDS);
  const firstIdx = REG_KEYS.findIndex((k) => blockSet.has(REG[k]));
  assert.ok(firstIdx >= 0, 'блок найден (RED: нет)');
  const kindCount = items.filter((s) => kindOf(s) === 'craft_scroll').length;
  const prefixCraft = REG_KEYS.slice(0, firstIdx)
    .filter((k) => kindOf(REG[k]) === 'craft_scroll').length;
  const blockCraft = REG_KEYS.slice(firstIdx, firstIdx + N)
    .filter((k) => kindOf(REG[k]) === 'craft_scroll').length;
  assert.equal(blockCraft, N, 'блок реестра — все ' + N + ' craft_scroll');
  assert.equal(kindCount, prefixCraft + N,
    'craft_scroll: дельта ровно +' + N + ' над префиксом реестра');
  const hasKey = (slug, key) => {
    const p = path.join(ITEMS_DIR, slug + '.json');
    return fs.existsSync(p) && key in readJson(p);
  };
  const baseCountUpTo = (upto) => REG_KEYS.slice(0, upto).filter((k) => hasKey(REG[k], 'base_price')).length;
  assert.equal(baseCountUpTo(firstIdx + N) - baseCountUpTo(firstIdx), N,
    'base_price: блок добавляет ровно ' + N + ' (value == base_price)');
  const slotUpTo = (upto) => REG_KEYS.slice(0, upto).filter((k) => hasKey(REG[k], 'slot')).length;
  assert.equal(slotUpTo(firstIdx + N) - slotUpTo(firstIdx), 0, 'slot: дельта 0');
  const rarityUpTo = (upto) => REG_KEYS.slice(0, upto).filter((k) => hasKey(REG[k], 'rarity')).length;
  assert.equal(rarityUpTo(firstIdx + N) - rarityUpTo(firstIdx), 0, 'rarity: дельта 0');
  const withBase = items.filter((s) => hasKey(s, 'base_price')).length;
  const withSlot = items.filter((s) => hasKey(s, 'slot')).length;
  const masked = fs.readFileSync(__filename, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
  const liveCounters = new Set([items.length, icons.length, recipes.length,
    REG_KEYS.length, kindCount, withBase, withSlot]);
  assert.ok(liveCounters.size >= 4, 'набор живых счётчиков непустой (анти-вакуум)');
  for (const v of liveCounters) {
    assert.ok(!new RegExp('\\b' + v + '\\b').test(masked),
      'self-gate 000386 T7: живой счётчик ' + v + ' запрещён литералом в исполняемых строках');
  }
  assert.equal(((fs.readFileSync(__filename, 'utf8')).match(/\d+ файлов \(на момент/g) || []).length, 0,
    'self-gate: паттерн «<цифры> файлов (на момент» отсутствует (counters live)');
});

test('000321.13 T9: spec/canon/c9 — line-neutral правка, байтовый лог ≡ живым байтам, счётчики канона живые', () => {
  const spec = fs.readFileSync(path.join(ROOT, 'spec', 'items.md'), 'utf8');
  assert.ok(!spec.endsWith('\n'), 'spec/items.md без trailing-\\n');
  const lines = spec.split('\n');
  assert.equal(lines.filter((l) => /^## /.test(l)).length, 13, 'spec/items.md — 13 H2');
  const liveCount = itemSlugFiles().length;
  assert.ok(lines.some((l) => l.includes('Каталог пополнен ' + N +
    ' предметами чертежей крафта 000321.13')),
    'spec: предложение волны 000321.13 в цепочке');
  const cm = spec.match(/Каталог assets\/items — (\d+) файлов \(на момент ([0-9.]+)\):/);
  assert.ok(cm, 'spec/items.md: строки счётчика нет');
  assert.equal(+cm[1], liveCount, 'spec: счётчик == живому каталогу');
  assert.ok(cm[2] >= '000321.13', 'spec: счётчик «на момент ' + cm[2] + '» не раньше 000321.13');
  const c9p = path.join(ROOT, 'memory', '000230.16-c9', '000321.13.md');
  assert.ok(fs.existsSync(c9p), 'c9-entry ' + c9p + ' существует (RED: нет)');
  const c9 = fs.readFileSync(c9p, 'utf8');
  const m = c9.match(/^000321\.13: (\d+) \(\+(\d+)\)$/m);
  assert.ok(m, 'c9-entry вида «000321.13: <bytes> (+Δ)»');
  const liveBytes = Buffer.byteLength(spec);
  const c9dir = path.join(ROOT, 'memory', '000230.16-c9');
  const takenLater = fs.readdirSync(c9dir).some((f) => {
    if (!f.endsWith('.md') || f === '000321.13.md') return false;
    const mm = fs.readFileSync(path.join(c9dir, f), 'utf8')
      .match(/^\d{6}(?:\.\d+)?: (\d+) \([+-]\d+\)/m);
    return mm !== null && Number(mm[1]) === liveBytes;
  });
  if (takenLater) {
    assert.notEqual(Number(m[1]), liveBytes,
      'c9: преемственность — байты ' + m[1] + ' не равны живым ' + liveBytes
      + ' (поздняя волна переняла счётчик spec/items.md; ре-пин 000421:'
      + ' направление «<» было допущением только роста — line-neutral'
      + ' правка ряда Оружие умеет и усекать файл)');
  } else {
    assert.equal(Number(m[1]), liveBytes,
      'c9: байты ≡ живому Buffer.byteLength(spec/items.md)');
  }
  const canonp = path.join(ROOT, 'memory', '000230.16-spec-equipment-doc.md');
  assert.ok(fs.existsSync(canonp), 'файл канона существует');
  const canon = fs.readFileSync(canonp, 'utf8');
  const kindLive = itemSlugFiles()
    .map((f) => readJson(path.join(ITEMS_DIR, f)).kind)
    .filter((k) => k === 'craft_scroll').length;
  assert.ok(canon.includes('craft_scroll ' + kindLive),
    'канон: счётчик craft_scroll == живому (' + kindLive + ')');
  assert.ok(canon.includes('Каталог assets/items — ' + liveCount + ' файлов'),
    'канон: счётчик каталога == живому (' + liveCount + ')');
  assert.ok(canon.includes(liveCount + ' файлов (000001–'
    + String(liveCount).padStart(6, '0') + ';'),
    'канон c1: диапазон каталога == живому (' + liveCount + ')');
});

test('000321.13 T10: торговля не пополнена — ни одного нашего id в витринах NPC и луте мобов; universam несёт хвостом; пулы видов не тронуты', () => {
  const npcFiles = fs.readdirSync(NPC_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'schema.json');
  for (const f of npcFiles) {
    const j = readJson(path.join(NPC_DIR, f));
    const dump = JSON.stringify(j.торговля || {});
    for (const id of IDS) {
      assert.ok(!dump.includes(id), f + ': витрина НЕ пополнена «' + id + '» (без роста торговли)');
    }
  }
  const lootText = fs.readdirSync(MOBS_DIR)
    .map((f) => fs.readFileSync(path.join(MOBS_DIR, f), 'utf8')).join('\n');
  for (const id of IDS) {
    assert.ok(!lootText.includes(id), id + ': не в таблицах лута мобов');
  }
  const kinds = I.shopKindsFor(M.BUILDING_TYPES.MAGIC_SHOP) || [];
  assert.ok(!kinds.includes('craft_scroll'),
    'факт диска: magic shop не торгует видом craft_scroll');
  const uni = I.makeShop(30, 40, M.BUILDING_TYPES.WEAPONS_SHOP, 3);
  const mineInUni = Object.keys(uni.stock).filter((k) => IDS.includes(k)).length;
  assert.ok(mineInUni > 0,
    'универсам (w=3, пул allItems) несёт новые чертежи rng-хвостом');
  const magic = I.makeShop(30, 40, M.BUILDING_TYPES.MAGIC_SHOP, 0);
  assert.equal(Object.keys(magic.stock).filter((k) => IDS.includes(k)).length, 0,
    'magic shop не получил ни одного чертежа волны (пул не тронут)');
});

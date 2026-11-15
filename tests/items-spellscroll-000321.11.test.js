// Задача 000321.11 (11-я волна батча 000321): +50 свитков заклинаний
// kind=spell_scroll (лекс-хвост каталога, виртуальные позиции после 001014)
// + 50 заклинаний 1-в-1 (степень 1, база null). kind=node.
// Контракт — memory/000321-spellscroll-items.md.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const I = require('../src/items.js');
const M = require('../src/map.js');
const ITD = require('../src/items-data.js');
const { NPCS } = require('../src/npc-data.js');
const { validateData } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const ITEMS_DIR = path.join(ROOT, 'assets', 'items');
const SPELLS_DIR = path.join(ROOT, 'assets', 'spells');
const SPR_DIR = path.join(ROOT, 'assets', 'sprites', 'items');
const SPIcons = path.join(ROOT, 'assets', 'spell-icons');
const CRAFT_DIR = path.join(ROOT, 'assets', 'craft');
const NPC_DIR = path.join(ROOT, 'assets', 'npc');

// [spellId, название, школа, уровень, действие]
const ROSTER = [
  ['zyv_pepela', 'Зов пепла', 'огонь', 1, 'урон'],
  ['zyv_ugley', 'Зов углей', 'огонь', 1, 'дебаф'],
  ['zyv_iskr', 'Зов искр', 'огонь', 1, 'баф'],
  ['zyv_smoly', 'Зов смолы', 'огонь', 1, 'урон'],
  ['zyv_flogistona', 'Зов флогистона', 'огонь', 2, 'урон'],
  ['zyv_salamandry', 'Зов саламандры', 'огонь', 2, 'призыв'],
  ['zyv_kostri', 'Зов кострища', 'огонь', 3, 'создание'],
  ['zyv_garey', 'Зов гарей', 'огонь', 3, 'дебаф'],
  ['zyv_pozharishcha', 'Зов пожарища', 'огонь', 4, 'урон'],
  ['zyuzyachiy_iney', 'Зюзячий иней', 'лёд', 1, 'урон'],
  ['zyuzyachaya_stuzha', 'Зюзячая стужа', 'лёд', 1, 'дебаф'],
  ['zyuzyachaya_izmoroz', 'Зюзячая изморозь', 'лёд', 1, 'создание'],
  ['zyuzyachaya_vyuga', 'Зюзячая вьюга', 'лёд', 2, 'урон'],
  ['zyuzyachaya_korka', 'Зюзячая корка', 'лёд', 2, 'контроль'],
  ['zyuzyachiy_vihor', 'Зюзячий вихорь', 'лёд', 3, 'призыв'],
  ['zyuzyachaya_handra', 'Зюзячая хандра', 'лёд', 3, 'дебаф'],
  ['zyuzyache_serdtse', 'Зюзячье сердце', 'лёд', 4, 'урон'],
  ['zyv_tenei', 'Зов теней', 'тень', 1, 'урон'],
  ['zyv_hvori', 'Зов хвори', 'тень', 1, 'дебаф'],
  ['zyuzyachiy_morok', 'Зюзячий морок', 'тень', 1, 'контроль'],
  ['zyv_pustoty', 'Зов пустоты', 'тень', 2, 'урон'],
  ['zyv_okov', 'Зов оков', 'тень', 2, 'контроль'],
  ['zyuzyachie_seni', 'Зюзячие сени', 'тень', 3, 'внебой'],
  ['zyv_tishiny', 'Зов тишины', 'тень', 3, 'дебаф'],
  ['zyv_zabveniya', 'Зов забвения', 'тень', 4, 'урон'],
  ['zyv_utra', 'Зов утра', 'исцеление', 1, 'лечение'],
  ['zyv_rodnika', 'Зов родника', 'исцеление', 1, 'лечение'],
  ['zyuzyache_teplo', 'Зюзячье тепло', 'исцеление', 1, 'баф'],
  ['zyv_kolybeli', 'Зов колыбели', 'исцеление', 2, 'лечение'],
  ['zyv_zdorovya', 'Зов здоровья', 'исцеление', 2, 'баф'],
  ['zyv_chistoty', 'Зов чистоты', 'исцеление', 3, 'лечение'],
  ['zyv_poludnya', 'Зов полдня', 'исцеление', 3, 'баф'],
  ['zyv_zhizni', 'Зов жизни', 'исцеление', 4, 'лечение'],
  ['zyv_zaslona', 'Зов заслона', 'защита', 1, 'защита'],
  ['zyv_lat', 'Зов лат', 'защита', 1, 'защита'],
  ['zyuzyachaya_kora', 'Зюзячая кора', 'защита', 1, 'баф'],
  ['zyv_zastavy', 'Зов заставы', 'защита', 2, 'защита'],
  ['zyv_kledi', 'Зов кледи', 'защита', 2, 'баф'],
  ['zyv_kreposti', 'Зов крепости', 'защита', 3, 'защита'],
  ['zyv_vrat', 'Зов врат', 'защита', 4, 'защита'],
  ['zyv_tverdyn', 'Зов твердынь', 'защита', 4, 'баф'],
  ['zyv_rostkov', 'Зов ростков', 'природа', 1, 'урон'],
  ['zyuzyachaya_pylica', 'Зюзячая пыльца', 'природа', 1, 'дебаф'],
  ['zyv_pletei', 'Зов плетей', 'природа', 2, 'урон'],
  ['zyv_tropy', 'Зов тропы', 'природа', 2, 'призыв'],
  ['zyuzyachaya_polyana', 'Зюзячая поляна', 'природа', 2, 'создание'],
  ['zyv_zhivitsy', 'Зов живицы', 'природа', 2, 'баф'],
  ['zyv_topei', 'Зов топей', 'природа', 3, 'контроль'],
  ['zyv_gluhomani', 'Зов глухомани', 'природа', 3, 'внебой'],
  ['zyv_bureloma', 'Зов бурелома', 'природа', 3, 'урон'],
];
const N = ROSTER.length;
const ATTR = { 'огонь': 'intelligence', 'лёд': 'intelligence', 'тень': 'intelligence',
  'исцеление': 'wisdom', 'защита': 'wisdom', 'природа': 'wisdom' };
const BLD = {
  'огонь': ['assets/buildings/mage_tower.json'],
  'лёд': ['assets/buildings/mage_tower.json'],
  'тень': ['assets/buildings/mage_tower.json'],
  'исцеление': ['assets/buildings/monastery.json', 'assets/buildings/healing_temple.json'],
  'защита': ['assets/buildings/monastery.json', 'assets/buildings/healing_temple.json',
    'assets/buildings/mountain_temple.json'],
  'природа': ['assets/buildings/healing_temple.json', 'assets/buildings/mountain_temple.json'],
};
const VALUE_BY_TIER = { 1: 45, 2: 60, 3: 115, 4: 240 };
const MANA_BY_LEVEL = { 1: [3, 4, 5], 2: [6, 7, 8],
  3: [10, 11, 12, 13, 14, 15], 4: [20] };
const SELLER = { 'огонь': '000033', 'лёд': '000033', 'исцеление': '000039',
  'тень': '000040', 'защита': '000041', 'природа': '000041' };
const SCROLL_KEYS = ['id', 'name', 'kind', 'weight', 'value', 'base_price',
  'tier', 'desc', 'effect', 'icon'];
const SPELL_KEYS_FULL = ['id', 'название', 'школа', 'база', 'степень',
  'множитель_степени', 'атрибут', 'уровень', 'мани', 'действие', 'параметры',
  'вне_боя', 'предметы', 'здания', 'описание', 'icon', 'icon_prompt'];
const SPELL_KEYS_BASE = ['id', 'название', 'школа', 'база', 'степень',
  'атрибут', 'уровень', 'мани', 'действие', 'параметры', 'вне_боя',
  'предметы', 'здания', 'описание', 'icon', 'icon_prompt'];
const FORBIDDEN_SCROLL_KEYS = ['rarity', 'slot', 'set', 'affixes'];
const SCROLL_SLUGS = ROSTER.map((r) => r[0] + '_scroll');
const SPELL_IDS = ROSTER.map((r) => r[0]);

const itemSlugFiles = () => fs.readdirSync(ITEMS_DIR)
  .filter((f) => f.endsWith('.json') && f !== 'schema.json');
const spellSlugFiles = () => fs.readdirSync(SPELLS_DIR)
  .filter((f) => f.endsWith('.json') && f !== 'schema.json');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const scrollOf = (id) => readJson(path.join(ITEMS_DIR, id + '_scroll.json'));
const spellOf = (id) => readJson(path.join(SPELLS_DIR, id + '.json'));
const REG = readJson(path.join(ROOT, 'tests', 'scripts',
  'items-num2id-000318.08.json'));
const REG_KEYS = Object.keys(REG).sort();
const CIRCLED = new Set(['000033', '000039', '000040', '000041']);
const sha = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');

const SPELL_REQUIRED = ['id', 'название', 'школа', 'база', 'степень', 'атрибут',
  'уровень', 'мани', 'действие', 'предметы', 'здания', 'описание', 'icon',
  'icon_prompt'];
const spellExpectedKeys = (s) => {
  const exp = ['id', 'название', 'школа', 'база', 'степень'];
  if ('множитель_степени' in s) exp.push('множитель_степени');
  exp.push('атрибут', 'уровень', 'мани', 'действие');
  if ('параметры' in s) exp.push('параметры');
  if ('вне_боя' in s) exp.push('вне_боя');
  exp.push('предметы', 'здания', 'описание', 'icon', 'icon_prompt');
  return exp;
};
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

test('000321.11 T1: формы — 50 свитков spell_scroll + 50 заклинаний: roundtrip, схема, порядок ключей, БЕЗ rarity', () => {
  const itemSchema = readJson(path.join(ITEMS_DIR, 'schema.json'));
  const spellSchema = readJson(path.join(SPELLS_DIR, 'schema.json'));
  assert.equal(new Set(SCROLL_SLUGS).size, N, 'ростер без дублей slugs');
  for (const [sid, name, sch, lv] of ROSTER) {
    const ip = path.join(ITEMS_DIR, sid + '_scroll.json');
    assert.ok(fs.existsSync(ip), ip + ': существует (RED: нет)');
    const raw = fs.readFileSync(ip, 'utf8');
    const it = JSON.parse(raw);
    assert.equal(raw, JSON.stringify(it, null, 2) + '\n', ip + ': roundtrip');
    assert.deepEqual(Object.keys(it), SCROLL_KEYS, ip + ': порядок ключей канон');
    assert.deepEqual(validateData(itemSchema, it, ip), [], ip + ': схема items');
    assert.equal(it.kind, 'spell_scroll', ip + ': kind spell_scroll');
    for (const k of FORBIDDEN_SCROLL_KEYS) {
      assert.equal(it[k], undefined, ip + ': ' + k + ' нет (без rarity)');
    }
    assert.equal(it.tier, lv, ip + ': tier == уровень заклинания');
    assert.equal(it.value, VALUE_BY_TIER[lv], ip + ': value по tier');
    assert.equal(it.base_price, VALUE_BY_TIER[lv], ip + ': base_price == value');
    assert.equal(it.weight, 0.2, ip + ': weight 0.2');
    const sp = path.join(SPELLS_DIR, sid + '.json');
    assert.ok(fs.existsSync(sp), sp + ': существует (RED: нет)');
    const sraw = fs.readFileSync(sp, 'utf8');
    const s = JSON.parse(sraw);
    assert.equal(sraw, JSON.stringify(s, null, 2) + '\n', sp + ': roundtrip');
    assert.deepEqual(validateData(spellSchema, s, sp), [], sp + ': схема spells');
    for (const k of SPELL_REQUIRED) {
      assert.ok(k in s, sp + ': обязательный ключ ' + k);
    }
    assert.deepEqual(Object.keys(s), spellExpectedKeys(s), sp + ': порядок ключей канон');
    assert.equal(s.база, null, sp + ': база null (степень 1)');
    assert.equal(s.степень, 1, sp + ': степень 1');
    assert.equal(s.атрибут, ATTR[sch], sp + ': атрибут по школе');
    assert.equal(s.уровень, lv, sp + ': уровень из ростера');
    assert.ok(MANA_BY_LEVEL[lv].includes(s.мани), sp + ': мани в коридоре уровня');
    assert.deepEqual(s.здания, BLD[sch], sp + ': здания по школе');
    assert.equal('множитель_степени' in s, ['урон', 'лечение'].includes(s.действие),
      sp + ': множитель_степени ровно у урон/лечение (000306)');
    if ('множитель_степени' in s) {
      assert.equal(typeof s['множитель_степени'], 'number', sp + ': множитель — число');
      assert.ok(s['множитель_степени'] > 0, sp + ': множитель > 0');
    }
  }
});

test('000321.11 T2: ростер ≡ диску; свиток ↔ заклинание 1-в-1; уникальность id/имён/описаний/icon_prompt по каталогам', () => {
  const itemIds = itemSlugFiles().map((f) => f.slice(0, -5));
  const spellIds = spellSlugFiles().map((f) => f.slice(0, -5));
  assert.equal(SCROLL_SLUGS.filter((s) => itemIds.includes(s)).length, N,
    'все ' + N + ' свитков на диске');
  assert.equal(SPELL_IDS.filter((s) => spellIds.includes(s)).length, N,
    'все ' + N + ' заклинаний на диске');
  assert.equal(new Set(itemIds).size, itemIds.length, 'id предметов уникальны');
  assert.equal(new Set(spellIds).size, spellIds.length, 'id заклинаний уникальны');
  const itNames = []; const itDescs = [];
  for (const f of itemSlugFiles()) {
    const j = readJson(path.join(ITEMS_DIR, f));
    itNames.push(j.name); itDescs.push(j.desc);
  }
  const spNames = []; const spDescs = []; const icps = [];
  for (const f of spellSlugFiles()) {
    const j = readJson(path.join(SPELLS_DIR, f));
    spNames.push(j.название); spDescs.push(j.описание); icps.push(j.icon_prompt);
  }
  assert.equal(new Set(itNames).size, itNames.length, 'имена предметов уникальны');
  assert.equal(new Set(itDescs).size, itDescs.length, 'desc предметов уникальны');
  assert.equal(new Set(spNames).size, spNames.length, 'названия заклинаний уникальны');
  assert.equal(new Set(spDescs).size, spDescs.length, 'описания заклинаний уникальны');
  assert.equal(new Set(icps).size, icps.length, 'icon_prompt уникальны');
  for (const [sid] of ROSTER) {
    const it = scrollOf(sid); const s = spellOf(sid);
    assert.deepEqual(it.effect, { kind: 'spell', spell: sid },
      it.id + ': effect резолвится в своё заклинание');
    assert.equal(s.id, sid, sid + ': id == имя файла');
    assert.deepEqual(s.предметы, ['assets/items/' + sid + '_scroll.json'],
      sid + ': предметы ссылается на свой свиток');
  }
  const backRefs = new Map();
  for (const f of itemSlugFiles()) {
    const j = readJson(path.join(ITEMS_DIR, f));
    if (j.kind === 'spell_scroll' && j.effect && SPELL_IDS.includes(j.effect.spell)) {
      backRefs.set(j.effect.spell, (backRefs.get(j.effect.spell) || 0) + 1);
    }
  }
  for (const sid of SPELL_IDS) {
    assert.equal(backRefs.get(sid), 1, sid + ': ровно один свиток на новое заклинание');
  }
});

test('000321.11 T3: контракт spell_scroll — name/desc-шаблон, icon-конвенция, effect → существующий JSON, tier=уровень', () => {
  for (const [sid] of ROSTER) {
    assert.ok(fs.existsSync(path.join(ITEMS_DIR, sid + '_scroll.json')),
      sid + '_scroll.json на диске (RED: нет)');
    assert.ok(fs.existsSync(path.join(SPELLS_DIR, sid + '.json')),
      sid + '.json на диске (RED: нет)');
  }
  for (const [sid, name] of ROSTER) {
    const it = scrollOf(sid);
    assert.equal(it.name, 'Свиток: ' + name, it.id + ': name-шаблон');
    assert.equal(it.desc, 'Свиток: изучает «' + name + '» (нужен ранг школы.)',
      it.id + ': desc-шаблон');
    assert.equal(it.icon, 'assets/sprites/items/' + it.id + '.svg',
      it.id + ': icon = конвенция');
    assert.ok(fs.existsSync(path.join(ROOT, it.icon)), it.icon + ': файл есть');
    const target = path.join(SPELLS_DIR, it.effect.spell + '.json');
    assert.ok(fs.existsSync(target), it.id + ': effect.spell резолвится в JSON');
    assert.equal(readJson(target).id, it.effect.spell,
      it.id + ': id внутри == effect.spell');
    assert.equal(it.tier, readJson(target).уровень, it.id + ': tier == уровень спелла');
  }
});

test('000321.11 T4: живые ls-предикаты — каталог ≡ реестру ≡ зеркалу; спеллы ≡ spell-icons; реестр 000001..N подряд', () => {
  const items = itemSlugFiles();
  assert.equal(items.length, REG_KEYS.length, 'каталог ≡ мощности реестра (ls-предикат)');
  assert.equal(I.allItems().length, items.length, 'зеркало items ≡ каталогу');
  const spells = spellSlugFiles();
  const iconFiles = fs.readdirSync(SPIcons).filter((f) => f.endsWith('.svg'));
  assert.equal(spells.length, iconFiles.length, 'спеллы ≡ spell-icons (ls-предикат)');
  assert.deepEqual(spells.map((f) => f.slice(0, -5)).sort(),
    iconFiles.map((f) => f.slice(0, -4)).sort(),
    'spell-icons парно заклинаниям по id');
  assert.equal(REG_KEYS[0], '000001', 'реестр начинается с 000001');
  assert.equal(Number(REG_KEYS[REG_KEYS.length - 1]), REG_KEYS.length,
    'реестр 000001..N подряд, без дыр');
  for (let k = 0; k < REG_KEYS.length; k++) {
    assert.equal(REG_KEYS[k], String(k + 1).padStart(6, '0'),
      'непрерывность позиции ' + REG_KEYS[k]);
  }
});

test('000321.11 T5: иконки обеих семей — формат, тень, координаты в канве, пин против NaN/Infinity, sha256-уникальность', () => {
  const FORBID = ['<path', '<text', '<use', 'stroke', 'Gradient', 'NaN', 'Infinity'];
  for (const sid of SPELL_IDS) {
    const ip = path.join(SPR_DIR, sid + '_scroll.svg');
    assert.ok(fs.existsSync(ip), ip + ': иконка свитка (RED: нет)');
    const t = fs.readFileSync(ip, 'utf8');
    assert.ok(t.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'),
      ip + ': header 64×64');
    assert.ok(t.split('\n')[1].includes('fill="rgba(0,0,0,0.22)"'),
      ip + ': тень-эллипс первым элементом');
    for (const bad of FORBID) {
      assert.ok(!t.includes(bad), ip + ': нет «' + bad + '»');
    }
    assert.deepEqual(numAttrsIn(t, 64), [], ip + ': координаты вне канвы 0..64');
    const sp = path.join(SPIcons, sid + '.svg');
    assert.ok(fs.existsSync(sp), sp + ': иконка заклинания (RED: нет)');
    const s = fs.readFileSync(sp, 'utf8');
    assert.ok(s.includes('width="24"') && s.includes('height="24"')
      && s.includes('viewBox="0 0 24 24"'), sp + ': 24×24');
    assert.ok(s.includes('fill="#e8dcc0"'), sp + ': заливка #e8dcc0');
    for (const bad of ['NaN', 'Infinity']) {
      assert.ok(!s.includes(bad), sp + ': нет «' + bad + '»');
    }
    assert.deepEqual(numAttrsIn(s, 24), [], sp + ': координаты вне канвы 0..24');
  }
  const allHash = new Map();
  for (const dir of [SPR_DIR, SPIcons]) {
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.svg'))) {
      const h = sha(path.join(dir, f));
      assert.ok(!allHash.has(h), f + ' == ' + allHash.get(h) + ': дубль байтов иконки');
      allHash.set(h, f);
    }
  }
});

test('000321.11 T6: craft-guard — рецептов с результатом spell_scroll НЕТ (ни новых, ни старых)', () => {
  const craftFiles = fs.readdirSync(CRAFT_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'schema.json');
  assert.ok(craftFiles.length > 0, 'каталог рецептов непустой (анти-вакуум)');
  const kindById = new Map();
  for (const f of itemSlugFiles()) {
    kindById.set(f.slice(0, -5), readJson(path.join(ITEMS_DIR, f)).kind);
  }
  for (const f of craftFiles) {
    const rec = readJson(path.join(CRAFT_DIR, f));
    const r = rec.результат;
    const raw = r && (typeof r === 'object' ? r.предмет : r);
    const slug = String(raw || '').split('/').pop().replace('.json', '');
    if (slug) assert.ok(kindById.has(slug), f + ': результат резолвится в каталог');
    assert.ok(!SCROLL_SLUGS.includes(slug), f + ': результат — НЕ свиток волны');
    assert.notEqual(kindById.get(slug), 'spell_scroll',
      f + ': ни один рецепт НЕ крафтит spell_scroll (факт диска)');
    const dump = JSON.stringify(rec);
    for (const s of SCROLL_SLUGS) {
      assert.ok(!dump.includes(s), f + ': упоминания «' + s + '» в рецепте нет');
    }
  }
});

test('000321.11 T7: реестр — хвостовой append в лекс-порядке; префикс additions-only; зеркало несёт хвост', () => {
  const total = REG_KEYS.length;
  const start = total - N + 1;
  const tail = REG_KEYS.slice(start - 1);
  const sorted = [...SCROLL_SLUGS].sort();
  assert.equal(tail.length, N, 'хвост длиной ровно ' + N);
  assert.deepEqual(tail.map((k) => REG[k]), sorted,
    'хвост реестра ' + start + '..' + total + ' == новые свитки по лекси');
  const prefixVals = REG_KEYS.slice(0, start - 1).map((k) => REG[k]);
  const diskOld = itemSlugFiles().map((f) => f.slice(0, -5))
    .filter((s) => !SCROLL_SLUGS.includes(s));
  assert.deepEqual([...prefixVals].sort(), [...diskOld].sort(),
    'префикс реестра ≡ диску без новых (additions-only)');
  const mirror = ITD.ITEMS.map((e) => e.id);
  assert.equal(mirror.length, total, 'зеркало items ≡ мощности реестра');
  assert.deepEqual(mirror, [...mirror].sort(), 'зеркало отсортировано по id');
  assert.deepEqual(mirror.slice(-N), sorted, 'зеркало несёт новые свитки хвостом');
});

test('000321.11 T8: живые дельты +N и self-gate: запрет движущихся счётчиков-литералов в этом файле', () => {
  for (const sid of SPELL_IDS) {
    assert.ok(fs.existsSync(path.join(ITEMS_DIR, sid + '_scroll.json')),
      sid + '_scroll.json на диске (RED: нет)');
  }
  const items = itemSlugFiles().map((f) => f.slice(0, -5));
  const spells = spellSlugFiles().map((f) => f.slice(0, -5));
  const itemIcons = fs.readdirSync(SPR_DIR).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4));
  const spellIcons = fs.readdirSync(SPIcons).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4));
  assert.equal(SCROLL_SLUGS.filter((s) => items.includes(s)).length, N, 'свитков ровно ' + N);
  assert.equal(SPELL_IDS.filter((s) => spells.includes(s)).length, N, 'заклинаний ровно ' + N);
  assert.equal(SCROLL_SLUGS.filter((s) => itemIcons.includes(s)).length, N, 'иконок свитков ровно ' + N);
  assert.equal(SPELL_IDS.filter((s) => spellIcons.includes(s)).length, N, 'иконок заклинаний ровно ' + N);
  const kindOf = (slug) => {
    const p = path.join(ITEMS_DIR, slug + '.json');
    return fs.existsSync(p) ? readJson(p).kind : undefined;
  };
  const kindCount = items.filter((s) => kindOf(s) === 'spell_scroll').length;
  const prefixScrolls = REG_KEYS.slice(0, REG_KEYS.length - N)
    .filter((k) => kindOf(REG[k]) === 'spell_scroll').length;
  assert.equal(kindCount, prefixScrolls + N,
    'spell_scroll: дельта ровно +' + N + ' над префиксом реестра');
  const masked = fs.readFileSync(__filename, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
  const liveCounters = new Set([items.length, spells.length, itemIcons.length,
    spellIcons.length, REG_KEYS.length, kindCount]);
  assert.ok(liveCounters.size >= 4, 'набор живых счётчиков непустой (анти-вакуум)');
  for (const v of liveCounters) {
    assert.ok(!new RegExp('\\b' + v + '\\b').test(masked),
      'self-gate 000386 T7: живой счётчик ' + v + ' запрещён литералом в исполняемых строках');
  }
  assert.equal(((fs.readFileSync(__filename, 'utf8')).match(/\d+ файлов \(на момент/g) || []).length, 0,
    'self-gate: паттерн «<цифры> файлов (на момент» отсутствует (counters live)');
});

test('000321.11 T9: spec/canon/c9 — line-neutral правка, байтовый лог ≡ живым байтам, счётчики канона живые', () => {
  const spec = fs.readFileSync(path.join(ROOT, 'spec', 'items.md'), 'utf8');
  assert.ok(!spec.endsWith('\n'), 'spec/items.md без trailing-\\n');
  const lines = spec.split('\n');
  assert.equal(lines.filter((l) => /^## /.test(l)).length, 13, 'spec/items.md — 13 H2');
  const liveCount = itemSlugFiles().length;
  assert.ok(lines.some((l) => l.includes('Каталог пополнен ' + N +
    ' свитками заклинаний 000321.11')),
    'spec: предложение волны 000321.11 в цепочке');
  assert.ok(lines.some((l) => l.includes('Каталог assets/items — ' + liveCount +
    ' файлов (на момент 000321.11)')),
    'spec: счётчик == живому каталогу, «на момент 000321.11»');
  const c9p = path.join(ROOT, 'memory', '000230.16-c9', '000321.11.md');
  assert.ok(fs.existsSync(c9p), 'c9-entry ' + c9p + ' существует (RED: нет)');
  const c9 = fs.readFileSync(c9p, 'utf8');
  const m = c9.match(/^000321\.11: (\d+) \(\+(\d+)\)$/m);
  assert.ok(m, 'c9-entry вида «000321.11: <bytes> (+Δ)»');
  const liveBytes = Buffer.byteLength(spec);
  const c9dir = path.join(ROOT, 'memory', '000230.16-c9');
  const takenLater = fs.readdirSync(c9dir).some((f) => {
    if (!f.endsWith('.md') || f === '000321.11.md') return false;
    const mm = fs.readFileSync(path.join(c9dir, f), 'utf8')
      .match(/^\d{6}(?:\.\d+)?: (\d+) \([+-]\d+\)/m);
    return mm !== null && Number(mm[1]) === liveBytes;
  });
  if (takenLater) {
    assert.ok(Number(m[1]) < liveBytes,
      'c9: преемственность — байты ' + m[1] + ' меньше живых ' + liveBytes
      + ' (поздняя волна переняла счётчик spec/items.md)');
  } else {
    assert.equal(Number(m[1]), liveBytes,
      'c9: байты ≡ живому Buffer.byteLength(spec/items.md)');
  }
  const canonp = path.join(ROOT, 'memory', '000230.16-spec-equipment-doc.md');
  assert.ok(fs.existsSync(canonp), 'файл канона существует');
  const canon = fs.readFileSync(canonp, 'utf8');
  const kindLive = itemSlugFiles()
    .map((f) => readJson(path.join(ITEMS_DIR, f)).kind)
    .filter((k) => k === 'spell_scroll').length;
  assert.ok(canon.includes('spell_scroll ' + kindLive),
    'канон: счётчик spell_scroll == живому (' + kindLive + ')');
  assert.ok(canon.includes('Каталог assets/items — ' + liveCount + ' файлов'),
    'канон: счётчик каталога == живому (' + liveCount + ')');
});

test('000321.11 T10: витрины 000347.02 — ровно один продавец по школе, форма записи, хвост витрины; лут не тронут', () => {
  for (const id of CIRCLED) {
    assert.ok(fs.existsSync(path.join(NPC_DIR, id + '.json')), id + ': продавец существует');
  }
  const npcFiles = fs.readdirSync(NPC_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'schema.json');
  const rosterBySlug = new Map(ROSTER.map((r) => [r[0] + '_scroll', r]));
  const seen = new Map();
  for (const f of npcFiles) {
    const j = readJson(path.join(NPC_DIR, f));
    const arr = (j.торговля && j.торговля.предметы) || [];
    for (const e of arr) {
      const slug = String(e.предмет).replace(/^.*\//, '').replace(/\.json$/, '');
      if (!SCROLL_SLUGS.includes(slug)) continue;
      if (!seen.has(slug)) seen.set(slug, []);
      seen.get(slug).push(f.slice(0, 6));
      assert.deepEqual(Object.keys(e), ['предмет', 'mult_продажи', 'количество'],
        f + ' / ' + slug + ': форма записи канонична');
      assert.equal(e.mult_продажи, 0.5, f + ' / ' + slug + ': mult_продажи 0.5');
      assert.equal(e.количество, 1, f + ' / ' + slug + ': количество 1');
    }
  }
  for (const slug of SCROLL_SLUGS) {
    assert.deepEqual(seen.get(slug) || [], [SELLER[rosterBySlug.get(slug)[2]]],
      slug + ': ровно один продавец по таблице школ');
  }
  for (const id of CIRCLED) {
    const j = readJson(path.join(NPC_DIR, id + '.json'));
    const arr = j.торговля.предметы;
    const isMine = (e) => SCROLL_SLUGS.includes(
      String(e.предмет).replace(/^.*\//, '').replace(/\.json$/, ''));
    const mirrorNpc = NPCS[Number(id) - 1];
    assert.ok(mirrorNpc && mirrorNpc.торговля, id + ': продавец в зеркале npc-data');
    assert.deepEqual(mirrorNpc.торговля.предметы.map((e) => e.предмет),
      arr.map((e) => String(e.предмет).replace(/^assets\/items\//, '').replace(/\.json$/, '')),
      id + ': зеркало ≡ диску витрины');
    const mineCount = arr.filter(isMine).length;
    assert.ok(mineCount > 0, id + ': витрина пополнена');
    assert.deepEqual(arr.slice(-mineCount).map(isMine),
      new Array(mineCount).fill(true), id + ': мои записи — хвостом');
    assert.deepEqual(arr.slice(-mineCount).map((e) => e.предмет),
      [...arr.slice(-mineCount).map((e) => e.предмет)].sort(),
      id + ': хвост в лекс-порядке (= виртуальные номера)');
    assert.ok(!arr.slice(0, arr.length - mineCount).some(isMine),
      id + ': префикс витрины без новых свитков');
  }
  const mobsDir = path.join(ROOT, 'assets', 'mobs');
  const lootText = fs.readdirSync(mobsDir)
    .map((f) => fs.readFileSync(path.join(mobsDir, f), 'utf8')).join('\n');
  for (const slug of SCROLL_SLUGS) {
    assert.ok(!lootText.includes(slug), slug + ': не в таблицах мобов');
  }
  const kinds = I.shopKindsFor(M.BUILDING_TYPES.MAGIC_SHOP) || [];
  assert.ok(!kinds.includes('spell_scroll'),
    'факт диска: magic shop = reagent/skill_book, свитки идут через витрины NPC');
  const uni = I.makeShop(30, 40, M.BUILDING_TYPES.WEAPONS_SHOP, 3);
  const mineInUni = Object.keys(uni.stock)
    .filter((k) => SCROLL_SLUGS.includes(k)).length;
  assert.ok(mineInUni > 0,
    'универсам (w=3, пул allItems) несёт новые свитки rng-хвостом');
  const magic = I.makeShop(30, 40, M.BUILDING_TYPES.MAGIC_SHOP, 0);
  assert.equal(Object.keys(magic.stock)
    .filter((k) => SCROLL_SLUGS.includes(k)).length, 0,
    'magic shop не получил ни одного свитка волны (пул не тронут)');
});

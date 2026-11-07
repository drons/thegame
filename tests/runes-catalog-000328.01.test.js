// Задача 000328.01 — каталог рун: assets/runes (55 записей {id, название,
// описание, эффект}) + assets/runes/schema.json + иконки
// assets/sprites/runes/<id>.svg (flat 64×64) + зеркало src/runes-data.js +
// scripts/sync-runes-data.js. МЕХАНИКА нанесения/стирания/лимитов —
// дочерняя 000328.02 (здесь — только данные и контракт). Контракт эффектов —
// memory/000328-runes.md §3 (источник списка ниже); derived-enum 37 —
// src/sheet.js derived() (факт кода, §2); skill-ссылки — только вторичные
// навыки assets/skills type:'secondary' (pct() читает SECONDARY_SKILLS),
// 'nature' НЕ используется (анти-коллизия 000336). Формат файла —
// roundtrip-канон JSON.stringify(obj,null,2)+'\n' (заморозка T8 без
// исключений). kind=node; require — только node:*/tests/json-schema.js
// (без src-require на загрузке). RED: каталога assets/runes ещё нет —
// все тесты краснеют ОСМЫСЛЕННО (existsSync-guard + assert.fail с
// маркером), не крахом загрузки.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { validateData, schemaKeys, ALLOWED_SCHEMA_KEYS } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const RUNES_DIR = path.join(ROOT, 'assets', 'runes');
const ICON_DIR = path.join(ROOT, 'assets', 'sprites', 'runes');
const SKILLS_DIR = path.join(ROOT, 'assets', 'skills');
const MIRROR = path.join(ROOT, 'src', 'runes-data.js');
const SYNC = path.join(ROOT, 'scripts', 'sync-runes-data.js');

const RUNES_TOTAL_00032801 = 55;

// derived-стат — ФАКТ КОДА src/sheet.js derived() base-объект (§2 memory);
// Хардкод с атрибуцией: при изменении sheet.js — ре-пин (риск зафиксирован).
const DERIVED_STATS_00032801 = [
  'maxHP', 'maxMP', 'armor', 'moveCells', 'attackActions',
  'spellActionsInt', 'spellActionsWis', 'swordHitBonus', 'archerHitBonus',
  'heavyDamageBonus', 'fistDamageBonus', 'rangedDamageBonus',
  'fireDamageBonus', 'iceDamageBonus', 'damageTakenMult', 'dodgeBonus',
  'survivalChance', 'magicResistMult', 'carryWeightMult', 'inventorySlots',
  'moveSpeedMult', 'caveVisionMult', 'acroBonus', 'thiefBonus',
  'dialogueBonus', 'companionMoraleBonus', 'performanceIncomeMult',
  'fearChance', 'potionPowerMult', 'foodPowerMult', 'runePowerMult',
  'xpMult', 'buyPriceMult', 'sellPriceMult', 'equipmentDurabilityMult',
  'hpRegenMult', 'mpRegenMult',
];

// Контракт-список 55 эффектов (memory/000328-runes.md §3): каталог ↔ список
// 1:1; дедупликация эффектов — по canonical-сериализации (сортировка ключей).
const RUNES_CONTRACT_00032801 = [
  { id: "stone_hide", эффект: { type: "derived", stat: "armor", amount: 1 } },
  { id: "wall_plate", эффект: { type: "derived", stat: "armor", amount: 2 } },
  { id: "citadel_heart", эффект: { type: "derived", stat: "armor", amount: 3 } },
  { id: "deep_roots", эффект: { type: "derived", stat: "maxHP", amount: 5 } },
  { id: "ox_strength", эффект: { type: "derived", stat: "maxHP", amount: 10 } },
  { id: "giantblood", эффект: { type: "derived", stat: "maxHP", amount: 15 } },
  { id: "quick_feet", эффект: { type: "derived", stat: "dodgeBonus", amount: 0.02 } },
  { id: "last_straw", эффект: { type: "derived", stat: "survivalChance", amount: 0.03 } },
  { id: "stubborn_hide", эффект: { type: "derived", stat: "damageTakenMult", amount: -0.05 } },
  { id: "warding_circle", эффект: { type: "derived", stat: "magicResistMult", amount: 0.05 } },
  { id: "shallow_well", эффект: { type: "derived", stat: "maxMP", amount: 5 } },
  { id: "deep_spring", эффект: { type: "derived", stat: "maxMP", amount: 10 } },
  { id: "sleepy_groundhog", эффект: { type: "derived", stat: "hpRegenMult", amount: 0.05 } },
  { id: "morning_dew", эффект: { type: "derived", stat: "mpRegenMult", amount: 0.05 } },
  { id: "ember_kiss", эффект: { type: "derived", stat: "fireDamageBonus", amount: 0.05 } },
  { id: "forge_fury", эффект: { type: "derived", stat: "fireDamageBonus", amount: 0.1 } },
  { id: "frost_rime", эффект: { type: "derived", stat: "iceDamageBonus", amount: 0.05 } },
  { id: "glacier_heart", эффект: { type: "derived", stat: "iceDamageBonus", amount: 0.1 } },
  { id: "drunk_scribe", эффект: { type: "derived", stat: "runePowerMult", amount: 0.05 } },
  { id: "true_edge", эффект: { type: "derived", stat: "swordHitBonus", amount: 0.05 } },
  { id: "steady_hand", эффект: { type: "derived", stat: "archerHitBonus", amount: 0.05 } },
  { id: "hammer_mind", эффект: { type: "derived", stat: "heavyDamageBonus", amount: 0.08 } },
  { id: "knuckle_greeting", эффект: { type: "derived", stat: "fistDamageBonus", amount: 0.06 } },
  { id: "hawk_eye", эффект: { type: "derived", stat: "rangedDamageBonus", amount: 0.06 } },
  { id: "berserk_breakfast", эффект: { type: "derived", stat: "attackActions", amount: 1 } },
  { id: "light_tread", эффект: { type: "derived", stat: "moveSpeedMult", amount: 0.03 } },
  { id: "slow_snail", эффект: { type: "derived", stat: "moveSpeedMult", amount: 0.05 } },
  { id: "long_stride", эффект: { type: "derived", stat: "moveCells", amount: 1 } },
  { id: "pack_donkey", эффект: { type: "derived", stat: "carryWeightMult", amount: 0.1 } },
  { id: "endless_pocket", эффект: { type: "derived", stat: "inventorySlots", amount: 2 } },
  { id: "sure_foot", эффект: { type: "derived", stat: "acroBonus", amount: 0.05 } },
  { id: "grumpy_cat", эффект: { type: "derived", stat: "caveVisionMult", amount: 0.05 } },
  { id: "soft_fingers", эффект: { type: "derived", stat: "thiefBonus", amount: 0.05 } },
  { id: "silver_tongue", эффект: { type: "derived", stat: "dialogueBonus", amount: 1 } },
  { id: "grandpa_haggle", эффект: { type: "derived", stat: "buyPriceMult", amount: -0.05 } },
  { id: "fair_price", эффект: { type: "derived", stat: "sellPriceMult", amount: 0.05 } },
  { id: "busker_hat", эффект: { type: "derived", stat: "performanceIncomeMult", amount: 0.05 } },
  { id: "oil_and_stitch", эффект: { type: "derived", stat: "equipmentDurabilityMult", amount: 0.1 } },
  { id: "sharper_brew", эффект: { type: "derived", stat: "potionPowerMult", amount: 0.05 } },
  { id: "hearty_stew", эффект: { type: "derived", stat: "foodPowerMult", amount: 0.05 } },
  { id: "open_book", эффект: { type: "derived", stat: "xpMult", amount: 0.03 } },
  { id: "unfinished_homework", эффект: { type: "derived", stat: "xpMult", amount: 0.05 } },
  { id: "steady_flag", эффект: { type: "derived", stat: "companionMoraleBonus", amount: 0.05 } },
  { id: "golem_touch", эффект: { type: "skill", skill: "golem", amount: 0.1 } },
  { id: "second_wind", эффект: { type: "skill", skill: "endurance", amount: 0.1 } },
  { id: "blade_memory", эффект: { type: "skill", skill: "swordsman", amount: 0.1 } },
  { id: "bowstring_song", эффект: { type: "skill", skill: "archer", amount: 0.1 } },
  { id: "anvil_weight", эффект: { type: "skill", skill: "heavy", amount: 0.1 } },
  { id: "keensight_mark", эффект: { type: "skill", skill: "accuracy", amount: 0.1 } },
  { id: "quiet_moss", эффект: { type: "skill", skill: "hide", amount: 0.1 } },
  { id: "alembic_mark", эффект: { type: "skill", skill: "alchemy", amount: 0.1 } },
  { id: "cramming", эффект: { type: "skill", skill: "scholar", amount: 0.1 } },
  { id: "keen_ledger", эффект: { type: "skill", skill: "merchant", amount: 0.1 } },
  { id: "shoulder_strap", эффект: { type: "skill", skill: "back", amount: 0.1 } },
  { id: "lotus_pose", эффект: { type: "skill", skill: "meditation", amount: 0.1 } },
];

// Палитра иконок рун (memory/000328-runes.md §4): каждый fill= обязан быть
// из набора (токены memory/000302-icon-registry.md §3 — ничего нового).
const RUNES_PALETTE_00032801 = new Set([
  '#6a7480', '#8d8fa0', '#b8b8c8', '#3a3a44', '#6a6472',
  '#e8dcc0', '#d9c9a3', '#c9b98f', '#c9a23c',
  '#c9a86a', '#8a744c', '#a03040', '#c04858', '#5a7fd6', '#88a8e8',
  '#8ab4e8', '#c96f3b', '#f08050', '#4a94c8', '#8ab8e8', '#5a8a44',
  '#85b771', '#5aa469', '#563a82', '#8888e8',
  'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.22)',
]);

const VIEWBOX_00032801 = 'viewBox="0 0 64 64"';

function dataFiles(dir) {
  return fs.readdirSync(dir).filter((f) => /^\d{6}\.json$/.test(f)).sort();
}

function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort()
      .map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

function catalog() {
  return dataFiles(RUNES_DIR).map((f) => ({
    file: f,
    data: JSON.parse(fs.readFileSync(path.join(RUNES_DIR, f), 'utf8')),
  }));
}

function secondarySkillIds() {
  const ids = new Set();
  for (const f of fs.readdirSync(SKILLS_DIR).filter((x) => /^\d{6}\.json$/.test(x))) {
    const j = JSON.parse(fs.readFileSync(path.join(SKILLS_DIR, f), 'utf8'));
    if (j.type === 'secondary') ids.add(j.id);
  }
  return ids;
}

// flat-SVG-чек (паттерн checkFlat из 000335 + ограничения ТЗ 000328.01:
// только rect/circle/ellipse/polygon, без <g>/<defs>, каждый элемент с
// fill=, ≥1 тень-эллипс, fill ∈ палитра).
function checkFlatRuneSvg(text) {
  const v = [];
  if (!text.startsWith('<svg xmlns="http://www.w3.org/2000/svg" ')) {
    v.push('корень <svg с xmlns (атрибуты после имени)');
  }
  const vb = text.split(VIEWBOX_00032801).length - 1;
  if (vb !== 1) v.push('viewBox="0 0 64 64" — ровно 1 (факт: ' + vb + ')');
  for (const bad of ['<linearGradient', '<radialGradient', '<text', '<path',
    '<use', '<defs', '<g', '<g ', '<g>', 'stroke=']) {
    if (text.includes(bad)) v.push(bad + ' — запрещён (flat-SVG)');
  }
  const tags = [...text.matchAll(/<([A-Za-z]+)[\s>/]/g)].map((m) => m[1])
    .filter((t) => t !== 'svg');
  for (const t of tags) {
    if (!['rect', 'circle', 'ellipse', 'polygon'].includes(t)) {
      v.push('элемент <' + t + '> вне белосписка rect/circle/ellipse/polygon');
    }
  }
  const elems = [...text.matchAll(/<(rect|circle|ellipse|polygon)\b[^>]*>/g)]
    .map((m) => m[0]);
  if (elems.length !== tags.length) {
    v.push('все элементы самозакрываются (одинарное вхождение тега)');
  }
  for (const e of elems) {
    if (!e.includes('fill=')) v.push(e.slice(0, 24) + ': нет fill=');
    const fills = [...e.matchAll(/fill="([^"]+)"/g)].map((m) => m[1]);
    for (const f of fills) {
      if (!RUNES_PALETTE_00032801.has(f)) {
        v.push('fill=' + f + ' вне палитры 000328.01');
      }
    }
  }
  if (!/<ellipse\b[^>]*fill="rgba\(0,0,0,0\.2{1,2}\)"[^>]*>/.test(text)) {
    v.push('нет тени-эллипса fill="rgba(0,0,0,0.2)…" (конвенция 000302)');
  }
  return v;
}

// --- T1: схема + свип каталога ---

test('000328.01 T1: assets/runes — 55 файлов подряд 000001–000055; schema.json существует, ключи ⊆ ALLOWED_SCHEMA_KEYS, каждый файл валиден (0 ошибок)', () => {
  assert.ok(fs.existsSync(RUNES_DIR),
    'RED: каталог assets/runes не существует (создаётся задачей 000328.01)');
  const schemaPath = path.join(RUNES_DIR, 'schema.json');
  assert.ok(fs.existsSync(schemaPath),
    'RED: assets/runes/schema.json не существует (в том же коммите, что данные)');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  for (const [where, key] of schemaKeys(schema, '$', [])) {
    assert.ok(ALLOWED_SCHEMA_KEYS.has(key),
      'schema.json ' + where + ': ключ «' + key + '» вне ALLOWED_SCHEMA_KEYS');
  }
  const expected = [...Array(RUNES_TOTAL_00032801)]
    .map((_, i) => String(i + 1).padStart(6, '0') + '.json');
  const files = dataFiles(RUNES_DIR);
  assert.deepEqual(files, expected,
    'нумерация сквозная подряд 000001–000055 (ровно ' +
    RUNES_TOTAL_00032801 + '); факт: [' + files.join(', ') + ']');
  for (const { file, data } of catalog()) {
    assert.deepEqual(validateData(schema, data, file), [],
      file + ': валиден по schema.json');
  }
});

// --- T2: уникальность ---

test('000328.01 T2: id уникальны и по pattern; название/описание непустые и уникальны (sweep)', () => {
  assert.ok(fs.existsSync(RUNES_DIR),
    'RED: каталог assets/runes не существует');
  const seen = { id: new Map(), название: new Map(), описание: new Map() };
  for (const { file, data } of catalog()) {
    for (const field of ['id', 'название', 'описание']) {
      assert.equal(typeof data[field], 'string', file + ': ' + field + ' — строка');
      assert.ok(String(data[field]).trim() !== '',
        file + ': ' + field + ' непустой');
      const prev = seen[field].get(data[field]);
      assert.equal(prev, undefined,
        field + ' «' + data[field] + '» дублируется: ' + prev + ' и ' + file);
      seen[field].set(data[field], file);
    }
    assert.ok(/^[a-z][a-z0-9_]*$/.test(data.id),
      file + ': id «' + data.id + '» не по pattern ^[a-z][a-z0-9_]*$');
  }
  assert.equal(seen.id.size, RUNES_TOTAL_00032801,
    'уникальных id — ровно ' + RUNES_TOTAL_00032801);
});

// --- T3: иконки ---

test('000328.01 T3: иконки assets/sprites/runes — биекция каталог↔иконки, flat-SVG (только rect/circle/ellipse/polygon, viewBox 0 0 64 64, без gradient/text/path/use/defs/g/stroke), fill ∈ палитра, тень есть, sha256 попарно уникальны', () => {
  assert.ok(fs.existsSync(RUNES_DIR), 'RED: каталог assets/runes не существует');
  assert.ok(fs.existsSync(ICON_DIR),
    'RED: каталог иконок assets/sprites/runes не существует');
  const ids = catalog().map(({ data }) => data.id);
  const svgFiles = fs.readdirSync(ICON_DIR).filter((f) => f.endsWith('.svg')).sort();
  assert.deepEqual(svgFiles, ids.map((id) => id + '.svg').sort(),
    'биекция 55↔55: лиших иконок нет, каждая руна с иконкой <id>.svg');
  const hashes = new Map();
  for (const id of ids) {
    const p = path.join(ICON_DIR, id + '.svg');
    assert.ok(fs.existsSync(p), id + ': иконка ' + id + '.svg не существует');
    const text = fs.readFileSync(p, 'utf8');
    assert.deepEqual(checkFlatRuneSvg(text), [], id + '.svg: flat-контракт');
    const h = crypto.createHash('sha256').update(text).digest('hex');
    assert.equal(hashes.get(h), undefined,
      id + '.svg: байт-дубль иконки (' + hashes.get(h) + ')');
    hashes.set(h, id + '.svg');
  }
});

// --- T4: контракт эффектов 1:1 ---

test('000328.01 T4: эффекты ↔ контракт-список memory §3 — 1:1; уникальных эффектов 55 ≥ 50 (дедуп по canonical-сериализации)', () => {
  assert.ok(fs.existsSync(RUNES_DIR), 'RED: каталог assets/runes не существует');
  assert.equal(RUNES_CONTRACT_00032801.length, RUNES_TOTAL_00032801,
    'контракт-список — ровно 55 (канарейка)');
  const contractSet = new Set(RUNES_CONTRACT_00032801.map((r) => canon(r.эффект)));
  assert.equal(contractSet.size, RUNES_TOTAL_00032801,
    'контракт без дублей сериализаций');
  const effectFiles = new Map();
  for (const { file, data } of catalog()) {
    const c = canon(data.эффект);
    assert.ok(contractSet.has(c),
      file + ': эффект ' + c + ' ВНЕ контракт-списка 000328-runes.md §3');
    const prev = effectFiles.get(c);
    assert.equal(prev, undefined,
      'эффект ' + c + ' дублируется: ' + prev + ' и ' + file);
    effectFiles.set(c, file);
  }
  assert.equal(effectFiles.size, RUNES_TOTAL_00032801,
    'уникальных эффектов в каталоге — ровно 55 (≥ 50 по ТЗ)');
  for (const r of RUNES_CONTRACT_00032801) {
    assert.ok(effectFiles.has(canon(r.эффект)),
      'эффект контракта ' + canon(r.эффект) + ' не найден в каталоге');
  }
});

// --- T5: семантика эффектов ---

test('000328.01 T5: derived → stat ∈ enum-37 (sheet.js derived); skill → skill ∈ вторичные навыки assets/skills; множество использованных skill-ссылок НЕ содержит nature (анти-коллизия 000336); amount конечен в границах схемы', () => {
  assert.ok(fs.existsSync(RUNES_DIR), 'RED: каталог assets/runes не существует');
  const secondary = secondarySkillIds();
  assert.ok(secondary.size > 0, 'вторичные навыки прочитаны из assets/skills');
  const usedSkills = new Set();
  for (const { file, data } of catalog()) {
    const e = data.эффект;
    assert.equal(typeof e, 'object', file + ': эффект — объект');
    assert.ok(Number.isFinite(e.amount) && Math.abs(e.amount) <= 100,
      file + ': amount конечен и в границах [-100,100]; факт: ' + e.amount);
    if (e.type === 'derived') {
      assert.ok(DERIVED_STATS_00032801.includes(e.stat),
        file + ': derived-стат «' + e.stat + '» вне enum-37 (src/sheet.js derived)');
      assert.equal(e.skill, undefined, file + ': derived без skill');
    } else if (e.type === 'skill') {
      assert.ok(secondary.has(e.skill),
        file + ': skill-ссылка «' + e.skill + '» вне каталога вторичных навыков');
      assert.equal(e.stat, undefined, file + ': skill без stat');
      usedSkills.add(e.skill);
    } else {
      assert.fail(file + ': тип эффекта «' + e.type + '» вне derived/skill');
    }
  }
  assert.ok(!usedSkills.has('nature'),
    'nature в skill-ссылках рун НЕ используется (коллизия secondary/school, ' +
    'GUARD 000336); факт: ' + [...usedSkills].join(', '));
});

// --- T6: зеркало ---

test('000328.01 T6: зеркало src/runes-data.js — RUNES.length 55, поэлементно deepEqual JSON в порядке нумерации, порядок id совпадает', () => {
  assert.ok(fs.existsSync(RUNES_DIR), 'RED: каталог assets/runes не существует');
  assert.ok(fs.existsSync(MIRROR),
    'RED: зеркало src/runes-data.js не сгенерировано (scripts/sync-runes-data.js)');
  const mod = require(MIRROR);
  assert.ok(Array.isArray(mod.RUNES), 'RUNES — массив');
  assert.equal(mod.RUNES.length, RUNES_TOTAL_00032801,
    'RUNES.length — ровно 55; факт: ' + mod.RUNES.length);
  const json = catalog();
  json.forEach(({ file, data }, i) => {
    assert.deepEqual(mod.RUNES[i], data,
      file + ': зеркало ≡ JSON (позиция ' + i + ')');
  });
  assert.deepEqual(mod.RUNES.map((r) => r.id), json.map(({ data }) => data.id),
    'порядок id зеркала = порядок нумерации файлов');
});

// --- T7: sync-интеграция ---

test('000328.01 T7: scripts/sync-runes-data.js существует, подхватывается sync-all по конвенции, npm run sync:runes запинен; tmp-дерево: exit 0, выход ≡ закоммиченному зеркалу, повторный запуск byte-identical', () => {
  assert.ok(fs.existsSync(RUNES_DIR), 'RED: каталог assets/runes не существует');
  assert.ok(fs.existsSync(SYNC), 'RED: scripts/sync-runes-data.js не существует');
  const { listSyncScripts } = require(path.join(ROOT, 'scripts', 'sync-all.js'));
  assert.ok(listSyncScripts(ROOT).includes('sync-runes-data.js'),
    'listSyncScripts: sync-runes-data.js подхватывается конвенцией sync-*.js');
  const pkg = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['sync:runes'], 'node scripts/sync-runes-data.js',
    'package.json: алиас sync:runes (единый интерфейс sync-алиасов)');
  const committed = fs.readFileSync(MIRROR, 'utf8');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'runes-sync-'));
  try {
    const { spawnSync } = require('node:child_process');
    fs.mkdirSync(path.join(tmp, 'scripts', 'lib'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'assets', 'runes'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'scripts', 'lib', 'write-atomic.js'),
      path.join(tmp, 'scripts', 'lib', 'write-atomic.js'));
    fs.copyFileSync(SYNC, path.join(tmp, 'scripts', 'sync-runes-data.js'));
    for (const f of dataFiles(RUNES_DIR)) {
      fs.copyFileSync(path.join(RUNES_DIR, f),
        path.join(tmp, 'assets', 'runes', f));
    }
    const run1 = spawnSync(process.execPath,
      [path.join(tmp, 'scripts', 'sync-runes-data.js')], { encoding: 'utf8' });
    assert.equal(run1.status, 0, 'tmp-запуск exit 0: ' + (run1.stderr || run1.stdout));
    const out1 = path.join(tmp, 'src', 'runes-data.js');
    assert.ok(fs.existsSync(out1), 'tmp: src/runes-data.js создан');
    assert.equal(fs.readFileSync(out1, 'utf8'), committed,
      'tmp-генерация ≡ закоммиченному зеркалу (зеркало — ONLY генерация)');
    fs.rmSync(out1);
    const run2 = spawnSync(process.execPath,
      [path.join(tmp, 'scripts', 'sync-runes-data.js')], { encoding: 'utf8' });
    assert.equal(run2.status, 0, 'повторный tmp-запуск exit 0');
    assert.equal(fs.readFileSync(out1, 'utf8'), committed,
      'идемпотентность: выход byte-identical');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- T8: roundtrip-заморозка ---

test('000328.01 T8: каждый assets/runes/NNNNNN.json — roundtrip-канон JSON.stringify(obj,null,2)+перевод строки; исключений нет', () => {
  assert.ok(fs.existsSync(RUNES_DIR), 'RED: каталог assets/runes не существует');
  for (const f of dataFiles(RUNES_DIR)) {
    const text = fs.readFileSync(path.join(RUNES_DIR, f), 'utf8');
    assert.equal(text, JSON.stringify(JSON.parse(text), null, 2) + '\n',
      f + ': roundtrip-формат новой конвенции каталога (схема — вне скоупа)');
  }
});

// --- T9: schema self-check (фикстуры в памяти) ---

const POSITIVE_FIXTURES_00032801 = [
  { id: 'pos_derived', название: 'Позитив один', описание: 'derived-эффект.',
    эффект: { type: 'derived', stat: 'armor', amount: 1 } },
  { id: 'pos_skill', название: 'Позитив два', описание: 'skill-эффект.',
    эффект: { type: 'skill', skill: 'golem', amount: 0.1 } },
  { id: 'pos_negative_amount', название: 'Позитив три',
    описание: 'отрицательный amount допустим.',
    эффект: { type: 'derived', stat: 'damageTakenMult', amount: -0.05 } },
];
const NEGATIVE_FIXTURES_00032801 = [
  ['нет эффект', { id: 'neg1', название: 'Н', описание: 'О' }],
  ['лишний ключ', { id: 'neg2', название: 'Н', описание: 'О',
    эффект: { type: 'derived', stat: 'armor', amount: 1 }, иконка: 'x' }],
  ['id с заглавной', { id: 'Neg3', название: 'Н', описание: 'О',
    эффект: { type: 'derived', stat: 'armor', amount: 1 } }],
  ['название пустое', { id: 'neg4', название: ' ', описание: 'О',
    эффект: { type: 'derived', stat: 'armor', amount: 1 } }],
  ['эффект type flavor', { id: 'neg5', название: 'Н', описание: 'О',
    эффект: { type: 'flavor', text: 'юмор' } }],
  ['derived без stat', { id: 'neg6', название: 'Н', описание: 'О',
    эффект: { type: 'derived', amount: 1 } }],
  ['stat вне enum', { id: 'neg7', название: 'Н', описание: 'О',
    эффект: { type: 'derived', stat: 'maxStamina', amount: 1 } }],
  ['skill amount строкой', { id: 'neg8', название: 'Н', описание: 'О',
    эффект: { type: 'skill', skill: 'golem', amount: '0.1' } }],
  ['skill без skill', { id: 'neg9', название: 'Н', описание: 'О',
    эффект: { type: 'skill', amount: 0.1 } }],
  ['эффект не объект', { id: 'neg10', название: 'Н', описание: 'О',
    эффект: 'armor+1' }],
];

test('000328.01 T9: схема self-check — позитивы валидны и проходят РОВНО одним вариантом oneOf; кривые фикстуры (10) — красные; чекер не немой', () => {
  const schemaPath = path.join(RUNES_DIR, 'schema.json');
  assert.ok(fs.existsSync(schemaPath),
    'RED: assets/runes/schema.json не существует');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const effectOneOf = schema.properties.эффект.oneOf;
  assert.ok(Array.isArray(effectOneOf) && effectOneOf.length === 2,
    'эффект — oneOf из двух вариантов (derived/skill с const type)');
  for (const fx of POSITIVE_FIXTURES_00032801) {
    assert.deepEqual(validateData(schema, fx, fx.id), [],
      fx.id + ': позитив валиден');
    const matched = effectOneOf.filter((sub) =>
      validateData(sub, fx.эффект, fx.id + '.эффект').length === 0);
    assert.equal(matched.length, 1,
      fx.id + ': oneOf — ровно один вариант (дизъюнктность const type)');
  }
  for (const [name, fx] of NEGATIVE_FIXTURES_00032801) {
    assert.ok(validateData(schema, fx, name).length > 0,
      name + ': негативная фикстура ОТВЕТИЛА ошибкой (валидатор не немой)');
  }
});

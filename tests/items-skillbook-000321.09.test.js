// Задача 000321.09 (9-я волна батча 000321): +50 книг навыков kind=skill_book,
// виртуальные позиции 000915–000964. kind=node; require — свои модули, чужие
// тесты не требуются. Контракт — memory/000321-skillbook-items.md.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const I = require('../src/items.js');
const ITD = require('../src/items-data.js');
const L = require('../src/loot-equip-data.js');
const SKD = require('../src/skills-data.js');
const { validateData } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const ITEMS_DIR = path.join(ROOT, 'assets', 'items');
const SPR_DIR = path.join(ROOT, 'assets', 'sprites', 'items');
const CRAFT_DIR = path.join(ROOT, 'assets', 'craft');

const NUM2ID = require(path.join(__dirname, 'scripts',
  'items-num2id-000318.08.json'));
const ID2NUM = {};
for (const n of Object.keys(NUM2ID)) ID2NUM[NUM2ID[n]] = n;
function SLUG(f) {
  return f !== 'schema.json' && /^[a-z][a-z0-9_]*\.json$/.test(f);
}
function VIRTNUM(f) {
  const b = f.replace(/\.json$/, '');
  return ID2NUM[b] !== undefined ? ID2NUM[b] + '.json' : f;
}
function DISKF(x) {
  const b = String(x).replace(/\.json$/, '');
  return (NUM2ID[b] !== undefined ? NUM2ID[b] : b) + '.json';
}
function FILES() {
  return fs.readdirSync(ITEMS_DIR).filter(SLUG).map(VIRTNUM).sort();
}
const JRC = require('../scripts/lib/json-ref.js');
const CRAFT_FILE_RE = JRC.SHAPE_BASENAME_RES[JRC.ASSET_NAME_SHAPES.craft];
function recFiles() {
  return fs.readdirSync(CRAFT_DIR)
    .filter((f) => f !== 'schema.json' && CRAFT_FILE_RE.test(f)).sort();
}
function loadItemFile(num) {
  const f = String(num).padStart(6, '0') + '.json';
  const p = path.join(ITEMS_DIR, DISKF(f));
  assert.ok(fs.existsSync(p),
    'assets/items/' + f + ' существует (краснота: каталог 914 — '
    + 'книги волны не созданы)');
  return fs.readFileSync(p, 'utf8');
}
function diskObj(id) {
  const p = path.join(ITEMS_DIR, id + '.json');
  assert.ok(fs.existsSync(p), 'assets/items/' + id + '.json существует');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const CANON_ORDER = ['id', 'name', 'kind', 'subtype', 'weight', 'value',
  'base_price', 'tier', 'desc', 'stats', 'effect', 'loot', 'icon',
  'slot', 'rarity', 'set', 'affixes', 'set_bonus'];
const FORBIDDEN_KEYS = ['rarity', 'slot', 'set', 'subtype', 'tier', 'loot',
  'affixes', 'set_bonus', 'stats', 'base_price'];
const LEX_PREDECESSOR = 'zveroboy_chay'; // lex-хвост каталога ДО волны 000321.09
const SECONDARY = Object.keys(SKD.SECONDARY_SKILLS);
const OLD_BOOKS = {
  archer_scroll: ['archer', 15, 0.2, 45],
  alchemy_manual: ['alchemy', 10, 0.5, 50],
  fire_spellbook: ['firelord', 25, 0.5, 60],
  heavy_tome: ['heavy', 30, 0.6, 70],
  meditation_scroll: ['meditation', 15, 0.2, 40],
  nature_scroll: ['nature', 15, 0.2, 40],
  ice_spellbook: ['icelord', 25, 0.5, 60],
  stone_fist_grimoire: ['fists', 25, 0.4, 55],
  archery_manual: ['accuracy', 10, 0.5, 60],
  iron_hide_tome: ['hide', 25, 0.4, 55],
  sword_treatise: ['swordsman', 10, 0.5, 60],
};

// Ростер волны: [номер, id, имя, навык, weight, value, «хвост» desc].
// desc каноничен: «<Имя>: <хвост>» (паттерн 000321.07/.08).
// РАСПРЕДЕЛЕНИЕ (решение станции, memory/000321-skillbook-items.md): 21
// непокрытый навык × 2 тома (A «Звездопись» + B «Звукопись») + 8 покрытых ×
// 1 том A = 50; покрытие — все 32 вторичных навыка ≥ 1 книги.
const ROSTER_00032109 = [
  [915,"zvezdopis_accuracy","Звездопись меткости","accuracy",0.2,40,"глаз привыкает к ветру раньше, чем рука к тетиве."],
  [916,"zvezdopis_acro","Звездопись акробатики","acro",0.2,40,"созвездия учат приземляться мягче, чем пол."],
  [917,"zvezdopis_alchemy","Звездопись алхимика","alchemy",0.3,45,"ретику не интересны твои догадки о пропорциях."],
  [918,"zvezdopis_archer","Звездопись стрелка","archer",0.4,50,"ветер читают по оперению, а не по ветвям."],
  [919,"zvezdopis_artist","Звездопись артиста","artist",0.3,45,"звёзды не спрашивают, для кого ты поёшь."],
  [920,"zvezdopis_back","Звездопись крепкой спины","back",0.4,50,"ноша — тоже договор со спиной."],
  [921,"zvezdopis_breath","Звездопись глубокого вдоха","breath",0.5,55,"воздух на вдохе тяжелее, чем кажется."],
  [922,"zvezdopis_catseye","Звездопись кошачьего глаза","catseye",0.2,40,"звёзды видят лучше прищуренным глазом."],
  [923,"zvezdopis_elder","Звездопись старейшины","elder",0.3,45,"летопись старейшин пишется медленно и начисто."],
  [924,"zvezdopis_endurance","Звездопись выносливости","endurance",0.4,50,"терпение измеряют не верстами, а шагом."],
  [925,"zvezdopis_firelord","Звездопись повелителя огня","firelord",0.5,55,"пламя благодарно ровно до той секунды, пока его считают."],
  [926,"zvezdopis_fists","Звездопись каменных кулаков","fists",0.2,40,"кулак — короткий разговор, зато без переводчика."],
  [927,"zvezdopis_forge","Звездопись кузнечной руки","forge",0.5,55,"искры читают кузнеца лучше ученика."],
  [928,"zvezdopis_fright","Звездопись застращивания","fright",0.2,40,"страх тоже светило, только тёмное."],
  [929,"zvezdopis_golem","Звездопись голема","golem",0.3,45,"глина помнит каждое прикосновение к ней."],
  [930,"zvezdopis_heavy","Звездопись тяжёлого оружия","heavy",0.3,45,"инерцию не обманешь красивой позой."],
  [931,"zvezdopis_leader","Звездопись предводителя","leader",0.4,50,"знаменосца сверяют по звёздам, а не по крику."],
  [932,"zvezdopis_meditation","Звездопись медитации","meditation",0.4,50,"ману слышно там, где умолкают мысли."],
  [933,"zvezdopis_merchant","Звездопись торговца","merchant",0.5,55,"прибыль любит твёрдую цену, как глина обжиг."],
  [934,"zvezdopis_orator","Звездопись оратора","orator",0.2,40,"красноречие сверяют по паузам, а не по словам."],
  [935,"zvezdopis_perception","Звездопись зоркости","perception",0.3,45,"зоркость начинается там, где кончается ожидание."],
  [936,"zvezdopis_precog","Звездопись ясновидения","precog",0.4,50,"будущее видно боковым зрением созвездий."],
  [937,"zvezdopis_runes","Звездопись рунописи","runes",0.5,55,"руна светится только тому, кто её чертил."],
  [938,"zvezdopis_scholar","Звездопись учёного","scholar",0.2,40,"книг больше, чем прочитанных ночей."],
  [939,"zvezdopis_staff","Звездопись владения посохом","staff",0.3,45,"посох знает длину пути раньше хозяина."],
  [940,"zvezdopis_step","Звездопись ловкого шага","step",0.4,50,"тропа складывается из шагов, а не из намерений."],
  [941,"zvezdopis_swordsman","Звездопись мечника","swordsman",0.5,55,"клинок помнит все твои оправдания."],
  [942,"zvezdopis_thief","Звездопись тати","thief",0.5,55,"вор сверяется с тенью, а не с часами."],
  [943,"zvezdopis_unkill","Звездопись несокрушимости","unkill",0.2,40,"несокрушимость — это терпение с крепкой челюстью."],
  [944,"zvukopis_acro","Звукопись акробатики","acro",0.3,55,"ритм прыжка слышен раньше, чем сам прыжок."],
  [945,"zvukopis_artist","Звукопись артиста","artist",0.4,60,"сцена хранит эхо лучше, чем зритель."],
  [946,"zvukopis_back","Звукопись крепкой спины","back",0.5,65,"хруст в пояснице — дурной предвестник."],
  [947,"zvukopis_breath","Звукопись глубокого вдоха","breath",0.6,70,"выдох считает удары вслух."],
  [948,"zvukopis_catseye","Звукопись кошачьего глаза","catseye",0.3,55,"блик в темноте выдаёт и дверь, и засов."],
  [949,"zvukopis_elder","Звукопись старейшины","elder",0.4,60,"голос старейшины узнают по тишине после."],
  [950,"zvukopis_endurance","Звукопись выносливости","endurance",0.5,65,"второе дыхание приходит, когда первое уже прошло."],
  [951,"zvukopis_forge","Звукопись кузнечной руки","forge",0.6,70,"молот задаёт темп, наковальня его помнит."],
  [952,"zvukopis_fright","Звукопись застращивания","fright",0.3,55,"вой в темноте пугает и самого воющего."],
  [953,"zvukopis_golem","Звукопись голема","golem",0.4,60,"камень оживает на тот же ритм, что и засыпает."],
  [954,"zvukopis_leader","Звукопись предводителя","leader",0.5,65,"строй слышит голос, а не обещания."],
  [955,"zvukopis_merchant","Звукопись торговца","merchant",0.6,70,"торг идёт на том же слухе, что и молчание."],
  [956,"zvukopis_orator","Звукопись оратора","orator",0.3,55,"толпа внимательна к звуку, а не к смыслу."],
  [957,"zvukopis_perception","Звукопись зоркости","perception",0.4,60,"тишина сообщает больше, чем шум рынка."],
  [958,"zvukopis_precog","Звукопись ясновидения","precog",0.5,65,"вещий сон всегда приходит на полуноте."],
  [959,"zvukopis_runes","Звукопись рунописи","runes",0.6,70,"начертание диктуют не рукой, а дыханием."],
  [960,"zvukopis_scholar","Звукопись учёного","scholar",0.3,55,"сноска важнее цитаты, если сноска верна."],
  [961,"zvukopis_staff","Звукопись владения посохом","staff",0.4,60,"удар посохом звучит ниже, чем обещание."],
  [962,"zvukopis_step","Звукопись ловкого шага","step",0.5,65,"тихий шаг — тоже музыка, только для своих."],
  [963,"zvukopis_thief","Звукопись тати","thief",0.6,70,"замок отвечает на звук, а не на силу."],
  [964,"zvukopis_unkill","Звукопись несокрушимости","unkill",0.3,55,"седьмой удар всегда легче первого."]
];
const ROSTER_IDS = ROSTER_00032109.map((r) => r[1]);
const ROSTER_SET = new Set(ROSTER_IDS);
const ROSTER_SKILLS = new Set(ROSTER_00032109.map((r) => r[3]));

function allDiskObjects() {
  const out = [];
  for (const f of fs.readdirSync(ITEMS_DIR).filter(SLUG)) {
    out.push(JSON.parse(fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8')));
  }
  return out;
}
function svgFiles() {
  return fs.readdirSync(SPR_DIR).filter((f) => f.endsWith('.svg'));
}
const NEEDLE_A = 'base_price';

// --- T1: форма 50 предметов --------------------------------------------------

test('000321.09 T1: каталог — ls-предикат: N файлов <id>.json (N = счётчик диска; ls-пол ≥ 964; миграция 000397) (позиции 000915–000964 по реестру 000318.08); новые 50 — kind skill_book, БЕЗ rarity/slot/set/subtype/tier/stats/loot/affixes/set_bonus и БЕЗ base_price (решение станции: цена продажи через SELL_BASE_VALUE.skill_book), порядок ключей = канон sync-items-data.js (icon ПОСЛЕДНИМ), roundtrip-канон stringify(…,2)+\\n, валидны по assets/items/schema.json (краснота: каталог 914 — волна не добавлена) (ре-пин 000321.11: +50 свитков 001015–001064 — каталог 1014 → 1064; ре-пин 000321.10: +50 реагентов — каталог 1014, craft 768)', () => {
  const files = FILES();
  assert.ok(files.length >= 964,
    'каталог — ls-пол ≥ 964 json-файлов (миграция 000397; история волн: 914 + 50 книг 000321.09); факт: ' + files.length
    + ' (краснота: волна не добавлена)');
  const schema = JSON.parse(
    fs.readFileSync(path.join(ITEMS_DIR, 'schema.json'), 'utf8'));
  for (const [num, id] of ROSTER_00032109) {
    const f = String(num).padStart(6, '0') + '.json';
    assert.equal(files[num - 1], f,
      'реестровый порядок: позиция ' + num + ' — ' + f + ' (факт: '
      + files[num - 1] + ')');
    const raw = loadItemFile(num);
    const j = JSON.parse(raw);
    assert.deepEqual(validateData(schema, j, f), [], f + ': схема');
    assert.equal(j.kind, 'skill_book', f + ': kind skill_book');
    for (const absent of FORBIDDEN_KEYS) {
      assert.equal(j[absent], undefined, f + ': ' + absent + ' нет');
    }
    assert.equal(j.icon, 'assets/sprites/items/' + id + '.svg',
      f + ': icon = assets/sprites/items/<id>.svg');
    const keys = Object.keys(j);
    assert.equal(keys[keys.length - 1], 'icon',
      f + ': icon — ПОСЛЕДНИЙ ключ; факт: ' + keys.join(','));
    const idx = keys.filter((k) => k !== 'id')
      .map((k) => CANON_ORDER.indexOf(k));
    assert.deepEqual(idx, [...idx].sort((a, b) => a - b),
      f + ': порядок ключей — канон KEYS sync-items-data.js; факт: '
      + keys.join(','));
    assert.equal(JSON.stringify(j, null, 2) + '\n', raw,
      f + ': roundtrip-канон');
  }
});

// --- T2: ростер + глобальная уникальность + additions-only ------------------

test('000321.09 T2: ростер 50 строк ≡ JSON (id/имя/skill/weight/value/desc «<Имя>: …»); sweep по живому каталогу (ls): id, ИМЕНА и ОПИСАНИЯ уникальны по всему каталогу; все 50 новых id ЛЕКСИКОГРАФИЧЕСКИ > «zveroboy_chay» (additions-only: хвост зеркального lex-порядка ⇒ rng-потоки существующих стоков не сдвигаются) (краснота: каталог 914) (ре-пин 000321.11: +50 свитков 001015–001064 — каталог 1014 → 1064; ре-пин 000321.10: +50 реагентов — каталог 1014, craft 768)', () => {
  const files = FILES();
  assert.ok(files.length >= 964, 'каталог — ls-пол ≥ 964 json-файлов (миграция 000397); факт: ' + files.length);
  const ids = new Map();
  const names = new Map();
  const descs = new Map();
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(
      path.join(ITEMS_DIR, DISKF(f)), 'utf8'));
    assert.ok(!ids.has(j.id), 'дубликат id: ' + j.id + ' (' + f + ')');
    ids.set(j.id, f);
    assert.ok(!names.has(j.name),
      'дубликат имени: ' + j.name + ' (' + f + ')');
    names.set(j.name, f);
    assert.ok(!descs.has(j.desc),
      'дубликат desc: ' + j.desc + ' (' + f + ')');
    descs.set(j.desc, f);
  }
  assert.equal(ids.size, files.length);
  for (const [num, id, name, skill, weight, value, tail] of ROSTER_00032109) {
    const j = JSON.parse(loadItemFile(num));
    assert.equal(j.id, id, num + ': id == ростер');
    assert.equal(j.name, name, id + ': имя == ростер');
    assert.equal(j.effect.skill, skill, id + ': effect.skill == ростер');
    assert.equal(j.weight, weight, id + ': weight == ростер');
    assert.equal(j.value, value, id + ': value == ростер');
    assert.equal(j.desc, name + ': ' + tail, id + ': desc = «<Имя>: …»');
    assert.ok(id > LEX_PREDECESSOR,
      id + ': lex-позиция после хвоста каталога ДО волны ('
      + LEX_PREDECESSOR + ')');
  }
});

// --- T3: effect-контракт и покрытие вторичных навыков ----------------------

test('000321.09 T3: effect ≡ {kind: skill_xp, skill, amount} (ключи в этом порядке), amount ≡ 10 у всех 50 (факт ТЗ), skill ∈ SECONDARY_SKILLS (32 — src/skills-data.js; валидатор src/items.js требует P.SECONDARY_SKILLS[e.skill] — книга на ПЕРВИЧНЫЙ навык физически невозможна); инвариант покрытия: у КАЖДОГО из 32 вторичных навыков ≥ 1 книги навыков в каталоге (живой свип) (краснота: книг нет)', () => {
  for (const [num, id, , skill] of ROSTER_00032109) {
    const j = JSON.parse(loadItemFile(num));
    assert.deepEqual(Object.keys(j.effect), ['kind', 'skill', 'amount'],
      id + ': ключи effect — kind, skill, amount');
    assert.equal(j.effect.kind, 'skill_xp', id + ': effect.kind skill_xp');
    assert.equal(j.effect.amount, 10, id + ': amount == 10');
    assert.equal(j.effect.skill, skill, id + ': skill == ростер');
    assert.ok(SKD.SECONDARY_SKILLS[skill],
      id + ': skill ∈ SECONDARY_SKILLS (' + skill + ')');
  }
  assert.equal(SECONDARY.length, 32,
    'вторичных навыков на диске — 32 (факт базы; ТЗ «31» устарело); факт: '
    + SECONDARY.length);
  const covered = new Set();
  for (const it of allDiskObjects()) {
    if (it.kind === 'skill_book') covered.add(it.effect.skill);
  }
  for (const s of SECONDARY) {
    assert.ok(covered.has(s),
      'у вторичного навыка «' + s + '» нет ни одной книги навыков; '
      + 'покрытие: ' + covered.size + '/32 (краснота: волна не добавлена)');
  }
  assert.ok(ROSTER_SKILLS.size >= 21,
    'волна закрыла ≥ 21 непокрытого ранее навыка; факт: '
    + ROSTER_SKILLS.size);
});

// --- T4: вид skill_book — 61, старые 11 verbatim, коридоры ------------------

test('000321.09 T4: вид skill_book — РОВНО 61 (11 старых + 50 новых); У ВСЕХ 61 нет rarity и нет slot (sweep); старые 11 вербатим с ДИСКА (навык/amount/weight/value — урок .08-M12: не через зеркало); новые — weight ∈ [0.2,0.6], value ∈ [40,70] (лестница существующих книг), effect.amount = 10 у всех новых (краснота: skill_book 11)', () => {
  const books = allDiskObjects().filter((it) => it.kind === 'skill_book');
  assert.equal(books.length, 61,
    'skill_book — 61 (11 + 50 волны); факт: ' + books.length);
  for (const b of books) {
    assert.equal(b.rarity, undefined, b.id + ': rarity нет');
    assert.equal(b.slot, undefined, b.id + ': slot нет');
  }
  for (const [id, [skill, amount, weight, value]] of Object.entries(OLD_BOOKS)) {
    const j = diskObj(id);
    assert.equal(j.kind, 'skill_book', id + ': старый — книга');
    assert.equal(j.effect.skill, skill, id + ': навык старого не двигался');
    assert.equal(j.effect.amount, amount, id + ': amount старого не двигался');
    assert.equal(j.weight, weight, id + ': weight старого не двигался');
    assert.equal(j.value, value, id + ': value старого не двигался');
  }
  for (const [, id] of ROSTER_00032109) {
    const j = diskObj(id);
    assert.ok(j.weight >= 0.2 && j.weight <= 0.6,
      id + ': weight ∈ [0.2,0.6]; факт: ' + j.weight);
    assert.ok(j.value >= 40 && j.value <= 70,
      id + ': value ∈ [40,70]; факт: ' + j.value);
    assert.equal(j.effect.amount, 10, id + ': amount новых == 10');
  }
});

// --- T5: иконки -------------------------------------------------------------

test('000321.09 T5: иконки — у 50 новых поле icon ↔ файл существует; биекция json↔svg по basename; flat-SVG 64×64: viewBox ровно «0 0 64 64», ПЕРВЫЙ элемент — тень-эллипс rgba(0,0,0,0.22), без linearGradient/radialGradient/<text/<path/<use/stroke= (паттерн 000302/000335); sha256-уникальность против всех 1081 иконок (ре-пин 000321.13: +50 иконок сборников чертежей 001115–001164 — иконки 1031 → 1081; ре-пин 000321.12: +50 свитков воскрешения 001065–001114 — иконки 981 → 1081; краснота: файлы не созданы)', () => {
  const hash = (p) => createHash('sha256')
    .update(fs.readFileSync(p)).digest('hex');
  const hashes = new Map();
  for (const f of svgFiles()) {
    const h = hash(path.join(SPR_DIR, f));
    assert.ok(!hashes.has(h), 'дубликат байт иконки: ' + f + ' ≡ '
      + hashes.get(h));
    hashes.set(h, f);
  }
  assert.equal(hashes.size, 1081,
    'иконок sprites/items — 1081 (ре-пин 000321.13: +50 иконок чертежей 001115–001164; 881 + 50 книг + 50 свитков 000321.11 + 50 свитков воскрешения 000321.12); факт: ' + hashes.size
    + ' (краснота: иконок нет)');
  for (const [, id] of ROSTER_00032109) {
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
    assert.ok(!/NaN|Infinity|undefined/.test(text),
      f + ': битое число в байтах иконки (генератор выдал NaN/Infinity)');
    for (const m of text.matchAll(/points="([^"]+)"/g)) {
      for (const tok of m[1].trim().split(/\s+/)) {
        const [px, py] = tok.split(',').map(Number);
        assert.ok(Number.isFinite(px) && Number.isFinite(py)
          && px >= 0 && px <= 64 && py >= 0 && py <= 64,
          f + ': вершина «' + tok + '» вне холста 0..64');
      }
    }
    for (const m of text.matchAll(/(?:cx|cy|rx|ry|r)="([^"]+)"/g)) {
      const v = Number(m[1]);
      assert.ok(Number.isFinite(v) && v >= 0 && v <= 64,
        f + ': размер «' + m[1] + '» вне холста 0..64');
    }
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
    const j = diskObj(id);
    assert.equal(j.icon, 'assets/sprites/items/' + f,
      f + ': биекция icon ↔ файл');
  }
});

// --- T6: страж «рецептов с результатом skill_book нет» (зелёный и до волны) -

test('000321.09 T6: страж факта диска — каталог craft РОВНО 768; НИ У ОДНОГО рецепта результат не kind skill_book (sweep по 768); ни один id волны не является результатом рецепта (книги — лут/торговля, ТЗ-п.2) (ре-пин 000321.10: +50 реагентов — каталог 1014, craft 768)', () => {
  const files = recFiles();
  assert.equal(files.length, 768,
    'craft — 768 файла (не вырос: рецептов книг нет); факт: ' + files.length);
  for (const f of files) {
    const j = JSON.parse(
      fs.readFileSync(path.join(CRAFT_DIR, f), 'utf8'));
    const ref = j['результат']['предмет'];
    const m = /([a-z0-9_]+)\.json$/.exec(ref);
    assert.ok(m, f + ': ссылка результата — <id>.json');
    const it = I.getItem(m[1]);
    assert.ok(it, f + ': результат ∈ каталог');
    assert.notEqual(it.kind, 'skill_book',
      f + ': результат — НЕ книга навыков (факт диска)');
    assert.ok(!ROSTER_SET.has(it.id),
      f + ': результат — НЕ предмет волны 000321.09');
  }
});

// --- T7: зеркало + реестр + additions-only в зеркале ------------------------

test('000321.09 T7: зеркало src/items-data.js ≡ каталогу (ls-предикат), новые 50 ≡ JSON поэлементно, getItem резолвится, зеркало lex-упорядочено и наши 50 — НЕМЕДЛЕННО ПЕРЕД хвостом (ре-пин 000321.12: +50 свитков воскрешения 001065–001114 — книги сдвинулись на −50; ре-пин 000321.11: +50 свитков 001015–001064 — каталог 1014 → 1064; ре-пин 000321.10: ХВОСТ заняли реагенты zy* > zv*); реестр tests/scripts/items-num2id-000318.08.json — ключи «000001»…«NNNNNN» подряд (N = счётчик диска) (ре-пин 000321.11: хвост реестра вырос append-ом), биекция с диском, 000915…000964 ≡ ростер (append-only: прежние 914 строк не тронуты) (краснота: зеркало 914 / реестр 914) (ре-пин 000321.10: +50 реагентов — каталог 1014, craft 768)', () => {
  const diskCount = fs.readdirSync(ITEMS_DIR).filter(SLUG).length;
  assert.equal(ITD.ITEMS.length, diskCount,
    'зеркало ≡ диск по числу записей; факт: зеркало ' + ITD.ITEMS.length
    + ', диск ' + diskCount);
  const ids = ITD.ITEMS.map((it) => it.id);
  assert.ok(ids.every((v, i) => i === 0 || ids[i - 1] < v),
    'зеркало lex-упорядочено по id');
  for (const [, id] of ROSTER_00032109) {
    const mirror = I.getItem(id);
    assert.ok(mirror, id + ': getItem резолвится');
    assert.deepEqual(mirror, diskObj(id), id + ': зеркало ≡ JSON');
  }
  const ours = ids.filter((v) => ROSTER_SET.has(v));
  assert.equal(ours.length, 50, 'в зеркале — все 50 книг волны');
  // additions-only: книги перестали быть хвостом (zyabkaya… > zvukopis…),
  // гард переведён в successor-tolerant форму (ре-пин 000321.13).
  const NUMBY = new Map(Object.entries(NUM2ID).map(([k, v]) => [v, Number(k)]));
  assert.ok(ours.every((v) => NUMBY.has(v)), 'у наших 50 есть реестровые номера');
  const ourStart = ids.indexOf(ours[0]);
  assert.deepEqual(ids.slice(ourStart, ourStart + 50), ours,
    'блок 50 — непрерывен в зеркале');
  const ourLo = Math.min(...ours.map((v) => NUMBY.get(v)));
  const ourHi = Math.max(...ours.map((v) => NUMBY.get(v)));
  assert.ok(ids.slice(0, ourStart).every((v) => NUMBY.get(v) < ourLo),
    'всё перед блоком заведено РАНЬШЕ волны (реестр-номер меньше)');
  assert.ok(ids.slice(ourStart + 50).every((v) => NUMBY.get(v) > ourHi),
    'successor-tolerant: всё после блока заведено ПОЗЖЕ волны (реестр-номер '
    + 'больше) — новым волнам ре-пин этой строки не нужен; сейчас после блока '
    + (ids.length - ourStart - 50) + ' id: реагенты 000321.10, свитки 000321.11, воскрешение 000321.12, чертежи 000321.13; было: жёсткий slice(-200, -150)');
  const nums = Object.keys(NUM2ID);
  assert.equal(nums.length, diskCount,
    'реестр ≡ каталогу (ls-предикат); факт: реестр ' + nums.length + ', диск ' + diskCount);
  assert.deepEqual(nums, nums.map((_, i) => String(i + 1).padStart(6, '0')),
    'реестр — «000001»…«NNNNNN» подряд (N = счётчик), без дыр');
  const byId = new Set(Object.values(NUM2ID));
  assert.equal(byId.size, nums.length, 'реестр — биекция с диском');
  for (const f of fs.readdirSync(ITEMS_DIR).filter(SLUG)) {
    assert.ok(byId.has(f.replace(/\.json$/, '')),
      f + ': позиция в реестре есть');
  }
  ROSTER_00032109.forEach(([num, id], i) => {
    const key = String(915 + i).padStart(6, '0');
    assert.equal(NUM2ID[key], id,
      key + ': реестр ≡ ростер (факт: ' + NUM2ID[key] + ')');
  });
});

// --- T8: живые канарейки счётчиков (дельты OUR-волны) -----------------------

test('000321.09 T8: регресс-канарейки ЖИВЫМИ выражениями — диск ≡ зеркало ≡ реестр; дельты счётчиков относительно каталога БЕЗ наших 50: каталог +50, «прочих» без slot +50, без base_price +50 (решение станции — base_price НЕ заводим), rarity +0 (книги вне rarity-суммы 579), иконок +50; base_price-игла манифеста 000375 в этом файле self-match = 0 (мы не десятый держатель) (краснота: дельты нулевые — волна не добавлена)', () => {
  const all = allDiskObjects();
  const rest = all.filter((it) => !ROSTER_SET.has(it.id));
  const svg = svgFiles();
  const svgRest = svg.filter((f) => !ROSTER_SET.has(f.replace(/\.svg$/, '')));
  const nums = Object.keys(NUM2ID);
  assert.equal(all.length, ITD.ITEMS.length, 'диск ≡ зеркало');
  assert.equal(nums.length, all.length, 'диск ≡ реестр');
  const deltas = {
    'каталог (914 → 1014)': all.length - rest.length,
    'без slot (325 → 375)':
      all.filter((it) => !('slot' in it)).length
      - rest.filter((it) => !('slot' in it)).length,
    'без base_price (612 → 662)':
      all.filter((it) => !('base_price' in it)).length
      - rest.filter((it) => !('base_price' in it)).length,
    'иконок (881 → 931)': svg.length - svgRest.length,
  };
  for (const [what, d] of Object.entries(deltas)) {
    assert.equal(d, 50, 'дельта «' + what + '» == +50; факт: +' + d);
  }
  assert.equal(
    all.filter((it) => 'rarity' in it).length
    - rest.filter((it) => 'rarity' in it).length, 0,
    'rarity — НЕ вырос (книги без rarity); сумма базы — 579');
  const selfText = fs.readFileSync(path.join(__dirname,
    'items-skillbook-000321.09.test.js'), 'utf8');
  const selfNeedle = new RegExp(NEEDLE_A
    + '\\s*\\u2014?\\s*' + 'ровно' + '\\s+у\\s+(\\d+)', 'gi');
  assert.equal((selfText.match(selfNeedle) || []).length, 0,
    'форма иглы base_price-манифеста 000375 зарезервирована — self-match');
});

// --- T9: spec/items.md + канон памяти ---------------------------------------

test('000321.09 T9: spec/items.md — «Каталог пополнен 50 книгами навыков 000321.09» и живой счётчик «Каталог assets/items — NNN файлов (на момент …)» (ре-пин 000386: литералы счётчика «1014 … на момент 000321.09», c1 и «skill_book 61» выведены на живую сверку с каталогом/kind-счётом — будущая волна не правит эту строку); правки line-neutral: 477 строк БЕЗ trailing-\\n и 13 H2 (SPEC_FILE_LINES["items.md"] не двигается); канон memory/000230.16 — c1 «Каталог assets/items — NNN файлов (000001–NNNNNN;», c2 «skill_book <живой счёт>» и E-блок ≡ H2 spec нормализованно (краснота: счётчик отстал от диска) (ре-пин 000321.10: +50 реагентов — каталог 1014, craft 768)', () => {
  const spec = fs.readFileSync(path.join(ROOT, 'spec', 'items.md'), 'utf8');
  assert.ok(spec.includes(
    'Каталог пополнен 50 книгами навыков 000321.09'),
    'spec/items.md: предложения о волне 000321.09 нет');
  const cm = spec.match(
    /Каталог assets\/items — (\d+) файлов \(на момент ([0-9.]+)\):/);
  assert.ok(cm,
    'spec/items.md: строки счётчика «Каталог assets/items — NNN файлов '
    + '(на момент T):» нет (000386: сверка на живом механизме)');
  const diskCount = fs.readdirSync(ITEMS_DIR).filter(SLUG).length;
  assert.equal(+cm[1], diskCount,
    'spec-счётчик каталога ' + cm[1] + ' ≠ живого числа файлов '
    + 'assets/items ' + diskCount + ' — ре-пин строки «на момент» в '
    + 'коммите волны (рецепт memory/000386-c9-bytes-log.md §3)');
  assert.ok(cm[2] >= '000321.09',
    'счётчик «на момент ' + cm[2] + '» отстал — не раньше 000321.09 '
    + '(создала 964); краснота: волна не ре-пиннула строку');
  assert.ok(!/(?<!\d)914 файлов/.test(spec),
    'spec/items.md: старое число 914 не осталось');
  const lines = spec.split('\n');
  assert.ok(!spec.endsWith('\n'),
    'spec/items.md — без trailing-\\n (line-neutral правки)');
  assert.equal(lines.length, 477,
    'spec/items.md — 477 строк (line-neutral); факт: ' + lines.length);
  assert.equal(lines.filter((l) => l.startsWith('## ')).length, 13,
    'spec/items.md — 13 H2 (новых H2 не заводили)');
  const canon = fs.readFileSync(
    path.join(ROOT, 'memory', '000230.16-spec-equipment-doc.md'), 'utf8');
  const c1 = canon.match(
    /Каталог assets\/items — (\d+) файлов \(000001–(0\d+);/);
  assert.ok(c1, 'канон c1: строки счётчика каталога нет');
  assert.equal(+c1[1], diskCount,
    'канон c1: число ' + c1[1] + ' ≠ живого числа файлов ' + diskCount
    + ' — ре-пин c1 в коммите волны');
  assert.equal(c1[2], String(diskCount).padStart(6, '0'),
    'канон c1: хвост «000001–' + c1[2] + '» ≠ последнему номеру '
    + String(diskCount).padStart(6, '0') + ' каталога');
  const sbCount = allDiskObjects().filter((it) => it.kind === 'skill_book').length;
  assert.ok(new RegExp('skill_book ' + sbCount + '[,\\s]').test(canon),
    'канон c2: «skill_book ' + sbCount + '» (живой счёт kind) нет');
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const h2 = (title) => {
    const i = lines.findIndex((l) => l.trim() === '## ' + title);
    assert.ok(i >= 0, 'spec/items.md: H2 «' + title + '» не найден');
    const out = [];
    for (let k = i + 1; k < lines.length && !lines[k].startsWith('## '); k++) {
      out.push(lines[k]);
    }
    return norm(out.join('\n'));
  };
  const specE = h2('Каталог новых предметов экипировки');
  assert.ok(specE.includes(norm('Каталог пополнен 50 книгами навыков '
    + '000321.09')), 'E-блок spec: предложения волны нет (норм.)');
  assert.ok(norm(canon).includes('Каталог пополнен 50 книгами навыков '
    + '000321.09'), 'канон (E-блок/§4.2): предложения волны нет');
  const cmE = specE.match(
    /Каталог assets\/items — (\d+) файлов \(на момент [0-9.]+\):/);
  assert.ok(cmE, 'E-блок spec: строки счётчика каталога нет');
  assert.equal(cmE[1], cm[1],
    'E-блок spec: счётчик ' + cmE[1] + ' ≠ spec-счётчику ' + cm[1]
    + ' (doc-trio ре-синхронится в том же коммите)');
});

// --- T10: торговля автоматикой, лут-стражи, additions-only гейт -------------

test('000321.09 T10: 0-diff стражи и магазинная автоматика (src/ НЕ трогали): shopKindsFor(магазин магии) содержит «skill_book» ⇒ наши книги входят в магические лавки АВТОМАТИЧЕСКИ (сток (30,40,type 3,w 0) содержит ≥ 20 книг ростера); makeCampShop (пул food/potion/weapon/armor) НЕ содержит ни одной книги; LOOT_RARE_POOL combat.js — ни одного id волны; src/loot-equip-data.js ≡ побайтовому РЕГЕНУ невозможен (hand-файл вне REGEN-карты), HEAD-сверка снята миграцией 000395 — содержимое кроют items.test.js LF6 + адресный анти-хайджек в конце этого файла; живые стражи в силе: EQUIP_POOLS 232/161/117/46/23, DISASSEMBLY_BY_ITEM 705 (чужие росты 648→673 (.10) → 705 (.13); книг — 0) и ни одного id волны; у всех 50 новых НЕТ поля loot (краснота: книг нет в стоках)', () => {
  const M = require('../src/map.js');
  const B = M.BUILDING_TYPES;
  const kinds = I.shopKindsFor(B.MAGIC_SHOP);
  assert.ok(Array.isArray(kinds) && kinds.includes('skill_book'),
    'shopKindsFor(магазин магии) содержит skill_book; факт: '
    + JSON.stringify(kinds));
  const s1 = I.makeShop(30, 40, B.MAGIC_SHOP, 0);
  const s2 = I.makeShop(30, 40, B.MAGIC_SHOP, 0);
  assert.deepEqual(s1, s2, 'makeShop — детерминизм');
  const fresh = Object.keys(s1.stock).filter((k) => ROSTER_SET.has(k));
  assert.ok(fresh.length >= 20,
    'магическая лавка содержит ≥ 20 книг ростера; факт: ' + fresh.length
    + ' (краснота: книг нет)');
  for (const k of fresh) assert.equal(I.getItem(k).kind, 'skill_book',
    k + ': в стоке — книга ростера');
  const C = require(path.join(ROOT, 'src', 'craft.js'));
  const campPool = ITD.ITEMS.filter((it) => ['food', 'potion', 'weapon',
    'armor'].includes(it.kind)).map((it) => it.id);
  for (const id of ROSTER_IDS) {
    assert.ok(!campPool.includes(id),
      id + ': книги нет в пуле барахолки (виды 000047)');
    assert.ok(!(id in C.DISASSEMBLY_BY_ITEM),
      id + ': книги нет в DISASSEMBLY_BY_ITEM');
    assert.equal(I.getItem(id).loot, undefined, id + ': loot нет');
  }
  const combatText = fs.readFileSync(path.join(ROOT, 'src', 'combat.js'),
    'utf8');
  for (const id of ROSTER_IDS) {
    assert.ok(!combatText.includes("'" + id + "'"),
      id + ': книги нет в литералах combat.js (LOOT_RARE_POOL заморожен)');
  }
  const P = L.EQUIP_POOLS;
  assert.deepEqual(L.RARITY.map((t) => P[t.id].length), [232, 161, 117,
    46, 23], 'EQUIP_POOLS — 232/161/117/46/23 (не выросли); факт: '
    + L.RARITY.map((t) => P[t.id].length).join('/'));
  assert.equal(L.RARITY.reduce((s, t) => s + t.chance, 0), 1,
    'DROP-таблица — Σ 1 (НЕ тронута)');
  assert.equal(Object.keys(C.DISASSEMBLY_BY_ITEM).length, 705,
    'DISASSEMBLY_BY_ITEM — 705 (книги рецептов не добавили; цепочка 598 (база) '
    + '→ 648 (000321.07: +50 зелий) → 673 (000321.10: +25 реагентов) → 705 '
    + '(000321.13: +32 ключа чертежей (непокрытые образцы), 18 tied-целей ключей не '
    + 'добавили)); факт: '
    + Object.keys(C.DISASSEMBLY_BY_ITEM).length);
});

// Чистый предикат адресного анти-хайджека (000395): пересечение пулов
// EQUIP_POOLS с ростером волны. Тот же в трёх файлах волны — каждый носит
// СВОЮ таблицу истинности на своих id, общий хелпер не заводим.
function equipHijacks_000395(pools, ids) {
  const roster = new Set(ids);
  const bad = [];
  for (const [tier, pool] of Object.entries(pools)) {
    for (const id of pool) {
      if (roster.has(id)) bad.push(tier + ': ' + id);
    }
  }
  return bad;
}

test('000395 T5 (книги-носитель 000321.09): адресный анти-хайджек после снятия HEAD-сверки (миграция) — ни один id волны ростера не попал в живые пулы EQUIP_POOLS на диске + ПОСТОЯННАЯ таблица истинности предиката equipHijacks_000395: инъекция id красит, легальные equip-данные, пустой пул и пустой ростер зелены (зуб-пустышка исключён)', () => {
  assert.deepEqual(equipHijacks_000395(L.EQUIP_POOLS, ROSTER_IDS), [],
    'id книги замечен в equip-пуле (хайджек лута) — книги не выдаются'
    + ' выпадением по редкости (DROP-контракт 000230 не трогался)');
  const table = [
    ['красно: id волны инжектирован в пул',
      { common: ['iron_sword', 'zvezdopis_accuracy'] }, ['zvezdopis_accuracy'], true],
    ['зелено: только equip-данные',
      { common: ['iron_sword'], rare: ['steel_blade'] }, ['zvezdopis_accuracy'],
      false],
    ['зелено: пустой пул', { common: [] }, ['zvezdopis_accuracy'], false],
    ['зелено: пустой ростер (волны нет)',
      { common: ['iron_sword'] }, [], false],
    ['красно: id в каждом пуле',
      { common: ['zvezdopis_accuracy'], legendary: ['zvezdopis_accuracy'] }, ['zvezdopis_accuracy'],
      true],
  ];
  const misses = [];
  for (const [name, pools, ids, mustCatch] of table) {
    const caught = equipHijacks_000395(pools, ids).length > 0;
    if (caught !== mustCatch) {
      misses.push(name + ' → ' + (mustCatch ? 'НЕ поймано' : 'ложно'));
    }
  }
  assert.ok(table.some((r) => r[3]) && table.some((r) => !r[3]),
    'анти-вакуум таблицы: нужны и красные, и зелёные строки');
  assert.deepEqual(misses, [],
    'таблица истинности анти-хайджека покраснела: ' + misses.join('; ')
    + ' — предикат обязан ловить инжект id волны и не трогать легальные'
    + ' equip-данные (перенос 000395 вместо побайтовой HEAD-сверки)');
});


// Задача 000321.12: +50 предметов вида resurrection_scroll («издания» зова воскрешения).
// Вариант (a) по анализу: effect {kind:'resurrect'} БЕЗ полей (валидатор src/items.js уже
// поддерживает; src/ НЕ меняется); без rarity, без base_price, без tier; рецептов нет;
// торговля/lut не пополняются — в витринах наших записей не появляется.
// Id-диапазон 001065–001114 зафиксирован при запуске волны; имена файлов zyv_<слово>_scroll
// (лекс-хвост строго после zyv_zhizni_scroll — rng-пулы additions-only).
// Решения: memory/000321-resurrectscroll-items.md.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const I = require('../src/items.js');
const M = require('../src/map.js');
const ITD = require('../src/items-data.js');
const { validateData } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const ITEMS_DIR = path.join(ROOT, 'assets', 'items');
const SPR_DIR = path.join(ROOT, 'assets', 'sprites', 'items');
const CRAFT_DIR = path.join(ROOT, 'assets', 'craft');
const NPC_DIR = path.join(ROOT, 'assets', 'npc');
const MOBS_DIR = path.join(ROOT, 'assets', 'mobs');

const ROSTER = [
  ['zimnej_nochi', 'зимней ночи', 'первый зов после полуночи — мороз не даёт душе растаять.', 150, 0.5],
  ['zimnej_zari', 'зимней зари', 'написан на льдине в предрассветной мгле — мёртвые видят его как свет из-под снега.', 160, 0.5],
  ['zimnego_groma', 'зимнего грома', 'гром среди февраля — так зовут обратно.', 175, 0.4],
  ['zimnego_ozera', 'зимнего озера', 'утопленникам подо льдом отвечают из полыньи.', 150, 0.5],
  ['zimnego_rassveta', 'зимнего рассвета', 'на севере рассвет длится три суток — времени хватит и на возвращение.', 160, 0.5],
  ['zimnego_snega', 'зимнего снега', 'в каждом хлопке — чьё-то имя; позванный не заблудится.', 140, 0.6],
  ['zimnego_solntsa', 'зимнего солнца', 'бледное солнце, которое греет только мёртвых — и поднимает их.', 150, 0.5],
  ['zimnego_utra', 'зимнего утра', 'первое утро после долгой ночи — пора возвращаться.', 140, 0.5],
  ['zimnih_bur', 'зимних бурь', 'буря разбрасывает души, а этот свиток собирает их обратно.', 130, 0.6],
  ['zimnih_molnij', 'зимних молний', 'синяя зимняя молния открывает вратарь на единый миг.', 175, 0.4],
  ['zimnih_predkov', 'зимних предков', 'в ночь предков род перечисляют вслух — начиная со старших.', 200, 0.5],
  ['zimnih_trop', 'зимних троп', 'снег скрыл дорогу к дому; этот зов её указывает.', 140, 0.5],
  ['zimorodka', 'зимородка', 'птица, оборачивающая зиму: где она пролетит, там и жизнь возвращается.', 220, 0.4],
  ['zimy', 'зимы', 'зовут саму зиму — а с ней возвращают и своих.', 150, 0.5],
  ['zlata', 'злата', 'выписан золотом немой грамотой — золото не предаёт.', 220, 0.4],
  ['zlatogora', 'златогора', 'зовут обратно с золотой горы, где спят мёртвые.', 200, 0.5],
  ['zlatogrivogo', 'златогривого', 'золотогривый конь переносит душу через реку.', 190, 0.5],
  ['zlatokudrogo', 'златокудрого', 'тот, кто обещал вернуться первым, — вернулся.', 190, 0.5],
  ['zlatyh_hor', 'златых гор', 'эхо в горах повторяет зов, пока его не услышат.', 200, 0.4],
  ['zloby', 'злобы', 'написан в гневе — поэтому мертвецы восстают живыми.', 130, 0.6],
  ['zlyh_duhov', 'злых духов', 'тёмному духу дают долг, и он приводит мертвеца.', 130, 0.6],
  ['zmei', 'змеи', 'змея сбрасывает шкуру — так и мертвец возвращается обновлённым.', 160, 0.5],
  ['zmeev', 'змеев', 'зовут по-змеиному, не доверяя человеческому слову.', 150, 0.5],
  ['znaharya', 'знахаря', 'старый знахарь знал слово — и записал его для нас.', 175, 0.5],
  ['znaniya', 'знания', 'зов знания: достаточно знать, как, — и это происходит.', 160, 0.4],
  ['znatnogo_roda', 'знатного рода', 'в роду с родословной не бросают своих.', 190, 0.5],
  ['znatnyh_predkov', 'знатных предков', 'родовая линия откликается на своё имя.', 200, 0.5],
  ['znatokov', 'знатоков', 'мастера старого ремесла не принимают отказа.', 175, 0.5],
  ['znoya', 'зноя', 'даже в полуденный зной мертвецы просят воды — верните их.', 140, 0.6],
  ['zoly', 'золы', 'из пепла и углей — плоть поднимается вновь.', 130, 0.5],
  ['zolota', 'золота', 'зов звучит как слиток — тяжело и чисто.', 220, 0.4],
  ['zolotogo_klucha', 'золотого ключа', 'родник, бьющий из мёртвой воды живым.', 175, 0.5],
  ['zolotogo_kraya', 'золотого края', 'с золотого края, где садится солнце, рассвет отправляют обратно.', 190, 0.5],
  ['zolotogo_veka', 'золотого века', 'в золотом веке смерти не было — этот свиток помнит как.', 220, 0.4],
  ['zolotoj_osenej', 'золотой осени', 'что осенило, то весна и вернёт.', 150, 0.6],
  ['zolotoj_pticy', 'золотой птицы', 'где перо жар-птицы падает, там мертвецы просыпаются.', 220, 0.5],
  ['zolotoj_zhily', 'золотой жилы', 'копнули до жилы — жила позвала обратно.', 160, 0.6],
  ['zorki', 'зорьки', 'утренний подснежник пробивает лёд снизу.', 140, 0.5],
  ['zornicy', 'зорницы', 'зорьки-сестры раздвигают небеса — для тех, кто спит.', 150, 0.5],
  ['zverej', 'зверей', 'когда воют все звери сразу, лес отдаёт мертвецов.', 160, 0.6],
  ['zverya', 'зверя', 'звериная тропа всегда ведёт к дому.', 150, 0.5],
  ['zvezd', 'звёзд', 'каждая звезда — это лампада за кого-то, кто вот-вот вернётся.', 190, 0.4],
  ['zvezdy', 'звезды', 'по единственной звезде находят дорогу не только путники.', 175, 0.4],
  ['zvezdopada', 'звездопада', 'просьба, произнесённая на падающей звезде, сбывается даже для мертвых.', 200, 0.4],
  ['zvona', 'звона', 'в колокол бьют над водой, чтобы утопленник нашёл берег.', 160, 0.5],
  ['zvonnicy', 'звонницы', 'звонят не на башне, а под землёй, — и слышно.', 150, 0.5],
  ['zvuka', 'звука', 'первый звук до слова. повтори его — и тебя дождутся.', 140, 0.4],
  ['zyka', 'зыка', 'старинное слово для старинного зова — крепче молитвы.', 175, 0.5],
  ['zyklichem', 'зычным кличем', 'крикнут с башни — отзовутся из-под кургана.', 160, 0.5],
  ['zykuchego_golosa', 'зычного голоса', 'громким голосом звать — и мертвец встанет.', 150, 0.6],
];

const N = ROSTER.length;
const IDS = ROSTER.map((r) => 'zyv_' + r[0] + '_scroll');
const SORTED_IDS = [...IDS].sort();
const DESC_PREFIX = 'В бою (быстрый слот): возвращает первого погибшего союзника '
  + 'на поле боя (50% HP). ';
const ITEM_KEYS = ['id', 'name', 'kind', 'weight', 'value', 'desc', 'effect', 'icon'];
const FORBIDDEN_KEYS = ['rarity', 'slot', 'set', 'affixes', 'base_price', 'tier'];
const TAIL_REF = 'zyv_zhizni_scroll';

const itemSlugFiles = () => fs.readdirSync(ITEMS_DIR)
  .filter((f) => f.endsWith('.json') && f !== 'schema.json');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const itemOf = (id) => readJson(path.join(ITEMS_DIR, id + '.json'));
const REG = readJson(path.join(ROOT, 'tests', 'scripts',
  'items-num2id-000318.08.json'));
const REG_KEYS = Object.keys(REG).sort();
const sha = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');

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

test('000321.12 T1: формы — 50 свитков resurrection_scroll: roundtrip, схема, порядок ключей, БЕЗ rarity/base_price/tier', () => {
  const itemSchema = readJson(path.join(ITEMS_DIR, 'schema.json'));
  assert.equal(new Set(IDS).size, N, 'ростер без дублей id');
  assert.equal(N, 50, 'волна — ровно 50 записей');
  for (const [word, rus, flavor, value, weight] of ROSTER) {
    const id = 'zyv_' + word + '_scroll';
    const ip = path.join(ITEMS_DIR, id + '.json');
    assert.ok(fs.existsSync(ip), ip + ': существует (RED: нет)');
    const raw = fs.readFileSync(ip, 'utf8');
    const it = JSON.parse(raw);
    assert.equal(raw, JSON.stringify(it, null, 2) + '\n', ip + ': roundtrip');
    assert.deepEqual(Object.keys(it), ITEM_KEYS, ip + ': порядок ключей канон');
    assert.deepEqual(validateData(itemSchema, it, ip), [], ip + ': схема items');
    assert.equal(it.id, id, ip + ': id == имя файла');
    assert.equal(it.kind, 'resurrection_scroll', ip + ': kind resurrection_scroll');
    assert.equal(it.name, 'Зов ' + rus, ip + ': name-шаблон «Зов …»');
    assert.equal(it.desc, DESC_PREFIX + flavor, ip + ': desc = шаблон + уникальная приписка');
    assert.equal(it.weight, weight, ip + ': weight из ростера');
    assert.equal(it.value, value, ip + ': value из ростера');
    assert.deepEqual(it.effect, { kind: 'resurrect' },
      ip + ': effect {kind: resurrect} БЕЗ полей (вариант (a))');
    assert.equal(it.icon, 'assets/sprites/items/' + id + '.svg', ip + ': icon = конвенция');
    for (const k of FORBIDDEN_KEYS) {
      assert.equal(it[k], undefined, ip + ': ключа ' + k + ' нет');
    }
  }
});

test('000321.12 T2: ростер ≡ диску; уникальность id/имён/описаний по каталогу; лекс-хвост строго после zyv_zhizni_scroll (ре-пин 000321.13: хвост после нас занят чертежами zyv_zyv_* — сверка интервала (эталон, минимум блока))', () => {
  const itemIds = itemSlugFiles().map((f) => f.slice(0, -5));
  assert.equal(IDS.filter((s) => itemIds.includes(s)).length, N,
    'все ' + N + ' свитков на диске');
  assert.equal(new Set(itemIds).size, itemIds.length, 'id каталога уникальны');
  const names = []; const descs = [];
  for (const f of itemSlugFiles()) {
    const j = readJson(path.join(ITEMS_DIR, f));
    names.push(j.name); descs.push(j.desc);
  }
  assert.equal(new Set(names).size, names.length, 'имена каталога уникальны');
  assert.equal(new Set(descs).size, descs.length, 'desc каталога уникальны');
  const others = itemIds.filter((s) => !IDS.includes(s)).sort();
  const ourMin = [...IDS].sort()[0];
  const beforeUs = others.filter((s) => s < ourMin);
  assert.equal(beforeUs[beforeUs.length - 1], TAIL_REF,
    'предыдущий лекс-хвост каталога — ' + TAIL_REF + ' (наши строго после него;'
    + ' ре-пин 000321.13: после нашего блока — чертежи zyv_zyv_*)');
  for (const id of IDS) {
    assert.ok(id > TAIL_REF, id + ': больше хвостового эталона по ASCII');
  }
  assert.deepEqual([...IDS].sort(), SORTED_IDS, 'нумерация идёт в лекс-порядке роста');
});

test('000321.12 T3: контракт вида — effect {kind: resurrect} без spell/recipe у ВСЕХ resurrection_scroll каталога; база 000051 не тронута', () => {
  const base = itemOf('resurrect_scroll');
  assert.deepEqual(base.effect, { kind: 'resurrect' },
    'база resurrect_scroll (000051): effect без полей');
  assert.equal(base.value, 150, 'база: value не двинут');
  const kindItems = itemSlugFiles()
    .map((f) => readJson(path.join(ITEMS_DIR, f)))
    .filter((j) => j.kind === 'resurrection_scroll');
  const mine = kindItems.filter((j) => IDS.includes(j.id));
  assert.equal(mine.length, N, 'наши ' + N + ' — в виде resurrection_scroll');
  for (const j of kindItems) {
    assert.deepEqual(Object.keys(j.effect), ['kind'],
      j.id + ': effect ровно {kind}');
    assert.equal(j.effect.kind, 'resurrect', j.id + ': effect.kind resurrect');
    assert.equal(j.effect.spell, undefined,
      j.id + ': ссылки на заклинание нет (BY DESIGN, D6 000165)');
    assert.equal(j.effect.recipe, undefined, j.id + ': ссылки на рецепт нет');
    assert.equal(j.rarity, undefined, j.id + ': rarity нет (sweep-пин факта)');
  }
});

test('000321.12 T4: живые ls-предикаты — каталог ≡ реестру ≡ зеркалу; реестр 000001..N подряд; зеркало отсортировано', () => {
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

test('000321.12 T5: иконки 50 — формат, тень, координаты в канве, пин против NaN/Infinity, sha256-уникальность по каталогу иконок', () => {
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

test('000321.12 T6: craft-guard — рецептов с результатом resurrection_scroll НЕТ (ни новых, ни старых)', () => {
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
    assert.ok(!IDS.includes(slug), f + ': результат — НЕ свиток волны');
    assert.notEqual(kindById.get(slug), 'resurrection_scroll',
      f + ': ни один рецепт НЕ крафтит resurrection_scroll (факт диска)');
    const dump = JSON.stringify(rec);
    for (const s of IDS) {
      assert.ok(!dump.includes(s), f + ': упоминания «' + s + '» в рецепте нет');
    }
  }
});

test('000321.12 T7: реестр — хвостовой append в лекс-порядке; префикс additions-only; зеркало несёт хвост (ре-пин 000321.13: хвост занят чертежами 001115–001164 — блок закреплён по первому вхождению)', () => {
  const total = REG_KEYS.length;
  const blockSet = new Set(IDS);
  const firstIdx = REG_KEYS.findIndex((k) => blockSet.has(REG[k]));
  const tail = REG_KEYS.slice(firstIdx, firstIdx + N);
  assert.equal(tail.length, N, 'блок длиной ровно ' + N);
  assert.deepEqual(tail.map((k) => REG[k]), SORTED_IDS,
    'блок реестра == новые свитки по лекси (ре-пин 000321.13: хвост после них — чертежи)');
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
  assert.ok(mIdx >= 0, 'новые свитки в зеркале');
  assert.deepEqual(mirror.slice(mIdx, mIdx + N), SORTED_IDS,
    'зеркало несёт новые свитки подряд по лекси (ре-пин 000321.13: хвост после них — чертежи)');
});

test('000321.12 T8: живые дельты +N и self-gate: запрет движущихся счётчиков-литералов в этом файле (ре-пин 000321.13: дельта считается над префиксом до блока, блок — resurrect_scroll по первому вхождению)', () => {
  for (const id of IDS) {
    assert.ok(fs.existsSync(path.join(ITEMS_DIR, id + '.json')),
      id + '.json на диске (RED: нет)');
  }
  const items = itemSlugFiles().map((f) => f.slice(0, -5));
  const icons = fs.readdirSync(SPR_DIR).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4));
  assert.equal(IDS.filter((s) => items.includes(s)).length, N, 'свитков ровно ' + N);
  assert.equal(IDS.filter((s) => icons.includes(s)).length, N, 'иконок ровно ' + N);
  const kindOf = (slug) => {
    const p = path.join(ITEMS_DIR, slug + '.json');
    return fs.existsSync(p) ? readJson(p).kind : undefined;
  };
  const kindCount = items.filter((s) => kindOf(s) === 'resurrection_scroll').length;
  const blockSet8 = new Set(IDS);
  const firstIdx8 = REG_KEYS.findIndex((k) => blockSet8.has(REG[k]));
  const outsideBlock = REG_KEYS.filter((k, i) => i < firstIdx8 || i >= firstIdx8 + N);
  const prefixKinds = REG_KEYS.slice(0, firstIdx8)
    .filter((k) => kindOf(REG[k]) === 'resurrection_scroll').length;
  const blockKinds = REG_KEYS.slice(firstIdx8, firstIdx8 + N)
    .filter((k) => kindOf(REG[k]) === 'resurrection_scroll').length;
  assert.equal(blockKinds, N, 'блок реестра — все 50 resurrection_scroll');
  assert.equal(kindCount, prefixKinds + N,
    'resurrection_scroll: дельта ровно +' + N + ' над префиксом реестра');
  const iconDelta = IDS.filter((s) => icons.includes(s)).length;
  assert.equal(iconDelta, N, 'иконки: дельта ровно +' + N);
  const withBase = items.filter((s) => 'base_price' in itemOf(s)).length;
  const prefixBase = outsideBlock
    .filter((k) => {
      const p = path.join(ITEMS_DIR, REG[k] + '.json');
      return fs.existsSync(p) && 'base_price' in readJson(p);
    }).length;
  assert.equal(withBase, prefixBase, 'base_price: дельта 0 (наши без base_price)');
  const withSlot = items.filter((s) => 'slot' in itemOf(s)).length;
  const prefixSlot = outsideBlock
    .filter((k) => {
      const p = path.join(ITEMS_DIR, REG[k] + '.json');
      return fs.existsSync(p) && 'slot' in readJson(p);
    }).length;
  assert.equal(withSlot, prefixSlot, 'slot: дельта 0');
  const withRarity = items.filter((s) => 'rarity' in itemOf(s)).length;
  const prefixRarity = outsideBlock
    .filter((k) => {
      const p = path.join(ITEMS_DIR, REG[k] + '.json');
      return fs.existsSync(p) && 'rarity' in readJson(p);
    }).length;
  assert.equal(withRarity, prefixRarity, 'rarity: дельта 0 (без rarity)');
  const masked = fs.readFileSync(__filename, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
  const liveCounters = new Set([items.length, icons.length, REG_KEYS.length,
    kindCount, withBase, withSlot, withRarity]);
  assert.ok(liveCounters.size >= 4, 'набор живых счётчиков непустой (анти-вакуум)');
  for (const v of liveCounters) {
    assert.ok(!new RegExp('\\b' + v + '\\b').test(masked),
      'self-gate 000386 T7: живой счётчик ' + v + ' запрещён литералом в исполняемых строках');
  }
  assert.equal(((fs.readFileSync(__filename, 'utf8')).match(/\d+ файлов \(на момент/g) || []).length, 0,
    'self-gate: паттерн «<цифры> файлов (на момент» отсутствует (counters live)');
});

test('000321.12 T9: spec/canon/c9 — line-neutral правка, байтовый лог ≡ живым байтам, счётчики канона живые (ре-пин 000321.13: spec-счётчик перехвачен чертежами — сверка живая по regex, как у 000321.11)', () => {
  const spec = fs.readFileSync(path.join(ROOT, 'spec', 'items.md'), 'utf8');
  assert.ok(!spec.endsWith('\n'), 'spec/items.md без trailing-\\n');
  const lines = spec.split('\n');
  assert.equal(lines.filter((l) => /^## /.test(l)).length, 13, 'spec/items.md — 13 H2');
  const liveCount = itemSlugFiles().length;
  assert.ok(lines.some((l) => l.includes('Каталог пополнен ' + N +
    ' свитками воскрешения 000321.12')),
    'spec: предложение волны 000321.12 в цепочке');
  const cm9 = spec.match(
    /Каталог assets\/items — (\d+) файлов \(на момент ([0-9.]+)\):/);
  assert.ok(cm9, 'spec/items.md: строки счётчика нет');
  assert.equal(+cm9[1], liveCount,
    'spec: счётчик == живому каталогу (' + liveCount + ')');
  assert.ok(cm9[2] >= '000321.12',
    'spec: счётчик «на момент ' + cm9[2] + '» не раньше 000321.12');
  const c9p = path.join(ROOT, 'memory', '000230.16-c9', '000321.12.md');
  assert.ok(fs.existsSync(c9p), 'c9-entry ' + c9p + ' существует (RED: нет)');
  const c9 = fs.readFileSync(c9p, 'utf8');
  const m = c9.match(/^000321\.12: (\d+) \(\+(\d+)\)$/m);
  assert.ok(m, 'c9-entry вида «000321.12: <bytes> (+Δ)»');
  const liveBytes = Buffer.byteLength(spec);
  const c9dir = path.join(ROOT, 'memory', '000230.16-c9');
  const takenLater = fs.readdirSync(c9dir).some((f) => {
    if (!f.endsWith('.md') || f === '000321.12.md') return false;
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
    .filter((k) => k === 'resurrection_scroll').length;
  assert.ok(canon.includes('resurrection_scroll ' + kindLive),
    'канон: счётчик resurrection_scroll == живому (' + kindLive + ')');
  assert.ok(canon.includes('Каталог assets/items — ' + liveCount + ' файлов'),
    'канон: счётчик каталога == живому (' + liveCount + ')');
  assert.ok(canon.includes(liveCount + ' файлов (000001–'
    + String(liveCount).padStart(6, '0') + ';'),
    'канон c1: диапазон каталога == живому (' + liveCount + ')');
});

test('000321.12 T10: торговля не пополнена — ни одного нашего id в витринах NPC и луте мобов; universam несёт хвостом; пулы видов не тронуты', () => {
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
  assert.ok(!kinds.includes('resurrection_scroll'),
    'факт диска: magic shop не торгует видом resurrection_scroll');
  const uni = I.makeShop(30, 40, M.BUILDING_TYPES.WEAPONS_SHOP, 3);
  const mineInUni = Object.keys(uni.stock).filter((k) => IDS.includes(k)).length;
  assert.ok(mineInUni > 0,
    'универсам (w=3, пул allItems) несёт новые свитки rng-хвостом');
  const magic = I.makeShop(30, 40, M.BUILDING_TYPES.MAGIC_SHOP, 0);
  assert.equal(Object.keys(magic.stock).filter((k) => IDS.includes(k)).length, 0,
    'magic shop не получил ни одного свитка волны (пул не тронут)');
});

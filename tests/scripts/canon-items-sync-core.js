// Задача 000284.02 (canon sync-check как regression-тест: канон
// memory/000230.16-spec-equipment-doc.md vs spec/items.md + диск;
// tests-only + скрипты в репо).
//
// Чистый core (CJS, 'use strict', без side effects при загрузке;
// ROOT — параметр функций, не константа): нормализация, извлечение
// игол/констант/блоков канона и срезов spec, loadCatalog(ROOT) —
// один проход по каталогам + require src/loot-equip-data.js.
// Контракт (что синхронизирует, таблица анкеров c1–c12, red-протокол
// K1–K5, подводные камни) — memory/000284.02-canon-items-sync-test.md.
//
// САМОАДАПТИВНОСТЬ: все числа тест читает regex'ами-анкерами из
// канона §2 (в tests/canon-items-sync-000284.02.test.js), без
// хардкода; правка цифры/иглы в каноне или в spec красит тест,
// ре-синхрон канона (контракт 000284.01 §3 — в том же коммите)
// возвращает зелёный без правки теста.
//
// Потребители: tests/canon-items-sync-000284.02.test.js (тест),
// tests/scripts/check-canons.js / check-needles.js (CLI rebase-станции).

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Нормализация белых (1:1 хелпер wording-теста): любой прогон → ' '.
function norm(s) {
  return s.replace(/\s+/g, ' ');
}

// ЕДИНЫЙ фикс-regex констант wording-теста (фикс ретро-минора
// 000284.01: старый /^const (W\d+[A-Z]?|A\d+)/ видел 23 из 25 —
// W7B1/W7B2 имеют числовой суффикс после буквы).
const constRegex = /^const (W[A-Z0-9]+|A\d+) = (["'])(.*?)\2;$/gm;

// [{name, value}] из источника wording-теста (текст, не require).
function extractConsts(testSrc) {
  const out = [];
  for (const m of testSrc.matchAll(constRegex)) out.push({ name: m[1], value: m[3] });
  return out;
}

// Backtick-спаны между «### 4.2» и «### 4.3» канона (иглы, 25,
// уникальны). Однострочные спаны: перенос внутри иглы = реформат
// → осмысленная краснота (ре-пин в том же коммите).
function extractCanonNeedles(canonSrc) {
  const a = canonSrc.indexOf('\n### 4.2');
  const b = canonSrc.indexOf('\n### 4.3');
  if (a === -1 || b === -1 || b < a) throw new Error('канон: срез «### 4.2»…«### 4.3» не найден — заголовки изменились, ре-пинь (контракт 000284.02)');
  const sec = canonSrc.slice(a, b);
  const out = [];
  for (const m of sec.matchAll(/`([^`\n]+)`/g)) out.push(m[1]);
  if (out.length === 0) throw new Error('канон §4.2: backtick-игл нет — формат изменился, ре-пинь (контракт 000284.02)');
  return out;
}

// §2 канона: срез «## 2.»…«## 3.», срез bold ** (порядок: срез ДО
// norm — «**staff 7**» → «staff 7»), затем norm.
function canonSection2(canonSrc) {
  const a = canonSrc.indexOf('\n## 2.');
  const b = canonSrc.indexOf('\n## 3.');
  if (a === -1 || b === -1 || b < a) throw new Error('канон: срез «## 2.»…«## 3.» не найден — заголовки изменились, ре-пинь (контракт 000284.02)');
  return norm(canonSrc.slice(a, b).replace(/\*\*/g, ''));
}

// C1/D/E-блоки §3.5 канона: caption-строка (уникальность line-start
// — assert), backtick-блок от первой кавычки после caption до
// ПЕРВОЙ кавычки после end-якоря. Контракт: memory/000284.02-canon-
// items-sync-test.md §1. C2 в ядро не входит (артефакт переноса
// «синий/ фиолетовый» — «подводные камни»).
const BLOCK_END = {
  C1: 'НИКОГДА не в пулах.',
  D: 'нужен 5-й член в 4-м слоте',
  E: 'универсам (богатство 3 — все предметы)',
};

function extractBlock(canonSrc, key) {
  const endAnchor = BLOCK_END[key];
  if (!endAnchor) throw new Error('extractBlock: неизвестный блок «' + key + '» (есть C1/D/E)');
  const capRe = new RegExp('^' + key + '\\. ', 'gm');
  const caps = [...canonSrc.matchAll(capRe)];
  if (caps.length !== 1) throw new Error('caption «' + key + '.» найден ' + caps.length + ' раз(а) (нужен ровно 1) — ре-пинь extractBlock (контракт 000284.02)');
  const capEnd = caps[0].index + caps[0][0].length;
  const open = canonSrc.indexOf('`', capEnd);
  if (open === -1) throw new Error('caption «' + key + '.»: открывающего backtick нет — ре-пинь (контракт 000284.02)');
  const a = canonSrc.indexOf(endAnchor, open + 1);
  if (a === -1) throw new Error('блок «' + key + '»: end-якорь «' + endAnchor + '» не найден — формат канона §3.5 изменился, ре-пинь (контракт 000284.02)');
  const close = canonSrc.indexOf('`', a + endAnchor.length);
  if (close === -1) throw new Error('блок «' + key + '»: закрывающего backtick нет — ре-пинь (контракт 000284.02)');
  return norm(canonSrc.slice(open + 1, close).trim());
}

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Raw-срез H2 spec: от строки «## <title>» до следующего «\n## »
// (или EOF) — ВКЛЮЧАЯ строку заголовка.
function specH2Raw(specSrc, title) {
  const m = specSrc.match(new RegExp('^## ' + esc(title) + '\\s*$', 'm'));
  if (!m) throw new Error('spec: H2 «' + title + '» не найден');
  const i = m.index;
  const j = specSrc.indexOf('\n## ', i + 1);
  return specSrc.slice(i, j === -1 ? specSrc.length : j);
}

// norm'd H2 spec целиком (trim — хвостовой пустой ряд перед
// следующим «## » не входит в нормализованный срез).
function specH2(specSrc, title) {
  return norm(specH2Raw(specSrc, title).trim());
}

// norm'd буллет H2 spec от start-маркера (включая ведущую «* »
// буллета — walk-back по пробелам к звезде) до end-маркера
// (включительно).
function specBulletInH2(specSrc, h2name, start, end) {
  const sec = specH2Raw(specSrc, h2name);
  const i = sec.indexOf(start);
  if (i === -1) throw new Error('spec H2 «' + h2name + '»: start-маркер «' + start + '» не найден');
  const j = sec.indexOf(end, i);
  if (j === -1) throw new Error('spec H2 «' + h2name + '»: end-маркер «' + end + '» не найден');
  let s0 = i;
  while (s0 > 0 && sec[s0 - 1] === ' ') s0--;
  if (s0 > 0 && sec[s0 - 1] === '*') s0--;
  return norm(sec.slice(s0, j + end.length));
}

const TIERS = ['common', 'rare', 'epic', 'legendary', 'impossible'];
const SLOTS = ['head', 'ears', 'neck', 'torso', 'forearms', 'palms',
               'right_hand', 'left_hand', 'ring', 'legs', 'feet'];
const BASE_SKILLS = ['strength', 'dexterity', 'constitution',
                     'intelligence', 'wisdom', 'charisma'];
const NUM6 = /^\d{6}\.json$/;

// Один проход: каталог items (JSON + schema + counts + vectors +
// legacy + right/left_hand + ring + sets + affixes + иконки),
// craft (JSON + coverage/histogram/types по rarity-подмножеству),
// skills (имена), loot-equip-data (RARITY/EQUIP_POOLS), specMeta
// (R5-строки/H2/H3/bytes/trailingNL). Иконки — per-item existsSync
// (НЕ dir-count: каталог 285 = 279 + 6 blueprint_*).
function loadCatalog(ROOT) {
  const itemsDir = path.join(ROOT, 'assets', 'items');
  const all = fs.readdirSync(itemsDir).filter((f) => NUM6.test(f)).sort().map((f) => {
    const obj = JSON.parse(fs.readFileSync(path.join(itemsDir, f), 'utf8'));
    return {
      num: +f.slice(0, 6), id: obj.id, kind: obj.kind, subtype: obj.subtype,
      slot: obj.slot, rarity: obj.rarity, icon: obj.icon, set: obj.set,
      set_bonus: obj.set_bonus, affixes: obj.affixes || [],
      stats: obj.stats || {}, obj,
    };
  });

  const kinds = {};
  const weaponSub = {};
  for (const x of all) {
    kinds[x.kind] = (kinds[x.kind] || 0) + 1;
    if (x.kind === 'weapon') weaponSub[x.subtype] = (weaponSub[x.subtype] || 0) + 1;
  }

  const rarity = all.filter((x) => x.rarity);
  const byTier = {};
  for (const x of rarity) byTier[x.rarity] = (byTier[x.rarity] || 0) + 1;

  const vectors = {};
  for (const s of SLOTS) vectors[s] = TIERS.map((t) => rarity.filter((x) => x.slot === s && x.rarity === t).length);

  const legacy = all.filter((x) => x.num <= 10);
  const legacyInfo = {
    total: legacy.length,
    weapons: legacy.filter((x) => x.kind === 'weapon').length,
    armors: legacy.filter((x) => x.kind === 'armor').length,
    noRarity: legacy.filter((x) => !x.rarity).length,
    noIcon: legacy.filter((x) => !x.icon).length,
    explicitSlot: legacy.filter((x) => x.slot !== undefined).length,
  };

  const rh = rarity.filter((x) => x.slot === 'right_hand');
  const rightHand = {
    total: rh.length,
    heavy: rh.filter((x) => x.kind === 'weapon' && x.subtype === 'heavy').length,
    staff: rh.filter((x) => x.kind === 'weapon' && x.subtype === 'staff').length,
    tool: rh.filter((x) => x.kind === 'tool').length,
  };
  const lh = rarity.filter((x) => x.slot === 'left_hand');
  const leftHand = {
    total: lh.length,
    shield: lh.filter((x) => x.kind === 'shield').length,
    artifact: lh.filter((x) => x.kind === 'artifact').length,
    amulets: lh.filter((x) => x.kind === 'artifact' && x.stats.armor).length,
  };
  const rg = rarity.filter((x) => x.slot === 'ring');
  const ring = {
    total: rg.length,
    armorZero: rg.filter((x) => !x.stats.armor).length,
  };

  const setItems = rarity.filter((x) => x.set && x.set_bonus);
  const setIds = new Set(setItems.map((x) => x.set));
  const bonusKeys = new Set();
  for (const x of setItems) for (const k of Object.keys(x.set_bonus)) bonusKeys.add(+k);
  const sets = { count: setIds.size, itemCount: setItems.length, bonusKeys: [...bonusKeys].sort((a, b) => a - b) };

  let skillCount = 0, base6 = 0, staffAffix = 0, noAffix = 0;
  let fcCount = 0, fcEpic = 0, fcLegend = 0;
  const skillMap = {};
  const spellIds = new Set();
  const amountByTier = {};
  for (const x of rarity) {
    if (x.affixes.length === 0) noAffix++;
    for (const a of x.affixes) {
      if (a.type === 'skill') {
        skillCount++;
        skillMap[a.skill] = (skillMap[a.skill] || 0) + 1;
        if (BASE_SKILLS.indexOf(a.skill) !== -1) base6++;
        if (a.skill === 'staff') staffAffix++;
        const d = (amountByTier[x.rarity] = amountByTier[x.rarity] || { min: Infinity, max: -Infinity });
        if (a.amount < d.min) d.min = a.amount;
        if (a.amount > d.max) d.max = a.amount;
      } else if (a.type === 'free_cast') {
        fcCount++;
        if (x.rarity === 'epic') fcEpic++;
        if (x.rarity === 'legendary') fcLegend++;
        spellIds.add(a.spell);
      }
    }
  }
  const affixes = {
    skillCount,
    skillDistinct: Object.keys(skillMap).length,
    count1: Object.keys(skillMap).filter((k) => skillMap[k] === 1),
    noAffix, base6, staffAffix,
    freeCast: { count: fcCount, epic: fcEpic, legendary: fcLegend },
    spells: [...spellIds],
    amountByTier,
  };

  let iconsCount = 0;
  let iconsAllExist = true;
  for (const x of rarity) {
    if (x.icon === 'assets/sprites/items/' + x.id + '.svg') iconsCount++;
    if (!fs.existsSync(path.join(ROOT, x.icon))) iconsAllExist = false;
  }

  const craftDir = path.join(ROOT, 'assets', 'craft');
  const crafts = fs.readdirSync(craftDir).filter((f) => NUM6.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(craftDir, f), 'utf8')));
  const rarityNum = new Set(rarity.map((x) => x.num));
  const byItem = {};
  let rarityEquip = 0;
  const types = {};
  for (const c of crafts) {
    const res = c.результат && c.результат.предмет;
    const m = res && res.match(/^assets\/items\/(\d{6})\.json$/);
    if (!m || !rarityNum.has(+m[1])) continue;
    rarityEquip++;
    byItem[m[1]] = (byItem[m[1]] || 0) + 1;
    types[c.тип] = (types[c.тип] || 0) + 1;
  }
  const hist = {};
  for (const k in byItem) hist[byItem[k]] = (hist[byItem[k]] || 0) + 1;
  const craft = { count: crafts.length, rarityCovered: Object.keys(byItem).length, hist, rarityEquip, types };

  const skillNames = fs.readdirSync(path.join(ROOT, 'assets', 'skills'))
    .filter((f) => NUM6.test(f))
    .map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'skills', f), 'utf8')).id)
    .sort();
  const skills = { count: skillNames.length, names: skillNames };

  const specSrc = fs.readFileSync(path.join(ROOT, 'spec', 'items.md'), 'utf8');
  const lines = specSrc.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  const specMeta = {
    lines: lines.length,
    h2: (specSrc.match(/^## /gm) || []).length,
    h3: (specSrc.match(/^### /gm) || []).length,
    bytes: Buffer.byteLength(specSrc, 'utf8'),
    trailingNL: specSrc.endsWith('\n'),
  };

  return {
    items: {
      count: all.length,
      nums: all.map((x) => x.num).sort((a, b) => a - b),
      hasSchema: fs.existsSync(path.join(itemsDir, 'schema.json')),
      kinds, weaponSub,
      rarity: { count: rarity.length, byTier, items: rarity },
      vectors,
      all,
      legacy: legacyInfo,
      rightHand, leftHand, ring,
      sets, affixes,
      icons: { count: iconsCount, allExist: iconsAllExist },
    },
    craft,
    skills,
    loot: require(path.join(ROOT, 'src', 'loot-equip-data.js')),
    specMeta,
  };
}

module.exports = {
  norm,
  constRegex,
  extractConsts,
  extractCanonNeedles,
  canonSection2,
  extractBlock,
  specH2,
  specBulletInH2,
  loadCatalog,
};

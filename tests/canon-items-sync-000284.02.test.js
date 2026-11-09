// Задача 000284.02 (canon sync-check как regression-тест: канон
// memory/000230.16-spec-equipment-doc.md vs spec/items.md + диск;
// tests-only + скрипты; контракт —
// memory/000284.02-canon-items-sync-test.md).
//
// ТЗ (tasks/pending/000284.02.md): канон items-оборудования дрейфовал
// 4 раза (000277, 000235.11, .12, 000284) и ловился только ретро-анализом;
// одноразовые /tmp-скрипты не закоммичены. Зафиксировать sync:
//   T1.  иглы канона §4.2 ⊆ norm'd spec/items.md (все, уникальны);
//   T2.  множество констант wording-теста == множество канон-игол
//        (обе стороны; единый фикс-regex видит W7B1/W7B2 — K5);
//   T3.  C1-блок канона ≡ буллет EQUIP_POOLS spec (norm'd);
//   T4.  D-блок канона ≡ H2 «Наборы и аффиксы» (norm'd);
//   T5.  E-блок канона ≡ H2 «Каталог новых предметов экипировки» (norm'd);
//   T6.  items-каталог: c1+c2+c3+c4+c11 (диск == канон §2);
//   T7.  sets + affixes: c5+c10 (диск == канон §2);
//   T8.  craft + иконки: c6+c7 (диск == канон §2);
//   T9.  EQUIP_POOLS + RARITY: c8+c12 (диск == канон §2);
//   T10. spec/items.md мета: c9 (R5/H2/H3/bytes == канон §2).
//
// САМОАДАПТИВНЫЙ ПРИНЦИП: тест ЧИТАЕТ числа из канона §2 regex'ами-
// анкерами (таблица c1–c12 в memory-контракте) и сравнивает с диском.
// Никакого хардкода чисел: правка цифры в каноне/спеке красит тест, а
// ре-синхрон канона (контракт 000284.01 §3 — в том же коммите, что и
// правка spec/items.md) возвращает тест в зелёный БЕЗ правки теста.
//
// Источники (read-only, в момент прогона; ноль diff):
//   memory/000230.16-spec-equipment-doc.md — канон-предмет (§2, §3.5
//       C1/D/E, §4.2); единственный memory-файл среди тестов сьюта;
//   spec/items.md — цель (norm'd);
//   tests/spec-000230.16-wording.test.js — константы-иглы (regex по
//       тексту, НЕ require; файл не модифицируется);
//   assets/items (511 JSON + schema.json), assets/craft (343 JSON +
//       schema.json), assets/skills (44 нумерованных; ре-пин 000324: +6 школ;
//       ре-пин 000337: +1 «staff»),
//       assets/sprites/items (existsSync по it.icon каждого
//       rarity-предмета) — диск;
//   src/loot-equip-data.js — require (UMD node-ветка, чистая): RARITY /
//       EQUIP_POOLS.
//
// Core: tests/scripts/canon-items-sync-core.js (CJS, 'use strict',
// чистые функции, без side effects) — создаётся на GREEN-стадии по
// memory-контракту §1. RED-состояние этого файла: core отсутствует,
// каждый тест падает на guard с сообщением об отсутствии core
// (осмысленная краснота, не syntax/env).
//
// CLI: tests/scripts/check-canons.js / check-needles.js (GREEN-стадия) —
// быстрая диагностика rebase-станции ДО полного прогона (exit 0/1).
//
// Красный протокол K1–K5 (локальная правка цифры/иглы в рабочей копии →
// red → реверт, git status --porcelain пуст): memory-контракт §2.
//
// SPEC-453-GONE (spec-split.test.js): этот файл сканируется сьютом
// (плоский readdirSync tests/ + src/); в нём нет старой линейной
// цитаты (needle скана собирается из частей); заголовки «SPEC 000284.02»
// безопасны. tests/scripts/ (подкаталог) скан не видит — но тест на
// это не полагается.

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SPEC = fs.readFileSync(path.join(ROOT, 'spec', 'items.md'), 'utf8');
const CANON = fs.readFileSync(path.join(ROOT, 'memory', '000230.16-spec-equipment-doc.md'), 'utf8');
const WORDING = fs.readFileSync(path.join(ROOT, 'tests', 'spec-000230.16-wording.test.js'), 'utf8');

let core = null;
try { core = require('./scripts/canon-items-sync-core.js'); } catch (e) { core = null; }
const NO_CORE = 'core tests/scripts/canon-items-sync-core.js не существует — создать по memory-контракту 000284.02 (эта стадия: RED)';
function guard() { assert.ok(core, NO_CORE); }

const D = (s) => parseInt(s, 10);
const F = (s) => parseFloat(s);

let CAT = null;
function cat() {
  guard();
  if (CAT === null) CAT = core.loadCatalog(ROOT);
  return CAT;
}
let SEC2 = null;
function sec2() {
  guard();
  if (SEC2 === null) SEC2 = core.canonSection2(CANON);
  return SEC2;
}
function anchor(re, label) {
  const m = sec2().match(re);
  assert.ok(m, label + ': якорь не найден — формат канона §2 изменился, ре-пинь якорь в том же коммите (контракт 000284.02)');
  return m;
}

test('T1: §4.2-иглы канона ⊆ norm\'d spec/items.md (все, уникальны)', () => {
  guard();
  const needles = core.extractCanonNeedles(CANON);
  assert.equal(needles.length, new Set(needles).size, 'иглы §4.2 должны быть уникальны: ' + JSON.stringify(needles));
  const ns = core.norm(SPEC);
  const missing = needles.filter((n) => !ns.includes(core.norm(n)));
  assert.deepEqual(missing, [], 'иглы канона §4.2, отсутствующие в spec/items.md: ' + JSON.stringify(missing.map((s) => s.slice(0, 60))));
});

test('T2: константы wording-теста == канон-иглы §4.2 (множества, обе стороны)', () => {
  guard();
  const consts = core.extractConsts(WORDING);
  const needles = core.extractCanonNeedles(CANON);
  const constVals = new Set(consts.map((c) => core.norm(c.value)));
  const needleVals = new Set(needles.map((n) => core.norm(n)));
  const extraConsts = [...constVals].filter((v) => !needleVals.has(v));
  const extraNeedles = [...needleVals].filter((v) => !constVals.has(v));
  assert.deepEqual(extraConsts, [], 'константы wording-теста без иглы в каноне §4.2 (constRegex потерял/добавил): ' + JSON.stringify(extraConsts.map((s) => s.slice(0, 60))));
  assert.deepEqual(extraNeedles, [], 'иглы канона §4.2 без константы в wording-тесте: ' + JSON.stringify(extraNeedles.map((s) => s.slice(0, 60))));
});

test('T3: C1-блок канона ≡ буллет EQUIP_POOLS spec (norm\'d)', () => {
  guard();
  const c1c = core.extractBlock(CANON, 'C1');
  const c1s = core.specBulletInH2(SPEC, 'Редкость и дроп экипировки', 'EQUIP_POOLS', 'НИКОГДА не в пулах.');
  assert.equal(c1c, c1s, 'C1-блок канона ≠ буллет EQUIP_POOLS spec/items.md — ре-синхронизировать канон в том же коммите');
});

test('T4: D-блок канона ≡ H2 «Наборы и аффиксы» (norm\'d)', () => {
  guard();
  const dC = core.extractBlock(CANON, 'D');
  const dS = core.specH2(SPEC, 'Наборы и аффиксы');
  assert.equal(dC, dS, 'D-блок канона ≠ H2 «Наборы и аффиксы» spec/items.md — ре-синхронизировать канон в том же коммите');
});

test('T5: E-блок канона ≡ H2 «Каталог новых предметов экипировки» (norm\'d)', () => {
  guard();
  const eC = core.extractBlock(CANON, 'E');
  const eS = core.specH2(SPEC, 'Каталог новых предметов экипировки');
  assert.equal(eC, eS, 'E-блок канона ≠ H2 «Каталог новых предметов экипировки» spec/items.md — ре-синхронизировать канон в том же коммите');
});

test('T6: items-каталог: c1+c2+c3+c4+c11 (диск == канон §2)', () => {
  guard();
  const it = cat().items;

  let m = anchor(/Каталог assets\/items — (\d+) файлов \(000001–000(\d+);/, 'c1');
  const N = D(m[1]);
  assert.equal(N, it.count, 'c1: канон «' + N + ' файлов» != диск count=' + it.count);
  assert.equal(D(m[2]), it.count, 'c1: канон max num != диск count');
  assert.equal(it.nums.length, N, 'c1: nums.length != N');
  assert.ok(it.nums.every((n, i) => n === i + 1), 'c1: nums != {1..N} без дыр');
  assert.ok(it.hasSchema, 'c1: assets/items/schema.json отсутствует');

  m = anchor(/weapon (\d+) \(sword (\d+)\/bow (\d+)\/heavy (\d+)\/staff (\d+)\), armor (\d+), tool (\d+), shield (\d+), artifact (\d+), ring (\d+), potion (\d+), food (\d+), skill_book (\d+), reagent (\d+), spell_scroll (\d+), resurrection_scroll (\d+), craft_scroll (\d+)\./, 'c2');
  const K = it.kinds, W = it.weaponSub;
  assert.equal(D(m[1]), K.weapon, 'c2: weapon canon=' + m[1] + ' disk=' + K.weapon);
  assert.ok(D(m[2]) === W.sword && D(m[3]) === W.bow && D(m[4]) === W.heavy && D(m[5]) === W.staff, 'c2: weaponSub disk=' + JSON.stringify(W));
  const kindsMap = { armor: 6, tool: 7, shield: 8, artifact: 9, ring: 10, potion: 11, food: 12, skill_book: 13, reagent: 14, spell_scroll: 15, resurrection_scroll: 16, craft_scroll: 17 };
  for (const [k, gi] of Object.entries(kindsMap)) assert.equal(D(m[gi]), K[k], 'c2: kind ' + k + ' canon=' + m[gi] + ' disk=' + K[k]);

  m = anchor(/(\d+) предметов с rarity/, 'c3a');
  const rarN = D(m[1]);
  assert.equal(rarN, it.rarity.count, 'c3a: канон ' + rarN + ' != диск rarity.count=' + it.rarity.count);
  m = anchor(/common (\d+) \/ rare (\d+) \/ epic (\d+) \/ legendary (\d+) \/ impossible (\d+);/, 'c3b');
  const T = it.rarity.byTier;
  assert.ok(D(m[1]) === T.common && D(m[2]) === T.rare && D(m[3]) === T.epic && D(m[4]) === T.legendary && D(m[5]) === T.impossible, 'c3b: byTier disk=' + JSON.stringify(T));
  assert.equal(D(m[1]) + D(m[2]) + D(m[3]) + D(m[4]) + D(m[5]), rarN, 'c3b: сумма тиров != c3a');

  // Ре-пин 000321.02: после волны брони (50 предметов
  // 000564–000613) ВСЕ 8 броневых слотов имеют СВОИ векторы
  // редкости — прежний def-вектор 10/7/5/2/1 остаётся только у
  // left_hand/ring. Игла — по фактической строке канона §2.
  m = anchor(/после 000321\.02 \(50 брони, 8 слотов\) факт каталога: head (\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+) \((\d+)\), ears (\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+) \((\d+)\), neck (\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+) \((\d+)\), torso (\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+) \((\d+)\), forearms (\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+) \((\d+)\), palms (\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+) \((\d+)\), legs (\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+) \((\d+)\), feet (\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+) \((\d+)\); left_hand\/ring — (\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)\./, 'c4');
  const V = it.vectors;
  const eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  {
    const SLOTS4 = ['head', 'ears', 'neck', 'torso', 'forearms', 'palms', 'legs', 'feet'];
    let gi = 1;
    for (const slot of SLOTS4) {
      const v = [D(m[gi]), D(m[gi + 1]), D(m[gi + 2]), D(m[gi + 3]), D(m[gi + 4])];
      assert.ok(eq(V[slot], v) && D(m[gi + 5]) === V[slot].reduce((a, b) => a + b, 0),
        'c4: ' + slot + ' disk=' + JSON.stringify(V[slot]));
      gi += 6;
    }
    const def = [D(m[gi]), D(m[gi + 1]), D(m[gi + 2]), D(m[gi + 3]), D(m[gi + 4])];
    assert.ok(eq(V.left_hand, def) && eq(V.ring, def),
      'c4: left_hand/ring disk=' + JSON.stringify(V.left_hand) + '/' + JSON.stringify(V.ring));
  }
  // Ре-пин 000321.01: right_hand больше НЕ def-вектор — 50 оружия
  // 000514–000563 прилипли к слоту; отдельная игла суммы волн.
  m = anchor(/right_hand — (\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+) \(волна 000230\.12 (\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+) \+ оружие 000321\.01 (\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)\)\./, 'c4rh');
  {
    const rhv = [D(m[1]), D(m[2]), D(m[3]), D(m[4]), D(m[5])];
    const wave = [D(m[6]), D(m[7]), D(m[8]), D(m[9]), D(m[10])];
    const wpn = [D(m[11]), D(m[12]), D(m[13]), D(m[14]), D(m[15])];
    assert.ok(eq(V.right_hand, rhv), 'c4rh: right_hand disk=' + JSON.stringify(V.right_hand));
    assert.ok(rhv.every((x, i) => x === wave[i] + wpn[i]), 'c4rh: волна+оружие != вектор right_hand');
  }

  m = anchor(/свитки 000235: ([\d,– ]+?); чертежи (\d+)–(\d+)\):/, 'c11-holes');
  const holeRanges = m[1].split(', ').map((s) => s.split('–').map(D));
  assert.equal(holeRanges.length, 4, 'c11: канон объявляет 4 дыры свитков, разпарсено ' + holeRanges.length + ' ' + JSON.stringify(holeRanges));
  const kindByNum = {};
  for (const x of it.all) kindByNum[x.num] = x.kind;
  for (const [s, e] of holeRanges) for (let n = s; n <= e; n++) assert.equal(kindByNum[n], 'spell_scroll', 'c11: дыра ' + n + ' kind=' + kindByNum[n] + ' (ожид. spell_scroll)');
  const bs = D(m[2]), be = D(m[3]);
  for (let n = bs; n <= be; n++) assert.equal(kindByNum[n], 'craft_scroll', 'c11: чертёж ' + n + ' kind=' + kindByNum[n] + ' (ожид. craft_scroll)');

  // Ре-пин 000321.02: у каждого слота теперь НОЛЬ ИЛИ БОЛЕЕ
  // дополнительных диапазонов «(+N, +a–b)» (броня 000321.02
  // дописала 8 слотам) — парсер обобщён.
  m = anchor(/: head (\d+)–(\d+)(?: \(([^)]*)\))?, ears (\d+)–(\d+)(?: \(([^)]*)\))?, neck (\d+)–(\d+)(?: \(([^)]*)\))?, torso (\d+)–(\d+)(?: \(([^)]*)\))?, forearms (\d+)–(\d+)(?: \(([^)]*)\))?, palms (\d+)–(\d+)(?: \(([^)]*)\))?, right_hand (\d+)–(\d+)(?: \(([^)]*)\))?, left_hand (\d+)–(\d+)(?: \(([^)]*)\))?, ring (\d+)–(\d+)(?: \(([^)]*)\))?, legs (\d+)–(\d+)(?: \(([^)]*)\))?, feet (\d+)–(\d+)(?: \(([^)]*)\))?\./, 'c11-slots');
  const parseEx = (g) => {
    const out = [];
    if (!g) return out;
    for (const mm of g.matchAll(/\+(\d+)(?:–(\d+))?/g)) {
      const a = D(mm[1]);
      const b = mm[2] === undefined ? a : D(mm[2]);
      for (let n = a; n <= b; n++) out.push(n);
    }
    return out;
  };
  const slotRanges = {};
  {
    const SLOT_ORDER = ['head', 'ears', 'neck', 'torso', 'forearms', 'palms', 'right_hand', 'left_hand', 'ring', 'legs', 'feet'];
    let gi = 1;
    for (const slot of SLOT_ORDER) {
      slotRanges[slot] = { s: D(m[gi]), e: D(m[gi + 1]), ex: parseEx(m[gi + 2]) };
      gi += 3;
    }
  }
  const slotByNum = {}, numBySlot = {};
  for (const x of it.all) {
    if (x.num < 83) continue;
    slotByNum[x.num] = x.slot;
    (numBySlot[x.slot] = numBySlot[x.slot] || []).push(x.num);
  }
  for (const [slot, r] of Object.entries(slotRanges)) {
    const allowed = new Set([...Array(r.e - r.s + 1).keys()].map((i) => r.s + i).concat(r.ex));
    let fwd = true, rev = true;
    for (const n of allowed) if (slotByNum[n] !== undefined && slotByNum[n] !== slot) fwd = false;
    for (const n of (numBySlot[slot] || [])) if (!allowed.has(n)) rev = false;
    assert.ok(fwd, 'c11: fwd слот ' + slot + ' — файл в объявленном диапазоне (' + r.s + '–' + r.e + ') с другим slot');
    assert.ok(rev, 'c11: rev слот ' + slot + ' — предмет со slot=' + slot + ' вне объявленного диапазона nums=' + JSON.stringify(numBySlot[slot] || []));
  }

  m = anchor(/legacy 000001–000010 \((\d+) оружий \+ (\d+) брони\)/, 'c11l');
  const L = it.legacy;
  assert.ok(D(m[1]) === L.weapons && D(m[2]) === L.armors, 'c11l: legacy canon=' + m[1] + '/' + m[2] + ' disk=' + JSON.stringify(L));
  assert.ok(L.total === 10 && L.noRarity === 10 && L.noIcon === 0 && L.explicitSlot === 10, 'c11l: legacy props disk=' + JSON.stringify(L) + ' (noIcon 0 — ре-пин 000302.08: legacy-снаряжение с icon)');

  m = anchor(/right_hand (\d+) = weapon heavy (\d+) \([^)]*\) \+ weapon staff (\d+) \+ weapon sword \d+ \+ weapon bow \d+ \+ tool (\d+); left_hand (\d+) = shield (\d+) \+ artifact (\d+) \(у (\d+) из (\d+) — stats\.armor/, 'c11c');
  const RH = it.rightHand, LH = it.leftHand;
  assert.ok(D(m[1]) === RH.total && D(m[2]) === RH.heavy && D(m[3]) === RH.staff && D(m[4]) === RH.tool, 'c11c: rightHand disk=' + JSON.stringify(RH));
  assert.ok(D(m[5]) === LH.total && D(m[6]) === LH.shield && D(m[7]) === LH.artifact && D(m[8]) === LH.amulets && D(m[9]) === LH.artifact, 'c11c: leftHand disk=' + JSON.stringify(LH));

  m = anchor(/ring — stats\.armor = 0 у всех (\d+)\./, 'c11g');
  const R = it.ring;
  assert.ok(D(m[1]) === R.total && R.armorZero === R.total, 'c11g: ring disk=' + JSON.stringify(R));
});

test('T7: sets + affixes: c5+c10 (диск == канон §2)', () => {
  guard();
  const C = cat();
  const it = C.items;

  let m = anchor(/Наборы: (\d+) наборов \/ (\d+) предметов/, 'c5a');
  assert.equal(D(m[1]), it.sets.count, 'c5a: канон ' + m[1] + ' наборов != диск ' + it.sets.count);
  assert.equal(D(m[2]), it.sets.itemCount, 'c5a: канон ' + m[2] + ' предметов != диск ' + it.sets.itemCount);
  m = anchor(/Пороги по ФАКТУ — \{([^}]+)\}:/, 'c5b');
  const canonKeys = m[1].split(',').map((s) => D(s.trim())).sort((a, b) => a - b);
  assert.deepEqual(it.sets.bonusKeys, canonKeys, 'c5b: union keys(set_bonus) disk=' + JSON.stringify(it.sets.bonusKeys) + ' != канон-ФАКТ ' + JSON.stringify(canonKeys));

  m = anchor(/(\d+) skill-аффиксов на (\d+) РАЗНЫЙ навык/, 'c10a');
  assert.equal(D(m[1]), it.affixes.skillCount, 'c10a: skillCount canon=' + m[1] + ' disk=' + it.affixes.skillCount);
  assert.equal(D(m[2]), it.affixes.skillDistinct, 'c10a: skillDistinct canon=' + m[2] + ' disk=' + it.affixes.skillDistinct);
  m = anchor(/(\d+) навыков — ровно по 1 предмету \(([^)]*)\)/, 'c10b');
  assert.equal(D(m[1]), it.affixes.count1.length, 'c10b: count-1 canon=' + m[1] + ' disk=' + it.affixes.count1.length);
  const canonNames = new Set(m[2].split(',').map((s) => s.trim()));
  const diskNames = new Set(it.affixes.count1);
  assert.ok(canonNames.size === diskNames.size && [...canonNames].every((n) => diskNames.has(n)), 'c10b: имена canon=' + JSON.stringify([...canonNames]) + ' disk=' + JSON.stringify([...diskNames]));
  assert.equal(it.affixes.noAffix, 0, 'c10: предметы без аффиксов: ' + it.affixes.noAffix);
  assert.equal(it.affixes.base6, 0, 'c10: base6 skill-аффиксов != 0: ' + it.affixes.base6);
  assert.equal(it.affixes.staffAffix, 0, 'c10: staff skill-аффиксов != 0: ' + it.affixes.staffAffix);
  m = anchor(/free_cast: (\d+) предметов = (\d+) epic \+ (\d+) legendary/, 'c10c');
  const FC = it.affixes.freeCast;
  assert.ok(D(m[1]) === FC.count && D(m[2]) === FC.epic && D(m[3]) === FC.legendary, 'c10c: freeCast disk=' + JSON.stringify(FC));
  m = anchor(/(\d+) разных спеллов\./, 'c10d');
  assert.equal(D(m[1]), it.affixes.spells.length, 'c10d: spells canon=' + m[1] + ' disk=' + it.affixes.spells.length);
  // ре-пин 000337: D-02 «навыка staff в каталоге нет» ОТМЕНЁН решением
  // дизайнера (000044 «Владение посохом») — якорь и ассерт инвертированы
  // ЧЕСТНО: навык теперь обязан быть в каталоге (усиление, не ослабление).
  m = anchor(/assets\/skills (\d+) — .staff. есть/, 'c10e');
  assert.equal(D(m[1]), C.skills.count, 'c10e: skills canon=' + m[1] + ' disk=' + C.skills.count);
  assert.ok(C.skills.names.indexOf('staff') !== -1, 'c10e: в каталоге skills нет «staff»');
  m = anchor(/common ([\d.]+)–([\d.]+), rare ([\d.]+)–([\d.]+), epic ([\d.]+)–([\d.]+), legendary ([\d.]+)–([\d.]+), impossible ([\d.]+)–([\d.]+)/, 'c10f');
  const A = it.affixes.amountByTier;
  ['common', 'rare', 'epic', 'legendary', 'impossible'].forEach((t, i) => {
    const cmin = F(m[2 * i + 1]), cmax = F(m[2 * i + 2]);
    const d = A[t];
    assert.ok(d.min >= cmin - 1e-9 && d.max <= cmax + 1e-9, 'c10f: ' + t + ' disk=[' + d.min + ',' + d.max + '] не в канон-диапазоне [' + cmin + ',' + cmax + ']');
  });
});

test('T8: craft + иконки: c6+c7 (диск == канон §2)', () => {
  guard();
  const C = cat();

  let m = anchor(/Крафт \(ФАКТ каталога assets\/craft, (\d+) рецепта/, 'c6a');
  assert.equal(D(m[1]), C.craft.count, 'c6a: канон ' + m[1] + ' рецептов != диск ' + C.craft.count);
  m = anchor(/у ВСЕХ (\d+) предметов — минимум 1 рецепт \((\d+) — 1, (\d+) — 2/, 'c6b');
  assert.equal(D(m[1]), C.craft.rarityCovered, 'c6b: покрытие canon=' + m[1] + ' disk=' + C.craft.rarityCovered);
  assert.equal(D(m[2]), C.craft.hist[1], 'c6b: hist[1] canon=' + m[2] + ' disk=' + C.craft.hist[1]);
  assert.equal(D(m[3]), C.craft.hist[2], 'c6b: hist[2] canon=' + m[3] + ' disk=' + C.craft.hist[2]);
  assert.ok(C.craft.hist[3] === undefined && C.craft.hist[4] === undefined, 'c6b: гистограмма шире канона: ' + JSON.stringify(C.craft.hist));
  m = anchor(/(\d+) рецептов производят экипировку с rarity/, 'c6c');
  assert.equal(D(m[1]), C.craft.rarityEquip, 'c6c: canon=' + m[1] + ' disk=' + C.craft.rarityEquip);
  m = anchor(/Виды \(экипировка\): зачарование (\d+), столярное_дело (\d+), кузнечное_дело (\d+), резьба_по_камню (\d+), алхимия (\d+) \(рунопись/, 'c6d');
  const TY = C.craft.types;
  assert.ok(D(m[1]) === TY['зачарование'] && D(m[2]) === TY['столярное_дело'] && D(m[3]) === TY['кузнечное_дело'] && D(m[4]) === TY['резьба_по_камню'] && D(m[5]) === TY['алхимия'], 'c6d: types disk=' + JSON.stringify(TY));
  m = anchor(/Иконки — у всех (\d+):/, 'c7');
  assert.equal(D(m[1]), C.items.icons.count, 'c7: иконки canon=' + m[1] + ' disk=' + C.items.icons.count);
  assert.ok(C.items.icons.allExist, 'c7: иконки rarity-предметов отсутствуют на диске');
});

test('T9: EQUIP_POOLS + RARITY: c8+c12 (диск == канон §2)', () => {
  guard();
  const C = cat();

  let m = anchor(/EQUIP_POOLS — ФИНАЛЬНЫЕ (\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+) = (\d+)/, 'c8');
  const P = C.loot.EQUIP_POOLS;
  const sizes = [P.common.length, P.rare.length, P.epic.length, P.legendary.length, P.impossible.length];
  assert.ok([D(m[1]), D(m[2]), D(m[3]), D(m[4]), D(m[5])].every((v, i) => v === sizes[i]), 'c8: пулы canon=' + m.slice(1, 6).join('/') + ' disk=' + sizes.join('/'));
  assert.equal(sizes.reduce((a, b) => a + b, 0), D(m[6]), 'c8: сумма пулов != канон');

  m = anchor(/RARITY 5 тиров, шансы ([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+);/, 'c12');
  const R = C.loot.RARITY;
  assert.equal(R.length, 5, 'c12: RARITY.length=' + R.length);
  assert.ok(R[0].id === 'common' && R[4].id === 'impossible', 'c12: порядок тиров: ' + JSON.stringify(R.map((r) => r.id)));
  const chances = [F(m[1]), F(m[2]), F(m[3]), F(m[4]), F(m[5])];
  assert.ok(chances.every((c, i) => R[i].chance === c), 'c12: шансы disk=' + JSON.stringify(R.map((r) => r.chance)));
  const itemById = {};
  for (const x of C.items.rarity.items) itemById[x.obj.id] = x.obj;
  let setOk = true, tierOk = true;
  for (const tier of ['common', 'rare', 'epic', 'legendary', 'impossible']) {
    const poolIds = new Set(P[tier]);
    const diskIds = new Set(Object.values(itemById).filter((o) => o.rarity === tier).map((o) => o.id));
    if (poolIds.size !== diskIds.size || [...poolIds].some((id) => !diskIds.has(id))) setOk = false;
    for (const id of P[tier]) if (itemById[id] && itemById[id].rarity !== tier) tierOk = false;
  }
  assert.ok(setOk, 'c12: setEq — пул тира != множество id rarity-предметов тира');
  assert.ok(tierOk, 'c12: tierEq — id в пуле тира A имеет rarity B');
});

test('T10: spec/items.md мета: c9 (R5/H2/H3/bytes == канон §2)', () => {
  guard();
  const S = cat().specMeta;
  const m = anchor(/Текущий spec\/items\.md: (\d+) строк.*?, (\d+) H2, (\d+) H3, (\d+) байт/, 'c9');
  assert.ok(D(m[1]) === S.lines && D(m[2]) === S.h2 && D(m[3]) === S.h3 && D(m[4]) === S.bytes, 'c9: disk=' + JSON.stringify(S) + ' canon=' + m[1] + '/' + m[2] + '/' + m[3] + '/' + m[4]);
  assert.ok(S.trailingNL === false, 'c9: spec/items.md закончился trailing-newline (R5/байты сдвинуты)');
});

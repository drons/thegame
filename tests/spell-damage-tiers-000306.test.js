// Задача 000306: урон/лечение заклинаний по степеням — значение в JSON
// каталога, без хардкод-констант по степеням в коде.
//
// Контракт: memory/000306-spell-damage-tiers.md.
//   * новое поле каталога `множитель_степени` (number > 0) — у ВСЕХ
//     заклинаний действий «урон» и «лечение» (46 файлов; позиция —
//     сразу после `степень`); множитель к базе (4 + 0.5·атрибут),
//     НЕ абсолютный урон;
//   * в цепочке «база» значения строго растут со степенью
//     (walker по ссылкам; отсутствующее поле — нарушение);
//   * расчёт в бою (spells.js/ally-spells.js/combat.js) читает поле;
//     без поля — фолбэк 1 (бит-в-бит степень 1);
//   * числовое поведение каталога не меняется: ст.1 → 1,
//     ст.2 → 1.15, ст.3 → 1.3 (IEEE754-тождество с 1 + 0.15·(степень−1)
//     для k = 1..3 — одни и те же double → бит-в-бит goldens).
//
// Красные: R1 (поле в 46 файлах), R2 (строгой рост в цепочках),
// R4 (бой: dmg = round(база × каталожный множитель)), R6 (инъекция
// ст.2-спелла БЕЗ поля — фолбэк 1, старая формула даёт 1.15×),
// R8 (схема: свойство number, minimum > 0).
// Гарды: R3 (контрпример walker'а — чистая функция), R5 (бой:
// ст.1 < ст.2 < ст.3), R7 (каст — 0 бросков c._rng, паттерн REG-1).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createCharacter } = require('../src/player.js');
const { createCombat } = require('../src/combat.js');

function loadSpells() { return require('../src/spells.js'); }
function loadSpellsData() { return require('../src/spells-data.js'); }

const DIR = path.join(__dirname, '..', 'assets', 'spells');

// Каталог: Map<file, data> (сырой JSON, «база» — файловая ссылка).
function catalogByFile() {
  const m = new Map();
  const JR = require('../scripts/lib/json-ref.js');
  for (const f of fs.readdirSync(DIR).filter((x) => x !== 'schema.json'
    && JR.SHAPE_BASENAME_RES[JR.ASSET_NAME_SHAPES.spells].test(x))) {
    m.set(f, JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
  }
  return m;
}

function dataById(byFile, id) {
  for (const d of byFile.values()) if (d.id === id) return d;
  return null;
}

// Действия, для которых множитель степени обязателен (000306).
function isTierSpell(d) {
  return d['действие'] === 'урон' || d['действие'] === 'лечение';
}

// Walker по цепочкам «база» (чистая функция — R2/R3). byFile —
// Map<file|path, data>; ссылка «база» резолвится по пути, по имени
// файла (последний сегмент) или по id. Возврат — массив нарушений
// (пусто — ок):
//   * действие «урон»/«лечение» без числового множителя > 0;
//   * множитель НЕ строго больше множителя базового (равные/меньше).
// Битая ссылка «база» — не нарушение walker'а (целостность ссылок —
// отдельные тесты 000023/000211.04).
function chainTierViolations(byFile) {
  const byId = new Map();
  for (const d of byFile.values()) byId.set(d.id, d);
  const resolveBase = (ref) => {
    if (typeof ref !== 'string') return null;
    if (byFile.has(ref)) return byFile.get(ref);
    if (byId.has(ref)) return byId.get(ref);
    return byFile.get(ref.split('/').pop()) || null;
  };
  const out = [];
  for (const [f, d] of byFile) {
    if (!isTierSpell(d)) continue;
    const m = d['множитель_степени'];
    if (typeof m !== 'number' || !(m > 0)) {
      out.push(`${f}: множитель_степени — ${JSON.stringify(m)} `
        + '(нужно число > 0, 000306)');
      continue;
    }
    const base = resolveBase(d['база']);
    if (!base || !isTierSpell(base)) continue;
    const mb = base['множитель_степени'];
    if (typeof mb === 'number' && !(m > mb)) {
      out.push(`${f}: множитель_степени ${m} не строго больше `
        + `базового ${mb} (ст. ${d['степень']} на ст. ${base['степень']})`);
    }
  }
  return out;
}

// Фикстура: персонаж с изученными заклинаниями (зеркало
// tests/spells.test.js).
function spellHero({ spells, intelligence = 1, wisdom = 1, level = 1,
  mp = 30, secondary = {} } = {}) {
  const p = createCharacter();
  p.primary.intelligence = intelligence;
  p.primary.wisdom = wisdom;
  p.level = level;
  p.mp = mp;
  for (const [k, v] of Object.entries(secondary)) p.secondary[k] = v;
  p.spells = spells.slice();
  return p;
}

// Бой один-на-один; цель вплотную (дальность каста 4).
function soloCombat(p, mobId = 'wolf') {
  const c = createCombat({ player: p, mobs: [mobId], mobLevel: 2, seed: 5 });
  const u = c.units[0];
  u.x = c.px; u.y = c.py - 1;
  return c;
}

test('000306 R1: ВСЕ действия «урон»/«лечение» каталога (46 файлов) имеют множитель_степени — число > 0', () => {
  const byFile = catalogByFile();
  let n = 0;
  const bad = [];
  for (const [f, d] of byFile) {
    if (!isTierSpell(d)) continue;
    n += 1;
    const m = d['множитель_степени'];
    if (typeof m !== 'number' || !(m > 0)) bad.push(`${f}=${JSON.stringify(m)}`);
  }
  assert.equal(n, 46,
    `ант-и-вакуум: действий «урон»/«лечение» ровно 46 (факт: ${n})`);
  assert.equal(bad.length, 0,
    `множитель_степени (число > 0) отсутствует/некорректен: ${bad.join(', ')}`);
});

test('000306 R2: в цепочках «база» множитель_степени строго растёт со степенью (walker по ссылкам; отсутствие поля — нарушение)', () => {
  const byFile = catalogByFile();
  const violations = chainTierViolations(byFile);
  assert.deepEqual(violations, [],
    'цепочки «база» нарушают строгий рост множителя степени: '
    + violations.join('; '));
});

test('000306 R3: контрпример — цепочка с РАВНЫМИ значениями ст.1/ст.2 и спелл без поля дают нарушения walker (чистая функция; гард)', () => {
  // (а) Равные значения у ст.1 и ст.2 — нарушение ровно по улучшению.
  const equal = new Map([
    ['assets/spells/tier_a.json',
      { id: 'a', действие: 'урон', степень: 1, база: null,
        множитель_степени: 1.15 }],
    ['assets/spells/tier_b.json',
      { id: 'b', действие: 'урон', степень: 2,
        база: 'assets/spells/tier_a.json', множитель_степени: 1.15 }],
  ]);
  const vEq = chainTierViolations(equal);
  assert.equal(vEq.length, 1, `ожидалось 1 нарушение, факт: ${JSON.stringify(vEq)}`);
  assert.ok(vEq[0].includes('tier_b.json'),
    'нарушение — на улучшении (ст.2), факт: ' + vEq[0]);
  // (б) Отсутствующее поле — нарушение.
  const missing = new Map([
    ['assets/spells/tier_a.json',
      { id: 'a', действие: 'лечение', степень: 1, база: null }],
  ]);
  const vMiss = chainTierViolations(missing);
  assert.ok(vMiss.some((s) => s.includes('tier_a.json')),
    'отсутствие поля — нарушение: ' + JSON.stringify(vMiss));
  // (в) Строгий рост 1 → 1.15 — без нарушений.
  const ok = new Map([
    ['assets/spells/tier_a.json',
      { id: 'a', действие: 'урон', степень: 1, база: null,
        множитель_степени: 1 }],
    ['assets/spells/tier_b.json',
      { id: 'b', действие: 'урон', степень: 2,
        база: 'assets/spells/tier_a.json', множитель_степени: 1.15 }],
  ]);
  assert.deepEqual(chainTierViolations(ok), [],
    'строгой рост 1 → 1.15 не обязан давать нарушений');
});

test('000306 R4: бой — цепочка fireball: dmg ст.1/2/3 = round((4 + 0.5·Инт) × множитель_степени), множители ЧИТАЮТСЯ из каталога (typeof number)', () => {
  const { castSpell } = loadSpells();
  const byFile = catalogByFile();
  const mult = (id) => {
    const d = dataById(byFile, id);
    assert.ok(d, `каталог: id "${id}" не найден`);
    const m = d['множитель_степени'];
    assert.equal(typeof m, 'number',
      `${id}: множитель_степени в каталоге — число (000306), факт: `
      + JSON.stringify(m));
    return m;
  };
  const v1 = mult('fireball');
  const v2 = mult('flame_burst');
  const v3 = mult('inferno');
  const base = 4 + 0.5 * 10; // Инт 10, без школьного бонуса/бафов
  // Высшая степень гейта: герой знает цепочку целиком до кастуемой
  // степени (паттерн tests/spells.test.js «степень масштабирует формулу»).
  const c1 = soloCombat(
    spellHero({ spells: ['fireball'], intelligence: 10, mp: 30 }), 'wolf');
  const r1 = castSpell(c1, 'fireball', c1.units[0].id);
  assert.equal(r1.ok, true, r1.reason);
  assert.equal(r1.dmg, Math.round(base * v1),
    `ст.1: dmg = round(база × ${v1}) (факт: ${r1.dmg})`);
  const c2 = soloCombat(
    spellHero({ spells: ['fireball', 'flame_burst'], intelligence: 10, mp: 40 }),
    'wolf');
  const r2 = castSpell(c2, 'flame_burst', c2.units[0].id);
  assert.equal(r2.ok, true, r2.reason);
  assert.equal(r2.dmg, Math.round(base * v2),
    `ст.2: dmg = round(база × ${v2}) (факт: ${r2.dmg})`);
  const c3 = soloCombat(
    spellHero({ spells: ['fireball', 'flame_burst', 'inferno'],
      intelligence: 10, mp: 50 }), 'wolf');
  const r3 = castSpell(c3, 'inferno', c3.units[0].id);
  assert.equal(r3.ok, true, r3.reason);
  assert.equal(r3.dmg, Math.round(base * v3),
    `ст.3: dmg = round(база × ${v3}) (факт: ${r3.dmg})`);
});

test('000306 R5: бой — при одинаковом герое dmg(ст.1) < dmg(ст.2) < dmg(ст.3) (три изолированных soloCombat; гард)', () => {
  const { castSpell } = loadSpells();
  // «Одинаковый герой» — одинаковые статы; книга — цепочка целиком
  // до кастуемой степени (гейт «высшая степень»: знай всю цепочку —
  // кастуется только высшая).
  const a = soloCombat(
    spellHero({ spells: ['fireball'], intelligence: 10, mp: 30 }), 'wolf');
  const r1 = castSpell(a, 'fireball', a.units[0].id);
  assert.equal(r1.ok, true, r1.reason);
  const c2 = soloCombat(
    spellHero({ spells: ['fireball', 'flame_burst'], intelligence: 10, mp: 40 }),
    'wolf');
  const r2 = castSpell(c2, 'flame_burst', c2.units[0].id);
  assert.equal(r2.ok, true, r2.reason);
  const c3 = soloCombat(
    spellHero({ spells: ['fireball', 'flame_burst', 'inferno'],
      intelligence: 10, mp: 50 }), 'wolf');
  const r3 = castSpell(c3, 'inferno', c3.units[0].id);
  assert.equal(r3.ok, true, r3.reason);
  assert.ok(r1.dmg < r2.dmg,
    `ст.1 < ст.2 (факт: ${r1.dmg} / ${r2.dmg})`);
  assert.ok(r2.dmg < r3.dmg,
    `ст.2 < ст.3 (факт: ${r2.dmg} / ${r3.dmg})`);
});

test('000306 R6: инъекция ст.2-спелла БЕЗ поля в зеркало (паттерн fireball_alt) — dmg = round((4 + 0.5·Инт) × 1): фолбэк множителя 1 (старая формула даёт 1.15×)', () => {
  const dataMod = loadSpellsData();
  // Синтетическое совершенствование fireball БЕЗ «множитель_степени».
  const extra = {
    id: 'fireball_alt', название: 'Искра шара', школа: 'огонь',
    база: 'fireball', степень: 2, атрибут: 'intelligence',
    уровень: 2, мани: 6, действие: 'урон',
    здания: [18], описание: 'тестовый вариант (000306 R6)',
  };
  try {
    dataMod.SPELLS.push(extra);
    dataMod.SPELLS_BY_ID[extra.id] = extra;
    // Цепочки предвычислены при загрузке — пере-require spells.js
    // (spells-data тот же модуль, уже мутирован; паттерн fireball_alt).
    delete require.cache[require.resolve('../src/spells.js')];
    const Sp = require('../src/spells.js');
    const p = spellHero({ spells: ['fireball_alt'], intelligence: 10, mp: 40 });
    const c = soloCombat(p, 'wolf');
    const r = Sp.castSpell(c, 'fireball_alt', c.units[0].id);
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.dmg, Math.round((4 + 0.5 * 10) * 1),
      'без поля — множитель 1 (бит-в-бит степень 1); факт: ' + r.dmg);
  } finally {
    // Зеркало — как до инъекции (deepEqual-тест каталога цел).
    const i = dataMod.SPELLS.lastIndexOf(extra);
    if (i >= 0) dataMod.SPELLS.splice(i, 1);
    delete dataMod.SPELLS_BY_ID[extra.id];
    delete require.cache[require.resolve('../src/spells.js')];
    loadSpells();
  }
});

test('000306 R7: каст урон-заклинания — 0 бросков c._rng (гард, паттерн REG-1)', () => {
  const { castSpell } = loadSpells();
  const p = spellHero({ spells: ['fireball'], intelligence: 10, mp: 30 });
  const c = soloCombat(p, 'wolf');
  const w = c.units[0];
  // Волк НЕ умирает от каста: победа/лут — легальные броски c._rng
  // (checkVictory), не связанные с расчётом урона (паттерн
  // w.maxHP = 100 из 000193-тестов).
  w.maxHP = 100; w.hp = 100;
  let calls = 0;
  c._rng = () => { calls += 1; return 0.99; };
  const r = castSpell(c, 'fireball', c.units[0].id);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.killed, false, 'фикстура: волк жив после каста');
  assert.equal(calls, 0,
    'расчёт урона детерминирован — c._rng не затрагивается (факт: '
    + calls + ' вызовов)');
});

test('000306 R8: schema.json — свойство множитель_степени: type number, minimum > 0', () => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(DIR, 'schema.json'), 'utf8'));
  const prop = schema.properties['множитель_степени'];
  assert.ok(prop,
    'schema.json properties: «множитель_степени» отсутствует (000306)');
  assert.equal(prop.type, 'number',
    `тип свойства — number (факт: ${JSON.stringify(prop.type)})`);
  assert.equal(typeof prop.minimum, 'number',
    'у свойства есть minimum (число)');
  assert.ok(prop.minimum > 0,
    `minimum > 0 (факт: ${prop.minimum})`);
});
